-- NV-4 Erweiterung: 4 Tarif-Typen + Tour KM/Stunden
-- Datei: prisma/migrations/27_extend_tarif_typen.sql
--
-- Idempotent.

ALTER TABLE nv_subunternehmer
  ADD COLUMN IF NOT EXISTS tarif_pro_km_eur       DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS tarif_grundgebuehr_eur DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS tarif_pro_stunde_eur   DECIMAL(10,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'nv_subunternehmer'
      AND constraint_name = 'nv_subunternehmer_tarif_typ_check'
  ) THEN
    ALTER TABLE nv_subunternehmer
      ADD CONSTRAINT nv_subunternehmer_tarif_typ_check
      CHECK (tarif_typ IN
        ('TAGESPAUSCHALE','PRO_STOP','KM_BASIERT','STUNDEN_BASIERT','SPOT'));
  END IF;
END $$;

ALTER TABLE nv_touren
  ADD COLUMN IF NOT EXISTS angefahrene_km     DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS stunden_geleistet  DECIMAL(10,2);
