// U4-012: every action that removes or deletes something goes through one policy. The policy decides from the
// action's severity whether to ask first, whether to offer Undo, and how an optimistic change is rolled back.
import { errorMessage } from "../lib/util";
import type { SetNotice } from "./notifications";

/**
 * - `permanent`: cannot be taken back (a deleted upload, cleared history, a removed download file) → confirm first.
 * - `undoable`: has an exact reverse (unlike, unpin, remove from library) → no question, Undo in the notification.
 * - `disposable`: only throws away something Meld recreates on demand (playback cache) → neither.
 */
export type Severity = "permanent" | "undoable" | "disposable";

export type ConfirmRequest = { title: string; message: string; confirmLabel: string };

type Common = {
  /** Notification key, so a retry or undo replaces the earlier message instead of stacking. */
  key: string;
  /** Applies the change on screen before the backend answers; returns how to put it back. */
  optimistic?: () => () => void;
  commit: () => Promise<void>;
  /** Refreshes what the change affects (runs after commit and after undo). */
  refresh?: () => void | Promise<void>;
  /** Shown after commit; a function can describe what the commit reported (for example how many were removed). */
  success: string | (() => string);
  /** Prefix of the error message ("Could not remove download: <reason>"). */
  failure: string;
};

export type DestructiveSpec =
  | (Common & { severity: "permanent"; confirm: ConfirmRequest })
  | (Common & { severity: "undoable"; undo: () => Promise<void>; undone: string })
  | (Common & { severity: "disposable" });

export type DestructiveDeps = { confirm: (request: ConfirmRequest) => Promise<boolean>; notify: SetNotice };
export type DestructiveResult = "done" | "cancelled" | "failed";
/** `runDestructive` bound to the app's confirmation dialog and notification center. */
export type Destructive = (spec: DestructiveSpec) => Promise<DestructiveResult>;

export function policyFor(severity: Severity): { confirm: boolean; undo: boolean } {
  return { confirm: severity === "permanent", undo: severity === "undoable" };
}

/** Runs `spec` under the policy. `confirmed` skips the question (a Retry after the user already agreed). */
export async function runDestructive(
  spec: DestructiveSpec,
  deps: DestructiveDeps,
  { confirmed = false }: { confirmed?: boolean } = {},
): Promise<DestructiveResult> {
  if (spec.severity === "permanent" && !confirmed && !(await deps.confirm(spec.confirm))) return "cancelled";
  const rollback = spec.optimistic?.();
  try {
    await spec.commit();
  } catch (error) {
    rollback?.();
    deps.notify({
      kind: "error",
      key: spec.key,
      message: `${spec.failure}: ${errorMessage(error)}`,
      action: { label: "Retry", run: () => void runDestructive(spec, deps, { confirmed: true }) },
    });
    return "failed";
  }
  await spec.refresh?.();
  const success = typeof spec.success === "function" ? spec.success() : spec.success;
  if (spec.severity === "undoable") {
    const undo = spec.undo;
    deps.notify({
      kind: "success",
      key: spec.key,
      message: success,
      // Long enough to notice and reach the button.
      timeoutMs: 10_000,
      action: {
        label: "Undo",
        run: async () => {
          try {
            await undo();
            await spec.refresh?.();
            deps.notify({ kind: "info", key: spec.key, message: spec.undone });
          } catch (error) {
            deps.notify({ kind: "error", key: spec.key, message: `Undo failed: ${errorMessage(error)}` });
          }
        },
      },
    });
  } else deps.notify({ kind: "success", key: spec.key, message: success });
  return "done";
}
