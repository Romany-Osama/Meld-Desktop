// Create a playlist (moved out of App.tsx, TR-M1).

import type { SessionStatus } from "../../types";
import type { Dispatch, SetStateAction } from "react";

export type CreatePlaylistDialogProps = {
  createLocalPlaylist: () => Promise<void>;
  createSyncedPlaylist: boolean;
  newPlaylistTitle: string;
  sessionStatus: SessionStatus;
  setCreatePlaylistOpen: Dispatch<SetStateAction<boolean>>;
  setCreateSyncedPlaylist: Dispatch<SetStateAction<boolean>>;
  setNewPlaylistTitle: Dispatch<SetStateAction<string>>;
  settings: Record<string, boolean>;
};

export function CreatePlaylistDialog({
  createLocalPlaylist,
  createSyncedPlaylist,
  newPlaylistTitle,
  sessionStatus,
  setCreatePlaylistOpen,
  setCreateSyncedPlaylist,
  setNewPlaylistTitle,
  settings,
}: CreatePlaylistDialogProps) {
  return (
    <div className="detail-overlay" role="dialog" aria-modal="true">
      <div className="detail-panel picker-panel">
        <button className="close-button" title="Close" aria-label="Close" onClick={() => setCreatePlaylistOpen(false)}>
          ×
        </button>
        <p className="eyebrow">My Playlists</p>
        <h2>Create playlist</h2>
        <p className="muted-copy">
          Creates a playlist on this device. YouTube Music saved playlists appear after a connected-account sync.
        </p>
        {sessionStatus.authenticated && settings.ytmSync === true && (
          <label className="setting-row playlist-sync-toggle">
            <span>
              <strong>Sync with YouTube Music</strong>
              <small>Uses the live authenticated playlist/create path.</small>
            </span>
            <input
              type="checkbox"
              checked={createSyncedPlaylist}
              onChange={(event) => setCreateSyncedPlaylist(event.target.checked)}
            />
          </label>
        )}
        <input
          className="playlist-name-input"
          value={newPlaylistTitle}
          onChange={(event) => setNewPlaylistTitle(event.target.value)}
          placeholder="Playlist name"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter") void createLocalPlaylist();
          }}
        />
        <button
          className="primary-button"
          disabled={!newPlaylistTitle.trim()}
          onClick={() => void createLocalPlaylist()}
        >
          Create playlist
        </button>
      </div>
    </div>
  );
}
