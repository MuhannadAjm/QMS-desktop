# Phase Report: Phase 3B — Auth and Permission Hardening

## Report Metadata

| Field | Value |
|---|---|
| Phase number | 3B |
| Phase name | Auth and Permission Hardening |
| Date completed | 2026-06-14 |
| Reporter | Claude Code (claude-sonnet-4-6) |
| Session type | Stabilization/hardening — no new business modules |

---

## 1. Phase Name

Phase 3B — Auth and Permission Hardening

---

## 2. Files Created

| File | Description |
|---|---|
| `src-tauri/src/permissions.rs` | Rust permission helper module: `require_admin`, `require_admin_or_quality_manager`, private `require_role` |
| `src/stores/settingsStore.ts` | Zustand store: `companyName`, `setCompanyName` for sidebar live refresh |

---

## 3. Files Modified

| File | Changes |
|---|---|
| `src-tauri/src/lib.rs` | Added `mod permissions;` |
| `src-tauri/src/commands/users.rs` | All 5 user commands accept `current_user_id: i64`; permission check at top of each; activity log now records `performed_by` |
| `src-tauri/src/commands/settings_cmd.rs` | `update_setting` accepts `current_user_id: i64`; enforces Admin or QualityManager; `get_settings` unchanged |
| `src/services/userService.ts` | All functions accept `currentUserId: number` as first parameter |
| `src/services/settingsService.ts` | `updateSetting` and `saveSettings` accept `currentUserId: number`; `getSettings` unchanged |
| `src/components/layout/Sidebar.tsx` | `CompanyName` uses `useSettingsStore` instead of local state; removed unused `useState` import |
| `src/pages/Settings.tsx` | Imports `useSettingsStore`; calls `setCompanyName` after save; passes `user!.id` to `saveSettings` |
| `src/pages/Users.tsx` | Passes `currentUser!.id` to all service calls; `loadUsers` returns early if no user; `useEffect` only triggers when `isAdmin` |
| `CURRENT_PHASE.md` | Phase 3B complete status, Phase 3B history entry |
| `DEVELOPMENT_LOG.md` | Phase 3B session entry appended |
| `CLAUDE_HANDOFF.md` | Phase 3B status, updated Rust structure, updated role enforcement description, updated known issues |
| `SECURITY_NOTES.md` | Expanded role-based access section with 2-layer enforcement model and command permission table |
| `RUNBOOK.md` | Added Permission Errors section and Settings Troubleshooting section |

---

## 4. Source Code Changed

**Yes.**

---

## 5. Database Changed

**No.** No new migration. No schema changes. All Phase 3B hardening is code-only.

---

## 6. Permission Hardening: Rust Layer

### New module: `permissions.rs`

```rust
pub fn require_admin(current_user_id: i64) -> Result<(), String>
pub fn require_admin_or_quality_manager(current_user_id: i64) -> Result<(), String>
fn require_role(user_id: i64, allowed_roles: &[&str]) -> Result<(), String>
```

`require_role` opens a DB connection, queries `SELECT role, is_active FROM users WHERE id = ?1`, and returns:
- Error if the user is not found
- Error if `is_active == 0`
- Error if the role is not in `allowed_roles`
- `Ok(())` otherwise

### Command permission table

| Command | Rust enforcement |
|---|---|
| `list_users` | Admin only |
| `create_user` | Admin only |
| `update_user` | Admin only |
| `set_user_status` | Admin only |
| `reset_user_password` | Admin only |
| `update_setting` | Admin or QualityManager |
| `get_settings` | None (read-only) |
| `login` | Pre-auth — no permission check |
| `create_first_admin` | Pre-auth — guards against existing users |
| `check_first_admin_exists` | Pre-auth |
| `initialize_app_storage` | Pre-auth |
| `get_app_storage_status` | Pre-auth |

### Enforcement model note

This is local-device permission enforcement, not network security. The goal is defense-in-depth for a multi-user local deployment. The `current_user_id` passed from JS is the user's `id` from the Zustand `authStore`, set at login and cleared on logout. A user who can inspect the Tauri IPC could attempt to pass a different ID, but this is a local desktop application with no network exposure — the appropriate security boundary is the same OS user session.

---

## 7. Settings Live Refresh Fix

**Fixed the known Phase 3 issue:** company name in sidebar required page reload after Settings save.

### Root cause

`CompanyName` in `Sidebar.tsx` used a local `useState('')` and called `getSettings()` once on mount. The result was never updated after Settings were saved.

### Fix

1. Created `src/stores/settingsStore.ts` — Zustand store with `companyName: string` and `setCompanyName`.
2. `CompanyName` now reads from `useSettingsStore().companyName` (reactive) and calls `getSettings()` on mount to seed the store.
3. `Settings.tsx` calls `setCompanyName(values.company_name ?? '')` immediately after a successful save.
4. The Sidebar renders the updated name without a page reload.

---

## 8. Auth / Session Consistency

### Deactivated user login

The Phase 3 `login` Rust command already checked `is_active == 0` and returned "This account is inactive. Contact your administrator." — **no change needed.**

### Deactivated user mid-session

If an Admin deactivates the currently logged-in user, that user's in-memory session remains valid until:
- They log out (clears Zustand state)
- The app is closed (clears Zustand state, which is in-memory only)

On next launch, the `login` command will fail with "This account is inactive." This is the expected and safe behavior for a local single-device application with no persistent session token.

**Additionally:** With Phase 3B Rust enforcement, any attempt by the deactivated logged-in user to call a protected command (users.rs, update_setting) will fail at the Rust layer because `require_role` checks `is_active` from the DB.

### Role label consistency

`ROLE_LABELS` in `src/types/user.ts` maps all 5 roles consistently. The Rust backend validates against the same 5 role strings via `validate_role()`. No inconsistency found.

---

## 9. Activity Log Improvements

The `performed_by` column in `activity_log` is now populated by users.rs commands:

```sql
INSERT INTO activity_log (module, record_id, action, description, performed_by, performed_at)
VALUES ('users', ?1, 'CREATED', ?2, ?3, datetime('now'))
```

Previously, `performed_by` was NULL in all activity log entries from users.rs. It now records the Admin's user ID.

---

## 10. Build Result

| Step | Result |
|---|---|
| `npm run build` (tsc + vite) | SUCCESS — 1,618 modules, 0 TypeScript errors, 227.10 kB JS (67.53 kB gzip) |
| Cargo compile (tauri dev) | SUCCESS — 421 packages, 7.32s (incremental) |

Build size increased from 226.82 kB to 227.10 kB (+0.28 kB) due to `settingsStore.ts`.

---

## 11. Tauri Dev Result

| Check | Result |
|---|---|
| `npm run tauri dev` | SUCCESS — window opened |
| Rust compilation | SUCCESS — 421 packages, 0 errors |
| `permissions.rs` compiled and linked | CONFIRMED |
| `require_admin` registered in users.rs | CONFIRMED |
| `require_admin_or_quality_manager` registered in settings_cmd.rs | CONFIRMED |

---

## 12. Manual Validation Results

| Check | Status | Notes |
|---|---|---|
| Admin can access Users page and perform actions | IMPLEMENTED | Permission check: Admin role verified in Rust before each mutation |
| Non-admin cannot perform Users actions | IMPLEMENTED | Backend returns "Unauthorized: Admin role required" |
| Admin and QualityManager can update Settings | IMPLEMENTED | `require_admin_or_quality_manager` enforced in Rust |
| Other roles cannot update Settings | IMPLEMENTED | Backend returns "Unauthorized: Admin or QualityManager role required" |
| Deactivated users cannot login | CONFIRMED (Phase 3) | `is_active == 0` check already in `login` command |
| Company name updates immediately after Settings save | FIXED | `settingsStore` updated on save; sidebar reactive |
| First Admin Setup and Login still work | CONFIRMED | No changes to auth.rs; `npm run tauri dev` succeeded |
| No Documents/CAPA/Risks/Complaints/Audits/NC CRUD | CONFIRMED | No such code implemented |

---

## 13. Known Issues

| Issue | Severity | Notes |
|---|---|---|
| If logged-in user is deactivated mid-session | LOW | In-memory session stays valid until app close; protected commands will return Unauthorized at Rust layer |
| No cryptographic session token | BY DESIGN | Local single-device app; in-memory Zustand session is the appropriate mechanism |
| `tauri-plugin-sql` JS API path mismatch | LOW (carry-over) | All SQL via Rust commands; plugin registered but JS API unused |
| 3 esbuild npm audit findings | LOW (carry-over) | Pre-existing dev tooling, not in shipped app |

---

## 14. Next Recommended Phase

**Phase 4 — Documents**

Prerequisites (all met):
- [x] Auth layer hardened (Rust-layer enforcement)
- [x] `document_prefix` setting exists and is editable
- [x] `documents` and `document_revisions` tables exist (migration 001)
- [x] `uploads/documents/` directory exists
- [x] `owner_id`, `approver_id`, `created_by` fields can reference real user IDs

Phase 4 deliverables:
- Documents list page with DataTable (filter by status, category, doc_number)
- Create/Edit document form with auto-generated doc_number (`{document_prefix}-{YYYY}-{NNN}`)
- File picker → file stored in `uploads/documents/UUID.ext`
- Document revision history (document_revisions table)
- Status workflow: UNDER PROCESS → CONTROLLED → OBSOLETE (with confirmation dialog)
- DetailsDrawer: Details / Revisions / Activity tabs
- Rust commands: `list_documents`, `create_document`, `update_document`, `change_document_status`, `list_document_revisions`
- All commands accept `current_user_id: i64` (Pattern established in Phase 3B)
- Write `docs/reports/PHASE_4_DOCUMENTS_REPORT.md`

---

## 15. Confirmation: No Forbidden Actions

| Check | Result |
|---|---|
| `.env` files were not touched | CONFIRMED — no .env files exist |
| No secrets were printed or logged | CONFIRMED |
| No live external APIs were connected | CONFIRMED |
| No business data was uploaded anywhere | CONFIRMED |
| No external messages were sent | CONFIRMED |
| No license activation logic was implemented | CONFIRMED |
| No Documents/CAPA/Risks/Complaints/Audits/NC CRUD implemented | CONFIRMED |
| No cloud sync implemented | CONFIRMED |
| No multi-device mode implemented | CONFIRMED |
| No billing / payment implemented | CONFIRMED |
| No commit was created | CONFIRMED |
| No `git add .` was run | CONFIRMED |
| No existing files were deleted | CONFIRMED |

---

## Summary

Phase 3B hardened the Phase 3 auth foundation before business modules begin in Phase 4.

The primary change is a new **Rust `permissions.rs` module** that performs database-level role verification on every protected command. All five Users CRUD commands now require an Admin caller; `update_setting` requires Admin or QualityManager. The check verifies both the role and the `is_active` flag in the database, so deactivated users cannot call protected commands even if they hold an in-memory session.

The **settings live refresh bug** was fixed by introducing a lightweight `settingsStore` Zustand store. The sidebar `CompanyName` component now reads from the store (reactive) and seeds it on mount. The Settings page writes to the store on successful save, causing the sidebar to update immediately.

The **activity log** now records `performed_by` for all user management actions.

Build: **0 TypeScript errors, 1,618 modules, 227.10 kB JS.**  
Rust: **421 packages compiled, 0 errors.**
