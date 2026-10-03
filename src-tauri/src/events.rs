//! Backend → webview event contract (S5-010, D-046). docs/events.md documents every event;
//! `src/lib/events.ts` mirrors the names, versions and payload types. Emit only through
//! `emit` so the name and version cannot drift (`events::tests` fails on a raw `.emit("…")`).
use serde::Serialize;
use tauri::{Emitter, Runtime};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AppEvent {
    /// Payload `SessionStatus`: the Google sign-in window produced a validated session.
    AccountStatus,
    /// Payload `IpcError`: the Google sign-in window failed or timed out.
    AccountStatusError,
    /// Payload `SpotifySessionStatus`: the Spotify sign-in window produced a session.
    SpotifyStatus,
    /// Payload `IpcError`: the Spotify sign-in window failed or timed out.
    SpotifyStatusError,
    /// Payload `DownloadInfo`: a download started, progressed, finished, failed or was cancelled.
    DownloadState,
    /// Payload `UpdateProgress`: bytes of the app update downloaded so far.
    AppUpdateProgress,
}

// `ALL` and `version` are the contract checked by the tests and read by the binding generator (S5-011).
#[allow(dead_code)]
impl AppEvent {
    pub const ALL: [AppEvent; 6] = [
        Self::AccountStatus,
        Self::AccountStatusError,
        Self::SpotifyStatus,
        Self::SpotifyStatusError,
        Self::DownloadState,
        Self::AppUpdateProgress,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Self::AccountStatus => "account-status",
            Self::AccountStatusError => "account-status-error",
            Self::SpotifyStatus => "spotify-status",
            Self::SpotifyStatusError => "spotify-status-error",
            Self::DownloadState => "download-state",
            Self::AppUpdateProgress => "app-update-progress",
        }
    }

    /// Payload version. Bump it (and docs/events.md, src/lib/events.ts) whenever the payload
    /// shape changes incompatibly.
    pub fn version(self) -> u32 {
        match self {
            // v2: the payload is an `IpcError` object (v1 was a raw string).
            Self::AccountStatusError | Self::SpotifyStatusError => 2,
            _ => 1,
        }
    }
}

/// Emits `event` to every webview. Failures (no window yet, app shutting down) are ignored, as
/// before: an event is a notification, not a command result.
pub fn emit<R: Runtime, P: Serialize + Clone>(app: &impl Emitter<R>, event: AppEvent, payload: P) {
    let _ = app.emit(event.name(), payload);
}

/// Emits an error event; the payload is a sanitized `IpcError` (S5-007), never raw text.
pub fn emit_error<R: Runtime>(
    app: &impl Emitter<R>,
    event: AppEvent,
    error: impl Into<crate::IpcError>,
) {
    emit(app, event, error.into());
}

#[cfg(test)]
mod tests {
    use super::*;

    const DOC: &str = include_str!("../../docs/events.md");

    #[test]
    fn every_event_is_documented_with_its_version() {
        for event in AppEvent::ALL {
            let row = format!("| `{}` | {} |", event.name(), event.version());
            assert!(
                DOC.contains(&row),
                "docs/events.md lacks the row starting {row}"
            );
        }
    }

    #[test]
    fn events_are_only_emitted_through_the_contract() {
        let sources = [
            ("lib.rs", include_str!("lib.rs")),
            ("updates.rs", include_str!("updates.rs")),
            ("download_resume.rs", include_str!("download_resume.rs")),
            ("player_cache.rs", include_str!("player_cache.rs")),
            ("ipc/account.rs", include_str!("ipc/account.rs")),
            ("ipc/backup.rs", include_str!("ipc/backup.rs")),
            ("ipc/catalog.rs", include_str!("ipc/catalog.rs")),
            ("ipc/downloads.rs", include_str!("ipc/downloads.rs")),
            ("ipc/library.rs", include_str!("ipc/library.rs")),
            ("ipc/lyrics.rs", include_str!("ipc/lyrics.rs")),
            ("ipc/player.rs", include_str!("ipc/player.rs")),
            ("ipc/settings.rs", include_str!("ipc/settings.rs")),
            ("ipc/spotify.rs", include_str!("ipc/spotify.rs")),
            ("ipc/system.rs", include_str!("ipc/system.rs")),
        ];
        let raw = regex::Regex::new(r#"\.emit(?:_to|_filter)?\(\s*""#).unwrap();
        for (file, source) in sources {
            assert!(
                !raw.is_match(source),
                "{file} emits an event by string; use events::emit"
            );
        }
    }

    #[test]
    fn names_are_unique() {
        let names: std::collections::HashSet<_> =
            AppEvent::ALL.iter().map(|event| event.name()).collect();
        assert_eq!(names.len(), AppEvent::ALL.len());
    }
}
