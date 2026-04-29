-- Optional Stammdaten-Partner auf Sendung; customer_id kann NULL sein wenn nur business_partner_id gesetzt ist
ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS business_partner_id UUID;

ALTER TABLE shipments
  ALTER COLUMN customer_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shipments_business_partner_id_fkey'
  ) THEN
    ALTER TABLE shipments
      ADD CONSTRAINT shipments_business_partner_id_fkey
      FOREIGN KEY (business_partner_id) REFERENCES business_partners (id)
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shipments_business_partner ON shipments (business_partner_id);
