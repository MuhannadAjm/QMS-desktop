# QMS Desktop — Claude Handoff

This file is the primary context document for Claude Code sessions on this project.
Read this file first at the start of every session.

---

## What This Project Is

**QMS Desktop** is a commercial standalone Windows desktop application for Quality
Management System (QMS) operations, oriented toward ISO 9001 compliance.

- Single Windows device, multiple local users sharing a local SQLite database.
- No external database, no cloud, no Docker, no network required.
- Built with: **Tauri 2 + React + TypeScript + SQLite (rusqlite bundled) + Vite + Tailwind CSS**.
- Database auto-created in `%APPDATA%\QMSDesktop\` on first launch.
- This is a serious commercial product, not a demo or prototype.

---

## Current Status

See [CURRENT_PHASE.md](CURRENT_PHASE.md) for the active phase and next steps.

**Phase 0 COMPLETE.** All architecture and documentation files created.
**Phase 1 COMPLETE.** Tauri + React + TypeScript UI shell. Window opens.
**Phase 2 COMPLETE.** SQLite database, migrations, AppData structure. All verified.
**Phase 3 COMPLETE.** Auth, login, first admin setup, users CRUD, settings CRUD, role-based UI.
**Phase 3B COMPLETE.** Auth and permission hardening: Rust-layer role enforcement, settings live refresh, activity log improvements.
**Phase 4 COMPLETE.** Full Documents module: KPI cards, data table, DetailsDrawer (Details/Revisions/Activity), Create/Edit modal, Status Change modal, file picker and file copy via tauri-plugin-dialog, open with Windows default app.
**Phase 4B COMPLETE.** Desktop Operations Foundation: ModuleToolbar, FilterBar reusable components; exportService (CSV/JSON + save dialog), printService (HTML print window), importService (preview-only parser), fileActionService; write_text_file Rust command; dialog:allow-save capability; applied to Documents.
**Phase 5 COMPLETE.** Full CAPA module: 9 Rust commands, capa.ts types, capaService.ts, CAPA.tsx full page (KPI cards, table, DetailsDrawer with 4 tabs, Create/Edit/Close/Reopen modals, Export CSV/JSON, Print). No new migration (capas table existed in migration 001).
**Phase 6 COMPLETE.** Full Risks module (9 Rust commands, 5-tab DetailsDrawer, 5×5 matrix, risk score/level logic, migration 004) and Complaints module (9 Rust commands, 4-tab DetailsDrawer, customer filter, required customer_name+customer_id). 18 new commands total.
**Phase 7 COMPLETE.** Full Audits module (audit plan, findings, NC linking) and Non-Conformities module.
**Phase 8 COMPLETE.** Dashboard (5 KPI widgets), Reports (6 module reports), Local Backup (create/restore/validate).
**Phase 8B COMPLETE.** Cross-module workflow linking: NC→CAPA, Risk→CAPA, Complaint→NC/CAPA, Audit Finding→NC.
**Phase 9A COMPLETE.** Local hardware-bound license engine: hardware fingerprint, LicenseToken struct, HMAC-dev-bypass, license.json storage, 7 Tauri commands, License page UI, startup gate.
**Phase 9B COMPLETE.** Online activation server (Supabase Edge Functions + RSA-2048 signing), desktop RSA verification, `activate_license_online` + `validate_license_online` Tauri commands, online activation UI, License Admin Portal (`license-admin/`).
**Next:** Phase 10 — Installer / MSI packaging (or UI Polish).

---

## Project Folder

```
D:\QMS-Desktop\
```

Not a git repository.

---

## Key Documentation Files

| File | Contents |
|---|---|
| ARCHITECTURE.md | Tech stack, folder structure, AppData layout, module relationships |
| DATABASE_SCHEMA.md | Full SQLite schema, table definitions, migration strategy |
| SECURITY_NOTES.md | Auth design, role model, SQL injection prevention, file safety |
| LICENSE_DESIGN.md | Hardware-bound offline license (Phase 9 only) |
| UI_GUIDELINES.md | Color system, typography, layout, component specifications |
| PHASE_PLAN.md | Phase 0–9 objectives, deliverables, validation checklists |
| DEVELOPMENT_LOG.md | Chronological session log |
| CURRENT_PHASE.md | Current phase status and next action |
| RUNBOOK.md | Developer operations: setup, build, DB reset, migrations |

---

## Roles

| Role | Sidebar Access |
|---|---|
| Admin | All pages |
| QualityManager | Dashboard, CAPA, Risks, Complaints, Audits, NC, Documents, Reports, Settings |
| Auditor | Dashboard, Audits, NC, Documents, Reports |
| Employee | Dashboard, CAPA, Risks, Complaints, Documents |
| Viewer | Dashboard, Documents, Reports |

Role enforcement is at two layers:
1. **UI layer (Phase 3):** Sidebar filtered by role. Per-page access guards.
2. **Rust backend layer (Phase 3B):** Protected commands require `current_user_id: i64`. `permissions.rs` verifies role + is_active from DB before executing mutations. Admin-only: users CRUD. Admin/QualityManager: settings update.

---

## Modules

1. Dashboard (KPI cards)
2. Settings (company name, logo, quality policy, scope, departments, prefixes)
3. Users (CRUD, roles) — **Phase 3 COMPLETE**
4. Documents (file upload, versioning, status workflow)
5. CAPA (corrective/preventive, root cause, effectiveness)
6. Risks (severity × likelihood matrix)
7. Complaints (customer name + ID, filtering)
8. Audits (findings sub-records)
9. Non-Conformities (linked to Audit findings or other sources)
10. Reports (PDF export, 6 report types)
11. Backup / Restore
12. License Activation (Phase 9)

---

## Auth Architecture (Phase 3)

### Login flow
1. App starts → `initializeAppStorage()` → `checkFirstAdminExists()`
2. No admin → bootstrapState = 'first-admin' → show `/first-admin-setup`
3. Has admin → bootstrapState = 'ready' → show `/login` if not authenticated
4. Login → `login(email, password)` Rust command → returns `AuthUser` (no hash)
5. `useAuthStore().login(user)` → sets `isAuthenticated = true`, `user = AuthUser`
6. Router shows full app with role-based sidebar

### Session
- In-memory (Zustand) — cleared on app close (per SECURITY_NOTES.md)
- No session persistence between launches by design

### Password security
- Argon2id via `argon2 = "0.5"` crate in Rust backend
- Random salt per hash (OsRng)
- PHC string format stored in DB
- Minimum: 8 chars, 1 uppercase, 1 digit
- Email normalized to lowercase (stored as `username` field, which has UNIQUE constraint)
- Generic "Invalid email or password" message on failure (no user enumeration)

---

## Rust Source Structure (Phases 2–4)

```
src-tauri/src/
├── main.rs
├── lib.rs                    (registers all modules and Tauri commands + dialog plugin)
├── password.rs               (hash_password, verify_password, validate_password_strength)
├── permissions.rs            (require_admin, require_admin_or_quality_manager, require_authenticated)
├── storage/
│   └── mod.rs                (AppData path management — StoragePaths, get_storage_paths)
├── db/
│   ├── mod.rs                (open_conn helper + public interface)
│   ├── init.rs               (init + migration runner — migrations 001, 002, 003, 004)
│   └── sql/
│       ├── 001_initial_schema.sql       (all 13 QMS tables)
│       ├── 002_phase3_auth.sql          (department column + settings keys)
│       ├── 003_phase4_documents.sql     (original_file_name columns)
│       └── 004_phase6_risks_complaints.sql (4 new columns on risks table)
└── commands/
    ├── mod.rs                (public interface for all commands)
    ├── storage.rs            (initialize_app_storage, get_app_storage_status)
    ├── auth.rs               (check_first_admin_exists, create_first_admin, login)
    ├── users.rs              (list_users, list_users_minimal, create_user, update_user, set_user_status, reset_user_password)
    ├── settings_cmd.rs       (get_settings — read-only; update_setting — requires current_user_id)
    ├── documents.rs          (Phase 4 — 9 commands: list_documents, get_document, create_document,
    │                          update_document, set_document_status, attach_document_file,
    │                          list_document_revisions, get_document_activity, open_document_file)
    ├── files.rs              (Phase 4B — write_text_file: safe local file write for export)
    ├── capa.rs               (Phase 5 — 9 commands: list_capas, get_capa, create_capa, update_capa,
    │                          set_capa_status, get_capa_activity, attach_capa_file,
    │                          open_capa_attachment, list_capa_attachments)
    ├── risks.rs              (Phase 6 — 9 commands: list_risks, get_risk, create_risk, update_risk,
    │                          set_risk_status, get_risk_activity, attach_risk_file,
    │                          open_risk_attachment, list_risk_attachments)
    └── complaints.rs         (Phase 6 — 9 commands: list_complaints, get_complaint, create_complaint,
                               update_complaint, set_complaint_status, get_complaint_activity,
                               attach_complaint_file, open_complaint_attachment, list_complaint_attachments)
```

**capabilities/:**
```
src-tauri/capabilities/
└── default.json              (core:default + dialog:allow-open + dialog:allow-save)
```

---

## Frontend Source Structure (Phases 1–4B)

```
src/
├── App.tsx                   (bootstrap: init storage → check admin → set auth state)
├── app/router.tsx            (auth-aware routing: first-admin / login / full app)
│
├── components/layout/
│   ├── AppLayout.tsx
│   ├── Sidebar.tsx           (role-filtered nav, real user, logout; CompanyName reads settingsStore)
│   └── Topbar.tsx            (real user name/role, license pending badge)
│
├── components/ui/
│   ├── Button.tsx, Card.tsx, StatCard.tsx, StatusBadge.tsx, EmptyState.tsx
│   ├── PageHeader.tsx
│   ├── ModuleToolbar.tsx     (Phase 4B — New/Refresh/Print/Export dropdown/Import; permission-aware)
│   └── FilterBar.tsx         (Phase 4B — reusable search + select filters + clear)
│
├── pages/
│   ├── Login.tsx             (Phase 3)
│   ├── FirstAdminSetup.tsx   (Phase 3)
│   ├── Users.tsx             (Phase 3B)
│   ├── Settings.tsx          (Phase 3B)
│   ├── Documents.tsx         (Phase 4+4B — KPI cards, table, drawer, modals, toolbar, export/print)
│   └── [other pages — placeholder]
│
├── stores/
│   ├── authStore.ts          (Phase 3 — Zustand: bootstrapState, user, login/logout)
│   └── settingsStore.ts      (Phase 3B — companyName reactive store for sidebar live refresh)
│
├── services/
│   ├── appStorageService.ts  (Phase 2)
│   ├── authService.ts        (Phase 3)
│   ├── userService.ts        (Phase 3B)
│   ├── settingsService.ts    (Phase 3B)
│   ├── documentService.ts    (Phase 4 — wraps all 9 document Tauri commands)
│   ├── exportService.ts      (Phase 4B+5+6 — CSV/JSON export for Documents, CAPAs, Risks, Complaints)
│   ├── printService.ts       (Phase 4B+5+6 — print register for Documents, CAPAs, Risks, Complaints)
│   ├── importService.ts      (Phase 4B — preview-only CSV/JSON parser; no DB inserts yet)
│   ├── fileActionService.ts  (Phase 4B — shared openLocalDocumentFile wrapper)
│   ├── capaService.ts        (Phase 5 — wraps all 9 CAPA Tauri commands)
│   ├── riskService.ts        (Phase 6 — wraps all 9 risk Tauri commands)
│   └── complaintService.ts   (Phase 6 — wraps all 9 complaint Tauri commands)
│
└── types/
    ├── appStorage.ts         (Phase 2)
    ├── user.ts               (Phase 3)
    ├── settings.ts           (Phase 3)
    ├── common.ts             (Phase 1)
    ├── document.ts           (Phase 4 — DocumentListItem, DocumentRevision, ActivityEntry,
    │                          UserMinimal, DOCUMENT_TYPES, DOCUMENT_STATUSES)
    ├── capa.ts               (Phase 5 — CapaListItem, CAPAAttachment, CapaActivityEntry,
    │                          CAPA_TYPES, SOURCE_TYPES, CAPA_PRIORITIES, ROOT_CAUSE_METHODS)
    ├── risk.ts               (Phase 6 — RiskListItem, RiskAttachment, RiskActivityEntry,
    │                          RISK_CATEGORIES, RISK_LEVELS, RISK_SOURCES, computeRiskLevel,
    │                          riskLevelBadgeClass, riskScoreCellClass)
    └── complaint.ts          (Phase 6 — ComplaintListItem, ComplaintAttachment, ComplaintActivityEntry,
                               COMPLAINT_PRIORITIES, COMPLAINT_CATEGORIES, priorityBadgeClass)
```

---

## Tauri Commands (All Phases)

| Command | Phase | Permission | Description |
|---|---|---|---|
| `initialize_app_storage` | 2 | Pre-auth | Create dirs, placeholder files, open DB, run migrations |
| `get_app_storage_status` | 2 | Pre-auth | Read-only status |
| `check_first_admin_exists` | 3 | Pre-auth | Returns bool — used for first-launch routing |
| `create_first_admin` | 3 | Pre-auth | Creates first Admin account (fails if any user exists) |
| `login` | 3 | Pre-auth | Verifies credentials, returns AuthUser (no hash) |
| `list_users` | 3 | Admin | Returns all users for Users page |
| `list_users_minimal` | 4 | Admin or QM | Active users for dropdown (id/name/role only) |
| `create_user` | 3 | Admin | Create user with hashed password |
| `update_user` | 3 | Admin | Edit name/email/role/department |
| `set_user_status` | 3 | Admin | Activate or deactivate user |
| `reset_user_password` | 3 | Admin | Hash and set new password |
| `get_settings` | 3 | None | Return all settings as key-value pairs |
| `update_setting` | 3 | Admin or QM | Update single setting key |
| `list_documents` | 4 | Any active user | Return all documents with owner join |
| `get_document` | 4 | Any active user | Return single document |
| `create_document` | 4 | Admin or QM | Create document; auto-generate doc_number |
| `update_document` | 4 | Admin or QM | Update metadata; create revision if version changes |
| `set_document_status` | 4 | Admin or QM | Change UNDER PROCESS / CONTROLLED / OBSOLETE |
| `attach_document_file` | 4 | Admin or QM | Validate ext, copy file, create revision entry |
| `list_document_revisions` | 4 | Any active user | Return revision history for document |
| `get_document_activity` | 4 | Any active user | Return activity_log entries for document |
| `open_document_file` | 4 | Any active user | Open stored file using Windows default app |
| `write_text_file` | 4B | Any (frontend guards) | Write string content to a user-chosen local path (export) |
| `list_capas` | 5 | Any active user | Return all CAPAs with is_overdue computed in SQL |
| `get_capa` | 5 | Any active user | Return single CAPA by ID |
| `create_capa` | 5 | Admin or QM | Create CAPA; auto-generate capa_number from capa_prefix setting |
| `update_capa` | 5 | Admin or QM | Update all editable CAPA fields |
| `set_capa_status` | 5 | Admin or QM | OPEN ↔ CLOSED; closing requires effectiveness_check; manages closed_at |
| `get_capa_activity` | 5 | Any active user | Return activity_log entries for module='capa' |
| `attach_capa_file` | 5 | Admin or QM | Validate ext, copy to uploads/capa/, insert into attachments table |
| `open_capa_attachment` | 5 | Any active user | Open stored file from uploads_capa via Windows default app |
| `list_capa_attachments` | 5 | Any active user | Return all attachments for a CAPA from attachments table |
| `list_risks` | 6 | Any active user | Return all risks with responsible user join; 27-column SELECT |
| `get_risk` | 6 | Any active user | Return single risk by ID |
| `create_risk` | 6 | Admin or QM | Create risk; auto-generate risk_number; compute risk_level from score |
| `update_risk` | 6 | Admin or QM | Update all editable risk fields; recompute risk_level |
| `set_risk_status` | 6 | Admin or QM | OPEN ↔ CLOSED; sets/clears closed_at |
| `get_risk_activity` | 6 | Any active user | Return activity_log entries for module='risk' |
| `attach_risk_file` | 6 | Admin or QM | Validate ext, copy to uploads/risks/, insert into attachments table |
| `open_risk_attachment` | 6 | Any active user | Open stored file from uploads_risks via Windows default app |
| `list_risk_attachments` | 6 | Any active user | Return all attachments for a risk from attachments table |
| `list_complaints` | 6 | Any active user | Return all complaints with user join; 19-column SELECT |
| `get_complaint` | 6 | Any active user | Return single complaint by ID |
| `create_complaint` | 6 | Admin or QM | Create complaint; auto-generate complaint_number; customer_name+id required |
| `update_complaint` | 6 | Admin or QM | Update all editable complaint fields; customer_name+id required |
| `set_complaint_status` | 6 | Admin or QM | OPEN ↔ CLOSED; sets/clears closed_at |
| `get_complaint_activity` | 6 | Any active user | Return activity_log entries for module='complaint' |
| `attach_complaint_file` | 6 | Admin or QM | Validate ext, copy to uploads/complaints/, insert into attachments table |
| `open_complaint_attachment` | 6 | Any active user | Open stored file from uploads_complaints via Windows default app |
| `list_complaint_attachments` | 6 | Any active user | Return all attachments for a complaint from attachments table |

---

## Database Notes

- **rusqlite** (bundled, 0.32) — Rust-side SQL; parameterized queries only
- **tauri-plugin-sql** (v2) — installed, plugin registered, but its JS API NOT used for business queries (path resolves to `%LOCALAPPDATA%` not `%APPDATA%`)
- **All SQL** goes through custom Rust Tauri commands

### Migrations applied
| Version | Description |
|---|---|
| 001 | initial_schema — all 13 QMS tables |
| 002 | phase3_auth — department column + 12 settings keys |
| 003 | phase4_documents — `original_file_name TEXT` added to documents + document_revisions |
| 004 | phase6_risks_complaints — `source`, `who_might_be_affected`, `recommended_actions`, `time_scale` TEXT added to risks |

---

## Environment

- `npm run tauri dev` requires: `$env:RC = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\rc.exe"`
- Developer Mode must be ON (WDAC bypass for unsigned build scripts)
- CARGO_TARGET_DIR redirected to C: drive via `src-tauri/.cargo/config.toml`
- brotli 8.0.3 bug patched via `src-tauri/patches/brotli/`

---

## Forbidden Actions (Always Active)

- Do not run `git add .`
- Do not commit unless the user explicitly approves
- Do not touch `.env` files
- Do not print or log password hashes or secrets
- Do not connect to live external APIs
- Do not upload business data to any external service
- Do not implement cloud sync or multi-device mode
- Do not delete existing files without user approval
- Do not build fake frontend-only modules without real database backing
- Do not put all business logic in one file

---

## AppData Layout (CONFIRMED)

```
%APPDATA%\QMSDesktop\
├── data.db               ← SQLite database (all tables + migrations 001, 002)
├── settings.json         ← placeholder JSON
├── license.json          ← placeholder JSON (status: unlicensed)
├── uploads\
│   ├── documents\
│   ├── capa\
│   ├── risks\
│   ├── complaints\
│   ├── audits\
│   └── nc\
└── backups\
```

---

## Phase 4 Checklist (COMPLETE)

- [x] Documents list page — DataTable, filter by status/category
- [x] Create/Edit document form (title, category, version, owner, approval date, description)
- [x] Auto-number generation: `{document_prefix}-{YYYY}-{NNNN}` from settings
- [x] File picker for document file (stored in `uploads/documents/{docId}_{timestamp}.{ext}`)
- [x] Document revision history (document_revisions table)
- [x] Status workflow: UNDER PROCESS → CONTROLLED → OBSOLETE (with confirmation modal)
- [x] DetailsDrawer: Details / Revisions / Activity tabs
- [x] Rust commands: all 9 document commands implemented
- [x] Activity log entries for document create/update/status change/file attach
- [x] Write `docs/reports/PHASE_4_DOCUMENTS_REPORT.md`
- [x] Update `CURRENT_PHASE.md` and `DEVELOPMENT_LOG.md`

## Phase 4B Checklist (COMPLETE)

- [x] `src/services/exportService.ts` — CSV and JSON export with save dialog + write_text_file Rust command
- [x] `src/services/printService.ts` — HTML print report (company name, date, styled table) via window.open
- [x] `src/services/importService.ts` — Preview-only CSV/JSON parser (no DB inserts in Phase 4B)
- [x] `src/services/fileActionService.ts` — Shared file open wrapper
- [x] `src/components/ui/ModuleToolbar.tsx` — New/Refresh/Print/Export dropdown/Import; permission-aware
- [x] `src/components/ui/FilterBar.tsx` — Reusable search + select filter bar
- [x] `src-tauri/src/commands/files.rs` — `write_text_file` command (no new Cargo dependency)
- [x] `src-tauri/capabilities/default.json` — Added `dialog:allow-save`
- [x] `src/pages/Documents.tsx` — ModuleToolbar + FilterBar applied; Refresh/Export CSV/Export JSON/Print/Import (notice modal)
- [x] Build: 0 TypeScript errors, 1625 modules, 264.15 kB JS
- [x] Tauri dev: Rust incremental 0.50s, 0 errors, window opened
- [x] Write `docs/reports/PHASE_4B_DESKTOP_OPERATIONS_FOUNDATION_REPORT.md`
- [x] Update `CURRENT_PHASE.md`, `DEVELOPMENT_LOG.md`, `CLAUDE_HANDOFF.md`, `SECURITY_NOTES.md`, `RUNBOOK.md`

## Phase 5 Checklist (COMPLETE)

- [x] CAPA register with CRUD and auto-numbered CAPA IDs (`{capa_prefix}-{YYYY}-{NNNN}`)
- [x] Types: CORRECTIVE, PREVENTIVE
- [x] Status workflow: OPEN → CLOSED (with effectiveness check required for closure)
- [x] Root cause analysis fields (method, cause text)
- [x] Action plan with target date and effectiveness check
- [x] Source linking fields (MANUAL/COMPLAINT/RISK/AUDIT/NC + source_id)
- [x] Activity log for CAPA events (CREATED, UPDATED, CLOSED, REOPENED, ATTACHMENT_ADDED)
- [x] All SQL via Rust Tauri commands (parameterized, rusqlite)
- [x] Role-based: Admin/QM create/edit/close; others view
- [x] Drawer with 4 tabs: Details, Action Plan, Attachments, Activity
- [x] KPI cards: Total, Open, Overdue, Closed (all clickable to filter)
- [x] Export CSV/JSON, Print CAPA Register
- [x] Import button — notice modal (import deferred)
- [x] Write `docs/reports/PHASE_5_CAPA_REPORT.md`
- [x] Update `CURRENT_PHASE.md`, `DEVELOPMENT_LOG.md`, `CLAUDE_HANDOFF.md`, `SECURITY_NOTES.md`, `RUNBOOK.md`
- [x] Build: 0 TypeScript errors, 1627 modules, 299.22 kB JS
- [x] Rust: incremental 0.51s, 0 errors, app window opened

## Phase 6 Checklist (COMPLETE)

- [x] Migration 004 — added `source`, `who_might_be_affected`, `recommended_actions`, `time_scale` columns to risks
- [x] Risk register with CRUD and auto-numbered Risk IDs (`{risk_prefix}-{YYYY}-{NNNN}`)
- [x] Severity × likelihood 5×5 matrix with visual component and live score preview
- [x] Risk level computed in Rust: LOW/MEDIUM/HIGH/CRITICAL; stored as TEXT
- [x] `risk_score` GENERATED ALWAYS AS (severity * likelihood) STORED — never written by Rust
- [x] Status workflow: OPEN ↔ CLOSED with confirmation modals
- [x] 9 Rust commands for risks; 9 Rust commands for complaints (18 total)
- [x] Activity log for all mutations in both modules (module='risk' / module='complaint')
- [x] Risks DetailsDrawer: 5 tabs — Details, Controls & Actions, Risk Matrix, Attachments, Activity
- [x] Complaints DetailsDrawer: 4 tabs — Details, Customer (dedicated card), Attachments, Activity
- [x] Risk KPI cards: Total, Open, High/Critical (score ≥ 10), Closed
- [x] Complaint KPI cards: Total, Open, Closed, Unique Customers (non-clickable)
- [x] Customer filter dynamically built from unique customer_id values in loaded data
- [x] Export CSV/JSON and Print registers for both modules
- [x] Role-based: Admin/QM create/edit/close; others view
- [x] Write `docs/reports/PHASE_6_RISKS_COMPLAINTS_REPORT.md`
- [x] Update CURRENT_PHASE.md, DEVELOPMENT_LOG.md, CLAUDE_HANDOFF.md, SECURITY_NOTES.md, RUNBOOK.md
- [x] Build: 0 TypeScript errors, 0 Rust errors

## Phase 7 Checklist (Next)

Phase 7: Audits + Non-Conformities modules.

---

## Known Issues

- `tauri-plugin-sql` path: plugin resolves to `%LOCALAPPDATA%\com.qmsdesktop.app` for JS-side DB. All SQL uses Rust commands instead.
- If the currently logged-in user is deactivated mid-session: in-memory session stays valid until app close. On next launch, login will fail. This is expected for a local desktop app.
- 3 esbuild npm audit findings (pre-existing, dev tooling only, not in shipped app).
- `src-tauri/icons/` has development placeholder icons. Replace in Phase 9.
