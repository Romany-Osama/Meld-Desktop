import { describe, expect, it } from "vitest";
import { ipcErrorMessage, isIpcError, isIpcErrorCode, isRetryable, toIpcError } from "./ipcError";
import { errorMessage } from "./util";

describe("ipcError", () => {
  const structured = { code: "network", message: "visitorData request failed", retryable: true };

  it("recognises the backend shape and rejects look-alikes", () => {
    expect(isIpcError(structured)).toBe(true);
    expect(isIpcError({ ...structured, code: "teapot" })).toBe(false);
    expect(isIpcError({ code: "network", message: "x" })).toBe(false);
    expect(isIpcError("network")).toBe(false);
    expect(isIpcError(null)).toBe(false);
  });

  it("normalises strings, Errors and unknown values", () => {
    expect(toIpcError("invalid args `videoId` for command `ytm_player`: bad").code).toBe("invalid_argument");
    expect(toIpcError("Backup cancelled").code).toBe("cancelled");
    expect(toIpcError(new Error("boom"))).toEqual({ code: "internal", message: "boom", retryable: false });
    expect(toIpcError(42).message).toBe("Unexpected error");
  });

  it("exposes code, retry and message helpers", () => {
    expect(isRetryable(structured)).toBe(true);
    expect(isRetryable("plain")).toBe(false);
    expect(isIpcErrorCode({ code: "cancelled", message: "Backup cancelled", retryable: false }, "cancelled")).toBe(
      true,
    );
    expect(ipcErrorMessage({ ...structured, detail: "offline" })).toBe("visitorData request failed (offline)");
  });

  it("errorMessage never renders [object Object] for structured errors", () => {
    expect(errorMessage(structured)).toBe("visitorData request failed");
    expect(errorMessage("plain text")).toBe("plain text");
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });
});
