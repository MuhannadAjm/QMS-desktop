# QMS Desktop — Database Schema

Database engine: **SQLite** (via tauri-plugin-sql)
Database file location: `%APPDATA%\QMSDesktop\data.db`
Migrations run in order on first launch and on each version upgrade.

---

## Naming Conventions

- Table names: `snake_case`, plural (e.g. `capas`, `risks`)
- Primary keys: `id INTEGER PRIMARY KEY AUTOINCREMENT`
- Foreign keys: `<table_singular>_id INTEGER`
- Timestamps: `created_at TEXT` / `updated_at TEXT` (ISO 8601, stored as UTC)
- Status fields: `TEXT` with enforced values at application layer
- Boolean: `INTEGER` (0 = false, 1 = true)

---

## Table: users

```sql
CREATE TABLE users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT    NOT NULL UNIQUE,
    full_name       TEXT    NOT NULL,
    email           TEXT,
    role            TEXT    NOT NULL DEFAULT 'User',  -- Admin | QualityManager | User
    password_hash   TEXT    NOT NULL,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
);
```

---

## Table: settings

```sql
CREATE TABLE settings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    key             TEXT    NOT NULL UNIQUE,
    value           TEXT,
    updated_at      TEXT    NOT NULL
);
-- Keys: company_name, company_logo_path, timezone, date_format, default_currency
```

---

## Table: documents

```sql
CREATE TABLE documents (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_number          TEXT    NOT NULL UNIQUE,
    title               TEXT    NOT NULL,
    category            TEXT,        -- Policy | Procedure | Work Instruction | Form | Manual | Record | Specification | Other
    status              TEXT    NOT NULL DEFAULT 'UNDER PROCESS', -- UNDER PROCESS | CONTROLLED | OBSOLETE
    version             TEXT    NOT NULL DEFAULT '1.0',
    revision_date       TEXT,        -- set to datetime('now') on status change
    effective_date      TEXT,        -- user-set approval date (displayed as "Approval Date" in UI)
    owner_id            INTEGER REFERENCES users(id),
    approver_id         INTEGER REFERENCES users(id),
    file_path           TEXT,        -- stored filename under uploads/documents/ (e.g. 42_1718345678901234.pdf)
    original_file_name  TEXT,        -- user-visible filename (e.g. Quality_Policy_v1.pdf) — added in Migration 003
    description         TEXT,
    created_by          INTEGER REFERENCES users(id),
    created_at          TEXT    NOT NULL,
    updated_at          TEXT    NOT NULL
);
```

**Column notes:**
- `doc_number` — auto-generated as `{document_prefix}-{YYYY}-{NNNN}` using the `document_prefix` settings key
- `category` — maps to "Document Type" in the UI; not `type` because `type` is a reserved SQL word
- `effective_date` — maps to "Approval Date" in the UI
- `file_path` — stored as `{document_id}_{timestamp_micros}.{ext}` (unique per upload, avoids collisions)
- `original_file_name` — the original filename shown to users; stored separately from `file_path`

---

## Table: document_revisions

```sql
CREATE TABLE document_revisions (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id         INTEGER NOT NULL REFERENCES documents(id),
    version             TEXT    NOT NULL,
    change_summary      TEXT,
    file_path           TEXT,        -- stored filename if a file was attached in this revision
    original_file_name  TEXT,        -- user-visible filename for this revision — added in Migration 003
    revised_by          INTEGER REFERENCES users(id),
    revised_at          TEXT    NOT NULL
);
```

---

## Table: risks

```sql
CREATE TABLE risks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    risk_number     TEXT    NOT NULL UNIQUE,
    title           TEXT    NOT NULL,
    description     TEXT,
    category        TEXT,
    process         TEXT,
    severity        INTEGER NOT NULL DEFAULT 1,        -- 1–5
    likelihood      INTEGER NOT NULL DEFAULT 1,        -- 1–5
    risk_score      INTEGER GENERATED ALWAYS AS (severity * likelihood) STORED,
    risk_level      TEXT,                              -- LOW | MEDIUM | HIGH | CRITICAL (computed by app)
    status          TEXT    NOT NULL DEFAULT 'OPEN',   -- OPEN | CLOSED
    mitigation_plan TEXT,
    residual_severity   INTEGER,
    residual_likelihood INTEGER,
    residual_score  INTEGER,
    owner_id        INTEGER REFERENCES users(id),
    review_date     TEXT,
    closed_at       TEXT,
    created_by      INTEGER REFERENCES users(id),
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
);
```

---

## Table: complaints

```sql
CREATE TABLE complaints (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    complaint_number TEXT   NOT NULL UNIQUE,
    customer_name   TEXT    NOT NULL,
    customer_id     TEXT    NOT NULL,
    title           TEXT    NOT NULL,
    description     TEXT,
    category        TEXT,
    received_date   TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'OPEN',   -- OPEN | CLOSED
    priority        TEXT    DEFAULT 'MEDIUM',          -- LOW | MEDIUM | HIGH
    assigned_to     INTEGER REFERENCES users(id),
    root_cause      TEXT,
    resolution      TEXT,
    closed_at       TEXT,
    created_by      INTEGER REFERENCES users(id),
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
);
```

---

## Table: audits

```sql
CREATE TABLE audits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    audit_number    TEXT    NOT NULL UNIQUE,
    title           TEXT    NOT NULL,
    audit_type      TEXT,                              -- Internal | External | Supplier
    scope           TEXT,
    standard        TEXT    DEFAULT 'ISO 9001:2015',
    planned_date    TEXT,
    actual_date     TEXT,
    status          TEXT    NOT NULL DEFAULT 'OPEN',   -- OPEN | CLOSED
    lead_auditor_id INTEGER REFERENCES users(id),
    auditee         TEXT,
    summary         TEXT,
    closed_at       TEXT,
    created_by      INTEGER REFERENCES users(id),
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
);
```

---

## Table: audit_findings

```sql
CREATE TABLE audit_findings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    audit_id        INTEGER NOT NULL REFERENCES audits(id),
    finding_number  TEXT    NOT NULL,
    finding_type    TEXT    NOT NULL DEFAULT 'NC',     -- NC | OFI | Observation | Positive
    clause_ref      TEXT,
    description     TEXT    NOT NULL,
    evidence        TEXT,
    status          TEXT    NOT NULL DEFAULT 'OPEN',
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
);
```

---

## Table: non_conformities

```sql
CREATE TABLE non_conformities (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nc_number       TEXT    NOT NULL UNIQUE,
    title           TEXT    NOT NULL,
    description     TEXT,
    source          TEXT,                              -- Audit | Complaint | Risk | Internal
    source_id       INTEGER,                           -- ID of source record
    finding_id      INTEGER REFERENCES audit_findings(id),
    severity        TEXT    DEFAULT 'MINOR',           -- MINOR | MAJOR | CRITICAL
    status          TEXT    NOT NULL DEFAULT 'OPEN',   -- OPEN | CLOSED
    detected_date   TEXT    NOT NULL,
    assigned_to     INTEGER REFERENCES users(id),
    containment_action TEXT,
    closed_at       TEXT,
    created_by      INTEGER REFERENCES users(id),
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
);
```

---

## Table: capas

```sql
CREATE TABLE capas (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    capa_number     TEXT    NOT NULL UNIQUE,
    title           TEXT    NOT NULL,
    type            TEXT    NOT NULL DEFAULT 'CORRECTIVE', -- CORRECTIVE | PREVENTIVE
    description     TEXT,
    source          TEXT,                              -- NC | Risk | Complaint | Audit | Internal
    source_id       INTEGER,
    nc_id           INTEGER REFERENCES non_conformities(id),
    status          TEXT    NOT NULL DEFAULT 'OPEN',   -- OPEN | CLOSED
    priority        TEXT    DEFAULT 'MEDIUM',          -- LOW | MEDIUM | HIGH | CRITICAL
    root_cause      TEXT,
    root_cause_method TEXT,                            -- 5-Why | Fishbone | Fault Tree | Other
    action_plan     TEXT,
    target_date     TEXT,
    assigned_to     INTEGER REFERENCES users(id),
    effectiveness_check TEXT,
    effectiveness_date  TEXT,
    effectiveness_result TEXT,                         -- EFFECTIVE | NOT EFFECTIVE
    closed_at       TEXT,
    created_by      INTEGER REFERENCES users(id),
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
);
```

---

## Table: attachments

```sql
CREATE TABLE attachments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    module          TEXT    NOT NULL,                  -- capa | risk | complaint | audit | nc | document
    record_id       INTEGER NOT NULL,
    file_name       TEXT    NOT NULL,
    file_path       TEXT    NOT NULL,                  -- relative path under uploads/<module>/
    file_size       INTEGER,
    mime_type       TEXT,
    uploaded_by     INTEGER REFERENCES users(id),
    uploaded_at     TEXT    NOT NULL
);
```

---

## Table: activity_log

```sql
CREATE TABLE activity_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    module          TEXT    NOT NULL,
    record_id       INTEGER NOT NULL,
    action          TEXT    NOT NULL,                  -- CREATED | UPDATED | STATUS_CHANGED | COMMENT | LINKED
    description     TEXT,
    performed_by    INTEGER REFERENCES users(id),
    performed_at    TEXT    NOT NULL
);
```

---

## Table: document_links

```sql
CREATE TABLE document_links (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id     INTEGER NOT NULL REFERENCES documents(id),
    module          TEXT    NOT NULL,                  -- capa | risk | complaint | audit | nc
    record_id       INTEGER NOT NULL,
    linked_at       TEXT    NOT NULL
);
```

---

## Risk Score Rules

| Score | Level |
|---|---|
| 1–4 | LOW |
| 5–9 | MEDIUM |
| 10–19 | HIGH |
| 20–25 | CRITICAL |

`risk_score = severity × likelihood` — computed column in SQLite.

---

## Auto-Generated Number Format

| Module | Format |
|---|---|
| Document | DOC-YYYY-NNN |
| Risk | RSK-YYYY-NNN |
| Complaint | CMP-YYYY-NNN |
| Audit | AUD-YYYY-NNN |
| Non-Conformity | NC-YYYY-NNN |
| CAPA | CPA-YYYY-NNN |

Numbers generated at creation time in the service layer.

---

## Migration Strategy

- Migrations live in `src-tauri/src/db/sql/` as numbered `.sql` files (embedded at compile time via `include_str!`).
- A `schema_migrations` table tracks applied migrations by version string.
- On every app launch, `db::init::initialize_database()` checks for unapplied migrations and runs them in order (idempotent).
- No manual DB tooling required by the end user.

```sql
CREATE TABLE schema_migrations (
    version     TEXT    NOT NULL PRIMARY KEY,
    description TEXT    NOT NULL DEFAULT '',
    applied_at  TEXT    NOT NULL
);
```

### Applied Migrations

| Version | Description | Phase | Key Changes |
|---|---|---|---|
| 001 | initial_schema | 2 | All 13 QMS tables |
| 002 | phase3_auth | 3 | `department` column on users; 12 settings keys |
| 003 | phase4_documents | 4 | `original_file_name TEXT` added to `documents` and `document_revisions` |
