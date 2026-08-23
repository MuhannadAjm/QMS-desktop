-- Migration 009: preserve the historical meaning of a Risk's source
--
-- DEFECT BEING CORRECTED
--   Migration 008 introduced the risk_sources master table, and
--   rename_risk_source re-pointed existing risks with
--       UPDATE risks SET source = <new> WHERE source = <old>
--   That means renaming a master value retroactively rewrites the label on
--   already-recorded Risks. A risk raised under "Incident" would afterwards
--   read "Security Incident" — a different statement about what was assessed,
--   applied silently to a controlled record with no audit trail.
--
--   This also made the codebase internally inconsistent: complaints already
--   keep customer_name/customer_id as a historical TEXT snapshot ALONGSIDE the
--   customer_ref_id FK, specifically so a later customer rename cannot rewrite
--   closed complaints. Risks now follow that same model.
--
-- MODEL
--   risks.source     TEXT     — immutable snapshot of the label chosen when the
--                               risk was recorded. NEVER rewritten by an admin
--                               action. This is what the UI displays.
--   risks.source_id  INTEGER  — stable FK to risk_sources. Survives renames and
--                               is what usage counting and traceability join on.
--
--   Renaming a master value therefore changes only future selections and the
--   master list itself. Historical risks keep the wording they were assessed
--   under, while remaining traceable to the master row via the FK.
--
--   No data is duplicated beyond the FK: the TEXT column already existed
--   (migration 004) and is simply no longer treated as mutable.

-- Appended, nullable — see the append-only note in migration 008.
ALTER TABLE risks ADD COLUMN source_id INTEGER REFERENCES risk_sources(id);

-- Link existing risks to their master row by exact name match. Risks whose
-- source is free text that never matched a master value (or is empty) keep
-- source_id NULL and continue to display their original text unchanged.
UPDATE risks
   SET source_id = (SELECT rs.id FROM risk_sources rs WHERE rs.name = risks.source)
 WHERE source IS NOT NULL
   AND TRIM(source) <> ''
   AND EXISTS (SELECT 1 FROM risk_sources rs WHERE rs.name = risks.source);

CREATE INDEX IF NOT EXISTS idx_risks_source_id ON risks(source_id);
