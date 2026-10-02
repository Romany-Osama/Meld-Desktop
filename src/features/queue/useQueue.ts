import { invoke } from "@tauri-apps/api/core";
import { Dispatch, SetStateAction, useState, useRef } from "react";
import { arrangeQueue, shuffleAfterCurrent, moveItem } from "../../lib/queue";
import { errorMessage } from "../../lib/util";
import { YtItem, QueuePage } from "../../types";

export type QueueDeps = {
  setNotice: Dispatch<SetStateAction<string>>;
  settings: Record<string, boolean>;
};

export function useQueue({ setNotice, settings }: QueueDeps) {
  const [queueOpen, setQueueOpen] = useState(false);
  const [queueItems, setQueueItems] = useState<YtItem[]>([]);
  const [queueContinuation, setQueueContinuation] = useState<string | null>(null);
  const [queueContinuationKind, setQueueContinuationKind] = useState<"next" | "playlist" | null>(null);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("off");
  const [queueIndex, setQueueIndex] = useState(-1);
  const automixLoadingRef = useRef(false);
  const autoMixEnabledRef = useRef(false);

  const toggleShuffle = async () => {
    const next = !shuffleEnabled;
    setShuffleEnabled(next);
    if (settings.rememberShuffleAndRepeat === false) return;
    try {
      await invoke("settings_set", { key: "shuffleMode", value: String(next) });
    } catch (error) {
      setShuffleEnabled(!next);
      setNotice(`Shuffle preference could not be saved: ${errorMessage(error)}`);
    }
  };

  const cycleRepeat = async () => {
    const next = repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
    setRepeatMode(next);
    try {
      await invoke("settings_set", { key: "repeatMode", value: next === "one" ? "1" : next === "all" ? "2" : "0" });
    } catch (error) {
      setNotice(`Repeat preference could not be saved: ${errorMessage(error)}`);
    }
  };

  const arrangeQueueForSettings = (
    items: YtItem[],
    currentIndex: number,
    originalQueueSize: number,
    shuffleActive = shuffleEnabled,
  ) =>
    arrangeQueue(items, currentIndex, originalQueueSize, {
      shuffle: shuffleActive,
      playlistFirst: !!settings.shufflePlaylistFirst,
    });

  const shuffleQueueAfterCurrent = (items: YtItem[], currentId: string | null) =>
    shuffleEnabled ? shuffleAfterCurrent(items, currentId) : items;

  const moveQueueItem = (from: number, to: number) => {
    const moved = moveItem(queueItems, queueIndex, from, to);
    if (!moved) return;
    setQueueItems(moved.items);
    setQueueIndex(moved.index);
  };

  const loadAutomixItems = async (current: YtItem, existing: YtItem[]) => {
    if (
      settings.autoLoadMore === false ||
      !settings.similarContent ||
      (settings.disableLoadMoreWhenRepeatAll && repeatMode === "all") ||
      !current.videoId ||
      automixLoadingRef.current
    )
      return [];
    automixLoadingRef.current = true;
    try {
      const page = await invoke<QueuePage>("ytm_next", {
        videoId: current.videoId,
        playlistId: current.playPlaylistId ?? current.playlistId ?? `RDAMVM${current.videoId}`,
        setVideoId: current.setVideoId ?? null,
        index: null,
        params: current.params ?? null,
        continuation: null,
      });
      let additions = page.items.filter(
        (value) => value.videoId && value.id !== current.id && !existing.some((item) => item.id === value.id),
      );
      if (additions.length === 0 && page.relatedBrowseId) {
        additions = (await invoke<YtItem[]>("ytm_related", { browseId: page.relatedBrowseId })).filter(
          (value) => value.videoId && value.id !== current.id && !existing.some((item) => item.id === value.id),
        );
      }
      if (shuffleEnabled && additions.length > 1) {
        additions = [...additions];
        for (let index = additions.length - 1; index > 0; index -= 1) {
          const swapIndex = Math.floor(Math.random() * (index + 1));
          [additions[index], additions[swapIndex]] = [additions[swapIndex], additions[index]];
        }
      }
      return additions;
    } catch {
      return [];
    } finally {
      automixLoadingRef.current = false;
    }
  };

  return {
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
  };
}
