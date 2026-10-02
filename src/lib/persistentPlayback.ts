// Restore of the persistent queue and playback session after an app restart (PLAY-055, QUEUE-001).
// Input is whatever localStorage held; anything malformed is dropped instead of crashing start-up.

export type ContinuationKind = "next" | "playlist";
export type StoredItem = { id: string; title: string; kind: string };

export type RestoredQueue<T> = {
  items: T[];
  index: number;
  continuation: string | null;
  continuationKind: ContinuationKind | null;
};

export type RestoredSession<T> = RestoredQueue<T> & {
  item: T;
  /** Position to seek to once the stream loads, or null to start at 0. */
  position: number | null;
  /** Autoplay only if the song was playing when the app closed. */
  playing: boolean;
  kind: ContinuationKind;
};

const isItem = (value: unknown): value is StoredItem =>
  !!value &&
  typeof (value as StoredItem).id === "string" &&
  typeof (value as StoredItem).title === "string" &&
  typeof (value as StoredItem).kind === "string";

const validItems = <T>(value: unknown): T[] => (Array.isArray(value) ? (value.filter(isItem) as T[]) : []);

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

export function restoreQueue<T extends StoredItem>(stored: unknown): RestoredQueue<T> | null {
  const queue = record(stored);
  const items = validItems<T>(queue?.items);
  if (items.length === 0) return null;
  const index = typeof queue?.index === "number" ? Math.min(Math.max(queue.index, -1), items.length - 1) : -1;
  const continuation = typeof queue?.continuation === "string" ? queue.continuation : null;
  const continuationKind = continuation ? (queue?.continuationKind === "playlist" ? "playlist" : "next") : null;
  return { items, index, continuation, continuationKind };
}

/** The song that was playing, its queue and position. Falls back to the persistent queue's items. */
export function restoreSession<T extends StoredItem>(stored: unknown, queueItems: T[]): RestoredSession<T> | null {
  const session = record(stored);
  const sessionItems = validItems<T>(session?.items);
  const items = sessionItems.length > 0 ? sessionItems : queueItems;
  if (items.length === 0) return null;
  const storedIndex =
    typeof session?.index === "number" && Number.isFinite(session.index)
      ? Math.min(Math.max(Math.trunc(session.index), 0), items.length - 1)
      : -1;
  const item = isItem(session?.item) ? (session.item as T) : storedIndex >= 0 ? items[storedIndex] : null;
  if (!item) return null;
  const index = Math.max(
    0,
    items.findIndex((candidate) => candidate.id === item.id),
  );
  const continuation = typeof session?.continuation === "string" ? session.continuation : null;
  const kind: ContinuationKind = continuation && session?.continuationKind === "playlist" ? "playlist" : "next";
  const position =
    typeof session?.position === "number" && Number.isFinite(session.position) ? Math.max(0, session.position) : null;
  return {
    items,
    index,
    item,
    continuation,
    continuationKind: continuation ? kind : null,
    kind,
    position,
    playing: session?.playing !== false,
  };
}
