import { useMemo, useState } from "react";
import { singleKey } from "../../lib/identity";
import { YtItem } from "../../types";

/** A selected row: the occurrence key it was selected by (U4-015) and the item it shows. */
export type SelectedEntry = { key: string; item: YtItem };

export function useSelection() {
  const [selected, setSelected] = useState<SelectedEntry[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const selectedItems = useMemo(() => selected.map((entry) => entry.item), [selected]);
  const selectedKeys = useMemo(() => new Set(selected.map((entry) => entry.key)), [selected]);

  /** Toggles one occurrence: selecting a song that is twice in a playlist selects only that row. */
  const toggleSelectedItem = (item: YtItem, key = singleKey(item, "item")) => {
    setSelected((current) =>
      current.some((entry) => entry.key === key)
        ? current.filter((entry) => entry.key !== key)
        : [...current, { key, item }],
    );
  };
  const isSelected = (key: string) => selectedKeys.has(key);
  const clearSelected = () => setSelected([]);

  const closeSelection = () => {
    setSelected([]);
    setSelectionMode(false);
  };

  return {
    selectedItems,
    isSelected,
    clearSelected,
    selectionMode,
    setSelectionMode,
    toggleSelectedItem,
    closeSelection,
  };
}
