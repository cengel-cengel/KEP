-- Mehrere Packstücke pro Sendung (Maße, Stapelbarkeit)
CREATE TABLE IF NOT EXISTS shipment_package_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  line_index INTEGER NOT NULL,
  package_type package_type NOT NULL DEFAULT 'pallet_euro',
  quantity INTEGER NOT NULL DEFAULT 1,
  length_cm INTEGER NOT NULL,
  width_cm INTEGER NOT NULL,
  height_cm INTEGER NOT NULL,
  weight_kg DECIMAL(10, 2) NOT NULL,
  stackable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_shipment_package_line UNIQUE (shipment_id, line_index)
);

CREATE INDEX IF NOT EXISTS idx_shipment_package_items_shipment ON shipment_package_items(shipment_id);
