-- Sprint 14: Konditionierung & Pricing

CREATE TABLE IF NOT EXISTS sub_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id UUID NOT NULL REFERENCES subcontractors(id),
  condition_type VARCHAR(20) NOT NULL,
  rate_per_stop DECIMAL(10,2),
  rate_per_day DECIMAL(10,2),
  rate_per_km DECIMAL(10,4),
  min_stops INTEGER DEFAULT 1,
  max_stops INTEGER,
  rate_flat DECIMAL(10,2),
  rate_per_ldm DECIMAL(10,2),
  rate_per_kg DECIMAL(10,4),
  min_ldm DECIMAL(5,2),
  min_charge DECIMAL(10,2) DEFAULT 0,
  meeting_rate DECIMAL(10,2),
  roundtrip_rate DECIMAL(10,2),
  fuel_surcharge_pct DECIMAL(5,2) DEFAULT 0,
  valid_from DATE DEFAULT CURRENT_DATE,
  valid_to DATE,
  relation_id UUID REFERENCES relations(id),
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_conditions_sub ON sub_conditions (subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_sub_conditions_relation ON sub_conditions (relation_id);

CREATE TABLE IF NOT EXISTS partner_on_carriage_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES business_partners(id),
  rate_type VARCHAR(20) NOT NULL,
  zone_number INTEGER,
  zone_km_from INTEGER,
  zone_km_to INTEGER,
  zip_prefix VARCHAR(5),
  country_code CHAR(2),
  rate_per_shipment DECIMAL(10,2) DEFAULT 0,
  rate_per_100kg DECIMAL(10,4) DEFAULT 0,
  rate_per_ldm DECIMAL(10,2) DEFAULT 0,
  min_charge DECIMAL(10,2) DEFAULT 0,
  handling_fee DECIMAL(10,2) DEFAULT 0,
  valid_from DATE DEFAULT CURRENT_DATE,
  valid_to DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_on_carriage_partner ON partner_on_carriage_rates (partner_id);

CREATE TABLE IF NOT EXISTS customer_tariffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id),
  partner_id UUID REFERENCES business_partners(id),
  origin_country CHAR(2),
  origin_zip_prefix VARCHAR(3),
  dest_country CHAR(2) NOT NULL,
  dest_zip_prefix VARCHAR(3),
  rate_type VARCHAR(20) NOT NULL,
  rate DECIMAL(10,4) NOT NULL,
  min_charge DECIMAL(10,2) DEFAULT 0,
  max_charge DECIMAL(10,2),
  fuel_surcharge_pct DECIMAL(5,2) DEFAULT 0,
  adr_surcharge DECIMAL(10,2) DEFAULT 0,
  priority INTEGER DEFAULT 10,
  valid_from DATE DEFAULT CURRENT_DATE,
  valid_to DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_tariffs_customer ON customer_tariffs (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_tariffs_dest ON customer_tariffs (dest_country, dest_zip_prefix);

CREATE TABLE IF NOT EXISTS market_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(20) NOT NULL,
  origin_country CHAR(2),
  dest_country CHAR(2),
  vehicle_type VARCHAR(20),
  price_per_ldm DECIMAL(10,2),
  price_per_km DECIMAL(10,4),
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  valid_date DATE DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS daily_price_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relation_id UUID REFERENCES relations(id),
  base_margin_pct DECIMAL(5,2) DEFAULT 25.0,
  market_delta_factor DECIMAL(5,2) DEFAULT 1.0,
  manual_surcharge_pct DECIMAL(5,2) DEFAULT 0,
  timocom_weight DECIMAL(5,2) DEFAULT 0.4,
  dat_weight DECIMAL(5,2) DEFAULT 0.3,
  internal_weight DECIMAL(5,2) DEFAULT 0.3,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO daily_price_config (base_margin_pct, market_delta_factor)
SELECT 25.0, 1.0
WHERE NOT EXISTS (SELECT 1 FROM daily_price_config LIMIT 1);

ALTER TABLE tours ADD COLUMN IF NOT EXISTS sub_condition_id UUID REFERENCES sub_conditions(id);
ALTER TABLE tours ADD COLUMN IF NOT EXISTS sub_condition_type VARCHAR(20);
ALTER TABLE tours ADD COLUMN IF NOT EXISTS calculated_sub_cost DECIMAL(10,2);
ALTER TABLE tours ADD COLUMN IF NOT EXISTS stop_count INTEGER DEFAULT 0;
ALTER TABLE tours ADD COLUMN IF NOT EXISTS distance_km DECIMAL(8,2);

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS customer_tariff_id UUID REFERENCES customer_tariffs(id);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS calculated_revenue DECIMAL(10,2);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS daily_price DECIMAL(10,2);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS partner_on_carriage_cost DECIMAL(10,2) DEFAULT 0;
