/**
 * C' Sprint: Multi-Tour Aggregate-Strip für BoardPanel.
 *
 * Mount: zwischen Board-Toolbar und Touren-Liste (sticky-top).
 * Trigger: nur sichtbar wenn ≥2 Touren in filteredTouren.
 *
 * 5-Kachel: Touren / Sendg. / kg / km / €
 *   Σ über alle sichtbaren Touren (NV-only — FV Tour-List liefert
 *   nur shipment-ids, kein weight_kg/total_kosten_eur).
 *
 * Aggregation: shipmentCount via Set-Dedupe pro Sendung (1 Tour ×
 * 1 Sendung mehrfach gezählt sonst — bei kombinierten Tours
 * theoretisch möglich).
 */
import { useMemo } from 'react';
import { Package, Scale, Route, Euro, Truck } from 'lucide-react';
import type { NvTour } from '../../lib/nvTypes';

export interface MultiTourAggregates {
  tourCount: number;
  shipmentCount: number;
  weightKgSum: number;
  kmTotal: number;
  euroTotal: number;
}

export function computeMultiTourAggregates(
  tours: NvTour[],
): MultiTourAggregates {
  const shipmentIds = new Set<string>();
  let weight = 0;
  let km = 0;
  let euro = 0;
  for (const t of tours) {
    if (t.geplante_km != null) {
      const v = Number(t.geplante_km);
      if (Number.isFinite(v)) km += v;
    }
    if (t.total_kosten_eur != null) {
      const v = Number(t.total_kosten_eur);
      if (Number.isFinite(v)) euro += v;
    }
    for (const s of t.stops ?? []) {
      const sh = s.shipment;
      if (sh?.id) shipmentIds.add(sh.id);
      if (sh?.weight_kg != null) {
        const w = Number(sh.weight_kg);
        if (Number.isFinite(w)) weight += w;
      }
    }
  }
  return {
    tourCount: tours.length,
    shipmentCount: shipmentIds.size,
    weightKgSum: weight,
    kmTotal: km,
    euroTotal: euro,
  };
}

function fmtKg(n: number): string {
  if (n === 0) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}t`;
  return Math.round(n).toString();
}

function fmtNum(n: number): string {
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

export default function MultiTourAggregateStrip({
  tours,
}: {
  tours: NvTour[];
}) {
  const agg = useMemo(() => computeMultiTourAggregates(tours), [tours]);
  if (agg.tourCount < 2) return null;
  return (
    <div
      className="bg-gray-100 border-b border-gray-200 px-2 py-1.5"
      data-testid="multi-tour-aggregate-strip"
    >
      <div className="flex items-stretch gap-1.5">
        <Tile
          icon={<Truck size={10} />}
          value={String(agg.tourCount)}
          label="Touren (Σ)"
        />
        <Tile
          icon={<Package size={10} />}
          value={String(agg.shipmentCount)}
          label="Sendg."
        />
        <Tile
          icon={<Scale size={10} />}
          value={fmtKg(agg.weightKgSum)}
          label="Gewicht"
          unit="kg"
        />
        <Tile
          icon={<Route size={10} />}
          value={fmtNum(agg.kmTotal)}
          label="km"
        />
        <Tile
          icon={<Euro size={10} />}
          value={fmtNum(agg.euroTotal)}
          label="Kosten"
        />
      </div>
    </div>
  );
}
