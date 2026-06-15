# Phase 8B — Cross-Module Workflow Linking Report

**Date:** 2026-06-15  
**Phase:** 8B  
**Status:** Complete

---

## Objective

Make the QMS behave as an integrated system rather than a collection of separate registers. Implement four cross-module workflow conversion commands that allow a Risk or Complaint to be escalated into a Non-Conformity or a CAPA, with full duplicate prevention, activity logging, and linked-record UI in each source module's DetailsDrawer.

---

## Deliverables

### A — Database Migration

**File:** `src-tauri/src/db/sql/006_phase8b_cross_module_links.sql`  
**Registered in:** `src-tauri/src/db/init.rs` as Migration 006

```sql
ALTER TABLE risks ADD COLUMN related_nc_id   INTEGER REFERENCES non_conformities(id);
ALTER TABLE risks ADD COLUMN related_capa_id  INTEGER REFERENCES capas(id);
ALTER TABLE complaints ADD COLUMN related_nc_id   INTEGER REFERENCES non_conformities(id);
ALTER TABLE complaints ADD COLUMN related_capa_id  INTEGER REFERENCES capas(id);
```

Each column is nullable; it is set to the new record's ID once a conversion is performed.

---

### B — Rust Backend (4 new commands)

**File:** `src-tauri/src/commands/risks.rs`

| Command | Permission | Description |
|---|---|---|
| `create_nc_from_risk` | Admin/QM | Creates NC (source=RISK), links `risks.related_nc_id` |
| `create_capa_from_risk` | Admin/QM | Creates CAPA (source=RISK), links `risks.related_capa_id` |

**File:** `src-tauri/src/commands/complaints.rs`

| Command | Permission | Description |
|---|---|---|
| `create_nc_from_complaint` | Admin/QM | Creates NC (source=CUSTOMER_COMPLAINT), links `complaints.related_nc_id` |
| `create_capa_from_complaint` | Admin/QM | Creates CAPA (source=COMPLAINT), links `complaints.related_capa_id` |

**Common implementation pattern for all 4 commands:**
1. `require_admin_or_quality_manager(current_user_id)` — permission gate
2. Fetch source record, check `related_nc_id` / `related_capa_id` IS NULL — return error if already set
3. Generate auto-number from settings prefix + year + COUNT(*)
4. Insert NC or CAPA with appropriate source, source_id, title, status, created_by
5. UPDATE source record's FK column with `last_insert_rowid()`
6. Write activity_log for source record (action: NC_CREATED / CAPA_CREATED)
7. Write activity_log for new record (action: CREATED)
8. Return `fetch_risk()` / `fetch_complaint()` with the refreshed source record

**Supporting change — `non_conformities.rs`:**  
Added `"RISK"` to `validate_nc_source()` match arm so NC source validation passes for risk-sourced NCs.

**Supporting change — `RISK_SQL` and `COMPLAINT_SQL`:**  
Both SQL constants extended with 4 new SELECT columns and 2 new LEFT JOINs each:
- `r.related_nc_id`, `rn.nc_number AS related_nc_number`
- `r.related_capa_id`, `rca.capa_number AS related_capa_number`

`map_risk_row` reads indices 27–30; `map_complaint_row` reads indices 19–22.

**Wiring:**
- `src-tauri/src/commands/mod.rs` — 4 new `pub use` exports
- `src-tauri/src/lib.rs` — 4 new entries in `use commands {}` block and `generate_handler![]`

---

### C — TypeScript Frontend

**Types:**

`src/types/risk.ts` — `RiskListItem` extended:
```ts
related_nc_id: number | null;
related_nc_number: string | null;
related_capa_id: number | null;
related_capa_number: string | null;
```

`src/types/complaint.ts` — `ComplaintListItem` extended: same 4 fields.

**Services:**

`src/services/riskService.ts`:
- `createNcFromRisk(currentUserId, riskRecordId)` → `invoke('create_nc_from_risk', ...)`
- `createCapaFromRisk(currentUserId, riskRecordId)` → `invoke('create_capa_from_risk', ...)`

`src/services/complaintService.ts`:
- `createNcFromComplaint(currentUserId, complaintRecordId)` → `invoke('create_nc_from_complaint', ...)`
- `createCapaFromComplaint(currentUserId, complaintRecordId)` → `invoke('create_capa_from_complaint', ...)`

**Pages:**

`src/pages/Risks.tsx`:
- `DrawerTab` type extended with `'links'`
- New components: `CreateNcFromRiskModal`, `CreateCapaFromRiskModal` (confirmation modals with error display)
- `DetailsDrawer` state: `showCreateNc`, `showCreateCapa`
- 'Links' tab added (with `●` indicator when a link exists)
- Links tab panel: shows linked NC/CAPA chip if present; shows "Create" button if absent (Admin/QM only)
- Modal mounts: `onCreated` callback refreshes source record and switches tab to 'links'

`src/pages/Complaints.tsx`:
- Same structure: `DrawerTab` extended, 2 modals, 2 state booleans, 'Links' tab panel, modal mounts

---

## Duplicate Prevention

Enforced at the Rust layer — not the UI layer:

- `create_nc_from_risk`: checks `risks.related_nc_id IS NOT NULL` → returns error
- `create_capa_from_risk`: checks `risks.related_capa_id IS NOT NULL` → returns error
- `create_nc_from_complaint`: checks `complaints.related_nc_id IS NOT NULL` → returns error
- `create_capa_from_complaint`: checks `complaints.related_capa_id IS NOT NULL` → returns error

The UI also hides action buttons once a link is present (complementary, not relied upon for safety).

---

## Auto-Number Generation

Generated using the same pattern as all other modules:

```
{PREFIX}-{YYYY}-{NNNN}
```

Where:
- `PREFIX` comes from `settings` table (`nc_prefix` / `capa_prefix`), defaulting to `NC` / `CAPA`
- `YYYY` is `strftime('%Y', 'now')`
- `NNNN` is `COUNT(*) + 1` for the prefix+year pattern (not gapless, consistent with existing modules)

---

## Activity Logging

All 4 commands write 2 activity_log rows per invocation:

| Module | Record | Action | Description |
|---|---|---|---|
| `risk` | source risk | `NC_CREATED` | "Non-Conformity {NC-number} created from this Risk" |
| `nc` | new NC | `CREATED` | "NC {NC-number} created from Risk {RISK-number}" |
| `risk` | source risk | `CAPA_CREATED` | "CAPA {CAPA-number} created from this Risk" |
| `capa` | new CAPA | `CREATED` | "CAPA {CAPA-number} created from Risk {RISK-number}" |
| `complaint` | source complaint | `NC_CREATED` | "Non-Conformity {NC-number} created from this Complaint" |
| `nc` | new NC | `CREATED` | "NC {NC-number} created from Complaint {COMP-number} ({customer})" |
| `complaint` | source complaint | `CAPA_CREATED` | "CAPA {CAPA-number} created from this Complaint" |
| `capa` | new CAPA | `CREATED` | "CAPA {CAPA-number} created from Complaint {COMP-number} ({customer})" |

---

## Validation Results

| Check | Result |
|---|---|
| `npm.cmd run build` (TypeScript + Vite) | ✓ Clean — 0 errors, 0 warnings |
| `npm.cmd run tauri dev` (Rust compile) | ✓ Compiled in 9.77s, app launched |
| Migration 006 registered in init.rs | ✓ |
| 4 commands exported in mod.rs | ✓ |
| 4 commands registered in lib.rs generate_handler![] | ✓ |
| No duplicate imports in lib.rs | ✓ (duplicate removed) |

---

## Total Command Count

| Phase | Commands Added | Running Total |
|---|---|---|
| 1–7 | 69 | 69 |
| 8 | +16 | 85 |
| 8B | +4 | **89** |

---

## Files Modified

| File | Change |
|---|---|
| `src-tauri/src/db/sql/006_phase8b_cross_module_links.sql` | **Created** — migration SQL |
| `src-tauri/src/db/init.rs` | Added MIGRATION_006 constant and Migration entry |
| `src-tauri/src/commands/non_conformities.rs` | Added `"RISK"` to `validate_nc_source()` |
| `src-tauri/src/commands/risks.rs` | 4 new fields on struct; expanded RISK_SQL; updated map_risk_row; 2 new commands |
| `src-tauri/src/commands/complaints.rs` | 4 new fields on struct; expanded COMPLAINT_SQL; updated map_complaint_row; 2 new commands |
| `src-tauri/src/commands/mod.rs` | 4 new pub use exports |
| `src-tauri/src/lib.rs` | 4 new entries in use block and generate_handler![] |
| `src/types/risk.ts` | 4 new fields on RiskListItem |
| `src/types/complaint.ts` | 4 new fields on ComplaintListItem |
| `src/services/riskService.ts` | 2 new service methods |
| `src/services/complaintService.ts` | 2 new service methods |
| `src/pages/Risks.tsx` | 2 confirmation modals; 'links' DrawerTab; links panel; modal mounts |
| `src/pages/Complaints.tsx` | 2 confirmation modals; 'links' DrawerTab; links panel; modal mounts |
| `docs/CURRENT_PHASE.md` | Updated to Phase 8B |
| `docs/DEVELOPMENT_LOG.md` | Phase 8B entry added |
| `docs/CLAUDE_HANDOFF.md` | Updated command counts, migrations table, Phase 8B key facts |
| `docs/SECURITY_NOTES.md` | 4 new command rows in permission table |
| `PHASE_PLAN.md` | Phase 8B row added |

---

## Forbidden Actions Checklist

| Rule | Status |
|---|---|
| No commit | ✓ |
| No git add . | ✓ |
| No .env files touched | ✓ |
| No live external APIs | ✓ |
| No business data uploaded | ✓ |
| No cloud sync | ✓ |
| No multi-device mode | ✓ |
| No billing or payment | ✓ |
| No license activation logic | ✓ |
| No existing modules rewritten | ✓ |
| No existing functionality removed | ✓ |
| No tauri-plugin-sql JS API for business queries | ✓ (invoke only) |
| All DB ops via Rust Tauri commands with rusqlite params![] | ✓ |
| No existing files deleted without approval | ✓ |
| No UI polish outside workflow requirements | ✓ |
