-- P0-6: NV-Tour Status-Reduktion 5→3
-- Datei: prisma/migrations/37_nv_touren_status_reduce.sql
--
-- Vorher: PLANNING/DISPATCHED/IN_PROGRESS/COMPLETED/FAILED
-- Nachher: PLANNING/IN_PROGRESS/COMPLETED
--
-- Idempotent.

UPDATE nv_touren SET status = 'IN_PROGRESS'
  WHERE status = 'DISPATCHED';

UPDATE nv_touren SET status = 'COMPLETED'
  WHERE status = 'FAILED';
