import { describe, expect, it } from "vitest";
import { CACHE_LIMIT_CHOICES_MB, formatBytes, limitLabel, usageSummary } from "./cacheUsage";

describe("cache usage text", () => {
  it("formats sizes", () => {
    expect(formatBytes(0)).toBe("0 MB");
    expect(formatBytes(5 * 1024 * 1024 + 300_000)).toBe("5.3 MB");
    expect(formatBytes(734 * 1024 * 1024)).toBe("734 MB");
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe("2.5 GB");
  });

  it("labels limits, including off", () => {
    expect(limitLabel(0)).toBe("Off");
    expect(limitLabel(2048)).toBe("2.0 GB");
    expect(limitLabel(512)).toBe("512 MB");
    expect(CACHE_LIMIT_CHOICES_MB).toContain(2048);
  });

  it("summarizes usage", () => {
    expect(usageSummary({ bytes: 300 * 1024 * 1024, songs: 1, limitMb: 1024 })).toBe("300 MB of 1.0 GB used · 1 song");
    expect(usageSummary({ bytes: 0, songs: 0, limitMb: 0 })).toBe("Off · songs are not cached during playback");
  });
});
