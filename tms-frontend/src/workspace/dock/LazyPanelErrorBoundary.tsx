/**
 * Perf-1: Lazy-Chunk-Schutz fuer Dock-Panels.
 *
 * Suspense allein faengt NUR den loading-State; Chunk-Load-Fehler
 * (Netzwerk weg, deployment-mismatch, 404) crashen den React-Tree.
 * Diese Boundary catched den Error, zeigt einen retry-fähigen
 * Hinweis statt White-Screen.
 *
 * Class-Component noetig — React 19 hat noch kein hook-basiertes
 * Error-Boundary-API. Minimal-Implementierung.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** Optional Label fuer Logging. */
  label?: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class LazyPanelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(
      `[LazyPanelErrorBoundary${this.props.label ? ' ' + this.props.label : ''}] chunk-load oder render-fehler:`,
      error,
      info.componentStack,
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="h-full w-full flex items-center justify-center p-6 bg-white">
        <div className="max-w-sm text-center space-y-3">
          <div className="text-sm font-semibold text-red-700">
            Panel-Inhalt konnte nicht geladen werden.
          </div>
          <div className="text-xs text-gray-600">
            Vermutlich ein Netzwerk- oder Deployment-Problem. Reload
            der Seite hilft oft.
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={this.handleRetry}
              className="text-xs px-3 py-1.5 rounded border bg-white hover:bg-gray-50 min-h-[36px]"
            >
              Erneut versuchen
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 min-h-[36px]"
            >
              Seite neu laden
            </button>
          </div>
        </div>
      </div>
    );
  }
}
