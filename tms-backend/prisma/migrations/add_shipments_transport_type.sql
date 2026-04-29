-- Sprint 6.5: Add transport_type to shipments
-- Run with: psql -U <user> -d <database> -f add_shipments_transport_type.sql

ALTER TABLE shipments
ADD COLUMN IF NOT EXISTS transport_type VARCHAR(20) NOT NULL DEFAULT 'DIREKT';

COMMENT ON COLUMN shipments.transport_type IS 'DIREKT, DIREKT_UMSCHLAG, SAMMELGUT, ABHOLUNG_UMSCHLAG, BEILADER, SONDER, SELBST';
