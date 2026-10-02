// Playback-cache limit choices and usage text for Settings → Storage (PLAY-041).
// The backend accepts exactly these values (player_cache::LIMIT_CHOICES_MB).

export const CACHE_LIMIT_CHOICES_MB = [0, 512, 1024, 2048, 5120, 10240, 20480] as const;
export const DEFAULT_CACHE_LIMIT_MB = 2048;

export type PlayerCacheUsage = { bytes: number; songs: number; limitMb: number };

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export function limitLabel(limitMb: number): string {
  if (limitMb === 0) return "Off";
  return formatBytes(limitMb * 1024 * 1024);
}

export function usageSummary(usage: PlayerCacheUsage): string {
  if (usage.limitMb === 0) {
    return usage.songs > 0
      ? `Off · ${formatBytes(usage.bytes)} still cached`
      : "Off · songs are not cached during playback";
  }
  const songs = usage.songs === 1 ? "1 song" : `${usage.songs} songs`;
  return `${formatBytes(usage.bytes)} of ${limitLabel(usage.limitMb)} used · ${songs}`;
}
