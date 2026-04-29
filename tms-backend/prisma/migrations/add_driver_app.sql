-- Sprint 15: Fahrer-App (PIN, Token, Zustellungen, Probleme)

ALTER TABLE tours ADD COLUMN IF NOT EXISTS driver_pin VARCHAR(6);
ALTER TABLE tours ADD COLUMN IF NOT EXISTS driver_pin_expires_at TIMESTAMPTZ;
ALTER TABLE tours ADD COLUMN IF NOT EXISTS driver_access_token VARCHAR(100) UNIQUE;
ALTER TABLE tours ADD COLUMN IF NOT EXISTS driver_token_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS driver_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  tour_id UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  driver_name VARCHAR(100),
  recipient_name VARCHAR(100) NOT NULL,
  signature_base64 TEXT,
  photo_base64 TEXT,
  delivered_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_deliveries_shipment ON driver_deliveries(shipment_id);
CREATE INDEX IF NOT EXISTS idx_driver_deliveries_tour ON driver_deliveries(tour_id);

CREATE TABLE IF NOT EXISTS driver_problems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  tour_id UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  problem_type VARCHAR(30) NOT NULL,
  notes TEXT,
  photo_base64 TEXT,
  reported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_problems_shipment ON driver_problems(shipment_id);
CREATE INDEX IF NOT EXISTS idx_driver_problems_tour ON driver_problems(tour_id);
