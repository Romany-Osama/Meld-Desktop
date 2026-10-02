import { Dispatch, SetStateAction } from "react";
import { SpotifyTrackItem, LoadState, SpotifyLikedTracksPayload } from "../../types";

export type SpotifyLikedScreenProps = {
  loadSpotifyLikedTracks: () => Promise<void>;
  playSpotifyTrack: (track: SpotifyTrackItem) => Promise<void>;
  setSpotifyLikedOpen: Dispatch<SetStateAction<boolean>>;
  spotifyLikedOpen: boolean;
  spotifyLikedTracks: LoadState<SpotifyLikedTracksPayload>;
};

export function SpotifyLikedScreen({
  loadSpotifyLikedTracks,
  playSpotifyTrack,
  setSpotifyLikedOpen,
  spotifyLikedOpen,
  spotifyLikedTracks,
}: SpotifyLikedScreenProps) {
  return (
    <>
      {spotifyLikedOpen && (
        <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setSpotifyLikedOpen(false)}>
          <div className="detail-panel spotify-playlist-panel" onClick={(event) => event.stopPropagation()}>
            <button
              className="close-button"
              title="Close"
              aria-label="Close"
              onClick={() => setSpotifyLikedOpen(false)}
            >
              ×
            </button>
            <p className="eyebrow">Spotify library</p>
            <h2>Liked Songs</h2>
            {spotifyLikedTracks.status === "loading" && (
              <div className="state-panel">
                <div className="spinner" />
                <p>Loading Spotify liked songs…</p>
              </div>
            )}
            {spotifyLikedTracks.status === "error" && (
              <div className="state-panel error">
                <h2>Spotify liked songs unavailable</h2>
                <p>{spotifyLikedTracks.error}</p>
                <button className="primary-button" onClick={() => void loadSpotifyLikedTracks()}>
                  Retry
                </button>
              </div>
            )}
            {spotifyLikedTracks.status === "ready" && spotifyLikedTracks.data.tracks.length === 0 && (
              <div className="state-panel">
                <h2>No liked songs returned</h2>
                <p>Spotify returned an empty liked-songs library.</p>
              </div>
            )}
            {spotifyLikedTracks.status === "ready" && spotifyLikedTracks.data.tracks.length > 0 && (
              <div className="spotify-track-list">
                {spotifyLikedTracks.data.tracks.map((track) => (
                  <div className="spotify-track-row" key={track.id}>
                    <div className="spotify-track-copy">
                      <strong>{track.name}</strong>
                      <span>
                        {track.artist}
                        {track.album ? ` · ${track.album}` : ""}
                      </span>
                    </div>
                    <button className="row-action" onClick={() => void playSpotifyTrack(track)}>
                      Find & play
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
