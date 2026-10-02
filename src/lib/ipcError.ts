// Structured IPC errors (S5-007, D-042). Mirrors `src-tauri/src/ipc/error.rs`.
// Every backend command rejects with `{ code, message, retryable, detail? }`. Tauri itself can
// still reject with a plain string (for example when an argument fails to deserialize), so
// every helper here also accepts strings and `Error` objects.

export const IPC_ERROR_CODES = [
  "invalid_argument",
  "unauthenticated",
  "not_found",
  "conflict",
  "cancelled",
  "timeout",
  "rate_limited",
  "network",
  "upstream",
  "database",
  "io",
  "internal",
] as const;

export type IpcErrorCode = (typeof IPC_ERROR_CODES)[number];

export interface IpcError {
  code: IpcErrorCode;
  message: string;
  retryable: boolean;
  detail?: string;
}

const codes = new Set<string>(IPC_ERROR_CODES);

export function isIpcError(value: unknown): value is IpcError {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.code === "string" &&
    codes.has(candidate.code) &&
    typeof candidate.message === "string" &&
    typeof candidate.retryable === "boolean"
  );
}

/** Normalises anything a rejected `invoke` can produce into an `IpcError`. */
export function toIpcError(error: unknown): IpcError {
  if (isIpcError(error)) return error;
  if (error instanceof Error) return { code: "internal", message: error.message, retryable: false };
  if (typeof error === "string") {
    // Tauri's own argument errors: "invalid args `videoId` for command `…`: …"
    if (/^invalid args? /i.test(error)) return { code: "invalid_argument", message: error, retryable: false };
    if (/cancel+ed/i.test(error)) return { code: "cancelled", message: error, retryable: false };
    return { code: "internal", message: error, retryable: false };
  }
  return { code: "internal", message: "Unexpected error", retryable: false };
}

export function ipcErrorMessage(error: unknown): string {
  const normalized = toIpcError(error);
  return normalized.detail ? `${normalized.message} (${normalized.detail})` : normalized.message;
}

export function isIpcErrorCode(error: unknown, code: IpcErrorCode): boolean {
  return toIpcError(error).code === code;
}

export function isRetryable(error: unknown): boolean {
  return toIpcError(error).retryable;
}
