import type { MenuAction, MenuEntry } from "../../app/capabilities";
import type { YtItem } from "../../types";

export type ItemMenuProps = {
  item: YtItem;
  entries: MenuEntry[];
  onAction: (action: MenuAction, item: YtItem) => void;
  onClose: () => void;
};

/** The item / player menu. Which entries it shows is decided by `itemMenuEntries` (U4-011), not here. */
export function ItemMenu({ item, entries, onAction, onClose }: ItemMenuProps) {
  // Consecutive quick entries share one button row.
  const groups: MenuEntry[][] = [];
  for (const entry of entries) {
    const quick = entry.type === "action" && entry.quick === true;
    const last = groups[groups.length - 1];
    const lastQuick = last?.[0]?.type === "action" && last[0].quick === true;
    if (quick && lastQuick) last.push(entry);
    else groups.push([entry]);
  }
  const render = (entry: MenuEntry, index: number) =>
    entry.type === "note" ? (
      <span key={`note-${index}`} className={entry.error ? "menu-note error-text" : "menu-note"}>
        {entry.text}
      </span>
    ) : (
      <button key={entry.action} className="menu-option" onClick={() => onAction(entry.action, item)}>
        {entry.label}
      </button>
    );
  return (
    <div className="detail-overlay menu-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="menu-panel" onClick={(event) => event.stopPropagation()}>
        <div className="menu-heading">
          <strong>{item.title}</strong>
          <button className="close-button" title="Close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {groups.map((group, index) =>
          group[0].type === "action" && group[0].quick ? (
            <div key={`quick-${index}`} className="menu-quick-actions">
              {group.map(render)}
            </div>
          ) : (
            render(group[0], index)
          ),
        )}
      </div>
    </div>
  );
}
