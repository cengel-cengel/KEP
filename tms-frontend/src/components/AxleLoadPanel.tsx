import { useMemo } from 'react';
import {
  computeAxleLoads,
  type AxleLoadPackage,
  type AxleStatus,
} from '../lib/axleLoad';

interface Props {
  packages: AxleLoadPackage[];
  vehicleType: string;
  trailerLength_m: number;
  /** Optional: Pakete am Boden (posZ === 0) und Total fuer Hinweis-Banner. */
  groundedCount?: number;
  totalCount?: number;
}

const STATUS_BAR_COLOR: Record<AxleStatus, string> = {
  ok: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
};

const STATUS_TEXT_COLOR: Record<AxleStatus, string> = {
  ok: 'text-emerald-700',
  warning: 'text-amber-700',
  critical: 'text-red-700',
};

function fmtKg(n: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n) + ' kg';
}

export default function AxleLoadPanel({
  packages,
  vehicleType,
  trailerLength_m,
  groundedCount,
  totalCount,
}: Props) {
  const result = useMemo(
    () => computeAxleLoads(packages, vehicleType, trailerLength_m),
    [packages, vehicleType, trailerLength_m],
  );

  const criticalAxles = result.axles.filter((a) => a.status === 'critical');
  const showStackInfo =
    typeof groundedCount === 'number' &&
    typeof totalCount === 'number' &&
    totalCount > 0;
  const stackedCount = showStackInfo ? (totalCount as number) - (groundedCount as number) : 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium text-gray-900">Achslast</h3>
        <div className="text-xs text-gray-500">
          {vehicleType} · {trailerLength_m.toFixed(1)} m
        </div>
      </div>

      {showStackInfo && (
        <div className="mb-3 rounded bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-900">
          📦 <strong>{groundedCount}</strong> von {totalCount} Paletten am Boden
          {stackedCount > 0 && <> · {stackedCount} gestapelt</>}
          {stackedCount === 0 && totalCount! > 0 && (
            <> · <em>nichts stapelbar — Trailer evtl. voller als nötig</em></>
          )}
        </div>
      )}

      {result.warnings.length > 0 && (
        <div className="mb-3 rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          ⚠️ {result.warnings.join(' · ')}
        </div>
      )}

      {criticalAxles.length > 0 && (
        <div className="mb-3 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
          🚨 Überlast:{' '}
          {criticalAxles
            .map((a) => `${a.label} ${a.loadPercent.toFixed(0)}%`)
            .join(' · ')}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3 text-xs">
        <Stat label="Gesamtgewicht" value={fmtKg(result.totalWeight_kg)} />
        <Stat label="Cargo" value={fmtKg(result.cargoWeight_kg)} />
        <Stat label="Leergewicht" value={fmtKg(result.emptyWeightKg)} />
        <Stat
          label="Schwerpunkt v. Front"
          value={`${result.centerOfGravity_m.toFixed(2)} m`}
        />
      </div>

      <div className="space-y-2">
        {result.axles.length === 0 && (
          <div className="text-xs text-gray-500 italic">Keine Achsen konfiguriert.</div>
        )}
        {result.axles.map((a) => {
          const pct = Math.min(100, Math.max(0, a.loadPercent));
          const overflowPct = a.loadPercent > 100 ? a.loadPercent - 100 : 0;
          return (
            <div key={a.label}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="font-medium text-gray-800">{a.label}</span>
                <span className={STATUS_TEXT_COLOR[a.status]}>
                  {fmtKg(a.load_kg)} / {fmtKg(a.maxLoad_kg)} ({a.loadPercent.toFixed(0)}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 relative">
                <div
                  className={`h-full ${STATUS_BAR_COLOR[a.status]} transition-all`}
                  style={{ width: `${pct}%` }}
                />
                {overflowPct > 0 && (
                  <div
                    className="absolute top-0 right-0 h-full bg-red-700/60 ring-1 ring-red-900"
                    style={{ width: `${Math.min(20, overflowPct / 5)}%` }}
                    title="Überlast"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-sm font-semibold text-gray-900">{value}</div>
    </div>
  );
}
