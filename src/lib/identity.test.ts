import { describe, expect, it } from "vitest";
import type { YtItem } from "../types";
import { domainId, indexOfOccurrence, singleKey, withOccurrences, withOccurrencesBy } from "./identity";

const song = (id: string, extra: Partial<YtItem> = {}): YtItem => ({
  id,
  kind: "song",
  title: "Same title",
  subtitle: "",
  artists: [],
  videoId: id,
  ...extra,
});

describe("stable domain ids and occurrence ids (U4-015)", () => {
  it("names an item by kind and source id, never by title", () => {
    expect(domainId(song("v1"))).toBe("song:v1");
    expect(domainId(song("local-1", { videoId: null, localPath: "C:/a.mp3" }))).toBe("song:C:/a.mp3");
    expect(domainId({ id: "x", kind: "album", browseId: "MPREb_1" })).toBe("album:MPREb_1");
    expect(domainId({ id: "x", kind: "playlist", playlistId: "PL1", browseId: "VLPL1" })).toBe("playlist:PL1");
    expect(domainId(song("a"))).not.toBe(domainId(song("b")));
  });

  it("gives every occurrence of a duplicate its own key", () => {
    const keys = withOccurrences([song("a"), song("b"), song("a")], "playlist:P").map((entry) => entry.key);
    expect(keys).toEqual(["playlist:P:song:a#0", "playlist:P:song:b#0", "playlist:P:song:a#1"]);
    expect(new Set(keys).size).toBe(3);
  });

  it("keeps keys stable when another song is inserted before", () => {
    const before = withOccurrences([song("a"), song("b")], "queue").map((entry) => entry.key);
    const after = withOccurrences([song("c"), song("a"), song("b")], "queue").map((entry) => entry.key);
    expect(after.slice(1)).toEqual(before);
  });

  it("uses YouTube Music's setVideoId as the occurrence id when there is one", () => {
    const [first, second] = withOccurrences(
      [song("a", { setVideoId: "S1" }), song("a", { setVideoId: "S2" })],
      "playlist:P",
    );
    expect(first.key).toBe("playlist:P:song:a@S1#0");
    expect(second.key).toBe("playlist:P:song:a@S2#0");
  });

  it("works for other records and for single items", () => {
    const keys = withOccurrencesBy([{ id: "t" }, { id: "t" }], "spotify", (track) => track.id).map((e) => e.key);
    expect(keys).toEqual(["spotify:t#0", "spotify:t#1"]);
    expect(singleKey(song("a"), "item")).toBe("item:song:a#0");
  });

  it("finds the clicked occurrence, not the first one with the same id", () => {
    const first = song("a");
    const second = song("a");
    const list = [first, song("b"), second];
    expect(indexOfOccurrence(list, second)).toBe(2);
    expect(indexOfOccurrence(list, song("a"), 2)).toBe(2);
    expect(indexOfOccurrence(list, song("a"))).toBe(0);
    expect(indexOfOccurrence(list, song("z"))).toBe(-1);
  });
});
