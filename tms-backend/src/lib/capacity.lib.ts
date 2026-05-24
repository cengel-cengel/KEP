/**
 * Soft-Capacity Overload — 3-Achsen Helper.
 *
 * O-3 Update: isOverloaded triggert auf vol > 1 ODER weight > 1.
 *   ldm bleibt im Output als INFO-Wert (Anzeige), triggert aber
 *   NICHT mehr. Hintergrund: stapelbare Ladung verdoppelt effektiv
 *   die LDM-Auslastung pro Bodenmeter — ldm > 100% alleine ist
 *   kein zuverlaessiger Ueberlast-Indikator.
 *
 * B-4 Entscheid: batch-stops akzeptiert Overload (kein 409),
 * release/dispatch blocken bei Overload. UI zeigt rote
 * OverloadBar wenn ratio > 1.0.
 *
 * Ratio-Konvention:
 *   max=null/0 (Limit unbekannt) → ratio = 0 (kein Overload)
 *   max>0 + total>=0             → ratio = total / max
 */

export interface Overload {
  ldm: number;
  weight: number;
  /** O-3: Volumen-Auslastung (cargo / Trailer-Box). */
  vol: number;
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
  totalVolM3: number = 0,
  maxVolM3: number | null | undefined = null,
): Overload {
  const ldm = ratio(totalLdm, maxLdm ?? null);
  const weight = ratio(totalWeightKg, maxWeightKg ?? null);
  const vol = ratio(totalVolM3, maxVolM3 ?? null);
  return {
    ldm,
    weight,
    vol,
    // O-3: ldm raus aus Trigger.
    isOverloaded: vol > 1 || weight > 1,
  };
}

/**
 * O-3: Lesbare 409-Message — nur Vol + Gewicht (Trigger-Achsen).
 * ldm bleibt INFO; erscheint NICHT mehr im "Tour überladen"-String.
 */
export function formatOverloadMessage(o: Overload): string {
  const parts: string[] = [];
  if (o.vol > 1) parts.push(`${o.vol.toFixed(2)}× Volumen`);
  if (o.weight > 1) parts.push(`${o.weight.toFixed(2)}× Gewicht`);
  if (parts.length === 0) return 'Tour innerhalb Kapazität';
  return `Tour überladen: ${parts.join(', ')}`;
}

/**
 * O-3: Trailer-Volumen aus max_ldm ableiten (Mirror FE
 * lib/vehicleTypes.deriveBoxFromLdm).
 *
 *   length_cm = max(100, maxLdm × 100)
 *   width_cm  = 240             (Sattel/Koffer-Standard)
 *   height_cm = maxLdm > 8 ? 270 : 240
 *   maxVolM3  = (l × w × h) / 1e6
 *
 * Bewusste Vereinfachung: deckt 90% der Touren (Sattel) genau ab;
 * kleinere Klassen leicht generös. Vermeidet Stammdaten-Pflicht
 * fuer max_volumen_m3 (FV-subs/tours haben das Feld nicht). Bei
 * fehlendem max_ldm → null (kein Overload-Trigger).
 */
export function deriveMaxVolM3(
  maxLdm: number | null | undefined,
): number | null {
  if (maxLdm == null) return null;
  const n = Number(maxLdm);
  if (!Number.isFinite(n) || n <= 0) return null;
  const lengthCm = Math.max(100, Math.round(n * 100));
  const widthCm = 240;
  const heightCm = n > 8 ? 270 : 240;
  return (lengthCm * widthCm * heightCm) / 1e6;
}
