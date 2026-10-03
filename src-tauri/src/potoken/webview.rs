//! The real host and network for the PoToken provider: a hidden, incognito, IPC-less webview and
//! Rust's HTTP client. `tokens()` is what the resolver calls.

use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde_json::Value;
use tauri::webview::{NewWindowResponse, WebviewWindowBuilder};
use tauri::{AppHandle, Manager, WebviewUrl, Wry};

use super::{
    BoxFut, JsHost, Network, Provider, Tokens, ACQUIRE_TIMEOUT, API_KEY, MAX_INTERPRETER_BYTES,
    WAA_BASE, WINDOW_LABEL,
};

const EVAL_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_WAA_BYTES: usize = 4 * 1024 * 1024;
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

static APP: OnceLock<AppHandle<Wry>> = OnceLock::new();
type Live = Provider<WebviewHost, HttpNetwork>;
static PROVIDER: OnceLock<tokio::sync::Mutex<Live>> = OnceLock::new();

/// Called once from `setup`.
pub fn install(app: AppHandle<Wry>) {
    let _ = APP.set(app);
}

/// Tokens for one resolution, or the reason there are none. Never blocks longer than `ACQUIRE_TIMEOUT`.
pub async fn tokens(video_id: &str, session_id: &str) -> Result<Tokens, String> {
    if APP.get().is_none() {
        return Err("PoToken provider not installed".to_owned());
    }
    let provider = provider();
    let work = async {
        let mut provider = provider.lock().await;
        provider.tokens(video_id, session_id).await
    };
    tokio::time::timeout(ACQUIRE_TIMEOUT, work)
        .await
        .unwrap_or_else(|_| Err("PoToken timed out".to_owned()))
}

fn provider() -> &'static tokio::sync::Mutex<Live> {
    PROVIDER.get_or_init(|| tokio::sync::Mutex::new(Provider::new(WebviewHost, HttpNetwork)))
}

pub struct WebviewHost;

fn app() -> Result<&'static AppHandle<Wry>, String> {
    APP.get()
        .ok_or_else(|| "PoToken provider not installed".to_owned())
}

/// Only the initial blank page may load; BotGuard never gets to navigate anywhere.
pub fn navigation_allowed(url: &url::Url) -> bool {
    url.as_str() == "about:blank"
}

impl JsHost for WebviewHost {
    fn reset(&self) -> BoxFut<'_, Result<(), String>> {
        Box::pin(async move {
            let app = app()?;
            if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
                let _ = window.destroy();
                tokio::time::sleep(Duration::from_millis(200)).await;
            }
            let blank: url::Url = "about:blank"
                .parse()
                .map_err(|_| "blank URL failed".to_owned())?;
            WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::External(blank))
                .title("Meld PoToken")
                .visible(false)
                .focused(false)
                .skip_taskbar(true)
                .incognito(true)
                .inner_size(320.0, 240.0)
                .on_navigation(navigation_allowed)
                .on_new_window(|_, _| NewWindowResponse::Deny)
                .build()
                .map_err(|e| format!("PoToken webview failed: {e}"))?;
            // Wait until the blank page answers scripts.
            for _ in 0..50 {
                if self
                    .eval("1".to_owned())
                    .await
                    .is_ok_and(|value| value.trim() == "1")
                {
                    return Ok(());
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
            Err("PoToken webview did not start".to_owned())
        })
    }

    fn eval(&self, script: String) -> BoxFut<'_, Result<String, String>> {
        Box::pin(async move {
            let window = app()?
                .get_webview_window(WINDOW_LABEL)
                .ok_or_else(|| "PoToken webview missing".to_owned())?;
            let (sender, receiver) = tokio::sync::oneshot::channel::<String>();
            let sender = Mutex::new(Some(sender));
            window
                .eval_with_callback(script, move |value| {
                    if let Some(sender) = sender.lock().ok().and_then(|mut slot| slot.take()) {
                        let _ = sender.send(value);
                    }
                })
                .map_err(|e| format!("PoToken eval failed: {e}"))?;
            tokio::time::timeout(EVAL_TIMEOUT, receiver)
                .await
                .map_err(|_| "PoToken eval timed out".to_owned())?
                .map_err(|_| "PoToken eval dropped".to_owned())
        })
    }
}

pub struct HttpNetwork;

async fn limited_body(response: reqwest::Response, limit: usize) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|length| length as usize > limit)
    {
        return Err("BotGuard response too large".to_owned());
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("BotGuard body failed: {e}"))?;
    if bytes.len() > limit {
        return Err("BotGuard response too large".to_owned());
    }
    Ok(bytes.to_vec())
}

impl Network for HttpNetwork {
    fn waa(&self, endpoint: &'static str, body: Value) -> BoxFut<'_, Result<Value, String>> {
        Box::pin(async move {
            let response = crate::http()
                .post(format!("{WAA_BASE}/{endpoint}"))
                .header("Content-Type", "application/json+protobuf")
                .header("x-goog-api-key", API_KEY)
                .header("x-user-agent", "grpc-web-javascript/0.1")
                .header("User-Agent", USER_AGENT)
                .body(body.to_string())
                .send()
                .await
                .map_err(|e| format!("BotGuard {endpoint} failed: {}", e.without_url()))?;
            let status = response.status();
            if !status.is_success() {
                return Err(format!("BotGuard {endpoint} answered {}", status.as_u16()));
            }
            serde_json::from_slice(&limited_body(response, MAX_WAA_BYTES).await?)
                .map_err(|_| format!("BotGuard {endpoint} answer unreadable"))
        })
    }

    fn interpreter(&self, url: url::Url) -> BoxFut<'_, Result<String, String>> {
        Box::pin(async move {
            let response = crate::http()
                .get(url)
                .header("User-Agent", USER_AGENT)
                .send()
                .await
                .map_err(|e| format!("BotGuard interpreter failed: {}", e.without_url()))?
                .error_for_status()
                .map_err(|e| format!("BotGuard interpreter rejected: {}", e.without_url()))?;
            String::from_utf8(limited_body(response, MAX_INTERPRETER_BYTES).await?)
                .map_err(|_| "BotGuard interpreter is not text".to_owned())
        })
    }
}

/// Start a session in the background so the first web-client resolution does not wait for BotGuard.
pub fn prewarm() {
    tauri::async_runtime::spawn(async {
        tokio::time::sleep(Duration::from_secs(25)).await;
        if APP.get().is_some() {
            let provider = provider();
            let work = async { provider.lock().await.ensure().await };
            let _ = tokio::time::timeout(ACQUIRE_TIMEOUT, work).await;
        }
    });
}
