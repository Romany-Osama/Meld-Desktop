// Local listening recap (moved out of App.tsx, TR-M1).

import type { Dispatch, SetStateAction } from "react";
import type { Resource } from "../../data/resourceCache";
import type { StatsPayload } from "../../types";

export type RecapDialogProps = {
  setRecapOpen: Dispatch<SetStateAction<boolean>>;
  stats: Resource<StatsPayload>;
};

export function RecapDialog({ setRecapOpen, stats }: RecapDialogProps) {
  return (
    <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setRecapOpen(false)}>
      <div className="detail-panel recap-panel" onClick={(event) => event.stopPropagation()}>
        <button className="close-button" title="Close" aria-label="Close" onClick={() => setRecapOpen(false)}>
          ×
        </button>
        <p className="eyebrow">Meld Desktop</p>
        <h2>Local listening recap</h2>
        <p className="muted-copy">
          A device-only recap calculated from your Meld playback history. It is not the remote YouTube Music Wrapped
          feed.
        </p>
        <div className="recap-grid">
          <div className="stats-summary-card">
            <strong>{stats.data.totalMinutes}</strong>
            <span>Minutes listened</span>
          </div>
          <div className="stats-summary-card">
            <strong>{stats.data.uniqueSongs}</strong>
            <span>Unique songs</span>
          </div>
          <div className="stats-summary-card">
            <strong>{stats.data.totalPlays}</strong>
            <span>Plays</span>
          </div>
        </div>
        {stats.data.rows[0] && (
          <div className="recap-highlight">
            <span>Top song</span>
            <strong>{stats.data.rows[0].item.title}</strong>
            <small>
              {stats.data.rows[0].item.subtitle} · {stats.data.rows[0].plays} plays
            </small>
          </div>
        )}
        {stats.data.artists[0] && (
          <div className="recap-highlight">
            <span>Top artist</span>
            <strong>{stats.data.artists[0].title}</strong>
            <small>{stats.data.artists[0].plays} plays</small>
          </div>
        )}
        <button className="primary-button" onClick={() => setRecapOpen(false)}>
          Done
        </button>
      </div>
    </div>
  );
}
