/**
 * W-3.2.C BoardPanel — Tour-Liste (mode-aware Drop-Target).
 *
 * Branched-Render:
 *   mode='fv' → FvTourCard-Liste + CreateFvTourModal
 *   mode='nv' → TourCard (NV) -Liste + CreateTourModal + Kosten/DrillDown-Modals
 *
 * Drop-Target pro Card konsumiert vereinheitlichtes JSON-Payload
 * ({shipmentIds[], source}) — siehe SCHRITT 2 DnD-Unify.
 *
 * State (page-lokal in Panel):
 *   activeTourViewId (NV-only, Tour-Card-Highlight)
 *   showCreateTour/modalScenario (NV/FV Create-Modal-Open)
 *   kostenTourId, drillDown (NV-Modal-Payloads)
 *   pendingBulk + bulkClaimedRef (FV-Modal-Chain)
 *   popupChannelRef (BroadcastChannel für Pop-out-Invalidate)
 *
 * Mutations: useDispoMutations(mode) + useAddStop (NV-only).
 * Queries:   useTours(mode, filter) + stammTouren (NV-only, für
 *            CreateTourModal).
 *
 * DORMANT: wird in SCHRITT 5 (WorkspacePage) wired. Bestehende
 * NvDispoPage + FvDispoPage konsumieren weiter inline-Code bis
 * SCHRITT 6 Pages → Shells.
 *
 * Cross-Panel-Chains (Pin-Add, Bulk-Add aus QueuePanel) werden in
 * SCHRITT 5 (Modal-Coordinator in WorkspacePage) wired —
 * BoardPanel exposed dafür `pendingBulk` Prop + `setActiveTourViewId`-
 * Callback nach oben.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Sparkles } from 'lucide-react';
import { api } from '../../lib/api';
import { useWorkspace, useWorkspaceFilter } from '../../state/workspace';
import {
  useDispoMutations,
  useAddStop,
  useDeleteStop,
  useAutoSuggest,
} from '../../hooks/useDispoMutations';
import { useTours } from '../../hooks/useDispoData';
import { usePanel } from '../../state/panel';
import TourCard from '../nv/TourCard';
import FvTourCard from '../fv/FvTourCard';
import CreateTourModal, {
  type CreateTourPayload,
} from '../nv/CreateTourModal';
import CreateFvTourModal, {
  type FvCreateTourPayload,
} from '../fv/CreateFvTourModal';
import type { FvScenario } from '../fv/FvQuickAddBar';
import NvTourKostenModal from '../NvTourKostenModal';
import CostDrillDownModal from '../nv/CostDrillDownModal';
import BulkTourPicker from '../nv/BulkTourPicker';
import type { NvTour, StammTour } from '../../lib/nvTypes';
import type { NvTourMutableStatus } from '../../lib/nvTourStatus';

interface FvTourListItem {
  id: string;
  tour_number?: string | null;
  status: string;
  tour_date?: string | null;
  hub_start_address_id?: string | null;
  hub_end_address_id?: string | null;
  subcontractor_id?: string | null;
  subcontractors?: { id: string; name: string } | null;
  shipments?: { id: string }[];
}

export interface BoardPanelProps {
  /** Active-Tour-Highlight Sync nach oben (SCHRITT 5 — Cross-Panel). */
  activeTourViewId?: string | null;
  onActiveTourChange?: (id: string | null) => void;
  /** FV-Bulk-Chain: aus QueuePanel.onFvBulkAdd nach oben gereicht,
   *  dann hier als pendingBulk in BoardPanel → CreateFvTourModal-
   *  open + createMut.onSuccess → batchMut(adds). */
  pendingBulk?: { shipmentIds: string[]; label: string } | null;
  /** Callback wenn CreateFvTourModal pendingBulk konsumiert hat
   *  (Reset oben). */
  onBulkConsumed?: () => void;
  /** Multi-Select-IDs aus QueuePanel — Drop-Target empfängt
   *  Multi-Drag-Payloads über DnD. Bulk-Picker-Btn nutzt sie. */
  selectedShipmentIds?: string[];
  onClearSelection?: () => void;
  /** Error-Reporter (Banner) — Konsument je nach Layer
   *  (SCHRITT 5: WorkspacePage.setBanner). */
  onError?: (msg: string) => void;
  /** Optional success/info reporter. */
  onInfo?: (msg: string) => void;
  /** W-3.2.D: NV-Pin→CreateTour-Chain. WorkspacePage incrementiert
   *  diesen Counter wenn QuickAddBar.onCreateNew getriggert wird.
   *  BoardPanel öffnet dann CreateTourModal. */
  createTourTrigger?: number;
  /** W-3.2.D: Callback nach erfolgreichem Tour-Create. WorkspacePage
   *  hängt addStop({newId, pendingPinShipmentId}) dran. */
  onTourCreated?: (tourId: string) => void;
}

export default function BoardPanel({
  activeTourViewId: activeTourViewIdProp,
  onActiveTourChange,
  pendingBulk,
  onBulkConsumed,
  selectedShipmentIds,
  onClearSelection,
  onError,
  onInfo,
  createTourTrigger,
  onTourCreated,
}: BoardPanelProps) {
  const { mode, datum } = useWorkspace();
  const { filter } = useWorkspaceFilter();
  const qc = useQueryClient();
  const panel = usePanel();

  // === Active-Tour-Highlight (Source-of-Truth optional Prop-lifted) ===
  const [activeTourViewIdLocal, setActiveTourViewIdLocal] = useState<
    string | null
  >(null);
  const activeTourViewId =
    activeTourViewIdProp !== undefined
      ? activeTourViewIdProp
      : activeTourViewIdLocal;
  const setActiveTourViewId = (id: string | null) => {
    if (onActiveTourChange) onActiveTourChange(id);
    else setActiveTourViewIdLocal(id);
  };

  // === BroadcastChannel für Pop-out-Map-Invalidate =================
  const popupChannelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window))
      return;
    const channelName =
      mode === 'fv' ? 'tms-fv-dispo-popup' : 'tms-nv-dispo-popup';
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(channelName);
      popupChannelRef.current = ch;
    } catch {
      /* silent */
    }
    return () => {
      try {
        ch?.close();
      } catch {
        /* noop */
      }
      popupChannelRef.current = null;
    };
  }, [mode]);

  const broadcastInvalidate = () => {
    try {
      popupChannelRef.current?.postMessage({ type: 'invalidate-touren' });
    } catch {
      /* silent */
    }
  };

  // === Touren-Query ================================================
  const tourenQ = useTours<NvTour | FvTourListItem>(mode, {
    datum,
    tourStatuses: mode === 'nv' ? filter.tourStatuses : undefined,
    fvStatus: mode === 'fv' ? 'planned,dispatched' : undefined,
  });
  const touren = tourenQ.data ?? [];

  // === StammTouren (NV-only für CreateTourModal) ====================
  const stammTourenQ = useQuery<StammTour[]>({
    queryKey: ['nv-stamm-touren'],
    queryFn: async () =>
      (await api.get<StammTour[]>('/nv-stamm-touren')).data,
    enabled: mode === 'nv',
    staleTime: 5 * 60_000,
  });

  // === Mutations ====================================================
  const dispo = useDispoMutations(mode);
  const addStopNv = useAddStop();
  const deleteStopNv = useDeleteStop();
  const autoSuggestNv = useAutoSuggest();

  // FV-Create-Tour mit Modal-Chain (createMut → batchMut wenn pendingBulk).
  const bulkClaimedRef = useRef(false);
  const createFvMut = useMutation({
    mutationFn: async (payload: FvCreateTourPayload) => {
      const { data } = await api.post<{ id: string }>('/tours', payload);
      return data;
    },
    onSuccess: (tour) => {
      qc.invalidateQueries({ queryKey: ['fv-touren'] });
      broadcastInvalidate();
      if (
        pendingBulk &&
        pendingBulk.shipmentIds.length > 0 &&
        !bulkClaimedRef.current &&
        tour?.id
      ) {
        bulkClaimedRef.current = true;
        dispo.batchAddStops.mutate({
          tourId: tour.id,
          adds: pendingBulk.shipmentIds,
        });
      }
      setModalScenario(null);
      onBulkConsumed?.();
    },
    onError: (err: any) => {
      onError?.(
        `Tour-Create fehlgeschlagen: ${err?.response?.status ?? '?'}`,
      );
    },
  });

  // === Modal-States (internal, könnte SCHRITT 5 lifted werden) ======
  const [showCreateTour, setShowCreateTour] = useState(false);
  const [modalScenario, setModalScenario] = useState<FvScenario | null>(null);
  const [kostenTourId, setKostenTourId] = useState<string | null>(null);
  const [drillDown, setDrillDown] = useState<{
    shipmentId: string;
    shipmentNumber: string;
    tourId: string;
  } | null>(null);
  const [bulkPickerOpen, setBulkPickerOpen] = useState(false);

  // Auto-open FV-Create-Modal wenn pendingBulk von außen kommt.
  useEffect(() => {
    if (mode !== 'fv') return;
    if (
      pendingBulk &&
      pendingBulk.shipmentIds.length > 0 &&
      !modalScenario
    ) {
      bulkClaimedRef.current = false;
      setModalScenario('OHNE_LAGER');
    }
  }, [pendingBulk, mode, modalScenario]);

  // W-3.2.D: NV-Pin-Chain — Workspace incrementiert createTourTrigger
  // wenn QuickAddBar.onCreateNew geklickt wurde. Hier öffnen wir das
  // NV-CreateTourModal. onTourCreated-Callback feuert addStop.
  const lastTriggerRef = useRef<number>(createTourTrigger ?? 0);
  useEffect(() => {
    if (mode !== 'nv') return;
    if (createTourTrigger == null) return;
    if (createTourTrigger > lastTriggerRef.current) {
      lastTriggerRef.current = createTourTrigger;
      setShowCreateTour(true);
    }
  }, [createTourTrigger, mode]);

  // === Drop-Handlers ================================================
  const dropOnTour = (
    tourId: string,
    shipmentIds: string[],
    _source?: 'list' | 'map',
  ) => {
    if (shipmentIds.length === 0) return;
    if (mode === 'fv') {
      dispo.batchAddStops.mutate(
        { tourId, adds: shipmentIds },
        {
          onSuccess: () => {
            broadcastInvalidate();
            onClearSelection?.();
          },
          onError: (err: any) => {
            onError?.(`Drop fehlgeschlagen (${err?.response?.status ?? '?'}).`);
          },
        },
      );
      return;
    }
    // NV
    if (shipmentIds.length === 1) {
      addStopNv.mutate(
        {
          tourId,
          shipmentId: shipmentIds[0],
          stop_type: filter.pickupMode,
        },
        {
          onSuccess: () => {
            broadcastInvalidate();
          },
          onError: (err: any) => {
            const status = err?.response?.status;
            const code = err?.response?.data?.code;
            if (status === 409 && code === 'CAPACITY_EXCEEDED') {
              const axes = (err.response.data?.would_exceed ?? [])
                .map((w: any) => `${w.axis} (${w.total}/${w.max})`)
                .join(', ');
              onError?.(
                `Kapazität überschritten: ${axes || 'unbekannt'}`,
              );
            } else {
              onError?.(
                `Hinzufügen fehlgeschlagen (${status ?? '?'}).`,
              );
            }
          },
        },
      );
      return;
    }
    // NV bulk: Promise.allSettled (mirror NvDispoPage.dropBulkOnTour)
    void (async () => {
      const results = await Promise.allSettled(
        shipmentIds.map((shipmentId) =>
          api.post(`/nv-touren/${tourId}/stops`, {
            shipment_id: shipmentId,
            stop_type: filter.pickupMode,
          }),
        ),
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      onClearSelection?.();
      dispo.invalidate();
      broadcastInvalidate();
      if (failed.length === 0) {
        onInfo?.(`${ok} Sendung(en) hinzugefügt.`);
      } else {
        const first = failed[0]?.reason;
        const status = first?.response?.status;
        const code = first?.response?.data?.code;
        const msg =
          status === 409 && code === 'CAPACITY_EXCEEDED'
            ? `${ok} hinzugefügt, ${failed.length} blockiert (Kapazität).`
            : `${ok} hinzugefügt, ${failed.length} fehlgeschlagen.`;
        onError?.(msg);
      }
    })();
  };

  const moveStopNv = (tour: NvTour, idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= tour.stops.length) return;
    const a = tour.stops[idx];
    const b = tour.stops[target];
    dispo.reorderStops.mutate({
      tourId: tour.id,
      items: [
        { id: a.id, position: b.position },
        { id: b.id, position: a.position },
      ],
    });
  };

  // === Filter-Touren NV (gebiet) =====================================
  const filteredTouren = useMemo<(NvTour | FvTourListItem)[]>(() => {
    if (mode !== 'nv' || !filter.gebiet) return touren;
    return (touren as NvTour[]).filter(
      (t) => t.nv_stamm_tour?.nv_tour_gebiet?.id === filter.gebiet,
    );
  }, [touren, mode, filter.gebiet]);

  const sortedFvTouren = useMemo(() => {
    if (mode !== 'fv') return [];
    return [...(touren as FvTourListItem[])].sort((a, b) =>
      (a.tour_number ?? '').localeCompare(b.tour_number ?? ''),
    );
  }, [touren, mode]);

  // === Auto-Vorschlag (NV-only) ======================================
  const runAutoSuggest = () => {
    if (
      !confirm(
        `Stamm-Kunden für ${datum} automatisch zu Touren zuordnen?`,
      )
    )
      return;
    autoSuggestNv.mutate(
      { datum, mode: filter.pickupMode },
      {
        onSuccess: (res) => {
          const skippedCap = (res.details ?? []).reduce(
            (s, d) => s + (d.stops_skipped_capacity ?? 0),
            0,
          );
          const tooBig = res.stops_skipped_too_big ?? 0;
          const newTours = res.new_tours_created ?? 0;
          const baseTours = res.touren_created_template ?? res.touren_created;
          const hasIssues = skippedCap > 0 || tooBig > 0;
          const parts: string[] = [];
          parts.push(
            newTours > 0
              ? `${baseTours} Tour(en) erstellt (${newTours} neu wegen Kapazität)`
              : `${baseTours} Tour(en) erstellt`,
          );
          parts.push(`${res.stops_added} Stop(s) hinzugefügt`);
          if (skippedCap > 0)
            parts.push(`${skippedCap} blockiert (Kapazität)`);
          if (tooBig > 0) parts.push(`${tooBig} zu groß (übersprungen)`);
          if (hasIssues) onError?.(parts.join(' · ') + '.');
          else onInfo?.(parts.join(' · ') + '.');
          broadcastInvalidate();
        },
        onError: (err: any) => {
          onError?.(
            `Auto-Vorschlag fehlgeschlagen: ${err?.response?.status ?? '?'}`,
          );
        },
      },
    );
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Board-Toolbar */}
      <div className="bg-white border-b px-4 py-2 flex items-center gap-2">
        <h2 className="font-semibold text-sm">
          {mode === 'nv' ? 'NV-Touren' : 'FV-Touren'} {datum} (
          {filteredTouren.length})
        </h2>
        {mode === 'nv' && (
          <button
            onClick={runAutoSuggest}
            disabled={autoSuggestNv.isPending}
            className="ml-auto bg-emerald-600 text-white text-sm rounded px-3 py-1.5 flex items-center gap-1 hover:bg-emerald-700 disabled:opacity-50"
          >
            <Sparkles size={14} />
            {autoSuggestNv.isPending ? 'Erstelle…' : 'Auto-Vorschlag'}
          </button>
        )}
        <button
          onClick={() => {
            if (mode === 'fv') {
              bulkClaimedRef.current = false;
              setModalScenario('OHNE_LAGER');
            } else {
              setShowCreateTour(true);
            }
          }}
          className={`${mode === 'fv' ? 'ml-auto' : ''} bg-blue-600 text-white text-sm rounded px-3 py-1.5 flex items-center gap-1 hover:bg-blue-700`}
        >
          <Plus size={14} />
          Tour anlegen
        </button>
        {(selectedShipmentIds?.length ?? 0) > 0 && (
          <button
            onClick={() => setBulkPickerOpen(true)}
            className="bg-indigo-600 text-white text-sm rounded px-3 py-1.5"
          >
            → {selectedShipmentIds?.length} in Tour droppen
          </button>
        )}
      </div>

      {/* Touren-Liste */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
        {tourenQ.isLoading && (
          <div className="p-4 text-sm text-gray-500">Lade Touren…</div>
        )}
        {!tourenQ.isLoading && filteredTouren.length === 0 && (
          <div className="p-4 text-sm text-gray-500">
            Keine Touren für {datum}.
          </div>
        )}

        {mode === 'nv' &&
          (filteredTouren as NvTour[]).map((tour) => (
            <TourCard
              key={tour.id}
              tour={tour}
              onDrop={(ids, source) => dropOnTour(tour.id, ids, source)}
              onMoveStop={(idx, dir) => moveStopNv(tour, idx, dir)}
              onDeleteStop={(stopId) =>
                deleteStopNv.mutate({ tourId: tour.id, stopId })
              }
              onDeleteTour={() => {
                if (confirm('Tour löschen?'))
                  dispo.deleteTour.mutate(tour.id);
              }}
              onOpenKosten={() => setKostenTourId(tour.id)}
              onOpenDetail={(shipmentId) => panel.selectShipment(shipmentId)}
              onToggleTourView={() =>
                setActiveTourViewId(
                  activeTourViewId === tour.id ? null : tour.id,
                )
              }
              isActive={activeTourViewId === tour.id}
              onOpenDrillDown={(shipmentId, shipmentNumber) =>
                setDrillDown({
                  shipmentId,
                  shipmentNumber,
                  tourId: tour.id,
                })
              }
              onSetTourStatus={(status: NvTourMutableStatus, openCount) => {
                if (status === 'COMPLETED' && openCount > 0) {
                  if (
                    !confirm(
                      `Tour abschließen? ${openCount} offene Stop(s).`,
                    )
                  )
                    return;
                }
                dispo.updateTourStatus.mutate({
                  tourId: tour.id,
                  status,
                });
              }}
            />
          ))}

        {mode === 'fv' &&
          sortedFvTouren.map((t) => (
            <FvTourCard
              key={t.id}
              tourId={t.id}
              tourNumber={t.tour_number}
              status={t.status}
              onDropShipment={(tourId, shipmentId) =>
                dropOnTour(tourId, [shipmentId])
              }
              onRemoveStop={(tourId, shipmentId) =>
                dispo.batchAddStops.mutate({
                  tourId,
                  removes: [shipmentId],
                })
              }
            />
          ))}
      </div>

      {/* Modals */}
      {showCreateTour && mode === 'nv' && (
        <CreateTourModal
          stammTouren={stammTourenQ.data ?? []}
          onClose={() => setShowCreateTour(false)}
          onCreate={(payload: CreateTourPayload) => {
            void (async () => {
              const created = await dispo.createTour.mutateAsync({
                payload: payload as unknown as Record<string, unknown>,
              });
              setShowCreateTour(false);
              broadcastInvalidate();
              // W-3.2.D Pin-Chain: WorkspacePage hängt addStop dran.
              if (created?.id) onTourCreated?.(created.id);
            })();
          }}
          saving={dispo.createTour.isPending}
        />
      )}
      {modalScenario && mode === 'fv' && (
        <CreateFvTourModal
          scenario={modalScenario}
          initialDate={datum}
          initialShipmentIds={pendingBulk?.shipmentIds}
          initialLabel={pendingBulk?.label}
          onClose={() => {
            setModalScenario(null);
            onBulkConsumed?.();
          }}
          onCreate={(payload) => createFvMut.mutate(payload)}
          saving={createFvMut.isPending}
        />
      )}
      {kostenTourId && (() => {
        const t = (touren as NvTour[]).find((x) => x.id === kostenTourId);
        if (!t) return null;
        return (
          <NvTourKostenModal
            tour={t as any}
            onClose={() => setKostenTourId(null)}
          />
        );
      })()}
      {drillDown && (
        <CostDrillDownModal
          shipmentId={drillDown.shipmentId}
          shipmentNumber={drillDown.shipmentNumber}
          tourId={drillDown.tourId}
          onClose={() => setDrillDown(null)}
        />
      )}
      {bulkPickerOpen && selectedShipmentIds && selectedShipmentIds.length > 0 && (
        <BulkTourPicker
          touren={filteredTouren as NvTour[]}
          onClose={() => setBulkPickerOpen(false)}
          onPicked={(tourId: string) => {
            setBulkPickerOpen(false);
            dropOnTour(tourId, selectedShipmentIds);
          }}
          title={`${selectedShipmentIds.length} Sendung(en) in Tour`}
        />
      )}
    </div>
  );
}
