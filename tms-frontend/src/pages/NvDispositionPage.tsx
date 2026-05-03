import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2, X } from 'lucide-react';
import Navigation from '../components/Navigation';
import NvTourKostenModal from '../components/NvTourKostenModal';
import { api } from '../lib/api';

type TourGebiet = { id: string; code: string; name: string };
type StammTour = {
  id: string;
  code: string;
  name: string;
  nv_tour_gebiet_id: string;
  default_subunternehmer_id: string | null;
  nv_tour_gebiet?: TourGebiet;
};
type Customer = { id: string; customer_number: string; name: string };
type Address = {
  id: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  country_code: string | null;
};
type EligibleShipment = {
  id: string;
  shipment_number: string;
  customer_id: string | null;
  loading_date: string;
  delivery_date: string;
  package_count: number;
  total_weight_kg?: string | number | null;
  total_ldm?: string | number | null;
  customer?: Customer | null;
  delivery_address?: Address | null;
  matched_tour_gebiet_id: string | null;
  matched_tour_gebiet_code: string | null;
  is_stamm_kunde: boolean;
};

function pickupBadge(loadingDateIso: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ld = new Date(loadingDateIso);
  ld.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (ld.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays < 0) {
    return {
      label: `Überfällig ${Math.abs(diffDays)} Tag${Math.abs(diffDays) === 1 ? '' : 'e'}`,
      cls: 'bg-red-100 text-red-700',
    };
  }
  if (diffDays === 0) {
    return { label: 'Heute', cls: 'bg-yellow-100 text-yellow-800' };
  }
  return null;
}
type Stop = {
  id: string;
  position: number;
  status: string;
  servicezeit_min: number | null;
  routing_klasse: string | null;
  is_stamm_kunde?: boolean;
  shipment?: {
    id: string;
    shipment_number: string;
    customer_id: string | null;
  };
};
type NvTour = {
  id: string;
  datum: string;
  status: string;
  fahrzeug_typ: string | null;
  fahrer_kosten_eur: string | number | null;
  fahrzeug_kosten_eur: string | number | null;
  kraftstoff_kosten_eur: string | number | null;
  dispo_kosten_eur: string | number | null;
  sonstige_kosten_eur: string | number | null;
  total_kosten_eur: string | number | null;
  notizen: string | null;
  subunternehmer_id: string | null;
  nv_stamm_tour_id: string | null;
  nv_stamm_tour?: {
    id: string;
    code: string;
    name: string;
    nv_tour_gebiet?: TourGebiet;
  } | null;
  subunternehmer?: {
    id: string;
    name: string;
    business_partner?: { name: string } | null;
  } | null;
  stops: Stop[];
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function NvDispositionPage() {
  const qc = useQueryClient();
  const [datum, setDatum] = useState<string>(todayISO());
  const [filterTour, setFilterTour] = useState<string>('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCreateTour, setShowCreateTour] = useState(false);
  const [bulkPickerOpen, setBulkPickerOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [kostenTourId, setKostenTourId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{
    msg: string;
    kind: 'ok' | 'err';
  } | null>(null);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 3000);
    return () => clearTimeout(t);
  }, [banner]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const tourGebieteQ = useQuery<TourGebiet[]>({
    queryKey: ['nv-tour-gebiete'],
    queryFn: async () => (await api.get<TourGebiet[]>('/nv-tour-gebiete')).data,
  });
  const stammTourenQ = useQuery<StammTour[]>({
    queryKey: ['nv-stamm-touren'],
    queryFn: async () =>
      (await api.get<StammTour[]>('/nv-stamm-touren')).data,
  });
  const eligQ = useQuery<EligibleShipment[]>({
    queryKey: ['nv-elig', datum, filterTour, debounced],
    queryFn: async () => {
      const params: Record<string, string> = { datum };
      if (filterTour) params.nv_tour_gebiet_id = filterTour;
      if (debounced) params.search = debounced;
      return (
        await api.get<EligibleShipment[]>(
          '/nv-touren/eligible-shipments',
          { params },
        )
      ).data;
    },
    enabled: !!datum,
  });
  const tourenQ = useQuery<NvTour[]>({
    queryKey: ['nv-touren', datum],
    queryFn: async () =>
      (
        await api.get<NvTour[]>('/nv-touren', {
          params: { datum },
        })
      ).data,
    enabled: !!datum,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['nv-touren'] });
    qc.invalidateQueries({ queryKey: ['nv-elig'] });
  };

  const groupedElig = useMemo(() => {
    const list = eligQ.data ?? [];
    const map = new Map<string, EligibleShipment[]>();
    for (const s of list) {
      const key = s.matched_tour_gebiet_code ?? '— ohne Zuordnung —';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [eligQ.data]);

  const addStopMut = useMutation({
    mutationFn: async (input: { tourId: string; shipmentId: string }) =>
      (
        await api.post(`/nv-touren/${input.tourId}/stops`, {
          shipment_id: input.shipmentId,
        })
      ).data,
    onSuccess: invalidate,
  });
  const deleteStopMut = useMutation({
    mutationFn: async (input: { tourId: string; stopId: string }) =>
      (
        await api.delete(
          `/nv-touren/${input.tourId}/stops/${input.stopId}`,
        )
      ).data,
    onSuccess: invalidate,
  });
  const reorderMut = useMutation({
    mutationFn: async (input: {
      tourId: string;
      items: { id: string; position: number }[];
    }) =>
      (
        await api.post(`/nv-touren/${input.tourId}/stops/reorder`, {
          items: input.items,
        })
      ).data,
    onSuccess: invalidate,
  });
  const createTourMut = useMutation({
    mutationFn: async (input: { stammTourId: string }) =>
      (
        await api.post('/nv-touren', {
          nv_stamm_tour_id: input.stammTourId,
          datum,
        })
      ).data,
    onSuccess: invalidate,
  });
  const deleteTourMut = useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/nv-touren/${id}`)).data,
    onSuccess: invalidate,
  });
  const autoSuggestMut = useMutation({
    mutationFn: async () =>
      (
        await api.post<{
          touren_created: number;
          stops_added: number;
        }>(`/nv-touren/auto-suggest`, undefined, { params: { datum } })
      ).data,
    onSuccess: (res) => {
      invalidate();
      setBanner({
        kind: 'ok',
        msg: `${res.touren_created} Tour(en) erstellt, ${res.stops_added} Stop(s) hinzugefügt.`,
      });
    },
    onError: () => {
      setBanner({ kind: 'err', msg: 'Auto-Vorschlag fehlgeschlagen.' });
    },
  });

  const dropOnTour = (tourId: string, shipmentId: string) =>
    addStopMut.mutate({ tourId, shipmentId });

  const moveStop = (tour: NvTour, idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= tour.stops.length) return;
    const a = tour.stops[idx];
    const b = tour.stops[target];
    reorderMut.mutate({
      tourId: tour.id,
      items: [
        { id: a.id, position: b.position },
        { id: b.id, position: a.position },
      ],
    });
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const dropBulkOnTour = async (tourId: string, ids: string[]) => {
    await Promise.all(
      ids.map((shipmentId) =>
        api.post(`/nv-touren/${tourId}/stops`, { shipment_id: shipmentId }),
      ),
    );
    setSelected(new Set());
    invalidate();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navigation />

      <div className="bg-white border-b px-4 py-3 flex flex-wrap items-center gap-3">
        <div>
          <label className="block text-[10px] uppercase text-gray-500 mb-0.5">
            Pickup-Datum bis
          </label>
          <input
            type="date"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
            title="Zeigt alle offenen Abholungen bis zu diesem Datum"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase text-gray-500 mb-0.5">
            Tour-Gebiet
          </label>
          <select
            value={filterTour}
            onChange={(e) => setFilterTour(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="">Alle</option>
            {(tourGebieteQ.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.code}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] uppercase text-gray-500 mb-0.5">
            Suche
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sendung-Nr / Kunde..."
            className="border rounded px-2 py-1 text-sm w-full"
          />
        </div>
        <button
          onClick={() => {
            if (
              confirm(
                `Stamm-Kunden für ${datum} automatisch zu Touren zuordnen?`,
              )
            )
              autoSuggestMut.mutate();
          }}
          disabled={autoSuggestMut.isPending}
          className="bg-emerald-600 text-white text-sm rounded px-3 py-2 flex items-center gap-1 hover:bg-emerald-700 disabled:opacity-50"
        >
          <Sparkles size={16} />
          {autoSuggestMut.isPending ? 'Erstelle…' : 'Auto-Vorschlag'}
        </button>
        <button
          onClick={() => setShowCreateTour(true)}
          className="bg-blue-600 text-white text-sm rounded px-3 py-2 flex items-center gap-1 hover:bg-blue-700"
        >
          <Plus size={16} />
          Tour anlegen
        </button>
        <div className="ml-auto text-xs text-gray-600">
          <span className="font-semibold">{eligQ.data?.length ?? 0}</span>{' '}
          eingehend ·{' '}
          <span className="font-semibold">
            {(tourenQ.data ?? []).reduce(
              (sum, t) => sum + t.stops.length,
              0,
            )}
          </span>{' '}
          in Tour ·{' '}
          <span className="font-semibold">{tourenQ.data?.length ?? 0}</span>{' '}
          Tour(en)
        </div>
      </div>

      {banner && (
        <div
          onClick={() => setBanner(null)}
          className={`px-4 py-2 text-sm cursor-pointer border-b ${
            banner.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {banner.msg}{' '}
          <span className="text-xs text-gray-500 ml-2">(klick zum Schließen)</span>
        </div>
      )}

      {selected.size > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center gap-2 text-sm">
          <span>{selected.size} Sendung(en) ausgewählt</span>
          <button
            onClick={() => setBulkPickerOpen(true)}
            className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            → in Tour droppen
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-gray-600 hover:text-gray-800"
          >
            Auswahl leeren
          </button>
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 p-3 overflow-hidden">
        <div className="bg-white rounded-lg border overflow-y-auto">
          <div className="px-3 py-2 border-b bg-gray-50 sticky top-0">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">
                Eingehende Sendungen ({eligQ.data?.length ?? 0})
              </h2>
              {eligQ.isLoading && (
                <span className="text-xs text-gray-500">lade…</span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Offene Abholungen (status=new) bis Pickup-Datum.
            </p>
          </div>
          {!eligQ.isLoading && (eligQ.data?.length ?? 0) === 0 && (
            <div className="p-4 text-sm text-gray-500">
              Keine offenen Sendungen für {datum}.
            </div>
          )}
          {groupedElig.map(([groupKey, items]) => (
            <div key={groupKey}>
              <div className="px-3 py-1 bg-gray-100 border-y text-xs font-mono text-gray-700">
                {groupKey} ({items.length})
              </div>
              {items.map((s) => (
                <div
                  key={s.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'application/json',
                      JSON.stringify({ shipmentId: s.id }),
                    );
                    setDraggingId(s.id);
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  className={`px-3 py-2 border-b text-sm hover:bg-blue-50 cursor-grab flex items-start gap-2 ${
                    draggingId === s.id ? 'opacity-40' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggleSelect(s.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs">
                        {s.shipment_number}
                      </span>
                      {s.is_stamm_kunde && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700"
                          title="Stammkunde"
                        >
                          Stamm
                        </span>
                      )}
                      {(() => {
                        const b = pickupBadge(s.loading_date);
                        return b ? (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${b.cls}`}
                            title={`Pickup ${s.loading_date.slice(0, 10)}`}
                          >
                            {b.label}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <div className="font-medium truncate">
                      {s.customer?.name ?? '—'}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {s.delivery_address?.zip} {s.delivery_address?.city}
                    </div>
                    <div className="text-xs text-gray-500">
                      {s.package_count} Pak
                      {s.total_weight_kg
                        ? ` · ${Number(s.total_weight_kg).toFixed(0)} kg`
                        : ''}
                      {s.total_ldm
                        ? ` · ${Number(s.total_ldm).toFixed(2)} LDM`
                        : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-lg border overflow-y-auto">
          <div className="px-3 py-2 border-b bg-gray-50 sticky top-0">
            <h2 className="font-semibold text-sm">
              NV-Touren {datum} ({tourenQ.data?.length ?? 0})
            </h2>
          </div>
          {(!tourenQ.data || tourenQ.data.length === 0) && (
            <div className="p-4 text-sm text-gray-500">
              Keine Touren für {datum}.
            </div>
          )}
          <div className="p-2 space-y-2">
            {(tourenQ.data ?? []).map((tour) => (
              <TourCard
                key={tour.id}
                tour={tour}
                onDrop={(shipmentId) => dropOnTour(tour.id, shipmentId)}
                onMoveStop={(idx, dir) => moveStop(tour, idx, dir)}
                onDeleteStop={(stopId) =>
                  deleteStopMut.mutate({ tourId: tour.id, stopId })
                }
                onDeleteTour={() => {
                  if (confirm(`Tour löschen?`)) deleteTourMut.mutate(tour.id);
                }}
                onOpenKosten={() => setKostenTourId(tour.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {showCreateTour && (
        <CreateTourModal
          stammTouren={stammTourenQ.data ?? []}
          onClose={() => setShowCreateTour(false)}
          onCreate={async (stammTourId) => {
            await createTourMut.mutateAsync({ stammTourId });
            setShowCreateTour(false);
          }}
          saving={createTourMut.isPending}
        />
      )}

      {bulkPickerOpen && (
        <BulkTourPicker
          touren={tourenQ.data ?? []}
          onClose={() => setBulkPickerOpen(false)}
          onPicked={async (tourId) => {
            await dropBulkOnTour(tourId, [...selected]);
            setBulkPickerOpen(false);
          }}
        />
      )}

      {kostenTourId &&
        (() => {
          const t = tourenQ.data?.find((x) => x.id === kostenTourId);
          if (!t) return null;
          return (
            <NvTourKostenModal
              tour={t}
              onClose={() => setKostenTourId(null)}
            />
          );
        })()}
    </div>
  );
}

function TourCard({
  tour,
  onDrop,
  onMoveStop,
  onDeleteStop,
  onDeleteTour,
  onOpenKosten,
}: {
  tour: NvTour;
  onDrop: (shipmentId: string) => void;
  onMoveStop: (idx: number, dir: -1 | 1) => void;
  onDeleteStop: (stopId: string) => void;
  onDeleteTour: () => void;
  onOpenKosten: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setHovered(false);
    const json = e.dataTransfer.getData('application/json');
    if (!json) return;
    try {
      const { shipmentId } = JSON.parse(json) as { shipmentId?: string };
      if (shipmentId) onDrop(shipmentId);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes('application/json')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setHovered(true);
        }
      }}
      onDragLeave={() => setHovered(false)}
      onDrop={handleDrop}
      className={`border rounded-lg ${
        hovered ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
      }`}
    >
      <div
        className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between cursor-pointer hover:bg-gray-100"
        onClick={onOpenKosten}
        title="Klick für Kosten-Eingabe"
      >
        <div>
          <div className="font-semibold text-sm flex items-center gap-2">
            <span>{tour.nv_stamm_tour?.code ?? '—'}</span>
            <span className="text-xs text-gray-500">
              {tour.nv_stamm_tour?.nv_tour_gebiet?.name ?? ''}
            </span>
            <span
              className={`text-xs font-mono ${
                tour.total_kosten_eur && Number(tour.total_kosten_eur) > 0
                  ? 'text-emerald-700 font-semibold'
                  : 'text-gray-400'
              }`}
            >
              {tour.total_kosten_eur && Number(tour.total_kosten_eur) > 0
                ? `€ ${Number(tour.total_kosten_eur).toFixed(0)}`
                : '€ —'}
            </span>
          </div>
          <div className="text-xs text-gray-500">
            {tour.subunternehmer?.name ?? '— kein Sub —'}
            {' · '}
            <span
              className={
                tour.status === 'PLANNING'
                  ? 'text-blue-600'
                  : tour.status === 'COMPLETED'
                    ? 'text-green-600'
                    : 'text-gray-600'
              }
            >
              {tour.status}
            </span>
            {' · '}
            <span className="text-green-700">
              S:{tour.stops.filter((s) => s.is_stamm_kunde).length}
            </span>
            {' · '}
            <span className="text-orange-600">
              Spot:{tour.stops.filter((s) => !s.is_stamm_kunde).length}
            </span>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDeleteTour();
          }}
          className="text-red-500 hover:text-red-700"
          title="Tour löschen"
        >
          <Trash2 size={16} />
        </button>
      </div>
      <ul className="divide-y divide-gray-100">
        {tour.stops.map((s, idx) => (
          <li key={s.id} className="px-3 py-1.5 flex items-center gap-2 text-sm">
            <span className="text-xs font-mono text-gray-500 w-6 text-right">
              {s.position}
            </span>
            <span className="font-mono text-xs">
              {s.shipment?.shipment_number ?? '—'}
            </span>
            {s.is_stamm_kunde && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700"
                title="Stammkunde"
              >
                Stamm
              </span>
            )}
            <span className="text-xs text-gray-500 ml-auto">
              {s.servicezeit_min ? `${s.servicezeit_min} min` : ''}
            </span>
            <button
              onClick={() => onMoveStop(idx, -1)}
              disabled={idx === 0}
              className="text-gray-500 hover:text-gray-700 disabled:opacity-30"
            >
              <ArrowUp size={14} />
            </button>
            <button
              onClick={() => onMoveStop(idx, 1)}
              disabled={idx === tour.stops.length - 1}
              className="text-gray-500 hover:text-gray-700 disabled:opacity-30"
            >
              <ArrowDown size={14} />
            </button>
            <button
              onClick={() => onDeleteStop(s.id)}
              className="text-red-500 hover:text-red-700"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      <div
        className={`px-3 py-2 text-xs text-center border-t ${
          hovered ? 'text-blue-700' : 'text-gray-400'
        }`}
      >
        {hovered ? 'Loslassen zum Hinzufügen' : '+ Sendung hierher droppen'}
      </div>
    </div>
  );
}

function CreateTourModal({
  stammTouren,
  onClose,
  onCreate,
  saving,
}: {
  stammTouren: StammTour[];
  onClose: () => void;
  onCreate: (stammTourId: string) => void;
  saving: boolean;
}) {
  const [stammTourId, setStammTourId] = useState('');
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold text-gray-800">Neue NV-Tour</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Stamm-Tour *
            </label>
            <select
              value={stammTourId}
              onChange={(e) => setStammTourId(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="">— bitte wählen —</option>
              {stammTouren.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} – {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
          >
            Abbrechen
          </button>
          <button
            onClick={() => stammTourId && onCreate(stammTourId)}
            disabled={!stammTourId || saving}
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Lege an...' : 'Anlegen'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkTourPicker({
  touren,
  onClose,
  onPicked,
}: {
  touren: NvTour[];
  onClose: () => void;
  onPicked: (tourId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold text-gray-800">Tour auswählen</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {touren.length === 0 && (
            <div className="p-3 text-sm text-gray-500">
              Keine Touren für dieses Datum.
            </div>
          )}
          {touren.map((t) => (
            <button
              key={t.id}
              onClick={() => onPicked(t.id)}
              className="w-full text-left px-3 py-2 border-b hover:bg-blue-50 text-sm"
            >
              <div className="font-medium">
                {t.nv_stamm_tour?.code ?? '—'}
              </div>
              <div className="text-xs text-gray-500">
                {t.subunternehmer?.name ?? ''} · {t.stops.length} Stops
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
