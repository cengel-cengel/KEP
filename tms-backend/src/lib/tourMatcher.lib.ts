/**
 * T-3.3 Tour-Matcher: findet die N besten Touren für eine Sendung.
 *
 * Score-Faktoren (gewichtet, total 100%):
 *   Geo-Proximity        40%  — Haversine shipment→tour-last-stop
 *   Capacity-Fit         25%  — bleibender LDM/Gewicht
 *   Time-Compatibility   25%  — shipment.loading_date == tour.datum
 *   Existing-Cluster     10%  — gleicher Kunde bereits in Tour
 *
 * Driver-Skills (z.B. hazmat→adr_license) ist BACKLOG bis
 * Migration 40 (nv_subunternehmer.has_adr_license).
 *
 * Geo via Haversine 40km/h (kein OSRM-Call pro Match-Anfrage).
 */

export interface MatchShipmentInput {
  id: string;
  ldm?: number | string | null;
  weight_kg?: number | string | null;
  loading_date?: Date | string | null;
  customer_id?: string | null;
  loading_lat?: number | null;
  loading_lng?: number | null;
}

export interface MatchTourCandidate {
  id: string;
  mode: 'nv' | 'fv';
  tour_number?: string | null;
  datum?: Date | string | null;
  status?: string | null;
  max_ldm?: number | string | null;
  max_weight_kg?: number | string | null;
  used_ldm?: number | string | null;
  used_weight_kg?: number | string | null;
  last_stop_lat?: number | null;
  last_stop_lng?: number | null;
  customer_ids?: string[];
}

export interface BestTourMatch {
  tour_id: string;
  mode: 'nv' | 'fv';
  tour_number?: string | null;
  score: number;
  factors: { name: string; value: number; weight: number }[];
  reason: string;
}

const W_GEO = 0.4;
const W_CAPACITY = 0.25;
const W_TIME = 0.25;
const W_CLUSTER = 0.1;

const EARTH_R_KM = 6371;

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.sqrt(sa));
}

function geoScore(km: number): number {
  // <10km → 95, <50km → 70, <150km → 40, sonst 10
  if (km < 10) return 95;
  if (km < 50) return 70;
  if (km < 150) return 40;
  return 10;
}

function capacityScore(
  ship: MatchShipmentInput,
  tour: MatchTourCandidate,
): number {
  const maxLdm = Number(tour.max_ldm ?? 0);
  const usedLdm = Number(tour.used_ldm ?? 0);
  const shipLdm = Number(ship.ldm ?? 0);
  if (maxLdm <= 0) return 50;
  const free = maxLdm - usedLdm;
  if (shipLdm > free) return 0; // passt nicht
  const fillRatio = (usedLdm + shipLdm) / maxLdm;
  // Optimal: 50-90% Fill → 90 Punkte. Unter 50% noch ok,
  // über 90% knapp.
  if (fillRatio < 0.3) return 50;
  if (fillRatio < 0.5) return 70;
  if (fillRatio < 0.9) return 90;
  if (fillRatio <= 1.0) return 70;
  return 0;
}

function timeScore(
  ship: MatchShipmentInput,
  tour: MatchTourCandidate,
): number {
  if (!ship.loading_date || !tour.datum) return 50;
  const sd = new Date(ship.loading_date);
  const td = new Date(tour.datum);
  if (!Number.isFinite(sd.getTime()) || !Number.isFinite(td.getTime())) {
    return 50;
  }
  const diffDays = Math.abs(sd.getTime() - td.getTime()) / 86_400_000;
  if (diffDays < 0.5) return 100;
  if (diffDays < 1.5) return 70;
  if (diffDays < 3) return 30;
  return 0;
}

function clusterScore(
  ship: MatchShipmentInput,
  tour: MatchTourCandidate,
): number {
  if (!ship.customer_id) return 0;
  if (!tour.customer_ids?.length) return 0;
  return tour.customer_ids.includes(ship.customer_id) ? 100 : 0;
}

function buildReason(
  km: number,
  factors: { name: string; value: number; weight: number }[],
): string {
  const parts: string[] = [];
  if (km < 50) parts.push(`+${km.toFixed(0)} km geo`);
  const cluster = factors.find((f) => f.name === 'Cluster');
  if (cluster && cluster.value > 0) parts.push('gleicher Kunde');
  const cap = factors.find((f) => f.name === 'Capacity-Fit');
  if (cap && cap.value >= 70) parts.push('passende Kapazität');
  const time = factors.find((f) => f.name === 'Time');
  if (time && time.value >= 70) parts.push('selbes Datum');
  return parts.length > 0 ? parts.join(' · ') : 'Mittel-Match';
}

export function findBestToursForShipment(
  shipment: MatchShipmentInput,
  candidates: MatchTourCandidate[],
  topN = 3,
): BestTourMatch[] {
  const out: BestTourMatch[] = [];
  for (const t of candidates) {
    let km = 9999;
    if (
      shipment.loading_lat != null &&
      shipment.loading_lng != null &&
      t.last_stop_lat != null &&
      t.last_stop_lng != null
    ) {
      km = haversineKm(
        { lat: shipment.loading_lat, lng: shipment.loading_lng },
        { lat: t.last_stop_lat, lng: t.last_stop_lng },
      );
    }
    const geo = geoScore(km);
    const cap = capacityScore(shipment, t);
    const time = timeScore(shipment, t);
    const cluster = clusterScore(shipment, t);
    const factors = [
      { name: 'Geo', value: geo, weight: W_GEO },
      { name: 'Capacity-Fit', value: cap, weight: W_CAPACITY },
      { name: 'Time', value: time, weight: W_TIME },
      { name: 'Cluster', value: cluster, weight: W_CLUSTER },
    ];
    const score = Math.round(
      geo * W_GEO + cap * W_CAPACITY + time * W_TIME + cluster * W_CLUSTER,
    );
    if (cap === 0) continue; // capacity-incompatible Touren skippen
    out.push({
      tour_id: t.id,
      mode: t.mode,
      tour_number: t.tour_number,
      score,
      factors,
      reason: buildReason(km, factors),
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, topN);
}

// ─── T-3.3.1 OSRM-PRECISE MATCHER ──────────────────────────────

/**
 * T-3.3.1: Precise-Variant nutzt OSRM-Route-Distanz statt Haversine.
 *
 * - Per-Candidate-OSRM-Aufruf (shipment-loading → tour-last-stop).
 * - In-Memory-LRU-Cache (Map<shipKey|tourKey, {km, ts}>) mit TTL 5min.
 * - Promise.allSettled (parallel) — N candidates → max(N)-Latenz.
 * - Timeout 2s pro Call, Fallback Haversine bei OSRM-Fail/Timeout.
 * - Caller-Pflicht: routeDistanceFn als Dependency injection
 *   (testability).
 */

const PRECISE_CACHE = new Map<string, { km: number; ts: number }>();
const PRECISE_TTL_MS = 5 * 60_000;
const PRECISE_TIMEOUT_MS = 2000;

function cacheKey(
  shipLat: number,
  shipLng: number,
  tourLat: number,
  tourLng: number,
): string {
  // 4 Nachkommastellen ≈ 11m Präzision — genug für City-Granularität.
  return `${shipLat.toFixed(4)},${shipLng.toFixed(4)}|${tourLat.toFixed(4)},${tourLng.toFixed(4)}`;
}

export function _clearPreciseCacheForTests(): void {
  PRECISE_CACHE.clear();
}

export type RouteDistanceFn = (
  coords: Array<[number, number]>,
  timeoutMs?: number,
) => Promise<number | null>;

export async function findBestToursForShipmentPrecise(
  shipment: MatchShipmentInput,
  candidates: MatchTourCandidate[],
  routeDistanceFn: RouteDistanceFn,
  topN = 3,
): Promise<BestTourMatch[]> {
  // Pre-pass: compute km via OSRM mit cache+fallback, parallel.
  const kmPromises = candidates.map(async (t): Promise<number> => {
    const sLat = shipment.loading_lat;
    const sLng = shipment.loading_lng;
    const tLat = t.last_stop_lat;
    const tLng = t.last_stop_lng;
    if (sLat == null || sLng == null || tLat == null || tLng == null) {
      return 9999;
    }
    const key = cacheKey(sLat, sLng, tLat, tLng);
    const cached = PRECISE_CACHE.get(key);
    if (cached && Date.now() - cached.ts < PRECISE_TTL_MS) {
      return cached.km;
    }
    try {
      const km = await routeDistanceFn(
        [
          [sLng, sLat],
          [tLng, tLat],
        ],
        PRECISE_TIMEOUT_MS,
      );
      if (km != null && Number.isFinite(km)) {
        PRECISE_CACHE.set(key, { km, ts: Date.now() });
        return km;
      }
    } catch {
      /* fall through */
    }
    // Fallback Haversine.
    return haversineKm({ lat: sLat, lng: sLng }, { lat: tLat, lng: tLng });
  });
  const settled = await Promise.allSettled(kmPromises);
  const kms = settled.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    // Hard-Fallback (sollte nicht passieren — kmPromises swallowed).
    const sLat = shipment.loading_lat;
    const sLng = shipment.loading_lng;
    const tLat = candidates[i].last_stop_lat;
    const tLng = candidates[i].last_stop_lng;
    if (sLat != null && sLng != null && tLat != null && tLng != null) {
      return haversineKm({ lat: sLat, lng: sLng }, { lat: tLat, lng: tLng });
    }
    return 9999;
  });

  // Re-use Sync-Score-Pipeline mit pre-computed km.
  const out: BestTourMatch[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const t = candidates[i];
    const km = kms[i];
    const geo = geoScore(km);
    const cap = capacityScore(shipment, t);
    const time = timeScore(shipment, t);
    const cluster = clusterScore(shipment, t);
    const factors = [
      { name: 'Geo', value: geo, weight: W_GEO },
      { name: 'Capacity-Fit', value: cap, weight: W_CAPACITY },
      { name: 'Time', value: time, weight: W_TIME },
      { name: 'Cluster', value: cluster, weight: W_CLUSTER },
    ];
    const score = Math.round(
      geo * W_GEO + cap * W_CAPACITY + time * W_TIME + cluster * W_CLUSTER,
    );
    if (cap === 0) continue;
    out.push({
      tour_id: t.id,
      mode: t.mode,
      tour_number: t.tour_number,
      score,
      factors,
      reason: buildReason(km, factors),
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, topN);
}
