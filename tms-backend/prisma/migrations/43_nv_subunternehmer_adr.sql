-- T-3.2.1: has_adr_license auf nv_subunternehmer
-- Datei: prisma/migrations/43_nv_subunternehmer_adr.sql
--
-- Hintergrund: subcontractors (FV-Sub-Tabelle) hat das Feld seit
-- Init, nv_subunternehmer (NV) nicht. Conflict-Detector
-- HAZMAT_DRIVER liest beide Spalten — NV-Side fehlte das Feld
-- (Comment in lib/conflicts.lib.ts:13 erwähnte Backlog).
--
-- Default false (konservativ — kein automatisches ADR für
-- existierende Subs).

ALTER TABLE nv_subunternehmer
  ADD COLUMN IF NOT EXISTS has_adr_license BOOLEAN NOT NULL DEFAULT false;
