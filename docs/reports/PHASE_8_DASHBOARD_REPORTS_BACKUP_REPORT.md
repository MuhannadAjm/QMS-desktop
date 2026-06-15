# Phase 8 Report — Dashboard, Reports, and Backup

**Date:** 2026-06-15  
**Status:** COMPLETE

---

## Summary

Phase 8 delivered three cross-cutting features that depend on all prior modules:

1. **Dashboard** — real-data KPI cards and attention panels driven by SQLite
2. **Reports** — 6 filterable module reports with print-to-PDF and CSV export
3. **Backup** — local folder-based backup and restore with Admin-only access

No migrations were required. No existing module was modified.

---

## New Rust Commands (16 total)

### Dashboard (`src-tauri/src/commands/dashboard.rs`)

| Command | Permission | Description |
|---|---|---|
| `get_dashboard_summary` | Authenticated | 13-field aggregate (open/overdue CAPAs, high risks, open complaints, open NCs, audits, documents) |
| `get_dashboard_recent_activity` | Authenticated | Most recent N rows from `activity_log` with module/action labels |
| `get_dashboard_overdue_capas` | Authenticated | Open CAPAs where `target_date < date('now')` |
| `get_dashboard_high_risks` | Authenticated | Open risks where level IN ('HIGH','CRITICAL') |
| `get_dashboard_open_ncs` | Authenticated | Open/In-Review NCs ordered by severity |

### Reports (`src-tauri/src/commands/reports.rs`)

| Command | Permission | Description |
|---|---|---|
| `get_document_register_report` | Authenticated | Documents with optional status/date filter |
| `get_capa_report` | Admin/QM/Auditor | CAPAs with optional status/date/responsible filter |
| `get_risk_report` | Admin/QM/Auditor | Risks with optional status/date filter |
| `get_audit_report` | Admin/QM/Auditor | Audits with findings count, optional status/date filter |
| `get_nc_report` | Admin/QM/Auditor | NCs with CAPA link flag, optional status/date filter |
| `get_complaint_report` | Admin/QM | Complaints with optional status/date filter |

### Backup (`src-tauri/src/commands/backup.rs`)

| Command | Permission | Description |
|---|---|---|
| `get_backup_status` | Authenticated | Returns `BackupStatus` (backups dir, DB size, uploads size, backup list) |
| `create_local_backup` | Admin | Copies DB + uploads + settings/license to timestamped folder |
| `open_backups_folder` | Admin | Opens backup folder in Windows Explorer |
| `validate_backup_path` | Admin | Ensures path is valid and not inside AppData |
| `restore_local_backup` | Admin | Copies backup's `data.db` back; returns restart instruction |

---

## New TypeScript Files

| File | Content |
|---|---|
| `src/types/dashboard.ts` | `DashboardSummary` (13 fields), `DashboardActivity`, `OverdueCapa`, `HighRiskItem`, `OpenNcItem` |
| `src/types/reports.ts` | 6 row types + `ReportFilters` + `ReportType` union |
| `src/types/backup.ts` | `BackupEntry`, `BackupStatus` |
| `src/services/dashboardService.ts` | 5 `invoke()` wrappers |
| `src/services/reportService.ts` | 6 `invoke()` wrappers with `filter || null` normalization |
| `src/services/backupService.ts` | 5 `invoke()` wrappers |

---

## Pages Rewritten

### Dashboard.tsx
- Parallel `Promise.all` for 5 backend calls on mount
- 8 primary KPI `StatCard` tiles (clicking navigates to module)
- 5 secondary metric tiles
- 3 attention panels: Overdue CAPAs (red), High Risks (amber), Open NCs (slate)
- Recent Activity feed with module badge, action badge, performer, date

### Reports.tsx
- Report selection grid (6 cards, role-filtered)
- Filter form: status dropdown + date-from + date-to
- "Run Report" → preview table (inline per-report component)
- Print button → `printReportTable()` → browser print dialog (PDF via Save as PDF)
- CSV export → `exportReportCSV()` → Tauri save dialog

### Backup.tsx
- Backup status card (count, last date, folder path)
- Create Backup Now + Open Folder buttons (Admin only; shown to all but disabled UX for non-Admin via notice)
- Backup list with name, date, size, Restore button (Admin only)
- Restore confirmation modal requiring typed "RESTORE" before button enables

---

## Services Extended

### printService.ts
Added `printReportTable(title, headers, rows[], companyName, filterDescription)` — a generic HTML print function that replaces the need for 6 report-specific print functions.

### exportService.ts
Added `exportReportCSV(title, headers, rows[])` — generic CSV export using the existing `save()` dialog and `write_text_file` Tauri command.

---

## Build Validation

| Check | Result |
|---|---|
| `npm run build` (TypeScript + Vite) | ✓ Clean — 0 errors |
| `npm run tauri dev` (Rust compile + app launch) | ✓ App launched successfully |
| Total Tauri commands registered | 85 |

---

## Constraints Honored

- All 19 forbidden actions from Phase 8 specification were respected
- No existing modules modified
- No external APIs connected
- No git commits
- All SQL parameterized with `params![]` — no string concatenation
- Restore requires explicit "RESTART" (user instruction) — no auto-restart
- Backup uses `std::time::SystemTime` for timestamps (no chrono dependency)
