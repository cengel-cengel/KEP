/**
 * OSRM Routing-Helper.
 * Public-Demo-Endpoint, Fair-Use ~1 req/s.
 */
import { Logger } from '@nestjs/common';

const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
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
