# Meld Desktop

**Meld Desktop** is a lightweight music player for Windows 10 and Windows 11. It brings the calm, dark blue-black Meld/Spotify-style experience to the desktop while keeping the application native, fast, and easy to use.

This is an independent Windows project. It is not the official Meld mobile application, and this repository contains only the desktop implementation. It does not include Android, Kotlin, Gradle, or mobile application files.

## What you can do

| Feature | What it provides |
|---|---|
| Home and Search | Discover music, albums, artists, playlists, podcasts, and episodes through real YouTube Music results. |
| Player | Play, pause, seek, change volume, control playback speed, repeat, shuffle, and move between songs. |
| Queue | Continue playlist playback, load more items when available, play related recommendations where appropriate, and restore the queue after restarting. |
| Lyrics | Load lyrics from the configured provider order, save them for offline use, highlight synchronized lines, and jump to a line by clicking it. |
| Offline listening | Save supported songs locally with artwork and lyrics so they can be played without an internet connection. |
| Library | Use Liked Songs, Downloads, Cache, playlists, albums, artists, podcasts, history, statistics, and local audio files. |
| Playlists | Create local playlists, add or remove songs, select multiple items, shuffle them, and manage them from the three-dot menu. |
| Podcasts | Save shows, browse episodes, download supported episodes, and refresh saved-show information. |
| Accounts | Connect Google/YouTube Music for library actions and connect Spotify for folders, playlists, liked songs, matching, and playlist actions. |
| Windows controls | Use media keys and, where Windows supports it, taskbar thumbnail Previous, Play-Pause, and Next buttons. |
| Personal controls | Adjust volume with the mouse wheel over the player volume controls, use keyboard shortcuts, manage history, and create safe backups of library data and settings. |

## Offline listening

When you choose **Download**, Meld Desktop saves a supported audio file to the Windows downloads folder. It also attempts to save the artwork and lyrics. Interrupted downloads can resume when the source supports it, and downloaded songs remain available from the Downloaded library without needing the online player.

Downloaded songs, temporary playback cache, imported local files, account sessions, and backups are kept separate. Backups include the local library and non-sensitive settings, but they intentionally do not include passwords, account sessions, or media files.

## Getting started

Download the latest portable package from the [Releases page](https://github.com/Romany-Osama/Meld-Desktop/releases). Extract the complete ZIP folder and start `meld-desktop-0.1.0-gap-batch.exe`. Keep the `icons/taskbar` folder beside the executable so the Windows taskbar thumbnail controls can load their icons.

The first screen can be used without connecting an account for supported public browsing and playback. Connect Google/YouTube Music when you want account library actions, saved shows, subscriptions, or synchronized personal content. Connect Spotify only when you want Spotify library and playlist features.

## Privacy and advertising

Meld Desktop does not add advertisements, advertising SDKs, tracking accounts, or a project-owned online server. Account sessions are stored locally for the account features you choose to use. The upstream service may still control content returned by its own service; this application does not bypass those decisions.

## Important boundaries

Meld Desktop uses supported direct audio responses. Some upstream responses require protected or transformed stream handling that is not included in this project. The application therefore does not provide DRM circumvention, token extraction, signature or cipher bypass, SABR bypass, ad bypass, ripping, browser-tab playback, or a localhost playback service.

Some mobile-only or service-dependent features are not part of the Windows application, including Android Auto, Android notification and audio-focus services, Listen Together without a synchronization service, remote Wrapped feeds, ShazamKit recognition, and integrations that require an authorized third-party application or signing contract. The application does not show inactive buttons for features that it cannot actually perform.

## Project status

The current public release is [v0.1.2 — Safe parity gap batch](https://github.com/Romany-Osama/Meld-Desktop/releases/tag/v0.1.2-safe-gap-batch). Read [CHANGELOG.md](CHANGELOG.md) for the release history and the exact validation results.

This project is an active independent desktop adaptation. It follows the user-facing ideas and publicly available behavior of Meld where a reliable Windows implementation is possible, but it does not claim to be the official Meld release or to be a byte-for-byte copy of the mobile application.

## License and attribution

Meld Desktop is distributed under the [GNU General Public License v3.0](LICENSE). The project was developed as an independent desktop adaptation using the publicly available [Meld/Metrolist project](https://github.com/FrancescoGrazioso/Meld) as a behavioral and design reference. The upstream project remains credited here in accordance with its license and attribution requirements. This repository contains the Windows desktop code only.

## Feedback

If you find a problem, include the Windows version, the Meld Desktop release, the screen where it happened, and the exact action that caused it. Please do not include passwords, cookies, account tokens, or private session data in an issue.
