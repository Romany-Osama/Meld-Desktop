import { createContext, useCallback, useContext, useRef, useSyncExternalStore } from "react";
import { ResourceCache, type Resource } from "./resourceCache";

export const ResourceCacheContext = createContext<ResourceCache | null>(null);

/** The app's server-state cache (U4-008). Tests can provide their own through `ResourceCacheContext`. */
export function useResourceCache(): ResourceCache {
  const provided = useContext(ResourceCacheContext);
  const own = useRef<ResourceCache | null>(null);
  if (provided) return provided;
  own.current ??= new ResourceCache();
  return own.current;
}

export type ResourceUpdate<T> = Resource<T> | ((current: Resource<T>) => Resource<T>);

/**
 * Reads cache entry `key` (or `fallback` while it is empty) and re-renders when it changes. The setter writes to
 * the key that is shown now; a key of null means "nothing open" and reads as null.
 */
export function useResource<T>(
  cache: ResourceCache,
  key: string,
  fallback: Resource<T>,
): [Resource<T>, (update: ResourceUpdate<T>) => void];
export function useResource<T>(
  cache: ResourceCache,
  key: string | null,
  fallback: Resource<T>,
): [Resource<T> | null, (update: ResourceUpdate<T>) => void];
export function useResource<T>(cache: ResourceCache, key: string | null, fallback: Resource<T>) {
  const fallbackRef = useRef(fallback);
  const keyRef = useRef(key);
  keyRef.current = key;
  const value = useSyncExternalStore(cache.subscribe, () =>
    key === null ? null : (cache.get<T>(key) ?? fallbackRef.current),
  );
  const update = useCallback(
    (next: ResourceUpdate<T>) => {
      const target = keyRef.current;
      if (target === null) return;
      cache.set<T>(target, (current) => (typeof next === "function" ? next(current ?? fallbackRef.current) : next));
    },
    [cache],
  );
  return [value, update] as const;
}
