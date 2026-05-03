import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreVertical } from 'lucide-react';
import { api } from '../lib/api';
import ShipmentCard from '../components/ShipmentCard';
import type { Shipment } from '../types/shipment';
import type { Tour } from '../types/tour';
import type { Customer } from '../types/customer';

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

function formatDate(s: string | undefined | null) {
  if (!s) return '–';
  try {
    return new Date(s).toLocaleDateString('de-DE');
  } catch {
    return '–';
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

function formatFromTo(s: Shipment): string {
  const load = s.loadingAddress ?? s.addresses_shipments_loading_address_idToaddresses;
  const deliv = s.deliveryAddress ?? s.addresses_shipments_delivery_address_idToaddresses;
  const from = load
    ? [load.city, load.countryCode ?? (load as any).country_code]
        .filter(Boolean)
        .join(' ')
    : '';
  const to = deliv
    ? [deliv.city, deliv.countryCode ?? (deliv as any).country_code]
        .filter(Boolean)
        .join(' ')
    : '';
  return `${from || '–'} → ${to || '–'}`;
}

function dbPercentColor(percent: number): string {
  if (percent >= 15) return 'text-emerald-600';
  if (percent >= 5) return 'text-amber-600';
  return 'text-red-600';
}

function dbPercentBg(percent: number): string {
  if (percent >= 15) return 'bg-emerald-500';
  if (percent >= 5) return 'bg-amber-500';
  return 'bg-red-500';
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function getTourStatusBadge(status: string | undefined | null) {
  switch (status) {
    case 'planned':
      return { label: 'Geplant', cls: 'bg-gray-100 text-gray-800' };
    case 'released':
      return { label: 'Freigegeben', cls: 'bg-emerald-100 text-emerald-800' };
    case 'dispatched':
      return { label: 'Abgefertigt', cls: 'bg-blue-100 text-blue-800' };
    case 'closed':
      return { label: 'Abgefahren', cls: 'bg-gray-800 text-gray-100' };
    default:
      return { label: status ?? '–', cls: 'bg-gray-100 text-gray-800' };
  }
}

type HallStockForTourDto = {
  onStock: Array<{
    shipmentId: string;
    shipment_number: string;
    customer_name: string | null;
    location_code: string;
    status: string;
    ldm: string;
    package_count: number;
    weight_kg: string;
    from_city: string;
    to_city: string;
    to_country: string;
    note: string;
  }>;
  missing: Array<{
    shipmentId: string;
    shipment_number: string;
    customer_name: string | null;
    location_code: string | null;
    status: string;
    ldm: string;
    package_count: number;
    weight_kg: string;
    from_city: string;
    to_city: string;
    to_country: string;
    note: string;
  }>;
  unexpectedOnStock: Array<{
    shipmentId: string;
    shipment_number: string;
    customer_name: string | null;
    location_code: string;
    status: string;
    ldm: string;
    package_count: number;
    weight_kg: string;
    from_city: string;
    to_city: string;
    to_country: string;
    note: string;
  }>;
};

export default function ClearancePage() {
  const queryClient = useQueryClient();

  const [filterTransportType, setFilterTransportType] = useState('');
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [filterPlz, setFilterPlz] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  const listFilters = useMemo(
    () => ({
      transportType: filterTransportType,
      customerId: filterCustomerId || undefined,
      plz: filterPlz || undefined,
      search: filterSearch,
    }),
    [filterTransportType, filterCustomerId, filterPlz, filterSearch],
  );

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data } = await api.get<Customer[]>('/customers');
      return data;
    },
  });

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const availableShipmentsQuery = useQuery({
    queryKey: ['shipments', 'clearance', 'available', listFilters],
    queryFn: async () => {
      const { data } = await api.get<Shipment[]>('/shipments', {
        params: {
          status: 'new',
          tourId: 'null',
          transportType: listFilters.transportType || undefined,
          customerId: listFilters.customerId || undefined,
          plz: listFilters.plz || undefined,
          search: listFilters.search || undefined,
        },
      });
      return data;
    },
  });

  const releasedToursQuery = useQuery({
    queryKey: ['tours', 'clearance', 'released'],
    queryFn: async () => {
      const { data } = await api.get<Tour[]>('/tours', { params: { status: 'released' } });
      return data;
    },
  });

  const closedToursQuery = useQuery({
    queryKey: ['tours', 'clearance', 'closed', today],
    queryFn: async () => {
      const { data } = await api.get<Tour[]>('/tours', { params: { status: 'closed', date: today } });
      return data;
    },
  });

  const addShipmentMutation = useMutation({
    mutationFn: async ({ tourId, shipmentId }: { tourId: string; shipmentId: string }) => {
      await api.post(`/tours/${tourId}/add-shipment`, { shipmentId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tours', 'clearance'] });
      queryClient.invalidateQueries({ queryKey: ['shipments', 'clearance'] });
      queryClient.invalidateQueries({ queryKey: ['hall', 'stock', 'tour'] });
    },
  });

  const removeShipmentMutation = useMutation({
    mutationFn: async ({ tourId, shipmentId }: { tourId: string; shipmentId: string }) => {
      await api.post(`/tours/${tourId}/remove-shipment`, { shipmentId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tours', 'clearance'] });
      queryClient.invalidateQueries({ queryKey: ['shipments', 'clearance'] });
      queryClient.invalidateQueries({ queryKey: ['hall', 'stock', 'tour'] });
    },
  });

  const closeTourMutation = useMutation({
    mutationFn: async (tourId: string) => {
      await api.post(`/tours/${tourId}/close`);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Tour konnte nicht abgeschlossen werden';
      window.alert(msg);
    },
    onSuccess: async (_data, tourId) => {
      queryClient.invalidateQueries({ queryKey: ['tours', 'clearance'] });
      queryClient.invalidateQueries({ queryKey: ['shipments', 'clearance'] });
      queryClient.invalidateQueries({ queryKey: ['hall', 'stock', 'tour', tourId] });
      window.open(`/api/documents/cmr/${tourId}`, '_blank');
    },
  });

  function extractShipmentIdFromDropEvent(e: React.DragEvent) {
    try {
      const json = e.dataTransfer.getData('application/json');
      const parsed = JSON.parse(json);
      return parsed?.shipmentId as string | undefined;
    } catch {
      return undefined;
    }
  }

  return (
    <div className="w-full min-h-screen bg-white flex flex-col">

      <main className="w-full flex-1 flex flex-col min-h-0">
        <div className="py-4">
          <h1 className="text-2xl font-semibold text-gray-900 pl-4 sm:pl-6">Abfertigung</h1>
        </div>

        <div className="flex-1 min-h-0 px-4 sm:px-6 pb-8">
          <div className="flex h-full min-h-[600px] overflow-hidden">
            {/* Column 1 */}
            <div className="w-[30%] min-w-[320px] border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden flex flex-col min-h-0 mr-3">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-medium text-gray-900">Verfügbare Sendungen</h2>
                    <p className="text-sm text-gray-500">status: new, tour_id: null</p>
                  </div>
                  <div className="text-sm text-gray-600">{availableShipmentsQuery.data?.length ?? 0}</div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2">
                  <label className="text-sm text-gray-600">
                    Transportart
                    <select
                      value={filterTransportType}
                      onChange={(e) => setFilterTransportType(e.target.value)}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
                    >
                      {TRANSPORT_TYPE_OPTIONS.map((o) => (
                        <option key={o.value || 'all'} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-gray-600">
                    Kunde
                    <select
                      value={filterCustomerId}
                      onChange={(e) => setFilterCustomerId(e.target.value)}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
                    >
                      <option value="">Alle</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-gray-600">
                    PLZ
                    <input
                      value={filterPlz}
                      onChange={(e) => setFilterPlz(e.target.value)}
                      placeholder="z.B. 10115"
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 placeholder-gray-400 focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
                    />
                  </label>
                  <label className="text-sm text-gray-600">
                    Suche
                    <input
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                      placeholder="Sendungsnummer, Kunde, PLZ…"
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 placeholder-gray-400 focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]"
                    />
                  </label>
                </div>
              </div>

              <div className="p-4 flex-1 min-h-0 overflow-y-auto space-y-3">
                {availableShipmentsQuery.isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin h-8 w-8 border-2 border-[#1e40af] border-t-transparent rounded-full" />
                  </div>
                ) : availableShipmentsQuery.data?.length ? (
                  availableShipmentsQuery.data!.map((s) => (
                    <ShipmentCard key={s.id} shipment={s} draggable />
                  ))
                ) : (
                  <div className="text-sm text-gray-500">Keine verfügbaren Sendungen.</div>
                )}
              </div>
            </div>

            {/* Column 2 */}
            <div className="w-[40%] min-w-[420px] border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden flex flex-col min-h-0 mr-3">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <div>
                  <h2 className="font-medium text-gray-900">Freigegebene Touren</h2>
                  <p className="text-sm text-gray-500">status: released</p>
                </div>
              </div>

              <div className="p-4 flex-1 min-h-0 overflow-y-auto space-y-4">
                {releasedToursQuery.isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin h-8 w-8 border-2 border-[#1e40af] border-t-transparent rounded-full" />
                  </div>
                ) : releasedToursQuery.data?.length ? (
                  releasedToursQuery.data!.map((tour) => (
                    <ReleasedTourCard
                      key={tour.id}
                      tour={tour}
                      addShipment={(shipmentId) => addShipmentMutation.mutate({ tourId: tour.id, shipmentId })}
                      removeShipment={(shipmentId) =>
                        removeShipmentMutation.mutate({ tourId: tour.id, shipmentId })
                      }
                      closeTour={() => closeTourMutation.mutate(tour.id)}
                      closeDisabled={closeTourMutation.isPending}
                      extractShipmentIdFromDropEvent={extractShipmentIdFromDropEvent}
                    />
                  ))
                ) : (
                  <div className="text-sm text-gray-500">Keine freigegebenen Touren vorhanden.</div>
                )}
              </div>
            </div>

            {/* Column 3 */}
            <div className="w-[30%] min-w-[320px] border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden flex flex-col min-h-0">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <h2 className="font-medium text-gray-900">Abgefertigte Touren heute</h2>
                <p className="text-sm text-gray-500">status: closed</p>
              </div>

              <div className="p-4 flex-1 min-h-0 overflow-y-auto space-y-3">
                {closedToursQuery.isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin h-8 w-8 border-2 border-[#1e40af] border-t-transparent rounded-full" />
                  </div>
                ) : closedToursQuery.data?.length ? (
                  closedToursQuery.data!.map((tour) => {
                    const tourNumber = tour.tour_number ?? tour.tourNumber ?? tour.id;
                    const subName = tour.subcontractors?.name ?? tour.subcontractor?.name ?? '–';
                    const senCount = tour.shipments?.length ?? tour._count?.shipments ?? 0;
                    return (
                      <div key={tour.id} className="rounded-lg border border-gray-200 bg-white shadow-sm p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 truncate">{tourNumber}</div>
                            <div className="text-sm text-gray-600 mt-0.5">SUB: {subName}</div>
                            <div className="text-xs text-gray-500 mt-0.5">Uhrzeit: {formatTimeHHmm(tour.departure_time)}</div>
                            <div className="text-xs text-gray-500 mt-0.5">Sendungen: {senCount}</div>
                          </div>
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${getTourStatusBadge(tour.status).cls}`}>
                            {getTourStatusBadge(tour.status).label}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-col gap-2">
                          <button
                            type="button"
                            className="px-3 py-2 bg-white border border-gray-300 text-gray-800 text-sm font-medium rounded-lg hover:bg-gray-50"
                            onClick={() => window.open(`/api/documents/cmr/${tour.id}`, '_blank')}
                          >
                            CMR nochmal drucken
                          </button>
                          <button
                            type="button"
                            className="px-3 py-2 bg-white border border-gray-300 text-gray-800 text-sm font-medium rounded-lg hover:bg-gray-50"
                            onClick={() => window.open(`/api/documents/loading-list/${tour.id}`, '_blank')}
                          >
                            Beladeplan nochmal drucken
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-sm text-gray-500">Heute keine abgefertigten Touren.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function ReleasedTourCard({
  tour,
  addShipment,
  removeShipment,
  closeTour,
  closeDisabled,
  extractShipmentIdFromDropEvent,
}: {
  tour: Tour;
  addShipment: (shipmentId: string) => void;
  removeShipment: (shipmentId: string) => void;
  closeTour: () => void;
  closeDisabled: boolean;
  extractShipmentIdFromDropEvent: (e: React.DragEvent) => string | undefined;
}) {
  const [expanded, setExpanded] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [checklist, setChecklist] = useState({
    cmr: false,
    bordero: false,
    unterwegs: false,
    rampe: false,
  });
  const hallQueryKey = useMemo(() => ['hall', 'stock', 'tour', tour.id], [tour.id]);

  const shipmentsQuery = useQuery({
    queryKey: ['shipments', 'clearance', 'tour', tour.id],
    queryFn: async () => {
      const { data } = await api.get<Shipment[]>('/shipments', { params: { tourId: tour.id } });
      return data;
    },
  });

  const hallQuery = useQuery({
    queryKey: hallQueryKey,
    queryFn: async () => {
      const { data } = await api.get<HallStockForTourDto>(`/hall/stock/tour/${tour.id}`);
      return data;
    },
  });

  const loadingOptimizeQuery = useQuery({
    queryKey: ['loading', 'optimize', tour.id],
    queryFn: async () => {
      const { data } = await api.get<any>(`/loading/tour/${tour.id}/optimize`);
      return data;
    },
  });

  const tourNumber = tour.tour_number ?? tour.tourNumber ?? tour.id;
  const subName = tour.subcontractors?.name ?? tour.subcontractor?.name ?? '–';
  const statusBadge = getTourStatusBadge(tour.status);

  const shipments = shipmentsQuery.data ?? [];

  const totalLdm = Number(tour.total_ldm ?? 0);
  const maxLdm = Number(tour.max_ldm ?? tour.maxLdm ?? 13.6);
  const usedLdm = totalLdm > 0 ? totalLdm : shipments.reduce((sum, s) => sum + (Number(s.ldm) || 0), 0);
  const fillPct = maxLdm > 0 ? Math.min(100, (usedLdm / maxLdm) * 100) : 0;

  const percent = Number(tour.cm_percent ?? tour.cmPercent ?? 0);
  const contributionMargin = Number(tour.contribution_margin ?? 0);

  const missingCount = hallQuery.data?.missing?.length ?? 0;
  const unexpectedCount = hallQuery.data?.unexpectedOnStock?.length ?? 0;
  const expectedCount = (hallQuery.data?.onStock?.length ?? 0) + missingCount;

  const allOk = expectedCount > 0 && missingCount === 0 && unexpectedCount === 0;
  const hasActiveLocksOnTour = shipments.some(
    (x) => !!(x as unknown as { has_active_lock?: boolean }).has_active_lock,
  );
  const canCloseTour = allOk && !hasActiveLocksOnTour;

  const tooltip = useMemo(() => {
    const missingLines = hallQuery.data?.missing?.map((m) => `- ${m.shipment_number} (fehlt)`) ?? [];
    const unexpectedLines =
      hallQuery.data?.unexpectedOnStock?.map((m) => `- ${m.shipment_number} (unerwartet)`) ?? [];
    if (!missingLines.length && !unexpectedLines.length) return 'Alles korrekt auf Stellplätzen.';
    return `Stellplatz-Abweichungen:\n${missingLines.join('\n')}\n${unexpectedLines.join('\n')}`.trim();
  }, [hallQuery.data]);

  const msg = allOk
    ? `${expectedCount} Sendungen auf Stellplatz ✓`
    : missingCount > 0
      ? `⚠ ${missingCount} Sendung(en) fehlt`
      : `⚠ ${unexpectedCount} unerwartet auf Stellplatz`;

  function handleDropOnTour(e: React.DragEvent) {
    e.preventDefault();
    const shipmentId = extractShipmentIdFromDropEvent(e);
    if (!shipmentId) return;
    addShipment(shipmentId);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleClose() {
    if (!canCloseTour || closeDisabled) return;
    setChecklist({ cmr: false, bordero: false, unterwegs: false, rampe: false });
    setConfirmOpen(true);
  }

  function handleConfirmClose() {
    if (!canCloseTour || closeDisabled) return;
    if (!checklist.cmr || !checklist.bordero || !checklist.unterwegs || !checklist.rampe) return;
    setConfirmOpen(false);
    closeTour();
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-semibold text-gray-900 truncate">{tourNumber}</div>
            <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge.cls}`}>
              {statusBadge.label}
            </span>
          </div>
          <div className="text-sm text-gray-600 mt-0.5">SUB: {subName}</div>
          <div className="text-xs text-gray-500 mt-0.5">Datum: {formatDate(tour.tour_date ?? tour.tourDate)}</div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={!allOk || closeDisabled || hallQuery.isLoading || shipmentsQuery.isLoading}
            className="px-3 py-2 bg-[#1e40af] text-white text-sm font-medium rounded-lg hover:bg-[#1e3a8a] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Abfertigung abschliessen
          </button>
          <details className="relative">
            <summary className="list-none cursor-pointer flex items-center justify-center h-9 w-9 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50">
              <MoreVertical size={18} aria-hidden />
              <span className="sr-only">Weitere Aktionen</span>
            </summary>
            <div className="absolute right-0 mt-1 z-20 min-w-[12rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
                onClick={() => window.open(`/loading/${tour.id}`, '_blank')}
              >
                Beladeplan öffnen
              </button>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
                onClick={() => window.open(`/api/documents/loading-list/${tour.id}`, '_blank')}
              >
                Ladeliste drucken
              </button>
            </div>
          </details>
          <button
            type="button"
            className="text-sm text-[#1e40af] hover:underline"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Sendungen einklappen' : 'Sendungen ausklappen'}
          </button>
          <div className="text-xs text-gray-700" title={tooltip}>
            {msg}
          </div>
          {loadingOptimizeQuery.data?.warnings?.length > 0 && (
            <div className="text-xs text-red-600">
              ⚠ {loadingOptimizeQuery.data.warnings.length} Lade-Warnung(en)
            </div>
          )}
          {hasActiveLocksOnTour && (
            <div className="text-xs text-red-600 font-medium">
              🔒 {shipments.filter((x) => (x as unknown as { has_active_lock?: boolean }).has_active_lock).length}{' '}
              Sendung(en) gesperrt – Abschluss blockiert
            </div>
          )}
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>ldm Auslastung</span>
          <span>
            {usedLdm.toFixed(1)} / {maxLdm} ldm ({fillPct.toFixed(0)}%)
          </span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className={`h-full rounded-full ${fillPct > 100 ? 'bg-red-500' : 'bg-[#1e40af]'}`}
            style={{ width: `${Math.min(100, fillPct)}%` }}
          />
        </div>
        <div className={`mt-2 text-sm ${dbPercentColor(percent)}`}>
          DB: {formatCurrency(contributionMargin)} ({percent.toFixed(1)}%)
          <span className={`ml-1.5 inline-block h-2 w-2 rounded-full ${dbPercentBg(percent)}`} />
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {expanded && (
          <div className="space-y-3">
            {shipmentsQuery.isLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin h-6 w-6 border-2 border-[#1e40af] border-t-transparent rounded-full" />
              </div>
            ) : shipments.length === 0 ? (
              <div className="text-sm text-gray-500">Keine Sendungen auf Tour.</div>
            ) : (
              <div className="space-y-2">
                {shipments.map((s) => (
                  <div
                    key={s.id}
                    className={`rounded-lg border bg-white p-2 flex items-start justify-between gap-3 ${
                      (s as unknown as { has_active_lock?: boolean }).has_active_lock
                        ? 'border-red-400 ring-1 ring-red-100'
                        : 'border-gray-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 truncate">
                        {s.shipment_number ?? s.shipmentNumber ?? s.id}
                        {(s as unknown as { has_active_lock?: boolean }).has_active_lock && (
                          <span className="ml-2 text-xs font-semibold text-red-600">
                            🔒{' '}
                            {(s as unknown as { lock_types?: string }).lock_types?.split(',')[0] ?? 'SPERRE'}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 mt-0.5">
                        {s.customers?.name ?? (s.customer as any)?.name ?? '–'}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{formatFromTo(s)}</div>
                      {s.ldm != null && (
                        <div className="text-xs text-gray-500 mt-0.5">{String(s.ldm)} ldm</div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="shrink-0 px-2 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700"
                      onClick={() => removeShipment(s.id)}
                      aria-label="Sendung entfernen"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Drop zone */}
        <div
          className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-3 py-3"
          onDragOver={handleDragOver}
          onDrop={handleDropOnTour}
        >
          <div className="text-sm text-gray-600">Sendungen hierher ziehen</div>
        </div>

      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setConfirmOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-2xl bg-white rounded-xl border border-gray-200 shadow-lg p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900">
                  Tour {tourNumber} abschliessen
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Bitte bestätigen Sie die folgenden Schritte in der Checkliste.
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 px-2 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700"
                onClick={() => setConfirmOpen(false)}
                aria-label="Dialog schließen"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="flex items-start gap-3 text-sm text-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checklist.cmr}
                  onChange={(e) => setChecklist((v) => ({ ...v, cmr: e.target.checked }))}
                  className="mt-0.5"
                />
                <span>CMR wird generiert</span>
              </label>
              <label className="flex items-start gap-3 text-sm text-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checklist.bordero}
                  onChange={(e) => setChecklist((v) => ({ ...v, bordero: e.target.checked }))}
                  className="mt-0.5"
                />
                <span>Ausgangsbordero wird gesendet</span>
              </label>
              <label className="flex items-start gap-3 text-sm text-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checklist.unterwegs}
                  onChange={(e) => setChecklist((v) => ({ ...v, unterwegs: e.target.checked }))}
                  className="mt-0.5"
                />
                <span>Alle Sendungen werden auf &apos;Unterwegs&apos; gesetzt</span>
              </label>
              <label className="flex items-start gap-3 text-sm text-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checklist.rampe}
                  onChange={(e) => setChecklist((v) => ({ ...v, rampe: e.target.checked }))}
                  className="mt-0.5"
                />
                <span>Rampe wird freigegeben</span>
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700"
                onClick={() => setConfirmOpen(false)}
                disabled={closeDisabled}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="px-3 py-2 bg-[#1e40af] text-white text-sm font-medium rounded-lg hover:bg-[#1e3a8a] disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleConfirmClose}
                disabled={
                  closeDisabled ||
                  !allOk ||
                  !checklist.cmr ||
                  !checklist.bordero ||
                  !checklist.unterwegs ||
                  !checklist.rampe
                }
              >
                Abfertigung abschliessen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

