// Sign out of Google (moved out of App.tsx, TR-M1).

import type { Dispatch, SetStateAction } from "react";

export type LogoutDialogProps = {
  confirmGoogleLogout: (clearData: boolean) => Promise<void>;
  setLogoutDialogOpen: Dispatch<SetStateAction<boolean>>;
};

export function LogoutDialog({ confirmGoogleLogout, setLogoutDialogOpen }: LogoutDialogProps) {
  return (
    <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setLogoutDialogOpen(false)}>
      <div className="detail-panel picker-panel" onClick={(event) => event.stopPropagation()}>
        <button className="close-button" title="Close" aria-label="Close" onClick={() => setLogoutDialogOpen(false)}>
          ×
        </button>
        <p className="eyebrow">Google / YouTube Music</p>
        <h2>Disconnect account?</h2>
        <p className="muted-copy">
          Choose whether to keep your Meld library. Offline downloaded files are kept when local library data is
          cleared, matching Meld’s logout choices.
        </p>
        <div className="dialog-actions">
          <button className="secondary-button" onClick={() => void confirmGoogleLogout(true)}>
            Clear local data
          </button>
          <button className="primary-button" onClick={() => void confirmGoogleLogout(false)}>
            Keep local data
          </button>
        </div>
      </div>
    </div>
  );
}
