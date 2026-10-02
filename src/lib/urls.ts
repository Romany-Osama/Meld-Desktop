import { ParsedYouTubeUrl } from "../types";

export function parseYouTubeUrl(value: string): ParsedYouTubeUrl | null {
  const url = value.trim();
  const videoPatterns = [
    /(?:https?:\/\/)?(?:www\.)?(?:music\.)?youtube\.com\/watch\?.*?v=([a-zA-Z0-9_-]{11})/i,
    /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i,
  ];
  for (const pattern of videoPatterns) {
    const match = url.match(pattern);
    if (match?.[1]) return { kind: "video", id: match[1] };
  }
  const playlistMatch = url.match(
    /(?:https?:\/\/)?(?:www\.)?(?:music\.)?youtube\.com\/playlist\?.*?list=([a-zA-Z0-9_-]+)/i,
  );
  if (!url.includes("music.youtube.com") && playlistMatch?.[1]) return { kind: "playlist", id: playlistMatch[1] };
  if (url.includes("music.youtube.com")) {
    if (playlistMatch?.[1]) return { kind: "album", id: playlistMatch[1] };
    const artistMatch =
      url.match(/(?:https?:\/\/)?(?:www\.)?music\.youtube\.com\/channel\/([a-zA-Z0-9_-]+)/i) ??
      url.match(/(?:https?:\/\/)?(?:www\.)?music\.youtube\.com\/browse\/(MPRE[a-zA-Z0-9_-]+)/i);
    if (artistMatch?.[1]) return { kind: "artist", id: artistMatch[1] };
  }
  return null;
}
