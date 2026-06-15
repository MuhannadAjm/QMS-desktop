-- Migration 004: Phase 6 — Risks and Complaints expansion
-- Adds missing columns to the risks table required by the Risks module.
-- The complaints table already has all required columns from migration 001.

ALTER TABLE risks ADD COLUMN source TEXT;
ALTER TABLE risks ADD COLUMN who_might_be_affected TEXT;
ALTER TABLE risks ADD COLUMN recommended_actions TEXT;
ALTER TABLE risks ADD COLUMN time_scale TEXT;
