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

import { haversineKm } from '../lib/geo.lib';

const DEFAULT_START_HHMM = '08:00';
const DEFAULT_SERVICEZEIT_MIN = 30;
const AVG_SPEED_KMH = 40;

export interface SchedulerStopInput {
  id: string;
  position: number;
  servicezeit_min?: number | null;
  /** Lat/Lng des Stop-Pin-Address. Null wenn Geo fehlt. */
  lat?: number | null;
  lng?: number | null;
  /** T-3.1: SLA-Inputs für Risk-Berechnung. */
  stop_type?: string | null;
  loading_time_from?: string | null;
  loading_time_to?: string | null;
  delivery_time_from?: string | null;
  delivery_time_to?: string | null;
}

export interface SchedulerStopOutput {
  id: string;
  planned_arrival: Date;
  planned_departure: Date;
  risk_score: number;
  risk_severity: 'ok' | 'warning' | 'critical' | 'unknown';
}

export type RiskSeverity = 'ok' | 'warning' | 'critical' | 'unknown';

// C2: haversineKm aus ../lib/geo.lib importiert (war hier dupliziert).

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

/**
 * T-3.1: Risk-Computation pro Stop.
 *
 * Score-Skala:
 *   0   : in SLA-window + >30min Buffer
 *   30  : in window + <15min Buffer (Knapp)
 *   70  : >15min vor Window (warning, zu früh)
 *   90  : nach Window-Ende (critical, zu spät)
 *   unknown: kein Window oder kein planned_arrival
 */
const RISK_BUFFER_OK_MIN = 30;
const RISK_BUFFER_TIGHT_MIN = 15;
const RISK_EARLY_TOLERANCE_MIN = 15;

function parseTimeHHMM(raw?: string | null): { h: number; m: number } | null {
  if (!raw) return null;
  const m = String(raw).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return { h, m: mm };
}

function timeOnDate(base: Date, hhmm: { h: number; m: number }): Date {
  const d = new Date(base);
  d.setHours(hhmm.h, hhmm.m, 0, 0);
  return d;
}

export function computeRiskForStop(
  plannedArrival: Date,
  stopType: string | null | undefined,
  windows: {
    loading_time_from?: string | null;
    loading_time_to?: string | null;
    delivery_time_from?: string | null;
    delivery_time_to?: string | null;
  },
): { score: number; severity: RiskSeverity } {
  const isDelivery = stopType === 'DELIVERY';
  const fromRaw = isDelivery ? windows.delivery_time_from : windows.loading_time_from;
  const toRaw = isDelivery ? windows.delivery_time_to : windows.loading_time_to;
  const fromHHMM = parseTimeHHMM(fromRaw);
  const toHHMM = parseTimeHHMM(toRaw);
  if (!fromHHMM && !toHHMM) {
    return { score: 0, severity: 'unknown' };
  }
  const from = fromHHMM ? timeOnDate(plannedArrival, fromHHMM) : null;
  const to = toHHMM ? timeOnDate(plannedArrival, toHHMM) : null;
  const paMs = plannedArrival.getTime();
  // Nach Window-Ende
  if (to && paMs > to.getTime()) {
    return { score: 90, severity: 'critical' };
  }
  // Vor Window-Start (>15min)
  if (from && paMs + RISK_EARLY_TOLERANCE_MIN * 60_000 < from.getTime()) {
    return { score: 70, severity: 'warning' };
  }
  // Innerhalb Window — Buffer prüfen
  if (to) {
    const bufferMin = (to.getTime() - paMs) / 60_000;
    if (bufferMin < RISK_BUFFER_TIGHT_MIN) {
      return { score: 30, severity: 'warning' };
    }
    if (bufferMin < RISK_BUFFER_OK_MIN) {
      return { score: 15, severity: 'ok' };
    }
  }
  return { score: 0, severity: 'ok' };
}

export function computeStopSchedule(args: {
  datum: Date;
  startZeit?: string | null;
  stops: SchedulerStopInput[];
  /** Start-Coord (z.B. Default-Warehouse). Optional. */
  startCoord?: { lat: number; lng: number } | null;
  /**
   * T-3.1: Precise-ETA. Wenn vorhanden: legDurationsSec[i]
   * = Travel-Time von prev (oder startCoord) zu stop[i] in sec.
   * length === stops.length erwartet.
   * Sonst Fallback Haversine 40km/h.
   */
  legDurationsSec?: number[];
}): SchedulerStopOutput[] {
  const startHHMM = parseHHMM(args.startZeit) ?? parseHHMM(DEFAULT_START_HHMM)!;
  let cursor = combineDate(args.datum, startHHMM);
  const sorted = [...args.stops].sort((a, b) => a.position - b.position);
  const out: SchedulerStopOutput[] = [];
  let prevCoord = args.startCoord ?? null;
  const usePrecise =
    Array.isArray(args.legDurationsSec) &&
    args.legDurationsSec.length === sorted.length;
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const curCoord =
      s.lat != null && s.lng != null
        ? { lat: Number(s.lat), lng: Number(s.lng) }
        : null;
    let travelMin: number;
    if (usePrecise) {
      travelMin = Math.max(
        0,
        Math.round((args.legDurationsSec![i] ?? 0) / 60),
      );
    } else if (prevCoord === null) {
      travelMin = 0;
    } else if (curCoord) {
      const km = haversineKm(prevCoord, curCoord);
      travelMin = Math.max(1, Math.round((km / AVG_SPEED_KMH) * 60));
    } else {
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
    const risk = computeRiskForStop(planned_arrival, s.stop_type, {
      loading_time_from: s.loading_time_from,
      loading_time_to: s.loading_time_to,
      delivery_time_from: s.delivery_time_from,
      delivery_time_to: s.delivery_time_to,
    });
    out.push({
      id: s.id,
      planned_arrival,
      planned_departure,
      risk_score: risk.score,
      risk_severity: risk.severity,
    });
    if (curCoord) prevCoord = curCoord;
  }
  return out;
}
