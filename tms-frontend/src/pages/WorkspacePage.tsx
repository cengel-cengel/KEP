/**
 * S-2a WorkspacePage — DockRuntime statt react-resizable-panels.
 *
 * State + Callbacks: WorkspaceRuntimeContext (seit S-1).
 * Layout: DockRuntime (dockview) statt Group/Panel (rrp).
 *
 * S-2a-Scope (laut Prompt):
 *   - 3 Spalten Queue | Board | Map mit DEFAULT_LAYOUT-Größen
 *   - defaultRenderer='always' global (Map-Instance überlebt Move)
 *   - KEIN Persist (S-3)
 *   - KEINE Tabs (entstehen organisch via User-Move in S-4)
 *   - KEIN Map-Collapse-Parity (kein S-2a-Blocker)
 *   - ContextPanel bleibt Overlay (nicht dockbar in Phase 1)
 *
 * useWorkspaceLayout bleibt vorerst importiert (von anderen Stellen
 * konsumiert, z.B. workspace.tsx). DockRuntime nutzt es noch nicht —
 * Layout-Persistence kommt in S-3 via serializeLayout.
 *
 * PanelGroup:-Storage-Cleanup BLEIBT als one-shot — alt-Keys aus
 * der rrp-Phase entfernen, schadet dockview nicht.
 */
import { useEffect } from 'react';
import WorkspaceTopBar from '../components/workspace/WorkspaceTopBar';
import QuickAddBar from '../components/nv/QuickAddBar';
import { useWorkspace } from '../state/workspace';
import {
  useWorkspaceRuntime,
  WorkspaceRuntimeProvider,
} from '../workspace/runtime/WorkspaceRuntimeContext';
import DockRuntime from '../workspace/dock/DockRuntime';

export default function WorkspacePage() {
  return (
    <WorkspaceRuntimeProvider>
      <WorkspacePageInner />
    </WorkspaceRuntimeProvider>
  );
}

function WorkspacePageInner() {
  const { mode, setMode } = useWorkspace();
  const {
    pinAddShipmentId,
    banner,
    setBanner,
    quickAddTouren,
    closeQuickAdd,
    onQuickAddPick,
    onQuickAddCreateNew,
  } = useWorkspaceRuntime();

  // W-3.2.D Layout-Storage Cleanup (alt-Keys mit Prefix 'PanelGroup:').
  // Bleibt aus rrp-Zeit; schadet dockview nicht, räumt nur localStorage.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('PanelGroup:')) keys.push(k);
      }
      for (const k of keys) localStorage.removeItem(k);
    } catch {
      /* silent */
    }
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <WorkspaceTopBar mode={mode} onModeChange={setMode} />

      {banner && (
        <div
          onClick={() => setBanner(null)}
          className={`px-4 py-2 text-sm cursor-pointer border-b ${
            banner.kind === 'ok'
              ? 'bg-green-50 text-green-800 border-green-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {banner.msg}
          <span className="text-xs text-gray-500 ml-2">(klick zum Schließen)</span>
        </div>
      )}

      {mode === 'nv' && pinAddShipmentId && (
        <QuickAddBar
          shipmentNumber={pinAddShipmentId.slice(0, 8)}
          touren={quickAddTouren}
          onPick={onQuickAddPick}
          onCreateNew={onQuickAddCreateNew}
          onClose={closeQuickAdd}
        />
      )}

      <div className="flex-1 min-h-0">
        <DockRuntime />
      </div>
    </div>
  );
}
