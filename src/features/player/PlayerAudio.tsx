// U4-014: the <audio> element lives outside the player-bar error boundary, so a render error in the controls
// cannot unmount it and stop the song.
import { FINAL_STREAM_ERROR } from "../../lib/streamRecovery";
import type { PlayerBarProps } from "./PlayerBar";

export type PlayerAudioProps = Pick<
  PlayerBarProps,
  | "audioRef"
  | "autoMixEnabledRef"
  | "clearSleepTimer"
  | "flushPlaytime"
  | "loadAutomixItems"
  | "playbackSeconds"
  | "player"
  | "playItem"
  | "playQueueIndex"
  | "playtimeRef"
  | "queueContinuation"
  | "queueIndex"
  | "queueItems"
  | "recordPlaytime"
  | "recoverStream"
  | "repeatMode"
  | "setDurationSeconds"
  | "setIsPlaying"
  | "setNotice"
  | "setPlaybackSeconds"
  | "setQueueContinuation"
  | "setQueueItems"
  | "settings"
  | "sleepTimerEndOfSong"
>;

export function PlayerAudio({
  audioRef,
  autoMixEnabledRef,
  clearSleepTimer,
  flushPlaytime,
  loadAutomixItems,
  playbackSeconds,
  player,
  playItem,
  playQueueIndex,
  playtimeRef,
  queueContinuation,
  queueIndex,
  queueItems,
  recordPlaytime,
  recoverStream,
  repeatMode,
  setDurationSeconds,
  setIsPlaying,
  setNotice,
  setPlaybackSeconds,
  setQueueContinuation,
  setQueueItems,
  settings,
  sleepTimerEndOfSong,
}: PlayerAudioProps) {
  if (!player) return null;
  return (
    <audio
      className="native-audio"
      ref={audioRef}
      preload="auto"
      onLoadedMetadata={(event) =>
        setDurationSeconds(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)
      }
      onTimeUpdate={(event) => {
        setPlaybackSeconds(event.currentTarget.currentTime);
        recordPlaytime(event.currentTarget.currentTime);
      }}
      onPlay={() => {
        setIsPlaying(true);
        if (playtimeRef.current) playtimeRef.current.playing = true;
      }}
      onPause={() => {
        setIsPlaying(false);
        if (playtimeRef.current) playtimeRef.current.playing = false;
        void flushPlaytime();
      }}
      onEnded={async () => {
        recordPlaytime(audioRef.current?.currentTime ?? playbackSeconds);
        if (playtimeRef.current) playtimeRef.current.playing = false;
        await flushPlaytime();
        if (sleepTimerEndOfSong) {
          clearSleepTimer();
          setIsPlaying(false);
          return;
        }
        if (repeatMode === "one") {
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            void audioRef.current.play();
          }
          return;
        }
        setIsPlaying(false);
        if (
          queueIndex + 1 < queueItems.length ||
          (queueContinuation &&
            settings.autoLoadMore !== false &&
            !(settings.disableLoadMoreWhenRepeatAll === true && repeatMode === "all"))
        ) {
          void playQueueIndex(queueIndex + 1);
          return;
        }
        if (repeatMode === "all" && queueItems.length > 0) {
          void playQueueIndex(0);
          return;
        }
        if (!autoMixEnabledRef.current) return;
        const current = player?.item;
        if (!current?.videoId) return;
        const existing = queueItems;
        const additions = await loadAutomixItems(current, existing);
        if (additions.length > 0) {
          const nextItems = [...existing, ...additions];
          setQueueItems(nextItems);
          setQueueContinuation(null);
          void playItem(additions[0], nextItems, existing.length, null, true);
        }
      }}
      onError={async () => {
        if (await recoverStream()) return;
        setNotice(FINAL_STREAM_ERROR);
        if (settings.autoSkipNextOnError && (queueIndex + 1 < queueItems.length || queueContinuation))
          void playQueueIndex(queueIndex + 1);
      }}
    />
  );
}
