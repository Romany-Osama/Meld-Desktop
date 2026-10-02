import { useCallback, useEffect, useRef, useState } from "react";
import { useStartupUpdateCheck } from "../../UpdatePanel";
import {
  clearTransientNotices,
  dismissNotice,
  dismissNoticeKey,
  expireNotices,
  nextExpiry,
  normalizeNotice,
  Notice,
  NoticeInput,
  NoticeKind,
  pushNotice,
  SetNotice,
} from "../../app/notifications";

/** The notification center (U4-013). `setNotice` is the one way features report something to the user. */
export function useNotice(now: () => number = Date.now) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const nextId = useRef(1);
  const nowRef = useRef(now);

  const setNotice: SetNotice = useCallback((value: string | NoticeInput, kind?: NoticeKind) => {
    if (value === "") {
      setNotices(clearTransientNotices);
      return;
    }
    const input = normalizeNotice(value, kind);
    const id = nextId.current++;
    setNotices((current) => pushNotice(current, input, id, nowRef.current()));
  }, []);

  const dismiss = useCallback((id: number) => setNotices((current) => dismissNotice(current, id)), []);
  const dismissKey = useCallback((key: string) => setNotices((current) => dismissNoticeKey(current, key)), []);

  // One timer for the next notification to expire.
  const expiry = nextExpiry(notices);
  useEffect(() => {
    if (expiry === null) return;
    const timer = window.setTimeout(
      () => setNotices((current) => expireNotices(current, nowRef.current())),
      Math.max(0, expiry - nowRef.current()),
    );
    return () => window.clearTimeout(timer);
  }, [expiry]);

  useStartupUpdateCheck((update) =>
    setNotice({
      kind: "info",
      key: "update-available",
      persistent: true,
      message: update.portable
        ? `Meld Desktop ${update.version} is available. Settings → About has the download page.`
        : `Meld Desktop ${update.version} is available. Install it from Settings → About.`,
    }),
  );

  /** The newest message, for code and tests that only need the latest text. */
  const notice = notices.length > 0 ? notices[notices.length - 1].message : "";
  return { notice, notices, setNotice, dismiss, dismissKey };
}
