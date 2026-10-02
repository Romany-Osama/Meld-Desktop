// Queue arithmetic shared by the player (QUEUE-001: one implementation, tested here).
// Pure functions: no React state, no IPC. `random` is injectable so shuffles are testable.

export type Keyed = { id: string };
export type Random = () => number;

export function shuffleInPlace<T>(values: T[], random: Random = Math.random): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

export type ShuffleOptions = { shuffle: boolean; playlistFirst: boolean; random?: Random };

/**
 * Order a freshly started queue for the shuffle setting. The current item always moves to the front.
 * With "shuffle playlist first", the original items (indexes below `originalQueueSize`) play before radio additions.
 */
export function arrangeQueue<T>(
  items: T[],
  currentIndex: number,
  originalQueueSize: number,
  { shuffle, playlistFirst, random = Math.random }: ShuffleOptions,
): { items: T[]; index: number } {
  if (!shuffle || items.length < 2 || currentIndex < 0 || currentIndex >= items.length)
    return { items, index: currentIndex };
  const indexes = (count: number) => [...Array(count).keys()];
  const original = shuffleInPlace(
    indexes(Math.min(originalQueueSize, items.length)).filter((index) => index !== currentIndex),
    random,
  );
  const added = shuffleInPlace(
    indexes(items.length).filter((index) => index >= originalQueueSize && index !== currentIndex),
    random,
  );
  const order =
    playlistFirst && original.length > 0 && added.length > 0
      ? [currentIndex, ...original, ...added]
      : [
          currentIndex,
          ...shuffleInPlace(
            indexes(items.length).filter((index) => index !== currentIndex),
            random,
          ),
        ];
  return { items: order.map((index) => items[index]), index: 0 };
}

/** Shuffle only what comes after the current item (enabling shuffle mid-queue keeps history and the current song). */
export function shuffleAfterCurrent<T extends Keyed>(
  items: T[],
  currentId: string | null,
  random: Random = Math.random,
) {
  if (!currentId) return items;
  const currentPosition = items.findIndex((item) => item.id === currentId);
  if (currentPosition < 0 || currentPosition >= items.length - 1) return items;
  return [...items.slice(0, currentPosition + 1), ...shuffleInPlace(items.slice(currentPosition + 1), random)];
}

/** Remove one entry. `wasCurrent` tells the caller to start the item now at `index`. */
export function removeAt<T>(items: T[], currentIndex: number, index: number) {
  if (index < 0 || index >= items.length) return null;
  const next = items.filter((_, itemIndex) => itemIndex !== index);
  const wasCurrent = index === currentIndex;
  const nextIndex =
    currentIndex > index ? currentIndex - 1 : wasCurrent ? Math.min(index, next.length - 1) : currentIndex;
  return { items: next, index: nextIndex, wasCurrent };
}

/** Move one entry; the current index follows the song that was playing. */
export function moveItem<T>(items: T[], currentIndex: number, from: number, to: number) {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return null;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  const index =
    currentIndex === from
      ? to
      : currentIndex > from && currentIndex <= to
        ? currentIndex - 1
        : currentIndex >= to && currentIndex < from
          ? currentIndex + 1
          : currentIndex;
  return { items: next, index };
}

/** Continuation pages may repeat songs already queued; only playable songs not yet queued are appended. */
export function appendNewPlayable<T extends Keyed & { videoId?: string | null }>(items: T[], page: T[]): T[] {
  const seen = new Set(items.map((item) => item.id));
  const additions: T[] = [];
  for (const item of page) {
    if (!item.videoId || seen.has(item.id)) continue;
    seen.add(item.id);
    additions.push(item);
  }
  return additions;
}
