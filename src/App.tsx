import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

type NavKey = "home" | "search_input" | "library" | "history" | "stats";
type ItemKind = "song" | "episode" | "album" | "playlist" | "artist" | "podcast";

type YtItem = {
  id: string;
  kind: ItemKind | string;
  title: string;
  subtitle: string;
  thumbnail?: string | null;
  artists: { name: string; id?: string | null }[];
  browseId?: string | null;
  playlistId?: string | null;
  videoId?: string | null;
  setVideoId?: string | null;
  playPlaylistId?: string | null;
  playVideoId?: string | null;
  params?: string | null;
  explicit?: boolean;
  musicVideoType?: string | null;
  historyRemoveToken?: string | null;
  albumId?: string | null;
  albumTitle?: string | null;
  localPath?: string | null;
  duration?: number;
};

type HomeSection = {
  title: string;
  label?: string | null;
  thumbnail?: string | null;
  browseId?: string | null;
  params?: string | null;
  browseKind?: string | null;
  items: YtItem[];
};

type HomePage = { sections: HomeSection[]; continuation?: string | null };
type SearchPage = { items: YtItem[]; continuation?: string | null };
type PlaylistPage = { playlist: YtItem; songs: YtItem[]; continuation?: string | null };
type RemoteHistorySection = { title: string; songs: YtItem[] };
type RemoteHistoryPage = { sections: RemoteHistorySection[] };
type StatsRow = { item: YtItem; plays: number; minutes: number };
type StatsGroup = { id: string; title: string; subtitle: string; thumbnail?: string | null; plays: number };
type StatsPayload = { period: string; totalPlays: number; totalMinutes: number; uniqueSongs: number; rows: StatsRow[]; artists: StatsGroup[]; albums: StatsGroup[] };
type DetailPage = { kind: string; title: string; subtitle: string; thumbnail?: string | null; items: YtItem[]; continuation?: string | null };
type LyricsPayload = { provider: string; text: string; synced: boolean; matchedTitle: string; matchedArtist: string; lines: { timeMs: number; text: string }[] };
type SettingEntry = { key: string; value: string };
type SessionStatus = { authenticated: boolean; accountName?: string | null; accountEmail?: string | null; accountChannelHandle?: string | null };
type SpotifySessionStatus = { authenticated: boolean; tokenExpiry?: number | null };
type SpotifyProfile = { id: string; displayName?: string | null; avatar?: string | null };
type SpotifyPlaylistItem = { id: string; name: string; description?: string | null; image?: string | null; owner?: string | null };
type SpotifyFolderItem = { uri: string; name: string; totalChildren: number };
type SpotifyLibraryNode = { folders: SpotifyFolderItem[]; playlists: SpotifyPlaylistItem[]; totalCount: number };
type SpotifyTrackItem = { id: string; uri: string; uid?: string | null; name: string; artist: string; album: string; image?: string | null; durationMs: number };
type SpotifyLikedTracksPayload = { tracks: SpotifyTrackItem[]; totalCount: number };
type SpotifyTrackPage = { tracks: SpotifyTrackItem[]; totalCount: number; offset: number; limit: number };
type SpotifyTrackMatch = { id: string; uri: string; name: string; artist: string; durationMs: number };
type LibraryItemState = { liked: boolean; youtubeLiked: boolean; inLibrary: boolean; uploaded: boolean; pinned: boolean; podcastSaved?: boolean };
type DownloadInfo = { songId: string; path: string; bytes: number; totalBytes?: number | null; state: "downloading" | "completed" | "failed" | "cancelled" | string; error?: string | null; lyricsCached: boolean; artworkPath?: string | null };
type PlayerPayload = { videoId: string; title?: string | null; artist?: string | null; streamUrl: string; mimeType: string; bitrate: number; expiresInSeconds: number };
type QueuePage = { title?: string | null; items: YtItem[]; currentIndex?: number | null; continuation?: string | null; relatedBrowseId?: string | null; relatedParams?: string | null };

type LoadState<T> = { status: "idle" | "loading" | "ready" | "error"; data: T; error?: string };
type LibrarySongFilter = "liked" | "library" | "uploaded" | "downloaded" | "top";
type LibrarySort = "created" | "name" | "artist" | "playtime";
type PlaylistSort = "created" | "name" | "count";

const navigation: { key: NavKey; label: string; icon: string }[] = [
  { key: "home", label: "Home", icon: "⌂" },
  { key: "search_input", label: "Search", icon: "⌕" },
  { key: "library", label: "Library", icon: "▤" },
];

const secondaryNavigation: { key: NavKey; label: string; icon: string }[] = [
  { key: "history", label: "History", icon: "↺" },
  { key: "stats", label: "Stats", icon: "▥" },
];

const lyricsProviderNames = ["BetterLyrics", "Paxsenix", "LrcLib", "KuGou", "LyricsPlus", "Musixmatch", "YouTubeSubtitle", "YouTube"] as const;
const lyricProviderSettingKeys: Record<string, string> = { BetterLyrics: "enableBetterLyrics", Paxsenix: "enablePaxsenix", LrcLib: "enableLrclib", KuGou: "enableKugou", LyricsPlus: "enableLyricsPlus", Musixmatch: "enableMusixmatch" };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function noticeSummary(message: string) {
  if (message.length <= 180) return message;
  const requestDetails = message.indexOf(" for url ");
  if (requestDetails > 0) return `${message.slice(0, requestDetails)} · request details available on hover`;
  return `${message.slice(0, 177).trimEnd()}…`;
}

type ParsedYouTubeUrl = { kind: "video" | "playlist" | "album" | "artist"; id: string };

function parseYouTubeUrl(value: string): ParsedYouTubeUrl | null {
  const url = value.trim();
  const videoPatterns = [
    /(?:https?:\/\/)?(?:www\.)?(?:music\.)?youtube\.com\/watch\?.*?v=([a-zA-Z0-9_-]{11})/i,
    /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i,
  ];
  for (const pattern of videoPatterns) {
    const match = url.match(pattern);
    if (match?.[1]) return { kind: "video", id: match[1] };
  }
  const playlistMatch = url.match(/(?:https?:\/\/)?(?:www\.)?(?:music\.)?youtube\.com\/playlist\?.*?list=([a-zA-Z0-9_-]+)/i);
  if (!url.includes("music.youtube.com") && playlistMatch?.[1]) return { kind: "playlist", id: playlistMatch[1] };
  if (url.includes("music.youtube.com")) {
    if (playlistMatch?.[1]) return { kind: "album", id: playlistMatch[1] };
    const artistMatch = url.match(/(?:https?:\/\/)?(?:www\.)?music\.youtube\.com\/channel\/([a-zA-Z0-9_-]+)/i)
      ?? url.match(/(?:https?:\/\/)?(?:www\.)?music\.youtube\.com\/browse\/(MPRE[a-zA-Z0-9_-]+)/i);
    if (artistMatch?.[1]) return { kind: "artist", id: artistMatch[1] };
  }
  return null;
}

function mediaSrc(value?: string | null) {
  if (!value) return null;
  return /^(?:https?:|data:|asset:|blob:)/i.test(value) ? value : convertFileSrc(value);
}

function ItemCard({ item, onOpen, onMenu }: { item: YtItem; onOpen: (item: YtItem) => void; onMenu?: (item: YtItem) => void }) {
  return (
    <div className="item-card-shell">
      <button className="item-card" onClick={() => onOpen(item)} title={`Open ${item.kind}`}>
        <div className="item-art-wrap">
          {mediaSrc(item.thumbnail) ? <img className="item-art" src={mediaSrc(item.thumbnail) as string} alt="" loading="lazy" /> : <div className="item-art empty-art">{item.kind.slice(0, 1).toUpperCase()}</div>}
        </div>
        <strong>{item.title || "Untitled"}</strong>
        <span>{item.subtitle || item.kind}</span>
      </button>
      {onMenu && <button className="card-menu-trigger" onClick={() => onMenu(item)} title={`More options for ${item.title}`} aria-label={`More options for ${item.title}`}>⋮</button>}
    </div>
  );
}

function InlineLikeButton({ item, autoDownloadOnLike = false }: { item: YtItem; autoDownloadOnLike?: boolean }) {
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void invoke<LibraryItemState>("library_item_state", { id: item.id }).then((state) => { if (active) setLiked(state.liked); }).catch(() => undefined);
    return () => { active = false; };
  }, [item.id]);

  const toggle = async () => {
    if ((!item.videoId && !item.localPath) || busy) return;
    setBusy(true);
    try {
      const nextLiked = !liked;
      await invoke("library_toggle_liked", { item, liked: nextLiked });
      setLiked(nextLiked);
      if (autoDownloadOnLike && nextLiked && item.videoId) void invoke("download_start", { item }).catch(() => undefined);
      if (item.videoId) {
        try {
          const session = await invoke<SessionStatus>("session_status");
          if (session.authenticated) await invoke("ytm_toggle_like", { videoId: item.videoId, liked: nextLiked, item });
        } catch {
          // Meld keeps the local favorite when the optional signed-in sync is unavailable.
        }
      }
    } catch {
      // The parent menu/notice owns the detailed error surface; this button stays unchanged on failure.
    } finally {
      setBusy(false);
    }
  };

  return <button className={liked ? "inline-like liked" : "inline-like"} disabled={(!item.videoId && !item.localPath) || busy} onClick={() => void toggle()} title={liked ? "Remove from Meld Liked Songs" : "Add to Meld Liked Songs"} aria-label={liked ? `Unlike ${item.title}` : `Like ${item.title}`}>{liked ? "♥" : "♡"}</button>;
}

function Section({ section, onOpen, onMenu, shouldHide }: { section: HomeSection; onOpen: (item: YtItem) => void; onMenu: (item: YtItem) => void; shouldHide: (item: YtItem) => boolean }) {
  return (
    <section className="content-section">
      <div className="section-heading">
        <div>
          <h2>{section.title}</h2>
          {section.label && <p>{section.label}</p>}
        </div>
        {section.browseId && section.browseKind && <button className="text-button" onClick={() => onOpen({ id: section.browseId!, kind: section.browseKind!, title: section.title, subtitle: section.label ?? "", thumbnail: section.thumbnail, artists: [], browseId: section.browseId })}>Show all</button>}
      </div>
      <div className="card-row">
        {section.items.filter((item) => !shouldHide(item)).map((item) => <ItemCard key={`${item.kind}-${item.id}`} item={item} onOpen={onOpen} onMenu={onMenu} />)}
      </div>
    </section>
  );
}

function SpotifyLibraryBlock({ node, liked, folderStack, onOpenFolder, onOpenPlaylist, onOpenLiked, onBack, onRetry }: { node: LoadState<SpotifyLibraryNode>; liked: LoadState<SpotifyLikedTracksPayload>; folderStack: { uri: string; name: string }[]; onOpenFolder: (folder: SpotifyFolderItem) => void; onOpenPlaylist: (playlist: SpotifyPlaylistItem) => void; onOpenLiked: () => void; onBack: () => void; onRetry: () => void }) {
  return <section className="spotify-library-block">
    <div className="section-heading"><div><p className="eyebrow">Spotify library</p><h3>{folderStack.length > 0 ? folderStack[folderStack.length - 1].name : "Playlists"}</h3></div>{folderStack.length > 0 && <button className="text-button" onClick={onBack}>Back</button>}</div>
    {node.status === "loading" && <div className="state-panel"><div className="spinner" /><p>Loading Spotify library…</p></div>}
    {node.status === "error" && <div className="state-panel error"><h2>Spotify library unavailable</h2><p>{node.error}</p><button className="primary-button" onClick={onRetry}>Retry</button></div>}
    {node.status === "ready" && node.data.folders.length === 0 && node.data.playlists.length === 0 && <div className="state-panel"><h2>{folderStack.length > 0 ? "Folder is empty" : "No Spotify playlists"}</h2><p>Spotify returned no library items for this location.</p></div>}
    {liked.status === "ready" && liked.data.totalCount > 0 && <button className="playlist-list-row spotify-playlist-row spotify-liked-row" onClick={onOpenLiked}><span className="library-auto-icon">♥</span><span><strong>Liked Songs</strong><small>{liked.data.totalCount} Spotify saved song{liked.data.totalCount === 1 ? "" : "s"}</small></span><span aria-hidden="true">›</span></button>}
    {node.status === "ready" && <div className="spotify-library-items">
      {node.data.folders.map((folder) => <button className="playlist-list-row spotify-folder-row" key={folder.uri} onClick={() => onOpenFolder(folder)}><span className="library-auto-icon">▣</span><span><strong>{folder.name}</strong><small>{folder.totalChildren} item{folder.totalChildren === 1 ? "" : "s"}</small></span><span aria-hidden="true">›</span></button>)}
      {node.data.playlists.map((playlist) => <button className="playlist-list-row spotify-playlist-row" key={playlist.id} onClick={() => onOpenPlaylist(playlist)}><span className="item-art-wrap small-art-wrap">{mediaSrc(playlist.image) ? <img className="item-art" src={mediaSrc(playlist.image) as string} alt="" loading="lazy" /> : <span className="item-art empty-art">S</span>}</span><span><strong>{playlist.name}</strong><small>{playlist.owner ? `Spotify · ${playlist.owner}` : "Spotify playlist"}</small></span><span aria-hidden="true">›</span></button>)}
    </div>}
  </section>;
}

function App() {
  const [active, setActive] = useState<NavKey>("home");
  const [backStack, setBackStack] = useState<NavKey[]>([]);
  const [forwardStack, setForwardStack] = useState<NavKey[]>([]);
  const [home, setHome] = useState<LoadState<HomePage>>({ status: "loading", data: { sections: [] } });
  const [homeMoreLoading, setHomeMoreLoading] = useState(false);
  const [speedDial, setSpeedDial] = useState<YtItem[]>([]);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [search, setSearch] = useState<LoadState<SearchPage>>({ status: "idle", data: { items: [], continuation: null } });
  const [searchMoreLoading, setSearchMoreLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [library, setLibrary] = useState<LoadState<YtItem[]>>({ status: "idle", data: [] });
  const [libraryMixSongs, setLibraryMixSongs] = useState<YtItem[]>([]);
  const [history, setHistory] = useState<LoadState<YtItem[]>>({ status: "idle", data: [] });
  const [historySource, setHistorySource] = useState<"local" | "remote">("local");
  const [historyQuery, setHistoryQuery] = useState("");
  const [statsPeriod, setStatsPeriod] = useState<"all" | "day" | "week" | "month" | "year">("all");
  const [stats, setStats] = useState<LoadState<StatsPayload>>({ status: "idle", data: { period: "all", totalPlays: 0, totalMinutes: 0, uniqueSongs: 0, rows: [], artists: [], albums: [] } });
  const [remoteHistory, setRemoteHistory] = useState<LoadState<RemoteHistoryPage>>({ status: "idle", data: { sections: [] } });
  const [librarySyncing, setLibrarySyncing] = useState(false);
  const [libraryMode, setLibraryMode] = useState<"mix" | "local" | "songs" | "liked" | "uploaded" | "downloads" | "cache" | "top" | "playlists" | "albums" | "artists" | "podcasts">("mix");
  const [librarySongFilter, setLibrarySongFilter] = useState<LibrarySongFilter>("liked");
  const [librarySearch, setLibrarySearch] = useState("");
  const [librarySort, setLibrarySort] = useState<LibrarySort>("created");
  const [librarySortDescending, setLibrarySortDescending] = useState(true);
  const [libraryMixSort, setLibraryMixSort] = useState<"created" | "name">("created");
  const [libraryMixSortDescending, setLibraryMixSortDescending] = useState(true);
  const [libraryView, setLibraryView] = useState<"grid" | "list">("grid");
  const [playlistSearch, setPlaylistSearch] = useState("");
  const [playlistView, setPlaylistView] = useState<"grid" | "list">("grid");
  const [playlistSort, setPlaylistSort] = useState<PlaylistSort>("created");
  const [playlistSortDescending, setPlaylistSortDescending] = useState(true);
  const [topPeriod, setTopPeriod] = useState<"all" | "day" | "week" | "month" | "year">("all");
  const topSize = 50;
  const [podcastFilter, setPodcastFilter] = useState<"episodes" | "channels" | "downloaded">("episodes");
  const [localPlaylists, setLocalPlaylists] = useState<(YtItem & { songCount?: number; savedAt?: number })[]>([]);
  const [playlistPickerItems, setPlaylistPickerItems] = useState<YtItem[] | null>(null);
  const [playlistPickerSearch, setPlaylistPickerSearch] = useState("");
  const [playlistPickerSort, setPlaylistPickerSort] = useState<PlaylistSort>("name");
  const [playlistPickerSortDescending, setPlaylistPickerSortDescending] = useState(false);
  const [selectedItems, setSelectedItems] = useState<YtItem[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [artistPickerItem, setArtistPickerItem] = useState<YtItem | null>(null);
  const [editItem, setEditItem] = useState<YtItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editArtist, setEditArtist] = useState("");
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const [createSyncedPlaylist, setCreateSyncedPlaylist] = useState(false);
  const [playlist, setPlaylist] = useState<LoadState<PlaylistPage> | null>(null);
  const [detail, setDetail] = useState<LoadState<DetailPage> | null>(null);
  const [detailMoreLoading, setDetailMoreLoading] = useState(false);
  const [infoItem, setInfoItem] = useState<YtItem | null>(null);
  const [notice, setNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<"main" | "appearance" | "content" | "player" | "privacy" | "storage" | "integrations" | "about">("main");
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [settings, setSettings] = useState<Record<string, boolean>>({ hideExplicit: false, hideVideoSongs: false, useLoginForBrowse: true, enableBetterLyrics: true, enablePaxsenix: true, enableLrclib: true, enableKugou: true, enableLyricsPlus: false, enableMusixmatch: false, ytmSync: true, similarContent: true, autoLoadMore: true, disableLoadMoreWhenRepeatAll: false, autoDownloadOnLike: false, autoSkipNextOnError: false, persistentShuffleAcrossQueues: false, rememberShuffleAndRepeat: true, shufflePlaylistFirst: false, preventDuplicateTracksInQueue: false, show_liked_playlist: true, show_downloaded_playlist: true, show_uploaded_playlist: true, show_top_playlist: true, show_cached_playlist: true, varispeed: false, seekExtraSeconds: false, pauseOnMute: false, persistentQueue: true });
  const [lyricsProviderOrder, setLyricsProviderOrder] = useState<string[]>([...lyricsProviderNames]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>({ authenticated: false });
  const [spotifyStatus, setSpotifyStatus] = useState<SpotifySessionStatus>({ authenticated: false });
  const [spotifyProfile, setSpotifyProfile] = useState<SpotifyProfile | null>(null);
  const [spotifyLibrary, setSpotifyLibrary] = useState<LoadState<SpotifyLibraryNode>>({ status: "idle", data: { folders: [], playlists: [], totalCount: 0 } });
  const [spotifyFolderStack, setSpotifyFolderStack] = useState<{ uri: string; name: string }[]>([]);
  const [spotifyPlaylistTracks, setSpotifyPlaylistTracks] = useState<LoadState<SpotifyTrackPage>>({ status: "idle", data: { tracks: [], totalCount: 0, offset: 0, limit: 100 } });
  const [spotifyLikedTracks, setSpotifyLikedTracks] = useState<LoadState<SpotifyLikedTracksPayload>>({ status: "idle", data: { tracks: [], totalCount: 0 } });
  const [spotifyOpenPlaylist, setSpotifyOpenPlaylist] = useState<SpotifyPlaylistItem | null>(null);
  const [spotifyRenameName, setSpotifyRenameName] = useState("");
  const [spotifyPlaylistLoadingMore, setSpotifyPlaylistLoadingMore] = useState(false);
  const [spotifyDetailQuery, setSpotifyDetailQuery] = useState("");
  const [spotifyDetailSort, setSpotifyDetailSort] = useState<"original" | "name" | "artist" | "duration">("original");
  const [spotifyDetailSortDescending, setSpotifyDetailSortDescending] = useState(true);
  const [spotifyReorderUnlocked, setSpotifyReorderUnlocked] = useState(false);
  const [spotifyLikedOpen, setSpotifyLikedOpen] = useState(false);
  const [spotifyAddItem, setSpotifyAddItem] = useState<YtItem | null>(null);
  const [spotifyAddState, setSpotifyAddState] = useState<LoadState<{ match: SpotifyTrackMatch | null; playlists: SpotifyPlaylistItem[] }> | null>(null);
  const [menuItem, setMenuItem] = useState<YtItem | null>(null);
  const [playerMenuOpen, setPlayerMenuOpen] = useState(false);
  const [speedDialogOpen, setSpeedDialogOpen] = useState(false);
  const [menuSpotifyMatch, setMenuSpotifyMatch] = useState<SpotifyTrackMatch | null>(null);
  const [youtubeMatchItem, setYoutubeMatchItem] = useState<{ item: YtItem; match: SpotifyTrackMatch } | null>(null);
  const [youtubeMatchUrl, setYoutubeMatchUrl] = useState("");
  const [youtubeMatchPreview, setYoutubeMatchPreview] = useState<LoadState<YtItem | null> | null>(null);
  const [menuState, setMenuState] = useState<LibraryItemState>({ liked: false, youtubeLiked: false, inLibrary: false, uploaded: false, pinned: false });
  const [menuDownload, setMenuDownload] = useState<DownloadInfo | null>(null);
  const [playerItemState, setPlayerItemState] = useState<LibraryItemState | null>(null);
  const [lyrics, setLyrics] = useState<LoadState<LyricsPayload> | null>(null);
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [player, setPlayer] = useState<{ item: YtItem; payload: PlayerPayload } | null>(null);
  const [queueItems, setQueueItems] = useState<YtItem[]>([]);
  const [queueContinuation, setQueueContinuation] = useState<string | null>(null);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("off");
  const [queueIndex, setQueueIndex] = useState(-1);
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lyricsAutoScrollEnabled, setLyricsAutoScrollEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const activeLyricRef = useRef<HTMLButtonElement | null>(null);
  const automixLoadingRef = useRef(false);
  const playRequestIdRef = useRef(0);
  const activePlayerIdRef = useRef<string | null>(null);
  const seekGestureRef = useRef({ timestamp: 0, multiplier: 1 });
  const wasPlayingBeforeMuteRef = useRef(false);
  const persistentQueueLoadedRef = useRef(false);
  const persistentQueueSkipWriteRef = useRef(false);
  const [sleepTimerOpen, setSleepTimerOpen] = useState(false);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState(30);
  const [sleepTimerDefault, setSleepTimerDefault] = useState(30);
  const [sleepTimerStopAfterCurrent, setSleepTimerStopAfterCurrent] = useState(false);
  const [sleepTimerFadeOut, setSleepTimerFadeOut] = useState(false);
  const [sleepTimerExpiresAt, setSleepTimerExpiresAt] = useState<number | null>(null);
  const [sleepTimerEndOfSong, setSleepTimerEndOfSong] = useState(false);

  const closeTransientLayers = () => { setMenuItem(null); setPlayerMenuOpen(false); setSpeedDialogOpen(false); setSleepTimerOpen(false); setLyrics(null); setQueueOpen(false); setPlayerExpanded(false); setDetail(null); setPlaylist(null); setInfoItem(null); };

  const navigateTo = (next: NavKey) => {
    if (next === active) return;
    setBackStack((current) => [...current, active]);
    setForwardStack([]);
    closeTransientLayers();
    setActive(next);
  };

  const navigateBack = () => {
    const previous = backStack[backStack.length - 1];
    if (!previous) return;
    setBackStack((current) => current.slice(0, -1));
    setForwardStack((current) => [active, ...current]);
    closeTransientLayers();
    setActive(previous);
  };

  const navigateForward = () => {
    const next = forwardStack[0];
    if (!next) return;
    setForwardStack((current) => current.slice(1));
    setBackStack((current) => [...current, active]);
    closeTransientLayers();
    setActive(next);
  };

  const goBack = () => {
    if (settingsOpen) { setSettingsOpen(false); return; }
    if (lyrics) { setLyrics(null); return; }
    if (playerExpanded) { setPlayerExpanded(false); return; }
    if (queueOpen) { setQueueOpen(false); return; }
    if (menuItem) { setMenuItem(null); setPlayerMenuOpen(false); return; }
    if (detail) { setDetail(null); return; }
    if (playlist) { setPlaylist(null); return; }
    if (infoItem) { setInfoItem(null); return; }
    navigateBack();
  };

  const hasTransientLayer = Boolean(settingsOpen || lyrics || playerExpanded || queueOpen || menuItem || detail || playlist || infoItem);

  const clearSleepTimer = () => {
    setSleepTimerExpiresAt(null);
    setSleepTimerEndOfSong(false);
    setSleepTimerStopAfterCurrent(false);
    if (audioRef.current) audioRef.current.volume = volume;
  };

  const startSleepTimer = (endOfSong = false) => {
    setSleepTimerEndOfSong(endOfSong);
    setSleepTimerExpiresAt(endOfSong ? null : Date.now() + sleepTimerMinutes * 60_000);
    if (audioRef.current) audioRef.current.volume = volume;
    setSleepTimerOpen(false);
    setMenuItem(null);
    setNotice(endOfSong ? "Sleep timer will stop after the current song." : `Sleep timer set for ${sleepTimerMinutes} minutes.`);
  };

  useEffect(() => {
    if (sleepTimerExpiresAt === null && !sleepTimerEndOfSong) return;
    const timer = window.setInterval(() => {
      const remainingMs = sleepTimerExpiresAt === null ? Math.max(0, (durationSeconds - playbackSeconds) * 1000) : sleepTimerExpiresAt - Date.now();
      if (sleepTimerExpiresAt !== null && remainingMs <= 0) {
        if (sleepTimerStopAfterCurrent) {
          setSleepTimerExpiresAt(null);
          setSleepTimerEndOfSong(true);
          setSleepTimerStopAfterCurrent(false);
        } else {
          audioRef.current?.pause();
          clearSleepTimer();
        }
        return;
      }
      const multiplier = sleepTimerFadeOut ? Math.min(1, Math.max(0, remainingMs / 60_000)) : 1;
      if (audioRef.current) audioRef.current.volume = volume * multiplier;
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sleepTimerExpiresAt, sleepTimerEndOfSong, sleepTimerStopAfterCurrent, sleepTimerFadeOut, volume, durationSeconds, playbackSeconds]);

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
          if (!existing) { sections.push(nextSection); continue; }
          for (const item of nextSection.items) if (!existing.items.some((value) => value.id === item.id)) existing.items.push(item);
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
    try { setHistory({ status: "ready", data: await invoke<YtItem[]>("history_items") }); }
    catch (error) { setHistory({ status: "error", data: [], error: errorMessage(error) }); }
  };

  const loadStats = async (period = statsPeriod) => {
    setStats((current) => ({ ...current, status: "loading", error: undefined }));
    try { setStats({ status: "ready", data: await invoke<StatsPayload>("library_stats", { period }) }); }
    catch (error) { setStats({ status: "error", data: { period, totalPlays: 0, totalMinutes: 0, uniqueSongs: 0, rows: [], artists: [], albums: [] }, error: errorMessage(error) }); }
  };

  const loadRemoteHistory = async () => {
    if (!sessionStatus.authenticated) {
      setRemoteHistory({ status: "error", data: { sections: [] }, error: "Connect a Google / YouTube Music account to view remote history." });
      return;
    }
    setRemoteHistory((current) => ({ ...current, status: "loading", error: undefined }));
    try { setRemoteHistory({ status: "ready", data: await invoke<RemoteHistoryPage>("ytm_history") }); }
    catch (error) { setRemoteHistory({ status: "error", data: { sections: [] }, error: errorMessage(error) }); }
  };

  const loadSpeedDial = async () => {
    try { setSpeedDial(await invoke<YtItem[]>("speed_dial_items")); } catch (error) { setNotice(`Speed Dial unavailable: ${errorMessage(error)}`); }
  };

  const loadSearchHistory = async () => {
    try { setSearchHistory(await invoke<string[]>("search_history_items")); } catch { setSearchHistory([]); }
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

  useEffect(() => { void loadHome(); void loadSpeedDial(); void loadSearchHistory(); }, []);
  useEffect(() => { if (active === "stats") void loadStats(statsPeriod); }, [active, statsPeriod]);

  const loadSessionStatus = async () => {
    try { setSessionStatus(await invoke<SessionStatus>("session_status")); } catch (error) { setNotice(`Account status could not be read: ${errorMessage(error)}`); }
  };

  const loadSpotifyStatus = async () => {
    try { setSpotifyStatus(await invoke<SpotifySessionStatus>("spotify_session_status")); } catch (error) { setNotice(`Spotify status could not be read: ${errorMessage(error)}`); }
  };

  const loadSpotifyProfile = async () => {
    if (!spotifyStatus.authenticated) { setSpotifyProfile(null); setSpotifyLibrary({ status: "idle", data: { folders: [], playlists: [], totalCount: 0 } }); setSpotifyLikedTracks({ status: "idle", data: { tracks: [], totalCount: 0 } }); setSpotifyFolderStack([]); return; }
    try { setSpotifyProfile(await invoke<SpotifyProfile>("spotify_profile")); }
    catch (error) { setSpotifyProfile(null); setNotice(`Spotify profile could not be loaded: ${errorMessage(error)}`); }
  };

  const loadSpotifyLibrary = async (folderUri: string | null = null) => {
    if (!spotifyStatus.authenticated) return;
    setSpotifyLibrary((current) => ({ ...current, status: "loading", error: undefined }));
    try { setSpotifyLibrary({ status: "ready", data: await invoke<SpotifyLibraryNode>("spotify_library_node", { folderUri }) }); }
    catch (error) { setSpotifyLibrary({ status: "error", data: { folders: [], playlists: [], totalCount: 0 }, error: errorMessage(error) }); }
  };

  const loadSpotifyLikedTracks = async () => {
    if (!spotifyStatus.authenticated) return;
    setSpotifyLikedTracks((current) => ({ ...current, status: "loading", error: undefined }));
    try { setSpotifyLikedTracks({ status: "ready", data: await invoke<SpotifyLikedTracksPayload>("spotify_liked_tracks") }); }
    catch (error) { setSpotifyLikedTracks({ status: "error", data: { tracks: [], totalCount: 0 }, error: errorMessage(error) }); }
  };

  const openSpotifyFolder = async (folder: SpotifyFolderItem) => {
    setSpotifyFolderStack((current) => [...current, { uri: folder.uri, name: folder.name }]);
    await loadSpotifyLibrary(folder.uri);
  };

  const openSpotifyPlaylist = async (playlistItem: SpotifyPlaylistItem) => {
    setSpotifyOpenPlaylist(playlistItem);
    setSpotifyRenameName(playlistItem.name);
    setSpotifyPlaylistTracks({ status: "loading", data: { tracks: [], totalCount: 0, offset: 0, limit: 100 } });
    try { setSpotifyPlaylistTracks({ status: "ready", data: await invoke<SpotifyTrackPage>("spotify_playlist_tracks", { playlistId: playlistItem.id, offset: 0 }) }); }
    catch (error) { setSpotifyPlaylistTracks({ status: "error", data: { tracks: [], totalCount: 0, offset: 0, limit: 100 }, error: errorMessage(error) }); }
  };

  const visibleSpotifyPlaylistTracks = spotifyPlaylistTracks.status === "ready" ? [...spotifyPlaylistTracks.data.tracks].filter((track) => !spotifyDetailQuery.trim() || `${track.name} ${track.artist} ${track.album}`.toLowerCase().includes(spotifyDetailQuery.trim().toLowerCase())).sort((left, right) => {
    if (spotifyDetailSort === "original") {
      const leftIndex = spotifyPlaylistTracks.data.tracks.indexOf(left);
      const rightIndex = spotifyPlaylistTracks.data.tracks.indexOf(right);
      return spotifyDetailSortDescending ? rightIndex - leftIndex : leftIndex - rightIndex;
    }
    const leftValue = spotifyDetailSort === "duration" ? left.durationMs : spotifyDetailSort === "artist" ? left.artist.toLowerCase() : left.name.toLowerCase();
    const rightValue = spotifyDetailSort === "duration" ? right.durationMs : spotifyDetailSort === "artist" ? right.artist.toLowerCase() : right.name.toLowerCase();
    const comparison = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
    return spotifyDetailSortDescending ? -comparison : comparison;
  }) : [];

  const moveSpotifyTrack = async (track: SpotifyTrackItem, direction: "up" | "down") => {
    if (!spotifyOpenPlaylist || !track.uid || spotifyPlaylistTracks.status !== "ready") return;
    const tracks = spotifyPlaylistTracks.data.tracks;
    const index = tracks.findIndex((value) => value.uid === track.uid);
    if (index < 0) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= tracks.length) return;
    const beforeUid = direction === "up" ? tracks[targetIndex].uid : tracks[targetIndex + 1]?.uid ?? null;
    try { await invoke("spotify_move_in_playlist", { playlistId: spotifyOpenPlaylist.id, uids: [track.uid], beforeUid }); await openSpotifyPlaylist(spotifyOpenPlaylist); setNotice(`Moved “${track.name}” ${direction}.`); }
    catch (error) { setNotice(`Spotify track could not be moved: ${errorMessage(error)}`); }
  };

  const loadMoreSpotifyPlaylistTracks = async () => {
    if (!spotifyOpenPlaylist || spotifyPlaylistTracks.status !== "ready" || spotifyPlaylistLoadingMore || spotifyPlaylistTracks.data.tracks.length >= spotifyPlaylistTracks.data.totalCount) return;
    setSpotifyPlaylistLoadingMore(true);
    try { const next = await invoke<SpotifyTrackPage>("spotify_playlist_tracks", { playlistId: spotifyOpenPlaylist.id, offset: spotifyPlaylistTracks.data.tracks.length }); setSpotifyPlaylistTracks({ status: "ready", data: { ...next, tracks: [...spotifyPlaylistTracks.data.tracks, ...next.tracks] } }); }
    catch (error) { setNotice(`More Spotify tracks could not be loaded: ${errorMessage(error)}`); }
    finally { setSpotifyPlaylistLoadingMore(false); }
  };

  const renameSpotifyPlaylist = async () => {
    if (!spotifyOpenPlaylist || !spotifyRenameName.trim()) return;
    try { await invoke("spotify_rename_playlist", { playlistId: spotifyOpenPlaylist.id, newName: spotifyRenameName.trim() }); const updated = { ...spotifyOpenPlaylist, name: spotifyRenameName.trim() }; setSpotifyOpenPlaylist(updated); setNotice(`Renamed Spotify playlist to “${updated.name}”.`); await loadSpotifyLibrary(spotifyFolderStack[spotifyFolderStack.length - 1]?.uri ?? null); }
    catch (error) { setNotice(`Spotify playlist could not be renamed: ${errorMessage(error)}`); }
  };

  const removeSpotifyTrack = async (track: SpotifyTrackItem) => {
    if (!spotifyOpenPlaylist || !track.uid) { setNotice("Spotify could not remove this track because the playlist item uid was not returned."); return; }
    if (!window.confirm(`Remove “${track.name}” from “${spotifyOpenPlaylist.name}”?`)) return;
    try { await invoke("spotify_remove_from_playlist", { playlistId: spotifyOpenPlaylist.id, uid: track.uid }); setNotice(`Removed “${track.name}” from Spotify playlist.`); await openSpotifyPlaylist(spotifyOpenPlaylist); }
    catch (error) { setNotice(`Spotify track could not be removed: ${errorMessage(error)}`); }
  };

  const findYouTubeMatchForSpotifyTrack = async (track: SpotifyTrackItem) => {
    const result = await invoke<SearchPage>("ytm_search", { query: `${track.artist} ${track.name}`.trim() });
    return result.items.find((candidate) => candidate.kind === "song") ?? null;
  };

  const playSpotifyTrack = async (track: SpotifyTrackItem) => {
    try {
      const item = await findYouTubeMatchForSpotifyTrack(track);
      if (!item) { setNotice(`No YouTube Music match found for “${track.name}”.`); return; }
      setSpotifyOpenPlaylist(null);
      await openItem(item);
    } catch (error) { setNotice(`Spotify track could not be opened in YouTube Music: ${errorMessage(error)}`); }
  };

  const downloadSpotifyPlaylist = async () => {
    if (!spotifyOpenPlaylist || spotifyPlaylistTracks.status !== "ready") return;
    let queued = 0;
    let skipped = 0;
    const tracks = [...spotifyPlaylistTracks.data.tracks];
    let offset = tracks.length;
    try {
      while (offset < spotifyPlaylistTracks.data.totalCount) {
        setNotice(`Loading Spotify playlist tracks for offline download… ${offset}/${spotifyPlaylistTracks.data.totalCount}`);
        const next = await invoke<SpotifyTrackPage>("spotify_playlist_tracks", { playlistId: spotifyOpenPlaylist.id, offset });
        if (next.tracks.length === 0) break;
        tracks.push(...next.tracks);
        offset = tracks.length;
      }
      setSpotifyPlaylistTracks({ status: "ready", data: { ...spotifyPlaylistTracks.data, tracks } });
    } catch (error) {
      setNotice(`Spotify playlist pages could not be loaded: ${errorMessage(error)}`);
      return;
    }
    setNotice(`Matching Spotify playlist “${spotifyOpenPlaylist.name}” for offline download…`);
    for (const track of tracks) {
      try {
        const item = await findYouTubeMatchForSpotifyTrack(track);
        if (!item?.videoId) { skipped++; continue; }
        await invoke("download_start", { item });
        queued++;
      } catch { skipped++; }
    }
    setNotice(`Spotify playlist download queued: ${queued} track${queued === 1 ? "" : "s"}${skipped ? `; ${skipped} unmatched` : ""}.`);
  };

  const openSpotifyLiked = () => { setSpotifyLikedOpen(true); if (spotifyLikedTracks.status === "idle") void loadSpotifyLikedTracks(); };

  const loadSettings = async () => {
    setSettingsLoading(true);
    try {
      const entries = await invoke<SettingEntry[]>("settings_get");
      setSettings((current) => entries.reduce((next, entry) => ({ ...next, [entry.key]: entry.value === "true" }), current));
      const storedSleepTimerDefault = Number(entries.find((entry) => entry.key === "sleepTimerDefault")?.value ?? "30");
      if (Number.isFinite(storedSleepTimerDefault)) { setSleepTimerDefault(Math.min(120, Math.max(5, Math.round(storedSleepTimerDefault / 5) * 5))); setSleepTimerMinutes(Math.min(120, Math.max(5, Math.round(storedSleepTimerDefault / 5) * 5))); }
      const rememberShuffle = entries.find((entry) => entry.key === "rememberShuffleAndRepeat")?.value !== "false";
      const storedShuffle = entries.find((entry) => entry.key === "shuffleMode");
      setShuffleEnabled(rememberShuffle && storedShuffle?.value === "true");
      const storedRepeat = entries.find((entry) => entry.key === "repeatMode")?.value;
      if (storedRepeat === "0" || storedRepeat === "1" || storedRepeat === "2") setRepeatMode(storedRepeat === "1" ? "one" : storedRepeat === "2" ? "all" : "off");
      const storedLyricsOrder = entries.find((entry) => entry.key === "lyricsProviderOrder")?.value;
      if (storedLyricsOrder) {
        const parsed = storedLyricsOrder.split(",").map((value) => value.trim()).filter((value) => (lyricsProviderNames as readonly string[]).includes(value));
        setLyricsProviderOrder([...parsed, ...lyricsProviderNames.filter((provider) => !parsed.includes(provider))]);
      }
    } catch (error) {
      setNotice(`Settings could not be loaded: ${errorMessage(error)}`);
    } finally {
      setSettingsLoading(false);
    }
  };

  const connectGoogle = async () => {
    try { await invoke("open_google_login"); setNotice("Google sign-in opened in Meld Desktop. Finish sign-in there; Meld will validate the session before saving it."); } catch (error) { setNotice(`Google sign-in could not open: ${errorMessage(error)}`); }
  };

  const connectSpotify = async () => {
    try { await invoke("open_spotify_login"); setNotice("Spotify sign-in opened in Meld Desktop. The session is saved only after token validation."); } catch (error) { setNotice(`Spotify sign-in could not open: ${errorMessage(error)}`); }
  };

  const logoutSpotify = async () => {
    try { await invoke("spotify_logout"); setSpotifyStatus({ authenticated: false }); setSpotifyProfile(null); setNotice("Spotify account disconnected."); } catch (error) { setNotice(`Spotify logout failed: ${errorMessage(error)}`); }
  };

  const logoutGoogle = () => { setLogoutDialogOpen(true); };

  const confirmGoogleLogout = async (clearData: boolean) => {
    try {
      if (clearData) await invoke("clear_local_library_keep_downloads");
      await invoke("account_logout");
      setLogoutDialogOpen(false);
      setSessionStatus({ authenticated: false });
      setNotice(clearData ? "Google / YouTube Music account disconnected; local library data was cleared and offline downloads were kept." : "Google / YouTube Music account disconnected. Local library data was kept.");
      if (active === "library") void reloadCurrentLibrary();
    } catch (error) { setNotice(`Account logout failed: ${errorMessage(error)}`); }
  };

  const openMenu = async (item: YtItem) => {
    setPlayerMenuOpen(false);
    setMenuItem(item);
    setMenuSpotifyMatch(null);
    setMenuDownload(null);
    setLyrics(null);
    setQueueOpen(false);
    setPlayerExpanded(false);
    try {
      const itemState = await invoke<LibraryItemState>("library_item_state", { id: item.id });
      if (item.videoId) {
        void invoke<DownloadInfo | null>("download_info", { songId: item.id }).then(setMenuDownload).catch(() => setMenuDownload(null));
        void invoke<SpotifyTrackMatch | null>("spotify_match_for_youtube", { youtubeId: item.videoId }).then(setMenuSpotifyMatch).catch(() => setMenuSpotifyMatch(null));
      }
      if (item.kind === "episode" && item.albumId) {
        const podcastState = await invoke<LibraryItemState>("library_item_state", { id: item.albumId });
        setMenuState({ ...itemState, podcastSaved: podcastState.podcastSaved });
      } else setMenuState(itemState);
    } catch { setMenuState({ liked: false, youtubeLiked: false, inLibrary: false, uploaded: false, pinned: false }); }
  };

  const toggleShuffle = async () => {
    const next = !shuffleEnabled;
    setShuffleEnabled(next);
    if (settings.rememberShuffleAndRepeat === false) return;
    try { await invoke("settings_set", { key: "shuffleMode", value: String(next) }); }
    catch (error) { setShuffleEnabled(!next); setNotice(`Shuffle preference could not be saved: ${errorMessage(error)}`); }
  };

  const cycleRepeat = async () => {
    const next = repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
    setRepeatMode(next);
    try { await invoke("settings_set", { key: "repeatMode", value: next === "one" ? "1" : next === "all" ? "2" : "0" }); }
    catch (error) { setNotice(`Repeat preference could not be saved: ${errorMessage(error)}`); }
  };

  const setSetting = async (key: string, value: boolean) => {
    const previous = settings[key];
    setSettings((current) => ({ ...current, [key]: value }));
    try {
      await invoke("settings_set", { key, value: String(value) });
    } catch (error) {
      setSettings((current) => ({ ...current, [key]: previous }));
      setNotice(`Setting could not be saved: ${errorMessage(error)}`);
    }
  };

  const arrangeQueueForSettings = (items: YtItem[], currentIndex: number, originalQueueSize: number, shuffleActive = shuffleEnabled) => {
    if (!shuffleActive || items.length < 2 || currentIndex < 0 || currentIndex >= items.length) return { items, index: currentIndex };
    const shuffle = (values: number[]) => {
      for (let index = values.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
      }
      return values;
    };
    const original = shuffle([...Array(Math.min(originalQueueSize, items.length)).keys()].filter((index) => index !== currentIndex));
    const added = shuffle([...Array(items.length).keys()].filter((index) => index >= originalQueueSize && index !== currentIndex));
    const order = settings.shufflePlaylistFirst && original.length > 0 && added.length > 0
      ? [currentIndex, ...original, ...added]
      : [currentIndex, ...shuffle([...Array(items.length).keys()].filter((index) => index !== currentIndex))];
    return { items: order.map((index) => items[index]), index: 0 };
  };

  const maybeAutoDownloadOnLike = (item: YtItem, liked: boolean) => {
    if (settings.autoDownloadOnLike !== true || !liked || !item.videoId || item.localPath) return;
    void invoke("download_start", { item }).catch(() => undefined);
  };

  const shuffleQueueAfterCurrent = (items: YtItem[], currentId: string | null) => {
    if (!shuffleEnabled || !currentId) return items;
    const currentPosition = items.findIndex((item) => item.id === currentId);
    if (currentPosition < 0 || currentPosition >= items.length - 1) return items;
    const tail = items.slice(currentPosition + 1);
    for (let index = tail.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [tail[index], tail[swapIndex]] = [tail[swapIndex], tail[index]];
    }
    return [...items.slice(0, currentPosition + 1), ...tail];
  };

  const toggleSelectedItem = (item: YtItem) => {
    setSelectedItems((current) => current.some((value) => value.id === item.id) ? current.filter((value) => value.id !== item.id) : [...current, item]);
  };

  const closeSelection = () => {
    setSelectedItems([]);
    setSelectionMode(false);
  };

  const playSelectedItems = async (shuffle: boolean) => {
    if (selectedItems.length === 0) return;
    const items = shuffle ? [...selectedItems].sort(() => Math.random() - 0.5) : [...selectedItems];
    closeSelection();
    await playItem(items[0], items, 0, null);
  };

  const queueSelectedItems = (playNext: boolean) => {
    if (selectedItems.length === 0) return;
    setQueueItems((current) => {
      const currentId = queueIndex >= 0 ? current[queueIndex]?.id : null;
      const incoming = settings.preventDuplicateTracksInQueue ? selectedItems.filter((item) => !current.some((queued, index) => queued.id === item.id && index !== queueIndex)) : selectedItems;
      if (playNext && currentId) {
        const next = [...current];
        const index = next.findIndex((item) => item.id === currentId);
        next.splice(index + 1, 0, ...incoming);
        return shuffleQueueAfterCurrent(next, currentId);
      }
      return [...current, ...incoming];
    });
    setNotice(playNext ? `Queued ${selectedItems.length} selected item${selectedItems.length === 1 ? "" : "s"} to play next.` : `Added ${selectedItems.length} selected item${selectedItems.length === 1 ? "" : "s"} to the Meld queue.`);
    closeSelection();
  };

  const likeSelectedItems = async () => {
    if (selectedItems.length === 0) return;
    try {
      const states = await Promise.all(selectedItems.map((item) => invoke<LibraryItemState>("library_item_state", { id: item.id })));
      const allLiked = states.every((state) => state.liked);
      for (let index = 0; index < selectedItems.length; index += 1) {
        const item = selectedItems[index];
        const liked = !allLiked;
        await invoke("library_toggle_liked", { item, liked });
        maybeAutoDownloadOnLike(item, liked);
        if (item.videoId && sessionStatus.authenticated) await invoke("ytm_toggle_like", { videoId: item.videoId, liked, item }).catch(() => undefined);
      }
      setNotice(allLiked ? "Removed selected items from Meld Liked Songs." : "Added selected items to Meld Liked Songs.");
      if (active === "library" && libraryMode === "liked") void loadLibrary("liked");
      closeSelection();
    } catch (error) { setNotice(`Selected like update failed: ${errorMessage(error)}`); }
  };

  const downloadSelectedItems = () => {
    const downloadable = selectedItems.filter((item) => item.videoId && !item.localPath);
    downloadable.forEach((item) => void invoke("download_start", { item }).catch(() => undefined));
    setNotice(downloadable.length > 0 ? `Started offline download for ${downloadable.length} selected item${downloadable.length === 1 ? "" : "s"}.` : "No selected item has a remote source video.");
    closeSelection();
  };

  const removeSelectedDownloads = async () => {
    try {
      for (const item of selectedItems) await invoke("download_remove", { songId: item.id });
      setNotice(`Removed offline download for ${selectedItems.length} selected item${selectedItems.length === 1 ? "" : "s"}.`);
      closeSelection();
    } catch (error) { setNotice(`Selected offline download removal failed: ${errorMessage(error)}`); }
  };

  const moveLyricsProvider = async (provider: string, direction: -1 | 1) => {
    const enabled = (value: string) => value === "YouTube" || value === "YouTubeSubtitle" || settings[lyricProviderSettingKeys[value] ?? ""] === true;
    if (!enabled(provider)) return;
    const enabledOrder = lyricsProviderOrder.filter(enabled);
    const index = enabledOrder.indexOf(provider);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= enabledOrder.length) return;
    [enabledOrder[index], enabledOrder[nextIndex]] = [enabledOrder[nextIndex], enabledOrder[index]];
    const nextOrder = [...enabledOrder, ...lyricsProviderOrder.filter((value) => !enabled(value))];
    const previous = lyricsProviderOrder;
    setLyricsProviderOrder(nextOrder);
    try { await invoke("settings_set", { key: "lyricsProviderOrder", value: nextOrder.join(",") }); }
    catch (error) { setLyricsProviderOrder(previous); setNotice(`Lyrics provider order could not be saved: ${errorMessage(error)}`); }
  };

  const hideItem = (item: YtItem) => {
    const hideVideo = settings.hideVideoSongs && item.kind === "song" && !!item.musicVideoType && item.musicVideoType !== "MUSIC_VIDEO_TYPE_ATV";
    return (settings.hideExplicit && item.explicit === true) || hideVideo;
  };

  const loadLibrary = async (mode: "mix" | "local" | "songs" | "liked" | "uploaded" | "downloads" | "cache" | "top" | "albums" | "artists" = "mix") => {
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
        data = [...playlists, ...albums, ...artists].filter((item, index, values) => values.findIndex((value) => value.id === item.id) === index);
      } else {
        setLibraryMixSongs([]);
        const command = mode === "local" ? "library_local_files" : mode === "songs" ? "library_songs" : mode === "liked" ? "library_liked_songs" : mode === "uploaded" ? "library_uploaded_songs" : mode === "downloads" ? "library_downloads" : mode === "cache" ? "library_player_cache" : mode === "albums" ? "library_albums" : mode === "artists" ? "library_artists" : null;
        data = command ? await invoke<YtItem[]>(command) : await invoke<YtItem[]>("library_top_songs", { period: topPeriod, limit: topSize });
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
      setNotice(imported.length > 0 ? `Imported ${imported.length} audio file${imported.length === 1 ? "" : "s"} into Local Files.` : "No supported audio files were imported.");
    } catch (error) { setNotice(`Local audio import failed: ${errorMessage(error)}`); }
  };

  const chooseLibrarySongFilter = (filter: LibrarySongFilter) => {
    setLibrarySongFilter(filter);
    setLibraryMode(filter === "library" ? "songs" : filter === "downloaded" ? "downloads" : filter);
  };

  const shuffleLibrary = async () => {
    if (filteredLibraryData.length === 0) return;
    const items = [...filteredLibraryData].sort(() => Math.random() - 0.5);
    await playItem(items[0], items, 0, null);
  };

  const loadPodcastItems = async (filter: "episodes" | "channels" | "downloaded") => {
    if (filter === "downloaded") { setLibrary((state) => ({ ...state, status: "loading", error: undefined })); try { setLibrary({ status: "ready", data: await invoke<YtItem[]>("library_downloaded_podcasts") }); } catch (error) { setLibrary({ status: "error", data: [], error: errorMessage(error) }); } return; }
    setLibrary((state) => ({ ...state, status: "loading", error: undefined }));
    try {
      const command = filter === "episodes" ? "library_saved_podcasts" : "ytm_podcast_channels";
      setLibrary({ status: "ready", data: await invoke<YtItem[]>(command) });
    } catch (error) { setLibrary({ status: "error", data: [], error: errorMessage(error) }); }
  };

  const syncLibraryMode = async (mode: "local" | "songs" | "liked" | "uploaded" | "downloads") => {
    if (mode === "local" || mode === "downloads" || !sessionStatus.authenticated || settings.ytmSync !== true) {
      await loadLibrary(mode);
      return;
    }
    setLibrarySyncing(true);
    setLibrary((state) => ({ ...state, status: "loading", error: undefined }));
    try {
      const syncMode = mode === "songs" ? "library" : mode;
      const result = await invoke<{ likedSongs: number; librarySongs: number; uploadedSongs: number }>("sync_youtube_library", { mode: syncMode });
      await loadLibrary(mode);
      setNotice(`YouTube Music sync finished: ${mode === "liked" ? result.likedSongs : mode === "uploaded" ? result.uploadedSongs : result.librarySongs} songs.`);
    } catch (error) {
      setNotice(`YouTube Music ${mode} sync failed: ${errorMessage(error)}`);
      await loadLibrary(mode);
    } finally {
      setLibrarySyncing(false);
    }
  };

  const loadLocalPlaylists = async () => {
    try { setLocalPlaylists(await invoke<(YtItem & { songCount?: number; savedAt?: number })[]>("library_playlists")); } catch (error) { setNotice(`Playlists could not be loaded: ${errorMessage(error)}`); }
  };

  const syncSavedPlaylists = async () => {
    if (!sessionStatus.authenticated || settings.ytmSync !== true) { await loadLocalPlaylists(); return; }
    try { const result = await invoke<{ playlists: number }>("sync_youtube_library", { mode: "playlists" }); await loadLocalPlaylists(); setNotice(`YouTube Music playlist sync finished: ${result.playlists} playlists.`); } catch (error) { setNotice(`YouTube Music playlist sync failed: ${errorMessage(error)}`); await loadLocalPlaylists(); }
  };

  const reloadCurrentLibrary = async () => {
    if (libraryMode === "playlists") return syncSavedPlaylists();
    if (libraryMode === "podcasts") return loadPodcastItems(podcastFilter);
    return loadLibrary(libraryMode);
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
      if (createSyncedPlaylist) { await invoke("ytm_create_playlist", { title }); } else { await invoke("library_create_playlist", { title }); }
      await loadLocalPlaylists();
      setCreatePlaylistOpen(false);
      setNewPlaylistTitle("");
      setNotice(createSyncedPlaylist ? `Created YouTube Music playlist “${title}”.` : `Created local playlist “${title}”.`);
    } catch (error) { setNotice(`Playlist could not be created: ${errorMessage(error)}`); }
  };

  const addToSelectedPlaylist = async (playlistId: string) => {
    const items = playlistPickerItems ?? [];
    if (items.length === 0) return;
    try {
      let addedCount = 0;
      let skippedCount = 0;
      if (playlistId.startsWith("LOCAL_")) {
        for (const item of items) {
          const added = await invoke<boolean>("library_add_to_playlist", { playlistId, item });
          if (added) addedCount += 1; else skippedCount += 1;
        }
      } else {
        for (const item of items) {
          if (!item.videoId) { setNotice(`“${item.title}” has no source videoId required for a playlist add.`); return; }
          await invoke("ytm_add_to_playlist", { playlistId, videoId: item.videoId });
          addedCount += 1;
        }
      }
      setNotice(skippedCount > 0 ? `Added ${addedCount} item${addedCount === 1 ? "" : "s"}; skipped ${skippedCount} already in the playlist.` : `Added ${addedCount} selected item${addedCount === 1 ? "" : "s"} to the playlist.`);
      setPlaylistPickerItems(null);
      setSelectedItems([]);
      setSelectionMode(false);
    } catch (error) { setNotice(`Could not add selected items to playlist: ${errorMessage(error)}`); }
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
    } catch (error) { setPlaylist(null); setNotice(`Playlist could not be opened: ${errorMessage(error)}`); }
  };

  useEffect(() => {
    if (active === "library") {
      if (libraryMode === "mix") void loadLibrary("mix");
      else if (libraryMode === "playlists") { void syncSavedPlaylists(); if (spotifyStatus.authenticated) { void loadSpotifyLibrary(spotifyFolderStack[spotifyFolderStack.length - 1]?.uri ?? null); void loadSpotifyLikedTracks(); } }
      else if (libraryMode === "albums" || libraryMode === "artists" || libraryMode === "cache") void loadLibrary(libraryMode);
      else if (libraryMode === "podcasts") void loadPodcastItems(podcastFilter);
      else if (libraryMode === "top") void loadLibrary("top");
      else void syncLibraryMode(libraryMode);
    }
    if (active === "history") {
      if (historySource === "remote") void loadRemoteHistory();
      else void loadHistory();
    }
  }, [active, historySource, libraryMode, podcastFilter, topPeriod, sessionStatus.authenticated, settings.ytmSync, spotifyStatus.authenticated]);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<SessionStatus>("account-status", (event) => { setSessionStatus(event.payload); setNotice("Google / YouTube Music account connected and validated."); }).then((stop) => { unlisten = stop; });
    let stopSpotify: (() => void) | undefined;
    void listen<SpotifySessionStatus>("spotify-status", (event) => { setSpotifyStatus(event.payload); setNotice("Spotify account connected and token validated."); }).then((stop) => { stopSpotify = stop; });
    let stopAccountError: (() => void) | undefined;
    void listen<string>("account-status-error", (event) => { setNotice(`Google account validation failed: ${event.payload}`); }).then((stop) => { stopAccountError = stop; });
    let stopSpotifyError: (() => void) | undefined;
    void listen<string>("spotify-status-error", (event) => { setNotice(`Spotify account validation failed: ${event.payload}`); }).then((stop) => { stopSpotifyError = stop; });
    let stopDownload: (() => void) | undefined;
    void listen<DownloadInfo>("download-state", (event) => { setMenuDownload((current) => current?.songId === event.payload.songId ? event.payload : current); }).then((stop) => { stopDownload = stop; });
    return () => { unlisten?.(); stopSpotify?.(); stopAccountError?.(); stopSpotifyError?.(); stopDownload?.(); };
  }, []);
  useEffect(() => { void loadSessionStatus(); void loadSpotifyStatus(); void loadSettings(); }, []);
  useEffect(() => { void loadSpotifyProfile(); }, [spotifyStatus.authenticated]);
  useEffect(() => { if (settingsOpen) { void loadSettings(); void loadSessionStatus(); } }, [settingsOpen]);

  const runSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    navigateTo("search_input");
    setSubmittedQuery(value);
    if (settings.pauseSearchHistory !== true) void invoke("search_history_add", { query: value }).then(() => loadSearchHistory()).catch(() => undefined);
    const parsedUrl = parseYouTubeUrl(value);
    if (parsedUrl) {
      setSearch({ status: "idle", data: { items: [], continuation: null } });
      const item: YtItem = parsedUrl.kind === "video"
        ? { id: parsedUrl.id, kind: "song", title: "YouTube video", subtitle: value, artists: [], videoId: parsedUrl.id }
        : parsedUrl.kind === "album"
          ? { id: `MPREb_${parsedUrl.id}`, kind: "album", title: "YouTube Music album", subtitle: value, artists: [], browseId: `MPREb_${parsedUrl.id}` }
          : { id: parsedUrl.id, kind: parsedUrl.kind, title: parsedUrl.kind === "playlist" ? "YouTube playlist" : "YouTube artist", subtitle: value, artists: [], browseId: parsedUrl.id };
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
    const url = item.videoId ? `https://music.youtube.com/watch?v=${encodeURIComponent(item.videoId)}` : item.kind === "podcast" ? `https://music.youtube.com/playlist?list=${encodeURIComponent(playlistId)}` : `https://music.youtube.com/${item.kind}/${encodeURIComponent(item.id)}`;
    try {
      if (navigator.share) await navigator.share({ title: item.title, text: item.title, url });
      else { await navigator.clipboard.writeText(url); setNotice("Meld link copied to clipboard."); }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice(`Share unavailable: ${errorMessage(error)}`);
    }
  };

  const copyLink = async (item: YtItem) => {
    if (!item.videoId) { setNotice("This item has no source link to copy."); return; }
    try { await navigator.clipboard.writeText(`https://music.youtube.com/watch?v=${encodeURIComponent(item.videoId)}`); setNotice("Meld link copied to clipboard."); }
    catch (error) { setNotice(`Copy link unavailable: ${errorMessage(error)}`); }
  };

  const beginSpotifyAdd = async (item: YtItem) => {
    if (!spotifyStatus.authenticated || !item.videoId) { setNotice("Spotify playlist actions require a connected Spotify account and a source video."); return; }
    setMenuItem(null);
    setSpotifyAddItem(item);
    setSpotifyAddState({ status: "loading", data: { match: null, playlists: [] } });
    try {
      const artist = item.artists.map((value) => value.name).join(", ") || item.subtitle || "";
      const match = await invoke<SpotifyTrackMatch | null>("spotify_resolve_youtube", { youtubeId: item.videoId, title: item.title, artist, durationSec: item.duration ?? -1 });
      if (!match) { setSpotifyAddState({ status: "error", data: { match: null, playlists: [] }, error: "This YouTube song could not be matched to a Spotify track." }); return; }
      const playlists = await invoke<SpotifyPlaylistItem[]>("spotify_playlists");
      setSpotifyAddState({ status: "ready", data: { match, playlists } });
    } catch (error) { setSpotifyAddState({ status: "error", data: { match: null, playlists: [] }, error: errorMessage(error) }); }
  };

  const addToSpotifyPlaylist = async (playlist: SpotifyPlaylistItem) => {
    const match = spotifyAddState?.status === "ready" ? spotifyAddState.data.match : null;
    if (!match) return;
    try { await invoke("spotify_add_to_playlist", { playlistId: playlist.id, trackUri: match.uri }); setSpotifyAddItem(null); setSpotifyAddState(null); setNotice(`Added “${match.name}” to Spotify playlist “${playlist.name}”.`); }
    catch (error) { setNotice(`Spotify playlist add failed: ${errorMessage(error)}`); }
  };

  useEffect(() => {
    const parsed = parseYouTubeUrl(youtubeMatchUrl);
    if (!youtubeMatchItem || parsed?.kind !== "video") { setYoutubeMatchPreview(null); return; }
    let activeRequest = true;
    setYoutubeMatchPreview({ status: "loading", data: null });
    void invoke<YtItem | null>("ytm_refetch", { videoId: parsed.id }).then((item) => {
      if (!activeRequest) return;
      setYoutubeMatchPreview(item ? { status: "ready", data: item } : { status: "error", data: null, error: "Video not found" });
    }).catch((error) => { if (activeRequest) setYoutubeMatchPreview({ status: "error", data: null, error: errorMessage(error) }); });
    return () => { activeRequest = false; };
  }, [youtubeMatchItem?.item.id, youtubeMatchUrl]);

  const confirmYoutubeVersion = async () => {
    const match = youtubeMatchItem?.match;
    const preview = youtubeMatchPreview?.status === "ready" ? youtubeMatchPreview.data : null;
    if (!match || !preview?.videoId) return;
    try {
      const artist = preview.artists.map((value) => value.name).join(", ") || preview.subtitle || "";
      await invoke("spotify_override_youtube", { spotifyId: match.id, youtubeId: preview.videoId, title: preview.title, artist });
      setYoutubeMatchItem(null);
      setYoutubeMatchPreview(null);
      setNotice(`Changed the YouTube version for “${match.name}”.`);
    } catch (error) { setNotice(`YouTube version change failed: ${errorMessage(error)}`); }
  };

  const togglePlayerFavorite = async () => {
    if (!player) return;
    const current = playerItemState ?? { liked: false, youtubeLiked: false, inLibrary: false, uploaded: false, pinned: false };
    try {
      const nextLiked = !current.liked;
      await invoke("library_toggle_liked", { item: player.item, liked: nextLiked });
      setPlayerItemState({ ...current, liked: nextLiked });
      setMenuState((state) => ({ ...state, liked: nextLiked }));
      maybeAutoDownloadOnLike(player.item, nextLiked);
      let googleSyncFailed = false;
      if (player.item.videoId && sessionStatus.authenticated) {
        try { await invoke("ytm_toggle_like", { videoId: player.item.videoId, liked: nextLiked, item: player.item }); }
        catch { googleSyncFailed = true; }
      }
      if (active === "library" && libraryMode === "liked") void loadLibrary("liked");
      setNotice(googleSyncFailed ? "Meld Liked Songs was updated locally; Google sync could not be completed." : !current.liked ? `Added “${player.item.title}” to Meld Liked Songs.` : `Removed “${player.item.title}” from Meld Liked Songs.`);
    } catch (error) { setNotice(`Meld Liked Songs update failed: ${errorMessage(error)}`); }
  };

  const openPlayerMenu = async () => {
    if (!player) return;
    setPlayerMenuOpen(true);
    setMenuItem(player.item);
    setMenuDownload(null);
    setQueueOpen(false);
    try { const state = await invoke<LibraryItemState>("library_item_state", { id: player.item.id }); setPlayerItemState(state); setMenuState(state); if (player.item.videoId) void invoke<DownloadInfo | null>("download_info", { songId: player.item.id }).then(setMenuDownload).catch(() => setMenuDownload(null)); } catch { const state = { liked: false, youtubeLiked: false, inLibrary: false, uploaded: false, pinned: false }; setPlayerItemState(state); setMenuState(state); }
  };

  useEffect(() => {
    let activeRequest = true;
    if (!player) { setPlayerItemState(null); return () => { activeRequest = false; }; }
    void invoke<LibraryItemState>("library_item_state", { id: player.item.id }).then((state) => { if (activeRequest) setPlayerItemState(state); }).catch(() => { if (activeRequest) setPlayerItemState({ liked: false, youtubeLiked: false, inLibrary: false, uploaded: false, pinned: false }); });
    return () => { activeRequest = false; };
  }, [player?.item.id]);

  const openLyrics = async (item: YtItem) => {
    const artist = item.artists.map((value) => value.name).join(", ") || item.subtitle || "";
    setLyricsAutoScrollEnabled(true);
    setLyrics({ status: "loading", data: { provider: "", text: "", synced: false, matchedTitle: item.title, matchedArtist: artist, lines: [] } });
    try {
      const data = await invoke<LyricsPayload>("fetch_lyrics", { title: item.title, artist, duration: item.duration ?? -1, album: item.albumTitle ?? null, id: item.videoId ?? item.id });
      setLyrics({ status: "ready", data });
    } catch (error) {
      setLyrics({ status: "error", data: { provider: "LrcLib", text: "", synced: false, matchedTitle: item.title, matchedArtist: artist, lines: [] }, error: errorMessage(error) });
    }
  };

  const isLocalLibraryMenuContext = (item: YtItem) => Boolean(item.localPath) || (active === "library" && libraryMode !== "playlists") || (active === "history" && historySource === "local") || (playlist?.status === "ready" && playlist.data.playlist.id.startsWith("LOCAL_"));

  const performMenuAction = async (action: "open" | "play" | "share" | "copy_link" | "download" | "download_cancel" | "download_remove" | "cache_remove" | "album" | "episode_save" | "podcast_save" | "queue" | "play_next" | "radio" | "playlist" | "remove_from_playlist" | "remove_history" | "pin" | "unpin" | "artist" | "info" | "edit" | "refetch" | "delete_uploaded" | "change_youtube_version" | "meld_like" | "add_library" | "remove_library", item: YtItem) => {
    if (!action.startsWith("download")) setMenuItem(null);
    if (action === "open") return openItem(item);
    if (action === "play") return playItem(item);
    if (action === "share") return shareItem(item);
    if (action === "copy_link") return copyLink(item);
    if (action === "download") {
      if (!item.videoId || item.localPath) { setNotice("Offline download requires a remote source video."); return; }
      setMenuDownload({ songId: item.id, path: "", bytes: 0, totalBytes: null, state: "downloading", lyricsCached: false });
      setNotice(`Downloading “${item.title}” for offline playback…`);
      void invoke("download_start", { item }).then(() => setNotice(`Offline download ready for “${item.title}”.`)).catch((error) => setNotice(`Offline download failed: ${errorMessage(error)}`));
      return;
    }
    if (action === "download_cancel") {
      try { await invoke("download_cancel", { songId: item.id }); setNotice(`Cancelling offline download for “${item.title}”…`); } catch (error) { setNotice(`Could not cancel download: ${errorMessage(error)}`); }
      return;
    }
    if (action === "download_remove") {
      try { await invoke("download_remove", { songId: item.id }); setMenuDownload(null); setNotice(`Removed offline download for “${item.title}”.`); } catch (error) { setNotice(`Could not remove offline download: ${errorMessage(error)}`); }
      return;
    }
    if (action === "cache_remove") {
      try { await invoke("player_cache_remove", { songId: item.id }); setMenuItem(null); setNotice(`Removed playback cache for “${item.title}”.`); if (active === "library" && libraryMode === "cache") void loadLibrary("cache"); } catch (error) { setNotice(`Could not remove playback cache: ${errorMessage(error)}`); }
      return;
    }
    if (action === "edit") {
      setEditItem(item);
      setEditTitle(item.title);
      setEditArtist(item.subtitle);
      return;
    }
    if (action === "refetch") {
      if (!item.videoId) { setNotice("Refetch requires the source video ID for this item."); return; }
      try {
        const refreshed = await invoke<YtItem | null>("library_refetch_item", { id: item.videoId });
        if (!refreshed) { setNotice(`Meld could not refetch metadata for “${item.title}”.`); return; }
        setPlayer((current) => current?.item.id === item.id ? { ...current, item: { ...current.item, ...refreshed } } : current);
        if (active === "library" && ["songs", "liked", "uploaded", "downloads", "local"].includes(libraryMode)) void syncLibraryMode(libraryMode as "liked" | "uploaded" | "downloads" | "local" | "songs");
        setNotice(`Refetched metadata for “${refreshed.title}”.`);
      } catch (error) { setNotice(`Refetch failed: ${errorMessage(error)}`); }
      return;
    }
    if (action === "delete_uploaded") {
      if (!item.videoId || !menuState.uploaded) { setNotice("This item is not marked as an uploaded YouTube Music song."); return; }
      try {
        await invoke("ytm_delete_uploaded_song", { entityId: item.videoId });
        if (active === "library") void syncLibraryMode("uploaded");
        setNotice(`Deleted uploaded song “${item.title}” from YouTube Music.`);
      } catch (error) { setNotice(`Uploaded song deletion failed: ${errorMessage(error)}`); }
      return;
    }
    if (action === "change_youtube_version") {
      if (!item.videoId || !menuSpotifyMatch) { setNotice("Change YouTube version requires the source Spotify match."); return; }
      setMenuItem(null);
      setYoutubeMatchItem({ item, match: menuSpotifyMatch });
      setYoutubeMatchUrl("");
      setYoutubeMatchPreview(null);
      return;
    }
    if (action === "album") {
      if (!item.albumId) { setNotice(`This ${item.kind} has no source collection browse endpoint.`); return; }
      const collectionKind = item.kind === "episode" ? "podcast" : "album";
      return openItem({ id: item.albumId, kind: collectionKind, title: item.albumTitle || (collectionKind === "podcast" ? "Podcast" : "Album"), subtitle: collectionKind === "podcast" ? "Podcast" : "Album", artists: [], browseId: item.albumId });
    }
    if (action === "podcast_save") {
      const podcastId = item.albumId || (item.kind === "podcast" ? item.id : "");
      if ((!item.kind || !["episode", "podcast"].includes(item.kind)) || !podcastId) { setNotice("This item has no source podcast ID for library actions."); return; }
      const saved = menuState.podcastSaved !== true;
      try {
        await invoke("ytm_toggle_podcast_saved", { podcastId, saved, title: item.albumTitle || item.title || "Podcast", author: item.subtitle || null, thumbnail: item.thumbnail ?? null });
        setMenuState((current) => ({ ...current, podcastSaved: saved }));
        if (active === "library" && libraryMode === "podcasts") void loadPodcastItems(podcastFilter);
        setNotice(saved ? `Saved “${item.albumTitle || item.title || "podcast"}” to Podcasts.` : `Removed “${item.albumTitle || item.title || "podcast"}” from Podcasts.`);
      } catch (error) { setNotice(`Podcast library update failed: ${errorMessage(error)}`); }
      return;
    }
    if (action === "episode_save") {
      if (item.kind !== "episode" || !item.videoId) { setNotice("This item is not a source podcast episode."); return; }
      const saved = !menuState.inLibrary;
      try {
        await invoke("ytm_toggle_episode_saved", { videoId: item.videoId, saved, setVideoId: item.setVideoId ?? null, item });
        setMenuState((current) => ({ ...current, inLibrary: saved }));
        if (active === "library" && libraryMode === "podcasts") void loadPodcastItems("episodes");
        setNotice(saved ? `Saved “${item.title}” for later.` : `Removed “${item.title}” from Saved Episodes.`);
      } catch (error) { setNotice(`Saved Episode update failed: ${errorMessage(error)}`); }
      return;
    }
    if (action === "artist") {
      const artists = item.artists.filter((value) => value.id);
      if (artists.length === 0) { setNotice("This song has no source artist browse endpoint."); return; }
      if (artists.length > 1) { setArtistPickerItem(item); return; }
      const artist = artists[0];
      return openItem({ id: artist.id as string, kind: "artist", title: artist.name, subtitle: "Artist", artists: [], browseId: artist.id });
    }
    if (action === "info") { setInfoItem(item); return; }
    if (action === "remove_history") {
      if (!item.historyRemoveToken) { setNotice("This remote history item has no source removal token."); return; }
      try {
        await invoke("ytm_remove_from_history", { token: item.historyRemoveToken });
        await loadRemoteHistory();
        setNotice(`Removed “${item.title}” from YouTube Music history.`);
      } catch (error) { setNotice(`Could not remove “${item.title}” from remote history: ${errorMessage(error)}`); }
      return;
    }
    if (action === "meld_like") {
      try {
        const nextLiked = !menuState.liked;
        await invoke("library_toggle_liked", { item, liked: nextLiked });
        setMenuState((current) => ({ ...current, liked: nextLiked }));
        maybeAutoDownloadOnLike(item, nextLiked);
        let googleSyncFailed = false;
        if (item.videoId && sessionStatus.authenticated) {
          try { await invoke("ytm_toggle_like", { videoId: item.videoId, liked: nextLiked, item }); }
          catch { googleSyncFailed = true; }
        }
        if (active === "library" && libraryMode === "liked") void loadLibrary("liked");
        setNotice(googleSyncFailed ? "Meld Liked Songs was updated locally; Google sync could not be completed." : menuState.liked ? `Removed “${item.title}” from Meld Liked Songs.` : `Added “${item.title}” to Meld Liked Songs.`);
      } catch (error) { setNotice(`Meld Liked Songs update failed: ${errorMessage(error)}`); }
      return;
    }
    if (action === "playlist") { setPlaylistPickerSearch(""); setPlaylistPickerItems([item]); return; }
    if (action === "play_next") {
      if (!item.videoId && !item.localPath) { setNotice("This item has no playable source path or watchEndpoint videoId, so it cannot enter the queue."); return; }
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
      if (!playlistId) { setNotice("This item is not open inside a playlist."); return; }
      try {
        if (playlistId.startsWith("LOCAL_")) {
          await invoke("library_remove_from_playlist", { playlistId, songId: item.id });
          const songs = await invoke<YtItem[]>("library_playlist_songs", { playlistId });
          setPlaylist((current) => current ? { status: "ready", data: { ...current.data, songs } } : current);
          setNotice(`Removed “${item.title}” from the local playlist.`);
        } else if (item.videoId && item.setVideoId) {
          await invoke("ytm_remove_from_playlist", { playlistId, videoId: item.videoId, setVideoId: item.setVideoId });
          const data = await invoke<PlaylistPage>("ytm_playlist", { playlistId });
          setPlaylist({ status: "ready", data });
          setNotice(`Removed “${item.title}” from the YouTube Music playlist.`);
        } else { setNotice("This playlist item has no source setVideoId required for removal."); }
      } catch (error) { setNotice(`Could not remove from playlist: ${errorMessage(error)}`); }
      return;
    }
    if (action === "radio") {
      if (!item.videoId) { setNotice("This typed item has no watchEndpoint videoId, so it cannot start a radio queue."); return; }
      try {
        const page = await invoke<QueuePage>("ytm_next", { videoId: item.videoId, playlistId: `RDAMVM${item.videoId}`, setVideoId: item.setVideoId ?? null, index: null, params: item.params ?? null, continuation: null });
        const items = page.items.length > 0 ? page.items : [item];
        const index = Math.min(page.currentIndex ?? 0, items.length - 1);
        await playItem(items[index], items, index, page.continuation ?? null);
      } catch (error) { setNotice(`Radio unavailable: ${errorMessage(error)}`); }
      return;
    }
    if (action === "pin" || action === "unpin") {
      try { await invoke("speed_dial_toggle", { item, pinned: action === "pin" }); setMenuState((current) => ({ ...current, pinned: action === "pin" })); await loadSpeedDial(); setNotice(action === "pin" ? `Pinned “${item.title}” to Speed Dial.` : `Unpinned “${item.title}” from Speed Dial.`); } catch (error) { setNotice(`Speed Dial update failed: ${errorMessage(error)}`); }
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
          if (active === "library") { if (libraryMode === "playlists") void syncSavedPlaylists(); else if (libraryMode === "podcasts") void loadPodcastItems(podcastFilter); else void loadLibrary(libraryMode); }
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
    setQueueIndex(-1);
    setPlayer(null);
    setIsPlaying(false);
    setQueueOpen(false);
  };

  const removeQueueItem = (index: number) => {
    if (index < 0 || index >= queueItems.length) return;
    const nextItems = queueItems.filter((_, itemIndex) => itemIndex !== index);
    if (nextItems.length === 0) { clearQueue(); return; }
    const wasCurrent = index === queueIndex;
    const nextIndex = queueIndex > index ? queueIndex - 1 : wasCurrent ? Math.min(index, nextItems.length - 1) : queueIndex;
    setQueueItems(nextItems);
    setQueueIndex(nextIndex);
    if (wasCurrent) void playItem(nextItems[nextIndex], nextItems, nextIndex, null);
  };

  const moveQueueItem = (from: number, to: number) => {
    if (from < 0 || to < 0 || from >= queueItems.length || to >= queueItems.length || from === to) return;
    const nextItems = [...queueItems];
    const [moved] = nextItems.splice(from, 1);
    nextItems.splice(to, 0, moved);
    const nextIndex = queueIndex === from ? to : queueIndex > from && queueIndex <= to ? queueIndex - 1 : queueIndex >= to && queueIndex < from ? queueIndex + 1 : queueIndex;
    setQueueItems(nextItems);
    setQueueIndex(nextIndex);
  };

  const playItem = async (item: YtItem, sourceQueue: YtItem[] = [item], sourceIndex = 0, sourceContinuation: string | null = null) => {
    const requestId = ++playRequestIdRef.current;
    if (item.localPath) {
      setNotice("");
      setLyrics(null);
      setLyricsAutoScrollEnabled(true);
      setQueueItems(sourceQueue);
      setQueueContinuation(null);
      setQueueIndex(sourceIndex);
      setPlayer({ item, payload: { videoId: item.id, title: item.title, artist: item.subtitle, streamUrl: convertFileSrc(item.localPath), mimeType: "audio/*", bitrate: 0, expiresInSeconds: 0 } });
      if (settings.pauseListenHistory !== true) void invoke("history_add", { item }).then(() => { if (active === "history") void loadHistory(); }).catch(() => undefined);
      return;
    }
    if (!item.videoId) {
      setNotice("This typed item has no watchEndpoint videoId, so Meld cannot send it to the player.");
      return;
    }
    setNotice("");
    const keepInlineLyrics = playerExpanded;
    setLyrics(null);
    setLyricsAutoScrollEnabled(true);
    let nextQueue = sourceQueue;
    let nextIndex = sourceIndex;
    let nextContinuation = sourceContinuation;
    const isNewQueue = sourceQueue !== queueItems;
    const effectiveShuffle = isNewQueue && settings.persistentShuffleAcrossQueues !== true ? false : shuffleEnabled;
    if (isNewQueue && !effectiveShuffle) setShuffleEnabled(false);
    if (sourceQueue.length <= 1) {
      try {
        const queuePlaylistId = item.playPlaylistId ?? item.playlistId ?? `RDAMVM${item.videoId}`;
        const page = await invoke<QueuePage>("ytm_next", { videoId: item.videoId, playlistId: queuePlaylistId, setVideoId: item.setVideoId ?? null, index: null, params: item.params ?? null, continuation: null });
        if (requestId !== playRequestIdRef.current) return;
        const sourceItems = page.items.filter((value) => value.videoId);
        if (sourceItems.length > 0) {
          nextQueue = sourceItems.some((value) => value.id === item.id) ? sourceItems : [item, ...sourceItems.filter((value) => value.id !== item.id)];
          nextIndex = nextQueue.findIndex((value) => value.id === item.id);
          if (nextIndex < 0) { nextQueue = [item, ...sourceItems]; nextIndex = 0; }
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
    const originalQueueSize = sourceQueue.length <= 1 ? nextQueue.length : sourceQueue.length;
    const arranged = arrangeQueueForSettings(nextQueue, nextIndex, originalQueueSize, effectiveShuffle);
    nextQueue = arranged.items;
    nextIndex = arranged.index;
    setQueueItems(nextQueue);
    setQueueContinuation(nextContinuation);
    setQueueIndex(nextIndex);
    try {
      const payload = await invoke<PlayerPayload>("ytm_player", { videoId: item.videoId, playlistId: item.playlistId ?? item.playPlaylistId ?? null });
      if (requestId !== playRequestIdRef.current) return;
      setPlayer({ item, payload });
      if (keepInlineLyrics) void openLyrics(item);
      if (settings.pauseListenHistory !== true) void invoke("history_add", { item }).then(() => { if (active === "history") void loadHistory(); }).catch(() => undefined);
    } catch (error) {
      setNotice(`Playback unavailable: ${errorMessage(error)}`);
    }
  };

  useEffect(() => {
    if (!player || !audioRef.current) return;
    const playerId = player.item.id;
    activePlayerIdRef.current = playerId;
    audioRef.current.src = mediaSrc(player.payload.streamUrl) ?? player.payload.streamUrl;
    audioRef.current.volume = volume;
    audioRef.current.playbackRate = playbackSpeed;
    (audioRef.current as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = settings.varispeed !== true;
    setPlaybackSeconds(0);
    setDurationSeconds(0);
    void audioRef.current.play().then(() => { if (activePlayerIdRef.current === playerId) setIsPlaying(true); }).catch((error) => { if (activePlayerIdRef.current === playerId) { setIsPlaying(false); setNotice(`Audio playback failed: ${errorMessage(error)}`); } });
  }, [player]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.playbackRate = playbackSpeed;
    (audioRef.current as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = settings.varispeed !== true;
  }, [playbackSpeed, settings.varispeed]);

  useEffect(() => {
    if (settings.persistentQueue !== true) {
      persistentQueueLoadedRef.current = false;
      persistentQueueSkipWriteRef.current = false;
      localStorage.removeItem("meld:persistentQueue");
      return;
    }
    if (persistentQueueLoadedRef.current) return;
    persistentQueueLoadedRef.current = true;
    // The write effect runs in the same commit as this hydration effect. Skip that
    // first write so the initial in-memory queue cannot overwrite stored entries.
    persistentQueueSkipWriteRef.current = true;
    try {
      const stored = JSON.parse(localStorage.getItem("meld:persistentQueue") ?? "null") as { items?: YtItem[]; index?: number; continuation?: string | null } | null;
      const items = Array.isArray(stored?.items) ? stored.items.filter((item) => item && typeof item.id === "string" && typeof item.title === "string" && typeof item.kind === "string") : [];
      if (items.length > 0) {
        setQueueItems(items);
        setQueueIndex(typeof stored?.index === "number" ? Math.min(Math.max(stored.index, -1), items.length - 1) : -1);
        setQueueContinuation(typeof stored?.continuation === "string" ? stored.continuation : null);
        setNotice(`Restored ${items.length} item${items.length === 1 ? "" : "s"} in the Meld queue.`);
      }
    } catch {
      localStorage.removeItem("meld:persistentQueue");
    }
  }, [settings.persistentQueue]);

  useEffect(() => {
    if (settings.persistentQueue !== true) {
      localStorage.removeItem("meld:persistentQueue");
      return;
    }
    if (persistentQueueSkipWriteRef.current) {
      persistentQueueSkipWriteRef.current = false;
      return;
    }
    try {
      localStorage.setItem("meld:persistentQueue", JSON.stringify({ items: queueItems, index: queueIndex, continuation: queueContinuation }));
    } catch (error) {
      setNotice(`Persistent queue could not be saved: ${errorMessage(error)}`);
    }
  }, [settings.persistentQueue, queueItems, queueIndex, queueContinuation]);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().then(() => setIsPlaying(true)).catch((error) => setNotice(`Audio playback failed: ${errorMessage(error)}`));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const seekPlayback = (value: number) => {
    if (!audioRef.current || !Number.isFinite(value)) return;
    audioRef.current.currentTime = value;
    setPlaybackSeconds(value);
  };

  const seekByPlayerGesture = (direction: -1 | 1) => {
    const now = performance.now();
    const previous = seekGestureRef.current;
    const multiplier = settings.seekExtraSeconds === true && now - previous.timestamp < 1000 ? previous.multiplier + 1 : 1;
    seekGestureRef.current = { timestamp: now, multiplier };
    const seconds = 5 * multiplier;
    seekPlayback(Math.min(durationSeconds || Number.MAX_SAFE_INTEGER, Math.max(0, playbackSeconds + direction * seconds)));
  };

  const updateVolume = (value: number) => {
    const audio = audioRef.current;
    if (audio && settings.pauseOnMute === true && value === 0 && !audio.paused) {
      wasPlayingBeforeMuteRef.current = true;
      audio.pause();
      setIsPlaying(false);
    } else if (audio && settings.pauseOnMute === true && value > 0 && wasPlayingBeforeMuteRef.current && audio.paused) {
      wasPlayingBeforeMuteRef.current = false;
      void audio.play().then(() => setIsPlaying(true)).catch((error) => setNotice(`Audio playback failed: ${errorMessage(error)}`));
    }
    setVolume(value);
    if (audio) audio.volume = value;
  };

  useEffect(() => {
    const mediaSession = navigator.mediaSession;
    if (!mediaSession) return;
    const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try { mediaSession.setActionHandler(action, handler); } catch { /* WebView2 may not support every action. */ }
    };
    if (!player) {
      mediaSession.metadata = null;
      for (const action of ["play", "pause", "seekbackward", "seekforward", "seekto", "previoustrack", "nexttrack"] as MediaSessionAction[]) setHandler(action, null);
      return;
    }
    mediaSession.metadata = new MediaMetadata({ title: player.payload.title || player.item.title, artist: player.payload.artist || player.item.subtitle, album: player.item.albumTitle || "Meld Desktop" });
    setHandler("play", () => { if (audioRef.current) void audioRef.current.play().catch((error) => setNotice(`Audio playback failed: ${errorMessage(error)}`)); });
    setHandler("pause", () => audioRef.current?.pause());
    setHandler("seekbackward", () => { const current = audioRef.current?.currentTime ?? playbackSeconds; seekPlayback(Math.max(0, current - 10)); });
    setHandler("seekforward", () => { const current = audioRef.current?.currentTime ?? playbackSeconds; seekPlayback(Math.min(durationSeconds || Number.MAX_SAFE_INTEGER, current + 10)); });
    setHandler("seekto", (details) => { if (details.seekTime !== undefined) seekPlayback(Math.max(0, Math.min(durationSeconds || Number.MAX_SAFE_INTEGER, details.seekTime))); });
    setHandler("previoustrack", () => { if (queueIndex > 0) void playQueueIndex(queueIndex - 1); });
    setHandler("nexttrack", () => { if (queueIndex + 1 < queueItems.length || queueContinuation) void playQueueIndex(queueIndex + 1); });
    return () => {
      mediaSession.metadata = null;
      for (const action of ["play", "pause", "seekbackward", "seekforward", "seekto", "previoustrack", "nexttrack"] as MediaSessionAction[]) setHandler(action, null);
    };
  }, [durationSeconds, playbackSeconds, player?.item.id, player?.item.title, player?.item.subtitle, player?.item.albumTitle, player?.payload.artist, player?.payload.title, queueContinuation, queueIndex, queueItems.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable;
      if (typing && !(event.key === "Escape")) return;
      if (event.key === "Escape") { if (lyrics || detail || playlist || menuItem || queueOpen || playerExpanded) { closeTransientLayers(); event.preventDefault(); } return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") { event.preventDefault(); document.querySelector<HTMLInputElement>(".search-form input")?.focus(); return; }
      if (event.altKey && event.key === "ArrowLeft") { event.preventDefault(); goBack(); return; }
      if (event.altKey && event.key === "ArrowRight") { event.preventDefault(); navigateForward(); return; }
      if (!player) return;
      if (event.code === "Space") { event.preventDefault(); togglePlayback(); return; }
      if (event.key === "ArrowLeft") { event.preventDefault(); seekPlayback(Math.max(0, playbackSeconds - (event.shiftKey ? 10 : 5))); return; }
      if (event.key === "ArrowRight") { event.preventDefault(); seekPlayback(Math.min(durationSeconds || Number.MAX_SAFE_INTEGER, playbackSeconds + (event.shiftKey ? 10 : 5))); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, backStack, detail, durationSeconds, forwardStack, lyrics, menuItem, navigateBack, navigateForward, navigateTo, playbackSeconds, player, playerExpanded, queueOpen]);

  const formatTime = (seconds: number) => {
    const safe = Math.max(0, Math.floor(seconds));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
  };

  const loadAutomixItems = async (current: YtItem, existing: YtItem[]) => {
    if (settings.autoLoadMore === false || !settings.similarContent || (settings.disableLoadMoreWhenRepeatAll && repeatMode === "all") || !current.videoId || automixLoadingRef.current) return [];
    automixLoadingRef.current = true;
    try {
      const page = await invoke<QueuePage>("ytm_next", { videoId: current.videoId, playlistId: current.playPlaylistId ?? current.playlistId ?? null, setVideoId: current.setVideoId ?? null, index: null, params: current.params ?? null, continuation: null });
      let additions = page.items.filter((value) => value.videoId && value.id !== current.id && !existing.some((item) => item.id === value.id));
      if (additions.length === 0 && page.relatedBrowseId) {
        additions = (await invoke<YtItem[]>("ytm_related", { browseId: page.relatedBrowseId })).filter((value) => value.videoId && value.id !== current.id && !existing.some((item) => item.id === value.id));
      }
      if (shuffleEnabled && additions.length > 1) {
        additions = [...additions];
        for (let index = additions.length - 1; index > 0; index -= 1) { const swapIndex = Math.floor(Math.random() * (index + 1)); [additions[index], additions[swapIndex]] = [additions[swapIndex], additions[index]]; }
      }
      return additions;
    } catch {
      return [];
    } finally {
      automixLoadingRef.current = false;
    }
  };

  const playQueueIndex = async (index: number) => {
    let items = queueItems;
    let continuation = queueContinuation;
    try {
      while (index >= items.length && continuation && settings.autoLoadMore !== false) {
        const previousContinuation = continuation;
        const next = await invoke<QueuePage>("ytm_queue_continuation", { continuation });
        const additions = next.items.filter((value) => value.videoId && !items.some((current) => current.id === value.id));
        items = [...items, ...additions];
        continuation = next.continuation ?? null;
        setQueueItems(items);
        setQueueContinuation(continuation);
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
    await playItem(item, items, index, continuation);
  };

  const loadDetailMore = async () => {
    if (!detail || detail.status !== "ready" || !detail.data.continuation || detailMoreLoading) return;
    setDetailMoreLoading(true);
    try {
      const next = await invoke<DetailPage>("ytm_detail_continuation", { kind: detail.data.kind, continuation: detail.data.continuation });
      setDetail((current) => {
        if (!current || current.status !== "ready") return current;
        const items = [...current.data.items];
        for (const item of next.items) if (!items.some((existing) => existing.id === item.id)) items.push(item);
        return { status: "ready", data: { ...current.data, items, continuation: next.continuation } };
      });
    } catch (error) { setNotice(`More ${detail.data.kind} items could not be loaded: ${errorMessage(error)}`); }
    finally { setDetailMoreLoading(false); }
  };

  const loadPlaylistMore = async () => {
    const continuation = playlist?.data.continuation;
    if (!continuation || playlist?.status !== "ready") return;
    try {
      const next = await invoke<{ songs: YtItem[]; continuation?: string | null }>("ytm_playlist_continuation", { continuation });
      setPlaylist({ status: "ready", data: { ...playlist.data, songs: [...playlist.data.songs, ...next.songs.filter((song) => !playlist.data.songs.some((existing) => existing.id === song.id))], continuation: next.continuation } });
    } catch (error) {
      setNotice(`Playlist continuation failed: ${errorMessage(error)}`);
    }
  };

  const openItem = async (item: YtItem, sourceQueue: YtItem[] = [item], sourceIndex = 0) => {
    setNotice("");
    const libraryQueueModes = ["mix", "songs", "liked", "uploaded", "downloads", "cache", "local", "top"];
    const playableLibraryItems = filteredLibraryData.filter((value) => value.videoId || value.localPath);
    const libraryQueue = active === "library" && libraryQueueModes.includes(libraryMode) && playableLibraryItems.some((value) => value.id === item.id)
      ? playableLibraryItems
      : sourceQueue;
    const libraryIndex = libraryQueue.findIndex((value) => value.id === item.id);
    if (item.localPath) { await playItem(item, libraryQueue, libraryIndex >= 0 ? libraryIndex : sourceIndex); return; }
    if (["album", "artist", "podcast"].includes(item.kind) && (item.browseId || item.id)) {
      setPlaylist(null);
      setDetail({ status: "loading", data: { kind: item.kind, title: item.title, subtitle: item.subtitle, thumbnail: item.thumbnail, items: [] } });
      try {
        const data = await invoke<DetailPage>("ytm_detail", { kind: item.kind, browseId: item.browseId ?? item.id });
        setDetail({ status: "ready", data });
      } catch (error) {
        setDetail({ status: "error", data: { kind: item.kind, title: item.title, subtitle: item.subtitle, thumbnail: item.thumbnail, items: [] }, error: errorMessage(error) });
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
      await playItem(item, libraryQueue, libraryIndex >= 0 ? libraryIndex : sourceIndex);
      return;
    }
    setNotice(`Meld could not open this ${item.kind}: the live item did not include a supported navigation endpoint.`);
  };

  const activeLyricIndex = useMemo(() => {
    if (!lyrics || lyrics.status !== "ready" || !lyrics.data.synced || lyrics.data.lines.length === 0) return -1;
    const position = playbackSeconds * 1000;
    const nextIndex = lyrics.data.lines.findIndex((line) => line.timeMs > position);
    return nextIndex < 0 ? lyrics.data.lines.length - 1 : Math.max(0, nextIndex - 1);
  }, [lyrics, playbackSeconds]);

  useEffect(() => {
    if (activeLyricIndex < 0 || !lyricsAutoScrollEnabled) return;
    const line = activeLyricRef.current;
    const container = lyricsContainerRef.current;
    if (!line || !container) return;
    const align = () => {
      const lineRect = line.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const lineCenter = lineRect.top - containerRect.top + lineRect.height / 2;
      const targetTop = container.scrollTop + lineCenter - container.clientHeight / 2;
      const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
      container.scrollTo({ top: Math.min(maxTop, Math.max(0, targetTop)), behavior: "smooth" });
    };
    const frame = requestAnimationFrame(align);
    return () => cancelAnimationFrame(frame);
  }, [activeLyricIndex, playerExpanded, lyricsAutoScrollEnabled, lyrics?.status]);

  const visibleTitle = useMemo(() => navigation.find((item) => item.key === active)?.label ?? "Home", [active]);
  const libraryQuery = librarySearch.trim().toLowerCase();
  const playlistQuery = playlistSearch.trim().toLowerCase();
  const matchesLibraryQuery = (title: string) => libraryMode === "playlists" ? (!playlistQuery || title.toLowerCase().includes(playlistQuery)) : (!libraryQuery || title.toLowerCase().includes(libraryQuery));
  const matchesPlaylistQuery = (title: string) => !playlistQuery || title.toLowerCase().includes(playlistQuery);
  const hasVisiblePlaylistAutoEntries = (settings.show_liked_playlist !== false && matchesPlaylistQuery("Liked Songs")) || (settings.show_downloaded_playlist !== false && matchesPlaylistQuery("Downloaded")) || (settings.show_top_playlist !== false && matchesPlaylistQuery("Top Songs")) || (settings.show_uploaded_playlist !== false && matchesPlaylistQuery("Uploaded"));
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
  }, [localPlaylists, playlistQuery, playlistSort, playlistSortDescending]);
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
  const filteredLibraryData = useMemo(() => {
    const queryText = libraryQuery;
    const sourceValues = libraryMode === "mix" && queryText ? [...library.data, ...libraryMixSongs] : library.data;
    const values = sourceValues.filter((item) => !hideItem(item) && (!queryText || `${item.title} ${item.subtitle} ${item.artists.map((artist) => artist.name).join(" ")}`.toLowerCase().includes(queryText)));

    const activeSort = libraryMode === "mix" ? libraryMixSort : librarySort;
    const descending = libraryMode === "mix" ? libraryMixSortDescending : librarySortDescending;
    if (activeSort === "created") return descending ? values : [...values].reverse();
    const sorted = [...values].sort((left, right) => {
      if (activeSort === "name") return left.title.localeCompare(right.title);
      if (activeSort === "artist") return (left.artists[0]?.name ?? left.subtitle).localeCompare(right.artists[0]?.name ?? right.subtitle);
      return (left.duration ?? 0) - (right.duration ?? 0);
    });
    return descending ? sorted.reverse() : sorted;
  }, [library.data, libraryMixSongs, libraryMode, libraryMixSort, libraryMixSortDescending, libraryQuery, librarySort, librarySortDescending, settings.hideExplicit, settings.hideVideoSongs]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">M</div><div><strong>Meld</strong><span>Desktop</span></div></div>
        <nav className="primary-nav" aria-label="Main navigation">
          {navigation.map((item) => <button key={item.key} className={active === item.key ? "nav-item active" : "nav-item"} onClick={() => navigateTo(item.key)}><span className="nav-icon">{item.icon}</span><span>{item.label}</span></button>)}
                    </nav>
            <nav className="secondary-nav" aria-label="Secondary navigation">
              {secondaryNavigation.map((item) => <button key={item.key} className={active === item.key ? "nav-item active" : "nav-item"} onClick={() => navigateTo(item.key)}><span className="nav-icon">{item.icon}</span><span>{item.label}</span></button>)}
            </nav>
            <div className="sidebar-footer"><span className="guest-label">{sessionStatus.authenticated ? "YouTube Music account connected" : "Guest mode · account optional"}</span></div>

      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-title"><div><p className="eyebrow">Meld Desktop</p><h1>{visibleTitle}</h1></div><div className="nav-history-controls" role="group" aria-label="Navigation history"><button className="topbar-button icon-button" onClick={goBack} disabled={!hasTransientLayer && backStack.length === 0} title="Back" aria-label="Back">‹</button><button className="topbar-button icon-button" onClick={navigateForward} disabled={forwardStack.length === 0} title="Forward" aria-label="Forward">›</button></div></div>
          <div className="search-box"><form className="search-form" onSubmit={runSearch}><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search songs, albums, artists and playlists" aria-label="Search" /><button type="submit">Search</button></form>{searchHistory.filter((value) => !query.trim() || value.toLowerCase().startsWith(query.trim().toLowerCase())).length > 0 && <div className="search-history-popover" role="listbox" aria-label="Recent searches">{searchHistory.filter((value) => !query.trim() || value.toLowerCase().startsWith(query.trim().toLowerCase())).slice(0, 8).map((value, index) => <button type="button" role="option" key={`${value}-${index}`} onClick={() => setQuery(value)}>{value}</button>)}</div>}</div>
          <div className="topbar-actions"><button className="topbar-button" onClick={() => { setSettingsPage("main"); setSettingsOpen(true); setMenuItem(null); setLyrics(null); setQueueOpen(false); setPlayerExpanded(false); setDetail(null); setPlaylist(null); setInfoItem(null); }} title="Settings">Settings</button><div className="account-label"><span className="account-avatar">{sessionStatus.authenticated ? (sessionStatus.accountName?.slice(0, 1).toUpperCase() || "G") : "G"}</span><span>{sessionStatus.authenticated ? (sessionStatus.accountName || sessionStatus.accountEmail || "Connected") : "Guest"}</span></div></div>
        </header>

        {notice && <div className="notice" role="status"><span title={notice}>{noticeSummary(notice)}</span><button className="notice-dismiss" onClick={() => setNotice("")} title="Dismiss message" aria-label="Dismiss message">×</button></div>}

        <div className="page-scroll">
          {active === "home" && home.status === "loading" && <div className="boot-screen"><div className="brand-mark">M</div><h2>Loading Meld</h2><p>Connecting to YouTube Music…</p><div className="spinner" /></div>}
          {active === "home" && home.status !== "loading" && <>
            {speedDial.length > 0 && <section className="content-section"><div className="section-heading"><div><p className="eyebrow">Pinned</p><h2>Speed Dial</h2></div></div><div className="card-row">{speedDial.map((item) => <ItemCard key={`speed-${item.kind}-${item.id}`} item={item} onOpen={openItem} onMenu={(value) => void openMenu(value)} />)}</div></section>}
            {home.status === "error" && <div className="state-panel error"><h2>Home unavailable</h2><p>{home.error}</p><button className="primary-button" onClick={() => void loadHome()}>Retry</button></div>}
            {home.status === "ready" && home.data.sections.length === 0 && <div className="state-panel"><h2>No Home sections</h2><p>YouTube Music returned no typed sections for the current anonymous session.</p><button className="primary-button" onClick={() => void loadHome()}>Retry</button></div>}
            {home.status === "ready" && home.data.sections.map((section) => <Section key={section.title} section={section} onOpen={openItem} shouldHide={hideItem} onMenu={(item) => void openMenu(item)} />)}
            {home.status === "ready" && home.data.continuation && <button className="primary-button home-more" disabled={homeMoreLoading} onClick={() => void loadHomeMore()}>{homeMoreLoading ? "Loading more Home…" : "Load more Home"}</button>}
          </>}

          {active === "search_input" && <div className="search-page"><div className="search-intro"><p className="eyebrow">Online search</p><h2>{submittedQuery ? `Results for “${submittedQuery}”` : "Search YouTube Music"}</h2><p>Results remain typed as Meld YTItems: songs, albums, playlists, artists, podcasts and episodes.</p><button className="secondary-button" onClick={() => selectionMode ? closeSelection() : setSelectionMode(true)}>{selectionMode ? `Done${selectedItems.length > 0 ? ` · ${selectedItems.length}` : ""}` : "Select"}</button></div>{search.status === "idle" && <div className="state-panel"><p>Enter a query above to search.</p></div>}{search.status === "loading" && <div className="state-panel"><div className="spinner" /><p>Searching YouTube Music…</p></div>}{search.status === "error" && <div className="state-panel error"><h2>Search unavailable</h2><p>{search.error}</p></div>}{search.status === "ready" && <div className="result-list">{search.data.items.filter((item) => !hideItem(item)).map((item) => <div className="result-row" key={`${item.kind}-${item.id}`}>{selectionMode && <input className="selection-checkbox" type="checkbox" checked={selectedItems.some((value) => value.id === item.id)} onChange={() => toggleSelectedItem(item)} aria-label={`Select ${item.title}`} />}<ItemCard item={item} onOpen={openItem} />{item.kind === "song" && <InlineLikeButton item={item} autoDownloadOnLike={settings.autoDownloadOnLike === true} />}<div className="row-actions"><button className="row-action" onClick={() => void openItem(item)}>{item.kind === "song" ? "Play in Meld" : "Open"}</button>{item.kind === "song" && <button className="row-action" onClick={() => void openLyrics(item)}>Lyrics</button>}<button className="row-action menu-trigger" onClick={() => void openMenu(item)} title={`More options for ${item.title}`}>⋮</button></div></div>)}</div>}{search.data.continuation && <button className="primary-button playlist-more" disabled={searchMoreLoading} onClick={() => void loadSearchMore()}>{searchMoreLoading ? "Loading more results…" : "Load more results"}</button>}</div>}

          {active === "history" && <div className="history-page">
            <div className="search-intro">
              <p className="eyebrow">Playback history</p>
              <h2>History</h2>
              <p>{historySource === "remote" ? "Your YouTube Music history, grouped the same way as Meld." : "Tracks opened in Meld are kept locally on this device."}</p>
              <div className="history-toolbar">
                <div className="history-tabs" role="tablist" aria-label="History source">
                  <button role="tab" aria-selected={historySource === "local"} className={historySource === "local" ? "library-tab active" : "library-tab"} onClick={() => setHistorySource("local")}>Local</button>
                  {sessionStatus.authenticated && <button role="tab" aria-selected={historySource === "remote"} className={historySource === "remote" ? "library-tab active" : "library-tab"} onClick={() => setHistorySource("remote")}>Remote</button>}
                </div>
                <label className="history-search"><span>Filter</span><input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Search history" aria-label="Search history" /></label>
                {historySource === "local" && <button className="secondary-button" onClick={async () => { try { await invoke("history_clear"); await loadHistory(); setNotice("Meld playback history cleared."); } catch (error) { setNotice(`History could not be cleared: ${errorMessage(error)}`); } }}>Clear local history</button>}<button className="secondary-button" onClick={() => selectionMode ? closeSelection() : setSelectionMode(true)}>{selectionMode ? `Done${selectedItems.length > 0 ? ` · ${selectedItems.length}` : ""}` : "Select"}</button>
              </div>
            </div>
            {historySource === "local" && history.status === "loading" && <div className="state-panel"><div className="spinner" /><p>Loading local history…</p></div>}
            {historySource === "local" && history.status === "error" && <div className="state-panel error"><h2>History unavailable</h2><p>{history.error}</p><button className="primary-button" onClick={() => void loadHistory()}>Retry</button></div>}
            {historySource === "local" && history.status === "ready" && history.data.length === 0 && <div className="state-panel"><h2>No local history yet</h2><p>Play a song from Home or Search and it will appear here.</p></div>}
            {historySource === "local" && history.status === "ready" && history.data.length > 0 && <div className="result-list">{history.data.filter((item) => !hideItem(item) && (!historyQuery.trim() || `${item.title} ${item.subtitle}`.toLowerCase().includes(historyQuery.trim().toLowerCase()))).map((item, index) => <div className="result-row" key={`${item.id}-${index}`}>{selectionMode && <input className="selection-checkbox" type="checkbox" checked={selectedItems.some((value) => value.id === item.id)} onChange={() => toggleSelectedItem(item)} aria-label={`Select ${item.title}`} />}<ItemCard item={item} onOpen={openItem} />{item.kind === "song" && <InlineLikeButton item={item} autoDownloadOnLike={settings.autoDownloadOnLike === true} />}<div className="row-actions"><button className="row-action" onClick={() => void openItem(item)}>Play in Meld</button>{item.kind === "song" && <button className="row-action" onClick={() => void openLyrics(item)}>Lyrics</button>}<button className="row-action menu-trigger" onClick={() => void openMenu(item)} title={`More options for ${item.title}`}>⋮</button></div></div>)}</div>}
            {historySource === "remote" && remoteHistory.status === "loading" && <div className="state-panel"><div className="spinner" /><p>Loading YouTube Music history…</p></div>}
            {historySource === "remote" && remoteHistory.status === "error" && <div className="state-panel error"><h2>Remote history unavailable</h2><p>{remoteHistory.error}</p><button className="primary-button" onClick={() => void loadRemoteHistory()}>Retry</button></div>}
            {historySource === "remote" && remoteHistory.status === "ready" && remoteHistory.data.sections.length === 0 && <div className="state-panel"><h2>No remote history</h2><p>YouTube Music returned no history sections for this account.</p></div>}
            {historySource === "remote" && remoteHistory.status === "ready" && remoteHistory.data.sections.map((section) => { const queryText = historyQuery.trim().toLowerCase(); const songs = section.songs.filter((item) => !hideItem(item) && (!queryText || `${item.title} ${item.subtitle}`.toLowerCase().includes(queryText))); return songs.length === 0 ? null : <section className="history-section" key={section.title}><div className="section-heading"><h3>{section.title}</h3></div><div className="result-list">{songs.map((item, index) => <div className="result-row" key={`${section.title}-${item.id}-${index}`}>{selectionMode && <input className="selection-checkbox" type="checkbox" checked={selectedItems.some((value) => value.id === item.id)} onChange={() => toggleSelectedItem(item)} aria-label={`Select ${item.title}`} />}<ItemCard item={item} onOpen={openItem} />{item.kind === "song" && <InlineLikeButton item={item} autoDownloadOnLike={settings.autoDownloadOnLike === true} />}<div className="row-actions"><button className="row-action" onClick={() => void openItem(item)}>Play in Meld</button>{item.kind === "song" && <button className="row-action" onClick={() => void openLyrics(item)}>Lyrics</button>}<button className="row-action menu-trigger" onClick={() => void openMenu(item)} title={`More options for ${item.title}`}>⋮</button></div></div>)}</div></section>})}
          </div>}

          {active === "stats" && <div className="stats-page"><div className="search-intro"><p className="eyebrow">Listening statistics</p><h2>Stats</h2><p>Most-played songs and listening time from Meld playback history on this device.</p><div className="history-tabs" role="tablist" aria-label="Stats period">{(["all", "day", "week", "month", "year"] as const).map((period) => <button key={period} role="tab" aria-selected={statsPeriod === period} className={statsPeriod === period ? "library-tab active" : "library-tab"} onClick={() => setStatsPeriod(period)}>{period === "all" ? "All time" : period === "day" ? "24 hours" : period[0].toUpperCase() + period.slice(1)}</button>)}</div></div>{stats.status === "loading" && <div className="state-panel"><div className="spinner" /><p>Loading listening statistics…</p></div>}{stats.status === "error" && <div className="state-panel error"><h2>Stats unavailable</h2><p>{stats.error}</p><button className="primary-button" onClick={() => void loadStats()}>Retry</button></div>}{stats.status === "ready" && <><div className="stats-summary-grid"><div className="stats-summary-card"><strong>{stats.data.totalPlays}</strong><span>Plays</span></div><div className="stats-summary-card"><strong>{stats.data.totalMinutes}</strong><span>Minutes listened</span></div><div className="stats-summary-card"><strong>{stats.data.uniqueSongs}</strong><span>Unique songs</span></div></div>{(stats.data.artists.length > 0 || stats.data.albums.length > 0) && <div className="stats-breakdown-grid">{stats.data.artists.length > 0 && <section className="stats-breakdown"><h3>Top artists</h3>{stats.data.artists.slice(0, 10).map((artist, index) => <button className="stats-breakdown-row" key={`artist-${artist.id}`} onClick={() => void openItem({ id: artist.id, kind: "artist", title: artist.title, subtitle: artist.subtitle, thumbnail: artist.thumbnail, artists: [], browseId: artist.id })}><span>{index + 1}</span><strong>{artist.title}</strong><small>{artist.plays} plays</small></button>)}</section>}{stats.data.albums.length > 0 && <section className="stats-breakdown"><h3>Top albums</h3>{stats.data.albums.slice(0, 10).map((album, index) => <button className="stats-breakdown-row" key={`album-${album.id}`} onClick={() => void openItem({ id: album.id, kind: "album", title: album.title, subtitle: album.subtitle, thumbnail: album.thumbnail, artists: [], browseId: album.id })}><span>{index + 1}</span><strong>{album.title}</strong><small>{album.plays} plays</small></button>)}</section>}</div>}{stats.data.rows.length === 0 ? <div className="state-panel"><h2>No listening history yet</h2><p>Play a song from Home or Search and its statistics will appear here.</p></div> : <div className="result-list stats-list">{stats.data.rows.map((row, index) => <div className="result-row stats-row" key={`${row.item.id}-${index}`}><span className="stats-rank">{index + 1}</span><ItemCard item={row.item} onOpen={openItem} /><span className="stats-metrics">{row.plays} play{row.plays === 1 ? "" : "s"} · {row.minutes} min</span><div className="row-actions"><button className="row-action" onClick={() => void openItem(row.item)}>Play in Meld</button><button className="row-action menu-trigger" onClick={() => void openMenu(row.item)} title={`More options for ${row.item.title}`} aria-label={`More options for ${row.item.title}`}>⋮</button></div></div>)}</div>}</>}</div>}

          {active === "library" && <div className="library-page"><div className="search-intro"><p className="eyebrow">On-device storage</p><h2>{libraryMode === "mix" ? "Library" : libraryMode === "cache" ? "Cache" : ["songs", "liked", "uploaded", "downloads", "top"].includes(libraryMode) ? libraryMode === "top" ? "Top Songs" : "Songs" : libraryMode === "playlists" ? "Playlists" : libraryMode === "albums" ? "Albums" : libraryMode === "artists" ? "Artists" : libraryMode === "podcasts" ? "Podcasts" : "Local Files"}</h2><p>{libraryMode === "top" ? `Most-played songs from Meld history (${topPeriod === "all" ? "all time" : topPeriod}).` : libraryMode === "cache" ? "Songs cached during Meld playback, separate from explicit offline downloads." : ["songs", "liked", "uploaded", "downloads"].includes(libraryMode) ? "Songs are filtered by Liked, Library, Uploaded, or Downloaded exactly like Meld’s Songs screen." : libraryMode === "playlists" ? "Local playlists and YouTube Music playlists saved by the connected account." : libraryMode === "albums" ? "Albums represented by saved songs and their live source metadata." : libraryMode === "artists" ? "Artists represented by saved songs and their live source metadata." : libraryMode === "podcasts" ? "Podcast episodes and channels from your authenticated YouTube Music library." : "Items saved to the native SQLite library on this device."}</p>{!["songs", "liked", "uploaded", "downloads", "top", "podcasts"].includes(libraryMode) && <div className="library-tabs" role="tablist" aria-label="Library filter"><button className={libraryMode === "mix" ? "library-tab active" : "library-tab"} aria-selected={libraryMode === "mix"} onClick={() => setLibraryMode("mix")}>Library</button><button className={libraryMode === "playlists" ? "library-tab active" : "library-tab"} onClick={() => setLibraryMode(libraryMode === "playlists" ? "mix" : "playlists")}>Playlists</button><button className={["songs", "liked", "uploaded", "downloads", "top"].includes(libraryMode) ? "library-tab active" : "library-tab"} onClick={() => ["songs", "liked", "uploaded", "downloads", "top"].includes(libraryMode) ? setLibraryMode("mix") : chooseLibrarySongFilter(librarySongFilter)}>Songs</button><button className={libraryMode === "albums" ? "library-tab active" : "library-tab"} onClick={() => setLibraryMode(libraryMode === "albums" ? "mix" : "albums")}>Albums</button><button className={libraryMode === "artists" ? "library-tab active" : "library-tab"} onClick={() => setLibraryMode(libraryMode === "artists" ? "mix" : "artists")}>Artists</button><button className={libraryMode === "podcasts" ? "library-tab active" : "library-tab"} onClick={() => setLibraryMode(libraryMode === "podcasts" ? "mix" : "podcasts")}>Podcasts</button><button className={libraryMode === "local" ? "library-tab active" : "library-tab"} onClick={() => setLibraryMode(libraryMode === "local" ? "mix" : "local")}>Local files</button>{libraryMode === "local" && <button className="primary-button local-import-button" onClick={() => void importLocalFiles()}>Import audio files</button>}{libraryMode === "playlists" && <button className="primary-button" onClick={openCreatePlaylistDialog}>Create playlist</button>}</div>}{libraryMode === "mix" && <div className="library-mix-toolbar"><label className="library-search"><span>Search</span><input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Search your library" aria-label="Search your library" /></label><span className="library-result-count">{filteredLibraryData.length} items</span><select className="library-sort" value={libraryMixSort} onChange={(event) => setLibraryMixSort(event.target.value as "created" | "name")} aria-label="Sort library"><option value="created">Recently added</option><option value="name">Name</option></select><button className="secondary-button" onClick={() => setLibraryMixSortDescending((value) => !value)} title="Reverse sort order">{libraryMixSortDescending ? "Descending" : "Ascending"}</button><button className="secondary-button" onClick={() => setLibraryView((value) => value === "grid" ? "list" : "grid")} title={libraryView === "grid" ? "Switch to list view" : "Switch to grid view"} aria-label={libraryView === "grid" ? "Switch to list view" : "Switch to grid view"}>{libraryView === "grid" ? "List" : "Grid"}</button></div>}{["songs", "liked", "uploaded", "downloads"].includes(libraryMode) && <div className="library-song-toolbar"><button className="library-tab active library-root-chip" onClick={() => setLibraryMode("mix")} title="Return to Library" aria-label="Return to Library">Songs ×</button><div className="library-filter-chips" role="tablist" aria-label="Song filter"><button className={librarySongFilter === "liked" ? "library-tab active" : "library-tab"} onClick={() => chooseLibrarySongFilter("liked")}>Liked</button><button className={librarySongFilter === "library" ? "library-tab active" : "library-tab"} onClick={() => chooseLibrarySongFilter("library")}>Library</button><button className={librarySongFilter === "uploaded" ? "library-tab active" : "library-tab"} onClick={() => chooseLibrarySongFilter("uploaded")}>Uploaded</button><button className={librarySongFilter === "downloaded" ? "library-tab active" : "library-tab"} onClick={() => chooseLibrarySongFilter("downloaded")}>Downloaded</button></div><label className="library-search"><span>Search</span><input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Search your songs" aria-label="Search library songs" /></label><select className="library-sort" value={librarySort} onChange={(event) => setLibrarySort(event.target.value as LibrarySort)} aria-label="Sort library songs"><option value="created">Recently added</option><option value="name">Name</option><option value="artist">Artist</option><option value="playtime">Play time</option></select><button className="secondary-button" onClick={() => setLibrarySortDescending((value) => !value)} title="Reverse sort order">{librarySortDescending ? "Descending" : "Ascending"}</button><button className="secondary-button" onClick={() => selectionMode ? closeSelection() : setSelectionMode(true)}>{selectionMode ? `Done${selectedItems.length > 0 ? ` · ${selectedItems.length}` : ""}` : "Select"}</button>{filteredLibraryData.length > 0 && <button className="primary-button" onClick={() => void shuffleLibrary()} title="Shuffle all visible songs">Shuffle</button>}</div>}{libraryMode === "top" && <div className="library-song-toolbar"><button className="library-tab active library-root-chip" onClick={() => setLibraryMode("mix")} title="Return to Library" aria-label="Return to Library">Top Songs ×</button><div className="library-filter-chips" role="tablist" aria-label="Top songs period"><button className={topPeriod === "all" ? "library-tab active" : "library-tab"} onClick={() => setTopPeriod("all")}>All time</button><button className={topPeriod === "day" ? "library-tab active" : "library-tab"} onClick={() => setTopPeriod("day")}>24 hours</button><button className={topPeriod === "week" ? "library-tab active" : "library-tab"} onClick={() => setTopPeriod("week")}>Week</button><button className={topPeriod === "month" ? "library-tab active" : "library-tab"} onClick={() => setTopPeriod("month")}>Month</button><button className={topPeriod === "year" ? "library-tab active" : "library-tab"} onClick={() => setTopPeriod("year")}>Year</button></div><button className="secondary-button" onClick={() => selectionMode ? closeSelection() : setSelectionMode(true)}>{selectionMode ? `Done${selectedItems.length > 0 ? ` · ${selectedItems.length}` : ""}` : "Select"}</button>{filteredLibraryData.length > 0 && <button className="primary-button" onClick={() => void shuffleLibrary()}>Shuffle</button>}</div>}{libraryMode === "podcasts" && <div className="library-tabs podcast-filter-tabs"><button className="library-tab active library-root-chip" onClick={() => setLibraryMode("mix")} title="Return to Library" aria-label="Return to Library">Podcasts ×</button><button className={podcastFilter === "episodes" ? "library-tab active" : "library-tab"} onClick={() => setPodcastFilter("episodes")}>Episodes</button><button className={podcastFilter === "channels" ? "library-tab active" : "library-tab"} onClick={() => setPodcastFilter("channels")}>Channels</button><button className={podcastFilter === "downloaded" ? "library-tab active" : "library-tab"} onClick={() => setPodcastFilter("downloaded")}>Downloaded</button></div>}{libraryMode === "podcasts" && podcastFilter === "episodes" && <div className="podcast-auto-playlists"><button className="playlist-list-row auto-podcast-row" onClick={() => void openItem({ id: "RDPN", kind: "playlist", title: "New Episodes", subtitle: "Auto playlist", artists: [], browseId: "RDPN", playlistId: "RDPN" })}><span className="library-auto-icon">◷</span><span><strong>New Episodes</strong><small>Recently added podcast episodes</small></span><span aria-hidden="true">›</span></button><button className="playlist-list-row auto-podcast-row" onClick={() => void openItem({ id: "SE", kind: "playlist", title: "Episodes for Later", subtitle: "Auto playlist", artists: [], browseId: "SE", playlistId: "SE" })}><span className="library-auto-icon">▤</span><span><strong>Episodes for Later</strong><small>Saved podcast episodes</small></span><span aria-hidden="true">›</span></button></div>}</div>{libraryMode === "cache" && <div className="library-song-toolbar"><button className="library-tab active library-root-chip" onClick={() => setLibraryMode("mix")} title="Return to Library" aria-label="Return to Library">Cache ×</button><label className="library-search"><span>Search</span><input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Search cached songs" aria-label="Search cached songs" /></label><select className="library-sort" value={librarySort} onChange={(event) => setLibrarySort(event.target.value as LibrarySort)} aria-label="Sort cached songs"><option value="created">Recently cached</option><option value="name">Name</option><option value="artist">Artist</option><option value="playtime">Play time</option></select><button className="secondary-button" onClick={() => setLibrarySortDescending((value) => !value)} title="Reverse cached songs order">{librarySortDescending ? "Descending" : "Ascending"}</button>{filteredLibraryData.length > 0 && <button className="primary-button" onClick={() => void shuffleLibrary()}>Shuffle</button>}</div>}{libraryMode === "mix" && library.status === "ready" && libraryView === "grid" && <div className="library-mix-grid">{settings.show_cached_playlist !== false && matchesLibraryQuery("Cached") && <button className="playlist-tile auto-playlist-tile" onClick={() => setLibraryMode("cache")}><div className="item-art-wrap"><div className="item-art empty-art">◌</div></div><strong>Cached</strong><span>Songs cached during playback</span></button>}{settings.show_liked_playlist !== false && matchesLibraryQuery("Liked Songs") && <button className="playlist-tile auto-playlist-tile" onClick={() => chooseLibrarySongFilter("liked")}><div className="item-art-wrap"><div className="item-art empty-art">♥</div></div><strong>Liked Songs</strong><span>Meld’s single liked-songs playlist</span></button>}{settings.show_downloaded_playlist !== false && matchesLibraryQuery("Downloaded") && <button className="playlist-tile auto-playlist-tile" onClick={() => chooseLibrarySongFilter("downloaded")}><div className="item-art-wrap"><div className="item-art empty-art">↓</div></div><strong>Downloaded</strong><span>Downloaded songs</span></button>}{settings.show_top_playlist !== false && matchesLibraryQuery("Top Songs") && <button className="playlist-tile auto-playlist-tile" onClick={() => chooseLibrarySongFilter("top")}><div className="item-art-wrap"><div className="item-art empty-art">★</div></div><strong>Top Songs</strong><span>Most played in Meld</span></button>}{settings.show_uploaded_playlist !== false && matchesLibraryQuery("Uploaded") && <button className="playlist-tile auto-playlist-tile" onClick={() => chooseLibrarySongFilter("uploaded")}><div className="item-art-wrap"><div className="item-art empty-art">↑</div></div><strong>Uploaded</strong><span>YouTube Music uploads</span></button>}{filteredLibraryData.map((item) => <div className="library-mix-card" key={`mix-${item.kind}-${item.id}`}><ItemCard item={item} onOpen={openItem} onMenu={(value) => void openMenu(value)} /><span className="library-mix-kind">{item.kind}</span></div>)}</div>}{libraryMode === "mix" && library.status === "ready" && libraryView === "list" && <div className="result-list library-mix-list">{settings.show_cached_playlist !== false && matchesLibraryQuery("Cached") && <button className="library-auto-row" onClick={() => setLibraryMode("cache")}><span className="library-auto-icon">◌</span><span><strong>Cached</strong><small>Songs cached during playback</small></span></button>}{settings.show_liked_playlist !== false && matchesLibraryQuery("Liked Songs") && <button className="library-auto-row" onClick={() => chooseLibrarySongFilter("liked")}><span className="library-auto-icon">♥</span><span><strong>Liked Songs</strong><small>Meld’s single liked-songs playlist</small></span></button>}{settings.show_downloaded_playlist !== false && matchesLibraryQuery("Downloaded") && <button className="library-auto-row" onClick={() => chooseLibrarySongFilter("downloaded")}><span className="library-auto-icon">↓</span><span><strong>Downloaded</strong><small>Downloaded songs for offline listening</small></span></button>}{settings.show_top_playlist !== false && matchesLibraryQuery("Top Songs") && <button className="library-auto-row" onClick={() => chooseLibrarySongFilter("top")}><span className="library-auto-icon">★</span><span><strong>Top Songs</strong><small>Most played in Meld history</small></span></button>}{settings.show_uploaded_playlist !== false && matchesLibraryQuery("Uploaded") && <button className="library-auto-row" onClick={() => chooseLibrarySongFilter("uploaded")}><span className="library-auto-icon">↑</span><span><strong>Uploaded</strong><small>YouTube Music uploads</small></span></button>}{filteredLibraryData.map((item) => <div className="result-row" key={`mix-list-${item.kind}-${item.id}`}><ItemCard item={item} onOpen={openItem} />{item.kind === "song" && <InlineLikeButton item={item} autoDownloadOnLike={settings.autoDownloadOnLike === true} />}<div className="row-actions"><button className="row-action" onClick={() => void openItem(item)}>{item.kind === "song" ? "Play in Meld" : "Open"}</button><button className="row-action menu-trigger" onClick={() => void openMenu(item)} title={`More options for ${item.title}`} aria-label={`More options for ${item.title}`}>⋮</button></div></div>)}</div>}{libraryMode === "mix" && library.status === "ready" && librarySearch.trim() && filteredLibraryData.length === 0 && !((settings.show_cached_playlist !== false && matchesLibraryQuery("Cached")) || (settings.show_liked_playlist !== false && matchesLibraryQuery("Liked Songs")) || (settings.show_downloaded_playlist !== false && matchesLibraryQuery("Downloaded")) || (settings.show_top_playlist !== false && matchesLibraryQuery("Top Songs")) || (settings.show_uploaded_playlist !== false && matchesLibraryQuery("Uploaded"))) && <div className="state-panel"><h2>No matching library items</h2><p>Try a different search or clear the filter.</p></div>}{libraryMode === "playlists" ? <><div className="library-playlists-toolbar"><label className="library-search"><span>Search</span><input value={playlistSearch} onChange={(event) => setPlaylistSearch(event.target.value)} placeholder="Search playlists" aria-label="Search playlists" /></label><span className="library-result-count">{visiblePlaylists.length} playlists</span><select className="library-sort" value={playlistSort} onChange={(event) => setPlaylistSort(event.target.value as PlaylistSort)} aria-label="Sort playlists"><option value="created">Recently added</option><option value="name">Name</option><option value="count">Song count</option></select><button className="secondary-button" onClick={() => setPlaylistSortDescending((value) => !value)} title="Reverse playlist sort order">{playlistSortDescending ? "Descending" : "Ascending"}</button><button className="secondary-button" onClick={() => setPlaylistView((value) => value === "grid" ? "list" : "grid")} title={playlistView === "grid" ? "Switch to list view" : "Switch to grid view"} aria-label={playlistView === "grid" ? "Switch to list view" : "Switch to grid view"}>{playlistView === "grid" ? "List" : "Grid"}</button></div><div className={playlistView === "grid" ? "playlist-grid" : "library-playlists-list"}>{settings.show_cached_playlist !== false && matchesLibraryQuery("Cached") && <button className="playlist-tile auto-playlist-tile" onClick={() => setLibraryMode("cache")}><div className="item-art-wrap"><div className="item-art empty-art">◌</div></div><strong>Cached</strong><span>Songs cached during playback</span></button>}{settings.show_liked_playlist !== false && matchesLibraryQuery("Liked Songs") && <button className="playlist-tile auto-playlist-tile" onClick={() => chooseLibrarySongFilter("liked")}><div className="item-art-wrap"><div className="item-art empty-art">♥</div></div><strong>Liked Songs</strong><span>Meld’s single liked-songs playlist</span></button>}{settings.show_downloaded_playlist !== false && matchesLibraryQuery("Downloaded") && <button className="playlist-tile auto-playlist-tile" onClick={() => chooseLibrarySongFilter("downloaded")}><div className="item-art-wrap"><div className="item-art empty-art">↓</div></div><strong>Downloaded</strong><span>Downloaded songs for offline listening</span></button>}{settings.show_top_playlist !== false && matchesLibraryQuery("Top Songs") && <button className="playlist-tile auto-playlist-tile" onClick={() => chooseLibrarySongFilter("top")}><div className="item-art-wrap"><div className="item-art empty-art">★</div></div><strong>Top Songs</strong><span>Most played songs from Meld history</span></button>}{settings.show_uploaded_playlist !== false && matchesLibraryQuery("Uploaded") && <button className="playlist-tile auto-playlist-tile" onClick={() => chooseLibrarySongFilter("uploaded")}><div className="item-art-wrap"><div className="item-art empty-art">↑</div></div><strong>Uploaded</strong><span>YouTube Music uploaded songs</span></button>}{visiblePlaylists.length === 0 && !hasVisiblePlaylistAutoEntries ? <div className="state-panel"><h2>{playlistQuery ? "No matching playlists" : "No playlists"}</h2><p>{playlistQuery ? "Try a different search or clear the filter." : "Create a playlist, then use Add to playlist from a song’s three-dot menu."}</p></div> : visiblePlaylists.map((item) => <button className={playlistView === "grid" ? "playlist-tile" : "playlist-list-row"} key={item.id} onClick={() => void openLocalPlaylist(item)}><div className="item-art-wrap"><div className="item-art empty-art">P</div></div><strong>{item.title}</strong><span>{item.songCount === undefined ? item.subtitle : `${item.songCount} song${item.songCount === 1 ? "" : "s"}${item.subtitle ? ` · ${item.subtitle}` : ""}`}</span></button>)}</div>{spotifyStatus.authenticated && <SpotifyLibraryBlock node={spotifyLibrary} liked={spotifyLikedTracks} folderStack={spotifyFolderStack} onOpenFolder={(folder) => void openSpotifyFolder(folder)} onOpenPlaylist={(spotifyPlaylist) => void openSpotifyPlaylist(spotifyPlaylist)} onOpenLiked={openSpotifyLiked} onBack={() => { const next = spotifyFolderStack.slice(0, -1); setSpotifyFolderStack(next); void loadSpotifyLibrary(next[next.length - 1]?.uri ?? null); }} onRetry={() => void loadSpotifyLibrary(spotifyFolderStack[spotifyFolderStack.length - 1]?.uri ?? null)} />}</> : library.status === "loading" && <div className="state-panel"><div className="spinner" /><p>Loading your library…</p></div>}{library.status === "error" && <div className="state-panel error"><h2>Library unavailable</h2><p>{library.error}</p><button className="primary-button" onClick={() => void reloadCurrentLibrary()}>Retry</button></div>}{librarySyncing && <div className="state-panel"><div className="spinner" /><p>Syncing YouTube Music {libraryMode === "liked" ? "liked songs" : libraryMode === "uploaded" ? "uploaded songs" : "library songs"}…</p></div>}{!librarySyncing && !( ["mix", "playlists", "albums", "artists", "podcasts"] as string[]).includes(libraryMode) && library.status === "ready" && library.data.length === 0 && <div className="state-panel"><h2>{libraryMode === "local" ? "No local audio files imported" : libraryMode === "liked" ? "No liked songs cached" : libraryMode === "songs" ? "No library songs cached" : libraryMode === "uploaded" ? "No uploaded songs cached" : libraryMode === "top" ? "No listening history yet" : "No offline downloads"}</h2><p>{libraryMode === "local" ? "Use Import audio files to choose real files from this Windows device." : libraryMode === "downloads" ? "Use Download for offline listening from a remote song’s More actions menu." : "Use a real typed item and its connected action to populate this view."}</p></div>}{!librarySyncing && !( ["mix", "playlists", "albums", "artists", "podcasts"] as string[]).includes(libraryMode) && library.status === "ready" && library.data.length > 0 && filteredLibraryData.length === 0 && <div className="state-panel"><h2>No matching songs</h2><p>Try a different search or filter.</p></div>}{!librarySyncing && !( ["mix", "playlists", "albums", "artists", "podcasts"] as string[]).includes(libraryMode) && library.status === "ready" && filteredLibraryData.length > 0 && <div className="result-list">{filteredLibraryData.map((item) => <div className="result-row" key={`${item.kind}-${item.id}`}>{selectionMode && <input className="selection-checkbox" type="checkbox" checked={selectedItems.some((value) => value.id === item.id)} onChange={() => toggleSelectedItem(item)} aria-label={`Select ${item.title}`} />}<ItemCard item={item} onOpen={openItem} />{item.kind === "song" && <InlineLikeButton item={item} autoDownloadOnLike={settings.autoDownloadOnLike === true} />}<div className="row-actions"><button className="row-action" onClick={() => void openItem(item)}>{item.kind === "song" ? "Play in Meld" : "Open"}</button>{item.kind === "song" && <button className="row-action" onClick={() => void openLyrics(item)}>Lyrics</button>}<button className="row-action menu-trigger" onClick={() => void openMenu(item)} title={`More options for ${item.title}`}>⋮</button></div></div>)}</div>}{!librarySyncing && (libraryMode === "albums" || libraryMode === "artists") && library.status === "ready" && <div className="result-list catalog-list">{library.data.length === 0 ? <div className="state-panel"><h2>No {libraryMode} in your library</h2><p>Save songs with source album or artist metadata to populate this view.</p></div> : library.data.map((item) => <div className="result-row catalog-row" key={`${item.kind}-${item.id}`}><ItemCard item={item} onOpen={openItem} /><div className="row-actions"><button className="row-action" onClick={() => void openItem(item)}>Open {libraryMode === "albums" ? "album" : "artist"}</button><button className="row-action menu-trigger" onClick={() => void openMenu(item)} title={`More options for ${item.title}`}>⋮</button></div></div>)}</div>}{!librarySyncing && libraryMode === "podcasts" && library.status === "ready" && <div className="result-list catalog-list">{library.data.length === 0 ? <div className="state-panel"><h2>{podcastFilter === "downloaded" ? "No downloaded podcast episodes" : `No podcast ${podcastFilter} found`}</h2><p>{podcastFilter === "downloaded" ? "Download a podcast episode from its More actions menu to make it available offline." : "YouTube Music returned no items for this account."}</p></div> : library.data.map((item) => <div className="result-row catalog-row" key={`${item.kind}-${item.id}`}><ItemCard item={item} onOpen={openItem} /><div className="row-actions"><button className="row-action" onClick={() => void openItem(item)}>Open</button><button className="row-action menu-trigger" onClick={() => void openMenu(item)} title={`More options for ${item.title}`}>⋮</button></div></div>)}</div>}</div>}
        </div>
      </main>

      {selectionMode && selectedItems.length > 0 && <div className="selection-action-bar" role="toolbar" aria-label="Selected song actions"><strong>{selectedItems.length} selected</strong><button className="primary-button" onClick={() => void playSelectedItems(false)}>Play</button><button className="secondary-button" onClick={() => void playSelectedItems(true)}>Shuffle</button><button className="secondary-button" onClick={() => queueSelectedItems(true)}>Play next</button><button className="secondary-button" onClick={() => queueSelectedItems(false)}>Add to queue</button><button className="secondary-button" onClick={() => { setPlaylistPickerItems([...selectedItems]); void loadLocalPlaylists(); }}>Add to playlist</button><button className="secondary-button" onClick={() => void likeSelectedItems()}>Like / dislike all</button><button className="secondary-button" onClick={downloadSelectedItems}>Download</button><button className="secondary-button" onClick={() => void removeSelectedDownloads()}>Remove download</button><button className="secondary-button" onClick={closeSelection}>Clear</button></div>}

      {spotifyAddItem && spotifyAddState && <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => { setSpotifyAddItem(null); setSpotifyAddState(null); }}><div className="detail-panel picker-panel" onClick={(event) => event.stopPropagation()}><button className="close-button" title="Close" aria-label="Close" onClick={() => { setSpotifyAddItem(null); setSpotifyAddState(null); }}>×</button><p className="eyebrow">Spotify</p><h2>Add to Spotify playlist</h2>{spotifyAddState.status === "loading" && <div className="state-panel"><div className="spinner" /><p>Matching the song and loading Spotify playlists…</p></div>}{spotifyAddState.status === "error" && <div className="state-panel error"><p>{spotifyAddState.error}</p></div>}{spotifyAddState.status === "ready" && <>{spotifyAddState.data.match && <p className="muted-copy">Matched: {spotifyAddState.data.match.name} · {spotifyAddState.data.match.artist}</p>}<div className="picker-list">{spotifyAddState.data.playlists.length === 0 ? <p className="muted-copy">No Spotify playlists were returned.</p> : spotifyAddState.data.playlists.map((playlist) => <button className="menu-option" key={playlist.id} onClick={() => void addToSpotifyPlaylist(playlist)}>{playlist.name}{playlist.owner ? ` · ${playlist.owner}` : ""}</button>)}</div></>}</div></div>}
      {spotifyLikedOpen && <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setSpotifyLikedOpen(false)}><div className="detail-panel spotify-playlist-panel" onClick={(event) => event.stopPropagation()}><button className="close-button" title="Close" aria-label="Close" onClick={() => setSpotifyLikedOpen(false)}>×</button><p className="eyebrow">Spotify library</p><h2>Liked Songs</h2>{spotifyLikedTracks.status === "loading" && <div className="state-panel"><div className="spinner" /><p>Loading Spotify liked songs…</p></div>}{spotifyLikedTracks.status === "error" && <div className="state-panel error"><h2>Spotify liked songs unavailable</h2><p>{spotifyLikedTracks.error}</p><button className="primary-button" onClick={() => void loadSpotifyLikedTracks()}>Retry</button></div>}{spotifyLikedTracks.status === "ready" && spotifyLikedTracks.data.tracks.length === 0 && <div className="state-panel"><h2>No liked songs returned</h2><p>Spotify returned an empty liked-songs library.</p></div>}{spotifyLikedTracks.status === "ready" && spotifyLikedTracks.data.tracks.length > 0 && <div className="spotify-track-list">{spotifyLikedTracks.data.tracks.map((track) => <div className="spotify-track-row" key={track.id}><div className="spotify-track-copy"><strong>{track.name}</strong><span>{track.artist}{track.album ? ` · ${track.album}` : ""}</span></div><button className="row-action" onClick={() => void playSpotifyTrack(track)}>Find & play</button></div>)}</div>}</div></div>}
      {spotifyOpenPlaylist && <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setSpotifyOpenPlaylist(null)}><div className="detail-panel spotify-playlist-panel" onClick={(event) => event.stopPropagation()}><button className="close-button" title="Close" aria-label="Close" onClick={() => setSpotifyOpenPlaylist(null)}>×</button><p className="eyebrow">Spotify playlist</p><h2>{spotifyOpenPlaylist.name}</h2><div className="spotify-detail-toolbar"><input value={spotifyDetailQuery} onChange={(event) => setSpotifyDetailQuery(event.target.value)} placeholder="Search tracks" aria-label="Search Spotify playlist tracks" /><select value={spotifyDetailSort} onChange={(event) => setSpotifyDetailSort(event.target.value as "original" | "name" | "artist" | "duration")} aria-label="Sort Spotify playlist tracks"><option value="original">Original order</option><option value="name">Name</option><option value="artist">Artist</option><option value="duration">Duration</option></select><button className="row-action" onClick={() => setSpotifyDetailSortDescending((value) => !value)} title="Reverse sort order">{spotifyDetailSortDescending ? "Descending" : "Ascending"}</button><button className="row-action" onClick={() => setSpotifyReorderUnlocked((value) => !value)} title="Unlock playlist reorder">{spotifyReorderUnlocked ? "Lock order" : "Unlock order"}</button></div>{spotifyPlaylistTracks.status === "ready" && spotifyPlaylistTracks.data.tracks.length > 0 && <button className="secondary-button spotify-download-button" onClick={() => void downloadSpotifyPlaylist()}>Download playlist</button>}{spotifyOpenPlaylist.owner && spotifyProfile?.displayName && spotifyOpenPlaylist.owner === spotifyProfile.displayName && <div className="spotify-rename-row"><input value={spotifyRenameName} onChange={(event) => setSpotifyRenameName(event.target.value)} aria-label="Spotify playlist name" /><button className="row-action" disabled={!spotifyRenameName.trim() || spotifyRenameName.trim() === spotifyOpenPlaylist.name} onClick={() => void renameSpotifyPlaylist()}>Rename</button></div>}{spotifyPlaylistTracks.status === "loading" && <div className="state-panel"><div className="spinner" /><p>Loading Spotify tracks…</p></div>}{spotifyPlaylistTracks.status === "error" && <div className="state-panel error"><h2>Spotify playlist unavailable</h2><p>{spotifyPlaylistTracks.error}</p><button className="primary-button" onClick={() => void openSpotifyPlaylist(spotifyOpenPlaylist)}>Retry</button></div>}{spotifyPlaylistTracks.status === "ready" && visibleSpotifyPlaylistTracks.length === 0 && <div className="state-panel"><h2>No tracks returned</h2><p>Spotify returned an empty playlist.</p></div>}{spotifyPlaylistTracks.status === "ready" && visibleSpotifyPlaylistTracks.length > 0 && <div className="spotify-track-list">{visibleSpotifyPlaylistTracks.map((track) => <div className="spotify-track-row" key={track.id}><div className="spotify-track-copy"><strong>{track.name}</strong><span>{track.artist}{track.album ? ` · ${track.album}` : ""}</span></div><div className="spotify-track-actions"><button className="row-action" onClick={() => void playSpotifyTrack(track)}>Find & play</button>{spotifyReorderUnlocked && !spotifyDetailQuery.trim() && spotifyDetailSort === "original" && !spotifyDetailSortDescending && track.uid && <><button className="row-action" disabled={visibleSpotifyPlaylistTracks.indexOf(track) === 0} onClick={() => void moveSpotifyTrack(track, "up")} title="Move up" aria-label={`Move ${track.name} up`}>↑</button><button className="row-action" disabled={visibleSpotifyPlaylistTracks.indexOf(track) === visibleSpotifyPlaylistTracks.length - 1} onClick={() => void moveSpotifyTrack(track, "down")} title="Move down" aria-label={`Move ${track.name} down`}>↓</button></>}{track.uid && <button className="row-action danger-action" onClick={() => void removeSpotifyTrack(track)}>Remove</button>}</div></div>)}</div>}{spotifyPlaylistTracks.data.tracks.length < spotifyPlaylistTracks.data.totalCount && <button className="secondary-button" onClick={() => void loadMoreSpotifyPlaylistTracks()} disabled={spotifyPlaylistLoadingMore}>{spotifyPlaylistLoadingMore ? "Loading…" : "Load more"}</button>}</div></div>}
      {youtubeMatchItem && <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setYoutubeMatchItem(null)}><div className="detail-panel picker-panel" onClick={(event) => event.stopPropagation()}><button className="close-button" title="Close" aria-label="Close" onClick={() => setYoutubeMatchItem(null)}>×</button><p className="eyebrow">Change YouTube version</p><h2>{youtubeMatchItem.match.name}</h2><p className="muted-copy">Current match: {youtubeMatchItem.item.title} · {youtubeMatchItem.item.videoId}</p><label className="form-field"><span>Paste YouTube URL or 11-character video ID</span><input value={youtubeMatchUrl} onChange={(event) => setYoutubeMatchUrl(event.target.value)} placeholder="https://music.youtube.com/watch?v=…" autoFocus /></label>{youtubeMatchPreview?.status === "loading" && <div className="state-panel"><div className="spinner" /><p>Searching YouTube Music…</p></div>}{youtubeMatchPreview?.status === "error" && <div className="state-panel error"><p>{youtubeMatchPreview.error}</p></div>}{youtubeMatchPreview?.status === "ready" && youtubeMatchPreview.data && <div className="match-preview"><strong>{youtubeMatchPreview.data.title}</strong><span>{youtubeMatchPreview.data.subtitle}</span><small>{youtubeMatchPreview.data.videoId}</small></div>}<div className="dialog-actions"><button className="secondary-button" onClick={() => setYoutubeMatchItem(null)}>Cancel</button><button className="primary-button" disabled={youtubeMatchPreview?.status !== "ready" || !youtubeMatchPreview.data?.videoId || youtubeMatchPreview.data.videoId === youtubeMatchItem.item.videoId} onClick={() => void confirmYoutubeVersion()}>OK</button></div></div></div>}
      {editItem && <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setEditItem(null)}><div className="detail-panel picker-panel" onClick={(event) => event.stopPropagation()}><button className="close-button" title="Close" aria-label="Close" onClick={() => setEditItem(null)}>×</button><p className="eyebrow">Edit song</p><h2>{editItem.title}</h2><label className="form-field"><span>Song title</span><input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></label><label className="form-field"><span>Artist</span><input value={editArtist} onChange={(event) => setEditArtist(event.target.value)} /></label><button className="primary-button" disabled={!editTitle.trim()} onClick={async () => { try { await invoke("library_edit_item", { itemId: editItem.id, title: editTitle.trim(), artist: editArtist.trim() }); setEditItem(null); setNotice(`Updated “${editTitle.trim()}”.`); if (active === "library") void reloadCurrentLibrary(); } catch (error) { setNotice(`Song edit failed: ${errorMessage(error)}`); } }}>Save changes</button></div></div>}
      {menuItem && <div className="detail-overlay menu-overlay" role="dialog" aria-modal="true" onClick={() => { setMenuItem(null); setPlayerMenuOpen(false); }}><div className="menu-panel" onClick={(event) => event.stopPropagation()}><div className="menu-heading"><strong>{menuItem.title}</strong><button className="close-button" title="Close" aria-label="Close" onClick={() => { setMenuItem(null); setPlayerMenuOpen(false); }}>×</button></div>{playerMenuOpen && <><button className="menu-option" onClick={() => { setMenuItem(null); setPlayerMenuOpen(false); setSpeedDialogOpen(true); }}>Advanced playback · x{playbackSpeed.toFixed(2)}</button><button className="menu-option" onClick={() => { setMenuItem(null); setPlayerMenuOpen(false); setSleepTimerMinutes(sleepTimerDefault); setSleepTimerOpen(true); }}>Sleep timer</button></>}{!playerMenuOpen && (menuItem.kind === "song" || menuItem.kind === "episode") && <button className="menu-option" onClick={() => void performMenuAction("play", menuItem)}>Play in Meld</button>}{menuItem.kind === "podcast" && <div className="menu-quick-actions"><button className="menu-option" onClick={() => void performMenuAction("podcast_save", menuItem)}>{menuState.podcastSaved ? "Remove from library" : "Save to Podcasts"}</button><button className="menu-option" onClick={() => void performMenuAction("share", menuItem)}>Share</button></div>}{(menuItem.kind === "song" || menuItem.kind === "episode") && <div className="menu-quick-actions">{!playerMenuOpen && isLocalLibraryMenuContext(menuItem) && <button className="menu-option" onClick={() => void performMenuAction("edit", menuItem)}>Edit</button>}<button className="menu-option" onClick={() => void performMenuAction("playlist", menuItem)}>Add to playlist</button>{menuItem.videoId && !menuItem.localPath && <button className="menu-option" onClick={() => void performMenuAction(playerMenuOpen ? "copy_link" : "share", menuItem)}>{playerMenuOpen ? "Copy link" : "Share"}</button>}{menuItem.videoId && !menuItem.localPath && spotifyStatus.authenticated && <button className="menu-option" onClick={() => void beginSpotifyAdd(menuItem)}>Add to Spotify playlist</button>}</div>}{menuItem.videoId && <>{active === "library" && libraryMode === "cache" && <button className="menu-option" onClick={() => void performMenuAction("cache_remove", menuItem)}>Remove playback cache</button>}{menuDownload?.state === "downloading" ? <button className="menu-option" onClick={() => void performMenuAction("download_cancel", menuItem)}>Cancel offline download{menuDownload.totalBytes ? ` · ${Math.round((menuDownload.bytes / menuDownload.totalBytes) * 100)}%` : ""}</button> : menuDownload?.state === "completed" ? <button className="menu-option" onClick={() => void performMenuAction("download_remove", menuItem)}>Remove offline download</button> : !menuItem.localPath ? <button className="menu-option" onClick={() => void performMenuAction("download", menuItem)}>{menuDownload?.state === "failed" ? "Retry offline download" : menuDownload?.state === "cancelled" ? "Resume offline download" : "Download for offline listening"}</button> : null}{menuDownload?.state === "completed" && <span className="menu-note">Offline download ready{menuDownload.artworkPath ? " · artwork cached" : " · artwork unavailable"}{menuDownload.lyricsCached ? " · lyrics cached" : " · lyrics unavailable"}</span>}{(menuDownload?.state === "failed" || menuDownload?.state === "cancelled") && menuDownload.error && <span className="menu-note error-text">{menuDownload.error}</span>}</>}{!playerMenuOpen && <button className="menu-option" onClick={() => void performMenuAction(menuState.pinned ? "unpin" : "pin", menuItem)}>{menuState.pinned ? "Unpin from Speed Dial" : "Pin to Speed Dial"}</button>}{(menuItem.kind === "song" || menuItem.kind === "episode") && <>{menuItem.kind === "song" && !menuItem.localPath && menuItem.artists.some((value) => value.id) && <button className="menu-option" onClick={() => void performMenuAction("artist", menuItem)}>View artist{menuItem.artists.filter((value) => value.id).length > 1 ? "s" : ""}</button>}{menuItem.kind === "song" && menuItem.albumId && <button className="menu-option" onClick={() => void performMenuAction("album", menuItem)}>View album{menuItem.albumTitle ? ` · ${menuItem.albumTitle}` : ""}</button>}<button className="menu-option" onClick={() => void performMenuAction("info", menuItem)}>Details</button>{!playerMenuOpen && menuItem.videoId && <button className="menu-option" onClick={() => void performMenuAction("refetch", menuItem)}>Refetch metadata</button>}{menuSpotifyMatch && <button className="menu-option" onClick={() => void performMenuAction("change_youtube_version", menuItem)}>Change YouTube version</button>}{!playerMenuOpen && menuState.uploaded && sessionStatus.authenticated && <button className="menu-option" onClick={() => void performMenuAction("delete_uploaded", menuItem)}>Delete uploaded song</button>}{!playerMenuOpen && playlist?.data.playlist.id?.startsWith("LOCAL_") && <button className="menu-option" onClick={() => void performMenuAction("remove_from_playlist", menuItem)}>Remove from playlist</button>}{menuItem.videoId && <button className="menu-option" onClick={() => void performMenuAction("radio", menuItem)}>Start radio</button>}{!playerMenuOpen && (menuItem.videoId || menuItem.localPath) && <button className="menu-option" onClick={() => void performMenuAction("play_next", menuItem)}>Play next</button>}</>}{menuItem.kind === "song" && <>{!playerMenuOpen && menuItem.historyRemoveToken && <button className="menu-option" onClick={() => void performMenuAction("remove_history", menuItem)}>Remove from YouTube Music history</button>}{!playerMenuOpen && isLocalLibraryMenuContext(menuItem) && <button className="menu-option" onClick={() => void performMenuAction("meld_like", menuItem)}>{menuState.liked ? "Remove from Meld Liked Songs" : "Add to Meld Liked Songs"}</button>}{!menuItem.localPath && <button className="menu-option" onClick={() => void performMenuAction(menuState.inLibrary ? "remove_library" : "add_library", menuItem)}>{menuState.inLibrary ? "Remove from library" : "Add to library"}</button>}</>}{menuItem.kind === "episode" && <>{!playerMenuOpen && <button className="menu-option" onClick={() => void performMenuAction("episode_save", menuItem)}>{menuState.inLibrary ? "Remove from Saved Episodes" : "Save for later"}</button>}{menuItem.albumId && <><button className="menu-option" onClick={() => void performMenuAction("album", menuItem)}>View podcast{menuItem.albumTitle ? ` · ${menuItem.albumTitle}` : ""}</button><button className="menu-option" onClick={() => void performMenuAction("podcast_save", menuItem)}>{menuState.podcastSaved ? "Unsubscribe from podcast" : "Subscribe to podcast"}</button></>}</>}{!playerMenuOpen && <button className="menu-option" onClick={() => void performMenuAction("queue", menuItem)}>Add to queue</button>}</div></div>}
      {speedDialogOpen && <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setSpeedDialogOpen(false)}><div className="detail-panel speed-dialog" onClick={(event) => event.stopPropagation()}><button className="close-button" title="Close" aria-label="Close" onClick={() => setSpeedDialogOpen(false)}>×</button><p className="eyebrow">Player</p><h2>{settings.varispeed === true ? "Playback speed" : "Tempo and pitch"}</h2><p className="muted-copy">{settings.varispeed === true ? "Change speed with pitch following, matching Meld’s varispeed mode." : "Change playback tempo. Desktop keeps pitch with the native audio element when varispeed is off."}</p><label className="speed-control"><strong>x{playbackSpeed.toFixed(2)}</strong><input type="range" min="0.25" max="2" step="0.05" value={playbackSpeed} onChange={(event) => setPlaybackSpeed(Number(event.currentTarget.value))} aria-label="Playback speed" /></label><div className="dialog-actions"><button className="secondary-button" onClick={() => setPlaybackSpeed(1)}>Reset</button><button className="primary-button" onClick={() => setSpeedDialogOpen(false)}>Done</button></div></div></div>}{sleepTimerOpen && <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setSleepTimerOpen(false)}><div className="detail-panel sleep-timer-panel" onClick={(event) => event.stopPropagation()}><button className="close-button" title="Close" aria-label="Close" onClick={() => setSleepTimerOpen(false)}>×</button><p className="eyebrow">Player</p><h2>Sleep timer</h2><p className="muted-copy">Stop playback after a set time or when the current song ends.</p><label className="sleep-timer-value"><strong>{sleepTimerMinutes} minutes</strong><input type="range" min="5" max="120" step="5" value={sleepTimerMinutes} onChange={(event) => setSleepTimerMinutes(Number(event.currentTarget.value))} aria-label="Sleep timer minutes" /></label><label className="setting-row"><span><strong>Stop after current song</strong><small>After the timer expires, finish this song and pause.</small></span><input type="checkbox" checked={sleepTimerStopAfterCurrent} onChange={(event) => setSleepTimerStopAfterCurrent(event.target.checked)} /></label><label className="setting-row"><span><strong>Fade out</strong><small>Lower volume during the final minute.</small></span><input type="checkbox" checked={sleepTimerFadeOut} onChange={(event) => setSleepTimerFadeOut(event.target.checked)} /></label><div className="dialog-actions"><button className="secondary-button" onClick={() => clearSleepTimer()}>Clear timer</button><button className="secondary-button" onClick={() => void invoke("settings_set", { key: "sleepTimerDefault", value: String(sleepTimerMinutes) }).then(() => { setSleepTimerDefault(sleepTimerMinutes); setNotice(`Sleep timer default set to ${sleepTimerMinutes} minutes.`); }).catch((error) => setNotice(`Sleep timer default could not be saved: ${errorMessage(error)}`))}>Set as default</button><button className="secondary-button" onClick={() => startSleepTimer(true)}>End of song</button><button className="primary-button" onClick={() => startSleepTimer(false)}>Start timer</button></div></div></div>}{artistPickerItem && <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setArtistPickerItem(null)}><div className="detail-panel picker-panel" onClick={(event) => event.stopPropagation()}><button className="close-button" title="Close" aria-label="Close" onClick={() => setArtistPickerItem(null)}>×</button><p className="eyebrow">Artist selection</p><h2>{artistPickerItem.title}</h2><p className="muted-copy">Meld found more than one source artist for this item.</p><div className="picker-list">{artistPickerItem.artists.filter((artist) => artist.id).map((artist) => <button className="menu-option" key={artist.id} onClick={() => { setArtistPickerItem(null); void openItem({ id: artist.id as string, kind: "artist", title: artist.name, subtitle: "Artist", artists: [], browseId: artist.id }); }}>{artist.name}</button>)}</div></div></div>}
      {playlistPickerItems && <div className="detail-overlay" role="dialog" aria-modal="true"><div className="detail-panel picker-panel"><button className="close-button" title="Close" aria-label="Close" onClick={() => setPlaylistPickerItems(null)}>×</button><p className="eyebrow">Add to playlist</p><h2>{playlistPickerItems.length === 1 ? playlistPickerItems[0].title : `${playlistPickerItems.length} selected songs`}</h2><button className="primary-button" onClick={openCreatePlaylistDialog}>Create playlist</button><div className="playlist-picker-toolbar"><label className="library-search"><span>Search</span><input value={playlistPickerSearch} onChange={(event) => setPlaylistPickerSearch(event.target.value)} placeholder="Search playlists" aria-label="Search playlists to add to" /></label><select className="library-sort" value={playlistPickerSort} onChange={(event) => setPlaylistPickerSort(event.target.value as PlaylistSort)} aria-label="Sort playlists to add to"><option value="name">Name</option><option value="count">Song count</option><option value="created">Recently added</option></select><button className="secondary-button" onClick={() => setPlaylistPickerSortDescending((value) => !value)} title="Reverse playlist order">{playlistPickerSortDescending ? "Descending" : "Ascending"}</button></div><div className="picker-list">{visiblePlaylistPicker.length === 0 ? <p className="muted-copy">{playlistPickerSearch.trim() ? "No matching playlists." : "No playlists exist yet."}</p> : visiblePlaylistPicker.map((item) => <button className="menu-option" key={item.id} onClick={() => void addToSelectedPlaylist(item.id)}>{item.title}{item.songCount === undefined ? "" : ` · ${item.songCount} song${item.songCount === 1 ? "" : "s"}`}</button>)}</div></div></div>}
      {createPlaylistOpen && <div className="detail-overlay" role="dialog" aria-modal="true"><div className="detail-panel picker-panel"><button className="close-button" title="Close" aria-label="Close" onClick={() => setCreatePlaylistOpen(false)}>×</button><p className="eyebrow">My Playlists</p><h2>Create playlist</h2><p className="muted-copy">Creates a playlist on this device. YouTube Music saved playlists appear after a connected-account sync.</p>{sessionStatus.authenticated && settings.ytmSync === true && <label className="setting-row playlist-sync-toggle"><span><strong>Sync with YouTube Music</strong><small>Uses the live authenticated playlist/create path.</small></span><input type="checkbox" checked={createSyncedPlaylist} onChange={(event) => setCreateSyncedPlaylist(event.target.checked)} /></label>}<input className="playlist-name-input" value={newPlaylistTitle} onChange={(event) => setNewPlaylistTitle(event.target.value)} placeholder="Playlist name" autoFocus onKeyDown={(event) => { if (event.key === "Enter") void createLocalPlaylist(); }} /><button className="primary-button" disabled={!newPlaylistTitle.trim()} onClick={() => void createLocalPlaylist()}>Create playlist</button></div></div>}
      {logoutDialogOpen && <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setLogoutDialogOpen(false)}><div className="detail-panel picker-panel" onClick={(event) => event.stopPropagation()}><button className="close-button" title="Close" aria-label="Close" onClick={() => setLogoutDialogOpen(false)}>×</button><p className="eyebrow">Google / YouTube Music</p><h2>Disconnect account?</h2><p className="muted-copy">Choose whether to keep your Meld library. Offline downloaded files are kept when local library data is cleared, matching Meld’s logout choices.</p><div className="dialog-actions"><button className="secondary-button" onClick={() => void confirmGoogleLogout(true)}>Clear local data</button><button className="primary-button" onClick={() => void confirmGoogleLogout(false)}>Keep local data</button></div></div></div>}
      {settingsOpen && <div className="detail-overlay settings-overlay" role="dialog" aria-modal="true"><div className="detail-panel settings-panel"><button className="close-button" title={settingsPage === "main" ? "Close" : "Back to settings"} aria-label={settingsPage === "main" ? "Close" : "Back to settings"} onClick={() => settingsPage === "main" ? setSettingsOpen(false) : setSettingsPage("main")}>{settingsPage === "main" ? "×" : "‹"}</button><p className="eyebrow">Meld Desktop</p><h2>{settingsPage === "main" ? "Settings" : settingsPage === "player" ? "Player and audio" : settingsPage === "content" ? "Content" : settingsPage === "privacy" ? "Privacy" : settingsPage === "storage" ? "Storage and data" : settingsPage === "integrations" ? "Integrations" : settingsPage === "appearance" ? "Appearance" : "About"}</h2>{!settingsLoading && settingsPage === "main" && <div className="settings-hub"><button className="settings-nav-card" onClick={() => setSettingsPage("appearance")}><strong>Appearance</strong><small>Theme and player presentation</small></button><button className="settings-nav-card" onClick={() => setSettingsPage("player")}><strong>Player and audio</strong><small>Queue, automix, and playback behavior</small></button><button className="settings-nav-card" onClick={() => setSettingsPage("content")}><strong>Content</strong><small>Library sync, explicit content, and lyrics providers</small></button><button className="settings-nav-card" onClick={() => setSettingsPage("privacy")}><strong>Privacy</strong><small>Listen/search history controls</small></button><button className="settings-nav-card" onClick={() => setSettingsPage("storage")}><strong>Storage and data</strong><small>Local library and offline data</small></button><button className="settings-nav-card" onClick={() => setSettingsPage("integrations")}><strong>Integrations</strong><small>Google and Spotify accounts</small></button><button className="settings-nav-card" onClick={() => setSettingsPage("about")}><strong>About</strong><small>Version and project information</small></button></div>}{settingsPage === "appearance" && <div className="settings-group"><h3>Appearance</h3><p className="muted-copy">Meld’s source appearance screen contains Android-specific theme, palette, and density controls. Desktop keeps one native dark shell here until those controls have a real Windows renderer implementation; no inert switches are shown.</p></div>}{settingsPage === "storage" && <div className="settings-group"><h3>Storage and data</h3><p className="muted-copy">Offline downloads and the SQLite library are managed by their real download, playlist, logout, and clear-data actions. Desktop playback cache is separate and appears in the Cached playlist; Android Media3 cache limits and pre-cache controls are not represented as fake settings.</p><div className="storage-actions"><button className="secondary-button" onClick={async () => { try { const path = await invoke<string>("backup_create"); setNotice(`Meld Desktop backup created at ${path}.`); } catch (error) { if (!String(error).toLowerCase().includes("cancelled")) setNotice(`Backup could not be created: ${errorMessage(error)}`); } }}>Create backup</button><button className="secondary-button" onClick={async () => { try { const path = await invoke<string>("backup_restore"); setNotice(`Backup restored from ${path}. Restart Meld Desktop to reload the restored library.`); } catch (error) { if (!String(error).toLowerCase().includes("cancelled")) setNotice(`Backup could not be restored: ${errorMessage(error)}`); } }}>Restore backup</button></div><p className="muted-copy">Backups contain the Desktop SQLite library and non-sensitive settings only. Downloaded/player-cache media files and imported external media are not embedded. Google/YouTube Music and Spotify sessions are excluded and must be connected again after restore.</p></div>}{settingsPage === "about" && <div className="settings-group"><h3>About Meld Desktop</h3><p className="muted-copy">Native Tauri desktop adaptation of the live Meld/Metrolist source contracts. Source-dependent features remain tracked in the audit rather than being presented as complete.</p></div>}{settingsLoading ? <div className="state-panel"><div className="spinner" /><p>Loading saved settings…</p></div> : <>{settingsPage === "content" && <div className="settings-group"><h3>Content</h3><label className="setting-row"><span><strong>Hide explicit content</strong><small>Hide items whose live metadata marks them explicit.</small></span><input type="checkbox" checked={settings.hideExplicit} onChange={(event) => void setSetting("hideExplicit", event.target.checked)} /></label><label className="setting-row"><span><strong>Hide video songs</strong><small>Hide songs whose live source metadata marks them as video-only.</small></span><input type="checkbox" checked={settings.hideVideoSongs} onChange={(event) => void setSetting("hideVideoSongs", event.target.checked)} /></label><label className="setting-row"><span><strong>Enable Better Lyrics</strong><small>Use the source TTML lyrics provider first when enabled.</small></span><input type="checkbox" checked={settings.enableBetterLyrics !== false} onChange={(event) => void setSetting("enableBetterLyrics", event.target.checked)} /></label><label className="setting-row"><span><strong>Enable Paxsenix</strong><small>Use the source Apple Music lyrics fallback after Better Lyrics when enabled.</small></span><input type="checkbox" checked={settings.enablePaxsenix !== false} onChange={(event) => void setSetting("enablePaxsenix", event.target.checked)} /></label><label className="setting-row"><span><strong>Enable LRCLIB</strong><small>Use the source LRCLIB matching fallback when enabled.</small></span><input type="checkbox" checked={settings.enableLrclib !== false} onChange={(event) => void setSetting("enableLrclib", event.target.checked)} /></label><label className="setting-row"><span><strong>Enable KuGou</strong><small>Use the source KuGou LRC fallback after LRCLIB when enabled.</small></span><input type="checkbox" checked={settings.enableKugou !== false} onChange={(event) => void setSetting("enableKugou", event.target.checked)} /></label><label className="setting-row"><span><strong>Enable LyricsPlus</strong><small>Use the source LyricsPlus mirror fallback after KuGou when enabled.</small></span><input type="checkbox" checked={settings.enableLyricsPlus === true} onChange={(event) => void setSetting("enableLyricsPlus", event.target.checked)} /></label><label className="setting-row"><span><strong>Enable Musixmatch</strong><small>Use the source opt-in Musixmatch guest-token fallback when available.</small></span><input type="checkbox" checked={settings.enableMusixmatch === true} onChange={(event) => void setSetting("enableMusixmatch", event.target.checked)} /></label><label className="setting-row"><span><strong>Sync YouTube Music library</strong><small>When enabled, Liked Songs, Library, and Uploaded filters use the authenticated source sync path.</small></span><input type="checkbox" disabled={!sessionStatus.authenticated} checked={settings.ytmSync !== false} onChange={(event) => void setSetting("ytmSync", event.target.checked)} /></label><label className="setting-row"><span><strong>Use login for browse</strong><small>Use the connected YouTube Music session for Home, search, details, playlists, and related browse requests, matching Meld’s Account setting.</small></span><input type="checkbox" disabled={!sessionStatus.authenticated} checked={settings.useLoginForBrowse !== false} onChange={(event) => void setSetting("useLoginForBrowse", event.target.checked)} /></label></div>}{settingsPage === "privacy" && <div className="settings-group"><h3>Privacy</h3><label className="setting-row"><span><strong>Pause listen history</strong><small>Do not add locally played items to Meld’s listening history.</small></span><input type="checkbox" checked={settings.pauseListenHistory === true} onChange={(event) => void setSetting("pauseListenHistory", event.target.checked)} /></label><label className="setting-row"><span><strong>Pause search history</strong><small>Do not save submitted searches to Meld’s recent-search list.</small></span><input type="checkbox" checked={settings.pauseSearchHistory === true} onChange={(event) => void setSetting("pauseSearchHistory", event.target.checked)} /></label><button className="secondary-button" onClick={async () => { try { await invoke("search_history_clear"); await loadSearchHistory(); setNotice("Meld search history cleared."); } catch (error) { setNotice(`Search history could not be cleared: ${errorMessage(error)}`); } }}>Clear search history</button></div>}{settingsPage === "content" && <div className="settings-group"><h3>Lyrics provider order</h3><p className="muted-copy">Enabled providers are tried in this order. Disabled providers remain after them, matching Meld’s provider registry.</p><div className="lyrics-provider-order">{lyricsProviderOrder.map((provider, index) => { const enabled = provider === "YouTube" || provider === "YouTubeSubtitle" || settings[lyricProviderSettingKeys[provider] ?? ""] === true; return <div className={enabled ? "provider-order-row" : "provider-order-row disabled"} key={provider}><span><strong>{provider === "YouTubeSubtitle" ? "YouTube Subtitle" : provider}</strong><small>{enabled ? `Priority ${index + 1}` : "Disabled"}</small></span>{enabled && <span className="provider-order-buttons"><button className="secondary-button" disabled={index === 0} onClick={() => void moveLyricsProvider(provider, -1)} title={`Move ${provider} up`}>↑</button><button className="secondary-button" disabled={index === lyricsProviderOrder.length - 1} onClick={() => void moveLyricsProvider(provider, 1)} title={`Move ${provider} down`}>↓</button></span>}</div>; })}</div></div>}{settingsPage === "player" && <div className="settings-group"><h3>Player and queue</h3><label className="setting-row"><span><strong>Varispeed</strong><small>When enabled, playback speed follows pitch like Meld’s varispeed mode.</small></span><input type="checkbox" checked={settings.varispeed === true} onChange={(event) => void setSetting("varispeed", event.target.checked)} /></label><label className="setting-row"><span><strong>Incremental seek skip</strong><small>Repeated double-clicks on the player artwork increase the 5-second seek step, matching Meld.</small></span><input type="checkbox" checked={settings.seekExtraSeconds === true} onChange={(event) => void setSetting("seekExtraSeconds", event.target.checked)} /></label><label className="setting-row"><span><strong>Pause on mute</strong><small>Pause playback when volume reaches zero and resume when volume is raised again.</small></span><input type="checkbox" checked={settings.pauseOnMute === true} onChange={(event) => void setSetting("pauseOnMute", event.target.checked)} /></label><label className="setting-row"><span><strong>Persistent queue</strong><small>Restore the current Meld queue after restarting the desktop app.</small></span><input type="checkbox" checked={settings.persistentQueue === true} onChange={(event) => void setSetting("persistentQueue", event.target.checked)} /></label><label className="setting-row"><span><strong>Load more automatically</strong><small>Use Meld’s queue continuation and automix loading when available.</small></span><input type="checkbox" checked={settings.autoLoadMore !== false} onChange={(event) => void setSetting("autoLoadMore", event.target.checked)} /></label><label className="setting-row"><span><strong>Similar content / automix</strong><small>Fetch related source songs when the current queue ends.</small></span><input type="checkbox" checked={settings.similarContent !== false} onChange={(event) => void setSetting("similarContent", event.target.checked)} /></label><label className="setting-row"><span><strong>Disable load more on Repeat all</strong><small>Keep Repeat all from appending automix content, matching Meld’s source option.</small></span><input type="checkbox" checked={settings.disableLoadMoreWhenRepeatAll === true} onChange={(event) => void setSetting("disableLoadMoreWhenRepeatAll", event.target.checked)} /></label><label className="setting-row"><span><strong>Auto-download on like</strong><small>When enabled, liking a remote song starts Meld’s native offline cache download.</small></span><input type="checkbox" checked={settings.autoDownloadOnLike === true} onChange={(event) => void setSetting("autoDownloadOnLike", event.target.checked)} /></label><label className="setting-row"><span><strong>Skip failed song automatically</strong><small>Move to the next queue item when native playback reports an error.</small></span><input type="checkbox" checked={settings.autoSkipNextOnError === true} onChange={(event) => void setSetting("autoSkipNextOnError", event.target.checked)} /></label><label className="setting-row"><span><strong>Remember shuffle and repeat</strong><small>Persist the source shuffle/repeat preferences across launches.</small></span><input type="checkbox" checked={settings.rememberShuffleAndRepeat !== false} onChange={(event) => void setSetting("rememberShuffleAndRepeat", event.target.checked)} /></label><label className="setting-row"><span><strong>Shuffle playlist first</strong><small>Source queue preference for starting playlist playback in shuffled order.</small></span><input type="checkbox" checked={settings.shufflePlaylistFirst === true} onChange={(event) => void setSetting("shufflePlaylistFirst", event.target.checked)} /></label><label className="setting-row"><span><strong>Prevent duplicate queue tracks</strong><small>Do not add another copy of an item already present in the queue.</small></span><input type="checkbox" checked={settings.preventDuplicateTracksInQueue === true} onChange={(event) => void setSetting("preventDuplicateTracksInQueue", event.target.checked)} /></label></div>}{settingsPage === "appearance" && <div className="settings-group"><h3>Auto playlists</h3><label className="setting-row"><span><strong>Show Liked Songs playlist</strong><small>Show Meld’s single liked-songs playlist in My Playlists.</small></span><input type="checkbox" checked={settings.show_liked_playlist !== false} onChange={(event) => void setSetting("show_liked_playlist", event.target.checked)} /></label><label className="setting-row"><span><strong>Show Cached playlist</strong><small>Show songs cached during playback. This is separate from Meld’s explicit Downloaded playlist.</small></span><input type="checkbox" checked={settings.show_cached_playlist !== false} onChange={(event) => void setSetting("show_cached_playlist", event.target.checked)} /></label><label className="setting-row"><span><strong>Show Downloaded playlist</strong><small>Show songs downloaded for offline listening.</small></span><input type="checkbox" checked={settings.show_downloaded_playlist !== false} onChange={(event) => void setSetting("show_downloaded_playlist", event.target.checked)} /></label><label className="setting-row"><span><strong>Show Uploaded playlist</strong><small>Show the YouTube Music uploaded-songs playlist after account sync.</small></span><input type="checkbox" checked={settings.show_uploaded_playlist !== false} onChange={(event) => void setSetting("show_uploaded_playlist", event.target.checked)} /></label><label className="setting-row"><span><strong>Show Top Songs playlist</strong><small>Show the source-style most-played playlist built from Meld listening history.</small></span><input type="checkbox" checked={settings.show_top_playlist !== false} onChange={(event) => void setSetting("show_top_playlist", event.target.checked)} /></label></div>}{settingsPage === "integrations" && <div className="settings-group"><h3>Accounts</h3><div className="setting-status"><strong>Google / YouTube Music</strong><span>{sessionStatus.authenticated ? `Connected${sessionStatus.accountEmail ? ` as ${sessionStatus.accountEmail}` : ""}. Authenticated library actions can use the saved session.` : "Connect inside Meld Desktop to sync liked songs, account playlists, and library actions."}</span>{sessionStatus.authenticated ? <button className="secondary-button" onClick={() => void logoutGoogle()}>Disconnect account</button> : <button className="secondary-button" onClick={() => void connectGoogle()}>Connect Google</button>}</div><div className="setting-status"><strong>Spotify</strong><span>{spotifyStatus.authenticated ? `Connected${spotifyProfile?.displayName ? ` as ${spotifyProfile.displayName}` : ""}. Spotify profileAttributes validated with the live GraphQL operation.` : "Connect inside Meld Desktop; the token is validated before the session is saved."}</span>{spotifyStatus.authenticated ? <button className="secondary-button" onClick={() => void logoutSpotify()}>Disconnect Spotify</button> : <button className="secondary-button" onClick={() => void connectSpotify()}>Connect Spotify</button>}</div></div>}</>}</div></div>}
      {infoItem && <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setInfoItem(null)}><div className="detail-panel info-panel" onClick={(event) => event.stopPropagation()}><button className="close-button" title="Close" aria-label="Close" onClick={() => setInfoItem(null)}>×</button><p className="eyebrow">Song details</p><h2>{infoItem.title || "Untitled"}</h2><p className="muted-copy">{infoItem.subtitle}</p><div className="info-grid"><span>Type</span><strong>{infoItem.kind}</strong><span>Video ID</span><strong>{infoItem.videoId || "Not available"}</strong><span>Explicit</span><strong>{infoItem.explicit ? "Yes" : "No"}</strong><span>Music video type</span><strong>{infoItem.musicVideoType || "Not reported"}</strong>{infoItem.artists.length > 0 && <><span>Artists</span><strong>{infoItem.artists.map((value) => value.name).join(", ")}</strong></>}</div></div></div>}
      {detail && (
        <div className="detail-overlay" role="dialog" aria-modal="true">
          <div className="detail-panel">
            <button className="close-button" title="Close" aria-label="Close" onClick={() => setDetail(null)}>×</button>
            {detail.status === "loading" && <div className="state-panel"><div className="spinner" /><p>Loading {detail.data.kind}…</p></div>}
            {detail.status === "error" && <div className="state-panel error"><h2>{detail.data.kind} unavailable</h2><p>{detail.error}</p></div>}
            {detail.status === "ready" && (
              <>
                <div className="playlist-header">
                  {mediaSrc(detail.data.thumbnail) && <img src={mediaSrc(detail.data.thumbnail) as string} alt="" />}
                  <div><p className="eyebrow">{detail.data.kind}</p><h2>{detail.data.title || "Untitled"}</h2><p>{detail.data.subtitle}</p></div>
                </div>
                <div className="playlist-songs">
                  {detail.data.items.length === 0 ? <div className="state-panel"><p>This browse response contained no typed items.</p></div> : detail.data.items.map((item, itemIndex) => (
                    <div className="song-row-wrap" key={`${item.kind}-${item.id}-${itemIndex}`}>
                      <button className="song-row" onClick={() => void openItem(item)}>
                        {mediaSrc(item.thumbnail) && <img src={mediaSrc(item.thumbnail) as string} alt="" />}
                        <span className="song-copy"><strong>{item.title}</strong><small>{item.subtitle}</small></span>
                        <span className="song-kind">{item.kind}</span>
                      </button>
                      {item.kind === "song" && <InlineLikeButton item={item} autoDownloadOnLike={settings.autoDownloadOnLike === true} />}
                      <button className="song-row-menu" onClick={() => void openMenu(item)} title={`More options for ${item.title}`} aria-label={`More options for ${item.title}`}>⋮</button>
                    </div>
                  ))}
                </div>
                {detail.data.continuation && <button className="primary-button playlist-more" disabled={detailMoreLoading} onClick={() => void loadDetailMore()}>{detailMoreLoading ? "Loading more…" : "Load more"}</button>}
              </>
            )}
          </div>
        </div>
      )}
      {playlist && <div className="detail-overlay" role="dialog" aria-modal="true"><div className="detail-panel"><button className="close-button" title="Close" aria-label="Close" onClick={() => setPlaylist(null)}>×</button>{playlist.status === "loading" && <div className="state-panel"><div className="spinner" /><p>Loading playlist songs…</p></div>}{playlist.status === "error" && <div className="state-panel error"><h2>Playlist unavailable</h2><p>{playlist.error}</p></div>}{playlist.status === "ready" && <><div className="playlist-header">{mediaSrc(playlist.data.playlist.thumbnail) && <img src={mediaSrc(playlist.data.playlist.thumbnail) as string} alt="" />}<div><p className="eyebrow">Playlist</p><h2>{playlist.data.playlist.title}</h2><p>{playlist.data.playlist.subtitle}</p></div></div><div className="playlist-songs">{playlist.data.songs.length === 0 ? <div className="state-panel"><p>YouTube Music returned no playlist songs.</p></div> : playlist.data.songs.map((song, index) => <div className="song-row-wrap" key={`${song.id}-${index}`}>{selectionMode && <input className="selection-checkbox" type="checkbox" checked={selectedItems.some((value) => value.id === song.id)} onChange={() => toggleSelectedItem(song)} aria-label={`Select ${song.title}`} />}<button className="song-row" onClick={() => void playItem(song, playlist.data.songs, index)}><span className="song-index">{index + 1}</span>{mediaSrc(song.thumbnail) && <img src={mediaSrc(song.thumbnail) as string} alt="" />}<span className="song-copy"><strong>{song.title}</strong><small>{song.subtitle}</small></span><span className="song-kind">{song.kind}</span></button>{song.kind === "song" && <InlineLikeButton item={song} autoDownloadOnLike={settings.autoDownloadOnLike === true} />}<button className="song-row-menu" onClick={() => void openMenu(song)} title={`More options for ${song.title}`} aria-label={`More options for ${song.title}`}>⋮</button></div>)}</div>{playlist.data.continuation && <button className="primary-button playlist-more" onClick={() => void loadPlaylistMore()}>Load more songs</button>}</>}</div></div>}
      {player && <div className="player-dock"><button className="transport-button" disabled={queueIndex <= 0} onClick={() => void playQueueIndex(queueIndex - 1)} title="Previous">‹</button><div className="dock-copy">{mediaSrc(player.item.thumbnail) && <img src={mediaSrc(player.item.thumbnail) as string} alt="" />}<div><strong>{player.payload.title || player.item.title}</strong><span>{player.payload.artist || player.item.subtitle}</span></div></div><div className="player-controls"><button className="transport-button play-button" onClick={togglePlayback} title={isPlaying ? "Pause" : "Play"}>{isPlaying ? "Ⅱ" : "▶"}</button><span className="time-label">{formatTime(playbackSeconds)}</span><input className="seek-slider" type="range" min="0" max={Math.max(durationSeconds, 1)} step="0.1" value={Math.min(playbackSeconds, Math.max(durationSeconds, 1))} onChange={(event) => seekPlayback(Number(event.currentTarget.value))} aria-label="Seek" /><span className="time-label">{formatTime(durationSeconds)}</span><button className="player-lyrics-button" onClick={() => { setPlayerExpanded(true); setLyricsAutoScrollEnabled(true); if (!lyrics) void openLyrics(player.item); }} title="Open synchronized lyrics" aria-label="Open synchronized lyrics">♫</button><button className={playerItemState?.liked ? "player-action active-control" : "player-action"} onClick={() => void togglePlayerFavorite()} title={playerItemState?.liked ? "Remove from Meld Liked Songs" : "Add to Meld Liked Songs"} aria-label={playerItemState?.liked ? "Remove from Meld Liked Songs" : "Add to Meld Liked Songs"}>{playerItemState?.liked ? "♥" : "♡"}</button><button className="player-action" onClick={() => void shareItem(player.item)} title="Share" aria-label="Share">↗</button><button className="player-action" onClick={() => void openPlayerMenu()} title="More actions" aria-label="More actions">⋮</button><label className="volume-control" title="Volume"><span>Vol</span><input type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => updateVolume(Number(event.currentTarget.value))} aria-label="Volume" /></label></div><audio className="native-audio" ref={audioRef} preload="auto" onLoadedMetadata={(event) => setDurationSeconds(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} onTimeUpdate={(event) => setPlaybackSeconds(event.currentTarget.currentTime)} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={async () => { if (sleepTimerEndOfSong) { clearSleepTimer(); setIsPlaying(false); return; } if (repeatMode === "one") { if (audioRef.current) { audioRef.current.currentTime = 0; void audioRef.current.play(); } return; } setIsPlaying(false); if (queueIndex + 1 < queueItems.length || queueContinuation) { void playQueueIndex(queueIndex + 1); return; } if (repeatMode === "all" && queueItems.length > 0) { void playQueueIndex(0); return; } const current = player?.item; if (!current?.videoId) return; const existing = queueItems; const additions = await loadAutomixItems(current, existing); if (additions.length > 0) { const nextItems = [...existing, ...additions]; setQueueItems(nextItems); setQueueContinuation(null); void playItem(additions[0], nextItems, existing.length, null); } }} onError={() => { setNotice("The native audio element could not read the resolved stream URL."); if (settings.autoSkipNextOnError && (queueIndex + 1 < queueItems.length || queueContinuation)) void playQueueIndex(queueIndex + 1); }} /><div className="dock-transport-actions"><button className="transport-button" disabled={queueIndex < 0 || (queueIndex + 1 >= queueItems.length && !queueContinuation)} onClick={() => void playQueueIndex(queueIndex + 1)} title="Next">›</button><button className={shuffleEnabled ? "queue-button active-control" : "queue-button"} onClick={() => void toggleShuffle()} title={shuffleEnabled ? "Turn shuffle off" : "Turn shuffle on"} aria-label={shuffleEnabled ? "Turn shuffle off" : "Turn shuffle on"}>⤨</button><button className={repeatMode === "off" ? "queue-button" : "queue-button active-control"} onClick={() => void cycleRepeat()} title={`Repeat mode: ${repeatMode}`} aria-label={`Repeat mode: ${repeatMode}`}>↻</button><button className="queue-button" onClick={() => setQueueOpen(true)} title="Open queue" aria-label="Open queue">☰</button><button className="player-expand" onClick={() => { setPlayerExpanded(true); setLyricsAutoScrollEnabled(true); if (!lyrics) void openLyrics(player.item); }} title="Open full player" aria-label="Open full player">↗</button></div><button className="dock-close" onClick={() => { audioRef.current?.pause(); setPlayer(null); setPlayerExpanded(false); setIsPlaying(false); }} title="Close player" aria-label="Close player">×</button></div>}
      {queueOpen && player && <div className="detail-overlay queue-overlay" role="dialog" aria-modal="true" onClick={() => setQueueOpen(false)}><div className="queue-panel" onClick={(event) => event.stopPropagation()}><button className="close-button" title="Close" aria-label="Close" onClick={() => setQueueOpen(false)}>×</button><div className="queue-heading"><div><p className="eyebrow">Queue</p><h2>{queueItems.length > 0 ? `${queueItems.length} songs` : "Queue"}</h2></div>{queueItems.length > 0 && <button className="secondary-button" onClick={clearQueue}>Clear queue</button>}</div><div className="queue-list">{queueItems.length === 0 ? <div className="state-panel"><p>No songs are queued.</p></div> : queueItems.map((item, index) => <div key={`${item.id}-${index}`} className={index === queueIndex ? "queue-item active" : "queue-item"}><button className="queue-item-play" onClick={() => { setQueueOpen(false); void playQueueIndex(index); }}><span>{index + 1}</span>{mediaSrc(item.thumbnail) && <img src={mediaSrc(item.thumbnail) as string} alt="" />}<span><strong>{item.title}</strong><small>{item.subtitle}</small></span></button><span className="queue-item-actions"><button className="queue-item-action" disabled={index === 0} onClick={() => moveQueueItem(index, index - 1)} title="Move up" aria-label={`Move ${item.title} up`}>↑</button><button className="queue-item-action" disabled={index === queueItems.length - 1} onClick={() => moveQueueItem(index, index + 1)} title="Move down" aria-label={`Move ${item.title} down`}>↓</button><button className="queue-item-action" onClick={() => removeQueueItem(index)} title="Remove from queue" aria-label={`Remove ${item.title} from queue`}>×</button></span></div>)}</div></div></div>}
      {playerExpanded && player && <div className="detail-overlay player-overlay" role="dialog" aria-modal="true" onClick={() => { setPlayerExpanded(false); setLyrics(null); }}><div className="full-player-panel" onClick={(event) => event.stopPropagation()}><button className="close-button" title="Close" aria-label="Close" onClick={() => { setPlayerExpanded(false); setLyrics(null); }}>×</button><div className="full-player-art" onDoubleClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); seekByPlayerGesture(event.clientX < bounds.left + bounds.width / 2 ? -1 : 1); }} title="Double-click the left or right side to seek">{mediaSrc(player.item.thumbnail) ? <img src={mediaSrc(player.item.thumbnail) as string} alt="" /> : <div className="item-art empty-art">M</div>}</div><div className="full-player-meta"><p className="eyebrow">Now playing in Meld</p><h2>{player.payload.title || player.item.title}</h2><p>{player.payload.artist || player.item.subtitle}</p><div className="full-player-actions"><button className="player-action" onClick={() => void shareItem(player.item)} title="Share" aria-label="Share">↗</button><button className={playerItemState?.liked ? "player-action active-control" : "player-action"} onClick={() => void togglePlayerFavorite()} title={playerItemState?.liked ? "Remove from Meld Liked Songs" : "Add to Meld Liked Songs"} aria-label={playerItemState?.liked ? "Remove from Meld Liked Songs" : "Add to Meld Liked Songs"}>{playerItemState?.liked ? "♥" : "♡"}</button><button className="player-action" onClick={() => void openPlayerMenu()} title="More actions" aria-label="More actions">⋮</button></div><div className="full-player-controls"><button className="transport-button" disabled={queueIndex <= 0} onClick={() => void playQueueIndex(queueIndex - 1)} title="Previous">‹</button><button className="transport-button play-button" onClick={togglePlayback} title={isPlaying ? "Pause" : "Play"}>{isPlaying ? "Ⅱ" : "▶"}</button><button className="transport-button" disabled={queueIndex < 0 || (queueIndex + 1 >= queueItems.length && !queueContinuation)} onClick={() => void playQueueIndex(queueIndex + 1)} title="Next">›</button><button className={shuffleEnabled ? "queue-button active-control" : "queue-button"} onClick={() => void toggleShuffle()} title={shuffleEnabled ? "Turn shuffle off" : "Turn shuffle on"} aria-label={shuffleEnabled ? "Turn shuffle off" : "Turn shuffle on"}>⤨</button><button className={repeatMode === "off" ? "queue-button" : "queue-button active-control"} onClick={() => void cycleRepeat()} title={`Repeat mode: ${repeatMode}`} aria-label={`Repeat mode: ${repeatMode}`}>↻</button><button className="queue-button" onClick={() => setQueueOpen(true)} title="Open queue" aria-label="Open queue">☷</button></div><div className="full-player-progress"><span>{formatTime(playbackSeconds)}</span><input className="seek-slider" type="range" min="0" max={Math.max(durationSeconds, 1)} step="0.1" value={Math.min(playbackSeconds, Math.max(durationSeconds, 1))} onChange={(event) => seekPlayback(Number(event.currentTarget.value))} aria-label="Seek" /><span>{formatTime(durationSeconds)}</span></div><label className="full-volume-control"><span>Volume</span><input type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => updateVolume(Number(event.currentTarget.value))} aria-label="Volume" /></label></div><div className="full-player-lyrics"><div className="section-heading"><div><p className="eyebrow">Lyrics</p><h3>{lyrics?.status === "ready" ? lyrics.data.provider : "Meld lyric providers"}</h3></div><div className="lyrics-navigation"><button className="topbar-button icon-button" onClick={goBack} disabled={!hasTransientLayer && backStack.length === 0} title="Back" aria-label="Back">‹</button><button className="topbar-button icon-button" onClick={navigateForward} disabled={forwardStack.length === 0} title="Forward" aria-label="Forward">›</button></div>{lyrics?.status !== "ready" && <button className="text-button" onClick={() => void openLyrics(player.item)}>Load lyrics</button>}</div>{lyrics?.status === "ready" && lyrics.data.synced && lyrics.data.lines.length > 0 ? <div ref={lyricsContainerRef} className="lyrics-lines" onWheel={() => setLyricsAutoScrollEnabled(false)} onTouchMove={() => setLyricsAutoScrollEnabled(false)} onPointerDown={() => setLyricsAutoScrollEnabled(false)} onKeyDown={() => setLyricsAutoScrollEnabled(false)}>{lyrics.data.lines.map((line, index) => <button ref={index === activeLyricIndex ? activeLyricRef : undefined} key={`${line.timeMs}-${index}`} className={index === activeLyricIndex ? "lyric-line active" : "lyric-line"} onClick={() => { setLyricsAutoScrollEnabled(true); if (audioRef.current) audioRef.current.currentTime = line.timeMs / 1000; }}>{line.text}</button>)}</div> : lyrics?.status === "ready" ? <pre className="lyrics-text">{lyrics.data.text}</pre> : <div className="state-panel"><p>Open lyrics to load the source provider chain.</p></div>}</div></div></div>}
      {!playerExpanded && lyrics && <div className="detail-overlay" role="dialog" aria-modal="true"><div className="detail-panel lyrics-panel"><button className="close-button" title="Close" aria-label="Close" onClick={() => setLyrics(null)}>×</button>{lyrics.status === "loading" && <div className="state-panel"><div className="spinner" /><p>Loading lyrics from Meld providers…</p></div>}{lyrics.status === "error" && <div className="state-panel error"><h2>Lyrics unavailable</h2><p>{lyrics.error}</p></div>}{lyrics.status === "ready" && <><div className="section-heading"><div><p className="eyebrow">{lyrics.data.provider}{lyrics.data.synced ? " · Synced" : " · Plain"}</p><h2>{lyrics.data.matchedTitle}</h2><p>{lyrics.data.matchedArtist}</p></div><div className="lyrics-navigation"><button className="topbar-button icon-button" onClick={goBack} disabled={!hasTransientLayer && backStack.length === 0} title="Back" aria-label="Back">‹</button><button className="topbar-button icon-button" onClick={navigateForward} disabled={forwardStack.length === 0} title="Forward" aria-label="Forward">›</button></div></div>{lyrics.data.synced && lyrics.data.lines.length > 0 ? <div ref={lyricsContainerRef} className="lyrics-lines" onWheel={() => setLyricsAutoScrollEnabled(false)} onTouchMove={() => setLyricsAutoScrollEnabled(false)} onPointerDown={() => setLyricsAutoScrollEnabled(false)} onKeyDown={() => setLyricsAutoScrollEnabled(false)}>{lyrics.data.lines.map((line, index) => <button ref={index === activeLyricIndex ? activeLyricRef : undefined} key={`${line.timeMs}-${index}`} className={index === activeLyricIndex ? "lyric-line active" : "lyric-line"} onClick={() => { setLyricsAutoScrollEnabled(true); if (audioRef.current) audioRef.current.currentTime = line.timeMs / 1000; }}>{line.text}</button>)}</div> : <pre className="lyrics-text">{lyrics.data.text}</pre>}</>}</div></div>}
    </div>
  );
}

export default App;
