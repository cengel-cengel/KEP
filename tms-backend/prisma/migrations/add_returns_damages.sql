CREATE TABLE IF NOT EXISTS nv_dispositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id),
  problem_type VARCHAR(30) NOT NULL,
  -- NICHT_ANGETROFFEN, VERWEIGERT, ADRESSE_FALSCH, 
  -- BESCHAEDIGT, ZEITFENSTER_VERPASST, SONSTIGES
  disposition_type VARCHAR(20),
  -- RETRY, RETURN, SELF_PICKUP, STORAGE
  driver_notes TEXT,
  driver_photo_base64 TEXT,
  reported_at TIMESTAMPTZ DEFAULT NOW(),
  -- Neuer Versuch
  retry_date DATE,
  retry_time_from TIME,
  retry_time_to TIME,
  -- Retoure
  return_cost_eur DECIMAL(10,2) DEFAULT 0,
  return_cost_bearer VARCHAR(20),
  -- KED, VERSENDER, EMPFAENGER
  -- Einlagerung
  storage_start_date DATE,
  storage_daily_rate DECIMAL(10,2),
  -- Allgemein
  notes TEXT,
  status VARCHAR(20) DEFAULT 'open',
  -- open, in_progress, resolved
  created_by UUID REFERENCES users(id),
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS damage_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id),
  damage_type VARCHAR(20) NOT NULL,
  -- OPTISCH, VERDECKT, TOTALSCHADEN
  damage_cause VARCHAR(20),
  -- VERPACKUNG, TRANSPORT, PARTNER, UNBEKANNT
  damage_description TEXT NOT NULL,
  damage_value_eur DECIMAL(10,2),
  photo_base64_1 TEXT,
  photo_base64_2 TEXT,
  photo_base64_3 TEXT,
  reported_by_driver BOOLEAN DEFAULT FALSE,
  reported_at TIMESTAMPTZ DEFAULT NOW(),
  liability_party VARCHAR(20),
  -- KED, PARTNER, VERSENDER, VERSICHERUNG
  insurance_claim BOOLEAN DEFAULT FALSE,
  insurance_ref VARCHAR(100),
  status VARCHAR(20) DEFAULT 'open',
  -- open, in_klaerung, abgeschlossen, abgewiesen
  resolution_notes TEXT,
  created_by UUID REFERENCES users(id),
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id),
  damage_report_id UUID REFERENCES damage_reports(id),
  claim_type VARCHAR(20) NOT NULL,
  -- SCHADEN, VERLUST, LAUFZEIT, FEHLLIEFERUNG
  claim_against VARCHAR(20) NOT NULL,
  -- PARTNER, VERSENDER, VERSICHERUNG
  claim_amount_eur DECIMAL(10,2),
  status VARCHAR(20) DEFAULT 'open',
  -- open, gesendet, anerkannt, abgewiesen
  partner_ref VARCHAR(100),
  deadline_date DATE,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id),
  nv_disposition_id UUID REFERENCES nv_dispositions(id),
  return_reason VARCHAR(30) NOT NULL,
  return_type VARCHAR(20) NOT NULL,
  -- ZUM_VERSENDER, EINLAGERUNG, SELBSTABHOLER
  return_cost_eur DECIMAL(10,2) DEFAULT 0,
  cost_bearer VARCHAR(20),
  hall_location_id UUID REFERENCES hall_locations(id),
  return_tour_id UUID REFERENCES tours(id),
  status VARCHAR(20) DEFAULT 'erfasst',
  -- erfasst, auf_lager, unterwegs, zugestellt
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS surplus_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID REFERENCES tours(id),
  description TEXT,
  weight_kg DECIMAL(8,2),
  package_count INTEGER DEFAULT 1,
  photo_base64 TEXT,
  scan_code VARCHAR(100),
  matched_shipment_id UUID REFERENCES shipments(id),
  hall_location_id UUID REFERENCES hall_locations(id),
  status VARCHAR(20) DEFAULT 'erfasst',
  -- erfasst, zugeordnet, nachbordero, entsorgt
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Felder auf shipments ergänzen
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS 
  has_nv_disposition BOOLEAN DEFAULT FALSE;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS 
  has_damage_report BOOLEAN DEFAULT FALSE;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS 
  has_return BOOLEAN DEFAULT FALSE;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS 
  return_status VARCHAR(20);

