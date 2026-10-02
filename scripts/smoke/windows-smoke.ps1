# Windows smoke test for release assets (runs on windows-latest; see .github/workflows/release.yml).
#  1. install 0.1.8 silently, start it once so it creates its database, add fake plaintext secrets
#  2. install the new setup over it silently, start it: secrets must be sealed, the library kept
#  3. the portable ZIP starts
#  4. silent uninstall keeps the user's data
param([Parameter(Mandatory)] [string] $Setup, [Parameter(Mandatory)] [string] $Portable, [string] $Work = "$env:RUNNER_TEMP\smoke")
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $Work | Out-Null
$installDir = Join-Path $env:LOCALAPPDATA "Meld Desktop"
$database = Join-Path $env:APPDATA "Meld Desktop\meld.sqlite3"

function Find-AppExe {
  Get-ChildItem -Path $installDir -Filter *.exe | Where-Object { $_.Name -notmatch '^uninstall' } | Select-Object -First 1 -ExpandProperty FullName
}
function Start-Briefly([string] $exe, [int] $seconds = 20) {
  Write-Host "starting $exe for $seconds s"
  $process = Start-Process -FilePath $exe -PassThru
  Start-Sleep -Seconds $seconds
  if ($process.HasExited) { throw "$exe exited early with code $($process.ExitCode)" }
  Stop-Process -Id $process.Id -Force
  Get-Process | Where-Object { $_.Path -eq $exe } | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3
}
function Invoke-Python([string] $code) {
  $file = Join-Path $Work "check.py"; Set-Content -Path $file -Value $code -Encoding utf8
  python $file $database
  if ($LASTEXITCODE -ne 0) { throw "database check failed" }
}

Write-Host "== 1. install Meld Desktop 0.1.8"
gh release download v0.1.8 --repo $env:GITHUB_REPOSITORY --pattern "*setup.exe" --dir $Work --clobber
$old = Get-ChildItem -Path $Work -Filter "Meld-Desktop-0.1.8*setup.exe" | Select-Object -First 1 -ExpandProperty FullName
Start-Process -FilePath $old -ArgumentList "/S" -Wait
$oldExe = Find-AppExe
if (-not $oldExe) { throw "0.1.8 did not install into $installDir" }
Start-Briefly $oldExe
if (-not (Test-Path $database)) { throw "0.1.8 did not create $database" }
Invoke-Python @'
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
db.executemany("INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)", [("cookie", "SAPISID=SMOKEPLAINCOOKIE"), ("spotifySpDc", "SMOKEPLAINSPDC"), ("spotifyAccessToken", "SMOKEPLAINTOKEN")])
db.execute("INSERT OR REPLACE INTO songs(id, title, kind, saved_at, liked) VALUES ('smoke-song', 'Smoke Song', 'song', 0, 1)")
db.commit()
print("seeded 0.1.8 database")
'@

Write-Host "== 2. install the new version over 0.1.8"
Start-Process -FilePath $Setup -ArgumentList "/S" -Wait
$newExe = Find-AppExe
Start-Briefly $newExe 25
Invoke-Python @'
import sqlite3, sys
raw = open(sys.argv[1], "rb").read()
assert b"SMOKEPLAIN" not in raw, "plaintext secret still present in the database file"
db = sqlite3.connect(sys.argv[1])
values = dict(db.execute("SELECT key, value FROM settings WHERE key IN ('cookie', 'spotifySpDc', 'spotifyAccessToken')"))
assert len(values) == 3 and all(v.startswith("enc1:") for v in values.values()), f"secrets not sealed: {sorted(values)}"
assert db.execute("SELECT title, liked FROM songs WHERE id = 'smoke-song'").fetchone() == ("Smoke Song", 1), "library row lost"
print("upgrade OK: secrets sealed, no plaintext, library kept")
'@

Write-Host "== 3. portable ZIP starts"
$portableDir = Join-Path $Work "portable"
Expand-Archive -Path $Portable -DestinationPath $portableDir -Force
foreach ($required in @("Meld Desktop.exe", "portable.marker", "LICENSE", "NOTICE", "THIRD-PARTY-NOTICES.txt", "README-portable.txt", "icons\taskbar\PLAY_THUMB.ico")) {
  if (-not (Test-Path (Join-Path $portableDir $required))) { throw "portable ZIP is missing $required" }
}
Start-Briefly (Join-Path $portableDir "Meld Desktop.exe")

Write-Host "== 4. silent uninstall keeps user data"
$uninstaller = Get-ChildItem -Path $installDir -Filter "uninstall*.exe" | Select-Object -First 1 -ExpandProperty FullName
Start-Process -FilePath $uninstaller -ArgumentList "/S" -Wait
Start-Sleep -Seconds 5
if (Test-Path $newExe) { throw "uninstall left $newExe behind" }
if (-not (Test-Path $database)) { throw "silent uninstall deleted the user's library" }
Write-Host "smoke OK"
