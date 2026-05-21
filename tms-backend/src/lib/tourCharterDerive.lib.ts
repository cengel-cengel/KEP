/**
 * Map-Routing P1: Auto-Setter für tour.is_charter.
 *
 * Charter-Direkt-Tour-Regel:
 *   tour.shipments.length === 1
 *   && shipment.classification === 'CHARTER_DIREKT'
 *   → is_charter = true
 *   sonst → false
 *
 * Charter-Umschlag wird hier NICHT als is_charter=true behandelt:
 *   → das wird im 2-Touren-Auto-Split-Sprint (nicht jetzt) gehandhabt.
 */

export interface CharterDeriveInput {
  shipments: Array<{ classification?: string | null }>;
}

export function deriveIsCharter(input: CharterDeriveInput): boolean {
  if (input.shipments.length !== 1) return false;
  return input.shipments[0]?.classification === 'CHARTER_DIREKT';
}
