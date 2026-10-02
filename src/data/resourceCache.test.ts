import { describe, expect, it } from "vitest";
import { ResourceCache } from "./resourceCache";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("ResourceCache (U4-008, U4-009)", () => {
  it("shows loading, then commits the answer with its fetch time", async () => {
    let now = 1_000;
    const cache = new ResourceCache(10, () => now);
    const answer = deferred<string[]>();
    const load = cache.load("library:liked", () => answer.promise, { empty: [] });
    expect(cache.get("library:liked")).toEqual({ status: "loading", data: [], fetchedAt: undefined });
    expect(cache.isLoading("library:liked")).toBe(true);
    now = 2_000;
    answer.resolve(["a"]);
    expect(await load).toEqual({ status: "ready", data: ["a"] });
    expect(cache.get("library:liked")).toEqual({ status: "ready", data: ["a"], fetchedAt: 2_000 });
    expect(cache.isFresh("library:liked", 500)).toBe(true);
    now = 3_000;
    expect(cache.isFresh("library:liked", 500)).toBe(false);
  });

  it("drops a superseded answer for the same key (newest request wins)", async () => {
    const cache = new ResourceCache();
    const first = deferred<string>();
    const second = deferred<string>();
    const a = cache.load("search:x", () => first.promise);
    const b = cache.load("search:x", () => second.promise);
    second.resolve("new");
    first.resolve("old");
    expect(await a).toEqual({ status: "stale" });
    expect(await b).toEqual({ status: "ready", data: "new" });
    expect(cache.get("search:x")?.data).toBe("new");
  });

  it("aborts the older page of a scope when another page of that screen starts loading", async () => {
    const cache = new ResourceCache();
    const albumA = deferred<string>();
    const albumB = deferred<string>();
    const signals: AbortSignal[] = [];
    const a = cache.load(
      "detail:album:A:",
      (signal) => {
        signals.push(signal);
        return albumA.promise;
      },
      { scope: "detail", placeholder: "A…" },
    );
    const b = cache.load("detail:album:B:", () => albumB.promise, { scope: "detail", placeholder: "B…" });
    expect(signals[0].aborted).toBe(true);
    // A had nothing cached before, so no spinner is left behind for it.
    expect(cache.get("detail:album:A:")).toBeUndefined();
    albumA.resolve("album A");
    albumB.resolve("album B");
    expect(await a).toEqual({ status: "stale" });
    expect(await b).toEqual({ status: "ready", data: "album B" });
    expect(cache.get("detail:album:A:")).toBeUndefined();
  });

  it("restores the last good entry when a reload is cancelled", async () => {
    const cache = new ResourceCache();
    await cache.load("home", async () => "feed 1");
    const reload = deferred<string>();
    const pending = cache.load("home", () => reload.promise, { scope: "home" });
    expect(cache.get("home")?.status).toBe("loading");
    expect(cache.get("home")?.data).toBe("feed 1");
    cache.cancelScope("home");
    expect(cache.get("home")).toMatchObject({ status: "ready", data: "feed 1" });
    reload.resolve("feed 2");
    expect(await pending).toEqual({ status: "stale" });
    expect(cache.get("home")?.data).toBe("feed 1");
  });

  it("keeps cached data on error unless told otherwise", async () => {
    const cache = new ResourceCache();
    await cache.load("stats:all", async () => 5);
    await cache.load("stats:all", async () => Promise.reject(new Error("offline")));
    expect(cache.get("stats:all")).toEqual({ status: "error", data: 5, error: "offline" });
    await cache.load("search:y", async () => Promise.reject("boom"), { keepData: false, empty: [] });
    expect(cache.get("search:y")).toEqual({ status: "error", data: [], error: "boom" });
  });

  it("evicts the least recently written entries but never one that is loading", async () => {
    const cache = new ResourceCache(2);
    const slow = deferred<number>();
    const pending = cache.load("a", () => slow.promise, { empty: 0 });
    cache.set("b", { status: "ready", data: 1 });
    cache.set("c", { status: "ready", data: 2 });
    expect(cache.keys().sort()).toEqual(["a", "c"]);
    slow.resolve(3);
    await pending;
    expect(cache.get("a")?.data).toBe(3);
  });

  it("notifies subscribers, supports functional updates and invalidation", () => {
    const cache = new ResourceCache();
    let calls = 0;
    const stop = cache.subscribe(() => (calls += 1));
    cache.set<number[]>("library:songs", { status: "ready", data: [1] });
    cache.set<number[]>("library:songs", (entry) => entry && { ...entry, data: [...entry.data, 2] });
    expect(cache.get("library:songs")?.data).toEqual([1, 2]);
    cache.invalidate("library:");
    expect(cache.get("library:songs")).toBeUndefined();
    stop();
    cache.set("x", { status: "ready", data: 0 });
    expect(calls).toBe(3);
  });

  it("gives continuations a token that stops being current when superseded", () => {
    const cache = new ResourceCache();
    const first = cache.begin("search:x:more", "search-more");
    expect(first.isCurrent()).toBe(true);
    const second = cache.begin("search:z:more", "search-more");
    expect(first.isCurrent()).toBe(false);
    expect(first.signal.aborted).toBe(true);
    second.finish();
    expect(second.isCurrent()).toBe(false);
  });
});
