# Event contract

Events the backend sends to the webview (S5-010, D-046). Emitted only through `src-tauri/src/events.rs`
(`events::emit` / `events::emit_error`); listened to only through `listenEvent` in `src/lib/events.ts`. Tests on
both sides fail when a name or version here, in `events.rs` and in `events.ts` disagree.

**Versioning:** each event has a payload version. An incompatible payload change bumps the version in all three
places in the same PR and is listed in the history below. Adding an optional field is compatible.

| Event | Version | Payload | Emitted by | Listened to by |
|---|---|---|---|---|
| `account-status` | 1 | `SessionStatus` `{ authenticated, accountName?, accountEmail?, accountChannelHandle?, accountAvatar? }` | Google sign-in window (`ipc/account.rs`) | `features/accounts/useAccounts.ts` |
| `account-status-error` | 2 | `IpcError` `{ code, message, retryable, detail? }` | Google sign-in window | `features/accounts/useAccounts.ts` |
| `spotify-status` | 1 | `SpotifySessionStatus` `{ authenticated, tokenExpiry? }` | Spotify sign-in window (`ipc/account.rs`) | `features/accounts/useAccounts.ts` |
| `spotify-status-error` | 2 | `IpcError` | Spotify sign-in window | `features/accounts/useAccounts.ts` |
| `download-state` | 1 | `DownloadInfo` `{ songId, path, bytes, totalBytes?, state, error?, lyricsCached, artworkPath? }` | download task (`lib.rs` `emit_download`) | `features/downloads/useDownloads.ts` |
| `app-update-progress` | 1 | `UpdateProgress` `{ downloaded, total? }` | `updates.rs` `app_update_install` | `UpdatePanel.tsx` |

## Plugin events

Emitted by `tauri-plugin-taskbar` (its default event names), not by Meld code. They carry no payload.

| Event | Version | Payload | Emitted by | Listened to by |
|---|---|---|---|---|
| `media-prev` | 1 | none | taskbar thumbnail button | `App.tsx` |
| `media-toggle` | 1 | none | taskbar thumbnail button | `App.tsx` |
| `media-next` | 1 | none | taskbar thumbnail button | `App.tsx` |

## History

- `account-status-error` and `spotify-status-error` v2: the payload is an `IpcError` object instead of a raw string
  (S5-007/S5-010).
