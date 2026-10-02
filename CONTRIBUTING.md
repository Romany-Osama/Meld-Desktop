# Contributing to Meld Desktop

Thanks for helping. Meld Desktop is a Windows port (Tauri 2, Rust, React, SQLite) of [Meld](https://github.com/FrancescoGrazioso/Meld) and is licensed **GPL-3.0-only**. By contributing you agree that your contribution is licensed under the same terms.

## Ground rules

- **No DRM, advertising or paywall bypass**, no stream ripping of protected content, and no features that only pretend to work. If something cannot be implemented properly, leave it out and say so.
- **Never commit or paste secrets** (cookies, tokens, `sp_dc`/`sp_key`, signing keys). Secret scanning and push protection are enabled; use fake values in tests and fixtures.
- Do not remove a feature that a released version already has without an entry in `docs/plan/DECISIONS.md`.
- Every change comes with tests (Rust unit/integration tests, `scripts/tests`, or frontend tests once available).

## Branches and releases (QUEUE-001)

- **`main` is the only canonical branch.** Every feature and fix lands on `main` through a PR with a merge commit; there is no long-lived release, development or "v0.1.8" line. Short-lived topic branches (`feat/…`, `fix/…`, `chore/…`, `test/…`) are branched from an up-to-date `main` and deleted after merging.
- **Releases are built only from `main`.** `release.yml` refuses a tag whose commit is not on `main` and whose name is not `v<package.json version>`. Every earlier release tag, including `v0.1.8`, is an ancestor of `main` (DECISIONS D-001).
- Queue, playback and download logic has one implementation, tested on `main` (`src/lib/queue.test.ts`, `src/lib/playbackSession.test.ts`, `src/lib/persistentPlayback.test.ts`, Rust `download_resume` tests). Older unmerged branches are history, not sources: port a change from them with a PR and tests, never by releasing from them.

## Development setup

Requirements: Windows 10/11 (primary target), Node.js 22, Rust stable with `rustfmt` and `clippy`, and the [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/).

```sh
npm ci
npm run tauri dev
```

## Checks (the same ones CI runs)

```sh
npm run check:versions
npm run check:security
npm run check:ui
npm run check:tooling
npm run lint            # ESLint (flat config); no new warnings allowed
npm run format:check    # Prettier; fix with `npm run format`
npm run test:scripts
npm test
npm run typecheck
npm run build
cd src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets --locked -- -D warnings
cargo test --locked
```

Line endings are LF everywhere except PowerShell scripts (CRLF), enforced by `.gitattributes` and `npm run check:tooling`. The one-off Prettier reformat is listed in `.git-blame-ignore-revs`; run `git config blame.ignoreRevsFile .git-blame-ignore-revs` to skip it in `git blame`.

## Required checks on `main`

A PR can merge only when `Lint and format`, `Dependency audit`, `Windows build and tests` and `Release dry run` pass on a branch that is up to date with `main`; this applies to admins too. The full release build and Windows smoke run only for PRs that touch the release pipeline. The list lives in `scripts/lib/branch-protection.mjs`; check or apply it with `GH_TOKEN=… node scripts/branch-protection.mjs [--apply]` (needs an admin token). See DECISIONS D-022.

## Versioning

`package.json` is the single version source. Bump with `node scripts/bump-version.mjs <x.y.z>` — it updates `package.json`, `package-lock.json`, `Cargo.toml` and `Cargo.lock`; `tauri.conf.json` reads `../package.json`. See `CHANGELOG.md` and `docs/plan/MASTER-PLAN.md` §7.

## Pull requests

- Small, focused PRs against `main`; CI must be green.
- [Conventional Commits](https://www.conventionalcommits.org/) (`fix:`, `feat:`, `test:`, `docs:`, `ci:`, `chore:` …) and, where applicable, the plan task IDs in brackets, e.g. `fix(downloads): resume interrupted downloads [PLAY-055]`.
- Update `CHANGELOG.md` under **Unreleased** for user-visible changes.
- Update `docs/plan/PROGRESS.md` only when a task's "Done when" is met and tested.

## Reporting bugs and requesting features

Use the issue templates. For security problems follow `SECURITY.md` instead.
