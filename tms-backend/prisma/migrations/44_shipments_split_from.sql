-- C-2: Audit-Trail für Sendung-Splitten
-- Datei: prisma/migrations/44_shipments_split_from.sql
--
-- Wenn shipment via Sendung-Splitten-Feature entstanden ist,
-- speichert split_from_id die UUID der ursprünglichen Sendung
-- (für Invoicing-Audit + Trace-Back).
--
-- NULL = Original-Sendung (nie gesplittet entstanden).

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS split_from_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'shipments'
      AND constraint_name = 'shipments_split_from_fk'
  ) THEN
    ALTER TABLE shipments
      ADD CONSTRAINT shipments_split_from_fk
      FOREIGN KEY (split_from_id) REFERENCES shipments(id)
      ON DELETE SET NULL
      ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shipments_split_from
  ON shipments (split_from_id)
  WHERE split_from_id IS NOT NULL;
