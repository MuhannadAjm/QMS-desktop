-- Migration 006: Phase 8B — Cross-Module Workflow Linking
-- Adds related_nc_id and related_capa_id columns to risks and complaints
-- so each source record tracks which NC/CAPA was generated from it.

ALTER TABLE risks ADD COLUMN related_nc_id   INTEGER REFERENCES non_conformities(id);
ALTER TABLE risks ADD COLUMN related_capa_id  INTEGER REFERENCES capas(id);

ALTER TABLE complaints ADD COLUMN related_nc_id   INTEGER REFERENCES non_conformities(id);
ALTER TABLE complaints ADD COLUMN related_capa_id  INTEGER REFERENCES capas(id);
