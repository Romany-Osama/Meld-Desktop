import { invoke } from "@tauri-apps/api/core";
import { Dispatch, SetStateAction, useState } from "react";
import { AudioQuality } from "../../lib/audioQuality";
import { errorMessage } from "../../lib/util";
import {
  YtItem,
  SpotifyProfile,
  SpotifySessionStatus,
  LoadState,
  SpotifyLibraryNode,
  SpotifyTrackPage,
  SpotifyLikedTracksPayload,
  SpotifyPlaylistItem,
  SpotifyTrackMatch,
  SpotifyFolderItem,
  SpotifyTrackItem,
  SearchPage,
} from "../../types";
import type { SetNotice } from "../../app/notifications";
import type { Destructive } from "../../app/destructive";

export type SpotifyLibraryDeps = {
  audioQuality: AudioQuality;
  setMenuItem: Dispatch<SetStateAction<YtItem | null>>;
  setNotice: SetNotice;
  setSpotifyProfile: Dispatch<SetStateAction<SpotifyProfile | null>>;
  spotifyStatus: SpotifySessionStatus;
  destructive: Destructive;
};

export function useSpotifyLibrary({
  audioQuality,
  setMenuItem,
  setNotice,
  setSpotifyProfile,
  spotifyStatus,
  destructive,
}: SpotifyLibraryDeps) {
  const [spotifyLibrary, setSpotifyLibrary] = useState<LoadState<SpotifyLibraryNode>>({
    status: "idle",
    data: { folders: [], playlists: [], totalCount: 0 },
  });

  const [spotifyFolderStack, setSpotifyFolderStack] = useState<{ uri: string; name: string }[]>([]);

  const [spotifyPlaylistTracks, setSpotifyPlaylistTracks] = useState<LoadState<SpotifyTrackPage>>({
    status: "idle",
    data: { tracks: [], totalCount: 0, offset: 0, limit: 100 },
  });

  const [spotifyLikedTracks, setSpotifyLikedTracks] = useState<LoadState<SpotifyLikedTracksPayload>>({
    status: "idle",
    data: { tracks: [], totalCount: 0 },
  });

  const [spotifyOpenPlaylist, setSpotifyOpenPlaylist] = useState<SpotifyPlaylistItem | null>(null);
  const [spotifyRenameName, setSpotifyRenameName] = useState("");
  const [spotifyPlaylistLoadingMore, setSpotifyPlaylistLoadingMore] = useState(false);
  const [spotifyDetailQuery, setSpotifyDetailQuery] = useState("");
  const [spotifyDetailSort, setSpotifyDetailSort] = useState<"original" | "name" | "artist" | "duration">("original");
  const [spotifyDetailSortDescending, setSpotifyDetailSortDescending] = useState(true);
  const [spotifyReorderUnlocked, setSpotifyReorderUnlocked] = useState(false);
  const [spotifyLikedOpen, setSpotifyLikedOpen] = useState(false);
  const [spotifyAddItem, setSpotifyAddItem] = useState<YtItem | null>(null);

  const [spotifyAddState, setSpotifyAddState] = useState<LoadState<{
    match: SpotifyTrackMatch | null;
    playlists: SpotifyPlaylistItem[];
  }> | null>(null);

  const loadSpotifyProfile = async () => {
    if (!spotifyStatus.authenticated) {
      setSpotifyProfile(null);
      setSpotifyLibrary({ status: "idle", data: { folders: [], playlists: [], totalCount: 0 } });
      setSpotifyLikedTracks({ status: "idle", data: { tracks: [], totalCount: 0 } });
      setSpotifyFolderStack([]);
      return;
    }
    try {
      setSpotifyProfile(await invoke<SpotifyProfile>("spotify_profile"));
    } catch (error) {
      setSpotifyProfile(null);
      setNotice(`Spotify profile could not be loaded: ${errorMessage(error)}`, "error");
    }
  };

  const loadSpotifyLibrary = async (folderUri: string | null = null) => {
    if (!spotifyStatus.authenticated) return;
    setSpotifyLibrary((current) => ({ ...current, status: "loading", error: undefined }));
    try {
      setSpotifyLibrary({
        status: "ready",
        data: await invoke<SpotifyLibraryNode>("spotify_library_node", { folderUri }),
      });
    } catch (error) {
      setSpotifyLibrary({
        status: "error",
        data: { folders: [], playlists: [], totalCount: 0 },
        error: errorMessage(error),
      });
    }
  };

  const loadSpotifyLikedTracks = async () => {
    if (!spotifyStatus.authenticated) return;
    setSpotifyLikedTracks((current) => ({ ...current, status: "loading", error: undefined }));
    try {
      setSpotifyLikedTracks({ status: "ready", data: await invoke<SpotifyLikedTracksPayload>("spotify_liked_tracks") });
    } catch (error) {
      setSpotifyLikedTracks({ status: "error", data: { tracks: [], totalCount: 0 }, error: errorMessage(error) });
    }
  };

  const openSpotifyFolder = async (folder: SpotifyFolderItem) => {
    setSpotifyFolderStack((current) => [...current, { uri: folder.uri, name: folder.name }]);
    await loadSpotifyLibrary(folder.uri);
  };

  const openSpotifyPlaylist = async (playlistItem: SpotifyPlaylistItem) => {
    setSpotifyOpenPlaylist(playlistItem);
    setSpotifyRenameName(playlistItem.name);
    setSpotifyPlaylistTracks({ status: "loading", data: { tracks: [], totalCount: 0, offset: 0, limit: 100 } });
    try {
      setSpotifyPlaylistTracks({
        status: "ready",
        data: await invoke<SpotifyTrackPage>("spotify_playlist_tracks", { playlistId: playlistItem.id, offset: 0 }),
      });
    } catch (error) {
      setSpotifyPlaylistTracks({
        status: "error",
        data: { tracks: [], totalCount: 0, offset: 0, limit: 100 },
        error: errorMessage(error),
      });
    }
  };

  const visibleSpotifyPlaylistTracks =
    spotifyPlaylistTracks.status === "ready"
      ? [...spotifyPlaylistTracks.data.tracks]
          .filter(
            (track) =>
              !spotifyDetailQuery.trim() ||
              `${track.name} ${track.artist} ${track.album}`
                .toLowerCase()
                .includes(spotifyDetailQuery.trim().toLowerCase()),
          )
          .sort((left, right) => {
            if (spotifyDetailSort === "original") {
              const leftIndex = spotifyPlaylistTracks.data.tracks.indexOf(left);
              const rightIndex = spotifyPlaylistTracks.data.tracks.indexOf(right);
              return spotifyDetailSortDescending ? rightIndex - leftIndex : leftIndex - rightIndex;
            }
            const leftValue =
              spotifyDetailSort === "duration"
                ? left.durationMs
                : spotifyDetailSort === "artist"
                  ? left.artist.toLowerCase()
                  : left.name.toLowerCase();
            const rightValue =
              spotifyDetailSort === "duration"
                ? right.durationMs
                : spotifyDetailSort === "artist"
                  ? right.artist.toLowerCase()
                  : right.name.toLowerCase();
            const comparison = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
            return spotifyDetailSortDescending ? -comparison : comparison;
          })
      : [];

  const moveSpotifyTrack = async (track: SpotifyTrackItem, direction: "up" | "down") => {
    if (!spotifyOpenPlaylist || !track.uid || spotifyPlaylistTracks.status !== "ready") return;
    const tracks = spotifyPlaylistTracks.data.tracks;
    const index = tracks.findIndex((value) => value.uid === track.uid);
    if (index < 0) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= tracks.length) return;
    const beforeUid = direction === "up" ? tracks[targetIndex].uid : (tracks[targetIndex + 1]?.uid ?? null);
    try {
      await invoke("spotify_move_in_playlist", { playlistId: spotifyOpenPlaylist.id, uids: [track.uid], beforeUid });
      await openSpotifyPlaylist(spotifyOpenPlaylist);
      setNotice(`Moved “${track.name}” ${direction}.`, "success");
    } catch (error) {
      setNotice(`Spotify track could not be moved: ${errorMessage(error)}`, "error");
    }
  };

  const loadMoreSpotifyPlaylistTracks = async () => {
    if (
      !spotifyOpenPlaylist ||
      spotifyPlaylistTracks.status !== "ready" ||
      spotifyPlaylistLoadingMore ||
      spotifyPlaylistTracks.data.tracks.length >= spotifyPlaylistTracks.data.totalCount
    )
      return;
    setSpotifyPlaylistLoadingMore(true);
    try {
      const next = await invoke<SpotifyTrackPage>("spotify_playlist_tracks", {
        playlistId: spotifyOpenPlaylist.id,
        offset: spotifyPlaylistTracks.data.tracks.length,
      });
      setSpotifyPlaylistTracks({
        status: "ready",
        data: { ...next, tracks: [...spotifyPlaylistTracks.data.tracks, ...next.tracks] },
      });
    } catch (error) {
      setNotice(`More Spotify tracks could not be loaded: ${errorMessage(error)}`, "error");
    } finally {
      setSpotifyPlaylistLoadingMore(false);
    }
  };

  const renameSpotifyPlaylist = async () => {
    if (!spotifyOpenPlaylist || !spotifyRenameName.trim()) return;
    try {
      await invoke("spotify_rename_playlist", {
        playlistId: spotifyOpenPlaylist.id,
        newName: spotifyRenameName.trim(),
      });
      const updated = { ...spotifyOpenPlaylist, name: spotifyRenameName.trim() };
      setSpotifyOpenPlaylist(updated);
      setNotice(`Renamed Spotify playlist to “${updated.name}”.`, "success");
      await loadSpotifyLibrary(spotifyFolderStack[spotifyFolderStack.length - 1]?.uri ?? null);
    } catch (error) {
      setNotice(`Spotify playlist could not be renamed: ${errorMessage(error)}`, "error");
    }
  };

  const removeSpotifyTrack = async (track: SpotifyTrackItem) => {
    if (!spotifyOpenPlaylist || !track.uid) {
      setNotice("Spotify could not remove this track because the playlist item uid was not returned.", "warning");
      return;
    }
    const playlist = spotifyOpenPlaylist;
    const uid = track.uid;
    await destructive({
      severity: "permanent",
      key: `spotify-remove:${playlist.id}:${uid}`,
      confirm: {
        title: "Remove from Spotify playlist?",
        message: `“${track.name}” is removed from “${playlist.name}” on Spotify.`,
        confirmLabel: "Remove",
      },
      commit: () => invoke("spotify_remove_from_playlist", { playlistId: playlist.id, uid }),
      refresh: () => openSpotifyPlaylist(playlist),
      success: `Removed “${track.name}” from Spotify playlist.`,
      failure: "Spotify track could not be removed",
    });
  };

  const findYouTubeMatchForSpotifyTrack = async (track: SpotifyTrackItem) => {
    const result = await invoke<SearchPage>("ytm_search", { query: `${track.artist} ${track.name}`.trim() });
    return result.items.find((candidate) => candidate.kind === "song") ?? null;
  };

  const downloadSpotifyPlaylist = async () => {
    if (!spotifyOpenPlaylist || spotifyPlaylistTracks.status !== "ready") return;
    const progressKey = `spotify-download:${spotifyOpenPlaylist.id}`;
    let queued = 0;
    let skipped = 0;
    const tracks = [...spotifyPlaylistTracks.data.tracks];
    let offset = tracks.length;
    try {
      while (offset < spotifyPlaylistTracks.data.totalCount) {
        setNotice({
          kind: "progress",
          key: progressKey,
          message: "Loading Spotify playlist tracks for offline download…",
          progress: { value: offset, max: spotifyPlaylistTracks.data.totalCount },
        });
        const next = await invoke<SpotifyTrackPage>("spotify_playlist_tracks", {
          playlistId: spotifyOpenPlaylist.id,
          offset,
        });
        if (next.tracks.length === 0) break;
        tracks.push(...next.tracks);
        offset = tracks.length;
      }
      setSpotifyPlaylistTracks({ status: "ready", data: { ...spotifyPlaylistTracks.data, tracks } });
    } catch (error) {
      setNotice({
        kind: "error",
        key: progressKey,
        message: `Spotify playlist pages could not be loaded: ${errorMessage(error)}`,
      });
      return;
    }
    let matched = 0;
    for (const track of tracks) {
      setNotice({
        kind: "progress",
        key: progressKey,
        message: `Matching Spotify playlist “${spotifyOpenPlaylist.name}” for offline download…`,
        progress: { value: matched++, max: tracks.length },
      });
      try {
        const item = await findYouTubeMatchForSpotifyTrack(track);
        if (!item?.videoId) {
          skipped++;
          continue;
        }
        await invoke("download_start", { item, audioQuality });
        queued++;
      } catch {
        skipped++;
      }
    }
    setNotice({
      kind: skipped ? "warning" : "success",
      key: progressKey,
      message: `Spotify playlist download queued: ${queued} track${queued === 1 ? "" : "s"}${skipped ? `; ${skipped} unmatched` : ""}.`,
    });
  };

  const openSpotifyLiked = () => {
    setSpotifyLikedOpen(true);
    if (spotifyLikedTracks.status === "idle") void loadSpotifyLikedTracks();
  };

  const beginSpotifyAdd = async (item: YtItem) => {
    if (!spotifyStatus.authenticated || !item.videoId) {
      setNotice("Spotify playlist actions require a connected Spotify account and a source video.");
      return;
    }
    setMenuItem(null);
    setSpotifyAddItem(item);
    setSpotifyAddState({ status: "loading", data: { match: null, playlists: [] } });
    try {
      const artist = item.artists.map((value) => value.name).join(", ") || item.subtitle || "";
      const match = await invoke<SpotifyTrackMatch | null>("spotify_resolve_youtube", {
        youtubeId: item.videoId,
        title: item.title,
        artist,
        durationSec: item.duration ?? -1,
      });
      if (!match) {
        setSpotifyAddState({
          status: "error",
          data: { match: null, playlists: [] },
          error: "This YouTube song could not be matched to a Spotify track.",
        });
        return;
      }
      const playlists = await invoke<SpotifyPlaylistItem[]>("spotify_playlists");
      setSpotifyAddState({ status: "ready", data: { match, playlists } });
    } catch (error) {
      setSpotifyAddState({ status: "error", data: { match: null, playlists: [] }, error: errorMessage(error) });
    }
  };

  const addToSpotifyPlaylist = async (playlist: SpotifyPlaylistItem) => {
    const match = spotifyAddState?.status === "ready" ? spotifyAddState.data.match : null;
    if (!match) return;
    try {
      await invoke("spotify_add_to_playlist", { playlistId: playlist.id, trackUri: match.uri });
      setSpotifyAddItem(null);
      setSpotifyAddState(null);
      setNotice(`Added “${match.name}” to Spotify playlist “${playlist.name}”.`, "success");
    } catch (error) {
      setNotice(`Spotify playlist add failed: ${errorMessage(error)}`, "error");
    }
  };

  return {
    spotifyLibrary,
    spotifyFolderStack,
    setSpotifyFolderStack,
    spotifyPlaylistTracks,
    spotifyLikedTracks,
    spotifyOpenPlaylist,
    setSpotifyOpenPlaylist,
    spotifyRenameName,
    setSpotifyRenameName,
    spotifyPlaylistLoadingMore,
    spotifyDetailQuery,
    setSpotifyDetailQuery,
    spotifyDetailSort,
    setSpotifyDetailSort,
    spotifyDetailSortDescending,
    setSpotifyDetailSortDescending,
    spotifyReorderUnlocked,
    setSpotifyReorderUnlocked,
    spotifyLikedOpen,
    setSpotifyLikedOpen,
    spotifyAddItem,
    setSpotifyAddItem,
    spotifyAddState,
    setSpotifyAddState,
    loadSpotifyProfile,
    loadSpotifyLibrary,
    loadSpotifyLikedTracks,
    openSpotifyFolder,
    openSpotifyPlaylist,
    visibleSpotifyPlaylistTracks,
    moveSpotifyTrack,
    loadMoreSpotifyPlaylistTracks,
    renameSpotifyPlaylist,
    removeSpotifyTrack,
    findYouTubeMatchForSpotifyTrack,
    downloadSpotifyPlaylist,
    openSpotifyLiked,
    beginSpotifyAdd,
    addToSpotifyPlaylist,
  };
}
