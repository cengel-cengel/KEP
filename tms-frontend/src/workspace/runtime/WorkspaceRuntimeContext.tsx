/**
 * S-1 WorkspaceRuntimeContext — Panel-übergreifender Runtime-State.
 *
 * Sammelt alles, was vorher als Local-useState in WorkspacePage.tsx
 * lebte und per Prop-Drill an die 3 Panels (Queue/Board/Map) ging:
 *   - 7 Selection-/Coordinator-State-Felder
 *   - die 4 komplexen Multi-State-Callbacks (closeQuickAdd,
 *     onQuickAddPick, onQuickAddCreateNew, onTourCreatedByBoard,
 *     onMapDrop)
 *   - useNvPendingSync + useAddStop + tour-gebiete-Query + Tours-
 *     Liste (für QuickAddBar) — werden von den Callbacks gebraucht
 *   - render-derived: farbenMap, quickAddTouren, selectedShipmentIds
 *   - Mode-Reset + Banner-Auto-Clear-Effects
 *
 * BLEIBT in workspace.tsx/panel.tsx:
 *   - mode, datum, filter, layout (workspace)
 *   - selectedStopId+Setter (workspace, Session-only)
 *   - entity (panel)
 *
 * Provider-Mount: in WorkspacePage.tsx, INNERHALB workspace.tsx +
 * panel.tsx (kommt durch main.tsx-Tree zustande). Beim Page-Switch
 * unmountet der Provider → Runtime-State weg. Identisch zu vorher.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useWorkspace } from '../../state/workspace';
import { useNvPendingSync } from '../../hooks/useNvPendingSync';
import { useAddStop } from '../../hooks/useDispoMutations';
import { useTours } from '../../hooks/useDispoData';
import type { NvTour, TourGebiet } from '../../lib/nvTypes';

export interface Banner {
  kind: 'ok' | 'err';
  msg: string;
}

interface PendingBulk {
  shipmentIds: string[];
  label: string;
}

interface QuickAddTour {
  id: string;
  nv_stamm_tour: NvTour['nv_stamm_tour'] | null;
  subunternehmer: NvTour['subunternehmer'] | null;
  stops: { id: string }[];
}

interface WorkspaceRuntimeValue {
  // === Coordinator-State ===
  activeTourViewId: string | null;
  setActiveTourViewId: (id: string | null) => void;
  pinAddShipmentId: string | null;
  setPinAddShipmentId: (id: string | null) => void;
  pendingBulk: PendingBulk | null;
  setPendingBulk: (b: PendingBulk | null) => void;
  selected: Set<string>;
  setSelected: (next: Set<string>) => void;
  selectedShipmentIds: string[];
  banner: Banner | null;
  setBanner: (b: Banner | null) => void;
  createTourTrigger: number;

  // === Render-derived ===
  farbenMap: Map<string, string>;
  quickAddTouren: QuickAddTour[];

  // === Pending-Sync (NV-only via Hook) ===
  onPinClick: (shipmentId: string) => void;
  onTourStopClick: (stopId: string) => void;

  // === Komplex-Callbacks (mehrere States kombiniert) ===
  closeQuickAdd: () => void;
  onQuickAddPick: (tourId: string) => void;
  onQuickAddCreateNew: () => void;
  onTourCreatedByBoard: (newTourId: string) => void;
  onBulkConsumed: () => void;
  onClearSelection: () => void;
  onError: (msg: string) => void;
  onInfo: (msg: string) => void;
  onMapDrop: (ids: string[], source?: 'list' | 'map') => void;

  // === Convenience-Setter (Wrapper) ===
  onFvBulkAdd: (ids: string[], label: string) => void;
}

const WorkspaceRuntimeContext =
  createContext<WorkspaceRuntimeValue | null>(null);

const BANNER_AUTO_CLEAR_MS = 5000;

export function WorkspaceRuntimeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { mode, datum, filter, setSelectedStopId } = useWorkspace();

  // === Local-States (vorher in WorkspacePage Z.86-106) ===
  const [activeTourViewId, setActiveTourViewId] = useState<string | null>(
    null,
  );
  const [pinAddShipmentId, setPinAddShipmentId] = useState<string | null>(
    null,
  );
  const [pendingPinShipmentId, setPendingPinShipmentId] = useState<
    string | null
  >(null);
  const [createTourTrigger, setCreateTourTrigger] = useState(0);
  const [pendingBulk, setPendingBulk] = useState<PendingBulk | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [banner, setBanner] = useState<Banner | null>(null);

  // === Auto-clear Banner ===
  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(
      () => setBanner(null),
      BANNER_AUTO_CLEAR_MS,
    );
    return () => window.clearTimeout(t);
  }, [banner]);

  // === Mode-Reset (vorher in WorkspacePage useEffect[mode]) ===
  const lastModeRef = useRef(mode);
  useEffect(() => {
    if (lastModeRef.current !== mode) {
      setActiveTourViewId(null);
      setPinAddShipmentId(null);
      setPendingPinShipmentId(null);
      setPendingBulk(null);
      setSelected(new Set());
      setSelectedStopId(null);
      lastModeRef.current = mode;
    }
  }, [mode, setSelectedStopId]);

  // === Hooks (vorher in WorkspacePage) ===
  const pendingSync = useNvPendingSync({
    activeTourViewId,
    selectedTourId: null,
    mode: filter.pickupMode,
    popupChannel: null,
    setPinAddShipmentId,
    onError: useCallback(
      (msg: string) => setBanner({ kind: 'err', msg }),
      [],
    ),
  });

  const addStopNv = useAddStop();

  const tourenQ = useTours<NvTour>(mode, {
    datum,
    tourStatuses: mode === 'nv' ? filter.tourStatuses : undefined,
    fvStatus: mode === 'fv' ? 'planned,dispatched' : undefined,
  });

  const tourGebieteQ = useQuery<TourGebiet[]>({
    queryKey: ['tour-gebiete'],
    queryFn: async () =>
      (await api.get<TourGebiet[]>('/nv-tour-gebiete')).data,
    enabled: mode === 'nv',
    staleTime: 5 * 60_000,
  });

  // === Render-derived (Memos) ===
  const farbenMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of tourGebieteQ.data ?? []) {
      if (g.farbe) m.set(g.code, g.farbe);
    }
    return m;
  }, [tourGebieteQ.data]);

  const quickAddTouren = useMemo<QuickAddTour[]>(() => {
    if (mode !== 'nv') return [];
    return (tourenQ.data ?? []).map((t) => ({
      id: t.id,
      nv_stamm_tour: t.nv_stamm_tour ?? null,
      subunternehmer: t.subunternehmer ?? null,
      stops: (t.stops ?? []).map((s) => ({ id: s.id })),
    }));
  }, [tourenQ.data, mode]);

  const selectedShipmentIds = useMemo(
    () => Array.from(selected),
    [selected],
  );

  // === Convenience-Setter ===
  const onFvBulkAdd = useCallback(
    (ids: string[], label: string) =>
      setPendingBulk({ shipmentIds: ids, label }),
    [],
  );
  const onBulkConsumed = useCallback(() => setPendingBulk(null), []);
  const onClearSelection = useCallback(() => setSelected(new Set()), []);
  const onError = useCallback(
    (msg: string) => setBanner({ kind: 'err', msg }),
    [],
  );
  const onInfo = useCallback(
    (msg: string) => setBanner({ kind: 'ok', msg }),
    [],
  );

  // === Komplex-Callbacks (mehrere States) ===
  const closeQuickAdd = useCallback(
    () => setPinAddShipmentId(null),
    [],
  );

  const onQuickAddPick = useCallback(
    (tourId: string) => {
      if (!pinAddShipmentId) return;
      addStopNv.mutate(
        {
          tourId,
          shipmentId: pinAddShipmentId,
          stop_type: filter.pickupMode,
        },
        {
          onSuccess: () =>
            setBanner({ kind: 'ok', msg: 'Sendung hinzugefügt.' }),
          onError: (err: any) =>
            setBanner({
              kind: 'err',
              msg: `Hinzufügen fehlgeschlagen (${err?.response?.status ?? '?'}).`,
            }),
        },
      );
      setPinAddShipmentId(null);
    },
    [pinAddShipmentId, addStopNv, filter.pickupMode],
  );

  const onQuickAddCreateNew = useCallback(() => {
    if (!pinAddShipmentId) return;
    setPendingPinShipmentId(pinAddShipmentId);
    setPinAddShipmentId(null);
    setCreateTourTrigger((n) => n + 1);
  }, [pinAddShipmentId]);

  const onTourCreatedByBoard = useCallback(
    (newTourId: string) => {
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
    },
    [pendingPinShipmentId, addStopNv, filter.pickupMode],
  );

  const onMapDrop = useCallback(
    (ids: string[], _source?: 'list' | 'map') => {
      if (mode !== 'nv') return;
      if (activeTourViewId && ids.length > 0) {
        for (const sid of ids) {
          addStopNv.mutate({
            tourId: activeTourViewId,
            shipmentId: sid,
            stop_type: filter.pickupMode,
          });
        }
        return;
      }
      if (ids.length > 0) setPinAddShipmentId(ids[0]);
    },
    [mode, activeTourViewId, addStopNv, filter.pickupMode],
  );

  const value = useMemo<WorkspaceRuntimeValue>(
    () => ({
      activeTourViewId,
      setActiveTourViewId,
      pinAddShipmentId,
      setPinAddShipmentId,
      pendingBulk,
      setPendingBulk,
      selected,
      setSelected,
      selectedShipmentIds,
      banner,
      setBanner,
      createTourTrigger,
      farbenMap,
      quickAddTouren,
      onPinClick: pendingSync.onPinClick,
      onTourStopClick: pendingSync.onTourStopClick,
      closeQuickAdd,
      onQuickAddPick,
      onQuickAddCreateNew,
      onTourCreatedByBoard,
      onBulkConsumed,
      onClearSelection,
      onError,
      onInfo,
      onMapDrop,
      onFvBulkAdd,
    }),
    [
      activeTourViewId,
      pinAddShipmentId,
      pendingBulk,
      selected,
      selectedShipmentIds,
      banner,
      createTourTrigger,
      farbenMap,
      quickAddTouren,
      pendingSync.onPinClick,
      pendingSync.onTourStopClick,
      closeQuickAdd,
      onQuickAddPick,
      onQuickAddCreateNew,
      onTourCreatedByBoard,
      onBulkConsumed,
      onClearSelection,
      onError,
      onInfo,
      onMapDrop,
      onFvBulkAdd,
    ],
  );

  return (
    <WorkspaceRuntimeContext.Provider value={value}>
      {children}
    </WorkspaceRuntimeContext.Provider>
  );
}

export function useWorkspaceRuntime(): WorkspaceRuntimeValue {
  const ctx = useContext(WorkspaceRuntimeContext);
  if (!ctx) {
    throw new Error(
      'useWorkspaceRuntime must be used within WorkspaceRuntimeProvider',
    );
  }
  return ctx;
}
