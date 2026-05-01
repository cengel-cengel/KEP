import { useMemo, useState } from 'react';
import {
  computeSecurement,
  type SecurementPackage,
} from '../lib/loadSecurement';

interface Props {
  packages: SecurementPackage[];
}

const MU_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0.4, label: 'Holz/Stahl (μ 0.40)' },
  { value: 0.6, label: 'Anti-Rutschmatte (μ 0.60)' },
];

function totalColorClasses(n: number): string {
  if (n > 20) return 'bg-red-50 border-red-200 text-red-800';
  if (n > 10) return 'bg-orange-50 border-orange-200 text-orange-800';
  if (n > 4) return 'bg-amber-50 border-amber-200 text-amber-800';
  return 'bg-emerald-50 border-emerald-200 text-emerald-800';
}

interface ShipmentGroup {
  shipmentId: string;
  packageCount: number;
  straps: number;
}

export default function SecurementPanel({ packages }: Props) {
  const [mu, setMu] = useState<number>(0.4);
  const stfDaN = 5000;

  const result = useMemo(
    () => computeSecurement(packages, { mu, stfDaN }),
    [packages, mu],
  );

  const groups: ShipmentGroup[] = useMemo(() => {
    const map = new Map<string, ShipmentGroup>();
    for (const p of result.perPackage) {
      const id = p.shipmentId ?? '–';
      const cur = map.get(id);
      if (cur) {
        cur.packageCount++;
        cur.straps += p.nTotal;
      } else {
        map.set(id, { shipmentId: id, packageCount: 1, straps: p.nTotal });
      }
    }
    return [...map.values()].sort((a, b) => b.straps - a.straps);
  }, [result.perPackage]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 mt-3">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-medium text-gray-900">Ladungssicherung (EN 12195-1)</h3>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-gray-600">μ-Reibung:</span>
          <select
            value={mu}
            onChange={(e) => setMu(Number(e.target.value))}
            className="rounded border border-gray-300 bg-white px-2 py-1"
          >
            {MU_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={'rounded-lg border px-3 py-2 mb-3 ' + totalColorClasses(result.totalStraps)}>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold">{result.totalStraps}</span>
          <span className="text-sm">Spanngurte</span>
          <span className="text-xs opacity-70 ml-auto">
            STF {stfDaN} daN · k=1.5 · μ={mu.toFixed(2)}
          </span>
        </div>
      </div>

      {result.warnings.length > 0 && (
        <div className="mb-3 rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          ⚠️ {result.warnings.join(' · ')}
        </div>
      )}

      <div className="text-xs text-gray-700">
        <div className="mb-1 font-medium text-gray-600 uppercase tracking-wide text-[10px]">
          Pro Sendung
        </div>
        <div className="space-y-1">
          {groups.map((g) => (
            <div
              key={g.shipmentId}
              className="flex items-center justify-between rounded bg-gray-50 border border-gray-200 px-2 py-1"
            >
              <span className="font-mono text-[11px]">
                {g.shipmentId === '–' ? 'Ohne Sendung' : g.shipmentId.slice(0, 12)}
              </span>
              <span>
                {g.packageCount} Pak. · <strong>{g.straps}</strong> Gurte
              </span>
            </div>
          ))}
          {groups.length === 0 && (
            <div className="text-gray-500 italic">Keine Pakete.</div>
          )}
        </div>
      </div>

      <div className="mt-3 text-[11px] text-gray-500 italic">
        ℹ️ Vereinfachte Berechnung (Niederzurren). Verbindlich nach VDI 2700 /
        EN 12195-1 vor Ort prüfen.
      </div>
    </div>
  );
}
