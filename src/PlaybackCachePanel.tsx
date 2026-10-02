import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CACHE_LIMIT_CHOICES_MB, limitLabel, usageSummary, type PlayerCacheUsage } from "./lib/cacheUsage";

// Settings → Storage: playback-cache size, limit and clearing (PLAY-041). Offline downloads are separate.
export function PlaybackCachePanel({ onNotice }: { onNotice: (message: string) => void }) {
  const [usage, setUsage] = useState<PlayerCacheUsage | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try { setUsage(await invoke<PlayerCacheUsage>("player_cache_usage")); }
    catch (error) { onNotice(`Playback cache size could not be read: ${String(error)}`); }
  };

  useEffect(() => { void refresh(); }, []);

  const changeLimit = async (limitMb: number) => {
    setBusy(true);
    try { await invoke("settings_set", { key: "playerCacheLimitMb", value: String(limitMb) }); await refresh(); }
    catch (error) { onNotice(`Playback cache limit could not be saved: ${String(error)}`); }
    finally { setBusy(false); }
  };

  const clear = async () => {
    setBusy(true);
    try { const removed = await invoke<number>("player_cache_clear"); onNotice(removed === 1 ? "Removed 1 cached song." : `Removed ${removed} cached songs.`); await refresh(); }
    catch (error) { onNotice(`Playback cache could not be cleared: ${String(error)}`); }
    finally { setBusy(false); }
  };

  return (
    <div className="settings-group">
      <h3>Playback cache</h3>
      <label className="setting-row">
        <span>
          <strong>Cache size limit</strong>
          <small>Songs you play are kept on disk for instant replays. When the limit is reached, the songs played longest ago are removed. Offline downloads never count and are never removed.</small>
        </span>
        <select value={usage?.limitMb ?? ""} disabled={busy || usage === null} onChange={(event) => void changeLimit(Number(event.target.value))}>
          {CACHE_LIMIT_CHOICES_MB.map((limit) => <option key={limit} value={limit}>{limitLabel(limit)}</option>)}
        </select>
      </label>
      <p className="muted-copy">{usage ? usageSummary(usage) : "Reading cache size…"}</p>
      <div className="storage-actions">
        <button className="secondary-button" disabled={busy || !usage || usage.songs === 0} onClick={() => void clear()}>Clear playback cache</button>
      </div>
    </div>
  );
}
