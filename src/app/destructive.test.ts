import { describe, expect, it, vi } from "vitest";
import { policyFor, runDestructive, type DestructiveDeps, type DestructiveSpec } from "./destructive";
import type { NoticeInput } from "./notifications";

function deps(answer = true) {
  const notices: NoticeInput[] = [];
  const confirm = vi.fn(async () => answer);
  const notify = vi.fn((value: string | NoticeInput) => {
    notices.push(typeof value === "string" ? { message: value } : value);
  });
  return { deps: { confirm, notify } as DestructiveDeps, confirm, notices };
}

const confirmRequest = { title: "Delete?", message: "This cannot be undone.", confirmLabel: "Delete" };

describe("destructive action policy (U4-012)", () => {
  it("asks only for permanent actions and offers Undo only for undoable ones", () => {
    expect(policyFor("permanent")).toEqual({ confirm: true, undo: false });
    expect(policyFor("undoable")).toEqual({ confirm: false, undo: true });
    expect(policyFor("disposable")).toEqual({ confirm: false, undo: false });
  });

  it("does nothing when a permanent action is cancelled", async () => {
    const { deps: d, confirm, notices } = deps(false);
    const commit = vi.fn(async () => {});
    const result = await runDestructive(
      {
        severity: "permanent",
        key: "k",
        confirm: confirmRequest,
        commit,
        success: "Deleted",
        failure: "Could not delete",
      },
      d,
    );
    expect(result).toBe("cancelled");
    expect(confirm).toHaveBeenCalledWith(confirmRequest);
    expect(commit).not.toHaveBeenCalled();
    expect(notices).toEqual([]);
  });

  it("rolls back an optimistic change on failure and retries without asking again", async () => {
    const { deps: d, confirm, notices } = deps(true);
    const rollback = vi.fn();
    const commit = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    const spec: DestructiveSpec = {
      severity: "permanent",
      key: "upload:1",
      confirm: confirmRequest,
      optimistic: () => rollback,
      commit,
      success: () => "Deleted 1 upload",
      failure: "Could not delete",
    };
    expect(await runDestructive(spec, d)).toBe("failed");
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(notices[0]).toMatchObject({ kind: "error", key: "upload:1", message: "Could not delete: offline" });
    expect(notices[0].action?.label).toBe("Retry");
    notices[0].action?.run();
    await vi.waitFor(() => expect(notices).toHaveLength(2));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(notices[1]).toMatchObject({ kind: "success", key: "upload:1", message: "Deleted 1 upload" });
  });

  it("offers Undo for undoable actions and refreshes after undo", async () => {
    const { deps: d, confirm, notices } = deps();
    const undo = vi.fn(async () => {});
    const refresh = vi.fn();
    const result = await runDestructive(
      {
        severity: "undoable",
        key: "like:1",
        commit: async () => {},
        undo,
        refresh,
        success: "Removed from liked songs",
        undone: "Liked again",
        failure: "Could not unlike",
      },
      d,
    );
    expect(result).toBe("done");
    expect(confirm).not.toHaveBeenCalled();
    expect(notices[0]).toMatchObject({ kind: "success", timeoutMs: 10_000 });
    expect(notices[0].action?.label).toBe("Undo");
    await notices[0].action?.run();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(notices[1]).toMatchObject({ kind: "info", key: "like:1", message: "Liked again" });
  });

  it("runs disposable actions without a question or Undo", async () => {
    const { deps: d, confirm, notices } = deps();
    await runDestructive(
      { severity: "disposable", key: "cache", commit: async () => {}, success: "Cache cleared", failure: "x" },
      d,
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(notices).toEqual([{ kind: "success", key: "cache", message: "Cache cleared" }]);
  });
});
