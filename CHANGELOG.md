# Meld Desktop Changelog

All notable changes are listed here. Versions follow SemVer; `package.json` is the single version source (see `docs/plan/MASTER-PLAN.md` §7.1). Older releases used tag suffixes and asset names that did not match their version; each entry below states the real tag.

## [Unreleased]

### Added
- Settings → Storage → Playback cache: current size, a size limit and a Clear playback cache button.
- Meld opens on the page you were on when you closed it (an album, artist, playlist, library tab, search or history). Settings, dialogs and searches for a pasted link are not reopened.
- Undo after unliking a song, unpinning from Speed Dial, removing something from your library or a local playlist, unsubscribing from a podcast or artist and unsaving an episode.
- Messages now stack in the corner with their kind (info, success, warning, error). Errors stay until you close them and offer Retry where it helps; library sync and Spotify playlist downloads show their progress.
- Pasting a Spotify playlist link or a `meld:` link into search opens that page. Pasting a Spotify song, album or artist link explains that it cannot be opened directly and to search by name.

### Changed
- Security: Meld checks every id, token and text value the window sends to the app (length and allowed characters) before using it for a request or the database.
- Security: the Meld window may call only the app commands granted to it, grouped by area (Tauri app-command permissions). The Google and Spotify sign-in windows still get no access to Meld's commands.
- Meld asks before anything that cannot be undone: deleting an uploaded song, removing a song from YouTube Music history or a YouTube Music playlist, removing a download, clearing playback or search history, removing a Spotify playlist track. If the change fails, the screen goes back to how it was.
- Back and Forward return to the page you left, including an album, artist or playlist page, the tab it was opened from and the scroll position.
- Back and Forward show a search, album, artist or playlist page you visited in the last 10 minutes straight away, as you left it, instead of loading it again.
- Back and Forward also bring back the Library search text, sort order, grid/list layout, podcast filter and top-songs period, the History search, the filter and sort of a Spotify playlist, and the scroll position inside an album, artist or playlist page.
- Back and Escape close one layer at a time, topmost first: a dialog, then the menu, Settings, the lyrics, queue or expanded player, then an open page. Escape used to close Settings before a dialog opened from it.

### Fixed
- Error messages no longer show database text, file paths or web addresses from YouTube Music, Spotify or the lyrics providers; they say what failed.
- A song that is in a playlist, the queue or the history more than once can be selected one copy at a time; ticking one copy no longer ticks the other. Playing the second copy from your library or an album page starts at that copy.
- If one page or panel fails to display (for example after an unexpected answer from YouTube Music), only that part shows an error with Try again and Close. The rest of Meld keeps working and the song keeps playing.
- Opening a page while another one was still loading (or searching again before the first results arrived) could replace the new page with the old one when its answer came in late. Only the page you opened last is shown now.
- Pasting a YouTube Music playlist link (`music.youtube.com/playlist?list=…`) opened an empty album instead of the playlist, and an album's `/browse/` link was opened as an artist. Both now open the right page, and Back returns to the page you pasted the link on.
- **Offline downloads failed with "audio cache response failed: HTTP status client error (403 Forbidden)".** YouTube's media servers now serve only the first ~1 MB of stream links from the ANDROID_VR 1.65 client (the first one Meld tries) and refuse the rest. Playing could start and recover; downloading the whole file could not. Meld now checks every new stream link by reading a small piece past the first megabyte. A refused link is skipped straight away for another YouTube source, and that source is tried last for the next 30 minutes.
- Downloads send range requests the way the player does. If a link is refused during a download, Meld picks another source and continues from the bytes it already has (up to two retries). A partial file that no longer matches is restarted cleanly.
- A download or cache file that was cut short is no longer saved as complete. The partial file is kept, and the next try resumes from it.
- Download and cache errors no longer include the signed stream URL.
- A download that is resumed after a cancel, an error or an app restart is appended to only when YouTube sends the rest of the very same file. If the file changed (for example after switching Audio quality), the download starts again cleanly instead of joining two different streams into a broken file.
- The playback cache no longer grows without limit. Settings → Storage shows how much space it uses and lets you pick a limit (Off, 512 MB to 20 GB; default 2 GB). The songs played longest ago are removed first, and offline downloads are never touched. Half-written files left by a crash are cleaned up at start-up, except downloads that can still resume.
- Skipping quickly through songs no longer starts a full background download for every song. At most two background cache jobs exist at once. Skipping stops the previous song's job within a quarter of a second, and closing the app stops them all and removes their half-written files.

## [0.3.0] — Playback and search fixes, stronger YouTube fallbacks

**Update recommended for everyone on 0.2.0.** 0.2.0 users get this update inside the app (Settings → About, or the daily check); you can also run the setup EXE over 0.2.0. Your library, downloads and settings are kept.

### Fixed
- **"The native audio element could not read the resolved stream URL."** In 0.2.0 every song that had already been cached or downloaded failed to play (most of Liked Songs). The asset-protocol scope pointed at the wrong folder (`%APPDATA%\com.romany-osama.meld-desktop\…` instead of `%APPDATA%\Meld Desktop\…`). The scope now points at the real data folder, those folders are also granted when the app starts, and a CI test checks that the two always match.
- **Search missing songs.** YouTube Music changed its search page: the top result is now a card and the other results arrive as individual sections. 0.2.0 dropped the top result and could miss others; both layouts are now read in page order.
- If a stream or cached file fails, Meld no longer stops at an error. It drops the bad cached copy or marks that YouTube source as failed for five minutes, resolves again and continues from the same position (up to two retries), then shows a clear message.
- Streams close to expiry are refreshed a minute early, so resuming after a long pause doesn't hit a dead link.

### Added
- **More YouTube fallbacks, like Meld for Android.** When the direct-link clients (Android VR, visionOS, iOS) are refused, Meld now uses clients whose audio links are protected by YouTube's player signature and `n` parameter: YouTube Music web (with your account when signed in), TV and embedded players. The signature and `n` values are computed the same way YouTube's own web player does, using yt-dlp's EJS solver in a sandboxed QuickJS interpreter (no network, file or system access; memory and time limits). The player script is prepared in the background after start-up and cached on disk, so this fallback is fast. No DRM, ads or PoTokens are involved.
- Uploaded songs use your signed-in YouTube Music session first.
- Every stream request carries a playback nonce, and stream URLs are accepted only from HTTPS `*.googlevideo.com` hosts.
- Player menu → **Copy playback report**: a redacted list of the sources tried and why each failed (no links, cookies or e-mail addresses), for bug reports.
- Clearer errors: a failed song now lists each source tried with its reason (bot check, sign-in, age or region restriction, unavailable…).

### Changed
- Signing out also clears the resolver's memory of failed sources.
- Release metadata (SBOM, third-party notices) now includes the vendored yt-dlp EJS solver, meriyah and astring.

### Known limitations
- Releases are still not Authenticode-signed (Windows SmartScreen may warn); verify downloads with `SHA256SUMS.txt`.
- YouTube can still refuse every source for a song, for example with a bot check on some networks. Signing in usually helps.

## [0.2.0] — Reconciled security release (supersedes 0.1.8 for security)

0.2.0 merges the two diverged lines of development: everything users had in 0.1.8 (persistent session, offline Home, taskbar thumbnail buttons, lyrics provider picker, artist follow, podcast refresh, local recap, profile refresh, overlay layering) plus the security and reliability hardening that only existed on `main`. **Everyone on 0.1.8 should update.** 0.1.8 cannot update itself: run the 0.2.0 setup EXE over it (your library, downloads and settings are kept), or extract the portable ZIP over the old folder. From 0.2.0 on, updates are offered inside the app.

### Security
- Session secrets (Google cookie, Spotify access token, `sp_dc`, `sp_key`) are encrypted at rest with AES-256-GCM; the key lives in Windows Credential Manager. Existing 0.1.8 databases are migrated on first start and the database is vacuumed so no plaintext remains.
- A real Content Security Policy replaces `csp: null`; the asset protocol is limited to Meld's own folders, and local files are granted individually.
- Signing out also clears the WebView's sign-in data.
- Unused commands that let the WebView write an arbitrary Google cookie are no longer exposed.
- A second launch focuses the running window instead of starting another instance.

### Fixed
- Interrupted downloads are kept as resumable instead of stuck in "downloading"; network requests have timeouts and stalled downloads stop after 30 seconds without data.
- Expired stream URLs are re-resolved instead of failing or skipping; a newer play request always wins over an older one, and replaying the same song restarts it.
- Settings shows Audio quality once.
- Accessibility: keyboard focus outlines, `aria-pressed`/`aria-current`, minimum 12 px text and WCAG AA muted-text contrast.

### Added
- **Updates:** Settings → About shows the version and can check for, download and install signed updates (your library is backed up first). Meld Desktop also checks quietly once a day and tells you when an update is available. The portable version gets a link to the download page.
- Each release now ships `SHA256SUMS.txt`, a CycloneDX SBOM, `THIRD-PARTY-NOTICES.txt` and build provenance attestations.

### Changed
- Restoring a backup streams the library to disk and rejects oversized archives instead of reading them into memory.
- The portable ZIP now includes the taskbar button icons (missing from 0.1.8's ZIP), a `README-portable.txt` and the licence files.
- Version 0.2.0 everywhere (installer, About, Rust crate) from one source.
- Release binaries are no longer committed to the repository; they are published only as GitHub Release assets.
- Packaging: NSIS setup and portable ZIP only (no MSI).

## [0.1.8] — Overlay layering and window behavior

Tag `v0.1.8`, 2026-08-31. **Superseded by 0.2.0 for security** (plaintext session secrets, `csp: null`, broad asset scope).

Details and other player-related windows now appear above the full player when opened. Queue and action menus retain a higher layer, while the integrated lyrics panel remains inside the player. Closing a child window returns to the player without requiring the player to be closed first.

Spotify behavior is unchanged. This release includes the portable ZIP and NSIS setup EXE only; MSI is not included.

## [0.1.7] — Full player layout and NSIS-only release

Tag `v0.1.7`, 2026-08-31.

The full player now keeps the Share, Like, and More actions in the same horizontal row as the transport controls. The existing lyrics Provider selector and Back/Forward buttons are unchanged. Long titles remain one line with an ellipsis and the complete title is available on hover.

The lyrics viewport now uses the available space inside the right-hand player column instead of relying on a fixed content height. Its internal spacing is balanced so the active synchronized line is centered in the lyrics viewport as the player is resized, while the existing provider and navigation controls remain in their original arrangement.

Google profile refresh (first released in 0.1.6; there was never a 0.1.5 release) remains included: one authenticated profile check at startup with local fallback on network failure. Spotify behavior is unchanged. This release publishes the portable ZIP and NSIS setup EXE only; MSI is intentionally not built or uploaded.

## [0.1.6] — Player title layout, Google profile refresh, and MSI installer fix

Tag `v0.1.6`, 2026-08-29.

This release prevents long song titles from escaping the full-player card. The title is limited to two lines with a responsive ellipsis, while the complete title remains available through the normal hover tooltip. Artist metadata remains single-line and truncated inside its available space.

The Windows MSI packaging now embeds the WebView2 bootstrapper instead of depending on a hidden external bootstrapper download during installation. This keeps the standard MSI flow local and makes it less likely to appear stuck after pressing Install. The NSIS installer remains available as the alternative installer. The MSI still needs internet access if WebView2 itself must be obtained; a fully offline WebView2 installer would require bundling the much larger fixed runtime separately.

Google profile refresh is new in this release: one authenticated profile check at startup with local fallback on network failure. Spotify behavior, cross-service likes, Offline Home fallback, Downloads, Library, cached lyrics, artwork, and playback persistence are unchanged.

| Validation | Result |
|---|---|
| TypeScript and Vite production build | Passed |
| Windows Cargo check | Passed |
| Long-title layout guard | Two-line ellipsis plus full hover title |
| MSI WebView2 packaging | Embedded bootstrapper configured |
| Spotify behavior diff | Unchanged |
| Desktop-only source tree | No Android/Kotlin/Java artifacts |

### Included in 0.1.6: Google profile refresh (prepared as "0.1.5", never tagged or released)

This maintenance release adds a single authenticated Google / YouTube Music profile refresh during application startup. When a saved Google session exists, Meld Desktop performs one normal `account_menu` request, compares the returned account name, channel handle, email, and avatar with the locally saved values, and updates the local profile when they changed. If the request fails or the application is offline, the previous local profile remains available and startup continues normally.

The refresh is not repeated when opening Settings, does not run in a loop, does not create a new login session, and does not modify Spotify integration or cross-service like behavior. Offline Home fallback, Downloads, Library, cached lyrics, artwork, playback session persistence, and the verified Windows packaging from 0.1.4 remain included.

| Validation | Result |
|---|---|
| TypeScript and Vite production build | Passed |
| Windows Cargo check with locked dependencies | Passed |
| Google refresh fallback behavior | Local profile retained on request failure |
| Spotify source diff | No Spotify behavior changed |
| Desktop-only source tree | No Android/Kotlin/Java artifacts |

## [0.1.4] — Continuous session, Home cache, and verified Windows packaging

Tag `v0.1.4`, 2026-08-28. Published from the `feat/source-parity-next` branch, not `main`; that split is resolved in 0.2.0.

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

### Included in 0.1.4: continuous session and offline lyrics variants (previously listed as "Unreleased")

The next batch adds a real continuous playback session. When persistent queue is enabled, Meld Desktop stores the current queue, playlist/watch-next continuation context, selected item, playback position, and paused/playing state without storing an expired stream URL. On the next launch it resolves a fresh playable stream and resumes the same item at the saved position; a manually cleared queue remains cleared.

Connected Google / YouTube Music accounts now expose the account avatar returned by the validated account menu beside the account name. Home is refreshed after account connect/disconnect so personalized YouTube Music shelves such as recently played and keep-listening can be requested with the active account instead of leaving the anonymous Home response on screen.

Completed downloads now try every enabled lyrics provider in the configured order and cache each successful provider variant. The offline Provider selector can use those saved variants without a network connection, while the primary automatic lyrics result and the existing lyrics cache remain backward-compatible.


## [0.1.3] — Lyrics provider picker

Tag `v0.1.3-lyrics-provider-picker`, 2026-08-27. The release assets are named `meld-desktop-0.1.0-…` because the version number was not bumped at the time; they are the 0.1.3 build.

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
## [0.1.2] — Safe parity gap batch

Tag `v0.1.2-safe-gap-batch`, 2026-08-27. The release assets are named `meld-desktop-0.1.0-…` because the version number was not bumped at the time; they are the 0.1.2 build.

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

## Earlier 0.1.x releases without a separate entry

- **0.1.1** — tag `v0.1.1-ui-fixes`, 2026-08-27: search history only while the search box is focused and closes on outside click; full-player close button top-right. The raw EXE asset is named `0.1.0`.
- **0.1.0 (source parity)** — tag `v0.1.0-desktop-source-parity`, 2026-08-27: typed search, continuations, source-aware autoplay, Repeat One/All, auto-skip, range-resume downloads, audio quality, persisted volume, Spotify folders, Explore shortcuts. Raw EXE asset.
- **0.1.0** — tag `v0.1.0-desktop`, 2026-08-27: first Tauri 2 build.

The tags `v0.1.1` and `v0.2.0`–`v0.8.8` in this repository belong to the upstream Meld (Android) project history and are not Meld Desktop releases.
