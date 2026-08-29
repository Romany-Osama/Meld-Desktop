# Meld Desktop Changelog

## [0.1.6] — Player title layout and MSI installer fix

This release prevents long song titles from escaping the full-player card. The title is limited to two lines with a responsive ellipsis, while the complete title remains available through the normal hover tooltip. Artist metadata remains single-line and truncated inside its available space.

The Windows MSI packaging now embeds the WebView2 bootstrapper instead of depending on a hidden external bootstrapper download during installation. This keeps the standard MSI flow local and makes it less likely to appear stuck after pressing Install. The NSIS installer remains available as the alternative installer. The MSI still needs internet access if WebView2 itself must be obtained; a fully offline WebView2 installer would require bundling the much larger fixed runtime separately.

Google profile refresh from v0.1.5 remains included: one authenticated profile check at startup with local fallback on network failure. Spotify behavior, cross-service likes, Offline Home fallback, Downloads, Library, cached lyrics, artwork, and playback persistence are unchanged.

| Validation | Result |
|---|---|
| TypeScript and Vite production build | Passed |
| Windows Cargo check | Passed |
| Long-title layout guard | Two-line ellipsis plus full hover title |
| MSI WebView2 packaging | Embedded bootstrapper configured |
| Spotify behavior diff | Unchanged |
| Desktop-only source tree | No Android/Kotlin/Java artifacts |

## [0.1.5] — Google profile refresh

This maintenance release adds a single authenticated Google / YouTube Music profile refresh during application startup. When a saved Google session exists, Meld Desktop performs one normal `account_menu` request, compares the returned account name, channel handle, email, and avatar with the locally saved values, and updates the local profile when they changed. If the request fails or the application is offline, the previous local profile remains available and startup continues normally.

The refresh is not repeated when opening Settings, does not run in a loop, does not create a new login session, and does not modify Spotify integration or cross-service like behavior. Offline Home fallback, Downloads, Library, cached lyrics, artwork, playback session persistence, and the verified Windows packaging from v0.1.4 remain included.

| Validation | Result |
|---|---|
| TypeScript and Vite production build | Passed |
| Windows Cargo check with locked dependencies | Passed |
| Google refresh fallback behavior | Local profile retained on request failure |
| Spotify source diff | No Spotify behavior changed |
| Desktop-only source tree | No Android/Kotlin/Java artifacts |

## [0.1.4] — Continuous session, Home cache, and verified Windows packaging

This release adds continuous playback session persistence across restarts, including queue, playlist context, selected item, playback position, and play/pause state without persisting expired stream URLs. Connected Google / YouTube Music accounts now refresh Home after login/logout and display the returned account avatar.

Home now stores the last successful response in the local SQLite database and falls back to that cached preview when the network is unavailable. Downloads, Library, local playlists, downloaded artwork, cached lyrics, and local playback remain available without an initial internet connection; online search, recommendations, radio, and fetching new lyrics still require connectivity.

The Windows build was rebuilt as version 0.1.4. Portable, NSIS setup, and MSI artifacts are provided. The Meld Desktop application icon is embedded in the executable, and the six taskbar thumbnail toolbar resources are included beside the portable executable.

| Validation | Result |
|---|---|
| TypeScript and Vite production build | Passed |
| Windows Tauri build | Passed |
| Windows EXE associated-icon extraction | Passed; Meld logo present |
| Portable taskbar resources | Passed; 6 resources present |
| NSIS setup and MSI generation | Passed |

## Unreleased — Continuous session and offline lyrics variants

The next batch adds a real continuous playback session. When persistent queue is enabled, Meld Desktop stores the current queue, playlist/watch-next continuation context, selected item, playback position, and paused/playing state without storing an expired stream URL. On the next launch it resolves a fresh playable stream and resumes the same item at the saved position; a manually cleared queue remains cleared.

Connected Google / YouTube Music accounts now expose the account avatar returned by the validated account menu beside the account name. Home is refreshed after account connect/disconnect so personalized YouTube Music shelves such as recently played and keep-listening can be requested with the active account instead of leaving the anonymous Home response on screen.

Completed downloads now try every enabled lyrics provider in the configured order and cache each successful provider variant. The offline Provider selector can use those saved variants without a network connection, while the primary automatic lyrics result and the existing lyrics cache remain backward-compatible.


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

## [0.1.3] — Lyrics provider picker

The Lyrics window and Full Player now include a real Provider selector. Automatic keeps the configured provider order and normal cache behavior. Choosing a provider explicitly calls that provider, replaces the current cached lyrics with its result, and reports a truthful provider-specific error if it returns no match. Selecting Automatic again refreshes the configured order instead of remaining stuck on the manually selected cached result. The existing provider enable/disable and ordering settings remain unchanged.

Some songs may not have lyrics published by any of the available providers. In that case Meld Desktop reports that no selected source returned a match; this is source availability rather than an application defect, and no invented or unrelated lyrics are shown.

| Validation | Result |
|---|---|
| TypeScript no-emit and Vite production build | Passed |
| Cargo check and Rust tests | Passed; 23/23 tests |
| Linux production gates | Passed |
| Windows release Cargo check/test and Tauri build | Passed |
| Windows portable startup smoke | Passed; 12 seconds, zero TCP listeners, clean close |

The Windows candidate is `meld-desktop-0.1.0-lyrics-provider-selector.exe`, size `21,036,032` bytes, SHA-256 `A39F73B08276914BD568DABC230ED9FF6B3D0FA26CFF61254CCB7598947619D2`. Keep the adjacent `icons/taskbar/*.ico` folder when moving the executable.
