/**
 * OSRM Routing-Helper.
 * Public-Demo-Endpoint, Fair-Use ~1 req/s.
 */
import { Logger } from '@nestjs/common';

const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
const OSRM_TRIP_URL = 'https://router.project-osrm.org/trip/v1/driving';
const logger = new Logger('OsrmLib');

/**
 * Berechnet Fahrt-Distanz in km für eine Sequenz von [lng,lat]-Coords.
 * Returns null bei Fehler/keine Route.
 */
export async function routeDistanceKm(
  coords: Array<[number, number]>,
  timeoutMs = 5000,
): Promise<number | null> {
  if (!Array.isArray(coords) || coords.length < 2) {
    logger.warn(`skip: <2 coords (got ${coords?.length ?? 0})`);
    return null;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const path = coords.map(([lng, lat]) => `${lng},${lat}`).join(';');
  const url = `${OSRM_URL}/${path}?overview=false`;
  logger.log(`request ${coords.length} coords`);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      logger.warn(`HTTP ${res.status} for ${coords.length} coords`);
      return null;
    }
    const j = (await res.json()) as {
      routes?: Array<{ distance?: number }>;
    };
    const meters = j?.routes?.[0]?.distance;
    if (typeof meters !== 'number' || !Number.isFinite(meters)) {
      logger.warn(`no route in response`);
      return null;
    }
    const km = meters / 1000;
    logger.log(`-> ${km.toFixed(2)} km`);
    return km;
  } catch (e: unknown) {
    const name = (e as { name?: string })?.name;
    const msg = e instanceof Error ? e.message : String(e);
    if (name === 'AbortError') {
      logger.warn(`timeout (${timeoutMs}ms)`);
    } else {
      logger.warn(`fetch error: ${msg}`);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** GeoJSON LineString — selbst-beschreibend, leaflet-kompatibel. */
export interface PolylineGeometry {
  type: 'LineString';
  coordinates: Array<[number, number]>;
}

export interface TripResult {
  distanceKm: number;
  /**
   * Permutation der Input-Indizes:
   * optimizedOrder[optPos] = originalIndex
   */
  optimizedOrder: number[];
  /** GeoJSON LineString der gesamten Route (full overview). */
  geometry: PolylineGeometry | null;
}

/**
 * OSRM Trip-API: Optimierte TSP-Route über alle Coords.
 * source=first + destination=last fixiert Anfang und Ende
 * (für Lager-Start/Ende-Szenario), sodass nur die Mitte
 * permutiert wird. roundtrip=false (Start≠Ende möglich).
 */
export async function routeTrip(
  coords: Array<[number, number]>,
  timeoutMs = 8000,
): Promise<TripResult | null> {
  if (!Array.isArray(coords) || coords.length < 2) {
    logger.warn(`trip skip: <2 coords (got ${coords?.length ?? 0})`);
    return null;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const path = coords.map(([lng, lat]) => `${lng},${lat}`).join(';');
  const url = `${OSRM_TRIP_URL}/${path}?source=first&destination=last&roundtrip=false&overview=full&geometries=geojson`;
  logger.log(`trip request ${coords.length} coords`);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      logger.warn(`trip HTTP ${res.status} for ${coords.length} coords`);
      return null;
    }
    const j = (await res.json()) as {
      trips?: Array<{
        distance?: number;
        geometry?: {
          type?: string;
          coordinates?: Array<[number, number]>;
        };
      }>;
      waypoints?: Array<{ waypoint_index?: number }>;
    };
    const trip = j?.trips?.[0];
    const waypoints = j?.waypoints;
    if (!trip || !Array.isArray(waypoints) || waypoints.length !== coords.length) {
      logger.warn(`trip response missing trips or waypoints`);
      return null;
    }
    const meters = trip.distance;
    if (typeof meters !== 'number' || !Number.isFinite(meters)) {
      logger.warn(`trip non-finite distance`);
      return null;
    }
    // Build optimizedOrder[optimized-pos] = original-input-idx
    const order: number[] = new Array(coords.length).fill(-1);
    for (let i = 0; i < waypoints.length; i++) {
      const wpi = waypoints[i].waypoint_index;
      if (typeof wpi === 'number' && wpi >= 0 && wpi < coords.length) {
        order[wpi] = i;
      }
    }
    if (order.includes(-1)) {
      logger.warn(`trip waypoint_index inconsistent`);
      return null;
    }
    const km = meters / 1000;
    const geomCoords = trip.geometry?.coordinates;
    const geometry: PolylineGeometry | null =
      Array.isArray(geomCoords) && geomCoords.length >= 2
        ? { type: 'LineString', coordinates: geomCoords }
        : null;
    logger.log(
      `trip -> ${km.toFixed(2)} km, order=${order.join(',')}, geom=${
        geometry?.coordinates.length ?? 0
      }pts`,
    );
    return { distanceKm: km, optimizedOrder: order, geometry };
  } catch (e: unknown) {
    const name = (e as { name?: string })?.name;
    const msg = e instanceof Error ? e.message : String(e);
    if (name === 'AbortError') {
      logger.warn(`trip timeout (${timeoutMs}ms)`);
    } else {
      logger.warn(`trip fetch error: ${msg}`);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
