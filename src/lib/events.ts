// Event contract (S5-010, D-046). Mirrors src-tauri/src/events.rs and docs/events.md; listen only through
// `listenEvent` so the event name and payload type cannot drift.
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { IpcError } from "./ipcError";
import type { DownloadInfo, SessionStatus, SpotifySessionStatus } from "../types";
import type { UpdateProgress } from "./updates";

export type EventPayloads = {
  "account-status": SessionStatus;
  "account-status-error": IpcError | string;
  "spotify-status": SpotifySessionStatus;
  "spotify-status-error": IpcError | string;
  "download-state": DownloadInfo;
  "app-update-progress": UpdateProgress;
  "media-prev": null;
  "media-toggle": null;
  "media-next": null;
};

export type AppEventName = keyof EventPayloads;

/** Payload version of every event (docs/events.md). */
export const EVENT_VERSIONS: Record<AppEventName, number> = {
  "account-status": 1,
  "account-status-error": 2,
  "spotify-status": 1,
  "spotify-status-error": 2,
  "download-state": 1,
  "app-update-progress": 1,
  "media-prev": 1,
  "media-toggle": 1,
  "media-next": 1,
};

export function listenEvent<K extends AppEventName>(
  name: K,
  handler: (payload: EventPayloads[K]) => void,
): Promise<UnlistenFn> {
  return listen<EventPayloads[K]>(name, (event) => handler(event.payload));
}
