-- Sprint H6 — Backfill der Legacy-pos_*-Spalten in
-- shipment_package_item_positions (palette_index=0).
-- Datei: prisma/migrations/52_backfill_positions.sql
--
-- Hintergrund (H1-H5b ausgerollt):
--   H1 hat die Tabelle shipment_package_item_positions additiv
--   angelegt; H2 liest mit Fallback auf die alten pos_*-Spalten
--   wenn fuer ein Item kein positions-Row existiert; H3/H5a/H5b
--   schreiben jetzt produktiv mit paletteIndex. Solange die Tabelle
--   leer ist, traegt der Fallback — Phase 2 (alte Spalten droppen)
--   ist aber nur moeglich, wenn die paletteIndex=0-Reihen aus der
--   Tabelle kommen. Dieser Backfill stellt das her.
--
-- Eigenschaften:
--   · ADDITIV — kein DROP/ALTER auf shipment_package_items.
--   · IDEMPOTENT — ON CONFLICT (item_id, palette_index) DO NOTHING.
--     Seit H3-Deploy haben User-Drags pIdx=0-Rows angelegt; die
--     bleiben unangetastet (sind die aktuelleren Werte). Backfill
--     fuellt nur Items OHNE existierende pIdx=0-Reihe.
--   · REVERSIBEL — Reader-Output unveraendert: vor Backfill kam
--     pIdx=0 via H2-Fallback aus pos_*; nach Backfill aus der
--     Tabelle. Gleiche Werte.
--   · KEIN CODE-CHANGE — Reader bleibt mit Fallback (H2). Phase 2
--     (Fallback raus + Spalten droppen) ist eigener Sprint.

INSERT INTO shipment_package_item_positions (
  item_id,
  palette_index,
  pos_x_cm,
  pos_y_cm,
  pos_z_cm,
  rotation_deg
)
SELECT
  id,
  0,
  pos_x_cm,
  pos_y_cm,
  pos_z_cm,
  COALESCE(rotation_deg, 0)
FROM shipment_package_items
WHERE pos_x_cm IS NOT NULL
   OR pos_y_cm IS NOT NULL
   OR pos_z_cm IS NOT NULL
ON CONFLICT (item_id, palette_index) DO NOTHING;
