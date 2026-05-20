import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Trash2, Warehouse, MapPin, ExternalLink } from 'lucide-react';
import { api } from '../../lib/api';
import {
  prefetchFvTourDetail,
  useHoverPrefetch,
} from '../../lib/prefetchHelpers';
import OverloadBar, {
  type OverloadInfo,
} from '../shared/OverloadBar';
import { usePanel } from '../../state/panel';

/** Pop-out-Window-Ref pro Tour (singleton per FvTourCard-Instance). */
function openFvMapPopup(tourId: string, ref: { current: Window | null }) {
  if (ref.current && !ref.current.closed) {
    ref.current.focus();
    return;
  }
  const sp = new URLSearchParams({ tour: tourId });
  const url = `/fv-disposition/map-popup?${sp.toString()}`;
  const w = window.open(
    url,
    `fv-dispo-map-popup-${tourId}`,
    'width=1200,height=900,noopener=no',
  );
  if (w) ref.current = w;
}

interface ShipmentAddress {
  id: string;
  name?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  country_code?: string | null;
}

interface ShipmentRow {
  id: string;
  shipment_number?: string | null;
  tour_position?: number | null;
  customers?: { id: string; name: string } | null;
  addresses_shipments_loading_address_idToaddresses?: ShipmentAddress | null;
  addresses_shipments_delivery_address_idToaddresses?: ShipmentAddress | null;
}

interface FvTourDetail {
  id: string;
  tour_number?: string | null;
  status: string;
  geplante_km?: string | number | null;
  max_ldm?: string | number | null;
  hub_start_address?: ShipmentAddress | null;
  hub_end_address?: ShipmentAddress | null;
  subcontractors?: { id: string; name: string } | null;
  shipments?: ShipmentRow[];
  overload?: OverloadInfo | null;
}

function fmtAddr(a?: ShipmentAddress | null): string {
  if (!a) return '—';
  const parts = [a.zip, a.city].filter(Boolean).join(' ');
  return parts || a.name || '—';
}

export default function FvTourCard({
  tourId,
  tourNumber,
  status,
  onDropShipment,
  onRemoveStop,
}: {
  tourId: string;
  tourNumber?: string | null;
  status: string;
  onDropShipment: (tourId: string, shipmentId: string) => void;
  onRemoveStop: (tourId: string, shipmentId: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const popupWindowRef = useRef<Window | null>(null);
  const qc = useQueryClient();
  const { selectTour } = usePanel();
  const hoverHandlers = useHoverPrefetch(() =>
    prefetchFvTourDetail(qc, tourId),
  );

  const tourQ = useQuery<FvTourDetail>({
    queryKey: ['fv-tour-detail', tourId],
    queryFn: async () =>
      (await api.get<FvTourDetail>(`/tours/${tourId}`)).data,
    staleTime: 10_000,
  });

  const tour = tourQ.data;
  const stops = tour?.shipments ?? [];

  const handleDragOver = (e: React.DragEvent) => {
    if (status !== 'planned') return;
    // W-3.2.C DnD-Unify: 'application/json' Payload-Format.
    if (!Array.from(e.dataTransfer.types).includes('application/json')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dragOver) setDragOver(true);
  };

  const handleDragLeave = () => {
    if (dragOver) setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (status !== 'planned') return;
    const json = e.dataTransfer.getData('application/json');
    if (!json) return;
    try {
      const parsed = JSON.parse(json) as {
        shipmentId?: string;
        shipmentIds?: string[];
      };
      const ids = Array.isArray(parsed.shipmentIds)
        ? parsed.shipmentIds
        : parsed.shipmentId
          ? [parsed.shipmentId]
          : [];
      // FvTourCard onDropShipment ist single-id. Multi-Select-Drag
      // wird per ID einzeln durchgereicht (Parent kann optional
      // batchen). Status-Quo: erstes Element.
      for (const id of ids) onDropShipment(tourId, id);
    } catch {
      /* invalid JSON-Payload — silent */
    }
  };

  const km = tour?.geplante_km != null ? Number(tour.geplante_km) : null;

  // S-1: Conditional Capacity-Display.
  // < 70% → schmaler Text "X% (worst-axis)"
  // >= 70% → OverloadBar (red wenn >100%, amber-Hint wenn 70-100%).
  const overload = tour?.overload ?? null;
  const maxAxisRatio = Math.max(
    overload?.ldm ?? 0,
    overload?.weight ?? 0,
  );
  const worstAxisLabel = (overload?.ldm ?? 0) >= (overload?.weight ?? 0)
    ? 'LDM'
    : 'kg';

  // W-3.4: FV-Beladeplan in neuem Fenster (mirror P0-8 NV-Pattern).
  const loadingPopupRef = useRef<Window | null>(null);
  const openLoadingPopup = () => {
    if (loadingPopupRef.current && !loadingPopupRef.current.closed) {
      loadingPopupRef.current.focus();
      return;
    }
    const w = window.open(
      `/loading/${tourId}`,
      `fv-loading-plan-${tourId}`,
      'width=1200,height=900,noopener=no',
    );
    if (w) loadingPopupRef.current = w;
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      {...hoverHandlers}
      className={`bg-white border rounded-md shadow-sm transition-colors ${
        dragOver ? 'border-blue-500 bg-blue-50/40' : 'border-gray-200'
      }`}
    >
      <div
        className="px-3 py-2 border-b bg-gray-50 cursor-pointer"
        onClick={(e) => {
          // Klick auf Header → Panel (außer Btn-Klicks bubblen nicht)
          const tag = (e.target as HTMLElement).closest('button');
          if (tag) return;
          selectTour(tourId);
        }}
      >
        {maxAxisRatio >= 0.7 ? (
          <OverloadBar overload={tour?.overload} className="mb-1" />
        ) : maxAxisRatio > 0 ? (
          <div className="text-[10px] text-gray-500 mb-1">
            Auslastung {(maxAxisRatio * 100).toFixed(0)}% ({worstAxisLabel})
          </div>
        ) : null}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-semibold text-sm text-gray-800">
            {tourNumber ?? tour?.tour_number ?? '—'}
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">
            {status}
          </span>
          {km != null && (
            <span className="text-xs text-gray-600">
              · {km.toFixed(1)} km
            </span>
          )}
          {tour?.subcontractors?.name && (
            <span className="text-xs text-gray-600 truncate">
              · {tour.subcontractors.name}
            </span>
          )}
          <button
            onClick={() => openFvMapPopup(tourId, popupWindowRef)}
            className="ml-auto inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
            title="Karte in neuem Fenster"
          >
            <ExternalLink size={11} />
            Karte
          </button>
          <button
            onClick={openLoadingPopup}
            className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
            title="Beladeplan in neuem Fenster"
          >
            <Box size={11} />
            Beladeplan
          </button>
        </div>
        <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-600 flex-wrap">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${
              tour?.hub_start_address
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-gray-50 text-gray-500 border border-gray-200'
            }`}
            title="Hub-Start"
          >
            <Warehouse size={11} />
            {tour?.hub_start_address ? fmtAddr(tour.hub_start_address) : 'ohne Start-Hub'}
          </span>
          <span className="text-gray-400">→</span>
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${
              tour?.hub_end_address
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-gray-50 text-gray-500 border border-gray-200'
            }`}
            title="Hub-Ende"
          >
            <Warehouse size={11} />
            {tour?.hub_end_address ? fmtAddr(tour.hub_end_address) : 'ohne End-Hub'}
          </span>
        </div>
      </div>
      <div className="divide-y">
        {tourQ.isLoading && (
          <div className="px-3 py-2 text-xs text-gray-400">Lädt...</div>
        )}
        {!tourQ.isLoading && stops.length === 0 && (
          <div className="px-3 py-4 text-xs text-gray-400 italic text-center">
            Sendung hierher ziehen
          </div>
        )}
        {stops.map((s, i) => {
          const load = s.addresses_shipments_loading_address_idToaddresses;
          const del = s.addresses_shipments_delivery_address_idToaddresses;
          return (
            <div
              key={s.id}
              className="px-3 py-1.5 flex items-center gap-2 text-xs hover:bg-gray-50"
            >
              <span className="text-gray-400 font-mono w-5 text-right">
                {i + 1}.
              </span>
              <MapPin size={12} className="text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-mono text-gray-800 truncate">
                  {s.shipment_number ?? '—'}{' '}
                  <span className="text-gray-500">
                    · {s.customers?.name ?? '—'}
                  </span>
                </div>
                <div className="text-gray-500 truncate">
                  {fmtAddr(load)} → {fmtAddr(del)}
                </div>
              </div>
              {status === 'planned' && (
                <button
                  onClick={() => onRemoveStop(tourId, s.id)}
                  className="text-gray-400 hover:text-red-600 flex-shrink-0"
                  title="Stop entfernen"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
