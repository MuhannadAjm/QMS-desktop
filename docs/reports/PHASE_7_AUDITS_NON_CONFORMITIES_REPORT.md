# Phase Report: Phase 7 — Audits and Non-Conformities

## Report Metadata

| Field | Value |
|---|---|
| Phase number | 7 |
| Phase name | Audits and Non-Conformities |
| Date completed | 2026-06-15 |
| Reporter | Claude Code (claude-sonnet-4-6) |
| Session type | Full Audits + Non-Conformities modules — 23 Rust commands, migration 005, new TypeScript types and services, full page rewrites, export/print |

---

## 1. Phase Name

Phase 7 — Audits and Non-Conformities

---

## 2. Objective

Implement two complete, production-quality QMS modules backed by real SQLite data:

**Audits module:**
- Audit register with full CRUD (Create, Read, Update, Close, Reopen)
- Auto-generated audit numbers: `{audit_prefix}-{YYYY}-{NNNN}`
- Audit Findings sub-records (NC, OFI, Observation, Positive) with severity tracking
- Finding numbers auto-generated sequentially within each audit (F-001, F-002…)
- "Create NC from Finding" — one-click NC creation from a finding, duplicate-prevented
- File attachments stored in `%APPDATA%\QMSDesktop\uploads\audits\`
- Activity log for all audit mutations including finding additions and NC creation
- DetailsDrawer with 4 tabs: Details, Findings, Attachments, Activity
- KPI cards: Total Audits, Open, Closed, Total Findings
- Export CSV/JSON, Print Audit Register
- Import button: notice-only modal (deferred)
- Rust permission enforcement: Admin/QM full CRUD; Auditor can add/edit findings and create NC; others view-only

**Non-Conformities module:**
- NC register with full CRUD (Create, Read, Update, Close, Reopen, Set In-Review)
- Auto-generated NC numbers: `{nc_prefix}-{YYYY}-{NNNN}`
- Source tracking: AUDIT, CUSTOMER_COMPLAINT, PROCESS_MONITORING, SUPPLIER, INSPECTION, INTERNAL, OTHER
- Severity: LOW / MEDIUM / HIGH / CRITICAL
- "Create CAPA from NC" — one-click CAPA creation, duplicate-prevented, confirmation modal with cancel
- `related_capa_id` denormalized field for fast display without extra joins
- File attachments stored in `%APPDATA%\QMSDesktop\uploads\nc\`
- Activity log for all NC mutations including CAPA creation
- DetailsDrawer with 5 tabs: Details, Source, CAPA Link, Attachments, Activity
- KPI cards: Total NCs, Open/In-Review, High/Critical (open), Closed
- Export CSV/JSON, Print NC Register
- Import button: notice-only modal (deferred)
- Rust permission enforcement: Admin/QM full CRUD; others view-only

---

## 3. Files Created

| File | Description |
|---|---|
| `src-tauri/src/db/sql/005_phase7_audits_nc.sql` | Migration 005 — 7 ALTER TABLE statements across 3 tables |
| `src-tauri/src/commands/audits.rs` | 13 Rust Tauri commands for the Audits module |
| `src-tauri/src/commands/non_conformities.rs` | 10 Rust Tauri commands for the Non-Conformities module |
| `src/types/audit.ts` | TypeScript types + constants for Audits |
| `src/types/nonConformity.ts` | TypeScript types + constants for Non-Conformities |
| `src/services/auditService.ts` | Frontend service wrapping all 13 audit Tauri commands |
| `src/services/nonConformityService.ts` | Frontend service wrapping all 10 NC Tauri commands |
| `docs/reports/PHASE_7_AUDITS_NON_CONFORMITIES_REPORT.md` | This report |

---

## 4. Files Modified

| File | Change |
|---|---|
| `src-tauri/src/db/init.rs` | Added MIGRATION_005 constant and Migration entry |
| `src-tauri/src/permissions.rs` | Added `require_admin_qm_or_auditor` helper |
| `src-tauri/src/commands/mod.rs` | Added `mod audits` + `mod non_conformities` + all 23 pub use exports |
| `src-tauri/src/lib.rs` | Added all 23 new commands to use imports and `generate_handler![]` |
| `src/services/exportService.ts` | Added `exportAuditsCSV`, `exportAuditsJSON`, `exportNcsCSV`, `exportNcsJSON` |
| `src/services/printService.ts` | Added `printAuditRegister`, `printNcRegister` |
| `src/pages/Audits.tsx` | Complete rewrite — full module UI |
| `src/pages/NonConformities.tsx` | Complete rewrite — full module UI |

---

## 5. Database Changes

### Migration 005 — `005_phase7_audits_nc.sql`

| Table | Column Added | Type | Notes |
|---|---|---|---|
| `audits` | `department` | TEXT | Audited department/unit |
| `audit_findings` | `severity` | TEXT NOT NULL DEFAULT 'LOW' | LOW/MEDIUM/HIGH/CRITICAL |
| `audit_findings` | `recommended_action` | TEXT | Optional remediation note |
| `audit_findings` | `is_non_conformity` | INTEGER NOT NULL DEFAULT 0 | Boolean flag (0/1) |
| `audit_findings` | `related_nc_id` | INTEGER FK → non_conformities(id) | Set when NC is created from finding |
| `audit_findings` | `created_by` | INTEGER FK → users(id) | Who added the finding |
| `non_conformities` | `related_capa_id` | INTEGER FK → capas(id) | Set when CAPA is created from NC |

---

## 6. Rust Commands

### Audit Commands (13)

| Command | Permission | Description |
|---|---|---|
| `list_audits` | Authenticated | Return all audits ordered by audit_number |
| `get_audit` | Authenticated | Return single audit with findings_count |
| `create_audit` | Admin / QM | Create new audit, generate audit_number |
| `update_audit` | Admin / QM | Update audit metadata |
| `set_audit_status` | Admin / QM | Set OPEN or CLOSED; sets closed_at |
| `list_audit_findings` | Authenticated | Return all findings for an audit |
| `add_audit_finding` | Admin / QM / Auditor | Add finding to audit; auto-generate finding_number |
| `update_audit_finding` | Admin / QM / Auditor | Edit finding type, severity, description, etc. |
| `create_nc_from_audit_finding` | Admin / QM / Auditor | Create NC from finding; duplicate-prevented via `related_nc_id` |
| `attach_audit_file` | Admin / QM | Copy file to uploads/audits, insert into attachments table |
| `open_audit_attachment` | Authenticated | Open attachment via Windows `start` command |
| `list_audit_attachments` | Authenticated | Return all attachments for audit |
| `get_audit_activity` | Authenticated | Return activity log for audit |

### Non-Conformity Commands (10)

| Command | Permission | Description |
|---|---|---|
| `list_non_conformities` | Authenticated | Return all NCs ordered by nc_number |
| `get_non_conformity` | Authenticated | Return single NC |
| `create_non_conformity` | Admin / QM | Create new NC, generate nc_number |
| `update_non_conformity` | Admin / QM | Update NC metadata (not source link) |
| `set_non_conformity_status` | Admin / QM | Set OPEN, IN_REVIEW, or CLOSED |
| `create_capa_from_non_conformity` | Admin / QM | Create CAPA from NC; duplicate-prevented via `related_capa_id` |
| `attach_nc_file` | Admin / QM | Copy file to uploads/nc, insert into attachments table |
| `open_nc_attachment` | Authenticated | Open attachment via Windows `start` command |
| `list_nc_attachments` | Authenticated | Return all attachments for NC |
| `get_non_conformity_activity` | Authenticated | Return activity log for NC |

---

## 7. Permission Matrix

| Role | Audits CRUD | Add/Edit Findings | Create NC from Finding | NC CRUD | Create CAPA from NC |
|---|---|---|---|---|---|
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ |
| QualityManager | ✓ | ✓ | ✓ | ✓ | ✓ |
| Auditor | View only | ✓ | ✓ | View only | — |
| Employee | View only | — | — | View only | — |
| Viewer | View only | — | — | View only | — |

---

## 8. UI Components

### Audits Page (`src/pages/Audits.tsx`)

- **KPI row:** Total Audits · Open · Closed · Total Findings
- **Page header + ModuleToolbar:** Audits title, New Audit, Import, Export (CSV/JSON/Print)
- **FilterBar:** text search + Status filter + Type filter
- **Data table:** Audit Number, Title, Type, Department, Lead Auditor, Audit Date, Findings badge, Status
- **DetailsDrawer (4 tabs):**
  - *Details* — all audit fields, scope, summary, closed_at
  - *Findings* — list of findings with type/severity badges; Add Finding button for Auditor+
  - *Attachments* — file list + attach-file panel for Admin/QM
  - *Activity* — chronological event timeline
- **Modals:** AuditModal (create/edit), FindingModal (add/edit), CreateNcModal (confirm), CloseAuditModal, ReopenAuditModal, ImportNoticeModal

### Non-Conformities Page (`src/pages/NonConformities.tsx`)

- **KPI row:** Total NCs · Open/In-Review · High/Critical (open) · Closed
- **Page header + ModuleToolbar:** Non-Conformities title, New NC, Import, Export (CSV/JSON/Print)
- **FilterBar:** text search + Status filter + Severity filter
- **Data table:** NC Number, Title, Severity, Source, Detected, Responsible, Related CAPA, Status
- **DetailsDrawer (5 tabs):**
  - *Details* — severity, status, detected date, responsible, description, containment action
  - *Source* — source type, source ID, linked finding ID
  - *CAPA Link* — shows linked CAPA number; Create CAPA button if none linked
  - *Attachments* — file list + attach-file panel for Admin/QM
  - *Activity* — chronological event timeline
- **Modals:** NcModal (create/edit), CreateCapaModal (confirm with cancel), CloseNcModal, ReopenNcModal, ImportNoticeModal

---

## 9. Cross-Module Integration

### Audit → NC (via `create_nc_from_audit_finding`)

1. User opens Findings tab in Audit DetailsDrawer
2. Finding with type=NC shows "Create NC" button (only if `related_nc_id` is null)
3. Confirmation modal explains what will happen
4. Rust command: inserts NC with `source='AUDIT'`, `source_id=audit_id`, `finding_id=finding.id`
5. Updates `audit_findings.is_non_conformity = 1` and `related_nc_id = new_nc.id`
6. Activity logged to both `audit` and `nc` modules

### NC → CAPA (via `create_capa_from_non_conformity`)

1. User opens CAPA Link tab or sees "Create CAPA" button in drawer header
2. Confirmation modal explains what will happen (with Cancel option)
3. Rust command: inserts CAPA with `source='NC'`, `nc_id=nc.id`
4. Updates `non_conformities.related_capa_id = new_capa.id`
5. Activity logged to both `nc` and `capa` modules

### Duplicate Prevention

- **NC from finding:** If `audit_findings.related_nc_id IS NOT NULL` → error "A Non-Conformity already exists for this finding"
- **CAPA from NC:** If `non_conformities.related_capa_id IS NOT NULL` → error "A CAPA already exists for this Non-Conformity"

---

## 10. Export and Print

| Format | Function | Columns |
|---|---|---|
| Audit CSV | `exportAuditsCSV` | 15 columns including findings count |
| Audit JSON | `exportAuditsJSON` | Same as CSV in JSON object array |
| Audit Print | `printAuditRegister` | 8 columns, findings count highlighted |
| NC CSV | `exportNcsCSV` | 12 columns |
| NC JSON | `exportNcsJSON` | Same as CSV in JSON object array |
| NC Print | `printNcRegister` | 8 columns, severity color-coded |

---

## 11. Validation Results

### TypeScript Build (`npm run build`)

```
✓ tsc — 0 errors
✓ vite build — 1635 modules transformed, 421 KB JS
```

### Rust Build (`cargo run`)

```
Compiling qms-desktop v1.0.0
Finished `dev` profile in 13.16s
Running qms-desktop.exe
```

No warnings. No errors.

---

## 12. Security Notes

- All 23 new commands use parameterized SQL (`params![]`) exclusively
- No raw string concatenation in any SQL query
- Permission checks are the first statement of every command
- File extension validation enforces allowlist (PDF, DOC, DOCX, XLS, XLSX, PNG, JPG, JPEG)
- Files are stored by a `{record_id}_{timestamp}.{ext}` generated name — no user-supplied filenames on disk
- NC/CAPA creation does not expose internal IDs to the frontend beyond what was queried
- `require_admin_qm_or_auditor` is a new permission level for finding operations; read operations use `require_authenticated`

---

## 13. Forbidden Actions — Compliance Check

All 19 forbidden actions were observed:

1. ✓ No git commit made
2. ✓ No `git add .` used
3. ✓ No .env files touched
4. ✓ No live external APIs connected
5. ✓ No business data uploaded
6. ✓ No cloud sync implemented
7. ✓ No multi-device mode implemented
8. ✓ No billing or payment logic implemented
9. ✓ No license activation logic implemented
10. ✓ Documents, CAPA, Risks, Complaints modules untouched
11. ✓ No existing functionality removed
12. ✓ No tauri-plugin-sql JS API used for business queries
13. ✓ All DB ops via custom Rust commands with rusqlite + parameterized SQL
14. ✓ No existing files deleted
15. ✓ Parameterized SQL only
16. ✓ No passwords or hashes exposed
17. ✓ No secrets printed
18. ✓ No database internals exposed to frontend
19. ✓ No license activation logic

---

## 14. Phase Deliverables Checklist

- [x] Migration 005 created and registered
- [x] `require_admin_qm_or_auditor` permission helper
- [x] 13 Rust audit commands
- [x] 10 Rust NC commands
- [x] commands/mod.rs updated with all 23 exports
- [x] lib.rs updated with all 23 commands in `generate_handler![]`
- [x] `src/types/audit.ts` with all types and constants
- [x] `src/types/nonConformity.ts` with all types and constants
- [x] `src/services/auditService.ts` wrapping all 13 commands
- [x] `src/services/nonConformityService.ts` wrapping all 10 commands
- [x] `exportService.ts` updated with 4 new export functions
- [x] `printService.ts` updated with 2 new print functions
- [x] `src/pages/Audits.tsx` full rewrite with KPI, table, drawer, 5 modals
- [x] `src/pages/NonConformities.tsx` full rewrite with KPI, table, drawer, 5 modals
- [x] TypeScript build passes (0 errors)
- [x] Rust compile passes (0 errors, 0 warnings)
- [x] Application launches successfully
