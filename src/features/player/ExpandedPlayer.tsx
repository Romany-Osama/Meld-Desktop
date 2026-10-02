import type { HistoryEntry } from "../../app/history";
import { RefObject, Dispatch, SetStateAction } from "react";
import { mediaSrc } from "../../lib/media";
import { LoadState, LyricsPayload, YtItem, PlayerPayload, LibraryItemState } from "../../types";

export type ExpandedPlayerProps = {
  activeLyricIndex: number;
  activeLyricRef: RefObject<HTMLButtonElement | null>;
  adjustVolumeByWheel: (event: { deltaY: number; preventDefault: () => void }) => void;
  audioRef: RefObject<HTMLAudioElement | null>;
  backStack: HistoryEntry[];
  changeLyricsProvider: (provider: string) => Promise<void>;
  cycleRepeat: () => Promise<void>;
  durationSeconds: number;
  formatTime: (seconds: number) => string;
  forwardStack: HistoryEntry[];
  goBack: () => void;
  hasTransientLayer: boolean;
  isPlaying: boolean;
  lyrics: LoadState<LyricsPayload> | null;
  lyricsContainerRef: RefObject<HTMLDivElement | null>;
  lyricsProviderLoading: boolean;
  lyricsProviderOrder: string[];
  lyricsProviderSelection: string;
  navigateForward: () => void;
  openLyrics: (item: YtItem) => Promise<void>;
  openPlayerMenu: () => Promise<void>;
  playbackSeconds: number;
  player: { item: YtItem; payload: PlayerPayload; session: number } | null;
  playerExpanded: boolean;
  playerItemState: LibraryItemState | null;
  playQueueIndex: (index: number) => Promise<void>;
  queueContinuation: string | null;
  queueIndex: number;
  queueItems: YtItem[];
  repeatMode: "off" | "all" | "one";
  seekByPlayerGesture: (direction: -1 | 1) => void;
  seekPlayback: (value: number) => void;
  setLyrics: Dispatch<SetStateAction<LoadState<LyricsPayload> | null>>;
  setLyricsAutoScrollEnabled: Dispatch<SetStateAction<boolean>>;
  setPlayerExpanded: Dispatch<SetStateAction<boolean>>;
  setQueueOpen: Dispatch<SetStateAction<boolean>>;
  shareItem: (item: YtItem) => Promise<void>;
  shuffleEnabled: boolean;
  togglePlayback: () => void;
  togglePlayerFavorite: () => Promise<void>;
  toggleShuffle: () => Promise<void>;
  updateVolume: (value: number) => void;
  volume: number;
};

export function ExpandedPlayer({
  activeLyricIndex,
  activeLyricRef,
  adjustVolumeByWheel,
  audioRef,
  backStack,
  changeLyricsProvider,
  cycleRepeat,
  durationSeconds,
  formatTime,
  forwardStack,
  goBack,
  hasTransientLayer,
  isPlaying,
  lyrics,
  lyricsContainerRef,
  lyricsProviderLoading,
  lyricsProviderOrder,
  lyricsProviderSelection,
  navigateForward,
  openLyrics,
  openPlayerMenu,
  playbackSeconds,
  player,
  playerExpanded,
  playerItemState,
  playQueueIndex,
  queueContinuation,
  queueIndex,
  queueItems,
  repeatMode,
  seekByPlayerGesture,
  seekPlayback,
  setLyrics,
  setLyricsAutoScrollEnabled,
  setPlayerExpanded,
  setQueueOpen,
  shareItem,
  shuffleEnabled,
  togglePlayback,
  togglePlayerFavorite,
  toggleShuffle,
  updateVolume,
  volume,
}: ExpandedPlayerProps) {
  return (
    <>
      {playerExpanded && player && (
        <div
          className="detail-overlay player-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setPlayerExpanded(false);
            setLyrics(null);
          }}
        >
          <div className="full-player-panel" onClick={(event) => event.stopPropagation()}>
            <button
              className="close-button"
              title="Close"
              aria-label="Close"
              onClick={() => {
                setPlayerExpanded(false);
                setLyrics(null);
              }}
            >
              ×
            </button>
            <div
              className="full-player-art"
              onDoubleClick={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                seekByPlayerGesture(event.clientX < bounds.left + bounds.width / 2 ? -1 : 1);
              }}
              title="Double-click the left or right side to seek"
            >
              {mediaSrc(player.item.thumbnail) ? (
                <img src={mediaSrc(player.item.thumbnail) as string} alt="" />
              ) : (
                <div className="item-art empty-art">M</div>
              )}
            </div>
            <div className="full-player-meta">
              <p className="eyebrow">Now playing in Meld</p>
              <h2 className="full-player-title" title={player.payload.title || player.item.title}>
                {player.payload.title || player.item.title}
              </h2>
              <p>{player.payload.artist || player.item.subtitle}</p>
              <div className="full-player-action-row">
                <div className="full-player-actions">
                  <button
                    className="player-action"
                    onClick={() => void shareItem(player.item)}
                    title="Share"
                    aria-label="Share"
                  >
                    ↗
                  </button>
                  <button
                    className={playerItemState?.liked ? "player-action active-control" : "player-action"}
                    onClick={() => void togglePlayerFavorite()}
                    title={playerItemState?.liked ? "Remove from Meld Liked Songs" : "Add to Meld Liked Songs"}
                    aria-label={playerItemState?.liked ? "Remove from Meld Liked Songs" : "Add to Meld Liked Songs"}
                  >
                    {playerItemState?.liked ? "♥" : "♡"}
                  </button>
                  <button
                    className="player-action"
                    onClick={() => void openPlayerMenu()}
                    title="More actions"
                    aria-label="More actions"
                  >
                    ⋮
                  </button>
                </div>
                <div className="full-player-controls">
                  <button
                    className="transport-button"
                    disabled={queueIndex <= 0}
                    onClick={() => void playQueueIndex(queueIndex - 1)}
                    title="Previous"
                  >
                    ‹
                  </button>
                  <button
                    className="transport-button play-button"
                    onClick={togglePlayback}
                    title={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? "Ⅱ" : "▶"}
                  </button>
                  <button
                    className="transport-button"
                    disabled={queueIndex < 0 || (queueIndex + 1 >= queueItems.length && !queueContinuation)}
                    onClick={() => void playQueueIndex(queueIndex + 1)}
                    title="Next"
                  >
                    ›
                  </button>
                  <button
                    className={shuffleEnabled ? "queue-button active-control" : "queue-button"}
                    onClick={() => void toggleShuffle()}
                    title={shuffleEnabled ? "Turn shuffle off" : "Turn shuffle on"}
                    aria-label={shuffleEnabled ? "Turn shuffle off" : "Turn shuffle on"}
                    aria-pressed={shuffleEnabled}
                  >
                    ⤨
                  </button>
                  <button
                    className={repeatMode === "off" ? "queue-button" : "queue-button active-control"}
                    onClick={() => void cycleRepeat()}
                    title={`Repeat mode: ${repeatMode}`}
                    aria-label={`Repeat mode: ${repeatMode}`}
                  >
                    ↻
                  </button>
                  <button
                    className="queue-button"
                    onClick={() => setQueueOpen(true)}
                    title="Open queue"
                    aria-label="Open queue"
                  >
                    ☷
                  </button>
                </div>
              </div>
              <div className="full-player-progress">
                <span>{formatTime(playbackSeconds)}</span>
                <input
                  className="seek-slider"
                  type="range"
                  min="0"
                  max={Math.max(durationSeconds, 1)}
                  step="0.1"
                  value={Math.min(playbackSeconds, Math.max(durationSeconds, 1))}
                  onChange={(event) => seekPlayback(Number(event.currentTarget.value))}
                  aria-label="Seek"
                />
                <span>{formatTime(durationSeconds)}</span>
              </div>
              <label className="full-volume-control" title="Volume · scroll to adjust" onWheel={adjustVolumeByWheel}>
                <span>Volume</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(event) => updateVolume(Number(event.currentTarget.value))}
                  aria-label="Volume"
                />
              </label>
            </div>
            <div className="full-player-lyrics">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Lyrics</p>
                  <h3>{lyrics?.status === "ready" ? lyrics.data.provider : "Meld lyric providers"}</h3>
                  <label className="lyrics-provider-picker">
                    <span>Provider</span>
                    <select
                      value={lyricsProviderSelection}
                      onChange={(event) => void changeLyricsProvider(event.target.value)}
                      disabled={lyricsProviderLoading}
                      aria-label="Lyrics provider"
                    >
                      <option value="auto">Automatic · provider order</option>
                      {lyricsProviderOrder.map((provider) => (
                        <option key={provider} value={provider}>
                          {provider}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="lyrics-navigation">
                  <button
                    className="topbar-button icon-button"
                    onClick={goBack}
                    disabled={!hasTransientLayer && backStack.length === 0}
                    title="Back"
                    aria-label="Back"
                  >
                    ‹
                  </button>
                  <button
                    className="topbar-button icon-button"
                    onClick={navigateForward}
                    disabled={forwardStack.length === 0}
                    title="Forward"
                    aria-label="Forward"
                  >
                    ›
                  </button>
                </div>
                {lyrics?.status !== "ready" && (
                  <button className="text-button" onClick={() => void openLyrics(player.item)}>
                    Load lyrics
                  </button>
                )}
              </div>
              {lyrics?.status === "ready" && lyrics.data.synced && lyrics.data.lines.length > 0 ? (
                <div
                  ref={lyricsContainerRef}
                  className="lyrics-lines"
                  onWheel={() => setLyricsAutoScrollEnabled(false)}
                  onTouchMove={() => setLyricsAutoScrollEnabled(false)}
                  onPointerDown={() => setLyricsAutoScrollEnabled(false)}
                  onKeyDown={() => setLyricsAutoScrollEnabled(false)}
                >
                  {lyrics.data.lines.map((line, index) => (
                    <button
                      ref={index === activeLyricIndex ? activeLyricRef : undefined}
                      key={`${line.timeMs}-${index}`}
                      className={index === activeLyricIndex ? "lyric-line active" : "lyric-line"}
                      onClick={() => {
                        setLyricsAutoScrollEnabled(true);
                        if (audioRef.current) audioRef.current.currentTime = line.timeMs / 1000;
                      }}
                    >
                      {line.text}
                    </button>
                  ))}
                </div>
              ) : lyrics?.status === "ready" ? (
                <pre className="lyrics-text">{lyrics.data.text}</pre>
              ) : (
                <div className="state-panel">
                  <p>Open lyrics to load the source provider chain.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
