//! IPC commands: YouTube Music browse, search, detail pages and search history (S5-003; owner `catalog` in docs/ipc-commands.md)
#![allow(unused_imports)]

use crate::*;

#[tauri::command]
pub async fn ytm_refetch(
    video_id: String,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<Option<YtItem>> {
    let id = video_id.trim();
    if id.is_empty() {
        return Err(IpcError::from("refetch video id is empty".to_owned()));
    }
    let visitor_data = visitor(&state).await?;
    let session = auth_session(&state)?;
    let data_sync_id = session.as_ref().map(|value| value.data_sync_id.as_str());
    let response = post("music/get_queue", json!({ "context": context(&visitor_data, session.is_some(), data_sync_id), "videoIds": [id], "playlistId": Value::Null }), session.as_ref()).await?;
    Ok(parse_get_queue(&response).into_iter().next())
}

#[tauri::command]
pub async fn ytm_browse(
    browse_id: String,
    params: Option<String>,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<DetailPage> {
    let id = browse_id.trim();
    if id.is_empty() {
        return Err(IpcError::from("browse id is empty".to_owned()));
    }
    let visitor_data = visitor(&state).await?;
    let request_session = browse_session(&state, auth_session(&state)?)?;
    let data_sync_id = request_session
        .as_ref()
        .map(|value| value.data_sync_id.as_str());
    let mut body = json!({ "context": context(&visitor_data, request_session.is_some(), data_sync_id), "browseId": id });
    if let Some(value) = params.filter(|value| !value.trim().is_empty()) {
        body["params"] = json!(value);
    }
    let response = post("browse", body, request_session.as_ref()).await?;
    Ok(parse_browse_response(&response, id))
}

#[tauri::command]
pub async fn ytm_browse_continuation(
    browse_id: String,
    continuation: String,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<DetailPage> {
    let id = browse_id.trim();
    let token = continuation.trim();
    if id.is_empty() || token.is_empty() {
        return Err(IpcError::from(
            "browse continuation arguments are empty".to_owned(),
        ));
    }
    let visitor_data = visitor(&state).await?;
    let request_session = browse_session(&state, auth_session(&state)?)?;
    let data_sync_id = request_session
        .as_ref()
        .map(|value| value.data_sync_id.as_str());
    let response = post("browse", json!({ "context": context(&visitor_data, request_session.is_some(), data_sync_id), "continuation": token }), request_session.as_ref()).await?;
    Ok(parse_browse_response(&response, id))
}

#[tauri::command]
pub async fn ytm_detail(
    kind: String,
    browse_id: String,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<DetailPage> {
    let id = browse_id.trim();
    if id.is_empty() {
        return Err(IpcError::from("detail browse id is empty".to_owned()));
    }
    let normalized_kind = kind.trim().to_lowercase();
    if !matches!(normalized_kind.as_str(), "album" | "artist" | "podcast") {
        return Err(IpcError::invalid(format!(
            "unsupported detail kind: {normalized_kind}"
        )));
    }
    let cached_podcast_detail = if normalized_kind == "podcast" {
        let db = state
            .db
            .lock()
            .map_err(|_| "database state poisoned".to_owned())?;
        db.query_row(
            "SELECT detail_json FROM podcasts WHERE id = ?1 AND detail_json IS NOT NULL",
            params![id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("podcast detail cache read failed: {error}"))?
    } else {
        None
    };
    if auth_session(&state)?.is_none() {
        if let Some(serialized) = cached_podcast_detail.as_deref() {
            return Ok(serde_json::from_str(serialized)
                .map_err(|error| format!("cached podcast detail decode failed: {error}"))?);
        }
    }
    let visitor_data = visitor(&state).await?;
    let session = auth_session(&state)?;
    let data_sync_id = session.as_ref().map(|value| value.data_sync_id.as_str());
    let response = match post("browse", json!({ "context": context(&visitor_data, session.is_some(), data_sync_id), "browseId": id }), session.as_ref()).await {
        Ok(response) => response,
        Err(error) => {
            if let Some(serialized) = cached_podcast_detail.as_deref() {
                return Ok(serde_json::from_str(serialized).map_err(|decode_error| format!("cached podcast detail decode failed after network error: {decode_error}"))?);
            }
            return Err(IpcError::from(error));
        }
    };
    let page = parse_detail(&response, &normalized_kind, Some(id));
    if normalized_kind == "podcast" {
        if let Ok(serialized) = serde_json::to_string(&page) {
            if let Ok(db) = state.db.lock() {
                let _ = db.execute(
                    "UPDATE podcasts SET detail_json = ?1 WHERE id = ?2",
                    params![serialized, id],
                );
            }
        }
    }
    Ok(page)
}

#[tauri::command]
pub async fn ytm_home(state: tauri::State<'_, RuntimeState>) -> IpcResult<HomePage> {
    let visitor_data = visitor(&state).await?;
    let request_session = browse_session(&state, auth_session(&state)?)?;
    let data_sync_id = request_session
        .as_ref()
        .map(|value| value.data_sync_id.as_str());
    let response = match post("browse", json!({ "context": context(&visitor_data, request_session.is_some(), data_sync_id), "browseId": "FEmusic_home" }), request_session.as_ref()).await {
        Ok(response) => response,
        Err(error) => return cached_home(&state).map_or(Err(IpcError::from(error)), |mut page| { page.continuation = None; Ok(page) }),
    };
    let page = parse_home(&response);
    if !page.sections.is_empty() {
        save_home_cache(&state, &page);
    }
    Ok(page)
}

#[tauri::command]
pub async fn ytm_home_continuation(
    continuation: String,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<HomePage> {
    let token = continuation.trim();
    if token.is_empty() {
        return Err(IpcError::from("home continuation is empty".to_owned()));
    }
    let visitor_data = visitor(&state).await?;
    let request_session = browse_session(&state, auth_session(&state)?)?;
    let data_sync_id = request_session
        .as_ref()
        .map(|value| value.data_sync_id.as_str());
    let response = post("browse", json!({ "context": context(&visitor_data, request_session.is_some(), data_sync_id), "continuation": token }), request_session.as_ref()).await?;
    Ok(parse_home_continuation(&response))
}

#[tauri::command]
pub async fn ytm_search(
    query: String,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<SearchPage> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(SearchPage {
            items: Vec::new(),
            continuation: None,
        });
    }
    let visitor_data = visitor(&state).await?;
    let request_session = browse_session(&state, auth_session(&state)?)?;
    let data_sync_id = request_session
        .as_ref()
        .map(|value| value.data_sync_id.as_str());
    let response = post("search", json!({ "context": context(&visitor_data, request_session.is_some(), data_sync_id), "query": trimmed }), request_session.as_ref()).await?;
    Ok(parse_search(&response))
}

#[tauri::command]
pub async fn ytm_search_continuation(
    continuation: String,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<SearchPage> {
    let token = continuation.trim();
    if token.is_empty() {
        return Err(IpcError::from("search continuation is empty".to_owned()));
    }
    let visitor_data = visitor(&state).await?;
    let request_session = browse_session(&state, auth_session(&state)?)?;
    let data_sync_id = request_session
        .as_ref()
        .map(|value| value.data_sync_id.as_str());
    let response = post_with_query(
        "search",
        json!({ "context": context(&visitor_data, request_session.is_some(), data_sync_id) }),
        request_session.as_ref(),
        &[("continuation", token), ("ctoken", token)],
    )
    .await?;
    Ok(parse_search_continuation(&response))
}

#[tauri::command]
pub async fn ytm_detail_continuation(
    kind: String,
    continuation: String,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<DetailPage> {
    let normalized_kind = kind.trim().to_lowercase();
    if !matches!(normalized_kind.as_str(), "album" | "artist" | "podcast") {
        return Err(IpcError::invalid(format!(
            "unsupported detail kind: {normalized_kind}"
        )));
    }
    let token = continuation.trim();
    if token.is_empty() {
        return Err(IpcError::from("detail continuation is empty".to_owned()));
    }
    let visitor_data = visitor(&state).await?;
    let request_session = browse_session(&state, auth_session(&state)?)?;
    let data_sync_id = request_session
        .as_ref()
        .map(|value| value.data_sync_id.as_str());
    let response = post("browse", json!({ "context": context(&visitor_data, request_session.is_some(), data_sync_id), "continuation": token }), request_session.as_ref()).await?;
    Ok(parse_detail(&response, &normalized_kind, None))
}

#[tauri::command]
pub fn ytm_podcast_cache_detail_page(
    browse_id: String,
    page: DetailPage,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<()> {
    let id = browse_id.trim();
    if id.is_empty() {
        return Err(IpcError::from("podcast browse id is empty".to_owned()));
    }
    if page.kind != "podcast" {
        return Err(IpcError::from(
            "podcast detail cache received a non-podcast page".to_owned(),
        ));
    }
    let db = state
        .db
        .lock()
        .map_err(|_| "database state poisoned".to_owned())?;
    let cached = db
        .query_row(
            "SELECT detail_json FROM podcasts WHERE id = ?1 AND detail_json IS NOT NULL",
            params![id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("podcast detail cache read failed: {error}"))?;
    let Some(serialized) = cached else {
        return Ok(());
    };
    let mut merged: DetailPage = serde_json::from_str(&serialized)
        .map_err(|error| format!("cached podcast detail decode failed: {error}"))?;
    let mut seen = merged
        .items
        .iter()
        .map(|item| item.id.clone())
        .collect::<std::collections::HashSet<_>>();
    for item in page.items {
        if seen.insert(item.id.clone()) {
            merged.items.push(item);
        }
    }
    if !page.title.is_empty() {
        merged.title = page.title;
    }
    if !page.subtitle.is_empty() {
        merged.subtitle = page.subtitle;
    }
    if page.thumbnail.is_some() {
        merged.thumbnail = page.thumbnail;
    }
    merged.continuation = page.continuation;
    merged.browse_id = Some(id.to_owned());
    let updated = serde_json::to_string(&merged)
        .map_err(|error| format!("podcast detail cache encode failed: {error}"))?;
    db.execute(
        "UPDATE podcasts SET detail_json = ?1 WHERE id = ?2",
        params![updated, id],
    )
    .map_err(|error| format!("podcast detail cache write failed: {error}"))?;
    Ok(())
}

#[tauri::command]
pub async fn ytm_playlist(
    playlist_id: String,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<PlaylistPage> {
    let id = playlist_id.trim_start_matches("VL").to_owned();
    if id.is_empty() {
        return Err(IpcError::from("playlist id is empty".to_owned()));
    }
    let visitor_data = visitor(&state).await?;
    let request_session = browse_session(&state, auth_session(&state)?)?;
    let data_sync_id = request_session
        .as_ref()
        .map(|value| value.data_sync_id.as_str());
    let response = post("browse", json!({ "context": context(&visitor_data, request_session.is_some(), data_sync_id), "browseId": format!("VL{id}") }), request_session.as_ref()).await?;
    Ok(parse_playlist(&response, &id))
}

#[tauri::command]
pub async fn ytm_playlist_continuation(
    continuation: String,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<PlaylistContinuationPage> {
    let token = continuation.trim();
    if token.is_empty() {
        return Err(IpcError::from("playlist continuation is empty".to_owned()));
    }
    let visitor_data = visitor(&state).await?;
    let request_session = browse_session(&state, auth_session(&state)?)?;
    let data_sync_id = request_session
        .as_ref()
        .map(|value| value.data_sync_id.as_str());
    let response = post("browse", json!({ "context": context(&visitor_data, request_session.is_some(), data_sync_id), "continuation": token }), request_session.as_ref()).await?;
    Ok(parse_playlist_continuation(&response))
}

#[tauri::command]
pub fn search_history_add(query: String, state: tauri::State<'_, RuntimeState>) -> IpcResult<()> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(());
    }
    let db = state
        .db
        .lock()
        .map_err(|_| "database state poisoned".to_owned())?;
    db.execute("INSERT INTO search_history (query, searched_at) VALUES (?1, ?2) ON CONFLICT(query) DO UPDATE SET searched_at=excluded.searched_at", params![query, now_seconds()]).map_err(|error| format!("search history write failed: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn search_history_items(state: tauri::State<'_, RuntimeState>) -> IpcResult<Vec<String>> {
    let db = state
        .db
        .lock()
        .map_err(|_| "database state poisoned".to_owned())?;
    let mut statement = db
        .prepare("SELECT query FROM search_history ORDER BY searched_at DESC, id DESC LIMIT 20")
        .map_err(|error| format!("search history query failed: {error}"))?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("search history rows failed: {error}"))?;
    Ok(rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("search history row decode failed: {error}"))?)
}

#[tauri::command]
pub fn search_history_clear(state: tauri::State<'_, RuntimeState>) -> IpcResult<()> {
    let db = state
        .db
        .lock()
        .map_err(|_| "database state poisoned".to_owned())?;
    db.execute("DELETE FROM search_history", [])
        .map_err(|error| format!("search history clear failed: {error}"))?;
    Ok(())
}
