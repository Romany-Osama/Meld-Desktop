//! IPC commands: Stream resolution, queue continuation and the playback cache (S5-003; owner `player` in docs/ipc-commands.md)
#![allow(unused_imports)]

use crate::*;

/// Called by the player when the audio element could not use the resolved stream (PLAY-030). A local
/// player-cache file is dropped so the next resolve fetches fresh; a remote stream marks its client as
/// failed for five minutes so the next resolve uses another client.
#[tauri::command]
pub fn ytm_report_stream_failure(
    video_id: String,
    stream_url: String,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<()> {
    let id = video_id.trim();
    if id.is_empty() {
        return Ok(());
    }
    if stream_url.starts_with("https://") {
        let mut memory = resolver_memory()
            .lock()
            .map_err(|_| "resolver state poisoned".to_owned())?;
        if let Some(client) = memory.last_client(id) {
            memory.mark_failed(id, client, std::time::Instant::now());
        }
        return Ok(());
    }
    let db = state
        .db
        .lock()
        .map_err(|_| "database state poisoned".to_owned())?;
    let cached: Option<String> = db
        .query_row(
            "SELECT path FROM player_cache WHERE song_id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("player cache path read failed: {error}"))?;
    if let Some(path) = cached.filter(|path| path == &stream_url) {
        let _ = fs::remove_file(&path);
        db.execute("DELETE FROM player_cache WHERE song_id = ?1", params![id])
            .map_err(|error| format!("player cache removal failed: {error}"))?;
    }
    Ok(())
}

/// Copyable, redacted report of the last resolution for a song (PLAY-006).
#[tauri::command]
pub fn ytm_playback_report(video_id: String) -> IpcResult<String> {
    let id = video_id.trim();
    let attempts = resolver_attempts()
        .lock()
        .map_err(|_| "resolver state poisoned".to_owned())?
        .get(id)
        .cloned()
        .unwrap_or_default();
    let mut lines = vec![
        format!("Meld Desktop {} playback report", env!("CARGO_PKG_VERSION")),
        format!("Solver: yt-dlp EJS {}", ytjs::EJS_VERSION),
    ];
    if attempts.is_empty() {
        lines.push("No failed attempts recorded for this song.".to_owned());
    }
    for attempt in attempts {
        lines.push(format!(
            "- {}: {} ({})",
            attempt.client,
            attempt.category.label(),
            attempt.detail
        ));
    }
    Ok(lines.join("\n"))
}

#[tauri::command]
pub async fn ytm_next(
    video_id: String,
    playlist_id: Option<String>,
    set_video_id: Option<String>,
    index: Option<i32>,
    params: Option<String>,
    continuation: Option<String>,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<QueuePage> {
    let visitor_data = visitor(&state).await?;
    let session = auth_session(&state)?;
    let data_sync_id = session.as_ref().map(|value| value.data_sync_id.as_str());
    let body = json!({ "context": context(&visitor_data, session.is_some(), data_sync_id), "videoId": video_id, "playlistId": playlist_id, "playlistSetVideoId": set_video_id, "index": index, "params": params, "continuation": continuation });
    let response = post("next", body, session.as_ref()).await?;
    Ok(parse_queue(&response))
}

#[tauri::command]
pub async fn ytm_related(
    browse_id: String,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<Vec<YtItem>> {
    let id = browse_id.trim();
    if id.is_empty() {
        return Err(IpcError::from("related browse id is empty".to_owned()));
    }
    let visitor_data = visitor(&state).await?;
    let request_session = browse_session(&state, auth_session(&state)?)?;
    let data_sync_id = request_session
        .as_ref()
        .map(|value| value.data_sync_id.as_str());
    let response = post("browse", json!({ "context": context(&visitor_data, request_session.is_some(), data_sync_id), "browseId": id }), request_session.as_ref()).await?;
    Ok(parse_related(&response))
}

#[tauri::command]
pub async fn ytm_queue_continuation(
    continuation: String,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<QueuePage> {
    let token = continuation.trim();
    if token.is_empty() {
        return Err(IpcError::from("queue continuation is empty".to_owned()));
    }
    let visitor_data = visitor(&state).await?;
    let session = auth_session(&state)?;
    let data_sync_id = session.as_ref().map(|value| value.data_sync_id.as_str());
    let response = post("next", json!({ "context": context(&visitor_data, session.is_some(), data_sync_id), "continuation": token }), session.as_ref()).await?;
    Ok(parse_queue(&response))
}

#[tauri::command]
pub fn player_cache_usage(state: tauri::State<'_, RuntimeState>) -> IpcResult<PlayerCacheUsage> {
    let db = state
        .db
        .lock()
        .map_err(|_| "database state poisoned".to_owned())?;
    let (bytes, songs) = db
        .query_row(
            "SELECT COALESCE(SUM(bytes), 0), COUNT(*) FROM player_cache",
            [],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
        )
        .map_err(|error| format!("player cache usage failed: {error}"))?;
    Ok(PlayerCacheUsage {
        bytes,
        songs,
        limit_mb: player_cache_limit_mb(&db),
    })
}

/// Empties the playback cache. Offline downloads are not touched.
#[tauri::command]
pub fn player_cache_clear(state: tauri::State<'_, RuntimeState>) -> IpcResult<usize> {
    if let Ok(jobs) = player_cache_jobs().lock() {
        jobs.cancel_all();
    }
    let db = state
        .db
        .lock()
        .map_err(|_| "database state poisoned".to_owned())?;
    let paths: Vec<(String, String)> = db
        .prepare("SELECT song_id, path FROM player_cache")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
                .collect()
        })
        .map_err(|error| format!("player cache read failed: {error}"))?;
    let mut removed = 0;
    for (song_id, path) in paths {
        let gone = match fs::remove_file(&path) {
            Ok(()) => true,
            Err(error) => error.kind() == std::io::ErrorKind::NotFound,
        };
        if gone {
            db.execute(
                "DELETE FROM player_cache WHERE song_id = ?1",
                params![song_id],
            )
            .map_err(|error| format!("player cache removal failed: {error}"))?;
            removed += 1;
        }
    }
    Ok(removed)
}

#[tauri::command]
pub fn library_player_cache(state: tauri::State<'_, RuntimeState>) -> IpcResult<Vec<YtItem>> {
    let db = state
        .db
        .lock()
        .map_err(|_| "database state poisoned".to_owned())?;
    let mut statement = db.prepare("SELECT s.id, s.kind, s.title, s.subtitle, s.thumbnail, s.browse_id, s.playlist_id, s.video_id, s.set_video_id, s.explicit, s.music_video_type, pc.path FROM player_cache pc INNER JOIN songs s ON s.id = pc.song_id WHERE pc.bytes > 0 AND NOT EXISTS (SELECT 1 FROM downloads d WHERE d.song_id = pc.song_id AND d.state = 'completed') ORDER BY pc.cached_at DESC").map_err(|error| format!("player cache query failed: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                YtItem {
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
                    play_playlist_id: None,
                    play_video_id: None,
                    params: None,
                    explicit: row.get::<_, i64>(9)? != 0,
                    music_video_type: row.get(10)?,
                    history_remove_token: None,
                    album_id: None,
                    album_title: None,
                },
                row.get::<_, String>(11)?,
            ))
        })
        .map_err(|error| format!("player cache rows failed: {error}"))?;
    let mut items = Vec::new();
    for row in rows {
        let (item, path) =
            row.map_err(|error| format!("player cache row decode failed: {error}"))?;
        if Path::new(&path).is_file() {
            items.push(item);
        } else {
            let _ = db.execute(
                "DELETE FROM player_cache WHERE song_id = ?1",
                params![item.id],
            );
        }
    }
    Ok(items)
}

#[tauri::command]
pub fn player_cache_remove(
    song_id: String,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<()> {
    let id = song_id.trim();
    if id.is_empty() {
        return Err(IpcError::from("player cache song id is empty".to_owned()));
    }
    if let Ok(jobs) = player_cache_jobs().lock() {
        jobs.cancel(id);
    }
    player_cache_blocked()
        .lock()
        .map_err(|_| "player cache state poisoned".to_owned())?
        .insert(id.to_owned());
    let db = state
        .db
        .lock()
        .map_err(|_| "database state poisoned".to_owned())?;
    if let Some(path) = db
        .query_row(
            "SELECT path FROM player_cache WHERE song_id = ?1",
            params![id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("player cache path read failed: {error}"))?
    {
        let _ = fs::remove_file(path);
        let _ = fs::remove_file(format!("{}.part", player_cache_path(id).to_string_lossy()));
    }
    db.execute("DELETE FROM player_cache WHERE song_id = ?1", params![id])
        .map_err(|error| format!("player cache removal failed: {error}"))?;
    Ok(())
}

#[tauri::command]
pub async fn ytm_player(
    video_id: String,
    playlist_id: Option<String>,
    audio_quality: Option<String>,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<PlayerPayload> {
    let id = video_id.trim().to_owned();
    if id.is_empty() {
        return Err(IpcError::from("video id is empty".to_owned()));
    }
    let requested_quality = normalize_audio_quality(audio_quality.as_deref());
    player_cache_blocked()
        .lock()
        .map_err(|_| "player cache state poisoned".to_owned())?
        .remove(&id);
    let (cached, cache_limit_mb) = {
        let db = state
            .db
            .lock()
            .map_err(|_| "database state poisoned".to_owned())?;
        (
            cached_player_file(&db, &id, requested_quality)?,
            player_cache_limit_mb(&db),
        )
    };
    if let Some(path) = cached {
        // Playing from the cache counts as a use for least-recently-used eviction.
        if let Ok(db) = state.db.lock() {
            let _ = db.execute(
                "UPDATE player_cache SET cached_at = ?1 WHERE song_id = ?2",
                params![now_seconds(), id],
            );
        }
        return Ok(PlayerPayload {
            video_id: id,
            title: None,
            artist: None,
            stream_url: path,
            mime_type: "audio/mpeg".to_owned(),
            bitrate: 0,
            expires_in_seconds: 0,
            duration: 0,
            source_client: None,
        });
    }
    let payload =
        resolve_player_payload(&id, playlist_id.as_deref(), requested_quality, &state).await?;
    let cache_url = payload.stream_url.clone();
    let cache_id = id.clone();
    let cache_path = player_cache_path(&cache_id);
    let started = if cache_limit_mb == 0 {
        // The user turned the playback cache off.
        player_cache::Start::Busy
    } else {
        player_cache_jobs()
            .lock()
            .map_err(|_| "player cache state poisoned".to_owned())?
            .start(&cache_id)
    };
    if let player_cache::Start::Started(cancel) = started {
        tokio::spawn(async move {
            let part_path = PathBuf::from(format!("{}.part", cache_path.to_string_lossy()));
            let result: Result<(), String> = async {
                let bytes = player_cache::fill(http(), &cache_url, &part_path, &cancel, STALL_TIMEOUT, TRANSFER_TIMEOUT).await?;
                if player_cache_is_blocked(&cache_id) { return Err("player cache was removed".to_owned()); }
                fs::rename(&part_path, &cache_path).map_err(|error| format!("player cache finalize failed: {error}"))?;
                if player_cache_is_blocked(&cache_id) { let _ = fs::remove_file(&cache_path); return Err("player cache was removed".to_owned()); }
                let db = Connection::open(database_path()).map_err(|error| format!("player cache database open failed: {error}"))?;
                db.execute("INSERT INTO player_cache (song_id, path, bytes, cached_at, quality) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(song_id) DO UPDATE SET path=excluded.path, bytes=excluded.bytes, cached_at=excluded.cached_at, quality=excluded.quality", params![cache_id, cache_path.to_string_lossy().to_string(), bytes, now_seconds(), requested_quality]).map_err(|error| format!("player cache state write failed: {error}"))?;
                enforce_player_cache_quota(&db)?;
                Ok(())
            }.await;
            if result.is_err() {
                let _ = fs::remove_file(&part_path);
            }
            if let Ok(mut jobs) = player_cache_jobs().lock() {
                jobs.finish(&cache_id);
            }
        });
    }
    Ok(payload)
}
