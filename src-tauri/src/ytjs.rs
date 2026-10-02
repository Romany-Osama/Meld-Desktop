//! YouTube player JavaScript challenge solver (PLAY-002).
//!
//! Some YouTube clients (WEB_REMIX, TVHTML5, WEB_CREATOR) only return audio formats whose URL needs a
//! signature (`s`/`sp`) and a throttling parameter (`n`) transformed by functions that live in YouTube's
//! public player script. Like yt-dlp, Meld runs yt-dlp's EJS solver (Unlicense, vendored in
//! `vendor/ejs/`) inside an embedded QuickJS interpreter. The interpreter has no file, network or
//! process access, a memory cap and a hard deadline. This is the same legal format handling that every
//! YouTube web player performs; it does not touch DRM, ads or PoTokens.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use serde_json::{json, Value};

/// SHA-256 of the vendored files, checked by tests so an accidental edit is caught.
pub const EJS_VERSION: &str = "0.8.0";
const SOLVER_LIB: &str = include_str!("../vendor/ejs/yt.solver.lib.js");
const SOLVER_CORE: &str = include_str!("../vendor/ejs/yt.solver.core.js");

const MEMORY_LIMIT_BYTES: usize = 768 * 1024 * 1024;
const STACK_LIMIT_BYTES: usize = 8 * 1024 * 1024;
pub const SOLVE_TIMEOUT: Duration = Duration::from_secs(45);

/// What to give the solver: YouTube's raw `base.js`, or the much smaller preprocessed form returned by a
/// previous solve (cached per player version so later songs solve in milliseconds).
pub enum PlayerSource<'a> {
    Raw(&'a str),
    Preprocessed(&'a str),
}

#[derive(Debug, Default, Clone, PartialEq)]
pub struct SolveOutput {
    pub n: HashMap<String, String>,
    pub sig: HashMap<String, String>,
    pub preprocessed: Option<String>,
    pub errors: Vec<String>,
}

/// Player id from `https://www.youtube.com/iframe_api` (e.g. `8ab5c328`).
pub fn extract_player_id(iframe_api: &str) -> Option<String> {
    let pattern = regex::Regex::new(r"player\\?/([0-9a-fA-F]{8})\\?/").ok()?;
    pattern
        .captures(iframe_api)
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().to_ascii_lowercase())
}

pub fn player_js_url(player_id: &str) -> Option<String> {
    (player_id.len() == 8 && player_id.chars().all(|c| c.is_ascii_hexdigit())).then(|| {
        format!("https://www.youtube.com/s/player/{player_id}/player_ias.vflset/en_US/base.js")
    })
}

/// `signatureTimestamp` that must accompany /player requests for clients with ciphered formats.
pub fn extract_signature_timestamp(player_js: &str) -> Option<u32> {
    let pattern = regex::Regex::new(r"(?:signatureTimestamp|sts)\s*:\s*([0-9]{5})").ok()?;
    pattern
        .captures(player_js)
        .and_then(|captures| captures.get(1))
        .and_then(|value| value.as_str().parse().ok())
}

fn is_safe_solution(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 512
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '=' | '.'))
}

/// Parse the solver's JSON output and keep only well-formed answers. An `n` answer equal to its challenge,
/// or one of the solver's "enhanced_except_" fallbacks, means the transform failed and is dropped.
pub fn parse_output(raw: &str, n: &[String], sig: &[String]) -> Result<SolveOutput, String> {
    let value: Value =
        serde_json::from_str(raw).map_err(|e| format!("solver output is not JSON: {e}"))?;
    if value.get("type").and_then(Value::as_str) != Some("result") {
        let error = value
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("unknown solver error");
        return Err(format!("solver failed: {}", truncate(error, 300)));
    }
    let mut output = SolveOutput {
        preprocessed: value
            .get("preprocessed_player")
            .and_then(Value::as_str)
            .map(str::to_owned),
        ..SolveOutput::default()
    };
    let responses = value
        .get("responses")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for (kind, challenges, response) in
        [("n", n, responses.first()), ("sig", sig, responses.get(1))]
    {
        if challenges.is_empty() {
            continue;
        }
        let Some(response) = response else {
            output.errors.push(format!("{kind}: no response"));
            continue;
        };
        if response.get("type").and_then(Value::as_str) != Some("result") {
            let error = response
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("unknown error");
            output
                .errors
                .push(format!("{kind}: {}", truncate(error, 200)));
            continue;
        }
        let data = response.get("data").and_then(Value::as_object);
        for challenge in challenges {
            let answer = data
                .and_then(|data| data.get(challenge))
                .and_then(Value::as_str);
            match answer {
                Some(answer)
                    if is_safe_solution(answer)
                        && !(kind == "n"
                            && (answer == challenge || answer.starts_with("enhanced_except_"))) =>
                {
                    let target = if kind == "n" {
                        &mut output.n
                    } else {
                        &mut output.sig
                    };
                    target.insert(challenge.clone(), answer.to_owned());
                }
                _ => output
                    .errors
                    .push(format!("{kind}: challenge was not solved")),
            }
        }
    }
    Ok(output)
}

fn truncate(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}

/// Run the solver synchronously (call from `spawn_blocking`). The script cannot reach the network,
/// files or the host; it only sees the player source and the challenges.
pub fn solve(
    player: PlayerSource<'_>,
    n: &[String],
    sig: &[String],
    want_preprocessed: bool,
    timeout: Duration,
) -> Result<SolveOutput, String> {
    let input = match player {
        PlayerSource::Raw(source) => {
            json!({ "type": "player", "player": source, "output_preprocessed": want_preprocessed, "requests": [{ "type": "n", "challenges": n }, { "type": "sig", "challenges": sig }] })
        }
        PlayerSource::Preprocessed(source) => {
            json!({ "type": "preprocessed", "preprocessed_player": source, "requests": [{ "type": "n", "challenges": n }, { "type": "sig", "challenges": sig }] })
        }
    };
    let runtime = rquickjs::Runtime::new().map_err(|e| format!("solver runtime failed: {e}"))?;
    runtime.set_memory_limit(MEMORY_LIMIT_BYTES);
    runtime.set_max_stack_size(STACK_LIMIT_BYTES);
    let deadline = Instant::now() + timeout;
    runtime.set_interrupt_handler(Some(Box::new(move || Instant::now() > deadline)));
    let context =
        rquickjs::Context::full(&runtime).map_err(|e| format!("solver context failed: {e}"))?;
    let raw = context.with(|ctx| -> Result<String, String> {
        let describe = |ctx: &rquickjs::Ctx<'_>, error: rquickjs::Error| -> String {
            if Instant::now() > deadline {
                return "solver timed out".to_owned();
            }
            let caught = ctx.catch();
            let detail = caught
                .as_exception()
                .and_then(|exception| exception.message())
                .or_else(|| caught.as_string().and_then(|value| value.to_string().ok()))
                .unwrap_or_else(|| error.to_string());
            format!("solver script error: {}", truncate(&detail, 300))
        };
        ctx.globals()
            .set("__meld_input", input.to_string())
            .map_err(|e| format!("solver input failed: {e}"))?;
        ctx.eval::<(), _>(format!(
            "{SOLVER_LIB}\nObject.assign(globalThis, lib);\n{SOLVER_CORE}"
        ))
        .map_err(|e| describe(&ctx, e))?;
        ctx.eval::<String, _>("JSON.stringify(jsc(JSON.parse(globalThis.__meld_input)))")
            .map_err(|e| describe(&ctx, e))
    })?;
    parse_output(&raw, n, sig)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vendored_solver_is_the_reviewed_release() {
        use sha2::{Digest, Sha256};
        let core = format!("{:x}", Sha256::digest(SOLVER_CORE.as_bytes()));
        let lib = format!("{:x}", Sha256::digest(SOLVER_LIB.as_bytes()));
        assert_eq!(
            core,
            "ca259e4e3cdd37d92fc266d9af08d4fd66da8479e240f4d984f29da402c22ead"
        );
        assert_eq!(
            lib,
            "770831df5c46474fbff06732315b28f4fb090e427ca669a51da61e2457d41c82"
        );
        assert!(SOLVER_CORE.contains("SPDX-License-Identifier: Unlicense"));
    }

    #[test]
    fn extracts_player_id_and_sts() {
        let iframe = r#"var scriptUrl = 'https:\/\/www.youtube.com\/s\/player\/8ab5c328\/www-widgetapi.vflset\/www-widgetapi.js';"#;
        assert_eq!(extract_player_id(iframe).as_deref(), Some("8ab5c328"));
        assert_eq!(extract_player_id("nothing here"), None);
        assert_eq!(
            player_js_url("8ab5c328").as_deref(),
            Some("https://www.youtube.com/s/player/8ab5c328/player_ias.vflset/en_US/base.js")
        );
        assert_eq!(player_js_url("../../x"), None);
        assert_eq!(
            extract_signature_timestamp("a,signatureTimestamp:20725,b"),
            Some(20725)
        );
        assert_eq!(extract_signature_timestamp("{sts: 20123}"), Some(20123));
        assert_eq!(extract_signature_timestamp("none"), None);
    }

    #[test]
    fn parse_output_keeps_valid_answers_and_rejects_bad_ones() {
        let n = vec!["abc".to_owned(), "same".to_owned()];
        let sig = vec!["SIG".to_owned()];
        let raw = r#"{"type":"result","responses":[{"type":"result","data":{"abc":"xyz_1","same":"same"}},{"type":"result","data":{"SIG":"bad value<script>"}}]}"#;
        let output = parse_output(raw, &n, &sig).unwrap();
        assert_eq!(output.n.get("abc").map(String::as_str), Some("xyz_1"));
        assert!(!output.n.contains_key("same"));
        assert!(output.sig.is_empty());
        assert_eq!(output.errors.len(), 2);
        assert!(parse_output(r#"{"type":"error","error":"boom"}"#, &n, &sig)
            .unwrap_err()
            .contains("boom"));
        assert!(parse_output("not json", &n, &sig).is_err());
    }

    /// Synthetic player in the shape the solver recognises is not stable across YouTube releases, so the
    /// interpreter itself is exercised with a script error and the deadline instead.
    #[test]
    fn solver_reports_unusable_player_without_panicking() {
        let result = solve(
            PlayerSource::Raw("var x = 1;"),
            &["abc".to_owned()],
            &[],
            false,
            Duration::from_secs(20),
        );
        match result {
            Ok(output) => assert!(output.n.is_empty() && !output.errors.is_empty()),
            Err(error) => assert!(error.contains("solver"), "{error}"),
        }
    }

    /// Live check against YouTube's current player. Run with `MELD_LIVE_TESTS=1 cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn live_player_solves_n_and_sig() {
        if std::env::var("MELD_LIVE_PLAYER_JS").is_err() {
            return;
        }
        let path = std::env::var("MELD_LIVE_PLAYER_JS").unwrap();
        let player = std::fs::read_to_string(path).unwrap();
        let n = vec!["ZdZIqFPQK-Ty8wId".to_owned()];
        let sig = vec!["gN7a-hudCuAuPH6fByOk1_GNXN0yNMHShjZXS2VOgsEItAJz0tipeavEOmNdYN-wUtcEqD3bCXjc0iyKfAyZxCBGgIARwsSdQfJ2CJtt".to_owned()];
        let started = Instant::now();
        let output = solve(PlayerSource::Raw(&player), &n, &sig, true, SOLVE_TIMEOUT).unwrap();
        eprintln!("raw solve took {:?}", started.elapsed());
        assert_eq!(output.n.len(), 1, "{:?}", output.errors);
        assert_eq!(output.sig.len(), 1, "{:?}", output.errors);
        let pre = output.preprocessed.clone().unwrap();
        let started = Instant::now();
        let again = solve(
            PlayerSource::Preprocessed(&pre),
            &n,
            &sig,
            false,
            SOLVE_TIMEOUT,
        )
        .unwrap();
        eprintln!("preprocessed solve took {:?}", started.elapsed());
        assert_eq!(again.n, output.n);
        assert_eq!(again.sig, output.sig);
    }
}
