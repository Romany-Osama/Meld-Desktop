use reqwest::Client;
use reqwest::header::RANGE;
use regex::Regex;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::tag::ItemKey;
use rfd::FileDialog;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::time::timeout;
use tokio::io::AsyncWriteExt;
use futures_util::StreamExt;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use hmac::{Hmac, Mac as HmacMac};
use std::sync::{atomic::{AtomicBool, Ordering}, Arc};
use tauri::{Emitter, Manager, Url, WebviewUrl};
use tauri::webview::{PageLoadEvent, WebviewWindowBuilder};
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

const API_BASE: &str = "https://music.youtube.com/youtubei/v1/";
const ORIGIN: &str = "https://music.youtube.com";
const REFERER: &str = "https://music.youtube.com/";
const WEB_REMIX_NAME: &str = "WEB_REMIX";
const WEB_REMIX_VERSION: &str = "1.20260213.01.00";
const WEB_REMIX_ID: &str = "67";
const YOUTUBE_API_KEY: &str = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX3";
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";
const VISITOR_PREFIX: &str = "Cg";
const VISIONOS_NAME: &str = "VISIONOS";
const VISIONOS_VERSION: &str = "0.1";
const VISIONOS_ID: &str = "101";
const VISIONOS_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

static HTTP: OnceLock<Client> = OnceLock::new();
static MUSIXMATCH_TOKEN: OnceLock<Mutex<Option<String>>> = OnceLock::new();
static DOWNLOAD_CANCELS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
static PLAYER_CACHE_ACTIVE: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
static PLAYER_CACHE_BLOCKED: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn http() -> &'static Client {
    HTTP.get_or_init(|| {
        Client::builder()
            .user_agent(USER_AGENT)
            .gzip(true)
            .brotli(true)
            .deflate(true)
            .build()
            .expect("HTTP client must build")
    })
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

impl RuntimeState {
    fn new() -> Self {
        let path = database_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("Meld data directory must be created");
        }
        let db = Connection::open(path).expect("Meld SQLite database must open");
        db.execute_batch(
            "PRAGMA foreign_keys = ON;
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
             );",
        ).expect("Meld SQLite schema must initialize");
        let _ = db.execute("ALTER TABLE songs ADD COLUMN set_video_id TEXT", []);
        let _ = db.execute("ALTER TABLE songs ADD COLUMN explicit INTEGER NOT NULL DEFAULT 0", []);
        let _ = db.execute("ALTER TABLE songs ADD COLUMN music_video_type TEXT", []);
        let _ = db.execute("ALTER TABLE songs ADD COLUMN liked INTEGER NOT NULL DEFAULT 0", []);
        let _ = db.execute("ALTER TABLE songs ADD COLUMN liked_date INTEGER", []);
        let _ = db.execute("ALTER TABLE songs ADD COLUMN in_library INTEGER NOT NULL DEFAULT 0", []);
        let _ = db.execute("ALTER TABLE songs ADD COLUMN is_video INTEGER NOT NULL DEFAULT 0", []);
        let _ = db.execute("ALTER TABLE songs ADD COLUMN uploaded INTEGER NOT NULL DEFAULT 0", []);
        let _ = db.execute("ALTER TABLE songs ADD COLUMN youtube_liked INTEGER NOT NULL DEFAULT 0", []);
        let _ = db.execute("ALTER TABLE songs ADD COLUMN album_id TEXT", []);
        let _ = db.execute("ALTER TABLE songs ADD COLUMN duration INTEGER NOT NULL DEFAULT 0", []);
        let _ = db.execute("ALTER TABLE songs ADD COLUMN is_local INTEGER NOT NULL DEFAULT 0", []);
        let _ = db.execute("ALTER TABLE songs ADD COLUMN local_path TEXT", []);
        let _ = db.execute("ALTER TABLE songs ADD COLUMN date_modified INTEGER", []);
        let _ = db.execute("ALTER TABLE downloads ADD COLUMN total_bytes INTEGER", []);
        let _ = db.execute("ALTER TABLE downloads ADD COLUMN state TEXT NOT NULL DEFAULT 'completed'", []);
        let _ = db.execute("ALTER TABLE downloads ADD COLUMN error TEXT", []);
        let _ = db.execute("ALTER TABLE downloads ADD COLUMN lyrics_cached INTEGER NOT NULL DEFAULT 0", []);
        let _ = db.execute("ALTER TABLE downloads ADD COLUMN artwork_path TEXT", []);
        let _ = db.execute("ALTER TABLE albums ADD COLUMN liked INTEGER NOT NULL DEFAULT 0", []);
        let _ = db.execute("ALTER TABLE playlists ADD COLUMN source TEXT NOT NULL DEFAULT 'local'", []);
        let _ = db.execute("ALTER TABLE podcasts ADD COLUMN detail_json TEXT", []);
        let _ = db.execute("ALTER TABLE history ADD COLUMN play_time_ms INTEGER NOT NULL DEFAULT 0", []);
        let _ = db.execute("ALTER TABLE player_cache ADD COLUMN quality TEXT NOT NULL DEFAULT 'auto'", []);
        Self { visitor_data: Mutex::new(None), db: Mutex::new(db) }
    }
}

fn database_path() -> PathBuf {
    let root = if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."))
    } else {
        std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|| {
            std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")).unwrap_or_else(|| PathBuf::from("."))
        })
    };
    root.join("Meld Desktop").join("meld.sqlite3")
}

fn now_seconds() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|duration| duration.as_secs() as i64).unwrap_or_default()
}
fn now_millis() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|duration| duration.as_millis() as i64).unwrap_or_default()
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

fn local_metadata(path: &Path) -> Option<(String, String, Option<String>, i64, Option<Vec<u8>>, &'static str)> {
    let tagged_file = lofty::read_from_path(path).ok()?;
    let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());
    let fallback_title = path.file_stem().and_then(|value| value.to_str()).unwrap_or("Untitled").trim().to_owned();
    let title = tag.and_then(|value| value.get_string(&ItemKey::TrackTitle)).filter(|value| !value.trim().is_empty()).unwrap_or(&fallback_title).trim().to_owned();
    let artist = tag.and_then(|value| value.get_string(&ItemKey::TrackArtist)).filter(|value| !value.trim().is_empty()).unwrap_or("Unknown artist").trim().to_owned();
    let album = tag.and_then(|value| value.get_string(&ItemKey::AlbumTitle)).map(str::trim).filter(|value| !value.is_empty()).map(str::to_owned);
    let duration = tagged_file.properties().duration().as_secs() as i64;
    let picture = tag.and_then(|value| value.pictures().first()).map(|picture| {
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
    let (artwork, extension) = picture.map_or((None, "jpg"), |(data, extension)| (Some(data), extension));
    Some((title, artist, album, duration, artwork, extension))
}

fn local_item_from_path(path: &Path, artwork_dir: &Path) -> Option<LocalItem> {
    let (title, artist, album, duration, artwork, extension) = local_metadata(path)?;
    let id = stable_local_id(path);
    let thumbnail = artwork.and_then(|data| {
        fs::create_dir_all(artwork_dir).ok()?;
        let artwork_path = artwork_dir.join(format!("{}.{}", id.replace(':', "_"), extension)).to_string_lossy().to_string();
        if !Path::new(&artwork_path).exists() { fs::write(&artwork_path, data).ok()?; }
        Some(artwork_path)
    });
    let subtitle = match album.as_deref() { Some(album) => format!("{artist} · {album}"), None => artist.clone() };
    let artist_id = format!("local-artist:{}", Sha1::digest(artist.as_bytes()).iter().map(|byte| format!("{byte:02x}")).collect::<String>());
    Some(LocalItem { id, kind: "song".to_owned(), title, subtitle, thumbnail, artists: vec![Artist { name: artist, id: Some(artist_id) }], browse_id: None, playlist_id: None, video_id: None, set_video_id: None, play_playlist_id: None, play_video_id: None, params: None, explicit: false, music_video_type: None, history_remove_token: None, album_id: None, album_title: album, local_path: path.to_string_lossy().to_string(), duration })
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
                .or_else(|| v.get("simpleText").and_then(Value::as_str).map(str::to_owned))
        })
        .unwrap_or_default()
}

fn thumbnail(value: Option<&Value>) -> Option<String> {
    let items = value?
        .get("thumbnails")
        .and_then(Value::as_array)?;
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
    } else if page_type.contains("ARTIST") || page_type.contains("USER_CHANNEL") || browse_id.is_some_and(|id| id.starts_with("UC")) {
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
        renderer.get(*key).and_then(Value::as_array).map(|badges| badges.iter().any(|badge| {
            badge.get("musicInlineBadgeRenderer")
                .and_then(|v| v.get("icon"))
                .and_then(|v| v.get("iconType"))
                .and_then(Value::as_str) == Some("MUSIC_EXPLICIT_BADGE")
        })).unwrap_or(false)
    })
}

fn parse_artists(subtitle: Option<&Value>) -> Vec<Artist> {
    subtitle
        .and_then(|v| v.get("runs"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|run| {
            let name = run.get("text").and_then(Value::as_str)?.to_owned();
            if name.is_empty() {
                return None;
            }
            let (id, _) = browse_endpoint(run.get("navigationEndpoint"));
            Some(Artist { name, id })
        })
        .collect()
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
    let is_song = renderer.get("navigationEndpoint").and_then(|v| v.get("watchEndpoint")).is_some();
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
    } else if page_type.contains("PLAYLIST") || browse_id.as_deref().unwrap_or("").starts_with("VL") {
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
        music_video_type: music_video_type(renderer.get("navigationEndpoint")).or_else(|| renderer.get("musicVideoType").and_then(Value::as_str).map(str::to_owned)),
        history_remove_token: None,
        album_id: None,
        album_title: None,
    })
}

fn parse_responsive_song(renderer: &Value) -> Option<YtItem> {
    let data = renderer.get("playlistItemData")?;
    let video_id = data.get("videoId").and_then(Value::as_str)?.to_owned();
    let columns = renderer.get("flexColumns").and_then(Value::as_array)?;
    let title = text(columns.first()?.get("musicResponsiveListItemFlexColumnRenderer")?.get("text"));
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
        .find_map(|run| run.get("navigationEndpoint").and_then(|endpoint| endpoint.get("browseEndpoint")).and_then(|endpoint| endpoint.get("browseId")).and_then(Value::as_str).map(str::to_owned));
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
        set_video_id: data.get("playlistSetVideoId").and_then(Value::as_str).map(str::to_owned),
        play_playlist_id: playlist_endpoint,
        play_video_id: video_endpoint.or(Some(video_id)),
        params: None,
        explicit: explicit_badge(renderer),
        music_video_type: music_video_type(renderer.get("navigationEndpoint")).or_else(|| renderer.get("musicVideoType").and_then(Value::as_str).map(str::to_owned)),
        history_remove_token: renderer.get("menu")
            .and_then(|value| value.get("menuRenderer"))
            .and_then(|value| value.get("items"))
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .find(|item| item.get("menuServiceItemRenderer").and_then(|value| value.get("icon")).and_then(|value| value.get("iconType")).and_then(Value::as_str) == Some("REMOVE_FROM_HISTORY"))
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
    db.query_row("SELECT value FROM settings WHERE key = ?1", params![key], |row| row.get::<_, String>(0)).optional().map_err(|e| format!("session setting read failed: {e}"))
}

fn auth_session(state: &tauri::State<'_, RuntimeState>) -> Result<Option<AuthSession>, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    let cookie = setting_value(&db, "cookie")?;
    let data_sync_id = setting_value(&db, "dataSyncId")?;
    let visitor_data = setting_value(&db, "visitorData")?;
    Ok(match (cookie, data_sync_id, visitor_data) {
        (Some(cookie), Some(data_sync_id), Some(visitor_data)) if !cookie.trim().is_empty() && !data_sync_id.trim().is_empty() && visitor_data.starts_with(VISITOR_PREFIX) => Some(AuthSession { cookie, data_sync_id, visitor_data, account_name: setting_value(&db, "accountName")?, account_email: setting_value(&db, "accountEmail")?, account_channel_handle: setting_value(&db, "accountChannelHandle")?, account_avatar: setting_value(&db, "accountAvatar")? }),
        _ => None,
    })
}

fn browse_session(state: &tauri::State<'_, RuntimeState>, session: Option<AuthSession>) -> Result<Option<AuthSession>, String> {
    let use_login = {
        let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
        setting_value(&db, "useLoginForBrowse")?.as_deref() != Some("false")
    };
    Ok(if use_login { session } else { None })
}

fn sapisid_hash(cookie: &str) -> Option<String> {
    let sapisid = cookie.split(';').filter_map(|part| part.trim().split_once('=')).find(|(key, _)| *key == "SAPISID").map(|(_, value)| value.trim()).filter(|value| !value.is_empty())?;
    let timestamp = now_seconds();
    let mut hasher = Sha1::new();
    hasher.update(format!("{timestamp} {sapisid} {ORIGIN}"));
    let digest = hasher.finalize().iter().map(|byte| format!("{byte:02x}")).collect::<String>();
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
    let root: Value = serde_json::from_str(body).map_err(|e| format!("visitorData JSON failed: {e}"))?;
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
    if let Some(value) = state.visitor_data.lock().map_err(|_| "visitor state poisoned")?.clone() {
        return Ok(value);
    }
    let persisted = {
        let db = state.db.lock().map_err(|_| "database state poisoned")?;
        db.query_row("SELECT value FROM settings WHERE key = 'visitorData'", [], |row| row.get::<_, String>(0)).optional().map_err(|e| format!("visitorData storage read failed: {e}"))?
    };
    if let Some(value) = persisted.filter(|value| value.starts_with(VISITOR_PREFIX)) {
        *state.visitor_data.lock().map_err(|_| "visitor state poisoned")? = Some(value.clone());
        return Ok(value);
    }
    let value = fetch_visitor_data().await?;
    {
        let db = state.db.lock().map_err(|_| "database state poisoned")?;
        db.execute("INSERT INTO settings (key, value) VALUES ('visitorData', ?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![value]).map_err(|e| format!("visitorData storage write failed: {e}"))?;
    }
    *state.visitor_data.lock().map_err(|_| "visitor state poisoned")? = Some(value.clone());
    Ok(value)
}

async fn post_with_query(endpoint: &str, body: Value, session: Option<&AuthSession>, extra_query: &[(&str, &str)]) -> Result<Value, String> {
    let visitor_header = session.map(|value| value.visitor_data.as_str()).or_else(|| body.pointer("/context/client/visitorData").and_then(Value::as_str));
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
    if let Some(visitor_data) = visitor_header { request = request.header("X-Goog-Visitor-Id", visitor_data); }
    if let Some(session) = session {
        request = request.header("Cookie", &session.cookie);
        if let Some(authorization) = sapisid_hash(&session.cookie) { request = request.header("Authorization", authorization); }
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

#[derive(Clone, Copy)]
struct PlayerClient {
    name: &'static str,
    version: &'static str,
    id: &'static str,
    user_agent: &'static str,
    os_name: Option<&'static str>,
    os_version: Option<&'static str>,
    device_make: Option<&'static str>,
    device_model: Option<&'static str>,
    login_supported: bool,
    login_required: bool,
}

const PLAYER_CLIENTS: [PlayerClient; 7] = [
    PlayerClient { name: VISIONOS_NAME, version: VISIONOS_VERSION, id: VISIONOS_ID, user_agent: VISIONOS_USER_AGENT, os_name: Some("visionOS"), os_version: Some("1.3.21O771"), device_make: Some("Apple"), device_model: Some("RealityDevice14,1"), login_supported: false, login_required: false },
    PlayerClient { name: "ANDROID_VR", version: "1.65.10", id: "28", user_agent: "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip", os_name: Some("Android"), os_version: Some("12L"), device_make: Some("Oculus"), device_model: Some("Quest 3"), login_supported: false, login_required: false },
    PlayerClient { name: "TVHTML5", version: "7.20260213.00.00", id: "7", user_agent: "Mozilla/5.0(SMART-TV; Linux; Tizen 4.0.0.2) AppleWebkit/605.1.15 (KHTML, like Gecko) SamsungBrowser/9.2 TV Safari/605.1.15", os_name: None, os_version: None, device_make: None, device_model: None, login_supported: true, login_required: true },
    PlayerClient { name: "ANDROID_VR", version: "1.43.32", id: "28", user_agent: "com.google.android.apps.youtube.vr.oculus/1.43.32 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1; Cronet/107.0.5284.2)", os_name: Some("Android"), os_version: Some("12"), device_make: Some("Oculus"), device_model: Some("Quest 3"), login_supported: false, login_required: false },
    PlayerClient { name: "IOS", version: "21.03.3", id: "5", user_agent: "com.google.ios.youtube/21.03.3 (iPad7,6; U; CPU iPadOS 17_7_10 like Mac OS X; en-US)", os_name: Some("iPadOS"), os_version: Some("17.7.10.21H450"), device_make: Some("Apple"), device_model: Some("iPad7,6"), login_supported: false, login_required: false },
    PlayerClient { name: "IOS", version: "21.03.1", id: "5", user_agent: "com.google.ios.youtube/21.03.1 (iPhone16,2; U; CPU iOS 18_2 like Mac OS X;)", os_name: Some("iOS"), os_version: Some("18.2"), device_make: Some("Apple"), device_model: Some("iPhone16,2"), login_supported: false, login_required: false },
    PlayerClient { name: "WEB_CREATOR", version: "1.20260213.00.00", id: "62", user_agent: USER_AGENT, os_name: None, os_version: None, device_make: None, device_model: None, login_supported: true, login_required: true },
];

async fn player_post(video_id: &str, playlist_id: Option<&str>, visitor_data: &str, client: PlayerClient, session: Option<&AuthSession>) -> Result<Value, String> {
    let mut client_context = json!({
        "clientName": client.name,
        "clientVersion": client.version,
        "clientScreen": "WATCH",
        "userAgent": client.user_agent,
        "hl": "en",
        "gl": "US",
        "visitorData": visitor_data
    });
    if let Some(value) = client.os_name { client_context["osName"] = json!(value); }
    if let Some(value) = client.os_version { client_context["osVersion"] = json!(value); }
    if let Some(value) = client.device_make { client_context["deviceMake"] = json!(value); }
    if let Some(value) = client.device_model { client_context["deviceModel"] = json!(value); }
    let body = json!({
        "context": { "client": client_context, "user": if client.login_supported { json!({ "onBehalfOfUser": session.map(|value| value.data_sync_id.clone()) }) } else { json!({}) } },
        "videoId": video_id,
        "playlistId": playlist_id.map(Value::from).unwrap_or(Value::Null),
        "contentCheckOk": true,
        "racyCheckOk": true
    });
    let mut request = http()
        .post(format!("{API_BASE}player"))
        .header("X-Goog-Api-Format-Version", "1")
        .header("X-YouTube-Client-Name", client.id)
        .header("X-YouTube-Client-Version", client.version)
        .header("X-Origin", ORIGIN)
        .header("Referer", REFERER)
        .header("X-Goog-Visitor-Id", visitor_data)
        .json(&body);
    if let Some(session) = session.filter(|_| client.login_supported) {
        request = request.header("Cookie", &session.cookie);
        if let Some(authorization) = sapisid_hash(&session.cookie) { request = request.header("Authorization", authorization); }
    }
    request
        .send()
        .await
        .map_err(|e| format!("YouTube player request failed for {}: {e}", client.name))?
        .error_for_status()
        .map_err(|e| format!("YouTube player returned error for {}: {e}", client.name))?
        .json::<Value>()
        .await
        .map_err(|e| format!("YouTube player JSON failed for {}: {e}", client.name))
}

fn parse_direct_audio(response: &Value, video_id: &str, audio_quality: &str) -> Result<PlayerPayload, String> {
    let status = response.get("playabilityStatus").and_then(|v| v.get("status")).and_then(Value::as_str).unwrap_or("UNKNOWN");
    if status != "OK" {
        let reason = response.get("playabilityStatus").and_then(|v| v.get("reason")).and_then(Value::as_str).unwrap_or("unknown reason");
        return Err(format!("YouTube player status {status}: {reason}"));
    }
    let details = response.get("videoDetails");
    let formats = response.get("streamingData").and_then(|v| v.get("adaptiveFormats")).and_then(Value::as_array).ok_or_else(|| "YouTube player returned no adaptive formats".to_owned())?;
    let mut candidates = formats.iter().filter_map(|format| {
        let mime = format.get("mimeType").and_then(Value::as_str)?;
        if !mime.starts_with("audio/") || format.get("width").is_some() { return None; }
        let url = format.get("url").and_then(Value::as_str)?.to_owned();
        if url.is_empty() || format.get("signatureCipher").is_some() || format.get("cipher").is_some() { return None; }
        if format.get("audioTrack").and_then(|v| v.get("isAutoDubbed")).and_then(Value::as_bool) == Some(true) { return None; }
        Some((format, url, mime.to_owned()))
    }).collect::<Vec<_>>();
    // Meld's AUTO switches on metered network state. Desktop currently has no native metered signal, so AUTO intentionally falls back to HIGH rather than pretending to provide that policy.
    let prefer_low = audio_quality.eq_ignore_ascii_case("low");
    candidates.sort_by_key(|(format, _, mime)| {
        let bitrate = format.get("bitrate").and_then(Value::as_i64).unwrap_or(0);
        let direction = if prefer_low { -1_i64 } else { 1_i64 };
        let opus_bonus = if mime.starts_with("audio/webm") { 10240_i64 } else { 0_i64 };
        std::cmp::Reverse(bitrate.saturating_mul(direction).saturating_add(opus_bonus))
    });
    let (format, stream_url, mime_type) = candidates.into_iter().next().ok_or_else(|| "YouTube player returned no direct original audio URL; cipher/SABR resolver is required".to_owned())?;
    let duration = details.and_then(|value| value.get("lengthSeconds")).and_then(Value::as_str).and_then(|value| value.parse::<i64>().ok()).unwrap_or(0);
    Ok(PlayerPayload {
        video_id: video_id.to_owned(),
        title: details.and_then(|v| v.get("title")).and_then(Value::as_str).map(str::to_owned),
        artist: details.and_then(|v| v.get("author")).and_then(Value::as_str).map(str::to_owned),
        stream_url,
        mime_type,
        bitrate: format.get("bitrate").and_then(Value::as_i64).unwrap_or(0),
        expires_in_seconds: response.get("streamingData").and_then(|v| v.get("expiresInSeconds")).and_then(Value::as_i64).unwrap_or(0),
        duration,
    })
}

#[tauri::command]
async fn ytm_next(video_id: String, playlist_id: Option<String>, set_video_id: Option<String>, index: Option<i32>, params: Option<String>, continuation: Option<String>, state: tauri::State<'_, RuntimeState>) -> Result<QueuePage, String> {
    let visitor_data = visitor(&state).await?;
    let session = auth_session(&state)?;
    let data_sync_id = session.as_ref().map(|value| value.data_sync_id.as_str());
    let body = json!({ "context": context(&visitor_data, session.is_some(), data_sync_id), "videoId": video_id, "playlistId": playlist_id, "playlistSetVideoId": set_video_id, "index": index, "params": params, "continuation": continuation });
    let response = post("next", body, session.as_ref()).await?;
    Ok(parse_queue(&response))
}

#[tauri::command]
async fn ytm_delete_uploaded_song(entity_id: String, state: tauri::State<'_, RuntimeState>) -> Result<bool, String> {
    let entity_id = entity_id.trim();
    if entity_id.is_empty() { return Err("uploaded entity id is empty".to_owned()); }
    let session = auth_session(&state)?.ok_or_else(|| "Deleting an uploaded song requires a connected YouTube Music account".to_owned())?;
    let response = post_with_query("music/delete_privately_owned_entity", json!({ "context": context(&session.visitor_data, false, None), "entityId": entity_id }), Some(&session), &[("key", YOUTUBE_API_KEY)]).await?;
    let processed = response.get("feedbackResponses").and_then(Value::as_array).map(|items| items.iter().all(|item| item.get("isProcessed").and_then(Value::as_bool).unwrap_or(true))).unwrap_or(true);
    if !processed { return Err("YouTube Music did not confirm uploaded song deletion".to_owned()); }
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    db.execute("UPDATE songs SET uploaded = 0, in_library = 0 WHERE id = ?1 OR video_id = ?1", params![entity_id]).map_err(|error| format!("uploaded song local cleanup failed: {error}"))?;
    Ok(true)
}

#[tauri::command]
async fn ytm_refetch(video_id: String, state: tauri::State<'_, RuntimeState>) -> Result<Option<YtItem>, String> {
    let id = video_id.trim();
    if id.is_empty() { return Err("refetch video id is empty".to_owned()); }
    let visitor_data = visitor(&state).await?;
    let session = auth_session(&state)?;
    let data_sync_id = session.as_ref().map(|value| value.data_sync_id.as_str());
    let response = post("music/get_queue", json!({ "context": context(&visitor_data, session.is_some(), data_sync_id), "videoIds": [id], "playlistId": Value::Null }), session.as_ref()).await?;
    Ok(parse_get_queue(&response).into_iter().next())
}

#[tauri::command]
async fn ytm_related(browse_id: String, state: tauri::State<'_, RuntimeState>) -> Result<Vec<YtItem>, String> {
    let id = browse_id.trim();
    if id.is_empty() { return Err("related browse id is empty".to_owned()); }
    let visitor_data = visitor(&state).await?;
    let request_session = browse_session(&state, auth_session(&state)?)?;
    let data_sync_id = request_session.as_ref().map(|value| value.data_sync_id.as_str());
    let response = post("browse", json!({ "context": context(&visitor_data, request_session.is_some(), data_sync_id), "browseId": id }), request_session.as_ref()).await?;
    Ok(parse_related(&response))
}

#[tauri::command]
async fn ytm_queue_continuation(continuation: String, state: tauri::State<'_, RuntimeState>) -> Result<QueuePage, String> {
    let token = continuation.trim();
    if token.is_empty() { return Err("queue continuation is empty".to_owned()); }
    let visitor_data = visitor(&state).await?;
    let session = auth_session(&state)?;
    let data_sync_id = session.as_ref().map(|value| value.data_sync_id.as_str());
    let response = post("next", json!({ "context": context(&visitor_data, session.is_some(), data_sync_id), "continuation": token }), session.as_ref()).await?;
    Ok(parse_queue(&response))
}

async fn resolve_player_payload(video_id: &str, playlist_id: Option<&str>, audio_quality: &str, state: &tauri::State<'_, RuntimeState>) -> Result<PlayerPayload, String> {
    let id = video_id.trim();
    if id.is_empty() { return Err("video id is empty".to_owned()); }
    let visitor_data = visitor(state).await?;
    let session = auth_session(state)?;
    let mut failures = Vec::new();
    for client in PLAYER_CLIENTS {
        if client.login_required && session.is_none() { continue; }
        match player_post(id, playlist_id, &visitor_data, client, session.as_ref()).await.and_then(|response| parse_direct_audio(&response, id, audio_quality)) {
            Ok(payload) => return Ok(payload),
            Err(error) => failures.push(error),
        }
    }
    Err(format!("YouTube native playback unavailable after source client cascade: {}", failures.last().cloned().unwrap_or_else(|| "no usable player client".to_owned())))
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
    Ok(DownloadInfo { song_id: row.get(0)?, path: row.get(1)?, bytes: row.get(2)?, total_bytes: row.get(3)?, state: row.get(4)?, error: row.get(5)?, lyrics_cached: row.get::<_, i64>(6)? != 0, artwork_path: row.get(7)? })
}

fn download_cache_path(song_id: &str) -> PathBuf {
    let digest = Sha1::digest(song_id.as_bytes());
    database_path().parent().map(|value| value.join("downloads")).unwrap_or_else(|| PathBuf::from("downloads")).join(format!("{digest:x}.audio"))
}

fn normalize_audio_quality(value: Option<&str>) -> &'static str {
    match value.unwrap_or("auto") {
        "high" => "high",
        "low" => "low",
        _ => "auto",
    }
}

fn player_cache_path(song_id: &str) -> PathBuf {
    let digest = Sha1::digest(song_id.as_bytes());
    database_path().parent().map(|value| value.join("player-cache")).unwrap_or_else(|| PathBuf::from("player-cache")).join(format!("{digest:x}.audio"))
}

fn download_artwork_path(song_id: &str, extension: &str) -> PathBuf {
    let digest = Sha1::digest(song_id.as_bytes());
    let safe_extension = match extension { "jpg" | "jpeg" => "jpg", "png" => "png", "webp" => "webp", _ => "cover" };
    database_path().parent().map(|value| value.join("downloads")).unwrap_or_else(|| PathBuf::from("downloads")).join(format!("{digest:x}.{safe_extension}"))
}

fn artwork_extension(content_type: &str) -> &'static str {
    let mime = content_type.split(';').next().unwrap_or("").trim().to_ascii_lowercase();
    match mime.as_str() { "image/jpeg" => "jpg", "image/png" => "png", "image/webp" => "webp", _ => "cover" }
}

fn can_resume_partial_download(existing_bytes: i64, status: reqwest::StatusCode) -> bool {
    existing_bytes > 0 && status == reqwest::StatusCode::PARTIAL_CONTENT
}

async fn cache_download_artwork(song_id: &str, source_url: Option<&str>) -> Option<String> {
    let url = source_url?.trim();
    if !(url.starts_with("https://") || url.starts_with("http://")) { return None; }
    let response = http().get(url).send().await.ok()?.error_for_status().ok()?;
    let content_type = response.headers().get(reqwest::header::CONTENT_TYPE).and_then(|value| value.to_str().ok()).unwrap_or("").to_owned();
    if !content_type.to_ascii_lowercase().starts_with("image/") { return None; }
    let bytes = response.bytes().await.ok()?;
    if bytes.is_empty() || bytes.len() > 10 * 1024 * 1024 { return None; }
    let path = download_artwork_path(song_id, artwork_extension(&content_type));
    if let Some(parent) = path.parent() { tokio::fs::create_dir_all(parent).await.ok()?; }
    let partial = PathBuf::from(format!("{}.part", path.to_string_lossy()));
    tokio::fs::write(&partial, &bytes).await.ok()?;
    if tokio::fs::rename(&partial, &path).await.is_err() { let _ = tokio::fs::remove_file(&partial).await; return None; }
    Some(path.to_string_lossy().to_string())
}

fn player_cache_active() -> &'static Mutex<HashSet<String>> {
    PLAYER_CACHE_ACTIVE.get_or_init(|| Mutex::new(HashSet::new()))
}

fn player_cache_blocked() -> &'static Mutex<HashSet<String>> {
    PLAYER_CACHE_BLOCKED.get_or_init(|| Mutex::new(HashSet::new()))
}

fn player_cache_is_blocked(song_id: &str) -> bool {
    player_cache_blocked().lock().map(|blocked| blocked.contains(song_id)).unwrap_or(true)
}

fn download_cancel_map() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    DOWNLOAD_CANCELS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn download_is_active(song_id: &str) -> bool {
    download_cancel_map().lock().map(|active| active.contains_key(song_id)).unwrap_or(false)
}

fn read_download_info(db: &Connection, song_id: &str) -> Result<Option<DownloadInfo>, String> {
    db.query_row("SELECT song_id, path, bytes, total_bytes, state, error, lyrics_cached, artwork_path FROM downloads WHERE song_id = ?1", params![song_id], download_info_from_row).optional().map_err(|error| format!("download state read failed: {error}"))
}

fn emit_download(app: &tauri::AppHandle, info: &DownloadInfo) {
    let _ = app.emit("download-state", info.clone());
}

#[tauri::command]
fn download_info(song_id: String, state: tauri::State<'_, RuntimeState>) -> Result<Option<DownloadInfo>, String> {
    let id = song_id.trim();
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    let Some(info) = read_download_info(&db, id)? else { return Ok(None); };
    if info.state == "downloading" && !download_is_active(id) {
        let partial_path = format!("{}.part", info.path);
        let retained_bytes = fs::metadata(&partial_path).map(|metadata| metadata.len() as i64).unwrap_or(info.bytes);
        db.execute("UPDATE downloads SET bytes = ?1, state = 'cancelled', error = ?2 WHERE song_id = ?3", params![retained_bytes, "download interrupted; retry to resume", id]).map_err(|error| format!("download recovery state failed: {error}"))?;
        return read_download_info(&db, id);
    }
    Ok(Some(info))
}

#[tauri::command]
fn download_cancel(song_id: String) -> Result<(), String> {
    let id = song_id.trim();
    if id.is_empty() { return Err("download song id is empty".to_owned()); }
    let map = download_cancel_map().lock().map_err(|_| "download cancellation state poisoned".to_owned())?;
    if let Some(flag) = map.get(id) { flag.store(true, Ordering::Release); Ok(()) } else { Err("download is not currently active".to_owned()) }
}

#[tauri::command]
fn library_player_cache(state: tauri::State<'_, RuntimeState>) -> Result<Vec<YtItem>, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    let mut statement = db.prepare("SELECT s.id, s.kind, s.title, s.subtitle, s.thumbnail, s.browse_id, s.playlist_id, s.video_id, s.set_video_id, s.explicit, s.music_video_type, pc.path FROM player_cache pc INNER JOIN songs s ON s.id = pc.song_id WHERE pc.bytes > 0 AND NOT EXISTS (SELECT 1 FROM downloads d WHERE d.song_id = pc.song_id AND d.state = 'completed') ORDER BY pc.cached_at DESC").map_err(|error| format!("player cache query failed: {error}"))?;
    let rows = statement.query_map([], |row| Ok((YtItem { id: row.get(0)?, kind: row.get(1)?, title: row.get(2)?, subtitle: row.get(3)?, thumbnail: row.get(4)?, artists: Vec::new(), browse_id: row.get(5)?, playlist_id: row.get(6)?, video_id: row.get(7)?, set_video_id: row.get(8)?, play_playlist_id: None, play_video_id: None, params: None, explicit: row.get::<_, i64>(9)? != 0, music_video_type: row.get(10)?, history_remove_token: None, album_id: None, album_title: None }, row.get::<_, String>(11)?))).map_err(|error| format!("player cache rows failed: {error}"))?;
    let mut items = Vec::new();
    for row in rows {
        let (item, path) = row.map_err(|error| format!("player cache row decode failed: {error}"))?;
        if Path::new(&path).is_file() { items.push(item); } else { let _ = db.execute("DELETE FROM player_cache WHERE song_id = ?1", params![item.id]); }
    }
    Ok(items)
}

#[tauri::command]
fn player_cache_remove(song_id: String, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let id = song_id.trim();
    if id.is_empty() { return Err("player cache song id is empty".to_owned()); }
    player_cache_blocked().lock().map_err(|_| "player cache state poisoned".to_owned())?.insert(id.to_owned());
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    if let Some(path) = db.query_row("SELECT path FROM player_cache WHERE song_id = ?1", params![id], |row| row.get::<_, String>(0)).optional().map_err(|error| format!("player cache path read failed: {error}"))? { let _ = fs::remove_file(path); let _ = fs::remove_file(format!("{}.part", player_cache_path(id).to_string_lossy())); }
    db.execute("DELETE FROM player_cache WHERE song_id = ?1", params![id]).map_err(|error| format!("player cache removal failed: {error}"))?;
    Ok(())
}

#[tauri::command]
fn download_remove(song_id: String, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let id = song_id.trim();
    if id.is_empty() { return Err("download song id is empty".to_owned()); }
    if download_cancel_map().lock().map_err(|_| "download cancellation state poisoned".to_owned())?.contains_key(id) { return Err("cancel the active download before removing its cache".to_owned()); }
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    if let Some(info) = read_download_info(&db, id)? {
        let path = info.path;
        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(format!("{}.part", path));
        if let Some(artwork_path) = info.artwork_path { let _ = fs::remove_file(&artwork_path); let _ = fs::remove_file(format!("{}.part", artwork_path)); }
        for extension in ["jpg", "png", "webp", "cover"] { let artwork = download_artwork_path(id, extension); let _ = fs::remove_file(&artwork); let _ = fs::remove_file(format!("{}.part", artwork.to_string_lossy())); }
    }
    db.execute("DELETE FROM downloads WHERE song_id = ?1", params![id]).map_err(|error| format!("download cache removal failed: {error}"))?;
    Ok(())
}

#[tauri::command]
async fn download_start(item: YtItem, audio_quality: Option<String>, app: tauri::AppHandle, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let video_id = item.video_id.as_deref().map(str::trim).filter(|value| !value.is_empty()).ok_or_else(|| "offline download requires a source videoId".to_owned())?;
    let song_id = item.id.trim().to_owned();
    if song_id.is_empty() { return Err("offline download song id is empty".to_owned()); }
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut map = download_cancel_map().lock().map_err(|_| "download cancellation state poisoned".to_owned())?;
        if map.contains_key(&song_id) { return Err("download is already active".to_owned()); }
        map.insert(song_id.clone(), cancel.clone());
    }
    let final_path = download_cache_path(&song_id);
    let partial_path = PathBuf::from(format!("{}.part", final_path.to_string_lossy()));
    let existing_partial_bytes = fs::metadata(&partial_path).map(|metadata| metadata.len() as i64).unwrap_or(0);
    if let Some(parent) = final_path.parent() { fs::create_dir_all(parent).map_err(|error| format!("download cache directory failed: {error}"))?; }
    {
        let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
        if let Some(old_artwork) = db.query_row("SELECT artwork_path FROM downloads WHERE song_id = ?1", params![song_id], |row| row.get::<_, Option<String>>(0)).optional().map_err(|error| format!("download artwork state read failed: {error}"))?.flatten() { let _ = fs::remove_file(old_artwork); }
        db.execute("INSERT INTO songs (id, title, subtitle, thumbnail, browse_id, playlist_id, video_id, set_video_id, kind, saved_at, explicit, music_video_type, liked, liked_date, in_library, is_video, uploaded, youtube_liked, album_id, duration) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, NULL, 0, 0, 0, 0, ?13, ?14) ON CONFLICT(id) DO UPDATE SET title=excluded.title, subtitle=excluded.subtitle, thumbnail=excluded.thumbnail, video_id=excluded.video_id, set_video_id=excluded.set_video_id, kind=excluded.kind, album_id=excluded.album_id, duration=excluded.duration", params![song_id, item.title, item.subtitle, item.thumbnail, item.browse_id, item.playlist_id, item.video_id, item.set_video_id, item.kind, now_seconds(), if item.explicit { 1 } else { 0 }, item.music_video_type, item.album_id, 0]).map_err(|error| format!("download metadata save failed: {error}"))?;
        db.execute("INSERT INTO downloads (song_id, path, bytes, total_bytes, state, error, lyrics_cached, artwork_path, downloaded_at)
 VALUES (?1, ?2, ?3, NULL, 'downloading', NULL, 0, NULL, ?4) ON CONFLICT(song_id) DO UPDATE SET path=excluded.path, bytes=excluded.bytes, total_bytes=NULL, state='downloading', error=NULL, lyrics_cached=0, artwork_path=NULL, downloaded_at=excluded.downloaded_at", params![song_id, final_path.to_string_lossy().to_string(), existing_partial_bytes, now_seconds()]).map_err(|error| format!("download state init failed: {error}"))?;
        if let Some(info) = read_download_info(&db, &song_id)? { emit_download(&app, &info); }
    }
    let state_for_lyrics = state.clone();
    let result: Result<(i64, Option<i64>, bool, Option<String>), String> = async {
        let payload = resolve_player_payload(video_id, item.playlist_id.as_deref(), normalize_audio_quality(audio_quality.as_deref()), &state).await?;
        {
            let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
            db.execute("UPDATE songs SET duration = ?1 WHERE id = ?2 AND duration = 0", params![payload.duration, song_id]).map_err(|error| format!("download duration state failed: {error}"))?;
        }
        let mut request = http().get(&payload.stream_url);
        if existing_partial_bytes > 0 { request = request.header(RANGE, format!("bytes={existing_partial_bytes}-")); }
        let response = request.send().await.map_err(|error| format!("audio cache request failed: {error}"))?;
        let resume = can_resume_partial_download(existing_partial_bytes, response.status());
        let response = if resume {
            response
        } else {
            if existing_partial_bytes > 0 { let _ = fs::remove_file(&partial_path); }
            http().get(&payload.stream_url).send().await.map_err(|error| format!("audio cache request failed: {error}"))?
        }.error_for_status().map_err(|error| format!("audio cache response failed: {error}"))?;
        let total_bytes = response.content_length().map(|value| value as i64).map(|value| if resume { value + existing_partial_bytes } else { value });
        {
            let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
            db.execute("UPDATE downloads SET total_bytes = ?1 WHERE song_id = ?2", params![total_bytes, song_id]).map_err(|error| format!("download size state failed: {error}"))?;
        }
        let mut file = if resume {
            tokio::fs::OpenOptions::new().create(true).append(true).open(&partial_path).await.map_err(|error| format!("download cache file failed: {error}"))?
        } else {
            tokio::fs::File::create(&partial_path).await.map_err(|error| format!("download cache file failed: {error}"))?
        };
        let mut stream = response.bytes_stream();
        let mut bytes = if resume { existing_partial_bytes } else { 0_i64 };
        while let Some(chunk) = stream.next().await {
            if cancel.load(Ordering::Acquire) { return Err("download cancelled".to_owned()); }
            let chunk = chunk.map_err(|error| format!("download stream failed: {error}"))?;
            file.write_all(&chunk).await.map_err(|error| format!("download cache write failed: {error}"))?;
            bytes += chunk.len() as i64;
            if bytes % ((1024 * 1024) as i64) < chunk.len() as i64 {
                let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
                db.execute("UPDATE downloads SET bytes = ?1 WHERE song_id = ?2", params![bytes, song_id]).map_err(|error| format!("download progress state failed: {error}"))?;
                if let Some(info) = read_download_info(&db, &song_id)? { emit_download(&app, &info); }
            }
        }
        file.flush().await.map_err(|error| format!("download cache flush failed: {error}"))?;
        drop(file);
        fs::rename(&partial_path, &final_path).map_err(|error| format!("download cache finalize failed: {error}"))?;
        let artwork_path = cache_download_artwork(&song_id, item.thumbnail.as_deref()).await;
        let artist = item.artists.iter().map(|value| value.name.as_str()).collect::<Vec<_>>().join(", ");
        let artist = if artist.trim().is_empty() { item.subtitle.clone() } else { artist };
        let lyric_duration = payload.duration.clamp(0, i32::MAX as i64) as i32;
        let lyrics_results = fetch_all_enabled_lyrics(&item.title, &artist, lyric_duration, item.album_title.as_deref(), Some(video_id), &state_for_lyrics).await.unwrap_or_default();
        let lyrics_cached = !lyrics_results.is_empty();
        let lyrics_cache_id = format!("lyrics:{}:{}", clean_lyrics_title(&item.title).to_lowercase(), clean_lyrics_artist(&artist).to_lowercase());
        let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
        for (index, lyrics) in lyrics_results.iter().enumerate() {
            if index == 0 { cache_lyrics_payload(&db, &lyrics_cache_id, lyrics)?; }
            else { cache_lyrics_variant(&db, &lyrics_cache_id, lyrics)?; }
        }
        db.execute("UPDATE downloads SET bytes = ?1, total_bytes = ?2, state = 'completed', error = NULL, lyrics_cached = ?3, artwork_path = ?4 WHERE song_id = ?5", params![bytes, total_bytes.or(Some(bytes)), if lyrics_cached { 1 } else { 0 }, artwork_path, song_id]).map_err(|error| format!("download completion state failed: {error}"))?;
        if let Some(info) = read_download_info(&db, &song_id)? { emit_download(&app, &info); }
        Ok((bytes, total_bytes, lyrics_cached, artwork_path))
    }.await;
    download_cancel_map().lock().map_err(|_| "download cancellation state poisoned".to_owned())?.remove(&song_id);
    if let Err(error) = &result {
        let retained_bytes = fs::metadata(&partial_path).map(|metadata| metadata.len() as i64).unwrap_or(0);
        let state_name = if error == "download cancelled" { "cancelled" } else { "failed" };
        let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
        if let Some(info) = read_download_info(&db, &song_id)? { if let Some(artwork_path) = info.artwork_path { let _ = fs::remove_file(&artwork_path); let _ = fs::remove_file(format!("{}.part", artwork_path)); } }
        db.execute("UPDATE downloads SET bytes = ?1, state = ?2, error = ?3, artwork_path = NULL WHERE song_id = ?4", params![retained_bytes, state_name, error, song_id]).map_err(|db_error| format!("download failure state failed: {db_error}"))?;
        if let Some(info) = read_download_info(&db, &song_id)? { emit_download(&app, &info); }
    }
    result.map(|_| ())
}

#[tauri::command]
async fn ytm_player(video_id: String, playlist_id: Option<String>, audio_quality: Option<String>, state: tauri::State<'_, RuntimeState>) -> Result<PlayerPayload, String> {
    let id = video_id.trim().to_owned();
    if id.is_empty() { return Err("video id is empty".to_owned()); }
    let requested_quality = normalize_audio_quality(audio_quality.as_deref());
    player_cache_blocked().lock().map_err(|_| "player cache state poisoned".to_owned())?.remove(&id);
    let cached = {
        let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
        db.query_row("SELECT path, bytes FROM player_cache WHERE song_id = ?1 AND quality = ?2", params![id, requested_quality], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))).optional().map_err(|error| format!("player cache state read failed: {error}"))?
    };
    if let Some((path, _bytes)) = cached.filter(|(path, bytes)| *bytes > 0 && Path::new(path).is_file()) {
        return Ok(PlayerPayload { video_id: id, title: None, artist: None, stream_url: path, mime_type: "audio/mpeg".to_owned(), bitrate: 0, expires_in_seconds: 0, duration: 0 });
    }
    let payload = resolve_player_payload(&id, playlist_id.as_deref(), requested_quality, &state).await?;
    let cache_url = payload.stream_url.clone();
    let cache_id = id.clone();
    let cache_path = player_cache_path(&cache_id);
    let should_start = {
        let mut active = player_cache_active().lock().map_err(|_| "player cache state poisoned".to_owned())?;
        active.insert(cache_id.clone())
    };
    if should_start {
        tokio::spawn(async move {
            let result: Result<(), String> = async {
                if let Some(parent) = cache_path.parent() { tokio::fs::create_dir_all(parent).await.map_err(|error| format!("player cache directory failed: {error}"))?; }
                let response = http().get(&cache_url).send().await.map_err(|error| format!("player cache request failed: {error}"))?.error_for_status().map_err(|error| format!("player cache response failed: {error}"))?;
                let mut file = tokio::fs::File::create(format!("{}.part", cache_path.to_string_lossy())).await.map_err(|error| format!("player cache file failed: {error}"))?;
                let mut stream = response.bytes_stream();
                let mut bytes = 0_i64;
                while let Some(chunk) = stream.next().await {
                    let chunk = chunk.map_err(|error| format!("player cache stream failed: {error}"))?;
                    file.write_all(&chunk).await.map_err(|error| format!("player cache write failed: {error}"))?;
                    bytes += chunk.len() as i64;
                }
                file.flush().await.map_err(|error| format!("player cache flush failed: {error}"))?;
                drop(file);
                if player_cache_is_blocked(&cache_id) { return Err("player cache was removed".to_owned()); }
                fs::rename(format!("{}.part", cache_path.to_string_lossy()), &cache_path).map_err(|error| format!("player cache finalize failed: {error}"))?;
                if player_cache_is_blocked(&cache_id) { let _ = fs::remove_file(&cache_path); return Err("player cache was removed".to_owned()); }
                let db = Connection::open(database_path()).map_err(|error| format!("player cache database open failed: {error}"))?;
                db.execute("INSERT INTO player_cache (song_id, path, bytes, cached_at, quality) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(song_id) DO UPDATE SET path=excluded.path, bytes=excluded.bytes, cached_at=excluded.cached_at, quality=excluded.quality", params![cache_id, cache_path.to_string_lossy().to_string(), bytes, now_seconds(), requested_quality]).map_err(|error| format!("player cache state write failed: {error}"))?;
                Ok(())
            }.await;
            if result.is_err() { let _ = fs::remove_file(format!("{}.part", cache_path.to_string_lossy())); }
            if let Ok(mut active) = player_cache_active().lock() { active.remove(&cache_id); }
        });
    }
    Ok(payload)
}

fn parse_queue_panel_item(renderer: &Value) -> Option<YtItem> {
    let video_id = renderer.get("videoId").and_then(Value::as_str)?.to_owned();
    let title = text(renderer.get("title"));
    if title.is_empty() { return None; }
    let subtitle = text(renderer.get("longBylineText"));
    let (play_video_id, playlist_id) = watch_endpoint(renderer.get("navigationEndpoint"));
    let thumbnail = thumbnail(renderer.get("thumbnail"));
    Some(YtItem { id: video_id.clone(), kind: "song".to_owned(), title, subtitle, thumbnail, artists: parse_artists(renderer.get("longBylineText")), browse_id: None, playlist_id: playlist_id.clone(), video_id: Some(video_id.clone()), set_video_id: renderer.get("playlistSetVideoId").and_then(Value::as_str).map(str::to_owned), play_playlist_id: playlist_id, play_video_id: play_video_id.or(Some(video_id)), params: None, explicit: explicit_badge(renderer), music_video_type: music_video_type(renderer.get("navigationEndpoint")).or_else(|| renderer.get("musicVideoType").and_then(Value::as_str).map(str::to_owned)), history_remove_token: None, album_id: None, album_title: None })
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
    let panel = response.get("continuationContents").and_then(|v| v.get("playlistPanelContinuation")).or_else(|| response.get("contents").and_then(|v| v.get("singleColumnMusicWatchNextResultsRenderer")).and_then(|v| v.get("tabbedRenderer")).and_then(|v| v.get("watchNextTabbedResultsRenderer")).and_then(|v| v.get("tabs")).and_then(|v| v.get(0)).and_then(|v| v.get("tabRenderer")).and_then(|v| v.get("content")).and_then(|v| v.get("musicQueueRenderer")).and_then(|v| v.get("content")).and_then(|v| v.get("playlistPanelRenderer")));
    let contents = panel.and_then(|v| v.get("contents")).and_then(Value::as_array);
    let mut items = Vec::new();
    let mut current_index = None;
    for content in contents.into_iter().flatten() {
        if let Some(renderer) = content.get("playlistPanelVideoRenderer") {
            if let Some(item) = parse_queue_panel_item(renderer) {
                if renderer.get("selected").and_then(Value::as_bool) == Some(true) { current_index = Some(items.len()); }
                items.push(item);
            }
        }
    }
    let title = response.get("contents").and_then(|v| v.get("singleColumnMusicWatchNextResultsRenderer")).and_then(|v| v.get("tabbedRenderer")).and_then(|v| v.get("watchNextTabbedResultsRenderer")).and_then(|v| v.get("tabs")).and_then(|v| v.get(0)).and_then(|v| v.get("tabRenderer")).and_then(|v| v.get("content")).and_then(|v| v.get("musicQueueRenderer")).and_then(|v| v.get("header")).and_then(|v| v.get("musicQueueHeaderRenderer")).and_then(|v| v.get("subtitle")).map(|v| text(Some(v))).filter(|v| !v.is_empty());
    let continuation = panel.and_then(|v| v.get("continuations")).and_then(Value::as_array).and_then(|v| v.first()).and_then(|v| v.get("nextContinuationData")).and_then(|v| v.get("continuation")).and_then(Value::as_str).map(str::to_owned);
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
    QueuePage { title, items, current_index, continuation, related_browse_id, related_params }
}

fn parse_related(response: &Value) -> Vec<YtItem> {
    let mut parsed = Vec::new();
    collect_typed_items(response, &mut parsed);
    let mut seen = HashSet::new();
    parsed
        .into_iter()
        .filter(|item| item.kind == "song" && item.music_video_type.as_deref() == Some("MUSIC_VIDEO_TYPE_ATV"))
        .filter(|item| seen.insert(item.id.clone()))
        .collect()
}

fn parse_multi_row_episode(renderer: &Value) -> Option<YtItem> {
    let title = text(renderer.get("title"));
    let (video_id, playlist_id) = watch_endpoint(renderer.get("onTap"));
    let video_id = video_id?;
    let subtitle = text(renderer.get("subtitle"));
    let image = thumbnail(renderer.get("thumbnail").and_then(|v| v.get("musicThumbnailRenderer")).and_then(|v| v.get("thumbnail")));
    Some(YtItem { id: video_id.clone(), kind: "episode".to_owned(), title, subtitle, thumbnail: image, artists: Vec::new(), browse_id: None, playlist_id: playlist_id.clone(), video_id: Some(video_id.clone()), set_video_id: None, play_playlist_id: playlist_id, play_video_id: Some(video_id), params: None, explicit: explicit_badge(renderer), music_video_type: music_video_type(renderer.get("onTap")), history_remove_token: None, album_id: None, album_title: None })
}

fn parse_browse_item(value: &Value) -> Option<YtItem> {
    value.get("musicTwoRowItemRenderer").and_then(parse_two_row)
        .or_else(|| value.get("musicMultiRowListItemRenderer").and_then(parse_multi_row_episode))
        .or_else(|| value.get("musicResponsiveListItemRenderer").and_then(parse_responsive_typed))
}
fn parse_browse_navigation(value: &Value) -> Option<YtItem> {
    let title = text(value.get("buttonText"));
    if title.is_empty() { return None; }
    let endpoint = value.get("clickCommand").or_else(|| value.get("navigationEndpoint"));
    let (browse_id, params) = browse_endpoint(endpoint);
    let browse_id = browse_id?;
    Some(YtItem { id: browse_id.clone(), kind: "browse".to_owned(), title, subtitle: "Browse".to_owned(), thumbnail: None, artists: Vec::new(), browse_id: Some(browse_id), playlist_id: None, video_id: None, set_video_id: None, play_playlist_id: None, play_video_id: None, params, explicit: false, music_video_type: None, history_remove_token: None, album_id: None, album_title: None })
}
fn parse_browse_response(response: &Value, browse_id: &str) -> DetailPage {
    let section_list = response.get("contents").and_then(|v| v.get("singleColumnBrowseResultsRenderer")).and_then(|v| v.get("tabs")).and_then(|v| v.get(0)).and_then(|v| v.get("tabRenderer")).and_then(|v| v.get("content")).and_then(|v| v.get("sectionListRenderer")).or_else(|| response.get("continuationContents").and_then(|v| v.get("sectionListContinuation")));
    let mut items = Vec::new();
    if let Some(contents) = section_list.and_then(|v| v.get("contents")).and_then(Value::as_array) {
        for section in contents {
            if let Some(grid) = section.get("gridRenderer") {
                items.extend(grid.get("items").and_then(Value::as_array).into_iter().flatten().filter_map(|item| parse_browse_item(item).or_else(|| item.get("musicNavigationButtonRenderer").and_then(parse_browse_navigation))));
            }
            if let Some(carousel) = section.get("musicCarouselShelfRenderer") {
                items.extend(carousel.get("contents").and_then(Value::as_array).into_iter().flatten().filter_map(|item| parse_browse_item(item).or_else(|| item.get("musicNavigationButtonRenderer").and_then(parse_browse_navigation))));
            }
            if let Some(shelf) = section.get("musicShelfRenderer") {
                items.extend(shelf.get("contents").and_then(Value::as_array).into_iter().flatten().filter_map(parse_browse_item));
            }
            if let Some(playlist_shelf) = section.get("musicPlaylistShelfRenderer") {
                items.extend(playlist_shelf.get("contents").and_then(Value::as_array).into_iter().flatten().filter_map(parse_browse_item));
            }
        }
    }
    let mut seen = std::collections::HashSet::new();
    items.retain(|item| seen.insert((item.kind.clone(), item.id.clone())));
    let title = response.get("header").and_then(|v| v.get("musicHeaderRenderer")).map(|v| text(v.get("title"))).filter(|v| !v.is_empty()).unwrap_or_else(|| browse_id.to_owned());
    let continuation = section_list.and_then(|v| v.get("continuations")).and_then(Value::as_array).and_then(|values| values.first()).and_then(|value| value.get("nextContinuationData")).and_then(|v| v.get("continuation")).and_then(Value::as_str).map(str::to_owned);
    DetailPage { kind: "browse".to_owned(), title, subtitle: "Meld browse results".to_owned(), thumbnail: None, items, continuation, browse_id: Some(browse_id.to_owned()) }
}
fn parse_home_sections(contents: Option<&Value>) -> Vec<HomeSection> {
    let Some(contents) = contents.and_then(Value::as_array) else { return Vec::new(); };
    let mut sections = Vec::new();
    for section in contents {
        let Some(carousel) = section.get("musicCarouselShelfRenderer") else { continue };
        let header = carousel.get("header").and_then(|v| v.get("musicCarouselShelfBasicHeaderRenderer"));
        let title = text(header.and_then(|v| v.get("title")));
        if title.is_empty() { continue; }
        let items = carousel.get("contents").and_then(Value::as_array).into_iter().flatten().filter_map(|item| {
            item.get("musicTwoRowItemRenderer").and_then(parse_two_row)
                .or_else(|| item.get("musicMultiRowListItemRenderer").and_then(parse_multi_row_episode))
                .or_else(|| item.get("musicResponsiveListItemRenderer").and_then(parse_responsive_typed))
        }).collect::<Vec<_>>();
        if items.is_empty() { continue; }
        let more_endpoint = header.and_then(|v| v.get("moreContentButton")).and_then(|v| v.get("buttonRenderer")).and_then(|v| v.get("navigationEndpoint"));
        let (browse_id, params) = browse_endpoint(more_endpoint);
        let browse_kind = browse_kind(more_endpoint, browse_id.as_deref());
        sections.push(HomeSection {
            title,
            label: Some(text(header.and_then(|v| v.get("strapline")))).filter(|v| !v.is_empty()),
            thumbnail: thumbnail(header.and_then(|v| v.get("thumbnail")).and_then(|v| v.get("musicThumbnailRenderer")).and_then(|v| v.get("thumbnail"))),
            browse_id,
            params,
            browse_kind,
            items,
        });
    }
    sections
}

fn home_continuation(response: &Value) -> Option<String> {
    response.get("continuationContents")
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
    let section_list = response.get("contents").and_then(|v| v.get("singleColumnBrowseResultsRenderer")).and_then(|v| v.get("tabs")).and_then(|v| v.get(0)).and_then(|v| v.get("tabRenderer")).and_then(|v| v.get("content")).and_then(|v| v.get("sectionListRenderer"));
    let sections = parse_home_sections(section_list.and_then(|v| v.get("contents")));
    let continuation = section_list.and_then(|v| v.get("continuations")).and_then(Value::as_array).and_then(|items| items.first()).and_then(|item| item.get("nextContinuationData")).and_then(|v| v.get("continuation")).and_then(Value::as_str).map(str::to_owned);
    HomePage { sections, continuation }
}

fn parse_home_continuation(response: &Value) -> HomePage {
    let section_list = response.get("continuationContents").and_then(|v| v.get("sectionListContinuation"));
    HomePage { sections: parse_home_sections(section_list.and_then(|v| v.get("contents"))), continuation: home_continuation(response) }
}

fn parse_responsive_typed(renderer: &Value) -> Option<YtItem> {
    let columns = renderer.get("flexColumns").and_then(Value::as_array)?;
    let title = text(columns.first()?.get("musicResponsiveListItemFlexColumnRenderer")?.get("text"));
    if title.is_empty() { return None; }
    let secondary = columns.get(1).and_then(|v| v.get("musicResponsiveListItemFlexColumnRenderer")).and_then(|v| v.get("text"));
    let subtitle = text(secondary);
    let navigation = renderer.get("navigationEndpoint");
    let (browse_id, browse_params) = browse_endpoint(navigation);
    let (navigation_video, navigation_playlist) = watch_endpoint(navigation);
    let overlay = renderer.get("overlay").and_then(|v| v.get("musicItemThumbnailOverlayRenderer")).and_then(|v| v.get("content")).and_then(|v| v.get("musicPlayButtonRenderer")).and_then(|v| v.get("playNavigationEndpoint"));
    let (overlay_video, overlay_playlist) = watch_endpoint(overlay);
    let page_type = navigation.and_then(|v| v.get("browseEndpoint")).and_then(|v| v.get("browseEndpointContextSupportedConfigs")).and_then(|v| v.get("browseEndpointContextMusicConfig")).and_then(|v| v.get("pageType")).and_then(Value::as_str).unwrap_or("");
    let video_id = renderer.get("playlistItemData").and_then(|v| v.get("videoId")).and_then(Value::as_str).map(str::to_owned).or(navigation_video.clone());
    let collection_link = secondary.and_then(|v| v.get("runs")).and_then(Value::as_array).into_iter().flatten().find_map(|run| {
        let endpoint = run.get("navigationEndpoint")?.get("browseEndpoint")?;
        let browse_id = endpoint.get("browseId").and_then(Value::as_str)?.to_owned();
        let page_type = endpoint.get("browseEndpointContextSupportedConfigs").and_then(|v| v.get("browseEndpointContextMusicConfig")).and_then(|v| v.get("pageType")).and_then(Value::as_str).unwrap_or("");
        (page_type.contains("ALBUM") || page_type.contains("PODCAST_SHOW_DETAIL_PAGE") || browse_id.starts_with("MPSP")).then_some((browse_id, run.get("text").and_then(Value::as_str).unwrap_or("").to_owned()))
    });
    let podcast_link = collection_link.as_ref().is_some_and(|(browse_id, _)| browse_id.starts_with("MPSP") || browse_id.contains("PODCAST"));
    let first_subtitle = secondary.and_then(|v| v.get("runs")).and_then(Value::as_array).and_then(|runs| runs.first()).and_then(|v| v.get("text")).and_then(Value::as_str).unwrap_or("");
    let set_video_id = renderer.get("playlistItemData").and_then(|value| value.get("playlistSetVideoId")).and_then(Value::as_str).map(str::to_owned);
    let is_episode = video_id.is_some() && (page_type.contains("NON_MUSIC_AUDIO_TRACK") || first_subtitle.eq_ignore_ascii_case("Episode") || podcast_link);
    let kind = if is_episode { "episode" } else if video_id.is_some() { "song" } else if page_type.contains("ALBUM") { "album" } else if page_type.contains("PLAYLIST") || browse_id.as_deref().unwrap_or("").starts_with("VL") { "playlist" } else if page_type.contains("ARTIST") || page_type.contains("USER_CHANNEL") || browse_id.as_deref().unwrap_or("").starts_with("UC") { "artist" } else if page_type.contains("PODCAST") { "podcast" } else { return None };
    let id = video_id.clone().or_else(|| browse_id.clone())?;
    let thumbnail = thumbnail(renderer.get("thumbnail").and_then(|v| v.get("musicThumbnailRenderer")).and_then(|v| v.get("thumbnail")));
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
        music_video_type: music_video_type(renderer.get("navigationEndpoint")).or_else(|| renderer.get("musicVideoType").and_then(Value::as_str).map(str::to_owned)),
        history_remove_token: None,
        album_id: collection_link.as_ref().map(|(id, _)| id.clone()),
        album_title: collection_link.map(|(_, title)| title).filter(|value| !value.is_empty()),
    })
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
        .or_else(|| response
            .get("contents")
            .and_then(|value| value.get("twoColumnSearchResultsRenderer"))
            .and_then(|value| value.get("primaryContents"))
            .and_then(|value| value.get("sectionListRenderer"))
            .and_then(|value| value.get("contents"))
            .and_then(Value::as_array));
    let continuation = shelves
        .into_iter()
        .flatten()
        .filter_map(|shelf| shelf.get("musicShelfRenderer"))
        .find_map(|shelf| shelf.get("continuations").and_then(Value::as_array).and_then(|values| values.first()).and_then(|value| value.get("nextContinuationData")).and_then(|value| value.get("continuation")).and_then(Value::as_str).map(str::to_owned));
    let mut items = shelves
        .into_iter()
        .flatten()
        .filter_map(|shelf| shelf.get("musicShelfRenderer"))
        .flat_map(|shelf| shelf.get("contents").and_then(Value::as_array).into_iter().flatten())
        .filter_map(|content| content.get("musicResponsiveListItemRenderer"))
        .filter_map(parse_responsive_typed)
        .fold(Vec::<YtItem>::new(), |mut items, item| {
            if !items.iter().any(|existing| existing.id == item.id) { items.push(item); }
            items
        });
    if items.is_empty() {
        collect_typed_items(response, &mut items);
    }
    SearchPage { items, continuation }
}

fn parse_search_continuation(response: &Value) -> SearchPage {
    let shelf = response.get("continuationContents").and_then(|value| value.get("musicShelfContinuation"));
    let items = shelf
        .and_then(|value| value.get("contents"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|content| content.get("musicResponsiveListItemRenderer"))
        .filter_map(parse_responsive_typed)
        .fold(Vec::<YtItem>::new(), |mut items, item| {
            if !items.iter().any(|existing| existing.id == item.id) { items.push(item); }
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
    SearchPage { items, continuation }
}

fn collect_typed_items(value: &Value, items: &mut Vec<YtItem>) {
    if let Some(object) = value.as_object() {
        if let Some(renderer) = object.get("musicTwoRowItemRenderer").and_then(parse_two_row) { if !items.iter().any(|item| item.id == renderer.id) { items.push(renderer); } }
        if let Some(renderer) = object.get("musicMultiRowListItemRenderer").and_then(parse_multi_row_episode) { if !items.iter().any(|item| item.id == renderer.id) { items.push(renderer); } }
        if let Some(renderer) = object.get("musicResponsiveListItemRenderer").and_then(parse_responsive_typed) { if !items.iter().any(|item| item.id == renderer.id) { items.push(renderer); } }
        for child in object.values() { collect_typed_items(child, items); }
    } else if let Some(array) = value.as_array() {
        for child in array { collect_typed_items(child, items); }
    }
}

fn detail_section_list(response: &Value) -> Option<&Value> {
    let two_column = response.get("contents")
        .and_then(|value| value.get("twoColumnBrowseResultsRenderer"))
        .and_then(|value| value.get("tabs"))
        .and_then(|value| value.get(0))
        .and_then(|value| value.get("tabRenderer"))
        .and_then(|value| value.get("content"))
        .and_then(|value| value.get("sectionListRenderer"));
    two_column.or_else(|| response.get("contents")
        .and_then(|value| value.get("singleColumnBrowseResultsRenderer"))
        .and_then(|value| value.get("tabs"))
        .and_then(|value| value.get(0))
        .and_then(|value| value.get("tabRenderer"))
        .and_then(|value| value.get("content"))
        .and_then(|value| value.get("sectionListRenderer")))
}

fn first_continuation(value: &Value) -> Option<String> {
    if let Some(object) = value.as_object() {
        if let Some(token) = object.get("continuations")
            .and_then(Value::as_array)
            .and_then(|values| values.iter().find_map(|entry| entry.get("nextContinuationData")))
            .and_then(|entry| entry.get("continuation"))
            .and_then(Value::as_str)
        {
            return Some(token.to_owned());
        }
        for child in object.values() {
            if let Some(token) = first_continuation(child) { return Some(token); }
        }
    } else if let Some(array) = value.as_array() {
        for child in array {
            if let Some(token) = first_continuation(child) { return Some(token); }
        }
    }
    None
}

fn parse_detail(response: &Value, kind: &str, browse_id: Option<&str>) -> DetailPage {
    let section_list = detail_section_list(response);
    let header = section_list
        .and_then(|value| value.get("contents"))
        .and_then(|value| value.as_array())
        .and_then(|values| values.iter().find_map(|value| {
            ["musicResponsiveHeaderRenderer", "musicImmersiveHeaderRenderer", "musicVisualHeaderRenderer", "musicDetailHeaderRenderer", "musicHeaderRenderer"]
                .iter()
                .find_map(|key| value.get(*key))
        }));
    let fallback_header = response.get("header").and_then(|v| v.get("musicImmersiveHeaderRenderer"))
        .or_else(|| response.get("header").and_then(|v| v.get("musicVisualHeaderRenderer")))
        .or_else(|| response.get("header").and_then(|v| v.get("musicDetailHeaderRenderer")))
        .or_else(|| response.get("header").and_then(|v| v.get("musicHeaderRenderer")));
    let active_header = header.or(fallback_header);
    let mut items = Vec::new();
    collect_typed_items(response, &mut items);
    let continuation = first_continuation(response);
    DetailPage {
        kind: kind.to_owned(),
        title: text(active_header.and_then(|v| v.get("title"))),
        subtitle: text(active_header.and_then(|v| v.get("subtitle")).or_else(|| active_header.and_then(|v| v.get("straplineTextOne")))),
        thumbnail: thumbnail(active_header.and_then(|v| v.get("thumbnail")).and_then(|v| v.get("musicThumbnailRenderer")).and_then(|v| v.get("thumbnail"))),
        items,
        continuation,
        browse_id: browse_id.map(str::to_owned),
    }
}

#[tauri::command]
async fn ytm_browse(browse_id: String, params: Option<String>, state: tauri::State<'_, RuntimeState>) -> Result<DetailPage, String> {
    let id = browse_id.trim();
    if id.is_empty() { return Err("browse id is empty".to_owned()); }
    let visitor_data = visitor(&state).await?;
    let request_session = browse_session(&state, auth_session(&state)?)?;
    let data_sync_id = request_session.as_ref().map(|value| value.data_sync_id.as_str());
    let mut body = json!({ "context": context(&visitor_data, request_session.is_some(), data_sync_id), "browseId": id });
    if let Some(value) = params.filter(|value| !value.trim().is_empty()) { body["params"] = json!(value); }
    let response = post("browse", body, request_session.as_ref()).await?;
    Ok(parse_browse_response(&response, id))
}
#[tauri::command]
async fn ytm_browse_continuation(browse_id: String, continuation: String, state: tauri::State<'_, RuntimeState>) -> Result<DetailPage, String> {
    let id = browse_id.trim();
    let token = continuation.trim();
    if id.is_empty() || token.is_empty() { return Err("browse continuation arguments are empty".to_owned()); }
    let visitor_data = visitor(&state).await?;
    let request_session = browse_session(&state, auth_session(&state)?)?;
    let data_sync_id = request_session.as_ref().map(|value| value.data_sync_id.as_str());
    let response = post("browse", json!({ "context": context(&visitor_data, request_session.is_some(), data_sync_id), "continuation": token }), request_session.as_ref()).await?;
    Ok(parse_browse_response(&response, id))
}
#[tauri::command]
async fn ytm_detail(kind: String, browse_id: String, state: tauri::State<'_, RuntimeState>) -> Result<DetailPage, String> {
    let id = browse_id.trim();
    if id.is_empty() { return Err("detail browse id is empty".to_owned()); }
    let normalized_kind = kind.trim().to_lowercase();
    if !matches!(normalized_kind.as_str(), "album" | "artist" | "podcast") { return Err(format!("unsupported detail kind: {normalized_kind}")); }
    let cached_podcast_detail = if normalized_kind == "podcast" {
        let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
        db.query_row("SELECT detail_json FROM podcasts WHERE id = ?1 AND detail_json IS NOT NULL", params![id], |row| row.get::<_, String>(0)).optional().map_err(|error| format!("podcast detail cache read failed: {error}"))?
    } else {
        None
    };
    if auth_session(&state)?.is_none() {
        if let Some(serialized) = cached_podcast_detail.as_deref() {
            return serde_json::from_str(serialized).map_err(|error| format!("cached podcast detail decode failed: {error}"));
        }
    }
    let visitor_data = visitor(&state).await?;
    let session = auth_session(&state)?;
    let data_sync_id = session.as_ref().map(|value| value.data_sync_id.as_str());
    let response = match post("browse", json!({ "context": context(&visitor_data, session.is_some(), data_sync_id), "browseId": id }), session.as_ref()).await {
        Ok(response) => response,
        Err(error) => {
            if let Some(serialized) = cached_podcast_detail.as_deref() {
                return serde_json::from_str(serialized).map_err(|decode_error| format!("cached podcast detail decode failed after network error: {decode_error}"));
            }
            return Err(error);
        }
    };
    let page = parse_detail(&response, &normalized_kind, Some(id));
    if normalized_kind == "podcast" {
        if let Ok(serialized) = serde_json::to_string(&page) {
            if let Ok(db) = state.db.lock() {
                let _ = db.execute("UPDATE podcasts SET detail_json = ?1 WHERE id = ?2", params![serialized, id]);
            }
        }
    }
    Ok(page)
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
    let header = base.and_then(|v| v.get("musicResponsiveHeaderRenderer")).or_else(|| base.and_then(|v| v.get("musicEditablePlaylistDetailHeaderRenderer")).and_then(|v| v.get("header")).and_then(|v| v.get("musicResponsiveHeaderRenderer")));
    let playlist = YtItem {
        id: playlist_id.to_owned(),
        kind: "playlist".to_owned(),
        title: text(header.and_then(|v| v.get("title"))),
        subtitle: text(header.and_then(|v| v.get("secondSubtitle"))),
        thumbnail: thumbnail(header.and_then(|v| v.get("thumbnail")).and_then(|v| v.get("musicThumbnailRenderer")).and_then(|v| v.get("thumbnail"))),
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
    let shelf = response.get("contents").and_then(|v| v.get("twoColumnBrowseResultsRenderer")).and_then(|v| v.get("secondaryContents")).and_then(|v| v.get("sectionListRenderer")).and_then(|v| v.get("contents")).and_then(|v| v.get(0)).and_then(|v| v.get("musicPlaylistShelfRenderer"));
    let songs = shelf.and_then(|v| v.get("contents")).and_then(Value::as_array).into_iter().flatten().filter_map(|content| content.get("musicResponsiveListItemRenderer")).filter_map(parse_responsive_song).collect();
    let continuation = shelf.and_then(|v| v.get("contents")).and_then(|v| v.get("continuations")).and_then(Value::as_array).and_then(|v| v.first()).and_then(|v| v.get("nextContinuationData")).and_then(|v| v.get("continuation")).and_then(Value::as_str).map(str::to_owned)
        .or_else(|| shelf.and_then(|v| v.get("continuations")).and_then(Value::as_array).and_then(|v| v.first()).and_then(|v| v.get("nextContinuationData")).and_then(|v| v.get("continuation")).and_then(Value::as_str).map(str::to_owned));
    PlaylistPage { playlist, songs, continuation }
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
            if title.is_empty() { return None; }
            let songs = shelf
                .get("contents")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|content| content.get("musicResponsiveListItemRenderer"))
                .filter_map(parse_responsive_song)
                .collect::<Vec<_>>();
            if songs.is_empty() { None } else { Some(RemoteHistorySection { title, songs }) }
        })
        .collect();
    RemoteHistoryPage { sections }
}

fn parse_library_playlists_page(response: &Value) -> (Vec<YtItem>, Option<String>) {
    let initial = response.get("contents").and_then(|value| value.get("singleColumnBrowseResultsRenderer")).and_then(|value| value.get("tabs")).and_then(Value::as_array).and_then(|tabs| tabs.first()).and_then(|tab| tab.get("tabRenderer")).and_then(|tab| tab.get("content")).and_then(|content| content.get("sectionListRenderer")).and_then(|section| section.get("contents")).and_then(Value::as_array).and_then(|contents| contents.first());
    let parse_items = |values: Vec<&Value>| values.into_iter().filter_map(|value| value.get("musicTwoRowItemRenderer").and_then(parse_two_row).or_else(|| value.get("musicResponsiveListItemRenderer").and_then(parse_responsive_typed))).filter(|item| item.kind == "playlist").collect::<Vec<_>>();
    if let Some(grid) = initial.and_then(|value| value.get("gridRenderer")) {
        let items = parse_items(grid.get("items").and_then(Value::as_array).map(|values| values.iter().collect()).unwrap_or_default());
        let continuation = grid.get("continuations").and_then(Value::as_array).and_then(|values| values.first()).and_then(|value| value.get("nextContinuationData")).and_then(|value| value.get("continuation")).and_then(Value::as_str).map(str::to_owned);
        return (items, continuation);
    }
    if let Some(shelf) = initial.and_then(|value| value.get("musicShelfRenderer")) {
        let items = parse_items(shelf.get("contents").and_then(Value::as_array).map(|values| values.iter().collect()).unwrap_or_default());
        let continuation = shelf.get("continuations").and_then(Value::as_array).and_then(|values| values.first()).and_then(|value| value.get("nextContinuationData")).and_then(|value| value.get("continuation")).and_then(Value::as_str).map(str::to_owned);
        return (items, continuation);
    }
    if let Some(grid) = response.get("continuationContents").and_then(|value| value.get("gridContinuation")) {
        let items = parse_items(grid.get("items").and_then(Value::as_array).map(|values| values.iter().collect()).unwrap_or_default());
        let continuation = grid.get("continuations").and_then(Value::as_array).and_then(|values| values.first()).and_then(|value| value.get("nextContinuationData")).and_then(|value| value.get("continuation")).and_then(Value::as_str).map(str::to_owned);
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
        for item in page_items { let key = item.browse_id.clone().unwrap_or_else(|| item.id.clone()); if seen_ids.insert(key) { playlists.push(item); } }
        let Some(token) = continuation else { break; };
        if !seen_continuations.insert(token.clone()) { break; }
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
        let songs = shelf.get("contents").and_then(Value::as_array).into_iter().flatten()
            .filter_map(|content| content.get("musicResponsiveListItemRenderer"))
            .filter_map(parse_responsive_song).collect::<Vec<_>>();
        let continuation = shelf.get("continuations").and_then(Value::as_array).and_then(|values| values.first())
            .and_then(|value| value.get("nextContinuationData")).and_then(|value| value.get("continuation"))
            .and_then(Value::as_str).map(str::to_owned);
        return (songs, continuation);
    }
    if let Some(grid) = initial.and_then(|value| value.get("gridRenderer")) {
        let songs = grid.get("items").and_then(Value::as_array).into_iter().flatten()
            .filter_map(|item| item.get("musicTwoRowItemRenderer"))
            .filter_map(parse_two_row).filter(|item| item.kind == "song" && item.video_id.is_some()).collect::<Vec<_>>();
        let continuation = grid.get("continuations").and_then(Value::as_array).and_then(|values| values.first())
            .and_then(|value| value.get("nextContinuationData")).and_then(|value| value.get("continuation"))
            .and_then(Value::as_str).map(str::to_owned);
        return (songs, continuation);
    }
    if let Some(shelf) = response.get("continuationContents").and_then(|value| value.get("musicShelfContinuation")) {
        let songs = shelf.get("contents").and_then(Value::as_array).into_iter().flatten()
            .filter_map(|content| content.get("musicResponsiveListItemRenderer"))
            .filter_map(parse_responsive_song).collect::<Vec<_>>();
        let continuation = shelf.get("continuations").and_then(Value::as_array).and_then(|values| values.first())
            .and_then(|value| value.get("nextContinuationData")).and_then(|value| value.get("continuation"))
            .and_then(Value::as_str).map(str::to_owned);
        return (songs, continuation);
    }
    if let Some(grid) = response.get("continuationContents").and_then(|value| value.get("gridContinuation")) {
        let songs = grid.get("items").and_then(Value::as_array).into_iter().flatten()
            .filter_map(|item| item.get("musicTwoRowItemRenderer"))
            .filter_map(parse_two_row).filter(|item| item.kind == "song" && item.video_id.is_some()).collect::<Vec<_>>();
        let continuation = grid.get("continuations").and_then(Value::as_array).and_then(|values| values.first())
            .and_then(|value| value.get("nextContinuationData")).and_then(|value| value.get("continuation"))
            .and_then(Value::as_str).map(str::to_owned);
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
    if let Some(contents) = section_list.and_then(|value| value.get("contents")).and_then(Value::as_array) {
        for content in contents {
            if let Some(grid) = content.get("gridRenderer") {
                if let Some(values) = grid.get("items").and_then(Value::as_array) {
                    items.extend(values.iter().filter_map(|value| value.get("musicTwoRowItemRenderer")).filter_map(parse_two_row));
                }
                continuation = continuation.or_else(|| grid.get("continuations").and_then(Value::as_array).and_then(|values| values.first()).and_then(|value| value.get("nextContinuationData")).and_then(|value| value.get("continuation")).and_then(Value::as_str).map(str::to_owned));
            } else if let Some(shelf) = content.get("musicShelfRenderer") {
                if let Some(values) = shelf.get("contents").and_then(Value::as_array) {
                    items.extend(values.iter().filter_map(|value| value.get("musicResponsiveListItemRenderer")).filter_map(parse_responsive_typed));
                }
                continuation = continuation.or_else(|| shelf.get("continuations").and_then(Value::as_array).and_then(|values| values.first()).and_then(|value| value.get("nextContinuationData")).and_then(|value| value.get("continuation")).and_then(Value::as_str).map(str::to_owned));
            }
        }
    }
    if let Some(grid) = response.get("continuationContents").and_then(|value| value.get("gridContinuation")) {
        items.extend(grid.get("items").and_then(Value::as_array).into_iter().flatten().filter_map(|value| value.get("musicTwoRowItemRenderer")).filter_map(parse_two_row));
        continuation = grid.get("continuations").and_then(Value::as_array).and_then(|values| values.first()).and_then(|value| value.get("nextContinuationData")).and_then(|value| value.get("continuation")).and_then(Value::as_str).map(str::to_owned);
    } else if let Some(shelf) = response.get("continuationContents").and_then(|value| value.get("musicShelfContinuation")) {
        items.extend(shelf.get("contents").and_then(Value::as_array).into_iter().flatten().filter_map(|value| value.get("musicResponsiveListItemRenderer")).filter_map(parse_responsive_typed));
        continuation = shelf.get("continuations").and_then(Value::as_array).and_then(|values| values.first()).and_then(|value| value.get("nextContinuationData")).and_then(|value| value.get("continuation")).and_then(Value::as_str).map(str::to_owned);
    }
    (items, continuation)
}

async fn fetch_all_library_items(session: &AuthSession, browse_id: &str, tab_index: usize) -> Result<Vec<YtItem>, String> {
    let mut response = post("browse", json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)), "browseId": browse_id }), Some(session)).await?;
    let mut items = Vec::new();
    let mut seen_ids = HashSet::new();
    let mut seen_continuations = HashSet::new();
    loop {
        let (page_items, continuation) = parse_library_items(&response, tab_index);
        for item in page_items { if seen_ids.insert(item.id.clone()) { items.push(item); } }
        let Some(token) = continuation else { break; };
        if !seen_continuations.insert(token.clone()) { break; }
        response = post("browse", json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)), "continuation": token }), Some(session)).await?;
    }
    Ok(items)
}

fn saved_episode_rows(db: &Connection) -> Result<Vec<YtItem>, String> {
    let mut statement = db.prepare("SELECT id, kind, title, subtitle, thumbnail, browse_id, playlist_id, video_id, set_video_id, explicit, music_video_type FROM songs WHERE in_library = 1 AND kind = 'episode' ORDER BY saved_at DESC").map_err(|error| format!("saved episode query failed: {error}"))?;
    let rows = statement.query_map([], |row| Ok(YtItem {
        id: row.get(0)?, kind: row.get(1)?, title: row.get(2)?, subtitle: row.get(3)?, thumbnail: row.get(4)?, artists: Vec::new(), browse_id: row.get(5)?, playlist_id: row.get(6)?, video_id: row.get(7)?, set_video_id: row.get(8)?, play_playlist_id: Some("SE".to_owned()), play_video_id: row.get(7)?, params: None, explicit: row.get::<_, i64>(9)? != 0, music_video_type: row.get(10)?, history_remove_token: None, album_id: None, album_title: None,
    })).map_err(|error| format!("saved episode rows failed: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| format!("saved episode row decode failed: {error}"))
}

#[tauri::command]
async fn ytm_podcast_episodes(state: tauri::State<'_, RuntimeState>) -> Result<Vec<YtItem>, String> {
    let local = {
        let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
        saved_episode_rows(&db)?
    };
    let Some(session) = auth_session(&state)? else { return Ok(local); };
    let remote = fetch_all_library_items(&session, "FEmusic_library_non_music_audio_list", 0).await.unwrap_or_default().into_iter().filter(|item| item.kind == "episode").collect::<Vec<_>>();
    if remote.is_empty() { return Ok(local); }
    let mut result = remote;
    for item in local { if !result.iter().any(|existing| existing.id == item.id || existing.video_id == item.video_id) { result.push(item); } }
    Ok(result)
}

fn saved_podcast_rows(db: &Connection) -> Result<Vec<YtItem>, String> {
    let mut statement = db.prepare("SELECT id, title, COALESCE(author, ''), thumbnail FROM podcasts WHERE bookmarked_at IS NOT NULL ORDER BY bookmarked_at DESC, saved_at DESC").map_err(|error| format!("saved podcast query failed: {error}"))?;
    let rows = statement.query_map([], |row| Ok(YtItem { id: row.get(0)?, kind: "podcast".to_owned(), title: row.get(1)?, subtitle: row.get(2)?, thumbnail: row.get(3)?, artists: Vec::new(), browse_id: row.get(0)?, playlist_id: row.get(0)?, video_id: None, set_video_id: None, play_playlist_id: row.get(0)?, play_video_id: None, params: None, explicit: false, music_video_type: None, history_remove_token: None, album_id: None, album_title: None })).map_err(|error| format!("saved podcast rows failed: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| format!("saved podcast row decode failed: {error}"))
}

#[tauri::command]
async fn ytm_podcast_channels(state: tauri::State<'_, RuntimeState>) -> Result<Vec<YtItem>, String> {
    let local = {
        let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
        saved_podcast_rows(&db)?
    };
    let Some(session) = auth_session(&state)? else { return Ok(local); };
    let remote = fetch_all_library_items(&session, "FEmusic_library_non_music_audio_channels_list", 0).await.unwrap_or_default().into_iter().filter(|item| item.kind == "podcast" || item.kind == "artist").collect::<Vec<_>>();
    if remote.is_empty() { return Ok(local); }
    let mut result = remote;
    for item in local { if !result.iter().any(|existing| existing.id == item.id) { result.push(item); } }
    Ok(result)
}

#[tauri::command]
fn library_saved_podcasts(state: tauri::State<'_, RuntimeState>) -> Result<Vec<YtItem>, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    saved_podcast_rows(&db)
}

async fn fetch_all_library_songs(session: &AuthSession, browse_id: &str, tab_index: Option<i32>) -> Result<Vec<YtItem>, String> {
    let tab_index = tab_index.unwrap_or(0).max(0) as usize;
    let mut response = post("browse", json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)), "browseId": browse_id }), Some(session)).await?;
    let mut songs = Vec::new();
    let mut seen_ids = HashSet::new();
    let mut seen_continuations = HashSet::new();
    loop {
        let (page_songs, continuation) = parse_library_page(&response, tab_index);
        for item in page_songs {
            if seen_ids.insert(item.id.clone()) { songs.push(item); }
        }
        let Some(token) = continuation else { break; };
        if !seen_continuations.insert(token.clone()) { break; }
        response = post("browse", json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)), "continuation": token }), Some(session)).await?;
    }
    Ok(songs)
}

async fn fetch_all_playlist_songs(session: &AuthSession, playlist_id: &str) -> Result<Vec<YtItem>, String> {
    let browse_id = format!("VL{playlist_id}");
    let mut response = post("browse", json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)), "browseId": browse_id }), Some(session)).await?;
    let mut songs = Vec::new();
    let mut seen_ids = HashSet::new();
    let mut seen_continuations = HashSet::new();
    let first_page = parse_playlist(&response, playlist_id);
    for item in first_page.songs { if seen_ids.insert(item.id.clone()) { songs.push(item); } }
    let mut continuation = first_page.continuation;
    while let Some(token) = continuation {
        if !seen_continuations.insert(token.clone()) { break; }
        response = post("browse", json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)), "continuation": token }), Some(session)).await?;
        let page = parse_playlist_continuation(&response);
        for item in page.songs { if seen_ids.insert(item.id.clone()) { songs.push(item); } }
        continuation = page.continuation;
    }
    Ok(songs)
}

fn upsert_catalog_mappings(db: &Connection, item: &YtItem, mode: &str, timestamp: i64) -> Result<(), String> {
    if let (Some(album_id), Some(album_title)) = (item.album_id.as_deref(), item.album_title.as_deref()) {
        db.execute(
            "INSERT INTO albums (id, playlist_id, title, thumbnail, explicit, liked, in_library, uploaded, saved_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET playlist_id=excluded.playlist_id, title=excluded.title, thumbnail=excluded.thumbnail, explicit=excluded.explicit,
             liked=CASE WHEN ?6 = 1 THEN 1 ELSE albums.liked END, in_library=CASE WHEN ?7 = 1 THEN 1 ELSE albums.in_library END,
             uploaded=CASE WHEN ?8 = 1 THEN 1 ELSE albums.uploaded END, saved_at=excluded.saved_at",
            params![album_id, item.playlist_id, album_title, item.thumbnail, if item.explicit { 1 } else { 0 }, if mode == "liked" { 1 } else { 0 }, if mode == "library" { 1 } else { 0 }, if mode == "uploaded" { 1 } else { 0 }, timestamp],
        ).map_err(|error| format!("album sync write failed: {error}"))?;
        db.execute("INSERT OR IGNORE INTO song_albums (song_id, album_id) VALUES (?1, ?2)", params![item.id, album_id]).map_err(|error| format!("song album sync mapping failed: {error}"))?;
    }
    for (position, artist) in item.artists.iter().enumerate() {
        let Some(artist_id) = artist.id.as_deref().filter(|value| !value.is_empty()) else { continue; };
        db.execute("INSERT INTO artists (id, name, saved_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET name=excluded.name, saved_at=excluded.saved_at", params![artist_id, artist.name, timestamp]).map_err(|error| format!("artist sync write failed: {error}"))?;
        db.execute("INSERT OR IGNORE INTO song_artists (song_id, artist_id, position) VALUES (?1, ?2, ?3)", params![item.id, artist_id, position as i64]).map_err(|error| format!("song artist sync mapping failed: {error}"))?;
    }
    Ok(())
}

fn upsert_synced_song(db: &Connection, item: &YtItem, mode: &str, timestamp: i64) -> Result<(), String> {
    let is_video = item.music_video_type.as_deref().is_some_and(|value| value != "MUSIC_VIDEO_TYPE_ATV");
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
struct YouTubeSyncResult { liked_songs: usize, library_songs: usize, uploaded_songs: usize, playlists: usize }

#[tauri::command]
async fn sync_youtube_library(mode: String, state: tauri::State<'_, RuntimeState>) -> Result<YouTubeSyncResult, String> {
    let mode = mode.trim().to_lowercase();
    if !matches!(mode.as_str(), "liked" | "library" | "uploaded" | "playlists") { return Err("YouTube library sync mode must be liked, library, uploaded, or playlists".to_owned()); }
    let session = auth_session(&state)?.ok_or_else(|| "Google/YouTube Music account session is not connected".to_owned())?;
    let (liked_songs, mut library_songs, mut uploaded_songs, playlists) = if mode == "liked" {
        (fetch_all_playlist_songs(&session, "LM").await?, Vec::new(), Vec::new(), Vec::new())
    } else if mode == "library" {
        (Vec::new(), fetch_all_library_songs(&session, "FEmusic_liked_videos", None).await?, Vec::new(), Vec::new())
    } else if mode == "uploaded" {
        (Vec::new(), Vec::new(), fetch_all_library_songs(&session, "FEmusic_library_privately_owned_tracks", Some(1)).await?, Vec::new())
    } else {
        (Vec::new(), Vec::new(), Vec::new(), fetch_all_library_playlists(&session).await?)
    };
    if mode == "library" || mode == "uploaded" { if mode == "library" { library_songs.reverse(); } else { uploaded_songs.reverse(); } }
    let timestamp = now_seconds();
    let mut db = state.db.lock().map_err(|_| "database state poisoned")?;
    let tx = db.transaction().map_err(|error| format!("YouTube library sync transaction failed: {error}"))?;
    if mode == "liked" {
        tx.execute("UPDATE songs SET liked = 0, liked_date = NULL WHERE liked = 1", []).map_err(|error| format!("liked state reset failed: {error}"))?;
        tx.execute("UPDATE albums SET liked = 0 WHERE liked = 1", []).map_err(|error| format!("liked album state reset failed: {error}"))?;
        for (index, item) in liked_songs.iter().enumerate() { upsert_synced_song(&tx, item, "liked", timestamp - index as i64)?; }
    } else if mode == "library" {
        tx.execute("UPDATE songs SET in_library = 0 WHERE in_library = 1", []).map_err(|error| format!("library state reset failed: {error}"))?;
        tx.execute("UPDATE albums SET in_library = 0 WHERE in_library = 1", []).map_err(|error| format!("library album state reset failed: {error}"))?;
        for (index, item) in library_songs.iter().enumerate() { upsert_synced_song(&tx, item, "library", timestamp - index as i64)?; }
    } else if mode == "uploaded" {
        tx.execute("UPDATE songs SET uploaded = 0 WHERE uploaded = 1", []).map_err(|error| format!("uploaded state reset failed: {error}"))?;
        tx.execute("UPDATE albums SET uploaded = 0 WHERE uploaded = 1", []).map_err(|error| format!("uploaded album state reset failed: {error}"))?;
        for (index, item) in uploaded_songs.iter().enumerate() { upsert_synced_song(&tx, item, "uploaded", timestamp - index as i64)?; }
    } else {
        tx.execute("DELETE FROM playlists WHERE source = 'youtube'", []).map_err(|error| format!("YouTube playlist reset failed: {error}"))?;
        for (index, item) in playlists.iter().enumerate() {
            let id = item.browse_id.clone().unwrap_or_else(|| item.id.clone());
            tx.execute("INSERT INTO playlists (id, title, subtitle, thumbnail, kind, saved_at, source) VALUES (?1, ?2, ?3, ?4, 'playlist', ?5, 'youtube') ON CONFLICT(id) DO UPDATE SET title=excluded.title, subtitle=excluded.subtitle, thumbnail=excluded.thumbnail, saved_at=excluded.saved_at, source='youtube'", params![id, item.title, item.subtitle, item.thumbnail, timestamp - index as i64]).map_err(|error| format!("YouTube playlist sync write failed: {error}"))?;
        }
    }
    tx.commit().map_err(|error| format!("YouTube library sync commit failed: {error}"))?;
    Ok(YouTubeSyncResult { liked_songs: liked_songs.len(), library_songs: library_songs.len(), uploaded_songs: uploaded_songs.len(), playlists: playlists.len() })
}

#[tauri::command]
async fn ytm_history(state: tauri::State<'_, RuntimeState>) -> Result<RemoteHistoryPage, String> {
    let visitor_data = visitor(&state).await?;
    let session = auth_session(&state)?.ok_or_else(|| "Google/YouTube Music account session is not connected".to_owned())?;
    let response = post(
        "browse",
        json!({
            "context": context(&visitor_data, true, Some(&session.data_sync_id)),
            "browseId": "FEmusic_history"
        }),
        Some(&session),
    ).await?;
    Ok(parse_remote_history(&response))
}

const HOME_CACHE_SETTING: &str = "cached_home_page";

fn cached_home(state: &tauri::State<'_, RuntimeState>) -> Option<HomePage> {
    let db = state.db.lock().ok()?;
    let value = db
        .query_row("SELECT value FROM settings WHERE key = ?1", params![HOME_CACHE_SETTING], |row| row.get::<_, String>(0))
        .ok()?;
    serde_json::from_str::<HomePage>(&value).ok()
}

fn save_home_cache(state: &tauri::State<'_, RuntimeState>, page: &HomePage) {
    let Ok(value) = serde_json::to_string(page) else { return; };
    let Ok(db) = state.db.lock() else { return; };
    let _ = db.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![HOME_CACHE_SETTING, value],
    );
}

#[tauri::command]
async fn ytm_home(state: tauri::State<'_, RuntimeState>) -> Result<HomePage, String> {
    let visitor_data = visitor(&state).await?;
    let request_session = browse_session(&state, auth_session(&state)?)?;
    let data_sync_id = request_session.as_ref().map(|value| value.data_sync_id.as_str());
    let response = match post("browse", json!({ "context": context(&visitor_data, request_session.is_some(), data_sync_id), "browseId": "FEmusic_home" }), request_session.as_ref()).await {
        Ok(response) => response,
        Err(error) => return cached_home(&state).map_or(Err(error), |mut page| { page.continuation = None; Ok(page) }),
    };
    let page = parse_home(&response);
    if !page.sections.is_empty() { save_home_cache(&state, &page); }
    Ok(page)
}

#[tauri::command]
async fn ytm_home_continuation(continuation: String, state: tauri::State<'_, RuntimeState>) -> Result<HomePage, String> {
    let token = continuation.trim();
    if token.is_empty() { return Err("home continuation is empty".to_owned()); }
    let visitor_data = visitor(&state).await?;
    let request_session = browse_session(&state, auth_session(&state)?)?;
    let data_sync_id = request_session.as_ref().map(|value| value.data_sync_id.as_str());
    let response = post("browse", json!({ "context": context(&visitor_data, request_session.is_some(), data_sync_id), "continuation": token }), request_session.as_ref()).await?;
    Ok(parse_home_continuation(&response))
}

#[tauri::command]
async fn ytm_search(query: String, state: tauri::State<'_, RuntimeState>) -> Result<SearchPage, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() { return Ok(SearchPage { items: Vec::new(), continuation: None }); }
    let visitor_data = visitor(&state).await?;
    let request_session = browse_session(&state, auth_session(&state)?)?;
    let data_sync_id = request_session.as_ref().map(|value| value.data_sync_id.as_str());
    let response = post("search", json!({ "context": context(&visitor_data, request_session.is_some(), data_sync_id), "query": trimmed }), request_session.as_ref()).await?;
    Ok(parse_search(&response))
}

#[tauri::command]
async fn ytm_search_continuation(continuation: String, state: tauri::State<'_, RuntimeState>) -> Result<SearchPage, String> {
    let token = continuation.trim();
    if token.is_empty() { return Err("search continuation is empty".to_owned()); }
    let visitor_data = visitor(&state).await?;
    let request_session = browse_session(&state, auth_session(&state)?)?;
    let data_sync_id = request_session.as_ref().map(|value| value.data_sync_id.as_str());
    let response = post_with_query("search", json!({ "context": context(&visitor_data, request_session.is_some(), data_sync_id) }), request_session.as_ref(), &[("continuation", token), ("ctoken", token)]).await?;
    Ok(parse_search_continuation(&response))
}

#[tauri::command]
async fn ytm_detail_continuation(kind: String, continuation: String, state: tauri::State<'_, RuntimeState>) -> Result<DetailPage, String> {
    let normalized_kind = kind.trim().to_lowercase();
    if !matches!(normalized_kind.as_str(), "album" | "artist" | "podcast") { return Err(format!("unsupported detail kind: {normalized_kind}")); }
    let token = continuation.trim();
    if token.is_empty() { return Err("detail continuation is empty".to_owned()); }
    let visitor_data = visitor(&state).await?;
    let request_session = browse_session(&state, auth_session(&state)?)?;
    let data_sync_id = request_session.as_ref().map(|value| value.data_sync_id.as_str());
    let response = post("browse", json!({ "context": context(&visitor_data, request_session.is_some(), data_sync_id), "continuation": token }), request_session.as_ref()).await?;
    Ok(parse_detail(&response, &normalized_kind, None))
}

#[tauri::command]
fn ytm_podcast_cache_detail_page(browse_id: String, page: DetailPage, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let id = browse_id.trim();
    if id.is_empty() { return Err("podcast browse id is empty".to_owned()); }
    if page.kind != "podcast" { return Err("podcast detail cache received a non-podcast page".to_owned()); }
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    let cached = db.query_row("SELECT detail_json FROM podcasts WHERE id = ?1 AND detail_json IS NOT NULL", params![id], |row| row.get::<_, String>(0)).optional().map_err(|error| format!("podcast detail cache read failed: {error}"))?;
    let Some(serialized) = cached else { return Ok(()); };
    let mut merged: DetailPage = serde_json::from_str(&serialized).map_err(|error| format!("cached podcast detail decode failed: {error}"))?;
    let mut seen = merged.items.iter().map(|item| item.id.clone()).collect::<std::collections::HashSet<_>>();
    for item in page.items {
        if seen.insert(item.id.clone()) { merged.items.push(item); }
    }
    if !page.title.is_empty() { merged.title = page.title; }
    if !page.subtitle.is_empty() { merged.subtitle = page.subtitle; }
    if page.thumbnail.is_some() { merged.thumbnail = page.thumbnail; }
    merged.continuation = page.continuation;
    merged.browse_id = Some(id.to_owned());
    let updated = serde_json::to_string(&merged).map_err(|error| format!("podcast detail cache encode failed: {error}"))?;
    db.execute("UPDATE podcasts SET detail_json = ?1 WHERE id = ?2", params![updated, id]).map_err(|error| format!("podcast detail cache write failed: {error}"))?;
    Ok(())
}

#[tauri::command]
async fn ytm_playlist(playlist_id: String, state: tauri::State<'_, RuntimeState>) -> Result<PlaylistPage, String> {
    let id = playlist_id.trim_start_matches("VL").to_owned();
    if id.is_empty() { return Err("playlist id is empty".to_owned()); }
    let visitor_data = visitor(&state).await?;
    let request_session = browse_session(&state, auth_session(&state)?)?;
    let data_sync_id = request_session.as_ref().map(|value| value.data_sync_id.as_str());
    let response = post("browse", json!({ "context": context(&visitor_data, request_session.is_some(), data_sync_id), "browseId": format!("VL{id}") }), request_session.as_ref()).await?;
    Ok(parse_playlist(&response, &id))
}

fn parse_playlist_continuation(response: &Value) -> PlaylistContinuationPage {
    let mut values: Vec<&Value> = Vec::new();
    if let Some(contents) = response.get("continuationContents").and_then(|v| v.get("sectionListContinuation")).and_then(|v| v.get("contents")).and_then(Value::as_array) {
        for content in contents {
            if let Some(items) = content.get("musicPlaylistShelfRenderer").and_then(|v| v.get("contents")).and_then(Value::as_array) { values.extend(items); }
        }
    }
    if let Some(items) = response.get("continuationContents").and_then(|v| v.get("musicPlaylistShelfContinuation")).and_then(|v| v.get("contents")).and_then(Value::as_array) { values.extend(items); }
    if let Some(items) = response.get("onResponseReceivedActions").and_then(Value::as_array).and_then(|v| v.first()).and_then(|v| v.get("appendContinuationItemsAction")).and_then(|v| v.get("continuationItems")).and_then(Value::as_array) { values.extend(items); }
    let songs = values.into_iter().filter_map(|content| content.get("musicResponsiveListItemRenderer")).filter_map(parse_responsive_song).collect::<Vec<_>>();
    let continuation = response.get("continuationContents").and_then(|v| v.get("sectionListContinuation")).and_then(|v| v.get("continuations")).and_then(Value::as_array).and_then(|v| v.first()).and_then(|v| v.get("nextContinuationData")).and_then(|v| v.get("continuation")).and_then(Value::as_str).map(str::to_owned)
        .or_else(|| response.get("continuationContents").and_then(|v| v.get("musicPlaylistShelfContinuation")).and_then(|v| v.get("continuations")).and_then(Value::as_array).and_then(|v| v.first()).and_then(|v| v.get("nextContinuationData")).and_then(|v| v.get("continuation")).and_then(Value::as_str).map(str::to_owned))
        .or_else(|| response.get("continuationContents").and_then(|v| v.get("musicShelfContinuation")).and_then(|v| v.get("continuations")).and_then(Value::as_array).and_then(|v| v.first()).and_then(|v| v.get("nextContinuationData")).and_then(|v| v.get("continuation")).and_then(Value::as_str).map(str::to_owned));
    PlaylistContinuationPage { songs, continuation }
}

#[tauri::command]
async fn ytm_playlist_continuation(continuation: String, state: tauri::State<'_, RuntimeState>) -> Result<PlaylistContinuationPage, String> {
    let token = continuation.trim();
    if token.is_empty() { return Err("playlist continuation is empty".to_owned()); }
    let visitor_data = visitor(&state).await?;
    let request_session = browse_session(&state, auth_session(&state)?)?;
    let data_sync_id = request_session.as_ref().map(|value| value.data_sync_id.as_str());
    let response = post("browse", json!({ "context": context(&visitor_data, request_session.is_some(), data_sync_id), "continuation": token }), request_session.as_ref()).await?;
    Ok(parse_playlist_continuation(&response))
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
struct BetterLyricsResponse { ttml: Option<String> }

#[derive(Debug, Deserialize)]
struct LyricsPlusLine { time: i64, text: String }

#[derive(Debug, Deserialize)]
struct LyricsPlusResponse { lyrics: Option<Vec<LyricsPlusLine>> }

fn filter_lyrics_credit_lines(value: &str) -> String {
    let timestamp = Regex::new(r"^\[\d\d:\d\d\.\d{2,3}\]").ok();
    let agent = Regex::new(r"^\{agent:[^}]+\}").ok();
    let background = Regex::new(r"^\{bg\}").ok();
    let background_bracket = Regex::new(r"^\[bg:.*\]").ok();
    let version = Regex::new(r"^v\d+:").ok();
    value.lines().filter(|line| {
        let mut text = line.trim().to_owned();
        loop {
            let before = text.clone();
            for regex in [&timestamp, &agent, &background, &background_bracket, &version] { if let Some(regex) = regex { text = regex.replace(&text, "").trim().to_owned(); } }
            if text == before { break; }
        }
        let lower = text.to_lowercase();
        !(lower.starts_with("synced by") || lower.starts_with("lyrics by") || lower.starts_with("music by") || lower.starts_with("arranged by") || (lower.starts_with('[') && lower.ends_with(']') && lower.len() < 40 && lower.contains("synced by")))
    }).collect::<Vec<_>>().join("\n")
}

fn parse_lyric_lines(value: &str) -> Vec<LyricLine> {
    let mut lines = Vec::new();
    for raw in value.lines() {
        let mut rest = raw;
        let mut timestamps = Vec::new();
        while let Some(end) = rest.find(']') {
            if !rest.starts_with('[') { break; }
            let stamp = &rest[1..end];
            let mut parts = stamp.split(':');
            let minutes = parts.next().and_then(|v| v.parse::<i64>().ok());
            let seconds = parts.next().and_then(|v| v.replace(',', ".").parse::<f64>().ok());
            if let (Some(minutes), Some(seconds)) = (minutes, seconds) { timestamps.push((minutes as f64 * 60_000.0 + seconds * 1_000.0) as i64); }
            rest = &rest[end + 1..];
        }
        let text = rest.trim().to_owned();
        if text.is_empty() { continue; }
        for time_ms in timestamps { lines.push(LyricLine { time_ms, text: text.clone() }); }
    }
    lines.sort_by_key(|line| line.time_ms);
    lines
}

fn parse_provider_time(value: &str) -> Option<i64> {
    let value = value.trim();
    if let Some(seconds) = value.strip_suffix("ms") { return seconds.parse::<f64>().ok().map(|v| v.round() as i64); }
    if let Some(seconds) = value.strip_suffix('s') { return seconds.parse::<f64>().ok().map(|v| (v * 1000.0).round() as i64); }
    let mut parts = value.split(':').collect::<Vec<_>>();
    if parts.len() == 3 { let hours = parts.remove(0).parse::<f64>().ok()?; let minutes = parts.remove(0).parse::<f64>().ok()?; let seconds = parts.remove(0).parse::<f64>().ok()?; return Some(((hours * 3600.0 + minutes * 60.0 + seconds) * 1000.0).round() as i64); }
    if parts.len() == 2 { let minutes = parts[0].parse::<f64>().ok()?; let seconds = parts[1].parse::<f64>().ok()?; return Some(((minutes * 60.0 + seconds) * 1000.0).round() as i64); }
    None
}

fn decode_basic_entities(value: &str) -> String { value.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'") }

fn betterlyrics_to_lrc(ttml: &str) -> Option<String> {
    let paragraph = Regex::new(r#"(?is)<p\b[^>]*\bbegin=['\"]([^'\"]+)['\"][^>]*>(.*?)</p>"#).ok()?;
    let tags = Regex::new(r"(?is)<[^>]+>").ok()?;
    let mut lines = Vec::new();
    for capture in paragraph.captures_iter(ttml) {
        let time = parse_provider_time(capture.get(1)?.as_str())?;
        let text = decode_basic_entities(tags.replace_all(capture.get(2)?.as_str(), "").trim()).trim().to_owned();
        if !text.is_empty() { lines.push((time, text)); }
    }
    if lines.is_empty() { return None; }
    lines.sort_by_key(|line| line.0);
    Some(lines.into_iter().map(|(time, text)| format!("[{:02}:{:05.2}]{}", time / 60_000, (time % 60_000) as f64 / 1000.0, text)).collect::<Vec<_>>().join("\n"))
}

async fn provider_json<T: DeserializeOwned>(request: reqwest::RequestBuilder) -> Option<T> {
    let response = timeout(Duration::from_secs(15), request.send()).await.ok()?.ok()?.error_for_status().ok()?;
    response.json::<T>().await.ok()
}

fn paxsenix_clean_title(value: &str) -> String {
    let patterns = [r#"\s*\(.*?(official|video|audio|lyrics|lyric|visualizer|hd|hq|4k|remaster|remix|live|acoustic|version|edit|extended|radio|clean|explicit).*?\)"#, r#"\s*\[.*?(official|video|audio|lyrics|lyric|visualizer|hd|hq|4k|remaster|remix|live|acoustic|version|edit|extended|radio|clean|explicit).*?\]"#, r#"\s*【.*?】"#, r"\s*\|.*$", r#"\s*-\s*(official|video|audio|lyrics|lyric|visualizer).*$"#, r#"\s*\(feat\..*?\)"#, r#"\s*\(ft\..*?\)"#, r"\s*feat\..*$", r"\s*ft\..*$", r#"\s*\([^)]*\d{4}[^)]*\)"#];
    patterns.iter().fold(value.trim().to_owned(), |current, pattern| Regex::new(&format!("(?i){pattern}")).map(|regex| regex.replace(&current, "").into_owned()).unwrap_or(current)).trim().to_owned()
}

fn paxsenix_clean_artist(value: &str) -> String { clean_lyrics_artist(value) }

fn paxsenix_content_to_lrc(content: &Value) -> Option<String> {
    let entries = content.as_array()?;
    let lines = entries.iter().filter_map(|entry| {
        let timestamp = entry.get("timestamp").and_then(Value::as_i64)?;
        let words = entry.get("text").and_then(Value::as_array).map(|values| values.iter().filter_map(|word| word.get("text").and_then(Value::as_str)).collect::<Vec<_>>().join(" ")).unwrap_or_default();
        let text = if words.trim().is_empty() { entry.get("line").and_then(Value::as_str).unwrap_or("").to_owned() } else { words };
        (!text.trim().is_empty()).then(|| format!("[{:02}:{:05.2}]{}", timestamp / 60_000, (timestamp % 60_000) as f64 / 1000.0, text.trim()))
    }).collect::<Vec<_>>();
    (!lines.is_empty()).then(|| lines.join("\n"))
}

async fn paxsenix_fetch(title: &str, artist: &str, duration: i32, album: Option<&str>) -> Option<String> {
    let cleaned_title = paxsenix_clean_title(title);
    let cleaned_artist = paxsenix_clean_artist(artist);
    let mut queries = vec![format!("{cleaned_title} {cleaned_artist}"), cleaned_title.clone()];
    if let Some(album) = album.filter(|value| !value.trim().is_empty()) { queries.push(format!("{cleaned_title} {cleaned_artist} {album}")); }
    let duration_ms = if duration > 0 { i64::from(duration) * 1000 } else { -1 };
    let mut scored: Vec<(Value, f64)> = Vec::new();
    for query in queries {
        if !scored.is_empty() { break; }
        let Some(response) = provider_json::<Value>(http().get("https://lyrics.paxsenix.org/apple-music/search").query(&[("q", query.as_str())]).header("User-Agent", "Meld/0.1")).await else { continue; };
        let Some(results) = response.as_array() else { continue; };
        scored = results.iter().filter_map(|item| {
            let result_title = item.get("trackName").or_else(|| item.get("songName")).and_then(Value::as_str).unwrap_or("");
            let result_artist = item.get("artistName").and_then(Value::as_str).unwrap_or("");
            let mut score = (lyrics_similarity(&paxsenix_clean_title(title), &paxsenix_clean_title(result_title)) * 80.0) + (lyrics_similarity(&cleaned_artist, &paxsenix_clean_artist(result_artist)) * 50.0);
            if let Some(result_duration) = item.get("duration").and_then(Value::as_i64) {
                if duration_ms > 0 { let diff = (result_duration - duration_ms).abs(); score += if diff <= 2_000 { 100.0 } else if diff <= 5_000 { 50.0 } else if diff <= 10_000 { 10.0 } else { -50.0 }; }
            }
            (score > 0.0).then(|| (item.clone(), score))
        }).collect();
        scored.sort_by(|left, right| right.1.partial_cmp(&left.1).unwrap_or(std::cmp::Ordering::Equal));
        scored.truncate(10);
    }
    for (item, _) in scored.iter().take(3) {
        let id = item.get("id").and_then(Value::as_str)?;
        let Some(response) = provider_json::<Value>(http().get("https://lyrics.paxsenix.org/apple-music/lyrics").query(&[("id", id)]).header("User-Agent", "Meld/0.1")).await else { continue; };
        if let Some(ttml) = response.get("ttmlContent").and_then(Value::as_str).filter(|value| !value.trim().is_empty()) { if let Some(lrc) = betterlyrics_to_lrc(ttml) { if !lrc.is_empty() { return Some(lrc); } } }
        for key in ["elrcMultiPerson", "elrc", "plain"] { if let Some(text) = response.get(key).and_then(Value::as_str).filter(|value| !value.trim().is_empty()) { return Some(text.to_owned()); } }
        if let Some(lrc) = response.get("content").and_then(paxsenix_content_to_lrc) { return Some(lrc); }
    }
    None
}

async fn betterlyrics_fetch(title: &str, artist: &str, duration: i32, album: Option<&str>) -> Option<String> {
    let mut request = http().get("https://lyrics-api.boidu.dev/getLyrics").query(&[("s", title), ("a", artist)]);
    if duration > 0 { let duration_value = duration.to_string(); request = request.query(&[("d", duration_value.as_str())]); }
    if let Some(album) = album.filter(|value| !value.is_empty()) { request = request.query(&[("al", album)]); }
    let response: BetterLyricsResponse = provider_json(request).await?;
    betterlyrics_to_lrc(response.ttml?.as_str())
}

async fn youtube_subtitle_fetch(video_id: &str) -> Option<String> {
    let params = BASE64.encode(format!("\n{}{}", 11u8 as char, video_id));
    let body = json!({ "context": { "client": { "clientName": "WEB", "clientVersion": "2.20260213.00.00", "clientScreen": "WATCH", "hl": "en", "gl": "US" } }, "params": params });
    let response: Value = provider_json(http().post(format!("{API_BASE}get_transcript?key={YOUTUBE_API_KEY}")).json(&body)).await?;
    let groups = response.pointer("/actions/0/updateEngagementPanelAction/content/transcriptRenderer/body/transcriptBodyRenderer/cueGroups").and_then(Value::as_array)?;
    let mut lines = Vec::new();
    for group in groups {
        let cue = group.get("transcriptCueGroupRenderer").and_then(|value| value.get("cues")).and_then(Value::as_array).and_then(|values| values.first()).and_then(|value| value.get("transcriptCueRenderer"))?;
        let time = cue.get("startOffsetMs").and_then(Value::as_i64)?;
        let text = cue.get("cue").and_then(|value| value.get("simpleText")).and_then(Value::as_str)?.trim().trim_matches('♪').trim().to_owned();
        if !text.is_empty() { lines.push(format!("[{:02}:{:02}.{:03}]{}", time / 60_000, (time / 1_000) % 60, time % 1_000, text)); }
    }
    (!lines.is_empty()).then(|| lines.join("\n"))
}

async fn youtube_plain_lyrics_fetch(video_id: &str, state: &tauri::State<'_, RuntimeState>) -> Option<String> {
    let visitor_data = visitor(state).await.ok()?;
    let session = auth_session(state).ok().flatten();
    let data_sync_id = session.as_ref().map(|value| value.data_sync_id.as_str());
    let response = post("next", json!({ "context": context(&visitor_data, session.is_some(), data_sync_id), "videoId": video_id }), session.as_ref()).await.ok()?;
    let endpoint = response.pointer("/contents/singleColumnMusicWatchNextResultsRenderer/tabbedRenderer/watchNextTabbedResultsRenderer/tabs/1/tabRenderer/endpoint/browseEndpoint")?;
    let browse_id = endpoint.get("browseId").and_then(Value::as_str)?.trim();
    if browse_id.is_empty() { return None; }
    let params = endpoint.get("params").and_then(Value::as_str);
    let mut body = json!({ "context": context(&visitor_data, session.is_some(), data_sync_id), "browseId": browse_id });
    if let Some(params) = params { body["params"] = Value::String(params.to_owned()); }
    let browse = post("browse", body, session.as_ref()).await.ok()?;
    let sections = browse.pointer("/contents/sectionListRenderer/contents")?.as_array()?;
    for section in sections {
        let Some(description) = section.get("musicDescriptionShelfRenderer").and_then(|value| value.get("description")) else { continue; };
        let Some(runs) = description.get("runs").and_then(Value::as_array) else { continue; };
        let text = runs.iter().filter_map(|run| run.get("text").and_then(Value::as_str)).collect::<String>();
        if !text.trim().is_empty() { return Some(text); }
    }
    None
}

fn kugou_keyword(title: &str, artist: &str, album: Option<&str>) -> String {
    let title = Regex::new(r#"[（(].*?[）)]|「.*?」|『.*?』|<.*?>|《.*?》|〈.*?〉|＜.*?＞"#).map(|regex| regex.replace_all(title, "").into_owned()).unwrap_or_else(|_| title.to_owned());
    let artist = Regex::new(r#"[（(].*?[）)]"#).map(|regex| regex.replace_all(artist, "").into_owned()).unwrap_or_else(|_| artist.to_owned()).replace(", ", "、").replace(" & ", "、").replace('.', "");
    let mut keyword = format!("{} - {}", title.trim(), artist.trim());
    if let Some(album) = album.filter(|value| !value.trim().is_empty()) { keyword.push(' '); keyword.push_str(album.trim()); }
    keyword
}

fn kugou_normalize_lrc(value: &str) -> String {
    let accepted = Regex::new(r"^\[\d\d:\d\d\.\d{2,3}\].*").ok();
    let banned = Regex::new(r".+].+[:：].+").ok();
    let lines = value.lines().filter(|line| accepted.as_ref().is_some_and(|regex| regex.is_match(line))).collect::<Vec<_>>();
    if lines.is_empty() { return String::new(); }
    let mut head = 0usize;
    for index in (0..lines.len().min(30)).rev() { if banned.as_ref().is_some_and(|regex| regex.is_match(lines[index])) { head = index + 1; break; } }
    let filtered = &lines[head..];
    let mut tail = 0usize;
    for index in (0..filtered.len().min(30)).rev() { if banned.as_ref().is_some_and(|regex| regex.is_match(filtered[filtered.len() - 1 - index])) { tail = index + 1; break; } }
    filtered[..filtered.len().saturating_sub(tail)].join("\n")
}

async fn kugou_fetch(title: &str, artist: &str, duration: i32, album: Option<&str>) -> Option<String> {
    let keyword = kugou_keyword(title, artist, album);
    let song_response: Value = provider_json(http().get("https://mobileservice.kugou.com/api/v3/search/song").query(&[("version", "9108"), ("plat", "0"), ("pagesize", "8"), ("showtype", "0"), ("keyword", keyword.as_str())])).await?;
    let songs = song_response.pointer("/data/info").and_then(Value::as_array)?;
    for song in songs {
        let song_duration = song.get("duration").and_then(Value::as_i64).unwrap_or(-1);
        let hash = song.get("hash").and_then(Value::as_str).unwrap_or("");
        if hash.is_empty() || (duration >= 0 && (song_duration - i64::from(duration)).abs() > 8) { continue; }
        let response: Value = provider_json(http().get("https://lyrics.kugou.com/search").query(&[("ver", "1"), ("man", "yes"), ("client", "pc"), ("hash", hash)])).await?;
        let candidate = response.get("candidates").and_then(Value::as_array).and_then(|values| values.first());
        let Some(candidate) = candidate else { continue; };
        let id = candidate.get("id").and_then(Value::as_i64).unwrap_or(0);
        let access_key = candidate.get("accesskey").and_then(Value::as_str).unwrap_or("");
        if id == 0 || access_key.is_empty() { continue; }
        let id_value = id.to_string();
        let download: Value = provider_json(http().get("https://lyrics.kugou.com/download").query(&[("fmt", "lrc"), ("charset", "utf8"), ("client", "pc"), ("ver", "1"), ("id", id_value.as_str()), ("accesskey", access_key)])).await?;
        let content = download.get("content").and_then(Value::as_str)?;
        let decoded = BASE64.decode(content).ok()?;
        let normalized = kugou_normalize_lrc(&String::from_utf8_lossy(&decoded));
        if !normalized.is_empty() { return Some(normalized); }
    }
    let mut request = http().get("https://lyrics.kugou.com/search").query(&[("ver", "1"), ("man", "yes"), ("client", "pc"), ("keyword", keyword.as_str())]);
    if duration >= 0 { let duration_ms = duration.saturating_mul(1000).to_string(); request = request.query(&[("duration", duration_ms.as_str())]); }
    let response: Value = provider_json(request).await?;
    let candidate = response.get("candidates").and_then(Value::as_array).and_then(|values| values.first())?;
    let id = candidate.get("id").and_then(Value::as_i64)?;
    let access_key = candidate.get("accesskey").and_then(Value::as_str)?;
    let id_value = id.to_string();
    let download: Value = provider_json(http().get("https://lyrics.kugou.com/download").query(&[("fmt", "lrc"), ("charset", "utf8"), ("client", "pc"), ("ver", "1"), ("id", id_value.as_str()), ("accesskey", access_key)])).await?;
    let content = download.get("content").and_then(Value::as_str)?;
    let decoded = BASE64.decode(content).ok()?;
    let normalized = kugou_normalize_lrc(&String::from_utf8_lossy(&decoded));
    (!normalized.is_empty()).then_some(normalized)
}

async fn musixmatch_token() -> Option<String> {
    let cache = MUSIXMATCH_TOKEN.get_or_init(|| Mutex::new(None));
    if let Ok(value) = cache.lock() { if let Some(token) = value.clone() { return Some(token); } }
    let response: Value = provider_json(http().get("https://apic-desktop.musixmatch.com/ws/1.1/token.get").query(&[("app_id", "web-desktop-app-v1.0"), ("format", "json")]).header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36").header("Cookie", "AWSELB=0; AWSELBCORS=0")).await?;
    let message = response.get("message")?;
    if message.pointer("/header/status_code").and_then(Value::as_i64) != Some(200) { return None; }
    let token = message.pointer("/body/user_token").and_then(Value::as_str).filter(|value| !value.is_empty() && *value != "UpgradeOnlyUpgradeOnlyUpgradeOnlyUpgradeOnly")?.to_owned();
    if let Ok(mut value) = cache.lock() { *value = Some(token.clone()); }
    Some(token)
}

async fn musixmatch_fetch(title: &str, artist: &str, duration: i32, album: Option<&str>) -> Option<(String, bool)> {
    let token = musixmatch_token().await?;
    let duration_seconds = if duration > 0 { duration / 1000 } else { -1 };
    let mut request = http().get("https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get").query(&[("format", "json"), ("namespace", "lyrics_richsynced"), ("subtitle_format", "lrc"), ("app_id", "web-desktop-app-v1.0"), ("usertoken", token.as_str()), ("q_track", title), ("q_artist", artist)]).header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36").header("Cookie", "AWSELB=0; AWSELBCORS=0");
    if let Some(album) = album.filter(|value| !value.is_empty()) { request = request.query(&[("q_album", album)]); }
    if duration_seconds > 0 { let seconds = duration_seconds.to_string(); request = request.query(&[("q_duration", seconds.as_str()), ("f_subtitle_length", seconds.as_str())]); }
    let response: Value = provider_json(request).await?;
    let body = response.pointer("/message/body")?;
    if let Some(text) = body.pointer("/macro_calls/track.subtitles.get/message/body/subtitle_list/0/subtitle/subtitle_body").and_then(Value::as_str).filter(|value| !value.trim().is_empty()) { return Some((text.to_owned(), true)); }
    body.pointer("/macro_calls/track.lyrics.get/message/body/lyrics/lyrics_body").and_then(Value::as_str).filter(|value| !value.trim().is_empty()).map(|text| (text.to_owned(), false))
}

async fn lyricsplus_fetch(title: &str, artist: &str, duration: i32, album: Option<&str>) -> Option<String> {
    for base in ["https://lyricsplus.binimum.org", "https://lyricsplus.atomix.one", "https://lyricsplus-seven.vercel.app"] {
        let seconds = if duration > 0 { duration / 1000 } else { -1 };
        let seconds_value = seconds.to_string();
        let mut request = http().get(format!("{base}/v2/lyrics/get")).query(&[("title", title), ("artist", artist), ("duration", seconds_value.as_str()), ("source", "apple,lyricsplus,musixmatch,spotify,musixmatch-word")]);
        if let Some(album) = album.filter(|value| !value.is_empty()) { request = request.query(&[("album", album)]); }
        let Some(response) = provider_json::<LyricsPlusResponse>(request).await else { continue; };
        let Some(lines) = response.lyrics.filter(|lines| !lines.is_empty()) else { continue; };
        let text = lines.into_iter().filter(|line| !line.text.trim().is_empty()).map(|line| format!("[{:02}:{:05.2}]{}", line.time / 60_000, (line.time % 60_000) as f64 / 1000.0, line.text.trim())).collect::<Vec<_>>().join("\n");
        if !text.is_empty() { return Some(text); }
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
        if let Ok(regex) = Regex::new(pattern) { result = regex.replace_all(&result, "").into_owned(); }
    }
    result.trim().to_owned()
}

fn clean_lyrics_artist(value: &str) -> String {
    let separators = [" & ", " and ", ", ", " x ", " X ", " feat. ", " feat ", " ft. ", " ft ", " featuring ", " with "];
    let mut result = value.trim().to_owned();
    for separator in separators {
        if let Some(index) = result.to_lowercase().find(&separator.to_lowercase()) {
            result.truncate(index);
            break;
        }
    }
    result.trim().to_owned()
}

async fn lrclib_search(track_name: Option<&str>, artist_name: Option<&str>, album_name: Option<&str>, query: Option<&str>) -> Vec<LrcLibTrack> {
    let mut params = Vec::<(&str, &str)>::new();
    if let Some(value) = track_name { params.push(("track_name", value)); }
    if let Some(value) = artist_name { params.push(("artist_name", value)); }
    if let Some(value) = album_name { params.push(("album_name", value)); }
    if let Some(value) = query { params.push(("q", value)); }
    let response = match http().get("https://lrclib.net/api/search").query(&params).send().await { Ok(response) => response, Err(_) => return Vec::new() };
    let response = match response.error_for_status() { Ok(response) => response, Err(_) => return Vec::new() };
    response.json::<Vec<LrcLibTrack>>().await.unwrap_or_default()
}

fn duration_delta(track: &LrcLibTrack, duration: i32) -> i32 {
    (track.duration.round() as i32 - duration).abs()
}

fn lyrics_similarity(left: &str, right: &str) -> f64 {
    let left = left.trim().to_lowercase();
    let right = right.trim().to_lowercase();
    if left == right { return 1.0; }
    if left.is_empty() || right.is_empty() { return 0.0; }
    if left.contains(&right) || right.contains(&left) { return 0.8; }
    let left_bytes = left.as_bytes();
    let right_bytes = right.as_bytes();
    let mut previous: Vec<usize> = (0..=right_bytes.len()).collect();
    for (i, left_byte) in left_bytes.iter().enumerate() {
        let mut current = vec![i + 1; right_bytes.len() + 1];
        for (j, right_byte) in right_bytes.iter().enumerate() {
            current[j + 1] = if left_byte == right_byte { previous[j] } else { 1 + previous[j].min(previous[j + 1]).min(current[j]) };
        }
        previous = current;
    }
    1.0 - (previous[right_bytes.len()] as f64 / left_bytes.len().max(right_bytes.len()) as f64)
}

fn lyric_setting_enabled(db: &Connection, key: &str, default: bool) -> Result<bool, String> {
    Ok(setting_value(db, key)?.map(|value| value == "true").unwrap_or(default))
}

fn ordered_lyrics_providers(db: &Connection) -> Result<Vec<String>, String> {
    const REGISTRY_ORDER: [&str; 8] = ["BetterLyrics", "Paxsenix", "LrcLib", "KuGou", "LyricsPlus", "Musixmatch", "YouTubeSubtitle", "YouTube"];
    let stored = setting_value(db, "lyricsProviderOrder")?.unwrap_or_default();
    if stored.trim().is_empty() {
        // LyricsHelper's backward-compatible blank-order path defaults to LRCLIB.
        return Ok(vec!["LrcLib", "BetterLyrics", "Paxsenix", "KuGou", "LyricsPlus", "YouTubeSubtitle", "YouTube"].into_iter().map(str::to_owned).collect());
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
    let make_payload = |text: String, synced: bool, matched_title: String, matched_artist: String| {
        let filtered = filter_lyrics_credit_lines(&text);
        LyricsPayload { lines: if synced { parse_lyric_lines(&filtered) } else { Vec::new() }, provider: provider.to_owned(), text: filtered, synced, matched_title, matched_artist }
    };

    match provider {
        "BetterLyrics" => Ok(betterlyrics_fetch(title, artist, duration, album).await.map(|text| make_payload(text, true, title.to_owned(), artist.to_owned())).filter(|payload| !payload.text.is_empty())),
        "Paxsenix" => Ok(paxsenix_fetch(title, artist, duration, album).await.map(|text| { let synced = !parse_lyric_lines(&text).is_empty(); make_payload(text, synced, title.to_owned(), artist.to_owned()) }).filter(|payload| !payload.text.is_empty())),
        "LrcLib" => {
            let valid = |tracks: Vec<LrcLibTrack>| tracks.into_iter().filter(|track| track.synced_lyrics.is_some() || track.plain_lyrics.is_some()).collect::<Vec<_>>();
            let mut tracks = valid(lrclib_search(Some(title), Some(artist), album, None).await);
            if tracks.is_empty() { tracks = valid(lrclib_search(Some(title), None, None, None).await); }
            if tracks.is_empty() { tracks = valid(lrclib_search(None, None, None, Some(&format!("{artist} {title}"))).await); }
            if tracks.is_empty() { tracks = valid(lrclib_search(None, None, None, Some(title)).await); }
            let best = if duration < 0 {
                tracks.iter().filter(|track| {
                    let score = (lyrics_similarity(title, &track.track_name) + lyrics_similarity(artist, &track.artist_name)) / 2.0;
                    score > 0.6
                }).max_by(|left, right| {
                    let score = |track: &&LrcLibTrack| {
                        let mut value = (lyrics_similarity(title, &track.track_name) + lyrics_similarity(artist, &track.artist_name)) / 2.0;
                        if track.synced_lyrics.is_some() { value += 0.1; }
                        value
                    };
                    score(left).partial_cmp(&score(right)).unwrap_or(std::cmp::Ordering::Equal)
                }).or_else(|| tracks.iter().find(|track| track.synced_lyrics.is_some())).or_else(|| tracks.first())
            } else {
                let synced_match = tracks.iter().filter(|track| track.synced_lyrics.is_some()).min_by_key(|track| duration_delta(track, duration)).filter(|track| duration_delta(track, duration) <= 5);
                synced_match.or_else(|| tracks.iter().min_by_key(|track| duration_delta(track, duration)).filter(|track| duration_delta(track, duration) <= 5))
            };
            Ok(best.and_then(|track| {
                let text = track.synced_lyrics.clone().or_else(|| track.plain_lyrics.clone())?;
                Some(make_payload(text, track.synced_lyrics.is_some(), track.track_name.clone(), track.artist_name.clone()))
            }).filter(|payload| !payload.text.is_empty()))
        }
        "KuGou" => Ok(kugou_fetch(title, artist, duration, album).await.map(|text| make_payload(text, true, title.to_owned(), artist.to_owned())).filter(|payload| !payload.text.is_empty())),
        "LyricsPlus" => Ok(lyricsplus_fetch(title, artist, duration, album).await.map(|text| make_payload(text, true, title.to_owned(), artist.to_owned())).filter(|payload| !payload.text.is_empty())),
        "Musixmatch" => Ok(musixmatch_fetch(title, artist, duration, album).await.map(|(text, synced)| make_payload(text, synced, title.to_owned(), artist.to_owned())).filter(|payload| !payload.text.is_empty())),
        "YouTubeSubtitle" => Ok(match video_id.filter(|value| !value.trim().is_empty()) { Some(id) => youtube_subtitle_fetch(id).await.map(|text| make_payload(text, true, title.to_owned(), artist.to_owned())).filter(|payload| !payload.text.is_empty()), None => None }),
        "YouTube" => Ok(match video_id.filter(|value| !value.trim().is_empty()) { Some(id) => youtube_plain_lyrics_fetch(id, state).await.map(|text| make_payload(text, false, title.to_owned(), artist.to_owned())).filter(|payload| !payload.text.is_empty()), None => None }),
        _ => Ok(None),
    }
}

fn cache_lyrics_variant(db: &Connection, cache_id: &str, payload: &LyricsPayload) -> Result<(), String> {
    db.execute("INSERT INTO lyrics_variants (song_id, provider, text, synced, matched_title, matched_artist, fetched_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT(song_id, provider) DO UPDATE SET text=excluded.text, synced=excluded.synced, matched_title=excluded.matched_title, matched_artist=excluded.matched_artist, fetched_at=excluded.fetched_at", params![cache_id, payload.provider, payload.text, if payload.synced { 1 } else { 0 }, payload.matched_title, payload.matched_artist, now_seconds()]).map_err(|error| format!("lyrics provider cache write failed: {error}"))?;
    Ok(())
}

fn cache_lyrics_payload(db: &Connection, cache_id: &str, payload: &LyricsPayload) -> Result<(), String> {
    db.execute("INSERT INTO lyrics (song_id, provider, text, synced, fetched_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(song_id) DO UPDATE SET provider=excluded.provider, text=excluded.text, synced=excluded.synced, fetched_at=excluded.fetched_at", params![cache_id, payload.provider, payload.text, if payload.synced { 1 } else { 0 }, now_seconds()]).map_err(|error| format!("lyrics cache write failed: {error}"))?;
    cache_lyrics_variant(db, cache_id, payload)
}

fn cached_lyrics_provider(db: &Connection, cache_id: &str, provider: &str) -> Result<Option<LyricsPayload>, String> {
    db.query_row("SELECT text, synced, matched_title, matched_artist FROM lyrics_variants WHERE song_id = ?1 AND provider = ?2", params![cache_id, provider], |row| {
        let text: String = row.get(0)?;
        let synced: i64 = row.get(1)?;
        Ok(LyricsPayload { lines: if synced != 0 { parse_lyric_lines(&text) } else { Vec::new() }, provider: provider.to_owned(), text, synced: synced != 0, matched_title: row.get(2)?, matched_artist: row.get(3)? })
    }).optional().map_err(|error| format!("lyrics provider cache read failed: {error}"))
}

async fn fetch_all_enabled_lyrics(title: &str, artist: &str, duration: i32, album: Option<&str>, video_id: Option<&str>, state: &tauri::State<'_, RuntimeState>) -> Result<Vec<LyricsPayload>, String> {
    let order = {
        let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
        ordered_lyrics_providers(&db)?
    };
    let mut results = Vec::new();
    for provider in order {
        let enabled = {
            let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
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
        if !enabled { continue; }
        let result = timeout(Duration::from_secs(12), fetch_lyrics_provider(&provider, title, artist, duration, album, video_id, state)).await;
        if let Ok(Ok(Some(payload))) = result { results.push(payload); }
    }
    Ok(results)
}

async fn fetch_lyrics_inner(title: String, artist: String, duration: i32, album: Option<String>, id: Option<String>, state: tauri::State<'_, RuntimeState>, use_cache: bool) -> Result<LyricsPayload, String> {
    let cleaned_title = clean_lyrics_title(&title);
    let cleaned_artist = clean_lyrics_artist(&artist);
    let cache_id = format!("lyrics:{}:{}", cleaned_title.to_lowercase(), cleaned_artist.to_lowercase());
    if use_cache {
    if let Some(cached) = {
        let db = state.db.lock().map_err(|_| "database state poisoned")?;
        db.query_row("SELECT provider, text, synced FROM lyrics WHERE song_id = ?1", params![cache_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?))).optional().map_err(|e| format!("lyrics cache read failed: {e}"))?
    } {
        let text = filter_lyrics_credit_lines(&cached.1);
        return Ok(LyricsPayload { lines: if cached.2 != 0 { parse_lyric_lines(&text) } else { Vec::new() }, provider: cached.0, text, synced: cached.2 != 0, matched_title: cleaned_title, matched_artist: cleaned_artist });
    }
    }
    let album_name = album.as_deref().map(str::trim).filter(|value| !value.is_empty());
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
        if !enabled { continue; }
        if let Some(payload) = fetch_lyrics_provider(&provider, &cleaned_title, &cleaned_artist, duration, album_name, id.as_deref(), &state).await? {
            let db = state.db.lock().map_err(|_| "database state poisoned")?;
            cache_lyrics_payload(&db, &cache_id, &payload)?;
            return Ok(payload);
        }
    }
    Err("Lyrics unavailable from enabled Meld providers".to_owned())
}

#[tauri::command]
async fn fetch_lyrics(title: String, artist: String, duration: i32, album: Option<String>, id: Option<String>, state: tauri::State<'_, RuntimeState>) -> Result<LyricsPayload, String> {
    match timeout(Duration::from_secs(30), fetch_lyrics_inner(title, artist, duration, album, id, state, true)).await {
        Ok(result) => result,
        Err(_) => Err("Lyrics providers timed out after 30 seconds".to_owned()),
    }
}

#[tauri::command]
async fn fetch_lyrics_fresh(title: String, artist: String, duration: i32, album: Option<String>, id: Option<String>, state: tauri::State<'_, RuntimeState>) -> Result<LyricsPayload, String> {
    match timeout(Duration::from_secs(30), fetch_lyrics_inner(title, artist, duration, album, id, state, false)).await {
        Ok(result) => result,
        Err(_) => Err("Lyrics providers timed out after 30 seconds".to_owned()),
    }
}

#[tauri::command]
async fn fetch_lyrics_from_provider(title: String, artist: String, duration: i32, album: Option<String>, id: Option<String>, provider: String, state: tauri::State<'_, RuntimeState>) -> Result<LyricsPayload, String> {
    const PROVIDERS: [&str; 8] = ["BetterLyrics", "Paxsenix", "LrcLib", "KuGou", "LyricsPlus", "Musixmatch", "YouTubeSubtitle", "YouTube"];
    let provider = provider.trim();
    if !PROVIDERS.contains(&provider) { return Err(format!("unsupported lyrics provider: {provider}")); }
    let cleaned_title = clean_lyrics_title(&title);
    let cleaned_artist = clean_lyrics_artist(&artist);
    let album_name = album.as_deref().map(str::trim).filter(|value| !value.is_empty());
    let cache_id = format!("lyrics:{}:{}", cleaned_title.to_lowercase(), cleaned_artist.to_lowercase());
    {
        let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
        if let Some(cached) = cached_lyrics_provider(&db, &cache_id, provider)? { return Ok(cached); }
    }
    let payload = timeout(Duration::from_secs(30), fetch_lyrics_provider(provider, &cleaned_title, &cleaned_artist, duration, album_name, id.as_deref(), &state)).await
        .map_err(|_| "Lyrics provider timed out after 30 seconds".to_owned())??
        .ok_or_else(|| format!("{provider} did not return lyrics for this song"))?;
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    cache_lyrics_payload(&db, &cache_id, &payload)?;
    Ok(payload)
}

#[tauri::command]
async fn library_refetch_item(id: String, state: tauri::State<'_, RuntimeState>) -> Result<Option<YtItem>, String> {
    let video_id = id.trim();
    if video_id.is_empty() { return Err("refetch item id is empty".to_owned()); }
    let visitor_data = visitor(&state).await?;
    let session = auth_session(&state)?;
    let data_sync_id = session.as_ref().map(|value| value.data_sync_id.as_str());
    let response = post("music/get_queue", json!({ "context": context(&visitor_data, session.is_some(), data_sync_id), "videoIds": [video_id], "playlistId": Value::Null }), session.as_ref()).await?;
    let Some(item) = parse_get_queue(&response).into_iter().next() else { return Ok(None); };
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    db.execute("UPDATE songs SET title = ?1, subtitle = ?2, thumbnail = ?3, browse_id = ?4, playlist_id = ?5, video_id = ?6, set_video_id = ?7, kind = ?8, explicit = ?9, music_video_type = ?10, album_id = ?11 WHERE id = ?12 OR video_id = ?12", params![item.title, item.subtitle, item.thumbnail, item.browse_id, item.playlist_id, item.video_id, item.set_video_id, item.kind, if item.explicit { 1 } else { 0 }, item.music_video_type, item.album_id, video_id]).map_err(|error| format!("refetched metadata update failed: {error}"))?;
    Ok(Some(item))
}

#[tauri::command]
fn library_save_item(item: YtItem, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    let is_video = item.music_video_type.as_deref().is_some_and(|value| value != "MUSIC_VIDEO_TYPE_ATV");
    db.execute(
        "INSERT INTO songs (id, title, subtitle, thumbnail, browse_id, playlist_id, video_id, set_video_id, kind, saved_at, explicit, music_video_type, liked, liked_date, in_library, is_video, album_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, NULL, 1, ?13, ?14)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, subtitle=excluded.subtitle, thumbnail=excluded.thumbnail,
         browse_id=excluded.browse_id, playlist_id=excluded.playlist_id, video_id=excluded.video_id, set_video_id=excluded.set_video_id, kind=excluded.kind, saved_at=excluded.saved_at,
         explicit=excluded.explicit, music_video_type=excluded.music_video_type, in_library=1, is_video=excluded.is_video, album_id=excluded.album_id",
        params![item.id, item.title, item.subtitle, item.thumbnail, item.browse_id, item.playlist_id, item.video_id, item.set_video_id, item.kind, now_seconds(), if item.explicit { 1 } else { 0 }, item.music_video_type, if is_video { 1 } else { 0 }, item.album_id],
    ).map_err(|e| format!("library save failed: {e}"))?;
    if let (Some(album_id), Some(album_title)) = (item.album_id.as_deref(), item.album_title.as_deref()) {
        db.execute(
            "INSERT INTO albums (id, playlist_id, title, thumbnail, explicit, in_library, saved_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6)
             ON CONFLICT(id) DO UPDATE SET playlist_id=excluded.playlist_id, title=excluded.title, thumbnail=excluded.thumbnail, explicit=excluded.explicit, in_library=1, saved_at=excluded.saved_at",
            params![album_id, item.playlist_id, album_title, item.thumbnail, if item.explicit { 1 } else { 0 }, now_seconds()],
        ).map_err(|e| format!("album save failed: {e}"))?;
        db.execute("INSERT OR IGNORE INTO song_albums (song_id, album_id) VALUES (?1, ?2)", params![item.id, album_id]).map_err(|e| format!("song album mapping failed: {e}"))?;
    }
    for (position, artist) in item.artists.iter().enumerate() {
        let Some(artist_id) = artist.id.as_deref().filter(|value| !value.is_empty()) else { continue; };
        db.execute(
            "INSERT INTO artists (id, name, saved_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET name=excluded.name, saved_at=excluded.saved_at",
            params![artist_id, artist.name, now_seconds()],
        ).map_err(|e| format!("artist save failed: {e}"))?;
        db.execute("INSERT OR IGNORE INTO song_artists (song_id, artist_id, position) VALUES (?1, ?2, ?3)", params![item.id, artist_id, position as i64]).map_err(|e| format!("song artist mapping failed: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn library_edit_item(item_id: String, title: String, artist: String, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let id = item_id.trim();
    let title = title.trim();
    if id.is_empty() || title.is_empty() { return Err("song edit requires a non-empty item id and title".to_owned()); }
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    let tx = db.unchecked_transaction().map_err(|error| format!("song edit transaction failed: {error}"))?;
    let updated = tx.execute("UPDATE songs SET title = ?1, subtitle = CASE WHEN ?2 <> '' THEN ?2 ELSE subtitle END WHERE id = ?3", params![title, artist.trim(), id]).map_err(|error| format!("song edit failed: {error}"))?;
    if updated == 0 { return Err("song edit target was not found in the local Meld database".to_owned()); }
    if !artist.trim().is_empty() {
        if let Some(artist_id) = tx.query_row("SELECT artist_id FROM song_artists WHERE song_id = ?1 ORDER BY position LIMIT 1", params![id], |row| row.get::<_, String>(0)).optional().map_err(|error| format!("song artist lookup failed: {error}"))? {
            tx.execute("UPDATE artists SET name = ?1 WHERE id = ?2", params![artist.trim(), artist_id]).map_err(|error| format!("artist edit failed: {error}"))?;
        }
    }
    tx.commit().map_err(|error| format!("song edit commit failed: {error}"))?;
    Ok(())
}

#[tauri::command]
fn library_toggle_liked(item: YtItem, liked: bool, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    if item.id.trim().is_empty() { return Err("liked item id is empty".to_owned()); }
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    let now = now_seconds();
    db.execute(
        "INSERT INTO songs (id, title, subtitle, thumbnail, browse_id, playlist_id, video_id, set_video_id, kind, saved_at, explicit, music_video_type, liked, liked_date, in_library, is_video)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, CASE WHEN ?13 = 1 THEN ?10 ELSE NULL END, 0, ?14)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, subtitle=excluded.subtitle, thumbnail=excluded.thumbnail, browse_id=excluded.browse_id, playlist_id=excluded.playlist_id, video_id=excluded.video_id, set_video_id=excluded.set_video_id, kind=excluded.kind, explicit=excluded.explicit, music_video_type=excluded.music_video_type, liked=excluded.liked, liked_date=excluded.liked_date, is_video=excluded.is_video",
        params![item.id, item.title, item.subtitle, item.thumbnail, item.browse_id, item.playlist_id, item.video_id, item.set_video_id, item.kind, now, if item.explicit { 1 } else { 0 }, item.music_video_type, if liked { 1 } else { 0 }, if item.music_video_type.as_deref().is_some_and(|value| value != "MUSIC_VIDEO_TYPE_ATV") { 1 } else { 0 }],
    ).map_err(|e| format!("Meld liked state save failed: {e}"))?;
    if !liked {
        db.execute("DELETE FROM songs WHERE id = ?1 AND liked = 0 AND in_library = 0 AND NOT EXISTS (SELECT 1 FROM playlist_songs WHERE playlist_songs.song_id = songs.id)", params![item.id]).map_err(|e| format!("Meld liked cleanup failed: {e}"))?;
    }
    Ok(())
}

fn token_from_feedback_endpoint(value: &Value) -> Option<String> {
    value.get("feedbackEndpoint").and_then(|endpoint| endpoint.get("feedbackToken")).and_then(Value::as_str).map(str::to_owned)
}

fn collect_library_tokens(value: &Value, add_token: &mut Option<String>, remove_token: &mut Option<String>) {
    if let Some(object) = value.as_object() {
        if let Some(toggle) = object.get("toggleMenuServiceItemRenderer") {
            let icon = toggle.get("defaultIcon").and_then(|v| v.get("iconType")).and_then(Value::as_str).unwrap_or("");
            if icon != "KEEP" && icon != "KEEP_OFF" {
                let default_token = toggle.get("defaultServiceEndpoint").and_then(token_from_feedback_endpoint);
                let toggled_token = toggle.get("toggledServiceEndpoint").and_then(token_from_feedback_endpoint);
                if matches!(icon, "LIBRARY_ADD" | "BOOKMARK_BORDER") || icon.starts_with("LIBRARY_") && !matches!(icon, "LIBRARY_SAVED" | "LIBRARY_REMOVE") {
                    if add_token.is_none() { *add_token = default_token; }
                    if remove_token.is_none() { *remove_token = toggled_token; }
                } else if matches!(icon, "LIBRARY_SAVED" | "BOOKMARK" | "LIBRARY_REMOVE") {
                    if remove_token.is_none() { *remove_token = default_token; }
                    if add_token.is_none() { *add_token = toggled_token; }
                }
            }
        }
        for child in object.values() { collect_library_tokens(child, add_token, remove_token); }
    } else if let Some(array) = value.as_array() {
        for child in array { collect_library_tokens(child, add_token, remove_token); }
    }
}

fn find_library_tokens_for_video(value: &Value, video_id: &str) -> Option<(Option<String>, Option<String>)> {
    if let Some(object) = value.as_object() {
        if object.get("videoId").and_then(Value::as_str) == Some(video_id) {
            let mut add_token = None;
            let mut remove_token = None;
            collect_library_tokens(value, &mut add_token, &mut remove_token);
            if add_token.is_some() || remove_token.is_some() { return Some((add_token, remove_token)); }
        }
        for child in object.values() {
            if let Some(tokens) = find_library_tokens_for_video(child, video_id) { return Some(tokens); }
        }
    } else if let Some(array) = value.as_array() {
        for child in array {
            if let Some(tokens) = find_library_tokens_for_video(child, video_id) { return Some(tokens); }
        }
    }
    None
}

async fn send_feedback(session: &AuthSession, token: String) -> Result<(), String> {
    let response = post("feedback", json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)), "feedbackTokens": [token] }), Some(session)).await?;
    let processed = response.get("feedbackResponses").and_then(Value::as_array).map(|items| !items.is_empty() && items.iter().all(|item| item.get("isProcessed").and_then(Value::as_bool) == Some(true))).unwrap_or(false);
    if processed { Ok(()) } else { Err("YouTube Music did not confirm the library change".to_owned()) }
}

#[tauri::command]
async fn ytm_remove_from_history(token: String, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let token = token.trim();
    if token.is_empty() { return Err("history feedback token is empty".to_owned()); }
    let session = auth_session(&state)?.ok_or_else(|| "Google/YouTube Music account session is not connected".to_owned())?;
    send_feedback(&session, token.to_owned()).await
}

#[tauri::command]
async fn ytm_toggle_like(video_id: String, liked: bool, item: Option<YtItem>, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let id = video_id.trim();
    if id.is_empty() { return Err("video id is empty".to_owned()); }
    let visitor_data = visitor(&state).await?;
    let session = auth_session(&state)?.ok_or_else(|| "Google/YouTube Music account session is not connected".to_owned())?;
    let endpoint = if liked { "like/like" } else { "like/removelike" };
    let response = post(endpoint, json!({ "context": context(&visitor_data, true, Some(&session.data_sync_id)), "target": { "videoId": id } }), Some(&session)).await?;
    if response.get("feedbackResponses").is_none() && response.get("actions").is_none() { return Err("YouTube Music did not return a valid like response".to_owned()); }
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    if let Some(item) = item {
        db.execute("INSERT INTO songs (id, title, subtitle, thumbnail, browse_id, playlist_id, video_id, set_video_id, kind, saved_at, explicit, music_video_type, liked, liked_date, in_library, is_video, youtube_liked) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, NULL, 0, ?15, ?13) ON CONFLICT(id) DO UPDATE SET title=excluded.title, subtitle=excluded.subtitle, thumbnail=excluded.thumbnail, browse_id=excluded.browse_id, playlist_id=excluded.playlist_id, video_id=excluded.video_id, set_video_id=excluded.set_video_id, kind=excluded.kind, explicit=excluded.explicit, music_video_type=excluded.music_video_type, youtube_liked=excluded.youtube_liked, is_video=excluded.is_video", params![item.id, item.title, item.subtitle, item.thumbnail, item.browse_id, item.playlist_id, item.video_id, item.set_video_id, item.kind, now_seconds(), if item.explicit { 1 } else { 0 }, item.music_video_type, if liked { 1 } else { 0 }, if item.music_video_type.as_deref().is_some_and(|v| v != "MUSIC_VIDEO_TYPE_ATV") { 1 } else { 0 }]).map_err(|e| format!("like state save failed: {e}"))?;
    } else {
        db.execute("UPDATE songs SET youtube_liked = ?1 WHERE video_id = ?2 OR id = ?2", params![if liked { 1 } else { 0 }, id]).map_err(|e| format!("like state update failed: {e}"))?;
    }
    if !liked { db.execute("DELETE FROM songs WHERE (video_id = ?1 OR id = ?1) AND in_library = 0 AND NOT EXISTS (SELECT 1 FROM playlist_songs WHERE playlist_songs.song_id = songs.id)", params![id]).map_err(|e| format!("like cleanup failed: {e}"))?; }
    Ok(())
}

#[tauri::command]
async fn ytm_toggle_library(video_id: String, add_to_library: bool, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let id = video_id.trim();
    if id.is_empty() { return Err("video id is empty".to_owned()); }
    let visitor_data = visitor(&state).await?;
    let session = auth_session(&state)?.ok_or_else(|| "Google/YouTube Music account session is not connected".to_owned())?;
    let next_response = post("next", json!({ "context": context(&visitor_data, true, Some(&session.data_sync_id)), "videoId": id }), Some(&session)).await?;
    let (add_token, remove_token) = find_library_tokens_for_video(&next_response, id).ok_or_else(|| "YouTube Music returned no library feedback tokens; sign-in may be required".to_owned())?;
    let token = if add_to_library { add_token } else { remove_token }.ok_or_else(|| "YouTube Music did not expose the requested library operation for this song".to_owned())?;
    send_feedback(&session, token).await
}

fn account_info_from_response(value: &Value) -> Option<(String, Option<String>, Option<String>, Option<String>)> {
    if let Some(object) = value.as_object() {
        if let Some(header) = object.get("activeAccountHeaderRenderer") {
            let name = text(header.get("accountName"));
            if !name.is_empty() {
                return Some((name, Some(text(header.get("email"))).filter(|v| !v.is_empty()), Some(text(header.get("channelHandle"))).filter(|v| !v.is_empty()), thumbnail(header.get("avatar"))));
            }
        }
        for child in object.values() { if let Some(info) = account_info_from_response(child) { return Some(info); } }
    } else if let Some(array) = value.as_array() {
        for child in array { if let Some(info) = account_info_from_response(child) { return Some(info); } }
    }
    None
}

async fn save_account_session_internal(cookie: String, data_sync_id: String, visitor_data: String, state: &RuntimeState) -> Result<SessionStatus, String> {
    if cookie.trim().is_empty() || !cookie.split(';').any(|part| part.trim().starts_with("SAPISID=")) { return Err("Google session cookie is missing SAPISID".to_owned()); }
    if data_sync_id.trim().is_empty() || !visitor_data.starts_with(VISITOR_PREFIX) { return Err("Google session requires dataSyncId and valid visitorData".to_owned()); }
    let session = AuthSession { cookie: cookie.clone(), data_sync_id: data_sync_id.clone(), visitor_data: visitor_data.clone(), account_name: None, account_email: None, account_channel_handle: None, account_avatar: None };
    let response = post("account/account_menu", json!({ "context": context(&visitor_data, true, Some(&data_sync_id)) }), Some(&session)).await?;
    let (name, email, channel_handle, avatar) = account_info_from_response(&response).ok_or_else(|| "Google session validation returned no active account header".to_owned())?;
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    for (key, value) in [("cookie", cookie), ("dataSyncId", data_sync_id), ("visitorData", visitor_data), ("accountName", name.clone()), ("accountEmail", email.clone().unwrap_or_default()), ("accountChannelHandle", channel_handle.clone().unwrap_or_default()), ("accountAvatar", avatar.clone().unwrap_or_default())] {
        db.execute("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, value]).map_err(|e| format!("account session save failed: {e}"))?;
    }
    *state.visitor_data.lock().map_err(|_| "visitor state poisoned")? = Some(session.visitor_data);
    Ok(SessionStatus { authenticated: true, account_name: Some(name), account_email: email, account_channel_handle: channel_handle, account_avatar: avatar })
}

#[tauri::command]
async fn account_save_session(cookie: String, data_sync_id: String, visitor_data: String, state: tauri::State<'_, RuntimeState>) -> Result<SessionStatus, String> {
    save_account_session_internal(cookie, data_sync_id, visitor_data, state.inner()).await
}

#[tauri::command]
async fn open_google_login(app: tauri::AppHandle) -> Result<(), String> {
    if app.get_webview_window("google-login").is_some() { return Ok(()); }
    let start_url: Url = "https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fmusic.youtube.com".parse().map_err(|e| format!("Google login URL failed: {e}"))?;
    let handled = Arc::new(AtomicBool::new(false));
    let app_for_callback = app.clone();
    let handled_for_load = Arc::clone(&handled);
    WebviewWindowBuilder::new(&app, "google-login", WebviewUrl::External(start_url.clone()))
        .title("Sign in to Google / YouTube Music")
        .inner_size(980.0, 760.0)
        .center()
        .on_page_load(move |window, payload| {
            if payload.event() != PageLoadEvent::Finished || payload.url().host_str() != Some("music.youtube.com") || handled_for_load.swap(true, Ordering::AcqRel) { return; }
            let app_handle = app_for_callback.clone();
            let app_for_task = app_for_callback.clone();
            let handled_for_task = Arc::clone(&handled_for_load);
            tauri::async_runtime::spawn(async move {
                for _ in 0..120 {
                    if !window.is_visible().unwrap_or(false) {
                        handled_for_task.store(false, Ordering::Release);
                        return;
                    }
                    let (sender, receiver) = std::sync::mpsc::channel::<String>();
                    let _ = window.eval_with_callback(r#"(() => { try { const cfg = window.yt && window.yt.config_; const visitorData = cfg && (cfg.VISITOR_DATA || cfg.VISITOR_DATA_); const dataSyncId = cfg && cfg.DATASYNC_ID; return visitorData && dataSyncId ? JSON.stringify({visitorData, dataSyncId: String(dataSyncId).split('||')[0]}) : ''; } catch (_) { return ''; } })()"#, move |value| { let _ = sender.send(value); });
                    let raw = tokio::task::spawn_blocking(move || receiver.recv_timeout(Duration::from_secs(2)).ok()).await.ok().flatten().unwrap_or_default();
                    let raw = serde_json::from_str::<String>(&raw).unwrap_or(raw);
                    if !raw.is_empty() {
                        let Ok(data) = serde_json::from_str::<Value>(&raw) else { continue; };
                        let Some(visitor_data) = data.get("visitorData").and_then(Value::as_str).filter(|value| !value.is_empty()).map(str::to_owned) else { continue; };
                        let Some(data_sync_id) = data.get("dataSyncId").and_then(Value::as_str).filter(|value| !value.is_empty()).map(str::to_owned) else { continue; };
                        let Ok(cookies) = window.cookies_for_url("https://music.youtube.com/".parse().expect("valid YouTube URL")) else { let _ = app_handle.emit("account-status-error", "Google login cookies could not be read".to_owned()); handled_for_task.store(false, Ordering::Release); return; };
                        let cookie_header = cookies.iter().map(|cookie| format!("{}={}", cookie.name(), cookie.value())).collect::<Vec<_>>().join("; ");
                        if cookie_header.is_empty() { let _ = app_handle.emit("account-status-error", "Google login returned no session cookies".to_owned()); handled_for_task.store(false, Ordering::Release); return; }
                        let state = app_for_task.state::<RuntimeState>();
                        match save_account_session_internal(cookie_header, data_sync_id, visitor_data, &state).await {
                            Ok(status) => { let _ = app_handle.emit("account-status", status); let _ = window.destroy(); }
                            Err(error) => { let _ = app_handle.emit("account-status-error", error); handled_for_task.store(false, Ordering::Release); }
                        }
                        return;
                    }
                }
                handled_for_task.store(false, Ordering::Release);
                let _ = app_handle.emit("account-status-error", "Google login timed out before Meld received the authenticated session".to_owned());
            });
        })
        .build()
        .map_err(|e| format!("Google login window failed: {e}"))?;
    Ok(())
}

fn base32_decode(input: &str) -> Vec<u8> {
    let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let mut buffer = 0u32;
    let mut bits = 0u8;
    let mut output = Vec::new();
    for character in input.to_uppercase().chars().filter(|character| *character != '=') {
        let Some(value) = alphabet.find(character) else { continue; };
        buffer = (buffer << 5) | value as u32;
        bits += 5;
        if bits >= 8 { bits -= 8; output.push(((buffer >> bits) & 0xff) as u8); }
    }
    output
}

fn spotify_totp(secret: &str, server_time: i64) -> String {
    let counter = (server_time.max(0) / 30) as u64;
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&counter.to_be_bytes());
    let mut mac = Hmac::<Sha1>::new_from_slice(&base32_decode(secret)).expect("HMAC accepts any key length");
    mac.update(&bytes);
    let digest = mac.finalize().into_bytes();
    let offset = (digest[19] & 0x0f) as usize;
    let code = ((u32::from(digest[offset]) & 0x7f) << 24) | (u32::from(digest[offset + 1]) << 16) | (u32::from(digest[offset + 2]) << 8) | u32::from(digest[offset + 3]);
    format!("{:06}", code % 1_000_000)
}

fn spotify_hash_candidates(operation: &str) -> Result<Vec<String>, String> {
    let registry: Value = serde_json::from_str(include_str!("../resources/spotify-gql-hashes.json"))
        .map_err(|error| format!("Spotify hash registry is invalid: {error}"))?;
    let entry = registry
        .get("operations")
        .and_then(|value| value.get(operation))
        .ok_or_else(|| format!("Spotify operation is not registered: {operation}"))?;
    let primary = entry.get("hash").and_then(Value::as_str).filter(|value| !value.is_empty())
        .ok_or_else(|| format!("Spotify operation has no hash: {operation}"))?;
    let previous = entry.get("previous_hash").and_then(Value::as_str).filter(|value| !value.is_empty());
    let mut candidates = vec![primary.to_owned()];
    if previous != Some(primary) {
        if let Some(value) = previous { candidates.push(value.to_owned()); }
    }
    Ok(candidates)
}

async fn spotify_graphql_post(operation: &str, variables: Value, token: &str) -> Result<Value, String> {
    let hashes = spotify_hash_candidates(operation)?;
    let mut last_status = None;
    for (index, hash) in hashes.iter().enumerate() {
        let body = json!({
            "variables": variables,
            "operationName": operation,
            "extensions": { "persistedQuery": { "version": 1, "sha256Hash": hash } }
        });
        let response = http()
            .post("https://api-partner.spotify.com/pathfinder/v2/query")
            .bearer_auth(token)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|error| format!("Spotify GraphQL request failed: {error}"))?;
        let status = response.status();
        last_status = Some(status.as_u16());
        let text = response.text().await.map_err(|error| format!("Spotify GraphQL response failed: {error}"))?;
        if status.as_u16() == 412 && index + 1 < hashes.len() { continue; }
        if !status.is_success() { return Err(format!("Spotify GraphQL {operation} returned HTTP {}", status.as_u16())); }
        let value: Value = serde_json::from_str(&text).map_err(|error| format!("Spotify GraphQL JSON failed: {error}"))?;
        if value.get("errors").and_then(Value::as_array).is_some_and(|errors| !errors.is_empty()) {
            let message = value.pointer("/errors/0/message").and_then(Value::as_str).unwrap_or("unknown GraphQL error");
            if message.contains("PersistedQueryNotFound") && index + 1 < hashes.len() { continue; }
            return Err(format!("Spotify GraphQL {operation} error: {message}"));
        }
        return Ok(value);
    }
    Err(format!("Spotify GraphQL {operation} failed with HTTP {}", last_status.unwrap_or(412)))
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SpotifyProfile {
    id: String,
    display_name: Option<String>,
    avatar: Option<String>,
}

fn spotify_token(state: &tauri::State<'_, RuntimeState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    let token = setting_value(&db, "spotifyAccessToken")?.filter(|value| !value.is_empty()).ok_or_else(|| "Spotify account is not authenticated".to_owned())?;
    let expiry = setting_value(&db, "spotifyTokenExpiry")?.and_then(|value| value.parse::<i64>().ok());
    if expiry.is_none_or(|value| value <= now_millis()) { return Err("Spotify account is not authenticated or its token expired".to_owned()); }
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
    if !wrapper.get("__typename").and_then(Value::as_str).is_some_and(|value| value.contains("Playlist")) { return None; }
    let data = wrapper.get("data")?;
    let uri = wrapper.get("_uri").and_then(Value::as_str).or_else(|| data.get("uri").and_then(Value::as_str))?;
    let id = uri.rsplit(':').next()?.to_owned();
    let image = data.pointer("/images/items/0/sources/0/url").and_then(Value::as_str).or_else(|| data.pointer("/images/sources/0/url").and_then(Value::as_str)).map(str::to_owned);
    let owner = data.pointer("/ownerV2/data/name").and_then(Value::as_str).map(str::to_owned);
    Some(SpotifyPlaylistItem { id, name: data.get("name").and_then(Value::as_str).unwrap_or_default().to_owned(), description: data.get("description").and_then(Value::as_str).map(str::to_owned), image, owner })
}

fn spotify_playlist_items(response: &Value) -> Vec<SpotifyPlaylistItem> {
    response.pointer("/data/me/libraryV3/items").and_then(Value::as_array).into_iter().flatten().filter_map(|entry| spotify_playlist_from_wrapper(entry.get("item")?)).collect()
}

fn parse_spotify_library_node(response: &Value) -> SpotifyLibraryNode {
    let library = response.pointer("/data/me/libraryV3");
    let total_count = library.and_then(|value| value.get("totalCount")).and_then(Value::as_i64).unwrap_or(0);
    let mut folders = Vec::new();
    let mut playlists = Vec::new();
    for entry in library.and_then(|value| value.get("items")).and_then(Value::as_array).into_iter().flatten() {
        let Some(wrapper) = entry.get("item") else { continue; };
        let type_name = wrapper.get("__typename").and_then(Value::as_str).unwrap_or_default();
        if type_name.contains("Folder") {
            let Some(uri) = wrapper.get("_uri").and_then(Value::as_str) else { continue; };
            let data = wrapper.get("data");
            let name = data.and_then(|value| value.get("name")).and_then(Value::as_str).or_else(|| wrapper.get("name").and_then(Value::as_str));
            let Some(name) = name else { continue; };
            let total_children = data.and_then(|value| value.get("totalLength")).and_then(Value::as_i64).or_else(|| data.and_then(|value| value.get("numberOfItems")).and_then(Value::as_i64)).or_else(|| wrapper.get("totalLength").and_then(Value::as_i64)).unwrap_or(0);
            folders.push(SpotifyFolderItem { uri: uri.to_owned(), name: name.to_owned(), total_children });
        } else if let Some(playlist) = spotify_playlist_from_wrapper(wrapper) {
            playlists.push(playlist);
        }
    }
    SpotifyLibraryNode { folders, playlists, total_count }
}

fn spotify_track_matches(response: &Value) -> Vec<SpotifyTrackMatch> {
    response.pointer("/data/searchV2/tracksV2/items").and_then(Value::as_array).into_iter().flatten().filter_map(|entry| {
        let wrapper = entry.get("item")?;
        if wrapper.get("__typename").and_then(Value::as_str) != Some("TrackResponseWrapper") { return None; }
        let data = wrapper.get("data")?;
        if data.get("__typename").and_then(Value::as_str) != Some("Track") { return None; }
        let uri = wrapper.get("_uri").and_then(Value::as_str).or_else(|| data.get("uri").and_then(Value::as_str))?.to_owned();
        let id = uri.rsplit(':').next()?.to_owned();
        let artist = data.pointer("/artists/items/0/profile/name").and_then(Value::as_str).unwrap_or_default().to_owned();
        let duration_ms = data.pointer("/duration/totalMilliseconds").and_then(Value::as_i64).or_else(|| data.get("durationMs").and_then(Value::as_i64)).unwrap_or(0);
        Some(SpotifyTrackMatch { id, uri, name: data.get("name").and_then(Value::as_str).unwrap_or_default().to_owned(), artist, duration_ms })
    }).collect()
}

fn parse_spotify_playlist_tracks(response: &Value) -> Vec<SpotifyTrackItem> {
    response.pointer("/data/playlistV2/content/items").and_then(Value::as_array).into_iter().flatten().filter_map(|entry| {
        let wrapper = entry.get("itemV2")?;
        let data = wrapper.get("data")?;
        let uri = wrapper.get("_uri").and_then(Value::as_str).or_else(|| data.get("uri").and_then(Value::as_str))?.to_owned();
        let id = uri.rsplit(':').next()?.to_owned();
        let image = data.pointer("/albumOfTrack/coverArt/sources/0/url").and_then(Value::as_str).or_else(|| data.pointer("/albumOfTrack/coverArt/sources/0/uri").and_then(Value::as_str)).map(str::to_owned);
        let artist = data.pointer("/artists/items/0/profile/name").and_then(Value::as_str).unwrap_or_default().to_owned();
        let album = data.pointer("/albumOfTrack/name").and_then(Value::as_str).unwrap_or_default().to_owned();
        let duration_ms = data.pointer("/duration/totalMilliseconds").and_then(Value::as_i64).or_else(|| data.get("durationMs").and_then(Value::as_i64)).unwrap_or(0);
        Some(SpotifyTrackItem { id, uri, uid: entry.get("uid").and_then(Value::as_str).map(str::to_owned), name: data.get("name").and_then(Value::as_str).unwrap_or_default().to_owned(), artist, album, image, duration_ms })
    }).collect()
}

#[tauri::command]
async fn spotify_playlist_tracks(playlist_id: String, offset: Option<i64>, state: tauri::State<'_, RuntimeState>) -> Result<SpotifyTrackPage, String> {
    let playlist_id = playlist_id.trim();
    if playlist_id.is_empty() { return Err("Spotify playlist id is required".to_owned()); }
    let token = spotify_token(&state)?;
    let offset = offset.unwrap_or(0).max(0);
    let limit = 100_i64;
    let variables = json!({ "uri": format!("spotify:playlist:{playlist_id}"), "offset": offset, "limit": limit, "enableWatchFeedEntrypoint": false });
    let response = spotify_graphql_post("fetchPlaylist", variables, &token).await?;
    let total_count = response.pointer("/data/playlistV2/content/totalCount").and_then(Value::as_i64).unwrap_or(0);
    Ok(SpotifyTrackPage { tracks: parse_spotify_playlist_tracks(&response), total_count, offset, limit })
}

fn parse_spotify_liked_tracks(response: &Value) -> SpotifyLikedTracks {
    let tracks_data = response.pointer("/data/me/library/tracks");
    let total_count = tracks_data.and_then(|value| value.get("totalCount")).and_then(Value::as_i64).unwrap_or(0);
    let tracks = tracks_data.and_then(|value| value.get("items")).and_then(Value::as_array).into_iter().flatten().filter_map(|entry| {
        let wrapper = entry.get("track")?;
        let data = wrapper.get("data")?;
        let uri = wrapper.get("_uri").and_then(Value::as_str).or_else(|| wrapper.get("uri").and_then(Value::as_str)).or_else(|| data.get("uri").and_then(Value::as_str))?.to_owned();
        let id = uri.rsplit(':').next()?.to_owned();
        let image = data.pointer("/albumOfTrack/coverArt/sources/0/url").and_then(Value::as_str).map(str::to_owned);
        let artist = data.pointer("/artists/items/0/profile/name").and_then(Value::as_str).unwrap_or_default().to_owned();
        let album = data.pointer("/albumOfTrack/name").and_then(Value::as_str).unwrap_or_default().to_owned();
        let duration_ms = data.pointer("/duration/totalMilliseconds").and_then(Value::as_i64).or_else(|| data.get("durationMs").and_then(Value::as_i64)).unwrap_or(0);
        Some(SpotifyTrackItem { id, uri, uid: None, name: data.get("name").and_then(Value::as_str).unwrap_or_default().to_owned(), artist, album, image, duration_ms })
    }).collect();
    SpotifyLikedTracks { tracks, total_count }
}

#[tauri::command]
async fn spotify_remove_from_playlist(playlist_id: String, uid: String, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let playlist_id = playlist_id.trim();
    let uid = uid.trim();
    if playlist_id.is_empty() || uid.is_empty() { return Err("Spotify playlist or track uid is empty".to_owned()); }
    let token = spotify_token(&state)?;
    let variables = json!({ "playlistUri": format!("spotify:playlist:{playlist_id}"), "uids": [uid] });
    spotify_graphql_post("removeFromPlaylist", variables, &token).await?;
    Ok(())
}

#[tauri::command]
async fn spotify_move_in_playlist(playlist_id: String, uids: Vec<String>, before_uid: Option<String>, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let playlist_id = playlist_id.trim();
    let uids: Vec<String> = uids.into_iter().map(|value| value.trim().to_owned()).filter(|value| !value.is_empty()).collect();
    if playlist_id.is_empty() || uids.is_empty() { return Err("Spotify playlist id and item uid are required".to_owned()); }
    let token = spotify_token(&state)?;
    let variables = json!({ "playlistUri": format!("spotify:playlist:{playlist_id}"), "uids": uids, "newPosition": { "moveType": if before_uid.is_some() { "BEFORE_UID" } else { "BOTTOM_OF_PLAYLIST" }, "fromUid": before_uid } });
    spotify_graphql_post("moveItemsInPlaylist", variables, &token).await?;
    Ok(())
}

#[tauri::command]
async fn spotify_rename_playlist(playlist_id: String, new_name: String, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let playlist_id = playlist_id.trim();
    let new_name = new_name.trim();
    if playlist_id.is_empty() || new_name.is_empty() { return Err("Spotify playlist id and name are required".to_owned()); }
    let token = spotify_token(&state)?;
    let variables = json!({ "playlistUri": format!("spotify:playlist:{playlist_id}"), "newName": new_name });
    spotify_graphql_post("editPlaylistAttributes", variables, &token).await?;
    Ok(())
}

#[tauri::command]
async fn spotify_liked_tracks(state: tauri::State<'_, RuntimeState>) -> Result<SpotifyLikedTracks, String> {
    let token = spotify_token(&state)?;
    let response = spotify_graphql_post("fetchLibraryTracks", json!({ "offset": 0, "limit": 100 }), &token).await?;
    Ok(parse_spotify_liked_tracks(&response))
}

#[tauri::command]
async fn spotify_library_node(folder_uri: Option<String>, state: tauri::State<'_, RuntimeState>) -> Result<SpotifyLibraryNode, String> {
    let token = spotify_token(&state)?;
    let variables = json!({ "filters": ["Playlists"], "order": Value::Null, "textFilter": "", "features": ["LIKED_SONGS", "YOUR_EPISODES_V2", "PRERELEASES", "EVENTS"], "limit": 100, "offset": 0, "flatten": false, "expandedFolders": [], "folderUri": folder_uri, "includeFoldersWhenFlattening": true });
    let response = spotify_graphql_post("libraryV3", variables, &token).await?;
    Ok(parse_spotify_library_node(&response))
}

#[tauri::command]
async fn spotify_playlists(state: tauri::State<'_, RuntimeState>) -> Result<Vec<SpotifyPlaylistItem>, String> {
    let token = spotify_token(&state)?;
    let variables = json!({ "filters": ["Playlists"], "order": Value::Null, "textFilter": "", "features": ["LIKED_SONGS", "YOUR_EPISODES_V2", "PRERELEASES", "EVENTS"], "limit": 50, "offset": 0, "flatten": true, "expandedFolders": [], "folderUri": Value::Null, "includeFoldersWhenFlattening": false });
    let response = spotify_graphql_post("libraryV3", variables, &token).await?;
    Ok(spotify_playlist_items(&response))
}

async fn spotify_search_track_matches(query: &str, token: &str) -> Result<Vec<SpotifyTrackMatch>, String> {
    let variables = json!({ "searchTerm": query, "offset": 0, "limit": 5, "numberOfTopResults": 5, "includeAudiobooks": false, "includeArtistHasConcertsField": false, "includePreReleases": false, "includeLocalConcertsField": false, "includeAuthors": false });
    let response = spotify_graphql_post("searchDesktop", variables, token).await?;
    Ok(spotify_track_matches(&response))
}

#[tauri::command]
async fn spotify_search_tracks(query: String, state: tauri::State<'_, RuntimeState>) -> Result<Vec<SpotifyTrackMatch>, String> {
    let query = query.trim();
    if query.is_empty() { return Ok(Vec::new()); }
    let token = spotify_token(&state)?;
    spotify_search_track_matches(query, &token).await
}

fn spotify_normalize(value: &str) -> String {
    let mut normalized = value.to_lowercase();
    for pattern in [r"(?i)\(feat\..*?\)", r"(?i)\(ft\..*?\)", r"\[.*?\]", r"(?i)\(.*?remaster.*?\)", r"(?i)\(.*?remix.*?\)"] {
        if let Ok(regex) = Regex::new(pattern) { normalized = regex.replace_all(&normalized, "").into_owned(); }
    }
    if let Ok(regex) = Regex::new(r"[^a-z0-9\s]") { normalized = regex.replace_all(&normalized, "").into_owned(); }
    if let Ok(regex) = Regex::new(r"\s+") { normalized = regex.replace_all(&normalized, " ").trim().to_owned(); }
    normalized
}

fn spotify_bigram_similarity(left: &str, right: &str) -> f64 {
    if left == right { return 1.0; }
    if left.len() < 2 || right.len() < 2 { return 0.0; }
    let left_bigrams: HashSet<String> = left.as_bytes().windows(2).map(|bytes| String::from_utf8_lossy(bytes).to_string()).collect();
    let right_bigrams: HashSet<String> = right.as_bytes().windows(2).map(|bytes| String::from_utf8_lossy(bytes).to_string()).collect();
    if left_bigrams.is_empty() || right_bigrams.is_empty() { return 0.0; }
    let intersection = left_bigrams.iter().filter(|value| right_bigrams.contains(*value)).count();
    (2.0 * intersection as f64) / (left_bigrams.len() + right_bigrams.len()) as f64
}

fn spotify_duration_score(spotify_duration_ms: i64, candidate_duration_ms: i64) -> f64 {
    if candidate_duration_ms <= 0 || spotify_duration_ms <= 0 { return 0.5; }
    let diff = ((spotify_duration_ms / 1000) - (candidate_duration_ms / 1000)).abs();
    if diff <= 2 { 1.0 } else if diff <= 5 { 0.8 } else if diff <= 10 { 0.5 } else if diff <= 30 { 0.2 } else { 0.0 }
}

fn spotify_match_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SpotifyTrackMatch> {
    let id: String = row.get(0)?;
    Ok(SpotifyTrackMatch { uri: format!("spotify:track:{id}"), id, name: row.get(1)?, artist: row.get(2)?, duration_ms: 0 })
}

fn persist_spotify_match(db: &Connection, spotify_id: &str, youtube_id: &str, title: &str, artist: &str, score: f64, manual: bool) -> Result<(), String> {
    db.execute("INSERT INTO spotify_match (spotify_id, youtube_id, title, artist, match_score, cached_at, is_manual_override) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT(spotify_id) DO UPDATE SET youtube_id=excluded.youtube_id, title=excluded.title, artist=excluded.artist, match_score=excluded.match_score, cached_at=excluded.cached_at, is_manual_override=excluded.is_manual_override WHERE spotify_match.is_manual_override = 0 OR excluded.is_manual_override = 1", params![spotify_id, youtube_id, title, artist, score, now_millis(), if manual { 1 } else { 0 }]).map_err(|error| format!("Spotify match save failed: {error}"))?;
    Ok(())
}

#[tauri::command]
fn spotify_match_for_youtube(youtube_id: String, state: tauri::State<'_, RuntimeState>) -> Result<Option<SpotifyTrackMatch>, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    db.query_row("SELECT spotify_id, title, artist FROM spotify_match WHERE youtube_id = ?1 LIMIT 1", params![youtube_id.trim()], spotify_match_from_row).optional().map_err(|error| format!("Spotify match lookup failed: {error}"))
}

#[tauri::command]
fn spotify_override_youtube(spotify_id: String, youtube_id: String, title: String, artist: String, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let spotify_id = spotify_id.trim();
    let youtube_id = youtube_id.trim();
    if spotify_id.is_empty() || youtube_id.is_empty() { return Err("Spotify or YouTube match ID is empty".to_owned()); }
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    db.execute("INSERT INTO spotify_match (spotify_id, youtube_id, title, artist, match_score, cached_at, is_manual_override) VALUES (?1, ?2, ?3, ?4, 1.0, ?5, 1) ON CONFLICT(spotify_id) DO UPDATE SET youtube_id=excluded.youtube_id, title=excluded.title, artist=excluded.artist, match_score=1.0, cached_at=excluded.cached_at, is_manual_override=1", params![spotify_id, youtube_id, title.trim(), artist.trim(), now_millis()]).map_err(|error| format!("Spotify manual match save failed: {error}"))?;
    Ok(())
}

#[tauri::command]
async fn spotify_resolve_youtube(youtube_id: Option<String>, title: String, artist: String, duration_sec: i64, state: tauri::State<'_, RuntimeState>) -> Result<Option<SpotifyTrackMatch>, String> {
    if let Some(youtube_id) = youtube_id.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        if let Some(cached) = spotify_match_for_youtube(youtube_id.to_owned(), state.clone())? { return Ok(Some(cached)); }
    }
    let token = spotify_token(&state)?;
    let query = if artist.trim().is_empty() { title.trim().to_owned() } else { format!("{} {}", artist.trim(), title.trim()) };
    let candidates = spotify_search_track_matches(&query, &token).await?;
    let normalized_title = spotify_normalize(title.trim());
    let normalized_artist = spotify_normalize(artist.trim());
    let spotify_duration_ms = if duration_sec > 0 { duration_sec * 1000 } else { 0 };
    let mut best: Option<(f64, SpotifyTrackMatch)> = None;
    for candidate in candidates {
        let title_score = spotify_bigram_similarity(&normalized_title, &spotify_normalize(&candidate.name));
        let artist_score = spotify_bigram_similarity(&normalized_artist, &spotify_normalize(&candidate.artist));
        let score = title_score * 0.45 + artist_score * 0.35 + spotify_duration_score(spotify_duration_ms, candidate.duration_ms) * 0.20;
        if best.as_ref().is_none_or(|(current, _)| score > *current) { best = Some((score, candidate)); }
    }
    let Some((score, candidate)) = best.filter(|(score, _)| *score >= 0.35) else { return Ok(None); };
    if let Some(youtube_id) = youtube_id.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
        persist_spotify_match(&db, &candidate.id, youtube_id, &candidate.name, &candidate.artist, score, false)?;
    }
    Ok(Some(candidate))
}

#[tauri::command]
async fn spotify_add_to_playlist(playlist_id: String, track_uri: String, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let playlist_id = playlist_id.trim();
    let track_uri = track_uri.trim();
    if playlist_id.is_empty() || track_uri.is_empty() { return Err("Spotify playlist or track URI is empty".to_owned()); }
    let token = spotify_token(&state)?;
    let variables = json!({ "playlistUri": format!("spotify:playlist:{playlist_id}"), "playlistItemUris": [track_uri], "newPosition": { "moveType": "BOTTOM_OF_PLAYLIST", "fromUid": Value::Null } });
    spotify_graphql_post("addToPlaylist", variables, &token).await?;
    Ok(())
}

#[tauri::command]
async fn spotify_profile(state: tauri::State<'_, RuntimeState>) -> Result<SpotifyProfile, String> {
    let token = spotify_token(&state)?;
    let response = spotify_graphql_post("profileAttributes", json!({}), &token).await?;
    let profile = response.pointer("/data/me/profile").ok_or_else(|| "Spotify profileAttributes response had no profile".to_owned())?;
    let uri = profile.get("uri").and_then(Value::as_str).unwrap_or_default();
    let id = uri.rsplit(':').next().filter(|value| !value.is_empty()).unwrap_or(uri).to_owned();
    if id.is_empty() { return Err("Spotify profile id was empty".to_owned()); }
    Ok(SpotifyProfile {
        id,
        display_name: profile.get("name").and_then(Value::as_str).map(str::to_owned),
        avatar: profile.pointer("/avatar/sources/0/url").and_then(Value::as_str).map(str::to_owned),
    })
}

async fn spotify_fetch_access_token(sp_dc: &str, sp_key: &str) -> Result<(String, i64), String> {
    let gist: Value = http().get("https://api.github.com/gists/22ed9c6ba463899e933427f7de1f0eef").header("Accept", "application/vnd.github+json").send().await.map_err(|e| format!("Spotify nuance request failed: {e}"))?.error_for_status().map_err(|e| format!("Spotify nuance returned error: {e}"))?.json().await.map_err(|e| format!("Spotify nuance JSON failed: {e}"))?;
    let content = gist.get("files").and_then(Value::as_object).and_then(|files| files.values().next()).and_then(|file| file.get("content")).and_then(Value::as_str).ok_or_else(|| "Spotify nuance gist had no content".to_owned())?;
    let nuances: Vec<Value> = serde_json::from_str(content).map_err(|e| format!("Spotify nuance list failed: {e}"))?;
    let nuance = nuances.iter().max_by_key(|item| item.get("v").and_then(Value::as_i64).unwrap_or(0)).ok_or_else(|| "Spotify nuance list was empty".to_owned())?;
    let secret = nuance.get("s").and_then(Value::as_str).ok_or_else(|| "Spotify nuance secret missing".to_owned())?;
    let version = nuance.get("v").and_then(Value::as_i64).ok_or_else(|| "Spotify nuance version missing".to_owned())?;
    let server: Value = http().get("https://open.spotify.com/api/server-time").send().await.map_err(|e| format!("Spotify server time failed: {e}"))?.error_for_status().map_err(|e| format!("Spotify server time returned error: {e}"))?.json().await.map_err(|e| format!("Spotify server time JSON failed: {e}"))?;
    let server_time = server.get("serverTime").and_then(Value::as_i64).ok_or_else(|| "Spotify server time missing".to_owned())?;
    let totp = spotify_totp(secret, server_time);
    let url = format!("https://open.spotify.com/api/token?reason=transport&productType=web-player&totp={totp}&totpServer={totp}&totpVer={version}");
    let cookie = if sp_key.is_empty() { format!("sp_dc={sp_dc}") } else { format!("sp_dc={sp_dc}; sp_key={sp_key}") };
    let token: Value = http().get(url).header("Cookie", cookie).send().await.map_err(|e| format!("Spotify token request failed: {e}"))?.error_for_status().map_err(|e| format!("Spotify token rejected: {e}"))?.json().await.map_err(|e| format!("Spotify token JSON failed: {e}"))?;
    let access_token = token.get("accessToken").and_then(Value::as_str).filter(|value| !value.is_empty()).ok_or_else(|| "Spotify returned no authenticated access token".to_owned())?.to_owned();
    if token.get("isAnonymous").and_then(Value::as_bool) == Some(true) { return Err("Spotify returned an anonymous token".to_owned()); }
    let expiry = token.get("accessTokenExpirationTimestampMs").and_then(Value::as_i64).ok_or_else(|| "Spotify token expiry missing".to_owned())?;
    Ok((access_token, expiry))
}

async fn save_spotify_session_internal(sp_dc: String, sp_key: String, state: &RuntimeState) -> Result<i64, String> {
    let (access_token, expiry) = spotify_fetch_access_token(&sp_dc, &sp_key).await?;
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    for (key, value) in [("spotifySpDc", sp_dc), ("spotifySpKey", sp_key), ("spotifyAccessToken", access_token), ("spotifyTokenExpiry", expiry.to_string())] {
        db.execute("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, value]).map_err(|e| format!("Spotify session save failed: {e}"))?;
    }
    Ok(expiry)
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SpotifySessionStatus { authenticated: bool, token_expiry: Option<i64> }

#[tauri::command]
fn spotify_session_status(state: tauri::State<'_, RuntimeState>) -> Result<SpotifySessionStatus, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    let token = setting_value(&db, "spotifyAccessToken")?;
    let expiry = setting_value(&db, "spotifyTokenExpiry")?.and_then(|value| value.parse::<i64>().ok());
    Ok(SpotifySessionStatus { authenticated: token.as_deref().is_some_and(|value| !value.is_empty()) && expiry.is_some_and(|value| value > now_millis()), token_expiry: expiry })
}

#[tauri::command]
async fn open_spotify_login(app: tauri::AppHandle) -> Result<(), String> {
    if app.get_webview_window("spotify-login").is_some() { return Ok(()); }
    let start_url: Url = "https://accounts.spotify.com/login?continue=https%3A%2F%2Fopen.spotify.com%2F".parse().map_err(|e| format!("Spotify login URL failed: {e}"))?;
    let handled = Arc::new(AtomicBool::new(false));
    let app_for_callback = app.clone();
    WebviewWindowBuilder::new(&app, "spotify-login", WebviewUrl::External(start_url.clone()))
        .title("Sign in to Spotify")
        .inner_size(980.0, 760.0)
        .center()
        .on_page_load(move |window, payload| {
            if payload.event() != PageLoadEvent::Finished || payload.url().host_str() != Some("open.spotify.com") || handled.swap(true, Ordering::AcqRel) { return; }
            let app_handle = app_for_callback.clone();
            let app_for_task = app_for_callback.clone();
            let handled_for_task = Arc::clone(&handled);
            tauri::async_runtime::spawn(async move {
                for _ in 0..120 {
                    let Ok(cookies) = window.cookies_for_url("https://open.spotify.com/".parse().expect("valid Spotify URL")) else { tokio::time::sleep(Duration::from_millis(500)).await; continue; };
                    let mut sp_dc = None;
                    let mut sp_key = None;
                    for cookie in cookies { match cookie.name() { "sp_dc" => sp_dc = Some(cookie.value().to_owned()), "sp_key" => sp_key = Some(cookie.value().to_owned()), _ => {} } }
                    if let Some(sp_dc) = sp_dc.filter(|value| !value.is_empty()) {
                        let state = app_for_task.state::<RuntimeState>();
                        match save_spotify_session_internal(sp_dc, sp_key.unwrap_or_default(), &state).await {
                            Ok(expiry) => { let _ = app_handle.emit("spotify-status", SpotifySessionStatus { authenticated: true, token_expiry: Some(expiry) }); let _ = window.destroy(); }
                            Err(error) => { let _ = app_handle.emit("spotify-status-error", error); handled_for_task.store(false, Ordering::Release); }
                        }
                        return;
                    }
                    tokio::time::sleep(Duration::from_millis(500)).await;
                }
                handled_for_task.store(false, Ordering::Release);
                let _ = app_handle.emit("spotify-status-error", "Spotify login timed out before Meld received the authenticated session".to_owned());
            });
        })
        .build()
        .map_err(|e| format!("Spotify login window failed: {e}"))?;
    Ok(())
}

#[tauri::command]
fn spotify_logout(state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    db.execute("DELETE FROM settings WHERE key IN ('spotifySpDc', 'spotifySpKey', 'spotifyAccessToken', 'spotifyTokenExpiry', 'spotifyUsername', 'spotifyUserId')", []).map_err(|e| format!("Spotify logout failed: {e}"))?;
    db.execute("DELETE FROM spotify_match", []).map_err(|e| format!("Spotify match cache clear failed: {e}"))?;
    Ok(())
}

#[tauri::command]
fn clear_local_library_keep_downloads(state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    let transaction = db.unchecked_transaction().map_err(|error| format!("library clear transaction failed: {error}"))?;
    for table in ["playlist_songs", "song_albums", "song_artists"] { transaction.execute(&format!("DELETE FROM {table}"), []).map_err(|error| format!("library clear failed for {table}: {error}"))?; }
    for table in ["playlists", "history", "search_history", "lyrics", "podcasts", "speed_dial", "albums", "artists", "spotify_match"] { transaction.execute(&format!("DELETE FROM {table}"), []).map_err(|error| format!("library clear failed for {table}: {error}"))?; }
    transaction.execute("DELETE FROM songs WHERE NOT EXISTS (SELECT 1 FROM downloads WHERE downloads.song_id = songs.id)", []).map_err(|error| format!("library song clear failed: {error}"))?;
    transaction.commit().map_err(|error| format!("library clear commit failed: {error}"))?;
    Ok(())
}

#[tauri::command]
fn account_logout(state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    *state.visitor_data.lock().map_err(|_| "visitor state poisoned")? = None;
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    db.execute("DELETE FROM settings WHERE key IN ('cookie', 'dataSyncId', 'visitorData', 'accountName', 'accountEmail', 'accountChannelHandle', 'accountAvatar')", []).map_err(|e| format!("account logout failed: {e}"))?;
    Ok(())
}

#[tauri::command]
fn session_status(state: tauri::State<'_, RuntimeState>) -> Result<SessionStatus, String> {
    match auth_session(&state)? {
        Some(session) => Ok(SessionStatus { authenticated: true, account_name: session.account_name, account_email: session.account_email, account_channel_handle: session.account_channel_handle, account_avatar: session.account_avatar }),
        None => Ok(SessionStatus { authenticated: false, account_name: None, account_email: None, account_channel_handle: None, account_avatar: None }),
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LibraryItemState { liked: bool, youtube_liked: bool, in_library: bool, uploaded: bool, pinned: bool, podcast_saved: bool }

#[tauri::command]
fn library_item_state(id: String, state: tauri::State<'_, RuntimeState>) -> Result<LibraryItemState, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    let pinned = db.query_row("SELECT EXISTS(SELECT 1 FROM speed_dial WHERE id = ?1)", params![id], |row| row.get::<_, i64>(0)).map_err(|error| format!("Speed Dial state read failed: {error}"))? != 0;
    let podcast_saved = db.query_row("SELECT EXISTS(SELECT 1 FROM podcasts WHERE id = ?1 AND bookmarked_at IS NOT NULL)", params![id], |row| row.get::<_, i64>(0)).map_err(|error| format!("podcast state read failed: {error}"))? != 0;
    let item_state = db.query_row("SELECT liked, youtube_liked, in_library, uploaded FROM songs WHERE id = ?1 OR video_id = ?1 LIMIT 1", params![id], |row| Ok(LibraryItemState { liked: row.get::<_, i64>(0)? != 0, youtube_liked: row.get::<_, i64>(1)? != 0, in_library: row.get::<_, i64>(2)? != 0, uploaded: row.get::<_, i64>(3)? != 0, pinned, podcast_saved })).optional().map_err(|e| format!("library item state read failed: {e}"))?;
    Ok(item_state.unwrap_or(LibraryItemState { liked: false, youtube_liked: false, in_library: false, uploaded: false, pinned, podcast_saved }))
}

#[tauri::command]
fn speed_dial_toggle(item: YtItem, pinned: bool, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    if pinned {
        let item_type = match item.kind.as_str() { "song" | "episode" => "SONG", "album" => "ALBUM", "artist" => "ARTIST", "playlist" => "PLAYLIST", _ => return Err(format!("unsupported Speed Dial item kind: {}", item.kind)) };
        db.execute("INSERT INTO speed_dial (id, secondary_id, title, subtitle, thumbnail, item_type, explicit, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ON CONFLICT(id) DO UPDATE SET secondary_id=excluded.secondary_id, title=excluded.title, subtitle=excluded.subtitle, thumbnail=excluded.thumbnail, item_type=excluded.item_type, explicit=excluded.explicit", params![item.id, item.playlist_id, item.title, item.subtitle, item.thumbnail, item_type, if item.explicit { 1 } else { 0 }, now_seconds()]).map_err(|error| format!("Speed Dial pin failed: {error}"))?;
    } else {
        db.execute("DELETE FROM speed_dial WHERE id = ?1", params![item.id]).map_err(|error| format!("Speed Dial unpin failed: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
fn speed_dial_items(state: tauri::State<'_, RuntimeState>) -> Result<Vec<YtItem>, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    let mut statement = db.prepare("SELECT id, secondary_id, title, COALESCE(subtitle, ''), thumbnail, item_type, explicit FROM speed_dial ORDER BY created_at DESC").map_err(|error| format!("Speed Dial query failed: {error}"))?;
    let rows = statement.query_map([], |row| {
        let id: String = row.get(0)?;
        let secondary_id: Option<String> = row.get(1)?;
        let item_type: String = row.get(5)?;
        let (kind, video_id, browse_id) = match item_type.as_str() { "SONG" => ("song".to_owned(), Some(id.clone()), None), "ALBUM" => ("album".to_owned(), None, Some(id.clone())), "ARTIST" => ("artist".to_owned(), None, Some(id.clone())), _ => ("playlist".to_owned(), None, Some(id.clone())) };
        Ok(YtItem { id, kind, title: row.get(2)?, subtitle: row.get(3)?, thumbnail: row.get(4)?, artists: Vec::new(), browse_id, playlist_id: secondary_id.clone(), video_id, set_video_id: None, play_playlist_id: secondary_id, play_video_id: None, params: None, explicit: row.get::<_, i64>(6)? != 0, music_video_type: None, history_remove_token: None, album_id: None, album_title: None })
    }).map_err(|error| format!("Speed Dial rows failed: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| format!("Speed Dial row decode failed: {error}"))
}

#[tauri::command]
fn library_remove_item(id: String, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    db.execute("UPDATE songs SET in_library = 0 WHERE id = ?1", params![id]).map_err(|e| format!("library remove failed: {e}"))?;
    db.execute("DELETE FROM songs WHERE id = ?1 AND liked = 0 AND youtube_liked = 0 AND uploaded = 0 AND NOT EXISTS (SELECT 1 FROM playlist_songs WHERE song_id = ?1)", params![id]).map_err(|e| format!("library cleanup failed: {e}"))?;
    Ok(())
}

#[tauri::command]
fn search_history_add(query: String, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let query = query.trim();
    if query.is_empty() { return Ok(()); }
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    db.execute("INSERT INTO search_history (query, searched_at) VALUES (?1, ?2) ON CONFLICT(query) DO UPDATE SET searched_at=excluded.searched_at", params![query, now_seconds()]).map_err(|error| format!("search history write failed: {error}"))?;
    Ok(())
}

#[tauri::command]
fn search_history_items(state: tauri::State<'_, RuntimeState>) -> Result<Vec<String>, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    let mut statement = db.prepare("SELECT query FROM search_history ORDER BY searched_at DESC, id DESC LIMIT 20").map_err(|error| format!("search history query failed: {error}"))?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0)).map_err(|error| format!("search history rows failed: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| format!("search history row decode failed: {error}"))
}

#[tauri::command]
fn search_history_clear(state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    db.execute("DELETE FROM search_history", []).map_err(|error| format!("search history clear failed: {error}"))?;
    Ok(())
}

#[tauri::command]
fn history_add(item: YtItem, state: tauri::State<'_, RuntimeState>) -> Result<i64, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    let is_video = item.music_video_type.as_deref().is_some_and(|value| value != "MUSIC_VIDEO_TYPE_ATV");
    db.execute("INSERT INTO songs (id, title, subtitle, thumbnail, browse_id, playlist_id, video_id, set_video_id, kind, saved_at, explicit, music_video_type, liked, liked_date, in_library, is_video) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, NULL, 0, ?13) ON CONFLICT(id) DO UPDATE SET title=excluded.title, subtitle=excluded.subtitle, thumbnail=excluded.thumbnail, browse_id=excluded.browse_id, playlist_id=excluded.playlist_id, video_id=excluded.video_id, set_video_id=excluded.set_video_id, kind=excluded.kind, explicit=excluded.explicit, music_video_type=excluded.music_video_type, is_video=excluded.is_video", params![item.id, item.title, item.subtitle, item.thumbnail, item.browse_id, item.playlist_id, item.video_id, item.set_video_id, item.kind, now_seconds(), if item.explicit { 1 } else { 0 }, item.music_video_type, if is_video { 1 } else { 0 }]).map_err(|e| format!("history song save failed: {e}"))?;
    db.execute("INSERT INTO history (song_id, played_at, play_time_ms) VALUES (?1, ?2, 0)", params![item.id, now_seconds()]).map_err(|e| format!("history write failed: {e}"))?;
    Ok(db.last_insert_rowid())
}

#[tauri::command]
fn history_record_playtime(history_id: i64, play_time_ms: i64, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    if history_id <= 0 || play_time_ms <= 0 { return Ok(()); }
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    db.execute("UPDATE history SET play_time_ms = play_time_ms + ?1 WHERE id = ?2", params![play_time_ms, history_id]).map_err(|error| format!("history playtime update failed: {error}"))?;
    Ok(())
}

#[tauri::command]
fn history_clear(state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    db.execute("DELETE FROM history", []).map_err(|e| format!("history clear failed: {e}"))?;
    db.execute("DELETE FROM songs WHERE liked = 0 AND youtube_liked = 0 AND uploaded = 0 AND in_library = 0 AND NOT EXISTS (SELECT 1 FROM playlist_songs WHERE playlist_songs.song_id = songs.id)", []).map_err(|e| format!("history cleanup failed: {e}"))?;
    Ok(())
}

#[tauri::command]
fn library_stats(period: String, state: tauri::State<'_, RuntimeState>) -> Result<StatsPayload, String> {
    let period = period.trim().to_lowercase();
    let cutoff = match period.as_str() {
        "day" => now_seconds() - 86_400,
        "week" => now_seconds() - 604_800,
        "month" => now_seconds() - 2_592_000,
        "year" => now_seconds() - 31_536_000,
        "all" => 0,
        _ => return Err("unsupported stats period".to_owned()),
    };
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    let total_plays: i64 = db.query_row("SELECT COUNT(*) FROM history WHERE played_at >= ?1", params![cutoff], |row| row.get(0)).map_err(|error| format!("stats total plays query failed: {error}"))?;
    let total_minutes: i64 = db.query_row("SELECT COALESCE(SUM(CASE WHEN h.play_time_ms > 0 THEN h.play_time_ms ELSE MAX(s.duration, 0) * 1000 END), 0) / 60000 FROM history h INNER JOIN songs s ON s.id = h.song_id WHERE h.played_at >= ?1", params![cutoff], |row| row.get(0)).map_err(|error| format!("stats total time query failed: {error}"))?;
    let unique_songs: i64 = db.query_row("SELECT COUNT(DISTINCT song_id) FROM history WHERE played_at >= ?1", params![cutoff], |row| row.get(0)).map_err(|error| format!("stats unique songs query failed: {error}"))?;
    let mut statement = db.prepare("SELECT s.id, s.kind, s.title, s.subtitle, s.thumbnail, s.browse_id, s.playlist_id, s.video_id, s.set_video_id, s.explicit, s.music_video_type, COUNT(h.id) AS plays, COALESCE(SUM(CASE WHEN h.play_time_ms > 0 THEN h.play_time_ms ELSE MAX(s.duration, 0) * 1000 END), 0) / 60000 AS minutes FROM history h INNER JOIN songs s ON s.id = h.song_id WHERE h.played_at >= ?1 GROUP BY s.id ORDER BY plays DESC, MAX(h.played_at) DESC LIMIT 100").map_err(|error| format!("stats rows query failed: {error}"))?;
    let rows = statement.query_map(params![cutoff], |row| Ok(StatsRow { item: YtItem { id: row.get(0)?, kind: row.get(1)?, title: row.get(2)?, subtitle: row.get(3)?, thumbnail: row.get(4)?, artists: Vec::new(), browse_id: row.get(5)?, playlist_id: row.get(6)?, video_id: row.get(7)?, set_video_id: row.get(8)?, play_playlist_id: None, play_video_id: None, params: None, explicit: row.get::<_, i64>(9)? != 0, music_video_type: row.get(10)?, history_remove_token: None, album_id: None, album_title: None }, plays: row.get(11)?, minutes: row.get(12)? })).map_err(|error| format!("stats rows decode failed: {error}"))?;
    let rows = rows.collect::<Result<Vec<_>, _>>().map_err(|error| format!("stats rows collect failed: {error}"))?;
    let mut artist_statement = db.prepare("SELECT a.id, a.name, a.thumbnail, COUNT(h.id) AS plays FROM history h INNER JOIN songs s ON s.id = h.song_id INNER JOIN song_artists sa ON sa.song_id = s.id INNER JOIN artists a ON a.id = sa.artist_id WHERE h.played_at >= ?1 GROUP BY a.id, a.name, a.thumbnail ORDER BY plays DESC, MAX(h.played_at) DESC LIMIT 100").map_err(|error| format!("stats artists query failed: {error}"))?;
    let artists = artist_statement.query_map(params![cutoff], |row| Ok(StatsGroup { id: row.get(0)?, title: row.get(1)?, subtitle: "Artist".to_owned(), thumbnail: row.get(2)?, plays: row.get(3)? })).map_err(|error| format!("stats artist rows failed: {error}"))?.collect::<Result<Vec<_>, _>>().map_err(|error| format!("stats artist decode failed: {error}"))?;
    let mut album_statement = db.prepare("SELECT a.id, a.title, a.thumbnail, COUNT(h.id) AS plays FROM history h INNER JOIN songs s ON s.id = h.song_id INNER JOIN song_albums sa ON sa.song_id = s.id INNER JOIN albums a ON a.id = sa.album_id WHERE h.played_at >= ?1 GROUP BY a.id, a.title, a.thumbnail ORDER BY plays DESC, MAX(h.played_at) DESC LIMIT 100").map_err(|error| format!("stats albums query failed: {error}"))?;
    let albums = album_statement.query_map(params![cutoff], |row| Ok(StatsGroup { id: row.get(0)?, title: row.get(1)?, subtitle: "Album".to_owned(), thumbnail: row.get(2)?, plays: row.get(3)? })).map_err(|error| format!("stats album rows failed: {error}"))?.collect::<Result<Vec<_>, _>>().map_err(|error| format!("stats album decode failed: {error}"))?;
    Ok(StatsPayload { period, total_plays, total_minutes, unique_songs, rows, artists, albums })
}

#[tauri::command]
fn history_items(state: tauri::State<'_, RuntimeState>) -> Result<Vec<YtItem>, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    let mut statement = db.prepare("SELECT s.id, s.kind, s.title, s.subtitle, s.thumbnail, s.browse_id, s.playlist_id, s.video_id, s.set_video_id, s.explicit, s.music_video_type FROM history h INNER JOIN songs s ON s.id = h.song_id ORDER BY h.played_at DESC, h.id DESC LIMIT 200").map_err(|e| format!("history query failed: {e}"))?;
    let rows = statement.query_map([], |row| Ok(YtItem { id: row.get(0)?, kind: row.get(1)?, title: row.get(2)?, subtitle: row.get(3)?, thumbnail: row.get(4)?, artists: Vec::new(), browse_id: row.get(5)?, playlist_id: row.get(6)?, video_id: row.get(7)?, set_video_id: row.get(8)?, play_playlist_id: None, play_video_id: None, params: None, explicit: row.get::<_, i64>(9)? != 0, music_video_type: row.get(10)?, history_remove_token: None, album_id: None, album_title: None })).map_err(|e| format!("history rows failed: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("history row decode failed: {e}"))
}

fn allowed_setting(key: &str) -> bool {
    matches!(key, "ytmSync" | "useLoginForBrowse" | "hideExplicit" | "hideVideoSongs" | "enableBetterLyrics" | "enablePaxsenix" | "enableLrclib" | "enableKugou" | "enableLyricsPlus" | "enableMusixmatch" | "shuffleMode" | "repeatMode" | "similarContent" | "autoLoadMore" | "disableLoadMoreWhenRepeatAll" | "autoDownloadOnLike" | "autoSkipNextOnError" | "persistentShuffleAcrossQueues" | "rememberShuffleAndRepeat" | "shufflePlaylistFirst" | "preventDuplicateTracksInQueue" | "varispeed" | "seekExtraSeconds" | "audioQuality" | "playerVolume" | "equalizerEnabled" | "equalizerLow" | "equalizerMid" | "equalizerHigh" | "pauseOnMute" | "persistentQueue" | "pauseListenHistory" | "pauseSearchHistory" | "sleepTimerDefault" | "lyricsProviderOrder" | "show_liked_playlist" | "show_downloaded_playlist" | "show_uploaded_playlist" | "show_top_playlist" | "show_cached_playlist")
}

#[tauri::command]
fn backup_create(state: tauri::State<'_, RuntimeState>) -> Result<String, String> {
    let output_path = FileDialog::new().set_title("Create Meld Desktop backup").add_filter("Meld Desktop backup", &["backup"]).save_file().ok_or_else(|| "Backup cancelled".to_owned())?;
    let temp_db = output_path.with_extension("sqlite3.part");
    let _ = fs::remove_file(&temp_db);
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    db.execute("VACUUM INTO ?1", params![temp_db.to_string_lossy().to_string()]).map_err(|error| format!("database backup failed: {error}"))?;
    let settings: Vec<SettingEntry> = {
        let mut statement = db.prepare("SELECT key, value FROM settings WHERE key NOT IN ('cookie', 'dataSyncId', 'visitorData', 'accountName', 'accountEmail', 'accountChannelHandle', 'accountAvatar', 'spotifySpDc', 'spotifySpKey', 'spotifyAccessToken', 'spotifyTokenExpiry', 'spotifyUsername', 'spotifyUserId') ORDER BY key").map_err(|error| format!("backup settings query failed: {error}"))?;
        let rows = statement.query_map([], |row| Ok(SettingEntry { key: row.get(0)?, value: row.get(1)? })).map_err(|error| format!("backup settings rows failed: {error}"))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|error| format!("backup settings decode failed: {error}"))?
    };
    drop(db);
    let result = (|| -> Result<(), String> {
        let file = fs::File::create(&output_path).map_err(|error| format!("backup archive create failed: {error}"))?;
        let mut archive = ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        archive.start_file("settings.json", options).map_err(|error| format!("backup settings entry failed: {error}"))?;
        archive.write_all(&serde_json::to_vec_pretty(&settings).map_err(|error| format!("backup settings encode failed: {error}"))?).map_err(|error| format!("backup settings write failed: {error}"))?;
        archive.start_file("song.db", options).map_err(|error| format!("backup database entry failed: {error}"))?;
        let mut database_file = fs::File::open(&temp_db).map_err(|error| format!("backup database open failed: {error}"))?;
        let mut database_bytes = Vec::new();
        database_file.read_to_end(&mut database_bytes).map_err(|error| format!("backup database read failed: {error}"))?;
        archive.write_all(&database_bytes).map_err(|error| format!("backup database write failed: {error}"))?;
        archive.finish().map_err(|error| format!("backup archive finalize failed: {error}"))?;
        Ok(())
    })();
    let _ = fs::remove_file(&temp_db);
    result.map(|_| output_path.to_string_lossy().to_string())
}

#[tauri::command]
fn backup_restore(state: tauri::State<'_, RuntimeState>) -> Result<String, String> {
    let input_path = FileDialog::new().set_title("Restore Meld Desktop backup").add_filter("Meld Desktop backup", &["backup"]).pick_file().ok_or_else(|| "Restore cancelled".to_owned())?;
    let file = fs::File::open(&input_path).map_err(|error| format!("backup open failed: {error}"))?;
    let mut archive = ZipArchive::new(file).map_err(|error| format!("invalid Meld Desktop backup: {error}"))?;
    let mut database_bytes = Vec::new();
    let mut settings_bytes = Vec::new();
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| format!("backup entry read failed: {error}"))?;
        match entry.name() {
            "song.db" => { entry.read_to_end(&mut database_bytes).map_err(|error| format!("backup database read failed: {error}"))?; }
            "settings.json" => { entry.read_to_end(&mut settings_bytes).map_err(|error| format!("backup settings read failed: {error}"))?; }
            _ => {}
        }
    }
    if database_bytes.is_empty() || settings_bytes.is_empty() { return Err("backup is missing song.db or settings.json".to_owned()); }
    let imported_settings: Vec<SettingEntry> = serde_json::from_slice(&settings_bytes).map_err(|error| format!("backup settings are invalid: {error}"))?;
    let temp_db = database_path().with_extension("restore.part");
    let _ = fs::remove_file(&temp_db);
    fs::write(&temp_db, &database_bytes).map_err(|error| format!("backup database temp write failed: {error}"))?;
    let candidate = match Connection::open(&temp_db) {
        Ok(connection) => connection,
        Err(error) => { let _ = fs::remove_file(&temp_db); return Err(format!("backup database validation failed: {error}")); }
    };
    let integrity: String = match candidate.query_row("PRAGMA integrity_check", [], |row| row.get(0)) {
        Ok(value) => value,
        Err(error) => { drop(candidate); let _ = fs::remove_file(&temp_db); return Err(format!("backup database integrity check failed: {error}")); }
    };
    if integrity != "ok" { drop(candidate); let _ = fs::remove_file(&temp_db); return Err(format!("backup database integrity check failed: {integrity}")); }
    let required_tables: i64 = match candidate.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('songs', 'settings', 'history', 'downloads')", [], |row| row.get(0)) {
        Ok(value) => value,
        Err(error) => { drop(candidate); let _ = fs::remove_file(&temp_db); return Err(format!("backup database schema validation failed: {error}")); }
    };
    if required_tables != 4 { let _ = fs::remove_file(&temp_db); return Err("backup database is missing required Meld tables".to_owned()); }
    candidate.execute("DELETE FROM settings", []).map_err(|error| format!("restored settings clear failed: {error}"))?;
    for setting in imported_settings {
        if allowed_setting(&setting.key) {
            candidate.execute("INSERT INTO settings (key, value) VALUES (?1, ?2)", params![setting.key, setting.value]).map_err(|error| format!("restored setting write failed: {error}"))?;
        }
    }
    candidate.execute("DELETE FROM settings WHERE key IN ('cookie', 'dataSyncId', 'visitorData', 'accountName', 'accountEmail', 'accountChannelHandle', 'accountAvatar', 'spotifySpDc', 'spotifySpKey', 'spotifyAccessToken', 'spotifyTokenExpiry', 'spotifyUsername', 'spotifyUserId')", []).map_err(|error| format!("restored auth clear failed: {error}"))?;
    drop(candidate);

    let db_path = database_path();
    let previous_path = db_path.with_extension("restore.previous");
    let mut db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    let replacement = Connection::open_in_memory().map_err(|error| format!("restore temporary connection failed: {error}"))?;
    let old = std::mem::replace(&mut *db, replacement);
    drop(old);
    let _ = fs::remove_file(&previous_path);
    let swap_result = fs::rename(&db_path, &previous_path).and_then(|_| fs::rename(&temp_db, &db_path));
    if let Err(error) = swap_result {
        let _ = fs::rename(&temp_db, &db_path);
        let _ = fs::rename(&previous_path, &db_path);
        if let Ok(old_connection) = Connection::open(&db_path) { *db = old_connection; }
        return Err(format!("database restore swap failed: {error}"));
    }
    match Connection::open(&db_path) {
        Ok(restored) => {
            *db = restored;
            let _ = fs::remove_file(&previous_path);
            Ok(input_path.to_string_lossy().to_string())
        }
        Err(error) => {
            let _ = fs::remove_file(&db_path);
            let _ = fs::rename(&previous_path, &db_path);
            if let Ok(old_connection) = Connection::open(&db_path) { *db = old_connection; }
            Err(format!("restored database reopen failed: {error}"))
        }
    }
}

#[tauri::command]
fn settings_get(state: tauri::State<'_, RuntimeState>) -> Result<Vec<SettingEntry>, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    let mut statement = db.prepare("SELECT key, value FROM settings WHERE key IN ('ytmSync', 'useLoginForBrowse', 'hideExplicit', 'hideVideoSongs', 'enableBetterLyrics', 'enablePaxsenix', 'enableLrclib', 'enableKugou', 'enableLyricsPlus', 'enableMusixmatch', 'shuffleMode', 'repeatMode', 'similarContent', 'autoLoadMore', 'disableLoadMoreWhenRepeatAll', 'autoDownloadOnLike', 'autoSkipNextOnError', 'persistentShuffleAcrossQueues', 'rememberShuffleAndRepeat', 'shufflePlaylistFirst', 'preventDuplicateTracksInQueue', 'varispeed', 'seekExtraSeconds', 'audioQuality', 'playerVolume', 'equalizerEnabled', 'equalizerLow', 'equalizerMid', 'equalizerHigh', 'pauseOnMute', 'persistentQueue', 'pauseListenHistory', 'pauseSearchHistory', 'sleepTimerDefault', 'lyricsProviderOrder', 'show_liked_playlist', 'show_downloaded_playlist', 'show_uploaded_playlist', 'show_top_playlist', 'show_cached_playlist') ORDER BY key").map_err(|e| format!("settings read failed: {e}"))?;
    let rows = statement.query_map([], |row| Ok(SettingEntry { key: row.get(0)?, value: row.get(1)? })).map_err(|e| format!("settings query failed: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("settings row failed: {e}"))
}

#[tauri::command]
fn settings_set(key: String, value: String, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    if !allowed_setting(&key) { return Err(format!("unsupported Meld setting: {key}")); }
    if key == "repeatMode" { if !matches!(value.as_str(), "0" | "1" | "2") { return Err("Meld repeatMode must be 0 (off), 1 (one), or 2 (all)".to_owned()); } } else if key == "audioQuality" { if !matches!(value.as_str(), "auto" | "high" | "low") { return Err("audioQuality must be auto, high, or low".to_owned()); } } else if key == "playerVolume" { let volume = value.parse::<f32>().map_err(|_| "playerVolume must be a number between 0 and 1".to_owned())?; if !volume.is_finite() || !(0.0..=1.0).contains(&volume) { return Err("playerVolume must be a number between 0 and 1".to_owned()); } } else if matches!(key.as_str(), "equalizerLow" | "equalizerMid" | "equalizerHigh") { let gain = value.parse::<f32>().map_err(|_| "equalizer gain must be a number between -12 and 12".to_owned())?; if !gain.is_finite() || !(-12.0..=12.0).contains(&gain) { return Err("equalizer gain must be a number between -12 and 12".to_owned()); } } else if key == "lyricsProviderOrder" { let allowed = ["BetterLyrics", "Paxsenix", "LrcLib", "KuGou", "LyricsPlus", "Musixmatch", "YouTubeSubtitle", "YouTube"]; if value.split(',').map(str::trim).any(|provider| !provider.is_empty() && !allowed.contains(&provider)) { return Err("unsupported lyrics provider in provider order".to_owned()); } } else if key == "sleepTimerDefault" { let minutes = value.parse::<f32>().map_err(|_| "sleepTimerDefault must be a number of minutes".to_owned())?; if !minutes.is_finite() || !(5.0..=120.0).contains(&minutes) { return Err("sleepTimerDefault must be between 5 and 120 minutes".to_owned()); } } else if !matches!(value.as_str(), "true" | "false") { return Err("Meld boolean settings require true or false".to_owned()); }
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    db.execute("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, value]).map_err(|e| format!("settings write failed: {e}"))?;
    Ok(())
}

fn persist_local_item(db: &Connection, item: &LocalItem, modified_at: Option<i64>) -> Result<(), String> {
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

#[tauri::command]
fn local_files_pick(state: tauri::State<'_, RuntimeState>) -> Result<Vec<LocalItem>, String> {
    let paths = FileDialog::new()
        .set_title("Import audio files into Meld Desktop")
        .add_filter("Audio", &["mp3", "m4a", "m4b", "flac", "ogg", "opus", "wav", "aac", "alac", "aiff"])
        .pick_files()
        .unwrap_or_default();
    if paths.is_empty() { return Ok(Vec::new()); }
    let artwork_dir = database_path().parent().map(|value| value.join("artwork")).unwrap_or_else(|| PathBuf::from("artwork"));
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    let mut items = Vec::new();
    for path in paths {
        if !path.is_file() { continue; }
        let Some(item) = local_item_from_path(&path, &artwork_dir) else { continue; };
        let modified_at = fs::metadata(&path).ok().and_then(|metadata| metadata.modified().ok()).and_then(|value| value.duration_since(UNIX_EPOCH).ok()).map(|value| value.as_secs() as i64);
        persist_local_item(&db, &item, modified_at)?;
        items.push(item);
    }
    items.sort_by(|left, right| left.title.to_lowercase().cmp(&right.title.to_lowercase()));
    Ok(items)
}

#[tauri::command]
fn library_downloaded_podcasts(state: tauri::State<'_, RuntimeState>) -> Result<Vec<LocalItem>, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    let mut statement = db.prepare("SELECT s.id, s.kind, s.title, s.subtitle, s.thumbnail, s.video_id, s.set_video_id, s.playlist_id, s.explicit, s.music_video_type, s.album_id, d.path FROM downloads d INNER JOIN songs s ON s.id = d.song_id WHERE d.state = 'completed' AND s.kind = 'episode' ORDER BY d.downloaded_at DESC").map_err(|error| format!("downloaded podcast query failed: {error}"))?;
    let rows = statement.query_map([], |row| {
        let path: String = row.get(11)?;
        Ok(LocalItem { id: row.get(0)?, kind: row.get(1)?, title: row.get(2)?, subtitle: row.get(3)?, thumbnail: row.get(4)?, artists: Vec::new(), browse_id: None, playlist_id: row.get(7)?, video_id: row.get(5)?, set_video_id: row.get(6)?, play_playlist_id: row.get(7)?, play_video_id: row.get(5)?, params: None, explicit: row.get::<_, i64>(8)? != 0, music_video_type: row.get(9)?, history_remove_token: None, album_id: row.get(10)?, album_title: None, local_path: path, duration: 0 })
    }).map_err(|error| format!("downloaded podcast rows failed: {error}"))?;
    let mut items = Vec::new();
    for row in rows { let item = row.map_err(|error| format!("downloaded podcast row decode failed: {error}"))?; if Path::new(&item.local_path).is_file() { items.push(item); } }
    Ok(items)
}

#[tauri::command]
fn library_downloads(state: tauri::State<'_, RuntimeState>) -> Result<Vec<LocalItem>, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    let mut statement = db.prepare("SELECT s.id, s.kind, s.title, s.subtitle, s.thumbnail, d.artwork_path, s.video_id, s.set_video_id, s.playlist_id, s.explicit, s.music_video_type, s.album_id, d.path, d.bytes, d.total_bytes, d.lyrics_cached, s.duration FROM downloads d INNER JOIN songs s ON s.id = d.song_id WHERE d.state = 'completed' ORDER BY d.downloaded_at DESC").map_err(|error| format!("downloaded catalog query failed: {error}"))?;
    let rows = statement.query_map([], |row| {
        let path: String = row.get(12)?;
        let remote_thumbnail: Option<String> = row.get(4)?;
        let artwork_path: Option<String> = row.get(5)?;
        let thumbnail = artwork_path.filter(|value| Path::new(value).is_file()).or(remote_thumbnail);
        Ok(LocalItem { id: row.get(0)?, kind: row.get(1)?, title: row.get(2)?, subtitle: row.get(3)?, thumbnail, artists: Vec::new(), browse_id: None, playlist_id: row.get(8)?, video_id: row.get(6)?, set_video_id: row.get(7)?, play_playlist_id: row.get(8)?, play_video_id: row.get(6)?, params: None, explicit: row.get::<_, i64>(9)? != 0, music_video_type: row.get(10)?, history_remove_token: None, album_id: row.get(11)?, album_title: None, local_path: path, duration: row.get(16)? })
    }).map_err(|error| format!("downloaded catalog rows failed: {error}"))?;
    let mut items = Vec::new();
    for row in rows { let item = row.map_err(|error| format!("downloaded catalog row decode failed: {error}"))?; if Path::new(&item.local_path).is_file() { items.push(item); } }
    Ok(items)
}

#[tauri::command]
fn library_local_files(state: tauri::State<'_, RuntimeState>) -> Result<Vec<LocalItem>, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    let mut statement = db.prepare("SELECT s.id, s.title, s.subtitle, s.thumbnail, s.duration, s.local_path, COALESCE(a.name, '') FROM songs s LEFT JOIN song_artists sa ON sa.song_id = s.id LEFT JOIN artists a ON a.id = sa.artist_id WHERE s.is_local = 1 AND s.local_path IS NOT NULL AND s.in_library = 1 ORDER BY s.title COLLATE NOCASE ASC").map_err(|error| format!("local files query failed: {error}"))?;
    let rows = statement.query_map([], |row| {
        let id: String = row.get(0)?;
        let artist: String = row.get(6)?;
        let artist_id = (!artist.is_empty()).then(|| format!("local-artist:{}", Sha1::digest(artist.as_bytes()).iter().map(|byte| format!("{byte:02x}")).collect::<String>()));
        Ok(LocalItem { id, kind: "song".to_owned(), title: row.get(1)?, subtitle: row.get(2)?, thumbnail: row.get(3)?, artists: if artist.is_empty() { Vec::new() } else { vec![Artist { name: artist, id: artist_id }] }, browse_id: None, playlist_id: None, video_id: None, set_video_id: None, play_playlist_id: None, play_video_id: None, params: None, explicit: false, music_video_type: None, history_remove_token: None, album_id: None, album_title: None, local_path: row.get(5)?, duration: row.get(4)? })
    }).map_err(|error| format!("local files rows failed: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| format!("local files row decode failed: {error}"))
}

#[tauri::command]
fn library_top_songs(period: String, limit: i64, state: tauri::State<'_, RuntimeState>) -> Result<Vec<YtItem>, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    let cutoff = match period.as_str() {
        "day" => now_seconds() - 86_400,
        "week" => now_seconds() - 604_800,
        "month" => now_seconds() - 2_592_000,
        "year" => now_seconds() - 31_536_000,
        _ => 0,
    };
    let capped_limit = limit.clamp(1, 500);
    let mut statement = db.prepare("SELECT s.id, s.kind, s.title, s.subtitle, s.thumbnail, s.browse_id, s.playlist_id, s.video_id, s.set_video_id, s.explicit, s.music_video_type FROM songs s INNER JOIN history h ON h.song_id = s.id WHERE h.played_at >= ?1 GROUP BY s.id ORDER BY COUNT(h.id) DESC, MAX(h.played_at) DESC LIMIT ?2").map_err(|error| format!("top songs query failed: {error}"))?;
    let rows = statement.query_map(params![cutoff, capped_limit], |row| Ok(YtItem {
        id: row.get(0)?, kind: row.get(1)?, title: row.get(2)?, subtitle: row.get(3)?, thumbnail: row.get(4)?, artists: Vec::new(), browse_id: row.get(5)?, playlist_id: row.get(6)?, video_id: row.get(7)?, set_video_id: row.get(8)?, play_playlist_id: None, play_video_id: None, params: None, explicit: row.get::<_, i64>(9)? != 0, music_video_type: row.get(10)?, history_remove_token: None, album_id: None, album_title: None,
    })).map_err(|error| format!("top songs rows failed: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| format!("top songs row decode failed: {error}"))
}

#[tauri::command]
fn library_songs(state: tauri::State<'_, RuntimeState>) -> Result<Vec<YtItem>, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    let mut statement = db.prepare("SELECT id, kind, title, subtitle, thumbnail, browse_id, playlist_id, video_id, set_video_id, explicit, music_video_type FROM songs WHERE in_library = 1 ORDER BY saved_at DESC").map_err(|e| format!("library query failed: {e}"))?;
    let rows = statement.query_map([], |row| Ok(YtItem {
        id: row.get(0)?, kind: row.get(1)?, title: row.get(2)?, subtitle: row.get(3)?, thumbnail: row.get(4)?, artists: Vec::new(), browse_id: row.get(5)?, playlist_id: row.get(6)?, video_id: row.get(7)?, set_video_id: row.get(8)?, play_playlist_id: None, play_video_id: None, params: None, explicit: row.get::<_, i64>(9)? != 0, music_video_type: row.get(10)?,
        history_remove_token: None,
        album_id: None,
        album_title: None,
    })).map_err(|e| format!("library rows failed: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("library row decode failed: {e}"))
}

#[tauri::command]
fn library_mix_songs(state: tauri::State<'_, RuntimeState>) -> Result<Vec<YtItem>, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    let mut statement = db.prepare("SELECT DISTINCT s.id, s.kind, s.title, s.subtitle, s.thumbnail, s.browse_id, s.playlist_id, s.video_id, s.set_video_id, s.explicit, s.music_video_type FROM songs s LEFT JOIN playlist_songs ps ON ps.song_id = s.id LEFT JOIN playlists p ON p.id = ps.playlist_id WHERE s.in_library = 1 OR p.id IS NOT NULL ORDER BY s.saved_at DESC").map_err(|e| format!("library mix songs query failed: {e}"))?;
    let rows = statement.query_map([], |row| Ok(YtItem {
        id: row.get(0)?, kind: row.get(1)?, title: row.get(2)?, subtitle: row.get(3)?, thumbnail: row.get(4)?, artists: Vec::new(), browse_id: row.get(5)?, playlist_id: row.get(6)?, video_id: row.get(7)?, set_video_id: row.get(8)?, play_playlist_id: None, play_video_id: None, params: None, explicit: row.get::<_, i64>(9)? != 0, music_video_type: row.get(10)?, history_remove_token: None, album_id: None, album_title: None,
    })).map_err(|e| format!("library mix song rows failed: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("library mix song row decode failed: {e}"))
}

#[tauri::command]
fn library_liked_songs(state: tauri::State<'_, RuntimeState>) -> Result<Vec<YtItem>, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    let mut statement = db.prepare("SELECT id, kind, title, subtitle, thumbnail, browse_id, playlist_id, video_id, set_video_id, explicit, music_video_type FROM songs WHERE liked = 1 ORDER BY COALESCE(liked_date, saved_at) DESC").map_err(|e| format!("liked songs query failed: {e}"))?;
    let rows = statement.query_map([], |row| Ok(YtItem {
        id: row.get(0)?, kind: row.get(1)?, title: row.get(2)?, subtitle: row.get(3)?, thumbnail: row.get(4)?, artists: Vec::new(), browse_id: row.get(5)?, playlist_id: row.get(6)?, video_id: row.get(7)?, set_video_id: row.get(8)?, play_playlist_id: None, play_video_id: None, params: None, explicit: row.get::<_, i64>(9)? != 0, music_video_type: row.get(10)?,
        history_remove_token: None,
        album_id: None,
        album_title: None,
    })).map_err(|e| format!("liked songs rows failed: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("liked songs row decode failed: {e}"))
}

#[tauri::command]
fn library_uploaded_songs(state: tauri::State<'_, RuntimeState>) -> Result<Vec<YtItem>, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    let mut statement = db.prepare("SELECT id, kind, title, subtitle, thumbnail, browse_id, playlist_id, video_id, set_video_id, explicit, music_video_type FROM songs WHERE uploaded = 1 ORDER BY saved_at DESC").map_err(|e| format!("uploaded songs query failed: {e}"))?;
    let rows = statement.query_map([], |row| Ok(YtItem {
        id: row.get(0)?, kind: row.get(1)?, title: row.get(2)?, subtitle: row.get(3)?, thumbnail: row.get(4)?, artists: Vec::new(), browse_id: row.get(5)?, playlist_id: row.get(6)?, video_id: row.get(7)?, set_video_id: row.get(8)?, play_playlist_id: None, play_video_id: None, params: None, explicit: row.get::<_, i64>(9)? != 0, music_video_type: row.get(10)?,
        history_remove_token: None,
        album_id: None,
        album_title: None,
    })).map_err(|e| format!("uploaded song rows failed: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("uploaded song row decode failed: {e}"))
}

#[tauri::command]
fn library_albums(state: tauri::State<'_, RuntimeState>) -> Result<Vec<YtItem>, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    let mut statement = db.prepare("SELECT a.id, a.title, a.thumbnail, a.playlist_id, COUNT(sa.song_id) FROM albums a INNER JOIN song_albums sa ON sa.album_id = a.id INNER JOIN songs s ON s.id = sa.song_id WHERE s.in_library = 1 GROUP BY a.id, a.title, a.thumbnail, a.playlist_id ORDER BY a.saved_at DESC").map_err(|error| format!("albums query failed: {error}"))?;
    let rows = statement.query_map([], |row| Ok(YtItem {
        id: row.get(0)?, kind: "album".to_owned(), title: row.get(1)?, subtitle: format!("{} songs", row.get::<_, i64>(4)?), thumbnail: row.get(2)?, artists: Vec::new(), browse_id: row.get(0)?, playlist_id: row.get(3)?, video_id: None, set_video_id: None, play_playlist_id: row.get(3)?, play_video_id: None, params: None, explicit: false, music_video_type: None, history_remove_token: None, album_id: Some(row.get(0)?), album_title: None,
    })).map_err(|error| format!("albums rows failed: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| format!("album row decode failed: {error}"))
}

#[tauri::command]
fn library_artists(state: tauri::State<'_, RuntimeState>) -> Result<Vec<YtItem>, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    let mut statement = db.prepare("SELECT a.id, a.name, a.thumbnail, a.channel_id, COUNT(CASE WHEN s.in_library = 1 THEN sa.song_id END) FROM artists a LEFT JOIN song_artists sa ON sa.artist_id = a.id LEFT JOIN songs s ON s.id = sa.song_id WHERE a.bookmarked_at IS NOT NULL OR s.in_library = 1 GROUP BY a.id, a.name, a.thumbnail, a.channel_id ORDER BY a.bookmarked_at DESC, a.saved_at DESC").map_err(|error| format!("artists query failed: {error}"))?;
    let rows = statement.query_map([], |row| Ok(YtItem {
        id: row.get(0)?, kind: "artist".to_owned(), title: row.get(1)?, subtitle: format!("{} songs", row.get::<_, i64>(4)?), thumbnail: row.get(2)?, artists: Vec::new(), browse_id: row.get(0)?, playlist_id: None, video_id: None, set_video_id: None, play_playlist_id: None, play_video_id: None, params: None, explicit: false, music_video_type: None, history_remove_token: None, album_id: None, album_title: None,
    })).map_err(|error| format!("artists rows failed: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| format!("artist row decode failed: {error}"))
}

#[tauri::command]
fn library_playlists(state: tauri::State<'_, RuntimeState>) -> Result<Vec<LibraryPlaylistItem>, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    let mut statement = db.prepare("SELECT p.id, p.title, p.subtitle, p.thumbnail, p.kind, p.saved_at, COUNT(ps.song_id) FROM playlists p LEFT JOIN playlist_songs ps ON ps.playlist_id = p.id GROUP BY p.id, p.title, p.subtitle, p.thumbnail, p.kind, p.saved_at ORDER BY p.saved_at DESC").map_err(|e| format!("playlists query failed: {e}"))?;
    let rows = statement.query_map([], |row| Ok(LibraryPlaylistItem {
        item: YtItem {
            id: row.get(0)?, kind: row.get(4)?, title: row.get(1)?, subtitle: row.get(2)?, thumbnail: row.get(3)?, artists: Vec::new(), browse_id: Some(row.get(0)?), playlist_id: Some(row.get(0)?), video_id: None, set_video_id: None, play_playlist_id: Some(row.get(0)?), play_video_id: None, params: None, explicit: false, music_video_type: None,
            history_remove_token: None,
            album_id: None,
            album_title: None,
        },
        saved_at: row.get(5)?,
        song_count: row.get(6)?,
    })).map_err(|e| format!("playlists rows failed: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("playlist row decode failed: {e}"))
}

#[tauri::command]
fn library_artist_state(artist_id: String, state: tauri::State<'_, RuntimeState>) -> Result<bool, String> {
    let artist_id = artist_id.trim();
    if artist_id.is_empty() { return Err("artist id is empty".to_owned()); }
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    db.query_row("SELECT EXISTS(SELECT 1 FROM artists WHERE id = ?1 AND bookmarked_at IS NOT NULL)", params![artist_id], |row| row.get::<_, bool>(0)).map_err(|error| format!("artist bookmark state failed: {error}"))
}

#[tauri::command]
async fn library_toggle_artist_bookmarked(artist_id: String, name: String, thumbnail: Option<String>, channel_id: Option<String>, bookmarked: bool, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let artist_id = artist_id.trim();
    let name = name.trim();
    if artist_id.is_empty() || name.is_empty() { return Err("artist id or name is empty".to_owned()); }
    let channel_id = channel_id.as_deref().map(str::trim).filter(|value| value.starts_with("UC") && value.len() > 2).map(str::to_owned);
    {
        let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
        db.execute("INSERT INTO artists (id, name, thumbnail, channel_id, bookmarked_at, podcast_channel, saved_at) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6) ON CONFLICT(id) DO UPDATE SET name=excluded.name, thumbnail=excluded.thumbnail, channel_id=COALESCE(excluded.channel_id, artists.channel_id), bookmarked_at=excluded.bookmarked_at, saved_at=excluded.saved_at", params![artist_id, name, thumbnail, channel_id, if bookmarked { Some(now_seconds()) } else { None }, now_seconds()]).map_err(|error| format!("artist bookmark save failed: {error}"))?;
    }
    if let Some(channel_id) = channel_id {
        if let Some(session) = auth_session(&state)? {
            let endpoint = if bookmarked { "subscription/subscribe" } else { "subscription/unsubscribe" };
            post(endpoint, json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)), "channelIds": [channel_id] }), Some(&session)).await?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn ytm_refresh_saved_podcasts(state: tauri::State<'_, RuntimeState>) -> Result<i64, String> {
    let ids = {
        let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
        let mut statement = db.prepare("SELECT id FROM podcasts WHERE bookmarked_at IS NOT NULL ORDER BY bookmarked_at DESC").map_err(|error| format!("saved podcast refresh query failed: {error}"))?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0)).map_err(|error| format!("saved podcast refresh rows failed: {error}"))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|error| format!("saved podcast refresh ids failed: {error}"))?
    };
    if ids.is_empty() { return Ok(0); }
    let Some(session) = auth_session(&state)? else { return Ok(0); };
    let visitor_data = visitor(&state).await?;
    let mut refreshed = 0i64;
    for id in ids {
        let response = post("browse", json!({ "context": context(&visitor_data, true, Some(&session.data_sync_id)), "browseId": id }), Some(&session)).await?;
        let page = parse_detail(&response, "podcast", Some(&id));
        let serialized = serde_json::to_string(&page).map_err(|error| format!("podcast detail encode failed: {error}"))?;
        let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
        db.execute("UPDATE podcasts SET title=CASE WHEN ?1 <> '' THEN ?1 ELSE title END, author=CASE WHEN ?2 <> '' THEN ?2 ELSE author END, thumbnail=COALESCE(?3, thumbnail), detail_json=?4, saved_at=?5 WHERE id=?6", params![page.title, page.subtitle, page.thumbnail, serialized, now_seconds(), id]).map_err(|error| format!("podcast detail refresh save failed: {error}"))?;
        refreshed += 1;
    }
    Ok(refreshed)
}

#[tauri::command]
async fn ytm_toggle_episode_saved(video_id: String, saved: bool, set_video_id: Option<String>, item: Option<YtItem>, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let video_id = video_id.trim();
    if video_id.is_empty() { return Err("episode video id is empty".to_owned()); }
    let session = auth_session(&state)?.ok_or_else(|| "Google/YouTube Music account session is not connected".to_owned())?;
    let action = if saved {
        json!({ "action": "ACTION_ADD_VIDEO", "addedVideoId": video_id })
    } else {
        let set_video_id = set_video_id.as_deref().map(str::trim).filter(|value| !value.is_empty()).ok_or_else(|| "Saved Episode removal requires the source setVideoId".to_owned())?;
        json!({ "action": "ACTION_REMOVE_VIDEO", "setVideoId": set_video_id, "removedVideoId": video_id })
    };
    post("browse/edit_playlist", json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)), "playlistId": "SE", "actions": [action] }), Some(&session)).await?;
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    if saved {
        if let Some(item) = item {
            let is_video = item.music_video_type.as_deref().is_some_and(|value| value != "MUSIC_VIDEO_TYPE_ATV");
            db.execute(
                "INSERT INTO songs (id, title, subtitle, thumbnail, browse_id, playlist_id, video_id, set_video_id, kind, saved_at, explicit, music_video_type, liked, liked_date, in_library, is_video, album_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, NULL, 1, ?13, ?14)
                 ON CONFLICT(id) DO UPDATE SET title=excluded.title, subtitle=excluded.subtitle, thumbnail=excluded.thumbnail, browse_id=excluded.browse_id, playlist_id=excluded.playlist_id, video_id=excluded.video_id, set_video_id=excluded.set_video_id, kind=excluded.kind, saved_at=excluded.saved_at, explicit=excluded.explicit, music_video_type=excluded.music_video_type, in_library=1, is_video=excluded.is_video, album_id=excluded.album_id",
                params![item.id, item.title, item.subtitle, item.thumbnail, item.browse_id, Some("SE"), item.video_id, item.set_video_id, item.kind, now_seconds(), if item.explicit { 1 } else { 0 }, item.music_video_type, if is_video { 1 } else { 0 }, item.album_id],
            ).map_err(|error| format!("saved episode state failed: {error}"))?;
        } else {
            db.execute("UPDATE songs SET in_library = 1 WHERE id = ?1 OR video_id = ?1", params![video_id]).map_err(|error| format!("saved episode state update failed: {error}"))?;
        }
    } else {
        db.execute("UPDATE songs SET in_library = 0 WHERE id = ?1 OR video_id = ?1", params![video_id]).map_err(|error| format!("saved episode state removal failed: {error}"))?;
        db.execute("DELETE FROM songs WHERE (id = ?1 OR video_id = ?1) AND in_library = 0 AND liked = 0 AND youtube_liked = 0 AND NOT EXISTS (SELECT 1 FROM playlist_songs WHERE playlist_songs.song_id = songs.id)", params![video_id]).map_err(|error| format!("saved episode cleanup failed: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
async fn ytm_toggle_podcast_saved(podcast_id: String, saved: bool, title: String, author: Option<String>, thumbnail: Option<String>, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let podcast_id = podcast_id.trim();
    let playlist_id = podcast_id.strip_prefix("MPSP").unwrap_or(podcast_id).trim();
    if podcast_id.is_empty() || playlist_id.is_empty() { return Err("podcast playlist id is empty".to_owned()); }
    let session = auth_session(&state)?.ok_or_else(|| "Google/YouTube Music account session is not connected".to_owned())?;
    let endpoint = if saved { "like/like" } else { "like/removelike" };
    post(endpoint, json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)), "target": { "playlistId": playlist_id } }), Some(&session)).await?;
    let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
    db.execute(
        "INSERT INTO podcasts (id, title, author, thumbnail, bookmarked_at, saved_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, author=excluded.author, thumbnail=excluded.thumbnail, bookmarked_at=excluded.bookmarked_at, saved_at=excluded.saved_at",
        params![podcast_id, title.trim(), author.as_deref().map(str::trim).filter(|value| !value.is_empty()), thumbnail, if saved { Some(now_seconds()) } else { None }, now_seconds()],
    ).map_err(|error| format!("podcast state save failed: {error}"))?;
    Ok(())
}

#[tauri::command]
async fn ytm_add_to_playlist(playlist_id: String, video_id: String, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let playlist_id = playlist_id.trim().trim_start_matches("VL");
    let video_id = video_id.trim();
    if playlist_id.is_empty() || video_id.is_empty() { return Err("playlist or video id is empty".to_owned()); }
    let session = auth_session(&state)?.ok_or_else(|| "Google/YouTube Music account session is not connected".to_owned())?;
    post("browse/edit_playlist", json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)), "playlistId": playlist_id, "actions": [{ "action": "ACTION_ADD_VIDEO", "addedVideoId": video_id }] }), Some(&session)).await?;
    Ok(())
}

#[tauri::command]
async fn ytm_remove_from_playlist(playlist_id: String, video_id: String, set_video_id: String, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let playlist_id = playlist_id.trim().trim_start_matches("VL");
    let video_id = video_id.trim();
    let set_video_id = set_video_id.trim();
    if playlist_id.is_empty() || video_id.is_empty() || set_video_id.is_empty() { return Err("playlist, video, or setVideoId is empty".to_owned()); }
    let session = auth_session(&state)?.ok_or_else(|| "Google/YouTube Music account session is not connected".to_owned())?;
    post("browse/edit_playlist", json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)), "playlistId": playlist_id, "actions": [{ "action": "ACTION_REMOVE_VIDEO", "setVideoId": set_video_id, "removedVideoId": video_id }] }), Some(&session)).await?;
    Ok(())
}

#[tauri::command]
async fn ytm_create_playlist(title: String, state: tauri::State<'_, RuntimeState>) -> Result<YtItem, String> {
    let title = title.trim();
    if title.is_empty() { return Err("playlist title is empty".to_owned()); }
    let session = auth_session(&state)?.ok_or_else(|| "Google/YouTube Music account session is not connected".to_owned())?;
    let response = post("playlist/create", json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)), "title": title }), Some(&session)).await?;
    let playlist_id = response.get("playlistId").and_then(Value::as_str).filter(|value| !value.is_empty()).ok_or_else(|| "YouTube Music create playlist returned no playlistId".to_owned())?.to_owned();
    let item = YtItem { id: playlist_id.clone(), kind: "playlist".to_owned(), title: title.to_owned(), subtitle: "YouTube Music playlist".to_owned(), thumbnail: None, artists: Vec::new(), browse_id: Some(playlist_id.clone()), playlist_id: Some(playlist_id.clone()), video_id: None, set_video_id: None, play_playlist_id: Some(playlist_id.clone()), play_video_id: None, params: None, explicit: false, music_video_type: None, history_remove_token: None, album_id: None, album_title: None };
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    db.execute("INSERT INTO playlists (id, title, subtitle, thumbnail, kind, saved_at, source) VALUES (?1, ?2, ?3, NULL, 'playlist', ?4, 'youtube') ON CONFLICT(id) DO UPDATE SET title=excluded.title, subtitle=excluded.subtitle, saved_at=excluded.saved_at, source='youtube'", params![playlist_id, title, item.subtitle, now_seconds()]).map_err(|error| format!("YouTube playlist save failed: {error}"))?;
    Ok(item)
}

#[tauri::command]
fn library_create_playlist(title: String, state: tauri::State<'_, RuntimeState>) -> Result<YtItem, String> {
    let title = title.trim();
    if title.is_empty() { return Err("playlist title is empty".to_owned()); }
    let id = format!("LOCAL_{}", now_millis());
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    db.execute("INSERT INTO playlists (id, title, subtitle, thumbnail, kind, saved_at) VALUES (?1, ?2, 'Local playlist', NULL, 'playlist', ?3)", params![id, title, now_seconds()]).map_err(|e| format!("playlist create failed: {e}"))?;
    Ok(YtItem { id: id.clone(), kind: "playlist".to_owned(), title: title.to_owned(), subtitle: "Local playlist".to_owned(), thumbnail: None, artists: Vec::new(), browse_id: Some(id.clone()), playlist_id: Some(id.clone()), video_id: None, set_video_id: None, play_playlist_id: Some(id), play_video_id: None, params: None, explicit: false, music_video_type: None, history_remove_token: None, album_id: None, album_title: None })
}

#[tauri::command]
fn library_add_to_playlist(playlist_id: String, item: YtItem, state: tauri::State<'_, RuntimeState>) -> Result<bool, String> {
    let playlist_id = playlist_id.trim();
    if playlist_id.is_empty() || item.id.trim().is_empty() { return Err("playlist or item id is empty".to_owned()); }
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    let already_present: bool = db.query_row("SELECT EXISTS(SELECT 1 FROM playlist_songs WHERE playlist_id = ?1 AND song_id = ?2)", params![playlist_id, item.id], |row| row.get(0)).map_err(|e| format!("playlist duplicate check failed: {e}"))?;
    if already_present { return Ok(false); }
    db.execute("INSERT INTO songs (id, title, subtitle, thumbnail, browse_id, playlist_id, video_id, set_video_id, kind, saved_at, explicit, music_video_type, in_library, is_video) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, ?13) ON CONFLICT(id) DO UPDATE SET title=excluded.title, subtitle=excluded.subtitle, thumbnail=excluded.thumbnail, browse_id=excluded.browse_id, playlist_id=excluded.playlist_id, video_id=excluded.video_id, set_video_id=excluded.set_video_id, kind=excluded.kind, explicit=excluded.explicit, music_video_type=excluded.music_video_type, is_video=excluded.is_video", params![item.id, item.title, item.subtitle, item.thumbnail, item.browse_id, item.playlist_id, item.video_id, item.set_video_id, item.kind, now_seconds(), if item.explicit { 1 } else { 0 }, item.music_video_type, if item.music_video_type.as_deref().is_some_and(|v| v != "MUSIC_VIDEO_TYPE_ATV") { 1 } else { 0 }]).map_err(|e| format!("playlist song save failed: {e}"))?;
    let position: i64 = db.query_row("SELECT COALESCE(MAX(position) + 1, 0) FROM playlist_songs WHERE playlist_id = ?1", params![playlist_id], |row| row.get(0)).map_err(|e| format!("playlist position failed: {e}"))?;
    db.execute("INSERT OR REPLACE INTO playlist_songs (playlist_id, position, song_id) VALUES (?1, ?2, ?3)", params![playlist_id, position, item.id]).map_err(|e| format!("playlist add failed: {e}"))?;
    Ok(true)
}

#[tauri::command]
fn library_remove_from_playlist(playlist_id: String, song_id: String, state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    db.execute("DELETE FROM playlist_songs WHERE playlist_id = ?1 AND song_id = ?2", params![playlist_id, song_id]).map_err(|error| format!("playlist removal failed: {error}"))?;
    Ok(())
}

#[tauri::command]
fn library_playlist_songs(playlist_id: String, state: tauri::State<'_, RuntimeState>) -> Result<Vec<YtItem>, String> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    let mut statement = db.prepare("SELECT s.id, s.kind, s.title, s.subtitle, s.thumbnail, s.browse_id, s.playlist_id, s.video_id, s.set_video_id, s.explicit, s.music_video_type FROM playlist_songs ps INNER JOIN songs s ON s.id = ps.song_id WHERE ps.playlist_id = ?1 ORDER BY ps.position ASC").map_err(|e| format!("playlist songs query failed: {e}"))?;
    let rows = statement.query_map(params![playlist_id], |row| Ok(YtItem {
        id: row.get(0)?, kind: row.get(1)?, title: row.get(2)?, subtitle: row.get(3)?, thumbnail: row.get(4)?, artists: Vec::new(), browse_id: row.get(5)?, playlist_id: row.get(6)?, video_id: row.get(7)?, set_video_id: row.get(8)?, play_playlist_id: None, play_video_id: None, params: None, explicit: row.get::<_, i64>(9)? != 0, music_video_type: row.get(10)?,
        history_remove_token: None,
        album_id: None,
        album_title: None,
    })).map_err(|e| format!("playlist songs rows failed: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("playlist songs row decode failed: {e}"))
}


#[tauri::command]
fn clear_guest_session(state: tauri::State<'_, RuntimeState>) -> Result<(), String> {
    *state.visitor_data.lock().map_err(|_| "visitor state poisoned")? = None;
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    db.execute("DELETE FROM settings WHERE key IN ('visitorData', 'dataSyncId', 'cookie', 'accountName', 'accountEmail', 'accountChannelHandle', 'accountAvatar')", []).map_err(|e| format!("guest session storage clear failed: {e}"))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(RuntimeState::new())
        .plugin(tauri_plugin_taskbar::init())
        .invoke_handler(tauri::generate_handler![ytm_history, ytm_remove_from_history, spotify_profile, spotify_library_node, spotify_playlists, spotify_playlist_tracks, spotify_remove_from_playlist, spotify_move_in_playlist, spotify_rename_playlist, spotify_liked_tracks, spotify_search_tracks, spotify_match_for_youtube, spotify_override_youtube, spotify_resolve_youtube, spotify_add_to_playlist, ytm_delete_uploaded_song, ytm_refetch, ytm_podcast_episodes, ytm_toggle_episode_saved, local_files_pick, library_local_files, library_downloads, library_player_cache, ytm_toggle_podcast_saved, download_start, download_info, download_cancel, download_remove, player_cache_remove, ytm_podcast_channels, library_saved_podcasts, ytm_refresh_saved_podcasts, library_downloaded_podcasts, library_albums, library_artists, ytm_home, ytm_home_continuation, ytm_search, ytm_search_continuation, sync_youtube_library, ytm_add_to_playlist, ytm_remove_from_playlist, ytm_create_playlist, ytm_playlist, ytm_playlist_continuation, ytm_browse, ytm_browse_continuation, ytm_detail, ytm_detail_continuation, ytm_podcast_cache_detail_page, ytm_next, ytm_related, ytm_queue_continuation, ytm_player, history_add, history_record_playtime, history_items, history_clear, library_top_songs, library_stats, search_history_add, search_history_items, search_history_clear, ytm_toggle_like, fetch_lyrics, fetch_lyrics_fresh, fetch_lyrics_from_provider, library_toggle_liked, library_edit_item, library_refetch_item, ytm_toggle_library, settings_get, settings_set, backup_create, backup_restore, library_save_item, library_remove_item, library_songs, library_mix_songs, library_liked_songs, library_uploaded_songs, library_playlists, library_create_playlist, library_add_to_playlist, library_remove_from_playlist, library_playlist_songs, library_item_state, library_artist_state, library_toggle_artist_bookmarked, speed_dial_toggle, speed_dial_items, open_google_login, account_save_session, account_logout, clear_local_library_keep_downloads, session_status, clear_guest_session, open_spotify_login, spotify_session_status, spotify_logout])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn direct_audio_quality_selects_supported_high_or_low_format() {
        let response = json!({
            "playabilityStatus": { "status": "OK" },
            "videoDetails": { "title": "Quality", "author": "Artist", "lengthSeconds": "10" },
            "streamingData": {
                "expiresInSeconds": 60,
                "adaptiveFormats": [
                    { "mimeType": "audio/mp4; codecs=\\\"mp4a.40.2\\\"", "bitrate": 100000, "url": "https://example.test/low" },
                    { "mimeType": "audio/webm; codecs=\\\"opus\\\"", "bitrate": 120000, "url": "https://example.test/high" },
                    { "mimeType": "audio/mp4", "bitrate": 320000, "signatureCipher": "cipher", "url": "https://example.test/rejected" }
                ]
            }
        });
        let high = parse_direct_audio(&response, "video", "high").expect("high format");
        assert_eq!(high.stream_url, "https://example.test/high");
        let auto = parse_direct_audio(&response, "video", "auto").expect("auto format");
        assert_eq!(auto.stream_url, high.stream_url);
        let low = parse_direct_audio(&response, "video", "low").expect("low format");
        assert_eq!(low.stream_url, "https://example.test/low");
    }

    #[test]
    fn partial_download_resume_requires_nonempty_file_and_206() {
        assert!(can_resume_partial_download(1024, reqwest::StatusCode::PARTIAL_CONTENT));
        assert!(!can_resume_partial_download(0, reqwest::StatusCode::PARTIAL_CONTENT));
        assert!(!can_resume_partial_download(1024, reqwest::StatusCode::OK));
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
        let song = |title: &str| json!({
            "musicResponsiveListItemRenderer": {
                "playlistItemData": { "videoId": format!("{title}-id") },
                "flexColumns": [
                    { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [{ "text": title }] } } },
                    { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [{ "text": "Uploaded" }] } } }
                ]
            }
        });
        let response = json!({
            "contents": { "singleColumnBrowseResultsRenderer": { "tabs": [
                { "tabRenderer": { "content": { "sectionListRenderer": { "contents": [{ "musicShelfRenderer": { "contents": [song("Library Song")] } }] } } } },
                { "tabRenderer": { "content": { "sectionListRenderer": { "contents": [{ "musicShelfRenderer": { "contents": [song("Uploaded Song")] } }] } } } }
            ] } }
        });
        let (library, _) = parse_library_page(&response, 0);
        let (uploaded, _) = parse_library_page(&response, 1);
        assert_eq!(library.first().map(|item| item.title.as_str()), Some("Library Song"));
        assert_eq!(uploaded.first().map(|item| item.title.as_str()), Some("Uploaded Song"));
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
        assert_eq!(clean_lyrics_title("Song Name (Official Video) (feat. Guest)"), "Song Name");
        assert_eq!(clean_lyrics_title("Song Name [Lyrics]"), "Song Name");
    }

    #[test]
    fn lrclib_similarity_and_duration_use_source_thresholds() {
        assert!(lyrics_similarity("Song Name", "song name") > 0.99);
        assert!(lyrics_similarity("Song Name", "Different") < 0.6);
        let track = LrcLibTrack { track_name: "Song".to_owned(), artist_name: "Artist".to_owned(), duration: 201.6, plain_lyrics: None, synced_lyrics: Some("[00:01.00]line".to_owned()) };
        assert_eq!(duration_delta(&track, 202), 0);
        assert!(duration_delta(&track, 207) <= 5);
        assert!(duration_delta(&track, 208) > 5);
    }

    #[test]
    fn paxsenix_title_cleanup_and_content_parser_match_source_shape() {
        assert_eq!(paxsenix_clean_title("Song (Official Video)"), "Song");
        let content = json!([{ "timestamp": 1250, "text": [{ "text": "Hello" }, { "text": "world" }] }]);
        assert_eq!(paxsenix_content_to_lrc(&content).as_deref(), Some("[00:01.25]Hello world"));
    }

    #[test]
    fn musixmatch_response_paths_are_source_named() {
        let value = json!({ "message": { "body": { "macro_calls": { "track.subtitles.get": { "message": { "body": { "subtitle_list": [{ "subtitle": { "subtitle_body": "[00:01.00]Line" } }] } } } } } } });
        assert_eq!(value.pointer("/message/body/macro_calls/track.subtitles.get/message/body/subtitle_list/0/subtitle/subtitle_body").and_then(Value::as_str), Some("[00:01.00]Line"));
    }

    #[test]
    fn lyrics_credit_filter_matches_source_prefix_rules() {
        let filtered = filter_lyrics_credit_lines("[00:01.00]synced by someone\n[00:02.00]Real line\n{bg}lyrics by someone");
        assert_eq!(filtered, "[00:02.00]Real line");
    }

    #[test]
    fn kugou_normalize_keeps_lrc_and_cuts_credit_lines() {
        let normalized = kugou_normalize_lrc("[00:00.00]作词: Someone\n[00:01.00]Real line\n[00:02.00]Next line");
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
        let candidates = spotify_hash_candidates("profileAttributes").expect("profileAttributes must be registered");
        assert_eq!(candidates.len(), 2);
        assert_ne!(candidates[0], candidates[1]);
        assert_eq!(candidates[0], "08ffb4730af3746e04a8301396f20875dbbce10c75243803091a9274eacc8ac0");
    }

    #[test]
    fn spotify_totp_matches_rfc6238_vector() {
        assert_eq!(spotify_totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59), "287082");
    }

    #[test]
    fn spotify_base32_ignores_padding() {
        assert_eq!(base32_decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ="), base32_decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"));
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
        assert_eq!(page.items[0].browse_id.as_deref(), Some("FEmusic_moods_and_genres"));
    }

    #[test]
    fn remote_history_parser_preserves_shelf_sections_and_song_metadata() {
        let song = |title: &str, video_id: &str| json!({
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
        });
        let response = json!({
            "contents": { "singleColumnBrowseResultsRenderer": { "tabs": [{ "tabRenderer": { "content": { "sectionListRenderer": { "contents": [
                { "musicShelfRenderer": { "title": { "runs": [{ "text": "Today" }] }, "contents": [song("First", "first-id"), song("Second", "second-id")] } },
                { "musicShelfRenderer": { "title": { "runs": [{ "text": "Yesterday" }] }, "contents": [song("Old", "old-id")] } }
            ] } } } }] } }
        });
        let page = parse_remote_history(&response);
        assert_eq!(page.sections.len(), 2);
        assert_eq!(page.sections[0].title, "Today");
        assert_eq!(page.sections[0].songs[1].video_id.as_deref(), Some("second-id"));
        assert_eq!(page.sections[0].songs[0].history_remove_token.as_deref(), Some("remove-token"));
        assert_eq!(page.sections[0].songs[0].album_id.as_deref(), Some("album-id"));
        assert_eq!(page.sections[0].songs[0].album_title.as_deref(), Some("Album"));
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
        let (name, email, handle, avatar) = account_info_from_response(&response).expect("account header must parse");
        assert_eq!(name, "Meld User");
        assert_eq!(email.as_deref(), Some("user@example.com"));
        assert_eq!(handle.as_deref(), Some("@melduser"));
        assert_eq!(avatar.as_deref(), Some("https://example.invalid/avatar-large"));
    }
}
