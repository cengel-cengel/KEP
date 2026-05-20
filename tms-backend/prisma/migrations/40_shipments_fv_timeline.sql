-- W-2.1: shipments FV-Timeline-Felder
-- Datei: prisma/migrations/40_shipments_fv_timeline.sql
--
-- shipment-level _fv-Suffix da Sendung in beiden Modes (NV+FV)
-- leben kann ohne Field-Collision. NULL = nicht computed.

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS planned_arrival_fv   TIMESTAMPTZ;

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS planned_departure_fv TIMESTAMPTZ;

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS risk_score_fv        INT;

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS risk_severity_fv     VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_shipments_risk_severity_fv
  ON shipments (risk_severity_fv)
  WHERE risk_severity_fv IS NOT NULL;
