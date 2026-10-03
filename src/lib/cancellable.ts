// Cancellable commands (S5-009, D-045). Long commands (search, page and playlist loads, library sync, lyrics)
// accept a `requestId`; aborting the signal asks the backend to stop that request (`request_cancel`), which drops
// its in-flight HTTP request instead of letting it finish for a screen nobody is looking at.
import { invoke } from "@tauri-apps/api/core";
import type { IpcError } from "./ipcError";

let sequence = 0;

/** A request id the backend accepts (`Token`: letters, digits, `_` and `-`). */
export function newRequestId(): string {
  sequence = (sequence + 1) % Number.MAX_SAFE_INTEGER;
  return `r${Date.now().toString(36)}_${sequence.toString(36)}`;
}

export function cancelledError(message = "Request was cancelled"): IpcError {
  return { code: "cancelled", message, retryable: false };
}

export async function invokeCancellable<T>(
  command: string,
  args: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return invoke<T>(command, args);
  if (signal.aborted) throw cancelledError();
  const requestId = newRequestId();
  const onAbort = () => void invoke("request_cancel", { requestId }).catch(() => undefined);
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    return await invoke<T>(command, { ...args, requestId });
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
