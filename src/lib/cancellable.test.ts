import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import { invokeCancellable, newRequestId } from "./cancellable";
import { isIpcErrorCode } from "./ipcError";

describe("invokeCancellable", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("passes a request id and cancels it on abort", async () => {
    let resolve: (value: string) => void = () => undefined;
    invoke.mockImplementation((command: string) =>
      command === "request_cancel" ? Promise.resolve(true) : new Promise((done) => (resolve = done)),
    );
    const controller = new AbortController();
    const pending = invokeCancellable<string>("ytm_search", { query: "x" }, controller.signal);
    const [, args] = invoke.mock.calls[0] as [string, { query: string; requestId: string }];
    expect(args.query).toBe("x");
    expect(args.requestId).toMatch(/^[A-Za-z0-9_-]+$/);
    controller.abort();
    expect(invoke).toHaveBeenCalledWith("request_cancel", { requestId: args.requestId });
    resolve("late");
    await expect(pending).resolves.toBe("late");
  });

  it("does not call the backend for an already aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const error = await invokeCancellable("ytm_search", { query: "x" }, controller.signal).catch((value) => value);
    expect(isIpcErrorCode(error, "cancelled")).toBe(true);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("calls plainly without a signal and stops listening after completion", async () => {
    invoke.mockResolvedValue("ok");
    await expect(invokeCancellable("fetch_lyrics", { title: "t" })).resolves.toBe("ok");
    expect(invoke).toHaveBeenCalledWith("fetch_lyrics", { title: "t" });
    const controller = new AbortController();
    await invokeCancellable("fetch_lyrics", { title: "t" }, controller.signal);
    controller.abort();
    expect(invoke).not.toHaveBeenCalledWith("request_cancel", expect.anything());
  });

  it("makes unique ids", () => {
    expect(new Set(Array.from({ length: 100 }, newRequestId)).size).toBe(100);
  });
});
