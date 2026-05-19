-- W-2: nv_tour_stops Timeline-Felder
-- Datei: prisma/migrations/38_nv_tour_stops_timeline.sql
--
-- Idempotent. NULL-default (Auto-Placer kann später setzen).

ALTER TABLE nv_tour_stops
  ADD COLUMN IF NOT EXISTS planned_arrival   TIMESTAMPTZ;

ALTER TABLE nv_tour_stops
  ADD COLUMN IF NOT EXISTS planned_departure TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_nv_tour_stops_planned_arrival
  ON nv_tour_stops (planned_arrival)
  WHERE planned_arrival IS NOT NULL;
