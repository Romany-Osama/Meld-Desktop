import { useState } from "react";
import { YtItem } from "../../types";

export function useSelection() {
  const [selectedItems, setSelectedItems] = useState<YtItem[]>([]);

  const [selectionMode, setSelectionMode] = useState(false);

  const toggleSelectedItem = (item: YtItem) => {
    setSelectedItems((current) =>
      current.some((value) => value.id === item.id)
        ? current.filter((value) => value.id !== item.id)
        : [...current, item],
    );
  };

  const closeSelection = () => {
    setSelectedItems([]);
    setSelectionMode(false);
  };

  return { selectedItems, setSelectedItems, selectionMode, setSelectionMode, toggleSelectedItem, closeSelection };
}
