# Database Schema

SQLite database located at: `%APPDATA%\QMSDesktop\qms.db`

---

## Migration History

| Version | File | Date | Description |
|---|---|---|---|
| 001 | `001_initial_schema.sql` | Phase 1–2 | Full initial schema — all tables |
| 002 | `002_phase3_auth.sql` | Phase 3 | Settings defaults, auth keys, role values |
| 003 | `003_phase4_documents.sql` | Phase 4 | Document-related settings (doc_prefix, etc.) |
| 004 | `004_phase6_risks_complaints.sql` | Phase 6 | 4 columns added to risks |
| 005 | `005_phase7_audits_nc.sql` | Phase 7 | 7 columns across audits, audit_findings, non_conformities |

---

## Tables

### `schema_migrations`
Tracks which migrations have been applied.

| Column | Type | Notes |
|---|---|---|
| version | TEXT PK | e.g. '001' |
| description | TEXT | e.g. 'initial_schema' |
| applied_at | TEXT | datetime |

---

### `settings`
Key-value settings store.

| Column | Type |
|---|---|
| key | TEXT PK |
| value | TEXT |

**Keys used by the application:**

| Key | Default | Description |
|---|---|---|
| `company_name` | '' | Displayed in print headers |
| `doc_prefix` | 'DOC' | Auto-number prefix for documents |
| `capa_prefix` | 'CAPA' | Auto-number prefix for CAPAs |
| `risk_prefix` | 'RISK' | Auto-number prefix for risks |
| `complaint_prefix` | 'COMP' | Auto-number prefix for complaints |
| `audit_prefix` | 'AUDIT' | Auto-number prefix for audits |
| `nc_prefix` | 'NC' | Auto-number prefix for non-conformities |

---

### `users`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| username | TEXT UNIQUE NOT NULL | |
| full_name | TEXT NOT NULL | |
| email | TEXT | |
| role | TEXT NOT NULL | Admin/QualityManager/Auditor/Employee/Viewer |
| password_hash | TEXT NOT NULL | Argon2id (`argon2` crate v0.5, m=19456 t=2 p=1) — PHC string |
| is_active | INTEGER NOT NULL DEFAULT 1 | |
| created_at | TEXT | |
| updated_at | TEXT | |

---

### `documents`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| doc_number | TEXT NOT NULL | {prefix}-{YYYY}-{NNNN} |
| title | TEXT NOT NULL | |
| category | TEXT NOT NULL | |
| version | TEXT NOT NULL | |
| status | TEXT NOT NULL | CONTROLLED/UNDER PROCESS/OBSOLETE |
| owner_id | INTEGER FK users | |
| effective_date | TEXT | |
| revision_date | TEXT | |
| description | TEXT | |
| file_path | TEXT | |
| created_by | INTEGER FK users | |
| created_at | TEXT | |
| updated_at | TEXT | |

---

### `document_revisions`

| Column | Type |
|---|---|
| id | INTEGER PK |
| document_id | INTEGER FK documents |
| version | TEXT |
| revised_by | INTEGER FK users |
| revised_at | TEXT |
| notes | TEXT |

---

### `capas`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| capa_number | TEXT NOT NULL | |
| title | TEXT NOT NULL | |
| capa_type | TEXT | Corrective/Preventive/Improvement |
| source | TEXT | Source type |
| nc_id | INTEGER FK non_conformities | |
| root_cause | TEXT | |
| root_cause_method | TEXT | |
| action_plan | TEXT | |
| due_date | TEXT | |
| responsible_user_id | INTEGER FK users | |
| description | TEXT | |
| priority | TEXT | LOW/MEDIUM/HIGH/CRITICAL |
| effectiveness_check | TEXT | |
| status | TEXT | OPEN/CLOSED |
| closed_at | TEXT | |
| created_by | INTEGER FK users | |
| created_at | TEXT | |
| updated_at | TEXT | |

---

### `risks`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| risk_number | TEXT NOT NULL | |
| title | TEXT NOT NULL | Hazard description |
| category | TEXT | |
| process | TEXT | |
| source | TEXT | |
| who_might_be_affected | TEXT | Added migration 004 |
| severity | INTEGER NOT NULL | 1–5 |
| likelihood | INTEGER NOT NULL | 1–5 |
| risk_score | INTEGER GENERATED | severity × likelihood |
| risk_level | TEXT | LOW/MEDIUM/HIGH/CRITICAL (set by Rust) |
| mitigation | TEXT | |
| responsible_user_id | INTEGER FK users | |
| review_date | TEXT | Added migration 004 |
| status | TEXT | OPEN/CLOSED |
| closed_at | TEXT | Added migration 004 |
| created_by | INTEGER FK users | |
| created_at | TEXT | |
| updated_at | TEXT | |

---

### `complaints`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| complaint_number | TEXT NOT NULL | |
| customer_name | TEXT NOT NULL | |
| customer_id | TEXT NOT NULL | |
| title | TEXT NOT NULL | |
| description | TEXT | |
| category | TEXT | |
| received_date | TEXT | |
| priority | TEXT | LOW/MEDIUM/HIGH |
| issued_by_user_id | INTEGER FK users | |
| root_cause | TEXT | |
| resolution | TEXT | |
| status | TEXT | OPEN/CLOSED |
| closed_at | TEXT | |
| created_by | INTEGER FK users | |
| created_at | TEXT | |
| updated_at | TEXT | |

---

### `audits`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| audit_number | TEXT NOT NULL | {prefix}-{YYYY}-{NNNN} |
| title | TEXT NOT NULL | |
| audit_type | TEXT | Internal Audit/External Audit/etc. |
| department | TEXT | **Added migration 005** |
| scope | TEXT | |
| standard | TEXT | e.g. ISO 9001:2015 |
| planned_date | TEXT | |
| actual_date | TEXT | Audit date |
| status | TEXT | OPEN/CLOSED |
| lead_auditor_id | INTEGER FK users | |
| auditee | TEXT | |
| summary | TEXT | Recommended actions |
| closed_at | TEXT | |
| created_by | INTEGER FK users | |
| created_at | TEXT | |
| updated_at | TEXT | |

---

### `audit_findings`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| audit_id | INTEGER FK audits | |
| finding_number | TEXT NOT NULL | F-001, F-002… |
| finding_type | TEXT NOT NULL | NC/OFI/Observation/Positive |
| clause_ref | TEXT | Standard clause reference |
| description | TEXT NOT NULL | Finding text |
| evidence | TEXT | |
| severity | TEXT NOT NULL DEFAULT 'LOW' | **Added migration 005** |
| recommended_action | TEXT | **Added migration 005** |
| is_non_conformity | INTEGER NOT NULL DEFAULT 0 | **Added migration 005** — 0/1 |
| related_nc_id | INTEGER FK non_conformities | **Added migration 005** |
| status | TEXT | OPEN/CLOSED |
| created_by | INTEGER FK users | **Added migration 005** |
| created_at | TEXT | |
| updated_at | TEXT | |

---

### `non_conformities`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| nc_number | TEXT NOT NULL | {prefix}-{YYYY}-{NNNN} |
| title | TEXT NOT NULL | Main description |
| description | TEXT | Detailed description |
| source | TEXT | AUDIT/CUSTOMER_COMPLAINT/etc. |
| source_id | INTEGER | Source record ID (e.g. audit_id) |
| finding_id | INTEGER FK audit_findings | |
| severity | TEXT NOT NULL DEFAULT 'MINOR' | Application uses LOW/MEDIUM/HIGH/CRITICAL |
| status | TEXT | OPEN/IN_REVIEW/CLOSED |
| detected_date | TEXT | |
| assigned_to | INTEGER FK users | Responsible user |
| containment_action | TEXT | |
| related_capa_id | INTEGER FK capas | **Added migration 005** |
| closed_at | TEXT | |
| created_by | INTEGER FK users | |
| created_at | TEXT | |
| updated_at | TEXT | |

---

### `attachments`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| module | TEXT NOT NULL | 'audit'/'nc'/'capa'/'risk'/'complaint'/'document' |
| record_id | INTEGER NOT NULL | ID of the parent record |
| file_name | TEXT NOT NULL | Original filename (display only) |
| file_path | TEXT NOT NULL | Stored filename in uploads dir |
| file_size | INTEGER | Bytes |
| mime_type | TEXT | |
| uploaded_by | INTEGER FK users | |
| uploaded_at | TEXT | |

---

### `activity_log`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| module | TEXT NOT NULL | 'audit'/'nc'/'capa'/'risk'/'complaint'/'document' |
| record_id | INTEGER NOT NULL | |
| action | TEXT NOT NULL | CREATED/UPDATED/CLOSED/REOPENED/etc. |
| description | TEXT | Human-readable description |
| performed_by | INTEGER FK users | |
| performed_at | TEXT | |

---

## Storage Directories

All created by `create_storage_directories()` at app startup.

| Path | Module |
|---|---|
| `%APPDATA%\QMSDesktop\uploads\documents\` | Documents |
| `%APPDATA%\QMSDesktop\uploads\capa\` | CAPAs |
| `%APPDATA%\QMSDesktop\uploads\risks\` | Risks |
| `%APPDATA%\QMSDesktop\uploads\complaints\` | Complaints |
| `%APPDATA%\QMSDesktop\uploads\audits\` | Audits |
| `%APPDATA%\QMSDesktop\uploads\nc\` | Non-Conformities |
