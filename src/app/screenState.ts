// U4-010: the view state of a screen (filters, sorts, layout) is stored with its history entry, so Back and Forward
// return to a screen as it was left, not with whatever filter another visit set since.
import type { LibrarySort, PlaylistSort } from "../types";
import type { PodcastFilter, TopPeriod } from "../data/keys";
import type { Route } from "./routes";

export type LibraryScreenState = {
  search: string;
  sort: LibrarySort;
  sortDescending: boolean;
  mixSort: "created" | "name";
  mixSortDescending: boolean;
  view: "grid" | "list";
  podcastFilter: PodcastFilter;
  topPeriod: TopPeriod;
  playlistSearch: string;
  playlistSort: PlaylistSort;
  playlistSortDescending: boolean;
  playlistView: "grid" | "list";
};
export type HistoryScreenState = { query: string };
export type SpotifyScreenState = {
  query: string;
  sort: "original" | "name" | "artist" | "duration";
  descending: boolean;
};

export type ScreenState =
  | { kind: "library"; state: LibraryScreenState }
  | { kind: "history"; state: HistoryScreenState }
  | { kind: "spotify"; state: SpotifyScreenState };

/** Everything App can currently report; `captureScreenState` keeps the part that belongs to the route. */
export type ScreenStateSource = {
  library: LibraryScreenState;
  history: HistoryScreenState;
  spotify: SpotifyScreenState;
};

/** The view state worth restoring for `route`, or null for routes whose state is the route itself (search, album …). */
export function captureScreenState(route: Route, source: ScreenStateSource): ScreenState | null {
  switch (route.name) {
    case "library":
      return { kind: "library", state: { ...source.library } };
    case "history":
      return { kind: "history", state: { ...source.history } };
    case "spotify-playlist":
    case "spotify-liked":
      return { kind: "spotify", state: { ...source.spotify } };
    default:
      return null;
  }
}

/** True when `state` was captured for the kind of screen `route` shows (a stale or foreign snapshot is ignored). */
export function screenStateMatches(route: Route, state: ScreenState | null | undefined): state is ScreenState {
  if (!state) return false;
  if (route.name === "library") return state.kind === "library";
  if (route.name === "history") return state.kind === "history";
  if (route.name === "spotify-playlist" || route.name === "spotify-liked") return state.kind === "spotify";
  return false;
}
