//! Structured IPC errors (S5-007, D-042).
//!
//! Every command returns `Result<T, IpcError>`. The webview receives
//! `{ code, message, retryable, detail? }`. The raw internal error text (SQL text, filesystem
//! paths, upstream bodies, request URLs) is never sent by default: it is reduced to a short
//! context message for the UI and written to the log with URLs and paths redacted.
use regex::Regex;
use serde::Serialize;
use std::fmt;
use std::sync::OnceLock;

/// Stable, machine-readable error codes. The TypeScript side mirrors these in
/// `src/lib/ipcError.ts`; renaming one is a contract change.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    InvalidArgument,
    Unauthenticated,
    NotFound,
    Conflict,
    Cancelled,
    Timeout,
    RateLimited,
    Network,
    Upstream,
    Database,
    Io,
    Internal,
}

impl ErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::InvalidArgument => "invalid_argument",
            Self::Unauthenticated => "unauthenticated",
            Self::NotFound => "not_found",
            Self::Conflict => "conflict",
            Self::Cancelled => "cancelled",
            Self::Timeout => "timeout",
            Self::RateLimited => "rate_limited",
            Self::Network => "network",
            Self::Upstream => "upstream",
            Self::Database => "database",
            Self::Io => "io",
            Self::Internal => "internal",
        }
    }

    /// Whether the same call may succeed if the user (or the UI) simply tries again.
    pub fn retryable(self) -> bool {
        matches!(
            self,
            Self::Timeout | Self::RateLimited | Self::Network | Self::Upstream
        )
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, specta::Type)]
pub struct IpcError {
    pub code: ErrorCode,
    pub message: String,
    pub retryable: bool,
    /// Extra diagnostic text. `None` by default; only set by explicit constructors with text
    /// that is already safe to show.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

pub type IpcResult<T> = Result<T, IpcError>;

const MAX_MESSAGE_CHARS: usize = 200;

impl IpcError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: sanitize(&message.into()),
            retryable: code.retryable(),
            detail: None,
        }
    }

    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::InvalidArgument, message)
    }

    pub fn cancelled(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::Cancelled, message)
    }

    #[allow(dead_code)] // for commands that attach UI-safe diagnostics (S5-012 contract tests use it)
    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(sanitize(&detail.into()));
        self
    }

    /// Converts an internal error string. The full text is logged (redacted); the UI gets the
    /// context before the first `": "` plus a code inferred from the text.
    pub fn from_internal(raw: &str) -> Self {
        let code = classify(raw);
        let summary = summary(raw);
        if summary.len() < raw.trim().len() {
            log_internal(code, raw);
        }
        Self::new(code, summary)
    }
}

impl fmt::Display for IpcError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{} ({})", self.message, self.code.as_str())
    }
}

impl std::error::Error for IpcError {}

impl From<String> for IpcError {
    fn from(raw: String) -> Self {
        Self::from_internal(&raw)
    }
}

impl From<&str> for IpcError {
    fn from(raw: &str) -> Self {
        Self::from_internal(raw)
    }
}

/// Infers a code from legacy error text. Order matters: the first matching rule wins.
pub fn classify(raw: &str) -> ErrorCode {
    let text = raw.to_lowercase();
    let has = |needles: &[&str]| needles.iter().any(|needle| text.contains(needle));
    if has(&["poisoned"]) {
        ErrorCode::Internal
    } else if has(&["cancelled", "canceled", "interrupted"]) {
        ErrorCode::Cancelled
    } else if has(&["timed out", "timeout", "deadline has elapsed"]) {
        ErrorCode::Timeout
    } else if has(&["429", "too many requests", "rate limit"]) {
        ErrorCode::RateLimited
    } else if has(&[
        "not authenticated",
        "not signed in",
        "sign in",
        "signed-in",
        "token expired",
        "anonymous token",
        "session requires",
        "missing sapisid",
        "401",
    ]) {
        ErrorCode::Unauthenticated
    } else if has(&[
        " is empty",
        " are empty",
        " required",
        " must be",
        "unsupported",
        "invalid ",
        "requires a non-empty",
        "require true or false",
    ]) {
        ErrorCode::InvalidArgument
    } else if has(&["not found", "no longer exists", "404"]) {
        ErrorCode::NotFound
    } else if has(&[
        "already active",
        "not currently active",
        "cancel the active",
        "no longer matches",
    ]) {
        ErrorCode::Conflict
    } else if has(&[
        "error sending request",
        "request failed",
        "connection",
        "dns",
        "network",
        "body failed",
    ]) {
        ErrorCode::Network
    } else if has(&[
        "database",
        "sqlite",
        "sql",
        "query failed",
        "rows failed",
        "row decode",
        "insert failed",
        "update failed",
        "delete failed",
        "transaction",
    ]) {
        ErrorCode::Database
    } else if has(&[
        "youtube",
        "spotify",
        "innertube",
        "did not return",
        "did not confirm",
        "returned",
        "http ",
        "status ",
        "lyrics",
    ]) {
        ErrorCode::Upstream
    } else if has(&[
        "read failed",
        "write failed",
        "removal failed",
        "create failed",
        "copy failed",
        "rename failed",
        "file",
        "directory",
        "path",
        "os error",
    ]) {
        ErrorCode::Io
    } else {
        ErrorCode::Internal
    }
}

/// The part of a legacy `"<context> failed: <raw error>"` string that is safe for the UI.
fn summary(raw: &str) -> String {
    let trimmed = raw.trim();
    let head = trimmed.split(": ").next().unwrap_or(trimmed).trim();
    let head = head.split('\n').next().unwrap_or(head).trim();
    if head.is_empty() {
        "Unexpected error".to_owned()
    } else {
        head.to_owned()
    }
}

fn url_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r#"(?i)\b(https?)://([^/\s"'<>)]+)[^\s"'<>)]*"#).expect("url pattern")
    })
}

fn path_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // Windows drive paths, UNC paths and absolute Unix paths with at least two segments.
        Regex::new(r#"(?:\b[A-Za-z]:[\\/][^\s"'<>|]*|\\\\[^\s"'<>|]+|(?:^|[\s("'=])/[^\s/"'<>]+/[^\s"'<>]*)"#)
            .expect("path pattern")
    })
}

/// Removes URLs (kept as host only, so signed stream URLs never leak), filesystem paths and
/// control characters, and caps the length.
pub fn sanitize(text: &str) -> String {
    let without_urls = url_pattern().replace_all(text, "$1://$2/…");
    let without_paths = path_pattern().replace_all(&without_urls, |captures: &regex::Captures| {
        let matched = &captures[0];
        let lead: String = matched
            .chars()
            .take_while(|character| matches!(character, ' ' | '\t' | '(' | '"' | '\'' | '='))
            .collect();
        format!("{lead}<path>")
    });
    let cleaned: String = without_paths
        .chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect();
    let cleaned = cleaned.trim();
    if cleaned.chars().count() <= MAX_MESSAGE_CHARS {
        cleaned.to_owned()
    } else {
        let mut capped: String = cleaned.chars().take(MAX_MESSAGE_CHARS - 1).collect();
        capped.push('…');
        capped
    }
}

fn log_internal(code: ErrorCode, raw: &str) {
    eprintln!("ipc error [{}]: {}", code.as_str(), redact_for_log(raw));
}

/// Log form: URLs reduced to their host, paths and length kept (paths are local to the user).
pub fn redact_for_log(raw: &str) -> String {
    let text = url_pattern().replace_all(raw, "$1://$2/…");
    let mut out: String = text.chars().take(2000).collect();
    if text.chars().count() > 2000 {
        out.push('…');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_to_the_documented_shape() {
        let value = serde_json::to_value(IpcError::invalid("video id is empty")).unwrap();
        assert_eq!(
            value,
            serde_json::json!({"code": "invalid_argument", "message": "video id is empty", "retryable": false})
        );
        let with_detail = serde_json::to_value(
            IpcError::new(ErrorCode::Network, "offline").with_detail("try later"),
        )
        .unwrap();
        assert_eq!(with_detail["detail"], "try later");
        assert_eq!(with_detail["retryable"], true);
    }

    #[test]
    fn legacy_strings_keep_only_their_context() {
        let error = IpcError::from(
            "top songs query failed: no such column: play_time in SELECT * FROM events".to_owned(),
        );
        assert_eq!(error.code, ErrorCode::Database);
        assert_eq!(error.message, "top songs query failed");
        assert!(!error.retryable);
        assert!(!error.message.contains("SELECT"));
    }

    #[test]
    fn upstream_bodies_and_signed_urls_never_reach_the_ui() {
        let error = IpcError::from(
            "visitorData request failed: error sending request for url (https://music.youtube.com/youtubei/v1/player?key=abc&sig=SECRET)".to_owned(),
        );
        assert_eq!(error.code, ErrorCode::Network);
        assert!(error.retryable);
        assert_eq!(error.message, "visitorData request failed");
        let direct = IpcError::new(
            ErrorCode::Upstream,
            "stream https://rr1.googlevideo.com/videoplayback?expire=1&signature=SECRET failed",
        );
        assert!(!direct.message.contains("SECRET"));
        assert!(direct.message.contains("https://rr1.googlevideo.com/…"));
        assert!(!redact_for_log("x https://a.b/c?sig=SECRET").contains("SECRET"));
    }

    #[test]
    fn filesystem_paths_are_removed() {
        let windows =
            sanitize(r"could not open C:\Users\romany\AppData\Roaming\Meld Desktop\song.db");
        assert!(!windows.contains("romany"), "{windows}");
        assert!(windows.contains("<path>"));
        let unix = sanitize("could not open /home/user/.local/share/song.db now");
        assert!(!unix.contains("/home/user"), "{unix}");
        assert_eq!(unix, "could not open <path> now");
        assert_eq!(sanitize("a/b ratio"), "a/b ratio");
    }

    #[test]
    fn messages_are_capped_and_single_line() {
        let long = "x".repeat(500);
        assert_eq!(sanitize(&long).chars().count(), MAX_MESSAGE_CHARS);
        assert_eq!(
            IpcError::from("first line\nsecond line").message,
            "first line"
        );
        assert_eq!(IpcError::from("   ").message, "Unexpected error");
    }

    #[test]
    fn classification_covers_the_legacy_messages() {
        let cases = [
            ("database state poisoned", ErrorCode::Internal),
            ("Backup cancelled", ErrorCode::Cancelled),
            (
                "Lyrics providers timed out after 30 seconds",
                ErrorCode::Timeout,
            ),
            ("YouTube Music returned HTTP 429", ErrorCode::RateLimited),
            (
                "Spotify account is not authenticated or its token expired",
                ErrorCode::Unauthenticated,
            ),
            (
                "Google session cookie is missing SAPISID",
                ErrorCode::Unauthenticated,
            ),
            ("video id is empty", ErrorCode::InvalidArgument),
            (
                "Spotify playlist id is required",
                ErrorCode::InvalidArgument,
            ),
            (
                "audioQuality must be auto, high, or low",
                ErrorCode::InvalidArgument,
            ),
            ("unsupported Meld setting: foo", ErrorCode::InvalidArgument),
            (
                "song edit target was not found in the local Meld database",
                ErrorCode::NotFound,
            ),
            ("download is already active", ErrorCode::Conflict),
            ("visitorData body failed: eof", ErrorCode::Network),
            (
                "library clear failed for songs: disk I/O error",
                ErrorCode::Internal,
            ),
            ("stats total plays query failed: x", ErrorCode::Database),
            (
                "YouTube Music did not confirm the library change",
                ErrorCode::Upstream,
            ),
            ("player cache path read failed: denied", ErrorCode::Io),
            ("something odd", ErrorCode::Internal),
        ];
        for (raw, expected) in cases {
            assert_eq!(classify(raw), expected, "{raw}");
        }
        assert!(ErrorCode::Network.retryable());
        assert!(!ErrorCode::InvalidArgument.retryable());
    }
}

#[cfg(test)]
mod contract {
    /// S5-007 "done when": no command hands a raw `String` error to the webview.
    #[test]
    fn no_command_returns_a_string_error() {
        let sources = [
            ("account", include_str!("account.rs")),
            ("backup", include_str!("backup.rs")),
            ("catalog", include_str!("catalog.rs")),
            ("downloads", include_str!("downloads.rs")),
            ("library", include_str!("library.rs")),
            ("lyrics", include_str!("lyrics.rs")),
            ("player", include_str!("player.rs")),
            ("settings", include_str!("settings.rs")),
            ("spotify", include_str!("spotify.rs")),
            ("system", include_str!("system.rs")),
            ("updates", include_str!("../updates.rs")),
        ];
        let signature = regex::Regex::new(r"\)\s*->\s*Result<[^{;]*,\s*String>\s*\{").unwrap();
        for (owner, source) in sources {
            for command in source.split("#[tauri::command]").skip(1) {
                let header = command.split('{').next().unwrap_or_default();
                assert!(
                    !signature.is_match(&format!("{header}{{")),
                    "{owner}: command still returns Result<_, String>: {}",
                    header.trim()
                );
                assert!(header.contains("IpcResult<"), "{owner}: {}", header.trim());
            }
        }
    }
}
