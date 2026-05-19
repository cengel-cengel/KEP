/**
 * W-2 Scheduler: ETA-Computation für NV-Stops.
 *
 * Verfahren (Quick-Win):
 *   1. Start = tour.datum + tour.start_zeit (default 08:00)
 *   2. Pro Stop (sortiert nach position):
 *        travel_min = haversine(prev, current) / 40km/h
 *        cursor += travel_min
 *        planned_arrival = cursor
 *        cursor += servicezeit_min (default 30)
 *        planned_departure = cursor
 *
 * Travel-Schätzung via Haversine — NICHT OSRM (Backlog W-2.2:
 * precise-eta mit OSRM ?annotations=duration).
 *
 * Aufruf: setImmediate(safeRecomputeSchedule(tourId))
 *   - nach reorderStops, batchStops, createStop, removeStop
 */

const DEFAULT_START_HHMM = '08:00';
const DEFAULT_SERVICEZEIT_MIN = 30;
const AVG_SPEED_KMH = 40;
const EARTH_R_KM = 6371;

export interface SchedulerStopInput {
  id: string;
  position: number;
  servicezeit_min?: number | null;
  /** Lat/Lng des Stop-Pin-Address. Null wenn Geo fehlt. */
  lat?: number | null;
  lng?: number | null;
}

export interface SchedulerStopOutput {
  id: string;
  planned_arrival: Date;
  planned_departure: Date;
}

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

/** parse 'HH:MM' to {h, m}. Null bei invalid. */
function parseHHMM(raw?: string | null): { h: number; m: number } | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return { h, m: mm };
}

function combineDate(datum: Date, hhmm: { h: number; m: number }): Date {
  const d = new Date(datum);
  d.setHours(hhmm.h, hhmm.m, 0, 0);
  return d;
}

export function computeStopSchedule(args: {
  datum: Date;
  startZeit?: string | null;
  stops: SchedulerStopInput[];
  /** Start-Coord (z.B. Default-Warehouse). Optional. */
  startCoord?: { lat: number; lng: number } | null;
}): SchedulerStopOutput[] {
  const startHHMM = parseHHMM(args.startZeit) ?? parseHHMM(DEFAULT_START_HHMM)!;
  let cursor = combineDate(args.datum, startHHMM);
  const sorted = [...args.stops].sort((a, b) => a.position - b.position);
  const out: SchedulerStopOutput[] = [];
  let prevCoord = args.startCoord ?? null;
  for (const s of sorted) {
    const curCoord =
      s.lat != null && s.lng != null
        ? { lat: Number(s.lat), lng: Number(s.lng) }
        : null;
    let travelMin: number;
    if (prevCoord === null) {
      // Start (kein vorheriger Bezug) → kein Travel.
      travelMin = 0;
    } else if (curCoord) {
      const km = haversineKm(prevCoord, curCoord);
      travelMin = Math.max(1, Math.round((km / AVG_SPEED_KMH) * 60));
    } else {
      // mid-stop ohne Coord: 20min default-hop
      travelMin = 20;
    }
    cursor = new Date(cursor.getTime() + travelMin * 60_000);
    const planned_arrival = new Date(cursor);
    const service = Math.max(
      0,
      Number(s.servicezeit_min ?? DEFAULT_SERVICEZEIT_MIN),
    );
    cursor = new Date(cursor.getTime() + service * 60_000);
    const planned_departure = new Date(cursor);
    out.push({ id: s.id, planned_arrival, planned_departure });
    if (curCoord) prevCoord = curCoord;
  }
  return out;
}
