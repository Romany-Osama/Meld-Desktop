// Add songs to a playlist (moved out of App.tsx, TR-M1).
import type { PlaylistSort, YtItem } from "../../types";
import type { Dispatch, SetStateAction } from "react";

export type PlaylistPickerDialogProps = {
  addToSelectedPlaylist: (playlistId: string) => Promise<void>;
  openCreatePlaylistDialog: () => void;
  playlistPickerItems: YtItem[];
  playlistPickerSearch: string;
  playlistPickerSort: PlaylistSort;
  playlistPickerSortDescending: boolean;
  setPlaylistPickerItems: Dispatch<SetStateAction<YtItem[] | null>>;
  setPlaylistPickerSearch: Dispatch<SetStateAction<string>>;
  setPlaylistPickerSort: Dispatch<SetStateAction<PlaylistSort>>;
  setPlaylistPickerSortDescending: Dispatch<SetStateAction<boolean>>;
  visiblePlaylistPicker: (YtItem & { songCount?: number | undefined; savedAt?: number | undefined })[];
};

export function PlaylistPickerDialog({
  addToSelectedPlaylist,
  openCreatePlaylistDialog,
  playlistPickerItems,
  playlistPickerSearch,
  playlistPickerSort,
  playlistPickerSortDescending,
  setPlaylistPickerItems,
  setPlaylistPickerSearch,
  setPlaylistPickerSort,
  setPlaylistPickerSortDescending,
  visiblePlaylistPicker,
}: PlaylistPickerDialogProps) {
  return (
    <div className="detail-overlay" role="dialog" aria-modal="true">
      <div className="detail-panel picker-panel">
        <button className="close-button" title="Close" aria-label="Close" onClick={() => setPlaylistPickerItems(null)}>
          ×
        </button>
        <p className="eyebrow">Add to playlist</p>
        <h2>
          {playlistPickerItems.length === 1
            ? playlistPickerItems[0].title
            : `${playlistPickerItems.length} selected songs`}
        </h2>
        <button className="primary-button" onClick={openCreatePlaylistDialog}>
          Create playlist
        </button>
        <div className="playlist-picker-toolbar">
          <label className="library-search">
            <span>Search</span>
            <input
              value={playlistPickerSearch}
              onChange={(event) => setPlaylistPickerSearch(event.target.value)}
              placeholder="Search playlists"
              aria-label="Search playlists to add to"
            />
          </label>
          <select
            className="library-sort"
            value={playlistPickerSort}
            onChange={(event) => setPlaylistPickerSort(event.target.value as PlaylistSort)}
            aria-label="Sort playlists to add to"
          >
            <option value="name">Name</option>
            <option value="count">Song count</option>
            <option value="created">Recently added</option>
          </select>
          <button
            className="secondary-button"
            onClick={() => setPlaylistPickerSortDescending((value) => !value)}
            title="Reverse playlist order"
          >
            {playlistPickerSortDescending ? "Descending" : "Ascending"}
          </button>
        </div>
        <div className="picker-list">
          {visiblePlaylistPicker.length === 0 ? (
            <p className="muted-copy">
              {playlistPickerSearch.trim() ? "No matching playlists." : "No playlists exist yet."}
            </p>
          ) : (
            visiblePlaylistPicker.map((item) => (
              <button className="menu-option" key={item.id} onClick={() => void addToSelectedPlaylist(item.id)}>
                {item.title}
                {item.songCount === undefined ? "" : ` · ${item.songCount} song${item.songCount === 1 ? "" : "s"}`}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
