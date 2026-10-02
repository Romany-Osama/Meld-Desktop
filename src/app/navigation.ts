import { NavKey } from "../types";

export const navigation: { key: NavKey; label: string; icon: string }[] = [
  { key: "home", label: "Home", icon: "⌂" },
  { key: "search_input", label: "Search", icon: "⌕" },
  { key: "library", label: "Library", icon: "▤" },
];
export const secondaryNavigation: { key: NavKey; label: string; icon: string }[] = [
  { key: "history", label: "History", icon: "↺" },
  { key: "stats", label: "Stats", icon: "▥" },
];
