//! Validated IPC payloads (S5-006, D-043).
//!
//! Free `String` command arguments are replaced by newtypes that check length, character set
//! and shape while Tauri deserializes the call, so a malformed value never reaches a network
//! request or a SQL statement. Tauri rejects the call with
//! "invalid args `<name>` for command `<command>`: <reason>"; the frontend maps that to the
//! `invalid_argument` code (src/lib/ipcError.ts).
use serde::{Deserialize, Serialize};
use std::fmt;
use std::ops::Deref;

/// How a newtype checks its (already trimmed, for identifiers) value.
#[derive(Clone, Copy)]
enum Rule {
    /// Exactly/at most `max` characters from `allowed`, at least `min`.
    Charset {
        min: usize,
        max: usize,
        allowed: fn(char) -> bool,
    },
    /// Free text: no control characters, at most `max` characters, at least `min` after trim.
    Text { min: usize, max: usize },
}

fn check(label: &str, raw: String, rule: Rule, trim: bool) -> Result<String, String> {
    let value = if trim { raw.trim().to_owned() } else { raw };
    let count = value.chars().count();
    match rule {
        Rule::Charset { min, max, allowed } => {
            if count < min || count > max {
                return Err(if min == max {
                    format!("{label} must be {min} characters")
                } else if count == 0 {
                    format!("{label} is empty")
                } else {
                    format!("{label} must be {min} to {max} characters")
                });
            }
            if let Some(bad) = value.chars().find(|character| !allowed(*character)) {
                return Err(format!(
                    "{label} contains an unsupported character (U+{:04X})",
                    bad as u32
                ));
            }
        }
        Rule::Text { min, max } => {
            if value.trim().chars().count() < min {
                return Err(format!("{label} is empty"));
            }
            if count > max {
                return Err(format!("{label} is longer than {max} characters"));
            }
            if value.chars().any(char::is_control) {
                return Err(format!("{label} contains control characters"));
            }
        }
    }
    Ok(value)
}

fn yt_char(character: char) -> bool {
    character.is_ascii_alphanumeric() || matches!(character, '_' | '-')
}

/// Library ids: YouTube ids, `local:<sha1>`, `local-artist:<sha1>`, `LOCAL_<millis>`, UUIDs and
/// ids imported from Android Meld backups.
fn library_char(character: char) -> bool {
    character.is_ascii_graphic() && !matches!(character, '"' | '\'' | '\\' | '<' | '>' | '`')
}

/// InnerTube continuation tokens, `params` and feedback tokens: base64/base64url, sometimes
/// percent-encoded.
fn token_char(character: char) -> bool {
    character.is_ascii_alphanumeric()
        || matches!(character, '_' | '-' | '%' | '=' | '+' | '/' | '.')
}

fn spotify_uri_char(character: char) -> bool {
    character.is_ascii_alphanumeric() || matches!(character, ':' | '_' | '-' | '.' | '%')
}

macro_rules! payload {
    ($(#[$meta:meta])* $name:ident, $label:literal, $rule:expr, trim = $trim:literal) => {
        $(#[$meta])*
        #[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, specta::Type)]
        #[serde(try_from = "String", into = "String")]
        #[specta(transparent)]
        pub struct $name(String);

        impl $name {
            pub fn parse(raw: impl Into<String>) -> Result<Self, String> {
                check($label, raw.into(), $rule, $trim).map(Self)
            }
            pub fn as_str(&self) -> &str {
                &self.0
            }
            pub fn into_inner(self) -> String {
                self.0
            }
        }

        impl TryFrom<String> for $name {
            type Error = String;
            fn try_from(raw: String) -> Result<Self, String> {
                Self::parse(raw)
            }
        }

        impl From<$name> for String {
            fn from(value: $name) -> String {
                value.0
            }
        }

        impl Deref for $name {
            type Target = str;
            fn deref(&self) -> &str {
                &self.0
            }
        }

        impl AsRef<str> for $name {
            fn as_ref(&self) -> &str {
                &self.0
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str(&self.0)
            }
        }
    };
}

payload!(
    /// A YouTube video id: exactly 11 characters of `[A-Za-z0-9_-]`.
    VideoId, "video id", Rule::Charset { min: 11, max: 11, allowed: yt_char }, trim = true
);
payload!(
    /// Browse, playlist, channel, podcast, entity and setVideoId values for YouTube Music.
    YtId, "YouTube Music id", Rule::Charset { min: 1, max: 256, allowed: yt_char }, trim = true
);
payload!(
    /// Ids of rows in the local Meld library (songs, playlists, artists, downloads).
    LibraryId, "library id", Rule::Charset { min: 1, max: 256, allowed: library_char }, trim = true
);
payload!(
    /// InnerTube continuation tokens, feedback tokens and `params`.
    Token, "token", Rule::Charset { min: 1, max: 16_384, allowed: token_char }, trim = true
);
payload!(
    /// A Spotify playlist id, track uid or other base62/hex identifier.
    SpotifyId, "Spotify id", Rule::Charset { min: 1, max: 128, allowed: yt_char }, trim = true
);
payload!(
    /// A `spotify:` URI (track, folder, playlist).
    SpotifyUri, "Spotify URI", Rule::Charset { min: 9, max: 256, allowed: spotify_uri_char }, trim = true
);
payload!(
    /// A short keyword: kinds, modes, periods, providers, audio qualities, setting keys.
    Keyword, "keyword", Rule::Charset { min: 1, max: 64, allowed: yt_char }, trim = true
);
payload!(
    /// A required name (playlist title, new name, song title): non-empty, no control characters.
    Name, "name", Rule::Text { min: 1, max: 500 }, trim = true
);
payload!(
    /// Optional free text (artist, album, search query): may be empty, no control characters.
    Text, "text", Rule::Text { min: 0, max: 1_000 }, trim = false
);
payload!(
    /// Longer values: setting values, thumbnails, stream URLs (never logged).
    LongText, "value", Rule::Text { min: 0, max: 8_192 }, trim = false
);

/// An optional argument: a missing key, `null` or a blank string is `None`; anything else must
/// pass `T`'s validation.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Opt<T>(pub Option<T>);

/// In the generated bindings an `Opt<T>` is `T | null` (an optional argument), like `Option<T>`.
impl<T: specta::Type> specta::Type for Opt<T> {
    fn inline(
        type_map: &mut specta::TypeCollection,
        generics: specta::Generics,
    ) -> specta::datatype::DataType {
        <Option<T> as specta::Type>::inline(type_map, generics)
    }
}

impl<T> Default for Opt<T> {
    fn default() -> Self {
        Opt(None)
    }
}

impl<'de, T: TryFrom<String, Error = String>> Deserialize<'de> for Opt<T> {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        match Option::<String>::deserialize(deserializer)? {
            Some(raw) if !raw.trim().is_empty() => T::try_from(raw)
                .map(|value| Opt(Some(value)))
                .map_err(serde::de::Error::custom),
            _ => Ok(Opt(None)),
        }
    }
}

impl<T: Into<String>> Opt<T> {
    /// The validated value as the `Option<String>` the command bodies already use.
    pub fn into_string(self) -> Option<String> {
        self.0.map(Into::into)
    }
}

/// Upper bound for list arguments such as Spotify track uids.
pub const MAX_LIST_ARGUMENT: usize = 1_000;

#[cfg(test)]
mod tests {
    use super::*;

    fn rejects<T: for<'de> Deserialize<'de> + fmt::Debug>(value: serde_json::Value) -> String {
        serde_json::from_value::<T>(value)
            .expect_err("value should be rejected")
            .to_string()
    }

    #[test]
    fn video_ids_are_exactly_eleven_url_safe_characters() {
        assert_eq!(
            VideoId::parse(" dQw4w9WgXcQ ").unwrap().as_str(),
            "dQw4w9WgXcQ"
        );
        assert!(VideoId::parse("short").is_err());
        assert!(VideoId::parse("dQw4w9WgXcQx").is_err());
        assert!(VideoId::parse("dQw4w9WgX/Q").is_err());
        assert!(VideoId::parse("").is_err());
        assert!(rejects::<VideoId>(serde_json::json!("abc")).contains("video id must be 11"));
        assert!(rejects::<VideoId>(serde_json::json!(42)).contains("string"));
    }

    #[test]
    fn youtube_ids_reject_query_and_path_injection() {
        for good in ["VLPL123-abc_DEF", "MPREb_x", "UC1234567890", "FEmusic_home"] {
            assert!(YtId::parse(good).is_ok(), "{good}");
        }
        for bad in [
            "",
            "   ",
            "a&b=c",
            "../etc",
            "a b",
            "id\tx",
            &"x".repeat(257),
        ] {
            assert!(YtId::parse(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn library_ids_accept_every_existing_id_shape() {
        for good in [
            "dQw4w9WgXcQ",
            "local:3f786850e387550fdab836ed7e6dc881de23001b",
            "local-artist:3f786850e387550fdab836ed7e6dc881de23001b",
            "LOCAL_1727900000000",
            "8a1f6c2e-1b2d-4c3e-9f00-aa11bb22cc33",
            "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
        ] {
            assert!(LibraryId::parse(good).is_ok(), "{good}");
        }
        for bad in ["", "a b", "x'; DROP TABLE songs;--", "<script>", "a\u{0}b"] {
            assert!(LibraryId::parse(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn tokens_allow_base64_and_percent_encoding_only() {
        assert!(Token::parse("4qmFsgKrCBIYVUN%3D+/=_-.").is_ok());
        assert!(Token::parse("a b").is_err());
        assert!(Token::parse("a\"b").is_err());
        assert!(Token::parse("x".repeat(16_385)).is_err());
        assert!(Token::parse("").is_err());
    }

    #[test]
    fn spotify_values_have_their_own_shape() {
        assert!(SpotifyId::parse("37i9dQZF1DXcBWIGoYBM5M").is_ok());
        assert!(SpotifyId::parse("spotify:playlist:x").is_err());
        assert!(SpotifyUri::parse("spotify:track:4uLU6hMCjMI75M1A2tKUQC").is_ok());
        assert!(SpotifyUri::parse("spotify:user:me:folder:abc123").is_ok());
        assert!(SpotifyUri::parse("https://open.spotify.com/track/x").is_err());
    }

    #[test]
    fn keywords_names_and_text() {
        assert!(Keyword::parse("lrclib").is_ok());
        assert!(Keyword::parse("all time").is_err());
        assert_eq!(
            Name::parse("  My playlist ").unwrap().as_str(),
            "My playlist"
        );
        assert!(Name::parse("   ").is_err());
        assert!(Name::parse("a\u{7}b").is_err());
        assert!(Name::parse("x".repeat(501)).is_err());
        assert_eq!(Text::parse("").unwrap().as_str(), "");
        assert_eq!(Text::parse(" Artist ").unwrap().as_str(), " Artist ");
        assert!(Text::parse("x".repeat(1_001)).is_err());
        assert!(LongText::parse("https://i.ytimg.com/vi/x/hq.jpg").is_ok());
        assert!(LongText::parse("x".repeat(8_193)).is_err());
    }

    #[test]
    fn optional_arguments_treat_blank_as_missing_and_validate_the_rest() {
        let parse = |value: serde_json::Value| serde_json::from_value::<Opt<YtId>>(value);
        assert_eq!(parse(serde_json::json!(null)).unwrap().into_string(), None);
        assert_eq!(parse(serde_json::json!("  ")).unwrap().into_string(), None);
        assert_eq!(
            parse(serde_json::json!("RDAMVMx"))
                .unwrap()
                .into_string()
                .as_deref(),
            Some("RDAMVMx")
        );
        assert!(parse(serde_json::json!("a b")).is_err());
        #[derive(Deserialize)]
        struct Args {
            #[serde(default)]
            #[allow(dead_code)]
            params: Opt<Token>,
        }
        assert!(serde_json::from_value::<Args>(serde_json::json!({})).is_ok());
    }

    #[test]
    fn values_serialize_back_to_plain_strings() {
        let id = VideoId::parse("dQw4w9WgXcQ").unwrap();
        assert_eq!(
            serde_json::to_value(&id).unwrap(),
            serde_json::json!("dQw4w9WgXcQ")
        );
        assert_eq!(&*id, "dQw4w9WgXcQ");
        assert_eq!(id.to_string(), "dQw4w9WgXcQ");
    }
}

#[cfg(test)]
mod contract {
    /// S5-006 "done when": no command takes a free `String` argument.
    #[test]
    fn no_command_takes_a_free_string_argument() {
        let sources = [
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
            ("updates", include_str!("../updates.rs")),
        ];
        let free = regex::Regex::new(r"\b\w+:\s*(?:Option<|Vec<)?(?:String|&str)\b").unwrap();
        let mut checked = 0;
        for (owner, source) in sources {
            for command in source.split("#[tauri::command]").skip(1) {
                let args = command
                    .split_once('(')
                    .and_then(|(_, rest)| rest.split_once(") ->"))
                    .map(|(args, _)| args)
                    .unwrap_or_default();
                assert!(
                    !free.is_match(args),
                    "{owner}: command takes a free string argument: {}",
                    args.trim()
                );
                checked += 1;
            }
        }
        assert!(checked >= 100, "only {checked} commands were checked");
    }
}
