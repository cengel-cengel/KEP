/**
 * W-2: SLA-Violation-Detection für NV-Stops.
 *
 * Vergleicht planned_arrival gegen shipment loading_time_from/to
 * (PICKUP) bzw. delivery_time_from/to (DELIVERY).
 *
 * Severity:
 *   critical → planned_arrival > zeitfenster_bis (zu spät)
 *   warning  → planned_arrival < zeitfenster_von - 15min (zu früh)
 *   ok       → innerhalb fenster
 *   unknown  → kein zeitfenster oder kein planned_arrival
 */

export type SlaSeverity = 'critical' | 'warning' | 'ok' | 'unknown';

export interface SlaCheckInput {
  stopId: string;
  stopType?: string | null;
  planned_arrival?: Date | string | null;
  loading_time_from?: string | null;
  loading_time_to?: string | null;
  delivery_time_from?: string | null;
  delivery_time_to?: string | null;
}

export interface SlaResult {
  stopId: string;
  severity: SlaSeverity;
  msg?: string;
}

const TOLERANCE_EARLY_MIN = 15;

function parseTimeOnDate(
  baseDate: Date,
  hhmm?: string | null,
): Date | null {
  if (!hhmm) return null;
  // Format kann '08:00' oder '08:00:00.000Z' oder Date-ISO sein
  const m = String(hhmm).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(baseDate);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

export function checkSlaForStop(s: SlaCheckInput): SlaResult {
  if (!s.planned_arrival) {
    return { stopId: s.stopId, severity: 'unknown' };
  }
  const pa =
    s.planned_arrival instanceof Date
      ? s.planned_arrival
      : new Date(s.planned_arrival);
  const isDelivery = s.stopType === 'DELIVERY';
  const fromHHMM = isDelivery ? s.delivery_time_from : s.loading_time_from;
  const toHHMM = isDelivery ? s.delivery_time_to : s.loading_time_to;
  const from = parseTimeOnDate(pa, fromHHMM);
  const to = parseTimeOnDate(pa, toHHMM);
  if (!from && !to) {
    return { stopId: s.stopId, severity: 'unknown' };
  }
  if (to && pa.getTime() > to.getTime()) {
    return {
      stopId: s.stopId,
      severity: 'critical',
      msg: `Zu spät (Fenster bis ${toHHMM})`,
    };
  }
  if (from && pa.getTime() + TOLERANCE_EARLY_MIN * 60_000 < from.getTime()) {
    return {
      stopId: s.stopId,
      severity: 'warning',
      msg: `Zu früh (Fenster ab ${fromHHMM})`,
    };
  }
  return { stopId: s.stopId, severity: 'ok' };
}

export function checkSlaViolations(stops: SlaCheckInput[]): SlaResult[] {
  return stops.map(checkSlaForStop);
}
