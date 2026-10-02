import { invoke } from "@tauri-apps/api/core";
import { Dispatch, SetStateAction, useState, useRef, useMemo, useEffect, RefObject } from "react";
import { errorMessage } from "../../lib/util";
import { YtItem, LoadState, LyricsPayload } from "../../types";
import { lyricsProviderNames, lyricProviderSettingKeys } from "./providers";

export type LyricsDeps = {
  setNotice: Dispatch<SetStateAction<string>>;
  settings: Record<string, boolean>;
};

export function useLyrics({ setNotice, settings }: LyricsDeps) {
  const [lyricsProviderOrder, setLyricsProviderOrder] = useState<string[]>([...lyricsProviderNames]);
  const [lyricsItem, setLyricsItem] = useState<YtItem | null>(null);
  const [lyricsProviderSelection, setLyricsProviderSelection] = useState("auto");
  const [lyricsProviderLoading, setLyricsProviderLoading] = useState(false);
  const [lyrics, setLyrics] = useState<LoadState<LyricsPayload> | null>(null);
  const [lyricsAutoScrollEnabled, setLyricsAutoScrollEnabled] = useState(true);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const activeLyricRef = useRef<HTMLButtonElement | null>(null);

  const moveLyricsProvider = async (provider: string, direction: -1 | 1) => {
    const enabled = (value: string) =>
      value === "YouTube" || value === "YouTubeSubtitle" || settings[lyricProviderSettingKeys[value] ?? ""] === true;
    if (!enabled(provider)) return;
    const enabledOrder = lyricsProviderOrder.filter(enabled);
    const index = enabledOrder.indexOf(provider);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= enabledOrder.length) return;
    [enabledOrder[index], enabledOrder[nextIndex]] = [enabledOrder[nextIndex], enabledOrder[index]];
    const nextOrder = [...enabledOrder, ...lyricsProviderOrder.filter((value) => !enabled(value))];
    const previous = lyricsProviderOrder;
    setLyricsProviderOrder(nextOrder);
    try {
      await invoke("settings_set", { key: "lyricsProviderOrder", value: nextOrder.join(",") });
    } catch (error) {
      setLyricsProviderOrder(previous);
      setNotice(`Lyrics provider order could not be saved: ${errorMessage(error)}`);
    }
  };

  const requestLyrics = async (item: YtItem, provider = "auto", forceRefresh = false) => {
    const artist = item.artists.map((value) => value.name).join(", ") || item.subtitle || "";
    setLyricsAutoScrollEnabled(true);
    setLyricsProviderLoading(true);
    setLyrics({
      status: "loading",
      data: {
        provider: provider === "auto" ? "" : provider,
        text: "",
        synced: false,
        matchedTitle: item.title,
        matchedArtist: artist,
        lines: [],
      },
    });
    try {
      const command =
        provider === "auto" ? (forceRefresh ? "fetch_lyrics_fresh" : "fetch_lyrics") : "fetch_lyrics_from_provider";
      const args = {
        title: item.title,
        artist,
        duration: item.duration ?? -1,
        album: item.albumTitle ?? null,
        id: item.videoId ?? item.id,
        ...(provider === "auto" ? {} : { provider }),
      };
      const data = await invoke<LyricsPayload>(command, args);
      setLyricsProviderSelection(data.provider);
      setLyrics({ status: "ready", data });
    } catch (error) {
      setLyrics({
        status: "error",
        data: {
          provider: provider === "auto" ? "Automatic" : provider,
          text: "",
          synced: false,
          matchedTitle: item.title,
          matchedArtist: artist,
          lines: [],
        },
        error: errorMessage(error),
      });
    } finally {
      setLyricsProviderLoading(false);
    }
  };

  const openLyrics = async (item: YtItem) => {
    setLyricsItem(item);
    setLyricsProviderSelection("auto");
    await requestLyrics(item);
  };

  const changeLyricsProvider = async (provider: string) => {
    setLyricsProviderSelection(provider);
    if (lyricsItem) await requestLyrics(lyricsItem, provider, provider === "auto");
  };

  return {
    lyricsProviderOrder,
    setLyricsProviderOrder,
    lyricsProviderSelection,
    lyricsProviderLoading,
    lyrics,
    setLyrics,
    lyricsAutoScrollEnabled,
    setLyricsAutoScrollEnabled,
    lyricsContainerRef,
    activeLyricRef,
    moveLyricsProvider,
    openLyrics,
    changeLyricsProvider,
  };
}

export type LyricsFollowDeps = {
  activeLyricRef: RefObject<HTMLButtonElement | null>;
  lyrics: LoadState<LyricsPayload> | null;
  lyricsAutoScrollEnabled: boolean;
  lyricsContainerRef: RefObject<HTMLDivElement | null>;
  playbackSeconds: number;
  playerExpanded: boolean;
};

export function useLyricsFollow({
  activeLyricRef,
  lyrics,
  lyricsAutoScrollEnabled,
  lyricsContainerRef,
  playbackSeconds,
  playerExpanded,
}: LyricsFollowDeps) {
  const activeLyricIndex = useMemo(() => {
    if (!lyrics || lyrics.status !== "ready" || !lyrics.data.synced || lyrics.data.lines.length === 0) return -1;
    const position = playbackSeconds * 1000;
    const nextIndex = lyrics.data.lines.findIndex((line) => line.timeMs > position);
    return nextIndex < 0 ? lyrics.data.lines.length - 1 : Math.max(0, nextIndex - 1);
  }, [lyrics, playbackSeconds]);

  useEffect(() => {
    if (activeLyricIndex < 0 || !lyricsAutoScrollEnabled) return;
    const line = activeLyricRef.current;
    const container = lyricsContainerRef.current;
    if (!line || !container) return;
    const align = () => {
      const lineRect = line.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const lineCenter = lineRect.top - containerRect.top + lineRect.height / 2;
      const targetTop = container.scrollTop + lineCenter - container.clientHeight / 2;
      const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
      container.scrollTo({ top: Math.min(maxTop, Math.max(0, targetTop)), behavior: "smooth" });
    };
    const frame = requestAnimationFrame(align);
    return () => cancelAnimationFrame(frame);
  }, [activeLyricIndex, playerExpanded, lyricsAutoScrollEnabled, lyrics?.status, activeLyricRef, lyricsContainerRef]);

  return { activeLyricIndex };
}
