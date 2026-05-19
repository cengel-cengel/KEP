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
export function isShipmentFullyStackable(
  items: Array<{ stackable?: boolean | null }>,
): boolean {
  return items.every((it) => it.stackable !== false);
}

/**
 * Sendungs-Level Pairing (B-4.5).
 *
 * Cross-Shipment-Stack: nimmt aggregierte Werte pro Sendung
 * (height = max items.height, weight = Σ items, ldm bereits
 * item-intern reduziert). Limits gelten 1:1 wie für Items
 * (physische LKW-Innenhöhe / Stack-Tragkraft).
 */
export interface StackShipment {
  ldm: number;
  height_cm: number;
  weight_kg: number;
  /** Result von isShipmentFullyStackable über shipments.package_items. */
  stackable: boolean;
}

export function canPairShipments(
  bottom: StackShipment,
  top: StackShipment,
  limits: PairLimits = {},
): boolean {
  if (!bottom.stackable) return false;
  const maxH = limits.maxHeightCm ?? DEFAULT_MAX_STACK_HEIGHT_CM;
  const maxKg = limits.maxWeightKg ?? DEFAULT_MAX_STACK_WEIGHT_KG;
  if (Number(bottom.height_cm) + Number(top.height_cm) > maxH) return false;
  if (Number(bottom.weight_kg) + Number(top.weight_kg) > maxKg) return false;
  return true;
}

/**
 * Effective LDM auf Tour-Ebene via Greedy-Pairing (B-4.5).
 *
 * Algorithmus O(n²):
 *   1. sort desc by ldm
 *   2. iterate als bottom; suche besten top (größte ldm) der
 *      canPairShipments erfüllt und noch frei ist
 *   3. paired → effective += max(bottom.ldm, top.ldm)
 *      unpaired → effective += bottom.ldm
 *
 * top.stackable spielt KEINE Rolle (auf top kommt nichts mehr).
 */
export function computeEffectiveLdm(
  shipments: StackShipment[],
  limits: PairLimits = {},
): number {
  const items = shipments
    .map((s, idx) => ({ ...s, idx, ldm: Number(s.ldm) || 0 }))
    .sort((a, b) => b.ldm - a.ldm);
  const used = new Set<number>();
  let effective = 0;
  for (const bottom of items) {
    if (used.has(bottom.idx)) continue;
    used.add(bottom.idx);
    if (!bottom.stackable) {
      effective += bottom.ldm;
      continue;
    }
    let bestTop: typeof bottom | null = null;
    for (const top of items) {
      if (used.has(top.idx)) continue;
      if (top.idx === bottom.idx) continue;
      if (!canPairShipments(bottom, top, limits)) continue;
      if (!bestTop || top.ldm > bestTop.ldm) bestTop = top;
    }
    if (bestTop) {
      used.add(bestTop.idx);
      effective += Math.max(bottom.ldm, bestTop.ldm);
    } else {
      effective += bottom.ldm;
    }
  }
  return Math.round(effective * 100) / 100;
}
