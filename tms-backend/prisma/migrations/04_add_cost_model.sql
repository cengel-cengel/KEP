-- Kostenmodell / Sprint: FPG (chargeable weight) + Kostenaufteilung

-- Frachtpflichtiges Gewicht auf Sendung speichern
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS chargeable_weight DECIMAL(10,2);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS cbm DECIMAL(8,3);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS volume_weight_cbm DECIMAL(10,2);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS volume_weight_ldm DECIMAL(10,2);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS fpg_method VARCHAR(20);
-- Methode: ACTUAL_WEIGHT, CBM_VOLUME, LDM_VOLUME

-- Kosten auf Sendung
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS pre_carriage_cost DECIMAL(10,2) DEFAULT 0;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS main_carriage_cost DECIMAL(10,2) DEFAULT 0;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS on_carriage_cost DECIMAL(10,2) DEFAULT 0;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS total_cost DECIMAL(10,2) DEFAULT 0;

-- Kostensätze (konfigurierbar, variabel je Relation/SUB)
CREATE TABLE IF NOT EXISTS cost_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_type VARCHAR(20) NOT NULL,
  -- Typen: PRE_CARRIAGE, MAIN_CARRIAGE, ON_CARRIAGE
  name VARCHAR(100) NOT NULL,
  relation_id UUID REFERENCES relations(id),
  -- null = gilt für alle Relationen
  subcontractor_id UUID REFERENCES subcontractors(id),
  -- null = gilt für alle SUBs
  rate_per_100kg DECIMAL(10,4) NOT NULL DEFAULT 9.00,
  min_charge DECIMAL(10,2) DEFAULT 0,
  valid_from DATE DEFAULT CURRENT_DATE,
  valid_to DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Standard-Vorlaufkostensatz einfügen
INSERT INTO cost_rates (rate_type, name, rate_per_100kg) 
VALUES ('PRE_CARRIAGE', 'Standard Vorlauf', 9.00);

-- Vorlauftouren
CREATE TABLE IF NOT EXISTS pre_carriage_tours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_date DATE NOT NULL,
  subcontractor_id UUID REFERENCES subcontractors(id),
  total_cost DECIMAL(10,2) DEFAULT 0,
  cost_rate_id UUID REFERENCES cost_rates(id),
  distance_km DECIMAL(8,2),
  notes TEXT,
  status VARCHAR(20) DEFAULT 'open',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pre_carriage_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pre_carriage_tour_id UUID NOT NULL REFERENCES pre_carriage_tours(id),
  shipment_id UUID NOT NULL REFERENCES shipments(id),
  chargeable_weight DECIMAL(10,2),
  allocated_cost DECIMAL(10,2) DEFAULT 0
);

