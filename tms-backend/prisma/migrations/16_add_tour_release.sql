-- Sprint 10: Tourfreigabe + Abfertigung (released/closed)
-- Datei: prisma/migrations/add_tour_release.sql
-- Hinweis:
-- - Diese Datei ist ein SQL-Migrationsskript (manuell ausführbar)
-- - Anschließend bitte: npx prisma generate

-- 1) Neue Timestamp-Spalten
ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;

ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- 2) Tour-Status Enum erweitern
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'tour_status' AND e.enumlabel = 'released'
  ) THEN
    ALTER TYPE tour_status ADD VALUE 'released';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'tour_status' AND e.enumlabel = 'closed'
  ) THEN
    ALTER TYPE tour_status ADD VALUE 'closed';
  END IF;
END
$$;

