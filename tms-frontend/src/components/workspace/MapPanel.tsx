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
import { useQueryClient } from '@tanstack/react-query';
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

  // NV: MapShipment[] aus eligible (mit Farbcode).
  const mapShipmentsNv = useMemo<MapShipment[]>(() => {
    if (mode !== 'nv') return [];
    return (eligNvQ.data ?? []).map((s) => ({
      id: s.id,
      shipment_number: s.shipment_number,
      customer: s.customer ?? null,
      loading_address: s.pin_address ?? s.loading_address ?? null,
      color:
        (s.matched_tour_gebiet_code && farbenMap?.get(s.matched_tour_gebiet_code)) ||
        undefined,
      tour_gebiet_code: s.matched_tour_gebiet_code,
    }));
  }, [mode, eligNvQ.data, farbenMap]);

  // Tour-Stops aus aktiver Tour (mode-aware).
  const tourStops = useMemo<TourStopPin[] | undefined>(() => {
    if (!activeTour) return undefined;
    if (mode === 'fv') {
      return buildFvTourStops(activeTour as FvTourDetail);
    }
    // NV: stops kommen aus tour.stops mit shipment.addresses.
    const nvTour = activeTour as NvTour;
    const pins: TourStopPin[] = [];
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
      pins.push({
        id: s.id,
        position: s.position,
        shipment_number: sh?.shipment_number ?? undefined,
        lat,
        lng,
        risk_severity: (s as { risk_severity?: string | null }).risk_severity,
      });
    }
    return pins;
  }, [activeTour, mode]);

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
          />
        )}
      </div>
    </div>
  );
}

// Suppress unused-tour-gebiet import-check
export type { TourGebiet };
