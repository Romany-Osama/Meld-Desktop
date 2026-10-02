// Playback sessions (PLAY-031, PLAY-035, PLAY-055).
// Every start of a song, including replaying the same song, is a new occurrence with its own session number.
// The <audio> setup effect is keyed on that occurrence, so a URL refresh for the same occurrence keeps the position,
// and a replay of the same song always restarts from the beginning.

export type PlayerState<I extends { id: string }, P> = { item: I; payload: P; session: number };

export function startOccurrence<I extends { id: string }, P>(
  previousSession: number,
  item: I,
  payload: P,
): PlayerState<I, P> {
  return { item, payload, session: previousSession + 1 };
}

/** Effect key: song id plus occurrence. Changes on every new start, never on a payload refresh. */
export function playbackEffectKey(state: PlayerState<{ id: string }, unknown> | null): string | null {
  return state ? `${state.item.id}#${state.session}` : null;
}

/** Apply a refreshed stream payload only to the occurrence it was resolved for (last click wins). */
export function withRefreshedPayload<I extends { id: string }, P>(
  current: PlayerState<I, P> | null,
  session: number,
  payload: P,
): PlayerState<I, P> | null {
  return current && current.session === session ? { ...current, payload } : current;
}

/** Where a newly loaded stream should start: the saved position when resuming, else the beginning. */
export function resumeStartPosition(
  resuming: boolean,
  position: number | null,
  durationSeconds: number,
): number | null {
  if (!resuming || position === null || !Number.isFinite(position) || position <= 0) return null;
  if (Number.isFinite(durationSeconds) && position >= durationSeconds - 1) return null;
  return position;
}

/** A restored session only autoplays if it was playing when the app closed; a fresh start always plays. */
export function shouldAutoplay(resuming: boolean, wasPlaying: boolean): boolean {
  return !resuming || wasPlaying;
}
