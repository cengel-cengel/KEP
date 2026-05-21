/**
 * Map-Routing P1: Auto-Ableitung shipment.classification.
 *
 * Algorithmus (Decision-Tree):
 *   1. Sattel-Heuristik first: weight ≥ SATTEL_WEIGHT_KG ODER
 *      ldm ≥ SATTEL_LDM → CHARTER_DIREKT (unabhängig vom Gebiet)
 *   2. Gewicht-Schwelle: < SAMMELGUT_MAX_KG → SAMMELGUT
 *   3. Ab SAMMELGUT_MAX_KG aber transport_type ∈ Teil/Komplett:
 *      - delivery-PLZ in NV-Gebiet → CHARTER_UMSCHLAG
 *      - sonst → CHARTER_DIREKT
 *   4. Fallback SAMMELGUT (Default).
 *
 * Aufruf: bei Sendung-Create + Override-Endpoint.
 */

export const SAMMELGUT_MAX_KG = 3000;
export const SATTEL_WEIGHT_KG = 24000;
export const SATTEL_LDM = 13.6;

export const CHARTER_TRANSPORT_TYPES = new Set([
  'TEILLADUNG',
  'KOMPLETTLADUNG',
  'DIREKT',
  'DIREKT_UMSCHLAG',
]);

export type ShipmentClassification =
  | 'SAMMELGUT'
  | 'CHARTER_UMSCHLAG'
  | 'CHARTER_DIREKT';

export interface ClassificationInput {
  weight_kg?: number | null;
  ldm?: number | null;
  transport_type?: string | null;
  /** Delivery-PLZ (z.B. "20457"). */
  delivery_zip?: string | null;
  /** Pre-computed: liegt delivery_zip in einem NV-Gebiet? */
  isInOwnNvGebiet?: boolean;
}

export function classifyShipment(
  input: ClassificationInput,
): ShipmentClassification {
  const w = Number(input.weight_kg ?? 0);
  const ldm = Number(input.ldm ?? 0);

  // 1. Sattel-Heuristik
  if (
    (Number.isFinite(w) && w >= SATTEL_WEIGHT_KG) ||
    (Number.isFinite(ldm) && ldm >= SATTEL_LDM)
  ) {
    return 'CHARTER_DIREKT';
  }

  // 2. Sammelgut wenn unter Schwelle
  if (!Number.isFinite(w) || w < SAMMELGUT_MAX_KG) {
    return 'SAMMELGUT';
  }

  // 3. ≥3t: Teil/Komplett → Charter (mit Gebiet-Differenzierung)
  const tt = (input.transport_type ?? '').toUpperCase();
  if (CHARTER_TRANSPORT_TYPES.has(tt)) {
    return input.isInOwnNvGebiet ? 'CHARTER_UMSCHLAG' : 'CHARTER_DIREKT';
  }

  // 4. Fallback
  return 'SAMMELGUT';
}
