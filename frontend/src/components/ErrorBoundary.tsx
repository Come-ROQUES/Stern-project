import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[stern] uncaught render error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen grid place-items-center bg-bg text-white p-6">
          <article className="panel max-w-xl">
            <h1 className="text-lg font-semibold mb-2">Cockpit error</h1>
            <p className="text-sm text-neutral-300 mb-3">{this.state.error.message}</p>
            <button
              type="button"
              className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-md border border-cyan-300/30 bg-cyan-400/10 text-cyan-200"
              onClick={() => location.reload()}
            >
              reload
            </button>
          </article>
        </div>
      );
    }
    return this.props.children;
  }
}
