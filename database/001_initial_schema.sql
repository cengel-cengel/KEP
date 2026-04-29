-- ============================================================
-- TMS – Initiales Datenbankschema
-- Version: 1.0.0
-- Sprint: 1
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- Für Volltextsuche / Autocomplete

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM (
  'superadmin',
  'dispatcher',
  'clearance',
  'accounting',
  'readonly'
);

CREATE TYPE shipment_status AS ENUM (
  'new',
  'dispatched',
  'in_transit',
  'delivered',
  'invoiced',
  'cancelled'
);

CREATE TYPE tour_status AS ENUM (
  'planned',
  'dispatched',
  'in_transit',
  'completed',
  'invoiced',
  'cancelled'
);

CREATE TYPE package_type AS ENUM (
  'pallet_euro',
  'pallet_one_way',
  'box',
  'drum',
  'bulk',
  'coil',
  'container',
  'other'
);

CREATE TYPE freight_payer AS ENUM (
  'sender',
  'recipient',
  'third_party'
);

CREATE TYPE address_type AS ENUM (
  'billing',
  'loading',
  'delivery',
  'depot'
);

CREATE TYPE condition_basis AS ENUM (
  'weight',
  'ldm',
  'zone',
  'flat'
);

CREATE TYPE invoice_status AS ENUM (
  'draft',
  'sent',
  'paid',
  'overdue',
  'cancelled'
);

CREATE TYPE audit_action AS ENUM (
  'INSERT',
  'UPDATE',
  'DELETE'
);

-- ============================================================
-- USERS (Benutzerverwaltung)
-- ============================================================

CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email             VARCHAR(200) NOT NULL UNIQUE,
  password_hash     VARCHAR(255) NOT NULL,
  name              VARCHAR(100) NOT NULL,
  role              user_role NOT NULL DEFAULT 'dispatcher',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  mfa_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret        VARCHAR(100),
  last_login        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- ============================================================
-- CUSTOMERS (Kunden)
-- ============================================================

CREATE TABLE customers (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_number       VARCHAR(20) NOT NULL UNIQUE,
  name                  VARCHAR(200) NOT NULL,
  name2                 VARCHAR(200),
  vat_id                VARCHAR(30),
  payment_term_days     INTEGER NOT NULL DEFAULT 30,
  credit_limit          DECIMAL(12,2),
  datev_account         VARCHAR(10),         -- DATEV Debitorenkonto
  default_incoterm      VARCHAR(10),
  default_freight_payer freight_payer NOT NULL DEFAULT 'sender',
  invoice_email         VARCHAR(200),
  edi_partner_id        VARCHAR(50),
  min_contribution_pct  DECIMAL(5,2) DEFAULT 10.00,  -- Mindest-DB% für Ampel
  notes                 TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_number ON customers(customer_number);
CREATE INDEX idx_customers_name ON customers USING gin(name gin_trgm_ops);

-- ============================================================
-- ADDRESSES (Adressen)
-- ============================================================

CREATE TABLE addresses (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  type          address_type NOT NULL DEFAULT 'delivery',
  name          VARCHAR(200) NOT NULL,
  name2         VARCHAR(200),
  street        VARCHAR(200) NOT NULL,
  zip           VARCHAR(10) NOT NULL,
  city          VARCHAR(100) NOT NULL,
  country_code  CHAR(2) NOT NULL DEFAULT 'DE',
  lat           DECIMAL(10,7),
  lng           DECIMAL(10,7),
  contact_name  VARCHAR(100),
  contact_phone VARCHAR(30),
  contact_email VARCHAR(200),
  opening_hours JSONB,          -- { "mo": "07:00-17:00", "tu": "07:00-17:00", ... }
  notes         TEXT,           -- Hinweise: Rampe rechts, klingeln, etc.
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_addresses_customer ON addresses(customer_id);
CREATE INDEX idx_addresses_country ON addresses(country_code);
CREATE INDEX idx_addresses_zip ON addresses(zip);
CREATE INDEX idx_addresses_city ON addresses USING gin(city gin_trgm_ops);
CREATE INDEX idx_addresses_name ON addresses USING gin(name gin_trgm_ops);

-- ============================================================
-- SUBCONTRACTORS (Subunternehmer)
-- ============================================================

CREATE TABLE subcontractors (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subcontractor_number VARCHAR(20) NOT NULL UNIQUE,
  name                VARCHAR(200) NOT NULL,
  vat_id              VARCHAR(30),
  street              VARCHAR(200),
  zip                 VARCHAR(10),
  city                VARCHAR(100),
  country_code        CHAR(2) NOT NULL DEFAULT 'DE',
  contact_name        VARCHAR(100),
  contact_phone       VARCHAR(30),
  contact_email       VARCHAR(200),
  datev_account       VARCHAR(10),         -- DATEV Kreditorenkonto
  payment_term_days   INTEGER NOT NULL DEFAULT 30,
  has_adr_license     BOOLEAN NOT NULL DEFAULT FALSE,
  has_temperature     BOOLEAN NOT NULL DEFAULT FALSE,
  max_weight_kg       DECIMAL(10,2),
  max_ldm             DECIMAL(6,2),
  service_areas       JSONB,               -- ["DE","AT","CH","IT","FR"]
  rating              SMALLINT CHECK (rating BETWEEN 1 AND 5),
  notes               TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subcontractors_name ON subcontractors USING gin(name gin_trgm_ops);

-- ============================================================
-- CONDITIONS (Konditionen / Tarife)
-- ============================================================

CREATE TABLE conditions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name                VARCHAR(100) NOT NULL,
  valid_from          DATE NOT NULL,
  valid_to            DATE,               -- NULL = unbegrenzt gültig
  basis               condition_basis NOT NULL DEFAULT 'ldm',
  country_from        CHAR(2),            -- NULL = alle Länder
  country_to          CHAR(2),            -- NULL = alle Länder
  zip_prefix_from     VARCHAR(5),         -- PLZ-Präfix Abgang (z.B. "7" = Württemberg)
  zip_prefix_to       VARCHAR(5),         -- PLZ-Präfix Ziel
  min_charge          DECIMAL(10,2) DEFAULT 0,
  fuel_surcharge_pct  DECIMAL(5,2) DEFAULT 0,   -- Dieselzuschlag in %
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conditions_customer ON conditions(customer_id);
CREATE INDEX idx_conditions_validity ON conditions(valid_from, valid_to);

-- Staffelpreise zur Kondition
CREATE TABLE condition_rates (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  condition_id  UUID NOT NULL REFERENCES conditions(id) ON DELETE CASCADE,
  from_value    DECIMAL(10,3) NOT NULL,   -- Staffel von (kg, ldm, etc.)
  to_value      DECIMAL(10,3) NOT NULL,   -- Staffel bis
  rate          DECIMAL(10,4) NOT NULL,   -- Preis pro Einheit
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_condition_rates_condition ON condition_rates(condition_id);

-- ============================================================
-- TOURS (Touren)
-- ============================================================

CREATE TABLE tours (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tour_number         VARCHAR(30) NOT NULL UNIQUE,
  tour_date           DATE NOT NULL,
  status              tour_status NOT NULL DEFAULT 'planned',
  subcontractor_id    UUID REFERENCES subcontractors(id),
  vehicle_plate       VARCHAR(20),
  driver_name         VARCHAR(100),
  driver_phone        VARCHAR(30),
  departure_time      TIMESTAMPTZ,
  max_weight_kg       DECIMAL(10,2) DEFAULT 24000,
  max_ldm             DECIMAL(6,2) DEFAULT 13.6,
  -- Berechnete Felder (werden bei jeder Sendungsänderung aktualisiert)
  total_weight_kg     DECIMAL(10,2) DEFAULT 0,
  total_ldm           DECIMAL(6,2) DEFAULT 0,
  total_revenue       DECIMAL(12,2) DEFAULT 0,
  subcontractor_cost  DECIMAL(12,2) DEFAULT 0,
  contribution_margin DECIMAL(12,2) DEFAULT 0,  -- revenue - sub_cost
  cm_percent          DECIMAL(5,2) DEFAULT 0,    -- DB in %
  -- Abfertigung
  cmr_generated_at    TIMESTAMPTZ,
  dispatched_at       TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  notes               TEXT,
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tours_date ON tours(tour_date);
CREATE INDEX idx_tours_status ON tours(status);
CREATE INDEX idx_tours_subcontractor ON tours(subcontractor_id);

-- ============================================================
-- SHIPMENTS (Sendungen) – Kerntabelle
-- ============================================================

CREATE TABLE shipments (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shipment_number       VARCHAR(30) NOT NULL UNIQUE,
  customer_id           UUID NOT NULL REFERENCES customers(id),
  customer_ref          VARCHAR(50),          -- Referenznummer Kunde
  status                shipment_status NOT NULL DEFAULT 'new',

  -- Adressen
  loading_address_id    UUID NOT NULL REFERENCES addresses(id),
  delivery_address_id   UUID NOT NULL REFERENCES addresses(id),

  -- Termine
  loading_date          DATE NOT NULL,
  loading_time_from     TIME,
  loading_time_to       TIME,
  delivery_date         DATE NOT NULL,
  delivery_time_from    TIME,
  delivery_time_to      TIME,

  -- Packstücke & Abmessungen
  package_type          package_type NOT NULL DEFAULT 'pallet_euro',
  package_count         INTEGER NOT NULL DEFAULT 1,
  weight_kg             DECIMAL(10,2) NOT NULL,
  ldm                   DECIMAL(6,2),
  volume_m3             DECIMAL(8,3),
  length_cm             INTEGER,
  width_cm              INTEGER,
  height_cm             INTEGER,

  -- Gefahrgut
  is_hazmat             BOOLEAN NOT NULL DEFAULT FALSE,
  hazmat_class          VARCHAR(10),          -- ADR-Klasse z.B. "3"
  hazmat_un_number      VARCHAR(10),          -- z.B. "UN1234"
  hazmat_packing_group  VARCHAR(5),           -- I, II, III
  hazmat_description    TEXT,

  -- Konditionen & Frankatur
  incoterm              VARCHAR(10),
  freight_payer         freight_payer NOT NULL DEFAULT 'sender',
  condition_id          UUID REFERENCES conditions(id),

  -- Disposition
  tour_id               UUID REFERENCES tours(id) ON DELETE SET NULL,
  tour_position         SMALLINT,             -- Reihenfolge in der Tour

  -- Finanzen
  freight_revenue       DECIMAL(12,2),        -- Erlös (aus Kondition berechnet)
  freight_cost          DECIMAL(12,2),        -- Anteil Kosten SUB
  contribution_margin   DECIMAL(12,2),        -- DB1 dieser Sendung
  cm_percent            DECIMAL(5,2),         -- DB1 in %

  -- Texte
  comment               TEXT,                 -- Interner Kommentar
  customer_note         TEXT,                 -- Hinweistext Fahrer/Abfertigung
  delivery_note_number  VARCHAR(50),          -- Lieferscheinnummer

  -- EDI
  edi_source            VARCHAR(50),          -- z.B. "EDIFACT_ORDERS"
  edi_reference         VARCHAR(100),

  -- Tracking
  last_status_update    TIMESTAMPTZ,
  delivered_at          TIMESTAMPTZ,
  pod_image_s3_key      VARCHAR(500),         -- Proof of Delivery Foto

  -- Metadaten
  created_by            UUID NOT NULL REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ           -- Soft-Delete
);

-- Wichtige Indizes für Performance bei 1.500 Sendungen/Tag
CREATE INDEX idx_shipments_customer ON shipments(customer_id);
CREATE INDEX idx_shipments_status ON shipments(status);
CREATE INDEX idx_shipments_tour ON shipments(tour_id);
CREATE INDEX idx_shipments_loading_date ON shipments(loading_date);
CREATE INDEX idx_shipments_delivery_date ON shipments(delivery_date);
CREATE INDEX idx_shipments_number ON shipments(shipment_number);
CREATE INDEX idx_shipments_customer_ref ON shipments(customer_ref);
CREATE INDEX idx_shipments_not_deleted ON shipments(id) WHERE deleted_at IS NULL;

-- ============================================================
-- INVOICES (Rechnungen)
-- ============================================================

CREATE TABLE invoices (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number      VARCHAR(30) NOT NULL UNIQUE,
  customer_id         UUID NOT NULL REFERENCES customers(id),
  invoice_date        DATE NOT NULL,
  due_date            DATE NOT NULL,
  status              invoice_status NOT NULL DEFAULT 'draft',
  net_amount          DECIMAL(12,2) NOT NULL DEFAULT 0,
  vat_rate            DECIMAL(5,2) NOT NULL DEFAULT 19.00,
  vat_amount          DECIMAL(12,2) NOT NULL DEFAULT 0,
  gross_amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_received_at TIMESTAMPTZ,
  datev_exported_at   TIMESTAMPTZ,
  pdf_s3_key          VARCHAR(500),
  notes               TEXT,
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_date ON invoices(invoice_date);

CREATE TABLE invoice_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  shipment_id   UUID REFERENCES shipments(id) ON DELETE SET NULL,
  description   TEXT NOT NULL,
  quantity      DECIMAL(10,3) NOT NULL DEFAULT 1,
  unit          VARCHAR(20) NOT NULL DEFAULT 'flat',  -- kg, ldm, Stk, km, flat
  unit_price    DECIMAL(12,4) NOT NULL,
  total_price   DECIMAL(12,2) NOT NULL,
  position      SMALLINT NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX idx_invoice_items_shipment ON invoice_items(shipment_id);

-- ============================================================
-- SHIPMENT STATUS LOG (Tracking-Historie)
-- ============================================================

CREATE TABLE shipment_events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shipment_id   UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  status        shipment_status NOT NULL,
  location      VARCHAR(200),
  note          TEXT,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shipment_events_shipment ON shipment_events(shipment_id);

-- ============================================================
-- AUDIT LOG (DSGVO-Pflicht)
-- ============================================================

CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name  VARCHAR(100) NOT NULL,
  record_id   UUID NOT NULL,
  action      audit_action NOT NULL,
  old_values  JSONB,
  new_values  JSONB,
  user_id     UUID REFERENCES users(id),
  user_ip     INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_table_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);

-- ============================================================
-- SEQUENCES für lesbare Nummern
-- ============================================================

CREATE SEQUENCE shipment_number_seq START 100000;
CREATE SEQUENCE tour_number_seq START 10000;
CREATE SEQUENCE invoice_number_seq START 200000;
CREATE SEQUENCE customer_number_seq START 10000;
CREATE SEQUENCE subcontractor_number_seq START 5000;

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-updated_at Trigger Function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- updated_at Trigger für alle relevanten Tabellen
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_addresses_updated_at
  BEFORE UPDATE ON addresses FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_subcontractors_updated_at
  BEFORE UPDATE ON subcontractors FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_shipments_updated_at
  BEFORE UPDATE ON shipments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_tours_updated_at
  BEFORE UPDATE ON tours FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Funktion: Tour DB automatisch neu berechnen wenn Sendung zugeordnet/entfernt
CREATE OR REPLACE FUNCTION recalculate_tour_stats(p_tour_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE tours t
  SET
    total_weight_kg     = COALESCE((SELECT SUM(s.weight_kg) FROM shipments s WHERE s.tour_id = p_tour_id AND s.deleted_at IS NULL), 0),
    total_ldm           = COALESCE((SELECT SUM(s.ldm) FROM shipments s WHERE s.tour_id = p_tour_id AND s.deleted_at IS NULL), 0),
    total_revenue       = COALESCE((SELECT SUM(s.freight_revenue) FROM shipments s WHERE s.tour_id = p_tour_id AND s.deleted_at IS NULL), 0),
    contribution_margin = COALESCE((SELECT SUM(s.freight_revenue) FROM shipments s WHERE s.tour_id = p_tour_id AND s.deleted_at IS NULL), 0) - t.subcontractor_cost,
    cm_percent          = CASE
                            WHEN COALESCE((SELECT SUM(s.freight_revenue) FROM shipments s WHERE s.tour_id = p_tour_id AND s.deleted_at IS NULL), 0) > 0
                            THEN ROUND(
                              (COALESCE((SELECT SUM(s.freight_revenue) FROM shipments s WHERE s.tour_id = p_tour_id AND s.deleted_at IS NULL), 0) - t.subcontractor_cost)
                              / COALESCE((SELECT SUM(s.freight_revenue) FROM shipments s WHERE s.tour_id = p_tour_id AND s.deleted_at IS NULL), 0) * 100,
                              2
                            )
                            ELSE 0
                          END,
    updated_at = NOW()
  WHERE t.id = p_tour_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Tour-Stats neu berechnen wenn Sendung geändert
CREATE OR REPLACE FUNCTION trg_shipment_tour_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Alte Tour aktualisieren (wenn Sendung von Tour entfernt)
  IF OLD.tour_id IS NOT NULL AND (NEW.tour_id IS DISTINCT FROM OLD.tour_id OR NEW.deleted_at IS NOT NULL) THEN
    PERFORM recalculate_tour_stats(OLD.tour_id);
  END IF;
  -- Neue Tour aktualisieren
  IF NEW.tour_id IS NOT NULL THEN
    PERFORM recalculate_tour_stats(NEW.tour_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_shipments_tour_stats
  AFTER UPDATE OF tour_id, freight_revenue, weight_kg, ldm, deleted_at ON shipments
  FOR EACH ROW EXECUTE FUNCTION trg_shipment_tour_stats();

-- ============================================================
-- SEED DATA – Superadmin User
-- ============================================================

INSERT INTO users (id, email, password_hash, name, role, is_active)
VALUES (
  uuid_generate_v4(),
  'admin@tms.local',
  -- Passwort: 'Admin1234!' (bcrypt hash – muss beim ersten Login geändert werden)
  '$2b$12$placeholder_replace_with_real_bcrypt_hash',
  'System Administrator',
  'superadmin',
  TRUE
);

-- ============================================================
-- VIEWS für häufige Abfragen
-- ============================================================

-- Aktive Sendungen mit Kundenname und Adressen (für Dispo-Board)
CREATE VIEW v_shipments_active AS
SELECT
  s.id,
  s.shipment_number,
  s.status,
  s.customer_id,
  c.name AS customer_name,
  c.min_contribution_pct,
  la.city AS loading_city,
  la.country_code AS loading_country,
  da.city AS delivery_city,
  da.country_code AS delivery_country,
  s.loading_date,
  s.delivery_date,
  s.package_count,
  s.package_type,
  s.weight_kg,
  s.ldm,
  s.is_hazmat,
  s.freight_revenue,
  s.contribution_margin,
  s.cm_percent,
  s.tour_id,
  s.tour_position,
  s.customer_ref,
  s.created_at
FROM shipments s
JOIN customers c ON s.customer_id = c.id
JOIN addresses la ON s.loading_address_id = la.id
JOIN addresses da ON s.delivery_address_id = da.id
WHERE s.deleted_at IS NULL
  AND s.status NOT IN ('invoiced', 'cancelled');

-- Tour-Übersicht mit DB-Ampel
CREATE VIEW v_tours_with_status AS
SELECT
  t.id,
  t.tour_number,
  t.tour_date,
  t.status,
  t.subcontractor_id,
  sub.name AS subcontractor_name,
  t.driver_name,
  t.vehicle_plate,
  t.total_weight_kg,
  t.max_weight_kg,
  t.total_ldm,
  t.max_ldm,
  ROUND(t.total_ldm / NULLIF(t.max_ldm, 0) * 100, 1) AS ldm_utilization_pct,
  t.total_revenue,
  t.subcontractor_cost,
  t.contribution_margin,
  t.cm_percent,
  CASE
    WHEN t.cm_percent >= 15 THEN 'green'
    WHEN t.cm_percent >= 5  THEN 'yellow'
    ELSE 'red'
  END AS db_traffic_light,
  COUNT(s.id) AS shipment_count,
  t.cmr_generated_at,
  t.created_at
FROM tours t
LEFT JOIN subcontractors sub ON t.subcontractor_id = sub.id
LEFT JOIN shipments s ON s.tour_id = t.id AND s.deleted_at IS NULL
GROUP BY t.id, sub.name;

-- Kunden-DB-Übersicht (für Cockpit)
CREATE VIEW v_customer_contribution AS
SELECT
  c.id AS customer_id,
  c.customer_number,
  c.name AS customer_name,
  c.min_contribution_pct,
  COUNT(s.id) AS shipment_count,
  SUM(s.freight_revenue) AS total_revenue,
  SUM(s.contribution_margin) AS total_cm,
  CASE
    WHEN SUM(s.freight_revenue) > 0
    THEN ROUND(SUM(s.contribution_margin) / SUM(s.freight_revenue) * 100, 2)
    ELSE 0
  END AS avg_cm_percent,
  CASE
    WHEN SUM(s.freight_revenue) > 0 AND
         ROUND(SUM(s.contribution_margin) / SUM(s.freight_revenue) * 100, 2) >= c.min_contribution_pct
    THEN 'green'
    WHEN SUM(s.freight_revenue) > 0 AND
         ROUND(SUM(s.contribution_margin) / SUM(s.freight_revenue) * 100, 2) >= 5
    THEN 'yellow'
    ELSE 'red'
  END AS db_traffic_light
FROM customers c
LEFT JOIN shipments s ON s.customer_id = c.id
  AND s.deleted_at IS NULL
  AND s.status NOT IN ('cancelled')
  AND s.created_at >= DATE_TRUNC('month', NOW())  -- Aktueller Monat
GROUP BY c.id, c.customer_number, c.name, c.min_contribution_pct;
