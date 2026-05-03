-- NV-4 Korrektur: Kosten-Modus pro Tour
-- Datei: prisma/migrations/26_add_nv_touren_kosten_modus.sql
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CHECK konditional.

ALTER TABLE nv_touren
  ADD COLUMN IF NOT EXISTS kosten_modus VARCHAR(20) NOT NULL DEFAULT 'TARIF';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'nv_touren'
      AND constraint_name = 'nv_touren_kosten_modus_check'
  ) THEN
    ALTER TABLE nv_touren
      ADD CONSTRAINT nv_touren_kosten_modus_check
      CHECK (kosten_modus IN ('TARIF', 'SPOT'));
  END IF;
END $$;
