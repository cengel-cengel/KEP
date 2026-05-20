/**
 * W-2.1 FV-Scheduler-Wrapper.
 *
 * Reuse der NV-W-2-Lib (nv-touren/scheduler.lib): computeStopSchedule
 * operates on pure { lat, lng, stop_type, ...time-windows }. Wir bauen
 * die input-shape aus FV-shipments (delivery-Adresse) und schreiben
 * die output-felder auf shipments.{planned_arrival_fv, ...}.
 *
 * Aufruf-Schema:
 *   setImmediate(safeRecomputeFvSchedule(tourId))
 *     nach batchStopsFv / addShipmentToTour / removeShipmentFromTour
 *     / updateShipmentOrder
 *
 * Start-Anker (W-2.1 D-3):
 *   tour.departure_time → HH:MM
 *   sonst Fallback 06:00 am tour_date
 */
import {
  computeStopSchedule,
  type SchedulerStopInput,
  type SchedulerStopOutput,
} from '../nv-touren/scheduler.lib';

export interface FvShipmentInput {
  id: string;
  tour_position: number | null;
  loading_time_from?: Date | string | null;
  loading_time_to?: Date | string | null;
  delivery_time_from?: Date | string | null;
  delivery_time_to?: Date | string | null;
  delivery_address: { lat: number | null; lng: number | null } | null;
}

/**
 * Konvertiert Date|String → 'HH:MM' UTC-Komponenten.
 * Mirror nv-touren.service::timeToString.
 */
function timeToString(t: Date | string | null | undefined): string | null {
  if (!t) return null;
  if (typeof t === 'string') return t;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCHours().toString().padStart(2, '0')}:${d
    .getUTCMinutes()
    .toString()
    .padStart(2, '0')}`;
}

/**
 * tour.departure_time (Timestamptz) → 'HH:MM'.
 * Fallback null → caller-side '06:00'.
 */
export function deriveStartHHMM(departureTime: Date | null | undefined): string {
  if (!departureTime) return '06:00';
  const d = new Date(departureTime);
  if (Number.isNaN(d.getTime())) return '06:00';
  return `${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

export interface FvScheduleResult extends SchedulerStopOutput {
  /** shipment-id (= input.id). Alias für caller-clarity. */
  shipment_id: string;
}

/**
 * Compute FV-Schedule für eine Tour.
 *
 * @param args.tourDate    tour.tour_date (Date-only)
 * @param args.departureTime tour.departure_time | null
 * @param args.shipments   FV-shipments (Delivery-Adresse, tour_position)
 * @param args.startCoord  optional Hub-Start-Coord (lat/lng)
 * @param args.legDurationsSec optional precise-ETA per leg
 */
export function computeFvSchedule(args: {
  tourDate: Date;
  departureTime: Date | null;
  shipments: FvShipmentInput[];
  startCoord?: { lat: number; lng: number } | null;
  legDurationsSec?: number[];
}): FvScheduleResult[] {
  const startHHMM = deriveStartHHMM(args.departureTime);
  const stopsInput: SchedulerStopInput[] = args.shipments.map((s) => ({
    id: s.id,
    position: s.tour_position ?? 0,
    stop_type: 'DELIVERY',
    lat: s.delivery_address?.lat != null ? Number(s.delivery_address.lat) : null,
    lng: s.delivery_address?.lng != null ? Number(s.delivery_address.lng) : null,
    loading_time_from: timeToString(s.loading_time_from),
    loading_time_to: timeToString(s.loading_time_to),
    delivery_time_from: timeToString(s.delivery_time_from),
    delivery_time_to: timeToString(s.delivery_time_to),
  }));
  const sched = computeStopSchedule({
    datum: args.tourDate,
    startZeit: startHHMM,
    startCoord: args.startCoord ?? null,
    stops: stopsInput,
    legDurationsSec: args.legDurationsSec,
  });
  return sched.map((s) => ({ ...s, shipment_id: s.id }));
}
