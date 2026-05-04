import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ExternalLink, Eye, Package, Pencil, Plus, Sparkles, Trash2, Truck } from 'lucide-react';
import NvTourKostenModal from '../components/NvTourKostenModal';
import ShipmentDetailModal from '../components/ShipmentDetailModal';
import ShipmentEditModal from '../components/ShipmentEditModal';
import BulkTourPicker from '../components/nv/BulkTourPicker';
import CreateTourModal from '../components/nv/CreateTourModal';
import { haversineKm } from '../lib/distance';
import type { Shipment } from '../types/shipment';
import NvDispoMap from '../components/nv/NvDispoMap';
import type { MapShipment, TourStopPin } from '../components/nv/NvDispoMap';
import CostDrillDownModal from '../components/nv/CostDrillDownModal';
import type { CostComponent } from '../components/nv/CostDrillDownModal';
import ResponsiveTable from '../components/table/ResponsiveTable';
import type { Column } from '../components/table/ResponsiveTable';
import { api } from '../lib/api';

type TourGebiet = {
  id: string;
  code: string;
  name: string;
  farbe?: string | null;
  plz_pattern?: string[] | null;
};
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
  name?: string | null;
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
    freight_revenue?: string | number | null;
    addresses_shipments_loading_address_idToaddresses?: AddressGeo | null;
    addresses_shipments_delivery_address_idToaddresses?: AddressGeo | null;
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
  geplante_km: string | number | null;
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

const TOUR_RADIUS_KM = 20;

function eligColumns(
  onOpenDetail: (id: string) => void,
): Column<EligibleShipment>[] {
  return [
    {
      key: 'detail',
      header: '',
      width: 32,
      minWidth: 32,
      resizable: false,
      render: (s) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail(s.id);
          }}
          className="text-gray-500 hover:text-blue-700"
          title="Detail"
        >
          <Eye size={16} />
        </button>
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
  const [pinAddShipmentId, setPinAddShipmentId] = useState<string | null>(
    null,
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [kostenTourId, setKostenTourId] = useState<string | null>(null);
  const [activeTourViewId, setActiveTourViewId] = useState<string | null>(
    null,
  );
  const [activeTourStatuses, setActiveTourStatuses] = useState<Set<string>>(
    () => {
      if (typeof window === 'undefined') return new Set(['PLANNING']);
      try {
        const raw = localStorage.getItem('tms.nv-dispo.tour-statuses');
        const arr = raw ? (JSON.parse(raw) as unknown) : null;
        if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) {
          const s = new Set(arr as string[]);
          if (s.size > 0) return s;
        }
      } catch {
        /* ignore */
      }
      return new Set(['PLANNING']);
    },
  );
  const toggleTourStatus = (st: string) => {
    setActiveTourStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(st)) next.delete(st);
      else next.add(st);
      const final = next.size === 0 ? new Set(['PLANNING']) : next;
      try {
        localStorage.setItem(
          'tms.nv-dispo.tour-statuses',
          JSON.stringify([...final]),
        );
      } catch {
        /* ignore */
      }
      return final;
    });
  };
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
  const [editingShipmentId, setEditingShipmentId] = useState<string | null>(
    null,
  );
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

  const defaultWarehouseQ = useQuery<{
    id: string;
    name: string;
    lat: string | number | null;
    lng: string | number | null;
  } | null>({
    queryKey: ['warehouses', 'default'],
    queryFn: async () =>
      (
        await api.get<{
          id: string;
          name: string;
          lat: string | number | null;
          lng: string | number | null;
        } | null>('/warehouses/default')
      ).data,
    staleTime: 5 * 60_000,
  });

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
  const statusKey = useMemo(
    () => [...activeTourStatuses].sort().join(','),
    [activeTourStatuses],
  );
  const tourenQ = useQuery<NvTour[]>({
    queryKey: ['nv-touren', datum, statusKey],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('datum', datum);
      for (const s of activeTourStatuses) params.append('status', s);
      return (await api.get<NvTour[]>('/nv-touren', { params })).data;
    },
    enabled: !!datum,
  });
  const filteredTouren = useMemo(() => {
    const list = tourenQ.data ?? [];
    if (!filterTour) return list;
    return list.filter(
      (t) => t.nv_stamm_tour?.nv_tour_gebiet?.id === filterTour,
    );
  }, [tourenQ.data, filterTour]);

  // Detail-/Edit-Modal benötigt Sendungen aus eligible UND aus
  // bereits gestoppten Tour-Sendungen (sonst null beim Eye-Klick im Tour).
  const allShipmentsForDetail = useMemo(() => {
    const map = new Map<string, unknown>();
    for (const s of eligQ.data ?? []) map.set(s.id, s);
    for (const t of tourenQ.data ?? []) {
      for (const stop of t.stops) {
        if (stop.shipment && !map.has(stop.shipment.id)) {
          map.set(stop.shipment.id, stop.shipment);
        }
      }
    }
    return Array.from(map.values()) as Shipment[];
  }, [eligQ.data, tourenQ.data]);

  const popupChannelRef = useRef<BroadcastChannel | null>(null);
  const popupWindowRef = useRef<Window | null>(null);
  const [mapInPopup, setMapInPopup] = useState(false);
  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel('tms-nv-dispo-popup');
      popupChannelRef.current = ch;
      ch.onmessage = (ev) => {
        const data = ev.data as { type?: string } | undefined;
        if (data?.type === 'invalidate') {
          qc.invalidateQueries({ queryKey: ['nv-touren'] });
          qc.invalidateQueries({ queryKey: ['nv-elig'] });
          qc.invalidateQueries({ queryKey: ['nv-tour-cost-comp'] });
          qc.invalidateQueries({ queryKey: ['nv-tour-capacity'] });
          qc.invalidateQueries({ queryKey: ['shipment-cost-comp'] });
        }
      };
    } catch {
      /* BroadcastChannel not supported -> silent no-op */
    }
    return () => {
      try {
        ch?.close();
      } catch {
        /* ignore */
      }
      popupChannelRef.current = null;
    };
  }, [qc]);

  useEffect(() => {
    if (!mapInPopup) return;
    const id = window.setInterval(() => {
      if (popupWindowRef.current?.closed) {
        popupWindowRef.current = null;
        setMapInPopup(false);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [mapInPopup]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['nv-touren'] });
    qc.invalidateQueries({ queryKey: ['nv-elig'] });
    qc.invalidateQueries({ queryKey: ['nv-tour-cost-comp'] });
    qc.invalidateQueries({ queryKey: ['nv-tour-capacity'] });
    qc.invalidateQueries({ queryKey: ['shipment-cost-comp'] });
    try {
      popupChannelRef.current?.postMessage({ type: 'invalidate' });
    } catch {
      /* ignore */
    }
  };

  const openMapPopup = () => {
    if (popupWindowRef.current && !popupWindowRef.current.closed) {
      popupWindowRef.current.focus();
      return;
    }
    const url = `/nv-disposition/map-popup?datum=${encodeURIComponent(
      datum,
    )}&mode=${mode}`;
    const w = window.open(
      url,
      'nv-dispo-map-popup',
      'width=1200,height=900,noopener=no',
    );
    if (!w) {
      setBanner({
        kind: 'err',
        msg: 'Pop-up blockiert — bitte für diese Seite erlauben.',
      });
      return;
    }
    popupWindowRef.current = w;
    setMapInPopup(true);
    if (viewMode === 'map') setViewMode('list');
  };

  const activeTour = useMemo(
    () =>
      activeTourViewId
        ? (tourenQ.data ?? []).find((t) => t.id === activeTourViewId) ?? null
        : null,
    [activeTourViewId, tourenQ.data],
  );

  const activeTourStopPins = useMemo<TourStopPin[]>(() => {
    if (!activeTour) return [];
    const stops: TourStopPin[] = [];
    for (const s of [...activeTour.stops].sort(
      (a, b) => a.position - b.position,
    )) {
      const sh: any = s.shipment;
      if (!sh) continue;
      const addr =
        s.stop_type === 'DELIVERY'
          ? sh.addresses_shipments_delivery_address_idToaddresses
          : sh.addresses_shipments_loading_address_idToaddresses;
      if (!addr || addr.lat == null || addr.lng == null) continue;
      const lat = Number(addr.lat);
      const lng = Number(addr.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      stops.push({
        id: s.id,
        position: s.position,
        shipment_number: sh.shipment_number,
        lat,
        lng,
      });
    }
    const wh = defaultWarehouseQ.data;
    const whLat = wh?.lat != null ? Number(wh.lat) : null;
    const whLng = wh?.lng != null ? Number(wh.lng) : null;
    if (
      wh &&
      whLat != null &&
      whLng != null &&
      Number.isFinite(whLat) &&
      Number.isFinite(whLng) &&
      stops.length > 0
    ) {
      return [
        {
          id: `wh-start-${wh.id}`,
          position: 0,
          lat: whLat,
          lng: whLng,
          isWarehouse: true,
          label: wh.name,
        },
        ...stops,
        {
          id: `wh-end-${wh.id}`,
          position: 9999,
          lat: whLat,
          lng: whLng,
          isWarehouse: true,
          label: wh.name,
        },
      ];
    }
    if (stops.length > 0 && (!wh || whLat == null || whLng == null)) {
      console.warn(
        '[NV-Tour-View] Default-Lager hat keine Geocoding-Daten — Tour ohne Lager-Pins gerendert.',
      );
    }
    return stops;
  }, [activeTour, defaultWarehouseQ.data]);

  const activeTourPlzSet = useMemo(() => {
    if (!activeTour) return null;
    const set = new Set<string>();
    // PLZ aus tour.nv_stamm_tour.nv_tour_gebiet.plz_pattern
    const pp =
      (activeTour.nv_stamm_tour?.nv_tour_gebiet as any)?.plz_pattern;
    if (Array.isArray(pp)) for (const p of pp) if (typeof p === 'string') set.add(p);
    // PLZ aus Stop-Adressen
    for (const s of activeTour.stops) {
      const sh: any = s.shipment;
      if (!sh) continue;
      const addr =
        s.stop_type === 'DELIVERY'
          ? sh.addresses_shipments_delivery_address_idToaddresses
          : sh.addresses_shipments_loading_address_idToaddresses;
      if (addr?.zip) set.add(addr.zip);
    }
    return set;
  }, [activeTour]);

  const activeTourStopCoords = useMemo<Array<[number, number]>>(() => {
    if (!activeTour) return [];
    const out: Array<[number, number]> = [];
    for (const s of activeTour.stops) {
      const sh: any = s.shipment;
      if (!sh) continue;
      const addr =
        s.stop_type === 'DELIVERY'
          ? sh.addresses_shipments_delivery_address_idToaddresses
          : sh.addresses_shipments_loading_address_idToaddresses;
      if (!addr) continue;
      const lat = addr.lat != null ? Number(addr.lat) : NaN;
      const lng = addr.lng != null ? Number(addr.lng) : NaN;
      if (Number.isFinite(lat) && Number.isFinite(lng)) out.push([lat, lng]);
    }
    return out;
  }, [activeTour]);

  const isEligibleInActiveTour = useMemo(() => {
    // Kein Filter wenn weder PLZ-Pattern noch Tour-Stops vorhanden
    // (sonst würde alles ausgeblendet wenn Tour leer ist).
    const hasPlz = !!activeTourPlzSet && activeTourPlzSet.size > 0;
    if (!hasPlz && activeTourStopCoords.length === 0) {
      return null;
    }
    return (s: EligibleShipment): boolean => {
      const zip = s.pin_address?.zip ?? s.loading_address?.zip ?? '';
      if (zip && activeTourPlzSet?.has(zip)) return true;
      const lat =
        s.pin_address?.lat != null
          ? Number(s.pin_address.lat)
          : s.loading_address?.lat != null
            ? Number(s.loading_address.lat)
            : NaN;
      const lng =
        s.pin_address?.lng != null
          ? Number(s.pin_address.lng)
          : s.loading_address?.lng != null
            ? Number(s.loading_address.lng)
            : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
      for (const [tlat, tlng] of activeTourStopCoords) {
        if (haversineKm(lat, lng, tlat, tlng) <= TOUR_RADIUS_KM) return true;
      }
      return false;
    };
  }, [activeTourPlzSet, activeTourStopCoords]);

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
    onMutate: async (input) => {
      // Optimistic: Sendung sofort aus eligible-Liste entfernen
      await qc.cancelQueries({ queryKey: ['nv-elig'] });
      const prev = qc.getQueriesData<EligibleShipment[]>({
        queryKey: ['nv-elig'],
      });
      qc.setQueriesData<EligibleShipment[]>(
        { queryKey: ['nv-elig'] },
        (old) => (old ? old.filter((s) => s.id !== input.shipmentId) : old),
      );
      return { prev };
    },
    onError: (err: any, _input, ctx) => {
      // Rollback eligible-Liste
      if (ctx?.prev) {
        for (const [key, data] of ctx.prev) {
          qc.setQueryData(key, data);
        }
      }
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
    onSettled: () => {
      invalidate();
    },
  });
  const deleteStopMut = useMutation({
    mutationFn: async (input: { tourId: string; stopId: string }) =>
      (
        await api.delete(
          `/nv-touren/${input.tourId}/stops/${input.stopId}`,
        )
      ).data,
    onMutate: async (input) => {
      // Optimistic: Stop sofort aus tour-Liste entfernen
      await qc.cancelQueries({ queryKey: ['nv-touren'] });
      const prev = qc.getQueriesData<NvTour[]>({ queryKey: ['nv-touren'] });
      qc.setQueriesData<NvTour[]>({ queryKey: ['nv-touren'] }, (old) =>
        old
          ? old.map((t) =>
              t.id === input.tourId
                ? {
                    ...t,
                    stops: t.stops.filter((s) => s.id !== input.stopId),
                  }
                : t,
            )
          : old,
      );
      return { prev };
    },
    onError: (err: any, _input, ctx) => {
      if (ctx?.prev) {
        for (const [key, data] of ctx.prev) {
          qc.setQueryData(key, data);
        }
      }
      setBanner({
        kind: 'err',
        msg: `Entfernen fehlgeschlagen (${err?.response?.status ?? '?'}).`,
      });
    },
    onSettled: () => {
      invalidate();
    },
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
    // Bevorzuge aktive Tour-View; sonst Ziel-Tour aus Header-Dropdown
    const targetTourId = activeTourViewId ?? selectedTourId;
    if (!targetTourId) {
      // Keine Tour aktiv UND keine Ziel-Tour: Picker öffnen
      setPinAddShipmentId(shipmentId);
      return;
    }
    addStopMut.mutate(
      { tourId: targetTourId, shipmentId },
      {
        onSuccess: () => {
          setClickedSequence((seq) =>
            seq.includes(shipmentId) ? seq : [...seq, shipmentId],
          );
          invalidate();
          // Background-Reorder/KM in 1-2s fertig — zweites invalidate
          window.setTimeout(invalidate, 3000);
        },
      },
    );
  };

  const handleTourStopClick = (stopId: string) => {
    if (!activeTourViewId) return;
    deleteStopMut.mutate(
      { tourId: activeTourViewId, stopId },
      {
        onSuccess: () => {
          invalidate();
          window.setTimeout(invalidate, 3000);
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
        <div className="inline-flex rounded border border-gray-300 overflow-hidden text-xs">
          {(
            [
              ['PLANNING', 'Planung'],
              ['DISPATCHED', 'Gestartet'],
              ['IN_PROGRESS', 'In Fahrt'],
              ['COMPLETED', 'Abgeschlossen'],
            ] as const
          ).map(([key, label], i) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleTourStatus(key)}
              className={`px-2.5 py-1.5 ${i > 0 ? 'border-l border-gray-300' : ''} ${
                activeTourStatuses.has(key)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
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
              disabled={mapInPopup}
              title={mapInPopup ? 'Karte ist im Pop-out-Fenster' : undefined}
              className={`px-3 py-2 border-l border-gray-300 ${
                viewMode === 'map'
                  ? 'bg-[#1e40af] text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
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
          mapInPopup
            ? 'lg:grid-cols-1'
            : viewMode === 'split3'
              ? 'lg:grid-cols-[1fr_1.4fr_1.6fr]'
              : 'lg:grid-cols-[2fr_3fr]'
        }`}
      >
        {(viewMode === 'list' || viewMode === 'split3') && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-y-auto">
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
                columns={eligColumns((id) => setDetailShipmentId(id))}
                data={items}
                rowKey={(s) => s.id}
                density="compact"
                stickyHeader={false}
                className="rounded-none border-0"
                rowProps={(s) => ({
                  draggable: true,
                  onDragStart: (e: React.DragEvent<HTMLDivElement>) => {
                    const idsToDrag =
                      selected.has(s.id) && selected.size > 1
                        ? Array.from(selected)
                        : [s.id];
                    e.dataTransfer.setData(
                      'application/json',
                      JSON.stringify({
                        shipmentIds: idsToDrag,
                        source: 'list',
                      }),
                    );
                    if (idsToDrag.length > 1) {
                      const ghost = document.createElement('div');
                      ghost.textContent = `${idsToDrag.length} Sendungen ziehen`;
                      ghost.style.cssText =
                        'position:absolute;top:-1000px;left:-1000px;padding:6px 10px;background:#1e40af;color:white;border-radius:6px;font-size:12px;font-weight:500;font-family:system-ui,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.3);';
                      document.body.appendChild(ghost);
                      e.dataTransfer.setDragImage(ghost, 10, 10);
                      setTimeout(() => {
                        document.body.removeChild(ghost);
                      }, 0);
                    }
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

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-y-auto">
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
                onDrop={(ids, source) => {
                  if (ids.length === 1) {
                    dropOnTour(tour.id, ids[0], source);
                  } else {
                    dropBulkOnTour(tour.id, ids);
                  }
                }}
                onMoveStop={(idx, dir) => moveStop(tour, idx, dir)}
                onDeleteStop={(stopId) =>
                  deleteStopMut.mutate({ tourId: tour.id, stopId })
                }
                onDeleteTour={() => {
                  if (confirm(`Tour löschen?`)) deleteTourMut.mutate(tour.id);
                }}
                onOpenKosten={() => setKostenTourId(tour.id)}
                onOpenDetail={(shipmentId) =>
                  setDetailShipmentId(shipmentId)
                }
                onToggleTourView={() =>
                  setActiveTourViewId((prev) =>
                    prev === tour.id ? null : tour.id,
                  )
                }
                isActive={activeTourViewId === tour.id}
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

        {!mapInPopup && (viewMode === 'map' || viewMode === 'split3') && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden flex flex-col">
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
              <button
                onClick={openMapPopup}
                className="text-gray-500 hover:text-blue-700"
                title="Karte in neuem Fenster öffnen"
              >
                <ExternalLink size={14} />
              </button>
            </div>
            <div className="flex-1 min-h-0 relative">
              <NvDispoMap
                shipments={((eligQ.data ?? []) as EligibleShipment[])
                  .filter((s) => {
                    if (isEligibleInActiveTour) {
                      return isEligibleInActiveTour(s);
                    }
                    return expandedGroup
                      ? s.matched_tour_gebiet_code === expandedGroup
                      : true;
                  })
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
                tourStops={activeTour ? activeTourStopPins : undefined}
                onTourStopClick={handleTourStopClick}
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
            const created = await createTourMut.mutateAsync(payload);
            setShowCreateTour(false);
            // Wenn aus Pin-Picker gestartet → Sendung zur neuen Tour hinzu
            if (pinAddShipmentId && created?.id) {
              addStopMut.mutate({
                tourId: created.id,
                shipmentId: pinAddShipmentId,
              });
              setPinAddShipmentId(null);
            }
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

      {pinAddShipmentId && !showCreateTour && (
        <BulkTourPicker
          title="Tour für Sendung wählen"
          touren={filteredTouren}
          onClose={() => setPinAddShipmentId(null)}
          onPicked={(tourId) => {
            const sid = pinAddShipmentId;
            setPinAddShipmentId(null);
            if (sid) {
              addStopMut.mutate(
                { tourId, shipmentId: sid },
                {
                  onSuccess: () => {
                    setClickedSequence((seq) =>
                      seq.includes(sid) ? seq : [...seq, sid],
                    );
                    invalidate();
                  },
                },
              );
            }
          }}
          onCreateNew={() => setShowCreateTour(true)}
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
        shipments={allShipmentsForDetail}
        isOpen={!!detailShipmentId}
        onClose={() => setDetailShipmentId(null)}
        onEdit={() => {
          if (detailShipmentId) {
            setEditingShipmentId(detailShipmentId);
            setDetailShipmentId(null);
          }
        }}
        onNavigate={() => {}}
      />
      {editingShipmentId &&
        (() => {
          const target = allShipmentsForDetail.find(
            (s) => s.id === editingShipmentId,
          );
          if (!target) {
            setEditingShipmentId(null);
            return null;
          }
          return (
            <ShipmentEditModal
              shipment={target}
              open={!!editingShipmentId}
              onOpenChange={(o) => {
                if (!o) {
                  setEditingShipmentId(null);
                  invalidate();
                  qc.invalidateQueries({ queryKey: ['shipments'] });
                }
              }}
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
  onOpenDrillDown,
  onOpenDetail,
  onSetStopStatus,
  onSetTourStatus,
  onToggleTourView,
  isActive,
}: {
  tour: NvTour;
  onDrop: (shipmentIds: string[], source?: 'map' | 'list') => void;
  onMoveStop: (idx: number, dir: -1 | 1) => void;
  onDeleteStop: (stopId: string) => void;
  onDeleteTour: () => void;
  onOpenKosten: () => void;
  onOpenDrillDown: (shipmentId: string, shipmentNumber: string) => void;
  onOpenDetail: (shipmentId: string) => void;
  onSetStopStatus: (
    stopId: string,
    status: 'ARRIVED' | 'COMPLETED' | 'FAILED',
  ) => void;
  onSetTourStatus: (
    status: 'DISPATCHED' | 'IN_PROGRESS' | 'COMPLETED',
    openCount: number,
    shipmentCount: number,
  ) => void;
  onToggleTourView: () => void;
  isActive: boolean;
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
  const tourAggregates = useMemo(() => {
    // Stopps = distinct loading- bzw. delivery-Adressen (mode-spezifisch
    // pro Stop). Gleicher Algo wie computeStopGroups in stop-list.
    const seen = new Set<string>();
    let sumErloes = 0;
    for (const s of tour.stops) {
      const sh: any = s.shipment;
      const addr =
        s.stop_type === 'DELIVERY'
          ? sh?.addresses_shipments_delivery_address_idToaddresses
          : sh?.addresses_shipments_loading_address_idToaddresses;
      const key = addr
        ? `${addr.street ?? ''}|${addr.zip ?? ''}|${addr.city ?? ''}`
        : `__none-${s.id}`;
      seen.add(key);
      const fr = sh?.freight_revenue;
      if (fr != null) {
        const n = Number(fr);
        if (Number.isFinite(n)) sumErloes += n;
      }
    }
    const distinctStops = seen.size;
    const totalKosten = tour.total_kosten_eur
      ? Number(tour.total_kosten_eur)
      : 0;
    const perStop =
      distinctStops > 0 && totalKosten > 0 ? totalKosten / distinctStops : 0;
    const sumDB = sumErloes - totalKosten;
    return { distinctStops, totalKosten, perStop, sumErloes, sumDB };
  }, [tour.stops, tour.total_kosten_eur]);

  const [hovered, setHovered] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setHovered(false);
    const json = e.dataTransfer.getData('application/json');
    if (!json) return;
    try {
      const parsed = JSON.parse(json) as {
        shipmentId?: string;
        shipmentIds?: string[];
        source?: 'map' | 'list';
      };
      const ids = Array.isArray(parsed.shipmentIds)
        ? parsed.shipmentIds
        : parsed.shipmentId
          ? [parsed.shipmentId]
          : [];
      if (ids.length > 0) onDrop(ids, parsed.source);
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
      className={`rounded-lg ${
        hovered
          ? 'border-2 border-blue-500 bg-blue-50 shadow-md'
          : isActive
            ? 'border-2 bg-white shadow-md'
            : 'border border-gray-200 bg-white shadow-sm'
      }`}
      style={
        isActive && !hovered
          ? {
              borderColor:
                tour.nv_stamm_tour?.nv_tour_gebiet?.farbe ?? '#1e40af',
              backgroundColor:
                (tour.nv_stamm_tour?.nv_tour_gebiet?.farbe ?? '#1e40af') +
                '14',
            }
          : undefined
      }
    >
      <div
        className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between cursor-pointer hover:bg-gray-100"
        onClick={onToggleTourView}
        title={isActive ? 'Tour-Karte schließen' : 'Tour-Karte anzeigen'}
      >
        <div>
          <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
            <span>{tour.nv_stamm_tour?.code ?? '—'}</span>
            <span className="text-xs text-gray-500">
              {tour.subunternehmer?.business_partner?.name ??
                tour.subunternehmer?.name ??
                '— kein Sub —'}
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                tour.status === 'PLANNING'
                  ? 'bg-blue-100 text-blue-700'
                  : tour.status === 'COMPLETED'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-700'
              }`}
            >
              {tour.status}
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
          <div className="text-xs text-gray-500 flex items-center gap-1 flex-wrap">
            {(() => {
              const parts: React.ReactNode[] = [];
              parts.push(
                <span key="stopps">
                  Stopps:{' '}
                  <span className="font-mono text-gray-700">
                    {tourAggregates.distinctStops}
                  </span>
                </span>,
              );
              if (tour.geplante_km != null) {
                parts.push(
                  <span key="km">
                    KM:{' '}
                    <span className="font-mono text-slate-600">
                      {Number(tour.geplante_km).toFixed(0)}
                    </span>
                  </span>,
                );
              }
              if (tourAggregates.perStop > 0) {
                parts.push(
                  <span key="perstop">
                    Ø/Stop:{' '}
                    <span className="font-mono text-gray-700">
                      €{tourAggregates.perStop.toFixed(0)}
                    </span>
                  </span>,
                );
              }
              if (tourAggregates.sumErloes > 0) {
                parts.push(
                  <span key="erloes">
                    Erlös:{' '}
                    <span className="font-mono text-emerald-700">
                      €{tourAggregates.sumErloes.toFixed(0)}
                    </span>
                  </span>,
                );
              }
              if (tourAggregates.totalKosten > 0) {
                parts.push(
                  <span key="kosten">
                    Kosten:{' '}
                    <span className="font-mono text-rose-700">
                      €{tourAggregates.totalKosten.toFixed(0)}
                    </span>
                  </span>,
                );
              }
              if (
                tourAggregates.sumErloes > 0 &&
                tourAggregates.totalKosten > 0
              ) {
                parts.push(
                  <span key="db">
                    DB:{' '}
                    <span
                      className={`font-mono ${
                        tourAggregates.sumDB >= 0
                          ? 'text-emerald-700'
                          : 'text-rose-700'
                      }`}
                    >
                      €{tourAggregates.sumDB.toFixed(0)}
                    </span>
                  </span>,
                );
              }
              return parts.map((p, i) => (
                <span key={i} className="inline-flex items-center gap-1">
                  {i > 0 && <span className="text-gray-300">·</span>}
                  {p}
                </span>
              ));
            })()}
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
            onClick={onOpenKosten}
            className="text-blue-600 hover:text-blue-800"
            title="Kosten bearbeiten"
          >
            <Pencil size={16} />
          </button>
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
        {(() => {
          // Adress-Gruppierung: aufeinanderfolgende Stops mit gleicher
          // Loading- bzw. Delivery-Adresse erhalten dieselbe Stop-Nr.
          type Group = {
            stopNr: number;
            addressLabel: string;
            firstIdx: number;
            lastIdx: number;
            items: { stop: Stop; idx: number }[];
          };
          const groups: Group[] = [];
          let currentNr = 0;
          let lastKey: string | null = null;
          tour.stops.forEach((s, idx) => {
            const sh = s.shipment;
            const addr =
              s.stop_type === 'DELIVERY'
                ? sh?.addresses_shipments_delivery_address_idToaddresses
                : sh?.addresses_shipments_loading_address_idToaddresses;
            const key = addr
              ? `${addr.street ?? ''}|${addr.zip ?? ''}|${addr.city ?? ''}`
              : `__none-${s.id}`;
            if (key !== lastKey) {
              currentNr += 1;
              lastKey = key;
              const label = addr
                ? [
                    [addr.zip, addr.city].filter(Boolean).join(' '),
                    addr.street,
                    addr.name,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : '— Adresse fehlt —';
              groups.push({
                stopNr: currentNr,
                addressLabel: label,
                firstIdx: idx,
                lastIdx: idx,
                items: [],
              });
            }
            const g = groups[groups.length - 1];
            g.lastIdx = idx;
            g.items.push({ stop: s, idx });
          });
          return groups.map((g) => (
            <li key={`group-${g.firstIdx}`} className="text-sm">
              <div className="px-3 py-1.5 flex items-center gap-2 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-mono font-semibold text-gray-700 w-10">
                  Stop {g.stopNr}
                </span>
                {g.items[0].stop.stop_type === 'DELIVERY' ? (
                  <Truck size={14} className="text-purple-700" />
                ) : (
                  <Package size={14} className="text-blue-700" />
                )}
                <span className="text-xs text-gray-700 truncate flex-1">
                  {g.addressLabel}
                </span>
                <button
                  onClick={() => onMoveStop(g.firstIdx, -1)}
                  disabled={g.firstIdx === 0}
                  className="text-gray-500 hover:text-gray-700 disabled:opacity-30"
                  title="Stop nach oben"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  onClick={() => onMoveStop(g.lastIdx, 1)}
                  disabled={g.lastIdx === tour.stops.length - 1}
                  className="text-gray-500 hover:text-gray-700 disabled:opacity-30"
                  title="Stop nach unten"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  onClick={() => {
                    const n = g.items.length;
                    if (
                      !confirm(
                        n === 1
                          ? 'Stop löschen?'
                          : `${n} Stops an diesem Halt löschen?`,
                      )
                    )
                      return;
                    for (const it of g.items) onDeleteStop(it.stop.id);
                  }}
                  className="text-red-500 hover:text-red-700"
                  title={
                    g.items.length === 1
                      ? 'Stop löschen'
                      : `${g.items.length} Stops löschen`
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <ul className="divide-y divide-gray-50">
                {g.items.map(({ stop: s }) => (
                  <li
                    key={s.id}
                    className="px-3 py-1 pl-12 grid grid-cols-[24px_1fr_64px_72px_64px_64px_80px] gap-2 items-center"
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (s.shipment) onOpenDetail(s.shipment.id);
                      }}
                      disabled={!s.shipment}
                      className="text-gray-500 hover:text-blue-700 disabled:opacity-30"
                      title="Sendungs-Detail"
                    >
                      <Eye size={14} />
                    </button>
                    <div className="flex items-center gap-1.5 min-w-0">
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
                        {(s.status === 'PLANNED' ||
                          s.status === 'ARRIVED') && (
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
                      <span className="font-mono text-xs truncate">
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
                    </div>
                    {(() => {
                      const sh = s.shipment;
                      const cell = (
                        v: string | number | null | undefined,
                        unit: string,
                        decimals = 0,
                      ) => {
                        if (v == null) {
                          return <span className="text-gray-300">—</span>;
                        }
                        const n = Number(v);
                        if (!Number.isFinite(n) || n === 0) {
                          return <span className="text-gray-300">—</span>;
                        }
                        return (
                          <>
                            <span className="font-mono">
                              {n.toFixed(decimals)}
                            </span>
                            <span className="text-gray-400 ml-0.5">
                              {unit}
                            </span>
                          </>
                        );
                      };
                      const cc = sh?.id
                        ? costsByShipment.get(sh.id)
                        : null;
                      return (
                        <>
                          <span className="text-xs text-right">
                            {cell(sh?.package_count, 'Pak', 0)}
                          </span>
                          <span className="text-xs text-right">
                            {cell(sh?.weight_kg, 'kg', 0)}
                          </span>
                          <span className="text-xs text-right">
                            {cell(sh?.ldm, 'LDM', 2)}
                          </span>
                          <span
                            className="text-xs text-right"
                            title="Plätze (V1: package_count Fallback)"
                          >
                            {cell(sh?.package_count, 'Pl', 0)}
                          </span>
                          <span className="text-xs text-right">
                            {cc && cc.total_eur ? (
                              <button
                                onClick={() =>
                                  sh &&
                                  onOpenDrillDown(sh.id, sh.shipment_number)
                                }
                                className="font-mono text-emerald-700 hover:underline"
                                title="Cost-Breakdown"
                              >
                                €{Number(cc.total_eur).toFixed(0)}
                              </button>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </span>
                        </>
                      );
                    })()}
                  </li>
                ))}
              </ul>
            </li>
          ));
        })()}
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
