// Choose one of a song's artists (moved out of App.tsx, TR-M1).

import type { YtItem } from "../../types";
import type { Dispatch, SetStateAction } from "react";

export type ArtistPickerDialogProps = {
  artistPickerItem: YtItem;
  openItem: (
    item: YtItem,
    sourceQueue?: YtItem[],
    sourceIndex?: number,
    { reuse }?: { reuse?: boolean | undefined },
  ) => Promise<void>;
  setArtistPickerItem: Dispatch<SetStateAction<YtItem | null>>;
};

export function ArtistPickerDialog({ artistPickerItem, openItem, setArtistPickerItem }: ArtistPickerDialogProps) {
  return (
    <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setArtistPickerItem(null)}>
      <div className="detail-panel picker-panel" onClick={(event) => event.stopPropagation()}>
        <button className="close-button" title="Close" aria-label="Close" onClick={() => setArtistPickerItem(null)}>
          ×
        </button>
        <p className="eyebrow">Artist selection</p>
        <h2>{artistPickerItem.title}</h2>
        <p className="muted-copy">Meld found more than one source artist for this item.</p>
        <div className="picker-list">
          {artistPickerItem.artists
            .filter((artist) => artist.id)
            .map((artist) => (
              <button
                className="menu-option"
                key={artist.id}
                onClick={() => {
                  setArtistPickerItem(null);
                  void openItem({
                    id: artist.id as string,
                    kind: "artist",
                    title: artist.name,
                    subtitle: "Artist",
                    artists: [],
                    browseId: artist.id,
                  });
                }}
              >
                {artist.name}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
