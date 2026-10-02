import type { Notice } from "../app/notifications";
import { noticeSummary } from "../lib/util";

const LABELS: Record<Notice["kind"], string> = {
  info: "Info",
  success: "Done",
  warning: "Warning",
  error: "Error",
  progress: "In progress",
};

/** Renders the notification center (U4-013): errors are announced as alerts, everything else politely. */
export function NoticeStack({ notices, onDismiss }: { notices: Notice[]; onDismiss: (id: number) => void }) {
  if (notices.length === 0) return null;
  return (
    <div className="notice-stack">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={`notice notice-${notice.kind}`}
          role={notice.kind === "error" ? "alert" : "status"}
          data-kind={notice.kind}
        >
          <span className="notice-kind">{LABELS[notice.kind]}</span>
          <span className="notice-message" title={notice.message}>
            {noticeSummary(notice.message)}
            {notice.count > 1 ? ` (×${notice.count})` : ""}
          </span>
          {notice.progress && (
            <progress
              className="notice-progress"
              value={notice.progress.max ? notice.progress.value : undefined}
              max={notice.progress.max || undefined}
              aria-label={notice.message}
            />
          )}
          {notice.action && (
            <button
              className="notice-action"
              onClick={() => {
                onDismiss(notice.id);
                void notice.action?.run();
              }}
            >
              {notice.action.label}
            </button>
          )}
          <button
            className="notice-dismiss"
            onClick={() => onDismiss(notice.id)}
            title="Dismiss message"
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
