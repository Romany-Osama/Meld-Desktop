import type { LoadState } from "../types";
import { errorMessage } from "../lib/util";

/**
 * Server state (U4-008): data fetched from the backend, keyed by what it is (`home`, `search:<query>`,
 * `detail:album:<id>` …), kept apart from view state such as open dialogs, filters and player controls.
 *
 * Request identities (U4-009): every load gets an id. Only the newest load of a key may commit its result, and
 * starting a load in a scope (one per screen, e.g. `detail`) aborts the older load of that scope, so a page the
 * user has already left can never overwrite the page they are looking at. Tauri commands cannot be interrupted
 * yet (S5-009); an aborted load's answer is dropped when it arrives.
 *
 * Entries stay cached (least recently used first out), so Back can show a page as it was left (U4-010).
 */
export type Resource<T> = LoadState<T> & { fetchedAt?: number };

export type LoadOutcome<T> = { status: "ready"; data: T } | { status: "error"; error: string } | { status: "stale" };

export type LoadOptions<T> = {
  /** Requests in the same scope supersede each other even across keys (one in-flight page per screen). */
  scope?: string;
  /** Data to show while loading when nothing is cached yet. */
  placeholder?: T;
  /** Value for `data` when the load fails and nothing was cached. */
  empty?: T;
  /** Keep the cached data visible while reloading (default true). */
  keepData?: boolean;
};

type Inflight = { id: number; key: string; scope?: string; controller: AbortController; previous?: Resource<unknown> };

export const DEFAULT_MAX_ENTRIES = 60;

export class ResourceCache {
  private entries = new Map<string, Resource<unknown>>();
  private inflight = new Map<string, Inflight>();
  private scopes = new Map<string, string>();
  private listeners = new Set<() => void>();
  private nextId = 1;

  constructor(
    private readonly maxEntries = DEFAULT_MAX_ENTRIES,
    private readonly now: () => number = () => Date.now(),
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  get<T>(key: string): Resource<T> | undefined {
    return this.entries.get(key) as Resource<T> | undefined;
  }

  /** True while a load for `key` is in flight. */
  isLoading(key: string): boolean {
    return this.inflight.has(key);
  }

  /** True when `key` holds ready data fetched less than `maxAgeMs` ago. */
  isFresh(key: string, maxAgeMs: number): boolean {
    const entry = this.entries.get(key);
    return entry?.status === "ready" && entry.fetchedAt !== undefined && this.now() - entry.fetchedAt < maxAgeMs;
  }

  /** Writes an entry directly (optimistic updates, results of mutations). A functional update sees the current entry. */
  set<T>(key: string, update: Resource<T> | ((current: Resource<T> | undefined) => Resource<T> | undefined)): void {
    const current = this.entries.get(key) as Resource<T> | undefined;
    const next = typeof update === "function" ? update(current) : update;
    if (next === current) return;
    if (next === undefined) this.entries.delete(key);
    else this.write(key, next);
    this.emit();
  }

  /** Drops cached entries whose key starts with `prefix` (in-flight loads are left alone). */
  invalidate(prefix: string): void {
    let changed = false;
    for (const key of [...this.entries.keys()])
      if (key.startsWith(prefix) && !this.inflight.has(key)) {
        this.entries.delete(key);
        changed = true;
      }
    if (changed) this.emit();
  }

  /** Aborts the in-flight load of `key`; its entry goes back to what it was before the load started. */
  cancel(key: string): void {
    const request = this.inflight.get(key);
    if (!request) return;
    this.abort(request);
    this.emit();
  }

  /** Aborts whatever load is in flight in `scope` (used when the user leaves a screen). */
  cancelScope(scope: string): void {
    const key = this.scopes.get(scope);
    if (key !== undefined) this.cancel(key);
  }

  /**
   * Starts a request for `key` and returns a token. Use it for loads that do not fit `load` (continuations): check
   * `isCurrent()` after every await before writing.
   */
  begin(
    key: string,
    scope?: string,
  ): { id: number; signal: AbortSignal; isCurrent: () => boolean; finish: () => void } {
    const previousInScope = scope !== undefined ? this.scopes.get(scope) : undefined;
    if (previousInScope !== undefined && previousInScope !== key) {
      const old = this.inflight.get(previousInScope);
      if (old) this.abort(old);
    }
    const existing = this.inflight.get(key);
    if (existing) {
      existing.controller.abort();
      this.inflight.delete(key);
    }
    const request: Inflight = {
      id: this.nextId++,
      key,
      scope,
      controller: new AbortController(),
      previous: existing?.previous ?? this.entries.get(key),
    };
    this.inflight.set(key, request);
    if (scope !== undefined) this.scopes.set(scope, key);
    const isCurrent = () => this.inflight.get(key)?.id === request.id && !request.controller.signal.aborted;
    const finish = () => {
      if (this.inflight.get(key)?.id !== request.id) return;
      this.inflight.delete(key);
      if (scope !== undefined && this.scopes.get(scope) === key) this.scopes.delete(scope);
    };
    return { id: request.id, signal: request.controller.signal, isCurrent, finish };
  }

  /**
   * Loads `key` with `fetcher`. Shows `loading` (keeping cached data unless `keepData` is false), then commits the
   * result only if this is still the newest request for the key. Returns `stale` when it was superseded or aborted.
   */
  async load<T>(key: string, fetcher: (signal: AbortSignal) => Promise<T>, options: LoadOptions<T> = {}) {
    const token = this.begin(key, options.scope);
    const cached = this.entries.get(key) as Resource<T> | undefined;
    const keep = options.keepData !== false && cached !== undefined;
    const loadingData = keep ? cached.data : (options.placeholder ?? options.empty ?? cached?.data);
    if (loadingData !== undefined) {
      this.write(key, { status: "loading", data: loadingData, fetchedAt: keep ? cached.fetchedAt : undefined });
      this.emit();
    }
    try {
      const data = await fetcher(token.signal);
      if (!token.isCurrent()) return { status: "stale" } as LoadOutcome<T>;
      token.finish();
      this.write(key, { status: "ready", data, fetchedAt: this.now() });
      this.emit();
      return { status: "ready", data } as LoadOutcome<T>;
    } catch (error) {
      if (!token.isCurrent()) return { status: "stale" } as LoadOutcome<T>;
      token.finish();
      const message = errorMessage(error);
      const data = (keep ? cached.data : (options.empty ?? options.placeholder ?? cached?.data)) as T;
      this.write(key, { status: "error", data, error: message });
      this.emit();
      return { status: "error", error: message } as LoadOutcome<T>;
    }
  }

  keys(): string[] {
    return [...this.entries.keys()];
  }

  private abort(request: Inflight) {
    request.controller.abort();
    this.inflight.delete(request.key);
    if (request.scope !== undefined && this.scopes.get(request.scope) === request.key)
      this.scopes.delete(request.scope);
    // The page is no longer shown; leave its last good state behind instead of a spinner nobody will resolve.
    if (request.previous) this.entries.set(request.key, request.previous);
    else this.entries.delete(request.key);
  }

  private write(key: string, value: Resource<unknown>) {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.maxEntries) {
      const oldest = [...this.entries.keys()].find((candidate) => !this.inflight.has(candidate));
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  private emit() {
    for (const listener of [...this.listeners]) listener();
  }
}
