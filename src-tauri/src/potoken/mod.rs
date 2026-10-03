//! Proof-of-origin (PO) tokens for the web clients (PLAY-010, D-048).
//!
//! Like reference Meld (`PoTokenGenerator`, `WEB_BOTGUARD`), Desktop runs Google's BotGuard check in a
//! hidden webview and mints tokens for **this user's own playback only**: one content-bound token per
//! video for the `/player` request (`serviceIntegrityDimensions.poToken`) and one session-bound token
//! (visitor data, or the account's data-sync id when signed in) for the stream URL (`pot`).
//!
//! The webview is `about:blank`, incognito, has no capability (so no IPC), refuses every navigation
//! and popup, and never fetches anything itself: Rust fetches the challenge, the interpreter and the
//! integrity token, evaluates them there and polls the driver (`driver.js`) for results. Tokens are
//! never logged or stored on disk. Without a token the resolver behaves as before (D-016/D-017), and a
//! failure is reported as an explicit reason. Protocol after LuanRT/BgUtils (MIT).

use std::future::Future;
use std::pin::Pin;
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde_json::{json, Value};

pub mod webview;

pub const REQUEST_KEY: &str = "O43z0dpjhgX20SCx4KAo";
pub const API_KEY: &str = "AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw";
pub const WAA_BASE: &str = "https://jnn-pa.googleapis.com/$rpc/google.internal.waa.v1.Waa";
pub const DRIVER_JS: &str = include_str!("driver.js");
/// Label of the hidden webview. No capability file may list it (see tests).
pub const WINDOW_LABEL: &str = "potoken";
pub const MAX_INTERPRETER_BYTES: usize = 2 * 1024 * 1024;
const MAX_PROGRAM_BYTES: usize = 512 * 1024;
const POLL_INTERVAL: Duration = Duration::from_millis(50);
pub const JOB_TIMEOUT: Duration = Duration::from_secs(25);
/// Whole budget for getting tokens for one resolution; past it the song resolves without them.
pub const ACQUIRE_TIMEOUT: Duration = Duration::from_secs(30);
const BACKOFF_START: Duration = Duration::from_secs(5 * 60);
const BACKOFF_MAX: Duration = Duration::from_secs(60 * 60);
const MIN_REFRESH_MARGIN: Duration = Duration::from_secs(5 * 60);

pub type BoxFut<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Challenge {
    pub interpreter_js: Option<String>,
    pub interpreter_url: Option<url::Url>,
    pub program: String,
    pub global_name: String,
}

/// Parse a `Waa/Create` response: either `[[messageId, script, url, hash, program, globalName, …]]`
/// or `[_, "<scrambled base64>"]`.
pub fn parse_challenge(raw: &Value) -> Result<Challenge, String> {
    let list = raw.as_array().ok_or("challenge is not a list")?;
    let data: Value = match (list.first(), list.get(1)) {
        (_, Some(Value::String(scrambled))) => {
            let text = descramble(scrambled).ok_or("challenge could not be descrambled")?;
            serde_json::from_str(&text).map_err(|_| "descrambled challenge is not JSON")?
        }
        (Some(first @ Value::Array(_)), _) => first.clone(),
        _ => return Err("challenge has an unknown shape".to_owned()),
    };
    let field = |index: usize| data.get(index);
    let first_string = |value: Option<&Value>| {
        value
            .and_then(Value::as_array)
            .and_then(|items| {
                items
                    .iter()
                    .find_map(|item| item.as_str().filter(|s| !s.is_empty()))
            })
            .map(str::to_owned)
    };
    let interpreter_js = first_string(field(1));
    let interpreter_url = first_string(field(2)).and_then(|value| interpreter_url(&value));
    let program = field(4)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty() && value.len() <= MAX_PROGRAM_BYTES)
        .ok_or("challenge program missing")?
        .to_owned();
    let global_name = field(5)
        .and_then(Value::as_str)
        .filter(|value| valid_global_name(value))
        .ok_or("challenge global name missing or invalid")?
        .to_owned();
    if interpreter_js
        .as_ref()
        .is_some_and(|js| js.len() > MAX_INTERPRETER_BYTES)
    {
        return Err("challenge interpreter too large".to_owned());
    }
    if interpreter_js.is_none() && interpreter_url.is_none() {
        return Err("challenge has no interpreter".to_owned());
    }
    Ok(Challenge {
        interpreter_js,
        interpreter_url,
        program,
        global_name,
    })
}

/// Undo the challenge scrambling: base64 (standard or web-safe), then every byte + 97.
pub fn descramble(text: &str) -> Option<String> {
    let normalized: String = text
        .chars()
        .map(|c| match c {
            '-' => '+',
            '_' => '/',
            '.' => '=',
            other => other,
        })
        .collect();
    let bytes = BASE64.decode(normalized.trim()).ok()?;
    if bytes.is_empty() {
        return None;
    }
    String::from_utf8(bytes.into_iter().map(|b| b.wrapping_add(97)).collect()).ok()
}

/// The interpreter may only come from Google over HTTPS (`//www.google.com/js/th/…`).
pub fn interpreter_url(value: &str) -> Option<url::Url> {
    let absolute = if value.starts_with("//") {
        format!("https:{value}")
    } else {
        value.to_owned()
    };
    let parsed = url::Url::parse(&absolute).ok()?;
    let host = match parsed.host() {
        Some(url::Host::Domain(host)) => host.to_ascii_lowercase(),
        _ => return None,
    };
    let google = host == "www.google.com" || host == "www.gstatic.com";
    (parsed.scheme() == "https"
        && google
        && parsed.port().is_none()
        && parsed.username().is_empty()
        && parsed.password().is_none())
    .then_some(parsed)
}

pub fn valid_global_name(value: &str) -> bool {
    let mut chars = value.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_alphabetic() || c == '_' || c == '$')
        && value.len() <= 64
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Integrity {
    pub token: String,
    pub ttl: Duration,
    pub refresh_threshold: Duration,
}

/// Parse a `Waa/GenerateIT` response: `[integrityToken, estimatedTtlSecs, mintRefreshThreshold, …]`.
pub fn parse_integrity(raw: &Value) -> Result<Integrity, String> {
    let token = raw
        .get(0)
        .and_then(Value::as_str)
        .filter(|value| valid_token(value))
        .ok_or("integrity token missing")?
        .to_owned();
    let seconds = |index: usize, default: u64| {
        raw.get(index)
            .and_then(|value| {
                value
                    .as_u64()
                    .or_else(|| value.as_str().and_then(|s| s.parse().ok()))
            })
            .unwrap_or(default)
    };
    Ok(Integrity {
        token,
        ttl: Duration::from_secs(seconds(1, 3600).clamp(60, 86_400)),
        refresh_threshold: Duration::from_secs(seconds(2, 300).min(3600)),
    })
}

/// Web-safe base64 of reasonable size.
pub fn valid_token(value: &str) -> bool {
    (16..=8192).contains(&value.len())
        && value.bytes().all(|b| {
            b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'+' | b'/' | b'=' | b'.')
        })
}

/// Video ids, visitor data and data-sync ids: printable ASCII, no quotes or spaces.
pub fn valid_identifier(value: &str) -> bool {
    (1..=512).contains(&value.len())
        && value
            .bytes()
            .all(|b| b.is_ascii_graphic() && b != b'"' && b != b'\\')
}

fn js(value: impl serde::Serialize) -> String {
    serde_json::to_string(&value).unwrap_or_else(|_| "null".to_owned())
}

/// Evaluate the interpreter as a global script and report failures as a value (Windows drops exceptions).
pub fn interpreter_script(source: &str) -> String {
    format!(
        "(() => {{ try {{ (0, eval)({}); return \"interpreter-ok\"; }} catch (e) {{ return \"interpreter-error: \" + String(e && e.message || e).slice(0, 200); }} }})()",
        js(source)
    )
}

pub fn snapshot_call(id: &str, challenge: &Challenge) -> String {
    format!(
        "window.__meldPo.snapshot({}, {}, {})",
        js(id),
        js(&challenge.program),
        js(&challenge.global_name)
    )
}

pub fn minter_call(id: &str, integrity_token: &str) -> String {
    format!(
        "window.__meldPo.minter({}, {})",
        js(id),
        js(integrity_token)
    )
}

pub fn mint_call(id: &str, identifiers: &[&str]) -> String {
    format!("window.__meldPo.mint({}, {})", js(id), js(identifiers))
}

pub fn poll_call(id: &str) -> String {
    format!("window.__meldPo ? window.__meldPo.poll({}) : '{{\"state\":\"err\",\"error\":\"driver missing\"}}'", js(id))
}

#[derive(Debug, Clone, PartialEq)]
pub enum Poll {
    Pending,
    Done(Value),
    Failed(String),
}

/// `eval_with_callback` hands back the JSON encoding of the returned string; accept both layers.
pub fn unwrap_eval(raw: &str) -> String {
    match serde_json::from_str::<Value>(raw) {
        Ok(Value::String(inner)) => inner,
        _ => raw.to_owned(),
    }
}

pub fn parse_poll(raw: &str) -> Poll {
    let Ok(value) = serde_json::from_str::<Value>(&unwrap_eval(raw)) else {
        return Poll::Failed("driver answer unreadable".to_owned());
    };
    match value.get("state").and_then(Value::as_str) {
        Some("pending") => Poll::Pending,
        Some("ok") => Poll::Done(value.get("value").cloned().unwrap_or(Value::Null)),
        _ => Poll::Failed(
            value
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("driver error")
                .chars()
                .take(200)
                .collect(),
        ),
    }
}

/// Retry policy after a failed BotGuard run: 5 min, doubling, at most 1 h; reset on success.
#[derive(Debug, Default)]
pub struct Backoff {
    failures: u32,
    until: Option<Instant>,
}

impl Backoff {
    pub fn allowed(&self, now: Instant) -> bool {
        self.until.is_none_or(|until| now >= until)
    }
    pub fn record_failure(&mut self, now: Instant) -> Duration {
        self.failures = self.failures.saturating_add(1);
        let delay = BACKOFF_START
            .saturating_mul(1u32 << (self.failures - 1).min(8))
            .min(BACKOFF_MAX);
        self.until = Some(now + delay);
        delay
    }
    pub fn record_success(&mut self) {
        *self = Self::default();
    }
}

/// Where the BotGuard scripts run (the hidden webview; a fake in tests).
pub trait JsHost: Send + Sync {
    /// Start from a fresh, empty page.
    fn reset(&self) -> BoxFut<'_, Result<(), String>>;
    /// Evaluate a script and return its JSON-encoded result.
    fn eval(&self, script: String) -> BoxFut<'_, Result<String, String>>;
}

/// The three requests the provider makes (Rust's HTTP client; a fake in tests).
pub trait Network: Send + Sync {
    fn waa(&self, endpoint: &'static str, body: Value) -> BoxFut<'_, Result<Value, String>>;
    fn interpreter(&self, url: url::Url) -> BoxFut<'_, Result<String, String>>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Tokens {
    /// Bound to the video id: `serviceIntegrityDimensions.poToken` of the `/player` request.
    pub player: String,
    /// Bound to the visitor data / data-sync id: the stream URL's `pot` parameter.
    pub stream: String,
}

/// One BotGuard session: a loaded VM plus a minter valid until `expires`.
pub struct Provider<H, N> {
    host: H,
    net: N,
    expires: Option<Instant>,
    backoff: Backoff,
    next_job: u64,
    job_timeout: Duration,
}

impl<H: JsHost, N: Network> Provider<H, N> {
    pub fn new(host: H, net: N) -> Self {
        Self {
            host,
            net,
            expires: None,
            backoff: Backoff::default(),
            next_job: 0,
            job_timeout: JOB_TIMEOUT,
        }
    }

    #[cfg(test)]
    pub fn with_job_timeout(mut self, timeout: Duration) -> Self {
        self.job_timeout = timeout;
        self
    }

    #[cfg(test)]
    pub fn expire(&mut self) {
        self.expires = Some(Instant::now());
    }

    pub fn ready(&self, now: Instant) -> bool {
        self.expires.is_some_and(|expires| now < expires)
    }

    async fn job(&mut self, start: impl Fn(&str) -> String) -> Result<Value, String> {
        self.next_job += 1;
        let id = format!("j{}", self.next_job);
        let started = unwrap_eval(&self.host.eval(start(&id)).await?);
        if started != "started" {
            return Err("driver did not start the job".to_owned());
        }
        let deadline = Instant::now() + self.job_timeout;
        loop {
            match parse_poll(&self.host.eval(poll_call(&id)).await?) {
                Poll::Pending if Instant::now() < deadline => {
                    tokio::time::sleep(POLL_INTERVAL).await
                }
                Poll::Pending => return Err("BotGuard job timed out".to_owned()),
                Poll::Done(value) => return Ok(value),
                Poll::Failed(error) => return Err(error),
            }
        }
    }

    /// Run BotGuard and set up a minter.
    async fn start_session(&mut self) -> Result<(), String> {
        self.expires = None;
        let challenge = parse_challenge(&self.net.waa("Create", json!([REQUEST_KEY])).await?)?;
        let interpreter = match (&challenge.interpreter_js, &challenge.interpreter_url) {
            (Some(js), _) => js.clone(),
            (None, Some(url)) => self.net.interpreter(url.clone()).await?,
            (None, None) => return Err("challenge has no interpreter".to_owned()),
        };
        if interpreter.len() > MAX_INTERPRETER_BYTES {
            return Err("interpreter too large".to_owned());
        }
        self.host.reset().await?;
        let loaded = unwrap_eval(&self.host.eval(interpreter_script(&interpreter)).await?);
        if loaded != "interpreter-ok" {
            return Err(loaded.chars().take(200).collect());
        }
        if unwrap_eval(&self.host.eval(DRIVER_JS.to_owned()).await?) != "driver-ready" {
            return Err("driver did not load".to_owned());
        }
        let started = Instant::now();
        let response = self.job(|id| snapshot_call(id, &challenge)).await?;
        let response = response
            .as_str()
            .filter(|value| !value.is_empty())
            .ok_or("empty BotGuard response")?
            .to_owned();
        let integrity = parse_integrity(
            &self
                .net
                .waa("GenerateIT", json!([REQUEST_KEY, response]))
                .await?,
        )?;
        let ready = self.job(|id| minter_call(id, &integrity.token)).await?;
        if ready.as_str() != Some("ready") {
            return Err("minter not ready".to_owned());
        }
        let margin = integrity.refresh_threshold.max(MIN_REFRESH_MARGIN);
        self.expires = Some(
            started
                + integrity
                    .ttl
                    .saturating_sub(margin)
                    .max(Duration::from_secs(60)),
        );
        Ok(())
    }

    /// Make sure a BotGuard session with a valid minter exists (respecting the failure backoff).
    pub async fn ensure(&mut self) -> Result<(), String> {
        let now = Instant::now();
        if self.ready(now) {
            return Ok(());
        }
        if !self.backoff.allowed(now) {
            return Err("BotGuard is backing off after a failure".to_owned());
        }
        match self.start_session().await {
            Ok(()) => {
                self.backoff.record_success();
                Ok(())
            }
            Err(error) => {
                self.backoff.record_failure(Instant::now());
                Err(error)
            }
        }
    }

    /// Mint the player and stream tokens for one resolution, starting a BotGuard session when needed.
    pub async fn tokens(&mut self, video_id: &str, session_id: &str) -> Result<Tokens, String> {
        if !valid_identifier(video_id) || !valid_identifier(session_id) {
            return Err("invalid token binding".to_owned());
        }
        self.ensure().await?;
        let minted = match self.job(|id| mint_call(id, &[video_id, session_id])).await {
            Ok(value) => value,
            Err(error) => {
                // A broken minter is not reused; the next call starts a new session.
                self.expires = None;
                return Err(error);
            }
        };
        let tokens: Vec<String> = minted
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default();
        match tokens.as_slice() {
            [player, stream] if valid_token(player) && valid_token(stream) => Ok(Tokens {
                player: player.clone(),
                stream: stream.clone(),
            }),
            _ => {
                self.expires = None;
                Err("minted tokens are malformed".to_owned())
            }
        }
    }
}

#[cfg(test)]
mod tests;
