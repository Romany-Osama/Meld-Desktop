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
