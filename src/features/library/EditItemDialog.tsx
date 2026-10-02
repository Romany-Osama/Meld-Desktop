// Edit a song's title and artist (moved out of App.tsx, TR-M1).
import { invoke } from "@tauri-apps/api/core";
import { errorMessage } from "../../lib/util";
import type { NavKey, YtItem } from "../../types";
import type { Dispatch, SetStateAction } from "react";
import type { SetNotice } from "../../app/notifications";

export type EditItemDialogProps = {
  active: NavKey;
  editArtist: string;
  editItem: YtItem;
  editTitle: string;
  reloadCurrentLibrary: () => Promise<void>;
  setEditArtist: Dispatch<SetStateAction<string>>;
  setEditItem: Dispatch<SetStateAction<YtItem | null>>;
  setEditTitle: Dispatch<SetStateAction<string>>;
  setNotice: SetNotice;
};

export function EditItemDialog({
  active,
  editArtist,
  editItem,
  editTitle,
  reloadCurrentLibrary,
  setEditArtist,
  setEditItem,
  setEditTitle,
  setNotice,
}: EditItemDialogProps) {
  return (
    <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setEditItem(null)}>
      <div className="detail-panel picker-panel" onClick={(event) => event.stopPropagation()}>
        <button className="close-button" title="Close" aria-label="Close" onClick={() => setEditItem(null)}>
          ×
        </button>
        <p className="eyebrow">Edit song</p>
        <h2>{editItem.title}</h2>
        <label className="form-field">
          <span>Song title</span>
          <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
        </label>
        <label className="form-field">
          <span>Artist</span>
          <input value={editArtist} onChange={(event) => setEditArtist(event.target.value)} />
        </label>
        <button
          className="primary-button"
          disabled={!editTitle.trim()}
          onClick={async () => {
            try {
              await invoke("library_edit_item", {
                itemId: editItem.id,
                title: editTitle.trim(),
                artist: editArtist.trim(),
              });
              setEditItem(null);
              setNotice(`Updated “${editTitle.trim()}”.`, "success");
              if (active === "library") void reloadCurrentLibrary();
            } catch (error) {
              setNotice(`Song edit failed: ${errorMessage(error)}`, "error");
            }
          }}
        >
          Save changes
        </button>
      </div>
    </div>
  );
}
