-- M-1: Customer-Tier (VIP / A / B / C)
-- Datei: prisma/migrations/41_customers_priority_tier.sql
--
-- VARCHAR(4) + CHECK-Constraint (kein ENUM für leichte Erweiterung).
-- NULL = nicht klassifiziert. Index nur auf gesetzte Tiers.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS priority_tier VARCHAR(4);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'customers'
      AND constraint_name = 'customers_priority_tier_check'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_priority_tier_check
      CHECK (priority_tier IS NULL OR priority_tier IN ('VIP','A','B','C'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_customers_priority_tier
  ON customers (priority_tier)
  WHERE priority_tier IS NOT NULL;
