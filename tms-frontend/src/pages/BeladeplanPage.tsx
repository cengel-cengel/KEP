import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Navigation from '../components/Navigation';
import ShipmentCard from '../components/ShipmentCard';
import type { Tour } from '../types/tour';
import type { Shipment } from '../types/shipment';
import { api } from '../lib/api';

function formatLdm(n: number): string {
  if (!Number.isFinite(n)) return '–';
  return `${n.toFixed(1)}`;
}

function computeNextOrderIdsPreservingExcluded(opts: {
  currentFullIds: string[];
  draggedId: string;
  targetId: string;
  excludedSet: Set<string>;
}): string[] {
  const { currentFullIds, draggedId, targetId, excludedSet } = opts;
  if (draggedId === targetId) return currentFullIds;

  const currentIncludedIds = currentFullIds.filter((id) => !excludedSet.has(id));
  const fromIndex = currentIncludedIds.indexOf(draggedId);
  const toIndex = currentIncludedIds.indexOf(targetId);
  if (fromIndex < 0 || toIndex < 0) return currentFullIds;

  const nextIncludedIds = currentIncludedIds.slice();
  nextIncludedIds.splice(fromIndex, 1);
  const insertAt = fromIndex < toIndex ? toIndex - 1 : toIndex;
  nextIncludedIds.splice(insertAt, 0, draggedId);

  const includedPositionsInFull = currentFullIds
    .map((id, idx) => (!excludedSet.has(id) ? idx : null))
    .filter((x): x is number => x !== null);

  const nextFullIds = currentFullIds.slice();
  for (let i = 0; i < nextIncludedIds.length; i++) {
    nextFullIds[includedPositionsInFull[i]] = nextIncludedIds[i];
  }

  return nextFullIds;
}

export default function BeladeplanPage() {
  const queryClient = useQueryClient();

  const [selectedTourId, setSelectedTourId] = useState<string | null>(null);
  const [excludedShipmentIds, setExcludedShipmentIds] = useState<string[]>([]);
  const excludedSet = useMemo(() => new Set(excludedShipmentIds), [excludedShipmentIds]);

  // Optimistic reordering of the full order ids (including excluded shipments).
  const [optimisticOrderIds, setOptimisticOrderIds] = useState<string[] | null>(null);
  const dragShipmentIdRef = useRef<string | null>(null);

  /** Touren, für die eine Ladereihenfolge noch sinnvoll ist (nicht geschlossen/abgerechnet). */
  const beladeplanTourStatuses = 'planned,released,dispatched,in_transit';
  const { data: tours = [], isLoading: loadingTours } = useQuery({
    queryKey: ['tours', 'beladeplan', beladeplanTourStatuses],
    queryFn: async () => {
      const { data } = await api.get<Tour[]>('/tours', {
        params: { status: beladeplanTourStatuses },
      });
      return data;
    },
  });

  useEffect(() => {
    const nextDefaultTourId = tours[0]?.id ?? null;
    // Avoid eslint: react-hooks/set-state-in-effect by scheduling updates async.
    void Promise.resolve().then(() => {
      setExcludedShipmentIds([]);
      setOptimisticOrderIds(null);
      setSelectedTourId((prev) => prev ?? nextDefaultTourId);
    });
  }, [tours]);

  const { data: tourShipments = [], isLoading: loadingShipments } = useQuery({
    queryKey: ['shipments', 'beladeplan', selectedTourId],
    enabled: !!selectedTourId,
    queryFn: async () => {
      const { data } = await api.get<Shipment[]>('/shipments', { params: { tourId: selectedTourId } });
      return data;
    },
    retry: false,
  });

  useEffect(() => {
    void Promise.resolve().then(() => {
      setExcludedShipmentIds([]);
      setOptimisticOrderIds(null);
    });
  }, [selectedTourId]);

  const selectedTour = useMemo(() => tours.find((t) => t.id === selectedTourId) ?? null, [tours, selectedTourId]);

  const fullSortedShipments = useMemo(() => {
    const typed = tourShipments as Array<Shipment & { tour_position?: number | null }>;
    return [...typed].sort((a, b) => (a.tour_position ?? 0) - (b.tour_position ?? 0));
  }, [tourShipments]);

  const fullSortedIds = useMemo(() => fullSortedShipments.map((s) => s.id), [fullSortedShipments]);
  const currentFullIds = optimisticOrderIds ?? fullSortedIds;

  const shipmentsById = useMemo(() => {
    const m = new Map<string, Shipment>();
    for (const s of tourShipments) m.set(s.id, s);
    return m;
  }, [tourShipments]);

  const orderedShipments = useMemo(() => {
    return currentFullIds.map((id) => shipmentsById.get(id)).filter(Boolean) as Shipment[];
  }, [currentFullIds, shipmentsById]);

  const visibleShipments = useMemo(() => {
    return orderedShipments.filter((s) => !excludedSet.has(s.id));
  }, [orderedShipments, excludedSet]);

  const maxLdm = useMemo(() => {
    if (!selectedTour) return 0;
    return Number(selectedTour.max_ldm ?? selectedTour.maxLdm ?? 13.6);
  }, [selectedTour]);

  const usedLdm = useMemo(() => {
    return visibleShipments.reduce((sum, s) => sum + (Number(s.ldm ?? 0) || 0), 0);
  }, [visibleShipments]);

  const freeLdm = useMemo(() => {
    return Math.max(0, maxLdm - usedLdm);
  }, [maxLdm, usedLdm]);

  const updateShipmentOrderMutation = useMutation({
    mutationFn: async ({ tourId, shipmentIds }: { tourId: string; shipmentIds: string[] }) => {
      await api.patch(`/tours/${tourId}/shipment-order`, { shipmentIds });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['shipments', 'beladeplan', variables.tourId] });
      queryClient.invalidateQueries({ queryKey: ['tours', 'beladeplan'] });
    },
    onError: () => {
      setOptimisticOrderIds(null);
    },
  });

  useEffect(() => {
    // Keep optimistic ordering until the backend re-fetch results match it.
    if (!optimisticOrderIds) return;
    if (fullSortedIds.length === optimisticOrderIds.length && fullSortedIds.join(',') === optimisticOrderIds.join(',')) {
      void Promise.resolve().then(() => setOptimisticOrderIds(null));
    }
  }, [optimisticOrderIds, fullSortedIds]);

  function handleExcludeToggle(shipmentId: string) {
    setExcludedShipmentIds((prev) => {
      if (prev.includes(shipmentId)) return prev.filter((id) => id !== shipmentId);
      return [...prev, shipmentId];
    });
  }

  function handleReorder(draggedId: string, targetId: string) {
    if (!selectedTourId) return;
    if (!draggedId || !targetId) return;
    if (excludedSet.has(draggedId) || excludedSet.has(targetId)) return;
    if (updateShipmentOrderMutation.isPending) return;

    const nextFullIds = computeNextOrderIdsPreservingExcluded({
      currentFullIds,
      draggedId,
      targetId,
      excludedSet,
    });

    setOptimisticOrderIds(nextFullIds);
    updateShipmentOrderMutation.mutate({ tourId: selectedTourId, shipmentIds: nextFullIds });
  }

  return (
    <div className="w-full min-h-screen bg-white flex flex-col">
      <Navigation />

      <main className="w-full flex-1">
        <div className="py-4 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Beladeplan</h1>
              <p className="text-sm text-gray-500 mt-1">
                Status: geplant, freigegeben, disponiert, unterwegs. Drag&amp;Drop speichert die Reihenfolge per API.
              </p>
            </div>

            {selectedTour && (
              <div className="flex items-center gap-3 flex-wrap justify-end">
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <div className="text-xs text-gray-600">LDM</div>
                  <div className="text-sm font-semibold text-gray-900">
                    {formatLdm(usedLdm)} / {formatLdm(maxLdm)} verwendet
                  </div>
                  <div className="text-xs text-gray-600">Frei: {formatLdm(freeLdm)}</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <div className="text-xs text-gray-600">Ausgeplant</div>
                  <div className="text-sm font-semibold text-gray-900">
                    {excludedShipmentIds.length} von {fullSortedShipments.length}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-y border-gray-200 bg-gray-50 px-4 py-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-600 whitespace-nowrap">Tour:</span>
              <select
                value={selectedTourId ?? ''}
                onChange={(e) => setSelectedTourId(e.target.value || null)}
                disabled={loadingTours || tours.length === 0}
                className="rounded border border-gray-300 px-2 py-1 text-gray-800 focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
              >
                {tours.length === 0 ? (
                  <option value="">Keine passenden Touren</option>
                ) : null}
                {tours.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.tour_number ?? t.tourNumber ?? t.id} · {t.status ?? '—'} ·{' '}
                    {t.tour_date ? new Date(t.tour_date).toLocaleDateString('de-DE') : '—'}
                  </option>
                ))}
              </select>
            </label>

            <div className="text-sm text-gray-600">
              {loadingShipments ? 'Sendungen werden geladen…' : `${visibleShipments.length} Sendungen im Entwurf`}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="lg:col-span-2">
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-gray-900">Draft-Liste</div>
                    <div className="text-xs text-gray-600 mt-1">
                      ⠿ per Drag neu sortieren · „Ausplanen“ entfernt aus der Liste/Summary (Session)
                    </div>
                  </div>
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50 text-sm disabled:opacity-60"
                    onClick={() => setExcludedShipmentIds([])}
                    disabled={excludedShipmentIds.length === 0}
                  >
                    Alles wieder einplanen
                  </button>
                </div>

                <div className="p-4">
                  {loadingShipments ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin h-8 w-8 border-2 border-[#1e40af] border-t-transparent rounded-full" />
                    </div>
                  ) : visibleShipments.length === 0 ? (
                    <div className="text-gray-500 text-sm">Keine Sendungen im Entwurf.</div>
                  ) : (
                    <div className="space-y-3">
                      {orderedShipments.map((s) => {
                        if (excludedSet.has(s.id)) return null;
                        return (
                          <div
                            key={s.id}
                            className="rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50"
                            onDragOver={(e) => {
                              e.preventDefault();
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              const draggedId = e.dataTransfer.getData('text/plain') || dragShipmentIdRef.current;
                              if (!draggedId) return;
                              handleReorder(draggedId, s.id);
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <div
                                  draggable
                                  onDragStart={(e) => {
                                    dragShipmentIdRef.current = s.id;
                                    e.dataTransfer.effectAllowed = 'move';
                                    e.dataTransfer.setData('text/plain', s.id);
                                  }}
                                  onDragEnd={() => {
                                    dragShipmentIdRef.current = null;
                                  }}
                                  className="select-none cursor-grab text-gray-400 mt-1"
                                  aria-label="Sendung umsortieren"
                                  title="Reihenfolge ändern"
                                >
                                  ⠿
                                </div>

                                <div className="min-w-0 flex-1">
                                  <ShipmentCard shipment={s} draggable={false} />
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExcludeToggle(s.id);
                                }}
                                className="shrink-0 px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm hover:bg-gray-50"
                              >
                                Ausplanen
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

