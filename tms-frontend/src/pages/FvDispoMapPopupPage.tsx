import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import NvDispoMap from '../components/nv/NvDispoMap';
import type { MapShipment } from '../components/nv/NvDispoMap';
import { api } from '../lib/api';
import { buildPreviewPolyline } from '../lib/haversine';
import {
  buildFvTourStops,
  type FvTourDetailLite,
} from '../lib/fvTourStops';

const CHANNEL_NAME = 'tms-fv-dispo-popup';

interface FvTourDetail extends FvTourDetailLite {
  tour_number?: string | null;
  status?: string;
  geplante_km?: string | number | null;
  polyline_geometry?: {
    type: 'LineString';
    coordinates: Array<[number, number]>;
  } | null;
}

export default function FvDispoMapPopupPage() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const tourId = params.get('tour') ?? '';
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Listen für invalidate-Broadcasts aus Disposition-Page.
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window))
      return;
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(CHANNEL_NAME);
      ch.onmessage = (e) => {
        const data = (e?.data ?? {}) as { type?: string };
        if (data?.type === 'invalidate-touren') {
          qc.invalidateQueries({ queryKey: ['fv-tour-detail'] });
          qc.invalidateQueries({ queryKey: ['fv-touren'] });
        }
      };
      channelRef.current = ch;
    } catch {
      /* silent */
    }
    return () => {
      try {
        ch?.close();
      } catch {
        /* noop */
      }
      channelRef.current = null;
    };
  }, [qc]);

  const tourQ = useQuery<FvTourDetail | null>({
    queryKey: ['fv-tour-detail', tourId],
    queryFn: async () => {
      if (!tourId) return null;
      const { data } = await api.get<FvTourDetail>(`/tours/${tourId}`);
      return data;
    },
    enabled: !!tourId,
    staleTime: 10_000,
  });

  const tourStops = useMemo(
    () => buildFvTourStops(tourQ.data),
    [tourQ.data],
  );

  // C1-C: Pop-out nearby-Pins (Symmetrie zu MapPanel-Embedded).
  // Eigener TanStack-Client im Pop-out — Query/Mutation pro Page.
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
    queryKey: ['fv-nearby', tourId],
    queryFn: async () => {
      if (!tourId) return [];
      const { data } = await api.get(`/tours/${tourId}/nearby-shipments`);
      return data;
    },
    enabled: !!tourId,
    staleTime: 30_000,
  });

  // R3-G2: Haversine-Preview-Polyline (Symmetrie zu C1-B MapPanel).
  // onMutate: berechne Preview aus Tour-Stops + new shipment.
  // onSettled: clear Preview (OSRM-Antwort über invalidate eingefangen).
  const [previewPolyline, setPreviewPolyline] = useState<
    Array<[number, number]> | undefined
  >(undefined);

  const addNearbyMut = useMutation({
    mutationFn: async (shipmentId: string) => {
      await api.post(`/tours/${tourId}/batch-stops`, {
        adds: [shipmentId],
      });
    },
    onMutate: (shipmentId: string) => {
      // Finde new-shipment coords aus nearbyQ-Data.
      const newShip = (nearbyQ.data ?? []).find((n) => n.id === shipmentId);
      if (!newShip || !tourQ.data) return;
      // Tour-Stops als Haversine-Punkte (lat/lng nur).
      const stopsForPreview = tourStops
        .filter((s) => !s.isWarehouse)
        .map((s) => ({ lat: s.lat, lng: s.lng }));
      stopsForPreview.push({ lat: newShip.lat, lng: newShip.lng });
      // FV: kein Charter-Flag im Pop-out-Context; nutze hub_start als
      // warehouse-Proxy wenn vorhanden. Fallback: kein Warehouse →
      // Preview-Charter-Modus (nur Stops).
      const wh = (tourQ.data as { hub_start_address?: { lat?: number | null; lng?: number | null } | null })
        .hub_start_address;
      const warehouse =
        wh?.lat != null && wh?.lng != null
          ? { lat: Number(wh.lat), lng: Number(wh.lng) }
          : null;
      const preview = buildPreviewPolyline({
        warehouse,
        stops: stopsForPreview,
        isCharter: !warehouse,
      });
      if (preview.length >= 2) setPreviewPolyline(preview);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fv-tour-detail', tourId] });
      qc.invalidateQueries({ queryKey: ['fv-nearby', tourId] });
      qc.invalidateQueries({ queryKey: ['fv-eligible'] });
    },
    onSettled: () => {
      // Clear-Delay: 2s → genug für invalidate-Cycle + neue OSRM-Polyline.
      setTimeout(() => setPreviewPolyline(undefined), 2000);
    },
  });

  // Map verlangt shipments-Prop — wir liefern leeres Array
  // (Pop-out zeigt nur die EINE Tour, keine eligible-Pins).
  const emptyShipments = useMemo<MapShipment[]>(() => [], []);

  const tourNumber = tourQ.data?.tour_number ?? '—';
  const km =
    tourQ.data?.geplante_km != null
      ? Number(tourQ.data.geplante_km)
      : null;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="flex items-center gap-3 px-4 py-2 bg-white border-b">
        <div className="font-semibold text-gray-800">
          FV-Karte
          <span className="ml-2 font-mono text-sm text-gray-600">
            {tourNumber}
          </span>
        </div>
        {km != null && (
          <span className="text-xs text-gray-500">
            · {km.toFixed(1)} km geplant
          </span>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {tourStops.length} Stops
        </span>
        <button
          onClick={() => window.close()}
          className="text-gray-500 hover:text-gray-800"
          title="Schließen"
        >
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 relative">
        {tourQ.isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Lädt Tour…
          </div>
        )}
        {!tourQ.isLoading && !tourQ.data && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Tour nicht gefunden.
          </div>
        )}
        {tourQ.data && (
          <NvDispoMap
            shipments={emptyShipments}
            tourStops={tourStops}
            tourPolyline={tourQ.data.polyline_geometry ?? null}
            previewPolylineCoords={previewPolyline}
            clickedSequence={[]}
            // Bug-Fix 2a: stabiler Fit-Key (Pop-out zeigt 1 Tour,
            // kein Spring nach nearby-add Invalidate).
            fitTriggerKey={tourId || 'no-tour'}
            onPinClick={() => {
              /* FV map ist read-only (Pop-out zeigt eine Tour). */
            }}
            nearbyShipments={nearbyQ.data ?? []}
            onNearbyClick={(id) => addNearbyMut.mutate(id)}
          />
        )}
      </div>
    </div>
  );
}
