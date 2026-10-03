import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { listenEvent } from "./lib/events";
import { invokeCancellable } from "./lib/cancellable";
import { isIpcErrorCode } from "./lib/ipcError";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import "./App.css";
import { parseAudioQuality, streamRequest } from "./lib/audioQuality";
import { appendNewPlayable, removeAt } from "./lib/queue";
import { playbackEffectKey, resumeStartPosition, shouldAutoplay, startOccurrence } from "./lib/playbackSession";
import { restoreQueue, restoreSession } from "./lib/persistentPlayback";
import { errorMessage, shuffled } from "./lib/util";
import { mediaSrc } from "./lib/media";
import {
  LibraryItemState,
  LibrarySongFilter,
  LibrarySort,
  NavKey,
  PersistentPlayback,
  PlayerPayload,
  PlaylistContinuationPage,
  QueuePage,
  SettingEntry,
  SpotifyTrackItem,
  SpotifyTrackMatch,
  YtItem,
} from "./types";
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
  isValidRoute,
  routeFromView,
  routeKey,
  routePath,
  sameRoute,
  StatsPeriod,
  topLevelOf,
} from "./app/routes";
import { Layer, LayerState, topmostLayer } from "./app/layers";
import { LAST_ROUTE_KEY, parseLastRoute, serializeLastRoute } from "./app/lastRoute";
import { parseLink } from "./app/links";
import { canPerform, itemMenuEntries, MenuAction, MenuContext } from "./app/capabilities";
import { ItemMenu } from "./features/menu/ItemMenu";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { indexOfOccurrence } from "./lib/identity";
import { NoticeStack } from "./components/NoticeStack";
import { Destructive, DestructiveSpec, runDestructive } from "./app/destructive";
import { useConfirm } from "./features/confirm/useConfirm";
import { ConfirmDialog } from "./features/confirm/ConfirmDialog";
import { captureScreenState, ScreenState, screenStateMatches } from "./app/screenState";
import { useResourceCache } from "./data/useResource";
import type { DetailRef, PodcastFilter, TopPeriod } from "./data/keys";
import { useHomeData } from "./features/home/useHomeData";
import { useSearchData } from "./features/search/useSearchData";
import { useLibraryData } from "./features/library/useLibraryData";
import { useHistoryData } from "./features/history/useHistoryData";
import { useDetailData } from "./features/detail/useDetailData";
import { playlistIdOf, usePlaylistData } from "./features/playlist/usePlaylistData";
import { RecapDialog } from "./features/stats/RecapDialog";
import { ItemInfoDialog } from "./features/menu/ItemInfoDialog";
import { LogoutDialog } from "./features/accounts/LogoutDialog";
import { CreatePlaylistDialog } from "./features/playlist/CreatePlaylistDialog";
import { PlaylistPickerDialog } from "./features/playlist/PlaylistPickerDialog";
import { ArtistPickerDialog } from "./features/menu/ArtistPickerDialog";
import { SleepTimerDialog } from "./features/player/SleepTimerDialog";
import { SpeedDialDialog } from "./features/home/SpeedDialDialog";
import { EditItemDialog } from "./features/library/EditItemDialog";
import { YoutubeMatchDialog } from "./features/spotify/YoutubeMatchDialog";
import { SpotifyAddDialog } from "./features/spotify/SpotifyAddDialog";
import { SelectionBar } from "./features/selection/SelectionBar";

function App() {
  const { notices, setNotice, dismiss: dismissNotice } = useNotice();
  // Removing or deleting anything goes through one policy: confirm, optimistic change, rollback, undo (U4-012).
  const { confirmRequest, confirm, answerConfirm } = useConfirm();
  const destructive: Destructive = useCallback(
    (spec: DestructiveSpec) => runDestructive(spec, { confirm, notify: setNotice }),
    [confirm, setNotice],
  );
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
  } = useDownloads({ audioQuality, setNotice, settings, destructive });
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
  const {
    selectedItems,
    isSelected,
    clearSelected,
    selectionMode,
    setSelectionMode,
    toggleSelectedItem,
    closeSelection,
  } = useSelection();
  const [active, setActive] = useState<NavKey>("home");
  const [navHistory, setNavHistory] = useState<NavHistory>(EMPTY_HISTORY);
  const pageScrollRef = useRef<HTMLDivElement>(null);
  // Scroll offset to restore once the page shown by back/forward has rendered (U4-004).
  const pendingScrollRef = useRef<number | null>(null);
  // Server state lives in the resource cache and the feature data hooks (U4-008); App keeps view state.
  const cache = useResourceCache();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const [historySource, setHistorySource] = useState<HistorySource>("local");
  const [historyQuery, setHistoryQuery] = useState("");
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>("all");
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
  } = usePlaylists({ sessionStatus, setNotice, clearSelected, setSelectionMode, settings });
  const [topPeriod, setTopPeriod] = useState<TopPeriod>("all");
  const topSize = 50;
  const [podcastFilter, setPodcastFilter] = useState<PodcastFilter>("episodes");
  const [podcastRefreshing, setPodcastRefreshing] = useState(false);
  const { home, homeMoreLoading, loadHome, loadHomeMore, speedDial, loadSpeedDial } = useHomeData({ cache, setNotice });
  const { search, searchMoreLoading, loadSearch, clearSearch, loadSearchMore, searchHistory, loadSearchHistory } =
    useSearchData({ cache, setNotice, submittedQuery });
  const { library, libraryMixSongs, loadLibrary, loadPodcastItems, markLibraryLoading } = useLibraryData({
    cache,
    libraryMode,
    podcastFilter,
    topPeriod,
    topSize,
  });
  const { history, remoteHistory, stats, loadHistory, loadRemoteHistory, loadStats } = useHistoryData({
    cache,
    googleSignedIn: sessionStatus.authenticated,
    statsPeriod,
  });
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
  // Which detail page and playlist are open is view state; their data comes from the cache (U4-008).
  const [detailRef, setDetailRef] = useState<DetailRef | null>(null);
  const [openPlaylist, setOpenPlaylist] = useState<YtItem | null>(null);
  const {
    detail,
    loadDetail,
    loadDetailMore,
    detailMoreLoading,
    refreshPodcastDetail,
    detailRefreshing,
    detailArtistSubscribed,
    setDetailArtistSubscribed,
  } = useDetailData({ cache, detailRef, setNotice });
  const { playlist, setPlaylistData, loadPlaylist, reloadPlaylist, loadPlaylistMore } = usePlaylistData({
    cache,
    openPlaylist,
    setNotice,
  });
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
  } = useSpotifyLibrary({ audioQuality, setMenuItem, setNotice, setSpotifyProfile, spotifyStatus, destructive });
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
    setDetailRef(null);
    setOpenPlaylist(null);
    setInfoItem(null);
  };

  // An open album, playlist or Spotify screen scrolls inside its own panel; everything else scrolls the page.
  const nestedScreenOpen =
    detailRef !== null || openPlaylist !== null || spotifyOpenPlaylist !== null || spotifyLikedOpen;
  const scrollElement = (): HTMLElement | null =>
    nestedScreenOpen ? document.querySelector<HTMLElement>("[data-screen-scroll]") : pageScrollRef.current;

  /** The page being shown, as a history entry (route, selected tab, scroll offset, filters and sorts). */
  const currentEntry = (): HistoryEntry => ({
    route: pageRoute,
    tab: active,
    scrollTop: scrollElement()?.scrollTop ?? 0,
    screen: captureScreenState(pageRoute, {
      library: {
        search: librarySearch,
        sort: librarySort,
        sortDescending: librarySortDescending,
        mixSort: libraryMixSort,
        mixSortDescending: libraryMixSortDescending,
        view: libraryView,
        podcastFilter,
        topPeriod,
        playlistSearch,
        playlistSort,
        playlistSortDescending,
        playlistView,
      },
      history: { query: historyQuery },
      spotify: { query: spotifyDetailQuery, sort: spotifyDetailSort, descending: spotifyDetailSortDescending },
    }),
  });

  /** Puts back the filters, sorts and layout a screen had when it was left (U4-010). */
  const applyScreenState = (screen: ScreenState) => {
    switch (screen.kind) {
      case "library": {
        const state = screen.state;
        setLibrarySearch(state.search);
        setLibrarySort(state.sort);
        setLibrarySortDescending(state.sortDescending);
        setLibraryMixSort(state.mixSort);
        setLibraryMixSortDescending(state.mixSortDescending);
        setLibraryView(state.view);
        setPodcastFilter(state.podcastFilter);
        setTopPeriod(state.topPeriod);
        setPlaylistSearch(state.playlistSearch);
        setPlaylistSort(state.playlistSort);
        setPlaylistSortDescending(state.playlistSortDescending);
        setPlaylistView(state.playlistView);
        return;
      }
      case "history":
        setHistoryQuery(screen.state.query);
        return;
      case "spotify":
        setSpotifyDetailQuery(screen.state.query);
        setSpotifyDetailSort(screen.state.sort);
        setSpotifyDetailSortDescending(screen.state.descending);
        return;
    }
  };

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
    // In the same update as the route, so the screen loads once, with the filters it was left with.
    if (screenStateMatches(entry.route, entry.screen)) applyScreenState(entry.screen);
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
    confirm: confirmRequest !== null,
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
      case "confirm":
        return answerConfirm(false);
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
        return setOpenPlaylist(null);
      case "detail":
        return setDetailRef(null);
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
      setNotice(`Spotify track could not be opened in YouTube Music: ${errorMessage(error)}`, "error");
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
      setNotice(`Settings could not be loaded: ${errorMessage(error)}`, "error");
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
      setNotice(`Account logout failed: ${errorMessage(error)}`, "error");
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
        "warning",
      );
      if (active === "library" && libraryMode === "liked") void loadLibrary("liked");
      closeSelection();
    } catch (error) {
      setNotice(`Selected like update failed: ${errorMessage(error)}`, "error");
    }
  };

  const downloadSelectedItems = () => {
    downloadItems(selectedItems);
    closeSelection();
  };

  const removeSelectedDownloads = async () => {
    if (await removeDownloads(selectedItems)) closeSelection();
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
      setNotice(`Local audio import failed: ${errorMessage(error)}`, "error");
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
      setNotice(`Saved podcast refresh failed: ${errorMessage(error)}`, "error");
    } finally {
      setPodcastRefreshing(false);
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
    markLibraryLoading(mode);
    // One notification per sync: progress first, then replaced by the outcome (same key, U4-013).
    const noticeKey = `library-sync:${syncKey}`;
    const sync = new AbortController();
    setNotice({
      kind: "progress",
      key: noticeKey,
      message: "Syncing your library with YouTube Music…",
      progress: { value: 0 },
      action: { label: "Cancel", run: () => sync.abort() },
    });
    try {
      const syncMode = mode === "songs" ? "library" : mode;
      const result = await invokeCancellable<{ likedSongs: number; librarySongs: number; uploadedSongs: number }>(
        "sync_youtube_library",
        { mode: syncMode },
        sync.signal,
      );
      lastLibrarySyncRef.current[syncMode] = Date.now();
      await loadLibrary(mode);
      setNotice({
        kind: "success",
        key: noticeKey,
        message: `YouTube Music sync finished: ${mode === "liked" ? result.likedSongs : mode === "uploaded" ? result.uploadedSongs : result.librarySongs} songs.`,
      });
    } catch (error) {
      if (isIpcErrorCode(error, "cancelled")) {
        setNotice({ kind: "info", key: noticeKey, message: "YouTube Music sync cancelled." });
        await loadLibrary(mode);
        return;
      }
      setNotice({
        kind: "error",
        key: noticeKey,
        message: `YouTube Music ${mode} sync failed: ${errorMessage(error)}`,
        action: { label: "Retry", run: () => syncLibraryMode(mode) },
      });
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

  const openLocalPlaylist = async (item: YtItem, { reuse = false }: { reuse?: boolean } = {}) => {
    setDetailRef(null);
    setOpenPlaylist(item);
    const outcome = await loadPlaylist(item, { reuse });
    if (outcome.status === "error") {
      setOpenPlaylist((current) => (current && playlistIdOf(current) === playlistIdOf(item) ? null : current));
      setNotice(`Playlist could not be opened: ${outcome.error}`, "error");
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
    // A pasted page link opens that page straight away, so Back returns to where the link was pasted (U4-007).
    if (parseLink(value)?.kind !== "route") navigateTo("search_input");
    await searchFor(value);
  };

  /**
   * Loads search results for `value` on the search page. Typed searches (`typed`) are recorded in the search history and
   * open a pasted link; a search shown again from history only shows the link in the box.
   */
  const searchFor = async (value: string, typed = true) => {
    const record = typed;
    setSubmittedQuery(value);
    if (record && settings.pauseSearchHistory !== true)
      void invoke("search_history_add", { query: value })
        .then(() => loadSearchHistory())
        .catch(() => undefined);
    const link = parseLink(value);
    if (link) {
      clearSearch(value);
      if (!typed) return;
      if (link.kind === "video") {
        await openItem({
          id: link.videoId,
          kind: "song",
          title: "YouTube video",
          subtitle: value,
          artists: [],
          videoId: link.videoId,
        });
      } else if (link.kind === "route") {
        await openRoute(link.route);
      } else {
        setNotice(`Spotify ${link.type} links cannot be opened directly. Search for it by name instead.`, "warning");
      }
      return;
    }
    // Back/forward to a search shows the results as they were left (U4-010); a typed search fetches them again.
    await loadSearch(value, { reuse: !typed });
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
      setNotice(`Share unavailable: ${errorMessage(error)}`, "error");
    }
  };

  const copyLink = async (item: YtItem) => {
    if (!item.videoId) {
      setNotice("This item has no source link to copy.", "warning");
      return;
    }
    try {
      await navigator.clipboard.writeText(`https://music.youtube.com/watch?v=${encodeURIComponent(item.videoId)}`);
      setNotice("Meld link copied to clipboard.");
    } catch (error) {
      setNotice(`Copy link unavailable: ${errorMessage(error)}`, "error");
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
        "warning",
      );
    } catch (error) {
      setNotice(`Meld Liked Songs update failed: ${errorMessage(error)}`, "error");
    }
  };

  // Redacted resolver report (which sources were tried and why they failed; no URLs, cookies or e-mails).
  const copyPlaybackReport = async (videoId: string) => {
    try {
      const report = await invoke<string>("ytm_playback_report", { videoId });
      await navigator.clipboard.writeText(`${report}\nSource: ${player?.payload.sourceClient ?? "cache or unknown"}`);
      setNotice("Playback report copied.");
    } catch (error) {
      setNotice(`Could not copy the playback report: ${errorMessage(error)}`, "error");
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

  // What the open menu offers (U4-011). Null while no menu is open.
  const menuContext: MenuContext | null = menuItem
    ? {
        surface: playerMenuOpen ? "player" : "item",
        googleSignedIn: sessionStatus.authenticated,
        spotifySignedIn: spotifyStatus.authenticated,
        localContext: isLocalLibraryMenuContext(menuItem),
        playbackCacheList: active === "library" && libraryMode === "cache",
        openPlaylistId: playlist?.data.playlist.id ?? null,
        state: menuState,
        download: menuDownload,
        spotifyMatch: menuSpotifyMatch !== null,
        playbackSpeed,
      }
    : null;

  /** Runs a menu entry. Entries that are not item actions (player settings, Spotify) are handled here. */
  const runMenuAction = (action: MenuAction, item: YtItem) => {
    switch (action) {
      case "advanced_playback":
        setMenuItem(null);
        setPlayerMenuOpen(false);
        setSpeedDialogOpen(true);
        return;
      case "sleep_timer":
        setMenuItem(null);
        setPlayerMenuOpen(false);
        setSleepTimerMinutes(sleepTimerDefault);
        setSleepTimerOpen(true);
        return;
      case "playback_report":
        if (item.videoId) void copyPlaybackReport(item.videoId);
        return;
      case "spotify_add":
        void beginSpotifyAdd(item);
        return;
      default:
        void performMenuAction(action, item);
    }
  };

  const performMenuAction = async (action: MenuAction, item: YtItem) => {
    // A menu that went stale (sign-out, finished download) must not run an action it no longer offers.
    if (!menuContext || !canPerform(action, item, menuContext)) {
      setMenuItem(null);
      setPlayerMenuOpen(false);
      setNotice("That action is no longer available for this item.");
      return;
    }
    if (!action.startsWith("download")) setMenuItem(null);
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
      await destructive({
        severity: "disposable",
        key: `cache-remove:${item.id}`,
        commit: () => invoke("player_cache_remove", { songId: item.id }),
        refresh: () => {
          if (active === "library" && libraryMode === "cache") void loadLibrary("cache");
        },
        success: `Removed playback cache for “${item.title}”.`,
        failure: "Could not remove playback cache",
      });
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
        setNotice("Refetch requires the source video ID for this item.", "warning");
        return;
      }
      try {
        const refreshed = await invoke<YtItem | null>("library_refetch_item", { id: item.videoId });
        if (!refreshed) {
          setNotice(`Meld could not refetch metadata for “${item.title}”.`, "warning");
          return;
        }
        setPlayer((current) =>
          current?.item.id === item.id ? { ...current, item: { ...current.item, ...refreshed } } : current,
        );
        if (active === "library" && ["songs", "liked", "uploaded", "downloads", "local"].includes(libraryMode))
          void syncLibraryMode(libraryMode as "liked" | "uploaded" | "downloads" | "local" | "songs");
        setNotice(`Refetched metadata for “${refreshed.title}”.`);
      } catch (error) {
        setNotice(`Refetch failed: ${errorMessage(error)}`, "error");
      }
      return;
    }
    if (action === "delete_uploaded") {
      if (!item.videoId || !menuState.uploaded) {
        setNotice("This item is not marked as an uploaded YouTube Music song.", "warning");
        return;
      }
      const entityId = item.videoId;
      await destructive({
        severity: "permanent",
        key: `delete-uploaded:${item.id}`,
        confirm: {
          title: "Delete uploaded song?",
          message: `“${item.title}” is deleted from your YouTube Music uploads. This cannot be undone.`,
          confirmLabel: "Delete song",
        },
        commit: () => invoke("ytm_delete_uploaded_song", { entityId }),
        refresh: () => {
          if (active === "library") void syncLibraryMode("uploaded");
        },
        success: `Deleted uploaded song “${item.title}” from YouTube Music.`,
        failure: "Uploaded song deletion failed",
      });
      return;
    }
    if (action === "change_youtube_version") {
      if (!item.videoId || !menuSpotifyMatch) {
        setNotice("Change YouTube version requires the source Spotify match.", "warning");
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
        setNotice(`This ${item.kind} has no source collection browse endpoint.`, "warning");
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
        setNotice("This item has no source podcast ID for library actions.", "warning");
        return;
      }
      const name = item.albumTitle || item.title || "podcast";
      const setSaved = async (saved: boolean) => {
        await invoke("ytm_toggle_podcast_saved", {
          podcastId,
          saved,
          title: item.albumTitle || item.title || "Podcast",
          author: item.subtitle || null,
          thumbnail: item.thumbnail ?? null,
        });
        setMenuState((current) => ({ ...current, podcastSaved: saved }));
      };
      const refresh = () => {
        if (active === "library" && libraryMode === "podcasts") void loadPodcastItems(podcastFilter);
      };
      if (menuState.podcastSaved !== true) {
        try {
          await setSaved(true);
          refresh();
          setNotice(`Saved “${name}” to Podcasts.`, "success");
        } catch (error) {
          setNotice(`Podcast library update failed: ${errorMessage(error)}`, "error");
        }
        return;
      }
      await destructive({
        severity: "undoable",
        key: `podcast:${podcastId}`,
        commit: () => setSaved(false),
        undo: () => setSaved(true),
        refresh,
        success: `Removed “${name}” from Podcasts.`,
        undone: `“${name}” is back in Podcasts.`,
        failure: "Podcast library update failed",
      });
      return;
    }
    if (action === "episode_save") {
      if (item.kind !== "episode" || !item.videoId) {
        setNotice("This item is not a source podcast episode.", "warning");
        return;
      }
      const videoId = item.videoId;
      const setSaved = async (saved: boolean) => {
        await invoke("ytm_toggle_episode_saved", { videoId, saved, setVideoId: item.setVideoId ?? null, item });
        setMenuState((current) => ({ ...current, inLibrary: saved }));
      };
      const refresh = () => {
        if (active === "library" && libraryMode === "podcasts") void loadPodcastItems("episodes");
      };
      if (!menuState.inLibrary) {
        try {
          await setSaved(true);
          refresh();
          setNotice(`Saved “${item.title}” for later.`, "success");
        } catch (error) {
          setNotice(`Saved Episode update failed: ${errorMessage(error)}`, "error");
        }
        return;
      }
      await destructive({
        severity: "undoable",
        key: `episode:${item.id}`,
        commit: () => setSaved(false),
        undo: () => setSaved(true),
        refresh,
        success: `Removed “${item.title}” from Saved Episodes.`,
        undone: `“${item.title}” is saved for later again.`,
        failure: "Saved Episode update failed",
      });
      return;
    }
    if (action === "artist") {
      const artists = item.artists.filter((value) => value.id);
      if (artists.length === 0) {
        setNotice("This song has no source artist browse endpoint.", "warning");
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
        setNotice("This remote history item has no source removal token.", "warning");
        return;
      }
      const token = item.historyRemoveToken;
      await destructive({
        severity: "permanent",
        key: `remove-history:${item.id}`,
        confirm: {
          title: "Remove from YouTube Music history?",
          message: `“${item.title}” is removed from your YouTube Music watch history. This cannot be undone.`,
          confirmLabel: "Remove",
        },
        commit: () => invoke("ytm_remove_from_history", { token }),
        refresh: loadRemoteHistory,
        success: `Removed “${item.title}” from YouTube Music history.`,
        failure: `Could not remove “${item.title}” from remote history`,
      });
      return;
    }
    if (action === "meld_like") {
      const nextLiked = !menuState.liked;
      const setLiked = async (liked: boolean) => {
        await invoke("library_toggle_liked", { item, liked });
        maybeAutoDownloadOnLike(item, liked);
        if (!(await syncLikeToYoutube(item, liked)))
          setNotice("Meld Liked Songs was updated locally; Google sync could not be completed.", "warning");
      };
      const refresh = () => {
        if (active === "library" && libraryMode === "liked") void loadLibrary("liked");
      };
      if (nextLiked) {
        try {
          setMenuState((current) => ({ ...current, liked: true }));
          await setLiked(true);
          refresh();
          setNotice(`Added “${item.title}” to Meld Liked Songs.`, "success");
        } catch (error) {
          setMenuState((current) => ({ ...current, liked: false }));
          setNotice(`Meld Liked Songs update failed: ${errorMessage(error)}`, "error");
        }
        return;
      }
      await destructive({
        severity: "undoable",
        key: `meld-like:${item.id}`,
        optimistic: () => {
          setMenuState((current) => ({ ...current, liked: false }));
          return () => setMenuState((current) => ({ ...current, liked: true }));
        },
        commit: () => setLiked(false),
        undo: () => setLiked(true),
        refresh,
        success: `Removed “${item.title}” from Meld Liked Songs.`,
        undone: `“${item.title}” is back in Meld Liked Songs.`,
        failure: "Meld Liked Songs update failed",
      });
      return;
    }
    if (action === "playlist") {
      setPlaylistPickerSearch("");
      setPlaylistPickerItems([item]);
      return;
    }
    if (action === "play_next") {
      if (!item.videoId && !item.localPath) {
        setNotice(
          "This item has no playable source path or watchEndpoint videoId, so it cannot enter the queue.",
          "warning",
        );
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
        setNotice("This item is not open inside a playlist.", "warning");
        return;
      }
      // The song disappears from the open playlist at once and comes back if the removal fails.
      const optimistic = () => {
        const before = playlist;
        setPlaylistData((current) => ({
          ...current,
          data: { ...current.data, songs: current.data.songs.filter((song) => song !== item) },
        }));
        return () => {
          if (before) setPlaylistData(before);
        };
      };
      if (playlistId.startsWith("LOCAL_")) {
        await destructive({
          severity: "undoable",
          key: `playlist-remove:${playlistId}:${item.id}`,
          optimistic,
          commit: () => invoke("library_remove_from_playlist", { playlistId, songId: item.id }),
          undo: async () => {
            await invoke("library_add_to_playlist", { playlistId, item });
          },
          refresh: reloadPlaylist,
          success: `Removed “${item.title}” from the local playlist.`,
          undone: `“${item.title}” was added back at the end of the playlist.`,
          failure: "Could not remove from playlist",
        });
      } else if (item.videoId && item.setVideoId) {
        const { videoId, setVideoId } = item;
        await destructive({
          severity: "permanent",
          key: `playlist-remove:${playlistId}:${item.id}`,
          confirm: {
            title: "Remove from YouTube Music playlist?",
            message: `“${item.title}” is removed from “${playlist?.data.playlist.title ?? "this playlist"}” on YouTube Music.`,
            confirmLabel: "Remove",
          },
          optimistic,
          commit: () => invoke("ytm_remove_from_playlist", { playlistId, videoId, setVideoId }),
          refresh: reloadPlaylist,
          success: `Removed “${item.title}” from the YouTube Music playlist.`,
          failure: "Could not remove from playlist",
        });
      } else {
        setNotice("This playlist item has no source setVideoId required for removal.", "warning");
      }
      return;
    }
    if (action === "radio") {
      if (!item.videoId) {
        setNotice("This typed item has no watchEndpoint videoId, so it cannot start a radio queue.", "warning");
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
        setNotice(`Radio unavailable: ${errorMessage(error)}`, "error");
      }
      return;
    }
    if (action === "pin" || action === "unpin") {
      const setPinned = async (pinned: boolean) => {
        await invoke("speed_dial_toggle", { item, pinned });
        setMenuState((current) => ({ ...current, pinned }));
      };
      if (action === "pin") {
        try {
          await setPinned(true);
          await loadSpeedDial();
          setNotice(`Pinned “${item.title}” to Speed Dial.`, "success");
        } catch (error) {
          setNotice(`Speed Dial update failed: ${errorMessage(error)}`, "error");
        }
        return;
      }
      await destructive({
        severity: "undoable",
        key: `speed-dial:${item.id}`,
        commit: () => setPinned(false),
        undo: () => setPinned(true),
        refresh: loadSpeedDial,
        success: `Unpinned “${item.title}” from Speed Dial.`,
        undone: `Pinned “${item.title}” to Speed Dial again.`,
        failure: "Speed Dial update failed",
      });
      return;
    }
    if (action === "add_library" || action === "remove_library") {
      if (!item.videoId) {
        setNotice(
          "This typed item has no watchEndpoint videoId, so it cannot be changed in YouTube Music Library.",
          "warning",
        );
        return;
      }
      const videoId = item.videoId;
      const setInLibrary = async (inLibrary: boolean) => {
        await invoke("ytm_toggle_library", { videoId, addToLibrary: inLibrary });
        if (inLibrary) await invoke("library_save_item", { item });
        else await invoke("library_remove_item", { id: item.id });
        setMenuState((current) => ({ ...current, inLibrary }));
      };
      const refresh = () => {
        if (active !== "library") return;
        if (libraryMode === "playlists") void syncSavedPlaylists();
        else if (libraryMode === "podcasts") void loadPodcastItems(podcastFilter);
        else void loadLibrary(libraryMode);
      };
      if (action === "add_library") {
        try {
          await setInLibrary(true);
          setNotice(`Added “${item.title}” to YouTube Music library.`, "success");
        } catch (error) {
          setNotice(`YouTube Music library change failed: ${errorMessage(error)}`, "error");
        }
        return;
      }
      await destructive({
        severity: "undoable",
        key: `library:${item.id}`,
        commit: () => setInLibrary(false),
        undo: () => setInLibrary(true),
        refresh,
        success: `Removed “${item.title}” from YouTube Music library.`,
        undone: `“${item.title}” is back in your YouTube Music library.`,
        failure: "YouTube Music library change failed",
      });
      return;
    }
    if (!item.videoId) {
      setNotice("This typed item has no watchEndpoint videoId, so it cannot enter the queue.", "warning");
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
    setNotice(`Added “${item.title}” to the Meld queue.`, "success");
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
      setNotice("This typed item has no watchEndpoint videoId, so Meld cannot send it to the player.", "warning");
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
      setNotice(`Playback unavailable: ${errorMessage(error)}`, "error");
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
              setNotice(`Audio playback failed: ${errorMessage(error)}`, "error");
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
        setNotice(`Restored ${items.length} item${items.length === 1 ? "" : "s"} in the Meld queue.`, "success");
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
        setNotice(`Persistent queue could not be saved: ${errorMessage(error)}`, "error");
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
      setNotice(`Persistent playback session could not be saved: ${errorMessage(error)}`, "error");
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
        void audioRef.current
          .play()
          .catch((error) => setNotice(`Audio playback failed: ${errorMessage(error)}`, "error"));
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
      setNotice(`Queue continuation failed: ${errorMessage(error)}`, "error");
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
      listenEvent("media-prev", () => taskbarPreviousRef.current()),
      listenEvent("media-toggle", () => taskbarToggleRef.current()),
      listenEvent("media-next", () => taskbarNextRef.current()),
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

  /** Opens or plays `item`. With `reuse` (Back/forward), a page fetched a few minutes ago is shown as it was (U4-010). */
  const openItem = async (
    item: YtItem,
    sourceQueue: YtItem[] = [item],
    sourceIndex = 0,
    { reuse = false }: { reuse?: boolean } = {},
  ) => {
    setNotice("");
    const libraryQueueModes = ["mix", "songs", "liked", "uploaded", "downloads", "cache", "local", "top"];
    const playableLibraryItems = filteredLibraryData.filter((value) => value.videoId || value.localPath);
    const libraryQueue =
      active === "library" &&
      libraryQueueModes.includes(libraryMode) &&
      playableLibraryItems.some((value) => value.id === item.id)
        ? playableLibraryItems
        : sourceQueue;
    const libraryIndex = indexOfOccurrence(libraryQueue, item, libraryQueue === sourceQueue ? sourceIndex : undefined);
    if (item.localPath) {
      await playItem(item, libraryQueue, libraryIndex >= 0 ? libraryIndex : sourceIndex, null, false);
      return;
    }
    if (["album", "artist", "podcast", "browse"].includes(item.kind) && (item.browseId || item.id)) {
      const ref: DetailRef = {
        kind: item.kind as DetailRef["kind"],
        browseId: item.browseId ?? item.id,
        params: item.kind === "browse" ? (item.params ?? null) : undefined,
      };
      setOpenPlaylist(null);
      setDetailRef(ref);
      await loadDetail(
        ref,
        {
          kind: item.kind,
          title: item.title,
          subtitle: item.subtitle,
          thumbnail: item.thumbnail,
          items: [],
          browseId: ref.browseId,
        },
        { reuse },
      );
      return;
    }
    if (item.kind === "playlist" && (item.browseId || item.id)) {
      setDetailRef(null);
      setOpenPlaylist(item);
      await loadPlaylist(item, { reuse });
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
    setNotice(
      `Meld could not open this ${item.kind}: the live item did not include a supported navigation endpoint.`,
      "warning",
    );
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
        await openItem(
          {
            id: route.browseId,
            kind: route.name,
            title: "",
            subtitle: "",
            artists: [],
            browseId: route.browseId,
            params: route.name === "browse" ? route.params : undefined,
          },
          undefined,
          undefined,
          { reuse: true },
        );
        return;
      case "playlist": {
        const known = localPlaylists.find((item) => item.id === route.playlistId);
        await openLocalPlaylist(
          known ?? { id: route.playlistId, kind: "playlist", title: "Playlist", subtitle: "", artists: [] },
          { reuse: true },
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

  /** Opens a typed route (U4-003) as a new history entry. Returns false for an invalid route. */
  const openRoute = async (route: Route): Promise<boolean> => {
    if (!isValidRoute(route)) return false;
    if (route.name === "settings") {
      setSettingsPage(route.page);
      setSettingsOpen(true);
      return true;
    }
    if (!sameRoute(route, pageRoute)) pushHistory();
    await showRoute(route, active);
    return true;
  };

  const toggleDetailArtistSubscription = async () => {
    if (!detail || detail.status !== "ready" || detail.data.kind !== "artist" || !detail.data.browseId) return;
    const page = detail.data;
    const artistId = page.browseId as string;
    const name = page.title || "artist";
    const setBookmarked = async (bookmarked: boolean) => {
      await invoke("library_toggle_artist_bookmarked", {
        artistId,
        name: page.title || "Artist",
        thumbnail: page.thumbnail ?? null,
        channelId: artistId.startsWith("UC") ? artistId : null,
        bookmarked,
      });
      setDetailArtistSubscribed(bookmarked);
    };
    const refresh = () => {
      if (active === "library" && libraryMode === "artists") void loadLibrary("artists");
    };
    if (!detailArtistSubscribed) {
      try {
        await setBookmarked(true);
        refresh();
        setNotice(`Subscribed to “${name}”.`, "success");
      } catch (error) {
        setNotice(`Artist subscription update failed: ${errorMessage(error)}`, "error");
      }
      return;
    }
    await destructive({
      severity: "undoable",
      key: `artist-subscription:${artistId}`,
      commit: () => setBookmarked(false),
      undo: () => setBookmarked(true),
      refresh,
      success: `Unsubscribed from “${name}”.`,
      undone: `Subscribed to “${name}” again.`,
      failure: "Artist subscription update failed",
    });
  };

  const openDetailItem = async (item: YtItem) => {
    const detailItems = detail?.status === "ready" ? detail.data.items : [];
    const queue = detailItems.filter((value) => value.videoId || value.localPath);
    const index = indexOfOccurrence(queue, item);
    await openItem(item, queue.length > 0 ? queue : [item], index >= 0 ? index : 0);
  };

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
    detail: detailRef,
    playlistId: openPlaylist ? playlistIdOf(openPlaylist) : null,
    spotifyPlaylistId: spotifyOpenPlaylist?.id ?? null,
    spotifyLikedOpen,
  });
  const currentRoute: Route = settingsOpen ? { name: "settings", page: settingsPage } : pageRoute;
  const pageRouteKey = routeKey(pageRoute);

  // U4-006: show the last safe page again after a restart, and remember the page being shown.
  const lastRouteRestoredRef = useRef(false);
  const restoreLastRoute = useEffectEvent(() => {
    const saved = parseLastRoute(localStorage.getItem(LAST_ROUTE_KEY));
    if (saved) void showRoute(saved.route, saved.tab);
  });
  useEffect(() => restoreLastRoute(), []);
  const lastRouteValue = serializeLastRoute(pageRoute, active);
  useEffect(() => {
    // The first render still shows Home; storing it would overwrite the page that is being restored.
    if (!lastRouteRestoredRef.current) {
      lastRouteRestoredRef.current = true;
      return;
    }
    if (lastRouteValue) localStorage.setItem(LAST_ROUTE_KEY, lastRouteValue);
    else localStorage.removeItem(LAST_ROUTE_KEY);
  }, [lastRouteValue]);

  const restorePendingScroll = useEffectEvent(() => {
    const target = pendingScrollRef.current;
    const element = scrollElement();
    if (target === null || !element) return;
    element.scrollTop = target;
    // Pages that load their content keep the target until they are tall enough to reach it.
    if (Math.abs(element.scrollTop - target) < 2) pendingScrollRef.current = null;
  });
  useEffect(
    () => restorePendingScroll(),
    [
      pageRouteKey,
      home.status,
      search.status,
      library.status,
      history.status,
      detail?.status,
      playlist?.status,
      spotifyPlaylistTracks.status,
      spotifyLikedTracks.status,
    ],
  );

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
                setDetailRef(null);
                setOpenPlaylist(null);
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

        <NoticeStack notices={notices} onDismiss={dismissNotice} />

        <div className="page-scroll" ref={pageScrollRef}>
          <ErrorBoundary name="This page" resetKey={routePath(currentRoute)}>
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
                isSelected={isSelected}
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
                destructive={destructive}
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
                isSelected={isSelected}
                selectedItems={selectedItems}
                selectionMode={selectionMode}
                sessionStatus={sessionStatus}
                setHistoryQuery={setHistoryQuery}
                setHistorySource={setHistorySource}
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
                isSelected={isSelected}
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
          </ErrorBoundary>
        </div>
      </main>

      {selectionMode && selectedItems.length > 0 && (
        <SelectionBar
          closeSelection={closeSelection}
          downloadSelectedItems={downloadSelectedItems}
          likeSelectedItems={likeSelectedItems}
          loadLocalPlaylists={loadLocalPlaylists}
          playSelectedItems={playSelectedItems}
          queueSelectedItems={queueSelectedItems}
          removeSelectedDownloads={removeSelectedDownloads}
          selectedItems={selectedItems}
          setPlaylistPickerItems={setPlaylistPickerItems}
        />
      )}

      {recapOpen && stats.status === "ready" && <RecapDialog setRecapOpen={setRecapOpen} stats={stats} />}
      {spotifyAddItem && spotifyAddState && (
        <SpotifyAddDialog
          addToSpotifyPlaylist={addToSpotifyPlaylist}
          setSpotifyAddItem={setSpotifyAddItem}
          setSpotifyAddState={setSpotifyAddState}
          spotifyAddState={spotifyAddState}
        />
      )}
      <ErrorBoundary
        name="Spotify liked songs"
        variant="panel"
        resetKey={spotifyLikedOpen}
        onClose={() => setSpotifyLikedOpen(false)}
      >
        <SpotifyLikedScreen
          loadSpotifyLikedTracks={loadSpotifyLikedTracks}
          playSpotifyTrack={playSpotifyTrack}
          setSpotifyLikedOpen={setSpotifyLikedOpen}
          spotifyLikedOpen={spotifyLikedOpen}
          spotifyLikedTracks={spotifyLikedTracks}
        />
      </ErrorBoundary>
      <ErrorBoundary
        name="This Spotify playlist"
        variant="panel"
        resetKey={spotifyOpenPlaylist}
        onClose={() => setSpotifyOpenPlaylist(null)}
      >
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
      </ErrorBoundary>
      {youtubeMatchItem && (
        <YoutubeMatchDialog
          confirmYoutubeVersion={confirmYoutubeVersion}
          setYoutubeMatchItem={setYoutubeMatchItem}
          setYoutubeMatchUrl={setYoutubeMatchUrl}
          youtubeMatchItem={youtubeMatchItem}
          youtubeMatchPreview={youtubeMatchPreview}
          youtubeMatchUrl={youtubeMatchUrl}
        />
      )}
      {editItem && (
        <EditItemDialog
          active={active}
          editArtist={editArtist}
          editItem={editItem}
          editTitle={editTitle}
          reloadCurrentLibrary={reloadCurrentLibrary}
          setEditArtist={setEditArtist}
          setEditItem={setEditItem}
          setEditTitle={setEditTitle}
          setNotice={setNotice}
        />
      )}
      {menuItem && menuContext && (
        <ItemMenu
          item={menuItem}
          entries={itemMenuEntries(menuItem, menuContext)}
          onAction={runMenuAction}
          onClose={() => {
            setMenuItem(null);
            setPlayerMenuOpen(false);
          }}
        />
      )}
      {speedDialogOpen && (
        <SpeedDialDialog
          playbackSpeed={playbackSpeed}
          setPlaybackSpeed={setPlaybackSpeed}
          setSpeedDialogOpen={setSpeedDialogOpen}
          settings={settings}
        />
      )}
      {sleepTimerOpen && (
        <SleepTimerDialog
          clearSleepTimer={clearSleepTimer}
          setNotice={setNotice}
          setSleepTimerDefault={setSleepTimerDefault}
          setSleepTimerFadeOut={setSleepTimerFadeOut}
          setSleepTimerMinutes={setSleepTimerMinutes}
          setSleepTimerOpen={setSleepTimerOpen}
          setSleepTimerStopAfterCurrent={setSleepTimerStopAfterCurrent}
          sleepTimerFadeOut={sleepTimerFadeOut}
          sleepTimerMinutes={sleepTimerMinutes}
          sleepTimerStopAfterCurrent={sleepTimerStopAfterCurrent}
          startSleepTimer={startSleepTimer}
        />
      )}
      {artistPickerItem && (
        <ArtistPickerDialog
          artistPickerItem={artistPickerItem}
          openItem={openItem}
          setArtistPickerItem={setArtistPickerItem}
        />
      )}
      {playlistPickerItems && (
        <PlaylistPickerDialog
          addToSelectedPlaylist={addToSelectedPlaylist}
          openCreatePlaylistDialog={openCreatePlaylistDialog}
          playlistPickerItems={playlistPickerItems}
          playlistPickerSearch={playlistPickerSearch}
          playlistPickerSort={playlistPickerSort}
          playlistPickerSortDescending={playlistPickerSortDescending}
          setPlaylistPickerItems={setPlaylistPickerItems}
          setPlaylistPickerSearch={setPlaylistPickerSearch}
          setPlaylistPickerSort={setPlaylistPickerSort}
          setPlaylistPickerSortDescending={setPlaylistPickerSortDescending}
          visiblePlaylistPicker={visiblePlaylistPicker}
        />
      )}
      {createPlaylistOpen && (
        <CreatePlaylistDialog
          createLocalPlaylist={createLocalPlaylist}
          createSyncedPlaylist={createSyncedPlaylist}
          newPlaylistTitle={newPlaylistTitle}
          sessionStatus={sessionStatus}
          setCreatePlaylistOpen={setCreatePlaylistOpen}
          setCreateSyncedPlaylist={setCreateSyncedPlaylist}
          setNewPlaylistTitle={setNewPlaylistTitle}
          settings={settings}
        />
      )}
      {logoutDialogOpen && (
        <LogoutDialog confirmGoogleLogout={confirmGoogleLogout} setLogoutDialogOpen={setLogoutDialogOpen} />
      )}
      <ErrorBoundary name="Settings" variant="panel" resetKey={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <SettingsScreen
          destructive={destructive}
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
      </ErrorBoundary>
      {infoItem && <ItemInfoDialog infoItem={infoItem} setInfoItem={setInfoItem} />}
      <ErrorBoundary name="This page" variant="panel" resetKey={detailRef} onClose={() => setDetailRef(null)}>
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
          closeDetail={() => setDetailRef(null)}
          settings={settings}
          toggleDetailArtistSubscription={toggleDetailArtistSubscription}
        />
      </ErrorBoundary>
      <ErrorBoundary name="This playlist" variant="panel" resetKey={openPlaylist} onClose={() => setOpenPlaylist(null)}>
        <PlaylistScreen
          audioQuality={audioQuality}
          loadPlaylistMore={loadPlaylistMore}
          openMenu={openMenu}
          playItem={playItem}
          playlist={playlist}
          isSelected={isSelected}
          selectionMode={selectionMode}
          closePlaylist={() => setOpenPlaylist(null)}
          settings={settings}
          toggleSelectedItem={toggleSelectedItem}
        />
      </ErrorBoundary>
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
      <ErrorBoundary name="The queue" variant="panel" resetKey={queueOpen} onClose={() => setQueueOpen(false)}>
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
      </ErrorBoundary>
      <ErrorBoundary
        name="The full player"
        variant="panel"
        resetKey={playerExpanded}
        onClose={() => setPlayerExpanded(false)}
      >
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
      </ErrorBoundary>
      <ErrorBoundary name="Lyrics" variant="panel" resetKey={lyrics === null} onClose={() => setLyrics(null)}>
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
      </ErrorBoundary>
      <ConfirmDialog request={confirmRequest} onAnswer={answerConfirm} />
    </div>
  );
}

export default App;
