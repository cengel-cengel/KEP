-- NV-2a: Operative NV-Touren + Tour-Stops
-- Datei: prisma/migrations/25_add_nv_touren.sql
--
-- Idempotent via IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS nv_touren (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nv_stamm_tour_id       UUID REFERENCES nv_stamm_touren(id) ON DELETE SET NULL,
  datum                  DATE NOT NULL,
  status                 VARCHAR(20) NOT NULL DEFAULT 'PLANNING',
  subunternehmer_id      UUID REFERENCES nv_subunternehmer(id) ON DELETE SET NULL,
  start_zeit             TIME,
  end_zeit               TIME,
  fahrzeug_typ           VARCHAR(20),
  notizen                TEXT,
  fahrer_kosten_eur      DECIMAL(10,2),
  fahrzeug_kosten_eur    DECIMAL(10,2),
  kraftstoff_kosten_eur  DECIMAL(10,2),
  dispo_kosten_eur       DECIMAL(10,2),
  sonstige_kosten_eur    DECIMAL(10,2),
  total_kosten_eur       DECIMAL(10,2) GENERATED ALWAYS AS (
    COALESCE(fahrer_kosten_eur, 0) +
    COALESCE(fahrzeug_kosten_eur, 0) +
    COALESCE(kraftstoff_kosten_eur, 0) +
    COALESCE(dispo_kosten_eur, 0) +
    COALESCE(sonstige_kosten_eur, 0)
  ) STORED,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT nv_touren_status_check CHECK (status IN
    ('PLANNING','DISPATCHED','IN_PROGRESS','COMPLETED','CANCELLED')
  )
);

CREATE INDEX IF NOT EXISTS idx_nv_touren_datum_status
  ON nv_touren (datum, status);

CREATE INDEX IF NOT EXISTS idx_nv_touren_stamm_datum
  ON nv_touren (nv_stamm_tour_id, datum);

CREATE INDEX IF NOT EXISTS idx_nv_touren_subunternehmer
  ON nv_touren (subunternehmer_id);

DROP TRIGGER IF EXISTS nv_touren_set_updated_at ON nv_touren;
CREATE TRIGGER nv_touren_set_updated_at
  BEFORE UPDATE ON nv_touren
  FOR EACH ROW EXECUTE FUNCTION trg_nv_set_updated_at();

CREATE TABLE IF NOT EXISTS nv_tour_stops (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nv_tour_id             UUID NOT NULL REFERENCES nv_touren(id) ON DELETE CASCADE,
  shipment_id            UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  position               INTEGER NOT NULL,
  servicezeit_min        INTEGER,
  routing_klasse         VARCHAR(30),
  service_zuschlaege     JSONB,
  status                 VARCHAR(20) NOT NULL DEFAULT 'PLANNED',
  ankunft_zeit           TIMESTAMPTZ,
  abfahrt_zeit           TIMESTAMPTZ,
  notizen                TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT nv_tour_stops_unique_shipment UNIQUE (nv_tour_id, shipment_id),
  CONSTRAINT nv_tour_stops_unique_position UNIQUE (nv_tour_id, position)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT nv_tour_stops_status_check CHECK (status IN
    ('PLANNED','ARRIVED','COMPLETED','FAILED','SKIPPED')
  ),
  CONSTRAINT nv_tour_stops_routing_check CHECK (
    routing_klasse IS NULL OR routing_klasse IN
      ('STAMMROUTE','KLEINER_SCHLENKER','MITTLERER_UMWEG','SEPARATER_TOURAST')
  )
);

CREATE INDEX IF NOT EXISTS idx_nv_tour_stops_tour_pos
  ON nv_tour_stops (nv_tour_id, position);

CREATE INDEX IF NOT EXISTS idx_nv_tour_stops_shipment
  ON nv_tour_stops (shipment_id);

DROP TRIGGER IF EXISTS nv_tour_stops_set_updated_at ON nv_tour_stops;
CREATE TRIGGER nv_tour_stops_set_updated_at
  BEFORE UPDATE ON nv_tour_stops
  FOR EACH ROW EXECUTE FUNCTION trg_nv_set_updated_at();
