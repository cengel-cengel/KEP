/**
 * T-3.2 Conflict-Detection.
 *
 * Detektiert 3 Konflikt-Typen pro NV-Tour:
 *   TIME_OVERLAP        — gleicher Sub, 2 Touren am selben
 *                         Tag, planned-Intervalle überlappen
 *   WORKLOAD_EXCEEDED   — Sub-Gesamt-Arbeitszeit am Tag > 8h
 *                         (warning) / > 9h (critical)
 *   OVERLOAD_RISK       — capacity-Overload UND mind. 1 Stop
 *                         critical (kombinierter Risk)
 *   HAZMAT_DRIVER       — Tour enthält Hazmat-Sendung(en) und
 *                         Subunternehmer hat keine ADR-Lizenz
 *                         (T-3.2.1, has_adr_license auf
 *                         subcontractors existiert bereits).
 */

export type ConflictType =
  | 'TIME_OVERLAP'
  | 'WORKLOAD_EXCEEDED'
  | 'OVERLOAD_RISK'
  | 'HAZMAT_DRIVER';

export type ConflictSeverity = 'warning' | 'critical';

export interface SuggestedAction {
  type:
    | 'SHIFT_STOP_LATER'
    | 'SPLIT_TOUR_AT_STOP'
    | 'SWAP_DRIVER'
    | 'MOVE_STOP_TO_TOUR';
  /** Optionaler Hint für UI (z.B. stop_id). */
  stop_id?: string;
}

export interface Conflict {
  type: ConflictType;
  severity: ConflictSeverity;
  msg: string;
  affected_stop_ids?: string[];
  suggested_actions: SuggestedAction[];
}

export interface DetectInputTour {
  id: string;
  datum: Date;
  subunternehmer_id?: string | null;
  /** T-3.2.1: Sub-ADR-Lizenz für HAZMAT_DRIVER-Konflikt. */
  sub_has_adr_license?: boolean | null;
  overload?: { isOverloaded: boolean } | null;
  stops: Array<{
    id: string;
    risk_severity?: string | null;
    /** T-3.2.1: shipment.is_hazmat propagiert für Detector. */
    is_hazmat?: boolean | null;
    planned_arrival?: Date | null;
    planned_departure?: Date | null;
    loading_time_from?: Date | null;
    loading_time_to?: Date | null;
    delivery_time_from?: Date | null;
    delivery_time_to?: Date | null;
    stop_type?: string | null;
  }>;
}

const WORKLOAD_WARNING_MIN = 8 * 60;
const WORKLOAD_CRITICAL_MIN = 9 * 60;
const OVERLAP_CRITICAL_MIN = 30;

function tourSpan(tour: DetectInputTour): { start: Date; end: Date } | null {
  let start: Date | null = null;
  let end: Date | null = null;
  for (const s of tour.stops) {
    if (s.planned_arrival && (!start || s.planned_arrival < start)) {
      start = s.planned_arrival;
    }
    if (s.planned_departure && (!end || s.planned_departure > end)) {
      end = s.planned_departure;
    }
  }
  if (!start || !end) return null;
  return { start, end };
}

function overlapMinutes(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date },
): number {
  const start = Math.max(a.start.getTime(), b.start.getTime());
  const end = Math.min(a.end.getTime(), b.end.getTime());
  if (end <= start) return 0;
  return Math.round((end - start) / 60_000);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function isOverlapDuringLoadingWindow(
  tour: DetectInputTour,
  overlapStart: Date,
): boolean {
  for (const s of tour.stops) {
    const from = s.stop_type === 'DELIVERY' ? s.delivery_time_from : s.loading_time_from;
    const to = s.stop_type === 'DELIVERY' ? s.delivery_time_to : s.loading_time_to;
    if (!from || !to) continue;
    if (overlapStart >= from && overlapStart <= to) return true;
  }
  return false;
}

/**
 * Hauptfunktion: detektiert alle 3 Conflict-Types für eine Tour.
 * allTours: andere Touren am selben Datum + gleichen sub (zum
 * Überlappen-Check). Für tour-list kann Caller alle übergeben.
 */
export function detectConflictsForTour(
  tour: DetectInputTour,
  allTours: DetectInputTour[],
): Conflict[] {
  const conflicts: Conflict[] = [];

  // 0. HAZMAT_DRIVER (T-3.2.1)
  //    Wenn mind. 1 Stop is_hazmat=true und Sub keine ADR-Lizenz →
  //    critical Conflict mit SWAP_DRIVER als primary action.
  if (tour.subunternehmer_id && tour.sub_has_adr_license === false) {
    const hazmatStops = tour.stops.filter((s) => s.is_hazmat === true);
    if (hazmatStops.length > 0) {
      conflicts.push({
        type: 'HAZMAT_DRIVER',
        severity: 'critical',
        msg: `${hazmatStops.length} Hazmat-Sendung(en), Sub hat keine ADR-Lizenz — Fahrer wechseln.`,
        affected_stop_ids: hazmatStops.map((s) => s.id),
        suggested_actions: [
          { type: 'SWAP_DRIVER' },
          { type: 'MOVE_STOP_TO_TOUR', stop_id: hazmatStops[0]?.id },
        ],
      });
    }
  }

  // 1. OVERLOAD_RISK
  if (tour.overload?.isOverloaded) {
    const criticalStops = tour.stops.filter((s) => s.risk_severity === 'critical');
    if (criticalStops.length > 0) {
      conflicts.push({
        type: 'OVERLOAD_RISK',
        severity: 'critical',
        msg: `Tour überladen UND ${criticalStops.length} Stop(s) zu spät — split empfohlen.`,
        affected_stop_ids: criticalStops.map((s) => s.id),
        suggested_actions: [
          { type: 'SPLIT_TOUR_AT_STOP', stop_id: criticalStops[0]?.id },
          { type: 'MOVE_STOP_TO_TOUR', stop_id: criticalStops[0]?.id },
        ],
      });
    }
  }

  // 2. TIME_OVERLAP — same sub, same day
  if (tour.subunternehmer_id) {
    const mySpan = tourSpan(tour);
    if (mySpan) {
      for (const other of allTours) {
        if (other.id === tour.id) continue;
        if (other.subunternehmer_id !== tour.subunternehmer_id) continue;
        if (!sameDay(other.datum, tour.datum)) continue;
        const oSpan = tourSpan(other);
        if (!oSpan) continue;
        const overlap = overlapMinutes(mySpan, oSpan);
        if (overlap <= 0) continue;
        const overlapStart = new Date(
          Math.max(mySpan.start.getTime(), oSpan.start.getTime()),
        );
        const duringLoading =
          isOverlapDuringLoadingWindow(tour, overlapStart) ||
          isOverlapDuringLoadingWindow(other, overlapStart);
        const sev: ConflictSeverity =
          overlap > OVERLAP_CRITICAL_MIN || duringLoading
            ? 'critical'
            : 'warning';
        conflicts.push({
          type: 'TIME_OVERLAP',
          severity: sev,
          msg: `${overlap} min Überlappung mit Tour ${other.id.slice(0, 8)}…`,
          suggested_actions: [
            { type: 'SHIFT_STOP_LATER' },
            { type: 'SWAP_DRIVER' },
          ],
        });
        // 1 overlap-conflict pro other-Tour reicht
      }
    }
  }

  // 3. WORKLOAD_EXCEEDED — sum span all tours of same sub same day
  if (tour.subunternehmer_id) {
    let totalMin = 0;
    for (const t of allTours) {
      if (t.subunternehmer_id !== tour.subunternehmer_id) continue;
      if (!sameDay(t.datum, tour.datum)) continue;
      const s = tourSpan(t);
      if (!s) continue;
      totalMin += Math.round((s.end.getTime() - s.start.getTime()) / 60_000);
    }
    if (totalMin > WORKLOAD_CRITICAL_MIN) {
      conflicts.push({
        type: 'WORKLOAD_EXCEEDED',
        severity: 'critical',
        msg: `${Math.round(totalMin / 60 * 10) / 10}h Gesamt-Lenkzeit (gesetzliches Max 9h).`,
        suggested_actions: [
          { type: 'SWAP_DRIVER' },
          { type: 'SPLIT_TOUR_AT_STOP' },
        ],
      });
    } else if (totalMin > WORKLOAD_WARNING_MIN) {
      conflicts.push({
        type: 'WORKLOAD_EXCEEDED',
        severity: 'warning',
        msg: `${Math.round(totalMin / 60 * 10) / 10}h Gesamt-Arbeitszeit (Puffer-Schwelle 8h).`,
        suggested_actions: [{ type: 'SWAP_DRIVER' }],
      });
    }
  }

  return conflicts;
}
