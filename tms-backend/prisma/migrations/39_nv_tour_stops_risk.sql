-- T-3.1: nv_tour_stops Risk-Persistence
-- Datei: prisma/migrations/39_nv_tour_stops_risk.sql
--
-- Idempotent. NULL = nicht computed (Legacy-Touren).

ALTER TABLE nv_tour_stops
  ADD COLUMN IF NOT EXISTS risk_score    INT;

ALTER TABLE nv_tour_stops
  ADD COLUMN IF NOT EXISTS risk_severity VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_nv_tour_stops_risk_severity
  ON nv_tour_stops (risk_severity)
  WHERE risk_severity IS NOT NULL;
