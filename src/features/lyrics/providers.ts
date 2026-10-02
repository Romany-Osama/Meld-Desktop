export const lyricsProviderNames = [
  "BetterLyrics",
  "Paxsenix",
  "LrcLib",
  "KuGou",
  "LyricsPlus",
  "Musixmatch",
  "YouTubeSubtitle",
  "YouTube",
] as const;
export const lyricProviderSettingKeys: Record<string, string> = {
  BetterLyrics: "enableBetterLyrics",
  Paxsenix: "enablePaxsenix",
  LrcLib: "enableLrclib",
  KuGou: "enableKugou",
  LyricsPlus: "enableLyricsPlus",
  Musixmatch: "enableMusixmatch",
};
