-- Routing-System (Routing Rules + Shipments Routingfelder)
-- Hinweis:
-- - Dieses Skript ist manuell im Stil eurer vorhandenen `prisma/migrations/*.sql` Dateien gedacht.
-- - Anschließend: `npx prisma generate`
--
-- Migration: prisma/migrations/add_routing.sql

-- Routing Tabelle (Eingangs- und Ausgangsrelationen)
CREATE TABLE IF NOT EXISTS routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifikation
  rule_name VARCHAR(100) NOT NULL,
  direction VARCHAR(10) NOT NULL, -- INBOUND, OUTBOUND, BOTH

  -- Geographie
  country_code CHAR(2) NOT NULL,
  zip_from VARCHAR(10),     -- PLZ von (z.B. "80000")
  zip_to VARCHAR(10),       -- PLZ bis (z.B. "89999")
  zip_prefix VARCHAR(5),    -- ODER PLZ-Prefix (z.B. "8" für ganz Bayern)
  -- zip_from/zip_to hat Vorrang vor zip_prefix

  -- Zustelltyp
  delivery_type VARCHAR(20) NOT NULL,
  -- Typen: OWN_NV (eigener Nahverkehr), NETWORK_PARTNER, CHARTER, COOPERATOR

  -- Zugeordneter Partner (null wenn eigener NV)
  partner_id UUID REFERENCES business_partners(id),
  partner_name VARCHAR(200), -- denormalisiert für Performance

  -- Gateway (Umschlagpunkt des Partners)
  gateway_name VARCHAR(100),
  gateway_zip VARCHAR(10),
  gateway_city VARCHAR(100),
  gateway_country CHAR(2),

  -- Laufzeit
  transit_days INTEGER DEFAULT 1,

  -- Priorität (höher = wird zuerst geprüft bei Überlappungen)
  priority INTEGER DEFAULT 10,

  -- Abfahrtszeiten
  departure_days VARCHAR(20), -- "MON,TUE,WED,THU,FRI"
  departure_time TIME,
  cutoff_time TIME, -- Annahmeschluss für diese Relation

  -- Hallenplatz
  hall_location_id UUID REFERENCES hall_locations(id),
  -- Sendungen dieser Relation kommen auf diesen Stellplatz

  is_active BOOLEAN DEFAULT TRUE,
  valid_from DATE DEFAULT CURRENT_DATE,
  valid_to DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index für schnelle PLZ-Suche
CREATE INDEX IF NOT EXISTS idx_routing_country_zip
  ON routing_rules(country_code, zip_from, zip_to);
CREATE INDEX IF NOT EXISTS idx_routing_country_prefix
  ON routing_rules(country_code, zip_prefix);
CREATE INDEX IF NOT EXISTS idx_routing_direction
  ON routing_rules(direction, is_active);

-- Routing auf Sendung speichern
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS
  inbound_routing_id UUID REFERENCES routing_rules(id);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS
  outbound_routing_id UUID REFERENCES routing_rules(id);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS
  inbound_delivery_type VARCHAR(20);
-- OWN_NV, NETWORK_PARTNER, CHARTER, COOPERATOR
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS
  outbound_delivery_type VARCHAR(20);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS
  inbound_partner_name VARCHAR(200);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS
  outbound_partner_name VARCHAR(200);

-- Beispiel-Routing-Regeln für Deutschland einfügen
INSERT INTO routing_rules (rule_name, direction, country_code, zip_from, zip_to, delivery_type, priority, transit_days) VALUES
('KED Eigengebiet Allgäu', 'BOTH', 'DE', '87000', '87999', 'OWN_NV', 100, 0),
('KED Eigengebiet Kempten', 'BOTH', 'DE', '87400', '87499', 'OWN_NV', 110, 0),
('Bayern Süd', 'OUTBOUND', 'DE', '80000', '89999', 'NETWORK_PARTNER', 10, 1),
('Baden-Württemberg', 'OUTBOUND', 'DE', '70000', '79999', 'NETWORK_PARTNER', 10, 1),
('NRW', 'OUTBOUND', 'DE', '40000', '59999', 'NETWORK_PARTNER', 10, 1),
('Hamburg/Nord', 'OUTBOUND', 'DE', '20000', '29999', 'NETWORK_PARTNER', 10, 2),
('Berlin/Brandenburg', 'OUTBOUND', 'DE', '10000', '19999', 'NETWORK_PARTNER', 10, 2),
('Österreich', 'OUTBOUND', 'AT', NULL, NULL, 'NETWORK_PARTNER', 10, 2),
('Schweiz', 'OUTBOUND', 'CH', NULL, NULL, 'CHARTER', 10, 2),
('Italien', 'OUTBOUND', 'IT', NULL, NULL, 'NETWORK_PARTNER', 10, 3),
('Frankreich', 'OUTBOUND', 'FR', NULL, NULL, 'NETWORK_PARTNER', 10, 3),
('UK', 'OUTBOUND', 'GB', NULL, NULL, 'CHARTER', 10, 4),
('Türkei', 'OUTBOUND', 'TR', NULL, NULL, 'CHARTER', 10, 5);

