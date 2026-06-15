-- Migration 002: Phase 3 — Auth and Settings expansion
-- Adds department column to users table.
-- Adds Phase 3 settings keys for company profile, quality system, and prefixes.

ALTER TABLE users ADD COLUMN department TEXT NOT NULL DEFAULT '';

INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
    ('quality_policy',   '',      datetime('now')),
    ('qms_scope',        '',      datetime('now')),
    ('departments',      '',      datetime('now')),
    ('address',          '',      datetime('now')),
    ('contact_email',    '',      datetime('now')),
    ('phone',            '',      datetime('now')),
    ('document_prefix',  'DOC',   datetime('now')),
    ('capa_prefix',      'CAPA',  datetime('now')),
    ('risk_prefix',      'RISK',  datetime('now')),
    ('complaint_prefix', 'COMP',  datetime('now')),
    ('audit_prefix',     'AUDIT', datetime('now')),
    ('nc_prefix',        'NC',    datetime('now'));
