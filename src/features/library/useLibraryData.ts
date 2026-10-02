import { invoke } from "@tauri-apps/api/core";
import type { YtItem } from "../../types";
import type { LibraryMode } from "../../app/routes";
import type { ResourceCache } from "../../data/resourceCache";
import { useResource } from "../../data/useResource";
import { libraryKey, libraryMixSongsKey, type PodcastFilter, type TopPeriod } from "../../data/keys";

const LIBRARY_FALLBACK = { status: "idle" as const, data: [] as YtItem[] };

/** Library modes whose items come from one command. */
export type LibraryItemsMode = Exclude<LibraryMode, "playlists" | "podcasts">;

const COMMANDS: Partial<Record<LibraryItemsMode, string>> = {
  local: "library_local_files",
  songs: "library_songs",
  liked: "library_liked_songs",
  uploaded: "library_uploaded_songs",
  downloads: "library_downloads",
  cache: "library_player_cache",
  albums: "library_albums",
  artists: "library_artists",
};

const PODCAST_COMMANDS: Record<PodcastFilter, string> = {
  episodes: "library_saved_podcasts",
  channels: "ytm_podcast_channels",
  downloaded: "library_downloaded_podcasts",
};

/**
 * Server state of the Library page (U4-008). Each mode (and podcast filter, top-songs period) has its own cache
 * entry, so switching filters back and forth shows the last answer at once while it is refreshed.
 */
export function useLibraryData({
  cache,
  libraryMode,
  podcastFilter,
  topPeriod,
  topSize,
}: {
  cache: ResourceCache;
  libraryMode: LibraryMode;
  podcastFilter: PodcastFilter;
  topPeriod: TopPeriod;
  topSize: number;
}) {
  const [library] = useResource<YtItem[]>(cache, libraryKey(libraryMode, podcastFilter, topPeriod), LIBRARY_FALLBACK);
  const [mixSongs] = useResource<YtItem[]>(cache, libraryMixSongsKey, LIBRARY_FALLBACK);

  const loadLibrary = async (mode: LibraryItemsMode = "mix") => {
    await cache.load(
      libraryKey(mode, podcastFilter, topPeriod),
      async () => {
        if (mode === "mix") {
          const [playlists, songs, albums, artists] = await Promise.all([
            invoke<(YtItem & { songCount?: number; savedAt?: number })[]>("library_playlists"),
            invoke<YtItem[]>("library_mix_songs"),
            invoke<YtItem[]>("library_albums"),
            invoke<YtItem[]>("library_artists"),
          ]);
          cache.set(libraryMixSongsKey, { status: "ready", data: songs });
          return [...playlists, ...albums, ...artists].filter(
            (item, index, values) => values.findIndex((value) => value.id === item.id) === index,
          );
        }
        const command = COMMANDS[mode];
        return command
          ? invoke<YtItem[]>(command)
          : invoke<YtItem[]>("library_top_songs", { period: topPeriod, limit: topSize });
      },
      { scope: "library", empty: [] },
    );
  };

  const loadPodcastItems = async (filter: PodcastFilter) => {
    await cache.load(libraryKey("podcasts", filter, topPeriod), () => invoke<YtItem[]>(PODCAST_COMMANDS[filter]), {
      scope: "library",
      empty: [],
    });
  };

  /** Shows the loading state for `mode` while something else (a sync) runs before the reload. */
  const markLibraryLoading = (mode: LibraryItemsMode) =>
    cache.set<YtItem[]>(libraryKey(mode, podcastFilter, topPeriod), (entry) => ({
      status: "loading",
      data: entry?.data ?? [],
      fetchedAt: entry?.fetchedAt,
    }));

  return { library, libraryMixSongs: mixSongs.data, loadLibrary, loadPodcastItems, markLibraryLoading };
}
