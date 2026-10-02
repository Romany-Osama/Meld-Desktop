// U4-003 / U4-004: typed routes and route-based history.
import { describe, expect, it } from "vitest";
import { EMPTY_HISTORY, MAX_HISTORY_ENTRIES, pushEntry, stepBack, stepForward } from "./history";
import {
  isValidRoute,
  LIBRARY_MODES,
  parseRoutePath,
  Route,
  routeFromView,
  RouteView,
  routePath,
  SETTINGS_PAGES,
  topLevelOf,
} from "./routes";

const everyRoute: Route[] = [
  { name: "home" },
  { name: "search", query: "" },
  { name: "search", query: "lo-fi & chill / 2024?" },
  ...LIBRARY_MODES.map((mode) => ({ name: "library", mode }) as Route),
  { name: "history", source: "local" },
  { name: "history", source: "remote" },
  { name: "stats", period: "week" },
  { name: "album", browseId: "MPREb_abc123" },
  { name: "artist", browseId: "UC_x-Y" },
  { name: "podcast", browseId: "MPSPPLx" },
  { name: "browse", browseId: "FEmusic_moods_and_genres_category", params: "ggMPOg1uX1JOQWZFeDByc2Jm" },
  { name: "browse", browseId: "FEmusic_charts" },
  { name: "playlist", playlistId: "VLPL123" },
  { name: "playlist", playlistId: "LOCAL_7" },
  { name: "spotify-playlist", playlistId: "37i9dQZF1DXcBWIGoYBM5M" },
  { name: "spotify-liked" },
  ...SETTINGS_PAGES.map((page) => ({ name: "settings", page }) as Route),
];

describe("routes", () => {
  it("round-trips every durable surface through its path", () => {
    for (const route of everyRoute) {
      expect(isValidRoute(route)).toBe(true);
      expect(parseRoutePath(routePath(route))).toEqual(route);
    }
  });

  it("rejects unknown paths, bad enums and IDs outside the allowed alphabet", () => {
    for (const path of [
      "",
      "/",
      "/nowhere",
      "/library/everything",
      "/stats/decade",
      "/settings/secrets",
      "/album/",
      "/album/a b",
      "/album/../../etc",
      "/album/%3Cscript%3E",
      "/playlist/x/y",
      "/spotify/playlist",
      `/album/${"a".repeat(201)}`,
    ])
      expect(parseRoutePath(path), path).toBeNull();
    expect(isValidRoute({ name: "artist", browseId: "javascript:alert(1)" })).toBe(false);
    expect(isValidRoute({ name: "search", query: "x".repeat(501) })).toBe(false);
  });

  it("derives the visible route, topmost surface first", () => {
    const tab: RouteView = {
      active: "library",
      submittedQuery: "",
      libraryMode: "albums",
      historySource: "local",
      statsPeriod: "all",
      settingsPage: null,
      detail: null,
      playlistId: null,
      spotifyPlaylistId: null,
      spotifyLikedOpen: false,
    };
    expect(routeFromView(tab)).toEqual({ name: "library", mode: "albums" });
    expect(routeFromView({ ...tab, spotifyLikedOpen: true })).toEqual({ name: "spotify-liked" });
    expect(routeFromView({ ...tab, detail: { kind: "album", browseId: "MPREb_1" } })).toEqual({
      name: "album",
      browseId: "MPREb_1",
    });
    expect(routeFromView({ ...tab, detail: { kind: "album", browseId: "MPREb_1" }, playlistId: "LOCAL_2" })).toEqual({
      name: "playlist",
      playlistId: "LOCAL_2",
    });
    expect(routeFromView({ ...tab, settingsPage: "storage", playlistId: "LOCAL_2" })).toEqual({
      name: "settings",
      page: "storage",
    });
    // A detail page that is still loading without an ID is not a durable surface yet.
    expect(routeFromView({ ...tab, detail: { kind: "album", browseId: null } })).toEqual({
      name: "library",
      mode: "albums",
    });
    expect(routeFromView({ ...tab, active: "search_input", submittedQuery: "abba" })).toEqual({
      name: "search",
      query: "abba",
    });
  });

  it("maps routes to their sidebar destination", () => {
    expect(topLevelOf({ name: "search", query: "x" })).toBe("search_input");
    expect(topLevelOf({ name: "spotify-liked" })).toBe("library");
    expect(topLevelOf({ name: "album", browseId: "MPREb_1" }, "home")).toBe("home");
  });
});

describe("route history", () => {
  const at = (route: Route, scrollTop = 0) => ({ route, tab: "home" as const, scrollTop });
  const home = at({ name: "home" });
  const album = at({ name: "album", browseId: "MPREb_1" }, 640);
  const search = at({ name: "search", query: "abba" }, 120);

  it("goes back and forward through routes with their scroll offsets", () => {
    let history = pushEntry(EMPTY_HISTORY, home);
    history = pushEntry(history, album);
    const back = stepBack(history, search)!;
    expect(back.entry).toEqual(album);
    const backAgain = stepBack(back.history, album)!;
    expect(backAgain.entry).toEqual(home);
    expect(stepBack(backAgain.history, home)).toBeNull();
    const forward = stepForward(backAgain.history, home)!;
    expect(forward.entry).toEqual(album);
    expect(stepForward(forward.history, album)!.entry).toEqual(search);
  });

  it("clears forward entries on a new navigation and collapses repeats of the same route", () => {
    const history = stepBack(pushEntry(pushEntry(EMPTY_HISTORY, home), album), search)!.history;
    expect(history.forward).toHaveLength(1);
    const next = pushEntry(history, at({ name: "album", browseId: "MPREb_1" }, 10));
    expect(next.forward).toEqual([]);
    expect(next.back).toEqual([home, at({ name: "album", browseId: "MPREb_1" }, 10)]);
    expect(pushEntry(next, at({ name: "album", browseId: "MPREb_1" }, 20)).back).toEqual([
      home,
      at({ name: "album", browseId: "MPREb_1" }, 20),
    ]);
  });

  it("keeps at most MAX_HISTORY_ENTRIES", () => {
    let history = EMPTY_HISTORY;
    for (let index = 0; index < MAX_HISTORY_ENTRIES + 10; index++)
      history = pushEntry(history, at({ name: "search", query: `q${index}` }));
    expect(history.back).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(history.back[0].route).toEqual({ name: "search", query: "q10" });
  });
});
