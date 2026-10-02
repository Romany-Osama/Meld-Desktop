//! Bounds for data sent over IPC and for continuation loops (S5-008, D-044).
use std::collections::HashSet;
use std::future::Future;
use std::hash::Hash;

/// Most continuation pages one sync or "fetch all" walk may request.
pub const MAX_CONTINUATION_PAGES: usize = 500;
/// Most items one walk may collect. A YouTube Music page holds 25–100 items, so the page cap
/// is reached first for normal libraries; this protects against pages that repeat items.
pub const MAX_COLLECTED_ITEMS: usize = 50_000;
/// Largest `limit` a list command accepts from the UI.
pub const MAX_LIST_LIMIT: i64 = 500;
/// Largest Spotify `offset` the UI may ask for.
pub const MAX_SPOTIFY_OFFSET: i64 = 100_000;

#[derive(Clone, Copy, Debug)]
pub struct PageBudget {
    pub max_pages: usize,
    pub max_items: usize,
}

impl Default for PageBudget {
    fn default() -> Self {
        Self {
            max_pages: MAX_CONTINUATION_PAGES,
            max_items: MAX_COLLECTED_ITEMS,
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct Collected<T> {
    pub items: Vec<T>,
    /// Pages requested after the first one.
    pub continuations: usize,
    /// True when a cap stopped the walk while more pages were offered.
    pub truncated: bool,
}

/// Walks InnerTube-style continuations: de-duplicates items by `key`, stops on a repeated
/// token, and stops at the page and item caps of `budget`.
pub async fn collect_continuations<T, K, Fut>(
    first: (Vec<T>, Option<String>),
    key: impl Fn(&T) -> K,
    mut fetch: impl FnMut(String) -> Fut,
    budget: PageBudget,
    label: &str,
) -> Result<Collected<T>, String>
where
    K: Eq + Hash,
    Fut: Future<Output = Result<(Vec<T>, Option<String>), String>>,
{
    let mut items = Vec::new();
    let mut seen_items = HashSet::new();
    let mut seen_tokens = HashSet::new();
    let mut continuations = 0;
    let mut truncated = false;
    let (mut page, mut continuation) = first;
    loop {
        for item in page {
            if items.len() >= budget.max_items {
                truncated = true;
                break;
            }
            if seen_items.insert(key(&item)) {
                items.push(item);
            }
        }
        let Some(token) = continuation else {
            break;
        };
        if truncated || continuations >= budget.max_pages {
            truncated = true;
            break;
        }
        if !seen_tokens.insert(token.clone()) {
            break;
        }
        continuations += 1;
        (page, continuation) = fetch(token).await?;
    }
    if truncated {
        eprintln!(
            "{label}: stopped after {continuations} continuation pages and {} items (limits {} pages, {} items)",
            items.len(),
            budget.max_pages,
            budget.max_items
        );
    }
    Ok(Collected {
        items,
        continuations,
        truncated,
    })
}

pub fn clamp_limit(limit: i64) -> i64 {
    limit.clamp(1, MAX_LIST_LIMIT)
}

pub fn clamp_spotify_offset(offset: Option<i64>) -> i64 {
    offset.unwrap_or(0).clamp(0, MAX_SPOTIFY_OFFSET)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    fn run<T>(future: impl Future<Output = T>) -> T {
        tauri::async_runtime::block_on(future)
    }

    #[test]
    fn an_endless_continuation_chain_stops_at_the_page_cap() {
        let calls = Cell::new(0);
        let result = run(collect_continuations(
            (vec![0_u32], Some("t0".to_owned())),
            |value| *value,
            |token| {
                calls.set(calls.get() + 1);
                let next = calls.get();
                assert_eq!(token, format!("t{}", next - 1));
                async move { Ok((vec![next as u32], Some(format!("t{next}")))) }
            },
            PageBudget {
                max_pages: 5,
                max_items: 1_000,
            },
            "test",
        ))
        .unwrap();
        assert_eq!(calls.get(), 5);
        assert_eq!(result.items, vec![0, 1, 2, 3, 4, 5]);
        assert!(result.truncated);
    }

    #[test]
    fn the_item_cap_stops_collection_and_fetching() {
        let calls = Cell::new(0);
        let result = run(collect_continuations(
            ((0..8).collect::<Vec<u32>>(), Some("a".to_owned())),
            |value| *value,
            |_| {
                calls.set(calls.get() + 1);
                async { Ok(((100..108).collect(), Some("b".to_owned()))) }
            },
            PageBudget {
                max_pages: 50,
                max_items: 10,
            },
            "test",
        ))
        .unwrap();
        assert_eq!(result.items.len(), 10);
        assert_eq!(calls.get(), 1);
        assert!(result.truncated);
    }

    #[test]
    fn repeated_tokens_and_duplicate_items_end_the_walk_cleanly() {
        let result = run(collect_continuations(
            (vec![1_u32, 1, 2], Some("same".to_owned())),
            |value| *value,
            |_| async { Ok((vec![2, 3], Some("same".to_owned()))) },
            PageBudget::default(),
            "test",
        ))
        .unwrap();
        assert_eq!(result.items, vec![1, 2, 3]);
        assert_eq!(result.continuations, 1);
        assert!(!result.truncated);
    }

    #[test]
    fn a_failed_page_fails_the_walk() {
        let result = run(collect_continuations(
            (vec![1_u32], Some("x".to_owned())),
            |value| *value,
            |_| async {
                Err::<(Vec<u32>, Option<String>), _>("browse request failed: offline".to_owned())
            },
            PageBudget::default(),
            "test",
        ));
        assert_eq!(result.unwrap_err(), "browse request failed: offline");
    }

    #[test]
    fn list_arguments_are_clamped() {
        assert_eq!(clamp_limit(0), 1);
        assert_eq!(clamp_limit(-5), 1);
        assert_eq!(clamp_limit(50), 50);
        assert_eq!(clamp_limit(i64::MAX), MAX_LIST_LIMIT);
        assert_eq!(clamp_spotify_offset(None), 0);
        assert_eq!(clamp_spotify_offset(Some(-1)), 0);
        assert_eq!(clamp_spotify_offset(Some(i64::MAX)), MAX_SPOTIFY_OFFSET);
    }
}

#[cfg(test)]
mod contract {
    /// Every "fetch all" walk goes through `collect_continuations` (no hand-written loops).
    #[test]
    fn library_walks_use_the_bounded_helper() {
        let source = include_str!("../lib.rs");
        assert!(
            !source.contains("seen_continuations"),
            "hand-written continuation loop in lib.rs"
        );
        for walk in [
            "fetch_all_library_playlists",
            "fetch_all_library_items",
            "fetch_all_library_songs",
            "fetch_all_playlist_songs",
        ] {
            let start = source.find(&format!("async fn {walk}(")).expect(walk);
            let body = &source[start..start + source[start..].find("\n}\n").expect(walk)];
            assert!(
                body.contains("collect_continuations("),
                "{walk} is not bounded"
            );
        }
    }
}
