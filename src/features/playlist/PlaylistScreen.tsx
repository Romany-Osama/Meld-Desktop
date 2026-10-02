import { InlineLikeButton } from "../../components/InlineLikeButton";
import { AudioQuality } from "../../lib/audioQuality";
import { mediaSrc } from "../../lib/media";
import { YtItem, LoadState, PlaylistPage } from "../../types";
import { withOccurrences } from "../../lib/identity";

export type PlaylistScreenProps = {
  audioQuality: AudioQuality;
  loadPlaylistMore: () => Promise<void>;
  openMenu: (item: YtItem) => Promise<void>;
  playItem: (
    item: YtItem,
    sourceQueue?: YtItem[],
    sourceIndex?: number,
    sourceContinuation?: string | null,
    autoMixStart?: boolean,
    sourceContinuationKind?: "next" | "playlist",
  ) => Promise<void>;
  playlist: LoadState<PlaylistPage> | null;
  /** Whether the row with this occurrence key is selected (U4-015). */
  isSelected: (key: string) => boolean;
  selectionMode: boolean;
  closePlaylist: () => void;
  settings: Record<string, boolean>;
  toggleSelectedItem: (item: YtItem, key?: string) => void;
};

export function PlaylistScreen({
  audioQuality,
  loadPlaylistMore,
  openMenu,
  playItem,
  playlist,
  isSelected,
  selectionMode,
  closePlaylist,
  settings,
  toggleSelectedItem,
}: PlaylistScreenProps) {
  return (
    <>
      {playlist && (
        <div className="detail-overlay" role="dialog" aria-modal="true">
          <div className="detail-panel" data-screen-scroll>
            <button className="close-button" title="Close" aria-label="Close" onClick={closePlaylist}>
              ×
            </button>
            {playlist.status === "loading" && (
              <div className="state-panel">
                <div className="spinner" />
                <p>Loading playlist songs…</p>
              </div>
            )}
            {playlist.status === "error" && (
              <div className="state-panel error">
                <h2>Playlist unavailable</h2>
                <p>{playlist.error}</p>
              </div>
            )}
            {playlist.status === "ready" && (
              <>
                <div className="playlist-header">
                  {mediaSrc(playlist.data.playlist.thumbnail) && (
                    <img src={mediaSrc(playlist.data.playlist.thumbnail) as string} alt="" />
                  )}
                  <div>
                    <p className="eyebrow">Playlist</p>
                    <h2>{playlist.data.playlist.title}</h2>
                    <p>{playlist.data.playlist.subtitle}</p>
                  </div>
                </div>
                <div className="playlist-songs">
                  {playlist.data.songs.length === 0 ? (
                    <div className="state-panel">
                      <p>YouTube Music returned no playlist songs.</p>
                    </div>
                  ) : (
                    withOccurrences(playlist.data.songs, `playlist:${playlist.data.playlist.id}`).map(
                      ({ item: song, key, index }) => (
                        <div className="song-row-wrap" key={key}>
                          {selectionMode && (
                            <input
                              className="selection-checkbox"
                              type="checkbox"
                              checked={isSelected(key)}
                              onChange={() => toggleSelectedItem(song, key)}
                              aria-label={`Select ${song.title}`}
                            />
                          )}
                          <button
                            className="song-row"
                            onClick={() =>
                              void playItem(
                                song,
                                playlist.data.songs,
                                index,
                                playlist.data.continuation ?? null,
                                false,
                                "playlist",
                              )
                            }
                          >
                            <span className="song-index">{index + 1}</span>
                            {mediaSrc(song.thumbnail) && <img src={mediaSrc(song.thumbnail) as string} alt="" />}
                            <span className="song-copy">
                              <strong>{song.title}</strong>
                              <small>{song.subtitle}</small>
                            </span>
                            <span className="song-kind">{song.kind}</span>
                          </button>
                          {song.kind === "song" && (
                            <InlineLikeButton
                              item={song}
                              autoDownloadOnLike={settings.autoDownloadOnLike === true}
                              audioQuality={audioQuality}
                            />
                          )}
                          <button
                            className="song-row-menu"
                            onClick={() => void openMenu(song)}
                            title={`More options for ${song.title}`}
                            aria-label={`More options for ${song.title}`}
                          >
                            ⋮
                          </button>
                        </div>
                      ),
                    )
                  )}
                </div>
                {playlist.data.continuation && (
                  <button className="primary-button playlist-more" onClick={() => void loadPlaylistMore()}>
                    Load more songs
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
