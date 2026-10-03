import { useState } from "react";
import { call } from "../../lib/ipc";
import type { HomePage, YtItem } from "../../types";
import type { ResourceCache } from "../../data/resourceCache";
import { useResource } from "../../data/useResource";
import { homeKey, speedDialKey } from "../../data/keys";
import { errorMessage } from "../../lib/util";
import type { SetNotice } from "../../app/notifications";

const HOME_FALLBACK = { status: "loading" as const, data: { sections: [] } as HomePage };
const SPEED_DIAL_FALLBACK = { status: "idle" as const, data: [] as YtItem[] };

/** Server state of the Home page (U4-008): the feed, its continuation and Speed Dial. */
export function useHomeData({ cache, setNotice }: { cache: ResourceCache; setNotice: SetNotice }) {
  const [home] = useResource<HomePage>(cache, homeKey, HOME_FALLBACK);
  const [speedDialState] = useResource<YtItem[]>(cache, speedDialKey, SPEED_DIAL_FALLBACK);
  const [homeMoreLoading, setHomeMoreLoading] = useState(false);

  const loadHome = async () => {
    await cache.load<HomePage>(homeKey, () => call("ytm_home"), { empty: { sections: [] } });
  };

  const loadSpeedDial = async () => {
    const outcome = await cache.load(speedDialKey, () => call("speed_dial_items"), { empty: [] });
    if (outcome.status === "error") setNotice(`Speed Dial unavailable: ${outcome.error}`, "error");
  };

  const loadHomeMore = async () => {
    const current = cache.get<HomePage>(homeKey);
    const continuation = current?.status === "ready" ? current.data.continuation : null;
    if (!continuation || homeMoreLoading) return;
    // A reload of the feed (account change) supersedes this token, so its page is not merged into the new feed.
    const token = cache.begin(`${homeKey}:more`, "home-more");
    const feed = current;
    setHomeMoreLoading(true);
    try {
      const next = await call("ytm_home_continuation", { continuation });
      if (!token.isCurrent() || cache.get<HomePage>(homeKey) !== feed) return;
      cache.set<HomePage>(homeKey, (entry) =>
        entry && entry.status === "ready" ? { ...entry, data: mergeHomePages(entry.data, next) } : entry,
      );
    } catch (error) {
      if (token.isCurrent()) setNotice(`Home continuation failed: ${errorMessage(error)}`, "error");
    } finally {
      token.finish();
      setHomeMoreLoading(false);
    }
  };

  return { home, homeMoreLoading, loadHome, loadHomeMore, speedDial: speedDialState.data, loadSpeedDial };
}

/** Appends a continuation page: sections with the same title are merged, items already shown are skipped. */
export function mergeHomePages(current: HomePage, next: HomePage): HomePage {
  const sections = current.sections.map((section) => ({ ...section, items: [...section.items] }));
  for (const nextSection of next.sections) {
    const existing = sections.find((section) => section.title === nextSection.title);
    if (!existing) {
      sections.push(nextSection);
      continue;
    }
    for (const item of nextSection.items)
      if (!existing.items.some((value) => value.id === item.id)) existing.items.push(item);
    existing.browseId ??= nextSection.browseId;
    existing.browseKind ??= nextSection.browseKind;
    existing.params ??= nextSection.params;
  }
  return { sections, continuation: next.continuation };
}
