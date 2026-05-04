/**
 * Nominatim Geocoding-Helper.
 * Public-Demo-Endpoint, Fair-Use ~1 req/s.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

export interface GeoCoord {
  lat: number;
  lng: number;
}

export async function nominatimGeocode(
  query: string,
  timeoutMs = 5000,
): Promise<GeoCoord | null> {
  if (!query || query.trim().length < 3) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'tms-deploy-ready/1.0 (kontakt@ked-logistik.de)',
        Accept: 'application/json',
      },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const first = arr[0];
    if (!first?.lat || !first?.lon) return null;
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
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
