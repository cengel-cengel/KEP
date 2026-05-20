import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Package, Plus, Sparkles, Truck } from 'lucide-react';
import NvTourKostenModal from '../components/NvTourKostenModal';
import ShipmentDetailModal from '../components/ShipmentDetailModal';
import ShipmentEditModal from '../components/ShipmentEditModal';
import BulkTourPicker from '../components/nv/BulkTourPicker';
import CreateTourModal from '../components/nv/CreateTourModal';
import QuickAddBar from '../components/nv/QuickAddBar';
import TourCard from '../components/nv/TourCard';
import { eligColumns } from '../components/nv/eligColumns';
import {
  TOUR_RADIUS_KM,
  todayISO,
  type EligibleShipment,
  type NvTour,
  type Stop,
  type StammTour,
  type TourGebiet,
} from '../lib/nvTypes';
import { haversineKm } from '../lib/distance';
import {
  nvPendingStore,
  SYNC_DEBOUNCE_MS,
  RE_INVALIDATE_DELAY_MS,
} from '../lib/useNvPendingStore';
import type { Shipment } from '../types/shipment';
import NvDispoMap from '../components/nv/NvDispoMap';
import type { MapShipment, TourStopPin } from '../components/nv/NvDispoMap';
import CostDrillDownModal from '../components/nv/CostDrillDownModal';
import ResponsiveTable from '../components/table/ResponsiveTable';
import { api } from '../lib/api';
import type { NvTourMutableStatus } from '../lib/nvTourStatus';
import { usePanel } from '../state/panel';

export default function NvDispositionPage() {
  const qc = useQueryClient();
  const panel = usePanel();
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
          // P0-6: alte localStorage-Werte enthalten ggf. 'DISPATCHED'
          // → in 'IN_PROGRESS' migrieren.
          const mapped = (arr as string[]).map((v) =>
            v === 'DISPATCHED' ? 'IN_PROGRESS' : v,
          );
          const allowed = new Set(['PLANNING', 'IN_PROGRESS', 'COMPLETED']);
          const s = new Set(mapped.filter((v) => allowed.has(v)));
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
        } else if (data?.type === 'invalidate-touren') {
          qc.invalidateQueries({ queryKey: ['nv-touren'] });
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
    const sp = new URLSearchParams({ datum, mode });
    if (selectedTourId) sp.set('tour', selectedTourId);
    if (activeTourViewId) sp.set('active', activeTourViewId);
    const url = `/nv-disposition/map-popup?${sp.toString()}`;
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
    // Json-Feld → kann Array, String oder null sein.
    const pp = (activeTour.nv_stamm_tour?.nv_tour_gebiet as any)
      ?.plz_pattern;
    if (Array.isArray(pp)) {
      for (const p of pp) if (typeof p === 'string' && p) set.add(p);
    } else if (typeof pp === 'string') {
      for (const part of pp.split(',')) {
        const p = part.trim();
        if (p) set.add(p);
      }
    }
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
  const updateTourStatusMut = useMutation({
    mutationFn: async (input: {
      tourId: string;
      status: NvTourMutableStatus;
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

  // Pending-State LIVES in nvPendingStore (external) — KEIN Page-Re-Render
  // bei Pin-Klicks. Subscriber: NvDispoMap, evtl. TourCard.
  const syncTimersRef = useRef<Map<string, number>>(new Map());
  // 2s-Catch-Up-Timer pro Tour: holt Background-Optimize-Result
  // (neue Stop-Order + geplante_km) nach setImmediate-Optimize.
  const reInvalidateTimersRef = useRef<Map<string, number>>(new Map());

  const scheduleReInvalidateTouren = (tourId: string) => {
    const existing = reInvalidateTimersRef.current.get(tourId);
    if (existing) window.clearTimeout(existing);
    const t = window.setTimeout(() => {
      qc.invalidateQueries({ queryKey: ['nv-touren'] });
      try {
        popupChannelRef.current?.postMessage({ type: 'invalidate-touren' });
      } catch {
        /* ignore */
      }
      reInvalidateTimersRef.current.delete(tourId);
    }, RE_INVALIDATE_DELAY_MS);
    reInvalidateTimersRef.current.set(tourId, t);
  };

  const flushSync = async (tourId: string) => {
    const snapshot = nvPendingStore.flushPending(tourId);
    if (snapshot.adds.length === 0 && snapshot.removes.length === 0) return;
    syncTimersRef.current.delete(tourId);
    try {
      await api.post(`/nv-touren/${tourId}/batch-stops`, {
        adds: snapshot.adds,
        removes: snapshot.removes,
        stop_type: mode,
      });
      // Narrow invalidation — nur tour-Liste, NICHT eligible/cost/capacity.
      qc.invalidateQueries({ queryKey: ['nv-touren'] });
      try {
        popupChannelRef.current?.postMessage({ type: 'invalidate-touren' });
      } catch {
        /* ignore */
      }
      // Catch-Up: Background-Optimize läuft 1-2s, holt neue Stop-Order +
      // geplante_km + Polyline-Coords.
      scheduleReInvalidateTouren(tourId);
    } catch (err: any) {
      nvPendingStore.restorePending(tourId, snapshot);
      const status = err?.response?.status;
      const code = err?.response?.data?.code;
      if (status === 409 && code === 'CAPACITY_EXCEEDED') {
        const axes = (err.response.data?.would_exceed ?? [])
          .map((w: any) => `${w.axis} (${w.total}/${w.max})`)
          .join(', ');
        setBanner({
          kind: 'err',
          msg: `Kapazität überschritten: ${axes || 'unbekannt'}`,
        });
      } else {
        setBanner({
          kind: 'err',
          msg: `Batch-Sync fehlgeschlagen (${status ?? '?'}). Pending erhalten — erneut klicken zum Retry.`,
        });
      }
    }
  };

  const scheduleSync = (tourId: string) => {
    const existing = syncTimersRef.current.get(tourId);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(
      () => flushSync(tourId),
      SYNC_DEBOUNCE_MS,
    );
    syncTimersRef.current.set(tourId, timer);
  };

  // Tour-Switch Auto-Flush: bei Wechsel der activeTourViewId wird der
  // Pending-Eintrag der ALTEN Tour sofort geflusht, bevor der lazy
  // Timer feuert. Verhindert dass Pending bei Tour-Hopping zurückbleibt.
  const prevActiveTourIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevActiveTourIdRef.current;
    if (prev && prev !== activeTourViewId) {
      const t = syncTimersRef.current.get(prev);
      if (t) {
        window.clearTimeout(t);
        syncTimersRef.current.delete(prev);
      }
      void flushSync(prev);
    }
    prevActiveTourIdRef.current = activeTourViewId;
  }, [activeTourViewId]);

  // Esc-Key: Pending verwerfen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && nvPendingStore.hasAny()) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName ?? '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        nvPendingStore.clearAll();
        for (const t of syncTimersRef.current.values()) window.clearTimeout(t);
        syncTimersRef.current.clear();
        for (const t of reInvalidateTimersRef.current.values())
          window.clearTimeout(t);
        reInvalidateTimersRef.current.clear();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Unmount: alle pending Timer abräumen (verhindert späte
  // qc.invalidateQueries auf unmounted Component).
  useEffect(() => {
    const syncTimers = syncTimersRef.current;
    const reInvalidateTimers = reInvalidateTimersRef.current;
    return () => {
      for (const t of syncTimers.values()) window.clearTimeout(t);
      syncTimers.clear();
      for (const t of reInvalidateTimers.values()) window.clearTimeout(t);
      reInvalidateTimers.clear();
    };
  }, []);

  const onPinClick = (shipmentId: string) => {
    const targetTourId = activeTourViewId ?? selectedTourId;
    if (!targetTourId) {
      setPinAddShipmentId(shipmentId);
      return;
    }
    nvPendingStore.togglePendingAdd(targetTourId, shipmentId);
    scheduleSync(targetTourId);
  };

  const handleTourStopClick = (stopId: string) => {
    if (!activeTourViewId) return;
    nvPendingStore.togglePendingRemove(activeTourViewId, stopId);
    scheduleSync(activeTourViewId);
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

  const mapShipments = useMemo<MapShipment[]>(() => {
    return ((eligQ.data ?? []) as EligibleShipment[])
      .filter((s) => {
        if (isEligibleInActiveTour) {
          return isEligibleInActiveTour(s);
        }
        return expandedGroup
          ? s.matched_tour_gebiet_code === expandedGroup
          : true;
      })
      .map((s) => ({
        id: s.id,
        shipment_number: s.shipment_number,
        customer: s.customer ?? null,
        loading_address: s.pin_address ?? s.loading_address ?? null,
        color:
          (s.matched_tour_gebiet_code &&
            farbenMap.get(s.matched_tour_gebiet_code)) ||
          undefined,
        tour_gebiet_code: s.matched_tour_gebiet_code,
      }));
  }, [eligQ.data, isEligibleInActiveTour, expandedGroup, farbenMap]);

  // visibleTourStops-Filter (pendingRemoveStopIds) läuft jetzt
  // INTERN in NvDispoMap (subscribed via nvPendingStore).

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-gray-50">
      {pinAddShipmentId && !showCreateTour && (() => {
        const ship = allShipmentsForDetail.find(
          (s) => s.id === pinAddShipmentId,
        );
        return (
          <QuickAddBar
            shipmentNumber={(ship as any)?.shipment_number ?? null}
            touren={filteredTouren}
            onClose={() => setPinAddShipmentId(null)}
            onPick={(tourId) => {
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
        );
      })()}
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
              ['PLANNING', 'Geplant'],
              ['IN_PROGRESS', mode === 'DELIVERY' ? 'In Zustellung' : 'In Abholung'],
              ['COMPLETED', mode === 'DELIVERY' ? 'Zugestellt' : 'Im Lager'],
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
                columns={eligColumns((id) => panel.selectShipment(id))}
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
                onOpenDetail={(shipmentId) => panel.selectShipment(shipmentId)}
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
                shipments={mapShipments}
                tourStops={activeTour ? activeTourStopPins : undefined}
                tourPolyline={activeTour?.polyline_geometry ?? null}
                onTourStopClick={handleTourStopClick}
                tourMode={mode}
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
