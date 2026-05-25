/**
 * S-2a + S-3a + S-3b-2 DockRuntime — DockviewReact-Wrapper.
 *
 * Layout-Schichtung (Restore):
 *   Pass 1 (onReady, sync):
 *     loadStoredLayout()
 *       → fromJSON(stored)         (S-3a localStorage)
 *       → sonst fromJSON(default)  (sofortiges Bild, S-2a)
 *   Pass 2 (useEffect, async, S-3b-2):
 *     Wenn KEIN localStorage beim Mount UND userTouched=false UND
 *     backendDefaultLayout vorhanden:
 *       → fromJSON(backendDefault), one-shot.
 *     "userTouched" wird beim ersten pointerdown im Dock-Container
 *     auf true gesetzt — verhindert Race-Overwrite, falls User
 *     waehrend des Backend-Fetches schon dragged.
 *
 * Persist:
 *   onDidLayoutChange (DEBOUNCED ~400ms) → storeLayout (localStorage).
 *
 * Reset (DOCK_RESET_EVENT): clearStoredLayout + fromJSON(default).
 *
 * defaultRenderer='always': alle Panels bleiben gemountet bei
 *   Tab-Wechsel/Move.
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  DockviewReact,
  type DockviewApi,
  type DockviewIDisposable,
  type DockviewReadyEvent,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
  type SerializedDockview,
} from 'dockview';
import 'dockview/dist/styles/dockview.css';
import { installDockBridge } from '../../lib/dockBridge';
import CustomTab from './CustomTab';
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

// S-4: Default-Tab-Renderer mit Float/Popout-Buttons (gilt fuer
// ALLE Panels — kein per-Panel tabComponent-opt-in noetig).
const defaultTabComponent: React.FC<IDockviewPanelHeaderProps> = CustomTab;

/** Persist-Debounce in ms — schützt vor onDidLayoutChange-Spam. */
const PERSIST_DEBOUNCE_MS = 400;

/** Window-Event-Name für externen Reset-Trigger (TopBar). */
export const DOCK_RESET_EVENT = 'tms-workspace-dock:reset';

interface DockRuntimeProps {
  /**
   * S-3b-2: Wird einmalig nach onReady mit der Dockview-Api
   * aufgerufen. WorkspacePage haelt die Ref und reicht
   * getCurrentLayout()/applyLayout() an die TopBar weiter
   * (Save/Load der benannten Backend-Layouts).
   */
  onApiReady?: (api: DockviewApi) => void;
  /**
   * S-3b-2: is_default-Layout des Users fuer den aktiven Workspace
   * (aus useWorkspaceLayouts). Wird in Pass-2 angewandt, falls
   * KEIN localStorage beim Mount UND User noch nichts angefasst hat.
   * Null = noch keine Backend-Daten / kein Default.
   */
  backendDefaultLayout?: SerializedDockview | null;
}

export default function DockRuntime({
  onApiReady,
  backendDefaultLayout = null,
}: DockRuntimeProps = {}) {
  const apiRef = useRef<DockviewApi | null>(null);
  const debounceRef = useRef<number | null>(null);
  const layoutSubRef = useRef<DockviewIDisposable | null>(null);

  // S-3b-2: Schutz-Refs fuer Pass-2 Backend-Default-Restore.
  const hadStorageAtMountRef = useRef<boolean>(false);
  const userTouchedRef = useRef<boolean>(false);
  const backendDefaultAppliedRef = useRef<boolean>(false);

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
      hadStorageAtMountRef.current = !!stored;
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
      // Detail-Panel-Bridge: stellt event.api als Modul-Slot bereit,
      // damit Klick-Handler (TourCards, Maps, Eingang) addPanel/
      // getPanel aufrufen koennen ohne den Provider-Tree zu wandern.
      installDockBridge(event.api);
      // S-3b-2: Api an Parent reichen (WorkspacePage → TopBar fuer
      // Save/Load der benannten Backend-Layouts).
      onApiReady?.(event.api);
    },
    [schedulePersist, onApiReady],
  );

  // S-3b-2 Pass 2: Backend-Default einmalig anwenden, wenn der User
  // auf diesem Geraet noch nichts hat (kein localStorage + keine
  // Interaktion). Re-runs sobald backendDefaultLayout sich aendert
  // (=Query loest auf); guarded gegen Doppel-Apply.
  useEffect(() => {
    if (hadStorageAtMountRef.current) return;
    if (userTouchedRef.current) return;
    if (backendDefaultAppliedRef.current) return;
    if (!backendDefaultLayout) return;
    const api = apiRef.current;
    if (!api) return;
    try {
      api.fromJSON(backendDefaultLayout);
      backendDefaultAppliedRef.current = true;
    } catch {
      /* Inkompatibel (Panel-Names umbenannt etc.) — kein crash. */
    }
  }, [backendDefaultLayout]);

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
      // Detail-Bridge zuruecksetzen — sonst behalten Klick-Handler
      // eine stale-Api-Referenz, wenn die Workspace-Page unmountet.
      installDockBridge(null);
    };
  }, []);

  // S-3b-2: pointerdown im Dock-Container = userTouched. Decken auch
  // Tab-Wechsel/Drag-Start ab. onDidLayoutChange wuerde auch
  // programmatic fromJSON-Calls catchen (kein sauberer Indikator
  // fuer "User"), daher dieser separate Pfad.
  const markUserTouched = useCallback(() => {
    userTouchedRef.current = true;
  }, []);

  return (
    <div
      className="h-full w-full"
      onPointerDownCapture={markUserTouched}
    >
      <DockviewReact
        components={components}
        defaultTabComponent={defaultTabComponent}
        defaultRenderer="always"
        onReady={onReady}
        // S-4: Floating-Groups explizit aktivieren + im Viewport
        // halten (sonst koennen frei gedraggte Fenster ausserhalb
        // sichtbarem Bereich enden). Popout (=window.open) wird
        // per Tab-Button getriggert (CustomTab.onPopout).
        // serializeLayout/fromJSON erfasst Floating-Bounds bereits
        // out-of-the-box (dockview-Default-Verhalten); userTouched
        // bleibt korrekt, weil der Tab-Button-Klick als
        // pointerdown-im-Container zaehlt.
        disableFloatingGroups={false}
        floatingGroupBounds="boundedWithinViewport"
        className="dockview-theme-light h-full w-full"
      />
    </div>
  );
}
