-- Sprint C: Stop-Status Enum-Erweiterung um EN_ROUTE
-- Datei: prisma/migrations/42_nv_tour_stops_status_enroute.sql
--
-- Hintergrund: stop_status (UI driver-progress) wird auf die
-- existierende 'status'-Spalte gemappt (decision GO ALL DEFAULTS 1A).
-- Neuer Zwischen-Wert EN_ROUTE für "UNTERWEGS" (zwischen PLANNED
-- und ARRIVED).
--
-- DE-Mapping FE-side:
--   PLANNED       → OFFEN
--   EN_ROUTE      → UNTERWEGS  (NEW)
--   ARRIVED       → ANGEKOMMEN
--   COMPLETED     → ABGESCHLOSSEN
--   FAILED        → AUSGEFALLEN
--   SKIPPED       → (ausgeblendet, legacy)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'nv_tour_stops'
      AND constraint_name = 'nv_tour_stops_status_check'
  ) THEN
    ALTER TABLE nv_tour_stops
      DROP CONSTRAINT nv_tour_stops_status_check;
  END IF;
END $$;

ALTER TABLE nv_tour_stops
  ADD CONSTRAINT nv_tour_stops_status_check
  CHECK (status IN
    ('PLANNED','EN_ROUTE','ARRIVED','COMPLETED','FAILED','SKIPPED')
  );
