import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
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

// ---- Country/Relation helpers (Disposition-Hierarchie) ----
const COUNTRY_NAMES: Record<string, string> = {
  DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz', FR: 'Frankreich',
  IT: 'Italien', ES: 'Spanien', GB: 'Großbritannien', UK: 'Großbritannien',
  NL: 'Niederlande', BE: 'Belgien', PL: 'Polen', CZ: 'Tschechien',
  DK: 'Dänemark', SE: 'Schweden', NO: 'Norwegen', FI: 'Finnland',
  PT: 'Portugal', IE: 'Irland', LU: 'Luxemburg', HU: 'Ungarn',
  RO: 'Rumänien', SK: 'Slowakei', SI: 'Slowenien', HR: 'Kroatien',
};

function flagFor(code?: string): string {
  const c = (code || '').toUpperCase();
  if (c.length !== 2) return '🌐';
  const base = 0x1f1e6 - 'A'.charCodeAt(0);
  return String.fromCodePoint(c.charCodeAt(0) + base, c.charCodeAt(1) + base);
}

function countryLabel(code?: string): string {
  const c = (code || '').toUpperCase() || 'XX';
  return `${flagFor(c)} ${c} – ${COUNTRY_NAMES[c] ?? 'Unbekannt'}`;
}

function normCity(s?: string | null): string {
  return (s || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Backend liefert Adressen unter dem langen Prisma-Relations-Namen
// (addresses_shipments_*_idToaddresses). Die camelCase-Aliase
// (loadingAddress/deliveryAddress) sind gleichbedeutend, werden aber
// nicht in jedem Endpoint befuellt. Fallback-Chain wie in
// ShipmentCard/ClearancePage/ShipmentsPage.
function loadingCity(s: Shipment): string {
  const a = s.loadingAddress ?? s.addresses_shipments_loading_address_idToaddresses;
  return normCity(a?.city) || 'UNBEKANNT';
}
function deliveryCity(s: Shipment): string {
  const a = s.deliveryAddress ?? s.addresses_shipments_delivery_address_idToaddresses;
  return normCity(a?.city) || 'UNBEKANNT';
}
function deliveryCountry(s: Shipment): string {
  const a = s.deliveryAddress ?? s.addresses_shipments_delivery_address_idToaddresses;
  const cc = (a as { country_code?: string } | null | undefined)?.country_code;
  return (cc || 'XX').toUpperCase();
}

interface AxisGroup {
  // Origin → Destination Sub-Bucket innerhalb von "keine Relation"
  key: string;
  origin: string;
  destination: string;
  items: Shipment[];
  totalLdm: number;
}
interface RelationGroup {
  // Bucket auf Relation-Ebene unterhalb Country.
  // - kind='relation': echte Relation (code+name)
  // - kind='none':     ungemappte Sendungen, mit subAxes
  kind: 'relation' | 'none';
  key: string;
  label: string;
  items: Shipment[];
  totalLdm: number;
  subAxes: AxisGroup[];
}
interface CountryGroup {
  code: string;
  items: Shipment[];
  totalLdm: number;
  relations: RelationGroup[];
}

function relationCode(s: Shipment): string | null {
  return s.relation?.code ?? null;
}
function relationLabel(s: Shipment): string {
  if (!s.relation) return '(keine Relation)';
  const name = s.relation.name ?? '';
  return name ? `${s.relation.code} – ${name}` : s.relation.code;
}

function groupShipments(items: Shipment[]): CountryGroup[] {
  // 1) nach Country gruppieren, darin nach relation.code
  //    (oder 'NONE' fuer ungemappte) — letztere bekommen
  //    zusaetzlich Origin→Dest sub-axes.
  const byCountry = new Map<string, Map<string, RelationGroup>>();
  for (const s of items) {
    const cc = deliveryCountry(s);
    const rcode = relationCode(s);
    const rk = rcode ?? 'NONE';
    let rels = byCountry.get(cc);
    if (!rels) { rels = new Map(); byCountry.set(cc, rels); }
    let g = rels.get(rk);
    if (!g) {
      g = {
        kind: rcode ? 'relation' : 'none',
        key: rk,
        label: relationLabel(s),
        items: [],
        totalLdm: 0,
        subAxes: [],
      };
      rels.set(rk, g);
    }
    g.items.push(s);
    g.totalLdm += Number(s.ldm ?? 0);
    if (g.kind === 'none') {
      const axisKey = `${loadingCity(s)} → ${deliveryCity(s)}`;
      let a = g.subAxes.find((x) => x.key === axisKey);
      if (!a) {
        a = {
          key: axisKey,
          origin: loadingCity(s),
          destination: deliveryCity(s),
          items: [],
          totalLdm: 0,
        };
        g.subAxes.push(a);
      }
      a.items.push(s);
      a.totalLdm += Number(s.ldm ?? 0);
    }
  }
  const out: CountryGroup[] = [];
  for (const [cc, rels] of byCountry) {
    const relations = [...rels.values()].sort((a, b) => b.items.length - a.items.length);
    for (const r of relations) {
      r.subAxes.sort((a, b) => b.items.length - a.items.length);
    }
    const items = relations.flatMap((r) => r.items);
    const totalLdm = relations.reduce((s, r) => s + r.totalLdm, 0);
    out.push({ code: cc, items, totalLdm, relations });
  }
  out.sort((a, b) => b.items.length - a.items.length);
  return out;
}

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
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());
  const [expandedRelations, setExpandedRelations] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [tourDetailDragOver, setTourDetailDragOver] = useState(false);
  const [undispatchedDragOver, setUndispatchedDragOver] = useState(false);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [searchParams, setSearchParams] = useSearchParams();

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function setGroupSelected(items: Shipment[], select: boolean) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      for (const s of items) {
        if (select) n.add(s.id);
        else n.delete(s.id);
      }
      return n;
    });
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }
  function groupSelectionState(items: Shipment[]): 'none' | 'some' | 'all' {
    if (items.length === 0) return 'none';
    let n = 0;
    for (const s of items) if (selectedIds.has(s.id)) n++;
    if (n === 0) return 'none';
    if (n === items.length) return 'all';
    return 'some';
  }
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

  // Focus-Logik aus URL-Param ?focus=<id> (von Karten-Disposition)
  useEffect(() => {
    const focusId = searchParams.get('focus');
    if (!focusId || undispatched.length === 0) return;
    const target = undispatched.find((s) => s.id === focusId);
    if (!target) return;
    // Country + Relation expandieren
    const cc = (
      (target as { addresses_shipments_delivery_address_idToaddresses?: { country_code?: string } })
        .addresses_shipments_delivery_address_idToaddresses?.country_code ??
      target.deliveryAddress?.country_code ??
      'XX'
    ).toUpperCase();
    const relCode = target.relation?.code ?? 'NONE';
    setExpandedCountries((prev) => new Set(prev).add(cc));
    setExpandedRelations((prev) => new Set(prev).add(`${cc}::${relCode}`));
    setHighlightedId(focusId);
    // Scroll nach kurzem Delay (Render abwarten)
    const t1 = setTimeout(() => {
      const el = cardRefs.current.get(focusId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
    // Highlight + URL-Param nach 5s entfernen
    const t2 = setTimeout(() => {
      setHighlightedId(null);
      const next = new URLSearchParams(searchParams);
      next.delete('focus');
      setSearchParams(next, { replace: true });
    }, 5000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [searchParams, undispatched, setSearchParams]);


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
    mutationFn: async ({ shipmentId, tourId }: { shipmentId: string; tourId: string | null }) => {
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
        <div className="py-4 px-4 sm:px-6 flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold text-gray-900">Disposition</h1>
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#1e40af] text-white">
              <span>Liste</span>
            </span>
            <Link
              to="/disposition/map"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white text-gray-700 hover:bg-gray-50 border-l border-gray-300"
            >
              <span>Karte</span>
            </Link>
          </div>
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
            className={
              'border bg-white shadow-sm overflow-hidden flex flex-col min-h-0 transition-colors ' +
              (undispatchedDragOver ? 'border-blue-400 ring-2 ring-blue-300' : 'border-gray-200')
            }
            onDragOver={(e) => {
              // Nur reagieren wenn application/json-Drop (Tour-Detail-Card)
              if (Array.from(e.dataTransfer.types).includes('application/json')) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (!undispatchedDragOver) setUndispatchedDragOver(true);
              }
            }}
            onDragLeave={() => setUndispatchedDragOver(false)}
            onDrop={(e) => {
              setUndispatchedDragOver(false);
              try {
                const json = e.dataTransfer.getData('application/json');
                const data = JSON.parse(json) as { shipmentId?: string; fromTour?: boolean };
                if (data.shipmentId && data.fromTour) {
                  e.preventDefault();
                  dispatchMutation.mutate({ shipmentId: data.shipmentId, tourId: null });
                }
              } catch {
                /* ignore */
              }
            }}
          >
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h2 className="font-medium text-gray-900">Nicht disponiert</h2>
              <p className="text-sm text-gray-500">
                Sendungen ohne Tour ({undispatched.length}) – per Drag auf eine Tour ziehen
              </p>
            </div>
            {selectedIds.size > 0 && (
              <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center justify-between text-sm">
                <span className="font-medium text-blue-900">
                  {selectedIds.size} Sendung{selectedIds.size === 1 ? '' : 'en'} markiert
                </span>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-blue-700 hover:text-blue-900 text-xs underline"
                >
                  Auswahl aufheben
                </button>
              </div>
            )}
            <div className="p-4 flex-1 min-h-0 overflow-y-auto space-y-2">
              {loadingShipments ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin h-8 w-8 border-2 border-[#1e40af] border-t-transparent rounded-full" />
                </div>
              ) : undispatched.length === 0 ? (
                <p className="text-gray-500 text-sm">Keine Sendungen ohne Tour.</p>
              ) : (
                (() => {
                  const groups = groupShipments(undispatched);
                  const searchActive = filterSearch.trim().length > 0;
                  return groups.map((cg) => {
                    const cExpanded = searchActive || expandedCountries.has(cg.code);
                    const cSel = groupSelectionState(cg.items);
                    return (
                      <div key={cg.code} className="border border-gray-200 rounded-lg bg-white">
                        <div className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-t-lg sticky top-0 z-10">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={cSel === 'all'}
                              ref={(el) => {
                                if (el) el.indeterminate = cSel === 'some';
                              }}
                              onChange={() => setGroupSelected(cg.items, cSel !== 'all')}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Alle Sendungen in ${cg.code} auswählen`}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedCountries((prev) => {
                                  const n = new Set(prev);
                                  n.has(cg.code) ? n.delete(cg.code) : n.add(cg.code);
                                  return n;
                                })
                              }
                              className="flex items-center gap-2 text-sm font-medium text-gray-900"
                            >
                              <span>{cExpanded ? '▼' : '▶'}</span>
                              <span>{countryLabel(cg.code)}</span>
                            </button>
                          </div>
                          <span className="text-xs text-gray-600">
                            {cg.items.length} · {cg.totalLdm.toFixed(1)} ldm
                          </span>
                        </div>
                        {cExpanded && (
                          <div className="p-2 space-y-2">
                            {cg.relations.map((rg) => {
                              const rk = `${cg.code}::${rg.key}`;
                              const rExpanded = searchActive || expandedRelations.has(rk);
                              const rSel = groupSelectionState(rg.items);
                              return (
                                <div key={rk} className="border border-gray-100 rounded">
                                  <div className="w-full flex items-center justify-between px-2 py-1.5 bg-white hover:bg-gray-50 rounded-t">
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={rSel === 'all'}
                                        ref={(el) => {
                                          if (el) el.indeterminate = rSel === 'some';
                                        }}
                                        onChange={() => setGroupSelected(rg.items, rSel !== 'all')}
                                        onClick={(e) => e.stopPropagation()}
                                        aria-label={`Alle Sendungen ${rg.key} auswählen`}
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExpandedRelations((prev) => {
                                            const n = new Set(prev);
                                            n.has(rk) ? n.delete(rk) : n.add(rk);
                                            return n;
                                          })
                                        }
                                        className="flex items-center gap-2 text-xs font-medium text-gray-700"
                                      >
                                        <span>{rExpanded ? '▼' : '▶'}</span>
                                        <span>{rg.label}</span>
                                      </button>
                                    </div>
                                    <span className="text-xs text-gray-500">
                                      {rg.items.length} · {rg.totalLdm.toFixed(1)} ldm
                                    </span>
                                  </div>
                                  {rExpanded && (() => {
                                    const renderItem = (s: Shipment) => (
                                      <div
                                        key={s.id}
                                        ref={(el) => {
                                          if (el) cardRefs.current.set(s.id, el);
                                          else cardRefs.current.delete(s.id);
                                        }}
                                        className={`flex items-start gap-2 rounded-lg border transition-colors ${
                                          highlightedId === s.id
                                            ? 'border-yellow-500 ring-2 ring-yellow-300 bg-yellow-50 animate-pulse'
                                            : selectedShipmentId === s.id
                                            ? 'border-[#1e40af] bg-yellow-100'
                                            : selectedIds.has(s.id)
                                            ? 'border-blue-300 bg-blue-50'
                                            : 'border-gray-200 bg-white hover:bg-gray-50'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={selectedIds.has(s.id)}
                                          onChange={() => toggleId(s.id)}
                                          onClick={(e) => e.stopPropagation()}
                                          className="mt-3 ml-2"
                                          aria-label={`Sendung ${s.shipment_number ?? s.id} markieren`}
                                        />
                                        <div
                                          className="flex-1 cursor-pointer"
                                          onClick={() => handleListShipmentClick(s.id)}
                                        >
                                          <ShipmentCard shipment={s} draggable />
                                        </div>
                                      </div>
                                    );
                                    if (rg.kind === 'relation') {
                                      return (
                                        <div className="p-2 space-y-2">
                                          {rg.items.map(renderItem)}
                                        </div>
                                      );
                                    }
                                    return (
                                      <div className="p-2 space-y-2">
                                        {rg.subAxes.map((ax) => {
                                          const axKey = `${rk}::${ax.key}`;
                                          const axExp = searchActive || expandedRelations.has(axKey);
                                          const axSel = groupSelectionState(ax.items);
                                          return (
                                            <div key={axKey} className="border border-gray-100 rounded">
                                              <div className="w-full flex items-center justify-between px-2 py-1 bg-white hover:bg-gray-50 rounded-t">
                                                <div className="flex items-center gap-2">
                                                  <input
                                                    type="checkbox"
                                                    checked={axSel === 'all'}
                                                    ref={(el) => {
                                                      if (el) el.indeterminate = axSel === 'some';
                                                    }}
                                                    onChange={() => setGroupSelected(ax.items, axSel !== 'all')}
                                                    onClick={(e) => e.stopPropagation()}
                                                    aria-label={`Alle Sendungen ${ax.key} auswählen`}
                                                  />
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      setExpandedRelations((prev) => {
                                                        const n = new Set(prev);
                                                        n.has(axKey) ? n.delete(axKey) : n.add(axKey);
                                                        return n;
                                                      })
                                                    }
                                                    className="flex items-center gap-2 text-[11px] font-medium text-gray-600"
                                                  >
                                                    <span>{axExp ? '▼' : '▶'}</span>
                                                    <span>{ax.origin} → {ax.destination}</span>
                                                  </button>
                                                </div>
                                                <span className="text-[11px] text-gray-500">
                                                  {ax.items.length} · {ax.totalLdm.toFixed(1)} ldm
                                                </span>
                                              </div>
                                              {axExp && (
                                                <div className="p-2 space-y-2">
                                                  {ax.items.map(renderItem)}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  })()}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()
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

              <div
                className={
                  'p-3 h-full overflow-y-auto transition-colors ' +
                  (tourDetailDragOver ? 'ring-2 ring-blue-400 bg-blue-50/40' : '')
                }
                onDragOver={(e) => {
                  if (!selectedTourId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (!tourDetailDragOver) setTourDetailDragOver(true);
                }}
                onDragLeave={() => setTourDetailDragOver(false)}
                onDrop={(e) => {
                  setTourDetailDragOver(false);
                  if (!selectedTourId) return;
                  e.preventDefault();
                  try {
                    const json = e.dataTransfer.getData('application/json');
                    const { shipmentId } = JSON.parse(json) as { shipmentId?: string };
                    if (shipmentId) dispatchMutation.mutate({ shipmentId, tourId: selectedTourId });
                  } catch {
                    /* ignore */
                  }
                }}
              >
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
                          // Damit "Nicht disponiert"-Spalte (application/json) auch erkennen kann:
                          e.dataTransfer.setData(
                            'application/json',
                            JSON.stringify({ shipmentId: s.id, fromTour: true }),
                          );
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
