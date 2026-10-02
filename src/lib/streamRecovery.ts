// Playback stream recovery policy (PLAY-030, PLAY-032, PLAY-033).
// When the <audio> element cannot use a stream, the player reports it to Rust (which drops a bad cached file
// or marks the YouTube client as failed for five minutes) and resolves again, keeping the position.

export const MAX_STREAM_RECOVERIES = 2;
/** Treat a stream as expired this many seconds early so resume/seek never races the expiry. */
export const EXPIRY_SAFETY_MARGIN_SECONDS = 60;

export type RecoveryReason = "expired" | "rejected";

export function isLocalStream(url: string | null | undefined): boolean {
  return !!url && !/^https?:/i.test(url);
}

export function isStreamNearExpiry(elapsedSeconds: number, expiresInSeconds: number): boolean {
  return expiresInSeconds > 0 && elapsedSeconds >= Math.max(0, expiresInSeconds - EXPIRY_SAFETY_MARGIN_SECONDS);
}

/** Decide whether to re-resolve after an audio error, and why. `null` means give up. */
export function recoveryReason(attempts: number, elapsedSeconds: number, expiresInSeconds: number): RecoveryReason | null {
  if (attempts >= MAX_STREAM_RECOVERIES) return null;
  return isStreamNearExpiry(elapsedSeconds, expiresInSeconds) ? "expired" : "rejected";
}

export function recoveryNotice(reason: RecoveryReason, attempt: number, localSource: boolean): string {
  if (reason === "expired") return "The stream link expired — refreshing it…";
  if (localSource) return "The cached copy could not be read — streaming it again…";
  return `This source failed — trying another YouTube source (${attempt}/${MAX_STREAM_RECOVERIES})…`;
}

export const FINAL_STREAM_ERROR = "This song could not be played after trying other sources. Try again in a few minutes.";
