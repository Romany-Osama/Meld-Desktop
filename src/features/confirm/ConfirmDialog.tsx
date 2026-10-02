import { useEffect, useRef } from "react";
import type { ConfirmRequest } from "../../app/destructive";

/** Asks before a permanent action (U4-012). Cancel has focus, so Enter never deletes by accident. */
export function ConfirmDialog({
  request,
  onAnswer,
}: {
  request: ConfirmRequest | null;
  onAnswer: (confirmed: boolean) => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (request) cancelRef.current?.focus();
  }, [request]);
  if (!request) return null;
  return (
    <div className="detail-overlay" role="presentation" onClick={() => onAnswer(false)}>
      <div
        className="detail-panel confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title">{request.title}</h2>
        <p id="confirm-message">{request.message}</p>
        <div className="dialog-actions">
          <button ref={cancelRef} className="secondary-button" onClick={() => onAnswer(false)}>
            Cancel
          </button>
          <button className="primary-button danger-button" onClick={() => onAnswer(true)}>
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
