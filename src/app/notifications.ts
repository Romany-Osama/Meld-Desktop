// U4-013: one notification center instead of a single notice string. Notifications have a kind, can carry an
// action (Undo, Retry …) or progress, replace each other by key, and errors stay until dismissed.

export type NoticeKind = "info" | "success" | "warning" | "error" | "progress";

export type NoticeAction = { label: string; run: () => void | Promise<void> };

export type NoticeInput = {
  message: string;
  kind?: NoticeKind;
  /** A later notification with the same key replaces this one (progress updates, a retried action). */
  key?: string;
  action?: NoticeAction;
  /** Progress of a running job; omit `max` (or set it to 0) for an indeterminate bar. */
  progress?: { value: number; max?: number };
  /** Keep it until the user dismisses it (errors are persistent by default). */
  persistent?: boolean;
  /** Override the time on screen in milliseconds. */
  timeoutMs?: number;
};

export type Notice = {
  id: number;
  kind: NoticeKind;
  message: string;
  key?: string;
  action?: NoticeAction;
  progress?: { value: number; max?: number };
  persistent: boolean;
  /** When it disappears by itself (ms since epoch), or null if it stays. */
  expiresAt: number | null;
  /** How often the same message was repeated while it was visible. */
  count: number;
};

/**
 * `setNotice(message)` keeps working everywhere (info), `setNotice(message, "error")` picks a kind, and
 * `setNotice({ … })` gives full control. `setNotice("")` clears the transient notifications, as before.
 */
export type SetNotice = (value: string | NoticeInput, kind?: NoticeKind) => void;

export const NOTICE_TIMEOUTS: Record<NoticeKind, number | null> = {
  info: 6_000,
  success: 5_000,
  warning: 10_000,
  error: null,
  progress: null,
};
/** At most this many are shown; the oldest transient one goes first. */
export const MAX_NOTICES = 4;

export function normalizeNotice(value: string | NoticeInput, kind?: NoticeKind): NoticeInput {
  return typeof value === "string" ? { message: value, kind: kind ?? "info" } : { ...value, kind: value.kind ?? kind };
}

/** Adds `input` to `notices`. Same key → replaced in place; same kind and message → counted, not repeated. */
export function pushNotice(notices: Notice[], input: NoticeInput, id: number, now: number): Notice[] {
  const kind = input.kind ?? "info";
  const persistent = input.persistent ?? (kind === "error" || kind === "progress");
  const timeout = input.timeoutMs ?? NOTICE_TIMEOUTS[kind];
  const expiresAt = persistent || timeout === null ? null : now + timeout;
  const notice: Notice = {
    id,
    kind,
    message: input.message,
    key: input.key,
    action: input.action,
    progress: input.progress,
    persistent,
    expiresAt,
    count: 1,
  };
  if (input.key !== undefined) {
    const index = notices.findIndex((existing) => existing.key === input.key);
    if (index >= 0) return notices.map((existing, at) => (at === index ? { ...notice, id: existing.id } : existing));
  }
  const repeated = notices.findIndex(
    (existing) => existing.key === undefined && existing.kind === kind && existing.message === input.message,
  );
  if (repeated >= 0)
    return notices.map((existing, at) =>
      at === repeated ? { ...existing, expiresAt, action: input.action, count: existing.count + 1 } : existing,
    );
  const next = [...notices, notice];
  while (next.length > MAX_NOTICES) {
    const oldestTransient = next.findIndex((existing) => !existing.persistent);
    next.splice(oldestTransient >= 0 ? oldestTransient : 0, 1);
  }
  return next;
}

export function dismissNotice(notices: Notice[], id: number): Notice[] {
  return notices.filter((notice) => notice.id !== id);
}

export function dismissNoticeKey(notices: Notice[], key: string): Notice[] {
  return notices.filter((notice) => notice.key !== key);
}

/** Drops notifications whose time is up. */
export function expireNotices(notices: Notice[], now: number): Notice[] {
  const next = notices.filter((notice) => notice.expiresAt === null || notice.expiresAt > now);
  return next.length === notices.length ? notices : next;
}

/** `setNotice("")`: clears what is transient, keeps errors, progress and anything persistent. */
export function clearTransientNotices(notices: Notice[]): Notice[] {
  const next = notices.filter((notice) => notice.persistent);
  return next.length === notices.length ? notices : next;
}

/** The earliest expiry, to schedule the next clean-up. */
export function nextExpiry(notices: Notice[]): number | null {
  let earliest: number | null = null;
  for (const notice of notices)
    if (notice.expiresAt !== null && (earliest === null || notice.expiresAt < earliest)) earliest = notice.expiresAt;
  return earliest;
}
