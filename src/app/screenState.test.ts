import { describe, expect, it } from "vitest";
import { captureScreenState, ScreenStateSource, screenStateMatches } from "./screenState";

const source: ScreenStateSource = {
  library: {
    search: "lofi",
    sort: "name",
    sortDescending: false,
    mixSort: "created",
    mixSortDescending: true,
    view: "list",
    podcastFilter: "channels",
    topPeriod: "week",
    playlistSearch: "",
    playlistSort: "count",
    playlistSortDescending: true,
    playlistView: "grid",
  },
  history: { query: "beatles" },
  spotify: { query: "jazz", sort: "artist", descending: false },
};

describe("screen state (U4-010)", () => {
  it("keeps the filters of the screen the route shows", () => {
    expect(captureScreenState({ name: "library", mode: "liked" }, source)).toEqual({
      kind: "library",
      state: source.library,
    });
    expect(captureScreenState({ name: "history", source: "local" }, source)).toEqual({
      kind: "history",
      state: { query: "beatles" },
    });
    expect(captureScreenState({ name: "spotify-liked" }, source)).toEqual({ kind: "spotify", state: source.spotify });
  });

  it("stores a copy, not the live object", () => {
    const captured = captureScreenState({ name: "library", mode: "mix" }, source);
    source.library.search = "changed";
    expect(captured?.kind === "library" && captured.state.search).toBe("lofi");
    source.library.search = "lofi";
  });

  it("has nothing to store for routes whose parameters are the whole state", () => {
    expect(captureScreenState({ name: "search", query: "x" }, source)).toBeNull();
    expect(captureScreenState({ name: "album", browseId: "MPREb_x" }, source)).toBeNull();
    expect(captureScreenState({ name: "home" }, source)).toBeNull();
  });

  it("only applies a snapshot to the kind of screen it was taken from", () => {
    const library = captureScreenState({ name: "library", mode: "mix" }, source);
    expect(screenStateMatches({ name: "library", mode: "songs" }, library)).toBe(true);
    expect(screenStateMatches({ name: "history", source: "local" }, library)).toBe(false);
    expect(screenStateMatches({ name: "home" }, library)).toBe(false);
    expect(screenStateMatches({ name: "library", mode: "mix" }, null)).toBe(false);
  });
});
