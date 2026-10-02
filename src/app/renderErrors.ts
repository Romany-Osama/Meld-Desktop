// U4-014: render errors caught by an ErrorBoundary, for diagnostics and tests.
import { errorMessage } from "../lib/util";

/** Errors caught so far, newest last; kept for diagnostics (the playback report) and tests. */
export const renderErrors: { region: string; message: string; at: number }[] = [];

export function reportRenderError(region: string, error: unknown, componentStack?: string | null) {
  renderErrors.push({ region, message: errorMessage(error), at: Date.now() });
  if (renderErrors.length > 20) renderErrors.shift();
  console.error(`[Meld] ${region} failed to render:`, error, componentStack ?? "");
}
