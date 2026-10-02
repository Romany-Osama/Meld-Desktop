import { useEffect, useState } from "react";
import { call } from "../../lib/ipc";
import { invokeCancellable } from "../../lib/cancellable";
import type { DetailPage } from "../../types";
import type { ResourceCache } from "../../data/resourceCache";
import { useResource } from "../../data/useResource";
import { detailKey, FRESH_FOR_MS, type DetailRef } from "../../data/keys";
import { errorMessage } from "../../lib/util";
import type { SetNotice } from "../../app/notifications";

const DETAIL_FALLBACK = {
  status: "loading" as const,
  data: { kind: "browse", title: "", subtitle: "", items: [] } as DetailPage,
};

/** Fetches one album, artist, podcast or browse page. */
export async function fetchDetail(ref: DetailRef, signal?: AbortSignal): Promise<DetailPage> {
  if (ref.kind === "browse") {
    const data = await invokeCancellable("ytm_browse", { browseId: ref.browseId, params: ref.params ?? null }, signal);
    return { ...data, browseId: data.browseId ?? ref.browseId };
  }
  const data = await invokeCancellable("ytm_detail", { kind: ref.kind, browseId: ref.browseId }, signal);
  return { ...data, browseId: data.browseId ?? ref.browseId };
}

/**
 * Server state of the open album/artist/podcast/browse page (U4-008). Which page is open (`detailRef`) is view
 * state owned by the caller; this hook owns its data, continuation, podcast refresh and the artist subscription.
 */
export function useDetailData({
  cache,
  detailRef,
  setNotice,
}: {
  cache: ResourceCache;
  detailRef: DetailRef | null;
  setNotice: SetNotice;
}) {
  const key = detailRef ? detailKey(detailRef) : null;
  const [detail, setDetailData] = useResource<DetailPage>(cache, key, DETAIL_FALLBACK);
  const [detailMoreLoading, setDetailMoreLoading] = useState(false);
  const [detailRefreshing, setDetailRefreshing] = useState(false);
  const [detailArtistSubscribed, setDetailArtistSubscribed] = useState(false);

  /**
   * Loads `ref`, showing `placeholder` (title and artwork from the card that was clicked) until it arrives. With
   * `reuse`, a page fetched in the last few minutes is shown as it was (U4-010). Opening another page supersedes this
   * load (scope `detail`, U4-009).
   */
  const loadDetail = async (ref: DetailRef, placeholder: DetailPage, { reuse = false }: { reuse?: boolean } = {}) => {
    const target = detailKey(ref);
    if (reuse && cache.isFresh(target, FRESH_FOR_MS)) return;
    await cache.load(target, (signal) => fetchDetail(ref, signal), {
      scope: "detail",
      placeholder,
      empty: placeholder,
    });
  };

  const loadDetailMore = async () => {
    if (!key || !detail || detail.status !== "ready" || !detail.data.continuation || detailMoreLoading) return;
    const page = detail.data;
    const continuation = detail.data.continuation;
    const token = cache.begin(`${key}:more`, "detail-more");
    setDetailMoreLoading(true);
    try {
      const next =
        page.kind === "browse"
          ? await call("ytm_browse_continuation", {
              browseId: page.browseId ?? "",
              continuation,
            })
          : await call("ytm_detail_continuation", { kind: page.kind, continuation });
      if (page.kind === "podcast" && page.browseId)
        await call("ytm_podcast_cache_detail_page", { browseId: page.browseId, page: next });
      if (!token.isCurrent()) return;
      // Merged into the page it was requested for, even if another page is open by now.
      cache.set<DetailPage>(key, (entry) => {
        if (!entry || entry.status !== "ready") return entry;
        const items = [...entry.data.items];
        for (const item of next.items) if (!items.some((existing) => existing.id === item.id)) items.push(item);
        return { ...entry, data: { ...entry.data, items, continuation: next.continuation } };
      });
    } catch (error) {
      if (token.isCurrent()) setNotice(`More ${page.kind} items could not be loaded: ${errorMessage(error)}`, "error");
    } finally {
      token.finish();
      setDetailMoreLoading(false);
    }
  };

  const refreshPodcastDetail = async () => {
    if (!detailRef || !detail || detail.status !== "ready" || detail.data.kind !== "podcast" || detailRefreshing)
      return;
    setDetailRefreshing(true);
    try {
      const outcome = await cache.load(detailKey(detailRef), (signal) => fetchDetail(detailRef, signal), {
        scope: "detail",
      });
      if (outcome.status === "ready") setNotice("Podcast details refreshed.");
      else if (outcome.status === "error") setNotice(`Podcast refresh failed: ${outcome.error}`, "error");
    } finally {
      setDetailRefreshing(false);
    }
  };

  const artistId = detail?.status === "ready" && detail.data.kind === "artist" ? detail.data.browseId : null;
  useEffect(() => {
    let current = true;
    if (!artistId) {
      setDetailArtistSubscribed(false);
      return () => {
        current = false;
      };
    }
    void call("library_artist_state", { artistId })
      .then((value) => {
        if (current) setDetailArtistSubscribed(value);
      })
      .catch(() => {
        if (current) setDetailArtistSubscribed(false);
      });
    return () => {
      current = false;
    };
  }, [artistId]);

  return {
    detail,
    setDetailData,
    loadDetail,
    loadDetailMore,
    detailMoreLoading,
    refreshPodcastDetail,
    detailRefreshing,
    detailArtistSubscribed,
    setDetailArtistSubscribed,
  };
}
