/** Lademeter mit Stapelbarkeit: stapelbare Sendungen zählen mit Faktor ½ (Faktor 2 auf „Boden-Äquivalent“). */

export type LdmShipmentInput = {
  ldm?: number | null;
  isStackable?: boolean | null;
};

export function ldmFloorTotal(shipments: LdmShipmentInput[]): number {
  return shipments.reduce((s, x) => s + Math.max(0, Number(x.ldm) || 0), 0);
}

export function ldmEffectiveTotal(shipments: LdmShipmentInput[]): number {
  return shipments.reduce((s, x) => {
    const ld = Math.max(0, Number(x.ldm) || 0);
    return s + (x.isStackable ? ld / 2 : ld);
  }, 0);
}

export function stackingHeadroomLdm(shipments: LdmShipmentInput[]): number {
  return Math.max(0, ldmFloorTotal(shipments) - ldmEffectiveTotal(shipments));
}

export type StackingLdmMetrics = {
  maxLdm: number;
  floorUsed: number;
  effectiveUsed: number;
  headroomLdm: number;
  freeFloorLdm: number;
  freeEffectiveLdm: number;
  floorPct: number;
  effectivePct: number;
};

export function computeStackingLdmMetrics(
  maxLdm: number,
  shipments: LdmShipmentInput[],
): StackingLdmMetrics {
  const cap = maxLdm > 0 ? maxLdm : 13.6;
  const floorUsed = ldmFloorTotal(shipments);
  const effectiveUsed = ldmEffectiveTotal(shipments);
  const headroomLdm = stackingHeadroomLdm(shipments);
  const freeFloorLdm = Math.max(0, cap - floorUsed);
  const freeEffectiveLdm = Math.max(0, cap - effectiveUsed);
  return {
    maxLdm: cap,
    floorUsed,
    effectiveUsed,
    headroomLdm,
    freeFloorLdm,
    freeEffectiveLdm,
    floorPct: cap > 0 ? (floorUsed / cap) * 100 : 0,
    effectivePct: cap > 0 ? (effectiveUsed / cap) * 100 : 0,
  };
}
