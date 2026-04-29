-- Sprint 8: Hallenmanagement
-- Datei: prisma/migrations/add_hall_management.sql

-- Hinweis:
-- - Diese Datei ist ein SQL-Migrationsskript (manuell ausführbar)
-- - Anschließend bitte: npx prisma generate

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS hall_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,
  type VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  -- Typen: NORMAL, ADR, ZOLL, AVIS, UEBERHANG, KLAERPLATZ
  zone VARCHAR(10),
  capacity INTEGER DEFAULT 1,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hall_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_location_id UUID NOT NULL REFERENCES hall_locations(id),
  shipment_id UUID NOT NULL REFERENCES shipments(id),
  placed_at TIMESTAMPTZ DEFAULT NOW(),
  placed_by UUID REFERENCES users(id),
  removed_at TIMESTAMPTZ,
  removed_by UUID REFERENCES users(id),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS hall_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id),
  from_location_id UUID REFERENCES hall_locations(id),
  to_location_id UUID REFERENCES hall_locations(id),
  action VARCHAR(20) NOT NULL,
  -- Aktionen: EINLAGERUNG, AUSLAGERUNG, UMLAGERUNG
  performed_by UUID REFERENCES users(id),
  performed_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS hall_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_date DATE NOT NULL,
  performed_by UUID REFERENCES users(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'open',
  -- Status: open, in_progress, completed
  discrepancies INTEGER DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS hall_check_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_check_id UUID NOT NULL REFERENCES hall_checks(id),
  shipment_id UUID NOT NULL REFERENCES shipments(id),
  hall_location_id UUID REFERENCES hall_locations(id),
  expected_status VARCHAR(20),
  actual_status VARCHAR(20),
  is_ok BOOLEAN,
  notes TEXT
);

-- Seed: Standard Stellplätze (idempotent per code)
INSERT INTO hall_locations (code, type, zone, capacity, description)
SELECT * FROM (
  VALUES
    ('SE-01', 'NORMAL', 'SE', 1, 'Sammelgut Eingang 1'),
    ('SE-02', 'NORMAL', 'SE', 1, 'Sammelgut Eingang 2'),
    ('SE-03', 'NORMAL', 'SE', 1, 'Sammelgut Eingang 3'),
    ('SE-04', 'NORMAL', 'SE', 1, 'Sammelgut Eingang 4'),
    ('SE-05', 'NORMAL', 'SE', 1, 'Sammelgut Eingang 5'),
    ('SA-01', 'NORMAL', 'SA', 1, 'Sammelgut Ausgang 1'),
    ('SA-02', 'NORMAL', 'SA', 1, 'Sammelgut Ausgang 2'),
    ('SA-03', 'NORMAL', 'SA', 1, 'Sammelgut Ausgang 3'),
    ('ADR-01', 'ADR', 'ADR', 1, 'Gefahrgut Platz 1'),
    ('ADR-02', 'ADR', 'ADR', 1, 'Gefahrgut Platz 2'),
    ('ADR-03', 'ADR', 'ADR', 1, 'Gefahrgut Platz 3'),
    ('ZOLL-01', 'ZOLL', 'ZOLL', 1, 'Zollplatz 1'),
    ('ZOLL-02', 'ZOLL', 'ZOLL', 1, 'Zollplatz 2'),
    ('AVIS-01', 'AVIS', 'AVIS', 1, 'Avis/Selbstabholer 1'),
    ('AVIS-02', 'AVIS', 'AVIS', 1, 'Avis/Selbstabholer 2'),
    ('UEBER-01', 'UEBERHANG', 'UEBER', 1, 'Überhang 1'),
    ('UEBER-02', 'UEBERHANG', 'UEBER', 1, 'Überhang 2'),
    ('KLAER-01', 'KLAERPLATZ', 'KLAER', 1, 'Klärplatz 1'),
    ('KLAER-02', 'KLAERPLATZ', 'KLAER', 1, 'Klärplatz 2'),
    ('KLAER-03', 'KLAERPLATZ', 'KLAER', 1, 'Klärplatz 3')
) AS v(code, type, zone, capacity, description)
WHERE NOT EXISTS (
  SELECT 1 FROM hall_locations hl WHERE hl.code = v.code
);

