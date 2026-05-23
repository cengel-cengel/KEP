/**
 * S-2a + S-3a DockRuntime — DockviewReact-Wrapper.
 *
 * S-3a: Layout-Persistence via localStorage (EIN Layout,
 *   workspace-weit). serializeLayout-Helper aus S-2a aktiv.
 *
 * Lifecycle:
 *   onReady:
 *     1) loadStoredLayout() → vorhanden+Version-OK
 *        → api.fromJSON(saved)
 *     2) sonst (null/Mismatch/Parse-Fehler)
 *        → api.fromJSON(buildDefaultLayout())
 *   onDidLayoutChange (DEBOUNCED ~400ms):
 *     → storeLayout(api): toJSON + localStorage.setItem
 *     onDidLayoutChange feuert bei jedem Resize-Pixel — Debounce
 *     verhindert localStorage-Spam.
 *
 * Reset (window-event 'tms-workspace-dock:reset', emit aus
 *   WorkspaceTopBar): clearStoredLayout() + fromJSON(default).
 *   Window-Event statt Prop, weil DockRuntime tief im Tree liegt
 *   und kein Imperatives-Handle nach oben hat.
 *
 * defaultRenderer='always': alle Panels bleiben gemountet bei
 *   Tab-Wechsel/Move (s. S-2a Spike-Befund).
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  DockviewReact,
  type DockviewApi,
  type DockviewIDisposable,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from 'dockview';
import 'dockview/dist/styles/dockview.css';
import DockPanelWrapper from './DockPanelWrapper';
import { buildDefaultLayout } from './layoutDefaults';
import {
  clearStoredLayout,
  loadStoredLayout,
  storeLayout,
} from './serializeLayout';

const components: Record<string, React.FC<IDockviewPanelProps>> = {
  panel: DockPanelWrapper,
};

/** Persist-Debounce in ms — schützt vor onDidLayoutChange-Spam. */
const PERSIST_DEBOUNCE_MS = 400;

/** Window-Event-Name für externen Reset-Trigger (TopBar). */
export const DOCK_RESET_EVENT = 'tms-workspace-dock:reset';

export default function DockRuntime() {
  const apiRef = useRef<DockviewApi | null>(null);
  const debounceRef = useRef<number | null>(null);
  const layoutSubRef = useRef<DockviewIDisposable | null>(null);

  const schedulePersist = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      storeLayout(api);
      debounceRef.current = null;
    }, PERSIST_DEBOUNCE_MS);
  }, []);

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      apiRef.current = event.api;
      const stored = loadStoredLayout();
      if (stored) {
        try {
          event.api.fromJSON(stored);
        } catch {
          // Stored Layout passt nicht (Panel-Names umbenannt etc.)
          // → Default.
          event.api.fromJSON(buildDefaultLayout());
        }
      } else {
        event.api.fromJSON(buildDefaultLayout());
      }
      // Persist-Subscription erst NACH initial-fromJSON registrieren,
      // damit die Restore selbst nicht sofort einen storeLayout
      // triggert (no-op-Speicherung ist harmlos, aber unnötig).
      layoutSubRef.current = event.api.onDidLayoutChange(schedulePersist);
    },
    [schedulePersist],
  );

  // Reset-Trigger (window-event aus TopBar).
  useEffect(() => {
    const handler = () => {
      const api = apiRef.current;
      if (!api) return;
      clearStoredLayout();
      try {
        api.fromJSON(buildDefaultLayout());
      } catch {
        /* silent */
      }
    };
    window.addEventListener(DOCK_RESET_EVENT, handler);
    return () => window.removeEventListener(DOCK_RESET_EVENT, handler);
  }, []);

  // Cleanup pending Debounce-Timer + layout-Subscription on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current != null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      layoutSubRef.current?.dispose();
      layoutSubRef.current = null;
    };
  }, []);

  return (
    <DockviewReact
      components={components}
      defaultRenderer="always"
      onReady={onReady}
      className="dockview-theme-light h-full w-full"
    />
  );
}
