// Speed Dial editor (moved out of App.tsx, TR-M1).

import type { Dispatch, SetStateAction } from "react";

export type SpeedDialDialogProps = {
  playbackSpeed: number;
  setPlaybackSpeed: Dispatch<SetStateAction<number>>;
  setSpeedDialogOpen: Dispatch<SetStateAction<boolean>>;
  settings: Record<string, boolean>;
};

export function SpeedDialDialog({
  playbackSpeed,
  setPlaybackSpeed,
  setSpeedDialogOpen,
  settings,
}: SpeedDialDialogProps) {
  return (
    <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setSpeedDialogOpen(false)}>
      <div className="detail-panel speed-dialog" onClick={(event) => event.stopPropagation()}>
        <button className="close-button" title="Close" aria-label="Close" onClick={() => setSpeedDialogOpen(false)}>
          ×
        </button>
        <p className="eyebrow">Player</p>
        <h2>{settings.varispeed === true ? "Playback speed" : "Tempo and pitch"}</h2>
        <p className="muted-copy">
          {settings.varispeed === true
            ? "Change speed with pitch following, matching Meld’s varispeed mode."
            : "Change playback tempo. Desktop keeps pitch with the native audio element when varispeed is off."}
        </p>
        <label className="speed-control">
          <strong>x{playbackSpeed.toFixed(2)}</strong>
          <input
            type="range"
            min="0.25"
            max="2"
            step="0.05"
            value={playbackSpeed}
            onChange={(event) => setPlaybackSpeed(Number(event.currentTarget.value))}
            aria-label="Playback speed"
          />
        </label>
        <div className="dialog-actions">
          <button className="secondary-button" onClick={() => setPlaybackSpeed(1)}>
            Reset
          </button>
          <button className="primary-button" onClick={() => setSpeedDialogOpen(false)}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
