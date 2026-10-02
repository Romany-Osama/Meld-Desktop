# Meld Desktop — Decisions

Architecture and scope decisions, newest last. Each entry: context, decision, evidence/tests. Source of truth for task text: `MASTER-PLAN.md`.

## D-001 — Phase 0 reconciliation strategy (branch `reconcile/0.2.0`)
- **Context:** `main` (e7194c2e) and the released `v0.1.8` (5f1aaf53) diverged at d56350a0: 15 hardening commits only on `main`, 62 feature commits only on the release line (plan §5).
- **Decision:** Branch from `v0.1.8`, cherry-pick all 15 `main` commits with `-x` (bc3d65c4 re-applied as `.gitattributes` + `git add --renormalize`), resolve each conflict feature-preserving (D-002…D-005). Because every `main` change is already on the branch, `main` is then merged into the branch with `git merge -s ours origin/main` (no content change, just ancestry), and the PR is merged into `main` with a **merge commit** (never squash) so that `v0.1.8` and every released tag become ancestors of `main` (`git merge-base --is-ancestor v0.1.8 origin/main`).
- **Evidence:** every non-merge commit in `d56350a0..e7194c2e` has a matching `(cherry picked from commit …)` trailer on the branch (or is the renormalize commit 094aa7a3).

## D-002 — Cherry-pick 1/15 `b0315cad` (review fixes) onto v0.1.8
- **Context:** `main` marks `downloading` rows `failed` at startup; v0.1.8 (`840cd1d1`) turns interrupted downloads into resumable `cancelled` rows.
- **Decision:** Keep the startup cleanup but set `state='cancelled'`, `error='download interrupted; retry to resume'`, so the `.part` file stays resumable (PLAY-055) and no row is stuck in `downloading`.
- **Also:** kept v0.1.8's `playRequestIdRef` ("last click wins") and dropped main's duplicate `playSeqRef`, adding main's extra stale check after autoplay queue resolution; kept v0.1.8 lyrics prefetch with real duration (main used `-1`); kept `account_save_session` and `account_refresh_profile` (TR-H1); added `account_avatar` to the moved `AuthSession`/`SessionStatus` structs; adopted `SCHEMA_SQL` const, Fisher–Yates `shuffled()`, `ActiveDownloadGuard`, 5-minute library sync throttle, sleep-timer ref fix and all regression tests.

## D-003 — Cherry-pick 4/15 `58e116aa` (sealed secrets): seal `sp_dc`/`sp_key` instead of deleting them
- **Context:** `main` deletes `spotifySpDc`/`spotifySpKey` at startup, so the Spotify token can never be refreshed without a new login. The master plan (5.2, S5 "Make Spotify reconnect durable") overrides this.
- **Decision:** `SEALED_KEYS` = `cookie`, `spotifyAccessToken`, `spotifySpDc`, `spotifySpKey`; nothing is deleted. Login saves `sp_dc`/`sp_key` sealed (AES-256-GCM, key in Credential Manager). The startup migration seals v0.1.8 plaintext and `VACUUM`s. If secure storage is unavailable, plaintext stays in place until the next start (same as `cookie`). Using the sealed `sp_dc` for automatic token refresh is tracked under Phase 2 (M2.2), not done here.
- **Tests:** `secrets::tests::migration_encrypts_every_plaintext_secret_and_leaves_no_plaintext_in_the_file`, `migration_keeps_the_session_working_when_secure_storage_is_unavailable`.

## D-004 — Cherry-pick 8/15 `9a0b63fd` (IPC surface): which v0.1.8 commands are restored vs retired
- **Restored (registered, have UI callers):** `account_refresh_profile`, `fetch_lyrics_fresh`, `fetch_lyrics_from_provider`, `history_record_playtime`, `library_artist_state`, `library_toggle_artist_bookmarked`, `ytm_browse`, `ytm_browse_continuation`, `ytm_podcast_cache_detail_page`, `ytm_refresh_saved_podcasts`.
- **Retired (code kept, unregistered, `#[allow(dead_code)]`):** `account_save_session` (no UI caller in v0.1.8 or main; it let the webview write an arbitrary Google cookie; login uses `save_account_session_internal` directly), `clear_guest_session` (no UI caller; `account_logout` covers it and now also clears WebView data), `spotify_search_tracks` and `ytm_podcast_episodes` (no UI caller; superseded by matcher/per-channel browsing).
- **Kept registered:** the 9 `library_*`/`ytm_podcast_channels` commands main flagged as unused are in fact called through a variable command name in `App.tsx` (verified by search), so they stay.
- **Evidence:** `grep` of `src/` for each command name on the reconciled branch. A contract test that every registered command has a caller arrives with typed IPC (M1.2).

## D-005 — Cherry-pick 15/15 `0d7814d3` (expired-stream recovery) on top of v0.1.8 session restore
- **Context:** v0.1.8 keyed the audio-source effect on the whole `player` object (any metadata refresh restarted the song); `main` keyed it on `player.item.id` (replaying the same song would not restart). PLAY-035 asks for a unique playback session ID.
- **Decision:** `player` now carries `session` (from `playbackSessionRef`, bumped on every `playItem()`); the effect is keyed on `player.session`. Kept v0.1.8's resume/persistent-session start logic inside the effect. `recoverExpiredStream()` from `main` re-resolves with the same `playlistId` and `audioQuality` as normal playback, refuses to apply if the session changed meanwhile, and only patches `payload` for the same session.
- **Also:** the `setNotice`/auto-skip fallback from `main`'s `onError` is unchanged.
- **Tests:** frontend tests start in Phase 1 (M1.4); PLAY-031/PLAY-035 stay unticked until then.

## D-006 — Packaging: NSIS setup + portable ZIP only, no MSI
- **Context:** MSI availability changed from release to release (TR-M13) and `main` switched to `targets: "all"` (S5-070). Plan §7: NSIS + portable.
- **Decision:** `bundle.targets = ["nsis"]`, `webviewInstallMode = embedBootstrapper` (silent). The portable ZIP is assembled by the release workflow (Phase 8). Taskbar thumbnail icons are bundle resources resolved by the taskbar plugin via `BaseDirectory::Resource`, so they work in both packages without a loose folder.
- **Tests:** `scripts/tests/checks.test.mjs` "bundle: …" (S5-070); `npm run check:security` in CI.

## D-007 — Local builds use a scratch lockfile; CI is the source of truth for `--locked`
- **Context:** The agent's sandbox crates mirror lacks some versions pinned in `Cargo.lock`.
- **Decision:** Local checks run in a scratch copy with its own lockfile; the repo `Cargo.lock` is edited only for the intended changes (single-instance plugin, `url`, version) and `windows-latest` CI runs `cargo clippy/test --locked` as the authority.

## D-008 — Tag namespace collision with upstream Meld tags (OPEN — needs owner decision)
- **Context:** This repository also contains upstream Meld (Android) tags `v0.1.1` and `v0.2.0`…`v0.8.8` (e.g. `v0.2.0` → 1d2f1122, by the upstream author). Plan §7.1 wants Desktop tags `vX.Y.Z`, so the Desktop `v0.2.0` … `v0.8.x` tags would collide, and the updater/`latest.json` and Releases list would be ambiguous.
- **Options:** (a) delete the inherited upstream tags from this fork (destructive, owner only; upstream history stays in the upstream repo); (b) use a Desktop prefix such as `desktop-v0.2.0` everywhere (scripts, CI, updater).
- **Status:** not decided; no 0.2.0 tag will be created until the owner chooses. CHANGELOG notes that these tags are not Desktop releases.

## D-009 — Repair `Cargo.lock` entries corrupted by the 0.1.8 version bump
- **Context:** First Windows CI run failed `--locked`: `xz2 0.1.8` does not exist. The v0.1.8 bump had replaced `0.1.7` with `0.1.8` across `Cargo.lock`, so `crypto-common`, `windows-version`, `xz2` and `zerofrom-derive` claimed 0.1.8 while keeping the 0.1.7 checksums (verified against the crates.io index; the other 575 registry entries match).
- **Decision:** Restore those four entries to 0.1.7. `scripts/bump-version.mjs` only edits the `meld-desktop` package entry, so this cannot recur through the script; CI `--locked` catches any other drift.

## D-008 update — upstream tags removed (2026-10-02)
- The owner confirmed this repository is no longer a fork. The 17 inherited upstream tags (`v0.1.1`, `v0.2.0`…`v0.8.8`) were deleted from `origin`; their commits remain in history. Desktop releases use plain `vX.Y.Z` tags (plan §7.1).

## D-010 — Releases are not Authenticode-signed until a certificate exists
- **Context:** Plan §7.3 step 4 needs a code-signing certificate (e.g. Azure Trusted Signing, or SignPath's free open-source program). Only the owner can apply/pay for one.
- **Decision:** Publish unsigned NSIS/portable builds and say so in every release note (SmartScreen warning, how to verify with `SHA256SUMS.txt`). Integrity of *updates* is still guaranteed by the Tauri updater signature (minisign key below). When a certificate is available, add `bundle.windows.signCommand` and the signing secrets; no other change is needed.

## D-011 — Updater: Rust-side commands, signed artifacts, portable gets a link
- **Decision:** `tauri-plugin-updater` is used only from Rust (`updates::app_update_check`, `app_update_install`, `app_open_releases_page`), so no updater permission is granted to the WebView. The endpoint is `releases/latest/download/latest.json`; the public key is in `tauri.conf.json`, the private key and password are the Actions secrets `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)` (a backup copy was handed to the owner). Install happens only on an explicit click, takes a `VACUUM INTO` backup to `backups/pre-update-X.Y.Z.db` (newest 3 kept) and runs the installer in passive mode. Automatic checks run at most once per 24 h, 15 s after start, and only show a notice. This required Tauri 2.12 (crate and `@tauri-apps/*` npm packages updated together).
- **Portable:** self-update (§7.6 swap helper) is not implemented yet; a portable copy (`portable.marker` next to the exe) is told about the update and offered the release page — no fake "install" button.
- **Tests:** `updates::tests::*` (marker detection, backup naming, backup copy + retention), `src/lib/updates.test.ts` (24 h schedule, progress text), `scripts/tests/release.test.mjs` (latest.json shape, notes, tag check, sums, SBOM/notices).

## D-012 — Portable ZIP shares the installed data location for now
- **Context:** Plan §7.7 portable mode (data next to the exe, DPAPI key file) is Phase 8 work.
- **Decision:** Until then the portable ZIP behaves like 0.1.8's: data in `%APPDATA%\Meld Desktop`, key in Credential Manager. `README-portable.txt` says so. Unlike 0.1.8 the ZIP now includes `icons/taskbar/*.ico`, so taskbar thumbnail buttons work in the portable copy too.

## D-013 — `cargo audit` policy for releases
- **Decision:** The release workflow fails on any RustSec *vulnerability* and on `npm audit --omit=dev` high/critical findings. Informational warnings are reviewed here instead of blocking: `glib 0.18` (unsound iterator; GTK, Linux-only — not in the Windows build), `paste`/`proc-macro-error` (unmaintained, build-time proc macros from Tauri's dependency tree), `chacha20 0.10.1` (yanked; present in `Cargo.lock` but not in the resolved Windows or Linux dependency graph). Re-check on every Tauri upgrade; full `cargo deny` policy arrives with M1.4 (S5-090/R6-075).
