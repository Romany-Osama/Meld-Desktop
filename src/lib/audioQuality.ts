// Audio quality setting (PLAY-021). Rust maps the same three values in normalize_audio_quality();
// playback, the playback cache (keyed by song and quality) and downloads all receive it.
export type AudioQuality = "auto" | "high" | "low";
export const AUDIO_QUALITIES: readonly AudioQuality[] = ["auto", "high", "low"];

export function parseAudioQuality(value: unknown): AudioQuality | null {
  return typeof value === "string" && (AUDIO_QUALITIES as readonly string[]).includes(value)
    ? (value as AudioQuality)
    : null;
}

/** Arguments every stream-resolving or downloading command receives, so the setting is never dropped. */
export function streamRequest(
  item: { videoId?: string | null; playlistId?: string | null; playPlaylistId?: string | null },
  audioQuality: AudioQuality,
) {
  return { videoId: item.videoId, playlistId: item.playlistId ?? item.playPlaylistId ?? null, audioQuality };
}
