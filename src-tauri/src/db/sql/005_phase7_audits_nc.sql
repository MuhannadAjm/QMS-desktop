-- Migration 005: Phase 7 — Audits and Non-Conformities
-- Adds columns needed for Phase 7 Audit findings and NC→CAPA linkage.

-- audits: add department (audited department, distinct from auditee org)
ALTER TABLE audits ADD COLUMN department TEXT;

-- audit_findings: add severity, recommended_action, NC conversion fields, created_by
ALTER TABLE audit_findings ADD COLUMN severity TEXT NOT NULL DEFAULT 'LOW';
ALTER TABLE audit_findings ADD COLUMN recommended_action TEXT;
ALTER TABLE audit_findings ADD COLUMN is_non_conformity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE audit_findings ADD COLUMN related_nc_id INTEGER REFERENCES non_conformities(id);
ALTER TABLE audit_findings ADD COLUMN created_by INTEGER REFERENCES users(id);

-- non_conformities: add reverse CAPA link for display without extra joins in list
ALTER TABLE non_conformities ADD COLUMN related_capa_id INTEGER REFERENCES capas(id);
