import { invoke } from "@tauri-apps/api/core";
import { invokeCancellable } from "../../lib/cancellable";
import type { PlaylistPage, YtItem } from "../../types";
import type { ResourceCache } from "../../data/resourceCache";
import { useResource } from "../../data/useResource";
import { FRESH_FOR_MS, playlistKey } from "../../data/keys";
import { errorMessage } from "../../lib/util";
import type { SetNotice } from "../../app/notifications";

const PLAYLIST_FALLBACK = {
  status: "loading" as const,
  data: { playlist: { id: "", kind: "playlist", title: "", subtitle: "", artists: [] }, songs: [] } as PlaylistPage,
};

export const playlistIdOf = (item: YtItem) => item.browseId ?? item.id;

async function fetchPlaylist(item: YtItem, signal?: AbortSignal): Promise<PlaylistPage> {
  const playlistId = playlistIdOf(item);
  if (playlistId.startsWith("LOCAL_")) {
    const songs = await invoke<YtItem[]>("library_playlist_songs", { playlistId });
    return { playlist: item, songs };
  }
  return invokeCancellable<PlaylistPage>("ytm_playlist", { playlistId }, signal);
}

/** Server state of the open playlist (U4-008). Which playlist is open (`openPlaylist`) is the caller's view state. */
export function usePlaylistData({
  cache,
  openPlaylist,
  setNotice,
}: {
  cache: ResourceCache;
  openPlaylist: YtItem | null;
  setNotice: SetNotice;
}) {
  const key = openPlaylist ? playlistKey(playlistIdOf(openPlaylist)) : null;
  const [playlist, setPlaylistData] = useResource<PlaylistPage>(cache, key, PLAYLIST_FALLBACK);

  /** Loads `item`'s songs (scope `playlist`: opening another playlist supersedes it, U4-009). */
  const loadPlaylist = async (item: YtItem, { reuse = false }: { reuse?: boolean } = {}) => {
    const target = playlistKey(playlistIdOf(item));
    if (reuse && cache.isFresh(target, FRESH_FOR_MS)) return { status: "ready" as const };
    const placeholder: PlaylistPage = { playlist: item, songs: [] };
    return cache.load(target, (signal) => fetchPlaylist(item, signal), {
      scope: "playlist",
      placeholder,
      empty: placeholder,
    });
  };

  /** Re-reads the songs of the open playlist after an edit. */
  const reloadPlaylist = async () => {
    if (!openPlaylist) return;
    await cache.load(playlistKey(playlistIdOf(openPlaylist)), (signal) => fetchPlaylist(openPlaylist, signal), {
      scope: "playlist",
    });
  };

  const loadPlaylistMore = async () => {
    if (!key || playlist?.status !== "ready" || !playlist.data.continuation) return;
    const continuation = playlist.data.continuation;
    const token = cache.begin(`${key}:more`, "playlist-more");
    try {
      const next = await invoke<{ songs: YtItem[]; continuation?: string | null }>("ytm_playlist_continuation", {
        continuation,
      });
      if (!token.isCurrent()) return;
      cache.set<PlaylistPage>(key, (entry) => {
        if (!entry || entry.status !== "ready") return entry;
        const songs = [
          ...entry.data.songs,
          ...next.songs.filter((song) => !entry.data.songs.some((existing) => existing.id === song.id)),
        ];
        return { ...entry, data: { ...entry.data, songs, continuation: next.continuation } };
      });
    } catch (error) {
      if (token.isCurrent()) setNotice(`Playlist continuation failed: ${errorMessage(error)}`, "error");
    } finally {
      token.finish();
    }
  };

  return { playlist, setPlaylistData, loadPlaylist, reloadPlaylist, loadPlaylistMore };
}
