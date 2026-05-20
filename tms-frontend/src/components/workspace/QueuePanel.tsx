/**
 * W-3.2.C QueuePanel — Eligible-Shipments-Liste (mode-aware).
 *
 * Branched-Render:
 *   mode='fv' → FvShipmentTree (existing)
 *   mode='nv' → NvEligibleTree (W-3.2.C extract)
 *
 * State (page-lokal):
 *   selected: Set<string>       Multi-Select (NV-Mode)
 *   expandedGroup: string|null  Collapse-State (NV-Mode)
 *   draggingId: string|null     DnD-Ghost
 *   lastClickedRef              Shift-Click Range-Anchor
 *
 * DnD-Source: 'application/json' { shipmentIds[], source }
 * (vereinheitlicht, FV+NV gleicher Payload nach W-3.2.C).
 *
 * Konsumiert FilterBar oben, useEligibleShipments für Daten.
 *
 * DORMANT: wird in SCHRITT 5 (WorkspacePage) wired. NvDispoPage +
 * FvDispoPage konsumieren die alte inline-Rendering weiter, bis
 * SCHRITT 6 Pages → Shells.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useWorkspace, useWorkspaceFilter } from '../../state/workspace';
import { useEligibleShipments } from '../../hooks/useDispoData';
import { usePanel } from '../../state/panel';
import FilterBar from './FilterBar';
import NvEligibleTree from '../nv/NvEligibleTree';
import FvShipmentTree, {
  type FvTreeShipment,
} from '../fv/FvShipmentTree';
import type { EligibleShipment, TourGebiet } from '../../lib/nvTypes';

const STORAGE_KEY_EXPANDED = 'tms.workspace.queue.expanded';

function loadExpanded(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_KEY_EXPANDED);
  } catch {
    return null;
  }
}

function saveExpanded(v: string | null) {
  try {
    if (v == null) localStorage.removeItem(STORAGE_KEY_EXPANDED);
    else localStorage.setItem(STORAGE_KEY_EXPANDED, v);
  } catch {
    /* noop */
  }
}

export interface QueuePanelProps {
  /** Optional Override für eligible-Daten (z.B. SSR/Tests). */
  shipmentsOverride?: EligibleShipment[] | FvTreeShipment[];
  /** Callback wenn QueuePanel im FV-Mode "+ Alle in neue Tour"
   *  triggert (Bulk-Add für eine Relation-Group). */
  onFvBulkAdd?: (shipmentIds: string[], label: string) => void;
  /** Controlled-Selection (für Cross-Panel-Bulk in WorkspacePage).
   *  Wenn undefined: internal state. */
  selected?: Set<string>;
  onSelectionChange?: (next: Set<string>) => void;
}

export default function QueuePanel({
  shipmentsOverride,
  onFvBulkAdd,
  selected: selectedProp,
  onSelectionChange,
}: QueuePanelProps) {
  const { mode, datum } = useWorkspace();
  const { filter } = useWorkspaceFilter();
  const panel = usePanel();

  // tour_gebiete für FilterBar (NV-only; FV ignoriert).
  const tourGebieteQ = useQuery<TourGebiet[]>({
    queryKey: ['tour-gebiete'],
    queryFn: async () =>
      (await api.get<TourGebiet[]>('/nv-stamm-touren/gebiete')).data,
    enabled: mode === 'nv',
    staleTime: 5 * 60_000,
  });

  // Eligible-Shipments-Query (mode-aware via Hook).
  const eligQ = useEligibleShipments<EligibleShipment | FvTreeShipment>(
    mode,
    {
      datum,
      search: filter.search,
      pickupMode: mode === 'nv' ? filter.pickupMode : undefined,
    },
  );
  const eligible = (shipmentsOverride ?? eligQ.data ?? []) as
    | EligibleShipment[]
    | FvTreeShipment[];

  // === Multi-Select: controlled wenn Props vorhanden, sonst internal ===
  const [selectedLocal, setSelectedLocal] = useState<Set<string>>(new Set());
  const selected = selectedProp ?? selectedLocal;
  const setSelected = (next: Set<string>) => {
    if (onSelectionChange) onSelectionChange(next);
    else setSelectedLocal(next);
  };
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const lastClickedRef = useRef<string | null>(null);

  // Flatten visible-ids für Shift-Click-Range.
  const flatVisibleIds = useMemo<string[]>(() => {
    if (mode === 'nv') {
      // NV: nach groupedElig-Sortierung.
      const groups = new Map<string, EligibleShipment[]>();
      for (const s of eligible as EligibleShipment[]) {
        const key = s.matched_tour_gebiet_code ?? '— ohne Zuordnung —';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(s);
      }
      const sorted = [...groups.entries()].sort(([a], [b]) =>
        a.localeCompare(b),
      );
      return sorted.flatMap(([, items]) => items.map((s) => s.id));
    }
    // FV: Reihenfolge wie geliefert.
    return (eligible as FvTreeShipment[]).map((s) => s.id);
  }, [eligible, mode]);

  const handleSelect = useCallback(
    (id: string, shiftKey: boolean) => {
      if (shiftKey && lastClickedRef.current) {
        const startIdx = flatVisibleIds.indexOf(lastClickedRef.current);
        const endIdx = flatVisibleIds.indexOf(id);
        if (startIdx >= 0 && endIdx >= 0) {
          const [from, to] = [
            Math.min(startIdx, endIdx),
            Math.max(startIdx, endIdx),
          ];
          const range = flatVisibleIds.slice(from, to + 1);
          const next = new Set(selected);
          for (const r of range) next.add(r);
          setSelected(next);
          return;
        }
      }
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelected(next);
      lastClickedRef.current = id;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flatVisibleIds, selected],
  );

  // Clear selection wenn pickupMode wechselt (NV-Mode-Switch
  // ändert eligible-Liste komplett).
  useEffect(() => {
    setSelected(new Set());
    lastClickedRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.pickupMode]);

  // S-2: Global Esc → clear-selection (skip wenn focus in
  // input/textarea/contenteditable).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (e.target as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }
      if (selected.size === 0) return;
      setSelected(new Set());
      lastClickedRef.current = null;
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // === Group-Collapse (NV-Mode) ==================================
  const [expandedGroup, setExpandedGroup] = useState<string | null>(
    loadExpanded,
  );
  const toggleGroup = useCallback((key: string) => {
    setExpandedGroup((prev) => {
      const next = prev === key ? null : key;
      saveExpanded(next);
      return next;
    });
  }, []);

  // === farbenMap (Group-Color-Stripe) ============================
  const farbenMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of tourGebieteQ.data ?? []) {
      if (g.farbe) m.set(g.code, g.farbe);
    }
    return m;
  }, [tourGebieteQ.data]);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <FilterBar tourGebiete={tourGebieteQ.data} />

      {selected.size > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center gap-2 text-sm">
          <span>{selected.size} Sendung(en) ausgewählt</span>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-gray-600 hover:text-gray-800"
          >
            Auswahl leeren
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {eligQ.isLoading && (
          <div className="p-4 text-sm text-gray-500">Lade Sendungen…</div>
        )}
        {!eligQ.isLoading && mode === 'nv' && (
          <NvEligibleTree
            shipments={eligible as EligibleShipment[]}
            farbenMap={farbenMap}
            expandedGroup={expandedGroup}
            onToggleGroup={toggleGroup}
            selected={selected}
            draggingId={draggingId}
            setDraggingId={setDraggingId}
            onSelect={handleSelect}
            onOpenDetail={(id) => panel.selectShipment(id)}
            storageKeyPrefix="workspace-queue"
          />
        )}
        {!eligQ.isLoading && mode === 'fv' && (
          <FvShipmentTree
            shipments={eligible as FvTreeShipment[]}
            onBulkAdd={(ids, label) => onFvBulkAdd?.(ids, label)}
          />
        )}
      </div>
    </div>
  );
}
