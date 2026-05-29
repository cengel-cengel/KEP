-- Hof-Filter Stufe 1 (E1): Depot-PLZ an hall_locations.
-- Datei: prisma/migrations/50_hall_locations_zip.sql
--
-- Stammdaten-Anker fuer FV-Sammelgut-Pool-Filter: Sendung →
-- relation.default_hall_location.zip → PLZ-Praefix-Cluster.
-- Vorher: hall_locations hatte nur code/description/type/zone —
-- KEINE Adresse/Geo-Info. Damit Carlos's Depots fuer den Pool-
-- Endpoint als Geo-Anker dienen koennen, brauchen sie eine PLZ.
--
-- country_code: PLZ-Cluster ohne Land ist mehrdeutig (DE-70xxx vs
-- AT-70xx). Nullable + Default 'DE' bleibt rueckwaerts-kompatibel.
-- (hall_locations.zone existiert, ist aber kein ISO-Country.)
--
-- Idempotent via IF NOT EXISTS.

ALTER TABLE hall_locations
  ADD COLUMN IF NOT EXISTS zip          VARCHAR(10),
  ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) DEFAULT 'DE';

CREATE INDEX IF NOT EXISTS idx_hall_locations_zip
  ON hall_locations (zip)
  WHERE zip IS NOT NULL;
