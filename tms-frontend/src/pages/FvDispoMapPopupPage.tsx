import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import NvDispoMap from '../components/nv/NvDispoMap';
import type { MapShipment } from '../components/nv/NvDispoMap';
import { api } from '../lib/api';
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
            clickedSequence={[]}
            onPinClick={() => {
              /* FV map ist read-only (Pop-out zeigt eine Tour). */
            }}
          />
        )}
      </div>
    </div>
  );
}
