# Current Phase

| Field | Value |
|---|---|
| Phase | **Phase 11D — Backup, Restore, Import, and Data Transfer Flow** |
| Status | **Completed** |
| Date | 2026-06-16 |
| Next Phase | Phase 11E — TBD |

## What Was Delivered (Phase 11D)

- **Backup page rewritten** — Create Backup, Import Backup File, Open Backup Folder, Backup History with Restore per entry
- **Safety backup before restore** — automatic safety backup created before every restore; abort if it fails
- **License preservation** — `preserve_license = true` by default; checkbox in modal to optionally restore license.json
- **Import Backup File** — Admin can browse OS folder picker to any external backup folder; validated before showing confirm modal
- **Restore confirmation modal** — serious warnings, bullet consequences, license checkbox, type RESTORE to enable
- **Restart Required banner** — shown after successful restore until app is closed
- **File menu: Restore Backup…** — added to File menu, enabled only after login
- **Permissions** — all actions Admin-only in Rust backend; non-Admin sees amber notice, no action buttons
- **`validate_import_backup` command** — new Tauri command (Admin-only) validates external backup folder
- **Build** — TypeScript ✓ (1641 modules, 2.60s), Rust cargo check ✓ (5.06s), Rust release ✓ (1 pass), MSI 3.51 MB, NSIS 2.12 MB

## Build Artifact Paths

| Artifact | Path | Size |
|---|---|---|
| MSI (test) | `D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase11d-backup-restore-test.msi` | 3.51 MB |
| NSIS (test) | `D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase11d-backup-restore-test-setup.exe` | 2.12 MB |

## What Was Delivered (Phase 11C)

- **"Generate Report" label** — Button renamed from "Run Report" across all 6 report types
- **Empty state guard** — Print and Export buttons disabled when report has 0 rows; clicking shows friendly alert; print dialog never opens; no empty CSV created
- **Professional empty state** — `FileX` icon + "No records found" / "Adjust filters or create records first" (not an error state)
- **Date range validation** — If "Created From" > "Created To", inline error shown and fetch blocked
- **Print fixed (DOM injection)** — `printReportTable` rewritten to inject into current document + `window.print()`; works reliably in Tauri WebView2; app chrome hidden via `@media print`; supports Save as PDF
- **CSV filenames** — Explicit per-report slugs: `document-register-report-YYYY-MM-DD.csv`, `capa-report-YYYY-MM-DD.csv`, etc.
- **BUG-06 confirmed resolved** — Role filtering already correctly implemented in `Reports.tsx`
- **Build** — TypeScript ✓ (1641 modules, 2.43s), Rust cargo check ✓, Rust release ✓, MSI 3.51 MB, NSIS 2.12 MB

## Build Artifact Paths

| Artifact | Path | Size |
|---|---|---|
| MSI (test) | `D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase11c-reports-test.msi` | 3.51 MB |
| NSIS (test) | `D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase11c-reports-test-setup.exe` | 2.12 MB |

## What Was Delivered (Phase 11B)

- **licenseStore.ts** — Shared Zustand store for license state; read by Topbar, written by App.tsx (startup) and License.tsx (all actions)
- **Topbar license badge** — Colored pill badge (green/amber/red) reflecting actual license state; replaces hardcoded "License Pending" text
- **Topbar breadcrumb** — "QMS Desktop" root is now a `<Link to="/dashboard">` — clickable, navigates to Dashboard
- **Sidebar collapsible** — Toggle button collapses sidebar to 56px icon-only mode; state persisted to `localStorage`; smooth `transition-[width]` animation
- **Sidebar — Settings/License removed** — Both items removed from sidebar nav; still accessible via `Tools` menu in native menu bar
- **License page simplified** — Active card shows Status, Customer, Plan, Expires; technical fields moved to collapsible Advanced section
- **BUG-09 fixed** — `formatExpiry()` helper returns "Never" for null, undefined, or empty string `expires_at`
- **Update License Key modal** — New button on active license card opens modal to replace/upgrade license key; failure keeps current license intact
- **Build** — TypeScript ✓ (1641 modules, 2.51s), Rust cargo check ✓ (1.42s), Rust release ✓ (2m 10s), MSI 3.59 MB, NSIS 2.11 MB

## Build Artifact Paths

| Artifact | Path | Size |
|---|---|---|
| MSI (test) | `D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase11b-license-sidebar-test.msi` | 3.59 MB |
| NSIS (test) | `D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase11b-license-sidebar-test-setup.exe` | 2.11 MB |
| MSI (release) | `C:\Users\roaas\.cargo\targets\qms-desktop\release\bundle\msi\QMS Desktop_1.0.0_x64_en-US.msi` | 3.59 MB |
| NSIS (release) | `C:\Users\roaas\.cargo\targets\qms-desktop\release\bundle\nsis\QMS Desktop_1.0.0_x64-setup.exe` | 2.11 MB |

## What Was Delivered (Phase 11A)

- **Username-based login** — Login screen now uses "Username" field; `login` Tauri command accepts `username` param; error messages updated accordingly
- **Database migration 007** — Backfills existing users: extracts local part (before `@`) from any `username` that contains `@`, sanitizes to alphanumeric + underscore, deduplicates with `_2`, `_3`, … suffix; Rust init code handles uniqueness
- **First Admin Setup** — Added `username` field (required); email is now optional; username used for all subsequent logins
- **Username rules enforced** — Must start with a letter; only letters, digits, underscores; max 64 chars; unique; immutable after creation
- **Users page updated** — Create form includes required username field; Edit form shows username as read-only; Users table shows @username column; email optional in both create and edit
- **`update_user` no longer changes username** — username is fixed after creation; only name, email, role, department are editable by Admin
- **Profile menu in Topbar** — Clicking user name/avatar opens dropdown with: user info header (@username, role), Edit Profile, Change Password, Log Out
- **Edit Profile** — User can edit own Full Name, Department, Email; username shown as read-only; success updates auth store immediately (name in topbar refreshes)
- **Change Password** — Requires current password verification; Argon2id; min 8 chars + uppercase + digit; confirm new password required
- **Logout** — Available from profile dropdown; returns to Login screen; license remains valid
- **Backup menu context** — `File → Create Backup` and `File → Open Backup Folder` start disabled; enabled when user logs in via `auth-changed` event; disabled again on logout
- **`update_own_profile` command** — New Tauri command returns updated `AuthUser`; frontend updates auth store in place
- **`change_own_password` command** — New Tauri command; requires current password; Argon2id; no hash exposed
- **Build** — TypeScript ✓ (1640 modules, 2.16s), Rust cargo check ✓ (2.62s), Rust release ✓ (1m 44s), MSI 3.51 MB, NSIS 2.12 MB

## Build Artifact Paths

| Artifact | Path | Size |
|---|---|---|
| MSI (test) | `D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase11a-auth-users-test.msi` | 3.51 MB |
| NSIS (test) | `D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase11a-auth-users-test-setup.exe` | 2.12 MB |
| MSI (release) | `C:\Users\roaas\.cargo\targets\qms-desktop\release\bundle\msi\QMS Desktop_1.0.0_x64_en-US.msi` | 3.51 MB |
| NSIS (release) | `C:\Users\roaas\.cargo\targets\qms-desktop\release\bundle\nsis\QMS Desktop_1.0.0_x64-setup.exe` | 2.12 MB |

## What Was Delivered (Phase 10B)

- **RSA private key parsing hardened** — `supabase/functions/_shared/rsa.ts`: normalizes literal `\n`, detects PKCS#1, validates DER byte length > 0, safe diagnostic logs
- **Supabase functions deployed** — `activate-license`, `validate-license`, `admin-generate-license` redeployed
- **License key format** — digits 2–9 included; charset `ABCDEFGHJKMNPQRSTUVWXYZ23456789`
- **Native menu bar** — File / View / Tools / Help; fullscreen; zoom; keyboard shortcuts
- **App icon** — navy #1E3A5F, white Q; all Tauri icon sizes

## Modules Implemented (Phases 1–11A)

| Module | Phase | Commands | Status |
|---|---|---|---|
| Foundation / DB | 1–2 | — | ✓ Done |
| Auth / Users / Settings | 3 | 8 | ✓ Done |
| Documents | 4 | 9 | ✓ Done |
| CAPA | 5 | 9 | ✓ Done |
| Risks | 6 | 9+2 | ✓ Done |
| Complaints | 6 | 9+2 | ✓ Done |
| Audits | 7 | 13 | ✓ Done |
| Non-Conformities | 7 | 10 | ✓ Done |
| Dashboard | 8 | 5 | ✓ Done |
| Reports | 8 | 6 | ✓ Done |
| Backup | 8 | 5 | ✓ Done |
| Cross-Module Links | 8B | 4 | ✓ Done |
| License Engine | 9A | 7 | ✓ Done |
| Online Activation | 9B | 2 | ✓ Done |
| Installer / Packaging | 9C | 0 | ✓ Done |
| License RSA Fix + Menu + Icon | 10B | 0 | ✓ Done |
| Auth/Users/Profile Cleanup | 11A | +2 | ✓ Done |
| License/Sidebar/Nav Shell | 11B | 0 | ✓ Done |
| Reports/Print/Export Fixes | 11C | 0 | ✓ Done |
| Backup/Restore/Import Flow | 11D | +1 | ✓ Done |
