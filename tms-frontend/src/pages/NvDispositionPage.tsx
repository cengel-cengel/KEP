import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Package, Pencil, Plus, Sparkles, Trash2, Truck, X } from 'lucide-react';
import NvTourKostenModal from '../components/NvTourKostenModal';
import ShipmentDetailModal from '../components/ShipmentDetailModal';
import type { Shipment } from '../types/shipment';
import NvDispoMap from '../components/nv/NvDispoMap';
import type { MapShipment } from '../components/nv/NvDispoMap';
import CostDrillDownModal from '../components/nv/CostDrillDownModal';
import type { CostComponent } from '../components/nv/CostDrillDownModal';
import ResponsiveTable from '../components/table/ResponsiveTable';
import type { Column } from '../components/table/ResponsiveTable';
import { api } from '../lib/api';

type TourGebiet = { id: string; code: string; name: string; farbe?: string | null };
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
type AddressGeo = Address & {
  lat?: string | number | null;
  lng?: string | number | null;
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
  delivery_address?: AddressGeo | null;
  loading_address?: AddressGeo | null;
  pin_address?: AddressGeo | null;
  mode?: 'PICKUP' | 'DELIVERY';
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
  stop_type?: 'PICKUP' | 'DELIVERY';
  servicezeit_min: number | null;
  routing_klasse: string | null;
  is_stamm_kunde?: boolean;
  shipment?: {
    id: string;
    shipment_number: string;
    customer_id: string | null;
    package_count?: number | null;
    weight_kg?: string | number | null;
    volume_m3?: string | number | null;
    ldm?: string | number | null;
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
  kosten_modus?: string | null;
  angefahrene_km: string | number | null;
  stunden_geleistet: string | number | null;
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

function eligColumns(
  selected: Set<string>,
  handleSelect: (id: string, shiftKey: boolean) => void,
  onOpenDetail: (id: string) => void,
): Column<EligibleShipment>[] {
  return [
    {
      key: 'select',
      header: '',
      width: 32,
      minWidth: 32,
      resizable: false,
      render: (s) => (
        <input
          type="checkbox"
          checked={selected.has(s.id)}
          onClick={(e) => {
            e.stopPropagation();
            // checkbox toggles via onChange; do shift-aware select here
            const shift = e.shiftKey;
            // defer to next tick to let onChange run? Use direct handler
            // since onChange will not have shiftKey available.
            e.preventDefault();
            handleSelect(s.id, shift);
          }}
          onChange={() => {
            /* no-op: handled in onClick to capture shiftKey */
          }}
        />
      ),
    },
    {
      key: 'number',
      header: 'Nr.',
      width: 110,
      render: (s) => <span className="font-mono text-xs">{s.shipment_number}</span>,
    },
    {
      key: 'customer',
      header: 'Kunde',
      minWidth: 140,
      render: (s) => (
        <span className="truncate" title={s.customer?.name ?? ''}>
          {s.customer?.name ?? '—'}
        </span>
      ),
    },
    {
      key: 'ort',
      header: 'Ort',
      width: 140,
      render: (s) => (
        <span className="text-xs text-gray-600 truncate">
          {s.delivery_address?.zip} {s.delivery_address?.city}
        </span>
      ),
    },
    {
      key: 'info',
      header: 'Info',
      width: 130,
      render: (s) => (
        <span className="text-xs text-gray-600">
          {s.package_count} Pak
          {s.total_weight_kg
            ? ` · ${Number(s.total_weight_kg).toFixed(0)} kg`
            : ''}
          {s.total_ldm ? ` · ${Number(s.total_ldm).toFixed(2)} LDM` : ''}
        </span>
      ),
    },
    {
      key: 'badges',
      header: 'Status',
      width: 150,
      render: (s) => {
        const b = pickupBadge(s.loading_date);
        return (
          <span className="flex flex-wrap gap-1">
            {s.is_stamm_kunde && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700"
                title="Stammkunde"
              >
                Stamm
              </span>
            )}
            {b && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${b.cls}`}
                title={`Pickup ${s.loading_date.slice(0, 10)}`}
              >
                {b.label}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      width: 48,
      resizable: false,
      align: 'right',
      render: (s) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail(s.id);
          }}
          className="text-gray-500 hover:text-blue-700"
          title="Detail"
        >
          <Pencil size={16} />
        </button>
      ),
    },
  ];
}

export default function NvDispositionPage() {
  const qc = useQueryClient();
  const [mode, setModeState] = useState<'PICKUP' | 'DELIVERY'>(() => {
    if (typeof window === 'undefined') return 'PICKUP';
    try {
      const v = localStorage.getItem('tms.nv-dispo.mode');
      if (v === 'DELIVERY' || v === 'PICKUP') return v;
    } catch {
      /* ignore */
    }
    return 'PICKUP';
  });
  const setMode = (m: 'PICKUP' | 'DELIVERY') => {
    setModeState(m);
    try {
      localStorage.setItem('tms.nv-dispo.mode', m);
    } catch {
      /* ignore */
    }
  };
  const [datum, setDatum] = useState<string>(todayISO());
  const [filterTour, setFilterTour] = useState<string>('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCreateTour, setShowCreateTour] = useState(false);
  const [bulkPickerOpen, setBulkPickerOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [kostenTourId, setKostenTourId] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('tms.nv-dispo.expanded-group');
      if (typeof raw === 'string' && raw.length > 0) return raw;
    } catch {
      /* ignore */
    }
    return null;
  });
  const toggleGroup = (key: string) => {
    setExpandedGroup((prev) => {
      const next = prev === key ? null : key;
      try {
        localStorage.setItem('tms.nv-dispo.expanded-group', next ?? '');
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const [drillDown, setDrillDown] = useState<{
    shipmentId: string;
    shipmentNumber: string;
    customerName?: string;
    tourId: string;
  } | null>(null);
  const [detailShipmentId, setDetailShipmentId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map' | 'split3'>('list');
  const [selectedTourId, setSelectedTourId] = useState<string | null>(null);
  const [clickedSequence, setClickedSequence] = useState<string[]>([]);

  useEffect(() => {
    const detect = () => {
      const w = window.innerWidth;
      setViewMode((prev) => {
        if (w >= 1920) return 'split3';
        if (prev === 'split3') return 'list';
        return prev;
      });
    };
    detect();
    window.addEventListener('resize', detect);
    return () => window.removeEventListener('resize', detect);
  }, []);
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
    queryKey: ['nv-elig', datum, mode, filterTour, debounced],
    queryFn: async () => {
      const params: Record<string, string> = { datum, mode };
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
  const filteredTouren = useMemo(() => {
    const list = tourenQ.data ?? [];
    if (!filterTour) return list;
    return list.filter(
      (t) => t.nv_stamm_tour?.nv_tour_gebiet?.id === filterTour,
    );
  }, [tourenQ.data, filterTour]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['nv-touren'] });
    qc.invalidateQueries({ queryKey: ['nv-elig'] });
    qc.invalidateQueries({ queryKey: ['nv-tour-cost-comp'] });
    qc.invalidateQueries({ queryKey: ['nv-tour-capacity'] });
    qc.invalidateQueries({ queryKey: ['shipment-cost-comp'] });
  };

  const farbenMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of tourGebieteQ.data ?? []) {
      if (g.farbe) m.set(g.code, g.farbe);
    }
    return m;
  }, [tourGebieteQ.data]);

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
          stop_type: mode,
        })
      ).data,
    onSuccess: invalidate,
    onError: (err: any) => {
      const status = err?.response?.status;
      const data = err?.response?.data;
      if (status === 409 && data?.code === 'CAPACITY_EXCEEDED') {
        const axes = (data?.would_exceed ?? [])
          .map((w: any) => `${w.axis} (${w.total}/${w.max})`)
          .join(', ');
        setBanner({
          kind: 'err',
          msg: `Kapazität überschritten: ${axes || 'unbekannt'}`,
        });
      } else {
        setBanner({
          kind: 'err',
          msg: `Hinzufügen fehlgeschlagen (${status ?? '?'}).`,
        });
      }
    },
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
  const updateStopStatusMut = useMutation({
    mutationFn: async (input: {
      tourId: string;
      stopId: string;
      status: 'ARRIVED' | 'COMPLETED' | 'FAILED';
    }) =>
      (
        await api.patch(
          `/nv-touren/${input.tourId}/stops/${input.stopId}`,
          { status: input.status },
        )
      ).data,
    onSuccess: invalidate,
  });
  const updateTourStatusMut = useMutation({
    mutationFn: async (input: {
      tourId: string;
      status: 'DISPATCHED' | 'IN_PROGRESS' | 'COMPLETED';
    }) =>
      (
        await api.patch(`/nv-touren/${input.tourId}`, {
          status: input.status,
        })
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
    mutationFn: async (input: {
      stamm_tour_id: string;
      subunternehmer_id: string | null;
      angefahrene_km: number | null;
      stunden_geleistet: number | null;
      kosten?: {
        fahrer: number | null;
        fahrzeug: number;
        kraftstoff: number;
        dispo: number;
        sonstige: number;
      };
    }) => {
      const created = (
        await api.post('/nv-touren', {
          nv_stamm_tour_id: input.stamm_tour_id,
          datum,
          subunternehmer_id: input.subunternehmer_id ?? undefined,
        })
      ).data as { id: string };
      const patch: any = {};
      if (input.angefahrene_km != null)
        patch.angefahrene_km = input.angefahrene_km;
      if (input.stunden_geleistet != null)
        patch.stunden_geleistet = input.stunden_geleistet;
      if (input.kosten && input.kosten.fahrer != null) {
        patch.fahrer_kosten_eur = input.kosten.fahrer;
        patch.fahrzeug_kosten_eur = input.kosten.fahrzeug;
        patch.kraftstoff_kosten_eur = input.kosten.kraftstoff;
        patch.dispo_kosten_eur = input.kosten.dispo;
        patch.sonstige_kosten_eur = input.kosten.sonstige;
        patch.kosten_modus = 'TARIF';
      }
      if (Object.keys(patch).length > 0) {
        await api.patch(`/nv-touren/${created.id}`, patch);
      }
      return created;
    },
    onSuccess: invalidate,
  });
  const deleteTourMut = useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/nv-touren/${id}`)).data,
    onSuccess: invalidate,
  });
  const autoSuggestMut = useMutation({
    mutationFn: async () => {
      const res = await api.post<{
        touren_created: number;
        touren_created_template?: number;
        new_tours_created?: number;
        stops_added: number;
        stops_skipped_too_big?: number;
        details?: {
          stops_skipped_capacity?: number;
          stops_skipped_too_big?: number;
          new_tours_created?: number;
        }[];
      }>(`/nv-touren/auto-suggest`, undefined, { params: { datum, mode } });
      return res.data;
    },
    onSuccess: (res) => {
      invalidate();
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
      if (skippedCap > 0) parts.push(`${skippedCap} blockiert (Kapazität)`);
      if (tooBig > 0) parts.push(`${tooBig} zu groß (übersprungen)`);
      setBanner({
        kind: hasIssues ? 'err' : 'ok',
        msg: parts.join(' · ') + '.',
      });
    },
    onError: (err: any) => {
      setBanner({
        kind: 'err',
        msg: `Auto-Vorschlag fehlgeschlagen: ${err?.response?.status ?? '?'} ${err?.message ?? ''}`,
      });
    },
  });

  const dropOnTour = (
    tourId: string,
    shipmentId: string,
    source?: 'map' | 'list',
  ) =>
    addStopMut.mutate(
      { tourId, shipmentId },
      {
        onSuccess: () => {
          if (source === 'map') {
            setClickedSequence((seq) =>
              seq.includes(shipmentId) ? seq : [...seq, shipmentId],
            );
          }
          invalidate();
        },
      },
    );

  const onPinClick = (shipmentId: string) => {
    if (!selectedTourId) {
      setBanner({ kind: 'err', msg: 'Erst Ziel-Tour wählen.' });
      return;
    }
    addStopMut.mutate(
      { tourId: selectedTourId, shipmentId },
      {
        onSuccess: () => {
          setClickedSequence((seq) =>
            seq.includes(shipmentId) ? seq : [...seq, shipmentId],
          );
          invalidate();
        },
      },
    );
  };

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

  const flatVisibleIds = useMemo(
    () => groupedElig.flatMap(([, items]) => items.map((s) => s.id)),
    [groupedElig],
  );
  const lastClickedRef = useRef<string | null>(null);

  const handleSelect = (id: string, shiftKey: boolean) => {
    if (shiftKey && lastClickedRef.current) {
      const startIdx = flatVisibleIds.indexOf(lastClickedRef.current);
      const endIdx = flatVisibleIds.indexOf(id);
      if (startIdx >= 0 && endIdx >= 0) {
        const [from, to] = [
          Math.min(startIdx, endIdx),
          Math.max(startIdx, endIdx),
        ];
        const range = flatVisibleIds.slice(from, to + 1);
        setSelected((prev) => {
          const next = new Set(prev);
          for (const r of range) next.add(r);
          return next;
        });
        return;
      }
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastClickedRef.current = id;
  };


  const dropBulkOnTour = async (tourId: string, ids: string[]) => {
    const results = await Promise.allSettled(
      ids.map((shipmentId) =>
        api.post(`/nv-touren/${tourId}/stops`, {
          shipment_id: shipmentId,
          stop_type: mode,
        }),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    setSelected(new Set());
    invalidate();
    if (failed.length === 0) {
      setBanner({ kind: 'ok', msg: `${ok} Sendung(en) hinzugefügt.` });
    } else {
      const first = failed[0]?.reason;
      const status = first?.response?.status;
      const code = first?.response?.data?.code;
      const msg =
        status === 409 && code === 'CAPACITY_EXCEEDED'
          ? `${ok} hinzugefügt, ${failed.length} blockiert (Kapazität überschritten).`
          : `${ok} hinzugefügt, ${failed.length} fehlgeschlagen.`;
      setBanner({ kind: 'err', msg });
    }
  };

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-gray-50">
      <div className="bg-white border-b px-4 py-3 flex flex-wrap items-center gap-3 sticky top-0 z-20">
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
          <button
            type="button"
            onClick={() => {
              if (mode !== 'PICKUP') {
                setMode('PICKUP');
                setSelected(new Set());
                setExpandedGroup(null);
                setClickedSequence([]);
              }
            }}
            className={`px-3 py-1.5 text-sm flex items-center gap-1 ${
              mode === 'PICKUP'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Package size={14} />
            Abholung
          </button>
          <button
            type="button"
            onClick={() => {
              if (mode !== 'DELIVERY') {
                setMode('DELIVERY');
                setSelected(new Set());
                setExpandedGroup(null);
                setClickedSequence([]);
              }
            }}
            className={`px-3 py-1.5 text-sm flex items-center gap-1 border-l border-gray-300 ${
              mode === 'DELIVERY'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Truck size={14} />
            Zustellung
          </button>
        </div>
        <div>
          <label className="block text-[10px] uppercase text-gray-500 mb-0.5">
            {mode === 'DELIVERY' ? 'Zustell-Datum bis' : 'Pickup-Datum bis'}
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
            ) {
              autoSuggestMut.mutate();
            }
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
        {viewMode !== 'split3' && (
          <div className="inline-flex rounded border border-gray-300 overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 ${
                viewMode === 'list'
                  ? 'bg-[#1e40af] text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Liste
            </button>
            <button
              type="button"
              onClick={() => setViewMode('map')}
              className={`px-3 py-2 border-l border-gray-300 ${
                viewMode === 'map'
                  ? 'bg-[#1e40af] text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Karte
            </button>
          </div>
        )}
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

      <div
        className={`flex-1 grid grid-cols-1 gap-3 p-3 overflow-hidden ${
          viewMode === 'split3'
            ? 'lg:grid-cols-[1fr_1.4fr_1.6fr]'
            : 'lg:grid-cols-[2fr_3fr]'
        }`}
      >
        {(viewMode === 'list' || viewMode === 'split3') && (
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
          {groupedElig.map(([groupKey, items]) => {
            const collapsed = expandedGroup !== groupKey;
            const farbe = farbenMap.get(groupKey) ?? '#9ca3af';
            return (
            <div key={groupKey} className="border-b border-gray-200">
              <button
                type="button"
                onClick={() => toggleGroup(groupKey)}
                className="w-full px-3 py-1 bg-gray-100 border-b text-xs font-mono text-gray-700 flex items-center gap-2 hover:bg-gray-200 border-l-4"
                style={{ borderLeftColor: farbe }}
              >
                <span className="inline-block w-3 text-center">
                  {collapsed ? '▶' : '▼'}
                </span>
                <span>{groupKey} ({items.length})</span>
              </button>
              {!collapsed && (
              <ResponsiveTable<EligibleShipment>
                storageKey={`nv-dispo-elig-${groupKey}`}
                columns={eligColumns(
                  selected,
                  handleSelect,
                  (id) => setDetailShipmentId(id),
                )}
                data={items}
                rowKey={(s) => s.id}
                density="compact"
                stickyHeader={false}
                className="rounded-none border-0"
                rowProps={(s) => ({
                  draggable: true,
                  onDragStart: (e: React.DragEvent<HTMLDivElement>) => {
                    e.dataTransfer.setData(
                      'application/json',
                      JSON.stringify({ shipmentId: s.id }),
                    );
                    setDraggingId(s.id);
                  },
                  onDragEnd: () => setDraggingId(null),
                  onClick: (e: React.MouseEvent<HTMLDivElement>) => {
                    handleSelect(s.id, e.shiftKey);
                  },
                  className: `cursor-pointer ${
                    selected.has(s.id) ? 'bg-blue-50' : ''
                  } ${draggingId === s.id ? 'opacity-40' : ''}`,
                })}
              />
              )}
            </div>
            );
          })}
        </div>
        )}

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
            {filteredTouren.map((tour) => (
              <TourCard
                key={tour.id}
                tour={tour}
                onDrop={(shipmentId, source) =>
                  dropOnTour(tour.id, shipmentId, source)
                }
                onMoveStop={(idx, dir) => moveStop(tour, idx, dir)}
                onDeleteStop={(stopId) =>
                  deleteStopMut.mutate({ tourId: tour.id, stopId })
                }
                onDeleteTour={() => {
                  if (confirm(`Tour löschen?`)) deleteTourMut.mutate(tour.id);
                }}
                onOpenKosten={() => setKostenTourId(tour.id)}
                onOpenDrillDown={(shipmentId, shipmentNumber) => {
                  setDrillDown({
                    shipmentId,
                    shipmentNumber,
                    tourId: tour.id,
                  });
                }}
                onSetStopStatus={(stopId, status) =>
                  updateStopStatusMut.mutate({
                    tourId: tour.id,
                    stopId,
                    status,
                  })
                }
                onSetTourStatus={(status, openCount, shipmentCount) => {
                  if (status === 'COMPLETED') {
                    if (
                      !confirm(
                        `Tour abschließen? ${openCount} offene Stop(s) werden completed, ${shipmentCount} Sendung(en) ändern Status.`,
                      )
                    )
                      return;
                  }
                  updateTourStatusMut.mutate({
                    tourId: tour.id,
                    status,
                  });
                }}
              />
            ))}
          </div>
        </div>

        {(viewMode === 'map' || viewMode === 'split3') && (
          <div className="bg-white rounded-lg border overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b bg-gray-50 flex items-center gap-2">
              <h2 className="font-semibold text-sm">Karte</h2>
              <select
                value={selectedTourId ?? ''}
                onChange={(e) => setSelectedTourId(e.target.value || null)}
                className="ml-auto border rounded px-2 py-1 text-xs"
              >
                <option value="">— Ziel-Tour wählen —</option>
                {filteredTouren.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nv_stamm_tour?.code ?? '—'} ({t.stops.length})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-h-0 relative">
              <NvDispoMap
                shipments={((eligQ.data ?? []) as EligibleShipment[])
                  .filter((s) =>
                    expandedGroup
                      ? s.matched_tour_gebiet_code === expandedGroup
                      : true,
                  )
                  .map((s): MapShipment => ({
                    id: s.id,
                    shipment_number: s.shipment_number,
                    customer: s.customer ?? null,
                    loading_address:
                      s.pin_address ?? s.loading_address ?? null,
                    color:
                      (s.matched_tour_gebiet_code &&
                        farbenMap.get(s.matched_tour_gebiet_code)) ||
                      undefined,
                    tour_gebiet_code: s.matched_tour_gebiet_code,
                  }))}
                clickedSequence={clickedSequence}
                onPinClick={onPinClick}
                onReset={() => setClickedSequence([])}
                onRouteError={(msg) => setBanner({ kind: 'err', msg })}
              />
            </div>
          </div>
        )}
      </div>

      {showCreateTour && (
        <CreateTourModal
          stammTouren={stammTourenQ.data ?? []}
          onClose={() => setShowCreateTour(false)}
          onCreate={async (payload) => {
            await createTourMut.mutateAsync(payload);
            setShowCreateTour(false);
          }}
          saving={createTourMut.isPending}
        />
      )}

      {bulkPickerOpen && (
        <BulkTourPicker
          touren={filteredTouren}
          onClose={() => setBulkPickerOpen(false)}
          onPicked={async (tourId) => {
            try {
              await dropBulkOnTour(tourId, [...selected]);
            } finally {
              setBulkPickerOpen(false);
            }
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

      {drillDown && (
        <CostDrillDownModal
          shipmentId={drillDown.shipmentId}
          shipmentNumber={drillDown.shipmentNumber}
          customerName={drillDown.customerName}
          tourId={drillDown.tourId}
          onClose={() => setDrillDown(null)}
        />
      )}

      <ShipmentDetailModal
        shipmentId={detailShipmentId}
        shipments={(eligQ.data ?? []) as unknown as Shipment[]}
        isOpen={!!detailShipmentId}
        onClose={() => setDetailShipmentId(null)}
        onEdit={() => setDetailShipmentId(null)}
        onNavigate={() => {}}
      />
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
  onOpenDrillDown,
  onSetStopStatus,
  onSetTourStatus,
}: {
  tour: NvTour;
  onDrop: (shipmentId: string, source?: 'map' | 'list') => void;
  onMoveStop: (idx: number, dir: -1 | 1) => void;
  onDeleteStop: (stopId: string) => void;
  onDeleteTour: () => void;
  onOpenKosten: () => void;
  onOpenDrillDown: (shipmentId: string, shipmentNumber: string) => void;
  onSetStopStatus: (
    stopId: string,
    status: 'ARRIVED' | 'COMPLETED' | 'FAILED',
  ) => void;
  onSetTourStatus: (
    status: 'DISPATCHED' | 'IN_PROGRESS' | 'COMPLETED',
    openCount: number,
    shipmentCount: number,
  ) => void;
}) {
  const costsQ = useQuery<CostComponent[]>({
    queryKey: ['nv-tour-cost-comp', tour.id],
    queryFn: async () =>
      (await api.get<CostComponent[]>(`/nv-touren/${tour.id}/cost-components`))
        .data,
    staleTime: 30_000,
  });
  const capQ = useQuery<{
    limits: {
      max_paletten: number | null;
      max_gewicht_kg: number | null;
      max_volumen_m3: number | null;
      max_ldm: number | null;
    };
    current: {
      paletten: number;
      gewicht_kg: number;
      volumen_m3: number;
      ldm: number;
    };
    free: {
      paletten: number | null;
      gewicht_kg: number | null;
      volumen_m3: number | null;
      ldm: number | null;
    };
  }>({
    queryKey: ['nv-tour-capacity', tour.id],
    queryFn: async () =>
      (await api.get(`/nv-touren/${tour.id}/capacity`)).data,
    staleTime: 0,
  });
  const costsByShipment = useMemo(() => {
    const m = new Map<string, CostComponent>();
    for (const c of costsQ.data ?? []) {
      if (c.shipment_id) m.set(c.shipment_id, c);
    }
    return m;
  }, [costsQ.data]);
  const sumVorlauf = useMemo(
    () =>
      (costsQ.data ?? []).reduce(
        (s, c) => s + (c.total_eur ? Number(c.total_eur) : 0),
        0,
      ),
    [costsQ.data],
  );
  const [hovered, setHovered] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setHovered(false);
    const json = e.dataTransfer.getData('application/json');
    if (!json) return;
    try {
      const { shipmentId, source } = JSON.parse(json) as {
        shipmentId?: string;
        source?: 'map' | 'list';
      };
      if (shipmentId) onDrop(shipmentId, source);
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
            {tour.kosten_modus === 'SPOT' && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700"
                title="Spot-Preis (manuell eingegeben)"
              >
                SPOT
              </span>
            )}
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
            {sumVorlauf > 0 && (
              <>
                {' · '}
                <span className="font-mono text-emerald-700">
                  Σ € {sumVorlauf.toFixed(0)}
                </span>
              </>
            )}
          </div>
          <CapacityBars cap={capQ.data} />
        </div>
        <div
          className="flex items-center gap-1.5 ml-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {tour.status === 'PLANNING' && (
            <button
              onClick={() =>
                onSetTourStatus('DISPATCHED', 0, 0)
              }
              className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Starten
            </button>
          )}
          {tour.status === 'DISPATCHED' && (
            <button
              onClick={() =>
                onSetTourStatus('IN_PROGRESS', 0, 0)
              }
              className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              In Fahrt
            </button>
          )}
          {tour.status === 'IN_PROGRESS' && (
            <button
              onClick={() => {
                const open = tour.stops.filter(
                  (s) => s.status === 'PLANNED' || s.status === 'ARRIVED',
                ).length;
                onSetTourStatus('COMPLETED', open, open);
              }}
              className="px-2 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
            >
              Abschließen
            </button>
          )}
          <button
            onClick={onDeleteTour}
            className="text-red-500 hover:text-red-700"
            title="Tour löschen"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <ul className="divide-y divide-gray-100">
        {tour.stops.map((s, idx) => (
          <li key={s.id} className="px-3 py-1.5 flex items-center gap-2 text-sm">
            <span className="text-xs font-mono text-gray-500 w-6 text-right">
              {s.position}
            </span>
            {s.stop_type === 'DELIVERY' ? (
              <Truck size={14} className="text-purple-700" />
            ) : (
              <Package size={14} className="text-blue-700" />
            )}
            <span className="inline-flex gap-1">
              {s.status === 'PLANNED' && (
                <button
                  onClick={() => onSetStopStatus(s.id, 'ARRIVED')}
                  className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  title="Anfahrt"
                >
                  → Anfahrt
                </button>
              )}
              {s.status === 'ARRIVED' && (
                <button
                  onClick={() => onSetStopStatus(s.id, 'COMPLETED')}
                  className="px-1.5 py-0.5 text-[10px] bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200"
                  title="Erledigt"
                >
                  ✓ Erledigt
                </button>
              )}
              {(s.status === 'PLANNED' || s.status === 'ARRIVED') && (
                <button
                  onClick={() => onSetStopStatus(s.id, 'FAILED')}
                  className="px-1.5 py-0.5 text-[10px] bg-red-100 text-red-700 rounded hover:bg-red-200"
                  title="Fehlgeschlagen"
                >
                  ✗ Fail
                </button>
              )}
              {s.status === 'COMPLETED' && (
                <span className="px-1.5 py-0.5 text-[10px] bg-emerald-100 text-emerald-700 rounded">
                  ✓
                </span>
              )}
              {s.status === 'FAILED' && (
                <span className="px-1.5 py-0.5 text-[10px] bg-red-100 text-red-700 rounded">
                  ✗
                </span>
              )}
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
            <span
              className="text-xs font-mono text-gray-600 ml-auto"
              title={
                s.servicezeit_min ? `Servicezeit ${s.servicezeit_min} min` : ''
              }
            >
              {(() => {
                const sh = s.shipment;
                const parts: string[] = [];
                if (sh?.package_count != null) {
                  parts.push(`${sh.package_count} Pal`);
                }
                if (sh?.weight_kg != null && Number(sh.weight_kg) > 0) {
                  parts.push(`${Number(sh.weight_kg).toFixed(0)} kg`);
                }
                if (sh?.ldm != null && Number(sh.ldm) > 0) {
                  parts.push(`${Number(sh.ldm).toFixed(2)} LDM`);
                }
                return parts.join(' · ');
              })()}
            </span>
            {(() => {
              const cc = s.shipment?.id
                ? costsByShipment.get(s.shipment.id)
                : null;
              if (!cc || !cc.total_eur) return null;
              return (
                <button
                  onClick={() =>
                    s.shipment &&
                    onOpenDrillDown(s.shipment.id, s.shipment.shipment_number)
                  }
                  className="text-xs font-mono text-emerald-700 hover:underline"
                  title="Cost-Breakdown"
                >
                  € {Number(cc.total_eur).toFixed(2)}
                </button>
              );
            })()}
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

type SubFull = {
  id: string;
  name: string;
  tarif_typ: string;
  tarif_tagespauschale_eur: string | number | null;
  tarif_pro_stop_eur: string | number | null;
  tarif_pro_km_eur: string | number | null;
  tarif_grundgebuehr_eur: string | number | null;
  tarif_pro_stunde_eur: string | number | null;
};

const TOUR_KOSTEN_DEFAULTS = {
  fahrzeug: 90,
  kraftstoff: 70,
  dispo: 30,
  sonstige: 10,
};

function computeFahrer(
  sub: SubFull | null | undefined,
  stops: number,
  km: number | null,
  stunden: number | null,
): number | null {
  if (!sub) return null;
  const num = (v: string | number | null) =>
    v === null || v === undefined ? 0 : Number(v);
  if (sub.tarif_typ === 'TAGESPAUSCHALE') {
    return num(sub.tarif_tagespauschale_eur) || null;
  }
  if (sub.tarif_typ === 'PRO_STOP') {
    return (num(sub.tarif_pro_stop_eur) || 0) * Math.max(1, stops);
  }
  if (sub.tarif_typ === 'KM_BASIERT') {
    if (km == null) return null;
    return num(sub.tarif_grundgebuehr_eur) + num(sub.tarif_pro_km_eur) * km;
  }
  if (sub.tarif_typ === 'STUNDEN_BASIERT') {
    if (stunden == null) return null;
    return num(sub.tarif_pro_stunde_eur) * stunden;
  }
  return null;
}

type CreatePayload = {
  stamm_tour_id: string;
  subunternehmer_id: string | null;
  angefahrene_km: number | null;
  stunden_geleistet: number | null;
  kosten?: {
    fahrer: number | null;
    fahrzeug: number;
    kraftstoff: number;
    dispo: number;
    sonstige: number;
  };
};

function CreateTourModal({
  stammTouren,
  onClose,
  onCreate,
  saving,
}: {
  stammTouren: StammTour[];
  onClose: () => void;
  onCreate: (payload: CreatePayload) => void;
  saving: boolean;
}) {
  const [stammTourId, setStammTourId] = useState('');
  const [subId, setSubId] = useState<string>('');
  const [km, setKm] = useState<number | null>(null);
  const [stunden, setStunden] = useState<number | null>(null);

  const subsQ = useQuery<SubFull[]>({
    queryKey: ['nv-subunternehmer', 'all-active'],
    queryFn: async () =>
      (await api.get<SubFull[]>('/nv-subunternehmer')).data.filter(
        (s: any) => s.aktiv !== false,
      ),
  });
  const subs = subsQ.data ?? [];
  const selectedSub = subs.find((s) => s.id === subId) ?? null;

  const stamm = stammTouren.find((s) => s.id === stammTourId) ?? null;
  useEffect(() => {
    if (!subId && stamm?.default_subunternehmer_id) {
      setSubId(stamm.default_subunternehmer_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stammTourId, stamm?.default_subunternehmer_id]);

  const handleCreate = () => {
    if (!stammTourId) return;
    const fahrer = computeFahrer(selectedSub, 0, km, stunden);
    const hasTarif =
      selectedSub &&
      selectedSub.tarif_typ !== 'SPOT' &&
      fahrer !== null;
    onCreate({
      stamm_tour_id: stammTourId,
      subunternehmer_id: subId || null,
      angefahrene_km: km,
      stunden_geleistet: stunden,
      kosten: hasTarif
        ? {
            fahrer,
            fahrzeug: TOUR_KOSTEN_DEFAULTS.fahrzeug,
            kraftstoff: TOUR_KOSTEN_DEFAULTS.kraftstoff,
            dispo: TOUR_KOSTEN_DEFAULTS.dispo,
            sonstige: TOUR_KOSTEN_DEFAULTS.sonstige,
          }
        : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
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
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Subunternehmer
            </label>
            <select
              value={subId}
              onChange={(e) => setSubId(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="">— keiner —</option>
              {subs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.tarif_typ})
                </option>
              ))}
            </select>
          </div>
          {selectedSub?.tarif_typ === 'KM_BASIERT' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Angefahrene KM
              </label>
              <input
                type="number"
                min={0}
                step="0.1"
                value={km ?? ''}
                onChange={(e) =>
                  setKm(e.target.value === '' ? null : Number(e.target.value))
                }
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          )}
          {selectedSub?.tarif_typ === 'STUNDEN_BASIERT' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Geleistete Stunden
              </label>
              <input
                type="number"
                min={0}
                step="0.25"
                value={stunden ?? ''}
                onChange={(e) =>
                  setStunden(
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
          >
            Abbrechen
          </button>
          <button
            onClick={handleCreate}
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

function CapacityBars({
  cap,
}: {
  cap?: {
    limits: {
      max_paletten: number | null;
      max_gewicht_kg: number | null;
      max_volumen_m3: number | null;
      max_ldm: number | null;
    };
    current: {
      paletten: number;
      gewicht_kg: number;
      volumen_m3: number;
      ldm: number;
    };
  };
}) {
  if (!cap) return null;
  const { limits, current } = cap;
  const allSet =
    limits.max_paletten != null &&
    limits.max_gewicht_kg != null &&
    limits.max_volumen_m3 != null &&
    limits.max_ldm != null;
  if (!allSet) {
    return (
      <div className="text-[10px] text-gray-400 mt-1">
        Kapazität nicht konfiguriert
      </div>
    );
  }
  const items: { label: string; cur: number; max: number; unit: string }[] = [
    { label: 'Pal', cur: current.paletten, max: limits.max_paletten as number, unit: '' },
    {
      label: 'kg',
      cur: current.gewicht_kg,
      max: limits.max_gewicht_kg as number,
      unit: '',
    },
    {
      label: 'm³',
      cur: current.volumen_m3,
      max: limits.max_volumen_m3 as number,
      unit: '',
    },
    {
      label: 'LDM',
      cur: current.ldm,
      max: limits.max_ldm as number,
      unit: '',
    },
  ];
  return (
    <div className="flex gap-2 mt-1.5">
      {items.map((it) => {
        const pct = it.max > 0 ? (it.cur / it.max) * 100 : 0;
        const over = pct > 100;
        const clamped = Math.min(100, Math.max(0, pct));
        return (
          <div key={it.label} className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between text-[10px] leading-none mb-0.5">
              <span className="text-gray-500">{it.label}</span>
              <span
                className={`font-mono ${over ? 'text-red-700 font-semibold' : 'text-gray-600'}`}
              >
                {Math.round(it.cur)}/{Math.round(it.max)}
              </span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded overflow-hidden">
              <div
                className={`h-full ${over ? 'bg-red-600' : 'bg-emerald-500'}`}
                style={{ width: `${clamped}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
