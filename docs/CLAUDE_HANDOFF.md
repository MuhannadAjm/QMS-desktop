# Claude Code Handoff Document

**Last updated:** 2026-06-15  
**Current phase:** Phase 9C complete — Core product DONE

---

## IMPORTANT — Phase 9C Source of Truth

Read **this file** (`docs/CLAUDE_HANDOFF.md`) and the other files under `docs/` as the authoritative source of truth. Phases 9A, 9B, and 9C are complete. The root-level copies of the following files are stale (last updated Phase 4B–6) and must not be used:

| Stale root file | Current version |
|---|---|
| `CURRENT_PHASE.md` | `docs/CURRENT_PHASE.md` |
| `DEVELOPMENT_LOG.md` | `docs/DEVELOPMENT_LOG.md` |
| `CLAUDE_HANDOFF.md` | `docs/CLAUDE_HANDOFF.md` (this file) |
| `SECURITY_NOTES.md` | `docs/SECURITY_NOTES.md` |
| `DATABASE_SCHEMA.md` | `docs/DATABASE_SCHEMA.md` |
| `RUNBOOK.md` | `docs/RUNBOOK.md` |

Root-only files that **are** valid references (corrected before Phase 8):
- `ARCHITECTURE.md` — corrected 2026-06-15: rusqlite instead of tauri-plugin-sql. NOTE: password hashing is **Argon2id** (`argon2` crate v0.5, m=19456 t=2 p=1), never bcrypt — an earlier revision of this line stated the reverse (BUG-01)
- `PHASE_PLAN.md` — corrected 2026-06-15: phase statuses updated; source-of-truth note added
- `UI_GUIDELINES.md` — original Phase 0 document, still valid
- `LICENSE_DESIGN.md` — original Phase 0 document, still valid

---

## Project Summary

**QMS Desktop** — A cross-platform (Windows) Quality Management System desktop application built with:

- **Tauri 2** (Rust + WebView2)
- **React 18 + TypeScript** (Vite)
- **Tailwind CSS**
- **rusqlite 0.32 bundled** (SQLite, no separate binary required)
- **All database operations via custom Rust Tauri commands** (no tauri-plugin-sql JS API for business logic)

---

## Project Location

`D:\QMS-Desktop`

---

## Tech Rules (do NOT violate)

1. All SQL goes through Rust Tauri commands (`src-tauri/src/commands/`)
2. No raw string concatenation in SQL — `params![]` only
3. No cloud sync, billing, license activation, or multi-device mode
4. No `.env` files
5. No git commits without user approval
6. Storage paths from `storage::get_storage_paths()` — never hardcode AppData paths
7. File extensions validated against allowlist (PDF, DOC, DOCX, XLS, XLSX, PNG, JPG, JPEG)

---

## Architecture

### Rust Side

```
src-tauri/src/
  commands/
    audits.rs           — 13 audit commands
    auth.rs             — 3 auth commands
    backup.rs           — 5 backup commands (Phase 8)
    capa.rs             — 9 CAPA commands
    complaints.rs       — 11 complaint commands (9 + 2 cross-module Phase 8B)
    dashboard.rs        — 5 dashboard commands (Phase 8)
    documents.rs        — 9 document commands
    files.rs            — write_text_file helper
    license.rs          — 7 license commands (Phase 9A)
    mod.rs              — pub use re-exports
    non_conformities.rs — 10 NC commands
    reports.rs          — 6 report commands (Phase 8)
    risks.rs            — 11 risk commands (9 + 2 cross-module Phase 8B)
    settings_cmd.rs     — 2 settings commands
    storage.rs          — 2 storage commands
    users.rs            — 6 user commands
  db/
    init.rs             — migration runner
    mod.rs              — open_conn()
    sql/                — 006 migration SQL files (006 added Phase 8B)
  license/
    mod.rs              — LicenseState enum + pub mod declarations (Phase 9A)
    hardware.rs         — compute_hardware_fingerprint(), fingerprint_short()
    storage.rs          — read_license_token(), write_license_token(), reset_license_to_unlicensed()
    token.rs            — LicenseToken struct (15 fields)
    validation.rs       — validate_token(), verify_signature(), compute_dev_signature(), DEV_HMAC_KEY
  permissions.rs        — require_* helpers
  storage/mod.rs        — StoragePaths struct (includes license: PathBuf)
  lib.rs                — generate_handler![] with all 96 commands
```

### Frontend Side

```
src/
  pages/
    Audits.tsx            — full audit module
    Backup.tsx            — backup & restore (Phase 8, Admin-only create/restore)
    CAPA.tsx
    Complaints.tsx
    Dashboard.tsx         — real-data KPI dashboard (Phase 8)
    Documents.tsx
    NonConformities.tsx   — full NC module
    Reports.tsx           — 6-module report center (Phase 8)
    Risks.tsx
    Settings.tsx
    License.tsx         — Phase 9A: gate mode + settings mode
    Users.tsx
  services/
    auditService.ts
    backupService.ts      — Phase 8
    capaService.ts
    complaintService.ts
    dashboardService.ts   — Phase 8
    documentService.ts
    exportService.ts      — CSV/JSON export; exportReportCSV() added Phase 8
    nonConformityService.ts
    printService.ts       — HTML print; printReportTable() added Phase 8
    reportService.ts      — Phase 8
    licenseService.ts     — Phase 9A: 7 invoke wrappers
    riskService.ts
  types/
    audit.ts
    backup.ts             — Phase 8: BackupEntry, BackupStatus
    capa.ts
    complaint.ts
    dashboard.ts          — Phase 8: DashboardSummary, DashboardActivity, etc.
    document.ts
    license.ts            — Phase 9A: LicenseState, LicenseStatusResult, LicenseDetails
    nonConformity.ts
    reports.ts            — Phase 8: 6 row types + ReportFilters + ReportType
    risk.ts
  stores/
    authStore.ts          — BootstrapState: 'loading' | 'license-invalid' | 'first-admin' | 'ready'
    settingsStore.ts     — companyName (camelCase, not settings.company_name)
  components/ui/
    FilterBar.tsx        — prop: filters (not selects); hasActiveFilters (not hasActiveFilter)
    ModuleToolbar.tsx    — props: canEdit, onNew, onImport, exportOptions (no icon/title/subtitle)
    ...
```

---

## Phase 9C — Key Facts for Next Phase

- **MSI installer** at `C:\Users\roaas\.cargo\targets\qms-desktop\release\bundle\msi\QMS Desktop_1.0.0_x64_en-US.msi`
- **NSIS installer** at `C:\Users\roaas\.cargo\targets\qms-desktop\release\bundle\nsis\QMS Desktop_1.0.0_x64-setup.exe`
- **Release EXE** at `C:\Users\roaas\.cargo\targets\qms-desktop\release\qms-desktop.exe`
- **Build command**: `$env:RC = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\rc.exe"; $env:CARGO_TARGET_DIR = "C:\Users\roaas\.cargo\targets\qms-desktop"; npm.cmd run tauri build`
- **Windows AppControl workaround required before each release build** — see RUNBOOK.md "Release Build Workaround"
- **Cargo.toml** now has `[profile.release.build-override] opt-level=0` (helps with Application Control)
- **DEV controls**: hidden in production via `import.meta.env.DEV` in License.tsx; guarded in Rust via `cfg!(not(debug_assertions))`
- **dev_bypass tokens**: rejected in release builds via `if cfg!(not(debug_assertions)) { return LicenseState::Invalid; }` in `validate_token()`
- **Total Tauri commands**: 98
- **Installer installs to**: `C:\Program Files\QMS Desktop\` (requires admin elevation)
- **AppData preserved** during install/upgrade (MSI does not touch `%APPDATA%\QMSDesktop\`)

## Phase 9A — Key Facts for Phase 9B

- Total commands: **96** (89 post-phase-8B + 7 license commands)
- **Hardware fingerprint:** `SHA-256(COMPUTERNAME.lower() + ":" + MAC.lower())` — computed via `mac_address::get_mac_address()` (Windows: `GetAdaptersInfo`). Only 64-char hex stored; raw values never persisted or returned to frontend.
- **Fingerprint display:** `fingerprint_short()` returns first 16 chars + "..." — frontend never sees full 64-char digest.
- **LicenseToken fields:** `license_id`, `license_key_last4` (Option), `customer_name`, `plan`, `max_activations`, `hardware_fingerprint`, `issued_at`, `activated_at` (Option), `expires_at` (Option), `last_validated_at` (Option), `next_validation_due_at` (Option), `grace_until` (Option), `features` (Vec<String>), `signature`, `status`
- **Signature verification:** HMAC-SHA256 with `DEV_HMAC_KEY` constant (clearly documented placeholder). `verify_slice` from hmac crate for constant-time comparison. Phase 9B replaces this with RSA-2048 public key verification.
- **App gating:** `App.tsx` calls `getLicenseStatus()` after `initializeAppStorage()`. If `!status.is_valid`, calls `setLicenseInvalid()`. Router branch for `bootstrapState === 'license-invalid'` sends to `/license` before any other route.
- **DEV_HMAC_KEY** is embedded in `validation.rs` as a `const &[u8]` — not configurable. Phase 9B: replaced by embedded RSA public key.
- **No DB migration** — license.json path already existed in `StoragePaths.license` from Phase 4B.
- **License page gate mode** — shown full-screen before login when license invalid. Includes import textarea, hardware fingerprint, DEV controls, and transitions to first-admin or login after successful activation.

## Phase 8B — Key Facts for Phase 9B

- Total commands: **89** (85 post-phase-8 + 4 new cross-module commands)
- Migration 006: `related_nc_id` + `related_capa_id` added to both `risks` and `complaints`
- `validate_nc_source()` in `non_conformities.rs` now accepts `"RISK"` as a valid source
- `RISK_SQL` now selects 31 columns (indices 0–30); `COMPLAINT_SQL` selects 23 columns (indices 0–22)
- `RiskListItem` and `ComplaintListItem` both have 4 new fields: `related_nc_id`, `related_nc_number`, `related_capa_id`, `related_capa_number`
- All 4 cross-module commands require `require_admin_or_quality_manager`
- Duplicate prevention: commands return error if the FK column is already non-NULL
- Activity logs written to BOTH source record and created record

## Phase 8 — Key Facts for Phase 9

- Total commands: **85** (69 pre-phase-8 + 5 dashboard + 6 reports + 5 backup)
- `BackupStatus` shape: `{ backups_dir, database_path, database_size_bytes, uploads_size_bytes, available_backups: BackupEntry[] }`
- `BackupEntry` shape: `{ name, full_path, size_bytes, created_at }`
- Report SQL filter pattern: `(?1 IS NULL OR field = ?1)` for optional parameters
- Dashboard uses `date('now')` for overdue detection in SQL
- Backup timestamp computed without chrono: `SystemTime` + manual calendar math (see `backup.rs`)
- `open_backups_folder` calls `std::process::Command::new("explorer")` on Windows
- Restore copies `data.db` then returns a "restart required" message — does NOT auto-restart
- `printReportTable(title, headers, rows, companyName, filterDescription)` — generic print for all 6 report types
- `exportReportCSV(title, headers, rows)` — generic CSV export using existing `save()` dialog
- `BackupStatus.available_backups[0]` is the most recent backup (sorted by name desc in Rust)

---

## Key UI Pitfalls (from prior phases)

- `ModuleToolbar` has NO `icon`, `title`, or `subtitle` props — add page header separately
- `FilterBar` uses `filters` prop (array of `FilterSelectConfig`), NOT `selects`
- `FilterSelectConfig` has `{ placeholder, value, onChange, options }` — NO `id` or `label` key
- `FilterBar` uses `hasActiveFilters` (with trailing 's')
- `useSettingsStore()` returns `{ companyName, setCompanyName }` (camelCase)
- `ModuleToolbar` uses `exportOptions` array, NOT `onExport` callback
- `printService.ts` windows must use unique variable names (docWin, capaWin, riskWin, etc.)

---

## Migrations Applied (in order)

| Version | File | Description |
|---|---|---|
| 001 | `001_initial_schema.sql` | Full initial schema (all tables) |
| 002 | `002_phase3_auth.sql` | Settings defaults, passwords, roles |
| 003 | `003_phase4_documents.sql` | Document-related settings |
| 004 | `004_phase6_risks_complaints.sql` | 4 new columns for risks |
| 005 | `005_phase7_audits_nc.sql` | 7 new columns across audits/findings/NCs |
| 006 | `006_phase8b_cross_module_links.sql` | `related_nc_id` + `related_capa_id` on risks and complaints |

---

## Roles and Permissions

| Helper | Roles Allowed |
|---|---|
| `require_admin` | Admin |
| `require_admin_or_quality_manager` | Admin, QualityManager |
| `require_admin_qm_or_auditor` | Admin, QualityManager, Auditor |
| `require_authenticated` | All active users |

---

## Auto-Number Prefixes (from settings table)

| Module | Settings Key | Default |
|---|---|---|
| Documents | `document_prefix` | DOC |
| CAPAs | `capa_prefix` | CAPA |
| Risks | `risk_prefix` | RISK |
| Complaints | `complaint_prefix` | COMP |
| Audits | `audit_prefix` | AUDIT |
| Non-Conformities | `nc_prefix` | NC |

---

## Build Commands

```powershell
# TypeScript check + Vite build
npm.cmd run build

# Tauri dev (Rust + app)
$env:RC = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\rc.exe"
npm.cmd run tauri dev
```
