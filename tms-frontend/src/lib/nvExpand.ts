/**
 * NV-Expand-Step: aus NvLoadingDetail (tour.stops → shipment_package_items)
 * eine flache Liste von SharedPackage[] machen, die placePackages
 * (lib/loadingShared) erwartet.
 *
 * Macht KEIN Placement — nur Expand:
 *   · stops → ship_pkg_items → quantity-Klone
 *   · storedPos nur fuer q==0 (Phase-1-Honor); andere Klone bekommen
 *     null → von placePackages Phase 2 row-bin/stack-slot platziert
 *   · color via shipIdxMap (per-Sendung stabil)
 *   · isStackable per-Sendung (alle Items derselben Sendung muessen
 *     stackable=true sein, sonst Sendung gilt als non-stackable)
 *
 * Trennung Expand/Place hat 2 Gruende:
 *   1. EIN Pack-Algorithmus (placePackages, FV+NV gemeinsam) → kein
 *      Drift mehr zwischen den Modulen.
 *   2. NV gewinnt FIX 2 (Mischpaletten-Stack) + Phase-1-First aus
 *      placePackages ohne Duplizierung.
 */

import type { SharedPackage } from './loadingShared';

/**
 * Stabiler Farb-Pool (15 distinct Hex-Werte). Identisch zur
 * Vorgaenger-flattenPackages-Implementation, damit das 3D-Bild
 * fuer dieselbe Tour kontinuierlich aussieht.
 */
export const NV_SHIPMENT_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
] as const;

/**
 * Minimaler Strukturtyp, den nvExpandPackages braucht. NvLoadingDetail
 * (pages/NvLoadingPlanPage.tsx) erfuellt das strukturell, ohne dass
 * lib/ auf pages/ zugreifen muss.
 */
export interface NvExpandInput {
  stops?: Array<{
    shipment: {
      id: string;
      shipment_package_items?: Array<{
        id: string;
        quantity?: number | null;
        length_cm: number;
        width_cm: number;
        height_cm: number;
        weight_kg: string | number;
        stackable: boolean;
        pos_x_cm?: number | null;
        pos_y_cm?: number | null;
        pos_z_cm?: number | null;
        rotation_deg?: number | null;
      }>;
    };
  }>;
}

/**
 * Expand-Result. Erfuellt SharedPackage (fuer placePackages) +
 * Pass-Through-Felder, die LoadingPlan3D + Drag-Handler brauchen
 * (id, color, weightKg, rotationDeg, dbItemId, shipmentId).
 */
export interface NvExpandedPackage extends SharedPackage {
  /** Synth-ID oder DB-uuid des shipment_package_items. */
  id: string;
  /** Echte DB-uuid wenn dieser Klon q==0 ist; sonst undefined
   *  (synthetischer Quantity-Klon, NICHT individuell persistierbar). */
  dbItemId?: string;
  shipmentId: string;
  color: string;
  /** LP-1: 0/90-Y-Rotation, aus DB-Spalte rotation_deg. */
  rotationDeg: number;
}

/**
 * Pure Expand. Output ist Eingabe fuer placePackages — Positionen
 * werden dort gesetzt.
 */
export function nvExpandPackages(
  tour: NvExpandInput | null,
): NvExpandedPackage[] {
  if (!tour) return [];
  const out: NvExpandedPackage[] = [];

  // shipIdxMap stabilisiert Farbe per Sendung (NV hat 1:1 stop:ship,
  // aber Pattern alignt mit FV-LoadingPlanPage-Konvention).
  const shipIdxMap = new Map<string, number>();
  for (const stop of tour.stops ?? []) {
    if (!shipIdxMap.has(stop.shipment.id)) {
      shipIdxMap.set(stop.shipment.id, shipIdxMap.size);
    }
  }

  for (const stop of tour.stops ?? []) {
    const ship = stop.shipment;
    const color =
      NV_SHIPMENT_COLORS[
        (shipIdxMap.get(ship.id) ?? 0) % NV_SHIPMENT_COLORS.length
      ];
    const items = ship.shipment_package_items ?? [];
    // Sendung gilt als stapelbar, wenn ALLE ihre Pakete stackable
    // sind (Carlos-Regel: Misch-Sendungen brechen die Stack-Faehigkeit).
    const shipFullyStackable = items.every((it) => it.stackable !== false);

    for (const it of items) {
      const qty = Math.max(1, Number(it.quantity ?? 1));
      const lengthCm = Number(it.length_cm) || 0;
      const widthCm = Number(it.width_cm) || 0;
      const heightCm = Number(it.height_cm) || 0;
      const weightKg = Number(it.weight_kg) || 0;
      const dbPosX = it.pos_x_cm == null ? null : Number(it.pos_x_cm);
      const dbPosY = it.pos_y_cm == null ? null : Number(it.pos_y_cm);
      const dbPosZ = it.pos_z_cm == null ? null : Number(it.pos_z_cm);
      const hasDbPos = dbPosX != null && dbPosY != null;
      const rotationDeg = Number(it.rotation_deg ?? 0) || 0;
      const isStackable = shipFullyStackable && it.stackable !== false;

      for (let q = 0; q < qty; q++) {
        const isFirst = q === 0;
        // Synth-ID nur fuer Quantity-Klone > 0; bestehender Pattern
        // ":pkg:N" bleibt, damit URL-Parameter / Logs unveraendert.
        const id = qty === 1 ? it.id : `${it.id}:pkg:${q}`;
        out.push({
          id,
          // Nur erster Klon persistierbar (BE-Schema hat 1 Row pro
          // line_index). Andere Klone tragen kein dbItemId →
          // Drag-Handler skippen sie beim Persist.
          dbItemId: isFirst ? it.id : undefined,
          shipmentId: ship.id,
          lengthCm,
          widthCm,
          heightCm,
          weightKg,
          isStackable,
          color,
          rotationDeg,
          // storedPos NUR fuer q==0 (= echte DB-Position der line_index-
          // Row). Andere Klone bekommen null → placePackages Phase 2
          // platziert sie automatisch row-bin oder im Stack-Slot.
          storedPosX: isFirst && hasDbPos ? (dbPosX as number) : null,
          storedPosY: isFirst && hasDbPos ? (dbPosY as number) : null,
          storedPosZ:
            isFirst && hasDbPos ? (dbPosZ != null ? dbPosZ : 0) : null,
        });
      }
    }
  }
  return out;
}
