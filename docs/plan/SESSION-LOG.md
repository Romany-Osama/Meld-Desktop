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
