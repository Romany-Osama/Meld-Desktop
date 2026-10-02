// U4-007: deep-link parsing for Meld routes, YouTube / YouTube Music and Spotify links.
import { describe, expect, it } from "vitest";
import { parseLink } from "./links";

const SPOTIFY = "37i9dQZF1DXcBWIGoYBM5M";

describe("parseLink", () => {
  it("opens Meld routes from meld: links and app paths", () => {
    expect(parseLink("meld://album/MPREb_abc")).toEqual({
      kind: "route",
      route: { name: "album", browseId: "MPREb_abc" },
    });
    expect(parseLink("meld:/library/liked")).toEqual({ kind: "route", route: { name: "library", mode: "liked" } });
    expect(parseLink("meld://search?q=daft%20punk")).toEqual({
      kind: "route",
      route: { name: "search", query: "daft punk" },
    });
    expect(parseLink("meld://song/dQw4w9WgXcQ")).toEqual({ kind: "video", videoId: "dQw4w9WgXcQ" });
    expect(parseLink("/playlist/LOCAL_3")).toEqual({
      kind: "route",
      route: { name: "playlist", playlistId: "LOCAL_3" },
    });
  });

  it("plays YouTube and YouTube Music videos", () => {
    for (const link of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVM",
      "youtube.com/watch?feature=share&v=dQw4w9WgXcQ",
      "m.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ?si=x",
      "youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    ])
      expect(parseLink(link), link).toEqual({ kind: "video", videoId: "dQw4w9WgXcQ" });
  });

  it("opens YouTube Music pages by their browse ID", () => {
    const routeOf = (link: string) => {
      const target = parseLink(link);
      return target?.kind === "route" ? target.route : target;
    };
    expect(routeOf("https://music.youtube.com/browse/MPREb_4pL8gzRtw1p")).toEqual({
      name: "album",
      browseId: "MPREb_4pL8gzRtw1p",
    });
    expect(routeOf("https://music.youtube.com/channel/UCxyz123")).toEqual({ name: "artist", browseId: "UCxyz123" });
    expect(routeOf("https://music.youtube.com/browse/VLPL123")).toEqual({ name: "playlist", playlistId: "PL123" });
    expect(routeOf("https://music.youtube.com/playlist?list=OLAK5uy_abc")).toEqual({
      name: "playlist",
      playlistId: "OLAK5uy_abc",
    });
    expect(routeOf("https://www.youtube.com/playlist?list=PL123")).toEqual({ name: "playlist", playlistId: "PL123" });
    expect(routeOf("https://music.youtube.com/browse/MPSPPLabc")).toEqual({ name: "podcast", browseId: "MPSPPLabc" });
    expect(routeOf("https://music.youtube.com/search?q=abba")).toEqual({ name: "search", query: "abba" });
  });

  it("understands Spotify links and URIs", () => {
    expect(parseLink(`https://open.spotify.com/playlist/${SPOTIFY}?si=1`)).toEqual({
      kind: "route",
      route: { name: "spotify-playlist", playlistId: SPOTIFY },
    });
    expect(parseLink(`https://open.spotify.com/intl-de/track/${SPOTIFY}`)).toEqual({
      kind: "spotify",
      type: "track",
      id: SPOTIFY,
    });
    expect(parseLink(`spotify:album:${SPOTIFY}`)).toEqual({ kind: "spotify", type: "album", id: SPOTIFY });
    expect(parseLink("https://open.spotify.com/collection/tracks")).toEqual({
      kind: "route",
      route: { name: "spotify-liked" },
    });
  });

  it("ignores plain text, look-alike hosts and malformed IDs", () => {
    for (const text of [
      "",
      "daft punk",
      "youtube rewind",
      "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
      "https://evil.example/youtube.com/watch?v=dQw4w9WgXcQ",
      "https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ<script>",
      "javascript:alert(1)",
      "file:///C:/Windows/win.ini",
      "ftp://youtube.com/watch?v=dQw4w9WgXcQ",
      "meld://album/../../secret",
      "meld://settings/unknown",
      `https://open.spotify.com/user/${SPOTIFY}`,
      "spotify:track:short",
      "https://open.spotify.com.evil.example/track/" + SPOTIFY,
    ])
      expect(parseLink(text), text).toBeNull();
  });
});
