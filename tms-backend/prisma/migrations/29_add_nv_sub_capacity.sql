-- NV-2f3: Kapazitaets-Felder fuer nv_subunternehmer
-- Datei: prisma/migrations/29_add_nv_sub_capacity.sql
--
-- Idempotent via ADD COLUMN IF NOT EXISTS.

ALTER TABLE nv_subunternehmer
  ADD COLUMN IF NOT EXISTS max_paletten   INTEGER,
  ADD COLUMN IF NOT EXISTS max_gewicht_kg INTEGER,
  ADD COLUMN IF NOT EXISTS max_volumen_m3 DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS max_ldm        DECIMAL(10,2);
