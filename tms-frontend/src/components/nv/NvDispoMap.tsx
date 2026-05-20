import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useNvPending } from '../../lib/useNvPendingStore';

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
  color?: string;
  tour_gebiet_code?: string | null;
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

function makeIcon(active: boolean, label?: string | number, color?: string) {
  const bg = active ? '#16a34a' : color ?? '#1e40af';
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

export type TourStopPin = {
  id: string;
  position: number;
  shipment_number?: string;
  lat: number;
  lng: number;
  isWarehouse?: boolean;
  label?: string;
};

function makeWarehouseIcon() {
  const html = `
    <div style="
      width:32px;height:40px;position:relative;
      filter: drop-shadow(0 2px 3px rgba(0,0,0,.5));
    ">
      <svg viewBox="0 0 32 40" width="32" height="40">
        <path d="M16 0 C 25 0 32 7 32 16 C 32 25 16 40 16 40 C 16 40 0 25 0 16 C 0 7 7 0 16 0 Z"
              fill="#1f2937" stroke="white" stroke-width="2"/>
      </svg>
      <div style="
        position:absolute;top:6px;left:0;right:0;
        text-align:center;color:white;
        font-size:16px;line-height:18px;
        font-family:'Noto Color Emoji',system-ui,sans-serif;
      ">🏭</div>
    </div>
  `;
  return L.divIcon({
    html,
    iconSize: [32, 40],
    iconAnchor: [16, 38],
    className: 'nv-dispo-pin nv-dispo-warehouse',
  });
}

export default function NvDispoMap({
  shipments,
  clickedSequence,
  onPinClick,
  onReset,
  onRouteError,
  tourStops,
  onTourStopClick,
  tourMode,
  tourPolyline,
}: {
  shipments: MapShipment[];
  clickedSequence: string[];
  onPinClick: (shipmentId: string) => void;
  onReset?: () => void;
  onRouteError?: (msg: string) => void;
  tourStops?: TourStopPin[];
  onTourStopClick?: (stopId: string) => void;
  /** PICKUP/DELIVERY für Tour-Polyline-Cache-Key.
   *  Verhindert Cache-Kollision bei identischen Adressen
   *  in beiden Modi. */
  tourMode?: 'PICKUP' | 'DELIVERY';
  /** Backend-persisted GeoJSON LineString (overview=full).
   *  IF gesetzt → kein OSRM-Fetch im Frontend.
   *  ELSE → existing Fetch-Fallback (alte Touren + post-reorder). */
  tourPolyline?: {
    type: 'LineString';
    coordinates: Array<[number, number]>;
  } | null;
}) {
  // Subscribe to external pending store — re-rendert NUR diesen
  // Component bei Pending-Mutation (kein Page-Wide-Re-Render).
  const { pendingAddIds, pendingRemoveStopIds } = useNvPending();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const polylineRef = useRef<L.Polyline | null>(null);
  const tourMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const tourPolylineRef = useRef<L.Polyline | null>(null);
  const tourAbortRef = useRef<AbortController | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);
  // Ref-Pattern: Marker-Handler verwenden .current und sehen
  // immer den aktuellen Callback. Kein Stale-Closure mehr.
  const onPinClickRef = useRef(onPinClick);
  const onTourStopClickRef = useRef(onTourStopClick);
  useEffect(() => {
    onPinClickRef.current = onPinClick;
  }, [onPinClick]);
  useEffect(() => {
    onTourStopClickRef.current = onTourStopClick;
  }, [onTourStopClick]);
  const cacheRef = useRef<
    Map<string, { coords: [number, number][]; distance: number; duration: number }>
  >(new Map());
  // Tour-Polyline-Cache: keyed auf coords-string der visibleStops.
  // Verhindert Re-Fetch der OSRM-Route wenn Stops/Reihenfolge gleich.
  const tourPolylineCacheRef = useRef<Map<string, [number, number][]>>(
    new Map(),
  );
  const lastTourCoordsKeyRef = useRef<string | null>(null);
  const [routeInfo, setRouteInfo] = useState<
    { distance: number; duration: number; fallback: boolean } | null
  >(null);

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
    // P0-12 BUG-3b: ResizeObserver → invalidateSize.
    // Wenn ContextPanel öffnet/schließt, schrumpft/wächst der Map-
    // Container. Leaflet weiß das nicht von selbst → Pin-Klicks
    // treffen alte Pixel-Positionen. invalidateSize() re-berechnet.
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(() => {
        mapRef.current?.invalidateSize();
      });
      ro.observe(containerRef.current);
    }
    return () => {
      ro?.disconnect();
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

    for (const s of shipments) {
      seenIds.add(s.id);
      const ll = toLatLng(s.loading_address);
      if (!ll) continue;
      const seqNumber = clickedIndex.get(s.id);
      const isPending = pendingAddIds?.has(s.id) ?? false;
      // Pending-Add: orange Marker mit "?" Label (sync-pending)
      const icon = isPending
        ? makeIcon(true, '?', '#f59e0b')
        : makeIcon(seqNumber != null, seqNumber, s.color);
      const existing = markersRef.current.get(s.id);
      if (existing) {
        existing.setIcon(icon);
        existing.setLatLng(ll);
        attachDragHandlers(existing, s.id);
      } else {
        const marker = L.marker(ll, { icon }).addTo(map);
        marker.on('click', () => onPinClickRef.current(s.id));
        const tip = `${s.shipment_number} · ${s.customer?.name ?? ''}<br>${s.loading_address?.zip ?? ''} ${s.loading_address?.city ?? ''}`;
        marker.bindTooltip(tip, { direction: 'top', offset: [0, -34] });
        markersRef.current.set(s.id, marker);
        // Attach AFTER addTo: getElement() exists only when in DOM
        attachDragHandlers(marker, s.id);
      }
    }

    function attachDragHandlers(marker: L.Marker, shipmentId: string) {
      const el = marker.getElement() as HTMLElement | null;
      if (!el) return;
      el.setAttribute('draggable', 'true');
      el.setAttribute('data-shipment-id', shipmentId);
      // Avoid stacking multiple listeners
      if (el.dataset.dndBound === '1') return;
      el.dataset.dndBound = '1';
      el.addEventListener('dragstart', (e: DragEvent) => {
        if (!e.dataTransfer) return;
        e.dataTransfer.setData(
          'application/json',
          JSON.stringify({ shipmentId, source: 'map' }),
        );
        e.dataTransfer.effectAllowed = 'move';
        el.dataset.dragging = 'true';
        mapRef.current?.dragging.disable();
      });
      el.addEventListener('dragend', () => {
        delete el.dataset.dragging;
        mapRef.current?.dragging.enable();
      });
    }

    // Remove obsolete markers
    for (const [id, m] of markersRef.current) {
      if (!seenIds.has(id)) {
        map.removeLayer(m);
        markersRef.current.delete(id);
      }
    }
    // Auto-Fit übernimmt zentrale useEffect (shipments + tourStops).
  }, [shipments, clickedIndex, onPinClick, pendingAddIds]);

  // Zentraler Auto-Fit: alle Shipments + Tour-Stops (inkl. Lager-Pins).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const coords: [number, number][] = [];
    for (const s of shipments) {
      const ll = toLatLng(s.loading_address);
      if (ll) coords.push(ll);
    }
    for (const t of tourStops ?? []) {
      if (Number.isFinite(t.lat) && Number.isFinite(t.lng)) {
        coords.push([t.lat, t.lng]);
      }
    }
    if (coords.length === 0) return;
    const id = window.setTimeout(() => {
      const lb = L.latLngBounds(coords.map((c) => L.latLng(c[0], c[1])));
      if (lb.isValid()) {
        map.fitBounds(lb, {
          padding: [50, 50],
          maxZoom: 14,
          animate: false,
        });
      }
    }, 200);
    return () => window.clearTimeout(id);
  }, [shipments, tourStops]);

  // OSRM-Route bei Aenderung der clickedSequence
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const removePolyline = () => {
      if (polylineRef.current) {
        map.removeLayer(polylineRef.current);
        polylineRef.current = null;
      }
    };

    const seqShipments = clickedSequence
      .map((id) => shipments.find((s) => s.id === id))
      .filter((s): s is MapShipment => !!s);
    const coordsLngLat: [number, number][] = [];
    const coordsLatLng: [number, number][] = [];
    for (const s of seqShipments) {
      const a = s.loading_address;
      if (!a || a.lat == null || a.lng == null) continue;
      const lat = Number(a.lat);
      const lng = Number(a.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      coordsLngLat.push([lng, lat]);
      coordsLatLng.push([lat, lng]);
    }

    if (coordsLngLat.length < 2) {
      removePolyline();
      setRouteInfo(null);
      return;
    }

    const key = JSON.stringify(coordsLngLat);
    const cached = cacheRef.current.get(key);
    const drawSolid = (
      latlngs: [number, number][],
      distance: number,
      duration: number,
    ) => {
      removePolyline();
      polylineRef.current = L.polyline(latlngs, {
        color: '#7c3aed',
        weight: 4,
        opacity: 0.7,
      }).addTo(map);
      setRouteInfo({ distance, duration, fallback: false });
    };
    const drawFallback = () => {
      removePolyline();
      polylineRef.current = L.polyline(coordsLatLng, {
        color: '#ef4444',
        weight: 3,
        opacity: 0.5,
        dashArray: '5,10',
      }).addTo(map);
      // Luftlinie summieren
      let dist = 0;
      for (let i = 1; i < coordsLatLng.length; i++) {
        const a = coordsLatLng[i - 1];
        const b = coordsLatLng[i];
        const aL = L.latLng(a[0], a[1]);
        const bL = L.latLng(b[0], b[1]);
        dist += aL.distanceTo(bL);
      }
      setRouteInfo({ distance: dist, duration: 0, fallback: true });
    };

    if (cached) {
      drawSolid(
        cached.coords,
        cached.distance,
        cached.duration,
      );
      return;
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const timeoutId = window.setTimeout(() => ctrl.abort(), 5000);
      const url = `https://router.project-osrm.org/route/v1/driving/${coordsLngLat
        .map(([lng, lat]) => `${lng},${lat}`)
        .join(';')}?overview=full&geometries=geojson`;
      fetch(url, { signal: ctrl.signal })
        .then((r) => {
          if (!r.ok) throw new Error(`OSRM ${r.status}`);
          return r.json();
        })
        .then((j: any) => {
          const route = j?.routes?.[0];
          const geom = route?.geometry?.coordinates as
            | [number, number][]
            | undefined;
          if (!geom || geom.length < 2) {
            drawFallback();
            onRouteError?.('OSRM-Route leer');
            return;
          }
          const latlngs: [number, number][] = geom.map(([lng, lat]) => [
            lat,
            lng,
          ]);
          const distance = Number(route.distance) || 0;
          const duration = Number(route.duration) || 0;
          cacheRef.current.set(key, {
            coords: latlngs,
            distance,
            duration,
          });
          drawSolid(latlngs, distance, duration);
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return;
          drawFallback();
          onRouteError?.('Routing-Service nicht erreichbar');
        })
        .finally(() => {
          window.clearTimeout(timeoutId);
        });
    }, 500);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [clickedSequence, shipments, onRouteError]);

  // Cleanup polyline + abort on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      if (polylineRef.current && mapRef.current) {
        mapRef.current.removeLayer(polylineRef.current);
      }
      tourAbortRef.current?.abort();
      if (tourPolylineRef.current && mapRef.current) {
        mapRef.current.removeLayer(tourPolylineRef.current);
      }
      for (const m of tourMarkersRef.current.values()) {
        if (mapRef.current) mapRef.current.removeLayer(m);
      }
    };
  }, []);

  // Tour-Stops: Diff-Update statt Rebuild — Marker-Instanzen bleiben am Leben.
  // Polyline: coords-key-Cache; Re-Fetch nur bei tatsächlicher Coord-Änderung.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const visibleStops = (tourStops ?? []).filter(
      (s) => !pendingRemoveStopIds.has(s.id),
    );

    // ───── DIFF-MARKER ─────
    const seenIds = new Set<string>();
    for (const s of visibleStops) {
      seenIds.add(s.id);
      const icon = s.isWarehouse
        ? makeWarehouseIcon()
        : makeIcon(true, s.position, '#16a34a');
      const tip = s.isWarehouse
        ? s.label ?? 'Lager'
        : `Stop ${s.position}${
            s.shipment_number ? ' · ' + s.shipment_number : ''
          } · klick zum Entfernen`;
      const existing = tourMarkersRef.current.get(s.id);
      if (existing) {
        existing.setIcon(icon);
        existing.setLatLng([s.lat, s.lng]);
        existing.unbindTooltip();
        existing.bindTooltip(tip, { direction: 'top', offset: [0, -34] });
      } else {
        const m = L.marker([s.lat, s.lng], { icon }).addTo(map);
        m.bindTooltip(tip, { direction: 'top', offset: [0, -34] });
        if (!s.isWarehouse) {
          m.on('click', () => {
            onTourStopClickRef.current?.(s.id);
          });
        }
        tourMarkersRef.current.set(s.id, m);
      }
    }
    // Remove obsolete only
    for (const [id, m] of tourMarkersRef.current) {
      if (!seenIds.has(id)) {
        map.removeLayer(m);
        tourMarkersRef.current.delete(id);
      }
    }

    // ───── POLYLINE COORDS-CACHE ─────
    if (visibleStops.length < 2) {
      if (tourPolylineRef.current) {
        map.removeLayer(tourPolylineRef.current);
        tourPolylineRef.current = null;
      }
      lastTourCoordsKeyRef.current = null;
      return;
    }
    // Cache-Key inkl. tourMode-Prefix + Source-Prefix:
    // 'payload|' (Backend-Geometry) vs 'fetch|' (FE-OSRM) verhindert
    // stale-Cache-Treffer wenn Backend polyline_geometry=null setzt
    // (z.B. nach reorder ohne optimize).
    const coordsKey = [
      tourPolyline ? 'payload' : 'fetch',
      tourMode ?? 'NA',
      ...visibleStops.map(
        (s) => `${s.lng.toFixed(5)},${s.lat.toFixed(5)}`,
      ),
    ].join('|');
    if (coordsKey === lastTourCoordsKeyRef.current) {
      // Coords identisch → kein Re-Fetch, kein Redraw.
      return;
    }
    lastTourCoordsKeyRef.current = coordsKey;

    // BACKEND-PAYLOAD: GeoJSON direkt rendern, kein Fetch.
    // BIG-WIN: 0ms Frontend-Wait + keine OSRM-Rate-Limit-Risiko.
    if (tourPolyline?.coordinates && tourPolyline.coordinates.length >= 2) {
      const latlngs: [number, number][] = tourPolyline.coordinates.map(
        ([lng, lat]) => [lat, lng],
      );
      tourPolylineCacheRef.current.set(coordsKey, latlngs);
      if (tourPolylineRef.current)
        map.removeLayer(tourPolylineRef.current);
      tourPolylineRef.current = L.polyline(latlngs, {
        color: '#1a73e8',
        weight: 6,
        opacity: 0.85,
      }).addTo(map);
      return;
    }

    // Cached?
    const cached = tourPolylineCacheRef.current.get(coordsKey);
    if (cached) {
      if (tourPolylineRef.current)
        map.removeLayer(tourPolylineRef.current);
      tourPolylineRef.current = L.polyline(cached, {
        color: '#1a73e8',
        weight: 6,
        opacity: 0.85,
      }).addTo(map);
      return;
    }

    // Fetch
    tourAbortRef.current?.abort();
    const ctrl = new AbortController();
    tourAbortRef.current = ctrl;
    const timeoutId = window.setTimeout(() => ctrl.abort(), 5000);
    const url = `https://router.project-osrm.org/route/v1/driving/${visibleStops
      .map((s) => `${s.lng},${s.lat}`)
      .join(';')}?overview=full&geometries=geojson`;
    fetch(url, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`OSRM ${r.status}`);
        return r.json();
      })
      .then((j: any) => {
        const geom = j?.routes?.[0]?.geometry?.coordinates as
          | [number, number][]
          | undefined;
        if (!geom || geom.length < 2) return;
        const latlngs: [number, number][] = geom.map(([lng, lat]) => [
          lat,
          lng,
        ]);
        tourPolylineCacheRef.current.set(coordsKey, latlngs);
        if (tourPolylineRef.current && mapRef.current) {
          mapRef.current.removeLayer(tourPolylineRef.current);
        }
        tourPolylineRef.current = L.polyline(latlngs, {
          color: '#1a73e8',
          weight: 6,
          opacity: 0.85,
        }).addTo(map);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        const latlngs: [number, number][] = visibleStops.map((s) => [
          s.lat,
          s.lng,
        ]);
        if (tourPolylineRef.current && mapRef.current) {
          mapRef.current.removeLayer(tourPolylineRef.current);
        }
        tourPolylineRef.current = L.polyline(latlngs, {
          color: '#6b7280',
          weight: 3,
          opacity: 0.5,
          dashArray: '4,8',
        }).addTo(map);
      })
      .finally(() => window.clearTimeout(timeoutId));
  }, [tourStops, onTourStopClick, pendingRemoveStopIds, tourMode, tourPolyline]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0" />
      {routeInfo && (
        <div
          className={`absolute top-2 left-2 z-[400] rounded px-3 py-1.5 text-xs shadow border ${
            routeInfo.fallback
              ? 'bg-red-50 border-red-300 text-red-800'
              : 'bg-white border-gray-300 text-gray-800'
          }`}
        >
          Route: {(routeInfo.distance / 1000).toFixed(1)} km
          {!routeInfo.fallback && routeInfo.duration > 0 && (
            <> · {Math.round(routeInfo.duration / 60)} min</>
          )}
          {routeInfo.fallback && <> (Luftlinie · OSRM nicht erreichbar)</>}
        </div>
      )}
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
