// U4-011: what the user can do with an item is derived in one place from the item (type, source), the accounts,
// the item's library/download state and where the menu was opened. The menu renders this list, and
// `performMenuAction` refuses any action the list does not offer.
import type { DownloadInfo, LibraryItemState, YtItem } from "../types";

export type MenuAction =
  | "advanced_playback"
  | "sleep_timer"
  | "play"
  | "podcast_save"
  | "share"
  | "copy_link"
  | "playback_report"
  | "spotify_add"
  | "edit"
  | "playlist"
  | "cache_remove"
  | "download"
  | "download_cancel"
  | "download_remove"
  | "pin"
  | "unpin"
  | "artist"
  | "album"
  | "info"
  | "refetch"
  | "change_youtube_version"
  | "delete_uploaded"
  | "remove_from_playlist"
  | "radio"
  | "play_next"
  | "remove_history"
  | "meld_like"
  | "add_library"
  | "remove_library"
  | "episode_save"
  | "queue";

export type MenuContext = {
  /** The player's own menu (current song) or the menu of an item on a page. */
  surface: "item" | "player";
  googleSignedIn: boolean;
  spotifySignedIn: boolean;
  /** The item is shown in a Meld-local list (library, local history, a local playlist) or is a local file. */
  localContext: boolean;
  /** The Library page's "Playback cache" list is open. */
  playbackCacheList: boolean;
  /** ID of the playlist the item is shown in, when one is open. */
  openPlaylistId: string | null;
  state: LibraryItemState;
  download: DownloadInfo | null;
  /** A Spotify track is matched to this YouTube video. */
  spotifyMatch: boolean;
  playbackSpeed: number;
};

export type MenuEntry =
  | { type: "action"; action: MenuAction; label: string; quick?: boolean }
  | { type: "note"; text: string; error?: boolean };

const isTrack = (item: YtItem) => item.kind === "song" || item.kind === "episode";

/** The menu for `item` in `context`, in display order. Quick entries are shown as a button row. */
export function itemMenuEntries(item: YtItem, context: MenuContext): MenuEntry[] {
  const entries: MenuEntry[] = [];
  const add = (action: MenuAction, label: string, quick = false) =>
    entries.push({ type: "action", action, label, quick });
  const player = context.surface === "player";
  const remote = Boolean(item.videoId) && !item.localPath;
  const { state, download } = context;

  if (player) {
    add("advanced_playback", `Advanced playback · x${context.playbackSpeed.toFixed(2)}`);
    add("sleep_timer", "Sleep timer");
  }
  if (!player && isTrack(item)) add("play", "Play in Meld");
  if (item.kind === "podcast") {
    add("podcast_save", state.podcastSaved ? "Remove from library" : "Save to Podcasts", true);
    add("share", "Share", true);
  }
  if (isTrack(item)) {
    if (!player && context.localContext) add("edit", "Edit", true);
    add("playlist", "Add to playlist", true);
    if (remote) add(player ? "copy_link" : "share", player ? "Copy link" : "Share", true);
    if (player && remote) add("playback_report", "Copy playback report", true);
    if (remote && context.spotifySignedIn) add("spotify_add", "Add to Spotify playlist", true);
  }
  if (item.videoId) {
    if (context.playbackCacheList) add("cache_remove", "Remove playback cache");
    if (download?.state === "downloading")
      add(
        "download_cancel",
        `Cancel offline download${download.totalBytes ? ` · ${Math.round((download.bytes / download.totalBytes) * 100)}%` : ""}`,
      );
    else if (download?.state === "completed") add("download_remove", "Remove offline download");
    else if (!item.localPath)
      add(
        "download",
        download?.state === "failed"
          ? "Retry offline download"
          : download?.state === "cancelled"
            ? "Resume offline download"
            : "Download for offline listening",
      );
    if (download?.state === "completed")
      entries.push({
        type: "note",
        text: `Offline download ready${download.artworkPath ? " · artwork cached" : " · artwork unavailable"}${download.lyricsCached ? " · lyrics cached" : " · lyrics unavailable"}`,
      });
    if ((download?.state === "failed" || download?.state === "cancelled") && download.error)
      entries.push({ type: "note", text: download.error, error: true });
  }
  if (!player) add(state.pinned ? "unpin" : "pin", state.pinned ? "Unpin from Speed Dial" : "Pin to Speed Dial");
  if (isTrack(item)) {
    const artistCount = item.artists.filter((artist) => artist.id).length;
    if (item.kind === "song" && !item.localPath && artistCount > 0)
      add("artist", `View artist${artistCount > 1 ? "s" : ""}`);
    if (item.kind === "song" && item.albumId)
      add("album", `View album${item.albumTitle ? ` · ${item.albumTitle}` : ""}`);
    add("info", "Details");
    if (!player && item.videoId) add("refetch", "Refetch metadata");
    if (context.spotifyMatch) add("change_youtube_version", "Change YouTube version");
    if (!player && state.uploaded && context.googleSignedIn) add("delete_uploaded", "Delete uploaded song");
    if (!player && context.openPlaylistId?.startsWith("LOCAL_")) add("remove_from_playlist", "Remove from playlist");
    if (item.videoId) add("radio", "Start radio");
    if (!player && (item.videoId || item.localPath)) add("play_next", "Play next");
  }
  if (item.kind === "song") {
    if (!player && item.historyRemoveToken) add("remove_history", "Remove from YouTube Music history");
    if (!player && context.localContext)
      add("meld_like", state.liked ? "Remove from Meld Liked Songs" : "Add to Meld Liked Songs");
    if (!item.localPath)
      add(
        state.inLibrary ? "remove_library" : "add_library",
        state.inLibrary ? "Remove from library" : "Add to library",
      );
  }
  if (item.kind === "episode") {
    if (!player) add("episode_save", state.inLibrary ? "Remove from Saved Episodes" : "Save for later");
    if (item.albumId) {
      add("album", `View podcast${item.albumTitle ? ` · ${item.albumTitle}` : ""}`);
      add("podcast_save", state.podcastSaved ? "Unsubscribe from podcast" : "Subscribe to podcast");
    }
  }
  if (!player) add("queue", "Add to queue");
  return entries;
}

/** True when the menu for `item` in `context` offers `action`. */
export function canPerform(action: MenuAction, item: YtItem, context: MenuContext): boolean {
  return itemMenuEntries(item, context).some((entry) => entry.type === "action" && entry.action === action);
}
