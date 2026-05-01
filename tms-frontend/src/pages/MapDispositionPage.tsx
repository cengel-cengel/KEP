import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft, List, Map as MapIcon } from 'lucide-react';
import Navigation from '../components/Navigation';
import { api } from '../lib/api';
import type { Shipment } from '../types/shipment';

function deliveryCoords(s: Shipment): [number, number] | null {
  const a =
    (s as unknown as { addresses_shipments_delivery_address_idToaddresses?: { lat?: unknown; lng?: unknown } })
      .addresses_shipments_delivery_address_idToaddresses ??
    (s as unknown as { deliveryAddress?: { lat?: unknown; lng?: unknown } }).deliveryAddress;
  if (!a || a.lat == null || a.lng == null) return null;
  const lat = Number(a.lat);
  const lng = Number(a.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lat, lng];
}

export default function MapDispositionPage() {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const { data: shipments = [] } = useQuery<Shipment[]>({
    queryKey: ['shipments', 'map-disposition', 'new'],
    queryFn: async () => {
      const { data } = await api.get<Shipment[]>('/shipments', {
        params: { status: 'new' },
      });
      return data;
    },
  });

  const { withCoords, withoutCoords } = useMemo(() => {
    const withC: Array<{ s: Shipment; pos: [number, number] }> = [];
    const withoutC: Shipment[] = [];
    for (const s of shipments) {
      const pos = deliveryCoords(s);
      if (pos) withC.push({ s, pos });
      else withoutC.push(s);
    }
    return { withCoords: withC, withoutCoords: withoutC };
  }, [shipments]);

  // Karte initialisieren
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const map = L.map(mapDivRef.current, {
      center: [51.1657, 10.4515],
      zoom: 5,
      zoomControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
  }, []);

  // Pins rendern
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    if (withCoords.length === 0) return;

    const bounds = L.latLngBounds([]);
    for (const { s, pos } of withCoords) {
      const shipNo =
        (s as { shipment_number?: string }).shipment_number ??
        s.shipmentNumber ??
        s.id.slice(0, 6);
      const relCode = s.relation?.code ?? '';
      const marker = L.circleMarker(pos, {
        radius: 7,
        color: '#374151',
        fillColor: '#9ca3af',
        fillOpacity: 0.85,
        weight: 1.5,
      });
      marker.bindTooltip(
        `<div style="font-size:11px"><strong>${shipNo}</strong>${
          relCode ? `<br/><span style="opacity:.7">${relCode}</span>` : ''
        }</div>`,
        { direction: 'top', opacity: 0.95 },
      );
      marker.addTo(layer);
      bounds.extend(pos);
    }
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 11 });
    }
  }, [withCoords]);

  return (
    <>
      <Navigation />
      <main className="w-full flex-1 flex flex-col bg-gray-50 min-h-0">
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2">
            <Link to="/disposition" className="text-gray-500 hover:text-gray-800">
              <ArrowLeft size={18} />
            </Link>
            <h1 className="text-lg font-semibold text-gray-900">Karten-Disposition</h1>
          </div>
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
            <Link
              to="/disposition"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white text-gray-700 hover:bg-gray-50 border-r border-gray-300"
            >
              <List size={14} />
              <span>Liste</span>
            </Link>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#1e40af] text-white">
              <MapIcon size={14} />
              <span>Karte</span>
            </span>
          </div>
        </div>

        <div className="px-4 py-2 border-b border-gray-200 bg-white flex flex-wrap items-center gap-2 text-sm text-gray-500">
          <span className="font-medium text-gray-600">Filter:</span>
          <span className="rounded border border-dashed border-gray-300 px-2 py-1">Land</span>
          <span className="rounded border border-dashed border-gray-300 px-2 py-1">Relation</span>
          <span className="rounded border border-dashed border-gray-300 px-2 py-1">Verkehrsart</span>
          <span className="rounded border border-dashed border-gray-300 px-2 py-1">Datum</span>
          <span className="ml-auto text-xs italic">(Filter kommen in Phase C)</span>
        </div>

        <div className="flex-1 min-h-0 relative">
          <div ref={mapDivRef} className="absolute inset-0" />
          <div className="absolute top-2 left-2 z-[1000] rounded bg-white/95 px-2 py-1 text-xs text-gray-700 shadow border border-gray-200">
            <span className="font-medium">{withCoords.length}</span> Pins
            {withoutCoords.length > 0 && (
              <span className="ml-2 text-red-700">
                · {withoutCoords.length} ohne Koord.
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 bg-white px-4 py-2 text-sm text-gray-500 flex items-center justify-between gap-3">
          <span>
            <span className="font-medium text-gray-700">Aktive Tour:</span> –
          </span>
          <span className="text-xs italic">(Tour-Auswahl + Bulk-Add in Phase D)</span>
        </div>
      </main>
    </>
  );
}
