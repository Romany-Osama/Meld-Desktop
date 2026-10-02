import { Dispatch, SetStateAction } from "react";
import { SpotifyTrackItem, SpotifyPlaylistItem, LoadState, SpotifyTrackPage, SpotifyProfile } from "../../types";
import { withOccurrencesBy } from "../../lib/identity";

export type SpotifyPlaylistScreenProps = {
  downloadSpotifyPlaylist: () => Promise<void>;
  loadMoreSpotifyPlaylistTracks: () => Promise<void>;
  moveSpotifyTrack: (track: SpotifyTrackItem, direction: "up" | "down") => Promise<void>;
  openSpotifyPlaylist: (playlistItem: SpotifyPlaylistItem) => Promise<void>;
  playSpotifyTrack: (track: SpotifyTrackItem) => Promise<void>;
  removeSpotifyTrack: (track: SpotifyTrackItem) => Promise<void>;
  renameSpotifyPlaylist: () => Promise<void>;
  setSpotifyDetailQuery: Dispatch<SetStateAction<string>>;
  setSpotifyDetailSort: Dispatch<SetStateAction<"original" | "name" | "artist" | "duration">>;
  setSpotifyDetailSortDescending: Dispatch<SetStateAction<boolean>>;
  setSpotifyOpenPlaylist: Dispatch<SetStateAction<SpotifyPlaylistItem | null>>;
  setSpotifyRenameName: Dispatch<SetStateAction<string>>;
  setSpotifyReorderUnlocked: Dispatch<SetStateAction<boolean>>;
  spotifyDetailQuery: string;
  spotifyDetailSort: "original" | "name" | "artist" | "duration";
  spotifyDetailSortDescending: boolean;
  spotifyOpenPlaylist: SpotifyPlaylistItem | null;
  spotifyPlaylistLoadingMore: boolean;
  spotifyPlaylistTracks: LoadState<SpotifyTrackPage>;
  spotifyProfile: SpotifyProfile | null;
  spotifyRenameName: string;
  spotifyReorderUnlocked: boolean;
  visibleSpotifyPlaylistTracks: SpotifyTrackItem[];
};

export function SpotifyPlaylistScreen({
  downloadSpotifyPlaylist,
  loadMoreSpotifyPlaylistTracks,
  moveSpotifyTrack,
  openSpotifyPlaylist,
  playSpotifyTrack,
  removeSpotifyTrack,
  renameSpotifyPlaylist,
  setSpotifyDetailQuery,
  setSpotifyDetailSort,
  setSpotifyDetailSortDescending,
  setSpotifyOpenPlaylist,
  setSpotifyRenameName,
  setSpotifyReorderUnlocked,
  spotifyDetailQuery,
  spotifyDetailSort,
  spotifyDetailSortDescending,
  spotifyOpenPlaylist,
  spotifyPlaylistLoadingMore,
  spotifyPlaylistTracks,
  spotifyProfile,
  spotifyRenameName,
  spotifyReorderUnlocked,
  visibleSpotifyPlaylistTracks,
}: SpotifyPlaylistScreenProps) {
  return (
    <>
      {spotifyOpenPlaylist && (
        <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setSpotifyOpenPlaylist(null)}>
          <div
            className="detail-panel spotify-playlist-panel"
            data-screen-scroll
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="close-button"
              title="Close"
              aria-label="Close"
              onClick={() => setSpotifyOpenPlaylist(null)}
            >
              ×
            </button>
            <p className="eyebrow">Spotify playlist</p>
            <h2>{spotifyOpenPlaylist.name}</h2>
            <div className="spotify-detail-toolbar">
              <input
                value={spotifyDetailQuery}
                onChange={(event) => setSpotifyDetailQuery(event.target.value)}
                placeholder="Search tracks"
                aria-label="Search Spotify playlist tracks"
              />
              <select
                value={spotifyDetailSort}
                onChange={(event) =>
                  setSpotifyDetailSort(event.target.value as "original" | "name" | "artist" | "duration")
                }
                aria-label="Sort Spotify playlist tracks"
              >
                <option value="original">Original order</option>
                <option value="name">Name</option>
                <option value="artist">Artist</option>
                <option value="duration">Duration</option>
              </select>
              <button
                className="row-action"
                onClick={() => setSpotifyDetailSortDescending((value) => !value)}
                title="Reverse sort order"
              >
                {spotifyDetailSortDescending ? "Descending" : "Ascending"}
              </button>
              <button
                className="row-action"
                onClick={() => setSpotifyReorderUnlocked((value) => !value)}
                title="Unlock playlist reorder"
              >
                {spotifyReorderUnlocked ? "Lock order" : "Unlock order"}
              </button>
            </div>
            {spotifyPlaylistTracks.status === "ready" && spotifyPlaylistTracks.data.tracks.length > 0 && (
              <button
                className="secondary-button spotify-download-button"
                onClick={() => void downloadSpotifyPlaylist()}
              >
                Download playlist
              </button>
            )}
            {spotifyOpenPlaylist.owner &&
              spotifyProfile?.displayName &&
              spotifyOpenPlaylist.owner === spotifyProfile.displayName && (
                <div className="spotify-rename-row">
                  <input
                    value={spotifyRenameName}
                    onChange={(event) => setSpotifyRenameName(event.target.value)}
                    aria-label="Spotify playlist name"
                  />
                  <button
                    className="row-action"
                    disabled={!spotifyRenameName.trim() || spotifyRenameName.trim() === spotifyOpenPlaylist.name}
                    onClick={() => void renameSpotifyPlaylist()}
                  >
                    Rename
                  </button>
                </div>
              )}
            {spotifyPlaylistTracks.status === "loading" && (
              <div className="state-panel">
                <div className="spinner" />
                <p>Loading Spotify tracks…</p>
              </div>
            )}
            {spotifyPlaylistTracks.status === "error" && (
              <div className="state-panel error">
                <h2>Spotify playlist unavailable</h2>
                <p>{spotifyPlaylistTracks.error}</p>
                <button className="primary-button" onClick={() => void openSpotifyPlaylist(spotifyOpenPlaylist)}>
                  Retry
                </button>
              </div>
            )}
            {spotifyPlaylistTracks.status === "ready" && visibleSpotifyPlaylistTracks.length === 0 && (
              <div className="state-panel">
                <h2>No tracks returned</h2>
                <p>Spotify returned an empty playlist.</p>
              </div>
            )}
            {spotifyPlaylistTracks.status === "ready" && visibleSpotifyPlaylistTracks.length > 0 && (
              <div className="spotify-track-list">
                {withOccurrencesBy(visibleSpotifyPlaylistTracks, "spotify", (track) => track.id).map(
                  ({ item: track, key }) => (
                    <div className="spotify-track-row" key={key}>
                      <div className="spotify-track-copy">
                        <strong>{track.name}</strong>
                        <span>
                          {track.artist}
                          {track.album ? ` · ${track.album}` : ""}
                        </span>
                      </div>
                      <div className="spotify-track-actions">
                        <button className="row-action" onClick={() => void playSpotifyTrack(track)}>
                          Find & play
                        </button>
                        {spotifyReorderUnlocked &&
                          !spotifyDetailQuery.trim() &&
                          spotifyDetailSort === "original" &&
                          !spotifyDetailSortDescending &&
                          track.uid && (
                            <>
                              <button
                                className="row-action"
                                disabled={visibleSpotifyPlaylistTracks.indexOf(track) === 0}
                                onClick={() => void moveSpotifyTrack(track, "up")}
                                title="Move up"
                                aria-label={`Move ${track.name} up`}
                              >
                                ↑
                              </button>
                              <button
                                className="row-action"
                                disabled={
                                  visibleSpotifyPlaylistTracks.indexOf(track) ===
                                  visibleSpotifyPlaylistTracks.length - 1
                                }
                                onClick={() => void moveSpotifyTrack(track, "down")}
                                title="Move down"
                                aria-label={`Move ${track.name} down`}
                              >
                                ↓
                              </button>
                            </>
                          )}
                        {track.uid && (
                          <button className="row-action danger-action" onClick={() => void removeSpotifyTrack(track)}>
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
            {spotifyPlaylistTracks.data.tracks.length < spotifyPlaylistTracks.data.totalCount && (
              <button
                className="secondary-button"
                onClick={() => void loadMoreSpotifyPlaylistTracks()}
                disabled={spotifyPlaylistLoadingMore}
              >
                {spotifyPlaylistLoadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
