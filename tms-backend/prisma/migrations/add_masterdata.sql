-- Sprint 9: Erweiterte Stammdaten & Relations-Automation
-- Datei: prisma/migrations/add_masterdata.sql

-- Hinweis:
-- - Dieses SQL-Skript ergänzt Stammdaten-Tabellen und Relations-Automation.
-- - Zusätzlich wird shipments um relation_id erweitert.

CREATE TABLE IF NOT EXISTS corporate_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  country_code CHAR(2) DEFAULT 'DE',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_number VARCHAR(20) NOT NULL UNIQUE,
  partner_type VARCHAR(20) NOT NULL,
  corporate_group_id UUID REFERENCES corporate_groups(id),

  name VARCHAR(200) NOT NULL,
  name2 VARCHAR(200),
  legal_form VARCHAR(50),

  street VARCHAR(200),
  zip VARCHAR(10),
  city VARCHAR(100),
  country_code CHAR(2) DEFAULT 'DE',

  vat_id VARCHAR(30),
  tax_number VARCHAR(30),
  commercial_register VARCHAR(50),
  commercial_register_court VARCHAR(100),

  datev_account VARCHAR(10),
  payment_term_days INTEGER DEFAULT 30,
  skonto_percent DECIMAL(5,2),
  skonto_days INTEGER,
  credit_limit DECIMAL(12,2),
  credit_limit_currency CHAR(3) DEFAULT 'EUR',
  invoice_email VARCHAR(200),
  invoice_delivery VARCHAR(20) DEFAULT 'EMAIL',

  bank_name VARCHAR(100),
  iban VARCHAR(34),
  bic VARCHAR(11),

  min_contribution_pct DECIMAL(5,2) DEFAULT 10.00,
  revenue_target_annual DECIMAL(12,2),

  lksg_risk_country BOOLEAN DEFAULT FALSE,
  lksg_self_disclosure BOOLEAN DEFAULT FALSE,
  lksg_self_disclosure_date DATE,
  lksg_next_review_date DATE,
  lksg_notes TEXT,

  edi_partner_id VARCHAR(50),
  edi_format VARCHAR(20),

  ids_member_number VARCHAR(20),
  ids_depot_code VARCHAR(10),

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partner_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES business_partners(id) ON DELETE CASCADE,
  contact_type VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  title VARCHAR(20),
  phone VARCHAR(30),
  mobile VARCHAR(30),
  email VARCHAR(200),
  notes TEXT,
  is_primary BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS partner_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES business_partners(id) ON DELETE CASCADE,
  location_key VARCHAR(30) NOT NULL,
  location_type VARCHAR(20) DEFAULT 'LOADING',

  name VARCHAR(200) NOT NULL,
  name2 VARCHAR(200),
  street VARCHAR(200) NOT NULL,
  zip VARCHAR(10) NOT NULL,
  city VARCHAR(100) NOT NULL,
  country_code CHAR(2) DEFAULT 'DE',
  lat DECIMAL(10,7),
  lng DECIMAL(10,7),

  opening_mon_from TIME, opening_mon_to TIME,
  opening_tue_from TIME, opening_tue_to TIME,
  opening_wed_from TIME, opening_wed_to TIME,
  opening_thu_from TIME, opening_thu_to TIME,
  opening_fri_from TIME, opening_fri_to TIME,
  opening_sat_from TIME, opening_sat_to TIME,

  has_loading_ramp BOOLEAN DEFAULT FALSE,
  ramp_count INTEGER,
  max_vehicle_length_m DECIMAL(5,1),
  forklift_available BOOLEAN DEFAULT FALSE,
  appointment_required BOOLEAN DEFAULT FALSE,
  access_code VARCHAR(50),
  special_instructions TEXT,
  contact_name VARCHAR(100),
  contact_phone VARCHAR(30),
  contact_email VARCHAR(200),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  direction VARCHAR(10) NOT NULL,

  country_from CHAR(2),
  country_to CHAR(2),
  zip_prefix_from VARCHAR(5),
  zip_prefix_to VARCHAR(5),

  default_hall_location_id UUID REFERENCES hall_locations(id),
  network_partner_id UUID REFERENCES business_partners(id),

  departure_days VARCHAR(20),
  departure_time TIME,

  transit_days INTEGER DEFAULT 1,

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zip_relation_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zip_prefix VARCHAR(10) NOT NULL,
  country_code CHAR(2) NOT NULL,
  relation_id UUID NOT NULL REFERENCES relations(id),
  hall_location_id UUID REFERENCES hall_locations(id),
  priority INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Neue Relation-Spalte in shipments
ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS relation_id UUID REFERENCES relations(id);

