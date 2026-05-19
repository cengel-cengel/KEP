import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  checkSlaViolations,
  type SlaCheckInput,
  type SlaResult,
} from '../../lib/sla';

/**
 * W-2 TourTimeline.
 *
 * Horizontale Zeitachse 06:00-22:00 (16h Standard).
 * Pro Stop: vertikaler Block (position: planned_arrival,
 * width: servicezeit_min). Color nach SLA-Severity.
 *
 * Pure CSS — keine Library, kein Canvas.
 *
 * Klick → onStopClick. Drag-Reorder nicht in W-2 (geht via
 * bestehende Stops-Liste in TourDetailsTab).
 */

const DAY_START_H = 6;
const DAY_END_H = 22;
const HEIGHT_PX = 80;

export interface TimelineStop {
  id: string;
  position: number;
  stop_type?: string | null;
  shipment_number?: string | null;
  servicezeit_min?: number | null;
  planned_arrival?: string | Date | null;
  planned_departure?: string | Date | null;
  loading_time_from?: string | null;
  loading_time_to?: string | null;
  delivery_time_from?: string | null;
  delivery_time_to?: string | null;
  /** T-3.1: BE-persisted risk_severity. Fallback auf SLA-lib
   * wenn null (Legacy-Touren ohne recompute). */
  risk_severity?: string | null;
}

function toDate(d?: string | Date | null): Date | null {
  if (!d) return null;
  return d instanceof Date ? d : new Date(d);
}

function pctOfDay(d: Date): number {
  const totalMin = (DAY_END_H - DAY_START_H) * 60;
  const startMin = DAY_START_H * 60;
  const minOfDay = d.getHours() * 60 + d.getMinutes();
  return Math.max(0, Math.min(100, ((minOfDay - startMin) / totalMin) * 100));
}

function severityColor(sev: SlaResult['severity']): {
  bg: string;
  border: string;
  text: string;
} {
  switch (sev) {
    case 'critical':
      return {
        bg: 'bg-red-100',
        border: 'border-red-400',
        text: 'text-red-800',
      };
    case 'warning':
      return {
        bg: 'bg-amber-100',
        border: 'border-amber-400',
        text: 'text-amber-800',
      };
    case 'ok':
      return {
        bg: 'bg-emerald-100',
        border: 'border-emerald-400',
        text: 'text-emerald-800',
      };
    case 'unknown':
    default:
      return {
        bg: 'bg-gray-100',
        border: 'border-gray-300',
        text: 'text-gray-700',
      };
  }
}

export default function TourTimeline({
  stops,
  onStopClick,
  selectedStopId,
}: {
  stops: TimelineStop[];
  onStopClick?: (stopId: string) => void;
  selectedStopId?: string | null;
}) {
  const sortedStops = useMemo(
    () => [...stops].sort((a, b) => a.position - b.position),
    [stops],
  );
  // T-3.1: bevorzuge BE-persisted risk_severity. Fallback
  // SLA-lib wenn null (Legacy-Touren).
  const slaResults = useMemo<Map<string, SlaResult>>(() => {
    const out = new Map<string, SlaResult>();
    for (const s of sortedStops) {
      if (s.risk_severity === 'ok' || s.risk_severity === 'warning' ||
          s.risk_severity === 'critical' || s.risk_severity === 'unknown') {
        out.set(s.id, {
          stopId: s.id,
          severity: s.risk_severity as SlaResult['severity'],
        });
      }
    }
    // Fallback für Stops ohne persisted-severity
    const missing = sortedStops.filter((s) => !out.has(s.id));
    if (missing.length > 0) {
      const inputs: SlaCheckInput[] = missing.map((s) => ({
        stopId: s.id,
        stopType: s.stop_type,
        planned_arrival: s.planned_arrival,
        loading_time_from: s.loading_time_from,
        loading_time_to: s.loading_time_to,
        delivery_time_from: s.delivery_time_from,
        delivery_time_to: s.delivery_time_to,
      }));
      for (const r of checkSlaViolations(inputs)) out.set(r.stopId, r);
    }
    return out;
  }, [sortedStops]);

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = DAY_START_H; h <= DAY_END_H; h += 2) arr.push(h);
    return arr;
  }, []);

  const nowPct = useMemo(() => {
    const now = new Date();
    const h = now.getHours() + now.getMinutes() / 60;
    if (h < DAY_START_H || h > DAY_END_H) return null;
    return ((h - DAY_START_H) / (DAY_END_H - DAY_START_H)) * 100;
  }, []);

  return (
    <div className="relative w-full bg-white border border-gray-200 rounded-md">
      {/* Hour-Ticks */}
      <div
        className="relative w-full border-b border-gray-100"
        style={{ height: 16 }}
      >
        {hours.map((h) => {
          const pct = ((h - DAY_START_H) / (DAY_END_H - DAY_START_H)) * 100;
          return (
            <div
              key={h}
              className="absolute top-0 text-[10px] text-gray-400 -translate-x-1/2"
              style={{ left: `${pct}%` }}
            >
              {h.toString().padStart(2, '0')}:00
            </div>
          );
        })}
      </div>

      {/* Track */}
      <div
        className="relative w-full bg-gradient-to-r from-slate-50 to-white"
        style={{ height: HEIGHT_PX }}
      >
        {/* Grid-Lines */}
        {hours.map((h) => {
          const pct = ((h - DAY_START_H) / (DAY_END_H - DAY_START_H)) * 100;
          return (
            <div
              key={`g-${h}`}
              className="absolute top-0 bottom-0 border-l border-gray-100"
              style={{ left: `${pct}%` }}
            />
          );
        })}

        {/* Now-Line */}
        {nowPct != null && (
          <div
            className="absolute top-0 bottom-0 w-px bg-red-500 z-10"
            style={{ left: `${nowPct}%` }}
            title="Jetzt"
          />
        )}

        {/* Stop-Blocks */}
        {sortedStops.map((s) => {
          const pa = toDate(s.planned_arrival);
          const pd = toDate(s.planned_departure);
          if (!pa) return null;
          const startPct = pctOfDay(pa);
          const endPct = pd ? pctOfDay(pd) : startPct + 1.5;
          const widthPct = Math.max(0.8, endPct - startPct);
          const sev = slaResults.get(s.id)?.severity ?? 'unknown';
          const col = severityColor(sev);
          const isSelected = selectedStopId === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onStopClick?.(s.id)}
              className={`absolute top-2 bottom-2 ${col.bg} ${col.border} border-2 rounded ${
                isSelected ? 'ring-2 ring-blue-500' : ''
              } hover:brightness-95 transition-all overflow-hidden text-left`}
              style={{
                left: `${startPct}%`,
                width: `${widthPct}%`,
                minWidth: '24px',
              }}
              title={`${s.shipment_number ?? s.id.slice(0, 6)} · ${pa.getHours()}:${pa
                .getMinutes()
                .toString()
                .padStart(2, '0')}`}
            >
              <div
                className={`px-1 text-[10px] font-mono ${col.text} truncate`}
              >
                {s.position}. {s.shipment_number ?? '—'}
              </div>
              <div className="px-1 text-[9px] text-gray-600 truncate">
                {pa.getHours().toString().padStart(2, '0')}:
                {pa.getMinutes().toString().padStart(2, '0')}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend / SLA-Badge */}
      <div className="flex items-center gap-3 px-2 py-1 text-[10px] text-gray-500 border-t border-gray-100">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 size={10} className="text-emerald-600" />
          OK
        </span>
        <span className="inline-flex items-center gap-1">
          <AlertTriangle size={10} className="text-amber-600" />
          Warnung
        </span>
        <span className="inline-flex items-center gap-1">
          <AlertTriangle size={10} className="text-red-600" />
          Kritisch
        </span>
        <span className="ml-auto">
          {Array.from(slaResults.values()).filter((r) => r.severity === 'critical')
            .length} kritisch ·{' '}
          {Array.from(slaResults.values()).filter((r) => r.severity === 'warning')
            .length} Warnung
        </span>
      </div>
    </div>
  );
}
