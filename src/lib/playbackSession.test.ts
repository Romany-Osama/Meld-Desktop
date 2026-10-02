import { describe, expect, it } from "vitest";
import {
  playbackEffectKey,
  resumeStartPosition,
  shouldAutoplay,
  startOccurrence,
  withRefreshedPayload,
} from "./playbackSession";
import { recoveryReason } from "./streamRecovery";

const song = { id: "song-1" };

describe("effect keys: song id + occurrence (PLAY-035)", () => {
  it("replaying the same song is a new occurrence, so the audio element restarts", () => {
    const first = startOccurrence(0, song, { streamUrl: "a" });
    const replay = startOccurrence(first.session, song, { streamUrl: "a" });
    expect(playbackEffectKey(first)).toBe("song-1#1");
    expect(playbackEffectKey(replay)).toBe("song-1#2");
    expect(playbackEffectKey(replay)).not.toBe(playbackEffectKey(first));
    expect(playbackEffectKey(null)).toBeNull();
  });

  it("a refreshed URL for the same occurrence keeps the key, so the position is kept", () => {
    const playing = startOccurrence(4, song, { streamUrl: "expired" });
    const refreshed = withRefreshedPayload(playing, playing.session, { streamUrl: "fresh" })!;
    expect(refreshed.payload.streamUrl).toBe("fresh");
    expect(playbackEffectKey(refreshed)).toBe(playbackEffectKey(playing));
  });

  it("a late refresh for an older occurrence never replaces the new song (last click wins)", () => {
    const old = startOccurrence(0, song, { streamUrl: "old" });
    const next = startOccurrence(old.session, { id: "song-2" }, { streamUrl: "next" });
    expect(withRefreshedPayload(next, old.session, { streamUrl: "late" })).toBe(next);
    expect(withRefreshedPayload(null, 1, { streamUrl: "late" })).toBeNull();
  });
});

describe("expiry recovery (PLAY-031)", () => {
  it("pausing past expiry is recovered as 'expired' and resumes at the same position", () => {
    const expiresIn = 6 * 60 * 60;
    expect(recoveryReason(0, expiresIn + 10, expiresIn)).toBe("expired");
    const playing = startOccurrence(0, song, { streamUrl: "expired", position: 0 });
    const refreshed = withRefreshedPayload(playing, playing.session, { streamUrl: "fresh", position: 0 });
    // Same key: the setup effect does not run again, so recoverStream()'s currentTime = resumeAt is kept.
    expect(playbackEffectKey(refreshed)).toBe(playbackEffectKey(playing));
  });

  it("stops after the retry limit", () => {
    expect(recoveryReason(2, 0, 100)).toBeNull();
  });
});

describe("resume after app restart (PLAY-055)", () => {
  it("seeks to the saved position only when resuming", () => {
    expect(resumeStartPosition(true, 42.5, 200)).toBe(42.5);
    expect(resumeStartPosition(true, 42.5, Number.NaN)).toBe(42.5);
    expect(resumeStartPosition(false, 42.5, 200)).toBeNull();
  });

  it("starts from 0 for missing, invalid or finished positions", () => {
    expect(resumeStartPosition(true, null, 200)).toBeNull();
    expect(resumeStartPosition(true, 0, 200)).toBeNull();
    expect(resumeStartPosition(true, Number.POSITIVE_INFINITY, 200)).toBeNull();
    expect(resumeStartPosition(true, 199.5, 200)).toBeNull();
  });

  it("autoplays a restored song only if it was playing when the app closed", () => {
    expect(shouldAutoplay(false, false)).toBe(true);
    expect(shouldAutoplay(true, true)).toBe(true);
    expect(shouldAutoplay(true, false)).toBe(false);
  });
});
