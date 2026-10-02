// Pick the YouTube version of a Spotify song (moved out of App.tsx, TR-M1).

import type { LoadState, SpotifyTrackMatch, YtItem } from "../../types";
import type { Dispatch, SetStateAction } from "react";

export type YoutubeMatchDialogProps = {
  confirmYoutubeVersion: () => Promise<void>;
  setYoutubeMatchItem: Dispatch<SetStateAction<{ item: YtItem; match: SpotifyTrackMatch } | null>>;
  setYoutubeMatchUrl: Dispatch<SetStateAction<string>>;
  youtubeMatchItem: { item: YtItem; match: SpotifyTrackMatch };
  youtubeMatchPreview: LoadState<YtItem | null> | null;
  youtubeMatchUrl: string;
};

export function YoutubeMatchDialog({
  confirmYoutubeVersion,
  setYoutubeMatchItem,
  setYoutubeMatchUrl,
  youtubeMatchItem,
  youtubeMatchPreview,
  youtubeMatchUrl,
}: YoutubeMatchDialogProps) {
  return (
    <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setYoutubeMatchItem(null)}>
      <div className="detail-panel picker-panel" onClick={(event) => event.stopPropagation()}>
        <button className="close-button" title="Close" aria-label="Close" onClick={() => setYoutubeMatchItem(null)}>
          ×
        </button>
        <p className="eyebrow">Change YouTube version</p>
        <h2>{youtubeMatchItem.match.name}</h2>
        <p className="muted-copy">
          Current match: {youtubeMatchItem.item.title} · {youtubeMatchItem.item.videoId}
        </p>
        <label className="form-field">
          <span>Paste YouTube URL or 11-character video ID</span>
          <input
            value={youtubeMatchUrl}
            onChange={(event) => setYoutubeMatchUrl(event.target.value)}
            placeholder="https://music.youtube.com/watch?v=…"
            autoFocus
          />
        </label>
        {youtubeMatchPreview?.status === "loading" && (
          <div className="state-panel">
            <div className="spinner" />
            <p>Searching YouTube Music…</p>
          </div>
        )}
        {youtubeMatchPreview?.status === "error" && (
          <div className="state-panel error">
            <p>{youtubeMatchPreview.error}</p>
          </div>
        )}
        {youtubeMatchPreview?.status === "ready" && youtubeMatchPreview.data && (
          <div className="match-preview">
            <strong>{youtubeMatchPreview.data.title}</strong>
            <span>{youtubeMatchPreview.data.subtitle}</span>
            <small>{youtubeMatchPreview.data.videoId}</small>
          </div>
        )}
        <div className="dialog-actions">
          <button className="secondary-button" onClick={() => setYoutubeMatchItem(null)}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={
              youtubeMatchPreview?.status !== "ready" ||
              !youtubeMatchPreview.data?.videoId ||
              youtubeMatchPreview.data.videoId === youtubeMatchItem.item.videoId
            }
            onClick={() => void confirmYoutubeVersion()}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
