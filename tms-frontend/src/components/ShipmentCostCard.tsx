import type { ReactNode } from 'react';

type ShipmentCostBreakdown = {
  fpgMethod: string;
  chargeableWeight: number;
  preCarriageCost: number;
  mainCarriageCost: number;
  onCarriageCost: number;
  totalCost: number;
  freightRevenue: number;
  contributionMargin: number;
  cmPercent: number;
};

function dbPercentColor(percent: number): { color: string } {
  if (percent >= 15) return { color: 'text-emerald-700' };
  if (percent >= 5) return { color: 'text-amber-700' };
  return { color: 'text-red-700' };
}

export default function ShipmentCostCard({
  title = 'Kostenaufschlüsselung',
  breakdown,
  rightSlot,
}: {
  title?: string;
  breakdown: ShipmentCostBreakdown;
  rightSlot?: ReactNode;
}) {
  const db = breakdown.contributionMargin;
  const dbPercent = breakdown.cmPercent;
  const dbColor = dbPercentColor(dbPercent).color;

  return (
    <div className="bg-gray-50 border border-gray-200 rounded p-3 text-sm">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="font-medium">{title}</div>
        {rightSlot}
      </div>

      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-600">FPG ({breakdown.fpgMethod})</span>
          <span className="font-medium">{breakdown.chargeableWeight} kg</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Vorlauf</span>
          <span>{breakdown.preCarriageCost.toFixed(2)} €</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Hauptlauf</span>
          <span>{breakdown.mainCarriageCost.toFixed(2)} €</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Nachlauf</span>
          <span>{breakdown.onCarriageCost.toFixed(2)} €</span>
        </div>
        <div className="flex justify-between border-t pt-1 font-medium">
          <span>Gesamt Kosten</span>
          <span>{breakdown.totalCost.toFixed(2)} €</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Erlös</span>
          <span>{breakdown.freightRevenue.toFixed(2)} €</span>
        </div>
        <div className={`flex justify-between font-bold ${dbColor}`}>
          <span>DB</span>
          <span>
            {db.toFixed(2)} € ({dbPercent.toFixed(1)}%)
          </span>
        </div>
      </div>
    </div>
  );
}

