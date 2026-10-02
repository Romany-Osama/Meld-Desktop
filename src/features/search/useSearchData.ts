import { useState } from "react";
import { call } from "../../lib/ipc";
import { invokeCancellable } from "../../lib/cancellable";
import type { SearchPage } from "../../types";
import type { ResourceCache } from "../../data/resourceCache";
import { useResource } from "../../data/useResource";
import { FRESH_FOR_MS, searchKey } from "../../data/keys";
import { errorMessage } from "../../lib/util";
import type { SetNotice } from "../../app/notifications";

const EMPTY_SEARCH: SearchPage = { items: [], continuation: null };
const SEARCH_FALLBACK = { status: "idle" as const, data: EMPTY_SEARCH };
const SEARCH_HISTORY_FALLBACK = { status: "idle" as const, data: [] as string[] };
const searchHistoryKey = "search:history";

/** Server state of the Search page (U4-008): results per query, their continuation and the search history. */
export function useSearchData({
  cache,
  setNotice,
  submittedQuery,
}: {
  cache: ResourceCache;
  setNotice: SetNotice;
  submittedQuery: string;
}) {
  const [search] = useResource<SearchPage>(cache, searchKey(submittedQuery), SEARCH_FALLBACK);
  const [searchHistoryState] = useResource<string[]>(cache, searchHistoryKey, SEARCH_HISTORY_FALLBACK);
  const [searchMoreLoading, setSearchMoreLoading] = useState(false);

  /**
   * Loads results for `query`. With `reuse`, results fetched in the last few minutes are shown as they were
   * (Back to a search, U4-010) instead of being fetched again.
   */
  const loadSearch = async (query: string, { reuse = false }: { reuse?: boolean } = {}) => {
    const key = searchKey(query);
    if (reuse && cache.isFresh(key, FRESH_FOR_MS)) return;
    await cache.load(key, (signal) => invokeCancellable("ytm_search", { query }, signal), {
      scope: "search",
      keepData: false,
      placeholder: EMPTY_SEARCH,
    });
  };

  /** Shows `query` without results (pasted links are opened, not searched). */
  const clearSearch = (query: string) => {
    cache.cancelScope("search");
    cache.set(searchKey(query), SEARCH_FALLBACK);
  };

  const loadSearchMore = async () => {
    const key = searchKey(submittedQuery);
    const current = cache.get<SearchPage>(key);
    const continuation = current?.status === "ready" ? current.data.continuation : null;
    if (!continuation || searchMoreLoading) return;
    const token = cache.begin(`${key}:more`, "search-more");
    setSearchMoreLoading(true);
    try {
      const next = await invokeCancellable("ytm_search_continuation", { continuation }, token.signal);
      // The page is merged into the query it was requested for, even if the user searched for something else since.
      if (!token.isCurrent() || cache.get<SearchPage>(key) !== current) return;
      cache.set<SearchPage>(key, (entry) => {
        if (!entry || entry.status !== "ready") return entry;
        const items = [...entry.data.items];
        for (const item of next.items) if (!items.some((existing) => existing.id === item.id)) items.push(item);
        return { ...entry, data: { items, continuation: next.continuation } };
      });
    } catch (error) {
      if (token.isCurrent()) setNotice(`Search continuation failed: ${errorMessage(error)}`, "error");
    } finally {
      token.finish();
      setSearchMoreLoading(false);
    }
  };

  const loadSearchHistory = async () => {
    await cache.load(searchHistoryKey, () => call("search_history_items"), { empty: [] });
  };

  return {
    search,
    searchMoreLoading,
    loadSearch,
    clearSearch,
    loadSearchMore,
    searchHistory: searchHistoryState.data,
    loadSearchHistory,
  };
}
