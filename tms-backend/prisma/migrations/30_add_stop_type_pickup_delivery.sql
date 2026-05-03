-- NV-2g1: Pickup/Delivery-Modus für nv_tour_stops + im-Lager-Status
-- Datei: prisma/migrations/30_add_stop_type_pickup_delivery.sql
--
-- Idempotent.

ALTER TYPE shipment_status ADD VALUE IF NOT EXISTS 'in_warehouse';

ALTER TABLE nv_tour_stops
  ADD COLUMN IF NOT EXISTS stop_type VARCHAR(20)
    NOT NULL DEFAULT 'PICKUP';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'nv_tour_stops'
      AND constraint_name = 'nv_tour_stops_stop_type_check'
  ) THEN
    ALTER TABLE nv_tour_stops
      ADD CONSTRAINT nv_tour_stops_stop_type_check
      CHECK (stop_type IN ('PICKUP','DELIVERY'));
  END IF;
END $$;
