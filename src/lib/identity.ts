// U4-015: one way to name an item and one way to name its place in a list. A song can be in a playlist, the queue
// or the history several times; keys and selection must tell those occurrences apart, and must not depend on the
// title or on the list position alone (inserting another song must not change the key of the ones after it).
import type { YtItem } from "../types";

/** The domain identity of an item: the same song, album or playlist gives the same id wherever it appears. */
export function domainId(item: Pick<YtItem, "id" | "kind" | "videoId" | "browseId" | "playlistId" | "localPath">) {
  const kind = String(item.kind || "item");
  const source =
    kind === "song" || kind === "video" || kind === "episode"
      ? (item.videoId ?? item.localPath ?? item.id)
      : kind === "playlist"
        ? (item.playlistId ?? item.browseId ?? item.id)
        : (item.browseId ?? item.id);
  return `${kind}:${source || item.id}`;
}

export type Occurrence<T> = { item: T; key: string; index: number };

/**
 * Pairs each item with a key unique within the list: `<scope>:<domainId>#<n>`, where n counts earlier occurrences
 * of the same item. A YouTube Music playlist entry carries its own occurrence id (`setVideoId`), which is used too.
 */
export function withOccurrences<T extends YtItem>(items: readonly T[], scope: string): Occurrence<T>[] {
  return withOccurrencesBy(items, scope, (item) =>
    item.setVideoId ? `${domainId(item)}@${item.setVideoId}` : domainId(item),
  );
}

/** withOccurrences for other records (Spotify tracks, stats rows): `idOf` gives the domain id. */
export function withOccurrencesBy<T>(items: readonly T[], scope: string, idOf: (item: T) => string): Occurrence<T>[] {
  const seen = new Map<string, number>();
  return items.map((item, index) => {
    const base = idOf(item);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { item, key: `${scope}:${base}#${n}`, index };
  });
}

/** The key of an item where it can only appear once (a menu, the player); same shape as withOccurrences. */
export function singleKey(item: YtItem, scope: string) {
  return `${scope}:${domainId(item)}#0`;
}

/**
 * Where `item` is in `list`: the same object first (the row that was clicked), then the position the caller
 * already knows if it still shows the same item, and only then the first entry with the same id.
 */
export function indexOfOccurrence(list: readonly YtItem[], item: YtItem, hint?: number) {
  const same = list.indexOf(item);
  if (same >= 0) return same;
  if (hint !== undefined && hint >= 0 && list[hint] && domainId(list[hint]) === domainId(item)) return hint;
  return list.findIndex((value) => value.id === item.id);
}
