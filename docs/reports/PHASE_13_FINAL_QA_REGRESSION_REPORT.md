# Phase 13 — Final QA Regression and Release Candidate Validation

**Date:** 2026-06-16
**Phase:** 13
**Status:** Complete
**QA Method:** Code-level static verification of all source files + incremental build test
**Build:** TypeScript ✓ | Rust ✓ | MSI 3.51 MB | NSIS 2.13 MB

---

## 1. Executive Summary

QMS Desktop v1.0.0 has been subjected to a final regression QA pass covering all modules,
workflows, auth, permissions, backup/restore, reports, desktop menu, help dialogs, installer,
security controls, and error handling — following completion of Phases 11A through 12.

**Zero new bugs were found.**

All previously deferred items (BUG-03, BUG-04, BUG-05, L-02) remain open and unchanged
from prior phases. The one High finding (BUG-08/H-01 — RSA key pair verification) is a
pre-activation blocker already documented since Phase 12 and does not prevent building
or packaging the release.

**Release Readiness: Ready for Release Package**

The application is functionally complete, security-reviewed, and passes all code-level
regression checks. The release installer package can be created. BUG-08/H-01 must be
resolved before issuing the first customer license key.

---

## 2. Branch Created

`phase-13-final-qa-regression` (branched from `main`)

---

## 3. Environment Tested

| Item | Value |
|---|---|
| Platform | Windows 11 Pro 10.0.26200 |
| App version | QMS Desktop v1.0.0 |
| Tauri | 2.x |
| Rust edition | 2021 |
| TypeScript | strict, 0 errors |
| SQLite | rusqlite 0.32 bundled |
| QA method | Static code review of all key source files + fresh release build |
| Current branch | `phase-13-final-qa-regression` |
| Phase baseline | Phase 12 Security Hardening Review complete |

---

## 4. Part A — Build and Package Validation

### A1 — TypeScript / Vite Build

Command: `npm.cmd run build`

| Check | Result |
|---|---|
| TypeScript compilation | ✓ 0 errors |
| Vite bundle | ✓ 1647 modules, 2.60s |
| JS bundle | 524.12 kB (118.05 kB gzip) |
| CSS bundle | 38.36 kB (7.00 kB gzip) |
| Chunk size warning | ✓ Expected — single-file Tauri app pattern |

### A2 — Rust Cargo Check

Command: `cargo check --manifest-path src-tauri/Cargo.toml`

| Check | Result |
|---|---|
| Rust compilation | ✓ Finished dev profile, 1.97s, 0 errors, 0 warnings |

### A3 — Tauri Release Build

Command: `$env:RC = "..."; npm.cmd run tauri build`

| Check | Result |
|---|---|
| Rust release compilation | ✓ 1m 41s |
| AppControl workaround | Not required — pre-warmed from Phase 12 |
| MSI generated | ✓ 3.51 MB |
| NSIS generated | ✓ 2.13 MB |
| WiX EULA variable | ✓ `WixVariable Id="WixUILicenseRtf"` in `main.wxs` (confirmed Phase 11F) |
| NSIS LICENSE define | ✓ `!define LICENSE` in `installer.nsi` (confirmed Phase 11F) |

### A4 — Artifacts Copied

| Artifact | Path | Size |
|---|---|---|
| MSI | `D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase13-final-qa-test.msi` | 3.51 MB |
| NSIS | `D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase13-final-qa-test-setup.exe` | 2.13 MB |

**Part A Result: ✓ PASS — Clean build, all checks passed.**

---

## 5. Part B — Installer QA

### Code-Verified Checks

| Check | Verification | Result |
|---|---|---|
| MSI EULA: `licenseFile` in tauri.conf.json | `"licenseFile": "EULA.rtf"` at line 33 | ✓ |
| MSI EULA: `LicenseAgreementDlg` included | WiX template renders LicenseAgreementDlg when licenseFile non-empty | ✓ |
| NSIS EULA: `MUI_PAGE_LICENSE` included | NSIS template renders license page when licenseFile non-empty | ✓ |
| Copyright string | `"copyright": "© 2026 QMS Desktop. All rights reserved."` at line 32 | ✓ |
| EULA.rtf exists | `src-tauri/EULA.rtf` confirmed present (Phase 11F) | ✓ |
| App icon | Checkmark on navy — tauri.conf.json `icons/icon.ico` (Phase 11F) | ✓ |
| AppData preservation | No `<RemoveFolder>` targeting AppData in WiX template | ✓ |
| Reinstall preserves data | MSI upgrade code does not touch `%APPDATA%\QMSDesktop\` | ✓ |
| No auto-update | No `tauri-plugin-updater` in Cargo.toml | ✓ |
| Admin elevation required | Per-machine MSI install requires elevation | ✓ |

### Requires Manual Live Test

| Check | Notes |
|---|---|
| MSI EULA scroll + Accept | Requires running installer in test environment |
| NSIS EULA Decline exits | Requires running installer in test environment |
| Desktop shortcut icon | Requires installation |
| SmartScreen warning behavior | Expected (unsigned app); document message shown |
| Reinstall preserves data.db live | Confirmed Phase 9C smoke test; re-run advised before commercial release |

**Part B Result: ✓ PASS (code-verified) — Manual installer UI test required before commercial release.**

---

## 6. Part C — License QA

### Code-Verified Checks

| Check | Source | Result |
|---|---|---|
| License badge — 7 states configured | `Topbar.tsx` `LICENSE_BADGE_CONFIG` | ✓ |
| Badge hidden when state null | `if (!state) return null;` | ✓ |
| Badge reads from licenseStore | `useLicenseStore((s) => s.state)` | ✓ |
| licenseStore updated on startup | `App.tsx` line 105: `setLicenseStatus(...)` after `getLicenseStatus()` | ✓ |
| licenseStore updated after every action | `License.tsx` — setLicenseStatus after import, activate, validate, dev ops | ✓ |
| BUG-09 fixed — empty expires_at | `formatExpiry()` uses `||` not `??`; returns "Never" for null/undefined/"" | ✓ |
| Active card simplified | Advanced section for technical fields | ✓ |
| UpdateLicenseModal present | `License.tsx` line 67 and 715 | ✓ |
| Failed update: existing license intact | `UpdateLicenseModal` only calls setLicenseStatus on success | ✓ |
| DEV bypass blocked in release | `validation.rs`: `if cfg!(not(debug_assertions)) { return LicenseState::Invalid; }` | ✓ |
| DEV UI absent in production | `import.meta.env.DEV` dead-code eliminated at build time | ✓ |
| License server URL | `https://kumgncvwtkcbgdgqxmju.supabase.co/functions/v1` (production endpoint) | ✓ |
| Hardware fingerprint display | `fingerprint_short()` — 16-char only, never full 64-char to JS | ✓ |

### Requires Manual Live Test

| Check | Notes |
|---|---|
| Fresh app without license → License screen | Requires clean install |
| No internet activation → correct message | Requires network disconnect test |
| Valid license activation | Requires real license key + Supabase server running |
| Invalid license fails safely | Requires test with wrong key |
| App opens offline after activation | Requires network disconnect after activation |
| License Admin Portal activation count | Requires portal access |
| Validate Online works | Requires live connection |
| Expired vs perpetual display | Requires test token with past expires_at |

**Part C Result: ✓ PASS (code-verified) — Live license test required before commercial release.**

---

## 7. Part D — First Admin / Auth / Users QA

### Code-Verified Checks

| Check | Source | Result |
|---|---|---|
| First admin guard: requires 0 users | `auth.rs` line 73: `SELECT COUNT(*) FROM users` > 0 → error | ✓ |
| Username validation | `is_valid_username()`: alpha start, alphanumeric+_, max 64 | ✓ |
| Username normalized to lowercase | `username.trim().to_lowercase()` in create_first_admin and login | ✓ |
| Login uses username field | `auth.rs` `login()` queries `WHERE username = ?1` | ✓ |
| Wrong credentials: safe error | "Invalid username or password" (same for nonexistent and wrong password) | ✓ |
| Inactive account: safe error | "This account is inactive. Contact your administrator." | ✓ |
| password_hash never returned | `AuthUser` struct has no `password_hash` field | ✓ |
| Email optional | `email: Option<String>` with empty string fallback | ✓ |
| Username immutable after creation | `update_user()` does not include `username` in SET clause | ✓ |
| Profile dropdown present | `Topbar.tsx` — clickable button with dropdown | ✓ |
| Profile modal: username read-only | `readOnly` attribute on username field in `ProfileModal` | ✓ |
| Change password: requires current | `change_own_password` verifies current password with Argon2 | ✓ |
| Password hash Argon2id | `argon2 = "0.5"` crate, default params (m=19456, t=2, p=1) | ✓ |
| Logout clears session | `authStore.logout()` sets `isAuthenticated: false, user: null` | ✓ |
| Logout button in dropdown | `Topbar.tsx` line 154 + Sidebar footer | ✓ |
| Duplicate username blocked | SQLite `UNIQUE` constraint on `username` column | ✓ |

**Part D Result: ✓ PASS — All auth/users behaviors code-verified.**

---

## 8. Part E — Module QA

### Code-Verification Summary

All 7 QMS modules were thoroughly verified in Phase 10 QA and no module source code was
changed in Phases 11A–12 beyond:
- `backup.rs` (Phase 11D) — backup/restore enhancements
- `auth.rs`, `users.rs`, `profile.rs` (Phase 11A) — username changes

All module commands, service layers, and page components remain functionally identical
to the Phase 10 QA baseline.

| Module | Commands | Source unchanged? | Phase 10 Result |
|---|---|---|---|
| Documents | 9 | ✓ | ✓ PASS |
| CAPA | 9 | ✓ | ✓ PASS |
| Risks | 9+2 cross-module | ✓ | ✓ PASS |
| Complaints | 9+2 cross-module | ✓ | ✓ PASS |
| Audits | 13 | ✓ | ✓ PASS |
| Non-Conformities | 10 | ✓ | ✓ PASS |
| Settings | 2 | ✓ | ✓ PASS |

### Outstanding Module UX Notes (not blocking)

| Observation | Severity | Deferred? |
|---|---|---|
| CAPA table has no visual OVERDUE badge (data field exists, no UI indicator) | Low | Yes |
| Settings: no unsaved-changes indicator | Low | Yes |
| Long table text truncates without tooltip | Low | Yes |
| Dashboard KPI tiles navigate to module root, not pre-filtered view | Low | Yes |

**Part E Result: ✓ PASS — All modules code-verified against Phase 10 baseline.**

---

## 9. Part F — Workflow QA

### Code-Verified Checks

| Workflow | Command | Permission | Duplicate Prevention | Result |
|---|---|---|---|---|
| Risk → NC | `create_nc_from_risk` | require_admin_or_qm | `related_nc_id IS NOT NULL` check | ✓ |
| Risk → CAPA | `create_capa_from_risk` | require_admin_or_qm | `related_capa_id IS NOT NULL` check | ✓ |
| Complaint → NC | `create_nc_from_complaint` | require_admin_or_qm | `related_nc_id IS NOT NULL` check | ✓ |
| Complaint → CAPA | `create_capa_from_complaint` | require_admin_or_qm | `related_capa_id IS NOT NULL` check | ✓ |
| Audit Finding → NC | `create_nc_from_audit_finding` | require_admin_qm_or_auditor | `is_non_conformity = 1` check | ✓ |
| NC → CAPA | `create_capa_from_non_conformity` | require_admin_or_qm | `related_capa_id IS NOT NULL` check | ✓ |

Activity logs written to both source and target records in all cross-module commands. ✓

**Part F Result: ✓ PASS — All workflows code-verified.**

---

## 10. Part G — Dashboard QA

All 7 KPI queries verified in Phase 10 via code review. Dashboard source code unchanged since Phase 8:

| KPI | SQL | Result |
|---|---|---|
| Open CAPAs | `COUNT(*) WHERE status='OPEN'` | ✓ |
| Overdue CAPAs | `COUNT(*) WHERE status='OPEN' AND target_date < date('now')` | ✓ |
| High/Critical Risks | `COUNT(*) WHERE risk_level IN ('HIGH','CRITICAL')` | ✓ |
| Open Complaints | `COUNT(*) WHERE status='OPEN'` | ✓ |
| Open NCs | `COUNT(*) WHERE status IN ('OPEN','IN_REVIEW')` | ✓ |
| Completed Audits | `COUNT(*) WHERE status='CLOSED'` | ✓ |
| Obsolete Documents | `COUNT(*) WHERE status='OBSOLETE'` | ✓ |
| Recent Activity | `activity_log ORDER BY performed_at DESC LIMIT 20` | ✓ |
| Overdue CAPA detail | `get_dashboard_overdue_capas` — top 8 | ✓ |
| High Risk detail | `get_dashboard_high_risks` — top 8 | ✓ |
| Open NC detail | `get_dashboard_open_ncs` — top 8 | ✓ |

**Part G Result: ✓ PASS — Dashboard code-verified.**

---

## 11. Part H — Reports QA

### Code-Verified Checks

| Check | Source | Result |
|---|---|---|
| "Generate Report" button label | `Reports.tsx` — phase 11C | ✓ |
| Empty state: `FileX` icon + "No records found" | `Reports.tsx` empty state UI | ✓ |
| Print disabled when 0 rows | `disabled={!hasData}` on Print button | ✓ |
| Print guard alert when 0 rows | `if (data.length === 0) { alert(...); return; }` | ✓ |
| Export disabled when 0 rows | `disabled={!hasData}` on Export button | ✓ |
| Export guard alert when 0 rows | Guard in `handleExportCSV` | ✓ |
| Date range validation | `dateFrom > dateTo` → inline error, no fetch | ✓ |
| CSV filenames per report | `fileSlug` constant per report definition | ✓ |
| Role visibility | `availableReports = REPORTS.filter(r => r.allowedRoles.includes(role))` line 206 | ✓ |

### Role Matrix (Code-Verified)

| Report | Admin | QM | Auditor | Employee | Viewer |
|---|---|---|---|---|---|
| Document Register | ✓ | ✓ | ✓ | ✓ | ✓ |
| CAPA Report | ✓ | ✓ | ✓ | ✗ | ✗ |
| Risk Report | ✓ | ✓ | ✓ | ✗ | ✗ |
| Complaint Report | ✓ | ✓ | ✗ | ✗ | ✗ |
| Audit Report | ✓ | ✓ | ✓ | ✗ | ✗ |
| NC Report | ✓ | ✓ | ✓ | ✗ | ✗ |

**Part H Result: ✓ PASS — All report behaviors code-verified.**

---

## 12. Part I — Backup / Restore QA

### Code-Verified Checks

| Check | Source | Result |
|---|---|---|
| Create Backup: Admin-only | `backup.rs` `create_local_backup` → `require_admin` | ✓ |
| Restore: Admin-only | `backup.rs` `restore_local_backup` → `require_admin` | ✓ |
| Open Folder: Admin-only | `backup.rs` `open_backups_folder` → `require_admin` | ✓ |
| Import Backup: Admin-only | `backup.rs` `validate_import_backup` → `require_admin` | ✓ |
| Get Backup Status: authenticated | `backup.rs` `get_backup_status` → `require_authenticated` | ✓ |
| Safety backup before restore | Step 1 in `restore_local_backup` — creates QMS-SafetyBackup-{ts} | ✓ |
| Safety backup abort if fails | `map_err` + "Restore aborted" on every safety step | ✓ |
| License preserved by default | `if !preserve_license { ... copy license.json ... }` | ✓ |
| License restoration opt-in only | `preserve_license: bool` param required | ✓ |
| Import path: not inside AppData | `canonical_src.starts_with(&canonical_root)` check | ✓ |
| Import: must contain data.db | `path.join("data.db").exists()` check | ✓ |
| Backup folder: Explorer open | `std::process::Command::new("explorer").arg(...)` | ✓ |
| Backup list: QMS-Backup-* only | `if !name.starts_with("QMS-Backup-") { continue; }` | ✓ |
| Restart Required banner | `Backup.tsx` shows banner after successful restore | ✓ |
| Non-admin UI: buttons hidden | `Backup.tsx` — action buttons hidden (not just disabled) for non-Admin | ✓ |
| File menu backup items | Start disabled; enabled via `auth-changed` listener | ✓ |
| File → Restore Backup… | Menu item navigates to `/backup` | ✓ |

**Part I Result: ✓ PASS — All backup/restore behaviors code-verified.**

---

## 13. Part J — Permissions QA

### Backend Permission Matrix (Code-Verified)

| Action | Permission | Source |
|---|---|---|
| list/get all module records | `require_authenticated` | All module commands |
| create/update CAPA/Risk/Complaint/NC/Document/Audit | `require_admin_or_quality_manager` | All module commands |
| create/update audit findings | `require_admin_qm_or_auditor` | `audits.rs` |
| create NC from audit finding | `require_admin_qm_or_auditor` | `audits.rs` |
| cross-module create NC/CAPA from risk/complaint | `require_admin_or_quality_manager` | `risks.rs`, `complaints.rs` |
| Reports — Document Register | `require_authenticated` | `reports.rs` |
| Reports — CAPA/Risk/Audit/NC | `require_admin_qm_or_auditor` | `reports.rs` |
| Reports — Complaints | `require_admin_or_quality_manager` | `reports.rs` |
| Backup create/restore/folder | `require_admin` | `backup.rs` |
| Users list/create/update/reset | `require_admin` | `users.rs` |
| Settings update | `require_admin_or_quality_manager` | `settings_cmd.rs` |
| Settings read | No auth check (non-sensitive keys only) | `settings_cmd.rs` |

### Permission Helper Verification (Code-Verified)

Every permission helper in `permissions.rs` queries:
```sql
SELECT role, is_active FROM users WHERE id = ?1
```
- Returns `Err("Unauthorized: caller user not found")` if user not in DB
- Returns `Err("Unauthorized: caller account is inactive")` if `is_active = 0`
- Returns `Err("Unauthorized: X role required")` if role not in allowed list
- Returns `Ok(())` only if role is in allowed list AND is_active = 1

### Frontend Sidebar Role Filtering (Code-Verified)

`Sidebar.tsx` filters `navGroups` by `item.roles.includes(role)` — only shows permitted items.

| Item | Admin | QM | Auditor | Employee | Viewer |
|---|---|---|---|---|---|
| Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ |
| CAPA | ✓ | ✓ | ✗ | ✓ | ✗ |
| Risks | ✓ | ✓ | ✗ | ✓ | ✗ |
| Complaints | ✓ | ✓ | ✗ | ✓ | ✗ |
| Audits | ✓ | ✓ | ✓ | ✗ | ✗ |
| Non-Conformities | ✓ | ✓ | ✓ | ✗ | ✗ |
| Documents | ✓ | ✓ | ✓ | ✓ | ✓ |
| Users | ✓ | ✗ | ✗ | ✗ | ✗ |
| Reports | ✓ | ✓ | ✓ | ✗ | ✓ |
| Backup | ✓ | ✗ | ✗ | ✗ | ✗ |

Settings and License: removed from sidebar, accessible via Tools menu only.

### Outstanding Permission UX Note

**L-02 (carried from Phase 12):** No frontend `ProtectedRoute` wrappers on `/users`, `/backup`,
`/settings`. An authenticated non-Admin user who types these URLs directly reaches the page shell.
All write operations are rejected by the Rust backend with an authorization error. This is a UX
issue only — Rust backend enforces correctly.

**Part J Result: ✓ PASS — Backend permission enforcement complete and correct.**

---

## 14. Part K — Desktop Menu / Help / Fullscreen QA

### Code-Verified Checks

| Check | Source | Result |
|---|---|---|
| File menu: backup items start disabled | `lib.rs` line 121-123: `enabled: false` | ✓ |
| File menu: backup items enabled after login | `auth-changed` listener in `lib.rs` line 194 | ✓ |
| File menu: backup items disabled after logout | Same listener: `set_enabled(authenticated)` | ✓ |
| Tools → Settings: starts disabled | `lib.rs` line 155: `enabled: false` | ✓ |
| Tools → Settings: enabled after login | `auth-changed` listener toggles `"navigate-settings"` | ✓ |
| Tools → License: always enabled | `lib.rs` line 156: `enabled: true` | ✓ |
| View → Toggle Sidebar | `App.tsx` MenuListener → `toggleSidebar()` from `useUiStore` | ✓ |
| View → Toggle Full Screen | `lib.rs` line 212: `w.set_fullscreen(!is_fs)` | ✓ |
| F11 shortcut | `MenuItem::with_id("toggle-fullscreen", ..., Some("F11"))` | ✓ |
| Ctrl+R shortcut | `MenuItem::with_id("reload", ..., Some("Ctrl+R"))` | ✓ |
| Reload: `location.reload()` | `lib.rs` line 219: `w.eval("location.reload()")` | ✓ |
| Zoom In/Out/Reset | `App.tsx` MenuListener handles zoom-in, zoom-out, zoom-reset | ✓ |
| Help → About | `App.tsx` MenuListener → `openDialog('about')` → `AboutDialog` | ✓ |
| Help → Help | `openDialog('help')` → `HelpDialog` | ✓ |
| Help → Support | `openDialog('support')` → `SupportDialog` | ✓ |
| Help → Tell a Friend | `openDialog('tell-a-friend')` → `TellAFriendDialog` | ✓ |
| Help → Check for Updates | `openDialog('check-for-updates')` → `CheckForUpdatesDialog` | ✓ |
| All 5 dialogs rendered globally | `App.tsx` lines 136-140 — outside HashRouter | ✓ |
| No secrets in dialogs | `SupportDialog` verified Phase 12 — version, state_label, customer_name, plan only | ✓ |
| About dialog: no hardware IDs | `get_license_details` returns `hardware_fingerprint_short` (16-char) only | ✓ |
| CheckForUpdates: manual only | "Automatic updates are not configured"; no download/execute | ✓ |
| Sidebar persistence | `localStorage` key `qms-sidebar-collapsed`; initialized on mount | ✓ |

**Part K Result: ✓ PASS — All menu/help/fullscreen behaviors code-verified.**

---

## 15. Part L — Error Handling / Safety QA

### Code-Verified Checks

| Scenario | Error Message | Secrets? | Result |
|---|---|---|---|
| Wrong password at login | "Invalid username or password" | ✗ | ✓ |
| Nonexistent username | "Invalid username or password" (same) | ✗ | ✓ |
| Inactive account | "This account is inactive. Contact your administrator." | ✗ | ✓ |
| Invalid license key | Server error forwarded; fallback "Unable to activate license." | ✗ | ✓ |
| No internet activation | "Cannot reach the license server. Check your internet connection." | ✗ | ✓ |
| Missing required fields | Field-specific Rust validation message | ✗ | ✓ |
| Invalid backup: no data.db | "does not contain data.db. This may not be a valid QMS backup." | ✗ | ✓ |
| Invalid backup: inside AppData | "inside the QMSDesktop data directory. Use the Restore button..." | ✗ | ✓ |
| Safety backup fails | "Safety backup failed (database/settings/license/uploads): ... Restore aborted." | ✗ | ✓ |
| File extension not allowed | ".xyz is not allowed. Allowed: PDF, DOC..." | ✗ | ✓ |
| Duplicate cross-module | "A CAPA already exists for this record" | ✗ | ✓ |
| Invalid date range | "'Created From' must be before 'Created To'." | ✗ | ✓ |
| Empty report export | Alert: "No data to export. Adjust filters or create records first." | ✗ | ✓ |
| Empty report print | Alert: "No data to print. Adjust filters or create records first." | ✗ | ✓ |
| Permission denied | "Unauthorized: [role] required" | ✗ | ✓ |
| Storage path error | All commands return `Result<_, String>` — no stack trace | ✗ | ✓ |
| Raw SQL errors | All Rust commands map errors to `format!("{}", e)` — no SQL text | ✗ | ✓ |
| Raw hardware IDs | `fingerprint_short()` returns 16-char display form only | ✗ | ✓ |
| Support info clipboard | version, state_label, customer_name, plan, support email only | ✗ | ✓ |

**Part L Result: ✓ PASS — No error leakage of secrets, SQL, stack traces, or hardware IDs.**

---

## 16. Part M — Security Regression Checks

| Check | Status | Notes |
|---|---|---|
| H-01 / BUG-08: RSA key pair verification | ⚠️ **OPEN** | Must verify `rsa_public_key.rs` public key matches Supabase `LICENSE_PRIVATE_KEY_PEM` before first customer activation. RUNBOOK.md documents verification steps. |
| No secrets committed to git | ✓ Confirmed | git history scan: 0 .pem/.key/.env files ever committed |
| No private RSA key in desktop binary | ✓ Confirmed | `rsa_public_key.rs` contains ONLY the SPKI public key PEM |
| No Supabase service_role in desktop | ✓ Confirmed | Only `LICENSE_SERVER_BASE_URL` (public endpoint) in desktop |
| DEV bypass blocked in release | ✓ Confirmed | `cfg!(not(debug_assertions))` compile-time guard in `validation.rs` |
| DEV commands blocked in release | ✓ Confirmed | Both `clear_local_license_dev_only` and `create_dev_license_for_current_machine` return error in release |
| DEV UI absent in production bundle | ✓ Confirmed | `import.meta.env.DEV` dead-code eliminated |
| Admin Edge Functions: --no-verify-jwt | ⚠️ M-03 | Deferred improvement: redeploy without flag for defense-in-depth |
| AppData preservation confirmed | ✓ Confirmed | No RemoveFolder targeting AppData in WiX; uninstall leaves data intact |
| Manual update only | ✓ Confirmed | `CheckForUpdatesDialog` shows version + manual instructions; no download/execute |
| M-02 / BUG-03: tauri-plugin-sql initialized | ⚠️ OPEN | `lib.rs` line 181 still loads plugin; no DB permissions configured so no exploitable capability |
| All SQL parameterized | ✓ Confirmed | `params![]` macros throughout; zero string concatenation in SQL |
| File extension allowlist | ✓ Confirmed | Rust backend validates before copy |
| Password hash never returned | ✓ Confirmed | `AuthUser` struct has no `password_hash` field |
| CSP configured | ✓ Confirmed | `script-src 'self'` only; no remote script allowed |
| CORS wildcard | ⚠️ L-01 | `"Access-Control-Allow-Origin": "*"` on admin Edge Functions; JWT still required |

**Part M Result: ✓ PASS — All Phase 12 security controls confirmed active. No regression.**

---

## 17. Bugs Found Table

### New Bugs Found in Phase 13

**None.**

Zero new bugs were discovered during Phase 13 code-level regression testing.

### Known Issues Carried Forward

| ID | Severity | Area | Description | Expected | Actual | Recommended Fix | Fix Before Release? |
|---|---|---|---|---|---|---|---|
| BUG-03 / M-02 | Medium | Build/Deps | `tauri-plugin-sql` in Cargo.toml AND initialized in `lib.rs` line 181 | Unused dependency removed | Plugin loaded (no DB permissions configured — no exploitable capability) | Remove from Cargo.toml + lib.rs | No — deferred |
| BUG-04 | Medium | Documentation | `DATABASE_SCHEMA.md` has stale column names (mitigation vs mitigation_plan, etc.) | Docs match schema | Docs outdated | Rewrite DATABASE_SCHEMA.md from actual migrations | No — deferred |
| BUG-05 | Medium | UX/Routing | `App.tsx` bootstrap `.catch()` routes to login on storage init failure | Friendly error screen | Routes to login (all commands then fail → confusing blank state) | Separate catch for `initializeAppStorage()` with error screen | No — deferred |
| BUG-08 / H-01 | High | License/Security | RSA public key in `rsa_public_key.rs` must be verified against Supabase private key | Public key matches private key used to sign tokens | Unverified — conflict between Phase 9C report ("dev key") and comment ("PRODUCTION key") | Run `openssl rsa -in license_private_key.pem -pubout` and compare to `rsa_public_key.rs` content. Rebuild if different. | **Yes — before first commercial activation** |
| L-02 | Low | UX/Permissions | No frontend `ProtectedRoute` on `/users`, `/backup`, `/settings` | Access Denied page for non-authorized roles | Page shell renders; Rust backend rejects writes with auth error | Add ProtectedRoute wrappers | No — deferred |

---

## 18. Release Readiness

**Status: Ready for Release Package**

| Criterion | Status |
|---|---|
| Zero new bugs in Phase 13 | ✓ |
| Zero critical bugs overall | ✓ |
| Zero high-severity functional bugs | ✓ (BUG-08 is pre-activation, not pre-release) |
| All modules functional | ✓ |
| Auth/permissions correct | ✓ |
| Backup/restore correct | ✓ |
| Reports correct | ✓ |
| Desktop menu/help/fullscreen correct | ✓ |
| EULA in installer | ✓ |
| AppData preservation | ✓ |
| No secrets in binary | ✓ |
| DEV bypass disabled in release | ✓ |
| TypeScript build clean | ✓ |
| Rust build clean | ✓ |
| Release installer builds | ✓ |
| Security audit complete (Phase 12) | ✓ |
| Code signing | ✗ Not yet — expected for pre-commercial release |
| RSA key pair verified (BUG-08) | ✗ Must resolve before first customer activation |

**Conclusion:** The application is ready for release packaging. The final release installer
can be created and tested. The only remaining pre-commercial-release blocker is BUG-08/H-01
(RSA key pair verification) — which must be resolved before issuing the first customer license
key, not before creating the installer package.

---

## 19. Build Artifacts

| Artifact | Path | Size |
|---|---|---|
| MSI (Phase 13 QA test) | `D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase13-final-qa-test.msi` | 3.51 MB |
| NSIS (Phase 13 QA test) | `D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase13-final-qa-test-setup.exe` | 2.13 MB |
| MSI (release) | `C:\Users\roaas\.cargo\targets\qms-desktop\release\bundle\msi\QMS Desktop_1.0.0_x64_en-US.msi` | 3.51 MB |
| NSIS (release) | `C:\Users\roaas\.cargo\targets\qms-desktop\release\bundle\nsis\QMS Desktop_1.0.0_x64-setup.exe` | 2.13 MB |

---

## 20. Confirmations

- [x] No secrets were printed or exposed in this QA session or report
- [x] No AppData was deleted or modified
- [x] No QMS business data was uploaded
- [x] No Supabase licensing functions were changed
- [x] No Supabase secrets were changed
- [x] No new features were added
- [x] No UI was redesigned or changed
- [x] No database schema was changed
- [x] No git commit created
- [x] No git add . used
- [x] No push to GitHub
- [x] Phase 14 not started

---

*End of Phase 13 Final QA Regression Report*
*QMS Desktop v1.0.0 — 2026-06-16*
