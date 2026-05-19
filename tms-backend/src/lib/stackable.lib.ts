/**
 * Stackable-Pairing-Regel auf shipment_package_items-Ebene.
 *
 * Modell (B-3 Entscheid):
 *   pair(bottom, top) erlaubt WENN
 *     bottom.stackable = true
 *     AND (bottom.height + top.height) <= MAX_STACK_HEIGHT_CM
 *     AND (bottom.weight + top.weight) <= MAX_STACK_WEIGHT_KG
 *   top.stackable spielt KEINE Rolle (auf top kommt nichts mehr).
 *
 * Sendungs-Level "nicht-stackable" (computed, kein DB-Feld):
 *   EXISTS item WHERE stackable = false
 */

export interface StackItem {
  height_cm: number | null | undefined;
  weight_kg: number | string | null | undefined;
  stackable?: boolean | null;
}

export const DEFAULT_MAX_STACK_HEIGHT_CM = 220;
export const DEFAULT_MAX_STACK_WEIGHT_KG = 1500;

export interface PairLimits {
  maxHeightCm?: number;
  maxWeightKg?: number;
}

/** Prüft, ob top auf bottom gestapelt werden darf. */
export function canPair(
  bottom: StackItem,
  top: StackItem,
  limits: PairLimits = {},
): boolean {
  if (bottom.stackable === false) return false;
  const maxH = limits.maxHeightCm ?? DEFAULT_MAX_STACK_HEIGHT_CM;
  const maxKg = limits.maxWeightKg ?? DEFAULT_MAX_STACK_WEIGHT_KG;
  const bH = Number(bottom.height_cm ?? 0);
  const tH = Number(top.height_cm ?? 0);
  if (bH + tH > maxH) return false;
  const bKg = Number(bottom.weight_kg ?? 0);
  const tKg = Number(top.weight_kg ?? 0);
  if (bKg + tKg > maxKg) return false;
  return true;
}

/** Sendungs-Level: hat ein nicht-stapelbares Item. */
export function isShipmentFullyStackable(items: StackItem[]): boolean {
  return items.every((it) => it.stackable !== false);
}
