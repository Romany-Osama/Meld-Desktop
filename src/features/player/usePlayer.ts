import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioQuality, streamRequest } from "../../lib/audioQuality";
import { mediaSrc } from "../../lib/media";
import { withRefreshedPayload } from "../../lib/playbackSession";
import { recoveryReason, isLocalStream, recoveryNotice } from "../../lib/streamRecovery";
import { errorMessage } from "../../lib/util";
import { YtItem, PlayerPayload, PlaytimeSession } from "../../types";
import type { SetNotice } from "../../app/notifications";

export type PlayerDeps = {
  audioQuality: AudioQuality;
  setNotice: SetNotice;
  settings: Record<string, boolean>;
};

export function usePlayer({ audioQuality, setNotice, settings }: PlayerDeps) {
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const [player, setPlayer] = useState<{ item: YtItem; payload: PlayerPayload; session: number } | null>(null);
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playRequestIdRef = useRef(0);
  const activePlayerIdRef = useRef<string | null>(null);
  const seekGestureRef = useRef({ timestamp: 0, multiplier: 1 });
  const wasPlayingBeforeMuteRef = useRef(false);
  const playtimeRef = useRef<PlaytimeSession | null>(null);
  const streamResolvedAtRef = useRef(0);
  // Unique per playItem() call (PLAY-035). The audio-source effect is keyed on it, so replaying the same song restarts
  // predictably while a refreshed stream URL or metadata update for the same session keeps the current position.
  const playbackSessionRef = useRef(0);

  const flushPlaytime = async () => {
    const session = playtimeRef.current;
    if (!session || session.pendingMs <= 0 || session.flushing) return;
    const amount = Math.round(session.pendingMs);
    session.pendingMs = 0;
    session.flushing = true;
    try {
      await invoke("history_record_playtime", { historyId: session.historyId, playTimeMs: amount });
    } catch {
      session.pendingMs += amount;
    } finally {
      session.flushing = false;
    }
    if (session.pendingMs >= 15000) void flushPlaytime();
  };

  const recordPlaytime = (position: number) => {
    const session = playtimeRef.current;
    if (!session || !Number.isFinite(position)) return;
    const delta = position - session.lastPosition;
    if (session.playing && delta >= 0 && delta <= 3) session.pendingMs += delta * 1000;
    session.lastPosition = position;
    if (session.pendingMs >= 15000) void flushPlaytime();
  };

  // Stream URLs from ytm_player expire (expiresInSeconds) - a song paused longer than that, or one whose
  // queue neighbor sits paused for a long time, hits a dead URL when playback resumes. onError below tries
  // this before falling back to a generic error, so a stale-but-otherwise-fine song quietly gets a fresh URL
  // and resumes at the same position instead of a confusing failure (previously, expiresInSeconds was parsed
  // by the backend but never read anywhere on the frontend). Guarded by elapsed-time-vs-expiry so it only
  // fires for the case it targets - a genuinely broken stream errors immediately, well inside its expiry
  // window, and falls through to the existing error handling unchanged.
  const streamRecoveryRef = useRef<{ session: unknown; attempts: number }>({ session: null, attempts: 0 });

  const recoverStream = async (): Promise<boolean> => {
    if (!player?.item.videoId) return false;
    const session = player.session;
    if (streamRecoveryRef.current.session !== session) streamRecoveryRef.current = { session, attempts: 0 };
    const elapsedSeconds = (Date.now() - streamResolvedAtRef.current) / 1000;
    const reason = recoveryReason(streamRecoveryRef.current.attempts, elapsedSeconds, player.payload.expiresInSeconds);
    if (!reason) return false;
    streamRecoveryRef.current.attempts += 1;
    const resumeAt = audioRef.current?.currentTime ?? playbackSeconds;
    const wasPlaying = audioRef.current ? !audioRef.current.paused || audioRef.current.autoplay || isPlaying : false;
    const item = player.item;
    const failedUrl = player.payload.streamUrl;
    const localSource = isLocalStream(failedUrl);
    setNotice(recoveryNotice(reason, streamRecoveryRef.current.attempts, localSource));
    try {
      if (reason === "rejected" || localSource)
        await invoke("ytm_report_stream_failure", { videoId: item.videoId, streamUrl: failedUrl }).catch(
          () => undefined,
        );
      const payload = await invoke<PlayerPayload>("ytm_player", streamRequest(item, audioQuality));
      // The user may have started another track while the fresh URL was resolving (last click wins).
      if (playbackSessionRef.current !== session) return false;
      streamResolvedAtRef.current = Date.now();
      setPlayer((current) => withRefreshedPayload(current, session, payload));
      if (audioRef.current) {
        audioRef.current.src = mediaSrc(payload.streamUrl) ?? payload.streamUrl;
        audioRef.current.currentTime = resumeAt;
        if (wasPlaying)
          void audioRef.current
            .play()
            .then(() => setIsPlaying(true))
            .catch(() => setIsPlaying(false));
      }
      return true;
    } catch (error) {
      if (playbackSessionRef.current === session) setNotice(errorMessage(error));
      return false;
    }
  };

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.playbackRate = playbackSpeed;
    (audioRef.current as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = settings.varispeed !== true;
  }, [playbackSpeed, settings.varispeed]);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio
        .play()
        .then(() => setIsPlaying(true))
        .catch((error) => setNotice(`Audio playback failed: ${errorMessage(error)}`, "error"));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  // Stable identity (refs and setters only), so effects can list it without re-running.
  const seekPlayback = useCallback((value: number) => {
    if (!audioRef.current || !Number.isFinite(value)) return;
    audioRef.current.currentTime = value;
    setPlaybackSeconds(value);
  }, []);

  const seekByPlayerGesture = (direction: -1 | 1) => {
    const now = performance.now();
    const previous = seekGestureRef.current;
    const multiplier =
      settings.seekExtraSeconds === true && now - previous.timestamp < 1000 ? previous.multiplier + 1 : 1;
    seekGestureRef.current = { timestamp: now, multiplier };
    const seconds = 5 * multiplier;
    seekPlayback(
      Math.min(durationSeconds || Number.MAX_SAFE_INTEGER, Math.max(0, playbackSeconds + direction * seconds)),
    );
  };

  const adjustVolumeByWheel = (event: { deltaY: number; preventDefault: () => void }) => {
    event.preventDefault();
    const next = Math.min(1, Math.max(0, Number((volume + (event.deltaY < 0 ? 0.05 : -0.05)).toFixed(2))));
    updateVolume(next);
  };

  const updateVolume = (value: number) => {
    const audio = audioRef.current;
    if (audio && settings.pauseOnMute === true && value === 0 && !audio.paused) {
      wasPlayingBeforeMuteRef.current = true;
      audio.pause();
      setIsPlaying(false);
    } else if (audio && settings.pauseOnMute === true && value > 0 && wasPlayingBeforeMuteRef.current && audio.paused) {
      wasPlayingBeforeMuteRef.current = false;
      void audio
        .play()
        .then(() => setIsPlaying(true))
        .catch((error) => setNotice(`Audio playback failed: ${errorMessage(error)}`, "error"));
    }
    setVolume(value);
    if (audio) audio.volume = value;
    void invoke("settings_set", { key: "playerVolume", value: String(value) }).catch(() => undefined);
  };

  const formatTime = (seconds: number) => {
    const safe = Math.max(0, Math.floor(seconds));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
  };

  return {
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
  };
}
