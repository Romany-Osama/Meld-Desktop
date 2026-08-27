# Meld Desktop Changelog

## [0.1.2] — Safe parity gap batch

This release adds the safe, source-backed parity work completed after the Windows taskbar/volume batch. Artist details now have a real Follow/Following action backed by local SQLite state and authenticated YouTube Music subscription/unsubscription requests when a valid channel ID is available. Followed artists remain visible in the Artists library even without locally saved song mappings.

Saved Podcasts now include **Refresh saved** in the library and Refresh inside podcast details. Refresh re-fetches bookmarked shows through the existing authenticated YouTube Music browse contract and persists returned detail JSON and metadata. Stats now include a clearly labeled device-only **Local listening recap**, calculated from actual Meld Desktop history with plays, minutes, unique songs, top song, and top artist; it is not presented as remote Wrapped.

The release retains the previous native Windows work: taskbar thumbnail Previous/Play-Pause/Next controls and mouse-wheel volume adjustment over the mini and full player volume controls. The recovered dark blue-black Meld layout is preserved; no broad UI redesign was introduced in this batch.

| Validation | Result |
|---|---|
| TypeScript no-emit and Vite production build | Passed |
| Cargo check and Rust tests | Passed; 23/23 tests |
| Linux Tauri no-bundle | Passed |
| Windows npm/Cargo/Tauri gates | Passed |
| Windows portable startup smoke | Passed; 12 seconds, zero TCP listeners, clean close |

Extract `meld-desktop-0.1.0-gap-batch-portable.zip` as a complete folder. Keep `meld-desktop-0.1.0-gap-batch.exe` beside `icons/taskbar/*.ico`; those resources are required for the taskbar thumbnail toolbar. This is a portable package, not an installer.

The remaining source gaps are not hidden or replaced with fake controls. Last.fm needs a user-authorized session and API signing; Discord Rich Presence needs a registered application/client ID and IPC/SDK lifecycle; Listen Together needs synchronization/signaling infrastructure; Qobuz needs an authorized catalog/playback contract; Google Cast needs a receiver/session/content contract; and the Tauri updater needs project-owned signing keys and an HTTPS update endpoint. ShazamKit recognition is Apple-specific, while Android Auto, Android notifications, Android audio focus, and Android offload have no 1:1 Windows runtime.

Equalizer/DSP, crossfade, skip silence, and loudness normalization require a tested Windows audio graph that preserves direct playback, local files, seeking, queue transitions, and error recovery, so they are not exposed as inert switches. Remote Wrapped and source-identical recognition remain separate contracts; the included recap is explicitly local.

Protected or transformed YouTube stream handling—including PoToken/BotGuard extraction, signatureCipher/n-transform resolution, SABR playback, DRM/Widevine, ad bypass, ripping, browser playback, and localhost playback—is intentionally outside this port. Meld Desktop does not insert advertisements or promise behavior controlled by the upstream service.

## Unreleased next change — Lyrics provider picker

The Lyrics window and Full Player now include a real Provider selector. Automatic keeps the configured provider order and normal cache behavior. Choosing a provider explicitly calls that provider, replaces the current cached lyrics with its result, and reports a truthful provider-specific error if it returns no match. Selecting Automatic again refreshes the configured order instead of remaining stuck on the manually selected cached result. The existing provider enable/disable and ordering settings remain unchanged.
