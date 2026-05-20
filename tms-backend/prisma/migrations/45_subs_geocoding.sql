-- Sprint D: Sub-Umkreissuche
-- Datei: prisma/migrations/45_subs_geocoding.sql
--
-- Geocoding-Felder auf beide Sub-Tabellen (NV + FV).
-- lat/lng als nullable (geocoded_at=NULL bedeutet noch nicht geocoded).
-- Index nur auf geocoded rows (partial index für haversine-Filter).

ALTER TABLE nv_subunternehmer
  ADD COLUMN IF NOT EXISTS lat DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS lng DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_nv_subunternehmer_geocoded
  ON nv_subunternehmer (lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

ALTER TABLE subcontractors
  ADD COLUMN IF NOT EXISTS lat DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS lng DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_subcontractors_geocoded
  ON subcontractors (lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;
