// Song or item details (moved out of App.tsx, TR-M1).

import type { YtItem } from "../../types";
import type { Dispatch, SetStateAction } from "react";

export type ItemInfoDialogProps = {
  infoItem: YtItem;
  setInfoItem: Dispatch<SetStateAction<YtItem | null>>;
};

export function ItemInfoDialog({ infoItem, setInfoItem }: ItemInfoDialogProps) {
  return (
    <div className="detail-overlay" role="dialog" aria-modal="true" onClick={() => setInfoItem(null)}>
      <div className="detail-panel info-panel" onClick={(event) => event.stopPropagation()}>
        <button className="close-button" title="Close" aria-label="Close" onClick={() => setInfoItem(null)}>
          ×
        </button>
        <p className="eyebrow">Song details</p>
        <h2>{infoItem.title || "Untitled"}</h2>
        <p className="muted-copy">{infoItem.subtitle}</p>
        <div className="info-grid">
          <span>Type</span>
          <strong>{infoItem.kind}</strong>
          <span>Video ID</span>
          <strong>{infoItem.videoId || "Not available"}</strong>
          <span>Explicit</span>
          <strong>{infoItem.explicit ? "Yes" : "No"}</strong>
          <span>Music video type</span>
          <strong>{infoItem.musicVideoType || "Not reported"}</strong>
          {infoItem.artists.length > 0 && (
            <>
              <span>Artists</span>
              <strong>{infoItem.artists.map((value) => value.name).join(", ")}</strong>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
