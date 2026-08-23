-- Migration 008: Administration & Master Data foundation
--
-- Additive only. Every statement either creates a new table or APPENDS a column.
-- No existing column is reordered, renamed, or dropped.
--
-- WHY APPEND-ONLY MATTERS HERE: every list/get query in src-tauri/src/commands/*.rs
-- reads results positionally (495 `row.get(N)` calls, zero name-based lookups) via
-- shared constants such as CAPA_SQL / COMPLAINT_SQL / RISK_SQL. Inserting a column
-- into the middle of a table would not break those queries by itself, but appending
-- a column to one of those SELECT lists shifts nothing, whereas inserting into the
-- middle silently remaps every later index onto the wrong field. New columns are
-- therefore always appended, and any SELECT list change must append too.

-- ── 1. Risk Source master ────────────────────────────────────────────────────
-- Replaces the hard-coded RISK_SOURCES array in src/types/risk.ts:62.
-- Values are administrator-managed. Rows are never hard-deleted once referenced
-- by a risk: risks.source stores the source NAME as free text (migration 004),
-- so historical risks keep displaying their original value even if the master
-- row is later renamed or deactivated.
CREATE TABLE IF NOT EXISTS risk_sources (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
);

-- Seeded as SUGGESTIONS only — the administrator may rename, reorder, or
-- deactivate any of these. INSERT OR IGNORE keeps re-runs harmless.
INSERT OR IGNORE INTO risk_sources (name, sort_order, is_active, created_at, updated_at) VALUES
    ('Internal Audit',      10, 1, datetime('now'), datetime('now')),
    ('Customer Feedback',   20, 1, datetime('now'), datetime('now')),
    ('Process Review',      30, 1, datetime('now'), datetime('now')),
    ('Management Review',   40, 1, datetime('now'), datetime('now')),
    ('Supplier Assessment', 50, 1, datetime('now'), datetime('now')),
    ('Incident',            60, 1, datetime('now'), datetime('now')),
    ('Other',               70, 1, datetime('now'), datetime('now'));

-- ── 2. Customer master ───────────────────────────────────────────────────────
-- Local QMS master data. Customer operational data stays in this SQLite file;
-- nothing here is ever sent to the licensing backend.
CREATE TABLE IF NOT EXISTS customers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_code TEXT    NOT NULL UNIQUE,   -- business ID, shown in the UI
    customer_name TEXT    NOT NULL,
    contact_email TEXT,
    contact_phone TEXT,
    notes         TEXT,
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_name   ON customers(customer_name);
CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(is_active);

-- ── 3. Complaints → Customer relationship ────────────────────────────────────
-- APPENDED, nullable. The existing complaints.customer_name / customer_id TEXT
-- columns are deliberately RETAINED and still populated: they are the historical
-- record of what the customer was called at the time the complaint was raised.
-- If a customer is later renamed, historical complaints must not silently change.
-- customer_ref_id is the stable FK used for new records and for filtering.
ALTER TABLE complaints ADD COLUMN customer_ref_id INTEGER REFERENCES customers(id);

CREATE INDEX IF NOT EXISTS idx_complaints_customer_ref ON complaints(customer_ref_id);

-- ── 4. User assignment eligibility ───────────────────────────────────────────
-- Explicitly separate from role. A user has a role (what they may DO) and,
-- independently, eligibility (which assignment selectors they APPEAR IN).
ALTER TABLE users ADD COLUMN can_be_capa_responsible INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN can_be_lead_auditor     INTEGER NOT NULL DEFAULT 0;

-- Backfill from existing roles so upgrading does NOT empty the existing
-- assignment dropdowns. Before this migration every active user appeared in
-- both selectors; defaulting everyone to 0 would have silently emptied them,
-- which is a functional regression on an existing install.
UPDATE users SET can_be_capa_responsible = 1
 WHERE role IN ('Admin', 'QualityManager', 'Employee');

UPDATE users SET can_be_lead_auditor = 1
 WHERE role IN ('Admin', 'QualityManager', 'Auditor');

-- ── 5. Document approval / rejection metadata ────────────────────────────────
-- documents already had approver_id (the person NOMINATED to approve) from
-- migration 001, but nothing recording that approval actually happened.
-- These are system-generated on the approve/reject commands and are never
-- accepted from client input.
ALTER TABLE documents ADD COLUMN approval_date    TEXT;
ALTER TABLE documents ADD COLUMN approved_by      INTEGER REFERENCES users(id);
ALTER TABLE documents ADD COLUMN rejected_at      TEXT;
ALTER TABLE documents ADD COLUMN rejected_by      INTEGER REFERENCES users(id);
ALTER TABLE documents ADD COLUMN rejection_reason TEXT;

-- NOTE on audits.standard: migration 001 declares DEFAULT 'ISO 9001:2015'.
-- SQLite cannot ALTER a column default without rebuilding the table, and
-- rebuilding a live QMS table to change a default that is overwritten on every
-- insert anyway is not a trade worth making. The application always supplies
-- the value explicitly, so the new 'ISO 9001' default is applied in the Rust
-- insert and the React form default instead. Historical audit records keep
-- whatever standard reference the user originally entered.
