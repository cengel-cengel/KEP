-- NV-2i0: Lager-Stammdaten
-- Datei: prisma/migrations/31_add_warehouses.sql
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS warehouses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  street      VARCHAR(255),
  zip         VARCHAR(20),
  city        VARCHAR(255),
  country     CHAR(2) NOT NULL DEFAULT 'DE',
  lat         DECIMAL(10,7),
  lng         DECIMAL(10,7),
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS warehouses_one_default
  ON warehouses (is_default) WHERE is_default = TRUE;

CREATE INDEX IF NOT EXISTS warehouses_active_idx
  ON warehouses (active);

DROP TRIGGER IF EXISTS warehouses_set_updated_at ON warehouses;
CREATE TRIGGER warehouses_set_updated_at
  BEFORE UPDATE ON warehouses
  FOR EACH ROW EXECUTE FUNCTION trg_nv_set_updated_at();

INSERT INTO warehouses (name, street, zip, city, country, is_default)
SELECT 'Hauptumschlag Stuttgart', 'Motorstr. 8', '70499', 'Stuttgart', 'DE', TRUE
WHERE NOT EXISTS (SELECT 1 FROM warehouses WHERE is_default = TRUE);
