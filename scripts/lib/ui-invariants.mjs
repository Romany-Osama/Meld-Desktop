// TR-M3: exactly one "Audio quality" control in Settings. TR-M4/TR-H1: restored v0.1.8 commands stay wired to the UI.
export const RESTORED_UI_COMMANDS = [
  "account_refresh_profile", "fetch_lyrics_fresh", "fetch_lyrics_from_provider", "history_record_playtime",
  "library_artist_state", "library_toggle_artist_bookmarked", "ytm_browse", "ytm_browse_continuation",
  "ytm_podcast_cache_detail_page", "ytm_refresh_saved_podcasts",
];

export function checkUiInvariants(appSource) {
  const problems = [];
  const audioQualityControls = appSource.match(/<strong>Audio quality<\/strong>/g)?.length ?? 0;
  if (audioQualityControls !== 1) problems.push(`expected exactly 1 Audio quality setting control, found ${audioQualityControls}`);
  for (const command of RESTORED_UI_COMMANDS) if (!appSource.includes(`"${command}"`)) problems.push(`UI no longer calls restored command ${command}`);
  return problems;
}

/** Commands registered in generate_handler![...] of lib.rs. */
export function registeredCommands(libSource) {
  const match = libSource.match(/generate_handler!\[([^\]]*)\]/);
  return match ? match[1].split(",").map((value) => value.trim().split("::").pop()).filter(Boolean) : [];
}

/** Body of a top-level Rust function, from its signature to the next top-level item. */
export function rustFunctionBody(libSource, name) {
  const start = libSource.search(new RegExp(`\\nfn ${name}\\(`));
  if (start < 0) return null;
  const rest = libSource.slice(start + 1);
  const end = rest.search(/\n(#\[|fn |pub fn |async fn |struct |const |static |impl |mod )/);
  return end < 0 ? rest : rest.slice(0, end);
}

export const LOGOUT_COMMANDS = ["account_logout", "spotify_logout"];

/** TR-H6: signing out must also clear the WebView's sign-in data, or the next login silently reuses it. */
export function checkLogoutClearsWebview(libSource) {
  const problems = [];
  for (const name of LOGOUT_COMMANDS) {
    const body = rustFunctionBody(libSource, name);
    if (body === null) problems.push(`logout command ${name} not found`);
    else if (!body.includes("clear_all_browsing_data()")) problems.push(`${name} no longer clears WebView browsing data`);
  }
  return problems;
}
