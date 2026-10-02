import { call } from "../../lib/ipc";
import { Dispatch, SetStateAction, useState, useMemo, useCallback } from "react";
import { errorMessage } from "../../lib/util";
import { SessionStatus, YtItem, PlaylistSort } from "../../types";
import type { SetNotice } from "../../app/notifications";

export type PlaylistsDeps = {
  sessionStatus: SessionStatus;
  setNotice: SetNotice;
  clearSelected: () => void;
  setSelectionMode: Dispatch<SetStateAction<boolean>>;
  settings: Record<string, boolean>;
};

export function usePlaylists({ sessionStatus, setNotice, clearSelected, setSelectionMode, settings }: PlaylistsDeps) {
  const [playlistSearch, setPlaylistSearch] = useState("");
  const [playlistView, setPlaylistView] = useState<"grid" | "list">("grid");
  const [playlistSort, setPlaylistSort] = useState<PlaylistSort>("created");
  const [playlistSortDescending, setPlaylistSortDescending] = useState(true);
  const [localPlaylists, setLocalPlaylists] = useState<(YtItem & { songCount?: number; savedAt?: number })[]>([]);
  const [playlistPickerItems, setPlaylistPickerItems] = useState<YtItem[] | null>(null);
  const [playlistPickerSearch, setPlaylistPickerSearch] = useState("");
  const [playlistPickerSort, setPlaylistPickerSort] = useState<PlaylistSort>("name");
  const [playlistPickerSortDescending, setPlaylistPickerSortDescending] = useState(false);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const [createSyncedPlaylist, setCreateSyncedPlaylist] = useState(false);

  const loadLocalPlaylists = async () => {
    try {
      setLocalPlaylists(await call("library_playlists"));
    } catch (error) {
      setNotice(`Playlists could not be loaded: ${errorMessage(error)}`, "error");
    }
  };

  const syncSavedPlaylists = async () => {
    if (!sessionStatus.authenticated || settings.ytmSync !== true) {
      await loadLocalPlaylists();
      return;
    }
    try {
      const result = await call("sync_youtube_library", { mode: "playlists" });
      await loadLocalPlaylists();
      setNotice(`YouTube Music playlist sync finished: ${result.playlists} playlists.`);
    } catch (error) {
      setNotice(`YouTube Music playlist sync failed: ${errorMessage(error)}`, "error");
      await loadLocalPlaylists();
    }
  };

  const openCreatePlaylistDialog = () => {
    setPlaylistPickerItems(null);
    setNewPlaylistTitle("");
    setCreateSyncedPlaylist(false);
    setCreatePlaylistOpen(true);
  };

  const createLocalPlaylist = async () => {
    const title = newPlaylistTitle.trim();
    if (!title) return;
    try {
      if (createSyncedPlaylist) {
        await call("ytm_create_playlist", { title });
      } else {
        await call("library_create_playlist", { title });
      }
      await loadLocalPlaylists();
      setCreatePlaylistOpen(false);
      setNewPlaylistTitle("");
      setNotice(
        createSyncedPlaylist ? `Created YouTube Music playlist “${title}”.` : `Created local playlist “${title}”.`,
      );
    } catch (error) {
      setNotice(`Playlist could not be created: ${errorMessage(error)}`, "error");
    }
  };

  const addToSelectedPlaylist = async (playlistId: string) => {
    const items = playlistPickerItems ?? [];
    if (items.length === 0) return;
    try {
      let addedCount = 0;
      let skippedCount = 0;
      if (playlistId.startsWith("LOCAL_")) {
        for (const item of items) {
          const added = await call("library_add_to_playlist", { playlistId, item });
          if (added) addedCount += 1;
          else skippedCount += 1;
        }
      } else {
        for (const item of items) {
          if (!item.videoId) {
            setNotice(`“${item.title}” has no source videoId required for a playlist add.`, "warning");
            return;
          }
          await call("ytm_add_to_playlist", { playlistId, videoId: item.videoId });
          addedCount += 1;
        }
      }
      setNotice(
        skippedCount > 0
          ? `Added ${addedCount} item${addedCount === 1 ? "" : "s"}; skipped ${skippedCount} already in the playlist.`
          : `Added ${addedCount} selected item${addedCount === 1 ? "" : "s"} to the playlist.`,
      );
      setPlaylistPickerItems(null);
      clearSelected();
      setSelectionMode(false);
    } catch (error) {
      setNotice(`Could not add selected items to playlist: ${errorMessage(error)}`, "error");
    }
  };

  const playlistQuery = playlistSearch.trim().toLowerCase();
  const matchesPlaylistQuery = useCallback(
    (title: string) => !playlistQuery || title.toLowerCase().includes(playlistQuery),
    [playlistQuery],
  );

  const hasVisiblePlaylistAutoEntries =
    (settings.show_liked_playlist !== false && matchesPlaylistQuery("Liked Songs")) ||
    (settings.show_downloaded_playlist !== false && matchesPlaylistQuery("Downloaded")) ||
    (settings.show_top_playlist !== false && matchesPlaylistQuery("Top Songs")) ||
    (settings.show_uploaded_playlist !== false && matchesPlaylistQuery("Uploaded"));

  const visiblePlaylists = useMemo(() => {
    const values = localPlaylists.filter((item) => matchesPlaylistQuery(item.title));
    if (playlistSort === "name") {
      const sorted = [...values].sort((left, right) => left.title.localeCompare(right.title));
      return playlistSortDescending ? sorted.reverse() : sorted;
    }
    if (playlistSort === "count") {
      const sorted = [...values].sort((left, right) => (left.songCount ?? 0) - (right.songCount ?? 0));
      return playlistSortDescending ? sorted.reverse() : sorted;
    }
    return playlistSortDescending ? values : [...values].reverse();
  }, [localPlaylists, matchesPlaylistQuery, playlistSort, playlistSortDescending]);

  const visiblePlaylistPicker = useMemo(() => {
    const query = playlistPickerSearch.trim().toLowerCase();
    const values = localPlaylists.filter((item) => !query || item.title.toLowerCase().includes(query));
    if (playlistPickerSort === "name") {
      const sorted = [...values].sort((left, right) => left.title.localeCompare(right.title));
      return playlistPickerSortDescending ? sorted.reverse() : sorted;
    }
    if (playlistPickerSort === "count") {
      const sorted = [...values].sort((left, right) => (left.songCount ?? 0) - (right.songCount ?? 0));
      return playlistPickerSortDescending ? sorted.reverse() : sorted;
    }
    return playlistPickerSortDescending ? values : [...values].reverse();
  }, [localPlaylists, playlistPickerSearch, playlistPickerSort, playlistPickerSortDescending]);

  return {
    localPlaylists,
    playlistSearch,
    setPlaylistSearch,
    playlistView,
    setPlaylistView,
    playlistSort,
    setPlaylistSort,
    playlistSortDescending,
    setPlaylistSortDescending,
    playlistPickerItems,
    setPlaylistPickerItems,
    playlistPickerSearch,
    setPlaylistPickerSearch,
    playlistPickerSort,
    setPlaylistPickerSort,
    playlistPickerSortDescending,
    setPlaylistPickerSortDescending,
    createPlaylistOpen,
    setCreatePlaylistOpen,
    newPlaylistTitle,
    setNewPlaylistTitle,
    createSyncedPlaylist,
    setCreateSyncedPlaylist,
    loadLocalPlaylists,
    syncSavedPlaylists,
    openCreatePlaylistDialog,
    createLocalPlaylist,
    addToSelectedPlaylist,
    playlistQuery,
    hasVisiblePlaylistAutoEntries,
    visiblePlaylists,
    visiblePlaylistPicker,
  };
}
