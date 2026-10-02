use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use hmac::{Hmac, Mac as HmacMac};
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::tag::ItemKey;
use regex::Regex;
use reqwest::header::RANGE;
use reqwest::Client;
use rfd::FileDialog;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::webview::{PageLoadEvent, WebviewWindowBuilder};
use tauri::{Emitter, Manager, Url, WebviewUrl};
use tokio::time::timeout;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

const API_BASE: &str = "https://music.youtube.com/youtubei/v1/";
const ORIGIN: &str = "https://music.youtube.com";
const REFERER: &str = "https://music.youtube.com/";
const WEB_REMIX_NAME: &str = "WEB_REMIX";
const WEB_REMIX_VERSION: &str = "1.20260213.01.00";
const WEB_REMIX_ID: &str = "67";
const YOUTUBE_API_KEY: &str = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX3";
const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";
const VISITOR_PREFIX: &str = "Cg";

mod download_resume;
mod ipc;
pub(crate) use ipc::error::{IpcError, IpcResult};
mod player_cache;
mod resolver;
mod secrets;
mod updates;
mod ytjs;
#[allow(unused_imports)]
use ipc::{
    account::*, backup::*, catalog::*, downloads::*, library::*, lyrics::*, player::*, settings::*,
    spotify::*,
};

/// Full database schema. A const (rather than an inline literal) so tests can create a real database.
const SCHEMA_SQL: &str = "PRAGMA foreign_keys = ON;
             CREATE TABLE IF NOT EXISTS songs (
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
             CREATE TABLE IF NOT EXISTS playlists (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                subtitle TEXT NOT NULL DEFAULT '',
                thumbnail TEXT,
                kind TEXT NOT NULL,
                saved_at INTEGER NOT NULL,
                source TEXT NOT NULL DEFAULT 'local'
             );
             CREATE TABLE IF NOT EXISTS playlist_songs (
                playlist_id TEXT NOT NULL,
                position INTEGER NOT NULL,
                song_id TEXT NOT NULL,
                PRIMARY KEY (playlist_id, position),
                FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
                FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
             );
             CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                song_id TEXT NOT NULL,
                played_at INTEGER NOT NULL,
                play_time_ms INTEGER NOT NULL DEFAULT 0
             );
             CREATE TABLE IF NOT EXISTS search_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query TEXT NOT NULL,
                searched_at INTEGER NOT NULL
             );
             CREATE UNIQUE INDEX IF NOT EXISTS idx_search_history_query ON search_history(query);
             CREATE TABLE IF NOT EXISTS lyrics (
                song_id TEXT PRIMARY KEY,
                provider TEXT NOT NULL,
                text TEXT NOT NULL,
                synced INTEGER NOT NULL DEFAULT 0,
                fetched_at INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS lyrics_variants (
                song_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                text TEXT NOT NULL,
                synced INTEGER NOT NULL DEFAULT 0,
                matched_title TEXT NOT NULL DEFAULT '',
                matched_artist TEXT NOT NULL DEFAULT '',
                fetched_at INTEGER NOT NULL,
                PRIMARY KEY (song_id, provider)
             );
             CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS spotify_match (
                spotify_id TEXT PRIMARY KEY,
                youtube_id TEXT NOT NULL,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                match_score REAL NOT NULL,
                cached_at INTEGER NOT NULL,
                is_manual_override INTEGER NOT NULL DEFAULT 0
             );
             CREATE INDEX IF NOT EXISTS idx_spotify_match_youtube_id ON spotify_match(youtube_id);
                          CREATE TABLE IF NOT EXISTS downloads (
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
              CREATE TABLE IF NOT EXISTS player_cache (
                 song_id TEXT PRIMARY KEY,
                 path TEXT NOT NULL,
                 bytes INTEGER NOT NULL DEFAULT 0,
                 cached_at INTEGER NOT NULL,
                 quality TEXT NOT NULL DEFAULT 'auto'
              );
              CREATE TABLE IF NOT EXISTS podcasts (
                 id TEXT PRIMARY KEY,
                 title TEXT NOT NULL,
                 author TEXT,
                 thumbnail TEXT,
                 bookmarked_at INTEGER,
                 saved_at INTEGER NOT NULL
              );

             CREATE TABLE IF NOT EXISTS speed_dial (
                id TEXT PRIMARY KEY,
                secondary_id TEXT,
                title TEXT NOT NULL,
                subtitle TEXT,
                thumbnail TEXT,
                item_type TEXT NOT NULL,
                explicit INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS albums (
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
             CREATE TABLE IF NOT EXISTS artists (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                thumbnail TEXT,
                channel_id TEXT,
                bookmarked_at INTEGER,
                podcast_channel INTEGER NOT NULL DEFAULT 0,
                spotify_id TEXT,
                saved_at INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS song_albums (
                song_id TEXT NOT NULL,
                album_id TEXT NOT NULL,
                PRIMARY KEY (song_id, album_id),
                FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
                FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
             );
             CREATE TABLE IF NOT EXISTS song_artists (
                song_id TEXT NOT NULL,
                artist_id TEXT NOT NULL,
                position INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (song_id, artist_id),
                FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
                FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
             );";

static HTTP: OnceLock<Client> = OnceLock::new();
static MUSIXMATCH_TOKEN: OnceLock<Mutex<Option<String>>> = OnceLock::new();
static DOWNLOAD_CANCELS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
static PLAYER_CACHE_JOBS: OnceLock<Mutex<player_cache::CacheJobs>> = OnceLock::new();
static PLAYER_CACHE_BLOCKED: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn build_http_client(connect: Duration, request: Duration) -> Client {
    Client::builder()
        .user_agent(USER_AGENT)
        .gzip(true)
        .brotli(true)
        .deflate(true)
        // Without these, a request to a server that never responds (or a truly unreachable host) hangs
        // forever - nothing in this file previously set any timeout at all, client-wide or per-request.
        // connect_timeout alone would not be enough: it only covers establishing the connection, not a
        // server that connects fine but then never sends a response. The download's own GET overrides
        // this default (see download_start) since a large file can legitimately take far longer than 20s.
        .connect_timeout(connect)
        .timeout(request)
        .build()
        .expect("HTTP client must build")
}

/// Establishing a connection (TR-H5).
const HTTP_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
/// Whole request for normal API calls (TR-H5).
const HTTP_REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
/// Whole transfer for downloads and the player cache, which can legitimately take long on slow links.
const TRANSFER_TIMEOUT: Duration = Duration::from_secs(3600);
/// A transfer that receives no bytes for this long is treated as stalled (TR-H5).
const STALL_TIMEOUT: Duration = Duration::from_secs(30);
/// Cap for the resolver's small range probe of a freshly resolved stream URL.
const STREAM_PROBE_TIMEOUT: Duration = Duration::from_secs(8);
/// Media-server requests a download may make: the first plus re-resolves after a refused URL.
const MAX_STREAM_REQUESTS: u8 = 3;

fn http() -> &'static Client {
    HTTP.get_or_init(|| build_http_client(HTTP_CONNECT_TIMEOUT, HTTP_REQUEST_TIMEOUT))
}

struct RuntimeState {
    visitor_data: Mutex<Option<String>>,
    db: Mutex<Connection>,
}

#[derive(Debug, Clone)]
struct AuthSession {
    cookie: String,
    data_sync_id: String,
    visitor_data: String,
    account_name: Option<String>,
    account_email: Option<String>,
    account_channel_handle: Option<String>,
    account_avatar: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SessionStatus {
    authenticated: bool,
    account_name: Option<String>,
    account_email: Option<String>,
    account_channel_handle: Option<String>,
    account_avatar: Option<String>,
}

/// Creates or upgrades the schema of an existing database (any released version from v0.1.0 to v0.1.8), recovers
/// interrupted downloads, and seals plaintext session secrets. Separate from `RuntimeState::new` so upgrade tests can
/// run it against a real older database file with an in-memory key store.
fn initialize_database(db: &Connection, store: &dyn secrets::KeyStore) -> rusqlite::Result<()> {
    db.execute_batch(SCHEMA_SQL)?;
    let _ = db.execute("ALTER TABLE songs ADD COLUMN set_video_id TEXT", []);
    let _ = db.execute(
        "ALTER TABLE songs ADD COLUMN explicit INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = db.execute("ALTER TABLE songs ADD COLUMN music_video_type TEXT", []);
    let _ = db.execute(
        "ALTER TABLE songs ADD COLUMN liked INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = db.execute("ALTER TABLE songs ADD COLUMN liked_date INTEGER", []);
    let _ = db.execute(
        "ALTER TABLE songs ADD COLUMN in_library INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = db.execute(
        "ALTER TABLE songs ADD COLUMN is_video INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = db.execute(
        "ALTER TABLE songs ADD COLUMN uploaded INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = db.execute(
        "ALTER TABLE songs ADD COLUMN youtube_liked INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = db.execute("ALTER TABLE songs ADD COLUMN album_id TEXT", []);
    let _ = db.execute(
        "ALTER TABLE songs ADD COLUMN duration INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = db.execute(
        "ALTER TABLE songs ADD COLUMN is_local INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = db.execute("ALTER TABLE songs ADD COLUMN local_path TEXT", []);
    let _ = db.execute("ALTER TABLE songs ADD COLUMN date_modified INTEGER", []);
    let _ = db.execute("ALTER TABLE downloads ADD COLUMN total_bytes INTEGER", []);
    let _ = db.execute(
        "ALTER TABLE downloads ADD COLUMN state TEXT NOT NULL DEFAULT 'completed'",
        [],
    );
    let _ = db.execute("ALTER TABLE downloads ADD COLUMN error TEXT", []);
    let _ = db.execute(
        "ALTER TABLE downloads ADD COLUMN lyrics_cached INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = db.execute("ALTER TABLE downloads ADD COLUMN artwork_path TEXT", []);
    let _ = db.execute(
        "ALTER TABLE albums ADD COLUMN liked INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = db.execute(
        "ALTER TABLE playlists ADD COLUMN source TEXT NOT NULL DEFAULT 'local'",
        [],
    );
    let _ = db.execute("ALTER TABLE podcasts ADD COLUMN detail_json TEXT", []);
    let _ = db.execute(
        "ALTER TABLE history ADD COLUMN play_time_ms INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = db.execute(
        "ALTER TABLE player_cache ADD COLUMN quality TEXT NOT NULL DEFAULT 'auto'",
        [],
    );
    // A download cannot survive a restart; rows still marked "downloading" are leftovers of a crash or forced quit.
    // Mark them cancelled (not failed) so the retained `.part` file stays resumable (v0.1.8 resume, see DECISIONS D-002).
    let _ = db.execute("UPDATE downloads SET state = 'cancelled', error = 'download interrupted; retry to resume' WHERE state = 'downloading'", []);
    // Encrypt any session secret still stored as plaintext by an older version. Failure keeps the session working.
    let _ = secrets::migrate_with(db, store);
    Ok(())
}

impl RuntimeState {
    /// A startup failure here previously panicked via .expect(). With windows_subsystem = "windows" (no
    /// console window), that panic message is never seen by anyone - the app just silently vanishes from the
    /// taskbar with no explanation. Show a real, native error dialog (works even before any Tauri window
    /// exists) and exit cleanly instead.
    fn fail_to_start(context: &str, error: impl std::fmt::Display) -> ! {
        let description =
            format!("{context}:\n\n{error}\n\nMeld Desktop cannot continue and will now close.");
        rfd::MessageDialog::new()
            .set_level(rfd::MessageLevel::Error)
            .set_title("Meld Desktop failed to start")
            .set_description(&description)
            .set_buttons(rfd::MessageButtons::Ok)
            .show();
        std::process::exit(1);
    }

    fn new() -> Self {
        let path = database_path();
        if let Some(parent) = path.parent() {
            if let Err(error) = fs::create_dir_all(parent) {
                Self::fail_to_start("Could not create the app data folder", error);
            }
        }
        let db = match Connection::open(&path) {
            Ok(db) => db,
            Err(error) => Self::fail_to_start(
                &format!("Could not open the database at {}", path.display()),
                error,
            ),
        };
        if let Err(error) = initialize_database(&db, &secrets::KeyringStore) {
            Self::fail_to_start("Could not initialize the database schema", error);
        }
        Self {
            visitor_data: Mutex::new(None),
            db: Mutex::new(db),
        }
    }
}

fn database_path() -> PathBuf {
    let root = if cfg!(windows) {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."))
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                std::env::var_os("HOME")
                    .map(|home| PathBuf::from(home).join(".local/share"))
                    .unwrap_or_else(|| PathBuf::from("."))
            })
    };
    root.join("Meld Desktop").join("meld.sqlite3")
}

fn now_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}
fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Artist {
    name: String,
    id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct YtItem {
    id: String,
    kind: String,
    title: String,
    subtitle: String,
    thumbnail: Option<String>,
    artists: Vec<Artist>,
    browse_id: Option<String>,
    playlist_id: Option<String>,
    video_id: Option<String>,
    set_video_id: Option<String>,
    play_playlist_id: Option<String>,
    play_video_id: Option<String>,
    params: Option<String>,
    explicit: bool,
    music_video_type: Option<String>,
    history_remove_token: Option<String>,
    album_id: Option<String>,
    album_title: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LibraryPlaylistItem {
    #[serde(flatten)]
    item: YtItem,
    song_count: i64,
    saved_at: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StatsRow {
    item: YtItem,
    plays: i64,
    minutes: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StatsGroup {
    id: String,
    title: String,
    subtitle: String,
    thumbnail: Option<String>,
    plays: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StatsPayload {
    period: String,
    total_plays: i64,
    total_minutes: i64,
    unique_songs: i64,
    rows: Vec<StatsRow>,
    artists: Vec<StatsGroup>,
    albums: Vec<StatsGroup>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LocalItem {
    id: String,
    kind: String,
    title: String,
    subtitle: String,
    thumbnail: Option<String>,
    artists: Vec<Artist>,
    browse_id: Option<String>,
    playlist_id: Option<String>,
    video_id: Option<String>,
    set_video_id: Option<String>,
    play_playlist_id: Option<String>,
    play_video_id: Option<String>,
    params: Option<String>,
    explicit: bool,
    music_video_type: Option<String>,
    history_remove_token: Option<String>,
    album_id: Option<String>,
    album_title: Option<String>,
    local_path: String,
    duration: i64,
}

fn stable_local_id(path: &Path) -> String {
    let canonical = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let digest = Sha1::digest(canonical.to_string_lossy().as_bytes());
    format!("local:{digest:x}")
}

/// (title, artist, album, duration seconds, embedded artwork bytes, artwork extension)
type LocalMetadata = (
    String,
    String,
    Option<String>,
    i64,
    Option<Vec<u8>>,
    &'static str,
);

fn local_metadata(path: &Path) -> Option<LocalMetadata> {
    let tagged_file = lofty::read_from_path(path).ok()?;
    let tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag());
    let fallback_title = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Untitled")
        .trim()
        .to_owned();
    let title = tag
        .and_then(|value| value.get_string(&ItemKey::TrackTitle))
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(&fallback_title)
        .trim()
        .to_owned();
    let artist = tag
        .and_then(|value| value.get_string(&ItemKey::TrackArtist))
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("Unknown artist")
        .trim()
        .to_owned();
    let album = tag
        .and_then(|value| value.get_string(&ItemKey::AlbumTitle))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned);
    let duration = tagged_file.properties().duration().as_secs() as i64;
    let picture = tag
        .and_then(|value| value.pictures().first())
        .map(|picture| {
            let extension = match picture.mime_type() {
                Some(lofty::picture::MimeType::Png) => "png",
                Some(lofty::picture::MimeType::Jpeg) => "jpg",
                Some(lofty::picture::MimeType::Gif) => "gif",
                Some(lofty::picture::MimeType::Bmp) => "bmp",
                Some(lofty::picture::MimeType::Tiff) => "tiff",
                _ => "jpg",
            };
            (picture.data().to_vec(), extension)
        });
    let (artwork, extension) =
        picture.map_or((None, "jpg"), |(data, extension)| (Some(data), extension));
    Some((title, artist, album, duration, artwork, extension))
}

fn local_item_from_path(path: &Path, artwork_dir: &Path) -> Option<LocalItem> {
    let (title, artist, album, duration, artwork, extension) = local_metadata(path)?;
    let id = stable_local_id(path);
    let thumbnail = artwork.and_then(|data| {
        fs::create_dir_all(artwork_dir).ok()?;
        let artwork_path = artwork_dir
            .join(format!("{}.{}", id.replace(':', "_"), extension))
            .to_string_lossy()
            .to_string();
        if !Path::new(&artwork_path).exists() {
            fs::write(&artwork_path, data).ok()?;
        }
        Some(artwork_path)
    });
    let subtitle = match album.as_deref() {
        Some(album) => format!("{artist} · {album}"),
        None => artist.clone(),
    };
    let artist_id = format!(
        "local-artist:{}",
        Sha1::digest(artist.as_bytes())
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>()
    );
    Some(LocalItem {
        id,
        kind: "song".to_owned(),
        title,
        subtitle,
        thumbnail,
        artists: vec![Artist {
            name: artist,
            id: Some(artist_id),
        }],
        browse_id: None,
        playlist_id: None,
        video_id: None,
        set_video_id: None,
        play_playlist_id: None,
        play_video_id: None,
        params: None,
        explicit: false,
        music_video_type: None,
        history_remove_token: None,
        album_id: None,
        album_title: album,
        local_path: path.to_string_lossy().to_string(),
        duration,
    })
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HomeSection {
    title: String,
    label: Option<String>,
    thumbnail: Option<String>,
    browse_id: Option<String>,
    params: Option<String>,
    browse_kind: Option<String>,
    items: Vec<YtItem>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HomePage {
    sections: Vec<HomeSection>,
    continuation: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SearchPage {
    items: Vec<YtItem>,
    continuation: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlaylistPage {
    playlist: YtItem,
    songs: Vec<YtItem>,
    continuation: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlaylistContinuationPage {
    songs: Vec<YtItem>,
    continuation: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DetailPage {
    kind: String,
    title: String,
    subtitle: String,
    thumbnail: Option<String>,
    items: Vec<YtItem>,
    continuation: Option<String>,
    browse_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlayerPayload {
    video_id: String,
    title: Option<String>,
    artist: Option<String>,
    stream_url: String,
    mime_type: String,
    bitrate: i64,
    expires_in_seconds: i64,
    duration: i64,
    /// Resolver client that produced the stream (diagnostics only; never contains secrets).
    source_client: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SettingEntry {
    key: String,
    value: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct QueuePage {
    title: Option<String>,
    items: Vec<YtItem>,
    current_index: Option<usize>,
    continuation: Option<String>,
    related_browse_id: Option<String>,
    related_params: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RemoteHistorySection {
    title: String,
    songs: Vec<YtItem>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RemoteHistoryPage {
    sections: Vec<RemoteHistorySection>,
}

fn text(value: Option<&Value>) -> String {
    value
        .and_then(|v| {
            v.get("runs")
                .and_then(Value::as_array)
                .map(|runs| {
                    runs.iter()
                        .filter_map(|run| run.get("text").and_then(Value::as_str))
                        .collect::<String>()
                })
                .or_else(|| {
                    v.get("simpleText")
                        .and_then(Value::as_str)
                        .map(str::to_owned)
                })
        })
        .unwrap_or_default()
}

fn thumbnail(value: Option<&Value>) -> Option<String> {
    let items = value?.get("thumbnails").and_then(Value::as_array)?;
    items
        .last()
        .and_then(|item| item.get("url"))
        .and_then(Value::as_str)
        .map(str::to_owned)
}

fn browse_endpoint(value: Option<&Value>) -> (Option<String>, Option<String>) {
    let endpoint = value.and_then(|v| v.get("browseEndpoint"));
    (
        endpoint
            .and_then(|v| v.get("browseId"))
            .and_then(Value::as_str)
            .map(str::to_owned),
        endpoint
            .and_then(|v| v.get("params"))
            .and_then(Value::as_str)
            .map(str::to_owned),
    )
}

fn browse_kind(value: Option<&Value>, browse_id: Option<&str>) -> Option<String> {
    let page_type = value
        .and_then(|v| v.get("browseEndpoint"))
        .and_then(|v| v.get("browseEndpointContextSupportedConfigs"))
        .and_then(|v| v.get("browseEndpointContextMusicConfig"))
        .and_then(|v| v.get("pageType"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let kind = if page_type.contains("ALBUM") {
        "album"
    } else if page_type.contains("PLAYLIST") || browse_id.is_some_and(|id| id.starts_with("VL")) {
        "playlist"
    } else if page_type.contains("ARTIST")
        || page_type.contains("USER_CHANNEL")
        || browse_id.is_some_and(|id| id.starts_with("UC"))
    {
        "artist"
    } else if page_type.contains("PODCAST") {
        "podcast"
    } else if browse_id.is_some() {
        "browse"
    } else {
        return None;
    };
    Some(kind.to_owned())
}

fn watch_endpoint(value: Option<&Value>) -> (Option<String>, Option<String>) {
    let endpoint = value.and_then(|v| v.get("watchEndpoint"));
    (
        endpoint
            .and_then(|v| v.get("videoId"))
            .and_then(Value::as_str)
            .map(str::to_owned),
        endpoint
            .and_then(|v| v.get("playlistId"))
            .and_then(Value::as_str)
            .map(str::to_owned),
    )
}

fn music_video_type(value: Option<&Value>) -> Option<String> {
    value
        .and_then(|v| v.get("watchEndpoint"))
        .and_then(|v| v.get("watchEndpointMusicSupportedConfigs"))
        .and_then(|v| v.get("watchEndpointMusicConfig"))
        .and_then(|v| v.get("musicVideoType"))
        .and_then(Value::as_str)
        .map(str::to_owned)
}

fn explicit_badge(renderer: &Value) -> bool {
    ["badges", "subtitleBadges"].iter().any(|key| {
        renderer
            .get(*key)
            .and_then(Value::as_array)
            .map(|badges| {
                badges.iter().any(|badge| {
                    badge
                        .get("musicInlineBadgeRenderer")
                        .and_then(|v| v.get("icon"))
                        .and_then(|v| v.get("iconType"))
                        .and_then(Value::as_str)
                        == Some("MUSIC_EXPLICIT_BADGE")
                })
            })
            .unwrap_or(false)
    })
}

fn parse_artists(subtitle: Option<&Value>) -> Vec<Artist> {
    // YouTube subtitles interleave artists with separators (" • ", " & "), a type label ("Song"), an album link and
    // a duration. Only runs that link to an artist/channel page are artists; when none do (uploads, plain-text
    // credits) fall back to the text runs that are not separators or durations.
    let runs = subtitle
        .and_then(|v| v.get("runs"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten();
    let mut linked = Vec::new();
    let mut plain = Vec::new();
    for run in runs {
        let Some(name) = run
            .get("text")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        let endpoint = run.get("navigationEndpoint");
        let (id, _) = browse_endpoint(endpoint);
        let page_type = endpoint
            .and_then(|v| v.get("browseEndpoint"))
            .and_then(|v| v.get("browseEndpointContextSupportedConfigs"))
            .and_then(|v| v.get("browseEndpointContextMusicConfig"))
            .and_then(|v| v.get("pageType"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let is_artist = page_type.contains("ARTIST")
            || page_type.contains("USER_CHANNEL")
            || id.as_deref().is_some_and(|value| value.starts_with("UC"));
        if is_artist {
            linked.push(Artist {
                name: name.to_owned(),
                id,
            });
            continue;
        }
        let is_separator = name.chars().all(|c| !c.is_alphanumeric())
            || matches!(
                name.to_lowercase().as_str(),
                "and" | "x" | "feat" | "feat." | "ft" | "ft." | "with"
            );
        let is_duration = name.chars().all(|c| c.is_ascii_digit() || c == ':');
        if id.is_none() && !is_separator && !is_duration {
            plain.push(Artist {
                name: name.to_owned(),
                id: None,
            });
        }
    }
    if linked.is_empty() {
        plain
    } else {
        linked
    }
}

fn parse_two_row(renderer: &Value) -> Option<YtItem> {
    let title = text(renderer.get("title"));
    if title.is_empty() {
        return None;
    }
    let (browse_id, browse_params) = browse_endpoint(renderer.get("navigationEndpoint"));
    let (video_id, playlist_id) = watch_endpoint(renderer.get("navigationEndpoint"));
    let thumbnail = thumbnail(
        renderer
            .get("thumbnailRenderer")
            .and_then(|v| v.get("musicThumbnailRenderer"))
            .and_then(|v| v.get("thumbnail")),
    );
    let subtitle = text(renderer.get("subtitle"));
    let artists = parse_artists(renderer.get("subtitle"));
    let overlay = renderer
        .get("thumbnailOverlay")
        .and_then(|v| v.get("musicItemThumbnailOverlayRenderer"))
        .and_then(|v| v.get("content"))
        .and_then(|v| v.get("musicPlayButtonRenderer"))
        .and_then(|v| v.get("playNavigationEndpoint"));
    let (overlay_video, overlay_playlist) = watch_endpoint(overlay);
    let is_song = renderer
        .get("navigationEndpoint")
        .and_then(|v| v.get("watchEndpoint"))
        .is_some();
    let page_type = renderer
        .get("navigationEndpoint")
        .and_then(|v| v.get("browseEndpoint"))
        .and_then(|v| v.get("browseEndpointContextSupportedConfigs"))
        .and_then(|v| v.get("browseEndpointContextMusicConfig"))
        .and_then(|v| v.get("pageType"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let kind = if is_song {
        "song"
    } else if page_type.contains("ALBUM") {
        "album"
    } else if page_type.contains("PLAYLIST") || browse_id.as_deref().unwrap_or("").starts_with("VL")
    {
        "playlist"
    } else if page_type.contains("ARTIST") || browse_id.as_deref().unwrap_or("").starts_with("UC") {
        "artist"
    } else if page_type.contains("PODCAST") {
        "podcast"
    } else {
        return None;
    };
    let id = video_id
        .clone()
        .or_else(|| browse_id.clone())
        .or_else(|| overlay_video.clone())?;
    Some(YtItem {
        id,
        kind: kind.to_owned(),
        title,
        subtitle,
        thumbnail,
        artists,
        browse_id: browse_id.map(|id| id.trim_start_matches("VL").to_owned()),
        playlist_id: playlist_id.clone(),
        video_id: video_id.or(overlay_video.clone()),
        set_video_id: None,
        play_playlist_id: overlay_playlist.or(playlist_id.clone()),
        play_video_id: overlay_video,
        params: browse_params,
        explicit: explicit_badge(renderer),
        music_video_type: music_video_type(renderer.get("navigationEndpoint")).or_else(|| {
            renderer
                .get("musicVideoType")
                .and_then(Value::as_str)
                .map(str::to_owned)
        }),
        history_remove_token: None,
        album_id: None,
        album_title: None,
    })
}

fn parse_responsive_song(renderer: &Value) -> Option<YtItem> {
    let data = renderer.get("playlistItemData")?;
    let video_id = data.get("videoId").and_then(Value::as_str)?.to_owned();
    let columns = renderer.get("flexColumns").and_then(Value::as_array)?;
    let title = text(
        columns
            .first()?
            .get("musicResponsiveListItemFlexColumnRenderer")?
            .get("text"),
    );
    if title.is_empty() {
        return None;
    }
    let subtitle_value = columns
        .get(1)
        .and_then(|v| v.get("musicResponsiveListItemFlexColumnRenderer"))
        .and_then(|v| v.get("text"));
    let subtitle = text(subtitle_value);
    let artists = parse_artists(subtitle_value);
    let album_value = columns
        .get(3)
        .and_then(|value| value.get("musicResponsiveListItemFlexColumnRenderer"))
        .and_then(|value| value.get("text"));
    let album_title = text(album_value).trim().to_owned();
    let album_id = album_value
        .and_then(|value| value.get("runs"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find_map(|run| {
            run.get("navigationEndpoint")
                .and_then(|endpoint| endpoint.get("browseEndpoint"))
                .and_then(|endpoint| endpoint.get("browseId"))
                .and_then(Value::as_str)
                .map(str::to_owned)
        });
    let (video_endpoint, playlist_endpoint) = watch_endpoint(renderer.get("navigationEndpoint"));
    let image = thumbnail(
        renderer
            .get("thumbnail")
            .and_then(|v| v.get("musicThumbnailRenderer"))
            .and_then(|v| v.get("thumbnail")),
    );
    Some(YtItem {
        id: video_id.clone(),
        kind: "song".to_owned(),
        title,
        subtitle,
        thumbnail: image,
        artists,
        browse_id: None,
        playlist_id: playlist_endpoint.clone(),
        video_id: Some(video_id.clone()),
        set_video_id: data
            .get("playlistSetVideoId")
            .and_then(Value::as_str)
            .map(str::to_owned),
        play_playlist_id: playlist_endpoint,
        play_video_id: video_endpoint.or(Some(video_id)),
        params: None,
        explicit: explicit_badge(renderer),
        music_video_type: music_video_type(renderer.get("navigationEndpoint")).or_else(|| {
            renderer
                .get("musicVideoType")
                .and_then(Value::as_str)
                .map(str::to_owned)
        }),
        history_remove_token: renderer
            .get("menu")
            .and_then(|value| value.get("menuRenderer"))
            .and_then(|value| value.get("items"))
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .find(|item| {
                item.get("menuServiceItemRenderer")
                    .and_then(|value| value.get("icon"))
                    .and_then(|value| value.get("iconType"))
                    .and_then(Value::as_str)
                    == Some("REMOVE_FROM_HISTORY")
            })
            .and_then(|item| item.get("menuServiceItemRenderer"))
            .and_then(|value| value.get("serviceEndpoint"))
            .and_then(|value| value.get("feedbackEndpoint"))
            .and_then(|value| value.get("feedbackToken"))
            .and_then(Value::as_str)
            .map(str::to_owned),
        album_id: album_id.filter(|value| !value.is_empty()),
        album_title: (!album_title.is_empty()).then_some(album_title),
    })
}

fn context(visitor_data: &str, include_login: bool, data_sync_id: Option<&str>) -> Value {
    json!({
        "client": {
            "clientName": WEB_REMIX_NAME,
            "clientVersion": WEB_REMIX_VERSION,
            "hl": "en",
            "gl": "US",
            "visitorData": visitor_data
        },
        "request": {
            "internalExperimentFlags": [],
            "useSsl": true
        },
        "user": if include_login { if let Some(data_sync_id) = data_sync_id { json!({ "lockedSafetyMode": false, "onBehalfOfUser": data_sync_id }) } else { json!({ "lockedSafetyMode": false }) } } else { json!({ "lockedSafetyMode": false }) }
    })
}

fn setting_value(db: &Connection, key: &str) -> Result<Option<String>, String> {
    db.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|e| format!("session setting read failed: {e}"))
}

fn auth_session(state: &tauri::State<'_, RuntimeState>) -> Result<Option<AuthSession>, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    let cookie = secrets::get(&db, "cookie").ok().flatten();
    let data_sync_id = setting_value(&db, "dataSyncId")?;
    let visitor_data = setting_value(&db, "visitorData")?;
    Ok(match (cookie, data_sync_id, visitor_data) {
        (Some(cookie), Some(data_sync_id), Some(visitor_data))
            if !cookie.trim().is_empty()
                && !data_sync_id.trim().is_empty()
                && visitor_data.starts_with(VISITOR_PREFIX) =>
        {
            Some(AuthSession {
                cookie,
                data_sync_id,
                visitor_data,
                account_name: setting_value(&db, "accountName")?,
                account_email: setting_value(&db, "accountEmail")?,
                account_channel_handle: setting_value(&db, "accountChannelHandle")?,
                account_avatar: setting_value(&db, "accountAvatar")?,
            })
        }
        _ => None,
    })
}

fn browse_session(
    state: &tauri::State<'_, RuntimeState>,
    session: Option<AuthSession>,
) -> Result<Option<AuthSession>, String> {
    let use_login = {
        let db = state
            .db
            .lock()
            .map_err(|_| "database state poisoned".to_owned())?;
        setting_value(&db, "useLoginForBrowse")?.as_deref() != Some("false")
    };
    Ok(if use_login { session } else { None })
}

fn sapisid_hash(cookie: &str) -> Option<String> {
    let sapisid = cookie
        .split(';')
        .filter_map(|part| part.trim().split_once('='))
        .find(|(key, _)| *key == "SAPISID")
        .map(|(_, value)| value.trim())
        .filter(|value| !value.is_empty())?;
    let timestamp = now_seconds();
    let mut hasher = Sha1::new();
    hasher.update(format!("{timestamp} {sapisid} {ORIGIN}"));
    let digest = hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    Some(format!("SAPISIDHASH {timestamp}_{digest}"))
}

async fn fetch_visitor_data() -> Result<String, String> {
    let raw = http()
        .get("https://music.youtube.com/sw.js_data")
        .send()
        .await
        .map_err(|e| format!("visitorData request failed: {e}"))?
        .text()
        .await
        .map_err(|e| format!("visitorData body failed: {e}"))?;
    let body = raw
        .get(5..)
        .ok_or_else(|| "visitorData response prefix missing".to_owned())?;
    let root: Value =
        serde_json::from_str(body).map_err(|e| format!("visitorData JSON failed: {e}"))?;
    let candidates = root
        .get(0)
        .and_then(|v| v.get(2))
        .and_then(Value::as_array)
        .ok_or_else(|| "visitorData candidate array missing".to_owned())?;
    candidates
        .iter()
        .filter_map(Value::as_str)
        .find(|candidate| candidate.starts_with(VISITOR_PREFIX))
        .map(str::to_owned)
        .ok_or_else(|| "visitorData candidate not found".to_owned())
}

async fn visitor(state: &tauri::State<'_, RuntimeState>) -> Result<String, String> {
    if let Some(value) = state
        .visitor_data
        .lock()
        .map_err(|_| "visitor state poisoned")?
        .clone()
    {
        return Ok(value);
    }
    let persisted = {
        let db = state.db.lock().map_err(|_| "database state poisoned")?;
        db.query_row(
            "SELECT value FROM settings WHERE key = 'visitorData'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| format!("visitorData storage read failed: {e}"))?
    };
    if let Some(value) = persisted.filter(|value| value.starts_with(VISITOR_PREFIX)) {
        *state
            .visitor_data
            .lock()
            .map_err(|_| "visitor state poisoned")? = Some(value.clone());
        return Ok(value);
    }
    let value = fetch_visitor_data().await?;
    {
        let db = state.db.lock().map_err(|_| "database state poisoned")?;
        db.execute("INSERT INTO settings (key, value) VALUES ('visitorData', ?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![value]).map_err(|e| format!("visitorData storage write failed: {e}"))?;
    }
    *state
        .visitor_data
        .lock()
        .map_err(|_| "visitor state poisoned")? = Some(value.clone());
    Ok(value)
}

async fn post_with_query(
    endpoint: &str,
    body: Value,
    session: Option<&AuthSession>,
    extra_query: &[(&str, &str)],
) -> Result<Value, String> {
    let visitor_header = session
        .map(|value| value.visitor_data.as_str())
        .or_else(|| {
            body.pointer("/context/client/visitorData")
                .and_then(Value::as_str)
        });
    let mut request = http()
        .post(format!("{API_BASE}{endpoint}"))
        .header("X-Goog-Api-Format-Version", "1")
        .header("X-YouTube-Client-Name", WEB_REMIX_ID)
        .header("X-YouTube-Client-Version", WEB_REMIX_VERSION)
        .header("X-Origin", ORIGIN)
        .header("Referer", REFERER)
        .header("Accept-Language", "en-US,en;q=0.9")
        .query(&[("prettyPrint", "false")])
        .query(extra_query)
        .json(&body);
    if let Some(visitor_data) = visitor_header {
        request = request.header("X-Goog-Visitor-Id", visitor_data);
    }
    if let Some(session) = session {
        request = request.header("Cookie", &session.cookie);
        if let Some(authorization) = sapisid_hash(&session.cookie) {
            request = request.header("Authorization", authorization);
        }
    }
    request
        .send()
        .await
        .map_err(|e| format!("YouTube {endpoint} request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("YouTube {endpoint} returned error: {e}"))?
        .json::<Value>()
        .await
        .map_err(|e| format!("YouTube {endpoint} JSON failed: {e}"))
}

async fn post(endpoint: &str, body: Value, session: Option<&AuthSession>) -> Result<Value, String> {
    post_with_query(endpoint, body, session, &[]).await
}

/// Process-wide resolver memory: failed clients per video (PLAY-005) and the last attempts for reports.
fn resolver_memory() -> &'static Mutex<resolver::FailureMemory> {
    static MEMORY: OnceLock<Mutex<resolver::FailureMemory>> = OnceLock::new();
    MEMORY.get_or_init(|| Mutex::new(resolver::FailureMemory::default()))
}

fn client_health() -> &'static Mutex<resolver::ClientHealth> {
    static HEALTH: OnceLock<Mutex<resolver::ClientHealth>> = OnceLock::new();
    HEALTH.get_or_init(|| Mutex::new(resolver::ClientHealth::default()))
}

/// The media server refused a stream from `client`: never use that client for this song again for a
/// while, and try it last for every other song (its URLs are usually refused network-wide).
fn mark_stream_refused(video_id: &str, client: Option<&str>) {
    let Some(key) = client.and_then(|key| {
        resolver::CLIENTS
            .iter()
            .find(|profile| profile.key == key)
            .map(|profile| profile.key)
    }) else {
        return;
    };
    let now = std::time::Instant::now();
    if let Ok(mut memory) = resolver_memory().lock() {
        memory.mark_failed(video_id, key, now);
    }
    if let Ok(mut health) = client_health().lock() {
        health.demote(key, now);
    }
}

/// Reads a small range past the first megabyte of a resolved stream. googlevideo serves the start of
/// some URLs and answers 403 after it, which would break playback mid-song and every download.
async fn probe_stream_access(
    url: &str,
    content_length: Option<u64>,
) -> Result<(), (resolver::Category, String)> {
    let length = content_length.or_else(|| {
        url::Url::parse(url).ok().and_then(|parsed| {
            parsed
                .query_pairs()
                .find(|(key, _)| key == "clen")
                .and_then(|(_, value)| value.parse::<u64>().ok())
        })
    });
    let Some((start, end)) = resolver::stream_probe_range(length) else {
        return Ok(());
    };
    let Ok(response) = http()
        .get(url)
        .header(RANGE, format!("bytes={start}-{end}"))
        .timeout(STREAM_PROBE_TIMEOUT)
        .send()
        .await
    else {
        // A network hiccup is not proof that the URL is bad; the player's own recovery covers it.
        return Ok(());
    };
    let status = response.status().as_u16();
    match resolver::stream_access(status) {
        resolver::StreamAccess::Forbidden => Err((
            resolver::Category::StreamForbidden,
            format!("HTTP {status} for bytes {start}-{end}"),
        )),
        _ => Ok(()),
    }
}

fn resolver_attempts() -> &'static Mutex<HashMap<String, Vec<resolver::Attempt>>> {
    static ATTEMPTS: OnceLock<Mutex<HashMap<String, Vec<resolver::Attempt>>>> = OnceLock::new();
    ATTEMPTS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// YouTube's current player script, preprocessed once per player version by the EJS solver.
struct PlayerJs {
    id: String,
    signature_timestamp: u32,
    preprocessed: std::sync::Arc<String>,
    checked_at: std::time::Instant,
    solutions: HashMap<(bool, String), String>,
}

const PLAYER_JS_RECHECK: Duration = Duration::from_secs(6 * 60 * 60);

fn player_js_state() -> &'static tokio::sync::Mutex<Option<PlayerJs>> {
    static STATE: OnceLock<tokio::sync::Mutex<Option<PlayerJs>>> = OnceLock::new();
    STATE.get_or_init(|| tokio::sync::Mutex::new(None))
}

fn player_js_dir() -> PathBuf {
    database_path()
        .parent()
        .map(|value| value.join("player-js"))
        .unwrap_or_else(|| PathBuf::from("player-js"))
}

/// Reads `{id}.pre.js` + `{id}.sts` written by an earlier run.
fn read_cached_player_js(id: &str) -> Option<(u32, String)> {
    let dir = player_js_dir();
    let sts = fs::read_to_string(dir.join(format!("{id}.sts")))
        .ok()?
        .trim()
        .parse()
        .ok()?;
    let preprocessed = fs::read_to_string(dir.join(format!("{id}.pre.js"))).ok()?;
    (!preprocessed.is_empty()).then_some((sts, preprocessed))
}

fn newest_cached_player_id() -> Option<String> {
    let mut entries: Vec<(SystemTime, String)> = fs::read_dir(player_js_dir())
        .ok()?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            let id = name.strip_suffix(".pre.js")?.to_owned();
            Some((entry.metadata().ok()?.modified().ok()?, id))
        })
        .collect();
    entries.sort();
    entries.pop().map(|(_, id)| id)
}

/// Keep only the two newest player versions on disk.
fn prune_player_js_cache(keep: &str) {
    let Ok(entries) = fs::read_dir(player_js_dir()) else {
        return;
    };
    let mut ids: Vec<(SystemTime, String)> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            let id = name.strip_suffix(".pre.js")?.to_owned();
            Some((entry.metadata().ok()?.modified().ok()?, id))
        })
        .filter(|(_, id)| id != keep)
        .collect();
    ids.sort();
    ids.reverse();
    for (_, id) in ids.into_iter().skip(1) {
        let dir = player_js_dir();
        let _ = fs::remove_file(dir.join(format!("{id}.pre.js")));
        let _ = fs::remove_file(dir.join(format!("{id}.sts")));
    }
}

async fn fetch_text(url: &str) -> Result<String, String> {
    http()
        .get(url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("request rejected: {e}"))?
        .text()
        .await
        .map_err(|e| format!("response failed: {e}"))
}

/// Ensure the current player script is loaded and preprocessed; returns its signature timestamp.
async fn ensure_player_js() -> Result<u32, String> {
    let mut state = player_js_state().lock().await;
    if let Some(current) = state.as_ref() {
        if current.checked_at.elapsed() < PLAYER_JS_RECHECK {
            return Ok(current.signature_timestamp);
        }
    }
    let latest_id = match fetch_text("https://www.youtube.com/iframe_api").await {
        Ok(text) => ytjs::extract_player_id(&text),
        Err(_) => None,
    };
    let Some(id) = latest_id
        .or_else(|| state.as_ref().map(|value| value.id.clone()))
        .or_else(newest_cached_player_id)
    else {
        return Err("YouTube player version could not be determined".to_owned());
    };
    if let Some(current) = state.as_mut().filter(|value| value.id == id) {
        current.checked_at = std::time::Instant::now();
        return Ok(current.signature_timestamp);
    }
    let (sts, preprocessed) = match read_cached_player_js(&id) {
        Some(cached) => cached,
        None => {
            let url =
                ytjs::player_js_url(&id).ok_or_else(|| "invalid YouTube player id".to_owned())?;
            let source = fetch_text(&url)
                .await
                .map_err(|e| format!("YouTube player script {e}"))?;
            let sts = ytjs::extract_signature_timestamp(&source)
                .ok_or_else(|| "YouTube player script has no signature timestamp".to_owned())?;
            let output = tokio::task::spawn_blocking(move || {
                ytjs::solve(
                    ytjs::PlayerSource::Raw(&source),
                    &[],
                    &[],
                    true,
                    ytjs::SOLVE_TIMEOUT,
                )
            })
            .await
            .map_err(|_| "player script preprocessing was interrupted".to_owned())??;
            let preprocessed = output
                .preprocessed
                .ok_or_else(|| "player script preprocessing returned nothing".to_owned())?;
            let dir = player_js_dir();
            if fs::create_dir_all(&dir).is_ok() {
                let _ = fs::write(dir.join(format!("{id}.pre.js")), &preprocessed);
                let _ = fs::write(dir.join(format!("{id}.sts")), sts.to_string());
                prune_player_js_cache(&id);
            }
            (sts, preprocessed)
        }
    };
    *state = Some(PlayerJs {
        id,
        signature_timestamp: sts,
        preprocessed: std::sync::Arc::new(preprocessed),
        checked_at: std::time::Instant::now(),
        solutions: HashMap::new(),
    });
    Ok(sts)
}

/// Solve `n`/signature challenges with the loaded player (cached per challenge).
async fn solve_challenges(
    n: Option<String>,
    sig: Option<String>,
) -> Result<(Option<String>, Option<String>), String> {
    let (preprocessed, mut known_n, mut known_sig) = {
        let state = player_js_state().lock().await;
        let current = state
            .as_ref()
            .ok_or_else(|| "YouTube player script is not loaded".to_owned())?;
        let lookup = |is_n: bool, value: &Option<String>| {
            value
                .as_ref()
                .and_then(|v| current.solutions.get(&(is_n, v.clone())).cloned())
        };
        (
            current.preprocessed.clone(),
            lookup(true, &n),
            lookup(false, &sig),
        )
    };
    let pending_n: Vec<String> = n.iter().filter(|_| known_n.is_none()).cloned().collect();
    let pending_sig: Vec<String> = sig
        .iter()
        .filter(|_| known_sig.is_none())
        .cloned()
        .collect();
    if !pending_n.is_empty() || !pending_sig.is_empty() {
        let (task_n, task_sig) = (pending_n.clone(), pending_sig.clone());
        let output = tokio::task::spawn_blocking(move || {
            ytjs::solve(
                ytjs::PlayerSource::Preprocessed(&preprocessed),
                &task_n,
                &task_sig,
                false,
                ytjs::SOLVE_TIMEOUT,
            )
        })
        .await
        .map_err(|_| "signature solver was interrupted".to_owned())??;
        let mut state = player_js_state().lock().await;
        if let Some(current) = state.as_mut() {
            if current.solutions.len() > 4096 {
                current.solutions.clear();
            }
            for (challenge, answer) in &output.n {
                current
                    .solutions
                    .insert((true, challenge.clone()), answer.clone());
            }
            for (challenge, answer) in &output.sig {
                current
                    .solutions
                    .insert((false, challenge.clone()), answer.clone());
            }
        }
        if let Some(value) = pending_n.first() {
            known_n = output.n.get(value).cloned();
        }
        if let Some(value) = pending_sig.first() {
            known_sig = output.sig.get(value).cloned();
        }
    }
    Ok((known_n, known_sig))
}

fn random_cpn() -> String {
    use aes_gcm::aead::rand_core::RngCore;
    let mut bytes = [0_u8; 16];
    aes_gcm::aead::OsRng.fill_bytes(&mut bytes);
    resolver::generate_cpn(&bytes)
}

fn sapisid_hash_for(cookie: &str, origin: &str) -> Option<String> {
    let sapisid = cookie
        .split(';')
        .filter_map(|part| part.trim().split_once('='))
        .find(|(key, _)| *key == "SAPISID")
        .map(|(_, value)| value.trim())
        .filter(|value| !value.is_empty())?;
    let timestamp = now_seconds();
    let mut hasher = Sha1::new();
    hasher.update(format!("{timestamp} {sapisid} {origin}"));
    let digest = hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    Some(format!("SAPISIDHASH {timestamp}_{digest}"))
}

fn player_request_body(
    video_id: &str,
    playlist_id: Option<&str>,
    visitor_data: &str,
    client: &resolver::ClientProfile,
    signature_timestamp: Option<u32>,
    data_sync_id: Option<&str>,
    cpn: &str,
) -> Value {
    let mut client_context = json!({
        "clientName": client.name,
        "clientVersion": client.version,
        "clientScreen": if client.embedded { "EMBED" } else { "WATCH" },
        "userAgent": client.user_agent,
        "hl": "en",
        "gl": "US",
        "visitorData": visitor_data
    });
    for (key, value) in [
        ("osName", client.os_name),
        ("osVersion", client.os_version),
        ("deviceMake", client.device_make),
        ("deviceModel", client.device_model),
    ] {
        if let Some(value) = value {
            client_context[key] = json!(value);
        }
    }
    if let Some(sdk) = client.android_sdk {
        client_context["androidSdkVersion"] = json!(sdk);
    }
    let mut context = json!({ "client": client_context, "user": {} });
    if let Some(data_sync_id) = data_sync_id {
        context["user"] = json!({ "onBehalfOfUser": data_sync_id });
    }
    if client.embedded {
        context["thirdParty"] = json!({ "embedUrl": "https://www.youtube.com/" });
    }
    let mut body = json!({
        "context": context,
        "videoId": video_id,
        "cpn": cpn,
        "contentCheckOk": true,
        "racyCheckOk": true
    });
    if let Some(playlist_id) = playlist_id.filter(|value| !value.is_empty()) {
        body["playlistId"] = json!(playlist_id);
    }
    if let Some(sts) = signature_timestamp {
        body["playbackContext"] = json!({ "contentPlaybackContext": { "signatureTimestamp": sts, "html5Preference": "HTML5_PREF_WANTS" } });
    }
    body
}

#[allow(clippy::too_many_arguments)]
async fn player_post(
    video_id: &str,
    playlist_id: Option<&str>,
    visitor_data: &str,
    client: &resolver::ClientProfile,
    signature_timestamp: Option<u32>,
    session: Option<&AuthSession>,
    cpn: &str,
) -> Result<Value, String> {
    let session = session.filter(|_| client.auth != resolver::Auth::None);
    let origin = format!("https://{}", client.host);
    let body = player_request_body(
        video_id,
        playlist_id,
        visitor_data,
        client,
        signature_timestamp,
        session
            .map(|value| value.data_sync_id.as_str())
            .filter(|value| !value.is_empty()),
        cpn,
    );
    let mut request = http()
        .post(format!("{origin}/youtubei/v1/player?prettyPrint=false"))
        .header("User-Agent", client.user_agent)
        .header("X-Goog-Api-Format-Version", "1")
        .header("X-YouTube-Client-Name", client.id)
        .header("X-YouTube-Client-Version", client.version)
        .header("Origin", &origin)
        .header("X-Origin", &origin)
        .header("Referer", format!("{origin}/"))
        .header("X-Goog-Visitor-Id", visitor_data)
        .json(&body);
    if let Some(session) = session {
        request = request.header("Cookie", &session.cookie);
        if let Some(authorization) = sapisid_hash_for(&session.cookie, &origin) {
            request = request.header("Authorization", authorization);
        }
    }
    request
        .send()
        .await
        .map_err(|e| format!("player request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("player request rejected: {e}"))?
        .json::<Value>()
        .await
        .map_err(|e| format!("player response unreadable: {e}"))
}

fn player_metadata(response: &Value, video_id: &str) -> PlayerPayload {
    let details = response.get("videoDetails");
    PlayerPayload {
        video_id: video_id.to_owned(),
        title: details
            .and_then(|v| v.get("title"))
            .and_then(Value::as_str)
            .map(str::to_owned),
        artist: details
            .and_then(|v| v.get("author"))
            .and_then(Value::as_str)
            .map(str::to_owned),
        stream_url: String::new(),
        mime_type: String::new(),
        bitrate: 0,
        expires_in_seconds: response
            .get("streamingData")
            .and_then(|v| v.get("expiresInSeconds"))
            .and_then(|v| {
                v.as_i64()
                    .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
            })
            .unwrap_or(0),
        duration: details
            .and_then(|value| value.get("lengthSeconds"))
            .and_then(Value::as_str)
            .and_then(|value| value.parse::<i64>().ok())
            .unwrap_or(0),
        source_client: None,
    }
}

/// Try one client: /player → playability → audio format → (solve) → validated URL.
async fn try_player_client(
    video_id: &str,
    playlist_id: Option<&str>,
    audio_quality: &str,
    visitor_data: &str,
    client: &resolver::ClientProfile,
    session: Option<&AuthSession>,
    signature_timestamp: Option<u32>,
) -> Result<PlayerPayload, (resolver::Category, String)> {
    use resolver::Category;
    let cpn = random_cpn();
    let response = player_post(
        video_id,
        playlist_id,
        visitor_data,
        client,
        signature_timestamp,
        session,
        &cpn,
    )
    .await
    .map_err(|error| (Category::Network, error))?;
    let playability = response.get("playabilityStatus");
    let status = playability
        .and_then(|v| v.get("status"))
        .and_then(Value::as_str)
        .unwrap_or("UNKNOWN");
    if status != "OK" {
        let reason = playability
            .and_then(|v| v.get("reason"))
            .and_then(Value::as_str)
            .unwrap_or("");
        return Err((
            resolver::classify_playability(status, reason),
            format!("{status}: {reason}"),
        ));
    }
    let candidates =
        resolver::audio_candidates(&response, audio_quality.eq_ignore_ascii_case("low"));
    let candidate = candidates
        .first()
        .ok_or_else(|| (Category::NoAudio, "no audio-only format".to_owned()))?;
    let (n_challenge, sig_challenge) = match &candidate.url {
        resolver::FormatUrl::Direct(url) => (
            resolver::n_challenge(url).filter(|_| client.uses_player_js),
            None,
        ),
        resolver::FormatUrl::Ciphered { url, s, .. } => {
            (resolver::n_challenge(url), Some(s.clone()))
        }
    };
    let (n_solution, signature) = if n_challenge.is_some() || sig_challenge.is_some() {
        solve_challenges(n_challenge.clone(), sig_challenge.clone())
            .await
            .map_err(|error| (Category::CipherUnsolved, error))?
    } else {
        (None, None)
    };
    if n_challenge.is_some() && n_solution.is_none() {
        // An unsolved `n` is throttled to unusable speeds; treat it as a failed client.
        return Err((
            Category::CipherUnsolved,
            "n challenge was not solved".to_owned(),
        ));
    }
    let stream_url = resolver::finalize_url(
        &candidate.url,
        signature.as_deref(),
        n_solution.as_deref(),
        &cpn,
    )
    .map_err(|error| (Category::CipherUnsolved, error))?;
    probe_stream_access(&stream_url, candidate.content_length).await?;
    let mut payload = player_metadata(&response, video_id);
    payload.stream_url = stream_url;
    payload.mime_type = candidate.mime.clone();
    payload.bitrate = candidate.bitrate;
    payload.source_client = Some(client.key.to_owned());
    Ok(payload)
}

async fn resolve_player_payload(
    video_id: &str,
    playlist_id: Option<&str>,
    audio_quality: &str,
    state: &tauri::State<'_, RuntimeState>,
) -> Result<PlayerPayload, String> {
    let id = video_id.trim();
    if id.is_empty() {
        return Err("video id is empty".to_owned());
    }
    let visitor_data = visitor(state).await?;
    let session = auth_session(state)?;
    let hints = resolver::Hints {
        uploaded: resolver::is_uploaded_context(playlist_id),
    };
    let excluded = resolver_memory()
        .lock()
        .map_err(|_| "resolver state poisoned".to_owned())?
        .excluded(id, std::time::Instant::now());
    let mut clients = resolver::client_order(session.is_some(), true, hints, &excluded);
    if clients.is_empty() {
        // Every client failed recently: start over rather than refusing to play.
        clients = resolver::client_order(session.is_some(), true, hints, &[]);
    }
    if let Ok(health) = client_health().lock() {
        health.reorder(&mut clients, std::time::Instant::now());
    }
    let mut attempts = Vec::new();
    let mut js_state: Option<Result<u32, String>> = None;
    let mut result = None;
    for client in &clients {
        let signature_timestamp = if client.uses_player_js {
            if js_state.is_none() {
                js_state = Some(ensure_player_js().await);
            }
            match js_state.as_ref() {
                Some(Ok(sts)) => Some(*sts),
                Some(Err(error)) => {
                    attempts.push(resolver::Attempt {
                        client: client.key,
                        category: resolver::Category::CipherUnsolved,
                        detail: resolver::redact(error),
                    });
                    continue;
                }
                None => None,
            }
        } else {
            None
        };
        match try_player_client(
            id,
            playlist_id,
            audio_quality,
            &visitor_data,
            client,
            session.as_ref(),
            signature_timestamp,
        )
        .await
        {
            Ok(payload) => {
                if let Ok(mut memory) = resolver_memory().lock() {
                    memory.record_success(id, client.key);
                }
                result = Some(payload);
                break;
            }
            Err((category, detail)) => {
                if category == resolver::Category::StreamForbidden {
                    mark_stream_refused(id, Some(client.key));
                }
                attempts.push(resolver::Attempt {
                    client: client.key,
                    category,
                    detail: resolver::redact(&detail),
                });
                if category.is_final() {
                    break;
                }
            }
        }
    }
    if let Ok(mut stored) = resolver_attempts().lock() {
        if stored.len() > 256 {
            stored.clear();
        }
        stored.insert(id.to_owned(), attempts.clone());
    }
    result.ok_or_else(|| resolver::summarize(&attempts))
}

/// Load and preprocess the player script in the background so a cipher fallback is fast (PLAY-016).
fn prewarm_player_js() {
    tauri::async_runtime::spawn(async {
        tokio::time::sleep(Duration::from_secs(20)).await;
        let _ = ensure_player_js().await;
    });
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DownloadInfo {
    song_id: String,
    path: String,
    bytes: i64,
    total_bytes: Option<i64>,
    state: String,
    error: Option<String>,
    lyrics_cached: bool,
    artwork_path: Option<String>,
}

fn download_info_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<DownloadInfo> {
    Ok(DownloadInfo {
        song_id: row.get(0)?,
        path: row.get(1)?,
        bytes: row.get(2)?,
        total_bytes: row.get(3)?,
        state: row.get(4)?,
        error: row.get(5)?,
        lyrics_cached: row.get::<_, i64>(6)? != 0,
        artwork_path: row.get(7)?,
    })
}

fn download_cache_path(song_id: &str) -> PathBuf {
    let digest = Sha1::digest(song_id.as_bytes());
    database_path()
        .parent()
        .map(|value| value.join("downloads"))
        .unwrap_or_else(|| PathBuf::from("downloads"))
        .join(format!("{digest:x}.audio"))
}

/// A playback-cache file usable for this song at this quality (PLAY-021): a copy cached at another quality is
/// never served, and an empty or vanished file is ignored.
fn cached_player_file(
    db: &Connection,
    song_id: &str,
    quality: &str,
) -> Result<Option<String>, String> {
    let cached = db
        .query_row(
            "SELECT path, bytes FROM player_cache WHERE song_id = ?1 AND quality = ?2",
            params![song_id, quality],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
        )
        .optional()
        .map_err(|error| format!("player cache state read failed: {error}"))?;
    Ok(cached
        .filter(|(path, bytes)| *bytes > 0 && Path::new(path).is_file())
        .map(|(path, _)| path))
}

fn normalize_audio_quality(value: Option<&str>) -> &'static str {
    match value.unwrap_or("auto") {
        "high" => "high",
        "low" => "low",
        _ => "auto",
    }
}

/// Directories whose files the WebView may load through the asset protocol.
fn media_directories() -> Vec<PathBuf> {
    let Some(root) = database_path().parent().map(Path::to_path_buf) else {
        return Vec::new();
    };
    ["downloads", "player-cache", "artwork"]
        .iter()
        .map(|name| root.join(name))
        .collect()
}

fn player_cache_path(song_id: &str) -> PathBuf {
    let digest = Sha1::digest(song_id.as_bytes());
    database_path()
        .parent()
        .map(|value| value.join("player-cache"))
        .unwrap_or_else(|| PathBuf::from("player-cache"))
        .join(format!("{digest:x}.audio"))
}

fn download_artwork_path(song_id: &str, extension: &str) -> PathBuf {
    let digest = Sha1::digest(song_id.as_bytes());
    let safe_extension = match extension {
        "jpg" | "jpeg" => "jpg",
        "png" => "png",
        "webp" => "webp",
        _ => "cover",
    };
    database_path()
        .parent()
        .map(|value| value.join("downloads"))
        .unwrap_or_else(|| PathBuf::from("downloads"))
        .join(format!("{digest:x}.{safe_extension}"))
}

fn artwork_extension(content_type: &str) -> &'static str {
    let mime = content_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    match mime.as_str() {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        _ => "cover",
    }
}

#[derive(Debug, PartialEq, Eq)]
enum DownloadRetry {
    Proceed,
    /// The media server refused the URL: resolve again with another client.
    Reresolve,
    /// The saved partial file no longer matches the stream: start from byte 0.
    Restart,
}

fn download_retry(status: reqwest::StatusCode, resume: download_resume::Resume) -> DownloadRetry {
    if resolver::stream_access(status.as_u16()) == resolver::StreamAccess::Forbidden {
        DownloadRetry::Reresolve
    } else if resume == download_resume::Resume::Restart {
        DownloadRetry::Restart
    } else {
        DownloadRetry::Proceed
    }
}

async fn cache_download_artwork(song_id: &str, source_url: Option<&str>) -> Option<String> {
    let url = source_url?.trim();
    // Always defense-in-depth, not a response to a known exploit: this only ever receives thumbnail URLs
    // parsed out of YouTube's own API responses (the one caller passes item.thumbnail), never user-entered
    // text, but a future parsing bug or upstream API change should not turn into fetching an arbitrary host.
    let parsed = url::Url::parse(url).ok()?;
    if parsed.scheme() != "https" {
        return None;
    }
    let host = parsed.host_str()?;
    const ALLOWED_ARTWORK_HOST_SUFFIXES: [&str; 4] = [
        ".ytimg.com",
        ".googleusercontent.com",
        ".ggpht.com",
        ".gstatic.com",
    ];
    if !ALLOWED_ARTWORK_HOST_SUFFIXES
        .iter()
        .any(|suffix| host.ends_with(suffix))
    {
        return None;
    }
    let response = http().get(url).send().await.ok()?.error_for_status().ok()?;
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_owned();
    if !content_type.to_ascii_lowercase().starts_with("image/") {
        return None;
    }
    let bytes = response.bytes().await.ok()?;
    if bytes.is_empty() || bytes.len() > 10 * 1024 * 1024 {
        return None;
    }
    let path = download_artwork_path(song_id, artwork_extension(&content_type));
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await.ok()?;
    }
    let partial = PathBuf::from(format!("{}.part", path.to_string_lossy()));
    tokio::fs::write(&partial, &bytes).await.ok()?;
    if tokio::fs::rename(&partial, &path).await.is_err() {
        let _ = tokio::fs::remove_file(&partial).await;
        return None;
    }
    Some(path.to_string_lossy().to_string())
}

fn player_cache_jobs() -> &'static Mutex<player_cache::CacheJobs> {
    PLAYER_CACHE_JOBS.get_or_init(|| Mutex::new(player_cache::CacheJobs::default()))
}

fn player_cache_blocked() -> &'static Mutex<HashSet<String>> {
    PLAYER_CACHE_BLOCKED.get_or_init(|| Mutex::new(HashSet::new()))
}

fn player_cache_is_blocked(song_id: &str) -> bool {
    player_cache_blocked()
        .lock()
        .map(|blocked| blocked.contains(song_id))
        .unwrap_or(true)
}

fn download_cancel_map() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    DOWNLOAD_CANCELS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn download_is_active(song_id: &str) -> bool {
    download_cancel_map()
        .lock()
        .map(|active| active.contains_key(song_id))
        .unwrap_or(false)
}

/// Removes a song from the active-download map on every exit path (including early `?` returns), so a failed setup
/// step can no longer leave the song stuck as "download is already active" until the app restarts.
struct ActiveDownloadGuard(String);
impl Drop for ActiveDownloadGuard {
    fn drop(&mut self) {
        if let Ok(mut map) = download_cancel_map().lock() {
            map.remove(&self.0);
        }
    }
}

fn read_download_info(db: &Connection, song_id: &str) -> Result<Option<DownloadInfo>, String> {
    db.query_row("SELECT song_id, path, bytes, total_bytes, state, error, lyrics_cached, artwork_path FROM downloads WHERE song_id = ?1", params![song_id], download_info_from_row).optional().map_err(|error| format!("download state read failed: {error}"))
}

fn emit_download(app: &tauri::AppHandle, info: &DownloadInfo) {
    let _ = app.emit("download-state", info.clone());
}

fn player_cache_limit_mb(db: &Connection) -> i64 {
    let stored: Option<String> = db
        .query_row(
            "SELECT value FROM settings WHERE key = 'playerCacheLimitMb'",
            [],
            |row| row.get(0),
        )
        .optional()
        .ok()
        .flatten();
    player_cache::parse_limit_mb(stored.as_deref())
}

/// Deletes least-recently-used playback-cache files until the cache fits the user's limit (PLAY-041).
/// A file Windows will not delete (for example the one playing right now) keeps its row and is retried
/// next time. Returns the number of entries removed.
fn enforce_player_cache_quota(db: &Connection) -> Result<usize, String> {
    let quota = player_cache::limit_bytes(player_cache_limit_mb(db));
    let mut statement = db
        .prepare("SELECT song_id, path, bytes, cached_at FROM player_cache")
        .map_err(|error| format!("player cache quota query failed: {error}"))?;
    let rows: Vec<(player_cache::CacheEntry, String)> = statement
        .query_map([], |row| {
            Ok((
                player_cache::CacheEntry {
                    song_id: row.get(0)?,
                    bytes: row.get(2)?,
                    used_at: row.get(3)?,
                },
                row.get::<_, String>(1)?,
            ))
        })
        .map_err(|error| format!("player cache quota query failed: {error}"))?
        .filter_map(Result::ok)
        .collect();
    drop(statement);
    let entries: Vec<player_cache::CacheEntry> =
        rows.iter().map(|(entry, _)| entry.clone()).collect();
    let mut removed = 0;
    for song_id in player_cache::plan_eviction(&entries, quota) {
        let Some((_, path)) = rows.iter().find(|(entry, _)| entry.song_id == song_id) else {
            continue;
        };
        let gone = match fs::remove_file(path) {
            Ok(()) => true,
            Err(error) => error.kind() == std::io::ErrorKind::NotFound,
        };
        if gone {
            db.execute(
                "DELETE FROM player_cache WHERE song_id = ?1",
                params![song_id],
            )
            .map_err(|error| format!("player cache eviction failed: {error}"))?;
            removed += 1;
        }
    }
    Ok(removed)
}

fn files_in(directory: &Path) -> Vec<PathBuf> {
    fs::read_dir(directory)
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .map(|entry| entry.path())
                .filter(|path| path.is_file())
                .collect()
        })
        .unwrap_or_default()
}

/// Start-up housekeeping (R6-026): drop rows whose cache file vanished, delete abandoned `.part` files and
/// unreferenced playback-cache files, then apply the cache limit. Finished offline downloads are never
/// deleted here; only `.part` files that no download can resume.
fn clean_media_on_startup(db: &Connection) -> Result<(usize, usize), String> {
    let cache_dir = player_cache_path("probe").parent().map(Path::to_path_buf);
    let download_dir = download_cache_path("probe").parent().map(Path::to_path_buf);
    clean_media_dirs(db, cache_dir.as_deref(), download_dir.as_deref())
}

fn clean_media_dirs(
    db: &Connection,
    cache_dir: Option<&Path>,
    download_dir: Option<&Path>,
) -> Result<(usize, usize), String> {
    let cache_rows: Vec<(String, String)> = db
        .prepare("SELECT song_id, path FROM player_cache")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
                .collect()
        })
        .map_err(|error| format!("player cache cleanup query failed: {error}"))?;
    for (song_id, path) in &cache_rows {
        if !Path::new(path).is_file() {
            db.execute(
                "DELETE FROM player_cache WHERE song_id = ?1",
                params![song_id],
            )
            .map_err(|error| format!("player cache cleanup failed: {error}"))?;
        }
    }
    let known: HashSet<PathBuf> = cache_rows
        .iter()
        .map(|(_, path)| PathBuf::from(path))
        .collect();
    let resumable: HashSet<PathBuf> = db
        .prepare("SELECT path FROM downloads WHERE state != 'completed'")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(|error| format!("download cleanup query failed: {error}"))?
        .into_iter()
        .map(|path| PathBuf::from(format!("{path}.part")))
        .collect();
    let mut candidates = cache_dir.map(files_in).unwrap_or_default();
    candidates.extend(
        download_dir
            .map(files_in)
            .unwrap_or_default()
            .into_iter()
            .filter(|path| path.extension().is_some_and(|ext| ext == "part")),
    );
    let mut deleted = 0;
    for file in player_cache::orphaned_files(&candidates, &known, &resumable) {
        if fs::remove_file(&file).is_ok() {
            deleted += 1;
        }
    }
    let evicted = enforce_player_cache_quota(db)?;
    Ok((deleted, evicted))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlayerCacheUsage {
    bytes: i64,
    songs: i64,
    limit_mb: i64,
}

fn parse_queue_panel_item(renderer: &Value) -> Option<YtItem> {
    let video_id = renderer.get("videoId").and_then(Value::as_str)?.to_owned();
    let title = text(renderer.get("title"));
    if title.is_empty() {
        return None;
    }
    let subtitle = text(renderer.get("longBylineText"));
    let (play_video_id, playlist_id) = watch_endpoint(renderer.get("navigationEndpoint"));
    let thumbnail = thumbnail(renderer.get("thumbnail"));
    Some(YtItem {
        id: video_id.clone(),
        kind: "song".to_owned(),
        title,
        subtitle,
        thumbnail,
        artists: parse_artists(renderer.get("longBylineText")),
        browse_id: None,
        playlist_id: playlist_id.clone(),
        video_id: Some(video_id.clone()),
        set_video_id: renderer
            .get("playlistSetVideoId")
            .and_then(Value::as_str)
            .map(str::to_owned),
        play_playlist_id: playlist_id,
        play_video_id: play_video_id.or(Some(video_id)),
        params: None,
        explicit: explicit_badge(renderer),
        music_video_type: music_video_type(renderer.get("navigationEndpoint")).or_else(|| {
            renderer
                .get("musicVideoType")
                .and_then(Value::as_str)
                .map(str::to_owned)
        }),
        history_remove_token: None,
        album_id: None,
        album_title: None,
    })
}

fn parse_get_queue(response: &Value) -> Vec<YtItem> {
    response
        .get("queueDatas")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|value| value.get("content"))
        .filter_map(|value| value.get("playlistPanelVideoRenderer"))
        .filter_map(parse_queue_panel_item)
        .collect()
}

fn parse_queue(response: &Value) -> QueuePage {
    let panel = response
        .get("continuationContents")
        .and_then(|v| v.get("playlistPanelContinuation"))
        .or_else(|| {
            response
                .get("contents")
                .and_then(|v| v.get("singleColumnMusicWatchNextResultsRenderer"))
                .and_then(|v| v.get("tabbedRenderer"))
                .and_then(|v| v.get("watchNextTabbedResultsRenderer"))
                .and_then(|v| v.get("tabs"))
                .and_then(|v| v.get(0))
                .and_then(|v| v.get("tabRenderer"))
                .and_then(|v| v.get("content"))
                .and_then(|v| v.get("musicQueueRenderer"))
                .and_then(|v| v.get("content"))
                .and_then(|v| v.get("playlistPanelRenderer"))
        });
    let contents = panel
        .and_then(|v| v.get("contents"))
        .and_then(Value::as_array);
    let mut items = Vec::new();
    let mut current_index = None;
    for content in contents.into_iter().flatten() {
        if let Some(renderer) = content.get("playlistPanelVideoRenderer") {
            if let Some(item) = parse_queue_panel_item(renderer) {
                if renderer.get("selected").and_then(Value::as_bool) == Some(true) {
                    current_index = Some(items.len());
                }
                items.push(item);
            }
        }
    }
    let title = response
        .get("contents")
        .and_then(|v| v.get("singleColumnMusicWatchNextResultsRenderer"))
        .and_then(|v| v.get("tabbedRenderer"))
        .and_then(|v| v.get("watchNextTabbedResultsRenderer"))
        .and_then(|v| v.get("tabs"))
        .and_then(|v| v.get(0))
        .and_then(|v| v.get("tabRenderer"))
        .and_then(|v| v.get("content"))
        .and_then(|v| v.get("musicQueueRenderer"))
        .and_then(|v| v.get("header"))
        .and_then(|v| v.get("musicQueueHeaderRenderer"))
        .and_then(|v| v.get("subtitle"))
        .map(|v| text(Some(v)))
        .filter(|v| !v.is_empty());
    let continuation = panel
        .and_then(|v| v.get("continuations"))
        .and_then(Value::as_array)
        .and_then(|v| v.first())
        .and_then(|v| v.get("nextContinuationData"))
        .and_then(|v| v.get("continuation"))
        .and_then(Value::as_str)
        .map(str::to_owned);
    let related_endpoint = response
        .get("contents")
        .and_then(|v| v.get("singleColumnMusicWatchNextResultsRenderer"))
        .and_then(|v| v.get("tabbedRenderer"))
        .and_then(|v| v.get("watchNextTabbedResultsRenderer"))
        .and_then(|v| v.get("tabs"))
        .and_then(Value::as_array)
        .and_then(|v| v.get(2))
        .and_then(|v| v.get("tabRenderer"))
        .and_then(|v| v.get("endpoint"));
    let (related_browse_id, related_params) = browse_endpoint(related_endpoint);
    QueuePage {
        title,
        items,
        current_index,
        continuation,
        related_browse_id,
        related_params,
    }
}

fn parse_related(response: &Value) -> Vec<YtItem> {
    let mut parsed = Vec::new();
    collect_typed_items(response, &mut parsed);
    let mut seen = HashSet::new();
    parsed
        .into_iter()
        .filter(|item| {
            item.kind == "song" && item.music_video_type.as_deref() == Some("MUSIC_VIDEO_TYPE_ATV")
        })
        .filter(|item| seen.insert(item.id.clone()))
        .collect()
}

fn parse_multi_row_episode(renderer: &Value) -> Option<YtItem> {
    let title = text(renderer.get("title"));
    let (video_id, playlist_id) = watch_endpoint(renderer.get("onTap"));
    let video_id = video_id?;
    let subtitle = text(renderer.get("subtitle"));
    let image = thumbnail(
        renderer
            .get("thumbnail")
            .and_then(|v| v.get("musicThumbnailRenderer"))
            .and_then(|v| v.get("thumbnail")),
    );
    Some(YtItem {
        id: video_id.clone(),
        kind: "episode".to_owned(),
        title,
        subtitle,
        thumbnail: image,
        artists: Vec::new(),
        browse_id: None,
        playlist_id: playlist_id.clone(),
        video_id: Some(video_id.clone()),
        set_video_id: None,
        play_playlist_id: playlist_id,
        play_video_id: Some(video_id),
        params: None,
        explicit: explicit_badge(renderer),
        music_video_type: music_video_type(renderer.get("onTap")),
        history_remove_token: None,
        album_id: None,
        album_title: None,
    })
}

fn parse_browse_item(value: &Value) -> Option<YtItem> {
    value
        .get("musicTwoRowItemRenderer")
        .and_then(parse_two_row)
        .or_else(|| {
            value
                .get("musicMultiRowListItemRenderer")
                .and_then(parse_multi_row_episode)
        })
        .or_else(|| {
            value
                .get("musicResponsiveListItemRenderer")
                .and_then(parse_responsive_typed)
        })
}
fn parse_browse_navigation(value: &Value) -> Option<YtItem> {
    let title = text(value.get("buttonText"));
    if title.is_empty() {
        return None;
    }
    let endpoint = value
        .get("clickCommand")
        .or_else(|| value.get("navigationEndpoint"));
    let (browse_id, params) = browse_endpoint(endpoint);
    let browse_id = browse_id?;
    Some(YtItem {
        id: browse_id.clone(),
        kind: "browse".to_owned(),
        title,
        subtitle: "Browse".to_owned(),
        thumbnail: None,
        artists: Vec::new(),
        browse_id: Some(browse_id),
        playlist_id: None,
        video_id: None,
        set_video_id: None,
        play_playlist_id: None,
        play_video_id: None,
        params,
        explicit: false,
        music_video_type: None,
        history_remove_token: None,
        album_id: None,
        album_title: None,
    })
}
fn parse_browse_response(response: &Value, browse_id: &str) -> DetailPage {
    let section_list = response
        .get("contents")
        .and_then(|v| v.get("singleColumnBrowseResultsRenderer"))
        .and_then(|v| v.get("tabs"))
        .and_then(|v| v.get(0))
        .and_then(|v| v.get("tabRenderer"))
        .and_then(|v| v.get("content"))
        .and_then(|v| v.get("sectionListRenderer"))
        .or_else(|| {
            response
                .get("continuationContents")
                .and_then(|v| v.get("sectionListContinuation"))
        });
    let mut items = Vec::new();
    if let Some(contents) = section_list
        .and_then(|v| v.get("contents"))
        .and_then(Value::as_array)
    {
        for section in contents {
            if let Some(grid) = section.get("gridRenderer") {
                items.extend(
                    grid.get("items")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                        .filter_map(|item| {
                            parse_browse_item(item).or_else(|| {
                                item.get("musicNavigationButtonRenderer")
                                    .and_then(parse_browse_navigation)
                            })
                        }),
                );
            }
            if let Some(carousel) = section.get("musicCarouselShelfRenderer") {
                items.extend(
                    carousel
                        .get("contents")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                        .filter_map(|item| {
                            parse_browse_item(item).or_else(|| {
                                item.get("musicNavigationButtonRenderer")
                                    .and_then(parse_browse_navigation)
                            })
                        }),
                );
            }
            if let Some(shelf) = section.get("musicShelfRenderer") {
                items.extend(
                    shelf
                        .get("contents")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                        .filter_map(parse_browse_item),
                );
            }
            if let Some(playlist_shelf) = section.get("musicPlaylistShelfRenderer") {
                items.extend(
                    playlist_shelf
                        .get("contents")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                        .filter_map(parse_browse_item),
                );
            }
        }
    }
    let mut seen = std::collections::HashSet::new();
    items.retain(|item| seen.insert((item.kind.clone(), item.id.clone())));
    let title = response
        .get("header")
        .and_then(|v| v.get("musicHeaderRenderer"))
        .map(|v| text(v.get("title")))
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| browse_id.to_owned());
    let continuation = section_list
        .and_then(|v| v.get("continuations"))
        .and_then(Value::as_array)
        .and_then(|values| values.first())
        .and_then(|value| value.get("nextContinuationData"))
        .and_then(|v| v.get("continuation"))
        .and_then(Value::as_str)
        .map(str::to_owned);
    DetailPage {
        kind: "browse".to_owned(),
        title,
        subtitle: "Meld browse results".to_owned(),
        thumbnail: None,
        items,
        continuation,
        browse_id: Some(browse_id.to_owned()),
    }
}
fn parse_home_sections(contents: Option<&Value>) -> Vec<HomeSection> {
    let Some(contents) = contents.and_then(Value::as_array) else {
        return Vec::new();
    };
    let mut sections = Vec::new();
    for section in contents {
        let Some(carousel) = section.get("musicCarouselShelfRenderer") else {
            continue;
        };
        let header = carousel
            .get("header")
            .and_then(|v| v.get("musicCarouselShelfBasicHeaderRenderer"));
        let title = text(header.and_then(|v| v.get("title")));
        if title.is_empty() {
            continue;
        }
        let items = carousel
            .get("contents")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|item| {
                item.get("musicTwoRowItemRenderer")
                    .and_then(parse_two_row)
                    .or_else(|| {
                        item.get("musicMultiRowListItemRenderer")
                            .and_then(parse_multi_row_episode)
                    })
                    .or_else(|| {
                        item.get("musicResponsiveListItemRenderer")
                            .and_then(parse_responsive_typed)
                    })
            })
            .collect::<Vec<_>>();
        if items.is_empty() {
            continue;
        }
        let more_endpoint = header
            .and_then(|v| v.get("moreContentButton"))
            .and_then(|v| v.get("buttonRenderer"))
            .and_then(|v| v.get("navigationEndpoint"));
        let (browse_id, params) = browse_endpoint(more_endpoint);
        let browse_kind = browse_kind(more_endpoint, browse_id.as_deref());
        sections.push(HomeSection {
            title,
            label: Some(text(header.and_then(|v| v.get("strapline")))).filter(|v| !v.is_empty()),
            thumbnail: thumbnail(
                header
                    .and_then(|v| v.get("thumbnail"))
                    .and_then(|v| v.get("musicThumbnailRenderer"))
                    .and_then(|v| v.get("thumbnail")),
            ),
            browse_id,
            params,
            browse_kind,
            items,
        });
    }
    sections
}

fn home_continuation(response: &Value) -> Option<String> {
    response
        .get("continuationContents")
        .and_then(|v| v.get("sectionListContinuation"))
        .and_then(|v| v.get("continuations"))
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .and_then(|item| item.get("nextContinuationData"))
        .and_then(|v| v.get("continuation"))
        .and_then(Value::as_str)
        .map(str::to_owned)
}

fn parse_home(response: &Value) -> HomePage {
    let section_list = response
        .get("contents")
        .and_then(|v| v.get("singleColumnBrowseResultsRenderer"))
        .and_then(|v| v.get("tabs"))
        .and_then(|v| v.get(0))
        .and_then(|v| v.get("tabRenderer"))
        .and_then(|v| v.get("content"))
        .and_then(|v| v.get("sectionListRenderer"));
    let sections = parse_home_sections(section_list.and_then(|v| v.get("contents")));
    let continuation = section_list
        .and_then(|v| v.get("continuations"))
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .and_then(|item| item.get("nextContinuationData"))
        .and_then(|v| v.get("continuation"))
        .and_then(Value::as_str)
        .map(str::to_owned);
    HomePage {
        sections,
        continuation,
    }
}

fn parse_home_continuation(response: &Value) -> HomePage {
    let section_list = response
        .get("continuationContents")
        .and_then(|v| v.get("sectionListContinuation"));
    HomePage {
        sections: parse_home_sections(section_list.and_then(|v| v.get("contents"))),
        continuation: home_continuation(response),
    }
}

fn parse_responsive_typed(renderer: &Value) -> Option<YtItem> {
    let columns = renderer.get("flexColumns").and_then(Value::as_array)?;
    let title = text(
        columns
            .first()?
            .get("musicResponsiveListItemFlexColumnRenderer")?
            .get("text"),
    );
    if title.is_empty() {
        return None;
    }
    let secondary = columns
        .get(1)
        .and_then(|v| v.get("musicResponsiveListItemFlexColumnRenderer"))
        .and_then(|v| v.get("text"));
    let subtitle = text(secondary);
    let navigation = renderer.get("navigationEndpoint");
    let (browse_id, browse_params) = browse_endpoint(navigation);
    let (navigation_video, navigation_playlist) = watch_endpoint(navigation);
    let overlay = renderer
        .get("overlay")
        .and_then(|v| v.get("musicItemThumbnailOverlayRenderer"))
        .and_then(|v| v.get("content"))
        .and_then(|v| v.get("musicPlayButtonRenderer"))
        .and_then(|v| v.get("playNavigationEndpoint"));
    let (overlay_video, overlay_playlist) = watch_endpoint(overlay);
    let page_type = navigation
        .and_then(|v| v.get("browseEndpoint"))
        .and_then(|v| v.get("browseEndpointContextSupportedConfigs"))
        .and_then(|v| v.get("browseEndpointContextMusicConfig"))
        .and_then(|v| v.get("pageType"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let video_id = renderer
        .get("playlistItemData")
        .and_then(|v| v.get("videoId"))
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or(navigation_video.clone());
    let collection_link = secondary
        .and_then(|v| v.get("runs"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find_map(|run| {
            let endpoint = run.get("navigationEndpoint")?.get("browseEndpoint")?;
            let browse_id = endpoint.get("browseId").and_then(Value::as_str)?.to_owned();
            let page_type = endpoint
                .get("browseEndpointContextSupportedConfigs")
                .and_then(|v| v.get("browseEndpointContextMusicConfig"))
                .and_then(|v| v.get("pageType"))
                .and_then(Value::as_str)
                .unwrap_or("");
            (page_type.contains("ALBUM")
                || page_type.contains("PODCAST_SHOW_DETAIL_PAGE")
                || browse_id.starts_with("MPSP"))
            .then_some((
                browse_id,
                run.get("text")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_owned(),
            ))
        });
    let podcast_link = collection_link.as_ref().is_some_and(|(browse_id, _)| {
        browse_id.starts_with("MPSP") || browse_id.contains("PODCAST")
    });
    let first_subtitle = secondary
        .and_then(|v| v.get("runs"))
        .and_then(Value::as_array)
        .and_then(|runs| runs.first())
        .and_then(|v| v.get("text"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let set_video_id = renderer
        .get("playlistItemData")
        .and_then(|value| value.get("playlistSetVideoId"))
        .and_then(Value::as_str)
        .map(str::to_owned);
    let is_episode = video_id.is_some()
        && (page_type.contains("NON_MUSIC_AUDIO_TRACK")
            || first_subtitle.eq_ignore_ascii_case("Episode")
            || podcast_link);
    let kind = if is_episode {
        "episode"
    } else if video_id.is_some() {
        "song"
    } else if page_type.contains("ALBUM") {
        "album"
    } else if page_type.contains("PLAYLIST") || browse_id.as_deref().unwrap_or("").starts_with("VL")
    {
        "playlist"
    } else if page_type.contains("ARTIST")
        || page_type.contains("USER_CHANNEL")
        || browse_id.as_deref().unwrap_or("").starts_with("UC")
    {
        "artist"
    } else if page_type.contains("PODCAST") {
        "podcast"
    } else {
        return None;
    };
    let id = video_id.clone().or_else(|| browse_id.clone())?;
    let thumbnail = thumbnail(
        renderer
            .get("thumbnail")
            .and_then(|v| v.get("musicThumbnailRenderer"))
            .and_then(|v| v.get("thumbnail")),
    );
    Some(YtItem {
        id,
        kind: kind.to_owned(),
        title,
        subtitle,
        thumbnail,
        artists: parse_artists(secondary),
        browse_id: browse_id.map(|value| value.trim_start_matches("VL").to_owned()),
        playlist_id: overlay_playlist.clone().or(navigation_playlist.clone()),
        video_id,
        set_video_id,
        play_playlist_id: overlay_playlist.or(navigation_playlist),
        play_video_id: overlay_video,
        params: browse_params,
        explicit: explicit_badge(renderer),
        music_video_type: music_video_type(renderer.get("navigationEndpoint")).or_else(|| {
            renderer
                .get("musicVideoType")
                .and_then(Value::as_str)
                .map(str::to_owned)
        }),
        history_remove_token: None,
        album_id: collection_link.as_ref().map(|(id, _)| id.clone()),
        album_title: collection_link
            .map(|(_, title)| title)
            .filter(|value| !value.is_empty()),
    })
}

/// The "Top result" card: re-shaped into a list item so it shares the normal item parser.
fn parse_card_shelf_top(card: &Value) -> Option<YtItem> {
    let title = card.get("title")?;
    let navigation = title
        .get("runs")
        .and_then(Value::as_array)
        .and_then(|runs| runs.first())
        .and_then(|run| run.get("navigationEndpoint"))
        .or_else(|| card.get("onTap"))?
        .clone();
    let video_id = navigation
        .get("watchEndpoint")
        .and_then(|v| v.get("videoId"))
        .cloned();
    let mut renderer = json!({
        "flexColumns": [
            { "musicResponsiveListItemFlexColumnRenderer": { "text": title } },
            { "musicResponsiveListItemFlexColumnRenderer": { "text": card.get("subtitle").cloned().unwrap_or(Value::Null) } }
        ],
        "thumbnail": card.get("thumbnail").cloned().unwrap_or(Value::Null),
        "navigationEndpoint": navigation
    });
    if let Some(video_id) = video_id {
        renderer["playlistItemData"] = json!({ "videoId": video_id });
    }
    if let Some(badges) = card.get("subtitleBadges").or_else(|| card.get("badges")) {
        renderer["badges"] = badges.clone();
    }
    parse_responsive_typed(&renderer)
}

fn parse_search(response: &Value) -> SearchPage {
    let shelves = response
        .get("contents")
        .and_then(|value| value.get("tabbedSearchResultsRenderer"))
        .and_then(|value| value.get("tabs"))
        .and_then(|value| value.get(0))
        .and_then(|value| value.get("tabRenderer"))
        .and_then(|value| value.get("content"))
        .and_then(|value| value.get("sectionListRenderer"))
        .and_then(|value| value.get("contents"))
        .and_then(Value::as_array)
        .or_else(|| {
            response
                .get("contents")
                .and_then(|value| value.get("twoColumnSearchResultsRenderer"))
                .and_then(|value| value.get("primaryContents"))
                .and_then(|value| value.get("sectionListRenderer"))
                .and_then(|value| value.get("contents"))
                .and_then(Value::as_array)
        });
    let continuation = shelves
        .into_iter()
        .flatten()
        .filter_map(|shelf| shelf.get("musicShelfRenderer"))
        .find_map(|shelf| {
            shelf
                .get("continuations")
                .and_then(Value::as_array)
                .and_then(|values| values.first())
                .and_then(|value| value.get("nextContinuationData"))
                .and_then(|value| value.get("continuation"))
                .and_then(Value::as_str)
                .map(str::to_owned)
        });
    // YouTube Music returns the top result as a `musicCardShelfRenderer` and, since mid-2026, every other
    // result in its own `itemSectionRenderer` instead of `musicShelfRenderer` shelves. Read all three in
    // page order so the best match is first and nothing is dropped.
    let mut items = Vec::<YtItem>::new();
    let push = |item: YtItem, items: &mut Vec<YtItem>| {
        if !items.iter().any(|existing| existing.id == item.id) {
            items.push(item);
        }
    };
    for section in shelves.into_iter().flatten() {
        if let Some(card) = section.get("musicCardShelfRenderer") {
            if let Some(item) = parse_card_shelf_top(card) {
                push(item, &mut items);
            }
        }
        let contents = section
            .get("musicCardShelfRenderer")
            .or_else(|| section.get("musicShelfRenderer"))
            .or_else(|| section.get("itemSectionRenderer"))
            .and_then(|value| value.get("contents"))
            .and_then(Value::as_array);
        for content in contents.into_iter().flatten() {
            if let Some(item) = content
                .get("musicResponsiveListItemRenderer")
                .and_then(parse_responsive_typed)
            {
                push(item, &mut items);
            }
        }
    }
    if items.is_empty() {
        collect_typed_items(response, &mut items);
    }
    SearchPage {
        items,
        continuation,
    }
}

fn parse_search_continuation(response: &Value) -> SearchPage {
    let shelf = response
        .get("continuationContents")
        .and_then(|value| value.get("musicShelfContinuation"));
    let items = shelf
        .and_then(|value| value.get("contents"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|content| content.get("musicResponsiveListItemRenderer"))
        .filter_map(parse_responsive_typed)
        .fold(Vec::<YtItem>::new(), |mut items, item| {
            if !items.iter().any(|existing| existing.id == item.id) {
                items.push(item);
            }
            items
        });
    let continuation = if items.is_empty() {
        None
    } else {
        shelf
            .and_then(|value| value.get("continuations"))
            .and_then(Value::as_array)
            .and_then(|values| values.first())
            .and_then(|value| value.get("nextContinuationData"))
            .and_then(|value| value.get("continuation"))
            .and_then(Value::as_str)
            .map(str::to_owned)
    };
    SearchPage {
        items,
        continuation,
    }
}

fn collect_typed_items(value: &Value, items: &mut Vec<YtItem>) {
    if let Some(object) = value.as_object() {
        if let Some(renderer) = object
            .get("musicTwoRowItemRenderer")
            .and_then(parse_two_row)
        {
            if !items.iter().any(|item| item.id == renderer.id) {
                items.push(renderer);
            }
        }
        if let Some(renderer) = object
            .get("musicMultiRowListItemRenderer")
            .and_then(parse_multi_row_episode)
        {
            if !items.iter().any(|item| item.id == renderer.id) {
                items.push(renderer);
            }
        }
        if let Some(renderer) = object
            .get("musicResponsiveListItemRenderer")
            .and_then(parse_responsive_typed)
        {
            if !items.iter().any(|item| item.id == renderer.id) {
                items.push(renderer);
            }
        }
        for child in object.values() {
            collect_typed_items(child, items);
        }
    } else if let Some(array) = value.as_array() {
        for child in array {
            collect_typed_items(child, items);
        }
    }
}

fn detail_section_list(response: &Value) -> Option<&Value> {
    let two_column = response
        .get("contents")
        .and_then(|value| value.get("twoColumnBrowseResultsRenderer"))
        .and_then(|value| value.get("tabs"))
        .and_then(|value| value.get(0))
        .and_then(|value| value.get("tabRenderer"))
        .and_then(|value| value.get("content"))
        .and_then(|value| value.get("sectionListRenderer"));
    two_column.or_else(|| {
        response
            .get("contents")
            .and_then(|value| value.get("singleColumnBrowseResultsRenderer"))
            .and_then(|value| value.get("tabs"))
            .and_then(|value| value.get(0))
            .and_then(|value| value.get("tabRenderer"))
            .and_then(|value| value.get("content"))
            .and_then(|value| value.get("sectionListRenderer"))
    })
}

fn first_continuation(value: &Value) -> Option<String> {
    if let Some(object) = value.as_object() {
        if let Some(token) = object
            .get("continuations")
            .and_then(Value::as_array)
            .and_then(|values| {
                values
                    .iter()
                    .find_map(|entry| entry.get("nextContinuationData"))
            })
            .and_then(|entry| entry.get("continuation"))
            .and_then(Value::as_str)
        {
            return Some(token.to_owned());
        }
        for child in object.values() {
            if let Some(token) = first_continuation(child) {
                return Some(token);
            }
        }
    } else if let Some(array) = value.as_array() {
        for child in array {
            if let Some(token) = first_continuation(child) {
                return Some(token);
            }
        }
    }
    None
}

fn parse_detail(response: &Value, kind: &str, browse_id: Option<&str>) -> DetailPage {
    let section_list = detail_section_list(response);
    let header = section_list
        .and_then(|value| value.get("contents"))
        .and_then(|value| value.as_array())
        .and_then(|values| {
            values.iter().find_map(|value| {
                [
                    "musicResponsiveHeaderRenderer",
                    "musicImmersiveHeaderRenderer",
                    "musicVisualHeaderRenderer",
                    "musicDetailHeaderRenderer",
                    "musicHeaderRenderer",
                ]
                .iter()
                .find_map(|key| value.get(*key))
            })
        });
    let fallback_header = response
        .get("header")
        .and_then(|v| v.get("musicImmersiveHeaderRenderer"))
        .or_else(|| {
            response
                .get("header")
                .and_then(|v| v.get("musicVisualHeaderRenderer"))
        })
        .or_else(|| {
            response
                .get("header")
                .and_then(|v| v.get("musicDetailHeaderRenderer"))
        })
        .or_else(|| {
            response
                .get("header")
                .and_then(|v| v.get("musicHeaderRenderer"))
        });
    let active_header = header.or(fallback_header);
    let mut items = Vec::new();
    collect_typed_items(response, &mut items);
    let continuation = first_continuation(response);
    DetailPage {
        kind: kind.to_owned(),
        title: text(active_header.and_then(|v| v.get("title"))),
        subtitle: text(
            active_header
                .and_then(|v| v.get("subtitle"))
                .or_else(|| active_header.and_then(|v| v.get("straplineTextOne"))),
        ),
        thumbnail: thumbnail(
            active_header
                .and_then(|v| v.get("thumbnail"))
                .and_then(|v| v.get("musicThumbnailRenderer"))
                .and_then(|v| v.get("thumbnail")),
        ),
        items,
        continuation,
        browse_id: browse_id.map(str::to_owned),
    }
}

fn parse_playlist(response: &Value, playlist_id: &str) -> PlaylistPage {
    let base = response
        .get("contents")
        .and_then(|v| v.get("twoColumnBrowseResultsRenderer"))
        .and_then(|v| v.get("tabs"))
        .and_then(|v| v.get(0))
        .and_then(|v| v.get("tabRenderer"))
        .and_then(|v| v.get("content"))
        .and_then(|v| v.get("sectionListRenderer"))
        .and_then(|v| v.get("contents"))
        .and_then(|v| v.get(0));
    let header = base
        .and_then(|v| v.get("musicResponsiveHeaderRenderer"))
        .or_else(|| {
            base.and_then(|v| v.get("musicEditablePlaylistDetailHeaderRenderer"))
                .and_then(|v| v.get("header"))
                .and_then(|v| v.get("musicResponsiveHeaderRenderer"))
        });
    let playlist = YtItem {
        id: playlist_id.to_owned(),
        kind: "playlist".to_owned(),
        title: text(header.and_then(|v| v.get("title"))),
        subtitle: text(header.and_then(|v| v.get("secondSubtitle"))),
        thumbnail: thumbnail(
            header
                .and_then(|v| v.get("thumbnail"))
                .and_then(|v| v.get("musicThumbnailRenderer"))
                .and_then(|v| v.get("thumbnail")),
        ),
        artists: parse_artists(header.and_then(|v| v.get("straplineTextOne"))),
        browse_id: Some(playlist_id.to_owned()),
        playlist_id: Some(playlist_id.to_owned()),
        video_id: None,
        set_video_id: None,
        play_playlist_id: Some(playlist_id.to_owned()),
        play_video_id: None,
        params: None,
        explicit: false,
        music_video_type: None,
        history_remove_token: None,
        album_id: None,
        album_title: None,
    };
    let shelf = response
        .get("contents")
        .and_then(|v| v.get("twoColumnBrowseResultsRenderer"))
        .and_then(|v| v.get("secondaryContents"))
        .and_then(|v| v.get("sectionListRenderer"))
        .and_then(|v| v.get("contents"))
        .and_then(|v| v.get(0))
        .and_then(|v| v.get("musicPlaylistShelfRenderer"));
    let songs = shelf
        .and_then(|v| v.get("contents"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|content| content.get("musicResponsiveListItemRenderer"))
        .filter_map(parse_responsive_song)
        .collect();
    let continuation = shelf
        .and_then(|v| v.get("contents"))
        .and_then(|v| v.get("continuations"))
        .and_then(Value::as_array)
        .and_then(|v| v.first())
        .and_then(|v| v.get("nextContinuationData"))
        .and_then(|v| v.get("continuation"))
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| {
            shelf
                .and_then(|v| v.get("continuations"))
                .and_then(Value::as_array)
                .and_then(|v| v.first())
                .and_then(|v| v.get("nextContinuationData"))
                .and_then(|v| v.get("continuation"))
                .and_then(Value::as_str)
                .map(str::to_owned)
        });
    PlaylistPage {
        playlist,
        songs,
        continuation,
    }
}

fn parse_remote_history(response: &Value) -> RemoteHistoryPage {
    let section_list = response
        .get("contents")
        .and_then(|value| value.get("singleColumnBrowseResultsRenderer"))
        .and_then(|value| value.get("tabs"))
        .and_then(Value::as_array)
        .and_then(|tabs| tabs.first())
        .and_then(|tab| tab.get("tabRenderer"))
        .and_then(|tab| tab.get("content"))
        .and_then(|content| content.get("sectionListRenderer"));
    let sections = section_list
        .and_then(|value| value.get("contents"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|section| section.get("musicShelfRenderer"))
        .filter_map(|shelf| {
            let title = text(shelf.get("title"));
            if title.is_empty() {
                return None;
            }
            let songs = shelf
                .get("contents")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|content| content.get("musicResponsiveListItemRenderer"))
                .filter_map(parse_responsive_song)
                .collect::<Vec<_>>();
            if songs.is_empty() {
                None
            } else {
                Some(RemoteHistorySection { title, songs })
            }
        })
        .collect();
    RemoteHistoryPage { sections }
}

fn parse_library_playlists_page(response: &Value) -> (Vec<YtItem>, Option<String>) {
    let initial = response
        .get("contents")
        .and_then(|value| value.get("singleColumnBrowseResultsRenderer"))
        .and_then(|value| value.get("tabs"))
        .and_then(Value::as_array)
        .and_then(|tabs| tabs.first())
        .and_then(|tab| tab.get("tabRenderer"))
        .and_then(|tab| tab.get("content"))
        .and_then(|content| content.get("sectionListRenderer"))
        .and_then(|section| section.get("contents"))
        .and_then(Value::as_array)
        .and_then(|contents| contents.first());
    let parse_items = |values: Vec<&Value>| {
        values
            .into_iter()
            .filter_map(|value| {
                value
                    .get("musicTwoRowItemRenderer")
                    .and_then(parse_two_row)
                    .or_else(|| {
                        value
                            .get("musicResponsiveListItemRenderer")
                            .and_then(parse_responsive_typed)
                    })
            })
            .filter(|item| item.kind == "playlist")
            .collect::<Vec<_>>()
    };
    if let Some(grid) = initial.and_then(|value| value.get("gridRenderer")) {
        let items = parse_items(
            grid.get("items")
                .and_then(Value::as_array)
                .map(|values| values.iter().collect())
                .unwrap_or_default(),
        );
        let continuation = grid
            .get("continuations")
            .and_then(Value::as_array)
            .and_then(|values| values.first())
            .and_then(|value| value.get("nextContinuationData"))
            .and_then(|value| value.get("continuation"))
            .and_then(Value::as_str)
            .map(str::to_owned);
        return (items, continuation);
    }
    if let Some(shelf) = initial.and_then(|value| value.get("musicShelfRenderer")) {
        let items = parse_items(
            shelf
                .get("contents")
                .and_then(Value::as_array)
                .map(|values| values.iter().collect())
                .unwrap_or_default(),
        );
        let continuation = shelf
            .get("continuations")
            .and_then(Value::as_array)
            .and_then(|values| values.first())
            .and_then(|value| value.get("nextContinuationData"))
            .and_then(|value| value.get("continuation"))
            .and_then(Value::as_str)
            .map(str::to_owned);
        return (items, continuation);
    }
    if let Some(grid) = response
        .get("continuationContents")
        .and_then(|value| value.get("gridContinuation"))
    {
        let items = parse_items(
            grid.get("items")
                .and_then(Value::as_array)
                .map(|values| values.iter().collect())
                .unwrap_or_default(),
        );
        let continuation = grid
            .get("continuations")
            .and_then(Value::as_array)
            .and_then(|values| values.first())
            .and_then(|value| value.get("nextContinuationData"))
            .and_then(|value| value.get("continuation"))
            .and_then(Value::as_str)
            .map(str::to_owned);
        return (items, continuation);
    }
    (Vec::new(), None)
}

async fn fetch_all_library_playlists(session: &AuthSession) -> Result<Vec<YtItem>, String> {
    let mut response = post("browse", json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)), "browseId": "FEmusic_liked_playlists" }), Some(session)).await?;
    let mut playlists = Vec::new();
    let mut seen_ids = HashSet::new();
    let mut seen_continuations = HashSet::new();
    loop {
        let (page_items, continuation) = parse_library_playlists_page(&response);
        for item in page_items {
            let key = item.browse_id.clone().unwrap_or_else(|| item.id.clone());
            if seen_ids.insert(key) {
                playlists.push(item);
            }
        }
        let Some(token) = continuation else {
            break;
        };
        if !seen_continuations.insert(token.clone()) {
            break;
        }
        response = post("browse", json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)), "continuation": token }), Some(session)).await?;
    }
    Ok(playlists)
}

fn parse_library_page(response: &Value, tab_index: usize) -> (Vec<YtItem>, Option<String>) {
    let initial = response
        .get("contents")
        .and_then(|value| value.get("singleColumnBrowseResultsRenderer"))
        .and_then(|value| value.get("tabs"))
        .and_then(Value::as_array)
        .and_then(|tabs| tabs.get(tab_index))
        .and_then(|tab| tab.get("tabRenderer"))
        .and_then(|tab| tab.get("content"))
        .and_then(|content| content.get("sectionListRenderer"))
        .and_then(|section| section.get("contents"))
        .and_then(Value::as_array)
        .and_then(|contents| contents.first());
    if let Some(shelf) = initial.and_then(|value| value.get("musicShelfRenderer")) {
        let songs = shelf
            .get("contents")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|content| content.get("musicResponsiveListItemRenderer"))
            .filter_map(parse_responsive_song)
            .collect::<Vec<_>>();
        let continuation = shelf
            .get("continuations")
            .and_then(Value::as_array)
            .and_then(|values| values.first())
            .and_then(|value| value.get("nextContinuationData"))
            .and_then(|value| value.get("continuation"))
            .and_then(Value::as_str)
            .map(str::to_owned);
        return (songs, continuation);
    }
    if let Some(grid) = initial.and_then(|value| value.get("gridRenderer")) {
        let songs = grid
            .get("items")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|item| item.get("musicTwoRowItemRenderer"))
            .filter_map(parse_two_row)
            .filter(|item| item.kind == "song" && item.video_id.is_some())
            .collect::<Vec<_>>();
        let continuation = grid
            .get("continuations")
            .and_then(Value::as_array)
            .and_then(|values| values.first())
            .and_then(|value| value.get("nextContinuationData"))
            .and_then(|value| value.get("continuation"))
            .and_then(Value::as_str)
            .map(str::to_owned);
        return (songs, continuation);
    }
    if let Some(shelf) = response
        .get("continuationContents")
        .and_then(|value| value.get("musicShelfContinuation"))
    {
        let songs = shelf
            .get("contents")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|content| content.get("musicResponsiveListItemRenderer"))
            .filter_map(parse_responsive_song)
            .collect::<Vec<_>>();
        let continuation = shelf
            .get("continuations")
            .and_then(Value::as_array)
            .and_then(|values| values.first())
            .and_then(|value| value.get("nextContinuationData"))
            .and_then(|value| value.get("continuation"))
            .and_then(Value::as_str)
            .map(str::to_owned);
        return (songs, continuation);
    }
    if let Some(grid) = response
        .get("continuationContents")
        .and_then(|value| value.get("gridContinuation"))
    {
        let songs = grid
            .get("items")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|item| item.get("musicTwoRowItemRenderer"))
            .filter_map(parse_two_row)
            .filter(|item| item.kind == "song" && item.video_id.is_some())
            .collect::<Vec<_>>();
        let continuation = grid
            .get("continuations")
            .and_then(Value::as_array)
            .and_then(|values| values.first())
            .and_then(|value| value.get("nextContinuationData"))
            .and_then(|value| value.get("continuation"))
            .and_then(Value::as_str)
            .map(str::to_owned);
        return (songs, continuation);
    }
    (Vec::new(), None)
}

fn parse_library_items(response: &Value, tab_index: usize) -> (Vec<YtItem>, Option<String>) {
    let section_list = response
        .get("contents")
        .and_then(|value| value.get("singleColumnBrowseResultsRenderer"))
        .and_then(|value| value.get("tabs"))
        .and_then(Value::as_array)
        .and_then(|tabs| tabs.get(tab_index))
        .and_then(|tab| tab.get("tabRenderer"))
        .and_then(|tab| tab.get("content"))
        .and_then(|content| content.get("sectionListRenderer"));
    let mut items = Vec::new();
    let mut continuation = None;
    if let Some(contents) = section_list
        .and_then(|value| value.get("contents"))
        .and_then(Value::as_array)
    {
        for content in contents {
            if let Some(grid) = content.get("gridRenderer") {
                if let Some(values) = grid.get("items").and_then(Value::as_array) {
                    items.extend(
                        values
                            .iter()
                            .filter_map(|value| value.get("musicTwoRowItemRenderer"))
                            .filter_map(parse_two_row),
                    );
                }
                continuation = continuation.or_else(|| {
                    grid.get("continuations")
                        .and_then(Value::as_array)
                        .and_then(|values| values.first())
                        .and_then(|value| value.get("nextContinuationData"))
                        .and_then(|value| value.get("continuation"))
                        .and_then(Value::as_str)
                        .map(str::to_owned)
                });
            } else if let Some(shelf) = content.get("musicShelfRenderer") {
                if let Some(values) = shelf.get("contents").and_then(Value::as_array) {
                    items.extend(
                        values
                            .iter()
                            .filter_map(|value| value.get("musicResponsiveListItemRenderer"))
                            .filter_map(parse_responsive_typed),
                    );
                }
                continuation = continuation.or_else(|| {
                    shelf
                        .get("continuations")
                        .and_then(Value::as_array)
                        .and_then(|values| values.first())
                        .and_then(|value| value.get("nextContinuationData"))
                        .and_then(|value| value.get("continuation"))
                        .and_then(Value::as_str)
                        .map(str::to_owned)
                });
            }
        }
    }
    if let Some(grid) = response
        .get("continuationContents")
        .and_then(|value| value.get("gridContinuation"))
    {
        items.extend(
            grid.get("items")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|value| value.get("musicTwoRowItemRenderer"))
                .filter_map(parse_two_row),
        );
        continuation = grid
            .get("continuations")
            .and_then(Value::as_array)
            .and_then(|values| values.first())
            .and_then(|value| value.get("nextContinuationData"))
            .and_then(|value| value.get("continuation"))
            .and_then(Value::as_str)
            .map(str::to_owned);
    } else if let Some(shelf) = response
        .get("continuationContents")
        .and_then(|value| value.get("musicShelfContinuation"))
    {
        items.extend(
            shelf
                .get("contents")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|value| value.get("musicResponsiveListItemRenderer"))
                .filter_map(parse_responsive_typed),
        );
        continuation = shelf
            .get("continuations")
            .and_then(Value::as_array)
            .and_then(|values| values.first())
            .and_then(|value| value.get("nextContinuationData"))
            .and_then(|value| value.get("continuation"))
            .and_then(Value::as_str)
            .map(str::to_owned);
    }
    (items, continuation)
}

async fn fetch_all_library_items(
    session: &AuthSession,
    browse_id: &str,
    tab_index: usize,
) -> Result<Vec<YtItem>, String> {
    let mut response = post("browse", json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)), "browseId": browse_id }), Some(session)).await?;
    let mut items = Vec::new();
    let mut seen_ids = HashSet::new();
    let mut seen_continuations = HashSet::new();
    loop {
        let (page_items, continuation) = parse_library_items(&response, tab_index);
        for item in page_items {
            if seen_ids.insert(item.id.clone()) {
                items.push(item);
            }
        }
        let Some(token) = continuation else {
            break;
        };
        if !seen_continuations.insert(token.clone()) {
            break;
        }
        response = post("browse", json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)), "continuation": token }), Some(session)).await?;
    }
    Ok(items)
}

fn saved_episode_rows(db: &Connection) -> Result<Vec<YtItem>, String> {
    let mut statement = db.prepare("SELECT id, kind, title, subtitle, thumbnail, browse_id, playlist_id, video_id, set_video_id, explicit, music_video_type FROM songs WHERE in_library = 1 AND kind = 'episode' ORDER BY saved_at DESC").map_err(|error| format!("saved episode query failed: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(YtItem {
                id: row.get(0)?,
                kind: row.get(1)?,
                title: row.get(2)?,
                subtitle: row.get(3)?,
                thumbnail: row.get(4)?,
                artists: Vec::new(),
                browse_id: row.get(5)?,
                playlist_id: row.get(6)?,
                video_id: row.get(7)?,
                set_video_id: row.get(8)?,
                play_playlist_id: Some("SE".to_owned()),
                play_video_id: row.get(7)?,
                params: None,
                explicit: row.get::<_, i64>(9)? != 0,
                music_video_type: row.get(10)?,
                history_remove_token: None,
                album_id: None,
                album_title: None,
            })
        })
        .map_err(|error| format!("saved episode rows failed: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("saved episode row decode failed: {error}"))
}

// Not registered in generate_handler(), so unreachable from the webview - kept (not deleted) since
// the function body is otherwise untouched and easy to re-enable by re-registering it.
// Returns a flat list of every episode across all subscriptions; the UI instead browses episodes per-channel via ytm_podcast_channels + ytm_detail.
#[allow(dead_code)]
#[tauri::command]
async fn ytm_podcast_episodes(
    state: tauri::State<'_, RuntimeState>,
) -> Result<Vec<YtItem>, String> {
    let local = {
        let db = state
            .db
            .lock()
            .map_err(|_| "database state poisoned".to_owned())?;
        saved_episode_rows(&db)?
    };
    let Some(session) = auth_session(&state)? else {
        return Ok(local);
    };
    let remote = fetch_all_library_items(&session, "FEmusic_library_non_music_audio_list", 0)
        .await
        .unwrap_or_default()
        .into_iter()
        .filter(|item| item.kind == "episode")
        .collect::<Vec<_>>();
    if remote.is_empty() {
        return Ok(local);
    }
    let mut result = remote;
    for item in local {
        if !result
            .iter()
            .any(|existing| existing.id == item.id || existing.video_id == item.video_id)
        {
            result.push(item);
        }
    }
    Ok(result)
}

fn saved_podcast_rows(db: &Connection) -> Result<Vec<YtItem>, String> {
    let mut statement = db.prepare("SELECT id, title, COALESCE(author, ''), thumbnail FROM podcasts WHERE bookmarked_at IS NOT NULL ORDER BY bookmarked_at DESC, saved_at DESC").map_err(|error| format!("saved podcast query failed: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(YtItem {
                id: row.get(0)?,
                kind: "podcast".to_owned(),
                title: row.get(1)?,
                subtitle: row.get(2)?,
                thumbnail: row.get(3)?,
                artists: Vec::new(),
                browse_id: row.get(0)?,
                playlist_id: row.get(0)?,
                video_id: None,
                set_video_id: None,
                play_playlist_id: row.get(0)?,
                play_video_id: None,
                params: None,
                explicit: false,
                music_video_type: None,
                history_remove_token: None,
                album_id: None,
                album_title: None,
            })
        })
        .map_err(|error| format!("saved podcast rows failed: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("saved podcast row decode failed: {error}"))
}

async fn fetch_all_library_songs(
    session: &AuthSession,
    browse_id: &str,
    tab_index: Option<i32>,
) -> Result<Vec<YtItem>, String> {
    let tab_index = tab_index.unwrap_or(0).max(0) as usize;
    let mut response = post("browse", json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)), "browseId": browse_id }), Some(session)).await?;
    let mut songs = Vec::new();
    let mut seen_ids = HashSet::new();
    let mut seen_continuations = HashSet::new();
    loop {
        let (page_songs, continuation) = parse_library_page(&response, tab_index);
        for item in page_songs {
            if seen_ids.insert(item.id.clone()) {
                songs.push(item);
            }
        }
        let Some(token) = continuation else {
            break;
        };
        if !seen_continuations.insert(token.clone()) {
            break;
        }
        response = post("browse", json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)), "continuation": token }), Some(session)).await?;
    }
    Ok(songs)
}

async fn fetch_all_playlist_songs(
    session: &AuthSession,
    playlist_id: &str,
) -> Result<Vec<YtItem>, String> {
    let browse_id = format!("VL{playlist_id}");
    let mut response = post("browse", json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)), "browseId": browse_id }), Some(session)).await?;
    let mut songs = Vec::new();
    let mut seen_ids = HashSet::new();
    let mut seen_continuations = HashSet::new();
    let first_page = parse_playlist(&response, playlist_id);
    for item in first_page.songs {
        if seen_ids.insert(item.id.clone()) {
            songs.push(item);
        }
    }
    let mut continuation = first_page.continuation;
    while let Some(token) = continuation {
        if !seen_continuations.insert(token.clone()) {
            break;
        }
        response = post("browse", json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)), "continuation": token }), Some(session)).await?;
        let page = parse_playlist_continuation(&response);
        for item in page.songs {
            if seen_ids.insert(item.id.clone()) {
                songs.push(item);
            }
        }
        continuation = page.continuation;
    }
    Ok(songs)
}

fn upsert_catalog_mappings(
    db: &Connection,
    item: &YtItem,
    mode: &str,
    timestamp: i64,
) -> Result<(), String> {
    if let (Some(album_id), Some(album_title)) =
        (item.album_id.as_deref(), item.album_title.as_deref())
    {
        db.execute(
            "INSERT INTO albums (id, playlist_id, title, thumbnail, explicit, liked, in_library, uploaded, saved_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET playlist_id=excluded.playlist_id, title=excluded.title, thumbnail=excluded.thumbnail, explicit=excluded.explicit,
             liked=CASE WHEN ?6 = 1 THEN 1 ELSE albums.liked END, in_library=CASE WHEN ?7 = 1 THEN 1 ELSE albums.in_library END,
             uploaded=CASE WHEN ?8 = 1 THEN 1 ELSE albums.uploaded END, saved_at=excluded.saved_at",
            params![album_id, item.playlist_id, album_title, item.thumbnail, if item.explicit { 1 } else { 0 }, if mode == "liked" { 1 } else { 0 }, if mode == "library" { 1 } else { 0 }, if mode == "uploaded" { 1 } else { 0 }, timestamp],
        ).map_err(|error| format!("album sync write failed: {error}"))?;
        db.execute(
            "INSERT OR IGNORE INTO song_albums (song_id, album_id) VALUES (?1, ?2)",
            params![item.id, album_id],
        )
        .map_err(|error| format!("song album sync mapping failed: {error}"))?;
    }
    for (position, artist) in item.artists.iter().enumerate() {
        let Some(artist_id) = artist.id.as_deref().filter(|value| !value.is_empty()) else {
            continue;
        };
        db.execute("INSERT INTO artists (id, name, saved_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET name=excluded.name, saved_at=excluded.saved_at", params![artist_id, artist.name, timestamp]).map_err(|error| format!("artist sync write failed: {error}"))?;
        db.execute(
            "INSERT OR IGNORE INTO song_artists (song_id, artist_id, position) VALUES (?1, ?2, ?3)",
            params![item.id, artist_id, position as i64],
        )
        .map_err(|error| format!("song artist sync mapping failed: {error}"))?;
    }
    Ok(())
}

fn upsert_synced_song(
    db: &Connection,
    item: &YtItem,
    mode: &str,
    timestamp: i64,
) -> Result<(), String> {
    let is_video = item
        .music_video_type
        .as_deref()
        .is_some_and(|value| value != "MUSIC_VIDEO_TYPE_ATV");
    let result = if mode == "liked" {
        db.execute(
            "INSERT INTO songs (id, title, subtitle, thumbnail, browse_id, playlist_id, video_id, set_video_id, kind, saved_at, explicit, music_video_type, liked, liked_date, in_library, is_video, youtube_liked)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 1, ?13, 0, ?14, 1)
             ON CONFLICT(id) DO UPDATE SET title=excluded.title, subtitle=excluded.subtitle, thumbnail=excluded.thumbnail, browse_id=excluded.browse_id, playlist_id=excluded.playlist_id, video_id=excluded.video_id, set_video_id=excluded.set_video_id, kind=excluded.kind, explicit=excluded.explicit, music_video_type=excluded.music_video_type, liked=1, liked_date=excluded.liked_date, youtube_liked=1, is_video=excluded.is_video",
            params![item.id, item.title, item.subtitle, item.thumbnail, item.browse_id, item.playlist_id, item.video_id, item.set_video_id, item.kind, timestamp, if item.explicit { 1 } else { 0 }, item.music_video_type, timestamp, if is_video { 1 } else { 0 }],
        )
    } else if mode == "uploaded" {
        db.execute(
            "INSERT INTO songs (id, title, subtitle, thumbnail, browse_id, playlist_id, video_id, set_video_id, kind, saved_at, explicit, music_video_type, liked, liked_date, in_library, is_video, uploaded)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, NULL, 0, ?13, 1)
             ON CONFLICT(id) DO UPDATE SET title=excluded.title, subtitle=excluded.subtitle, thumbnail=excluded.thumbnail, browse_id=excluded.browse_id, playlist_id=excluded.playlist_id, video_id=excluded.video_id, set_video_id=excluded.set_video_id, kind=excluded.kind, explicit=excluded.explicit, music_video_type=excluded.music_video_type, uploaded=1, is_video=excluded.is_video",
            params![item.id, item.title, item.subtitle, item.thumbnail, item.browse_id, item.playlist_id, item.video_id, item.set_video_id, item.kind, timestamp, if item.explicit { 1 } else { 0 }, item.music_video_type, if is_video { 1 } else { 0 }],
        )
    } else {
        db.execute(
            "INSERT INTO songs (id, title, subtitle, thumbnail, browse_id, playlist_id, video_id, set_video_id, kind, saved_at, explicit, music_video_type, liked, liked_date, in_library, is_video)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, NULL, 1, ?13)
             ON CONFLICT(id) DO UPDATE SET title=excluded.title, subtitle=excluded.subtitle, thumbnail=excluded.thumbnail, browse_id=excluded.browse_id, playlist_id=excluded.playlist_id, video_id=excluded.video_id, set_video_id=excluded.set_video_id, kind=excluded.kind, explicit=excluded.explicit, music_video_type=excluded.music_video_type, in_library=1, is_video=excluded.is_video",
            params![item.id, item.title, item.subtitle, item.thumbnail, item.browse_id, item.playlist_id, item.video_id, item.set_video_id, item.kind, timestamp, if item.explicit { 1 } else { 0 }, item.music_video_type, if is_video { 1 } else { 0 }],
        )
    };
    result.map_err(|error| format!("YouTube library sync write failed: {error}"))?;
    upsert_catalog_mappings(db, item, mode, timestamp)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct YouTubeSyncResult {
    liked_songs: usize,
    library_songs: usize,
    uploaded_songs: usize,
    playlists: usize,
}

/// Applies a fetched YouTube snapshot to the local database. Split out of `sync_youtube_library` so it can be tested.
/// Safety rules: (1) never wipe existing synced rows when YouTube returned nothing (a changed response layout makes the
/// parsers return an empty list, which used to erase the local library); (2) only reset likes that came from YouTube,
/// so local-only likes survive a sync.
fn apply_youtube_sync(
    db: &mut Connection,
    mode: &str,
    liked_songs: &[YtItem],
    library_songs: &[YtItem],
    uploaded_songs: &[YtItem],
    playlists: &[YtItem],
    timestamp: i64,
) -> Result<(), String> {
    let fetched = match mode {
        "liked" => liked_songs.len(),
        "library" => library_songs.len(),
        "uploaded" => uploaded_songs.len(),
        _ => playlists.len(),
    };
    if fetched == 0 {
        let existing_sql = match mode {
            "liked" => "SELECT COUNT(*) FROM songs WHERE youtube_liked = 1",
            "library" => "SELECT COUNT(*) FROM songs WHERE in_library = 1",
            "uploaded" => "SELECT COUNT(*) FROM songs WHERE uploaded = 1",
            _ => "SELECT COUNT(*) FROM playlists WHERE source = 'youtube'",
        };
        let existing: i64 = db
            .query_row(existing_sql, [], |row| row.get(0))
            .map_err(|error| format!("YouTube library sync safety check failed: {error}"))?;
        if existing > 0 {
            return Err(format!(
                "YouTube Music returned no {mode} items; local data was left unchanged"
            ));
        }
    }
    let tx = db
        .transaction()
        .map_err(|error| format!("YouTube library sync transaction failed: {error}"))?;
    if mode == "liked" {
        tx.execute(
            "UPDATE songs SET liked = 0, liked_date = NULL WHERE liked = 1 AND youtube_liked = 1",
            [],
        )
        .map_err(|error| format!("liked state reset failed: {error}"))?;
        tx.execute("UPDATE albums SET liked = 0 WHERE liked = 1", [])
            .map_err(|error| format!("liked album state reset failed: {error}"))?;
        for (index, item) in liked_songs.iter().enumerate() {
            upsert_synced_song(&tx, item, "liked", timestamp - index as i64)?;
        }
    } else if mode == "library" {
        tx.execute("UPDATE songs SET in_library = 0 WHERE in_library = 1", [])
            .map_err(|error| format!("library state reset failed: {error}"))?;
        tx.execute("UPDATE albums SET in_library = 0 WHERE in_library = 1", [])
            .map_err(|error| format!("library album state reset failed: {error}"))?;
        for (index, item) in library_songs.iter().enumerate() {
            upsert_synced_song(&tx, item, "library", timestamp - index as i64)?;
        }
    } else if mode == "uploaded" {
        tx.execute("UPDATE songs SET uploaded = 0 WHERE uploaded = 1", [])
            .map_err(|error| format!("uploaded state reset failed: {error}"))?;
        tx.execute("UPDATE albums SET uploaded = 0 WHERE uploaded = 1", [])
            .map_err(|error| format!("uploaded album state reset failed: {error}"))?;
        for (index, item) in uploaded_songs.iter().enumerate() {
            upsert_synced_song(&tx, item, "uploaded", timestamp - index as i64)?;
        }
    } else {
        tx.execute("DELETE FROM playlists WHERE source = 'youtube'", [])
            .map_err(|error| format!("YouTube playlist reset failed: {error}"))?;
        for (index, item) in playlists.iter().enumerate() {
            let id = item.browse_id.clone().unwrap_or_else(|| item.id.clone());
            tx.execute("INSERT INTO playlists (id, title, subtitle, thumbnail, kind, saved_at, source) VALUES (?1, ?2, ?3, ?4, 'playlist', ?5, 'youtube') ON CONFLICT(id) DO UPDATE SET title=excluded.title, subtitle=excluded.subtitle, thumbnail=excluded.thumbnail, saved_at=excluded.saved_at, source='youtube'", params![id, item.title, item.subtitle, item.thumbnail, timestamp - index as i64]).map_err(|error| format!("YouTube playlist sync write failed: {error}"))?;
        }
    }
    tx.commit()
        .map_err(|error| format!("YouTube library sync commit failed: {error}"))?;
    Ok(())
}

const HOME_CACHE_SETTING: &str = "cached_home_page";

fn cached_home(state: &tauri::State<'_, RuntimeState>) -> Option<HomePage> {
    let db = state.db.lock().ok()?;
    let value = db
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![HOME_CACHE_SETTING],
            |row| row.get::<_, String>(0),
        )
        .ok()?;
    serde_json::from_str::<HomePage>(&value).ok()
}

fn save_home_cache(state: &tauri::State<'_, RuntimeState>, page: &HomePage) {
    let Ok(value) = serde_json::to_string(page) else {
        return;
    };
    let Ok(db) = state.db.lock() else {
        return;
    };
    let _ = db.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![HOME_CACHE_SETTING, value],
    );
}

fn parse_playlist_continuation(response: &Value) -> PlaylistContinuationPage {
    let mut values: Vec<&Value> = Vec::new();
    if let Some(contents) = response
        .get("continuationContents")
        .and_then(|v| v.get("sectionListContinuation"))
        .and_then(|v| v.get("contents"))
        .and_then(Value::as_array)
    {
        for content in contents {
            if let Some(items) = content
                .get("musicPlaylistShelfRenderer")
                .and_then(|v| v.get("contents"))
                .and_then(Value::as_array)
            {
                values.extend(items);
            }
        }
    }
    if let Some(items) = response
        .get("continuationContents")
        .and_then(|v| v.get("musicPlaylistShelfContinuation"))
        .and_then(|v| v.get("contents"))
        .and_then(Value::as_array)
    {
        values.extend(items);
    }
    if let Some(items) = response
        .get("onResponseReceivedActions")
        .and_then(Value::as_array)
        .and_then(|v| v.first())
        .and_then(|v| v.get("appendContinuationItemsAction"))
        .and_then(|v| v.get("continuationItems"))
        .and_then(Value::as_array)
    {
        values.extend(items);
    }
    let songs = values
        .into_iter()
        .filter_map(|content| content.get("musicResponsiveListItemRenderer"))
        .filter_map(parse_responsive_song)
        .collect::<Vec<_>>();
    let continuation = response
        .get("continuationContents")
        .and_then(|v| v.get("sectionListContinuation"))
        .and_then(|v| v.get("continuations"))
        .and_then(Value::as_array)
        .and_then(|v| v.first())
        .and_then(|v| v.get("nextContinuationData"))
        .and_then(|v| v.get("continuation"))
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| {
            response
                .get("continuationContents")
                .and_then(|v| v.get("musicPlaylistShelfContinuation"))
                .and_then(|v| v.get("continuations"))
                .and_then(Value::as_array)
                .and_then(|v| v.first())
                .and_then(|v| v.get("nextContinuationData"))
                .and_then(|v| v.get("continuation"))
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .or_else(|| {
            response
                .get("continuationContents")
                .and_then(|v| v.get("musicShelfContinuation"))
                .and_then(|v| v.get("continuations"))
                .and_then(Value::as_array)
                .and_then(|v| v.first())
                .and_then(|v| v.get("nextContinuationData"))
                .and_then(|v| v.get("continuation"))
                .and_then(Value::as_str)
                .map(str::to_owned)
        });
    PlaylistContinuationPage {
        songs,
        continuation,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LrcLibTrack {
    track_name: String,
    artist_name: String,
    duration: f64,
    plain_lyrics: Option<String>,
    synced_lyrics: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LyricLine {
    time_ms: i64,
    text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LyricsPayload {
    provider: String,
    text: String,
    synced: bool,
    matched_title: String,
    matched_artist: String,
    lines: Vec<LyricLine>,
}

#[derive(Debug, Deserialize)]
struct BetterLyricsResponse {
    ttml: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LyricsPlusLine {
    time: i64,
    text: String,
}

#[derive(Debug, Deserialize)]
struct LyricsPlusResponse {
    lyrics: Option<Vec<LyricsPlusLine>>,
}

fn filter_lyrics_credit_lines(value: &str) -> String {
    let timestamp = Regex::new(r"^\[\d\d:\d\d\.\d{2,3}\]").ok();
    let agent = Regex::new(r"^\{agent:[^}]+\}").ok();
    let background = Regex::new(r"^\{bg\}").ok();
    let background_bracket = Regex::new(r"^\[bg:.*\]").ok();
    let version = Regex::new(r"^v\d+:").ok();
    value
        .lines()
        .filter(|line| {
            let mut text = line.trim().to_owned();
            loop {
                let before = text.clone();
                for regex in [
                    &timestamp,
                    &agent,
                    &background,
                    &background_bracket,
                    &version,
                ]
                .into_iter()
                .flatten()
                {
                    text = regex.replace(&text, "").trim().to_owned();
                }
                if text == before {
                    break;
                }
            }
            let lower = text.to_lowercase();
            !(lower.starts_with("synced by")
                || lower.starts_with("lyrics by")
                || lower.starts_with("music by")
                || lower.starts_with("arranged by")
                || (lower.starts_with('[')
                    && lower.ends_with(']')
                    && lower.len() < 40
                    && lower.contains("synced by")))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn parse_lyric_lines(value: &str) -> Vec<LyricLine> {
    let mut lines = Vec::new();
    for raw in value.lines() {
        let mut rest = raw;
        let mut timestamps = Vec::new();
        while let Some(end) = rest.find(']') {
            if !rest.starts_with('[') {
                break;
            }
            let stamp = &rest[1..end];
            let mut parts = stamp.split(':');
            let minutes = parts.next().and_then(|v| v.parse::<i64>().ok());
            let seconds = parts
                .next()
                .and_then(|v| v.replace(',', ".").parse::<f64>().ok());
            if let (Some(minutes), Some(seconds)) = (minutes, seconds) {
                timestamps.push((minutes as f64 * 60_000.0 + seconds * 1_000.0) as i64);
            }
            rest = &rest[end + 1..];
        }
        let text = rest.trim().to_owned();
        if text.is_empty() {
            continue;
        }
        for time_ms in timestamps {
            lines.push(LyricLine {
                time_ms,
                text: text.clone(),
            });
        }
    }
    lines.sort_by_key(|line| line.time_ms);
    lines
}

fn parse_provider_time(value: &str) -> Option<i64> {
    let value = value.trim();
    if let Some(seconds) = value.strip_suffix("ms") {
        return seconds.parse::<f64>().ok().map(|v| v.round() as i64);
    }
    if let Some(seconds) = value.strip_suffix('s') {
        return seconds
            .parse::<f64>()
            .ok()
            .map(|v| (v * 1000.0).round() as i64);
    }
    let mut parts = value.split(':').collect::<Vec<_>>();
    if parts.len() == 3 {
        let hours = parts.remove(0).parse::<f64>().ok()?;
        let minutes = parts.remove(0).parse::<f64>().ok()?;
        let seconds = parts.remove(0).parse::<f64>().ok()?;
        return Some(((hours * 3600.0 + minutes * 60.0 + seconds) * 1000.0).round() as i64);
    }
    if parts.len() == 2 {
        let minutes = parts[0].parse::<f64>().ok()?;
        let seconds = parts[1].parse::<f64>().ok()?;
        return Some(((minutes * 60.0 + seconds) * 1000.0).round() as i64);
    }
    None
}

fn decode_basic_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

fn betterlyrics_to_lrc(ttml: &str) -> Option<String> {
    let paragraph =
        Regex::new(r#"(?is)<p\b[^>]*\bbegin=['\"]([^'\"]+)['\"][^>]*>(.*?)</p>"#).ok()?;
    let tags = Regex::new(r"(?is)<[^>]+>").ok()?;
    let mut lines = Vec::new();
    for capture in paragraph.captures_iter(ttml) {
        let time = parse_provider_time(capture.get(1)?.as_str())?;
        let text = decode_basic_entities(tags.replace_all(capture.get(2)?.as_str(), "").trim())
            .trim()
            .to_owned();
        if !text.is_empty() {
            lines.push((time, text));
        }
    }
    if lines.is_empty() {
        return None;
    }
    lines.sort_by_key(|line| line.0);
    Some(
        lines
            .into_iter()
            .map(|(time, text)| {
                format!(
                    "[{:02}:{:05.2}]{}",
                    time / 60_000,
                    (time % 60_000) as f64 / 1000.0,
                    text
                )
            })
            .collect::<Vec<_>>()
            .join("\n"),
    )
}

async fn provider_json<T: DeserializeOwned>(request: reqwest::RequestBuilder) -> Option<T> {
    let response = timeout(Duration::from_secs(15), request.send())
        .await
        .ok()?
        .ok()?
        .error_for_status()
        .ok()?;
    response.json::<T>().await.ok()
}

fn paxsenix_clean_title(value: &str) -> String {
    let patterns = [
        r#"\s*\(.*?(official|video|audio|lyrics|lyric|visualizer|hd|hq|4k|remaster|remix|live|acoustic|version|edit|extended|radio|clean|explicit).*?\)"#,
        r#"\s*\[.*?(official|video|audio|lyrics|lyric|visualizer|hd|hq|4k|remaster|remix|live|acoustic|version|edit|extended|radio|clean|explicit).*?\]"#,
        r#"\s*【.*?】"#,
        r"\s*\|.*$",
        r#"\s*-\s*(official|video|audio|lyrics|lyric|visualizer).*$"#,
        r#"\s*\(feat\..*?\)"#,
        r#"\s*\(ft\..*?\)"#,
        r"\s*feat\..*$",
        r"\s*ft\..*$",
        r#"\s*\([^)]*\d{4}[^)]*\)"#,
    ];
    patterns
        .iter()
        .fold(value.trim().to_owned(), |current, pattern| {
            Regex::new(&format!("(?i){pattern}"))
                .map(|regex| regex.replace(&current, "").into_owned())
                .unwrap_or(current)
        })
        .trim()
        .to_owned()
}

fn paxsenix_clean_artist(value: &str) -> String {
    clean_lyrics_artist(value)
}

fn paxsenix_content_to_lrc(content: &Value) -> Option<String> {
    let entries = content.as_array()?;
    let lines = entries
        .iter()
        .filter_map(|entry| {
            let timestamp = entry.get("timestamp").and_then(Value::as_i64)?;
            let words = entry
                .get("text")
                .and_then(Value::as_array)
                .map(|values| {
                    values
                        .iter()
                        .filter_map(|word| word.get("text").and_then(Value::as_str))
                        .collect::<Vec<_>>()
                        .join(" ")
                })
                .unwrap_or_default();
            let text = if words.trim().is_empty() {
                entry
                    .get("line")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_owned()
            } else {
                words
            };
            (!text.trim().is_empty()).then(|| {
                format!(
                    "[{:02}:{:05.2}]{}",
                    timestamp / 60_000,
                    (timestamp % 60_000) as f64 / 1000.0,
                    text.trim()
                )
            })
        })
        .collect::<Vec<_>>();
    (!lines.is_empty()).then(|| lines.join("\n"))
}

async fn paxsenix_fetch(
    title: &str,
    artist: &str,
    duration: i32,
    album: Option<&str>,
) -> Option<String> {
    let cleaned_title = paxsenix_clean_title(title);
    let cleaned_artist = paxsenix_clean_artist(artist);
    let mut queries = vec![
        format!("{cleaned_title} {cleaned_artist}"),
        cleaned_title.clone(),
    ];
    if let Some(album) = album.filter(|value| !value.trim().is_empty()) {
        queries.push(format!("{cleaned_title} {cleaned_artist} {album}"));
    }
    let duration_ms = if duration > 0 {
        i64::from(duration) * 1000
    } else {
        -1
    };
    let mut scored: Vec<(Value, f64)> = Vec::new();
    for query in queries {
        if !scored.is_empty() {
            break;
        }
        let Some(response) = provider_json::<Value>(
            http()
                .get("https://lyrics.paxsenix.org/apple-music/search")
                .query(&[("q", query.as_str())])
                .header("User-Agent", "Meld/0.1"),
        )
        .await
        else {
            continue;
        };
        let Some(results) = response.as_array() else {
            continue;
        };
        scored = results
            .iter()
            .filter_map(|item| {
                let result_title = item
                    .get("trackName")
                    .or_else(|| item.get("songName"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let result_artist = item.get("artistName").and_then(Value::as_str).unwrap_or("");
                let mut score = (lyrics_similarity(
                    &paxsenix_clean_title(title),
                    &paxsenix_clean_title(result_title),
                ) * 80.0)
                    + (lyrics_similarity(&cleaned_artist, &paxsenix_clean_artist(result_artist))
                        * 50.0);
                if let Some(result_duration) = item.get("duration").and_then(Value::as_i64) {
                    if duration_ms > 0 {
                        let diff = (result_duration - duration_ms).abs();
                        score += if diff <= 2_000 {
                            100.0
                        } else if diff <= 5_000 {
                            50.0
                        } else if diff <= 10_000 {
                            10.0
                        } else {
                            -50.0
                        };
                    }
                }
                (score > 0.0).then(|| (item.clone(), score))
            })
            .collect();
        scored.sort_by(|left, right| {
            right
                .1
                .partial_cmp(&left.1)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        scored.truncate(10);
    }
    for (item, _) in scored.iter().take(3) {
        let id = item.get("id").and_then(Value::as_str)?;
        let Some(response) = provider_json::<Value>(
            http()
                .get("https://lyrics.paxsenix.org/apple-music/lyrics")
                .query(&[("id", id)])
                .header("User-Agent", "Meld/0.1"),
        )
        .await
        else {
            continue;
        };
        if let Some(ttml) = response
            .get("ttmlContent")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
        {
            if let Some(lrc) = betterlyrics_to_lrc(ttml) {
                if !lrc.is_empty() {
                    return Some(lrc);
                }
            }
        }
        for key in ["elrcMultiPerson", "elrc", "plain"] {
            if let Some(text) = response
                .get(key)
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
            {
                return Some(text.to_owned());
            }
        }
        if let Some(lrc) = response.get("content").and_then(paxsenix_content_to_lrc) {
            return Some(lrc);
        }
    }
    None
}

async fn betterlyrics_fetch(
    title: &str,
    artist: &str,
    duration: i32,
    album: Option<&str>,
) -> Option<String> {
    let mut request = http()
        .get("https://lyrics-api.boidu.dev/getLyrics")
        .query(&[("s", title), ("a", artist)]);
    if duration > 0 {
        let duration_value = duration.to_string();
        request = request.query(&[("d", duration_value.as_str())]);
    }
    if let Some(album) = album.filter(|value| !value.is_empty()) {
        request = request.query(&[("al", album)]);
    }
    let response: BetterLyricsResponse = provider_json(request).await?;
    betterlyrics_to_lrc(response.ttml?.as_str())
}

async fn youtube_subtitle_fetch(video_id: &str) -> Option<String> {
    let params = BASE64.encode(format!("\n{}{}", 11u8 as char, video_id));
    let body = json!({ "context": { "client": { "clientName": "WEB", "clientVersion": "2.20260213.00.00", "clientScreen": "WATCH", "hl": "en", "gl": "US" } }, "params": params });
    let response: Value = provider_json(
        http()
            .post(format!("{API_BASE}get_transcript?key={YOUTUBE_API_KEY}"))
            .json(&body),
    )
    .await?;
    let groups = response.pointer("/actions/0/updateEngagementPanelAction/content/transcriptRenderer/body/transcriptBodyRenderer/cueGroups").and_then(Value::as_array)?;
    let mut lines = Vec::new();
    for group in groups {
        let cue = group
            .get("transcriptCueGroupRenderer")
            .and_then(|value| value.get("cues"))
            .and_then(Value::as_array)
            .and_then(|values| values.first())
            .and_then(|value| value.get("transcriptCueRenderer"))?;
        let time = cue.get("startOffsetMs").and_then(Value::as_i64)?;
        let text = cue
            .get("cue")
            .and_then(|value| value.get("simpleText"))
            .and_then(Value::as_str)?
            .trim()
            .trim_matches('♪')
            .trim()
            .to_owned();
        if !text.is_empty() {
            lines.push(format!(
                "[{:02}:{:02}.{:03}]{}",
                time / 60_000,
                (time / 1_000) % 60,
                time % 1_000,
                text
            ));
        }
    }
    (!lines.is_empty()).then(|| lines.join("\n"))
}

async fn youtube_plain_lyrics_fetch(
    video_id: &str,
    state: &tauri::State<'_, RuntimeState>,
) -> Option<String> {
    let visitor_data = visitor(state).await.ok()?;
    let session = auth_session(state).ok().flatten();
    let data_sync_id = session.as_ref().map(|value| value.data_sync_id.as_str());
    let response = post("next", json!({ "context": context(&visitor_data, session.is_some(), data_sync_id), "videoId": video_id }), session.as_ref()).await.ok()?;
    let endpoint = response.pointer("/contents/singleColumnMusicWatchNextResultsRenderer/tabbedRenderer/watchNextTabbedResultsRenderer/tabs/1/tabRenderer/endpoint/browseEndpoint")?;
    let browse_id = endpoint.get("browseId").and_then(Value::as_str)?.trim();
    if browse_id.is_empty() {
        return None;
    }
    let params = endpoint.get("params").and_then(Value::as_str);
    let mut body = json!({ "context": context(&visitor_data, session.is_some(), data_sync_id), "browseId": browse_id });
    if let Some(params) = params {
        body["params"] = Value::String(params.to_owned());
    }
    let browse = post("browse", body, session.as_ref()).await.ok()?;
    let sections = browse
        .pointer("/contents/sectionListRenderer/contents")?
        .as_array()?;
    for section in sections {
        let Some(description) = section
            .get("musicDescriptionShelfRenderer")
            .and_then(|value| value.get("description"))
        else {
            continue;
        };
        let Some(runs) = description.get("runs").and_then(Value::as_array) else {
            continue;
        };
        let text = runs
            .iter()
            .filter_map(|run| run.get("text").and_then(Value::as_str))
            .collect::<String>();
        if !text.trim().is_empty() {
            return Some(text);
        }
    }
    None
}

fn kugou_keyword(title: &str, artist: &str, album: Option<&str>) -> String {
    let title = Regex::new(r#"[（(].*?[）)]|「.*?」|『.*?』|<.*?>|《.*?》|〈.*?〉|＜.*?＞"#)
        .map(|regex| regex.replace_all(title, "").into_owned())
        .unwrap_or_else(|_| title.to_owned());
    let artist = Regex::new(r#"[（(].*?[）)]"#)
        .map(|regex| regex.replace_all(artist, "").into_owned())
        .unwrap_or_else(|_| artist.to_owned())
        .replace(", ", "、")
        .replace(" & ", "、")
        .replace('.', "");
    let mut keyword = format!("{} - {}", title.trim(), artist.trim());
    if let Some(album) = album.filter(|value| !value.trim().is_empty()) {
        keyword.push(' ');
        keyword.push_str(album.trim());
    }
    keyword
}

fn kugou_normalize_lrc(value: &str) -> String {
    let accepted = Regex::new(r"^\[\d\d:\d\d\.\d{2,3}\].*").ok();
    let banned = Regex::new(r".+].+[:：].+").ok();
    let lines = value
        .lines()
        .filter(|line| accepted.as_ref().is_some_and(|regex| regex.is_match(line)))
        .collect::<Vec<_>>();
    if lines.is_empty() {
        return String::new();
    }
    let mut head = 0usize;
    for index in (0..lines.len().min(30)).rev() {
        if banned
            .as_ref()
            .is_some_and(|regex| regex.is_match(lines[index]))
        {
            head = index + 1;
            break;
        }
    }
    let filtered = &lines[head..];
    let mut tail = 0usize;
    for index in (0..filtered.len().min(30)).rev() {
        if banned
            .as_ref()
            .is_some_and(|regex| regex.is_match(filtered[filtered.len() - 1 - index]))
        {
            tail = index + 1;
            break;
        }
    }
    filtered[..filtered.len().saturating_sub(tail)].join("\n")
}

async fn kugou_fetch(
    title: &str,
    artist: &str,
    duration: i32,
    album: Option<&str>,
) -> Option<String> {
    let keyword = kugou_keyword(title, artist, album);
    let song_response: Value = provider_json(
        http()
            .get("https://mobileservice.kugou.com/api/v3/search/song")
            .query(&[
                ("version", "9108"),
                ("plat", "0"),
                ("pagesize", "8"),
                ("showtype", "0"),
                ("keyword", keyword.as_str()),
            ]),
    )
    .await?;
    let songs = song_response
        .pointer("/data/info")
        .and_then(Value::as_array)?;
    for song in songs {
        let song_duration = song.get("duration").and_then(Value::as_i64).unwrap_or(-1);
        let hash = song.get("hash").and_then(Value::as_str).unwrap_or("");
        if hash.is_empty() || (duration >= 0 && (song_duration - i64::from(duration)).abs() > 8) {
            continue;
        }
        let response: Value =
            provider_json(http().get("https://lyrics.kugou.com/search").query(&[
                ("ver", "1"),
                ("man", "yes"),
                ("client", "pc"),
                ("hash", hash),
            ]))
            .await?;
        let candidate = response
            .get("candidates")
            .and_then(Value::as_array)
            .and_then(|values| values.first());
        let Some(candidate) = candidate else {
            continue;
        };
        let id = candidate.get("id").and_then(Value::as_i64).unwrap_or(0);
        let access_key = candidate
            .get("accesskey")
            .and_then(Value::as_str)
            .unwrap_or("");
        if id == 0 || access_key.is_empty() {
            continue;
        }
        let id_value = id.to_string();
        let download: Value =
            provider_json(http().get("https://lyrics.kugou.com/download").query(&[
                ("fmt", "lrc"),
                ("charset", "utf8"),
                ("client", "pc"),
                ("ver", "1"),
                ("id", id_value.as_str()),
                ("accesskey", access_key),
            ]))
            .await?;
        let content = download.get("content").and_then(Value::as_str)?;
        let decoded = BASE64.decode(content).ok()?;
        let normalized = kugou_normalize_lrc(&String::from_utf8_lossy(&decoded));
        if !normalized.is_empty() {
            return Some(normalized);
        }
    }
    let mut request = http().get("https://lyrics.kugou.com/search").query(&[
        ("ver", "1"),
        ("man", "yes"),
        ("client", "pc"),
        ("keyword", keyword.as_str()),
    ]);
    if duration >= 0 {
        let duration_ms = duration.saturating_mul(1000).to_string();
        request = request.query(&[("duration", duration_ms.as_str())]);
    }
    let response: Value = provider_json(request).await?;
    let candidate = response
        .get("candidates")
        .and_then(Value::as_array)
        .and_then(|values| values.first())?;
    let id = candidate.get("id").and_then(Value::as_i64)?;
    let access_key = candidate.get("accesskey").and_then(Value::as_str)?;
    let id_value = id.to_string();
    let download: Value = provider_json(http().get("https://lyrics.kugou.com/download").query(&[
        ("fmt", "lrc"),
        ("charset", "utf8"),
        ("client", "pc"),
        ("ver", "1"),
        ("id", id_value.as_str()),
        ("accesskey", access_key),
    ]))
    .await?;
    let content = download.get("content").and_then(Value::as_str)?;
    let decoded = BASE64.decode(content).ok()?;
    let normalized = kugou_normalize_lrc(&String::from_utf8_lossy(&decoded));
    (!normalized.is_empty()).then_some(normalized)
}

async fn musixmatch_token() -> Option<String> {
    let cache = MUSIXMATCH_TOKEN.get_or_init(|| Mutex::new(None));
    if let Ok(value) = cache.lock() {
        if let Some(token) = value.clone() {
            return Some(token);
        }
    }
    let response: Value = provider_json(
        http()
            .get("https://apic-desktop.musixmatch.com/ws/1.1/token.get")
            .query(&[("app_id", "web-desktop-app-v1.0"), ("format", "json")])
            .header(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            )
            .header("Cookie", "AWSELB=0; AWSELBCORS=0"),
    )
    .await?;
    let message = response.get("message")?;
    if message
        .pointer("/header/status_code")
        .and_then(Value::as_i64)
        != Some(200)
    {
        return None;
    }
    let token = message
        .pointer("/body/user_token")
        .and_then(Value::as_str)
        .filter(|value| {
            !value.is_empty() && *value != "UpgradeOnlyUpgradeOnlyUpgradeOnlyUpgradeOnly"
        })?
        .to_owned();
    if let Ok(mut value) = cache.lock() {
        *value = Some(token.clone());
    }
    Some(token)
}

async fn musixmatch_fetch(
    title: &str,
    artist: &str,
    duration: i32,
    album: Option<&str>,
) -> Option<(String, bool)> {
    let token = musixmatch_token().await?;
    let duration_seconds = if duration > 0 { duration } else { -1 };
    let mut request = http()
        .get("https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get")
        .query(&[
            ("format", "json"),
            ("namespace", "lyrics_richsynced"),
            ("subtitle_format", "lrc"),
            ("app_id", "web-desktop-app-v1.0"),
            ("usertoken", token.as_str()),
            ("q_track", title),
            ("q_artist", artist),
        ])
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        )
        .header("Cookie", "AWSELB=0; AWSELBCORS=0");
    if let Some(album) = album.filter(|value| !value.is_empty()) {
        request = request.query(&[("q_album", album)]);
    }
    if duration_seconds > 0 {
        let seconds = duration_seconds.to_string();
        request = request.query(&[
            ("q_duration", seconds.as_str()),
            ("f_subtitle_length", seconds.as_str()),
        ]);
    }
    let response: Value = provider_json(request).await?;
    let body = response.pointer("/message/body")?;
    if let Some(text) = body
        .pointer(
            "/macro_calls/track.subtitles.get/message/body/subtitle_list/0/subtitle/subtitle_body",
        )
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
    {
        return Some((text.to_owned(), true));
    }
    body.pointer("/macro_calls/track.lyrics.get/message/body/lyrics/lyrics_body")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(|text| (text.to_owned(), false))
}

async fn lyricsplus_fetch(
    title: &str,
    artist: &str,
    duration: i32,
    album: Option<&str>,
) -> Option<String> {
    for base in [
        "https://lyricsplus.binimum.org",
        "https://lyricsplus.atomix.one",
        "https://lyricsplus-seven.vercel.app",
    ] {
        let seconds = if duration > 0 { duration } else { -1 };
        let seconds_value = seconds.to_string();
        let mut request = http().get(format!("{base}/v2/lyrics/get")).query(&[
            ("title", title),
            ("artist", artist),
            ("duration", seconds_value.as_str()),
            (
                "source",
                "apple,lyricsplus,musixmatch,spotify,musixmatch-word",
            ),
        ]);
        if let Some(album) = album.filter(|value| !value.is_empty()) {
            request = request.query(&[("album", album)]);
        }
        let Some(response) = provider_json::<LyricsPlusResponse>(request).await else {
            continue;
        };
        let Some(lines) = response.lyrics.filter(|lines| !lines.is_empty()) else {
            continue;
        };
        let text = lines
            .into_iter()
            .filter(|line| !line.text.trim().is_empty())
            .map(|line| {
                format!(
                    "[{:02}:{:05.2}]{}",
                    line.time / 60_000,
                    (line.time % 60_000) as f64 / 1000.0,
                    line.text.trim()
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        if !text.is_empty() {
            return Some(text);
        }
    }
    None
}

fn clean_lyrics_title(value: &str) -> String {
    let mut result = value.trim().to_owned();
    let patterns = [
        r"(?i)\s*\(.*?(official|video|audio|lyrics|lyric|visualizer|hd|hq|4k|remaster|remix|live|acoustic|version|edit|extended|radio|clean|explicit).*?\)",
        r"(?i)\s*\[.*?(official|video|audio|lyrics|lyric|visualizer|hd|hq|4k|remaster|remix|live|acoustic|version|edit|extended|radio|clean|explicit).*?\]",
        r"\s*【.*?】",
        r"\s*\|.*$",
        r"(?i)\s*-\s*(official|video|audio|lyrics|lyric|visualizer).*$",
        r"(?i)\s*\(feat\..*?\)",
        r"(?i)\s*\(ft\..*?\)",
        r"(?i)\s*feat\..*$",
        r"(?i)\s*ft\..*$",
    ];
    for pattern in patterns {
        if let Ok(regex) = Regex::new(pattern) {
            result = regex.replace_all(&result, "").into_owned();
        }
    }
    result.trim().to_owned()
}

fn clean_lyrics_artist(value: &str) -> String {
    let separators = [
        " & ",
        " and ",
        ", ",
        " x ",
        " X ",
        " feat. ",
        " feat ",
        " ft. ",
        " ft ",
        " featuring ",
        " with ",
    ];
    let mut result = value.trim().to_owned();
    // ASCII-only lowercasing keeps byte offsets identical to `result`. `to_lowercase()` can change byte lengths
    // (e.g. "ẞ" -> "ß"), and truncating `result` at that index panicked with "not a char boundary".
    let lowered = result.to_ascii_lowercase();
    for separator in separators {
        if let Some(index) = lowered.find(&separator.to_ascii_lowercase()) {
            result.truncate(index);
            break;
        }
    }
    result.trim().to_owned()
}

async fn lrclib_search(
    track_name: Option<&str>,
    artist_name: Option<&str>,
    album_name: Option<&str>,
    query: Option<&str>,
) -> Vec<LrcLibTrack> {
    let mut params = Vec::<(&str, &str)>::new();
    if let Some(value) = track_name {
        params.push(("track_name", value));
    }
    if let Some(value) = artist_name {
        params.push(("artist_name", value));
    }
    if let Some(value) = album_name {
        params.push(("album_name", value));
    }
    if let Some(value) = query {
        params.push(("q", value));
    }
    let response = match http()
        .get("https://lrclib.net/api/search")
        .query(&params)
        .send()
        .await
    {
        Ok(response) => response,
        Err(_) => return Vec::new(),
    };
    let response = match response.error_for_status() {
        Ok(response) => response,
        Err(_) => return Vec::new(),
    };
    response
        .json::<Vec<LrcLibTrack>>()
        .await
        .unwrap_or_default()
}

fn duration_delta(track: &LrcLibTrack, duration: i32) -> i32 {
    (track.duration.round() as i32 - duration).abs()
}

fn lyrics_similarity(left: &str, right: &str) -> f64 {
    let left = left.trim().to_lowercase();
    let right = right.trim().to_lowercase();
    if left == right {
        return 1.0;
    }
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }
    if left.contains(&right) || right.contains(&left) {
        return 0.8;
    }
    let left_bytes = left.as_bytes();
    let right_bytes = right.as_bytes();
    let mut previous: Vec<usize> = (0..=right_bytes.len()).collect();
    for (i, left_byte) in left_bytes.iter().enumerate() {
        let mut current = vec![i + 1; right_bytes.len() + 1];
        for (j, right_byte) in right_bytes.iter().enumerate() {
            current[j + 1] = if left_byte == right_byte {
                previous[j]
            } else {
                1 + previous[j].min(previous[j + 1]).min(current[j])
            };
        }
        previous = current;
    }
    1.0 - (previous[right_bytes.len()] as f64 / left_bytes.len().max(right_bytes.len()) as f64)
}

fn lyric_setting_enabled(db: &Connection, key: &str, default: bool) -> Result<bool, String> {
    Ok(setting_value(db, key)?
        .map(|value| value == "true")
        .unwrap_or(default))
}

fn ordered_lyrics_providers(db: &Connection) -> Result<Vec<String>, String> {
    const REGISTRY_ORDER: [&str; 8] = [
        "BetterLyrics",
        "Paxsenix",
        "LrcLib",
        "KuGou",
        "LyricsPlus",
        "Musixmatch",
        "YouTubeSubtitle",
        "YouTube",
    ];
    let stored = setting_value(db, "lyricsProviderOrder")?.unwrap_or_default();
    if stored.trim().is_empty() {
        // LyricsHelper's backward-compatible blank-order path defaults to LRCLIB.
        return Ok(vec![
            "LrcLib",
            "BetterLyrics",
            "Paxsenix",
            "KuGou",
            "LyricsPlus",
            "YouTubeSubtitle",
            "YouTube",
        ]
        .into_iter()
        .map(str::to_owned)
        .collect());
    }
    let mut result = Vec::new();
    for provider in stored.split(',').map(str::trim) {
        if REGISTRY_ORDER.contains(&provider) && !result.iter().any(|value| value == provider) {
            result.push(provider.to_owned());
        }
    }
    for provider in REGISTRY_ORDER {
        if !result.iter().any(|value| value == provider) {
            result.push(provider.to_owned());
        }
    }
    Ok(result)
}

async fn fetch_lyrics_provider(
    provider: &str,
    title: &str,
    artist: &str,
    duration: i32,
    album: Option<&str>,
    video_id: Option<&str>,
    state: &tauri::State<'_, RuntimeState>,
) -> Result<Option<LyricsPayload>, String> {
    let make_payload =
        |text: String, synced: bool, matched_title: String, matched_artist: String| {
            let filtered = filter_lyrics_credit_lines(&text);
            LyricsPayload {
                lines: if synced {
                    parse_lyric_lines(&filtered)
                } else {
                    Vec::new()
                },
                provider: provider.to_owned(),
                text: filtered,
                synced,
                matched_title,
                matched_artist,
            }
        };

    match provider {
        "BetterLyrics" => Ok(betterlyrics_fetch(title, artist, duration, album)
            .await
            .map(|text| make_payload(text, true, title.to_owned(), artist.to_owned()))
            .filter(|payload| !payload.text.is_empty())),
        "Paxsenix" => Ok(paxsenix_fetch(title, artist, duration, album)
            .await
            .map(|text| {
                let synced = !parse_lyric_lines(&text).is_empty();
                make_payload(text, synced, title.to_owned(), artist.to_owned())
            })
            .filter(|payload| !payload.text.is_empty())),
        "LrcLib" => {
            let valid = |tracks: Vec<LrcLibTrack>| {
                tracks
                    .into_iter()
                    .filter(|track| track.synced_lyrics.is_some() || track.plain_lyrics.is_some())
                    .collect::<Vec<_>>()
            };
            let mut tracks = valid(lrclib_search(Some(title), Some(artist), album, None).await);
            if tracks.is_empty() {
                tracks = valid(lrclib_search(Some(title), None, None, None).await);
            }
            if tracks.is_empty() {
                tracks = valid(
                    lrclib_search(None, None, None, Some(&format!("{artist} {title}"))).await,
                );
            }
            if tracks.is_empty() {
                tracks = valid(lrclib_search(None, None, None, Some(title)).await);
            }
            let best = if duration < 0 {
                tracks
                    .iter()
                    .filter(|track| {
                        let score = (lyrics_similarity(title, &track.track_name)
                            + lyrics_similarity(artist, &track.artist_name))
                            / 2.0;
                        score > 0.6
                    })
                    .max_by(|left, right| {
                        let score = |track: &&LrcLibTrack| {
                            let mut value = (lyrics_similarity(title, &track.track_name)
                                + lyrics_similarity(artist, &track.artist_name))
                                / 2.0;
                            if track.synced_lyrics.is_some() {
                                value += 0.1;
                            }
                            value
                        };
                        score(left)
                            .partial_cmp(&score(right))
                            .unwrap_or(std::cmp::Ordering::Equal)
                    })
                    .or_else(|| tracks.iter().find(|track| track.synced_lyrics.is_some()))
                    .or_else(|| tracks.first())
            } else {
                let synced_match = tracks
                    .iter()
                    .filter(|track| track.synced_lyrics.is_some())
                    .min_by_key(|track| duration_delta(track, duration))
                    .filter(|track| duration_delta(track, duration) <= 5);
                synced_match.or_else(|| {
                    tracks
                        .iter()
                        .min_by_key(|track| duration_delta(track, duration))
                        .filter(|track| duration_delta(track, duration) <= 5)
                })
            };
            Ok(best
                .and_then(|track| {
                    let text = track
                        .synced_lyrics
                        .clone()
                        .or_else(|| track.plain_lyrics.clone())?;
                    Some(make_payload(
                        text,
                        track.synced_lyrics.is_some(),
                        track.track_name.clone(),
                        track.artist_name.clone(),
                    ))
                })
                .filter(|payload| !payload.text.is_empty()))
        }
        "KuGou" => Ok(kugou_fetch(title, artist, duration, album)
            .await
            .map(|text| make_payload(text, true, title.to_owned(), artist.to_owned()))
            .filter(|payload| !payload.text.is_empty())),
        "LyricsPlus" => Ok(lyricsplus_fetch(title, artist, duration, album)
            .await
            .map(|text| make_payload(text, true, title.to_owned(), artist.to_owned()))
            .filter(|payload| !payload.text.is_empty())),
        "Musixmatch" => Ok(musixmatch_fetch(title, artist, duration, album)
            .await
            .map(|(text, synced)| make_payload(text, synced, title.to_owned(), artist.to_owned()))
            .filter(|payload| !payload.text.is_empty())),
        "YouTubeSubtitle" => Ok(match video_id.filter(|value| !value.trim().is_empty()) {
            Some(id) => youtube_subtitle_fetch(id)
                .await
                .map(|text| make_payload(text, true, title.to_owned(), artist.to_owned()))
                .filter(|payload| !payload.text.is_empty()),
            None => None,
        }),
        "YouTube" => Ok(match video_id.filter(|value| !value.trim().is_empty()) {
            Some(id) => youtube_plain_lyrics_fetch(id, state)
                .await
                .map(|text| make_payload(text, false, title.to_owned(), artist.to_owned()))
                .filter(|payload| !payload.text.is_empty()),
            None => None,
        }),
        _ => Ok(None),
    }
}

fn cache_lyrics_variant(
    db: &Connection,
    cache_id: &str,
    payload: &LyricsPayload,
) -> Result<(), String> {
    db.execute("INSERT INTO lyrics_variants (song_id, provider, text, synced, matched_title, matched_artist, fetched_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT(song_id, provider) DO UPDATE SET text=excluded.text, synced=excluded.synced, matched_title=excluded.matched_title, matched_artist=excluded.matched_artist, fetched_at=excluded.fetched_at", params![cache_id, payload.provider, payload.text, if payload.synced { 1 } else { 0 }, payload.matched_title, payload.matched_artist, now_seconds()]).map_err(|error| format!("lyrics provider cache write failed: {error}"))?;
    Ok(())
}

fn cache_lyrics_payload(
    db: &Connection,
    cache_id: &str,
    payload: &LyricsPayload,
) -> Result<(), String> {
    db.execute("INSERT INTO lyrics (song_id, provider, text, synced, fetched_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(song_id) DO UPDATE SET provider=excluded.provider, text=excluded.text, synced=excluded.synced, fetched_at=excluded.fetched_at", params![cache_id, payload.provider, payload.text, if payload.synced { 1 } else { 0 }, now_seconds()]).map_err(|error| format!("lyrics cache write failed: {error}"))?;
    cache_lyrics_variant(db, cache_id, payload)
}

fn cached_lyrics_provider(
    db: &Connection,
    cache_id: &str,
    provider: &str,
) -> Result<Option<LyricsPayload>, String> {
    db.query_row("SELECT text, synced, matched_title, matched_artist FROM lyrics_variants WHERE song_id = ?1 AND provider = ?2", params![cache_id, provider], |row| {
        let text: String = row.get(0)?;
        let synced: i64 = row.get(1)?;
        Ok(LyricsPayload { lines: if synced != 0 { parse_lyric_lines(&text) } else { Vec::new() }, provider: provider.to_owned(), text, synced: synced != 0, matched_title: row.get(2)?, matched_artist: row.get(3)? })
    }).optional().map_err(|error| format!("lyrics provider cache read failed: {error}"))
}

async fn fetch_all_enabled_lyrics(
    title: &str,
    artist: &str,
    duration: i32,
    album: Option<&str>,
    video_id: Option<&str>,
    state: &tauri::State<'_, RuntimeState>,
) -> Result<Vec<LyricsPayload>, String> {
    let order = {
        let db = state
            .db
            .lock()
            .map_err(|_| "database state poisoned".to_owned())?;
        ordered_lyrics_providers(&db)?
    };
    let mut results = Vec::new();
    for provider in order {
        let enabled = {
            let db = state
                .db
                .lock()
                .map_err(|_| "database state poisoned".to_owned())?;
            match provider.as_str() {
                "BetterLyrics" => lyric_setting_enabled(&db, "enableBetterLyrics", true)?,
                "Paxsenix" => lyric_setting_enabled(&db, "enablePaxsenix", true)?,
                "LrcLib" => lyric_setting_enabled(&db, "enableLrclib", true)?,
                "KuGou" => lyric_setting_enabled(&db, "enableKugou", true)?,
                "LyricsPlus" => lyric_setting_enabled(&db, "enableLyricsPlus", false)?,
                "Musixmatch" => lyric_setting_enabled(&db, "enableMusixmatch", false)?,
                "YouTubeSubtitle" | "YouTube" => true,
                _ => false,
            }
        };
        if !enabled {
            continue;
        }
        let result = timeout(
            Duration::from_secs(12),
            fetch_lyrics_provider(&provider, title, artist, duration, album, video_id, state),
        )
        .await;
        if let Ok(Ok(Some(payload))) = result {
            results.push(payload);
        }
    }
    Ok(results)
}

async fn fetch_lyrics_inner(
    title: String,
    artist: String,
    duration: i32,
    album: Option<String>,
    id: Option<String>,
    state: tauri::State<'_, RuntimeState>,
    use_cache: bool,
) -> Result<LyricsPayload, String> {
    let cleaned_title = clean_lyrics_title(&title);
    let cleaned_artist = clean_lyrics_artist(&artist);
    let cache_id = format!(
        "lyrics:{}:{}",
        cleaned_title.to_lowercase(),
        cleaned_artist.to_lowercase()
    );
    if use_cache {
        if let Some(cached) = {
            let db = state.db.lock().map_err(|_| "database state poisoned")?;
            db.query_row(
                "SELECT provider, text, synced FROM lyrics WHERE song_id = ?1",
                params![cache_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| format!("lyrics cache read failed: {e}"))?
        } {
            let text = filter_lyrics_credit_lines(&cached.1);
            return Ok(LyricsPayload {
                lines: if cached.2 != 0 {
                    parse_lyric_lines(&text)
                } else {
                    Vec::new()
                },
                provider: cached.0,
                text,
                synced: cached.2 != 0,
                matched_title: cleaned_title,
                matched_artist: cleaned_artist,
            });
        }
    }
    let album_name = album
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let order = {
        let db = state.db.lock().map_err(|_| "database state poisoned")?;
        ordered_lyrics_providers(&db)?
    };
    for provider in order {
        let enabled = {
            let db = state.db.lock().map_err(|_| "database state poisoned")?;
            match provider.as_str() {
                "BetterLyrics" => lyric_setting_enabled(&db, "enableBetterLyrics", true)?,
                "Paxsenix" => lyric_setting_enabled(&db, "enablePaxsenix", true)?,
                "LrcLib" => lyric_setting_enabled(&db, "enableLrclib", true)?,
                "KuGou" => lyric_setting_enabled(&db, "enableKugou", true)?,
                "LyricsPlus" => lyric_setting_enabled(&db, "enableLyricsPlus", false)?,
                "Musixmatch" => lyric_setting_enabled(&db, "enableMusixmatch", false)?,
                "YouTubeSubtitle" | "YouTube" => true,
                _ => false,
            }
        };
        if !enabled {
            continue;
        }
        if let Some(payload) = fetch_lyrics_provider(
            &provider,
            &cleaned_title,
            &cleaned_artist,
            duration,
            album_name,
            id.as_deref(),
            &state,
        )
        .await?
        {
            let db = state.db.lock().map_err(|_| "database state poisoned")?;
            cache_lyrics_payload(&db, &cache_id, &payload)?;
            return Ok(payload);
        }
    }
    Err("Lyrics unavailable from enabled Meld providers".to_owned())
}

fn token_from_feedback_endpoint(value: &Value) -> Option<String> {
    value
        .get("feedbackEndpoint")
        .and_then(|endpoint| endpoint.get("feedbackToken"))
        .and_then(Value::as_str)
        .map(str::to_owned)
}

fn collect_library_tokens(
    value: &Value,
    add_token: &mut Option<String>,
    remove_token: &mut Option<String>,
) {
    if let Some(object) = value.as_object() {
        if let Some(toggle) = object.get("toggleMenuServiceItemRenderer") {
            let icon = toggle
                .get("defaultIcon")
                .and_then(|v| v.get("iconType"))
                .and_then(Value::as_str)
                .unwrap_or("");
            if icon != "KEEP" && icon != "KEEP_OFF" {
                let default_token = toggle
                    .get("defaultServiceEndpoint")
                    .and_then(token_from_feedback_endpoint);
                let toggled_token = toggle
                    .get("toggledServiceEndpoint")
                    .and_then(token_from_feedback_endpoint);
                if matches!(icon, "LIBRARY_ADD" | "BOOKMARK_BORDER")
                    || icon.starts_with("LIBRARY_")
                        && !matches!(icon, "LIBRARY_SAVED" | "LIBRARY_REMOVE")
                {
                    if add_token.is_none() {
                        *add_token = default_token;
                    }
                    if remove_token.is_none() {
                        *remove_token = toggled_token;
                    }
                } else if matches!(icon, "LIBRARY_SAVED" | "BOOKMARK" | "LIBRARY_REMOVE") {
                    if remove_token.is_none() {
                        *remove_token = default_token;
                    }
                    if add_token.is_none() {
                        *add_token = toggled_token;
                    }
                }
            }
        }
        for child in object.values() {
            collect_library_tokens(child, add_token, remove_token);
        }
    } else if let Some(array) = value.as_array() {
        for child in array {
            collect_library_tokens(child, add_token, remove_token);
        }
    }
}

fn find_library_tokens_for_video(
    value: &Value,
    video_id: &str,
) -> Option<(Option<String>, Option<String>)> {
    if let Some(object) = value.as_object() {
        if object.get("videoId").and_then(Value::as_str) == Some(video_id) {
            let mut add_token = None;
            let mut remove_token = None;
            collect_library_tokens(value, &mut add_token, &mut remove_token);
            if add_token.is_some() || remove_token.is_some() {
                return Some((add_token, remove_token));
            }
        }
        for child in object.values() {
            if let Some(tokens) = find_library_tokens_for_video(child, video_id) {
                return Some(tokens);
            }
        }
    } else if let Some(array) = value.as_array() {
        for child in array {
            if let Some(tokens) = find_library_tokens_for_video(child, video_id) {
                return Some(tokens);
            }
        }
    }
    None
}

async fn send_feedback(session: &AuthSession, token: String) -> Result<(), String> {
    let response = post("feedback", json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)), "feedbackTokens": [token] }), Some(session)).await?;
    let processed = response
        .get("feedbackResponses")
        .and_then(Value::as_array)
        .map(|items| {
            !items.is_empty()
                && items
                    .iter()
                    .all(|item| item.get("isProcessed").and_then(Value::as_bool) == Some(true))
        })
        .unwrap_or(false);
    if processed {
        Ok(())
    } else {
        Err("YouTube Music did not confirm the library change".to_owned())
    }
}

/// Stores the YouTube like state of `item` locally. This statement binds 14 parameters. It used to reference `?15` for
/// `is_video`, so SQLite expected 15 and every call failed with `InvalidParameterCount(14, 15)` right after the like had
/// already been accepted by YouTube.
fn save_like_state(db: &Connection, item: &YtItem, liked: bool) -> Result<(), String> {
    db.execute("INSERT INTO songs (id, title, subtitle, thumbnail, browse_id, playlist_id, video_id, set_video_id, kind, saved_at, explicit, music_video_type, liked, liked_date, in_library, is_video, youtube_liked) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, NULL, 0, ?14, ?13) ON CONFLICT(id) DO UPDATE SET title=excluded.title, subtitle=excluded.subtitle, thumbnail=excluded.thumbnail, browse_id=excluded.browse_id, playlist_id=excluded.playlist_id, video_id=excluded.video_id, set_video_id=excluded.set_video_id, kind=excluded.kind, explicit=excluded.explicit, music_video_type=excluded.music_video_type, youtube_liked=excluded.youtube_liked, is_video=excluded.is_video", params![item.id, item.title, item.subtitle, item.thumbnail, item.browse_id, item.playlist_id, item.video_id, item.set_video_id, item.kind, now_seconds(), if item.explicit { 1 } else { 0 }, item.music_video_type, if liked { 1 } else { 0 }, if item.music_video_type.as_deref().is_some_and(|v| v != "MUSIC_VIDEO_TYPE_ATV") { 1 } else { 0 }]).map_err(|e| format!("like state save failed: {e}"))?;
    Ok(())
}

/// (name, email, channel handle, avatar URL)
type AccountInfo = (String, Option<String>, Option<String>, Option<String>);

fn account_info_from_response(value: &Value) -> Option<AccountInfo> {
    if let Some(object) = value.as_object() {
        if let Some(header) = object.get("activeAccountHeaderRenderer") {
            let name = text(header.get("accountName"));
            if !name.is_empty() {
                return Some((
                    name,
                    Some(text(header.get("email"))).filter(|v| !v.is_empty()),
                    Some(text(header.get("channelHandle"))).filter(|v| !v.is_empty()),
                    thumbnail(header.get("avatar")),
                ));
            }
        }
        for child in object.values() {
            if let Some(info) = account_info_from_response(child) {
                return Some(info);
            }
        }
    } else if let Some(array) = value.as_array() {
        for child in array {
            if let Some(info) = account_info_from_response(child) {
                return Some(info);
            }
        }
    }
    None
}

async fn save_account_session_internal(
    cookie: String,
    data_sync_id: String,
    visitor_data: String,
    state: &RuntimeState,
) -> Result<SessionStatus, String> {
    if cookie.trim().is_empty()
        || !cookie
            .split(';')
            .any(|part| part.trim().starts_with("SAPISID="))
    {
        return Err("Google session cookie is missing SAPISID".to_owned());
    }
    if data_sync_id.trim().is_empty() || !visitor_data.starts_with(VISITOR_PREFIX) {
        return Err("Google session requires dataSyncId and valid visitorData".to_owned());
    }
    let session = AuthSession {
        cookie: cookie.clone(),
        data_sync_id: data_sync_id.clone(),
        visitor_data: visitor_data.clone(),
        account_name: None,
        account_email: None,
        account_channel_handle: None,
        account_avatar: None,
    };
    let response = post(
        "account/account_menu",
        json!({ "context": context(&visitor_data, true, Some(&data_sync_id)) }),
        Some(&session),
    )
    .await?;
    let (name, email, channel_handle, avatar) = account_info_from_response(&response)
        .ok_or_else(|| "Google session validation returned no active account header".to_owned())?;
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    secrets::set(&db, "cookie", &cookie)?;
    for (key, value) in [
        ("dataSyncId", data_sync_id),
        ("visitorData", visitor_data),
        ("accountName", name.clone()),
        ("accountEmail", email.clone().unwrap_or_default()),
        (
            "accountChannelHandle",
            channel_handle.clone().unwrap_or_default(),
        ),
        ("accountAvatar", avatar.clone().unwrap_or_default()),
    ] {
        db.execute("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, value]).map_err(|e| format!("account session save failed: {e}"))?;
    }
    *state
        .visitor_data
        .lock()
        .map_err(|_| "visitor state poisoned")? = Some(session.visitor_data);
    Ok(SessionStatus {
        authenticated: true,
        account_name: Some(name),
        account_email: email,
        account_channel_handle: channel_handle,
        account_avatar: avatar,
    })
}

// Retired from generate_handler() (DECISIONS D-004): no UI caller, and it let the webview inject an arbitrary Google
// cookie. The login window saves sessions through save_account_session_internal directly.
#[allow(dead_code)]
#[tauri::command]
async fn account_save_session(
    cookie: String,
    data_sync_id: String,
    visitor_data: String,
    state: tauri::State<'_, RuntimeState>,
) -> Result<SessionStatus, String> {
    save_account_session_internal(cookie, data_sync_id, visitor_data, state.inner()).await
}

fn base32_decode(input: &str) -> Vec<u8> {
    let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let mut buffer = 0u32;
    let mut bits = 0u8;
    let mut output = Vec::new();
    for character in input
        .to_uppercase()
        .chars()
        .filter(|character| *character != '=')
    {
        let Some(value) = alphabet.find(character) else {
            continue;
        };
        buffer = (buffer << 5) | value as u32;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            output.push(((buffer >> bits) & 0xff) as u8);
        }
    }
    output
}

fn spotify_totp(secret: &str, server_time: i64) -> String {
    let counter = (server_time.max(0) / 30) as u64;
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&counter.to_be_bytes());
    let mut mac =
        Hmac::<Sha1>::new_from_slice(&base32_decode(secret)).expect("HMAC accepts any key length");
    mac.update(&bytes);
    let digest = mac.finalize().into_bytes();
    let offset = (digest[19] & 0x0f) as usize;
    let code = ((u32::from(digest[offset]) & 0x7f) << 24)
        | (u32::from(digest[offset + 1]) << 16)
        | (u32::from(digest[offset + 2]) << 8)
        | u32::from(digest[offset + 3]);
    format!("{:06}", code % 1_000_000)
}

fn spotify_hash_candidates(operation: &str) -> Result<Vec<String>, String> {
    let registry: Value =
        serde_json::from_str(include_str!("../resources/spotify-gql-hashes.json"))
            .map_err(|error| format!("Spotify hash registry is invalid: {error}"))?;
    let entry = registry
        .get("operations")
        .and_then(|value| value.get(operation))
        .ok_or_else(|| format!("Spotify operation is not registered: {operation}"))?;
    let primary = entry
        .get("hash")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("Spotify operation has no hash: {operation}"))?;
    let previous = entry
        .get("previous_hash")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty());
    let mut candidates = vec![primary.to_owned()];
    if previous != Some(primary) {
        if let Some(value) = previous {
            candidates.push(value.to_owned());
        }
    }
    Ok(candidates)
}

async fn spotify_graphql_post(
    operation: &str,
    variables: Value,
    token: &str,
) -> Result<Value, String> {
    let hashes = spotify_hash_candidates(operation)?;
    let mut last_status = None;
    for (index, hash) in hashes.iter().enumerate() {
        let body = json!({
            "variables": variables,
            "operationName": operation,
            "extensions": { "persistedQuery": { "version": 1, "sha256Hash": hash } }
        });
        // A 429 is not a hash problem, so it is retried in place (same hash) rather than moving on to the next
        // candidate. Retry-After is honored when Spotify sends one, capped so a single command cannot hang the
        // UI for an unreasonable amount of time; otherwise a short default backoff is used.
        let mut retries_left = 2u8;
        let (status, text) = loop {
            let response = http()
                .post("https://api-partner.spotify.com/pathfinder/v2/query")
                .bearer_auth(token)
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|error| format!("Spotify GraphQL request failed: {error}"))?;
            let status = response.status();
            if status.as_u16() == 429 && retries_left > 0 {
                let wait_seconds = response
                    .headers()
                    .get("retry-after")
                    .and_then(|value| value.to_str().ok())
                    .and_then(|value| value.parse::<u64>().ok())
                    .map(|seconds| seconds.min(30))
                    .unwrap_or(5);
                retries_left -= 1;
                tokio::time::sleep(Duration::from_secs(wait_seconds)).await;
                continue;
            }
            let text = response
                .text()
                .await
                .map_err(|error| format!("Spotify GraphQL response failed: {error}"))?;
            break (status, text);
        };
        last_status = Some(status.as_u16());
        if status.as_u16() == 412 && index + 1 < hashes.len() {
            continue;
        }
        if !status.is_success() {
            // Previously the response body was read and then discarded on every error path; Spotify's actual
            // error message (helpful for diagnosing which hash/operation broke) never reached the caller.
            let snippet: String = text.chars().take(200).collect();
            return Err(format!(
                "Spotify GraphQL {operation} returned HTTP {}: {snippet}",
                status.as_u16()
            ));
        }
        let value: Value = serde_json::from_str(&text)
            .map_err(|error| format!("Spotify GraphQL JSON failed: {error}"))?;
        if value
            .get("errors")
            .and_then(Value::as_array)
            .is_some_and(|errors| !errors.is_empty())
        {
            let message = value
                .pointer("/errors/0/message")
                .and_then(Value::as_str)
                .unwrap_or("unknown GraphQL error");
            if message.contains("PersistedQueryNotFound") && index + 1 < hashes.len() {
                continue;
            }
            return Err(format!("Spotify GraphQL {operation} error: {message}"));
        }
        return Ok(value);
    }
    Err(format!(
        "Spotify GraphQL {operation} failed with HTTP {}",
        last_status.unwrap_or(412)
    ))
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SpotifyProfile {
    id: String,
    display_name: Option<String>,
    avatar: Option<String>,
}

fn spotify_token(state: &tauri::State<'_, RuntimeState>) -> Result<String, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "database state poisoned".to_owned())?;
    let token = secrets::get(&db, "spotifyAccessToken")?
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Spotify account is not authenticated".to_owned())?;
    let expiry =
        setting_value(&db, "spotifyTokenExpiry")?.and_then(|value| value.parse::<i64>().ok());
    if expiry.is_none_or(|value| value <= now_millis()) {
        return Err("Spotify account is not authenticated or its token expired".to_owned());
    }
    Ok(token)
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SpotifyPlaylistItem {
    id: String,
    name: String,
    description: Option<String>,
    image: Option<String>,
    owner: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SpotifyFolderItem {
    uri: String,
    name: String,
    total_children: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SpotifyLibraryNode {
    folders: Vec<SpotifyFolderItem>,
    playlists: Vec<SpotifyPlaylistItem>,
    total_count: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SpotifyTrackItem {
    id: String,
    uri: String,
    uid: Option<String>,
    name: String,
    artist: String,
    album: String,
    image: Option<String>,
    duration_ms: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SpotifyLikedTracks {
    tracks: Vec<SpotifyTrackItem>,
    total_count: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SpotifyTrackPage {
    tracks: Vec<SpotifyTrackItem>,
    total_count: i64,
    offset: i64,
    limit: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SpotifyTrackMatch {
    id: String,
    uri: String,
    name: String,
    artist: String,
    duration_ms: i64,
}

fn spotify_playlist_from_wrapper(wrapper: &Value) -> Option<SpotifyPlaylistItem> {
    if !wrapper
        .get("__typename")
        .and_then(Value::as_str)
        .is_some_and(|value| value.contains("Playlist"))
    {
        return None;
    }
    let data = wrapper.get("data")?;
    let uri = wrapper
        .get("_uri")
        .and_then(Value::as_str)
        .or_else(|| data.get("uri").and_then(Value::as_str))?;
    let id = uri.rsplit(':').next()?.to_owned();
    let image = data
        .pointer("/images/items/0/sources/0/url")
        .and_then(Value::as_str)
        .or_else(|| {
            data.pointer("/images/sources/0/url")
                .and_then(Value::as_str)
        })
        .map(str::to_owned);
    let owner = data
        .pointer("/ownerV2/data/name")
        .and_then(Value::as_str)
        .map(str::to_owned);
    Some(SpotifyPlaylistItem {
        id,
        name: data
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        description: data
            .get("description")
            .and_then(Value::as_str)
            .map(str::to_owned),
        image,
        owner,
    })
}

fn spotify_playlist_items(response: &Value) -> Vec<SpotifyPlaylistItem> {
    response
        .pointer("/data/me/libraryV3/items")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| spotify_playlist_from_wrapper(entry.get("item")?))
        .collect()
}

fn parse_spotify_library_node(response: &Value) -> SpotifyLibraryNode {
    let library = response.pointer("/data/me/libraryV3");
    let total_count = library
        .and_then(|value| value.get("totalCount"))
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let mut folders = Vec::new();
    let mut playlists = Vec::new();
    for entry in library
        .and_then(|value| value.get("items"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let Some(wrapper) = entry.get("item") else {
            continue;
        };
        let type_name = wrapper
            .get("__typename")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if type_name.contains("Folder") {
            let Some(uri) = wrapper.get("_uri").and_then(Value::as_str) else {
                continue;
            };
            let data = wrapper.get("data");
            let name = data
                .and_then(|value| value.get("name"))
                .and_then(Value::as_str)
                .or_else(|| wrapper.get("name").and_then(Value::as_str));
            let Some(name) = name else {
                continue;
            };
            let total_children = data
                .and_then(|value| value.get("totalLength"))
                .and_then(Value::as_i64)
                .or_else(|| {
                    data.and_then(|value| value.get("numberOfItems"))
                        .and_then(Value::as_i64)
                })
                .or_else(|| wrapper.get("totalLength").and_then(Value::as_i64))
                .unwrap_or(0);
            folders.push(SpotifyFolderItem {
                uri: uri.to_owned(),
                name: name.to_owned(),
                total_children,
            });
        } else if let Some(playlist) = spotify_playlist_from_wrapper(wrapper) {
            playlists.push(playlist);
        }
    }
    SpotifyLibraryNode {
        folders,
        playlists,
        total_count,
    }
}

fn spotify_track_matches(response: &Value) -> Vec<SpotifyTrackMatch> {
    response
        .pointer("/data/searchV2/tracksV2/items")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            let wrapper = entry.get("item")?;
            if wrapper.get("__typename").and_then(Value::as_str) != Some("TrackResponseWrapper") {
                return None;
            }
            let data = wrapper.get("data")?;
            if data.get("__typename").and_then(Value::as_str) != Some("Track") {
                return None;
            }
            let uri = wrapper
                .get("_uri")
                .and_then(Value::as_str)
                .or_else(|| data.get("uri").and_then(Value::as_str))?
                .to_owned();
            let id = uri.rsplit(':').next()?.to_owned();
            let artist = data
                .pointer("/artists/items/0/profile/name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned();
            let duration_ms = data
                .pointer("/duration/totalMilliseconds")
                .and_then(Value::as_i64)
                .or_else(|| data.get("durationMs").and_then(Value::as_i64))
                .unwrap_or(0);
            Some(SpotifyTrackMatch {
                id,
                uri,
                name: data
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned(),
                artist,
                duration_ms,
            })
        })
        .collect()
}

fn parse_spotify_playlist_tracks(response: &Value) -> Vec<SpotifyTrackItem> {
    response
        .pointer("/data/playlistV2/content/items")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            let wrapper = entry.get("itemV2")?;
            let data = wrapper.get("data")?;
            let uri = wrapper
                .get("_uri")
                .and_then(Value::as_str)
                .or_else(|| data.get("uri").and_then(Value::as_str))?
                .to_owned();
            let id = uri.rsplit(':').next()?.to_owned();
            let image = data
                .pointer("/albumOfTrack/coverArt/sources/0/url")
                .and_then(Value::as_str)
                .or_else(|| {
                    data.pointer("/albumOfTrack/coverArt/sources/0/uri")
                        .and_then(Value::as_str)
                })
                .map(str::to_owned);
            let artist = data
                .pointer("/artists/items/0/profile/name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned();
            let album = data
                .pointer("/albumOfTrack/name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned();
            let duration_ms = data
                .pointer("/duration/totalMilliseconds")
                .and_then(Value::as_i64)
                .or_else(|| data.get("durationMs").and_then(Value::as_i64))
                .unwrap_or(0);
            Some(SpotifyTrackItem {
                id,
                uri,
                uid: entry.get("uid").and_then(Value::as_str).map(str::to_owned),
                name: data
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned(),
                artist,
                album,
                image,
                duration_ms,
            })
        })
        .collect()
}

fn parse_spotify_liked_tracks(response: &Value) -> SpotifyLikedTracks {
    let tracks_data = response.pointer("/data/me/library/tracks");
    let total_count = tracks_data
        .and_then(|value| value.get("totalCount"))
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let tracks = tracks_data
        .and_then(|value| value.get("items"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            let wrapper = entry.get("track")?;
            let data = wrapper.get("data")?;
            let uri = wrapper
                .get("_uri")
                .and_then(Value::as_str)
                .or_else(|| wrapper.get("uri").and_then(Value::as_str))
                .or_else(|| data.get("uri").and_then(Value::as_str))?
                .to_owned();
            let id = uri.rsplit(':').next()?.to_owned();
            let image = data
                .pointer("/albumOfTrack/coverArt/sources/0/url")
                .and_then(Value::as_str)
                .map(str::to_owned);
            let artist = data
                .pointer("/artists/items/0/profile/name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned();
            let album = data
                .pointer("/albumOfTrack/name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned();
            let duration_ms = data
                .pointer("/duration/totalMilliseconds")
                .and_then(Value::as_i64)
                .or_else(|| data.get("durationMs").and_then(Value::as_i64))
                .unwrap_or(0);
            Some(SpotifyTrackItem {
                id,
                uri,
                uid: None,
                name: data
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned(),
                artist,
                album,
                image,
                duration_ms,
            })
        })
        .collect();
    SpotifyLikedTracks {
        tracks,
        total_count,
    }
}

async fn spotify_search_track_matches(
    query: &str,
    token: &str,
) -> Result<Vec<SpotifyTrackMatch>, String> {
    let variables = json!({ "searchTerm": query, "offset": 0, "limit": 5, "numberOfTopResults": 5, "includeAudiobooks": false, "includeArtistHasConcertsField": false, "includePreReleases": false, "includeLocalConcertsField": false, "includeAuthors": false });
    let response = spotify_graphql_post("searchDesktop", variables, token).await?;
    Ok(spotify_track_matches(&response))
}

// Not registered in generate_handler(), so unreachable from the webview - kept (not deleted) since
// the function body is otherwise untouched and easy to re-enable by re-registering it.
// A thin wrapper around spotify_search_track_matches, which is still used directly by spotify_match_for_youtube/spotify_resolve_youtube - only this standalone free-text-search entry point was unused.
#[allow(dead_code)]
#[tauri::command]
async fn spotify_search_tracks(
    query: String,
    state: tauri::State<'_, RuntimeState>,
) -> Result<Vec<SpotifyTrackMatch>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let token = spotify_token(&state)?;
    spotify_search_track_matches(query, &token).await
}

fn spotify_normalize(value: &str) -> String {
    static NOISE: OnceLock<Vec<Regex>> = OnceLock::new();
    static STRIP: OnceLock<Regex> = OnceLock::new();
    static SPACES: OnceLock<Regex> = OnceLock::new();
    let noise = NOISE.get_or_init(|| {
        [
            r"(?i)\(feat\..*?\)",
            r"(?i)\(ft\..*?\)",
            r"\[.*?\]",
            r"(?i)\(.*?remaster.*?\)",
            r"(?i)\(.*?remix.*?\)",
        ]
        .iter()
        .map(|pattern| Regex::new(pattern).expect("static regex"))
        .collect()
    });
    // Keep letters and digits of every script. The old `[^a-z0-9\s]` stripped Arabic/CJK/Cyrillic titles to "".
    let strip = STRIP.get_or_init(|| Regex::new(r"[^\p{L}\p{N}\s]").expect("static regex"));
    let spaces = SPACES.get_or_init(|| Regex::new(r"\s+").expect("static regex"));
    let mut normalized = value.to_lowercase();
    for regex in noise {
        normalized = regex.replace_all(&normalized, "").into_owned();
    }
    normalized = strip.replace_all(&normalized, "").into_owned();
    spaces.replace_all(&normalized, " ").trim().to_owned()
}

fn spotify_bigram_similarity(left: &str, right: &str) -> f64 {
    // Empty strings never match (two titles that both normalize to "" used to score a perfect 1.0).
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }
    if left == right {
        return 1.0;
    }
    let left_chars: Vec<char> = left.chars().collect();
    let right_chars: Vec<char> = right.chars().collect();
    if left_chars.len() < 2 || right_chars.len() < 2 {
        return 0.0;
    }
    let left_bigrams: HashSet<(char, char)> = left_chars
        .windows(2)
        .map(|pair| (pair[0], pair[1]))
        .collect();
    let right_bigrams: HashSet<(char, char)> = right_chars
        .windows(2)
        .map(|pair| (pair[0], pair[1]))
        .collect();
    let intersection = left_bigrams.intersection(&right_bigrams).count();
    (2.0 * intersection as f64) / (left_bigrams.len() + right_bigrams.len()) as f64
}

fn spotify_duration_score(spotify_duration_ms: i64, candidate_duration_ms: i64) -> f64 {
    if candidate_duration_ms <= 0 || spotify_duration_ms <= 0 {
        return 0.5;
    }
    let diff = ((spotify_duration_ms / 1000) - (candidate_duration_ms / 1000)).abs();
    if diff <= 2 {
        1.0
    } else if diff <= 5 {
        0.8
    } else if diff <= 10 {
        0.5
    } else if diff <= 30 {
        0.2
    } else {
        0.0
    }
}

fn spotify_match_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SpotifyTrackMatch> {
    let id: String = row.get(0)?;
    Ok(SpotifyTrackMatch {
        uri: format!("spotify:track:{id}"),
        id,
        name: row.get(1)?,
        artist: row.get(2)?,
        duration_ms: 0,
    })
}

fn persist_spotify_match(
    db: &Connection,
    spotify_id: &str,
    youtube_id: &str,
    title: &str,
    artist: &str,
    score: f64,
    manual: bool,
) -> Result<(), String> {
    db.execute("INSERT INTO spotify_match (spotify_id, youtube_id, title, artist, match_score, cached_at, is_manual_override) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT(spotify_id) DO UPDATE SET youtube_id=excluded.youtube_id, title=excluded.title, artist=excluded.artist, match_score=excluded.match_score, cached_at=excluded.cached_at, is_manual_override=excluded.is_manual_override WHERE spotify_match.is_manual_override = 0 OR excluded.is_manual_override = 1", params![spotify_id, youtube_id, title, artist, score, now_millis(), if manual { 1 } else { 0 }]).map_err(|error| format!("Spotify match save failed: {error}"))?;
    Ok(())
}

async fn spotify_fetch_access_token(sp_dc: &str, sp_key: &str) -> Result<(String, i64), String> {
    let gist: Value = http()
        .get("https://api.github.com/gists/22ed9c6ba463899e933427f7de1f0eef")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Spotify nuance request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Spotify nuance returned error: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Spotify nuance JSON failed: {e}"))?;
    let content = gist
        .get("files")
        .and_then(Value::as_object)
        .and_then(|files| files.values().next())
        .and_then(|file| file.get("content"))
        .and_then(Value::as_str)
        .ok_or_else(|| "Spotify nuance gist had no content".to_owned())?;
    let nuances: Vec<Value> =
        serde_json::from_str(content).map_err(|e| format!("Spotify nuance list failed: {e}"))?;
    let nuance = nuances
        .iter()
        .max_by_key(|item| item.get("v").and_then(Value::as_i64).unwrap_or(0))
        .ok_or_else(|| "Spotify nuance list was empty".to_owned())?;
    let secret = nuance
        .get("s")
        .and_then(Value::as_str)
        .ok_or_else(|| "Spotify nuance secret missing".to_owned())?;
    let version = nuance
        .get("v")
        .and_then(Value::as_i64)
        .ok_or_else(|| "Spotify nuance version missing".to_owned())?;
    let server: Value = http()
        .get("https://open.spotify.com/api/server-time")
        .send()
        .await
        .map_err(|e| format!("Spotify server time failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Spotify server time returned error: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Spotify server time JSON failed: {e}"))?;
    let server_time = server
        .get("serverTime")
        .and_then(Value::as_i64)
        .ok_or_else(|| "Spotify server time missing".to_owned())?;
    let totp = spotify_totp(secret, server_time);
    let url = format!("https://open.spotify.com/api/token?reason=transport&productType=web-player&totp={totp}&totpServer={totp}&totpVer={version}");
    let cookie = if sp_key.is_empty() {
        format!("sp_dc={sp_dc}")
    } else {
        format!("sp_dc={sp_dc}; sp_key={sp_key}")
    };
    let token: Value = http()
        .get(url)
        .header("Cookie", cookie)
        .send()
        .await
        .map_err(|e| format!("Spotify token request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Spotify token rejected: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Spotify token JSON failed: {e}"))?;
    let access_token = token
        .get("accessToken")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Spotify returned no authenticated access token".to_owned())?
        .to_owned();
    if token.get("isAnonymous").and_then(Value::as_bool) == Some(true) {
        return Err("Spotify returned an anonymous token".to_owned());
    }
    let expiry = token
        .get("accessTokenExpirationTimestampMs")
        .and_then(Value::as_i64)
        .ok_or_else(|| "Spotify token expiry missing".to_owned())?;
    Ok((access_token, expiry))
}

async fn save_spotify_session_internal(
    sp_dc: String,
    sp_key: String,
    state: &RuntimeState,
) -> Result<i64, String> {
    // This chain (gist -> server-time -> token) is a single point of failure for the whole Spotify
    // integration, and every step in it is safe to redo, so a transient failure anywhere in it gets a
    // couple of short-backoff retries instead of failing the whole login/reconnect on one bad network blip.
    let mut attempt = 0u8;
    let (access_token, expiry) = loop {
        match spotify_fetch_access_token(&sp_dc, &sp_key).await {
            Ok(result) => break result,
            Err(_error) if attempt < 2 => {
                attempt += 1;
                tokio::time::sleep(Duration::from_secs(attempt as u64)).await;
            }
            Err(error) => return Err(error),
        }
    };
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    // sp_dc/sp_key are sealed (not dropped) so a later token refresh can reconnect without a new login (S5 "durable Spotify reconnect").
    secrets::set(&db, "spotifySpDc", &sp_dc)?;
    if !sp_key.is_empty() {
        secrets::set(&db, "spotifySpKey", &sp_key)?;
    }
    secrets::set(&db, "spotifyAccessToken", &access_token)?;
    db.execute("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params!["spotifyTokenExpiry", expiry.to_string()]).map_err(|e| format!("Spotify session save failed: {e}"))?;
    Ok(expiry)
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SpotifySessionStatus {
    authenticated: bool,
    token_expiry: Option<i64>,
}

/// Settings rows that make up a Google / YouTube Music session; all are removed on sign-out (TR-H6).
const GOOGLE_SESSION_KEYS: &[&str] = &[
    "cookie",
    "dataSyncId",
    "visitorData",
    "accountName",
    "accountEmail",
    "accountChannelHandle",
    "accountAvatar",
];
/// Settings rows that make up a Spotify session; all are removed on sign-out (TR-H6).
const SPOTIFY_SESSION_KEYS: &[&str] = &[
    "spotifySpDc",
    "spotifySpKey",
    "spotifyAccessToken",
    "spotifyTokenExpiry",
    "spotifyUsername",
    "spotifyUserId",
];

fn delete_settings(db: &Connection, keys: &[&str]) -> rusqlite::Result<()> {
    let mut statement = db.prepare("DELETE FROM settings WHERE key = ?1")?;
    for key in keys {
        statement.execute([key])?;
    }
    Ok(())
}

fn forget_google_session(db: &Connection) -> rusqlite::Result<()> {
    delete_settings(db, GOOGLE_SESSION_KEYS)
}

fn forget_spotify_session(db: &Connection) -> rusqlite::Result<()> {
    delete_settings(db, SPOTIFY_SESSION_KEYS)?;
    db.execute("DELETE FROM spotify_match", [])?;
    Ok(())
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LibraryItemState {
    liked: bool,
    youtube_liked: bool,
    in_library: bool,
    uploaded: bool,
    pinned: bool,
    podcast_saved: bool,
}

/// Adds measured listening time to one history row (TR-M4). Non-positive input is ignored.
fn record_playtime(db: &Connection, history_id: i64, play_time_ms: i64) -> rusqlite::Result<()> {
    if history_id <= 0 || play_time_ms <= 0 {
        return Ok(());
    }
    db.execute(
        "UPDATE history SET play_time_ms = play_time_ms + ?1 WHERE id = ?2",
        params![play_time_ms, history_id],
    )?;
    Ok(())
}

/// Minutes listened since `cutoff`: measured play time where recorded, otherwise the song duration (TR-M4).
fn listened_minutes(db: &Connection, cutoff: i64) -> rusqlite::Result<i64> {
    db.query_row("SELECT COALESCE(SUM(CASE WHEN h.play_time_ms > 0 THEN h.play_time_ms ELSE MAX(s.duration, 0) * 1000 END), 0) / 60000 FROM history h INNER JOIN songs s ON s.id = h.song_id WHERE h.played_at >= ?1", params![cutoff], |row| row.get(0))
}

fn allowed_setting(key: &str) -> bool {
    matches!(
        key,
        "playerCacheLimitMb"
            | "ytmSync"
            | "useLoginForBrowse"
            | "hideExplicit"
            | "hideVideoSongs"
            | "enableBetterLyrics"
            | "enablePaxsenix"
            | "enableLrclib"
            | "enableKugou"
            | "enableLyricsPlus"
            | "enableMusixmatch"
            | "shuffleMode"
            | "repeatMode"
            | "similarContent"
            | "autoLoadMore"
            | "disableLoadMoreWhenRepeatAll"
            | "autoDownloadOnLike"
            | "autoSkipNextOnError"
            | "persistentShuffleAcrossQueues"
            | "rememberShuffleAndRepeat"
            | "shufflePlaylistFirst"
            | "preventDuplicateTracksInQueue"
            | "varispeed"
            | "seekExtraSeconds"
            | "audioQuality"
            | "playerVolume"
            | "equalizerEnabled"
            | "equalizerLow"
            | "equalizerMid"
            | "equalizerHigh"
            | "pauseOnMute"
            | "persistentQueue"
            | "pauseListenHistory"
            | "pauseSearchHistory"
            | "sleepTimerDefault"
            | "sidebarCollapsed"
            | "lyricsProviderOrder"
            | "show_liked_playlist"
            | "show_downloaded_playlist"
            | "show_uploaded_playlist"
            | "show_top_playlist"
            | "show_cached_playlist"
    )
}

/// The backup's `song.db` is a `VACUUM INTO` copy of the live database, which includes the `settings` table
/// (Google cookies, Spotify `sp_dc`, tokens). Keep only allowlisted settings, then VACUUM again: a plain DELETE
/// leaves the removed bytes in SQLite's free pages, so they would still be readable in the file.
fn scrub_backup_copy(path: &Path) -> Result<(), String> {
    let copy =
        Connection::open(path).map_err(|error| format!("backup copy open failed: {error}"))?;
    copy.execute_batch("PRAGMA secure_delete = ON;")
        .map_err(|error| format!("backup copy pragma failed: {error}"))?;
    let keys: Vec<String> = {
        let mut statement = copy
            .prepare("SELECT key FROM settings")
            .map_err(|error| format!("backup copy settings query failed: {error}"))?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| format!("backup copy settings rows failed: {error}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("backup copy settings decode failed: {error}"))?
    };
    for key in keys.into_iter().filter(|key| !allowed_setting(key)) {
        copy.execute("DELETE FROM settings WHERE key = ?1", params![key])
            .map_err(|error| format!("backup copy scrub failed: {error}"))?;
    }
    copy.execute_batch("VACUUM;")
        .map_err(|error| format!("backup copy vacuum failed: {error}"))?;
    Ok(())
}

/// Largest `song.db` accepted from a backup (TR-H4).
const MAX_BACKUP_DATABASE_BYTES: u64 = 500 * 1024 * 1024;
/// Largest `settings.json` accepted from a backup (TR-H4).
const MAX_BACKUP_SETTINGS_BYTES: u64 = 16 * 1024 * 1024;

/// Reads a Meld Desktop backup archive. `song.db` is streamed straight to `database_out` (never held in
/// memory) and `settings.json` is returned. Only those two entries are read and entry names are never used
/// to build a path, so there is no zip-slip risk. Both the declared and the actual size of each entry are
/// capped, so a hostile archive cannot exhaust memory or disk (TR-H4).
fn extract_backup<R: Read + std::io::Seek>(
    reader: R,
    database_out: &Path,
    max_database: u64,
    max_settings: u64,
) -> Result<Vec<u8>, String> {
    let mut archive =
        ZipArchive::new(reader).map_err(|error| format!("invalid Meld Desktop backup: {error}"))?;
    let mut database_written = false;
    let mut settings_bytes = None;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("backup entry read failed: {error}"))?;
        let (name, limit) = match entry.name() {
            "song.db" => ("song.db", max_database),
            "settings.json" => ("settings.json", max_settings),
            _ => continue,
        };
        if entry.size() > limit {
            return Err(format!(
                "backup entry {name} is too large ({} bytes, limit {limit})",
                entry.size()
            ));
        }
        let mut limited = (&mut entry).take(limit + 1);
        if name == "song.db" {
            let mut out = fs::File::create(database_out)
                .map_err(|error| format!("backup database temp write failed: {error}"))?;
            let copied = std::io::copy(&mut limited, &mut out)
                .map_err(|error| format!("backup database read failed: {error}"))?;
            if copied > limit {
                return Err(format!(
                    "backup entry {name} is larger than its declared size limit ({limit} bytes)"
                ));
            }
            database_written = copied > 0;
        } else {
            let mut bytes = Vec::new();
            limited
                .read_to_end(&mut bytes)
                .map_err(|error| format!("backup settings read failed: {error}"))?;
            if bytes.len() as u64 > limit {
                return Err(format!(
                    "backup entry {name} is larger than its declared size limit ({limit} bytes)"
                ));
            }
            settings_bytes = Some(bytes);
        }
    }
    match (database_written, settings_bytes) {
        (true, Some(settings)) if !settings.is_empty() => Ok(settings),
        _ => Err("backup is missing song.db or settings.json".to_owned()),
    }
}

fn persist_local_item(
    db: &Connection,
    item: &LocalItem,
    modified_at: Option<i64>,
) -> Result<(), String> {
    db.execute(
        "INSERT INTO songs (id, title, subtitle, thumbnail, browse_id, playlist_id, video_id, set_video_id, kind, saved_at, explicit, music_video_type, liked, liked_date, in_library, is_video, uploaded, youtube_liked, album_id, duration, is_local, local_path, date_modified)
         VALUES (?1, ?2, ?3, ?4, NULL, NULL, NULL, NULL, 'song', ?5, 0, NULL, 0, NULL, 1, 0, 0, 0, NULL, ?6, 1, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, subtitle=excluded.subtitle, thumbnail=excluded.thumbnail, saved_at=excluded.saved_at, in_library=1, duration=excluded.duration, is_local=1, local_path=excluded.local_path, date_modified=excluded.date_modified",
        params![item.id, item.title, item.subtitle, item.thumbnail, now_seconds(), item.duration, item.local_path, modified_at],
    ).map_err(|error| format!("local song save failed: {error}"))?;
    if let Some(artist) = item.artists.first() {
        if let Some(artist_id) = artist.id.as_deref() {
            db.execute("INSERT INTO artists (id, name, saved_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET name=excluded.name, saved_at=excluded.saved_at", params![artist_id, artist.name, now_seconds()]).map_err(|error| format!("local artist save failed: {error}"))?;
            db.execute("INSERT OR REPLACE INTO song_artists (song_id, artist_id, position) VALUES (?1, ?2, 0)", params![item.id, artist_id]).map_err(|error| format!("local artist map failed: {error}"))?;
        }
    }
    Ok(())
}

// Not registered in generate_handler(), so unreachable from the webview - kept (not deleted) since
// the function body is otherwise untouched and easy to re-enable by re-registering it.
// Deletes the same 6 settings keys account_logout already deletes - superseded by it, kept only for reference.
#[allow(dead_code)]
#[tauri::command]
fn clear_guest_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, RuntimeState>,
) -> Result<(), String> {
    *state
        .visitor_data
        .lock()
        .map_err(|_| "visitor state poisoned")? = None;
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    db.execute("DELETE FROM settings WHERE key IN ('visitorData', 'dataSyncId', 'cookie', 'accountName', 'accountEmail', 'accountChannelHandle', 'accountAvatar')", []).map_err(|e| format!("guest session storage clear failed: {e}"))?;
    // Same as account_logout: also drop the shared WebView2 cookies so the next login cannot silently reuse them.
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.clear_all_browsing_data();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be the first plugin registered: it needs to intercept a second launch before anything else in
        // the builder chain runs, so the second process can exit immediately instead of opening a second
        // window (and, more importantly for this app, a second SQLite connection to the same database file).
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(RuntimeState::new())
        .plugin(tauri_plugin_taskbar::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // allow_file() grants are session-only; a file imported in an earlier run needs to be re-granted
            // here or it silently stops playing (still in the library list, since that comes from the database,
            // but blocked by the asset protocol scope) after every app restart.
            let db_paths: Vec<String> = {
                let state = app.state::<RuntimeState>();
                let db = state.db.lock().map_err(|_| "database state poisoned")?;
                let mut statement = db.prepare("SELECT local_path FROM songs WHERE local_path IS NOT NULL AND local_path != ''")?;
                let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
                rows.filter_map(|row| row.ok()).collect()
            };
            let scope = app.asset_protocol_scope();
            for path in db_paths { let _ = scope.allow_file(&path); }
            // Downloads, the player cache and artwork live next to the database (`%APPDATA%\\Meld Desktop`),
            // not in Tauri's identifier-based `$APPDATA`. Grant exactly those directories at runtime so
            // cached/downloaded songs keep playing whatever the configured scope resolves to.
            for directory in media_directories() {
                let _ = fs::create_dir_all(&directory);
                let _ = scope.allow_directory(&directory, true);
            }
            prewarm_player_js();
            std::thread::spawn(|| {
                if let Ok(db) = Connection::open(database_path()) {
                    let _ = clean_media_on_startup(&db);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![updates::app_update_check, updates::app_update_install, updates::app_open_releases_page, ipc::library::ytm_history, ipc::library::ytm_remove_from_history, ipc::spotify::spotify_profile, ipc::spotify::spotify_library_node, ipc::spotify::spotify_playlists, ipc::spotify::spotify_playlist_tracks, ipc::spotify::spotify_remove_from_playlist, ipc::spotify::spotify_move_in_playlist, ipc::spotify::spotify_rename_playlist, ipc::spotify::spotify_liked_tracks, ipc::spotify::spotify_match_for_youtube, ipc::spotify::spotify_override_youtube, ipc::spotify::spotify_resolve_youtube, ipc::spotify::spotify_add_to_playlist, ipc::library::ytm_delete_uploaded_song, ipc::catalog::ytm_refetch, ipc::library::ytm_toggle_episode_saved, ipc::library::local_files_pick, ipc::library::library_local_files, ipc::downloads::library_downloads, ipc::player::library_player_cache, ipc::library::ytm_toggle_podcast_saved, ipc::downloads::download_start, ipc::downloads::download_info, ipc::downloads::download_cancel, ipc::downloads::download_remove, ipc::player::player_cache_remove, ipc::player::player_cache_usage, ipc::player::player_cache_clear, ipc::library::ytm_podcast_channels, ipc::library::library_saved_podcasts, ipc::library::ytm_refresh_saved_podcasts, ipc::library::library_downloaded_podcasts, ipc::library::library_albums, ipc::library::library_artists, ipc::catalog::ytm_home, ipc::catalog::ytm_home_continuation, ipc::catalog::ytm_search, ipc::catalog::ytm_search_continuation, ipc::library::sync_youtube_library, ipc::library::ytm_add_to_playlist, ipc::library::ytm_remove_from_playlist, ipc::library::ytm_create_playlist, ipc::catalog::ytm_playlist, ipc::catalog::ytm_playlist_continuation, ipc::catalog::ytm_browse, ipc::catalog::ytm_browse_continuation, ipc::catalog::ytm_detail, ipc::catalog::ytm_detail_continuation, ipc::catalog::ytm_podcast_cache_detail_page, ipc::player::ytm_next, ipc::player::ytm_related, ipc::player::ytm_queue_continuation, ipc::player::ytm_player, ipc::player::ytm_report_stream_failure, ipc::player::ytm_playback_report, ipc::library::history_add, ipc::library::history_record_playtime, ipc::library::history_items, ipc::library::history_clear, ipc::library::library_top_songs, ipc::library::library_stats, ipc::catalog::search_history_add, ipc::catalog::search_history_items, ipc::catalog::search_history_clear, ipc::library::ytm_toggle_like, ipc::lyrics::fetch_lyrics, ipc::lyrics::fetch_lyrics_fresh, ipc::lyrics::fetch_lyrics_from_provider, ipc::library::library_toggle_liked, ipc::library::library_edit_item, ipc::library::library_refetch_item, ipc::library::ytm_toggle_library, ipc::settings::settings_get, ipc::settings::settings_set, ipc::backup::backup_create, ipc::backup::backup_restore, ipc::library::library_save_item, ipc::library::library_remove_item, ipc::library::library_songs, ipc::library::library_mix_songs, ipc::library::library_liked_songs, ipc::library::library_uploaded_songs, ipc::library::library_playlists, ipc::library::library_create_playlist, ipc::library::library_add_to_playlist, ipc::library::library_remove_from_playlist, ipc::library::library_playlist_songs, ipc::library::library_item_state, ipc::library::library_artist_state, ipc::library::library_toggle_artist_bookmarked, ipc::library::speed_dial_toggle, ipc::library::speed_dial_items, ipc::account::open_google_login, ipc::account::account_refresh_profile, ipc::account::account_logout, ipc::account::clear_local_library_keep_downloads, ipc::account::session_status, ipc::account::open_spotify_login, ipc::account::spotify_session_status, ipc::account::spotify_logout])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                // Closing the app abandons every background cache fill (PLAY-043): stop them and remove
                // their half-written files instead of leaving `.part` files behind.
                if let Ok(jobs) = player_cache_jobs().lock() {
                    for song_id in jobs.cancel_all() {
                        let _ = fs::remove_file(format!(
                            "{}.part",
                            player_cache_path(&song_id).to_string_lossy()
                        ));
                    }
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    /// End-to-end against YouTube: `MELD_LIVE_TESTS=1 cargo test live_ -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn live_cipher_clients_resolve_playable_audio() {
        if std::env::var("MELD_LIVE_TESTS").is_err() {
            return;
        }
        let video = std::env::var("MELD_LIVE_VIDEO").unwrap_or_else(|_| "dQw4w9WgXcQ".to_owned());
        tauri::async_runtime::block_on(async {
            let started = std::time::Instant::now();
            let sts = ensure_player_js().await.expect("player js");
            eprintln!("player js ready in {:?} (sts {sts})", started.elapsed());
            for key in std::env::var("MELD_LIVE_CLIENTS")
                .unwrap_or_else(|_| {
                    "WEB_REMIX,ANDROID_VR_1_65_10,VISIONOS_0_1,ANDROID_VR_1_43_32,IOS_21_03_3"
                        .to_owned()
                })
                .split(',')
            {
                let client = resolver::CLIENTS.iter().find(|c| c.key == key).unwrap();
                let started = std::time::Instant::now();
                match try_player_client(
                    &video,
                    None,
                    "high",
                    "",
                    client,
                    None,
                    client.uses_player_js.then_some(sts),
                )
                .await
                {
                    Ok(payload) => {
                        // A resolved URL must serve the whole file (the download path), not just the start.
                        let response = http()
                            .get(&payload.stream_url)
                            .header(RANGE, "bytes=0-")
                            .timeout(TRANSFER_TIMEOUT)
                            .send()
                            .await
                            .unwrap();
                        let status = response.status();
                        let expected = response.content_length();
                        let body = response.bytes().await.unwrap();
                        eprintln!(
                            "{key}: {} {} in {:?} -> HTTP {status}, {} of {expected:?} bytes",
                            payload.mime_type,
                            payload.bitrate,
                            started.elapsed(),
                            body.len()
                        );
                        assert_eq!(status.as_u16(), 206, "{key}");
                        assert_eq!(Some(body.len() as u64), expected, "{key}");
                    }
                    Err((category, detail)) => eprintln!("{key}: {} ({detail})", category.label()),
                }
            }
        });
    }

    #[test]
    fn search_reads_top_card_and_item_sections() {
        let response: Value = serde_json::from_str(include_str!(
            "../tests/fixtures/search-2026-07-item-sections.json"
        ))
        .unwrap();
        let page = parse_search(&response);
        let ids: Vec<&str> = page.items.iter().map(|item| item.id.as_str()).collect();
        // Top result card (official video) first, then the item sections in order, deduplicated.
        assert_eq!(ids[0], "4NRXx6U8ABQ");
        assert_eq!(page.items[0].kind, "song");
        assert_eq!(page.items[0].title, "Blinding Lights (Official Video)");
        assert!(page.items[0]
            .artists
            .iter()
            .any(|artist| artist.name == "The Weeknd"));
        assert!(ids.contains(&"J7p4bzqLvCw"));
        assert!(page
            .items
            .iter()
            .any(|item| item.kind == "artist" && item.title == "The Weeknd"));
        assert_eq!(ids.iter().filter(|id| **id == "J7p4bzqLvCw").count(), 1);
        assert!(page.items.len() >= 5, "{ids:?}");
    }

    #[test]
    fn media_directories_sit_next_to_the_database() {
        let root = database_path().parent().unwrap().to_path_buf();
        let directories = media_directories();
        assert_eq!(
            directories,
            vec![
                root.join("downloads"),
                root.join("player-cache"),
                root.join("artwork")
            ]
        );
        assert_eq!(
            player_cache_path("x").parent().unwrap(),
            root.join("player-cache")
        );
        // tauri.conf.json must use `$DATA` (= %APPDATA%), not `$APPDATA` (= %APPDATA%\<identifier>).
        let conf: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let scope = conf["app"]["security"]["assetProtocol"]["scope"]
            .as_array()
            .unwrap();
        assert!(root.ends_with("Meld Desktop"));
        assert!(
            scope
                .iter()
                .all(|entry| entry.as_str().unwrap().starts_with("$DATA/Meld Desktop/")),
            "{scope:?}"
        );
    }

    #[test]
    fn player_request_body_matches_client_contract() {
        let tv = resolver::CLIENTS
            .iter()
            .find(|c| c.key == "TVHTML5")
            .unwrap();
        let body = player_request_body(
            "vid",
            Some("PL1"),
            "VIS",
            tv,
            Some(20725),
            Some("DSID"),
            "cpn1234567890abc",
        );
        assert_eq!(body["context"]["client"]["clientName"], "TVHTML5");
        assert_eq!(
            body["playbackContext"]["contentPlaybackContext"]["signatureTimestamp"],
            20725
        );
        assert_eq!(body["playlistId"], "PL1");
        assert_eq!(body["cpn"], "cpn1234567890abc");
        assert_eq!(body["context"]["user"]["onBehalfOfUser"], "DSID");
        let vr = resolver::CLIENTS
            .iter()
            .find(|c| c.key == "ANDROID_VR_1_65_10")
            .unwrap();
        let body = player_request_body("vid", None, "VIS", vr, None, None, "c");
        assert!(body.get("playbackContext").is_none() && body.get("playlistId").is_none());
        assert_eq!(body["context"]["client"]["androidSdkVersion"], 32);
        let embedded = resolver::CLIENTS.iter().find(|c| c.embedded).unwrap();
        let body = player_request_body("vid", None, "VIS", embedded, Some(1), None, "c");
        assert_eq!(
            body["context"]["thirdParty"]["embedUrl"],
            "https://www.youtube.com/"
        );
        assert_eq!(body["context"]["client"]["clientScreen"], "EMBED");
    }

    #[test]
    fn audio_quality_selects_high_or_low_format_including_ciphered() {
        let response = json!({
            "playabilityStatus": { "status": "OK" },
            "videoDetails": { "title": "Quality", "author": "Artist", "lengthSeconds": "10" },
            "streamingData": {
                "expiresInSeconds": 60,
                "adaptiveFormats": [
                    { "mimeType": "audio/mp4; codecs=\\\"mp4a.40.2\\\"", "bitrate": 100000, "url": "https://example.test/low" },
                    { "mimeType": "audio/webm; codecs=\\\"opus\\\"", "bitrate": 120000, "url": "https://example.test/high" },
                    { "mimeType": "audio/mp4", "bitrate": 320000, "signatureCipher": "s=SIG&sp=sig&url=https%3A%2F%2Frr1.googlevideo.com%2Fvideoplayback" }
                ]
            }
        });
        // AUTO behaves like HIGH (no metered-network signal on desktop yet); ciphered formats are now
        // candidates too (PLAY-002) and are solved before use.
        let pick = |quality: &str| {
            resolver::audio_candidates(&response, quality.eq_ignore_ascii_case("low"))
                .into_iter()
                .next()
                .expect("format")
        };
        assert!(
            matches!(pick("high").url, resolver::FormatUrl::Ciphered { ref s, .. } if s == "SIG")
        );
        assert_eq!(pick("auto").bitrate, pick("high").bitrate);
        assert_eq!(
            pick("low").url,
            resolver::FormatUrl::Direct("https://example.test/low".to_owned())
        );
        let metadata = player_metadata(&response, "video");
        assert_eq!((metadata.expires_in_seconds, metadata.duration), (60, 10));
        assert_eq!(metadata.title.as_deref(), Some("Quality"));
    }

    fn cache_test_db() -> Connection {
        let store = MemKeyStore(Mutex::new(None));
        let db = Connection::open_in_memory().expect("db");
        initialize_database(&db, &store).expect("schema");
        db
    }

    fn write_file(path: &Path, bytes: usize) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, vec![1_u8; bytes]).unwrap();
    }

    #[test]
    fn player_cache_quota_evicts_oldest_files_and_never_downloads() {
        let root = std::env::temp_dir().join(format!("meld-quota-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let db = cache_test_db();
        db.execute(
            "INSERT INTO settings (key, value) VALUES ('playerCacheLimitMb', '512')",
            [],
        )
        .unwrap();
        // Three 200 MB rows (files are tiny; the row byte counts drive the quota) in a 512 MB cache.
        for (index, used_at) in [(0, 300), (1, 100), (2, 200)] {
            let path = root.join(format!("cache/{index}.audio"));
            write_file(&path, 16);
            db.execute(
                "INSERT INTO player_cache (song_id, path, bytes, cached_at, quality) VALUES (?1, ?2, ?3, ?4, 'auto')",
                params![format!("song-{index}"), path.to_string_lossy().to_string(), 200 * 1024 * 1024, used_at],
            )
            .unwrap();
        }
        let download = root.join("downloads/d.audio");
        write_file(&download, 16);
        db.execute(
            "INSERT INTO downloads (song_id, path, bytes, total_bytes, state, downloaded_at) VALUES ('song-1', ?1, 999999999, 999999999, 'completed', 1)",
            params![download.to_string_lossy().to_string()],
        )
        .unwrap();
        assert_eq!(enforce_player_cache_quota(&db).unwrap(), 1);
        let left: Vec<String> = db
            .prepare("SELECT song_id FROM player_cache ORDER BY song_id")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(left, vec!["song-0".to_owned(), "song-2".to_owned()]);
        assert!(!root.join("cache/1.audio").exists());
        assert!(download.exists(), "offline downloads are never evicted");
        // Turning the cache off empties it.
        db.execute(
            "UPDATE settings SET value = '0' WHERE key = 'playerCacheLimitMb'",
            [],
        )
        .unwrap();
        assert_eq!(enforce_player_cache_quota(&db).unwrap(), 2);
        assert!(download.exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn startup_cleanup_removes_orphans_but_keeps_downloads_and_resumable_parts() {
        let root = std::env::temp_dir().join(format!("meld-cleanup-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let cache = root.join("player-cache");
        let downloads = root.join("downloads");
        let db = cache_test_db();
        let kept = cache.join("kept.audio");
        write_file(&kept, 8);
        write_file(&cache.join("orphan.audio"), 8);
        write_file(&cache.join("abandoned.audio.part"), 8);
        db.execute(
            "INSERT INTO player_cache (song_id, path, bytes, cached_at, quality) VALUES ('kept', ?1, 8, 1, 'auto'), ('vanished', ?2, 8, 1, 'auto')",
            params![kept.to_string_lossy().to_string(), cache.join("vanished.audio").to_string_lossy().to_string()],
        )
        .unwrap();
        let finished = downloads.join("finished.audio");
        let unknown_finished = downloads.join("not-in-db.audio");
        let resumable = downloads.join("resume.audio");
        write_file(&finished, 8);
        write_file(&unknown_finished, 8);
        write_file(&downloads.join("resume.audio.part"), 8);
        write_file(&downloads.join("stale.audio.part"), 8);
        db.execute(
            "INSERT INTO downloads (song_id, path, bytes, state, downloaded_at) VALUES ('f', ?1, 8, 'completed', 1), ('r', ?2, 8, 'failed', 1)",
            params![finished.to_string_lossy().to_string(), resumable.to_string_lossy().to_string()],
        )
        .unwrap();
        let (deleted, _) = clean_media_dirs(&db, Some(&cache), Some(&downloads)).unwrap();
        assert_eq!(deleted, 3);
        assert!(kept.exists());
        assert!(!cache.join("orphan.audio").exists());
        assert!(!cache.join("abandoned.audio.part").exists());
        assert!(
            finished.exists() && unknown_finished.exists(),
            "finished downloads are never deleted"
        );
        assert!(downloads.join("resume.audio.part").exists());
        assert!(!downloads.join("stale.audio.part").exists());
        let vanished: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM player_cache WHERE song_id = 'vanished'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(vanished, 0);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn player_cache_limit_setting_is_validated() {
        assert!(allowed_setting("playerCacheLimitMb"));
    }

    #[test]
    fn playback_cache_serves_only_the_requested_quality() {
        // PLAY-021: switching Audio quality must not keep playing a copy cached at the other quality.
        let db = cache_test_db();
        let dir = std::env::temp_dir().join(format!("meld-quality-cache-{}", std::process::id()));
        let low = dir.join("low.audio");
        write_file(&low, 16);
        db.execute(
            "INSERT INTO player_cache (song_id, path, bytes, cached_at, quality) VALUES ('song', ?1, 16, 1, 'low')",
            params![low.to_string_lossy().to_string()],
        )
        .unwrap();
        assert_eq!(
            cached_player_file(&db, "song", "low").unwrap(),
            Some(low.to_string_lossy().to_string())
        );
        assert_eq!(cached_player_file(&db, "song", "high").unwrap(), None);
        assert_eq!(cached_player_file(&db, "song", "auto").unwrap(), None);
        assert_eq!(cached_player_file(&db, "other", "low").unwrap(), None);
        fs::remove_file(&low).unwrap();
        assert_eq!(
            cached_player_file(&db, "song", "low").unwrap(),
            None,
            "a vanished file is not served"
        );
        assert_eq!(normalize_audio_quality(Some("low")), "low");
        assert_eq!(normalize_audio_quality(Some("high")), "high");
        assert_eq!(normalize_audio_quality(Some("best")), "auto");
        assert_eq!(normalize_audio_quality(None), "auto");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn refused_download_urls_are_reresolved_and_stale_partials_restart() {
        use download_resume::Resume;
        use reqwest::StatusCode;
        assert_eq!(
            download_retry(StatusCode::FORBIDDEN, Resume::Fresh),
            DownloadRetry::Reresolve
        );
        assert_eq!(
            download_retry(StatusCode::GONE, Resume::Restart),
            DownloadRetry::Reresolve
        );
        assert_eq!(
            download_retry(StatusCode::RANGE_NOT_SATISFIABLE, Resume::Restart),
            DownloadRetry::Restart
        );
        assert_eq!(
            download_retry(StatusCode::PARTIAL_CONTENT, Resume::Restart),
            DownloadRetry::Restart
        );
        assert_eq!(
            download_retry(StatusCode::PARTIAL_CONTENT, Resume::Append),
            DownloadRetry::Proceed
        );
        assert_eq!(
            download_retry(StatusCode::OK, Resume::Fresh),
            DownloadRetry::Proceed
        );
        assert_eq!(
            download_retry(StatusCode::SERVICE_UNAVAILABLE, Resume::Fresh),
            DownloadRetry::Proceed
        );
    }

    #[test]
    fn refused_stream_excludes_client_for_song_and_demotes_it() {
        mark_stream_refused("refused-test-video", Some("IOS_21_03_3"));
        mark_stream_refused("refused-test-video", Some("not-a-client"));
        mark_stream_refused("refused-test-video", None);
        let now = std::time::Instant::now();
        let excluded = resolver_memory()
            .lock()
            .unwrap()
            .excluded("refused-test-video", now);
        assert_eq!(excluded, vec!["IOS_21_03_3"]);
        assert!(client_health()
            .lock()
            .unwrap()
            .is_demoted("IOS_21_03_3", now));
        client_health().lock().unwrap().clear();
    }

    #[test]
    fn artwork_extension_accepts_common_image_mimes() {
        assert_eq!(artwork_extension("image/jpeg; charset=binary"), "jpg");
        assert_eq!(artwork_extension("image/png"), "png");
        assert_eq!(artwork_extension("image/webp"), "webp");
        assert_eq!(artwork_extension("image/unknown"), "cover");
    }

    #[test]
    fn library_parser_selects_requested_initial_tab() {
        let song = |title: &str| {
            json!({
                "musicResponsiveListItemRenderer": {
                    "playlistItemData": { "videoId": format!("{title}-id") },
                    "flexColumns": [
                        { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [{ "text": title }] } } },
                        { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [{ "text": "Uploaded" }] } } }
                    ]
                }
            })
        };
        let response = json!({
            "contents": { "singleColumnBrowseResultsRenderer": { "tabs": [
                { "tabRenderer": { "content": { "sectionListRenderer": { "contents": [{ "musicShelfRenderer": { "contents": [song("Library Song")] } }] } } } },
                { "tabRenderer": { "content": { "sectionListRenderer": { "contents": [{ "musicShelfRenderer": { "contents": [song("Uploaded Song")] } }] } } } }
            ] } }
        });
        let (library, _) = parse_library_page(&response, 0);
        let (uploaded, _) = parse_library_page(&response, 1);
        assert_eq!(
            library.first().map(|item| item.title.as_str()),
            Some("Library Song")
        );
        assert_eq!(
            uploaded.first().map(|item| item.title.as_str()),
            Some("Uploaded Song")
        );
    }

    #[test]
    fn search_parser_retains_source_continuation() {
        let response = json!({
            "contents": { "tabbedSearchResultsRenderer": { "tabs": [{ "tabRenderer": { "content": { "sectionListRenderer": { "contents": [{ "musicShelfRenderer": { "contents": [], "continuations": [{ "nextContinuationData": { "continuation": "search-next" } }] } }] } } } }] } }
        });
        let page = parse_search(&response);
        assert!(page.items.is_empty());
        assert_eq!(page.continuation.as_deref(), Some("search-next"));
    }

    #[test]
    fn lrclib_cleanup_removes_source_title_noise() {
        assert_eq!(
            clean_lyrics_title("Song Name (Official Video) (feat. Guest)"),
            "Song Name"
        );
        assert_eq!(clean_lyrics_title("Song Name [Lyrics]"), "Song Name");
    }

    #[test]
    fn lrclib_similarity_and_duration_use_source_thresholds() {
        assert!(lyrics_similarity("Song Name", "song name") > 0.99);
        assert!(lyrics_similarity("Song Name", "Different") < 0.6);
        let track = LrcLibTrack {
            track_name: "Song".to_owned(),
            artist_name: "Artist".to_owned(),
            duration: 201.6,
            plain_lyrics: None,
            synced_lyrics: Some("[00:01.00]line".to_owned()),
        };
        assert_eq!(duration_delta(&track, 202), 0);
        assert!(duration_delta(&track, 207) <= 5);
        assert!(duration_delta(&track, 208) > 5);
    }

    #[test]
    fn paxsenix_title_cleanup_and_content_parser_match_source_shape() {
        assert_eq!(paxsenix_clean_title("Song (Official Video)"), "Song");
        let content =
            json!([{ "timestamp": 1250, "text": [{ "text": "Hello" }, { "text": "world" }] }]);
        assert_eq!(
            paxsenix_content_to_lrc(&content).as_deref(),
            Some("[00:01.25]Hello world")
        );
    }

    #[test]
    fn musixmatch_response_paths_are_source_named() {
        let value = json!({ "message": { "body": { "macro_calls": { "track.subtitles.get": { "message": { "body": { "subtitle_list": [{ "subtitle": { "subtitle_body": "[00:01.00]Line" } }] } } } } } } });
        assert_eq!(value.pointer("/message/body/macro_calls/track.subtitles.get/message/body/subtitle_list/0/subtitle/subtitle_body").and_then(Value::as_str), Some("[00:01.00]Line"));
    }

    #[test]
    fn lyrics_credit_filter_matches_source_prefix_rules() {
        let filtered = filter_lyrics_credit_lines(
            "[00:01.00]synced by someone\n[00:02.00]Real line\n{bg}lyrics by someone",
        );
        assert_eq!(filtered, "[00:02.00]Real line");
    }

    #[test]
    fn kugou_normalize_keeps_lrc_and_cuts_credit_lines() {
        let normalized = kugou_normalize_lrc(
            "[00:00.00]作词: Someone\n[00:01.00]Real line\n[00:02.00]Next line",
        );
        assert_eq!(normalized, "[00:01.00]Real line\n[00:02.00]Next line");
    }

    #[test]
    fn parses_lrc_lines_and_multiple_timestamps() {
        let lines = parse_lyric_lines("[00:01.20]First line\n[00:02.00][00:03.50]Second line");
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[0].time_ms, 1_200);
        assert_eq!(lines[1].time_ms, 2_000);
        assert_eq!(lines[2].time_ms, 3_500);
        assert_eq!(lines[1].text, "Second line");
    }

    #[test]
    fn betterlyrics_ttml_converts_source_timestamps_to_lrc() {
        let ttml = r#"<tt><body><div><p begin="0:00:01.250"><span>Hello</span> world</p><p begin="2.5s">Next &amp; line</p></div></body></tt>"#;
        let lrc = betterlyrics_to_lrc(ttml).expect("TTML must produce LRC");
        assert_eq!(lrc, "[00:01.25]Hello world\n[00:02.50]Next & line");
    }

    #[test]
    fn provider_time_accepts_ttml_units() {
        assert_eq!(parse_provider_time("1500ms"), Some(1_500));
        assert_eq!(parse_provider_time("1.5s"), Some(1_500));
        assert_eq!(parse_provider_time("00:01.50"), Some(1_500));
    }

    #[test]
    fn typed_search_parser_checks_episode_before_song() {
        let renderer = json!({
            "playlistItemData": {"videoId": "episode-id"},
            "flexColumns": [
                {"musicResponsiveListItemFlexColumnRenderer": {"text": {"runs": [{"text": "Episode title"}]}}},
                {"musicResponsiveListItemFlexColumnRenderer": {"text": {"runs": [{"text": "Episode"}, {"text": " • "}, {"text": "Podcast"}]}}}
            ],
            "thumbnail": {"musicThumbnailRenderer": {"thumbnail": {"thumbnails": [{"url": "https://example.invalid/thumb"}]}}}
        });
        let item = parse_responsive_typed(&renderer).expect("typed episode must parse");
        assert_eq!(item.kind, "episode");
        assert_eq!(item.video_id.as_deref(), Some("episode-id"));
    }

    #[test]
    fn podcast_library_parser_keeps_episode_items_from_music_shelf() {
        let response = json!({
            "contents": {
                "singleColumnBrowseResultsRenderer": {
                    "tabs": [{
                        "tabRenderer": {
                            "content": {
                                "sectionListRenderer": {
                                    "contents": [{
                                        "musicShelfRenderer": {
                                            "contents": [{
                                                "musicResponsiveListItemRenderer": {
                                                    "playlistItemData": { "videoId": "episode-id" },
                                                    "flexColumns": [
                                                        { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [{ "text": "Episode title" }] } } },
                                                        { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [{ "text": "Episode" }] } } }
                                                    ],
                                                    "thumbnail": { "musicThumbnailRenderer": { "thumbnail": { "thumbnails": [{ "url": "https://example.invalid/episode" }] } } }
                                                }
                                            }]
                                        }
                                    }]
                                }
                            }
                        }
                    }]
                }
            }
        });
        let (items, continuation) = parse_library_items(&response, 0);
        assert!(continuation.is_none());
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].kind, "episode");
        assert_eq!(items[0].video_id.as_deref(), Some("episode-id"));
    }

    #[test]
    fn spotify_hash_registry_preserves_rotation_fallback() {
        let candidates = spotify_hash_candidates("profileAttributes")
            .expect("profileAttributes must be registered");
        assert_eq!(candidates.len(), 2);
        assert_ne!(candidates[0], candidates[1]);
        assert_eq!(
            candidates[0],
            "08ffb4730af3746e04a8301396f20875dbbce10c75243803091a9274eacc8ac0"
        );
    }

    #[test]
    fn spotify_totp_matches_rfc6238_vector() {
        assert_eq!(
            spotify_totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59),
            "287082"
        );
    }

    #[test]
    fn spotify_base32_ignores_padding() {
        assert_eq!(
            base32_decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ="),
            base32_decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ")
        );
    }

    #[test]
    fn queue_panel_parser_preserves_set_video_id() {
        let renderer = json!({
            "videoId": "song-id",
            "playlistSetVideoId": "set-id",
            "title": {"runs": [{"text": "Song"}]},
            "longBylineText": {"runs": [{"text": "Artist"}]},
            "thumbnail": {"thumbnails": [{"url": "https://example.invalid/thumb"}]},
            "navigationEndpoint": {"watchEndpoint": {"videoId": "song-id", "playlistId": "VLplaylist"}}
        });
        let item = parse_queue_panel_item(&renderer).expect("queue item must parse");
        assert_eq!(item.set_video_id.as_deref(), Some("set-id"));
        assert_eq!(item.playlist_id.as_deref(), Some("VLplaylist"));
    }

    #[test]
    fn browse_parser_reads_typed_items_and_continuation_pages() {
        let song = json!({
            "musicResponsiveListItemRenderer": {
                "playlistItemData": { "videoId": "browse-song" },
                "flexColumns": [
                    { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [{ "text": "Browse song" }] } } },
                    { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [{ "text": "Artist" }] } } }
                ]
            }
        });
        let first = json!({
            "header": { "musicHeaderRenderer": { "title": { "runs": [{ "text": "Charts" }] } } },
            "contents": { "singleColumnBrowseResultsRenderer": { "tabs": [{ "tabRenderer": { "content": { "sectionListRenderer": { "contents": [{ "musicShelfRenderer": { "contents": [song] } }], "continuations": [{ "nextContinuationData": { "continuation": "browse-next" } }] } } } }] } }
        });
        let page = parse_browse_response(&first, "FEmusic_charts");
        assert_eq!(page.title, "Charts");
        assert_eq!(page.items.len(), 1);
        assert_eq!(page.items[0].video_id.as_deref(), Some("browse-song"));
        assert_eq!(page.continuation.as_deref(), Some("browse-next"));

        let continuation = json!({
            "continuationContents": { "sectionListContinuation": { "contents": [{ "musicShelfRenderer": { "contents": [song] } }], "continuations": [] } }
        });
        let next = parse_browse_response(&continuation, "FEmusic_charts");
        assert_eq!(next.items.len(), 1);
        assert_eq!(next.items[0].id, "browse-song");
    }

    #[test]
    fn browse_parser_reads_navigation_tiles() {
        let response = json!({
            "contents": { "singleColumnBrowseResultsRenderer": { "tabs": [{ "tabRenderer": { "content": { "sectionListRenderer": { "contents": [{ "gridRenderer": { "items": [{ "musicNavigationButtonRenderer": { "buttonText": { "runs": [{ "text": "Moods" }] }, "clickCommand": { "browseEndpoint": { "browseId": "FEmusic_moods_and_genres" } } } }] } }] } } } }] } }
        });
        let page = parse_browse_response(&response, "FEmusic_explore");
        assert_eq!(page.items.len(), 1);
        assert_eq!(page.items[0].kind, "browse");
        assert_eq!(
            page.items[0].browse_id.as_deref(),
            Some("FEmusic_moods_and_genres")
        );
    }

    #[test]
    fn remote_history_parser_preserves_shelf_sections_and_song_metadata() {
        let song = |title: &str, video_id: &str| {
            json!({
                "musicResponsiveListItemRenderer": {
                    "playlistItemData": { "videoId": video_id },
                    "flexColumns": [
                        { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [{ "text": title }] } } },
                        { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [{ "text": "Artist" }] } } },
                        { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [{ "text": "Album artist" }] } } },
                        { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [{ "text": "Album", "navigationEndpoint": { "browseEndpoint": { "browseId": "album-id" } } }] } } }
                    ],
                    "thumbnail": { "musicThumbnailRenderer": { "thumbnail": { "thumbnails": [{ "url": "https://example.invalid/thumb" }] } } },
                    "menu": { "menuRenderer": { "items": [{ "menuServiceItemRenderer": { "icon": { "iconType": "REMOVE_FROM_HISTORY" }, "serviceEndpoint": { "feedbackEndpoint": { "feedbackToken": "remove-token" } } } }] } }
                }
            })
        };
        let response = json!({
            "contents": { "singleColumnBrowseResultsRenderer": { "tabs": [{ "tabRenderer": { "content": { "sectionListRenderer": { "contents": [
                { "musicShelfRenderer": { "title": { "runs": [{ "text": "Today" }] }, "contents": [song("First", "first-id"), song("Second", "second-id")] } },
                { "musicShelfRenderer": { "title": { "runs": [{ "text": "Yesterday" }] }, "contents": [song("Old", "old-id")] } }
            ] } } } }] } }
        });
        let page = parse_remote_history(&response);
        assert_eq!(page.sections.len(), 2);
        assert_eq!(page.sections[0].title, "Today");
        assert_eq!(
            page.sections[0].songs[1].video_id.as_deref(),
            Some("second-id")
        );
        assert_eq!(
            page.sections[0].songs[0].history_remove_token.as_deref(),
            Some("remove-token")
        );
        assert_eq!(
            page.sections[0].songs[0].album_id.as_deref(),
            Some("album-id")
        );
        assert_eq!(
            page.sections[0].songs[0].album_title.as_deref(),
            Some("Album")
        );
        assert_eq!(page.sections[1].songs[0].title, "Old");
    }
    #[test]
    fn account_parser_reads_active_account_avatar() {
        let response = json!({
            "activeAccountHeaderRenderer": {
                "accountName": { "simpleText": "Meld User" },
                "email": { "simpleText": "user@example.com" },
                "channelHandle": { "simpleText": "@melduser" },
                "avatar": { "thumbnails": [{ "url": "https://example.invalid/avatar-small" }, { "url": "https://example.invalid/avatar-large" }] }
            }
        });
        let (name, email, handle, avatar) =
            account_info_from_response(&response).expect("account header must parse");
        assert_eq!(name, "Meld User");
        assert_eq!(email.as_deref(), Some("user@example.com"));
        assert_eq!(handle.as_deref(), Some("@melduser"));
        assert_eq!(
            avatar.as_deref(),
            Some("https://example.invalid/avatar-large")
        );
    }

    // --- regression tests for the review fixes (begin) ---
    fn test_item(id: &str) -> YtItem {
        serde_json::from_value(json!({ "id": id, "kind": "song", "title": id, "subtitle": "", "artists": [], "explicit": false, "videoId": id })).expect("test item")
    }

    fn fresh_db() -> Connection {
        let db = Connection::open_in_memory().expect("in-memory database");
        db.execute_batch(SCHEMA_SQL).expect("schema");
        db
    }

    fn seed_likes(db: &Connection) {
        // A and C are liked on YouTube. B was liked locally only (for example while offline or signed out).
        for (id, liked, youtube_liked) in [("A", 1, 1), ("B", 1, 0), ("C", 1, 1)] {
            db.execute("INSERT INTO songs (id, title, kind, saved_at, liked, youtube_liked) VALUES (?1, ?1, 'song', 0, ?2, ?3)", params![id, liked, youtube_liked]).expect("seed");
        }
    }

    fn liked_ids(db: &Connection) -> Vec<String> {
        let mut statement = db
            .prepare("SELECT id FROM songs WHERE liked = 1 ORDER BY id")
            .expect("prepare");
        statement
            .query_map([], |row| row.get::<_, String>(0))
            .expect("query")
            .map(|row| row.expect("row"))
            .collect()
    }

    fn contains_bytes(haystack: &[u8], needle: &[u8]) -> bool {
        haystack
            .windows(needle.len())
            .any(|window| window == needle)
    }

    #[test]
    fn backup_copy_scrub_removes_credentials_from_the_file_itself() {
        let dir = std::env::temp_dir().join(format!(
            "meld-backup-test-{}-{}",
            std::process::id(),
            now_millis()
        ));
        fs::create_dir_all(&dir).expect("temp dir");
        let live_path = dir.join("live.db");
        let copy_path = dir.join("copy.db");
        let live = Connection::open(&live_path).expect("live db");
        live.execute_batch(SCHEMA_SQL).expect("schema");
        for index in 0..300 {
            live.execute(
                "INSERT INTO songs (id, title, kind, saved_at) VALUES (?1, ?2, 'song', 0)",
                params![
                    format!("s{index}"),
                    format!("Song number {index} with some padding text")
                ],
            )
            .expect("song");
        }
        for (key, value) in [
            ("hideExplicit", "true"),
            ("cookie", "SAPISID=TOPSECRETCOOKIE0123456789"),
            ("spotifySpDc", "TOPSECRETSPDC1122334455"),
            ("spotifyAccessToken", "TOPSECRETTOKEN5566778899"),
        ] {
            live.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)",
                params![key, value],
            )
            .expect("setting");
        }
        live.execute(
            "VACUUM INTO ?1",
            params![copy_path.to_string_lossy().to_string()],
        )
        .expect("vacuum into");
        let secrets: [&[u8]; 3] = [b"TOPSECRETCOOKIE", b"TOPSECRETSPDC", b"TOPSECRETTOKEN"];
        let before = fs::read(&copy_path).expect("read copy");
        assert!(
            secrets.iter().all(|secret| contains_bytes(&before, secret)),
            "premise: VACUUM INTO copies the credentials"
        );
        scrub_backup_copy(&copy_path).expect("scrub");
        let after = fs::read(&copy_path).expect("read scrubbed copy");
        assert!(
            secrets.iter().all(|secret| !contains_bytes(&after, secret)),
            "credentials must not remain anywhere in the file"
        );
        let copy = Connection::open(&copy_path).expect("open copy");
        let keys: Vec<String> = copy
            .prepare("SELECT key FROM settings")
            .expect("prepare")
            .query_map([], |row| row.get(0))
            .expect("query")
            .map(|row| row.expect("row"))
            .collect();
        assert_eq!(keys, vec!["hideExplicit".to_owned()]);
        let songs: i64 = copy
            .query_row("SELECT COUNT(*) FROM songs", [], |row| row.get(0))
            .expect("count");
        assert_eq!(songs, 300);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn youtube_sync_keeps_local_only_likes_and_drops_likes_removed_on_youtube() {
        let mut db = fresh_db();
        seed_likes(&db);
        apply_youtube_sync(&mut db, "liked", &[test_item("A")], &[], &[], &[], 100).expect("sync");
        assert_eq!(liked_ids(&db), vec!["A", "B"]);
    }

    #[test]
    fn youtube_sync_refuses_to_wipe_local_data_when_the_fetch_is_empty() {
        let mut db = fresh_db();
        seed_likes(&db);
        assert!(apply_youtube_sync(&mut db, "liked", &[], &[], &[], &[], 100).is_err());
        assert_eq!(liked_ids(&db), vec!["A", "B", "C"]);
        db.execute("INSERT INTO playlists (id, title, kind, saved_at, source) VALUES ('P', 'P', 'playlist', 0, 'youtube')", []).expect("playlist");
        assert!(apply_youtube_sync(&mut db, "playlists", &[], &[], &[], &[], 100).is_err());
        let mut empty = fresh_db();
        assert!(
            apply_youtube_sync(&mut empty, "liked", &[], &[], &[], &[], 100).is_ok(),
            "an account with nothing synced yet may sync an empty list"
        );
    }

    #[test]
    fn spotify_matcher_handles_non_latin_titles() {
        let title_score = |left: &str, right: &str| {
            spotify_bigram_similarity(&spotify_normalize(left), &spotify_normalize(right))
        };
        assert_eq!(
            spotify_normalize("Blinding Lights (Remastered 2020)"),
            "blinding lights"
        );
        assert!(
            !spotify_normalize("\u{62a}\u{645}\u{644}\u{64a} \u{645}\u{639}\u{627}\u{643}")
                .is_empty(),
            "Arabic must survive normalization"
        );
        assert!(title_score("\u{62a}\u{645}\u{644}\u{64a} \u{645}\u{639}\u{627}\u{643}", "\u{62d}\u{628}\u{64a}\u{628}\u{64a} \u{64a}\u{627} \u{646}\u{648}\u{631} \u{627}\u{644}\u{639}\u{64a}\u{646}") < 0.5, "different Arabic titles must not match");
        assert!(
            title_score(
                "\u{5343}\u{672c}\u{685c}",
                "\u{591c}\u{306b}\u{99c6}\u{3051}\u{308b}"
            ) < 0.5,
            "different Japanese titles must not match"
        );
        assert_eq!(
            title_score(
                "\u{591c}\u{306b}\u{99c6}\u{3051}\u{308b}",
                "\u{591c}\u{306b}\u{99c6}\u{3051}\u{308b}"
            ),
            1.0
        );
        assert_eq!(
            spotify_bigram_similarity("", ""),
            0.0,
            "two empty titles are not a match"
        );
    }

    #[test]
    fn parse_artists_keeps_only_linked_artists_and_falls_back_to_plain_credits() {
        let search_row = json!({ "runs": [
            { "text": "Song" }, { "text": " \u{2022} " },
            { "text": "The Weeknd", "navigationEndpoint": { "browseEndpoint": { "browseId": "UCoUxsWakJucWg46KW5RsvPw" } } },
            { "text": " \u{2022} " },
            { "text": "After Hours", "navigationEndpoint": { "browseEndpoint": { "browseId": "MPREb_4pL8gzRtw1p", "browseEndpointContextSupportedConfigs": { "browseEndpointContextMusicConfig": { "pageType": "MUSIC_PAGE_TYPE_ALBUM" } } } } },
            { "text": " \u{2022} " }, { "text": "3:22" }
        ] });
        let names: Vec<String> = parse_artists(Some(&search_row))
            .into_iter()
            .map(|artist| artist.name)
            .collect();
        assert_eq!(names, vec!["The Weeknd"]);
        let uploaded =
            json!({ "runs": [{ "text": "Artist A" }, { "text": ", " }, { "text": "Artist B" }] });
        let plain: Vec<String> = parse_artists(Some(&uploaded))
            .into_iter()
            .map(|artist| artist.name)
            .collect();
        assert_eq!(plain, vec!["Artist A", "Artist B"]);
    }

    #[test]
    fn clean_lyrics_artist_does_not_panic_when_lowercasing_changes_byte_length() {
        assert_eq!(clean_lyrics_artist("\u{1e9e} and x"), "\u{1e9e}");
        assert_eq!(clean_lyrics_artist("Drake feat. Rihanna"), "Drake");
        assert_eq!(clean_lyrics_artist("Daft Punk"), "Daft Punk");
    }

    #[test]
    fn active_download_guard_clears_the_map_on_early_return() {
        fn start_then_fail(id: &str) -> Result<(), String> {
            download_cancel_map()
                .lock()
                .expect("map")
                .insert(id.to_owned(), Arc::new(AtomicBool::new(false)));
            let _guard = ActiveDownloadGuard(id.to_owned());
            Err("simulated early return".to_owned())
        }
        assert!(start_then_fail("guard-test-song").is_err());
        assert!(!download_cancel_map()
            .lock()
            .expect("map")
            .contains_key("guard-test-song"));
    }

    #[test]
    fn like_state_save_binds_every_parameter_and_is_repeatable() {
        let db = fresh_db();
        let item = test_item("like-test");
        save_like_state(&db, &item, true).expect("insert path");
        let youtube_liked: i64 = db
            .query_row(
                "SELECT youtube_liked FROM songs WHERE id = 'like-test'",
                [],
                |row| row.get(0),
            )
            .expect("row");
        assert_eq!(youtube_liked, 1);
        save_like_state(&db, &item, false).expect("conflict/update path");
        let youtube_liked: i64 = db
            .query_row(
                "SELECT youtube_liked FROM songs WHERE id = 'like-test'",
                [],
                |row| row.get(0),
            )
            .expect("row");
        assert_eq!(youtube_liked, 0);
        let local_like: i64 = db
            .query_row(
                "SELECT liked FROM songs WHERE id = 'like-test'",
                [],
                |row| row.get(0),
            )
            .expect("row");
        assert_eq!(
            local_like, 0,
            "a YouTube like must not flip the local Meld like flag"
        );
    }

    #[test]
    fn every_song_delete_protects_downloaded_songs() {
        // A `songs` row deleted while a `downloads` row points at it hides the download from the UI and leaks the file on disk.
        // The needle is built from two pieces so this test does not match its own source text.
        let needle = ["\"DELETE", " FROM songs"].concat();
        // The commands live in ipc/ since S5-003; scan every module that can run SQL.
        let source = [
            include_str!("lib.rs"),
            include_str!("ipc/account.rs"),
            include_str!("ipc/backup.rs"),
            include_str!("ipc/catalog.rs"),
            include_str!("ipc/downloads.rs"),
            include_str!("ipc/library.rs"),
            include_str!("ipc/lyrics.rs"),
            include_str!("ipc/player.rs"),
            include_str!("ipc/settings.rs"),
            include_str!("ipc/spotify.rs"),
        ]
        .concat();
        let statements: Vec<&str> = source
            .split(needle.as_str())
            .skip(1)
            .map(|rest| rest.split('"').next().unwrap_or(""))
            .collect();
        assert!(
            statements.len() >= 6,
            "expected to find every song DELETE, found {}",
            statements.len()
        );
        for sql in statements {
            assert!(
                sql.contains("FROM downloads"),
                "song DELETE without a downloads guard: DELETE FROM songs{sql}"
            );
        }
    }

    // --- Phase 0 upgrade test (TR-C2, TR-C1, PLAY-055) ---
    struct MemKeyStore(Mutex<Option<Vec<u8>>>);
    impl secrets::KeyStore for MemKeyStore {
        fn load(&self) -> Result<Option<Vec<u8>>, String> {
            Ok(self.0.lock().expect("key store").clone())
        }
        fn store(&self, key: &[u8]) -> Result<(), String> {
            *self.0.lock().expect("key store") = Some(key.to_vec());
            Ok(())
        }
    }

    #[test]
    fn upgrade_from_a_v0_1_8_database_seals_secrets_and_keeps_the_library() {
        let dir = std::env::temp_dir().join(format!(
            "meld-upgrade-test-{}-{}",
            std::process::id(),
            now_millis()
        ));
        fs::create_dir_all(&dir).expect("temp dir");
        let path = dir.join("meld.sqlite3");
        {
            let old = Connection::open(&path).expect("v0.1.8 db");
            old.execute_batch(include_str!("../tests/fixtures/v0.1.8-song-db.sql"))
                .expect("fixture");
        }
        let markers: [&[u8]; 4] = [
            b"V018PLAINCOOKIE",
            b"V018PLAINSPDC",
            b"V018PLAINSPKEY",
            b"V018PLAINTOKEN",
        ];
        let before = fs::read(&path).expect("read fixture db");
        assert!(
            markers.iter().all(|marker| contains_bytes(&before, marker)),
            "premise: v0.1.8 stores secrets in plaintext"
        );

        let store = MemKeyStore(Mutex::new(None));
        let db = Connection::open(&path).expect("open for upgrade");
        initialize_database(&db, &store).expect("upgrade");
        drop(db);

        let after = fs::read(&path).expect("read upgraded db");
        for marker in markers {
            assert!(
                !contains_bytes(&after, marker),
                "{} must not remain anywhere in the file",
                String::from_utf8_lossy(marker)
            );
        }

        let db = Connection::open(&path).expect("reopen");
        for (key, expected) in [
            (
                "cookie",
                "SAPISID=V018PLAINCOOKIE0123456789; __Secure-3PSID=V018PLAINPSID",
            ),
            ("spotifySpDc", "V018PLAINSPDC0123456789"),
            ("spotifySpKey", "V018PLAINSPKEY0123"),
            ("spotifyAccessToken", "V018PLAINTOKEN0123456789"),
        ] {
            let raw = setting_value(&db, key)
                .expect("raw")
                .expect("still present");
            assert!(secrets::is_sealed(&raw), "{key} is sealed at rest");
            assert_eq!(
                secrets::get_with(&db, &store, key)
                    .expect("open")
                    .as_deref(),
                Some(expected),
                "{key} still usable"
            );
        }
        let count = |sql: &str| {
            db.query_row(sql, [], |row| row.get::<_, i64>(0))
                .expect(sql)
        };
        assert_eq!(count("SELECT COUNT(*) FROM songs"), 3, "library intact");
        assert_eq!(count("SELECT COUNT(*) FROM songs WHERE liked = 1"), 1);
        assert_eq!(
            count("SELECT COUNT(*) FROM playlist_songs WHERE playlist_id = 'p1'"),
            2
        );
        assert_eq!(
            count("SELECT play_time_ms FROM history WHERE song_id = 's1'"),
            183000,
            "measured playtime kept (TR-M4)"
        );
        for (key, value) in [
            ("audioQuality", "high"),
            ("playerVolume", "0.6"),
            ("persistentQueue", "true"),
            ("varispeed", "false"),
        ] {
            assert_eq!(
                setting_value(&db, key).expect("setting").as_deref(),
                Some(value),
                "v0.1.8 setting {key} kept"
            );
        }
        let (state, error): (String, Option<String>) = db
            .query_row(
                "SELECT state, error FROM downloads WHERE song_id = 's2'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("download row");
        assert_eq!(
            state, "cancelled",
            "an interrupted download stays resumable (D-002), not failed"
        );
        assert!(error.unwrap_or_default().contains("resume"));

        initialize_database(&db, &store).expect("second start is a no-op");
        assert_eq!(
            secrets::get_with(&db, &store, "cookie")
                .expect("open")
                .as_deref(),
            Some("SAPISID=V018PLAINCOOKIE0123456789; __Secure-3PSID=V018PLAINPSID")
        );
        drop(db);
        let _ = fs::remove_dir_all(&dir);
    }
    fn current_thread_runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("test runtime")
    }

    #[test]
    fn api_requests_time_out_when_the_server_accepts_but_never_responds() {
        // TR-H5: v0.1.8 had no timeouts, so a silent server hung the request forever.
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
        let address = listener.local_addr().expect("address");
        let holder = std::thread::spawn(move || {
            let (_connection, _) = listener.accept().expect("accept");
            std::thread::sleep(Duration::from_secs(3));
        });
        let client = build_http_client(Duration::from_secs(1), Duration::from_millis(300));
        let url = format!("http://{address}/");
        let started = std::time::Instant::now();
        let error = current_thread_runtime()
            .block_on(async { client.get(url).send().await })
            .expect_err("must time out");
        assert!(error.is_timeout(), "expected a timeout, got {error}");
        assert!(
            started.elapsed() < Duration::from_secs(2),
            "timeout took {:?}",
            started.elapsed()
        );
        drop(holder);
    }

    #[test]
    fn a_transfer_that_stops_sending_data_is_reported_as_stalled() {
        use futures_util::StreamExt;
        // TR-H5: downloads and the player cache stop with a clear error instead of hanging.
        current_thread_runtime().block_on(async {
            let mut stream =
                futures_util::stream::iter(vec![1_u8]).chain(futures_util::stream::pending());
            assert_eq!(
                download_resume::next_chunk_within(
                    &mut stream,
                    Duration::from_millis(50),
                    "download"
                )
                .await,
                Ok(Some(1))
            );
            let error = download_resume::next_chunk_within(
                &mut stream,
                Duration::from_millis(50),
                "download",
            )
            .await
            .expect_err("must stall");
            assert!(
                error.starts_with("download stalled: no data received"),
                "{error}"
            );
            let mut finished = futures_util::stream::iter(Vec::<u8>::new());
            assert_eq!(
                download_resume::next_chunk_within(
                    &mut finished,
                    Duration::from_millis(50),
                    "player cache"
                )
                .await,
                Ok(None)
            );
        });
    }

    #[test]
    fn production_timeouts_are_bounded_and_consistent() {
        assert!(HTTP_CONNECT_TIMEOUT <= HTTP_REQUEST_TIMEOUT);
        assert!(HTTP_REQUEST_TIMEOUT <= Duration::from_secs(60));
        assert!(STALL_TIMEOUT < TRANSFER_TIMEOUT);
        assert!(STALL_TIMEOUT <= Duration::from_secs(60));
    }

    fn backup_zip(entries: &[(&str, &[u8])]) -> std::io::Cursor<Vec<u8>> {
        let mut writer = ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for (name, bytes) in entries {
            writer
                .start_file(*name, SimpleFileOptions::default())
                .expect("start entry");
            writer.write_all(bytes).expect("write entry");
        }
        let mut cursor = writer.finish().expect("finish zip");
        cursor.set_position(0);
        cursor
    }

    fn scratch_path(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("meld-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("scratch dir");
        dir.join("restore.part")
    }

    #[test]
    fn backup_restore_streams_the_database_to_disk_and_returns_settings() {
        let out = scratch_path("restore-ok");
        let settings = extract_backup(
            backup_zip(&[
                ("song.db", b"SQLite format 3\0data"),
                ("settings.json", b"[]"),
                ("../../evil.txt", b"x"),
            ]),
            &out,
            1024,
            1024,
        )
        .expect("valid backup");
        assert_eq!(settings, b"[]");
        assert_eq!(
            fs::read(&out).expect("db written"),
            b"SQLite format 3\0data"
        );
        assert!(!out.parent().unwrap().join("evil.txt").exists());
    }

    #[test]
    fn backup_restore_rejects_entries_above_the_size_cap() {
        // TR-H4: v0.1.8 read every entry fully into memory with no limit.
        let out = scratch_path("restore-big");
        let big = vec![7_u8; 4096];
        let error = extract_backup(
            backup_zip(&[("song.db", &big), ("settings.json", b"[]")]),
            &out,
            1024,
            1024,
        )
        .expect_err("db too large");
        assert!(error.contains("song.db is too large"), "{error}");
        let error = extract_backup(
            backup_zip(&[("song.db", b"db"), ("settings.json", &big)]),
            &out,
            1024,
            1024,
        )
        .expect_err("settings too large");
        assert!(error.contains("settings.json is too large"), "{error}");
    }

    #[test]
    fn backup_restore_requires_both_entries() {
        let out = scratch_path("restore-missing");
        assert!(
            extract_backup(backup_zip(&[("song.db", b"db")]), &out, 1024, 1024)
                .expect_err("no settings")
                .contains("missing")
        );
        assert!(
            extract_backup(backup_zip(&[("settings.json", b"[]")]), &out, 1024, 1024)
                .expect_err("no db")
                .contains("missing")
        );
        assert!(extract_backup(
            std::io::Cursor::new(b"not a zip".to_vec()),
            &out,
            1024,
            1024
        )
        .expect_err("not zip")
        .contains("invalid"));
    }

    #[test]
    fn signing_out_removes_every_session_row_for_that_service_only() {
        // TR-H6: sign-out must leave nothing that could silently restore the session (the WebView data is
        // cleared separately by the logout commands; see scripts/lib/ui-invariants.mjs).
        let store = MemKeyStore(Mutex::new(None));
        let db = Connection::open_in_memory().expect("db");
        initialize_database(&db, &store).expect("schema");
        for key in GOOGLE_SESSION_KEYS.iter().chain(SPOTIFY_SESSION_KEYS) {
            secrets::set_with(&db, &store, key, "FAKE-VALUE").expect("set");
        }
        db.execute(
            "INSERT INTO settings(key, value) VALUES ('volume', '0.5')",
            [],
        )
        .expect("other setting");
        let remaining = |keys: &[&str]| {
            keys.iter()
                .filter(|key| {
                    db.query_row("SELECT 1 FROM settings WHERE key = ?1", [**key], |_| Ok(()))
                        .optional()
                        .unwrap()
                        .is_some()
                })
                .count()
        };
        forget_google_session(&db).expect("google logout");
        assert_eq!(remaining(GOOGLE_SESSION_KEYS), 0);
        assert_eq!(remaining(SPOTIFY_SESSION_KEYS), SPOTIFY_SESSION_KEYS.len());
        forget_spotify_session(&db).expect("spotify logout");
        assert_eq!(remaining(SPOTIFY_SESSION_KEYS), 0);
        assert_eq!(remaining(&["volume"]), 1);
        for key in secrets::SEALED_KEYS {
            assert!(
                GOOGLE_SESSION_KEYS.contains(&key) || SPOTIFY_SESSION_KEYS.contains(&key),
                "sealed secret {key} is not removed by any sign-out"
            );
        }
    }

    #[test]
    fn stats_use_measured_listening_time_instead_of_song_length() {
        // TR-M4: main dropped history_record_playtime, so stats counted a skipped song as fully played.
        let db = Connection::open_in_memory().expect("db");
        initialize_database(&db, &MemKeyStore(Mutex::new(None))).expect("schema");
        db.execute("INSERT INTO songs (id, title, kind, saved_at, duration) VALUES ('a', 'Long', 'song', 0, 600), ('b', 'Other', 'song', 0, 180)", []).expect("songs");
        db.execute(
            "INSERT INTO history (song_id, played_at) VALUES ('a', 100), ('b', 100)",
            [],
        )
        .expect("history");
        let first: i64 = db
            .query_row("SELECT id FROM history WHERE song_id = 'a'", [], |row| {
                row.get(0)
            })
            .expect("id");
        assert_eq!(listened_minutes(&db, 0).expect("minutes"), 13); // 600 s + 180 s, nothing measured yet
        record_playtime(&db, first, 30_000).expect("record");
        record_playtime(&db, first, 30_000).expect("record");
        record_playtime(&db, first, -5).expect("ignored");
        record_playtime(&db, 0, 99_000).expect("ignored");
        assert_eq!(listened_minutes(&db, 0).expect("minutes"), 4); // 60 s measured + 180 s fallback
        assert_eq!(listened_minutes(&db, 101).expect("minutes"), 0);
    }

    // --- regression tests for the review fixes (end) ---
}
