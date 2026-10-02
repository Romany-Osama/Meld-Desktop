import { describe, expect, it } from "vitest";
import { canPerform, itemMenuEntries, MenuContext } from "./capabilities";
import type { YtItem } from "../types";

const song: YtItem = {
  id: "vid1",
  kind: "song",
  title: "Song",
  subtitle: "",
  artists: [{ id: "UC1", name: "Artist" }],
  videoId: "vid1",
  albumId: "MPREb_1",
  albumTitle: "Album",
};
const context = (overrides: Partial<MenuContext> = {}): MenuContext => ({
  surface: "item",
  googleSignedIn: false,
  spotifySignedIn: false,
  localContext: false,
  playbackCacheList: false,
  openPlaylistId: null,
  state: { liked: false, youtubeLiked: false, inLibrary: false, uploaded: false, pinned: false },
  download: null,
  spotifyMatch: false,
  playbackSpeed: 1,
  ...overrides,
});
const actions = (item: YtItem, ctx: MenuContext) =>
  itemMenuEntries(item, ctx).flatMap((entry) => (entry.type === "action" ? [entry.action] : []));

describe("item capabilities (U4-011)", () => {
  it("offers the full set for a YouTube song on a page", () => {
    expect(actions(song, context())).toEqual([
      "play",
      "playlist",
      "share",
      "download",
      "pin",
      "artist",
      "album",
      "info",
      "refetch",
      "radio",
      "play_next",
      "add_library",
      "queue",
    ]);
  });

  it("derives entries from the accounts", () => {
    expect(actions(song, context())).not.toContain("spotify_add");
    expect(actions(song, context({ spotifySignedIn: true }))).toContain("spotify_add");
    const uploaded = context({ state: { ...context().state, uploaded: true } });
    expect(actions(song, uploaded)).not.toContain("delete_uploaded");
    expect(actions(song, { ...uploaded, googleSignedIn: true })).toContain("delete_uploaded");
  });

  it("derives entries from the item's source", () => {
    const local: YtItem = { ...song, videoId: null, localPath: "C:/music/a.mp3", albumId: null };
    const result = actions(local, context({ localContext: true }));
    expect(result).toEqual(["play", "edit", "playlist", "pin", "info", "play_next", "meld_like", "queue"]);
    expect(result).not.toContain("share");
    expect(result).not.toContain("download");
    expect(result).not.toContain("add_library");
  });

  it("derives entries from the download and library state", () => {
    const downloading = context({
      download: { songId: "vid1", path: "", bytes: 50, totalBytes: 200, state: "downloading", lyricsCached: false },
    });
    expect(itemMenuEntries(song, downloading)).toContainEqual({
      type: "action",
      action: "download_cancel",
      label: "Cancel offline download · 25%",
      quick: false,
    });
    const done = context({
      download: { songId: "vid1", path: "", bytes: 1, state: "completed", lyricsCached: true, artworkPath: "a.jpg" },
      state: { ...context().state, inLibrary: true, pinned: true },
    });
    const result = actions(song, done);
    expect(result).toContain("download_remove");
    expect(result).not.toContain("download");
    expect(result).toContain("remove_library");
    expect(result).toContain("unpin");
    expect(itemMenuEntries(song, done)).toContainEqual({
      type: "note",
      text: "Offline download ready · artwork cached · lyrics cached",
    });
    const failed = context({
      download: { songId: "vid1", path: "", bytes: 0, state: "failed", error: "HTTP 403", lyricsCached: false },
    });
    expect(itemMenuEntries(song, failed)).toContainEqual({ type: "note", text: "HTTP 403", error: true });
  });

  it("derives entries from where the menu was opened", () => {
    const player = actions(song, context({ surface: "player" }));
    expect(player.slice(0, 2)).toEqual(["advanced_playback", "sleep_timer"]);
    expect(player).toContain("copy_link");
    expect(player).toContain("playback_report");
    for (const hidden of ["play", "share", "pin", "refetch", "play_next", "queue"])
      expect(player).not.toContain(hidden);
    expect(actions(song, context({ openPlaylistId: "LOCAL_1" }))).toContain("remove_from_playlist");
    expect(actions(song, context({ openPlaylistId: "PL_remote" }))).not.toContain("remove_from_playlist");
    expect(actions(song, context({ playbackCacheList: true }))).toContain("cache_remove");
  });

  it("covers podcasts and episodes", () => {
    const podcast: YtItem = { id: "MPSP1", kind: "podcast", title: "Show", subtitle: "", artists: [] };
    expect(actions(podcast, context())).toEqual(["podcast_save", "share", "pin", "queue"]);
    const episode: YtItem = { ...song, kind: "episode", artists: [] };
    const result = actions(episode, context());
    expect(result).toContain("episode_save");
    expect(result).toContain("podcast_save");
    expect(result).not.toContain("add_library");
  });

  it("refuses actions the menu does not offer", () => {
    expect(canPerform("delete_uploaded", song, context())).toBe(false);
    expect(canPerform("share", song, context())).toBe(true);
    expect(canPerform("share", { ...song, videoId: null, localPath: "x.mp3" }, context())).toBe(false);
  });
});
