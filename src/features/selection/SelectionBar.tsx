// Actions for the selected songs (moved out of App.tsx, TR-M1).

import type { YtItem } from "../../types";
import type { Dispatch, SetStateAction } from "react";

export type SelectionBarProps = {
  closeSelection: () => void;
  downloadSelectedItems: () => void;
  likeSelectedItems: () => Promise<void>;
  loadLocalPlaylists: () => Promise<void>;
  playSelectedItems: (shuffle: boolean) => Promise<void>;
  queueSelectedItems: (playNext: boolean) => void;
  removeSelectedDownloads: () => Promise<void>;
  selectedItems: YtItem[];
  setPlaylistPickerItems: Dispatch<SetStateAction<YtItem[] | null>>;
};

export function SelectionBar({
  closeSelection,
  downloadSelectedItems,
  likeSelectedItems,
  loadLocalPlaylists,
  playSelectedItems,
  queueSelectedItems,
  removeSelectedDownloads,
  selectedItems,
  setPlaylistPickerItems,
}: SelectionBarProps) {
  return (
    <div className="selection-action-bar" role="toolbar" aria-label="Selected song actions">
      <strong>{selectedItems.length} selected</strong>
      <button className="primary-button" onClick={() => void playSelectedItems(false)}>
        Play
      </button>
      <button className="secondary-button" onClick={() => void playSelectedItems(true)}>
        Shuffle
      </button>
      <button className="secondary-button" onClick={() => queueSelectedItems(true)}>
        Play next
      </button>
      <button className="secondary-button" onClick={() => queueSelectedItems(false)}>
        Add to queue
      </button>
      <button
        className="secondary-button"
        onClick={() => {
          setPlaylistPickerItems([...selectedItems]);
          void loadLocalPlaylists();
        }}
      >
        Add to playlist
      </button>
      <button className="secondary-button" onClick={() => void likeSelectedItems()}>
        Like / dislike all
      </button>
      <button className="secondary-button" onClick={downloadSelectedItems}>
        Download
      </button>
      <button className="secondary-button" onClick={() => void removeSelectedDownloads()}>
        Remove download
      </button>
      <button className="secondary-button" onClick={closeSelection}>
        Clear
      </button>
    </div>
  );
}
