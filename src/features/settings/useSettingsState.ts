import { invoke } from "@tauri-apps/api/core";
import { Dispatch, SetStateAction, useState, useCallback } from "react";
import { AudioQuality } from "../../lib/audioQuality";
import { errorMessage } from "../../lib/util";
import { YtItem } from "../../types";

export type SettingsStateDeps = {
  setNotice: Dispatch<SetStateAction<string>>;
};

export function useSettingsState({ setNotice }: SettingsStateDeps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [settingsPage, setSettingsPage] = useState<
    "main" | "appearance" | "content" | "player" | "privacy" | "storage" | "integrations" | "about"
  >("main");

  const [audioQuality, setAudioQuality] = useState<AudioQuality>("auto");

  const [settings, setSettings] = useState<Record<string, boolean>>({
    hideExplicit: false,
    hideVideoSongs: false,
    useLoginForBrowse: true,
    enableBetterLyrics: true,
    enablePaxsenix: true,
    enableLrclib: true,
    enableKugou: true,
    enableLyricsPlus: false,
    enableMusixmatch: false,
    ytmSync: true,
    similarContent: true,
    autoLoadMore: true,
    disableLoadMoreWhenRepeatAll: false,
    autoDownloadOnLike: false,
    autoSkipNextOnError: false,
    persistentShuffleAcrossQueues: false,
    rememberShuffleAndRepeat: true,
    shufflePlaylistFirst: false,
    preventDuplicateTracksInQueue: false,
    show_liked_playlist: true,
    show_downloaded_playlist: true,
    show_uploaded_playlist: true,
    show_top_playlist: true,
    show_cached_playlist: true,
    varispeed: false,
    seekExtraSeconds: false,
    pauseOnMute: false,
    pauseListenHistory: false,
    pauseSearchHistory: false,
    persistentQueue: true,
    sidebarCollapsed: false,
  });

  const [settingsLoading, setSettingsLoading] = useState(false);

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

  const setAudioQualitySetting = async (value: AudioQuality) => {
    const previous = audioQuality;
    setAudioQuality(value);
    try {
      await invoke("settings_set", { key: "audioQuality", value });
    } catch (error) {
      setAudioQuality(previous);
      setNotice(`Audio quality could not be saved: ${errorMessage(error)}`);
    }
  };

  const hideItem = useCallback(
    (item: YtItem) => {
      const hideVideo =
        settings.hideVideoSongs &&
        item.kind === "song" &&
        !!item.musicVideoType &&
        item.musicVideoType !== "MUSIC_VIDEO_TYPE_ATV";
      return (settings.hideExplicit && item.explicit === true) || hideVideo;
    },
    [settings.hideExplicit, settings.hideVideoSongs],
  );

  return {
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
  };
}
