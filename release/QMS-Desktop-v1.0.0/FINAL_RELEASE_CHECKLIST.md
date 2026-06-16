# QMS Desktop v1.0.0 — Final Release Checklist

**Date:** 2026-06-16
**Version:** 1.0.0
**Phase:** 14 — Final Release Package and Delivery Preparation

---

## Build

- [x] TypeScript build passed — 1647 modules, 2.64s, 0 errors
- [x] Rust cargo check passed — 1.77s, 0 errors
- [x] Tauri release build passed — 1m 42s
- [x] MSI created — `QMS-Desktop-v1.0.0-x64.msi` (3.51 MB)
- [x] NSIS created — `QMS-Desktop-v1.0.0-x64-setup.exe` (2.13 MB)

---

## Release Package

- [x] Release folder created — `D:\QMS-Desktop\release\QMS-Desktop-v1.0.0\`
- [x] MSI copied to release folder as `QMS-Desktop-v1.0.0-x64.msi`
- [x] NSIS copied to release folder as `QMS-Desktop-v1.0.0-x64-setup.exe`
- [x] SHA256 checksums generated — `CHECKSUMS-SHA256.txt`
- [x] No source code included in release folder
- [x] No private keys in release folder
- [x] No .env files in release folder
- [x] No license_hash_secret.txt in release folder
- [x] No test-builds folder included
- [x] No AppData files included
- [x] No database files included
- [x] No customer data included

---

## Installer Behavior (Code-Verified in Phase 13)

- [x] EULA shown in MSI installer (LicenseAgreementDlg via WixUI_InstallDir)
- [x] EULA shown in NSIS installer (MUI_PAGE_LICENSE)
- [x] App icon shown (white checkmark on navy, ICO format)
- [x] Copyright string set — "© 2026 QMS Desktop. All rights reserved."
- [x] AppData preserved on reinstall (no RemoveFolder targeting AppData)
- [x] AppData preserved on uninstall (no custom uninstall actions)
- [ ] MSI EULA scroll + Accept — **manual test required**
- [ ] NSIS EULA Decline exits installer — **manual test required**
- [ ] Desktop shortcut icon shown — **manual test required**
- [ ] SmartScreen warning behavior documented — click "More info" → "Run anyway"

---

## License Activation

- [x] RSA key pair verified — MATCH (Phase 14 H-01 resolved)
- [x] DEV bypass tokens rejected in release build (`cfg!(not(debug_assertions))`)
- [x] DEV commands return error in release build
- [x] DEV UI absent from production bundle (`import.meta.env.DEV` dead-code eliminated)
- [x] License badge shows correct state in Topbar
- [x] BUG-09 fixed — empty expires_at shows "Never"
- [ ] License activation end-to-end with real key — **manual test required**
- [ ] Invalid license fails safely — **manual test required**
- [ ] App works offline after activation — **manual test required**
- [ ] License Admin Portal activation count — **manual test required**

---

## First Admin Setup and Login

- [x] First admin guard enforced (requires 0 users in DB)
- [x] Username validation enforced (starts with letter, alphanumeric+_, max 64)
- [x] Username normalized to lowercase
- [x] Username immutable after creation
- [x] Password hashing: Argon2id (m=19456, t=2, p=1)
- [x] Login uses username field
- [x] Wrong credentials: safe error message (no username enumeration)
- [x] Inactive account: appropriate error message
- [x] Profile dropdown: Edit Profile, Change Password, Log Out
- [x] Username read-only in Edit Profile modal
- [ ] First admin setup on fresh install — **manual test required**
- [ ] Login with created admin credentials — **manual test required**

---

## Modules

- [x] Documents — Phase 10 QA baseline verified, no regression in Phases 11–13
- [x] CAPA — Phase 10 QA baseline verified, no regression
- [x] Risks — Phase 10 QA baseline verified, no regression
- [x] Complaints — Phase 10 QA baseline verified, no regression
- [x] Audits — Phase 10 QA baseline verified, no regression
- [x] Non-Conformities — Phase 10 QA baseline verified, no regression
- [x] Cross-module workflows — all 6 flows code-verified (Part F, Phase 13)
- [x] Dashboard KPIs — all 7 queries code-verified

---

## Reports

- [x] Role filtering: `availableReports.filter(r.allowedRoles.includes(role))`
- [x] Empty state guard — print/export disabled when 0 rows
- [x] Date range validation — inline error if from > to
- [x] Print uses DOM injection (works in Tauri WebView2)
- [x] CSV filenames per-report (e.g., `capa-report-YYYY-MM-DD.csv`)
- [ ] Reports export/print tested end-to-end — **manual test required**

---

## Backup and Restore

- [x] Admin-only enforcement (Rust backend)
- [x] Safety backup before restore
- [x] License preserved by default
- [x] Import backup: path validated (not inside AppData, must contain data.db)
- [x] Restart Required banner shown after restore
- [ ] Backup/restore tested end-to-end — **manual test required**

---

## Desktop Integration

- [x] Native menu bar (File / View / Tools / Help)
- [x] Auth-gated menu items (backup items, Settings)
- [x] F11 fullscreen
- [x] Ctrl+R reload
- [x] Toggle Sidebar from View menu
- [x] All 5 Help dialogs wired (Help, Support, Tell a Friend, Check for Updates, About)
- [x] No secrets shown in dialogs (About/Support verified in Phase 12/13)

---

## Security

- [x] RSA key pair verified — MATCH — H-01 RESOLVED
- [x] No secrets committed to git (git history scan clean, Phase 12)
- [x] No private RSA key in desktop binary
- [x] No Supabase service_role key in desktop binary
- [x] All SQL parameterized (`params![]` — no string concatenation)
- [x] File extension allowlist enforced in Rust backend
- [x] Password hashes never returned to frontend
- [x] CSP: `script-src 'self'` (no remote scripts)
- [x] Permissions enforced in Rust backend for every command

---

## Documentation

- [x] RELEASE_NOTES.md created
- [x] INSTALLATION_GUIDE.md created
- [x] LICENSE_ACTIVATION_GUIDE.md created
- [x] BACKUP_RESTORE_GUIDE.md created
- [x] ADMIN_QUICK_START.md created
- [x] SECURITY_AND_DATA_NOTES.md created
- [x] FINAL_RELEASE_CHECKLIST.md created (this file)
- [x] CHECKSUMS-SHA256.txt created
- [x] PHASE_14_FINAL_RELEASE_PACKAGE_REPORT.md created

---

## Git / Version Control

- [ ] Git tag `v1.0.0` — **pending user approval**
- [ ] GitHub release created — **pending user approval**
- [ ] No commit created in Phase 14 (per instructions)
- [ ] No push to GitHub in Phase 14 (per instructions)

---

## Final Release Status

**Ready for internal delivery.**

The release folder `D:\QMS-Desktop\release\QMS-Desktop-v1.0.0\` contains the final installer artifacts and documentation.

**Manual tests listed above should be completed before customer delivery.**

**H-01 is RESOLVED** — RSA key pair verified MATCH — ready for customer license issuance.

---

*QMS Desktop v1.0.0 — © 2026 QMS Desktop. All rights reserved.*
