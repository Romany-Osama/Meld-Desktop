//! IPC commands: Google and Spotify sign-in, sessions and sign-out (S5-003; owner `account` in docs/ipc-commands.md)
#![allow(unused_imports)]

use crate::*;

#[tauri::command]
#[specta::specta]
pub async fn account_refresh_profile(
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<SessionStatus> {
    let Some(session) = auth_session(&state)? else {
        return Ok(SessionStatus {
            authenticated: false,
            account_name: None,
            account_email: None,
            account_channel_handle: None,
            account_avatar: None,
        });
    };
    let response = post(
        "account/account_menu",
        json!({ "context": context(&session.visitor_data, true, Some(&session.data_sync_id)) }),
        Some(&session),
    )
    .await?;
    let Some((name, email, channel_handle, avatar)) = account_info_from_response(&response) else {
        return Err(IpcError::from(
            "Google profile refresh returned no active account header".to_owned(),
        ));
    };
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    for (key, value) in [
        ("accountName", name.clone()),
        ("accountEmail", email.clone().unwrap_or_default()),
        (
            "accountChannelHandle",
            channel_handle.clone().unwrap_or_default(),
        ),
        ("accountAvatar", avatar.clone().unwrap_or_default()),
    ] {
        db.execute("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, value]).map_err(|error| format!("Google profile refresh save failed: {error}"))?;
    }
    Ok(SessionStatus {
        authenticated: true,
        account_name: Some(name),
        account_email: email,
        account_channel_handle: channel_handle,
        account_avatar: avatar,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn open_google_login(app: tauri::AppHandle) -> IpcResult<()> {
    if app.get_webview_window("google-login").is_some() {
        return Ok(());
    }
    let start_url: Url =
        "https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fmusic.youtube.com"
            .parse()
            .map_err(|e| format!("Google login URL failed: {e}"))?;
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
                    if raw.is_empty() {
                        // Without this, an eval that resolves quickly (the common case) gives almost no delay
                        // between iterations, so the 120-attempt budget can burn through in well under a second
                        // instead of covering a reasonable real-world window for the page to finish hydrating.
                        tokio::time::sleep(Duration::from_millis(500)).await;
                        continue;
                    }
                    if !raw.is_empty() {
                        let Ok(data) = serde_json::from_str::<Value>(&raw) else { continue; };
                        let Some(visitor_data) = data.get("visitorData").and_then(Value::as_str).filter(|value| !value.is_empty()).map(str::to_owned) else { continue; };
                        let Some(data_sync_id) = data.get("dataSyncId").and_then(Value::as_str).filter(|value| !value.is_empty()).map(str::to_owned) else { continue; };
                        let Ok(cookies) = window.cookies_for_url("https://music.youtube.com/".parse().expect("valid YouTube URL")) else { events::emit_error(&app_handle, events::AppEvent::AccountStatusError, "Google login cookies could not be read".to_owned()); handled_for_task.store(false, Ordering::Release); return; };
                        let cookie_header = cookies.iter().map(|cookie| format!("{}={}", cookie.name(), cookie.value())).collect::<Vec<_>>().join("; ");
                        if cookie_header.is_empty() { events::emit_error(&app_handle, events::AppEvent::AccountStatusError, "Google login returned no session cookies".to_owned()); handled_for_task.store(false, Ordering::Release); return; }
                        let state = app_for_task.state::<RuntimeState>();
                        match save_account_session_internal(cookie_header, data_sync_id, visitor_data, &state).await {
                            Ok(status) => { events::emit(&app_handle, events::AppEvent::AccountStatus, status); let _ = window.destroy(); }
                            Err(error) => { events::emit_error(&app_handle, events::AppEvent::AccountStatusError, error); handled_for_task.store(false, Ordering::Release); }
                        }
                        return;
                    }
                }
                handled_for_task.store(false, Ordering::Release);
                events::emit_error(&app_handle, events::AppEvent::AccountStatusError, "Google login timed out before Meld received the authenticated session".to_owned());
            });
        })
        .build()
        .map_err(|e| format!("Google login window failed: {e}"))?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn spotify_session_status(
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<SpotifySessionStatus> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    let token = secrets::get(&db, "spotifyAccessToken").ok().flatten();
    let expiry =
        setting_value(&db, "spotifyTokenExpiry")?.and_then(|value| value.parse::<i64>().ok());
    Ok(SpotifySessionStatus {
        authenticated: token.as_deref().is_some_and(|value| !value.is_empty())
            && expiry.is_some_and(|value| value > now_millis()),
        token_expiry: expiry,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn open_spotify_login(app: tauri::AppHandle) -> IpcResult<()> {
    if app.get_webview_window("spotify-login").is_some() {
        return Ok(());
    }
    let start_url: Url =
        "https://accounts.spotify.com/login?continue=https%3A%2F%2Fopen.spotify.com%2F"
            .parse()
            .map_err(|e| format!("Spotify login URL failed: {e}"))?;
    let handled = Arc::new(AtomicBool::new(false));
    let app_for_callback = app.clone();
    WebviewWindowBuilder::new(
        &app,
        "spotify-login",
        WebviewUrl::External(start_url.clone()),
    )
    .title("Sign in to Spotify")
    .inner_size(980.0, 760.0)
    .center()
    .on_page_load(move |window, payload| {
        if payload.event() != PageLoadEvent::Finished
            || payload.url().host_str() != Some("open.spotify.com")
            || handled.swap(true, Ordering::AcqRel)
        {
            return;
        }
        let app_handle = app_for_callback.clone();
        let app_for_task = app_for_callback.clone();
        let handled_for_task = Arc::clone(&handled);
        tauri::async_runtime::spawn(async move {
            for _ in 0..120 {
                let Ok(cookies) = window.cookies_for_url(
                    "https://open.spotify.com/"
                        .parse()
                        .expect("valid Spotify URL"),
                ) else {
                    tokio::time::sleep(Duration::from_millis(500)).await;
                    continue;
                };
                let mut sp_dc = None;
                let mut sp_key = None;
                for cookie in cookies {
                    match cookie.name() {
                        "sp_dc" => sp_dc = Some(cookie.value().to_owned()),
                        "sp_key" => sp_key = Some(cookie.value().to_owned()),
                        _ => {}
                    }
                }
                if let Some(sp_dc) = sp_dc.filter(|value| !value.is_empty()) {
                    let state = app_for_task.state::<RuntimeState>();
                    match save_spotify_session_internal(sp_dc, sp_key.unwrap_or_default(), &state)
                        .await
                    {
                        Ok(expiry) => {
                            events::emit(
                                &app_handle,
                                events::AppEvent::SpotifyStatus,
                                SpotifySessionStatus {
                                    authenticated: true,
                                    token_expiry: Some(expiry),
                                },
                            );
                            let _ = window.destroy();
                        }
                        Err(error) => {
                            events::emit_error(
                                &app_handle,
                                events::AppEvent::SpotifyStatusError,
                                error,
                            );
                            handled_for_task.store(false, Ordering::Release);
                        }
                    }
                    return;
                }
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
            handled_for_task.store(false, Ordering::Release);
            events::emit_error(
                &app_handle,
                events::AppEvent::SpotifyStatusError,
                "Spotify login timed out before Meld received the authenticated session".to_owned(),
            );
        });
    })
    .build()
    .map_err(|e| format!("Spotify login window failed: {e}"))?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn spotify_logout(
    app: tauri::AppHandle,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<()> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    forget_spotify_session(&db).map_err(|e| format!("Spotify logout failed: {e}"))?;
    // Without this, the Spotify login window's WebView2 cookies survive logout, so reopening the login page
    // silently reuses the old session instead of asking to sign in again. Best-effort: the account is already
    // disconnected locally either way, so a failure here does not fail the whole logout.
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.clear_all_browsing_data();
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn clear_local_library_keep_downloads(state: tauri::State<'_, RuntimeState>) -> IpcResult<()> {
    let db = state
        .db
        .lock()
        .map_err(|_| "database state poisoned".to_owned())?;
    let transaction = db
        .unchecked_transaction()
        .map_err(|error| format!("library clear transaction failed: {error}"))?;
    for table in ["playlist_songs", "song_albums", "song_artists"] {
        transaction
            .execute(&format!("DELETE FROM {table}"), [])
            .map_err(|error| format!("library clear failed for {table}: {error}"))?;
    }
    for table in [
        "playlists",
        "history",
        "search_history",
        "lyrics",
        "podcasts",
        "speed_dial",
        "albums",
        "artists",
        "spotify_match",
    ] {
        transaction
            .execute(&format!("DELETE FROM {table}"), [])
            .map_err(|error| format!("library clear failed for {table}: {error}"))?;
    }
    transaction.execute("DELETE FROM songs WHERE NOT EXISTS (SELECT 1 FROM downloads WHERE downloads.song_id = songs.id)", []).map_err(|error| format!("library song clear failed: {error}"))?;
    transaction
        .commit()
        .map_err(|error| format!("library clear commit failed: {error}"))?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn account_logout(
    app: tauri::AppHandle,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<()> {
    *state
        .visitor_data
        .lock()
        .map_err(|_| "visitor state poisoned")? = None;
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    forget_google_session(&db).map_err(|e| format!("account logout failed: {e}"))?;
    if let Ok(mut health) = client_health().lock() {
        health.clear();
    }
    if let Ok(mut memory) = resolver_memory().lock() {
        memory.clear();
    }
    // Without this, the Google login window's WebView2 cookies survive logout (they live in the profile shared
    // by every webview in the app, not just the login popup, so clearing it from the main window is sufficient
    // even though the login popup itself is usually already destroyed by the time this runs). Best-effort: the
    // account is already disconnected locally either way, so a failure here does not fail the whole logout.
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.clear_all_browsing_data();
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn session_status(state: tauri::State<'_, RuntimeState>) -> IpcResult<SessionStatus> {
    match auth_session(&state)? {
        Some(session) => Ok(SessionStatus {
            authenticated: true,
            account_name: session.account_name,
            account_email: session.account_email,
            account_channel_handle: session.account_channel_handle,
            account_avatar: session.account_avatar,
        }),
        None => Ok(SessionStatus {
            authenticated: false,
            account_name: None,
            account_email: None,
            account_channel_handle: None,
            account_avatar: None,
        }),
    }
}
