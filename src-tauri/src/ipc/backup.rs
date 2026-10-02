//! IPC commands: Backup and restore (S5-003; owner `backup` in docs/ipc-commands.md)
#![allow(unused_imports)]

use crate::*;

#[tauri::command]
pub fn backup_create(state: tauri::State<'_, RuntimeState>) -> IpcResult<String> {
    let output_path = FileDialog::new()
        .set_title("Create Meld Desktop backup")
        .add_filter("Meld Desktop backup", &["backup"])
        .save_file()
        .ok_or_else(|| IpcError::cancelled("Backup cancelled"))?;
    let temp_db = output_path.with_extension("sqlite3.part");
    let _ = fs::remove_file(&temp_db);
    let db = state
        .db
        .lock()
        .map_err(|_| "database state poisoned".to_owned())?;
    db.execute(
        "VACUUM INTO ?1",
        params![temp_db.to_string_lossy().to_string()],
    )
    .map_err(|error| format!("database backup failed: {error}"))?;
    let settings: Vec<SettingEntry> = {
        let mut statement = db.prepare("SELECT key, value FROM settings WHERE key NOT IN ('cookie', 'dataSyncId', 'visitorData', 'accountName', 'accountEmail', 'accountChannelHandle', 'accountAvatar', 'spotifySpDc', 'spotifySpKey', 'spotifyAccessToken', 'spotifyTokenExpiry', 'spotifyUsername', 'spotifyUserId') ORDER BY key").map_err(|error| format!("backup settings query failed: {error}"))?;
        let rows = statement
            .query_map([], |row| {
                Ok(SettingEntry {
                    key: row.get(0)?,
                    value: row.get(1)?,
                })
            })
            .map_err(|error| format!("backup settings rows failed: {error}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("backup settings decode failed: {error}"))?
    };
    drop(db);
    let settings: Vec<SettingEntry> = settings
        .into_iter()
        .filter(|entry| allowed_setting(&entry.key))
        .collect();
    let result = (|| -> Result<(), String> {
        scrub_backup_copy(&temp_db)?;
        let file = fs::File::create(&output_path)
            .map_err(|error| format!("backup archive create failed: {error}"))?;
        let mut archive = ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        archive
            .start_file("settings.json", options)
            .map_err(|error| format!("backup settings entry failed: {error}"))?;
        archive
            .write_all(
                &serde_json::to_vec_pretty(&settings)
                    .map_err(|error| format!("backup settings encode failed: {error}"))?,
            )
            .map_err(|error| format!("backup settings write failed: {error}"))?;
        archive
            .start_file("song.db", options)
            .map_err(|error| format!("backup database entry failed: {error}"))?;
        let mut database_file = fs::File::open(&temp_db)
            .map_err(|error| format!("backup database open failed: {error}"))?;
        let mut database_bytes = Vec::new();
        database_file
            .read_to_end(&mut database_bytes)
            .map_err(|error| format!("backup database read failed: {error}"))?;
        archive
            .write_all(&database_bytes)
            .map_err(|error| format!("backup database write failed: {error}"))?;
        archive
            .finish()
            .map_err(|error| format!("backup archive finalize failed: {error}"))?;
        Ok(())
    })();
    let _ = fs::remove_file(&temp_db);
    Ok(result.map(|_| output_path.to_string_lossy().to_string())?)
}

#[tauri::command]
pub fn backup_restore(state: tauri::State<'_, RuntimeState>) -> IpcResult<String> {
    let input_path = FileDialog::new()
        .set_title("Restore Meld Desktop backup")
        .add_filter("Meld Desktop backup", &["backup"])
        .pick_file()
        .ok_or_else(|| IpcError::cancelled("Restore cancelled"))?;
    let file =
        fs::File::open(&input_path).map_err(|error| format!("backup open failed: {error}"))?;
    let temp_db = database_path().with_extension("restore.part");
    let _ = fs::remove_file(&temp_db);
    let settings_bytes = match extract_backup(
        file,
        &temp_db,
        MAX_BACKUP_DATABASE_BYTES,
        MAX_BACKUP_SETTINGS_BYTES,
    ) {
        Ok(bytes) => bytes,
        Err(error) => {
            let _ = fs::remove_file(&temp_db);
            return Err(IpcError::from(error));
        }
    };
    let imported_settings: Vec<SettingEntry> = match serde_json::from_slice(&settings_bytes) {
        Ok(value) => value,
        Err(error) => {
            let _ = fs::remove_file(&temp_db);
            return Err(IpcError::from(format!(
                "backup settings are invalid: {error}"
            )));
        }
    };
    let candidate = match Connection::open(&temp_db) {
        Ok(connection) => connection,
        Err(error) => {
            let _ = fs::remove_file(&temp_db);
            return Err(IpcError::from(format!(
                "backup database validation failed: {error}"
            )));
        }
    };
    let integrity: String =
        match candidate.query_row("PRAGMA integrity_check", [], |row| row.get(0)) {
            Ok(value) => value,
            Err(error) => {
                drop(candidate);
                let _ = fs::remove_file(&temp_db);
                return Err(IpcError::from(format!(
                    "backup database integrity check failed: {error}"
                )));
            }
        };
    if integrity != "ok" {
        drop(candidate);
        let _ = fs::remove_file(&temp_db);
        return Err(IpcError::from(format!(
            "backup database integrity check failed: {integrity}"
        )));
    }
    let required_tables: i64 = match candidate.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('songs', 'settings', 'history', 'downloads')", [], |row| row.get(0)) {
        Ok(value) => value,
        Err(error) => { drop(candidate); let _ = fs::remove_file(&temp_db); return Err(IpcError::from(format!("backup database schema validation failed: {error}"))); }
    };
    if required_tables != 4 {
        let _ = fs::remove_file(&temp_db);
        return Err(IpcError::from(
            "backup database is missing required Meld tables".to_owned(),
        ));
    }
    candidate
        .execute("DELETE FROM settings", [])
        .map_err(|error| format!("restored settings clear failed: {error}"))?;
    for setting in imported_settings {
        if allowed_setting(&setting.key) {
            candidate
                .execute(
                    "INSERT INTO settings (key, value) VALUES (?1, ?2)",
                    params![setting.key, setting.value],
                )
                .map_err(|error| format!("restored setting write failed: {error}"))?;
        }
    }
    candidate.execute("DELETE FROM settings WHERE key IN ('cookie', 'dataSyncId', 'visitorData', 'accountName', 'accountEmail', 'accountChannelHandle', 'accountAvatar', 'spotifySpDc', 'spotifySpKey', 'spotifyAccessToken', 'spotifyTokenExpiry', 'spotifyUsername', 'spotifyUserId')", []).map_err(|error| format!("restored auth clear failed: {error}"))?;
    drop(candidate);

    let db_path = database_path();
    let previous_path = db_path.with_extension("restore.previous");
    let mut db = state
        .db
        .lock()
        .map_err(|_| "database state poisoned".to_owned())?;
    let replacement = Connection::open_in_memory()
        .map_err(|error| format!("restore temporary connection failed: {error}"))?;
    let old = std::mem::replace(&mut *db, replacement);
    drop(old);
    let _ = fs::remove_file(&previous_path);
    let swap_result =
        fs::rename(&db_path, &previous_path).and_then(|_| fs::rename(&temp_db, &db_path));
    if let Err(error) = swap_result {
        let _ = fs::rename(&temp_db, &db_path);
        let _ = fs::rename(&previous_path, &db_path);
        if let Ok(old_connection) = Connection::open(&db_path) {
            *db = old_connection;
        }
        return Err(IpcError::from(format!(
            "database restore swap failed: {error}"
        )));
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
            if let Ok(old_connection) = Connection::open(&db_path) {
                *db = old_connection;
            }
            Err(IpcError::from(format!(
                "restored database reopen failed: {error}"
            )))
        }
    }
}
