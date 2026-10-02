//! In-app updates (plan §7.6): signed update check/install for the NSIS install, a link to the release page
//! for the portable ZIP, and a database backup before an update is applied.

use rusqlite::Connection;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

/// Marker shipped inside the portable ZIP next to the executable.
pub const PORTABLE_MARKER: &str = "portable.marker";
/// Releases page opened when a portable copy has an update (portable self-update is not implemented yet).
pub const RELEASES_URL: &str = "https://github.com/Romany-Osama/Meld-Desktop/releases/latest";
/// Number of pre-update database backups kept.
pub const KEEP_PRE_UPDATE_BACKUPS: usize = 3;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSummary {
    pub version: String,
    pub current_version: String,
    pub notes: Option<String>,
    pub date: Option<String>,
    /// The portable ZIP cannot be updated in place yet; the UI offers the release page instead.
    pub portable: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProgress {
    downloaded: u64,
    total: Option<u64>,
}

pub fn is_portable_dir(exe_dir: &Path) -> bool {
    exe_dir.join(PORTABLE_MARKER).is_file()
}

fn is_portable() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(is_portable_dir))
        .unwrap_or(false)
}

/// File name for a backup taken before updating to `version`; only SemVer characters are kept.
pub fn pre_update_backup_name(version: &str) -> String {
    let safe: String = version
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '+'))
        .collect();
    format!("pre-update-{safe}.db")
}

/// Writes a consistent copy of the open database (`VACUUM INTO`) and keeps only the newest `keep` backups.
pub fn backup_before_update(
    db: &Connection,
    backups_dir: &Path,
    version: &str,
    keep: usize,
) -> Result<PathBuf, String> {
    fs::create_dir_all(backups_dir).map_err(|error| format!("backup folder failed: {error}"))?;
    let target = backups_dir.join(pre_update_backup_name(version));
    let _ = fs::remove_file(&target);
    db.execute("VACUUM INTO ?1", [target.to_string_lossy().as_ref()])
        .map_err(|error| format!("pre-update backup failed: {error}"))?;
    prune_pre_update_backups(backups_dir, keep)?;
    Ok(target)
}

pub fn prune_pre_update_backups(backups_dir: &Path, keep: usize) -> Result<(), String> {
    let mut backups: Vec<(std::time::SystemTime, PathBuf)> = fs::read_dir(backups_dir)
        .map_err(|error| format!("backup folder read failed: {error}"))?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            name.starts_with("pre-update-") && name.ends_with(".db")
        })
        .filter_map(|entry| Some((entry.metadata().ok()?.modified().ok()?, entry.path())))
        .collect();
    backups.sort_by_key(|entry| std::cmp::Reverse(entry.0));
    for (_, path) in backups.into_iter().skip(keep) {
        let _ = fs::remove_file(path);
    }
    Ok(())
}

#[tauri::command]
pub async fn app_update_check(app: AppHandle) -> crate::IpcResult<Option<UpdateSummary>> {
    let updater = app
        .updater()
        .map_err(|error| format!("update check unavailable: {error}"))?;
    let update = updater
        .check()
        .await
        .map_err(|error| format!("update check failed: {error}"))?;
    Ok(update.map(|update| UpdateSummary {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        notes: update.body.clone(),
        date: update.date.map(|date| date.to_string()),
        portable: is_portable(),
    }))
}

/// Downloads the signed update, verifies it (the plugin rejects a bad signature), backs up the database and
/// starts the installer, which closes and restarts Meld Desktop. Only called after the user clicks Install.
#[tauri::command]
pub async fn app_update_install(app: AppHandle) -> crate::IpcResult<()> {
    if is_portable() {
        return Err(crate::IpcError::from(
            "This is the portable version; download the new ZIP from the release page.".to_owned(),
        ));
    }
    let updater = app
        .updater()
        .map_err(|error| format!("update unavailable: {error}"))?;
    let update = updater
        .check()
        .await
        .map_err(|error| format!("update check failed: {error}"))?
        .ok_or_else(|| "Meld Desktop is already up to date.".to_owned())?;
    let progress_app = app.clone();
    let mut downloaded = 0_u64;
    let bytes = update
        .download(
            move |chunk, total| {
                downloaded += chunk as u64;
                let _ =
                    progress_app.emit("app-update-progress", UpdateProgress { downloaded, total });
            },
            || {},
        )
        .await
        .map_err(|error| format!("update download failed: {error}"))?;
    {
        let state = app.state::<crate::RuntimeState>();
        let db = state
            .db
            .lock()
            .map_err(|_| "database state poisoned".to_owned())?;
        let backups = crate::database_path()
            .parent()
            .map(|dir| dir.join("backups"))
            .ok_or_else(|| "data folder unknown".to_owned())?;
        backup_before_update(&db, &backups, &update.version, KEEP_PRE_UPDATE_BACKUPS)?;
    }
    update
        .install(bytes)
        .map_err(|error| format!("update install failed: {error}"))?;
    app.restart();
}

#[tauri::command]
pub fn app_open_releases_page() -> crate::IpcResult<()> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(RELEASES_URL)
            .spawn()
            .map_err(|error| format!("could not open the release page: {error}"))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Err(crate::IpcError::from(format!(
            "Open {RELEASES_URL} in your browser."
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("meld-updates-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("scratch");
        dir
    }

    #[test]
    fn portable_copies_are_detected_by_the_marker_file() {
        let dir = scratch("portable");
        assert!(!is_portable_dir(&dir));
        fs::write(dir.join(PORTABLE_MARKER), "").expect("marker");
        assert!(is_portable_dir(&dir));
    }

    #[test]
    fn backup_names_cannot_escape_the_backup_folder() {
        assert_eq!(pre_update_backup_name("0.3.0"), "pre-update-0.3.0.db");
        assert_eq!(
            pre_update_backup_name("1.0.0-beta.1"),
            "pre-update-1.0.0-beta.1.db"
        );
        assert_eq!(
            pre_update_backup_name("../../evil\\x"),
            "pre-update-....evilx.db"
        );
    }

    #[test]
    fn a_pre_update_backup_is_a_readable_copy_and_only_three_are_kept() {
        let dir = scratch("backups");
        let db = Connection::open_in_memory().expect("db");
        db.execute_batch("CREATE TABLE songs (id TEXT); INSERT INTO songs VALUES ('s1');")
            .expect("seed");
        for (index, version) in ["0.3.0", "0.4.0", "0.5.0", "0.6.0"].iter().enumerate() {
            let path =
                backup_before_update(&db, &dir, version, KEEP_PRE_UPDATE_BACKUPS).expect("backup");
            let copy = Connection::open(&path).expect("open copy");
            let id: String = copy
                .query_row("SELECT id FROM songs", [], |row| row.get(0))
                .expect("row");
            assert_eq!(id, "s1");
            if index < 3 {
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
        }
        let mut names: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        names.sort();
        assert_eq!(
            names,
            [
                "pre-update-0.4.0.db",
                "pre-update-0.5.0.db",
                "pre-update-0.6.0.db"
            ]
        );
    }
}
