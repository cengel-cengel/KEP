-- Sprint Phase E3a: Per-Paket Position-Persistenz
-- Datei: prisma/migrations/19_add_package_positions.sql
--
-- Speichert die manuell gedraggten Positionen pro Paket
-- aus dem 3D-Beladeplan. Wenn alle drei pos_* fuer ein
-- Paket NULL sind, faellt das UI auf den Auto-Placer zurueck.

ALTER TABLE shipment_package_items
  ADD COLUMN IF NOT EXISTS pos_x_cm INT,
  ADD COLUMN IF NOT EXISTS pos_y_cm INT,
  ADD COLUMN IF NOT EXISTS pos_z_cm INT,
  ADD COLUMN IF NOT EXISTS rotation_deg INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_shipment_package_items_positioned
  ON shipment_package_items (shipment_id)
  WHERE pos_x_cm IS NOT NULL;
