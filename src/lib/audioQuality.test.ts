import { describe, expect, it } from "vitest";
import { parseAudioQuality, streamRequest } from "./audioQuality";

describe("audio quality (PLAY-021)", () => {
  it("accepts exactly the values Rust understands", () => {
    expect(parseAudioQuality("auto")).toBe("auto");
    expect(parseAudioQuality("high")).toBe("high");
    expect(parseAudioQuality("low")).toBe("low");
    for (const value of ["", "HIGH", "best", null, undefined, 1]) expect(parseAudioQuality(value)).toBeNull();
  });

  it("every stream request carries the selected quality", () => {
    expect(streamRequest({ videoId: "v", playlistId: null, playPlaylistId: "p" }, "low")).toEqual({
      videoId: "v",
      playlistId: "p",
      audioQuality: "low",
    });
    expect(streamRequest({ videoId: "v", playlistId: "pl" }, "high").playlistId).toBe("pl");
  });
});
