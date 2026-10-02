// U4-014: a render error inside one region (a page, an open album, the player bar, a panel) shows a small
// fallback in that region only. The rest of the shell keeps working and playback keeps going.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportRenderError } from "../app/renderErrors";
import { errorMessage } from "../lib/util";

export type ErrorBoundaryProps = {
  /** Shown in the fallback and the log ("Album page", "Player controls" …). */
  name: string;
  /** When this changes (another route, another album), the region tries to render again. */
  resetKey?: unknown;
  /** For overlays: lets the user close the broken panel. */
  onClose?: () => void;
  /** `page` fills the content area, `panel` an overlay panel, `bar` a compact strip (player). */
  variant?: "page" | "panel" | "bar";
  children: ReactNode;
};

type State = { error: unknown; resetKey: unknown };

export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error ?? new Error("Unknown error") };
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: State): Partial<State> | null {
    return Object.is(props.resetKey, state.resetKey) ? null : { error: null, resetKey: props.resetKey };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    reportRenderError(this.props.name, error, info.componentStack);
  }

  private retry = () => this.setState({ error: null });

  render() {
    if (this.state.error === null) return this.props.children;
    const { name, onClose, variant = "page" } = this.props;
    const fallback = (
      <div className={`error-boundary error-boundary-${variant}`} role="alert" data-error-region={name}>
        <strong>{name} could not be shown.</strong>
        {variant !== "bar" && <p>{errorMessage(this.state.error)}</p>}
        <div className="dialog-actions">
          <button className="secondary-button" onClick={this.retry}>
            Try again
          </button>
          {onClose && (
            <button className="secondary-button" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    );
    if (variant !== "panel") return fallback;
    return (
      <div className="detail-overlay" role="presentation">
        <div className="detail-panel">{fallback}</div>
      </div>
    );
  }
}
