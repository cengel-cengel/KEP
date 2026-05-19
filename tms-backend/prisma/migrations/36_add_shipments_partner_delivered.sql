-- B-1: shipments.partner_delivered Flag
-- Datei: prisma/migrations/36_add_shipments_partner_delivered.sql
--
-- Idempotent. Default false. Conditional Index (WHERE = true)
-- weil typischerweise <10% der Sendungen partner-delivered sind.

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS partner_delivered BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_shipments_partner_delivered
  ON shipments (partner_delivered)
  WHERE partner_delivered = true;

COMMENT ON COLUMN shipments.partner_delivered IS
  'Sendung wurde durch externen Partner zum Hub vorgeholt (kein eigener NV-Lauf).';
