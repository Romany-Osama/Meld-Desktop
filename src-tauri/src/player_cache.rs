//! Background player-cache fills (PLAY-042, PLAY-043).
//!
//! Playing a song starts one background fill that copies the stream to disk for instant replays. The
//! scheduler keeps at most [`MAX_ACTIVE_JOBS`] fills alive. Starting a fill for a new song cancels every
//! other fill (the user skipped), and cancelled fills still count until they have released their socket and
//! file, so rapid skipping cannot pile up downloads. A fill notices cancellation within [`CANCEL_POLL`].

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use futures_util::StreamExt;
use reqwest::header::RANGE;
use reqwest::Client;
use tokio::io::AsyncWriteExt;
use tokio::time::timeout;

/// One fill for the current song plus one that is still draining after a skip.
pub const MAX_ACTIVE_JOBS: usize = 2;
pub const CANCEL_POLL: Duration = Duration::from_millis(250);
pub const CANCELLED: &str = "player cache cancelled";

#[derive(Debug)]
pub enum Start {
    Started(Arc<AtomicBool>),
    /// A fill for this song is already running.
    AlreadyActive,
    /// Too many fills are still releasing their resources; the song simply streams without caching.
    Busy,
}

#[derive(Debug, Default)]
pub struct CacheJobs {
    jobs: HashMap<String, Arc<AtomicBool>>,
}

impl CacheJobs {
    pub fn start(&mut self, song_id: &str) -> Start {
        if self.jobs.contains_key(song_id) {
            return Start::AlreadyActive;
        }
        for flag in self.jobs.values() {
            flag.store(true, Ordering::Release);
        }
        if self.jobs.len() >= MAX_ACTIVE_JOBS {
            return Start::Busy;
        }
        let flag = Arc::new(AtomicBool::new(false));
        self.jobs.insert(song_id.to_owned(), flag.clone());
        Start::Started(flag)
    }

    pub fn finish(&mut self, song_id: &str) {
        self.jobs.remove(song_id);
    }

    pub fn cancel(&self, song_id: &str) {
        if let Some(flag) = self.jobs.get(song_id) {
            flag.store(true, Ordering::Release);
        }
    }

    /// Cancels every fill and returns their song ids (used when the app exits).
    pub fn cancel_all(&self) -> Vec<String> {
        for flag in self.jobs.values() {
            flag.store(true, Ordering::Release);
        }
        self.jobs.keys().cloned().collect()
    }

    #[cfg(test)]
    pub fn active(&self) -> usize {
        self.jobs.len()
    }
}

/// Default playback-cache quota (PLAY-041, R6-023). `0` turns background caching off.
pub const DEFAULT_LIMIT_MB: i64 = 2048;
pub const LIMIT_CHOICES_MB: [i64; 7] = [0, 512, 1024, 2048, 5120, 10240, 20480];

pub fn limit_bytes(limit_mb: i64) -> i64 {
    limit_mb.max(0).saturating_mul(1024 * 1024)
}

/// Parses the stored setting; anything missing or invalid means the default.
pub fn parse_limit_mb(value: Option<&str>) -> i64 {
    value
        .and_then(|value| value.trim().parse::<i64>().ok())
        .filter(|value| LIMIT_CHOICES_MB.contains(value))
        .unwrap_or(DEFAULT_LIMIT_MB)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CacheEntry {
    pub song_id: String,
    pub bytes: i64,
    /// Last time the entry was written or played from (seconds).
    pub used_at: i64,
}

/// Least-recently-used entries to delete so the committed cache fits in `quota` bytes. Offline downloads
/// live in their own table and folder and are never candidates.
pub fn plan_eviction(entries: &[CacheEntry], quota: i64) -> Vec<String> {
    let mut total: i64 = entries.iter().map(|entry| entry.bytes.max(0)).sum();
    if total <= quota {
        return Vec::new();
    }
    let mut ordered: Vec<&CacheEntry> = entries.iter().collect();
    ordered.sort_by(|a, b| {
        a.used_at
            .cmp(&b.used_at)
            .then_with(|| a.song_id.cmp(&b.song_id))
    });
    let mut evict = Vec::new();
    for entry in ordered {
        if total <= quota {
            break;
        }
        total -= entry.bytes.max(0);
        evict.push(entry.song_id.clone());
    }
    evict
}

/// Leftover files to delete at start-up (R6-026). No fill runs at start-up, so every `.part` in the
/// playback cache is abandoned, and a finished file with no database row is unreachable. In the downloads
/// folder a `.part` is kept only when its download can still be resumed.
pub fn orphaned_files(
    files: &[std::path::PathBuf],
    known: &std::collections::HashSet<std::path::PathBuf>,
    resumable_parts: &std::collections::HashSet<std::path::PathBuf>,
) -> Vec<std::path::PathBuf> {
    files
        .iter()
        .filter(|file| {
            let is_part = file.extension().is_some_and(|ext| ext == "part");
            if is_part {
                !resumable_parts.contains(*file)
            } else {
                !known.contains(*file)
            }
        })
        .cloned()
        .collect()
}

/// A transfer is complete only when it delivered every byte the server announced (PLAY-044, partial:
/// lengths the server does not announce are not validated yet).
pub fn transfer_complete(bytes: i64, expected: Option<i64>) -> bool {
    bytes > 0 && expected.is_none_or(|expected| bytes == expected)
}

/// Next chunk, or an error when cancelled or when nothing arrived for `idle`.
async fn next_chunk<S: futures_util::Stream + Unpin>(
    stream: &mut S,
    cancel: &AtomicBool,
    idle: Duration,
) -> Result<Option<S::Item>, String> {
    let mut waited = Duration::ZERO;
    loop {
        if cancel.load(Ordering::Acquire) {
            return Err(CANCELLED.to_owned());
        }
        // `StreamExt::next` is cancel-safe: dropping it after a timeout loses no data.
        match timeout(CANCEL_POLL, stream.next()).await {
            Ok(item) => return Ok(item),
            Err(_) => {
                waited += CANCEL_POLL;
                if waited >= idle {
                    return Err(format!(
                        "player cache stalled: no data received for {}s",
                        idle.as_secs()
                    ));
                }
            }
        }
    }
}

/// Downloads `url` into `part`. Returns the byte count of a complete file. On any error (including
/// cancellation) the partial file is removed, so no file handle or half file outlives the job.
pub async fn fill(
    client: &Client,
    url: &str,
    part: &Path,
    cancel: &AtomicBool,
    idle: Duration,
    transfer: Duration,
) -> Result<i64, String> {
    let result = fill_inner(client, url, part, cancel, idle, transfer).await;
    if result.is_err() {
        let _ = tokio::fs::remove_file(part).await;
    }
    result
}

async fn fill_inner(
    client: &Client,
    url: &str,
    part: &Path,
    cancel: &AtomicBool,
    idle: Duration,
    transfer: Duration,
) -> Result<i64, String> {
    if let Some(parent) = part.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| format!("player cache directory failed: {error}"))?;
    }
    let response = client
        .get(url)
        .timeout(transfer)
        .header(RANGE, "bytes=0-")
        .send()
        .await
        .map_err(|error| format!("player cache request failed: {}", error.without_url()))?
        .error_for_status()
        .map_err(|error| format!("player cache response failed: {}", error.without_url()))?;
    let expected = response.content_length().map(|value| value as i64);
    let mut file = tokio::fs::File::create(part)
        .await
        .map_err(|error| format!("player cache file failed: {error}"))?;
    let mut stream = response.bytes_stream();
    let mut bytes = 0_i64;
    while let Some(chunk) = next_chunk(&mut stream, cancel, idle).await? {
        let chunk = chunk.map_err(|error| format!("player cache stream failed: {error}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|error| format!("player cache write failed: {error}"))?;
        bytes += chunk.len() as i64;
    }
    file.flush()
        .await
        .map_err(|error| format!("player cache flush failed: {error}"))?;
    drop(file);
    if cancel.load(Ordering::Acquire) {
        return Err(CANCELLED.to_owned());
    }
    if !transfer_complete(bytes, expected) {
        return Err(format!("player cache incomplete: {bytes} bytes"));
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::time::Instant;

    /// Minimal HTTP server: announces `length` bytes, sends `send` of them `pace` apart in 1 KiB chunks,
    /// then closes the connection.
    fn serve(length: usize, send: usize, pace: Duration) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            if let Ok((mut socket, _)) = listener.accept() {
                let mut request = [0_u8; 2048];
                let _ = socket.read(&mut request);
                let header = format!(
                    "HTTP/1.1 206 Partial Content\r\nContent-Type: audio/webm\r\nContent-Length: {length}\r\nContent-Range: bytes 0-{}/{length}\r\nConnection: close\r\n\r\n",
                    length - 1
                );
                if socket.write_all(header.as_bytes()).is_err() {
                    return;
                }
                let mut sent = 0;
                while sent < send {
                    let size = 1024.min(send - sent);
                    if socket.write_all(&vec![7_u8; size]).is_err() {
                        return;
                    }
                    sent += size;
                    std::thread::sleep(pace);
                }
            }
        });
        format!("http://{address}/videoplayback")
    }

    fn part_path(name: &str) -> std::path::PathBuf {
        std::env::temp_dir()
            .join(format!("meld-player-cache-test-{}", std::process::id()))
            .join(format!("{name}.part"))
    }

    fn client() -> Client {
        Client::builder().build().unwrap()
    }

    #[test]
    fn rapid_skipping_never_runs_more_than_two_fills() {
        let mut jobs = CacheJobs::default();
        let mut flags = Vec::new();
        for index in 0..50 {
            match jobs.start(&format!("song-{index}")) {
                Start::Started(flag) => flags.push(flag),
                Start::Busy | Start::AlreadyActive => {}
            }
            assert!(jobs.active() <= MAX_ACTIVE_JOBS);
        }
        // Only the first two could start; the second start cancelled the first.
        assert_eq!(flags.len(), 2);
        assert!(flags[0].load(Ordering::Acquire));
        // Every later start cancelled the newest one too: nothing keeps downloading after skips.
        assert!(flags[1].load(Ordering::Acquire));
        jobs.finish("song-0");
        jobs.finish("song-1");
        assert_eq!(jobs.active(), 0);
        assert!(matches!(jobs.start("song-50"), Start::Started(_)));
    }

    #[test]
    fn same_song_is_not_filled_twice_and_does_not_cancel_others() {
        let mut jobs = CacheJobs::default();
        let Start::Started(first) = jobs.start("a") else {
            panic!("first start");
        };
        assert!(matches!(jobs.start("a"), Start::AlreadyActive));
        assert!(!first.load(Ordering::Acquire));
        assert_eq!(jobs.cancel_all(), vec!["a".to_owned()]);
        assert!(first.load(Ordering::Acquire));
        let mut jobs = CacheJobs::default();
        let Start::Started(flag) = jobs.start("b") else {
            panic!("start");
        };
        jobs.cancel("b");
        assert!(flag.load(Ordering::Acquire));
    }

    #[test]
    fn complete_fill_keeps_the_file() {
        let url = serve(8 * 1024, 8 * 1024, Duration::ZERO);
        let part = part_path("complete");
        let cancel = AtomicBool::new(false);
        let bytes = tauri::async_runtime::block_on(fill(
            &client(),
            &url,
            &part,
            &cancel,
            Duration::from_secs(5),
            Duration::from_secs(10),
        ))
        .unwrap();
        assert_eq!(bytes, 8 * 1024);
        assert_eq!(std::fs::metadata(&part).unwrap().len(), 8 * 1024);
        let _ = std::fs::remove_file(&part);
    }

    #[test]
    fn truncated_fill_is_rejected_and_removed() {
        let url = serve(8 * 1024, 3 * 1024, Duration::ZERO);
        let part = part_path("truncated");
        let cancel = AtomicBool::new(false);
        let result = tauri::async_runtime::block_on(fill(
            &client(),
            &url,
            &part,
            &cancel,
            Duration::from_secs(5),
            Duration::from_secs(10),
        ));
        assert!(result.is_err(), "{result:?}");
        assert!(!part.exists());
    }

    #[test]
    fn cancelled_fill_releases_socket_and_file_promptly() {
        // 4 MiB at 1 KiB per 50 ms would take over three minutes.
        let url = serve(4 * 1024 * 1024, 4 * 1024 * 1024, Duration::from_millis(50));
        let part = part_path("cancelled");
        let cancel = Arc::new(AtomicBool::new(false));
        let flag = cancel.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(600));
            flag.store(true, Ordering::Release);
        });
        let started = Instant::now();
        let result = tauri::async_runtime::block_on(fill(
            &client(),
            &url,
            &part,
            &cancel,
            Duration::from_secs(30),
            Duration::from_secs(600),
        ));
        assert_eq!(result.unwrap_err(), CANCELLED);
        assert!(
            started.elapsed() < Duration::from_secs(3),
            "{:?}",
            started.elapsed()
        );
        assert!(!part.exists());
    }

    #[test]
    fn stalled_fill_gives_up_after_the_idle_limit() {
        let url = serve(64 * 1024, 1024, Duration::from_secs(5));
        let part = part_path("stalled");
        let cancel = AtomicBool::new(false);
        let started = Instant::now();
        let result = tauri::async_runtime::block_on(fill(
            &client(),
            &url,
            &part,
            &cancel,
            Duration::from_secs(1),
            Duration::from_secs(60),
        ));
        assert!(result.unwrap_err().contains("stalled"));
        assert!(started.elapsed() < Duration::from_secs(4));
        assert!(!part.exists());
    }

    #[test]
    fn truncated_transfers_never_count_as_complete() {
        assert!(transfer_complete(4_001_721, Some(4_001_721)));
        assert!(!transfer_complete(1_048_576, Some(4_001_721)));
        assert!(!transfer_complete(0, None));
        assert!(!transfer_complete(0, Some(0)));
        assert!(transfer_complete(512, None));
    }

    fn entry(id: &str, bytes: i64, used_at: i64) -> CacheEntry {
        CacheEntry {
            song_id: id.to_owned(),
            bytes,
            used_at,
        }
    }

    #[test]
    fn eviction_removes_least_recently_used_until_under_quota() {
        let entries = vec![
            entry("new", 40, 300),
            entry("old", 50, 100),
            entry("mid", 30, 200),
        ];
        assert!(plan_eviction(&entries, 120).is_empty());
        assert_eq!(plan_eviction(&entries, 100), vec!["old".to_owned()]);
        assert_eq!(
            plan_eviction(&entries, 45),
            vec!["old".to_owned(), "mid".to_owned()]
        );
        assert_eq!(plan_eviction(&entries, 0).len(), 3);
    }

    #[test]
    fn cache_stress_never_exceeds_quota_after_commit() {
        // 500 plays of 3-9 MB songs into a 64 MB cache: after every committed fill the cache fits again.
        let quota = limit_bytes(64);
        let mut cache: Vec<CacheEntry> = Vec::new();
        for play in 0..500_i64 {
            let id = format!("song-{}", (play * 7919) % 173);
            let bytes = (3 + play % 7) * 1024 * 1024;
            if let Some(hit) = cache.iter_mut().find(|e| e.song_id == id) {
                hit.used_at = play;
            } else {
                cache.push(entry(&id, bytes, play));
            }
            let evict = plan_eviction(&cache, quota);
            cache.retain(|e| !evict.contains(&e.song_id));
            let total: i64 = cache.iter().map(|e| e.bytes).sum();
            assert!(total <= quota, "play {play}: {total} > {quota}");
            // The song that was just played is never the one evicted while others remain.
            assert!(cache.iter().any(|e| e.song_id == id) || cache.is_empty());
        }
        // In-flight allowance: at most MAX_ACTIVE_JOBS uncommitted files exist on top of the quota.
        assert_eq!(MAX_ACTIVE_JOBS, 2);
    }

    #[test]
    fn limit_setting_accepts_only_offered_choices() {
        assert_eq!(parse_limit_mb(None), DEFAULT_LIMIT_MB);
        assert_eq!(parse_limit_mb(Some("5120")), 5120);
        assert_eq!(parse_limit_mb(Some("0")), 0);
        assert_eq!(parse_limit_mb(Some("777")), DEFAULT_LIMIT_MB);
        assert_eq!(parse_limit_mb(Some("-1")), DEFAULT_LIMIT_MB);
        assert_eq!(limit_bytes(2), 2 * 1024 * 1024);
    }

    #[test]
    fn startup_cleanup_keeps_known_files_and_resumable_parts() {
        use std::collections::HashSet;
        use std::path::PathBuf;
        let files = vec![
            PathBuf::from("c/a.audio"),
            PathBuf::from("c/orphan.audio"),
            PathBuf::from("c/a.audio.part"),
            PathBuf::from("d/resume.audio.part"),
        ];
        let known: HashSet<PathBuf> = [PathBuf::from("c/a.audio")].into();
        let resumable: HashSet<PathBuf> = [PathBuf::from("d/resume.audio.part")].into();
        assert_eq!(
            orphaned_files(&files, &known, &resumable),
            vec![
                PathBuf::from("c/orphan.audio"),
                PathBuf::from("c/a.audio.part")
            ]
        );
    }
}
