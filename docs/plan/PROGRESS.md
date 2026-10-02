# Meld Desktop — PROGRESS

Tick a box only when the task's Done-when criterion is met and tests exist. Source of truth for task text: MASTER-PLAN.md.


## Phase 0 · M0.1 Branch reconciliation

- [ ] QUEUE-001 (P0) Use one canonical branch
- [x] TR-C1 (P0) Default branch and released product have diverged — merge-base check; upgrade test
- [x] TR-C2 (P0) v0.1.8 stores Google/Spotify credentials in plaintext SQLite — secrets::tests::migration_*, upgrade_from_a_v0_1_8_database_*
- [x] TR-C3 (P0) v0.1.8 disables CSP and grants asset access to broad user folders — checks.test.mjs security
- [x] TR-C4 (P0) v0.1.8 contains known post-release correctness/data-integrity bugs — youtube_sync_*, like_state_save_*, active_download_guard_*, every_song_delete_*, spotify_matcher_*
- [x] TR-H1 (P0) Main regresses major v0.1.8 features — checks.test.mjs ui (restored commands registered)
- [x] TR-H4 (P0) v0.1.8 restore can consume unbounded memory — extract_backup streams song.db to disk, caps entries; backup_restore_* tests
- [x] TR-H5 (P0) v0.1.8 networking can hang indefinitely — api_requests_time_out_*, a_transfer_that_stops_sending_data_is_reported_as_stalled
- [x] TR-H6 (P0) Logout did not clear login WebView state (v0.1.8) — signing_out_removes_every_session_row_*, checks.test.mjs logout
- [x] TR-M3 (P0) Duplicate Audio quality control in v0.1.8 settings — checks.test.mjs ui (duplicate Audio quality)
- [x] TR-M4 (P0) Main stats less accurate (playtime removed) — stats_use_measured_listening_time_instead_of_song_length

## Phase 0 · M0.2 Restore v0.1.8 playback features on the reconciled branch

- [x] PLAY-001 (P0) Reconcile the two playback branches — v0.1.8 is an ancestor of main (D-001)
- [ ] PLAY-021 (P1) Main removed quality support entirely
- [ ] PLAY-031 (P1) v0.1.8 has no expiry recovery
- [ ] PLAY-035 (P1) Main's effect is keyed only by song ID
- [ ] PLAY-055 (P1) Main removed resume entirely — partial: Windows smoke + upgrade test cover app-restart state; cancel/restart resume tests pending
- [x] PLAY-056 (P1) v0.1.8 can leak an “active download” lock on early return — active_download_guard_clears_the_map_on_early_return
- [x] PLAY-091 (P1) No branch/version contract test — checks.test.mjs versions

## Phase 0 · M0.3 Version truth, minimal CI, repository hygiene

- [x] S5-013 (P0) Keep CSP enabled (regression guard) — check:security
- [x] S5-037 (P0) Keep asset scope narrow (regression guard) — check:security
- [x] S5-070 (P0) Restore missing bundle settings — checks.test.mjs bundle
- [x] S5-071 (P0) Single source of version truth — check:versions
- [x] S5-095 (P0) Secret scanning and push protection — secret scanning + push protection enabled
- [ ] S5-097 (P0) Branch protection — partial: main requires CI; review requirement and signed tags pending (solo maintainer)
- [x] R6-073 (P0) Add GitHub Actions CI — .github/workflows/ci.yml
- [x] R6-074 (P0) Windows runner as the primary target — windows-latest job
- [ ] R6-075 (P0) Required checks
- [ ] TR-H9 (P0) No automated release gate or CI
- [x] TR-M11 (P0) Public issue tracking disabled — Issues enabled, templates, SECURITY.md
- [x] TR-M12 (P0) Release binaries committed into Git history — checks.test.mjs tracked files
- [x] TR-M13 (P0) Release naming/version history inconsistent — CHANGELOG corrected; D-008 open for tags
- [x] TR-L2 (P0) CONTRIBUTING, SECURITY, issue/PR templates, code of conduct, support policy — SECURITY/CONTRIBUTING/CoC/templates
- [x] TR-L3 (P0) Changelog missing on main — CHANGELOG.md
- [ ] TR-L9 (P0) Normalize formatting/line endings; enforce Prettier/rustfmt in CI

## Phase 1 · M1.1 Frontend architecture split

- [ ] U4-001 (P0) Split `App.tsx` into route-level screens
- [ ] U4-002 (P0) Extract reusable feature modules
- [ ] U4-003 (P0) Introduce a typed router
- [ ] U4-004 (P0) Make navigation history route-based
- [ ] U4-005 (P0) Give overlays explicit route/modal state
- [ ] U4-006 (P0) Persist and restore the last safe route
- [ ] U4-007 (P0) Add deep-link parsing
- [ ] U4-008 (P0) Separate server state from view state
- [ ] U4-009 (P0) Use request identities and cancellation per screen
- [ ] U4-010 (P0) Preserve screen state on back
- [ ] U4-011 (P0) Centralize capability checks
- [ ] U4-012 (P0) Centralize destructive-action policy
- [ ] U4-013 (P0) Centralize notifications
- [ ] U4-014 (P0) Add an error boundary per major route and player
- [ ] U4-015 (P0) Use stable domain IDs plus occurrence IDs
- [ ] TR-M1 (P1) Monolithic frontend and backend

## Phase 1 · M1.2 Typed IPC and capability model

- [ ] S5-001 (P0) Inventory every Tauri command with an owner, caller, and risk class
- [ ] S5-002 (P0) Remove or gate unused commands
- [ ] S5-003 (P0) Split commands into Rust modules by domain
- [ ] S5-004 (P0) Adopt Tauri v2 app-command permissions
- [ ] S5-005 (P0) Keep remote login windows IPC-less — and test it
- [ ] S5-006 (P0) Typed, validated IPC payloads
- [ ] S5-007 (P0) Structured error type instead of `Result<_, String>`
- [ ] S5-008 (P0) Cap response sizes and list lengths returned over IPC
- [ ] S5-009 (P0) Cancellation for long commands
- [ ] S5-010 (P0) Event channel contract
- [ ] S5-011 (P0) Generate TypeScript bindings from Rust
- [ ] S5-012 (P0) IPC contract tests
- [ ] TR-M14 (P1) No durable API boundary

## Phase 1 · M1.3 Database runtime and versioned migrations

- [ ] D3-001 (P0) Add an explicit schema version
- [ ] D3-002 (P0) Replace swallowed `ALTER TABLE` errors
- [ ] D3-003 (P0) Create one immutable migration per released schema transition
- [ ] D3-004 (P0) Never edit an old migration after release
- [ ] D3-005 (P0) Back up before migration
- [ ] D3-006 (P0) Run `PRAGMA quick_check` before migration and `integrity_check` after migration
- [ ] D3-007 (P0) Validate the final schema
- [ ] D3-008 (P0) Test every supported upgrade path
- [ ] D3-009 (P0) Test interrupted migration recovery
- [ ] D3-010 (P0) Reject unsupported future schemas
- [ ] D3-011 (P0) Add a read-only recovery mode
- [ ] D3-012 (P0) Normalize release/main divergence
- [ ] D3-013 (P1) Enable WAL deliberately
- [ ] D3-014 (P1) Do not hold one global SQLite mutex across long work
- [ ] D3-015 (P1) Add indexes from actual query plans
- [ ] D3-016 (P1) Add schema-level boolean checks
- [ ] D3-017 (P1) Add foreign-key verification to CI
- [ ] D3-018 (P1) Create a repository/data-access layer
- [ ] R6-001 (P1) Replace the single global `Mutex<Connection>`
- [ ] R6-002 (P1) Use a dedicated DB actor or `r2d2`/`deadpool` pool
- [ ] R6-003 (P1) Enable WAL, `busy_timeout`, and `synchronous=NORMAL`
- [ ] R6-004 (P1) Never hold a std `Mutex` across `.await` or in async commands
- [ ] R6-005 (P1) Batch writes in transactions
- [ ] R6-006 (P1) Add missing indexes
- [ ] R6-007 (P1) Use `EXPLAIN QUERY PLAN` tests for hot queries
- [ ] R6-008 (P1) Paginate library queries
- [ ] R6-009 (P1) Run `PRAGMA optimize` and periodic `ANALYZE`
- [ ] R6-010 (P1) Version migrations properly
- [ ] R6-011 (P1) Measure startup DB cost

## Phase 1 · M1.4 Test harness, full CI, supply chain

- [ ] S5-092 (P1) Automated dependency updates
- [ ] S5-093 (P1) Audit gates in CI
- [ ] S5-094 (P1) Pin GitHub Actions by commit SHA
- [ ] S5-096 (P1) Least-privilege CI tokens
- [ ] R6-061 (P1) Frontend unit/integration tests
- [ ] R6-062 (P1) Backend unit tests by module
- [ ] R6-063 (P1) Parser fixture corpus
- [ ] R6-064 (P1) Contract tests for providers (scheduled)
- [ ] R6-065 (P1) Migration tests from every released schema
- [ ] R6-066 (P1) Async/command tests with a mocked HTTP layer
- [ ] R6-067 (P1) End-to-end tests
- [ ] R6-068 (P1) Accessibility automation
- [ ] R6-069 (P1) Performance regression tests
- [ ] R6-070 (P1) Property/fuzz tests
- [ ] R6-071 (P1) Coverage reporting
- [ ] R6-072 (P1) Flaky test policy
- [ ] R6-076 (P1) Caching
- [ ] R6-077 (P1) PR artifacts
- [ ] R6-078 (P1) Release workflow separated — partial: tag-triggered release with signed updater artifacts; Authenticode pending (D-010)
- [ ] R6-079 (P1) Linting for Rust and TS
- [ ] TR-M2 (P1) No frontend test suite

## Phase 1 · M1.5 Stability, logging, diagnostics

- [ ] S5-085 (P1) Remove panics from production paths
- [ ] S5-086 (P1) Mutex poisoning recovery
- [ ] S5-087 (P1) Move blocking work off async threads
- [ ] S5-088 (P1) Structured, redacted logging
- [ ] S5-089 (P1) Crash reporting (opt-in, local first)
- [ ] S5-090 (P1) Diagnostics export
- [ ] S5-091 (P1) Schema migrations with versions
- [ ] TR-L4 (P1) Structured logging with redaction + diagnostic bundle
- [ ] R6-080 (P2) Structured logging with levels and spans
- [ ] R6-081 (P2) Local performance metrics
- [ ] R6-082 (P2) Opt-in anonymous telemetry only
- [ ] R6-083 (P2) Diagnostics bundle
- [ ] R6-084 (P2) Health checks screen

## Phase 2 · M2.1 CSP and webview hardening

- [ ] S5-014 (P0) Narrow `img-src https:`
- [ ] S5-015 (P0) Review `media-src https://*.googlevideo.com`
- [ ] S5-016 (P0) Use Tauri's `devCsp` for development
- [ ] S5-017 (P0) Enable `freezePrototype`
- [ ] S5-018 (P0) Disable devtools in release builds
- [ ] S5-019 (P0) Block in-webview navigation of the main window
- [ ] S5-020 (P0) Open external links through a dedicated, allowlisted command
- [ ] S5-021 (P0) No `dangerouslySetInnerHTML` and no HTML from providers
- [ ] S5-022 (P0) Disable context-menu/devtools shortcuts in release
- [ ] S5-023 (P0) Disable WebView2 autofill/password save for the main window
- [ ] S5-024 (P0) Pin a WebView2 minimum version and handle missing runtime

## Phase 2 · M2.2 Auth isolation and secrets

- [ ] D3-156 (P0) Keep the AES-GCM/keyring design, but make migration failure visible
- [ ] D3-157 (P0) Do not silently continue with legacy plaintext forever
- [ ] D3-158 (P0) Delete the credential-store key on full account-data reset only after encrypted secrets are removed
- [ ] D3-159 (P0) Add key-loss recovery UX
- [ ] D3-160 (P0) Zeroize plaintext buffers where practical
- [ ] D3-161 (P0) Add log redaction tests
- [ ] D3-162 (P0) Store token metadata separately from secrets
- [ ] D3-163 (P0) Validate sessions against providers before saying “connected.”
- [ ] D3-164 (P0) Rotate encryption format cleanly
- [ ] D3-165 (P0) Scope secrets by Windows user and app identifier
- [ ] D3-166 (P0) Add a security-sensitive backup invariant test
- [ ] S5-025 (P0) Isolate login webviews from the main webview profile
- [ ] S5-026 (P0) Per-provider logout
- [ ] S5-027 (P0) Restrict login-window navigation
- [ ] S5-028 (P0) Limit the captured Google cookie set
- [ ] S5-029 (P0) Never log or emit cookies/tokens
- [ ] S5-030 (P0) Remove plaintext fallback when Credential Manager is unavailable
- [ ] S5-031 (P0) Make Spotify reconnect durable
- [ ] S5-032 (P0) Encrypt all session-adjacent values
- [ ] S5-033 (P0) Zeroize secrets in memory
- [ ] S5-034 (P0) Detect expired/revoked sessions and recover
- [ ] S5-035 (P0) Session status must not expose secrets
- [ ] S5-036 (P0) Avoid third-party gists in the Spotify token chain
- [ ] X3-016 (P0) Secret migration failure is silently ignored, potentially leaving plaintext credentials

## Phase 2 · M2.3 Filesystem, asset protocol, data locations

- [ ] S5-038 (P0) Validate re-granted local file paths at startup
- [ ] S5-039 (P0) Strip `local_path` from restored backups or re-confirm it
- [ ] S5-040 (P0) Use `app.path()` instead of raw `%APPDATA%`
- [ ] S5-041 (P0) Portable mode data location
- [ ] S5-042 (P0) Atomic writes everywhere
- [ ] S5-043 (P0) Canonicalize before delete
- [ ] S5-044 (P0) Sanitize IDs used in file names
- [ ] S5-045 (P0) Disk-space checks and quotas
- [ ] S5-046 (P0) Correct ACLs on the data folder

## Phase 2 · M2.4 Network hardening

- [ ] S5-055 (P1) Central HTTP policy
- [ ] S5-056 (P1) Never send cookies cross-host
- [ ] S5-057 (P1) Retry/backoff policy
- [ ] S5-058 (P1) Rate limiting per provider
- [ ] S5-059 (P1) Response-size limits on JSON
- [ ] S5-060 (P1) Proxy support with authentication
- [ ] S5-061 (P1) Respect system proxy and offline state
- [ ] S5-062 (P1) Provider privacy disclosure

## Phase 3 · M3.1 Provenance data model

- [ ] D3-019 (P0) Separate local likes, YouTube likes, and Spotify likes
- [ ] D3-020 (P0) Separate imported-local membership from YouTube library membership
- [ ] D3-021 (P0) Attach every remote state to an account
- [ ] D3-022 (P0) Preserve disconnected-account data
- [ ] D3-023 (P0) Model local UI aggregate state as a query/view
- [ ] D3-024 (P0) Store remote mutation state
- [ ] D3-025 (P0) Add tombstones
- [ ] D3-026 (P0) Record metadata ownership per field or source
- [ ] D3-027 (P0) Add alias/mapping history
- [ ] D3-028 (P0) Do not infer song identity from display metadata

## Phase 3 · M3.2 Safe sync engine

- [ ] D3-029 (P0) Stage remote snapshots in temporary tables
- [ ] D3-030 (P0) Require an explicit completion proof
- [ ] D3-031 (P0) Use sync generations
- [ ] D3-032 (P0) Add plausibility guards beyond “not empty.”
- [ ] D3-033 (P0) Distinguish an authoritative empty account from a failed empty parser
- [ ] D3-034 (P0) Make sync idempotent
- [ ] D3-035 (P0) Do not call remote mutation APIs while applying a remote snapshot
- [ ] D3-036 (P0) Serialize sync per provider/account/collection
- [ ] D3-037 (P0) Support cancellation without partial commit
- [ ] D3-038 (P0) Persist sync status
- [ ] D3-039 (P0) Add bounded retry/backoff with Retry-After support
- [ ] D3-040 (P0) Detect account changes before apply
- [ ] D3-041 (P0) Preserve local-only likes and imported files
- [ ] D3-042 (P0) Keep downloaded tracks even when remote membership disappears
- [ ] D3-043 (P0) Keep playlist contents atomic
- [ ] D3-044 (P0) Preserve occurrence identity
- [ ] D3-045 (P0) Add conflict policy
- [ ] D3-046 (P0) Add dry-run/diff support
- [ ] D3-047 (P0) Add per-source capability policy
- [ ] D3-048 (P0) Never represent an incomplete capped Spotify fetch as complete
- [ ] D3-049 (P0) Zero-item valid collection
- [ ] D3-050 (P0) Parser returns zero from a non-empty malformed response
- [ ] D3-051 (P0) First page succeeds, continuation fails
- [ ] D3-052 (P0) Repeated continuation token
- [ ] D3-053 (P0) Remote count suddenly drops 95%
- [ ] D3-054 (P0) Local file plus YouTube library sync
- [ ] D3-055 (P0) Two Google accounts with overlapping IDs
- [ ] D3-056 (P0) Local, YouTube, and Spotify like on the same track
- [ ] D3-057 (P0) Offline local mutation then remote snapshot
- [ ] D3-058 (P0) Downloaded remote track removed from service
- [ ] D3-059 (P0) Duplicate playlist occurrences
- [ ] X3-001 (P0) YouTube library sync resets imported local-file membership
- [ ] X3-002 (P0) The empty-response safeguard still accepts destructive partial snapshots
- [ ] X3-003 (P0) Multi-account ownership is absent across songs, likes, playlists, and sync state
- [ ] X3-017 (P0) The reference’s own sync code must not be copied blindly because it conflates reconciliation setters with remote-mutating toggle methods
- [ ] TR-L8 (P1) Optimistic-action reconciliation with visible retry state

## Phase 3 · M3.3 Likes, follows, podcasts, account lifecycle

- [ ] D3-060 (P1) Make “Meld Like” and “YouTube Like” visibly distinct or configurable
- [ ] D3-061 (P1) Persist the local state only after a confirmed remote mutation—or use an explicit pending state
- [ ] D3-062 (P1) Add compensation/retry records
- [ ] D3-063 (P1) Update local library membership after `ytm_toggle_library`
- [ ] D3-064 (P1) Give albums provider-specific membership
- [ ] D3-065 (P1) Add full artist follow/subscription parity
- [ ] D3-066 (P1) Separate podcast subscription from saved episodes
- [ ] D3-067 (P1) Preserve per-episode playback position
- [ ] D3-068 (P1) Define logout choices precisely
- [ ] D3-069 (P1) Keep downloads on logout by default
- [ ] D3-070 (P1) Clear credential-manager material on explicit full sign-out
- [ ] D3-071 (P1) Clear or partition WebView login state per provider
- [ ] D3-072 (P1) Add account-switch confirmation when destructive sync is pending
- [ ] D3-073 (P1) Add a “rebuild from providers” function only after export/backup

## Phase 3 · M3.4 Playlists and interchange

- [ ] X3-013 (P0) Local playlist design forbids duplicate occurrences and removes by song ID rather than occurrence
- [ ] D3-074 (P1) Give every playlist entry a unique occurrence ID
- [ ] D3-075 (P1) Allow duplicate tracks
- [ ] D3-076 (P1) Remove by occurrence, not song ID
- [ ] D3-077 (P1) Preserve provider occurrence IDs
- [ ] D3-078 (P1) Use stable fractional/order keys or transactional reindexing
- [ ] D3-079 (P1) Add playlist revision/conflict detection
- [ ] D3-080 (P1) Do not delete/recreate remote playlist metadata unnecessarily
- [ ] D3-081 (P1) Add explicit playlist delete and rename for local playlists
- [ ] D3-082 (P1) Add local playlist reorder with keyboard and pointer support
- [ ] D3-083 (P1) Implement CSV export/import
- [ ] D3-084 (P1) Implement M3U/M3U8 export/import
- [ ] D3-085 (P1) Add JSON backup/export for lossless Desktop data
- [ ] D3-086 (P1) Report partial imports
- [ ] D3-087 (P1) Add source-to-local copy semantics
- [ ] D3-088 (P1) Add auto-sync retention policy

## Phase 3 · M3.5 Downloads/cache/filesystem reconciliation

- [ ] X3-010 (P0) Download removal trusts the path stored in SQLite without canonical ownership validation
- [ ] X3-011 (P0) Missing completed downloads remain falsely completed in the DB
- [ ] D3-089 (P1) Add a startup storage reconciler
- [ ] D3-090 (P1) Convert missing completed files into an explicit `missing` state
- [ ] D3-091 (P1) Quarantine or delete orphan files
- [ ] D3-092 (P1) Verify file size before `completed`
- [ ] D3-093 (P1) Verify media structure
- [ ] D3-094 (P1) Store content identity
- [ ] D3-095 (P1) Use safe finalization
- [ ] D3-096 (P1) Keep retryable partials
- [ ] D3-097 (P1) Do not concatenate different representations
- [ ] D3-098 (P1) Add disk-space preflight and reserve
- [ ] D3-099 (P1) Add download queue persistence
- [ ] D3-100 (P1) Add bounded concurrency
- [ ] D3-101 (P1) Add retry/backoff categories
- [ ] D3-102 (P1) Add per-download pause/resume and retry
- [ ] D3-103 (P1) Add global storage quota and cache LRU
- [ ] D3-104 (P1) Make cache keys quality/format-aware
- [ ] D3-105 (P1) Store downloads outside backup by policy, but reconcile on restore
- [ ] D3-106 (P1) Offer optional media backup separately
- [ ] D3-107 (P1) Validate stored paths
- [ ] D3-108 (P1) Never delete an arbitrary database-provided path without ownership validation
- [ ] D3-109 (P1) Unify file and row transactions with an operation journal
- [ ] D3-110 (P1) Add “verify downloads” and “repair library” actions

## Phase 3 · M3.6 Local files

- [ ] X3-012 (P0) Local imports have no rescan/moved/deleted reconciliation and persist only the first artist relation
- [ ] D3-111 (P1) Add folders and rescanning, not only one-time file picking
- [ ] D3-112 (P1) Persist authorized roots/handles safely
- [ ] D3-113 (P1) Reconcile moved, renamed, modified, and deleted files
- [ ] D3-114 (P1) Use stable file identity
- [ ] D3-115 (P1) Detect duplicate files and duplicate audio content
- [ ] D3-116 (P1) Preserve all artists and album metadata
- [ ] D3-117 (P1) Handle embedded artwork lifecycle
- [ ] D3-118 (P1) Separate original metadata from user edits
- [ ] D3-119 (P1) Add unavailable-file state
- [ ] D3-120 (P1) Add “locate replacement” and bulk relink
- [ ] D3-121 (P1) Validate decodability during scan
- [ ] D3-122 (P1) Avoid holding the DB mutex while parsing every selected file
- [ ] D3-123 (P1) Add folder privacy controls
- [ ] D3-124 (P1) Add local-file removal choices

## Phase 3 · M3.7 History, stats, retention, privacy

- [ ] X3-014 (P0) Main regressed measured play time and now overestimates listening statistics
- [ ] X3-015 (P0) “Clear local library but keep downloads” also removes imported local-file records and many unrelated local-only structures
- [ ] D3-125 (P1) Restore measured play time
- [ ] D3-126 (P1) Define when a play counts
- [ ] D3-127 (P1) Handle seeks, repeats, resume, and crashes
- [ ] D3-128 (P1) Preserve source and account context
- [ ] D3-129 (P1) Add a foreign key or deliberate tombstone snapshot to history
- [ ] D3-130 (P1) Do not estimate minutes as full duration × starts
- [ ] D3-131 (P1) Add retention controls
- [ ] D3-132 (P1) Make “clear history” transactional
- [ ] D3-133 (P1) Add scoped clear actions
- [ ] D3-134 (P1) Add export before delete
- [ ] D3-135 (P1) Add privacy documentation

## Phase 3 · M3.8 Backup, restore, export, disaster recovery

- [ ] D3-136 (P0) Add a manifest
- [ ] D3-137 (P0) Stream backup entries
- [ ] D3-138 (P0) Use separate small caps
- [ ] D3-139 (P0) Reject duplicate critical entries
- [ ] D3-140 (P0) Validate checksums before opening
- [ ] D3-141 (P0) Validate `application_id` and schema version
- [ ] D3-142 (P0) Run migrations on the staged database
- [ ] D3-143 (P0) Run foreign-key and semantic checks on staged data
- [ ] D3-144 (P0) Preserve the old database until the restored app has reopened successfully
- [ ] D3-145 (P0) Reapply runtime pragmas and secret migration to the restored connection
- [ ] D3-146 (P0) Reconcile omitted media after restore
- [ ] D3-147 (P0) Add a restore preview
- [ ] D3-148 (P0) Add restore modes
- [ ] D3-149 (P0) Prevent same-path and temporary-file collisions
- [ ] D3-150 (P0) Clean failed output archives
- [ ] D3-151 (P0) Flush the backup archive before reporting success
- [ ] D3-152 (P0) Keep a recovery journal
- [ ] D3-153 (P0) Add downgrade-safe export
- [ ] D3-154 (P0) Add scheduled optional backups
- [ ] D3-155 (P0) Test malicious archives
- [ ] X3-004 (P0) Restore checks only four table names and integrity, not schema compatibility
- [ ] X3-005 (P0) Restored databases are not migrated before promotion
- [ ] X3-006 (P0) Restored connections do not reapply initialization, runtime pragmas, or secret migration immediately
- [ ] X3-007 (P0) Backups and restores buffer the entire database in memory
- [ ] X3-008 (P0) Backups have no manifest, checksum, format version, duplicate-entry rule, or compression-ratio limit
- [ ] X3-009 (P0) Omitted media and restored download rows are not reconciled
- [ ] S5-047 (P1) Version the backup format
- [ ] S5-048 (P1) Stream instead of loading entire databases into memory
- [ ] S5-049 (P1) Treat oversized entries as an error
- [ ] S5-050 (P1) Validate full schema compatibility
- [ ] S5-051 (P1) Keep a pre-restore safety copy
- [ ] S5-052 (P1) Use SQLite's online backup API for creation
- [ ] S5-053 (P1) Optional encrypted backups
- [ ] S5-054 (P1) Reference-compatible import

## Phase 4 · M4.1 Playback coordinator and media protocol

- [ ] PLAY-027 (P0) Raw remote URL is handed to HTML audio
- [ ] PLAY-029 (P1) No bounded/chunked range strategy
- [ ] PLAY-034 (P1) Queue is committed before preparation succeeds
- [ ] PLAY-036 (P1) v0.1.8 quality changes do not reload current playback
- [ ] PLAY-037 (P1) Browser errors lack HTTP status/client information
- [ ] PLAY-063 (P1) History begins before confirmed audible playback
- [ ] PLAY-064 (P1) No single playback state machine
- [ ] PLAY-065 (P1) Main and v0.1.8 use different stale-request mechanisms
- [ ] PLAY-066 (P1) Auto-skip may skip recoverable errors
- [ ] PLAY-067 (P1) Playback loading/buffering is not modeled clearly
- [ ] PLAY-068 (P1) `timeupdate` rerenders the monolithic app
- [ ] PLAY-069 (P1) Persisted playback format is unversioned localStorage
- [ ] PLAY-070 (P1) Playback persistence and stream persistence are mixed conceptually
- [ ] PLAY-071 (P1) No robust same-song replay contract
- [ ] PLAY-038 (P2) No seekability model
- [ ] PLAY-039 (P2) No gapless pipeline
- [ ] PLAY-040 (P2) No Windows audio-device lifecycle
- [ ] PLAY-072 (P2) Position/duration source can be inaccurate
- [ ] PLAY-073 (P2) No buffered-range UI
- [ ] PLAY-074 (P2) Playback errors are not copyable/redacted reports
- [ ] PLAY-075 (P2) Queue continuation and stream preparation are coupled in UI
- [ ] PLAY-076 (P2) No preload contract

## Phase 4 · M4.2 Robust resolver

- [ ] PLAY-002 (P1) Direct-URL-only extraction
- [ ] PLAY-003 (P1) No dynamic player configuration
- [ ] PLAY-004 (P1) Hardcoded client versions age silently
- [x] PLAY-005 (P1) No failed-client memory
- [x] PLAY-006 (P1) Only the last resolver failure is returned
- [ ] PLAY-007 (P1) Missing content hints
- [ ] PLAY-008 (P1) Main dropped playlist context
- [x] PLAY-009 (P1) No client playback nonce
- [ ] PLAY-010 (P1) No PoToken capability
- [ ] PLAY-011 (P1) Client-specific stream headers are discarded
- [ ] PLAY-012 (P1) Browser request identity differs from resolver client
- [ ] PLAY-013 (P1) No stream-host allowlist
- [ ] PLAY-014 (P1) Region and language are hardcoded to US/en
- [x] PLAY-030 (P1) Immediate 403/410 does not trigger client fallback
- [x] PLAY-032 (P1) No expiry safety margin
- [ ] PLAY-033 (P1) No retry limit/state visible to UI
- [ ] R6-012 (P1) Bound continuation loops
- [ ] R6-013 (P1) Parallelize independent requests with limits
- [ ] R6-014 (P1) Request deduplication
- [ ] R6-015 (P1) Response caching with TTL
- [ ] R6-016 (P1) Consistent retry/backoff
- [ ] R6-017 (P1) Distinguish timeout, offline, auth, rate-limit, and parse failures
- [ ] R6-018 (P1) Parser resilience telemetry (local)
- [ ] R6-019 (P1) HTTP/2 and connection reuse verification
- [ ] R6-020 (P1) Prefetch next track stream URL
- [ ] R6-021 (P1) Expired stream URL handling everywhere
- [ ] TR-H2 (P1) Playback fundamentally behind upstream Meld 0.9.2
- [x] PLAY-015 (P2) Playability errors lack taxonomy
- [ ] PLAY-016 (P2) No resolver prewarm
- [ ] PLAY-017 (P2) No resolver metrics

## Phase 4 · M4.3 One-stream cache/download engine

- [ ] PLAY-041 (P0) No cache quota or eviction
- [x] PLAY-042 (P0) Unlimited concurrent player-cache jobs — player_cache::tests::rapid_skipping_never_runs_more_than_two_fills, cancelled_fill_releases_socket_and_file_promptly
- [ ] PLAY-028 (P1) Playback and cache download the same song twice
- [x] PLAY-043 (P1) Player-cache jobs survive skip/close — player_cache::tests::cancelled_fill_releases_socket_and_file_promptly, stalled_fill_gives_up_after_the_idle_limit; exit handler cancels fills and removes `.part` files
- [ ] PLAY-044 (P1) No final byte-count validation — partial: downloads and player cache reject transfers shorter than the announced length (`transfer_complete`); unknown-length container probe pending
- [ ] PLAY-045 (P1) No content-type/container validation
- [ ] PLAY-046 (P1) Redirect targets are not revalidated
- [ ] PLAY-047 (P1) No pre-download disk-space check
- [ ] PLAY-048 (P1) Generic `.audio` extension and lost format identity
- [ ] PLAY-049 (P1) Quality cache schema cannot hold multiple qualities
- [ ] PLAY-050 (P1) Windows replacement rename can fail
- [ ] PLAY-051 (P1) Flush is not durability
- [ ] PLAY-052 (P1) v0.1.8 resume does not validate `Content-Range`
- [ ] PLAY-053 (P1) Resume can combine bytes from different stream formats
- [ ] PLAY-054 (P1) v0.1.8 resume wastes a request
- [ ] PLAY-057 (P1) SQLite background writers lack a concurrency policy
- [ ] PLAY-058 (P1) Player-cache errors are silent
- [ ] R6-022 (P1) Correct the cached MIME type
- [ ] R6-023 (P1) Cap player cache size
- [ ] R6-024 (P1) Avoid double downloads
- [ ] R6-025 (P1) Validate cache completeness
- [ ] R6-026 (P1) Clean orphaned `.part` files at startup
- [ ] R6-027 (P1) Download queue with concurrency limits
- [ ] R6-028 (P1) Gapless and crossfade timing tests
- [ ] R6-029 (P1) Audio device change recovery
- [ ] R6-030 (P1) Playback watchdog
- [ ] R6-031 (P1) Error-skip guard
- [ ] TR-M7 (P1) Downloads not at upstream reliability
- [ ] PLAY-059 (P2) No integrity fingerprint
- [ ] PLAY-060 (P2) No startup file/DB reconciliation
- [ ] PLAY-061 (P2) No separate playback/download quality policy
- [ ] PLAY-062 (P2) Lyrics/artwork work delays download completion

## Phase 4 · M4.4 Format and audio parity

- [ ] PLAY-018 (P1) Quality selection is bitrate-only
- [ ] PLAY-019 (P1) No decoder capability check
- [ ] PLAY-020 (P1) Auto quality is not automatic
- [ ] PLAY-022 (P1) No persisted format metadata
- [ ] PLAY-023 (P1) Cached media is reported as `audio/mpeg`
- [ ] TR-M5 (P1) Lyrics behaviour stale vs upstream
- [ ] PLAY-024 (P2) Weak original-language/audio-track selection
- [ ] PLAY-025 (P2) No loudness metadata or normalization
- [ ] PLAY-026 (P2) No content-length-aware seeking policy
- [ ] PLAY-077 (P2) Playback speed support is branch-only and HTML-based
- [ ] PLAY-078 (P2) No per-podcast resume model
- [ ] PLAY-079 (P2) Windows media integration is incomplete/regressed
- [ ] PLAY-080 (P2) No audio focus/communications policy
- [ ] PLAY-081 (P2) No real crossfade
- [ ] PLAY-082 (P2) No silence skipping
- [ ] PLAY-083 (P2) No equalizer graph
- [ ] PLAY-084 (P2) No normalization processor
- [ ] PLAY-085 (P2) No gapless/crossfade compatibility matrix
- [ ] PLAY-086 (P3) No output/codec diagnostics

## Phase 4 · M4.5 Playback verification

- [ ] PLAY-087 (P0) No end-to-end playback CI
- [ ] PLAY-088 (P1) Resolver tests cover too little
- [ ] PLAY-089 (P1) No fault-injection tests
- [ ] PLAY-090 (P1) No real Windows replacement/locking tests
- [ ] PLAY-092 (P1) No playback security tests
- [ ] PLAY-093 (P2) No long-session soak test
- [ ] PLAY-094 (P2) No performance budgets

## Phase 5 · M5.1 Identity and queue coordinator

- [ ] QUEUE-002 (P1) Introduce a typed source identity
- [ ] QUEUE-003 (P1) Give every queue entry a unique instance ID
- [ ] QUEUE-004 (P1) Preserve source context explicitly
- [ ] QUEUE-005 (P1) Separate track metadata from source metadata
- [ ] QUEUE-006 (P1) Version queue persistence
- [ ] QUEUE-007 (P1) Make queue state atomic
- [ ] QUEUE-008 (P2) Retain source titles and provenance

## Phase 5 · M5.2 Canonical matcher

- [ ] MATCH-001 (P0) Remove the first-search-result matcher
- [ ] MATCH-002 (P0) One resolver for all call sites
- [ ] MATCH-003 (P1) Persist Spotify ID on queue items
- [ ] MATCH-004 (P1) Check memory cache first
- [ ] MATCH-005 (P1) Check DB cache before search
- [ ] MATCH-006 (P1) Version automatic matches
- [ ] MATCH-007 (P1) Preserve manual overrides forever unless user resets them
- [ ] MATCH-008 (P1) Use multiple YouTube candidates
- [ ] MATCH-009 (P1) Normalize Unicode safely
- [ ] MATCH-010 (P1) Parse version markers instead of deleting them blindly
- [ ] MATCH-011 (P1) Improve title score
- [ ] MATCH-012 (P1) Improve artist score
- [ ] MATCH-013 (P1) Add album score
- [ ] MATCH-014 (P1) Strengthen duration scoring
- [ ] MATCH-015 (P1) Use explicit-state compatibility
- [ ] MATCH-016 (P1) Penalize videos, covers, karaoke, and unofficial uploads
- [ ] MATCH-017 (P1) Add ISRC where available
- [ ] MATCH-018 (P1) Use a confidence band, not one permissive threshold
- [ ] MATCH-019 (P1) Store candidate explanations
- [ ] MATCH-020 (P1) Manual override preview must verify canonical YouTube metadata
- [ ] MATCH-021 (P1) Add “reset automatic match” and “mark no match”
- [ ] MATCH-022 (P1) Match cache invalidation on metadata change
- [ ] MATCH-023 (P2) Add negative cache with TTL
- [ ] MATCH-024 (P2) Batch resolver with bounded concurrency
- [ ] MATCH-025 (P2) Matcher corpus and regression metrics
- [ ] MATCH-026 (P2) Improve reverse YouTube→Spotify matching
- [ ] MATCH-027 (P2) Do not count matching searches in user history
- [ ] MATCH-028 (P2) Separate transient API failure from no match

## Phase 5 · M5.3 Source-preserving queues

- [ ] QUEUE-009 (P0) Spotify playlist play does not preserve the playlist
- [ ] QUEUE-010 (P0) Spotify Liked Songs play does not preserve Liked Songs
- [ ] QUEUE-021 (P0) Main lost continuation type
- [ ] QUEUE-011 (P1) Fast-start window
- [ ] QUEUE-012 (P1) Progressive batch resolution
- [ ] QUEUE-013 (P1) Preserve API raw offsets
- [ ] QUEUE-014 (P1) Preserve visible sorted order
- [ ] QUEUE-015 (P1) Do not close source screen before preparation succeeds
- [ ] QUEUE-016 (P1) Preserve Spotify metadata in resolved entries
- [ ] QUEUE-017 (P1) Handle unmatchable entries without index drift
- [ ] QUEUE-018 (P1) Full-status operation for shuffle-all
- [ ] QUEUE-022 (P1) Removing current track drops continuation
- [ ] QUEUE-023 (P1) Queue continuation always deduplicates by song ID
- [ ] QUEUE-024 (P1) Continuation merge races with user edits
- [ ] QUEUE-025 (P1) Continuation loop needs a page cap
- [ ] QUEUE-026 (P1) Retry/backoff missing on Desktop continuation
- [ ] QUEUE-027 (P1) Detail/playlist visible queue must retain continuation type
- [ ] QUEUE-019 (P2) Preload next match, not full audio file
- [ ] QUEUE-020 (P2) Queue progress and partial failures
- [ ] QUEUE-028 (P2) Queue title is discarded
- [ ] QUEUE-029 (P2) Continuation diagnostics

## Phase 5 · M5.4 Correct queue semantics

- [ ] QUEUE-030 (P0) Play Next is not guaranteed next under shuffle
- [ ] QUEUE-031 (P0) Selected “Play Next” has the same shuffle bug
- [ ] QUEUE-032 (P1) Toggling shuffle does not reorder current queue
- [ ] QUEUE-033 (P1) Turning shuffle off cannot restore source order
- [ ] QUEUE-034 (P1) Adding one item reshuffles the entire tail
- [ ] QUEUE-035 (P1) Current item lookup by ID is ambiguous
- [ ] QUEUE-036 (P1) Duplicate prevention uses song ID only
- [ ] QUEUE-037 (P1) Repeat persistence lacks rollback
- [ ] QUEUE-038 (P1) Main repeat-all ignores “disable load more” path
- [ ] QUEUE-039 (P1) Shuffle preference and active permutation are conflated
- [ ] QUEUE-040 (P1) `persistentShuffleAcrossQueues` semantics are unclear
- [ ] QUEUE-041 (P1) `shufflePlaylistFirst` implementation is incomplete
- [ ] QUEUE-042 (P1) Reorder while continuation loads can be lost
- [ ] QUEUE-043 (P2) No undo for destructive queue edits
- [ ] QUEUE-044 (P2) No direct “remove upcoming duplicates” action
- [ ] QUEUE-045 (P2) No queue save/export

## Phase 5 · M5.5 Spotify recommendation identity

- [ ] RADIO-001 (P0) Desktop lacks Meld's Spotify recommendation engine
- [ ] RADIO-002 (P1) Define source-specific radio policy
- [ ] RADIO-003 (P1) Seed must start immediately
- [ ] RADIO-004 (P1) Add fallback queue
- [ ] RADIO-005 (P1) Build taste profile cache
- [ ] RADIO-006 (P1) Candidate generation from multiple buckets
- [ ] RADIO-007 (P1) Composite scoring
- [ ] RADIO-008 (P1) Diversification
- [ ] RADIO-009 (P1) Avoid same song twice in a row
- [ ] RADIO-010 (P1) Automix result race
- [ ] RADIO-011 (P1) Automix errors are swallowed
- [ ] RADIO-012 (P1) YTM radio fallback needs retries like reference
- [ ] RADIO-013 (P1) Recommendation pagination and matching are separate
- [ ] RADIO-014 (P2) Explain recommendation source
- [ ] RADIO-015 (P2) Feedback loop
- [ ] RADIO-016 (P2) Deterministic test seed

## Phase 5 · M5.6 Spotify Home and Search

- [ ] HOME-001 (P0) Product identity mismatch
- [ ] SEARCH-001 (P0) Add Use Spotify for Search
- [ ] HOME-002 (P1) Add Use Spotify for Home
- [ ] HOME-003 (P1) Add Spotify-only Home
- [ ] HOME-004 (P1) Spotify authentication fallback
- [ ] HOME-005 (P1) Top tracks section
- [ ] HOME-006 (P1) Top artists section
- [ ] HOME-007 (P1) Spotify home feed sections
- [ ] HOME-008 (P1) New releases/following/discover
- [ ] HOME-009 (P1) Recently played always available
- [ ] HOME-010 (P1) Home request races
- [ ] HOME-011 (P1) Fix nested state mutation
- [ ] HOME-012 (P1) Cache completeness/degraded TTL
- [ ] SEARCH-002 (P1) Authentication fallback
- [ ] SEARCH-003 (P1) Preserve Spotify entities
- [ ] SEARCH-004 (P1) Latest-search-wins
- [ ] SEARCH-005 (P1) Continuation belongs to query+source+filter
- [ ] SEARCH-006 (P1) Search filters by source capabilities
- [ ] SEARCH-007 (P1) Background matching must be incognito
- [ ] SEARCH-008 (P1) Search history privacy/source
- [ ] TR-M6 (P1) Spotify parity partial
- [ ] HOME-013 (P2) Cross-source deduplication
- [ ] HOME-014 (P2) Section failure isolation
- [ ] HOME-015 (P2) Source badges and privacy
- [ ] SEARCH-009 (P2) Debounced suggestions and cancellation
- [ ] SEARCH-010 (P2) URL paste takes precedence safely
- [ ] SEARCH-011 (P2) Offline/local fallback
- [ ] SEARCH-012 (P2) Search quality analytics locally testable

## Phase 5 · M5.7 Spotify resilience, UX, and Part 2 tests

- [ ] SPOT-001 (P0) Startup auth state can lie
- [ ] TEST-001 (P0) Queue state-machine test matrix
- [ ] TEST-002 (P0) Shuffle/repeat transition table
- [ ] TEST-003 (P0) Spotify matcher corpus
- [ ] SPOT-002 (P1) Token refresh race
- [ ] SPOT-003 (P1) Dynamic GraphQL hashes
- [ ] SPOT-004 (P1) Hash update must be trusted
- [ ] SPOT-005 (P1) Unified 429 handling
- [ ] SPOT-006 (P1) Error-body taxonomy
- [ ] SPOT-007 (P1) Playlist pagination must not cap at 50/100 silently
- [ ] SPOT-008 (P1) Bulk Spotify download is not actually queued
- [ ] SPOT-009 (P1) Reorder under sort/filter can be misleading
- [ ] SPOT-010 (P1) Playlist mutation conflict refresh
- [ ] SPOT-011 (P1) Liked-song bidirectional sync missing
- [ ] UI-001 (P1) Async Tauri listener cleanup race
- [ ] UI-002 (P1) Detail/playlist request races
- [ ] UI-003 (P1) Spotify folder/playlist/profile races
- [ ] UI-004 (P1) Loading flags can cover stale entities
- [ ] UI-005 (P1) One notice string is not an operation model
- [ ] TEST-004 (P1) Spotify playlist progressive queue tests
- [ ] TEST-005 (P1) Continuation routing fixtures
- [ ] TEST-006 (P1) Automix race tests
- [ ] TEST-007 (P1) Home source/fallback tests
- [ ] TEST-008 (P1) Search race/source tests
- [ ] TEST-009 (P1) Spotify token/hash/rate-limit tests
- [ ] TEST-010 (P1) React immutable-state tests
- [ ] TEST-011 (P1) StrictMode listener test
- [ ] TR-H3 (P1) Spotify GraphQL hashes are compiled static data
- [ ] SPOT-012 (P2) Followed-artist sync
- [ ] SPOT-013 (P2) Spotify album screen
- [ ] SPOT-014 (P2) Folder recursion and cycles
- [ ] SPOT-015 (P2) Profile cache tiers
- [ ] UI-006 (P2) Large lists need virtualization
- [ ] TEST-012 (P2) Recommendation quality tests
- [ ] TEST-013 (P2) Large-source soak

## Phase 6 · M6.1 App shell and navigation

- [ ] U4-016 (P1) Define primary navigation parity
- [ ] U4-017 (P1) Add Listen Together only when real backend behavior exists
- [ ] U4-018 (P1) Add clear active, hover, focus, pressed, disabled, loading, and attention states for every navigation item
- [ ] U4-019 (P1) Make repeated activation useful
- [ ] U4-020 (P1) Persist sidebar collapsed state per window
- [ ] U4-021 (P1) Replace Unicode navigation glyphs with a coherent icon set
- [ ] U4-022 (P1) Add Windows system-theme integration
- [ ] U4-023 (P1) Respect Windows accent color optionally
- [ ] U4-024 (P1) Add high-contrast/forced-colors support
- [ ] U4-025 (P1) Support display scaling and text zoom
- [ ] U4-026 (P1) Add reduced-motion support
- [ ] U4-027 (P1) Restore window size, position, maximized state, and full-player layout safely
- [ ] U4-028 (P1) Support Windows snap sizes
- [ ] U4-029 (P1) Add compact/narrow navigation
- [ ] U4-030 (P1) Provide a native title-bar strategy
- [ ] U4-031 (P1) Add native back/forward mouse-button handling
- [ ] U4-032 (P1) Preserve playback while navigating and resizing
- [ ] U4-033 (P1) Add command palette/quick navigation
- [ ] U4-034 (P1) Add customizable navigation only after all destinations are routable

## Phase 6 · M6.2 Home, Search, Library, detail screens

- [ ] U4-035 (P1) Preserve section order and source identity
- [ ] U4-036 (P1) Add skeleton/shimmer loading instead of one blocking boot panel
- [ ] U4-037 (P1) Retain already loaded Home content during refresh
- [ ] U4-038 (P1) Add pull/toolbar refresh equivalent for desktop
- [ ] U4-039 (P1) Restore per-section Play All and Shuffle where the source supports them
- [ ] U4-040 (P1) Add Recently Played using actual local/remote history policy
- [ ] U4-041 (P1) Add Mood & Genres route and cards
- [ ] U4-042 (P1) Add Charts route
- [ ] U4-043 (P1) Add New Releases with YouTube and Spotify source labels
- [ ] U4-044 (P1) Add Spotify Home and Spotify-only Home mode
- [ ] U4-045 (P1) Add music-recognition entry only when recognition works
- [ ] U4-046 (P1) Add Speed Dial edit/reorder/removal affordances
- [ ] U4-047 (P1) Add section-level error states
- [ ] U4-048 (P1) Virtualize long Home sections
- [ ] U4-049 (P1) Preserve horizontal scroll positions per section
- [ ] U4-050 (P1) Add keyboard navigation for card rows
- [ ] U4-051 (P1) Use truthful labels
- [ ] U4-052 (P1) Separate search input and results routes
- [ ] U4-053 (P1) Add debounced suggestions with cancellation
- [ ] U4-054 (P1) Implement complete combobox semantics
- [ ] U4-055 (P1) Show search history only while the search control is active
- [ ] U4-056 (P1) Add individual history deletion and clear confirmation
- [ ] U4-057 (P1) Add search filters
- [ ] U4-058 (P1) Honor Hide video songs and explicit filtering consistently in suggestions, results, and continuation pages
- [ ] U4-059 (P1) Parse pasted URLs
- [ ] U4-060 (P1) Preserve literal encoded queries
- [ ] U4-061 (P1) Add local-library search mode
- [ ] U4-062 (P1) Add source labels and match confidence for Spotify-backed results
- [ ] U4-063 (P1) Add search-within-results and result-count messaging
- [ ] U4-064 (P1) Show “no visible results” after filtering
- [ ] U4-065 (P1) Preserve focus and caret when results update
- [ ] U4-066 (P1) Virtualize long result lists and maintain focus across appended pages
- [ ] U4-067 (P1) Make selection mode explicit and scoped
- [ ] U4-068 (P1) Give each library area its own route
- [ ] U4-069 (P1) Correct tab semantics
- [ ] U4-070 (P1) Preserve each view’s query, sort, direction, density, and scroll position
- [ ] U4-071 (P1) Add pull/refresh toolbar behavior with last-sync status
- [ ] U4-072 (P1) Show source badges
- [ ] U4-073 (P1) Add download/cache badges on playlists and items
- [ ] U4-074 (P1) Add library count and storage summary
- [ ] U4-075 (P1) Add list/grid/density settings per media type
- [ ] U4-076 (P1) Add all source sort modes that are meaningful
- [ ] U4-077 (P1) Keep auto-playlists first-class but clearly synthetic
- [ ] U4-078 (P1) Restore weekly/monthly most-played playlists and visibility controls
- [ ] U4-079 (P1) Add full playlist create/edit/delete/reorder UI
- [ ] U4-080 (P1) Add playlist descriptions, creator/channel, thumbnails, counts, duration, privacy, and sync state
- [ ] U4-081 (P1) Add CSV/M3U import/export flows with previews and error rows
- [ ] U4-082 (P1) Add local-file folder scan, rescan, unavailable/relink, and metadata conflict UI
- [ ] U4-083 (P1) Add album/artist bookmark/follow states and actions
- [ ] U4-084 (P1) Add podcast subscription, new-episode, saved-for-later, downloaded, progress, and played/unplayed affordances
- [ ] U4-085 (P1) Add offline-first states
- [ ] U4-086 (P1) Make “Clear local data” wording exact
- [ ] U4-087 (P1) Add bulk-action eligibility summaries
- [ ] U4-088 (P1) Add confirmation/undo for bulk remove download, unlike, remove from library, and playlist deletion
- [ ] U4-089 (P1) Select occurrences, not only song IDs
- [ ] U4-090 (P1) Add Select All/None/Range
- [ ] U4-091 (P1) Replace generic detail overlay with dedicated routes
- [ ] U4-092 (P1) Add shareable/copyable route state
- [ ] U4-093 (P1) Add hero artwork with responsive size and fallback
- [ ] U4-094 (P1) Add album metadata
- [ ] U4-095 (P1) Make artists clickable in every appropriate context
- [ ] U4-096 (P1) Add artist tabs/sections
- [ ] U4-097 (P1) Add artist follow/bookmark and Play All/Shuffle/Radio actions
- [ ] U4-098 (P1) Add playlist creator/channel, description, visibility, item count, duration, download status, and sync state
- [ ] U4-099 (P1) Add playlist sort/reorder/edit actions according to ownership
- [ ] U4-100 (P1) Add custom playlist thumbnails where supported
- [ ] U4-101 (P1) Add podcast show header, subscription, description, episode filters, progress, download, and refresh
- [ ] U4-102 (P1) Add “show all” routes that preserve section identity and continuation
- [ ] U4-103 (P1) Add unavailable/restricted content treatment
- [ ] U4-104 (P1) Improve item details
- [ ] U4-105 (P1) Do not expose raw IDs as the primary user experience
- [ ] U4-106 (P1) Add explicit-content badges everywhere relevant
- [ ] U4-107 (P1) Add context-aware primary action
- [ ] TR-H7 (P1) YouTube URL parsing is incorrect
- [ ] TR-H8 (P1) Generated share URLs are often invalid

## Phase 6 · M6.3 Player, queue, lyrics UX

- [ ] U4-108 (P1) Restore every v0.1.8 player setting intentionally
- [ ] U4-109 (P1) Make previous/play/next icon buttons explicitly named
- [ ] U4-110 (P1) Add `aria-pressed` to repeat and favorite controls
- [ ] U4-111 (P1) Add keyboard seek announcements
- [ ] U4-112 (P1) Add seek tooltip and buffered/downloaded indication
- [ ] U4-113 (P1) Add mute button and wheel/keyboard volume support with visible value
- [ ] U4-114 (P1) Add playback-speed/pitch panel
- [ ] U4-115 (P1) Add audio-quality indicator and selector
- [ ] U4-116 (P1) Add equalizer entry and real Windows DSP implementation before showing the control
- [ ] U4-117 (P1) Add playback error card
- [ ] U4-118 (P1) Keep the old audible item visible until the next item actually starts
- [ ] U4-119 (P1) Add loading/buffering state to the play button and artwork
- [ ] U4-120 (P1) Add download/cache/progress badge to now playing
- [ ] U4-121 (P1) Make title, artist, and album interactive with correct routes
- [ ] U4-122 (P1) Add full-player views/tabs for artwork, lyrics, and queue
- [ ] U4-123 (P1) Preserve player view and lyric scroll state across collapse/expand
- [ ] U4-124 (P1) Support artwork crop/fit and dynamic background options
- [ ] U4-125 (P1) Add system media-session parity
- [ ] U4-126 (P1) Add taskbar thumbnail-toolbar controls where Windows supports them
- [ ] U4-127 (P1) Add global media keys, headset buttons, and optional pause-on-session-lock/device change behavior
- [ ] U4-128 (P1) Add compact mini-player behavior at narrow widths
- [ ] U4-129 (P1) Meet minimum target size
- [ ] U4-130 (P1) Use unique queue-entry IDs
- [ ] U4-131 (P1) Highlight now playing by queue entry, not song ID
- [ ] U4-132 (P1) Add drag reorder with full keyboard alternative
- [ ] U4-133 (P1) Add multi-select queue editing
- [ ] U4-134 (P1) Add undo for remove and clear queue
- [ ] U4-135 (P1) Add queue sections
- [ ] U4-136 (P1) Show source context
- [ ] U4-137 (P1) Add “Save queue as playlist.”
- [ ] U4-138 (P1) Add queue menu separate from player menu
- [ ] U4-139 (P1) Preserve canonical order when shuffle toggles off
- [ ] U4-140 (P1) Make Play Next deterministic even when shuffle is enabled
- [ ] U4-141 (P1) Announce queue edits
- [ ] U4-142 (P1) Scroll/focus current item when the queue opens and after shuffle/reorder
- [ ] U4-143 (P1) Show continuation and automix failures with Retry
- [ ] U4-144 (P1) Add persistent-queue restore prompt when the previous session ended abnormally
- [ ] U4-145 (P1) Restore provider picker and cached variants from v0.1.8
- [ ] U4-146 (P1) Add provider menu with current, available, failed, disabled, and cached states
- [ ] U4-147 (P1) Add manual search and candidate preview
- [ ] U4-148 (P1) Add edit, offset, re-sync, and reset actions
- [ ] U4-149 (P1) Add copy line, copy all, and share lyrics/image flows
- [ ] U4-150 (P1) Add word-synced/background-vocal/multi-singer presentation where data supports it
- [ ] U4-151 (P1) Add text alignment, font size, font family, glow/animation, translation, romanization, and background-style settings
- [ ] U4-152 (P1) Respect reduced motion
- [ ] U4-153 (P1) Add auto-scroll resume affordance
- [ ] U4-154 (P1) Do not render hundreds of lyric lines as independent generic buttons without list semantics
- [ ] U4-155 (P1) Announce active lyric sparingly
- [ ] U4-156 (P1) Keep playback shortcuts active in lyrics while protecting line navigation
- [ ] U4-157 (P1) Add plain-lyrics search, selection, and copy accessibility
- [ ] U4-158 (P1) Show provider attribution and cached/offline status clearly
- [ ] U4-159 (P1) Prefetch next-track lyrics with cancellation and no UI race

## Phase 6 · M6.4 Menus, dialogs, confirmations, selection

- [ ] U4-160 (P1) Build one accessible Dialog primitive
- [ ] U4-161 (P1) Build one Menu primitive
- [ ] U4-162 (P1) Build one Popover/Combobox primitive
- [ ] U4-163 (P1) Bind every dialog to its heading with `aria-labelledby`
- [ ] U4-164 (P1) Keep Escape behavior topmost-first
- [ ] U4-165 (P1) Make Settings Back return one level before closing
- [ ] U4-166 (P1) Prevent background shortcuts while a modal is open
- [ ] U4-167 (P1) Confirm irreversible remote deletion
- [ ] U4-168 (P1) Confirm clearing local history, search history, queue, downloads, caches, playlists, and library data
- [ ] U4-169 (P1) Offer Undo for reversible removals
- [ ] U4-170 (P1) Distinguish Remove, Delete, Disconnect, and Clear
- [ ] U4-171 (P1) Disable actions while submitting
- [ ] U4-172 (P1) Preserve dialog input after recoverable errors
- [ ] U4-173 (P1) Show item eligibility before bulk actions
- [ ] U4-174 (P1) Add progress/cancel to bulk operations
- [ ] U4-175 (P1) Restore focus to the invoking control after close
- [ ] U4-176 (P1) Keep context menus on screen
- [ ] U4-177 (P1) Add right-click and keyboard context-menu invocation
- [ ] U4-178 (P1) Add tooltips for icon-only controls
- [ ] X4-001 (P1) Settings is treated as one boolean modal, so Back closes the entire settings experience rather than returning from a category
- [ ] X4-002 (P1) Eighteen modal surfaces use dialog roles but none is built on a real focus-managed dialog primitive
- [ ] X4-003 (P1) The recent-search listbox lacks combobox keyboard semantics and focus-controlled visibility
- [ ] X4-004 (P1) Several tablists do not give their child controls tab roles or selected states
- [ ] X4-005 (P1) Global Space/arrow shortcuts can override focused buttons and ARIA widgets because only input/textarea/select/contenteditable are excluded
- [ ] X4-006 (P1) Selection uses song IDs, so duplicate occurrences cannot be independently selected
- [ ] X4-007 (P1) Bulk download starts per-item operations and suppresses individual errors while immediately claiming a count started
- [ ] X4-008 (P1) Remove selected downloads has no confirmation, eligibility review, progress, cancellation, or undo
- [ ] X4-009 (P1) Uploaded-song deletion is immediate despite being a destructive remote operation
- [ ] X4-010 (P1) Queue Clear immediately stops playback and destroys queue state without confirmation or undo
- [ ] X4-011 (P1) The visual minimum target for several controls is around 30–34 px
- [ ] X4-012 (P1) Card menus are hover-hidden and need `:focus-within`/touch treatment
- [ ] X4-013 (P1) The app has no reduced-motion, forced-colors, high-contrast, light-theme, or system-theme CSS path
- [ ] X4-014 (P1) The minimum 860 px window width prevents compact Windows snap layouts
- [ ] X4-015 (P1) Player close clears the visible player rather than offering a configurable stop/minimize/keep-playing policy
- [ ] X4-016 (P1) Lyrics auto-scroll disables on interaction without a persistent, obvious resume control
- [ ] X4-017 (P1) Development language such as “typed item,” “watchEndpoint,” and “source contracts” leaks into normal UI copy
- [ ] X4-018 (P1) All user-facing strings are hardcoded in English
- [ ] X4-019 (P1) Missing reference features are extensive enough that parity must be managed as routes/capabilities, not by adding more conditions to `App.tsx`

## Phase 6 · M6.5 Accessibility

- [ ] U4-221 (P1) Define a complete keyboard map
- [ ] U4-222 (P1) Never steal Space/arrow keys from focused buttons, sliders, menus, tabs, lists, or dialogs
- [ ] U4-223 (P1) Add roving focus for tablists, menu lists, card rows, queue, and lyrics
- [ ] U4-224 (P1) Preserve focus during pagination and sorting
- [ ] U4-225 (P1) Ensure hidden/covered content cannot receive focus
- [ ] U4-226 (P1) Add skip links/landmarks
- [ ] U4-227 (P1) Make all pointer gestures keyboard-operable
- [ ] U4-228 (P1) Give every dialog an accessible name and description
- [ ] U4-229 (P1) Correct tab, listbox, menu, toolbar, grid, slider, and progress semantics
- [ ] U4-230 (P1) Add accessible value text to seek, volume, sleep timer, speed, pitch, EQ, and progress controls
- [ ] U4-231 (P1) Announce loading completion and errors without replacing focus
- [ ] U4-232 (P1) Add progress semantics to downloads and sync
- [ ] U4-233 (P1) Do not truncate the only error copy
- [ ] U4-234 (P1) Name artwork meaningfully only when informative
- [ ] U4-235 (P1) Replace symbol pronunciation risk
- [ ] U4-236 (P1) Do not rely on color
- [ ] U4-237 (P1) Meet WCAG AA contrast for text and controls in every theme/state
- [ ] U4-238 (P1) Keep focus indicators visible over all backgrounds and overlays
- [ ] U4-239 (P1) Increase small hit targets
- [ ] U4-240 (P1) Support 200% text scaling without horizontal page clipping
- [ ] U4-241 (P1) Support reduced motion, high contrast, and reduced transparency
- [ ] U4-242 (P1) Avoid time-limited notices as the sole feedback
- [ ] U4-243 (P1) Do not auto-focus destructive buttons
- [ ] U4-244 (P1) Test with Narrator, keyboard only, Windows High Contrast, 200% scale, and touch
- [ ] TR-M8 (P1) Accessibility incomplete

## Phase 6 · M6.6 Loading, errors, offline, copy, i18n

- [ ] U4-281 (P1) Use stale-while-revalidate
- [ ] U4-282 (P1) Distinguish offline, timeout, authentication, rate-limit, parser, unavailable-content, and playback-source errors
- [ ] U4-283 (P1) Provide contextual Retry
- [ ] U4-284 (P1) Show account-expired banners
- [ ] U4-285 (P1) Show rate-limit countdown using Retry-After when available
- [ ] U4-286 (P1) Show partial-success summaries
- [ ] U4-287 (P1) Keep technical details expandable
- [ ] U4-288 (P1) Add offline badges and availability filters
- [ ] U4-289 (P1) Never claim completion before backend confirmation
- [ ] U4-290 (P1) Replace developer-facing copy
- [ ] U4-291 (P1) Use consistent product terms
- [ ] U4-292 (P1) Add human-readable empty-state actions
- [ ] U4-293 (P1) Keep notice history
- [ ] U4-294 (P1) Do not silently swallow background errors
- [ ] TR-M9 (P1) No localization architecture
- [ ] TR-L6 (P1) Per-feature empty/error/offline states instead of one notice string

## Phase 6 · M6.7 Design system and visual consistency

- [ ] U4-295 (P2) Define tokens
- [ ] U4-296 (P2) Replace ad hoc z-index management with named layers
- [ ] U4-297 (P2) Standardize buttons
- [ ] U4-298 (P2) Standardize cards/list rows
- [ ] U4-299 (P2) Standardize screen headers and toolbars
- [ ] U4-300 (P2) Standardize loading/empty/error panels
- [ ] U4-301 (P2) Standardize form controls
- [ ] U4-302 (P2) Use proper icon assets
- [ ] U4-303 (P2) Ensure artwork is not upscaled unnecessarily
- [ ] U4-304 (P2) Add image loading, fallback, retry, and offline-cache states without layout shift
- [ ] U4-305 (P2) Apply truncation deliberately
- [ ] U4-306 (P2) Keep the visual language Windows-native without becoming a generic Fluent clone
- [ ] U4-307 (P2) Every route renders loading, empty, error, stale, offline, and success states
- [ ] U4-308 (P2) Back/forward restores route parameters, filters, selection, scroll, and modal stack
- [ ] U4-309 (P2) Stale async responses cannot update a replaced route
- [ ] U4-310 (P2) Dialog focus enters, traps, closes, and restores correctly
- [ ] U4-311 (P2) Menus and comboboxes pass keyboard interaction tests
- [ ] U4-312 (P2) Tablists use correct roles and arrow navigation
- [ ] U4-313 (P2) Global playback shortcuts do not override focused controls/widgets
- [ ] U4-314 (P2) Bulk actions report eligible/succeeded/failed/skipped counts
- [ ] U4-315 (P2) Duplicate songs remain independent in queue, playlist, history, and selection
- [ ] U4-316 (P2) Destructive actions require confirmation or support Undo according to policy
- [ ] U4-317 (P2) Every icon-only button has an accessible name and visible tooltip
- [ ] U4-318 (P2) Every modal has an accessible name and no background tabbability
- [ ] U4-319 (P2) Screen-reader live regions do not spam playback ticks or lyric lines
- [ ] U4-320 (P2) Reduced-motion mode disables nonessential animation/smooth scroll
- [ ] U4-321 (P2) Test 640/720/860/1024/1280/1440/1920 px widths and 600/768/1080 px heights
- [ ] U4-322 (P2) Test 100/125/150/175/200% Windows scaling
- [ ] U4-323 (P2) Test light, dark, pure black, Windows High Contrast, and custom accent
- [ ] U4-324 (P2) Test mouse, keyboard only, touchpad, touch, and coarse pointer
- [ ] U4-325 (P2) Test long English, German-like expansion, Arabic RTL, CJK, emoji, and mixed-script metadata
- [ ] U4-326 (P2) Test extremely long titles/artists/playlists and missing/broken artwork
- [ ] U4-327 (P2) Test modal/menu placement at every screen edge and monitor DPI transition
- [ ] U4-328 (P2) Test player with no lyrics, plain lyrics, line sync, word sync, error, local file, podcast, and unavailable stream
- [ ] U4-329 (P2) Test offline startup with downloads, cache, local files, and stale remote pages
- [ ] U4-330 (P2) Test every destructive confirmation and cancellation path
- [ ] U4-331 (P2) Complete all daily flows with keyboard only
- [ ] U4-332 (P2) Complete all daily flows with Windows Narrator
- [ ] U4-333 (P2) Verify focus order and visible focus in every dialog/menu/route
- [ ] U4-334 (P2) Verify high contrast and 200% text without loss of content or action
- [ ] U4-335 (P2) Verify reduced motion and no seizure/vestibular hazards
- [ ] U4-336 (P2) Verify status/error/progress messages are perceivable and persistent enough

## Phase 7 · M7.1 Settings parity

- [ ] U4-179 (P1) Make each settings category routable and searchable
- [ ] U4-180 (P1) Add Reset per setting group and Reset All with preview
- [ ] U4-181 (P1) Show when restart is required
- [ ] U4-182 (P1) Validate every numeric/text setting inline
- [ ] U4-183 (P1) Add setting dependency states
- [ ] U4-184 (P1) Version settings and migrate renamed/removed values
- [ ] U4-185 (P1) Remove development-audit prose from final customer UI
- [ ] U4-186 (P1) Light/Dark/System/Pure Black
- [ ] U4-187 (P1) Dynamic artwork/player background toggle
- [ ] U4-188 (P1) Accent palette and contrast-safe custom color
- [ ] U4-189 (P1) Font family, UI scale/density, grid size, and artwork crop/fit
- [ ] U4-190 (P1) Lyrics alignment, font size/style, glow, animation, and background
- [ ] U4-191 (P1) Navigation customization and compact/sidebar behavior
- [ ] U4-192 (P1) Reduce motion and transparency
- [ ] U4-193 (P1) Audio quality with actual format display
- [ ] U4-194 (P1) Volume persistence and pause-on-mute
- [ ] U4-195 (P1) Seek step, varispeed, pitch, and speed controls
- [ ] U4-196 (P1) Equalizer/AutoEQ and reset/bypass
- [ ] U4-197 (P1) Audio normalization level
- [ ] U4-198 (P1) Silence skipping
- [ ] U4-199 (P1) Crossfade only after the Windows playback engine supports it correctly
- [ ] U4-200 (P1) Persistent queue, autoplay/automix, pre-cache, shuffle/repeat persistence, duplicate policy, and stop-on-close behavior
- [ ] U4-201 (P1) “Play over other audio”/exclusive-mode policy appropriate to Windows
- [ ] U4-202 (P1) Preferred YouTube client/source diagnostics only in Advanced
- [ ] U4-203 (P1) Explicit/video filtering with scope explanation
- [ ] U4-204 (P1) Lyrics provider enable/order plus per-provider status
- [ ] U4-205 (P1) Romanization and translation settings
- [ ] U4-206 (P1) Proxy configuration with validation/test action
- [ ] U4-207 (P1) Separate local and remote history controls
- [ ] U4-208 (P1) Cache limits, image cache, player cache, download storage, clear/verify/repair, and storage-location controls
- [ ] U4-209 (P1) Pre-cache count and metered-network policy
- [ ] U4-210 (P1) Crash-reporting consent and privacy details if telemetry is added
- [ ] U4-211 (P1) Backup/restore preview, merge/replace mode, media exclusion, and schema compatibility
- [ ] U4-212 (P1) Full Google account screen
- [ ] U4-213 (P1) Full Spotify screen
- [ ] U4-214 (P1) Last.fm integration
- [ ] U4-215 (P1) Discord integration only with clear risk disclosure and secure authentication
- [ ] U4-216 (P1) Listen Together integration/settings
- [ ] U4-217 (P1) AI lyrics translation settings only when a real provider is configured
- [ ] U4-218 (P1) Updater channel and update UI
- [ ] U4-219 (P1) Changelog/release-notes screen and first-run-after-update summary
- [ ] U4-220 (P1) Complete About screen

## Phase 7 · M7.2 Responsive layout and Windows UX

- [ ] U4-245 (P1) Define layout classes by available width, not device labels
- [ ] U4-246 (P1) Use wide screens productively
- [ ] U4-247 (P1) Keep line lengths readable
- [ ] U4-248 (P1) Make overlays fit 600 px height
- [ ] U4-249 (P1) Avoid overlay stacking
- [ ] U4-250 (P1) Add touch-friendly mode automatically for coarse pointers
- [ ] U4-251 (P1) Add mouse wheel volume/seek only with clear hover/focus scope and configurable direction
- [ ] U4-252 (P1) Support drag-and-drop
- [ ] U4-253 (P1) Add Explorer integration carefully
- [ ] U4-254 (P1) Add Windows share/clipboard fallback
- [ ] U4-255 (P1) Add tray behavior only as an opt-in
- [ ] U4-256 (P1) Add jump-list/recent actions if useful
- [ ] U4-257 (P1) Add native notifications sparingly
- [ ] U4-258 (P1) Handle monitor/DPI changes live
- [ ] U4-259 (P1) Support RTL and long translations before localization ships
- [ ] U4-260 (P1) Externalize all user-facing strings

## Phase 7 · M7.3 Deep links, single instance, OS integration

- [ ] S5-075 (P1) Register `meld://` deep links
- [ ] S5-076 (P1) Forward args from the second instance
- [ ] S5-077 (P1) Validate files opened via association
- [ ] S5-078 (P1) System Media Transport Controls
- [ ] S5-079 (P1) Taskbar thumbnail buttons and progress
- [ ] S5-080 (P1) System tray
- [ ] S5-081 (P1) Jump list
- [ ] S5-082 (P1) Global media keys
- [ ] S5-083 (P1) Autostart (opt-in)
- [ ] S5-084 (P1) Power and session events

## Phase 8 · M8.1 Frontend rendering performance

- [ ] R6-032 (P1) Split the monolithic component
- [ ] R6-033 (P1) Isolate high-frequency playback state
- [ ] R6-034 (P1) Virtualize long lists
- [ ] R6-035 (P1) Lazy-load images
- [ ] R6-036 (P1) Code-split routes
- [ ] R6-037 (P1) Memoize derived data
- [ ] R6-038 (P1) Avoid layout thrash in lyrics
- [ ] R6-039 (P1) Debounce search and filter inputs
- [ ] R6-040 (P1) Stale-response protection
- [ ] R6-041 (P1) React Profiler budgets
- [ ] TR-L7 (P1) Virtualize very large lists

## Phase 8 · M8.2 Resource budgets

- [ ] R6-042 (P2) Define budgets
- [ ] R6-043 (P2) Leak checks
- [ ] R6-044 (P2) Free large payloads
- [ ] R6-045 (P2) Throttle background work when minimized
- [ ] R6-046 (P2) Timer hygiene
- [ ] R6-047 (P2) Artwork cache limits
- [ ] R6-048 (P2) Battery-aware behavior

## Phase 8 · M8.3 Startup, shutdown, offline, errors

- [ ] R6-049 (P1) Measure and log startup phases
- [ ] R6-050 (P1) Defer non-critical startup work
- [ ] R6-051 (P1) Show a shell immediately
- [ ] R6-052 (P1) Graceful shutdown
- [ ] R6-053 (P1) Restore session state
- [ ] R6-054 (P1) Crash-loop protection
- [ ] R6-055 (P1) Unified error taxonomy
- [ ] R6-056 (P1) Offline mode
- [ ] R6-057 (P1) Mutation outbox
- [ ] R6-058 (P1) Partial failure reporting
- [ ] R6-059 (P1) Never silently swallow errors
- [ ] R6-060 (P1) User-visible recovery actions
- [ ] TR-L5 (P1) Crash recovery and safe-mode/reset for corrupt state

## Phase 9 · M9.1 Missing reference product surfaces

- [ ] U4-261 (P2) Listen Together screen and real-time room UX
- [ ] U4-262 (P2) Music recognition and recognition history
- [ ] U4-263 (P2) Mood & Genres
- [ ] U4-264 (P2) Charts
- [ ] U4-265 (P2) New Releases
- [ ] U4-266 (P2) Spotify Home, Search, Album, Artist, followed artists, recommendations, and re-login UX
- [ ] U4-267 (P2) Wrapped/recap flow and weekly/monthly playlists
- [ ] U4-268 (P2) Last.fm
- [ ] U4-269 (P2) Discord presence
- [ ] U4-270 (P2) AI/manual lyrics translation and romanization
- [ ] U4-271 (P2) Full equalizer/AutoEQ wizard
- [ ] U4-272 (P2) Import/export flows
- [ ] U4-273 (P2) Changelog and update UX
- [ ] U4-274 (P2) Crash/recovery screen
- [ ] U4-275 (P2) Alarm/scheduled playback only if a reliable Windows background/task model is implemented
- [ ] U4-276 (P2) Proxy settings and test connection
- [ ] U4-277 (P2) Cache and pre-cache management
- [ ] U4-278 (P2) Custom theme/colors, UI density, navigation customization, and pure-black mode
- [ ] U4-279 (P2) Release notes/onboarding for first launch and major updates
- [ ] U4-280 (P2) Diagnostics/support bundle with automatic secret redaction

## Phase 9 · M9.2 Release-audit features (FEAT)

- [ ] FEAT-001 (P2) Podcasts without login (guest)
- [ ] FEAT-002 (P2) Musixmatch removed (wrong lyrics)
- [ ] FEAT-003 (P2) Search user profiles
- [ ] FEAT-004 (P2) Redesigned song details, Last.fm/account settings screens
- [ ] FEAT-005 (P2) Mini-player background styles, playlist button
- [ ] FEAT-006 (P2) Synced scrolling lyrics for YouTube-sourced songs
- [ ] FEAT-007 (P2) High-res artwork + thumbnail fallback chain
- [ ] FEAT-008 (P2) SponsorBlock (opt-in, categories, toast, privacy hash prefix)
- [ ] FEAT-009 (P2) Add/remove tracks in Spotify playlists (incl. reverse lookup for YouTube tracks)
- [ ] FEAT-010 (P2) Stale auth cleared after backup restore
- [ ] FEAT-011 (P2) Timeout guards (REST 3 s, engine 4 s) with artist-top-tracks fallback
- [ ] FEAT-012 (P2) Thumbnail fallback chain Spotify→YouTube match→video
- [ ] FEAT-013 (P2) Google Cast (Windows: optional DLNA/Chromecast casting)

## Phase 10 · M10.1 Updater, signing, installer, portable, uninstaller

- [x] S5-063 (P1) Add `tauri-plugin-updater` with a signed manifest — minisign key in Actions secrets, pubkey in tauri.conf.json, latest.json per release; updates::tests, release.test.mjs
- [ ] S5-064 (P1) Code-sign Windows binaries
- [ ] S5-065 (P1) Updater UX — partial: on-demand + daily check, notes, progress, signature verify, explicit install; background download/"update on close" pending
- [ ] S5-066 (P1) Update channels
- [ ] S5-067 (P1) Rollback safety
- [ ] S5-068 (P1) Portable updater
- [ ] S5-069 (P1) Installer and uninstaller
- [ ] S5-072 (P1) Reproducible CI release pipeline — partial: pipeline, audits, checksums, smoke done; Authenticode signing pending (D-010)
- [x] S5-073 (P1) Software bill of materials and license notices — sbom.cdx.json + THIRD-PARTY-NOTICES.txt per release; release.test.mjs
- [x] S5-074 (P1) Release provenance — actions/attest-build-provenance in release.yml
- [ ] TR-M10 (P1) No signed updater/release trust path

## Phase 10 · M10.2 Final verification

- [ ] S5-098 (P1) Automated security test suite
- [ ] S5-099 (P1) Manual threat-model review
- [ ] S5-100 (P1) Pre-release checklist
- [ ] R6-085 (P1) Performance acceptance run
- [ ] R6-086 (P1) Reliability soak
- [ ] R6-087 (P1) Test gate
- [ ] TR-L1 (P2) README screenshots, architecture diagram, data paths, troubleshooting, known issues
