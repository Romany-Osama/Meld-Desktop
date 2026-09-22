//! Encrypted storage for session secrets (Google cookie, Spotify access token).
//!
//! Windows Credential Manager cannot hold a Google cookie jar directly: it rejects secrets larger than
//! `CRED_MAX_CREDENTIAL_BLOB_SIZE` (2560 bytes, i.e. 1280 UTF-16 characters). So only a random 32-byte key lives in the
//! credential store; the secrets themselves are stored in SQLite as `enc1:<base64(nonce || AES-256-GCM ciphertext)>`.
//! Each value is authenticated together with its setting name, so a ciphertext cannot be moved between keys.

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rusqlite::{params, Connection, OptionalExtension};
use std::sync::Mutex;

const PREFIX: &str = "enc1:";
const SERVICE: &str = "Meld Desktop";
const KEY_USER: &str = "session-encryption-key";
const NONCE_LEN: usize = 12;

/// Settings whose values are encrypted at rest.
pub const SEALED_KEYS: [&str; 2] = ["cookie", "spotifyAccessToken"];
/// Settings that used to be stored but are never read by the app; they are deleted on startup.
const REMOVED_KEYS: [&str; 2] = ["spotifySpDc", "spotifySpKey"];

/// Where the encryption key lives. Production uses the OS credential store; tests use memory.
pub trait KeyStore {
    fn load(&self) -> Result<Option<Vec<u8>>, String>;
    fn store(&self, key: &[u8]) -> Result<(), String>;
}

static KEY_CACHE: Mutex<Option<Vec<u8>>> = Mutex::new(None);

pub struct KeyringStore;

impl KeyringStore {
    fn entry() -> Result<keyring::Entry, String> {
        keyring::Entry::new(SERVICE, KEY_USER).map_err(|error| format!("secure storage unavailable: {error}"))
    }
}

impl KeyStore for KeyringStore {
    fn load(&self) -> Result<Option<Vec<u8>>, String> {
        if let Some(key) = KEY_CACHE.lock().map_err(|_| "key cache poisoned".to_owned())?.clone() { return Ok(Some(key)); }
        match Self::entry()?.get_password() {
            Ok(encoded) => {
                let key = BASE64.decode(encoded.trim()).map_err(|error| format!("stored encryption key is corrupt: {error}"))?;
                *KEY_CACHE.lock().map_err(|_| "key cache poisoned".to_owned())? = Some(key.clone());
                Ok(Some(key))
            }
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(format!("secure storage read failed: {error}")),
        }
    }

    fn store(&self, key: &[u8]) -> Result<(), String> {
        Self::entry()?.set_password(&BASE64.encode(key)).map_err(|error| format!("secure storage write failed: {error}"))?;
        *KEY_CACHE.lock().map_err(|_| "key cache poisoned".to_owned())? = Some(key.to_vec());
        Ok(())
    }
}

pub fn is_sealed(value: &str) -> bool { value.starts_with(PREFIX) }

fn cipher(store: &dyn KeyStore, create: bool) -> Result<Aes256Gcm, String> {
    if let Some(bytes) = store.load()? {
        return Aes256Gcm::new_from_slice(&bytes).map_err(|_| "stored encryption key has the wrong length".to_owned());
    }
    if !create { return Err("the encryption key is missing from secure storage".to_owned()); }
    let key = Aes256Gcm::generate_key(OsRng);
    store.store(&key)?;
    Aes256Gcm::new_from_slice(&key).map_err(|_| "generated key has the wrong length".to_owned())
}

pub fn seal(store: &dyn KeyStore, name: &str, plaintext: &str) -> Result<String, String> {
    let cipher = cipher(store, true)?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher.encrypt(&nonce, Payload { msg: plaintext.as_bytes(), aad: name.as_bytes() }).map_err(|_| "encryption failed".to_owned())?;
    let mut blob = nonce.to_vec();
    blob.extend_from_slice(&ciphertext);
    Ok(format!("{PREFIX}{}", BASE64.encode(blob)))
}

/// Decrypts a sealed value. A value that is not sealed is legacy plaintext and is returned unchanged.
pub fn open(store: &dyn KeyStore, name: &str, value: &str) -> Result<String, String> {
    let Some(encoded) = value.strip_prefix(PREFIX) else { return Ok(value.to_owned()); };
    let blob = BASE64.decode(encoded).map_err(|_| "stored secret is corrupt".to_owned())?;
    if blob.len() <= NONCE_LEN { return Err("stored secret is corrupt".to_owned()); }
    let (nonce, ciphertext) = blob.split_at(NONCE_LEN);
    let plaintext = cipher(store, false)?.decrypt(Nonce::from_slice(nonce), Payload { msg: ciphertext, aad: name.as_bytes() }).map_err(|_| "stored secret could not be decrypted".to_owned())?;
    String::from_utf8(plaintext).map_err(|_| "stored secret is not valid text".to_owned())
}

fn read_raw(db: &Connection, key: &str) -> Result<Option<String>, String> {
    db.query_row("SELECT value FROM settings WHERE key = ?1", params![key], |row| row.get::<_, String>(0)).optional().map_err(|error| format!("secret read failed: {error}"))
}

fn write_raw(db: &Connection, key: &str, value: &str) -> Result<(), String> {
    db.execute("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value", params![key, value]).map_err(|error| format!("secret save failed: {error}"))?;
    Ok(())
}

pub fn get_with(db: &Connection, store: &dyn KeyStore, key: &str) -> Result<Option<String>, String> {
    match read_raw(db, key)? { None => Ok(None), Some(value) => open(store, key, &value).map(Some) }
}

pub fn set_with(db: &Connection, store: &dyn KeyStore, key: &str, value: &str) -> Result<(), String> {
    write_raw(db, key, &seal(store, key, value)?)
}

/// Encrypts any secret still stored as plaintext and deletes settings that are never read. Returns true if anything changed.
/// If secure storage is unavailable the plaintext is left in place (the session keeps working) and the error is returned.
pub fn migrate_with(db: &Connection, store: &dyn KeyStore) -> Result<bool, String> {
    let mut changed = db.execute(&format!("DELETE FROM settings WHERE key IN ({})", REMOVED_KEYS.map(|key| format!("'{key}'")).join(", ")), []).map_err(|error| format!("secret cleanup failed: {error}"))? > 0;
    let mut first_error = None;
    for key in SEALED_KEYS {
        match read_raw(db, key) {
            Ok(Some(value)) if !value.is_empty() && !is_sealed(&value) => match seal(store, key, &value).and_then(|sealed| write_raw(db, key, &sealed)) {
                Ok(()) => changed = true,
                Err(error) => { first_error.get_or_insert(error); }
            },
            Ok(_) => {}
            Err(error) => { first_error.get_or_insert(error); }
        }
    }
    // Overwritten and deleted rows can survive in SQLite's free pages; rebuild the file so no plaintext remains.
    if changed { db.execute_batch("VACUUM;").map_err(|error| format!("secret cleanup vacuum failed: {error}"))?; }
    match first_error { Some(error) => Err(error), None => Ok(changed) }
}

pub fn get(db: &Connection, key: &str) -> Result<Option<String>, String> { get_with(db, &KeyringStore, key) }
pub fn set(db: &Connection, key: &str, value: &str) -> Result<(), String> { set_with(db, &KeyringStore, key, value) }
pub fn migrate(db: &Connection) -> Result<bool, String> { migrate_with(db, &KeyringStore) }

#[cfg(test)]
mod tests {
    use super::*;

    struct MemStore(Mutex<Option<Vec<u8>>>);
    impl MemStore { fn new() -> Self { Self(Mutex::new(None)) } }
    impl KeyStore for MemStore {
        fn load(&self) -> Result<Option<Vec<u8>>, String> { Ok(self.0.lock().unwrap().clone()) }
        fn store(&self, key: &[u8]) -> Result<(), String> { *self.0.lock().unwrap() = Some(key.to_vec()); Ok(()) }
    }
    struct BrokenStore;
    impl KeyStore for BrokenStore {
        fn load(&self) -> Result<Option<Vec<u8>>, String> { Err("secure storage unavailable".to_owned()) }
        fn store(&self, _key: &[u8]) -> Result<(), String> { Err("secure storage unavailable".to_owned()) }
    }

    fn settings_db() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);").unwrap();
        db
    }

    #[test]
    fn seal_and_open_round_trip_a_cookie_bigger_than_the_windows_credential_limit() {
        let store = MemStore::new();
        let cookie = format!("SAPISID={}; __Secure-3PSID={}", "a".repeat(900), "b".repeat(900));
        assert!(cookie.encode_utf16().count() * 2 > 2560, "premise: too big for Credential Manager");
        let sealed = seal(&store, "cookie", &cookie).unwrap();
        assert!(is_sealed(&sealed) && !sealed.contains("SAPISID") && !sealed.contains(&"a".repeat(20)));
        assert_eq!(open(&store, "cookie", &sealed).unwrap(), cookie);
    }

    #[test]
    fn every_seal_uses_a_fresh_nonce() {
        let store = MemStore::new();
        assert_ne!(seal(&store, "cookie", "same").unwrap(), seal(&store, "cookie", "same").unwrap());
    }

    #[test]
    fn a_sealed_value_cannot_be_moved_to_another_setting_or_tampered_with() {
        let store = MemStore::new();
        let sealed = seal(&store, "cookie", "secret").unwrap();
        assert!(open(&store, "spotifyAccessToken", &sealed).is_err(), "bound to its setting name");
        let mut bytes = BASE64.decode(sealed.strip_prefix(PREFIX).unwrap()).unwrap();
        let last = bytes.len() - 1;
        bytes[last] ^= 1;
        assert!(open(&store, "cookie", &format!("{PREFIX}{}", BASE64.encode(bytes))).is_err(), "tampering is detected");
    }

    #[test]
    fn a_different_or_missing_key_cannot_decrypt() {
        let sealed = seal(&MemStore::new(), "cookie", "secret").unwrap();
        assert!(open(&MemStore::new(), "cookie", &sealed).is_err(), "a fresh store has no key and must not invent one when reading");
        let other = MemStore::new();
        seal(&other, "cookie", "x").unwrap();
        assert!(open(&other, "cookie", &sealed).is_err(), "wrong key");
    }

    #[test]
    fn legacy_plaintext_is_still_readable() {
        assert_eq!(open(&MemStore::new(), "cookie", "SAPISID=old").unwrap(), "SAPISID=old");
    }

    #[test]
    fn migration_encrypts_plaintext_removes_unused_rows_and_leaves_no_plaintext_in_the_file() {
        let path = std::env::temp_dir().join(format!("meld-secret-migration-{}-{}.db", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let db = Connection::open(&path).unwrap();
        db.execute_batch("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);").unwrap();
        for index in 0..200 { db.execute("INSERT INTO settings VALUES (?1, ?2)", params![format!("filler{index}"), "padding padding padding padding"]).unwrap(); }
        for (key, value) in [("cookie", "SAPISID=TOPSECRETCOOKIE0123"), ("spotifyAccessToken", "TOPSECRETTOKEN4567"), ("spotifySpDc", "TOPSECRETSPDC8901"), ("spotifySpKey", "TOPSECRETSPKEY2345"), ("hideExplicit", "true")] {
            db.execute("INSERT INTO settings VALUES (?1, ?2)", params![key, value]).unwrap();
        }
        let store = MemStore::new();
        assert!(migrate_with(&db, &store).unwrap());
        assert_eq!(get_with(&db, &store, "cookie").unwrap().as_deref(), Some("SAPISID=TOPSECRETCOOKIE0123"));
        assert_eq!(get_with(&db, &store, "spotifyAccessToken").unwrap().as_deref(), Some("TOPSECRETTOKEN4567"));
        assert!(read_raw(&db, "spotifySpDc").unwrap().is_none() && read_raw(&db, "spotifySpKey").unwrap().is_none());
        assert_eq!(read_raw(&db, "hideExplicit").unwrap().as_deref(), Some("true"), "ordinary settings are untouched");
        drop(db);
        let bytes = std::fs::read(&path).unwrap();
        for secret in ["TOPSECRETCOOKIE", "TOPSECRETTOKEN", "TOPSECRETSPDC", "TOPSECRETSPKEY"] {
            assert!(!bytes.windows(secret.len()).any(|window| window == secret.as_bytes()), "{secret} must not remain anywhere in the database file");
        }
        let again = Connection::open(&path).unwrap();
        assert!(!migrate_with(&again, &store).unwrap(), "idempotent");
        drop(again);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn migration_keeps_the_session_working_when_secure_storage_is_unavailable() {
        let db = settings_db();
        db.execute("INSERT INTO settings VALUES ('cookie', 'SAPISID=keepme')", []).unwrap();
        db.execute("INSERT INTO settings VALUES ('spotifySpDc', 'unused')", []).unwrap();
        assert!(migrate_with(&db, &BrokenStore).is_err());
        assert_eq!(read_raw(&db, "cookie").unwrap().as_deref(), Some("SAPISID=keepme"), "plaintext left in place, not lost");
        assert!(read_raw(&db, "spotifySpDc").unwrap().is_none(), "the never-read row is removed regardless");
    }

    #[test]
    fn keyring_store_remembers_the_key_it_was_given() {
        // Non-Windows builds use keyring's in-memory mock backend; the process cache makes store -> load work either way.
        KeyringStore.store(&[7u8; 32]).unwrap();
        assert_eq!(KeyringStore.load().unwrap(), Some(vec![7u8; 32]));
    }
}
