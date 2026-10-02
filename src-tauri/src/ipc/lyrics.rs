//! IPC commands: Lyrics providers (S5-003; owner `lyrics` in docs/ipc-commands.md)
#![allow(unused_imports)]

use crate::*;

#[tauri::command]
#[specta::specta]
pub async fn fetch_lyrics(
    title: Text,
    artist: Text,
    duration: i32,
    album: Opt<Text>,
    id: Opt<LibraryId>,
    state: tauri::State<'_, RuntimeState>,
    request_id: Opt<Token>,
) -> IpcResult<LyricsPayload> {
    cancellable(
        request_id.into_string(),
        "Lyrics lookup",
        fetch_lyrics_body(title, artist, duration, album, id, state),
    )
    .await
}

async fn fetch_lyrics_body(
    title: Text,
    artist: Text,
    duration: i32,
    album: Opt<Text>,
    id: Opt<LibraryId>,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<LyricsPayload> {
    let title = title.into_inner();
    let artist = artist.into_inner();
    let album = album.into_string();
    let id = id.into_string();
    match timeout(
        Duration::from_secs(30),
        fetch_lyrics_inner(title, artist, duration, album, id, state, true),
    )
    .await
    {
        Ok(result) => Ok(result?),
        Err(_) => Err(IpcError::from(
            "Lyrics providers timed out after 30 seconds".to_owned(),
        )),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn fetch_lyrics_fresh(
    title: Text,
    artist: Text,
    duration: i32,
    album: Opt<Text>,
    id: Opt<LibraryId>,
    state: tauri::State<'_, RuntimeState>,
    request_id: Opt<Token>,
) -> IpcResult<LyricsPayload> {
    cancellable(
        request_id.into_string(),
        "Lyrics lookup",
        fetch_lyrics_fresh_body(title, artist, duration, album, id, state),
    )
    .await
}

async fn fetch_lyrics_fresh_body(
    title: Text,
    artist: Text,
    duration: i32,
    album: Opt<Text>,
    id: Opt<LibraryId>,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<LyricsPayload> {
    let title = title.into_inner();
    let artist = artist.into_inner();
    let album = album.into_string();
    let id = id.into_string();
    match timeout(
        Duration::from_secs(30),
        fetch_lyrics_inner(title, artist, duration, album, id, state, false),
    )
    .await
    {
        Ok(result) => Ok(result?),
        Err(_) => Err(IpcError::from(
            "Lyrics providers timed out after 30 seconds".to_owned(),
        )),
    }
}

#[tauri::command]
#[specta::specta]
#[allow(clippy::too_many_arguments)] // Tauri maps named JS arguments; a struct would change the IPC shape
pub async fn fetch_lyrics_from_provider(
    title: Text,
    artist: Text,
    duration: i32,
    album: Opt<Text>,
    id: Opt<LibraryId>,
    provider: Keyword,
    state: tauri::State<'_, RuntimeState>,
    request_id: Opt<Token>,
) -> IpcResult<LyricsPayload> {
    cancellable(
        request_id.into_string(),
        "Lyrics lookup",
        fetch_lyrics_from_provider_body(title, artist, duration, album, id, provider, state),
    )
    .await
}

async fn fetch_lyrics_from_provider_body(
    title: Text,
    artist: Text,
    duration: i32,
    album: Opt<Text>,
    id: Opt<LibraryId>,
    provider: Keyword,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<LyricsPayload> {
    let title = title.into_inner();
    let artist = artist.into_inner();
    let album = album.into_string();
    let id = id.into_string();
    let provider = provider.into_inner();
    const PROVIDERS: [&str; 8] = [
        "BetterLyrics",
        "Paxsenix",
        "LrcLib",
        "KuGou",
        "LyricsPlus",
        "Musixmatch",
        "YouTubeSubtitle",
        "YouTube",
    ];
    let provider = provider.trim();
    if !PROVIDERS.contains(&provider) {
        return Err(IpcError::from(format!(
            "unsupported lyrics provider: {provider}"
        )));
    }
    let cleaned_title = clean_lyrics_title(&title);
    let cleaned_artist = clean_lyrics_artist(&artist);
    let album_name = album
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let cache_id = format!(
        "lyrics:{}:{}",
        cleaned_title.to_lowercase(),
        cleaned_artist.to_lowercase()
    );
    {
        let db = state
            .db
            .lock()
            .map_err(|_| "database state poisoned".to_owned())?;
        if let Some(cached) = cached_lyrics_provider(&db, &cache_id, provider)? {
            return Ok(cached);
        }
    }
    let payload = timeout(
        Duration::from_secs(30),
        fetch_lyrics_provider(
            provider,
            &cleaned_title,
            &cleaned_artist,
            duration,
            album_name,
            id.as_deref(),
            &state,
        ),
    )
    .await
    .map_err(|_| "Lyrics provider timed out after 30 seconds".to_owned())??
    .ok_or_else(|| format!("{provider} did not return lyrics for this song"))?;
    let db = state
        .db
        .lock()
        .map_err(|_| "database state poisoned".to_owned())?;
    cache_lyrics_payload(&db, &cache_id, &payload)?;
    Ok(payload)
}
