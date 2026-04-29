import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import type { ShipmentMapItem } from '../types/shipment';
import type { Tour } from '../types/tour';
import { api } from '../lib/api';

function coords(addr: { lat?: unknown; lng?: unknown } | null | undefined): [number, number] | null {
  if (!addr) return null;
  // Important: don't turn null/undefined into 0,0
  if (addr.lat == null || addr.lng == null) return null;
  const lat = Number(addr.lat);
  const lng = Number(addr.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  // Expected order is [lat, lng] = [Breitengrad, Längengrad]
  // Examples:
  // - Milano: lat=45.4642, lng=9.1900
  // - Stuttgart: lat=48.7758, lng=9.1829
  const latInRange = Math.abs(lat) <= 90;
  const lngInRange = Math.abs(lng) <= 180;
  if (latInRange && lngInRange) return [lat, lng];

  // Fallback if API accidentally swaps them
  const swappedLatInRange = Math.abs(lng) <= 90;
  const swappedLngInRange = Math.abs(lat) <= 180;
  if (swappedLatInRange && swappedLngInRange) return [lng, lat];

  return null;
}

function pinColor(s: ShipmentMapItem): string {
  // Requirement:
  // - Not dispatched (no tour) => grey
  // - Dispatched => traffic light by DB% if available, else blue
  if (!s.tour_id) return '#9CA3AF';
  const pctRaw = s.cm_percent;
  const pct = pctRaw == null ? null : Number(pctRaw);
  if (pct != null && !Number.isNaN(pct)) {
    if (pct >= 15) return '#22C55E';
    if (pct >= 5) return '#EAB308';
    return '#EF4444';
  }
  return '#3B82F6';
}

const BLUE_TOUR = '#2563EB';
const GRAY_PIN = '#9CA3AF';

function getPinStyleForTourSelection(s: ShipmentMapItem, selectedTourId: string | null) {
  if (!selectedTourId) {
    const color = pinColor(s);
    return { color, fillColor: color, radius: 14, fillOpacity: 0.9, weight: 3, visibleForBounds: true };
  }

  // Tour mode:
  // - undispatched => grey, radius 10
  // - selected tour => blue, radius 14
  // - other tours => tiny + transparent
  if (!s.tour_id) {
    return { color: GRAY_PIN, fillColor: GRAY_PIN, radius: 10, fillOpacity: 0.9, weight: 2, visibleForBounds: true };
  }
  if (s.tour_id === selectedTourId) {
    return { color: BLUE_TOUR, fillColor: BLUE_TOUR, radius: 14, fillOpacity: 0.9, weight: 3, visibleForBounds: true };
  }
  return { color: GRAY_PIN, fillColor: GRAY_PIN, radius: 3, fillOpacity: 0.05, weight: 1, visibleForBounds: false };
}

export interface DispositionMapProps {
  shipments: ShipmentMapItem[];
  tours: Tour[];
  selectedId: string | null;
  selectedTourId: string | null;
  onSelect: (id: string | null) => void;
  tourRouteRefreshKey?: number;
  selectedTourAlternativeIndex?: number | null;
  onSelectedAlternativeIndexChange?: (index: number) => void;
  onTourRouteDistances?: (args: {
    totalDistanceKm: number | null;
    shipmentDistancesKmById: Record<string, number | null>;
    alternativesTotalDistanceKm?: Array<number | null>;
    alternativesTotalDurationSeconds?: Array<number | null>;
    alternativesTotalCostMetric?: Array<number | null>;
  }) => void;
}

export default function DispositionMap({
  shipments,
  tours: _tours, // kept for API contract
  selectedId,
  selectedTourId,
  onSelect,
  tourRouteRefreshKey,
  onTourRouteDistances,
  selectedTourAlternativeIndex,
  onSelectedAlternativeIndexChange,
}: DispositionMapProps) {
  const [routesLoading, setRoutesLoading] = useState(false);
  const [tourShipments, setTourShipments] = useState<ShipmentMapItem[]>([]);
  const tourShipmentsStateRef = useRef<ShipmentMapItem[]>([]);
  const [selectedAlternativeIndex, setSelectedAlternativeIndex] = useState(0);
  const tourRouteGeometryRef = useRef<any>(null);
  const onTourRouteDistancesRef = useRef<DispositionMapProps['onTourRouteDistances']>(undefined);

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const markerByIdRef = useRef<
    Record<
      string,
      {
        latlng: L.LatLng;
        marker: L.CircleMarker;
        baseColor: string;
        baseRadius: number;
        baseFillOpacity: number;
        baseWeight: number;
      }
    >
  >({});
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  const prevSelectedRef = useRef<string | null>(null);
  const legendRef = useRef<L.Control | null>(null);
  const resetControlRef = useRef<L.Control | null>(null);
  const routeLayersRef = useRef<L.Polyline[]>([]);
  const routeGeometriesRef = useRef<any[]>([]);
  const routesRequestIdRef = useRef(0);
  const [mapReady, setMapReady] = useState(false);
  const lastTourRouteKeyRef = useRef<string | null>(null);
  const lastTourShipmentsKeyRef = useRef<string | null>(null);
  const hasUserSelectedAlternativeRef = useRef(false);
  const [userAlternativeSelectionNonce, setUserAlternativeSelectionNonce] = useState(0);
  const tourAlternativeRankingRef = useRef<{
    fastestIndex: number;
    shortestIndex: number;
    cheapestIndex: number;
  } | null>(null);
  const routeAlternativesRef = useRef<
    Array<{
      totalDistanceKm: number | null;
      totalDurationSeconds: number | null;
      totalCostMetric: number | null;
    }>
  >([]);
  const routeShipmentsIdsRef = useRef<string[]>([]);
  const shipmentDistancesKmByIdRef = useRef<Record<string, number | null>>({});

  useEffect(() => {
    onTourRouteDistancesRef.current = onTourRouteDistances;
  }, [onTourRouteDistances]);

  // Allow parent to control which OSRM alternative is considered "selected".
  useEffect(() => {
    if (selectedTourAlternativeIndex == null) return;
    if (selectedTourAlternativeIndex === selectedAlternativeIndex) return;
    setSelectedAlternativeIndex(selectedTourAlternativeIndex);
  }, [selectedTourAlternativeIndex, selectedAlternativeIndex]);

  const pins = useMemo(() => {
    const pinsSource = selectedTourId ? tourShipments : shipments;
    return pinsSource
      .map((s) => {
        const addr = s.addresses_shipments_delivery_address_idToaddresses ?? s.addresses_shipments_loading_address_idToaddresses;
        const pos = coords(addr);
        return pos ? { s, pos } : null;
      })
      .filter(Boolean) as { s: ShipmentMapItem; pos: [number, number] }[];
  }, [shipments, selectedTourId, tourShipments]);

  useEffect(() => {
    tourShipmentsStateRef.current = tourShipments;
  }, [tourShipments]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedTourId) {
        if (tourShipmentsStateRef.current.length > 0) {
          setTourShipments([]);
        }
        lastTourShipmentsKeyRef.current = null;
        lastTourRouteKeyRef.current = null;
        return;
      }
      try {
        // order changes should re-fetch route + distances
        if (tourRouteRefreshKey != null) {
          lastTourRouteKeyRef.current = null;
          lastTourShipmentsKeyRef.current = null;
        }
        const { data } = await api.get<ShipmentMapItem[]>('/shipments/map', {
          params: { tourId: selectedTourId },
        });
        if (cancelled) return;
        const next = data ?? [];
        const normalized = [...next].sort((a, b) => {
          const d = (a.tour_position ?? 0) - (b.tour_position ?? 0);
          if (d !== 0) return d;
          return a.id.localeCompare(b.id);
        });
        const nextKey = `${selectedTourId}|${normalized.map((s) => s.id).join(',')}`;
        if (lastTourShipmentsKeyRef.current === nextKey) return;
        lastTourShipmentsKeyRef.current = nextKey;
        setTourShipments(normalized);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[DispositionMap] failed to fetch tour shipments:', e);
        if (cancelled) return;
        if (tourShipmentsStateRef.current.length > 0) setTourShipments([]);
        lastTourShipmentsKeyRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedTourId, tourRouteRefreshKey]);

  useEffect(() => {
    if (!mapDivRef.current) return;
    if (mapRef.current) return;

    const map = L.map(mapDivRef.current, {
      center: [51.1657, 10.4515], // Germany
      zoom: 6,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;
    mapRef.current = map;

    // Reset / show all button (top-right)
    const resetControl = new L.Control({ position: 'topright' as any });
    (resetControl as any).onAdd = () => {
      const div = L.DomUtil.create('div', 'leaflet-control');
      const btn = L.DomUtil.create('button', '', div) as HTMLButtonElement;
      btn.type = 'button';
      btn.textContent = 'Alle anzeigen';
      btn.style.background = 'rgba(255,255,255,0.95)';
      btn.style.border = '1px solid rgba(0,0,0,0.12)';
      btn.style.borderRadius = '10px';
      btn.style.padding = '8px 10px';
      btn.style.cursor = 'pointer';
      btn.style.fontSize = '12px';
      btn.style.fontWeight = '600';
      btn.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';
      btn.onclick = () => onSelect(null);
      L.DomEvent.disableClickPropagation(div);
      return div;
    };
    resetControl.addTo(map);
    resetControlRef.current = resetControl;

    // Legend (bottom-left)
    const legend = new L.Control({ position: 'bottomleft' as any });
    (legend as any).onAdd = () => {
      const div = L.DomUtil.create('div', 'leaflet-control leaflet-bar');
      div.style.background = 'rgba(255,255,255,0.95)';
      div.style.padding = '10px 12px';
      div.style.borderRadius = '10px';
      div.style.border = '1px solid rgba(0,0,0,0.08)';
      div.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';
      div.style.fontSize = '12px';
      div.style.lineHeight = '1.25';
      div.innerHTML =
        `<div style="font-weight:600;margin-bottom:6px">Legende</div>` +
        `<div style="display:flex;align-items:center;gap:8px;margin:4px 0"><span style="width:12px;height:12px;border-radius:999px;background:#9CA3AF;border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.25)"></span>Grau = Nicht disponiert</div>` +
        `<div style="display:flex;align-items:center;gap:8px;margin:4px 0"><span style="width:12px;height:12px;border-radius:999px;background:#3B82F6;border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.25)"></span>Blau = Disponiert</div>` +
        `<div style="display:flex;align-items:center;gap:8px;margin:4px 0"><span style="display:inline-block;width:12px;height:0;border-top:3px dashed #16A34A"></span>Schnellste Route</div>` +
        `<div style="display:flex;align-items:center;gap:8px;margin:4px 0"><span style="display:inline-block;width:12px;height:0;border-top:3px dashed #6B7280"></span>Kürzeste Route</div>`;
      return div;
    };
    legend.addTo(map);
    legendRef.current = legend;

    // Invalidate after mount to ensure tiles paint (container may size later)
    setTimeout(() => map.invalidateSize(), 100);
    setMapReady(true);

    return () => {
      markerByIdRef.current = {};
      boundsRef.current = null;
      markersLayer.clearLayers();
      routeLayersRef.current.forEach((l) => map.removeLayer(l));
      routeLayersRef.current = [];
      resetControlRef.current?.remove();
      resetControlRef.current = null;
      legendRef.current?.remove();
      legendRef.current = null;
      map.remove(); // prevent memory leaks
      mapRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer || !mapReady) return;

    markersLayer.clearLayers();
    markerByIdRef.current = {};

    const boundsPoints: L.LatLng[] = [];

    for (const { s, pos } of pins) {
      const style = getPinStyleForTourSelection(s, selectedTourId);
      const marker = L.circleMarker(pos, {
        radius: style.radius,
        color: style.color,
        fillColor: style.fillColor,
        fillOpacity: style.fillOpacity,
        weight: style.weight,
      });

      marker.on('click', () => onSelect(s.id));
      marker.on('mouseover', () => marker.openPopup());
      marker.on('mouseout', () => marker.closePopup());

      // Popup content (simple HTML)
      const load = s.addresses_shipments_loading_address_idToaddresses;
      const deliv = s.addresses_shipments_delivery_address_idToaddresses;
      const from = load ? [load.city, load.name].filter(Boolean).join(' ') || '–' : '–';
      const to = deliv ? [deliv.city, deliv.name].filter(Boolean).join(' ') || '–' : '–';
      const customerName = s.customers?.name ?? '–';
      const eur = (n: unknown) =>
        n != null && Number.isFinite(Number(n))
          ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(
              Number(n),
            )
          : '–';
      const revenue = eur(s.freight_revenue);
      const ldm = s.ldm != null ? String(s.ldm) : '–';
      const pre = eur(s.pre_carriage_cost);
      const main = eur(s.main_carriage_cost);
      const on = eur(s.on_carriage_cost);
      const totalC = eur(s.total_cost);
      const db = eur(s.contribution_margin);
      const dbPct =
        s.cm_percent != null && Number.isFinite(Number(s.cm_percent))
          ? `${Number(s.cm_percent).toFixed(1)} %`
          : '–';

      marker.bindPopup(
        `<div style="font-size:14px;min-width:220px">\n` +
          `<div style="font-weight:700;margin-bottom:2px">${s.shipment_number}</div>\n` +
          `<div style="margin:1px 0">Kunde: ${customerName}</div>\n` +
          `<div style="margin:1px 0">Von → Nach: ${from} → ${to}</div>\n` +
          `<div style="margin:1px 0">ldm: ${ldm}</div>\n` +
          `<div style="margin:1px 0">Erlös: ${revenue}</div>\n` +
          `<div style="margin:1px 0;color:#444">Vorlauf: ${pre} · Hauptlauf: ${main} · Nachlauf: ${on}</div>\n` +
          `<div style="margin:1px 0;font-weight:600">Kosten Σ: ${totalC} · DB: ${db} (${dbPct})</div>\n` +
          `</div>`,
      );

      marker.addTo(markersLayer);

      markerByIdRef.current[s.id] = {
        latlng: marker.getLatLng(),
        marker,
        baseColor: style.color,
        baseRadius: style.radius,
        baseFillOpacity: style.fillOpacity,
        baseWeight: style.weight,
      };
      if (style.visibleForBounds) boundsPoints.push(marker.getLatLng());
    }

    // Fit to all pins immediately
    if (boundsPoints.length >= 2) {
      const bounds = L.latLngBounds(boundsPoints);
      boundsRef.current = bounds;
      const shouldFitBounds = !!selectedTourId || !selectedId;
      if (shouldFitBounds) map.fitBounds(bounds, { padding: [30, 30] });
    } else if (boundsPoints.length === 1) {
      boundsRef.current = L.latLngBounds([boundsPoints[0], boundsPoints[0]]);
      const shouldFitBounds = !!selectedTourId || !selectedId;
      if (shouldFitBounds) map.setView(boundsPoints[0], 10);
    }
  }, [pins, onSelect, mapReady, selectedId, selectedTourId]);

  // Draw OSRM alternatives for the full tour route when a tour is selected
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Remove previous route layers
    routeLayersRef.current.forEach((l) => map.removeLayer(l));
    routeLayersRef.current = [];
    routeGeometriesRef.current = [];

    if (!selectedTourId) {
      setRoutesLoading(false);
      lastTourRouteKeyRef.current = null;
      tourRouteGeometryRef.current = null;
      routeAlternativesRef.current = [];
      routeShipmentsIdsRef.current = [];
      shipmentDistancesKmByIdRef.current = {};
      onTourRouteDistancesRef.current?.({
        totalDistanceKm: null,
        shipmentDistancesKmById: {},
        alternativesTotalDistanceKm: [],
        alternativesTotalDurationSeconds: [],
        alternativesTotalCostMetric: [],
      });
      return;
    }

    const orderedShipments = [...tourShipments].sort((a, b) => {
      const d = (a.tour_position ?? 0) - (b.tour_position ?? 0);
      if (d !== 0) return d;
      return a.id.localeCompare(b.id);
    });

    // Request A (per shipment):
    // Waypoints alternate: load1;del1;load2;del2;...
    // We take legs[2*j] => loading_j -> delivery_j distance.
    const latLngWaypointsA: Array<[number, number]> = [];
    const routeShipmentsA: ShipmentMapItem[] = [];
    for (const s of orderedShipments) {
      const load = coords(s.addresses_shipments_loading_address_idToaddresses);
      const deliv = coords(s.addresses_shipments_delivery_address_idToaddresses);
      if (!load || !deliv) continue;
      routeShipmentsA.push(s);
      latLngWaypointsA.push(load);
      latLngWaypointsA.push(deliv);
    }

    if (routeShipmentsA.length === 0 || latLngWaypointsA.length < 2) {
      setRoutesLoading(false);
      return;
    }

    const waypointStrA = latLngWaypointsA.map(([lat, lng]) => `${lng},${lat}`).join(';');

    // Request B (total route for drawing + total km):
    // Gesamtstrecke: Lager -> Entladestellen in disponierter Reihenfolge (single pass, ohne Rückkehr zum Lager).
    const commonLoad = coords(routeShipmentsA[0].addresses_shipments_loading_address_idToaddresses);
    if (!commonLoad) {
      setRoutesLoading(false);
      return;
    }

    const latLngWaypointsB: Array<[number, number]> = [commonLoad];
    for (const s of routeShipmentsA) {
      const deliv = coords(s.addresses_shipments_delivery_address_idToaddresses);
      if (!deliv) continue;
      latLngWaypointsB.push(deliv);
    }

    // Deduplicate consecutive identical points (OSRM can reject duplicates).
    const dedupedWaypointsB: Array<[number, number]> = [];
    for (const p of latLngWaypointsB) {
      const prev = dedupedWaypointsB[dedupedWaypointsB.length - 1];
      if (prev && prev[0] === p[0] && prev[1] === p[1]) continue;
      dedupedWaypointsB.push(p);
    }

    if (dedupedWaypointsB.length < 2) {
      setRoutesLoading(false);
      return;
    }

    const waypointStrB = dedupedWaypointsB.map(([lat, lng]) => `${lng},${lat}`).join(';');
    const routeKey = `${selectedTourId}|${waypointStrB}`;
    if (lastTourRouteKeyRef.current === routeKey) {
      return;
    }
    lastTourRouteKeyRef.current = routeKey;

    const urlA = `https://router.project-osrm.org/route/v1/driving/${waypointStrA}?overview=false&geometries=geojson`;
    const urlB = `https://router.project-osrm.org/route/v1/driving/${waypointStrB}?overview=full&geometries=geojson&alternatives=true`;

    let cancelled = false;
    const requestId = ++routesRequestIdRef.current;
    setRoutesLoading(true);

    (async () => {
      try {
        const [resA, resB] = await Promise.all([fetch(urlA), fetch(urlB)]);
        const [dataA, dataB] = await Promise.all([resA.json(), resB.json()]);
        const routesB = (dataB?.routes ?? []).slice(0, 3);
        if (cancelled || routesRequestIdRef.current !== requestId) return;

        if (!routesB.length) {
          setRoutesLoading(false);
          return;
        }

        // Per-shipment distances from Request A legs.
        const shipmentDistancesKmById: Record<string, number | null> = {};
        const route0A = dataA?.routes?.[0];
        const legsA = Array.isArray(route0A?.legs) ? route0A.legs : [];
        for (let j = 0; j < routeShipmentsA.length; j++) {
          const legMeters = legsA[2 * j]?.distance;
          shipmentDistancesKmById[routeShipmentsA[j].id] =
            typeof legMeters === 'number' && Number.isFinite(legMeters) ? legMeters / 1000 : null;
        }

        type TourAlternative = {
          totalDistanceKm: number | null;
          totalDurationSeconds: number | null;
          totalCostMetric: number | null;
        };

        // IMPORTANT: Keep indices aligned across:
        // - drawn polylines array order (what Leaflet renders)
        // - alternatives metrics array order (what we rank/select)
        type DrawnAlt = {
          poly: L.Polyline;
          geometry: any | null;
          alternative: TourAlternative;
        };

        const drawn: DrawnAlt[] = [];

        for (const r of routesB) {
          const coordPairs = r?.geometry?.coordinates as Array<[number, number]> | undefined;
          if (!coordPairs || coordPairs.length < 2) continue;

          const totalDistanceKm =
            typeof r?.distance === 'number' ? r.distance / 1000 : Number(r?.distance) / 1000;
          const totalDurationSeconds =
            typeof r?.duration === 'number' ? r.duration : Number(r?.duration);
          const totalCostMetric =
            r?.cost != null ? Number(r.cost) : typeof r?.weight === 'number' ? r.weight : totalDurationSeconds;

          const latlng = coordPairs.map(([lng, lat]) => [lat, lng] as [number, number]);
          const poly = L.polyline(latlng, { opacity: 0.9 }).addTo(map);

          drawn.push({
            poly,
            geometry: r?.geometry ?? null,
            alternative: {
              totalDistanceKm: Number.isFinite(totalDistanceKm) ? totalDistanceKm : null,
              totalDurationSeconds: Number.isFinite(totalDurationSeconds) ? totalDurationSeconds : null,
              totalCostMetric: Number.isFinite(totalCostMetric) ? totalCostMetric : null,
            },
          });
        }

        if (drawn.length === 0) {
          setRoutesLoading(false);
          return;
        }

        const alternatives: TourAlternative[] = drawn.map((d) => d.alternative);
        const validDuration: Array<number | null> = alternatives.map((a) => a.totalDurationSeconds);
        const validDistance: Array<number | null> = alternatives.map((a) => a.totalDistanceKm);
        const validCost: Array<number | null> = alternatives.map((a) => a.totalCostMetric);

        const fastestIndex = validDuration.reduce<number | null>(
          (best, v, idx) => {
            if (v == null) return best;
            if (best == null) return idx;
            return v < (validDuration[best] ?? Infinity) ? idx : best;
          },
          null,
        );
        const shortestIndex = validDistance.reduce<number | null>(
          (best, v, idx) => {
            if (v == null) return best;
            if (best == null) return idx;
            return v < (validDistance[best] ?? Infinity) ? idx : best;
          },
          null,
        );
        const cheapestIndex = validCost.reduce<number | null>(
          (best, v, idx) => {
            if (v == null) return best;
            if (best == null) return idx;
            return v < (validCost[best] ?? Infinity) ? idx : best;
          },
          null,
        );

        tourAlternativeRankingRef.current = {
          fastestIndex: fastestIndex ?? 0,
          shortestIndex: shortestIndex ?? 0,
          cheapestIndex: cheapestIndex ?? 0,
        };

        const defaultSelectedAlternativeIndex = fastestIndex ?? 0;
        const fastestIdx = fastestIndex ?? 0;
        let shortestIdx = shortestIndex ?? fastestIdx;
        if (shortestIdx === fastestIdx && alternatives.length > 1) {
          // Ensure we have two distinct selectable options (fastest + "next best shortest").
          let bestIdx: number | null = null;
          for (let i = 0; i < alternatives.length; i++) {
            if (i === fastestIdx) continue;
            const d = alternatives[i]?.totalDistanceKm;
            if (d == null) continue;
            if (bestIdx == null) {
              bestIdx = i;
              continue;
            }
            const bestD = alternatives[bestIdx]?.totalDistanceKm;
            if (bestD == null || d < bestD) bestIdx = i;
          }
          shortestIdx = bestIdx ?? (fastestIdx === 0 ? 1 : 0);
        }

        // Initially: show fastest/shortest by color (green/grey). Only switch to blue after manual user click.
        hasUserSelectedAlternativeRef.current = false;
        setUserAlternativeSelectionNonce(0);

        const polylines: L.Polyline[] = drawn.map((d) => d.poly);
        const geometries: any[] = drawn.map((d) => d.geometry);

        for (let i = 0; i < drawn.length; i++) {
          const isFastest = i === fastestIdx;
          const isShortest = i === shortestIdx;
          const isSelectable = isFastest || isShortest;

          const showBlueForSelected = hasUserSelectedAlternativeRef.current && i === selectedAlternativeIndex;
          const color = showBlueForSelected ? BLUE_TOUR : isFastest ? '#16A34A' : '#6B7280';

          drawn[i].poly.setStyle({
            color,
            weight: showBlueForSelected ? 4 : isFastest ? 4 : isShortest ? 3 : 3,
            dashArray: showBlueForSelected ? undefined : '8, 6',
            opacity: showBlueForSelected ? 0.95 : isSelectable ? 0.95 : 0.5,
          });

          if (isSelectable) {
            drawn[i].poly.on('click', () => {
              hasUserSelectedAlternativeRef.current = true;
              setUserAlternativeSelectionNonce((n) => n + 1);
              setSelectedAlternativeIndex(i);
              onSelectedAlternativeIndexChange?.(i);
              tourRouteGeometryRef.current = drawn[i]?.geometry ?? null;
            });
          }
        }

        routeLayersRef.current = polylines;
        routeGeometriesRef.current = geometries;
        routeAlternativesRef.current = alternatives;
        routeShipmentsIdsRef.current = routeShipmentsA.map((s) => s.id);
        shipmentDistancesKmByIdRef.current = shipmentDistancesKmById;

        // Default to "main" route = fastest alternative.
        setSelectedAlternativeIndex(defaultSelectedAlternativeIndex);
        onSelectedAlternativeIndexChange?.(defaultSelectedAlternativeIndex);
        tourRouteGeometryRef.current = geometries[defaultSelectedAlternativeIndex] ?? null;
        // Notify parent immediately for default alternative.
        const alt0 = alternatives[defaultSelectedAlternativeIndex];
        onTourRouteDistancesRef.current?.({
          totalDistanceKm:
            typeof alt0?.totalDistanceKm === 'number' && Number.isFinite(alt0.totalDistanceKm)
              ? alt0.totalDistanceKm
              : null,
          shipmentDistancesKmById,
          alternativesTotalDistanceKm: alternatives.map((a: any) => a.totalDistanceKm ?? null),
          alternativesTotalDurationSeconds: alternatives.map((a: any) => a.totalDurationSeconds ?? null),
          alternativesTotalCostMetric: alternatives.map((a: any) => a.totalCostMetric ?? null),
        });

        if (boundsRef.current) {
          map.fitBounds(boundsRef.current, { padding: [30, 30] });
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[DispositionMap] OSRM tour route loading failed:', e);
      } finally {
        if (!cancelled && routesRequestIdRef.current === requestId) {
          setRoutesLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedTourId, tourShipments, mapReady]);

  // Apply the required alternative styling whenever the selected route changes.
  useEffect(() => {
    const polylines = routeLayersRef.current;
    if (!polylines.length) return;

    const ranking = tourAlternativeRankingRef.current;
    const fastestIdx = ranking?.fastestIndex ?? 0;
    const shortestIdx = ranking?.shortestIndex ?? 0;

    polylines.forEach((poly, i) => {
      const isFastest = i === fastestIdx;
      const isShortest = i === shortestIdx;
      const isSelectable = isFastest || isShortest;

      const showBlueForSelected = hasUserSelectedAlternativeRef.current && i === selectedAlternativeIndex;
      const color = showBlueForSelected ? BLUE_TOUR : isFastest ? '#16A34A' : '#6B7280';
      const weight = showBlueForSelected ? 4 : isFastest ? 4 : isShortest ? 3 : 3;
      poly.setStyle({
        color,
        weight,
        opacity: showBlueForSelected ? 0.95 : isSelectable ? 0.95 : 0.5,
        dashArray: showBlueForSelected ? undefined : '8, 6',
      });
    });

    const alt = routeAlternativesRef.current[selectedAlternativeIndex];
    const totalDistanceKm =
      typeof alt?.totalDistanceKm === 'number' && Number.isFinite(alt.totalDistanceKm) ? alt.totalDistanceKm : null;

    onTourRouteDistancesRef.current?.({
      totalDistanceKm,
      shipmentDistancesKmById: shipmentDistancesKmByIdRef.current,
      alternativesTotalDistanceKm: routeAlternativesRef.current.map((a) => a.totalDistanceKm ?? null),
      alternativesTotalDurationSeconds: routeAlternativesRef.current.map((a) => a.totalDurationSeconds ?? null),
      alternativesTotalCostMetric: routeAlternativesRef.current.map((a) => a.totalCostMetric ?? null),
    });
  }, [selectedAlternativeIndex, userAlternativeSelectionNonce]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // reset previous highlight
    const prev = prevSelectedRef.current;
    if (prev && markerByIdRef.current[prev]) {
      const p = markerByIdRef.current[prev];
      p.marker.setStyle({ color: p.baseColor, fillColor: p.baseColor, weight: p.baseWeight, fillOpacity: p.baseFillOpacity });
      p.marker.setRadius(p.baseRadius);
    }

    if (!selectedId) {
      prevSelectedRef.current = null;
      if (boundsRef.current) {
        map.fitBounds(boundsRef.current, { padding: [30, 30] });
      }
      return;
    }

    const entry = markerByIdRef.current[selectedId];
    if (!entry) return;
    // highlight selected
    entry.marker.setStyle({ color: '#111827', weight: 5, fillOpacity: 1 });
    entry.marker.setRadius(18);
    prevSelectedRef.current = selectedId;
    map.flyTo(entry.latlng, 12, { duration: 0.5 });
  }, [selectedId, selectedTourId]);

  return (
    <div
      style={{ height: '100%', width: '100%', position: 'relative' }}
      className="rounded-lg overflow-hidden border border-gray-200"
    >
      <div ref={mapDivRef} style={{ height: '100%', width: '100%', position: 'relative', zIndex: 0 }} />
      {routesLoading && (
        <div className="absolute inset-0 z-[1000] bg-white/60 flex items-center justify-center">
          <div className="animate-spin h-10 w-10 border-2 border-[#1e40af] border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  );
}
