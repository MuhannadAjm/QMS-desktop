# Phase 14B — Final Manual QA Fixes Before Release

**Date:** 2026-06-16
**Branch:** `phase-14b-final-manual-qa-fixes`
**Build:** `QMS-Desktop-1.0.0-phase14b-final-manual-fixes-test.msi` / `-setup.exe`

---

## Summary

Phase 14B addressed 9 categories of UX and functional issues discovered during manual testing of the Phase 14 v1.0.0 release package. All source code changes were implemented and verified with a clean TypeScript build (1650 modules), clean `cargo check`, and a full Tauri release build.

---

## Part A — Export Guards (0 Records)

**Issue:** Export buttons remained active even when the current filtered list had 0 records, producing empty CSV/JSON files.

**Fix:** Added `hasData?: boolean` prop to `ModuleToolbar.tsx`. When `hasData === false`, the Export dropdown button is disabled with `title="No data to export"`. All 6 module pages now pass `hasData={filtered.length > 0}`.

**Files changed:**
- `src/components/ui/ModuleToolbar.tsx` — added `hasData` prop, disabled Export when false
- `src/pages/Documents.tsx` — added `hasData={filtered.length > 0}`
- `src/pages/CAPA.tsx` — added `hasData={filtered.length > 0}`
- `src/pages/Risks.tsx` — added `hasData={filtered.length > 0}`
- `src/pages/Complaints.tsx` — added `hasData={filtered.length > 0}`
- `src/pages/Audits.tsx` — added `hasData={filtered.length > 0}`
- `src/pages/NonConformities.tsx` — added `hasData={filtered.length > 0}`

---

## Part B — Module Print Buttons Fixed

**Issue:** Print buttons on all 6 module register pages did nothing. Root cause: all 6 module print functions in `printService.ts` used `window.open('', '_blank', ...)` to open a new window and inject HTML, which Tauri WebView2 blocks silently.

**Fix:** All 6 functions (`printDocumentRegister`, `printCapaRegister`, `printRiskRegister`, `printComplaintRegister`, `printAuditRegister`, `printNcRegister`) were rewritten to use DOM injection — the same pattern already used by the working `printReportTable` function introduced in Phase 11C.

A shared private helper `injectAndPrint(content: string)` was added:
1. Injects a `<style id="qms-mod-print-style">` with `@media screen { hidden }` + `@media print { show only print area }`
2. Injects a `<div id="qms-mod-print-area">` with the formatted table HTML
3. Calls `window.print()`
4. Removes both elements after 500ms cleanup timeout

All 6 functions now call `injectAndPrint()` with their respective body content. CSS classes were renamed with `qmp-` prefix to avoid conflicts with app styles. The working `printReportTable` function was preserved unchanged.

Print is also guarded by `hasData` in ModuleToolbar (Part A/B combined): when list is empty, Print button is disabled with `title="No data to print"`.

**Files changed:**
- `src/services/printService.ts` — complete rewrite of 6 module print functions; added `injectAndPrint` helper; `printReportTable` unchanged

---

## Part C — Import Buttons Hidden

**Issue:** Import buttons on all 6 module pages showed "Import is not yet available" notice modal when clicked, creating confusing UX for a feature that doesn't exist yet.

**Fix:** Removed `onImport` prop from all 6 module page `ModuleToolbar` calls. The `ModuleToolbar` already hides the Import button when `onImport` is `undefined`.

**Files changed:**
- `src/pages/Documents.tsx` — removed `onImport={() => setImportNoticeOpen(true)}`
- `src/pages/CAPA.tsx` — removed `onImport={() => setImportNoticeOpen(true)}`
- `src/pages/Risks.tsx` — removed `onImport={() => setShowImport(true)}`
- `src/pages/Complaints.tsx` — removed `onImport={() => setShowImport(true)}`
- `src/pages/Audits.tsx` — removed `onImport={() => setShowImport(true)}`
- `src/pages/NonConformities.tsx` — removed `onImport={() => setShowImport(true)}`

---

## Part D — Keyboard Shortcuts (Frontend Listeners)

**Issue:** F11 (fullscreen), Ctrl+=, Ctrl+-, Ctrl+0, and Ctrl+R did not reliably work. These were only handled by native Tauri menu bar accelerators, which can miss keystrokes when WebView2 doesn't relay them.

**Fix:** Added a second `useEffect` inside the `MenuListener` component in `App.tsx` that registers a `keydown` event listener. The listener handles:

| Key | Action |
|---|---|
| F11 | Toggle fullscreen via `getCurrentWindow().isFullscreen()` + `setFullscreen()` |
| Ctrl+= or Ctrl++ | Zoom in (max 2.0×) |
| Ctrl+- | Zoom out (min 0.5×) |
| Ctrl+0 | Reset zoom to 1.0 |
| Ctrl+R | Reload page (skipped if focus is on `<input>`, `<textarea>`, or `<select>`) |

`@tauri-apps/api/window.getCurrentWindow()` was imported for the fullscreen toggle.

**Files changed:**
- `src/App.tsx` — added `getCurrentWindow` import; added `keydown` useEffect inside `MenuListener`

---

## Part E — Sidebar Toggle Button Visibility

**Issue:** The sidebar collapse/expand toggle button was too small (size=14, `text-slate-400`) and hard to click.

**Fix:** Updated both toggle buttons (collapsed state: `PanelLeftOpen`; expanded state: `PanelLeftClose`):
- Icon size: 14 → 18
- Stroke width: 1.75 → 2
- Color: `text-slate-400` → `text-slate-300` (brighter)
- Hover: added `hover:bg-white/10` background highlight
- Click target: `p-1` → `p-2` (larger padding)

**Files changed:**
- `src/components/layout/Sidebar.tsx` — both toggle buttons updated

---

## Part F — Native Menu Bar Styling

**Finding:** The Windows native menu bar (File / View / Tools / Help) appears small and thin because it is rendered by the OS (Win32 native menu), not by WebView2. Its font, padding, and visual style are entirely controlled by Windows and cannot be modified via HTML/CSS or Tauri configuration options.

**Decision:** No change required. The native menu bar is a standard Windows UI control. Its appearance is consistent with other native Windows applications (File Explorer, Notepad, etc.). This is documented as an OS limitation, not a bug.

**No files changed.**

---

## Part G — Backup History Delete

**Issue:** The Backup History list had no way to delete old backups. Users had to open the backup folder manually and delete via File Explorer.

**Fix:** Added a per-entry Delete Backup feature with Admin-only enforcement and confirmation modal.

### Rust backend: `delete_backup` command

New command in `src-tauri/src/commands/backup.rs`:
- Requires Admin (`permissions::require_admin`)
- Validates the path exists and is a directory
- Validates folder name starts with `"QMS-Backup-"` (prevents deleting safety backups or other folders)
- Validates canonical path is directly inside the backups directory (one level deep)
- Calls `std::fs::remove_dir_all` on the canonical path

### Frontend

- `backupService.ts` — added `deleteBackup(currentUserId, backupPath): Promise<void>`
- `Backup.tsx` — added:
  - `Trash2` icon import
  - `deleteBackup` import
  - Delete state: `deleteTarget`, `deleting`, `deleteError`
  - `handleDeleteClick(entry)` — sets delete target
  - `handleDeleteConfirm()` — calls `deleteBackup`, refreshes list on success
  - `handleDeleteCancel()` — clears target
  - `DeleteModal` component — confirmation modal with checkbox ("I understand this will permanently delete this backup"), Delete button (disabled until checked), error display
  - Delete button next to each Restore button in the backup history rows (Admin-only, red styling)

**Files changed:**
- `src-tauri/src/commands/backup.rs` — added `delete_backup` command
- `src-tauri/src/commands/mod.rs` — added `delete_backup` to pub use list
- `src-tauri/src/lib.rs` — added `delete_backup` to use list and `invoke_handler![]`
- `src/services/backupService.ts` — added `deleteBackup`
- `src/pages/Backup.tsx` — added DeleteModal, state, handlers, and Delete buttons
- `src/components/ui/Button.tsx` — added `title?: string` prop (needed for ModuleToolbar disabled tooltips)

---

## Part H — Installer EULA Checkbox

**Finding:** The WiX MSI installer uses `LicenseAgreementDlg` which presents the EULA with a radio button choice ("I accept…" / "I do not accept…"), not a checkbox. This is the standard WiX dialog and cannot be easily changed to a checkbox without a custom WXS dialog template and significant installer rework.

The NSIS installer uses `MUI_PAGE_LICENSE` which similarly uses a bottom radio/checkbox group dependent on the NSIS version.

**Decision:** No change required. The existing "I accept…" radio button provides legally equivalent acceptance and is the standard WiX pattern. Changing to a checkbox would require a custom WiX dialog which is out of scope for this phase. This is documented as a known WiX limitation, not a bug.

**No files changed.**

---

## Part I — Final Build

| Step | Result |
|---|---|
| `npm.cmd run build` (TypeScript + Vite) | ✓ 1650 modules, 2.67s |
| `cargo check` | ✓ Finished dev profile in 2.22s |
| `npm.cmd run tauri build` | ✓ Finished release profile in 1m 43s |
| MSI artifact | `test-builds/QMS-Desktop-1.0.0-phase14b-final-manual-fixes-test.msi` (3.51 MB) |
| NSIS artifact | `test-builds/QMS-Desktop-1.0.0-phase14b-final-manual-fixes-test-setup.exe` (2.13 MB) |

---

## Part J — Documentation

- `docs/reports/PHASE_14B_FINAL_MANUAL_QA_FIXES_REPORT.md` — this file
- `docs/CURRENT_PHASE.md` — updated with Phase 14B section
- `docs/DEVELOPMENT_LOG.md` — Phase 14B entry added
- `PHASE_PLAN.md` — Phase 14B row added

---

## Summary of All Files Changed

| File | Change |
|---|---|
| `src/services/printService.ts` | Rewrote 6 module print functions from `window.open()` to DOM injection; added `injectAndPrint` helper |
| `src/components/ui/ModuleToolbar.tsx` | Added `hasData` prop; disabled Print/Export when empty |
| `src/components/ui/Button.tsx` | Added `title` prop |
| `src/pages/Documents.tsx` | Added `hasData`, removed `onImport` |
| `src/pages/CAPA.tsx` | Added `hasData`, removed `onImport` |
| `src/pages/Risks.tsx` | Added `hasData`, removed `onImport` |
| `src/pages/Complaints.tsx` | Added `hasData`, removed `onImport` |
| `src/pages/Audits.tsx` | Added `hasData`, removed `onImport` |
| `src/pages/NonConformities.tsx` | Added `hasData`, removed `onImport` |
| `src/App.tsx` | Added `getCurrentWindow` import; added `keydown` listener for F11, Ctrl+=, Ctrl+-, Ctrl+0, Ctrl+R |
| `src/components/layout/Sidebar.tsx` | Enlarged and improved toggle buttons |
| `src-tauri/src/commands/backup.rs` | Added `delete_backup` command |
| `src-tauri/src/commands/mod.rs` | Added `delete_backup` to pub use |
| `src-tauri/src/lib.rs` | Added `delete_backup` to use and invoke_handler |
| `src/services/backupService.ts` | Added `deleteBackup` function |
| `src/pages/Backup.tsx` | Added DeleteModal, handlers, Delete button per backup entry |

---

*QMS Desktop Phase 14B — © 2026 QMS Desktop*
