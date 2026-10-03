# Meld Desktop — Session log

## 2026-10-01 — Session 1 (Phase 0)

**Done**
- Reconciled `v0.1.8` with `main` on `reconcile/0.2.0` (PR #14): all 15 `main` commits cherry-picked with `-x`, conflicts resolved feature-preserving (D-001…D-005); `main` merged with `-s ours`; PR merged with a merge commit so `v0.1.8` is an ancestor of `main`.
- Version 0.2.0 from `package.json`; `check-versions`, `check-security-config` (CSP, asset scope, IPC, NSIS-only bundle, no committed binaries), `check-ui-invariants` with node tests.
- Upgrade test from a real v0.1.8-schema database (secrets sealed, no plaintext left, library kept, interrupted download resumable).
- rustfmt/clippy `-D warnings` clean; `Cargo.lock` repaired (D-009).
- Windows CI (`windows-latest`, SHA-pinned actions) green; branch protection on `main` requires it (no required review yet — a solo maintainer cannot approve their own PRs; S5-097 left open).
- Issues, secret scanning, push protection, private vulnerability reporting and Dependabot alerts enabled.
- Corrected CHANGELOG; SECURITY, CONTRIBUTING, code of conduct, issue/PR templates; plan docs in `docs/plan/`.

**In progress / not ticked (need tests or later phases)**
- TR-H4, TR-H5, TR-H6, TR-M4: code kept from `main`/v0.1.8 but no dedicated tests yet.
- PLAY-021, PLAY-031, PLAY-035, PLAY-055, QUEUE-001: need frontend tests (M1.4) / full resume tests / a 0.2.0 release from `main`.
- R6-075, TR-H9, TR-L9: full CI gates (ESLint, Prettier, Vitest, cargo audit, release workflow) arrive in M1.4 / Phase 8.

**Blockers**
- Manual Windows smoke (install over 0.1.8, sign-in, playback, taskbar buttons) needs a Windows machine — owner.
- D-008: tag collision with upstream Meld tags `v0.2.0`…`v0.8.8`; owner must choose before tagging 0.2.0.
- Code-signing certificate and updater keys for releases (Phase 8).

**Next task:** TR-H5 (timeouts/stall regression tests), then TR-H4, TR-H6, TR-M4 to finish Phase 0; then Phase 1 M1.1 starting at U4-001.

## 2026-10-02 — Session 2 (finish Phase 0, first release pipeline)

**Done**
- Deleted the 17 inherited upstream Meld tags (owner confirmed the repo is not a fork; D-008).
- PR #15: regression tests and small refactors for TR-H4 (restore streams `song.db` to disk, size caps), TR-H5 (timeouts, stall detection), TR-H6 (sign-out removes every session row; CI guard that both logouts clear WebView data), TR-M4 (measured playtime in stats).
- PR #16: signed in-app updates (Rust-side `tauri-plugin-updater`, Settings → About, daily quiet check, pre-update DB backup), Tauri 2.12, Vitest, release workflow (build → Windows smoke → publish) producing NSIS setup, portable ZIP (now with taskbar icons, `portable.marker`, notices), `.sig` files, `latest.json`, `SHA256SUMS.txt`, CycloneDX SBOM, `THIRD-PARTY-NOTICES.txt`, provenance attestations; npm/cargo audits (D-010…D-013).
- Windows smoke on `windows-latest` passed: silent install of 0.1.8 → seeded plaintext secrets → install 0.2.0 over it → secrets sealed, no plaintext in the file, library kept; portable ZIP starts; silent uninstall keeps data.
- Updater key pair generated; private key + password stored as Actions secrets, backup handed to the owner, local copies deleted.

**Blockers / owner actions**
- Authenticode certificate (D-010): apply for SignPath Foundation (free for OSS) or Azure Trusted Signing; until then releases are unsigned and say so.
- Manual check on a real PC: Google/Spotify sign-in and playback (cannot be automated without real accounts).
- Branch protection review requirement (S5-097) needs a second maintainer.

**Next task:** Phase 1 M1.1 — U4-001 (split `App.tsx` into route-level screens), with M1.4 test harness work (R6-075: ESLint, Prettier) alongside.

## 2026-10-02 — Session 3 (0.2.0 playback/search hotfix → 0.3.0)

**Done**
- Root cause of "The native audio element could not read the resolved stream URL": the asset-protocol scope used `$APPDATA/Meld Desktop`, which in Tauri 2 resolves to the bundle-identifier folder, so every cached/downloaded file was blocked. Scope now `$DATA/Meld Desktop/...` plus runtime `allow_directory` for the media folders (D-014, PLAY-030).
- Root cause of missing search results: YouTube Music now returns a `musicCardShelfRenderer` top result plus one `itemSectionRenderer` per result. Parser reads card, shelf and item sections; fixture test added (D-015).
- Protected-stream path modelled on Meld Android: ciphered formats are kept and the signature and `n` challenges are solved by the vendored EJS 0.8.0 solver in a sandboxed QuickJS (memory, stack, deadline limits; SHA-256-pinned vendor files; player JS cached on disk) (D-016, PLAY-005, PLAY-006).
- Client catalog with direct clients first, then JS-solved clients (WEB_REMIX, TV, embedded, creator); 5-minute per-video failure memory; failure taxonomy, redacted diagnostics, "Copy playback report"; frontend re-resolves an expired/failed stream up to twice and keeps the position (D-017, PLAY-009, PLAY-015, PLAY-032).
- Live tests from CI-like network: WEB_REMIX solved URL returned HTTP 206; direct clients returned 206.
- SBOM lists the vendored JS packages; NOTICE has a bundled third-party section.

**Partial (not ticked)**
- PLAY-002, PLAY-007, PLAY-013 (redirect-hop validation), PLAY-016, PLAY-033.

**Blockers / owner actions**
- TV clients answer "page needs to be reloaded" from datacenter IPs; behaviour from a home connection unverified.
- Real-PC check of Liked Songs playback and sign-in after 0.3.0.
- Authenticode certificate (D-010) still pending.

**Next task:** PLAY-013 (validate every redirect hop), then Phase 1 M1.1 — U4-001.

## 2026-10-02 — Session 4 (offline-download fix, unreleased)

**Done**
- Root cause of "audio cache response failed: HTTP 403" for offline downloads: ANDROID_VR 1.65.10 stream URLs (first client in the order) serve only the first ~800 KB and answer 403 for later ranges, `bytes=0-` and plain GETs. The audio element only fetched the start, so playback looked fine while every download failed. Reproduced live.
- Resolver range-probes 1 KiB past the first MiB of each new URL; refused URLs (`StreamForbidden`) exclude the client for that song and demote it for 30 min for all songs (D-018).
- Downloads use range requests, re-resolve with another client on a refused URL and resume from the partial bytes (max 3 requests), restart on 416. Truncated transfers are not saved as complete (PLAY-044, partial). Errors no longer contain signed URLs.
- Live test now downloads each client's full stream: ANDROID_VR 1.65.10 rejected by the probe; WEB_REMIX, VISIONOS, ANDROID_VR 1.43.32, IOS deliver 3,433,755/3,433,755 bytes.

**Blockers / owner actions**
- Same as session 3 (Authenticode certificate, real-PC check). The sandbox was reset between sessions, so the GitHub token had to be supplied again.

- Owner decision: no more interim releases; one large release when the plan is finished. Fixes land on `main` under `[Unreleased]`.

- Step 2: bounded player-cache fills, cancelled on skip, removal and exit (PLAY-042, PLAY-043, D-019); tests against a local HTTP server prove cancellation releases the socket and file within 3 s and stalls give up.
- Step 3: playback-cache limit with LRU eviction, usage UI, start-up orphan cleanup (PLAY-041, R6-023, R6-026, D-020).

**Next task:** TR-L9 (Prettier/ESLint, line endings, enforced in CI), then R6-075/TR-H9 (required checks).

## 2026-10-02 — Session 5 (tooling, CI protection, Phase 1 router work, unreleased)

**Done**
- TR-L9: Prettier + ESLint, line endings, enforced in CI (#21).
- R6-075 / TR-H9: required checks; branch protection on `main` (Windows build and tests, Lint and format, Dependency audit, Release dry run; strict; admins included) (#22).
- Step 6 tests: QUEUE-001, PLAY-021/031/035/055 (D-023, D-024) (#23).
- U4-001 (D-025) App.tsx split into screens; U4-002 (D-026) 12 feature hooks (#25 merged into #24; #24 targets `main`).
- U4-003/U4-004 typed routes + route-based Back/Forward with tab and scroll (D-027); U4-005 one overlay stacking order (D-028); U4-006 restore last safe page (D-029); U4-007 one link parser `src/app/links.ts` (D-030; fixes YTM playlist/album link bug). Branch `feat/u4-003-router`.

**Partial / open**
- PR #24 (U4-001/U4-002) waiting for the Windows CI check, then merge.
- `feat/u4-003-router` (U4-003…U4-007) pushed; PR must be merged after #24 (bring branch up to date with `main` first; strict protection).
- `feat/source-parity-next` commit a0227856 (like-response/avatar fix) is not on `main` — owner to confirm porting.

**Next task:** merge #24, then the router PR, then U4-008 (separate server state from view state), U4-009…U4-015, TR-M1.

## Session 6 (continued)
- Merged: #26 (U4-003…007), #27 (U4-008/009), #28 (U4-010/011), #29 (U4-012/013), #30 (U4-014), #31 (U4-015).
- Open: **#32** `feat/s5-004-permissions`: TR-M1 partial (D-038), S5-001/002 (D-039), S5-003 (D-040), S5-004/005 (D-041). All local checks passed (JS checks, cargo fmt, clippy -D warnings, cargo test); merge after Windows CI.
- Partial: TR-M1 (helpers still in lib.rs, App.tsx still holds menu actions/playback). Known limit: local playlist removal removes every copy (needs per-entry ids).
- Next task: merge #32, then **S5-007** (structured IPC errors), then S5-006. Owner decision still open: commit a0227856 on feat/source-parity-next.

## 2026-10-03 — Session 7

**Done (merged to `main`)**
- #32 TR-M1 step + S5-001…S5-005. #33 S5-007 structured `IpcError` (D-042). #34 S5-006 validated payload newtypes (D-043). #35 S5-008 IPC limits (D-044). #36 S5-009 cancellation (D-045).

**Done, open PRs (stacked; each ticks PROGRESS/DECISIONS on its branch)**
- #37 S5-010 event contract (D-046) → `main`. Fixed Windows CI: `events.test.ts` used `node:fs` (no Node types in `tsc`); tests now read sources with `import.meta.glob(..., { query: "?raw" })`.
- #38 S5-011 generated TS bindings via tauri-specta, typed `call()` (D-047) → base `feat/s5-010-event-contract`.
- #39 PLAY-010 PoToken provider: BotGuard in a hidden, IPC-less webview, owner request (D-048) → base `feat/s5-011-ts-bindings`. Needs a manual Windows check (WebView2).
- #40 S5-012 IPC contract tests + `payload::Bounded` limits (D-049) → base `feat/play-010-potoken`.

**Declined:** Qobuz playback through third-party rip/download hosts (paywall/DRM bypass, §0.2).

**GitHub alerts (owner):** secret-scanning alert for the Google key in `potoken/mod.rs` is Google's public BotGuard web key, not a credential (close as false positive). Dependabot: `glib` (Linux-only via Tauri, not in the Windows app) and Vitest `@vitest/mocker` (dev-only; upgrade in a small PR).

**Next task:** merge #37 → #38 → #39 → #40 in order (retarget each to `main`, merge `main` in, wait for Windows CI). Then **TR-M14** (last open M1.2 task: response validation on top of the bindings), then TR-M1 rest, then D3-001.
