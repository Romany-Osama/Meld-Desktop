// U4-003: every durable surface has a typed route with serialisable parameters.
// A route is plain data: it can be stored in history entries (U4-004), persisted (U4-006) and parsed from links (U4-007).

export const LIBRARY_MODES = [
  "mix",
  "local",
  "songs",
  "liked",
  "uploaded",
  "downloads",
  "cache",
  "top",
  "playlists",
  "albums",
  "artists",
  "podcasts",
] as const;
export type LibraryMode = (typeof LIBRARY_MODES)[number];

export const STATS_PERIODS = ["all", "day", "week", "month", "year"] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

export const HISTORY_SOURCES = ["local", "remote"] as const;
export type HistorySource = (typeof HISTORY_SOURCES)[number];

export const SETTINGS_PAGES = [
  "main",
  "appearance",
  "content",
  "player",
  "privacy",
  "storage",
  "integrations",
  "about",
] as const;
export type SettingsPage = (typeof SETTINGS_PAGES)[number];

export type Route =
  | { name: "home" }
  | { name: "search"; query: string }
  | { name: "library"; mode: LibraryMode }
  | { name: "history"; source: HistorySource }
  | { name: "stats"; period: StatsPeriod }
  | { name: "album"; browseId: string }
  | { name: "artist"; browseId: string }
  | { name: "podcast"; browseId: string }
  | { name: "browse"; browseId: string; params?: string }
  | { name: "playlist"; playlistId: string }
  | { name: "spotify-playlist"; playlistId: string }
  | { name: "spotify-liked" }
  | { name: "settings"; page: SettingsPage };

export type RouteName = Route["name"];

/** The sidebar destination a route belongs to. */
export type TopLevel = "home" | "search_input" | "library" | "history" | "stats";

export const DEFAULT_ROUTE: Route = { name: "home" };

// YouTube Music browse IDs, playlist IDs (including LOCAL_<n>) and Spotify IDs use this alphabet.
const ID = /^[A-Za-z0-9_-]{1,200}$/;
const PARAMS = /^[A-Za-z0-9_%=-]{1,500}$/;
const MAX_QUERY = 500;

const isOneOf = <T extends string>(values: readonly T[], value: string | null | undefined): value is T =>
  value != null && (values as readonly string[]).includes(value);

/** True when the route's parameters are valid (IDs in the expected alphabet, enums in range). */
export function isValidRoute(route: Route): boolean {
  switch (route.name) {
    case "home":
    case "spotify-liked":
      return true;
    case "search":
      return typeof route.query === "string" && route.query.length <= MAX_QUERY;
    case "library":
      return isOneOf(LIBRARY_MODES, route.mode);
    case "history":
      return isOneOf(HISTORY_SOURCES, route.source);
    case "stats":
      return isOneOf(STATS_PERIODS, route.period);
    case "settings":
      return isOneOf(SETTINGS_PAGES, route.page);
    case "album":
    case "artist":
    case "podcast":
      return ID.test(route.browseId);
    case "browse":
      return ID.test(route.browseId) && (route.params === undefined || PARAMS.test(route.params));
    case "playlist":
    case "spotify-playlist":
      return ID.test(route.playlistId);
  }
}

/** Serialises a route as an app path, e.g. `/album/MPREb_x`, `/library/songs`, `/search?q=lofi`. */
export function routePath(route: Route): string {
  switch (route.name) {
    case "home":
      return "/home";
    case "search":
      return route.query ? `/search?q=${encodeURIComponent(route.query)}` : "/search";
    case "library":
      return `/library/${route.mode}`;
    case "history":
      return `/history/${route.source}`;
    case "stats":
      return `/stats/${route.period}`;
    case "settings":
      return `/settings/${route.page}`;
    case "album":
    case "artist":
    case "podcast":
      return `/${route.name}/${route.browseId}`;
    case "browse":
      return route.params ? `/browse/${route.browseId}?params=${route.params}` : `/browse/${route.browseId}`;
    case "playlist":
      return `/playlist/${route.playlistId}`;
    case "spotify-playlist":
      return `/spotify/playlist/${route.playlistId}`;
    case "spotify-liked":
      return "/spotify/liked";
  }
}

/** Parses an app path produced by `routePath`; anything unknown or invalid returns null. */
export function parseRoutePath(path: string): Route | null {
  if (typeof path !== "string" || path.length > 1000) return null;
  const [pathname, search = ""] = path.split("?", 2);
  const parts = pathname.split("/").filter(Boolean);
  const query = new URLSearchParams(search);
  let route: Route | null = null;
  const [first, second, third] = parts;
  if (parts.length === 1 && first === "home") route = { name: "home" };
  else if (parts.length === 1 && first === "search") route = { name: "search", query: query.get("q") ?? "" };
  else if (parts.length === 2 && first === "library" && isOneOf(LIBRARY_MODES, second))
    route = { name: "library", mode: second };
  else if (parts.length === 2 && first === "history" && isOneOf(HISTORY_SOURCES, second))
    route = { name: "history", source: second };
  else if (parts.length === 2 && first === "stats" && isOneOf(STATS_PERIODS, second))
    route = { name: "stats", period: second };
  else if (parts.length === 2 && first === "settings" && isOneOf(SETTINGS_PAGES, second))
    route = { name: "settings", page: second };
  else if (parts.length === 2 && (first === "album" || first === "artist" || first === "podcast"))
    route = { name: first, browseId: second };
  else if (parts.length === 2 && first === "browse") {
    const params = query.get("params");
    route = params ? { name: "browse", browseId: second, params } : { name: "browse", browseId: second };
  } else if (parts.length === 2 && first === "playlist") route = { name: "playlist", playlistId: second };
  else if (parts.length === 3 && first === "spotify" && second === "playlist")
    route = { name: "spotify-playlist", playlistId: third };
  else if (parts.length === 2 && first === "spotify" && second === "liked") route = { name: "spotify-liked" };
  return route && isValidRoute(route) ? route : null;
}

/** Stable identity of a route (two routes with the same key show the same surface). */
export const routeKey = (route: Route) => routePath(route);

export const sameRoute = (left: Route | null | undefined, right: Route | null | undefined) =>
  !!left && !!right && routeKey(left) === routeKey(right);

/** The sidebar destination that is highlighted while `route` is shown. */
export function topLevelOf(route: Route, fallback: TopLevel = "home"): TopLevel {
  switch (route.name) {
    case "home":
      return "home";
    case "search":
      return "search_input";
    case "library":
    case "spotify-playlist":
    case "spotify-liked":
      return "library";
    case "history":
      return "history";
    case "stats":
      return "stats";
    default:
      // Detail pages, playlists and settings open on top of whichever destination was active.
      return fallback;
  }
}

/** The view state the route is derived from (see `routeFromView`). */
export type RouteView = {
  active: TopLevel;
  submittedQuery: string;
  libraryMode: LibraryMode;
  historySource: HistorySource;
  statsPeriod: StatsPeriod;
  settingsPage: SettingsPage | null;
  detail: { kind: string; browseId?: string | null } | null;
  playlistId: string | null;
  spotifyPlaylistId: string | null;
  spotifyLikedOpen: boolean;
};

/** The route of the surface the user currently sees, topmost first (settings → playlist → detail → Spotify → tab). */
export function routeFromView(view: RouteView): Route {
  const candidates: (Route | null)[] = [
    view.settingsPage ? { name: "settings", page: view.settingsPage } : null,
    view.playlistId ? { name: "playlist", playlistId: view.playlistId } : null,
    view.detail?.browseId ? detailRoute(view.detail.kind, view.detail.browseId) : null,
    view.spotifyPlaylistId ? { name: "spotify-playlist", playlistId: view.spotifyPlaylistId } : null,
    view.spotifyLikedOpen ? { name: "spotify-liked" } : null,
  ];
  for (const candidate of candidates) if (candidate && isValidRoute(candidate)) return candidate;
  switch (view.active) {
    case "home":
      return { name: "home" };
    case "search_input":
      return { name: "search", query: view.submittedQuery.slice(0, MAX_QUERY) };
    case "library":
      return { name: "library", mode: view.libraryMode };
    case "history":
      return { name: "history", source: view.historySource };
    case "stats":
      return { name: "stats", period: view.statsPeriod };
  }
}

function detailRoute(kind: string, browseId: string): Route | null {
  if (kind === "album" || kind === "artist" || kind === "podcast") return { name: kind, browseId };
  if (kind === "browse") return { name: "browse", browseId };
  return null;
}

/** The library chip that selects `mode`, for modes that have one. */
export function librarySongFilterFor(
  mode: LibraryMode,
): "liked" | "library" | "uploaded" | "downloaded" | "top" | null {
  if (mode === "songs") return "library";
  if (mode === "downloads") return "downloaded";
  if (mode === "liked" || mode === "uploaded" || mode === "top") return mode;
  return null;
}
