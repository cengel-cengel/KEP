/**
 * Stapelregeln fuer Paletten im Beladeplan.
 *
 * Carlos-Regel:
 *  - Eine Palette darf nur gestapelt werden, wenn sie selbst
 *    stapelbar ist UND die Basis-Palette unter ihr stapelbar ist.
 *  - Auch innerhalb einer Sendung gilt diese Regel.
 *
 * Verwendet von:
 *  - placePackages / findPreferredStackSlot (Auto-Placer)
 *  - Phase-E DnD-Drop-Handler
 */

export interface StackablePackage {
  isStackable: boolean;
  shipmentId?: string;
  id?: string;
}

export interface StackCheck {
  allowed: boolean;
  reason?: string;
}

export function canStackOn(below: StackablePackage, above: StackablePackage): StackCheck {
  if (!below.isStackable) {
    return {
      allowed: false,
      reason: 'Basis-Palette ist nicht stapelbar',
    };
  }
  if (!above.isStackable) {
    return {
      allowed: false,
      reason: 'Obere Palette ist nicht stapelbar',
    };
  }
  return { allowed: true };
}
