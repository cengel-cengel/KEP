-- NV-1a: Nahverkehrs-Foundation (Gebiet + Tour-Gebiete)
-- Datei: prisma/migrations/20_add_nv_gebiete.sql
--
-- Idempotent via IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS nv_gebiete (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(40) NOT NULL UNIQUE,
  name        VARCHAR(120) NOT NULL,
  plz_ranges  JSONB,
  gebiet_typ  VARCHAR(20) NOT NULL DEFAULT 'STANDARD',
  aktiv       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nv_tour_gebiete (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nv_gebiet_id    UUID NOT NULL REFERENCES nv_gebiete(id) ON DELETE CASCADE,
  code            VARCHAR(40) NOT NULL UNIQUE,
  name            VARCHAR(120) NOT NULL,
  plz_pattern     JSONB,
  relation_id     UUID REFERENCES relations(id) ON DELETE SET NULL,
  farbe           VARCHAR(9),
  aktiv           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nv_tour_gebiete_gebiet
  ON nv_tour_gebiete (nv_gebiet_id);

CREATE INDEX IF NOT EXISTS idx_nv_tour_gebiete_relation
  ON nv_tour_gebiete (relation_id);

-- Trigger fuer updated_at (idempotent: drop+recreate)
CREATE OR REPLACE FUNCTION trg_nv_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nv_gebiete_set_updated_at ON nv_gebiete;
CREATE TRIGGER nv_gebiete_set_updated_at
  BEFORE UPDATE ON nv_gebiete
  FOR EACH ROW EXECUTE FUNCTION trg_nv_set_updated_at();

DROP TRIGGER IF EXISTS nv_tour_gebiete_set_updated_at ON nv_tour_gebiete;
CREATE TRIGGER nv_tour_gebiete_set_updated_at
  BEFORE UPDATE ON nv_tour_gebiete
  FOR EACH ROW EXECUTE FUNCTION trg_nv_set_updated_at();
