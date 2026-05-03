import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type MapShipment = {
  id: string;
  shipment_number: string;
  customer?: { name: string } | null;
  loading_address?: {
    lat?: string | number | null;
    lng?: string | number | null;
    zip?: string | null;
    city?: string | null;
  } | null;
};

function toLatLng(
  a:
    | { lat?: string | number | null; lng?: string | number | null }
    | null
    | undefined,
): [number, number] | null {
  if (!a || a.lat == null || a.lng == null) return null;
  const lat = Number(a.lat);
  const lng = Number(a.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lat, lng];
}

function makeIcon(active: boolean, label?: string | number) {
  const bg = active ? '#16a34a' : '#1e40af';
  const text = label != null ? String(label) : '';
  const html = `
    <div style="
      width:28px;height:36px;position:relative;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,.4));
    ">
      <svg viewBox="0 0 28 36" width="28" height="36">
        <path d="M14 0 C 22 0 28 6 28 14 C 28 22 14 36 14 36 C 14 36 0 22 0 14 C 0 6 6 0 14 0 Z"
              fill="${bg}" stroke="white" stroke-width="2"/>
      </svg>
      <div style="
        position:absolute;top:5px;left:0;right:0;
        text-align:center;color:white;
        font-size:12px;font-weight:700;line-height:18px;
        font-family:system-ui,sans-serif;
      ">${text}</div>
    </div>
  `;
  return L.divIcon({
    html,
    iconSize: [28, 36],
    iconAnchor: [14, 34],
    className: 'nv-dispo-pin',
  });
}

export default function NvDispoMap({
  shipments,
  clickedSequence,
  onPinClick,
  onReset,
}: {
  shipments: MapShipment[];
  clickedSequence: string[];
  onPinClick: (shipmentId: string) => void;
  onReset?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  // Init Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
    }).setView([48.7758, 9.1829], 9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const clickedIndex = useMemo(() => {
    const m = new Map<string, number>();
    clickedSequence.forEach((id, i) => m.set(id, i + 1));
    return m;
  }, [clickedSequence]);

  // Render markers when shipments or sequence changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seenIds = new Set<string>();
    const bounds: [number, number][] = [];

    for (const s of shipments) {
      seenIds.add(s.id);
      const ll = toLatLng(s.loading_address);
      if (!ll) continue;
      bounds.push(ll);
      const seqNumber = clickedIndex.get(s.id);
      const icon = makeIcon(seqNumber != null, seqNumber);
      const existing = markersRef.current.get(s.id);
      if (existing) {
        existing.setIcon(icon);
        existing.setLatLng(ll);
      } else {
        const marker = L.marker(ll, { icon }).addTo(map);
        marker.on('click', () => onPinClick(s.id));
        const tip = `${s.shipment_number} · ${s.customer?.name ?? ''}<br>${s.loading_address?.zip ?? ''} ${s.loading_address?.city ?? ''}`;
        marker.bindTooltip(tip, { direction: 'top', offset: [0, -34] });
        markersRef.current.set(s.id, marker);
      }
    }

    // Remove obsolete markers
    for (const [id, m] of markersRef.current) {
      if (!seenIds.has(id)) {
        map.removeLayer(m);
        markersRef.current.delete(id);
      }
    }

    if (bounds.length > 0) {
      const lb = L.latLngBounds(bounds.map((b) => L.latLng(b[0], b[1])));
      if (markersRef.current.size > 1) {
        map.fitBounds(lb.pad(0.2), { animate: false });
      }
    }
  }, [shipments, clickedIndex, onPinClick]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0" />
      {onReset && clickedSequence.length > 0 && (
        <button
          onClick={onReset}
          className="absolute top-2 right-2 z-[400] bg-white border border-gray-300 rounded px-3 py-1.5 text-xs font-medium hover:bg-gray-50 shadow"
        >
          Reset ({clickedSequence.length})
        </button>
      )}
    </div>
  );
}
