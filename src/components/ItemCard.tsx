import { mediaSrc } from "../lib/media";
import { YtItem } from "../types";

export function ItemCard({
  item,
  onOpen,
  onMenu,
}: {
  item: YtItem;
  onOpen: (item: YtItem) => void;
  onMenu?: (item: YtItem) => void;
}) {
  return (
    <div className="item-card-shell">
      <button className="item-card" onClick={() => onOpen(item)} title={`Open ${item.kind}`}>
        <div className="item-art-wrap">
          {mediaSrc(item.thumbnail) ? (
            <img className="item-art" src={mediaSrc(item.thumbnail) as string} alt="" loading="lazy" />
          ) : (
            <div className="item-art empty-art">{item.kind.slice(0, 1).toUpperCase()}</div>
          )}
        </div>
        <strong>{item.title || "Untitled"}</strong>
        <span>{item.subtitle || item.kind}</span>
      </button>
      {onMenu && (
        <button
          className="card-menu-trigger"
          onClick={() => onMenu(item)}
          title={`More options for ${item.title}`}
          aria-label={`More options for ${item.title}`}
        >
          ⋮
        </button>
      )}
    </div>
  );
}
