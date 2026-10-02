import { describe, expect, it } from "vitest";
import {
  MAX_NOTICES,
  clearTransientNotices,
  dismissNotice,
  dismissNoticeKey,
  expireNotices,
  nextExpiry,
  normalizeNotice,
  pushNotice,
  type Notice,
} from "./notifications";

const NOW = 1_000_000;

describe("notification center (U4-013)", () => {
  it("normalizes strings to info and keeps the explicit kind", () => {
    expect(normalizeNotice("Saved")).toEqual({ message: "Saved", kind: "info" });
    expect(normalizeNotice("Broke", "error")).toEqual({ message: "Broke", kind: "error" });
    expect(normalizeNotice({ message: "x" }, "warning").kind).toBe("warning");
  });

  it("makes errors and progress persistent and times out the rest", () => {
    let notices: Notice[] = [];
    notices = pushNotice(notices, { message: "Failed", kind: "error" }, 1, NOW);
    notices = pushNotice(notices, { message: "Syncing", kind: "progress", progress: { value: 1, max: 3 } }, 2, NOW);
    notices = pushNotice(notices, { message: "Done", kind: "success" }, 3, NOW);
    expect(notices.map((notice) => notice.persistent)).toEqual([true, true, false]);
    expect(notices[2].expiresAt).toBe(NOW + 5_000);
    expect(nextExpiry(notices)).toBe(NOW + 5_000);
    expect(expireNotices(notices, NOW + 5_000).map((notice) => notice.id)).toEqual([1, 2]);
  });

  it("replaces a notification with the same key in place and keeps its id", () => {
    let notices = pushNotice([], { message: "Syncing 1/3", kind: "progress", key: "sync" }, 1, NOW);
    notices = pushNotice(notices, { message: "Other" }, 2, NOW);
    notices = pushNotice(notices, { message: "Synced", kind: "success", key: "sync" }, 3, NOW);
    expect(notices.map((notice) => [notice.id, notice.message, notice.kind])).toEqual([
      [1, "Synced", "success"],
      [2, "Other", "info"],
    ]);
    expect(dismissNoticeKey(notices, "sync").map((notice) => notice.id)).toEqual([2]);
  });

  it("counts a repeated message instead of stacking it", () => {
    let notices = pushNotice([], { message: "Offline", kind: "warning" }, 1, NOW);
    notices = pushNotice(notices, { message: "Offline", kind: "warning" }, 2, NOW + 1_000);
    expect(notices).toHaveLength(1);
    expect(notices[0].count).toBe(2);
    expect(notices[0].expiresAt).toBe(NOW + 11_000);
  });

  it("keeps at most MAX_NOTICES and drops the oldest transient one first", () => {
    let notices = pushNotice([], { message: "Error", kind: "error" }, 1, NOW);
    for (let id = 2; id <= MAX_NOTICES + 1; id += 1) notices = pushNotice(notices, { message: `Info ${id}` }, id, NOW);
    expect(notices).toHaveLength(MAX_NOTICES);
    expect(notices[0].id).toBe(1);
    expect(notices.some((notice) => notice.id === 2)).toBe(false);
  });

  it("clears only transient notifications and dismisses by id", () => {
    let notices = pushNotice([], { message: "Error", kind: "error" }, 1, NOW);
    notices = pushNotice(notices, { message: "Hello" }, 2, NOW);
    expect(clearTransientNotices(notices).map((notice) => notice.id)).toEqual([1]);
    expect(dismissNotice(notices, 1).map((notice) => notice.id)).toEqual([2]);
  });
});
