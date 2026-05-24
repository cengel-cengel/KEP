/**
 * F2.1 + O-1 NV-Swap-Optimizer (Vol + Gewicht).
 *
 * Pure-Algorithmus. KEIN UI, KEIN BE-Call, KEIN placePackages.
 *
 * O-1-Umstellung (Carlos): Overload = Vol|Gewicht. Score = MAX
 *   Volumen-Auslastung (Laderaum fuellen). ldm ist als Metrik
 *   und Constraint RAUS — Volumen ist die natuerliche 3D-
 *   "alles-gestapelt"-Metrik und damit simpel summierbar.
 *
 * Schritte fuer Caller:
 *   1. Sendungen pro Tour holen + isFixSendung() → split in fix /
 *      swappable. Pro Sendung volumeM3 berechnen (Σ pkg-items
 *      length×width×height × quantity / 1e6).
 *   2. findSwapPlan({ fixShipments, swappableShipments,
 *                     maxVolM3, maxWeightKg }) →
 *      SwapPlan | null (mit Sonderfall-Signal fixOverloaded).
 *   3. SwapPlan im UI bestaetigen lassen + via batch-stops umsetzen
 *      (F2.2.b — atomarer Swap-Endpoint existiert NICHT).
 *
 * Komplexitaet: brute-force 2^n Subsets ueber swappableShipments.
 * Bei n=8 → 256, n=12 → 4096, n=15 → 32768. Caller sollte n
 * begrenzen.
 */
import { isOverdue } from './severity';

/**
 * Input-Shape fuer eine Sendung. Felder kommen aus dem
 * /nv-touren/:id/loading-Endpoint (nach F2.0-Erweiterung) +
 * customer.priority_tier (FV-Reuse).
 *
 * volumeM3 + weightKg sind die Optimizer-Metriken (O-1). ldm/
 * isStackable bleiben optional — Caller koennte sie fuer UI-
 * Anzeige (Eject-Liste) durchreichen, der Algorithmus liest sie
 * NICHT.
 */
export interface SwapShipment {
  id: string;
  volumeM3?: number | null;
  weightKg?: number | null;
  /** UI-only Pass-Through (Eject-Liste-Label etc.). */
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
  /** Vol/Gewicht (fix + alle swappable) — Status vor dem Plan. */
  volBefore: number;
  weightBefore: number;
  /** Vol/Gewicht (fix + bestes feasibles Subset) — Status nach Plan. */
  volAfter: number;
  weightAfter: number;
  /** Trailer-Kapazitaeten als Reference fuer UI-Banner. */
  maxVolM3: number;
  maxWeightKg: number;
  /**
   * Sonderfall: schon die Fixe ueberlasten die Tour (Vol oder
   * Gewicht). Plan setzt ejectIds=swappableIds (alle nicht-fix
   * raus), volAfter/weightAfter bleiben > Max — der Caller muss
   * das Banner "Tour ist mit Fixen ueberladen — Stammkunden-Liste
   * pruefen" anzeigen.
   */
  fixOverloaded?: boolean;
}

export interface FindSwapPlanInput {
  fixShipments: SwapShipment[];
  swappableShipments: SwapShipment[];
  maxVolM3: number;
  maxWeightKg: number;
}

/**
 * FIX-Erkennung. NV: is_stamm_kunde / overdue / locked / hazmat.
 * FV: + Customer-Tier-Liste ueber opts.fixTiers.
 * Metrik-unabhaengig — bei O-1 unveraendert.
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
 * Summe Volumen (m³) eines Sendungs-Subsets. Quelle ist
 * shipment.volumeM3 das im Caller-Adapter aus den package-items
 * (Σ l×w×h×qty / 1e6) berechnet wurde.
 */
export function subsetVolumeM3(shipments: SwapShipment[]): number {
  let v = 0;
  for (const s of shipments) {
    const x = Number(s.volumeM3 ?? 0);
    if (Number.isFinite(x) && x > 0) v += x;
  }
  return v;
}

/**
 * Summe Gewicht (kg) eines Sendungs-Subsets.
 */
export function subsetWeightKg(shipments: SwapShipment[]): number {
  let w = 0;
  for (const s of shipments) {
    const x = Number(s.weightKg ?? 0);
    if (Number.isFinite(x) && x > 0) w += x;
  }
  return w;
}

/**
 * Brute-force 2^n Subsets. Score: MAX subsetVolume (Laderaum
 * fuellen). Tie-Break: MIN Ejects (so wenig wie moeglich raus).
 */
export function findSwapPlan(input: FindSwapPlanInput): SwapPlan | null {
  const { fixShipments, swappableShipments, maxVolM3, maxWeightKg } = input;
  const fixIds = fixShipments.map((s) => s.id);
  const swappableIds = swappableShipments.map((s) => s.id);

  const volFix = subsetVolumeM3(fixShipments);
  const weightFix = subsetWeightKg(fixShipments);
  const volBefore = subsetVolumeM3([...fixShipments, ...swappableShipments]);
  const weightBefore = subsetWeightKg([
    ...fixShipments,
    ...swappableShipments,
  ]);

  // Kein Swap noetig — Tour ist bereits in beiden Achsen ≤ Kapazitaet.
  if (
    volBefore <= maxVolM3 + 1e-9 &&
    weightBefore <= maxWeightKg + 1e-9
  ) {
    return null;
  }

  // Sonderfall: Fixe allein ueberladen (Vol oder Gewicht).
  if (
    volFix > maxVolM3 + 1e-9 ||
    weightFix > maxWeightKg + 1e-9
  ) {
    return {
      keepIds: [...fixIds],
      ejectIds: [...swappableIds],
      fixIds,
      volBefore,
      weightBefore,
      volAfter: volFix,
      weightAfter: weightFix,
      maxVolM3,
      maxWeightKg,
      fixOverloaded: true,
    };
  }

  // Brute-force ueber alle 2^n Subsets.
  const n = swappableShipments.length;
  let bestMask = 0; // {} ist garantiert feasible (fix allein passt).
  let bestVol = volFix;
  let bestWeight = weightFix;
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
    const combined = [...fixShipments, ...subset];
    const v = subsetVolumeM3(combined);
    const w = subsetWeightKg(combined);
    if (v > maxVolM3 + 1e-9) continue;
    if (w > maxWeightKg + 1e-9) continue;
    const ejectCount = n - keptCount;
    // Score: MAX Volumen, Tie-Break MIN ejects.
    if (
      v > bestVol + 1e-9 ||
      (Math.abs(v - bestVol) < 1e-9 && ejectCount < bestEjectCount)
    ) {
      bestVol = v;
      bestWeight = w;
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
    volBefore,
    weightBefore,
    volAfter: bestVol,
    weightAfter: bestWeight,
    maxVolM3,
    maxWeightKg,
  };
}
