-- Sprint 13: Klärfälle, Sperren, Status-Events, Avisierungen
-- Ausführen z. B.: psql $DATABASE_URL -f prisma/migrations/add_status_system.sql

-- shipment_status: returned für Retoure
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'shipment_status' AND e.enumlabel = 'returned'
  ) THEN
    ALTER TYPE shipment_status ADD VALUE 'returned';
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS shipment_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  lock_type VARCHAR(30) NOT NULL,
  reason TEXT,
  locked_by UUID REFERENCES users(id),
  locked_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  escalated_to UUID REFERENCES users(id),
  escalated_at TIMESTAMPTZ,
  due_date TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shipment_locks_shipment_active ON shipment_locks (shipment_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_shipment_locks_due ON shipment_locks (due_date) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS shipment_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL,
  description TEXT,
  location VARCHAR(100),
  performed_by UUID REFERENCES users(id),
  performed_at TIMESTAMPTZ DEFAULT NOW(),
  recipient_name VARCHAR(100),
  signature_data TEXT,
  photo_url TEXT,
  is_automatic BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_shipment_status_events_shipment ON shipment_status_events (shipment_id, performed_at DESC);

CREATE TABLE IF NOT EXISTS advisories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  advisory_type VARCHAR(20) NOT NULL,
  contact_name VARCHAR(100),
  contact_phone VARCHAR(30),
  contact_email VARCHAR(200),
  portal_url VARCHAR(500),
  portal_booking_ref VARCHAR(100),
  scheduled_date DATE,
  scheduled_time_from TIME,
  scheduled_time_to TIME,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'open',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_advisories_shipment ON advisories (shipment_id);
CREATE INDEX IF NOT EXISTS idx_advisories_status ON advisories (status);

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS has_active_lock BOOLEAN DEFAULT FALSE;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS lock_types VARCHAR(200);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS advisory_required BOOLEAN DEFAULT FALSE;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS advisory_status VARCHAR(20) DEFAULT 'none';
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS last_event_type VARCHAR(30);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ;
