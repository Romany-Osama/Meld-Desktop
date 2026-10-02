Meld Desktop — portable version
================================

1. Extract the whole ZIP into a folder you can write to (for example on a USB drive or in Documents).
   Keep "icons\taskbar" next to "Meld Desktop.exe": it holds the taskbar Previous/Play/Next buttons.
2. Run "Meld Desktop.exe".

Requirements: Windows 10 or 11 (64-bit) with the Microsoft Edge WebView2 Runtime. Windows 11 and up-to-date
Windows 10 already include it; otherwise install it from https://developer.microsoft.com/microsoft-edge/webview2/

Your data: this version currently keeps the library, settings and downloads in the same place as the installed
version (%APPDATA%\Meld Desktop), so both share one library. Saved sign-ins are encrypted with a key stored in
Windows Credential Manager.

Updates: Settings → About → Check for updates. For the portable version this opens the download page; extract
the new ZIP over the old folder. Your library is not touched.

Licence: GPL-3.0-only (see LICENSE and NOTICE). Third-party licences: THIRD-PARTY-NOTICES.txt.
Source code: https://github.com/Romany-Osama/Meld-Desktop
