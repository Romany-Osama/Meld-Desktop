//! IPC contract tests (S5-012, D-049). Every registered command is checked, argument by argument,
//! at the boundary where Tauri turns the window's JSON into Rust values:
//! - **happy path:** a valid value for every argument is accepted;
//! - **malformed:** a value of the wrong JSON type is refused;
//! - **oversized:** a value above the argument's limit is refused (strings, lists, items, pages,
//!   numbers out of range);
//! - **unauthenticated caller:** only the main window has a capability, and every command is
//!   granted by exactly one owner permission set, so any other webview (sign-in windows, the
//!   PoToken webview) is refused by Tauri before a command runs.
//!
//! Signatures are read from the command sources, so a new command or argument type is covered
//! automatically, and an argument type this file does not know fails the test.

use serde::de::DeserializeOwned;
use serde_json::{json, Value};

use crate::ipc::payload::{
    Keyword, LibraryId, LongText, Name, Opt, SpotifyId, SpotifyUri, Text, Token, VideoId, YtId,
};
use crate::{IdListArg, ItemArg, PageArg};

const SOURCES: [(&str, &str); 11] = [
    ("account", include_str!("account.rs")),
    ("backup", include_str!("backup.rs")),
    ("catalog", include_str!("catalog.rs")),
    ("downloads", include_str!("downloads.rs")),
    ("library", include_str!("library.rs")),
    ("lyrics", include_str!("lyrics.rs")),
    ("player", include_str!("player.rs")),
    ("settings", include_str!("settings.rs")),
    ("spotify", include_str!("spotify.rs")),
    ("system", include_str!("system.rs")),
    ("system", include_str!("../updates.rs")),
];

/// Arguments Tauri injects; the window cannot send them.
const INJECTED: [&str; 5] = [
    "tauri::State<",
    "tauri::AppHandle",
    "AppHandle",
    "tauri::Window",
    "tauri::WebviewWindow",
];

struct Command {
    owner: &'static str,
    name: String,
    args: Vec<(String, String)>,
}

fn split_args(args: &str) -> Vec<String> {
    let (mut parts, mut depth, mut current) = (Vec::new(), 0i32, String::new());
    for character in args.chars() {
        match character {
            '<' => depth += 1,
            '>' => depth -= 1,
            ',' if depth == 0 => {
                parts.push(std::mem::take(&mut current));
                continue;
            }
            _ => {}
        }
        current.push(character);
    }
    parts.push(current);
    parts
        .into_iter()
        .map(|part| part.trim().to_owned())
        .filter(|part| !part.is_empty())
        .collect()
}

fn commands() -> Vec<Command> {
    let mut commands = Vec::new();
    for (owner, source) in SOURCES {
        for chunk in source.split("#[tauri::command]").skip(1) {
            let after_fn = chunk.split_once("fn ").expect("command without fn").1;
            let (name, rest) = after_fn.split_once('(').expect("command without arguments");
            let args = rest
                .split_once(") ->")
                .map(|(args, _)| args)
                .unwrap_or_else(|| rest.split_once(')').unwrap().0);
            let args = split_args(args)
                .into_iter()
                .filter_map(|arg| {
                    let (name, ty) = arg.split_once(':')?;
                    let ty = ty.trim().to_owned();
                    (!INJECTED.iter().any(|prefix| ty.starts_with(prefix)))
                        .then(|| (name.trim().to_owned(), ty))
                })
                .collect();
            commands.push(Command {
                owner,
                name: name.trim().to_owned(),
                args,
            });
        }
    }
    commands
}

fn de<T: DeserializeOwned>(value: Value) -> Result<(), String> {
    serde_json::from_value::<T>(value)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

/// Deserialize `value` as the real Rust type of an argument.
fn accepts(ty: &str, value: Value) -> Result<(), String> {
    match ty {
        "VideoId" => de::<VideoId>(value),
        "YtId" => de::<YtId>(value),
        "LibraryId" => de::<LibraryId>(value),
        "Token" => de::<Token>(value),
        "Keyword" => de::<Keyword>(value),
        "Text" => de::<Text>(value),
        "LongText" => de::<LongText>(value),
        "Name" => de::<Name>(value),
        "SpotifyId" => de::<SpotifyId>(value),
        "SpotifyUri" => de::<SpotifyUri>(value),
        "Opt<VideoId>" => de::<Opt<VideoId>>(value),
        "Opt<YtId>" => de::<Opt<YtId>>(value),
        "Opt<LibraryId>" => de::<Opt<LibraryId>>(value),
        "Opt<Token>" => de::<Opt<Token>>(value),
        "Opt<Keyword>" => de::<Opt<Keyword>>(value),
        "Opt<Text>" => de::<Opt<Text>>(value),
        "Opt<LongText>" => de::<Opt<LongText>>(value),
        "Opt<SpotifyId>" => de::<Opt<SpotifyId>>(value),
        "Opt<SpotifyUri>" => de::<Opt<SpotifyUri>>(value),
        "bool" => de::<bool>(value),
        "i32" => de::<i32>(value),
        "i64" => de::<i64>(value),
        "Option<i32>" => de::<Option<i32>>(value),
        "Option<i64>" => de::<Option<i64>>(value),
        "ItemArg" => de::<ItemArg>(value),
        "Option<ItemArg>" => de::<Option<ItemArg>>(value),
        "PageArg" => de::<PageArg>(value),
        "IdListArg<SpotifyId>" => de::<IdListArg<SpotifyId>>(value),
        other => panic!(
            "S5-012: argument type `{other}` has no contract case; add it to ipc/contract.rs"
        ),
    }
}

fn base(ty: &str) -> &str {
    ty.strip_prefix("Opt<")
        .or_else(|| ty.strip_prefix("Option<"))
        .and_then(|rest| rest.strip_suffix('>'))
        .unwrap_or(ty)
}

fn item() -> Value {
    json!({ "id": "dQw4w9WgXcQ", "kind": "song", "title": "Song", "subtitle": "Artist", "artists": [], "videoId": "dQw4w9WgXcQ" })
}

/// A valid value for an argument of this type.
fn happy(ty: &str) -> Value {
    match base(ty) {
        "VideoId" => json!("dQw4w9WgXcQ"),
        "YtId" => json!("VLPLrAXtmErZgOeiKm4sgNOknGvNjby9efdf"),
        "LibraryId" => json!("local:3f786850e387550fdab836ed7e6dc881de23001b"),
        "Token" => json!("4qmFsgKrARIMRkVtdXNpY19ob21l"),
        "Keyword" => json!("chill"),
        "Text" => json!("Song title"),
        "LongText" => json!("A longer note about a song."),
        "Name" => json!("My playlist"),
        "SpotifyId" => json!("37i9dQZF1DXcBWIGoYBM5M"),
        "SpotifyUri" => json!("spotify:track:4uLU6hMCjMI75M1A2tKUQC"),
        "bool" => json!(true),
        "i32" | "i64" => json!(1),
        "ItemArg" => item(),
        "PageArg" => {
            json!({ "kind": "album", "title": "Album", "subtitle": "Artist", "items": [item()] })
        }
        "IdListArg<SpotifyId>" => json!(["37i9dQZF1DXcBWIGoYBM5M"]),
        other => panic!("S5-012: no happy-path sample for `{other}`"),
    }
}

/// A value of the wrong JSON type.
fn malformed(ty: &str) -> Value {
    match base(ty) {
        "bool" => json!("yes"),
        "i32" | "i64" => json!("1"),
        "ItemArg" | "PageArg" => json!("not an object"),
        "IdListArg<SpotifyId>" => json!("not a list"),
        _ => json!({ "not": "a string" }),
    }
}

/// A value above the argument's limit; `None` when the type has no size (only `bool`).
fn oversized(ty: &str) -> Option<Value> {
    let huge = || "a".repeat(1 << 20);
    Some(match base(ty) {
        "bool" => return None,
        "i32" => json!(10_000_000_000_i64),
        "i64" => json!(1e300),
        "ItemArg" => {
            let mut value = item();
            value["title"] = json!("a".repeat(crate::MAX_ITEM_BYTES + 1));
            value
        }
        "PageArg" => {
            let mut value = happy("PageArg");
            value["title"] = json!("a".repeat(crate::MAX_PAGE_BYTES + 1));
            value
        }
        "IdListArg<SpotifyId>" => json!(vec!["37i9dQZF1DXcBWIGoYBM5M"; 4_000]),
        _ => json!(huge()),
    })
}

#[test]
fn every_command_is_covered() {
    let commands = commands();
    assert!(
        commands.len() >= 100,
        "only {} commands found",
        commands.len()
    );
    let total: usize = commands.iter().map(|command| command.args.len()).sum();
    assert!(total >= 120, "only {total} window-supplied arguments found");
    let lib = include_str!("../lib.rs");
    for command in &commands {
        let registered = |path: String| {
            lib.match_indices(&path).any(|(at, _)| {
                !lib[at + path.len()..].starts_with(|c: char| c.is_ascii_alphanumeric() || c == '_')
            })
        };
        assert!(
            registered(format!("ipc::{}::{}", command.owner, command.name))
                || registered(format!("updates::{}", command.name)),
            "{} is not registered",
            command.name
        );
        for (_, ty) in &command.args {
            let _ = accepts(ty, happy(ty));
        }
    }
}

#[test]
fn happy_path_arguments_are_accepted() {
    let mut failures = Vec::new();
    for command in commands() {
        for (arg, ty) in &command.args {
            if let Err(error) = accepts(ty, happy(ty)) {
                failures.push(format!("{}.{arg} ({ty}): {error}", command.name));
            }
        }
        // Optional arguments may be left out (`null`).
        for (arg, ty) in command.args.iter().filter(|(_, ty)| ty.starts_with("Opt")) {
            if let Err(error) = accepts(ty, Value::Null) {
                failures.push(format!("{}.{arg} ({ty}) null: {error}", command.name));
            }
        }
    }
    assert!(
        failures.is_empty(),
        "valid arguments refused:\n{}",
        failures.join("\n")
    );
}

#[test]
fn malformed_arguments_are_rejected() {
    let mut failures = Vec::new();
    for command in commands() {
        for (arg, ty) in &command.args {
            if accepts(ty, malformed(ty)).is_ok() {
                failures.push(format!("{}.{arg} ({ty})", command.name));
            }
            if !ty.starts_with("Opt") && accepts(ty, Value::Null).is_ok() {
                failures.push(format!("{}.{arg} ({ty}) accepts null", command.name));
            }
        }
    }
    assert!(
        failures.is_empty(),
        "malformed arguments accepted:\n{}",
        failures.join("\n")
    );
}

#[test]
fn oversized_arguments_are_rejected() {
    let mut failures = Vec::new();
    for command in commands() {
        for (arg, ty) in &command.args {
            if let Some(value) = oversized(ty) {
                if accepts(ty, value).is_ok() {
                    failures.push(format!("{}.{arg} ({ty})", command.name));
                }
            }
        }
    }
    assert!(
        failures.is_empty(),
        "oversized arguments accepted:\n{}",
        failures.join("\n")
    );
}

#[test]
fn unauthenticated_windows_cannot_call_commands() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let capabilities: Vec<Value> = std::fs::read_dir(root.join("capabilities"))
        .unwrap()
        .map(|entry| {
            serde_json::from_str(&std::fs::read_to_string(entry.unwrap().path()).unwrap()).unwrap()
        })
        .collect();
    assert_eq!(
        capabilities.len(),
        1,
        "exactly one capability (the main window)"
    );
    let capability = &capabilities[0];
    assert_eq!(capability["windows"], json!(["main"]));
    assert!(capability.get("webviews").is_none() && capability.get("remote").is_none());
    let sets: Vec<(String, String)> = std::fs::read_dir(root.join("permissions"))
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "toml"))
        .map(|path| {
            (
                path.file_stem().unwrap().to_string_lossy().into_owned(),
                std::fs::read_to_string(path).unwrap(),
            )
        })
        .collect();
    let granted = capability["permissions"].as_array().unwrap();
    for command in commands() {
        let permission = format!("\"allow-{}\"", command.name.replace('_', "-"));
        let owners: Vec<&str> = sets
            .iter()
            .filter(|(_, text)| text.contains(&permission))
            .map(|(owner, _)| owner.as_str())
            .collect();
        assert_eq!(
            owners,
            [command.owner],
            "{} must be granted by exactly its owner's set",
            command.name
        );
        assert!(
            granted.contains(&json!(format!("ipc-{}", command.owner))),
            "{}: owner set not granted to main",
            command.name
        );
    }
    // Windows that load remote or untrusted pages are never the main window.
    for label in [
        "google-login",
        "spotify-login",
        crate::potoken::WINDOW_LABEL,
    ] {
        assert_ne!(label, "main");
    }
}

#[test]
fn bounded_arguments_measure_their_json() {
    type Small = crate::ipc::payload::Bounded<Vec<String>, 16>;
    assert!(accepts_small::<Small>(json!(["abc"])));
    assert!(!accepts_small::<Small>(json!(["abcdefghijklmnop"])));
    fn accepts_small<T: DeserializeOwned>(value: Value) -> bool {
        serde_json::from_value::<T>(value).is_ok()
    }
}
