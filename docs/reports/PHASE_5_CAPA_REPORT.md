# Phase Report: Phase 5 — CAPA Module

## Report Metadata

| Field | Value |
|---|---|
| Phase number | 5 |
| Phase name | CAPA Module |
| Date completed | 2026-06-14 |
| Reporter | Claude Code (claude-sonnet-4-6) |
| Session type | Full CAPA module — 9 Rust commands, new TypeScript types and services, full page rewrite, export/print |

---

## 1. Phase Name

Phase 5 — CAPA Module

---

## 2. Objective

Implement a complete, production-quality CAPA (Corrective and Preventive Actions) module backed by real SQLite data:

- CAPA register with full CRUD (Create, Read, Update, Close, Reopen)
- Auto-generated CAPA numbers: `{capa_prefix}-{YYYY}-{NNNN}`
- Corrective and Preventive action types
- Status workflow: OPEN → CLOSED (effectiveness check required for closure)
- Root cause analysis with optional method selector
- Action plan with due date, responsible person, priority
- Optional source linking (MANUAL, COMPLAINT, RISK, AUDIT, NC)
- File attachments stored in `%APPDATA%\QMSDesktop\uploads\capa\`
- Activity log for all CAPA mutations
- DetailsDrawer with Details, Action Plan, Attachments, Activity tabs
- KPI cards: Total, Open, Overdue, Closed
- Export CSV/JSON, Print CAPA Register (reflects current filter)
- Import button: notice-only modal (deferred)
- Rust permission enforcement: Admin/QM full; others view-only

---

## 3. Files Created

| File | Description |
|---|---|
| `src-tauri/src/commands/capa.rs` | 9 Rust Tauri commands for CAPA CRUD, status, attachments, activity |
| `src/types/capa.ts` | CapaListItem, CAPAAttachment, CapaActivityEntry, constants |
| `src/services/capaService.ts` | TypeScript wrappers for all 9 CAPA Tauri commands |
| `docs/reports/PHASE_5_CAPA_REPORT.md` | This file |

---

## 4. Files Modified

| File | Changes |
|---|---|
| `src-tauri/src/commands/mod.rs` | Added `mod capa;` + `pub use capa::{...9 commands};` |
| `src-tauri/src/lib.rs` | Added 9 capa commands to `use commands::{...}` + `generate_handler![]` |
| `src/services/exportService.ts` | Added `exportCapasCSV`, `exportCapasJSON` |
| `src/services/printService.ts` | Added `printCapaRegister` (full HTML print register with overdue highlighting) |
| `src/pages/CAPA.tsx` | Full rewrite from 32-line placeholder to complete CAPA module |
| `CURRENT_PHASE.md` | Phase 5 COMPLETE; Phase 6 next |
| `DEVELOPMENT_LOG.md` | Phase 5 session entry appended |
| `CLAUDE_HANDOFF.md` | Phase 5 complete; Rust/frontend structure updated; commands table updated; Phase 5 checklist added |
| `SECURITY_NOTES.md` | All 10 CAPA commands added to permission table |
| `RUNBOOK.md` | CAPA troubleshooting section added |

---

## 5. Source Code Changed

**Yes.**

---

## 6. Database Changed

**No.** Phase 5 adds no new migrations, tables, or columns.

- `capas` table — already existed from migration 001 with all needed columns
- `attachments` table — already existed from migration 001 for file storage
- `capa_prefix` setting key — already existed in migration 002

---

## 7. Rust Commands (9 total)

All commands are in `src-tauri/src/commands/capa.rs`.

### `list_capas(current_user_id)`
- Permission: `require_authenticated`
- Returns: `Vec<CapaListItem>`
- Joins: `users` table for `responsible_user_name` and `created_by_name`
- `is_overdue` computed in SQL: `CASE WHEN status='OPEN' AND target_date IS NOT NULL AND target_date < date('now') THEN 1 ELSE 0 END`
- Ordered by `capa_number ASC`

### `get_capa(current_user_id, capa_record_id)`
- Permission: `require_authenticated`
- Returns: `CapaListItem`

### `create_capa(current_user_id, title, capa_type, source_type, source_id, root_cause, root_cause_method, action_plan, due_date, responsible_user_id, description, priority)`
- Permission: `require_admin_or_quality_manager`
- Validates: title not empty, capa_type (CORRECTIVE/PREVENTIVE), priority (LOW/MEDIUM/HIGH/CRITICAL), source_type if provided (MANUAL/COMPLAINT/RISK/AUDIT/NC), root_cause not empty, action_plan not empty, due_date not empty, responsible_user exists and is active
- Auto-generates `capa_number` as `{capa_prefix}-{YYYY}-{NNNN}` using COUNT(*) of matching prefix+year pattern
- Inserts into `capas` table with `status = 'OPEN'`
- Logs `CREATED` to `activity_log`
- Returns: `CapaListItem` (fresh fetch)

### `update_capa(current_user_id, capa_record_id, [all editable fields], effectiveness_check)`
- Permission: `require_admin_or_quality_manager`
- Validates: all same as create_capa
- Updates all editable fields including optional `effectiveness_check`
- Logs `UPDATED` to `activity_log`
- Returns: `CapaListItem`

### `set_capa_status(current_user_id, capa_record_id, status, effectiveness_check)`
- Permission: `require_admin_or_quality_manager`
- Status must be `OPEN` or `CLOSED`
- If `CLOSED`: `effectiveness_check` must be non-empty; sets `closed_at = datetime('now')`; logs `CLOSED`
- If `OPEN` (reopen): clears `closed_at = NULL`; logs `REOPENED`
- Returns: `CapaListItem`

### `get_capa_activity(current_user_id, capa_record_id)`
- Permission: `require_authenticated`
- Queries `activity_log` where `module='capa' AND record_id=capa_record_id`
- Ordered by `performed_at DESC`
- Returns: `Vec<CapaActivityEntry>`

### `attach_capa_file(current_user_id, capa_record_id, source_file_path, original_file_name, note)`
- Permission: `require_admin_or_quality_manager`
- Validates file extension (PDF, DOC, DOCX, XLS, XLSX, PNG, JPG, JPEG)
- Copies file to `uploads_capa/{capa_id}_{timestamp_micros}.{ext}`
- Stores file_size from `fs::metadata`; infers mime_type from extension
- Inserts into `attachments` table with `module='capa'`, `record_id=capa_record_id`
- Logs `ATTACHMENT_ADDED` with note (if provided) to `activity_log`
- Updates `capas.updated_at`
- Returns: `CAPAAttachment` (fresh fetch)

### `open_capa_attachment(current_user_id, attachment_id)`
- Permission: `require_authenticated`
- Queries `attachments` table for `file_path` where `module='capa'`
- Opens file from `uploads_capa/{file_path}` via `cmd /c start "" {path}`
- Returns: `()`

### `list_capa_attachments(current_user_id, capa_record_id)`
- Permission: `require_authenticated`
- Queries `attachments` where `module='capa' AND record_id=capa_record_id`
- Ordered by `uploaded_at DESC`
- Returns: `Vec<CAPAAttachment>`

---

## 8. TypeScript Types (`src/types/capa.ts`)

```typescript
interface CapaListItem {
  id: number;
  capa_number: string;
  title: string;
  capa_type: string;          // CORRECTIVE | PREVENTIVE
  source_type: string | null; // MANUAL | COMPLAINT | RISK | AUDIT | NC
  source_id: number | null;
  status: string;             // OPEN | CLOSED
  priority: string | null;    // LOW | MEDIUM | HIGH | CRITICAL
  root_cause: string | null;
  root_cause_method: string | null; // 5-Why | Fishbone | Fault Tree | Other
  action_plan: string | null;
  due_date: string | null;    // maps to capas.target_date
  responsible_user_id: number | null; // maps to capas.assigned_to
  responsible_user_name: string | null;
  effectiveness_check: string | null;
  effectiveness_date: string | null;
  effectiveness_result: string | null;
  closed_at: string | null;
  description: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  is_overdue: boolean;        // computed, not stored
}
```

---

## 9. CAPA.tsx — Page Features

### KPI Cards (4 total)
| Card | Color | Value | Click Action |
|---|---|---|---|
| Total CAPAs | Navy | All records | — |
| Open | Amber | status='OPEN' | Filter to OPEN |
| Overdue | Red | is_overdue=true | Filter to overdue |
| Closed | Green | status='CLOSED' | Filter to CLOSED |

### Filter Bar
- Text search: CAPA number, title, responsible person
- Status dropdown: All / Open / Closed
- Source type dropdown: All / MANUAL / COMPLAINT / RISK / AUDIT / NC
- Overdue dropdown: Any / Overdue Only
- Clear button (shown when any filter is active)

### Data Table Columns
| Column | Notes |
|---|---|
| CAPA # | Monospace, bold, navy |
| Title | Truncates with line-clamp |
| Type | CORRECTIVE (blue) / PREVENTIVE (purple) colored badge |
| Priority | LOW/MEDIUM/HIGH/CRITICAL colored badge |
| Responsible | User name |
| Due Date | Red text when overdue |
| Status | StatusBadge; OPEN → blue, CLOSED → green, OVERDUE → red |
| Chevron | Always visible |

### DetailsDrawer (460px fixed right panel)
- 4 tabs: Details, Action Plan, Attachments, Activity
- **Details tab:** CAPA number, type, status, priority, source, responsible, due date, closed at, description, created by, timestamps — key:value rows
- **Action Plan tab:** Root cause method, root cause (full text), action plan, effectiveness check (highlighted in green box)
- **Attachments tab:** File browse + attach (Admin/QM only), file list with open button; note field optional
- **Activity tab:** Timeline of all activity_log entries (CREATED, UPDATED, CLOSED, REOPENED, ATTACHMENT_ADDED)
- **Drawer action bar (Admin/QM only):** Edit, Close CAPA, Reopen buttons (contextual)

### Modals
- **Create/Edit CAPA:** All fields in a scrollable 2-column form; validates required fields frontend + backend
- **Close CAPA:** Requires effectiveness check textarea (button disabled until non-empty)
- **Reopen CAPA:** Simple confirmation; clears closed_at
- **Import Notice:** Informational modal (import deferred)

### Export / Print
- **Export CSV:** Filtered CAPA list; 14 columns; RFC 4180 quoting; saved via OS dialog
- **Export JSON:** Filtered CAPA list; 14 user-visible fields; saved via OS dialog
- **Print:** HTML print register; company header, 8-column table; status colors including OVERDUE; filtered list

---

## 10. Permission Model

| Feature | Frontend check | Rust check |
|---|---|---|
| View CAPA list | Any authenticated | `require_authenticated` |
| View CAPA details / activity | Any authenticated | `require_authenticated` |
| Open CAPA attachment | Any authenticated | `require_authenticated` |
| New CAPA button | `canEdit` (hidden) | `require_admin_or_quality_manager` |
| Edit CAPA | `canEdit` (hidden) | `require_admin_or_quality_manager` |
| Close / Reopen CAPA | `canEdit` (hidden) | `require_admin_or_quality_manager` |
| Attach file | `canEdit` (hidden) | `require_admin_or_quality_manager` |
| Export CSV/JSON | None (read op) | None |
| Print | None (read op) | None |
| Import button | `canEdit` (notice only) | None |

---

## 11. Overdue Logic

A CAPA is considered overdue when:
```sql
c.status = 'OPEN' AND c.target_date IS NOT NULL AND c.target_date < date('now')
```

This is computed at query time in SQL (not stored). No background job or cron is needed.

On the frontend:
- `is_overdue: true` → StatusBadge shows `OVERDUE` (red) instead of `OPEN`
- Due date cell text turns red
- Overdue KPI card count reflects current overdue state
- Clicking Overdue card filters the table to overdue-only

---

## 12. CAPA Number Auto-Generation

Auto-numbering follows the same pattern as documents:

```rust
fn generate_capa_number(conn: &Connection) -> Result<String, String> {
    let prefix = get_capa_prefix(conn); // reads settings.capa_prefix, default 'CAPA'
    let year = conn.query_row("SELECT strftime('%Y', 'now')", ...) // e.g. '2026'
    let count = conn.query_row(
        "SELECT COUNT(*) FROM capas WHERE capa_number LIKE ?1",
        [format!("{}-{}-%" , prefix, year)]
    ) // count of same-prefix-year CAPAs
    Ok(format!("{}-{}-{:04}", prefix, year, count + 1))
    // → e.g. "CAPA-2026-0001"
}
```

---

## 13. File Storage Architecture

```
%APPDATA%\QMSDesktop\uploads\capa\
└── {capa_id}_{timestamp_micros}.{ext}
    e.g. 42_1750000000123456.pdf
```

- `file_path` stored in `attachments.file_path` — the stored filename only (not full path)
- `file_name` stored in `attachments.file_name` — the original user filename (for display)
- File opened via `paths.uploads_capa.join(&file_path)` → full absolute path → `cmd /c start`

---

## 14. Build Result

| Step | Result |
|---|---|
| `npm run build` (tsc + vite) | SUCCESS — 1627 modules, 0 TypeScript errors, 299.22 kB JS (82.79 kB gzip) |
| Rust incremental compile | SUCCESS — 0.51s (capa.rs + mod.rs + lib.rs changes) |
| App window | OPENED — CAPA module now shows full register instead of placeholder |

Build size increase from Phase 4B: +35.07 kB JS (from 264.15 kB to 299.22 kB). This accounts for capa.rs compiled to Rust, capaService.ts, capa.ts types, CAPA.tsx full page, and exportService/printService additions.

---

## 15. Confirmation: No Forbidden Actions

| Check | Result |
|---|---|
| `.env` files were not touched | CONFIRMED |
| No secrets were printed or logged | CONFIRMED |
| No live external APIs were connected | CONFIRMED |
| No business data was uploaded anywhere | CONFIRMED |
| No external messages were sent | CONFIRMED |
| No license activation logic was implemented | CONFIRMED |
| No Risks/Complaints/Audits/NC CRUD implemented | CONFIRMED |
| No cloud sync implemented | CONFIRMED |
| No multi-device mode implemented | CONFIRMED |
| No billing / payment implemented | CONFIRMED |
| No commit was created | CONFIRMED |
| No `git add .` was run | CONFIRMED |
| No existing files were deleted | CONFIRMED |
| New migration was NOT created (not needed) | CONFIRMED |
| Documents module NOT modified | CONFIRMED |

---

## Summary

Phase 5 delivers the full CAPA module as a production-quality second QMS business module.

**No database migration was required** — the `capas` table, `attachments` table, and `capa_prefix` setting all existed from Phase 2 and Phase 3 migrations.

**Key workflow implemented:**
1. Admin/QM creates CAPA → auto-numbered `CAPA-2026-0001`
2. CAPA starts as `OPEN`; is_overdue computed automatically in SQL
3. Admin/QM can edit CAPA, attach files, view activity
4. All users can view CAPA list, details, activity, attachments
5. To close: Admin/QM must provide an **effectiveness check** (required)
6. Closed CAPA shows green badge, closed_at timestamp
7. Can be reopened by Admin/QM (clears closed_at, returns to OPEN)

**Rust:** 0.51s incremental, 0 errors.
**TypeScript:** 0 errors, 1627 modules, 299.22 kB JS.
