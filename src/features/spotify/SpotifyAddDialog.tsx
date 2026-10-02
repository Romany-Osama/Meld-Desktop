// Add a song to a Spotify playlist (moved out of App.tsx, TR-M1).

import type { LoadState, SpotifyPlaylistItem, SpotifyTrackMatch, YtItem } from "../../types";
import type { Dispatch, SetStateAction } from "react";

export type SpotifyAddDialogProps = {
  addToSpotifyPlaylist: (playlist: SpotifyPlaylistItem) => Promise<void>;
  setSpotifyAddItem: Dispatch<SetStateAction<YtItem | null>>;
  setSpotifyAddState: Dispatch<
    SetStateAction<LoadState<{ match: SpotifyTrackMatch | null; playlists: SpotifyPlaylistItem[] }> | null>
  >;
  spotifyAddState: LoadState<{ match: SpotifyTrackMatch | null; playlists: SpotifyPlaylistItem[] }>;
};

export function SpotifyAddDialog({
  addToSpotifyPlaylist,
  setSpotifyAddItem,
  setSpotifyAddState,
  spotifyAddState,
}: SpotifyAddDialogProps) {
  return (
    <div
      className="detail-overlay"
      role="dialog"
      aria-modal="true"
      onClick={() => {
        setSpotifyAddItem(null);
        setSpotifyAddState(null);
      }}
    >
      <div className="detail-panel picker-panel" onClick={(event) => event.stopPropagation()}>
        <button
          className="close-button"
          title="Close"
          aria-label="Close"
          onClick={() => {
            setSpotifyAddItem(null);
            setSpotifyAddState(null);
          }}
        >
          ×
        </button>
        <p className="eyebrow">Spotify</p>
        <h2>Add to Spotify playlist</h2>
        {spotifyAddState.status === "loading" && (
          <div className="state-panel">
            <div className="spinner" />
            <p>Matching the song and loading Spotify playlists…</p>
          </div>
        )}
        {spotifyAddState.status === "error" && (
          <div className="state-panel error">
            <p>{spotifyAddState.error}</p>
          </div>
        )}
        {spotifyAddState.status === "ready" && (
          <>
            {spotifyAddState.data.match && (
              <p className="muted-copy">
                Matched: {spotifyAddState.data.match.name} · {spotifyAddState.data.match.artist}
              </p>
            )}
            <div className="picker-list">
              {spotifyAddState.data.playlists.length === 0 ? (
                <p className="muted-copy">No Spotify playlists were returned.</p>
              ) : (
                spotifyAddState.data.playlists.map((playlist) => (
                  <button className="menu-option" key={playlist.id} onClick={() => void addToSpotifyPlaylist(playlist)}>
                    {playlist.name}
                    {playlist.owner ? ` · ${playlist.owner}` : ""}
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
