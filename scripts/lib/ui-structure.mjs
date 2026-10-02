// U4-001: every route-level surface is its own module under src/features and is rendered by App.tsx.
export const ROUTE_SCREENS = {
  Home: "src/features/home/HomeScreen.tsx",
  Search: "src/features/search/SearchScreen.tsx",
  Library: "src/features/library/LibraryScreen.tsx",
  History: "src/features/history/HistoryScreen.tsx",
  Stats: "src/features/stats/StatsScreen.tsx",
  // Album, artist and podcast pages share one detail screen with kind-specific sections (D-025).
  Detail: "src/features/detail/DetailScreen.tsx",
  Playlist: "src/features/playlist/PlaylistScreen.tsx",
  SpotifyLiked: "src/features/spotify/SpotifyLikedScreen.tsx",
  SpotifyPlaylist: "src/features/spotify/SpotifyPlaylistScreen.tsx",
  Settings: "src/features/settings/SettingsScreen.tsx",
  PlayerBar: "src/features/player/PlayerBar.tsx",
  ExpandedPlayer: "src/features/player/ExpandedPlayer.tsx",
  Queue: "src/features/queue/QueuePanel.tsx",
  Lyrics: "src/features/lyrics/LyricsPanel.tsx",
};

const componentName = (path) =>
  path
    .split("/")
    .pop()
    .replace(/\.tsx$/, "");

/** Problems with the screen split, given a reader for repository files (null when a file is missing). */
export function checkScreenSplit(readFile) {
  const problems = [];
  const app = readFile("src/App.tsx") ?? "";
  for (const [surface, path] of Object.entries(ROUTE_SCREENS)) {
    const name = componentName(path);
    const source = readFile(path);
    if (source === null) {
      problems.push(`${surface}: ${path} is missing`);
      continue;
    }
    if (!new RegExp(`export function ${name}\\(`).test(source)) problems.push(`${path} must export ${name}`);
    if (!app.includes(`<${name}`)) problems.push(`App.tsx no longer renders <${name}>`);
  }
  return problems;
}

// U4-002: each feature owns its state in a hook; App.tsx composes them and must not re-declare that state.
export const FEATURE_MODULES = {
  notifications: { path: "src/features/notifications/useNotice.ts", hook: "useNotice", owns: ["notice"] },
  selection: {
    path: "src/features/selection/useSelection.ts",
    hook: "useSelection",
    owns: ["selectedItems", "selectionMode"],
  },
  settings: {
    path: "src/features/settings/useSettingsState.ts",
    hook: "useSettingsState",
    owns: ["settings", "settingsOpen", "audioQuality"],
  },
  accounts: {
    path: "src/features/accounts/useAccounts.ts",
    hook: "useAccounts",
    owns: ["sessionStatus", "spotifyStatus", "spotifyProfile"],
  },
  downloads: { path: "src/features/downloads/useDownloads.ts", hook: "useDownloads", owns: ["menuDownload"] },
  menu: {
    path: "src/features/menu/useItemMenu.ts",
    hook: "useItemMenu",
    owns: ["menuItem", "menuState", "playerMenuOpen"],
  },
  playlists: {
    path: "src/features/playlist/usePlaylists.ts",
    hook: "usePlaylists",
    owns: ["localPlaylists", "playlistPickerItems"],
  },
  spotify: {
    path: "src/features/spotify/useSpotifyLibrary.ts",
    hook: "useSpotifyLibrary",
    owns: ["spotifyLibrary", "spotifyOpenPlaylist"],
  },
  lyrics: {
    path: "src/features/lyrics/useLyrics.ts",
    hook: "useLyrics",
    owns: ["lyrics", "lyricsItem", "lyricsProviderOrder"],
  },
  queue: {
    path: "src/features/queue/useQueue.ts",
    hook: "useQueue",
    owns: ["queueItems", "queueIndex", "shuffleEnabled", "repeatMode"],
  },
  player: {
    path: "src/features/player/usePlayer.ts",
    hook: "usePlayer",
    owns: ["player", "isPlaying", "volume", "playbackSeconds"],
  },
  sleepTimer: { path: "src/features/player/useSleepTimer.ts", hook: "useSleepTimer", owns: ["sleepTimerExpiresAt"] },
};

/** Problems with the feature-module boundaries, given a reader for repository files (null when missing). */
export function checkFeatureModules(readFile) {
  const problems = [];
  const app = readFile("src/App.tsx") ?? "";
  for (const [feature, { path, hook, owns }] of Object.entries(FEATURE_MODULES)) {
    const source = readFile(path);
    if (source === null) {
      problems.push(`${feature}: ${path} is missing`);
      continue;
    }
    if (!new RegExp(`export function ${hook}\\(`).test(source)) problems.push(`${path} must export ${hook}`);
    if (!new RegExp(`\\b${hook}\\(`).test(app)) problems.push(`App.tsx no longer uses ${hook}`);
    for (const name of owns) {
      if (new RegExp(`const \\[${name}, set\\w+\\] = useState`).test(app))
        problems.push(`App.tsx declares ${name}, which ${hook} owns`);
    }
  }
  return problems;
}

// U4-008: server state (pages fetched from the backend) lives in the resource cache and the feature data hooks.
// App.tsx keeps view state and must neither fetch these pages itself nor hold them in useState. (Queue continuations
// are player state and move with the playback coordinator, M4.1.)
export const SERVER_STATE_HOOKS = {
  home: { path: "src/features/home/useHomeData.ts", hook: "useHomeData" },
  search: { path: "src/features/search/useSearchData.ts", hook: "useSearchData" },
  library: { path: "src/features/library/useLibraryData.ts", hook: "useLibraryData" },
  history: { path: "src/features/history/useHistoryData.ts", hook: "useHistoryData" },
  detail: { path: "src/features/detail/useDetailData.ts", hook: "useDetailData" },
  playlist: { path: "src/features/playlist/usePlaylistData.ts", hook: "usePlaylistData" },
};
export const SERVER_PAGE_COMMANDS = [
  "ytm_home",
  "ytm_home_continuation",
  "speed_dial_items",
  "ytm_search",
  "ytm_search_continuation",
  "search_history_items",
  "library_mix_songs",
  "library_liked_songs",
  "library_top_songs",
  "history_items",
  "ytm_history",
  "library_stats",
  "ytm_detail",
  "ytm_browse",
  "ytm_detail_continuation",
  "ytm_browse_continuation",
  "ytm_playlist",
  "library_playlist_songs",
];
const SERVER_STATE_NAMES = ["home", "search", "library", "history", "stats", "remoteHistory", "detail", "playlist"];

export function checkServerState(readFile) {
  const problems = [];
  const app = readFile("src/App.tsx") ?? "";
  for (const [area, { path, hook }] of Object.entries(SERVER_STATE_HOOKS)) {
    const source = readFile(path);
    if (source === null) {
      problems.push(`${area}: ${path} is missing`);
      continue;
    }
    if (!new RegExp(`export function ${hook}\\(`).test(source)) problems.push(`${path} must export ${hook}`);
    if (!new RegExp(`\\b${hook}\\(`).test(app)) problems.push(`App.tsx no longer uses ${hook}`);
  }
  for (const command of SERVER_PAGE_COMMANDS)
    if (new RegExp(`invoke(<[^>]*>)?\\(\\s*"${command}"`).test(app))
      problems.push(`App.tsx fetches ${command}; server state belongs in a data hook`);
  for (const name of SERVER_STATE_NAMES)
    if (new RegExp(`const \\[${name}, set\\w+\\] = useState`).test(app))
      problems.push(`App.tsx keeps ${name} in useState; it is server state`);
  return problems;
}

// U4-011: the item menu is rendered from `itemMenuEntries` (src/app/capabilities.ts); App.tsx must not grow its own
// per-action conditionals again.
export function checkCapabilities(readFile) {
  const problems = [];
  const app = readFile("src/App.tsx") ?? "";
  const model = readFile("src/app/capabilities.ts");
  if (model === null) return ["src/app/capabilities.ts is missing"];
  if (!/export function itemMenuEntries\(/.test(model)) problems.push("capabilities.ts must export itemMenuEntries");
  if (!app.includes("<ItemMenu")) problems.push("App.tsx no longer renders <ItemMenu>");
  if (!/canPerform\(/.test(app)) problems.push("performMenuAction no longer checks canPerform");
  if (/performMenuAction\(\s*"/.test(app)) problems.push("App.tsx calls performMenuAction with a literal action");
  return problems;
}

/** Removals the policy covers (U4-012), by the App.tsx menu-action branch that performs them. */
export const DESTRUCTIVE_MENU_ACTIONS = [
  "cache_remove",
  "delete_uploaded",
  "remove_history",
  "meld_like",
  "remove_from_playlist",
  'pin" || action === "unpin',
  'add_library" || action === "remove_library',
];

/**
 * U4-012/U4-013: removals go through `destructive(...)` (confirm, Undo, rollback in one place), nothing asks with
 * `window.confirm`, and App renders the notification stack and the confirmation dialog.
 * `uiSource` is every non-test source file joined (see readUiSource).
 */
export function checkDestructivePolicy(readFile, uiSource) {
  const problems = [];
  if (readFile("src/app/destructive.ts") === null) return ["src/app/destructive.ts is missing"];
  if (readFile("src/app/notifications.ts") === null) return ["src/app/notifications.ts is missing"];
  const app = readFile("src/App.tsx") ?? "";
  if (/\bwindow\.confirm\(/.test(uiSource)) problems.push("window.confirm is used; ask through the destructive policy");
  if (!app.includes("<ConfirmDialog")) problems.push("App.tsx no longer renders <ConfirmDialog>");
  if (!app.includes("<NoticeStack")) problems.push("App.tsx no longer renders <NoticeStack>");
  for (const action of DESTRUCTIVE_MENU_ACTIONS) {
    const start = app.indexOf(`if (action === "${action}")`);
    if (start < 0) {
      problems.push(`App.tsx has no branch for ${action.split('"')[0]}`);
      continue;
    }
    const rest = app.slice(start + 1);
    const end = rest.search(/\n {4}if \(action === "/);
    const branch = end < 0 ? rest : rest.slice(0, end);
    if (!branch.includes("destructive(")) problems.push(`${action.split('"')[0]} does not go through destructive()`);
  }
  const downloads = readFile("src/features/downloads/useDownloads.ts") ?? "";
  if ((downloads.match(/destructive\(/g) ?? []).length < 2)
    problems.push("useDownloads removes downloads without destructive()");
  return problems;
}

/** Regions App.tsx keeps behind their own error boundary (U4-014). */
export const BOUNDED_REGIONS = [
  "SpotifyLikedScreen",
  "SpotifyPlaylistScreen",
  "SettingsScreen",
  "DetailScreen",
  "PlaylistScreen",
  "QueuePanel",
  "ExpandedPlayer",
  "LyricsPanel",
];

/**
 * U4-014: the routed page and every overlay sit inside an <ErrorBoundary>, and the <audio> element is rendered
 * outside the player controls' boundary so a render error cannot stop playback.
 */
export function checkErrorBoundaries(readFile) {
  const problems = [];
  const app = readFile("src/App.tsx") ?? "";
  const bar = readFile("src/features/player/PlayerBar.tsx") ?? "";
  const audio = readFile("src/features/player/PlayerAudio.tsx");
  if (readFile("src/components/ErrorBoundary.tsx") === null) return ["src/components/ErrorBoundary.tsx is missing"];
  if (!/<div className="page-scroll"[^>]*>\s*<ErrorBoundary/.test(app))
    problems.push("the routed page is not inside an <ErrorBoundary>");
  for (const region of BOUNDED_REGIONS) {
    const at = app.indexOf(`<${region}\n`);
    const before = at < 0 ? "" : app.slice(Math.max(0, at - 300), at);
    if (at < 0 || !/<ErrorBoundary[^<]*$/.test(before)) problems.push(`${region} is not inside an <ErrorBoundary>`);
  }
  if (/<audio\b/.test(bar)) problems.push("PlayerBar.tsx renders <audio>; keep it in PlayerAudio outside the boundary");
  if (audio === null || !/<audio\b/.test(audio)) problems.push("PlayerAudio.tsx no longer renders the <audio> element");
  if (!/<PlayerAudio[\s\S]*<ErrorBoundary[\s\S]*<PlayerControls/.test(bar))
    problems.push("PlayerBar must render <PlayerAudio> before the controls' <ErrorBoundary>");
  return problems;
}

/**
 * U4-015: list keys and selection use occurrence keys (src/lib/identity.ts). A key built from an id plus the list
 * position, or a selection check by id, treats two copies of the same song as one row.
 */
export function checkOccurrenceKeys(uiSource) {
  const problems = [];
  if (/key=\{`[^`]*\.id\}-\$\{\w*[iI]ndex\}`\}/.test(uiSource))
    problems.push("a list key combines an id with the index; use withOccurrences");
  if (/selectedItems\.some\(\(\w+\) => \w+\.id === /.test(uiSource))
    problems.push("selection is checked by id; use isSelected(occurrence key)");
  return problems;
}

/** TR-M1: App.tsx only composes features. The cap goes down as more moves out; it never goes up. */
export const MAX_APP_LINES = 3200;

/** TR-M1: dialogs and overlays are feature components, not inline JSX in App.tsx; App stays under the cap. */
export function checkAppComposition(readFile) {
  const problems = [];
  const app = readFile("src/App.tsx") ?? "";
  const lines = app.split("\n").length;
  if (lines > MAX_APP_LINES) problems.push(`App.tsx has ${lines} lines; the cap is ${MAX_APP_LINES}`);
  if (/className="detail-overlay"/.test(app)) problems.push("App.tsx renders an inline dialog; move it to a feature");
  return problems;
}
