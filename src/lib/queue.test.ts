import { describe, expect, it } from "vitest";
import { appendNewPlayable, arrangeQueue, moveItem, removeAt, shuffleAfterCurrent, shuffleInPlace } from "./queue";

const songs = (...ids: string[]) => ids.map((id) => ({ id, videoId: `v-${id}` }));
const ids = (items: { id: string }[]) => items.map((item) => item.id);
/** Deterministic generator so shuffles are reproducible. */
const seeded =
  (seed = 7) =>
  () =>
    ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe("arrangeQueue (QUEUE-001)", () => {
  it("leaves the queue alone when shuffle is off or there is nothing to shuffle", () => {
    const queue = songs("a", "b", "c");
    expect(arrangeQueue(queue, 1, 3, { shuffle: false, playlistFirst: false })).toEqual({ items: queue, index: 1 });
    expect(arrangeQueue(songs("a"), 0, 1, { shuffle: true, playlistFirst: false }).index).toBe(0);
    expect(arrangeQueue(queue, -1, 3, { shuffle: true, playlistFirst: false }).index).toBe(-1);
  });

  it("moves the current song to the front and keeps every song exactly once", () => {
    const queue = songs("a", "b", "c", "d", "e", "f");
    const arranged = arrangeQueue(queue, 3, 6, { shuffle: true, playlistFirst: false, random: seeded() });
    expect(arranged.index).toBe(0);
    expect(arranged.items[0].id).toBe("d");
    expect([...ids(arranged.items)].sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("plays the original playlist before radio additions with shuffle-playlist-first", () => {
    const queue = songs("p1", "p2", "p3", "r1", "r2", "r3");
    for (let seed = 1; seed < 20; seed += 1) {
      const arranged = arrangeQueue(queue, 1, 3, { shuffle: true, playlistFirst: true, random: seeded(seed) });
      expect(arranged.items[0].id).toBe("p2");
      expect([...ids(arranged.items.slice(1, 3))].sort()).toEqual(["p1", "p3"]);
      expect([...ids(arranged.items.slice(3))].sort()).toEqual(["r1", "r2", "r3"]);
    }
  });
});

describe("queue edits", () => {
  it("shuffles only the songs after the current one", () => {
    const queue = songs("a", "b", "c", "d", "e");
    const result = shuffleAfterCurrent(queue, "b", seeded(3));
    expect(ids(result.slice(0, 2))).toEqual(["a", "b"]);
    expect([...ids(result.slice(2))].sort()).toEqual(["c", "d", "e"]);
    expect(shuffleAfterCurrent(queue, "e")).toBe(queue);
    expect(shuffleAfterCurrent(queue, null)).toBe(queue);
  });

  it("removing keeps the current song selected, or hands over to the next one", () => {
    const queue = songs("a", "b", "c", "d");
    expect(removeAt(queue, 2, 0)).toMatchObject({ index: 1, wasCurrent: false });
    expect(removeAt(queue, 2, 3)).toMatchObject({ index: 2, wasCurrent: false });
    const current = removeAt(queue, 2, 2)!;
    expect(current).toMatchObject({ index: 2, wasCurrent: true });
    expect(current.items[current.index].id).toBe("d");
    expect(removeAt(queue, 3, 3)).toMatchObject({ index: 2, wasCurrent: true });
    expect(removeAt(queue, 0, 9)).toBeNull();
  });

  it("moving follows the playing song", () => {
    const queue = songs("a", "b", "c", "d");
    const follow = (current: number, from: number, to: number) => {
      const moved = moveItem(queue, current, from, to)!;
      return moved.items[moved.index].id;
    };
    for (const [current, from, to] of [
      [1, 1, 3],
      [1, 0, 3],
      [1, 3, 0],
      [2, 0, 1],
      [0, 2, 3],
    ])
      expect(follow(current, from, to)).toBe(queue[current].id);
    expect(moveItem(queue, 0, 1, 1)).toBeNull();
  });

  it("continuation pages append only playable songs that are not queued yet", () => {
    const queue = songs("a", "b");
    const page = [...songs("b", "c", "c"), { id: "d", videoId: null }];
    expect(ids(appendNewPlayable(queue, page))).toEqual(["c"]);
  });

  it("shuffleInPlace is a permutation", () => {
    expect(shuffleInPlace([1, 2, 3, 4, 5], seeded(11)).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
