-- LKM-based cost calculation: customer stacking model fields
ALTER TABLE business_partners
  ADD COLUMN IF NOT EXISTS stacking_factor DECIMAL(5, 2);

ALTER TABLE business_partners
  ADD COLUMN IF NOT EXISTS avg_weight_per_stellplatz DECIMAL(10, 2);

