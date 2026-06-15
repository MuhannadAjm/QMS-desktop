# QMS Desktop — Current Phase

## Status: Phase 9B COMPLETE

| Field | Value |
|---|---|
| Current phase | 9B — Online Activation Server, RSA License Tokens, License Admin Portal |
| Phase status | COMPLETE |
| Date completed | 2026-06-15 |
| Source code written | Yes |
| Database changed | No (Supabase only — see supabase/migrations/) |
| Next phase | Phase 10 — Installer / MSI Packaging (or UI Polish) |

---

## What Was Done in Phase 5

Full CAPA (Corrective and Preventive Actions) module implemented as the second real QMS business module:

**No migration needed** — `capas` table, `attachments` table, and `capa_prefix` setting all existed from migrations 001 and 002.

- **`src-tauri/src/commands/capa.rs`** (NEW) — 9 Tauri commands:
  - `list_capas` — all authenticated users; `is_overdue` computed in SQL
  - `get_capa` — all authenticated users
  - `create_capa` — Admin or QM; auto-generates `{capa_prefix}-{YYYY}-{NNNN}` number
  - `update_capa` — Admin or QM; all editable CAPA fields
  - `set_capa_status` — Admin or QM; closing requires non-empty `effectiveness_check`; sets/clears `closed_at`
  - `get_capa_activity` — all authenticated users; activity_log entries for module='capa'
  - `attach_capa_file` — Admin or QM; validates extension, copies to `uploads/capa/`, inserts into attachments table
  - `open_capa_attachment` — all authenticated users; opens from `uploads_capa` via `cmd /c start`
  - `list_capa_attachments` — all authenticated users; queries attachments table for module='capa'
- **`src/types/capa.ts`** (NEW) — CapaListItem, CAPAAttachment, CapaActivityEntry, CAPA_TYPES, SOURCE_TYPES, CAPA_PRIORITIES, ROOT_CAUSE_METHODS, CAPA_STATUSES
- **`src/services/capaService.ts`** (NEW) — wraps all 9 Tauri CAPA commands
- **`src/services/exportService.ts`** — added `exportCapasCSV`, `exportCapasJSON`
- **`src/services/printService.ts`** — added `printCapaRegister`
- **`src/pages/CAPA.tsx`** — full module rewrite from 32-line stub:
  - KPI cards: Total, Open, Overdue, Closed (all clickable to filter)
  - ModuleToolbar: New CAPA / Refresh / Print / Export CSV / Export JSON / Import (notice)
  - FilterBar: search + status filter + source type filter + overdue filter
  - Data table: CAPA #, Title, Type, Priority, Responsible, Due Date (red if overdue), Status (OVERDUE badge)
  - DetailsDrawer (fixed right panel, 460px): Details / Action Plan / Attachments / Activity tabs
  - Create CAPA modal (all fields including root cause, action plan, due date)
  - Edit CAPA modal (all editable fields + effectiveness_check)
  - Close CAPA modal (requires effectiveness_check text before closing)
  - Reopen CAPA modal (clears closed_at, sets status to OPEN)
  - Import notice modal

**Build:** 1627 modules, 0 TypeScript errors, 299.22 kB JS. Rust: incremental 0.57s, 0 errors.

---

## What Was Done in Phase 4B

Reusable desktop operations foundation built and applied to the Documents module:

- **`src-tauri/src/commands/files.rs`** (NEW) — `write_text_file(path, content)` Rust command for safe local file export. No new Cargo dependencies.
- **`src-tauri/capabilities/default.json`** — Added `dialog:allow-save` (export save dialog)
- **`src/services/exportService.ts`** (NEW) — `exportDocumentsCSV`, `exportDocumentsJSON`; uses `save()` dialog + `write_text_file` Rust command; module-aware filenames.
- **`src/services/printService.ts`** (NEW) — `printDocumentRegister(docs, companyName)`; generates full-featured HTML report with company header, styled table, footer; opens print window.
- **`src/services/importService.ts`** (NEW) — Preview-only CSV/JSON parser foundation (no DB inserts); `parseCSVPreview`, `parseJSONPreview`, `detectFormat`.
- **`src/services/fileActionService.ts`** (NEW) — `openLocalDocumentFile(userId, docId)` shared wrapper.
- **`src/components/ui/ModuleToolbar.tsx`** (NEW) — New/Refresh/Print/Export dropdown/Import toolbar; permission-aware; click-outside close for export dropdown.
- **`src/components/ui/FilterBar.tsx`** (NEW) — Reusable search + select filter bar with clear.
- **`src/pages/Documents.tsx`** — Applied ModuleToolbar + FilterBar; added Export CSV/JSON, Print Document Register; added Import preview-only notice modal. All existing functionality intact.

**Build:** 1625 modules, 0 TypeScript errors, 264.15 kB JS. Rust: incremental 0.50s, 0 errors.

---

## What Was Done in Phase 4

Full Documents module implemented as the first real QMS business module:

- **Migration 003** — `ALTER TABLE documents ADD COLUMN original_file_name TEXT` + same for `document_revisions`
- **`permissions.rs`** — Added `require_authenticated(user_id)` for read-only document commands (any role)
- **`users.rs`** — Added `list_users_minimal` command (Admin/QM only) — returns id/name/role for dropdowns
- **`commands/documents.rs`** (NEW) — 9 Tauri commands:
  - `list_documents` — all active user roles
  - `get_document` — all active user roles
  - `create_document` — Admin or QualityManager; auto-generates doc_number from `document_prefix` setting
  - `update_document` — Admin or QM; creates revision if version changes
  - `set_document_status` — Admin or QM; logs to activity_log
  - `attach_document_file` — Admin or QM; validates extension, copies file to AppData, creates revision entry
  - `list_document_revisions` — all active user roles
  - `get_document_activity` — all active user roles
  - `open_document_file` — all active user roles; opens with Windows default app
- **`tauri-plugin-dialog`** — Added to Cargo.toml and package.json; capabilities file created
- **`src-tauri/capabilities/default.json`** — Created with `core:default` + `dialog:allow-open`
- **`src/types/document.ts`** (NEW) — DocumentListItem, DocumentRevision, ActivityEntry, UserMinimal, DOCUMENT_TYPES, DOCUMENT_STATUSES
- **`src/services/documentService.ts`** (NEW) — Wraps all 9 Tauri commands
- **`src/pages/Documents.tsx`** — Full implementation: KPI cards, filter bar, data table, DetailsDrawer (Details/Revisions/Activity tabs), Create/Edit modal, Status Change modal, file attach flow

**Auto-numbering:** `{document_prefix}-{YYYY}-{NNNN}` from the `document_prefix` settings key.

**File storage:** Files copied to `%APPDATA%\QMSDesktop\uploads\documents\{docId}_{timestamp_micros}.{ext}`. Original filename stored as `original_file_name`. File opened via `cmd /c start "" {path}`.

**Build:** 0 TypeScript errors, 1621 modules, 253.76 kB JS. Rust: compiled successfully with tauri-plugin-dialog.

---

## What Was Done in Phase 3B

Hardened Phase 3 auth and permissions foundation before Phase 4:

- `permissions.rs` (NEW) — Rust module with `require_admin` and `require_admin_or_quality_manager` helpers that verify `current_user_id` against the database
- All 5 Users CRUD commands now require `current_user_id: i64` and enforce Admin role at the Rust layer
- `update_setting` now requires `current_user_id: i64` and enforces Admin or QualityManager role at the Rust layer
- `settingsStore.ts` (NEW) — Zustand store for company name live refresh
- `CompanyName` sidebar component now reactive via `settingsStore` — updates immediately on Settings save, no page reload needed
- Activity log now records `performed_by` (the acting user's ID)
- Deactivated-user mid-session behavior documented

**Build:** 1,618 modules, 0 TS errors, 227.10 kB JS. Rust: 421 packages, 7.32s.

---

## What Was Done in Phase 3

Full local authentication and user management implemented:
- First Admin Setup flow (shown only when users table is empty)
- Login page with email + password, Argon2id password hashing in Rust
- Zustand authStore — in-memory session, cleared on app close
- Protected routes — login / first-admin-setup / full app based on auth state
- Users page CRUD for Admins: list, create, edit, activate/deactivate, reset password
- Settings page CRUD for Admin + QualityManager: all company profile, quality system, prefixes, preferences
- Role-based sidebar navigation (5 roles: Admin, QualityManager, Auditor, Employee, Viewer)
- Topbar shows authenticated user name and role
- Sidebar shows company name from settings (live)
- Activity log entries for user create/update/deactivate/reset password
- Migration 002: added `department` column to users, added 12 new settings keys

**Build result:** `tsc && vite build` — SUCCESS (1,617 modules, 0 TS errors, 226.82 kB JS)

---

## What Was Done in Phase 6

Full Risks and Complaints modules implemented as the third and fourth QMS business modules:

**Migration 004** — added 4 new columns to the `risks` table: `source TEXT`, `who_might_be_affected TEXT`, `recommended_actions TEXT`, `time_scale TEXT`.

- **`src-tauri/src/commands/risks.rs`** (NEW) — 9 Tauri commands: `list_risks`, `get_risk`, `create_risk`, `update_risk`, `set_risk_status`, `get_risk_activity`, `attach_risk_file`, `open_risk_attachment`, `list_risk_attachments`
- **`src-tauri/src/commands/complaints.rs`** (NEW) — 9 Tauri commands: `list_complaints`, `get_complaint`, `create_complaint`, `update_complaint`, `set_complaint_status`, `get_complaint_activity`, `attach_complaint_file`, `open_complaint_attachment`, `list_complaint_attachments`
- **`src/types/risk.ts`** (NEW) — RiskListItem (27 fields), RiskAttachment, RiskActivityEntry, RISK_CATEGORIES, RISK_LEVELS, RISK_SOURCES, computeRiskLevel, riskLevelBadgeClass, riskScoreCellClass
- **`src/types/complaint.ts`** (NEW) — ComplaintListItem (19 fields), ComplaintAttachment, ComplaintActivityEntry, COMPLAINT_PRIORITIES, COMPLAINT_CATEGORIES, priorityBadgeClass
- **`src/services/riskService.ts`** (NEW) — wraps all 9 risk Tauri commands
- **`src/services/complaintService.ts`** (NEW) — wraps all 9 complaint Tauri commands
- **`src/services/exportService.ts`** — added exportRisksCSV, exportRisksJSON, exportComplaintsCSV, exportComplaintsJSON
- **`src/services/printService.ts`** — added printRiskRegister, printComplaintRegister
- **`src/pages/Risks.tsx`** — full rewrite: KPI cards, 5×5 matrix, DetailsDrawer (5 tabs: Details/Controls & Actions/Risk Matrix/Attachments/Activity), Create/Edit/Close/Reopen/Import modals
- **`src/pages/Complaints.tsx`** — full rewrite: KPI cards, DetailsDrawer (4 tabs: Details/Customer/Attachments/Activity), Create/Edit/Close/Reopen/Import modals, customer filter

**Risk score logic:** `risk_score` GENERATED ALWAYS AS (severity × likelihood) in SQLite — never written by Rust. `risk_level` computed in Rust (1–4=LOW, 5–9=MEDIUM, 10–19=HIGH, 20–25=CRITICAL) and stored as TEXT.

**Build:** 0 TypeScript errors, 0 Rust errors.

---

## What Was Done in Phase 9B

Phase 9B implemented the online activation server, RSA-2048 license tokens, and the License Admin Portal:

**Supabase backend (new):**
- `supabase/migrations/001_license_schema.sql` — 5 tables: `license_customers`, `license_keys`, `license_activations`, `license_events`, `license_admin_profiles`; RLS enabled; partial unique index on active hardware activations
- `supabase/functions/_shared/cors.ts`, `rsa.ts`, `auth.ts` — CORS, RSA token signing, admin JWT verification
- `supabase/functions/activate-license/index.ts` — public activation endpoint; checks limits; signs RSA token
- `supabase/functions/validate-license/index.ts` — public validation endpoint; refreshes token
- `supabase/functions/admin-generate-license/index.ts` — admin: generate key (raw key returned ONCE, hash stored)
- `supabase/functions/admin-deactivate-device/index.ts` — admin: deactivate a specific activation
- `supabase/functions/admin-list-licenses/index.ts` — admin: list licenses with activation counts
- `supabase/functions/.env.example` — all required environment variables documented
- `supabase/README_LICENSE_SERVER.md` — full deployment guide + token canonicalization spec

**Rust backend (modified):**
- `src-tauri/Cargo.toml` — added `rsa = "0.9"` (features: pem), `base64 = "0.22"`, `reqwest = "0.12"` (native-tls), `sha2` oid feature
- `src-tauri/src/license/token.rs` — added `activation_id: Option<String>` field
- `src-tauri/src/license/rsa_public_key.rs` (new) — embedded RSA-2048 dev public key (SPKI PEM)
- `src-tauri/src/license/mod.rs` — added `pub mod rsa_public_key`
- `src-tauri/src/license/validation.rs` — rewritten: RSA production path (`verify_rsa_signature` using PKCS1v15 + `canonical_payload`); dev_bypass HMAC path preserved
- `src-tauri/src/commands/license.rs` — added `activate_license_online` + `validate_license_online` async Tauri commands; `LicenseDetails` struct gained `activation_id` field
- `src-tauri/src/commands/mod.rs` — exported 2 new commands
- `src-tauri/src/lib.rs` — registered 2 new commands

**TypeScript frontend (modified):**
- `src/types/license.ts` — `LicenseDetails` gained `activation_id: string | null`
- `src/services/licenseService.ts` — added `activateLicenseOnline` + `validateLicenseOnline`
- `src/pages/License.tsx` — added Online Activation card (license key input, machine label, Activate Online button), Validate Online button; shows activation_id in details

**License Admin Portal (new — `license-admin/`):**
- Separate React + Vite + Tailwind web app; connects to Supabase with anon key
- Pages: Login, Customers, Licenses (with status badges), LicenseDetail (activations + deactivate action), GenerateLicense (new/existing customer, plan, max activations, expiry), Events (audit log)
- Components: Layout with sidebar nav

**Build result:** 0 TypeScript errors (npm run build), 0 Rust errors (cargo check).

---

## Phase History

| Phase | Name | Completed |
|---|---|---|
| 0 | Project Control and Architecture Setup | 2026-06-14 |
| 1 | Tauri Desktop Foundation | 2026-06-14 |
| 2 | SQLite and Local AppData Foundation | 2026-06-14 |
| 3 | Settings + Users / Auth | 2026-06-14 |
| 3B | Auth and Permission Hardening | 2026-06-14 |
| 4 | Documents | 2026-06-14 |
| 4B | Desktop Operations Foundation | 2026-06-14 |
| 5 | CAPA | 2026-06-14 |
| 6 | Risks + Complaints | 2026-06-15 |
| 7 | Audits + Non-Conformities | 2026-06-15 |
| 8 | Dashboard + Reports + Backup | 2026-06-15 |
| 8B | Cross-Module Workflow Linking | 2026-06-15 |
| 9A | Local License Engine | 2026-06-15 |
| 9B | Online Activation Server + RSA Tokens + Admin Portal | 2026-06-15 |
