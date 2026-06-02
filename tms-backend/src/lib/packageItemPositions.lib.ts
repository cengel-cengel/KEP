/**
 * Sprint H2 — per-Palette-Position Read-Layer.
 *
 * Heute liegt eine Position pro shipment_package_items-Row (alte
 * Spalten pos_x_cm/y/z/rotation_deg). Mit H1 ist die Tabelle
 * shipment_package_item_positions hinzugekommen — eine Row pro
 * Palette einer Sendung (item_id × palette_index 0..quantity-1).
 *
 * Diese Lib normalisiert das Lese-Mapping fuer Konsumenten
 * (FV loading.service.toShipmentLoad, NV getLoadingDetail):
 *
 * - Wenn das item bereits per-Palette-Eintraege hat (rows.length>0)
 *   → 1 PositionEntry pro Row, sortiert nach palette_index.
 * - Sonst (Bestand, kein H4-FE-Write noch) → 1 virtueller
 *   PositionEntry mit palette_index=0 aus den legacy pos_*-Spalten.
 *
 * Das Ergebnis-Array ist NIE leer — Konsumenten koennen immer
 * positions[0] sicher lesen. Bei quantity>1 ohne per-Palette-
 * Persist bleibt das Array {paletteIndex:0,...}; H4 expandiert
 * dann FE-side auf die einzelnen Klone (q==0 nutzt positions[0],
 * q>=1 weiterhin Auto-Placer bis erste per-Palette-PATCH erfolgt).
 */

/** Roh-Row aus shipment_package_item_positions (Prisma-snake_case). */
export interface PositionRowFromDb {
  palette_index: number;
  pos_x_cm: number | null;
  pos_y_cm: number | null;
  pos_z_cm: number | null;
  rotation_deg: number;
}

/** Legacy-pos_*-Felder am shipment_package_items-Row. */
export interface ItemLegacyPos {
  pos_x_cm: number | null;
  pos_y_cm: number | null;
  pos_z_cm: number | null;
  rotation_deg: number;
}

/** API-Output: camelCase, sortiert. */
export interface PositionEntry {
  paletteIndex: number;
  posXCm: number | null;
  posYCm: number | null;
  posZCm: number | null;
  rotationDeg: number;
}

/**
 * H2 Fallback-Mapping. rows aus shipment_package_item_positions,
 * legacy aus shipment_package_items. Liefert nie ein leeres Array.
 */
export function buildPositionsArray(
  rows: PositionRowFromDb[] | undefined | null,
  legacy: ItemLegacyPos,
): PositionEntry[] {
  if (rows && rows.length > 0) {
    return rows
      .map((r) => ({
        paletteIndex: Number(r.palette_index) || 0,
        posXCm: r.pos_x_cm == null ? null : Number(r.pos_x_cm),
        posYCm: r.pos_y_cm == null ? null : Number(r.pos_y_cm),
        posZCm: r.pos_z_cm == null ? null : Number(r.pos_z_cm),
        rotationDeg: Number(r.rotation_deg) || 0,
      }))
      .sort((a, b) => a.paletteIndex - b.paletteIndex);
  }
  return [
    {
      paletteIndex: 0,
      posXCm: legacy.pos_x_cm == null ? null : Number(legacy.pos_x_cm),
      posYCm: legacy.pos_y_cm == null ? null : Number(legacy.pos_y_cm),
      posZCm: legacy.pos_z_cm == null ? null : Number(legacy.pos_z_cm),
      rotationDeg: Number(legacy.rotation_deg) || 0,
    },
  ];
}
