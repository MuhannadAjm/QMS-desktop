# QMS Desktop — Development Log

This log records what changed in each session. One entry per phase or significant
work session. Entries are appended chronologically.

---

## 2026-06-15 — Phase 9B: Online Activation Server, RSA License Tokens, Admin Portal

**Session type:** Phase 9B full implementation. Server backend + Rust RSA verification + TypeScript UI + Admin Portal. No local SQLite changes.

**Work completed:**

**Supabase backend (new):**
- `supabase/migrations/001_license_schema.sql` — 5 tables with RLS, triggers, partial unique index
- `supabase/functions/_shared/{cors,rsa,auth}.ts` — shared helpers: CORS, RSA-PKCS1v15 signing, admin JWT check
- `supabase/functions/activate-license/index.ts` — public activation; hashes key, checks limits, signs token
- `supabase/functions/validate-license/index.ts` — public validation; refreshes last_seen_at and token
- `supabase/functions/admin-generate-license/index.ts` — admin: creates customer+key, returns raw key ONCE
- `supabase/functions/admin-deactivate-device/index.ts` — admin: deactivates specific activation
- `supabase/functions/admin-list-licenses/index.ts` — admin: license list with activation counts
- `supabase/functions/.env.example`, `supabase/README_LICENSE_SERVER.md`

**Rust (modified):**
- `Cargo.toml` — rsa 0.9 (pem), base64 0.22, reqwest 0.12 (native-tls), sha2 oid feature
- `src/license/token.rs` — added `activation_id: Option<String>`
- `src/license/rsa_public_key.rs` (new) — embedded SPKI PEM dev public key
- `src/license/validation.rs` — RSA production path + canonical_payload (BTreeMap); HMAC dev_bypass kept
- `src/commands/license.rs` — `activate_license_online` + `validate_license_online` async commands; `LicenseDetails.activation_id`
- `src/commands/mod.rs`, `src/lib.rs` — registered 2 new commands

**TypeScript (modified):**
- `src/types/license.ts` — `LicenseDetails.activation_id`
- `src/services/licenseService.ts` — `activateLicenseOnline`, `validateLicenseOnline`
- `src/pages/License.tsx` — Online Activation card + Validate Online button + activation_id detail row

**License Admin Portal (new):**
- `license-admin/` — separate React/Vite/Tailwind web app with 6 pages (Login, Customers, Licenses, LicenseDetail, GenerateLicense, Events) + Layout sidebar

**Key decisions:**
- RSA algorithm: PKCS1v15-SHA256 (deterministic; Deno RSASSA-PKCS1-v1_5 + Rust rsa 0.9 pkcs1v15::VerifyingKey)
- sha2 oid feature required for `VerifyingKey::new()` (DigestInfo prefix in signature)
- Token canonicalization: BTreeMap→compact JSON; all 15 fields always present (null for absent optionals)
- Raw license key never stored: hash(key + ":" + secret) only; raw key returned to admin portal ONCE
- Offline fallback: validate_license_online falls back to local RSA on network error
- Admin portal uses Supabase anon key (safe in browser); writes go through Edge Functions with service_role

**Build:** 1639 modules, 0 TypeScript errors. Rust: `Finished dev profile`, 0 errors.

---

## 2026-06-15 — Phase 6: Risks + Complaints

**Session type:** Full Risks and Complaints module implementation. Source code written. Migration 004 added.

**Work completed:**

**Database (migration 004):**
- Created `src-tauri/src/db/sql/004_phase6_risks_complaints.sql` — ALTER TABLE to add `source`, `who_might_be_affected`, `recommended_actions`, `time_scale` columns to `risks`
- Updated `src-tauri/src/db/init.rs` — added MIGRATION_004 constant and Migration entry

**Rust (no new Cargo dependencies):**
- Created `src-tauri/src/commands/risks.rs` — 9 commands: `list_risks`, `get_risk`, `create_risk`, `update_risk`, `set_risk_status`, `get_risk_activity`, `attach_risk_file`, `open_risk_attachment`, `list_risk_attachments`
- Created `src-tauri/src/commands/complaints.rs` — 9 commands: `list_complaints`, `get_complaint`, `create_complaint`, `update_complaint`, `set_complaint_status`, `get_complaint_activity`, `attach_complaint_file`, `open_complaint_attachment`, `list_complaint_attachments`
- Updated `src-tauri/src/commands/mod.rs` — added `mod risks;`, `mod complaints;` and exported all 18 commands
- Updated `src-tauri/src/lib.rs` — registered all 18 new commands in `generate_handler![]`

**TypeScript (new files):**
- Created `src/types/risk.ts` — RiskListItem (27 fields), RiskAttachment, RiskActivityEntry, RISK_CATEGORIES, RISK_LEVELS, RISK_SOURCES, computeRiskLevel, riskLevelBadgeClass, riskScoreCellClass
- Created `src/types/complaint.ts` — ComplaintListItem (19 fields), ComplaintAttachment, ComplaintActivityEntry, COMPLAINT_PRIORITIES, COMPLAINT_CATEGORIES, priorityBadgeClass
- Created `src/services/riskService.ts` — wraps all 9 risk Tauri commands
- Created `src/services/complaintService.ts` — wraps all 9 complaint Tauri commands

**TypeScript (modified files):**
- `src/services/exportService.ts` — added exportRisksCSV, exportRisksJSON, exportComplaintsCSV, exportComplaintsJSON
- `src/services/printService.ts` — added printRiskRegister, printComplaintRegister; renamed existing win variables (docWin, capaWin) for uniqueness
- `src/pages/Risks.tsx` — full rewrite from placeholder to complete Risks module
- `src/pages/Complaints.tsx` — full rewrite from placeholder to complete Complaints module

**Key decisions:**
- `risk_score` is GENERATED ALWAYS AS (severity × likelihood) STORED in SQLite — Rust never writes it
- `risk_level` is computed by Rust at INSERT/UPDATE (1–4=LOW, 5–9=MEDIUM, 10–19=HIGH, 20–25=CRITICAL) and stored as TEXT
- High Risk KPI card: risks with risk_score ≥ 10 (HIGH + CRITICAL levels)
- Unique Customers KPI: computed from loaded complaints (non-clickable)
- Risk file storage: `uploads_risks`; complaint file storage: `uploads_complaints` (both already existed in StoragePaths)
- Customer filter dropdown dynamically built from unique customer_id values in loaded data
- 4 TypeScript errors fixed during implementation: wrong import paths, wrong ModuleToolbar prop (onExport→exportOptions array), wrong FilterSelectConfig shape (no id/label), wrong prop name (hasActiveFilter→hasActiveFilters)

**Build result:** 0 TypeScript errors. Rust: 0 errors.

**Source code changed:** Yes
**Database changed:** Yes (migration 004)

---

## 2026-06-14 — Phase 5: CAPA Module

**Session type:** Full CAPA module implementation. Source code written. No database migration needed.

**Work completed:**

**Rust (no new Cargo dependencies):**
- Created `src-tauri/src/commands/capa.rs` — 9 commands: `list_capas`, `get_capa`, `create_capa`, `update_capa`, `set_capa_status`, `get_capa_activity`, `attach_capa_file`, `open_capa_attachment`, `list_capa_attachments`
- Updated `src-tauri/src/commands/mod.rs` — added `mod capa;` and exported all 9 commands
- Updated `src-tauri/src/lib.rs` — registered all 9 capa commands in `generate_handler![]`

**TypeScript (new files):**
- Created `src/types/capa.ts` — CapaListItem (with is_overdue), CAPAAttachment, CapaActivityEntry, CAPA_TYPES, SOURCE_TYPES, CAPA_PRIORITIES, ROOT_CAUSE_METHODS, CAPA_STATUSES
- Created `src/services/capaService.ts` — wraps all 9 Tauri CAPA commands

**TypeScript (modified files):**
- `src/services/exportService.ts` — added `exportCapasCSV`, `exportCapasJSON`
- `src/services/printService.ts` — added `printCapaRegister`
- `src/pages/CAPA.tsx` — full rewrite from 32-line placeholder to complete CAPA module

**Database:** No migration. `capas`, `attachments`, and `capa_prefix` setting all existed from earlier migrations.

**Key decisions:**
- `is_overdue` computed in SQL: `status='OPEN' AND target_date IS NOT NULL AND target_date < date('now')`
- Closing requires non-empty `effectiveness_check`; `closed_at` is auto-set
- Reopening clears `closed_at` and returns status to OPEN
- Attachments under `%APPDATA%\QMSDesktop\uploads\capa\` via `storage::get_storage_paths()?.uploads_capa`
- CAPA number auto-generated: `{capa_prefix}-{YYYY}-{NNNN}` using settings key `capa_prefix`

**Build result:** 1627 modules, 0 TypeScript errors, 299.22 kB JS (+35.07 kB from 4B). Rust: incremental 0.57s, 0 errors.

**Source code changed:** Yes
**Database changed:** No

---

## 2026-06-14 — Phase 0: Project Control and Architecture Setup

**Session type:** Documentation only. No source code written. No database created.

**Work completed:**

- Confirmed project folder: `D:\QMS-Desktop` — empty, not a git repository.
- Created `docs/phases/` and `docs/reports/` directories.
- Created all mandatory documentation files:
  - `ARCHITECTURE.md` — technology stack, folder structure, AppData layout, data relationships, constraints.
  - `DATABASE_SCHEMA.md` — full SQLite schema for all tables, numbering format, migration strategy, risk scoring.
  - `SECURITY_NOTES.md` — auth design, role-based access, SQL injection prevention, file upload safety, IPC security, known limitations.
  - `LICENSE_DESIGN.md` — hardware-bound offline license, RSA signature, hardware fingerprint, activation flow (Phase 9 only).
  - `UI_GUIDELINES.md` — color system, typography, layout, core component specs, interaction patterns, do-not list.
  - `PHASE_PLAN.md` — Phase 0–9 plan with objectives, deliverables, and validation for each phase.
  - `DEVELOPMENT_LOG.md` — this file.
  - `CLAUDE_HANDOFF.md` — session handoff context for future Claude sessions.
  - `CURRENT_PHASE.md` — current phase tracker.
  - `RUNBOOK.md` — developer operations guide.
  - `docs/reports/PHASE_0_PROJECT_CONTROL_REPORT.md` — phase completion report.

**Source code changed:** No
**Database changed:** No
**Forbidden actions:** None performed.

**Next phase:** Phase 1 — Tauri Desktop Foundation

---

## 2026-06-14 — Phase 1: Tauri Desktop Foundation

**Session type:** Source code. No database. UI shell only.

**Work completed:**

- Project folder inspected: documentation files from Phase 0 present, no source code.
- Node.js v24.16.0 and npm 11.13.0 confirmed available.
- Rust/Cargo confirmed NOT installed on this machine (documented as known issue).
- Created all required source directories:
  `src/app/`, `src/components/layout/`, `src/components/ui/`, `src/pages/`,
  `src/types/`, `src/hooks/`, `src/services/`, `src/repositories/`,
  `src/db/migrations/`, `src/features/`, `src/utils/`, `src-tauri/src/`, `src-tauri/icons/`

**Config files created:**
  - `package.json` — dependencies: React 18, Tauri 2 API, lucide-react, react-router-dom; devDeps: Vite 6, TypeScript 5.6, Tailwind 3.4
  - `vite.config.ts` — Vite config with Tauri dev server settings (port 1420)
  - `tsconfig.json` — strict TypeScript, moduleResolution: bundler, noEmit: true
  - `tsconfig.node.json` — node-specific config for vite.config.ts
  - `tailwind.config.ts` — custom navy color (`#1E3A5F` / `#2E5080` / `#EBF2FA`), Inter font stack
  - `postcss.config.js` — tailwindcss + autoprefixer
  - `index.html` — Tauri webview entry point

**Tauri backend stubs:**
  - `src-tauri/tauri.conf.json` — Tauri 2 config, window 1280×800, CSP, bundle settings
  - `src-tauri/Cargo.toml` — Tauri 2 dependency, release profile optimization
  - `src-tauri/build.rs` — tauri-build entry point
  - `src-tauri/src/main.rs` — prevents console window on Windows release
  - `src-tauri/src/lib.rs` — Tauri builder, no plugins yet

**Source files:**
  - `src/main.tsx` — React 18 createRoot entry
  - `src/App.tsx` — HashRouter wrapping AppRouter
  - `src/index.css` — Tailwind directives, custom scrollbar, focus ring
  - `src/vite-env.d.ts` — Vite client types
  - `src/app/router.tsx` — all 12 routes under AppLayout, default redirect to /dashboard

**Layout components:**
  - `src/components/layout/AppLayout.tsx` — flex row: Sidebar (240px) + (Topbar + Outlet)
  - `src/components/layout/Sidebar.tsx` — navy sidebar, 4 nav groups, active border-l-[3px] indicator
  - `src/components/layout/Topbar.tsx` — white topbar, breadcrumb, license badge, notifications, user

**UI components:**
  - `src/components/ui/Button.tsx` — 4 variants (primary/secondary/ghost/danger), 3 sizes
  - `src/components/ui/Card.tsx` — white card wrapper with optional padding
  - `src/components/ui/PageHeader.tsx` — title, subtitle, icon, optional action slot
  - `src/components/ui/StatCard.tsx` — KPI card with 5 color variants, clickable
  - `src/components/ui/StatusBadge.tsx` — 7 status types with correct colors from UI_GUIDELINES.md
  - `src/components/ui/EmptyState.tsx` — centered empty state with icon, title, description, CTA

**Pages (all placeholder):**
  - Dashboard: 7 StatCards (0 values) + EmptyState content area
  - CAPA, Risks, Complaints, Audits, NonConformities, Documents: PageHeader + EmptyState
  - Users, Settings, Reports: PageHeader + EmptyState
  - Backup: PageHeader + EmptyState with Create Backup button
  - License: active status badge + EmptyState with Phase 9 note

**Types:**
  - `src/types/common.ts` — RecordStatus, DocumentStatus, RiskLevel, UserRole, Priority, CAPAType, NCSource, etc.

**Build results:**
  - `npm install`: SUCCESS — 144 packages installed
    - Known: 3 high severity esbuild vulnerabilities (dev tooling only, not in shipped app)
    - Documented in phase report
  - `npm run build` (tsc + vite build): SUCCESS
    - TypeScript: 0 errors, 0 warnings
    - Vite: 1,602 modules transformed, 192 kB JS (60.87 kB gzipped), 14 kB CSS (3.47 kB gzipped)
    - Build time: 5.84 seconds
  - `npm run tauri dev`: BLOCKED — Rust/Cargo not installed
    - Tauri CLI 2.11.2 available via npm
    - Rust install required: https://rustup.rs
    - All frontend code is correct; only the Rust compilation step is missing

**Source code changed:** Yes
**Database changed:** No
**Forbidden actions:** None performed.

**Next phase:** Phase 2 — SQLite and Local AppData Foundation

---

## 2026-06-14 — Rust/Tauri Dependency Stabilization (between Phase 1 and Phase 2)

**Session type:** Environment/dependency fix only. No Phase 2 work. No business logic. No SQLite.

**Problem encountered:**
After Rust installation, `npm run tauri dev` failed during Rust compilation with:
- `StandardAlloc does not implement alloc::Allocator`
- `alloc-no-stdlib 2.0.4 and 3.0.0 are both present`
- `could not compile brotli`

**Root cause — Issue 1: brotli 8.0.3 packaging bug**
`brotli 8.0.3` has an internal version conflict in its own dependency graph:
- Direct dep: `alloc-no-stdlib = "2.0"` (version 2.0.4)
- Sub-deps `alloc-stdlib 0.2.3` and `brotli-decompressor 5.0.2` both require `alloc-no-stdlib 3.0.0`
- Two incompatible types named `StandardAlloc` coexist, causing compile failure
- This is a packaging bug in `brotli 8.0.3` (the dep should have been updated to `"3.0"` with the brotli-decompressor 5.x upgrade)

**Fix applied — Issue 1:**
- Copied `brotli 8.0.3` source from Cargo registry cache to `src-tauri/patches/brotli/`
- Changed single line in `patches/brotli/Cargo.toml`: `alloc-no-stdlib = "2.0"` → `alloc-no-stdlib = "3.0"`
- Added `[patch.crates-io] brotli = { path = "patches/brotli" }` to `src-tauri/Cargo.toml`
- Verified: `cargo tree -p brotli` shows all three alloc-no-stdlib references now at `3.0.0`
- Verified: `npm run build` still passes (1,602 modules, 0 errors)

**Root cause — Issue 2: Windows WDAC policy blocking compiled build scripts**
After the brotli fix, cargo progressed to 110+ packages before a new error:
- `An Application Control policy has blocked this file. (os error 4551)` on compiled build scripts
- Affected: `icu_normalizer_data`, `anyhow`, and other crates with build scripts
- Confirmed: 8 active WDAC `.cip` policies in `C:\Windows\System32\CodeIntegrity\CIPolicies\Active`
- Smart App Control is in Evaluation mode (state=1); primary cause is signature-enforcing WDAC policies
- The compiled Rust build-script binaries are unsigned and therefore blocked by the policy
- This is NOT a code/dependency issue — it is an OS environment configuration issue

**Fix required — Issue 2 (USER ACTION NEEDED):**
Enable Windows Developer Mode. This explicitly exempts developer build tools from WDAC enforcement:
```
Windows Settings → System → For developers → Developer Mode → ON
```
After enabling, run `npm run tauri dev` again. No code changes needed.

**Files modified this session:**
- `src-tauri/Cargo.toml` — added `[patch.crates-io]` section
- `src-tauri/patches/brotli/Cargo.toml` — new file (patched brotli with alloc-no-stdlib 3.0)
- `src-tauri/patches/brotli/src/` — copied brotli 8.0.3 source
- `src-tauri/.cargo/config.toml` — new file (CARGO_TARGET_DIR redirected to C: drive)
- `docs/reports/PHASE_1_TAURI_FOUNDATION_REPORT.md` — addendum added
- `CLAUDE_HANDOFF.md` — known issues updated
- `RUNBOOK.md` — Windows Developer Mode prerequisite added

**Source code changed:** No (all changes are dependency patches and environment config)
**Database changed:** No
**Phase 2 started:** No
**Forbidden actions:** None performed.

**Status:** Unblocked pending user enabling Developer Mode.

---

## 2026-06-14 — Icon Placeholder Fix (environment fix, not Phase 2)

**Session type:** Environment/foundation fix only. No Phase 2 work. No business logic. No SQLite.

**Problem encountered:**
`tauri-build` requires all icon files listed in `tauri.conf.json` to physically exist.
`src-tauri/icons/` contained only `.gitkeep` (empty). Build failed with:
- `icons/icon.ico not found; required for generating a Windows Resource file during tauri-build`

**Root cause:** Icon directory created in Phase 1 as a placeholder (`.gitkeep` only).
The `bundle.icon` array in `tauri.conf.json` references 5 files that must exist before
`tauri-build` can compile the Rust backend.

**Fix applied:**
Created development placeholder icons — navy blue (#1E3A5F) with a centered white "Q" — at all 5 required paths:

| File | Format | Size |
|---|---|---|
| `icons/32x32.png` | PNG (System.Drawing) | 32×32 px |
| `icons/128x128.png` | PNG (System.Drawing) | 128×128 px |
| `icons/128x128@2x.png` | PNG (System.Drawing) | 256×256 px (Retina) |
| `icons/icon.ico` | Binary ICO (32×32 32bpp BGRA) | 4286 bytes |
| `icons/icon.icns` | Binary ICNS (8-byte header, empty) | 8 bytes |

The ICO file was written as a valid binary ICO (ICONDIR + ICONDIRENTRY + BITMAPINFOHEADER +
pixel data + AND mask). The ICNS file is a minimal valid macOS icon stub — Tauri only
reads it during macOS bundle builds, so it is a safe placeholder for Windows dev work.

**Files created this session:**
- `src-tauri/icons/32x32.png`
- `src-tauri/icons/128x128.png`
- `src-tauri/icons/128x128@2x.png`
- `src-tauri/icons/icon.ico`
- `src-tauri/icons/icon.icns`

**Files updated this session:**
- `RUNBOOK.md` — added "App Icons — Development Placeholders" section
- `DEVELOPMENT_LOG.md` — this entry
- `CLAUDE_HANDOFF.md` — known issues updated (icons now present)

**Source code changed:** No (icon files only)
**Database changed:** No
**Phase 2 started:** No
**Forbidden actions:** None performed.

**Additional fix — RC.EXE not in PATH:**
After icon fix, `npm run tauri dev` reached package 345/355 then failed:
```
Are you sure you have RC.EXE in your $PATH or ${RC_$TARGET} or $RC is set?
```
`rc.exe` exists at `C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\rc.exe`
but is not in PATH. Fix: set `$env:RC` to the full path before running tauri dev.

**Final result:**
`npm run tauri dev` completed successfully with `$env:RC` set:
- All 355 packages compiled in 25.37 seconds
- `qms-desktop.exe` launched at `C:\Users\roaas\.cargo\targets\qms-desktop\debug\qms-desktop.exe`
- Tauri dev window opened — UI shell visible and functional
- WDAC blocker also resolved (Developer Mode was enabled between sessions)

**Status:** `npm run tauri dev` WORKING. All environment blockers resolved.
To run in future sessions: `$env:RC = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\rc.exe"` then `npm run tauri dev`.
Permanent fix: add the Windows Kits bin directory to system PATH (see RUNBOOK.md).

---

## 2026-06-14 — Phase 2: SQLite and Local AppData Foundation

**Session type:** Source code. Database infrastructure only. No business CRUD. No auth. No license logic.

**Work completed:**

**New Cargo dependencies:**
- `rusqlite = { version = "0.32", features = ["bundled"] }` — embedded SQLite, controls exact DB path
- `tauri-plugin-sql = "2"` — registered for future JS-side queries in Phase 3+
- `@tauri-apps/plugin-sql` npm package installed

**New Rust source modules:**
- `src-tauri/src/storage/mod.rs` — AppData path resolver (`%APPDATA%\QMSDesktop\`), directory creator, placeholder file writer (settings.json, license.json)
- `src-tauri/src/db/mod.rs` — database module public interface
- `src-tauri/src/db/init.rs` — SQLite open, WAL + FK PRAGMAs, `schema_migrations` table creation, migration runner (idempotent, checks applied versions)
- `src-tauri/src/db/sql/001_initial_schema.sql` — all 13 QMS tables + default settings rows
- `src-tauri/src/commands/mod.rs` — commands module public interface
- `src-tauri/src/commands/storage.rs` — `initialize_app_storage` and `get_app_storage_status` Tauri commands

**Modified Rust files:**
- `src-tauri/src/lib.rs` — registered db/storage/commands modules; registered tauri_plugin_sql plugin; wired `generate_handler!` with `use` imports to satisfy macro symbol requirements

**New frontend files:**
- `src/types/appStorage.ts` — `AppStorageStatus` TypeScript interface
- `src/services/appStorageService.ts` — `initializeAppStorage()` and `getAppStorageStatus()` wrapping `@tauri-apps/api/core` invoke

**Modified frontend files:**
- `src/App.tsx` — `useEffect` calls `initializeAppStorage()` on startup
- `src/pages/Settings.tsx` — System Storage Status panel with live status, all boolean indicators, migration list, storage path

**Database tables created (migration 001):**
`settings`, `users`, `documents`, `document_revisions`, `risks`, `complaints`,
`audits`, `audit_findings`, `non_conformities`, `capas`, `attachments`,
`activity_log`, `document_links`

**AppData created and verified:**
```
%APPDATA%\QMSDesktop\data.db           — 114,688 bytes, SQLite format 3
%APPDATA%\QMSDesktop\settings.json     — placeholder JSON
%APPDATA%\QMSDesktop\license.json      — placeholder JSON
%APPDATA%\QMSDesktop\uploads\documents\ — confirmed
%APPDATA%\QMSDesktop\uploads\capa\     — confirmed
%APPDATA%\QMSDesktop\uploads\risks\    — confirmed
%APPDATA%\QMSDesktop\uploads\complaints\ — confirmed
%APPDATA%\QMSDesktop\uploads\audits\   — confirmed
%APPDATA%\QMSDesktop\uploads\nc\       — confirmed
%APPDATA%\QMSDesktop\backups\          — confirmed
```

**Build results:**
- `npm run build` (tsc + vite): SUCCESS — 1,605 modules, 0 TypeScript errors, 195.78 kB JS
- `npm run tauri dev`: SUCCESS — 414 packages compiled in 6.19s, window opened

**Known issues discovered:**
- `tauri-plugin-sql` path: plugin defaults to `%LOCALAPPDATA%\com.qmsdesktop.app` for its DB;
  Phase 3 will use Rust-side Tauri commands for all SQL queries to avoid this path discrepancy.

**Source code changed:** Yes
**Database changed:** Yes — first-time creation
**Phase 3 started:** No
**Forbidden actions:** None performed.

**Next phase:** Phase 3 — Settings + Users / Auth

---

## 2026-06-14 — Phase 3: Settings + Users / Auth

**Session type:** Source code. Authentication infrastructure, user management, settings CRUD. No Documents/CAPA/Risks/Complaints/Audits/NC CRUD.

**Work completed:**

**New Rust dependency:**
- `argon2 = { version = "0.5", features = ["std"] }` — Argon2id password hashing

**New Rust source modules:**
- `src-tauri/src/password.rs` — `hash_password`, `verify_password`, `validate_password_strength`
- `src-tauri/src/commands/auth.rs` — `check_first_admin_exists`, `create_first_admin`, `login`
- `src-tauri/src/commands/users.rs` — `list_users`, `create_user`, `update_user`, `set_user_status`, `reset_user_password`
- `src-tauri/src/commands/settings_cmd.rs` — `get_settings`, `update_setting`

**Modified Rust files:**
- `src-tauri/src/commands/mod.rs` — registered all new commands
- `src-tauri/src/db/mod.rs` — added `open_conn()` helper
- `src-tauri/src/db/init.rs` — added migration 002
- `src-tauri/src/lib.rs` — registered all new Tauri commands

**New SQL migration:**
- `src-tauri/src/db/sql/002_phase3_auth.sql` — adds `department TEXT NOT NULL DEFAULT ''` column to users; inserts 12 new settings keys (quality_policy, qms_scope, departments, address, contact_email, phone, document_prefix, capa_prefix, risk_prefix, complaint_prefix, audit_prefix, nc_prefix)

**New frontend files:**
- `src/types/user.ts` — `AuthUser`, `UserListItem`, `UserRole`, `ALL_ROLES`, `ROLE_LABELS`
- `src/types/settings.ts` — `SettingEntry`, `SettingsMap`, `SETTINGS_DEFAULTS`
- `src/stores/authStore.ts` — Zustand store: `bootstrapState`, `user`, `isAuthenticated`, `setBootstrapResult`, `login`, `logout`
- `src/services/authService.ts` — `checkFirstAdminExists`, `createFirstAdmin`, `loginUser`
- `src/services/userService.ts` — `listUsers`, `createUser`, `updateUser`, `setUserStatus`, `resetUserPassword`
- `src/services/settingsService.ts` — `getSettings`, `updateSetting`, `saveSettings`
- `src/pages/Login.tsx` — professional login form with email + password
- `src/pages/FirstAdminSetup.tsx` — first-launch admin account creation form

**Modified frontend files:**
- `src/App.tsx` — bootstrap logic: init storage → check first admin → set bootstrap state
- `src/app/router.tsx` — auth-aware routing (first-admin / login / authenticated app)
- `src/components/layout/Sidebar.tsx` — role-based nav, real user info, logout button, live company name
- `src/components/layout/Topbar.tsx` — real user name/role, "License Pending" badge
- `src/components/ui/StatusBadge.tsx` — added ACTIVE/INACTIVE status support
- `src/types/common.ts` — updated UserRole to include Auditor, Employee, Viewer
- `src/pages/Settings.tsx` — full CRUD: Company Profile, Quality System, Numbering Prefixes, System Preferences
- `src/pages/Users.tsx` — full CRUD: list table, create/edit modal, activate/deactivate, reset password

**Roles implemented:**
- Admin: all pages
- QualityManager: Dashboard, CAPA, Risks, Complaints, Audits, NC, Documents, Reports, Settings
- Auditor: Dashboard, Audits, NC, Documents, Reports
- Employee: Dashboard, CAPA, Risks, Complaints, Documents
- Viewer: Dashboard, Documents, Reports

**Security measures:**
- All passwords hashed with Argon2id (argon2 crate 0.5) in Rust backend
- Password hashes never returned to frontend
- Generic error message on login failure (no user enumeration)
- Email normalized to lowercase before storage and lookup
- Duplicate email prevention at application layer
- Parameterized SQL throughout (no string concatenation)
- In-memory only session (Zustand, cleared on app close per SECURITY_NOTES.md)
- Activity log entries for user creation, update, deactivation, password reset

**Build results:**
- npm install zustand: SUCCESS — 1 new package
- `npm run build` (tsc + vite): SUCCESS — 1,617 modules, 0 TypeScript errors, 226.82 kB JS
- `npm run tauri dev`: SUCCESS — 421 packages compiled in 6.48s, window opened

**Source code changed:** Yes
**Database changed:** Yes — migration 002 applied (department column + settings keys)
**Phase 4 started:** No
**Forbidden actions:** None performed.

**Next phase:** Phase 4 — Documents

---

## 2026-06-14 — Phase 3B: Auth and Permission Hardening

**Session type:** Source code. Stabilization/hardening only. No Documents/CAPA/Risks/Complaints/Audits/NC CRUD. No new database tables.

**Work completed:**

**New Rust source module:**
- `src-tauri/src/permissions.rs` — `require_admin(user_id)` and `require_admin_or_quality_manager(user_id)` helpers; private `require_role()` queries DB to verify caller is active and has required role.

**Modified Rust files:**
- `src-tauri/src/lib.rs` — added `mod permissions;`
- `src-tauri/src/commands/users.rs` — all 5 user commands now accept `current_user_id: i64`; each calls `permissions::require_admin(current_user_id)?;` before executing; activity log now records `performed_by`
- `src-tauri/src/commands/settings_cmd.rs` — `update_setting` now accepts `current_user_id: i64` and calls `permissions::require_admin_or_quality_manager(current_user_id)?;`; `get_settings` unchanged (read-only, no restriction)

**New frontend file:**
- `src/stores/settingsStore.ts` — Zustand store: `companyName`, `setCompanyName`

**Modified frontend files:**
- `src/services/userService.ts` — all functions accept `currentUserId: number` as first param, passed to Tauri invocations
- `src/services/settingsService.ts` — `updateSetting` and `saveSettings` accept `currentUserId: number`, passed to Tauri invocations; `getSettings` unchanged
- `src/components/layout/Sidebar.tsx` — `CompanyName` component uses `settingsStore` instead of local state; reads on mount, reactive to store changes; removed unused `useState` import
- `src/pages/Settings.tsx` — imports `useSettingsStore`; after successful save calls `setCompanyName(values.company_name)` for immediate sidebar refresh; passes `user!.id` to `saveSettings`
- `src/pages/Users.tsx` — passes `currentUser!.id` to all service calls; `loadUsers` guards with `if (!currentUser) return;`; `useEffect` only fires when `isAdmin` is true

**Permission enforcement summary:**
| Command | Rust enforcement |
|---|---|
| `list_users` | Admin only |
| `create_user` | Admin only |
| `update_user` | Admin only |
| `set_user_status` | Admin only |
| `reset_user_password` | Admin only |
| `update_setting` | Admin or QualityManager |
| `get_settings` | None (read-only) |

**Bug fixed:**
- Company name in sidebar now updates immediately after Settings save (was requiring page reload)

**Build results:**
- `npm run build` (tsc + vite): SUCCESS — 1,618 modules, 0 TypeScript errors, 227.10 kB JS
- `npm run tauri dev`: SUCCESS — 421 packages compiled in 7.32s (incremental), window opened

**Source code changed:** Yes
**Database changed:** No (no new migration)
**Phase 4 started:** No
**Forbidden actions:** None performed.

**Next phase:** Phase 4 — Documents

---

## 2026-06-14 — Phase 4: Documents Module

**Session type:** Source code. First real QMS business module. Database migration added.

**Work completed:**

**npm package added:**
- `@tauri-apps/plugin-dialog@^2` — file picker dialog (JS side)

**New Cargo dependency:**
- `tauri-plugin-dialog = "2"` — native file open dialog (Rust side)

**New SQL migration:**
- `src-tauri/src/db/sql/003_phase4_documents.sql` — Migration 003: adds `original_file_name TEXT` column to both `documents` and `document_revisions` tables

**New Tauri capabilities file:**
- `src-tauri/capabilities/default.json` — `core:default` + `dialog:allow-open` permissions (required by tauri-plugin-dialog)

**Rust changes:**
- `src-tauri/src/permissions.rs` — Added `require_authenticated(user_id)` for read-only document commands (any active role)
- `src-tauri/src/db/init.rs` — Added MIGRATION_003 constant and vector entry
- `src-tauri/src/commands/users.rs` — Added `UserMinimal` struct + `list_users_minimal` command (Admin/QM)
- `src-tauri/src/commands/documents.rs` (NEW) — 9 document Tauri commands (full CRUD + file attach + open)
- `src-tauri/src/commands/mod.rs` — exports all 9 document commands + list_users_minimal
- `src-tauri/src/lib.rs` — registers all new commands + `.plugin(tauri_plugin_dialog::init())`

**New frontend files:**
- `src/types/document.ts` — DocumentListItem, DocumentRevision, ActivityEntry, UserMinimal, DOCUMENT_TYPES, DOCUMENT_STATUSES
- `src/services/documentService.ts` — wraps all 9 Tauri commands + listUsersMinimal

**Frontend files modified:**
- `src/pages/Documents.tsx` — complete rewrite from placeholder. Full Documents module with KPI cards, filter bar, data table, DetailsDrawer (Details/Revisions/Activity tabs), Create/Edit modal, Status Change modal, file browse + attach flow.

**File storage:** Files copied to `%APPDATA%\QMSDesktop\uploads\documents\{docId}_{timestamp_micros}.{ext}`. Open via `cmd /c start "" {path}`.

**Auto-numbering:** `{document_prefix}-{YYYY}-{NNNN}` using `document_prefix` settings key + yearly count.

**Build results:**
- `npm run build`: SUCCESS — 1621 modules, 0 TypeScript errors, 253.76 kB JS (73.24 kB gzip)
- `npm run tauri dev`: SUCCESS — 435 packages compiled in 35.99s, window opened

**Source code changed:** Yes
**Database changed:** Yes — Migration 003 applied on first launch
**Forbidden actions:** None performed.

**Next phase:** Phase 4B — Desktop Operations Foundation

---

## 2026-06-14 — Phase 4B: Desktop Operations Foundation

**Session type:** Source code. Reusable services + UI components. Applied lightly to Documents module. No new database tables. No CAPA/Risks/Complaints/Audits/NC CRUD.

**Work completed:**

**New Rust command:**
- `src-tauri/src/commands/files.rs` (NEW) — `write_text_file(path, content)`: safe local file write for export output. Validates absolute path, creates intermediate directories if needed.
- `src-tauri/src/commands/mod.rs` — added `mod files;` + `pub use files::write_text_file;`
- `src-tauri/src/lib.rs` — registered `write_text_file` in `generate_handler![]`

**Capabilities update:**
- `src-tauri/capabilities/default.json` — added `dialog:allow-save` (for export save dialog)

**New frontend service files:**
- `src/services/exportService.ts` — CSV export (`exportDocumentsCSV`), JSON export (`exportDocumentsJSON`); module-aware filenames; uses `save()` from plugin-dialog + `write_text_file` Rust command.
- `src/services/printService.ts` — `printDocumentRegister(docs, companyName)`: generates printable HTML with company header, styled table, footer; opens via `window.open()` + `window.onload = print`.
- `src/services/importService.ts` — Preview-only CSV/JSON parser: `parseCSVPreview`, `parseJSONPreview`, `previewImport`, `detectFormat`. No DB inserts in Phase 4B.
- `src/services/fileActionService.ts` — `openLocalDocumentFile(userId, documentId)`: thin wrapper around `open_document_file` Rust command for future shared use.

**New frontend UI component files:**
- `src/components/ui/ModuleToolbar.tsx` — New, Refresh, Print, Export (dropdown with options), Import; permission-aware (New/Import require canEdit); Export dropdown uses click-outside close ref.
- `src/components/ui/FilterBar.tsx` — Reusable filter bar: search input, N select dropdowns via config array, clear button when any filter is active.

**Modified frontend files:**
- `src/pages/Documents.tsx`:
  - Added imports: `ModuleToolbar`, `FilterBar`, `exportDocumentsCSV`, `exportDocumentsJSON`, `printDocumentRegister`, `useSettingsStore`
  - Removed `Search`, `Plus` icon imports (now internal to FilterBar/ModuleToolbar)
  - Replaced inline `PageHeader action=` button with `ModuleToolbar` in a flex row alongside `PageHeader`
  - Replaced inline filter bar div with `<FilterBar>` component
  - Added `handleExportCSV`, `handleExportJSON`, `handlePrint` handlers
  - Added `importNoticeOpen` state + `<ImportNoticeModal>` component (preview-only notice)
  - All existing functionality preserved: KPI cards, data table, DetailsDrawer, Create/Edit modal, Status Modal, file browse/attach/open

**Build results:**
- `npm run build`: SUCCESS — 1625 modules, 0 TypeScript errors, 264.15 kB JS (76.22 kB gzip)
- `npm run tauri dev`: SUCCESS — Rust compiled in 0.50s (incremental), window opened

**Source code changed:** Yes
**Database changed:** No
**Forbidden actions:** None performed.

**Next phase:** Phase 5 — CAPA

---
