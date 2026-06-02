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
        /** H4: Per-Palette-Positionen aus BE (H2 liefert das Array
         *  mit Fallback auf legacy pos_*-Spalten als pIdx=0). */
        positions?: Array<{
          paletteIndex: number;
          posXCm: number | null;
          posYCm: number | null;
          posZCm: number | null;
          rotationDeg: number;
        }>;
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
  /** H5a: DB-uuid des shipment_package_items (= line_index-Row).
   *  Vorher nur fuer q===0 gesetzt; jetzt fuer ALLE Klone — sie
   *  teilen sich dieselbe item-Row und unterscheiden sich nur
   *  durch paletteIndex (siehe shipment_package_item_positions). */
  dbItemId?: string;
  /** H5a: 0..quantity-1. Adressiert die per-Palette-Position in
   *  shipment_package_item_positions. q===0 → paletteIndex===0
   *  (= alte pos_*-Spalten via Legacy-Sync H3). */
  paletteIndex: number;
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
      // H4: Legacy-Fallback fuer item ohne positions[] (alter BE-
      // Stand). Wir bauen ein synthetisches pIdx=0-Entry aus den
      // alten pos_*-Spalten, damit der per-Klon-Loop unten den
      // gleichen Pfad nimmt.
      const legacyHasPos = it.pos_x_cm != null && it.pos_y_cm != null;
      const legacyRotation = Number(it.rotation_deg ?? 0) || 0;
      const positionsRaw = Array.isArray(it.positions)
        ? it.positions
        : legacyHasPos
          ? [
              {
                paletteIndex: 0,
                posXCm: Number(it.pos_x_cm),
                posYCm: Number(it.pos_y_cm),
                posZCm: it.pos_z_cm != null ? Number(it.pos_z_cm) : 0,
                rotationDeg: legacyRotation,
              },
            ]
          : [];
      const isStackable = shipFullyStackable && it.stackable !== false;

      for (let q = 0; q < qty; q++) {
        // Synth-ID nur fuer Quantity-Klone > 0; bestehender Pattern
        // ":pkg:N" bleibt, damit URL-Parameter / Logs unveraendert.
        const id = qty === 1 ? it.id : `${it.id}:pkg:${q}`;
        // H4: Per-Klon storedPos via positions.find(paletteIndex===q).
        // KEIN Index-Lookup [q] — robust gegen Luecken/Reihenfolge.
        // Kein Eintrag → null → placePackages Phase 2 (Auto-Placer).
        // Rotation: Klon-spezifisch wenn positions-Eintrag vorhanden,
        // sonst Legacy-Rotation (Item-Level).
        const klonPos = positionsRaw.find((p) => p.paletteIndex === q);
        const klonHasPos =
          !!klonPos && klonPos.posXCm != null && klonPos.posYCm != null;
        out.push({
          id,
          // H5a: dbItemId fuer ALLE Klone (line_index-Row-Id). Klone
          // adressieren ihre eigene Position via (dbItemId, paletteIndex).
          // q===0 schreibt zusaetzlich die Legacy-Spalten via H3-Sync;
          // q>=1 schreibt nur in shipment_package_item_positions.
          dbItemId: it.id,
          paletteIndex: q,
          shipmentId: ship.id,
          lengthCm,
          widthCm,
          heightCm,
          weightKg,
          isStackable,
          color,
          rotationDeg:
            klonPos != null ? klonPos.rotationDeg : legacyRotation,
          storedPosX: klonHasPos ? (klonPos!.posXCm as number) : null,
          storedPosY: klonHasPos ? (klonPos!.posYCm as number) : null,
          storedPosZ:
            klonHasPos
              ? klonPos!.posZCm != null
                ? klonPos!.posZCm
                : 0
              : null,
        });
      }
    }
  }
  return out;
}
