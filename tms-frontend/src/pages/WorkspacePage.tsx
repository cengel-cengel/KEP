/**
 * S-1 WorkspacePage — nach State-Entkopplung.
 *
 * State + Callbacks leben jetzt in WorkspaceRuntimeContext
 * (src/workspace/runtime/). Hier nur noch:
 *   - useWorkspaceLayout (Resize-Sizes)
 *   - useWorkspace (mode für QuickAddBar-Bedingung)
 *   - JSX-Layout: TopBar + Banner + QuickAddBar + Group/Panels
 *
 * Panels lesen ihre Daten/Callbacks via useWorkspaceRuntime().
 *
 * Layout-Persistence:
 *   onLayoutChanged feuert 1× pro Pointer-Release (kein Spam).
 *   PanelGroup:-Storage-Cleanup als One-shot on-mount (Alt-Reste
 *   aus W-3.2.C-Zwischenstand).
 */
import { useEffect, useMemo } from 'react';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import WorkspaceTopBar from '../components/workspace/WorkspaceTopBar';
import QueuePanel from '../components/workspace/QueuePanel';
import BoardPanel from '../components/workspace/BoardPanel';
import MapPanel from '../components/workspace/MapPanel';
import QuickAddBar from '../components/nv/QuickAddBar';
import { useWorkspace, useWorkspaceLayout } from '../state/workspace';
import {
  useWorkspaceRuntime,
  WorkspaceRuntimeProvider,
} from '../workspace/runtime/WorkspaceRuntimeContext';

export default function WorkspacePage() {
  return (
    <WorkspaceRuntimeProvider>
      <WorkspacePageInner />
    </WorkspaceRuntimeProvider>
  );
}

function WorkspacePageInner() {
  const { mode, setMode } = useWorkspace();
  const { layout, setLayout } = useWorkspaceLayout();
  const {
    pinAddShipmentId,
    banner,
    setBanner,
    quickAddTouren,
    closeQuickAdd,
    onQuickAddPick,
    onQuickAddCreateNew,
  } = useWorkspaceRuntime();

  // Default-Layout für PanelGroup (flexGrow-Map keyed auf Panel-id).
  // Sizes in % aus workspace.layout (queueSize+boardSize+mapSize=100).
  const defaultLayout = useMemo<Layout>(
    () => ({
      queue: layout.queueSize,
      board: layout.boardSize,
      map: layout.mapSize,
    }),
    // Nur initial — sonst zerstört User-Resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Persist Resize → workspace.layout.
  // react-resizable-panels v4: onLayoutChanged feuert NACH Pointer-
  // Release (1× pro Resize, kein Debounce nötig).
  const onLayoutChanged = (next: Layout) => {
    const total =
      (next.queue ?? 0) + (next.board ?? 0) + (next.map ?? 0);
    if (total <= 0) return;
    const norm = 100 / total;
    setLayout({
      queueSize: Math.round((next.queue ?? layout.queueSize) * norm),
      boardSize: Math.round((next.board ?? layout.boardSize) * norm),
      mapSize: Math.round((next.map ?? layout.mapSize) * norm),
    });
  };

  // W-3.2.D Layout-Storage Cleanup (alt-Keys mit Prefix 'PanelGroup:').
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
        <Group
          id="tms-workspace-panels"
          orientation="horizontal"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
          className="h-full"
        >
          <Panel id="queue" minSize={20} defaultSize={layout.queueSize}>
            <QueuePanel />
          </Panel>
          <Separator className="w-1 bg-gray-200 hover:bg-blue-300 transition-colors" />
          <Panel id="board" minSize={30} defaultSize={layout.boardSize}>
            <BoardPanel />
          </Panel>
          <Separator className="w-1 bg-gray-200 hover:bg-blue-300 transition-colors" />
          <Panel
            id="map"
            minSize={0}
            defaultSize={layout.mapSize}
            collapsible
            collapsedSize={2}
          >
            <MapPanel />
          </Panel>
        </Group>
      </div>
    </div>
  );
}
