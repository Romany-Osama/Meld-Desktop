// U4-006: persist and restore the last safe route.
import { describe, expect, it } from "vitest";
import { parseLastRoute, restorableRoute, serializeLastRoute } from "./lastRoute";
import { Route } from "./routes";

describe("last route", () => {
  it("round-trips pages with the tab they were opened from", () => {
    const album: Route = { name: "album", browseId: "MPREb_1" };
    expect(parseLastRoute(serializeLastRoute(album, "search_input"))).toEqual({ route: album, tab: "search_input" });
    const library: Route = { name: "library", mode: "liked" };
    expect(parseLastRoute(serializeLastRoute(library, "library"))).toEqual({ route: library, tab: "library" });
    const search: Route = { name: "search", query: "abba" };
    expect(parseLastRoute(serializeLastRoute(search, "search_input"))).toEqual({ route: search, tab: "search_input" });
  });

  it("never restores Settings, and stores nothing for Home", () => {
    expect(serializeLastRoute({ name: "settings", page: "integrations" }, "home")).toBeNull();
    expect(serializeLastRoute({ name: "home" }, "home")).toBeNull();
    expect(parseLastRoute(JSON.stringify({ path: "/settings/integrations", tab: "home" }))).toBeNull();
  });

  it("does not restore a search for a link, which would open or play it", () => {
    for (const query of [
      "https://music.youtube.com/watch?v=abc",
      "youtu.be/abc",
      "www.youtube.com/watch?v=abc",
      "open.spotify.com/track/1",
    ])
      expect(restorableRoute({ name: "search", query })).toEqual({ name: "search", query: "" });
    expect(restorableRoute({ name: "search", query: "youtube rewind songs" })).toEqual({
      name: "search",
      query: "youtube rewind songs",
    });
  });

  it("falls back to the library for Spotify pages", () => {
    expect(restorableRoute({ name: "spotify-liked" })).toEqual({ name: "library", mode: "playlists" });
  });

  it("ignores malformed or tampered values", () => {
    for (const raw of [
      null,
      "",
      "{",
      "[]",
      "42",
      JSON.stringify({ path: "/album/../x", tab: "home" }),
      JSON.stringify({ path: "/album/MPREb_1", tab: "admin" }),
      JSON.stringify({ path: 7, tab: "home" }),
      "x".repeat(3000),
    ])
      expect(parseLastRoute(raw)).toBeNull();
  });
});
