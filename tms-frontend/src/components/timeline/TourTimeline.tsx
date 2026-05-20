/**
 * S-4 Timeline-Fokus-Modi.
 *
 * Adaptive Zoom: t_min = earliest planned_arrival - 30min,
 *                t_max = latest planned_departure + 30min.
 *                Fallback 06:00-22:00 wenn keine planned_*-Zeiten.
 *
 * Single-Color Block: severity-tinted bg + border via S-1
 * SEVERITY_TOKENS (statt 4-color-Suppe).
 *
 * SLA-Window: hairline outline rechts vom Block (statt bg-fill).
 *
 * Travel-Segment: zwischen Stop[i].pd und Stop[i+1].pa als
 * 4px-Linie + Duration-Text inline.
 *
 * Now-Line: dashed schwarz mit "JETZT"-Label (statt solid red).
 *
 * Critical-Mode: auto-on wenn ≥1 critical → ok-Stops opacity-30
 * + Toggle "Alle zeigen".
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Focus, Eye } from 'lucide-react';
import {
  checkSlaViolations,
  type SlaCheckInput,
  type SlaResult,
} from '../../lib/sla';

const DEFAULT_START_H = 6;
const DEFAULT_END_H = 22;
const HEIGHT_PX = 80;
const ADAPTIVE_PADDING_MIN = 30;

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
  /** T-3.1: BE-persisted risk_severity. */
  risk_severity?: string | null;
}

function toDate(d?: string | Date | null): Date | null {
  if (!d) return null;
  return d instanceof Date ? d : new Date(d);
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Severity-Mapping SLA ('ok'|'warning'|'critical') → S-1 Token-Classes. */
function severityClasses(sev: SlaResult['severity']): {
  bg: string;
  border: string;
  text: string;
} {
  switch (sev) {
    case 'critical':
      return {
        bg: 'bg-red-50',
        border: 'border-red-400',
        text: 'text-red-700',
      };
    case 'warning':
      return {
        bg: 'bg-amber-50',
        border: 'border-amber-400',
        text: 'text-amber-700',
      };
    case 'ok':
    case 'unknown':
    default:
      return {
        bg: 'bg-white',
        border: 'border-gray-300',
        text: 'text-gray-700',
      };
  }
}

/** Adaptiver Zoom-Range: earliest pa - 30min ... latest pd + 30min. */
function computeRange(stops: TimelineStop[]): {
  startMin: number;
  endMin: number;
  adaptive: boolean;
} {
  let minTime: number | null = null;
  let maxTime: number | null = null;
  for (const s of stops) {
    const pa = toDate(s.planned_arrival);
    const pd = toDate(s.planned_departure);
    if (pa) {
      const m = minutesOfDay(pa);
      if (minTime == null || m < minTime) minTime = m;
    }
    if (pd) {
      const m = minutesOfDay(pd);
      if (maxTime == null || m > maxTime) maxTime = m;
    }
  }
  if (minTime == null || maxTime == null) {
    return {
      startMin: DEFAULT_START_H * 60,
      endMin: DEFAULT_END_H * 60,
      adaptive: false,
    };
  }
  return {
    startMin: Math.max(0, minTime - ADAPTIVE_PADDING_MIN),
    endMin: Math.min(24 * 60, maxTime + ADAPTIVE_PADDING_MIN),
    adaptive: true,
  };
}

function pctOfRange(d: Date, startMin: number, endMin: number): number {
  const total = endMin - startMin;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, ((minutesOfDay(d) - startMin) / total) * 100));
}

function timeStrFromMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function fmtTime(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

function durationMin(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
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

  // SLA-Severity (BE-persisted bevorzugt, Fallback SLA-lib).
  const slaResults = useMemo<Map<string, SlaResult>>(() => {
    const out = new Map<string, SlaResult>();
    for (const s of sortedStops) {
      if (
        s.risk_severity === 'ok' ||
        s.risk_severity === 'warning' ||
        s.risk_severity === 'critical' ||
        s.risk_severity === 'unknown'
      ) {
        out.set(s.id, {
          stopId: s.id,
          severity: s.risk_severity as SlaResult['severity'],
        });
      }
    }
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

  const range = useMemo(() => computeRange(sortedStops), [sortedStops]);

  const criticalCount = useMemo(
    () =>
      Array.from(slaResults.values()).filter((r) => r.severity === 'critical')
        .length,
    [slaResults],
  );
  const warningCount = useMemo(
    () =>
      Array.from(slaResults.values()).filter((r) => r.severity === 'warning')
        .length,
    [slaResults],
  );

  // Critical-Mode: auto-on wenn ≥1 critical, User kann toggle.
  const [focusedManual, setFocusedManual] = useState<boolean | null>(null);
  const focused = focusedManual ?? criticalCount > 0;

  // Hour-Ticks dynamisch nach Range (alle 2h gerundet).
  const hourTicks = useMemo(() => {
    const arr: number[] = [];
    const startH = Math.floor(range.startMin / 60);
    const endH = Math.ceil(range.endMin / 60);
    const step = endH - startH > 12 ? 2 : endH - startH > 6 ? 1 : 1;
    for (let h = startH; h <= endH; h += step) {
      arr.push(h * 60);
    }
    return arr;
  }, [range]);

  const nowPct = useMemo(() => {
    const now = new Date();
    const m = minutesOfDay(now);
    if (m < range.startMin || m > range.endMin) return null;
    return ((m - range.startMin) / (range.endMin - range.startMin)) * 100;
  }, [range]);

  return (
    <div className="relative w-full bg-white border border-gray-200 rounded-md">
      {/* Hour-Ticks */}
      <div
        className="relative w-full border-b border-gray-100"
        style={{ height: 16 }}
      >
        {hourTicks.map((m) => {
          const pct =
            ((m - range.startMin) / (range.endMin - range.startMin)) * 100;
          return (
            <div
              key={m}
              className="absolute top-0 text-[10px] text-gray-400 -translate-x-1/2"
              style={{ left: `${pct}%` }}
            >
              {timeStrFromMin(m)}
            </div>
          );
        })}
        {range.adaptive && (
          <div className="absolute top-0 right-1 text-[9px] text-blue-500 font-mono">
            adaptiv
          </div>
        )}
      </div>

      {/* Track */}
      <div
        className="relative w-full bg-gradient-to-r from-slate-50 to-white"
        style={{ height: HEIGHT_PX }}
      >
        {/* Grid */}
        {hourTicks.map((m) => {
          const pct =
            ((m - range.startMin) / (range.endMin - range.startMin)) * 100;
          return (
            <div
              key={`g-${m}`}
              className="absolute top-0 bottom-0 border-l border-gray-100"
              style={{ left: `${pct}%` }}
            />
          );
        })}

        {/* Travel-Segments (zwischen Stop[i].pd → Stop[i+1].pa) */}
        {sortedStops.map((s, i) => {
          if (i === sortedStops.length - 1) return null;
          const cur = toDate(s.planned_departure);
          const next = toDate(sortedStops[i + 1].planned_arrival);
          if (!cur || !next) return null;
          const startPct = pctOfRange(cur, range.startMin, range.endMin);
          const endPct = pctOfRange(next, range.startMin, range.endMin);
          const widthPct = Math.max(0, endPct - startPct);
          if (widthPct <= 0.1) return null;
          const dur = durationMin(cur, next);
          return (
            <div
              key={`travel-${s.id}`}
              className="absolute pointer-events-none"
              style={{
                left: `${startPct}%`,
                width: `${widthPct}%`,
                top: HEIGHT_PX / 2 - 2,
                height: 4,
              }}
            >
              <div className="w-full h-full bg-gray-300 rounded-sm" />
              {widthPct > 4 && (
                <div className="text-[9px] text-gray-500 text-center -mt-3 font-mono">
                  {dur}min
                </div>
              )}
            </div>
          );
        })}

        {/* Now-Line */}
        {nowPct != null && (
          <>
            <div
              className="absolute top-0 bottom-0 border-l-2 border-dashed border-gray-800 z-10"
              style={{ left: `${nowPct}%` }}
            />
            <div
              className="absolute top-1 text-[9px] font-mono font-bold text-gray-800 bg-white/80 px-0.5 rounded z-10"
              style={{ left: `calc(${nowPct}% + 2px)` }}
            >
              JETZT
            </div>
          </>
        )}

        {/* Stop-Blocks */}
        {sortedStops.map((s) => {
          const pa = toDate(s.planned_arrival);
          const pd = toDate(s.planned_departure);
          if (!pa) return null;
          const startPct = pctOfRange(pa, range.startMin, range.endMin);
          const endPct = pd
            ? pctOfRange(pd, range.startMin, range.endMin)
            : startPct + 1.5;
          const widthPct = Math.max(0.8, endPct - startPct);
          const sev = slaResults.get(s.id)?.severity ?? 'unknown';
          const col = severityClasses(sev);
          const isSelected = selectedStopId === s.id;

          // S-4.3: SLA-Window hairline (vertical 1px) bei time_to.
          const slaTo =
            s.stop_type === 'DELIVERY' ? s.delivery_time_to : s.loading_time_to;
          let slaToPct: number | null = null;
          if (slaTo && pa) {
            const [hh, mm] = slaTo.split(':').map(Number);
            if (Number.isFinite(hh) && Number.isFinite(mm)) {
              const slaToMin = hh * 60 + mm;
              if (slaToMin >= range.startMin && slaToMin <= range.endMin) {
                slaToPct =
                  ((slaToMin - range.startMin) /
                    (range.endMin - range.startMin)) *
                  100;
              }
            }
          }

          const dim = focused && sev === 'ok';

          return (
            <div key={s.id}>
              <button
                onClick={() => onStopClick?.(s.id)}
                className={`absolute top-2 bottom-2 ${col.bg} ${col.border} border-2 rounded ${
                  isSelected ? 'ring-2 ring-blue-500' : ''
                } hover:brightness-95 transition-all overflow-hidden text-left ${
                  dim ? 'opacity-30' : ''
                }`}
                style={{
                  left: `${startPct}%`,
                  width: `${widthPct}%`,
                  minWidth: '24px',
                }}
                title={`${s.shipment_number ?? s.id.slice(0, 6)} · ${fmtTime(pa)}`}
              >
                <div className={`px-1 text-[10px] font-mono ${col.text} truncate`}>
                  {s.position}. {s.shipment_number ?? '—'}
                </div>
                <div className="px-1 text-[9px] text-gray-600 truncate">
                  {fmtTime(pa)}
                </div>
              </button>
              {/* SLA-Window-Hairline rechts neben Block */}
              {slaToPct != null && (
                <div
                  className="absolute top-1 bottom-1 border-r border-dashed border-amber-500/70 pointer-events-none"
                  style={{ left: `${slaToPct}%`, width: 0 }}
                  title={`SLA-Deadline ${slaTo}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Legend + Critical-Mode-Toggle */}
      <div className="flex items-center gap-3 px-2 py-1 text-[10px] text-gray-500 border-t border-gray-100">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 size={10} className="text-green-600" />
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
        <span className="ml-2">
          {criticalCount} kritisch · {warningCount} Warnung
        </span>
        {(criticalCount > 0 || focused) && (
          <button
            type="button"
            onClick={() => setFocusedManual(!focused)}
            className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 border border-gray-300 rounded text-[10px] hover:bg-gray-50"
            title={
              focused
                ? 'Alle Stops zeigen'
                : 'Nur kritische/Warnungen hervorheben'
            }
          >
            {focused ? <Eye size={10} /> : <Focus size={10} />}
            {focused ? 'Alle zeigen' : 'Fokus'}
          </button>
        )}
      </div>
    </div>
  );
}
