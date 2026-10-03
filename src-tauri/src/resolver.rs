//! YouTube stream resolution policy (Phase 4 · M4.2): client catalog and order, failed-client memory,
//! playability taxonomy, audio format selection (direct and ciphered), stream URL finalisation and
//! host validation, client playback nonce and redacted diagnostics. Network and JavaScript execution
//! live in `lib.rs`/`ytjs.rs`; everything here is pure and unit-tested.
//!
//! Order and client contracts follow reference Meld's InnerTubeX catalog (v0.5.2) and yt-dlp: stable
//! direct-URL clients first, then clients whose formats need the player's signature/`n` transforms
//! (WEB_REMIX first among those: verified end to end; TV clients are kept as later fallbacks).
//! The browser clients (`po_token`) get proof-of-origin tokens from `potoken` when available (PLAY-010,
//! D-048); without one they are tried as before.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;

pub const FAILED_CLIENT_TTL: Duration = Duration::from_secs(5 * 60);
/// How long a client whose streams were refused by the media server goes to the back of the order.
pub const DEMOTED_CLIENT_TTL: Duration = Duration::from_secs(30 * 60);
/// googlevideo serves the first ~1 MB of a stream even when the URL is not really usable (for example
/// ANDROID_VR 1.65 URLs without a PO token from some networks) and answers 403 past it, so the
/// access probe reads a small range beyond this offset.
pub const STREAM_PROBE_MIN_OFFSET: u64 = 1_048_576;
pub const STREAM_PROBE_LEN: u64 = 1024;
const BROWSER_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Auth {
    /// Never send cookies.
    None,
    /// Send cookies when signed in (needed for uploads, private and some restricted songs).
    Optional,
    /// Only usable when signed in.
    Required,
}

#[derive(Debug, Clone, Copy)]
pub struct ClientProfile {
    /// Stable identifier used for failure memory and diagnostics.
    pub key: &'static str,
    pub name: &'static str,
    pub version: &'static str,
    pub id: &'static str,
    pub user_agent: &'static str,
    pub host: &'static str,
    pub os_name: Option<&'static str>,
    pub os_version: Option<&'static str>,
    pub device_make: Option<&'static str>,
    pub device_model: Option<&'static str>,
    pub android_sdk: Option<u32>,
    pub embedded: bool,
    pub auth: Auth,
    /// Formats may be ciphered / `n`-throttled: send `signatureTimestamp` and solve with the player JS.
    pub uses_player_js: bool,
    /// Browser client: send a PO token with `/player` and as the stream URL's `pot` when one is available.
    pub po_token: bool,
}

const fn direct(
    key: &'static str,
    name: &'static str,
    version: &'static str,
    id: &'static str,
    user_agent: &'static str,
    device: (&'static str, &'static str, &'static str, &'static str),
    android_sdk: Option<u32>,
) -> ClientProfile {
    ClientProfile {
        key,
        name,
        version,
        id,
        user_agent,
        host: "www.youtube.com",
        os_name: Some(device.0),
        os_version: Some(device.1),
        device_make: Some(device.2),
        device_model: Some(device.3),
        android_sdk,
        embedded: false,
        auth: Auth::None,
        uses_player_js: false,
        po_token: false,
    }
}

#[allow(clippy::too_many_arguments)]
const fn web(
    key: &'static str,
    name: &'static str,
    version: &'static str,
    id: &'static str,
    user_agent: &'static str,
    host: &'static str,
    embedded: bool,
    auth: Auth,
) -> ClientProfile {
    ClientProfile {
        key,
        name,
        version,
        id,
        user_agent,
        host,
        os_name: None,
        os_version: None,
        device_make: None,
        device_model: None,
        android_sdk: None,
        embedded,
        auth,
        uses_player_js: true,
        po_token: false,
    }
}

/// Mark a browser client as PO-token capable.
const fn po(mut client: ClientProfile) -> ClientProfile {
    client.po_token = true;
    client
}

pub const CLIENTS: [ClientProfile; 9] = [
    direct("ANDROID_VR_1_65_10", "ANDROID_VR", "1.65.10", "28", "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip", ("Android", "12L", "Oculus", "Quest 3"), Some(32)),
    direct("VISIONOS_0_1", "VISIONOS", "0.1", "101", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", ("visionOS", "1.3.21O771", "Apple", "RealityDevice14,1"), None),
    direct("ANDROID_VR_1_43_32", "ANDROID_VR", "1.43.32", "28", "com.google.android.apps.youtube.vr.oculus/1.43.32 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1; Cronet/107.0.5284.2)", ("Android", "12", "Oculus", "Quest 3"), Some(32)),
    direct("IOS_21_03_3", "IOS", "21.03.3", "5", "com.google.ios.youtube/21.03.3 (iPad7,6; U; CPU iPadOS 17_7_10 like Mac OS X; en-US)", ("iPadOS", "17.7.10.21H450", "Apple", "iPad7,6"), None),
    po(web("WEB_REMIX", "WEB_REMIX", "1.20260707.12.00", "67", BROWSER_USER_AGENT, "music.youtube.com", false, Auth::Optional)),
    web("TVHTML5_DOWNGRADED", "TVHTML5", "5.20260707", "7", "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version", "www.youtube.com", false, Auth::Optional),
    web("TVHTML5", "TVHTML5", "7.20260707.07.00", "7", "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/25.lts.30.1034943-gold (unlike Gecko), Unknown_TV_Unknown_0/Unknown (Unknown, Unknown)", "www.youtube.com", false, Auth::Optional),
    po(web("WEB_EMBEDDED_PLAYER", "WEB_EMBEDDED_PLAYER", "2.20260708.00.00", "56", BROWSER_USER_AGENT, "www.youtube.com", true, Auth::Optional)),
    po(web("WEB_CREATOR", "WEB_CREATOR", "1.20260708.06.00", "62", BROWSER_USER_AGENT, "www.youtube.com", false, Auth::Required)),
];

/// Content hints (PLAY-007): uploaded songs (`MLPT` playlists or library uploads) only play with the
/// account's cookies, so authenticated clients go first and anonymous clients are skipped.
#[derive(Debug, Clone, Copy, Default)]
pub struct Hints {
    pub uploaded: bool,
}

pub fn is_uploaded_context(playlist_id: Option<&str>) -> bool {
    playlist_id.is_some_and(|value| value.contains("MLPT"))
}

/// Clients to try for one resolution, in order.
pub fn client_order(
    signed_in: bool,
    js_available: bool,
    hints: Hints,
    excluded: &[&str],
) -> Vec<ClientProfile> {
    let mut clients: Vec<ClientProfile> = CLIENTS
        .iter()
        .copied()
        .filter(|client| !excluded.contains(&client.key))
        .filter(|client| signed_in || client.auth != Auth::Required)
        .filter(|client| js_available || !client.uses_player_js)
        .filter(|client| !hints.uploaded || (signed_in && client.auth != Auth::None))
        .collect();
    if hints.uploaded {
        // The music client knows uploads best.
        clients.sort_by_key(|client| client.key != "WEB_REMIX");
    }
    clients
}

/// Remember which clients produced a rejected stream for a video (PLAY-005), like Meld's five-minute set.
#[derive(Debug, Default)]
pub struct FailureMemory {
    entries: HashMap<String, (Vec<&'static str>, Instant)>,
    last_client: HashMap<String, &'static str>,
}

impl FailureMemory {
    pub fn record_success(&mut self, video_id: &str, client: &'static str) {
        self.last_client.insert(video_id.to_owned(), client);
        if self.last_client.len() > 512 {
            self.last_client.clear();
            self.last_client.insert(video_id.to_owned(), client);
        }
    }

    pub fn last_client(&self, video_id: &str) -> Option<&'static str> {
        self.last_client.get(video_id).copied()
    }

    pub fn mark_failed(&mut self, video_id: &str, client: &'static str, now: Instant) {
        self.prune(now);
        let entry = self
            .entries
            .entry(video_id.to_owned())
            .or_insert_with(|| (Vec::new(), now));
        if !entry.0.contains(&client) {
            entry.0.push(client);
        }
        entry.1 = now;
    }

    pub fn excluded(&mut self, video_id: &str, now: Instant) -> Vec<&'static str> {
        self.prune(now);
        self.entries
            .get(video_id)
            .map(|entry| entry.0.clone())
            .unwrap_or_default()
    }

    pub fn clear(&mut self) {
        self.entries.clear();
        self.last_client.clear();
    }

    fn prune(&mut self, now: Instant) {
        self.entries
            .retain(|_, (_, at)| now.saturating_duration_since(*at) < FAILED_CLIENT_TTL);
    }
}

/// Why one client could not provide a stream (PLAY-015).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Category {
    BotCheck,
    SignInRequired,
    AgeRestricted,
    RegionBlocked,
    MembersOnly,
    Unavailable,
    Unplayable,
    NoAudio,
    CipherUnsolved,
    StreamForbidden,
    Network,
    /// A browser client failed and no PO token could be minted for it (PLAY-010).
    PoTokenUnavailable,
}

impl Category {
    pub fn label(self) -> &'static str {
        match self {
            Category::BotCheck => "YouTube asked to confirm you are not a bot",
            Category::SignInRequired => "sign-in required",
            Category::AgeRestricted => "age-restricted",
            Category::RegionBlocked => "not available in your country",
            Category::MembersOnly => "members-only",
            Category::Unavailable => "video unavailable",
            Category::Unplayable => "not playable by this client",
            Category::NoAudio => "no usable audio format",
            Category::CipherUnsolved => "stream signature could not be solved",
            Category::StreamForbidden => "YouTube's media server refused the stream (403)",
            Category::Network => "network error",
            Category::PoTokenUnavailable => "no proof-of-origin token was available",
        }
    }

    /// Failures that every client will hit too, so the cascade can stop early.
    pub fn is_final(self) -> bool {
        matches!(
            self,
            Category::Unavailable | Category::MembersOnly | Category::RegionBlocked
        )
    }
}

pub fn classify_playability(status: &str, reason: &str) -> Category {
    let reason = reason.to_ascii_lowercase();
    if reason.contains("not a bot") {
        Category::BotCheck
    } else if reason.contains("age")
        && (reason.contains("confirm")
            || reason.contains("restrict")
            || reason.contains("inappropriate"))
    {
        Category::AgeRestricted
    } else if reason.contains("country") || reason.contains("region") {
        Category::RegionBlocked
    } else if reason.contains("member") {
        Category::MembersOnly
    } else if status == "LOGIN_REQUIRED" || reason.contains("sign in") {
        Category::SignInRequired
    } else if status == "ERROR"
        || reason.contains("unavailable")
        || reason.contains("removed")
        || reason.contains("private")
    {
        Category::Unavailable
    } else {
        Category::Unplayable
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Attempt {
    pub client: &'static str,
    pub category: Category,
    pub detail: String,
}

/// Remove anything that could identify the user or grant access: URLs, cookies, e-mail addresses.
pub fn redact(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for word in text.split_inclusive(char::is_whitespace) {
        let trimmed = word.trim_end();
        let lower = trimmed.to_ascii_lowercase();
        let replacement = if lower.contains("http://") || lower.contains("https://") {
            Some("[url]")
        } else if trimmed.contains('@') && trimmed.contains('.') {
            Some("[email]")
        } else if lower.contains("sapisid")
            || lower.contains("cookie=")
            || lower.contains("token=")
            || lower.contains("potoken")
            || lower.contains("pot=")
        {
            Some("[secret]")
        } else {
            None
        };
        match replacement {
            Some(value) => {
                out.push_str(value);
                out.push_str(&word[trimmed.len()..]);
            }
            None => out.push_str(word),
        }
    }
    out.chars().take(240).collect()
}

/// One line for the UI plus a copyable multi-line report (PLAY-006).
pub fn summarize(attempts: &[Attempt]) -> String {
    if attempts.is_empty() {
        return "No YouTube client could be tried for this song.".to_owned();
    }
    let parts: Vec<String> = attempts
        .iter()
        .map(|a| format!("{} — {}", a.client, a.category.label()))
        .collect();
    format!(
        "No playable stream after {} source client(s): {}",
        attempts.len(),
        parts.join("; ")
    )
}

#[derive(Debug, Clone, PartialEq)]
pub enum FormatUrl {
    Direct(String),
    Ciphered { url: String, s: String, sp: String },
}

#[derive(Debug, Clone)]
pub struct AudioCandidate {
    pub url: FormatUrl,
    pub mime: String,
    pub bitrate: i64,
    pub content_length: Option<u64>,
}

/// Audio-only, original-language formats, best first (or lowest first for LOW quality).
pub fn audio_candidates(response: &Value, prefer_low: bool) -> Vec<AudioCandidate> {
    let formats = response
        .get("streamingData")
        .and_then(|v| v.get("adaptiveFormats"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut candidates: Vec<AudioCandidate> = formats
        .iter()
        .filter_map(|format| {
            let mime = format.get("mimeType").and_then(Value::as_str)?;
            if !mime.starts_with("audio/") || format.get("width").is_some() {
                return None;
            }
            if format.get("drmFamilies").is_some() {
                return None;
            }
            let audio_track = format.get("audioTrack");
            if audio_track
                .and_then(|v| v.get("isAutoDubbed"))
                .and_then(Value::as_bool)
                == Some(true)
            {
                return None;
            }
            if audio_track
                .and_then(|v| v.get("audioIsDefault"))
                .and_then(Value::as_bool)
                == Some(false)
            {
                return None;
            }
            let url = if let Some(url) = format
                .get("url")
                .and_then(Value::as_str)
                .filter(|v| !v.is_empty())
            {
                FormatUrl::Direct(url.to_owned())
            } else {
                let cipher = format
                    .get("signatureCipher")
                    .or_else(|| format.get("cipher"))
                    .and_then(Value::as_str)?;
                let pairs: HashMap<String, String> = url::form_urlencoded::parse(cipher.as_bytes())
                    .into_owned()
                    .collect();
                FormatUrl::Ciphered {
                    url: pairs.get("url")?.clone(),
                    s: pairs.get("s")?.clone(),
                    sp: pairs
                        .get("sp")
                        .cloned()
                        .unwrap_or_else(|| "signature".to_owned()),
                }
            };
            Some(AudioCandidate {
                url,
                mime: mime.to_owned(),
                bitrate: format.get("bitrate").and_then(Value::as_i64).unwrap_or(0),
                content_length: format
                    .get("contentLength")
                    .and_then(Value::as_str)
                    .and_then(|v| v.parse::<u64>().ok()),
            })
        })
        .collect();
    candidates.sort_by_key(|candidate| {
        let direction = if prefer_low { -1_i64 } else { 1_i64 };
        let opus_bonus = if candidate.mime.starts_with("audio/webm") {
            10240_i64
        } else {
            0
        };
        std::cmp::Reverse(
            candidate
                .bitrate
                .saturating_mul(direction)
                .saturating_add(opus_bonus),
        )
    });
    candidates
}

pub fn n_challenge(url: &str) -> Option<String> {
    let parsed = url::Url::parse(url).ok()?;
    let value = parsed
        .query_pairs()
        .find(|(key, _)| key == "n")
        .map(|(_, value)| value.into_owned());
    value
}

/// Build the playable URL: add the solved signature, replace `n`, add `cpn`, then validate the host.
pub fn finalize_url(
    format: &FormatUrl,
    signature: Option<&str>,
    n_solution: Option<&str>,
    cpn: &str,
) -> Result<String, String> {
    let (base, sig_param) = match format {
        FormatUrl::Direct(url) => (url.as_str(), None),
        FormatUrl::Ciphered { url, sp, .. } => {
            let signature =
                signature.ok_or_else(|| "stream signature could not be solved".to_owned())?;
            (url.as_str(), Some((sp.as_str(), signature)))
        }
    };
    let mut parsed = url::Url::parse(base).map_err(|_| "stream URL is malformed".to_owned())?;
    let pairs: Vec<(String, String)> = parsed
        .query_pairs()
        .filter(|(key, _)| key != "cpn" && sig_param.is_none_or(|(sp, _)| key != sp))
        .map(|(key, value)| {
            let value = if key == "n" {
                n_solution
                    .map(str::to_owned)
                    .unwrap_or_else(|| value.into_owned())
            } else {
                value.into_owned()
            };
            (key.into_owned(), value)
        })
        .collect();
    {
        let mut query = parsed.query_pairs_mut();
        query.clear();
        for (key, value) in &pairs {
            query.append_pair(key, value);
        }
        if let Some((sp, signature)) = sig_param {
            query.append_pair(sp, signature);
        }
        if valid_cpn(cpn) {
            query.append_pair("cpn", cpn);
        }
    }
    let url = parsed.to_string();
    validate_stream_url(&url)?;
    Ok(url)
}

/// Failures a missing or rejected PO token can explain (PLAY-010).
pub fn retry_without_po_token(category: Category) -> bool {
    matches!(
        category,
        Category::BotCheck | Category::StreamForbidden | Category::Unplayable
    )
}

/// Add the session-bound PO token as `pot` (replacing any existing one) and re-validate (PLAY-010).
pub fn with_pot(url: &str, pot: &str) -> Result<String, String> {
    let mut parsed = url::Url::parse(url).map_err(|_| "stream URL is malformed".to_owned())?;
    let pairs: Vec<(String, String)> = parsed
        .query_pairs()
        .filter(|(key, _)| key != "pot")
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();
    {
        let mut query = parsed.query_pairs_mut();
        query.clear();
        for (key, value) in &pairs {
            query.append_pair(key, value);
        }
        query.append_pair("pot", pot);
    }
    let url = parsed.to_string();
    validate_stream_url(&url)?;
    Ok(url)
}

/// PLAY-013: only HTTPS Google media hosts, default port, no credentials, no IP literals.
pub fn validate_stream_url(value: &str) -> Result<(), String> {
    let parsed = url::Url::parse(value).map_err(|_| "stream URL is malformed".to_owned())?;
    let host = match parsed.host() {
        Some(url::Host::Domain(host)) => host.to_ascii_lowercase(),
        _ => return Err("stream host is not an approved media host".to_owned()),
    };
    let approved = host == "googlevideo.com" || host.ends_with(".googlevideo.com");
    if parsed.scheme() != "https"
        || !approved
        || parsed.port().is_some_and(|port| port != 443)
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("stream host is not an approved media host".to_owned());
    }
    Ok(())
}

const CPN_ALPHABET: &[u8; 64] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";

fn valid_cpn(value: &str) -> bool {
    value.len() == 16 && value.bytes().all(|b| CPN_ALPHABET.contains(&b))
}

/// Client playback nonce (PLAY-009), 16 characters like YouTube's players.
pub fn generate_cpn(random: &[u8; 16]) -> String {
    random
        .iter()
        .map(|byte| CPN_ALPHABET[(*byte & 63) as usize] as char)
        .collect()
}

/// Byte range (inclusive) the resolver reads to prove a stream URL serves the whole file, or `None` when
/// the file is small enough that the first request already covers it.
pub fn stream_probe_range(content_length: Option<u64>) -> Option<(u64, u64)> {
    let length = content_length?;
    if length <= STREAM_PROBE_MIN_OFFSET + STREAM_PROBE_LEN {
        return None;
    }
    let start = (length / 2)
        .max(STREAM_PROBE_MIN_OFFSET)
        .min(length - STREAM_PROBE_LEN);
    Some((start, start + STREAM_PROBE_LEN - 1))
}

/// Outcome of a media-server request for a resolved stream.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StreamAccess {
    Ok,
    /// The URL is refused; another client must be used.
    Forbidden,
    /// Anything else (server error, odd status): not proof the URL is bad.
    Inconclusive,
}

pub fn stream_access(status: u16) -> StreamAccess {
    match status {
        200 | 206 => StreamAccess::Ok,
        401 | 403 | 404 | 410 => StreamAccess::Forbidden,
        _ => StreamAccess::Inconclusive,
    }
}

/// Clients whose streams the media server recently refused for any song. Refusals usually apply to the
/// whole client on the current network, so those clients are tried last for a while (PLAY-005).
#[derive(Debug, Default)]
pub struct ClientHealth {
    demoted: HashMap<&'static str, Instant>,
}

impl ClientHealth {
    pub fn demote(&mut self, client: &'static str, now: Instant) {
        self.demoted.insert(client, now);
    }

    pub fn is_demoted(&self, client: &str, now: Instant) -> bool {
        self.demoted
            .get(client)
            .is_some_and(|at| now.saturating_duration_since(*at) < DEMOTED_CLIENT_TTL)
    }

    /// Stable reorder: healthy clients keep their order, demoted ones move to the end.
    pub fn reorder(&self, clients: &mut [ClientProfile], now: Instant) {
        clients.sort_by_key(|client| self.is_demoted(client.key, now));
    }

    pub fn clear(&mut self) {
        self.demoted.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn keys(clients: &[ClientProfile]) -> Vec<&'static str> {
        clients.iter().map(|client| client.key).collect()
    }

    #[test]
    fn catalog_keys_are_unique_and_direct_clients_come_first() {
        let mut seen = std::collections::HashSet::new();
        assert!(CLIENTS.iter().all(|client| seen.insert(client.key)));
        let first_js = CLIENTS.iter().position(|c| c.uses_player_js).unwrap();
        assert!(CLIENTS[..first_js]
            .iter()
            .all(|c| !c.uses_player_js && c.auth == Auth::None));
        assert!(CLIENTS[first_js..].iter().all(|c| c.uses_player_js));
    }

    #[test]
    fn order_respects_sign_in_js_and_exclusions() {
        let anonymous = keys(&client_order(false, true, Hints::default(), &[]));
        assert!(!anonymous.contains(&"WEB_CREATOR"));
        assert_eq!(anonymous[0], "ANDROID_VR_1_65_10");
        assert!(anonymous.contains(&"WEB_REMIX"));
        let signed_in = keys(&client_order(true, true, Hints::default(), &[]));
        assert!(signed_in.contains(&"WEB_CREATOR"));
        let no_js = keys(&client_order(true, false, Hints::default(), &[]));
        assert!(no_js
            .iter()
            .all(|key| !["TVHTML5", "WEB_REMIX", "WEB_CREATOR"].contains(key)));
        let excluded = keys(&client_order(
            false,
            true,
            Hints::default(),
            &["ANDROID_VR_1_65_10"],
        ));
        assert_eq!(excluded[0], "VISIONOS_0_1");
    }

    #[test]
    fn uploads_use_signed_in_music_client_first() {
        assert!(is_uploaded_context(Some("MLPT")));
        assert!(!is_uploaded_context(Some("PL123")));
        let order = keys(&client_order(true, true, Hints { uploaded: true }, &[]));
        assert_eq!(order[0], "WEB_REMIX");
        assert!(order
            .iter()
            .all(|key| !key.starts_with("ANDROID_VR") && !key.starts_with("IOS")));
        assert!(client_order(false, true, Hints { uploaded: true }, &[]).is_empty());
    }

    #[test]
    fn failure_memory_expires_after_five_minutes() {
        let mut memory = FailureMemory::default();
        let start = Instant::now();
        memory.mark_failed("v1", "ANDROID_VR_1_65_10", start);
        memory.mark_failed("v1", "ANDROID_VR_1_65_10", start);
        memory.mark_failed("v1", "VISIONOS_0_1", start);
        assert_eq!(
            memory.excluded("v1", start),
            vec!["ANDROID_VR_1_65_10", "VISIONOS_0_1"]
        );
        assert!(memory.excluded("v2", start).is_empty());
        assert!(memory
            .excluded("v1", start + FAILED_CLIENT_TTL + Duration::from_secs(1))
            .is_empty());
        memory.record_success("v1", "WEB_REMIX");
        assert_eq!(memory.last_client("v1"), Some("WEB_REMIX"));
        memory.clear();
        assert_eq!(memory.last_client("v1"), None);
    }

    #[test]
    fn playability_taxonomy() {
        assert_eq!(
            classify_playability("LOGIN_REQUIRED", "Sign in to confirm you’re not a bot"),
            Category::BotCheck
        );
        assert_eq!(
            classify_playability("LOGIN_REQUIRED", "Sign in to confirm your age"),
            Category::AgeRestricted
        );
        assert_eq!(
            classify_playability("LOGIN_REQUIRED", "This video is private"),
            Category::SignInRequired
        );
        assert_eq!(
            classify_playability(
                "UNPLAYABLE",
                "The uploader has not made this video available in your country"
            ),
            Category::RegionBlocked
        );
        assert_eq!(
            classify_playability("ERROR", "This video is unavailable"),
            Category::Unavailable
        );
        assert_eq!(
            classify_playability(
                "UNPLAYABLE",
                "Join this channel to get access to members-only content"
            ),
            Category::MembersOnly
        );
        assert_eq!(
            classify_playability("UNPLAYABLE", "The page needs to be reloaded."),
            Category::Unplayable
        );
        assert!(Category::Unavailable.is_final() && !Category::BotCheck.is_final());
    }

    #[test]
    fn redaction_removes_urls_emails_and_secrets() {
        let text = redact("failed https://rr1.googlevideo.com/videoplayback?sig=abc for me@example.com SAPISIDHASH=1 ok");
        assert!(
            !text.contains("googlevideo")
                && !text.contains("example.com")
                && !text.contains("SAPISID")
        );
        assert!(text.contains("[url]") && text.contains("[email]") && text.ends_with("ok"));
        let summary = summarize(&[Attempt {
            client: "WEB_REMIX",
            category: Category::BotCheck,
            detail: String::new(),
        }]);
        assert!(summary.contains("WEB_REMIX") && summary.contains("bot"));
    }

    fn fixture() -> Value {
        json!({ "streamingData": { "adaptiveFormats": [
            { "mimeType": "video/mp4", "width": 640, "url": "https://rr1---sn-x.googlevideo.com/videoplayback?v" },
            { "mimeType": "audio/mp4; codecs=\"mp4a.40.2\"", "bitrate": 130000, "url": "https://rr1---sn-x.googlevideo.com/videoplayback?itag=140&n=abc" },
            { "mimeType": "audio/webm; codecs=\"opus\"", "bitrate": 135000, "signatureCipher": "s=SIGVALUE&sp=sig&url=https%3A%2F%2Frr1---sn-x.googlevideo.com%2Fvideoplayback%3Fitag%3D251%26n%3Dxyz" },
            { "mimeType": "audio/webm; codecs=\"opus\"", "bitrate": 160000, "url": "https://rr1---sn-x.googlevideo.com/videoplayback?itag=251dub", "audioTrack": { "isAutoDubbed": true } },
            { "mimeType": "audio/webm; codecs=\"opus\"", "bitrate": 170000, "url": "https://rr1---sn-x.googlevideo.com/videoplayback?itag=drm", "drmFamilies": ["WIDEVINE"] },
            { "mimeType": "audio/webm; codecs=\"opus\"", "bitrate": 50000, "url": "https://rr1---sn-x.googlevideo.com/videoplayback?itag=249" }
        ] } })
    }

    #[test]
    fn selects_audio_including_ciphered_and_skips_dubbed_and_drm() {
        let candidates = audio_candidates(&fixture(), false);
        assert_eq!(candidates.len(), 3);
        assert!(
            matches!(&candidates[0].url, FormatUrl::Ciphered { s, sp, .. } if s == "SIGVALUE" && sp == "sig")
        );
        assert_eq!(candidates[1].bitrate, 130000);
        let low = audio_candidates(&fixture(), true);
        assert_eq!(low[0].bitrate, 50000);
        assert!(audio_candidates(&json!({}), false).is_empty());
    }

    #[test]
    fn finalizes_ciphered_url_with_signature_n_and_cpn() {
        let candidates = audio_candidates(&fixture(), false);
        let cpn = generate_cpn(&[7; 16]);
        assert_eq!(cpn.len(), 16);
        let FormatUrl::Ciphered { url, .. } = &candidates[0].url else {
            panic!()
        };
        assert_eq!(n_challenge(url).as_deref(), Some("xyz"));
        let finalized =
            finalize_url(&candidates[0].url, Some("SOLVED"), Some("NNN"), &cpn).unwrap();
        let parsed = url::Url::parse(&finalized).unwrap();
        let query: HashMap<_, _> = parsed.query_pairs().into_owned().collect();
        assert_eq!(query.get("sig").map(String::as_str), Some("SOLVED"));
        assert_eq!(query.get("n").map(String::as_str), Some("NNN"));
        assert_eq!(query.get("cpn"), Some(&cpn));
        assert_eq!(query.get("itag").map(String::as_str), Some("251"));
        assert!(finalize_url(&candidates[0].url, None, None, &cpn).is_err());
        let direct = finalize_url(&candidates[1].url, None, None, "bad").unwrap();
        assert!(direct.contains("n=abc") && !direct.contains("cpn="));
    }

    #[test]
    fn host_allowlist_blocks_ssrf() {
        assert!(
            validate_stream_url("https://rr3---sn-abc.googlevideo.com/videoplayback?x=1").is_ok()
        );
        for bad in [
            "http://rr3---sn-abc.googlevideo.com/videoplayback",
            "https://evil.com/videoplayback",
            "https://googlevideo.com.evil.com/",
            "https://127.0.0.1/videoplayback",
            "https://[::1]/videoplayback",
            "https://user:pw@rr3.googlevideo.com/",
            "https://rr3.googlevideo.com:8443/",
            "file:///C:/Windows/win.ini",
        ] {
            assert!(validate_stream_url(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn stream_probe_reads_past_the_first_megabyte() {
        assert_eq!(stream_probe_range(None), None);
        assert_eq!(stream_probe_range(Some(500_000)), None);
        assert_eq!(
            stream_probe_range(Some(STREAM_PROBE_MIN_OFFSET + STREAM_PROBE_LEN)),
            None
        );
        // 4 MB file: probe the middle.
        assert_eq!(
            stream_probe_range(Some(4_001_721)),
            Some((2_000_860, 2_001_883))
        );
        // 1.5 MB file: never before the 1 MiB gate, never past the end.
        let (start, end) = stream_probe_range(Some(1_500_000)).unwrap();
        assert!(start >= STREAM_PROBE_MIN_OFFSET && end < 1_500_000);
        let (start, end) = stream_probe_range(Some(STREAM_PROBE_MIN_OFFSET + 1500)).unwrap();
        assert_eq!(start, STREAM_PROBE_MIN_OFFSET);
        assert!(end < STREAM_PROBE_MIN_OFFSET + 1500);
        assert_eq!(end - start + 1, STREAM_PROBE_LEN);
    }

    #[test]
    fn stream_access_classifies_media_server_status() {
        assert_eq!(stream_access(206), StreamAccess::Ok);
        assert_eq!(stream_access(200), StreamAccess::Ok);
        assert_eq!(stream_access(403), StreamAccess::Forbidden);
        assert_eq!(stream_access(410), StreamAccess::Forbidden);
        assert_eq!(stream_access(503), StreamAccess::Inconclusive);
        assert!(!Category::StreamForbidden.is_final());
    }

    #[test]
    fn demoted_clients_move_to_the_back_then_recover() {
        let now = Instant::now();
        let mut health = ClientHealth::default();
        health.demote("ANDROID_VR_1_65_10", now);
        let mut clients = client_order(false, true, Hints::default(), &[]);
        health.reorder(&mut clients, now);
        let order: Vec<&str> = clients.iter().map(|c| c.key).collect();
        assert_eq!(order.last(), Some(&"ANDROID_VR_1_65_10"));
        assert_eq!(order[0], "VISIONOS_0_1");
        assert!(order.contains(&"WEB_REMIX"));
        let later = now + DEMOTED_CLIENT_TTL + Duration::from_secs(1);
        let mut clients = client_order(false, true, Hints::default(), &[]);
        health.reorder(&mut clients, later);
        assert_eq!(clients[0].key, "ANDROID_VR_1_65_10");
        health.clear();
        assert!(!health.is_demoted("ANDROID_VR_1_65_10", now));
    }

    #[test]
    fn audio_candidates_keep_content_length() {
        let response = serde_json::json!({"streamingData": {"adaptiveFormats": [
            {"itag": 251, "mimeType": "audio/webm; codecs=\"opus\"", "bitrate": 130000,
             "contentLength": "4001721", "url": "https://rr1---sn-x.googlevideo.com/videoplayback?id=1"}
        ]}});
        let candidates = audio_candidates(&response, false);
        assert_eq!(candidates[0].content_length, Some(4_001_721));
    }

    #[test]
    fn browser_clients_take_po_tokens_and_pot_is_added_safely() {
        let po: Vec<&str> = CLIENTS
            .iter()
            .filter(|c| c.po_token)
            .map(|c| c.key)
            .collect();
        assert_eq!(po, ["WEB_REMIX", "WEB_EMBEDDED_PLAYER", "WEB_CREATOR"]);
        assert!(CLIENTS
            .iter()
            .filter(|c| c.po_token)
            .all(|c| c.user_agent == BROWSER_USER_AGENT));
        let url = with_pot(
            "https://rr1.googlevideo.com/videoplayback?id=1&pot=old&n=x",
            "NEW_tok-en",
        )
        .unwrap();
        let query: HashMap<String, String> = url::Url::parse(&url)
            .unwrap()
            .query_pairs()
            .into_owned()
            .collect();
        assert_eq!(query.get("pot").map(String::as_str), Some("NEW_tok-en"));
        assert_eq!(url.matches("pot=").count(), 1);
        assert!(with_pot("https://evil.example/videoplayback", "t").is_err());
        assert!(
            retry_without_po_token(Category::StreamForbidden)
                && !retry_without_po_token(Category::Unavailable)
        );
        assert!(summarize(&[Attempt {
            client: "WEB_REMIX",
            category: Category::PoTokenUnavailable,
            detail: String::new()
        }])
        .contains("proof-of-origin"));
        assert_eq!(redact("poToken=abc pot=xyz"), "[secret] [secret]");
    }
}
