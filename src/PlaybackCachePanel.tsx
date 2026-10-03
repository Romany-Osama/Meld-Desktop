import { errorMessage } from "./lib/util";
import { call } from "./lib/ipc";
import { useEffect, useState } from "react";
import { CACHE_LIMIT_CHOICES_MB, limitLabel, usageSummary, type PlayerCacheUsage } from "./lib/cacheUsage";
import type { SetNotice } from "./app/notifications";
import type { Destructive } from "./app/destructive";

// Settings → Storage: playback-cache size, limit and clearing (PLAY-041). Offline downloads are separate.
export function PlaybackCachePanel({ onNotice, destructive }: { onNotice: SetNotice; destructive: Destructive }) {
  const [usage, setUsage] = useState<PlayerCacheUsage | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setUsage(await call("player_cache_usage"));
    } catch (error) {
      onNotice(`Playback cache size could not be read: ${errorMessage(error)}`, "error");
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const changeLimit = async (limitMb: number) => {
    setBusy(true);
    try {
      await call("settings_set", { key: "playerCacheLimitMb", value: String(limitMb) });
      await refresh();
    } catch (error) {
      onNotice(`Playback cache limit could not be saved: ${errorMessage(error)}`, "error");
    } finally {
      setBusy(false);
    }
  };

  // Disposable (U4-012): songs are cached again when played, so neither a question nor Undo.
  const clear = async () => {
    setBusy(true);
    let removed = 0;
    try {
      await destructive({
        severity: "disposable",
        key: "player-cache-clear",
        commit: async () => {
          removed = await call("player_cache_clear");
        },
        refresh,
        success: () => (removed === 1 ? "Removed 1 cached song." : `Removed ${removed} cached songs.`),
        failure: "Playback cache could not be cleared",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-group">
      <h3>Playback cache</h3>
      <label className="setting-row">
        <span>
          <strong>Cache size limit</strong>
          <small>
            Songs you play are kept on disk for instant replays. When the limit is reached, the songs played longest ago
            are removed. Offline downloads never count and are never removed.
          </small>
        </span>
        <select
          value={usage?.limitMb ?? ""}
          disabled={busy || usage === null}
          onChange={(event) => void changeLimit(Number(event.target.value))}
        >
          {CACHE_LIMIT_CHOICES_MB.map((limit) => (
            <option key={limit} value={limit}>
              {limitLabel(limit)}
            </option>
          ))}
        </select>
      </label>
      <p className="muted-copy">{usage ? usageSummary(usage) : "Reading cache size…"}</p>
      <div className="storage-actions">
        <button
          className="secondary-button"
          disabled={busy || !usage || usage.songs === 0}
          onClick={() => void clear()}
        >
          Clear playback cache
        </button>
      </div>
    </div>
  );
}
