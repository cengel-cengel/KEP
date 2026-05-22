import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useNvPending } from '../../lib/useNvPendingStore';

// S-7 LOD-Schwelle.
// disableClusteringAtZoom: ≥11 → einzelne Pins, sonst Cluster.
const CLUSTER_BELOW_ZOOM = 11;

// S-7 Severity → SVG-Stroke-Color für Stop-Pin-Border.
function severityStroke(sev?: string | null): string {
  switch (sev) {
    case 'critical':
      return '#ef4444'; // red-500
    case 'warning':
      return '#f59e0b'; // amber-500
    case 'ok':
      return '#10b981'; // green-500 (decoration only)
    default:
      return '#ffffff'; // default white border
  }
}

// S-7 Tour-Status → Polyline-Color.
export function polylineColorForStatus(status?: string | null): string {
  switch (status) {
    case 'IN_PROGRESS':
      return '#3b82f6'; // blue-500
    case 'COMPLETED':
      return '#10b981'; // green-500
    case 'CANCELLED':
      return '#9ca3af'; // gray-400
    case 'LATE':
      return '#ef4444'; // red-500
    case 'PLANNING':
    default:
      return '#64748b'; // slate-500
  }
}

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

/**
 * A' Sprint: Marker-Polish.
 * - active=true → bg-green (#16a34a) für "active eligible pin"
 * - color override → per-Gebiet-Farbe ODER hardcoded color
 * - selected=true → amber-ring (visual highlight bei selectedStopId)
 */
function makeIcon(
  active: boolean,
  label?: string | number,
  color?: string,
  selected: boolean = false,
  severityStrokeColor?: string,
) {
  const bg = active ? '#16a34a' : color ?? '#1e40af';
  const text = label != null ? String(label) : '';
  const ringStroke = selected
    ? `<circle cx="14" cy="14" r="13" fill="none" stroke="#f59e0b" stroke-width="3"/>`
    : '';
  // S-7: severity-border ersetzt den default-white-stroke wenn gesetzt.
  const stroke = severityStrokeColor ?? 'white';
  const strokeWidth = severityStrokeColor ? '3' : '2';
  const html = `
    <div style="
      width:28px;height:36px;position:relative;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,.4));
    ">
      <svg viewBox="0 0 28 36" width="28" height="36">
        <path d="M14 0 C 22 0 28 6 28 14 C 28 22 14 36 14 36 C 14 36 0 22 0 14 C 0 6 6 0 14 0 Z"
              fill="${bg}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
        ${ringStroke}
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
    // C2-I: selected → pulse-class (CSS-Keyframe in index.css mit
    // prefers-reduced-motion-Fallback).
    className: selected
      ? 'nv-dispo-pin nv-dispo-pin--selected'
      : 'nv-dispo-pin',
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
  /** S-7: SLA-Severity ('ok'|'warning'|'critical') für Border-Color. */
  risk_severity?: string | null;
};

/** Map-Routing: Nearby-Pin (gray dashed border, ≤20km nicht-disp). */
function makeNearbyIcon() {
  const html = `
    <div style="
      width:24px;height:32px;position:relative;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,.3));
    ">
      <svg viewBox="0 0 24 32" width="24" height="32">
        <path d="M12 0 C 18 0 24 5 24 12 C 24 19 12 32 12 32 C 12 32 0 19 0 12 C 0 5 6 0 12 0 Z"
              fill="white" stroke="#6b7280" stroke-width="2" stroke-dasharray="3 2"/>
      </svg>
      <div style="
        position:absolute;top:3px;left:0;right:0;
        text-align:center;color:#374151;
        font-size:11px;font-weight:600;line-height:18px;
        font-family:system-ui,sans-serif;
      ">+</div>
    </div>
  `;
  return L.divIcon({
    html,
    iconSize: [24, 32],
    iconAnchor: [12, 30],
    className: 'nv-dispo-nearby-pin',
  });
}

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
  selectedStopId,
  tourStopColor,
  tourStatus,
  nearbyShipments,
  onNearbyClick,
  previewPolylineCoords,
  fitTriggerKey,
}: {
  shipments: MapShipment[];
  clickedSequence: string[];
  onPinClick: (shipmentId: string) => void;
  /** Map-Routing Sprint: nearby ≤20km nicht-disponierte
   *  Sendungen. Distinct gray-dashed pin. */
  nearbyShipments?: Array<{
    id: string;
    shipment_number: string;
    lat: number;
    lng: number;
    customer_name?: string | null;
    distance_km?: number;
  }>;
  /** Pin-Klick → optimistic addStop (Caller). */
  onNearbyClick?: (shipmentId: string) => void;
  /** Map-Routing C1-B: temporäre Haversine-Polyline (gerade
   *  Linie) zum sofortigen Visual-Feedback während OSRM
   *  async lädt. Coords im [lat, lng]-Format (Leaflet). */
  previewPolylineCoords?: Array<[number, number]>;
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
  /** A' Sprint: Stop-ID mit visueller Hervorhebung (amber ring). */
  selectedStopId?: string | null;
  /** A' Sprint: per-Tour-Gebiet-Color für tour-stops (hex). */
  tourStopColor?: string;
  /** S-7: Tour-Status für Polyline-Color (planned/in_progress/late/completed). */
  tourStatus?: string | null;
  /** Bug-Fix 2a: stabiler Auto-Fit-Trigger. Auto-Fit feuert NUR beim
   *  ersten Render UND wenn dieser Key wechselt (z.B. activeTour-id).
   *  Wenn nicht gesetzt → Legacy-Verhalten (bei jedem shipments/stops-
   *  Update — historisch, aber führt zu Fokus-Sprüngen bei Invalidate). */
  fitTriggerKey?: string | null;
}) {
  // Subscribe to external pending store — re-rendert NUR diesen
  // Component bei Pending-Mutation (kein Page-Wide-Re-Render).
  const { pendingAddIds, pendingRemoveStopIds } = useNvPending();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const polylineRef = useRef<L.Polyline | null>(null);
  const tourMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  // Map-Routing: Nearby-Pins (≤20km nicht-disponiert).
  const nearbyMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  // S-7 Marker-Cluster für Tour-Stops (Warehouse-Pins bleiben einzeln).
  const tourClusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const tourPolylineRef = useRef<L.Polyline | null>(null);
  // C1-B: Haversine-Preview-Layer (instant visual feedback,
  // wird durch echtes tourPolylineRef ersetzt sobald OSRM-
  // Geometry vom BE persistiert + invalidate-Pfad zurückkommt).
  const previewPolylineRef = useRef<L.Polyline | null>(null);
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
    // S-7: MarkerCluster für Tour-Stops. Cluster zeigt count + worst-severity
    // als bg-color (via iconCreateFunction). Disable wenn zoom >= 11.
    const cluster = L.markerClusterGroup({
      disableClusteringAtZoom: CLUSTER_BELOW_ZOOM,
      spiderfyOnMaxZoom: false,
      showCoverageOnHover: false,
      maxClusterRadius: 40,
      iconCreateFunction: (c) => {
        // Worst-severity unter den Markers im Cluster.
        let worst: string | null = null;
        const rank = (s: string | null) =>
          s === 'critical' ? 3 : s === 'warning' ? 2 : s === 'ok' ? 1 : 0;
        for (const m of c.getAllChildMarkers()) {
          const s = (m as L.Marker & { _sev?: string | null })._sev ?? null;
          if (rank(s) > rank(worst)) worst = s;
        }
        const bg =
          worst === 'critical'
            ? '#ef4444'
            : worst === 'warning'
              ? '#f59e0b'
              : '#3b82f6';
        const count = c.getChildCount();
        return L.divIcon({
          html: `<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:${bg};color:white;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4);font-weight:700;font-family:system-ui,sans-serif;">${count}</div>`,
          iconSize: [36, 36],
          className: 'nv-cluster-pin',
        });
      },
    });
    map.addLayer(cluster);
    tourClusterRef.current = cluster;
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

  // Map-Routing: Nearby-Pins-Rendering (Diff-Update).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    for (const n of nearbyShipments ?? []) {
      seen.add(n.id);
      const icon = makeNearbyIcon();
      const tip = `${n.shipment_number} · ${n.customer_name ?? ''}${
        n.distance_km != null ? ` · ${n.distance_km.toFixed(1)} km` : ''
      }`;
      const existing = nearbyMarkersRef.current.get(n.id);
      if (existing) {
        existing.setLatLng([n.lat, n.lng]);
        existing.unbindTooltip();
        existing.bindTooltip(tip, { direction: 'top', offset: [0, -30] });
      } else {
        const m = L.marker([n.lat, n.lng], { icon }).addTo(map);
        m.bindTooltip(tip, { direction: 'top', offset: [0, -30] });
        m.on('click', () => onNearbyClick?.(n.id));
        nearbyMarkersRef.current.set(n.id, m);
      }
    }
    for (const [id, m] of nearbyMarkersRef.current) {
      if (!seen.has(id)) {
        map.removeLayer(m);
        nearbyMarkersRef.current.delete(id);
      }
    }
  }, [nearbyShipments, onNearbyClick]);

  // C1-B: Preview-Polyline Render (Hart-Replace, kein Flicker).
  // Wird vom MapPanel als kurzlebige Haversine-Linie übergeben,
  // OSRM-Antwort triggert invalidate → echte tourPolyline ersetzt
  // diese in der nächsten Render.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!previewPolylineCoords || previewPolylineCoords.length < 2) {
      if (previewPolylineRef.current) {
        map.removeLayer(previewPolylineRef.current);
        previewPolylineRef.current = null;
      }
      return;
    }
    const latLngs = previewPolylineCoords.map(([la, ln]) =>
      L.latLng(la, ln),
    );
    if (previewPolylineRef.current) {
      previewPolylineRef.current.setLatLngs(latLngs);
    } else {
      previewPolylineRef.current = L.polyline(latLngs, {
        color: '#6b7280',
        weight: 3,
        opacity: 0.7,
        dashArray: '6 4',
      }).addTo(map);
    }
  }, [previewPolylineCoords]);

  // Bug-Fix 2a + D: stabiler Auto-Fit, Sig-basiert.
  // Sig = `${fitTriggerKey}:${(tourStops?.length ?? 0) > 0}`
  //   key-Wechsel (Tour-Switch) ODER stops-loaded-Übergang triggert.
  //   identische Sig (z.B. nach Pin-Add: N+1 stops, still loaded)
  //   triggert NICHT → kein Fokus-Spring.
  // Vorher (bce40f4): nur lastFitKeyRef === fitTriggerKey. Beim
  //   Initial-Tour-Klick fittete der Effect zu früh (ohne stops,
  //   tour-detail-Query lädt noch) → hasFittedRef=true → nachfolgender
  //   Re-Render mit Stops triggerte nicht mehr. Fokus blieb auf
  //   eligible-coords, Stops + Lager ausserhalb des Frame.
  const hasFittedRef = useRef(false);
  const lastFitSigRef = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const isLegacy = fitTriggerKey === undefined;
    const stopsLoaded = (tourStops?.length ?? 0) > 0;
    const sig = `${fitTriggerKey ?? 'legacy'}:${stopsLoaded}`;
    let shouldFit = isLegacy;
    if (!isLegacy) {
      if (!hasFittedRef.current) shouldFit = true;
      else if (lastFitSigRef.current !== sig) shouldFit = true;
    }
    if (!shouldFit) return;

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
        hasFittedRef.current = true;
        lastFitSigRef.current = sig;
      }
    }, 200);
    return () => window.clearTimeout(id);
  }, [shipments, tourStops, fitTriggerKey]);

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
      // A' Sprint: per-Gebiet-Color + Selected-State (amber ring).
      // S-7: severity-stroke wenn risk_severity gesetzt.
      const isSelected = selectedStopId === s.id;
      const stopColor = tourStopColor ?? '#16a34a';
      const sevStroke =
        s.risk_severity && s.risk_severity !== 'ok' && !s.isWarehouse
          ? severityStroke(s.risk_severity)
          : undefined;
      const icon = s.isWarehouse
        ? makeWarehouseIcon()
        : makeIcon(true, s.position, stopColor, isSelected, sevStroke);
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
        const m = L.marker([s.lat, s.lng], { icon });
        // S-7: store severity on marker für Cluster-iconCreateFunction.
        (m as L.Marker & { _sev?: string | null })._sev =
          s.risk_severity ?? null;
        if (s.isWarehouse) {
          m.addTo(map);
        } else {
          tourClusterRef.current?.addLayer(m);
          m.on('click', () => {
            onTourStopClickRef.current?.(s.id);
          });
        }
        m.bindTooltip(tip, { direction: 'top', offset: [0, -34] });
        tourMarkersRef.current.set(s.id, m);
      }
    }
    // Remove obsolete only
    for (const [id, m] of tourMarkersRef.current) {
      if (!seenIds.has(id)) {
        // S-7: aus Cluster + Map entfernen (idempotent).
        tourClusterRef.current?.removeLayer(m);
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
        color: tourStatus ? polylineColorForStatus(tourStatus) : '#1a73e8',
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
        color: tourStatus ? polylineColorForStatus(tourStatus) : '#1a73e8',
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
          color: tourStatus ? polylineColorForStatus(tourStatus) : '#1a73e8',
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
  }, [
    tourStops,
    onTourStopClick,
    pendingRemoveStopIds,
    tourMode,
    tourPolyline,
    // A' Sprint: re-render markers wenn Selection oder Gebiet-Color
    // ändern (Icon-Update via setIcon).
    selectedStopId,
    tourStopColor,
  ]);

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
