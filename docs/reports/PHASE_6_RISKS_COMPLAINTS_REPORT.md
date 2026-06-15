# Phase Report: Phase 6 — Risks + Complaints

## Report Metadata

| Field | Value |
|---|---|
| Phase number | 6 |
| Phase name | Risks + Complaints |
| Date completed | 2026-06-15 |
| Reporter | Claude Code (claude-sonnet-4-6) |
| Session type | Full Risks and Complaints modules — 18 Rust commands, migration 004, new TypeScript types and services, full page rewrites, export/print |

---

## 1. Phase Name

Phase 6 — Risks + Complaints

---

## 2. Objective

Implement two complete, production-quality QMS modules backed by real SQLite data:

**Risks module:**
- Risk register with full CRUD (Create, Read, Update, Close, Reopen)
- Auto-generated risk numbers: `{risk_prefix}-{YYYY}-{NNNN}`
- Severity × likelihood 5×5 matrix with color-coded visual component
- Risk score auto-computed by SQLite GENERATED ALWAYS AS column
- Risk level computed by Rust (LOW/MEDIUM/HIGH/CRITICAL) and stored as TEXT
- Status workflow: OPEN → CLOSED
- File attachments stored in `%APPDATA%\QMSDesktop\uploads\risks\`
- Activity log for all risk mutations
- DetailsDrawer with 5 tabs: Details, Controls & Actions, Risk Matrix, Attachments, Activity
- KPI cards: Total, Open, High/Critical (score ≥ 10), Closed
- Export CSV/JSON, Print Risk Register
- Import button: notice-only modal (deferred)
- Rust permission enforcement: Admin/QM full; others view-only

**Complaints module:**
- Complaint register with full CRUD (Create, Read, Update, Close, Reopen)
- Auto-generated complaint numbers: `{complaint_prefix}-{YYYY}-{NNNN}`
- Required customer_name and customer_id on every complaint
- Customer filter dropdown dynamically built from loaded data
- Status workflow: OPEN → CLOSED
- File attachments stored in `%APPDATA%\QMSDesktop\uploads\complaints\`
- Activity log for all complaint mutations
- DetailsDrawer with 4 tabs: Details, Customer (dedicated card), Attachments, Activity
- KPI cards: Total, Open, Closed, Unique Customers (non-clickable)
- Export CSV/JSON, Print Complaint Register
- Import button: notice-only modal (deferred)
- Rust permission enforcement: Admin/QM full; others view-only

---

## 3. Files Created

| File | Description |
|---|---|
| `src-tauri/src/db/sql/004_phase6_risks_complaints.sql` | Migration 004 — ALTER TABLE to add 4 columns to risks |
| `src-tauri/src/commands/risks.rs` | 9 Rust Tauri commands for risk CRUD, status, attachments, activity |
| `src-tauri/src/commands/complaints.rs` | 9 Rust Tauri commands for complaint CRUD, status, attachments, activity |
| `src/types/risk.ts` | RiskListItem, RiskAttachment, RiskActivityEntry, constants, helper functions |
| `src/types/complaint.ts` | ComplaintListItem, ComplaintAttachment, ComplaintActivityEntry, constants, helpers |
| `src/services/riskService.ts` | TypeScript wrappers for all 9 risk Tauri commands |
| `src/services/complaintService.ts` | TypeScript wrappers for all 9 complaint Tauri commands |
| `docs/reports/PHASE_6_RISKS_COMPLAINTS_REPORT.md` | This file |

---

## 4. Files Modified

| File | Changes |
|---|---|
| `src-tauri/src/db/init.rs` | Added MIGRATION_004 constant and Migration entry |
| `src-tauri/src/commands/mod.rs` | Added `mod risks;`, `mod complaints;` + `pub use` exports for all 18 commands |
| `src-tauri/src/lib.rs` | Added 18 new commands to use imports and `generate_handler![]` |
| `src/services/exportService.ts` | Added exportRisksCSV, exportRisksJSON, exportComplaintsCSV, exportComplaintsJSON |
| `src/services/printService.ts` | Added printRiskRegister, printComplaintRegister; renamed existing win vars (docWin, capaWin) for Edit uniqueness |
| `src/pages/Risks.tsx` | Full rewrite from placeholder to complete Risks module |
| `src/pages/Complaints.tsx` | Full rewrite from placeholder to complete Complaints module |
| `CURRENT_PHASE.md` | Phase 6 COMPLETE; Phase 7 next |
| `DEVELOPMENT_LOG.md` | Phase 6 session entry prepended |
| `CLAUDE_HANDOFF.md` | Phase 6 complete; Rust/frontend structure updated; commands table updated; Phase 6 checklist added |
| `SECURITY_NOTES.md` | All 18 risk/complaint commands added to permission table |
| `RUNBOOK.md` | Risks and Complaints troubleshooting sections added |

---

## 5. Source Code Changed

**Yes.**

---

## 6. Database Changed

**Yes.** Migration 004 added 4 columns to the existing `risks` table:

```sql
ALTER TABLE risks ADD COLUMN source TEXT;
ALTER TABLE risks ADD COLUMN who_might_be_affected TEXT;
ALTER TABLE risks ADD COLUMN recommended_actions TEXT;
ALTER TABLE risks ADD COLUMN time_scale TEXT;
```

No new tables were created. The `complaints` table already had all required columns from migration 001.

---

## 7. Rust Commands Documentation

### Risks — 9 Commands

| Command | Permission | Description |
|---|---|---|
| `list_risks` | Any authenticated active user | 27-column SELECT with LEFT JOINs on users for responsible + created_by |
| `get_risk` | Any authenticated active user | Single risk by ID; same SELECT as list |
| `create_risk` | Admin or QualityManager | Auto-generates `{risk_prefix}-{YYYY}-{NNNN}`; computes risk_level; never writes risk_score (GENERATED column) |
| `update_risk` | Admin or QualityManager | Updates all editable fields; recomputes risk_level; never updates risk_score |
| `set_risk_status` | Admin or QualityManager | OPEN ↔ CLOSED; sets `closed_at = datetime('now')` on close; clears on reopen |
| `get_risk_activity` | Any authenticated active user | activity_log WHERE module='risk' AND record_id=? ORDER BY performed_at DESC |
| `attach_risk_file` | Admin or QualityManager | Validates extension whitelist; copies file to uploads_risks path; inserts into attachments table (module='risk') |
| `open_risk_attachment` | Any authenticated active user | Fetches file_path from attachments; opens via `cmd /c start "" {path}` |
| `list_risk_attachments` | Any authenticated active user | attachments WHERE module='risk' AND record_id=? |

### RISK_SQL Constant (27 columns, indices 0–26)

```sql
SELECT r.id, r.risk_number, r.title, r.description, r.category, r.process,
       r.source, r.who_might_be_affected,
       r.severity, r.likelihood, r.risk_score, r.risk_level, r.status,
       r.mitigation_plan, r.recommended_actions, r.time_scale,
       r.residual_severity, r.residual_likelihood, r.residual_score,
       r.owner_id AS responsible_user_id, ru.full_name AS responsible_user_name,
       r.review_date, r.closed_at,
       r.created_by, cu.full_name AS created_by_name,
       r.created_at, r.updated_at
FROM risks r
LEFT JOIN users ru ON r.owner_id = ru.id
LEFT JOIN users cu ON r.created_by = cu.id
```

### Complaints — 9 Commands

| Command | Permission | Description |
|---|---|---|
| `list_complaints` | Any authenticated active user | 19-column SELECT with LEFT JOINs on users for assigned_to + created_by |
| `get_complaint` | Any authenticated active user | Single complaint by ID; same SELECT as list |
| `create_complaint` | Admin or QualityManager | Validates customer_name and customer_id non-empty; auto-generates `{complaint_prefix}-{YYYY}-{NNNN}` |
| `update_complaint` | Admin or QualityManager | Validates customer_name and customer_id non-empty; updates all editable fields |
| `set_complaint_status` | Admin or QualityManager | OPEN ↔ CLOSED; sets/clears closed_at |
| `get_complaint_activity` | Any authenticated active user | activity_log WHERE module='complaint' AND record_id=? |
| `attach_complaint_file` | Admin or QualityManager | Validates extension; copies to uploads_complaints; inserts into attachments (module='complaint') |
| `open_complaint_attachment` | Any authenticated active user | Opens via `cmd /c start "" {path}` |
| `list_complaint_attachments` | Any authenticated active user | attachments WHERE module='complaint' AND record_id=? |

### COMPLAINT_SQL Constant (19 columns, indices 0–18)

```sql
SELECT c.id, c.complaint_number, c.customer_name, c.customer_id,
       c.title, c.description, c.category,
       c.received_date, c.status, c.priority,
       c.assigned_to AS issued_by_user_id, au.full_name AS issued_by_name,
       c.root_cause, c.resolution, c.closed_at,
       c.created_by, cu.full_name AS created_by_name,
       c.created_at, c.updated_at
FROM complaints c
LEFT JOIN users au ON c.assigned_to = au.id
LEFT JOIN users cu ON c.created_by = cu.id
```

---

## 8. TypeScript Types

### risk.ts

```typescript
interface RiskListItem {
  id: number; risk_number: string; title: string;
  description: string | null; category: string | null; process: string | null;
  source: string | null; who_might_be_affected: string | null;
  severity: number; likelihood: number; risk_score: number;
  risk_level: string | null; status: string;
  mitigation_plan: string | null; recommended_actions: string | null;
  time_scale: string | null;
  residual_severity: number | null; residual_likelihood: number | null; residual_score: number | null;
  responsible_user_id: number | null; responsible_user_name: string | null;
  review_date: string | null; closed_at: string | null;
  created_by: number | null; created_by_name: string | null;
  created_at: string; updated_at: string;
}
```

Helper functions exported: `computeRiskLevel(score)`, `riskLevelBadgeClass(level)`, `riskScoreCellClass(score)`.

### complaint.ts

```typescript
interface ComplaintListItem {
  id: number; complaint_number: string;
  customer_name: string; customer_id: string; title: string;
  description: string | null; category: string | null;
  received_date: string; status: string; priority: string | null;
  issued_by_user_id: number | null; issued_by_name: string | null;
  root_cause: string | null; resolution: string | null;
  closed_at: string | null;
  created_by: number | null; created_by_name: string | null;
  created_at: string; updated_at: string;
}
```

Helper function exported: `priorityBadgeClass(priority)`.

---

## 9. Page Features

### Risks.tsx

- **KPI Cards:** Total (navy, clickable resets filter), Open (amber, filters to OPEN), High/Critical (orange, filters score ≥ 10), Closed (green, filters to CLOSED)
- **ModuleToolbar:** New Risk / Refresh / Print / Export CSV / Export JSON / Import (notice)
- **FilterBar:** text search (risk_number, title, category, process) + status filter + category filter + risk level filter + clear
- **Data table columns:** Risk #, Hazard Description (title), Category, Score (colored badge), Level (colored badge), Status, Responsible, Created
- **DetailsDrawer (5 tabs):**
  - *Details* — all risk fields: hazard description, description, category, process, source, who might be affected, responsible, review date
  - *Controls & Actions* — existing controls (mitigation_plan), recommended actions, time scale, residual severity/likelihood/score
  - *Risk Matrix* — 5×5 color-coded grid with current risk's cell highlighted with ring; residual risk shown if available
  - *Attachments* — file list with attach button (Admin/QM), file open button
  - *Activity* — chronological log of all mutations with actor name and timestamp
- **Modals:** Create Risk, Edit Risk (severity/likelihood selectors with live score/level preview), Close Risk (confirmation), Reopen Risk (confirmation), Import Notice
- **Export:** 16-column CSV / structured JSON; reflects current filtered list
- **Print:** 9-column HTML register; company name header; print date footer

### Complaints.tsx

- **KPI Cards:** Total (navy), Open (amber), Closed (green), Unique Customers (purple, non-clickable — count of distinct customer_id values)
- **ModuleToolbar:** New Complaint / Refresh / Print / Export CSV / Export JSON / Import (notice)
- **FilterBar:** text search (complaint_number, title, customer_name, customer_id) + status filter + category filter + customer ID filter (dynamic) + clear
- **Data table columns:** Complaint #, Customer ID, Customer Name, Title, Received Date, Priority, Status, Issued By
- **DetailsDrawer (4 tabs):**
  - *Details* — all complaint fields: title, description, category, priority, received date, issued by, root cause, resolution, closed at
  - *Customer* — dedicated blue card showing customer_name and customer_id
  - *Attachments* — file list with attach button (Admin/QM), file open button
  - *Activity* — chronological log of all mutations
- **Modals:** Create Complaint (customer_name + customer_id required), Edit Complaint (same required fields), Close Complaint (confirmation), Reopen Complaint (confirmation), Import Notice
- **Export:** 14-column CSV / structured JSON; reflects current filtered list
- **Print:** 8-column HTML register

---

## 10. Permission Model

Both modules follow the same pattern established in Phase 5 (CAPA):

| Action | Risks | Complaints |
|---|---|---|
| View list | Any active user | Any active user |
| View details / activity | Any active user | Any active user |
| Open attachment | Any active user | Any active user |
| Create | Admin or QualityManager | Admin or QualityManager |
| Edit | Admin or QualityManager | Admin or QualityManager |
| Close / Reopen | Admin or QualityManager | Admin or QualityManager |
| Attach file | Admin or QualityManager | Admin or QualityManager |

Enforcement: each protected command receives `current_user_id: i64` from the frontend. The Rust `permissions::require_authenticated()` or `permissions::require_admin_or_quality_manager()` helper verifies the caller's role and active status in the database before any mutation.

---

## 11. Risk Score Logic

The `risks` table has:

```sql
risk_score INTEGER GENERATED ALWAYS AS (severity * likelihood) STORED
```

This is a SQLite computed column. Rust commands **never** include `risk_score` in `INSERT` or `UPDATE` statements. Attempting to do so would cause a runtime error ("cannot INSERT into generated column").

`risk_level` is a plain `TEXT` column. Rust computes it at INSERT/UPDATE time:

```rust
fn compute_risk_level(score: i64) -> &'static str {
    match score {
        1..=4  => "LOW",
        5..=9  => "MEDIUM",
        10..=19 => "HIGH",
        _      => "CRITICAL",
    }
}
```

The UI `computeRiskLevel()` function in `src/types/risk.ts` uses the same thresholds for the live preview in the Create/Edit modal.

The "High Risk" KPI card counts risks where `risk_score >= 10` (HIGH + CRITICAL combined), which aligns with the score threshold for the HIGH level.

---

## 12. Auto-Numbering

Both modules use the same auto-numbering pattern established in Phase 4 (Documents):

**Format:** `{prefix}-{YYYY}-{NNNN}`

**Risks:** Uses the `risk_prefix` settings key. Default: `RISK`. Example: `RISK-2026-0001`.

**Complaints:** Uses the `complaint_prefix` settings key. Default: `COMP`. Example: `COMP-2026-0001`.

Both settings keys were inserted in migration 002 (Phase 3) along with other prefix keys, so no additional migration was needed for them.

**Implementation pattern (same for both):**
```sql
SELECT COUNT(*) FROM risks WHERE risk_number LIKE ?1 || '-' || ?2 || '-%'
```
Count + 1 is formatted as 4-digit zero-padded string: `format!("{:04}", count + 1)`.

---

## 13. File Storage Architecture

**Storage paths** used (both already existed in `StoragePaths` from Phase 2):
- `paths.uploads_risks` → `%APPDATA%\QMSDesktop\uploads\risks\`
- `paths.uploads_complaints` → `%APPDATA%\QMSDesktop\uploads\complaints\`

**Stored filename pattern:**
```
{record_id}_{timestamp_micros}.{ext}
```

**Allowed extensions (validated in Rust before copy):**
`pdf`, `doc`, `docx`, `xls`, `xlsx`, `png`, `jpg`, `jpeg`

**DB record:** Stored in `attachments` table with `module = 'risk'` or `module = 'complaint'`, `record_id`, `file_name` (original), `file_path` (stored), `file_size` (bytes).

**Opening:** `cmd /c start "" {full_path}` — uses Windows default application for the file type.

---

## 14. Build Result

**TypeScript:** 0 errors (`npx tsc --noEmit` completed with no output).

Four TypeScript errors were encountered and fixed during implementation:

1. **Wrong import paths:** `ModuleToolbar` and `FilterBar` import paths were `'../components/...'` instead of `'../components/ui/...'`.
2. **Wrong ModuleToolbar prop:** `onExport` callback does not exist; the correct prop is `exportOptions: ExportOption[]` (array of `{label, onClick}` objects).
3. **Wrong FilterSelectConfig shape:** `FilterSelectConfig` does not accept `id` or `label`; the correct shape is `{ placeholder, value, options, onChange }`.
4. **Wrong prop name:** `hasActiveFilter` (singular) does not exist; the correct prop is `hasActiveFilters` (plural).

**Rust:** 0 errors (incremental compilation, no new Cargo dependencies added).

---

## 15. Forbidden Actions Confirmation

All 19 forbidden actions were respected in this phase:

1. Did not commit — no git commits made
2. Did not use git add . — no git staging performed
3. Did not touch .env files — no environment files accessed
4. Did not connect live external APIs — all data is local SQLite
5. Did not upload business data anywhere — no external network calls
6. Did not implement cloud sync — not applicable
7. Did not implement multi-device mode — not applicable
8. Did not implement billing or payment — not applicable
9. Did not implement license activation logic — not applicable
10. Did not implement Audits or Non-Conformities CRUD — those are Phase 7
11. Did not rewrite Documents or CAPA modules — both untouched except exportService/printService additions
12. Did not remove existing Documents/CAPA functionality — all existing code preserved
13. Did not use tauri-plugin-sql JS API for business queries — all SQL via Rust commands
14. All database operations through custom Rust Tauri commands using rusqlite and parameterized SQL — confirmed
15. Did not delete existing files without approval — no files deleted
16. Parameterized SQL only — no string concatenation in any SQL query
17. No password/hash exposure — no hashes logged or returned
18. No secrets printed — no secrets in any output
19. Did not expose database internals to frontend — Rust structs are typed DTOs only

---

## 16. Summary

Phase 6 delivered two full QMS business modules — Risks and Complaints — with a combined 18 new Rust Tauri commands, 1 database migration, 4 new TypeScript type/service files, and 2 complete page rewrites. Both modules follow the architectural pattern established in earlier phases: parameterized SQL through rusqlite, Rust-layer permission enforcement, auto-numbered IDs from settings keys, file attachments in AppData uploads directories, activity log tracking, and reusable UI components (ModuleToolbar, FilterBar, DetailsDrawer).

The Risks module introduces the project's first computed-column interaction (`risk_score GENERATED ALWAYS AS`) and a visual 5×5 risk matrix component. The Complaints module introduces the project's first dynamically-built filter dropdown (customer IDs derived from loaded data) and a dedicated Customer tab in the DetailsDrawer.

TypeScript compiled clean (0 errors) after resolving 4 interface-mismatch issues encountered during integration with existing reusable components. The project is now ready for Phase 7: Audits + Non-Conformities.
