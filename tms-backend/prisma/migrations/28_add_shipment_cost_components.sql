-- NV-5b: Cost-Components pro Sendung
-- Datei: prisma/migrations/28_add_shipment_cost_components.sql
--
-- Idempotent via IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS shipment_cost_components (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id                 UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  nv_tour_id                  UUID REFERENCES nv_touren(id) ON DELETE SET NULL,
  phase                       VARCHAR(20) NOT NULL,
  stop_anteil_eur             DECIMAL(10,2),
  zeit_anteil_eur             DECIMAL(10,2),
  routing_anteil_eur          DECIMAL(10,2),
  kapazitaet_anteil_eur       DECIMAL(10,2),
  total_eur                   DECIMAL(10,2) GENERATED ALWAYS AS (
    COALESCE(stop_anteil_eur, 0) +
    COALESCE(zeit_anteil_eur, 0) +
    COALESCE(routing_anteil_eur, 0) +
    COALESCE(kapazitaet_anteil_eur, 0)
  ) STORED,
  faktoren                    JSONB,
  tour_total_kosten_eur       DECIMAL(10,2),
  tour_gesamt_stops           INTEGER,
  tour_gesamt_minuten         INTEGER,
  computed_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shipment_cost_components_unique
    UNIQUE (shipment_id, phase, nv_tour_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'shipment_cost_components'
      AND constraint_name = 'shipment_cost_components_phase_check'
  ) THEN
    ALTER TABLE shipment_cost_components
      ADD CONSTRAINT shipment_cost_components_phase_check
      CHECK (phase IN ('VORLAUF', 'HAUPTLAUF', 'NACHLAUF'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shipment_cost_components_shipment
  ON shipment_cost_components (shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_cost_components_tour
  ON shipment_cost_components (nv_tour_id);
CREATE INDEX IF NOT EXISTS idx_shipment_cost_components_phase
  ON shipment_cost_components (phase);
