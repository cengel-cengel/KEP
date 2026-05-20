/**
 * Nominatim Geocoding-Helper.
 * Public-Demo-Endpoint, Fair-Use ~1 req/s.
 *
 * Throttle: module-level Mutex (lastRequestAt) erzwingt 1100ms
 * Mindestabstand zwischen Calls — gilt für ALLE Konsumenten
 * (admin-backfill + nv-tour-geocode + warehouses).
 */
import { Logger } from '@nestjs/common';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const logger = new Logger('NominatimLib');

/** OSM Fair-Use-Policy: max 1 req/sec. Wir lassen 1.1s Sicherheits-
 * marge — gilt module-global für alle nominatimGeocode-Aufrufer. */
const THROTTLE_MIN_MS = 1100;
let lastRequestAt = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = lastRequestAt + THROTTLE_MIN_MS - now;
  if (wait > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, wait));
  }
  lastRequestAt = Date.now();
}

export interface GeoCoord {
  lat: number;
  lng: number;
}

export async function nominatimGeocode(
  query: string,
  timeoutMs = 5000,
): Promise<GeoCoord | null> {
  if (!query || query.trim().length < 3) {
    logger.warn(`skip: query too short ("${query}")`);
    return null;
  }
  await throttle();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1`;
  logger.log(`request "${query}"`);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'tms-deploy-ready/1.0 (kontakt@ked-logistik.de)',
        Accept: 'application/json',
      },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      logger.warn(`HTTP ${res.status} for "${query}"`);
      return null;
    }
    const arr = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    if (!Array.isArray(arr) || arr.length === 0) {
      logger.warn(`no result for "${query}"`);
      return null;
    }
    const first = arr[0];
    if (!first?.lat || !first?.lon) {
      logger.warn(`incomplete result for "${query}"`);
      return null;
    }
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      logger.warn(
        `non-finite coords for "${query}": ${first.lat},${first.lon}`,
      );
      return null;
    }
    logger.log(`-> ${lat},${lng}`);
    return { lat, lng };
  } catch (e: unknown) {
    const name = (e as { name?: string })?.name;
    const msg = e instanceof Error ? e.message : String(e);
    if (name === 'AbortError') {
      logger.warn(`timeout (${timeoutMs}ms) for "${query}"`);
    } else {
      logger.warn(`fetch error for "${query}": ${msg}`);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function buildAddressQuery(parts: {
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
}): string {
  return [parts.street, parts.zip, parts.city, parts.country]
    .filter(Boolean)
    .join(', ');
}
