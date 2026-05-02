-- NV-1b: Nahverkehrs-Subunternehmer
-- Datei: prisma/migrations/21_add_nv_subunternehmer.sql
--
-- Idempotent via IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS nv_subunternehmer (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        VARCHAR(200) NOT NULL,
  nv_tour_gebiet_id           UUID REFERENCES nv_tour_gebiete(id) ON DELETE SET NULL,
  business_partner_id         UUID REFERENCES business_partners(id) ON DELETE SET NULL,
  tarif_typ                   VARCHAR(20) NOT NULL DEFAULT 'TAGESPAUSCHALE',
  tarif_pro_stop_eur          DECIMAL(10,2),
  tarif_tagespauschale_eur    DECIMAL(10,2),
  fahrzeug_typ                VARCHAR(20),
  notiz                       TEXT,
  aktiv                       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nv_subunternehmer_tour_gebiet
  ON nv_subunternehmer (nv_tour_gebiet_id);

CREATE INDEX IF NOT EXISTS idx_nv_subunternehmer_bp
  ON nv_subunternehmer (business_partner_id);

DROP TRIGGER IF EXISTS nv_subunternehmer_set_updated_at ON nv_subunternehmer;
CREATE TRIGGER nv_subunternehmer_set_updated_at
  BEFORE UPDATE ON nv_subunternehmer
  FOR EACH ROW EXECUTE FUNCTION trg_nv_set_updated_at();
