-- Sprint H1 — Per-Palette-Persistenz: additive Tabelle.
-- Datei: prisma/migrations/51_shipment_package_item_positions.sql
--
-- Heute hat shipment_package_items genau EINE Position pro Row
-- (pos_x_cm/pos_y_cm/pos_z_cm/rotation_deg). Bei quantity > 1
-- teilen sich alle Klone (synth-Klone q>0 im FE) diese Position
-- → einzelne Paletten EINER Sendung koennen NICHT vorn/hinten
-- verteilt werden.
--
-- Diese Tabelle haelt PRO PALETTE eine eigene Position. item_id +
-- palette_index identifizieren eindeutig. Bestand bleibt UNBE-
-- RUEHRT: alte pos_*-Spalten auf shipment_package_items bleiben
-- als Fallback fuer palette_index=0 (siehe H2 Read-Layer mit
-- Fallback-Logik).
--
-- KEIN Backfill in dieser Migration — H6 optional.
-- KEIN Code-Reader/-Writer in H1 (Schema-only).
-- Idempotent via IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS shipment_package_item_positions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       UUID NOT NULL,
  palette_index INTEGER NOT NULL,
  pos_x_cm      INTEGER,
  pos_y_cm      INTEGER,
  pos_z_cm      INTEGER,
  rotation_deg  INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_shipment_package_item_positions_item
    FOREIGN KEY (item_id) REFERENCES shipment_package_items (id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT uq_shipment_package_item_positions_item_palette
    UNIQUE (item_id, palette_index)
);

CREATE INDEX IF NOT EXISTS idx_shipment_package_item_positions_item
  ON shipment_package_item_positions (item_id);
