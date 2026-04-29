-- Pricing Hub (Unified Pricing Rules)
-- Sprint: Pricing Hub komplett
-- Datei: prisma/migrations/add_pricing_hub.sql

CREATE TABLE IF NOT EXISTS pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Typ der Kondition
  rule_type VARCHAR(30) NOT NULL,
  -- CUSTOMER_TARIFF / PARTNER_NACHLAUF / SUB_VORLAUF / SUB_HAUPTLAUF / CHARTER / OWN_NV

  rule_name VARCHAR(200) NOT NULL,
  description TEXT,

  -- Zuordnung
  customer_id UUID REFERENCES customers(id),
  partner_id UUID REFERENCES business_partners(id),
  subcontractor_id UUID REFERENCES subcontractors(id),
  relation_id UUID REFERENCES relations(id),

  -- Geographie
  origin_country CHAR(2),
  origin_zip_prefix VARCHAR(5),
  dest_country CHAR(2),
  dest_zip_prefix VARCHAR(5),

  -- Priorität (höher = wird zuerst geprüft)
  priority INTEGER DEFAULT 10,

  -- Berechnungsbasis
  rate_basis VARCHAR(20) NOT NULL DEFAULT 'PER_100KG',
  rate DECIMAL(12,4),
  min_charge DECIMAL(10,2) DEFAULT 0,
  max_charge DECIMAL(10,2),

  zones_json TEXT,
  tiers_json TEXT,

  -- Zuschläge
  fuel_surcharge_pct DECIMAL(5,2) DEFAULT 0,
  adr_surcharge DECIMAL(10,2) DEFAULT 0,
  timeslot_surcharge DECIMAL(10,2) DEFAULT 0,
  b2c_surcharge DECIMAL(10,2) DEFAULT 0,

  -- Volumen-/LDM-Regeln
  cbm_factor DECIMAL(6,2) DEFAULT 300,
  ldm_factor DECIMAL(8,2) DEFAULT 1650,
  pallet_ldm_threshold DECIMAL(4,1) DEFAULT 5,

  -- Sonderformen (SUB)
  meeting_rate DECIMAL(10,2),
  roundtrip_rate DECIMAL(10,2),
  max_stops INTEGER,

  -- Laufzeit
  transit_days INTEGER DEFAULT 1,

  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,
  is_active BOOLEAN DEFAULT TRUE,

  source VARCHAR(20) DEFAULT 'MANUAL',
  import_batch_id UUID,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Import-Batches (für Rollback)
CREATE TABLE IF NOT EXISTS pricing_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type VARCHAR(30) NOT NULL,
  filename VARCHAR(500),
  imported_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  errors_json TEXT,
  status VARCHAR(20) DEFAULT 'completed',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_lookup ON pricing_rules(
  rule_type, is_active, dest_country, priority DESC
) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_pricing_rules_customer ON pricing_rules(
  customer_id, rule_type, is_active
) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_pricing_rules_partner ON pricing_rules(
  partner_id, rule_type, is_active
) WHERE is_active = TRUE;

