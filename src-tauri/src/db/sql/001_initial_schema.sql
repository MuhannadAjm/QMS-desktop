-- Migration 001: Initial Schema
-- All core QMS Desktop tables.
-- Dependency order: users → documents → document_revisions → risks → complaints →
--   audits → audit_findings → non_conformities → capas → attachments →
--   activity_log → document_links
-- settings has no FK deps so it is first after the migration marker.

CREATE TABLE IF NOT EXISTS settings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    key        TEXT    NOT NULL UNIQUE,
    value      TEXT,
    updated_at TEXT    NOT NULL
);

INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
    ('company_name',       '',             datetime('now')),
    ('company_logo_path',  '',             datetime('now')),
    ('timezone',           'UTC',          datetime('now')),
    ('date_format',        'YYYY-MM-DD',   datetime('now'));

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    full_name     TEXT    NOT NULL,
    email         TEXT,
    role          TEXT    NOT NULL DEFAULT 'User',
    password_hash TEXT    NOT NULL,
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_number     TEXT    NOT NULL UNIQUE,
    title          TEXT    NOT NULL,
    category       TEXT,
    status         TEXT    NOT NULL DEFAULT 'UNDER PROCESS',
    version        TEXT    NOT NULL DEFAULT '1.0',
    revision_date  TEXT,
    effective_date TEXT,
    owner_id       INTEGER REFERENCES users(id),
    approver_id    INTEGER REFERENCES users(id),
    file_path      TEXT,
    description    TEXT,
    created_by     INTEGER REFERENCES users(id),
    created_at     TEXT    NOT NULL,
    updated_at     TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS document_revisions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id    INTEGER NOT NULL REFERENCES documents(id),
    version        TEXT    NOT NULL,
    change_summary TEXT,
    file_path      TEXT,
    revised_by     INTEGER REFERENCES users(id),
    revised_at     TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS risks (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    risk_number         TEXT    NOT NULL UNIQUE,
    title               TEXT    NOT NULL,
    description         TEXT,
    category            TEXT,
    process             TEXT,
    severity            INTEGER NOT NULL DEFAULT 1,
    likelihood          INTEGER NOT NULL DEFAULT 1,
    risk_score          INTEGER GENERATED ALWAYS AS (severity * likelihood) STORED,
    risk_level          TEXT,
    status              TEXT    NOT NULL DEFAULT 'OPEN',
    mitigation_plan     TEXT,
    residual_severity   INTEGER,
    residual_likelihood INTEGER,
    residual_score      INTEGER,
    owner_id            INTEGER REFERENCES users(id),
    review_date         TEXT,
    closed_at           TEXT,
    created_by          INTEGER REFERENCES users(id),
    created_at          TEXT    NOT NULL,
    updated_at          TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS complaints (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    complaint_number TEXT    NOT NULL UNIQUE,
    customer_name    TEXT    NOT NULL,
    customer_id      TEXT    NOT NULL,
    title            TEXT    NOT NULL,
    description      TEXT,
    category         TEXT,
    received_date    TEXT    NOT NULL,
    status           TEXT    NOT NULL DEFAULT 'OPEN',
    priority         TEXT             DEFAULT 'MEDIUM',
    assigned_to      INTEGER REFERENCES users(id),
    root_cause       TEXT,
    resolution       TEXT,
    closed_at        TEXT,
    created_by       INTEGER REFERENCES users(id),
    created_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS audits (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    audit_number     TEXT    NOT NULL UNIQUE,
    title            TEXT    NOT NULL,
    audit_type       TEXT,
    scope            TEXT,
    standard         TEXT             DEFAULT 'ISO 9001:2015',
    planned_date     TEXT,
    actual_date      TEXT,
    status           TEXT    NOT NULL DEFAULT 'OPEN',
    lead_auditor_id  INTEGER REFERENCES users(id),
    auditee          TEXT,
    summary          TEXT,
    closed_at        TEXT,
    created_by       INTEGER REFERENCES users(id),
    created_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_findings (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    audit_id       INTEGER NOT NULL REFERENCES audits(id),
    finding_number TEXT    NOT NULL,
    finding_type   TEXT    NOT NULL DEFAULT 'NC',
    clause_ref     TEXT,
    description    TEXT    NOT NULL,
    evidence       TEXT,
    status         TEXT    NOT NULL DEFAULT 'OPEN',
    created_at     TEXT    NOT NULL,
    updated_at     TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS non_conformities (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    nc_number          TEXT    NOT NULL UNIQUE,
    title              TEXT    NOT NULL,
    description        TEXT,
    source             TEXT,
    source_id          INTEGER,
    finding_id         INTEGER REFERENCES audit_findings(id),
    severity           TEXT             DEFAULT 'MINOR',
    status             TEXT    NOT NULL DEFAULT 'OPEN',
    detected_date      TEXT    NOT NULL,
    assigned_to        INTEGER REFERENCES users(id),
    containment_action TEXT,
    closed_at          TEXT,
    created_by         INTEGER REFERENCES users(id),
    created_at         TEXT    NOT NULL,
    updated_at         TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS capas (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    capa_number          TEXT    NOT NULL UNIQUE,
    title                TEXT    NOT NULL,
    type                 TEXT    NOT NULL DEFAULT 'CORRECTIVE',
    description          TEXT,
    source               TEXT,
    source_id            INTEGER,
    nc_id                INTEGER REFERENCES non_conformities(id),
    status               TEXT    NOT NULL DEFAULT 'OPEN',
    priority             TEXT             DEFAULT 'MEDIUM',
    root_cause           TEXT,
    root_cause_method    TEXT,
    action_plan          TEXT,
    target_date          TEXT,
    assigned_to          INTEGER REFERENCES users(id),
    effectiveness_check  TEXT,
    effectiveness_date   TEXT,
    effectiveness_result TEXT,
    closed_at            TEXT,
    created_by           INTEGER REFERENCES users(id),
    created_at           TEXT    NOT NULL,
    updated_at           TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    module      TEXT    NOT NULL,
    record_id   INTEGER NOT NULL,
    file_name   TEXT    NOT NULL,
    file_path   TEXT    NOT NULL,
    file_size   INTEGER,
    mime_type   TEXT,
    uploaded_by INTEGER REFERENCES users(id),
    uploaded_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    module       TEXT    NOT NULL,
    record_id    INTEGER NOT NULL,
    action       TEXT    NOT NULL,
    description  TEXT,
    performed_by INTEGER REFERENCES users(id),
    performed_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS document_links (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES documents(id),
    module      TEXT    NOT NULL,
    record_id   INTEGER NOT NULL,
    linked_at   TEXT    NOT NULL
);
