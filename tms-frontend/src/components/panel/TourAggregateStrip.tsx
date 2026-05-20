/**
 * B' Sprint: 4-Kachel Aggregate-Strip für TourDetailsTab.
 *
 * Renders unter StickyHead (sticky-second-row, position:sticky top
 * relativ zu Panel-Body-Scroll-Container).
 *
 * Kacheln:
 *   📦 Sendungen (unique count)
 *   ⚖️ kg (Σ weight_kg)
 *   📍 km (geplante_km)
 *   €  (total_kosten_eur)
 *
 * Optional Schedule-Hint-Row bei Stamm-Tour: "Schedule: MO,DI,MI,DO,FR".
 */
import { Package, Scale, Route, Euro, Calendar } from 'lucide-react';
import { sortWochentagList } from '../../lib/wochentage';

export interface TourAggregates {
  /** Σ unique shipments-count (NV via tour.stops dedupe, FV direkt). */
  shipmentCount: number;
  /** Σ weight in kg. */
  weightKgSum: number;
  /** geplante_km (BE-persisted). */
  kmTotal: number | null;
  /** total_kosten_eur (BE-persisted, GENERATED). */
  euroTotal: number | null;
}

export interface TourAggregateStripProps {
  aggregates: TourAggregates;
  /** Optional Stamm-Schedule (nv_stamm_tour.wochentage) — wenn gesetzt,
   *  Hint-Row "Schedule: MO,DI,..." darunter. */
  stammSchedule?: string[] | null;
  /** Optional zusätzliches Datum-Label (z.B. "Mittwoch · 2026-05-20"). */
  dateLabel?: string;
}

function fmtKg(n: number): string {
  if (n === 0) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}t`;
  return Math.round(n).toString();
}

function fmtKm(n: number | null): string {
  if (n == null) return '—';
  return Math.round(n).toString();
}

function fmtEur(n: number | null): string {
  if (n == null) return '—';
  return Math.round(n).toString();
}

function Tile({
  icon,
  value,
  label,
  unit,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  unit?: string;
}) {
  return (
    <div className="flex-1 min-w-0 bg-white border border-gray-200 rounded px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10px] text-gray-500 uppercase">
        {icon}
        {label}
      </div>
      <div className="font-semibold text-sm text-gray-900 font-mono truncate">
        {value}
        {unit && (
          <span className="text-[10px] font-normal text-gray-500 ml-0.5">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

export default function TourAggregateStrip({
  aggregates,
  stammSchedule,
  dateLabel,
}: TourAggregateStripProps) {
  const sched = stammSchedule ? sortWochentagList(stammSchedule) : [];
  return (
    <div className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 px-3 py-2">
      <div className="flex items-stretch gap-1.5">
        <Tile
          icon={<Package size={10} />}
          value={String(aggregates.shipmentCount)}
          label="Sendg."
        />
        <Tile
          icon={<Scale size={10} />}
          value={fmtKg(aggregates.weightKgSum)}
          label="Gewicht"
          unit="kg"
        />
        <Tile
          icon={<Route size={10} />}
          value={fmtKm(aggregates.kmTotal)}
          label="km"
        />
        <Tile
          icon={<Euro size={10} />}
          value={fmtEur(aggregates.euroTotal)}
          label="Kosten"
        />
      </div>
      {(sched.length > 0 || dateLabel) && (
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-gray-600">
          <Calendar size={10} />
          {dateLabel && <span>{dateLabel}</span>}
          {sched.length > 0 && (
            <span className="ml-auto font-mono text-gray-500">
              Schedule: {sched.join(',')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
