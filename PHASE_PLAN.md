# QMS Desktop — Phase Plan

## Overview

| Phase | Name | Source Code | Database | Status |
|---|---|---|---|---|
| 0 | Project Control and Architecture Setup | No | No | COMPLETE |
| 1 | Tauri Desktop Foundation | Yes | No | COMPLETE |
| 2 | SQLite and Local AppData Foundation | Yes | Yes | COMPLETE |
| 3 | Settings + Users / Auth | Yes | Yes | COMPLETE |
| 3B | Auth / Permission Hardening | Yes | No | COMPLETE |
| 4 | Documents | Yes | Yes | COMPLETE |
| 4B | Desktop Operations Foundation | Yes | No | COMPLETE |
| 5 | CAPA | Yes | Yes | COMPLETE |
| 6 | Risks + Complaints | Yes | Yes | COMPLETE |
| 7 | Audits + Non-Conformities | Yes | Yes | COMPLETE |
| 8 | Dashboard + Reports + Backup | Yes | No | COMPLETE |
| 8B | Cross-Module Workflow Linking | Yes | Yes | COMPLETE |
| 9A | Local License Engine | Yes | No | COMPLETE |
| 9B | Online Activation + RSA Tokens + Admin Portal | Yes | No | COMPLETE |
| 9C | Windows MSI Installer and Production Packaging | Yes | No | COMPLETE |
| 9D | Installer EULA and Uninstall Policy | No | No | COMPLETE |
| 10 | Full QA, Regression Testing, and Release Readiness Audit | No | No | COMPLETE |
| 10B | License Signing Fix, License Key Format, Menu Bar, Fullscreen, App Icon | Yes | No | COMPLETE |
| 11A | Auth, Users, Profile, and Menu Context Cleanup | Yes | Yes (007) | COMPLETE |
| 11B | License/Sidebar/Navigation Shell | Yes | No | COMPLETE |
| 11C | Reports/Print/Export Fixes | Yes | No | COMPLETE |
| 11D | Backup/Restore/Import Flow | Yes | No | COMPLETE |
| 11E | Desktop Menu, Help, About, Support, Updates, Fullscreen Cleanup | Yes | No | COMPLETE |
| 11F | Installer EULA, Icon, Branding, and Release Visual Identity | No | No | COMPLETE |
| 12 | Security Hardening Review and Release Safety Audit | No | No | COMPLETE |
| 13 | Final QA Regression and Release Candidate Validation | No | No | COMPLETE |
| 14 | Final Release Package and Delivery Preparation | No | No | COMPLETE |
| 14B | Final Manual QA Fixes Before Release | Yes | No | COMPLETE |
| 11X | Standalone License Admin Desktop App | Yes | No | COMPLETE |

---

## Phase 0 — Project Control and Architecture Setup

**Objective:** Documentation, architecture, database plan, security plan, UI direction,
and phase plan. No source code is written.

Deliverables:
- [x] ARCHITECTURE.md
- [x] DATABASE_SCHEMA.md
- [x] SECURITY_NOTES.md
- [x] LICENSE_DESIGN.md
- [x] UI_GUIDELINES.md
- [x] PHASE_PLAN.md
- [x] DEVELOPMENT_LOG.md
- [x] CLAUDE_HANDOFF.md
- [x] CURRENT_PHASE.md
- [x] RUNBOOK.md
- [x] docs/phases/ directory
- [x] docs/reports/ directory
- [x] docs/reports/PHASE_0_PROJECT_CONTROL_REPORT.md

---

## Phase 1 — Tauri Desktop Foundation

**Objective:** Bootstrap the Tauri + React + TypeScript project. Implement the
AppLayout shell with sidebar, topbar, and placeholder pages for each module.

Deliverables:
- Tauri project initialized (`src-tauri/`, `src/`, `package.json`, `tauri.conf.json`)
- Vite + React + TypeScript configured
- Tailwind CSS configured
- React Router v6 configured
- AppLayout with Sidebar and Topbar
- All module routes with placeholder pages
- Build verified: `npm run tauri dev` launches without errors

Validation:
- App window opens on Windows
- Sidebar navigation works between all placeholder pages
- No TypeScript errors
- No console errors

Forbidden in this phase:
- No database operations
- No business CRUD
- No auth logic

---

## Phase 2 — SQLite and Local AppData Foundation

**Objective:** Initialize SQLite database in AppData, implement migration runner,
and establish the repository/service pattern.

Deliverables:
- tauri-plugin-sql integrated
- AppData path resolved via Tauri app APIs
- Database file created at `%APPDATA%\QMSDesktop\data.db` on first launch
- `schema_migrations` table and migration runner implemented
- Initial migration scripts (001–003 covering core tables)
- Repository pattern established (at least one example repository)
- `uploads/` subdirectories created automatically on first launch

Validation:
- Database file exists in AppData after launch
- Migrations run without errors
- Re-launch does not re-run already applied migrations
- `uploads/` directories exist

Forbidden in this phase:
- No auth/login UI
- No business form CRUD yet

---

## Phase 3 — Settings + Users / Auth

**Objective:** Company settings, logo storage, user management (CRUD), login screen,
role-based access control.

Deliverables:
- Settings page: company name, logo upload (saved to AppData), date format
- Users page: list, create, edit, deactivate users (Admin only)
- Login page: username + password
- Password hashing in Rust backend
- Session management via Zustand authStore
- Role enforcement: Admin, QualityManager, User
- First-launch wizard to create the first Admin account
- Protected routes — redirect to login if not authenticated

Validation:
- Admin can create users
- Login with valid credentials succeeds; invalid credentials are rejected
- Non-Admin cannot access Users or Settings pages
- Logout clears session

---

## Phase 4 — Documents

**Objective:** Full Documents module — CRUD, file upload, version control, status workflow.

Deliverables:
- Documents list page with DataTable (filterable by status, category)
- Create/Edit document form
- File upload via AttachmentUploader (stored in `uploads/documents/`)
- Document revision history (document_revisions table)
- Status workflow: UNDER PROCESS → CONTROLLED → OBSOLETE
- Document number auto-generation (DOC-YYYY-NNN)
- DetailsDrawer with details, revisions, and linked records tabs
- Document linking foundation (document_links table populated)

Validation:
- Document created with file attached
- Version bump on revision
- Status change tracked in activity_log
- File accessible after app restart

---

## Phase 5 — CAPA

**Objective:** Full CAPA module — CRUD, root cause analysis, effectiveness check,
links to source records.

Deliverables:
- CAPA list page with DataTable (filterable by status, type, assignee)
- Create/Edit CAPA form with:
  - Type: Corrective / Preventive
  - Source: NC / Risk / Complaint / Audit / Internal
  - Root cause and root cause method (5-Why, Fishbone, etc.)
  - Action plan
  - Target date and assigned user
  - Effectiveness check fields (method, date, result)
- CAPA number auto-generation (CPA-YYYY-NNN)
- Overdue detection (target date past, status still OPEN)
- Activity log per CAPA
- Attachments per CAPA
- DetailsDrawer with full CAPA details

Validation:
- CAPA can be created standalone and linked to a source NC
- Effectiveness check saved and displayed
- Overdue CAPA shows OVERDUE badge
- Attachments stored in `uploads/capa/`

---

## Phase 6 — Risks + Complaints

**Objective:** Risks module (with risk score and matrix), Complaints module (with
customer filtering), and NC/CAPA generation from both.

Deliverables:

**Risks:**
- Risk list with DataTable (filterable by level, status, category)
- Create/Edit risk form: severity, likelihood, auto-computed risk_score
- Risk level badge (LOW / MEDIUM / HIGH / CRITICAL)
- 5×5 Risk Matrix visualization
- Residual risk after mitigation
- Create NC from Risk (optional)
- Create CAPA from Risk (optional, direct)
- Attachments per risk

**Complaints:**
- Complaint list with DataTable (filterable by customer, status, priority)
- Customer Name + Customer ID as mandatory fields
- Filter by customer (customer_id dropdown or search)
- Create/Edit complaint form
- Create NC from Complaint (optional)
- Create CAPA from Complaint (optional, direct)
- Attachments per complaint

Validation:
- risk_score auto-calculated on severity/likelihood change
- Risk matrix displays correctly
- Complaints filtered by customer_id
- NC created from Risk links back to source Risk

---

## Phase 7 — Audits + Non-Conformities

**Objective:** Full Audit module with Findings, full NC module, NC→CAPA generation.

Deliverables:

**Audits:**
- Audit list with DataTable
- Create/Edit audit form
- Findings sub-list within Audit (audit_findings table)
- Finding types: NC / OFI / Observation / Positive
- Create NC from a specific Finding (with confirmation)
- Audit status: OPEN → CLOSED

**Non-Conformities:**
- NC list with DataTable (filterable by source, severity, status)
- Create/Edit NC form
- Source field links back to Audit Finding / Risk / Complaint
- Generate CAPA from NC — with ConfirmDialog and cancel option
- NC number auto-generation (NC-YYYY-NNN)
- Activity log per NC
- Attachments per NC

Validation:
- Audit Finding creates NC with correct source_id reference
- NC creates CAPA with source_id reference back to NC
- Cancelling CAPA generation does not create partial records
- All cross-module links visible in DetailsDrawer

---

## Phase 8 — Dashboard + Reports + Backup

**Objective:** Live KPI dashboard, PDF report export for all modules, manual backup/restore.

Deliverables:

**Dashboard:**
- StatCards: Open CAPAs, Overdue CAPAs, High Risks, Open Complaints, Open NCs,
  Completed Audits, Obsolete Documents
- Each StatCard is clickable and navigates to the filtered module view

**Reports (PDF export):**
- CAPA Report
- Risk Report
- Audit Report
- NC Report
- Complaint Report
- Document Register

**Backup / Restore:**
- Manual backup: zip `data.db` + `uploads/` → `backups/YYYYMMDD_HHmmss.zip`
- Restore: select backup file, confirm, replace current data
- List of available backups with date/size

Validation:
- All 6 PDF reports export correctly with data
- Backup file created in `backups/`
- Restore replaces database and uploads correctly
- Dashboard counts match actual module data

---

## Phase 9 — Hardware License + Installer

**Objective:** Hardware ID license validation, production build, and Windows installer.

Deliverables:
- Hardware fingerprint computation in Rust
- license.json validation at app startup
- License Activation page (shows when license is missing or invalid)
- Online or offline activation flow
- RSA signature verification in Rust
- Tauri production build: `npm run tauri build`
- Windows `.msi` installer generated
- Clean install test on a fresh Windows environment
- Installer places app in Program Files, AppData initialized on first launch

Validation:
- App launches and validates license on startup
- Missing license shows activation page
- Valid license allows full access
- Tampered license is rejected
- Fresh install works end-to-end

---

## Cross-Phase Rules

1. Each phase must complete its own validation checklist before the next phase begins.
2. No phase may implement features from a future phase.
3. Forbidden actions (see SECURITY_NOTES.md and CLAUDE_HANDOFF.md) apply to every phase.
4. A phase report (docs/reports/PHASE_N_*.md) must be written before closing a phase.
5. CURRENT_PHASE.md and DEVELOPMENT_LOG.md must be updated after every phase.

---

## Documentation Source of Truth (updated 2026-06-15)

**Active memory files (Phase 8 source of truth) are under `docs/`:**

| File | Location |
|---|---|
| CURRENT_PHASE.md | `docs/CURRENT_PHASE.md` |
| DEVELOPMENT_LOG.md | `docs/DEVELOPMENT_LOG.md` |
| CLAUDE_HANDOFF.md | `docs/CLAUDE_HANDOFF.md` |
| SECURITY_NOTES.md | `docs/SECURITY_NOTES.md` |
| DATABASE_SCHEMA.md | `docs/DATABASE_SCHEMA.md` |
| RUNBOOK.md | `docs/RUNBOOK.md` |

The root copies of those six files are stale historical archives (last updated Phase 4B–6). Do not use them as Phase 8 source of truth.

**Root-only files remain valid references after correction:**
- `ARCHITECTURE.md` — corrected 2026-06-15 (rusqlite; password hashing is Argon2id, not bcrypt — see BUG-01)
- `UI_GUIDELINES.md` — unchanged, still valid
- `PHASE_PLAN.md` — this file, corrected 2026-06-15
- `LICENSE_DESIGN.md` — unchanged, still valid

**Phase reports** remain exclusively under `docs/reports/`.
