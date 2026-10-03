use std::sync::{Arc, Mutex};

use super::webview::navigation_allowed;
use super::*;

fn scramble(text: &str) -> String {
    BASE64.encode(
        text.bytes()
            .map(|b| b.wrapping_sub(97))
            .collect::<Vec<u8>>(),
    )
}

fn challenge_data(js: Option<&str>, url: Option<&str>) -> Value {
    json!([
        "msg",
        [null, js],
        [null, url],
        "hash",
        "PROGRAM",
        "trayride",
        null,
        "blob"
    ])
}

#[test]
fn parses_plain_and_scrambled_challenges() {
    let plain = parse_challenge(&json!([challenge_data(Some("var x=1"), None)])).unwrap();
    assert_eq!(plain.interpreter_js.as_deref(), Some("var x=1"));
    assert_eq!(
        (plain.program.as_str(), plain.global_name.as_str()),
        ("PROGRAM", "trayride")
    );
    let scrambled = json!([
        2,
        scramble(&challenge_data(None, Some("//www.google.com/js/th/abc.js")).to_string())
    ]);
    let parsed = parse_challenge(&scrambled).unwrap();
    assert_eq!(parsed.interpreter_js, None);
    assert_eq!(
        parsed.interpreter_url.unwrap().as_str(),
        "https://www.google.com/js/th/abc.js"
    );
}

#[test]
fn rejects_bad_challenges() {
    assert!(parse_challenge(&json!({})).is_err());
    assert!(parse_challenge(&json!([challenge_data(None, None)])).is_err());
    assert!(parse_challenge(&json!([challenge_data(
        None,
        Some("https://evil.example/x.js")
    )]))
    .is_err());
    let mut bad_name = challenge_data(Some("x"), None);
    bad_name[5] = json!("a;alert(1)");
    assert!(parse_challenge(&json!([bad_name])).is_err());
    assert!(parse_challenge(&json!([1, "!!!not base64"])).is_err());
}

#[test]
fn interpreter_only_from_google_over_https() {
    assert!(interpreter_url("//www.google.com/js/th/x.js").is_some());
    assert!(interpreter_url("https://www.gstatic.com/x.js").is_some());
    for bad in [
        "http://www.google.com/js/th/x.js",
        "https://www.google.com.evil.example/x.js",
        "https://user@www.google.com/x.js",
        "https://www.google.com:8443/x.js",
        "https://127.0.0.1/x.js",
        "javascript:alert(1)",
    ] {
        assert!(interpreter_url(bad).is_none(), "{bad}");
    }
}

#[test]
fn parses_integrity_with_defaults_and_clamps() {
    let token = "A".repeat(40);
    let parsed = parse_integrity(&json!([token, 43200, 100, "fallback"])).unwrap();
    assert_eq!(parsed.ttl, Duration::from_secs(43200));
    assert_eq!(parsed.refresh_threshold, Duration::from_secs(100));
    let defaults = parse_integrity(&json!([token])).unwrap();
    assert_eq!(defaults.ttl, Duration::from_secs(3600));
    assert_eq!(
        parse_integrity(&json!([token, 1])).unwrap().ttl,
        Duration::from_secs(60)
    );
    assert_eq!(
        parse_integrity(&json!([token, "999999"])).unwrap().ttl,
        Duration::from_secs(86_400)
    );
    assert!(parse_integrity(&json!(["short"])).is_err());
    assert!(parse_integrity(&json!([format!("{token}\"<script>")])).is_err());
}

#[test]
fn driver_calls_encode_arguments_as_json() {
    let challenge = Challenge {
        interpreter_js: None,
        interpreter_url: None,
        program: "\"); alert(1); (\"".to_owned(),
        global_name: "trayride".to_owned(),
    };
    let call = snapshot_call("j1", &challenge);
    let args = call
        .strip_prefix("window.__meldPo.snapshot(")
        .unwrap()
        .strip_suffix(')')
        .unwrap();
    let parsed: Vec<String> = serde_json::from_str(&format!("[{args}]")).unwrap();
    assert_eq!(parsed, ["j1", challenge.program.as_str(), "trayride"]);
    let mint = mint_call("j2", &["vid", "visitor\u{2028}"]);
    assert!(mint.starts_with("window.__meldPo.mint(\"j2\", [\"vid\""));
    let script = interpreter_script("var a = '</script>'; throw 1");
    assert!(script.contains("(0, eval)(\"var a = '</script>'; throw 1\")"));
}

#[test]
fn poll_answers_are_unwrapped() {
    assert_eq!(
        parse_poll(&json!(r#"{"state":"pending"}"#).to_string()),
        Poll::Pending
    );
    assert_eq!(
        parse_poll(r#"{"state":"ok","value":"x"}"#),
        Poll::Done(json!("x"))
    );
    assert_eq!(
        parse_poll(&json!(r#"{"state":"err","error":"boom"}"#).to_string()),
        Poll::Failed("boom".to_owned())
    );
    assert!(matches!(parse_poll("garbage"), Poll::Failed(_)));
    assert_eq!(unwrap_eval("\"started\""), "started");
}

#[test]
fn backoff_doubles_to_an_hour_and_resets() {
    let mut backoff = Backoff::default();
    let now = Instant::now();
    assert!(backoff.allowed(now));
    assert_eq!(backoff.record_failure(now), Duration::from_secs(300));
    assert!(!backoff.allowed(now + Duration::from_secs(299)));
    assert!(backoff.allowed(now + Duration::from_secs(300)));
    assert_eq!(backoff.record_failure(now), Duration::from_secs(600));
    for _ in 0..10 {
        backoff.record_failure(now);
    }
    assert_eq!(backoff.record_failure(now), Duration::from_secs(3600));
    backoff.record_success();
    assert!(backoff.allowed(now));
}

#[test]
fn identifiers_and_tokens_are_validated() {
    assert!(valid_identifier("dQw4w9WgXcQ") && valid_identifier("CgtVaXNpdG9yRGF0YQ%3D%3D"));
    assert!(!valid_identifier("") && !valid_identifier("a b") && !valid_identifier("a\"b"));
    assert!(valid_token(&"a-b_".repeat(10)) && !valid_token("tiny"));
}

#[test]
fn driver_never_touches_the_network_or_navigation() {
    for banned in [
        "fetch(",
        "XMLHttpRequest",
        "location",
        "window.open",
        "import(",
        "WebSocket",
        "__TAURI",
    ] {
        assert!(
            !DRIVER_JS.contains(banned),
            "driver.js must not use {banned}"
        );
    }
    assert!(DRIVER_JS.trim_end().ends_with("(\"driver-ready\");"));
}

#[test]
fn webview_is_locked_down() {
    assert!(navigation_allowed(&"about:blank".parse().unwrap()));
    for url in [
        "https://www.youtube.com/",
        "about:srcdoc",
        "file:///C:/",
        "tauri://localhost/",
    ] {
        assert!(!navigation_allowed(&url.parse().unwrap()), "{url}");
    }
    // No capability may reach the PoToken webview: it must have no IPC at all.
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities");
    for entry in std::fs::read_dir(dir).unwrap() {
        let text = std::fs::read_to_string(entry.unwrap().path()).unwrap();
        let capability: Value = serde_json::from_str(&text).unwrap();
        for list in ["windows", "webviews"] {
            for label in capability
                .get(list)
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                let label = label.as_str().unwrap_or_default();
                assert!(
                    label != WINDOW_LABEL && !label.contains('*'),
                    "capability grants {label}"
                );
            }
        }
        assert!(
            capability.get("remote").is_none(),
            "no capability may grant remote origins"
        );
    }
    let source = include_str!("webview.rs");
    for required in [
        ".incognito(true)",
        ".visible(false)",
        ".on_navigation(navigation_allowed)",
        "NewWindowResponse::Deny",
    ] {
        assert!(
            source.contains(required),
            "PoToken webview must use {required}"
        );
    }
}

// ---- provider state machine with fakes ----

#[derive(Default)]
struct Script {
    evals: Vec<String>,
    resets: usize,
    jobs: Vec<(String, Value)>,
    mint_answer: Option<Value>,
    pending_forever: bool,
}

#[derive(Clone, Default)]
struct FakeHost(Arc<Mutex<Script>>);

fn job_id(script: &str) -> String {
    script.split('"').nth(1).unwrap_or_default().to_owned()
}

impl JsHost for FakeHost {
    fn reset(&self) -> BoxFut<'_, Result<(), String>> {
        self.0.lock().unwrap().resets += 1;
        Box::pin(async { Ok(()) })
    }
    fn eval(&self, script: String) -> BoxFut<'_, Result<String, String>> {
        let mut state = self.0.lock().unwrap();
        state.evals.push(script.chars().take(60).collect());
        let answer = if script.starts_with("(() => { try { (0, eval)(") {
            json!("interpreter-ok")
        } else if script == DRIVER_JS {
            json!("driver-ready")
        } else if script.starts_with("window.__meldPo.snapshot(") {
            state
                .jobs
                .push((job_id(&script), json!("BOTGUARD-RESPONSE")));
            json!("started")
        } else if script.starts_with("window.__meldPo.minter(") {
            state.jobs.push((job_id(&script), json!("ready")));
            json!("started")
        } else if script.starts_with("window.__meldPo.mint(") {
            let value = state
                .mint_answer
                .clone()
                .unwrap_or_else(|| json!(["P".repeat(30), "S".repeat(30)]));
            state.jobs.push((job_id(&script), value));
            json!("started")
        } else if script.starts_with("window.__meldPo ? window.__meldPo.poll(") {
            let id = script
                .split('(')
                .nth(1)
                .and_then(|rest| rest.split('"').nth(1))
                .unwrap_or_default()
                .to_owned();
            if state.pending_forever {
                json!(r#"{"state":"pending"}"#)
            } else {
                match state.jobs.iter().position(|(job, _)| *job == id) {
                    Some(index) => {
                        let (_, value) = state.jobs.remove(index);
                        json!(json!({ "state": "ok", "value": value }).to_string())
                    }
                    None => json!(r#"{"state":"err","error":"unknown job"}"#),
                }
            }
        } else {
            json!(null)
        };
        Box::pin(async move { Ok(answer.to_string()) })
    }
}

#[derive(Clone, Default)]
struct FakeNet {
    calls: Arc<Mutex<Vec<String>>>,
    fail_create: bool,
    url_only: bool,
}

impl Network for FakeNet {
    fn waa(&self, endpoint: &'static str, body: Value) -> BoxFut<'_, Result<Value, String>> {
        self.calls.lock().unwrap().push(endpoint.to_owned());
        let result = match endpoint {
            "Create" if self.fail_create => Err("BotGuard Create answered 429".to_owned()),
            "Create" if self.url_only => Ok(json!([challenge_data(
                None,
                Some("//www.google.com/js/th/i.js")
            )])),
            "Create" => Ok(json!([challenge_data(Some("var trayride={}"), None)])),
            "GenerateIT" => {
                assert_eq!(body, json!([REQUEST_KEY, "BOTGUARD-RESPONSE"]));
                Ok(json!(["I".repeat(40), 43200, 100]))
            }
            _ => Err("unexpected".to_owned()),
        };
        Box::pin(async move { result })
    }
    fn interpreter(&self, url: url::Url) -> BoxFut<'_, Result<String, String>> {
        self.calls.lock().unwrap().push(format!("GET {url}"));
        Box::pin(async { Ok("var trayride={}".to_owned()) })
    }
}

fn run<T>(future: impl Future<Output = T>) -> T {
    tauri::async_runtime::block_on(future)
}

#[test]
fn mints_tokens_and_reuses_the_session() {
    let host = FakeHost::default();
    let net = FakeNet::default();
    let mut provider = Provider::new(host.clone(), net.clone());
    let tokens = run(provider.tokens("dQw4w9WgXcQ", "CgtVISITOR")).unwrap();
    assert_eq!(
        tokens,
        Tokens {
            player: "P".repeat(30),
            stream: "S".repeat(30)
        }
    );
    run(provider.tokens("other12345a", "CgtVISITOR")).unwrap();
    assert_eq!(*net.calls.lock().unwrap(), ["Create", "GenerateIT"]);
    assert_eq!(host.0.lock().unwrap().resets, 1);
    // Expired minter: a new BotGuard session.
    provider.expire();
    run(provider.tokens("dQw4w9WgXcQ", "CgtVISITOR")).unwrap();
    assert_eq!(net.calls.lock().unwrap().len(), 4);
    assert_eq!(host.0.lock().unwrap().resets, 2);
}

#[test]
fn fetches_an_interpreter_url_when_the_script_is_not_inline() {
    let net = FakeNet {
        url_only: true,
        ..FakeNet::default()
    };
    let mut provider = Provider::new(FakeHost::default(), net.clone());
    run(provider.tokens("dQw4w9WgXcQ", "CgtVISITOR")).unwrap();
    assert_eq!(
        net.calls.lock().unwrap()[1],
        "GET https://www.google.com/js/th/i.js"
    );
}

#[test]
fn failures_back_off_without_hammering_google() {
    let net = FakeNet {
        fail_create: true,
        ..FakeNet::default()
    };
    let mut provider = Provider::new(FakeHost::default(), net.clone());
    let error = run(provider.tokens("dQw4w9WgXcQ", "CgtVISITOR")).unwrap_err();
    assert!(error.contains("429"));
    let error = run(provider.tokens("dQw4w9WgXcQ", "CgtVISITOR")).unwrap_err();
    assert!(error.contains("backing off"));
    assert_eq!(net.calls.lock().unwrap().len(), 1);
}

#[test]
fn malformed_mints_drop_the_session() {
    let host = FakeHost::default();
    host.0.lock().unwrap().mint_answer = Some(json!(["only-one-token-here-xxxxxxxx"]));
    let net = FakeNet::default();
    let mut provider = Provider::new(host.clone(), net.clone());
    assert!(run(provider.tokens("dQw4w9WgXcQ", "CgtVISITOR"))
        .unwrap_err()
        .contains("malformed"));
    assert!(!provider.ready(Instant::now()));
    host.0.lock().unwrap().mint_answer = None;
    run(provider.tokens("dQw4w9WgXcQ", "CgtVISITOR")).unwrap();
    assert_eq!(net.calls.lock().unwrap().len(), 4);
}

#[test]
fn stuck_jobs_time_out_and_bad_bindings_are_refused() {
    let host = FakeHost::default();
    host.0.lock().unwrap().pending_forever = true;
    let mut provider =
        Provider::new(host, FakeNet::default()).with_job_timeout(Duration::from_millis(120));
    assert!(run(provider.tokens("dQw4w9WgXcQ", "CgtVISITOR"))
        .unwrap_err()
        .contains("timed out"));
    let mut fresh = Provider::new(FakeHost::default(), FakeNet::default());
    assert!(run(fresh.tokens("bad id", "CgtVISITOR")).is_err());
}
