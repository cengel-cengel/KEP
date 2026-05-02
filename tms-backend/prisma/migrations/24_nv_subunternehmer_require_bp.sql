-- NV-1b-Korrektur: business_partner_id PFLICHT
-- Datei: prisma/migrations/24_nv_subunternehmer_require_bp.sql
--
-- Sicher + idempotent:
--  1) DELETE existierender Rows ohne BP (Carlos: aktuell nur ERKA-Seed)
--  2) ALTER COLUMN SET NOT NULL (no-op falls schon NOT NULL)
--  3) FK auf ON DELETE RESTRICT (verhindert versehentliches BP-Loeschen)

DO $$
DECLARE
  is_nullable_now TEXT;
BEGIN
  -- Schritt 1: Orphan-Rows raus (nur falls noch da)
  DELETE FROM nv_subunternehmer
  WHERE business_partner_id IS NULL;

  -- Schritt 2: NOT NULL setzen (idempotent durch Check)
  SELECT is_nullable INTO is_nullable_now
  FROM information_schema.columns
  WHERE table_name = 'nv_subunternehmer'
    AND column_name = 'business_partner_id';

  IF is_nullable_now = 'YES' THEN
    ALTER TABLE nv_subunternehmer
      ALTER COLUMN business_partner_id SET NOT NULL;
  END IF;
END $$;

-- Schritt 3: FK ON DELETE RESTRICT (idempotent: drop alten + neu anlegen,
-- nur falls aktueller FK nicht RESTRICT ist)
DO $$
DECLARE
  old_constraint_name TEXT;
  current_action      TEXT;
BEGIN
  SELECT tc.constraint_name, rc.delete_rule
    INTO old_constraint_name, current_action
  FROM information_schema.table_constraints tc
  JOIN information_schema.referential_constraints rc
    ON tc.constraint_name = rc.constraint_name
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'nv_subunternehmer'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'business_partner_id'
  LIMIT 1;

  IF old_constraint_name IS NOT NULL AND current_action <> 'RESTRICT' THEN
    EXECUTE format('ALTER TABLE nv_subunternehmer DROP CONSTRAINT %I',
                   old_constraint_name);
    ALTER TABLE nv_subunternehmer
      ADD CONSTRAINT nv_subunternehmer_business_partner_id_fkey
      FOREIGN KEY (business_partner_id)
      REFERENCES business_partners(id)
      ON DELETE RESTRICT;
  END IF;
END $$;
