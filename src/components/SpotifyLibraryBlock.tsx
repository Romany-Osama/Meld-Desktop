import { mediaSrc } from "../lib/media";
import {
  LoadState,
  SpotifyLibraryNode,
  SpotifyLikedTracksPayload,
  SpotifyFolderItem,
  SpotifyPlaylistItem,
} from "../types";

export function SpotifyLibraryBlock({
  node,
  liked,
  folderStack,
  onOpenFolder,
  onOpenPlaylist,
  onOpenLiked,
  onBack,
  onRetry,
}: {
  node: LoadState<SpotifyLibraryNode>;
  liked: LoadState<SpotifyLikedTracksPayload>;
  folderStack: { uri: string; name: string }[];
  onOpenFolder: (folder: SpotifyFolderItem) => void;
  onOpenPlaylist: (playlist: SpotifyPlaylistItem) => void;
  onOpenLiked: () => void;
  onBack: () => void;
  onRetry: () => void;
}) {
  return (
    <section className="spotify-library-block">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Spotify library</p>
          <h3>{folderStack.length > 0 ? folderStack[folderStack.length - 1].name : "Playlists"}</h3>
        </div>
        {folderStack.length > 0 && (
          <button className="text-button" onClick={onBack}>
            Back
          </button>
        )}
      </div>
      {node.status === "loading" && (
        <div className="state-panel">
          <div className="spinner" />
          <p>Loading Spotify library…</p>
        </div>
      )}
      {node.status === "error" && (
        <div className="state-panel error">
          <h2>Spotify library unavailable</h2>
          <p>{node.error}</p>
          <button className="primary-button" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
      {node.status === "ready" && node.data.folders.length === 0 && node.data.playlists.length === 0 && (
        <div className="state-panel">
          <h2>{folderStack.length > 0 ? "Folder is empty" : "No Spotify playlists"}</h2>
          <p>Spotify returned no library items for this location.</p>
        </div>
      )}
      {liked.status === "ready" && liked.data.totalCount > 0 && (
        <button className="playlist-list-row spotify-playlist-row spotify-liked-row" onClick={onOpenLiked}>
          <span className="library-auto-icon">♥</span>
          <span>
            <strong>Liked Songs</strong>
            <small>
              {liked.data.totalCount} Spotify saved song{liked.data.totalCount === 1 ? "" : "s"}
            </small>
          </span>
          <span aria-hidden="true">›</span>
        </button>
      )}
      {node.status === "ready" && (
        <div className="spotify-library-items">
          {node.data.folders.map((folder) => (
            <button
              className="playlist-list-row spotify-folder-row"
              key={folder.uri}
              onClick={() => onOpenFolder(folder)}
            >
              <span className="library-auto-icon">▣</span>
              <span>
                <strong>{folder.name}</strong>
                <small>
                  {folder.totalChildren} item{folder.totalChildren === 1 ? "" : "s"}
                </small>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
          {node.data.playlists.map((playlist) => (
            <button
              className="playlist-list-row spotify-playlist-row"
              key={playlist.id}
              onClick={() => onOpenPlaylist(playlist)}
            >
              <span className="item-art-wrap small-art-wrap">
                {mediaSrc(playlist.image) ? (
                  <img className="item-art" src={mediaSrc(playlist.image) as string} alt="" loading="lazy" />
                ) : (
                  <span className="item-art empty-art">S</span>
                )}
              </span>
              <span>
                <strong>{playlist.name}</strong>
                <small>{playlist.owner ? `Spotify · ${playlist.owner}` : "Spotify playlist"}</small>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
