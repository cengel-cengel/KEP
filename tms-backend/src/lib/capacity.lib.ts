/**
 * Soft-Capacity Overload — 2-Achsen Helper.
 *
 * B-4 Entscheid: batch-stops akzeptiert Overload (kein 409),
 * release/dispatch blocken bei Overload. UI zeigt rote
 * OverloadBar wenn ratio > 1.0.
 *
 * Ratio-Konvention:
 *   max=null/0 (Limit unbekannt) → ratio = 0 (kein Overload)
 *   max>0 + total>=0             → ratio = total / max
 *
 * isOverloaded := ldm > 1.0 OR weight > 1.0
 */

export interface Overload {
  ldm: number;
  weight: number;
  isOverloaded: boolean;
}

function ratio(total: number, max: number | null | undefined): number {
  if (!max || max <= 0) return 0;
  const t = Number(total) || 0;
  return t / max;
}

export function computeOverload(
  totalLdm: number,
  totalWeightKg: number,
  maxLdm: number | null | undefined,
  maxWeightKg: number | null | undefined,
): Overload {
  const ldm = ratio(totalLdm, maxLdm ?? null);
  const weight = ratio(totalWeightKg, maxWeightKg ?? null);
  return { ldm, weight, isOverloaded: ldm > 1 || weight > 1 };
}

/** Lesbare 409-Message: "1.15× LDM, 0.98× Gewicht" / nur >100%. */
export function formatOverloadMessage(o: Overload): string {
  const parts: string[] = [];
  if (o.ldm > 1) parts.push(`${o.ldm.toFixed(2)}× LDM`);
  if (o.weight > 1) parts.push(`${o.weight.toFixed(2)}× Gewicht`);
  if (parts.length === 0) return 'Tour innerhalb Kapazität';
  return `Tour überladen: ${parts.join(', ')}`;
}
