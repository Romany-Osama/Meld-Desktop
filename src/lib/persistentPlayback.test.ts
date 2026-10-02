import { describe, expect, it } from "vitest";
import { restoreQueue, restoreSession } from "./persistentPlayback";

type Item = { id: string; title: string; kind: string };
const item = (id: string): Item => ({ id, title: `Song ${id}`, kind: "song" });
const none: Item[] = [];

describe("persistent queue restore (PLAY-055, QUEUE-001)", () => {
  it("restores items, clamps the index and keeps the continuation kind", () => {
    const queue = restoreQueue({
      items: [item("a"), item("b"), { id: 3 }, null],
      index: 9,
      continuation: "token",
      continuationKind: "playlist",
    });
    expect(queue).toEqual({
      items: [item("a"), item("b")],
      index: 1,
      continuation: "token",
      continuationKind: "playlist",
    });
    expect(restoreQueue({ items: [item("a")], continuationKind: "playlist" })).toMatchObject({
      index: -1,
      continuation: null,
      continuationKind: null,
    });
  });

  it("ignores missing or malformed storage", () => {
    for (const stored of [null, undefined, "x", 4, [], { items: "nope" }, { items: [] }])
      expect(restoreQueue(stored)).toBeNull();
    expect(restoreSession(null, none)).toBeNull();
    expect(restoreSession({ items: [{ id: 1 }] }, none)).toBeNull();
  });

  it("restores the playing song, its position and whether it was playing", () => {
    const session = restoreSession(
      { items: [item("a"), item("b"), item("c")], index: 0, item: item("c"), position: 61.2, playing: false },
      none,
    );
    expect(session).toMatchObject({ index: 2, position: 61.2, playing: false, kind: "next", continuationKind: null });
    expect(session?.item.id).toBe("c");
  });

  it("falls back to the queue's items and the stored index when the session has none", () => {
    const session = restoreSession({ index: 1.7, position: -5 }, [item("a"), item("b")]);
    expect(session).toMatchObject({ index: 1, position: 0, playing: true });
    expect(session?.item.id).toBe("b");
    expect(restoreSession({ position: 3 }, [item("a")])).toBeNull();
  });

  it("an unknown playing song still restores at the start of the queue", () => {
    const session = restoreSession(
      { items: [item("a")], item: item("gone"), continuation: "c", continuationKind: "playlist" },
      none,
    );
    expect(session).toMatchObject({ index: 0, kind: "playlist", continuationKind: "playlist", continuation: "c" });
  });
});
