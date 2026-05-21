-- Map-Routing P1: shipment.classification.
-- Datei: prisma/migrations/47_shipments_classification.sql
--
-- Klassifizierung pro Sendung — bestimmt is_charter-Ableitung
-- auf Tour-Ebene:
--   1 Tour-Sendung CHARTER_DIREKT → tour.is_charter=true
--   sonst → tour.is_charter=false
--
-- Auto-Ableitung bei Sendungserfassung (BE-side):
--   < 3000 kg                                 → SAMMELGUT
--   ≥ 3000 kg && PLZ außerhalb NV-Gebiete    → CHARTER_DIREKT
--   ≥ 3000 kg && PLZ innerhalb NV-Gebiete    → CHARTER_UMSCHLAG
--   Sattel (≥ 24000 kg ODER ldm ≥ 13.6)       → CHARTER_DIREKT
--                                                (egal Gebiet)
--
-- Override via UI bei Sendungserfassung (Dropdown).

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS classification VARCHAR(20) NOT NULL
    DEFAULT 'SAMMELGUT';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'shipments'
      AND constraint_name = 'shipments_classification_check'
  ) THEN
    ALTER TABLE shipments
      ADD CONSTRAINT shipments_classification_check
      CHECK (classification IN
        ('SAMMELGUT', 'CHARTER_UMSCHLAG', 'CHARTER_DIREKT'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shipments_classification
  ON shipments (classification)
  WHERE classification != 'SAMMELGUT';
