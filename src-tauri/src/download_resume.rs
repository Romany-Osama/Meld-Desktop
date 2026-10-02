//! Resumable offline downloads (PLAY-055).
//!
//! The `downloads` row is the resume manifest: `path` names the `.part` file, `total_bytes` is the full size the
//! media server announced when the partial file was started. A later attempt (after a cancel, a failure or an
//! app restart) asks for `bytes=<part length>-` and appends only when the server answers 206 with a
//! `Content-Range` that starts exactly at the partial length and announces the same total. Anything else (another
//! format after a quality change, a different file from another client, a server that ignores the range) starts
//! the file again from byte 0, so a resumed file can never mix two streams.
use futures_util::{Stream, StreamExt};
use std::fmt::Display;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tokio::io::AsyncWriteExt;

pub const CANCELLED: &str = "download cancelled";
const PROGRESS_STEP: i64 = 1024 * 1024;

/// Waits for the next chunk of a transfer, failing with "`what` stalled" if nothing arrives within `idle` (TR-H5).
pub async fn next_chunk_within<S: Stream + Unpin>(
    stream: &mut S,
    idle: Duration,
    what: &str,
) -> Result<Option<S::Item>, String> {
    tokio::time::timeout(idle, stream.next())
        .await
        .map_err(|_| format!("{what} stalled: no data received for {}s", idle.as_secs()))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ContentRange {
    pub start: i64,
    pub end: i64,
    pub total: Option<i64>,
}

/// Parses `Content-Range: bytes <start>-<end>/<total|*>`.
pub fn parse_content_range(value: &str) -> Option<ContentRange> {
    let rest = value.trim().strip_prefix("bytes ")?;
    let (range, total) = rest.split_once('/')?;
    let (start, end) = range.split_once('-')?;
    let start: i64 = start.trim().parse().ok()?;
    let end: i64 = end.trim().parse().ok()?;
    if start < 0 || end < start {
        return None;
    }
    let total = match total.trim() {
        "*" => None,
        value => Some(value.parse::<i64>().ok()?),
    };
    if total.is_some_and(|total| end >= total) {
        return None;
    }
    Some(ContentRange { start, end, total })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Resume {
    /// Write the response body from byte 0 (no partial file, or the server sent the whole file with 200).
    Fresh,
    /// The response continues the partial file exactly: append to it.
    Append,
    /// The response is a range of a different or unverifiable stream: delete the partial and request from 0.
    Restart,
}

/// What to do with a response to `Range: bytes=<offset>-` given the size recorded for the partial file.
pub fn resume_decision(
    offset: i64,
    status: u16,
    content_range: Option<&str>,
    expected_total: Option<i64>,
) -> Resume {
    if offset <= 0 {
        return Resume::Fresh;
    }
    match status {
        206 => {
            let range = content_range.and_then(parse_content_range);
            let continues = range.is_some_and(|range| {
                range.start == offset
                    && range.total.is_some()
                    && range.total == expected_total
                    && offset < range.total.unwrap_or(0)
            });
            if continues {
                Resume::Append
            } else {
                Resume::Restart
            }
        }
        416 => Resume::Restart,
        _ => Resume::Fresh,
    }
}

/// Writes a response body to `partial`, appending when `append` (then `start_bytes` is the partial length).
/// Returns the file length. Stops with [`CANCELLED`] as soon as `cancel` is set, keeping what was written so the
/// next attempt can resume. `progress` runs each time another MiB has been written.
pub async fn write_body<S, B, E>(
    mut stream: S,
    partial: &Path,
    append: bool,
    start_bytes: i64,
    cancel: &AtomicBool,
    idle: Duration,
    mut progress: impl FnMut(i64) -> Result<(), String>,
) -> Result<i64, String>
where
    S: Stream<Item = Result<B, E>> + Unpin,
    B: AsRef<[u8]>,
    E: Display,
{
    let mut file = if append {
        tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(partial)
            .await
    } else {
        tokio::fs::File::create(partial).await
    }
    .map_err(|error| format!("download cache file failed: {error}"))?;
    let mut bytes = if append { start_bytes } else { 0 };
    loop {
        if cancel.load(Ordering::Acquire) {
            let _ = file.flush().await;
            return Err(CANCELLED.to_owned());
        }
        let Some(chunk) = next_chunk_within(&mut stream, idle, "download").await? else {
            break;
        };
        let chunk = chunk.map_err(|error| format!("download stream failed: {error}"))?;
        let chunk = chunk.as_ref();
        file.write_all(chunk)
            .await
            .map_err(|error| format!("download cache write failed: {error}"))?;
        let before = bytes;
        bytes += chunk.len() as i64;
        if bytes / PROGRESS_STEP > before / PROGRESS_STEP {
            progress(bytes)?;
        }
    }
    file.flush()
        .await
        .map_err(|error| format!("download cache flush failed: {error}"))?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::{CONTENT_RANGE, RANGE};
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::Arc;
    use std::time::Instant;

    fn data(length: usize, salt: u8) -> Vec<u8> {
        (0..length)
            .map(|index| (index % 251) as u8 ^ salt)
            .collect()
    }

    /// HTTP server for `connections` requests that honours `Range: bytes=N-` (206 + Content-Range) and sends
    /// `body` in 1 KiB chunks `pace` apart.
    fn serve(body: Vec<u8>, connections: usize, pace: Duration) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            for _ in 0..connections {
                let Ok((mut socket, _)) = listener.accept() else {
                    return;
                };
                let mut request = [0_u8; 4096];
                let read = socket.read(&mut request).unwrap_or(0);
                let request = String::from_utf8_lossy(&request[..read]).to_ascii_lowercase();
                let start = request
                    .lines()
                    .find_map(|line| line.strip_prefix("range: bytes="))
                    .and_then(|range| range.trim().trim_end_matches('-').parse::<usize>().ok());
                let length = body.len();
                let (head, slice) = match start {
                    Some(start) if start >= length => (
                        format!("HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */{length}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"),
                        &body[0..0],
                    ),
                    Some(start) => (
                        format!("HTTP/1.1 206 Partial Content\r\nContent-Length: {}\r\nContent-Range: bytes {start}-{}/{length}\r\nConnection: close\r\n\r\n", length - start, length - 1),
                        &body[start..],
                    ),
                    None => (
                        format!("HTTP/1.1 200 OK\r\nContent-Length: {length}\r\nConnection: close\r\n\r\n"),
                        &body[..],
                    ),
                };
                if socket.write_all(head.as_bytes()).is_err() {
                    continue;
                }
                for chunk in slice.chunks(1024) {
                    if socket.write_all(chunk).is_err() {
                        break;
                    }
                    std::thread::sleep(pace);
                }
            }
        });
        format!("http://{address}/videoplayback")
    }

    fn part(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("meld-download-resume-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{name}.audio.part"));
        let _ = std::fs::remove_file(&path);
        path
    }

    /// One download attempt the way `download_start` makes it: range request from the partial length, then
    /// fresh / append / restart by [`resume_decision`]. Returns (result, decision of the first response).
    async fn attempt(
        url: &str,
        partial: &Path,
        expected_total: Option<i64>,
        cancel: &AtomicBool,
    ) -> (Result<i64, String>, Resume) {
        let client = reqwest::Client::new();
        let mut offset = std::fs::metadata(partial)
            .map(|meta| meta.len() as i64)
            .unwrap_or(0);
        let mut first = None;
        loop {
            let response = client
                .get(url)
                .header(RANGE, format!("bytes={offset}-"))
                .send()
                .await
                .unwrap();
            let range = response
                .headers()
                .get(CONTENT_RANGE)
                .and_then(|value| value.to_str().ok())
                .map(str::to_owned);
            let decision = resume_decision(
                offset,
                response.status().as_u16(),
                range.as_deref(),
                expected_total,
            );
            first.get_or_insert(decision);
            if decision == Resume::Restart {
                let _ = std::fs::remove_file(partial);
                offset = 0;
                continue;
            }
            let append = decision == Resume::Append;
            let result = write_body(
                response.bytes_stream(),
                partial,
                append,
                offset,
                cancel,
                Duration::from_secs(10),
                |_| Ok(()),
            )
            .await;
            return (result, first.unwrap());
        }
    }

    #[test]
    fn content_range_is_parsed_strictly() {
        assert_eq!(
            parse_content_range("bytes 100-999/1000"),
            Some(ContentRange {
                start: 100,
                end: 999,
                total: Some(1000)
            })
        );
        assert_eq!(
            parse_content_range("bytes 0-9/*"),
            Some(ContentRange {
                start: 0,
                end: 9,
                total: None
            })
        );
        for bad in [
            "",
            "bytes */1000",
            "bytes 10-5/100",
            "bytes 0-100/100",
            "items 0-1/2",
            "bytes a-b/c",
        ] {
            assert_eq!(parse_content_range(bad), None, "{bad}");
        }
    }

    #[test]
    fn partial_is_appended_only_to_the_same_stream_at_the_same_offset() {
        let range = Some("bytes 4096-9999/10000");
        assert_eq!(
            resume_decision(4096, 206, range, Some(10_000)),
            Resume::Append
        );
        assert_eq!(resume_decision(0, 206, range, Some(10_000)), Resume::Fresh);
        // Another format (quality change) or another file: same offset, different total.
        assert_eq!(
            resume_decision(4096, 206, Some("bytes 4096-11999/12000"), Some(10_000)),
            Resume::Restart
        );
        // The server answered a different range than asked for.
        assert_eq!(
            resume_decision(4096, 206, Some("bytes 0-9999/10000"), Some(10_000)),
            Resume::Restart
        );
        // Nothing to verify against: an old row without a size, or a server without a total.
        assert_eq!(resume_decision(4096, 206, range, None), Resume::Restart);
        assert_eq!(
            resume_decision(4096, 206, Some("bytes 4096-9999/*"), Some(10_000)),
            Resume::Restart
        );
        assert_eq!(
            resume_decision(4096, 206, None, Some(10_000)),
            Resume::Restart
        );
        // The partial is already as long as the stream, or the server ignored the range.
        assert_eq!(
            resume_decision(10_000, 416, None, Some(10_000)),
            Resume::Restart
        );
        assert_eq!(
            resume_decision(4096, 200, None, Some(10_000)),
            Resume::Fresh
        );
    }

    #[test]
    fn cancelled_download_keeps_its_partial_and_resumes_after_restart() {
        let body = data(256 * 1024, 0);
        let total = body.len() as i64;
        let url = serve(body.clone(), 2, Duration::from_millis(4));
        let partial = part("cancel-resume");
        let cancel = Arc::new(AtomicBool::new(false));
        let flag = cancel.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(250));
            flag.store(true, Ordering::Release);
        });
        let started = Instant::now();
        let (first, decision) =
            tauri::async_runtime::block_on(attempt(&url, &partial, Some(total), &cancel));
        assert_eq!(first.unwrap_err(), CANCELLED);
        assert_eq!(decision, Resume::Fresh);
        assert!(started.elapsed() < Duration::from_secs(3));
        // "App restart": nothing in memory survives; the next attempt only sees the file and the recorded size.
        let kept = std::fs::read(&partial).unwrap();
        assert!(
            !kept.is_empty() && kept.len() < body.len(),
            "kept {} bytes",
            kept.len()
        );
        assert_eq!(kept[..], body[..kept.len()]);

        let (second, decision) = tauri::async_runtime::block_on(attempt(
            &url,
            &partial,
            Some(total),
            &AtomicBool::new(false),
        ));
        assert_eq!(decision, Resume::Append);
        assert_eq!(second.unwrap(), total);
        assert_eq!(std::fs::read(&partial).unwrap(), body);
        let _ = std::fs::remove_file(&partial);
    }

    #[test]
    fn partial_from_another_stream_is_restarted_not_mixed() {
        let old = data(64 * 1024, 0);
        let new = data(96 * 1024, 0x5a);
        let partial = part("other-stream");
        std::fs::write(&partial, &old[..20_000]).unwrap();
        let url = serve(new.clone(), 2, Duration::ZERO);
        let (result, decision) = tauri::async_runtime::block_on(attempt(
            &url,
            &partial,
            Some(old.len() as i64),
            &AtomicBool::new(false),
        ));
        assert_eq!(decision, Resume::Restart);
        assert_eq!(result.unwrap(), new.len() as i64);
        assert_eq!(std::fs::read(&partial).unwrap(), new);
        let _ = std::fs::remove_file(&partial);
    }

    #[test]
    fn complete_partial_is_restarted_cleanly_after_416() {
        let body = data(8 * 1024, 3);
        let partial = part("already-complete");
        std::fs::write(&partial, &body).unwrap();
        let url = serve(body.clone(), 2, Duration::ZERO);
        let (result, decision) = tauri::async_runtime::block_on(attempt(
            &url,
            &partial,
            Some(body.len() as i64),
            &AtomicBool::new(false),
        ));
        assert_eq!(decision, Resume::Restart);
        assert_eq!(result.unwrap(), body.len() as i64);
        assert_eq!(std::fs::read(&partial).unwrap(), body);
        let _ = std::fs::remove_file(&partial);
    }

    #[test]
    fn progress_runs_once_per_mebibyte() {
        let chunks: Vec<Result<Vec<u8>, String>> =
            (0..5).map(|_| Ok(vec![1_u8; 512 * 1024])).collect();
        let partial = part("progress");
        let mut reports = Vec::new();
        let written = tauri::async_runtime::block_on(write_body(
            futures_util::stream::iter(chunks),
            &partial,
            false,
            0,
            &AtomicBool::new(false),
            Duration::from_secs(5),
            |bytes| {
                reports.push(bytes);
                Ok(())
            },
        ))
        .unwrap();
        assert_eq!(written, 5 * 512 * 1024);
        assert_eq!(reports, vec![1024 * 1024, 2 * 1024 * 1024]);
        let _ = std::fs::remove_file(&partial);
    }
}
