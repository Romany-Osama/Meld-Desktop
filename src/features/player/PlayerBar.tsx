import { RefObject, Dispatch, SetStateAction } from "react";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { PlayerAudio } from "./PlayerAudio";
import { mediaSrc } from "../../lib/media";
import { YtItem, LoadState, LyricsPayload, PlayerPayload, LibraryItemState, PlaytimeSession } from "../../types";
import type { SetNotice } from "../../app/notifications";

export type PlayerBarProps = {
  adjustVolumeByWheel: (event: { deltaY: number; preventDefault: () => void }) => void;
  audioRef: RefObject<HTMLAudioElement | null>;
  autoMixEnabledRef: RefObject<boolean>;
  clearSleepTimer: () => void;
  cycleRepeat: () => Promise<void>;
  durationSeconds: number;
  flushPlaytime: () => Promise<void>;
  formatTime: (seconds: number) => string;
  isPlaying: boolean;
  loadAutomixItems: (current: YtItem, existing: YtItem[]) => Promise<YtItem[]>;
  lyrics: LoadState<LyricsPayload> | null;
  openLyrics: (item: YtItem) => Promise<void>;
  openPlayerMenu: () => Promise<void>;
  playbackSeconds: number;
  player: { item: YtItem; payload: PlayerPayload; session: number } | null;
  playerItemState: LibraryItemState | null;
  playItem: (
    item: YtItem,
    sourceQueue?: YtItem[],
    sourceIndex?: number,
    sourceContinuation?: string | null,
    autoMixStart?: boolean,
    sourceContinuationKind?: "next" | "playlist",
  ) => Promise<void>;
  playQueueIndex: (index: number) => Promise<void>;
  playtimeRef: RefObject<PlaytimeSession | null>;
  queueContinuation: string | null;
  queueIndex: number;
  queueItems: YtItem[];
  recordPlaytime: (position: number) => void;
  recoverStream: () => Promise<boolean>;
  repeatMode: "off" | "all" | "one";
  seekPlayback: (value: number) => void;
  setDurationSeconds: Dispatch<SetStateAction<number>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  setLyricsAutoScrollEnabled: Dispatch<SetStateAction<boolean>>;
  setNotice: SetNotice;
  setPlaybackSeconds: Dispatch<SetStateAction<number>>;
  setPlayer: Dispatch<SetStateAction<{ item: YtItem; payload: PlayerPayload; session: number } | null>>;
  setPlayerExpanded: Dispatch<SetStateAction<boolean>>;
  setQueueContinuation: Dispatch<SetStateAction<string | null>>;
  setQueueItems: Dispatch<SetStateAction<YtItem[]>>;
  setQueueOpen: Dispatch<SetStateAction<boolean>>;
  settings: Record<string, boolean>;
  shareItem: (item: YtItem) => Promise<void>;
  shuffleEnabled: boolean;
  sleepTimerEndOfSong: boolean;
  togglePlayback: () => void;
  togglePlayerFavorite: () => Promise<void>;
  toggleShuffle: () => Promise<void>;
  updateVolume: (value: number) => void;
  volume: number;
};

function PlayerControls({
  adjustVolumeByWheel,
  audioRef,
  cycleRepeat,
  durationSeconds,
  formatTime,
  isPlaying,
  lyrics,
  openLyrics,
  openPlayerMenu,
  playbackSeconds,
  player,
  playerItemState,
  playQueueIndex,
  queueContinuation,
  queueIndex,
  queueItems,
  repeatMode,
  seekPlayback,
  setIsPlaying,
  setLyricsAutoScrollEnabled,
  setPlayer,
  setPlayerExpanded,
  setQueueOpen,
  shareItem,
  shuffleEnabled,
  togglePlayback,
  togglePlayerFavorite,
  toggleShuffle,
  updateVolume,
  volume,
}: PlayerBarProps) {
  return (
    <>
      {player && (
        <div className="player-dock">
          <button
            className="transport-button"
            disabled={queueIndex <= 0}
            onClick={() => void playQueueIndex(queueIndex - 1)}
            title="Previous"
          >
            ‹
          </button>
          <div className="dock-copy">
            {mediaSrc(player.item.thumbnail) && <img src={mediaSrc(player.item.thumbnail) as string} alt="" />}
            <div>
              <strong>{player.payload.title || player.item.title}</strong>
              <span>{player.payload.artist || player.item.subtitle}</span>
            </div>
          </div>
          <div className="player-controls">
            <button
              className="transport-button play-button"
              onClick={togglePlayback}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? "Ⅱ" : "▶"}
            </button>
            <span className="time-label">{formatTime(playbackSeconds)}</span>
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
            <span className="time-label">{formatTime(durationSeconds)}</span>
            <button
              className="player-lyrics-button"
              onClick={() => {
                setPlayerExpanded(true);
                setLyricsAutoScrollEnabled(true);
                if (!lyrics) void openLyrics(player.item);
              }}
              title="Open synchronized lyrics"
              aria-label="Open synchronized lyrics"
            >
              ♫
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
              onClick={() => void shareItem(player.item)}
              title="Share"
              aria-label="Share"
            >
              ↗
            </button>
            <button
              className="player-action"
              onClick={() => void openPlayerMenu()}
              title="More actions"
              aria-label="More actions"
            >
              ⋮
            </button>
            <label className="volume-control" title="Volume · scroll to adjust" onWheel={adjustVolumeByWheel}>
              <span>Vol</span>
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
          <div className="dock-transport-actions">
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
              ☰
            </button>
            <button
              className="player-expand"
              onClick={() => {
                setPlayerExpanded(true);
                setLyricsAutoScrollEnabled(true);
                if (!lyrics) void openLyrics(player.item);
              }}
              title="Open full player"
              aria-label="Open full player"
            >
              ↗
            </button>
          </div>
          <button
            className="dock-close"
            onClick={() => {
              audioRef.current?.pause();
              setPlayer(null);
              setPlayerExpanded(false);
              setIsPlaying(false);
            }}
            title="Close player"
            aria-label="Close player"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}

/** The player bar: the audio element, then the controls behind their own error boundary (U4-014). */
export function PlayerBar(props: PlayerBarProps) {
  return (
    <>
      <PlayerAudio {...props} />
      <ErrorBoundary name="Player controls" variant="bar" resetKey={props.player?.session}>
        <PlayerControls {...props} />
      </ErrorBoundary>
    </>
  );
}
