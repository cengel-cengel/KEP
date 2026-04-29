-- Default-Kostensätze für MAIN_CARRIAGE und ON_CARRIAGE (idempotent)

INSERT INTO cost_rates (rate_type, name, rate_per_100kg, min_charge, is_active, relation_id, subcontractor_id)
SELECT
  'MAIN_CARRIAGE',
  'Standard Hauptlauf',
  9.00,
  0,
  true,
  NULL,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM cost_rates
  WHERE rate_type = 'MAIN_CARRIAGE'
    AND name = 'Standard Hauptlauf'
    AND relation_id IS NULL
    AND subcontractor_id IS NULL
);

INSERT INTO cost_rates (rate_type, name, rate_per_100kg, min_charge, is_active, relation_id, subcontractor_id)
SELECT
  'ON_CARRIAGE',
  'Standard Nachlauf',
  25.00,
  0,
  true,
  NULL,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM cost_rates
  WHERE rate_type = 'ON_CARRIAGE'
    AND name = 'Standard Nachlauf'
    AND relation_id IS NULL
    AND subcontractor_id IS NULL
);

