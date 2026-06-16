# Current Phase

| Field | Value |
|---|---|
| Phase | **Phase 14 — Final Release Package and Delivery Preparation** |
| Status | **Completed** |
| Date | 2026-06-16 |
| Next Phase | — (v1.0.0 release complete) |

## What Was Delivered (Phase 14)

- **H-01 RESOLVED** — RSA key pair verification: Node.js confirmed MATCH — private key matches embedded public key in `rsa_public_key.rs`. Ready for customer license issuance.
- **Final build** — TypeScript ✓ (1647 modules, 2.64s), Rust ✓ (1.77s), Tauri release ✓ (1m 42s)
- **Release folder** — `D:\QMS-Desktop\release\QMS-Desktop-v1.0.0\` with final MSI (3.51 MB) and NSIS (2.13 MB)
- **SHA256 checksums** — `CHECKSUMS-SHA256.txt` in release folder
- **6 release documentation files** — Release Notes, Installation Guide, License Activation Guide, Backup/Restore Guide, Admin Quick Start, Security and Data Notes
- **Final Release Checklist** — `FINAL_RELEASE_CHECKLIST.md`
- **Phase 14 report** — `docs/reports/PHASE_14_FINAL_RELEASE_PACKAGE_REPORT.md`
- **Release status** — Ready for internal delivery; manual tests recommended before customer delivery

## Build Artifact Paths

| Artifact | Path | Size |
|---|---|---|
| MSI (final release) | `D:\QMS-Desktop\release\QMS-Desktop-v1.0.0\QMS-Desktop-v1.0.0-x64.msi` | 3.51 MB |
| NSIS (final release) | `D:\QMS-Desktop\release\QMS-Desktop-v1.0.0\QMS-Desktop-v1.0.0-x64-setup.exe` | 2.13 MB |

## SHA256 Checksums

```
C4E7C66BBC296D4D8809B2E5C6844E766B2BECB5233E396401A5A3017DE47D3A  QMS-Desktop-v1.0.0-x64.msi
8273D2E3824E44C7A725C8FF87025AB95EA367D15349A053C2A214E8B31B2815  QMS-Desktop-v1.0.0-x64-setup.exe
```

---

## What Was Delivered (Phase 13)

- **Full regression QA** — Code-level static verification of all source files: auth, permissions, backup, restore, reports, sidebar, license badge, menu, help dialogs, security controls, error handling
- **Zero new bugs found** — No functional regressions introduced across Phases 11A–12
- **Build verified** — TypeScript ✓ (1647 modules, 2.60s), Rust ✓ (1.97s), Tauri release ✓ (1m 41s)
- **All Phase 11 features verified** — Username login, collapsible sidebar, license badge, reports empty state, backup safety restore, import backup, all 5 help dialogs, EULA in installer
- **Security regression confirmed** — All Phase 12 controls still active; no regression
- **Release readiness** — Ready for Release Package; BUG-08/H-01 must be resolved before first customer activation
- **Build** — MSI 3.51 MB, NSIS 2.13 MB

## Build Artifact Paths

| Artifact | Path | Size |
|---|---|---|
| MSI (Phase 13 QA test) | `D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase13-final-qa-test.msi` | 3.51 MB |
| NSIS (Phase 13 QA test) | `D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase13-final-qa-test-setup.exe` | 2.13 MB |

## Module Table (Updated Through Phase 13)

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
| Desktop Menu/Help/About/Support | 11E | 0 | ✓ Done |
| Installer EULA/Icon/Branding | 11F | 0 | ✓ Done |
| Security Hardening Review | 12 | 0 | ✓ Done |
| Final QA Regression | 13 | 0 | ✓ Done |

---

## What Was Delivered (Phase 12)

- **Security audit** — Full review of git/secrets hygiene, desktop binary, license engine, admin portal, auth/passwords, Rust permission enforcement, backup/restore, local data, installer, error handling
- **Zero critical findings** — No blocking security vulnerabilities
- **BUG-08 (H-01)** — RSA public key pair verification flagged as High; must confirm before first commercial activation
- **Operational guidance** — SQLite at-rest encryption guidance added to `SECURITY_NOTES.md`; backup archive security documented
- **Security rating** — Acceptable for RC
- **Build** — TypeScript ✓ (1647 modules, 2.58s), Rust ✓ (cargo check 3.45s), Tauri release ✓ (1 pass, 1m 42s), MSI 3.51 MB, NSIS 2.13 MB

## Build Artifact Paths

| Artifact | Path | Size |
|---|---|---|
| MSI (test) | `D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase12-security-review-test.msi` | 3.51 MB |
| NSIS (test) | `D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase12-security-review-test-setup.exe` | 2.13 MB |

## Module Table (Updated Through Phase 12)

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
| Desktop Menu/Help/About/Support | 11E | 0 | ✓ Done |
| Installer EULA/Icon/Branding | 11F | 0 | ✓ Done |
| Security Hardening Review | 12 | 0 | ✓ Done |

## What Was Delivered (Phase 11F)

- **EULA in MSI installer** — `bundle.licenseFile: "EULA.rtf"` triggers `LicenseAgreementDlg` in WiX installer; user must scroll and accept before clicking Next
- **EULA in NSIS installer** — same `licenseFile` triggers `MUI_PAGE_LICENSE` in NSIS setup wizard
- **Copyright string** — `bundle.copyright` populates NSIS installer branding text and `LegalCopyright` in the installer EXE version resource
- **New app icon** — White checkmark on navy (#1E3A5F) rounded square; generated with PowerShell `System.Drawing` + `tauri icon` CLI; all 40+ sizes updated (ICO, ICNS, PNG, Windows Store, iOS, Android)
- **EULA content** — 12-clause professional EULA (existing `src-tauri/EULA.rtf`) covering license grant, activation, device binding, restrictions, local data storage, backup responsibility, warranty disclaimer, limitation of liability, termination, governing law, contact
- **Build** — TypeScript ✓ (1647 modules, 2.65s), Rust cargo check ✓ (2.16s), Tauri release ✓ (1 pass, 1m 42s), MSI 3.51 MB, NSIS 2.13 MB

## Build Artifact Paths

| Artifact | Path | Size |
|---|---|---|
| MSI (test) | `D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase11f-installer-branding-test.msi` | 3.51 MB |
| NSIS (test) | `D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase11f-installer-branding-test-setup.exe` | 2.13 MB |

## What Was Delivered (Phase 11E)

- **Help menu expanded** — 5 items: Help, Support, Tell a Friend, Check for Updates, separator, About QMS Desktop
- **About dialog** — professional modal: app identity, live license details (status, customer, plan, expiry), signed-in user, copyright; no secrets
- **Help dialog** — scrollable modal: getting started steps, modules overview, backup reminder, support contact
- **Support dialog** — support email, version, license status, customer name, "Copy Support Info" button (clipboard); no secrets
- **Tell a Friend** — copyable share message modal; no tracking, no internet
- **Check for Updates** — version display + manual update instructions; no auto-downloader
- **Toggle Sidebar** (View menu) — now works via shared Zustand `useUiStore`; AppLayout reads from store instead of local state
- **Settings auth-gate** — Tools → Settings starts disabled; enabled after login; disabled on logout
- **Ctrl+R** — Reload menu item now has Ctrl+R keyboard shortcut
- **View → Toggle Sidebar** — added as first item in View menu
- **Fullscreen** — F11 and View → Toggle Full Screen work; no kiosk mode; user can always exit
- **Build** — TypeScript ✓ (1647 modules, 2.48s), Rust cargo check ✓ (47.48s), Tauri release ✓ (1 pass, 2m 11s), MSI 3.51 MB, NSIS 2.13 MB

## Build Artifact Paths

| Artifact | Path | Size |
|---|---|---|
| MSI (test) | `D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase11e-menu-help-updates-test.msi` | 3.51 MB |
| NSIS (test) | `D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase11e-menu-help-updates-test-setup.exe` | 2.13 MB |

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
| Desktop Menu/Help/About/Support | 11E | 0 | ✓ Done |
| Installer EULA/Icon/Branding | 11F | 0 | ✓ Done |
