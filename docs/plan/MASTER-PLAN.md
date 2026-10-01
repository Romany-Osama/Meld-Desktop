# Meld Desktop — MASTER WORK PLAN (Part 7, final, self-contained)
## Consolidated, deduplicated, prioritized, dependency-ordered implementation plan for a 1:1 Windows port of Meld

> **This file is the single source of truth for building Meld Desktop.** It contains everything needed to start coding in a brand-new chat with no other context. It contains, in order: (1) operating instructions for the agent, (2) verified project facts, (3) the release-by-release audit, (4) the target architecture, (5) the branch reconciliation procedure, (6) the full phased roadmap with every task ID, (7) the release/installer/updater/uninstaller procedure, (8) the definition of done, (9) a complete index of all **1018** tracked tasks, and (10) verbatim appendices of the six detailed plan parts and the technical review, so no detail is lost.

---

# 0. Instructions for the agent who picks this up (read first)

## 0.1 How to start in a new chat

1. Read sections 0 to 8 fully. Use section 9 (index) to find any task. Use the appendices (A–G) for the full finding, evidence, fix, and done criteria of each task ID.
2. Ask the user for a GitHub **fine-grained personal access token** through a *secure input prompt* (never in plain chat), scoped to `Romany-Osama/Meld-Desktop` only, with **Contents: read/write**, **Pull requests: read/write**, **Workflows: read/write**, **Actions: read/write**, and **Metadata: read**. Never print it, write it to a committed file, put it in a remote URL that gets logged, or store it in the repository. Use it only through an environment variable/credential helper for the current session (e.g. `git -c credential.helper= -c "http.extraheader=AUTHORIZATION: bearer $GH_TOKEN"` or `gh auth login --with-token`). If a token was ever pasted into chat, tell the user to revoke it.
3. Clone the repositories (section 1.1), then run the **Phase 0** procedure in section 5 *exactly*. Do not start feature work before Phase 0 exit criteria pass.
4. Work phase by phase, milestone by milestone, in the order of section 6. Within a milestone, do P0 → P1 → P2, and respect the listed dependencies.
5. Track progress inside the repository in `docs/plan/PROGRESS.md` (a ready-made `PROGRESS.md` with one checkbox per task ID, grouped by phase and milestone, is delivered alongside this file; otherwise generate it from section 9). Tick a task only when its **Done when** criterion (appendix) is met and tests exist. Commit `PROGRESS.md` with the change that completes the task.
6. Copy this master file into the repo as `docs/plan/MASTER-PLAN.md` in Phase 0 so future sessions can read it from the repo.
7. At the end of each work session: push the branch, update `PROGRESS.md`, and write a short `docs/plan/SESSION-LOG.md` entry (date, tasks done, tasks in progress, blockers, next task ID). A new chat resumes from the last `SESSION-LOG.md` entry plus `PROGRESS.md`.

## 0.2 Non-negotiable rules

- **No DRM circumvention, no ad bypass, no PoToken farming/abuse, no ripping protected content, no paywall bypass.** A robust *legal* client fallback/resolution layer is in scope (same as reference Meld); circumvention is not. Qobuz only with an authorized contract and clear risk disclosure.
- **GPL-3.0-only.** Keep attribution to Meld/Metrolist, `LICENSE`, `NOTICE`; ship third-party license notices with every release.
- **Never fake parity.** A control appears in the UI only when its behaviour is real and tested. Missing features are omitted, not stubbed.
- **Never regress a shipped v0.1.8 feature silently.** Every removal needs an explicit decision recorded in `docs/plan/DECISIONS.md`.
- **Never store or log secrets in plaintext** (cookies, tokens, `sp_dc`, emails in logs, signed stream URLs).
- **Every behaviour change ships with tests.** Every PR passes CI (section 7.2).
- **Small PRs.** One milestone may be several PRs; each PR references task IDs in its title, e.g. `feat(playback): PLAY-027 media protocol [PLAY-027, PLAY-034]`.
- **Conventional commits** (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `ci:`, `perf:`, `security:`), each referencing task IDs.
- **Windows 10 22H2+ and Windows 11 x64** are the supported targets. ARM64 is a later optional target.
- The reference Android app is a **behavioural baseline**, not code to copy blindly; port behaviour, then improve where this plan says so.

## 0.3 Tooling the agent needs

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 22.x LTS (repo `.nvmrc` = `22`; engines `^20.19.0 \|\| >=22.12.0`) | frontend build |
| npm | bundled | `npm ci` |
| Rust | stable ≥ 1.89 (MSRV declared in `Cargo.toml`) with `rustfmt`, `clippy` | backend |
| Tauri CLI | `@tauri-apps/cli@^2` (devDependency) | dev/build/bundle |
| Windows SDK + MSVC Build Tools 2022 | latest | Windows builds |
| WebView2 Runtime | evergreen | runtime |
| NSIS | via Tauri bundler | installer/uninstaller |
| `cargo-audit`, `cargo-deny`, `cargo-llvm-cov`, `cargo-nextest` | latest | CI gates |
| `gh` CLI | latest | releases/PRs |

If the sandbox lacks Rust or Windows, do all builds/tests in **GitHub Actions on `windows-latest`** (section 7.2) and iterate through CI. Linux CI can run `cargo check/test/clippy` for non-Windows modules; Windows-only modules are behind `#[cfg(windows)]`.

---

# 1. Verified project facts (as of review date 2026-10-01)

## 1.1 Repositories and revisions

| Item | Value |
|---|---|
| Desktop repo | `https://github.com/Romany-Osama/Meld-Desktop` |
| Desktop default branch `main` HEAD | `e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac` ("Merge pull request #13: recover from expired stream URLs") |
| Desktop latest release | `v0.1.8` = `5f1aaf534da8954eec4eeb7608bc37452114987e` ("release: publish Meld Desktop v0.1.8"), cut from branch `feat/source-parity-next` |
| Merge base of `main` and `v0.1.8` | `d56350a0316e4d3ef1132ca641ff695aa1b48c6f` (2026-08-27, "feat: align navigation and Spotify downloads") |
| Is `v0.1.8` an ancestor of `main`? | **No** (verified with `git merge-base --is-ancestor`) |
| Commits on `main` only (since merge base, non-merge) | 15 (listed in 5.2) |
| Commits on `v0.1.8` line only | 62 (listed in 5.3) |
| Reference repo | `https://github.com/FrancescoGrazioso/Meld` |
| Reference release audited | `v0.9.2` = `dc7a27224acee33fa475ab70e1935dc03d3ef4ef` |
| Reference tree used for UI/code review | `5cf51c8cd5a0a68ba071b0026c0be731b506f8a1` |
| Reference base | Metrolist v13.7.0 core (Kotlin/Android, Media3/ExoPlayer, InnerTubeX) |
| License | GPL-3.0-only (both) |

## 1.2 Desktop stack and size

| Item | `main` | `v0.1.8` |
|---|---|---|
| App version in `tauri.conf.json`/`Cargo.toml`/`package.json` | **0.1.0 (wrong)** | 0.1.8 |
| Frontend | React 19.1, TypeScript ~5.8, Vite 7, `@tauri-apps/api` 2 | same |
| `src/App.tsx` | 208,297 bytes, single component, 109 `useState`, ~15 `useEffect` | 237,772 bytes |
| `src/App.css` | 44,783 bytes, dark-only | — |
| Backend | Tauri 2, Rust 2021, MSRV 1.89, `reqwest` (rustls), `tokio`, `rusqlite` 0.32 bundled, `lofty`, `rfd`, `zip` 2, `aes-gcm`, `keyring` 3 (windows-native), `tauri-plugin-single-instance` 2 | Tauri 2, `tauri-plugin-taskbar` 0.1.0, `webview2-com` 0.38.2, `windows-core` 0.61, `urlencoding` |
| `src-tauri/src/lib.rs` | 307,086 bytes (~4,544 lines): schema, migrations, InnerTube, parsers, player resolver, cache, downloads, lyrics, Spotify, auth windows, backup, settings, commands, tests | 315,465 bytes |
| `src-tauri/src/secrets.rs` | AES-256-GCM sealed settings; key in Windows Credential Manager | absent (plaintext secrets) |
| Registered IPC commands | 87 (9 not called by UI) | 101 |
| Rust tests | 36 (28 `lib.rs`, 8 `secrets.rs`) | 24 (release notes claimed 23) |
| Frontend tests | 0 | 0 |
| CI workflows | none | none |
| Production bundle | one JS chunk 337 KB (91 KB gzip), CSS 38 KB | — |
| CSP | strict-ish (see Part 5) | `null` |
| Asset-protocol scope | `$APPDATA/Meld Desktop/{downloads,player-cache,artwork}/**` + per-file grants | `$HOME/**`, `$APPDATA/**`, `$DOCUMENT/**`, `$DOWNLOAD/**`, `$MUSIC/**`, `$DESKTOP/**` |
| Bundle | `targets: "all"`, no WebView2 install mode | `targets: ["nsis"]`, `webviewInstallMode: embedBootstrapper (silent)`, taskbar `.ico` resources |
| Data location | `%APPDATA%\Meld Desktop\` (DB `song.db`, `downloads/`, `player-cache/`, `artwork/`) — falls back to `.` if `APPDATA` missing | same |
| Identifier | `com.romany-osama.meld-desktop` | same |

## 1.3 IPC commands present in v0.1.8 but missing from `main` (must be restored or explicitly retired)

`account_refresh_profile`, `account_save_session`, `clear_guest_session`, `fetch_lyrics_fresh`, `fetch_lyrics_from_provider`, `history_record_playtime`, `library_artist_state`, `library_toggle_artist_bookmarked`, `spotify_search_tracks` (kept as dead code on main), `ytm_browse`, `ytm_browse_continuation`, `ytm_podcast_cache_detail_page`, `ytm_podcast_episodes` (dead code on main), `ytm_refresh_saved_podcasts`.

Registered on `main` but unused by the UI (remove or gate): `library_songs`, `library_liked_songs`, `library_playlists`, `library_uploaded_songs`, `library_local_files`, `library_downloads`, `library_player_cache`, `library_saved_podcasts`, `ytm_podcast_channels`.

## 1.4 Persisted settings

- **Removed on `main` vs v0.1.8 (restore):** `audioQuality`, `equalizerEnabled`, `equalizerLow`, `equalizerMid`, `equalizerHigh`, `pauseOnMute`, `persistentQueue`, `playerVolume`, `seekExtraSeconds`, `varispeed`.
- **Added on `main`:** `sidebarCollapsed`.
- **Current `main` allowlist:** `autoDownloadOnLike`, `autoLoadMore`, `autoSkipNextOnError`, `disableLoadMoreWhenRepeatAll`, `enableBetterLyrics`, `enableKugou`, `enableLrclib`, `enableLyricsPlus`, `enableMusixmatch`, `enablePaxsenix`, `hideExplicit`, `hideVideoSongs`, `lyricsProviderOrder`, `pauseListenHistory`, `pauseSearchHistory`, `persistentShuffleAcrossQueues`, `preventDuplicateTracksInQueue`, `rememberShuffleAndRepeat`, `repeatMode`, `shuffleMode`, `shufflePlaylistFirst`, `sidebarCollapsed`, `similarContent`, `sleepTimerDefault`, `useLoginForBrowse`, `ytmSync`.
- **Secret/session keys (never in backups/IPC):** `cookie`, `dataSyncId`, `visitorData`, `accountName`, `accountEmail`, `accountChannelHandle`, `spotifySpDc`, `spotifySpKey`, `spotifyAccessToken`, `spotifyTokenExpiry`, `spotifyUsername`, `spotifyUserId`. Sealed on `main`: `cookie`, `spotifyAccessToken`; `spotifySpDc`/`spotifySpKey` are deleted at startup (so Spotify cannot refresh — see S5 items).

## 1.5 Database tables (main `SCHEMA_SQL`)

`songs`, `playlists`, `playlist_songs`, `history`, `search_history` (unique index on `query`), `lyrics`, `settings`, `spotify_match` (index on `youtube_id`), `downloads`, `player_cache`, `podcasts`, `speed_dial`, `albums`, `artists`, `song_albums`, `song_artists`. Columns added by ~20 unchecked `ALTER TABLE ... ADD COLUMN` statements whose errors are ignored. No `user_version`, no WAL, no `busy_timeout`.

## 1.6 Other repository facts

- Remote branches on the Desktop repo include `development`, `feat/source-parity-next`, `feature/remote-gql-hash-sync` (unmerged remote Spotify hash sync), `fix/android-auto-spotify-playlists`, `fix/issue-cleanup-batch`, `fix/liked-order-and-stop-on-task-clear`, `gh-pages`.
- v0.1.8 tracks release binaries in Git under `release/` (`Meld-Desktop-0.1.8-portable.zip`, `Meld-Desktop-0.1.8-x64-setup.exe`, `SHA256SUMS-v0.1.8.txt`) — must stop.
- GitHub Issues are disabled on the Desktop repo (`has_issues: false`).
- Spotify GraphQL hashes are compiled in from `src-tauri/resources/spotify-gql-hashes.json`.
- Spotify login: in-app WebView at `accounts.spotify.com`, reads `sp_dc`/`sp_key` cookies, gets token via TOTP/server-time chain. Google login: in-app WebView at `accounts.google.com` → `music.youtube.com`, reads `yt.config_` `VISITOR_DATA`/`DATASYNC_ID` and all cookies.


---

# 2. Release-by-release parity audit

## 2.1 Meld Desktop releases (9) — what each shipped, what is wrong, required action

| Release | Date | Assets | What it shipped | Problems found | Required action |
|---|---|---|---|---|---|
| `v0.1.0-desktop` | 2026-08-27 | portable EXE, NSIS setup, MSI, SHA256SUMS | First Tauri 2 build: YTM home/search/browse, playlists, library, local playlists, queue, lyrics, history, stats, downloads, player cache, Spotify library/playlists/liked, podcasts entry, settings, backup/restore, back/forward, shortcuts | Broad surface without automated evidence; auth/download later needed hardening; direct-URL-only playback | Covered by Phase 0–4 |
| `v0.1.0-desktop-source-parity` | 2026-08-27 | raw EXE + sha256 | "Source parity": typed search, continuation, source-aware autoplay, Repeat One/All, auto-skip, Range-resume downloads, AudioQuality auto/high/low, persisted volume, Spotify folders, Explore/Charts/Moods/New Releases shortcuts | "Parity" overstated; artifact named 0.1.0; raw EXE without installer | Version naming policy (Phase 0), honest README |
| `v0.1.1-ui-fixes` | 2026-08-27 | raw EXE named `0.1.0` | Search history only while focused, closes on outside click, own max-height; full-player close top-right | Version provenance unclear | Keep behaviour (U4 search items); version policy |
| `v0.1.2-safe-gap-batch` | 2026-08-27 | portable ZIP named `0.1.0` | Artist Follow/Following (local + YTM subscribe), artists visible without songs, podcast "Refresh saved", podcast detail refresh, local listening recap, **taskbar thumbnail Prev/Play-Pause/Next**, mouse-wheel volume | "Safe" contradicted by plaintext secrets/CSP null; taskbar icons depend on loose `icons/taskbar` folder | Restore follow + podcast refresh + recap + taskbar (Phase 0 M0.2), embed icons as resources |
| `v0.1.3-lyrics-provider-picker` | 2026-08-27 | portable ZIP named `0.1.0` | Provider picker in Lyrics & Full Player (Automatic, BetterLyrics, Paxsenix, LrcLib, KuGou, LyricsPlus, Musixmatch, YouTube Subtitle, YouTube), manual provider replaces cache, explicit no-match | Upstream removed Musixmatch for wrong matches | Restore picker (`fetch_lyrics_from_provider`, `fetch_lyrics_fresh`); Musixmatch default-off/remove per reference |
| `v0.1.4` | 2026-08-28 | portable ZIP, NSIS, MSI, source zip, SHA256SUMS | Persistent session (queue, context, track, position, play state; no expired URLs), Home refresh on account change + avatar, offline Home cache, offline downloads/library/lyrics/artwork | Published from `feat/source-parity-next`, not `main` → branch split | Restore persistent session + offline Home (Phase 0); reconcile branches |
| `v0.1.6` | 2026-08-29 | NSIS, MSI, portable, notes | Full-player title 2-line clamp + tooltip; one startup Google profile refresh (`account_refresh_profile`) with offline fallback | MSI "for testing" without support policy | Restore profile refresh; decide MSI policy (this plan: **no MSI**; NSIS + portable only) |
| `v0.1.7` | 2026-08-31 | NSIS, portable, source zip, SHA256SUMS | Single responsive full-player control row, 1-line title, lyrics viewport uses column space | Notes reference non-existent v0.1.5 | Fix changelog history in `CHANGELOG.md` |
| `v0.1.8` | 2026-08-31 | portable ZIP, NSIS, SHA256SUMS | Overlay layering fixes (details above player, lyrics inside player) | Ships the insecure line (plaintext secrets, CSP null, broad asset scope, unbounded restore, no timeouts) | Supersede with security release from reconciled branch |

## 2.2 Reference Meld releases (17) — feature → Desktop status → task IDs

Status columns: **main** / **v0.1.8**: Yes / Partial / No / N/A (Android-only; Windows equivalent required). "Tasks" lists the plan IDs that implement it; `FEAT-xxx` IDs are new tasks created by this audit for items not covered elsewhere (full text in section 6, Phase 9).

| Ref release | Feature | main | v0.1.8 | Tasks |
|---|---|---|---|---|
| 0.9.2 | InnerTubeX-style client selection/fallback (fewer 'Playback failed', faster start) | Partial | Partial | PLAY-002, PLAY-003, PLAY-004, PLAY-005, PLAY-030, PLAY-088 |
| 0.9.2 | Songs no longer stop after ~30 s | Partial | No | PLAY-029, PLAY-031, PLAY-066, PLAY-070, PLAY-087, PLAY-089, MATCH-028, TEST-007 (+12 more) |
| 0.9.2 | Uploaded and restricted tracks play | No | No | PLAY-002, PLAY-004, PLAY-006, PLAY-007, PLAY-008, PLAY-014, PLAY-015, PLAY-017 (+75 more) |
| 0.9.2 | Improved crossfade | No | No | PLAY-039, PLAY-081, PLAY-085, U4-199, R6-028 |
| 0.9.2 | Shuffle never repeats the same song twice in a row | Partial | Partial | PLAY-081, QUEUE-018, QUEUE-030, QUEUE-031, QUEUE-032, QUEUE-033, QUEUE-034, QUEUE-039 (+15 more) |
| 0.9.2 | Full podcasts: channels, new episodes, subscriptions | Partial | Partial | PLAY-007, PLAY-008, PLAY-077, PLAY-078, PLAY-082, PLAY-085, D3-012, D3-066 (+8 more) |
| 0.9.2 | Save/restore podcast episode position | No | No | PLAY-078 |
| 0.9.2 | Podcasts without login (guest) | No | Partial | FEAT-001 |
| 0.9.2 | Sleep timer: finish current song, gradual fade-out | Partial | Partial | PLAY-080, U4-230, S5-084, R6-086 |
| 0.9.2 | New lyrics pipeline; line-synced lyrics from YouTube Music | Partial | Partial | U4-204, S5-058, S5-062, R6-038 |
| 0.9.2 | Copy all lyrics | Partial | Partial | U4-149, U4-157 |
| 0.9.2 | Musixmatch removed (wrong lyrics) | No | No | FEAT-002 |
| 0.9.2 | Play from URL pasted in search | Partial | Partial | SEARCH-010, TEST-008, U4-059 |
| 0.9.2 | Search user profiles | No | No | FEAT-003 |
| 0.9.2 | Playlist range selection | No | No | U4-090 |
| 0.9.2 | Highlight songs already in playlist when adding | No | No | D3-075, U4-131 |
| 0.9.2 | No ghost adds on playlists | Partial | Partial | D3-034, R6-016 |
| 0.9.2 | Android Auto: reorderable sections, toggles, quick-add (Windows equivalent: customizable Home sections / SMTC / jump list) | N/A | N/A | S5-081 |
| 0.9.2 | Stats: compare top artists, weekly/monthly recap playlists, play all from stats | No | Partial | QUEUE-004, D3-133, D3-134, U4-001, U4-016, U4-077, U4-267, R6-001 (+2 more) |
| 0.9.2 | Redesigned song details, Last.fm/account settings screens | No | No | FEAT-004 |
| 0.9.2 | Mini-player background styles, playlist button | No | No | FEAT-005 |
| 0.9.2 | Speed dial layout on large screens | Partial | Partial | U4-046 |
| 0.9.2 | Export playlists/albums as CSV and M3U; CSV import fixed | No | No | QUEUE-045, D3-083, D3-084, D3-085, D3-134, U4-081, U4-272 |
| 0.9.2 | Discord integration refresh | No | No | U4-215, U4-269 |
| 0.9.2 | Image cache clears properly; cached covers offline | Partial | Partial | PLAY-017, PLAY-031, PLAY-033, PLAY-035, PLAY-040, PLAY-066, PLAY-067, PLAY-080 (+39 more) |
| 0.9.2 | Music recognition quick tile (Windows: global hotkey/tray action) | No | No | D3-133, U4-045, U4-207, U4-262 |
| 0.9.2 | Database migration preserves library/history/playlists | Partial | Partial | PLAY-069, QUEUE-006, D3-001, D3-002, D3-003, D3-004, D3-005, D3-006 (+16 more) |
| 0.9.2 | 40+ language translations | No | No | SPOT-009, U4-151, U4-205, U4-209, U4-217, U4-259, U4-260, U4-270 |
| 0.8.9 | Spotify login works with new login page | Yes | Yes | S5-005, S5-025, S5-098, S5-099 |
| 0.8.8 | Explicit/age-restricted via signed-in identity; downloads fixed; real failure reasons | Partial | Partial | PLAY-006, PLAY-015, D3-038, S5-007, R6-055 |
| 0.8.1 | Fast start: don't wait for radio queue building | Partial | Partial | PLAY-016 |
| 0.8.1 | Fast shuffle of large playlists/Liked | Partial | Partial | TEST-013 |
| 0.8.1 | Smarter image loading on Home | No | No | MATCH-020, U4-080, U4-100, U4-125, U4-126, U4-304, S5-079, R6-035 |
| 0.8.1 | Logout fully clears data; account switch shows right library | Partial | No | UI-003, TEST-007, D3-068, D3-069, S5-025, S5-026 |
| 0.8.1 | Stop music when app closed (Windows: close/minimize-to-tray policy) | Partial | Partial | S5-080 |
| 0.8.1 | Spotify Liked Songs in correct order | Partial | Partial | QUEUE-010, QUEUE-014, QUEUE-033 |
| 0.8.1 | Like from notification without download (Windows: SMTC/toast like action) | No | No | PLAY-079, S5-078, S5-082 |
| 0.8.1 | No volume jump when another app plays (Windows: audio session/ducking) | No | No | PLAY-080 |
| 0.8.1 | Synced scrolling lyrics for YouTube-sourced songs | Partial | Partial | FEAT-006 |
| 0.7.2 | Experimental Qobuz backend | No | No | PLAY-061, PLAY-085, MATCH-017 |
| 0.7.2 | Spotify: queue handling, Liked Songs, playlist pagination | Partial | Partial | QUEUE-002, QUEUE-004, MATCH-002, MATCH-003, QUEUE-009, QUEUE-010, QUEUE-013, QUEUE-015 (+8 more) |
| 0.7.2 | High-res artwork + thumbnail fallback chain | Partial | Partial | FEAT-007 |
| 0.7.2 | Complex-script lyrics rendering | Partial | Partial | MATCH-026, SPOT-011, U4-259, U4-325, S5-062 |
| 0.7.2 | Toggles to hide Recognize Music / Play Random on Home | No | No | HOME-014 |
| 0.7.2 | Suppress benign crash reports; reliable queue persistence | Partial | Partial | QUEUE-001, QUEUE-006, MATCH-003, QUEUE-039, QUEUE-040, UI-005, D3-099, D3-161 (+5 more) |
| 0.7.1 | SponsorBlock (opt-in, categories, toast, privacy hash prefix) | No | No | FEAT-008 |
| 0.7.1 | Spotify-powered Home | No | No | HOME-001, HOME-007, TEST-007, U4-044, U4-266 |
| 0.7.1 | Spotify albums playable | No | No | SEARCH-003, SPOT-013, U4-059 |
| 0.7.1 | Spotify library folders | Yes | Yes | SPOT-007, SPOT-014, UI-003, TEST-013, D3-111, D3-123, U4-082, S5-037 (+5 more) |
| 0.7.1 | All Spotify playlists load | Partial | Partial | MATCH-024, SPOT-007 |
| 0.7.1 | Liked Songs sync from Spotify | Partial | Partial | QUEUE-004, MATCH-026, QUEUE-010, SPOT-011, D3-019, D3-056, R6-006 |
| 0.7.1 | Parallel Spotify→YouTube matching with in-memory cache | Partial | Partial | PLAY-041, MATCH-004, MATCH-024, QUEUE-009, QUEUE-010, QUEUE-012, RADIO-013, SPOT-013 (+5 more) |
| 0.7.1 | Lyrics: auto-scroll resumes after manual scroll; late lyrics sync to position; tap line seeks | Partial | Partial | U4-152, U4-153, R6-038 |
| 0.7.1 | Crash reporting via GitHub Issues | No | No | PLAY-004, PLAY-006, PLAY-017, PLAY-037, PLAY-058, PLAY-063, PLAY-086, MATCH-019 (+15 more) |
| 0.7.1 | Auto-updating Spotify GraphQL hashes | No | No | PLAY-059, MATCH-006, MATCH-022, QUEUE-029, SPOT-003, SPOT-004, SPOT-006, TEST-009 (+4 more) |
| 0.6.6 | Intelligent pre-caching next N tracks (3/5/10/20), Wi-Fi only | No | No | U4-159, U4-200, U4-209, U4-277, R6-020 |
| 0.6.6 | Followed artists sync from Spotify with chip | No | No | PLAY-046, PLAY-081, QUEUE-009, QUEUE-014, HOME-008, SPOT-012, D3-065, U4-083 (+3 more) |
| 0.6.6 | Bulk download Spotify playlist | Partial | Partial | MATCH-005, MATCH-024 |
| 0.6.6 | Speed dial Spotify Liked Songs pin fix | Partial | Partial | U4-046 |
| 0.6.6 | Varispeed (pitch linked to speed) | No | Yes | PLAY-077, U4-046, U4-108, U4-114, U4-195, U4-230 |
| 0.6.6 | Library search across all library screens | Partial | Partial | SEARCH-011, SPOT-002, SPOT-005, U4-001, U4-010, U4-016, U4-061, U4-067 (+3 more) |
| 0.6.6 | Playlist sync preserves downloaded tracks | Partial | Partial | D3-073, D3-080, U4-098, U4-232, U4-286, S5-042, R6-062 |
| 0.6.6 | Play-next behaviour and ghost additions fixed | Partial | Partial | QUEUE-030, QUEUE-031, TEST-002, U4-133, U4-140 |
| 0.6.6 | Cached/downloaded indicators correct | Partial | Partial | HOME-015, SEARCH-002, D3-058, U4-037, U4-072, U4-073, U4-106, U4-115 (+4 more) |
| 0.6.2 | Remote hash registry, local cache, 412 retry with previous hash, force refresh | No | No | PLAY-059, MATCH-006, MATCH-022, QUEUE-029, SPOT-003, SPOT-004, SPOT-006, TEST-009 (+4 more) |
| 0.6.0 | Bidirectional like sync with Spotify | No | No | MATCH-026, SPOT-011 |
| 0.6.0 | Add/remove tracks in Spotify playlists (incl. reverse lookup for YouTube tracks) | Partial | Partial | FEAT-009 |
| 0.6.0 | Sort & refresh Spotify playlists | Partial | Partial | QUEUE-004, QUEUE-010, QUEUE-014, SPOT-009, TEST-004, D3-080, U4-010, U4-070 (+5 more) |
| 0.6.0 | Drag-to-reorder with lock and optimistic update | Partial | Partial | QUEUE-003, QUEUE-024, QUEUE-032, QUEUE-042, SPOT-009, SPOT-010, TEST-013, D3-044 (+12 more) |
| 0.6.0 | Centralized like sync (YouTube, Spotify, Last.fm) | No | No | R6-057 |
| 0.5.0 | Local files playback (incl. multichannel/Atmos where decodable) | Partial | Partial | D3-020, D3-047, D3-054, D3-069, D3-073, D3-086, D3-124, U4-068 (+8 more) |
| 0.5.0 | Draggable fast scrollbar for huge playlists | No | No | UI-006, U4-048, U4-066, R6-034 |
| 0.5.0 | Search inside Spotify playlists and Liked Songs | No | No | QUEUE-004, U4-010, U4-292 |
| 0.5.0 | Pin Spotify playlists in Library | Partial | Partial | PLAY-041, HOME-008, SPOT-004, U4-046, U4-169, U4-291, S5-024, S5-036 (+1 more) |
| 0.5.0 | Shuffle order generated once per session | Partial | Partial | QUEUE-034, RADIO-016, U4-140 |
| 0.5.0 | Listen Together | No | No | U4-016, U4-017, U4-216, U4-261 |
| 0.4.5 | Shuffle whole playlist without restarting playback | Partial | Partial | PLAY-081, QUEUE-018, QUEUE-030, QUEUE-031, QUEUE-032, QUEUE-033, QUEUE-034, QUEUE-039 (+15 more) |
| 0.4.5 | No 0:00 durations | Partial | Partial | PLAY-038, PLAY-072, PLAY-073, MATCH-014, MATCH-019, MATCH-020, MATCH-022, MATCH-026 (+10 more) |
| 0.4.5 | Preload/lazy-load lists | No | No | PLAY-076, QUEUE-019, U4-213, R6-035, R6-036 |
| 0.4.5 | Batch Spotify sync to reduce calls | Partial | Partial | MATCH-024, QUEUE-012, QUEUE-018, QUEUE-031, RADIO-013, TEST-004, D3-122, R6-005 (+1 more) |
| 0.4.0 | New Releases: Following / Discover / For You (12 h / 24 h TTL) | No | Partial | RADIO-006, HOME-008, HOME-014, U4-043, U4-265 |
| 0.4.0 | Manual YouTube match override (3 entry points, preview, never overwritten) | Yes | Yes | PLAY-020, PLAY-024, MATCH-002, MATCH-003, MATCH-005, MATCH-007, MATCH-020, MATCH-021 (+5 more) |
| 0.4.0 | Home: 8 s timeout, retry, local most-played fallback, differentiated TTL (6 h / 30 min) | No | No | SPOT-015, TEST-007, R6-015, R6-075 |
| 0.4.0 | Mood & Genres hidden in Spotify-Home mode | No | Partial | U4-041, U4-263 |
| 0.4.0 | Last.fm scrobbling | No | No | U4-214, U4-268 |
| 0.4.0 | Loudness/audio focus handling | No | No | PLAY-022, PLAY-025, PLAY-084, PLAY-086, MATCH-009, MATCH-010, MATCH-011, HOME-011 (+3 more) |
| 0.4.0 | Stale auth cleared after backup restore | Yes | Partial | FEAT-010 |
| 0.3.0 | Recently Played (last 40) on Home always visible | Partial | Partial | HOME-009, U4-040 |
| 0.3.0 | Spotify REST fail-fast on 429 with cached fallback | Partial | Partial | SPOT-005, TEST-009, D3-101, S5-057 |
| 0.3.0 | Spotify queue resolves ~25 tracks around selection (5 before + 20 after), progressive | No | No | PLAY-020, PLAY-040, PLAY-050, PLAY-079, PLAY-080, PLAY-087, PLAY-090, QUEUE-009 (+45 more) |
| 0.2.1 | Clear restricted-track messages (login vs not) | Partial | Partial | PLAY-002, PLAY-007, U4-103 |
| 0.2.0 | Cookie + TOTP Spotify login (no client ID) | Yes | Yes | S5-029, S5-031, S5-036 |
| 0.2.0 | Spotify-only mode | No | No | HOME-003, HOME-004, HOME-009, TEST-007, U4-044 |
| 0.2.0 | Spotify album screen | No | No | SEARCH-003, SPOT-013, U4-059 |
| 0.2.0 | 3-tier profile cache (GQL→REST→local), top tracks/artists | No | No | RADIO-004, RADIO-005, RADIO-006, HOME-005, HOME-006, HOME-014, SPOT-015 |
| 0.2.0 | Recommendation engine (affinity, genre, recency, popularity, diversification) | No | No | QUEUE-041, RADIO-001, RADIO-002, RADIO-003, RADIO-004, RADIO-005, RADIO-008, RADIO-010 (+8 more) |
| 0.2.0 | Timeout guards (REST 3 s, engine 4 s) with artist-top-tracks fallback | No | No | FEAT-011 |
| 0.2.0 | REST 429 → 5-minute cooldown | Partial | Partial | SPOT-005, TEST-009, D3-101, S5-057 |
| 0.2.0 | Thumbnail fallback chain Spotify→YouTube match→video | Partial | Partial | FEAT-012 |
| Reference app | Theme/colour customization, light/dark/system, dynamic colour | No | No | U4-022, U4-024, U4-237, U4-278 |
| Reference app | Equalizer / AutoEQ | No | Partial | PLAY-083, U4-108, U4-116, U4-196, U4-271 |
| Reference app | Skip silence, audio normalization | No | No | PLAY-025, PLAY-084, PLAY-086, MATCH-009, MATCH-010, MATCH-011, HOME-011, D3-003 (+2 more) |
| Reference app | Proxy settings | No | No | U4-206, U4-276, S5-014, S5-060, S5-061 |
| Reference app | Cache size limits | No | No | PLAY-041, D3-103, U4-208, S5-045, R6-023, R6-047, R6-084 |
| Reference app | Charts, Mood & Genres, Explore | Partial | Partial | U4-041, U4-042, U4-253, U4-263, U4-264, S5-077 |
| Reference app | Wrapped / year in review | No | No | U4-267 |
| Reference app | AI lyrics translation | No | No | U4-217, U4-270 |
| Reference app | Alarm | No | No | U4-275 |
| Reference app | Changelog screen | No | No | U4-219, U4-273, S5-021 |
| Reference app | Google Cast (Windows: optional DLNA/Chromecast casting) | No | No | FEAT-013 |
| Reference app | Widgets (Windows: tray + mini-player always-on-top) | N/A | N/A | U4-255, S5-080 |

## 2.3 Audit conclusions

1. Desktop's two lines each contain features the other lacks; nothing can ship until Phase 0 merges them.
2. The largest functional gap is playback resolution (reference 0.8.8/0.9.2 InnerTubeX client fallback) — Phase 4.
3. The largest product gap is Spotify-powered Home/Search/recommendations/new releases/like sync/followed artists (reference 0.2.0–0.7.1) — Phase 5.
4. Reference integrations (Last.fm, Discord, SponsorBlock, Listen Together, recognition, Qobuz, Cast) are absent — Phase 9, each only when real.
5. Reference "Under the hood" improvements (dynamic GQL hashes, LRU caches, crash reporting, CI tests, StrictMode-equivalent checks) map to Phases 1, 5, 8.
6. Android-only items (Android Auto, quick-settings tile, widgets, notification actions) get Windows equivalents: SMTC, taskbar thumbnail buttons, tray, jump list, global hotkey, toast notifications.

---

# 3. Current state summary (what exists, what to keep)

## 3.1 Keep (already good; do not lose during refactors)

- Native Tauri/WebView2 app, no Electron, no localhost server, no ad SDK.
- `main` hardening: AES-256-GCM sealed secrets with Credential Manager key; real CSP; narrow asset scope with per-file grants; 10 s connect / 20 s request timeouts, 30 s chunk-stall detection, long explicit download cap; Spotify 429/error-body handling; backup zip entry caps (500 MB) and secret scrubbing (`VACUUM` after delete); WebView data clearing on logout; single-instance guard; startup error dialog instead of panic; artwork host validation; non-destructive sync when YouTube returns zero items; like-state SQL fixes; download guards; expired-stream-URL recovery; a11y focus rings, `aria-pressed`, `aria-current`, contrast fixes, dialogs above topbar, Escape closes dialogs; collapsible sidebar.
- v0.1.8 features: audio quality (auto/high/low), persisted volume, equalizer settings, varispeed, incremental seek, pause-on-mute, persistent queue/session restore, measured playtime (`history_record_playtime`), artist follow, podcast refresh/cache/offline, Google profile refresh, lyrics provider picker + fresh fetch, browse/discover continuation (`ytm_browse*`), taskbar thumbnail buttons + media session, mouse-wheel volume, offline Home cache, stale playback request cancellation ("last click wins").
- Product strengths: Back/Forward with Alt+Left/Right, Ctrl+F, Space/arrow shortcuts, local vs remote history, library search/sort/list/grid/filters/auto-playlists/bulk selection, queue keyboard move up/down, Spotify playlist folders/editing/manual match override, separate downloads vs player cache, backups exclude media and sessions.

## 3.2 Critical defects (fix first)

C1 branch divergence · C2 plaintext secrets in v0.1.8 · C3 CSP null + broad asset scope in v0.1.8 · C4 v0.1.8 post-release bugs · H1 main regressions · H2 playback behind upstream · H3 static Spotify hashes · H4 unbounded restore (v0.1.8) · H5 no network timeouts (v0.1.8) · H6 logout leaves WebView sessions (v0.1.8) · H7 wrong YouTube URL classification (`playlist?list=` → album; `browse/MPRE…` → artist) · H8 invalid share URLs (`/album/{id}`, `/artist/{id}`) · H9 no CI. Full text: Appendix G.

---

# 4. Target architecture (build toward this; every phase moves code into it)

## 4.1 Repository layout (target)

```text
Meld-Desktop/
├─ .github/
│  ├─ workflows/ci.yml            # PR/push: lint, typecheck, tests, cargo fmt/clippy/test/audit/deny, windows build
│  ├─ workflows/release.yml       # tag v*: build, sign, SBOM, checksums, latest.json, GitHub Release
│  ├─ workflows/nightly-contract.yml  # live provider contract tests (secrets in Actions only)
│  ├─ dependabot.yml
│  ├─ ISSUE_TEMPLATE/{bug.yml,feature.yml}  PULL_REQUEST_TEMPLATE.md
├─ docs/
│  ├─ plan/{MASTER-PLAN.md,PROGRESS.md,SESSION-LOG.md,DECISIONS.md}
│  ├─ architecture.md  data-locations.md  release-process.md  troubleshooting.md
├─ CHANGELOG.md  CONTRIBUTING.md  SECURITY.md  CODE_OF_CONDUCT.md  README.md  LICENSE  NOTICE
├─ package.json  vite.config.ts  vitest.config.ts  eslint.config.js  .prettierrc  tsconfig*.json
├─ src/                                # React UI only — no business logic beyond view state
│  ├─ main.tsx
│  ├─ app/{App.tsx,router.tsx,providers.tsx,shortcuts.ts,ErrorBoundary.tsx}
│  ├─ ipc/{bindings.ts (GENERATED by tauri-specta),client.ts,events.ts}
│  ├─ stores/{player.ts,queue.ts,session.ts,settings.ts,downloads.ts,notifications.ts}   # zustand
│  ├─ features/
│  │  ├─ home/  search/  library/  detail/{album,artist,playlist,podcast}/
│  │  ├─ player/{MiniPlayer,ExpandedPlayer,SeekBar,Volume}  queue/  lyrics/
│  │  ├─ spotify/  history/  stats/  downloads/  settings/{sections...}  accounts/
│  │  └─ integrations/{lastfm,discord,sponsorblock,...}    # Phase 9
│  ├─ components/ui/{Button,IconButton,Dialog,Menu,Tabs,Combobox,Slider,Toast,List(virtual),Card,EmptyState,ErrorState,Skeleton}
│  ├─ i18n/{index.ts,locales/en.json,...}
│  ├─ styles/{tokens.css,themes/{dark,light,high-contrast}.css,global.css}
│  ├─ lib/{urls.ts (YouTube URL classify + share URLs),format.ts,time.ts}
│  └─ test/{setup.ts,fixtures/,utils.tsx}
└─ src-tauri/
   ├─ Cargo.toml  build.rs  tauri.conf.json  capabilities/{main.json}  permissions/   icons/  resources/
   └─ src/
      ├─ main.rs                      # calls lib::run()
      ├─ lib.rs                       # Builder: plugins, state, setup, invoke_handler(ipc::handlers())
      ├─ app_state.rs                 # AppState { db: DbHandle, http: HttpClients, playback: PlaybackHandle, ... }
      ├─ error.rs                     # AppError (thiserror) + serializable IpcError {code,message,retryable}
      ├─ paths.rs                     # app.path() resolution, portable mode detection
      ├─ logging.rs                   # tracing + rotating files + redaction layer
      ├─ db/{mod.rs (actor thread),pool.rs,migrations.rs,migrations/NNNN_name.sql,repo/{songs,playlists,history,downloads,settings,spotify_match,podcasts,accounts,sync_runs}.rs}
      ├─ secrets.rs                   # existing sealed storage (extend set)
      ├─ http/{client.rs,policy.rs (host allowlists, redirect rules, retry/backoff, size caps)}
      ├─ innertube/{context.rs,clients.rs (client profiles, remote config),browse.rs,search.rs,next.rs,player.rs,parsers/{home,search,browse,playlist,queue,library,podcast}.rs}
      ├─ playback/{coordinator.rs (state machine),resolver/{mod.rs,youtube.rs,local.rs,download.rs,cache.rs},media_protocol.rs (meld-media:// with Range),cache.rs,downloads.rs (job queue),format.rs}
      ├─ queue/{model.rs,engine.rs,shuffle.rs,repeat.rs,continuation.rs,persistence.rs}
      ├─ spotify/{auth.rs,token.rs,gql.rs,hashes.rs (remote registry + cache + fallback),rest.rs,library.rs,playlists.rs,home.rs,search.rs,recommend.rs,matcher/{mod.rs,normalize.rs,score.rs,cache.rs}}
      ├─ lyrics/{pipeline.rs,providers/{betterlyrics,paxsenix,lrclib,kugou,lyricsplus,youtube,ytsubtitle}.rs,lrc.rs,ttml.rs}
      ├─ library/{sync.rs (generations),likes.rs,playlists.rs,local_files.rs,history.rs,stats.rs,podcasts.rs,follows.rs}
      ├─ backup/{create.rs,restore.rs,manifest.rs,import_meld_android.rs}
      ├─ auth/{google.rs,spotify_login.rs,login_window.rs (isolated profiles, nav allowlist)}
      ├─ windows/{smtc.rs,taskbar.rs,tray.rs,jumplist.rs,deep_link.rs,power.rs}   # #[cfg(windows)]
      ├─ updater.rs
      └─ ipc/{mod.rs (handlers!),account.rs,catalog.rs,library.rs,playback.rs,queue.rs,downloads.rs,lyrics.rs,spotify.rs,settings.rs,backup.rs,system.rs}
```

## 4.2 Technology decisions (fixed unless `DECISIONS.md` records a change)

| Concern | Decision |
|---|---|
| Frontend routing | `@tanstack/react-router` (typed routes, search params) — every durable surface has a route |
| Frontend state | `zustand` stores per domain; high-frequency playback time in its own store/subscription |
| Remote data in UI | `@tanstack/react-query` wrapping typed IPC calls (cache, stale-while-revalidate, cancellation) |
| Lists | `@tanstack/react-virtual` for lists > 200 rows |
| i18n | `i18next` + `react-i18next`, ICU plurals, RTL via `dir` |
| UI tests | Vitest + React Testing Library + `@testing-library/user-event` + `vitest-axe` |
| E2E | WebdriverIO + `tauri-driver` on Windows CI |
| Lint/format | ESLint (typescript-eslint, react-hooks, jsx-a11y) + Prettier; rustfmt + clippy (`-D warnings`, `clippy::unwrap_used` outside tests) |
| IPC typing | `tauri-specta` + `specta` → `src/ipc/bindings.ts` generated in `build`/test; CI fails if out of date |
| Errors | `thiserror` `AppError` → `IpcError { code, message, retryable, detail? }` |
| DB | rusqlite; one writer thread actor + read pool (`r2d2_sqlite`), WAL, `busy_timeout=5000`, `synchronous=NORMAL`, `foreign_keys=ON`; migrations via `rusqlite_migration` (or own runner) with `user_version` |
| Logging | `tracing`, `tracing-subscriber`, `tracing-appender` (daily rotate, 7 files), redaction layer |
| Secrets | existing `secrets.rs` (AES-256-GCM, key in Credential Manager) + `zeroize`/`secrecy` |
| HTTP | single `reqwest` builder per policy (YouTube, Spotify, lyrics, artwork, updater) with host allowlists |
| Media transport | Tauri custom URI scheme `meld-media://` with HTTP Range support served from Rust (cache tee) |
| Windows media | `windows` crate: `SystemMediaTransportControls`, `ITaskbarList3` thumbnail buttons/progress, tray via Tauri tray API, jump list via `ICustomDestinationList` |
| Updater | `tauri-plugin-updater` (minisign-signed `latest.json` on GitHub Releases) |
| Deep links | `tauri-plugin-deep-link` (`meld://`) + single-instance arg forwarding |
| External links | `tauri-plugin-opener` with URL allowlist |
| Installer | NSIS (per-user default, `installMode: "currentUser"`, optional all-users), WebView2 `embedBootstrapper` silent |
| Portable | ZIP with `portable.marker` → data in `<exe dir>\data` |
| Signing | Authenticode (Azure Trusted Signing preferred; OV cert fallback) for exe, setup, uninstaller |

## 4.3 Core contracts (implement exactly)

**Playback coordinator (Rust)** — states: `Idle → Preparing → Buffering → Playing ⇄ Paused → (Recovering) → Ended | Failed`. Commands: `prepare(track_ref, context, quality) -> SessionId`, `play`, `pause`, `seek(ms)`, `stop`, `set_volume`, `set_rate`, `next`, `previous`. Events: `playback://state {session, state, position_ms, duration_ms, buffered_ms, error?}`. React never receives raw stream URLs; `<audio src="meld-media://session/{id}">`. History/play counts commit only after a verified threshold (≥30 s or ≥50 %, configurable). Same coordinator drives SMTC/taskbar/tray/media keys.

**Queue model** — `QueueEntry { entry_id: Uuid, track: TrackRef, source: SourceRef, added_by: User|Autoplay|Radio, original_index }`; `Queue { entries, current, shuffle_order: Option<Vec<usize>>, repeat: Off|One|All, context: SourceContext, continuation: Option<Continuation> }`. Versioned persistence (`queue_state` table, JSON with `version`). Play Next inserts after current in *play order*, also with shuffle on. Duplicate tracks allowed (distinct `entry_id`).

**Track identity** — `TrackRef { provider: YouTube|Spotify|Local|Upload|Podcast, id, youtube_video_id?, spotify_id?, isrc?, local_path_id? }`. Spotify→YouTube via one `Matcher` (memory LRU → DB cache → candidates → score → confidence band → manual override wins forever).

**Sync engine** — staged remote snapshot into temp tables → completion proof (all pages, no loop, structure valid) → generation-marked merge → tombstones only after confirmed complete run → per-item outbox for local mutations → `sync_runs` audit row.

**Data model (Part 3 B)** — `tracks`, `track_sources`, `accounts`, `library_memberships`, `likes`, `downloads`, `playlist_entries` (occurrence IDs, order keys, `setVideoId`), `sync_runs`. Migrate from current `songs` booleans with a tested migration from every released schema (v0.1.0–v0.1.8 fixtures).

**IPC error codes** — `AUTH_REQUIRED`, `AUTH_EXPIRED`, `OFFLINE`, `TIMEOUT`, `RATE_LIMITED`, `NOT_FOUND`, `UNAVAILABLE_REGION`, `AGE_RESTRICTED`, `PARSE_FAILED`, `UPSTREAM_CHANGED`, `DISK_FULL`, `IO`, `DB`, `INVALID_INPUT`, `CANCELLED`, `INTERNAL`.

---

# 5. Phase 0 — Stop-ship reconciliation procedure (do this first, step by step)

## 5.1 Steps

1. `git clone https://github.com/Romany-Osama/Meld-Desktop && cd Meld-Desktop && git fetch --all --tags`.
2. Create `reconcile/0.2.0` **from `v0.1.8`**: `git switch -c reconcile/0.2.0 v0.1.8`.
3. Remove tracked binaries: `git rm -r --cached release/` and add `release/` to `.gitignore` (task: TR-M12).
4. Port the 15 `main`-only commits (5.2) in chronological order (oldest first). Use `git cherry-pick -x <sha>`; for each conflict, keep **both** the v0.1.8 feature and the `main` hardening. Record every non-trivial resolution in `docs/plan/DECISIONS.md`.
5. Verify every v0.1.8 command (1.3) and setting (1.4) still exists, and every `main` security property exists (CSP, asset scope, sealed secrets incl. migration from v0.1.8 plaintext DB, timeouts, backup caps, logout clearing, single instance, startup error dialog).
6. Set version `0.2.0` in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` (single source: `tauri.conf.json` `version: "../package.json"`), and add a CI check that all three match the tag.
7. Restore `bundle.targets: ["nsis"]`, `webviewInstallMode embedBootstrapper silent`, taskbar `.ico` resources (embedded as bundle resources, path resolved via `app.path().resource_dir()`), and **drop MSI** (DECISIONS: NSIS + portable only).
8. Add `docs/plan/` files (copy this file as `MASTER-PLAN.md`, generate `PROGRESS.md` from section 9, create `DECISIONS.md`, `SESSION-LOG.md`).
9. Add minimal CI (`.github/workflows/ci.yml`, section 7.2 "minimal") so every later PR is gated.
10. Write upgrade tests: open a real v0.1.8 `song.db` fixture with plaintext cookie/`sp_dc` → app starts → secrets sealed → plaintext absent from file (`VACUUM`) → library intact.
11. Manual smoke on Windows: install over v0.1.8 NSIS install; portable over v0.1.8 portable; login state handled (plaintext migrated or re-login requested), library/downloads preserved.
12. Open PR `reconcile/0.2.0 → main`. Merge with a **merge commit** (not squash) so `v0.1.8` becomes an ancestor of `main`. Verify `git merge-base --is-ancestor v0.1.8 main`.
13. Add `CHANGELOG.md` with corrected history (no v0.1.5; v0.1.2/0.1.3 asset names) and an entry "0.2.0 — supersedes 0.1.8 for security".
14. Enable GitHub Issues, add `SECURITY.md`, issue/PR templates (TR-M11, TR-L2).
15. Optional interim release `v0.2.0` (security supersede) using the release workflow once Phase 10's minimal release job exists; otherwise defer to the final release.

## 5.2 Commits on `main` to port (oldest → newest)

| # | SHA | Subject |
|---|---|---|
| 1 | `b0315cad` | fix: credential-safe backups, non-destructive sync, like-state SQL, download guards, matcher and player fixes |
| 2 | `bc3d65c4` | chore: normalize line endings and add .gitattributes |
| 3 | `411e01bb` | chore: declare license and MSRV, bump rustls, prune unused deps, add NOTICE and prerequisites |
| 4 | `58e116aa` | fix(security): encrypt Google/Spotify session secrets at rest |
| 5 | `5edc8fda` | fix(auth): clear WebView session data on logout, fix Google login poll pacing |
| 6 | `14f90256` | fix(security): real CSP, narrow asset-protocol scope, per-file grants for imports |
| 7 | `742fc068` | fix(network): timeouts, stall detection, Spotify 429/error-body handling, retry |
| 8 | `9a0b63fd` | fix(security): reduce IPC surface, validate artwork hosts, cap backup zip entries, real startup error dialog |
| 9 | `d33a553a` | fix(startup): add a single-instance guard |
| 10 | `7fcae19c` | fix(ui): consolidate the 4 like-flow call sites, surface bulk-select sync failures |
| 11 | `f7f7bc6c` | feat(ui): collapsible icon-only sidebar, persisted across restarts |
| 12 | `8380b9d0` | fix(ui): dialogs render above the topbar/selection bar; Escape closes every dialog |
| 13 | `0a7b10c8` | fix(a11y): keyboard focus outline on search inputs; aria-pressed and aria-current |
| 14 | `410cd79e` | fix(a11y): raise text below 12px and fix muted-text contrast that failed WCAG AA |
| 15 | `0d7814d3` | fix(playback): recover from expired stream URLs instead of erroring or skipping |

**Important:** commit 8 (`reduce IPC surface`) removed v0.1.8 commands — when cherry-picking it, **keep** the 14 commands in 1.3 unless DECISIONS records a retirement. Commit 6 narrowed asset scope — make sure v0.1.8 local-file import still works via per-file grants (and later via S5 path validation). Commit 4 must include a migration for v0.1.8's plaintext `spotifySpDc`/`spotifySpKey` — this plan changes `main`'s behaviour: **seal** `sp_dc` instead of deleting it (S5 "Make Spotify reconnect durable").

## 5.3 Commits only on the v0.1.8 line (already in the new branch; verify each feature survives cherry-picks)

| SHA | Subject |
|---|---|
| `fecc5c53` | feat(player): add varispeed playback control |
| `c914a196` | feat(offline): resume partial downloads and preserve metadata |
| `46bdcdd2` | fix(ui): distinguish offline downloads from playback cache |
| `840cd1d1` | fix(offline): recover interrupted downloads for resume |
| `3fb77fe8` | feat(podcasts): fall back to saved channels offline |
| `080682b2` | fix(player): ignore stale playback requests |
| `7b5ecd2f` | fix(offline): expose resume action for cancelled downloads |
| `bba4c331` | feat(player): add incremental seek gesture setting |
| `ab2b81a8` | docs(player): document incremental seek behavior |
| `cb955d2c` | feat(podcasts): cache opened show details locally |
| `d2dd7923` | fix(player): match persistent queue default |
| `870bf01b` | docs(player): document persistent queue default |
| `45624097` | feat(player): add pause on mute behavior |
| `226792fe` | docs(player): document pause on mute |
| `c88c2fad` | feat(podcasts): restore saved episodes offline |
| `0b1332a8` | fix(podcasts): use cached details on network failure |
| `0a1bbe03` | feat(player): integrate media session controls |
| `d4294dbb` | docs(player): document Windows media controls |
| `c9a33781` | fix(player): preserve library queue context |
| `d5422ec8` | fix(player): queue playable library items |
| `c307d4bb` | style(library): align filters with Meld |
| `644cede3` | feat(podcasts): persist loaded detail pages |
| `ce1faca5` | fix(queue): preserve list context from history and stats |
| `165ab79d` | fix(queue): preserve detail list context |
| `970a8321` | docs: describe detail caching and queue contexts |
| `a347d6f5` | feat(stats): track listened playback time |
| `8f0e1ed5` | docs: clarify measured listening time |
| `94eedaaa` | docs(stats): clarify measured listening time |
| `3e4c3ec5` | feat(browse): support source browse continuations |
| `03459d46` | test(browse): cover continuation parsing |
| `0ee47f04` | fix(queue): scope autoplay to recommendation sources |
| `a654954c` | fix(queue): preserve source-aware autoplay semantics |
| `bd5319df` | fix(queue): honor repeat continuation settings |
| `69f460f9` | fix(queue): match source episode queue semantics |
| `0960fdb9` | fix(queue): carry playlist continuation into playback |
| `46dee097` | fix(queue): route playlist continuations correctly |
| `ed589a96` | chore(ui): remove unused template assets |
| `d540a60a` | fix(settings): define privacy history defaults |
| `d15bf892` | refactor(ui): consolidate player action styles |
| `51bf166d` | feat(audio): add source-aligned audio quality setting |
| `56b70ad9` | fix(cache): keep player cache quality-aware |
| `ceddbdbe` | fix(settings): persist audio quality contract |
| `53dae030` | feat(settings): persist player volume |
| `b891ec29` | feat(discover): expose source browse pages |
| `44362523` | fix(ui): rebuild layer and library layout |
| `9cec040a` | fix(ui): preserve overlay stacking order |
| `12ea28ad` | refactor(ui): rebuild desktop design system |
| `51b8b881` | Revert "refactor(ui): rebuild desktop design system" |
| `fdbf847c` | fix(ui): restore player and search layout |
| `3c6f6851` | fix(ui): scope search history and player close |
| `286411e2` | feat(windows): add taskbar media controls and volume wheel |
| `26046ac2` | feat(parity): complete safe artist podcast and recap flows |
| `15cfb150` | docs(release): add v0.1.2 safe gap changelog |
| `bbdda4d1` | docs: rewrite desktop project README |
| `910a4e67` | feat(lyrics): add manual provider picker |
| `43d654b9` | docs(release): document lyrics provider picker |
| `a2e7b893` | feat(session): restore playback and cache lyric variants |
| `e592fff1` | feat(session): persist resume and offline lyric providers |
| `659ed90b` | release: prepare v0.1.4 Windows artifacts |
| `dcffa820` | fix(player): constrain long titles and refresh Google profile |
| `17d3117c` | fix(ui): refine full player layout and publish nsis release |
| `5f1aaf53` | release: publish Meld Desktop v0.1.8 |


## 5.4 Phase 0 exit criteria

- `v0.1.8` is an ancestor of `main`; versions = 0.2.0 everywhere; no binaries tracked.
- All 14 commands and 10 settings restored or retired with a DECISIONS entry; all `main` security properties present.
- Upgrade test from a v0.1.8 DB passes; minimal CI is green on Windows.
- `docs/plan/*` present; `PROGRESS.md` lists every task in section 9.


---

# 6. Phased roadmap — every task, in execution order

Order: phases 0→10. Inside a phase: milestones in order. Inside a milestone: P0, then P1, then P2/P3; ties by source order. Phases 4 and 5 may run in parallel after Phase 3's M3.1 lands; Phases 6–7 may start once M1.1 is merged, but player/queue UI (M6.3) waits for M4.1 and M5.4. Each task line: `ID (priority) — title — source`, followed by the detail text (Found/Fix/Done when or description). The appendices hold the original evidence and citations.


## Phase 0 — Stop-ship reconciliation and safety baseline (34 tasks)


### M0.1 Branch reconciliation (11 tasks)

- **Goal:** Make one canonical branch from v0.1.8 + all main hardening (section 5).
- **Depends on:** —
- **Exit criteria:** v0.1.8 ancestor of main; upgrade test from v0.1.8 DB passes.

- [ ] **QUEUE-001** (P0) — Use one canonical branch — _Part 2 · A. Canonical source and identity model_  
  **Found:** queue continuation, persistence, quality, taskbar, and playtime behavior differ between main and v0.1.8. **Fix:** complete PLAY-001 first; Part 2 must target the unified branch. **Done when:** queue tests run against one implementation and release source equals main.
- [ ] **TR-C1** (P0) — Default branch and released product have diverged — _Technical review (Appendix G)_  
  Branch from v0.1.8, port every main hardening commit, resolve regressions deliberately, one version, make release tag an ancestor of main (section 5).
- [ ] **TR-C2** (P0) — v0.1.8 stores Google/Spotify credentials in plaintext SQLite — _Technical review (Appendix G)_  
  Migrate plaintext secrets on upgrade to sealed storage, VACUUM, verify file contains no plaintext; test with a real v0.1.8 DB.
- [ ] **TR-C3** (P0) — v0.1.8 disables CSP and grants asset access to broad user folders — _Technical review (Appendix G)_  
  Adopt main's CSP and narrow scope; CI assertion (scripts/check-security-config.mjs).
- [ ] **TR-C4** (P0) — v0.1.8 contains known post-release correctness/data-integrity bugs — _Technical review (Appendix G)_  
  Port main fixes b0315cad etc.; add regression tests for each (non-destructive sync, like-state SQL, download guards, matcher/player fixes).
- [ ] **TR-H1** (P0) — Main regresses major v0.1.8 features — _Technical review (Appendix G)_  
  Restore the 14 commands and 10 settings (1.3/1.4) on the reconciled branch.
- [ ] **TR-H4** (P0) — v0.1.8 restore can consume unbounded memory — _Technical review (Appendix G)_  
  Keep main caps; stream to bounded temp file; see S5/D3 backup items.
- [ ] **TR-H5** (P0) — v0.1.8 networking can hang indefinitely — _Technical review (Appendix G)_  
  Keep main timeouts and stall detection.
- [ ] **TR-H6** (P0) — Logout did not clear login WebView state (v0.1.8) — _Technical review (Appendix G)_  
  Keep main clearing; then per-provider isolated profiles (S5 C).
- [ ] **TR-M3** (P0) — Duplicate Audio quality control in v0.1.8 settings — _Technical review (Appendix G)_  
  Remove duplicate when restoring audioQuality on reconciled branch.
- [ ] **TR-M4** (P0) — Main stats less accurate (playtime removed) — _Technical review (Appendix G)_  
  Restore history_record_playtime and measured-listening stats.

### M0.2 Restore v0.1.8 playback features on the reconciled branch (7 tasks)

- **Goal:** Restore every v0.1.8 playback/session feature on the reconciled branch (quality, volume, EQ settings, varispeed, seek, pause-on-mute, persistent queue, playtime, taskbar/media session).
- **Depends on:** M0.1
- **Exit criteria:** All 14 commands/10 settings restored or retired in DECISIONS; manual smoke passes.

- [ ] **PLAY-001** (P0) — Reconcile the two playback branches — _Part 1 · A. Resolver and YouTube player requests_  
  **Found:** v0.1.8 has quality, playlist context, persistent playback, taskbar controls, and measured playtime; main has security/timeouts/expiry fixes but removes those features. **Fix:** create one branch from v0.1.8, merge hardening, and keep a per-feature reconciliation checklist. **Done when:** release tag is an ancestor of main and all playback contract tests run against one implementation.
- [ ] **PLAY-021** (P1) — Main removed quality support entirely — _Part 1 · B. Format selection and metadata_  
  **Found:** main no longer passes or stores quality. **Fix:** port the quality contract onto the hardened resolver rather than deleting it. **Done when:** playback/download/cache quality is visible and tested in one branch.
- [ ] **PLAY-031** (P1) — v0.1.8 has no expiry recovery — _Part 1 · C. Transport, WebView2, ranges, and recovery_  
  **Found:** expired streams only show an audio-element failure or auto-skip. **Fix:** merge main's refresh behavior, then expand it to rejection-aware recovery. **Done when:** pausing beyond expiry resumes at the same position.
- [ ] **PLAY-035** (P1) — Main's effect is keyed only by song ID — _Part 1 · C. Transport, WebView2, ranges, and recovery_  
  **Found:** same-song replay or a same-ID payload replacement may not re-run source initialization. **Fix:** use a unique playback session/generation ID. Keep recovery methods explicit rather than suppressing all same-ID changes. **Done when:** replaying the same song restarts predictably and refreshed URLs preserve position.
- [ ] **PLAY-055** (P1) — Main removed resume entirely — _Part 1 · D. Player cache and explicit downloads_  
  **Found:** hardening fixed cleanup but regressed partial resume. **Fix:** port a corrected manifest-based resume implementation onto hardened main. **Done when:** cancel/restart/app-restart resume tests pass.
- [ ] **PLAY-056** (P1) — v0.1.8 can leak an “active download” lock on early return — _Part 1 · D. Player cache and explicit downloads_  
  **Found:** cancellation-map entry is inserted before fallible directory/DB initialization; v0.1.8 has no guard for every early `?`. **Fix:** retain main's RAII `ActiveDownloadGuard` and make initialization transactional. **Done when:** injected early failures allow an immediate retry.
- [ ] **PLAY-091** (P1) — No branch/version contract test — _Part 1 · G. Testing and release gates for playback_  
  **Fix:** CI verifies package/Cargo/Tauri/UI/tag versions and that tagged source is on main. **Done when:** release workflow refuses divergent tags.

### M0.3 Version truth, minimal CI, repository hygiene (16 tasks)

- **Goal:** Single version source, minimal Windows CI, security-config assertions, repo hygiene (no binaries, Issues, SECURITY.md, CHANGELOG).
- **Depends on:** M0.1
- **Exit criteria:** CI green on PR; versions equal; check-security-config passes.

- [ ] **S5-013** (P0) — Keep CSP enabled (regression guard) — _Part 5 · B. Content Security Policy and webview hardening_  
  Current `main` has a real CSP; v0.1.8 shipped `csp: null`. Add a CI assertion that `security.csp` is never null.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/tauri.conf.json#L1-L49][^https://github.com/Romany-Osama/Meld-Desktop/blob/5f1aaf534da8954eec4eeb7608bc37452114987e/src-tauri/tauri.conf.json#L1-L80]
- [ ] **S5-037** (P0) — Keep asset scope narrow (regression guard) — _Part 5 · D. Filesystem, asset protocol, and data locations_  
  v0.1.8 allowed `$HOME/**`, `$DOCUMENT/**`, `$DOWNLOAD/**`, `$MUSIC/**`, `$DESKTOP/**`; `main` narrowed it to Meld folders. Add a CI assertion.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/tauri.conf.json#L1-L49][^https://github.com/Romany-Osama/Meld-Desktop/blob/5f1aaf534da8954eec4eeb7608bc37452114987e/src-tauri/tauri.conf.json#L1-L80]
- [ ] **S5-070** (P0) — Restore missing bundle settings — _Part 5 · G. Updater and release signing_  
  `main` switched to `targets: "all"` and lost `webviewInstallMode`; restore `nsis` targeting and the WebView2 bootstrapper.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/tauri.conf.json#L1-L49][^https://github.com/Romany-Osama/Meld-Desktop/blob/5f1aaf534da8954eec4eeb7608bc37452114987e/src-tauri/tauri.conf.json#L1-L80]
- [ ] **S5-071** (P0) — Single source of version truth — _Part 5 · G. Updater and release signing_  
  `main` reports 0.1.0 in `tauri.conf.json`, `Cargo.toml`, and `package.json` although v0.1.8 is released. Use one version source and bump in CI.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/Cargo.toml#L1-L40]
- [ ] **S5-095** (P0) — Secret scanning and push protection — _Part 5 · J. Dependency and supply-chain security_  
  Enable GitHub secret scanning on the repository; tokens must never be committed or shared in chat/issues.
- [ ] **S5-097** (P0) — Branch protection — _Part 5 · J. Dependency and supply-chain security_  
  Require CI and review for `main`; sign tags for releases.
- [ ] **R6-073** (P0) — Add GitHub Actions CI — _Part 6 · I. CI and quality gates_  
  The repository has no `.github` workflows; the earlier check environment could not even run `cargo` checks.
- [ ] **R6-074** (P0) — Windows runner as the primary target — _Part 6 · I. CI and quality gates_  
  Build and test on `windows-latest`; optional Linux job for fast Rust checks.
- [ ] **R6-075** (P0) — Required checks — _Part 6 · I. CI and quality gates_  
  `npm ci`, `tsc --noEmit`, ESLint, Prettier, Vitest, `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test --locked`, `cargo audit`, `tauri build`.
- [ ] **TR-H9** (P0) — No automated release gate or CI — _Technical review (Appendix G)_  
  Section 7.2 CI and 7.3 release workflow.
- [ ] **TR-M11** (P0) — Public issue tracking disabled — _Technical review (Appendix G)_  
  Enable Issues, templates, SECURITY.md.
- [ ] **TR-M12** (P0) — Release binaries committed into Git history — _Technical review (Appendix G)_  
  git rm --cached release/, .gitignore; publish via Releases only.
- [ ] **TR-M13** (P0) — Release naming/version history inconsistent — _Technical review (Appendix G)_  
  Version policy 7.1; corrected CHANGELOG.
- [ ] **TR-L2** (P0) — CONTRIBUTING, SECURITY, issue/PR templates, code of conduct, support policy — _Technical review (Appendix G)_  
  Add files in Phase 0.
- [ ] **TR-L3** (P0) — Changelog missing on main — _Technical review (Appendix G)_  
  CHANGELOG.md with corrected history.
- [ ] **TR-L9** (P0) — Normalize formatting/line endings; enforce Prettier/rustfmt in CI — _Technical review (Appendix G)_  
  CI gates.

## Phase 1 — Foundations: architecture split, typed IPC, DB runtime and migrations, test harness, full CI, logging (92 tasks)


### M1.1 Frontend architecture split (16 tasks)

- **Goal:** Split App.tsx into router + feature modules + stores without behaviour change (strangler pattern: move one surface per PR; keep snapshots/tests green).
- **Depends on:** M0.*
- **Exit criteria:** App.tsx < 300 lines; every surface has a route; no behaviour regressions in smoke tests.

- [ ] **U4-001** (P0) — Split `App.tsx` into route-level screens — _Part 4 · A. Frontend architecture and state ownership · P0 foundation_  
  At minimum: Home, Search, Library, History, Stats, Album, Artist, Playlist, Podcast, Spotify, Settings, Player, Queue, and Lyrics.
- [ ] **U4-002** (P0) — Extract reusable feature modules — _Part 4 · A. Frontend architecture and state ownership · P0 foundation_  
  Player, queue, menu, downloads, accounts, lyrics, playlists, selection, notifications, and settings each need their own state boundary.
- [ ] **U4-003** (P0) — Introduce a typed router — _Part 4 · A. Frontend architecture and state ownership · P0 foundation_  
  Every durable surface must have a stable route and serializable parameters.
- [ ] **U4-004** (P0) — Make navigation history route-based — _Part 4 · A. Frontend architecture and state ownership · P0 foundation_  
  Replace the manual `NavKey[]` stack with entries that include route, parameters, scroll state, filters, and selected tab.
- [ ] **U4-005** (P0) — Give overlays explicit route/modal state — _Part 4 · A. Frontend architecture and state ownership · P0 foundation_  
  Back should close the topmost modal, then nested screen, then top-level navigation predictably.
- [ ] **U4-006** (P0) — Persist and restore the last safe route — _Part 4 · A. Frontend architecture and state ownership · P0 foundation_  
  Do not restore credential/login dialogs or destructive confirmations.
- [ ] **U4-007** (P0) — Add deep-link parsing — _Part 4 · A. Frontend architecture and state ownership · P0 foundation_  
  Support Meld routes, YouTube/YouTube Music URLs, Spotify URLs, and local app routes where applicable.
- [ ] **U4-008** (P0) — Separate server state from view state — _Part 4 · A. Frontend architecture and state ownership · P0 foundation_  
  Data fetching/caching must not live beside modal booleans and player controls.
- [ ] **U4-009** (P0) — Use request identities and cancellation per screen — _Part 4 · A. Frontend architecture and state ownership · P0 foundation_  
  Navigating away must prevent stale completion from replacing the new screen.
- [ ] **U4-010** (P0) — Preserve screen state on back — _Part 4 · A. Frontend architecture and state ownership · P0 foundation_  
  Search query/results, library tab/filter/sort, playlist position, and scroll offset should return as left.
- [ ] **U4-011** (P0) — Centralize capability checks — _Part 4 · A. Frontend architecture and state ownership · P0 foundation_  
  Menus should be derived from item type, source, account, permissions, and state—not scattered conditionals.
- [ ] **U4-012** (P0) — Centralize destructive-action policy — _Part 4 · A. Frontend architecture and state ownership · P0 foundation_  
  Confirmations, undo, optimistic state, and error rollback should use one system.
- [ ] **U4-013** (P0) — Centralize notifications — _Part 4 · A. Frontend architecture and state ownership · P0 foundation_  
  Support info, success, warning, error, action/undo, progress, and persistent failures—not one truncated notice string.
- [ ] **U4-014** (P0) — Add an error boundary per major route and player — _Part 4 · A. Frontend architecture and state ownership · P0 foundation_  
  A failed detail renderer must not take down playback or the entire shell.
- [ ] **U4-015** (P0) — Use stable domain IDs plus occurrence IDs — _Part 4 · A. Frontend architecture and state ownership · P0 foundation_  
  UI keys and selection cannot rely on title or a song ID when duplicates are valid.
- [ ] **TR-M1** (P1) — Monolithic frontend and backend — _Technical review (Appendix G)_  
  Section 4.1 layout; U4-001.., S5-003.

### M1.2 Typed IPC and capability model (13 tasks)

- **Goal:** Split lib.rs into domain modules (4.1), generate TS bindings with tauri-specta, typed errors, per-command permissions, remove unused commands.
- **Depends on:** M0.*
- **Exit criteria:** bindings generated + CI check; every command has a permission and a contract test.

- [ ] **S5-001** (P0) — Inventory every Tauri command with an owner, caller, and risk class — _Part 5 · A. IPC command surface and capability model_  
  `generate_handler!` registers 87 commands in one list; nine are not invoked by current `App.tsx` (`library_songs`, `library_liked_songs`, `library_playlists`, `library_uploaded_songs`, `library_local_files`, `library_downloads`, `library_player_cache`, `library_saved_podcasts`, `ytm_podcast_channels`).[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L4139-L4170]
- [ ] **S5-002** (P0) — Remove or gate unused commands — _Part 5 · A. IPC command surface and capability model_  
  Every exposed command is attack surface for any script that ever runs in the main webview. Unregister unused ones or put them behind a debug feature.
- [ ] **S5-003** (P0) — Split commands into Rust modules by domain — _Part 5 · A. IPC command surface and capability model_  
  `lib.rs` is ~307 KB. Create `ipc/{account,spotify,catalog,library,downloads,player,lyrics,settings,backup,system}.rs` with one `register()` each.
- [ ] **S5-004** (P0) — Adopt Tauri v2 app-command permissions — _Part 5 · A. IPC command surface and capability model_  
  Capability `default` grants only `core:default` to `main`; custom commands are implicitly allowed for every window that gets IPC. Generate per-command permissions via `build.rs` (`tauri_build::Attributes::app_manifest`) and grant them explicitly.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/capabilities/default.json#L1-L9]
- [ ] **S5-005** (P0) — Keep remote login windows IPC-less — and test it — _Part 5 · A. IPC command surface and capability model_  
  `google-login` and `spotify-login` load external origins. Add an automated check that no capability lists them and that `remote.urls` is never configured.
- [ ] **S5-006** (P0) — Typed, validated IPC payloads — _Part 5 · A. IPC command surface and capability model_  
  Replace free `String` arguments (IDs, keys, params, continuation tokens) with newtypes that validate length, charset, and shape before any network/database use.
- [ ] **S5-007** (P0) — Structured error type instead of `Result<_, String>` — _Part 5 · A. IPC command surface and capability model_  
  Return `{code, message, retryable, detail?}`; never forward raw upstream bodies, SQL text, or filesystem paths to the UI by default.
- [ ] **S5-008** (P0) — Cap response sizes and list lengths returned over IPC — _Part 5 · A. IPC command surface and capability model_  
  Bound pagination loops (library/playlist continuations are unbounded `loop`s) with a maximum page count and total item count.
- [ ] **S5-009** (P0) — Cancellation for long commands — _Part 5 · A. IPC command surface and capability model_  
  Searches, sync, playlist expansion, and lyrics lookups need cancellation tokens so route changes do not leave orphaned requests.
- [ ] **S5-010** (P0) — Event channel contract — _Part 5 · A. IPC command surface and capability model_  
  Document every emitted event (`account-status`, `spotify-status`, download progress, media events) with a typed payload and versioning.
- [ ] **S5-011** (P0) — Generate TypeScript bindings from Rust — _Part 5 · A. IPC command surface and capability model_  
  Use `specta`/`tauri-specta` (or equivalent) so command names and payload types cannot drift between frontend and backend.
- [ ] **S5-012** (P0) — IPC contract tests — _Part 5 · A. IPC command surface and capability model_  
  One test per command for: unauthenticated call, malformed argument, oversized argument, and happy path.
- [ ] **TR-M14** (P1) — No durable API boundary — _Technical review (Appendix G)_  
  tauri-specta generated bindings + response validation.

### M1.3 Database runtime and versioned migrations (29 tasks)

- **Goal:** DB actor + read pool, WAL/pragmas, versioned migrations from every released schema, indexes, pagination primitives.
- **Depends on:** M1.2
- **Exit criteria:** Migration tests from v0.1.0–v0.1.8 fixtures pass; no std Mutex<Connection> left; EXPLAIN tests pass.

- [ ] **D3-001** (P0) — Add an explicit schema version — _Part 3 · A. Schema ownership and versioned migrations · P0 — must precede more library/sync work_  
  Use `PRAGMA user_version` or a dedicated `schema_migrations(version, applied_at, checksum)` table. Never infer the version from whether an `ALTER TABLE` happens to fail.
- [ ] **D3-002** (P0) — Replace swallowed `ALTER TABLE` errors — _Part 3 · A. Schema ownership and versioned migrations · P0 — must precede more library/sync work_  
  Each migration must inspect the old version, run inside a transaction, fail startup with a useful error, and leave the old database intact.
- [ ] **D3-003** (P0) — Create one immutable migration per released schema transition — _Part 3 · A. Schema ownership and versioned migrations · P0 — must precede more library/sync work_  
  At minimum define the historical baseline, v0.1.8 schema, current-main schema, and the new normalized schema.
- [ ] **D3-004** (P0) — Never edit an old migration after release — _Part 3 · A. Schema ownership and versioned migrations · P0 — must precede more library/sync work_  
  Add a new migration instead. Commit canonical schema snapshots so CI can detect accidental drift.
- [ ] **D3-005** (P0) — Back up before migration — _Part 3 · A. Schema ownership and versioned migrations · P0 — must precede more library/sync work_  
  Make a consistent SQLite backup beside the database before any upgrade. Keep a bounded number, such as the latest three successful pre-migration copies.
- [ ] **D3-006** (P0) — Run `PRAGMA quick_check` before migration and `integrity_check` after migration — _Part 3 · A. Schema ownership and versioned migrations · P0 — must precede more library/sync work_  
  Abort and preserve the recovery copy if either fails.
- [ ] **D3-007** (P0) — Validate the final schema — _Part 3 · A. Schema ownership and versioned migrations · P0 — must precede more library/sync work_  
  Check required tables, columns, indexes, foreign keys, triggers, `user_version`, and constraints—not only four table names.
- [ ] **D3-008** (P0) — Test every supported upgrade path — _Part 3 · A. Schema ownership and versioned migrations · P0 — must precede more library/sync work_  
  Open fixture databases from every public Desktop release and migrate each to current. Verify representative songs, downloads, likes, playlists, history, settings, and sessions survive.
- [ ] **D3-009** (P0) — Test interrupted migration recovery — _Part 3 · A. Schema ownership and versioned migrations · P0 — must precede more library/sync work_  
  Simulate process termination between migration steps and verify restart either completes safely or restores the pre-migration copy.
- [ ] **D3-010** (P0) — Reject unsupported future schemas — _Part 3 · A. Schema ownership and versioned migrations · P0 — must precede more library/sync work_  
  A database with a greater `user_version` must not be opened and mutated by an older app.
- [ ] **D3-011** (P0) — Add a read-only recovery mode — _Part 3 · A. Schema ownership and versioned migrations · P0 — must precede more library/sync work_  
  If migration fails, let the user export diagnostics/library data or restore a backup instead of only terminating.
- [ ] **D3-012** (P0) — Normalize release/main divergence — _Part 3 · A. Schema ownership and versioned migrations · P0 — must precede more library/sync work_  
  Choose one schema lineage. Do not silently drop v0.1.8 columns such as `history.play_time_ms`, `player_cache.quality`, `podcasts.detail_json`, and `lyrics_variants` just because current `main` no longer creates them.
- [ ] **D3-013** (P1) — Enable WAL deliberately — _Part 3 · A. Schema ownership and versioned migrations · P1 — database runtime configuration_  
  Configure `journal_mode=WAL`, `synchronous=NORMAL` (or FULL where appropriate), a bounded `busy_timeout`, and a checkpoint policy.
- [ ] **D3-014** (P1) — Do not hold one global SQLite mutex across long work — _Part 3 · A. Schema ownership and versioned migrations · P1 — database runtime configuration_  
  Use a small connection pool or dedicated database worker. Keep network and filesystem work outside DB locks.
- [ ] **D3-015** (P1) — Add indexes from actual query plans — _Part 3 · A. Schema ownership and versioned migrations · P1 — database runtime configuration_  
  At minimum inspect indexes for `history(song_id, played_at)`, `downloads(state, downloaded_at)`, `playlist_songs(playlist_id, position)`, `playlist_songs(song_id)`, source/account membership, local paths, and library flags.
- [ ] **D3-016** (P1) — Add schema-level boolean checks — _Part 3 · A. Schema ownership and versioned migrations · P1 — database runtime configuration_  
  Constrain boolean integers to `0/1` and state strings to defined values where SQLite permits.
- [ ] **D3-017** (P1) — Add foreign-key verification to CI — _Part 3 · A. Schema ownership and versioned migrations · P1 — database runtime configuration_  
  Run `PRAGMA foreign_key_check` against every migrated fixture.
- [ ] **D3-018** (P1) — Create a repository/data-access layer — _Part 3 · A. Schema ownership and versioned migrations · P1 — database runtime configuration_  
  Remove raw SQL from command handlers so ownership rules and deletion guards are centralized.
- [ ] **R6-001** (P1) — Replace the single global `Mutex<Connection>` — _Part 6 · A. Backend concurrency and database access_  
  All database work goes through one `Mutex<Connection>` (72 lock sites), so a slow sync, backup, or stats query blocks every other command, including playback.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L219-L222]
- [ ] **R6-002** (P1) — Use a dedicated DB actor or `r2d2`/`deadpool` pool — _Part 6 · A. Backend concurrency and database access_  
  One writer connection plus a small read pool; reads never wait on writes.
- [ ] **R6-003** (P1) — Enable WAL, `busy_timeout`, and `synchronous=NORMAL` — _Part 6 · A. Backend concurrency and database access_  
  No journal or busy settings are configured; WAL improves concurrent reads and crash safety.
- [ ] **R6-004** (P1) — Never hold a std `Mutex` across `.await` or in async commands — _Part 6 · A. Backend concurrency and database access_  
  71 commands are `async`, but SQLite and filesystem work runs on the async runtime; only one `spawn_blocking` exists. Move blocking work off the runtime.
- [ ] **R6-005** (P1) — Batch writes in transactions — _Part 6 · A. Backend concurrency and database access_  
  Sync writes each song/artist/album mapping as separate statements; wrap each page in one transaction with prepared, cached statements.
- [ ] **R6-006** (P1) — Add missing indexes — _Part 6 · A. Backend concurrency and database access_  
  Only `spotify_match(youtube_id)` and `search_history(query)` are indexed. Add `history(played_at)`, `history(song_id, played_at)`, `songs(in_library, saved_at)`, `songs(liked, liked_date)`, `songs(local_path)`, `playlist_songs(playlist_id, position)`, `downloads(state)`.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L45-L190][^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L87-L91]
- [ ] **R6-007** (P1) — Use `EXPLAIN QUERY PLAN` tests for hot queries — _Part 6 · A. Backend concurrency and database access_  
  Library, liked, history, stats, top songs, and playlist songs must use indexes on a 50k-song fixture.
- [ ] **R6-008** (P1) — Paginate library queries — _Part 6 · A. Backend concurrency and database access_  
  `library_songs` and siblings return every row in one IPC payload; add keyset pagination.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L3913-L3925]
- [ ] **R6-009** (P1) — Run `PRAGMA optimize` and periodic `ANALYZE` — _Part 6 · A. Backend concurrency and database access_  
  On shutdown or idle.
- [ ] **R6-010** (P1) — Version migrations properly — _Part 6 · A. Backend concurrency and database access_  
  Startup tries ~20 `ALTER TABLE ... ADD COLUMN` statements and ignores every error.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L254-L284] Use `user_version` migrations that fail loudly and are tested from every released schema.
- [ ] **R6-011** (P1) — Measure startup DB cost — _Part 6 · A. Backend concurrency and database access_  
  Track time spent in schema/migration/secret migration (which can `VACUUM` the whole DB on startup).

### M1.4 Test harness, full CI, supply chain (21 tasks)

- **Goal:** Vitest/RTL/axe, Rust module tests, fixture corpus, mocked HTTP, E2E harness, full CI incl. audit/deny/coverage, Dependabot, pinned actions.
- **Depends on:** M0.3
- **Exit criteria:** Full CI green; coverage reported; E2E smoke runs on Windows.

- [ ] **S5-092** (P1) — Automated dependency updates — _Part 5 · J. Dependency and supply-chain security_  
  Enable Dependabot/Renovate for Cargo, npm, and GitHub Actions.
- [ ] **S5-093** (P1) — Audit gates in CI — _Part 5 · J. Dependency and supply-chain security_  
  `cargo audit`, `cargo deny` (licenses + advisories + duplicate crates), and `npm audit --omit=dev`.
- [ ] **S5-094** (P1) — Pin GitHub Actions by commit SHA — _Part 5 · J. Dependency and supply-chain security_  
  Prevent compromised tag updates from affecting releases.
- [ ] **S5-096** (P1) — Least-privilege CI tokens — _Part 5 · J. Dependency and supply-chain security_  
  Use `permissions:` blocks; only the release job gets `contents: write`.
- [ ] **R6-061** (P1) — Frontend unit/integration tests — _Part 6 · H. Automated testing_  
  There are no frontend tests. Add Vitest + React Testing Library for routes, player, queue, dialogs, settings.
- [ ] **R6-062** (P1) — Backend unit tests by module — _Part 6 · H. Automated testing_  
  Rust has 36 tests (28 in `lib.rs`, 8 in `secrets.rs`); expand to parsers, sync, migrations, downloads, backup, lyrics, Spotify mapping.
- [ ] **R6-063** (P1) — Parser fixture corpus — _Part 6 · H. Automated testing_  
  Store real anonymized InnerTube/Spotify/lyrics responses as fixtures; snapshot parsed results.
- [ ] **R6-064** (P1) — Contract tests for providers (scheduled) — _Part 6 · H. Automated testing_  
  A nightly job hits live endpoints with a test account to detect breaking changes early.
- [ ] **R6-065** (P1) — Migration tests from every released schema — _Part 6 · H. Automated testing_  
  Fixtures for v0.1.0–v0.1.8 databases upgraded to current.
- [ ] **R6-066** (P1) — Async/command tests with a mocked HTTP layer — _Part 6 · H. Automated testing_  
  Use `wiremock`/`httpmock` to test timeouts, retries, auth expiry, and malformed bodies.
- [ ] **R6-067** (P1) — End-to-end tests — _Part 6 · H. Automated testing_  
  WebdriverIO or Playwright against the Tauri app via `tauri-driver` on Windows CI for login-free flows (local files, settings, queue).
- [ ] **R6-068** (P1) — Accessibility automation — _Part 6 · H. Automated testing_  
  `axe-core` checks in component tests (Part 4 test matrix).
- [ ] **R6-069** (P1) — Performance regression tests — _Part 6 · H. Automated testing_  
  Benchmarks (`criterion`) for parsers and DB queries; bundle-size budget in CI.
- [ ] **R6-070** (P1) — Property/fuzz tests — _Part 6 · H. Automated testing_  
  Fuzz LRC/TTML parsers, backup restore, and URL/deep-link parsing with `cargo-fuzz`/`proptest`.
- [ ] **R6-071** (P1) — Coverage reporting — _Part 6 · H. Automated testing_  
  `cargo llvm-cov` and Vitest coverage with minimum thresholds for new code.
- [ ] **R6-072** (P1) — Flaky test policy — _Part 6 · H. Automated testing_  
  Quarantine and fix; no retries hiding failures.
- [ ] **R6-076** (P1) — Caching — _Part 6 · I. CI and quality gates_  
  Cache Cargo registry/target and npm to keep CI under ~10 minutes.
- [ ] **R6-077** (P1) — PR artifacts — _Part 6 · I. CI and quality gates_  
  Upload unsigned debug installers from PRs for manual testing.
- [ ] **R6-078** (P1) — Release workflow separated — _Part 6 · I. CI and quality gates_  
  Tag-triggered signed release (Part 5 section G).
- [ ] **R6-079** (P1) — Linting for Rust and TS — _Part 6 · I. CI and quality gates_  
  Add ESLint with React hooks rules; enable stricter Clippy lints (`unwrap_used` in non-test code).
- [ ] **TR-M2** (P1) — No frontend test suite — _Technical review (Appendix G)_  
  Vitest/RTL/axe; minimum: URL classification, queue/repeat/shuffle transitions, stale-play cancellation, sleep timer, session restore, like/sync partial failure, dialog focus/Escape, settings hydration.

### M1.5 Stability, logging, diagnostics (13 tasks)

- **Goal:** tracing logging with redaction, panic removal, crash reports (local), diagnostics export.
- **Depends on:** M1.2
- **Exit criteria:** No unwrap/expect in non-test code (clippy lint); logs redact secrets (test).

- [ ] **S5-085** (P1) — Remove panics from production paths — _Part 5 · I. Process stability, logging, and diagnostics_  
  Replace remaining `expect()` on HTTP client creation and run loop with graceful startup errors (startup DB failures already use `fail_to_start`).
- [ ] **S5-086** (P1) — Mutex poisoning recovery — _Part 5 · I. Process stability, logging, and diagnostics_  
  A single panic poisons `state.db` and breaks every command; move to a connection pool or recover poisoned locks safely.
- [ ] **S5-087** (P1) — Move blocking work off async threads — _Part 5 · I. Process stability, logging, and diagnostics_  
  SQLite and filesystem calls run inside async commands; wrap them in `spawn_blocking` or use a dedicated DB thread.
- [ ] **S5-088** (P1) — Structured, redacted logging — _Part 5 · I. Process stability, logging, and diagnostics_  
  Add `tracing` with rotating log files in the data folder and automatic redaction of secrets and personal data.
- [ ] **S5-089** (P1) — Crash reporting (opt-in, local first) — _Part 5 · I. Process stability, logging, and diagnostics_  
  Write minidumps/panic reports locally; uploading requires explicit consent.
- [ ] **S5-090** (P1) — Diagnostics export — _Part 5 · I. Process stability, logging, and diagnostics_  
  A settings action that bundles logs, versions, and settings (no secrets) for bug reports.
- [ ] **S5-091** (P1) — Schema migrations with versions — _Part 5 · I. Process stability, logging, and diagnostics_  
  Replace silent `ALTER TABLE ... ADD COLUMN` attempts (errors ignored) with `PRAGMA user_version` migrations that report real failures.
- [ ] **TR-L4** (P1) — Structured logging with redaction + diagnostic bundle — _Technical review (Appendix G)_  
  S5 I / R6 J.
- [ ] **R6-080** (P2) — Structured logging with levels and spans — _Part 6 · J. Observability and diagnostics_  
  `tracing` with per-command spans and durations (Part 5 section I).
- [ ] **R6-081** (P2) — Local performance metrics — _Part 6 · J. Observability and diagnostics_  
  Record command latency percentiles, playback start time, and error counts locally; viewable in a diagnostics screen.
- [ ] **R6-082** (P2) — Opt-in anonymous telemetry only — _Part 6 · J. Observability and diagnostics_  
  Default off; document exactly what is sent.
- [ ] **R6-083** (P2) — Diagnostics bundle — _Part 6 · J. Observability and diagnostics_  
  Logs, versions, OS info, WebView2 version, DB schema version, settings (no secrets).
- [ ] **R6-084** (P2) — Health checks screen — _Part 6 · J. Observability and diagnostics_  
  Show account, Spotify, providers, cache size, DB integrity, and update status.

## Phase 2 — Security hardening: CSP/webview, auth isolation, secrets, filesystem, network (52 tasks)


### M2.1 CSP and webview hardening (11 tasks)

- **Goal:** CSP tightening, freezePrototype, devtools off, navigation lock, opener allowlist, WebView2 settings.
- **Depends on:** M1.2
- **Exit criteria:** Security config tests pass.

- [ ] **S5-014** (P0) — Narrow `img-src https:` — _Part 5 · B. Content Security Policy and webview hardening_  
  Artwork can come from any HTTPS origin, which enables tracking pixels and makes CSP weaker. Proxy/cache artwork through the backend (`asset:`) or allowlist `*.ggpht.com`, `*.googleusercontent.com`, `i.ytimg.com`, `i.scdn.co`.
- [ ] **S5-015** (P0) — Review `media-src https://*.googlevideo.com` — _Part 5 · B. Content Security Policy and webview hardening_  
  Prefer streaming through the backend cache (`asset:`) so the webview never needs network media access; otherwise keep the narrow host rule and document it.
- [ ] **S5-016** (P0) — Use Tauri's `devCsp` for development — _Part 5 · B. Content Security Policy and webview hardening_  
  Keep dev-only relaxations (Vite HMR websocket) out of the production policy.
- [ ] **S5-017** (P0) — Enable `freezePrototype` — _Part 5 · B. Content Security Policy and webview hardening_  
  Set `app.security.freezePrototype: true` to reduce prototype-pollution impact on IPC.
- [ ] **S5-018** (P0) — Disable devtools in release builds — _Part 5 · B. Content Security Policy and webview hardening_  
  Ensure the `devtools` feature is off in release and add a test for it.
- [ ] **S5-019** (P0) — Block in-webview navigation of the main window — _Part 5 · B. Content Security Policy and webview hardening_  
  Add `on_navigation` to the main window that permits only the app origin; open external links in the system browser.
- [ ] **S5-020** (P0) — Open external links through a dedicated, allowlisted command — _Part 5 · B. Content Security Policy and webview hardening_  
  Use `tauri-plugin-opener` with a scoped URL allowlist (https only; YouTube, Spotify, GitHub, provider pages) instead of any `window.open`.
- [ ] **S5-021** (P0) — No `dangerouslySetInnerHTML` and no HTML from providers — _Part 5 · B. Content Security Policy and webview hardening_  
  Lyrics, descriptions, and changelog text must render as text. Add an ESLint rule.
- [ ] **S5-022** (P0) — Disable context-menu/devtools shortcuts in release — _Part 5 · B. Content Security Policy and webview hardening_  
  Suppress WebView2 default context menu, F12, Ctrl+Shift+I, and reload accelerators in production.
- [ ] **S5-023** (P0) — Disable WebView2 autofill/password save for the main window — _Part 5 · B. Content Security Policy and webview hardening_  
  The main UI never needs browser credential storage.
- [ ] **S5-024** (P0) — Pin a WebView2 minimum version and handle missing runtime — _Part 5 · B. Content Security Policy and webview hardening_  
  v0.1.8 embedded the bootstrapper; current `main` lost that setting. Restore `webviewInstallMode` and show a friendly error if WebView2 is absent.

### M2.2 Auth isolation and secrets (24 tasks)

- **Goal:** Isolated login profiles, per-provider logout, nav allowlists, sealed Spotify sp_dc refresh, no plaintext fallback, zeroize, D3 J items.
- **Depends on:** M1.3
- **Exit criteria:** Logout tests; no plaintext secrets in DB file (byte scan test).

- [ ] **D3-156** (P0) — Keep the AES-GCM/keyring design, but make migration failure visible — _Part 3 · J. Credentials and account-data safety_  
  Startup currently ignores `secrets::migrate` errors, so plaintext can remain indefinitely without warning.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L283-L289][^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/secrets.rs#L109-L131]
- [ ] **D3-157** (P0) — Do not silently continue with legacy plaintext forever — _Part 3 · J. Credentials and account-data safety_  
  Offer retry, secure-storage troubleshooting, or session removal.
- [ ] **D3-158** (P0) — Delete the credential-store key on full account-data reset only after encrypted secrets are removed — _Part 3 · J. Credentials and account-data safety_  
  Otherwise retained ciphertext becomes undecryptable.
- [ ] **D3-159** (P0) — Add key-loss recovery UX — _Part 3 · J. Credentials and account-data safety_  
  If the Windows credential entry disappears, identify affected sessions and let the user reconnect without damaging library data.
- [ ] **D3-160** (P0) — Zeroize plaintext buffers where practical — _Part 3 · J. Credentials and account-data safety_  
  Avoid long-lived cookie/token copies and debug formatting.
- [ ] **D3-161** (P0) — Add log redaction tests — _Part 3 · J. Credentials and account-data safety_  
  Cookies, authorization headers, Spotify access tokens, login URLs, and account identifiers must never appear in production logs/crash reports.
- [ ] **D3-162** (P0) — Store token metadata separately from secrets — _Part 3 · J. Credentials and account-data safety_  
  Expiry and provider/account identity may remain plaintext; tokens/cookies must stay sealed.
- [ ] **D3-163** (P0) — Validate sessions against providers before saying “connected.” — _Part 3 · J. Credentials and account-data safety_  
  Token presence and expiry alone are not enough.
- [ ] **D3-164** (P0) — Rotate encryption format cleanly — _Part 3 · J. Credentials and account-data safety_  
  Version ciphertext and support transactional re-encryption when algorithms/key policy change.
- [ ] **D3-165** (P0) — Scope secrets by Windows user and app identifier — _Part 3 · J. Credentials and account-data safety_  
  Detect accidental reuse by forks/dev builds and document dev/prod separation.
- [ ] **D3-166** (P0) — Add a security-sensitive backup invariant test — _Part 3 · J. Credentials and account-data safety_  
  Enumerate every secret-class setting and fail CI if it is not sealed and excluded from backup.
- [ ] **S5-025** (P0) — Isolate login webviews from the main webview profile — _Part 5 · C. Authentication isolation and session secrets_  
  Login windows share the app's WebView2 profile, so logout calls `clear_all_browsing_data()` on `main`, wiping all browsing state for both services at once. Give each provider its own `data_directory` (or incognito where the flow allows it).[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L2890-L2947][^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L3497-L3532]
- [ ] **S5-026** (P0) — Per-provider logout — _Part 5 · C. Authentication isolation and session secrets_  
  Signing out of Spotify must not clear Google cookies and vice versa; delete only that provider's data directory.
- [ ] **S5-027** (P0) — Restrict login-window navigation — _Part 5 · C. Authentication isolation and session secrets_  
  Add `on_navigation` allowlists (`accounts.google.com`, `*.google.com`, `music.youtube.com`, `accounts.spotify.com`, `open.spotify.com`, required CDN/challenge hosts) and open everything else externally.
- [ ] **S5-028** (P0) — Limit the captured Google cookie set — _Part 5 · C. Authentication isolation and session secrets_  
  The code joins every cookie for `music.youtube.com` into one header. Keep only required auth cookies and record which are needed.
- [ ] **S5-029** (P0) — Never log or emit cookies/tokens — _Part 5 · C. Authentication isolation and session secrets_  
  Audit `format!` errors and events; add a redaction layer for `Cookie`, `Authorization`, `sp_dc`, `SAPISID`, and tokens.
- [ ] **S5-030** (P0) — Remove plaintext fallback when Credential Manager is unavailable — _Part 5 · C. Authentication isolation and session secrets_  
  Migration explicitly keeps sessions working when secure storage fails, which can leave the cookie in SQLite plaintext. Fail closed: ask the user to sign in again for that session only.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/secrets.rs#L1-L131]
- [ ] **S5-031** (P0) — Make Spotify reconnect durable — _Part 5 · C. Authentication isolation and session secrets_  
  `sp_dc` is now discarded (`REMOVED_KEYS`) and only the short-lived access token is kept, so Spotify silently becomes unauthenticated when the token expires. Either seal `sp_dc` with the same AES-GCM scheme and refresh automatically, or show an explicit "Reconnect Spotify" state.
- [ ] **S5-032** (P0) — Encrypt all session-adjacent values — _Part 5 · C. Authentication isolation and session secrets_  
  `accountEmail`, `accountName`, `accountChannelHandle`, `dataSyncId`, `visitorData`, and Spotify user IDs are personal data; seal them or move them to the sealed set.
- [ ] **S5-033** (P0) — Zeroize secrets in memory — _Part 5 · C. Authentication isolation and session secrets_  
  Use `zeroize`/`secrecy` for cookie and token strings and the cached key.
- [ ] **S5-034** (P0) — Detect expired/revoked sessions and recover — _Part 5 · C. Authentication isolation and session secrets_  
  Map 401/403 from InnerTube and Spotify to an account-expired state, stop retry loops, and prompt for re-login.
- [ ] **S5-035** (P0) — Session status must not expose secrets — _Part 5 · C. Authentication isolation and session secrets_  
  `session_status` already returns only profile fields; add a test that keeps it that way.
- [ ] **S5-036** (P0) — Avoid third-party gists in the Spotify token chain — _Part 5 · C. Authentication isolation and session secrets_  
  The token flow depends on a remote gist for secrets/hashes. Pin, bundle, and verify it (signature or hash) with a reviewed fallback so a remote change cannot alter auth behavior.
- [ ] **X3-016** (P0) — Secret migration failure is silently ignored, potentially leaving plaintext credentials — _Part 3 §7_  
  Additional Part 3 finding; implement with the matching D3 items and add a regression test.

### M2.3 Filesystem, asset protocol, data locations (9 tasks)

- **Goal:** Path resolver, portable data root, validated re-grants, canonicalized deletes, ACLs.
- **Depends on:** M1.3
- **Exit criteria:** Path traversal and tampered-DB tests pass.

- [ ] **S5-038** (P0) — Validate re-granted local file paths at startup — _Part 5 · D. Filesystem, asset protocol, and data locations_  
  Startup re-allows every `local_path` from the database. A tampered or restored database could grant arbitrary files. Require absolute, existing, regular files with audio extensions and skip others.
- [ ] **S5-039** (P0) — Strip `local_path` from restored backups or re-confirm it — _Part 5 · D. Filesystem, asset protocol, and data locations_  
  Backups restore `songs.local_path`; require a re-scan/relink instead of trusting paths from another machine.
- [ ] **S5-040** (P0) — Use `app.path()` instead of raw `%APPDATA%` — _Part 5 · D. Filesystem, asset protocol, and data locations_  
  `database_path()` falls back to `.` when `APPDATA` is missing, which can write the database to the current directory. Use Tauri's path resolver and fail clearly.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L254-L300]
- [ ] **S5-041** (P0) — Portable mode data location — _Part 5 · D. Filesystem, asset protocol, and data locations_  
  A portable build must store data beside the executable (`<exe>\data`) when a `portable` marker file exists, and never touch `%APPDATA%` or Credential Manager without consent.
- [ ] **S5-042** (P0) — Atomic writes everywhere — _Part 5 · D. Filesystem, asset protocol, and data locations_  
  Settings, downloads, caches, and backups must write to temp + fsync + rename.
- [ ] **S5-043** (P0) — Canonicalize before delete — _Part 5 · D. Filesystem, asset protocol, and data locations_  
  `download_remove` and `player_cache_remove` delete paths read from the database. Canonicalize and verify each path is inside the managed folder before `remove_file`.
- [ ] **S5-044** (P0) — Sanitize IDs used in file names — _Part 5 · D. Filesystem, asset protocol, and data locations_  
  Song IDs feed cache/download file names; enforce `[A-Za-z0-9_-]{1,64}`.
- [ ] **S5-045** (P0) — Disk-space checks and quotas — _Part 5 · D. Filesystem, asset protocol, and data locations_  
  Check free space before downloads/caching and enforce cache limits.
- [ ] **S5-046** (P0) — Correct ACLs on the data folder — _Part 5 · D. Filesystem, asset protocol, and data locations_  
  Create the data directory with user-only permissions; do not inherit permissive ACLs from portable locations.

### M2.4 Network hardening (8 tasks)

- **Goal:** Central HTTP policy: host allowlists, cookie scoping, redirects, size caps, rate limits, proxy.
- **Depends on:** M1.2
- **Exit criteria:** Policy unit tests; cookies never cross hosts (test).

- [ ] **S5-055** (P1) — Central HTTP policy — _Part 5 · F. Network hardening_  
  The shared client sets 10 s connect / 20 s request timeouts and rustls. Add an explicit host allowlist per subsystem and reject redirects to other hosts for authenticated requests.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L200-L216]
- [ ] **S5-056** (P1) — Never send cookies cross-host — _Part 5 · F. Network hardening_  
  Attach Google cookies only to `music.youtube.com`/`youtubei` hosts and Spotify credentials only to Spotify hosts; enforce in one request builder.
- [ ] **S5-057** (P1) — Retry/backoff policy — _Part 5 · F. Network hardening_  
  Standardize exponential backoff with jitter and respect `Retry-After` for 429/5xx.
- [ ] **S5-058** (P1) — Rate limiting per provider — _Part 5 · F. Network hardening_  
  Throttle lyrics providers, search, and sync to avoid account flags.
- [ ] **S5-059** (P1) — Response-size limits on JSON — _Part 5 · F. Network hardening_  
  Cap body size before `json()` to prevent memory exhaustion from bad responses.
- [ ] **S5-060** (P1) — Proxy support with authentication — _Part 5 · F. Network hardening_  
  Reference Meld has proxy settings; implement HTTP/SOCKS proxy with credentials in Credential Manager.
- [ ] **S5-061** (P1) — Respect system proxy and offline state — _Part 5 · F. Network hardening_  
  Detect offline and pause network work rather than looping errors.
- [ ] **S5-062** (P1) — Provider privacy disclosure — _Part 5 · F. Network hardening_  
  Lyrics providers receive title/artist; show which are enabled and allow disabling each (already partly in settings).

## Phase 3 — Data model, library sync, playlists, downloads/local files, history, backup (162 tasks)


### M3.1 Provenance data model (10 tasks)

- **Goal:** Provenance data model (tracks, track_sources, accounts, memberships, likes, playlist_entries, sync_runs) + migration.
- **Depends on:** M1.3
- **Exit criteria:** Migration from current schema lossless on fixtures.

- [ ] **D3-019** (P0) — Separate local likes, YouTube likes, and Spotify likes — _Part 3 · B. Replace overloaded flags with source/account provenance · Checklist_  
  Do not use one `liked` bit as both a UI aggregate and a provider’s source of truth.
- [ ] **D3-020** (P0) — Separate imported-local membership from YouTube library membership — _Part 3 · B. Replace overloaded flags with source/account provenance · Checklist_  
  This directly fixes local files being hidden by a YouTube sync.
- [ ] **D3-021** (P0) — Attach every remote state to an account — _Part 3 · B. Replace overloaded flags with source/account provenance · Checklist_  
  Switching Google or Spotify accounts must not overwrite another account’s library.
- [ ] **D3-022** (P0) — Preserve disconnected-account data — _Part 3 · B. Replace overloaded flags with source/account provenance · Checklist_  
  Mark it detached/stale and let the user choose keep, hide, export, or delete.
- [ ] **D3-023** (P0) — Model local UI aggregate state as a query/view — _Part 3 · B. Replace overloaded flags with source/account provenance · Checklist_  
  “Liked Songs” can union enabled providers without destroying provider-specific facts.
- [ ] **D3-024** (P0) — Store remote mutation state — _Part 3 · B. Replace overloaded flags with source/account provenance · Checklist_  
  Use `pending_add`, `pending_remove`, `synced`, `failed`, retry count, and last error so offline actions are durable.
- [ ] **D3-025** (P0) — Add tombstones — _Part 3 · B. Replace overloaded flags with source/account provenance · Checklist_  
  A deletion made offline must not be resurrected by an older remote snapshot.
- [ ] **D3-026** (P0) — Record metadata ownership per field or source — _Part 3 · B. Replace overloaded flags with source/account provenance · Checklist_  
  A sync must not overwrite a user-edited title/artist with stale remote metadata unless the user requests “refetch metadata.”
- [ ] **D3-027** (P0) — Add alias/mapping history — _Part 3 · B. Replace overloaded flags with source/account provenance · Checklist_  
  Preserve manual Spotify→YouTube choices and track replacements; never overwrite manual mappings automatically.
- [ ] **D3-028** (P0) — Do not infer song identity from display metadata — _Part 3 · B. Replace overloaded flags with source/account provenance · Checklist_  
  Use provider IDs, ISRC where available, file fingerprints, and explicit mappings.

### M3.2 Safe sync engine (36 tasks)

- **Goal:** Generation-based staged sync with completion proof, outbox, tombstones, multi-account.
- **Depends on:** M3.1
- **Exit criteria:** Sync test matrix (Part 3 C) passes.

- [ ] **D3-029** (P0) — Stage remote snapshots in temporary tables — _Part 3 · C. Safe synchronization engine · Required design_  
  Never clear live state while parsing/fetching.
- [ ] **D3-030** (P0) — Require an explicit completion proof — _Part 3 · C. Safe synchronization engine · Required design_  
  All pages must finish without error, continuations must terminate normally, repeated continuation loops must be treated as incomplete, and every parsed page must satisfy expected structure.
- [ ] **D3-031** (P0) — Use sync generations — _Part 3 · C. Safe synchronization engine · Required design_  
  Mark each seen membership with the run generation; only remove prior memberships after the run is confirmed complete.
- [ ] **D3-032** (P0) — Add plausibility guards beyond “not empty.” — _Part 3 · C. Safe synchronization engine · Required design_  
  Compare count to the previous complete run, server total where available, page count, and expected collection type. Large unexpected drops should require confirmation or be retained as a pending diff.
- [ ] **D3-033** (P0) — Distinguish an authoritative empty account from a failed empty parser — _Part 3 · C. Safe synchronization engine · Required design_  
  Require a valid source container/endpoint response and completion metadata before accepting zero items.
- [ ] **D3-034** (P0) — Make sync idempotent — _Part 3 · C. Safe synchronization engine · Required design_  
  Reapplying the same complete snapshot must produce no changes and no modified timestamps.
- [ ] **D3-035** (P0) — Do not call remote mutation APIs while applying a remote snapshot — _Part 3 · C. Safe synchronization engine · Required design_  
  Reconciliation should use local-only setters. The reference’s `toggleLibrary()` can launch YouTube writes and should not be copied into reconciliation code.[^https://github.com/FrancescoGrazioso/Meld/blob/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/db/entities/SongEntity.kt#L72-L109][^https://github.com/FrancescoGrazioso/Meld/blob/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/utils/SyncUtils.kt#L790-L847]
- [ ] **D3-036** (P0) — Serialize sync per provider/account/collection — _Part 3 · C. Safe synchronization engine · Required design_  
  Multiple clicks or startup syncs must coalesce rather than race.
- [ ] **D3-037** (P0) — Support cancellation without partial commit — _Part 3 · C. Safe synchronization engine · Required design_  
  Cancellation during fetch discards staging; cancellation during apply rolls back.
- [ ] **D3-038** (P0) — Persist sync status — _Part 3 · C. Safe synchronization engine · Required design_  
  Show last successful run, current phase, items/pages fetched, pending changes, and failure reason after restart.
- [ ] **D3-039** (P0) — Add bounded retry/backoff with Retry-After support — _Part 3 · C. Safe synchronization engine · Required design_  
  Do not retry authentication or parser failures as transient network failures.
- [ ] **D3-040** (P0) — Detect account changes before apply — _Part 3 · C. Safe synchronization engine · Required design_  
  Bind the run to the account stable ID and abort if credentials switch during fetch.
- [ ] **D3-041** (P0) — Preserve local-only likes and imported files — _Part 3 · C. Safe synchronization engine · Required design_  
  Membership removal must target only rows owned by the same provider and account.
- [ ] **D3-042** (P0) — Keep downloaded tracks even when remote membership disappears — _Part 3 · C. Safe synchronization engine · Required design_  
  Mark source availability separately; do not make a downloaded file unreachable.
- [ ] **D3-043** (P0) — Keep playlist contents atomic — _Part 3 · C. Safe synchronization engine · Required design_  
  Build new entries in staging, then swap only after the remote playlist is proven complete.
- [ ] **D3-044** (P0) — Preserve occurrence identity — _Part 3 · C. Safe synchronization engine · Required design_  
  Use YouTube `setVideoId` or provider occurrence IDs for duplicate tracks and exact removal/reorder.
- [ ] **D3-045** (P0) — Add conflict policy — _Part 3 · C. Safe synchronization engine · Required design_  
  Define what wins when local and remote both changed since the last sync; surface unresolved conflicts instead of guessing.
- [ ] **D3-046** (P0) — Add dry-run/diff support — _Part 3 · C. Safe synchronization engine · Required design_  
  For large removals, show “remote now has X; Y local memberships would be removed” before applying.
- [ ] **D3-047** (P0) — Add per-source capability policy — _Part 3 · C. Safe synchronization engine · Required design_  
  YouTube, Spotify, local files, and imports do not support the same operations; the UI and sync layer must know this.
- [ ] **D3-048** (P0) — Never represent an incomplete capped Spotify fetch as complete — _Part 3 · C. Safe synchronization engine · Required design_  
  The reference caps likes at 3,000 and then can treat the truncated set as a removal authority for mapped tracks. Desktop should either page fully or mark the snapshot partial and prohibit removals.[^https://github.com/FrancescoGrazioso/Meld/blob/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/utils/SyncUtils.kt#L1208-L1345]
- [ ] **D3-049** (P0) — Zero-item valid collection — _Part 3 · C. Safe synchronization engine · Required sync test matrix_  
  Existing remote state should be removed only with proof that empty is authoritative.
- [ ] **D3-050** (P0) — Parser returns zero from a non-empty malformed response — _Part 3 · C. Safe synchronization engine · Required sync test matrix_  
  No local changes.
- [ ] **D3-051** (P0) — First page succeeds, continuation fails — _Part 3 · C. Safe synchronization engine · Required sync test matrix_  
  No removals; safe retry from a known cursor if supported.
- [ ] **D3-052** (P0) — Repeated continuation token — _Part 3 · C. Safe synchronization engine · Required sync test matrix_  
  Abort as incomplete; no removals.
- [ ] **D3-053** (P0) — Remote count suddenly drops 95% — _Part 3 · C. Safe synchronization engine · Required sync test matrix_  
  Hold a pending diff and require confirmation/retry.
- [ ] **D3-054** (P0) — Local file plus YouTube library sync — _Part 3 · C. Safe synchronization engine · Required sync test matrix_  
  Imported file remains visible and playable.
- [ ] **D3-055** (P0) — Two Google accounts with overlapping IDs — _Part 3 · C. Safe synchronization engine · Required sync test matrix_  
  Each membership remains isolated.
- [ ] **D3-056** (P0) — Local, YouTube, and Spotify like on the same track — _Part 3 · C. Safe synchronization engine · Required sync test matrix_  
  Removing one source’s like leaves the other two intact.
- [ ] **D3-057** (P0) — Offline local mutation then remote snapshot — _Part 3 · C. Safe synchronization engine · Required sync test matrix_  
  Pending mutation is preserved and retried or conflict-resolved.
- [ ] **D3-058** (P0) — Downloaded remote track removed from service — _Part 3 · C. Safe synchronization engine · Required sync test matrix_  
  Offline item remains accessible with an unavailable-source badge.
- [ ] **D3-059** (P0) — Duplicate playlist occurrences — _Part 3 · C. Safe synchronization engine · Required sync test matrix_  
  Exact occurrence order and removal survive sync.
- [ ] **X3-001** (P0) — YouTube library sync resets imported local-file membership — _Part 3 §7_  
  Additional Part 3 finding; implement with the matching D3 items and add a regression test.
- [ ] **X3-002** (P0) — The empty-response safeguard still accepts destructive partial snapshots — _Part 3 §7_  
  Additional Part 3 finding; implement with the matching D3 items and add a regression test.
- [ ] **X3-003** (P0) — Multi-account ownership is absent across songs, likes, playlists, and sync state — _Part 3 §7_  
  Additional Part 3 finding; implement with the matching D3 items and add a regression test.
- [ ] **X3-017** (P0) — The reference’s own sync code must not be copied blindly because it conflates reconciliation setters with remote-mutating toggle methods — _Part 3 §7_  
  Additional Part 3 finding; implement with the matching D3 items and add a regression test.
- [ ] **TR-L8** (P1) — Optimistic-action reconciliation with visible retry state — _Technical review (Appendix G)_  
  D3 outbox / R6 G.

### M3.3 Likes, follows, podcasts, account lifecycle (14 tasks)

- **Goal:** Likes, follows, podcasts, account lifecycle on the new model.
- **Depends on:** M3.2
- **Exit criteria:** Tests for like/follow round-trips and account switch.

- [ ] **D3-060** (P1) — Make “Meld Like” and “YouTube Like” visibly distinct or configurable — _Part 3 · D. Likes, library, follows, albums, podcasts, and account lifecycle_  
  Current state has two flags but users need a predictable aggregate and sync policy.
- [ ] **D3-061** (P1) — Persist the local state only after a confirmed remote mutation—or use an explicit pending state — _Part 3 · D. Likes, library, follows, albums, podcasts, and account lifecycle_  
  Avoid remote success/local failure and local success/remote failure ambiguity.
- [ ] **D3-062** (P1) — Add compensation/retry records — _Part 3 · D. Likes, library, follows, albums, podcasts, and account lifecycle_  
  If YouTube accepts a like but SQLite fails, record a reconciliation task rather than only returning an error.
- [ ] **D3-063** (P1) — Update local library membership after `ytm_toggle_library` — _Part 3 · D. Likes, library, follows, albums, podcasts, and account lifecycle_  
  The backend currently sends feedback but does not persist the resulting membership; the UI can remain stale until a later sync.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L2848-L2857]
- [ ] **D3-064** (P1) — Give albums provider-specific membership — _Part 3 · D. Likes, library, follows, albums, podcasts, and account lifecycle_  
  Current liked/library/uploaded album flags are reset by collection sync without source ownership.
- [ ] **D3-065** (P1) — Add full artist follow/subscription parity — _Part 3 · D. Likes, library, follows, albums, podcasts, and account lifecycle_  
  Persist provider/account ownership, remote mutation status, last refresh, channel ID, Spotify artist ID, and local bookmark independently.
- [ ] **D3-066** (P1) — Separate podcast subscription from saved episodes — _Part 3 · D. Likes, library, follows, albums, podcasts, and account lifecycle_  
  Do not overload generic library membership for episode “save for later.”
- [ ] **D3-067** (P1) — Preserve per-episode playback position — _Part 3 · D. Likes, library, follows, albums, podcasts, and account lifecycle_  
  Restore the reference/release behavior for podcasts and long-form audio.
- [ ] **D3-068** (P1) — Define logout choices precisely — _Part 3 · D. Likes, library, follows, albums, podcasts, and account lifecycle_  
  “Disconnect,” “disconnect and hide this account’s synced content,” and “delete this account’s local data” must be separate actions.
- [ ] **D3-069** (P1) — Keep downloads on logout by default — _Part 3 · D. Likes, library, follows, albums, podcasts, and account lifecycle_  
  They are user-owned local files. Explain that restored/account-detached media may need metadata rematching.
- [ ] **D3-070** (P1) — Clear credential-manager material on explicit full sign-out — _Part 3 · D. Likes, library, follows, albums, podcasts, and account lifecycle_  
  Deleting encrypted SQLite values is not enough if the user requests “remove all account data”; delete the key only when no retained encrypted secrets need it.
- [ ] **D3-071** (P1) — Clear or partition WebView login state per provider — _Part 3 · D. Likes, library, follows, albums, podcasts, and account lifecycle_  
  Current global browsing-data clear may also sign out unrelated embedded providers; use isolated profiles where possible.
- [ ] **D3-072** (P1) — Add account-switch confirmation when destructive sync is pending — _Part 3 · D. Likes, library, follows, albums, podcasts, and account lifecycle_  
  Do not silently bind old local state to a new account.
- [ ] **D3-073** (P1) — Add a “rebuild from providers” function only after export/backup — _Part 3 · D. Likes, library, follows, albums, podcasts, and account lifecycle_  
  It must preserve local edits, local files, downloads, and manual mappings.

### M3.4 Playlists and interchange (16 tasks)

- **Goal:** Playlist occurrences, ordering keys, duplicates, CSV/M3U import/export.
- **Depends on:** M3.1
- **Exit criteria:** Playlist edit + interchange tests.

- [ ] **X3-013** (P0) — Local playlist design forbids duplicate occurrences and removes by song ID rather than occurrence — _Part 3 §7_  
  Additional Part 3 finding; implement with the matching D3 items and add a regression test.
- [ ] **D3-074** (P1) — Give every playlist entry a unique occurrence ID — _Part 3 · E. Playlists and portable interchange_  
  Use an auto-increment/UUID primary key; enforce order separately.
- [ ] **D3-075** (P1) — Allow duplicate tracks — _Part 3 · E. Playlists and portable interchange_  
  Desktop currently rejects any song ID already in the playlist, which is not 1:1 parity with a true ordered playlist.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L4093-L4102]
- [ ] **D3-076** (P1) — Remove by occurrence, not song ID — _Part 3 · E. Playlists and portable interchange_  
  Current removal deletes every occurrence if duplicates ever enter through migration/import.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L4105-L4109]
- [ ] **D3-077** (P1) — Preserve provider occurrence IDs — _Part 3 · E. Playlists and portable interchange_  
  Keep YouTube `setVideoId` and Spotify playlist item UID/snapshot/version.
- [ ] **D3-078** (P1) — Use stable fractional/order keys or transactional reindexing — _Part 3 · E. Playlists and portable interchange_  
  Avoid position collisions during concurrent inserts/reorders.
- [ ] **D3-079** (P1) — Add playlist revision/conflict detection — _Part 3 · E. Playlists and portable interchange_  
  Do not apply a reorder to a stale Spotify or YouTube snapshot.
- [ ] **D3-080** (P1) — Do not delete/recreate remote playlist metadata unnecessarily — _Part 3 · E. Playlists and portable interchange_  
  Upsert membership and preserve local annotations, downloaded-only retained items, cover state, and user sort choices.
- [ ] **D3-081** (P1) — Add explicit playlist delete and rename for local playlists — _Part 3 · E. Playlists and portable interchange_  
  Include confirmation, undo where feasible, and orphan cleanup.
- [ ] **D3-082** (P1) — Add local playlist reorder with keyboard and pointer support — _Part 3 · E. Playlists and portable interchange_  
  Persist atomically and test duplicates.
- [ ] **D3-083** (P1) — Implement CSV export/import — _Part 3 · E. Playlists and portable interchange_  
  Include title, artists, album, duration, provider IDs, URL, local path only when the user opts in, and a schema version.
- [ ] **D3-084** (P1) — Implement M3U/M3U8 export/import — _Part 3 · E. Playlists and portable interchange_  
  Use UTF-8, relative-path option, `#EXTINF`, provider URLs, and clear handling for unavailable local paths.
- [ ] **D3-085** (P1) — Add JSON backup/export for lossless Desktop data — _Part 3 · E. Playlists and portable interchange_  
  CSV/M3U are interchange formats, not full backups.
- [ ] **D3-086** (P1) — Report partial imports — _Part 3 · E. Playlists and portable interchange_  
  Show exact rows skipped, ambiguous matches, duplicates, missing local files, and how to fix them.
- [ ] **D3-087** (P1) — Add source-to-local copy semantics — _Part 3 · E. Playlists and portable interchange_  
  “Save a remote playlist locally” must clearly choose snapshot-only versus ongoing auto-sync.
- [ ] **D3-088** (P1) — Add auto-sync retention policy — _Part 3 · E. Playlists and portable interchange_  
  If a downloaded item disappears remotely, place it in a clearly labeled retained/offline section rather than silently appending it to a supposedly mirrored playlist.

### M3.5 Downloads/cache/filesystem reconciliation (24 tasks)

- **Goal:** Downloads/cache reconciliation with filesystem, integrity, quotas.
- **Depends on:** M3.1, M2.3
- **Exit criteria:** Startup reconciliation tests; missing files detected.

- [ ] **X3-010** (P0) — Download removal trusts the path stored in SQLite without canonical ownership validation — _Part 3 §7_  
  Additional Part 3 finding; implement with the matching D3 items and add a regression test.
- [ ] **X3-011** (P0) — Missing completed downloads remain falsely completed in the DB — _Part 3 §7_  
  Additional Part 3 finding; implement with the matching D3 items and add a regression test.
- [ ] **D3-089** (P1) — Add a startup storage reconciler — _Part 3 · F. Downloads, cache, and filesystem reconciliation_  
  Compare database rows to files and files to database rows before presenting Downloaded/Cached libraries.
- [ ] **D3-090** (P1) — Convert missing completed files into an explicit `missing` state — _Part 3 · F. Downloads, cache, and filesystem reconciliation_  
  Do not merely hide them while leaving a completed row.
- [ ] **D3-091** (P1) — Quarantine or delete orphan files — _Part 3 · F. Downloads, cache, and filesystem reconciliation_  
  Include unknown final files, stale `.part` files, orphan artwork, and obsolete cache generations.
- [ ] **D3-092** (P1) — Verify file size before `completed` — _Part 3 · F. Downloads, cache, and filesystem reconciliation_  
  If `Content-Length`/Content-Range gives an expected total, downloaded bytes must match it.
- [ ] **D3-093** (P1) — Verify media structure — _Part 3 · F. Downloads, cache, and filesystem reconciliation_  
  Parse the container/codec and reject HTML/JSON/error bodies saved with an audio extension.
- [ ] **D3-094** (P1) — Store content identity — _Part 3 · F. Downloads, cache, and filesystem reconciliation_  
  Persist source ID, itag/format, codec, quality, expected length, ETag/Last-Modified if useful, and a checksum or chunk verification strategy.
- [ ] **D3-095** (P1) — Use safe finalization — _Part 3 · F. Downloads, cache, and filesystem reconciliation_  
  Flush and `sync_all` the file, atomically rename on the same volume, then update the DB in the correct order. Recover deterministically from a crash at each point.
- [ ] **D3-096** (P1) — Keep retryable partials — _Part 3 · F. Downloads, cache, and filesystem reconciliation_  
  Current `main` deletes partial files on any failure; restore v0.1.8-style resume only after validating Content-Range and source representation.
- [ ] **D3-097** (P1) — Do not concatenate different representations — _Part 3 · F. Downloads, cache, and filesystem reconciliation_  
  A renewed signed URL may point to another itag/quality. Resume only if the persisted format identity still matches.
- [ ] **D3-098** (P1) — Add disk-space preflight and reserve — _Part 3 · F. Downloads, cache, and filesystem reconciliation_  
  Refuse cleanly before starting if expected size plus safety margin does not fit.
- [ ] **D3-099** (P1) — Add download queue persistence — _Part 3 · F. Downloads, cache, and filesystem reconciliation_  
  Queued, active, paused, failed, and retry schedule must survive restart.
- [ ] **D3-100** (P1) — Add bounded concurrency — _Part 3 · F. Downloads, cache, and filesystem reconciliation_  
  Separate metadata resolution concurrency from byte-transfer concurrency.
- [ ] **D3-101** (P1) — Add retry/backoff categories — _Part 3 · F. Downloads, cache, and filesystem reconciliation_  
  Retry transient network, 429, and refreshed expired URLs; do not loop on unsupported format or permission errors.
- [ ] **D3-102** (P1) — Add per-download pause/resume and retry — _Part 3 · F. Downloads, cache, and filesystem reconciliation_  
  Cancellation should not necessarily discard a valid partial.
- [ ] **D3-103** (P1) — Add global storage quota and cache LRU — _Part 3 · F. Downloads, cache, and filesystem reconciliation_  
  Explicit downloads are never evicted automatically; playback cache is evictable and quality-aware.
- [ ] **D3-104** (P1) — Make cache keys quality/format-aware — _Part 3 · F. Downloads, cache, and filesystem reconciliation_  
  `song_id` alone cannot safely identify multiple quality/container variants.
- [ ] **D3-105** (P1) — Store downloads outside backup by policy, but reconcile on restore — _Part 3 · F. Downloads, cache, and filesystem reconciliation_  
  Restored rows must become `missing/not_restored`, not pretend the omitted media exists.
- [ ] **D3-106** (P1) — Offer optional media backup separately — _Part 3 · F. Downloads, cache, and filesystem reconciliation_  
  Make the potentially huge size and destination explicit; stream entries rather than buffering.
- [ ] **D3-107** (P1) — Validate stored paths — _Part 3 · F. Downloads, cache, and filesystem reconciliation_  
  App-managed download/cache rows must resolve under app-owned canonical roots; reject path traversal or symlink escape before deleting files.
- [ ] **D3-108** (P1) — Never delete an arbitrary database-provided path without ownership validation — _Part 3 · F. Downloads, cache, and filesystem reconciliation_  
  `download_remove` currently removes the stored path directly.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L1228-L1242]
- [ ] **D3-109** (P1) — Unify file and row transactions with an operation journal — _Part 3 · F. Downloads, cache, and filesystem reconciliation_  
  SQLite cannot atomically commit filesystem renames; record intent and recover on startup.
- [ ] **D3-110** (P1) — Add “verify downloads” and “repair library” actions — _Part 3 · F. Downloads, cache, and filesystem reconciliation_  
  Show checked, valid, missing, corrupt, and repaired counts.

### M3.6 Local files (15 tasks)

- **Goal:** Local files: rescan, move/delete reconciliation, multi-artist, metadata.
- **Depends on:** M3.1, M2.3
- **Exit criteria:** Local library tests.

- [ ] **X3-012** (P0) — Local imports have no rescan/moved/deleted reconciliation and persist only the first artist relation — _Part 3 §7_  
  Additional Part 3 finding; implement with the matching D3 items and add a regression test.
- [ ] **D3-111** (P1) — Add folders and rescanning, not only one-time file picking — _Part 3 · G. Local-file library correctness_  
  Users need watched roots, manual rescan, include/exclude rules, and scan progress.
- [ ] **D3-112** (P1) — Persist authorized roots/handles safely — _Part 3 · G. Local-file library correctness_  
  Re-grant per-file asset access on every startup after validating the file still exists.
- [ ] **D3-113** (P1) — Reconcile moved, renamed, modified, and deleted files — _Part 3 · G. Local-file library correctness_  
  `date_modified` is stored but no rescan uses it.
- [ ] **D3-114** (P1) — Use stable file identity — _Part 3 · G. Local-file library correctness_  
  Path hash changes on rename. Prefer volume/file ID where available plus content fingerprint fallback.
- [ ] **D3-115** (P1) — Detect duplicate files and duplicate audio content — _Part 3 · G. Local-file library correctness_  
  Let users keep separate files or merge metadata intentionally.
- [ ] **D3-116** (P1) — Preserve all artists and album metadata — _Part 3 · G. Local-file library correctness_  
  Current import stores only the first artist relation and does not create album relations.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L3812-L3824]
- [ ] **D3-117** (P1) — Handle embedded artwork lifecycle — _Part 3 · G. Local-file library correctness_  
  Deduplicate by content hash, validate image size/type, remove orphan artwork, and refresh it when tags change.
- [ ] **D3-118** (P1) — Separate original metadata from user edits — _Part 3 · G. Local-file library correctness_  
  Rescan should update source metadata without overwriting edited title/artist fields.
- [ ] **D3-119** (P1) — Add unavailable-file state — _Part 3 · G. Local-file library correctness_  
  Missing external media should stay in playlists/history with a relink action.
- [ ] **D3-120** (P1) — Add “locate replacement” and bulk relink — _Part 3 · G. Local-file library correctness_  
  Match by filename, tags, duration, and fingerprint with a confidence review.
- [ ] **D3-121** (P1) — Validate decodability during scan — _Part 3 · G. Local-file library correctness_  
  Extension allowlists alone do not prove an audio file is valid.
- [ ] **D3-122** (P1) — Avoid holding the DB mutex while parsing every selected file — _Part 3 · G. Local-file library correctness_  
  Parse metadata outside the lock, then batch-commit valid results.
- [ ] **D3-123** (P1) — Add folder privacy controls — _Part 3 · G. Local-file library correctness_  
  Never include external absolute paths in portable exports/backups unless explicitly selected.
- [ ] **D3-124** (P1) — Add local-file removal choices — _Part 3 · G. Local-file library correctness_  
  “Remove from Meld” must not delete the original; a separate “delete original file” action requires explicit confirmation and Recycle Bin integration.

### M3.7 History, stats, retention, privacy (13 tasks)

- **Goal:** History/stats correctness (measured playtime), retention, privacy controls.
- **Depends on:** M3.1
- **Exit criteria:** Stats tests vs fixtures.

- [ ] **X3-014** (P0) — Main regressed measured play time and now overestimates listening statistics — _Part 3 §7_  
  Additional Part 3 finding; implement with the matching D3 items and add a regression test.
- [ ] **X3-015** (P0) — “Clear local library but keep downloads” also removes imported local-file records and many unrelated local-only structures — _Part 3 §7_  
  Additional Part 3 finding; implement with the matching D3 items and add a regression test.
- [ ] **D3-125** (P1) — Restore measured play time — _Part 3 · H. History, statistics, retention, and privacy_  
  Reintroduce `play_time_ms` or event segments and update it periodically/at stop.
- [ ] **D3-126** (P1) — Define when a play counts — _Part 3 · H. History, statistics, retention, and privacy_  
  Do not insert history merely when playback is requested; require actual playback and a threshold.
- [ ] **D3-127** (P1) — Handle seeks, repeats, resume, and crashes — _Part 3 · H. History, statistics, retention, and privacy_  
  Accumulate listened intervals without double counting.
- [ ] **D3-128** (P1) — Preserve source and account context — _Part 3 · H. History, statistics, retention, and privacy_  
  Record local/YouTube/Spotify source, queue context, and device version where privacy policy permits.
- [ ] **D3-129** (P1) — Add a foreign key or deliberate tombstone snapshot to history — _Part 3 · H. History, statistics, retention, and privacy_  
  Current history has no FK but UI joins it to songs, so deleting a song silently hides history.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L87-L91][^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L3654-L3659]
- [ ] **D3-130** (P1) — Do not estimate minutes as full duration × starts — _Part 3 · H. History, statistics, retention, and privacy_  
  Use measured listening duration. Current main overstates skipped tracks.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L3630-L3651]
- [ ] **D3-131** (P1) — Add retention controls — _Part 3 · H. History, statistics, retention, and privacy_  
  Forever, 90 days, 30 days, or disabled; clearly separate local history from remote YouTube history.
- [ ] **D3-132** (P1) — Make “clear history” transactional — _Part 3 · H. History, statistics, retention, and privacy_  
  Delete history and orphan cleanup in one transaction.
- [ ] **D3-133** (P1) — Add scoped clear actions — _Part 3 · H. History, statistics, retention, and privacy_  
  Local listen history, search history, remote YouTube history, stats, and recognition history must not be conflated.
- [ ] **D3-134** (P1) — Add export before delete — _Part 3 · H. History, statistics, retention, and privacy_  
  JSON/CSV export for history and stats.
- [ ] **D3-135** (P1) — Add privacy documentation — _Part 3 · H. History, statistics, retention, and privacy_  
  State exactly what remains locally, what is sent to each provider, and what backups contain.

### M3.8 Backup, restore, export, disaster recovery (34 tasks)

- **Goal:** Backup v2: manifest, streaming, schema migration on restore, safety copy, encrypted option, Android import.
- **Depends on:** M3.1
- **Exit criteria:** Backup/restore round-trip and corruption tests.

- [ ] **D3-136** (P0) — Add a manifest — _Part 3 · I. Backup, restore, export, and disaster recovery · Fix_  
  Include format version, app version, schema version, created time, platform, entry list, sizes, checksums, and whether media/auth are included.
- [ ] **D3-137** (P0) — Stream backup entries — _Part 3 · I. Backup, restore, export, and disaster recovery · Fix_  
  Do not `read_to_end` the complete SQLite copy.
- [ ] **D3-138** (P0) — Use separate small caps — _Part 3 · I. Backup, restore, export, and disaster recovery · Fix_  
  `settings.json` should be kilobytes/low megabytes, not allowed up to 500 MiB. Cap entry count, archive size, compression ratio, and total extracted bytes.
- [ ] **D3-139** (P0) — Reject duplicate critical entries — _Part 3 · I. Backup, restore, export, and disaster recovery · Fix_  
  Two `song.db` or `settings.json` entries must be invalid rather than “last one wins.”
- [ ] **D3-140** (P0) — Validate checksums before opening — _Part 3 · I. Backup, restore, export, and disaster recovery · Fix_  
  Manifest checksum mismatch aborts before database swap.
- [ ] **D3-141** (P0) — Validate `application_id` and schema version — _Part 3 · I. Backup, restore, export, and disaster recovery · Fix_  
  Do not accept an arbitrary SQLite database merely because it has four matching table names.
- [ ] **D3-142** (P0) — Run migrations on the staged database — _Part 3 · I. Backup, restore, export, and disaster recovery · Fix_  
  Never promote an old schema to live and ask the user to restart before knowing it can migrate.
- [ ] **D3-143** (P0) — Run foreign-key and semantic checks on staged data — _Part 3 · I. Backup, restore, export, and disaster recovery · Fix_  
  Detect invalid paths, illegal state values, missing playlist parents, and unsupported settings.
- [ ] **D3-144** (P0) — Preserve the old database until the restored app has reopened successfully — _Part 3 · I. Backup, restore, export, and disaster recovery · Fix_  
  Current restore deletes `.restore.previous` immediately after `Connection::open`, before later commands prove schema compatibility.
- [ ] **D3-145** (P0) — Reapply runtime pragmas and secret migration to the restored connection — _Part 3 · I. Backup, restore, export, and disaster recovery · Fix_  
  Current swap simply opens the file and stores the connection.
- [ ] **D3-146** (P0) — Reconcile omitted media after restore — _Part 3 · I. Backup, restore, export, and disaster recovery · Fix_  
  Downloads/cache are intentionally excluded, so mark those rows missing or exclude them from the logical backup.
- [ ] **D3-147** (P0) — Add a restore preview — _Part 3 · I. Backup, restore, export, and disaster recovery · Fix_  
  Show backup date/version, counts, settings, accounts excluded, media excluded, conflicts, and required migrations.
- [ ] **D3-148** (P0) — Add restore modes — _Part 3 · I. Backup, restore, export, and disaster recovery · Fix_  
  Replace everything, merge library/playlists, settings only, and inspect/export without restore.
- [ ] **D3-149** (P0) — Prevent same-path and temporary-file collisions — _Part 3 · I. Backup, restore, export, and disaster recovery · Fix_  
  Generate temp files in the app’s recovery directory, not by changing the user-selected output extension.
- [ ] **D3-150** (P0) — Clean failed output archives — _Part 3 · I. Backup, restore, export, and disaster recovery · Fix_  
  A backup error should not leave a partial file looking valid.
- [ ] **D3-151** (P0) — Flush the backup archive before reporting success — _Part 3 · I. Backup, restore, export, and disaster recovery · Fix_  
  Sync destination data where practical.
- [ ] **D3-152** (P0) — Keep a recovery journal — _Part 3 · I. Backup, restore, export, and disaster recovery · Fix_  
  On startup, detect `.restore.part`/`.restore.previous` and complete or roll back deterministically.
- [ ] **D3-153** (P0) — Add downgrade-safe export — _Part 3 · I. Backup, restore, export, and disaster recovery · Fix_  
  A newer app should offer a portable data export even when an older app cannot open its database.
- [ ] **D3-154** (P0) — Add scheduled optional backups — _Part 3 · I. Backup, restore, export, and disaster recovery · Fix_  
  Local-only, bounded retention, clearly disclosed destination, never credentials by default.
- [ ] **D3-155** (P0) — Test malicious archives — _Part 3 · I. Backup, restore, export, and disaster recovery · Fix_  
  Huge claimed sizes, high compression ratios, duplicate names, truncated ZIPs, corrupt SQLite, future schemas, invalid JSON, symlinks, and cancellation.
- [ ] **X3-004** (P0) — Restore checks only four table names and integrity, not schema compatibility — _Part 3 §7_  
  Additional Part 3 finding; implement with the matching D3 items and add a regression test.
- [ ] **X3-005** (P0) — Restored databases are not migrated before promotion — _Part 3 §7_  
  Additional Part 3 finding; implement with the matching D3 items and add a regression test.
- [ ] **X3-006** (P0) — Restored connections do not reapply initialization, runtime pragmas, or secret migration immediately — _Part 3 §7_  
  Additional Part 3 finding; implement with the matching D3 items and add a regression test.
- [ ] **X3-007** (P0) — Backups and restores buffer the entire database in memory — _Part 3 §7_  
  Additional Part 3 finding; implement with the matching D3 items and add a regression test.
- [ ] **X3-008** (P0) — Backups have no manifest, checksum, format version, duplicate-entry rule, or compression-ratio limit — _Part 3 §7_  
  Additional Part 3 finding; implement with the matching D3 items and add a regression test.
- [ ] **X3-009** (P0) — Omitted media and restored download rows are not reconciled — _Part 3 §7_  
  Additional Part 3 finding; implement with the matching D3 items and add a regression test.
- [ ] **S5-047** (P1) — Version the backup format — _Part 5 · E. Backup and restore safety_  
  Add `manifest.json` with format version, app version, schema version, created time, and SHA-256 of entries.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L3684-L3793]
- [ ] **S5-048** (P1) — Stream instead of loading entire databases into memory — _Part 5 · E. Backup and restore safety_  
  Restore reads up to 500 MB per entry into memory and creation reads the whole DB into a `Vec`; stream with `std::io::copy`.
- [ ] **S5-049** (P1) — Treat oversized entries as an error — _Part 5 · E. Backup and restore safety_  
  An oversized `song.db` is silently skipped, then reported as missing. Return an explicit size error.
- [ ] **S5-050** (P1) — Validate full schema compatibility — _Part 5 · E. Backup and restore safety_  
  Restore only checks four table names; run migrations on the candidate and reject newer-than-supported schemas.
- [ ] **S5-051** (P1) — Keep a pre-restore safety copy — _Part 5 · E. Backup and restore safety_  
  Do not delete `restore.previous` immediately; keep the last pre-restore database until the next successful launch.
- [ ] **S5-052** (P1) — Use SQLite's online backup API for creation — _Part 5 · E. Backup and restore safety_  
  Avoid holding the main DB mutex during `VACUUM INTO` on large libraries.
- [ ] **S5-053** (P1) — Optional encrypted backups — _Part 5 · E. Backup and restore safety_  
  Offer a password-protected backup (Argon2id + AES-GCM) for users who move libraries between machines.
- [ ] **S5-054** (P1) — Reference-compatible import — _Part 5 · E. Backup and restore safety_  
  Support importing Meld Android backups as a separate, validated path (see Part 3).

## Phase 4 — Playback engine: coordinator, media protocol, resolver, cache/download engine, formats, audio (110 tasks)


### M4.1 Playback coordinator and media protocol (22 tasks)

- **Goal:** PlaybackCoordinator state machine + meld-media:// Range protocol; React stops receiving raw URLs.
- **Depends on:** M1.2, M1.3
- **Exit criteria:** Coordinator transition tests; audio plays via protocol; seeking works.

- [ ] **PLAY-027** (P0) — Raw remote URL is handed to HTML audio — _Part 1 · C. Transport, WebView2, ranges, and recovery_  
  **Found:** React sets `<audio src>` directly, so Rust cannot reliably apply headers, inspect ranges, refresh midstream, or unify caching. **Fix:** introduce a Rust-backed Tauri media protocol or native player. **Done when:** React receives only a session URI and all media bytes pass through the coordinator.
- [ ] **PLAY-029** (P1) — No bounded/chunked range strategy — _Part 1 · C. Transport, WebView2, ranges, and recovery_  
  **Found:** Desktop ignores resolver range requirements. **Fix:** support normal ranges, bounded ranges, chunk progression, and transparent re-resolution. **Done when:** range-required fixtures seek/play without 403 or premature EOF.
- [ ] **PLAY-034** (P1) — Queue is committed before preparation succeeds — _Part 1 · C. Transport, WebView2, ranges, and recovery_  
  **Found:** `playItem` updates queue/index before `ytm_player` returns. If resolution fails, the previous audio may continue while queue UI points at another item. **Fix:** maintain `pendingPlayback`; atomically commit player/queue only after prepare succeeds, or explicitly stop the old session. **Done when:** failed preparation cannot desynchronize audible track, queue index, and displayed metadata.
- [ ] **PLAY-036** (P1) — v0.1.8 quality changes do not reload current playback — _Part 1 · C. Transport, WebView2, ranges, and recovery_  
  **Found:** saving Audio quality changes only the setting; the current song remains on its old stream. **Fix:** offer “apply next track” or safely re-prepare current track at the same position. **Done when:** behavior is explicit and tested.
- [ ] **PLAY-037** (P1) — Browser errors lack HTTP status/client information — _Part 1 · C. Transport, WebView2, ranges, and recovery_  
  **Found:** HTML audio reports only that it could not read the URL. **Fix:** move transport to Rust and return structured source/status/stage diagnostics. **Done when:** 403, timeout, decode error, CORS, unsupported codec, and missing file are distinguishable.
- [ ] **PLAY-063** (P1) — History begins before confirmed audible playback — _Part 1 · E. Frontend state, queue, history, and UX_  
  **Found:** history/playtime setup occurs after resolution/setPlayer, before audio `play()` is confirmed; main adds history during prepare. Failed playback can be counted. **Fix:** add history only after a confirmed Playing state and threshold; store attempts separately for diagnostics. **Done when:** resolve/decode/autoplay failures do not increment plays.
- [ ] **PLAY-064** (P1) — No single playback state machine — _Part 1 · E. Frontend state, queue, history, and UX_  
  **Found:** booleans and refs (`player`, `isPlaying`, queue index, pending requests, resume refs) can represent contradictory states. **Fix:** reducer/state machine with explicit transitions and session IDs. **Done when:** illegal transitions are impossible/tested.
- [ ] **PLAY-065** (P1) — Main and v0.1.8 use different stale-request mechanisms — _Part 1 · E. Frontend state, queue, history, and UX_  
  **Found:** main uses `playSeqRef`; v0.1.8 uses another request-generation flow. **Fix:** move cancellation/generation into `PlaybackCoordinator`, cancel network work, and ignore stale completions at one boundary. **Done when:** rapid 100-item clicking always leaves the final requested item active with no leaked jobs.
- [ ] **PLAY-066** (P1) — Auto-skip may skip recoverable errors — _Part 1 · E. Frontend state, queue, history, and UX_  
  **Found:** generic audio error can immediately advance when enabled. **Fix:** exhaust bounded same-track recovery first; only then auto-skip with a logged final reason. **Done when:** expired/bad-client streams recover instead of skipping.
- [ ] **PLAY-067** (P1) — Playback loading/buffering is not modeled clearly — _Part 1 · E. Frontend state, queue, history, and UX_  
  **Found:** users mostly get a notice string while old audio may continue. **Fix:** show Preparing/Buffering/Recovering per pending session and retain old-track identity until commit. **Done when:** UI always identifies what is audible vs pending.
- [ ] **PLAY-068** (P1) — `timeupdate` rerenders the monolithic app — _Part 1 · E. Frontend state, queue, history, and UX_  
  **Found:** playback seconds update React state several times per second in a 1,800–2,200-line root component. **Fix:** isolate player store/component; throttle display updates; keep high-frequency position outside global render. **Done when:** profiling large libraries shows stable frame time.
- [ ] **PLAY-069** (P1) — Persisted playback format is unversioned localStorage — _Part 1 · E. Frontend state, queue, history, and UX_  
  **Found:** v0.1.8 stores queue/playback JSON in localStorage without an explicit schema version/migration. **Fix:** version the payload, validate it, cap size, and migrate/clear safely. Prefer backend persistence for one source of truth. **Done when:** corrupt/old payload tests cannot prevent startup.
- [ ] **PLAY-070** (P1) — Playback persistence and stream persistence are mixed conceptually — _Part 1 · E. Frontend state, queue, history, and UX_  
  **Found:** queue/item/position are valid to persist, raw expiring URLs are not. **Fix:** persist only stable track/context/session state; always resolve a fresh stream on restore. **Done when:** restore never reuses an expired URL.
- [ ] **PLAY-071** (P1) — No robust same-song replay contract — _Part 1 · E. Frontend state, queue, history, and UX_  
  **Found:** behavior differs by branch/effect dependencies. **Fix:** define actions: Resume, Restart current, Replay from queue, Re-resolve at same position. Each creates or updates a session deliberately. **Done when:** each action has unit/integration tests.
- [ ] **PLAY-038** (P2) — No seekability model — _Part 1 · C. Transport, WebView2, ranges, and recovery_  
  **Found:** seek slider assumes duration/seek behavior from HTML audio. **Fix:** expose duration, buffered ranges, seekable ranges, and live/unknown-length flags. **Done when:** slider disables or constrains itself correctly.
- [ ] **PLAY-039** (P2) — No gapless pipeline — _Part 1 · C. Transport, WebView2, ranges, and recovery_  
  **Found:** each song is assigned to one HTML audio element after resolution. **Fix:** use a player capable of pre-preparation and gapless transitions; keep crossfade optional and separate. **Done when:** consecutive compatible tracks have measured near-zero unintended gap.
- [ ] **PLAY-040** (P2) — No Windows audio-device lifecycle — _Part 1 · C. Transport, WebView2, ranges, and recovery_  
  **Found:** there is no handling for device removal/default-device changes beyond WebView behavior. **Fix:** add device-change monitoring and recover/rebind while preserving playback state. **Done when:** switching headphones/output does not strand playback.
- [ ] **PLAY-072** (P2) — Position/duration source can be inaccurate — _Part 1 · E. Frontend state, queue, history, and UX_  
  **Found:** cached payload duration may be zero and UI depends on HTML metadata. **Fix:** reconcile source metadata, container duration, and player duration; prefer validated player duration for seeking. **Done when:** 0:00 and unknown-duration cases behave consistently.
- [ ] **PLAY-073** (P2) — No buffered-range UI — _Part 1 · E. Frontend state, queue, history, and UX_  
  **Found:** seek UI shows current/duration only. **Fix:** expose buffered segments and cache/download state. **Done when:** users can distinguish buffered vs unavailable seek regions.
- [ ] **PLAY-074** (P2) — Playback errors are not copyable/redacted reports — _Part 1 · E. Frontend state, queue, history, and UX_  
  **Found:** upstream added detailed copyable playback reports; Desktop uses transient notices. **Fix:** error drawer with safe details, retry, change source/version, report, and copy. **Done when:** report contains no cookies, tokens, full signed URLs, emails, or local paths.
- [ ] **PLAY-075** (P2) — Queue continuation and stream preparation are coupled in UI — _Part 1 · E. Frontend state, queue, history, and UX_  
  **Found:** React fetches/extends queues and resolves playback in the same large component. **Fix:** separate QueueCoordinator from PlaybackCoordinator with an atomic handoff. **Done when:** queue load failures do not corrupt current playback.
- [ ] **PLAY-076** (P2) — No preload contract — _Part 1 · E. Frontend state, queue, history, and UX_  
  **Found:** Desktop full-caches in background rather than preparing only enough of the next track. **Fix:** bounded next-track resolver/initial-chunk preload respecting network and cache policy. **Done when:** next-track startup improves without downloading abandoned queues.

### M4.2 Robust resolver (30 tasks)

- **Goal:** Resolver: dynamic client config, fallback memory, headers, nonce, host allowlist, region/language, error taxonomy, network policy for playback.
- **Depends on:** M4.1
- **Exit criteria:** Resolver fixture suite (plain/cipher/uploaded/restricted/podcast) passes.

- [ ] **PLAY-002** (P1) — Direct-URL-only extraction — _Part 1 · A. Resolver and YouTube player requests_  
  **Found:** formats containing `signatureCipher` or `cipher` are always discarded. **Fix:** use a maintained extractor with dynamic player configuration and legal signature/`n` transformation support; keep DRM and ad-bypass explicitly out of scope. **Done when:** supported ciphered, uploaded, restricted, and plain-URL fixtures resolve through one tested interface.
- [ ] **PLAY-003** (P1) — No dynamic player configuration — _Part 1 · A. Resolver and YouTube player requests_  
  **Found:** client versions/configuration are hardcoded in Rust. Upstream uses remote configuration with ETag/cache and embedded fallback. **Fix:** add a signed/versioned remote client/player-config registry with cached last-known-good and embedded fallback. **Done when:** a stale config can refresh without releasing a new binary and cannot be replaced by an untrusted payload.
- [ ] **PLAY-004** (P1) — Hardcoded client versions age silently — _Part 1 · A. Resolver and YouTube player requests_  
  **Found:** versions and device strings are dated constants. **Fix:** move them to the validated registry, record config age, and expose diagnostics. **Done when:** the app warns internally when last-known-good config exceeds a chosen age.
- [ ] **PLAY-005** (P1) — No failed-client memory — _Part 1 · A. Resolver and YouTube player requests_  
  **Found:** every resolution retries clients in the same order; a client producing an immediate 403 remains first next time. **Fix:** remember failed client/video pairs with a short TTL, like upstream's five-minute exclusion set. **Done when:** immediate stream rejection retries with the next client and subsequent attempts temporarily avoid the failed one.
- [ ] **PLAY-006** (P1) — Only the last resolver failure is returned — _Part 1 · A. Resolver and YouTube player requests_  
  **Found:** prior client failures are collected but the final error displays only the last string. **Fix:** return a redacted structured diagnostic containing each attempted client, stage, status, playability reason, and rejection category. **Done when:** users see a concise message and can copy a safe detailed report.
- [ ] **PLAY-007** (P1) — Missing content hints — _Part 1 · A. Resolver and YouTube player requests_  
  **Found:** Desktop does not pass uploaded/explicit/podcast/live content hints to extraction. **Fix:** persist these flags and feed them into resolver strategy selection. **Done when:** uploaded and restricted-track fixtures choose suitable authenticated clients.
- [ ] **PLAY-008** (P1) — Main dropped playlist context — _Part 1 · A. Resolver and YouTube player requests_  
  **Found:** v0.1.8 sends `playlistId` to `/player`; main always sends null. **Fix:** retain queue/source context through prepare and resolver requests. **Done when:** album, playlist, radio, podcast, uploaded, and standalone playback tests preserve context.
- [ ] **PLAY-009** (P1) — No client playback nonce — _Part 1 · A. Resolver and YouTube player requests_  
  **Found:** upstream generates a client playback nonce; Desktop does not. **Fix:** add required request/session nonce fields through the extractor abstraction. **Done when:** resolver request fixtures match the selected client's current contract.
- [ ] **PLAY-010** (P1) — No PoToken capability — _Part 1 · A. Resolver and YouTube player requests_  
  **Found:** Desktop has no optional token-provider interface. **Fix:** design a token-provider plugin with strict timeout/cancellation and fallback to clients that do not require it. Do not silently make login mandatory. **Done when:** token-required responses either resolve through an approved provider or fail with an explicit reason.
- [ ] **PLAY-011** (P1) — Client-specific stream headers are discarded — _Part 1 · A. Resolver and YouTube player requests_  
  **Found:** Desktop returns URL/mime/bitrate only. Upstream propagates request headers with the stream. **Fix:** include validated headers in `ResolvedStream` and apply them in the Rust media broker. Never expose cookies/tokens to React. **Done when:** header-dependent streams play and secrets never enter frontend state/logs.
- [ ] **PLAY-012** (P1) — Browser request identity differs from resolver client — _Part 1 · A. Resolver and YouTube player requests_  
  **Found:** Rust resolves as VisionOS/Android/iOS/TV, but WebView2 fetches the audio using its own browser headers. **Fix:** fetch through the Rust media protocol using the exact resolver-supplied headers. **Done when:** the same client identity is used from player request through byte fetch.
- [ ] **PLAY-013** (P1) — No stream-host allowlist — _Part 1 · A. Resolver and YouTube player requests_  
  **Found:** a URL from player JSON is fetched by Rust without validating HTTPS/host. **Fix:** require HTTPS and approved Google media hosts, validate every redirect, reject loopback/private/link-local destinations, and maintain separate allowlists per provider. **Done when:** SSRF/redirect tests cannot reach local or arbitrary hosts.
- [ ] **PLAY-014** (P1) — Region and language are hardcoded to US/en — _Part 1 · A. Resolver and YouTube player requests_  
  **Found:** every player request sends `gl: US`, `hl: en`. **Fix:** use user/account locale with a stable fallback; keep locale separate from UI language. **Done when:** regional catalog/restriction behavior matches the signed-in account where possible.
- [ ] **PLAY-030** (P1) — Immediate 403/410 does not trigger client fallback — _Part 1 · C. Transport, WebView2, ranges, and recovery_  
  **Found:** main refreshes only when elapsed time has reached `expiresInSeconds`; a newly issued bad URL falls through as a generic audio error. **Fix:** classify HTTP/media failures; invalidate immediately on 403/410, mark the source client failed, and re-resolve while preserving position. **Done when:** an immediate rejection retries another client automatically.
- [ ] **PLAY-032** (P1) — No expiry safety margin — _Part 1 · C. Transport, WebView2, ranges, and recovery_  
  **Found:** a stream can be accepted seconds before expiry and fail during startup/seek. **Fix:** subtract a safety margin and estimate whether the requested operation can complete; refresh before resume/large seek. **Done when:** near-expiry sessions are proactively replaced.
- [ ] **PLAY-033** (P1) — No retry limit/state visible to UI — _Part 1 · C. Transport, WebView2, ranges, and recovery_  
  **Found:** frontend notices are strings; there is no Recovering state or attempt count. **Fix:** model bounded retries with reason, attempt, and next action. **Done when:** UI distinguishes buffering, recovering, final failure, and auto-skip.
- [ ] **R6-012** (P1) — Bound continuation loops — _Part 6 · B. Network performance and reliability_  
  Library and playlist fetchers loop until no token is returned; add max pages, total timeout, and cancellation.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L1934-L1969]
- [ ] **R6-013** (P1) — Parallelize independent requests with limits — _Part 6 · B. Network performance and reliability_  
  Sync liked/library/uploaded/playlists concurrently with a small semaphore.
- [ ] **R6-014** (P1) — Request deduplication — _Part 6 · B. Network performance and reliability_  
  Coalesce identical in-flight requests (same browse ID/continuation).
- [ ] **R6-015** (P1) — Response caching with TTL — _Part 6 · B. Network performance and reliability_  
  Cache home, album, artist, playlist, and lyrics responses with ETag/TTL and stale-while-revalidate.
- [ ] **R6-016** (P1) — Consistent retry/backoff — _Part 6 · B. Network performance and reliability_  
  Only a few code paths retry; use one policy for idempotent requests with jitter and `Retry-After`.
- [ ] **R6-017** (P1) — Distinguish timeout, offline, auth, rate-limit, and parse failures — _Part 6 · B. Network performance and reliability_  
  Each maps to a different UI state and retry strategy.
- [ ] **R6-018** (P1) — Parser resilience telemetry (local) — _Part 6 · B. Network performance and reliability_  
  Count renderer types that fail to parse so layout changes are detected quickly.
- [ ] **R6-019** (P1) — HTTP/2 and connection reuse verification — _Part 6 · B. Network performance and reliability_  
  Confirm the shared client reuses connections; tune pool idle timeout.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L200-L216]
- [ ] **R6-020** (P1) — Prefetch next track stream URL — _Part 6 · B. Network performance and reliability_  
  Resolve the next queue item's stream before the current track ends for gapless transitions.
- [ ] **R6-021** (P1) — Expired stream URL handling everywhere — _Part 6 · B. Network performance and reliability_  
  Recent fix covers playback; apply the same refresh to downloads and cache fills.
- [ ] **TR-H2** (P1) — Playback fundamentally behind upstream Meld 0.9.2 — _Technical review (Appendix G)_  
  Phase 4 resolver/coordinator work (PLAY-002…017, 027…).
- [ ] **PLAY-015** (P2) — Playability errors lack taxonomy — _Part 1 · A. Resolver and YouTube player requests_  
  **Found:** every non-OK status becomes a generic string. **Fix:** classify sign-in required, age restriction, region restriction, unavailable, members-only, transient, rate-limited, and extractor failure. **Done when:** each category has a useful action and retry policy.
- [ ] **PLAY-016** (P2) — No resolver prewarm — _Part 1 · A. Resolver and YouTube player requests_  
  **Found:** first play performs all initialization on demand. **Fix:** prewarm configuration and safe resolver metadata after startup without resolving a track. **Done when:** cold-start resolution latency is measured and reduced without background account activity.
- [ ] **PLAY-017** (P2) — No resolver metrics — _Part 1 · A. Resolver and YouTube player requests_  
  **Found:** there is no measurement of client success rate, stage latency, cache hits, or recovery. **Fix:** add local structured metrics with privacy-safe opt-in diagnostics export. **Done when:** a report can show why startup/playback is slow without exposing IDs, cookies, or URLs.

### M4.3 One-stream cache/download engine (32 tasks)

- **Goal:** One-stream read-through cache + download job engine: quotas, LRU, resume, integrity, correct MIME, no double download.
- **Depends on:** M4.1, M3.5
- **Exit criteria:** Range/expiry/corruption/disk-full tests pass.

- [ ] **PLAY-041** (P0) — No cache quota or eviction — _Part 1 · D. Player cache and explicit downloads_  
  **Found:** every played song can spawn a full-file cache download; no size/age limit exists. **Fix:** configurable byte quota plus LRU eviction, pin downloaded items, and show usage. **Done when:** stress tests cannot exceed quota beyond a bounded in-progress allowance.
- [ ] **PLAY-042** (P0) — Unlimited concurrent player-cache jobs — _Part 1 · D. Player cache and explicit downloads_  
  **Found:** rapid skipping can spawn one full download per distinct song. **Fix:** bounded scheduler (for example one active playback fill plus one low-priority prefetch), cancellation, and backpressure. **Done when:** rapid skipping cannot exhaust sockets, disk, or memory.
- [ ] **PLAY-028** (P1) — Playback and cache download the same song twice — _Part 1 · C. Transport, WebView2, ranges, and recovery_  
  **Found:** HTML audio fetches the stream while Rust separately downloads the full file into player cache. **Fix:** use read-through/tee caching: one upstream byte stream serves playback and cache. **Done when:** network instrumentation shows no duplicate full download for normal playback.
- [ ] **PLAY-043** (P1) — Player-cache jobs survive skip/close — _Part 1 · D. Player cache and explicit downloads_  
  **Found:** closing or changing tracks does not cancel the background full download. **Fix:** tie cache-fill cancellation to session lifecycle unless explicitly retained as prefetch. **Done when:** abandoned sessions release network/file handles promptly.
- [ ] **PLAY-044** (P1) — No final byte-count validation — _Part 1 · D. Player cache and explicit downloads_  
  **Found:** a clean premature EOF is renamed and treated as complete; cache lookup only checks `bytes > 0` and file existence. **Fix:** compare bytes with content length/content-range where known; otherwise validate container finalization/decoder probe before commit. **Done when:** truncated fixtures never become completed cache rows.
- [ ] **PLAY-045** (P1) — No content-type/container validation — _Part 1 · D. Player cache and explicit downloads_  
  **Found:** a 200 HTML/error body can be cached if the server/redirect does not use an error status. **Fix:** validate content type, magic bytes/container structure, and expected format. **Done when:** HTML/JSON/error fixtures are rejected.
- [ ] **PLAY-046** (P1) — Redirect targets are not revalidated — _Part 1 · D. Player cache and explicit downloads_  
  **Found:** reqwest follows redirects without a media-host policy. **Fix:** custom redirect policy that validates every hop and limits hop count. **Done when:** redirect-to-private-host and redirect-loop tests fail safely.
- [ ] **PLAY-047** (P1) — No pre-download disk-space check — _Part 1 · D. Player cache and explicit downloads_  
  **Found:** cache/download can fill the drive. **Fix:** estimate required size, preserve a safety reserve, and stop gracefully when space drops. **Done when:** low-disk tests retain a valid partial state and clear error.
- [ ] **PLAY-048** (P1) — Generic `.audio` extension and lost format identity — _Part 1 · D. Player cache and explicit downloads_  
  **Found:** all media uses a generic extension. **Fix:** store container/MIME metadata and use internal content-addressed naming; extension is optional if the custom protocol serves correct type. **Done when:** local playback does not depend on sniffing.
- [ ] **PLAY-049** (P1) — Quality cache schema cannot hold multiple qualities — _Part 1 · D. Player cache and explicit downloads_  
  **Found:** v0.1.8 queries by `(song_id, quality)` but `song_id` alone is the primary key and all qualities use the same path. **Fix:** choose one policy: either one cache entry per song that is invalidated/replaced safely, or composite primary key `(song_id, quality, source)` with distinct paths. **Done when:** switching quality has deterministic storage behavior.
- [ ] **PLAY-050** (P1) — Windows replacement rename can fail — _Part 1 · D. Player cache and explicit downloads_  
  **Found:** re-download/quality change renames `.part` onto an existing final path without a Windows-safe replace sequence. **Fix:** close readers, use unique temp files, atomically replace with rollback, and update DB only after success. **Done when:** repeated download and quality-switch tests pass on Windows.
- [ ] **PLAY-051** (P1) — Flush is not durability — _Part 1 · D. Player cache and explicit downloads_  
  **Found:** files call `flush()` but not `sync_all()` before rename/DB completion. **Fix:** sync file, atomically rename, optionally sync parent directory where supported, then commit DB state. **Done when:** fault-injection tests never mark incomplete bytes completed.
- [ ] **PLAY-052** (P1) — v0.1.8 resume does not validate `Content-Range` — _Part 1 · D. Player cache and explicit downloads_  
  **Found:** any 206 is appended; start/end/total are not checked. **Fix:** require `Content-Range` start equals local length, validate total and ETag/Last-Modified identity, otherwise restart. **Done when:** wrong-range fixtures cannot corrupt files.
- [ ] **PLAY-053** (P1) — Resume can combine bytes from different stream formats — _Part 1 · D. Player cache and explicit downloads_  
  **Found:** partial file identity does not record itag/quality/ETag/source. A new resolver response may produce another format before append. **Fix:** persist a partial-download manifest and only resume an identical representation. **Done when:** changed-format/quality fixtures restart rather than append.
- [ ] **PLAY-054** (P1) — v0.1.8 resume wastes a request — _Part 1 · D. Player cache and explicit downloads_  
  **Found:** when a range request is not resumable, the first response is discarded and a second GET starts from zero. **Fix:** if the first response is 200, reuse that body as the restart stream after truncating the partial file. **Done when:** fallback-to-full performs one request.
- [ ] **PLAY-057** (P1) — SQLite background writers lack a concurrency policy — _Part 1 · D. Player cache and explicit downloads_  
  **Found:** spawned cache tasks open independent connections; schema setup does not establish WAL/busy timeout for all connections. **Fix:** use a database pool/actor, WAL where appropriate, busy timeout, and short transactions. **Done when:** concurrent playback/cache/history/download stress has no `database is locked` losses.
- [ ] **PLAY-058** (P1) — Player-cache errors are silent — _Part 1 · D. Player cache and explicit downloads_  
  **Found:** cache task failures delete `.part` but do not expose reason/state. **Fix:** persist cache-job status and emit diagnostics; do not disturb playback for optional-cache failure. **Done when:** users can see storage/cache problems without generic playback errors.
- [ ] **R6-022** (P1) — Correct the cached MIME type — _Part 6 · C. Playback reliability and caching_  
  Cached playback always reports `audio/mpeg` even though YouTube audio is usually Opus/WebM or AAC/MP4; store the real MIME/container with the cache entry.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L1319-L1360]
- [ ] **R6-023** (P1) — Cap player cache size — _Part 6 · C. Playback reliability and caching_  
  Every played track is fully cached with no size limit or eviction.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L130-L135] Add an LRU limit (user-configurable) and eviction on startup/idle.
- [ ] **R6-024** (P1) — Avoid double downloads — _Part 6 · C. Playback reliability and caching_  
  Playback streams from the network while a parallel full download fills the cache; stream from the cache file as it fills or use range requests.
- [ ] **R6-025** (P1) — Validate cache completeness — _Part 6 · C. Playback reliability and caching_  
  Store expected length/hash and discard truncated files.
- [ ] **R6-026** (P1) — Clean orphaned `.part` files at startup — _Part 6 · C. Playback reliability and caching_  
  Crashes leave partial files in cache/download folders.
- [ ] **R6-027** (P1) — Download queue with concurrency limits — _Part 6 · C. Playback reliability and caching_  
  Bounded parallel downloads, resumable with HTTP ranges, persisted across restarts.
- [ ] **R6-028** (P1) — Gapless and crossfade timing tests — _Part 6 · C. Playback reliability and caching_  
  Automated tests using fixture audio to measure transition gaps.
- [ ] **R6-029** (P1) — Audio device change recovery — _Part 6 · C. Playback reliability and caching_  
  Resume correctly when headphones/Bluetooth devices disconnect or reconnect.
- [ ] **R6-030** (P1) — Playback watchdog — _Part 6 · C. Playback reliability and caching_  
  Detect stalled playback (no progress for N seconds while playing) and recover by refreshing the stream.
- [ ] **R6-031** (P1) — Error-skip guard — _Part 6 · C. Playback reliability and caching_  
  Auto-skip on error must stop after K consecutive failures instead of draining the queue.
- [ ] **TR-M7** (P1) — Downloads not at upstream reliability — _Technical review (Appendix G)_  
  Phase 4 download engine (PLAY-041…062, D3 F).
- [ ] **PLAY-059** (P2) — No integrity fingerprint — _Part 1 · D. Player cache and explicit downloads_  
  **Found:** completed files are trusted by row + size. **Fix:** store a fast hash or container fingerprint after completion and verify on suspicious reads/startup reconciliation. **Done when:** modified files are detected and repaired/removed.
- [ ] **PLAY-060** (P2) — No startup file/DB reconciliation — _Part 1 · D. Player cache and explicit downloads_  
  **Found:** missing/orphaned cache files and stale rows can accumulate. **Fix:** bounded startup/background reconciliation for rows, final files, and temp files. **Done when:** crash-created inconsistencies self-heal.
- [ ] **PLAY-061** (P2) — No separate playback/download quality policy — _Part 1 · D. Player cache and explicit downloads_  
  **Found:** v0.1.8 passes current audio quality into explicit download. **Fix:** provide independent streaming, Wi-Fi download, metered download, and Qobuz policies. **Done when:** changing playback quality does not unexpectedly alter download policy.
- [ ] **PLAY-062** (P2) — Lyrics/artwork work delays download completion — _Part 1 · D. Player cache and explicit downloads_  
  **Found:** after audio rename, the command waits for artwork and all enabled lyrics before marking completed. **Fix:** commit audio completion first; schedule optional artwork/lyrics enrichment independently with their own statuses. **Done when:** provider timeout cannot make a valid audio download look failed/incomplete.

### M4.4 Format and audio parity (19 tasks)

- **Goal:** Quality selection, decoder checks, format metadata, loudness, speed/varispeed, podcast position, crossfade/gapless, EQ, lyrics provider policy.
- **Depends on:** M4.2
- **Exit criteria:** Format/quality tests; audio feature tests.

- [ ] **PLAY-018** (P1) — Quality selection is bitrate-only — _Part 1 · B. Format selection and metadata_  
  **Found:** Desktop chooses highest/lowest bitrate with a small WebM bonus. **Fix:** score by supported codec, container, bitrate, sample rate, channels, source stability, and user policy. **Done when:** table-driven fixtures choose a decodable and policy-correct format.
- [ ] **PLAY-019** (P1) — No decoder capability check — _Part 1 · B. Format selection and metadata_  
  **Found:** any `audio/*` direct format may win. **Fix:** maintain a WebView2/native decoder capability matrix or move decoding to a controlled native engine. **Done when:** unsupported codec fixtures are skipped before playback.
- [ ] **PLAY-020** (P1) — Auto quality is not automatic — _Part 1 · B. Format selection and metadata_  
  **Found:** v0.1.8's Auto always behaves like High because metered-network detection is absent. **Fix:** use Windows network cost APIs and allow user overrides for metered, battery saver, and download quality. **Done when:** Auto changes policy on simulated metered/unmetered networks.
- [ ] **PLAY-022** (P1) — No persisted format metadata — _Part 1 · B. Format selection and metadata_  
  **Found:** Desktop does not persist itag, codec, content length, sample rate, channel count, loudness, or source client. **Fix:** add a versioned `formats` table and store only non-expiring metadata; never persist raw stream URLs. **Done when:** media-info UI and cache validation use the recorded format.
- [ ] **PLAY-023** (P1) — Cached media is reported as `audio/mpeg` — _Part 1 · B. Format selection and metadata_  
  **Found:** cached files may contain Opus/WebM or AAC/MP4 but the payload hardcodes MPEG. **Fix:** persist actual MIME/container and use a matching extension or content-type response. **Done when:** cache playback reports and serves the original format correctly.
- [ ] **TR-M5** (P1) — Lyrics behaviour stale vs upstream — _Technical review (Appendix G)_  
  Provider policy refresh: Musixmatch off/removed, YouTube synced lyrics, consider Zemer, per-provider timeout/quality scoring.
- [ ] **PLAY-024** (P2) — Weak original-language/audio-track selection — _Part 1 · B. Format selection and metadata_  
  **Found:** Desktop rejects auto-dubbed tracks but does not model multiple original/default audio tracks or language preference. **Fix:** parse audio-track metadata and prefer original/default according to user locale, with a manual override where available. **Done when:** multi-audio fixtures consistently choose the intended track.
- [ ] **PLAY-025** (P2) — No loudness metadata or normalization — _Part 1 · B. Format selection and metadata_  
  **Found:** loudness/perceptual loudness is discarded. **Fix:** persist loudness and implement a tested normalization processor in the native audio path. **Done when:** normalization gain is deterministic and clipping-protected.
- [ ] **PLAY-026** (P2) — No content-length-aware seeking policy — _Part 1 · B. Format selection and metadata_  
  **Found:** only URL/mime/bitrate/expiry reach the frontend. **Fix:** include content length and range capability in the stream session. **Done when:** seeking works on long/unknown-length files and bounded-range streams.
- [ ] **PLAY-077** (P2) — Playback speed support is branch-only and HTML-based — _Part 1 · E. Frontend state, queue, history, and UX_  
  **Found:** v0.1.8 changes HTML playbackRate/pitch preservation; main removes it. **Fix:** restore on the unified branch and verify WebView2/native behavior for rate, pitch, seeking, and podcasts. **Done when:** speed persists per policy and audio remains stable.
- [ ] **PLAY-078** (P2) — No per-podcast resume model — _Part 1 · E. Frontend state, queue, history, and UX_  
  **Found:** upstream stores episode position; Desktop's generic session restore is not equivalent. **Fix:** persist episode progress periodically and mark completion thresholds. **Done when:** each episode resumes independently across restarts.
- [ ] **PLAY-079** (P2) — Windows media integration is incomplete/regressed — _Part 1 · E. Frontend state, queue, history, and UX_  
  **Found:** v0.1.8 has taskbar controls; main deletes them; neither is a complete SMTC integration. **Fix:** restore taskbar support and add Windows SMTC metadata, play/pause/next/previous/seek, media keys, lock-screen controls, and state sync. **Done when:** all external controls operate through the same state machine.
- [ ] **PLAY-080** (P2) — No audio focus/communications policy — _Part 1 · E. Frontend state, queue, history, and UX_  
  **Found:** desktop relies on browser/system defaults. **Fix:** define behavior for sleep, lock, communication ducking, exclusive devices, and session interruptions. **Done when:** Windows lifecycle tests cover these transitions.
- [ ] **PLAY-081** (P2) — No real crossfade — _Part 1 · F. Audio processing and parity_  
  **Fix:** implement only after the core native audio graph is stable; prebuffer next track and handle repeat/shuffle/seek/error edges. **Done when:** measured overlap follows the setting and never double-counts history.
- [ ] **PLAY-082** (P2) — No silence skipping — _Part 1 · F. Audio processing and parity_  
  **Fix:** add a tested PCM processor with conservative thresholds and podcast/music policy. **Done when:** it skips silence without clipping quiet intros or breaking seeking.
- [ ] **PLAY-083** (P2) — No equalizer graph — _Part 1 · F. Audio processing and parity_  
  **Found:** v0.1.8 backend allows equalizer-related setting keys, but there is no complete exposed processing path. **Fix:** native multiband processor, presets, clipping prevention, bypass, and device/sample-rate tests. **Done when:** settings audibly affect output and survive format/device changes.
- [ ] **PLAY-084** (P2) — No normalization processor — _Part 1 · F. Audio processing and parity_  
  **Fix:** use source loudness metadata where available and a safe fallback analyzer; apply gain before limiter. **Done when:** reference tracks meet target loudness without clipping.
- [ ] **PLAY-085** (P2) — No gapless/crossfade compatibility matrix — _Part 1 · F. Audio processing and parity_  
  **Fix:** define what happens for local/YouTube/Qobuz, codec changes, podcasts, repeat one, manual seek, and errors. **Done when:** automated transition tests cover every pair.
- [ ] **PLAY-086** (P3) — No output/codec diagnostics — _Part 1 · F. Audio processing and parity_  
  **Fix:** media-info panel showing provider, client, codec, bitrate, sample rate, channels, normalization gain, cache source, and quality—never signed URL. **Done when:** support can diagnose “bad quality” reports without logs.

### M4.5 Playback verification (7 tasks)

- **Goal:** Playback verification: fault injection, soak, budgets.
- **Depends on:** M4.1–M4.4
- **Exit criteria:** Part 1 §5 acceptance passes.

- [ ] **PLAY-087** (P0) — No end-to-end playback CI — _Part 1 · G. Testing and release gates for playback_  
  **Fix:** Windows test harness with a mock InnerTube/media server, deterministic Range/403/expiry/stall fixtures, WebView/native startup smoke, and cache/download assertions. **Done when:** every PR runs the matrix.
- [ ] **PLAY-088** (P1) — Resolver tests cover too little — _Part 1 · G. Testing and release gates for playback_  
  **Found:** Desktop has format-selection unit tests but not client fallback, header propagation, status taxonomy, expiry, redirects, or malformed responses. **Fix:** table-driven fixtures and property/fuzz tests for JSON parsing. **Done when:** malformed upstream JSON cannot panic or select unsafe URLs.
- [ ] **PLAY-089** (P1) — No fault-injection tests — _Part 1 · G. Testing and release gates for playback_  
  **Fix:** inject network stalls, partial EOF, disk full, permission denied, DB locked, app crash, power-loss point, corrupt cache, wrong range, and rapid cancellation. **Done when:** no fixture produces a false completed state or stuck active lock.
- [ ] **PLAY-090** (P1) — No real Windows replacement/locking tests — _Part 1 · G. Testing and release gates for playback_  
  **Fix:** run file replace, open-file, antivirus-delay, and long-path tests on Windows CI. **Done when:** cache/download finalization is atomic under Windows semantics.
- [ ] **PLAY-092** (P1) — No playback security tests — _Part 1 · G. Testing and release gates for playback_  
  **Fix:** SSRF, redirect, hostile headers, oversized content, decompression, path traversal, log-redaction, and token-leak tests. **Done when:** generated reports and frontend events contain no secrets.
- [ ] **PLAY-093** (P2) — No long-session soak test — _Part 1 · G. Testing and release gates for playback_  
  **Fix:** 24-hour mocked queue with seeks, pauses beyond expiry, device changes, skips, cache pressure, and intermittent network. **Done when:** memory, tasks, handles, DB size, and cache remain bounded.
- [ ] **PLAY-094** (P2) — No performance budgets — _Part 1 · G. Testing and release gates for playback_  
  **Fix:** budgets for cold prepare, warm prepare, cache hit, next-track gap, CPU, memory, and disk writes. **Done when:** CI tracks regressions.

## Phase 5 — Queues, radio, Spotify matching, Spotify Home/Search/session (151 tasks)


### M5.1 Identity and queue coordinator (7 tasks)

- **Goal:** Typed source identity, unique entry IDs, versioned atomic queue persistence.
- **Depends on:** M4.1
- **Exit criteria:** Queue model tests.

- [ ] **QUEUE-002** (P1) — Introduce a typed source identity — _Part 2 · A. Canonical source and identity model_  
  **Found:** `YtItem.id`, `videoId`, Spotify ID, playlist item UID, setVideoId, browseId, and local path are mixed through one loose object. **Fix:** define `TrackIdentity { canonicalId, youtubeVideoId?, spotifyId?, playlistItemUid?, localFileId? }`. **Done when:** queue operations never guess which ID a string represents.
- [ ] **QUEUE-003** (P1) — Give every queue entry a unique instance ID — _Part 2 · A. Canonical source and identity model_  
  **Found:** operations find the current item by song ID, which breaks legitimate duplicate occurrences. **Fix:** `QueueEntry { entryId: UUID, track, sourceContext }`; use `entryId` for reorder/remove/current. **Done when:** the same song can appear twice and each occurrence behaves independently.
- [ ] **QUEUE-004** (P1) — Preserve source context explicitly — _Part 2 · A. Canonical source and identity model_  
  **Found:** playlist ID, continuation type, visible sort/filter, radio endpoint, Spotify source, and local source are passed ad hoc. **Fix:** typed `QueueOrigin` variants: YouTubeWatchNext, YouTubePlaylist, SpotifyPlaylist, SpotifyLiked, SpotifyRadio, LocalList, Downloads, Search, Stats. **Done when:** every queue can serialize and resume its origin without string heuristics.
- [ ] **QUEUE-005** (P1) — Separate track metadata from source metadata — _Part 2 · A. Canonical source and identity model_  
  **Found:** changing Spotify→YouTube matches can overwrite which title/artwork/source the UI presents. **Fix:** retain Spotify display metadata and resolved YouTube playback metadata separately, with an explicit display policy. **Done when:** manual match changes audio source without silently replacing Spotify identity.
- [ ] **QUEUE-006** (P1) — Version queue persistence — _Part 2 · A. Canonical source and identity model_  
  **Found:** v0.1.8 localStorage payload is unversioned and embeds loose `YtItem` objects. **Fix:** backend-owned, schema-versioned queue/session document with migration and validation. **Done when:** old/corrupt queue state cannot break startup.
- [ ] **QUEUE-007** (P1) — Make queue state atomic — _Part 2 · A. Canonical source and identity model_  
  **Found:** items/index/continuation/player are separate React states and update in multiple renders. **Fix:** one reducer/state machine or Rust QueueCoordinator snapshot. **Done when:** no observable state can have index outside items or current metadata disagreeing with entry.
- [ ] **QUEUE-008** (P2) — Retain source titles and provenance — _Part 2 · A. Canonical source and identity model_  
  **Found:** queue UI largely holds items without a durable source title/provenance contract. **Fix:** queue snapshot includes source label, source URL/entity, generated/manual state, and provider. **Done when:** UI can show “From Spotify playlist X,” “YouTube radio,” or “Local playlist Y.”

### M5.2 Canonical matcher (28 tasks)

- **Goal:** Single canonical Spotify→YouTube matcher with cache, scoring, confidence, overrides, regression corpus.
- **Depends on:** M5.1
- **Exit criteria:** Matcher corpus ≥ target accuracy; all call sites use it.

- [ ] **MATCH-001** (P0) — Remove the first-search-result matcher — _Part 2 · B. Spotify→YouTube matching_  
  **Found:** Spotify play/download uses `ytm_search` then first item of kind song. **Fix:** route every Spotify→YouTube action through one backend `resolve_spotify_track`. **Done when:** no frontend code performs matching or picks the first result.
- [ ] **MATCH-002** (P0) — One resolver for all call sites — _Part 2 · B. Spotify→YouTube matching_  
  **Found:** playback, playlist download, reverse add-to-Spotify, manual override, and cache lookup use different paths. **Fix:** one `TrackMatcher` service with forward/reverse/override methods. **Done when:** playback, download, queue generation, and UI preview return the same match.
- [ ] **MATCH-003** (P1) — Persist Spotify ID on queue items — _Part 2 · B. Spotify→YouTube matching_  
  **Found:** a resolved YTM item can lose the original Spotify ID, preventing direct override/cache lookup. **Fix:** carry both IDs through queue, history, download, and media info. **Done when:** every Spotify-origin play can open “Change YouTube version.”
- [ ] **MATCH-004** (P1) — Check memory cache first — _Part 2 · B. Spotify→YouTube matching_  
  **Found:** Desktop has DB cache but no shared bounded in-memory forward-match cache. **Fix:** process-wide thread-safe LRU keyed by Spotify track ID and matcher version. **Done when:** repeated matches avoid DB/network and cache is bounded.
- [ ] **MATCH-005** (P1) — Check DB cache before search — _Part 2 · B. Spotify→YouTube matching_  
  **Found:** frontend first-result path ignores the existing `spotify_match` table. **Fix:** DB lookup before any network call; manual overrides always win. **Done when:** cached/manual matches are used by playback and bulk download.
- [ ] **MATCH-006** (P1) — Version automatic matches — _Part 2 · B. Spotify→YouTube matching_  
  **Found:** cached scores have no algorithm/config version. **Fix:** store matcher version, source metadata hash, chosen candidate metadata, and validation timestamp. **Done when:** algorithm upgrades can re-evaluate only automatic matches.
- [ ] **MATCH-007** (P1) — Preserve manual overrides forever unless user resets them — _Part 2 · B. Spotify→YouTube matching_  
  **Found:** SQL protects manual overrides, which is good; every path must honor it. **Fix:** enforce at service boundary and add reset/rematch action. **Done when:** automatic/background refresh cannot replace a manual choice.
- [ ] **MATCH-008** (P1) — Use multiple YouTube candidates — _Part 2 · B. Spotify→YouTube matching_  
  **Found:** first-result path evaluates one candidate. **Fix:** search summary plus filtered song search; evaluate a bounded candidate set. **Done when:** score, not response order, decides.
- [ ] **MATCH-009** (P1) — Normalize Unicode safely — _Part 2 · B. Spotify→YouTube matching_  
  **Found:** main improved normalization to preserve non-Latin scripts; keep it and add diacritic/transliteration policy without destroying originals. **Fix:** Unicode normalization, case folding, punctuation/whitespace handling, script-aware tokens. **Done when:** Arabic, CJK, Cyrillic, accented Latin, and mixed-script corpus tests pass.
- [ ] **MATCH-010** (P1) — Parse version markers instead of deleting them blindly — _Part 2 · B. Spotify→YouTube matching_  
  **Found:** Desktop strips remix/remaster phrases during normalization, which can make intentional variants indistinguishable. **Fix:** extract structured markers: live, remix, remaster year, acoustic, instrumental, karaoke, sped/slowed, edit, clean, explicit. **Done when:** intentional live/remix tracks match the same version and studio tracks penalize extras.
- [ ] **MATCH-011** (P1) — Improve title score — _Part 2 · B. Spotify→YouTube matching_  
  **Fix:** combine token similarity, bigrams, ordered tokens, exact normalized equality, and featuring/version structure. **Done when:** a curated mismatch corpus beats the existing scorer.
- [ ] **MATCH-012** (P1) — Improve artist score — _Part 2 · B. Spotify→YouTube matching_  
  **Found:** only one flattened artist string is compared. **Fix:** compare artist sets, aliases, featured artists, primary artist, and collaboration separators. **Done when:** multi-artist tracks do not lose to same-title wrong artists.
- [ ] **MATCH-013** (P1) — Add album score — _Part 2 · B. Spotify→YouTube matching_  
  **Found:** Desktop scorer ignores album. **Fix:** include album/release title with reduced weight and tolerate singles/compilations. **Done when:** album version helps disambiguate remasters and live releases.
- [ ] **MATCH-014** (P1) — Strengthen duration scoring — _Part 2 · B. Spotify→YouTube matching_  
  **Found:** coarse buckets can still accept long mismatches. **Fix:** ratio/absolute model with stricter limits for short tracks and tolerance for silence/video intros. **Done when:** covers, extended mixes, and videos are penalized appropriately.
- [ ] **MATCH-015** (P1) — Use explicit-state compatibility — _Part 2 · B. Spotify→YouTube matching_  
  **Found:** explicit/clean metadata is not in the score. **Fix:** strong penalty or rejection when Spotify and YTM explicit states conflict, unless unknown. **Done when:** explicit tracks do not silently resolve to clean edits.
- [ ] **MATCH-016** (P1) — Penalize videos, covers, karaoke, and unofficial uploads — _Part 2 · B. Spotify→YouTube matching_  
  **Fix:** structured variant/source penalties and preference for official song/audio types. **Done when:** studio audio wins over music video, cover, lyric video, and karaoke when available.
- [ ] **MATCH-017** (P1) — Add ISRC where available — _Part 2 · B. Spotify→YouTube matching_  
  **Found:** reference carries ISRC for Qobuz but YouTube search often lacks it; Desktop drops it entirely. **Fix:** persist Spotify ISRC and use any provider/catalog metadata that can validate it; do not fabricate YTM ISRC. **Done when:** deterministic metadata sources outrank fuzzy search.
- [ ] **MATCH-018** (P1) — Use a confidence band, not one permissive threshold — _Part 2 · B. Spotify→YouTube matching_  
  **Found:** both apps use a low 0.35 threshold. **Fix:** high confidence auto-accept, medium confidence user confirmation/soft fallback, low confidence no match. **Done when:** false positives drop on the evaluation corpus.
- [ ] **MATCH-019** (P1) — Store candidate explanations — _Part 2 · B. Spotify→YouTube matching_  
  **Fix:** persist component scores and rejection reasons for diagnostics/manual review. **Done when:** UI can explain “title 0.94, artist 1.0, duration +2s.”
- [ ] **MATCH-020** (P1) — Manual override preview must verify canonical YouTube metadata — _Part 2 · B. Spotify→YouTube matching_  
  **Found:** Desktop refetches metadata, which is good, but URL parsing is wrong. **Fix:** repair parser; show title, artists, album, duration, explicit, type, and thumbnail before confirm. **Done when:** invalid playlist/album URLs cannot be accepted as tracks.
- [ ] **MATCH-021** (P1) — Add “reset automatic match” and “mark no match” — _Part 2 · B. Spotify→YouTube matching_  
  **Fix:** user controls to clear override, retry, or permanently suppress a bad track. **Done when:** bulk jobs skip known-unmatchable tracks without repeated searches.
- [ ] **MATCH-022** (P1) — Match cache invalidation on metadata change — _Part 2 · B. Spotify→YouTube matching_  
  **Fix:** compare Spotify title/artists/duration/ISRC hash; keep manual overrides, re-evaluate automatic stale matches. **Done when:** edited/reissued Spotify metadata does not retain obsolete automatic matches.
- [ ] **MATCH-023** (P2) — Add negative cache with TTL — _Part 2 · B. Spotify→YouTube matching_  
  **Fix:** cache no-match/transient outcomes separately. **Done when:** repeated UI renders do not spam search, while transient failures retry later.
- [ ] **MATCH-024** (P2) — Batch resolver with bounded concurrency — _Part 2 · B. Spotify→YouTube matching_  
  **Found:** reference batches 10/20 in parallel; Desktop bulk download matches serially while holding UI workflow. **Fix:** bounded worker pool, cancellation, progress, per-track results, and rate-limit backoff. **Done when:** large playlists resolve quickly without rate-limit storms.
- [ ] **MATCH-025** (P2) — Matcher corpus and regression metrics — _Part 2 · B. Spotify→YouTube matching_  
  **Fix:** anonymized/public metadata fixture corpus of studio/live/remix/cover/non-Latin/explicit edge cases; track precision/recall and top-1 accuracy. **Done when:** matcher changes cannot merge without meeting quality thresholds.
- [ ] **MATCH-026** (P2) — Improve reverse YouTube→Spotify matching — _Part 2 · B. Spotify→YouTube matching_  
  **Found:** backend reverse scorer is better than forward playback but still title/artist/duration only and five candidates. **Fix:** reuse the same feature extraction/confidence model bidirectionally. **Done when:** add-to-Spotify and forward playback agree on identity.
- [ ] **MATCH-027** (P2) — Do not count matching searches in user history — _Part 2 · B. Spotify→YouTube matching_  
  **Fix:** use an incognito/background YTM search contract. **Done when:** automatic matching never appears in remote/local search history.
- [ ] **MATCH-028** (P2) — Separate transient API failure from no match — _Part 2 · B. Spotify→YouTube matching_  
  **Found:** bulk workflow increments “unmatched” for every caught exception. **Fix:** result enum: Matched, NoMatch, AuthExpired, RateLimited, Network, ContractChanged, Cancelled. **Done when:** retryable errors are not mislabeled as bad catalog matches.

### M5.3 Source-preserving queues (21 tasks)

- **Goal:** Source-preserving queues (YouTube continuation, Spotify paged progressive resolution).
- **Depends on:** M5.2
- **Exit criteria:** Continuation tests.

- [ ] **QUEUE-009** (P0) — Spotify playlist play does not preserve the playlist — _Part 2 · C. Spotify queue preservation and progressive resolution_  
  **Found:** Desktop resolves one track then calls `openItem`; queue becomes YTM watch-next/radio. **Fix:** implement SpotifyPlaylistQueue with source tracks, selected index, pagination, and progressive matching. **Done when:** next track follows the visible Spotify playlist order.
- [ ] **QUEUE-010** (P0) — Spotify Liked Songs play does not preserve Liked Songs — _Part 2 · C. Spotify queue preservation and progressive resolution_  
  **Fix:** SpotifyLikedQueue with visible sort/order snapshot and progressive pagination. **Done when:** queue order matches what the user clicked.
- [ ] **QUEUE-021** (P0) — Main lost continuation type — _Part 2 · D. YouTube queue continuation and context_  
  **Found:** main routes playlist continuations through `ytm_queue_continuation`; v0.1.8 correctly tracked `next` vs `playlist`. **Fix:** restore typed continuation as part of `QueueOrigin`, not a loose string. **Done when:** playlists use playlist continuation and watch-next uses next continuation.
- [ ] **QUEUE-011** (P1) — Fast-start window — _Part 2 · C. Spotify queue preservation and progressive resolution_  
  **Fix:** resolve selected track plus two neighbors; start immediately; continue in background. **Done when:** large Spotify playlists start without resolving the whole list.
- [ ] **QUEUE-012** (P1) — Progressive batch resolution — _Part 2 · C. Spotify queue preservation and progressive resolution_  
  **Fix:** resolve bounded batches as the player approaches the loaded tail. **Done when:** unresolved tracks never block current audio and skipped no-match entries preserve correct index mapping.
- [ ] **QUEUE-013** (P1) — Preserve API raw offsets — _Part 2 · C. Spotify queue preservation and progressive resolution_  
  **Found:** filtered/local Spotify items can make filtered count differ from API offset. **Fix:** track raw fetched count separately from playable-track count, as reference does. **Done when:** pagination neither repeats nor skips after filtering.
- [ ] **QUEUE-014** (P1) — Preserve visible sorted order — _Part 2 · C. Spotify queue preservation and progressive resolution_  
  **Fix:** when user searches/sorts/reverses a Spotify list, capture that exact source order or state clearly that play uses canonical order. **Done when:** selected index and following tracks match the visible list.
- [ ] **QUEUE-015** (P1) — Do not close source screen before preparation succeeds — _Part 2 · C. Spotify queue preservation and progressive resolution_  
  **Found:** Spotify playlist closes before `openItem` succeeds. **Fix:** pending prepare UI; close only after queue commits. **Done when:** failed match leaves user in the playlist with retry/override actions.
- [ ] **QUEUE-016** (P1) — Preserve Spotify metadata in resolved entries — _Part 2 · C. Spotify queue preservation and progressive resolution_  
  **Fix:** queue entry contains Spotify source + YouTube playback target. **Done when:** history/download/manual override retain both identities.
- [ ] **QUEUE-017** (P1) — Handle unmatchable entries without index drift — _Part 2 · C. Spotify queue preservation and progressive resolution_  
  **Fix:** maintain source-index→resolved-entry mapping; selected target cannot silently shift to a neighbor. **Done when:** if the selected track fails, app reports it rather than playing another track at that numeric index.
- [ ] **QUEUE-018** (P1) — Full-status operation for shuffle-all — _Part 2 · C. Spotify queue preservation and progressive resolution_  
  **Fix:** fetch all source pages, resolve in bounded batches, map selected source index, then shuffle remaining entries. **Done when:** shuffle covers the whole Spotify playlist, not only loaded tracks.
- [ ] **QUEUE-022** (P1) — Removing current track drops continuation — _Part 2 · D. YouTube queue continuation and context_  
  **Found:** `removeQueueItem` restarts with continuation null. **Fix:** retain origin and continuation when selecting replacement current entry. **Done when:** removing current from a paginated queue can still load later pages.
- [ ] **QUEUE-023** (P1) — Queue continuation always deduplicates by song ID — _Part 2 · D. YouTube queue continuation and context_  
  **Found:** it removes legitimate duplicate playlist occurrences even when duplicate prevention is off. **Fix:** dedupe continuation pages by source entry identity/setVideoId/page overlap, not global song ID. **Done when:** intentional duplicates survive while repeated API pages do not duplicate.
- [ ] **QUEUE-024** (P1) — Continuation merge races with user edits — _Part 2 · D. YouTube queue continuation and context_  
  **Found:** async continuation uses captured `queueItems` then writes a replacement list. **Fix:** coordinator transaction merges against current generation and aborts stale results. **Done when:** add/remove/reorder during load cannot be overwritten.
- [ ] **QUEUE-025** (P1) — Continuation loop needs a page cap — _Part 2 · D. YouTube queue continuation and context_  
  **Found:** changing empty continuation tokens can loop repeatedly. **Fix:** max pages per action, seen-token set, empty-page threshold. **Done when:** pathological fixtures terminate.
- [ ] **QUEUE-026** (P1) — Retry/backoff missing on Desktop continuation — _Part 2 · D. YouTube queue continuation and context_  
  **Fix:** bounded retry by failure category with Retry-After support. **Done when:** transient errors recover and contract errors stop quickly.
- [ ] **QUEUE-027** (P1) — Detail/playlist visible queue must retain continuation type — _Part 2 · D. YouTube queue continuation and context_  
  **Fix:** `Play all` and item play from album/playlist/details create a queue origin that contains current loaded items and correct continuation. **Done when:** playing from any list continues that list rather than switching to radio unexpectedly.
- [ ] **QUEUE-019** (P2) — Preload next match, not full audio file — _Part 2 · C. Spotify queue preservation and progressive resolution_  
  **Fix:** resolve the next few Spotify→YouTube identities separately from audio prebuffer policy. **Done when:** matching latency is hidden without unbounded media downloads.
- [ ] **QUEUE-020** (P2) — Queue progress and partial failures — _Part 2 · C. Spotify queue preservation and progressive resolution_  
  **Fix:** show “resolved X/Y,” skipped tracks, retry-all, and per-track manual fix. **Done when:** a 500-track playlist remains understandable and cancellable.
- [ ] **QUEUE-028** (P2) — Queue title is discarded — _Part 2 · D. YouTube queue continuation and context_  
  **Fix:** preserve playlist/album/radio title from queue payload. **Done when:** queue panel identifies its source.
- [ ] **QUEUE-029** (P2) — Continuation diagnostics — _Part 2 · D. YouTube queue continuation and context_  
  **Fix:** expose source, last token hash, page count, received/accepted items, and final reason without raw token. **Done when:** pagination bugs are diagnosable safely.

### M5.4 Correct queue semantics (16 tasks)

- **Goal:** Play Next/shuffle/repeat/duplicates/editing semantics per transition table.
- **Depends on:** M5.3
- **Exit criteria:** Transition-table tests.

- [ ] **QUEUE-030** (P0) — Play Next is not guaranteed next under shuffle — _Part 2 · E. Shuffle, repeat, play-next, duplicates, and editing_  
  **Found:** item is inserted after current, then the whole tail—including that item—is shuffled. **Fix:** reserve a manual “play-next lane” ahead of shuffled automatic items. **Done when:** Play Next always plays next.
- [ ] **QUEUE-031** (P0) — Selected “Play Next” has the same shuffle bug — _Part 2 · E. Shuffle, repeat, play-next, duplicates, and editing_  
  **Fix:** preserve selected order directly after current, then leave shuffled tail unchanged. **Done when:** selected batch plays next in the promised order.
- [ ] **QUEUE-032** (P1) — Toggling shuffle does not reorder current queue — _Part 2 · E. Shuffle, repeat, play-next, duplicates, and editing_  
  **Found:** toggle changes only a boolean; current tail is not immediately shuffled. **Fix:** coordinator shuffles unplayed automatic entries on enable. **Done when:** queue visibly changes at toggle time.
- [ ] **QUEUE-033** (P1) — Turning shuffle off cannot restore source order — _Part 2 · E. Shuffle, repeat, play-next, duplicates, and editing_  
  **Fix:** retain canonical/source ordering and shuffle permutation separately. **Done when:** disabling shuffle restores remaining source order while respecting manual edits.
- [ ] **QUEUE-034** (P1) — Adding one item reshuffles the entire tail — _Part 2 · E. Shuffle, repeat, play-next, duplicates, and editing_  
  **Found:** Add to queue calls `shuffleQueueAfterCurrent`. **Fix:** insert new automatic item using explicit policy without re-randomizing existing future order. **Done when:** previous upcoming order is stable.
- [ ] **QUEUE-035** (P1) — Current item lookup by ID is ambiguous — _Part 2 · E. Shuffle, repeat, play-next, duplicates, and editing_  
  **Fix:** use entryId/index in coordinator. **Done when:** duplicate songs do not move insertion point.
- [ ] **QUEUE-036** (P1) — Duplicate prevention uses song ID only — _Part 2 · E. Shuffle, repeat, play-next, duplicates, and editing_  
  **Fix:** user policy options: allow duplicates, prevent same recording, prevent same source entry; implement canonical identity. **Done when:** remixes/versions are not incorrectly collapsed.
- [ ] **QUEUE-037** (P1) — Repeat persistence lacks rollback — _Part 2 · E. Shuffle, repeat, play-next, duplicates, and editing_  
  **Fix:** store previous repeat mode and revert on settings failure. **Done when:** UI always matches persisted state.
- [ ] **QUEUE-038** (P1) — Main repeat-all ignores “disable load more” path — _Part 2 · E. Shuffle, repeat, play-next, duplicates, and editing_  
  **Found:** main advances whenever continuation exists before checking repeat-all; v0.1.8 contains a better guard. **Fix:** define precedence: Repeat One → current; Repeat All with no-load-more → wrap loaded source; otherwise page/automix according to origin. **Done when:** transition table tests pass.
- [ ] **QUEUE-039** (P1) — Shuffle preference and active permutation are conflated — _Part 2 · E. Shuffle, repeat, play-next, duplicates, and editing_  
  **Fix:** separate persisted default, active mode, and current permutation seed/order. **Done when:** restore reproduces the current queue exactly.
- [ ] **QUEUE-040** (P1) — `persistentShuffleAcrossQueues` semantics are unclear — _Part 2 · E. Shuffle, repeat, play-next, duplicates, and editing_  
  **Fix:** rename/document; test whether new queue inherits mode and whether it is immediately shuffled. **Done when:** setting behavior matches label.
- [ ] **QUEUE-041** (P1) — `shufflePlaylistFirst` implementation is incomplete — _Part 2 · E. Shuffle, repeat, play-next, duplicates, and editing_  
  **Found:** after single-item watch-next expansion, `originalQueueSize` becomes all items, so original-vs-added distinction can disappear. **Fix:** queue origin marks source items and recommendation additions explicitly. **Done when:** playlist-first setting has deterministic effect.
- [ ] **QUEUE-042** (P1) — Reorder while continuation loads can be lost — _Part 2 · E. Shuffle, repeat, play-next, duplicates, and editing_  
  **Fix:** serialize queue mutations or merge by entryId/generation. **Done when:** stress tests preserve manual order.
- [ ] **QUEUE-043** (P2) — No undo for destructive queue edits — _Part 2 · E. Shuffle, repeat, play-next, duplicates, and editing_  
  **Fix:** short undo for clear/remove and optional confirmation for clear. **Done when:** accidental edits are recoverable.
- [ ] **QUEUE-044** (P2) — No direct “remove upcoming duplicates” action — _Part 2 · E. Shuffle, repeat, play-next, duplicates, and editing_  
  **Fix:** optional cleanup command with preview. **Done when:** user controls duplication without global policy changes.
- [ ] **QUEUE-045** (P2) — No queue save/export — _Part 2 · E. Shuffle, repeat, play-next, duplicates, and editing_  
  **Fix:** save current queue as local playlist/M3U/CSV while retaining resolvable identities. **Done when:** generated radio/Spotify queue can be preserved.

### M5.5 Spotify recommendation identity (16 tasks)

- **Goal:** Spotify-seeded radio and recommendations (seed-first, lazy, scoring, diversification).
- **Depends on:** M5.2
- **Exit criteria:** Recommendation tests with fixtures.

- [ ] **RADIO-001** (P0) — Desktop lacks Meld's Spotify recommendation engine — _Part 2 · F. Autoplay, radio, and recommendations_  
  **Fix:** port concept—not Android code blindly—into a backend RecommendationEngine. **Done when:** Spotify-origin radio uses taste profile plus seed context rather than YTM next alone.
- [ ] **RADIO-002** (P1) — Define source-specific radio policy — _Part 2 · F. Autoplay, radio, and recommendations_  
  **Fix:** YouTube-origin seed defaults to YTM radio; Spotify-origin seed defaults to Spotify recommendation queue; user can choose. **Done when:** source identity predicts queue behavior.
- [ ] **RADIO-003** (P1) — Seed must start immediately — _Part 2 · F. Autoplay, radio, and recommendations_  
  **Fix:** resolve/play seed first; generate recommendations lazily with timeout. **Done when:** recommendation network latency never blocks first audio.
- [ ] **RADIO-004** (P1) — Add fallback queue — _Part 2 · F. Autoplay, radio, and recommendations_  
  **Fix:** on recommendation failure: seed-artist top tracks + same album + user top pool, then optional YTM radio. **Done when:** radio remains usable offline-with-cache/transient failure where possible.
- [ ] **RADIO-005** (P1) — Build taste profile cache — _Part 2 · F. Autoplay, radio, and recommendations_  
  **Fix:** Spotify top tracks/artists, genres, recency, local fallback; six-hour configurable TTL and explicit invalidation. **Done when:** recommendations work quickly after restart and tolerate rate limits.
- [ ] **RADIO-006** (P1) — Candidate generation from multiple buckets — _Part 2 · F. Autoplay, radio, and recommendations_  
  **Fix:** seed artists, same album, genre neighbors, user top tracks, optionally recent/new releases. **Done when:** each bucket has tests and bounded calls.
- [ ] **RADIO-007** (P1) — Composite scoring — _Part 2 · F. Autoplay, radio, and recommendations_  
  **Fix:** source relevance, artist affinity, genre overlap, recency, novelty, explicit policy, and repetition penalty. **Done when:** weights are versioned and explainable.
- [ ] **RADIO-008** (P1) — Diversification — _Part 2 · F. Autoplay, radio, and recommendations_  
  **Fix:** per-artist cap, album cap, recent-history suppression, bucket interleaving, same-song exclusion. **Done when:** queue avoids repetitive clusters.
- [ ] **RADIO-009** (P1) — Avoid same song twice in a row — _Part 2 · F. Autoplay, radio, and recommendations_  
  **Fix:** canonical recording identity plus immediate-history guard. **Done when:** shuffle/radio tests never repeat adjacent track unless only one playable entry exists.
- [ ] **RADIO-010** (P1) — Automix result race — _Part 2 · F. Autoplay, radio, and recommendations_  
  **Found:** Desktop's global automix ref does not bind result to queue/session generation. A user action during fetch can allow old recommendations to append/play. **Fix:** cancellation token + queue generation check. **Done when:** stale automix results are discarded.
- [ ] **RADIO-011** (P1) — Automix errors are swallowed — _Part 2 · F. Autoplay, radio, and recommendations_  
  **Fix:** classify and record error; remain silent only for optional fallback while retaining diagnostics. **Done when:** “end of queue” is distinguishable from failed recommendation fetch.
- [ ] **RADIO-012** (P1) — YTM radio fallback needs retries like reference — _Part 2 · F. Autoplay, radio, and recommendations_  
  **Fix:** retry empty RDAMVM response, fallback to video-only next/related, cap attempts. **Done when:** empty-radio fixtures recover or fail clearly.
- [ ] **RADIO-013** (P1) — Recommendation pagination and matching are separate — _Part 2 · F. Autoplay, radio, and recommendations_  
  **Fix:** generate Spotify candidates, then progressively resolve to YouTube in batches. **Done when:** one bad match does not abort the recommendation queue.
- [ ] **RADIO-014** (P2) — Explain recommendation source — _Part 2 · F. Autoplay, radio, and recommendations_  
  **Fix:** optional “Why this track?” from bucket/signals. **Done when:** user can understand and correct poor results.
- [ ] **RADIO-015** (P2) — Feedback loop — _Part 2 · F. Autoplay, radio, and recommendations_  
  **Fix:** dislike/skip/incorrect-match signals influence local queue scoring without sending private data elsewhere. **Done when:** repeated unwanted tracks are suppressed.
- [ ] **RADIO-016** (P2) — Deterministic test seed — _Part 2 · F. Autoplay, radio, and recommendations_  
  **Fix:** injectable RNG/seed for tests and optional restored shuffle order. **Done when:** recommendation/shuffle tests are reproducible.

### M5.6 Spotify Home and Search (28 tasks)

- **Goal:** Spotify Home/Search, Spotify-only mode, profile cache, new releases.
- **Depends on:** M5.5
- **Exit criteria:** Home/Search tests with cached fallback.

- [ ] **HOME-001** (P0) — Product identity mismatch — _Part 2 · G. Spotify-powered Home_  
  **Found:** Desktop Home is YTM-first; Meld's identity is Spotify personalization driving Home/Search/recommendations. **Fix:** implement source settings and Spotify sections before calling the port 1:1. **Done when:** Spotify Home mode is a first-class path.
- [ ] **SEARCH-001** (P0) — Add Use Spotify for Search — _Part 2 · H. Spotify-powered Search_  
  **Fix:** source setting and runtime route. **Done when:** search can use Spotify tracks/albums/artists/playlists.
- [ ] **HOME-002** (P1) — Add Use Spotify for Home — _Part 2 · G. Spotify-powered Home_  
  **Fix:** account-aware setting, disabled with explanation when disconnected. **Done when:** Home switches without restart.
- [ ] **HOME-003** (P1) — Add Spotify-only Home — _Part 2 · G. Spotify-powered Home_  
  **Fix:** suppress remote YouTube sections but retain appropriate local/recent content. **Done when:** mode behavior matches its label.
- [ ] **HOME-004** (P1) — Spotify authentication fallback — _Part 2 · G. Spotify-powered Home_  
  **Fix:** validate/refresh token; if auth fails, fall back to YouTube unless Spotify-only is explicitly strict, then show reconnect state. **Done when:** Home never becomes silently empty.
- [ ] **HOME-005** (P1) — Top tracks section — _Part 2 · G. Spotify-powered Home_  
  **Fix:** profile cache with GQL/REST/local fallback and explicit filtering. **Done when:** warm startup renders cached data immediately then refreshes.
- [ ] **HOME-006** (P1) — Top artists section — _Part 2 · G. Spotify-powered Home_  
  **Fix:** profile cache, images, artist navigation to Spotify/YouTube equivalent. **Done when:** artists open reliably and retain source identity.
- [ ] **HOME-007** (P1) — Spotify home feed sections — _Part 2 · G. Spotify-powered Home_  
  **Fix:** parse playlists/albums/artists with resilient unknown-section handling. **Done when:** one malformed section does not discard the feed.
- [ ] **HOME-008** (P1) — New releases/following/discover — _Part 2 · G. Spotify-powered Home_  
  **Fix:** implement pinned new releases and reference-style following/discover/for-you policy. **Done when:** sections have cache/fallback and deduplication.
- [ ] **HOME-009** (P1) — Recently played always available — _Part 2 · G. Spotify-powered Home_  
  **Fix:** local history section independent of remote source mode. **Done when:** Spotify-only/offline Home retains recent local plays.
- [ ] **HOME-010** (P1) — Home request races — _Part 2 · G. Spotify-powered Home_  
  **Fix:** generation/AbortController for account changes, refresh, source toggles, and continuation. **Done when:** an old YTM/Spotify result cannot overwrite the newly selected source.
- [ ] **HOME-011** (P1) — Fix nested state mutation — _Part 2 · G. Spotify-powered Home_  
  **Found:** `loadHomeMore` mutates existing section objects/items. **Fix:** immutable map/copy or normalized store. **Done when:** React tests freeze state and continuation still works.
- [ ] **HOME-012** (P1) — Cache completeness/degraded TTL — _Part 2 · G. Spotify-powered Home_  
  **Fix:** mark complete vs fallback feeds and use different TTLs; never cache error/empty as complete. **Done when:** offline Home is truthful and useful.
- [ ] **SEARCH-002** (P1) — Authentication fallback — _Part 2 · H. Spotify-powered Search_  
  **Fix:** validate/refresh; fallback to YTM on auth failure with visible source indicator. **Done when:** stale token cannot leave blank results.
- [ ] **SEARCH-003** (P1) — Preserve Spotify entities — _Part 2 · H. Spotify-powered Search_  
  **Fix:** result models for track, album, artist, playlist—not fake YTM entities. Resolve tracks only when playback is requested. **Done when:** browsing Spotify album/artist/playlist is native to source.
- [ ] **SEARCH-004** (P1) — Latest-search-wins — _Part 2 · H. Spotify-powered Search_  
  **Found:** Desktop search has no request generation/abort. **Fix:** cancel old queries and continuation requests. **Done when:** slow earlier results cannot overwrite later query.
- [ ] **SEARCH-005** (P1) — Continuation belongs to query+source+filter — _Part 2 · H. Spotify-powered Search_  
  **Fix:** typed cursor with request generation. **Done when:** changing query/source/filter invalidates old continuation.
- [ ] **SEARCH-006** (P1) — Search filters by source capabilities — _Part 2 · H. Spotify-powered Search_  
  **Fix:** Spotify/YTM/local filters with supported entity types and graceful fallback. **Done when:** unsupported filter does not issue malformed requests.
- [ ] **SEARCH-007** (P1) — Background matching must be incognito — _Part 2 · H. Spotify-powered Search_  
  **Fix:** Spotify→YTM resolution searches never enter search history. **Done when:** only user-submitted queries are recorded.
- [ ] **SEARCH-008** (P1) — Search history privacy/source — _Part 2 · H. Spotify-powered Search_  
  **Fix:** store query once with user intent, not per provider; pause/clear behavior applies consistently. **Done when:** switching providers does not duplicate history.
- [ ] **TR-M6** (P1) — Spotify parity partial — _Technical review (Appendix G)_  
  Phase 5 (Part 2) items.
- [ ] **HOME-013** (P2) — Cross-source deduplication — _Part 2 · G. Spotify-powered Home_  
  **Fix:** canonical IDs/matches prevent same album/playlist/track appearing repeatedly across sections. **Done when:** dedupe preserves intentional distinct versions.
- [ ] **HOME-014** (P2) — Section failure isolation — _Part 2 · G. Spotify-powered Home_  
  **Fix:** independent result/status per section and retry. **Done when:** rate-limited new releases do not hide top tracks/home feed.
- [ ] **HOME-015** (P2) — Source badges and privacy — _Part 2 · G. Spotify-powered Home_  
  **Fix:** label Spotify, YouTube, and Local sections; document remote requests. **Done when:** user knows which service powers each section.
- [ ] **SEARCH-009** (P2) — Debounced suggestions and cancellation — _Part 2 · H. Spotify-powered Search_  
  **Fix:** source-aware suggestions with minimum length, debounce, and abort. **Done when:** typing cannot create out-of-order suggestion lists.
- [ ] **SEARCH-010** (P2) — URL paste takes precedence safely — _Part 2 · H. Spotify-powered Search_  
  **Fix:** repaired canonical URL parser before provider search. **Done when:** all URL fixtures route deterministically.
- [ ] **SEARCH-011** (P2) — Offline/local fallback — _Part 2 · H. Spotify-powered Search_  
  **Fix:** allow local library search when remote providers fail. **Done when:** search remains useful offline.
- [ ] **SEARCH-012** (P2) — Search quality analytics locally testable — _Part 2 · H. Spotify-powered Search_  
  **Fix:** fixture queries and expected entity/ranking tests; no private telemetry required. **Done when:** parser/ranking regressions are caught.

### M5.7 Spotify resilience, UX, and Part 2 tests (35 tasks)

- **Goal:** Token/hash lifecycle (remote GQL registry), 429 handling, playlist ops, bulk download jobs, React correctness, Part 2 tests.
- **Depends on:** M5.1
- **Exit criteria:** Part 2 §5 acceptance passes.

- [ ] **SPOT-001** (P0) — Startup auth state can lie — _Part 2 · I. Spotify session, API, hashes, and playlist operations_  
  **Found:** token+future expiry is treated as authenticated. **Fix:** centralized TokenManager with single-flight refresh/validation and explicit states. **Done when:** revoked token becomes ReconnectRequired before normal UI claims connected.
- [ ] **TEST-001** (P0) — Queue state-machine test matrix — _Part 2 · K. Tests and acceptance gates_  
  Cover play, next, previous, end, remove current, clear, move, duplicate entries, insert next, append, failed prepare, stale prepare, and restore.
- [ ] **TEST-002** (P0) — Shuffle/repeat transition table — _Part 2 · K. Tests and acceptance gates_  
  Cover Off/All/One × continuation/no continuation × auto-load × disable-load-more × manual Play Next × duplicates.
- [ ] **TEST-003** (P0) — Spotify matcher corpus — _Part 2 · K. Tests and acceptance gates_  
  Measure top-1 correctness, false-positive rate, confidence calibration, manual override protection, Unicode, explicit, live/remix/cover, and duration edges.
- [ ] **SPOT-002** (P1) — Token refresh race — _Part 2 · I. Spotify session, API, hashes, and playlist operations_  
  **Fix:** one refresh promise/mutex; waiting callers reuse result. **Done when:** concurrent Home/Search/Library calls trigger one refresh.
- [ ] **SPOT-003** (P1) — Dynamic GraphQL hashes — _Part 2 · I. Spotify session, API, hashes, and playlist operations_  
  **Found:** Desktop compiles a static registry; reference syncs remotely with cache/previous/fallback. **Fix:** merge the Desktop remote-hash branch only after integrity, schema, ETag, rollback, and endpoint trust checks. **Done when:** PersistedQueryNotFound can recover without a binary release.
- [ ] **SPOT-004** (P1) — Hash update must be trusted — _Part 2 · I. Spotify session, API, hashes, and playlist operations_  
  **Fix:** HTTPS allowlist plus signed registry or pinned publisher verification; cache last-known-good. **Done when:** compromised arbitrary JSON cannot redefine operations silently.
- [ ] **SPOT-005** (P1) — Unified 429 handling — _Part 2 · I. Spotify session, API, hashes, and playlist operations_  
  **Fix:** parse Retry-After, operation-level backoff, jitter, cancellation, cached fallback. **Done when:** Home/Search/Library avoid retry storms.
- [ ] **SPOT-006** (P1) — Error-body taxonomy — _Part 2 · I. Spotify session, API, hashes, and playlist operations_  
  **Fix:** distinguish auth, hash, permission, rate limit, malformed contract, and network. **Done when:** UI/retry behavior is category-specific.
- [ ] **SPOT-007** (P1) — Playlist pagination must not cap at 50/100 silently — _Part 2 · I. Spotify session, API, hashes, and playlist operations_  
  **Fix:** page until total/next cursor with bounded UI loading. **Done when:** all playlists/folders/liked songs are reachable.
- [ ] **SPOT-008** (P1) — Bulk Spotify download is not actually queued — _Part 2 · I. Spotify session, API, hashes, and playlist operations_  
  **Found:** frontend loops, matches, and awaits each full `download_start`, then says “queued.” **Fix:** submit a persistent bulk job to DownloadManager; resolve/download with bounded concurrency and progress. **Done when:** UI can pause/cancel/retry and closing the screen does not lose job state.
- [ ] **SPOT-009** (P1) — Reorder under sort/filter can be misleading — _Part 2 · I. Spotify session, API, hashes, and playlist operations_  
  **Fix:** disable reorder unless showing canonical playlist order, or translate visual move to canonical UID positions explicitly. **Done when:** moved result matches visible intention.
- [ ] **SPOT-010** (P1) — Playlist mutation conflict refresh — _Part 2 · I. Spotify session, API, hashes, and playlist operations_  
  **Fix:** optimistic update with server revision/snapshot and reconciliation; avoid full reload for every move where possible. **Done when:** concurrent external edits do not silently reorder wrong items.
- [ ] **SPOT-011** (P1) — Liked-song bidirectional sync missing — _Part 2 · I. Spotify session, API, hashes, and playlist operations_  
  **Fix:** explicit local/YTM/Spotify like policies and partial-failure state; do not conflate services. **Done when:** user can see where a track is liked and retry failed provider sync.
- [ ] **UI-001** (P1) — Async Tauri listener cleanup race — _Part 2 · J. React correctness affecting Part 2_  
  **Fix:** disposed flag; immediately stop a listener that resolves after cleanup. **Done when:** StrictMode mount/unmount tests show one listener per event.
- [ ] **UI-002** (P1) — Detail/playlist request races — _Part 2 · J. React correctness affecting Part 2_  
  **Fix:** request generation and entity key validation before committing response. **Done when:** rapid navigation cannot show data for the previous item.
- [ ] **UI-003** (P1) — Spotify folder/playlist/profile races — _Part 2 · J. React correctness affecting Part 2_  
  **Fix:** cancellation/generation per view and account session. **Done when:** logout/source change invalidates in-flight responses.
- [ ] **UI-004** (P1) — Loading flags can cover stale entities — _Part 2 · J. React correctness affecting Part 2_  
  **Fix:** keyed load states `{key,status,data,error}` rather than one global object. **Done when:** spinner/error always belongs to the current entity.
- [ ] **UI-005** (P1) — One notice string is not an operation model — _Part 2 · J. React correctness affecting Part 2_  
  **Fix:** scoped toasts plus persistent job/error center for queue/match/download. **Done when:** concurrent operations do not overwrite each other's only feedback.
- [ ] **TEST-004** (P1) — Spotify playlist progressive queue tests — _Part 2 · K. Tests and acceptance gates_  
  API pagination, raw vs filtered offsets, selected unmatchable track, batch failures, visible sort order, shuffle-all, cancellation.
- [ ] **TEST-005** (P1) — Continuation routing fixtures — _Part 2 · K. Tests and acceptance gates_  
  YouTube watch-next and playlist continuation must use their own parsers/endpoints in main and restored sessions.
- [ ] **TEST-006** (P1) — Automix race tests — _Part 2 · K. Tests and acceptance gates_  
  Old recommendation response after new queue/user action must be discarded.
- [ ] **TEST-007** (P1) — Home source/fallback tests — _Part 2 · K. Tests and acceptance gates_  
  Spotify Home, Spotify-only, expired token, partial section failure, offline cache, account switch, and YTM fallback.
- [ ] **TEST-008** (P1) — Search race/source tests — _Part 2 · K. Tests and acceptance gates_  
  Out-of-order queries, source toggle, filters, continuation, URL paste, auth expiry, and incognito background matching.
- [ ] **TEST-009** (P1) — Spotify token/hash/rate-limit tests — _Part 2 · K. Tests and acceptance gates_  
  Single-flight refresh, revoked token, 401, 403, 412, 429 with Retry-After, bad remote registry, rollback.
- [ ] **TEST-010** (P1) — React immutable-state tests — _Part 2 · K. Tests and acceptance gates_  
  Freeze Home/detail/playlist state and ensure continuation merges do not mutate previous objects.
- [ ] **TEST-011** (P1) — StrictMode listener test — _Part 2 · K. Tests and acceptance gates_  
  Mount/unmount/remount with delayed `listen()` resolution and prove all stale listeners stop.
- [ ] **TR-H3** (P1) — Spotify GraphQL hashes are compiled static data — _Technical review (Appendix G)_  
  Remote registry + local cache + previous-hash retry on 412 + force refresh + bundled fallback; evaluate unmerged branch feature/remote-gql-hash-sync.
- [ ] **SPOT-012** (P2) — Followed-artist sync — _Part 2 · I. Spotify session, API, hashes, and playlist operations_  
  **Fix:** fetch/persist Spotify followed artists and map navigation/release sections. **Done when:** following section works offline from cache and refreshes safely.
- [ ] **SPOT-013** (P2) — Spotify album screen — _Part 2 · I. Spotify session, API, hashes, and playlist operations_  
  **Fix:** native Spotify album model, pagination, play/shuffle/download, artist navigation, and progressive matching. **Done when:** album playback preserves album order.
- [ ] **SPOT-014** (P2) — Folder recursion and cycles — _Part 2 · I. Spotify session, API, hashes, and playlist operations_  
  **Fix:** typed folder path, pagination, depth/cycle guard, stable back navigation. **Done when:** deeply nested/changed folders do not strand UI.
- [ ] **SPOT-015** (P2) — Profile cache tiers — _Part 2 · I. Spotify session, API, hashes, and playlist operations_  
  **Fix:** GraphQL→REST→local DB with freshness/completeness metadata and image enrichment. **Done when:** warm Home is instant and rate-limit tolerant.
- [ ] **UI-006** (P2) — Large lists need virtualization — _Part 2 · J. React correctness affecting Part 2_  
  **Fix:** virtualized queue/playlist/search lists with stable entry keys. **Done when:** thousands of tracks remain responsive.
- [ ] **TEST-012** (P2) — Recommendation quality tests — _Part 2 · K. Tests and acceptance gates_  
  Deterministic seed, artist/album caps, recency, genre neighbors, fallback, no adjacent repeats, history suppression.
- [ ] **TEST-013** (P2) — Large-source soak — _Part 2 · K. Tests and acceptance gates_  
  10,000-track mock playlist, deep folder tree, 500 matches, pagination, shuffle, reorder, memory/performance budgets.

## Phase 6 — Core UI/UX parity, accessibility, design system, i18n (267 tasks)


### M6.1 App shell and navigation (19 tasks)

- **Goal:** App shell, routes, history, back/forward, window behaviour.
- **Depends on:** M1.1
- **Exit criteria:** Route tests; deep-link routes.

- [ ] **U4-016** (P1) — Define primary navigation parity — _Part 4 · B. App shell, navigation, and Windows window behavior_  
  Home, Search, Listen Together, and Library are the reference’s primary destinations; History and Stats can remain desktop secondary destinations.[^https://github.com/FrancescoGrazioso/Meld/blob/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/ui/screens/Screens.kt#L20-L50]
- [ ] **U4-017** (P1) — Add Listen Together only when real backend behavior exists — _Part 4 · B. App shell, navigation, and Windows window behavior_  
  Do not create an inert tab.
- [ ] **U4-018** (P1) — Add clear active, hover, focus, pressed, disabled, loading, and attention states for every navigation item — _Part 4 · B. App shell, navigation, and Windows window behavior_
- [ ] **U4-019** (P1) — Make repeated activation useful — _Part 4 · B. App shell, navigation, and Windows window behavior_  
  Clicking the active destination should scroll to top or restore its root, matching reference behavior.
- [ ] **U4-020** (P1) — Persist sidebar collapsed state per window — _Part 4 · B. App shell, navigation, and Windows window behavior_  
  Preserve the current behavior, but announce the state change accessibly.
- [ ] **U4-021** (P1) — Replace Unicode navigation glyphs with a coherent icon set — _Part 4 · B. App shell, navigation, and Windows window behavior_  
  Ensure consistent stroke, baseline, selected state, and accessible names.
- [ ] **U4-022** (P1) — Add Windows system-theme integration — _Part 4 · B. App shell, navigation, and Windows window behavior_  
  Light, dark, system, and optional pure-black modes.
- [ ] **U4-023** (P1) — Respect Windows accent color optionally — _Part 4 · B. App shell, navigation, and Windows window behavior_  
  Never sacrifice contrast.
- [ ] **U4-024** (P1) — Add high-contrast/forced-colors support — _Part 4 · B. App shell, navigation, and Windows window behavior_  
  Test Windows High Contrast themes.
- [ ] **U4-025** (P1) — Support display scaling and text zoom — _Part 4 · B. App shell, navigation, and Windows window behavior_  
  Layout must survive 125%, 150%, 200%, and browser text zoom without clipped controls.
- [ ] **U4-026** (P1) — Add reduced-motion support — _Part 4 · B. App shell, navigation, and Windows window behavior_  
  Disable decorative transitions, smooth lyric scroll, and spinner animation changes where required.
- [ ] **U4-027** (P1) — Restore window size, position, maximized state, and full-player layout safely — _Part 4 · B. App shell, navigation, and Windows window behavior_  
  Clamp to available monitors.
- [ ] **U4-028** (P1) — Support Windows snap sizes — _Part 4 · B. App shell, navigation, and Windows window behavior_  
  The 860 px minimum is too restrictive; design useful compact layouts around approximately 640–720 px if technically feasible.
- [ ] **U4-029** (P1) — Add compact/narrow navigation — _Part 4 · B. App shell, navigation, and Windows window behavior_  
  At small widths use icon rail or bottom navigation rather than squeezing the full top bar.
- [ ] **U4-030** (P1) — Provide a native title-bar strategy — _Part 4 · B. App shell, navigation, and Windows window behavior_  
  Include drag region, window controls, double-click maximize, system menu, and correct hit targets if custom decorations are introduced.
- [ ] **U4-031** (P1) — Add native back/forward mouse-button handling — _Part 4 · B. App shell, navigation, and Windows window behavior_  
  Map XButton1/XButton2 when supported.
- [ ] **U4-032** (P1) — Preserve playback while navigating and resizing — _Part 4 · B. App shell, navigation, and Windows window behavior_  
  No remount/restart of audio due to route changes.
- [ ] **U4-033** (P1) — Add command palette/quick navigation — _Part 4 · B. App shell, navigation, and Windows window behavior_  
  Make keyboard-first access to settings, library filters, current queue, and accounts possible.
- [ ] **U4-034** (P1) — Add customizable navigation only after all destinations are routable — _Part 4 · B. App shell, navigation, and Windows window behavior_  
  The reference supports customizable navigation tabs; Desktop should offer reorder/hide with a reset action.

### M6.2 Home, Search, Library, detail screens (75 tasks)

- **Goal:** Home/Search/Library/detail parity incl. URL classification and share URLs.
- **Depends on:** M6.1
- **Exit criteria:** Screen tests + parity matrix rows Yes.

- [ ] **U4-035** (P1) — Preserve section order and source identity — _Part 4 · C. Home parity_  
  Do not merge unrelated sections solely by matching title.
- [ ] **U4-036** (P1) — Add skeleton/shimmer loading instead of one blocking boot panel — _Part 4 · C. Home parity_  
  Sections should progressively render.
- [ ] **U4-037** (P1) — Retain already loaded Home content during refresh — _Part 4 · C. Home parity_  
  Show a refresh indicator rather than blanking the page.
- [ ] **U4-038** (P1) — Add pull/toolbar refresh equivalent for desktop — _Part 4 · C. Home parity_  
  Use a visible Refresh action and `F5`/`Ctrl+R` behavior that does not reload the entire WebView.
- [ ] **U4-039** (P1) — Restore per-section Play All and Shuffle where the source supports them — _Part 4 · C. Home parity_
- [ ] **U4-040** (P1) — Add Recently Played using actual local/remote history policy — _Part 4 · C. Home parity_
- [ ] **U4-041** (P1) — Add Mood & Genres route and cards — _Part 4 · C. Home parity_
- [ ] **U4-042** (P1) — Add Charts route — _Part 4 · C. Home parity_
- [ ] **U4-043** (P1) — Add New Releases with YouTube and Spotify source labels — _Part 4 · C. Home parity_
- [ ] **U4-044** (P1) — Add Spotify Home and Spotify-only Home mode — _Part 4 · C. Home parity_  
  Covered technically in Part 2; this item is the UX surface.
- [ ] **U4-045** (P1) — Add music-recognition entry only when recognition works — _Part 4 · C. Home parity_  
  Include listening, matching, failure, retry, and recognition-history screens.
- [ ] **U4-046** (P1) — Add Speed Dial edit/reorder/removal affordances — _Part 4 · C. Home parity_  
  Menu-only pinning is insufficient.
- [ ] **U4-047** (P1) — Add section-level error states — _Part 4 · C. Home parity_  
  One failed continuation should not invalidate all Home content.
- [ ] **U4-048** (P1) — Virtualize long Home sections — _Part 4 · C. Home parity_  
  Avoid rendering every card simultaneously.
- [ ] **U4-049** (P1) — Preserve horizontal scroll positions per section — _Part 4 · C. Home parity_
- [ ] **U4-050** (P1) — Add keyboard navigation for card rows — _Part 4 · C. Home parity_  
  Arrow keys should move within a row and expose item actions.
- [ ] **U4-051** (P1) — Use truthful labels — _Part 4 · C. Home parity_  
  Do not expose “Meld YTItems” or internal parser terminology in customer-facing copy.
- [ ] **U4-052** (P1) — Separate search input and results routes — _Part 4 · D. Search parity_  
  Back from results should restore suggestions and query.
- [ ] **U4-053** (P1) — Add debounced suggestions with cancellation — _Part 4 · D. Search parity_  
  Suggestions, history, and results need independent request IDs.
- [ ] **U4-054** (P1) — Implement complete combobox semantics — _Part 4 · D. Search parity_  
  `role=combobox`, controlled popup state, `aria-controls`, `aria-expanded`, active descendant, arrow navigation, Enter, Escape, Home/End, and selected option.
- [ ] **U4-055** (P1) — Show search history only while the search control is active — _Part 4 · D. Search parity_  
  Current rendering is based on history count/query, not popup focus state.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src/App.tsx#L1778-L1825]
- [ ] **U4-056** (P1) — Add individual history deletion and clear confirmation — _Part 4 · D. Search parity_
- [ ] **U4-057** (P1) — Add search filters — _Part 4 · D. Search parity_  
  Songs, videos, albums, artists, playlists, community playlists, featured playlists, podcasts/episodes, profiles, and source-specific filters where supported.
- [ ] **U4-058** (P1) — Honor Hide video songs and explicit filtering consistently in suggestions, results, and continuation pages — _Part 4 · D. Search parity_
- [ ] **U4-059** (P1) — Parse pasted URLs — _Part 4 · D. Search parity_  
  YouTube video/playlist/album/artist, YouTube Music, Spotify album/artist/playlist/track, and app deep links.
- [ ] **U4-060** (P1) — Preserve literal encoded queries — _Part 4 · D. Search parity_  
  `%`, `+`, `#`, slashes, non-Latin scripts, emoji, and quotes need tests.
- [ ] **U4-061** (P1) — Add local-library search mode — _Part 4 · D. Search parity_  
  Reference has local and online search surfaces.
- [ ] **U4-062** (P1) — Add source labels and match confidence for Spotify-backed results — _Part 4 · D. Search parity_
- [ ] **U4-063** (P1) — Add search-within-results and result-count messaging — _Part 4 · D. Search parity_
- [ ] **U4-064** (P1) — Show “no visible results” after filtering — _Part 4 · D. Search parity_  
  Do not render a blank list when all returned items are hidden.
- [ ] **U4-065** (P1) — Preserve focus and caret when results update — _Part 4 · D. Search parity_
- [ ] **U4-066** (P1) — Virtualize long result lists and maintain focus across appended pages — _Part 4 · D. Search parity_
- [ ] **U4-067** (P1) — Make selection mode explicit and scoped — _Part 4 · D. Search parity_  
  It should not leak across Home, Search, History, Library, or an opened playlist.
- [ ] **U4-068** (P1) — Give each library area its own route — _Part 4 · E. Library parity_  
  Mix, Songs, Albums, Artists, Playlists, Podcasts, Local Files, Downloads, Cache, Uploaded, Liked, and Top Songs.
- [ ] **U4-069** (P1) — Correct tab semantics — _Part 4 · E. Library parity_  
  Several containers use `role="tablist"` while child buttons lack `role="tab"`, `aria-selected`, roving tabindex, and arrow-key behavior.
- [ ] **U4-070** (P1) — Preserve each view’s query, sort, direction, density, and scroll position — _Part 4 · E. Library parity_
- [ ] **U4-071** (P1) — Add pull/refresh toolbar behavior with last-sync status — _Part 4 · E. Library parity_
- [ ] **U4-072** (P1) — Show source badges — _Part 4 · E. Library parity_  
  Local, YouTube, Spotify, uploaded, downloaded, cached, and unavailable must be visually distinguishable without relying on color alone.
- [ ] **U4-073** (P1) — Add download/cache badges on playlists and items — _Part 4 · E. Library parity_
- [ ] **U4-074** (P1) — Add library count and storage summary — _Part 4 · E. Library parity_  
  Counts must reflect current filter/search accurately.
- [ ] **U4-075** (P1) — Add list/grid/density settings per media type — _Part 4 · E. Library parity_  
  Albums/artists/playlists need responsive card sizes.
- [ ] **U4-076** (P1) — Add all source sort modes that are meaningful — _Part 4 · E. Library parity_  
  Creation date, name, artist, year, duration, playtime, song count, and last updated.
- [ ] **U4-077** (P1) — Keep auto-playlists first-class but clearly synthetic — _Part 4 · E. Library parity_  
  Liked, Downloaded, Cached, Top, Uploaded, weekly/monthly recaps.
- [ ] **U4-078** (P1) — Restore weekly/monthly most-played playlists and visibility controls — _Part 4 · E. Library parity_
- [ ] **U4-079** (P1) — Add full playlist create/edit/delete/reorder UI — _Part 4 · E. Library parity_  
  Current local playlist UI primarily creates, opens, adds, and removes songs.
- [ ] **U4-080** (P1) — Add playlist descriptions, creator/channel, thumbnails, counts, duration, privacy, and sync state — _Part 4 · E. Library parity_
- [ ] **U4-081** (P1) — Add CSV/M3U import/export flows with previews and error rows — _Part 4 · E. Library parity_
- [ ] **U4-082** (P1) — Add local-file folder scan, rescan, unavailable/relink, and metadata conflict UI — _Part 4 · E. Library parity_
- [ ] **U4-083** (P1) — Add album/artist bookmark/follow states and actions — _Part 4 · E. Library parity_
- [ ] **U4-084** (P1) — Add podcast subscription, new-episode, saved-for-later, downloaded, progress, and played/unplayed affordances — _Part 4 · E. Library parity_
- [ ] **U4-085** (P1) — Add offline-first states — _Part 4 · E. Library parity_  
  Show stale content, last refresh, unavailable remote action, and retry-on-connect.
- [ ] **U4-086** (P1) — Make “Clear local data” wording exact — _Part 4 · E. Library parity_  
  Part 3 found that current behavior also removes imported-file records and other local-only structures.
- [ ] **U4-087** (P1) — Add bulk-action eligibility summaries — _Part 4 · E. Library parity_  
  “12 selected, 9 downloadable, 3 skipped” rather than claiming all started.
- [ ] **U4-088** (P1) — Add confirmation/undo for bulk remove download, unlike, remove from library, and playlist deletion — _Part 4 · E. Library parity_
- [ ] **U4-089** (P1) — Select occurrences, not only song IDs — _Part 4 · E. Library parity_  
  Duplicate playlist/history rows must remain independently selectable.
- [ ] **U4-090** (P1) — Add Select All/None/Range — _Part 4 · E. Library parity_  
  Shift-click, keyboard range selection, and playlist-range selection.
- [ ] **U4-091** (P1) — Replace generic detail overlay with dedicated routes — _Part 4 · F. Album, artist, playlist, podcast, and item-detail screens_  
  Each type needs its own header, actions, metadata, sections, and loading states.
- [ ] **U4-092** (P1) — Add shareable/copyable route state — _Part 4 · F. Album, artist, playlist, podcast, and item-detail screens_  
  Closing a detail should return to exactly the previous screen.
- [ ] **U4-093** (P1) — Add hero artwork with responsive size and fallback — _Part 4 · F. Album, artist, playlist, podcast, and item-detail screens_  
  Preserve aspect ratio; avoid blurry low-resolution selection.
- [ ] **U4-094** (P1) — Add album metadata — _Part 4 · F. Album, artist, playlist, podcast, and item-detail screens_  
  Year, duration, artists, song count, explicit state, source, library/download status, and description where available.
- [ ] **U4-095** (P1) — Make artists clickable in every appropriate context — _Part 4 · F. Album, artist, playlist, podcast, and item-detail screens_  
  Preserve artist order and handle multiple artists with a picker or separate links.
- [ ] **U4-096** (P1) — Add artist tabs/sections — _Part 4 · F. Album, artist, playlist, podcast, and item-detail screens_  
  Songs, albums, singles, videos, playlists, related artists, library content, and about.
- [ ] **U4-097** (P1) — Add artist follow/bookmark and Play All/Shuffle/Radio actions — _Part 4 · F. Album, artist, playlist, podcast, and item-detail screens_
- [ ] **U4-098** (P1) — Add playlist creator/channel, description, visibility, item count, duration, download status, and sync state — _Part 4 · F. Album, artist, playlist, podcast, and item-detail screens_
- [ ] **U4-099** (P1) — Add playlist sort/reorder/edit actions according to ownership — _Part 4 · F. Album, artist, playlist, podcast, and item-detail screens_
- [ ] **U4-100** (P1) — Add custom playlist thumbnails where supported — _Part 4 · F. Album, artist, playlist, podcast, and item-detail screens_
- [ ] **U4-101** (P1) — Add podcast show header, subscription, description, episode filters, progress, download, and refresh — _Part 4 · F. Album, artist, playlist, podcast, and item-detail screens_
- [ ] **U4-102** (P1) — Add “show all” routes that preserve section identity and continuation — _Part 4 · F. Album, artist, playlist, podcast, and item-detail screens_
- [ ] **U4-103** (P1) — Add unavailable/restricted content treatment — _Part 4 · F. Album, artist, playlist, podcast, and item-detail screens_  
  Explain region, account, age, premium, deleted, or unsupported-stream causes when known.
- [ ] **U4-104** (P1) — Improve item details — _Part 4 · F. Album, artist, playlist, podcast, and item-detail screens_  
  Include album, duration, source/provider IDs, quality/format when playing, file path privacy, download/cache state, play count/time, and dates.
- [ ] **U4-105** (P1) — Do not expose raw IDs as the primary user experience — _Part 4 · F. Album, artist, playlist, podcast, and item-detail screens_  
  Keep them in an expandable diagnostics section.
- [ ] **U4-106** (P1) — Add explicit-content badges everywhere relevant — _Part 4 · F. Album, artist, playlist, podcast, and item-detail screens_
- [ ] **U4-107** (P1) — Add context-aware primary action — _Part 4 · F. Album, artist, playlist, podcast, and item-detail screens_  
  Play, resume, open, subscribe, or repair depending on type/state.
- [ ] **TR-H7** (P1) — YouTube URL parsing is incorrect — _Technical review (Appendix G)_  
  Classify by ID prefix/endpoint: PL/OLAK5uy_/RD/VL → playlist; MPRE → album browse; UC/channel → artist; watch?v= → song/video; podcast IDs; table-driven tests in src/lib/urls.test.ts.
- [ ] **TR-H8** (P1) — Generated share URLs are often invalid — _Technical review (Appendix G)_  
  Central canonical URL builder by kind: song watch?v=, album /browse/MPRE…, artist /channel/UC…, playlist /playlist?list=, podcast; tests.

### M6.3 Player, queue, lyrics UX (52 tasks)

- **Goal:** Mini/expanded player, queue UX, lyrics UX.
- **Depends on:** M4.1, M5.4
- **Exit criteria:** Player/queue/lyrics UI tests.

- [ ] **U4-108** (P1) — Restore every v0.1.8 player setting intentionally — _Part 4 · G. Mini player and expanded player_  
  Audio quality, persisted volume, equalizer, varispeed, seek interval, pause-on-mute, persistent queue, and taskbar controls must either return or be formally removed with migration/release notes.
- [ ] **U4-109** (P1) — Make previous/play/next icon buttons explicitly named — _Part 4 · G. Mini player and expanded player_  
  Symbol text and `title` are not a reliable accessible name strategy.
- [ ] **U4-110** (P1) — Add `aria-pressed` to repeat and favorite controls — _Part 4 · G. Mini player and expanded player_  
  Announce repeat Off/One/All state changes.
- [ ] **U4-111** (P1) — Add keyboard seek announcements — _Part 4 · G. Mini player and expanded player_  
  Screen readers need updated current time without flooding live regions.
- [ ] **U4-112** (P1) — Add seek tooltip and buffered/downloaded indication — _Part 4 · G. Mini player and expanded player_
- [ ] **U4-113** (P1) — Add mute button and wheel/keyboard volume support with visible value — _Part 4 · G. Mini player and expanded player_
- [ ] **U4-114** (P1) — Add playback-speed/pitch panel — _Part 4 · G. Mini player and expanded player_  
  Preserve separate and linked/varispeed modes where supported.
- [ ] **U4-115** (P1) — Add audio-quality indicator and selector — _Part 4 · G. Mini player and expanded player_  
  Show Auto/Low/High plus actual codec/bitrate when known.
- [ ] **U4-116** (P1) — Add equalizer entry and real Windows DSP implementation before showing the control — _Part 4 · G. Mini player and expanded player_
- [ ] **U4-117** (P1) — Add playback error card — _Part 4 · G. Mini player and expanded player_  
  Include concise cause, Retry, Skip, Details, Copy diagnostics, and Change source/client where safe.
- [ ] **U4-118** (P1) — Keep the old audible item visible until the next item actually starts — _Part 4 · G. Mini player and expanded player_  
  Show “Preparing…” without lying about now playing.
- [ ] **U4-119** (P1) — Add loading/buffering state to the play button and artwork — _Part 4 · G. Mini player and expanded player_  
  Disable duplicate play requests.
- [ ] **U4-120** (P1) — Add download/cache/progress badge to now playing — _Part 4 · G. Mini player and expanded player_
- [ ] **U4-121** (P1) — Make title, artist, and album interactive with correct routes — _Part 4 · G. Mini player and expanded player_
- [ ] **U4-122** (P1) — Add full-player views/tabs for artwork, lyrics, and queue — _Part 4 · G. Mini player and expanded player_  
  Do not force lyrics to occupy the full player when unavailable.
- [ ] **U4-123** (P1) — Preserve player view and lyric scroll state across collapse/expand — _Part 4 · G. Mini player and expanded player_  
  Current close handlers may clear lyrics.
- [ ] **U4-124** (P1) — Support artwork crop/fit and dynamic background options — _Part 4 · G. Mini player and expanded player_
- [ ] **U4-125** (P1) — Add system media-session parity — _Part 4 · G. Mini player and expanded player_  
  Metadata, playback state, timeline, previous/next availability, thumbnail, and source changes must remain synchronized.
- [ ] **U4-126** (P1) — Add taskbar thumbnail-toolbar controls where Windows supports them — _Part 4 · G. Mini player and expanded player_
- [ ] **U4-127** (P1) — Add global media keys, headset buttons, and optional pause-on-session-lock/device change behavior — _Part 4 · G. Mini player and expanded player_
- [ ] **U4-128** (P1) — Add compact mini-player behavior at narrow widths — _Part 4 · G. Mini player and expanded player_  
  Hide secondary controls behind a menu instead of shrinking them below comfortable targets.
- [ ] **U4-129** (P1) — Meet minimum target size — _Part 4 · G. Mini player and expanded player_  
  Several controls are 30–34 px; target at least 40–44 effective pixels where possible.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src/App.css#L154-L167]
- [ ] **U4-130** (P1) — Use unique queue-entry IDs — _Part 4 · H. Queue UX_  
  Duplicate songs must be distinguishable.
- [ ] **U4-131** (P1) — Highlight now playing by queue entry, not song ID — _Part 4 · H. Queue UX_
- [ ] **U4-132** (P1) — Add drag reorder with full keyboard alternative — _Part 4 · H. Queue UX_  
  Keep existing Move Up/Down actions.
- [ ] **U4-133** (P1) — Add multi-select queue editing — _Part 4 · H. Queue UX_  
  Remove, play next, move, download, and save selected items.
- [ ] **U4-134** (P1) — Add undo for remove and clear queue — _Part 4 · H. Queue UX_  
  Clear queue currently stops playback immediately with no confirmation/undo.
- [ ] **U4-135** (P1) — Add queue sections — _Part 4 · H. Queue UX_  
  Previous/history, Now Playing, Up Next, Autoplay/Automix, and continuation-loading state.
- [ ] **U4-136** (P1) — Show source context — _Part 4 · H. Queue UX_  
  Album, playlist, radio, Spotify playlist, local selection, search, or autoplay.
- [ ] **U4-137** (P1) — Add “Save queue as playlist.” — _Part 4 · H. Queue UX_
- [ ] **U4-138** (P1) — Add queue menu separate from player menu — _Part 4 · H. Queue UX_  
  Reference intentionally separates these surfaces.
- [ ] **U4-139** (P1) — Preserve canonical order when shuffle toggles off — _Part 4 · H. Queue UX_  
  UX must explain shuffled versus original order.
- [ ] **U4-140** (P1) — Make Play Next deterministic even when shuffle is enabled — _Part 4 · H. Queue UX_  
  Part 2 found the inserted item can be reshuffled away from next.
- [ ] **U4-141** (P1) — Announce queue edits — _Part 4 · H. Queue UX_  
  Include new position and current-item consequences.
- [ ] **U4-142** (P1) — Scroll/focus current item when the queue opens and after shuffle/reorder — _Part 4 · H. Queue UX_
- [ ] **U4-143** (P1) — Show continuation and automix failures with Retry — _Part 4 · H. Queue UX_  
  Do not silently return an empty list.
- [ ] **U4-144** (P1) — Add persistent-queue restore prompt when the previous session ended abnormally — _Part 4 · H. Queue UX_
- [ ] **U4-145** (P1) — Restore provider picker and cached variants from v0.1.8 — _Part 4 · I. Lyrics UX_  
  Current `main` lost the full release behavior.
- [ ] **U4-146** (P1) — Add provider menu with current, available, failed, disabled, and cached states — _Part 4 · I. Lyrics UX_
- [ ] **U4-147** (P1) — Add manual search and candidate preview — _Part 4 · I. Lyrics UX_
- [ ] **U4-148** (P1) — Add edit, offset, re-sync, and reset actions — _Part 4 · I. Lyrics UX_
- [ ] **U4-149** (P1) — Add copy line, copy all, and share lyrics/image flows — _Part 4 · I. Lyrics UX_  
  Respect provider attribution and legal limits.
- [ ] **U4-150** (P1) — Add word-synced/background-vocal/multi-singer presentation where data supports it — _Part 4 · I. Lyrics UX_
- [ ] **U4-151** (P1) — Add text alignment, font size, font family, glow/animation, translation, romanization, and background-style settings — _Part 4 · I. Lyrics UX_
- [ ] **U4-152** (P1) — Respect reduced motion — _Part 4 · I. Lyrics UX_  
  Disable scaling/glow/smooth auto-scroll animations.
- [ ] **U4-153** (P1) — Add auto-scroll resume affordance — _Part 4 · I. Lyrics UX_  
  User scroll currently disables auto-scroll but there is no prominent persistent control to resume it.
- [ ] **U4-154** (P1) — Do not render hundreds of lyric lines as independent generic buttons without list semantics — _Part 4 · I. Lyrics UX_  
  Use an accessible timed-text structure with current-line state.
- [ ] **U4-155** (P1) — Announce active lyric sparingly — _Part 4 · I. Lyrics UX_  
  Avoid live-region spam.
- [ ] **U4-156** (P1) — Keep playback shortcuts active in lyrics while protecting line navigation — _Part 4 · I. Lyrics UX_
- [ ] **U4-157** (P1) — Add plain-lyrics search, selection, and copy accessibility — _Part 4 · I. Lyrics UX_
- [ ] **U4-158** (P1) — Show provider attribution and cached/offline status clearly — _Part 4 · I. Lyrics UX_
- [ ] **U4-159** (P1) — Prefetch next-track lyrics with cancellation and no UI race — _Part 4 · I. Lyrics UX_

### M6.4 Menus, dialogs, confirmations, selection (38 tasks)

- **Goal:** Accessible dialogs/menus/confirmations/undo/selection (range selection, occurrence-based).
- **Depends on:** M6.1
- **Exit criteria:** Dialog focus tests; destructive actions confirm/undo.

- [ ] **U4-160** (P1) — Build one accessible Dialog primitive — _Part 4 · J. Menus, dialogs, confirmations, and selection_  
  It must set an accessible name/description, move initial focus, trap focus, mark background inert, close appropriately, and restore focus.
- [ ] **U4-161** (P1) — Build one Menu primitive — _Part 4 · J. Menus, dialogs, confirmations, and selection_  
  Use menu/menuitem semantics, arrow navigation, Home/End, typeahead, Escape, outside click, and anchor-relative placement.
- [ ] **U4-162** (P1) — Build one Popover/Combobox primitive — _Part 4 · J. Menus, dialogs, confirmations, and selection_  
  Do not treat every layer as a centered dialog.
- [ ] **U4-163** (P1) — Bind every dialog to its heading with `aria-labelledby` — _Part 4 · J. Menus, dialogs, confirmations, and selection_  
  `aria-modal` alone is insufficient.
- [ ] **U4-164** (P1) — Keep Escape behavior topmost-first — _Part 4 · J. Menus, dialogs, confirmations, and selection_  
  The current global ordered boolean list can close a different layer than the visually topmost one.
- [ ] **U4-165** (P1) — Make Settings Back return one level before closing — _Part 4 · J. Menus, dialogs, confirmations, and selection_  
  Current global `goBack` closes Settings entirely even when inside a settings category.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src/App.tsx#L363-L375]
- [ ] **U4-166** (P1) — Prevent background shortcuts while a modal is open — _Part 4 · J. Menus, dialogs, confirmations, and selection_  
  Space/seek/navigation must not act behind a dialog unless explicitly intended.
- [ ] **U4-167** (P1) — Confirm irreversible remote deletion — _Part 4 · J. Menus, dialogs, confirmations, and selection_  
  Uploaded-song deletion must name the service and item and explain irreversibility.
- [ ] **U4-168** (P1) — Confirm clearing local history, search history, queue, downloads, caches, playlists, and library data — _Part 4 · J. Menus, dialogs, confirmations, and selection_
- [ ] **U4-169** (P1) — Offer Undo for reversible removals — _Part 4 · J. Menus, dialogs, confirmations, and selection_  
  Local playlist, local history, queue, pin, and local-library changes.
- [ ] **U4-170** (P1) — Distinguish Remove, Delete, Disconnect, and Clear — _Part 4 · J. Menus, dialogs, confirmations, and selection_  
  Never call file deletion “remove cache” when it is an explicit offline download.
- [ ] **U4-171** (P1) — Disable actions while submitting — _Part 4 · J. Menus, dialogs, confirmations, and selection_  
  Prevent duplicate create/rename/remove/sync commands.
- [ ] **U4-172** (P1) — Preserve dialog input after recoverable errors — _Part 4 · J. Menus, dialogs, confirmations, and selection_
- [ ] **U4-173** (P1) — Show item eligibility before bulk actions — _Part 4 · J. Menus, dialogs, confirmations, and selection_  
  Avoid silently skipping failures in `forEach(...catch(() => undefined))` download starts.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src/App.tsx#L821-L826]
- [ ] **U4-174** (P1) — Add progress/cancel to bulk operations — _Part 4 · J. Menus, dialogs, confirmations, and selection_  
  Like, download, add to playlist, and delete should not block or become an untracked loop.
- [ ] **U4-175** (P1) — Restore focus to the invoking control after close — _Part 4 · J. Menus, dialogs, confirmations, and selection_
- [ ] **U4-176** (P1) — Keep context menus on screen — _Part 4 · J. Menus, dialogs, confirmations, and selection_  
  Reposition above/left near edges and account for DPI scaling.
- [ ] **U4-177** (P1) — Add right-click and keyboard context-menu invocation — _Part 4 · J. Menus, dialogs, confirmations, and selection_  
  Shift+F10/Menu key.
- [ ] **U4-178** (P1) — Add tooltips for icon-only controls — _Part 4 · J. Menus, dialogs, confirmations, and selection_  
  Tooltips do not replace accessible names.
- [ ] **X4-001** (P1) — Settings is treated as one boolean modal, so Back closes the entire settings experience rather than returning from a category — _Part 4 §8_  
  Additional Part 4 finding; implement with the matching U4 items and add a test.
- [ ] **X4-002** (P1) — Eighteen modal surfaces use dialog roles but none is built on a real focus-managed dialog primitive — _Part 4 §8_  
  Additional Part 4 finding; implement with the matching U4 items and add a test.
- [ ] **X4-003** (P1) — The recent-search listbox lacks combobox keyboard semantics and focus-controlled visibility — _Part 4 §8_  
  Additional Part 4 finding; implement with the matching U4 items and add a test.
- [ ] **X4-004** (P1) — Several tablists do not give their child controls tab roles or selected states — _Part 4 §8_  
  Additional Part 4 finding; implement with the matching U4 items and add a test.
- [ ] **X4-005** (P1) — Global Space/arrow shortcuts can override focused buttons and ARIA widgets because only input/textarea/select/contenteditable are excluded — _Part 4 §8_  
  Additional Part 4 finding; implement with the matching U4 items and add a test.
- [ ] **X4-006** (P1) — Selection uses song IDs, so duplicate occurrences cannot be independently selected — _Part 4 §8_  
  Additional Part 4 finding; implement with the matching U4 items and add a test.
- [ ] **X4-007** (P1) — Bulk download starts per-item operations and suppresses individual errors while immediately claiming a count started — _Part 4 §8_  
  Additional Part 4 finding; implement with the matching U4 items and add a test.
- [ ] **X4-008** (P1) — Remove selected downloads has no confirmation, eligibility review, progress, cancellation, or undo — _Part 4 §8_  
  Additional Part 4 finding; implement with the matching U4 items and add a test.
- [ ] **X4-009** (P1) — Uploaded-song deletion is immediate despite being a destructive remote operation — _Part 4 §8_  
  Additional Part 4 finding; implement with the matching U4 items and add a test.
- [ ] **X4-010** (P1) — Queue Clear immediately stops playback and destroys queue state without confirmation or undo — _Part 4 §8_  
  Additional Part 4 finding; implement with the matching U4 items and add a test.
- [ ] **X4-011** (P1) — The visual minimum target for several controls is around 30–34 px — _Part 4 §8_  
  Additional Part 4 finding; implement with the matching U4 items and add a test.
- [ ] **X4-012** (P1) — Card menus are hover-hidden and need `:focus-within`/touch treatment — _Part 4 §8_  
  Additional Part 4 finding; implement with the matching U4 items and add a test.
- [ ] **X4-013** (P1) — The app has no reduced-motion, forced-colors, high-contrast, light-theme, or system-theme CSS path — _Part 4 §8_  
  Additional Part 4 finding; implement with the matching U4 items and add a test.
- [ ] **X4-014** (P1) — The minimum 860 px window width prevents compact Windows snap layouts — _Part 4 §8_  
  Additional Part 4 finding; implement with the matching U4 items and add a test.
- [ ] **X4-015** (P1) — Player close clears the visible player rather than offering a configurable stop/minimize/keep-playing policy — _Part 4 §8_  
  Additional Part 4 finding; implement with the matching U4 items and add a test.
- [ ] **X4-016** (P1) — Lyrics auto-scroll disables on interaction without a persistent, obvious resume control — _Part 4 §8_  
  Additional Part 4 finding; implement with the matching U4 items and add a test.
- [ ] **X4-017** (P1) — Development language such as “typed item,” “watchEndpoint,” and “source contracts” leaks into normal UI copy — _Part 4 §8_  
  Additional Part 4 finding; implement with the matching U4 items and add a test.
- [ ] **X4-018** (P1) — All user-facing strings are hardcoded in English — _Part 4 §8_  
  Additional Part 4 finding; implement with the matching U4 items and add a test.
- [ ] **X4-019** (P1) — Missing reference features are extensive enough that parity must be managed as routes/capabilities, not by adding more conditions to `App.tsx` — _Part 4 §8_  
  Additional Part 4 finding; implement with the matching U4 items and add a test.

### M6.5 Accessibility (25 tasks)

- **Goal:** Keyboard, focus, semantics, announcements, visual/motor accessibility.
- **Depends on:** M6.4
- **Exit criteria:** axe clean; manual Narrator checklist.

- [ ] **U4-221** (P1) — Define a complete keyboard map — _Part 4 · L. Accessibility · Keyboard and focus_  
  Space, Ctrl+F, Alt+Left/Right, media keys, seek, volume, next/previous, queue, lyrics, mute, shuffle, repeat, and command palette.
- [ ] **U4-222** (P1) — Never steal Space/arrow keys from focused buttons, sliders, menus, tabs, lists, or dialogs — _Part 4 · L. Accessibility · Keyboard and focus_  
  Current check excludes form controls but not focused buttons or ARIA widgets.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src/App.tsx#L1552-L1582]
- [ ] **U4-223** (P1) — Add roving focus for tablists, menu lists, card rows, queue, and lyrics — _Part 4 · L. Accessibility · Keyboard and focus_
- [ ] **U4-224** (P1) — Preserve focus during pagination and sorting — _Part 4 · L. Accessibility · Keyboard and focus_
- [ ] **U4-225** (P1) — Ensure hidden/covered content cannot receive focus — _Part 4 · L. Accessibility · Keyboard and focus_  
  Use inertness while modal.
- [ ] **U4-226** (P1) — Add skip links/landmarks — _Part 4 · L. Accessibility · Keyboard and focus_  
  Skip to content, player, queue, and navigation.
- [ ] **U4-227** (P1) — Make all pointer gestures keyboard-operable — _Part 4 · L. Accessibility · Keyboard and focus_  
  Hover-only card menus must become visible on focus-within.
- [ ] **U4-228** (P1) — Give every dialog an accessible name and description — _Part 4 · L. Accessibility · Semantics and announcements_
- [ ] **U4-229** (P1) — Correct tab, listbox, menu, toolbar, grid, slider, and progress semantics — _Part 4 · L. Accessibility · Semantics and announcements_
- [ ] **U4-230** (P1) — Add accessible value text to seek, volume, sleep timer, speed, pitch, EQ, and progress controls — _Part 4 · L. Accessibility · Semantics and announcements_
- [ ] **U4-231** (P1) — Announce loading completion and errors without replacing focus — _Part 4 · L. Accessibility · Semantics and announcements_
- [ ] **U4-232** (P1) — Add progress semantics to downloads and sync — _Part 4 · L. Accessibility · Semantics and announcements_
- [ ] **U4-233** (P1) — Do not truncate the only error copy — _Part 4 · L. Accessibility · Semantics and announcements_  
  The notice visually summarizes text; retain a detailed accessible error route/log.
- [ ] **U4-234** (P1) — Name artwork meaningfully only when informative — _Part 4 · L. Accessibility · Semantics and announcements_  
  Decorative duplicates can keep empty `alt`; unique covers need useful context where appropriate.
- [ ] **U4-235** (P1) — Replace symbol pronunciation risk — _Part 4 · L. Accessibility · Semantics and announcements_  
  Unicode glyphs such as `Ⅱ`, `⤨`, `☷`, `×`, arrows, and hearts require explicit accessible labels.
- [ ] **U4-236** (P1) — Do not rely on color — _Part 4 · L. Accessibility · Semantics and announcements_  
  Active, downloaded, explicit, error, cached, source, and selected states need text/icon/shape.
- [ ] **U4-237** (P1) — Meet WCAG AA contrast for text and controls in every theme/state — _Part 4 · L. Accessibility · Visual and motor accessibility_
- [ ] **U4-238** (P1) — Keep focus indicators visible over all backgrounds and overlays — _Part 4 · L. Accessibility · Visual and motor accessibility_
- [ ] **U4-239** (P1) — Increase small hit targets — _Part 4 · L. Accessibility · Visual and motor accessibility_  
  Especially card menus, transport, close, reorder, and sidebar controls.
- [ ] **U4-240** (P1) — Support 200% text scaling without horizontal page clipping — _Part 4 · L. Accessibility · Visual and motor accessibility_
- [ ] **U4-241** (P1) — Support reduced motion, high contrast, and reduced transparency — _Part 4 · L. Accessibility · Visual and motor accessibility_
- [ ] **U4-242** (P1) — Avoid time-limited notices as the sole feedback — _Part 4 · L. Accessibility · Visual and motor accessibility_  
  Keep important failures in a notification center or inline state.
- [ ] **U4-243** (P1) — Do not auto-focus destructive buttons — _Part 4 · L. Accessibility · Visual and motor accessibility_
- [ ] **U4-244** (P1) — Test with Narrator, keyboard only, Windows High Contrast, 200% scale, and touch — _Part 4 · L. Accessibility · Visual and motor accessibility_
- [ ] **TR-M8** (P1) — Accessibility incomplete — _Technical review (Appendix G)_  
  Part 4 L items + axe automation.

### M6.6 Loading, errors, offline, copy, i18n (16 tasks)

- **Goal:** Truthful loading/error/offline states, copy cleanup, i18n extraction + RTL.
- **Depends on:** M6.1
- **Exit criteria:** No hardcoded strings (lint); error states tested.

- [ ] **U4-281** (P1) — Use stale-while-revalidate — _Part 4 · O. Loading, errors, offline behavior, and copy quality_  
  Keep usable cached content visible during refresh.
- [ ] **U4-282** (P1) — Distinguish offline, timeout, authentication, rate-limit, parser, unavailable-content, and playback-source errors — _Part 4 · O. Loading, errors, offline behavior, and copy quality_
- [ ] **U4-283** (P1) — Provide contextual Retry — _Part 4 · O. Loading, errors, offline behavior, and copy quality_  
  Retry only the failed section/action, not the entire application.
- [ ] **U4-284** (P1) — Show account-expired banners — _Part 4 · O. Loading, errors, offline behavior, and copy quality_  
  Keep local/offline content usable.
- [ ] **U4-285** (P1) — Show rate-limit countdown using Retry-After when available — _Part 4 · O. Loading, errors, offline behavior, and copy quality_
- [ ] **U4-286** (P1) — Show partial-success summaries — _Part 4 · O. Loading, errors, offline behavior, and copy quality_  
  Especially bulk likes/downloads/imports/sync.
- [ ] **U4-287** (P1) — Keep technical details expandable — _Part 4 · O. Loading, errors, offline behavior, and copy quality_  
  User message first, endpoint/status/request ID second, secrets always redacted.
- [ ] **U4-288** (P1) — Add offline badges and availability filters — _Part 4 · O. Loading, errors, offline behavior, and copy quality_
- [ ] **U4-289** (P1) — Never claim completion before backend confirmation — _Part 4 · O. Loading, errors, offline behavior, and copy quality_
- [ ] **U4-290** (P1) — Replace developer-facing copy — _Part 4 · O. Loading, errors, offline behavior, and copy quality_  
  Remove phrases such as “typed item,” “watchEndpoint,” “YTItems,” “source contract,” and “native cache” from normal user flows.
- [ ] **U4-291** (P1) — Use consistent product terms — _Part 4 · O. Loading, errors, offline behavior, and copy quality_  
  Download, playback cache, library, liked, saved, pinned, subscribed, local file, and uploaded must each mean one thing.
- [ ] **U4-292** (P1) — Add human-readable empty-state actions — _Part 4 · O. Loading, errors, offline behavior, and copy quality_  
  Connect account, import files, clear filter, retry, create playlist, or learn why unavailable.
- [ ] **U4-293** (P1) — Keep notice history — _Part 4 · O. Loading, errors, offline behavior, and copy quality_  
  Users should be able to reopen recent failures/progress instead of losing them after one toast.
- [ ] **U4-294** (P1) — Do not silently swallow background errors — _Part 4 · O. Loading, errors, offline behavior, and copy quality_  
  Home automix, auto-download, state refresh, and event listener failures need bounded diagnostics.
- [ ] **TR-M9** (P1) — No localization architecture — _Technical review (Appendix G)_  
  i18next; extract all strings (Phase 6).
- [ ] **TR-L6** (P1) — Per-feature empty/error/offline states instead of one notice string — _Technical review (Appendix G)_  
  U4 O items.

### M6.7 Design system and visual consistency (42 tasks)

- **Goal:** Design system: tokens, themes (dark/light/system/high-contrast), components, motion.
- **Depends on:** M6.1
- **Exit criteria:** Visual regression snapshots.

- [ ] **U4-295** (P2) — Define tokens — _Part 4 · P. Design system and visual consistency_  
  Color, spacing, radius, elevation, typography, animation, focus, target size, and z-index.
- [ ] **U4-296** (P2) — Replace ad hoc z-index management with named layers — _Part 4 · P. Design system and visual consistency_  
  Base, sticky header, player, selection bar, popover, menu, modal, critical dialog, tooltip.
- [ ] **U4-297** (P2) — Standardize buttons — _Part 4 · P. Design system and visual consistency_  
  Primary, secondary, subtle, icon, danger, split, loading, and destructive confirmation.
- [ ] **U4-298** (P2) — Standardize cards/list rows — _Part 4 · P. Design system and visual consistency_  
  One action hierarchy, artwork size, metadata truncation, badges, current-playing state, and context menu.
- [ ] **U4-299** (P2) — Standardize screen headers and toolbars — _Part 4 · P. Design system and visual consistency_  
  Title, subtitle, primary actions, filters, sort, view, refresh, selection.
- [ ] **U4-300** (P2) — Standardize loading/empty/error panels — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-301** (P2) — Standardize form controls — _Part 4 · P. Design system and visual consistency_  
  Labels, help, error, required, disabled reason, keyboard behavior.
- [ ] **U4-302** (P2) — Use proper icon assets — _Part 4 · P. Design system and visual consistency_  
  Consistent SVGs, not mixed text glyphs.
- [ ] **U4-303** (P2) — Ensure artwork is not upscaled unnecessarily — _Part 4 · P. Design system and visual consistency_  
  Select suitable source resolution for rendered size and DPI.
- [ ] **U4-304** (P2) — Add image loading, fallback, retry, and offline-cache states without layout shift — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-305** (P2) — Apply truncation deliberately — _Part 4 · P. Design system and visual consistency_  
  Provide tooltip/accessible full name and avoid clipping controls.
- [ ] **U4-306** (P2) — Keep the visual language Windows-native without becoming a generic Fluent clone — _Part 4 · P. Design system and visual consistency_  
  Preserve Meld identity while using familiar desktop behavior.
- [ ] **U4-307** (P2) — Every route renders loading, empty, error, stale, offline, and success states — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-308** (P2) — Back/forward restores route parameters, filters, selection, scroll, and modal stack — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-309** (P2) — Stale async responses cannot update a replaced route — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-310** (P2) — Dialog focus enters, traps, closes, and restores correctly — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-311** (P2) — Menus and comboboxes pass keyboard interaction tests — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-312** (P2) — Tablists use correct roles and arrow navigation — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-313** (P2) — Global playback shortcuts do not override focused controls/widgets — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-314** (P2) — Bulk actions report eligible/succeeded/failed/skipped counts — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-315** (P2) — Duplicate songs remain independent in queue, playlist, history, and selection — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-316** (P2) — Destructive actions require confirmation or support Undo according to policy — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-317** (P2) — Every icon-only button has an accessible name and visible tooltip — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-318** (P2) — Every modal has an accessible name and no background tabbability — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-319** (P2) — Screen-reader live regions do not spam playback ticks or lyric lines — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-320** (P2) — Reduced-motion mode disables nonessential animation/smooth scroll — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-321** (P2) — Test 640/720/860/1024/1280/1440/1920 px widths and 600/768/1080 px heights — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-322** (P2) — Test 100/125/150/175/200% Windows scaling — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-323** (P2) — Test light, dark, pure black, Windows High Contrast, and custom accent — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-324** (P2) — Test mouse, keyboard only, touchpad, touch, and coarse pointer — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-325** (P2) — Test long English, German-like expansion, Arabic RTL, CJK, emoji, and mixed-script metadata — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-326** (P2) — Test extremely long titles/artists/playlists and missing/broken artwork — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-327** (P2) — Test modal/menu placement at every screen edge and monitor DPI transition — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-328** (P2) — Test player with no lyrics, plain lyrics, line sync, word sync, error, local file, podcast, and unavailable stream — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-329** (P2) — Test offline startup with downloads, cache, local files, and stale remote pages — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-330** (P2) — Test every destructive confirmation and cancellation path — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-331** (P2) — Complete all daily flows with keyboard only — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-332** (P2) — Complete all daily flows with Windows Narrator — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-333** (P2) — Verify focus order and visible focus in every dialog/menu/route — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-334** (P2) — Verify high contrast and 200% text without loss of content or action — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-335** (P2) — Verify reduced motion and no seizure/vestibular hazards — _Part 4 · P. Design system and visual consistency_
- [ ] **U4-336** (P2) — Verify status/error/progress messages are perceivable and persistent enough — _Part 4 · P. Design system and visual consistency_

## Phase 7 — Settings parity and Windows OS integration (68 tasks)


### M7.1 Settings parity (42 tasks)

- **Goal:** Settings architecture and every settings category with real behaviour.
- **Depends on:** M6.1
- **Exit criteria:** Settings hydration/persistence tests.

- [ ] **U4-179** (P1) — Make each settings category routable and searchable — _Part 4 · K. Settings parity · Settings architecture_  
  Appearance, Player, Content, Privacy, Storage, Accounts, Integrations, Backup/Restore, and About.
- [ ] **U4-180** (P1) — Add Reset per setting group and Reset All with preview — _Part 4 · K. Settings parity · Settings architecture_
- [ ] **U4-181** (P1) — Show when restart is required — _Part 4 · K. Settings parity · Settings architecture_  
  Apply immediately where safe.
- [ ] **U4-182** (P1) — Validate every numeric/text setting inline — _Part 4 · K. Settings parity · Settings architecture_  
  Do not rely solely on backend rejection notices.
- [ ] **U4-183** (P1) — Add setting dependency states — _Part 4 · K. Settings parity · Settings architecture_  
  Explain why controls are disabled and how to enable them.
- [ ] **U4-184** (P1) — Version settings and migrate renamed/removed values — _Part 4 · K. Settings parity · Settings architecture_
- [ ] **U4-185** (P1) — Remove development-audit prose from final customer UI — _Part 4 · K. Settings parity · Settings architecture_  
  Replace it with real controls or concise product copy.
- [ ] **U4-186** (P1) — Light/Dark/System/Pure Black — _Part 4 · K. Settings parity · Appearance_
- [ ] **U4-187** (P1) — Dynamic artwork/player background toggle — _Part 4 · K. Settings parity · Appearance_
- [ ] **U4-188** (P1) — Accent palette and contrast-safe custom color — _Part 4 · K. Settings parity · Appearance_
- [ ] **U4-189** (P1) — Font family, UI scale/density, grid size, and artwork crop/fit — _Part 4 · K. Settings parity · Appearance_
- [ ] **U4-190** (P1) — Lyrics alignment, font size/style, glow, animation, and background — _Part 4 · K. Settings parity · Appearance_
- [ ] **U4-191** (P1) — Navigation customization and compact/sidebar behavior — _Part 4 · K. Settings parity · Appearance_
- [ ] **U4-192** (P1) — Reduce motion and transparency — _Part 4 · K. Settings parity · Appearance_  
  Also respect system settings automatically.
- [ ] **U4-193** (P1) — Audio quality with actual format display — _Part 4 · K. Settings parity · Player/audio_
- [ ] **U4-194** (P1) — Volume persistence and pause-on-mute — _Part 4 · K. Settings parity · Player/audio_
- [ ] **U4-195** (P1) — Seek step, varispeed, pitch, and speed controls — _Part 4 · K. Settings parity · Player/audio_
- [ ] **U4-196** (P1) — Equalizer/AutoEQ and reset/bypass — _Part 4 · K. Settings parity · Player/audio_
- [ ] **U4-197** (P1) — Audio normalization level — _Part 4 · K. Settings parity · Player/audio_
- [ ] **U4-198** (P1) — Silence skipping — _Part 4 · K. Settings parity · Player/audio_
- [ ] **U4-199** (P1) — Crossfade only after the Windows playback engine supports it correctly — _Part 4 · K. Settings parity · Player/audio_
- [ ] **U4-200** (P1) — Persistent queue, autoplay/automix, pre-cache, shuffle/repeat persistence, duplicate policy, and stop-on-close behavior — _Part 4 · K. Settings parity · Player/audio_
- [ ] **U4-201** (P1) — “Play over other audio”/exclusive-mode policy appropriate to Windows — _Part 4 · K. Settings parity · Player/audio_
- [ ] **U4-202** (P1) — Preferred YouTube client/source diagnostics only in Advanced — _Part 4 · K. Settings parity · Player/audio_
- [ ] **U4-203** (P1) — Explicit/video filtering with scope explanation — _Part 4 · K. Settings parity · Content/privacy/storage_
- [ ] **U4-204** (P1) — Lyrics provider enable/order plus per-provider status — _Part 4 · K. Settings parity · Content/privacy/storage_  
  Remove retired providers when upstream retires them.
- [ ] **U4-205** (P1) — Romanization and translation settings — _Part 4 · K. Settings parity · Content/privacy/storage_
- [ ] **U4-206** (P1) — Proxy configuration with validation/test action — _Part 4 · K. Settings parity · Content/privacy/storage_
- [ ] **U4-207** (P1) — Separate local and remote history controls — _Part 4 · K. Settings parity · Content/privacy/storage_  
  Listen/search/recognition/remote YouTube history.
- [ ] **U4-208** (P1) — Cache limits, image cache, player cache, download storage, clear/verify/repair, and storage-location controls — _Part 4 · K. Settings parity · Content/privacy/storage_
- [ ] **U4-209** (P1) — Pre-cache count and metered-network policy — _Part 4 · K. Settings parity · Content/privacy/storage_  
  Translate Wi-Fi-only into Windows metered-network semantics.
- [ ] **U4-210** (P1) — Crash-reporting consent and privacy details if telemetry is added — _Part 4 · K. Settings parity · Content/privacy/storage_  
  Default should be explicit and transparent.
- [ ] **U4-211** (P1) — Backup/restore preview, merge/replace mode, media exclusion, and schema compatibility — _Part 4 · K. Settings parity · Content/privacy/storage_  
  Part 3 defines backend requirements.
- [ ] **U4-212** (P1) — Full Google account screen — _Part 4 · K. Settings parity · Accounts/integrations/about_  
  Identity, validation, sync status, last sync, switch account, disconnect/keep/delete choices.
- [ ] **U4-213** (P1) — Full Spotify screen — _Part 4 · K. Settings parity · Accounts/integrations/about_  
  Identity, token health, relogin banner, sync likes/follows, preload, cache, and mapping status.
- [ ] **U4-214** (P1) — Last.fm integration — _Part 4 · K. Settings parity · Accounts/integrations/about_  
  Login, scrobble/now-playing status, ignored scrobble diagnostics, love-track policy.
- [ ] **U4-215** (P1) — Discord integration only with clear risk disclosure and secure authentication — _Part 4 · K. Settings parity · Accounts/integrations/about_
- [ ] **U4-216** (P1) — Listen Together integration/settings — _Part 4 · K. Settings parity · Accounts/integrations/about_
- [ ] **U4-217** (P1) — AI lyrics translation settings only when a real provider is configured — _Part 4 · K. Settings parity · Accounts/integrations/about_  
  Secure key entry and cost/privacy warning.
- [ ] **U4-218** (P1) — Updater channel and update UI — _Part 4 · K. Settings parity · Accounts/integrations/about_  
  Stable/nightly policy, release notes, download progress, signature result, restart.
- [ ] **U4-219** (P1) — Changelog/release-notes screen and first-run-after-update summary — _Part 4 · K. Settings parity · Accounts/integrations/about_
- [ ] **U4-220** (P1) — Complete About screen — _Part 4 · K. Settings parity · Accounts/integrations/about_  
  Correct version, commit/build, license, source, acknowledgments, report issue, logs, and update status.

### M7.2 Responsive layout and Windows UX (16 tasks)

- **Goal:** Responsive/snap layouts, min width, touch targets, scaling, Windows UX conventions.
- **Depends on:** M6.7
- **Exit criteria:** Visual QA matrix.

- [ ] **U4-245** (P1) — Define layout classes by available width, not device labels — _Part 4 · M. Responsive layout and Windows-specific UX_  
  Compact, medium, wide, and ultra-wide.
- [ ] **U4-246** (P1) — Use wide screens productively — _Part 4 · M. Responsive layout and Windows-specific UX_  
  Master/detail library and search, persistent queue/lyrics side pane, and scalable card grids.
- [ ] **U4-247** (P1) — Keep line lengths readable — _Part 4 · M. Responsive layout and Windows-specific UX_  
  Settings and descriptions should not span the full large monitor width.
- [ ] **U4-248** (P1) — Make overlays fit 600 px height — _Part 4 · M. Responsive layout and Windows-specific UX_  
  Header/actions should remain visible; content scrolls independently.
- [ ] **U4-249** (P1) — Avoid overlay stacking — _Part 4 · M. Responsive layout and Windows-specific UX_  
  Opening a picker from a menu should replace or stack through a managed modal system, not independent booleans.
- [ ] **U4-250** (P1) — Add touch-friendly mode automatically for coarse pointers — _Part 4 · M. Responsive layout and Windows-specific UX_  
  Larger targets, persistent action menus, no hover dependency.
- [ ] **U4-251** (P1) — Add mouse wheel volume/seek only with clear hover/focus scope and configurable direction — _Part 4 · M. Responsive layout and Windows-specific UX_
- [ ] **U4-252** (P1) — Support drag-and-drop — _Part 4 · M. Responsive layout and Windows-specific UX_  
  Local audio import, playlist import, queue reorder, and optionally artwork.
- [ ] **U4-253** (P1) — Add Explorer integration carefully — _Part 4 · M. Responsive layout and Windows-specific UX_  
  “Open file location” for local/downloaded media and file associations for playlist imports.
- [ ] **U4-254** (P1) — Add Windows share/clipboard fallback — _Part 4 · M. Responsive layout and Windows-specific UX_  
  Confirm copied links and handle clipboard denial.
- [ ] **U4-255** (P1) — Add tray behavior only as an opt-in — _Part 4 · M. Responsive layout and Windows-specific UX_  
  Minimize/close behavior must be explicit, with playback state and Quit.
- [ ] **U4-256** (P1) — Add jump-list/recent actions if useful — _Part 4 · M. Responsive layout and Windows-specific UX_  
  Resume, Liked Songs, Downloads, Search—not private listening history by default.
- [ ] **U4-257** (P1) — Add native notifications sparingly — _Part 4 · M. Responsive layout and Windows-specific UX_  
  Download complete/failure and updates, respecting Focus Assist.
- [ ] **U4-258** (P1) — Handle monitor/DPI changes live — _Part 4 · M. Responsive layout and Windows-specific UX_  
  Menus, tooltips, and restored window coordinates must remain correct.
- [ ] **U4-259** (P1) — Support RTL and long translations before localization ships — _Part 4 · M. Responsive layout and Windows-specific UX_  
  The current UI is entirely hardcoded English.
- [ ] **U4-260** (P1) — Externalize all user-facing strings — _Part 4 · M. Responsive layout and Windows-specific UX_  
  Add pluralization and locale-aware date/time/number formatting.

### M7.3 Deep links, single instance, OS integration (10 tasks)

- **Goal:** Deep links, second-instance args, SMTC, taskbar buttons/progress, tray, jump list, media keys, autostart, power events.
- **Depends on:** M4.1
- **Exit criteria:** Windows integration manual matrix.

- [ ] **S5-075** (P1) — Register `meld://` deep links — _Part 5 · H. Deep links, single instance, and OS integration_  
  Use `tauri-plugin-deep-link` for `meld://song/<id>`, `album`, `playlist`, `artist`, and YouTube Music URLs; validate every link through the typed router from Part 4.
- [ ] **S5-076** (P1) — Forward args from the second instance — _Part 5 · H. Deep links, single instance, and OS integration_  
  The single-instance callback ignores `_args`; parse them so double-clicking a link or file opens it in the running app.
- [ ] **S5-077** (P1) — Validate files opened via association — _Part 5 · H. Deep links, single instance, and OS integration_  
  Audio files opened from Explorer go through the same validation as the file picker.
- [ ] **S5-078** (P1) — System Media Transport Controls — _Part 5 · H. Deep links, single instance, and OS integration_  
  Restore and extend Windows media integration (SMTC metadata, artwork, play/pause/next/previous, seek) that v0.1.8 had through the taskbar plugin.
- [ ] **S5-079** (P1) — Taskbar thumbnail buttons and progress — _Part 5 · H. Deep links, single instance, and OS integration_  
  Re-add previous/play-pause/next thumbnail buttons and download progress in the taskbar.
- [ ] **S5-080** (P1) — System tray — _Part 5 · H. Deep links, single instance, and OS integration_  
  Optional tray icon with playback controls and close-to-tray behavior.
- [ ] **S5-081** (P1) — Jump list — _Part 5 · H. Deep links, single instance, and OS integration_  
  Recent playlists and quick actions in the taskbar jump list.
- [ ] **S5-082** (P1) — Global media keys — _Part 5 · H. Deep links, single instance, and OS integration_  
  Handle hardware media keys through SMTC rather than global shortcuts.
- [ ] **S5-083** (P1) — Autostart (opt-in) — _Part 5 · H. Deep links, single instance, and OS integration_  
  Use `tauri-plugin-autostart` only when the user enables it.
- [ ] **S5-084** (P1) — Power and session events — _Part 5 · H. Deep links, single instance, and OS integration_  
  Pause/resume correctly on sleep, lock, and audio-device changes.

## Phase 8 — Performance, resilience, offline, observability (31 tasks)


### M8.1 Frontend rendering performance (11 tasks)

- **Goal:** Render isolation, virtualization, code-splitting, memoization, stale-response guards.
- **Depends on:** M6.*
- **Exit criteria:** Profiler budgets met.

- [ ] **R6-032** (P1) — Split the monolithic component — _Part 6 · D. Frontend rendering performance_  
  `App.tsx` is ~208 KB with 109 `useState` and only ~15 `useEffect` hooks plus few memoized values; every state change re-renders the whole app. (Ties to Part 4 U4-001.)
- [ ] **R6-033** (P1) — Isolate high-frequency playback state — _Part 6 · D. Frontend rendering performance_  
  Playback time updates drive whole-app renders.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src/App.tsx#L390-L405] Move current time into a separate store/subscription consumed only by the seek bar and lyrics.
- [ ] **R6-034** (P1) — Virtualize long lists — _Part 6 · D. Frontend rendering performance_  
  Library, playlists, history, queue, and search results render every row; use windowing for lists over ~200 items.
- [ ] **R6-035** (P1) — Lazy-load images — _Part 6 · D. Frontend rendering performance_  
  Only 2 image tags use lazy loading; use `loading="lazy"`, `decoding="async"`, fixed dimensions, and correctly sized thumbnails.
- [ ] **R6-036** (P1) — Code-split routes — _Part 6 · D. Frontend rendering performance_  
  The bundle is one 337 KB JS chunk; lazy-load settings, stats, Spotify, lyrics, and dialogs.
- [ ] **R6-037** (P1) — Memoize derived data — _Part 6 · D. Frontend rendering performance_  
  Sorting/filtering of library lists should be memoized and done off the render path for large libraries.
- [ ] **R6-038** (P1) — Avoid layout thrash in lyrics — _Part 6 · D. Frontend rendering performance_  
  Synced lyrics auto-scroll uses `requestAnimationFrame`; batch reads/writes and use `scrollIntoView` with reduced-motion support.
- [ ] **R6-039** (P1) — Debounce search and filter inputs — _Part 6 · D. Frontend rendering performance_  
  Remote search, library filter, and suggestions.
- [ ] **R6-040** (P1) — Stale-response protection — _Part 6 · D. Frontend rendering performance_  
  Only a few request-ID/cancellation guards exist; every async fetch tied to a route must ignore results after navigation.
- [ ] **R6-041** (P1) — React Profiler budgets — _Part 6 · D. Frontend rendering performance_  
  Commit time under 16 ms for playback ticks and under 50 ms for route changes on a mid-range laptop.
- [ ] **TR-L7** (P1) — Virtualize very large lists — _Technical review (Appendix G)_  
  R6 D / UI-006.

### M8.2 Resource budgets (7 tasks)

- **Goal:** Memory/CPU/battery budgets, leak checks, cache limits.
- **Depends on:** M8.1
- **Exit criteria:** Soak and budgets pass.

- [ ] **R6-042** (P2) — Define budgets — _Part 6 · E. Memory, CPU, and resource budgets_  
  Idle RAM < 250 MB (WebView2 + Rust), idle CPU < 1%, playing CPU < 3%, cold start < 2 s to interactive on SSD.
- [ ] **R6-043** (P2) — Leak checks — _Part 6 · E. Memory, CPU, and resource budgets_  
  Run a 4-hour playback soak and a 500-route navigation loop; memory must plateau.
- [ ] **R6-044** (P2) — Free large payloads — _Part 6 · E. Memory, CPU, and resource budgets_  
  Do not keep full raw InnerTube JSON in state; map to compact view models.
- [ ] **R6-045** (P2) — Throttle background work when minimized — _Part 6 · E. Memory, CPU, and resource budgets_  
  Pause animations, artwork prefetch, and non-essential polling when hidden.
- [ ] **R6-046** (P2) — Timer hygiene — _Part 6 · E. Memory, CPU, and resource budgets_  
  Every interval/listener must be cleared on unmount; add a lint rule and tests.
- [ ] **R6-047** (P2) — Artwork cache limits — _Part 6 · E. Memory, CPU, and resource budgets_  
  Cap artwork cache size and evict LRU.
- [ ] **R6-048** (P2) — Battery-aware behavior — _Part 6 · E. Memory, CPU, and resource budgets_  
  Reduce prefetch and visualizations on battery saver.

### M8.3 Startup, shutdown, offline, errors (13 tasks)

- **Goal:** Startup phases, graceful shutdown, crash-loop safe mode, offline outbox, error taxonomy UX.
- **Depends on:** M3.2
- **Exit criteria:** Startup < 2 s; offline tests.

- [ ] **R6-049** (P1) — Measure and log startup phases — _Part 6 · F. Startup and shutdown_  
  Process start, DB open, migrations, secret migration, asset re-grants, first paint, first data.
- [ ] **R6-050** (P1) — Defer non-critical startup work — _Part 6 · F. Startup and shutdown_  
  Re-granting every local file path and syncs should run after first paint.
- [ ] **R6-051** (P1) — Show a shell immediately — _Part 6 · F. Startup and shutdown_  
  Render cached library/home while network loads.
- [ ] **R6-052** (P1) — Graceful shutdown — _Part 6 · F. Startup and shutdown_  
  Flush history/playtime, finalize downloads as resumable, checkpoint WAL, and close the DB cleanly.
- [ ] **R6-053** (P1) — Restore session state — _Part 6 · F. Startup and shutdown_  
  Queue, position, route, and volume restore reliably after restart or crash.
- [ ] **R6-054** (P1) — Crash-loop protection — _Part 6 · F. Startup and shutdown_  
  If the app crashes repeatedly on startup, offer safe mode (no auto-sync, no restore).
- [ ] **R6-055** (P1) — Unified error taxonomy — _Part 6 · G. Error handling and offline behavior_  
  Shared Rust error enum mapped to UI messages, retry actions, and log codes (ties to Part 5 S5-007).
- [ ] **R6-056** (P1) — Offline mode — _Part 6 · G. Error handling and offline behavior_  
  Detect connectivity, show offline banner, serve downloads/cache/local files, and queue remote mutations for later.
- [ ] **R6-057** (P1) — Mutation outbox — _Part 6 · G. Error handling and offline behavior_  
  Likes, playlist edits, and library changes made offline are persisted and replayed with conflict handling.
- [ ] **R6-058** (P1) — Partial failure reporting — _Part 6 · G. Error handling and offline behavior_  
  Sync and bulk actions report per-item results instead of one success/fail.
- [ ] **R6-059** (P1) — Never silently swallow errors — _Part 6 · G. Error handling and offline behavior_  
  Audit `let _ =` and `.ok()` on writes/deletes; log at minimum.
- [ ] **R6-060** (P1) — User-visible recovery actions — _Part 6 · G. Error handling and offline behavior_  
  Every error state offers retry, sign in again, or open diagnostics.
- [ ] **TR-L5** (P1) — Crash recovery and safe-mode/reset for corrupt state — _Technical review (Appendix G)_  
  R6 F crash-loop protection.

## Phase 9 — Missing reference product surfaces and integrations (33 tasks)


### M9.1 Missing reference product surfaces (20 tasks)

- **Goal:** Missing reference surfaces (Listen Together, recognition, Wrapped, charts, moods, integrations, themes, updater UI, diagnostics…).
- **Depends on:** Phases 4–8
- **Exit criteria:** Each surface real + tested or retired.

- [ ] **U4-261** (P2) — Listen Together screen and real-time room UX — _Part 4 · N. Missing reference product surfaces_
- [ ] **U4-262** (P2) — Music recognition and recognition history — _Part 4 · N. Missing reference product surfaces_
- [ ] **U4-263** (P2) — Mood & Genres — _Part 4 · N. Missing reference product surfaces_
- [ ] **U4-264** (P2) — Charts — _Part 4 · N. Missing reference product surfaces_
- [ ] **U4-265** (P2) — New Releases — _Part 4 · N. Missing reference product surfaces_
- [ ] **U4-266** (P2) — Spotify Home, Search, Album, Artist, followed artists, recommendations, and re-login UX — _Part 4 · N. Missing reference product surfaces_
- [ ] **U4-267** (P2) — Wrapped/recap flow and weekly/monthly playlists — _Part 4 · N. Missing reference product surfaces_
- [ ] **U4-268** (P2) — Last.fm — _Part 4 · N. Missing reference product surfaces_
- [ ] **U4-269** (P2) — Discord presence — _Part 4 · N. Missing reference product surfaces_
- [ ] **U4-270** (P2) — AI/manual lyrics translation and romanization — _Part 4 · N. Missing reference product surfaces_
- [ ] **U4-271** (P2) — Full equalizer/AutoEQ wizard — _Part 4 · N. Missing reference product surfaces_
- [ ] **U4-272** (P2) — Import/export flows — _Part 4 · N. Missing reference product surfaces_  
  CSV, M3U/M3U8, backup preview/merge.
- [ ] **U4-273** (P2) — Changelog and update UX — _Part 4 · N. Missing reference product surfaces_
- [ ] **U4-274** (P2) — Crash/recovery screen — _Part 4 · N. Missing reference product surfaces_  
  Include safe restart, logs, reset UI state, and database recovery link.
- [ ] **U4-275** (P2) — Alarm/scheduled playback only if a reliable Windows background/task model is implemented — _Part 4 · N. Missing reference product surfaces_
- [ ] **U4-276** (P2) — Proxy settings and test connection — _Part 4 · N. Missing reference product surfaces_
- [ ] **U4-277** (P2) — Cache and pre-cache management — _Part 4 · N. Missing reference product surfaces_
- [ ] **U4-278** (P2) — Custom theme/colors, UI density, navigation customization, and pure-black mode — _Part 4 · N. Missing reference product surfaces_
- [ ] **U4-279** (P2) — Release notes/onboarding for first launch and major updates — _Part 4 · N. Missing reference product surfaces_
- [ ] **U4-280** (P2) — Diagnostics/support bundle with automatic secret redaction — _Part 4 · N. Missing reference product surfaces_

### M9.2 Release-audit features (FEAT) (13 tasks)

- **Goal:** Reference release features not covered elsewhere (FEAT-xxx).
- **Depends on:** Phases 4–8
- **Exit criteria:** Each FEAT done or retired.

- [ ] **FEAT-001** (P2) — Podcasts without login (guest) — _Release audit §2.2 (ref 0.9.2)_  
  Reference Meld 0.9.2 feature not covered by Parts 1–6. Implement a real Windows equivalent (or retire in DECISIONS.md with reason). Needs: settings toggle if optional, tests, docs.
- [ ] **FEAT-002** (P2) — Musixmatch removed (wrong lyrics) — _Release audit §2.2 (ref 0.9.2)_  
  Reference Meld 0.9.2 feature not covered by Parts 1–6. Implement a real Windows equivalent (or retire in DECISIONS.md with reason). Needs: settings toggle if optional, tests, docs.
- [ ] **FEAT-003** (P2) — Search user profiles — _Release audit §2.2 (ref 0.9.2)_  
  Reference Meld 0.9.2 feature not covered by Parts 1–6. Implement a real Windows equivalent (or retire in DECISIONS.md with reason). Needs: settings toggle if optional, tests, docs.
- [ ] **FEAT-004** (P2) — Redesigned song details, Last.fm/account settings screens — _Release audit §2.2 (ref 0.9.2)_  
  Reference Meld 0.9.2 feature not covered by Parts 1–6. Implement a real Windows equivalent (or retire in DECISIONS.md with reason). Needs: settings toggle if optional, tests, docs.
- [ ] **FEAT-005** (P2) — Mini-player background styles, playlist button — _Release audit §2.2 (ref 0.9.2)_  
  Reference Meld 0.9.2 feature not covered by Parts 1–6. Implement a real Windows equivalent (or retire in DECISIONS.md with reason). Needs: settings toggle if optional, tests, docs.
- [ ] **FEAT-006** (P2) — Synced scrolling lyrics for YouTube-sourced songs — _Release audit §2.2 (ref 0.8.1)_  
  Reference Meld 0.8.1 feature not covered by Parts 1–6. Implement a real Windows equivalent (or retire in DECISIONS.md with reason). Needs: settings toggle if optional, tests, docs.
- [ ] **FEAT-007** (P2) — High-res artwork + thumbnail fallback chain — _Release audit §2.2 (ref 0.7.2)_  
  Reference Meld 0.7.2 feature not covered by Parts 1–6. Implement a real Windows equivalent (or retire in DECISIONS.md with reason). Needs: settings toggle if optional, tests, docs.
- [ ] **FEAT-008** (P2) — SponsorBlock (opt-in, categories, toast, privacy hash prefix) — _Release audit §2.2 (ref 0.7.1)_  
  Reference Meld 0.7.1 feature not covered by Parts 1–6. Implement a real Windows equivalent (or retire in DECISIONS.md with reason). Needs: settings toggle if optional, tests, docs.
- [ ] **FEAT-009** (P2) — Add/remove tracks in Spotify playlists (incl. reverse lookup for YouTube tracks) — _Release audit §2.2 (ref 0.6.0)_  
  Reference Meld 0.6.0 feature not covered by Parts 1–6. Implement a real Windows equivalent (or retire in DECISIONS.md with reason). Needs: settings toggle if optional, tests, docs.
- [ ] **FEAT-010** (P2) — Stale auth cleared after backup restore — _Release audit §2.2 (ref 0.4.0)_  
  Reference Meld 0.4.0 feature not covered by Parts 1–6. Implement a real Windows equivalent (or retire in DECISIONS.md with reason). Needs: settings toggle if optional, tests, docs.
- [ ] **FEAT-011** (P2) — Timeout guards (REST 3 s, engine 4 s) with artist-top-tracks fallback — _Release audit §2.2 (ref 0.2.0)_  
  Reference Meld 0.2.0 feature not covered by Parts 1–6. Implement a real Windows equivalent (or retire in DECISIONS.md with reason). Needs: settings toggle if optional, tests, docs.
- [ ] **FEAT-012** (P2) — Thumbnail fallback chain Spotify→YouTube match→video — _Release audit §2.2 (ref 0.2.0)_  
  Reference Meld 0.2.0 feature not covered by Parts 1–6. Implement a real Windows equivalent (or retire in DECISIONS.md with reason). Needs: settings toggle if optional, tests, docs.
- [ ] **FEAT-013** (P2) — Google Cast (Windows: optional DLNA/Chromecast casting) — _Release audit §2.2 (ref Reference app)_  
  Reference Meld Reference app feature not covered by Parts 1–6. Implement a real Windows equivalent (or retire in DECISIONS.md with reason). Needs: settings toggle if optional, tests, docs.

## Phase 10 — Release engineering, final verification, and 1.0.0 release (18 tasks)


### M10.1 Updater, signing, installer, portable, uninstaller (11 tasks)

- **Goal:** Updater, Authenticode signing, NSIS installer + uninstaller options, portable mode + portable updater, SBOM, provenance (section 7).
- **Depends on:** M0.3, M1.4
- **Exit criteria:** Clean-VM install/upgrade/update/uninstall matrix passes.

- [ ] **S5-063** (P1) — Add `tauri-plugin-updater` with a signed manifest — _Part 5 · G. Updater and release signing_  
  Generate a minisign keypair, keep the private key in GitHub Actions secrets only, embed the public key in `tauri.conf.json`, and publish `latest.json` with each GitHub release.
- [ ] **S5-064** (P1) — Code-sign Windows binaries — _Part 5 · G. Updater and release signing_  
  Sign the app exe, NSIS installer, and uninstaller (Authenticode via Azure Trusted Signing or an OV/EV certificate) to avoid SmartScreen warnings and tampering.
- [ ] **S5-065** (P1) — Updater UX — _Part 5 · G. Updater and release signing_  
  Check on launch and on demand, show release notes, download in background, verify signature, ask before restart, and never interrupt playback.
- [ ] **S5-066** (P1) — Update channels — _Part 5 · G. Updater and release signing_  
  Stable and beta channels with separate manifests.
- [ ] **S5-067** (P1) — Rollback safety — _Part 5 · G. Updater and release signing_  
  Back up the database before any update that changes schema; refuse downgrade onto a newer schema without warning.
- [ ] **S5-068** (P1) — Portable updater — _Part 5 · G. Updater and release signing_  
  Portable builds update by downloading the signed zip, verifying it, and swapping files after exit via a small helper; never write to Program Files.
- [ ] **S5-069** (P1) — Installer and uninstaller — _Part 5 · G. Updater and release signing_  
  NSIS per-user install by default, Start-menu and optional desktop shortcuts, file/protocol associations, and an uninstaller that asks whether to keep the library, downloads, and Credential Manager entries.
- [ ] **S5-072** (P1) — Reproducible CI release pipeline — _Part 5 · G. Updater and release signing_  
  GitHub Actions on `windows-latest`: `npm ci`, typecheck, tests, `cargo test`, `cargo clippy -D warnings`, `cargo audit`, `npm audit`, `tauri build`, sign, generate SHA256SUMS, upload installer, portable zip, and `latest.json`.
- [ ] **S5-073** (P1) — Software bill of materials and license notices — _Part 5 · G. Updater and release signing_  
  Produce an SBOM (CycloneDX) and a third-party license bundle; required for GPL-3.0 distribution.
- [ ] **S5-074** (P1) — Release provenance — _Part 5 · G. Updater and release signing_  
  Use GitHub artifact attestations so users can verify builds came from CI.
- [ ] **TR-M10** (P1) — No signed updater/release trust path — _Technical review (Appendix G)_  
  Section 7.

### M10.2 Final verification (7 tasks)

- **Goal:** Final verification and 1.0.0 release (section 8).
- **Depends on:** All
- **Exit criteria:** Section 8 satisfied; release published.

- [ ] **S5-098** (P1) — Automated security test suite — _Part 5 · K. Security tests and acceptance_  
  Tests for: CSP present, asset scope narrow, no IPC in login windows, navigation blocked, path traversal rejected, oversized payloads rejected, secrets never in logs/backups/IPC errors.
- [ ] **S5-099** (P1) — Manual threat-model review — _Part 5 · K. Security tests and acceptance_  
  Document trust boundaries: webview ↔ Rust, Rust ↔ providers, login windows, filesystem, updater.
- [ ] **S5-100** (P1) — Pre-release checklist — _Part 5 · K. Security tests and acceptance_  
  Signed artifacts, updater signature verified on a clean VM, uninstall leaves no secrets unless the user chose to keep them, portable mode leaves no files outside its folder.
- [ ] **R6-085** (P1) — Performance acceptance run — _Part 6 · K. Acceptance_  
  Meet budgets in section E on a 50k-song library on Windows 10 and 11.
- [ ] **R6-086** (P1) — Reliability soak — _Part 6 · K. Acceptance_  
  24-hour playback with network drops, sleep/resume, and device changes without crashes or stuck playback.
- [ ] **R6-087** (P1) — Test gate — _Part 6 · K. Acceptance_  
  All CI checks green, coverage thresholds met, and the manual matrix signed off before release.
- [ ] **TR-L1** (P2) — README screenshots, architecture diagram, data paths, troubleshooting, known issues — _Technical review (Appendix G)_  
  docs/ + README.

---

# 6b. Overlap map (same concern raised in several parts)

When a concern appears in several IDs, implement it **once** in the milestone of the *first* listed ID (lowest phase), then tick all IDs whose Done-when criteria are satisfied by that implementation. If an ID has extra requirements, finish them before ticking.

| Concern | IDs (in execution order) |
|---|---|
| Monolith split / module boundaries | U4-001, TR-M1, S5-003, PLAY-068, R6-032 |
| CI and quality gates | R6-073, TR-H9, TR-L9, D3-017, S5-093, S5-094, S5-096, PLAY-087, S5-072 |
| Versioned migrations | D3-003, D3-004, D3-005, D3-006, D3-009, R6-010, R6-065, S5-091, D3-156, X3-016, D3-142, D3-145, X3-006 |
| Cached MIME / format metadata | R6-022, PLAY-023 |
| Double download (stream + cache) | PLAY-028, R6-024, RADIO-009 |
| Cache size limits / eviction | S5-045, D3-103, PLAY-041, R6-023 |
| List virtualization | UI-006, U4-048, U4-066, R6-034, TR-L7 |
| Backup/restore format and safety | D3-166, S5-039, D3-073, D3-085, D3-105, D3-106, D3-137, D3-151, D3-154, X3-007, X3-008, S5-047, S5-052, S5-053, U4-211, FEAT-010 |
| Secrets / credential storage | TR-C2, S5-095, D3-157, D3-158, D3-160, D3-162, D3-165, S5-030, S5-033, S5-035, X3-016, D3-070, D3-145, X3-006, U4-280 |
| Logging / diagnostics | S5-088, S5-090, TR-L4, R6-080, R6-083, PLAY-086, QUEUE-029, U4-202, U4-280 |
| SMTC / taskbar / media keys | U4-126, U4-127, S5-078, S5-079, S5-082 |
| Updater | U4-218, S5-063, S5-065, S5-068, TR-M10 |
| Stale async responses / cancellation | U4-009, S5-009, D3-037, PLAY-065, TR-M5, SEARCH-009, UI-004, U4-053, U4-159, U4-174, X4-008, U4-281, U4-307, U4-309, U4-329, U4-330, R6-040, FEAT-010 |
| Spotify GraphQL hashes | SPOT-003, SPOT-004, TEST-009, TR-H3, FEAT-008 |
| URL classification / share URLs | U4-059, TR-H8 |
| Destructive-action confirmation / undo | S5-039, D3-061, D3-072, PLAY-063, QUEUE-043, U4-056, U4-088, U4-134, U4-167, U4-168, U4-169, X4-008, X4-010, U4-289, U4-316, U4-330 |
| Error taxonomy / structured errors | S5-007, PLAY-015, SPOT-006, R6-055 |
| Offline behaviour | S5-061, D3-057, R6-017, SEARCH-011, U4-085, U4-158, U4-282, U4-288, TR-L6, U4-304, U4-307, U4-329, R6-056 |

---

# 7. Build, CI, release, installer, portable, updater, uninstaller (exact procedure)

## 7.1 Versioning

- SemVer. `0.2.0` = reconciled security release; `0.x` minor per completed phase group; **`1.0.0` = final release when section 8 is satisfied**.
- Single version source: `package.json`; `tauri.conf.json` uses `"version": "../package.json"`; `Cargo.toml` version bumped by `scripts/bump-version.mjs` (CI asserts equality).
- Tags `vX.Y.Z` only from `main`. Pre-releases `vX.Y.Z-beta.N` publish to the beta channel.

## 7.2 CI workflows

**Minimal CI (Phase 0)** `.github/workflows/ci.yml` on `pull_request` and `push: main`:

```yaml
name: ci
on: { pull_request: {}, push: { branches: [main] } }
permissions: { contents: read }
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
jobs:
  windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@<sha>        # pin by commit SHA
      - uses: actions/setup-node@<sha>
        with: { node-version: 22, cache: npm }
      - uses: dtolnay/rust-toolchain@<sha>
        with: { toolchain: stable, components: "rustfmt, clippy" }
      - uses: Swatinem/rust-cache@<sha>
        with: { workspaces: src-tauri }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint          # added in Phase 1
      - run: npm test -- --run     # added in Phase 1
      - run: npm run build
      - run: cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
      - run: cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
      - run: cargo test --manifest-path src-tauri/Cargo.toml --locked
      - run: node scripts/check-versions.mjs
      - run: node scripts/check-security-config.mjs   # CSP not null, asset scope narrow, no remote IPC
      - run: npx tauri build --no-bundle
```

**Full CI (Phase 1)** adds: `cargo audit`, `cargo deny check`, `npm audit --omit=dev`, `cargo llvm-cov` + Vitest coverage thresholds, bindings-up-to-date check (`git diff --exit-code src/ipc/bindings.ts`), bundle-size budget, Linux job (`ubuntu-latest`: `cargo check/test` for non-Windows modules), E2E job (`tauri-driver` + WebdriverIO on Windows), startup smoke (launch built exe 15 s, assert alive, no TCP listeners, clean exit).

## 7.3 Release workflow `.github/workflows/release.yml` (tag `v*`)

1. Checkout tag; verify tag == `package.json` version; verify tag commit is on `main`.
2. Full CI steps.
3. `npx tauri build` (NSIS) with env `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (Actions secrets) → produces `Meld Desktop_X.Y.Z_x64-setup.exe` and `.nsis.zip` + `.sig` for the updater.
4. Authenticode-sign `meld-desktop.exe`, the NSIS setup, and the uninstaller (Tauri `bundle.windows.signCommand` calling Azure Trusted Signing `signtool`/`trusted-signing-cli`; secrets `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, account/profile names). If no certificate is available yet, publish unsigned and state it in release notes (SmartScreen warning) — record in DECISIONS.
5. Build portable ZIP: `Meld-Desktop-X.Y.Z-x64-portable.zip` containing `Meld Desktop.exe`, `portable.marker`, `resources/` (taskbar icons embedded or alongside), `LICENSE`, `NOTICE`, `THIRD-PARTY-NOTICES.txt`, `README-portable.txt`. (Portable needs WebView2 runtime present; README says so.)
6. Portable updater package: `Meld-Desktop-X.Y.Z-x64-portable.zip.sig` (minisign) for in-app portable update.
7. Generate `SHA256SUMS.txt` for all assets; SBOM `sbom.cdx.json` (`cargo cyclonedx` + `@cyclonedx/cyclonedx-npm`); `THIRD-PARTY-NOTICES.txt` (`cargo about` + `license-checker`).
8. Generate `latest.json` (Tauri updater format):

```json
{
  "version": "X.Y.Z",
  "notes": "…from CHANGELOG…",
  "pub_date": "RFC3339",
  "platforms": {
    "windows-x86_64": { "signature": "<contents of .nsis.zip.sig>", "url": "https://github.com/Romany-Osama/Meld-Desktop/releases/download/vX.Y.Z/Meld.Desktop_X.Y.Z_x64-setup.nsis.zip" }
  },
  "portable": { "signature": "<portable .sig>", "url": "…/Meld-Desktop-X.Y.Z-x64-portable.zip" }
}
```

9. `actions/attest-build-provenance` for every asset.
10. Create GitHub Release (draft → publish) with notes from `CHANGELOG.md`; assets: setup EXE, portable ZIP, `.sig` files, `latest.json`, `SHA256SUMS.txt`, SBOM, notices. Beta tags publish `latest-beta.json`.

## 7.4 Installer (NSIS) requirements

- `bundle.windows.nsis`: `installMode: "currentUser"` (default; per-user, no admin) with option for `both`; `languages` en + others when i18n lands; `displayLanguageSelector` once >1 language; custom `installerIcon`; `startMenuFolder: "Meld Desktop"`; desktop shortcut optional checkbox.
- Registers `meld://` protocol (deep links) and optional file associations (`.m3u`, `.m3u8`, audio types → "Open with Meld Desktop", not default).
- Upgrades in place; closes running instance gracefully (single-instance message → flush state → exit) before replacing files.
- Preserves user data (data lives in `%APPDATA%\Meld Desktop`, never in install dir).
- `webviewInstallMode: embedBootstrapper, silent: true`.

## 7.5 Uninstaller requirements

- Standard NSIS uninstaller listed in "Apps & features" with publisher, version, icon, size, uninstall string.
- Uninstall dialog with checkboxes (default **unchecked**): "Delete my library, settings, and history", "Delete downloaded music and cache", "Remove saved sign-ins (Credential Manager entry `Meld Desktop/session-encryption-key`)". Implemented with an NSIS uninstall hook (`NSIS_HOOK_PREUNINSTALL`/custom page) calling `meld-desktop.exe --uninstall-cleanup=<flags>` or direct NSIS file/credential operations.
- Removes protocol registration, shortcuts, jump list, autostart entry, and tray settings.
- Silent uninstall (`/S`) keeps user data.
- Test on a clean VM: after uninstall with all boxes unchecked, data remains and reinstall restores the library; with all checked, no files/registry/credential remain.

## 7.6 Updater requirements

- `tauri-plugin-updater` with public key in `tauri.conf.json` `plugins.updater.pubkey`; endpoints `https://github.com/Romany-Osama/Meld-Desktop/releases/latest/download/latest.json` (stable) and `latest-beta.json` (beta channel setting).
- Check on startup (after first paint, at most once per 24 h) and on demand (Settings → About → Check for updates).
- UI: version, notes, size; Download (background, progress) → verify signature → "Restart to update" (never mid-playback without consent; offer "Update when I close the app").
- Before applying: back up DB to `%APPDATA%\Meld Desktop\backups\pre-update-X.Y.Z.db` (keep last 3).
- Portable mode: download portable ZIP + `.sig`, verify minisign signature, extract to `<exe dir>\.update\`, spawn a tiny helper (`meld-desktop.exe --apply-portable-update`) that waits for the main process to exit, swaps files atomically (rename old → `.old`, move new in, delete `.old` on next start), restarts.
- Downgrade protection: refuse an update whose schema is older than the current DB unless user confirms with backup.
- Failure handling: network/signature failures leave the current install untouched and show a clear error.

## 7.7 Portable mode requirements

- Detect `portable.marker` next to the exe at startup (`paths.rs`). If present: data root = `<exe dir>\data\` (DB, downloads, cache, artwork, logs, WebView2 user data folder via `data_directory`), secrets key stored **in a DPAPI-protected file inside the data dir** instead of Credential Manager (user consent shown on first run), no registry writes, no protocol registration, no autostart.
- If the folder is not writable → show error and offer "Use normal (installed) data location".
- Migrating between portable and installed: Settings → Storage → "Move data…" (copy + verify + switch).

## 7.7b Publishing with the user's token (agent procedure)

1. Ask for a fine-grained token via secure input (0.1 step 2). Export as `GH_TOKEN` for the session only.
2. `gh auth login --with-token <<< "$GH_TOKEN"` (or credential helper); never echo it.
3. Push branches and open PRs with `gh pr create`; merge only when CI is green.
4. Add repository secrets for signing/updater through `gh secret set` (values from the user via secure prompt): `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, signing-provider secrets. Generate the updater keypair with `npx tauri signer generate -w <tmp path>`; give the private key to the user to store safely; set it as a secret; delete the local copy.
5. Release: `git tag -s vX.Y.Z` (or annotated if no GPG) → `git push origin vX.Y.Z` → release workflow builds and publishes. Verify assets, checksums, signatures, and the updater by updating a previous install on a VM.

---

# 8. Definition of done for the final release (1.0.0)

The app is "perfect port" complete only when **all** are true:

1. Every task in section 9 is checked in `PROGRESS.md`, or retired with a DECISIONS entry explaining why (Android-only or legally out of scope).
2. Acceptance criteria of Part 1 §5, Part 2 §5, Part 3 §6, Part 4 §7, Part 5 §4, Part 6 §4 (appendices) all pass.
3. Every reference feature in section 2.2 is **Yes** or has a Windows equivalent, or is retired with reason.
4. CI (full) green on `main`; coverage thresholds met (Rust ≥ 70 % lines for non-UI modules; TS ≥ 70 % for stores/lib; 100 % of IPC commands have contract tests).
5. Windows 10 22H2 and Windows 11 clean-VM matrix passes: install, upgrade from 0.1.8 and 0.2.0, portable, update (installer + portable), uninstall (keep/delete data), SMTC/taskbar/tray/media keys, high contrast, 200 % scaling, keyboard-only, Narrator smoke.
6. Performance budgets met (Part 6 E) on a 50k-song library; 24-hour soak passes.
7. Security checklist passes (Part 5 K); no secrets in DB plaintext, logs, backups, crash reports, IPC errors.
8. Release assets: signed NSIS setup (with uninstaller), portable ZIP, updater `latest.json` + signatures, SHA256SUMS, SBOM, third-party notices, provenance attestations, release notes.


---

# 9. Complete task index (copy into docs/plan/PROGRESS.md)

Total tasks: **1018** (Parts 1–6: 933; technical review TR: 36; Part 3 §7 X3: 17; Part 4 §8 X4: 19; release-audit FEAT: 13).

| ID | P | Phase | Milestone | Title |
|---|---|---|---|---|
| QUEUE-001 | P0 | 0 | M0.1 | Use one canonical branch |
| TR-C1 | P0 | 0 | M0.1 | Default branch and released product have diverged |
| TR-C2 | P0 | 0 | M0.1 | v0.1.8 stores Google/Spotify credentials in plaintext SQLite |
| TR-C3 | P0 | 0 | M0.1 | v0.1.8 disables CSP and grants asset access to broad user folders |
| TR-C4 | P0 | 0 | M0.1 | v0.1.8 contains known post-release correctness/data-integrity bugs |
| TR-H1 | P0 | 0 | M0.1 | Main regresses major v0.1.8 features |
| TR-H4 | P0 | 0 | M0.1 | v0.1.8 restore can consume unbounded memory |
| TR-H5 | P0 | 0 | M0.1 | v0.1.8 networking can hang indefinitely |
| TR-H6 | P0 | 0 | M0.1 | Logout did not clear login WebView state (v0.1.8) |
| TR-M3 | P0 | 0 | M0.1 | Duplicate Audio quality control in v0.1.8 settings |
| TR-M4 | P0 | 0 | M0.1 | Main stats less accurate (playtime removed) |
| PLAY-001 | P0 | 0 | M0.2 | Reconcile the two playback branches |
| PLAY-021 | P1 | 0 | M0.2 | Main removed quality support entirely |
| PLAY-031 | P1 | 0 | M0.2 | v0.1.8 has no expiry recovery |
| PLAY-035 | P1 | 0 | M0.2 | Main's effect is keyed only by song ID |
| PLAY-055 | P1 | 0 | M0.2 | Main removed resume entirely |
| PLAY-056 | P1 | 0 | M0.2 | v0.1.8 can leak an “active download” lock on early return |
| PLAY-091 | P1 | 0 | M0.2 | No branch/version contract test |
| S5-013 | P0 | 0 | M0.3 | Keep CSP enabled (regression guard) |
| S5-037 | P0 | 0 | M0.3 | Keep asset scope narrow (regression guard) |
| S5-070 | P0 | 0 | M0.3 | Restore missing bundle settings |
| S5-071 | P0 | 0 | M0.3 | Single source of version truth |
| S5-095 | P0 | 0 | M0.3 | Secret scanning and push protection |
| S5-097 | P0 | 0 | M0.3 | Branch protection |
| R6-073 | P0 | 0 | M0.3 | Add GitHub Actions CI |
| R6-074 | P0 | 0 | M0.3 | Windows runner as the primary target |
| R6-075 | P0 | 0 | M0.3 | Required checks |
| TR-H9 | P0 | 0 | M0.3 | No automated release gate or CI |
| TR-M11 | P0 | 0 | M0.3 | Public issue tracking disabled |
| TR-M12 | P0 | 0 | M0.3 | Release binaries committed into Git history |
| TR-M13 | P0 | 0 | M0.3 | Release naming/version history inconsistent |
| TR-L2 | P0 | 0 | M0.3 | CONTRIBUTING, SECURITY, issue/PR templates, code of conduct, support policy |
| TR-L3 | P0 | 0 | M0.3 | Changelog missing on main |
| TR-L9 | P0 | 0 | M0.3 | Normalize formatting/line endings; enforce Prettier/rustfmt in CI |
| U4-001 | P0 | 1 | M1.1 | Split `App.tsx` into route-level screens |
| U4-002 | P0 | 1 | M1.1 | Extract reusable feature modules |
| U4-003 | P0 | 1 | M1.1 | Introduce a typed router |
| U4-004 | P0 | 1 | M1.1 | Make navigation history route-based |
| U4-005 | P0 | 1 | M1.1 | Give overlays explicit route/modal state |
| U4-006 | P0 | 1 | M1.1 | Persist and restore the last safe route |
| U4-007 | P0 | 1 | M1.1 | Add deep-link parsing |
| U4-008 | P0 | 1 | M1.1 | Separate server state from view state |
| U4-009 | P0 | 1 | M1.1 | Use request identities and cancellation per screen |
| U4-010 | P0 | 1 | M1.1 | Preserve screen state on back |
| U4-011 | P0 | 1 | M1.1 | Centralize capability checks |
| U4-012 | P0 | 1 | M1.1 | Centralize destructive-action policy |
| U4-013 | P0 | 1 | M1.1 | Centralize notifications |
| U4-014 | P0 | 1 | M1.1 | Add an error boundary per major route and player |
| U4-015 | P0 | 1 | M1.1 | Use stable domain IDs plus occurrence IDs |
| TR-M1 | P1 | 1 | M1.1 | Monolithic frontend and backend |
| S5-001 | P0 | 1 | M1.2 | Inventory every Tauri command with an owner, caller, and risk class |
| S5-002 | P0 | 1 | M1.2 | Remove or gate unused commands |
| S5-003 | P0 | 1 | M1.2 | Split commands into Rust modules by domain |
| S5-004 | P0 | 1 | M1.2 | Adopt Tauri v2 app-command permissions |
| S5-005 | P0 | 1 | M1.2 | Keep remote login windows IPC-less — and test it |
| S5-006 | P0 | 1 | M1.2 | Typed, validated IPC payloads |
| S5-007 | P0 | 1 | M1.2 | Structured error type instead of `Result<_, String>` |
| S5-008 | P0 | 1 | M1.2 | Cap response sizes and list lengths returned over IPC |
| S5-009 | P0 | 1 | M1.2 | Cancellation for long commands |
| S5-010 | P0 | 1 | M1.2 | Event channel contract |
| S5-011 | P0 | 1 | M1.2 | Generate TypeScript bindings from Rust |
| S5-012 | P0 | 1 | M1.2 | IPC contract tests |
| TR-M14 | P1 | 1 | M1.2 | No durable API boundary |
| D3-001 | P0 | 1 | M1.3 | Add an explicit schema version |
| D3-002 | P0 | 1 | M1.3 | Replace swallowed `ALTER TABLE` errors |
| D3-003 | P0 | 1 | M1.3 | Create one immutable migration per released schema transition |
| D3-004 | P0 | 1 | M1.3 | Never edit an old migration after release |
| D3-005 | P0 | 1 | M1.3 | Back up before migration |
| D3-006 | P0 | 1 | M1.3 | Run `PRAGMA quick_check` before migration and `integrity_check` after migration |
| D3-007 | P0 | 1 | M1.3 | Validate the final schema |
| D3-008 | P0 | 1 | M1.3 | Test every supported upgrade path |
| D3-009 | P0 | 1 | M1.3 | Test interrupted migration recovery |
| D3-010 | P0 | 1 | M1.3 | Reject unsupported future schemas |
| D3-011 | P0 | 1 | M1.3 | Add a read-only recovery mode |
| D3-012 | P0 | 1 | M1.3 | Normalize release/main divergence |
| D3-013 | P1 | 1 | M1.3 | Enable WAL deliberately |
| D3-014 | P1 | 1 | M1.3 | Do not hold one global SQLite mutex across long work |
| D3-015 | P1 | 1 | M1.3 | Add indexes from actual query plans |
| D3-016 | P1 | 1 | M1.3 | Add schema-level boolean checks |
| D3-017 | P1 | 1 | M1.3 | Add foreign-key verification to CI |
| D3-018 | P1 | 1 | M1.3 | Create a repository/data-access layer |
| R6-001 | P1 | 1 | M1.3 | Replace the single global `Mutex<Connection>` |
| R6-002 | P1 | 1 | M1.3 | Use a dedicated DB actor or `r2d2`/`deadpool` pool |
| R6-003 | P1 | 1 | M1.3 | Enable WAL, `busy_timeout`, and `synchronous=NORMAL` |
| R6-004 | P1 | 1 | M1.3 | Never hold a std `Mutex` across `.await` or in async commands |
| R6-005 | P1 | 1 | M1.3 | Batch writes in transactions |
| R6-006 | P1 | 1 | M1.3 | Add missing indexes |
| R6-007 | P1 | 1 | M1.3 | Use `EXPLAIN QUERY PLAN` tests for hot queries |
| R6-008 | P1 | 1 | M1.3 | Paginate library queries |
| R6-009 | P1 | 1 | M1.3 | Run `PRAGMA optimize` and periodic `ANALYZE` |
| R6-010 | P1 | 1 | M1.3 | Version migrations properly |
| R6-011 | P1 | 1 | M1.3 | Measure startup DB cost |
| S5-092 | P1 | 1 | M1.4 | Automated dependency updates |
| S5-093 | P1 | 1 | M1.4 | Audit gates in CI |
| S5-094 | P1 | 1 | M1.4 | Pin GitHub Actions by commit SHA |
| S5-096 | P1 | 1 | M1.4 | Least-privilege CI tokens |
| R6-061 | P1 | 1 | M1.4 | Frontend unit/integration tests |
| R6-062 | P1 | 1 | M1.4 | Backend unit tests by module |
| R6-063 | P1 | 1 | M1.4 | Parser fixture corpus |
| R6-064 | P1 | 1 | M1.4 | Contract tests for providers (scheduled) |
| R6-065 | P1 | 1 | M1.4 | Migration tests from every released schema |
| R6-066 | P1 | 1 | M1.4 | Async/command tests with a mocked HTTP layer |
| R6-067 | P1 | 1 | M1.4 | End-to-end tests |
| R6-068 | P1 | 1 | M1.4 | Accessibility automation |
| R6-069 | P1 | 1 | M1.4 | Performance regression tests |
| R6-070 | P1 | 1 | M1.4 | Property/fuzz tests |
| R6-071 | P1 | 1 | M1.4 | Coverage reporting |
| R6-072 | P1 | 1 | M1.4 | Flaky test policy |
| R6-076 | P1 | 1 | M1.4 | Caching |
| R6-077 | P1 | 1 | M1.4 | PR artifacts |
| R6-078 | P1 | 1 | M1.4 | Release workflow separated |
| R6-079 | P1 | 1 | M1.4 | Linting for Rust and TS |
| TR-M2 | P1 | 1 | M1.4 | No frontend test suite |
| S5-085 | P1 | 1 | M1.5 | Remove panics from production paths |
| S5-086 | P1 | 1 | M1.5 | Mutex poisoning recovery |
| S5-087 | P1 | 1 | M1.5 | Move blocking work off async threads |
| S5-088 | P1 | 1 | M1.5 | Structured, redacted logging |
| S5-089 | P1 | 1 | M1.5 | Crash reporting (opt-in, local first) |
| S5-090 | P1 | 1 | M1.5 | Diagnostics export |
| S5-091 | P1 | 1 | M1.5 | Schema migrations with versions |
| TR-L4 | P1 | 1 | M1.5 | Structured logging with redaction + diagnostic bundle |
| R6-080 | P2 | 1 | M1.5 | Structured logging with levels and spans |
| R6-081 | P2 | 1 | M1.5 | Local performance metrics |
| R6-082 | P2 | 1 | M1.5 | Opt-in anonymous telemetry only |
| R6-083 | P2 | 1 | M1.5 | Diagnostics bundle |
| R6-084 | P2 | 1 | M1.5 | Health checks screen |
| S5-014 | P0 | 2 | M2.1 | Narrow `img-src https:` |
| S5-015 | P0 | 2 | M2.1 | Review `media-src https://*.googlevideo.com` |
| S5-016 | P0 | 2 | M2.1 | Use Tauri's `devCsp` for development |
| S5-017 | P0 | 2 | M2.1 | Enable `freezePrototype` |
| S5-018 | P0 | 2 | M2.1 | Disable devtools in release builds |
| S5-019 | P0 | 2 | M2.1 | Block in-webview navigation of the main window |
| S5-020 | P0 | 2 | M2.1 | Open external links through a dedicated, allowlisted command |
| S5-021 | P0 | 2 | M2.1 | No `dangerouslySetInnerHTML` and no HTML from providers |
| S5-022 | P0 | 2 | M2.1 | Disable context-menu/devtools shortcuts in release |
| S5-023 | P0 | 2 | M2.1 | Disable WebView2 autofill/password save for the main window |
| S5-024 | P0 | 2 | M2.1 | Pin a WebView2 minimum version and handle missing runtime |
| D3-156 | P0 | 2 | M2.2 | Keep the AES-GCM/keyring design, but make migration failure visible |
| D3-157 | P0 | 2 | M2.2 | Do not silently continue with legacy plaintext forever |
| D3-158 | P0 | 2 | M2.2 | Delete the credential-store key on full account-data reset only after encrypted secrets are removed |
| D3-159 | P0 | 2 | M2.2 | Add key-loss recovery UX |
| D3-160 | P0 | 2 | M2.2 | Zeroize plaintext buffers where practical |
| D3-161 | P0 | 2 | M2.2 | Add log redaction tests |
| D3-162 | P0 | 2 | M2.2 | Store token metadata separately from secrets |
| D3-163 | P0 | 2 | M2.2 | Validate sessions against providers before saying “connected.” |
| D3-164 | P0 | 2 | M2.2 | Rotate encryption format cleanly |
| D3-165 | P0 | 2 | M2.2 | Scope secrets by Windows user and app identifier |
| D3-166 | P0 | 2 | M2.2 | Add a security-sensitive backup invariant test |
| S5-025 | P0 | 2 | M2.2 | Isolate login webviews from the main webview profile |
| S5-026 | P0 | 2 | M2.2 | Per-provider logout |
| S5-027 | P0 | 2 | M2.2 | Restrict login-window navigation |
| S5-028 | P0 | 2 | M2.2 | Limit the captured Google cookie set |
| S5-029 | P0 | 2 | M2.2 | Never log or emit cookies/tokens |
| S5-030 | P0 | 2 | M2.2 | Remove plaintext fallback when Credential Manager is unavailable |
| S5-031 | P0 | 2 | M2.2 | Make Spotify reconnect durable |
| S5-032 | P0 | 2 | M2.2 | Encrypt all session-adjacent values |
| S5-033 | P0 | 2 | M2.2 | Zeroize secrets in memory |
| S5-034 | P0 | 2 | M2.2 | Detect expired/revoked sessions and recover |
| S5-035 | P0 | 2 | M2.2 | Session status must not expose secrets |
| S5-036 | P0 | 2 | M2.2 | Avoid third-party gists in the Spotify token chain |
| X3-016 | P0 | 2 | M2.2 | Secret migration failure is silently ignored, potentially leaving plaintext credentials |
| S5-038 | P0 | 2 | M2.3 | Validate re-granted local file paths at startup |
| S5-039 | P0 | 2 | M2.3 | Strip `local_path` from restored backups or re-confirm it |
| S5-040 | P0 | 2 | M2.3 | Use `app.path()` instead of raw `%APPDATA%` |
| S5-041 | P0 | 2 | M2.3 | Portable mode data location |
| S5-042 | P0 | 2 | M2.3 | Atomic writes everywhere |
| S5-043 | P0 | 2 | M2.3 | Canonicalize before delete |
| S5-044 | P0 | 2 | M2.3 | Sanitize IDs used in file names |
| S5-045 | P0 | 2 | M2.3 | Disk-space checks and quotas |
| S5-046 | P0 | 2 | M2.3 | Correct ACLs on the data folder |
| S5-055 | P1 | 2 | M2.4 | Central HTTP policy |
| S5-056 | P1 | 2 | M2.4 | Never send cookies cross-host |
| S5-057 | P1 | 2 | M2.4 | Retry/backoff policy |
| S5-058 | P1 | 2 | M2.4 | Rate limiting per provider |
| S5-059 | P1 | 2 | M2.4 | Response-size limits on JSON |
| S5-060 | P1 | 2 | M2.4 | Proxy support with authentication |
| S5-061 | P1 | 2 | M2.4 | Respect system proxy and offline state |
| S5-062 | P1 | 2 | M2.4 | Provider privacy disclosure |
| D3-019 | P0 | 3 | M3.1 | Separate local likes, YouTube likes, and Spotify likes |
| D3-020 | P0 | 3 | M3.1 | Separate imported-local membership from YouTube library membership |
| D3-021 | P0 | 3 | M3.1 | Attach every remote state to an account |
| D3-022 | P0 | 3 | M3.1 | Preserve disconnected-account data |
| D3-023 | P0 | 3 | M3.1 | Model local UI aggregate state as a query/view |
| D3-024 | P0 | 3 | M3.1 | Store remote mutation state |
| D3-025 | P0 | 3 | M3.1 | Add tombstones |
| D3-026 | P0 | 3 | M3.1 | Record metadata ownership per field or source |
| D3-027 | P0 | 3 | M3.1 | Add alias/mapping history |
| D3-028 | P0 | 3 | M3.1 | Do not infer song identity from display metadata |
| D3-029 | P0 | 3 | M3.2 | Stage remote snapshots in temporary tables |
| D3-030 | P0 | 3 | M3.2 | Require an explicit completion proof |
| D3-031 | P0 | 3 | M3.2 | Use sync generations |
| D3-032 | P0 | 3 | M3.2 | Add plausibility guards beyond “not empty.” |
| D3-033 | P0 | 3 | M3.2 | Distinguish an authoritative empty account from a failed empty parser |
| D3-034 | P0 | 3 | M3.2 | Make sync idempotent |
| D3-035 | P0 | 3 | M3.2 | Do not call remote mutation APIs while applying a remote snapshot |
| D3-036 | P0 | 3 | M3.2 | Serialize sync per provider/account/collection |
| D3-037 | P0 | 3 | M3.2 | Support cancellation without partial commit |
| D3-038 | P0 | 3 | M3.2 | Persist sync status |
| D3-039 | P0 | 3 | M3.2 | Add bounded retry/backoff with Retry-After support |
| D3-040 | P0 | 3 | M3.2 | Detect account changes before apply |
| D3-041 | P0 | 3 | M3.2 | Preserve local-only likes and imported files |
| D3-042 | P0 | 3 | M3.2 | Keep downloaded tracks even when remote membership disappears |
| D3-043 | P0 | 3 | M3.2 | Keep playlist contents atomic |
| D3-044 | P0 | 3 | M3.2 | Preserve occurrence identity |
| D3-045 | P0 | 3 | M3.2 | Add conflict policy |
| D3-046 | P0 | 3 | M3.2 | Add dry-run/diff support |
| D3-047 | P0 | 3 | M3.2 | Add per-source capability policy |
| D3-048 | P0 | 3 | M3.2 | Never represent an incomplete capped Spotify fetch as complete |
| D3-049 | P0 | 3 | M3.2 | Zero-item valid collection |
| D3-050 | P0 | 3 | M3.2 | Parser returns zero from a non-empty malformed response |
| D3-051 | P0 | 3 | M3.2 | First page succeeds, continuation fails |
| D3-052 | P0 | 3 | M3.2 | Repeated continuation token |
| D3-053 | P0 | 3 | M3.2 | Remote count suddenly drops 95% |
| D3-054 | P0 | 3 | M3.2 | Local file plus YouTube library sync |
| D3-055 | P0 | 3 | M3.2 | Two Google accounts with overlapping IDs |
| D3-056 | P0 | 3 | M3.2 | Local, YouTube, and Spotify like on the same track |
| D3-057 | P0 | 3 | M3.2 | Offline local mutation then remote snapshot |
| D3-058 | P0 | 3 | M3.2 | Downloaded remote track removed from service |
| D3-059 | P0 | 3 | M3.2 | Duplicate playlist occurrences |
| X3-001 | P0 | 3 | M3.2 | YouTube library sync resets imported local-file membership |
| X3-002 | P0 | 3 | M3.2 | The empty-response safeguard still accepts destructive partial snapshots |
| X3-003 | P0 | 3 | M3.2 | Multi-account ownership is absent across songs, likes, playlists, and sync state |
| X3-017 | P0 | 3 | M3.2 | The reference’s own sync code must not be copied blindly because it conflates reconciliation setters with remote-mutating toggle methods |
| TR-L8 | P1 | 3 | M3.2 | Optimistic-action reconciliation with visible retry state |
| D3-060 | P1 | 3 | M3.3 | Make “Meld Like” and “YouTube Like” visibly distinct or configurable |
| D3-061 | P1 | 3 | M3.3 | Persist the local state only after a confirmed remote mutation—or use an explicit pending state |
| D3-062 | P1 | 3 | M3.3 | Add compensation/retry records |
| D3-063 | P1 | 3 | M3.3 | Update local library membership after `ytm_toggle_library` |
| D3-064 | P1 | 3 | M3.3 | Give albums provider-specific membership |
| D3-065 | P1 | 3 | M3.3 | Add full artist follow/subscription parity |
| D3-066 | P1 | 3 | M3.3 | Separate podcast subscription from saved episodes |
| D3-067 | P1 | 3 | M3.3 | Preserve per-episode playback position |
| D3-068 | P1 | 3 | M3.3 | Define logout choices precisely |
| D3-069 | P1 | 3 | M3.3 | Keep downloads on logout by default |
| D3-070 | P1 | 3 | M3.3 | Clear credential-manager material on explicit full sign-out |
| D3-071 | P1 | 3 | M3.3 | Clear or partition WebView login state per provider |
| D3-072 | P1 | 3 | M3.3 | Add account-switch confirmation when destructive sync is pending |
| D3-073 | P1 | 3 | M3.3 | Add a “rebuild from providers” function only after export/backup |
| X3-013 | P0 | 3 | M3.4 | Local playlist design forbids duplicate occurrences and removes by song ID rather than occurrence |
| D3-074 | P1 | 3 | M3.4 | Give every playlist entry a unique occurrence ID |
| D3-075 | P1 | 3 | M3.4 | Allow duplicate tracks |
| D3-076 | P1 | 3 | M3.4 | Remove by occurrence, not song ID |
| D3-077 | P1 | 3 | M3.4 | Preserve provider occurrence IDs |
| D3-078 | P1 | 3 | M3.4 | Use stable fractional/order keys or transactional reindexing |
| D3-079 | P1 | 3 | M3.4 | Add playlist revision/conflict detection |
| D3-080 | P1 | 3 | M3.4 | Do not delete/recreate remote playlist metadata unnecessarily |
| D3-081 | P1 | 3 | M3.4 | Add explicit playlist delete and rename for local playlists |
| D3-082 | P1 | 3 | M3.4 | Add local playlist reorder with keyboard and pointer support |
| D3-083 | P1 | 3 | M3.4 | Implement CSV export/import |
| D3-084 | P1 | 3 | M3.4 | Implement M3U/M3U8 export/import |
| D3-085 | P1 | 3 | M3.4 | Add JSON backup/export for lossless Desktop data |
| D3-086 | P1 | 3 | M3.4 | Report partial imports |
| D3-087 | P1 | 3 | M3.4 | Add source-to-local copy semantics |
| D3-088 | P1 | 3 | M3.4 | Add auto-sync retention policy |
| X3-010 | P0 | 3 | M3.5 | Download removal trusts the path stored in SQLite without canonical ownership validation |
| X3-011 | P0 | 3 | M3.5 | Missing completed downloads remain falsely completed in the DB |
| D3-089 | P1 | 3 | M3.5 | Add a startup storage reconciler |
| D3-090 | P1 | 3 | M3.5 | Convert missing completed files into an explicit `missing` state |
| D3-091 | P1 | 3 | M3.5 | Quarantine or delete orphan files |
| D3-092 | P1 | 3 | M3.5 | Verify file size before `completed` |
| D3-093 | P1 | 3 | M3.5 | Verify media structure |
| D3-094 | P1 | 3 | M3.5 | Store content identity |
| D3-095 | P1 | 3 | M3.5 | Use safe finalization |
| D3-096 | P1 | 3 | M3.5 | Keep retryable partials |
| D3-097 | P1 | 3 | M3.5 | Do not concatenate different representations |
| D3-098 | P1 | 3 | M3.5 | Add disk-space preflight and reserve |
| D3-099 | P1 | 3 | M3.5 | Add download queue persistence |
| D3-100 | P1 | 3 | M3.5 | Add bounded concurrency |
| D3-101 | P1 | 3 | M3.5 | Add retry/backoff categories |
| D3-102 | P1 | 3 | M3.5 | Add per-download pause/resume and retry |
| D3-103 | P1 | 3 | M3.5 | Add global storage quota and cache LRU |
| D3-104 | P1 | 3 | M3.5 | Make cache keys quality/format-aware |
| D3-105 | P1 | 3 | M3.5 | Store downloads outside backup by policy, but reconcile on restore |
| D3-106 | P1 | 3 | M3.5 | Offer optional media backup separately |
| D3-107 | P1 | 3 | M3.5 | Validate stored paths |
| D3-108 | P1 | 3 | M3.5 | Never delete an arbitrary database-provided path without ownership validation |
| D3-109 | P1 | 3 | M3.5 | Unify file and row transactions with an operation journal |
| D3-110 | P1 | 3 | M3.5 | Add “verify downloads” and “repair library” actions |
| X3-012 | P0 | 3 | M3.6 | Local imports have no rescan/moved/deleted reconciliation and persist only the first artist relation |
| D3-111 | P1 | 3 | M3.6 | Add folders and rescanning, not only one-time file picking |
| D3-112 | P1 | 3 | M3.6 | Persist authorized roots/handles safely |
| D3-113 | P1 | 3 | M3.6 | Reconcile moved, renamed, modified, and deleted files |
| D3-114 | P1 | 3 | M3.6 | Use stable file identity |
| D3-115 | P1 | 3 | M3.6 | Detect duplicate files and duplicate audio content |
| D3-116 | P1 | 3 | M3.6 | Preserve all artists and album metadata |
| D3-117 | P1 | 3 | M3.6 | Handle embedded artwork lifecycle |
| D3-118 | P1 | 3 | M3.6 | Separate original metadata from user edits |
| D3-119 | P1 | 3 | M3.6 | Add unavailable-file state |
| D3-120 | P1 | 3 | M3.6 | Add “locate replacement” and bulk relink |
| D3-121 | P1 | 3 | M3.6 | Validate decodability during scan |
| D3-122 | P1 | 3 | M3.6 | Avoid holding the DB mutex while parsing every selected file |
| D3-123 | P1 | 3 | M3.6 | Add folder privacy controls |
| D3-124 | P1 | 3 | M3.6 | Add local-file removal choices |
| X3-014 | P0 | 3 | M3.7 | Main regressed measured play time and now overestimates listening statistics |
| X3-015 | P0 | 3 | M3.7 | “Clear local library but keep downloads” also removes imported local-file records and many unrelated local-only structures |
| D3-125 | P1 | 3 | M3.7 | Restore measured play time |
| D3-126 | P1 | 3 | M3.7 | Define when a play counts |
| D3-127 | P1 | 3 | M3.7 | Handle seeks, repeats, resume, and crashes |
| D3-128 | P1 | 3 | M3.7 | Preserve source and account context |
| D3-129 | P1 | 3 | M3.7 | Add a foreign key or deliberate tombstone snapshot to history |
| D3-130 | P1 | 3 | M3.7 | Do not estimate minutes as full duration × starts |
| D3-131 | P1 | 3 | M3.7 | Add retention controls |
| D3-132 | P1 | 3 | M3.7 | Make “clear history” transactional |
| D3-133 | P1 | 3 | M3.7 | Add scoped clear actions |
| D3-134 | P1 | 3 | M3.7 | Add export before delete |
| D3-135 | P1 | 3 | M3.7 | Add privacy documentation |
| D3-136 | P0 | 3 | M3.8 | Add a manifest |
| D3-137 | P0 | 3 | M3.8 | Stream backup entries |
| D3-138 | P0 | 3 | M3.8 | Use separate small caps |
| D3-139 | P0 | 3 | M3.8 | Reject duplicate critical entries |
| D3-140 | P0 | 3 | M3.8 | Validate checksums before opening |
| D3-141 | P0 | 3 | M3.8 | Validate `application_id` and schema version |
| D3-142 | P0 | 3 | M3.8 | Run migrations on the staged database |
| D3-143 | P0 | 3 | M3.8 | Run foreign-key and semantic checks on staged data |
| D3-144 | P0 | 3 | M3.8 | Preserve the old database until the restored app has reopened successfully |
| D3-145 | P0 | 3 | M3.8 | Reapply runtime pragmas and secret migration to the restored connection |
| D3-146 | P0 | 3 | M3.8 | Reconcile omitted media after restore |
| D3-147 | P0 | 3 | M3.8 | Add a restore preview |
| D3-148 | P0 | 3 | M3.8 | Add restore modes |
| D3-149 | P0 | 3 | M3.8 | Prevent same-path and temporary-file collisions |
| D3-150 | P0 | 3 | M3.8 | Clean failed output archives |
| D3-151 | P0 | 3 | M3.8 | Flush the backup archive before reporting success |
| D3-152 | P0 | 3 | M3.8 | Keep a recovery journal |
| D3-153 | P0 | 3 | M3.8 | Add downgrade-safe export |
| D3-154 | P0 | 3 | M3.8 | Add scheduled optional backups |
| D3-155 | P0 | 3 | M3.8 | Test malicious archives |
| X3-004 | P0 | 3 | M3.8 | Restore checks only four table names and integrity, not schema compatibility |
| X3-005 | P0 | 3 | M3.8 | Restored databases are not migrated before promotion |
| X3-006 | P0 | 3 | M3.8 | Restored connections do not reapply initialization, runtime pragmas, or secret migration immediately |
| X3-007 | P0 | 3 | M3.8 | Backups and restores buffer the entire database in memory |
| X3-008 | P0 | 3 | M3.8 | Backups have no manifest, checksum, format version, duplicate-entry rule, or compression-ratio limit |
| X3-009 | P0 | 3 | M3.8 | Omitted media and restored download rows are not reconciled |
| S5-047 | P1 | 3 | M3.8 | Version the backup format |
| S5-048 | P1 | 3 | M3.8 | Stream instead of loading entire databases into memory |
| S5-049 | P1 | 3 | M3.8 | Treat oversized entries as an error |
| S5-050 | P1 | 3 | M3.8 | Validate full schema compatibility |
| S5-051 | P1 | 3 | M3.8 | Keep a pre-restore safety copy |
| S5-052 | P1 | 3 | M3.8 | Use SQLite's online backup API for creation |
| S5-053 | P1 | 3 | M3.8 | Optional encrypted backups |
| S5-054 | P1 | 3 | M3.8 | Reference-compatible import |
| PLAY-027 | P0 | 4 | M4.1 | Raw remote URL is handed to HTML audio |
| PLAY-029 | P1 | 4 | M4.1 | No bounded/chunked range strategy |
| PLAY-034 | P1 | 4 | M4.1 | Queue is committed before preparation succeeds |
| PLAY-036 | P1 | 4 | M4.1 | v0.1.8 quality changes do not reload current playback |
| PLAY-037 | P1 | 4 | M4.1 | Browser errors lack HTTP status/client information |
| PLAY-063 | P1 | 4 | M4.1 | History begins before confirmed audible playback |
| PLAY-064 | P1 | 4 | M4.1 | No single playback state machine |
| PLAY-065 | P1 | 4 | M4.1 | Main and v0.1.8 use different stale-request mechanisms |
| PLAY-066 | P1 | 4 | M4.1 | Auto-skip may skip recoverable errors |
| PLAY-067 | P1 | 4 | M4.1 | Playback loading/buffering is not modeled clearly |
| PLAY-068 | P1 | 4 | M4.1 | `timeupdate` rerenders the monolithic app |
| PLAY-069 | P1 | 4 | M4.1 | Persisted playback format is unversioned localStorage |
| PLAY-070 | P1 | 4 | M4.1 | Playback persistence and stream persistence are mixed conceptually |
| PLAY-071 | P1 | 4 | M4.1 | No robust same-song replay contract |
| PLAY-038 | P2 | 4 | M4.1 | No seekability model |
| PLAY-039 | P2 | 4 | M4.1 | No gapless pipeline |
| PLAY-040 | P2 | 4 | M4.1 | No Windows audio-device lifecycle |
| PLAY-072 | P2 | 4 | M4.1 | Position/duration source can be inaccurate |
| PLAY-073 | P2 | 4 | M4.1 | No buffered-range UI |
| PLAY-074 | P2 | 4 | M4.1 | Playback errors are not copyable/redacted reports |
| PLAY-075 | P2 | 4 | M4.1 | Queue continuation and stream preparation are coupled in UI |
| PLAY-076 | P2 | 4 | M4.1 | No preload contract |
| PLAY-002 | P1 | 4 | M4.2 | Direct-URL-only extraction |
| PLAY-003 | P1 | 4 | M4.2 | No dynamic player configuration |
| PLAY-004 | P1 | 4 | M4.2 | Hardcoded client versions age silently |
| PLAY-005 | P1 | 4 | M4.2 | No failed-client memory |
| PLAY-006 | P1 | 4 | M4.2 | Only the last resolver failure is returned |
| PLAY-007 | P1 | 4 | M4.2 | Missing content hints |
| PLAY-008 | P1 | 4 | M4.2 | Main dropped playlist context |
| PLAY-009 | P1 | 4 | M4.2 | No client playback nonce |
| PLAY-010 | P1 | 4 | M4.2 | No PoToken capability |
| PLAY-011 | P1 | 4 | M4.2 | Client-specific stream headers are discarded |
| PLAY-012 | P1 | 4 | M4.2 | Browser request identity differs from resolver client |
| PLAY-013 | P1 | 4 | M4.2 | No stream-host allowlist |
| PLAY-014 | P1 | 4 | M4.2 | Region and language are hardcoded to US/en |
| PLAY-030 | P1 | 4 | M4.2 | Immediate 403/410 does not trigger client fallback |
| PLAY-032 | P1 | 4 | M4.2 | No expiry safety margin |
| PLAY-033 | P1 | 4 | M4.2 | No retry limit/state visible to UI |
| R6-012 | P1 | 4 | M4.2 | Bound continuation loops |
| R6-013 | P1 | 4 | M4.2 | Parallelize independent requests with limits |
| R6-014 | P1 | 4 | M4.2 | Request deduplication |
| R6-015 | P1 | 4 | M4.2 | Response caching with TTL |
| R6-016 | P1 | 4 | M4.2 | Consistent retry/backoff |
| R6-017 | P1 | 4 | M4.2 | Distinguish timeout, offline, auth, rate-limit, and parse failures |
| R6-018 | P1 | 4 | M4.2 | Parser resilience telemetry (local) |
| R6-019 | P1 | 4 | M4.2 | HTTP/2 and connection reuse verification |
| R6-020 | P1 | 4 | M4.2 | Prefetch next track stream URL |
| R6-021 | P1 | 4 | M4.2 | Expired stream URL handling everywhere |
| TR-H2 | P1 | 4 | M4.2 | Playback fundamentally behind upstream Meld 0.9.2 |
| PLAY-015 | P2 | 4 | M4.2 | Playability errors lack taxonomy |
| PLAY-016 | P2 | 4 | M4.2 | No resolver prewarm |
| PLAY-017 | P2 | 4 | M4.2 | No resolver metrics |
| PLAY-041 | P0 | 4 | M4.3 | No cache quota or eviction |
| PLAY-042 | P0 | 4 | M4.3 | Unlimited concurrent player-cache jobs |
| PLAY-028 | P1 | 4 | M4.3 | Playback and cache download the same song twice |
| PLAY-043 | P1 | 4 | M4.3 | Player-cache jobs survive skip/close |
| PLAY-044 | P1 | 4 | M4.3 | No final byte-count validation |
| PLAY-045 | P1 | 4 | M4.3 | No content-type/container validation |
| PLAY-046 | P1 | 4 | M4.3 | Redirect targets are not revalidated |
| PLAY-047 | P1 | 4 | M4.3 | No pre-download disk-space check |
| PLAY-048 | P1 | 4 | M4.3 | Generic `.audio` extension and lost format identity |
| PLAY-049 | P1 | 4 | M4.3 | Quality cache schema cannot hold multiple qualities |
| PLAY-050 | P1 | 4 | M4.3 | Windows replacement rename can fail |
| PLAY-051 | P1 | 4 | M4.3 | Flush is not durability |
| PLAY-052 | P1 | 4 | M4.3 | v0.1.8 resume does not validate `Content-Range` |
| PLAY-053 | P1 | 4 | M4.3 | Resume can combine bytes from different stream formats |
| PLAY-054 | P1 | 4 | M4.3 | v0.1.8 resume wastes a request |
| PLAY-057 | P1 | 4 | M4.3 | SQLite background writers lack a concurrency policy |
| PLAY-058 | P1 | 4 | M4.3 | Player-cache errors are silent |
| R6-022 | P1 | 4 | M4.3 | Correct the cached MIME type |
| R6-023 | P1 | 4 | M4.3 | Cap player cache size |
| R6-024 | P1 | 4 | M4.3 | Avoid double downloads |
| R6-025 | P1 | 4 | M4.3 | Validate cache completeness |
| R6-026 | P1 | 4 | M4.3 | Clean orphaned `.part` files at startup |
| R6-027 | P1 | 4 | M4.3 | Download queue with concurrency limits |
| R6-028 | P1 | 4 | M4.3 | Gapless and crossfade timing tests |
| R6-029 | P1 | 4 | M4.3 | Audio device change recovery |
| R6-030 | P1 | 4 | M4.3 | Playback watchdog |
| R6-031 | P1 | 4 | M4.3 | Error-skip guard |
| TR-M7 | P1 | 4 | M4.3 | Downloads not at upstream reliability |
| PLAY-059 | P2 | 4 | M4.3 | No integrity fingerprint |
| PLAY-060 | P2 | 4 | M4.3 | No startup file/DB reconciliation |
| PLAY-061 | P2 | 4 | M4.3 | No separate playback/download quality policy |
| PLAY-062 | P2 | 4 | M4.3 | Lyrics/artwork work delays download completion |
| PLAY-018 | P1 | 4 | M4.4 | Quality selection is bitrate-only |
| PLAY-019 | P1 | 4 | M4.4 | No decoder capability check |
| PLAY-020 | P1 | 4 | M4.4 | Auto quality is not automatic |
| PLAY-022 | P1 | 4 | M4.4 | No persisted format metadata |
| PLAY-023 | P1 | 4 | M4.4 | Cached media is reported as `audio/mpeg` |
| TR-M5 | P1 | 4 | M4.4 | Lyrics behaviour stale vs upstream |
| PLAY-024 | P2 | 4 | M4.4 | Weak original-language/audio-track selection |
| PLAY-025 | P2 | 4 | M4.4 | No loudness metadata or normalization |
| PLAY-026 | P2 | 4 | M4.4 | No content-length-aware seeking policy |
| PLAY-077 | P2 | 4 | M4.4 | Playback speed support is branch-only and HTML-based |
| PLAY-078 | P2 | 4 | M4.4 | No per-podcast resume model |
| PLAY-079 | P2 | 4 | M4.4 | Windows media integration is incomplete/regressed |
| PLAY-080 | P2 | 4 | M4.4 | No audio focus/communications policy |
| PLAY-081 | P2 | 4 | M4.4 | No real crossfade |
| PLAY-082 | P2 | 4 | M4.4 | No silence skipping |
| PLAY-083 | P2 | 4 | M4.4 | No equalizer graph |
| PLAY-084 | P2 | 4 | M4.4 | No normalization processor |
| PLAY-085 | P2 | 4 | M4.4 | No gapless/crossfade compatibility matrix |
| PLAY-086 | P3 | 4 | M4.4 | No output/codec diagnostics |
| PLAY-087 | P0 | 4 | M4.5 | No end-to-end playback CI |
| PLAY-088 | P1 | 4 | M4.5 | Resolver tests cover too little |
| PLAY-089 | P1 | 4 | M4.5 | No fault-injection tests |
| PLAY-090 | P1 | 4 | M4.5 | No real Windows replacement/locking tests |
| PLAY-092 | P1 | 4 | M4.5 | No playback security tests |
| PLAY-093 | P2 | 4 | M4.5 | No long-session soak test |
| PLAY-094 | P2 | 4 | M4.5 | No performance budgets |
| QUEUE-002 | P1 | 5 | M5.1 | Introduce a typed source identity |
| QUEUE-003 | P1 | 5 | M5.1 | Give every queue entry a unique instance ID |
| QUEUE-004 | P1 | 5 | M5.1 | Preserve source context explicitly |
| QUEUE-005 | P1 | 5 | M5.1 | Separate track metadata from source metadata |
| QUEUE-006 | P1 | 5 | M5.1 | Version queue persistence |
| QUEUE-007 | P1 | 5 | M5.1 | Make queue state atomic |
| QUEUE-008 | P2 | 5 | M5.1 | Retain source titles and provenance |
| MATCH-001 | P0 | 5 | M5.2 | Remove the first-search-result matcher |
| MATCH-002 | P0 | 5 | M5.2 | One resolver for all call sites |
| MATCH-003 | P1 | 5 | M5.2 | Persist Spotify ID on queue items |
| MATCH-004 | P1 | 5 | M5.2 | Check memory cache first |
| MATCH-005 | P1 | 5 | M5.2 | Check DB cache before search |
| MATCH-006 | P1 | 5 | M5.2 | Version automatic matches |
| MATCH-007 | P1 | 5 | M5.2 | Preserve manual overrides forever unless user resets them |
| MATCH-008 | P1 | 5 | M5.2 | Use multiple YouTube candidates |
| MATCH-009 | P1 | 5 | M5.2 | Normalize Unicode safely |
| MATCH-010 | P1 | 5 | M5.2 | Parse version markers instead of deleting them blindly |
| MATCH-011 | P1 | 5 | M5.2 | Improve title score |
| MATCH-012 | P1 | 5 | M5.2 | Improve artist score |
| MATCH-013 | P1 | 5 | M5.2 | Add album score |
| MATCH-014 | P1 | 5 | M5.2 | Strengthen duration scoring |
| MATCH-015 | P1 | 5 | M5.2 | Use explicit-state compatibility |
| MATCH-016 | P1 | 5 | M5.2 | Penalize videos, covers, karaoke, and unofficial uploads |
| MATCH-017 | P1 | 5 | M5.2 | Add ISRC where available |
| MATCH-018 | P1 | 5 | M5.2 | Use a confidence band, not one permissive threshold |
| MATCH-019 | P1 | 5 | M5.2 | Store candidate explanations |
| MATCH-020 | P1 | 5 | M5.2 | Manual override preview must verify canonical YouTube metadata |
| MATCH-021 | P1 | 5 | M5.2 | Add “reset automatic match” and “mark no match” |
| MATCH-022 | P1 | 5 | M5.2 | Match cache invalidation on metadata change |
| MATCH-023 | P2 | 5 | M5.2 | Add negative cache with TTL |
| MATCH-024 | P2 | 5 | M5.2 | Batch resolver with bounded concurrency |
| MATCH-025 | P2 | 5 | M5.2 | Matcher corpus and regression metrics |
| MATCH-026 | P2 | 5 | M5.2 | Improve reverse YouTube→Spotify matching |
| MATCH-027 | P2 | 5 | M5.2 | Do not count matching searches in user history |
| MATCH-028 | P2 | 5 | M5.2 | Separate transient API failure from no match |
| QUEUE-009 | P0 | 5 | M5.3 | Spotify playlist play does not preserve the playlist |
| QUEUE-010 | P0 | 5 | M5.3 | Spotify Liked Songs play does not preserve Liked Songs |
| QUEUE-021 | P0 | 5 | M5.3 | Main lost continuation type |
| QUEUE-011 | P1 | 5 | M5.3 | Fast-start window |
| QUEUE-012 | P1 | 5 | M5.3 | Progressive batch resolution |
| QUEUE-013 | P1 | 5 | M5.3 | Preserve API raw offsets |
| QUEUE-014 | P1 | 5 | M5.3 | Preserve visible sorted order |
| QUEUE-015 | P1 | 5 | M5.3 | Do not close source screen before preparation succeeds |
| QUEUE-016 | P1 | 5 | M5.3 | Preserve Spotify metadata in resolved entries |
| QUEUE-017 | P1 | 5 | M5.3 | Handle unmatchable entries without index drift |
| QUEUE-018 | P1 | 5 | M5.3 | Full-status operation for shuffle-all |
| QUEUE-022 | P1 | 5 | M5.3 | Removing current track drops continuation |
| QUEUE-023 | P1 | 5 | M5.3 | Queue continuation always deduplicates by song ID |
| QUEUE-024 | P1 | 5 | M5.3 | Continuation merge races with user edits |
| QUEUE-025 | P1 | 5 | M5.3 | Continuation loop needs a page cap |
| QUEUE-026 | P1 | 5 | M5.3 | Retry/backoff missing on Desktop continuation |
| QUEUE-027 | P1 | 5 | M5.3 | Detail/playlist visible queue must retain continuation type |
| QUEUE-019 | P2 | 5 | M5.3 | Preload next match, not full audio file |
| QUEUE-020 | P2 | 5 | M5.3 | Queue progress and partial failures |
| QUEUE-028 | P2 | 5 | M5.3 | Queue title is discarded |
| QUEUE-029 | P2 | 5 | M5.3 | Continuation diagnostics |
| QUEUE-030 | P0 | 5 | M5.4 | Play Next is not guaranteed next under shuffle |
| QUEUE-031 | P0 | 5 | M5.4 | Selected “Play Next” has the same shuffle bug |
| QUEUE-032 | P1 | 5 | M5.4 | Toggling shuffle does not reorder current queue |
| QUEUE-033 | P1 | 5 | M5.4 | Turning shuffle off cannot restore source order |
| QUEUE-034 | P1 | 5 | M5.4 | Adding one item reshuffles the entire tail |
| QUEUE-035 | P1 | 5 | M5.4 | Current item lookup by ID is ambiguous |
| QUEUE-036 | P1 | 5 | M5.4 | Duplicate prevention uses song ID only |
| QUEUE-037 | P1 | 5 | M5.4 | Repeat persistence lacks rollback |
| QUEUE-038 | P1 | 5 | M5.4 | Main repeat-all ignores “disable load more” path |
| QUEUE-039 | P1 | 5 | M5.4 | Shuffle preference and active permutation are conflated |
| QUEUE-040 | P1 | 5 | M5.4 | `persistentShuffleAcrossQueues` semantics are unclear |
| QUEUE-041 | P1 | 5 | M5.4 | `shufflePlaylistFirst` implementation is incomplete |
| QUEUE-042 | P1 | 5 | M5.4 | Reorder while continuation loads can be lost |
| QUEUE-043 | P2 | 5 | M5.4 | No undo for destructive queue edits |
| QUEUE-044 | P2 | 5 | M5.4 | No direct “remove upcoming duplicates” action |
| QUEUE-045 | P2 | 5 | M5.4 | No queue save/export |
| RADIO-001 | P0 | 5 | M5.5 | Desktop lacks Meld's Spotify recommendation engine |
| RADIO-002 | P1 | 5 | M5.5 | Define source-specific radio policy |
| RADIO-003 | P1 | 5 | M5.5 | Seed must start immediately |
| RADIO-004 | P1 | 5 | M5.5 | Add fallback queue |
| RADIO-005 | P1 | 5 | M5.5 | Build taste profile cache |
| RADIO-006 | P1 | 5 | M5.5 | Candidate generation from multiple buckets |
| RADIO-007 | P1 | 5 | M5.5 | Composite scoring |
| RADIO-008 | P1 | 5 | M5.5 | Diversification |
| RADIO-009 | P1 | 5 | M5.5 | Avoid same song twice in a row |
| RADIO-010 | P1 | 5 | M5.5 | Automix result race |
| RADIO-011 | P1 | 5 | M5.5 | Automix errors are swallowed |
| RADIO-012 | P1 | 5 | M5.5 | YTM radio fallback needs retries like reference |
| RADIO-013 | P1 | 5 | M5.5 | Recommendation pagination and matching are separate |
| RADIO-014 | P2 | 5 | M5.5 | Explain recommendation source |
| RADIO-015 | P2 | 5 | M5.5 | Feedback loop |
| RADIO-016 | P2 | 5 | M5.5 | Deterministic test seed |
| HOME-001 | P0 | 5 | M5.6 | Product identity mismatch |
| SEARCH-001 | P0 | 5 | M5.6 | Add Use Spotify for Search |
| HOME-002 | P1 | 5 | M5.6 | Add Use Spotify for Home |
| HOME-003 | P1 | 5 | M5.6 | Add Spotify-only Home |
| HOME-004 | P1 | 5 | M5.6 | Spotify authentication fallback |
| HOME-005 | P1 | 5 | M5.6 | Top tracks section |
| HOME-006 | P1 | 5 | M5.6 | Top artists section |
| HOME-007 | P1 | 5 | M5.6 | Spotify home feed sections |
| HOME-008 | P1 | 5 | M5.6 | New releases/following/discover |
| HOME-009 | P1 | 5 | M5.6 | Recently played always available |
| HOME-010 | P1 | 5 | M5.6 | Home request races |
| HOME-011 | P1 | 5 | M5.6 | Fix nested state mutation |
| HOME-012 | P1 | 5 | M5.6 | Cache completeness/degraded TTL |
| SEARCH-002 | P1 | 5 | M5.6 | Authentication fallback |
| SEARCH-003 | P1 | 5 | M5.6 | Preserve Spotify entities |
| SEARCH-004 | P1 | 5 | M5.6 | Latest-search-wins |
| SEARCH-005 | P1 | 5 | M5.6 | Continuation belongs to query+source+filter |
| SEARCH-006 | P1 | 5 | M5.6 | Search filters by source capabilities |
| SEARCH-007 | P1 | 5 | M5.6 | Background matching must be incognito |
| SEARCH-008 | P1 | 5 | M5.6 | Search history privacy/source |
| TR-M6 | P1 | 5 | M5.6 | Spotify parity partial |
| HOME-013 | P2 | 5 | M5.6 | Cross-source deduplication |
| HOME-014 | P2 | 5 | M5.6 | Section failure isolation |
| HOME-015 | P2 | 5 | M5.6 | Source badges and privacy |
| SEARCH-009 | P2 | 5 | M5.6 | Debounced suggestions and cancellation |
| SEARCH-010 | P2 | 5 | M5.6 | URL paste takes precedence safely |
| SEARCH-011 | P2 | 5 | M5.6 | Offline/local fallback |
| SEARCH-012 | P2 | 5 | M5.6 | Search quality analytics locally testable |
| SPOT-001 | P0 | 5 | M5.7 | Startup auth state can lie |
| TEST-001 | P0 | 5 | M5.7 | Queue state-machine test matrix |
| TEST-002 | P0 | 5 | M5.7 | Shuffle/repeat transition table |
| TEST-003 | P0 | 5 | M5.7 | Spotify matcher corpus |
| SPOT-002 | P1 | 5 | M5.7 | Token refresh race |
| SPOT-003 | P1 | 5 | M5.7 | Dynamic GraphQL hashes |
| SPOT-004 | P1 | 5 | M5.7 | Hash update must be trusted |
| SPOT-005 | P1 | 5 | M5.7 | Unified 429 handling |
| SPOT-006 | P1 | 5 | M5.7 | Error-body taxonomy |
| SPOT-007 | P1 | 5 | M5.7 | Playlist pagination must not cap at 50/100 silently |
| SPOT-008 | P1 | 5 | M5.7 | Bulk Spotify download is not actually queued |
| SPOT-009 | P1 | 5 | M5.7 | Reorder under sort/filter can be misleading |
| SPOT-010 | P1 | 5 | M5.7 | Playlist mutation conflict refresh |
| SPOT-011 | P1 | 5 | M5.7 | Liked-song bidirectional sync missing |
| UI-001 | P1 | 5 | M5.7 | Async Tauri listener cleanup race |
| UI-002 | P1 | 5 | M5.7 | Detail/playlist request races |
| UI-003 | P1 | 5 | M5.7 | Spotify folder/playlist/profile races |
| UI-004 | P1 | 5 | M5.7 | Loading flags can cover stale entities |
| UI-005 | P1 | 5 | M5.7 | One notice string is not an operation model |
| TEST-004 | P1 | 5 | M5.7 | Spotify playlist progressive queue tests |
| TEST-005 | P1 | 5 | M5.7 | Continuation routing fixtures |
| TEST-006 | P1 | 5 | M5.7 | Automix race tests |
| TEST-007 | P1 | 5 | M5.7 | Home source/fallback tests |
| TEST-008 | P1 | 5 | M5.7 | Search race/source tests |
| TEST-009 | P1 | 5 | M5.7 | Spotify token/hash/rate-limit tests |
| TEST-010 | P1 | 5 | M5.7 | React immutable-state tests |
| TEST-011 | P1 | 5 | M5.7 | StrictMode listener test |
| TR-H3 | P1 | 5 | M5.7 | Spotify GraphQL hashes are compiled static data |
| SPOT-012 | P2 | 5 | M5.7 | Followed-artist sync |
| SPOT-013 | P2 | 5 | M5.7 | Spotify album screen |
| SPOT-014 | P2 | 5 | M5.7 | Folder recursion and cycles |
| SPOT-015 | P2 | 5 | M5.7 | Profile cache tiers |
| UI-006 | P2 | 5 | M5.7 | Large lists need virtualization |
| TEST-012 | P2 | 5 | M5.7 | Recommendation quality tests |
| TEST-013 | P2 | 5 | M5.7 | Large-source soak |
| U4-016 | P1 | 6 | M6.1 | Define primary navigation parity |
| U4-017 | P1 | 6 | M6.1 | Add Listen Together only when real backend behavior exists |
| U4-018 | P1 | 6 | M6.1 | Add clear active, hover, focus, pressed, disabled, loading, and attention states for every navigation item |
| U4-019 | P1 | 6 | M6.1 | Make repeated activation useful |
| U4-020 | P1 | 6 | M6.1 | Persist sidebar collapsed state per window |
| U4-021 | P1 | 6 | M6.1 | Replace Unicode navigation glyphs with a coherent icon set |
| U4-022 | P1 | 6 | M6.1 | Add Windows system-theme integration |
| U4-023 | P1 | 6 | M6.1 | Respect Windows accent color optionally |
| U4-024 | P1 | 6 | M6.1 | Add high-contrast/forced-colors support |
| U4-025 | P1 | 6 | M6.1 | Support display scaling and text zoom |
| U4-026 | P1 | 6 | M6.1 | Add reduced-motion support |
| U4-027 | P1 | 6 | M6.1 | Restore window size, position, maximized state, and full-player layout safely |
| U4-028 | P1 | 6 | M6.1 | Support Windows snap sizes |
| U4-029 | P1 | 6 | M6.1 | Add compact/narrow navigation |
| U4-030 | P1 | 6 | M6.1 | Provide a native title-bar strategy |
| U4-031 | P1 | 6 | M6.1 | Add native back/forward mouse-button handling |
| U4-032 | P1 | 6 | M6.1 | Preserve playback while navigating and resizing |
| U4-033 | P1 | 6 | M6.1 | Add command palette/quick navigation |
| U4-034 | P1 | 6 | M6.1 | Add customizable navigation only after all destinations are routable |
| U4-035 | P1 | 6 | M6.2 | Preserve section order and source identity |
| U4-036 | P1 | 6 | M6.2 | Add skeleton/shimmer loading instead of one blocking boot panel |
| U4-037 | P1 | 6 | M6.2 | Retain already loaded Home content during refresh |
| U4-038 | P1 | 6 | M6.2 | Add pull/toolbar refresh equivalent for desktop |
| U4-039 | P1 | 6 | M6.2 | Restore per-section Play All and Shuffle where the source supports them |
| U4-040 | P1 | 6 | M6.2 | Add Recently Played using actual local/remote history policy |
| U4-041 | P1 | 6 | M6.2 | Add Mood & Genres route and cards |
| U4-042 | P1 | 6 | M6.2 | Add Charts route |
| U4-043 | P1 | 6 | M6.2 | Add New Releases with YouTube and Spotify source labels |
| U4-044 | P1 | 6 | M6.2 | Add Spotify Home and Spotify-only Home mode |
| U4-045 | P1 | 6 | M6.2 | Add music-recognition entry only when recognition works |
| U4-046 | P1 | 6 | M6.2 | Add Speed Dial edit/reorder/removal affordances |
| U4-047 | P1 | 6 | M6.2 | Add section-level error states |
| U4-048 | P1 | 6 | M6.2 | Virtualize long Home sections |
| U4-049 | P1 | 6 | M6.2 | Preserve horizontal scroll positions per section |
| U4-050 | P1 | 6 | M6.2 | Add keyboard navigation for card rows |
| U4-051 | P1 | 6 | M6.2 | Use truthful labels |
| U4-052 | P1 | 6 | M6.2 | Separate search input and results routes |
| U4-053 | P1 | 6 | M6.2 | Add debounced suggestions with cancellation |
| U4-054 | P1 | 6 | M6.2 | Implement complete combobox semantics |
| U4-055 | P1 | 6 | M6.2 | Show search history only while the search control is active |
| U4-056 | P1 | 6 | M6.2 | Add individual history deletion and clear confirmation |
| U4-057 | P1 | 6 | M6.2 | Add search filters |
| U4-058 | P1 | 6 | M6.2 | Honor Hide video songs and explicit filtering consistently in suggestions, results, and continuation pages |
| U4-059 | P1 | 6 | M6.2 | Parse pasted URLs |
| U4-060 | P1 | 6 | M6.2 | Preserve literal encoded queries |
| U4-061 | P1 | 6 | M6.2 | Add local-library search mode |
| U4-062 | P1 | 6 | M6.2 | Add source labels and match confidence for Spotify-backed results |
| U4-063 | P1 | 6 | M6.2 | Add search-within-results and result-count messaging |
| U4-064 | P1 | 6 | M6.2 | Show “no visible results” after filtering |
| U4-065 | P1 | 6 | M6.2 | Preserve focus and caret when results update |
| U4-066 | P1 | 6 | M6.2 | Virtualize long result lists and maintain focus across appended pages |
| U4-067 | P1 | 6 | M6.2 | Make selection mode explicit and scoped |
| U4-068 | P1 | 6 | M6.2 | Give each library area its own route |
| U4-069 | P1 | 6 | M6.2 | Correct tab semantics |
| U4-070 | P1 | 6 | M6.2 | Preserve each view’s query, sort, direction, density, and scroll position |
| U4-071 | P1 | 6 | M6.2 | Add pull/refresh toolbar behavior with last-sync status |
| U4-072 | P1 | 6 | M6.2 | Show source badges |
| U4-073 | P1 | 6 | M6.2 | Add download/cache badges on playlists and items |
| U4-074 | P1 | 6 | M6.2 | Add library count and storage summary |
| U4-075 | P1 | 6 | M6.2 | Add list/grid/density settings per media type |
| U4-076 | P1 | 6 | M6.2 | Add all source sort modes that are meaningful |
| U4-077 | P1 | 6 | M6.2 | Keep auto-playlists first-class but clearly synthetic |
| U4-078 | P1 | 6 | M6.2 | Restore weekly/monthly most-played playlists and visibility controls |
| U4-079 | P1 | 6 | M6.2 | Add full playlist create/edit/delete/reorder UI |
| U4-080 | P1 | 6 | M6.2 | Add playlist descriptions, creator/channel, thumbnails, counts, duration, privacy, and sync state |
| U4-081 | P1 | 6 | M6.2 | Add CSV/M3U import/export flows with previews and error rows |
| U4-082 | P1 | 6 | M6.2 | Add local-file folder scan, rescan, unavailable/relink, and metadata conflict UI |
| U4-083 | P1 | 6 | M6.2 | Add album/artist bookmark/follow states and actions |
| U4-084 | P1 | 6 | M6.2 | Add podcast subscription, new-episode, saved-for-later, downloaded, progress, and played/unplayed affordances |
| U4-085 | P1 | 6 | M6.2 | Add offline-first states |
| U4-086 | P1 | 6 | M6.2 | Make “Clear local data” wording exact |
| U4-087 | P1 | 6 | M6.2 | Add bulk-action eligibility summaries |
| U4-088 | P1 | 6 | M6.2 | Add confirmation/undo for bulk remove download, unlike, remove from library, and playlist deletion |
| U4-089 | P1 | 6 | M6.2 | Select occurrences, not only song IDs |
| U4-090 | P1 | 6 | M6.2 | Add Select All/None/Range |
| U4-091 | P1 | 6 | M6.2 | Replace generic detail overlay with dedicated routes |
| U4-092 | P1 | 6 | M6.2 | Add shareable/copyable route state |
| U4-093 | P1 | 6 | M6.2 | Add hero artwork with responsive size and fallback |
| U4-094 | P1 | 6 | M6.2 | Add album metadata |
| U4-095 | P1 | 6 | M6.2 | Make artists clickable in every appropriate context |
| U4-096 | P1 | 6 | M6.2 | Add artist tabs/sections |
| U4-097 | P1 | 6 | M6.2 | Add artist follow/bookmark and Play All/Shuffle/Radio actions |
| U4-098 | P1 | 6 | M6.2 | Add playlist creator/channel, description, visibility, item count, duration, download status, and sync state |
| U4-099 | P1 | 6 | M6.2 | Add playlist sort/reorder/edit actions according to ownership |
| U4-100 | P1 | 6 | M6.2 | Add custom playlist thumbnails where supported |
| U4-101 | P1 | 6 | M6.2 | Add podcast show header, subscription, description, episode filters, progress, download, and refresh |
| U4-102 | P1 | 6 | M6.2 | Add “show all” routes that preserve section identity and continuation |
| U4-103 | P1 | 6 | M6.2 | Add unavailable/restricted content treatment |
| U4-104 | P1 | 6 | M6.2 | Improve item details |
| U4-105 | P1 | 6 | M6.2 | Do not expose raw IDs as the primary user experience |
| U4-106 | P1 | 6 | M6.2 | Add explicit-content badges everywhere relevant |
| U4-107 | P1 | 6 | M6.2 | Add context-aware primary action |
| TR-H7 | P1 | 6 | M6.2 | YouTube URL parsing is incorrect |
| TR-H8 | P1 | 6 | M6.2 | Generated share URLs are often invalid |
| U4-108 | P1 | 6 | M6.3 | Restore every v0.1.8 player setting intentionally |
| U4-109 | P1 | 6 | M6.3 | Make previous/play/next icon buttons explicitly named |
| U4-110 | P1 | 6 | M6.3 | Add `aria-pressed` to repeat and favorite controls |
| U4-111 | P1 | 6 | M6.3 | Add keyboard seek announcements |
| U4-112 | P1 | 6 | M6.3 | Add seek tooltip and buffered/downloaded indication |
| U4-113 | P1 | 6 | M6.3 | Add mute button and wheel/keyboard volume support with visible value |
| U4-114 | P1 | 6 | M6.3 | Add playback-speed/pitch panel |
| U4-115 | P1 | 6 | M6.3 | Add audio-quality indicator and selector |
| U4-116 | P1 | 6 | M6.3 | Add equalizer entry and real Windows DSP implementation before showing the control |
| U4-117 | P1 | 6 | M6.3 | Add playback error card |
| U4-118 | P1 | 6 | M6.3 | Keep the old audible item visible until the next item actually starts |
| U4-119 | P1 | 6 | M6.3 | Add loading/buffering state to the play button and artwork |
| U4-120 | P1 | 6 | M6.3 | Add download/cache/progress badge to now playing |
| U4-121 | P1 | 6 | M6.3 | Make title, artist, and album interactive with correct routes |
| U4-122 | P1 | 6 | M6.3 | Add full-player views/tabs for artwork, lyrics, and queue |
| U4-123 | P1 | 6 | M6.3 | Preserve player view and lyric scroll state across collapse/expand |
| U4-124 | P1 | 6 | M6.3 | Support artwork crop/fit and dynamic background options |
| U4-125 | P1 | 6 | M6.3 | Add system media-session parity |
| U4-126 | P1 | 6 | M6.3 | Add taskbar thumbnail-toolbar controls where Windows supports them |
| U4-127 | P1 | 6 | M6.3 | Add global media keys, headset buttons, and optional pause-on-session-lock/device change behavior |
| U4-128 | P1 | 6 | M6.3 | Add compact mini-player behavior at narrow widths |
| U4-129 | P1 | 6 | M6.3 | Meet minimum target size |
| U4-130 | P1 | 6 | M6.3 | Use unique queue-entry IDs |
| U4-131 | P1 | 6 | M6.3 | Highlight now playing by queue entry, not song ID |
| U4-132 | P1 | 6 | M6.3 | Add drag reorder with full keyboard alternative |
| U4-133 | P1 | 6 | M6.3 | Add multi-select queue editing |
| U4-134 | P1 | 6 | M6.3 | Add undo for remove and clear queue |
| U4-135 | P1 | 6 | M6.3 | Add queue sections |
| U4-136 | P1 | 6 | M6.3 | Show source context |
| U4-137 | P1 | 6 | M6.3 | Add “Save queue as playlist.” |
| U4-138 | P1 | 6 | M6.3 | Add queue menu separate from player menu |
| U4-139 | P1 | 6 | M6.3 | Preserve canonical order when shuffle toggles off |
| U4-140 | P1 | 6 | M6.3 | Make Play Next deterministic even when shuffle is enabled |
| U4-141 | P1 | 6 | M6.3 | Announce queue edits |
| U4-142 | P1 | 6 | M6.3 | Scroll/focus current item when the queue opens and after shuffle/reorder |
| U4-143 | P1 | 6 | M6.3 | Show continuation and automix failures with Retry |
| U4-144 | P1 | 6 | M6.3 | Add persistent-queue restore prompt when the previous session ended abnormally |
| U4-145 | P1 | 6 | M6.3 | Restore provider picker and cached variants from v0.1.8 |
| U4-146 | P1 | 6 | M6.3 | Add provider menu with current, available, failed, disabled, and cached states |
| U4-147 | P1 | 6 | M6.3 | Add manual search and candidate preview |
| U4-148 | P1 | 6 | M6.3 | Add edit, offset, re-sync, and reset actions |
| U4-149 | P1 | 6 | M6.3 | Add copy line, copy all, and share lyrics/image flows |
| U4-150 | P1 | 6 | M6.3 | Add word-synced/background-vocal/multi-singer presentation where data supports it |
| U4-151 | P1 | 6 | M6.3 | Add text alignment, font size, font family, glow/animation, translation, romanization, and background-style settings |
| U4-152 | P1 | 6 | M6.3 | Respect reduced motion |
| U4-153 | P1 | 6 | M6.3 | Add auto-scroll resume affordance |
| U4-154 | P1 | 6 | M6.3 | Do not render hundreds of lyric lines as independent generic buttons without list semantics |
| U4-155 | P1 | 6 | M6.3 | Announce active lyric sparingly |
| U4-156 | P1 | 6 | M6.3 | Keep playback shortcuts active in lyrics while protecting line navigation |
| U4-157 | P1 | 6 | M6.3 | Add plain-lyrics search, selection, and copy accessibility |
| U4-158 | P1 | 6 | M6.3 | Show provider attribution and cached/offline status clearly |
| U4-159 | P1 | 6 | M6.3 | Prefetch next-track lyrics with cancellation and no UI race |
| U4-160 | P1 | 6 | M6.4 | Build one accessible Dialog primitive |
| U4-161 | P1 | 6 | M6.4 | Build one Menu primitive |
| U4-162 | P1 | 6 | M6.4 | Build one Popover/Combobox primitive |
| U4-163 | P1 | 6 | M6.4 | Bind every dialog to its heading with `aria-labelledby` |
| U4-164 | P1 | 6 | M6.4 | Keep Escape behavior topmost-first |
| U4-165 | P1 | 6 | M6.4 | Make Settings Back return one level before closing |
| U4-166 | P1 | 6 | M6.4 | Prevent background shortcuts while a modal is open |
| U4-167 | P1 | 6 | M6.4 | Confirm irreversible remote deletion |
| U4-168 | P1 | 6 | M6.4 | Confirm clearing local history, search history, queue, downloads, caches, playlists, and library data |
| U4-169 | P1 | 6 | M6.4 | Offer Undo for reversible removals |
| U4-170 | P1 | 6 | M6.4 | Distinguish Remove, Delete, Disconnect, and Clear |
| U4-171 | P1 | 6 | M6.4 | Disable actions while submitting |
| U4-172 | P1 | 6 | M6.4 | Preserve dialog input after recoverable errors |
| U4-173 | P1 | 6 | M6.4 | Show item eligibility before bulk actions |
| U4-174 | P1 | 6 | M6.4 | Add progress/cancel to bulk operations |
| U4-175 | P1 | 6 | M6.4 | Restore focus to the invoking control after close |
| U4-176 | P1 | 6 | M6.4 | Keep context menus on screen |
| U4-177 | P1 | 6 | M6.4 | Add right-click and keyboard context-menu invocation |
| U4-178 | P1 | 6 | M6.4 | Add tooltips for icon-only controls |
| X4-001 | P1 | 6 | M6.4 | Settings is treated as one boolean modal, so Back closes the entire settings experience rather than returning from a category |
| X4-002 | P1 | 6 | M6.4 | Eighteen modal surfaces use dialog roles but none is built on a real focus-managed dialog primitive |
| X4-003 | P1 | 6 | M6.4 | The recent-search listbox lacks combobox keyboard semantics and focus-controlled visibility |
| X4-004 | P1 | 6 | M6.4 | Several tablists do not give their child controls tab roles or selected states |
| X4-005 | P1 | 6 | M6.4 | Global Space/arrow shortcuts can override focused buttons and ARIA widgets because only input/textarea/select/contenteditable are excluded |
| X4-006 | P1 | 6 | M6.4 | Selection uses song IDs, so duplicate occurrences cannot be independently selected |
| X4-007 | P1 | 6 | M6.4 | Bulk download starts per-item operations and suppresses individual errors while immediately claiming a count started |
| X4-008 | P1 | 6 | M6.4 | Remove selected downloads has no confirmation, eligibility review, progress, cancellation, or undo |
| X4-009 | P1 | 6 | M6.4 | Uploaded-song deletion is immediate despite being a destructive remote operation |
| X4-010 | P1 | 6 | M6.4 | Queue Clear immediately stops playback and destroys queue state without confirmation or undo |
| X4-011 | P1 | 6 | M6.4 | The visual minimum target for several controls is around 30–34 px |
| X4-012 | P1 | 6 | M6.4 | Card menus are hover-hidden and need `:focus-within`/touch treatment |
| X4-013 | P1 | 6 | M6.4 | The app has no reduced-motion, forced-colors, high-contrast, light-theme, or system-theme CSS path |
| X4-014 | P1 | 6 | M6.4 | The minimum 860 px window width prevents compact Windows snap layouts |
| X4-015 | P1 | 6 | M6.4 | Player close clears the visible player rather than offering a configurable stop/minimize/keep-playing policy |
| X4-016 | P1 | 6 | M6.4 | Lyrics auto-scroll disables on interaction without a persistent, obvious resume control |
| X4-017 | P1 | 6 | M6.4 | Development language such as “typed item,” “watchEndpoint,” and “source contracts” leaks into normal UI copy |
| X4-018 | P1 | 6 | M6.4 | All user-facing strings are hardcoded in English |
| X4-019 | P1 | 6 | M6.4 | Missing reference features are extensive enough that parity must be managed as routes/capabilities, not by adding more conditions to `App.tsx` |
| U4-221 | P1 | 6 | M6.5 | Define a complete keyboard map |
| U4-222 | P1 | 6 | M6.5 | Never steal Space/arrow keys from focused buttons, sliders, menus, tabs, lists, or dialogs |
| U4-223 | P1 | 6 | M6.5 | Add roving focus for tablists, menu lists, card rows, queue, and lyrics |
| U4-224 | P1 | 6 | M6.5 | Preserve focus during pagination and sorting |
| U4-225 | P1 | 6 | M6.5 | Ensure hidden/covered content cannot receive focus |
| U4-226 | P1 | 6 | M6.5 | Add skip links/landmarks |
| U4-227 | P1 | 6 | M6.5 | Make all pointer gestures keyboard-operable |
| U4-228 | P1 | 6 | M6.5 | Give every dialog an accessible name and description |
| U4-229 | P1 | 6 | M6.5 | Correct tab, listbox, menu, toolbar, grid, slider, and progress semantics |
| U4-230 | P1 | 6 | M6.5 | Add accessible value text to seek, volume, sleep timer, speed, pitch, EQ, and progress controls |
| U4-231 | P1 | 6 | M6.5 | Announce loading completion and errors without replacing focus |
| U4-232 | P1 | 6 | M6.5 | Add progress semantics to downloads and sync |
| U4-233 | P1 | 6 | M6.5 | Do not truncate the only error copy |
| U4-234 | P1 | 6 | M6.5 | Name artwork meaningfully only when informative |
| U4-235 | P1 | 6 | M6.5 | Replace symbol pronunciation risk |
| U4-236 | P1 | 6 | M6.5 | Do not rely on color |
| U4-237 | P1 | 6 | M6.5 | Meet WCAG AA contrast for text and controls in every theme/state |
| U4-238 | P1 | 6 | M6.5 | Keep focus indicators visible over all backgrounds and overlays |
| U4-239 | P1 | 6 | M6.5 | Increase small hit targets |
| U4-240 | P1 | 6 | M6.5 | Support 200% text scaling without horizontal page clipping |
| U4-241 | P1 | 6 | M6.5 | Support reduced motion, high contrast, and reduced transparency |
| U4-242 | P1 | 6 | M6.5 | Avoid time-limited notices as the sole feedback |
| U4-243 | P1 | 6 | M6.5 | Do not auto-focus destructive buttons |
| U4-244 | P1 | 6 | M6.5 | Test with Narrator, keyboard only, Windows High Contrast, 200% scale, and touch |
| TR-M8 | P1 | 6 | M6.5 | Accessibility incomplete |
| U4-281 | P1 | 6 | M6.6 | Use stale-while-revalidate |
| U4-282 | P1 | 6 | M6.6 | Distinguish offline, timeout, authentication, rate-limit, parser, unavailable-content, and playback-source errors |
| U4-283 | P1 | 6 | M6.6 | Provide contextual Retry |
| U4-284 | P1 | 6 | M6.6 | Show account-expired banners |
| U4-285 | P1 | 6 | M6.6 | Show rate-limit countdown using Retry-After when available |
| U4-286 | P1 | 6 | M6.6 | Show partial-success summaries |
| U4-287 | P1 | 6 | M6.6 | Keep technical details expandable |
| U4-288 | P1 | 6 | M6.6 | Add offline badges and availability filters |
| U4-289 | P1 | 6 | M6.6 | Never claim completion before backend confirmation |
| U4-290 | P1 | 6 | M6.6 | Replace developer-facing copy |
| U4-291 | P1 | 6 | M6.6 | Use consistent product terms |
| U4-292 | P1 | 6 | M6.6 | Add human-readable empty-state actions |
| U4-293 | P1 | 6 | M6.6 | Keep notice history |
| U4-294 | P1 | 6 | M6.6 | Do not silently swallow background errors |
| TR-M9 | P1 | 6 | M6.6 | No localization architecture |
| TR-L6 | P1 | 6 | M6.6 | Per-feature empty/error/offline states instead of one notice string |
| U4-295 | P2 | 6 | M6.7 | Define tokens |
| U4-296 | P2 | 6 | M6.7 | Replace ad hoc z-index management with named layers |
| U4-297 | P2 | 6 | M6.7 | Standardize buttons |
| U4-298 | P2 | 6 | M6.7 | Standardize cards/list rows |
| U4-299 | P2 | 6 | M6.7 | Standardize screen headers and toolbars |
| U4-300 | P2 | 6 | M6.7 | Standardize loading/empty/error panels |
| U4-301 | P2 | 6 | M6.7 | Standardize form controls |
| U4-302 | P2 | 6 | M6.7 | Use proper icon assets |
| U4-303 | P2 | 6 | M6.7 | Ensure artwork is not upscaled unnecessarily |
| U4-304 | P2 | 6 | M6.7 | Add image loading, fallback, retry, and offline-cache states without layout shift |
| U4-305 | P2 | 6 | M6.7 | Apply truncation deliberately |
| U4-306 | P2 | 6 | M6.7 | Keep the visual language Windows-native without becoming a generic Fluent clone |
| U4-307 | P2 | 6 | M6.7 | Every route renders loading, empty, error, stale, offline, and success states |
| U4-308 | P2 | 6 | M6.7 | Back/forward restores route parameters, filters, selection, scroll, and modal stack |
| U4-309 | P2 | 6 | M6.7 | Stale async responses cannot update a replaced route |
| U4-310 | P2 | 6 | M6.7 | Dialog focus enters, traps, closes, and restores correctly |
| U4-311 | P2 | 6 | M6.7 | Menus and comboboxes pass keyboard interaction tests |
| U4-312 | P2 | 6 | M6.7 | Tablists use correct roles and arrow navigation |
| U4-313 | P2 | 6 | M6.7 | Global playback shortcuts do not override focused controls/widgets |
| U4-314 | P2 | 6 | M6.7 | Bulk actions report eligible/succeeded/failed/skipped counts |
| U4-315 | P2 | 6 | M6.7 | Duplicate songs remain independent in queue, playlist, history, and selection |
| U4-316 | P2 | 6 | M6.7 | Destructive actions require confirmation or support Undo according to policy |
| U4-317 | P2 | 6 | M6.7 | Every icon-only button has an accessible name and visible tooltip |
| U4-318 | P2 | 6 | M6.7 | Every modal has an accessible name and no background tabbability |
| U4-319 | P2 | 6 | M6.7 | Screen-reader live regions do not spam playback ticks or lyric lines |
| U4-320 | P2 | 6 | M6.7 | Reduced-motion mode disables nonessential animation/smooth scroll |
| U4-321 | P2 | 6 | M6.7 | Test 640/720/860/1024/1280/1440/1920 px widths and 600/768/1080 px heights |
| U4-322 | P2 | 6 | M6.7 | Test 100/125/150/175/200% Windows scaling |
| U4-323 | P2 | 6 | M6.7 | Test light, dark, pure black, Windows High Contrast, and custom accent |
| U4-324 | P2 | 6 | M6.7 | Test mouse, keyboard only, touchpad, touch, and coarse pointer |
| U4-325 | P2 | 6 | M6.7 | Test long English, German-like expansion, Arabic RTL, CJK, emoji, and mixed-script metadata |
| U4-326 | P2 | 6 | M6.7 | Test extremely long titles/artists/playlists and missing/broken artwork |
| U4-327 | P2 | 6 | M6.7 | Test modal/menu placement at every screen edge and monitor DPI transition |
| U4-328 | P2 | 6 | M6.7 | Test player with no lyrics, plain lyrics, line sync, word sync, error, local file, podcast, and unavailable stream |
| U4-329 | P2 | 6 | M6.7 | Test offline startup with downloads, cache, local files, and stale remote pages |
| U4-330 | P2 | 6 | M6.7 | Test every destructive confirmation and cancellation path |
| U4-331 | P2 | 6 | M6.7 | Complete all daily flows with keyboard only |
| U4-332 | P2 | 6 | M6.7 | Complete all daily flows with Windows Narrator |
| U4-333 | P2 | 6 | M6.7 | Verify focus order and visible focus in every dialog/menu/route |
| U4-334 | P2 | 6 | M6.7 | Verify high contrast and 200% text without loss of content or action |
| U4-335 | P2 | 6 | M6.7 | Verify reduced motion and no seizure/vestibular hazards |
| U4-336 | P2 | 6 | M6.7 | Verify status/error/progress messages are perceivable and persistent enough |
| U4-179 | P1 | 7 | M7.1 | Make each settings category routable and searchable |
| U4-180 | P1 | 7 | M7.1 | Add Reset per setting group and Reset All with preview |
| U4-181 | P1 | 7 | M7.1 | Show when restart is required |
| U4-182 | P1 | 7 | M7.1 | Validate every numeric/text setting inline |
| U4-183 | P1 | 7 | M7.1 | Add setting dependency states |
| U4-184 | P1 | 7 | M7.1 | Version settings and migrate renamed/removed values |
| U4-185 | P1 | 7 | M7.1 | Remove development-audit prose from final customer UI |
| U4-186 | P1 | 7 | M7.1 | Light/Dark/System/Pure Black |
| U4-187 | P1 | 7 | M7.1 | Dynamic artwork/player background toggle |
| U4-188 | P1 | 7 | M7.1 | Accent palette and contrast-safe custom color |
| U4-189 | P1 | 7 | M7.1 | Font family, UI scale/density, grid size, and artwork crop/fit |
| U4-190 | P1 | 7 | M7.1 | Lyrics alignment, font size/style, glow, animation, and background |
| U4-191 | P1 | 7 | M7.1 | Navigation customization and compact/sidebar behavior |
| U4-192 | P1 | 7 | M7.1 | Reduce motion and transparency |
| U4-193 | P1 | 7 | M7.1 | Audio quality with actual format display |
| U4-194 | P1 | 7 | M7.1 | Volume persistence and pause-on-mute |
| U4-195 | P1 | 7 | M7.1 | Seek step, varispeed, pitch, and speed controls |
| U4-196 | P1 | 7 | M7.1 | Equalizer/AutoEQ and reset/bypass |
| U4-197 | P1 | 7 | M7.1 | Audio normalization level |
| U4-198 | P1 | 7 | M7.1 | Silence skipping |
| U4-199 | P1 | 7 | M7.1 | Crossfade only after the Windows playback engine supports it correctly |
| U4-200 | P1 | 7 | M7.1 | Persistent queue, autoplay/automix, pre-cache, shuffle/repeat persistence, duplicate policy, and stop-on-close behavior |
| U4-201 | P1 | 7 | M7.1 | “Play over other audio”/exclusive-mode policy appropriate to Windows |
| U4-202 | P1 | 7 | M7.1 | Preferred YouTube client/source diagnostics only in Advanced |
| U4-203 | P1 | 7 | M7.1 | Explicit/video filtering with scope explanation |
| U4-204 | P1 | 7 | M7.1 | Lyrics provider enable/order plus per-provider status |
| U4-205 | P1 | 7 | M7.1 | Romanization and translation settings |
| U4-206 | P1 | 7 | M7.1 | Proxy configuration with validation/test action |
| U4-207 | P1 | 7 | M7.1 | Separate local and remote history controls |
| U4-208 | P1 | 7 | M7.1 | Cache limits, image cache, player cache, download storage, clear/verify/repair, and storage-location controls |
| U4-209 | P1 | 7 | M7.1 | Pre-cache count and metered-network policy |
| U4-210 | P1 | 7 | M7.1 | Crash-reporting consent and privacy details if telemetry is added |
| U4-211 | P1 | 7 | M7.1 | Backup/restore preview, merge/replace mode, media exclusion, and schema compatibility |
| U4-212 | P1 | 7 | M7.1 | Full Google account screen |
| U4-213 | P1 | 7 | M7.1 | Full Spotify screen |
| U4-214 | P1 | 7 | M7.1 | Last.fm integration |
| U4-215 | P1 | 7 | M7.1 | Discord integration only with clear risk disclosure and secure authentication |
| U4-216 | P1 | 7 | M7.1 | Listen Together integration/settings |
| U4-217 | P1 | 7 | M7.1 | AI lyrics translation settings only when a real provider is configured |
| U4-218 | P1 | 7 | M7.1 | Updater channel and update UI |
| U4-219 | P1 | 7 | M7.1 | Changelog/release-notes screen and first-run-after-update summary |
| U4-220 | P1 | 7 | M7.1 | Complete About screen |
| U4-245 | P1 | 7 | M7.2 | Define layout classes by available width, not device labels |
| U4-246 | P1 | 7 | M7.2 | Use wide screens productively |
| U4-247 | P1 | 7 | M7.2 | Keep line lengths readable |
| U4-248 | P1 | 7 | M7.2 | Make overlays fit 600 px height |
| U4-249 | P1 | 7 | M7.2 | Avoid overlay stacking |
| U4-250 | P1 | 7 | M7.2 | Add touch-friendly mode automatically for coarse pointers |
| U4-251 | P1 | 7 | M7.2 | Add mouse wheel volume/seek only with clear hover/focus scope and configurable direction |
| U4-252 | P1 | 7 | M7.2 | Support drag-and-drop |
| U4-253 | P1 | 7 | M7.2 | Add Explorer integration carefully |
| U4-254 | P1 | 7 | M7.2 | Add Windows share/clipboard fallback |
| U4-255 | P1 | 7 | M7.2 | Add tray behavior only as an opt-in |
| U4-256 | P1 | 7 | M7.2 | Add jump-list/recent actions if useful |
| U4-257 | P1 | 7 | M7.2 | Add native notifications sparingly |
| U4-258 | P1 | 7 | M7.2 | Handle monitor/DPI changes live |
| U4-259 | P1 | 7 | M7.2 | Support RTL and long translations before localization ships |
| U4-260 | P1 | 7 | M7.2 | Externalize all user-facing strings |
| S5-075 | P1 | 7 | M7.3 | Register `meld://` deep links |
| S5-076 | P1 | 7 | M7.3 | Forward args from the second instance |
| S5-077 | P1 | 7 | M7.3 | Validate files opened via association |
| S5-078 | P1 | 7 | M7.3 | System Media Transport Controls |
| S5-079 | P1 | 7 | M7.3 | Taskbar thumbnail buttons and progress |
| S5-080 | P1 | 7 | M7.3 | System tray |
| S5-081 | P1 | 7 | M7.3 | Jump list |
| S5-082 | P1 | 7 | M7.3 | Global media keys |
| S5-083 | P1 | 7 | M7.3 | Autostart (opt-in) |
| S5-084 | P1 | 7 | M7.3 | Power and session events |
| R6-032 | P1 | 8 | M8.1 | Split the monolithic component |
| R6-033 | P1 | 8 | M8.1 | Isolate high-frequency playback state |
| R6-034 | P1 | 8 | M8.1 | Virtualize long lists |
| R6-035 | P1 | 8 | M8.1 | Lazy-load images |
| R6-036 | P1 | 8 | M8.1 | Code-split routes |
| R6-037 | P1 | 8 | M8.1 | Memoize derived data |
| R6-038 | P1 | 8 | M8.1 | Avoid layout thrash in lyrics |
| R6-039 | P1 | 8 | M8.1 | Debounce search and filter inputs |
| R6-040 | P1 | 8 | M8.1 | Stale-response protection |
| R6-041 | P1 | 8 | M8.1 | React Profiler budgets |
| TR-L7 | P1 | 8 | M8.1 | Virtualize very large lists |
| R6-042 | P2 | 8 | M8.2 | Define budgets |
| R6-043 | P2 | 8 | M8.2 | Leak checks |
| R6-044 | P2 | 8 | M8.2 | Free large payloads |
| R6-045 | P2 | 8 | M8.2 | Throttle background work when minimized |
| R6-046 | P2 | 8 | M8.2 | Timer hygiene |
| R6-047 | P2 | 8 | M8.2 | Artwork cache limits |
| R6-048 | P2 | 8 | M8.2 | Battery-aware behavior |
| R6-049 | P1 | 8 | M8.3 | Measure and log startup phases |
| R6-050 | P1 | 8 | M8.3 | Defer non-critical startup work |
| R6-051 | P1 | 8 | M8.3 | Show a shell immediately |
| R6-052 | P1 | 8 | M8.3 | Graceful shutdown |
| R6-053 | P1 | 8 | M8.3 | Restore session state |
| R6-054 | P1 | 8 | M8.3 | Crash-loop protection |
| R6-055 | P1 | 8 | M8.3 | Unified error taxonomy |
| R6-056 | P1 | 8 | M8.3 | Offline mode |
| R6-057 | P1 | 8 | M8.3 | Mutation outbox |
| R6-058 | P1 | 8 | M8.3 | Partial failure reporting |
| R6-059 | P1 | 8 | M8.3 | Never silently swallow errors |
| R6-060 | P1 | 8 | M8.3 | User-visible recovery actions |
| TR-L5 | P1 | 8 | M8.3 | Crash recovery and safe-mode/reset for corrupt state |
| U4-261 | P2 | 9 | M9.1 | Listen Together screen and real-time room UX |
| U4-262 | P2 | 9 | M9.1 | Music recognition and recognition history |
| U4-263 | P2 | 9 | M9.1 | Mood & Genres |
| U4-264 | P2 | 9 | M9.1 | Charts |
| U4-265 | P2 | 9 | M9.1 | New Releases |
| U4-266 | P2 | 9 | M9.1 | Spotify Home, Search, Album, Artist, followed artists, recommendations, and re-login UX |
| U4-267 | P2 | 9 | M9.1 | Wrapped/recap flow and weekly/monthly playlists |
| U4-268 | P2 | 9 | M9.1 | Last.fm |
| U4-269 | P2 | 9 | M9.1 | Discord presence |
| U4-270 | P2 | 9 | M9.1 | AI/manual lyrics translation and romanization |
| U4-271 | P2 | 9 | M9.1 | Full equalizer/AutoEQ wizard |
| U4-272 | P2 | 9 | M9.1 | Import/export flows |
| U4-273 | P2 | 9 | M9.1 | Changelog and update UX |
| U4-274 | P2 | 9 | M9.1 | Crash/recovery screen |
| U4-275 | P2 | 9 | M9.1 | Alarm/scheduled playback only if a reliable Windows background/task model is implemented |
| U4-276 | P2 | 9 | M9.1 | Proxy settings and test connection |
| U4-277 | P2 | 9 | M9.1 | Cache and pre-cache management |
| U4-278 | P2 | 9 | M9.1 | Custom theme/colors, UI density, navigation customization, and pure-black mode |
| U4-279 | P2 | 9 | M9.1 | Release notes/onboarding for first launch and major updates |
| U4-280 | P2 | 9 | M9.1 | Diagnostics/support bundle with automatic secret redaction |
| FEAT-001 | P2 | 9 | M9.2 | Podcasts without login (guest) |
| FEAT-002 | P2 | 9 | M9.2 | Musixmatch removed (wrong lyrics) |
| FEAT-003 | P2 | 9 | M9.2 | Search user profiles |
| FEAT-004 | P2 | 9 | M9.2 | Redesigned song details, Last.fm/account settings screens |
| FEAT-005 | P2 | 9 | M9.2 | Mini-player background styles, playlist button |
| FEAT-006 | P2 | 9 | M9.2 | Synced scrolling lyrics for YouTube-sourced songs |
| FEAT-007 | P2 | 9 | M9.2 | High-res artwork + thumbnail fallback chain |
| FEAT-008 | P2 | 9 | M9.2 | SponsorBlock (opt-in, categories, toast, privacy hash prefix) |
| FEAT-009 | P2 | 9 | M9.2 | Add/remove tracks in Spotify playlists (incl. reverse lookup for YouTube tracks) |
| FEAT-010 | P2 | 9 | M9.2 | Stale auth cleared after backup restore |
| FEAT-011 | P2 | 9 | M9.2 | Timeout guards (REST 3 s, engine 4 s) with artist-top-tracks fallback |
| FEAT-012 | P2 | 9 | M9.2 | Thumbnail fallback chain Spotify→YouTube match→video |
| FEAT-013 | P2 | 9 | M9.2 | Google Cast (Windows: optional DLNA/Chromecast casting) |
| S5-063 | P1 | 10 | M10.1 | Add `tauri-plugin-updater` with a signed manifest |
| S5-064 | P1 | 10 | M10.1 | Code-sign Windows binaries |
| S5-065 | P1 | 10 | M10.1 | Updater UX |
| S5-066 | P1 | 10 | M10.1 | Update channels |
| S5-067 | P1 | 10 | M10.1 | Rollback safety |
| S5-068 | P1 | 10 | M10.1 | Portable updater |
| S5-069 | P1 | 10 | M10.1 | Installer and uninstaller |
| S5-072 | P1 | 10 | M10.1 | Reproducible CI release pipeline |
| S5-073 | P1 | 10 | M10.1 | Software bill of materials and license notices |
| S5-074 | P1 | 10 | M10.1 | Release provenance |
| TR-M10 | P1 | 10 | M10.1 | No signed updater/release trust path |
| S5-098 | P1 | 10 | M10.2 | Automated security test suite |
| S5-099 | P1 | 10 | M10.2 | Manual threat-model review |
| S5-100 | P1 | 10 | M10.2 | Pre-release checklist |
| R6-085 | P1 | 10 | M10.2 | Performance acceptance run |
| R6-086 | P1 | 10 | M10.2 | Reliability soak |
| R6-087 | P1 | 10 | M10.2 | Test gate |
| TR-L1 | P2 | 10 | M10.2 | README screenshots, architecture diagram, data paths, troubleshooting, known issues |

---

# Appendices — verbatim source documents (full findings, evidence links, fixes, done criteria)
Each appendix is the complete, unmodified earlier document. Headings are demoted by one level so they nest under this file. Search by task ID.


# Appendix A — Part 1 — Playback end to end

> Source file: `Meld-Desktop-perfect-port-plan-part-1-playback.md`

## Meld Desktop “Perfect Port” Plan — Part 1: Playing a Song End to End

**Scope:** everything from clicking a song to hearing, seeking, caching, downloading, recovering, recording history, and moving to the next song.  
**Compared:** Desktop `main` (`e7194c2e`), Desktop `v0.1.8` (`5f1aaf53`), and Meld `v0.9.2` (`dc7a2722`).

### Important correction and refined conclusion

Desktop is not a single-client player. It already tries seven hardcoded YouTube clients (VISIONOS, two ANDROID_VR variants, TVHTML5, two IOS variants, and WEB_CREATOR). The real gap is that it accepts only a directly usable audio `url`. It discards `signatureCipher`/`cipher`, has no dynamic player configuration or `n` transformation, does not propagate client-specific stream headers, has no PoToken path, and does not remember/reject a client that produced a bad stream.

That is materially weaker than Meld 0.9.2's InnerTubeX path even though both use a client cascade.

## 1. How each app plays a song today

### Reference Meld 0.9.2

1. UI creates/selects a Media3 `MediaItem` in a typed queue.
2. `MusicService` creates a resolving `DataSource`.
3. It checks, in order, local/download cache, player cache, an unexpired in-memory stream URL, optional Qobuz, and then YouTube resolution.
4. `InnerTubeXPlayer` supplies content hints such as uploaded/explicit status and asks `InnerTubeExtractor` for a compatible stream.
5. The extractor owns client fallback, remote/embedded player configuration, cipher handling, and optional PoToken supply.
6. The result includes URL, required request headers, source client, expiry, range requirements, codecs, bitrate, content length, sample rate, loudness, and playback-tracking URLs.
7. Media3 receives a `DataSpec` carrying the URL, headers, cache key, and bounded-range policy.
8. Playback reads through Media3 cache rather than starting a second independent full-file request.
9. Format/loudness metadata is persisted; normalization/equalizer/silence processors can operate in the audio graph.
10. On 403/410 or other stream rejection, Meld invalidates the URL, remembers the failed client for five minutes, optionally refreshes cipher configuration, preserves index/position/play state, and re-prepares with a retry limit.

### Meld Desktop v0.1.8

1. React `playItem` modifies queue/index before stream resolution finishes.
2. It invokes Rust `ytm_player(videoId, playlistId, audioQuality)`.
3. Rust first checks a complete local player-cache row/file for the requested quality.
4. Otherwise it posts `/player` using up to seven hardcoded clients.
5. For each response it accepts only audio formats with a plain `url`, rejects ciphered formats and auto-dubbed tracks, sorts by bitrate/quality, and returns the first client with a direct URL.
6. Rust starts a second, background full-file download into player cache.
7. The frontend gives the remote URL directly to WebView2's HTML `<audio>` element, which performs its own network request.
8. HTML audio events update React state, history/playtime, queue advancement, and UI.
9. v0.1.8 does not recover an expired/rejected stream automatically.

### Desktop main

Main keeps the seven-client direct-URL cascade and adds request timeouts, stalled-cache detection, safer credentials/CSP, and expiry refresh. But it removes playlist context, quality selection, measured playtime, persistent playback, and other v0.1.8 behavior. Its audio-source effect is keyed only by song ID, creating same-song replay/source-refresh edge cases.

## 2. Target Windows playback architecture

For a robust Windows port without Electron or a localhost server:

1. Keep React as UI only.
2. Introduce one Rust `PlaybackCoordinator` state machine.
3. Expose a typed `prepare(track, context, quality)` operation that returns a stable playback session ID—not a raw URL.
4. Implement a Tauri custom media protocol such as `meld-media://session/{id}` (or a native Windows Media Foundation backend) that supports HTTP Range requests.
5. The Rust media broker should apply source-specific headers, validate hosts/redirects, refresh URLs, read through cache, enforce quotas, and tee bytes into cache while serving playback.
6. Keep resolver plugins behind one interface: Local, Download, Player Cache, Qobuz (optional), and YouTube.
7. Port or reuse a maintained InnerTubeX-compatible Rust component only if its license and API behavior are appropriate; do not copy Android-only WebView code blindly.
8. Send structured state/events to React: Preparing, Buffering, Playing, Paused, Recovering, Failed, Ended.
9. Integrate Windows SMTC/media keys and taskbar controls with the same coordinator.
10. Make queue/history/scrobble commits occur on confirmed playback milestones, not merely on click or URL resolution.

## 3. Complete findings and fixes

Legend: **P0** release blocker, **P1** core playback correctness, **P2** parity/reliability, **P3** polish.

### A. Resolver and YouTube player requests

#### PLAY-001 — P0 — Reconcile the two playback branches
**Found:** v0.1.8 has quality, playlist context, persistent playback, taskbar controls, and measured playtime; main has security/timeouts/expiry fixes but removes those features.  
**Fix:** create one branch from v0.1.8, merge hardening, and keep a per-feature reconciliation checklist.  
**Done when:** release tag is an ancestor of main and all playback contract tests run against one implementation.

#### PLAY-002 — P1 — Direct-URL-only extraction
**Found:** formats containing `signatureCipher` or `cipher` are always discarded.  
**Fix:** use a maintained extractor with dynamic player configuration and legal signature/`n` transformation support; keep DRM and ad-bypass explicitly out of scope.  
**Done when:** supported ciphered, uploaded, restricted, and plain-URL fixtures resolve through one tested interface.

#### PLAY-003 — P1 — No dynamic player configuration
**Found:** client versions/configuration are hardcoded in Rust. Upstream uses remote configuration with ETag/cache and embedded fallback.  
**Fix:** add a signed/versioned remote client/player-config registry with cached last-known-good and embedded fallback.  
**Done when:** a stale config can refresh without releasing a new binary and cannot be replaced by an untrusted payload.

#### PLAY-004 — P1 — Hardcoded client versions age silently
**Found:** versions and device strings are dated constants.  
**Fix:** move them to the validated registry, record config age, and expose diagnostics.  
**Done when:** the app warns internally when last-known-good config exceeds a chosen age.

#### PLAY-005 — P1 — No failed-client memory
**Found:** every resolution retries clients in the same order; a client producing an immediate 403 remains first next time.  
**Fix:** remember failed client/video pairs with a short TTL, like upstream's five-minute exclusion set.  
**Done when:** immediate stream rejection retries with the next client and subsequent attempts temporarily avoid the failed one.

#### PLAY-006 — P1 — Only the last resolver failure is returned
**Found:** prior client failures are collected but the final error displays only the last string.  
**Fix:** return a redacted structured diagnostic containing each attempted client, stage, status, playability reason, and rejection category.  
**Done when:** users see a concise message and can copy a safe detailed report.

#### PLAY-007 — P1 — Missing content hints
**Found:** Desktop does not pass uploaded/explicit/podcast/live content hints to extraction.  
**Fix:** persist these flags and feed them into resolver strategy selection.  
**Done when:** uploaded and restricted-track fixtures choose suitable authenticated clients.

#### PLAY-008 — P1 — Main dropped playlist context
**Found:** v0.1.8 sends `playlistId` to `/player`; main always sends null.  
**Fix:** retain queue/source context through prepare and resolver requests.  
**Done when:** album, playlist, radio, podcast, uploaded, and standalone playback tests preserve context.

#### PLAY-009 — P1 — No client playback nonce
**Found:** upstream generates a client playback nonce; Desktop does not.  
**Fix:** add required request/session nonce fields through the extractor abstraction.  
**Done when:** resolver request fixtures match the selected client's current contract.

#### PLAY-010 — P1 — No PoToken capability
**Found:** Desktop has no optional token-provider interface.  
**Fix:** design a token-provider plugin with strict timeout/cancellation and fallback to clients that do not require it. Do not silently make login mandatory.  
**Done when:** token-required responses either resolve through an approved provider or fail with an explicit reason.

#### PLAY-011 — P1 — Client-specific stream headers are discarded
**Found:** Desktop returns URL/mime/bitrate only. Upstream propagates request headers with the stream.  
**Fix:** include validated headers in `ResolvedStream` and apply them in the Rust media broker. Never expose cookies/tokens to React.  
**Done when:** header-dependent streams play and secrets never enter frontend state/logs.

#### PLAY-012 — P1 — Browser request identity differs from resolver client
**Found:** Rust resolves as VisionOS/Android/iOS/TV, but WebView2 fetches the audio using its own browser headers.  
**Fix:** fetch through the Rust media protocol using the exact resolver-supplied headers.  
**Done when:** the same client identity is used from player request through byte fetch.

#### PLAY-013 — P1 — No stream-host allowlist
**Found:** a URL from player JSON is fetched by Rust without validating HTTPS/host.  
**Fix:** require HTTPS and approved Google media hosts, validate every redirect, reject loopback/private/link-local destinations, and maintain separate allowlists per provider.  
**Done when:** SSRF/redirect tests cannot reach local or arbitrary hosts.

#### PLAY-014 — P1 — Region and language are hardcoded to US/en
**Found:** every player request sends `gl: US`, `hl: en`.  
**Fix:** use user/account locale with a stable fallback; keep locale separate from UI language.  
**Done when:** regional catalog/restriction behavior matches the signed-in account where possible.

#### PLAY-015 — P2 — Playability errors lack taxonomy
**Found:** every non-OK status becomes a generic string.  
**Fix:** classify sign-in required, age restriction, region restriction, unavailable, members-only, transient, rate-limited, and extractor failure.  
**Done when:** each category has a useful action and retry policy.

#### PLAY-016 — P2 — No resolver prewarm
**Found:** first play performs all initialization on demand.  
**Fix:** prewarm configuration and safe resolver metadata after startup without resolving a track.  
**Done when:** cold-start resolution latency is measured and reduced without background account activity.

#### PLAY-017 — P2 — No resolver metrics
**Found:** there is no measurement of client success rate, stage latency, cache hits, or recovery.  
**Fix:** add local structured metrics with privacy-safe opt-in diagnostics export.  
**Done when:** a report can show why startup/playback is slow without exposing IDs, cookies, or URLs.

### B. Format selection and metadata

#### PLAY-018 — P1 — Quality selection is bitrate-only
**Found:** Desktop chooses highest/lowest bitrate with a small WebM bonus.  
**Fix:** score by supported codec, container, bitrate, sample rate, channels, source stability, and user policy.  
**Done when:** table-driven fixtures choose a decodable and policy-correct format.

#### PLAY-019 — P1 — No decoder capability check
**Found:** any `audio/*` direct format may win.  
**Fix:** maintain a WebView2/native decoder capability matrix or move decoding to a controlled native engine.  
**Done when:** unsupported codec fixtures are skipped before playback.

#### PLAY-020 — P1 — Auto quality is not automatic
**Found:** v0.1.8's Auto always behaves like High because metered-network detection is absent.  
**Fix:** use Windows network cost APIs and allow user overrides for metered, battery saver, and download quality.  
**Done when:** Auto changes policy on simulated metered/unmetered networks.

#### PLAY-021 — P1 — Main removed quality support entirely
**Found:** main no longer passes or stores quality.  
**Fix:** port the quality contract onto the hardened resolver rather than deleting it.  
**Done when:** playback/download/cache quality is visible and tested in one branch.

#### PLAY-022 — P1 — No persisted format metadata
**Found:** Desktop does not persist itag, codec, content length, sample rate, channel count, loudness, or source client.  
**Fix:** add a versioned `formats` table and store only non-expiring metadata; never persist raw stream URLs.  
**Done when:** media-info UI and cache validation use the recorded format.

#### PLAY-023 — P1 — Cached media is reported as `audio/mpeg`
**Found:** cached files may contain Opus/WebM or AAC/MP4 but the payload hardcodes MPEG.  
**Fix:** persist actual MIME/container and use a matching extension or content-type response.  
**Done when:** cache playback reports and serves the original format correctly.

#### PLAY-024 — P2 — Weak original-language/audio-track selection
**Found:** Desktop rejects auto-dubbed tracks but does not model multiple original/default audio tracks or language preference.  
**Fix:** parse audio-track metadata and prefer original/default according to user locale, with a manual override where available.  
**Done when:** multi-audio fixtures consistently choose the intended track.

#### PLAY-025 — P2 — No loudness metadata or normalization
**Found:** loudness/perceptual loudness is discarded.  
**Fix:** persist loudness and implement a tested normalization processor in the native audio path.  
**Done when:** normalization gain is deterministic and clipping-protected.

#### PLAY-026 — P2 — No content-length-aware seeking policy
**Found:** only URL/mime/bitrate/expiry reach the frontend.  
**Fix:** include content length and range capability in the stream session.  
**Done when:** seeking works on long/unknown-length files and bounded-range streams.

### C. Transport, WebView2, ranges, and recovery

#### PLAY-027 — P0 — Raw remote URL is handed to HTML audio
**Found:** React sets `<audio src>` directly, so Rust cannot reliably apply headers, inspect ranges, refresh midstream, or unify caching.  
**Fix:** introduce a Rust-backed Tauri media protocol or native player.  
**Done when:** React receives only a session URI and all media bytes pass through the coordinator.

#### PLAY-028 — P1 — Playback and cache download the same song twice
**Found:** HTML audio fetches the stream while Rust separately downloads the full file into player cache.  
**Fix:** use read-through/tee caching: one upstream byte stream serves playback and cache.  
**Done when:** network instrumentation shows no duplicate full download for normal playback.

#### PLAY-029 — P1 — No bounded/chunked range strategy
**Found:** Desktop ignores resolver range requirements.  
**Fix:** support normal ranges, bounded ranges, chunk progression, and transparent re-resolution.  
**Done when:** range-required fixtures seek/play without 403 or premature EOF.

#### PLAY-030 — P1 — Immediate 403/410 does not trigger client fallback
**Found:** main refreshes only when elapsed time has reached `expiresInSeconds`; a newly issued bad URL falls through as a generic audio error.  
**Fix:** classify HTTP/media failures; invalidate immediately on 403/410, mark the source client failed, and re-resolve while preserving position.  
**Done when:** an immediate rejection retries another client automatically.

#### PLAY-031 — P1 — v0.1.8 has no expiry recovery
**Found:** expired streams only show an audio-element failure or auto-skip.  
**Fix:** merge main's refresh behavior, then expand it to rejection-aware recovery.  
**Done when:** pausing beyond expiry resumes at the same position.

#### PLAY-032 — P1 — No expiry safety margin
**Found:** a stream can be accepted seconds before expiry and fail during startup/seek.  
**Fix:** subtract a safety margin and estimate whether the requested operation can complete; refresh before resume/large seek.  
**Done when:** near-expiry sessions are proactively replaced.

#### PLAY-033 — P1 — No retry limit/state visible to UI
**Found:** frontend notices are strings; there is no Recovering state or attempt count.  
**Fix:** model bounded retries with reason, attempt, and next action.  
**Done when:** UI distinguishes buffering, recovering, final failure, and auto-skip.

#### PLAY-034 — P1 — Queue is committed before preparation succeeds
**Found:** `playItem` updates queue/index before `ytm_player` returns. If resolution fails, the previous audio may continue while queue UI points at another item.  
**Fix:** maintain `pendingPlayback`; atomically commit player/queue only after prepare succeeds, or explicitly stop the old session.  
**Done when:** failed preparation cannot desynchronize audible track, queue index, and displayed metadata.

#### PLAY-035 — P1 — Main's effect is keyed only by song ID
**Found:** same-song replay or a same-ID payload replacement may not re-run source initialization.  
**Fix:** use a unique playback session/generation ID. Keep recovery methods explicit rather than suppressing all same-ID changes.  
**Done when:** replaying the same song restarts predictably and refreshed URLs preserve position.

#### PLAY-036 — P1 — v0.1.8 quality changes do not reload current playback
**Found:** saving Audio quality changes only the setting; the current song remains on its old stream.  
**Fix:** offer “apply next track” or safely re-prepare current track at the same position.  
**Done when:** behavior is explicit and tested.

#### PLAY-037 — P1 — Browser errors lack HTTP status/client information
**Found:** HTML audio reports only that it could not read the URL.  
**Fix:** move transport to Rust and return structured source/status/stage diagnostics.  
**Done when:** 403, timeout, decode error, CORS, unsupported codec, and missing file are distinguishable.

#### PLAY-038 — P2 — No seekability model
**Found:** seek slider assumes duration/seek behavior from HTML audio.  
**Fix:** expose duration, buffered ranges, seekable ranges, and live/unknown-length flags.  
**Done when:** slider disables or constrains itself correctly.

#### PLAY-039 — P2 — No gapless pipeline
**Found:** each song is assigned to one HTML audio element after resolution.  
**Fix:** use a player capable of pre-preparation and gapless transitions; keep crossfade optional and separate.  
**Done when:** consecutive compatible tracks have measured near-zero unintended gap.

#### PLAY-040 — P2 — No Windows audio-device lifecycle
**Found:** there is no handling for device removal/default-device changes beyond WebView behavior.  
**Fix:** add device-change monitoring and recover/rebind while preserving playback state.  
**Done when:** switching headphones/output does not strand playback.

### D. Player cache and explicit downloads

#### PLAY-041 — P0 — No cache quota or eviction
**Found:** every played song can spawn a full-file cache download; no size/age limit exists.  
**Fix:** configurable byte quota plus LRU eviction, pin downloaded items, and show usage.  
**Done when:** stress tests cannot exceed quota beyond a bounded in-progress allowance.

#### PLAY-042 — P0 — Unlimited concurrent player-cache jobs
**Found:** rapid skipping can spawn one full download per distinct song.  
**Fix:** bounded scheduler (for example one active playback fill plus one low-priority prefetch), cancellation, and backpressure.  
**Done when:** rapid skipping cannot exhaust sockets, disk, or memory.

#### PLAY-043 — P1 — Player-cache jobs survive skip/close
**Found:** closing or changing tracks does not cancel the background full download.  
**Fix:** tie cache-fill cancellation to session lifecycle unless explicitly retained as prefetch.  
**Done when:** abandoned sessions release network/file handles promptly.

#### PLAY-044 — P1 — No final byte-count validation
**Found:** a clean premature EOF is renamed and treated as complete; cache lookup only checks `bytes > 0` and file existence.  
**Fix:** compare bytes with content length/content-range where known; otherwise validate container finalization/decoder probe before commit.  
**Done when:** truncated fixtures never become completed cache rows.

#### PLAY-045 — P1 — No content-type/container validation
**Found:** a 200 HTML/error body can be cached if the server/redirect does not use an error status.  
**Fix:** validate content type, magic bytes/container structure, and expected format.  
**Done when:** HTML/JSON/error fixtures are rejected.

#### PLAY-046 — P1 — Redirect targets are not revalidated
**Found:** reqwest follows redirects without a media-host policy.  
**Fix:** custom redirect policy that validates every hop and limits hop count.  
**Done when:** redirect-to-private-host and redirect-loop tests fail safely.

#### PLAY-047 — P1 — No pre-download disk-space check
**Found:** cache/download can fill the drive.  
**Fix:** estimate required size, preserve a safety reserve, and stop gracefully when space drops.  
**Done when:** low-disk tests retain a valid partial state and clear error.

#### PLAY-048 — P1 — Generic `.audio` extension and lost format identity
**Found:** all media uses a generic extension.  
**Fix:** store container/MIME metadata and use internal content-addressed naming; extension is optional if the custom protocol serves correct type.  
**Done when:** local playback does not depend on sniffing.

#### PLAY-049 — P1 — Quality cache schema cannot hold multiple qualities
**Found:** v0.1.8 queries by `(song_id, quality)` but `song_id` alone is the primary key and all qualities use the same path.  
**Fix:** choose one policy: either one cache entry per song that is invalidated/replaced safely, or composite primary key `(song_id, quality, source)` with distinct paths.  
**Done when:** switching quality has deterministic storage behavior.

#### PLAY-050 — P1 — Windows replacement rename can fail
**Found:** re-download/quality change renames `.part` onto an existing final path without a Windows-safe replace sequence.  
**Fix:** close readers, use unique temp files, atomically replace with rollback, and update DB only after success.  
**Done when:** repeated download and quality-switch tests pass on Windows.

#### PLAY-051 — P1 — Flush is not durability
**Found:** files call `flush()` but not `sync_all()` before rename/DB completion.  
**Fix:** sync file, atomically rename, optionally sync parent directory where supported, then commit DB state.  
**Done when:** fault-injection tests never mark incomplete bytes completed.

#### PLAY-052 — P1 — v0.1.8 resume does not validate `Content-Range`
**Found:** any 206 is appended; start/end/total are not checked.  
**Fix:** require `Content-Range` start equals local length, validate total and ETag/Last-Modified identity, otherwise restart.  
**Done when:** wrong-range fixtures cannot corrupt files.

#### PLAY-053 — P1 — Resume can combine bytes from different stream formats
**Found:** partial file identity does not record itag/quality/ETag/source. A new resolver response may produce another format before append.  
**Fix:** persist a partial-download manifest and only resume an identical representation.  
**Done when:** changed-format/quality fixtures restart rather than append.

#### PLAY-054 — P1 — v0.1.8 resume wastes a request
**Found:** when a range request is not resumable, the first response is discarded and a second GET starts from zero.  
**Fix:** if the first response is 200, reuse that body as the restart stream after truncating the partial file.  
**Done when:** fallback-to-full performs one request.

#### PLAY-055 — P1 — Main removed resume entirely
**Found:** hardening fixed cleanup but regressed partial resume.  
**Fix:** port a corrected manifest-based resume implementation onto hardened main.  
**Done when:** cancel/restart/app-restart resume tests pass.

#### PLAY-056 — P1 — v0.1.8 can leak an “active download” lock on early return
**Found:** cancellation-map entry is inserted before fallible directory/DB initialization; v0.1.8 has no guard for every early `?`.  
**Fix:** retain main's RAII `ActiveDownloadGuard` and make initialization transactional.  
**Done when:** injected early failures allow an immediate retry.

#### PLAY-057 — P1 — SQLite background writers lack a concurrency policy
**Found:** spawned cache tasks open independent connections; schema setup does not establish WAL/busy timeout for all connections.  
**Fix:** use a database pool/actor, WAL where appropriate, busy timeout, and short transactions.  
**Done when:** concurrent playback/cache/history/download stress has no `database is locked` losses.

#### PLAY-058 — P1 — Player-cache errors are silent
**Found:** cache task failures delete `.part` but do not expose reason/state.  
**Fix:** persist cache-job status and emit diagnostics; do not disturb playback for optional-cache failure.  
**Done when:** users can see storage/cache problems without generic playback errors.

#### PLAY-059 — P2 — No integrity fingerprint
**Found:** completed files are trusted by row + size.  
**Fix:** store a fast hash or container fingerprint after completion and verify on suspicious reads/startup reconciliation.  
**Done when:** modified files are detected and repaired/removed.

#### PLAY-060 — P2 — No startup file/DB reconciliation
**Found:** missing/orphaned cache files and stale rows can accumulate.  
**Fix:** bounded startup/background reconciliation for rows, final files, and temp files.  
**Done when:** crash-created inconsistencies self-heal.

#### PLAY-061 — P2 — No separate playback/download quality policy
**Found:** v0.1.8 passes current audio quality into explicit download.  
**Fix:** provide independent streaming, Wi-Fi download, metered download, and Qobuz policies.  
**Done when:** changing playback quality does not unexpectedly alter download policy.

#### PLAY-062 — P2 — Lyrics/artwork work delays download completion
**Found:** after audio rename, the command waits for artwork and all enabled lyrics before marking completed.  
**Fix:** commit audio completion first; schedule optional artwork/lyrics enrichment independently with their own statuses.  
**Done when:** provider timeout cannot make a valid audio download look failed/incomplete.

### E. Frontend state, queue, history, and UX

#### PLAY-063 — P1 — History begins before confirmed audible playback
**Found:** history/playtime setup occurs after resolution/setPlayer, before audio `play()` is confirmed; main adds history during prepare. Failed playback can be counted.  
**Fix:** add history only after a confirmed Playing state and threshold; store attempts separately for diagnostics.  
**Done when:** resolve/decode/autoplay failures do not increment plays.

#### PLAY-064 — P1 — No single playback state machine
**Found:** booleans and refs (`player`, `isPlaying`, queue index, pending requests, resume refs) can represent contradictory states.  
**Fix:** reducer/state machine with explicit transitions and session IDs.  
**Done when:** illegal transitions are impossible/tested.

#### PLAY-065 — P1 — Main and v0.1.8 use different stale-request mechanisms
**Found:** main uses `playSeqRef`; v0.1.8 uses another request-generation flow.  
**Fix:** move cancellation/generation into `PlaybackCoordinator`, cancel network work, and ignore stale completions at one boundary.  
**Done when:** rapid 100-item clicking always leaves the final requested item active with no leaked jobs.

#### PLAY-066 — P1 — Auto-skip may skip recoverable errors
**Found:** generic audio error can immediately advance when enabled.  
**Fix:** exhaust bounded same-track recovery first; only then auto-skip with a logged final reason.  
**Done when:** expired/bad-client streams recover instead of skipping.

#### PLAY-067 — P1 — Playback loading/buffering is not modeled clearly
**Found:** users mostly get a notice string while old audio may continue.  
**Fix:** show Preparing/Buffering/Recovering per pending session and retain old-track identity until commit.  
**Done when:** UI always identifies what is audible vs pending.

#### PLAY-068 — P1 — `timeupdate` rerenders the monolithic app
**Found:** playback seconds update React state several times per second in a 1,800–2,200-line root component.  
**Fix:** isolate player store/component; throttle display updates; keep high-frequency position outside global render.  
**Done when:** profiling large libraries shows stable frame time.

#### PLAY-069 — P1 — Persisted playback format is unversioned localStorage
**Found:** v0.1.8 stores queue/playback JSON in localStorage without an explicit schema version/migration.  
**Fix:** version the payload, validate it, cap size, and migrate/clear safely. Prefer backend persistence for one source of truth.  
**Done when:** corrupt/old payload tests cannot prevent startup.

#### PLAY-070 — P1 — Playback persistence and stream persistence are mixed conceptually
**Found:** queue/item/position are valid to persist, raw expiring URLs are not.  
**Fix:** persist only stable track/context/session state; always resolve a fresh stream on restore.  
**Done when:** restore never reuses an expired URL.

#### PLAY-071 — P1 — No robust same-song replay contract
**Found:** behavior differs by branch/effect dependencies.  
**Fix:** define actions: Resume, Restart current, Replay from queue, Re-resolve at same position. Each creates or updates a session deliberately.  
**Done when:** each action has unit/integration tests.

#### PLAY-072 — P2 — Position/duration source can be inaccurate
**Found:** cached payload duration may be zero and UI depends on HTML metadata.  
**Fix:** reconcile source metadata, container duration, and player duration; prefer validated player duration for seeking.  
**Done when:** 0:00 and unknown-duration cases behave consistently.

#### PLAY-073 — P2 — No buffered-range UI
**Found:** seek UI shows current/duration only.  
**Fix:** expose buffered segments and cache/download state.  
**Done when:** users can distinguish buffered vs unavailable seek regions.

#### PLAY-074 — P2 — Playback errors are not copyable/redacted reports
**Found:** upstream added detailed copyable playback reports; Desktop uses transient notices.  
**Fix:** error drawer with safe details, retry, change source/version, report, and copy.  
**Done when:** report contains no cookies, tokens, full signed URLs, emails, or local paths.

#### PLAY-075 — P2 — Queue continuation and stream preparation are coupled in UI
**Found:** React fetches/extends queues and resolves playback in the same large component.  
**Fix:** separate QueueCoordinator from PlaybackCoordinator with an atomic handoff.  
**Done when:** queue load failures do not corrupt current playback.

#### PLAY-076 — P2 — No preload contract
**Found:** Desktop full-caches in background rather than preparing only enough of the next track.  
**Fix:** bounded next-track resolver/initial-chunk preload respecting network and cache policy.  
**Done when:** next-track startup improves without downloading abandoned queues.

#### PLAY-077 — P2 — Playback speed support is branch-only and HTML-based
**Found:** v0.1.8 changes HTML playbackRate/pitch preservation; main removes it.  
**Fix:** restore on the unified branch and verify WebView2/native behavior for rate, pitch, seeking, and podcasts.  
**Done when:** speed persists per policy and audio remains stable.

#### PLAY-078 — P2 — No per-podcast resume model
**Found:** upstream stores episode position; Desktop's generic session restore is not equivalent.  
**Fix:** persist episode progress periodically and mark completion thresholds.  
**Done when:** each episode resumes independently across restarts.

#### PLAY-079 — P2 — Windows media integration is incomplete/regressed
**Found:** v0.1.8 has taskbar controls; main deletes them; neither is a complete SMTC integration.  
**Fix:** restore taskbar support and add Windows SMTC metadata, play/pause/next/previous/seek, media keys, lock-screen controls, and state sync.  
**Done when:** all external controls operate through the same state machine.

#### PLAY-080 — P2 — No audio focus/communications policy
**Found:** desktop relies on browser/system defaults.  
**Fix:** define behavior for sleep, lock, communication ducking, exclusive devices, and session interruptions.  
**Done when:** Windows lifecycle tests cover these transitions.

### F. Audio processing and parity

#### PLAY-081 — P2 — No real crossfade
**Fix:** implement only after the core native audio graph is stable; prebuffer next track and handle repeat/shuffle/seek/error edges.  
**Done when:** measured overlap follows the setting and never double-counts history.

#### PLAY-082 — P2 — No silence skipping
**Fix:** add a tested PCM processor with conservative thresholds and podcast/music policy.  
**Done when:** it skips silence without clipping quiet intros or breaking seeking.

#### PLAY-083 — P2 — No equalizer graph
**Found:** v0.1.8 backend allows equalizer-related setting keys, but there is no complete exposed processing path.  
**Fix:** native multiband processor, presets, clipping prevention, bypass, and device/sample-rate tests.  
**Done when:** settings audibly affect output and survive format/device changes.

#### PLAY-084 — P2 — No normalization processor
**Fix:** use source loudness metadata where available and a safe fallback analyzer; apply gain before limiter.  
**Done when:** reference tracks meet target loudness without clipping.

#### PLAY-085 — P2 — No gapless/crossfade compatibility matrix
**Fix:** define what happens for local/YouTube/Qobuz, codec changes, podcasts, repeat one, manual seek, and errors.  
**Done when:** automated transition tests cover every pair.

#### PLAY-086 — P3 — No output/codec diagnostics
**Fix:** media-info panel showing provider, client, codec, bitrate, sample rate, channels, normalization gain, cache source, and quality—never signed URL.  
**Done when:** support can diagnose “bad quality” reports without logs.

### G. Testing and release gates for playback

#### PLAY-087 — P0 — No end-to-end playback CI
**Fix:** Windows test harness with a mock InnerTube/media server, deterministic Range/403/expiry/stall fixtures, WebView/native startup smoke, and cache/download assertions.  
**Done when:** every PR runs the matrix.

#### PLAY-088 — P1 — Resolver tests cover too little
**Found:** Desktop has format-selection unit tests but not client fallback, header propagation, status taxonomy, expiry, redirects, or malformed responses.  
**Fix:** table-driven fixtures and property/fuzz tests for JSON parsing.  
**Done when:** malformed upstream JSON cannot panic or select unsafe URLs.

#### PLAY-089 — P1 — No fault-injection tests
**Fix:** inject network stalls, partial EOF, disk full, permission denied, DB locked, app crash, power-loss point, corrupt cache, wrong range, and rapid cancellation.  
**Done when:** no fixture produces a false completed state or stuck active lock.

#### PLAY-090 — P1 — No real Windows replacement/locking tests
**Fix:** run file replace, open-file, antivirus-delay, and long-path tests on Windows CI.  
**Done when:** cache/download finalization is atomic under Windows semantics.

#### PLAY-091 — P1 — No branch/version contract test
**Fix:** CI verifies package/Cargo/Tauri/UI/tag versions and that tagged source is on main.  
**Done when:** release workflow refuses divergent tags.

#### PLAY-092 — P1 — No playback security tests
**Fix:** SSRF, redirect, hostile headers, oversized content, decompression, path traversal, log-redaction, and token-leak tests.  
**Done when:** generated reports and frontend events contain no secrets.

#### PLAY-093 — P2 — No long-session soak test
**Fix:** 24-hour mocked queue with seeks, pauses beyond expiry, device changes, skips, cache pressure, and intermittent network.  
**Done when:** memory, tasks, handles, DB size, and cache remain bounded.

#### PLAY-094 — P2 — No performance budgets
**Fix:** budgets for cold prepare, warm prepare, cache hit, next-track gap, CPU, memory, and disk writes.  
**Done when:** CI tracks regressions.

## 4. Recommended implementation order

### Milestone 1 — Unified safe baseline

- PLAY-001, 021, 031, 035, 055, 056, 091.
- Merge features and hardening before adding anything new.
- Preserve v0.1.8 taskbar, quality, playtime, queue/session, podcast, and provider behavior.

### Milestone 2 — Playback coordinator and media protocol

- PLAY-027, 034, 064, 065, 067, 075.
- Build typed Rust state machine and session-based protocol.
- React stops receiving raw media URLs.

### Milestone 3 — Robust resolver

- PLAY-002 through 017, 030–033.
- Dynamic client/config, headers, failure memory, structured errors, safe host policy.

### Milestone 4 — One-stream cache/download engine

- PLAY-028, 041–062.
- Quotas, scheduler, read-through cache, verified ranges/resume, atomic files, pooled DB.

### Milestone 5 — Format/audio parity

- PLAY-018–026 and 077–086.
- Quality, metadata, normalization, speed, podcast position, SMTC, then DSP.

### Milestone 6 — Verification

- PLAY-087–094.
- No public release until Windows CI, fault injection, soak, and security tests pass.

## 5. “Perfect playback” acceptance definition

The playback layer is release-ready when all of the following are true:

- One canonical branch contains security fixes and every intentionally retained v0.1.8 feature.
- Clicking a song never desynchronizes audible audio, metadata, queue, or history.
- Plain, ciphered, uploaded, restricted, podcast, local, downloaded, cached, and optional Qobuz paths have explicit supported behavior.
- Resolver headers/client identity are preserved through byte transport.
- Expired/rejected streams recover at the same position with bounded retries and next-client fallback.
- Playback does not duplicate a full network request merely to cache.
- Cache/download storage is bounded, atomic, resumable, validated, and self-healing.
- No raw signed URL, account cookie, token, email, or local path reaches logs or React unnecessarily.
- Quality, codec, range, loudness, and format metadata are accurate.
- History/play counts begin only after verified playback thresholds.
- Windows SMTC/taskbar/media keys and in-app controls share one state machine.
- CI covers resolver fixtures, ranges, expiry, rejection, corruption, disk full, DB contention, rapid switching, restart, and long-session behavior.

This is the end of Part 1. Recommended Part 2: **queue creation, autoplay/radio, Spotify-to-YouTube matching, Home/Search source selection, playlist contexts, shuffle/repeat, and recommendation parity.**


# Appendix B — Part 2 — Queues, radio, Spotify matching, Home, Search

> Source file: `Meld-Desktop-perfect-port-plan-part-2-queues-spotify-home-search.md`

## Meld Desktop “Perfect Port” Plan — Part 2

### Queues, Autoplay/Radio, Spotify Matching, Recommendations, Home, and Search

**Compared:** Desktop `main` (`e7194c2e`), Desktop `v0.1.8` (`5f1aaf53`), Meld `v0.9.2` (`dc7a2722`), and the attached earlier audit.  
**Goal:** one coherent Windows app whose queue/source behavior matches Meld where useful and improves on the reference where its contracts are weak.

## 1. What I reused from the attached earlier audit

The earlier review was useful and did not disturb this pass. I independently verified these findings against the cloned source:

- Spotify playlist/liked-song playback bypasses the backend scorer and simply picks the first YouTube Music song search result.
- `loadHomeMore` shallow-copies the section array but mutates existing section objects and their `items` arrays.
- search/detail/library requests need latest-request or cancellation protection.
- asynchronous Tauri listener setup can leak under StrictMode cleanup timing.
- main has the same-song playback dependency problem described in Part 1.
- history can be written before confirmed playback.
- repeat preference does not roll back if persistence fails.
- canonical share URLs and pasted-URL classification are incorrect.
- Spotify startup status can say “authenticated” based only on token presence/expiry.
- the monolithic React/Rust structure and missing frontend tests remain serious risks.

Important branch correction: some statements in the older review describe `main`, while v0.1.8 already had playlist-vs-watch-next continuation typing, partial-download resume, audio quality, taskbar controls, playtime recording, and richer session behavior. Those features must be merged with hardening, not reimplemented from assumptions.

## 2. How queueing and Spotify differ today

### Reference Meld

- Every source is represented by a queue class with a stable contract: initial status, next page, optional full status, and source-level shuffle.
- Spotify playlist and Liked Songs queues preserve the visible order, selected index, API pagination, and raw API offsets.
- They resolve only the selected track and a few neighbors for fast startup, then resolve batches progressively.
- Spotify radio starts the seed immediately, builds recommendations lazily with a timeout/fallback, and resolves recommendation batches in parallel.
- One `SpotifyYouTubeMapper` owns memory cache, DB cache, fuzzy score, manual override, and reverse lookup.
- Spotify can power Home and Search; Spotify-only Home can suppress YouTube sections while local recent history remains.

### Desktop

- Queue state is several independent React values: items, index, continuation, shuffle, repeat, player, and loading refs.
- v0.1.8 records continuation kind; main deletes it and routes every queue continuation through watch-next.
- Spotify track playback/search/download uses a frontend helper that searches `artist + title` on YTM and picks the first song.
- The backend scorer exists only for the reverse YouTube→Spotify action used when adding a YouTube song to Spotify.
- Spotify playlist playback resolves one track, closes the Spotify screen, and starts a YouTube queue/radio rather than preserving the Spotify playlist.
- Home and user search remain YouTube-driven; Spotify is mainly a library/edit integration.

## 3. Actionable findings and fixes

Legend: **P0** blocker, **P1** core correctness/product identity, **P2** parity/reliability, **P3** polish.

### A. Canonical source and identity model

#### QUEUE-001 — P0 — Use one canonical branch
**Found:** queue continuation, persistence, quality, taskbar, and playtime behavior differ between main and v0.1.8.  
**Fix:** complete PLAY-001 first; Part 2 must target the unified branch.  
**Done when:** queue tests run against one implementation and release source equals main.

#### QUEUE-002 — P1 — Introduce a typed source identity
**Found:** `YtItem.id`, `videoId`, Spotify ID, playlist item UID, setVideoId, browseId, and local path are mixed through one loose object.  
**Fix:** define `TrackIdentity { canonicalId, youtubeVideoId?, spotifyId?, playlistItemUid?, localFileId? }`.  
**Done when:** queue operations never guess which ID a string represents.

#### QUEUE-003 — P1 — Give every queue entry a unique instance ID
**Found:** operations find the current item by song ID, which breaks legitimate duplicate occurrences.  
**Fix:** `QueueEntry { entryId: UUID, track, sourceContext }`; use `entryId` for reorder/remove/current.  
**Done when:** the same song can appear twice and each occurrence behaves independently.

#### QUEUE-004 — P1 — Preserve source context explicitly
**Found:** playlist ID, continuation type, visible sort/filter, radio endpoint, Spotify source, and local source are passed ad hoc.  
**Fix:** typed `QueueOrigin` variants: YouTubeWatchNext, YouTubePlaylist, SpotifyPlaylist, SpotifyLiked, SpotifyRadio, LocalList, Downloads, Search, Stats.  
**Done when:** every queue can serialize and resume its origin without string heuristics.

#### QUEUE-005 — P1 — Separate track metadata from source metadata
**Found:** changing Spotify→YouTube matches can overwrite which title/artwork/source the UI presents.  
**Fix:** retain Spotify display metadata and resolved YouTube playback metadata separately, with an explicit display policy.  
**Done when:** manual match changes audio source without silently replacing Spotify identity.

#### QUEUE-006 — P1 — Version queue persistence
**Found:** v0.1.8 localStorage payload is unversioned and embeds loose `YtItem` objects.  
**Fix:** backend-owned, schema-versioned queue/session document with migration and validation.  
**Done when:** old/corrupt queue state cannot break startup.

#### QUEUE-007 — P1 — Make queue state atomic
**Found:** items/index/continuation/player are separate React states and update in multiple renders.  
**Fix:** one reducer/state machine or Rust QueueCoordinator snapshot.  
**Done when:** no observable state can have index outside items or current metadata disagreeing with entry.

#### QUEUE-008 — P2 — Retain source titles and provenance
**Found:** queue UI largely holds items without a durable source title/provenance contract.  
**Fix:** queue snapshot includes source label, source URL/entity, generated/manual state, and provider.  
**Done when:** UI can show “From Spotify playlist X,” “YouTube radio,” or “Local playlist Y.”

### B. Spotify→YouTube matching

#### MATCH-001 — P0 — Remove the first-search-result matcher
**Found:** Spotify play/download uses `ytm_search` then first item of kind song.  
**Fix:** route every Spotify→YouTube action through one backend `resolve_spotify_track`.  
**Done when:** no frontend code performs matching or picks the first result.

#### MATCH-002 — P0 — One resolver for all call sites
**Found:** playback, playlist download, reverse add-to-Spotify, manual override, and cache lookup use different paths.  
**Fix:** one `TrackMatcher` service with forward/reverse/override methods.  
**Done when:** playback, download, queue generation, and UI preview return the same match.

#### MATCH-003 — P1 — Persist Spotify ID on queue items
**Found:** a resolved YTM item can lose the original Spotify ID, preventing direct override/cache lookup.  
**Fix:** carry both IDs through queue, history, download, and media info.  
**Done when:** every Spotify-origin play can open “Change YouTube version.”

#### MATCH-004 — P1 — Check memory cache first
**Found:** Desktop has DB cache but no shared bounded in-memory forward-match cache.  
**Fix:** process-wide thread-safe LRU keyed by Spotify track ID and matcher version.  
**Done when:** repeated matches avoid DB/network and cache is bounded.

#### MATCH-005 — P1 — Check DB cache before search
**Found:** frontend first-result path ignores the existing `spotify_match` table.  
**Fix:** DB lookup before any network call; manual overrides always win.  
**Done when:** cached/manual matches are used by playback and bulk download.

#### MATCH-006 — P1 — Version automatic matches
**Found:** cached scores have no algorithm/config version.  
**Fix:** store matcher version, source metadata hash, chosen candidate metadata, and validation timestamp.  
**Done when:** algorithm upgrades can re-evaluate only automatic matches.

#### MATCH-007 — P1 — Preserve manual overrides forever unless user resets them
**Found:** SQL protects manual overrides, which is good; every path must honor it.  
**Fix:** enforce at service boundary and add reset/rematch action.  
**Done when:** automatic/background refresh cannot replace a manual choice.

#### MATCH-008 — P1 — Use multiple YouTube candidates
**Found:** first-result path evaluates one candidate.  
**Fix:** search summary plus filtered song search; evaluate a bounded candidate set.  
**Done when:** score, not response order, decides.

#### MATCH-009 — P1 — Normalize Unicode safely
**Found:** main improved normalization to preserve non-Latin scripts; keep it and add diacritic/transliteration policy without destroying originals.  
**Fix:** Unicode normalization, case folding, punctuation/whitespace handling, script-aware tokens.  
**Done when:** Arabic, CJK, Cyrillic, accented Latin, and mixed-script corpus tests pass.

#### MATCH-010 — P1 — Parse version markers instead of deleting them blindly
**Found:** Desktop strips remix/remaster phrases during normalization, which can make intentional variants indistinguishable.  
**Fix:** extract structured markers: live, remix, remaster year, acoustic, instrumental, karaoke, sped/slowed, edit, clean, explicit.  
**Done when:** intentional live/remix tracks match the same version and studio tracks penalize extras.

#### MATCH-011 — P1 — Improve title score
**Fix:** combine token similarity, bigrams, ordered tokens, exact normalized equality, and featuring/version structure.  
**Done when:** a curated mismatch corpus beats the existing scorer.

#### MATCH-012 — P1 — Improve artist score
**Found:** only one flattened artist string is compared.  
**Fix:** compare artist sets, aliases, featured artists, primary artist, and collaboration separators.  
**Done when:** multi-artist tracks do not lose to same-title wrong artists.

#### MATCH-013 — P1 — Add album score
**Found:** Desktop scorer ignores album.  
**Fix:** include album/release title with reduced weight and tolerate singles/compilations.  
**Done when:** album version helps disambiguate remasters and live releases.

#### MATCH-014 — P1 — Strengthen duration scoring
**Found:** coarse buckets can still accept long mismatches.  
**Fix:** ratio/absolute model with stricter limits for short tracks and tolerance for silence/video intros.  
**Done when:** covers, extended mixes, and videos are penalized appropriately.

#### MATCH-015 — P1 — Use explicit-state compatibility
**Found:** explicit/clean metadata is not in the score.  
**Fix:** strong penalty or rejection when Spotify and YTM explicit states conflict, unless unknown.  
**Done when:** explicit tracks do not silently resolve to clean edits.

#### MATCH-016 — P1 — Penalize videos, covers, karaoke, and unofficial uploads
**Fix:** structured variant/source penalties and preference for official song/audio types.  
**Done when:** studio audio wins over music video, cover, lyric video, and karaoke when available.

#### MATCH-017 — P1 — Add ISRC where available
**Found:** reference carries ISRC for Qobuz but YouTube search often lacks it; Desktop drops it entirely.  
**Fix:** persist Spotify ISRC and use any provider/catalog metadata that can validate it; do not fabricate YTM ISRC.  
**Done when:** deterministic metadata sources outrank fuzzy search.

#### MATCH-018 — P1 — Use a confidence band, not one permissive threshold
**Found:** both apps use a low 0.35 threshold.  
**Fix:** high confidence auto-accept, medium confidence user confirmation/soft fallback, low confidence no match.  
**Done when:** false positives drop on the evaluation corpus.

#### MATCH-019 — P1 — Store candidate explanations
**Fix:** persist component scores and rejection reasons for diagnostics/manual review.  
**Done when:** UI can explain “title 0.94, artist 1.0, duration +2s.”

#### MATCH-020 — P1 — Manual override preview must verify canonical YouTube metadata
**Found:** Desktop refetches metadata, which is good, but URL parsing is wrong.  
**Fix:** repair parser; show title, artists, album, duration, explicit, type, and thumbnail before confirm.  
**Done when:** invalid playlist/album URLs cannot be accepted as tracks.

#### MATCH-021 — P1 — Add “reset automatic match” and “mark no match”
**Fix:** user controls to clear override, retry, or permanently suppress a bad track.  
**Done when:** bulk jobs skip known-unmatchable tracks without repeated searches.

#### MATCH-022 — P1 — Match cache invalidation on metadata change
**Fix:** compare Spotify title/artists/duration/ISRC hash; keep manual overrides, re-evaluate automatic stale matches.  
**Done when:** edited/reissued Spotify metadata does not retain obsolete automatic matches.

#### MATCH-023 — P2 — Add negative cache with TTL
**Fix:** cache no-match/transient outcomes separately.  
**Done when:** repeated UI renders do not spam search, while transient failures retry later.

#### MATCH-024 — P2 — Batch resolver with bounded concurrency
**Found:** reference batches 10/20 in parallel; Desktop bulk download matches serially while holding UI workflow.  
**Fix:** bounded worker pool, cancellation, progress, per-track results, and rate-limit backoff.  
**Done when:** large playlists resolve quickly without rate-limit storms.

#### MATCH-025 — P2 — Matcher corpus and regression metrics
**Fix:** anonymized/public metadata fixture corpus of studio/live/remix/cover/non-Latin/explicit edge cases; track precision/recall and top-1 accuracy.  
**Done when:** matcher changes cannot merge without meeting quality thresholds.

#### MATCH-026 — P2 — Improve reverse YouTube→Spotify matching
**Found:** backend reverse scorer is better than forward playback but still title/artist/duration only and five candidates.  
**Fix:** reuse the same feature extraction/confidence model bidirectionally.  
**Done when:** add-to-Spotify and forward playback agree on identity.

#### MATCH-027 — P2 — Do not count matching searches in user history
**Fix:** use an incognito/background YTM search contract.  
**Done when:** automatic matching never appears in remote/local search history.

#### MATCH-028 — P2 — Separate transient API failure from no match
**Found:** bulk workflow increments “unmatched” for every caught exception.  
**Fix:** result enum: Matched, NoMatch, AuthExpired, RateLimited, Network, ContractChanged, Cancelled.  
**Done when:** retryable errors are not mislabeled as bad catalog matches.

### C. Spotify queue preservation and progressive resolution

#### QUEUE-009 — P0 — Spotify playlist play does not preserve the playlist
**Found:** Desktop resolves one track then calls `openItem`; queue becomes YTM watch-next/radio.  
**Fix:** implement SpotifyPlaylistQueue with source tracks, selected index, pagination, and progressive matching.  
**Done when:** next track follows the visible Spotify playlist order.

#### QUEUE-010 — P0 — Spotify Liked Songs play does not preserve Liked Songs
**Fix:** SpotifyLikedQueue with visible sort/order snapshot and progressive pagination.  
**Done when:** queue order matches what the user clicked.

#### QUEUE-011 — P1 — Fast-start window
**Fix:** resolve selected track plus two neighbors; start immediately; continue in background.  
**Done when:** large Spotify playlists start without resolving the whole list.

#### QUEUE-012 — P1 — Progressive batch resolution
**Fix:** resolve bounded batches as the player approaches the loaded tail.  
**Done when:** unresolved tracks never block current audio and skipped no-match entries preserve correct index mapping.

#### QUEUE-013 — P1 — Preserve API raw offsets
**Found:** filtered/local Spotify items can make filtered count differ from API offset.  
**Fix:** track raw fetched count separately from playable-track count, as reference does.  
**Done when:** pagination neither repeats nor skips after filtering.

#### QUEUE-014 — P1 — Preserve visible sorted order
**Fix:** when user searches/sorts/reverses a Spotify list, capture that exact source order or state clearly that play uses canonical order.  
**Done when:** selected index and following tracks match the visible list.

#### QUEUE-015 — P1 — Do not close source screen before preparation succeeds
**Found:** Spotify playlist closes before `openItem` succeeds.  
**Fix:** pending prepare UI; close only after queue commits.  
**Done when:** failed match leaves user in the playlist with retry/override actions.

#### QUEUE-016 — P1 — Preserve Spotify metadata in resolved entries
**Fix:** queue entry contains Spotify source + YouTube playback target.  
**Done when:** history/download/manual override retain both identities.

#### QUEUE-017 — P1 — Handle unmatchable entries without index drift
**Fix:** maintain source-index→resolved-entry mapping; selected target cannot silently shift to a neighbor.  
**Done when:** if the selected track fails, app reports it rather than playing another track at that numeric index.

#### QUEUE-018 — P1 — Full-status operation for shuffle-all
**Fix:** fetch all source pages, resolve in bounded batches, map selected source index, then shuffle remaining entries.  
**Done when:** shuffle covers the whole Spotify playlist, not only loaded tracks.

#### QUEUE-019 — P2 — Preload next match, not full audio file
**Fix:** resolve the next few Spotify→YouTube identities separately from audio prebuffer policy.  
**Done when:** matching latency is hidden without unbounded media downloads.

#### QUEUE-020 — P2 — Queue progress and partial failures
**Fix:** show “resolved X/Y,” skipped tracks, retry-all, and per-track manual fix.  
**Done when:** a 500-track playlist remains understandable and cancellable.

### D. YouTube queue continuation and context

#### QUEUE-021 — P0 — Main lost continuation type
**Found:** main routes playlist continuations through `ytm_queue_continuation`; v0.1.8 correctly tracked `next` vs `playlist`.  
**Fix:** restore typed continuation as part of `QueueOrigin`, not a loose string.  
**Done when:** playlists use playlist continuation and watch-next uses next continuation.

#### QUEUE-022 — P1 — Removing current track drops continuation
**Found:** `removeQueueItem` restarts with continuation null.  
**Fix:** retain origin and continuation when selecting replacement current entry.  
**Done when:** removing current from a paginated queue can still load later pages.

#### QUEUE-023 — P1 — Queue continuation always deduplicates by song ID
**Found:** it removes legitimate duplicate playlist occurrences even when duplicate prevention is off.  
**Fix:** dedupe continuation pages by source entry identity/setVideoId/page overlap, not global song ID.  
**Done when:** intentional duplicates survive while repeated API pages do not duplicate.

#### QUEUE-024 — P1 — Continuation merge races with user edits
**Found:** async continuation uses captured `queueItems` then writes a replacement list.  
**Fix:** coordinator transaction merges against current generation and aborts stale results.  
**Done when:** add/remove/reorder during load cannot be overwritten.

#### QUEUE-025 — P1 — Continuation loop needs a page cap
**Found:** changing empty continuation tokens can loop repeatedly.  
**Fix:** max pages per action, seen-token set, empty-page threshold.  
**Done when:** pathological fixtures terminate.

#### QUEUE-026 — P1 — Retry/backoff missing on Desktop continuation
**Fix:** bounded retry by failure category with Retry-After support.  
**Done when:** transient errors recover and contract errors stop quickly.

#### QUEUE-027 — P1 — Detail/playlist visible queue must retain continuation type
**Fix:** `Play all` and item play from album/playlist/details create a queue origin that contains current loaded items and correct continuation.  
**Done when:** playing from any list continues that list rather than switching to radio unexpectedly.

#### QUEUE-028 — P2 — Queue title is discarded
**Fix:** preserve playlist/album/radio title from queue payload.  
**Done when:** queue panel identifies its source.

#### QUEUE-029 — P2 — Continuation diagnostics
**Fix:** expose source, last token hash, page count, received/accepted items, and final reason without raw token.  
**Done when:** pagination bugs are diagnosable safely.

### E. Shuffle, repeat, play-next, duplicates, and editing

#### QUEUE-030 — P0 — Play Next is not guaranteed next under shuffle
**Found:** item is inserted after current, then the whole tail—including that item—is shuffled.  
**Fix:** reserve a manual “play-next lane” ahead of shuffled automatic items.  
**Done when:** Play Next always plays next.

#### QUEUE-031 — P0 — Selected “Play Next” has the same shuffle bug
**Fix:** preserve selected order directly after current, then leave shuffled tail unchanged.  
**Done when:** selected batch plays next in the promised order.

#### QUEUE-032 — P1 — Toggling shuffle does not reorder current queue
**Found:** toggle changes only a boolean; current tail is not immediately shuffled.  
**Fix:** coordinator shuffles unplayed automatic entries on enable.  
**Done when:** queue visibly changes at toggle time.

#### QUEUE-033 — P1 — Turning shuffle off cannot restore source order
**Fix:** retain canonical/source ordering and shuffle permutation separately.  
**Done when:** disabling shuffle restores remaining source order while respecting manual edits.

#### QUEUE-034 — P1 — Adding one item reshuffles the entire tail
**Found:** Add to queue calls `shuffleQueueAfterCurrent`.  
**Fix:** insert new automatic item using explicit policy without re-randomizing existing future order.  
**Done when:** previous upcoming order is stable.

#### QUEUE-035 — P1 — Current item lookup by ID is ambiguous
**Fix:** use entryId/index in coordinator.  
**Done when:** duplicate songs do not move insertion point.

#### QUEUE-036 — P1 — Duplicate prevention uses song ID only
**Fix:** user policy options: allow duplicates, prevent same recording, prevent same source entry; implement canonical identity.  
**Done when:** remixes/versions are not incorrectly collapsed.

#### QUEUE-037 — P1 — Repeat persistence lacks rollback
**Fix:** store previous repeat mode and revert on settings failure.  
**Done when:** UI always matches persisted state.

#### QUEUE-038 — P1 — Main repeat-all ignores “disable load more” path
**Found:** main advances whenever continuation exists before checking repeat-all; v0.1.8 contains a better guard.  
**Fix:** define precedence: Repeat One → current; Repeat All with no-load-more → wrap loaded source; otherwise page/automix according to origin.  
**Done when:** transition table tests pass.

#### QUEUE-039 — P1 — Shuffle preference and active permutation are conflated
**Fix:** separate persisted default, active mode, and current permutation seed/order.  
**Done when:** restore reproduces the current queue exactly.

#### QUEUE-040 — P1 — `persistentShuffleAcrossQueues` semantics are unclear
**Fix:** rename/document; test whether new queue inherits mode and whether it is immediately shuffled.  
**Done when:** setting behavior matches label.

#### QUEUE-041 — P1 — `shufflePlaylistFirst` implementation is incomplete
**Found:** after single-item watch-next expansion, `originalQueueSize` becomes all items, so original-vs-added distinction can disappear.  
**Fix:** queue origin marks source items and recommendation additions explicitly.  
**Done when:** playlist-first setting has deterministic effect.

#### QUEUE-042 — P1 — Reorder while continuation loads can be lost
**Fix:** serialize queue mutations or merge by entryId/generation.  
**Done when:** stress tests preserve manual order.

#### QUEUE-043 — P2 — No undo for destructive queue edits
**Fix:** short undo for clear/remove and optional confirmation for clear.  
**Done when:** accidental edits are recoverable.

#### QUEUE-044 — P2 — No direct “remove upcoming duplicates” action
**Fix:** optional cleanup command with preview.  
**Done when:** user controls duplication without global policy changes.

#### QUEUE-045 — P2 — No queue save/export
**Fix:** save current queue as local playlist/M3U/CSV while retaining resolvable identities.  
**Done when:** generated radio/Spotify queue can be preserved.

### F. Autoplay, radio, and recommendations

#### RADIO-001 — P0 — Desktop lacks Meld's Spotify recommendation engine
**Fix:** port concept—not Android code blindly—into a backend RecommendationEngine.  
**Done when:** Spotify-origin radio uses taste profile plus seed context rather than YTM next alone.

#### RADIO-002 — P1 — Define source-specific radio policy
**Fix:** YouTube-origin seed defaults to YTM radio; Spotify-origin seed defaults to Spotify recommendation queue; user can choose.  
**Done when:** source identity predicts queue behavior.

#### RADIO-003 — P1 — Seed must start immediately
**Fix:** resolve/play seed first; generate recommendations lazily with timeout.  
**Done when:** recommendation network latency never blocks first audio.

#### RADIO-004 — P1 — Add fallback queue
**Fix:** on recommendation failure: seed-artist top tracks + same album + user top pool, then optional YTM radio.  
**Done when:** radio remains usable offline-with-cache/transient failure where possible.

#### RADIO-005 — P1 — Build taste profile cache
**Fix:** Spotify top tracks/artists, genres, recency, local fallback; six-hour configurable TTL and explicit invalidation.  
**Done when:** recommendations work quickly after restart and tolerate rate limits.

#### RADIO-006 — P1 — Candidate generation from multiple buckets
**Fix:** seed artists, same album, genre neighbors, user top tracks, optionally recent/new releases.  
**Done when:** each bucket has tests and bounded calls.

#### RADIO-007 — P1 — Composite scoring
**Fix:** source relevance, artist affinity, genre overlap, recency, novelty, explicit policy, and repetition penalty.  
**Done when:** weights are versioned and explainable.

#### RADIO-008 — P1 — Diversification
**Fix:** per-artist cap, album cap, recent-history suppression, bucket interleaving, same-song exclusion.  
**Done when:** queue avoids repetitive clusters.

#### RADIO-009 — P1 — Avoid same song twice in a row
**Fix:** canonical recording identity plus immediate-history guard.  
**Done when:** shuffle/radio tests never repeat adjacent track unless only one playable entry exists.

#### RADIO-010 — P1 — Automix result race
**Found:** Desktop's global automix ref does not bind result to queue/session generation. A user action during fetch can allow old recommendations to append/play.  
**Fix:** cancellation token + queue generation check.  
**Done when:** stale automix results are discarded.

#### RADIO-011 — P1 — Automix errors are swallowed
**Fix:** classify and record error; remain silent only for optional fallback while retaining diagnostics.  
**Done when:** “end of queue” is distinguishable from failed recommendation fetch.

#### RADIO-012 — P1 — YTM radio fallback needs retries like reference
**Fix:** retry empty RDAMVM response, fallback to video-only next/related, cap attempts.  
**Done when:** empty-radio fixtures recover or fail clearly.

#### RADIO-013 — P1 — Recommendation pagination and matching are separate
**Fix:** generate Spotify candidates, then progressively resolve to YouTube in batches.  
**Done when:** one bad match does not abort the recommendation queue.

#### RADIO-014 — P2 — Explain recommendation source
**Fix:** optional “Why this track?” from bucket/signals.  
**Done when:** user can understand and correct poor results.

#### RADIO-015 — P2 — Feedback loop
**Fix:** dislike/skip/incorrect-match signals influence local queue scoring without sending private data elsewhere.  
**Done when:** repeated unwanted tracks are suppressed.

#### RADIO-016 — P2 — Deterministic test seed
**Fix:** injectable RNG/seed for tests and optional restored shuffle order.  
**Done when:** recommendation/shuffle tests are reproducible.

### G. Spotify-powered Home

#### HOME-001 — P0 — Product identity mismatch
**Found:** Desktop Home is YTM-first; Meld's identity is Spotify personalization driving Home/Search/recommendations.  
**Fix:** implement source settings and Spotify sections before calling the port 1:1.  
**Done when:** Spotify Home mode is a first-class path.

#### HOME-002 — P1 — Add Use Spotify for Home
**Fix:** account-aware setting, disabled with explanation when disconnected.  
**Done when:** Home switches without restart.

#### HOME-003 — P1 — Add Spotify-only Home
**Fix:** suppress remote YouTube sections but retain appropriate local/recent content.  
**Done when:** mode behavior matches its label.

#### HOME-004 — P1 — Spotify authentication fallback
**Fix:** validate/refresh token; if auth fails, fall back to YouTube unless Spotify-only is explicitly strict, then show reconnect state.  
**Done when:** Home never becomes silently empty.

#### HOME-005 — P1 — Top tracks section
**Fix:** profile cache with GQL/REST/local fallback and explicit filtering.  
**Done when:** warm startup renders cached data immediately then refreshes.

#### HOME-006 — P1 — Top artists section
**Fix:** profile cache, images, artist navigation to Spotify/YouTube equivalent.  
**Done when:** artists open reliably and retain source identity.

#### HOME-007 — P1 — Spotify home feed sections
**Fix:** parse playlists/albums/artists with resilient unknown-section handling.  
**Done when:** one malformed section does not discard the feed.

#### HOME-008 — P1 — New releases/following/discover
**Fix:** implement pinned new releases and reference-style following/discover/for-you policy.  
**Done when:** sections have cache/fallback and deduplication.

#### HOME-009 — P1 — Recently played always available
**Fix:** local history section independent of remote source mode.  
**Done when:** Spotify-only/offline Home retains recent local plays.

#### HOME-010 — P1 — Home request races
**Fix:** generation/AbortController for account changes, refresh, source toggles, and continuation.  
**Done when:** an old YTM/Spotify result cannot overwrite the newly selected source.

#### HOME-011 — P1 — Fix nested state mutation
**Found:** `loadHomeMore` mutates existing section objects/items.  
**Fix:** immutable map/copy or normalized store.  
**Done when:** React tests freeze state and continuation still works.

#### HOME-012 — P1 — Cache completeness/degraded TTL
**Fix:** mark complete vs fallback feeds and use different TTLs; never cache error/empty as complete.  
**Done when:** offline Home is truthful and useful.

#### HOME-013 — P2 — Cross-source deduplication
**Fix:** canonical IDs/matches prevent same album/playlist/track appearing repeatedly across sections.  
**Done when:** dedupe preserves intentional distinct versions.

#### HOME-014 — P2 — Section failure isolation
**Fix:** independent result/status per section and retry.  
**Done when:** rate-limited new releases do not hide top tracks/home feed.

#### HOME-015 — P2 — Source badges and privacy
**Fix:** label Spotify, YouTube, and Local sections; document remote requests.  
**Done when:** user knows which service powers each section.

### H. Spotify-powered Search

#### SEARCH-001 — P0 — Add Use Spotify for Search
**Fix:** source setting and runtime route.  
**Done when:** search can use Spotify tracks/albums/artists/playlists.

#### SEARCH-002 — P1 — Authentication fallback
**Fix:** validate/refresh; fallback to YTM on auth failure with visible source indicator.  
**Done when:** stale token cannot leave blank results.

#### SEARCH-003 — P1 — Preserve Spotify entities
**Fix:** result models for track, album, artist, playlist—not fake YTM entities. Resolve tracks only when playback is requested.  
**Done when:** browsing Spotify album/artist/playlist is native to source.

#### SEARCH-004 — P1 — Latest-search-wins
**Found:** Desktop search has no request generation/abort.  
**Fix:** cancel old queries and continuation requests.  
**Done when:** slow earlier results cannot overwrite later query.

#### SEARCH-005 — P1 — Continuation belongs to query+source+filter
**Fix:** typed cursor with request generation.  
**Done when:** changing query/source/filter invalidates old continuation.

#### SEARCH-006 — P1 — Search filters by source capabilities
**Fix:** Spotify/YTM/local filters with supported entity types and graceful fallback.  
**Done when:** unsupported filter does not issue malformed requests.

#### SEARCH-007 — P1 — Background matching must be incognito
**Fix:** Spotify→YTM resolution searches never enter search history.  
**Done when:** only user-submitted queries are recorded.

#### SEARCH-008 — P1 — Search history privacy/source
**Fix:** store query once with user intent, not per provider; pause/clear behavior applies consistently.  
**Done when:** switching providers does not duplicate history.

#### SEARCH-009 — P2 — Debounced suggestions and cancellation
**Fix:** source-aware suggestions with minimum length, debounce, and abort.  
**Done when:** typing cannot create out-of-order suggestion lists.

#### SEARCH-010 — P2 — URL paste takes precedence safely
**Fix:** repaired canonical URL parser before provider search.  
**Done when:** all URL fixtures route deterministically.

#### SEARCH-011 — P2 — Offline/local fallback
**Fix:** allow local library search when remote providers fail.  
**Done when:** search remains useful offline.

#### SEARCH-012 — P2 — Search quality analytics locally testable
**Fix:** fixture queries and expected entity/ranking tests; no private telemetry required.  
**Done when:** parser/ranking regressions are caught.

### I. Spotify session, API, hashes, and playlist operations

#### SPOT-001 — P0 — Startup auth state can lie
**Found:** token+future expiry is treated as authenticated.  
**Fix:** centralized TokenManager with single-flight refresh/validation and explicit states.  
**Done when:** revoked token becomes ReconnectRequired before normal UI claims connected.

#### SPOT-002 — P1 — Token refresh race
**Fix:** one refresh promise/mutex; waiting callers reuse result.  
**Done when:** concurrent Home/Search/Library calls trigger one refresh.

#### SPOT-003 — P1 — Dynamic GraphQL hashes
**Found:** Desktop compiles a static registry; reference syncs remotely with cache/previous/fallback.  
**Fix:** merge the Desktop remote-hash branch only after integrity, schema, ETag, rollback, and endpoint trust checks.  
**Done when:** PersistedQueryNotFound can recover without a binary release.

#### SPOT-004 — P1 — Hash update must be trusted
**Fix:** HTTPS allowlist plus signed registry or pinned publisher verification; cache last-known-good.  
**Done when:** compromised arbitrary JSON cannot redefine operations silently.

#### SPOT-005 — P1 — Unified 429 handling
**Fix:** parse Retry-After, operation-level backoff, jitter, cancellation, cached fallback.  
**Done when:** Home/Search/Library avoid retry storms.

#### SPOT-006 — P1 — Error-body taxonomy
**Fix:** distinguish auth, hash, permission, rate limit, malformed contract, and network.  
**Done when:** UI/retry behavior is category-specific.

#### SPOT-007 — P1 — Playlist pagination must not cap at 50/100 silently
**Fix:** page until total/next cursor with bounded UI loading.  
**Done when:** all playlists/folders/liked songs are reachable.

#### SPOT-008 — P1 — Bulk Spotify download is not actually queued
**Found:** frontend loops, matches, and awaits each full `download_start`, then says “queued.”  
**Fix:** submit a persistent bulk job to DownloadManager; resolve/download with bounded concurrency and progress.  
**Done when:** UI can pause/cancel/retry and closing the screen does not lose job state.

#### SPOT-009 — P1 — Reorder under sort/filter can be misleading
**Fix:** disable reorder unless showing canonical playlist order, or translate visual move to canonical UID positions explicitly.  
**Done when:** moved result matches visible intention.

#### SPOT-010 — P1 — Playlist mutation conflict refresh
**Fix:** optimistic update with server revision/snapshot and reconciliation; avoid full reload for every move where possible.  
**Done when:** concurrent external edits do not silently reorder wrong items.

#### SPOT-011 — P1 — Liked-song bidirectional sync missing
**Fix:** explicit local/YTM/Spotify like policies and partial-failure state; do not conflate services.  
**Done when:** user can see where a track is liked and retry failed provider sync.

#### SPOT-012 — P2 — Followed-artist sync
**Fix:** fetch/persist Spotify followed artists and map navigation/release sections.  
**Done when:** following section works offline from cache and refreshes safely.

#### SPOT-013 — P2 — Spotify album screen
**Fix:** native Spotify album model, pagination, play/shuffle/download, artist navigation, and progressive matching.  
**Done when:** album playback preserves album order.

#### SPOT-014 — P2 — Folder recursion and cycles
**Fix:** typed folder path, pagination, depth/cycle guard, stable back navigation.  
**Done when:** deeply nested/changed folders do not strand UI.

#### SPOT-015 — P2 — Profile cache tiers
**Fix:** GraphQL→REST→local DB with freshness/completeness metadata and image enrichment.  
**Done when:** warm Home is instant and rate-limit tolerant.

### J. React correctness affecting Part 2

#### UI-001 — P1 — Async Tauri listener cleanup race
**Fix:** disposed flag; immediately stop a listener that resolves after cleanup.  
**Done when:** StrictMode mount/unmount tests show one listener per event.

#### UI-002 — P1 — Detail/playlist request races
**Fix:** request generation and entity key validation before committing response.  
**Done when:** rapid navigation cannot show data for the previous item.

#### UI-003 — P1 — Spotify folder/playlist/profile races
**Fix:** cancellation/generation per view and account session.  
**Done when:** logout/source change invalidates in-flight responses.

#### UI-004 — P1 — Loading flags can cover stale entities
**Fix:** keyed load states `{key,status,data,error}` rather than one global object.  
**Done when:** spinner/error always belongs to the current entity.

#### UI-005 — P1 — One notice string is not an operation model
**Fix:** scoped toasts plus persistent job/error center for queue/match/download.  
**Done when:** concurrent operations do not overwrite each other's only feedback.

#### UI-006 — P2 — Large lists need virtualization
**Fix:** virtualized queue/playlist/search lists with stable entry keys.  
**Done when:** thousands of tracks remain responsive.

### K. Tests and acceptance gates

#### TEST-001 — P0 — Queue state-machine test matrix
Cover play, next, previous, end, remove current, clear, move, duplicate entries, insert next, append, failed prepare, stale prepare, and restore.

#### TEST-002 — P0 — Shuffle/repeat transition table
Cover Off/All/One × continuation/no continuation × auto-load × disable-load-more × manual Play Next × duplicates.

#### TEST-003 — P0 — Spotify matcher corpus
Measure top-1 correctness, false-positive rate, confidence calibration, manual override protection, Unicode, explicit, live/remix/cover, and duration edges.

#### TEST-004 — P1 — Spotify playlist progressive queue tests
API pagination, raw vs filtered offsets, selected unmatchable track, batch failures, visible sort order, shuffle-all, cancellation.

#### TEST-005 — P1 — Continuation routing fixtures
YouTube watch-next and playlist continuation must use their own parsers/endpoints in main and restored sessions.

#### TEST-006 — P1 — Automix race tests
Old recommendation response after new queue/user action must be discarded.

#### TEST-007 — P1 — Home source/fallback tests
Spotify Home, Spotify-only, expired token, partial section failure, offline cache, account switch, and YTM fallback.

#### TEST-008 — P1 — Search race/source tests
Out-of-order queries, source toggle, filters, continuation, URL paste, auth expiry, and incognito background matching.

#### TEST-009 — P1 — Spotify token/hash/rate-limit tests
Single-flight refresh, revoked token, 401, 403, 412, 429 with Retry-After, bad remote registry, rollback.

#### TEST-010 — P1 — React immutable-state tests
Freeze Home/detail/playlist state and ensure continuation merges do not mutate previous objects.

#### TEST-011 — P1 — StrictMode listener test
Mount/unmount/remount with delayed `listen()` resolution and prove all stale listeners stop.

#### TEST-012 — P2 — Recommendation quality tests
Deterministic seed, artist/album caps, recency, genre neighbors, fallback, no adjacent repeats, history suppression.

#### TEST-013 — P2 — Large-source soak
10,000-track mock playlist, deep folder tree, 500 matches, pagination, shuffle, reorder, memory/performance budgets.

## 4. Recommended build order for Part 2

### Milestone A — Identity and queue coordinator
QUEUE-002 through QUEUE-008, plus Part 1's PlaybackCoordinator. Do not build recommendations on loose `YtItem` state.

### Milestone B — Canonical matcher
MATCH-001 through MATCH-028. Replace every first-result path and create the regression corpus.

### Milestone C — Source-preserving queues
QUEUE-009 through QUEUE-029. Restore v0.1.8 continuation typing and implement Spotify paged queues.

### Milestone D — Correct queue semantics
QUEUE-030 through QUEUE-045. Play Next must be next; shuffle must retain canonical order; repeat must follow a tested transition table.

### Milestone E — Spotify recommendation identity
RADIO-001 through RADIO-016. Seed-first startup, lazy recommendations, fallback, scoring, diversification, progressive matching.

### Milestone F — Spotify Home/Search
HOME-001 through HOME-015 and SEARCH-001 through SEARCH-012, backed by a truthful token/profile cache.

### Milestone G — Spotify resilience and UX
SPOT-001 through SPOT-015, UI-001 through UI-006, and all Part 2 tests.

## 5. Part 2 release acceptance definition

Part 2 is complete only when:

- Spotify playlist/Liked/album playback preserves visible source order and selected item.
- Every Spotify→YouTube operation uses one matcher with manual overrides, memory+DB cache, confidence, and regression corpus.
- Play Next remains next with shuffle enabled.
- Toggle shuffle changes/restores the remaining order deterministically.
- Repeat One/All, continuation, automix, and disable-load-more behavior pass a written transition table.
- Main retains playlist-vs-watch-next continuation routing.
- Queue entries have unique instance IDs and can represent duplicate songs safely.
- Stale queue/search/Home/detail/match results cannot overwrite newer user actions.
- Spotify can power Home and Search with cached fallback and optional Spotify-only mode.
- Spotify-origin radio uses personalized recommendations with bounded progressive matching.
- Token refresh, GraphQL hash refresh, 429 handling, and errors are centralized and tested.
- Bulk playlist download is a persistent job, not a long frontend loop.
- The reference implementation is treated as a behavioral baseline, not copied blindly: Desktop improves its permissive match threshold, diagnostics, testability, and Windows lifecycle.

**Recommended Part 3:** database schema/migrations/integrity, library synchronization, likes/follows, playlists, downloads/local files reconciliation, backup/restore, and account-data safety.


# Appendix C — Part 3 — Database, sync, playlists, downloads, backup, credentials

> Source file: `Meld-Desktop-perfect-port-plan-part-3-database-library-sync-data-safety.md`

## Meld Desktop “Perfect Port” Plan — Part 3
### Database, library synchronization, playlists, downloads, local files, backup/restore, credentials, and data safety

**Reviewed revisions**

- Meld Desktop `main`: `e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac`
- Meld Desktop release baseline: `v0.1.8` / `5f1aaf534da8954eec4eeb7608bc37452114987e`
- Meld reference: `5cf51c8cd5a0a68ba071b0026c0be731b506f8a1`
- Prior audit supplied by the user was used only as a cross-check; every finding below was independently checked against source.

---

### 1. Executive result

Part 3 found several **release-blocking data-integrity risks** that are more important than UI parity:

1. **There is no real migration system.** Desktop runs `CREATE TABLE IF NOT EXISTS`, then executes a list of `ALTER TABLE` statements and discards every result. There is no `PRAGMA user_version`, ordered migration ledger, schema fingerprint, rollback, or pre-migration backup. A partially migrated database can open and fail later in unrelated commands.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L44-L192][^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L254-L289]
2. **YouTube library sync can hide imported local files.** Imported files are stored with `in_library = 1`, while YouTube “library” sync resets that flag on *every* song before applying the remote snapshot. It does not exclude `is_local = 1`.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L2006-L2015][^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L2038-L2050][^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L3812-L3818]
3. **The “non-empty snapshot” guard does not prove completeness.** A parser/API regression that returns one page or one item is still accepted as authoritative, so all absent remote states are cleared. Only an exactly empty response is protected.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L2022-L2058]
4. **State provenance is under-modeled.** `liked`, `youtube_liked`, `in_library`, `uploaded`, and playlist `source` are not enough to represent local, YouTube, Spotify, imported, downloaded, and multiple-account ownership independently. The current design will become increasingly destructive as bidirectional sync is added.
5. **A restored old database is not migrated before becoming live.** Restore validates SQLite integrity and the presence of four tables, but does not validate schema version/columns or run migrations before swapping. The app also does not re-run initialization against the restored connection until restart.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L3718-L3792]
6. **Backup creation and restore load the full database into RAM.** A backup may reach the 500 MiB restore cap; both creation and restoration materialize it as a `Vec<u8>`. This can cause large memory spikes or termination.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L3684-L3714][^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L3718-L3745]
7. **Downloads are not reconciled with disk.** Missing completed files are hidden from the UI but their database rows remain. Orphan files, stale `.part` files, missing artwork, wrong file sizes, and restored download rows whose media was never backed up are not repaired.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L3854-L3879]
8. **Playlist rows cannot represent duplicate occurrences.** Desktop rejects a song already present in a local playlist, while the reference relation has an independent auto-generated row ID and can preserve repeated occurrences and occurrence-specific `setVideoId` values.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L4093-L4102][^https://github.com/FrancescoGrazioso/Meld/blob/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/db/entities/PlaylistSongMap.kt#L13-L36]
9. **Main regressed the v0.1.8 history model.** The release stored measured play time; `main` reverted to a timestamp-only history and estimates minutes as full track duration × start count. This overcounts skips and loses partial listening.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L87-L91][^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L3613-L3651]
10. **The reference is not automatically correct.** Its Room v41 migration ladder, exported schemas, WAL, busy timeout, transactions, and Media3 download manager are strong patterns to port; however, some reference sync functions still toggle local state for every remotely absent song and can launch redundant remote writes during reconciliation. Copy the architecture, not every behavior.[^https://github.com/FrancescoGrazioso/Meld/blob/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/db/MusicDatabase.kt#L92-L224][^https://github.com/FrancescoGrazioso/Meld/blob/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/utils/SyncUtils.kt#L720-L847]

**Verdict:** do not build more sync features on the current flags-and-snapshot schema. First establish versioned migrations, source/account provenance, staged reconciliation, and disk consistency.

---

### 2. What Desktop already does well

These should be preserved rather than rewritten blindly:

- Uses SQLite transactions for applying each YouTube snapshot.
- Distinguishes local Meld likes from YouTube likes with `youtube_liked` on `main`.
- Refuses an exactly empty remote snapshot when local synced data already exists.
- Protects downloaded song rows from most cleanup queries.
- Uses foreign keys and cascading deletes for playlist-song and catalog mapping tables.
- Creates backups from a consistent `VACUUM INTO` snapshot.
- Scrubs non-allowlisted settings from the copied database, enables secure deletion, then vacuums again so deleted secret bytes do not remain in free pages.
- Excludes Google and Spotify sessions from portable backups.
- Validates restore archives with an entry-size cap, SQLite `integrity_check`, and required-table check.
- Uses a staged database replacement and keeps the previous file for rollback during the swap.
- Encrypts Google cookies and Spotify access tokens with AES-256-GCM, binds ciphertext to the setting name, stores only the random key in the Windows credential store, and has focused tests for migration and tamper detection.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/secrets.rs#L1-L131]
- Grants Tauri asset access per imported local file instead of allowing arbitrary filesystem roots; normal asset scope is limited to app-owned download, player-cache, and artwork directories.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/tauri.conf.json#L22-L31][^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L3828-L3847]

These are good foundations, but several are incomplete and need the fixes below.

---

## 3. Required implementation checklist

### A. Schema ownership and versioned migrations

#### P0 — must precede more library/sync work

- [ ] **D3-001 — Add an explicit schema version.** Use `PRAGMA user_version` or a dedicated `schema_migrations(version, applied_at, checksum)` table. Never infer the version from whether an `ALTER TABLE` happens to fail.
- [ ] **D3-002 — Replace swallowed `ALTER TABLE` errors.** Each migration must inspect the old version, run inside a transaction, fail startup with a useful error, and leave the old database intact.
- [ ] **D3-003 — Create one immutable migration per released schema transition.** At minimum define the historical baseline, v0.1.8 schema, current-main schema, and the new normalized schema.
- [ ] **D3-004 — Never edit an old migration after release.** Add a new migration instead. Commit canonical schema snapshots so CI can detect accidental drift.
- [ ] **D3-005 — Back up before migration.** Make a consistent SQLite backup beside the database before any upgrade. Keep a bounded number, such as the latest three successful pre-migration copies.
- [ ] **D3-006 — Run `PRAGMA quick_check` before migration and `integrity_check` after migration.** Abort and preserve the recovery copy if either fails.
- [ ] **D3-007 — Validate the final schema.** Check required tables, columns, indexes, foreign keys, triggers, `user_version`, and constraints—not only four table names.
- [ ] **D3-008 — Test every supported upgrade path.** Open fixture databases from every public Desktop release and migrate each to current. Verify representative songs, downloads, likes, playlists, history, settings, and sessions survive.
- [ ] **D3-009 — Test interrupted migration recovery.** Simulate process termination between migration steps and verify restart either completes safely or restores the pre-migration copy.
- [ ] **D3-010 — Reject unsupported future schemas.** A database with a greater `user_version` must not be opened and mutated by an older app.
- [ ] **D3-011 — Add a read-only recovery mode.** If migration fails, let the user export diagnostics/library data or restore a backup instead of only terminating.
- [ ] **D3-012 — Normalize release/main divergence.** Choose one schema lineage. Do not silently drop v0.1.8 columns such as `history.play_time_ms`, `player_cache.quality`, `podcasts.detail_json`, and `lyrics_variants` just because current `main` no longer creates them.

#### P1 — database runtime configuration

- [ ] **D3-013 — Enable WAL deliberately.** Configure `journal_mode=WAL`, `synchronous=NORMAL` (or FULL where appropriate), a bounded `busy_timeout`, and a checkpoint policy.
- [ ] **D3-014 — Do not hold one global SQLite mutex across long work.** Use a small connection pool or dedicated database worker. Keep network and filesystem work outside DB locks.
- [ ] **D3-015 — Add indexes from actual query plans.** At minimum inspect indexes for `history(song_id, played_at)`, `downloads(state, downloaded_at)`, `playlist_songs(playlist_id, position)`, `playlist_songs(song_id)`, source/account membership, local paths, and library flags.
- [ ] **D3-016 — Add schema-level boolean checks.** Constrain boolean integers to `0/1` and state strings to defined values where SQLite permits.
- [ ] **D3-017 — Add foreign-key verification to CI.** Run `PRAGMA foreign_key_check` against every migrated fixture.
- [ ] **D3-018 — Create a repository/data-access layer.** Remove raw SQL from command handlers so ownership rules and deletion guards are centralized.

The reference’s Room database demonstrates the target discipline: explicit version 41, exported schemas, a declared migration ladder, pre-upgrade backup, WAL, a busy timeout, and transaction/query executors.[^https://github.com/FrancescoGrazioso/Meld/blob/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/db/MusicDatabase.kt#L92-L224][^https://github.com/FrancescoGrazioso/Meld/blob/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/db/MusicDatabase.kt#L256-L354]

---

### B. Replace overloaded flags with source/account provenance

The current `songs` row tries to answer unrelated questions with a handful of booleans. A perfect Desktop port needs separate catalog metadata from user state.

#### Proposed core model

- `tracks`: canonical playable/catalog identity and metadata.
- `track_sources`: YouTube video ID, upload entity ID, Spotify track ID, local-file identity, ISRC, source metadata, availability.
- `accounts`: provider, stable account identifier, display metadata, last validation, disconnected state.
- `library_memberships`: track, provider/source, account, membership type, remote ID/token, added time, last observed generation, tombstone/pending operation.
- `likes`: track, provider, account, state, changed time, sync state, last error.
- `downloads`: track/source/quality/format/storage identity and verified state.
- `playlist_entries`: independent occurrence ID, playlist ID, track/source ID, stable order key, remote occurrence ID/`setVideoId`.
- `sync_runs`: provider, account, collection, generation, started/completed time, status, item/page count, cursor, error.

#### Checklist

- [ ] **D3-019 — Separate local likes, YouTube likes, and Spotify likes.** Do not use one `liked` bit as both a UI aggregate and a provider’s source of truth.
- [ ] **D3-020 — Separate imported-local membership from YouTube library membership.** This directly fixes local files being hidden by a YouTube sync.
- [ ] **D3-021 — Attach every remote state to an account.** Switching Google or Spotify accounts must not overwrite another account’s library.
- [ ] **D3-022 — Preserve disconnected-account data.** Mark it detached/stale and let the user choose keep, hide, export, or delete.
- [ ] **D3-023 — Model local UI aggregate state as a query/view.** “Liked Songs” can union enabled providers without destroying provider-specific facts.
- [ ] **D3-024 — Store remote mutation state.** Use `pending_add`, `pending_remove`, `synced`, `failed`, retry count, and last error so offline actions are durable.
- [ ] **D3-025 — Add tombstones.** A deletion made offline must not be resurrected by an older remote snapshot.
- [ ] **D3-026 — Record metadata ownership per field or source.** A sync must not overwrite a user-edited title/artist with stale remote metadata unless the user requests “refetch metadata.”
- [ ] **D3-027 — Add alias/mapping history.** Preserve manual Spotify→YouTube choices and track replacements; never overwrite manual mappings automatically.
- [ ] **D3-028 — Do not infer song identity from display metadata.** Use provider IDs, ISRC where available, file fingerprints, and explicit mappings.

---

### C. Safe synchronization engine

#### Critical current flaw

Desktop stages network fetches before a transaction, which is good, but treats any non-empty result as complete. It then clears all membership flags for the collection and rebuilds them from the fetched list. A single-page or parser-truncated result therefore becomes a destructive snapshot.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L1934-L1968][^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L2022-L2058]

#### Required design

- [ ] **D3-029 — Stage remote snapshots in temporary tables.** Never clear live state while parsing/fetching.
- [ ] **D3-030 — Require an explicit completion proof.** All pages must finish without error, continuations must terminate normally, repeated continuation loops must be treated as incomplete, and every parsed page must satisfy expected structure.
- [ ] **D3-031 — Use sync generations.** Mark each seen membership with the run generation; only remove prior memberships after the run is confirmed complete.
- [ ] **D3-032 — Add plausibility guards beyond “not empty.”** Compare count to the previous complete run, server total where available, page count, and expected collection type. Large unexpected drops should require confirmation or be retained as a pending diff.
- [ ] **D3-033 — Distinguish an authoritative empty account from a failed empty parser.** Require a valid source container/endpoint response and completion metadata before accepting zero items.
- [ ] **D3-034 — Make sync idempotent.** Reapplying the same complete snapshot must produce no changes and no modified timestamps.
- [ ] **D3-035 — Do not call remote mutation APIs while applying a remote snapshot.** Reconciliation should use local-only setters. The reference’s `toggleLibrary()` can launch YouTube writes and should not be copied into reconciliation code.[^https://github.com/FrancescoGrazioso/Meld/blob/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/db/entities/SongEntity.kt#L72-L109][^https://github.com/FrancescoGrazioso/Meld/blob/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/utils/SyncUtils.kt#L790-L847]
- [ ] **D3-036 — Serialize sync per provider/account/collection.** Multiple clicks or startup syncs must coalesce rather than race.
- [ ] **D3-037 — Support cancellation without partial commit.** Cancellation during fetch discards staging; cancellation during apply rolls back.
- [ ] **D3-038 — Persist sync status.** Show last successful run, current phase, items/pages fetched, pending changes, and failure reason after restart.
- [ ] **D3-039 — Add bounded retry/backoff with Retry-After support.** Do not retry authentication or parser failures as transient network failures.
- [ ] **D3-040 — Detect account changes before apply.** Bind the run to the account stable ID and abort if credentials switch during fetch.
- [ ] **D3-041 — Preserve local-only likes and imported files.** Membership removal must target only rows owned by the same provider and account.
- [ ] **D3-042 — Keep downloaded tracks even when remote membership disappears.** Mark source availability separately; do not make a downloaded file unreachable.
- [ ] **D3-043 — Keep playlist contents atomic.** Build new entries in staging, then swap only after the remote playlist is proven complete.
- [ ] **D3-044 — Preserve occurrence identity.** Use YouTube `setVideoId` or provider occurrence IDs for duplicate tracks and exact removal/reorder.
- [ ] **D3-045 — Add conflict policy.** Define what wins when local and remote both changed since the last sync; surface unresolved conflicts instead of guessing.
- [ ] **D3-046 — Add dry-run/diff support.** For large removals, show “remote now has X; Y local memberships would be removed” before applying.
- [ ] **D3-047 — Add per-source capability policy.** YouTube, Spotify, local files, and imports do not support the same operations; the UI and sync layer must know this.
- [ ] **D3-048 — Never represent an incomplete capped Spotify fetch as complete.** The reference caps likes at 3,000 and then can treat the truncated set as a removal authority for mapped tracks. Desktop should either page fully or mark the snapshot partial and prohibit removals.[^https://github.com/FrancescoGrazioso/Meld/blob/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/utils/SyncUtils.kt#L1208-L1345]

#### Required sync test matrix

- [ ] **D3-049 — Zero-item valid collection.** Existing remote state should be removed only with proof that empty is authoritative.
- [ ] **D3-050 — Parser returns zero from a non-empty malformed response.** No local changes.
- [ ] **D3-051 — First page succeeds, continuation fails.** No removals; safe retry from a known cursor if supported.
- [ ] **D3-052 — Repeated continuation token.** Abort as incomplete; no removals.
- [ ] **D3-053 — Remote count suddenly drops 95%.** Hold a pending diff and require confirmation/retry.
- [ ] **D3-054 — Local file plus YouTube library sync.** Imported file remains visible and playable.
- [ ] **D3-055 — Two Google accounts with overlapping IDs.** Each membership remains isolated.
- [ ] **D3-056 — Local, YouTube, and Spotify like on the same track.** Removing one source’s like leaves the other two intact.
- [ ] **D3-057 — Offline local mutation then remote snapshot.** Pending mutation is preserved and retried or conflict-resolved.
- [ ] **D3-058 — Downloaded remote track removed from service.** Offline item remains accessible with an unavailable-source badge.
- [ ] **D3-059 — Duplicate playlist occurrences.** Exact occurrence order and removal survive sync.

---

### D. Likes, library, follows, albums, podcasts, and account lifecycle

- [ ] **D3-060 — Make “Meld Like” and “YouTube Like” visibly distinct or configurable.** Current state has two flags but users need a predictable aggregate and sync policy.
- [ ] **D3-061 — Persist the local state only after a confirmed remote mutation—or use an explicit pending state.** Avoid remote success/local failure and local success/remote failure ambiguity.
- [ ] **D3-062 — Add compensation/retry records.** If YouTube accepts a like but SQLite fails, record a reconciliation task rather than only returning an error.
- [ ] **D3-063 — Update local library membership after `ytm_toggle_library`.** The backend currently sends feedback but does not persist the resulting membership; the UI can remain stale until a later sync.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L2848-L2857]
- [ ] **D3-064 — Give albums provider-specific membership.** Current liked/library/uploaded album flags are reset by collection sync without source ownership.
- [ ] **D3-065 — Add full artist follow/subscription parity.** Persist provider/account ownership, remote mutation status, last refresh, channel ID, Spotify artist ID, and local bookmark independently.
- [ ] **D3-066 — Separate podcast subscription from saved episodes.** Do not overload generic library membership for episode “save for later.”
- [ ] **D3-067 — Preserve per-episode playback position.** Restore the reference/release behavior for podcasts and long-form audio.
- [ ] **D3-068 — Define logout choices precisely.** “Disconnect,” “disconnect and hide this account’s synced content,” and “delete this account’s local data” must be separate actions.
- [ ] **D3-069 — Keep downloads on logout by default.** They are user-owned local files. Explain that restored/account-detached media may need metadata rematching.
- [ ] **D3-070 — Clear credential-manager material on explicit full sign-out.** Deleting encrypted SQLite values is not enough if the user requests “remove all account data”; delete the key only when no retained encrypted secrets need it.
- [ ] **D3-071 — Clear or partition WebView login state per provider.** Current global browsing-data clear may also sign out unrelated embedded providers; use isolated profiles where possible.
- [ ] **D3-072 — Add account-switch confirmation when destructive sync is pending.** Do not silently bind old local state to a new account.
- [ ] **D3-073 — Add a “rebuild from providers” function only after export/backup.** It must preserve local edits, local files, downloads, and manual mappings.

`clear_local_library_keep_downloads` currently deletes mappings, history, search history, lyrics, podcasts, speed dial, albums, artists, and Spotify mappings, then keeps only songs referenced by a download. It also deletes local-file records because those files are not in `downloads`; the function name and confirmation text must explicitly disclose this.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L3510-L3517]

---

### E. Playlists and portable interchange

- [ ] **D3-074 — Give every playlist entry a unique occurrence ID.** Use an auto-increment/UUID primary key; enforce order separately.
- [ ] **D3-075 — Allow duplicate tracks.** Desktop currently rejects any song ID already in the playlist, which is not 1:1 parity with a true ordered playlist.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L4093-L4102]
- [ ] **D3-076 — Remove by occurrence, not song ID.** Current removal deletes every occurrence if duplicates ever enter through migration/import.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L4105-L4109]
- [ ] **D3-077 — Preserve provider occurrence IDs.** Keep YouTube `setVideoId` and Spotify playlist item UID/snapshot/version.
- [ ] **D3-078 — Use stable fractional/order keys or transactional reindexing.** Avoid position collisions during concurrent inserts/reorders.
- [ ] **D3-079 — Add playlist revision/conflict detection.** Do not apply a reorder to a stale Spotify or YouTube snapshot.
- [ ] **D3-080 — Do not delete/recreate remote playlist metadata unnecessarily.** Upsert membership and preserve local annotations, downloaded-only retained items, cover state, and user sort choices.
- [ ] **D3-081 — Add explicit playlist delete and rename for local playlists.** Include confirmation, undo where feasible, and orphan cleanup.
- [ ] **D3-082 — Add local playlist reorder with keyboard and pointer support.** Persist atomically and test duplicates.
- [ ] **D3-083 — Implement CSV export/import.** Include title, artists, album, duration, provider IDs, URL, local path only when the user opts in, and a schema version.
- [ ] **D3-084 — Implement M3U/M3U8 export/import.** Use UTF-8, relative-path option, `#EXTINF`, provider URLs, and clear handling for unavailable local paths.
- [ ] **D3-085 — Add JSON backup/export for lossless Desktop data.** CSV/M3U are interchange formats, not full backups.
- [ ] **D3-086 — Report partial imports.** Show exact rows skipped, ambiguous matches, duplicates, missing local files, and how to fix them.
- [ ] **D3-087 — Add source-to-local copy semantics.** “Save a remote playlist locally” must clearly choose snapshot-only versus ongoing auto-sync.
- [ ] **D3-088 — Add auto-sync retention policy.** If a downloaded item disappears remotely, place it in a clearly labeled retained/offline section rather than silently appending it to a supposedly mirrored playlist.

The reference model’s independent `PlaylistSongMap.id` is a better baseline than Desktop’s `(playlist_id, position)` primary key, although Desktop should add a unique order constraint and provider occurrence metadata.[^https://github.com/FrancescoGrazioso/Meld/blob/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/db/entities/PlaylistSongMap.kt#L13-L36]

---

### F. Downloads, cache, and filesystem reconciliation

Playback transport flaws are covered in Part 1. This section covers persistent data correctness.

- [ ] **D3-089 — Add a startup storage reconciler.** Compare database rows to files and files to database rows before presenting Downloaded/Cached libraries.
- [ ] **D3-090 — Convert missing completed files into an explicit `missing` state.** Do not merely hide them while leaving a completed row.
- [ ] **D3-091 — Quarantine or delete orphan files.** Include unknown final files, stale `.part` files, orphan artwork, and obsolete cache generations.
- [ ] **D3-092 — Verify file size before `completed`.** If `Content-Length`/Content-Range gives an expected total, downloaded bytes must match it.
- [ ] **D3-093 — Verify media structure.** Parse the container/codec and reject HTML/JSON/error bodies saved with an audio extension.
- [ ] **D3-094 — Store content identity.** Persist source ID, itag/format, codec, quality, expected length, ETag/Last-Modified if useful, and a checksum or chunk verification strategy.
- [ ] **D3-095 — Use safe finalization.** Flush and `sync_all` the file, atomically rename on the same volume, then update the DB in the correct order. Recover deterministically from a crash at each point.
- [ ] **D3-096 — Keep retryable partials.** Current `main` deletes partial files on any failure; restore v0.1.8-style resume only after validating Content-Range and source representation.
- [ ] **D3-097 — Do not concatenate different representations.** A renewed signed URL may point to another itag/quality. Resume only if the persisted format identity still matches.
- [ ] **D3-098 — Add disk-space preflight and reserve.** Refuse cleanly before starting if expected size plus safety margin does not fit.
- [ ] **D3-099 — Add download queue persistence.** Queued, active, paused, failed, and retry schedule must survive restart.
- [ ] **D3-100 — Add bounded concurrency.** Separate metadata resolution concurrency from byte-transfer concurrency.
- [ ] **D3-101 — Add retry/backoff categories.** Retry transient network, 429, and refreshed expired URLs; do not loop on unsupported format or permission errors.
- [ ] **D3-102 — Add per-download pause/resume and retry.** Cancellation should not necessarily discard a valid partial.
- [ ] **D3-103 — Add global storage quota and cache LRU.** Explicit downloads are never evicted automatically; playback cache is evictable and quality-aware.
- [ ] **D3-104 — Make cache keys quality/format-aware.** `song_id` alone cannot safely identify multiple quality/container variants.
- [ ] **D3-105 — Store downloads outside backup by policy, but reconcile on restore.** Restored rows must become `missing/not_restored`, not pretend the omitted media exists.
- [ ] **D3-106 — Offer optional media backup separately.** Make the potentially huge size and destination explicit; stream entries rather than buffering.
- [ ] **D3-107 — Validate stored paths.** App-managed download/cache rows must resolve under app-owned canonical roots; reject path traversal or symlink escape before deleting files.
- [ ] **D3-108 — Never delete an arbitrary database-provided path without ownership validation.** `download_remove` currently removes the stored path directly.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L1228-L1242]
- [ ] **D3-109 — Unify file and row transactions with an operation journal.** SQLite cannot atomically commit filesystem renames; record intent and recover on startup.
- [ ] **D3-110 — Add “verify downloads” and “repair library” actions.** Show checked, valid, missing, corrupt, and repaired counts.

The reference uses Media3’s `DownloadManager`, separate player/download caches, bounded preparation concurrency, per-request stream headers, format persistence, and completion callbacks. Desktop should port those semantics into a Windows-native subsystem rather than imitate Android classes literally.[^https://github.com/FrancescoGrazioso/Meld/blob/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/playback/DownloadUtil.kt#L65-L224]

---

### G. Local-file library correctness

- [ ] **D3-111 — Add folders and rescanning, not only one-time file picking.** Users need watched roots, manual rescan, include/exclude rules, and scan progress.
- [ ] **D3-112 — Persist authorized roots/handles safely.** Re-grant per-file asset access on every startup after validating the file still exists.
- [ ] **D3-113 — Reconcile moved, renamed, modified, and deleted files.** `date_modified` is stored but no rescan uses it.
- [ ] **D3-114 — Use stable file identity.** Path hash changes on rename. Prefer volume/file ID where available plus content fingerprint fallback.
- [ ] **D3-115 — Detect duplicate files and duplicate audio content.** Let users keep separate files or merge metadata intentionally.
- [ ] **D3-116 — Preserve all artists and album metadata.** Current import stores only the first artist relation and does not create album relations.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L3812-L3824]
- [ ] **D3-117 — Handle embedded artwork lifecycle.** Deduplicate by content hash, validate image size/type, remove orphan artwork, and refresh it when tags change.
- [ ] **D3-118 — Separate original metadata from user edits.** Rescan should update source metadata without overwriting edited title/artist fields.
- [ ] **D3-119 — Add unavailable-file state.** Missing external media should stay in playlists/history with a relink action.
- [ ] **D3-120 — Add “locate replacement” and bulk relink.** Match by filename, tags, duration, and fingerprint with a confidence review.
- [ ] **D3-121 — Validate decodability during scan.** Extension allowlists alone do not prove an audio file is valid.
- [ ] **D3-122 — Avoid holding the DB mutex while parsing every selected file.** Parse metadata outside the lock, then batch-commit valid results.
- [ ] **D3-123 — Add folder privacy controls.** Never include external absolute paths in portable exports/backups unless explicitly selected.
- [ ] **D3-124 — Add local-file removal choices.** “Remove from Meld” must not delete the original; a separate “delete original file” action requires explicit confirmation and Recycle Bin integration.

---

### H. History, statistics, retention, and privacy

- [ ] **D3-125 — Restore measured play time.** Reintroduce `play_time_ms` or event segments and update it periodically/at stop.
- [ ] **D3-126 — Define when a play counts.** Do not insert history merely when playback is requested; require actual playback and a threshold.
- [ ] **D3-127 — Handle seeks, repeats, resume, and crashes.** Accumulate listened intervals without double counting.
- [ ] **D3-128 — Preserve source and account context.** Record local/YouTube/Spotify source, queue context, and device version where privacy policy permits.
- [ ] **D3-129 — Add a foreign key or deliberate tombstone snapshot to history.** Current history has no FK but UI joins it to songs, so deleting a song silently hides history.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L87-L91][^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L3654-L3659]
- [ ] **D3-130 — Do not estimate minutes as full duration × starts.** Use measured listening duration. Current main overstates skipped tracks.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L3630-L3651]
- [ ] **D3-131 — Add retention controls.** Forever, 90 days, 30 days, or disabled; clearly separate local history from remote YouTube history.
- [ ] **D3-132 — Make “clear history” transactional.** Delete history and orphan cleanup in one transaction.
- [ ] **D3-133 — Add scoped clear actions.** Local listen history, search history, remote YouTube history, stats, and recognition history must not be conflated.
- [ ] **D3-134 — Add export before delete.** JSON/CSV export for history and stats.
- [ ] **D3-135 — Add privacy documentation.** State exactly what remains locally, what is sent to each provider, and what backups contain.

---

### I. Backup, restore, export, and disaster recovery

#### Preserve

Desktop’s allowlist-based settings export and database-copy scrubbing are stronger than the reference’s default behavior. The reference backup writes its DataStore settings file—including optional authentication—and later offers a `clearAuthData` choice; Desktop’s default of never exporting sessions is safer.[^https://github.com/FrancescoGrazioso/Meld/blob/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/viewmodels/BackupRestoreViewModel.kt#L82-L127][^https://github.com/FrancescoGrazioso/Meld/blob/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/viewmodels/BackupRestoreViewModel.kt#L268-L317]

#### Fix

- [ ] **D3-136 — Add a manifest.** Include format version, app version, schema version, created time, platform, entry list, sizes, checksums, and whether media/auth are included.
- [ ] **D3-137 — Stream backup entries.** Do not `read_to_end` the complete SQLite copy.
- [ ] **D3-138 — Use separate small caps.** `settings.json` should be kilobytes/low megabytes, not allowed up to 500 MiB. Cap entry count, archive size, compression ratio, and total extracted bytes.
- [ ] **D3-139 — Reject duplicate critical entries.** Two `song.db` or `settings.json` entries must be invalid rather than “last one wins.”
- [ ] **D3-140 — Validate checksums before opening.** Manifest checksum mismatch aborts before database swap.
- [ ] **D3-141 — Validate `application_id` and schema version.** Do not accept an arbitrary SQLite database merely because it has four matching table names.
- [ ] **D3-142 — Run migrations on the staged database.** Never promote an old schema to live and ask the user to restart before knowing it can migrate.
- [ ] **D3-143 — Run foreign-key and semantic checks on staged data.** Detect invalid paths, illegal state values, missing playlist parents, and unsupported settings.
- [ ] **D3-144 — Preserve the old database until the restored app has reopened successfully.** Current restore deletes `.restore.previous` immediately after `Connection::open`, before later commands prove schema compatibility.
- [ ] **D3-145 — Reapply runtime pragmas and secret migration to the restored connection.** Current swap simply opens the file and stores the connection.
- [ ] **D3-146 — Reconcile omitted media after restore.** Downloads/cache are intentionally excluded, so mark those rows missing or exclude them from the logical backup.
- [ ] **D3-147 — Add a restore preview.** Show backup date/version, counts, settings, accounts excluded, media excluded, conflicts, and required migrations.
- [ ] **D3-148 — Add restore modes.** Replace everything, merge library/playlists, settings only, and inspect/export without restore.
- [ ] **D3-149 — Prevent same-path and temporary-file collisions.** Generate temp files in the app’s recovery directory, not by changing the user-selected output extension.
- [ ] **D3-150 — Clean failed output archives.** A backup error should not leave a partial file looking valid.
- [ ] **D3-151 — Flush the backup archive before reporting success.** Sync destination data where practical.
- [ ] **D3-152 — Keep a recovery journal.** On startup, detect `.restore.part`/`.restore.previous` and complete or roll back deterministically.
- [ ] **D3-153 — Add downgrade-safe export.** A newer app should offer a portable data export even when an older app cannot open its database.
- [ ] **D3-154 — Add scheduled optional backups.** Local-only, bounded retention, clearly disclosed destination, never credentials by default.
- [ ] **D3-155 — Test malicious archives.** Huge claimed sizes, high compression ratios, duplicate names, truncated ZIPs, corrupt SQLite, future schemas, invalid JSON, symlinks, and cancellation.

---

### J. Credentials and account-data safety

- [ ] **D3-156 — Keep the AES-GCM/keyring design, but make migration failure visible.** Startup currently ignores `secrets::migrate` errors, so plaintext can remain indefinitely without warning.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L283-L289][^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/secrets.rs#L109-L131]
- [ ] **D3-157 — Do not silently continue with legacy plaintext forever.** Offer retry, secure-storage troubleshooting, or session removal.
- [ ] **D3-158 — Delete the credential-store key on full account-data reset only after encrypted secrets are removed.** Otherwise retained ciphertext becomes undecryptable.
- [ ] **D3-159 — Add key-loss recovery UX.** If the Windows credential entry disappears, identify affected sessions and let the user reconnect without damaging library data.
- [ ] **D3-160 — Zeroize plaintext buffers where practical.** Avoid long-lived cookie/token copies and debug formatting.
- [ ] **D3-161 — Add log redaction tests.** Cookies, authorization headers, Spotify access tokens, login URLs, and account identifiers must never appear in production logs/crash reports.
- [ ] **D3-162 — Store token metadata separately from secrets.** Expiry and provider/account identity may remain plaintext; tokens/cookies must stay sealed.
- [ ] **D3-163 — Validate sessions against providers before saying “connected.”** Token presence and expiry alone are not enough.
- [ ] **D3-164 — Rotate encryption format cleanly.** Version ciphertext and support transactional re-encryption when algorithms/key policy change.
- [ ] **D3-165 — Scope secrets by Windows user and app identifier.** Detect accidental reuse by forks/dev builds and document dev/prod separation.
- [ ] **D3-166 — Add a security-sensitive backup invariant test.** Enumerate every secret-class setting and fail CI if it is not sealed and excluded from backup.

---

## 4. Data-model parity matrix

| Area | Reference Meld | Desktop main | Required perfect-port state |
|---|---|---|---|
| Schema evolution | Room v41, exported schemas, migration ladder | Unversioned `CREATE` + ignored `ALTER` | Explicit immutable migrations, fixtures, rollback |
| Concurrency | WAL, busy timeout, query/transaction executors | One global mutex/connection | WAL + DB worker/pool + bounded transactions |
| Song identity | Rich entity + mappings + local/download fields | One overloaded row with provider IDs/flags | Catalog identity + source identities + user-state tables |
| Likes | One primary local flag plus Spotify mapping logic | `liked` + `youtube_liked` | Per-provider/account like rows + aggregate view |
| Library | Nullable timestamp and source operations | Global boolean | Per-provider/account membership |
| Playlists | Independent occurrence row ID | `(playlist_id, position)` PK; duplicates rejected | Occurrence ID + stable order + remote occurrence ID |
| History | Event with play time; aggregate stats | Main records starts only | Measured listening events/segments |
| Downloads | Media3 DownloadManager and caches | Ad hoc full-file downloader/cache | Persistent Windows download coordinator with verification |
| Local files | Device MediaStore rescan | Manual picker only | Folder scan, stable identity, missing/moved reconciliation |
| Backup | DB/settings archive; auth optionally retained | Credential-scrubbed DB + safe settings | Keep Desktop security, add manifest/version/streaming/migration |
| Multi-account | Provider state largely global in reference too | Global DB flags | Explicit account ownership and switch policy |
| Corruption recovery | Pre-migration backup, Room validation | Startup error dialog only | Recovery mode, automatic rollback, repair/export |

---

## 5. Recommended implementation order

### Phase 3A — stop data loss first

1. Freeze schema-changing feature work.
2. Add `user_version`, migration runner, schema snapshots, fixtures, pre-migration backup, integrity and FK checks.
3. Restore v0.1.8 columns/features lost on main where still intended.
4. Fix YouTube library sync so it never resets `is_local` membership.
5. Add sync staging/generation/completeness proof and large-drop guard.
6. Add provider/account-specific memberships and likes.
7. Add restore schema validation and staged migration before swap.

### Phase 3B — normalize library and playlists

8. Introduce `accounts`, `track_sources`, `library_memberships`, `likes`, `playlist_entries`, and `sync_runs`.
9. Migrate current flags without losing local/YouTube state.
10. Convert local playlists to occurrence IDs and add duplicate-safe reorder/removal.
11. Add account-switch, disconnect, hide, and delete semantics.
12. Add CSV/M3U/JSON export and import diagnostics.

### Phase 3C — make storage self-healing

13. Build startup download/cache/local-file reconciliation.
14. Replace ad hoc download tasks with a persistent coordinator.
15. Add size/container/format verification, safe resume, quota, eviction, and recovery journal.
16. Add folder scanning, moved-file relink, metadata ownership, and unavailable-file state.
17. Restore measured history/playtime and retention/privacy controls.

### Phase 3D — disaster recovery and proof

18. Version the backup format and add manifest/checksums.
19. Stream create/restore, add strict limits, duplicate-entry rejection, restore preview, merge mode, and staged migration.
20. Run the complete migration/sync/restore/filesystem fault-injection test matrix in CI.

---

## 6. Acceptance criteria for Part 3

Part 3 is complete only when all of the following are demonstrably true:

- Every public Desktop database fixture upgrades to the newest schema with zero silent errors.
- A failed/interrupted migration automatically preserves or restores the prior database.
- YouTube sync cannot hide or delete imported local files, local-only likes, Spotify-only likes, downloads, or another account’s state.
- Partial, malformed, looped, cancelled, or capped remote fetches cannot authorize removals.
- Switching accounts does not blend libraries.
- Duplicate playlist occurrences retain exact order and can be individually removed/reordered.
- A completed download has verified expected size and valid media structure.
- Restart repairs interrupted file/DB operations and identifies missing/corrupt/orphan media.
- Moving a local file can be relinked without losing playlists, history, likes, or edits.
- History uses actual listened time, not track duration multiplied by starts.
- Backups contain no session secrets, have a versioned manifest/checksums, and do not load hundreds of MiB into RAM.
- Restore validates/migrates a staged database before swapping and can roll back after a failed reopen.
- Restoring without media does not display nonexistent downloads as completed.
- Full sign-out, disconnect-only, and delete-account-data are distinct and tested.
- CI covers migrations, malformed sync responses, multi-account state, duplicate playlists, download crash points, local-file changes, malicious backups, and keyring loss.

---

## 7. Additional issues added during this pass

These were not merely repeats from the supplied audit:

- YouTube library sync resets imported local-file membership.
- The empty-response safeguard still accepts destructive partial snapshots.
- Multi-account ownership is absent across songs, likes, playlists, and sync state.
- Restore checks only four table names and integrity, not schema compatibility.
- Restored databases are not migrated before promotion.
- Restored connections do not reapply initialization, runtime pragmas, or secret migration immediately.
- Backups and restores buffer the entire database in memory.
- Backups have no manifest, checksum, format version, duplicate-entry rule, or compression-ratio limit.
- Omitted media and restored download rows are not reconciled.
- Download removal trusts the path stored in SQLite without canonical ownership validation.
- Missing completed downloads remain falsely completed in the DB.
- Local imports have no rescan/moved/deleted reconciliation and persist only the first artist relation.
- Local playlist design forbids duplicate occurrences and removes by song ID rather than occurrence.
- Main regressed measured play time and now overestimates listening statistics.
- “Clear local library but keep downloads” also removes imported local-file records and many unrelated local-only structures.
- Secret migration failure is silently ignored, potentially leaving plaintext credentials.
- The reference’s own sync code must not be copied blindly because it conflates reconciliation setters with remote-mutating toggle methods.



# Appendix D — Part 4 — UI/UX, accessibility, Windows parity

> Source file: `Meld-Desktop-perfect-port-plan-part-4-ui-ux-accessibility-windows-parity.md`

## Meld Desktop “Perfect Port” Plan — Part 4
### Complete UI/UX, accessibility, navigation, player, settings, and Windows interaction parity

**Reviewed revisions**

- Meld Desktop `main`: `e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac`
- Meld Desktop release baseline: `v0.1.8` / `5f1aaf534da8954eec4eeb7608bc37452114987e`
- Meld reference: `5cf51c8cd5a0a68ba071b0026c0be731b506f8a1`
- Desktop UI surface reviewed: all of `src/App.tsx`, `src/App.css`, window configuration, current/release diff, and UI-related history.
- Reference UI surface reviewed: 191 files under `ui/`, route declarations, core player/queue/lyrics components, menus/dialogs, settings screens, strings, and UI-related release history.

---

### 1. Executive result

Desktop has a broad functional shell, but it is **not yet a 1:1 Meld experience**. The main gaps are structural, not cosmetic:

1. **The entire UI is effectively one component.** `App.tsx` is about 208 KB and owns routing, remote/local data, menus, player, queue, lyrics, Spotify, settings, dialogs, selection, downloads, and keyboard handling. This makes state leaks, stale async updates, accessibility regressions, and parity work harder to control.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src/App.tsx#L1-L185]
2. **Navigation is transient component state rather than a route model.** Only five top-level keys exist—Home, Search, Library, History, and Stats—while album, artist, playlist, podcast, settings, player, and Spotify surfaces are overlays or nested state. This blocks reliable deep links, reload restoration, breadcrumbs, browser-style history, and native Windows back behavior.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src/App.tsx#L6-L7][^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src/App.tsx#L340-L375]
3. **Dialogs are visually modal but not accessibly modal.** They use `role="dialog"` and `aria-modal="true"`, but lack accessible-name bindings, focus trapping, background inertness, initial-focus policy, and focus restoration.
4. **Search suggestion semantics are incomplete.** The history popover uses listbox/option roles but has no keyboard option navigation, active descendant, selected state, Escape-specific collapse, or focus/open state. It can remain visible merely because history exists.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src/App.tsx#L1778-L1825]
5. **Many destructive actions happen immediately.** Deleting an uploaded song, clearing local history, removing downloads in bulk, removing Spotify tracks, clearing the queue, and some remote removals lack confirmation or undo.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src/App.tsx#L821-L834][^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src/App.tsx#L1235-L1242]
6. **Current `main` regressed the released player/settings experience.** v0.1.8 had audio quality, volume persistence, equalizer, varispeed, seek interval, pause-on-mute, persistent queue, richer lyrics cache, podcast detail cache, measured playtime, and taskbar media behavior. Several are absent from current UI and settings.
7. **Visual adaptability is incomplete.** The window minimum is 860×600, styling is dark-only, and there is no reduced-motion, forced-colors, high-contrast, text-scale, or system-theme support. Breakpoints exist, but they mostly compress the desktop shell rather than redesign it for narrow/touch use.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/tauri.conf.json#L12-L20][^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src/App.css#L200-L213]
8. **The reference contains many missing product surfaces:** Listen Together, Mood & Genres, Charts, New Releases, Spotify Home/Search/Albums, music recognition/history, Wrapped, changelog, theme/color customization, full equalizer/AutoEQ, Last.fm, Discord, AI lyrics translation, proxy settings, cache limits, pre-cache, updater, CSV/M3U import/export, alarm, and richer account controls.[^https://github.com/FrancescoGrazioso/Meld/blob/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/ui/screens/Screens.kt#L13-L50][^https://github.com/FrancescoGrazioso/Meld/blob/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/ui/screens/NavigationBuilder.kt#L74-L155]
9. **Desktop frequently explains missing parity instead of providing it.** Appearance and storage settings contain prose about why controls are absent. That is honest during development, but final UI should expose real Windows equivalents or omit the category cleanly.
10. **The reference should guide capability and flow, not literal Android layout.** Desktop needs native Windows ergonomics: resizable multi-column layouts, pointer/keyboard menus, system media controls, system theme/high contrast, jump lists, taskbar integration, and Windows-standard dialogs.

**Verdict:** keep the existing functional coverage, but rebuild the UI around a real route/state architecture and accessible design system before attempting pixel polish.

---

### 2. What Desktop already does well

Preserve these strengths:

- Clear sidebar plus top search pattern suitable for desktop.
- Back and forward actions, including `Alt+Left` and `Alt+Right`.
- `Ctrl/Cmd+F` search focus shortcut.
- Global Space and arrow playback shortcuts when not typing.
- Explicit loading, empty, error, and retry states for most major data views.
- Local and remote history separation.
- Library search, sort, list/grid views, filters, auto-playlists, and bulk selection.
- Separate player dock, queue, expanded player, lyrics, volume, seek, shuffle, repeat, favorite, sharing, and menu actions.
- Queue keyboard-friendly move-up/move-down alternatives instead of drag-only interaction.
- Focus-visible styling for buttons and inputs, plus focus-within rings for search pills.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src/App.css#L11-L18]
- `aria-current`, `aria-pressed`, dialog roles, status messaging, named navigation regions, and many icon-button labels were added on current `main`.
- Responsive rules for the top bar, player, expanded player, statistics, and Spotify track rows.
- The UI generally reports backend errors instead of silently faking success.

These are a strong base. The checklist below turns them into a coherent, testable product.

---

## 3. Required implementation checklist

### A. Frontend architecture and state ownership

#### P0 foundation

- [ ] **U4-001 — Split `App.tsx` into route-level screens.** At minimum: Home, Search, Library, History, Stats, Album, Artist, Playlist, Podcast, Spotify, Settings, Player, Queue, and Lyrics.
- [ ] **U4-002 — Extract reusable feature modules.** Player, queue, menu, downloads, accounts, lyrics, playlists, selection, notifications, and settings each need their own state boundary.
- [ ] **U4-003 — Introduce a typed router.** Every durable surface must have a stable route and serializable parameters.
- [ ] **U4-004 — Make navigation history route-based.** Replace the manual `NavKey[]` stack with entries that include route, parameters, scroll state, filters, and selected tab.
- [ ] **U4-005 — Give overlays explicit route/modal state.** Back should close the topmost modal, then nested screen, then top-level navigation predictably.
- [ ] **U4-006 — Persist and restore the last safe route.** Do not restore credential/login dialogs or destructive confirmations.
- [ ] **U4-007 — Add deep-link parsing.** Support Meld routes, YouTube/YouTube Music URLs, Spotify URLs, and local app routes where applicable.
- [ ] **U4-008 — Separate server state from view state.** Data fetching/caching must not live beside modal booleans and player controls.
- [ ] **U4-009 — Use request identities and cancellation per screen.** Navigating away must prevent stale completion from replacing the new screen.
- [ ] **U4-010 — Preserve screen state on back.** Search query/results, library tab/filter/sort, playlist position, and scroll offset should return as left.
- [ ] **U4-011 — Centralize capability checks.** Menus should be derived from item type, source, account, permissions, and state—not scattered conditionals.
- [ ] **U4-012 — Centralize destructive-action policy.** Confirmations, undo, optimistic state, and error rollback should use one system.
- [ ] **U4-013 — Centralize notifications.** Support info, success, warning, error, action/undo, progress, and persistent failures—not one truncated notice string.
- [ ] **U4-014 — Add an error boundary per major route and player.** A failed detail renderer must not take down playback or the entire shell.
- [ ] **U4-015 — Use stable domain IDs plus occurrence IDs.** UI keys and selection cannot rely on title or a song ID when duplicates are valid.

The reference has a real navigation graph with separate destinations for history, stats, moods, account, releases, charts, search results, albums, artists, playlists, podcasts, Spotify, and settings. Desktop should achieve equivalent route coverage using desktop-native navigation.[^https://github.com/FrancescoGrazioso/Meld/blob/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/ui/screens/NavigationBuilder.kt#L74-L360]

---

### B. App shell, navigation, and Windows window behavior

- [ ] **U4-016 — Define primary navigation parity.** Home, Search, Listen Together, and Library are the reference’s primary destinations; History and Stats can remain desktop secondary destinations.[^https://github.com/FrancescoGrazioso/Meld/blob/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/ui/screens/Screens.kt#L20-L50]
- [ ] **U4-017 — Add Listen Together only when real backend behavior exists.** Do not create an inert tab.
- [ ] **U4-018 — Add clear active, hover, focus, pressed, disabled, loading, and attention states for every navigation item.**
- [ ] **U4-019 — Make repeated activation useful.** Clicking the active destination should scroll to top or restore its root, matching reference behavior.
- [ ] **U4-020 — Persist sidebar collapsed state per window.** Preserve the current behavior, but announce the state change accessibly.
- [ ] **U4-021 — Replace Unicode navigation glyphs with a coherent icon set.** Ensure consistent stroke, baseline, selected state, and accessible names.
- [ ] **U4-022 — Add Windows system-theme integration.** Light, dark, system, and optional pure-black modes.
- [ ] **U4-023 — Respect Windows accent color optionally.** Never sacrifice contrast.
- [ ] **U4-024 — Add high-contrast/forced-colors support.** Test Windows High Contrast themes.
- [ ] **U4-025 — Support display scaling and text zoom.** Layout must survive 125%, 150%, 200%, and browser text zoom without clipped controls.
- [ ] **U4-026 — Add reduced-motion support.** Disable decorative transitions, smooth lyric scroll, and spinner animation changes where required.
- [ ] **U4-027 — Restore window size, position, maximized state, and full-player layout safely.** Clamp to available monitors.
- [ ] **U4-028 — Support Windows snap sizes.** The 860 px minimum is too restrictive; design useful compact layouts around approximately 640–720 px if technically feasible.
- [ ] **U4-029 — Add compact/narrow navigation.** At small widths use icon rail or bottom navigation rather than squeezing the full top bar.
- [ ] **U4-030 — Provide a native title-bar strategy.** Include drag region, window controls, double-click maximize, system menu, and correct hit targets if custom decorations are introduced.
- [ ] **U4-031 — Add native back/forward mouse-button handling.** Map XButton1/XButton2 when supported.
- [ ] **U4-032 — Preserve playback while navigating and resizing.** No remount/restart of audio due to route changes.
- [ ] **U4-033 — Add command palette/quick navigation.** Make keyboard-first access to settings, library filters, current queue, and accounts possible.
- [ ] **U4-034 — Add customizable navigation only after all destinations are routable.** The reference supports customizable navigation tabs; Desktop should offer reorder/hide with a reset action.

---

### C. Home parity

- [ ] **U4-035 — Preserve section order and source identity.** Do not merge unrelated sections solely by matching title.
- [ ] **U4-036 — Add skeleton/shimmer loading instead of one blocking boot panel.** Sections should progressively render.
- [ ] **U4-037 — Retain already loaded Home content during refresh.** Show a refresh indicator rather than blanking the page.
- [ ] **U4-038 — Add pull/toolbar refresh equivalent for desktop.** Use a visible Refresh action and `F5`/`Ctrl+R` behavior that does not reload the entire WebView.
- [ ] **U4-039 — Restore per-section Play All and Shuffle where the source supports them.**
- [ ] **U4-040 — Add Recently Played using actual local/remote history policy.**
- [ ] **U4-041 — Add Mood & Genres route and cards.**
- [ ] **U4-042 — Add Charts route.**
- [ ] **U4-043 — Add New Releases with YouTube and Spotify source labels.**
- [ ] **U4-044 — Add Spotify Home and Spotify-only Home mode.** Covered technically in Part 2; this item is the UX surface.
- [ ] **U4-045 — Add music-recognition entry only when recognition works.** Include listening, matching, failure, retry, and recognition-history screens.
- [ ] **U4-046 — Add Speed Dial edit/reorder/removal affordances.** Menu-only pinning is insufficient.
- [ ] **U4-047 — Add section-level error states.** One failed continuation should not invalidate all Home content.
- [ ] **U4-048 — Virtualize long Home sections.** Avoid rendering every card simultaneously.
- [ ] **U4-049 — Preserve horizontal scroll positions per section.**
- [ ] **U4-050 — Add keyboard navigation for card rows.** Arrow keys should move within a row and expose item actions.
- [ ] **U4-051 — Use truthful labels.** Do not expose “Meld YTItems” or internal parser terminology in customer-facing copy.

---

### D. Search parity

- [ ] **U4-052 — Separate search input and results routes.** Back from results should restore suggestions and query.
- [ ] **U4-053 — Add debounced suggestions with cancellation.** Suggestions, history, and results need independent request IDs.
- [ ] **U4-054 — Implement complete combobox semantics.** `role=combobox`, controlled popup state, `aria-controls`, `aria-expanded`, active descendant, arrow navigation, Enter, Escape, Home/End, and selected option.
- [ ] **U4-055 — Show search history only while the search control is active.** Current rendering is based on history count/query, not popup focus state.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src/App.tsx#L1778-L1825]
- [ ] **U4-056 — Add individual history deletion and clear confirmation.**
- [ ] **U4-057 — Add search filters.** Songs, videos, albums, artists, playlists, community playlists, featured playlists, podcasts/episodes, profiles, and source-specific filters where supported.
- [ ] **U4-058 — Honor Hide video songs and explicit filtering consistently in suggestions, results, and continuation pages.**
- [ ] **U4-059 — Parse pasted URLs.** YouTube video/playlist/album/artist, YouTube Music, Spotify album/artist/playlist/track, and app deep links.
- [ ] **U4-060 — Preserve literal encoded queries.** `%`, `+`, `#`, slashes, non-Latin scripts, emoji, and quotes need tests.
- [ ] **U4-061 — Add local-library search mode.** Reference has local and online search surfaces.
- [ ] **U4-062 — Add source labels and match confidence for Spotify-backed results.**
- [ ] **U4-063 — Add search-within-results and result-count messaging.**
- [ ] **U4-064 — Show “no visible results” after filtering.** Do not render a blank list when all returned items are hidden.
- [ ] **U4-065 — Preserve focus and caret when results update.**
- [ ] **U4-066 — Virtualize long result lists and maintain focus across appended pages.**
- [ ] **U4-067 — Make selection mode explicit and scoped.** It should not leak across Home, Search, History, Library, or an opened playlist.

---

### E. Library parity

- [ ] **U4-068 — Give each library area its own route.** Mix, Songs, Albums, Artists, Playlists, Podcasts, Local Files, Downloads, Cache, Uploaded, Liked, and Top Songs.
- [ ] **U4-069 — Correct tab semantics.** Several containers use `role="tablist"` while child buttons lack `role="tab"`, `aria-selected`, roving tabindex, and arrow-key behavior.
- [ ] **U4-070 — Preserve each view’s query, sort, direction, density, and scroll position.**
- [ ] **U4-071 — Add pull/refresh toolbar behavior with last-sync status.**
- [ ] **U4-072 — Show source badges.** Local, YouTube, Spotify, uploaded, downloaded, cached, and unavailable must be visually distinguishable without relying on color alone.
- [ ] **U4-073 — Add download/cache badges on playlists and items.**
- [ ] **U4-074 — Add library count and storage summary.** Counts must reflect current filter/search accurately.
- [ ] **U4-075 — Add list/grid/density settings per media type.** Albums/artists/playlists need responsive card sizes.
- [ ] **U4-076 — Add all source sort modes that are meaningful.** Creation date, name, artist, year, duration, playtime, song count, and last updated.
- [ ] **U4-077 — Keep auto-playlists first-class but clearly synthetic.** Liked, Downloaded, Cached, Top, Uploaded, weekly/monthly recaps.
- [ ] **U4-078 — Restore weekly/monthly most-played playlists and visibility controls.**
- [ ] **U4-079 — Add full playlist create/edit/delete/reorder UI.** Current local playlist UI primarily creates, opens, adds, and removes songs.
- [ ] **U4-080 — Add playlist descriptions, creator/channel, thumbnails, counts, duration, privacy, and sync state.**
- [ ] **U4-081 — Add CSV/M3U import/export flows with previews and error rows.**
- [ ] **U4-082 — Add local-file folder scan, rescan, unavailable/relink, and metadata conflict UI.**
- [ ] **U4-083 — Add album/artist bookmark/follow states and actions.**
- [ ] **U4-084 — Add podcast subscription, new-episode, saved-for-later, downloaded, progress, and played/unplayed affordances.**
- [ ] **U4-085 — Add offline-first states.** Show stale content, last refresh, unavailable remote action, and retry-on-connect.
- [ ] **U4-086 — Make “Clear local data” wording exact.** Part 3 found that current behavior also removes imported-file records and other local-only structures.
- [ ] **U4-087 — Add bulk-action eligibility summaries.** “12 selected, 9 downloadable, 3 skipped” rather than claiming all started.
- [ ] **U4-088 — Add confirmation/undo for bulk remove download, unlike, remove from library, and playlist deletion.**
- [ ] **U4-089 — Select occurrences, not only song IDs.** Duplicate playlist/history rows must remain independently selectable.
- [ ] **U4-090 — Add Select All/None/Range.** Shift-click, keyboard range selection, and playlist-range selection.

The reference maintains separate screens for songs, albums, artists, playlists, podcasts, local files, Spotify folders, auto playlists, cache, local/online/Spotify playlists, and Top Songs.[^https://github.com/FrancescoGrazioso/Meld/tree/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/ui/screens/library][^https://github.com/FrancescoGrazioso/Meld/tree/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/ui/screens/playlist]

---

### F. Album, artist, playlist, podcast, and item-detail screens

- [ ] **U4-091 — Replace generic detail overlay with dedicated routes.** Each type needs its own header, actions, metadata, sections, and loading states.
- [ ] **U4-092 — Add shareable/copyable route state.** Closing a detail should return to exactly the previous screen.
- [ ] **U4-093 — Add hero artwork with responsive size and fallback.** Preserve aspect ratio; avoid blurry low-resolution selection.
- [ ] **U4-094 — Add album metadata.** Year, duration, artists, song count, explicit state, source, library/download status, and description where available.
- [ ] **U4-095 — Make artists clickable in every appropriate context.** Preserve artist order and handle multiple artists with a picker or separate links.
- [ ] **U4-096 — Add artist tabs/sections.** Songs, albums, singles, videos, playlists, related artists, library content, and about.
- [ ] **U4-097 — Add artist follow/bookmark and Play All/Shuffle/Radio actions.**
- [ ] **U4-098 — Add playlist creator/channel, description, visibility, item count, duration, download status, and sync state.**
- [ ] **U4-099 — Add playlist sort/reorder/edit actions according to ownership.**
- [ ] **U4-100 — Add custom playlist thumbnails where supported.**
- [ ] **U4-101 — Add podcast show header, subscription, description, episode filters, progress, download, and refresh.**
- [ ] **U4-102 — Add “show all” routes that preserve section identity and continuation.**
- [ ] **U4-103 — Add unavailable/restricted content treatment.** Explain region, account, age, premium, deleted, or unsupported-stream causes when known.
- [ ] **U4-104 — Improve item details.** Include album, duration, source/provider IDs, quality/format when playing, file path privacy, download/cache state, play count/time, and dates.
- [ ] **U4-105 — Do not expose raw IDs as the primary user experience.** Keep them in an expandable diagnostics section.
- [ ] **U4-106 — Add explicit-content badges everywhere relevant.**
- [ ] **U4-107 — Add context-aware primary action.** Play, resume, open, subscribe, or repair depending on type/state.

---

### G. Mini player and expanded player

- [ ] **U4-108 — Restore every v0.1.8 player setting intentionally.** Audio quality, persisted volume, equalizer, varispeed, seek interval, pause-on-mute, persistent queue, and taskbar controls must either return or be formally removed with migration/release notes.
- [ ] **U4-109 — Make previous/play/next icon buttons explicitly named.** Symbol text and `title` are not a reliable accessible name strategy.
- [ ] **U4-110 — Add `aria-pressed` to repeat and favorite controls.** Announce repeat Off/One/All state changes.
- [ ] **U4-111 — Add keyboard seek announcements.** Screen readers need updated current time without flooding live regions.
- [ ] **U4-112 — Add seek tooltip and buffered/downloaded indication.**
- [ ] **U4-113 — Add mute button and wheel/keyboard volume support with visible value.**
- [ ] **U4-114 — Add playback-speed/pitch panel.** Preserve separate and linked/varispeed modes where supported.
- [ ] **U4-115 — Add audio-quality indicator and selector.** Show Auto/Low/High plus actual codec/bitrate when known.
- [ ] **U4-116 — Add equalizer entry and real Windows DSP implementation before showing the control.**
- [ ] **U4-117 — Add playback error card.** Include concise cause, Retry, Skip, Details, Copy diagnostics, and Change source/client where safe.
- [ ] **U4-118 — Keep the old audible item visible until the next item actually starts.** Show “Preparing…” without lying about now playing.
- [ ] **U4-119 — Add loading/buffering state to the play button and artwork.** Disable duplicate play requests.
- [ ] **U4-120 — Add download/cache/progress badge to now playing.**
- [ ] **U4-121 — Make title, artist, and album interactive with correct routes.**
- [ ] **U4-122 — Add full-player views/tabs for artwork, lyrics, and queue.** Do not force lyrics to occupy the full player when unavailable.
- [ ] **U4-123 — Preserve player view and lyric scroll state across collapse/expand.** Current close handlers may clear lyrics.
- [ ] **U4-124 — Support artwork crop/fit and dynamic background options.**
- [ ] **U4-125 — Add system media-session parity.** Metadata, playback state, timeline, previous/next availability, thumbnail, and source changes must remain synchronized.
- [ ] **U4-126 — Add taskbar thumbnail-toolbar controls where Windows supports them.**
- [ ] **U4-127 — Add global media keys, headset buttons, and optional pause-on-session-lock/device change behavior.**
- [ ] **U4-128 — Add compact mini-player behavior at narrow widths.** Hide secondary controls behind a menu instead of shrinking them below comfortable targets.
- [ ] **U4-129 — Meet minimum target size.** Several controls are 30–34 px; target at least 40–44 effective pixels where possible.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src/App.css#L154-L167]

The reference separates MiniPlayer, Player, Queue, Thumbnail, playback error, sliders, and menus, making these behaviors independently testable.[^https://github.com/FrancescoGrazioso/Meld/tree/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/ui/player]

---

### H. Queue UX

- [ ] **U4-130 — Use unique queue-entry IDs.** Duplicate songs must be distinguishable.
- [ ] **U4-131 — Highlight now playing by queue entry, not song ID.**
- [ ] **U4-132 — Add drag reorder with full keyboard alternative.** Keep existing Move Up/Down actions.
- [ ] **U4-133 — Add multi-select queue editing.** Remove, play next, move, download, and save selected items.
- [ ] **U4-134 — Add undo for remove and clear queue.** Clear queue currently stops playback immediately with no confirmation/undo.
- [ ] **U4-135 — Add queue sections.** Previous/history, Now Playing, Up Next, Autoplay/Automix, and continuation-loading state.
- [ ] **U4-136 — Show source context.** Album, playlist, radio, Spotify playlist, local selection, search, or autoplay.
- [ ] **U4-137 — Add “Save queue as playlist.”**
- [ ] **U4-138 — Add queue menu separate from player menu.** Reference intentionally separates these surfaces.
- [ ] **U4-139 — Preserve canonical order when shuffle toggles off.** UX must explain shuffled versus original order.
- [ ] **U4-140 — Make Play Next deterministic even when shuffle is enabled.** Part 2 found the inserted item can be reshuffled away from next.
- [ ] **U4-141 — Announce queue edits.** Include new position and current-item consequences.
- [ ] **U4-142 — Scroll/focus current item when the queue opens and after shuffle/reorder.**
- [ ] **U4-143 — Show continuation and automix failures with Retry.** Do not silently return an empty list.
- [ ] **U4-144 — Add persistent-queue restore prompt when the previous session ended abnormally.**

---

### I. Lyrics UX

- [ ] **U4-145 — Restore provider picker and cached variants from v0.1.8.** Current `main` lost the full release behavior.
- [ ] **U4-146 — Add provider menu with current, available, failed, disabled, and cached states.**
- [ ] **U4-147 — Add manual search and candidate preview.**
- [ ] **U4-148 — Add edit, offset, re-sync, and reset actions.**
- [ ] **U4-149 — Add copy line, copy all, and share lyrics/image flows.** Respect provider attribution and legal limits.
- [ ] **U4-150 — Add word-synced/background-vocal/multi-singer presentation where data supports it.**
- [ ] **U4-151 — Add text alignment, font size, font family, glow/animation, translation, romanization, and background-style settings.**
- [ ] **U4-152 — Respect reduced motion.** Disable scaling/glow/smooth auto-scroll animations.
- [ ] **U4-153 — Add auto-scroll resume affordance.** User scroll currently disables auto-scroll but there is no prominent persistent control to resume it.
- [ ] **U4-154 — Do not render hundreds of lyric lines as independent generic buttons without list semantics.** Use an accessible timed-text structure with current-line state.
- [ ] **U4-155 — Announce active lyric sparingly.** Avoid live-region spam.
- [ ] **U4-156 — Keep playback shortcuts active in lyrics while protecting line navigation.**
- [ ] **U4-157 — Add plain-lyrics search, selection, and copy accessibility.**
- [ ] **U4-158 — Show provider attribution and cached/offline status clearly.**
- [ ] **U4-159 — Prefetch next-track lyrics with cancellation and no UI race.**

---

### J. Menus, dialogs, confirmations, and selection

- [ ] **U4-160 — Build one accessible Dialog primitive.** It must set an accessible name/description, move initial focus, trap focus, mark background inert, close appropriately, and restore focus.
- [ ] **U4-161 — Build one Menu primitive.** Use menu/menuitem semantics, arrow navigation, Home/End, typeahead, Escape, outside click, and anchor-relative placement.
- [ ] **U4-162 — Build one Popover/Combobox primitive.** Do not treat every layer as a centered dialog.
- [ ] **U4-163 — Bind every dialog to its heading with `aria-labelledby`.** `aria-modal` alone is insufficient.
- [ ] **U4-164 — Keep Escape behavior topmost-first.** The current global ordered boolean list can close a different layer than the visually topmost one.
- [ ] **U4-165 — Make Settings Back return one level before closing.** Current global `goBack` closes Settings entirely even when inside a settings category.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src/App.tsx#L363-L375]
- [ ] **U4-166 — Prevent background shortcuts while a modal is open.** Space/seek/navigation must not act behind a dialog unless explicitly intended.
- [ ] **U4-167 — Confirm irreversible remote deletion.** Uploaded-song deletion must name the service and item and explain irreversibility.
- [ ] **U4-168 — Confirm clearing local history, search history, queue, downloads, caches, playlists, and library data.**
- [ ] **U4-169 — Offer Undo for reversible removals.** Local playlist, local history, queue, pin, and local-library changes.
- [ ] **U4-170 — Distinguish Remove, Delete, Disconnect, and Clear.** Never call file deletion “remove cache” when it is an explicit offline download.
- [ ] **U4-171 — Disable actions while submitting.** Prevent duplicate create/rename/remove/sync commands.
- [ ] **U4-172 — Preserve dialog input after recoverable errors.**
- [ ] **U4-173 — Show item eligibility before bulk actions.** Avoid silently skipping failures in `forEach(...catch(() => undefined))` download starts.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src/App.tsx#L821-L826]
- [ ] **U4-174 — Add progress/cancel to bulk operations.** Like, download, add to playlist, and delete should not block or become an untracked loop.
- [ ] **U4-175 — Restore focus to the invoking control after close.**
- [ ] **U4-176 — Keep context menus on screen.** Reposition above/left near edges and account for DPI scaling.
- [ ] **U4-177 — Add right-click and keyboard context-menu invocation.** Shift+F10/Menu key.
- [ ] **U4-178 — Add tooltips for icon-only controls.** Tooltips do not replace accessible names.

---

### K. Settings parity

#### Settings architecture

- [ ] **U4-179 — Make each settings category routable and searchable.** Appearance, Player, Content, Privacy, Storage, Accounts, Integrations, Backup/Restore, and About.
- [ ] **U4-180 — Add Reset per setting group and Reset All with preview.**
- [ ] **U4-181 — Show when restart is required.** Apply immediately where safe.
- [ ] **U4-182 — Validate every numeric/text setting inline.** Do not rely solely on backend rejection notices.
- [ ] **U4-183 — Add setting dependency states.** Explain why controls are disabled and how to enable them.
- [ ] **U4-184 — Version settings and migrate renamed/removed values.**
- [ ] **U4-185 — Remove development-audit prose from final customer UI.** Replace it with real controls or concise product copy.

#### Appearance

- [ ] **U4-186 — Light/Dark/System/Pure Black.**
- [ ] **U4-187 — Dynamic artwork/player background toggle.**
- [ ] **U4-188 — Accent palette and contrast-safe custom color.**
- [ ] **U4-189 — Font family, UI scale/density, grid size, and artwork crop/fit.**
- [ ] **U4-190 — Lyrics alignment, font size/style, glow, animation, and background.**
- [ ] **U4-191 — Navigation customization and compact/sidebar behavior.**
- [ ] **U4-192 — Reduce motion and transparency.** Also respect system settings automatically.

#### Player/audio

- [ ] **U4-193 — Audio quality with actual format display.**
- [ ] **U4-194 — Volume persistence and pause-on-mute.**
- [ ] **U4-195 — Seek step, varispeed, pitch, and speed controls.**
- [ ] **U4-196 — Equalizer/AutoEQ and reset/bypass.**
- [ ] **U4-197 — Audio normalization level.**
- [ ] **U4-198 — Silence skipping.**
- [ ] **U4-199 — Crossfade only after the Windows playback engine supports it correctly.**
- [ ] **U4-200 — Persistent queue, autoplay/automix, pre-cache, shuffle/repeat persistence, duplicate policy, and stop-on-close behavior.**
- [ ] **U4-201 — “Play over other audio”/exclusive-mode policy appropriate to Windows.**
- [ ] **U4-202 — Preferred YouTube client/source diagnostics only in Advanced.**

#### Content/privacy/storage

- [ ] **U4-203 — Explicit/video filtering with scope explanation.**
- [ ] **U4-204 — Lyrics provider enable/order plus per-provider status.** Remove retired providers when upstream retires them.
- [ ] **U4-205 — Romanization and translation settings.**
- [ ] **U4-206 — Proxy configuration with validation/test action.**
- [ ] **U4-207 — Separate local and remote history controls.** Listen/search/recognition/remote YouTube history.
- [ ] **U4-208 — Cache limits, image cache, player cache, download storage, clear/verify/repair, and storage-location controls.**
- [ ] **U4-209 — Pre-cache count and metered-network policy.** Translate Wi-Fi-only into Windows metered-network semantics.
- [ ] **U4-210 — Crash-reporting consent and privacy details if telemetry is added.** Default should be explicit and transparent.
- [ ] **U4-211 — Backup/restore preview, merge/replace mode, media exclusion, and schema compatibility.** Part 3 defines backend requirements.

#### Accounts/integrations/about

- [ ] **U4-212 — Full Google account screen.** Identity, validation, sync status, last sync, switch account, disconnect/keep/delete choices.
- [ ] **U4-213 — Full Spotify screen.** Identity, token health, relogin banner, sync likes/follows, preload, cache, and mapping status.
- [ ] **U4-214 — Last.fm integration.** Login, scrobble/now-playing status, ignored scrobble diagnostics, love-track policy.
- [ ] **U4-215 — Discord integration only with clear risk disclosure and secure authentication.**
- [ ] **U4-216 — Listen Together integration/settings.**
- [ ] **U4-217 — AI lyrics translation settings only when a real provider is configured.** Secure key entry and cost/privacy warning.
- [ ] **U4-218 — Updater channel and update UI.** Stable/nightly policy, release notes, download progress, signature result, restart.
- [ ] **U4-219 — Changelog/release-notes screen and first-run-after-update summary.**
- [ ] **U4-220 — Complete About screen.** Correct version, commit/build, license, source, acknowledgments, report issue, logs, and update status.

The reference exposes dedicated settings screens for appearance/theme, player, content, privacy, storage, accounts, backup/restore, romanization, updater, equalizer, Last.fm, Discord, Spotify, Listen Together, AI, alarm, and Android-specific features. Desktop should port cross-platform intent and replace Android-only items with Windows equivalents—not show fake switches.[^https://github.com/FrancescoGrazioso/Meld/tree/5cf51c8cd5a0a68ba071b0026c0be731b506f8a1/app/src/main/kotlin/com/metrolist/music/ui/screens/settings]

---

### L. Accessibility

#### Keyboard and focus

- [ ] **U4-221 — Define a complete keyboard map.** Space, Ctrl+F, Alt+Left/Right, media keys, seek, volume, next/previous, queue, lyrics, mute, shuffle, repeat, and command palette.
- [ ] **U4-222 — Never steal Space/arrow keys from focused buttons, sliders, menus, tabs, lists, or dialogs.** Current check excludes form controls but not focused buttons or ARIA widgets.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src/App.tsx#L1552-L1582]
- [ ] **U4-223 — Add roving focus for tablists, menu lists, card rows, queue, and lyrics.**
- [ ] **U4-224 — Preserve focus during pagination and sorting.**
- [ ] **U4-225 — Ensure hidden/covered content cannot receive focus.** Use inertness while modal.
- [ ] **U4-226 — Add skip links/landmarks.** Skip to content, player, queue, and navigation.
- [ ] **U4-227 — Make all pointer gestures keyboard-operable.** Hover-only card menus must become visible on focus-within.

#### Semantics and announcements

- [ ] **U4-228 — Give every dialog an accessible name and description.**
- [ ] **U4-229 — Correct tab, listbox, menu, toolbar, grid, slider, and progress semantics.**
- [ ] **U4-230 — Add accessible value text to seek, volume, sleep timer, speed, pitch, EQ, and progress controls.**
- [ ] **U4-231 — Announce loading completion and errors without replacing focus.**
- [ ] **U4-232 — Add progress semantics to downloads and sync.**
- [ ] **U4-233 — Do not truncate the only error copy.** The notice visually summarizes text; retain a detailed accessible error route/log.
- [ ] **U4-234 — Name artwork meaningfully only when informative.** Decorative duplicates can keep empty `alt`; unique covers need useful context where appropriate.
- [ ] **U4-235 — Replace symbol pronunciation risk.** Unicode glyphs such as `Ⅱ`, `⤨`, `☷`, `×`, arrows, and hearts require explicit accessible labels.
- [ ] **U4-236 — Do not rely on color.** Active, downloaded, explicit, error, cached, source, and selected states need text/icon/shape.

#### Visual and motor accessibility

- [ ] **U4-237 — Meet WCAG AA contrast for text and controls in every theme/state.**
- [ ] **U4-238 — Keep focus indicators visible over all backgrounds and overlays.**
- [ ] **U4-239 — Increase small hit targets.** Especially card menus, transport, close, reorder, and sidebar controls.
- [ ] **U4-240 — Support 200% text scaling without horizontal page clipping.**
- [ ] **U4-241 — Support reduced motion, high contrast, and reduced transparency.**
- [ ] **U4-242 — Avoid time-limited notices as the sole feedback.** Keep important failures in a notification center or inline state.
- [ ] **U4-243 — Do not auto-focus destructive buttons.**
- [ ] **U4-244 — Test with Narrator, keyboard only, Windows High Contrast, 200% scale, and touch.**

---

### M. Responsive layout and Windows-specific UX

- [ ] **U4-245 — Define layout classes by available width, not device labels.** Compact, medium, wide, and ultra-wide.
- [ ] **U4-246 — Use wide screens productively.** Master/detail library and search, persistent queue/lyrics side pane, and scalable card grids.
- [ ] **U4-247 — Keep line lengths readable.** Settings and descriptions should not span the full large monitor width.
- [ ] **U4-248 — Make overlays fit 600 px height.** Header/actions should remain visible; content scrolls independently.
- [ ] **U4-249 — Avoid overlay stacking.** Opening a picker from a menu should replace or stack through a managed modal system, not independent booleans.
- [ ] **U4-250 — Add touch-friendly mode automatically for coarse pointers.** Larger targets, persistent action menus, no hover dependency.
- [ ] **U4-251 — Add mouse wheel volume/seek only with clear hover/focus scope and configurable direction.**
- [ ] **U4-252 — Support drag-and-drop.** Local audio import, playlist import, queue reorder, and optionally artwork.
- [ ] **U4-253 — Add Explorer integration carefully.** “Open file location” for local/downloaded media and file associations for playlist imports.
- [ ] **U4-254 — Add Windows share/clipboard fallback.** Confirm copied links and handle clipboard denial.
- [ ] **U4-255 — Add tray behavior only as an opt-in.** Minimize/close behavior must be explicit, with playback state and Quit.
- [ ] **U4-256 — Add jump-list/recent actions if useful.** Resume, Liked Songs, Downloads, Search—not private listening history by default.
- [ ] **U4-257 — Add native notifications sparingly.** Download complete/failure and updates, respecting Focus Assist.
- [ ] **U4-258 — Handle monitor/DPI changes live.** Menus, tooltips, and restored window coordinates must remain correct.
- [ ] **U4-259 — Support RTL and long translations before localization ships.** The current UI is entirely hardcoded English.
- [ ] **U4-260 — Externalize all user-facing strings.** Add pluralization and locale-aware date/time/number formatting.

---

### N. Missing reference product surfaces

These are real gaps, but they should be scheduled after playback/data foundations and not exposed as placeholders:

- [ ] **U4-261 — Listen Together screen and real-time room UX.**
- [ ] **U4-262 — Music recognition and recognition history.**
- [ ] **U4-263 — Mood & Genres.**
- [ ] **U4-264 — Charts.**
- [ ] **U4-265 — New Releases.**
- [ ] **U4-266 — Spotify Home, Search, Album, Artist, followed artists, recommendations, and re-login UX.**
- [ ] **U4-267 — Wrapped/recap flow and weekly/monthly playlists.**
- [ ] **U4-268 — Last.fm.**
- [ ] **U4-269 — Discord presence.**
- [ ] **U4-270 — AI/manual lyrics translation and romanization.**
- [ ] **U4-271 — Full equalizer/AutoEQ wizard.**
- [ ] **U4-272 — Import/export flows.** CSV, M3U/M3U8, backup preview/merge.
- [ ] **U4-273 — Changelog and update UX.**
- [ ] **U4-274 — Crash/recovery screen.** Include safe restart, logs, reset UI state, and database recovery link.
- [ ] **U4-275 — Alarm/scheduled playback only if a reliable Windows background/task model is implemented.**
- [ ] **U4-276 — Proxy settings and test connection.**
- [ ] **U4-277 — Cache and pre-cache management.**
- [ ] **U4-278 — Custom theme/colors, UI density, navigation customization, and pure-black mode.**
- [ ] **U4-279 — Release notes/onboarding for first launch and major updates.**
- [ ] **U4-280 — Diagnostics/support bundle with automatic secret redaction.**

---

### O. Loading, errors, offline behavior, and copy quality

- [ ] **U4-281 — Use stale-while-revalidate.** Keep usable cached content visible during refresh.
- [ ] **U4-282 — Distinguish offline, timeout, authentication, rate-limit, parser, unavailable-content, and playback-source errors.**
- [ ] **U4-283 — Provide contextual Retry.** Retry only the failed section/action, not the entire application.
- [ ] **U4-284 — Show account-expired banners.** Keep local/offline content usable.
- [ ] **U4-285 — Show rate-limit countdown using Retry-After when available.**
- [ ] **U4-286 — Show partial-success summaries.** Especially bulk likes/downloads/imports/sync.
- [ ] **U4-287 — Keep technical details expandable.** User message first, endpoint/status/request ID second, secrets always redacted.
- [ ] **U4-288 — Add offline badges and availability filters.**
- [ ] **U4-289 — Never claim completion before backend confirmation.**
- [ ] **U4-290 — Replace developer-facing copy.** Remove phrases such as “typed item,” “watchEndpoint,” “YTItems,” “source contract,” and “native cache” from normal user flows.
- [ ] **U4-291 — Use consistent product terms.** Download, playback cache, library, liked, saved, pinned, subscribed, local file, and uploaded must each mean one thing.
- [ ] **U4-292 — Add human-readable empty-state actions.** Connect account, import files, clear filter, retry, create playlist, or learn why unavailable.
- [ ] **U4-293 — Keep notice history.** Users should be able to reopen recent failures/progress instead of losing them after one toast.
- [ ] **U4-294 — Do not silently swallow background errors.** Home automix, auto-download, state refresh, and event listener failures need bounded diagnostics.

---

### P. Design system and visual consistency

- [ ] **U4-295 — Define tokens.** Color, spacing, radius, elevation, typography, animation, focus, target size, and z-index.
- [ ] **U4-296 — Replace ad hoc z-index management with named layers.** Base, sticky header, player, selection bar, popover, menu, modal, critical dialog, tooltip.
- [ ] **U4-297 — Standardize buttons.** Primary, secondary, subtle, icon, danger, split, loading, and destructive confirmation.
- [ ] **U4-298 — Standardize cards/list rows.** One action hierarchy, artwork size, metadata truncation, badges, current-playing state, and context menu.
- [ ] **U4-299 — Standardize screen headers and toolbars.** Title, subtitle, primary actions, filters, sort, view, refresh, selection.
- [ ] **U4-300 — Standardize loading/empty/error panels.**
- [ ] **U4-301 — Standardize form controls.** Labels, help, error, required, disabled reason, keyboard behavior.
- [ ] **U4-302 — Use proper icon assets.** Consistent SVGs, not mixed text glyphs.
- [ ] **U4-303 — Ensure artwork is not upscaled unnecessarily.** Select suitable source resolution for rendered size and DPI.
- [ ] **U4-304 — Add image loading, fallback, retry, and offline-cache states without layout shift.**
- [ ] **U4-305 — Apply truncation deliberately.** Provide tooltip/accessible full name and avoid clipping controls.
- [ ] **U4-306 — Keep the visual language Windows-native without becoming a generic Fluent clone.** Preserve Meld identity while using familiar desktop behavior.

---

## 4. Screen and feature parity matrix

| Surface | Reference Meld | Desktop main | Required state |
|---|---|---|---|
| Primary nav | Home, Search, Together, Library | Home, Search, Library; History/Stats secondary | Add Together when real; customizable native desktop nav |
| Routing | Full navigation graph | Five keys + overlay booleans | Typed routes, deep links, restored history/state |
| Home | Sections, play-all, moods, releases, Spotify, recognition | YTM sections + Speed Dial | Progressive sections and all supported discovery routes |
| Search | Suggestions, filters, local/online, URL input, profiles | Global field + result list | Accessible combobox, filters, local/source modes, URL routing |
| Library | Dedicated media screens | One large conditional screen | Separate routes with persistent state |
| Details | Dedicated album/artist/playlist/podcast screens | Generic overlays | Rich dedicated routes and ownership-aware actions |
| Player | Mini/full, artwork, queue, lyrics, rich settings | Dock/full overlay, queue, lyrics | Restore release controls, error/loading states, system integration |
| Queue | Rich reorder/selection/menu/autoload | Modal list + up/down/remove | Entry IDs, sections, drag+keyboard, undo, deterministic order |
| Lyrics | Provider menu, sync styles, copy/share/edit/offset/translation | Synced/plain display and line seek | Full provider/variant/edit/accessibility parity |
| Settings | Many dedicated screens | Seven modal categories; several explanatory placeholders | Routable/searchable real Windows settings |
| Theme | System/light/dark/pure black/custom | One dark theme | Theme, accent, density, high contrast, reduced motion |
| Accessibility | Compose semantics, still requires desktop validation | Partial ARIA/focus styles | Full dialog/menu/combobox/tab/focus model and Narrator QA |
| Localization | Resource strings/translations | Hardcoded English | Externalized localized strings and RTL readiness |
| Missing products | Together, recognition, releases, Wrapped, integrations | Mostly absent | Implement only with real backend support |

---

## 5. Recommended implementation order

### Phase 4A — architecture and accessibility blockers

1. Split `App.tsx` into route-level modules and introduce typed routing.
2. Build shared Dialog, Menu, Popover/Combobox, Tabs, Toast/Notification, Toolbar, and ItemRow primitives.
3. Add focus management, inert background, accessible names, keyboard models, and focus restoration.
4. Replace Unicode action glyphs with a consistent accessible icon system.
5. Fix destructive confirmations/undo and bulk progress.
6. Add reduced motion, high contrast, system theme, scaling, and compact layouts.

### Phase 4B — core 1:1 daily-use flows

7. Rebuild Home, Search, Library, details, player, queue, lyrics, history, and stats as independent routes.
8. Restore intentionally retained v0.1.8 player/settings features.
9. Add source/account/download/cache/offline badges and consistent terminology.
10. Add full local/online playlist editing, duplicate-safe occurrence UX, and import/export.
11. Add local-file scan/relink and podcast progress/subscription UX.

### Phase 4C — settings and Windows integration

12. Implement real Appearance, Player, Content, Privacy, Storage, Accounts, Integrations, Backup, and About routes.
13. Add system media/taskbar/tray behavior, mouse buttons, drag-and-drop, Explorer integration, and DPI handling.
14. Externalize strings and add plural/date/number localization.

### Phase 4D — missing product surfaces

15. Add Spotify Home/Search/Album/Artist, New Releases, Mood & Genres, and Charts.
16. Add Listen Together, recognition, Wrapped, Last.fm, Discord, translation, equalizer/AutoEQ, updater/changelog, and optional alarms only after their foundations exist.
17. Complete visual polish after behavior, accessibility, and responsive QA pass.

---

## 6. Required UI test matrix

### Automated component/integration tests

- [ ] **U4-307 — Every route renders loading, empty, error, stale, offline, and success states.**
- [ ] **U4-308 — Back/forward restores route parameters, filters, selection, scroll, and modal stack.**
- [ ] **U4-309 — Stale async responses cannot update a replaced route.**
- [ ] **U4-310 — Dialog focus enters, traps, closes, and restores correctly.**
- [ ] **U4-311 — Menus and comboboxes pass keyboard interaction tests.**
- [ ] **U4-312 — Tablists use correct roles and arrow navigation.**
- [ ] **U4-313 — Global playback shortcuts do not override focused controls/widgets.**
- [ ] **U4-314 — Bulk actions report eligible/succeeded/failed/skipped counts.**
- [ ] **U4-315 — Duplicate songs remain independent in queue, playlist, history, and selection.**
- [ ] **U4-316 — Destructive actions require confirmation or support Undo according to policy.**
- [ ] **U4-317 — Every icon-only button has an accessible name and visible tooltip.**
- [ ] **U4-318 — Every modal has an accessible name and no background tabbability.**
- [ ] **U4-319 — Screen-reader live regions do not spam playback ticks or lyric lines.**
- [ ] **U4-320 — Reduced-motion mode disables nonessential animation/smooth scroll.**

### Visual/responsive QA

- [ ] **U4-321 — Test 640/720/860/1024/1280/1440/1920 px widths and 600/768/1080 px heights.**
- [ ] **U4-322 — Test 100/125/150/175/200% Windows scaling.**
- [ ] **U4-323 — Test light, dark, pure black, Windows High Contrast, and custom accent.**
- [ ] **U4-324 — Test mouse, keyboard only, touchpad, touch, and coarse pointer.**
- [ ] **U4-325 — Test long English, German-like expansion, Arabic RTL, CJK, emoji, and mixed-script metadata.**
- [ ] **U4-326 — Test extremely long titles/artists/playlists and missing/broken artwork.**
- [ ] **U4-327 — Test modal/menu placement at every screen edge and monitor DPI transition.**
- [ ] **U4-328 — Test player with no lyrics, plain lyrics, line sync, word sync, error, local file, podcast, and unavailable stream.**
- [ ] **U4-329 — Test offline startup with downloads, cache, local files, and stale remote pages.**
- [ ] **U4-330 — Test every destructive confirmation and cancellation path.**

### Manual accessibility QA

- [ ] **U4-331 — Complete all daily flows with keyboard only.**
- [ ] **U4-332 — Complete all daily flows with Windows Narrator.**
- [ ] **U4-333 — Verify focus order and visible focus in every dialog/menu/route.**
- [ ] **U4-334 — Verify high contrast and 200% text without loss of content or action.**
- [ ] **U4-335 — Verify reduced motion and no seizure/vestibular hazards.**
- [ ] **U4-336 — Verify status/error/progress messages are perceivable and persistent enough.**

---

## 7. Acceptance criteria for Part 4

Part 4 is complete only when:

- Every durable screen has a typed route, deep-link-safe parameters, and state restoration.
- Back/forward, Escape, mouse back/forward, and window restore behave consistently.
- No modal lacks an accessible name, focus trap, background inertness, and focus restoration.
- Search suggestions are a fully keyboard-operable combobox.
- Library/history/stats tabs have correct semantics and keyboard behavior.
- Daily playback, queue, lyrics, downloads, playlists, settings, and account flows work with keyboard only and Narrator.
- The app remains usable at narrow snap widths, 600 px height, 200% scale, and High Contrast.
- Reduced-motion and system-theme preferences are respected.
- Destructive actions are confirmed or undoable, and bulk operations report partial results.
- Current `main` no longer regresses intended v0.1.8 player/settings behavior.
- Duplicate tracks are independently represented in queue, playlists, history, and selection.
- Loading, stale, offline, partial, empty, and error states are truthful and actionable.
- User-facing text contains no parser/internal terms.
- All strings are externalized and layouts are RTL/translation-ready.
- Missing reference features appear only when their implementation is real—never as fake or inert controls.
- Automated route/component/accessibility tests and the Windows manual matrix pass.

---

## 8. Additional issues discovered in this pass

- Settings is treated as one boolean modal, so Back closes the entire settings experience rather than returning from a category.
- Eighteen modal surfaces use dialog roles but none is built on a real focus-managed dialog primitive.
- The recent-search listbox lacks combobox keyboard semantics and focus-controlled visibility.
- Several tablists do not give their child controls tab roles or selected states.
- Global Space/arrow shortcuts can override focused buttons and ARIA widgets because only input/textarea/select/contenteditable are excluded.
- Selection uses song IDs, so duplicate occurrences cannot be independently selected.
- Bulk download starts per-item operations and suppresses individual errors while immediately claiming a count started.
- Remove selected downloads has no confirmation, eligibility review, progress, cancellation, or undo.
- Uploaded-song deletion is immediate despite being a destructive remote operation.
- Queue Clear immediately stops playback and destroys queue state without confirmation or undo.
- The visual minimum target for several controls is around 30–34 px.
- Card menus are hover-hidden and need `:focus-within`/touch treatment.
- The app has no reduced-motion, forced-colors, high-contrast, light-theme, or system-theme CSS path.
- The minimum 860 px window width prevents compact Windows snap layouts.
- Player close clears the visible player rather than offering a configurable stop/minimize/keep-playing policy.
- Lyrics auto-scroll disables on interaction without a persistent, obvious resume control.
- Development language such as “typed item,” “watchEndpoint,” and “source contracts” leaks into normal UI copy.
- All user-facing strings are hardcoded in English.
- Missing reference features are extensive enough that parity must be managed as routes/capabilities, not by adding more conditions to `App.tsx`.



# Appendix E — Part 5 — Architecture, security, release

> Source file: `Meld-Desktop-perfect-port-plan-part-5-architecture-security-release.md`

## Meld Desktop “Perfect Port” Plan — Part 5
### Desktop architecture, security, IPC, authentication, updater, release, and Windows OS integration

**Reviewed revisions**

- Meld Desktop `main`: `e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac`
- Meld Desktop release baseline: `v0.1.8` / `5f1aaf534da8954eec4eeb7608bc37452114987e`
- Surface reviewed: `src-tauri/tauri.conf.json`, `capabilities/default.json`, `Cargo.toml`, `main.rs`, `secrets.rs`, the command registry, login windows, backup/restore, filesystem paths, HTTP client, and the v0.1.8 bundle configuration.

---

### 1. Executive result

Current `main` is materially safer than v0.1.8 — it added a real CSP, narrowed the asset scope, encrypted the Google cookie and Spotify token with a Credential-Manager-held AES-256-GCM key, added HTTP timeouts, single-instance protection, and secret-scrubbed backups. The remaining risks are architectural:

1. **One flat IPC surface.** 87 commands are registered in one `generate_handler!`, nine of which the UI never calls; there are no per-command permissions.
2. **Login webviews share the main profile.** Logging out of one service clears all browsing data; login windows have no navigation allowlist.
3. **Secrets can fall back to plaintext** when Credential Manager is unavailable, and Spotify sessions silently expire because `sp_dc` is discarded.
4. **Restored or tampered databases can widen file access** because every stored `local_path` is re-granted to the asset protocol at startup.
5. **No updater, no code signing, no CI release pipeline, and version metadata regressed to 0.1.0.**
6. **Windows integration regressed**: v0.1.8's taskbar media buttons and WebView2 bootstrapper are gone from `main`.
7. **Portable mode is not truly portable**: data always goes to `%APPDATA%`.

**Verdict:** fix IPC permissions, auth isolation, and filesystem trust first; then build the signed release/updater pipeline before shipping installer, portable, and updater builds.

---

## 2. Required implementation checklist


### A. IPC command surface and capability model

- [ ] **S5-001 — Inventory every Tauri command with an owner, caller, and risk class.** `generate_handler!` registers 87 commands in one list; nine are not invoked by current `App.tsx` (`library_songs`, `library_liked_songs`, `library_playlists`, `library_uploaded_songs`, `library_local_files`, `library_downloads`, `library_player_cache`, `library_saved_podcasts`, `ytm_podcast_channels`).[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L4139-L4170]
- [ ] **S5-002 — Remove or gate unused commands.** Every exposed command is attack surface for any script that ever runs in the main webview. Unregister unused ones or put them behind a debug feature.
- [ ] **S5-003 — Split commands into Rust modules by domain.** `lib.rs` is ~307 KB. Create `ipc/{account,spotify,catalog,library,downloads,player,lyrics,settings,backup,system}.rs` with one `register()` each.
- [ ] **S5-004 — Adopt Tauri v2 app-command permissions.** Capability `default` grants only `core:default` to `main`; custom commands are implicitly allowed for every window that gets IPC. Generate per-command permissions via `build.rs` (`tauri_build::Attributes::app_manifest`) and grant them explicitly.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/capabilities/default.json#L1-L9]
- [ ] **S5-005 — Keep remote login windows IPC-less — and test it.** `google-login` and `spotify-login` load external origins. Add an automated check that no capability lists them and that `remote.urls` is never configured.
- [ ] **S5-006 — Typed, validated IPC payloads.** Replace free `String` arguments (IDs, keys, params, continuation tokens) with newtypes that validate length, charset, and shape before any network/database use.
- [ ] **S5-007 — Structured error type instead of `Result<_, String>`.** Return `{code, message, retryable, detail?}`; never forward raw upstream bodies, SQL text, or filesystem paths to the UI by default.
- [ ] **S5-008 — Cap response sizes and list lengths returned over IPC.** Bound pagination loops (library/playlist continuations are unbounded `loop`s) with a maximum page count and total item count.
- [ ] **S5-009 — Cancellation for long commands.** Searches, sync, playlist expansion, and lyrics lookups need cancellation tokens so route changes do not leave orphaned requests.
- [ ] **S5-010 — Event channel contract.** Document every emitted event (`account-status`, `spotify-status`, download progress, media events) with a typed payload and versioning.
- [ ] **S5-011 — Generate TypeScript bindings from Rust.** Use `specta`/`tauri-specta` (or equivalent) so command names and payload types cannot drift between frontend and backend.
- [ ] **S5-012 — IPC contract tests.** One test per command for: unauthenticated call, malformed argument, oversized argument, and happy path.

### B. Content Security Policy and webview hardening

- [ ] **S5-013 — Keep CSP enabled (regression guard).** Current `main` has a real CSP; v0.1.8 shipped `csp: null`. Add a CI assertion that `security.csp` is never null.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/tauri.conf.json#L1-L49][^https://github.com/Romany-Osama/Meld-Desktop/blob/5f1aaf534da8954eec4eeb7608bc37452114987e/src-tauri/tauri.conf.json#L1-L80]
- [ ] **S5-014 — Narrow `img-src https:`.** Artwork can come from any HTTPS origin, which enables tracking pixels and makes CSP weaker. Proxy/cache artwork through the backend (`asset:`) or allowlist `*.ggpht.com`, `*.googleusercontent.com`, `i.ytimg.com`, `i.scdn.co`.
- [ ] **S5-015 — Review `media-src https://*.googlevideo.com`.** Prefer streaming through the backend cache (`asset:`) so the webview never needs network media access; otherwise keep the narrow host rule and document it.
- [ ] **S5-016 — Use Tauri's `devCsp` for development.** Keep dev-only relaxations (Vite HMR websocket) out of the production policy.
- [ ] **S5-017 — Enable `freezePrototype`.** Set `app.security.freezePrototype: true` to reduce prototype-pollution impact on IPC.
- [ ] **S5-018 — Disable devtools in release builds.** Ensure the `devtools` feature is off in release and add a test for it.
- [ ] **S5-019 — Block in-webview navigation of the main window.** Add `on_navigation` to the main window that permits only the app origin; open external links in the system browser.
- [ ] **S5-020 — Open external links through a dedicated, allowlisted command.** Use `tauri-plugin-opener` with a scoped URL allowlist (https only; YouTube, Spotify, GitHub, provider pages) instead of any `window.open`.
- [ ] **S5-021 — No `dangerouslySetInnerHTML` and no HTML from providers.** Lyrics, descriptions, and changelog text must render as text. Add an ESLint rule.
- [ ] **S5-022 — Disable context-menu/devtools shortcuts in release.** Suppress WebView2 default context menu, F12, Ctrl+Shift+I, and reload accelerators in production.
- [ ] **S5-023 — Disable WebView2 autofill/password save for the main window.** The main UI never needs browser credential storage.
- [ ] **S5-024 — Pin a WebView2 minimum version and handle missing runtime.** v0.1.8 embedded the bootstrapper; current `main` lost that setting. Restore `webviewInstallMode` and show a friendly error if WebView2 is absent.

### C. Authentication isolation and session secrets

- [ ] **S5-025 — Isolate login webviews from the main webview profile.** Login windows share the app's WebView2 profile, so logout calls `clear_all_browsing_data()` on `main`, wiping all browsing state for both services at once. Give each provider its own `data_directory` (or incognito where the flow allows it).[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L2890-L2947][^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L3497-L3532]
- [ ] **S5-026 — Per-provider logout.** Signing out of Spotify must not clear Google cookies and vice versa; delete only that provider's data directory.
- [ ] **S5-027 — Restrict login-window navigation.** Add `on_navigation` allowlists (`accounts.google.com`, `*.google.com`, `music.youtube.com`, `accounts.spotify.com`, `open.spotify.com`, required CDN/challenge hosts) and open everything else externally.
- [ ] **S5-028 — Limit the captured Google cookie set.** The code joins every cookie for `music.youtube.com` into one header. Keep only required auth cookies and record which are needed.
- [ ] **S5-029 — Never log or emit cookies/tokens.** Audit `format!` errors and events; add a redaction layer for `Cookie`, `Authorization`, `sp_dc`, `SAPISID`, and tokens.
- [ ] **S5-030 — Remove plaintext fallback when Credential Manager is unavailable.** Migration explicitly keeps sessions working when secure storage fails, which can leave the cookie in SQLite plaintext. Fail closed: ask the user to sign in again for that session only.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/secrets.rs#L1-L131]
- [ ] **S5-031 — Make Spotify reconnect durable.** `sp_dc` is now discarded (`REMOVED_KEYS`) and only the short-lived access token is kept, so Spotify silently becomes unauthenticated when the token expires. Either seal `sp_dc` with the same AES-GCM scheme and refresh automatically, or show an explicit "Reconnect Spotify" state.
- [ ] **S5-032 — Encrypt all session-adjacent values.** `accountEmail`, `accountName`, `accountChannelHandle`, `dataSyncId`, `visitorData`, and Spotify user IDs are personal data; seal them or move them to the sealed set.
- [ ] **S5-033 — Zeroize secrets in memory.** Use `zeroize`/`secrecy` for cookie and token strings and the cached key.
- [ ] **S5-034 — Detect expired/revoked sessions and recover.** Map 401/403 from InnerTube and Spotify to an account-expired state, stop retry loops, and prompt for re-login.
- [ ] **S5-035 — Session status must not expose secrets.** `session_status` already returns only profile fields; add a test that keeps it that way.
- [ ] **S5-036 — Avoid third-party gists in the Spotify token chain.** The token flow depends on a remote gist for secrets/hashes. Pin, bundle, and verify it (signature or hash) with a reviewed fallback so a remote change cannot alter auth behavior.

### D. Filesystem, asset protocol, and data locations

- [ ] **S5-037 — Keep asset scope narrow (regression guard).** v0.1.8 allowed `$HOME/**`, `$DOCUMENT/**`, `$DOWNLOAD/**`, `$MUSIC/**`, `$DESKTOP/**`; `main` narrowed it to Meld folders. Add a CI assertion.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/tauri.conf.json#L1-L49][^https://github.com/Romany-Osama/Meld-Desktop/blob/5f1aaf534da8954eec4eeb7608bc37452114987e/src-tauri/tauri.conf.json#L1-L80]
- [ ] **S5-038 — Validate re-granted local file paths at startup.** Startup re-allows every `local_path` from the database. A tampered or restored database could grant arbitrary files. Require absolute, existing, regular files with audio extensions and skip others.
- [ ] **S5-039 — Strip `local_path` from restored backups or re-confirm it.** Backups restore `songs.local_path`; require a re-scan/relink instead of trusting paths from another machine.
- [ ] **S5-040 — Use `app.path()` instead of raw `%APPDATA%`.** `database_path()` falls back to `.` when `APPDATA` is missing, which can write the database to the current directory. Use Tauri's path resolver and fail clearly.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L254-L300]
- [ ] **S5-041 — Portable mode data location.** A portable build must store data beside the executable (`<exe>\data`) when a `portable` marker file exists, and never touch `%APPDATA%` or Credential Manager without consent.
- [ ] **S5-042 — Atomic writes everywhere.** Settings, downloads, caches, and backups must write to temp + fsync + rename.
- [ ] **S5-043 — Canonicalize before delete.** `download_remove` and `player_cache_remove` delete paths read from the database. Canonicalize and verify each path is inside the managed folder before `remove_file`.
- [ ] **S5-044 — Sanitize IDs used in file names.** Song IDs feed cache/download file names; enforce `[A-Za-z0-9_-]{1,64}`.
- [ ] **S5-045 — Disk-space checks and quotas.** Check free space before downloads/caching and enforce cache limits.
- [ ] **S5-046 — Correct ACLs on the data folder.** Create the data directory with user-only permissions; do not inherit permissive ACLs from portable locations.

### E. Backup and restore safety

- [ ] **S5-047 — Version the backup format.** Add `manifest.json` with format version, app version, schema version, created time, and SHA-256 of entries.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L3684-L3793]
- [ ] **S5-048 — Stream instead of loading entire databases into memory.** Restore reads up to 500 MB per entry into memory and creation reads the whole DB into a `Vec`; stream with `std::io::copy`.
- [ ] **S5-049 — Treat oversized entries as an error.** An oversized `song.db` is silently skipped, then reported as missing. Return an explicit size error.
- [ ] **S5-050 — Validate full schema compatibility.** Restore only checks four table names; run migrations on the candidate and reject newer-than-supported schemas.
- [ ] **S5-051 — Keep a pre-restore safety copy.** Do not delete `restore.previous` immediately; keep the last pre-restore database until the next successful launch.
- [ ] **S5-052 — Use SQLite's online backup API for creation.** Avoid holding the main DB mutex during `VACUUM INTO` on large libraries.
- [ ] **S5-053 — Optional encrypted backups.** Offer a password-protected backup (Argon2id + AES-GCM) for users who move libraries between machines.
- [ ] **S5-054 — Reference-compatible import.** Support importing Meld Android backups as a separate, validated path (see Part 3).

### F. Network hardening

- [ ] **S5-055 — Central HTTP policy.** The shared client sets 10 s connect / 20 s request timeouts and rustls. Add an explicit host allowlist per subsystem and reject redirects to other hosts for authenticated requests.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L200-L216]
- [ ] **S5-056 — Never send cookies cross-host.** Attach Google cookies only to `music.youtube.com`/`youtubei` hosts and Spotify credentials only to Spotify hosts; enforce in one request builder.
- [ ] **S5-057 — Retry/backoff policy.** Standardize exponential backoff with jitter and respect `Retry-After` for 429/5xx.
- [ ] **S5-058 — Rate limiting per provider.** Throttle lyrics providers, search, and sync to avoid account flags.
- [ ] **S5-059 — Response-size limits on JSON.** Cap body size before `json()` to prevent memory exhaustion from bad responses.
- [ ] **S5-060 — Proxy support with authentication.** Reference Meld has proxy settings; implement HTTP/SOCKS proxy with credentials in Credential Manager.
- [ ] **S5-061 — Respect system proxy and offline state.** Detect offline and pause network work rather than looping errors.
- [ ] **S5-062 — Provider privacy disclosure.** Lyrics providers receive title/artist; show which are enabled and allow disabling each (already partly in settings).

### G. Updater and release signing

- [ ] **S5-063 — Add `tauri-plugin-updater` with a signed manifest.** Generate a minisign keypair, keep the private key in GitHub Actions secrets only, embed the public key in `tauri.conf.json`, and publish `latest.json` with each GitHub release.
- [ ] **S5-064 — Code-sign Windows binaries.** Sign the app exe, NSIS installer, and uninstaller (Authenticode via Azure Trusted Signing or an OV/EV certificate) to avoid SmartScreen warnings and tampering.
- [ ] **S5-065 — Updater UX.** Check on launch and on demand, show release notes, download in background, verify signature, ask before restart, and never interrupt playback.
- [ ] **S5-066 — Update channels.** Stable and beta channels with separate manifests.
- [ ] **S5-067 — Rollback safety.** Back up the database before any update that changes schema; refuse downgrade onto a newer schema without warning.
- [ ] **S5-068 — Portable updater.** Portable builds update by downloading the signed zip, verifying it, and swapping files after exit via a small helper; never write to Program Files.
- [ ] **S5-069 — Installer and uninstaller.** NSIS per-user install by default, Start-menu and optional desktop shortcuts, file/protocol associations, and an uninstaller that asks whether to keep the library, downloads, and Credential Manager entries.
- [ ] **S5-070 — Restore missing bundle settings.** `main` switched to `targets: "all"` and lost `webviewInstallMode`; restore `nsis` targeting and the WebView2 bootstrapper.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/tauri.conf.json#L1-L49][^https://github.com/Romany-Osama/Meld-Desktop/blob/5f1aaf534da8954eec4eeb7608bc37452114987e/src-tauri/tauri.conf.json#L1-L80]
- [ ] **S5-071 — Single source of version truth.** `main` reports 0.1.0 in `tauri.conf.json`, `Cargo.toml`, and `package.json` although v0.1.8 is released. Use one version source and bump in CI.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/Cargo.toml#L1-L40]
- [ ] **S5-072 — Reproducible CI release pipeline.** GitHub Actions on `windows-latest`: `npm ci`, typecheck, tests, `cargo test`, `cargo clippy -D warnings`, `cargo audit`, `npm audit`, `tauri build`, sign, generate SHA256SUMS, upload installer, portable zip, and `latest.json`.
- [ ] **S5-073 — Software bill of materials and license notices.** Produce an SBOM (CycloneDX) and a third-party license bundle; required for GPL-3.0 distribution.
- [ ] **S5-074 — Release provenance.** Use GitHub artifact attestations so users can verify builds came from CI.

### H. Deep links, single instance, and OS integration

- [ ] **S5-075 — Register `meld://` deep links.** Use `tauri-plugin-deep-link` for `meld://song/<id>`, `album`, `playlist`, `artist`, and YouTube Music URLs; validate every link through the typed router from Part 4.
- [ ] **S5-076 — Forward args from the second instance.** The single-instance callback ignores `_args`; parse them so double-clicking a link or file opens it in the running app.
- [ ] **S5-077 — Validate files opened via association.** Audio files opened from Explorer go through the same validation as the file picker.
- [ ] **S5-078 — System Media Transport Controls.** Restore and extend Windows media integration (SMTC metadata, artwork, play/pause/next/previous, seek) that v0.1.8 had through the taskbar plugin.
- [ ] **S5-079 — Taskbar thumbnail buttons and progress.** Re-add previous/play-pause/next thumbnail buttons and download progress in the taskbar.
- [ ] **S5-080 — System tray.** Optional tray icon with playback controls and close-to-tray behavior.
- [ ] **S5-081 — Jump list.** Recent playlists and quick actions in the taskbar jump list.
- [ ] **S5-082 — Global media keys.** Handle hardware media keys through SMTC rather than global shortcuts.
- [ ] **S5-083 — Autostart (opt-in).** Use `tauri-plugin-autostart` only when the user enables it.
- [ ] **S5-084 — Power and session events.** Pause/resume correctly on sleep, lock, and audio-device changes.

### I. Process stability, logging, and diagnostics

- [ ] **S5-085 — Remove panics from production paths.** Replace remaining `expect()` on HTTP client creation and run loop with graceful startup errors (startup DB failures already use `fail_to_start`).
- [ ] **S5-086 — Mutex poisoning recovery.** A single panic poisons `state.db` and breaks every command; move to a connection pool or recover poisoned locks safely.
- [ ] **S5-087 — Move blocking work off async threads.** SQLite and filesystem calls run inside async commands; wrap them in `spawn_blocking` or use a dedicated DB thread.
- [ ] **S5-088 — Structured, redacted logging.** Add `tracing` with rotating log files in the data folder and automatic redaction of secrets and personal data.
- [ ] **S5-089 — Crash reporting (opt-in, local first).** Write minidumps/panic reports locally; uploading requires explicit consent.
- [ ] **S5-090 — Diagnostics export.** A settings action that bundles logs, versions, and settings (no secrets) for bug reports.
- [ ] **S5-091 — Schema migrations with versions.** Replace silent `ALTER TABLE ... ADD COLUMN` attempts (errors ignored) with `PRAGMA user_version` migrations that report real failures.

### J. Dependency and supply-chain security

- [ ] **S5-092 — Automated dependency updates.** Enable Dependabot/Renovate for Cargo, npm, and GitHub Actions.
- [ ] **S5-093 — Audit gates in CI.** `cargo audit`, `cargo deny` (licenses + advisories + duplicate crates), and `npm audit --omit=dev`.
- [ ] **S5-094 — Pin GitHub Actions by commit SHA.** Prevent compromised tag updates from affecting releases.
- [ ] **S5-095 — Secret scanning and push protection.** Enable GitHub secret scanning on the repository; tokens must never be committed or shared in chat/issues.
- [ ] **S5-096 — Least-privilege CI tokens.** Use `permissions:` blocks; only the release job gets `contents: write`.
- [ ] **S5-097 — Branch protection.** Require CI and review for `main`; sign tags for releases.

### K. Security tests and acceptance

- [ ] **S5-098 — Automated security test suite.** Tests for: CSP present, asset scope narrow, no IPC in login windows, navigation blocked, path traversal rejected, oversized payloads rejected, secrets never in logs/backups/IPC errors.
- [ ] **S5-099 — Manual threat-model review.** Document trust boundaries: webview ↔ Rust, Rust ↔ providers, login windows, filesystem, updater.
- [ ] **S5-100 — Pre-release checklist.** Signed artifacts, updater signature verified on a clean VM, uninstall leaves no secrets unless the user chose to keep them, portable mode leaves no files outside its folder.


---

## 3. Recommended implementation order

1. **Phase 5A — trust boundaries:** sections A, B, C, D (IPC permissions, CSP, auth isolation, filesystem validation).
2. **Phase 5B — data safety:** sections E, I (backup format, migrations, stability, logging).
3. **Phase 5C — release engineering:** sections G, J (CI, signing, updater, installer, portable, uninstaller).
4. **Phase 5D — Windows integration:** section H (SMTC, taskbar, tray, deep links, jump list).
5. **Phase 5E — verification:** section K on a clean Windows VM before every release.

## 4. Acceptance criteria for Part 5

- Every command has an explicit permission; unused commands are gone; login windows have no IPC.
- CSP is enforced in release, navigation is restricted, devtools are off.
- No secret is ever stored in plaintext, logged, emitted, or included in backups; per-provider logout works.
- No file outside managed folders or user-chosen local files is reachable through the asset protocol.
- Releases are built by CI, signed, checksummed, and delivered as NSIS installer, portable zip, and signed updater manifest.
- Uninstaller and portable mode behave exactly as documented.
- SMTC/taskbar media controls and deep links work on Windows 10 and 11.


# Appendix F — Part 6 — Performance, reliability, testing

> Source file: `Meld-Desktop-perfect-port-plan-part-6-performance-reliability-testing.md`

## Meld Desktop “Perfect Port” Plan — Part 6
### Performance, reliability, concurrency, offline behavior, testing, CI, and observability

**Reviewed revisions**

- Meld Desktop `main`: `e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac`
- Surface reviewed: runtime state and DB access in `lib.rs`, schema and migrations, network fetch loops, player cache and downloads, `App.tsx` state and effects, production bundle output, existing tests, and CI configuration.

---

### 1. Executive result

Desktop works for small libraries but is not built to scale or to be verified:

1. **One global database lock** serializes every command, including playback, behind sync, backup, and stats work.
2. **Blocking SQLite/filesystem work runs inside async commands**, with almost no `spawn_blocking`.
3. **Few indexes and no pagination**: library queries return everything in one IPC payload; history has no time index.
4. **Unbounded player cache** that stores every played track, labels it `audio/mpeg` whatever the real format, and downloads it in parallel with streaming.
5. **Whole-app re-renders** from one 208 KB component with 109 state hooks, no list virtualization, and one 337 KB JS chunk.
6. **Migrations ignore errors**, so a failed upgrade can be invisible until data breaks.
7. **Testing is thin**: 36 Rust tests, zero frontend tests, no end-to-end tests, and no CI workflows.

**Verdict:** fix database concurrency, caching, and render isolation first; then build the test and CI foundation so later parity work can be verified automatically.

---

## 2. Required implementation checklist


### A. Backend concurrency and database access

- [ ] **R6-001 — Replace the single global `Mutex<Connection>`.** All database work goes through one `Mutex<Connection>` (72 lock sites), so a slow sync, backup, or stats query blocks every other command, including playback.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L219-L222]
- [ ] **R6-002 — Use a dedicated DB actor or `r2d2`/`deadpool` pool.** One writer connection plus a small read pool; reads never wait on writes.
- [ ] **R6-003 — Enable WAL, `busy_timeout`, and `synchronous=NORMAL`.** No journal or busy settings are configured; WAL improves concurrent reads and crash safety.
- [ ] **R6-004 — Never hold a std `Mutex` across `.await` or in async commands.** 71 commands are `async`, but SQLite and filesystem work runs on the async runtime; only one `spawn_blocking` exists. Move blocking work off the runtime.
- [ ] **R6-005 — Batch writes in transactions.** Sync writes each song/artist/album mapping as separate statements; wrap each page in one transaction with prepared, cached statements.
- [ ] **R6-006 — Add missing indexes.** Only `spotify_match(youtube_id)` and `search_history(query)` are indexed. Add `history(played_at)`, `history(song_id, played_at)`, `songs(in_library, saved_at)`, `songs(liked, liked_date)`, `songs(local_path)`, `playlist_songs(playlist_id, position)`, `downloads(state)`.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L45-L190][^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L87-L91]
- [ ] **R6-007 — Use `EXPLAIN QUERY PLAN` tests for hot queries.** Library, liked, history, stats, top songs, and playlist songs must use indexes on a 50k-song fixture.
- [ ] **R6-008 — Paginate library queries.** `library_songs` and siblings return every row in one IPC payload; add keyset pagination.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L3913-L3925]
- [ ] **R6-009 — Run `PRAGMA optimize` and periodic `ANALYZE`.** On shutdown or idle.
- [ ] **R6-010 — Version migrations properly.** Startup tries ~20 `ALTER TABLE ... ADD COLUMN` statements and ignores every error.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L254-L284] Use `user_version` migrations that fail loudly and are tested from every released schema.
- [ ] **R6-011 — Measure startup DB cost.** Track time spent in schema/migration/secret migration (which can `VACUUM` the whole DB on startup).

### B. Network performance and reliability

- [ ] **R6-012 — Bound continuation loops.** Library and playlist fetchers loop until no token is returned; add max pages, total timeout, and cancellation.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L1934-L1969]
- [ ] **R6-013 — Parallelize independent requests with limits.** Sync liked/library/uploaded/playlists concurrently with a small semaphore.
- [ ] **R6-014 — Request deduplication.** Coalesce identical in-flight requests (same browse ID/continuation).
- [ ] **R6-015 — Response caching with TTL.** Cache home, album, artist, playlist, and lyrics responses with ETag/TTL and stale-while-revalidate.
- [ ] **R6-016 — Consistent retry/backoff.** Only a few code paths retry; use one policy for idempotent requests with jitter and `Retry-After`.
- [ ] **R6-017 — Distinguish timeout, offline, auth, rate-limit, and parse failures.** Each maps to a different UI state and retry strategy.
- [ ] **R6-018 — Parser resilience telemetry (local).** Count renderer types that fail to parse so layout changes are detected quickly.
- [ ] **R6-019 — HTTP/2 and connection reuse verification.** Confirm the shared client reuses connections; tune pool idle timeout.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L200-L216]
- [ ] **R6-020 — Prefetch next track stream URL.** Resolve the next queue item's stream before the current track ends for gapless transitions.
- [ ] **R6-021 — Expired stream URL handling everywhere.** Recent fix covers playback; apply the same refresh to downloads and cache fills.

### C. Playback reliability and caching

- [ ] **R6-022 — Correct the cached MIME type.** Cached playback always reports `audio/mpeg` even though YouTube audio is usually Opus/WebM or AAC/MP4; store the real MIME/container with the cache entry.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L1319-L1360]
- [ ] **R6-023 — Cap player cache size.** Every played track is fully cached with no size limit or eviction.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src-tauri/src/lib.rs#L130-L135] Add an LRU limit (user-configurable) and eviction on startup/idle.
- [ ] **R6-024 — Avoid double downloads.** Playback streams from the network while a parallel full download fills the cache; stream from the cache file as it fills or use range requests.
- [ ] **R6-025 — Validate cache completeness.** Store expected length/hash and discard truncated files.
- [ ] **R6-026 — Clean orphaned `.part` files at startup.** Crashes leave partial files in cache/download folders.
- [ ] **R6-027 — Download queue with concurrency limits.** Bounded parallel downloads, resumable with HTTP ranges, persisted across restarts.
- [ ] **R6-028 — Gapless and crossfade timing tests.** Automated tests using fixture audio to measure transition gaps.
- [ ] **R6-029 — Audio device change recovery.** Resume correctly when headphones/Bluetooth devices disconnect or reconnect.
- [ ] **R6-030 — Playback watchdog.** Detect stalled playback (no progress for N seconds while playing) and recover by refreshing the stream.
- [ ] **R6-031 — Error-skip guard.** Auto-skip on error must stop after K consecutive failures instead of draining the queue.

### D. Frontend rendering performance

- [ ] **R6-032 — Split the monolithic component.** `App.tsx` is ~208 KB with 109 `useState` and only ~15 `useEffect` hooks plus few memoized values; every state change re-renders the whole app. (Ties to Part 4 U4-001.)
- [ ] **R6-033 — Isolate high-frequency playback state.** Playback time updates drive whole-app renders.[^https://github.com/Romany-Osama/Meld-Desktop/blob/e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac/src/App.tsx#L390-L405] Move current time into a separate store/subscription consumed only by the seek bar and lyrics.
- [ ] **R6-034 — Virtualize long lists.** Library, playlists, history, queue, and search results render every row; use windowing for lists over ~200 items.
- [ ] **R6-035 — Lazy-load images.** Only 2 image tags use lazy loading; use `loading="lazy"`, `decoding="async"`, fixed dimensions, and correctly sized thumbnails.
- [ ] **R6-036 — Code-split routes.** The bundle is one 337 KB JS chunk; lazy-load settings, stats, Spotify, lyrics, and dialogs.
- [ ] **R6-037 — Memoize derived data.** Sorting/filtering of library lists should be memoized and done off the render path for large libraries.
- [ ] **R6-038 — Avoid layout thrash in lyrics.** Synced lyrics auto-scroll uses `requestAnimationFrame`; batch reads/writes and use `scrollIntoView` with reduced-motion support.
- [ ] **R6-039 — Debounce search and filter inputs.** Remote search, library filter, and suggestions.
- [ ] **R6-040 — Stale-response protection.** Only a few request-ID/cancellation guards exist; every async fetch tied to a route must ignore results after navigation.
- [ ] **R6-041 — React Profiler budgets.** Commit time under 16 ms for playback ticks and under 50 ms for route changes on a mid-range laptop.

### E. Memory, CPU, and resource budgets

- [ ] **R6-042 — Define budgets.** Idle RAM < 250 MB (WebView2 + Rust), idle CPU < 1%, playing CPU < 3%, cold start < 2 s to interactive on SSD.
- [ ] **R6-043 — Leak checks.** Run a 4-hour playback soak and a 500-route navigation loop; memory must plateau.
- [ ] **R6-044 — Free large payloads.** Do not keep full raw InnerTube JSON in state; map to compact view models.
- [ ] **R6-045 — Throttle background work when minimized.** Pause animations, artwork prefetch, and non-essential polling when hidden.
- [ ] **R6-046 — Timer hygiene.** Every interval/listener must be cleared on unmount; add a lint rule and tests.
- [ ] **R6-047 — Artwork cache limits.** Cap artwork cache size and evict LRU.
- [ ] **R6-048 — Battery-aware behavior.** Reduce prefetch and visualizations on battery saver.

### F. Startup and shutdown

- [ ] **R6-049 — Measure and log startup phases.** Process start, DB open, migrations, secret migration, asset re-grants, first paint, first data.
- [ ] **R6-050 — Defer non-critical startup work.** Re-granting every local file path and syncs should run after first paint.
- [ ] **R6-051 — Show a shell immediately.** Render cached library/home while network loads.
- [ ] **R6-052 — Graceful shutdown.** Flush history/playtime, finalize downloads as resumable, checkpoint WAL, and close the DB cleanly.
- [ ] **R6-053 — Restore session state.** Queue, position, route, and volume restore reliably after restart or crash.
- [ ] **R6-054 — Crash-loop protection.** If the app crashes repeatedly on startup, offer safe mode (no auto-sync, no restore).

### G. Error handling and offline behavior

- [ ] **R6-055 — Unified error taxonomy.** Shared Rust error enum mapped to UI messages, retry actions, and log codes (ties to Part 5 S5-007).
- [ ] **R6-056 — Offline mode.** Detect connectivity, show offline banner, serve downloads/cache/local files, and queue remote mutations for later.
- [ ] **R6-057 — Mutation outbox.** Likes, playlist edits, and library changes made offline are persisted and replayed with conflict handling.
- [ ] **R6-058 — Partial failure reporting.** Sync and bulk actions report per-item results instead of one success/fail.
- [ ] **R6-059 — Never silently swallow errors.** Audit `let _ =` and `.ok()` on writes/deletes; log at minimum.
- [ ] **R6-060 — User-visible recovery actions.** Every error state offers retry, sign in again, or open diagnostics.

### H. Automated testing

- [ ] **R6-061 — Frontend unit/integration tests.** There are no frontend tests. Add Vitest + React Testing Library for routes, player, queue, dialogs, settings.
- [ ] **R6-062 — Backend unit tests by module.** Rust has 36 tests (28 in `lib.rs`, 8 in `secrets.rs`); expand to parsers, sync, migrations, downloads, backup, lyrics, Spotify mapping.
- [ ] **R6-063 — Parser fixture corpus.** Store real anonymized InnerTube/Spotify/lyrics responses as fixtures; snapshot parsed results.
- [ ] **R6-064 — Contract tests for providers (scheduled).** A nightly job hits live endpoints with a test account to detect breaking changes early.
- [ ] **R6-065 — Migration tests from every released schema.** Fixtures for v0.1.0–v0.1.8 databases upgraded to current.
- [ ] **R6-066 — Async/command tests with a mocked HTTP layer.** Use `wiremock`/`httpmock` to test timeouts, retries, auth expiry, and malformed bodies.
- [ ] **R6-067 — End-to-end tests.** WebdriverIO or Playwright against the Tauri app via `tauri-driver` on Windows CI for login-free flows (local files, settings, queue).
- [ ] **R6-068 — Accessibility automation.** `axe-core` checks in component tests (Part 4 test matrix).
- [ ] **R6-069 — Performance regression tests.** Benchmarks (`criterion`) for parsers and DB queries; bundle-size budget in CI.
- [ ] **R6-070 — Property/fuzz tests.** Fuzz LRC/TTML parsers, backup restore, and URL/deep-link parsing with `cargo-fuzz`/`proptest`.
- [ ] **R6-071 — Coverage reporting.** `cargo llvm-cov` and Vitest coverage with minimum thresholds for new code.
- [ ] **R6-072 — Flaky test policy.** Quarantine and fix; no retries hiding failures.

### I. CI and quality gates

- [ ] **R6-073 — Add GitHub Actions CI.** The repository has no `.github` workflows; the earlier check environment could not even run `cargo` checks.
- [ ] **R6-074 — Windows runner as the primary target.** Build and test on `windows-latest`; optional Linux job for fast Rust checks.
- [ ] **R6-075 — Required checks.** `npm ci`, `tsc --noEmit`, ESLint, Prettier, Vitest, `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test --locked`, `cargo audit`, `tauri build`.
- [ ] **R6-076 — Caching.** Cache Cargo registry/target and npm to keep CI under ~10 minutes.
- [ ] **R6-077 — PR artifacts.** Upload unsigned debug installers from PRs for manual testing.
- [ ] **R6-078 — Release workflow separated.** Tag-triggered signed release (Part 5 section G).
- [ ] **R6-079 — Linting for Rust and TS.** Add ESLint with React hooks rules; enable stricter Clippy lints (`unwrap_used` in non-test code).

### J. Observability and diagnostics

- [ ] **R6-080 — Structured logging with levels and spans.** `tracing` with per-command spans and durations (Part 5 section I).
- [ ] **R6-081 — Local performance metrics.** Record command latency percentiles, playback start time, and error counts locally; viewable in a diagnostics screen.
- [ ] **R6-082 — Opt-in anonymous telemetry only.** Default off; document exactly what is sent.
- [ ] **R6-083 — Diagnostics bundle.** Logs, versions, OS info, WebView2 version, DB schema version, settings (no secrets).
- [ ] **R6-084 — Health checks screen.** Show account, Spotify, providers, cache size, DB integrity, and update status.

### K. Acceptance

- [ ] **R6-085 — Performance acceptance run.** Meet budgets in section E on a 50k-song library on Windows 10 and 11.
- [ ] **R6-086 — Reliability soak.** 24-hour playback with network drops, sleep/resume, and device changes without crashes or stuck playback.
- [ ] **R6-087 — Test gate.** All CI checks green, coverage thresholds met, and the manual matrix signed off before release.


---

## 3. Recommended implementation order

1. **Phase 6A — foundations:** CI (I), DB actor/WAL/indexes/migrations (A), test harness (H).
2. **Phase 6B — playback reliability:** cache, MIME, prefetch, watchdog (C), network policy (B).
3. **Phase 6C — UI performance:** render isolation, virtualization, code-splitting (D), budgets (E).
4. **Phase 6D — resilience:** startup/shutdown (F), offline/outbox (G), observability (J).
5. **Phase 6E — acceptance:** soak and performance runs (K).

## 4. Acceptance criteria for Part 6

- No command waits on an unrelated long-running database operation.
- Hot queries use indexes on a 50k-song fixture; library views paginate.
- Player cache has a size limit, correct MIME types, and no duplicate network downloads.
- Playback ticks re-render only playback-related components; long lists are virtualized.
- Migrations are versioned, tested from every released schema, and fail loudly.
- CI runs lint, type-check, unit, integration, and build on Windows for every PR.
- Performance budgets and the 24-hour soak pass before release.


# Appendix G — Technical review and 1:1 parity audit

> Source file: `Meld-Desktop-technical-review.md`

## Meld Desktop — Technical Review and 1:1 Meld Parity Audit

**Reviewed:** 2026-10-01  
**Desktop default branch:** `e7194c2e54e8f05d5d6aa199e2a897f1ede0e8ac`  
**Desktop latest release:** `v0.1.8` / `5f1aaf534da8954eec4eeb7608bc37452114987e`  
**Reference Meld:** `v0.9.2` / `dc7a27224acee33fa475ab70e1935dc03d3ef4ef`

### Executive verdict

Meld Desktop is a substantial native prototype, not a production-ready 1:1 Windows port. It has real implementations for YouTube Music browsing, local SQLite state, downloads/cache, lyrics, queueing, Google login, a useful subset of Spotify playlist/library operations, podcasts, history/stats, backup/restore, and Windows taskbar controls in the release branch.

The biggest problem is not an isolated code bug: **the project has two incompatible product lines**.

- `v0.1.8` contains the richer feature set, but lacks important later security/reliability fixes.
- `main` contains those hardening fixes, but is not descended from `v0.1.8`, reports version `0.1.0`, and has regressed/removes multiple v0.1.8 features.

Do not ship another public build until these lines are reconciled into one branch and re-audited.

### Review scope and validation

- Inventoried all 43 tracked files on Desktop `main` and all 1,156 tracked files in reference Meld.
- Reviewed all Desktop executable source/config/docs and all Desktop GitHub release notes (9 releases).
- Compared Desktop `main` to the exact `v0.1.8` release tree and inspected the post-release fix commits.
- Inventoried the reference app's 589 Kotlin files, 365 XML resources, settings screens, services, constants, tests, README, changelog, resync notes, and all 17 GitHub release notes.
- Frontend validation passed on both Desktop trees: clean `npm ci`, TypeScript build, Vite production build, and zero npm audit findings.
- Rust checks could not be re-run in this environment because `cargo`/`rustc` are not installed. The repository's claimed Rust test results were therefore not independently verified.
- The Android reference build was not run because the environment has no Android SDK.

### Severity summary

| Severity | Count | Meaning |
|---|---:|---|
| Critical release blocker | 4 | Do not ship until resolved |
| High | 9 | Security, data-loss, or major reliability/parity issue |
| Medium | 14 | User-visible correctness, architecture, accessibility, or release issue |
| Low / polish | 9 | Maintainability and UX quality |

## Critical release blockers

### C1. Default branch and released product have diverged

`v0.1.8` is **not an ancestor of `main`**. The latest release was cut from `feat/source-parity-next`, while `main` continued on another line. The diff is large: 35 files, thousands of changed lines, deleted taskbar assets, and major frontend/backend behavior changes.

Consequences:

- Security fixes on `main` are not in the latest downloadable release.
- Features shipped in v0.1.8 are missing from `main`.
- A contributor cloning the repository does not get the source matching the latest release.
- Bug reports cannot be mapped reliably to the default source tree.
- Version metadata on `main` is `0.1.0`, even though the public latest release is `0.1.8`.

**Fix:** branch from v0.1.8, merge/cherry-pick every hardening fix, resolve feature regressions deliberately, set one canonical version, and make the release tag an ancestor of `main`.

### C2. v0.1.8 stores Google and Spotify credentials in plaintext SQLite

The v0.1.8 `settings` table stores the full Google cookie, Spotify `sp_dc`, `sp_key`, and access token as ordinary string rows. Anyone or any malware able to read the user database can reuse account session material.

Evidence:

- Google cookie read directly from `settings`: `lib.rs` lines 805–816.
- Google cookie written directly into `settings`: lines 3110–3119.
- Spotify tokens/cookies written directly into `settings`: lines 3639–3644.

`main` later adds AES-256-GCM encryption with a random key in Windows Credential Manager. That is the right direction, but it has not been released.

**Fix:** never ship v0.1.8 again. Migrate existing plaintext secrets in-place on first run; store only encrypted values; delete obsolete `sp_dc`/`sp_key` after deriving a validated access token; document session revocation.

### C3. v0.1.8 disables CSP and grants asset-protocol access to broad user folders

The release config sets `csp: null` and exposes `$HOME/**`, `$APPDATA/**`, Documents, Downloads, Music, and Desktop through Tauri's asset protocol. That creates an unnecessarily large local-file disclosure blast radius if any renderer injection or navigation issue appears.

`main` correctly narrows access to the app's artwork/download/cache folders and introduces a CSP. The safer configuration must be merged into the feature branch.

**Fix:** use the narrow `main` scopes, retain a restrictive CSP, validate every externally derived media/artwork URL, and add a regression test that rejects paths outside app-owned directories.

### C4. v0.1.8 contains known post-release correctness and data-integrity bugs

The later `main` history explicitly fixes defects that remain in v0.1.8, including:

- potentially destructive/incomplete YouTube sync handling;
- incorrect like-state SQL;
- missing download guards;
- player/matcher failures;
- logout that did not clear embedded WebView sessions;
- no request timeouts or stalled-download detection;
- weak handling of Spotify 429/error bodies;
- unrestricted artwork hosts;
- unbounded backup archive reads;
- unnecessary IPC surface;
- no single-instance protection;
- multiple inconsistent like-flow call sites;
- overlay, keyboard, focus, contrast, and expired-stream defects.

These are verified by the repository's own post-v0.1.8 fix commits, not hypothetical findings.

**Fix:** rebase the release product onto the hardening line and add regression tests for every named bug before publishing.

## High-severity findings

### H1. Main regresses major v0.1.8 features

Compared with v0.1.8, `main` removes 11 registered application commands and 10 persisted settings. Regressed functionality includes:

- browse/discover continuation paths;
- manual/fresh lyrics-provider selection;
- measured listening-time recording;
- artist follow/bookmark state;
- saved-podcast refresh and cached detail pages;
- account profile refresh;
- audio quality selection;
- playback speed/varispeed;
- incremental seek;
- pause-on-mute;
- persistent queue/session restoration;
- persisted player volume;
- taskbar thumbnail controls and assets;
- v0.1.8's richer playback/history behavior.

The safe branch is therefore not a valid replacement release as-is.

### H2. Playback is fundamentally behind upstream Meld 0.9.2

Desktop resolves only direct original YouTube URLs and rejects transformed/protected formats. Reference Meld 0.9.2 moved to InnerTubeX with automatic client fallback and specifically fixed 30-second stops plus uploaded/restricted-track playback.

Expected failures on Desktop:

- `signatureCipher`/`cipher` formats;
- `n`-transformed URLs;
- SABR-only responses;
- some age/region-restricted tracks;
- uploaded tracks depending on client response;
- service-side client changes.

This is the largest functional parity blocker. It is acceptable to avoid DRM/ad-bypass behavior, but a robust legal client-fallback/resolution architecture is still needed.

### H3. Spotify GraphQL hashes are compiled static data

Both Desktop trees use `include_str!("../resources/spotify-gql-hashes.json")`. They try current and previous hashes, but do not fetch the remote registry at startup or force-refresh when all hashes fail.

Reference Meld has remote daily hash extraction, startup sync, local caching, previous-hash retry, and hardcoded fallback. A branch named `feature/remote-gql-hash-sync` exists in the Desktop repository but is not merged.

**Risk:** Spotify integration can fail suddenly for all users until a new binary is released.

### H4. v0.1.8 backup restore can consume unbounded memory

`backup_restore` reads `song.db` and `settings.json` ZIP entries into `Vec<u8>` without entry-count or uncompressed-size caps. A malicious or accidental zip bomb selected by the user can exhaust memory or disk. `main` later adds archive caps.

**Fix:** cap archive entry count and uncompressed sizes before allocation, reject duplicate expected entries, stream to a bounded temporary file, and validate schema/version before replacement.

### H5. v0.1.8 networking can hang indefinitely

The release HTTP client has no global connect/request timeout. Large downloads also lacked a per-chunk idle timeout. Spotify rate limiting/error details were poorly surfaced. `main` later adds connect/request timeouts, a long explicit download cap, stalled-chunk detection, and retry/error-body handling.

### H6. Google/Spotify logout did not fully clear login WebView state in v0.1.8

Deleting application rows is not sufficient if the embedded login WebView retains provider cookies. A user can appear to log out and then silently reconnect to the same account. `main` adds explicit WebView session cleanup. That fix must ship with encrypted secret migration.

### H7. YouTube URL parsing is incorrect

`parseYouTubeUrl` has two clear classification errors:

1. Any `music.youtube.com/playlist?list=...` URL is treated as an **album**, even when it is a normal playlist.
2. `music.youtube.com/browse/MPRE...` is matched by the “artist” path even though `MPRE...` identifies an album/release.

This causes pasted links to open the wrong route or fail.

**Fix:** classify by ID prefix and endpoint shape. Keep playlist IDs (`PL`, `OLAK5uy_`, `RD`, etc.) as playlists; `MPRE...` as album browse IDs; `UC...`/channel browse IDs as artists. Add table-driven URL tests.

### H8. Generated share URLs are often invalid

`shareItem` constructs generic paths such as `https://music.youtube.com/album/{id}` and `/artist/{id}`. YouTube Music commonly uses `/browse/{browseId}`, `/channel/{channelId}`, `/playlist?list={playlistId}`, or watch URLs. Sharing an album/artist can therefore copy a dead or noncanonical URL.

**Fix:** centralize canonical URL generation by item kind and ID type; add tests for song, video, album, artist/channel, playlist, and podcast.

### H9. No automated release gate or CI in Desktop

The Desktop repository has no GitHub Actions workflows on the reviewed default tree. Release notes claim TypeScript, Cargo, Windows build, and smoke results, but nothing enforces these on every PR/tag.

Required gates:

- formatting, TypeScript, ESLint, frontend unit/component tests;
- `cargo fmt`, `cargo clippy -D warnings`, tests, audit/deny;
- Windows x64 build and startup smoke;
- migration/backup restore tests;
- tagged-version consistency;
- deterministic artifact checksums and signing;
- dependency/license/SBOM scanning.

## Medium-severity findings

### M1. Monolithic frontend and backend

`src/App.tsx` is 1,888 lines on `main` and over 2,200 lines in v0.1.8, with state, network orchestration, routing, playback, settings, dialogs, Spotify, library, and rendering in one component. `src-tauri/src/lib.rs` is 4,544+ lines and combines schema, migrations, HTTP clients, parsers, downloads, auth, Spotify, lyrics, backup, and commands.

This makes stale closures, accidental regressions, and merge conflicts much more likely.

**Fix:** split by domain (`player`, `queue`, `library`, `lyrics`, `auth`, `spotify`, `backup`, `downloads`), add typed service interfaces, and move reducer/state-machine logic out of JSX.

### M2. No frontend test suite

There are no React tests, URL-parser tests, queue-state tests, accessibility tests, or component interaction tests. The Rust tests mostly cover parsers, schema invariants, and secret storage; they do not cover the full app contract.

Minimum frontend coverage should include URL classification, queue/repeat/shuffle transitions, stale-play request cancellation, sleep timer, persistent session restore, like/sync partial failure, dialog focus/Escape, and settings hydration.

### M3. Duplicate “Audio quality” control in v0.1.8

The v0.1.8 settings JSX renders the same Audio quality label/select twice consecutively. This is a visible copy/paste defect and an example of why the settings screen should not remain a single very long JSX expression.

### M4. Current main's stats are less accurate than the released branch

v0.1.8 records listened seconds using `history_record_playtime`. `main` removed that command and its frontend calls. Stats can still count history entries/minutes, but no longer preserve the same measured-listening contract claimed by earlier release notes.

### M5. Lyrics behavior is already stale versus upstream

Desktop keeps Musixmatch as an opt-in provider. Reference Meld 0.9.2 removed Musixmatch because it frequently returned incorrect lyrics and adopted a newer pipeline with YouTube-synced lyrics and Zemer support. Desktop needs a provider-policy refresh, timeout/circuit-breaker behavior, provenance display, and provider-specific tests.

### M6. Spotify parity is partial, not “deep” parity

Desktop implements account connection, profile, library folders, playlists, liked-song reading, playlist add/remove/reorder/rename, fuzzy YouTube resolution, and manual overrides. Missing or incomplete compared with reference Meld:

- Spotify-powered Home;
- Spotify-powered Search and Spotify-only mode;
- top tracks/artists across time ranges;
- recommendation scoring/diversification engine;
- new releases/following/discover flows;
- Spotify album browsing;
- followed-artist sync;
- bidirectional like synchronization;
- dynamic GraphQL hash lifecycle;
- multi-tier profile cache and image enrichment;
- broad queue pre-resolution/preloading.

### M7. Downloads are not parity with upstream playback/download reliability

Desktop has useful explicit downloads, resume/cancel behavior in v0.1.8, separate cache/download storage, artwork, and lyrics caching. Missing/needs work:

- robust transformed-stream resolution;
- concurrency limits and scheduler;
- retry/backoff policy;
- disk-space preflight;
- integrity/hash verification;
- cache size/eviction settings;
- bandwidth and quality policy;
- startup reconciliation of DB rows vs files;
- richer progress/error state and retry queue.

### M8. Accessibility remains incomplete

Later main commits improve focus rings, `aria-current`, `aria-pressed`, contrast, and layering, but the UI still relies heavily on glyph-only controls, tooltips, large modal overlays, and dense one-line JSX. Add automated axe checks, focus trapping/restoration, semantic landmarks, reduced-motion support, screen-reader status regions, and keyboard reorder alternatives.

### M9. No localization architecture

Reference Meld ships 40+ languages and RTL/complex-script work. Desktop hardcodes English UI strings throughout `App.tsx`. Extract strings now before the UI grows further.

### M10. No signed updater/release trust path

The project publishes EXE/ZIP/checksums but lacks an in-app signed updater, code-signing documentation, SBOM, provenance attestation, or reproducible release workflow. Checksums hosted beside unsigned binaries do not protect against repository compromise.

### M11. Public issue tracking is disabled

The Desktop repository reports `has_issues: false`, despite release notes requiring manual validation and the app depending on unstable private APIs. Users need a supported defect-reporting path and a security policy.

### M12. Release binaries are committed into Git history

v0.1.8 tracks portable/installer binaries under `release/`. This bloats clone history and duplicates GitHub Release assets. Publish artifacts only through CI/release storage; keep source history source-only.

### M13. Release naming/version history is inconsistent

- Public latest is v0.1.8, while `main` reports 0.1.0.
- v0.1.7 notes say profile refresh was introduced in v0.1.5, but there is no v0.1.5 GitHub release/tag in the reviewed release list.
- v0.1.2 and v0.1.3 assets still contain `0.1.0` in filenames.
- MSI availability changes across releases without a stable support policy.
- v0.1.4 explicitly says it was published from a non-main feature branch.

### M14. Architecture has no durable API boundary

The frontend directly invokes dozens of string-named commands and duplicates backend model shapes manually. Contract drift is only caught at runtime.

**Fix:** generate TypeScript bindings from Rust command/types or introduce a typed IPC client module and schema validation for every response.

## Low-severity / polish findings

1. Add README screenshots, architecture diagram, data-directory paths, troubleshooting, and known-issue table.
2. Add `CONTRIBUTING.md`, `SECURITY.md`, issue templates, PR template, code of conduct, and support policy.
3. Add changelog to `main`; it was deleted while release history remained external.
4. Add structured logging with redaction and an exportable diagnostic bundle.
5. Add crash recovery and a safe-mode/reset path for corrupt local state.
6. Add proper empty/error/offline states per feature instead of a shared notice string.
7. Add virtualization for very large playlists/libraries; the current React lists can render many nodes at once.
8. Add optimistic-action reconciliation: local like/library success followed by remote failure needs a visible retry state, not only a transient notice.
9. Normalize formatting/line endings and enforce Prettier/Rustfmt in CI; several config/JSX sections are visibly inconsistent.

## 1:1 feature comparison against Meld 0.9.2

Legend: **Yes** = materially implemented; **Partial** = narrower/different contract; **No** = absent; **N/A** = Android-only and needs a Windows equivalent rather than literal copy.

| Area | Reference Meld 0.9.2 | Desktop v0.1.8 | Main | Assessment / action |
|---|---|---:|---:|---|
| YouTube Music home/search/browse | Full, InnerTubeX | Partial | Partial | Core UI exists; resolver/client fallback is behind upstream |
| Search by pasted URL | Yes | Partial | Partial | Fix playlist/album/artist classification |
| User profile search | Yes | No | No | Add profile result/parser/UI |
| Albums/artists/playlists/details | Yes | Partial | Partial | Core detail pages exist; endpoint coverage differs |
| Personalized Speed Dial | Yes | Yes | Yes | Good baseline |
| Direct playback | Multi-client fallback | Partial | Partial | Major parity blocker |
| Uploaded/restricted tracks | Fixed in 0.9.2 | Unreliable | Unreliable | Requires supported authenticated client fallback |
| Crossfade | Yes | No | No | Needs real Windows audio graph |
| Skip silence | Yes | No | No | Needs audio analysis/graph |
| Loudness normalization | Yes | No | No | Needs ReplayGain/loudness pipeline |
| Equalizer | Yes | Not materially exposed | No | v0.1.8 contains dormant setting keys but no complete UI/graph |
| Tempo/pitch/varispeed | Yes | Partial | No | v0.1.8 HTMLAudio rate/pitch behavior only |
| Audio quality | YouTube + Qobuz tiers | Partial | No | v0.1.8 high/low direct formats; Auto is not metered-aware |
| Qobuz lossless | Experimental full path | No | No | Large missing integration |
| Queue/reorder/play next | Yes | Yes | Yes | Add more state-machine tests |
| Persistent queue/session | Yes | Yes | No | Merge safely from v0.1.8 |
| Shuffle/repeat | Yes | Yes | Yes | Upstream has additional repeat/crossfade fixes |
| Smart Spotify queue engine | Yes | No | No | Desktop resolves selected tracks but lacks recommendation engine |
| Windows media integration | Android media session equivalent | Partial | No/regressed | v0.1.8 taskbar controls; add SMTC/global media keys |
| Explicit downloads | Yes | Yes | Yes | Good base; improve scheduler/integrity/disk controls |
| Playback cache | Yes | Yes | Yes | Add eviction/size policy |
| Local files | Yes | Yes | Yes | Add watched folders/metadata editing resilience |
| Lyrics provider pipeline | New upstream pipeline | Partial | Partial | Remove/reevaluate Musixmatch; add Zemer/translation |
| Synced lyrics/seek | Yes | Yes | Yes | Good base |
| Copy all lyrics | Yes | Yes | Yes | Present |
| Lyrics auto-scroll resume | Yes | Partial | Partial | Ensure timed resume after manual scroll matches upstream |
| Google login/library sync | Yes | Partial | Partial | Security improved only on main; endpoint parity incomplete |
| Spotify login/profile | Yes | Yes | Yes | v0.1.8 storage is insecure |
| Spotify library folders/playlists | Yes | Yes | Yes | Strongest parity area |
| Spotify liked songs | Yes | Read-only/partial | Read-only/partial | Missing bidirectional like sync |
| Edit Spotify playlists | Yes | Yes | Yes | Add broader pagination/conflict tests |
| Spotify Home/Search/only mode | Yes | No | No | Major missing product identity |
| Spotify album browsing | Yes | No | No | Add album/artist models and screens |
| Spotify new releases/following | Yes | No | No | Missing |
| Dynamic Spotify GQL hashes | Yes | No | No | Merge remote sync branch with signature/integrity checks |
| Local playlists | Yes | Yes | Yes | Add import/export and position control |
| Playlist range selection | Yes | No | No | Add Shift/range semantics |
| Highlight already-in-playlist | Yes | No/unclear | No/unclear | Query membership before picker display |
| Add at start/end | Yes | No | No | Add preference/action |
| CSV/M3U import/export | Yes | No | No | Missing |
| Podcasts/channels/subscriptions | Full | Partial | Partial/regressed | Guest access, queue behavior, and cache need work |
| Podcast resume position | Yes | No | No | Missing |
| Podcast cached details | Yes | Yes | No | Main regression |
| Sleep timer duration/end/fade | Yes | Yes | Yes | Scheduling by clock/time is missing |
| Scheduled sleep timer | Yes | No | No | Missing |
| History/local stats | Yes | Yes | Partial | Main lost measured listening-time recording |
| Compare artists | Yes | No | No | Missing |
| Weekly/monthly recap playlists | Yes | No | No | Local recap is not equivalent |
| Play all from stats | Yes | Partial | Partial | Validate queue context |
| Last.fm | Yes | No | No | Missing integration/scrobble lifecycle |
| Discord Rich Presence | Yes | No | No | Missing Windows IPC integration |
| Listen Together | Yes | No | No | Missing signaling/sync service |
| SponsorBlock | Yes | No | No | Missing optional privacy-safe segment skipping |
| Cast | Yes | No | No | Needs sender/session/receiver contract |
| Music recognition | Yes | No | No | Windows equivalent required |
| Themes/dynamic color/black | Yes | No | No | Desktop has one dark shell |
| Localization/RTL | 40+ languages | No | No | Missing architecture and translations |
| Backup/restore | Yes | Yes | Yes, safer | Ship bounded restore and encrypted-secret handling |
| Signed updater | Yes/standalone flows | No | No | Missing |
| Android Auto/widget/quick tile | Android-specific | N/A | N/A | Define Windows SMTC, Jump List, tray, widget equivalents |
| AI lyric translation/models | Yes | No | No | Missing; optional future feature |

## Review of Desktop release notes

### v0.1.0-desktop

Useful honest limitation disclosure. However, it already claimed a broad app surface without automated release evidence, and authentication/download paths later required substantial hardening.

### v0.1.0-desktop-source-parity

The phrase “source-parity” is too strong. The same notes admit no protected/transformed streams, no advanced DSP, no Last.fm/Discord/Listen Together/Qobuz/Cast/updater/recognition/Android equivalents, and incomplete Spotify behavior.

### v0.1.1-ui-fixes

Targeted fixes are reasonable, but the artifact was a raw EXE named `0.1.0`, making version provenance unclear.

### v0.1.2-safe-gap-batch

Good transparency about contract-gated features. “Safe” became misleading once later reviews found plaintext credentials, disabled CSP, broad asset scopes, unbounded restore, and missing network guards.

### v0.1.3-lyrics-provider-picker

Provider picker was useful. Upstream later removed Musixmatch due wrong matches, so Desktop should revisit the list and provider quality policy.

### v0.1.4

This release explicitly came from `feat/source-parity-next` and did not update `main`, creating the branch split that now blocks trustworthy releases.

### v0.1.6

Claims account refresh and player title fixes. It references the MSI as “for user testing” without a stable packaging/support policy.

### v0.1.7

Says profile refresh was introduced in v0.1.5, but no v0.1.5 release/tag appears in the public reviewed history. Correct the historical record.

### v0.1.8

Small UI-layering release, but it packages the insecure branch. It should be superseded by a security release after branch reconciliation.

## What was done well

- Clear GPL attribution and an honest statement that the project is not official Meld.
- Tauri/Rust/SQLite is a reasonable Windows-native choice.
- Downloads and playback cache are separated conceptually.
- Backup intentionally excludes media and account sessions.
- Direct local playback avoids unnecessary remote resolution.
- Stale playback request cancellation (“last click wins”) is thoughtful.
- Queue continuation, automix, repeat/shuffle, and local library flows are substantive.
- Lyrics provider ordering, synced lines, offline lyrics caching, and manual provider selection in v0.1.8 are useful.
- Spotify playlist folders/editing and manual YouTube match override are meaningful, not fake toggles.
- Later `main` hardening—credential encryption, CSP, bounded asset scope, network timeouts, archive limits, single instance, and accessibility fixes—is good work and should be preserved.
- Both reviewed frontend trees build cleanly, and npm reported no known vulnerabilities.

## Recommended execution plan

### Phase 0 — Stop-ship reconciliation

1. Create `release/0.2.0` from v0.1.8.
2. Merge every post-release hardening commit from `main`.
3. Resolve the 11 removed commands and 10 removed settings one by one; do not accept silent regressions.
4. Migrate plaintext credentials to encrypted storage and test upgrade from a real v0.1.8 database.
5. Adopt main's CSP, asset scopes, backup caps, URL validation, network timeouts, single-instance behavior, and WebView logout clearing.
6. Set package/Cargo/Tauri versions consistently.
7. Add a changelog entry explicitly superseding v0.1.8 for security.

### Phase 1 — Correctness and release engineering

1. Add CI on Windows and Linux validation runners.
2. Add typed IPC bindings and split monoliths by domain.
3. Add URL/share table tests and fix routing.
4. Add frontend queue/player/settings/accessibility tests.
5. Add database migration, partial-sync, backup/restore, and download reconciliation tests.
6. Remove binaries from source history going forward.
7. Enable issues, add security policy, templates, and diagnostic bundle.
8. Sign installers and produce SBOM/provenance/checksums from CI.

### Phase 2 — Core parity before integrations

1. Build a robust legal playback resolver/client fallback comparable to InnerTubeX.
2. Restore v0.1.8 session/volume/playtime/podcast/provider features onto the hardened branch.
3. Implement podcast resume and guest podcast behavior.
4. Add playlist membership highlighting, range selection, insertion position, and CSV/M3U import/export.
5. Add cache/download quotas, eviction, disk-space checks, retry scheduler, and integrity checks.
6. Implement Windows SMTC/global media keys and preserve taskbar controls.

### Phase 3 — Meld identity parity

1. Spotify Home, Search, only mode, albums, top artists/tracks, and recommendation engine.
2. Dynamic GraphQL hash registry with authenticated integrity/versioning.
3. Bidirectional Spotify likes and followed-artist sync.
4. New releases/following/discover.
5. Qobuz only after a stable, authorized resolver contract and clear risk disclosure.

### Phase 4 — Optional/platform equivalents

- Last.fm, Discord RPC, Listen Together, SponsorBlock, Cast.
- Theme/i18n/RTL framework.
- Signed updater.
- Windows tray, Jump List, widgets, startup integration, recognition shortcut.
- Crossfade, normalization, equalizer, skip silence using a tested native audio graph.

## Release acceptance checklist

A future release should not be called “parity” until:

- tag is an ancestor of `main` and source matches binaries;
- one version appears in package, Cargo, Tauri, UI, filenames, and release notes;
- no plaintext session material remains after migration;
- CSP and filesystem scopes are narrow;
- all network calls have timeouts/cancellation/retry policy;
- backup restore is bounded and schema-versioned;
- frontend/Rust tests and Windows smoke run in CI;
- installer is signed and release has SBOM/provenance;
- all “implemented” controls are verified functional;
- parity matrix is published with platform-specific exclusions clearly labeled.

