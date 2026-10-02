import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { AudioQuality } from "../../lib/audioQuality";
import { errorMessage } from "../../lib/util";
import { DownloadInfo, YtItem } from "../../types";
import type { SetNotice } from "../../app/notifications";
import type { Destructive } from "../../app/destructive";

export type DownloadsDeps = {
  audioQuality: AudioQuality;
  setNotice: SetNotice;
  settings: Record<string, boolean>;
  destructive: Destructive;
};

/** Offline downloads (U4-002): the commands, their notices and the progress of the item whose menu is open. */
export function useDownloads({ audioQuality, setNotice, settings, destructive }: DownloadsDeps) {
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
      setNotice("Offline download requires a remote source video.", "warning");
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
      .then(() => setNotice(`Offline download ready for “${item.title}”.`, "success"))
      .catch((error) => setNotice(`Offline download failed: ${errorMessage(error)}`, "error"));
  };

  const cancelDownload = async (item: YtItem) => {
    try {
      await invoke("download_cancel", { songId: item.id });
      setNotice(`Cancelling offline download for “${item.title}”…`);
    } catch (error) {
      setNotice(`Could not cancel download: ${errorMessage(error)}`, "error");
    }
  };

  /** Deletes the downloaded file (permanent: asks first, U4-012). */
  const removeDownload = (item: YtItem) =>
    destructive({
      severity: "permanent",
      key: `download-remove:${item.id}`,
      confirm: {
        title: "Remove offline download?",
        message: `The downloaded file for “${item.title}” is deleted. You can download it again later.`,
        confirmLabel: "Remove download",
      },
      commit: async () => {
        await invoke("download_remove", { songId: item.id });
        setMenuDownload((current) => (current?.songId === item.id ? null : current));
      },
      success: `Removed offline download for “${item.title}”.`,
      failure: "Could not remove offline download",
    });

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

  /** Removes the downloads of `items` after one confirmation; resolves to true when all were removed. */
  const removeDownloads = async (items: YtItem[]) => {
    const count = `${items.length} selected item${items.length === 1 ? "" : "s"}`;
    const result = await destructive({
      severity: "permanent",
      key: "download-remove:selection",
      confirm: {
        title: "Remove offline downloads?",
        message: `The downloaded files for ${count} are deleted. You can download them again later.`,
        confirmLabel: "Remove downloads",
      },
      commit: async () => {
        for (const item of items) await invoke("download_remove", { songId: item.id });
      },
      success: `Removed offline download for ${count}.`,
      failure: "Selected offline download removal failed",
    });
    return result === "done";
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
