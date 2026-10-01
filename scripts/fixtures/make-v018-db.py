#!/usr/bin/env python3
"""Regenerates src-tauri/tests/fixtures/v0.1.8-song-db.sql from the v0.1.8 tag's own schema code.

Usage (repo root): python3 scripts/fixtures/make-v018-db.py
The schema is taken verbatim from RuntimeState::new at tag v0.1.8, so the fixture matches what v0.1.8 users have on disk.
All secrets are fake markers that the upgrade test searches for at byte level.
"""
import re, sqlite3, subprocess

src = subprocess.run(["git", "show", "v0.1.8:src-tauri/src/lib.rs"], capture_output=True, text=True, check=True).stdout
body = src[src.index("fn new() -> Self {"):src.index("Self { visitor_data", src.index("fn new() -> Self {"))]
schema = re.search(r'execute_batch\(\s*"(.*?)",\s*\)', body, re.S).group(1)
db = sqlite3.connect(":memory:")
db.executescript(schema)
for alter in re.findall(r'db\.execute\("(ALTER TABLE[^"]*)"', body):
    try:
        db.execute(alter)
    except sqlite3.OperationalError:
        pass  # v0.1.8 ignored these errors too (column already present)
songs = [("s1", "Blinding Lights", "The Weeknd", "https://i.ytimg.com/vi/s1/hq.jpg", "v1", 1, 1, 1, 200),
         ("s2", "Downloaded Song", "Artist B", None, "v2", 0, 1, 0, 180),
         ("s3", "Local Track", "Me", None, None, 0, 1, 0, 90)]
for sid, title, sub, thumb, vid, liked, inlib, yl, dur in songs:
    db.execute("INSERT INTO songs (id,title,subtitle,thumbnail,video_id,kind,saved_at,liked,in_library,youtube_liked,duration) VALUES (?,?,?,?,?,'song',1700000000000,?,?,?,?)", (sid, title, sub, thumb, vid, liked, inlib, yl, dur))
db.execute("UPDATE songs SET is_local=1, local_path='C:\\Music\\local.mp3' WHERE id='s3'")
db.execute("INSERT INTO playlists (id,title,kind,saved_at,source) VALUES ('p1','Road trip','playlist',1700000000000,'local')")
db.executemany("INSERT INTO playlist_songs (playlist_id,position,song_id) VALUES ('p1',?,?)", [(0, "s1"), (1, "s2")])
db.execute("INSERT INTO downloads (song_id,path,bytes,total_bytes,state,error,lyrics_cached,artwork_path,downloaded_at) VALUES ('s2','C:\\Users\\u\\AppData\\Roaming\\Meld Desktop\\downloads\\x.audio',1048576,4194304,'downloading',NULL,0,NULL,1700000000000)")
db.execute("INSERT INTO history (song_id,played_at,play_time_ms) VALUES ('s1',1700000000000,183000)")
settings = {"cookie": "SAPISID=V018PLAINCOOKIE0123456789; __Secure-3PSID=V018PLAINPSID", "dataSyncId": "datasync", "visitorData": "visitor",
            "accountName": "Tester", "spotifySpDc": "V018PLAINSPDC0123456789", "spotifySpKey": "V018PLAINSPKEY0123",
            "spotifyAccessToken": "V018PLAINTOKEN0123456789", "spotifyTokenExpiry": "1700000000000", "audioQuality": "high",
            "playerVolume": "0.6", "persistentQueue": "true", "varispeed": "false", "hideExplicit": "false"}
for key, value in settings.items():
    db.execute("INSERT INTO settings (key,value) VALUES (?,?)", (key, value))
db.commit()
with open("src-tauri/tests/fixtures/v0.1.8-song-db.sql", "w") as out:
    out.write("-- Meld Desktop v0.1.8 database fixture (schema built by the v0.1.8 RuntimeState::new code at tag v0.1.8,\n-- 5f1aaf53). Contains plaintext session secrets exactly as v0.1.8 stored them. Regenerate with\n-- scripts/fixtures/make-v018-db.py if the fixture ever needs more rows. All secrets are fake.\n")
    # iterdump orders tables alphabetically; child rows precede songs, so defer FK checks.
    out.write("PRAGMA foreign_keys=OFF;\n")
    for line in db.iterdump():
        out.write(line + "\n")
