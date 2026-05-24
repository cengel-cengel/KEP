/**
 * F2.1 NV-Swap-Optimizer.
 *
 * Pure-Algorithmus. KEIN UI, KEIN BE-Call, KEIN placePackages — die
 * Effektiv-ldm-Quelle der Wahrheit ist computeStackingLdmMetrics
 * (genau wie die Anzeige im Beladeplan).
 *
 * Schritte fuer Caller:
 *   1. Sendungen pro Tour holen + isFixSendung() → split in fix /
 *      swappable.
 *   2. findSwapPlan({ fixShipments, swappableShipments, maxLdm }) →
 *      SwapPlan | null (mit Sonderfall-Signal fixOverloaded).
 *   3. SwapPlan im UI bestaetigen lassen + via batch-stops umsetzen
 *      (atomarer Swap-Endpoint existiert NICHT, siehe F2-Phase-0
 *      Befund — 2 sequenzielle Calls mit Best-Effort-Rollback).
 *
 * Komplexitaet: brute-force 2^n Subsets ueber swappableShipments.
 * Bei n=8 → 256, n=12 → 4096, n=15 → 32768. Caller sollte n
 * begrenzen (z.B. nur eine Tour vs. eine andere Tour, nicht alle
 * Sendungen einer Region).
 */
import { computeStackingLdmMetrics } from './loadingLdm';
import { isOverdue } from './severity';

/**
 * Input-Shape fuer eine Sendung. Felder kommen aus dem
 * /nv-touren/:id/loading-Endpoint (nach F2.0-Erweiterung) +
 * customer.priority_tier (FV-Reuse).
 */
export interface SwapShipment {
  id: string;
  ldm?: number | null;
  isStackable?: boolean | null;
  /** Stamm-Kunden-Flag, BE-berechnet (siehe F2-Phase-0). */
  is_stamm_kunde?: boolean;
  loading_date?: string | null;
  status?: string | null;
  has_active_lock?: boolean | null;
  is_hazmat?: boolean;
  /** Globaler Customer-Tier (FV-Reuse — NV nutzt is_stamm_kunde). */
  customer_priority_tier?: string | null;
}

export interface SwapPlanOptions {
  /**
   * Customer-priority_tier-Werte die als FIX gelten. NV nutzt
   * is_stamm_kunde + laesst leer; FV setzt z.B. ['VIP','A'].
   */
  fixTiers?: string[];
}

export interface SwapPlan {
  /** IDs die in der Tour BLEIBEN (fixIds + ausgewaehlte swappable). */
  keepIds: string[];
  /** IDs die getauscht/entfernt werden (Caller-Sache wohin). */
  ejectIds: string[];
  /** IDs der unkuendbaren Fixe (Subset von keepIds). */
  fixIds: string[];
  /** Effektiv-ldm (fix + alle swappable) — Status vor dem Plan. */
  effLdmBefore: number;
  /** Effektiv-ldm (fix + bestes feasibles Subset) — Status nach Plan. */
  effLdmAfter: number;
  /** Trailer-Kapazitaet als Reference fuer UI-Banner. */
  maxLdm: number;
  /**
   * Sonderfall: schon die Fixe ueberlasten die Tour. Plan setzt
   * ejectIds=swappableIds (alle nicht-fix raus), effLdmAfter bleibt
   * > maxLdm — der Caller muss das Banner "Tour ist mit Fixen ueber-
   * laden — Stammkunden-Liste pruefen" anzeigen.
   */
  fixOverloaded?: boolean;
}

export interface FindSwapPlanInput {
  fixShipments: SwapShipment[];
  swappableShipments: SwapShipment[];
  maxLdm: number;
}

/**
 * FIX-Erkennung. NV: is_stamm_kunde / overdue / locked / hazmat.
 * FV: + Customer-Tier-Liste ueber opts.fixTiers.
 */
export function isFixSendung(
  s: SwapShipment,
  opts: SwapPlanOptions = {},
): boolean {
  if (s.is_stamm_kunde === true) return true;
  if (isOverdue(s.loading_date, s.status)) return true;
  if (s.has_active_lock === true) return true;
  if (s.is_hazmat === true) return true;
  const tiers = opts.fixTiers ?? [];
  if (
    tiers.length > 0 &&
    s.customer_priority_tier &&
    tiers.includes(s.customer_priority_tier)
  ) {
    return true;
  }
  return false;
}

/**
 * Effektive ldm eines Sendungs-Subsets. Eine Quelle der Wahrheit =
 * computeStackingLdmMetrics (= Beladeplan-Anzeige). maxLdm hier
 * nur fuer normalisierte Rueckgabe — die Funktion liefert nur
 * effectiveUsed, der Caller setzt die Kapazitaet getrennt.
 */
export function subsetEffectiveLdm(
  shipments: SwapShipment[],
  maxLdm: number,
): number {
  const m = computeStackingLdmMetrics(
    maxLdm > 0 ? maxLdm : 1,
    shipments.map((s) => ({
      ldm: s.ldm ?? null,
      isStackable: s.isStackable ?? null,
    })),
  );
  return m.effectiveUsed;
}

/**
 * Brute-force 2^n Subsets. Score: MAX effLdmAfter (Tour voll
 * ausnutzen). Tie-Break: MIN Ejects (so wenig wie moeglich raus).
 */
export function findSwapPlan(input: FindSwapPlanInput): SwapPlan | null {
  const { fixShipments, swappableShipments, maxLdm } = input;
  const fixIds = fixShipments.map((s) => s.id);
  const swappableIds = swappableShipments.map((s) => s.id);

  const effFix = subsetEffectiveLdm(fixShipments, maxLdm);
  const effBefore = subsetEffectiveLdm(
    [...fixShipments, ...swappableShipments],
    maxLdm,
  );

  // Kein Swap noetig — Tour ist bereits ≤ Kapazitaet.
  if (effBefore <= maxLdm + 1e-9) return null;

  // Sonderfall: Fixe allein ueberladen. Plan kommuniziert das
  // an den Caller (UI zeigt Banner), keine Crash.
  if (effFix > maxLdm + 1e-9) {
    return {
      keepIds: [...fixIds],
      ejectIds: [...swappableIds],
      fixIds,
      effLdmBefore: effBefore,
      effLdmAfter: effFix,
      maxLdm,
      fixOverloaded: true,
    };
  }

  // Brute-force ueber alle 2^n Subsets.
  const n = swappableShipments.length;
  let bestMask = 0; // {} ist garantiert feasible (effFix ≤ maxLdm).
  let bestEff = effFix;
  let bestEjectCount = n;
  for (let mask = 0; mask < 1 << n; mask++) {
    const subset: SwapShipment[] = [];
    let keptCount = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        subset.push(swappableShipments[i]);
        keptCount++;
      }
    }
    const eff = subsetEffectiveLdm([...fixShipments, ...subset], maxLdm);
    if (eff > maxLdm + 1e-9) continue;
    const ejectCount = n - keptCount;
    // Score: MAX eff, Tie-Break MIN ejects.
    if (
      eff > bestEff + 1e-9 ||
      (Math.abs(eff - bestEff) < 1e-9 && ejectCount < bestEjectCount)
    ) {
      bestEff = eff;
      bestEjectCount = ejectCount;
      bestMask = mask;
    }
  }

  const keepSwappable: string[] = [];
  const ejectSwappable: string[] = [];
  for (let i = 0; i < n; i++) {
    if (bestMask & (1 << i)) {
      keepSwappable.push(swappableShipments[i].id);
    } else {
      ejectSwappable.push(swappableShipments[i].id);
    }
  }

  return {
    keepIds: [...fixIds, ...keepSwappable],
    ejectIds: ejectSwappable,
    fixIds,
    effLdmBefore: effBefore,
    effLdmAfter: bestEff,
    maxLdm,
  };
}
