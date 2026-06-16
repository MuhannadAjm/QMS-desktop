# Phase 11D — Report
# Backup, Restore, Import, and Data Transfer Flow

**Date:** 2026-06-16
**Phase:** 11D
**Status:** Complete
**Build:** TypeScript ✓ | Rust ✓ | MSI 3.51 MB | NSIS 2.12 MB

---

## 1. Branch Created

`phase-11d-backup-restore-import` (branched from `main` after Phase 11C merge)

---

## 2. Files Modified

| File | Change |
|---|---|
| `src-tauri/src/commands/backup.rs` | `restore_local_backup` — safety backup + `preserve_license` param; new `validate_import_backup` command |
| `src-tauri/src/commands/mod.rs` | Export `validate_import_backup` |
| `src-tauri/src/lib.rs` | Registered `validate_import_backup`; added "Restore Backup…" to File menu; toggled with auth state |
| `src/services/backupService.ts` | `restoreLocalBackup` — added `preserveLicense` param; added `validateImportBackup` wrapper |
| `src/App.tsx` | `MenuListener` — added `restore-backup` case → navigates to `/backup` |
| `src/pages/Backup.tsx` | Full rewrite with Create / Import / Restore / History UX |

## 3. Files Created

| File | Description |
|---|---|
| `docs/reports/PHASE_11D_BACKUP_RESTORE_IMPORT_REPORT.md` | This report |

---

## 4. Source Code Changed

**Yes** — 6 files modified (2 Rust, 1 TypeScript service, 1 TypeScript page, 1 Rust mod, 1 TypeScript App).

---

## 5. Database Schema Changed

**No.** Backup/restore operates on the filesystem only. No SQL schema changes.

---

## 6. Backup Page Changes (Part A)

The Backup page was fully rewritten with a clear four-section layout:

1. **Status card** — Total backups, Last backup date, Database size, Uploads size, Backup folder path
2. **Action row (Admin only)** — Three buttons: `Create Backup`, `Import Backup File…`, `Open Backup Folder`
3. **Backup Contents info card** — Documents what each backup contains (`data.db`, `uploads/`, `settings.json`, `license.json`)
4. **Backup History list** — All available backups with name, timestamp, size, and individual Restore buttons

Non-admin users see a amber notice: "Admin access required — creating and restoring backups is restricted to Admin users."

After successful restore, a persistent amber "Restart Required" banner is shown until the user closes the app.

---

## 7. Restore / Import Behavior (Part B)

### Two restore paths:

**Path 1: Restore from history list**
- Admin clicks "Restore" next to any backup in the history list
- Confirmation modal opens with the backup name shown
- User types `RESTORE` + optionally unchecks license preservation checkbox
- Restore executes

**Path 2: Import from external folder**
- Admin clicks "Import Backup File…"
- OS folder picker opens (`dialog:allow-open`, `directory: true`)
- Selected folder is validated via `validate_import_backup` command
- If validation passes, confirmation modal opens with the import path shown
- User types `RESTORE` + optionally unchecks license preservation checkbox
- Restore executes

### Confirmation modal content:

- Red warning header: "This action will replace your current data"
- Bullet list of consequences:
  - All records after backup date will be lost
  - Uploaded files may be replaced
  - Safety backup will be created first
  - Only an Admin should perform a restore
- Blue info box: safety backup creation before restore
- License checkbox (see Section 8)
- Type `RESTORE` to enable the button
- "Restore Now" button in red

---

## 8. Safety Backup Behavior (Part B, Part C)

Before any restore begins, the Rust `restore_local_backup` command automatically:

1. Creates a new folder `QMS-SafetyBackup-YYYYMMDD_HHmmss` inside the backups directory
2. Copies `data.db`, `settings.json`, `license.json`, and `uploads/` into it
3. If any safety backup step fails, the restore is **aborted** with an error message
4. Only after the safety backup succeeds does the actual restore begin

The safety backup folder name is included in the success message shown to the user.

---

## 9. License Preservation Behavior (Part C)

**Default behavior: preserve current device license.**

The confirmation modal contains a checkbox:

> ☑ **Keep current device license (recommended)**
> Your license.json will not be replaced. Uncheck only if you intentionally want to restore the license from this backup.

- Default: **checked** (preserve)
- The `preserve_license: bool` parameter is passed to the Rust command
- When `preserve_license = true`: `license.json` is **not** restored even if the backup contains one
- When `preserve_license = false`: `license.json` is restored from backup if present

**Backup contents remain the same:** `create_local_backup` still backs up `license.json` as before (so it is available if explicitly needed during restore).

**Rationale:** License tokens are hardware-fingerprint-bound. Restoring a license from another machine would make the app appear licensed on a device where it has not been activated. Default preservation prevents accidental cross-device license transfer.

---

## 10. Permissions Enforcement (Part D)

| Action | Frontend | Backend (Rust) |
|---|---|---|
| View backup status | Authenticated | `require_authenticated` |
| Create backup | Admin only (button hidden for non-Admin) | `require_admin` |
| Import/Restore backup | Admin only (button hidden for non-Admin) | `require_admin` |
| Open backup folder | Admin only (button hidden for non-Admin) | `require_admin` |
| Validate import path | Admin only | `require_admin` |

Backend enforcement is authoritative — all commands call `require_admin` or `require_authenticated`. The frontend checks are a UX layer only.

Non-Admin users see an amber notice explaining the restriction. All action buttons are hidden (not just disabled) for non-Admin.

---

## 11. File Menu Backup Behavior (Part E)

The native File menu now has:

```
File
  Create Backup          ← disabled before login, enabled after
  Restore Backup…        ← disabled before login, enabled after
  Open Backup Folder     ← disabled before login, enabled after
  ────────────────
  Exit
```

- All three backup items start **disabled** (`enabled = false` in `MenuItem::with_id`)
- The `auth-changed` event from the frontend enables them on login and disables on logout
- Clicking any item navigates to `/backup` page via `menu-action` event
- The backup page enforces Admin-only access for all sensitive actions

---

## 12. Error Handling (Part F)

| Scenario | Error Message |
|---|---|
| Import path does not exist | "The selected path does not exist." |
| Import path is a file, not folder | "The selected path is not a folder." |
| Backup folder missing data.db | "The selected folder does not contain data.db. This does not appear to be a valid QMS backup folder." |
| Import from inside AppData | "The selected folder is inside the QMSDesktop data directory. Use the Restore button on a backup listed below instead." |
| Safety backup fails | "Safety backup failed (database/settings/license/uploads): <error>. Restore aborted." |
| Restore database write fails | "Failed to restore database: <error>" |
| Restore settings write fails | "Failed to restore settings.json: <error>" |
| Create backup fails | Displayed inline below Create Backup button |
| Open folder fails | Displayed in status error area |

No raw stack traces are exposed. All errors are `Result<_, String>` with user-readable messages.

---

## 13. Build Result

| Step | Result |
|---|---|
| `tsc --noEmit` (TypeScript) | ✓ 0 errors |
| `npm run build` (Vite) | ✓ 1641 modules, 2.60s |
| `cargo check` | ✓ 5.06s incremental |
| `npm run tauri build` | ✓ First pass (no AppControl workaround needed — pre-warmed from Phase 11C) |
| MSI installer | ✓ 3.51 MB |
| NSIS installer | ✓ 2.12 MB |

---

## 14. MSI Copied Path

`D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase11d-backup-restore-test.msi`

---

## 15. NSIS Copied Path

`D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase11d-backup-restore-test-setup.exe`

---

## 16. Known Issues

| ID | Severity | Description | Status |
|---|---|---|---|
| BUG-03 | Medium | `tauri-plugin-sql` unused dependency in Cargo.toml | Deferred |
| BUG-04 | Medium | `DATABASE_SCHEMA.md` column name inaccuracies | Deferred |
| BUG-05 | Medium | Bootstrap catch routes to login on storage init failure | Deferred |
| BUG-08 | Low | RSA public key needs verification against Supabase private key | Before production |

No new bugs introduced in Phase 11D.

---

## 17. Confirmations

- [x] No AppData deletion logic added or changed
- [x] No QMS business data uploaded
- [x] No Supabase licensing functions changed
- [x] No Reports work (unrelated to backup validation)
- [x] No Installer/EULA/Icon work
- [x] No auth/users/profile changed
- [x] No database schema changed
- [x] No git commit created
- [x] No git add . used
- [x] No push to GitHub
- [x] Phase 11E not started
