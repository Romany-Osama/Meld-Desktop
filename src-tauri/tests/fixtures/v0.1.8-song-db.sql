-- Meld Desktop v0.1.8 database fixture (schema built by the v0.1.8 RuntimeState::new code at tag v0.1.8,
-- 5f1aaf53). Contains plaintext session secrets exactly as v0.1.8 stored them. Regenerate with
-- scripts/fixtures/make-v018-db.py if the fixture ever needs more rows. All secrets are fake.
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE albums (
                id TEXT PRIMARY KEY,
                playlist_id TEXT,
                title TEXT NOT NULL,
                year INTEGER,
                thumbnail TEXT,
                explicit INTEGER NOT NULL DEFAULT 0,
                liked INTEGER NOT NULL DEFAULT 0,
                bookmarked_at INTEGER,
                in_library INTEGER NOT NULL DEFAULT 0,
                uploaded INTEGER NOT NULL DEFAULT 0,
                saved_at INTEGER NOT NULL
             );
CREATE TABLE artists (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                thumbnail TEXT,
                channel_id TEXT,
                bookmarked_at INTEGER,
                podcast_channel INTEGER NOT NULL DEFAULT 0,
                spotify_id TEXT,
                saved_at INTEGER NOT NULL
             );
CREATE TABLE downloads (
                 song_id TEXT PRIMARY KEY,
                 path TEXT NOT NULL,
                 bytes INTEGER NOT NULL DEFAULT 0,
                 total_bytes INTEGER,
                 state TEXT NOT NULL DEFAULT 'completed',
                 error TEXT,
                 lyrics_cached INTEGER NOT NULL DEFAULT 0,
                 artwork_path TEXT,
                 downloaded_at INTEGER NOT NULL
              );
INSERT INTO "downloads" VALUES('s2','C:\Users\u\AppData\Roaming\Meld Desktop\downloads\x.audio',1048576,4194304,'downloading',NULL,0,NULL,1700000000000);
CREATE TABLE history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                song_id TEXT NOT NULL,
                played_at INTEGER NOT NULL,
                play_time_ms INTEGER NOT NULL DEFAULT 0
             );
INSERT INTO "history" VALUES(1,'s1',1700000000000,183000);
CREATE TABLE lyrics (
                song_id TEXT PRIMARY KEY,
                provider TEXT NOT NULL,
                text TEXT NOT NULL,
                synced INTEGER NOT NULL DEFAULT 0,
                fetched_at INTEGER NOT NULL
             );
CREATE TABLE lyrics_variants (
                song_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                text TEXT NOT NULL,
                synced INTEGER NOT NULL DEFAULT 0,
                matched_title TEXT NOT NULL DEFAULT '',
                matched_artist TEXT NOT NULL DEFAULT '',
                fetched_at INTEGER NOT NULL,
                PRIMARY KEY (song_id, provider)
             );
CREATE TABLE player_cache (
                 song_id TEXT PRIMARY KEY,
                 path TEXT NOT NULL,
                 bytes INTEGER NOT NULL DEFAULT 0,
                 cached_at INTEGER NOT NULL,
                 quality TEXT NOT NULL DEFAULT 'auto'
              );
CREATE TABLE playlist_songs (
                playlist_id TEXT NOT NULL,
                position INTEGER NOT NULL,
                song_id TEXT NOT NULL,
                PRIMARY KEY (playlist_id, position),
                FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
                FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
             );
INSERT INTO "playlist_songs" VALUES('p1',0,'s1');
INSERT INTO "playlist_songs" VALUES('p1',1,'s2');
CREATE TABLE playlists (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                subtitle TEXT NOT NULL DEFAULT '',
                thumbnail TEXT,
                kind TEXT NOT NULL,
                saved_at INTEGER NOT NULL,
                source TEXT NOT NULL DEFAULT 'local'
             );
INSERT INTO "playlists" VALUES('p1','Road trip','',NULL,'playlist',1700000000000,'local');
CREATE TABLE podcasts (
                 id TEXT PRIMARY KEY,
                 title TEXT NOT NULL,
                 author TEXT,
                 thumbnail TEXT,
                 bookmarked_at INTEGER,
                 saved_at INTEGER NOT NULL
              , detail_json TEXT);
CREATE TABLE search_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query TEXT NOT NULL,
                searched_at INTEGER NOT NULL
             );
CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
             );
INSERT INTO "settings" VALUES('cookie','SAPISID=V018PLAINCOOKIE0123456789; __Secure-3PSID=V018PLAINPSID');
INSERT INTO "settings" VALUES('dataSyncId','datasync');
INSERT INTO "settings" VALUES('visitorData','visitor');
INSERT INTO "settings" VALUES('accountName','Tester');
INSERT INTO "settings" VALUES('spotifySpDc','V018PLAINSPDC0123456789');
INSERT INTO "settings" VALUES('spotifySpKey','V018PLAINSPKEY0123');
INSERT INTO "settings" VALUES('spotifyAccessToken','V018PLAINTOKEN0123456789');
INSERT INTO "settings" VALUES('spotifyTokenExpiry','1700000000000');
INSERT INTO "settings" VALUES('audioQuality','high');
INSERT INTO "settings" VALUES('playerVolume','0.6');
INSERT INTO "settings" VALUES('persistentQueue','true');
INSERT INTO "settings" VALUES('varispeed','false');
INSERT INTO "settings" VALUES('hideExplicit','false');
CREATE TABLE song_albums (
                song_id TEXT NOT NULL,
                album_id TEXT NOT NULL,
                PRIMARY KEY (song_id, album_id),
                FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
                FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
             );
CREATE TABLE song_artists (
                song_id TEXT NOT NULL,
                artist_id TEXT NOT NULL,
                position INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (song_id, artist_id),
                FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
                FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
             );
CREATE TABLE songs (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                subtitle TEXT NOT NULL DEFAULT '',
                thumbnail TEXT,
                browse_id TEXT,
                playlist_id TEXT,
                video_id TEXT,
                set_video_id TEXT,
                kind TEXT NOT NULL,
                saved_at INTEGER NOT NULL,
                explicit INTEGER NOT NULL DEFAULT 0,
                music_video_type TEXT,
                liked INTEGER NOT NULL DEFAULT 0,
                liked_date INTEGER,
                in_library INTEGER NOT NULL DEFAULT 0,
                is_video INTEGER NOT NULL DEFAULT 0,
                uploaded INTEGER NOT NULL DEFAULT 0,
                youtube_liked INTEGER NOT NULL DEFAULT 0,
                album_id TEXT,
                duration INTEGER NOT NULL DEFAULT 0,
                is_local INTEGER NOT NULL DEFAULT 0,
                local_path TEXT,
                date_modified INTEGER
             );
INSERT INTO "songs" VALUES('s1','Blinding Lights','The Weeknd','https://i.ytimg.com/vi/s1/hq.jpg',NULL,NULL,'v1',NULL,'song',1700000000000,0,NULL,1,NULL,1,0,0,1,NULL,200,0,NULL,NULL);
INSERT INTO "songs" VALUES('s2','Downloaded Song','Artist B',NULL,NULL,NULL,'v2',NULL,'song',1700000000000,0,NULL,0,NULL,1,0,0,0,NULL,180,0,NULL,NULL);
INSERT INTO "songs" VALUES('s3','Local Track','Me',NULL,NULL,NULL,NULL,NULL,'song',1700000000000,0,NULL,0,NULL,1,0,0,0,NULL,90,1,'C:\Music\local.mp3',NULL);
CREATE TABLE speed_dial (
                id TEXT PRIMARY KEY,
                secondary_id TEXT,
                title TEXT NOT NULL,
                subtitle TEXT,
                thumbnail TEXT,
                item_type TEXT NOT NULL,
                explicit INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
             );
CREATE TABLE spotify_match (
                spotify_id TEXT PRIMARY KEY,
                youtube_id TEXT NOT NULL,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                match_score REAL NOT NULL,
                cached_at INTEGER NOT NULL,
                is_manual_override INTEGER NOT NULL DEFAULT 0
             );
CREATE UNIQUE INDEX idx_search_history_query ON search_history(query);
CREATE INDEX idx_spotify_match_youtube_id ON spotify_match(youtube_id);
DELETE FROM "sqlite_sequence";
INSERT INTO "sqlite_sequence" VALUES('history',1);
COMMIT;
