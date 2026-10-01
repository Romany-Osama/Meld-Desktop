# Security policy

## Supported versions

| Version | Supported |
|---|---|
| Latest 0.x release (currently 0.2.0) | Yes |
| 0.1.8 and older | **No** — these store session secrets in plaintext and ship without a Content Security Policy. Update to 0.2.0 or later. |

Only the latest release receives security fixes. Releases are published as GitHub Release assets (NSIS setup and portable ZIP) with `SHA256SUMS`.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: **Security → Report a vulnerability** on this repository (private vulnerability reporting). Do not open a public issue for a security problem.

Include the Meld Desktop version, Windows version, steps to reproduce, and the impact you observed. **Never include passwords, cookies, tokens, `sp_dc`/`sp_key` values or other credentials** in a report, issue, log or screenshot. If you accidentally posted one, revoke it at the provider (Google, Spotify, GitHub) right away.

We aim to acknowledge reports within 7 days and to ship a fix or mitigation for confirmed high-severity issues in the next release.

## Scope

In scope: the Meld Desktop application, its installer/portable package, its update mechanism and this repository's CI.

Out of scope: vulnerabilities in YouTube Music, Google, Spotify or other third-party services, and requests to bypass DRM, advertising or paywalls (Meld Desktop will not implement these).

## How Meld Desktop protects your data

- Session secrets are encrypted at rest (AES-256-GCM) with a key stored in Windows Credential Manager; they are never written to logs or backups.
- The WebView runs with a Content Security Policy and a narrow asset scope.
- Signing out removes the stored session and the WebView's sign-in data.
