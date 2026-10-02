// @vitest-environment jsdom
// U4-002: feature state boundaries work on their own, outside App.tsx.
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { YtItem } from "../types";

const invoke = vi.fn();
const listeners = new Map<string, (event: { payload: unknown }) => void>();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  convertFileSrc: (path: string) => path,
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (name: string, handler: (event: { payload: unknown }) => void) => {
    listeners.set(name, handler);
    return () => listeners.delete(name);
  },
}));

const { useSelection } = await import("./selection/useSelection");
const { useQueue } = await import("./queue/useQueue");
const { useDownloads } = await import("./downloads/useDownloads");
const { useNotice } = await import("./notifications/useNotice");
const { runDestructive } = await import("../app/destructive");
// Confirms every question; tests that need a "no" pass their own.
const destructive =
  (setNotice: (...args: never[]) => void = vi.fn()) =>
  (spec: Parameters<typeof runDestructive>[0]) =>
    runDestructive(spec, { confirm: async () => true, notify: setNotice as never });

const song = (id: string, extra: Partial<YtItem> = {}): YtItem => ({
  id,
  kind: "song",
  title: `Song ${id}`,
  subtitle: "Artist",
  artists: [{ name: "Artist" }],
  videoId: id,
  ...extra,
});

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
  listeners.clear();
});

describe("useSelection", () => {
  it("toggles items by id and clears selection mode", () => {
    const { result } = renderHook(() => useSelection());
    act(() => {
      result.current.setSelectionMode(true);
      result.current.toggleSelectedItem(song("a"));
      result.current.toggleSelectedItem(song("b"));
      result.current.toggleSelectedItem(song("a"));
    });
    expect(result.current.selectedItems.map((item) => item.id)).toEqual(["b"]);
    act(() => result.current.closeSelection());
    expect(result.current.selectedItems).toEqual([]);
    expect(result.current.selectionMode).toBe(false);
  });
});

describe("useQueue", () => {
  it("moves items and keeps the current index on the playing song", () => {
    const setNotice = vi.fn();
    const { result } = renderHook(() => useQueue({ setNotice, settings: {} }));
    act(() => {
      result.current.setQueueItems([song("a"), song("b"), song("c")]);
      result.current.setQueueIndex(0);
    });
    act(() => result.current.moveQueueItem(0, 2));
    expect(result.current.queueItems.map((item) => item.id)).toEqual(["b", "c", "a"]);
    expect(result.current.queueIndex).toBe(2);
  });

  it("reverts shuffle and reports it when the preference cannot be saved", async () => {
    const setNotice = vi.fn();
    invoke.mockRejectedValueOnce(new Error("disk full"));
    const { result } = renderHook(() => useQueue({ setNotice, settings: {} }));
    await act(() => result.current.toggleShuffle());
    expect(invoke).toHaveBeenCalledWith("settings_set", { key: "shuffleMode", value: "true" });
    expect(result.current.shuffleEnabled).toBe(false);
    expect(setNotice).toHaveBeenCalledWith("Shuffle preference could not be saved: disk full", "error");
  });

  it("cycles repeat off → all → one → off and persists each step", async () => {
    const { result } = renderHook(() => useQueue({ setNotice: vi.fn(), settings: {} }));
    for (const expected of ["all", "one", "off"]) {
      await act(() => result.current.cycleRepeat());
      expect(result.current.repeatMode).toBe(expected);
    }
    expect(invoke.mock.calls.map(([, args]) => (args as { value: string }).value)).toEqual(["2", "1", "0"]);
  });
});

describe("useDownloads", () => {
  it("starts a download at the chosen quality and tracks its progress events", async () => {
    const { result } = renderHook(() => useNotice());
    const downloads = renderHook(() =>
      useDownloads({
        audioQuality: "high",
        setNotice: result.current.setNotice,
        settings: {},
        destructive: destructive(),
      }),
    );
    await act(async () => downloads.result.current.startDownload(song("a")));
    expect(invoke).toHaveBeenCalledWith("download_start", { item: song("a"), audioQuality: "high" });
    expect(downloads.result.current.menuDownload?.state).toBe("downloading");
    expect(result.current.notice).toBe("Offline download ready for “Song a”.");
    act(() =>
      listeners.get("download-state")?.({ payload: { songId: "a", state: "completed", bytes: 9, totalBytes: 9 } }),
    );
    expect(downloads.result.current.menuDownload?.state).toBe("completed");
    // Events for another song do not replace the open menu's state.
    act(() => listeners.get("download-state")?.({ payload: { songId: "b", state: "failed" } }));
    expect(downloads.result.current.menuDownload?.songId).toBe("a");
  });

  it("refuses local-only items and only batch-downloads items with a remote source", () => {
    const setNotice = vi.fn();
    const { result } = renderHook(() =>
      useDownloads({ audioQuality: "auto", setNotice, settings: {}, destructive: destructive() }),
    );
    act(() => result.current.startDownload(song("local", { localPath: "C:/music/a.mp3" })));
    expect(invoke).not.toHaveBeenCalled();
    expect(setNotice).toHaveBeenLastCalledWith("Offline download requires a remote source video.", "warning");
    let started = 0;
    act(() => {
      started = result.current.downloadItems([song("a"), song("b", { videoId: undefined }), song("c")]);
    });
    expect(started).toBe(2);
    expect(invoke.mock.calls.map(([, args]) => (args as { item: YtItem }).item.id)).toEqual(["a", "c"]);
  });

  it("auto-downloads on like only when the setting is on", () => {
    const off = renderHook(() =>
      useDownloads({ audioQuality: "auto", setNotice: vi.fn(), settings: {}, destructive: destructive() }),
    );
    off.result.current.maybeAutoDownloadOnLike(song("a"), true);
    expect(invoke).not.toHaveBeenCalled();
    const on = renderHook(() =>
      useDownloads({
        audioQuality: "low",
        setNotice: vi.fn(),
        settings: { autoDownloadOnLike: true },
        destructive: destructive(),
      }),
    );
    on.result.current.maybeAutoDownloadOnLike(song("a"), false);
    on.result.current.maybeAutoDownloadOnLike(song("a"), true);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("download_start", { item: song("a"), audioQuality: "low" });
  });
});
