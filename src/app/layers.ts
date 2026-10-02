// U4-005: overlays have one explicit stacking order. Back and Escape close the topmost open layer:
// dialogs first, then the item menu, the Settings page, player panels and finally nested screens.
// Only when nothing is open does Back step through the route history.

export const LAYERS = [
  // Dialogs (opened from menus, Settings or panels, so they sit above all of them).
  "logoutDialog",
  "createPlaylist",
  "playlistPicker",
  "artistPicker",
  "youtubeMatch",
  "spotifyAdd",
  "editItem",
  "speedDialog",
  "sleepTimer",
  "info",
  "recap",
  // Menus.
  "menu",
  // Full-window modal page.
  "settings",
  // Player panels (lyrics and the queue open from the expanded player).
  "lyrics",
  "queue",
  "expandedPlayer",
  // Nested screens shown on top of a sidebar destination.
  "playlist",
  "detail",
  "spotifyPlaylist",
  "spotifyLiked",
] as const;

export type Layer = (typeof LAYERS)[number];
export type LayerState = Record<Layer, boolean>;

export const LAYER_KIND: Record<Layer, "dialog" | "menu" | "page" | "panel" | "screen"> = {
  logoutDialog: "dialog",
  createPlaylist: "dialog",
  playlistPicker: "dialog",
  artistPicker: "dialog",
  youtubeMatch: "dialog",
  spotifyAdd: "dialog",
  editItem: "dialog",
  speedDialog: "dialog",
  sleepTimer: "dialog",
  info: "dialog",
  recap: "dialog",
  menu: "menu",
  settings: "page",
  lyrics: "panel",
  queue: "panel",
  expandedPlayer: "panel",
  playlist: "screen",
  detail: "screen",
  spotifyPlaylist: "screen",
  spotifyLiked: "screen",
};

/** Open layers, topmost first. */
export const openLayers = (state: LayerState): Layer[] => LAYERS.filter((layer) => state[layer]);

/** The layer Back or Escape closes next, or null when only the page itself is shown. */
export const topmostLayer = (state: LayerState): Layer | null => LAYERS.find((layer) => state[layer]) ?? null;
