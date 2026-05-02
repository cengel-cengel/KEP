-- NV-1c: Stamm-Touren pro Tour-Gebiet
-- Datei: prisma/migrations/22_add_nv_stamm_touren.sql
--
-- Idempotent via IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS nv_stamm_touren (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                        VARCHAR(40) NOT NULL UNIQUE,
  name                        VARCHAR(120) NOT NULL,
  nv_tour_gebiet_id           UUID NOT NULL REFERENCES nv_tour_gebiete(id) ON DELETE CASCADE,
  default_subunternehmer_id   UUID REFERENCES nv_subunternehmer(id) ON DELETE SET NULL,
  wochentage                  TEXT[] NOT NULL DEFAULT '{}',
  start_zeit                  TIME,
  fahrzeug_typ                VARCHAR(20),
  aktiv                       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nv_stamm_touren_tour_gebiet
  ON nv_stamm_touren (nv_tour_gebiet_id);

CREATE INDEX IF NOT EXISTS idx_nv_stamm_touren_sub
  ON nv_stamm_touren (default_subunternehmer_id);

DROP TRIGGER IF EXISTS nv_stamm_touren_set_updated_at ON nv_stamm_touren;
CREATE TRIGGER nv_stamm_touren_set_updated_at
  BEFORE UPDATE ON nv_stamm_touren
  FOR EACH ROW EXECUTE FUNCTION trg_nv_set_updated_at();
