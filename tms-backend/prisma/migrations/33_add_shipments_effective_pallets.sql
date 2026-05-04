-- NV-2i14b: Stack-aware effective_pallets
-- Datei: prisma/migrations/33_add_shipments_effective_pallets.sql
--
-- Idempotent.
-- Backfill via recalcAggregateForShipment beim nächsten
-- Edit/Save jeder Sendung. Bulk-Backfill als Backlog.

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS effective_pallets DECIMAL(8,2);
