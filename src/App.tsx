import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";
import { parseAudioQuality, streamRequest } from "./lib/audioQuality";
import { appendNewPlayable, removeAt } from "./lib/queue";
import { playbackEffectKey, resumeStartPosition, shouldAutoplay, startOccurrence } from "./lib/playbackSession";
import { restoreQueue, restoreSession } from "./lib/persistentPlayback";
import { errorMessage, noticeSummary, shuffled } from "./lib/util";
import { mediaSrc } from "./lib/media";
import {
  DetailPage,
  HomePage,
  LibraryItemState,
  LibrarySongFilter,
  LibrarySort,
  LoadState,
  NavKey,
  PersistentPlayback,
  PlayerPayload,
  PlaylistContinuationPage,
  PlaylistPage,
  PlaylistSort,
  QueuePage,
  RemoteHistoryPage,
  SearchPage,
  SettingEntry,
  SpotifyTrackItem,
  SpotifyTrackMatch,
  StatsPayload,
  YtItem,
} from "./types";
import { parseYouTubeUrl } from "./lib/urls";
import { navigation } from "./app/navigation";
import { secondaryNavigation } from "./app/navigation";
import { lyricsProviderNames } from "./features/lyrics/providers";
import { HomeScreen } from "./features/home/HomeScreen";
import { LibraryScreen } from "./features/library/LibraryScreen";
import { StatsScreen } from "./features/stats/StatsScreen";
import { HistoryScreen } from "./features/history/HistoryScreen";
import { SearchScreen } from "./features/search/SearchScreen";
import { LyricsPanel } from "./features/lyrics/LyricsPanel";
import { ExpandedPlayer } from "./features/player/ExpandedPlayer";
import { QueuePanel } from "./features/queue/QueuePanel";
import { PlayerBar } from "./features/player/PlayerBar";
import { PlaylistScreen } from "./features/playlist/PlaylistScreen";
import { DetailScreen } from "./features/detail/DetailScreen";
import { SettingsScreen } from "./features/settings/SettingsScreen";
import { SpotifyPlaylistScreen } from "./features/spotify/SpotifyPlaylistScreen";
import { SpotifyLikedScreen } from "./features/spotify/SpotifyLikedScreen";
import { useSelection } from "./features/selection/useSelection";
import { useNotice } from "./features/notifications/useNotice";
import { useSleepTimer } from "./features/player/useSleepTimer";
import { useLyrics } from "./features/lyrics/useLyrics";
import { useLyricsFollow } from "./features/lyrics/useLyrics";
import { useItemMenu } from "./features/menu/useItemMenu";
import { useAccounts } from "./features/accounts/useAccounts";
import { useSpotifyLibrary } from "./features/spotify/useSpotifyLibrary";
import { useSettingsState } from "./features/settings/useSettingsState";
import { usePlaylists } from "./features/playlist/usePlaylists";
import { useQueue } from "./features/queue/useQueue";
import { usePlayer } from "./features/player/usePlayer";
import { useDownloads } from "./features/downloads/useDownloads";
import { EMPTY_HISTORY, HistoryEntry, NavHistory, pushEntry, stepBack, stepForward } from "./app/history";
import {
  HistorySource,
  LibraryMode,
  librarySongFilterFor,
  Route,
  routeFromView,
  routeKey,
  routePath,
  StatsPeriod,
  topLevelOf,
} from "./app/routes";
import { Layer, LayerState, topmostLayer } from "./app/layers";

function App() {
  const { notice, setNotice } = useNotice();
  const {
    settingsOpen,
    setSettingsOpen,
    settingsPage,
    setSettingsPage,
    audioQuality,
    setAudioQuality,
    settings,
    setSettings,
    settingsLoading,
    setSettingsLoading,
    setSetting,
    setAudioQualitySetting,
    hideItem,
  } = useSettingsState({ setNotice });
  const {
    menuDownload,
    showMenuDownload,
    startDownload,
    cancelDownload,
    removeDownload,
    downloadItems,
    removeDownloads,
    maybeAutoDownloadOnLike,
  } = useDownloads({ audioQuality, setNotice, settings });
  const {
    logoutDialogOpen,
    setLogoutDialogOpen,
    sessionStatus,
    setSessionStatus,
    spotifyStatus,
    spotifyProfile,
    setSpotifyProfile,
    loadSessionStatus,
    loadSpotifyStatus,
    connectGoogle,
    connectSpotify,
    logoutSpotify,
    logoutGoogle,
  } = useAccounts({ setNotice });
  const { selectedItems, setSelectedItems, selectionMode, setSelectionMode, toggleSelectedItem, closeSelection } =
    useSelection();
  const [active, setActive] = useState<NavKey>("home");
  const [navHistory, setNavHistory] = useState<NavHistory>(EMPTY_HISTORY);
  const pageScrollRef = useRef<HTMLDivElement>(null);
  // Scroll offset to restore once the page shown by back/forward has rendered (U4-004).
  const pendingScrollRef = useRef<number | null>(null);
  const [home, setHome] = useState<LoadState<HomePage>>({ status: "loading", data: { sections: [] } });
  const [homeMoreLoading, setHomeMoreLoading] = useState(false);
  const [speedDial, setSpeedDial] = useState<YtItem[]>([]);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [search, setSearch] = useState<LoadState<SearchPage>>({
    status: "idle",
    data: { items: [], continuation: null },
  });
  const [searchMoreLoading, setSearchMoreLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const [library, setLibrary] = useState<LoadState<YtItem[]>>({ status: "idle", data: [] });
  const [libraryMixSongs, setLibraryMixSongs] = useState<YtItem[]>([]);
  const [history, setHistory] = useState<LoadState<YtItem[]>>({ status: "idle", data: [] });
  const [historySource, setHistorySource] = useState<HistorySource>("local");
  const [historyQuery, setHistoryQuery] = useState("");
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>("all");
  const [stats, setStats] = useState<LoadState<StatsPayload>>({
    status: "idle",
    data: { period: "all", totalPlays: 0, totalMinutes: 0, uniqueSongs: 0, rows: [], artists: [], albums: [] },
  });
  const [remoteHistory, setRemoteHistory] = useState<LoadState<RemoteHistoryPage>>({
    status: "idle",
    data: { sections: [] },
  });
  const [librarySyncing, setLibrarySyncing] = useState(false);
  const [libraryMode, setLibraryMode] = useState<LibraryMode>("mix");
  const [librarySongFilter, setLibrarySongFilter] = useState<LibrarySongFilter>("liked");
  const [librarySearch, setLibrarySearch] = useState("");
  const [librarySort, setLibrarySort] = useState<LibrarySort>("created");
  const [librarySortDescending, setLibrarySortDescending] = useState(true);
  const [libraryMixSort, setLibraryMixSort] = useState<"created" | "name">("created");
  const [libraryMixSortDescending, setLibraryMixSortDescending] = useState(true);
  const [libraryView, setLibraryView] = useState<"grid" | "list">("grid");
  const {
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
    localPlaylists,
  } = usePlaylists({ sessionStatus, setNotice, setSelectedItems, setSelectionMode, settings });
  const [topPeriod, setTopPeriod] = useState<"all" | "day" | "week" | "month" | "year">("all");
  const topSize = 50;
  const [podcastFilter, setPodcastFilter] = useState<"episodes" | "channels" | "downloaded">("episodes");
  const [podcastRefreshing, setPodcastRefreshing] = useState(false);
  const {
    artistPickerItem,
    setArtistPickerItem,
    editItem,
    setEditItem,
    editTitle,
    setEditTitle,
    editArtist,
    setEditArtist,
    infoItem,
    setInfoItem,
    menuItem,
    setMenuItem,
    playerMenuOpen,
    setPlayerMenuOpen,
    speedDialogOpen,
    setSpeedDialogOpen,
    menuSpotifyMatch,
    setMenuSpotifyMatch,
    youtubeMatchItem,
    setYoutubeMatchItem,
    youtubeMatchUrl,
    setYoutubeMatchUrl,
    youtubeMatchPreview,
    setYoutubeMatchPreview,
    menuState,
    setMenuState,
    playerItemState,
    setPlayerItemState,
    confirmYoutubeVersion,
  } = useItemMenu({ setNotice });
  const [playlist, setPlaylist] = useState<LoadState<PlaylistPage> | null>(null);
  const [detail, setDetail] = useState<LoadState<DetailPage> | null>(null);
  const [detailMoreLoading, setDetailMoreLoading] = useState(false);
  const [detailRefreshing, setDetailRefreshing] = useState(false);
  const [detailArtistSubscribed, setDetailArtistSubscribed] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const {
    lyricsProviderOrder,
    setLyricsProviderOrder,
    lyricsProviderSelection,
    lyricsProviderLoading,
    lyrics,
    setLyrics,
    lyricsAutoScrollEnabled,
    setLyricsAutoScrollEnabled,
    lyricsContainerRef,
    activeLyricRef,
    moveLyricsProvider,
    openLyrics,
    changeLyricsProvider,
  } = useLyrics({ setNotice, settings });
  const {
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
  } = useSpotifyLibrary({ audioQuality, setMenuItem, setNotice, setSpotifyProfile, spotifyStatus });
  const {
    playerExpanded,
    setPlayerExpanded,
    player,
    setPlayer,
    playbackSeconds,
    setPlaybackSeconds,
    durationSeconds,
    setDurationSeconds,
    volume,
    setVolume,
    playbackSpeed,
    setPlaybackSpeed,
    isPlaying,
    setIsPlaying,
    audioRef,
    playRequestIdRef,
    activePlayerIdRef,
    playtimeRef,
    streamResolvedAtRef,
    playbackSessionRef,
    flushPlaytime,
    recordPlaytime,
    recoverStream,
    togglePlayback,
    seekPlayback,
    seekByPlayerGesture,
    adjustVolumeByWheel,
    updateVolume,
    formatTime,
  } = usePlayer({ audioQuality, setNotice, settings });
  const {
    queueOpen,
    setQueueOpen,
    queueItems,
    setQueueItems,
    queueContinuation,
    setQueueContinuation,
    queueContinuationKind,
    setQueueContinuationKind,
    shuffleEnabled,
    setShuffleEnabled,
    repeatMode,
    setRepeatMode,
    queueIndex,
    setQueueIndex,
    autoMixEnabledRef,
    toggleShuffle,
    cycleRepeat,
    arrangeQueueForSettings,
    shuffleQueueAfterCurrent,
    moveQueueItem,
    loadAutomixItems,
  } = useQueue({ setNotice, settings });
  const taskbarPreviousRef = useRef<() => void>(() => undefined);
  const taskbarToggleRef = useRef<() => void>(() => undefined);
  const taskbarNextRef = useRef<() => void>(() => undefined);
  const persistentQueueLoadedRef = useRef(false);
  const persistentQueueSkipWriteRef = useRef(false);
  const persistentSessionLoadedRef = useRef(false);
  const persistentSessionSkipWriteRef = useRef(false);
  const resumePositionRef = useRef<number | null>(null);
  const resumePlayingRef = useRef(false);
  const resumePendingRef = useRef(false);
  const accountAuthStateRef = useRef<boolean | null>(null);
  const lastLibrarySyncRef = useRef<Record<string, number>>({});
  const {
    sleepTimerOpen,
    setSleepTimerOpen,
    sleepTimerMinutes,
    setSleepTimerMinutes,
    sleepTimerDefault,
    setSleepTimerDefault,
    sleepTimerStopAfterCurrent,
    setSleepTimerStopAfterCurrent,
    sleepTimerFadeOut,
    setSleepTimerFadeOut,
    sleepTimerEndOfSong,
    clearSleepTimer,
    startSleepTimer,
  } = useSleepTimer({ audioRef, durationSeconds, playbackSeconds, setMenuItem, setNotice, volume });

  const closeTransientLayers = () => {
    setMenuItem(null);
    setPlayerMenuOpen(false);
    setSpeedDialogOpen(false);
    setSleepTimerOpen(false);
    setLyrics(null);
    setQueueOpen(false);
    setPlayerExpanded(false);
    setDetail(null);
    setPlaylist(null);
    setInfoItem(null);
  };

  /** The page being shown, as a history entry (route, selected tab, scroll offset). */
  const currentEntry = (): HistoryEntry => ({
    route: pageRoute,
    tab: active,
    scrollTop: pageScrollRef.current?.scrollTop ?? 0,
  });

  const pushHistory = () => {
    pendingScrollRef.current = null;
    setNavHistory((current) => pushEntry(current, currentEntry()));
  };

  const navigateTo = (next: NavKey) => {
    if (next === active) {
      closeTransientLayers();
      return;
    }
    pushHistory();
    closeTransientLayers();
    setActive(next);
  };

  const restoreEntry = (entry: HistoryEntry) => {
    pendingScrollRef.current = entry.scrollTop;
    void showRoute(entry.route, entry.tab);
  };

  const navigateBack = () => {
    const step = stepBack(navHistory, currentEntry());
    if (!step) return;
    setNavHistory(step.history);
    restoreEntry(step.entry);
  };

  const navigateForward = () => {
    const step = stepForward(navHistory, currentEntry());
    if (!step) return;
    setNavHistory(step.history);
    restoreEntry(step.entry);
  };

  // Which overlays are open (U4-005). Back and Escape close the topmost one; see src/app/layers.ts for the order.
  const layerState: LayerState = {
    logoutDialog: logoutDialogOpen,
    createPlaylist: createPlaylistOpen,
    playlistPicker: playlistPickerItems !== null,
    artistPicker: artistPickerItem !== null,
    youtubeMatch: youtubeMatchItem !== null,
    spotifyAdd: spotifyAddItem !== null,
    editItem: editItem !== null,
    speedDialog: speedDialogOpen,
    sleepTimer: sleepTimerOpen,
    info: infoItem !== null,
    recap: recapOpen,
    menu: menuItem !== null || playerMenuOpen,
    settings: settingsOpen,
    lyrics: lyrics !== null,
    queue: queueOpen,
    expandedPlayer: playerExpanded,
    playlist: playlist !== null,
    detail: detail !== null,
    spotifyPlaylist: spotifyOpenPlaylist !== null,
    spotifyLiked: spotifyLikedOpen,
  };

  const closeLayer = (layer: Layer) => {
    switch (layer) {
      case "logoutDialog":
        return setLogoutDialogOpen(false);
      case "createPlaylist":
        return setCreatePlaylistOpen(false);
      case "playlistPicker":
        return setPlaylistPickerItems(null);
      case "artistPicker":
        return setArtistPickerItem(null);
      case "youtubeMatch":
        return setYoutubeMatchItem(null);
      case "spotifyAdd":
        return setSpotifyAddItem(null);
      case "editItem":
        return setEditItem(null);
      case "speedDialog":
        return setSpeedDialogOpen(false);
      case "sleepTimer":
        return setSleepTimerOpen(false);
      case "info":
        return setInfoItem(null);
      case "recap":
        return setRecapOpen(false);
      case "menu":
        setMenuItem(null);
        return setPlayerMenuOpen(false);
      case "settings":
        return setSettingsOpen(false);
      case "lyrics":
        return setLyrics(null);
      case "queue":
        return setQueueOpen(false);
      case "expandedPlayer":
        return setPlayerExpanded(false);
      case "playlist":
        return setPlaylist(null);
      case "detail":
        return setDetail(null);
      case "spotifyPlaylist":
        return setSpotifyOpenPlaylist(null);
      case "spotifyLiked":
        return setSpotifyLikedOpen(false);
    }
  };

  /** Closes the topmost layer; returns false when nothing was open. */
  const closeTopmostLayer = () => {
    const top = topmostLayer(layerState);
    if (!top) return false;
    closeLayer(top);
    return true;
  };

  const goBack = () => {
    if (!closeTopmostLayer()) navigateBack();
  };

  const hasTransientLayer = topmostLayer(layerState) !== null;

  const loadHomeMore = async () => {
    if (home.status !== "ready" || !home.data.continuation || homeMoreLoading) return;
    setHomeMoreLoading(true);
    try {
      const next = await invoke<HomePage>("ytm_home_continuation", { continuation: home.data.continuation });
      setHome((current) => {
        if (current.status !== "ready") return current;
        const sections = [...current.data.sections];
        for (const nextSection of next.sections) {
          const existing = sections.find((section) => section.title === nextSection.title);
          if (!existing) {
            sections.push(nextSection);
            continue;
          }
          for (const item of nextSection.items)
            if (!existing.items.some((value) => value.id === item.id)) existing.items.push(item);
          existing.browseId ??= nextSection.browseId;
          existing.browseKind ??= nextSection.browseKind;
          existing.params ??= nextSection.params;
        }
        return { status: "ready", data: { sections, continuation: next.continuation } };
      });
    } catch (error) {
      setNotice(`Home continuation failed: ${errorMessage(error)}`);
    } finally {
      setHomeMoreLoading(false);
    }
  };

  const loadHistory = async () => {
    setHistory((current) => ({ ...current, status: "loading", error: undefined }));
    try {
      setHistory({ status: "ready", data: await invoke<YtItem[]>("history_items") });
    } catch (error) {
      setHistory({ status: "error", data: [], error: errorMessage(error) });
    }
  };

  const loadStats = async (period = statsPeriod) => {
    setStats((current) => ({ ...current, status: "loading", error: undefined }));
    try {
      setStats({ status: "ready", data: await invoke<StatsPayload>("library_stats", { period }) });
    } catch (error) {
      setStats({
        status: "error",
        data: { period, totalPlays: 0, totalMinutes: 0, uniqueSongs: 0, rows: [], artists: [], albums: [] },
        error: errorMessage(error),
      });
    }
  };

  const loadRemoteHistory = async () => {
    if (!sessionStatus.authenticated) {
      setRemoteHistory({
        status: "error",
        data: { sections: [] },
        error: "Connect a Google / YouTube Music account to view remote history.",
      });
      return;
    }
    setRemoteHistory((current) => ({ ...current, status: "loading", error: undefined }));
    try {
      setRemoteHistory({ status: "ready", data: await invoke<RemoteHistoryPage>("ytm_history") });
    } catch (error) {
      setRemoteHistory({ status: "error", data: { sections: [] }, error: errorMessage(error) });
    }
  };

  const loadSpeedDial = async () => {
    try {
      setSpeedDial(await invoke<YtItem[]>("speed_dial_items"));
    } catch (error) {
      setNotice(`Speed Dial unavailable: ${errorMessage(error)}`);
    }
  };

  const loadSearchHistory = async () => {
    try {
      setSearchHistory(await invoke<string[]>("search_history_items"));
    } catch {
      setSearchHistory([]);
    }
  };

  const loadHome = async () => {
    setHome((state) => ({ ...state, status: "loading", error: undefined }));
    try {
      const data = await invoke<HomePage>("ytm_home");
      setHome({ status: "ready", data });
    } catch (error) {
      setHome({ status: "error", data: { sections: [] }, error: errorMessage(error) });
    }
  };

  const loadStartupContent = useEffectEvent(() => {
    void loadHome();
    void loadSpeedDial();
    void loadSearchHistory();
  });
  useEffect(() => loadStartupContent(), []);
  const loadVisibleStats = useEffectEvent(() => {
    if (active === "stats") void loadStats(statsPeriod);
  });
  useEffect(() => loadVisibleStats(), [active, statsPeriod]);

  const playSpotifyTrack = async (track: SpotifyTrackItem) => {
    try {
      const item = await findYouTubeMatchForSpotifyTrack(track);
      if (!item) {
        setNotice(`No YouTube Music match found for “${track.name}”.`);
        return;
      }
      setSpotifyOpenPlaylist(null);
      await openItem(item);
    } catch (error) {
      setNotice(`Spotify track could not be opened in YouTube Music: ${errorMessage(error)}`);
    }
  };

  const loadSettings = async () => {
    setSettingsLoading(true);
    try {
      const entries = await invoke<SettingEntry[]>("settings_get");
      setSettings((current) =>
        entries.reduce((next, entry) => ({ ...next, [entry.key]: entry.value === "true" }), current),
      );
      const storedSleepTimerDefault = Number(entries.find((entry) => entry.key === "sleepTimerDefault")?.value ?? "30");
      if (Number.isFinite(storedSleepTimerDefault)) {
        setSleepTimerDefault(Math.min(120, Math.max(5, Math.round(storedSleepTimerDefault / 5) * 5)));
        setSleepTimerMinutes(Math.min(120, Math.max(5, Math.round(storedSleepTimerDefault / 5) * 5)));
      }
      const storedAudioQuality = entries.find((entry) => entry.key === "audioQuality")?.value;
      const parsedAudioQuality = parseAudioQuality(storedAudioQuality);
      if (parsedAudioQuality) setAudioQuality(parsedAudioQuality);
      const storedVolume = Number(entries.find((entry) => entry.key === "playerVolume")?.value);
      if (Number.isFinite(storedVolume) && storedVolume >= 0 && storedVolume <= 1) setVolume(storedVolume);
      const rememberShuffle = entries.find((entry) => entry.key === "rememberShuffleAndRepeat")?.value !== "false";
      const storedShuffle = entries.find((entry) => entry.key === "shuffleMode");
      setShuffleEnabled(rememberShuffle && storedShuffle?.value === "true");
      const storedRepeat = entries.find((entry) => entry.key === "repeatMode")?.value;
      if (storedRepeat === "0" || storedRepeat === "1" || storedRepeat === "2")
        setRepeatMode(storedRepeat === "1" ? "one" : storedRepeat === "2" ? "all" : "off");
      const storedLyricsOrder = entries.find((entry) => entry.key === "lyricsProviderOrder")?.value;
      if (storedLyricsOrder) {
        const parsed = storedLyricsOrder
          .split(",")
          .map((value) => value.trim())
          .filter((value) => (lyricsProviderNames as readonly string[]).includes(value));
        setLyricsProviderOrder([...parsed, ...lyricsProviderNames.filter((provider) => !parsed.includes(provider))]);
      }
    } catch (error) {
      setNotice(`Settings could not be loaded: ${errorMessage(error)}`);
    } finally {
      setSettingsLoading(false);
    }
  };

  const confirmGoogleLogout = async (clearData: boolean) => {
    try {
      if (clearData) await invoke("clear_local_library_keep_downloads");
      await invoke("account_logout");
      setLogoutDialogOpen(false);
      setSessionStatus({ authenticated: false });
      setNotice(
        clearData
          ? "Google / YouTube Music account disconnected; local library data was cleared and offline downloads were kept."
          : "Google / YouTube Music account disconnected. Local library data was kept.",
      );
      if (active === "library") void reloadCurrentLibrary();
    } catch (error) {
      setNotice(`Account logout failed: ${errorMessage(error)}`);
    }
  };

  const openMenu = async (item: YtItem) => {
    setPlayerMenuOpen(false);
    setMenuItem(item);
    setMenuSpotifyMatch(null);
    showMenuDownload(null);
    setLyrics(null);
    setQueueOpen(false);
    setPlayerExpanded(false);
    try {
      const itemState = await invoke<LibraryItemState>("library_item_state", { id: item.id });
      if (item.videoId) {
        showMenuDownload(item.id);
        void invoke<SpotifyTrackMatch | null>("spotify_match_for_youtube", { youtubeId: item.videoId })
          .then(setMenuSpotifyMatch)
          .catch(() => setMenuSpotifyMatch(null));
      }
      if (item.kind === "episode" && item.albumId) {
        const podcastState = await invoke<LibraryItemState>("library_item_state", { id: item.albumId });
        setMenuState({ ...itemState, podcastSaved: podcastState.podcastSaved });
      } else setMenuState(itemState);
    } catch {
      setMenuState({ liked: false, youtubeLiked: false, inLibrary: false, uploaded: false, pinned: false });
    }
  };

  // Syncs a like/unlike to YouTube Music when a Google session is active. Returns whether the sync succeeded -
  // being signed out counts as success (there is nothing to sync), only an attempted sync that actually failed
  // is worth surfacing to the user.
  const syncLikeToYoutube = async (item: YtItem, liked: boolean): Promise<boolean> => {
    if (!item.videoId || !sessionStatus.authenticated) return true;
    try {
      await invoke("ytm_toggle_like", { videoId: item.videoId, liked, item });
      return true;
    } catch {
      return false;
    }
  };

  const playSelectedItems = async (shuffle: boolean) => {
    if (selectedItems.length === 0) return;
    const items = shuffle ? shuffled(selectedItems) : [...selectedItems];
    closeSelection();
    await playItem(items[0], items, 0, null, false);
  };

  const queueSelectedItems = (playNext: boolean) => {
    if (selectedItems.length === 0) return;
    setQueueItems((current) => {
      const currentId = queueIndex >= 0 ? current[queueIndex]?.id : null;
      const incoming = settings.preventDuplicateTracksInQueue
        ? selectedItems.filter(
            (item) => !current.some((queued, index) => queued.id === item.id && index !== queueIndex),
          )
        : selectedItems;
      if (playNext && currentId) {
        const next = [...current];
        const index = next.findIndex((item) => item.id === currentId);
        next.splice(index + 1, 0, ...incoming);
        return shuffleQueueAfterCurrent(next, currentId);
      }
      return [...current, ...incoming];
    });
    setNotice(
      playNext
        ? `Queued ${selectedItems.length} selected item${selectedItems.length === 1 ? "" : "s"} to play next.`
        : `Added ${selectedItems.length} selected item${selectedItems.length === 1 ? "" : "s"} to the Meld queue.`,
    );
    closeSelection();
  };

  const likeSelectedItems = async () => {
    if (selectedItems.length === 0) return;
    try {
      const states = await Promise.all(
        selectedItems.map((item) => invoke<LibraryItemState>("library_item_state", { id: item.id })),
      );
      const allLiked = states.every((state) => state.liked);
      let syncFailures = 0;
      for (let index = 0; index < selectedItems.length; index += 1) {
        const item = selectedItems[index];
        const liked = !allLiked;
        await invoke("library_toggle_liked", { item, liked });
        maybeAutoDownloadOnLike(item, liked);
        if (!(await syncLikeToYoutube(item, liked))) syncFailures += 1;
      }
      const verb = allLiked ? "Removed" : "Added";
      const preposition = allLiked ? "from" : "to";
      setNotice(
        syncFailures > 0
          ? `${verb} selected items ${preposition} Meld Liked Songs; Google sync failed for ${syncFailures} item${syncFailures === 1 ? "" : "s"}.`
          : `${verb} selected items ${preposition} Meld Liked Songs.`,
      );
      if (active === "library" && libraryMode === "liked") void loadLibrary("liked");
      closeSelection();
    } catch (error) {
      setNotice(`Selected like update failed: ${errorMessage(error)}`);
    }
  };

  const downloadSelectedItems = () => {
    downloadItems(selectedItems);
    closeSelection();
  };

  const removeSelectedDownloads = async () => {
    if (await removeDownloads(selectedItems)) closeSelection();
  };

  const loadLibrary = async (
    mode:
      "mix" | "local" | "songs" | "liked" | "uploaded" | "downloads" | "cache" | "top" | "albums" | "artists" = "mix",
  ) => {
    setLibrary((state) => ({ ...state, status: "loading", error: undefined }));
    try {
      let data: YtItem[];
      if (mode === "mix") {
        const [playlists, songs, albums, artists] = await Promise.all([
          invoke<(YtItem & { songCount?: number; savedAt?: number })[]>("library_playlists"),
          invoke<YtItem[]>("library_mix_songs"),
          invoke<YtItem[]>("library_albums"),
          invoke<YtItem[]>("library_artists"),
        ]);
        setLibraryMixSongs(songs);
        data = [...playlists, ...albums, ...artists].filter(
          (item, index, values) => values.findIndex((value) => value.id === item.id) === index,
        );
      } else {
        setLibraryMixSongs([]);
        const command =
          mode === "local"
            ? "library_local_files"
            : mode === "songs"
              ? "library_songs"
              : mode === "liked"
                ? "library_liked_songs"
                : mode === "uploaded"
                  ? "library_uploaded_songs"
                  : mode === "downloads"
                    ? "library_downloads"
                    : mode === "cache"
                      ? "library_player_cache"
                      : mode === "albums"
                        ? "library_albums"
                        : mode === "artists"
                          ? "library_artists"
                          : null;
        data = command
          ? await invoke<YtItem[]>(command)
          : await invoke<YtItem[]>("library_top_songs", { period: topPeriod, limit: topSize });
      }
      setLibrary({ status: "ready", data });
    } catch (error) {
      setLibrary({ status: "error", data: [], error: errorMessage(error) });
    }
  };

  const importLocalFiles = async () => {
    try {
      const imported = await invoke<YtItem[]>("local_files_pick");
      await loadLibrary("local");
      setNotice(
        imported.length > 0
          ? `Imported ${imported.length} audio file${imported.length === 1 ? "" : "s"} into Local Files.`
          : "No supported audio files were imported.",
      );
    } catch (error) {
      setNotice(`Local audio import failed: ${errorMessage(error)}`);
    }
  };

  const chooseLibrarySongFilter = (filter: LibrarySongFilter) => {
    setLibrarySongFilter(filter);
    setLibraryMode(filter === "library" ? "songs" : filter === "downloaded" ? "downloads" : filter);
  };

  const shuffleLibrary = async () => {
    if (filteredLibraryData.length === 0) return;
    const items = shuffled(filteredLibraryData);
    await playItem(items[0], items, 0, null, false);
  };

  const refreshSavedPodcasts = async () => {
    if (!sessionStatus.authenticated) {
      setNotice("Connect a Google / YouTube Music account before refreshing saved podcasts.");
      await loadPodcastItems(podcastFilter);
      return;
    }
    setPodcastRefreshing(true);
    try {
      const refreshed = await invoke<number>("ytm_refresh_saved_podcasts");
      await loadPodcastItems(podcastFilter);
      setNotice(
        refreshed > 0
          ? `Refreshed ${refreshed} saved podcast${refreshed === 1 ? "" : "s"}.`
          : "No saved podcasts needed a refresh.",
      );
    } catch (error) {
      setNotice(`Saved podcast refresh failed: ${errorMessage(error)}`);
    } finally {
      setPodcastRefreshing(false);
    }
  };

  const loadPodcastItems = async (filter: "episodes" | "channels" | "downloaded") => {
    if (filter === "downloaded") {
      setLibrary((state) => ({ ...state, status: "loading", error: undefined }));
      try {
        setLibrary({ status: "ready", data: await invoke<YtItem[]>("library_downloaded_podcasts") });
      } catch (error) {
        setLibrary({ status: "error", data: [], error: errorMessage(error) });
      }
      return;
    }
    setLibrary((state) => ({ ...state, status: "loading", error: undefined }));
    try {
      const command = filter === "episodes" ? "library_saved_podcasts" : "ytm_podcast_channels";
      setLibrary({ status: "ready", data: await invoke<YtItem[]>(command) });
    } catch (error) {
      setLibrary({ status: "error", data: [], error: errorMessage(error) });
    }
  };

  const syncLibraryMode = async (mode: "local" | "songs" | "liked" | "uploaded" | "downloads") => {
    if (mode === "local" || mode === "downloads" || !sessionStatus.authenticated || settings.ytmSync !== true) {
      await loadLibrary(mode);
      return;
    }
    // Opening the tab or switching a filter used to trigger a full sequential sync every time. Sync at most every 5 minutes.
    const syncKey = mode === "songs" ? "library" : mode;
    if (Date.now() - (lastLibrarySyncRef.current[syncKey] ?? 0) < 5 * 60_000) {
      await loadLibrary(mode);
      return;
    }
    setLibrarySyncing(true);
    setLibrary((state) => ({ ...state, status: "loading", error: undefined }));
    try {
      const syncMode = mode === "songs" ? "library" : mode;
      const result = await invoke<{ likedSongs: number; librarySongs: number; uploadedSongs: number }>(
        "sync_youtube_library",
        { mode: syncMode },
      );
      lastLibrarySyncRef.current[syncMode] = Date.now();
      await loadLibrary(mode);
      setNotice(
        `YouTube Music sync finished: ${mode === "liked" ? result.likedSongs : mode === "uploaded" ? result.uploadedSongs : result.librarySongs} songs.`,
      );
    } catch (error) {
      setNotice(`YouTube Music ${mode} sync failed: ${errorMessage(error)}`);
      await loadLibrary(mode);
    } finally {
      setLibrarySyncing(false);
    }
  };

  const reloadCurrentLibrary = async () => {
    if (libraryMode === "playlists") return syncSavedPlaylists();
    if (libraryMode === "podcasts") return loadPodcastItems(podcastFilter);
    return loadLibrary(libraryMode);
  };

  const openLocalPlaylist = async (item: YtItem) => {
    try {
      setDetail(null);
      if (item.id.startsWith("LOCAL_")) {
        const songs = await invoke<YtItem[]>("library_playlist_songs", { playlistId: item.id });
        setPlaylist({ status: "ready", data: { playlist: item, songs } });
      } else {
        setPlaylist({ status: "loading", data: { playlist: item, songs: [] } });
        const data = await invoke<PlaylistPage>("ytm_playlist", { playlistId: item.id });
        setPlaylist({ status: "ready", data });
      }
    } catch (error) {
      setPlaylist(null);
      setNotice(`Playlist could not be opened: ${errorMessage(error)}`);
    }
  };

  useEffect(() => {
    const handleSearchOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (searchBoxRef.current && target instanceof Node && !searchBoxRef.current.contains(target))
        setSearchFocused(false);
    };
    document.addEventListener("pointerdown", handleSearchOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleSearchOutsidePointer);
  }, []);

  useEffect(() => {
    if (active === "library") {
      if (libraryMode === "mix") void loadLibrary("mix");
      else if (libraryMode === "playlists") {
        void syncSavedPlaylists();
        if (spotifyStatus.authenticated) {
          void loadSpotifyLibrary(spotifyFolderStack[spotifyFolderStack.length - 1]?.uri ?? null);
          void loadSpotifyLikedTracks();
        }
      } else if (libraryMode === "albums" || libraryMode === "artists" || libraryMode === "cache")
        void loadLibrary(libraryMode);
      else if (libraryMode === "podcasts") void loadPodcastItems(podcastFilter);
      else if (libraryMode === "top") void loadLibrary("top");
      else void syncLibraryMode(libraryMode);
    }
    if (active === "history") {
      if (historySource === "remote") void loadRemoteHistory();
      else void loadHistory();
    }
  }, [
    active,
    historySource,
    libraryMode,
    podcastFilter,
    topPeriod,
    sessionStatus.authenticated,
    settings.ytmSync,
    spotifyStatus.authenticated,
  ]);
  const loadStartupAccounts = useEffectEvent(() => {
    void loadSessionStatus(true);
    void loadSpotifyStatus();
    void loadSettings();
  });
  useEffect(() => loadStartupAccounts(), []);
  useEffect(() => {
    if (accountAuthStateRef.current === null) {
      accountAuthStateRef.current = sessionStatus.authenticated;
      return;
    }
    if (accountAuthStateRef.current !== sessionStatus.authenticated) {
      accountAuthStateRef.current = sessionStatus.authenticated;
      if (active === "home") void loadHome();
    }
  }, [active, sessionStatus.authenticated]);
  const refreshSpotifyProfile = useEffectEvent(() => void loadSpotifyProfile());
  useEffect(() => refreshSpotifyProfile(), [spotifyStatus.authenticated]);
  const refreshOpenedSettings = useEffectEvent(() => {
    if (settingsOpen) {
      void loadSettings();
      void loadSessionStatus();
    }
  });
  useEffect(() => refreshOpenedSettings(), [settingsOpen]);

  const runSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    navigateTo("search_input");
    await searchFor(value);
  };

  /** Loads search results for `value` on the search page; `record` adds it to the search history (typed searches). */
  const searchFor = async (value: string, record = true) => {
    setSubmittedQuery(value);
    if (record && settings.pauseSearchHistory !== true)
      void invoke("search_history_add", { query: value })
        .then(() => loadSearchHistory())
        .catch(() => undefined);
    const parsedUrl = parseYouTubeUrl(value);
    if (parsedUrl) {
      setSearch({ status: "idle", data: { items: [], continuation: null } });
      const item: YtItem =
        parsedUrl.kind === "video"
          ? {
              id: parsedUrl.id,
              kind: "song",
              title: "YouTube video",
              subtitle: value,
              artists: [],
              videoId: parsedUrl.id,
            }
          : parsedUrl.kind === "album"
            ? {
                id: `MPREb_${parsedUrl.id}`,
                kind: "album",
                title: "YouTube Music album",
                subtitle: value,
                artists: [],
                browseId: `MPREb_${parsedUrl.id}`,
              }
            : {
                id: parsedUrl.id,
                kind: parsedUrl.kind,
                title: parsedUrl.kind === "playlist" ? "YouTube playlist" : "YouTube artist",
                subtitle: value,
                artists: [],
                browseId: parsedUrl.id,
              };
      await openItem(item);
      return;
    }
    setSearch({ status: "loading", data: { items: [], continuation: null } });
    try {
      const data = await invoke<SearchPage>("ytm_search", { query: value });
      setSearch({ status: "ready", data });
    } catch (error) {
      setSearch({ status: "error", data: { items: [], continuation: null }, error: errorMessage(error) });
    }
  };

  const loadSearchMore = async () => {
    if (search.status !== "ready" || !search.data.continuation || searchMoreLoading) return;
    setSearchMoreLoading(true);
    try {
      const next = await invoke<SearchPage>("ytm_search_continuation", { continuation: search.data.continuation });
      setSearch((current) => {
        if (current.status !== "ready") return current;
        const items = [...current.data.items];
        for (const item of next.items) if (!items.some((existing) => existing.id === item.id)) items.push(item);
        return { status: "ready", data: { items, continuation: next.continuation } };
      });
    } catch (error) {
      setNotice(`Search continuation failed: ${errorMessage(error)}`);
    } finally {
      setSearchMoreLoading(false);
    }
  };

  const shareItem = async (item: YtItem) => {
    const playlistId = (item.playlistId ?? item.id).replace(/^MPSP/i, "");
    const url = item.videoId
      ? `https://music.youtube.com/watch?v=${encodeURIComponent(item.videoId)}`
      : item.kind === "podcast"
        ? `https://music.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`
        : `https://music.youtube.com/${item.kind}/${encodeURIComponent(item.id)}`;
    try {
      if (navigator.share) await navigator.share({ title: item.title, text: item.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setNotice("Meld link copied to clipboard.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice(`Share unavailable: ${errorMessage(error)}`);
    }
  };

  const copyLink = async (item: YtItem) => {
    if (!item.videoId) {
      setNotice("This item has no source link to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(`https://music.youtube.com/watch?v=${encodeURIComponent(item.videoId)}`);
      setNotice("Meld link copied to clipboard.");
    } catch (error) {
      setNotice(`Copy link unavailable: ${errorMessage(error)}`);
    }
  };

  const togglePlayerFavorite = async () => {
    if (!player) return;
    const current = playerItemState ?? {
      liked: false,
      youtubeLiked: false,
      inLibrary: false,
      uploaded: false,
      pinned: false,
    };
    try {
      const nextLiked = !current.liked;
      await invoke("library_toggle_liked", { item: player.item, liked: nextLiked });
      setPlayerItemState({ ...current, liked: nextLiked });
      setMenuState((state) => ({ ...state, liked: nextLiked }));
      maybeAutoDownloadOnLike(player.item, nextLiked);
      const synced = await syncLikeToYoutube(player.item, nextLiked);
      if (active === "library" && libraryMode === "liked") void loadLibrary("liked");
      setNotice(
        !synced
          ? "Meld Liked Songs was updated locally; Google sync could not be completed."
          : !current.liked
            ? `Added “${player.item.title}” to Meld Liked Songs.`
            : `Removed “${player.item.title}” from Meld Liked Songs.`,
      );
    } catch (error) {
      setNotice(`Meld Liked Songs update failed: ${errorMessage(error)}`);
    }
  };

  // Redacted resolver report (which sources were tried and why they failed; no URLs, cookies or e-mails).
  const copyPlaybackReport = async (videoId: string) => {
    try {
      const report = await invoke<string>("ytm_playback_report", { videoId });
      await navigator.clipboard.writeText(`${report}\nSource: ${player?.payload.sourceClient ?? "cache or unknown"}`);
      setNotice("Playback report copied.");
    } catch (error) {
      setNotice(`Could not copy the playback report: ${String(error)}`);
    }
  };

  const openPlayerMenu = async () => {
    if (!player) return;
    setPlayerMenuOpen(true);
    setMenuItem(player.item);
    showMenuDownload(null);
    setQueueOpen(false);
    try {
      const state = await invoke<LibraryItemState>("library_item_state", { id: player.item.id });
      setPlayerItemState(state);
      setMenuState(state);
      if (player.item.videoId) showMenuDownload(player.item.id);
    } catch {
      const state = { liked: false, youtubeLiked: false, inLibrary: false, uploaded: false, pinned: false };
      setPlayerItemState(state);
      setMenuState(state);
    }
  };

  useEffect(() => {
    let activeRequest = true;
    if (!player) {
      setPlayerItemState(null);
      return () => {
        activeRequest = false;
      };
    }
    void invoke<LibraryItemState>("library_item_state", { id: player.item.id })
      .then((state) => {
        if (activeRequest) setPlayerItemState(state);
      })
      .catch(() => {
        if (activeRequest)
          setPlayerItemState({ liked: false, youtubeLiked: false, inLibrary: false, uploaded: false, pinned: false });
      });
    return () => {
      activeRequest = false;
    };
  }, [player?.item.id, setPlayerItemState]);

  const isLocalLibraryMenuContext = (item: YtItem) =>
    Boolean(item.localPath) ||
    (active === "library" && libraryMode !== "playlists") ||
    (active === "history" && historySource === "local") ||
    (playlist?.status === "ready" && playlist.data.playlist.id.startsWith("LOCAL_"));

  const performMenuAction = async (
    action:
      | "open"
      | "play"
      | "share"
      | "copy_link"
      | "download"
      | "download_cancel"
      | "download_remove"
      | "cache_remove"
      | "album"
      | "episode_save"
      | "podcast_save"
      | "queue"
      | "play_next"
      | "radio"
      | "playlist"
      | "remove_from_playlist"
      | "remove_history"
      | "pin"
      | "unpin"
      | "artist"
      | "info"
      | "edit"
      | "refetch"
      | "delete_uploaded"
      | "change_youtube_version"
      | "meld_like"
      | "add_library"
      | "remove_library",
    item: YtItem,
  ) => {
    if (!action.startsWith("download")) setMenuItem(null);
    if (action === "open") return openItem(item);
    if (action === "play")
      return playItem(
        item,
        [item],
        0,
        null,
        (active === "home" && item.kind === "song") ||
          (active === "search_input" && (item.kind === "song" || item.kind === "episode")),
      );
    if (action === "share") return shareItem(item);
    if (action === "copy_link") return copyLink(item);
    if (action === "download") return startDownload(item);
    if (action === "download_cancel") return cancelDownload(item);
    if (action === "download_remove") {
      await removeDownload(item);
      return;
    }
    if (action === "cache_remove") {
      try {
        await invoke("player_cache_remove", { songId: item.id });
        setMenuItem(null);
        setNotice(`Removed playback cache for “${item.title}”.`);
        if (active === "library" && libraryMode === "cache") void loadLibrary("cache");
      } catch (error) {
        setNotice(`Could not remove playback cache: ${errorMessage(error)}`);
      }
      return;
    }
    if (action === "edit") {
      setEditItem(item);
      setEditTitle(item.title);
      setEditArtist(item.subtitle);
      return;
    }
    if (action === "refetch") {
      if (!item.videoId) {
        setNotice("Refetch requires the source video ID for this item.");
        return;
      }
      try {
        const refreshed = await invoke<YtItem | null>("library_refetch_item", { id: item.videoId });
        if (!refreshed) {
          setNotice(`Meld could not refetch metadata for “${item.title}”.`);
          return;
        }
        setPlayer((current) =>
          current?.item.id === item.id ? { ...current, item: { ...current.item, ...refreshed } } : current,
        );
        if (active === "library" && ["songs", "liked", "uploaded", "downloads", "local"].includes(libraryMode))
          void syncLibraryMode(libraryMode as "liked" | "uploaded" | "downloads" | "local" | "songs");
        setNotice(`Refetched metadata for “${refreshed.title}”.`);
      } catch (error) {
        setNotice(`Refetch failed: ${errorMessage(error)}`);
      }
      return;
    }
    if (action === "delete_uploaded") {
      if (!item.videoId || !menuState.uploaded) {
        setNotice("This item is not marked as an uploaded YouTube Music song.");
        return;
      }
      try {
        await invoke("ytm_delete_uploaded_song", { entityId: item.videoId });
        if (active === "library") void syncLibraryMode("uploaded");
        setNotice(`Deleted uploaded song “${item.title}” from YouTube Music.`);
      } catch (error) {
        setNotice(`Uploaded song deletion failed: ${errorMessage(error)}`);
      }
      return;
    }
    if (action === "change_youtube_version") {
      if (!item.videoId || !menuSpotifyMatch) {
        setNotice("Change YouTube version requires the source Spotify match.");
        return;
      }
      setMenuItem(null);
      setYoutubeMatchItem({ item, match: menuSpotifyMatch });
      setYoutubeMatchUrl("");
      setYoutubeMatchPreview(null);
      return;
    }
    if (action === "album") {
      if (!item.albumId) {
        setNotice(`This ${item.kind} has no source collection browse endpoint.`);
        return;
      }
      const collectionKind = item.kind === "episode" ? "podcast" : "album";
      return openItem({
        id: item.albumId,
        kind: collectionKind,
        title: item.albumTitle || (collectionKind === "podcast" ? "Podcast" : "Album"),
        subtitle: collectionKind === "podcast" ? "Podcast" : "Album",
        artists: [],
        browseId: item.albumId,
      });
    }
    if (action === "podcast_save") {
      const podcastId = item.albumId || (item.kind === "podcast" ? item.id : "");
      if (!item.kind || !["episode", "podcast"].includes(item.kind) || !podcastId) {
        setNotice("This item has no source podcast ID for library actions.");
        return;
      }
      const saved = menuState.podcastSaved !== true;
      try {
        await invoke("ytm_toggle_podcast_saved", {
          podcastId,
          saved,
          title: item.albumTitle || item.title || "Podcast",
          author: item.subtitle || null,
          thumbnail: item.thumbnail ?? null,
        });
        setMenuState((current) => ({ ...current, podcastSaved: saved }));
        if (active === "library" && libraryMode === "podcasts") void loadPodcastItems(podcastFilter);
        setNotice(
          saved
            ? `Saved “${item.albumTitle || item.title || "podcast"}” to Podcasts.`
            : `Removed “${item.albumTitle || item.title || "podcast"}” from Podcasts.`,
        );
      } catch (error) {
        setNotice(`Podcast library update failed: ${errorMessage(error)}`);
      }
      return;
    }
    if (action === "episode_save") {
      if (item.kind !== "episode" || !item.videoId) {
        setNotice("This item is not a source podcast episode.");
        return;
      }
      const saved = !menuState.inLibrary;
      try {
        await invoke("ytm_toggle_episode_saved", {
          videoId: item.videoId,
          saved,
          setVideoId: item.setVideoId ?? null,
          item,
        });
        setMenuState((current) => ({ ...current, inLibrary: saved }));
        if (active === "library" && libraryMode === "podcasts") void loadPodcastItems("episodes");
        setNotice(saved ? `Saved “${item.title}” for later.` : `Removed “${item.title}” from Saved Episodes.`);
      } catch (error) {
        setNotice(`Saved Episode update failed: ${errorMessage(error)}`);
      }
      return;
    }
    if (action === "artist") {
      const artists = item.artists.filter((value) => value.id);
      if (artists.length === 0) {
        setNotice("This song has no source artist browse endpoint.");
        return;
      }
      if (artists.length > 1) {
        setArtistPickerItem(item);
        return;
      }
      const artist = artists[0];
      return openItem({
        id: artist.id as string,
        kind: "artist",
        title: artist.name,
        subtitle: "Artist",
        artists: [],
        browseId: artist.id,
      });
    }
    if (action === "info") {
      setInfoItem(item);
      return;
    }
    if (action === "remove_history") {
      if (!item.historyRemoveToken) {
        setNotice("This remote history item has no source removal token.");
        return;
      }
      try {
        await invoke("ytm_remove_from_history", { token: item.historyRemoveToken });
        await loadRemoteHistory();
        setNotice(`Removed “${item.title}” from YouTube Music history.`);
      } catch (error) {
        setNotice(`Could not remove “${item.title}” from remote history: ${errorMessage(error)}`);
      }
      return;
    }
    if (action === "meld_like") {
      try {
        const nextLiked = !menuState.liked;
        await invoke("library_toggle_liked", { item, liked: nextLiked });
        setMenuState((current) => ({ ...current, liked: nextLiked }));
        maybeAutoDownloadOnLike(item, nextLiked);
        const synced = await syncLikeToYoutube(item, nextLiked);
        if (active === "library" && libraryMode === "liked") void loadLibrary("liked");
        setNotice(
          !synced
            ? "Meld Liked Songs was updated locally; Google sync could not be completed."
            : menuState.liked
              ? `Removed “${item.title}” from Meld Liked Songs.`
              : `Added “${item.title}” to Meld Liked Songs.`,
        );
      } catch (error) {
        setNotice(`Meld Liked Songs update failed: ${errorMessage(error)}`);
      }
      return;
    }
    if (action === "playlist") {
      setPlaylistPickerSearch("");
      setPlaylistPickerItems([item]);
      return;
    }
    if (action === "play_next") {
      if (!item.videoId && !item.localPath) {
        setNotice("This item has no playable source path or watchEndpoint videoId, so it cannot enter the queue.");
        return;
      }
      setQueueItems((current) => {
        const currentId = queueIndex >= 0 ? current[queueIndex]?.id : null;
        const withoutItem = settings.preventDuplicateTracksInQueue
          ? current.filter((queued, index) => queued.id !== item.id || index === queueIndex)
          : [...current];
        const currentPosition = currentId ? withoutItem.findIndex((queued) => queued.id === currentId) : -1;
        const insertAt = currentPosition >= 0 ? currentPosition + 1 : 0;
        withoutItem.splice(Math.min(insertAt, withoutItem.length), 0, item);
        return shuffleQueueAfterCurrent(withoutItem, currentId);
      });
      setNotice(`“${item.title}” will play next.`);
      return;
    }
    if (action === "remove_from_playlist") {
      const playlistId = playlist?.data.playlist.id;
      if (!playlistId) {
        setNotice("This item is not open inside a playlist.");
        return;
      }
      try {
        if (playlistId.startsWith("LOCAL_")) {
          await invoke("library_remove_from_playlist", { playlistId, songId: item.id });
          const songs = await invoke<YtItem[]>("library_playlist_songs", { playlistId });
          setPlaylist((current) => (current ? { status: "ready", data: { ...current.data, songs } } : current));
          setNotice(`Removed “${item.title}” from the local playlist.`);
        } else if (item.videoId && item.setVideoId) {
          await invoke("ytm_remove_from_playlist", { playlistId, videoId: item.videoId, setVideoId: item.setVideoId });
          const data = await invoke<PlaylistPage>("ytm_playlist", { playlistId });
          setPlaylist({ status: "ready", data });
          setNotice(`Removed “${item.title}” from the YouTube Music playlist.`);
        } else {
          setNotice("This playlist item has no source setVideoId required for removal.");
        }
      } catch (error) {
        setNotice(`Could not remove from playlist: ${errorMessage(error)}`);
      }
      return;
    }
    if (action === "radio") {
      if (!item.videoId) {
        setNotice("This typed item has no watchEndpoint videoId, so it cannot start a radio queue.");
        return;
      }
      try {
        const page = await invoke<QueuePage>("ytm_next", {
          videoId: item.videoId,
          playlistId: `RDAMVM${item.videoId}`,
          setVideoId: item.setVideoId ?? null,
          index: null,
          params: item.params ?? null,
          continuation: null,
        });
        const items = page.items.length > 0 ? page.items : [item];
        const index = Math.min(page.currentIndex ?? 0, items.length - 1);
        await playItem(items[index], items, index, page.continuation ?? null, true);
      } catch (error) {
        setNotice(`Radio unavailable: ${errorMessage(error)}`);
      }
      return;
    }
    if (action === "pin" || action === "unpin") {
      try {
        await invoke("speed_dial_toggle", { item, pinned: action === "pin" });
        setMenuState((current) => ({ ...current, pinned: action === "pin" }));
        await loadSpeedDial();
        setNotice(
          action === "pin" ? `Pinned “${item.title}” to Speed Dial.` : `Unpinned “${item.title}” from Speed Dial.`,
        );
      } catch (error) {
        setNotice(`Speed Dial update failed: ${errorMessage(error)}`);
      }
      return;
    }
    if (action === "add_library" || action === "remove_library") {
      if (!item.videoId) {
        setNotice("This typed item has no watchEndpoint videoId, so it cannot be changed in YouTube Music Library.");
        return;
      }
      try {
        await invoke("ytm_toggle_library", { videoId: item.videoId, addToLibrary: action === "add_library" });
        if (action === "add_library") {
          await invoke("library_save_item", { item });
          setMenuState((current) => ({ ...current, inLibrary: true }));
          setNotice(`Added “${item.title}” to YouTube Music library.`);
        } else {
          await invoke("library_remove_item", { id: item.id });
          setMenuState((current) => ({ ...current, inLibrary: false }));
          setNotice(`Removed “${item.title}” from YouTube Music library.`);
          if (active === "library") {
            if (libraryMode === "playlists") void syncSavedPlaylists();
            else if (libraryMode === "podcasts") void loadPodcastItems(podcastFilter);
            else void loadLibrary(libraryMode);
          }
        }
      } catch (error) {
        setNotice(`YouTube Music library change failed: ${errorMessage(error)}`);
      }
      return;
    }
    if (!item.videoId) {
      setNotice("This typed item has no watchEndpoint videoId, so it cannot enter the queue.");
      return;
    }
    setQueueItems((current) => {
      const currentId = queueIndex >= 0 ? current[queueIndex]?.id : null;
      const withoutItem = settings.preventDuplicateTracksInQueue
        ? current.filter((queued, index) => queued.id !== item.id || index === queueIndex)
        : [...current];
      const next = [...withoutItem, item];
      return shuffleQueueAfterCurrent(next, currentId);
    });
    setNotice(`Added “${item.title}” to the Meld queue.`);
  };

  const clearQueue = () => {
    playRequestIdRef.current += 1;
    activePlayerIdRef.current = null;
    audioRef.current?.pause();
    setQueueItems([]);
    setQueueContinuation(null);
    setQueueContinuationKind(null);
    setQueueIndex(-1);
    setPlayer(null);
    setIsPlaying(false);
    setQueueOpen(false);
    autoMixEnabledRef.current = false;
  };

  const removeQueueItem = (index: number) => {
    const removed = removeAt(queueItems, queueIndex, index);
    if (!removed) return;
    if (removed.items.length === 0) {
      clearQueue();
      return;
    }
    setQueueItems(removed.items);
    setQueueIndex(removed.index);
    if (removed.wasCurrent)
      void playItem(removed.items[removed.index], removed.items, removed.index, null, autoMixEnabledRef.current);
  };

  const beginPlaytime = async (item: YtItem) => {
    if (settings.pauseListenHistory === true) return;
    await flushPlaytime();
    try {
      const historyId = await invoke<number>("history_add", { item });
      const position = activePlayerIdRef.current === item.id ? (audioRef.current?.currentTime ?? 0) : 0;
      playtimeRef.current = {
        historyId,
        songId: item.id,
        lastPosition: position,
        pendingMs: 0,
        playing: Boolean(audioRef.current && !audioRef.current.paused && activePlayerIdRef.current === item.id),
        flushing: false,
      };
      if (active === "history") void loadHistory();
    } catch {
      /* History must remain best-effort and never block playback. */
    }
  };
  const playItem = async (
    item: YtItem,
    sourceQueue: YtItem[] = [item],
    sourceIndex = 0,
    sourceContinuation: string | null = null,
    autoMixStart = false,
    sourceContinuationKind: "next" | "playlist" = "next",
  ) => {
    const requestId = ++playRequestIdRef.current;
    if (sourceQueue !== queueItems) autoMixEnabledRef.current = autoMixStart;
    if (item.localPath) {
      setNotice("");
      setLyrics(null);
      setLyricsAutoScrollEnabled(true);
      setQueueItems(sourceQueue);
      setQueueContinuation(null);
      setQueueContinuationKind(null);
      setQueueIndex(sourceIndex);
      const occurrence = startOccurrence(playbackSessionRef.current, item, {
        videoId: item.id,
        title: item.title,
        artist: item.subtitle,
        streamUrl: convertFileSrc(item.localPath),
        mimeType: "audio/*",
        bitrate: 0,
        expiresInSeconds: 0,
      });
      playbackSessionRef.current = occurrence.session;
      setPlayer(occurrence);
      void beginPlaytime(item);
      return;
    }
    if (!item.videoId) {
      setNotice("This typed item has no watchEndpoint videoId, so Meld cannot send it to the player.");
      return;
    }
    setNotice("");
    const keepInlineLyrics = playerExpanded;
    // `requestId` (above) ignores this request if the user started another track while it was still resolving (last click wins).
    setLyrics(null);
    setLyricsAutoScrollEnabled(true);
    let nextQueue = sourceQueue;
    let nextIndex = sourceIndex;
    let nextContinuation = sourceContinuation;
    const isNewQueue = sourceQueue !== queueItems;
    const effectiveShuffle = isNewQueue && settings.persistentShuffleAcrossQueues !== true ? false : shuffleEnabled;
    if (isNewQueue && !effectiveShuffle) setShuffleEnabled(false);
    if (sourceQueue.length <= 1 && autoMixEnabledRef.current) {
      try {
        const queuePlaylistId = item.playPlaylistId ?? item.playlistId ?? `RDAMVM${item.videoId}`;
        const page = await invoke<QueuePage>("ytm_next", {
          videoId: item.videoId,
          playlistId: queuePlaylistId,
          setVideoId: item.setVideoId ?? null,
          index: null,
          params: item.params ?? null,
          continuation: null,
        });
        if (requestId !== playRequestIdRef.current) return;
        const sourceItems = page.items.filter((value) => value.videoId);
        if (sourceItems.length > 0) {
          nextQueue = sourceItems.some((value) => value.id === item.id)
            ? sourceItems
            : [item, ...sourceItems.filter((value) => value.id !== item.id)];
          nextIndex = nextQueue.findIndex((value) => value.id === item.id);
          if (nextIndex < 0) {
            nextQueue = [item, ...sourceItems];
            nextIndex = 0;
          }
          nextContinuation = page.continuation ?? null;
        } else {
          nextQueue = [item, ...queueItems.filter((queued) => queued.id !== item.id)];
          nextIndex = 0;
          nextContinuation = null;
        }
      } catch {
        nextQueue = [item, ...queueItems.filter((queued) => queued.id !== item.id)];
        nextIndex = 0;
        nextContinuation = null;
      }
    }
    if (requestId !== playRequestIdRef.current) return;
    const originalQueueSize = sourceQueue.length <= 1 ? nextQueue.length : sourceQueue.length;
    const arranged = arrangeQueueForSettings(nextQueue, nextIndex, originalQueueSize, effectiveShuffle);
    nextQueue = arranged.items;
    nextIndex = arranged.index;
    setQueueItems(nextQueue);
    setQueueContinuation(nextContinuation);
    setQueueContinuationKind(nextContinuation ? sourceContinuationKind : null);
    setQueueIndex(nextIndex);
    try {
      const payload = await invoke<PlayerPayload>("ytm_player", streamRequest(item, audioQuality));
      if (requestId !== playRequestIdRef.current) return;
      streamResolvedAtRef.current = Date.now();
      const occurrence = startOccurrence(playbackSessionRef.current, item, payload);
      playbackSessionRef.current = occurrence.session;
      setPlayer(occurrence);
      if (keepInlineLyrics) void openLyrics(item);
      void beginPlaytime(item);
    } catch (error) {
      setNotice(`Playback unavailable: ${errorMessage(error)}`);
    }
  };

  useEffect(() => {
    if (!player || !audioRef.current) return;
    const audio = audioRef.current;
    const playerId = player.item.id;
    activePlayerIdRef.current = playerId;
    audio.src = mediaSrc(player.payload.streamUrl) ?? player.payload.streamUrl;
    audio.volume = volume;
    audio.playbackRate = playbackSpeed;
    (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = settings.varispeed !== true;
    setPlaybackSeconds(0);
    setDurationSeconds(0);
    const wasResuming = resumePendingRef.current;
    const resumePosition = resumePositionRef.current;
    const resumePlaying = resumePlayingRef.current;
    resumePendingRef.current = false;
    resumePositionRef.current = null;
    resumePlayingRef.current = false;
    const start = () => {
      if (activePlayerIdRef.current !== playerId) return;
      const startAt = resumeStartPosition(wasResuming, resumePosition, audio.duration);
      if (startAt !== null) {
        try {
          audio.currentTime = startAt;
          setPlaybackSeconds(startAt);
        } catch {
          /* Metadata may still be unavailable. */
        }
      }
      if (shouldAutoplay(wasResuming, resumePlaying)) {
        void audio
          .play()
          .then(() => {
            if (activePlayerIdRef.current === playerId) setIsPlaying(true);
          })
          .catch((error) => {
            if (activePlayerIdRef.current === playerId) {
              setIsPlaying(false);
              setNotice(`Audio playback failed: ${errorMessage(error)}`);
            }
          });
      } else {
        setIsPlaying(false);
      }
    };
    if (audio.readyState >= 1) start();
    else audio.addEventListener("loadedmetadata", start, { once: true });
    return () => audio.removeEventListener("loadedmetadata", start);
    // Keyed on the occurrence (song id + session), not the whole player object: recoverStream() and metadata
    // refreshes update `player` for the SAME occurrence and must not reset playback to 0 (PLAY-031, PLAY-035).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackEffectKey(player)]);

  useEffect(() => {
    if (settings.persistentQueue !== true) {
      persistentQueueLoadedRef.current = false;
      persistentQueueSkipWriteRef.current = false;
      persistentSessionLoadedRef.current = false;
      persistentSessionSkipWriteRef.current = false;
      localStorage.removeItem("meld:persistentQueue");
      localStorage.removeItem("meld:persistentPlayback");
      return;
    }
    if (persistentQueueLoadedRef.current) return;
    persistentQueueLoadedRef.current = true;
    // The write effect runs in the same commit as this hydration effect. Skip that
    // first write so the initial in-memory queue cannot overwrite stored entries.
    persistentQueueSkipWriteRef.current = true;
    persistentSessionLoadedRef.current = true;
    persistentSessionSkipWriteRef.current = true;
    try {
      const queue = restoreQueue<YtItem>(JSON.parse(localStorage.getItem("meld:persistentQueue") ?? "null"));
      const items = queue?.items ?? [];
      if (queue) {
        setQueueItems(queue.items);
        setQueueIndex(queue.index);
        setQueueContinuation(queue.continuation);
        setQueueContinuationKind(queue.continuationKind);
        setNotice(`Restored ${items.length} item${items.length === 1 ? "" : "s"} in the Meld queue.`);
      }
      const session = restoreSession<YtItem>(
        JSON.parse(localStorage.getItem("meld:persistentPlayback") ?? "null"),
        items,
      );
      if (session) {
        setQueueItems(session.items);
        setQueueIndex(session.index);
        setQueueContinuation(session.continuation);
        setQueueContinuationKind(session.continuationKind);
        resumePositionRef.current = session.position;
        resumePlayingRef.current = session.playing;
        resumePendingRef.current = true;
        void playItem(session.item, session.items, session.index, session.continuation, false, session.kind);
      }
    } catch {
      localStorage.removeItem("meld:persistentQueue");
    }
  }, [
    settings.persistentQueue,
    setNotice,
    setQueueContinuation,
    setQueueContinuationKind,
    setQueueIndex,
    setQueueItems,
  ]);

  useEffect(() => {
    if (settings.persistentQueue !== true) {
      localStorage.removeItem("meld:persistentQueue");
      localStorage.removeItem("meld:persistentPlayback");
      return;
    }
    if (persistentQueueSkipWriteRef.current) persistentQueueSkipWriteRef.current = false;
    else {
      try {
        localStorage.setItem(
          "meld:persistentQueue",
          JSON.stringify({
            items: queueItems,
            index: queueIndex,
            continuation: queueContinuation,
            continuationKind: queueContinuationKind,
          }),
        );
      } catch (error) {
        setNotice(`Persistent queue could not be saved: ${errorMessage(error)}`);
      }
    }
    if (!persistentSessionLoadedRef.current) return;
    if (persistentSessionSkipWriteRef.current) {
      persistentSessionSkipWriteRef.current = false;
      return;
    }
    try {
      const sessionItem = player?.item ?? (queueIndex >= 0 ? queueItems[queueIndex] : null);
      localStorage.setItem(
        "meld:persistentPlayback",
        JSON.stringify({
          items: queueItems,
          index: queueIndex,
          continuation: queueContinuation,
          continuationKind: queueContinuationKind,
          item: sessionItem,
          position: audioRef.current?.currentTime ?? playbackSeconds,
          playing: isPlaying,
        } satisfies PersistentPlayback),
      );
    } catch (error) {
      setNotice(`Persistent playback session could not be saved: ${errorMessage(error)}`);
    }
  }, [
    settings.persistentQueue,
    queueItems,
    queueIndex,
    queueContinuation,
    queueContinuationKind,
    player,
    playbackSeconds,
    isPlaying,
    setNotice,
    audioRef,
  ]);

  useEffect(() => {
    const mediaSession = navigator.mediaSession;
    if (!mediaSession) return;
    const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        mediaSession.setActionHandler(action, handler);
      } catch {
        /* WebView2 may not support every action. */
      }
    };
    if (!player) {
      mediaSession.metadata = null;
      for (const action of [
        "play",
        "pause",
        "seekbackward",
        "seekforward",
        "seekto",
        "previoustrack",
        "nexttrack",
      ] as MediaSessionAction[])
        setHandler(action, null);
      return;
    }
    mediaSession.metadata = new MediaMetadata({
      title: player.payload.title || player.item.title,
      artist: player.payload.artist || player.item.subtitle,
      album: player.item.albumTitle || "Meld Desktop",
    });
    setHandler("play", () => {
      if (audioRef.current)
        void audioRef.current.play().catch((error) => setNotice(`Audio playback failed: ${errorMessage(error)}`));
    });
    setHandler("pause", () => audioRef.current?.pause());
    setHandler("seekbackward", () => {
      const current = audioRef.current?.currentTime ?? playbackSeconds;
      seekPlayback(Math.max(0, current - 10));
    });
    setHandler("seekforward", () => {
      const current = audioRef.current?.currentTime ?? playbackSeconds;
      seekPlayback(Math.min(durationSeconds || Number.MAX_SAFE_INTEGER, current + 10));
    });
    setHandler("seekto", (details) => {
      if (details.seekTime !== undefined)
        seekPlayback(Math.max(0, Math.min(durationSeconds || Number.MAX_SAFE_INTEGER, details.seekTime)));
    });
    setHandler("previoustrack", () => {
      if (queueIndex > 0) void playQueueIndex(queueIndex - 1);
    });
    setHandler("nexttrack", () => {
      if (queueIndex + 1 < queueItems.length || queueContinuation) void playQueueIndex(queueIndex + 1);
    });
    return () => {
      mediaSession.metadata = null;
      for (const action of [
        "play",
        "pause",
        "seekbackward",
        "seekforward",
        "seekto",
        "previoustrack",
        "nexttrack",
      ] as MediaSessionAction[])
        setHandler(action, null);
    };
  }, [
    durationSeconds,
    playbackSeconds,
    player?.item.id,
    player?.item.title,
    player?.item.subtitle,
    player?.item.albumTitle,
    player?.payload.artist,
    player?.payload.title,
    queueContinuation,
    queueIndex,
    queueItems.length,
    setNotice,
    seekPlayback,
    audioRef,
  ]);

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const typing =
      target?.tagName === "INPUT" ||
      target?.tagName === "TEXTAREA" ||
      target?.tagName === "SELECT" ||
      target?.isContentEditable;
    if (typing && !(event.key === "Escape")) return;
    if (event.key === "Escape") {
      if (closeTopmostLayer()) event.preventDefault();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      document.querySelector<HTMLInputElement>(".search-form input")?.focus();
      return;
    }
    if (event.altKey && event.key === "ArrowLeft") {
      event.preventDefault();
      goBack();
      return;
    }
    if (event.altKey && event.key === "ArrowRight") {
      event.preventDefault();
      navigateForward();
      return;
    }
    if (!player) return;
    if (event.code === "Space") {
      event.preventDefault();
      togglePlayback();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      seekPlayback(Math.max(0, playbackSeconds - (event.shiftKey ? 10 : 5)));
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      seekPlayback(Math.min(durationSeconds || Number.MAX_SAFE_INTEGER, playbackSeconds + (event.shiftKey ? 10 : 5)));
    }
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const playQueueIndex = async (index: number) => {
    let items = queueItems;
    let continuation = queueContinuation;
    const continuationKind = queueContinuationKind ?? "next";
    try {
      while (
        index >= items.length &&
        continuation &&
        settings.autoLoadMore !== false &&
        !(settings.disableLoadMoreWhenRepeatAll === true && repeatMode === "all")
      ) {
        const previousContinuation = continuation;
        const next =
          continuationKind === "playlist"
            ? await invoke<PlaylistContinuationPage>("ytm_playlist_continuation", { continuation })
            : await invoke<QueuePage>("ytm_queue_continuation", { continuation });
        const pageItems: YtItem[] =
          continuationKind === "playlist" ? (next as PlaylistContinuationPage).songs : (next as QueuePage).items;
        const additions = appendNewPlayable(items, pageItems);
        items = [...items, ...additions];
        continuation = next.continuation ?? null;
        setQueueItems(items);
        setQueueContinuation(continuation);
        setQueueContinuationKind(continuation ? continuationKind : null);
        if (additions.length === 0 && continuation === previousContinuation) break;
      }
    } catch (error) {
      setNotice(`Queue continuation failed: ${errorMessage(error)}`);
      return;
    }
    const item = items[index];
    if (!item) {
      setNotice("Meld reached the end of the available queue.");
      return;
    }
    await playItem(item, items, index, continuation, autoMixEnabledRef.current, continuationKind);
  };

  useEffect(() => {
    taskbarPreviousRef.current = () => {
      if (queueIndex > 0) void playQueueIndex(queueIndex - 1);
    };
    taskbarToggleRef.current = () => togglePlayback();
    taskbarNextRef.current = () => {
      if (queueIndex + 1 < queueItems.length || queueContinuation) void playQueueIndex(queueIndex + 1);
    };
  });

  useEffect(() => {
    let disposed = false;
    let unlisteners: (() => void)[] = [];
    void Promise.all([
      listen("media-prev", () => taskbarPreviousRef.current()),
      listen("media-toggle", () => taskbarToggleRef.current()),
      listen("media-next", () => taskbarNextRef.current()),
    ])
      .then((cleanups) => {
        if (disposed) cleanups.forEach((cleanup) => cleanup());
        else unlisteners = cleanups;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisteners.forEach((cleanup) => cleanup());
    };
  }, []);

  useEffect(() => {
    void invoke("plugin:taskbar|initialize").catch(() => undefined);
  }, []);

  useEffect(() => {
    void invoke("plugin:taskbar|set_playback_state", { isPlaying: Boolean(player && isPlaying) }).catch(
      () => undefined,
    );
  }, [isPlaying, player]);

  useEffect(() => {
    void invoke("plugin:taskbar|set_navigation_enabled", {
      previousEnabled: Boolean(player && queueIndex > 0),
      nextEnabled: Boolean(player && (queueIndex + 1 < queueItems.length || queueContinuation)),
    }).catch(() => undefined);
  }, [player, queueContinuation, queueIndex, queueItems.length]);

  const loadDetailMore = async () => {
    if (!detail || detail.status !== "ready" || !detail.data.continuation || detailMoreLoading) return;
    setDetailMoreLoading(true);
    try {
      const next =
        detail.data.kind === "browse"
          ? await invoke<DetailPage>("ytm_browse_continuation", {
              browseId: detail.data.browseId ?? "",
              continuation: detail.data.continuation,
            })
          : await invoke<DetailPage>("ytm_detail_continuation", {
              kind: detail.data.kind,
              continuation: detail.data.continuation,
            });
      if (detail.data.kind === "podcast" && detail.data.browseId) {
        await invoke("ytm_podcast_cache_detail_page", { browseId: detail.data.browseId, page: next });
      }
      setDetail((current) => {
        if (!current || current.status !== "ready") return current;
        const items = [...current.data.items];
        for (const item of next.items) if (!items.some((existing) => existing.id === item.id)) items.push(item);
        return { status: "ready", data: { ...current.data, items, continuation: next.continuation } };
      });
    } catch (error) {
      setNotice(`More ${detail.data.kind} items could not be loaded: ${errorMessage(error)}`);
    } finally {
      setDetailMoreLoading(false);
    }
  };

  const loadPlaylistMore = async () => {
    const continuation = playlist?.data.continuation;
    if (!continuation || playlist?.status !== "ready") return;
    try {
      const next = await invoke<{ songs: YtItem[]; continuation?: string | null }>("ytm_playlist_continuation", {
        continuation,
      });
      setPlaylist({
        status: "ready",
        data: {
          ...playlist.data,
          songs: [
            ...playlist.data.songs,
            ...next.songs.filter((song) => !playlist.data.songs.some((existing) => existing.id === song.id)),
          ],
          continuation: next.continuation,
        },
      });
    } catch (error) {
      setNotice(`Playlist continuation failed: ${errorMessage(error)}`);
    }
  };

  const openItem = async (item: YtItem, sourceQueue: YtItem[] = [item], sourceIndex = 0) => {
    setNotice("");
    const libraryQueueModes = ["mix", "songs", "liked", "uploaded", "downloads", "cache", "local", "top"];
    const playableLibraryItems = filteredLibraryData.filter((value) => value.videoId || value.localPath);
    const libraryQueue =
      active === "library" &&
      libraryQueueModes.includes(libraryMode) &&
      playableLibraryItems.some((value) => value.id === item.id)
        ? playableLibraryItems
        : sourceQueue;
    const libraryIndex = libraryQueue.findIndex((value) => value.id === item.id);
    if (item.localPath) {
      await playItem(item, libraryQueue, libraryIndex >= 0 ? libraryIndex : sourceIndex, null, false);
      return;
    }
    if (item.kind === "browse" && (item.browseId || item.id)) {
      setPlaylist(null);
      setDetail({
        status: "loading",
        data: {
          kind: "browse",
          title: item.title,
          subtitle: item.subtitle,
          thumbnail: item.thumbnail,
          items: [],
          browseId: item.browseId ?? item.id,
        },
      });
      try {
        const data = await invoke<DetailPage>("ytm_browse", {
          browseId: item.browseId ?? item.id,
          params: item.params ?? null,
        });
        setDetail({ status: "ready", data: { ...data, browseId: data.browseId ?? item.browseId ?? item.id } });
      } catch (error) {
        setDetail({
          status: "error",
          data: {
            kind: "browse",
            title: item.title,
            subtitle: item.subtitle,
            thumbnail: item.thumbnail,
            items: [],
            browseId: item.browseId ?? item.id,
          },
          error: errorMessage(error),
        });
      }
      return;
    }
    if (["album", "artist", "podcast"].includes(item.kind) && (item.browseId || item.id)) {
      setPlaylist(null);
      setDetail({
        status: "loading",
        data: {
          kind: item.kind,
          title: item.title,
          subtitle: item.subtitle,
          thumbnail: item.thumbnail,
          items: [],
          browseId: item.browseId ?? null,
        },
      });
      try {
        const data = await invoke<DetailPage>("ytm_detail", { kind: item.kind, browseId: item.browseId ?? item.id });
        setDetail({ status: "ready", data: { ...data, browseId: data.browseId ?? item.browseId ?? null } });
      } catch (error) {
        setDetail({
          status: "error",
          data: {
            kind: item.kind,
            title: item.title,
            subtitle: item.subtitle,
            thumbnail: item.thumbnail,
            items: [],
            browseId: item.browseId ?? null,
          },
          error: errorMessage(error),
        });
      }
      return;
    }
    if (item.kind === "playlist" && (item.browseId || item.id)) {
      setDetail(null);
      setPlaylist({ status: "loading", data: { playlist: item, songs: [] } });
      try {
        const data = await invoke<PlaylistPage>("ytm_playlist", { playlistId: item.browseId ?? item.id });
        setPlaylist({ status: "ready", data });
      } catch (error) {
        setPlaylist({ status: "error", data: { playlist: item, songs: [] }, error: errorMessage(error) });
      }
      return;
    }
    if ((item.kind === "song" || item.kind === "episode") && item.videoId) {
      await playItem(
        item,
        libraryQueue,
        libraryIndex >= 0 ? libraryIndex : sourceIndex,
        null,
        (active === "home" && item.kind === "song") ||
          (active === "search_input" && (item.kind === "song" || item.kind === "episode")),
      );
      return;
    }
    setNotice(`Meld could not open this ${item.kind}: the live item did not include a supported navigation endpoint.`);
  };
  /** Shows `route` on top of `tab` without touching the history (back/forward and `openRoute` use it). */
  const showRoute = async (route: Route, tab: NavKey) => {
    closeTransientLayers();
    setSpotifyOpenPlaylist(null);
    setSpotifyLikedOpen(false);
    setActive(topLevelOf(route, tab));
    switch (route.name) {
      case "home":
        return;
      case "search":
        setQuery(route.query);
        if (route.query) await searchFor(route.query, false);
        else setSubmittedQuery("");
        return;
      case "library": {
        const songFilter = librarySongFilterFor(route.mode);
        if (songFilter) setLibrarySongFilter(songFilter);
        setLibraryMode(route.mode);
        return;
      }
      case "history":
        setHistorySource(route.source);
        return;
      case "stats":
        setStatsPeriod(route.period);
        return;
      case "settings":
        setSettingsPage(route.page);
        setSettingsOpen(true);
        return;
      case "album":
      case "artist":
      case "podcast":
      case "browse":
        await openItem({
          id: route.browseId,
          kind: route.name,
          title: "",
          subtitle: "",
          artists: [],
          browseId: route.browseId,
          params: route.name === "browse" ? route.params : undefined,
        });
        return;
      case "playlist": {
        const known = localPlaylists.find((item) => item.id === route.playlistId);
        await openLocalPlaylist(
          known ?? { id: route.playlistId, kind: "playlist", title: "Playlist", subtitle: "", artists: [] },
        );
        return;
      }
      case "spotify-playlist": {
        const known =
          spotifyLibrary.status === "ready"
            ? spotifyLibrary.data.playlists.find((item) => item.id === route.playlistId)
            : undefined;
        await openSpotifyPlaylist(known ?? { id: route.playlistId, name: "Spotify playlist" });
        return;
      }
      case "spotify-liked":
        openSpotifyLiked();
        return;
    }
  };

  const refreshPodcastDetail = async () => {
    if (
      !detail ||
      detail.status !== "ready" ||
      detail.data.kind !== "podcast" ||
      !detail.data.browseId ||
      detailRefreshing
    )
      return;
    setDetailRefreshing(true);
    try {
      const data = await invoke<DetailPage>("ytm_detail", { kind: "podcast", browseId: detail.data.browseId });
      setDetail({ status: "ready", data: { ...data, browseId: data.browseId ?? detail.data.browseId } });
      setNotice("Podcast details refreshed.");
    } catch (error) {
      setNotice(`Podcast refresh failed: ${errorMessage(error)}`);
    } finally {
      setDetailRefreshing(false);
    }
  };

  const toggleDetailArtistSubscription = async () => {
    if (!detail || detail.status !== "ready" || detail.data.kind !== "artist" || !detail.data.browseId) return;
    const next = !detailArtistSubscribed;
    try {
      await invoke("library_toggle_artist_bookmarked", {
        artistId: detail.data.browseId,
        name: detail.data.title || "Artist",
        thumbnail: detail.data.thumbnail ?? null,
        channelId: detail.data.browseId.startsWith("UC") ? detail.data.browseId : null,
        bookmarked: next,
      });
      setDetailArtistSubscribed(next);
      setNotice(
        next
          ? `Subscribed to “${detail.data.title || "artist"}”.`
          : `Unsubscribed from “${detail.data.title || "artist"}”.`,
      );
      if (active === "library" && libraryMode === "artists") void loadLibrary("artists");
    } catch (error) {
      setNotice(`Artist subscription update failed: ${errorMessage(error)}`);
    }
  };

  const openDetailItem = async (item: YtItem) => {
    const detailItems = detail?.status === "ready" ? detail.data.items : [];
    const queue = detailItems.filter((value) => value.videoId || value.localPath);
    const index = queue.findIndex((value) => value.id === item.id);
    await openItem(item, queue.length > 0 ? queue : [item], index >= 0 ? index : 0);
  };
  useEffect(() => {
    let activeRequest = true;
    if (!detail || detail.status !== "ready" || detail.data.kind !== "artist" || !detail.data.browseId) {
      setDetailArtistSubscribed(false);
      return () => {
        activeRequest = false;
      };
    }
    void invoke<boolean>("library_artist_state", { artistId: detail.data.browseId })
      .then((value) => {
        if (activeRequest) setDetailArtistSubscribed(value);
      })
      .catch(() => {
        if (activeRequest) setDetailArtistSubscribed(false);
      });
    return () => {
      activeRequest = false;
    };
  }, [detail?.status, detail?.data.kind, detail?.data.browseId]);

  const { activeLyricIndex } = useLyricsFollow({
    activeLyricRef,
    lyrics,
    lyricsAutoScrollEnabled,
    lyricsContainerRef,
    playbackSeconds,
    playerExpanded,
  });

  const visibleTitle = useMemo(() => navigation.find((item) => item.key === active)?.label ?? "Home", [active]);
  const libraryQuery = librarySearch.trim().toLowerCase();
  const matchesLibraryQuery = (title: string) =>
    libraryMode === "playlists"
      ? !playlistQuery || title.toLowerCase().includes(playlistQuery)
      : !libraryQuery || title.toLowerCase().includes(libraryQuery);
  const visibleLocalHistory = useMemo(() => {
    const queryText = historyQuery.trim().toLowerCase();
    if (history.status !== "ready") return [];
    return history.data.filter(
      (item) => !hideItem(item) && (!queryText || `${item.title} ${item.subtitle}`.toLowerCase().includes(queryText)),
    );
  }, [hideItem, history.data, history.status, historyQuery]);
  const statsQueueItems = useMemo(
    () => (stats.status === "ready" ? stats.data.rows.map((row) => row.item) : []),
    [stats.data.rows, stats.status],
  );
  const filteredLibraryData = useMemo(() => {
    const queryText = libraryQuery;
    const sourceValues = libraryMode === "mix" && queryText ? [...library.data, ...libraryMixSongs] : library.data;
    const values = sourceValues.filter(
      (item) =>
        !hideItem(item) &&
        (!queryText ||
          `${item.title} ${item.subtitle} ${item.artists.map((artist) => artist.name).join(" ")}`
            .toLowerCase()
            .includes(queryText)),
    );

    const activeSort = libraryMode === "mix" ? libraryMixSort : librarySort;
    const descending = libraryMode === "mix" ? libraryMixSortDescending : librarySortDescending;
    if (activeSort === "created") return descending ? values : [...values].reverse();
    const sorted = [...values].sort((left, right) => {
      if (activeSort === "name") return left.title.localeCompare(right.title);
      if (activeSort === "artist")
        return (left.artists[0]?.name ?? left.subtitle).localeCompare(right.artists[0]?.name ?? right.subtitle);
      return (left.duration ?? 0) - (right.duration ?? 0);
    });
    return descending ? sorted.reverse() : sorted;
  }, [
    library.data,
    libraryMixSongs,
    libraryMode,
    libraryMixSort,
    libraryMixSortDescending,
    libraryQuery,
    librarySort,
    librarySortDescending,
    hideItem,
  ]);

  // The page the user sees, as a typed route (U4-003). Settings is a modal on top of it, not a history entry.
  const pageRoute = routeFromView({
    active,
    submittedQuery,
    libraryMode,
    historySource,
    statsPeriod,
    settingsPage: null,
    detail: detail ? { kind: detail.data.kind, browseId: detail.data.browseId } : null,
    playlistId: playlist ? (playlist.data.playlist.browseId ?? playlist.data.playlist.id) : null,
    spotifyPlaylistId: spotifyOpenPlaylist?.id ?? null,
    spotifyLikedOpen,
  });
  const currentRoute: Route = settingsOpen ? { name: "settings", page: settingsPage } : pageRoute;
  const pageRouteKey = routeKey(pageRoute);

  useEffect(() => {
    const target = pendingScrollRef.current;
    const element = pageScrollRef.current;
    if (target === null || !element) return;
    element.scrollTop = target;
    // Pages that load their content keep the target until they are tall enough to reach it.
    if (Math.abs(element.scrollTop - target) < 2) pendingScrollRef.current = null;
  }, [pageRouteKey, home.status, search.status, library.status, history.status, detail?.status, playlist?.status]);

  return (
    <div className={settings.sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">M</div>
          {!settings.sidebarCollapsed && (
            <div>
              <strong>Meld</strong>
              <span>Desktop</span>
            </div>
          )}
          <button
            className="sidebar-toggle"
            onClick={() => void setSetting("sidebarCollapsed", !settings.sidebarCollapsed)}
            title={settings.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={settings.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={settings.sidebarCollapsed}
          >
            {settings.sidebarCollapsed ? "»" : "«"}
          </button>
        </div>
        <nav className="primary-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              key={item.key}
              className={active === item.key ? "nav-item active" : "nav-item"}
              onClick={() => navigateTo(item.key)}
              title={settings.sidebarCollapsed ? item.label : undefined}
              aria-current={active === item.key ? "page" : undefined}
            >
              <span className="nav-icon">{item.icon}</span>
              {!settings.sidebarCollapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>
        <nav className="secondary-nav" aria-label="Secondary navigation">
          {secondaryNavigation.map((item) => (
            <button
              key={item.key}
              className={active === item.key ? "nav-item active" : "nav-item"}
              onClick={() => navigateTo(item.key)}
              title={settings.sidebarCollapsed ? item.label : undefined}
              aria-current={active === item.key ? "page" : undefined}
            >
              <span className="nav-icon">{item.icon}</span>
              {!settings.sidebarCollapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>
        {!settings.sidebarCollapsed && (
          <div className="sidebar-footer">
            <span className="guest-label">
              {sessionStatus.authenticated ? "YouTube Music account connected" : "Guest mode · account optional"}
            </span>
          </div>
        )}
      </aside>

      <main className="main-area" data-route={routePath(currentRoute)}>
        <header className="topbar">
          <div className="topbar-title">
            <div>
              <p className="eyebrow">Meld Desktop</p>
              <h1>{visibleTitle}</h1>
            </div>
            <div className="nav-history-controls" role="group" aria-label="Navigation history">
              <button
                className="topbar-button icon-button"
                onClick={goBack}
                disabled={!hasTransientLayer && navHistory.back.length === 0}
                title="Back"
                aria-label="Back"
              >
                ‹
              </button>
              <button
                className="topbar-button icon-button"
                onClick={navigateForward}
                disabled={navHistory.forward.length === 0}
                title="Forward"
                aria-label="Forward"
              >
                ›
              </button>
            </div>
          </div>
          <div ref={searchBoxRef} className="search-box">
            <form
              className="search-form"
              onSubmit={(event) => {
                setSearchFocused(false);
                void runSearch(event);
              }}
            >
              <span>⌕</span>
              <input
                value={query}
                onFocus={() => setSearchFocused(true)}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search songs, albums, artists and playlists"
                aria-label="Search"
              />
              <button type="submit">Search</button>
            </form>
            {searchFocused &&
              searchHistory.filter(
                (value) => !query.trim() || value.toLowerCase().startsWith(query.trim().toLowerCase()),
              ).length > 0 && (
                <div className="search-history-popover" role="listbox" aria-label="Recent searches">
                  {searchHistory
                    .filter((value) => !query.trim() || value.toLowerCase().startsWith(query.trim().toLowerCase()))
                    .slice(0, 8)
                    .map((value, index) => (
                      <button type="button" role="option" key={`${value}-${index}`} onClick={() => setQuery(value)}>
                        {value}
                      </button>
                    ))}
                </div>
              )}
          </div>
          <div className="topbar-actions">
            <button
              className="topbar-button"
              onClick={() => {
                setSettingsPage("main");
                setSettingsOpen(true);
                setMenuItem(null);
                setLyrics(null);
                setQueueOpen(false);
                setPlayerExpanded(false);
                setDetail(null);
                setPlaylist(null);
                setInfoItem(null);
              }}
              title="Settings"
            >
              Settings
            </button>
            <div className="account-label">
              {sessionStatus.accountAvatar ? (
                <img
                  className="account-avatar account-avatar-image"
                  src={mediaSrc(sessionStatus.accountAvatar) as string}
                  alt=""
                />
              ) : (
                <span className="account-avatar">
                  {sessionStatus.authenticated ? sessionStatus.accountName?.slice(0, 1).toUpperCase() || "G" : "G"}
                </span>
              )}
              <span>
                {sessionStatus.authenticated
                  ? sessionStatus.accountName || sessionStatus.accountEmail || "Connected"
                  : "Guest"}
              </span>
            </div>
          </div>
        </header>

        {notice && (
          <div className="notice" role="status">
            <span title={notice}>{noticeSummary(notice)}</span>
            <button
              className="notice-dismiss"
              onClick={() => setNotice("")}
              title="Dismiss message"
              aria-label="Dismiss message"
            >
              ×
            </button>
          </div>
        )}

        <div className="page-scroll" ref={pageScrollRef}>
          {active === "home" && (
            <HomeScreen
              hideItem={hideItem}
              home={home}
              homeMoreLoading={homeMoreLoading}
              loadHome={loadHome}
              loadHomeMore={loadHomeMore}
              openItem={openItem}
              openMenu={openMenu}
              speedDial={speedDial}
            />
          )}

          {active === "search_input" && (
            <SearchScreen
              audioQuality={audioQuality}
              closeSelection={closeSelection}
              hideItem={hideItem}
              loadSearchMore={loadSearchMore}
              openItem={openItem}
              openLyrics={openLyrics}
              openMenu={openMenu}
              search={search}
              searchMoreLoading={searchMoreLoading}
              selectedItems={selectedItems}
              selectionMode={selectionMode}
              setSelectionMode={setSelectionMode}
              settings={settings}
              submittedQuery={submittedQuery}
              toggleSelectedItem={toggleSelectedItem}
            />
          )}

          {active === "history" && (
            <HistoryScreen
              audioQuality={audioQuality}
              closeSelection={closeSelection}
              hideItem={hideItem}
              history={history}
              historyQuery={historyQuery}
              historySource={historySource}
              loadHistory={loadHistory}
              loadRemoteHistory={loadRemoteHistory}
              openItem={openItem}
              openLyrics={openLyrics}
              openMenu={openMenu}
              remoteHistory={remoteHistory}
              selectedItems={selectedItems}
              selectionMode={selectionMode}
              sessionStatus={sessionStatus}
              setHistoryQuery={setHistoryQuery}
              setHistorySource={setHistorySource}
              setNotice={setNotice}
              setSelectionMode={setSelectionMode}
              settings={settings}
              toggleSelectedItem={toggleSelectedItem}
              visibleLocalHistory={visibleLocalHistory}
            />
          )}

          {active === "stats" && (
            <StatsScreen
              loadStats={loadStats}
              openItem={openItem}
              openMenu={openMenu}
              setRecapOpen={setRecapOpen}
              setStatsPeriod={setStatsPeriod}
              stats={stats}
              statsPeriod={statsPeriod}
              statsQueueItems={statsQueueItems}
            />
          )}

          {active === "library" && (
            <LibraryScreen
              audioQuality={audioQuality}
              chooseLibrarySongFilter={chooseLibrarySongFilter}
              closeSelection={closeSelection}
              filteredLibraryData={filteredLibraryData}
              hasVisiblePlaylistAutoEntries={hasVisiblePlaylistAutoEntries}
              importLocalFiles={importLocalFiles}
              library={library}
              libraryMixSort={libraryMixSort}
              libraryMixSortDescending={libraryMixSortDescending}
              libraryMode={libraryMode}
              librarySearch={librarySearch}
              librarySongFilter={librarySongFilter}
              librarySort={librarySort}
              librarySortDescending={librarySortDescending}
              librarySyncing={librarySyncing}
              libraryView={libraryView}
              loadSpotifyLibrary={loadSpotifyLibrary}
              matchesLibraryQuery={matchesLibraryQuery}
              openCreatePlaylistDialog={openCreatePlaylistDialog}
              openItem={openItem}
              openLocalPlaylist={openLocalPlaylist}
              openLyrics={openLyrics}
              openMenu={openMenu}
              openSpotifyFolder={openSpotifyFolder}
              openSpotifyLiked={openSpotifyLiked}
              openSpotifyPlaylist={openSpotifyPlaylist}
              playlistQuery={playlistQuery}
              playlistSearch={playlistSearch}
              playlistSort={playlistSort}
              playlistSortDescending={playlistSortDescending}
              playlistView={playlistView}
              podcastFilter={podcastFilter}
              podcastRefreshing={podcastRefreshing}
              refreshSavedPodcasts={refreshSavedPodcasts}
              reloadCurrentLibrary={reloadCurrentLibrary}
              selectedItems={selectedItems}
              selectionMode={selectionMode}
              setLibraryMixSort={setLibraryMixSort}
              setLibraryMixSortDescending={setLibraryMixSortDescending}
              setLibraryMode={setLibraryMode}
              setLibrarySearch={setLibrarySearch}
              setLibrarySort={setLibrarySort}
              setLibrarySortDescending={setLibrarySortDescending}
              setLibraryView={setLibraryView}
              setPlaylistSearch={setPlaylistSearch}
              setPlaylistSort={setPlaylistSort}
              setPlaylistSortDescending={setPlaylistSortDescending}
              setPlaylistView={setPlaylistView}
              setPodcastFilter={setPodcastFilter}
              setSelectionMode={setSelectionMode}
              setSpotifyFolderStack={setSpotifyFolderStack}
              settings={settings}
              setTopPeriod={setTopPeriod}
              shuffleLibrary={shuffleLibrary}
              spotifyFolderStack={spotifyFolderStack}
              spotifyLibrary={spotifyLibrary}
              spotifyLikedTracks={spotifyLikedTracks}
              spotifyStatus={spotifyStatus}
              toggleSelectedItem={toggleSelectedItem}
              topPeriod={topPeriod}
              visiblePlaylists={visiblePlaylists}
            />
          )}
        </div>
      </main>

      {selectionMode && selectedItems.length > 0 && (
        <div className="selection-action-bar" role="toolbar" aria-label="Selected song actions">
          <strong>{selectedItems.length} selected</strong>
          <button className="primary-button" onClick={() => void playSelectedItems(false)}>
            Play
          </button>
          <button className="secondary-button" onClick={() => void playSelectedItems(true)}>
            Shuffle
          </button>
          <button className="secondary-button" onClick={() => queueSelectedItems(true)}>
            Play next
          </button>
          <button className="secondary-button" onClick={() => queueSelectedItems(false)}>
            Add to queue
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              setPlaylistPickerItems([...selectedItems]);
              void loadLocalPlaylists();
            }}
          >
            Add to playlist
          </button>
          <button className="secondary-button" onClick={() => void likeSelectedItems()}>
            Like / dislike all
          </button>
          <button className="secondary-button" onClick={downloadSelectedItems}>
            Download
          </button>
          <button className="secondary-button" onClick={() => void removeSelectedDownloads()}>
            Remove download
          </button>
          <button className="secondary-button" onClick={closeSelection}>
            Clear
          </button>
        </div>
      )}

      {recapOpen && stats.status === "ready" && (
        <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setRecapOpen(false)}>
          <div className="detail-panel recap-panel" onClick={(event) => event.stopPropagation()}>
            <button className="close-button" title="Close" aria-label="Close" onClick={() => setRecapOpen(false)}>
              ×
            </button>
            <p className="eyebrow">Meld Desktop</p>
            <h2>Local listening recap</h2>
            <p className="muted-copy">
              A device-only recap calculated from your Meld playback history. It is not the remote YouTube Music Wrapped
              feed.
            </p>
            <div className="recap-grid">
              <div className="stats-summary-card">
                <strong>{stats.data.totalMinutes}</strong>
                <span>Minutes listened</span>
              </div>
              <div className="stats-summary-card">
                <strong>{stats.data.uniqueSongs}</strong>
                <span>Unique songs</span>
              </div>
              <div className="stats-summary-card">
                <strong>{stats.data.totalPlays}</strong>
                <span>Plays</span>
              </div>
            </div>
            {stats.data.rows[0] && (
              <div className="recap-highlight">
                <span>Top song</span>
                <strong>{stats.data.rows[0].item.title}</strong>
                <small>
                  {stats.data.rows[0].item.subtitle} · {stats.data.rows[0].plays} plays
                </small>
              </div>
            )}
            {stats.data.artists[0] && (
              <div className="recap-highlight">
                <span>Top artist</span>
                <strong>{stats.data.artists[0].title}</strong>
                <small>{stats.data.artists[0].plays} plays</small>
              </div>
            )}
            <button className="primary-button" onClick={() => setRecapOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
      {spotifyAddItem && spotifyAddState && (
        <div
          className="detail-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setSpotifyAddItem(null);
            setSpotifyAddState(null);
          }}
        >
          <div className="detail-panel picker-panel" onClick={(event) => event.stopPropagation()}>
            <button
              className="close-button"
              title="Close"
              aria-label="Close"
              onClick={() => {
                setSpotifyAddItem(null);
                setSpotifyAddState(null);
              }}
            >
              ×
            </button>
            <p className="eyebrow">Spotify</p>
            <h2>Add to Spotify playlist</h2>
            {spotifyAddState.status === "loading" && (
              <div className="state-panel">
                <div className="spinner" />
                <p>Matching the song and loading Spotify playlists…</p>
              </div>
            )}
            {spotifyAddState.status === "error" && (
              <div className="state-panel error">
                <p>{spotifyAddState.error}</p>
              </div>
            )}
            {spotifyAddState.status === "ready" && (
              <>
                {spotifyAddState.data.match && (
                  <p className="muted-copy">
                    Matched: {spotifyAddState.data.match.name} · {spotifyAddState.data.match.artist}
                  </p>
                )}
                <div className="picker-list">
                  {spotifyAddState.data.playlists.length === 0 ? (
                    <p className="muted-copy">No Spotify playlists were returned.</p>
                  ) : (
                    spotifyAddState.data.playlists.map((playlist) => (
                      <button
                        className="menu-option"
                        key={playlist.id}
                        onClick={() => void addToSpotifyPlaylist(playlist)}
                      >
                        {playlist.name}
                        {playlist.owner ? ` · ${playlist.owner}` : ""}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <SpotifyLikedScreen
        loadSpotifyLikedTracks={loadSpotifyLikedTracks}
        playSpotifyTrack={playSpotifyTrack}
        setSpotifyLikedOpen={setSpotifyLikedOpen}
        spotifyLikedOpen={spotifyLikedOpen}
        spotifyLikedTracks={spotifyLikedTracks}
      />
      <SpotifyPlaylistScreen
        downloadSpotifyPlaylist={downloadSpotifyPlaylist}
        loadMoreSpotifyPlaylistTracks={loadMoreSpotifyPlaylistTracks}
        moveSpotifyTrack={moveSpotifyTrack}
        openSpotifyPlaylist={openSpotifyPlaylist}
        playSpotifyTrack={playSpotifyTrack}
        removeSpotifyTrack={removeSpotifyTrack}
        renameSpotifyPlaylist={renameSpotifyPlaylist}
        setSpotifyDetailQuery={setSpotifyDetailQuery}
        setSpotifyDetailSort={setSpotifyDetailSort}
        setSpotifyDetailSortDescending={setSpotifyDetailSortDescending}
        setSpotifyOpenPlaylist={setSpotifyOpenPlaylist}
        setSpotifyRenameName={setSpotifyRenameName}
        setSpotifyReorderUnlocked={setSpotifyReorderUnlocked}
        spotifyDetailQuery={spotifyDetailQuery}
        spotifyDetailSort={spotifyDetailSort}
        spotifyDetailSortDescending={spotifyDetailSortDescending}
        spotifyOpenPlaylist={spotifyOpenPlaylist}
        spotifyPlaylistLoadingMore={spotifyPlaylistLoadingMore}
        spotifyPlaylistTracks={spotifyPlaylistTracks}
        spotifyProfile={spotifyProfile}
        spotifyRenameName={spotifyRenameName}
        spotifyReorderUnlocked={spotifyReorderUnlocked}
        visibleSpotifyPlaylistTracks={visibleSpotifyPlaylistTracks}
      />
      {youtubeMatchItem && (
        <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setYoutubeMatchItem(null)}>
          <div className="detail-panel picker-panel" onClick={(event) => event.stopPropagation()}>
            <button className="close-button" title="Close" aria-label="Close" onClick={() => setYoutubeMatchItem(null)}>
              ×
            </button>
            <p className="eyebrow">Change YouTube version</p>
            <h2>{youtubeMatchItem.match.name}</h2>
            <p className="muted-copy">
              Current match: {youtubeMatchItem.item.title} · {youtubeMatchItem.item.videoId}
            </p>
            <label className="form-field">
              <span>Paste YouTube URL or 11-character video ID</span>
              <input
                value={youtubeMatchUrl}
                onChange={(event) => setYoutubeMatchUrl(event.target.value)}
                placeholder="https://music.youtube.com/watch?v=…"
                autoFocus
              />
            </label>
            {youtubeMatchPreview?.status === "loading" && (
              <div className="state-panel">
                <div className="spinner" />
                <p>Searching YouTube Music…</p>
              </div>
            )}
            {youtubeMatchPreview?.status === "error" && (
              <div className="state-panel error">
                <p>{youtubeMatchPreview.error}</p>
              </div>
            )}
            {youtubeMatchPreview?.status === "ready" && youtubeMatchPreview.data && (
              <div className="match-preview">
                <strong>{youtubeMatchPreview.data.title}</strong>
                <span>{youtubeMatchPreview.data.subtitle}</span>
                <small>{youtubeMatchPreview.data.videoId}</small>
              </div>
            )}
            <div className="dialog-actions">
              <button className="secondary-button" onClick={() => setYoutubeMatchItem(null)}>
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={
                  youtubeMatchPreview?.status !== "ready" ||
                  !youtubeMatchPreview.data?.videoId ||
                  youtubeMatchPreview.data.videoId === youtubeMatchItem.item.videoId
                }
                onClick={() => void confirmYoutubeVersion()}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {editItem && (
        <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setEditItem(null)}>
          <div className="detail-panel picker-panel" onClick={(event) => event.stopPropagation()}>
            <button className="close-button" title="Close" aria-label="Close" onClick={() => setEditItem(null)}>
              ×
            </button>
            <p className="eyebrow">Edit song</p>
            <h2>{editItem.title}</h2>
            <label className="form-field">
              <span>Song title</span>
              <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
            </label>
            <label className="form-field">
              <span>Artist</span>
              <input value={editArtist} onChange={(event) => setEditArtist(event.target.value)} />
            </label>
            <button
              className="primary-button"
              disabled={!editTitle.trim()}
              onClick={async () => {
                try {
                  await invoke("library_edit_item", {
                    itemId: editItem.id,
                    title: editTitle.trim(),
                    artist: editArtist.trim(),
                  });
                  setEditItem(null);
                  setNotice(`Updated “${editTitle.trim()}”.`);
                  if (active === "library") void reloadCurrentLibrary();
                } catch (error) {
                  setNotice(`Song edit failed: ${errorMessage(error)}`);
                }
              }}
            >
              Save changes
            </button>
          </div>
        </div>
      )}
      {menuItem && (
        <div
          className="detail-overlay menu-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setMenuItem(null);
            setPlayerMenuOpen(false);
          }}
        >
          <div className="menu-panel" onClick={(event) => event.stopPropagation()}>
            <div className="menu-heading">
              <strong>{menuItem.title}</strong>
              <button
                className="close-button"
                title="Close"
                aria-label="Close"
                onClick={() => {
                  setMenuItem(null);
                  setPlayerMenuOpen(false);
                }}
              >
                ×
              </button>
            </div>
            {playerMenuOpen && (
              <>
                <button
                  className="menu-option"
                  onClick={() => {
                    setMenuItem(null);
                    setPlayerMenuOpen(false);
                    setSpeedDialogOpen(true);
                  }}
                >
                  Advanced playback · x{playbackSpeed.toFixed(2)}
                </button>
                <button
                  className="menu-option"
                  onClick={() => {
                    setMenuItem(null);
                    setPlayerMenuOpen(false);
                    setSleepTimerMinutes(sleepTimerDefault);
                    setSleepTimerOpen(true);
                  }}
                >
                  Sleep timer
                </button>
              </>
            )}
            {!playerMenuOpen && (menuItem.kind === "song" || menuItem.kind === "episode") && (
              <button className="menu-option" onClick={() => void performMenuAction("play", menuItem)}>
                Play in Meld
              </button>
            )}
            {menuItem.kind === "podcast" && (
              <div className="menu-quick-actions">
                <button className="menu-option" onClick={() => void performMenuAction("podcast_save", menuItem)}>
                  {menuState.podcastSaved ? "Remove from library" : "Save to Podcasts"}
                </button>
                <button className="menu-option" onClick={() => void performMenuAction("share", menuItem)}>
                  Share
                </button>
              </div>
            )}
            {(menuItem.kind === "song" || menuItem.kind === "episode") && (
              <div className="menu-quick-actions">
                {!playerMenuOpen && isLocalLibraryMenuContext(menuItem) && (
                  <button className="menu-option" onClick={() => void performMenuAction("edit", menuItem)}>
                    Edit
                  </button>
                )}
                <button className="menu-option" onClick={() => void performMenuAction("playlist", menuItem)}>
                  Add to playlist
                </button>
                {menuItem.videoId && !menuItem.localPath && (
                  <button
                    className="menu-option"
                    onClick={() => void performMenuAction(playerMenuOpen ? "copy_link" : "share", menuItem)}
                  >
                    {playerMenuOpen ? "Copy link" : "Share"}
                  </button>
                )}
                {playerMenuOpen && menuItem.videoId && !menuItem.localPath && (
                  <button className="menu-option" onClick={() => void copyPlaybackReport(menuItem.videoId as string)}>
                    Copy playback report
                  </button>
                )}
                {menuItem.videoId && !menuItem.localPath && spotifyStatus.authenticated && (
                  <button className="menu-option" onClick={() => void beginSpotifyAdd(menuItem)}>
                    Add to Spotify playlist
                  </button>
                )}
              </div>
            )}
            {menuItem.videoId && (
              <>
                {active === "library" && libraryMode === "cache" && (
                  <button className="menu-option" onClick={() => void performMenuAction("cache_remove", menuItem)}>
                    Remove playback cache
                  </button>
                )}
                {menuDownload?.state === "downloading" ? (
                  <button className="menu-option" onClick={() => void performMenuAction("download_cancel", menuItem)}>
                    Cancel offline download
                    {menuDownload.totalBytes
                      ? ` · ${Math.round((menuDownload.bytes / menuDownload.totalBytes) * 100)}%`
                      : ""}
                  </button>
                ) : menuDownload?.state === "completed" ? (
                  <button className="menu-option" onClick={() => void performMenuAction("download_remove", menuItem)}>
                    Remove offline download
                  </button>
                ) : !menuItem.localPath ? (
                  <button className="menu-option" onClick={() => void performMenuAction("download", menuItem)}>
                    {menuDownload?.state === "failed"
                      ? "Retry offline download"
                      : menuDownload?.state === "cancelled"
                        ? "Resume offline download"
                        : "Download for offline listening"}
                  </button>
                ) : null}
                {menuDownload?.state === "completed" && (
                  <span className="menu-note">
                    Offline download ready{menuDownload.artworkPath ? " · artwork cached" : " · artwork unavailable"}
                    {menuDownload.lyricsCached ? " · lyrics cached" : " · lyrics unavailable"}
                  </span>
                )}
                {(menuDownload?.state === "failed" || menuDownload?.state === "cancelled") && menuDownload.error && (
                  <span className="menu-note error-text">{menuDownload.error}</span>
                )}
              </>
            )}
            {!playerMenuOpen && (
              <button
                className="menu-option"
                onClick={() => void performMenuAction(menuState.pinned ? "unpin" : "pin", menuItem)}
              >
                {menuState.pinned ? "Unpin from Speed Dial" : "Pin to Speed Dial"}
              </button>
            )}
            {(menuItem.kind === "song" || menuItem.kind === "episode") && (
              <>
                {menuItem.kind === "song" && !menuItem.localPath && menuItem.artists.some((value) => value.id) && (
                  <button className="menu-option" onClick={() => void performMenuAction("artist", menuItem)}>
                    View artist{menuItem.artists.filter((value) => value.id).length > 1 ? "s" : ""}
                  </button>
                )}
                {menuItem.kind === "song" && menuItem.albumId && (
                  <button className="menu-option" onClick={() => void performMenuAction("album", menuItem)}>
                    View album{menuItem.albumTitle ? ` · ${menuItem.albumTitle}` : ""}
                  </button>
                )}
                <button className="menu-option" onClick={() => void performMenuAction("info", menuItem)}>
                  Details
                </button>
                {!playerMenuOpen && menuItem.videoId && (
                  <button className="menu-option" onClick={() => void performMenuAction("refetch", menuItem)}>
                    Refetch metadata
                  </button>
                )}
                {menuSpotifyMatch && (
                  <button
                    className="menu-option"
                    onClick={() => void performMenuAction("change_youtube_version", menuItem)}
                  >
                    Change YouTube version
                  </button>
                )}
                {!playerMenuOpen && menuState.uploaded && sessionStatus.authenticated && (
                  <button className="menu-option" onClick={() => void performMenuAction("delete_uploaded", menuItem)}>
                    Delete uploaded song
                  </button>
                )}
                {!playerMenuOpen && playlist?.data.playlist.id?.startsWith("LOCAL_") && (
                  <button
                    className="menu-option"
                    onClick={() => void performMenuAction("remove_from_playlist", menuItem)}
                  >
                    Remove from playlist
                  </button>
                )}
                {menuItem.videoId && (
                  <button className="menu-option" onClick={() => void performMenuAction("radio", menuItem)}>
                    Start radio
                  </button>
                )}
                {!playerMenuOpen && (menuItem.videoId || menuItem.localPath) && (
                  <button className="menu-option" onClick={() => void performMenuAction("play_next", menuItem)}>
                    Play next
                  </button>
                )}
              </>
            )}
            {menuItem.kind === "song" && (
              <>
                {!playerMenuOpen && menuItem.historyRemoveToken && (
                  <button className="menu-option" onClick={() => void performMenuAction("remove_history", menuItem)}>
                    Remove from YouTube Music history
                  </button>
                )}
                {!playerMenuOpen && isLocalLibraryMenuContext(menuItem) && (
                  <button className="menu-option" onClick={() => void performMenuAction("meld_like", menuItem)}>
                    {menuState.liked ? "Remove from Meld Liked Songs" : "Add to Meld Liked Songs"}
                  </button>
                )}
                {!menuItem.localPath && (
                  <button
                    className="menu-option"
                    onClick={() =>
                      void performMenuAction(menuState.inLibrary ? "remove_library" : "add_library", menuItem)
                    }
                  >
                    {menuState.inLibrary ? "Remove from library" : "Add to library"}
                  </button>
                )}
              </>
            )}
            {menuItem.kind === "episode" && (
              <>
                {!playerMenuOpen && (
                  <button className="menu-option" onClick={() => void performMenuAction("episode_save", menuItem)}>
                    {menuState.inLibrary ? "Remove from Saved Episodes" : "Save for later"}
                  </button>
                )}
                {menuItem.albumId && (
                  <>
                    <button className="menu-option" onClick={() => void performMenuAction("album", menuItem)}>
                      View podcast{menuItem.albumTitle ? ` · ${menuItem.albumTitle}` : ""}
                    </button>
                    <button className="menu-option" onClick={() => void performMenuAction("podcast_save", menuItem)}>
                      {menuState.podcastSaved ? "Unsubscribe from podcast" : "Subscribe to podcast"}
                    </button>
                  </>
                )}
              </>
            )}
            {!playerMenuOpen && (
              <button className="menu-option" onClick={() => void performMenuAction("queue", menuItem)}>
                Add to queue
              </button>
            )}
          </div>
        </div>
      )}
      {speedDialogOpen && (
        <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setSpeedDialogOpen(false)}>
          <div className="detail-panel speed-dialog" onClick={(event) => event.stopPropagation()}>
            <button className="close-button" title="Close" aria-label="Close" onClick={() => setSpeedDialogOpen(false)}>
              ×
            </button>
            <p className="eyebrow">Player</p>
            <h2>{settings.varispeed === true ? "Playback speed" : "Tempo and pitch"}</h2>
            <p className="muted-copy">
              {settings.varispeed === true
                ? "Change speed with pitch following, matching Meld’s varispeed mode."
                : "Change playback tempo. Desktop keeps pitch with the native audio element when varispeed is off."}
            </p>
            <label className="speed-control">
              <strong>x{playbackSpeed.toFixed(2)}</strong>
              <input
                type="range"
                min="0.25"
                max="2"
                step="0.05"
                value={playbackSpeed}
                onChange={(event) => setPlaybackSpeed(Number(event.currentTarget.value))}
                aria-label="Playback speed"
              />
            </label>
            <div className="dialog-actions">
              <button className="secondary-button" onClick={() => setPlaybackSpeed(1)}>
                Reset
              </button>
              <button className="primary-button" onClick={() => setSpeedDialogOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {sleepTimerOpen && (
        <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setSleepTimerOpen(false)}>
          <div className="detail-panel sleep-timer-panel" onClick={(event) => event.stopPropagation()}>
            <button className="close-button" title="Close" aria-label="Close" onClick={() => setSleepTimerOpen(false)}>
              ×
            </button>
            <p className="eyebrow">Player</p>
            <h2>Sleep timer</h2>
            <p className="muted-copy">Stop playback after a set time or when the current song ends.</p>
            <label className="sleep-timer-value">
              <strong>{sleepTimerMinutes} minutes</strong>
              <input
                type="range"
                min="5"
                max="120"
                step="5"
                value={sleepTimerMinutes}
                onChange={(event) => setSleepTimerMinutes(Number(event.currentTarget.value))}
                aria-label="Sleep timer minutes"
              />
            </label>
            <label className="setting-row">
              <span>
                <strong>Stop after current song</strong>
                <small>After the timer expires, finish this song and pause.</small>
              </span>
              <input
                type="checkbox"
                checked={sleepTimerStopAfterCurrent}
                onChange={(event) => setSleepTimerStopAfterCurrent(event.target.checked)}
              />
            </label>
            <label className="setting-row">
              <span>
                <strong>Fade out</strong>
                <small>Lower volume during the final minute.</small>
              </span>
              <input
                type="checkbox"
                checked={sleepTimerFadeOut}
                onChange={(event) => setSleepTimerFadeOut(event.target.checked)}
              />
            </label>
            <div className="dialog-actions">
              <button className="secondary-button" onClick={() => clearSleepTimer()}>
                Clear timer
              </button>
              <button
                className="secondary-button"
                onClick={() =>
                  void invoke("settings_set", { key: "sleepTimerDefault", value: String(sleepTimerMinutes) })
                    .then(() => {
                      setSleepTimerDefault(sleepTimerMinutes);
                      setNotice(`Sleep timer default set to ${sleepTimerMinutes} minutes.`);
                    })
                    .catch((error) => setNotice(`Sleep timer default could not be saved: ${errorMessage(error)}`))
                }
              >
                Set as default
              </button>
              <button className="secondary-button" onClick={() => startSleepTimer(true)}>
                End of song
              </button>
              <button className="primary-button" onClick={() => startSleepTimer(false)}>
                Start timer
              </button>
            </div>
          </div>
        </div>
      )}
      {artistPickerItem && (
        <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setArtistPickerItem(null)}>
          <div className="detail-panel picker-panel" onClick={(event) => event.stopPropagation()}>
            <button className="close-button" title="Close" aria-label="Close" onClick={() => setArtistPickerItem(null)}>
              ×
            </button>
            <p className="eyebrow">Artist selection</p>
            <h2>{artistPickerItem.title}</h2>
            <p className="muted-copy">Meld found more than one source artist for this item.</p>
            <div className="picker-list">
              {artistPickerItem.artists
                .filter((artist) => artist.id)
                .map((artist) => (
                  <button
                    className="menu-option"
                    key={artist.id}
                    onClick={() => {
                      setArtistPickerItem(null);
                      void openItem({
                        id: artist.id as string,
                        kind: "artist",
                        title: artist.name,
                        subtitle: "Artist",
                        artists: [],
                        browseId: artist.id,
                      });
                    }}
                  >
                    {artist.name}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
      {playlistPickerItems && (
        <div className="detail-overlay" role="dialog" aria-modal="true">
          <div className="detail-panel picker-panel">
            <button
              className="close-button"
              title="Close"
              aria-label="Close"
              onClick={() => setPlaylistPickerItems(null)}
            >
              ×
            </button>
            <p className="eyebrow">Add to playlist</p>
            <h2>
              {playlistPickerItems.length === 1
                ? playlistPickerItems[0].title
                : `${playlistPickerItems.length} selected songs`}
            </h2>
            <button className="primary-button" onClick={openCreatePlaylistDialog}>
              Create playlist
            </button>
            <div className="playlist-picker-toolbar">
              <label className="library-search">
                <span>Search</span>
                <input
                  value={playlistPickerSearch}
                  onChange={(event) => setPlaylistPickerSearch(event.target.value)}
                  placeholder="Search playlists"
                  aria-label="Search playlists to add to"
                />
              </label>
              <select
                className="library-sort"
                value={playlistPickerSort}
                onChange={(event) => setPlaylistPickerSort(event.target.value as PlaylistSort)}
                aria-label="Sort playlists to add to"
              >
                <option value="name">Name</option>
                <option value="count">Song count</option>
                <option value="created">Recently added</option>
              </select>
              <button
                className="secondary-button"
                onClick={() => setPlaylistPickerSortDescending((value) => !value)}
                title="Reverse playlist order"
              >
                {playlistPickerSortDescending ? "Descending" : "Ascending"}
              </button>
            </div>
            <div className="picker-list">
              {visiblePlaylistPicker.length === 0 ? (
                <p className="muted-copy">
                  {playlistPickerSearch.trim() ? "No matching playlists." : "No playlists exist yet."}
                </p>
              ) : (
                visiblePlaylistPicker.map((item) => (
                  <button className="menu-option" key={item.id} onClick={() => void addToSelectedPlaylist(item.id)}>
                    {item.title}
                    {item.songCount === undefined ? "" : ` · ${item.songCount} song${item.songCount === 1 ? "" : "s"}`}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {createPlaylistOpen && (
        <div className="detail-overlay" role="dialog" aria-modal="true">
          <div className="detail-panel picker-panel">
            <button
              className="close-button"
              title="Close"
              aria-label="Close"
              onClick={() => setCreatePlaylistOpen(false)}
            >
              ×
            </button>
            <p className="eyebrow">My Playlists</p>
            <h2>Create playlist</h2>
            <p className="muted-copy">
              Creates a playlist on this device. YouTube Music saved playlists appear after a connected-account sync.
            </p>
            {sessionStatus.authenticated && settings.ytmSync === true && (
              <label className="setting-row playlist-sync-toggle">
                <span>
                  <strong>Sync with YouTube Music</strong>
                  <small>Uses the live authenticated playlist/create path.</small>
                </span>
                <input
                  type="checkbox"
                  checked={createSyncedPlaylist}
                  onChange={(event) => setCreateSyncedPlaylist(event.target.checked)}
                />
              </label>
            )}
            <input
              className="playlist-name-input"
              value={newPlaylistTitle}
              onChange={(event) => setNewPlaylistTitle(event.target.value)}
              placeholder="Playlist name"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") void createLocalPlaylist();
              }}
            />
            <button
              className="primary-button"
              disabled={!newPlaylistTitle.trim()}
              onClick={() => void createLocalPlaylist()}
            >
              Create playlist
            </button>
          </div>
        </div>
      )}
      {logoutDialogOpen && (
        <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setLogoutDialogOpen(false)}>
          <div className="detail-panel picker-panel" onClick={(event) => event.stopPropagation()}>
            <button
              className="close-button"
              title="Close"
              aria-label="Close"
              onClick={() => setLogoutDialogOpen(false)}
            >
              ×
            </button>
            <p className="eyebrow">Google / YouTube Music</p>
            <h2>Disconnect account?</h2>
            <p className="muted-copy">
              Choose whether to keep your Meld library. Offline downloaded files are kept when local library data is
              cleared, matching Meld’s logout choices.
            </p>
            <div className="dialog-actions">
              <button className="secondary-button" onClick={() => void confirmGoogleLogout(true)}>
                Clear local data
              </button>
              <button className="primary-button" onClick={() => void confirmGoogleLogout(false)}>
                Keep local data
              </button>
            </div>
          </div>
        </div>
      )}
      <SettingsScreen
        audioQuality={audioQuality}
        connectGoogle={connectGoogle}
        connectSpotify={connectSpotify}
        loadSearchHistory={loadSearchHistory}
        logoutGoogle={logoutGoogle}
        logoutSpotify={logoutSpotify}
        lyricsProviderOrder={lyricsProviderOrder}
        moveLyricsProvider={moveLyricsProvider}
        sessionStatus={sessionStatus}
        setAudioQualitySetting={setAudioQualitySetting}
        setNotice={setNotice}
        setSetting={setSetting}
        setSettingsOpen={setSettingsOpen}
        setSettingsPage={setSettingsPage}
        settings={settings}
        settingsLoading={settingsLoading}
        settingsOpen={settingsOpen}
        settingsPage={settingsPage}
        spotifyProfile={spotifyProfile}
        spotifyStatus={spotifyStatus}
      />
      {infoItem && (
        <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setInfoItem(null)}>
          <div className="detail-panel info-panel" onClick={(event) => event.stopPropagation()}>
            <button className="close-button" title="Close" aria-label="Close" onClick={() => setInfoItem(null)}>
              ×
            </button>
            <p className="eyebrow">Song details</p>
            <h2>{infoItem.title || "Untitled"}</h2>
            <p className="muted-copy">{infoItem.subtitle}</p>
            <div className="info-grid">
              <span>Type</span>
              <strong>{infoItem.kind}</strong>
              <span>Video ID</span>
              <strong>{infoItem.videoId || "Not available"}</strong>
              <span>Explicit</span>
              <strong>{infoItem.explicit ? "Yes" : "No"}</strong>
              <span>Music video type</span>
              <strong>{infoItem.musicVideoType || "Not reported"}</strong>
              {infoItem.artists.length > 0 && (
                <>
                  <span>Artists</span>
                  <strong>{infoItem.artists.map((value) => value.name).join(", ")}</strong>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <DetailScreen
        audioQuality={audioQuality}
        detail={detail}
        detailArtistSubscribed={detailArtistSubscribed}
        detailMoreLoading={detailMoreLoading}
        detailRefreshing={detailRefreshing}
        loadDetailMore={loadDetailMore}
        openDetailItem={openDetailItem}
        openMenu={openMenu}
        refreshPodcastDetail={refreshPodcastDetail}
        setDetail={setDetail}
        settings={settings}
        toggleDetailArtistSubscription={toggleDetailArtistSubscription}
      />
      <PlaylistScreen
        audioQuality={audioQuality}
        loadPlaylistMore={loadPlaylistMore}
        openMenu={openMenu}
        playItem={playItem}
        playlist={playlist}
        selectedItems={selectedItems}
        selectionMode={selectionMode}
        setPlaylist={setPlaylist}
        settings={settings}
        toggleSelectedItem={toggleSelectedItem}
      />
      <PlayerBar
        adjustVolumeByWheel={adjustVolumeByWheel}
        audioRef={audioRef}
        autoMixEnabledRef={autoMixEnabledRef}
        clearSleepTimer={clearSleepTimer}
        cycleRepeat={cycleRepeat}
        durationSeconds={durationSeconds}
        flushPlaytime={flushPlaytime}
        formatTime={formatTime}
        isPlaying={isPlaying}
        loadAutomixItems={loadAutomixItems}
        lyrics={lyrics}
        openLyrics={openLyrics}
        openPlayerMenu={openPlayerMenu}
        playbackSeconds={playbackSeconds}
        player={player}
        playerItemState={playerItemState}
        playItem={playItem}
        playQueueIndex={playQueueIndex}
        playtimeRef={playtimeRef}
        queueContinuation={queueContinuation}
        queueIndex={queueIndex}
        queueItems={queueItems}
        recordPlaytime={recordPlaytime}
        recoverStream={recoverStream}
        repeatMode={repeatMode}
        seekPlayback={seekPlayback}
        setDurationSeconds={setDurationSeconds}
        setIsPlaying={setIsPlaying}
        setLyricsAutoScrollEnabled={setLyricsAutoScrollEnabled}
        setNotice={setNotice}
        setPlaybackSeconds={setPlaybackSeconds}
        setPlayer={setPlayer}
        setPlayerExpanded={setPlayerExpanded}
        setQueueContinuation={setQueueContinuation}
        setQueueItems={setQueueItems}
        setQueueOpen={setQueueOpen}
        settings={settings}
        shareItem={shareItem}
        shuffleEnabled={shuffleEnabled}
        sleepTimerEndOfSong={sleepTimerEndOfSong}
        togglePlayback={togglePlayback}
        togglePlayerFavorite={togglePlayerFavorite}
        toggleShuffle={toggleShuffle}
        updateVolume={updateVolume}
        volume={volume}
      />
      <QueuePanel
        clearQueue={clearQueue}
        moveQueueItem={moveQueueItem}
        player={player}
        playQueueIndex={playQueueIndex}
        queueIndex={queueIndex}
        queueItems={queueItems}
        queueOpen={queueOpen}
        removeQueueItem={removeQueueItem}
        setQueueOpen={setQueueOpen}
      />
      <ExpandedPlayer
        activeLyricIndex={activeLyricIndex}
        activeLyricRef={activeLyricRef}
        adjustVolumeByWheel={adjustVolumeByWheel}
        audioRef={audioRef}
        backStack={navHistory.back}
        changeLyricsProvider={changeLyricsProvider}
        cycleRepeat={cycleRepeat}
        durationSeconds={durationSeconds}
        formatTime={formatTime}
        forwardStack={navHistory.forward}
        goBack={goBack}
        hasTransientLayer={hasTransientLayer}
        isPlaying={isPlaying}
        lyrics={lyrics}
        lyricsContainerRef={lyricsContainerRef}
        lyricsProviderLoading={lyricsProviderLoading}
        lyricsProviderOrder={lyricsProviderOrder}
        lyricsProviderSelection={lyricsProviderSelection}
        navigateForward={navigateForward}
        openLyrics={openLyrics}
        openPlayerMenu={openPlayerMenu}
        playbackSeconds={playbackSeconds}
        player={player}
        playerExpanded={playerExpanded}
        playerItemState={playerItemState}
        playQueueIndex={playQueueIndex}
        queueContinuation={queueContinuation}
        queueIndex={queueIndex}
        queueItems={queueItems}
        repeatMode={repeatMode}
        seekByPlayerGesture={seekByPlayerGesture}
        seekPlayback={seekPlayback}
        setLyrics={setLyrics}
        setLyricsAutoScrollEnabled={setLyricsAutoScrollEnabled}
        setPlayerExpanded={setPlayerExpanded}
        setQueueOpen={setQueueOpen}
        shareItem={shareItem}
        shuffleEnabled={shuffleEnabled}
        togglePlayback={togglePlayback}
        togglePlayerFavorite={togglePlayerFavorite}
        toggleShuffle={toggleShuffle}
        updateVolume={updateVolume}
        volume={volume}
      />
      <LyricsPanel
        activeLyricIndex={activeLyricIndex}
        activeLyricRef={activeLyricRef}
        audioRef={audioRef}
        backStack={navHistory.back}
        changeLyricsProvider={changeLyricsProvider}
        forwardStack={navHistory.forward}
        goBack={goBack}
        hasTransientLayer={hasTransientLayer}
        lyrics={lyrics}
        lyricsContainerRef={lyricsContainerRef}
        lyricsProviderLoading={lyricsProviderLoading}
        lyricsProviderOrder={lyricsProviderOrder}
        lyricsProviderSelection={lyricsProviderSelection}
        navigateForward={navigateForward}
        playerExpanded={playerExpanded}
        setLyrics={setLyrics}
        setLyricsAutoScrollEnabled={setLyricsAutoScrollEnabled}
      />
    </div>
  );
}

export default App;
