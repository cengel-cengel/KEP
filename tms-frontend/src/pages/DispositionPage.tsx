import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Navigation from '../components/Navigation';
import ShipmentCard from '../components/ShipmentCard';
import TourCard from '../components/TourCard';
import DispositionMap from '../components/DispositionMap';
import type { SubcontractorOption } from '../components/TourCard';

type PricingSubConditionRow = {
  id: string;
  subcontractor_id: string;
  condition_type: string;
  relations?: { code?: string } | null;
  rate_flat?: unknown;
  rate_per_ldm?: unknown;
  rate_per_kg?: unknown;
  rate_per_km?: unknown;
};

function labelMainCarriageCondition(c: PricingSubConditionRow): string {
  const rel = c.relations?.code ?? 'Alle Rel.';
  if (c.rate_flat != null && Number(c.rate_flat) > 0) return `${rel} · Pauschal ${c.rate_flat} €`;
  if (c.rate_per_ldm != null && Number(c.rate_per_ldm) > 0) return `${rel} · ${c.rate_per_ldm} €/ldm`;
  if (c.rate_per_kg != null && Number(c.rate_per_kg) > 0) return `${rel} · ${c.rate_per_kg} €/kg`;
  if (c.rate_per_km != null && Number(c.rate_per_km) > 0) return `${rel} · ${c.rate_per_km} €/km`;
  return `${rel} · Kondition`;
}
import { api } from '../lib/api';
import { computeStackingLdmMetrics, type StackingLdmMetrics } from '../lib/loadingLdm';
import type { Shipment } from '../types/shipment';
import type { ShipmentMapItem } from '../types/shipment';
import type { Tour } from '../types/tour';
import ShipmentCostCard from '../components/ShipmentCostCard';

const TRANSPORT_TYPE_OPTIONS = [
  { value: '', label: 'Alle' },
  { value: 'DIREKT', label: 'Direktsendung' },
  { value: 'DIREKT_UMSCHLAG', label: 'Direkt+Umschlag' },
  { value: 'SAMMELGUT', label: 'Sammelgut' },
  { value: 'ABHOLUNG_UMSCHLAG', label: 'Abholung+Umschlag' },
  { value: 'BEILADER', label: 'Beilader' },
  { value: 'SONDER', label: 'Sonderfahrt' },
  { value: 'SELBST', label: 'Selbstanlieferung' },
] as const;

const STATUS_OPTIONS = [
  { value: '', label: 'Alle' },
  { value: 'new', label: 'Neu' },
  { value: 'dispatched', label: 'Disponiert' },
  { value: 'in_transit', label: 'Unterwegs' },
  { value: 'delivered', label: 'Zugestellt' },
] as const;

function buildShipmentParams(filters: {
  transportType: string;
  status: string;
  search: string;
  tourId?: string | null;
}) {
  const params: Record<string, string> = {};
  if (filters.tourId !== undefined) params.tourId = filters.tourId === null ? 'null' : filters.tourId;
  if (filters.transportType) params.transportType = filters.transportType;
  if (filters.status) params.status = filters.status;
  if (filters.search.trim()) params.search = filters.search.trim();
  return params;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'new':
      return 'bg-gray-100 text-gray-800';
    case 'dispatched':
      return 'bg-blue-100 text-blue-800';
    case 'in_transit':
      return 'bg-orange-100 text-orange-800';
    case 'delivered':
      return 'bg-green-100 text-green-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function formatTimeHHmm(value: unknown): string {
  if (value == null || value === '') return '–';
  try {
    const d = new Date(value as any);
    if (Number.isNaN(d.getTime())) return '–';
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '–';
  }
}

function formatTimeWindow(from: unknown, to: unknown): string {
  const f = formatTimeHHmm(from);
  const t = formatTimeHHmm(to);
  if (f === '–' && t === '–') return '–';
  return `${f} - ${t}`;
}

function formatAddressLine(addr: any): string {
  if (!addr) return '–';
  const name = addr.name ?? '–';
  const city = addr.city ?? '';
  const country = addr.countryCode ?? addr.country_code ?? '';
  return [name, city, country].filter(Boolean).join(', ');
}

/** Antwort von GET /loading/tour/:id/optimize (nur für LDM/Stapel-Badge) */
type LoadingOptimizeBrief = {
  recommendedVehicle?: { type?: string; maxLdm?: number };
  loadingOrder?: Array<{ ldm?: number; isStackable?: boolean }>;
};

export default function DispositionPage() {
  const queryClient = useQueryClient();
  const [filterTransportType, setFilterTransportType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const [selectedTourId, setSelectedTourId] = useState<string | null>(null);
  const [tourTotalDistanceKm, setTourTotalDistanceKm] = useState<number | null>(null);
  const [tourShipmentDistancesKmById, setTourShipmentDistancesKmById] = useState<
    Record<string, number | null>
  >({});
  const [tourRouteRefreshKey, setTourRouteRefreshKey] = useState(0);
  const col1Width = 25;
  const col2Width = 25;

  const listFilters = useMemo(
    () => ({
      transportType: filterTransportType,
      status: filterStatus,
      search: filterSearch,
    }),
    [filterTransportType, filterStatus, filterSearch],
  );

  const { data: undispatched = [], isLoading: loadingShipments } = useQuery({
    queryKey: ['shipments', 'tourId', 'null', listFilters.transportType, listFilters.status, listFilters.search],
    queryFn: async () => {
      const { data } = await api.get<Shipment[]>('/shipments', {
        params: buildShipmentParams({ ...listFilters, tourId: null }),
      });
      return data;
    },
  });

  const deliveryCount = useMemo(() => {
    return undispatched.reduce((acc, s) => {
      const city =
        s.deliveryAddress?.city ??
        (s as unknown as { delivery_city?: string }).delivery_city ??
        s.addresses_shipments_delivery_address_idToaddresses?.city ??
        '';
      if (!city) return acc;
      acc[city] = (acc[city] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [undispatched]);

  const { data: tours = [], isLoading: loadingTours } = useQuery({
    queryKey: ['tours'],
    queryFn: async () => {
      const { data } = await api.get<Tour[]>('/tours', { params: { status: 'planned' } });
      return data;
    },
  });

  const { data: loadingBriefByTourId = {} } = useQuery({
    queryKey: ['loading', 'tour-optimize-brief', tours.map((t) => t.id).sort().join(',')],
    enabled: tours.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        tours.map(async (t) => {
          try {
            const { data } = await api.get<LoadingOptimizeBrief>(`/loading/tour/${t.id}/optimize`);
            const maxLdm = Number(data.recommendedVehicle?.maxLdm) || 13.6;
            const inputs = (data.loadingOrder ?? []).map((row) => ({
              ldm: row.ldm,
              isStackable: row.isStackable,
            }));
            const stackingLdm: StackingLdmMetrics = computeStackingLdmMetrics(maxLdm, inputs);
            return [
              t.id,
              {
                vehicleType: data.recommendedVehicle?.type ?? null,
                stackingLdm,
              },
            ] as const;
          } catch {
            return [t.id, { vehicleType: null as string | null, stackingLdm: null }] as const;
          }
        }),
      );
      return Object.fromEntries(entries) as Record<
        string,
        { vehicleType: string | null; stackingLdm: StackingLdmMetrics | null }
      >;
    },
  });

  const selectedTour = useMemo(
    () => (selectedTourId ? tours.find((t) => t.id === selectedTourId) ?? null : null),
    [selectedTourId, tours],
  );

  const { data: tourShipments = [], isLoading: loadingTourShipments } = useQuery({
    queryKey: [
      'shipments',
      'tourId',
      selectedTourId,
      listFilters.transportType,
      listFilters.status,
      listFilters.search,
    ],
    enabled: !!selectedTourId,
    queryFn: async () => {
      const { data } = await api.get<Shipment[]>('/shipments', {
        params: buildShipmentParams({ ...listFilters, tourId: selectedTourId }),
      });
      return data;
    },
  });

  const { data: mapShipments = [], isLoading: loadingMap } = useQuery({
    queryKey: ['shipments-map', listFilters.transportType, listFilters.status, listFilters.search],
    queryFn: async () => {
      const { data } = await api.get<ShipmentMapItem[]>('/shipments/map', {
        params: buildShipmentParams(listFilters),
      });
      return data;
    },
  });

  const {
    data: selectedShipmentCosts,
    isLoading: loadingSelectedShipmentCosts,
    error: selectedShipmentCostsError,
  } = useQuery({
    queryKey: ['shipment-costs', selectedShipmentId],
    enabled: !!selectedShipmentId,
    queryFn: async () => {
      const { data } = await api.get(`/costs/shipment/${selectedShipmentId}/calculate`);
      return data;
    },
  });

  const { data: subcontractors = [] } = useQuery({
    queryKey: ['subcontractors'],
    queryFn: async () => {
      const { data } = await api.get<SubcontractorOption[]>('/subcontractors');
      return data;
    },
  });

  const { data: pricingSubConditions = [] } = useQuery({
    queryKey: ['pricing', 'sub-conditions'],
    queryFn: async () => {
      const { data } = await api.get<PricingSubConditionRow[]>('/pricing/sub-conditions');
      return data;
    },
  });

  const assignSubConditionMutation = useMutation({
    mutationFn: async ({ tourId, conditionId }: { tourId: string; conditionId: string }) => {
      await api.post(`/pricing/tours/${tourId}/assign-condition`, { conditionId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tours'] });
    },
  });

  const updateTourMutation = useMutation({
    mutationFn: async ({
      tourId,
      plannedCost,
      subcontractorId,
    }: {
      tourId: string;
      plannedCost?: number;
      subcontractorId?: string | null;
    }) => {
      const body: { plannedCost?: number; subcontractorId?: string | null } = {};
      if (plannedCost !== undefined) body.plannedCost = plannedCost;
      if (subcontractorId !== undefined) body.subcontractorId = subcontractorId;
      await api.patch(`/tours/${tourId}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tours'] });
    },
  });

  const dispatchMutation = useMutation({
    mutationFn: async ({ shipmentId, tourId }: { shipmentId: string; tourId: string }) => {
      await api.post(`/shipments/${shipmentId}/dispatch`, { tourId });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Disposition fehlgeschlagen';
      window.alert(msg);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['tours'] });
      queryClient.invalidateQueries({ queryKey: ['loading', 'tour-optimize-brief'] });
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['tours'] }),
        queryClient.refetchQueries({ queryKey: ['shipments'] }),
      ]);
    },
  });

  const createTourMutation = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await api.post('/tours', { tourDate: today });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tours'] });
      queryClient.invalidateQueries({ queryKey: ['loading', 'tour-optimize-brief'] });
    },
  });

  const releaseMutation = useMutation({
    mutationFn: async (tourId: string) => {
      await api.post(`/tours/${tourId}/release`);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Freigabe fehlgeschlagen';
      window.alert(msg);
    },
    onSuccess: async (_data, tourId) => {
      queryClient.invalidateQueries({ queryKey: ['tours'] });
      window.open(`/api/documents/loading-list/${tourId}`, '_blank');
    },
  });

  function handleDrop(shipmentId: string, tourId: string) {
    dispatchMutation.mutate({ shipmentId, tourId });
  }

  function handleSaveCost(tourId: string, cost: number) {
    updateTourMutation.mutate({ tourId, plannedCost: cost });
  }

  function handleAssignSubcontractor(tourId: string, subcontractorId: string) {
    updateTourMutation.mutate({ tourId, subcontractorId });
  }

  function handleAssignMainCarriageCondition(tourId: string, conditionId: string) {
    assignSubConditionMutation.mutate({ tourId, conditionId });
  }

  function handleListShipmentClick(shipmentId: string) {
    setSelectedShipmentId(shipmentId);
  }

  function handleReleaseTour(tourId: string) {
    if (releaseMutation.isPending) return;
    if (updateShipmentOrderMutation.isPending) return;
    // UX: ensure the tour detail column is visible while user confirms.
    if (selectedTourId !== tourId) setSelectedTourId(tourId);

    requestAnimationFrame(() => {
      const ok = window.confirm('Tour freigeben? Beladeplan wird gedruckt.');
      if (!ok) return;
      releaseMutation.mutate(tourId);
    });
  }

  const updateShipmentOrderMutation = useMutation({
    mutationFn: async ({ tourId, shipmentIds }: { tourId: string; shipmentIds: string[] }) => {
      await api.patch(`/tours/${tourId}/shipment-order`, { shipmentIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['tours'] });
      queryClient.invalidateQueries({ queryKey: ['shipments-map'] });
      queryClient.invalidateQueries({ queryKey: ['loading', 'tour-optimize-brief'] });
      setTourRouteRefreshKey((k) => k + 1);
    },
  });

  const removeShipmentFromTourMutation = useMutation({
    mutationFn: async ({ tourId, shipmentId }: { tourId: string; shipmentId: string }) => {
      await api.post(`/tours/${tourId}/remove-shipment`, { shipmentId });
    },
    onSuccess: () => {
      if (selectedShipmentId) setSelectedShipmentId(null);
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['tours'] });
      queryClient.invalidateQueries({ queryKey: ['shipments-map'] });
      queryClient.invalidateQueries({ queryKey: ['loading', 'tour-optimize-brief'] });
      if (selectedTourId) setTourRouteRefreshKey((k) => k + 1);
    },
  });

  const dragShipmentIdRef = useRef<string | null>(null);

  const sortedTourShipments = useMemo(() => {
    return [...tourShipments].sort((a: any, b: any) => (a.tour_position ?? 0) - (b.tour_position ?? 0));
  }, [tourShipments]);

  function updateOrderFromDrag(draggedId: string, targetId: string) {
    if (!selectedTourId) return;
    if (draggedId === targetId) return;

    const currentIds = sortedTourShipments.map((s: any) => s.id);
    const next = currentIds.filter((id) => id !== draggedId);
    const insertAt = next.indexOf(targetId);
    if (insertAt < 0) return;
    next.splice(insertAt, 0, draggedId);

    updateShipmentOrderMutation.mutate({ tourId: selectedTourId, shipmentIds: next });
  }

  return (
    <div className="w-full min-h-screen bg-white flex flex-col">
      <Navigation />

      <main className="w-full flex-1 flex flex-col">
        <div className="py-4">
          <h1 className="text-2xl font-semibold text-gray-900 pl-4 sm:pl-6">Disposition</h1>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 border-y border-gray-200 bg-gray-50 px-4 py-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-gray-600 whitespace-nowrap">Transportart:</span>
            <select
              value={filterTransportType}
              onChange={(e) => setFilterTransportType(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-gray-800 focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
            >
              {TRANSPORT_TYPE_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-gray-600 whitespace-nowrap">Status:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-gray-800 focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm flex-1 min-w-[200px]">
            <span className="text-gray-600 whitespace-nowrap">Suche:</span>
            <input
              type="text"
              placeholder="Sendungsnummer, Kunde, PLZ…"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-gray-800 placeholder-gray-400 focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
            />
          </label>
        </div>

        <div style={{ display: 'flex', width: '100%', height: 'calc(100vh - 140px)', position: 'relative' }}>
          {/* Column 1: Undispatched */}
          <div
            style={{ width: `${col1Width}%`, height: '100%', overflow: 'hidden' }}
            className="border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-0"
          >
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h2 className="font-medium text-gray-900">Nicht disponiert</h2>
              <p className="text-sm text-gray-500">
                Sendungen ohne Tour ({undispatched.length}) – per Drag auf eine Tour ziehen
              </p>
            </div>
            <div className="p-4 flex-1 min-h-0 overflow-y-auto space-y-2">
              {loadingShipments ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin h-8 w-8 border-2 border-[#1e40af] border-t-transparent rounded-full" />
                </div>
              ) : undispatched.length === 0 ? (
                <p className="text-gray-500 text-sm">Keine Sendungen ohne Tour.</p>
              ) : (
                undispatched.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => handleListShipmentClick(s.id)}
                    className={`rounded-lg border transition-colors cursor-pointer ${
                      selectedShipmentId === s.id
                        ? 'border-[#1e40af] bg-yellow-100'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex flex-col gap-1">
                      {(() => {
                        const city =
                          s.deliveryAddress?.city ??
                          s.addresses_shipments_delivery_address_idToaddresses?.city ??
                          (s as unknown as { delivery_city?: string }).delivery_city ??
                          '';
                        const count = deliveryCount[city] ?? 0;
                        return city && count > 1 ? (
                          <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full">
                            {count}x {city}
                          </span>
                        ) : null;
                      })()}
                      <ShipmentCard shipment={s} draggable />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Divider between col1 and col2 */}
          <div
            style={{ width: '4px', background: '#e5e7eb' }}
          />

          {/* Column 2: Tours */}
          <div
            style={{
              width: `${col2Width}%`,
              height: '100%',
              overflow: 'hidden',
            }}
            className="border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-0"
          >
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-medium text-gray-900">Touren</h2>
                <p className="text-sm text-gray-500">{tours.length} Touren – Sendungen hier ablegen</p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => createTourMutation.mutate()}
                  disabled={createTourMutation.isPending}
                  className="px-3 py-2 bg-[#1e40af] text-white text-sm font-medium rounded-lg hover:bg-[#1e3a8a] disabled:opacity-50"
                >
                  {createTourMutation.isPending ? 'Wird erstellt…' : 'Neue Tour'}
                </button>
              </div>
            </div>
            <div className="p-4 flex-1 min-h-0 overflow-y-auto space-y-3">
              {loadingTours ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin h-8 w-8 border-2 border-[#1e40af] border-t-transparent rounded-full" />
                </div>
              ) : tours.length === 0 ? (
                <p className="text-gray-500 text-sm">Keine Touren vorhanden. „Neue Tour“ anlegen.</p>
              ) : (
                tours.map((tour) => {
                  const sid =
                    tour.subcontractor_id ??
                    (tour as Tour & { subcontractors?: { id?: string } | null }).subcontractors?.id ??
                    null;
                  const mainOpts = sid
                    ? pricingSubConditions
                        .filter((c) => c.subcontractor_id === sid && c.condition_type === 'MAIN_CARRIAGE')
                        .map((c) => ({ id: c.id, label: labelMainCarriageCondition(c) }))
                    : [];
                  return (
                  <TourCard
                    key={tour.id}
                    tour={tour}
                    selected={selectedTourId === tour.id}
                    recommendedVehicleType={loadingBriefByTourId[tour.id]?.vehicleType ?? null}
                    stackingLdm={loadingBriefByTourId[tour.id]?.stackingLdm ?? null}
                    releaseBlockingLockCount={tour.releaseBlockingLockCount ?? 0}
                    onClick={() => setSelectedTourId((t) => (t === tour.id ? null : tour.id))}
                    onDrop={(shipmentId) => handleDrop(shipmentId, tour.id)}
                    subcontractors={subcontractors}
                    onSaveCost={handleSaveCost}
                    onAssignSubcontractor={handleAssignSubcontractor}
                    mainCarriageConditions={mainOpts}
                    onAssignMainCarriageCondition={handleAssignMainCarriageCondition}
                    onRelease={handleReleaseTour}
                    onOpenLoadingPlan={(tourId) =>
                      window.open(`/loading/${tourId}`, '_blank')
                    }
                  />
                  );
                })
              )}
            </div>
          </div>

          {/* Divider between col2 and col3 (detail) */}
          {selectedTourId && <div style={{ width: '4px', background: '#e5e7eb' }} />}

          {/* Column 3: Sendungsdetails der Tour */}
          {selectedTourId && (
            <div
              style={{
                width: '20%',
                height: '100%',
                overflow: 'hidden',
              }}
              className="border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-0"
            >
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-medium text-gray-900 truncate">
                    Tour {selectedTour?.tour_number ?? '—'} – {loadingTourShipments ? '…' : sortedTourShipments.length} Sendungen
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">Details zu den Tour-Sendungen</p>
                  {tourTotalDistanceKm != null && (
                    <div className="mt-1 text-xs text-gray-700">
                      Gesamtstrecke (OSRM, mit Stops): {tourTotalDistanceKm.toFixed(1)} km
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTourId(null)}
                  className="shrink-0 px-2 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700"
                  aria-label="Tour-Detail schließen"
                >
                  ✕
                </button>
              </div>

              <div className="p-3 h-full overflow-y-auto">
                {loadingTourShipments ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin h-8 w-8 border-2 border-[#1e40af] border-t-transparent rounded-full" />
                  </div>
                ) : sortedTourShipments.length === 0 ? (
                  <div className="text-sm text-gray-500">Keine Sendungen für diese Tour.</div>
                ) : (
                  <div className="space-y-3">
                    {sortedTourShipments.map((s) => {
                      const row = s as any;
                      const shipmentNumber = row.shipment_number ?? row.shipmentNumber ?? '–';
                      const customerName = row.customers?.name ?? row.customer?.name ?? '–';
                      const loadingAddr =
                        row.addresses_shipments_loading_address_idToaddresses ?? row.loadingAddress;
                      const deliveryAddr =
                        row.addresses_shipments_delivery_address_idToaddresses ?? row.deliveryAddress;
                      const packageCount = row.package_count ?? row.packageCount;
                      const packageType = row.package_type ?? row.packageType;
                      const weightKg = row.weight_kg ?? row.weightKg;
                      const driverHint = row.customer_note ?? row.customerNote ?? '–';
                      const deliveryWindow = formatTimeWindow(
                        row.delivery_time_from ?? row.deliveryTimeFrom,
                        row.delivery_time_to ?? row.deliveryTimeTo,
                      );
                      const customerRef = row.customer_ref ?? row.customerRef ?? '–';
                      const badge = statusBadgeClass(row.status);
                      const isSelected = selectedShipmentId === s.id;

                      return (
                        <div
                          key={s.id}
                          onClick={() => setSelectedShipmentId(s.id)}
                        draggable
                          onDragOver={(e) => e.preventDefault()}
                        onDragStart={(e) => {
                          dragShipmentIdRef.current = s.id;
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', s.id);
                        }}
                        onDragEnd={() => {
                          dragShipmentIdRef.current = null;
                        }}
                          onDrop={(e) => {
                            e.preventDefault();
                          const draggedId = e.dataTransfer.getData('text/plain') || dragShipmentIdRef.current;
                            if (!draggedId) return;
                            updateOrderFromDrag(draggedId, s.id);
                          }}
                          className={`rounded-lg border p-3 cursor-pointer ${
                            isSelected
                              ? 'border-[#1e40af] bg-blue-50'
                              : 'border-gray-200 bg-white hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div
                                  className="select-none cursor-grab text-gray-400 mt-0.5"
                                  aria-label="Sendung umsortieren"
                                  title="Reihenfolge ändern"
                                >
                                  ⠿
                                </div>
                                <div className="font-semibold text-gray-900 truncate">
                                  {shipmentNumber}
                                </div>
                              </div>
                              <div
                                className="text-sm text-gray-600 mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis"
                                title={`Auftraggeber: ${customerName}`}
                              >
                                Auftraggeber: {customerName}{' '}
                                <span className="text-gray-500">· Gewicht:</span>{' '}
                                {weightKg != null ? `${weightKg} kg` : '–'}{' '}
                                <span className="text-gray-500">· LDM:</span>{' '}
                                {row.ldm != null ? `${row.ldm}` : '–'}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${badge}`}
                              >
                                {row.status}
                              </span>
                              <button
                                type="button"
                                draggable={false}
                                className="shrink-0 px-2 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700"
                                aria-label="Sendung aus Tour entfernen"
                                onMouseDown={(e) => {
                                  // Prevent drag initiation from the draggable parent.
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (!selectedTourId) return;
                                  removeShipmentFromTourMutation.mutate({
                                    tourId: selectedTourId,
                                    shipmentId: s.id,
                                  });
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          <div className="mt-2 space-y-1 text-xs text-gray-700">
                            <div>
                              <span className="font-medium text-gray-900">Absender:</span>{' '}
                              {formatAddressLine(loadingAddr)}
                            </div>
                            <div>
                              <span className="font-medium text-gray-900">Empfänger:</span>{' '}
                              {formatAddressLine(deliveryAddr)}
                            </div>
                            <div>
                              <span className="font-medium text-gray-900">Menge+Art:</span>{' '}
                              {packageCount != null ? packageCount : '–'} {packageType ?? ''}
                            </div>
                            {/* Gewicht & LDM stehen in einer Zeile oben */}
                            <div>
                              <span className="font-medium text-gray-900">OSRM km (Lade→Entlade):</span>{' '}
                              {tourShipmentDistancesKmById[s.id] != null
                                ? `${(tourShipmentDistancesKmById[s.id] as number).toFixed(1)} km`
                                : '–'}
                            </div>
                            <div>
                              <span className="font-medium text-gray-900">Hinweis Fahrer:</span>{' '}
                              {driverHint}
                            </div>
                            <div>
                              <span className="font-medium text-gray-900">Zustellzeitfenster:</span>{' '}
                              {deliveryWindow}
                            </div>
                            <div>
                              <span className="font-medium text-gray-900">Kundenref:</span>{' '}
                              {customerRef}
                            </div>
                          </div>

                          {isSelected && selectedShipmentCosts && (
                            <div className="mt-3">
                              <ShipmentCostCard
                                breakdown={selectedShipmentCosts}
                                title={
                                  loadingSelectedShipmentCosts
                                    ? 'Kosten…'
                                    : 'Kostenaufschlüsselung'
                                }
                              />
                            </div>
                          )}
                          {isSelected && !selectedShipmentCosts && selectedShipmentCostsError && (
                            <div className="mt-3 text-xs text-red-600">
                              Kosten konnten nicht berechnet werden.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Divider between col3 and col4 (map) */}
          {selectedTourId && <div style={{ width: '4px', background: '#e5e7eb' }} />}

          {/* Column 4: Karte (sticky) */}
          <div
            style={{
              width: selectedTourId
                ? `${100 - col1Width - col2Width - 20}%`
                : `${100 - col1Width - col2Width}%`,
              position: 'sticky',
              top: 0,
              height: '100%',
              overflow: 'hidden',
            }}
            className="border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-0"
          >
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-medium text-gray-900">Karte</h2>
                <p className="text-sm text-gray-500">Pins & Tour-Route (Alternativen)</p>
              </div>
            </div>
            <div className="p-4 flex-1 min-h-0">
              {loadingMap ? (
                <div className="h-full flex items-center justify-center bg-gray-100 rounded-lg">
                  <div className="animate-spin h-10 w-10 border-2 border-[#1e40af] border-t-transparent rounded-full" />
                </div>
              ) : (
                <DispositionMap
                  shipments={mapShipments}
                  selectedId={selectedShipmentId}
                  tours={tours}
                  selectedTourId={selectedTourId}
                  onSelect={(id) => setSelectedShipmentId(id)}
                    onTourRouteDistances={(data) => {
                      setTourTotalDistanceKm(data.totalDistanceKm);
                      setTourShipmentDistancesKmById(data.shipmentDistancesKmById);
                    }}
                    tourRouteRefreshKey={tourRouteRefreshKey}
                />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
