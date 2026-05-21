-- Sprint Map-Routing: is_charter Flag auf NV + FV Touren.
-- Datei: prisma/migrations/46_tours_is_charter.sql
--
-- Charter-Touren haben keine Hub/Lager-Stops — Route geht direkt
-- vom 1. Stop (loading) zum letzten Stop (delivery).
-- Non-Charter NV: [WH → stops → WH]
-- Non-Charter FV: [hub_start ?? WH → stops → hub_end ?? WH]
-- Charter:        [firstLoading → stops → lastDelivery]

ALTER TABLE nv_touren
  ADD COLUMN IF NOT EXISTS is_charter BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS is_charter BOOLEAN NOT NULL DEFAULT false;
