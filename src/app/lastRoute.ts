// U4-006: the last page is restored at start-up, but only when that is safe.
import { parseRoutePath, Route, routePath, TopLevel } from "./routes";

export const LAST_ROUTE_KEY = "meld:lastRoute";
const TABS: readonly TopLevel[] = ["home", "search_input", "library", "history", "stats"];

// A search for a link opens (and for a video, plays) the linked item; restoring it would start playback by itself.
const LINK = /:\/\/|(^|\.)(youtube\.com|youtu\.be|spotify\.com)\b|^(www\.)?(music\.)?youtube\.|^open\.spotify\./i;

/**
 * Whether `route` may be shown again after a restart. Settings is a modal (its Integrations page starts sign-ins) and
 * dialogs and confirmations are not routes at all (D-028), so neither can come back. Spotify pages need a session
 * that is only known later, so they fall back to the library.
 */
export function restorableRoute(route: Route): Route | null {
  if (route.name === "settings") return null;
  if (route.name === "search" && LINK.test(route.query)) return { name: "search", query: "" };
  if (route.name === "spotify-playlist" || route.name === "spotify-liked")
    return { name: "library", mode: "playlists" };
  return route;
}

/** The value to store for the page being shown, or null to clear it. */
export function serializeLastRoute(route: Route, tab: TopLevel): string | null {
  const restorable = restorableRoute(route);
  if (!restorable || restorable.name === "home") return null;
  return JSON.stringify({ path: routePath(restorable), tab });
}

/** Parses a stored value; anything malformed, unknown or unsafe returns null. */
export function parseLastRoute(raw: string | null): { route: Route; tab: TopLevel } | null {
  if (!raw || raw.length > 2000) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const { path, tab } = value as { path?: unknown; tab?: unknown };
  if (typeof path !== "string" || typeof tab !== "string" || !(TABS as readonly string[]).includes(tab)) return null;
  const parsed = parseRoutePath(path);
  const route = parsed && restorableRoute(parsed);
  return route ? { route, tab: tab as TopLevel } : null;
}
