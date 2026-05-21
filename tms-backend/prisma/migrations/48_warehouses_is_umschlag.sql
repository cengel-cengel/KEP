-- R3-B: warehouses.is_umschlag-Flag.
-- Charter-Umschlag-2-Touren-Flow (R2.1) wählt das Umschlag-Lager
-- explizit, statt nur default-WH als Fallback. Mehrere Umschlag-WHs
-- möglich (in Zukunft Region/PLZ-Filterung).
--
-- Idempotent via IF NOT EXISTS.

ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS is_umschlag BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_warehouses_is_umschlag
  ON warehouses (is_umschlag)
  WHERE is_umschlag = TRUE AND active = TRUE;
