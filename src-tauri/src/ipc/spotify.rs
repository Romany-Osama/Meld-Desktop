//! IPC commands: Spotify library, playlists and Spotify-to-YouTube matching (S5-003; owner `spotify` in docs/ipc-commands.md)
#![allow(unused_imports)]

use crate::*;

#[tauri::command]
pub async fn spotify_playlist_tracks(
    playlist_id: SpotifyId,
    offset: Option<i64>,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<SpotifyTrackPage> {
    let playlist_id = playlist_id.into_inner();
    let playlist_id = playlist_id.trim();
    if playlist_id.is_empty() {
        return Err(IpcError::from("Spotify playlist id is required".to_owned()));
    }
    let token = spotify_token(&state)?;
    let offset = offset.unwrap_or(0).max(0);
    let limit = 100_i64;
    let variables = json!({ "uri": format!("spotify:playlist:{playlist_id}"), "offset": offset, "limit": limit, "enableWatchFeedEntrypoint": false });
    let response = spotify_graphql_post("fetchPlaylist", variables, &token).await?;
    let total_count = response
        .pointer("/data/playlistV2/content/totalCount")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    Ok(SpotifyTrackPage {
        tracks: parse_spotify_playlist_tracks(&response),
        total_count,
        offset,
        limit,
    })
}

#[tauri::command]
pub async fn spotify_remove_from_playlist(
    playlist_id: SpotifyId,
    uid: SpotifyId,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<()> {
    let playlist_id = playlist_id.into_inner();
    let uid = uid.into_inner();
    let playlist_id = playlist_id.trim();
    let uid = uid.trim();
    if playlist_id.is_empty() || uid.is_empty() {
        return Err(IpcError::from(
            "Spotify playlist or track uid is empty".to_owned(),
        ));
    }
    let token = spotify_token(&state)?;
    let variables =
        json!({ "playlistUri": format!("spotify:playlist:{playlist_id}"), "uids": [uid] });
    spotify_graphql_post("removeFromPlaylist", variables, &token).await?;
    Ok(())
}

#[tauri::command]
pub async fn spotify_move_in_playlist(
    playlist_id: SpotifyId,
    uids: Vec<SpotifyId>,
    before_uid: Opt<SpotifyId>,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<()> {
    let playlist_id = playlist_id.into_inner();
    if uids.len() > MAX_LIST_ARGUMENT {
        return Err(IpcError::invalid("uids list is too long"));
    }
    let uids: Vec<String> = uids.into_iter().map(String::from).collect();
    let before_uid = before_uid.into_string();
    let playlist_id = playlist_id.trim();
    let uids: Vec<String> = uids
        .into_iter()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .collect();
    if playlist_id.is_empty() || uids.is_empty() {
        return Err(IpcError::from(
            "Spotify playlist id and item uid are required".to_owned(),
        ));
    }
    let token = spotify_token(&state)?;
    let variables = json!({ "playlistUri": format!("spotify:playlist:{playlist_id}"), "uids": uids, "newPosition": { "moveType": if before_uid.is_some() { "BEFORE_UID" } else { "BOTTOM_OF_PLAYLIST" }, "fromUid": before_uid } });
    spotify_graphql_post("moveItemsInPlaylist", variables, &token).await?;
    Ok(())
}

#[tauri::command]
pub async fn spotify_rename_playlist(
    playlist_id: SpotifyId,
    new_name: Name,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<()> {
    let playlist_id = playlist_id.into_inner();
    let new_name = new_name.into_inner();
    let playlist_id = playlist_id.trim();
    let new_name = new_name.trim();
    if playlist_id.is_empty() || new_name.is_empty() {
        return Err(IpcError::from(
            "Spotify playlist id and name are required".to_owned(),
        ));
    }
    let token = spotify_token(&state)?;
    let variables =
        json!({ "playlistUri": format!("spotify:playlist:{playlist_id}"), "newName": new_name });
    spotify_graphql_post("editPlaylistAttributes", variables, &token).await?;
    Ok(())
}

#[tauri::command]
pub async fn spotify_liked_tracks(
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<SpotifyLikedTracks> {
    let token = spotify_token(&state)?;
    let response = spotify_graphql_post(
        "fetchLibraryTracks",
        json!({ "offset": 0, "limit": 100 }),
        &token,
    )
    .await?;
    Ok(parse_spotify_liked_tracks(&response))
}

#[tauri::command]
pub async fn spotify_library_node(
    folder_uri: Opt<SpotifyUri>,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<SpotifyLibraryNode> {
    let folder_uri = folder_uri.into_string();
    let token = spotify_token(&state)?;
    let variables = json!({ "filters": ["Playlists"], "order": Value::Null, "textFilter": "", "features": ["LIKED_SONGS", "YOUR_EPISODES_V2", "PRERELEASES", "EVENTS"], "limit": 100, "offset": 0, "flatten": false, "expandedFolders": [], "folderUri": folder_uri, "includeFoldersWhenFlattening": true });
    let response = spotify_graphql_post("libraryV3", variables, &token).await?;
    Ok(parse_spotify_library_node(&response))
}

#[tauri::command]
pub async fn spotify_playlists(
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<Vec<SpotifyPlaylistItem>> {
    let token = spotify_token(&state)?;
    let variables = json!({ "filters": ["Playlists"], "order": Value::Null, "textFilter": "", "features": ["LIKED_SONGS", "YOUR_EPISODES_V2", "PRERELEASES", "EVENTS"], "limit": 50, "offset": 0, "flatten": true, "expandedFolders": [], "folderUri": Value::Null, "includeFoldersWhenFlattening": false });
    let response = spotify_graphql_post("libraryV3", variables, &token).await?;
    Ok(spotify_playlist_items(&response))
}

#[tauri::command]
pub fn spotify_match_for_youtube(
    youtube_id: VideoId,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<Option<SpotifyTrackMatch>> {
    let youtube_id = youtube_id.into_inner();
    let db = state
        .db
        .lock()
        .map_err(|_| "database state poisoned".to_owned())?;
    Ok(db
        .query_row(
            "SELECT spotify_id, title, artist FROM spotify_match WHERE youtube_id = ?1 LIMIT 1",
            params![youtube_id.trim()],
            spotify_match_from_row,
        )
        .optional()
        .map_err(|error| format!("Spotify match lookup failed: {error}"))?)
}

#[tauri::command]
pub fn spotify_override_youtube(
    spotify_id: LibraryId,
    youtube_id: VideoId,
    title: Text,
    artist: Text,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<()> {
    let spotify_id = spotify_id.into_inner();
    let youtube_id = youtube_id.into_inner();
    let title = title.into_inner();
    let artist = artist.into_inner();
    let spotify_id = spotify_id.trim();
    let youtube_id = youtube_id.trim();
    if spotify_id.is_empty() || youtube_id.is_empty() {
        return Err(IpcError::from(
            "Spotify or YouTube match ID is empty".to_owned(),
        ));
    }
    let db = state
        .db
        .lock()
        .map_err(|_| "database state poisoned".to_owned())?;
    db.execute("INSERT INTO spotify_match (spotify_id, youtube_id, title, artist, match_score, cached_at, is_manual_override) VALUES (?1, ?2, ?3, ?4, 1.0, ?5, 1) ON CONFLICT(spotify_id) DO UPDATE SET youtube_id=excluded.youtube_id, title=excluded.title, artist=excluded.artist, match_score=1.0, cached_at=excluded.cached_at, is_manual_override=1", params![spotify_id, youtube_id, title.trim(), artist.trim(), now_millis()]).map_err(|error| format!("Spotify manual match save failed: {error}"))?;
    Ok(())
}

#[tauri::command]
pub async fn spotify_resolve_youtube(
    youtube_id: Opt<VideoId>,
    title: Text,
    artist: Text,
    duration_sec: i64,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<Option<SpotifyTrackMatch>> {
    let youtube_id = youtube_id.into_string();
    let title = title.into_inner();
    let artist = artist.into_inner();
    if let Some(youtube_id) = youtube_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if let Some(cached) =
            spotify_match_for_youtube(VideoId::parse(youtube_id.to_owned())?, state.clone())?
        {
            return Ok(Some(cached));
        }
    }
    let token = spotify_token(&state)?;
    let query = if artist.trim().is_empty() {
        title.trim().to_owned()
    } else {
        format!("{} {}", artist.trim(), title.trim())
    };
    let candidates = spotify_search_track_matches(&query, &token).await?;
    let normalized_title = spotify_normalize(title.trim());
    let normalized_artist = spotify_normalize(artist.trim());
    let spotify_duration_ms = if duration_sec > 0 {
        duration_sec * 1000
    } else {
        0
    };
    let mut best: Option<(f64, SpotifyTrackMatch)> = None;
    for candidate in candidates {
        let title_score =
            spotify_bigram_similarity(&normalized_title, &spotify_normalize(&candidate.name));
        let artist_score =
            spotify_bigram_similarity(&normalized_artist, &spotify_normalize(&candidate.artist));
        // A matching artist alone must not be enough: the title has to resemble the candidate too.
        if title_score < 0.5 {
            continue;
        }
        let score = title_score * 0.45
            + artist_score * 0.35
            + spotify_duration_score(spotify_duration_ms, candidate.duration_ms) * 0.20;
        if best.as_ref().is_none_or(|(current, _)| score > *current) {
            best = Some((score, candidate));
        }
    }
    let Some((score, candidate)) = best.filter(|(score, _)| *score >= 0.35) else {
        return Ok(None);
    };
    if let Some(youtube_id) = youtube_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let db = state
            .db
            .lock()
            .map_err(|_| "database state poisoned".to_owned())?;
        persist_spotify_match(
            &db,
            &candidate.id,
            youtube_id,
            &candidate.name,
            &candidate.artist,
            score,
            false,
        )?;
    }
    Ok(Some(candidate))
}

#[tauri::command]
pub async fn spotify_add_to_playlist(
    playlist_id: SpotifyId,
    track_uri: SpotifyUri,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<()> {
    let playlist_id = playlist_id.into_inner();
    let track_uri = track_uri.into_inner();
    let playlist_id = playlist_id.trim();
    let track_uri = track_uri.trim();
    if playlist_id.is_empty() || track_uri.is_empty() {
        return Err(IpcError::from(
            "Spotify playlist or track URI is empty".to_owned(),
        ));
    }
    let token = spotify_token(&state)?;
    let variables = json!({ "playlistUri": format!("spotify:playlist:{playlist_id}"), "playlistItemUris": [track_uri], "newPosition": { "moveType": "BOTTOM_OF_PLAYLIST", "fromUid": Value::Null } });
    spotify_graphql_post("addToPlaylist", variables, &token).await?;
    Ok(())
}

#[tauri::command]
pub async fn spotify_profile(state: tauri::State<'_, RuntimeState>) -> IpcResult<SpotifyProfile> {
    let token = spotify_token(&state)?;
    let response = spotify_graphql_post("profileAttributes", json!({}), &token).await?;
    let profile = response
        .pointer("/data/me/profile")
        .ok_or_else(|| "Spotify profileAttributes response had no profile".to_owned())?;
    let uri = profile
        .get("uri")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let id = uri
        .rsplit(':')
        .next()
        .filter(|value| !value.is_empty())
        .unwrap_or(uri)
        .to_owned();
    if id.is_empty() {
        return Err(IpcError::from("Spotify profile id was empty".to_owned()));
    }
    Ok(SpotifyProfile {
        id,
        display_name: profile
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_owned),
        avatar: profile
            .pointer("/avatar/sources/0/url")
            .and_then(Value::as_str)
            .map(str::to_owned),
    })
}
