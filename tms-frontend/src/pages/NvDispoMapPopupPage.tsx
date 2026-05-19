import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import NvDispoMap from '../components/nv/NvDispoMap';
import type { MapShipment, TourStopPin } from '../components/nv/NvDispoMap';
import CreateTourModal from '../components/nv/CreateTourModal';
import QuickAddBar from '../components/nv/QuickAddBar';
import {
  nvPendingStore,
  SYNC_DEBOUNCE_MS,
  RE_INVALIDATE_DELAY_MS,
} from '../lib/useNvPendingStore';
import type {
  CreateTourPayload,
  CreateTourStammTour,
} from '../components/nv/CreateTourModal';
import { api } from '../lib/api';
import { haversineKm } from '../lib/distance';

const TOUR_RADIUS_KM = 20;

type EligibleShipment = {
  id: string;
  shipment_number: string;
  matched_tour_gebiet_code?: string | null;
  customer?: { id: string; partner_number: string; name: string } | null;
  pin_address?: {
    zip?: string | null;
    lat: string | number | null;
    lng: string | number | null;
  } | null;
  loading_address?: {
    zip?: string | null;
    lat: string | number | null;
    lng: string | number | null;
  } | null;
};

type TourGebiet = { id: string; code: string; name: string; farbe: string };

type NvTourStop = {
  id: string;
  position: number;
  stop_type: string;
  shipment?: {
    id: string;
    shipment_number: string;
    addresses_shipments_loading_address_idToaddresses?: {
      zip?: string | null;
      lat: string | number | null;
      lng: string | number | null;
    } | null;
    addresses_shipments_delivery_address_idToaddresses?: {
      zip?: string | null;
      lat: string | number | null;
      lng: string | number | null;
    } | null;
  } | null;
};

type NvTour = {
  id: string;
  status: string;
  nv_stamm_tour?: {
    code: string;
    nv_tour_gebiet?: {
      plz_pattern?: string | string[] | null;
    } | null;
  } | null;
  stops: NvTourStop[];
  polyline_geometry?: {
    type: 'LineString';
    coordinates: Array<[number, number]>;
  } | null;
};

const NV_INVALIDATE_KEYS = [
  'nv-touren',
  'nv-elig',
  'nv-tour-cost-comp',
  'nv-tour-capacity',
  'shipment-cost-comp',
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const CHANNEL_NAME = 'tms-nv-dispo-popup';

export default function NvDispoMapPopupPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const datum = params.get('datum') || todayISO();
  const mode: 'PICKUP' | 'DELIVERY' =
    params.get('mode') === 'DELIVERY' ? 'DELIVERY' : 'PICKUP';

  const [pinAddShipmentId, setPinAddShipmentId] = useState<string | null>(
    null,
  );
  const [showCreateTour, setShowCreateTour] = useState(false);
  const [selectedTourId, setSelectedTourId] = useState<string | null>(
    params.get('tour') || null,
  );
  const [activeTourViewId, setActiveTourViewId] = useState<string | null>(
    params.get('active') || null,
  );
  const [clickedSequence, setClickedSequence] = useState<string[]>([]);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    document.title = `NV-Karte ${datum} (Pop-out)`;
  }, [datum]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 3000);
    return () => clearTimeout(t);
  }, [banner]);

  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current = ch;
      ch.onmessage = (ev) => {
        const data = ev.data as { type?: string } | undefined;
        if (data?.type === 'invalidate') {
          for (const k of NV_INVALIDATE_KEYS) {
            qc.invalidateQueries({ queryKey: [k] });
          }
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
      channelRef.current = null;
    };
  }, [qc]);

  const broadcastInvalidate = () => {
    for (const k of NV_INVALIDATE_KEYS) qc.invalidateQueries({ queryKey: [k] });
    try {
      channelRef.current?.postMessage({ type: 'invalidate' });
    } catch {
      /* ignore */
    }
  };

  const tourGebieteQ = useQuery<TourGebiet[]>({
    queryKey: ['nv-tour-gebiete'],
    queryFn: async () => (await api.get<TourGebiet[]>('/nv-tour-gebiete')).data,
  });
  const eligQ = useQuery<EligibleShipment[]>({
    queryKey: ['nv-elig', datum, mode, '', ''],
    queryFn: async () =>
      (
        await api.get<EligibleShipment[]>('/nv-touren/eligible-shipments', {
          params: { datum, mode },
        })
      ).data,
    enabled: !!datum,
  });
  const tourenQ = useQuery<NvTour[]>({
    queryKey: ['nv-touren', datum, 'PLANNING'],
    queryFn: async () => {
      const sp = new URLSearchParams();
      sp.set('datum', datum);
      sp.append('status', 'PLANNING');
      sp.append('status', 'IN_PROGRESS');
      return (await api.get<NvTour[]>('/nv-touren', { params: sp })).data;
    },
    enabled: !!datum,
  });
  const defaultWarehouseQ = useQuery<{
    id: string;
    name: string;
    lat: string | number | null;
    lng: string | number | null;
  } | null>({
    queryKey: ['warehouses', 'default'],
    queryFn: async () => (await api.get('/warehouses/default')).data,
    staleTime: 5 * 60_000,
  });

  const farbenMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of tourGebieteQ.data ?? []) m.set(g.code, g.farbe);
    return m;
  }, [tourGebieteQ.data]);

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
      const sh = s.shipment;
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
    return stops;
  }, [activeTour, defaultWarehouseQ.data]);

  const activeTourPlzSet = useMemo(() => {
    if (!activeTour) return null;
    const set = new Set<string>();
    for (const s of activeTour.stops) {
      const sh = s.shipment;
      const addr =
        s.stop_type === 'DELIVERY'
          ? sh?.addresses_shipments_delivery_address_idToaddresses
          : sh?.addresses_shipments_loading_address_idToaddresses;
      if (addr?.zip) set.add(addr.zip);
    }
    const pat = activeTour.nv_stamm_tour?.nv_tour_gebiet?.plz_pattern as
      | string
      | string[]
      | null
      | undefined;
    if (Array.isArray(pat)) {
      for (const p of pat) if (typeof p === 'string' && p) set.add(p);
    } else if (typeof pat === 'string') {
      for (const part of pat.split(',')) {
        const p = part.trim();
        if (p) set.add(p);
      }
    }
    return set.size > 0 ? set : null;
  }, [activeTour]);

  const activeTourStopCoords = useMemo<Array<[number, number]>>(() => {
    if (!activeTour) return [];
    const out: Array<[number, number]> = [];
    for (const s of activeTour.stops) {
      const sh = s.shipment;
      const addr =
        s.stop_type === 'DELIVERY'
          ? sh?.addresses_shipments_delivery_address_idToaddresses
          : sh?.addresses_shipments_loading_address_idToaddresses;
      if (!addr) continue;
      const lat = addr.lat != null ? Number(addr.lat) : NaN;
      const lng = addr.lng != null ? Number(addr.lng) : NaN;
      if (Number.isFinite(lat) && Number.isFinite(lng)) out.push([lat, lng]);
    }
    return out;
  }, [activeTour]);

  const isEligibleInActiveTour = useMemo(() => {
    const hasPlz = !!activeTourPlzSet && activeTourPlzSet.size > 0;
    if (!hasPlz && activeTourStopCoords.length === 0) return null;
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

  const mapShipments = useMemo<MapShipment[]>(() => {
    const list = eligQ.data ?? [];
    const filtered = isEligibleInActiveTour
      ? list.filter(isEligibleInActiveTour)
      : list;
    return filtered.map((s) => ({
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
  }, [eligQ.data, farbenMap, activeTourPlzSet]);

  const stammTourenQ = useQuery<CreateTourStammTour[]>({
    queryKey: ['nv-stamm-touren'],
    queryFn: async () =>
      (await api.get<CreateTourStammTour[]>('/nv-stamm-touren')).data,
  });

  const createTourMut = useMutation({
    mutationFn: async (input: CreateTourPayload) => {
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
    onSuccess: broadcastInvalidate,
  });

  // deleteStopMut entfernt: Tour-Stop-Klicks laufen jetzt über
  // pendingRemoves + Batch-Sync. Falls je wieder gebraucht: NV-2i13 git-history.

  const addStopMut = useMutation({
    mutationFn: async (input: { tourId: string; shipmentId: string }) =>
      (
        await api.post(`/nv-touren/${input.tourId}/stops`, {
          shipment_id: input.shipmentId,
          stop_type: mode,
        })
      ).data,
    onMutate: async (input) => {
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
      if (ctx?.prev) {
        for (const [key, data] of ctx.prev) qc.setQueryData(key, data);
      }
      const status = err?.response?.status;
      const code = err?.response?.data?.code;
      setBanner(
        status === 409 && code === 'CAPACITY_EXCEEDED'
          ? 'Kapazität überschritten.'
          : `Fehler: ${err?.message ?? '?'}`,
      );
    },
    onSettled: () => {
      broadcastInvalidate();
    },
  });

  // Pending-State LIVES in nvPendingStore (external) — KEIN Page-Re-Render
  // bei Pin-Klicks. Subscriber: NvDispoMap.
  const syncTimersRef = useRef<Map<string, number>>(new Map());
  // 2s-Catch-Up-Timer pro Tour: holt Background-Optimize-Result.
  const reInvalidateTimersRef = useRef<Map<string, number>>(new Map());

  const scheduleReInvalidateTouren = (tourId: string) => {
    const existing = reInvalidateTimersRef.current.get(tourId);
    if (existing) window.clearTimeout(existing);
    const t = window.setTimeout(() => {
      qc.invalidateQueries({ queryKey: ['nv-touren'] });
      try {
        channelRef.current?.postMessage({ type: 'invalidate-touren' });
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
      // Narrow: nur tour-Liste invalidieren.
      qc.invalidateQueries({ queryKey: ['nv-touren'] });
      try {
        channelRef.current?.postMessage({ type: 'invalidate-touren' });
      } catch {
        /* ignore */
      }
      // Catch-Up nach 2s für Background-Optimize.
      scheduleReInvalidateTouren(tourId);
    } catch (err: any) {
      nvPendingStore.restorePending(tourId, snapshot);
      const status = err?.response?.status;
      const code = err?.response?.data?.code;
      if (status === 409 && code === 'CAPACITY_EXCEEDED') {
        const axes = (err.response.data?.would_exceed ?? [])
          .map((w: any) => `${w.axis} (${w.total}/${w.max})`)
          .join(', ');
        setBanner(`Kapazität: ${axes || '?'}`);
      } else {
        setBanner(`Batch-Sync Fehler (${status ?? '?'}). Pending erhalten.`);
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

  // Tour-Switch Auto-Flush — verhindert dass Pending bei Tour-Hopping
  // im Store zurückbleibt.
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

  // Unmount: alle pending Timer abräumen.
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

  const updateModeParam = (m: 'PICKUP' | 'DELIVERY') => {
    const sp = new URLSearchParams(params);
    sp.set('mode', m);
    setParams(sp, { replace: true });
  };

  // URL-Sync: tour + active werden bei state-Wechsel in URL geschrieben.
  // mode + datum laufen über updateModeParam bzw. sind beim Open gesetzt.
  useEffect(() => {
    const sp = new URLSearchParams(params);
    if (selectedTourId) sp.set('tour', selectedTourId);
    else sp.delete('tour');
    if (activeTourViewId) sp.set('active', activeTourViewId);
    else sp.delete('active');
    setParams(sp, { replace: true });
    // params/setParams absichtlich NICHT in deps — würde Loop triggern
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTourId, activeTourViewId]);

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50">
      {pinAddShipmentId && !showCreateTour && (() => {
        const ship = (eligQ.data ?? []).find(
          (s) => s.id === pinAddShipmentId,
        );
        return (
          <QuickAddBar
            shipmentNumber={ship?.shipment_number ?? null}
            touren={tourenQ.data ?? []}
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
                      broadcastInvalidate();
                    },
                  },
                );
              }
            }}
            onCreateNew={() => setShowCreateTour(true)}
          />
        );
      })()}
      <div className="bg-white border-b px-3 py-2 flex items-center gap-2 text-sm">
        <span className="font-semibold">NV-Karte</span>
        <span className="font-mono text-gray-700">{datum}</span>
        <div className="inline-flex rounded border border-gray-300 overflow-hidden">
          <button
            onClick={() => updateModeParam('PICKUP')}
            className={`px-2 py-1 text-xs ${
              mode === 'PICKUP' ? 'bg-blue-600 text-white' : 'bg-white'
            }`}
          >
            Abholung
          </button>
          <button
            onClick={() => updateModeParam('DELIVERY')}
            className={`px-2 py-1 text-xs ${
              mode === 'DELIVERY' ? 'bg-purple-600 text-white' : 'bg-white'
            }`}
          >
            Zustellung
          </button>
        </div>
        <select
          value={selectedTourId ?? ''}
          onChange={(e) => setSelectedTourId(e.target.value || null)}
          className="border rounded px-2 py-1 text-xs"
        >
          <option value="">— Ziel-Tour —</option>
          {(tourenQ.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.nv_stamm_tour?.code ?? '—'} ({t.stops.length})
            </option>
          ))}
        </select>
        <select
          value={activeTourViewId ?? ''}
          onChange={(e) => setActiveTourViewId(e.target.value || null)}
          className="border rounded px-2 py-1 text-xs"
          title="Tour-Route anzeigen"
        >
          <option value="">— Tour-Route —</option>
          {(tourenQ.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.nv_stamm_tour?.code ?? '—'}
            </option>
          ))}
        </select>
        {banner && (
          <span className="text-xs text-red-600 font-medium">{banner}</span>
        )}
        <button
          onClick={() => window.close()}
          className="ml-auto text-gray-500 hover:text-gray-800"
          title="Schließen"
        >
          <X size={18} />
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
          onRouteError={(msg) => setBanner(msg)}
        />
      </div>

      {showCreateTour && (
        <CreateTourModal
          stammTouren={stammTourenQ.data ?? []}
          onClose={() => setShowCreateTour(false)}
          onCreate={async (payload) => {
            const created = await createTourMut.mutateAsync(payload);
            setShowCreateTour(false);
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

    </div>
  );
}
