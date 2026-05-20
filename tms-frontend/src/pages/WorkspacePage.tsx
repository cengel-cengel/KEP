/**
 * W-3.2.C SCHRITT 5 WorkspacePage — Resize-Layout + Modal-Coordinator.
 *
 * Layout:
 *   TopBar (mode-toggle + saved-views)
 *   Banner (Status-Toast)
 *   QuickAddBar (NV-Pin-Add-Fallback wenn keine aktive Tour)
 *   PanelGroup horizontal:
 *     Panel: QueuePanel
 *     Resize-Handle
 *     Panel: BoardPanel
 *     Resize-Handle
 *     Panel: MapPanel (collapsible)
 *
 * Coordinator-State:
 *   activeTourViewId    Cross-Panel BoardPanel ↔ MapPanel
 *   pinAddShipmentId    QueuePanel(Map-Pin) → QuickAddBar
 *   pendingBulk         QueuePanel(FV-Tree-BulkAdd) → BoardPanel
 *   selected            QueuePanel ↔ BoardPanel (Multi-Select-Drop)
 *   banner              Cross-Panel-Error/Info
 *
 * NV-only Hooks:
 *   useNvPendingSync at workspace-level (Hook muss bedingungslos
 *   gerufen werden — in FV-Mode idle/no-op, da nvPendingStore-
 *   external nichts hat).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import WorkspaceTopBar from '../components/workspace/WorkspaceTopBar';
import QueuePanel from '../components/workspace/QueuePanel';
import BoardPanel from '../components/workspace/BoardPanel';
import MapPanel from '../components/workspace/MapPanel';
import QuickAddBar from '../components/nv/QuickAddBar';
import { useWorkspace, useWorkspaceLayout } from '../state/workspace';
import { useNvPendingSync } from '../hooks/useNvPendingSync';
import { useAddStop } from '../hooks/useDispoMutations';
import { useTours } from '../hooks/useDispoData';
import { api } from '../lib/api';
import type { NvTour, TourGebiet } from '../lib/nvTypes';

interface Banner {
  kind: 'ok' | 'err';
  msg: string;
}

const BANNER_AUTO_CLEAR_MS = 5000;

export default function WorkspacePage() {
  const { mode, setMode, datum, filter, selectedStopId, setSelectedStopId } =
    useWorkspace();
  const { layout, setLayout } = useWorkspaceLayout();

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
  // W-3.2.D NOTE: react-resizable-panels v4 unterscheidet:
  //   onLayoutChange   feuert pro Pointer-Move (= Spam).
  //   onLayoutChanged  feuert NACH Pointer-Release (= 1× pro Resize).
  // Wir nutzen onLayoutChanged → kein zusätzlicher Debounce nötig.
  const onLayoutChanged = (next: Layout) => {
    const total =
      (next.queue ?? 0) + (next.board ?? 0) + (next.map ?? 0);
    if (total <= 0) return;
    // Normalisiert auf 100% (Library liefert relative flexGrow).
    const norm = 100 / total;
    setLayout({
      queueSize: Math.round((next.queue ?? layout.queueSize) * norm),
      boardSize: Math.round((next.board ?? layout.boardSize) * norm),
      mapSize: Math.round((next.map ?? layout.mapSize) * norm),
    });
  };

  // === Coordinator-State =========================================
  const [activeTourViewId, setActiveTourViewId] = useState<string | null>(
    null,
  );
  const [pinAddShipmentId, setPinAddShipmentId] = useState<string | null>(
    null,
  );
  // W-3.2.D Pin→CreateTour-Chain:
  //   pendingPinShipmentId überlebt QuickAddBar-Close + Modal-Open
  //   und wird in BoardPanel.onTourCreated konsumiert.
  //   createTourTrigger ist ein monoton steigender Counter — BoardPanel
  //   öffnet sein CreateTourModal bei jedem Increment.
  const [pendingPinShipmentId, setPendingPinShipmentId] = useState<
    string | null
  >(null);
  const [createTourTrigger, setCreateTourTrigger] = useState(0);
  const [pendingBulk, setPendingBulk] = useState<{
    shipmentIds: string[];
    label: string;
  } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [banner, setBanner] = useState<Banner | null>(null);

  // Auto-clear Banner.
  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(
      () => setBanner(null),
      BANNER_AUTO_CLEAR_MS,
    );
    return () => window.clearTimeout(t);
  }, [banner]);

  // W-3.2.D Layout-Storage Cleanup:
  // W-3.2.C-Zwischenstand setzte kurz autoSaveId="tms.workspace.panels"
  // (vor Removal), wodurch react-resizable-panels intern Keys mit
  // Prefix 'PanelGroup:' schrieb. One-shot Cleanup on-mount entfernt
  // tote Keys, damit Single-Source workspace.layout sauber bleibt.
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

  // Reset Coordinator-State bei Mode-Wechsel.
  const lastModeRef = useRef(mode);
  useEffect(() => {
    if (lastModeRef.current !== mode) {
      setActiveTourViewId(null);
      setPinAddShipmentId(null);
      setPendingPinShipmentId(null);
      setPendingBulk(null);
      setSelected(new Set());
      setSelectedStopId(null); // A' — reset Session-only Selection
      lastModeRef.current = mode;
    }
  }, [mode]);

  // === NV-Pending-Sync (Hook bedingungslos, FV-no-op) =============
  const pendingSync = useNvPendingSync({
    activeTourViewId,
    selectedTourId: null, // Map-Picker-Ziel ist in MapPanel-internal
    mode: filter.pickupMode,
    popupChannel: null, // Panels haben eigene Channels
    setPinAddShipmentId,
    onError: (msg) => setBanner({ kind: 'err', msg }),
  });

  // === Tour-Liste + tour_gebiete für QuickAddBar + MapPanel ========
  const tourenQ = useTours<NvTour>(mode, {
    datum,
    tourStatuses: mode === 'nv' ? filter.tourStatuses : undefined,
    fvStatus: mode === 'fv' ? 'planned,dispatched' : undefined,
  });
  const tourGebieteQ = useQuery<TourGebiet[]>({
    queryKey: ['tour-gebiete'],
    queryFn: async () =>
      (await api.get<TourGebiet[]>('/nv-stamm-touren/gebiete')).data,
    enabled: mode === 'nv',
    staleTime: 5 * 60_000,
  });

  const farbenMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of tourGebieteQ.data ?? []) {
      if (g.farbe) m.set(g.code, g.farbe);
    }
    return m;
  }, [tourGebieteQ.data]);

  // QuickAddBar: NV-Pin-Add-Fallback (User klickt Pin → keine
  // aktive Tour → modal listet alle Touren + neue Tour-Btn).
  const addStopNv = useAddStop();
  const quickAddTouren = useMemo(() => {
    if (mode !== 'nv') return [];
    return (tourenQ.data ?? []).map((t) => ({
      id: t.id,
      nv_stamm_tour: t.nv_stamm_tour ?? null,
      subunternehmer: t.subunternehmer ?? null,
      stops: (t.stops ?? []).map((s) => ({ id: s.id })),
    }));
  }, [tourenQ.data, mode]);

  const closeQuickAdd = () => setPinAddShipmentId(null);
  const onQuickAddPick = (tourId: string) => {
    if (!pinAddShipmentId) return;
    addStopNv.mutate(
      {
        tourId,
        shipmentId: pinAddShipmentId,
        stop_type: filter.pickupMode,
      },
      {
        onSuccess: () => setBanner({ kind: 'ok', msg: 'Sendung hinzugefügt.' }),
        onError: (err: any) =>
          setBanner({
            kind: 'err',
            msg: `Hinzufügen fehlgeschlagen (${err?.response?.status ?? '?'}).`,
          }),
      },
    );
    setPinAddShipmentId(null);
  };
  const onQuickAddCreateNew = () => {
    // W-3.2.D Pin→CreateTour Auto-Chain:
    // Übertrage pinAddShipmentId → pendingPinShipmentId,
    // schließe QuickAddBar, incrementiere Trigger → BoardPanel
    // öffnet CreateTourModal. Nach Tour-Create feuert
    // BoardPanel.onTourCreated → addStop({newId, pendingPin}).
    if (!pinAddShipmentId) return;
    setPendingPinShipmentId(pinAddShipmentId);
    setPinAddShipmentId(null);
    setCreateTourTrigger((n) => n + 1);
  };

  const onTourCreatedByBoard = (newTourId: string) => {
    if (!pendingPinShipmentId) return;
    addStopNv.mutate(
      {
        tourId: newTourId,
        shipmentId: pendingPinShipmentId,
        stop_type: filter.pickupMode,
      },
      {
        onSuccess: () =>
          setBanner({
            kind: 'ok',
            msg: 'Tour erstellt + Sendung zugeordnet.',
          }),
        onError: (err: any) =>
          setBanner({
            kind: 'err',
            msg: `Tour erstellt aber Pin-Add fehlgeschlagen (${err?.response?.status ?? '?'}).`,
          }),
      },
    );
    setPendingPinShipmentId(null);
  };

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
            <QueuePanel
              selected={selected}
              onSelectionChange={setSelected}
              onFvBulkAdd={(ids, label) =>
                setPendingBulk({ shipmentIds: ids, label })
              }
            />
          </Panel>
          <Separator className="w-1 bg-gray-200 hover:bg-blue-300 transition-colors" />
          <Panel id="board" minSize={30} defaultSize={layout.boardSize}>
            <BoardPanel
              activeTourViewId={activeTourViewId}
              onActiveTourChange={setActiveTourViewId}
              pendingBulk={pendingBulk}
              onBulkConsumed={() => setPendingBulk(null)}
              selectedShipmentIds={Array.from(selected)}
              onClearSelection={() => setSelected(new Set())}
              onError={(msg) => setBanner({ kind: 'err', msg })}
              onInfo={(msg) => setBanner({ kind: 'ok', msg })}
              createTourTrigger={createTourTrigger}
              onTourCreated={onTourCreatedByBoard}
            />
          </Panel>
          <Separator className="w-1 bg-gray-200 hover:bg-blue-300 transition-colors" />
          <Panel
            id="map"
            minSize={0}
            defaultSize={layout.mapSize}
            collapsible
            collapsedSize={2}
          >
            <MapPanel
              activeTourViewId={activeTourViewId}
              onPinClick={pendingSync.onPinClick}
              onTourStopClick={pendingSync.onTourStopClick}
              onError={(msg) => setBanner({ kind: 'err', msg })}
              farbenMap={farbenMap}
              selectedStopId={selectedStopId}
              onSelectStop={setSelectedStopId}
            />
          </Panel>
        </Group>
      </div>
    </div>
  );
}
