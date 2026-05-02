-- NV-1d: Stamm-Kunden pro Stamm-Tour
-- Datei: prisma/migrations/23_add_nv_stamm_kunden.sql
--
-- Idempotent via IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS nv_stamm_kunden (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nv_stamm_tour_id            UUID NOT NULL REFERENCES nv_stamm_touren(id) ON DELETE CASCADE,
  customer_id                 UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  standard_position           INTEGER NOT NULL DEFAULT 0,
  standard_servicezeit_min    INTEGER,
  routing_klasse              VARCHAR(30),
  notizen                     TEXT,
  aktiv                       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT nv_stamm_kunden_unique UNIQUE (nv_stamm_tour_id, customer_id),
  CONSTRAINT nv_stamm_kunden_routing_check CHECK (
    routing_klasse IS NULL OR routing_klasse IN
      ('STAMMROUTE','KLEINER_SCHLENKER','MITTLERER_UMWEG','SEPARATER_TOURAST')
  )
);

CREATE INDEX IF NOT EXISTS idx_nv_stamm_kunden_tour
  ON nv_stamm_kunden (nv_stamm_tour_id, standard_position);

CREATE INDEX IF NOT EXISTS idx_nv_stamm_kunden_customer
  ON nv_stamm_kunden (customer_id);

DROP TRIGGER IF EXISTS nv_stamm_kunden_set_updated_at ON nv_stamm_kunden;
CREATE TRIGGER nv_stamm_kunden_set_updated_at
  BEFORE UPDATE ON nv_stamm_kunden
  FOR EACH ROW EXECUTE FUNCTION trg_nv_set_updated_at();
