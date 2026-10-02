import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Dispatch, SetStateAction, useCallback, useEffect, useState } from "react";
import { AudioQuality } from "../../lib/audioQuality";
import { errorMessage } from "../../lib/util";
import { DownloadInfo, YtItem } from "../../types";

export type DownloadsDeps = {
  audioQuality: AudioQuality;
  setNotice: Dispatch<SetStateAction<string>>;
  settings: Record<string, boolean>;
};

/** Offline downloads (U4-002): the commands, their notices and the progress of the item whose menu is open. */
export function useDownloads({ audioQuality, setNotice, settings }: DownloadsDeps) {
  const [menuDownload, setMenuDownload] = useState<DownloadInfo | null>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    void listen<DownloadInfo>("download-state", (event) => {
      setMenuDownload((current) => (current?.songId === event.payload.songId ? event.payload : current));
    }).then((unlisten) => {
      stop = unlisten;
    });
    return () => stop?.();
  }, []);

  /** Shows the download state of `songId` in the open menu (nothing while it loads). */
  const showMenuDownload = useCallback((songId: string | null) => {
    setMenuDownload(null);
    if (!songId) return;
    void invoke<DownloadInfo | null>("download_info", { songId })
      .then(setMenuDownload)
      .catch(() => setMenuDownload(null));
  }, []);

  const startDownload = (item: YtItem) => {
    if (!item.videoId || item.localPath) {
      setNotice("Offline download requires a remote source video.");
      return;
    }
    setMenuDownload({
      songId: item.id,
      path: "",
      bytes: 0,
      totalBytes: null,
      state: "downloading",
      lyricsCached: false,
    });
    setNotice(`Downloading “${item.title}” for offline playback…`);
    void invoke("download_start", { item, audioQuality })
      .then(() => setNotice(`Offline download ready for “${item.title}”.`))
      .catch((error) => setNotice(`Offline download failed: ${errorMessage(error)}`));
  };

  const cancelDownload = async (item: YtItem) => {
    try {
      await invoke("download_cancel", { songId: item.id });
      setNotice(`Cancelling offline download for “${item.title}”…`);
    } catch (error) {
      setNotice(`Could not cancel download: ${errorMessage(error)}`);
    }
  };

  const removeDownload = async (item: YtItem) => {
    try {
      await invoke("download_remove", { songId: item.id });
      setMenuDownload(null);
      setNotice(`Removed offline download for “${item.title}”.`);
    } catch (error) {
      setNotice(`Could not remove offline download: ${errorMessage(error)}`);
    }
  };

  /** Starts downloads for every item with a remote source; returns how many were started. */
  const downloadItems = (items: YtItem[]) => {
    const downloadable = items.filter((item) => item.videoId && !item.localPath);
    downloadable.forEach((item) => void invoke("download_start", { item }).catch(() => undefined));
    setNotice(
      downloadable.length > 0
        ? `Started offline download for ${downloadable.length} selected item${downloadable.length === 1 ? "" : "s"}.`
        : "No selected item has a remote source video.",
    );
    return downloadable.length;
  };

  /** Removes the downloads of `items`; resolves to false (with a notice) when one fails. */
  const removeDownloads = async (items: YtItem[]) => {
    try {
      for (const item of items) await invoke("download_remove", { songId: item.id });
      setNotice(`Removed offline download for ${items.length} selected item${items.length === 1 ? "" : "s"}.`);
      return true;
    } catch (error) {
      setNotice(`Selected offline download removal failed: ${errorMessage(error)}`);
      return false;
    }
  };

  const maybeAutoDownloadOnLike = (item: YtItem, liked: boolean) => {
    if (settings.autoDownloadOnLike !== true || !liked || !item.videoId || item.localPath) return;
    void invoke("download_start", { item, audioQuality }).catch(() => undefined);
  };

  return {
    menuDownload,
    showMenuDownload,
    startDownload,
    cancelDownload,
    removeDownload,
    downloadItems,
    removeDownloads,
    maybeAutoDownloadOnLike,
  };
}
