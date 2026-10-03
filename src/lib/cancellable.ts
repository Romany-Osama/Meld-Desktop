// Cancellable commands (S5-009, D-045). Long commands (search, page and playlist loads, library sync, lyrics)
// accept a `requestId`; aborting the signal asks the backend to stop that request (`request_cancel`), which drops
// its in-flight HTTP request instead of letting it finish for a screen nobody is looking at.
import { invoke } from "@tauri-apps/api/core";
import type { IpcError } from "./ipcError";
import type { CommandArgs, CommandName, CommandResult } from "./ipc";

let sequence = 0;

/** A request id the backend accepts (`Token`: letters, digits, `_` and `-`). */
export function newRequestId(): string {
  sequence = (sequence + 1) % Number.MAX_SAFE_INTEGER;
  return `r${Date.now().toString(36)}_${sequence.toString(36)}`;
}

export function cancelledError(message = "Request was cancelled"): IpcError {
  return { code: "cancelled", message, retryable: false };
}

export async function invokeCancellable<K extends CommandName>(
  command: K,
  args: Omit<CommandArgs<K>, "requestId">,
  signal?: AbortSignal,
): Promise<CommandResult<K>> {
  type T = CommandResult<K>;
  if (!signal) return invoke<T>(command, args as Record<string, unknown>);
  if (signal.aborted) throw cancelledError();
  const requestId = newRequestId();
  const onAbort = () => void invoke("request_cancel", { requestId }).catch(() => undefined);
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    return await invoke<T>(command, { ...(args as Record<string, unknown>), requestId });
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
