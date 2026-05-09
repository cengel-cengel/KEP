-- FV-1: Tours Hub-Coords + KM-Cache
-- Datei: prisma/migrations/34_add_tours_geplante_km_hub.sql
--
-- Idempotent.

ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS geplante_km DECIMAL(8, 2);

ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS km_calculated_at TIMESTAMPTZ;

ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS hub_start_address_id UUID;

ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS hub_end_address_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tours_hub_start_address_fk'
  ) THEN
    ALTER TABLE tours
      ADD CONSTRAINT tours_hub_start_address_fk
      FOREIGN KEY (hub_start_address_id)
      REFERENCES addresses(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tours_hub_end_address_fk'
  ) THEN
    ALTER TABLE tours
      ADD CONSTRAINT tours_hub_end_address_fk
      FOREIGN KEY (hub_end_address_id)
      REFERENCES addresses(id) ON DELETE SET NULL;
  END IF;
END $$;
