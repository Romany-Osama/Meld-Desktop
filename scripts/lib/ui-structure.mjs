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
