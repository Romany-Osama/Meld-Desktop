//! IPC commands: Offline downloads (S5-003; owner `downloads` in docs/ipc-commands.md)
#![allow(unused_imports)]

use crate::*;

#[tauri::command]
pub fn download_info(
    song_id: LibraryId,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<Option<DownloadInfo>> {
    let song_id = song_id.into_inner();
    let id = song_id.trim();
    let db = state
        .db
        .lock()
        .map_err(|_| "database state poisoned".to_owned())?;
    let Some(info) = read_download_info(&db, id)? else {
        return Ok(None);
    };
    if info.state == "downloading" && !download_is_active(id) {
        let partial_path = format!("{}.part", info.path);
        let retained_bytes = fs::metadata(&partial_path)
            .map(|metadata| metadata.len() as i64)
            .unwrap_or(info.bytes);
        db.execute(
            "UPDATE downloads SET bytes = ?1, state = 'cancelled', error = ?2 WHERE song_id = ?3",
            params![retained_bytes, "download interrupted; retry to resume", id],
        )
        .map_err(|error| format!("download recovery state failed: {error}"))?;
        return Ok(read_download_info(&db, id)?);
    }
    Ok(Some(info))
}

#[tauri::command]
pub fn download_cancel(song_id: LibraryId) -> IpcResult<()> {
    let song_id = song_id.into_inner();
    let id = song_id.trim();
    if id.is_empty() {
        return Err(IpcError::from("download song id is empty".to_owned()));
    }
    let map = download_cancel_map()
        .lock()
        .map_err(|_| "download cancellation state poisoned".to_owned())?;
    if let Some(flag) = map.get(id) {
        flag.store(true, Ordering::Release);
        Ok(())
    } else {
        Err(IpcError::from(
            "download is not currently active".to_owned(),
        ))
    }
}

#[tauri::command]
pub fn download_remove(song_id: LibraryId, state: tauri::State<'_, RuntimeState>) -> IpcResult<()> {
    let song_id = song_id.into_inner();
    let id = song_id.trim();
    if id.is_empty() {
        return Err(IpcError::from("download song id is empty".to_owned()));
    }
    if download_cancel_map()
        .lock()
        .map_err(|_| "download cancellation state poisoned".to_owned())?
        .contains_key(id)
    {
        return Err(IpcError::from(
            "cancel the active download before removing its cache".to_owned(),
        ));
    }
    let db = state
        .db
        .lock()
        .map_err(|_| "database state poisoned".to_owned())?;
    if let Some(info) = read_download_info(&db, id)? {
        let path = info.path;
        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(format!("{}.part", path));
        if let Some(artwork_path) = info.artwork_path {
            let _ = fs::remove_file(&artwork_path);
            let _ = fs::remove_file(format!("{}.part", artwork_path));
        }
        for extension in ["jpg", "png", "webp", "cover"] {
            let artwork = download_artwork_path(id, extension);
            let _ = fs::remove_file(&artwork);
            let _ = fs::remove_file(format!("{}.part", artwork.to_string_lossy()));
        }
    }
    db.execute("DELETE FROM downloads WHERE song_id = ?1", params![id])
        .map_err(|error| format!("download cache removal failed: {error}"))?;
    Ok(())
}

#[tauri::command]
pub async fn download_start(
    item: YtItem,
    audio_quality: Opt<Keyword>,
    app: tauri::AppHandle,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<()> {
    let audio_quality = audio_quality.into_string();
    let video_id = item
        .video_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "offline download requires a source videoId".to_owned())?;
    let song_id = item.id.trim().to_owned();
    if song_id.is_empty() {
        return Err(IpcError::from(
            "offline download song id is empty".to_owned(),
        ));
    }
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut map = download_cancel_map()
            .lock()
            .map_err(|_| "download cancellation state poisoned".to_owned())?;
        if map.contains_key(&song_id) {
            return Err(IpcError::from("download is already active".to_owned()));
        }
        map.insert(song_id.clone(), cancel.clone());
    }
    let _active_download = ActiveDownloadGuard(song_id.clone());
    let final_path = download_cache_path(&song_id);
    let partial_path = PathBuf::from(format!("{}.part", final_path.to_string_lossy()));
    let existing_partial_bytes = fs::metadata(&partial_path)
        .map(|metadata| metadata.len() as i64)
        .unwrap_or(0);
    if let Some(parent) = final_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("download cache directory failed: {error}"))?;
    }
    let expected_total: Option<i64>;
    {
        let db = state
            .db
            .lock()
            .map_err(|_| "database state poisoned".to_owned())?;
        // The row is the resume manifest (PLAY-055): the size recorded when the partial file was started.
        expected_total = if existing_partial_bytes > 0 {
            db.query_row(
                "SELECT total_bytes FROM downloads WHERE song_id = ?1",
                params![song_id],
                |row| row.get::<_, Option<i64>>(0),
            )
            .optional()
            .map_err(|error| format!("download resume state read failed: {error}"))?
            .flatten()
        } else {
            None
        };
        if let Some(old_artwork) = db
            .query_row(
                "SELECT artwork_path FROM downloads WHERE song_id = ?1",
                params![song_id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map_err(|error| format!("download artwork state read failed: {error}"))?
            .flatten()
        {
            let _ = fs::remove_file(old_artwork);
        }
        db.execute("INSERT INTO songs (id, title, subtitle, thumbnail, browse_id, playlist_id, video_id, set_video_id, kind, saved_at, explicit, music_video_type, liked, liked_date, in_library, is_video, uploaded, youtube_liked, album_id, duration) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, NULL, 0, 0, 0, 0, ?13, ?14) ON CONFLICT(id) DO UPDATE SET title=excluded.title, subtitle=excluded.subtitle, thumbnail=excluded.thumbnail, video_id=excluded.video_id, set_video_id=excluded.set_video_id, kind=excluded.kind, album_id=excluded.album_id, duration=excluded.duration", params![song_id, item.title, item.subtitle, item.thumbnail, item.browse_id, item.playlist_id, item.video_id, item.set_video_id, item.kind, now_seconds(), if item.explicit { 1 } else { 0 }, item.music_video_type, item.album_id, 0]).map_err(|error| format!("download metadata save failed: {error}"))?;
        db.execute("INSERT INTO downloads (song_id, path, bytes, total_bytes, state, error, lyrics_cached, artwork_path, downloaded_at)
 VALUES (?1, ?2, ?3, NULL, 'downloading', NULL, 0, NULL, ?4) ON CONFLICT(song_id) DO UPDATE SET path=excluded.path, bytes=excluded.bytes, total_bytes=CASE WHEN excluded.bytes > 0 THEN downloads.total_bytes ELSE NULL END, state='downloading', error=NULL, lyrics_cached=0, artwork_path=NULL, downloaded_at=excluded.downloaded_at", params![song_id, final_path.to_string_lossy().to_string(), existing_partial_bytes, now_seconds()]).map_err(|error| format!("download state init failed: {error}"))?;
        if let Some(info) = read_download_info(&db, &song_id)? {
            emit_download(&app, &info);
        }
    }
    let state_for_lyrics = state.clone();
    let result: Result<(i64, Option<i64>, bool, Option<String>), String> = async {
        let quality = normalize_audio_quality(audio_quality.as_deref());
        let mut payload = resolve_player_payload(video_id, item.playlist_id.as_deref(), quality, &state).await?;
        {
            let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
            db.execute("UPDATE songs SET duration = ?1 WHERE id = ?2 AND duration = 0", params![payload.duration, song_id]).map_err(|error| format!("download duration state failed: {error}"))?;
        }
        // The client's default 20s timeout would abort any download that legitimately takes longer (a large
        // file on a slow connection); override it with a generous cap, and catch a truly stalled connection
        // separately below via a per-chunk idle timeout instead. Every request is a range request (like the
        // audio element's), and a URL the media server refuses is re-resolved with another client.
        let mut offset = existing_partial_bytes;
        let mut requests = 0_u8;
        let (response, decision) = loop {
            requests += 1;
            let response = http().get(&payload.stream_url).timeout(TRANSFER_TIMEOUT).header(RANGE, format!("bytes={offset}-")).send().await.map_err(|error| format!("audio cache request failed: {}", resolver::redact(&error.without_url().to_string())))?;
            let status = response.status();
            let content_range = response.headers().get(reqwest::header::CONTENT_RANGE).and_then(|value| value.to_str().ok()).map(str::to_owned);
            let decision = download_resume::resume_decision(offset, status.as_u16(), content_range.as_deref(), expected_total);
            if requests < MAX_STREAM_REQUESTS {
                match download_retry(status, decision) {
                    DownloadRetry::Reresolve => {
                        mark_stream_refused(video_id, payload.source_client.as_deref());
                        payload = resolve_player_payload(video_id, item.playlist_id.as_deref(), quality, &state).await?;
                        continue;
                    }
                    DownloadRetry::Restart => {
                        offset = 0;
                        let _ = fs::remove_file(&partial_path);
                        continue;
                    }
                    DownloadRetry::Proceed => {}
                }
            }
            if !status.is_success() {
                return Err(format!("audio cache response failed: HTTP {status} from {}", payload.source_client.as_deref().unwrap_or("YouTube")));
            }
            if decision == download_resume::Resume::Restart {
                let _ = fs::remove_file(&partial_path);
                return Err("the partial download no longer matches the stream; try again to start over".to_owned());
            }
            break (response, decision);
        };
        let resume = decision == download_resume::Resume::Append;
        if offset > 0 && !resume { let _ = fs::remove_file(&partial_path); }
        let total_bytes = response.content_length().map(|value| value as i64).map(|value| if resume { value + offset } else { value });
        {
            let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
            db.execute("UPDATE downloads SET total_bytes = ?1 WHERE song_id = ?2", params![total_bytes, song_id]).map_err(|error| format!("download size state failed: {error}"))?;
        }
        let bytes = download_resume::write_body(response.bytes_stream(), &partial_path, resume, offset, &cancel, STALL_TIMEOUT, |bytes| {
            let db = state.db.lock().map_err(|_| "database state poisoned".to_owned())?;
            db.execute("UPDATE downloads SET bytes = ?1 WHERE song_id = ?2", params![bytes, song_id]).map_err(|error| format!("download progress state failed: {error}"))?;
            if let Some(info) = read_download_info(&db, &song_id)? { emit_download(&app, &info); }
            Ok(())
        }).await?;
        if !player_cache::transfer_complete(bytes, total_bytes) {
            // The partial file is kept so the next attempt resumes from it.
            return Err(format!("download incomplete: received {bytes} of {} bytes", total_bytes.unwrap_or(0)));
        }
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
    download_cancel_map()
        .lock()
        .map_err(|_| "download cancellation state poisoned".to_owned())?
        .remove(&song_id);
    if let Err(error) = &result {
        let retained_bytes = fs::metadata(&partial_path)
            .map(|metadata| metadata.len() as i64)
            .unwrap_or(0);
        let state_name = if error == download_resume::CANCELLED {
            "cancelled"
        } else {
            "failed"
        };
        let db = state
            .db
            .lock()
            .map_err(|_| "database state poisoned".to_owned())?;
        if let Some(info) = read_download_info(&db, &song_id)? {
            if let Some(artwork_path) = info.artwork_path {
                let _ = fs::remove_file(&artwork_path);
                let _ = fs::remove_file(format!("{}.part", artwork_path));
            }
        }
        db.execute("UPDATE downloads SET bytes = ?1, state = ?2, error = ?3, artwork_path = NULL WHERE song_id = ?4", params![retained_bytes, state_name, error, song_id]).map_err(|db_error| format!("download failure state failed: {db_error}"))?;
        if let Some(info) = read_download_info(&db, &song_id)? {
            emit_download(&app, &info);
        }
    }
    Ok(result.map(|_| ())?)
}

#[tauri::command]
pub fn library_downloads(state: tauri::State<'_, RuntimeState>) -> IpcResult<Vec<LocalItem>> {
    let db = state
        .db
        .lock()
        .map_err(|_| "database state poisoned".to_owned())?;
    let mut statement = db.prepare("SELECT s.id, s.kind, s.title, s.subtitle, s.thumbnail, d.artwork_path, s.video_id, s.set_video_id, s.playlist_id, s.explicit, s.music_video_type, s.album_id, d.path, d.bytes, d.total_bytes, d.lyrics_cached, s.duration FROM downloads d INNER JOIN songs s ON s.id = d.song_id WHERE d.state = 'completed' ORDER BY d.downloaded_at DESC").map_err(|error| format!("downloaded catalog query failed: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            let path: String = row.get(12)?;
            let remote_thumbnail: Option<String> = row.get(4)?;
            let artwork_path: Option<String> = row.get(5)?;
            let thumbnail = artwork_path
                .filter(|value| Path::new(value).is_file())
                .or(remote_thumbnail);
            Ok(LocalItem {
                id: row.get(0)?,
                kind: row.get(1)?,
                title: row.get(2)?,
                subtitle: row.get(3)?,
                thumbnail,
                artists: Vec::new(),
                browse_id: None,
                playlist_id: row.get(8)?,
                video_id: row.get(6)?,
                set_video_id: row.get(7)?,
                play_playlist_id: row.get(8)?,
                play_video_id: row.get(6)?,
                params: None,
                explicit: row.get::<_, i64>(9)? != 0,
                music_video_type: row.get(10)?,
                history_remove_token: None,
                album_id: row.get(11)?,
                album_title: None,
                local_path: path,
                duration: row.get(16)?,
            })
        })
        .map_err(|error| format!("downloaded catalog rows failed: {error}"))?;
    let mut items = Vec::new();
    for row in rows {
        let item = row.map_err(|error| format!("downloaded catalog row decode failed: {error}"))?;
        if Path::new(&item.local_path).is_file() {
            items.push(item);
        }
    }
    Ok(items)
}
