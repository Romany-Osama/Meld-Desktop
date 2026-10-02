//! IPC commands: Settings (S5-003; owner `settings` in docs/ipc-commands.md)
#![allow(unused_imports)]

use crate::*;

#[tauri::command]
pub fn settings_get(state: tauri::State<'_, RuntimeState>) -> IpcResult<Vec<SettingEntry>> {
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    let mut statement = db.prepare("SELECT key, value FROM settings WHERE key IN ('ytmSync', 'useLoginForBrowse', 'hideExplicit', 'hideVideoSongs', 'enableBetterLyrics', 'enablePaxsenix', 'enableLrclib', 'enableKugou', 'enableLyricsPlus', 'enableMusixmatch', 'shuffleMode', 'repeatMode', 'similarContent', 'autoLoadMore', 'disableLoadMoreWhenRepeatAll', 'autoDownloadOnLike', 'autoSkipNextOnError', 'persistentShuffleAcrossQueues', 'rememberShuffleAndRepeat', 'shufflePlaylistFirst', 'preventDuplicateTracksInQueue', 'varispeed', 'seekExtraSeconds', 'audioQuality', 'playerVolume', 'equalizerEnabled', 'equalizerLow', 'equalizerMid', 'equalizerHigh', 'pauseOnMute', 'persistentQueue', 'pauseListenHistory', 'pauseSearchHistory', 'sleepTimerDefault', 'sidebarCollapsed', 'lyricsProviderOrder', 'show_liked_playlist', 'show_downloaded_playlist', 'show_uploaded_playlist', 'show_top_playlist', 'show_cached_playlist', 'playerCacheLimitMb') ORDER BY key").map_err(|e| format!("settings read failed: {e}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(SettingEntry {
                key: row.get(0)?,
                value: row.get(1)?,
            })
        })
        .map_err(|e| format!("settings query failed: {e}"))?;
    Ok(rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("settings row failed: {e}"))?)
}

#[tauri::command]
pub fn settings_set(
    key: String,
    value: String,
    state: tauri::State<'_, RuntimeState>,
) -> IpcResult<()> {
    if !allowed_setting(&key) {
        return Err(IpcError::from(format!("unsupported Meld setting: {key}")));
    }
    if key == "repeatMode" {
        if !matches!(value.as_str(), "0" | "1" | "2") {
            return Err(IpcError::from(
                "Meld repeatMode must be 0 (off), 1 (one), or 2 (all)".to_owned(),
            ));
        }
    } else if key == "playerCacheLimitMb" {
        let limit = value.trim().parse::<i64>().ok();
        if !limit.is_some_and(|limit| player_cache::LIMIT_CHOICES_MB.contains(&limit)) {
            return Err(IpcError::from(
                "playerCacheLimitMb must be one of 0, 512, 1024, 2048, 5120, 10240, 20480"
                    .to_owned(),
            ));
        }
    } else if key == "audioQuality" {
        if !matches!(value.as_str(), "auto" | "high" | "low") {
            return Err(IpcError::from(
                "audioQuality must be auto, high, or low".to_owned(),
            ));
        }
    } else if key == "playerVolume" {
        let volume = value
            .parse::<f32>()
            .map_err(|_| "playerVolume must be a number between 0 and 1".to_owned())?;
        if !volume.is_finite() || !(0.0..=1.0).contains(&volume) {
            return Err(IpcError::from(
                "playerVolume must be a number between 0 and 1".to_owned(),
            ));
        }
    } else if matches!(
        key.as_str(),
        "equalizerLow" | "equalizerMid" | "equalizerHigh"
    ) {
        let gain = value
            .parse::<f32>()
            .map_err(|_| "equalizer gain must be a number between -12 and 12".to_owned())?;
        if !gain.is_finite() || !(-12.0..=12.0).contains(&gain) {
            return Err(IpcError::from(
                "equalizer gain must be a number between -12 and 12".to_owned(),
            ));
        }
    } else if key == "lyricsProviderOrder" {
        let allowed = [
            "BetterLyrics",
            "Paxsenix",
            "LrcLib",
            "KuGou",
            "LyricsPlus",
            "Musixmatch",
            "YouTubeSubtitle",
            "YouTube",
        ];
        if value
            .split(',')
            .map(str::trim)
            .any(|provider| !provider.is_empty() && !allowed.contains(&provider))
        {
            return Err(IpcError::from(
                "unsupported lyrics provider in provider order".to_owned(),
            ));
        }
    } else if key == "sleepTimerDefault" {
        let minutes = value
            .parse::<f32>()
            .map_err(|_| "sleepTimerDefault must be a number of minutes".to_owned())?;
        if !minutes.is_finite() || !(5.0..=120.0).contains(&minutes) {
            return Err(IpcError::from(
                "sleepTimerDefault must be between 5 and 120 minutes".to_owned(),
            ));
        }
    } else if !matches!(value.as_str(), "true" | "false") {
        return Err(IpcError::from(
            "Meld boolean settings require true or false".to_owned(),
        ));
    }
    let db = state.db.lock().map_err(|_| "database state poisoned")?;
    db.execute("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, value]).map_err(|e| format!("settings write failed: {e}"))?;
    if key == "playerCacheLimitMb" {
        if value.trim() == "0" {
            if let Ok(jobs) = player_cache_jobs().lock() {
                jobs.cancel_all();
            }
        }
        enforce_player_cache_quota(&db)?;
    }
    Ok(())
}
