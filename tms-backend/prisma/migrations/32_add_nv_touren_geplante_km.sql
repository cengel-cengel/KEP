-- NV-2j: Tour-KM cached
-- Datei: prisma/migrations/32_add_nv_touren_geplante_km.sql
--
-- Idempotent.

ALTER TABLE nv_touren
  ADD COLUMN IF NOT EXISTS geplante_km        DECIMAL(10,2);

ALTER TABLE nv_touren
  ADD COLUMN IF NOT EXISTS km_calculated_at   TIMESTAMPTZ;
