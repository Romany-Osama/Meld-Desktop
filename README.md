# Meld Desktop

Meld Desktop is a lightweight native Windows desktop adaptation of the open-source [Meld/Metrolist](https://github.com/FrancescoGrazioso/Meld) source contracts. It uses Tauri 2, React/TypeScript, Rust, and SQLite rather than Electron, Java, a localhost playback server, or browser-based playback.

This project is an independent desktop adaptation and is **not an official Meld release**. It retains the upstream GPL-3.0 licensing and attribution. The desktop implementation follows the live source where a Windows/native equivalent can be implemented honestly; it does not claim Android-level 1:1 parity where the platform or source protocol differs.

## Current native scope

The desktop client currently includes YouTube Music home/search/detail/playlist flows, local SQLite library state, Meld-style liked songs and library filters, local playlists, downloads, a separate playback cache, lyrics provider ordering and local lyrics caching, synchronized lyrics presentation, queue/automix controls, history, statistics, Google/YouTube Music session flow, Spotify library folders/playlists/liked songs, podcast library entry points, settings, backup/restore, native Windows navigation controls, Windows Media Session metadata and transport handlers where supported, an Advanced playback speed control with a persisted varispeed preference, Meld-style incremental seek gestures on player artwork, Pause on mute behavior, and a Persistent Queue enabled by default that restores queue items across restarts and can be disabled from Player settings.

An explicit offline download stores the audio file locally through a temporary `.part` file and resumes a retained partial file when the source honors HTTP Range (`206 Partial Content`); a server that does not honor the range causes a safe restart from byte zero. It also attempts to store the source thumbnail as a local artwork file, preserves the resolved track duration in local metadata, and caches lyrics in SQLite through the configured Meld lyrics provider chain. The Downloaded library plays a verified `localPath` directly, without calling the remote player resolver. Downloaded media and player-cache media remain separate. Backups intentionally contain the SQLite database and allowlisted non-sensitive settings only; they do not embed media files or authentication/session material.

When enabled in Player settings, repeated double-clicks on the left or right half of the player artwork increase the five-second seek step, matching Meld's incremental seek behavior. Pause on mute can pause native playback at zero volume and resume it when volume is raised. The player exposes now-playing metadata and media-key transport actions through the WebView2 Media Session API when supported. It passes available playlist context for playlist-owned/private tracks and uses direct original audio URLs returned by supported YouTube Music client responses. Some source responses require protected or transformed stream handling that is not part of this native port. The port therefore does not implement DRM circumvention, PoToken extraction, SABR bypass, signature-cipher/n-transform bypass, ad bypass, ripping, or browser playback. If a direct source URL cannot be resolved, the UI reports a truthful playback/download failure.

## Build on Windows

The supported primary targets are Windows 10 and Windows 11. Production builds are intentionally run without bundling so the generated executable can be inspected directly:

```powershell
npm ci
npm run build
cd src-tauri
cargo check --release --locked
cargo test --release --locked
cd ..
npx tauri build --no-bundle
```

For machines with limited free space, set `CARGO_TARGET_DIR` to a directory on a drive with sufficient capacity. Do not use `npm run dev` as a production playback dependency; the application is designed to run as a native executable.

## Source and license

Meld Desktop is distributed under the GNU General Public License v3.0. See [LICENSE](LICENSE). Upstream source attribution and the live reference repository are preserved at [FrancescoGrazioso/Meld](https://github.com/FrancescoGrazioso/Meld). Source-dependent gaps and platform boundaries are tracked in the external implementation roadmap used during development rather than hidden behind inactive controls.

## Status

This repository contains an active native port, not a claim of complete feature parity or public release readiness. External integrations such as Last.fm, Discord RPC, Listen Together, Qobuz, Cast, updater signing, Wrapped, Android Auto, ShazamKit, and Android-specific media/session features require separate real contracts or platform equivalents and are not represented as complete features here. The Advanced playback control uses native audio playbackRate; Android's independent tempo/pitch processor and system equalizer are not claimed as identical.
