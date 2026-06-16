# Phase 11C — Report
# Reports, Print, Export, and Empty State Fixes

**Date:** 2026-06-16  
**Phase:** 11C  
**Status:** Complete  
**Build:** TypeScript ✓ | Rust ✓ | MSI 3.51 MB | NSIS 2.12 MB

---

## 1. Branch Created

`phase-11c-reports-print-export` (branched from `main` after Phase 11B merge)

---

## 2. Files Modified

| File | Change |
|---|---|
| `src/pages/Reports.tsx` | Generate Report label; empty-state guard on print/export; date range validation; improved empty state UI; `fileSlug` per report; `FileX` icon; role visibility confirmed |
| `src/services/printService.ts` | `printReportTable` rewritten — DOM injection instead of `window.open` for reliable Tauri print |
| `src/services/exportService.ts` | `exportReportCSV` first param changed from `title` to `slug` for clean filenames |

## 3. Files Created

| File | Description |
|---|---|
| `docs/reports/PHASE_11C_REPORTS_PRINT_EXPORT_REPORT.md` | This report |

---

## 4. Source Code Changed

**Yes** — 3 frontend files modified. No Rust code changed. No database schema changed.

---

## 5. Database Schema Changed

**No.** All reports go through existing Rust commands (`getDocumentRegisterReport`, `getCapaReport`, etc.) with no schema modifications.

---

## 6. Generate Report Label Changed

**Yes.** Button text changed from `"Run Report"` / `"Running…"` to `"Generate Report"` / `"Generating…"` consistently across all 6 report types. Applied in `Reports.tsx` line with the generate button.

---

## 7. Empty Report Behavior

**Implemented.** When `Generate Report` is clicked and the result is 0 rows:

- The results card appears and shows a professional empty state:
  - Centered `FileX` icon in a gray circle
  - Primary text: **"No records found"**
  - Secondary text: **"Adjust filters or create records first"**
- The count in the card header reads `"0 records"`
- Print button is visible but **disabled** (`disabled` attribute + `opacity-40 cursor-not-allowed`) with `title="No data to print"`
- Export CSV button is visible but **disabled** with `title="No data to export"`
- No empty CSV is written. No print dialog is opened.

---

## 8. Export No-Data Behavior

**Fixed.** Guard in `handleExportCSV`:
```typescript
if (data.length === 0) {
  alert('No data to export. Adjust filters or create records first.');
  return;
}
```
The Export CSV button is also disabled (`!hasData`) so the guard is a belt-and-suspenders safety net. No file dialog is opened, no empty file is created.

---

## 9. Print No-Data Behavior

**Fixed.** Guard in `handlePrint`:
```typescript
if (data.length === 0) {
  alert('No data to print. Adjust filters or create records first.');
  return;
}
```
Additionally, `printReportTable` itself returns early if `rows.length === 0`. Print button is also disabled when no data. The system print dialog is never opened for an empty report.

---

## 10. Print Implementation Details

**Rewritten.** Previous implementation used `window.open('', '_blank', ...)` which can be blocked by the Tauri WebView2 sandbox or produce unreliable behavior.

**New approach — DOM injection + `window.print()`:**
1. A `<style>` element is injected into `<head>` with:
   - `@media screen { #qms-report-print-area { display: none } }` — hidden on screen
   - `@media print { body > *:not(#qms-report-print-area) { display: none !important } }` — all app chrome (sidebar, topbar) hidden in print
   - Full print typography: navy header, table styles, even-row shading, footer
2. A `<div id="qms-report-print-area">` is injected into `<body>` with the report HTML content
3. `window.print()` is called — opens the OS/browser print dialog with only the report visible
4. After 500ms `setTimeout`, both elements are removed from the DOM

**Print output includes:**
- Company name (from `settingsStore`) + report title in navy header
- `Generated: <date> | <filter summary> | N records` meta line
- Table with navy header row, all columns, alternating row shading
- Confidential footer

**No `window.open` used** — works in Tauri WebView2 without popup blocker issues.  
**Save as PDF** — user can select "Save as PDF" or "Microsoft Print to PDF" in the system print dialog.

---

## 11. CSV Export Implementation Details

**Updated.** `exportReportCSV` in `exportService.ts` signature changed:
- Before: `exportReportCSV(title: string, headers, rows)` — computed filename from title string (lossy)
- After: `exportReportCSV(slug: string, headers, rows)` — slug is a pre-defined clean identifier

**Filename mapping per report:**

| Report | `fileSlug` | Output filename |
|---|---|---|
| Document Register | `document-register-report` | `document-register-report-2026-06-16.csv` |
| CAPA Report | `capa-report` | `capa-report-2026-06-16.csv` |
| Risk Report | `risk-report` | `risk-report-2026-06-16.csv` |
| Complaint Report | `complaint-report` | `complaint-report-2026-06-16.csv` |
| Audit Report | `audit-report` | `audit-report-2026-06-16.csv` |
| Non-Conformity Report | `non-conformity-report` | `non-conformity-report-2026-06-16.csv` |

**CSV quality:**
- Headers: human-readable column names (e.g., `"Doc Number","Title","Category",...`)
- Dates: formatted as `YYYY-MM-DD` via `fmtDate()` — no raw ISO timestamps
- Null/undefined values: exported as empty string `""` via `escapeCSV(String(value ?? ''))`
- Values with commas/quotes/newlines: properly double-quoted per RFC 4180
- Line endings: `\r\n` (Windows standard for CSV)
- Encoding: UTF-8 (written via `write_text_file` Tauri command)

Export only contains the **currently generated/filtered data** — not all records in the database.

---

## 12. Filters Tested (Code Review)

All 6 report Rust commands use `(?1 IS NULL OR field = ?1)` pattern for optional filters. Frontend passes `null` for empty strings before sending to Rust (verified in `reportService.ts`).

| Filter | Behavior |
|---|---|
| Status (empty `""`) | Passes `null` to Rust → all statuses returned |
| Date From (empty `""`) | Passes `null` → no lower date bound |
| Date To (empty `""`) | Passes `null` → no upper date bound |
| `dateFrom > dateTo` | Caught in frontend: shows `"'Created From' must be before 'Created To'."` error, no fetch |
| Invalid date input | Browser date picker prevents invalid dates |

Date range validation error clears automatically when either date field changes.

---

## 13. Role Visibility Result

**Already correctly implemented before Phase 11C.** The `REPORTS` array has an `allowedRoles` field per report, and `availableReports = REPORTS.filter(r => r.allowedRoles.includes(role))` filters the grid. This was present in Phase 8 implementation.

Phase 10 QA report (BUG-06) described this as unfixed, but the code at that time already had the filter. The grid only shows reports the current user's role can access.

**Role matrix (verified):**

| Report | Admin | QM | Auditor | Employee | Viewer |
|---|---|---|---|---|---|
| Document Register | ✓ | ✓ | ✓ | ✓ | ✓ |
| CAPA Report | ✓ | ✓ | ✓ | ✗ | ✗ |
| Risk Report | ✓ | ✓ | ✓ | ✗ | ✗ |
| Complaint Report | ✓ | ✓ | ✗ | ✗ | ✗ |
| Audit Report | ✓ | ✓ | ✓ | ✗ | ✗ |
| NC Report | ✓ | ✓ | ✓ | ✗ | ✗ |

Backend permission enforcement remains authoritative in Rust. Frontend filtering is a UX layer only.

**BUG-06 status: Resolved** — frontend role filtering was already in place; confirmed and documented.

---

## 14. Build Result

| Step | Result |
|---|---|
| `tsc --noEmit` (TypeScript) | ✓ 0 errors |
| `npm run build` (Vite) | ✓ 1641 modules, 2.43s |
| `cargo check` | ✓ 1.15s incremental (Rust unchanged) |
| `npm run tauri build` | ✓ 2 AppControl workaround passes; build succeeded |
| MSI installer | ✓ 3.51 MB |
| NSIS installer | ✓ 2.12 MB |

---

## 15. MSI Copied Path

`D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase11c-reports-test.msi`

---

## 16. NSIS Copied Path

`D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase11c-reports-test-setup.exe`

---

## 17. Known Issues

| ID | Severity | Description | Status |
|---|---|---|---|
| BUG-03 | Medium | `tauri-plugin-sql` unused dependency in Cargo.toml | Deferred |
| BUG-04 | Medium | `DATABASE_SCHEMA.md` column name inaccuracies | Deferred |
| BUG-05 | Medium | Bootstrap catch routes to login on storage init failure | Deferred |
| BUG-08 | Low | RSA public key needs verification against Supabase private key | Before production |

**Resolved in Phase 11C:**
- BUG-06 (Medium): Reports page role filtering — confirmed already implemented; documented

---

## 18. Confirmations

- [x] No AppData deletion logic added or changed
- [x] No QMS business data uploaded
- [x] No Supabase licensing functions changed
- [x] No auth/users/profile changed
- [x] No license/sidebar/navigation shell changed
- [x] No Backup/Restore implementation
- [x] No Installer/EULA/Icon work
- [x] No Help/Support/Updates work
- [x] No database schema changed
- [x] No git commit created
- [x] No git add . used
- [x] No push to GitHub
- [x] Phase 11D not started
