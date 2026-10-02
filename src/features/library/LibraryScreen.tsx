import { Dispatch, SetStateAction } from "react";
import { InlineLikeButton } from "../../components/InlineLikeButton";
import { ItemCard } from "../../components/ItemCard";
import { SpotifyLibraryBlock } from "../../components/SpotifyLibraryBlock";
import { AudioQuality } from "../../lib/audioQuality";
import {
  LibrarySongFilter,
  YtItem,
  LoadState,
  LibrarySort,
  SpotifyFolderItem,
  SpotifyPlaylistItem,
  PlaylistSort,
  SpotifyLibraryNode,
  SpotifyLikedTracksPayload,
  SpotifySessionStatus,
} from "../../types";
import { withOccurrences } from "../../lib/identity";

export type LibraryScreenProps = {
  audioQuality: AudioQuality;
  chooseLibrarySongFilter: (filter: LibrarySongFilter) => void;
  closeSelection: () => void;
  filteredLibraryData: YtItem[];
  hasVisiblePlaylistAutoEntries: boolean;
  importLocalFiles: () => Promise<void>;
  library: LoadState<YtItem[]>;
  libraryMixSort: "created" | "name";
  libraryMixSortDescending: boolean;
  libraryMode:
    | "liked"
    | "uploaded"
    | "top"
    | "mix"
    | "local"
    | "songs"
    | "downloads"
    | "cache"
    | "playlists"
    | "albums"
    | "artists"
    | "podcasts";
  librarySearch: string;
  librarySongFilter: LibrarySongFilter;
  librarySort: LibrarySort;
  librarySortDescending: boolean;
  librarySyncing: boolean;
  libraryView: "grid" | "list";
  loadSpotifyLibrary: (folderUri?: string | null) => Promise<void>;
  matchesLibraryQuery: (title: string) => boolean;
  openCreatePlaylistDialog: () => void;
  openItem: (item: YtItem, sourceQueue?: YtItem[], sourceIndex?: number) => Promise<void>;
  openLocalPlaylist: (item: YtItem) => Promise<void>;
  openLyrics: (item: YtItem) => Promise<void>;
  openMenu: (item: YtItem) => Promise<void>;
  openSpotifyFolder: (folder: SpotifyFolderItem) => Promise<void>;
  openSpotifyLiked: () => void;
  openSpotifyPlaylist: (playlistItem: SpotifyPlaylistItem) => Promise<void>;
  playlistQuery: string;
  playlistSearch: string;
  playlistSort: PlaylistSort;
  playlistSortDescending: boolean;
  playlistView: "grid" | "list";
  podcastFilter: "downloaded" | "episodes" | "channels";
  podcastRefreshing: boolean;
  refreshSavedPodcasts: () => Promise<void>;
  reloadCurrentLibrary: () => Promise<void>;
  /** Whether the row with this occurrence key is selected (U4-015). */
  isSelected: (key: string) => boolean;
  selectedItems: YtItem[];
  selectionMode: boolean;
  setLibraryMixSort: Dispatch<SetStateAction<"created" | "name">>;
  setLibraryMixSortDescending: Dispatch<SetStateAction<boolean>>;
  setLibraryMode: Dispatch<
    SetStateAction<
      | "liked"
      | "uploaded"
      | "top"
      | "mix"
      | "local"
      | "songs"
      | "downloads"
      | "cache"
      | "playlists"
      | "albums"
      | "artists"
      | "podcasts"
    >
  >;
  setLibrarySearch: Dispatch<SetStateAction<string>>;
  setLibrarySort: Dispatch<SetStateAction<LibrarySort>>;
  setLibrarySortDescending: Dispatch<SetStateAction<boolean>>;
  setLibraryView: Dispatch<SetStateAction<"grid" | "list">>;
  setPlaylistSearch: Dispatch<SetStateAction<string>>;
  setPlaylistSort: Dispatch<SetStateAction<PlaylistSort>>;
  setPlaylistSortDescending: Dispatch<SetStateAction<boolean>>;
  setPlaylistView: Dispatch<SetStateAction<"grid" | "list">>;
  setPodcastFilter: Dispatch<SetStateAction<"downloaded" | "episodes" | "channels">>;
  setSelectionMode: Dispatch<SetStateAction<boolean>>;
  setSpotifyFolderStack: Dispatch<SetStateAction<{ uri: string; name: string }[]>>;
  settings: Record<string, boolean>;
  setTopPeriod: Dispatch<SetStateAction<"all" | "day" | "week" | "month" | "year">>;
  shuffleLibrary: () => Promise<void>;
  spotifyFolderStack: { uri: string; name: string }[];
  spotifyLibrary: LoadState<SpotifyLibraryNode>;
  spotifyLikedTracks: LoadState<SpotifyLikedTracksPayload>;
  spotifyStatus: SpotifySessionStatus;
  toggleSelectedItem: (item: YtItem, key?: string) => void;
  topPeriod: "all" | "day" | "week" | "month" | "year";
  visiblePlaylists: (YtItem & { songCount?: number; savedAt?: number })[];
};

export function LibraryScreen({
  audioQuality,
  chooseLibrarySongFilter,
  closeSelection,
  filteredLibraryData,
  hasVisiblePlaylistAutoEntries,
  importLocalFiles,
  library,
  libraryMixSort,
  libraryMixSortDescending,
  libraryMode,
  librarySearch,
  librarySongFilter,
  librarySort,
  librarySortDescending,
  librarySyncing,
  libraryView,
  loadSpotifyLibrary,
  matchesLibraryQuery,
  openCreatePlaylistDialog,
  openItem,
  openLocalPlaylist,
  openLyrics,
  openMenu,
  openSpotifyFolder,
  openSpotifyLiked,
  openSpotifyPlaylist,
  playlistQuery,
  playlistSearch,
  playlistSort,
  playlistSortDescending,
  playlistView,
  podcastFilter,
  podcastRefreshing,
  refreshSavedPodcasts,
  reloadCurrentLibrary,
  isSelected,
  selectedItems,
  selectionMode,
  setLibraryMixSort,
  setLibraryMixSortDescending,
  setLibraryMode,
  setLibrarySearch,
  setLibrarySort,
  setLibrarySortDescending,
  setLibraryView,
  setPlaylistSearch,
  setPlaylistSort,
  setPlaylistSortDescending,
  setPlaylistView,
  setPodcastFilter,
  setSelectionMode,
  setSpotifyFolderStack,
  settings,
  setTopPeriod,
  shuffleLibrary,
  spotifyFolderStack,
  spotifyLibrary,
  spotifyLikedTracks,
  spotifyStatus,
  toggleSelectedItem,
  topPeriod,
  visiblePlaylists,
}: LibraryScreenProps) {
  return (
    <>
      {
        <div className="library-page">
          <div className="search-intro">
            <p className="eyebrow">On-device storage</p>
            <h2>
              {libraryMode === "mix"
                ? "Library"
                : libraryMode === "cache"
                  ? "Cache"
                  : ["songs", "liked", "uploaded", "downloads", "top"].includes(libraryMode)
                    ? libraryMode === "top"
                      ? "Top Songs"
                      : "Songs"
                    : libraryMode === "playlists"
                      ? "Playlists"
                      : libraryMode === "albums"
                        ? "Albums"
                        : libraryMode === "artists"
                          ? "Artists"
                          : libraryMode === "podcasts"
                            ? "Podcasts"
                            : "Local Files"}
            </h2>
            <p>
              {libraryMode === "top"
                ? `Most-played songs from Meld history (${topPeriod === "all" ? "all time" : topPeriod}).`
                : libraryMode === "cache"
                  ? "Songs cached during Meld playback, separate from explicit offline downloads."
                  : ["songs", "liked", "uploaded", "downloads"].includes(libraryMode)
                    ? "Songs are filtered by Liked, Library, Uploaded, or Downloaded exactly like Meld’s Songs screen."
                    : libraryMode === "playlists"
                      ? "Local playlists and YouTube Music playlists saved by the connected account."
                      : libraryMode === "albums"
                        ? "Albums represented by saved songs and their live source metadata."
                        : libraryMode === "artists"
                          ? "Artists represented by saved songs and their live source metadata."
                          : libraryMode === "podcasts"
                            ? "Podcast episodes and channels from your authenticated YouTube Music library."
                            : "Items saved to the native SQLite library on this device."}
            </p>
            {!["songs", "liked", "uploaded", "downloads", "top", "podcasts"].includes(libraryMode) && (
              <div className="library-tabs" role="tablist" aria-label="Library filter">
                <button
                  className={libraryMode === "mix" ? "library-tab active" : "library-tab"}
                  aria-selected={libraryMode === "mix"}
                  onClick={() => setLibraryMode("mix")}
                >
                  Library
                </button>
                <button
                  className={libraryMode === "playlists" ? "library-tab active" : "library-tab"}
                  onClick={() => setLibraryMode(libraryMode === "playlists" ? "mix" : "playlists")}
                >
                  Playlists
                </button>
                <button
                  className={
                    ["songs", "liked", "uploaded", "downloads", "top"].includes(libraryMode)
                      ? "library-tab active"
                      : "library-tab"
                  }
                  onClick={() =>
                    ["songs", "liked", "uploaded", "downloads", "top"].includes(libraryMode)
                      ? setLibraryMode("mix")
                      : chooseLibrarySongFilter(librarySongFilter)
                  }
                >
                  Songs
                </button>
                <button
                  className={libraryMode === "albums" ? "library-tab active" : "library-tab"}
                  onClick={() => setLibraryMode(libraryMode === "albums" ? "mix" : "albums")}
                >
                  Albums
                </button>
                <button
                  className={libraryMode === "artists" ? "library-tab active" : "library-tab"}
                  onClick={() => setLibraryMode(libraryMode === "artists" ? "mix" : "artists")}
                >
                  Artists
                </button>
                <button
                  className={libraryMode === "podcasts" ? "library-tab active" : "library-tab"}
                  onClick={() => setLibraryMode(libraryMode === "podcasts" ? "mix" : "podcasts")}
                >
                  Podcasts
                </button>
                <button
                  className={libraryMode === "local" ? "library-tab active" : "library-tab"}
                  onClick={() => setLibraryMode(libraryMode === "local" ? "mix" : "local")}
                >
                  Local files
                </button>
                {libraryMode === "local" && (
                  <button className="primary-button local-import-button" onClick={() => void importLocalFiles()}>
                    Import audio files
                  </button>
                )}
                {libraryMode === "playlists" && (
                  <button className="primary-button" onClick={openCreatePlaylistDialog}>
                    Create playlist
                  </button>
                )}
              </div>
            )}
            {libraryMode === "mix" && (
              <div className="library-mix-toolbar">
                <label className="library-search">
                  <span>Search</span>
                  <input
                    value={librarySearch}
                    onChange={(event) => setLibrarySearch(event.target.value)}
                    placeholder="Search your library"
                    aria-label="Search your library"
                  />
                </label>
                <span className="library-result-count">{filteredLibraryData.length} items</span>
                <select
                  className="library-sort"
                  value={libraryMixSort}
                  onChange={(event) => setLibraryMixSort(event.target.value as "created" | "name")}
                  aria-label="Sort library"
                >
                  <option value="created">Recently added</option>
                  <option value="name">Name</option>
                </select>
                <button
                  className="secondary-button"
                  onClick={() => setLibraryMixSortDescending((value) => !value)}
                  title="Reverse sort order"
                >
                  {libraryMixSortDescending ? "Descending" : "Ascending"}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => setLibraryView((value) => (value === "grid" ? "list" : "grid"))}
                  title={libraryView === "grid" ? "Switch to list view" : "Switch to grid view"}
                  aria-label={libraryView === "grid" ? "Switch to list view" : "Switch to grid view"}
                >
                  {libraryView === "grid" ? "List" : "Grid"}
                </button>
              </div>
            )}
            {["songs", "liked", "uploaded", "downloads"].includes(libraryMode) && (
              <div className="library-song-toolbar">
                <button
                  className="library-tab active library-root-chip"
                  onClick={() => setLibraryMode("mix")}
                  title="Return to Library"
                  aria-label="Return to Library"
                >
                  Songs ×
                </button>
                <div className="library-filter-chips" role="tablist" aria-label="Song filter">
                  <button
                    className={librarySongFilter === "liked" ? "library-tab active" : "library-tab"}
                    onClick={() => chooseLibrarySongFilter("liked")}
                  >
                    Liked
                  </button>
                  <button
                    className={librarySongFilter === "library" ? "library-tab active" : "library-tab"}
                    onClick={() => chooseLibrarySongFilter("library")}
                  >
                    Library
                  </button>
                  <button
                    className={librarySongFilter === "uploaded" ? "library-tab active" : "library-tab"}
                    onClick={() => chooseLibrarySongFilter("uploaded")}
                  >
                    Uploaded
                  </button>
                  <button
                    className={librarySongFilter === "downloaded" ? "library-tab active" : "library-tab"}
                    onClick={() => chooseLibrarySongFilter("downloaded")}
                  >
                    Downloaded
                  </button>
                </div>
                <label className="library-search">
                  <span>Search</span>
                  <input
                    value={librarySearch}
                    onChange={(event) => setLibrarySearch(event.target.value)}
                    placeholder="Search your songs"
                    aria-label="Search library songs"
                  />
                </label>
                <select
                  className="library-sort"
                  value={librarySort}
                  onChange={(event) => setLibrarySort(event.target.value as LibrarySort)}
                  aria-label="Sort library songs"
                >
                  <option value="created">Recently added</option>
                  <option value="name">Name</option>
                  <option value="artist">Artist</option>
                  <option value="playtime">Play time</option>
                </select>
                <button
                  className="secondary-button"
                  onClick={() => setLibrarySortDescending((value) => !value)}
                  title="Reverse sort order"
                >
                  {librarySortDescending ? "Descending" : "Ascending"}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => (selectionMode ? closeSelection() : setSelectionMode(true))}
                >
                  {selectionMode ? `Done${selectedItems.length > 0 ? ` · ${selectedItems.length}` : ""}` : "Select"}
                </button>
                {filteredLibraryData.length > 0 && (
                  <button
                    className="primary-button"
                    onClick={() => void shuffleLibrary()}
                    title="Shuffle all visible songs"
                  >
                    Shuffle
                  </button>
                )}
              </div>
            )}
            {libraryMode === "top" && (
              <div className="library-song-toolbar">
                <button
                  className="library-tab active library-root-chip"
                  onClick={() => setLibraryMode("mix")}
                  title="Return to Library"
                  aria-label="Return to Library"
                >
                  Top Songs ×
                </button>
                <div className="library-filter-chips" role="tablist" aria-label="Top songs period">
                  <button
                    className={topPeriod === "all" ? "library-tab active" : "library-tab"}
                    onClick={() => setTopPeriod("all")}
                  >
                    All time
                  </button>
                  <button
                    className={topPeriod === "day" ? "library-tab active" : "library-tab"}
                    onClick={() => setTopPeriod("day")}
                  >
                    24 hours
                  </button>
                  <button
                    className={topPeriod === "week" ? "library-tab active" : "library-tab"}
                    onClick={() => setTopPeriod("week")}
                  >
                    Week
                  </button>
                  <button
                    className={topPeriod === "month" ? "library-tab active" : "library-tab"}
                    onClick={() => setTopPeriod("month")}
                  >
                    Month
                  </button>
                  <button
                    className={topPeriod === "year" ? "library-tab active" : "library-tab"}
                    onClick={() => setTopPeriod("year")}
                  >
                    Year
                  </button>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => (selectionMode ? closeSelection() : setSelectionMode(true))}
                >
                  {selectionMode ? `Done${selectedItems.length > 0 ? ` · ${selectedItems.length}` : ""}` : "Select"}
                </button>
                {filteredLibraryData.length > 0 && (
                  <button className="primary-button" onClick={() => void shuffleLibrary()}>
                    Shuffle
                  </button>
                )}
              </div>
            )}
            {libraryMode === "podcasts" && (
              <div className="library-tabs podcast-filter-tabs">
                <button
                  className="library-tab active library-root-chip"
                  onClick={() => setLibraryMode("mix")}
                  title="Return to Library"
                  aria-label="Return to Library"
                >
                  Podcasts ×
                </button>
                <button
                  className={podcastFilter === "episodes" ? "library-tab active" : "library-tab"}
                  onClick={() => setPodcastFilter("episodes")}
                >
                  Episodes
                </button>
                <button
                  className={podcastFilter === "channels" ? "library-tab active" : "library-tab"}
                  onClick={() => setPodcastFilter("channels")}
                >
                  Channels
                </button>
                <button
                  className={podcastFilter === "downloaded" ? "library-tab active" : "library-tab"}
                  onClick={() => setPodcastFilter("downloaded")}
                >
                  Downloaded
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void refreshSavedPodcasts()}
                  disabled={podcastRefreshing}
                >
                  {podcastRefreshing ? "Refreshing…" : "Refresh saved"}
                </button>
              </div>
            )}
            {libraryMode === "podcasts" && podcastFilter === "episodes" && (
              <div className="podcast-auto-playlists">
                <button
                  className="playlist-list-row auto-podcast-row"
                  onClick={() =>
                    void openItem({
                      id: "RDPN",
                      kind: "playlist",
                      title: "New Episodes",
                      subtitle: "Auto playlist",
                      artists: [],
                      browseId: "RDPN",
                      playlistId: "RDPN",
                    })
                  }
                >
                  <span className="library-auto-icon">◷</span>
                  <span>
                    <strong>New Episodes</strong>
                    <small>Recently added podcast episodes</small>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
                <button
                  className="playlist-list-row auto-podcast-row"
                  onClick={() =>
                    void openItem({
                      id: "SE",
                      kind: "playlist",
                      title: "Episodes for Later",
                      subtitle: "Auto playlist",
                      artists: [],
                      browseId: "SE",
                      playlistId: "SE",
                    })
                  }
                >
                  <span className="library-auto-icon">▤</span>
                  <span>
                    <strong>Episodes for Later</strong>
                    <small>Saved podcast episodes</small>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              </div>
            )}
          </div>
          {libraryMode === "cache" && (
            <div className="library-song-toolbar">
              <button
                className="library-tab active library-root-chip"
                onClick={() => setLibraryMode("mix")}
                title="Return to Library"
                aria-label="Return to Library"
              >
                Cache ×
              </button>
              <label className="library-search">
                <span>Search</span>
                <input
                  value={librarySearch}
                  onChange={(event) => setLibrarySearch(event.target.value)}
                  placeholder="Search cached songs"
                  aria-label="Search cached songs"
                />
              </label>
              <select
                className="library-sort"
                value={librarySort}
                onChange={(event) => setLibrarySort(event.target.value as LibrarySort)}
                aria-label="Sort cached songs"
              >
                <option value="created">Recently cached</option>
                <option value="name">Name</option>
                <option value="artist">Artist</option>
                <option value="playtime">Play time</option>
              </select>
              <button
                className="secondary-button"
                onClick={() => setLibrarySortDescending((value) => !value)}
                title="Reverse cached songs order"
              >
                {librarySortDescending ? "Descending" : "Ascending"}
              </button>
              {filteredLibraryData.length > 0 && (
                <button className="primary-button" onClick={() => void shuffleLibrary()}>
                  Shuffle
                </button>
              )}
            </div>
          )}
          {libraryMode === "mix" && library.status === "ready" && libraryView === "grid" && (
            <div className="library-mix-grid">
              {settings.show_cached_playlist !== false && matchesLibraryQuery("Cached") && (
                <button className="playlist-tile auto-playlist-tile" onClick={() => setLibraryMode("cache")}>
                  <div className="item-art-wrap">
                    <div className="item-art empty-art">◌</div>
                  </div>
                  <strong>Cached</strong>
                  <span>Songs cached during playback</span>
                </button>
              )}
              {settings.show_liked_playlist !== false && matchesLibraryQuery("Liked Songs") && (
                <button className="playlist-tile auto-playlist-tile" onClick={() => chooseLibrarySongFilter("liked")}>
                  <div className="item-art-wrap">
                    <div className="item-art empty-art">♥</div>
                  </div>
                  <strong>Liked Songs</strong>
                  <span>Meld’s single liked-songs playlist</span>
                </button>
              )}
              {settings.show_downloaded_playlist !== false && matchesLibraryQuery("Downloaded") && (
                <button
                  className="playlist-tile auto-playlist-tile"
                  onClick={() => chooseLibrarySongFilter("downloaded")}
                >
                  <div className="item-art-wrap">
                    <div className="item-art empty-art">↓</div>
                  </div>
                  <strong>Downloaded</strong>
                  <span>Downloaded songs</span>
                </button>
              )}
              {settings.show_top_playlist !== false && matchesLibraryQuery("Top Songs") && (
                <button className="playlist-tile auto-playlist-tile" onClick={() => chooseLibrarySongFilter("top")}>
                  <div className="item-art-wrap">
                    <div className="item-art empty-art">★</div>
                  </div>
                  <strong>Top Songs</strong>
                  <span>Most played in Meld</span>
                </button>
              )}
              {settings.show_uploaded_playlist !== false && matchesLibraryQuery("Uploaded") && (
                <button
                  className="playlist-tile auto-playlist-tile"
                  onClick={() => chooseLibrarySongFilter("uploaded")}
                >
                  <div className="item-art-wrap">
                    <div className="item-art empty-art">↑</div>
                  </div>
                  <strong>Uploaded</strong>
                  <span>YouTube Music uploads</span>
                </button>
              )}
              {withOccurrences(filteredLibraryData, "library-mix").map(({ item, key }) => (
                <div className="library-mix-card" key={key}>
                  <ItemCard item={item} onOpen={openItem} onMenu={(value) => void openMenu(value)} />
                  <span className="library-mix-kind">{item.kind}</span>
                </div>
              ))}
            </div>
          )}
          {libraryMode === "mix" && library.status === "ready" && libraryView === "list" && (
            <div className="result-list library-mix-list">
              {settings.show_cached_playlist !== false && matchesLibraryQuery("Cached") && (
                <button className="library-auto-row" onClick={() => setLibraryMode("cache")}>
                  <span className="library-auto-icon">◌</span>
                  <span>
                    <strong>Cached</strong>
                    <small>Songs cached during playback</small>
                  </span>
                </button>
              )}
              {settings.show_liked_playlist !== false && matchesLibraryQuery("Liked Songs") && (
                <button className="library-auto-row" onClick={() => chooseLibrarySongFilter("liked")}>
                  <span className="library-auto-icon">♥</span>
                  <span>
                    <strong>Liked Songs</strong>
                    <small>Meld’s single liked-songs playlist</small>
                  </span>
                </button>
              )}
              {settings.show_downloaded_playlist !== false && matchesLibraryQuery("Downloaded") && (
                <button className="library-auto-row" onClick={() => chooseLibrarySongFilter("downloaded")}>
                  <span className="library-auto-icon">↓</span>
                  <span>
                    <strong>Downloaded</strong>
                    <small>Downloaded songs for offline listening</small>
                  </span>
                </button>
              )}
              {settings.show_top_playlist !== false && matchesLibraryQuery("Top Songs") && (
                <button className="library-auto-row" onClick={() => chooseLibrarySongFilter("top")}>
                  <span className="library-auto-icon">★</span>
                  <span>
                    <strong>Top Songs</strong>
                    <small>Most played in Meld history</small>
                  </span>
                </button>
              )}
              {settings.show_uploaded_playlist !== false && matchesLibraryQuery("Uploaded") && (
                <button className="library-auto-row" onClick={() => chooseLibrarySongFilter("uploaded")}>
                  <span className="library-auto-icon">↑</span>
                  <span>
                    <strong>Uploaded</strong>
                    <small>YouTube Music uploads</small>
                  </span>
                </button>
              )}
              {withOccurrences(filteredLibraryData, "library-mix-list").map(({ item, key }) => (
                <div className="result-row" key={key}>
                  <ItemCard item={item} onOpen={openItem} />
                  {item.kind === "song" && (
                    <InlineLikeButton
                      item={item}
                      autoDownloadOnLike={settings.autoDownloadOnLike === true}
                      audioQuality={audioQuality}
                    />
                  )}
                  <div className="row-actions">
                    <button className="row-action" onClick={() => void openItem(item)}>
                      {item.kind === "song" ? "Play in Meld" : "Open"}
                    </button>
                    <button
                      className="row-action menu-trigger"
                      onClick={() => void openMenu(item)}
                      title={`More options for ${item.title}`}
                      aria-label={`More options for ${item.title}`}
                    >
                      ⋮
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {libraryMode === "mix" &&
            library.status === "ready" &&
            librarySearch.trim() &&
            filteredLibraryData.length === 0 &&
            !(
              (settings.show_cached_playlist !== false && matchesLibraryQuery("Cached")) ||
              (settings.show_liked_playlist !== false && matchesLibraryQuery("Liked Songs")) ||
              (settings.show_downloaded_playlist !== false && matchesLibraryQuery("Downloaded")) ||
              (settings.show_top_playlist !== false && matchesLibraryQuery("Top Songs")) ||
              (settings.show_uploaded_playlist !== false && matchesLibraryQuery("Uploaded"))
            ) && (
              <div className="state-panel">
                <h2>No matching library items</h2>
                <p>Try a different search or clear the filter.</p>
              </div>
            )}
          {libraryMode === "playlists" ? (
            <>
              <div className="library-playlists-toolbar">
                <label className="library-search">
                  <span>Search</span>
                  <input
                    value={playlistSearch}
                    onChange={(event) => setPlaylistSearch(event.target.value)}
                    placeholder="Search playlists"
                    aria-label="Search playlists"
                  />
                </label>
                <span className="library-result-count">{visiblePlaylists.length} playlists</span>
                <select
                  className="library-sort"
                  value={playlistSort}
                  onChange={(event) => setPlaylistSort(event.target.value as PlaylistSort)}
                  aria-label="Sort playlists"
                >
                  <option value="created">Recently added</option>
                  <option value="name">Name</option>
                  <option value="count">Song count</option>
                </select>
                <button
                  className="secondary-button"
                  onClick={() => setPlaylistSortDescending((value) => !value)}
                  title="Reverse playlist sort order"
                >
                  {playlistSortDescending ? "Descending" : "Ascending"}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => setPlaylistView((value) => (value === "grid" ? "list" : "grid"))}
                  title={playlistView === "grid" ? "Switch to list view" : "Switch to grid view"}
                  aria-label={playlistView === "grid" ? "Switch to list view" : "Switch to grid view"}
                >
                  {playlistView === "grid" ? "List" : "Grid"}
                </button>
              </div>
              <div className={playlistView === "grid" ? "playlist-grid" : "library-playlists-list"}>
                {settings.show_cached_playlist !== false && matchesLibraryQuery("Cached") && (
                  <button className="playlist-tile auto-playlist-tile" onClick={() => setLibraryMode("cache")}>
                    <div className="item-art-wrap">
                      <div className="item-art empty-art">◌</div>
                    </div>
                    <strong>Cached</strong>
                    <span>Songs cached during playback</span>
                  </button>
                )}
                {settings.show_liked_playlist !== false && matchesLibraryQuery("Liked Songs") && (
                  <button className="playlist-tile auto-playlist-tile" onClick={() => chooseLibrarySongFilter("liked")}>
                    <div className="item-art-wrap">
                      <div className="item-art empty-art">♥</div>
                    </div>
                    <strong>Liked Songs</strong>
                    <span>Meld’s single liked-songs playlist</span>
                  </button>
                )}
                {settings.show_downloaded_playlist !== false && matchesLibraryQuery("Downloaded") && (
                  <button
                    className="playlist-tile auto-playlist-tile"
                    onClick={() => chooseLibrarySongFilter("downloaded")}
                  >
                    <div className="item-art-wrap">
                      <div className="item-art empty-art">↓</div>
                    </div>
                    <strong>Downloaded</strong>
                    <span>Downloaded songs for offline listening</span>
                  </button>
                )}
                {settings.show_top_playlist !== false && matchesLibraryQuery("Top Songs") && (
                  <button className="playlist-tile auto-playlist-tile" onClick={() => chooseLibrarySongFilter("top")}>
                    <div className="item-art-wrap">
                      <div className="item-art empty-art">★</div>
                    </div>
                    <strong>Top Songs</strong>
                    <span>Most played songs from Meld history</span>
                  </button>
                )}
                {settings.show_uploaded_playlist !== false && matchesLibraryQuery("Uploaded") && (
                  <button
                    className="playlist-tile auto-playlist-tile"
                    onClick={() => chooseLibrarySongFilter("uploaded")}
                  >
                    <div className="item-art-wrap">
                      <div className="item-art empty-art">↑</div>
                    </div>
                    <strong>Uploaded</strong>
                    <span>YouTube Music uploaded songs</span>
                  </button>
                )}
                {visiblePlaylists.length === 0 && !hasVisiblePlaylistAutoEntries ? (
                  <div className="state-panel">
                    <h2>{playlistQuery ? "No matching playlists" : "No playlists"}</h2>
                    <p>
                      {playlistQuery
                        ? "Try a different search or clear the filter."
                        : "Create a playlist, then use Add to playlist from a song’s three-dot menu."}
                    </p>
                  </div>
                ) : (
                  visiblePlaylists.map((item) => (
                    <button
                      className={playlistView === "grid" ? "playlist-tile" : "playlist-list-row"}
                      key={item.id}
                      onClick={() => void openLocalPlaylist(item)}
                    >
                      <div className="item-art-wrap">
                        <div className="item-art empty-art">P</div>
                      </div>
                      <strong>{item.title}</strong>
                      <span>
                        {item.songCount === undefined
                          ? item.subtitle
                          : `${item.songCount} song${item.songCount === 1 ? "" : "s"}${item.subtitle ? ` · ${item.subtitle}` : ""}`}
                      </span>
                    </button>
                  ))
                )}
              </div>
              {spotifyStatus.authenticated && (
                <SpotifyLibraryBlock
                  node={spotifyLibrary}
                  liked={spotifyLikedTracks}
                  folderStack={spotifyFolderStack}
                  onOpenFolder={(folder) => void openSpotifyFolder(folder)}
                  onOpenPlaylist={(spotifyPlaylist) => void openSpotifyPlaylist(spotifyPlaylist)}
                  onOpenLiked={openSpotifyLiked}
                  onBack={() => {
                    const next = spotifyFolderStack.slice(0, -1);
                    setSpotifyFolderStack(next);
                    void loadSpotifyLibrary(next[next.length - 1]?.uri ?? null);
                  }}
                  onRetry={() =>
                    void loadSpotifyLibrary(spotifyFolderStack[spotifyFolderStack.length - 1]?.uri ?? null)
                  }
                />
              )}
            </>
          ) : (
            library.status === "loading" && (
              <div className="state-panel">
                <div className="spinner" />
                <p>Loading your library…</p>
              </div>
            )
          )}
          {library.status === "error" && (
            <div className="state-panel error">
              <h2>Library unavailable</h2>
              <p>{library.error}</p>
              <button className="primary-button" onClick={() => void reloadCurrentLibrary()}>
                Retry
              </button>
            </div>
          )}
          {librarySyncing && (
            <div className="state-panel">
              <div className="spinner" />
              <p>
                Syncing YouTube Music{" "}
                {libraryMode === "liked"
                  ? "liked songs"
                  : libraryMode === "uploaded"
                    ? "uploaded songs"
                    : "library songs"}
                …
              </p>
            </div>
          )}
          {!librarySyncing &&
            !(["mix", "playlists", "albums", "artists", "podcasts"] as string[]).includes(libraryMode) &&
            library.status === "ready" &&
            library.data.length === 0 && (
              <div className="state-panel">
                <h2>
                  {libraryMode === "local"
                    ? "No local audio files imported"
                    : libraryMode === "liked"
                      ? "No liked songs cached"
                      : libraryMode === "songs"
                        ? "No library songs cached"
                        : libraryMode === "uploaded"
                          ? "No uploaded songs cached"
                          : libraryMode === "top"
                            ? "No listening history yet"
                            : "No offline downloads"}
                </h2>
                <p>
                  {libraryMode === "local"
                    ? "Use Import audio files to choose real files from this Windows device."
                    : libraryMode === "downloads"
                      ? "Use Download for offline listening from a remote song’s More actions menu."
                      : "Use a real typed item and its connected action to populate this view."}
                </p>
              </div>
            )}
          {!librarySyncing &&
            !(["mix", "playlists", "albums", "artists", "podcasts"] as string[]).includes(libraryMode) &&
            library.status === "ready" &&
            library.data.length > 0 &&
            filteredLibraryData.length === 0 && (
              <div className="state-panel">
                <h2>No matching songs</h2>
                <p>Try a different search or filter.</p>
              </div>
            )}
          {!librarySyncing &&
            !(["mix", "playlists", "albums", "artists", "podcasts"] as string[]).includes(libraryMode) &&
            library.status === "ready" &&
            filteredLibraryData.length > 0 && (
              <div className="result-list">
                {withOccurrences(filteredLibraryData, `library:${libraryMode}`).map(({ item, key }) => (
                  <div className="result-row" key={key}>
                    {selectionMode && (
                      <input
                        className="selection-checkbox"
                        type="checkbox"
                        checked={isSelected(key)}
                        onChange={() => toggleSelectedItem(item, key)}
                        aria-label={`Select ${item.title}`}
                      />
                    )}
                    <ItemCard item={item} onOpen={openItem} />
                    {item.kind === "song" && (
                      <InlineLikeButton
                        item={item}
                        autoDownloadOnLike={settings.autoDownloadOnLike === true}
                        audioQuality={audioQuality}
                      />
                    )}
                    <div className="row-actions">
                      <button className="row-action" onClick={() => void openItem(item)}>
                        {item.kind === "song" ? "Play in Meld" : "Open"}
                      </button>
                      {item.kind === "song" && (
                        <button className="row-action" onClick={() => void openLyrics(item)}>
                          Lyrics
                        </button>
                      )}
                      <button
                        className="row-action menu-trigger"
                        onClick={() => void openMenu(item)}
                        title={`More options for ${item.title}`}
                      >
                        ⋮
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          {!librarySyncing && (libraryMode === "albums" || libraryMode === "artists") && library.status === "ready" && (
            <div className="result-list catalog-list">
              {library.data.length === 0 ? (
                <div className="state-panel">
                  <h2>No {libraryMode} in your library</h2>
                  <p>Save songs with source album or artist metadata to populate this view.</p>
                </div>
              ) : (
                library.data.map((item) => (
                  <div className="result-row catalog-row" key={`${item.kind}-${item.id}`}>
                    <ItemCard item={item} onOpen={openItem} />
                    <div className="row-actions">
                      <button className="row-action" onClick={() => void openItem(item)}>
                        Open {libraryMode === "albums" ? "album" : "artist"}
                      </button>
                      <button
                        className="row-action menu-trigger"
                        onClick={() => void openMenu(item)}
                        title={`More options for ${item.title}`}
                      >
                        ⋮
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {!librarySyncing && libraryMode === "podcasts" && library.status === "ready" && (
            <div className="result-list catalog-list">
              {library.data.length === 0 ? (
                <div className="state-panel">
                  <h2>
                    {podcastFilter === "downloaded"
                      ? "No downloaded podcast episodes"
                      : `No podcast ${podcastFilter} found`}
                  </h2>
                  <p>
                    {podcastFilter === "downloaded"
                      ? "Download a podcast episode from its More actions menu to make it available offline."
                      : "YouTube Music returned no items for this account."}
                  </p>
                </div>
              ) : (
                library.data.map((item) => (
                  <div className="result-row catalog-row" key={`${item.kind}-${item.id}`}>
                    <ItemCard item={item} onOpen={openItem} />
                    <div className="row-actions">
                      <button className="row-action" onClick={() => void openItem(item)}>
                        Open
                      </button>
                      <button
                        className="row-action menu-trigger"
                        onClick={() => void openMenu(item)}
                        title={`More options for ${item.title}`}
                      >
                        ⋮
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      }
    </>
  );
}
