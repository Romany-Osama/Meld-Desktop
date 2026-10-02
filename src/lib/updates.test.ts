import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const { shouldCheckForUpdates, formatProgress, UPDATE_CHECK_INTERVAL_MS } = await import("./updates");

describe("shouldCheckForUpdates", () => {
  const now = 1_800_000_000_000;
  it("checks when there is no or an unreadable timestamp", () => {
    expect(shouldCheckForUpdates(null, now)).toBe(true);
    expect(shouldCheckForUpdates("garbage", now)).toBe(true);
  });
  it("checks at most once per day", () => {
    expect(shouldCheckForUpdates(String(now - 60_000), now)).toBe(false);
    expect(shouldCheckForUpdates(String(now - UPDATE_CHECK_INTERVAL_MS), now)).toBe(true);
  });
  it("re-checks when the clock went backwards", () => {
    expect(shouldCheckForUpdates(String(now + 60_000), now)).toBe(true);
  });
});

describe("formatProgress", () => {
  it("shows percent when the size is known and clamps to 100", () => {
    expect(formatProgress({ downloaded: 5 * 1024 * 1024, total: 10 * 1024 * 1024 })).toBe("50% (5.0 of 10.0 MB)");
    expect(formatProgress({ downloaded: 11, total: 10 })).toMatch(/^100%/);
  });
  it("shows megabytes when the size is unknown", () => {
    expect(formatProgress({ downloaded: 3 * 1024 * 1024, total: null })).toBe("3.0 MB");
    expect(formatProgress(null)).toBe("");
  });
});
