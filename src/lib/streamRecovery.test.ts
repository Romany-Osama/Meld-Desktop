import { describe, expect, it } from "vitest";
import { EXPIRY_SAFETY_MARGIN_SECONDS, MAX_STREAM_RECOVERIES, isLocalStream, isStreamNearExpiry, recoveryNotice, recoveryReason } from "./streamRecovery";

describe("stream recovery", () => {
  it("re-resolves immediately on a fresh stream rejection instead of failing (PLAY-030)", () => {
    expect(recoveryReason(0, 2, 21540)).toBe("rejected");
    expect(recoveryReason(1, 2, 21540)).toBe("rejected");
  });

  it("stops after the retry limit (PLAY-033)", () => {
    expect(recoveryReason(MAX_STREAM_RECOVERIES, 2, 21540)).toBeNull();
  });

  it("treats near-expiry streams as expired with a safety margin (PLAY-032)", () => {
    expect(isStreamNearExpiry(21540 - EXPIRY_SAFETY_MARGIN_SECONDS, 21540)).toBe(true);
    expect(isStreamNearExpiry(100, 21540)).toBe(false);
    expect(isStreamNearExpiry(99999, 0)).toBe(false);
    expect(recoveryReason(0, 30000, 21540)).toBe("expired");
  });

  it("recognises local cached files and words notices", () => {
    expect(isLocalStream("C:\\Users\\me\\AppData\\Roaming\\Meld Desktop\\player-cache\\a.audio")).toBe(true);
    expect(isLocalStream("https://rr1---sn-x.googlevideo.com/videoplayback")).toBe(false);
    expect(isLocalStream(null)).toBe(false);
    expect(recoveryNotice("rejected", 1, true)).toMatch(/cached/);
    expect(recoveryNotice("rejected", 2, false)).toMatch(/2\/2/);
    expect(recoveryNotice("expired", 1, false)).toMatch(/expired/);
  });
});
