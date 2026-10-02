import { call } from "../../lib/ipc";
import type { RemoteHistoryPage, StatsPayload, YtItem } from "../../types";
import type { StatsPeriod } from "../../app/routes";
import type { ResourceCache } from "../../data/resourceCache";
import { useResource } from "../../data/useResource";
import { historyKey, statsKey } from "../../data/keys";

const HISTORY_FALLBACK = { status: "idle" as const, data: [] as YtItem[] };
const REMOTE_FALLBACK = { status: "idle" as const, data: { sections: [] } as RemoteHistoryPage };
export const emptyStats = (period: string): StatsPayload => ({
  period,
  totalPlays: 0,
  totalMinutes: 0,
  uniqueSongs: 0,
  rows: [],
  artists: [],
  albums: [],
});
const STATS_FALLBACK = { status: "idle" as const, data: emptyStats("all") };

/** Server state of History (local and YouTube Music) and Stats (U4-008). */
export function useHistoryData({
  cache,
  googleSignedIn,
  statsPeriod,
}: {
  cache: ResourceCache;
  googleSignedIn: boolean;
  statsPeriod: StatsPeriod;
}) {
  const [history] = useResource<YtItem[]>(cache, historyKey("local"), HISTORY_FALLBACK);
  const [remoteHistory] = useResource<RemoteHistoryPage>(cache, historyKey("remote"), REMOTE_FALLBACK);
  const [stats] = useResource<StatsPayload>(cache, statsKey(statsPeriod), STATS_FALLBACK);

  const loadHistory = async () => {
    await cache.load(historyKey("local"), () => call("history_items"), { scope: "history", empty: [] });
  };

  const loadRemoteHistory = async () => {
    if (!googleSignedIn) {
      cache.set(historyKey("remote"), {
        status: "error",
        data: { sections: [] },
        error: "Connect a Google / YouTube Music account to view remote history.",
      });
      return;
    }
    await cache.load(historyKey("remote"), () => call("ytm_history"), {
      scope: "history",
      empty: { sections: [] },
    });
  };

  const loadStats = async (period: StatsPeriod = statsPeriod) => {
    await cache.load<StatsPayload>(statsKey(period), () => call("library_stats", { period }), {
      scope: "stats",
      empty: emptyStats(period),
    });
  };

  return { history, remoteHistory, stats, loadHistory, loadRemoteHistory, loadStats };
}
