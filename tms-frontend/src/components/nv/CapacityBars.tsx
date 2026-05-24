/**
 * W-3.2.A: CapacityBars extrahiert aus NvDispositionPage.tsx (Pure-Move).
 * Render 4 horizontale Auslastungs-Balken (Pal/kg/m³/LDM) für eine NV-Tour.
 */

export interface CapacityData {
  limits: {
    max_paletten: number | null;
    max_gewicht_kg: number | null;
    max_volumen_m3: number | null;
    max_ldm: number | null;
  };
  current: {
    paletten: number;
    gewicht_kg: number;
    volumen_m3: number;
    ldm: number;
  };
}

export default function CapacityBars({ cap }: { cap?: CapacityData }) {
  if (!cap) return null;
  const { limits, current } = cap;
  const allSet =
    limits.max_paletten != null &&
    limits.max_gewicht_kg != null &&
    limits.max_volumen_m3 != null &&
    limits.max_ldm != null;
  if (!allSet) {
    return (
      <div className="text-[10px] text-gray-400 mt-1">
        Kapazität nicht konfiguriert
      </div>
    );
  }
  const items: {
    label: string;
    cur: number;
    max: number;
    unit: string;
    /** O-2: nur kg + m³ triggern rot. Pal + LDM sind Info-only. */
    rotTrigger: boolean;
  }[] = [
    { label: 'Pal', cur: current.paletten, max: limits.max_paletten as number, unit: '', rotTrigger: false },
    {
      label: 'kg',
      cur: current.gewicht_kg,
      max: limits.max_gewicht_kg as number,
      unit: '',
      rotTrigger: true,
    },
    {
      label: 'm³',
      cur: current.volumen_m3,
      max: limits.max_volumen_m3 as number,
      unit: '',
      rotTrigger: true,
    },
    {
      label: 'LDM',
      cur: current.ldm,
      max: limits.max_ldm as number,
      unit: '',
      rotTrigger: false,
    },
  ];
  return (
    <div className="flex gap-2 mt-1.5">
      {items.map((it) => {
        const pct = it.max > 0 ? (it.cur / it.max) * 100 : 0;
        const over = pct > 100;
        const overRot = over && it.rotTrigger;
        const clamped = Math.min(100, Math.max(0, pct));
        return (
          <div key={it.label} className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between text-[10px] leading-none mb-0.5">
              <span className="text-gray-500">{it.label}</span>
              <span
                className={`font-mono ${overRot ? 'text-red-700 font-semibold' : 'text-gray-600'}`}
              >
                {Math.round(it.cur)}/{Math.round(it.max)}
              </span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded overflow-hidden">
              <div
                className={`h-full ${overRot ? 'bg-red-600' : 'bg-green-500'}`}
                style={{ width: `${clamped}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
