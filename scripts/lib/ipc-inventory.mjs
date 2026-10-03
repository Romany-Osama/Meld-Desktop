// S5-001: every Tauri command the main webview can call, with its owner (the src-tauri/src/ipc/<owner>.rs module it
// moves to in S5-003), its risk class and, computed from the source, which frontend files call it.
// `npm run check:security` fails when a command is registered without an entry here, when an entry is stale, or when
// docs/ipc-commands.md is out of date (regenerate with `node scripts/ipc-inventory.mjs --write`).

/** What a command can do if any script in the main webview calls it. Ordered from least to most sensitive. */
export const RISK_CLASSES = {
  "read-local": "Reads Meld's own database, settings or files.",
  "write-local": "Changes Meld's own data; the change can be reversed.",
  "remote-read": "Calls YouTube Music, Spotify or a lyrics/update server; reads only (may cache the answer).",
  "remote-write": "Changes the signed-in YouTube Music or Spotify account; the change can be reversed.",
  "destructive-local": "Deletes or replaces Meld data (history, cache, downloads, a backup restore).",
  "remote-destructive": "Deletes something from the signed-in YouTube Music or Spotify account.",
  system: "Reaches outside the app: file dialogs, opening a browser, installing an update, writing a backup file.",
  credentials: "Opens a login window or creates, refreshes or deletes a stored session.",
};

export const OWNERS = [
  "account",
  "spotify",
  "catalog",
  "library",
  "downloads",
  "player",
  "lyrics",
  "settings",
  "backup",
  "system",
];

const c = (owner, risk) => ({ owner, risk });

export const COMMANDS = {
  // system
  app_update_check: c("system", "remote-read"),
  app_update_install: c("system", "system"),
  app_open_releases_page: c("system", "system"),
  request_cancel: c("system", "write-local"),
  // account
  open_google_login: c("account", "credentials"),
  account_refresh_profile: c("account", "credentials"),
  account_logout: c("account", "credentials"),
  clear_local_library_keep_downloads: c("account", "destructive-local"),
  session_status: c("account", "read-local"),
  open_spotify_login: c("account", "credentials"),
  spotify_session_status: c("account", "read-local"),
  spotify_logout: c("account", "credentials"),
  // spotify
  spotify_profile: c("spotify", "remote-read"),
  spotify_library_node: c("spotify", "remote-read"),
  spotify_playlists: c("spotify", "remote-read"),
  spotify_playlist_tracks: c("spotify", "remote-read"),
  spotify_liked_tracks: c("spotify", "remote-read"),
  spotify_remove_from_playlist: c("spotify", "remote-destructive"),
  spotify_move_in_playlist: c("spotify", "remote-write"),
  spotify_rename_playlist: c("spotify", "remote-write"),
  spotify_add_to_playlist: c("spotify", "remote-write"),
  spotify_match_for_youtube: c("spotify", "remote-read"),
  spotify_override_youtube: c("spotify", "write-local"),
  spotify_resolve_youtube: c("spotify", "remote-read"),
  // catalog (YouTube Music browse and search)
  ytm_home: c("catalog", "remote-read"),
  ytm_home_continuation: c("catalog", "remote-read"),
  ytm_search: c("catalog", "remote-read"),
  ytm_search_continuation: c("catalog", "remote-read"),
  ytm_playlist: c("catalog", "remote-read"),
  ytm_playlist_continuation: c("catalog", "remote-read"),
  ytm_browse: c("catalog", "remote-read"),
  ytm_browse_continuation: c("catalog", "remote-read"),
  ytm_detail: c("catalog", "remote-read"),
  ytm_detail_continuation: c("catalog", "remote-read"),
  ytm_podcast_cache_detail_page: c("catalog", "write-local"),
  ytm_refetch: c("catalog", "remote-read"),
  search_history_add: c("catalog", "write-local"),
  search_history_items: c("catalog", "read-local"),
  search_history_clear: c("catalog", "destructive-local"),
  // library (Meld's library, history, stats, and the YouTube Music library)
  ytm_history: c("library", "remote-read"),
  ytm_remove_from_history: c("library", "remote-destructive"),
  ytm_delete_uploaded_song: c("library", "remote-destructive"),
  ytm_toggle_episode_saved: c("library", "remote-write"),
  ytm_toggle_podcast_saved: c("library", "remote-write"),
  ytm_podcast_channels: c("library", "remote-read"),
  ytm_refresh_saved_podcasts: c("library", "remote-read"),
  ytm_add_to_playlist: c("library", "remote-write"),
  ytm_remove_from_playlist: c("library", "remote-destructive"),
  ytm_create_playlist: c("library", "remote-write"),
  ytm_toggle_like: c("library", "remote-write"),
  ytm_toggle_library: c("library", "remote-write"),
  sync_youtube_library: c("library", "remote-read"),
  local_files_pick: c("library", "system"),
  library_local_files: c("library", "read-local"),
  library_saved_podcasts: c("library", "read-local"),
  library_downloaded_podcasts: c("library", "read-local"),
  library_albums: c("library", "read-local"),
  library_artists: c("library", "read-local"),
  library_top_songs: c("library", "read-local"),
  library_stats: c("library", "read-local"),
  library_toggle_liked: c("library", "write-local"),
  library_edit_item: c("library", "write-local"),
  library_refetch_item: c("library", "remote-read"),
  library_save_item: c("library", "write-local"),
  library_remove_item: c("library", "write-local"),
  library_songs: c("library", "read-local"),
  library_mix_songs: c("library", "read-local"),
  library_liked_songs: c("library", "read-local"),
  library_uploaded_songs: c("library", "read-local"),
  library_playlists: c("library", "read-local"),
  library_create_playlist: c("library", "write-local"),
  library_add_to_playlist: c("library", "write-local"),
  library_remove_from_playlist: c("library", "write-local"),
  library_playlist_songs: c("library", "read-local"),
  library_item_state: c("library", "read-local"),
  library_artist_state: c("library", "read-local"),
  library_toggle_artist_bookmarked: c("library", "write-local"),
  speed_dial_toggle: c("library", "write-local"),
  speed_dial_items: c("library", "read-local"),
  history_add: c("library", "write-local"),
  history_record_playtime: c("library", "write-local"),
  history_items: c("library", "read-local"),
  history_clear: c("library", "destructive-local"),
  // downloads
  download_start: c("downloads", "remote-read"),
  download_info: c("downloads", "read-local"),
  download_cancel: c("downloads", "write-local"),
  download_remove: c("downloads", "destructive-local"),
  library_downloads: c("downloads", "read-local"),
  // player (stream resolution, queue, playback cache)
  ytm_next: c("player", "remote-read"),
  ytm_related: c("player", "remote-read"),
  ytm_queue_continuation: c("player", "remote-read"),
  ytm_player: c("player", "remote-read"),
  ytm_report_stream_failure: c("player", "write-local"),
  ytm_playback_report: c("player", "read-local"),
  library_player_cache: c("player", "read-local"),
  player_cache_remove: c("player", "destructive-local"),
  player_cache_usage: c("player", "read-local"),
  player_cache_clear: c("player", "destructive-local"),
  // lyrics
  fetch_lyrics: c("lyrics", "remote-read"),
  fetch_lyrics_fresh: c("lyrics", "remote-read"),
  fetch_lyrics_from_provider: c("lyrics", "remote-read"),
  // settings
  settings_get: c("settings", "read-local"),
  settings_set: c("settings", "write-local"),
  // backup
  backup_create: c("backup", "system"),
  backup_restore: c("backup", "destructive-local"),
};

/** Problems between what lib.rs registers and this inventory. */
export function checkIpcInventory(registered, inventory = COMMANDS) {
  const problems = [];
  for (const command of registered)
    if (!inventory[command]) problems.push(`${command} is registered but not in the IPC inventory`);
  for (const command of Object.keys(inventory))
    if (!registered.includes(command)) problems.push(`${command} is in the IPC inventory but not registered`);
  for (const [command, entry] of Object.entries(inventory)) {
    if (!OWNERS.includes(entry.owner)) problems.push(`${command}: unknown owner ${entry.owner}`);
    if (!(entry.risk in RISK_CLASSES)) problems.push(`${command}: unknown risk class ${entry.risk}`);
  }
  return problems;
}

/** Modules outside ipc/ that already own their commands. */
export const COMMAND_MODULES_OUTSIDE_IPC = { updates: "system" };

/** S5-003: the command list (collect_commands!, S5-011) names every command as `ipc::<owner>::<command>` (or an allowed module above). */
export function checkCommandModules(libSource, inventory = COMMANDS) {
  const match = libSource.match(/(?:generate_handler|collect_commands)!\[([^\]]*)\]/);
  if (!match) return ["collect_commands! not found"];
  const problems = [];
  for (const path of match[1]
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)) {
    const parts = path.split("::");
    const command = parts[parts.length - 1];
    const owner = inventory[command]?.owner;
    if (!owner) continue; // reported by checkIpcInventory
    const module = parts.length === 3 && parts[0] === "ipc" ? parts[1] : null;
    const outside = parts.length === 2 ? COMMAND_MODULES_OUTSIDE_IPC[parts[0]] : undefined;
    if (module === null && outside === undefined)
      problems.push(`${command} must be registered as ipc::${owner}::${command}`);
    else if ((module ?? outside) !== owner)
      problems.push(`${command} is registered from ${module ? `ipc::${module}` : parts[0]}; its owner is ${owner}`);
  }
  return problems;
}

/** Frontend files (relative to src/, without tests) that name the command in a string. */
export function callersOf(command, files) {
  const pattern = new RegExp(`["'\`]${command}["'\`]`);
  return Object.keys(files)
    .filter((name) => pattern.test(files[name]))
    .sort();
}

/** The Markdown table in docs/ipc-commands.md. */
export function renderInventory(registered, files, inventory = COMMANDS) {
  const lines = [
    "# IPC command inventory",
    "",
    "<!-- Generated by `node scripts/ipc-inventory.mjs --write` from src-tauri/src/lib.rs, src/ and",
    "     scripts/lib/ipc-inventory.mjs. Do not edit by hand; `npm run check:security` fails when it is stale. -->",
    "",
    "Every command registered in `collect_commands!` (S5-001, S5-011). **Owner** is the `src-tauri/src/ipc/<owner>.rs`",
    "module the command belongs to (S5-003). **Callers** are found in `src/` (tests excluded).",
    "",
    "## Risk classes",
    "",
    "| Class | Meaning | Commands |",
    "| --- | --- | --- |",
  ];
  for (const [risk, meaning] of Object.entries(RISK_CLASSES)) {
    const count = registered.filter((command) => inventory[command]?.risk === risk).length;
    lines.push(`| \`${risk}\` | ${meaning} | ${count} |`);
  }
  lines.push("", `## Commands (${registered.length})`, "");
  for (const owner of OWNERS) {
    const commands = registered.filter((command) => inventory[command]?.owner === owner).sort();
    if (commands.length === 0) continue;
    lines.push(`### ${owner} (${commands.length})`, "", "| Command | Risk | Callers |", "| --- | --- | --- |");
    for (const command of commands) {
      const callers = callersOf(command, files);
      lines.push(
        `| \`${command}\` | ${inventory[command].risk} | ${callers.length ? callers.map((name) => `\`${name}\``).join(", ") : "**none**"} |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** S5-004: tauri-build names the generated permission of a command `allow-<command with - for _>`. */
export const allowPermission = (command) => `allow-${command.replace(/_/g, "-")}`;

/** The app commands tauri-build generates permissions for (src-tauri/build.rs). */
export function renderBuildRs(registered) {
  const list = [...registered].sort().map((command) => `    "${command}",`);
  return [
    "// Generated by `node scripts/ipc-inventory.mjs --write` (S5-004). Every app command gets an `allow-<command>`",
    "// permission; a window can call only the commands its capability grants (src-tauri/permissions/<owner>.toml).",
    "const COMMANDS: &[&str] = &[",
    ...list,
    "];",
    "",
    "fn main() {",
    "    // Windows: the Common-Controls v6 manifest is embedded by the linker for every target. tauri-build's",
    "    // resource manifest only reaches the app binary, so the lib test binary failed to load on Windows CI",
    "    // (STATUS_ENTRYPOINT_NOT_FOUND) once it referenced a v6-only API.",
    "    let mut windows = tauri_build::WindowsAttributes::new();",
    '    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {',
    "        let manifest =",
    '            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-app-manifest.xml");',
    '        println!("cargo:rerun-if-changed={}", manifest.display());',
    '        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");',
    '        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());',
    "        windows = tauri_build::WindowsAttributes::new_without_app_manifest();",
    "    }",
    "    tauri_build::try_build(",
    "        tauri_build::Attributes::new()",
    "            .windows_attributes(windows)",
    "            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),",
    "    )",
    '    .expect("failed to run tauri-build");',
    "}",
    "",
  ].join("\n");
}

/** One permission set per owner: the capability grants owners, not 104 single commands. */
export function renderPermissionSet(owner, registered, inventory = COMMANDS) {
  const commands = registered.filter((command) => inventory[command]?.owner === owner).sort();
  return [
    "# Generated by `node scripts/ipc-inventory.mjs --write` (S5-004) from scripts/lib/ipc-inventory.mjs.",
    "",
    "[[set]]",
    `identifier = "ipc-${owner}"`,
    `description = "Commands owned by ${owner} (docs/ipc-commands.md)."`,
    "permissions = [",
    ...commands.map((command) => `  "${allowPermission(command)}",`),
    "]",
    "",
  ].join("\n");
}

/** Owners that have at least one registered command. */
export function ownersOf(registered, inventory = COMMANDS) {
  return OWNERS.filter((owner) => registered.some((command) => inventory[command]?.owner === owner));
}

/**
 * S5-004/S5-005: the main window's capability grants exactly the owner sets; no capability grants a single app
 * command outside a set, uses a window wildcard, or names a login window (they load remote sites and must stay
 * without IPC). `loginWindows` are the labels lib.rs/ipc open with WebviewUrl::External.
 */
export function checkCapabilityGrants(capabilities, registered, loginWindows, inventory = COMMANDS) {
  const problems = [];
  const wanted = ownersOf(registered, inventory).map((owner) => `ipc-${owner}`);
  const main = capabilities.find((capability) => (capability.windows ?? []).includes("main"));
  if (!main) return ["no capability is granted to the main window"];
  const granted = (main.permissions ?? []).map((permission) =>
    typeof permission === "string" ? permission : permission.identifier,
  );
  for (const set of wanted) if (!granted.includes(set)) problems.push(`main capability does not grant ${set}`);
  for (const capability of capabilities) {
    for (const window of [...(capability.windows ?? []), ...(capability.webviews ?? [])]) {
      if (window.includes("*"))
        problems.push(`capability "${capability.identifier}" uses the window pattern ${window}`);
      if (loginWindows.includes(window))
        problems.push(`capability "${capability.identifier}" gives IPC to the login window ${window}`);
    }
    for (const permission of capability.permissions ?? []) {
      const id = typeof permission === "string" ? permission : permission.identifier;
      if (/^allow-/.test(id ?? "")) problems.push(`capability "${capability.identifier}" grants ${id} outside a set`);
    }
  }
  return problems;
}

/** Labels of windows opened on external URLs (`WebviewWindowBuilder::new(&app, "<label>", WebviewUrl::External`). */
export function externalWindowLabels(rustSource) {
  return [...rustSource.matchAll(/WebviewWindowBuilder::new\(\s*&?\w+,\s*"([^"]+)",\s*WebviewUrl::External/g)].map(
    (match) => match[1],
  );
}
