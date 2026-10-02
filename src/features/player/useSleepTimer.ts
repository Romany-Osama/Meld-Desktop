import { RefObject, Dispatch, SetStateAction, useState, useRef, useEffect } from "react";
import { YtItem } from "../../types";
import type { SetNotice } from "../../app/notifications";

export type SleepTimerDeps = {
  audioRef: RefObject<HTMLAudioElement | null>;
  durationSeconds: number;
  playbackSeconds: number;
  setMenuItem: Dispatch<SetStateAction<YtItem | null>>;
  setNotice: SetNotice;
  volume: number;
};

export function useSleepTimer({
  audioRef,
  durationSeconds,
  playbackSeconds,
  setMenuItem,
  setNotice,
  volume,
}: SleepTimerDeps) {
  const [sleepTimerOpen, setSleepTimerOpen] = useState(false);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState(30);
  const [sleepTimerDefault, setSleepTimerDefault] = useState(30);
  const [sleepTimerStopAfterCurrent, setSleepTimerStopAfterCurrent] = useState(false);
  const [sleepTimerFadeOut, setSleepTimerFadeOut] = useState(false);
  const [sleepTimerExpiresAt, setSleepTimerExpiresAt] = useState<number | null>(null);
  const [sleepTimerEndOfSong, setSleepTimerEndOfSong] = useState(false);

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
    setNotice(
      endOfSong ? "Sleep timer will stop after the current song." : `Sleep timer set for ${sleepTimerMinutes} minutes.`,
    );
  };

  // Values that change on every playback tick live in a ref. Having `playbackSeconds` in the dependency list re-created
  // the 1 s interval on every `timeupdate` (~4 Hz), so the callback never ran while music was playing.
  const sleepTimerLiveRef = useRef({
    volume,
    durationSeconds,
    playbackSeconds,
    stopAfterCurrent: sleepTimerStopAfterCurrent,
    fadeOut: sleepTimerFadeOut,
  });

  sleepTimerLiveRef.current = {
    volume,
    durationSeconds,
    playbackSeconds,
    stopAfterCurrent: sleepTimerStopAfterCurrent,
    fadeOut: sleepTimerFadeOut,
  };

  useEffect(() => {
    if (sleepTimerExpiresAt === null && !sleepTimerEndOfSong) return;
    const timer = window.setInterval(() => {
      const live = sleepTimerLiveRef.current;
      const remainingMs =
        sleepTimerExpiresAt === null
          ? Math.max(0, (live.durationSeconds - live.playbackSeconds) * 1000)
          : sleepTimerExpiresAt - Date.now();
      if (sleepTimerExpiresAt !== null && remainingMs <= 0) {
        if (live.stopAfterCurrent) {
          setSleepTimerExpiresAt(null);
          setSleepTimerEndOfSong(true);
          setSleepTimerStopAfterCurrent(false);
        } else {
          audioRef.current?.pause();
          setSleepTimerExpiresAt(null);
          setSleepTimerEndOfSong(false);
          setSleepTimerStopAfterCurrent(false);
          if (audioRef.current) audioRef.current.volume = live.volume;
        }
        return;
      }
      const multiplier = live.fadeOut ? Math.min(1, Math.max(0, remainingMs / 60_000)) : 1;
      if (audioRef.current) audioRef.current.volume = live.volume * multiplier;
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sleepTimerExpiresAt, sleepTimerEndOfSong, audioRef]);

  return {
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
  };
}
