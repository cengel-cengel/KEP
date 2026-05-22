/**
 * W-3.2.C MapPanel — Embedded NvDispoMap mode-aware.
 *
 * Rendering:
 *   mode='nv' → NvDispoMap mit eligible-Shipments-Pins + Tour-Stops
 *               (aus activeTour) + Polyline + onPinClick/onTourStopClick
 *               via useNvPendingSync (Page-level Hook, hier durchgereicht).
 *   mode='fv' → NvDispoMap im Read-Only-Modus (leere shipments),
 *               tourStops = buildFvTourStops(activeTour) inkl. Hub-Pins,
 *               Polyline aus tour.polyline_geometry.
 *
 * State (intern):
 *   selectedTourId    NV-Map-Ziel-Picker (Default activeTourViewId)
 *   clickedSequence   Pin-Klick-Reihenfolge (NV-only Visual)
 *   mapInPopup        Pop-out-Tracker (deaktiviert Embedded-Map)
 *   popupWindowRef    Window-Handle
 *   popupChannelRef   BroadcastChannel-Listener (für invalidate-broadcasts
 *                     aus Pop-out)
 *
 * Layout:
 *   useWorkspaceLayout().mapCollapsed → Collapse-Button-State
 *
 * DORMANT bis SCHRITT 5 (WorkspacePage konsumiert MapPanel als
 * ResizablePanel).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { buildPreviewPolyline } from '../../lib/haversine';
import { ChevronRight, ExternalLink } from 'lucide-react';
import NvDispoMap, {
  type MapShipment,
  type TourStopPin,
} from '../nv/NvDispoMap';
import { useWorkspace, useWorkspaceLayout } from '../../state/workspace';
import { useEligibleShipments, useTourDetail } from '../../hooks/useDispoData';
import {
  buildFvTourStops,
  type FvTourDetailLite,
} from '../../lib/fvTourStops';
import type {
  EligibleShipment,
  NvTour,
  TourGebiet,
} from '../../lib/nvTypes';

interface FvTourDetail extends FvTourDetailLite {
  tour_number?: string | null;
  polyline_geometry?: {
    type: 'LineString';
    coordinates: Array<[number, number]>;
  } | null;
}

export interface MapPanelProps {
  /** Active-Tour-Highlight (Source-of-Truth WorkspacePage-Coordinator). */
  activeTourViewId: string | null;
  /** Pin-Click-Handler (NV-only via useNvPendingSync). */
  onPinClick?: (shipmentId: string) => void;
  /** Tour-Stop-Click-Handler (NV-only via useNvPendingSync). */
  onTourStopClick?: (stopId: string) => void;
  /** Banner/Error-Reporter (Route-Calc-Fehler etc.). */
  onError?: (msg: string) => void;
  /** Optional farben-Map aus tour_gebiete (für NV-Pin-Colors). */
  farbenMap?: Map<string, string>;
  /** A' Sprint: Selected-Stop für visuelles Highlight (Cross-Panel). */
  selectedStopId?: string | null;
  /** A' Sprint: Stop-Marker-Click → setSelectedStopId (bidirektional). */
  onSelectStop?: (stopId: string | null) => void;
  /** P0-12.1: Drop-Handler für DnD aus QueuePanel/BoardPanel.
   *  payload.source='list' bzw. 'map'. Caller entscheidet was passiert
   *  (add to activeTour, oder pending-bucket wenn keine). */
  onDrop?: (shipmentIds: string[], source?: 'list' | 'map') => void;
}

export default function MapPanel({
  activeTourViewId,
  onPinClick,
  onTourStopClick,
  onError,
  farbenMap,
  selectedStopId,
  onSelectStop,
  onDrop,
}: MapPanelProps) {
  const qc = useQueryClient();
  const { mode, datum } = useWorkspace();
  const { layout, setLayout } = useWorkspaceLayout();
  const { mapCollapsed } = layout;
  // P0-12.1: DnD-Hover-State (ring-blue während Drag-Over).
  const [dropHover, setDropHover] = useState(false);

  // === Pop-out-Window-Management ===================================
  const popupWindowRef = useRef<Window | null>(null);
  const popupChannelRef = useRef<BroadcastChannel | null>(null);
  const [mapInPopup, setMapInPopup] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window))
      return;
    const channelName =
      mode === 'fv' ? 'tms-fv-dispo-popup' : 'tms-nv-dispo-popup';
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(channelName);
      ch.onmessage = (e) => {
        const t = (e?.data as { type?: string })?.type;
        if (t === 'invalidate-touren') {
          qc.invalidateQueries({
            queryKey: mode === 'fv' ? ['fv-touren'] : ['nv-touren'],
          });
          qc.invalidateQueries({
            queryKey: mode === 'fv' ? ['fv-tour-detail'] : ['nv-tour-detail'],
          });
        }
      };
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
  }, [mode, qc]);

  // Window-Closed-Watchdog: wenn User Pop-out schließt → embedded
  // Map wieder aktivieren.
  useEffect(() => {
    if (!mapInPopup) return;
    const t = window.setInterval(() => {
      if (popupWindowRef.current && popupWindowRef.current.closed) {
        popupWindowRef.current = null;
        setMapInPopup(false);
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [mapInPopup]);

  const openPopup = () => {
    if (popupWindowRef.current && !popupWindowRef.current.closed) {
      popupWindowRef.current.focus();
      return;
    }
    const sp = new URLSearchParams();
    if (mode === 'fv') {
      if (!activeTourViewId) {
        onError?.('Bitte zuerst eine FV-Tour wählen.');
        return;
      }
      sp.set('tour', activeTourViewId);
    } else {
      sp.set('datum', datum);
    }
    const url =
      mode === 'fv'
        ? `/fv-disposition/map-popup?${sp.toString()}`
        : `/nv-disposition/map-popup?${sp.toString()}`;
    const w = window.open(
      url,
      mode === 'fv' ? 'tms-fv-map-popup' : 'tms-nv-map-popup',
      'width=1200,height=900,noopener=no',
    );
    if (w) {
      popupWindowRef.current = w;
      setMapInPopup(true);
    }
  };

  // === Daten-Layer mode-aware ======================================
  // NV: eligible-shipments-Pins.
  const eligNvQ = useEligibleShipments<EligibleShipment>(mode, {
    datum,
    pickupMode: mode === 'nv' ? 'PICKUP' : undefined,
  });

  // Tour-Detail (aktive Tour).
  const tourDetailQ = useTourDetail<NvTour | FvTourDetail>(
    mode,
    activeTourViewId,
  );
  const activeTour = tourDetailQ.data;

  // R3+ NV-Map-Polish: Default-Lager-Query für isWarehouse-Pin.
  // Carlos: "ein Depot = Umschlagslager" → is_default. KEIN
  // is_umschlag-Switch (das ist R3-B Charter-FV-Hub-only).
  const defaultWhQ = useQuery<{
    id: string;
    name: string;
    lat: number | string | null;
    lng: number | string | null;
  } | null>({
    queryKey: ['warehouses', 'default'],
    queryFn: async () => (await api.get('/warehouses/default')).data ?? null,
    staleTime: 5 * 60_000,
  });

  // R3+ NV-Map-Polish: Sub-Gebiet-Filter wenn activeTour gesetzt.
  // Sub-Tour-Gebiet hat Vorrang vor Stamm-Tour-Gebiet (Carlos:
  // "nur zugewiesene Gebiete"). Fallback Stamm-Tour-Gebiet wenn
  // Sub keinen oder Sub gar nicht gesetzt.
  const activeSubGebietCode = useMemo<string | null>(() => {
    if (mode !== 'nv' || !activeTour) return null;
    const nv = activeTour as NvTour & {
      subunternehmer?: {
        nv_tour_gebiet?: { code?: string | null } | null;
      } | null;
      nv_stamm_tour?: {
        nv_tour_gebiet?: { code?: string | null } | null;
      } | null;
    };
    return (
      nv.subunternehmer?.nv_tour_gebiet?.code ??
      nv.nv_stamm_tour?.nv_tour_gebiet?.code ??
      null
    );
  }, [activeTour, mode]);

  // NV: MapShipment[] aus eligible (mit Farbcode).
  // R3+ Sub-Gebiet-Filter: wenn activeTour gesetzt + Sub-Gebiet
  // bekannt, filtere Sendungen auf matched_tour_gebiet_code.
  // Ohne activeTour: alle eligible (alte Verhalten).
  const mapShipmentsNv = useMemo<MapShipment[]>(() => {
    if (mode !== 'nv') return [];
    const all = (eligNvQ.data ?? []).map((s) => ({
      id: s.id,
      shipment_number: s.shipment_number,
      customer: s.customer ?? null,
      loading_address: s.pin_address ?? s.loading_address ?? null,
      color:
        (s.matched_tour_gebiet_code && farbenMap?.get(s.matched_tour_gebiet_code)) ||
        undefined,
      tour_gebiet_code: s.matched_tour_gebiet_code,
    }));
    if (!activeSubGebietCode) return all;
    return all.filter((s) => s.tour_gebiet_code === activeSubGebietCode);
  }, [mode, eligNvQ.data, farbenMap, activeSubGebietCode]);

  // C1-B: Preview-Polyline-State während OSRM-Roundtrip.
  // Wird durch addNearbyMut.onMutate gesetzt, durch
  // onSettled gecleart (echte Polyline kommt via invalidate).
  const [previewPolyline, setPreviewPolyline] = useState<
    Array<[number, number]> | null
  >(null);

  // Tour-Stops aus aktiver Tour (mode-aware).
  // R3+ NV-Map-Polish: für NV werden 2 isWarehouse-Pins
  // (Start + End am default-WH) gerahmt — analog FV-Pattern in
  // buildFvTourStops. Visueller Konsistenz mit buildTourRoute-
  // Logik (NV-Rundkurs [wh, ...stops, wh]).
  const tourStops = useMemo<TourStopPin[] | undefined>(() => {
    if (!activeTour) return undefined;
    if (mode === 'fv') {
      return buildFvTourStops(activeTour as FvTourDetail);
    }
    // NV: stops kommen aus tour.stops mit shipment.addresses.
    const nvTour = activeTour as NvTour;
    const stopPins: TourStopPin[] = [];
    for (const s of nvTour.stops ?? []) {
      const sh = s.shipment;
      const addr =
        s.stop_type === 'DELIVERY'
          ? sh?.addresses_shipments_delivery_address_idToaddresses
          : sh?.addresses_shipments_loading_address_idToaddresses;
      if (!addr || addr.lat == null || addr.lng == null) continue;
      const lat = Number(addr.lat);
      const lng = Number(addr.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      stopPins.push({
        id: s.id,
        position: s.position,
        shipment_number: sh?.shipment_number ?? undefined,
        lat,
        lng,
        risk_severity: (s as { risk_severity?: string | null }).risk_severity,
      });
    }
    // Warehouse-Pins prepend+append wenn default-WH coords da sind
    // UND non-Charter (Charter hat keinen Rundkurs).
    const wh = defaultWhQ.data;
    const isCharter = (nvTour as { is_charter?: boolean }).is_charter ?? false;
    if (!isCharter && wh && wh.lat != null && wh.lng != null) {
      const whLat = Number(wh.lat);
      const whLng = Number(wh.lng);
      if (Number.isFinite(whLat) && Number.isFinite(whLng)) {
        const whStart: TourStopPin = {
          id: `wh-start-${wh.id}`,
          position: 0,
          lat: whLat,
          lng: whLng,
          isWarehouse: true,
          label: wh.name,
        };
        const whEnd: TourStopPin = {
          id: `wh-end-${wh.id}`,
          position: stopPins.length + 1,
          lat: whLat,
          lng: whLng,
          isWarehouse: true,
          label: wh.name,
        };
        return [whStart, ...stopPins, whEnd];
      }
    }
    return stopPins;
  }, [activeTour, mode, defaultWhQ.data]);

  // Map-Routing: nearby-shipments-Query (≤20km um Tour-Stops).
  const nearbyQ = useQuery<
    Array<{
      id: string;
      shipment_number: string;
      lat: number;
      lng: number;
      customer_name?: string | null;
      distance_km: number;
    }>
  >({
    queryKey: [
      mode === 'nv' ? 'nv-nearby' : 'fv-nearby',
      activeTourViewId,
    ],
    queryFn: async () => {
      if (!activeTourViewId) return [];
      const base = mode === 'nv' ? '/nv-touren' : '/tours';
      const { data } = await api.get(`${base}/${activeTourViewId}/nearby-shipments`);
      return data as Array<{
        id: string;
        shipment_number: string;
        lat: number;
        lng: number;
        customer_name?: string | null;
        distance_km: number;
      }>;
    },
    enabled: !!activeTourViewId,
    staleTime: 30_000,
  });

  // Map-Routing F.1: addStop-Mutation mit Optimistic-Pin-Remove.
  // onMutate: nimmt Pin instant aus nearbyQ raus (visual feedback < 16ms).
  // onError: rollback (Pin wieder rein) + error-Toast.
  // onSuccess: invalidate für authoritative-state-refresh.
  const addNearbyMut = useMutation({
    mutationFn: async (shipmentId: string) => {
      if (!activeTourViewId) throw new Error('no active tour');
      if (mode === 'nv') {
        await api.post(`/nv-touren/${activeTourViewId}/stops`, {
          shipment_id: shipmentId,
          stop_type: 'PICKUP',
        });
      } else {
        await api.post(`/tours/${activeTourViewId}/batch-stops`, {
          adds: [shipmentId],
        });
      }
    },
    onMutate: async (shipmentId) => {
      const nearbyKey = [
        mode === 'nv' ? 'nv-nearby' : 'fv-nearby',
        activeTourViewId,
      ];
      await qc.cancelQueries({ queryKey: nearbyKey });
      const prevNearby = qc.getQueryData<
        Array<{ id: string; lat: number; lng: number }> | undefined
      >(nearbyKey);
      // C1-B: Haversine-Preview-Polyline direkt zeichnen.
      // Stops aus aktueller Tour + neuer Pin am Ende.
      const clicked = prevNearby?.find((p) => p.id === shipmentId);
      const stopCoords: Array<{ lat: number; lng: number }> =
        (tourStops ?? [])
          .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
          .map((s) => ({ lat: s.lat, lng: s.lng }));
      if (clicked && Number.isFinite(clicked.lat) && Number.isFinite(clicked.lng)) {
        stopCoords.push({ lat: clicked.lat, lng: clicked.lng });
      }
      const isCharter =
        (activeTour as { is_charter?: boolean } | undefined)?.is_charter ??
        false;
      // Preview-WH = erstes Tour-Stop als Approximation
      // (echtes WH bei BE bekannt; FE-Preview ist nur Visual-
      // Hint bis OSRM kommt).
      const previewWh = !isCharter && stopCoords[0] ? stopCoords[0] : null;
      const preview = buildPreviewPolyline({
        warehouse: previewWh,
        stops: stopCoords,
        isCharter,
      });
      setPreviewPolyline(preview.length >= 2 ? preview : null);

      if (prevNearby) {
        qc.setQueryData(
          nearbyKey,
          prevNearby.filter((p) => p.id !== shipmentId),
        );
      }
      return { prevNearby };
    },
    onSuccess: () => {
      const detailKey =
        mode === 'nv'
          ? ['nv-tour-detail', activeTourViewId]
          : ['fv-tour-detail', activeTourViewId];
      qc.invalidateQueries({ queryKey: detailKey });
      qc.invalidateQueries({
        queryKey: [mode === 'nv' ? 'nv-nearby' : 'fv-nearby', activeTourViewId],
      });
      qc.invalidateQueries({
        queryKey: [mode === 'nv' ? 'nv-elig' : 'fv-eligible'],
      });
    },
    onError: (err: any, _shipId, ctx) => {
      // Rollback Pin in nearby-Liste.
      if (ctx?.prevNearby) {
        qc.setQueryData(
          [mode === 'nv' ? 'nv-nearby' : 'fv-nearby', activeTourViewId],
          ctx.prevNearby,
        );
      }
      onError?.(`Pin-Add fehlgeschlagen (${err?.response?.status ?? '?'}).`);
    },
    onSettled: () => {
      // C1-B: Preview clearen — echte Polyline kommt via
      // tour-detail-invalidate (Hart-Replace, kein Flicker).
      setPreviewPolyline(null);
    },
  });

  const tourPolyline = useMemo(() => {
    if (!activeTour) return null;
    // FV-Tour hat polyline_geometry direkt; NV-Tour ebenfalls.
    const p = (activeTour as { polyline_geometry?: unknown })
      .polyline_geometry;
    return (p as MapPanelProps['onPinClick'] extends infer _
      ? FvTourDetail['polyline_geometry']
      : null) ?? null;
  }, [activeTour]);

  const [clickedSequence, setClickedSequence] = useState<string[]>([]);

  // Wrap onPinClick mit clickedSequence-Update für NV.
  const handlePinClick = (shipmentId: string) => {
    if (mode === 'nv') {
      setClickedSequence((prev) =>
        prev.includes(shipmentId) ? prev : [...prev, shipmentId],
      );
    }
    onPinClick?.(shipmentId);
  };

  if (mapCollapsed) {
    return (
      <div className="h-full flex flex-col bg-white border-l border-gray-200">
        <button
          onClick={() => setLayout({ mapCollapsed: false })}
          className="p-2 text-gray-500 hover:bg-gray-100"
          title="Karte einblenden"
        >
          <ChevronRight size={16} className="rotate-180" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-3 py-2 border-b bg-gray-50 flex items-center gap-2">
        <h2 className="font-semibold text-sm">Karte</h2>
        <button
          onClick={() => setLayout({ mapCollapsed: true })}
          className="text-gray-500 hover:text-gray-800"
          title="Karte einklappen"
        >
          <ChevronRight size={14} />
        </button>
        <span className="ml-auto text-[11px] text-gray-500">
          {activeTour
            ? mode === 'fv'
              ? (activeTour as FvTourDetail).tour_number ?? '—'
              : (activeTour as NvTour).nv_stamm_tour?.code ?? '—'
            : '— keine aktive Tour —'}
        </span>
        <button
          onClick={openPopup}
          className="text-gray-500 hover:text-blue-700"
          title="Karte in neuem Fenster"
        >
          <ExternalLink size={14} />
        </button>
      </div>

      <div
        className={`flex-1 min-h-0 relative ${
          dropHover ? 'ring-2 ring-blue-500 ring-inset' : ''
        }`}
        onDragOver={(e) => {
          if (!onDrop) return;
          if (!Array.from(e.dataTransfer.types).includes('application/json'))
            return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDropHover(true);
        }}
        onDragLeave={(e) => {
          // nur reset wenn wir das Container-Element verlassen
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setDropHover(false);
        }}
        onDrop={(e) => {
          setDropHover(false);
          if (!onDrop) return;
          try {
            const raw = e.dataTransfer.getData('application/json');
            if (!raw) return;
            const parsed = JSON.parse(raw);
            const ids: string[] = Array.isArray(parsed.shipmentIds)
              ? parsed.shipmentIds
              : parsed.shipmentId
                ? [parsed.shipmentId]
                : [];
            if (ids.length > 0) {
              e.preventDefault();
              onDrop(ids, parsed.source);
            }
          } catch {
            /* ignore malformed payload */
          }
        }}
      >
        {mapInPopup ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Karte in Pop-out-Fenster.
          </div>
        ) : (
          <NvDispoMap
            shipments={mapShipmentsNv}
            tourStops={tourStops}
            tourPolyline={tourPolyline as FvTourDetail['polyline_geometry']}
            clickedSequence={clickedSequence}
            // Bug-Fix 2a: Auto-Fit nur bei tour-Wechsel, nicht bei
            // jedem shipments-Invalidate (vermeidet Fokus-Spring nach
            // Pin-Add).
            fitTriggerKey={activeTourViewId ?? 'no-tour'}
            onPinClick={handlePinClick}
            onTourStopClick={(stopId) => {
              // A' Sprint: Marker-Click → Selected-Sync (Bidirektional)
              //                       + Pending-Remove-Toggle (existing).
              onSelectStop?.(stopId);
              onTourStopClick?.(stopId);
            }}
            tourMode={mode === 'nv' ? 'PICKUP' : undefined}
            onReset={() => setClickedSequence([])}
            onRouteError={(msg) => onError?.(msg)}
            selectedStopId={selectedStopId}
            tourStopColor={
              mode === 'nv'
                ? (activeTour as NvTour | undefined)?.nv_stamm_tour?.nv_tour_gebiet
                    ?.farbe ?? undefined
                : undefined
            }
            tourStatus={
              (activeTour as { status?: string } | undefined)?.status ?? null
            }
            nearbyShipments={nearbyQ.data ?? []}
            onNearbyClick={(id) => addNearbyMut.mutate(id)}
            previewPolylineCoords={previewPolyline ?? undefined}
          />
        )}
      </div>
    </div>
  );
}

// Suppress unused-tour-gebiet import-check
export type { TourGebiet };
