// Sleep timer (moved out of App.tsx, TR-M1).
import { invoke } from "@tauri-apps/api/core";
import { errorMessage } from "../../lib/util";
import type { SetNotice } from "../../app/notifications";
import type { Dispatch, SetStateAction } from "react";

export type SleepTimerDialogProps = {
  clearSleepTimer: () => void;
  setNotice: SetNotice;
  setSleepTimerDefault: Dispatch<SetStateAction<number>>;
  setSleepTimerFadeOut: Dispatch<SetStateAction<boolean>>;
  setSleepTimerMinutes: Dispatch<SetStateAction<number>>;
  setSleepTimerOpen: Dispatch<SetStateAction<boolean>>;
  setSleepTimerStopAfterCurrent: Dispatch<SetStateAction<boolean>>;
  sleepTimerFadeOut: boolean;
  sleepTimerMinutes: number;
  sleepTimerStopAfterCurrent: boolean;
  startSleepTimer: (endOfSong?: boolean) => void;
};

export function SleepTimerDialog({
  clearSleepTimer,
  setNotice,
  setSleepTimerDefault,
  setSleepTimerFadeOut,
  setSleepTimerMinutes,
  setSleepTimerOpen,
  setSleepTimerStopAfterCurrent,
  sleepTimerFadeOut,
  sleepTimerMinutes,
  sleepTimerStopAfterCurrent,
  startSleepTimer,
}: SleepTimerDialogProps) {
  return (
    <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setSleepTimerOpen(false)}>
      <div className="detail-panel sleep-timer-panel" onClick={(event) => event.stopPropagation()}>
        <button className="close-button" title="Close" aria-label="Close" onClick={() => setSleepTimerOpen(false)}>
          ×
        </button>
        <p className="eyebrow">Player</p>
        <h2>Sleep timer</h2>
        <p className="muted-copy">Stop playback after a set time or when the current song ends.</p>
        <label className="sleep-timer-value">
          <strong>{sleepTimerMinutes} minutes</strong>
          <input
            type="range"
            min="5"
            max="120"
            step="5"
            value={sleepTimerMinutes}
            onChange={(event) => setSleepTimerMinutes(Number(event.currentTarget.value))}
            aria-label="Sleep timer minutes"
          />
        </label>
        <label className="setting-row">
          <span>
            <strong>Stop after current song</strong>
            <small>After the timer expires, finish this song and pause.</small>
          </span>
          <input
            type="checkbox"
            checked={sleepTimerStopAfterCurrent}
            onChange={(event) => setSleepTimerStopAfterCurrent(event.target.checked)}
          />
        </label>
        <label className="setting-row">
          <span>
            <strong>Fade out</strong>
            <small>Lower volume during the final minute.</small>
          </span>
          <input
            type="checkbox"
            checked={sleepTimerFadeOut}
            onChange={(event) => setSleepTimerFadeOut(event.target.checked)}
          />
        </label>
        <div className="dialog-actions">
          <button className="secondary-button" onClick={() => clearSleepTimer()}>
            Clear timer
          </button>
          <button
            className="secondary-button"
            onClick={() =>
              void invoke("settings_set", { key: "sleepTimerDefault", value: String(sleepTimerMinutes) })
                .then(() => {
                  setSleepTimerDefault(sleepTimerMinutes);
                  setNotice(`Sleep timer default set to ${sleepTimerMinutes} minutes.`);
                })
                .catch((error) => setNotice(`Sleep timer default could not be saved: ${errorMessage(error)}`, "error"))
            }
          >
            Set as default
          </button>
          <button className="secondary-button" onClick={() => startSleepTimer(true)}>
            End of song
          </button>
          <button className="primary-button" onClick={() => startSleepTimer(false)}>
            Start timer
          </button>
        </div>
      </div>
    </div>
  );
}
