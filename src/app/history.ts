// U4-004: navigation history holds routes (with their parameters) plus the view state needed to return to them.
import { Route, sameRoute, TopLevel } from "./routes";

export type HistoryEntry = {
  route: Route;
  /** Sidebar destination that was selected (detail pages open on top of it). */
  tab: TopLevel;
  /** Scroll offset of the page when it was left. */
  scrollTop: number;
};

export type NavHistory = { back: HistoryEntry[]; forward: HistoryEntry[] };

export const EMPTY_HISTORY: NavHistory = { back: [], forward: [] };
/** Older entries are dropped; a session rarely needs more and each entry may refetch its page. */
export const MAX_HISTORY_ENTRIES = 50;

/** Records `current` before navigating to a different route. Clears the forward list, like a browser. */
export function pushEntry(history: NavHistory, current: HistoryEntry): NavHistory {
  const last = history.back[history.back.length - 1];
  const back =
    last && sameRoute(last.route, current.route) ? [...history.back.slice(0, -1), current] : [...history.back, current];
  return { back: back.slice(-MAX_HISTORY_ENTRIES), forward: [] };
}

/** One step back from `current`: the entry to show and the updated history, or null at the start. */
export function stepBack(
  history: NavHistory,
  current: HistoryEntry,
): { entry: HistoryEntry; history: NavHistory } | null {
  const entry = history.back[history.back.length - 1];
  if (!entry) return null;
  return {
    entry,
    history: { back: history.back.slice(0, -1), forward: [current, ...history.forward].slice(0, MAX_HISTORY_ENTRIES) },
  };
}

/** One step forward from `current`, or null at the end. */
export function stepForward(
  history: NavHistory,
  current: HistoryEntry,
): { entry: HistoryEntry; history: NavHistory } | null {
  const entry = history.forward[0];
  if (!entry) return null;
  return {
    entry,
    history: { back: [...history.back, current].slice(-MAX_HISTORY_ENTRIES), forward: history.forward.slice(1) },
  };
}
