-- NV-2i17e: Polyline-Geometry Persist
-- Datei: prisma/migrations/35_add_polyline_geometry.sql
--
-- Idempotent. JSONB nullable.
-- Backend optimize schreibt GeoJSON LineString,
-- Frontend rendert ohne OSRM-Fetch.

ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS polyline_geometry JSONB;

ALTER TABLE nv_touren
  ADD COLUMN IF NOT EXISTS polyline_geometry JSONB;
