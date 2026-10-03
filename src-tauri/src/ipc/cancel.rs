//! Cancellation for long commands (S5-009, D-045).
//!
//! A cancellable command takes an optional `requestId`. While it runs, its id is registered
//! here; `request_cancel(requestId)` (ipc/system.rs) wakes it, and the command's future is
//! dropped at its next await point, which aborts its in-flight HTTP request. Commands never
//! hold the database lock across an await, so dropping them cannot leave a half-written
//! transaction. A cancel that arrives before the command registers is remembered briefly, so
//! a request the UI abandoned straight away does not start at all.
use crate::{IpcError, IpcResult};
use futures_util::future::{select, Either};
use std::collections::HashMap;
use std::future::Future;
use std::pin::pin;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tokio::sync::Notify;

const EARLY_CANCEL_TTL: Duration = Duration::from_secs(60);
const MAX_ENTRIES: usize = 512;

struct Entry {
    notify: Arc<Notify>,
    /// `true` when the cancel came first and no command holds the entry yet.
    early: bool,
    created: Instant,
}

#[derive(Default)]
pub struct Registry {
    entries: Mutex<HashMap<String, Entry>>,
}

fn registry() -> &'static Registry {
    static REGISTRY: OnceLock<Registry> = OnceLock::new();
    REGISTRY.get_or_init(Registry::default)
}

impl Registry {
    fn prune(entries: &mut HashMap<String, Entry>) {
        entries.retain(|_, entry| !entry.early || entry.created.elapsed() < EARLY_CANCEL_TTL);
        while entries.len() >= MAX_ENTRIES {
            let Some(oldest) = entries
                .iter()
                .filter(|(_, entry)| entry.early)
                .min_by_key(|(_, entry)| entry.created)
                .map(|(id, _)| id.clone())
            else {
                break;
            };
            entries.remove(&oldest);
        }
    }

    /// Registers `id`; returns `None` when it was already cancelled.
    fn register(&self, id: &str) -> Option<Arc<Notify>> {
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if entries.get(id).is_some_and(|entry| entry.early) {
            entries.remove(id);
            return None;
        }
        Self::prune(&mut entries);
        let notify = Arc::new(Notify::new());
        entries.insert(
            id.to_owned(),
            Entry {
                notify: notify.clone(),
                early: false,
                created: Instant::now(),
            },
        );
        Some(notify)
    }

    fn unregister(&self, id: &str) {
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if entries.get(id).is_some_and(|entry| !entry.early) {
            entries.remove(id);
        }
    }

    /// Returns `true` when a running command was woken.
    pub fn cancel(&self, id: &str) -> bool {
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(entry) = entries.get(id) {
            entry.notify.notify_one();
            return !entry.early;
        }
        Self::prune(&mut entries);
        entries.insert(
            id.to_owned(),
            Entry {
                notify: Arc::new(Notify::new()),
                early: true,
                created: Instant::now(),
            },
        );
        false
    }

    pub async fn run<T>(
        &self,
        request_id: Option<String>,
        label: &str,
        work: impl Future<Output = IpcResult<T>>,
    ) -> IpcResult<T> {
        let Some(id) = request_id else {
            return work.await;
        };
        let Some(notify) = self.register(&id) else {
            return Err(IpcError::cancelled(format!("{label} was cancelled")));
        };
        struct Unregister<'a>(&'a Registry, &'a str);
        impl Drop for Unregister<'_> {
            fn drop(&mut self) {
                self.0.unregister(self.1);
            }
        }
        let _guard = Unregister(self, &id);
        let outcome = {
            let cancelled = pin!(notify.notified());
            match select(pin!(work), cancelled).await {
                Either::Left((result, _)) => result,
                Either::Right(_) => Err(IpcError::cancelled(format!("{label} was cancelled"))),
            }
        };
        outcome
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        self.entries.lock().unwrap().len()
    }
}

/// Runs `work` so that `request_cancel(request_id)` can stop it.
pub async fn cancellable<T>(
    request_id: Option<String>,
    label: &str,
    work: impl Future<Output = IpcResult<T>>,
) -> IpcResult<T> {
    registry().run(request_id, label, work).await
}

pub fn cancel_request(id: &str) -> bool {
    registry().cancel(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ipc::error::ErrorCode;

    fn block<T>(future: impl Future<Output = T>) -> T {
        tauri::async_runtime::block_on(future)
    }

    #[test]
    fn a_running_command_is_stopped_and_unregistered() {
        let registry = Arc::new(Registry::default());
        let worker = registry.clone();
        let handle = tauri::async_runtime::spawn(async move {
            worker
                .run(Some("r1".to_owned()), "search", async {
                    tokio::time::sleep(Duration::from_secs(30)).await;
                    Ok(1)
                })
                .await
        });
        let started = Instant::now();
        while registry.len() == 0 {
            std::thread::sleep(Duration::from_millis(5));
            assert!(started.elapsed() < Duration::from_secs(5));
        }
        assert!(registry.cancel("r1"));
        let error = block(handle).unwrap().unwrap_err();
        assert_eq!(error.code, ErrorCode::Cancelled);
        assert_eq!(error.message, "search was cancelled");
        assert!(started.elapsed() < Duration::from_secs(5));
        assert_eq!(registry.len(), 0);
    }

    #[test]
    fn a_cancel_that_arrives_first_stops_the_command_before_it_starts() {
        let registry = Registry::default();
        assert!(!registry.cancel("early"));
        let ran = std::cell::Cell::new(false);
        let result = block(
            registry.run(Some("early".to_owned()), "lyrics lookup", async {
                ran.set(true);
                Ok(())
            }),
        );
        assert_eq!(result.unwrap_err().code, ErrorCode::Cancelled);
        assert!(!ran.get());
        assert_eq!(registry.len(), 0);
    }

    #[test]
    fn finished_and_anonymous_commands_are_unaffected() {
        let registry = Registry::default();
        assert_eq!(block(registry.run(None, "x", async { Ok(7) })).unwrap(), 7);
        assert_eq!(
            block(registry.run(Some("done".to_owned()), "x", async { Ok(8) })).unwrap(),
            8
        );
        assert_eq!(registry.len(), 0);
        // Cancelling after completion only leaves a short-lived tombstone.
        assert!(!registry.cancel("done"));
        assert_eq!(registry.len(), 1);
    }

    #[test]
    fn early_cancels_are_bounded() {
        let registry = Registry::default();
        for index in 0..(MAX_ENTRIES * 2) {
            registry.cancel(&format!("id{index}"));
        }
        assert!(registry.len() <= MAX_ENTRIES);
    }
}
