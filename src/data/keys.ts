import type { HistorySource, LibraryMode, StatsPeriod } from "../app/routes";

/** Cache keys for server state (U4-008). One key per distinct backend answer. */
export type DetailRef = { kind: "album" | "artist" | "podcast" | "browse"; browseId: string; params?: string | null };
export type PodcastFilter = "episodes" | "channels" | "downloaded";
export type TopPeriod = "all" | "day" | "week" | "month" | "year";

export const homeKey = "home";
export const speedDialKey = "home:speed-dial";
export const searchKey = (query: string) => `search:${query}`;
export const libraryMixSongsKey = "library:mix:songs";
export function libraryKey(mode: LibraryMode, podcastFilter: PodcastFilter, topPeriod: TopPeriod): string {
  if (mode === "podcasts") return `library:podcasts:${podcastFilter}`;
  if (mode === "top") return `library:top:${topPeriod}`;
  return `library:${mode}`;
}
export const historyKey = (source: HistorySource) => `history:${source}`;
export const statsKey = (period: StatsPeriod) => `stats:${period}`;
export const detailKey = (ref: DetailRef) => `detail:${ref.kind}:${ref.browseId}:${ref.params ?? ""}`;
export const playlistKey = (playlistId: string) => `playlist:${playlistId}`;

/** How long a cached page counts as current when the user comes back to it (U4-010). */
export const FRESH_FOR_MS = 10 * 60_000;
