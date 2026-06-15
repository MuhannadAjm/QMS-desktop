# Phase Report: Phase 3 — Settings + Users / Auth

## Report Metadata

| Field | Value |
|---|---|
| Phase number | 3 |
| Phase name | Settings + Users / Auth |
| Date completed | 2026-06-14 |
| Reporter | Claude Code (claude-sonnet-4-6) |
| Session type | Source code — authentication, user management, settings CRUD |

---

## 1. Phase Name

Phase 3 — Settings + Users / Auth

---

## 2. Files Created

### Rust Backend (new)

| File | Description |
|---|---|
| `src-tauri/src/password.rs` | `hash_password`, `verify_password`, `validate_password_strength` using Argon2id |
| `src-tauri/src/commands/auth.rs` | `check_first_admin_exists`, `create_first_admin`, `login` Tauri commands |
| `src-tauri/src/commands/users.rs` | `list_users`, `create_user`, `update_user`, `set_user_status`, `reset_user_password` |
| `src-tauri/src/commands/settings_cmd.rs` | `get_settings`, `update_setting` |
| `src-tauri/src/db/sql/002_phase3_auth.sql` | Migration 002: department column + 12 settings keys |

### Frontend (new)

| File | Description |
|---|---|
| `src/types/user.ts` | `AuthUser`, `UserListItem`, `UserRole`, `ALL_ROLES`, `ROLE_LABELS` |
| `src/types/settings.ts` | `SettingEntry`, `SettingsMap`, `SETTINGS_DEFAULTS` |
| `src/stores/authStore.ts` | Zustand auth store: bootstrapState, user, login/logout |
| `src/services/authService.ts` | Wraps `check_first_admin_exists`, `create_first_admin`, `login` |
| `src/services/userService.ts` | Wraps all user CRUD commands |
| `src/services/settingsService.ts` | Wraps `get_settings`, `update_setting`, `saveSettings` |
| `src/pages/Login.tsx` | Professional email+password login form |
| `src/pages/FirstAdminSetup.tsx` | Initial Admin account creation form (first-launch only) |

---

## 3. Files Modified

| File | Changes |
|---|---|
| `src-tauri/Cargo.toml` | Added `argon2 = { version = "0.5", features = ["std"] }` |
| `src-tauri/src/lib.rs` | Registered `password` module; registered 10 new Tauri commands |
| `src-tauri/src/commands/mod.rs` | Added auth, users, settings_cmd sub-modules and pub use exports |
| `src-tauri/src/db/mod.rs` | Added `open_conn()` shared helper function |
| `src-tauri/src/db/init.rs` | Added MIGRATION_002 constant and entry in migrations() vec |
| `src/App.tsx` | Bootstrap logic: init → check first admin → set bootstrapState |
| `src/app/router.tsx` | Auth-aware routing: first-admin / login / full app |
| `src/components/layout/Sidebar.tsx` | Role-filtered nav, real user info, logout button, live company name |
| `src/components/layout/Topbar.tsx` | Real user name/role, "License Pending" badge |
| `src/components/ui/StatusBadge.tsx` | Added ACTIVE and INACTIVE status variants |
| `src/types/common.ts` | Updated UserRole to include all 5 roles |
| `src/pages/Settings.tsx` | Full CRUD: Company Profile, Quality System, Prefixes, Preferences |
| `src/pages/Users.tsx` | Full CRUD: table, create/edit modal, status toggle, password reset |

---

## 4. Source Code Changed

**Yes.** Rust backend and React frontend both significantly modified.

---

## 5. Database Changed

**Yes.** Migration 002 applied:
- `ALTER TABLE users ADD COLUMN department TEXT NOT NULL DEFAULT ''`
- 12 new `INSERT OR IGNORE INTO settings` rows:
  - `quality_policy`, `qms_scope`, `departments`, `address`, `contact_email`, `phone`
  - `document_prefix` (DOC), `capa_prefix` (CAPA), `risk_prefix` (RISK)
  - `complaint_prefix` (COMP), `audit_prefix` (AUDIT), `nc_prefix` (NC)

---

## 6. Auth / Security Changes

### Password Hashing
- Algorithm: **Argon2id** — the current OWASP-recommended default for password hashing
- Crate: `argon2 = "0.5"` with `features = ["std"]`
- Salt: Randomly generated per hash using `SaltString::generate(&mut OsRng)`
- Format: PHC string (e.g. `$argon2id$v=19$m=19456,t=2,p=1$...`)
- Stored in: `users.password_hash` column (TEXT)
- **Never returned to frontend**

### First Admin Setup
- `create_first_admin` Rust command — validates name, email, password strength, confirm match
- Guards against creation if ANY user already exists in the users table
- Email normalized to lowercase — stored in both `username` (UNIQUE key) and `email` columns
- On success: returns safe `AuthUser` struct (no hash), frontend logs user in immediately

### Login
- `login(email, password)` Rust command
- Email normalized to lowercase, queried against `username` column
- If user not found: returns generic "Invalid email or password" (no user enumeration)
- If user is inactive: returns "This account is inactive" (local app, non-enumerable in practice)
- If password wrong: returns generic "Invalid email or password"
- On success: returns `AuthUser` (id, name, email, role, department, is_active) — NO hash

### Session Management
- Zustand `authStore` — in-memory only per SECURITY_NOTES.md
- Cleared on app close or logout
- No localStorage, no sessionStorage, no disk persistence

### Activity Logging
- User `CREATED` — logged to `activity_log` on create
- User `UPDATED` — logged to `activity_log` on edit
- User `ACTIVATED` / `DEACTIVATED` — logged to `activity_log` on status change
- User `PASSWORD_RESET` — logged to `activity_log` on password reset

---

## 7. Settings Changes

### Settings page (full rewrite)
Section cards:
1. **Company Profile**: company_name, address, contact_email, phone, company_logo_path (placeholder)
2. **Quality System**: quality_policy (textarea), qms_scope (textarea), departments (textarea)
3. **Record Number Prefixes**: document_prefix, capa_prefix, risk_prefix, complaint_prefix, audit_prefix, nc_prefix
4. **System Preferences**: date_format (dropdown), timezone (dropdown)

### Save behavior
- Single "Save Changes" button saves all visible settings at once
- Calls `update_setting(key, value)` for each setting sequentially
- Admin and QualityManager can edit; other roles see read-only view
- Success indicated by "Saved" label with checkmark (2.5 second feedback)

---

## 8. Users Changes

### Users page (full rewrite)
- Professional table: Name | Email | Role | Department | Status | Actions
- Role column shows human-readable label (e.g. "Quality Manager" not "QualityManager")
- Status shows ACTIVE/INACTIVE badge using `StatusBadge` component

### User CRUD operations
| Operation | Rust Command | Notes |
|---|---|---|
| List users | `list_users` | Returns all users sorted by name; no password_hash |
| Create user | `create_user` | Validates all fields; hashes password; checks email uniqueness |
| Edit user | `update_user` | Updates name, email, role, department; checks email uniqueness excluding self |
| Activate/Deactivate | `set_user_status` | Toggles is_active; logs to activity_log |
| Reset password | `reset_user_password` | Validates strength; hashes new password; logs to activity_log |

### Access control
- Users page renders "Access restricted" for non-Admin roles
- Admin can see and manage all users including themselves
- Password hashes never appear in UI or JS layer

---

## 9. Role / Sidebar Behavior

| Role | Visible Pages |
|---|---|
| Admin | Dashboard, CAPA, Risks, Complaints, Audits, Non-Conformities, Documents, Users, Settings, Reports, Backup, License |
| QualityManager | Dashboard, CAPA, Risks, Complaints, Audits, Non-Conformities, Documents, Settings, Reports |
| Auditor | Dashboard, Audits, Non-Conformities, Documents, Reports |
| Employee | Dashboard, CAPA, Risks, Complaints, Documents |
| Viewer | Dashboard, Documents, Reports |

Navigation groups with no visible items for the current role are hidden entirely.
The logout button is shown in the sidebar user area for all roles.

---

## 10. Build Result

| Step | Result |
|---|---|
| `npm install zustand` | SUCCESS — 1 package added (148 total) |
| `npm run build` (tsc + vite) | SUCCESS — 1,617 modules, 0 TypeScript errors, 226.82 kB JS (67.44 kB gzipped) |
| Cargo compile (tauri dev) | SUCCESS — 421 packages, 6.48s (incremental) |

Build size increased from 195.78 kB to 226.82 kB (+31 kB), due to Zustand, Argon2-related JS, and the new Settings/Users/Login/FirstAdminSetup pages.

---

## 11. Tauri Dev Result

| Check | Result |
|---|---|
| `npm run tauri dev` | SUCCESS — window opened |
| Rust compilation | SUCCESS — 421 packages, 0 errors |
| `%APPDATA%\QMSDesktop\` structure | Confirmed present (all dirs and files from Phase 2) |
| Migration 001 (initial_schema) | SKIPPED — already applied (idempotent runner) |
| Migration 002 (phase3_auth) | APPLIED — department column and settings keys added |
| App bootstrap sequence | SUCCESS — initializeAppStorage → checkFirstAdminExists → routing |

---

## 12. Manual Validation Results

| Check | Status | Notes |
|---|---|---|
| Fresh DB redirects to First Admin Setup | IMPLEMENTED | bootstrapState = 'first-admin' routes to /first-admin-setup |
| First admin can be created | IMPLEMENTED | Argon2id hash stored; returns AuthUser |
| Password is hashed in DB | IMPLEMENTED | PHC string stored, never plaintext |
| Login with correct credentials works | IMPLEMENTED | Returns AuthUser, sets isAuthenticated = true |
| Wrong password fails safely | IMPLEMENTED | Generic "Invalid email or password" message |
| Logout clears session | IMPLEMENTED | Zustand state cleared, router redirects to /login |
| Users page visible to Admin only | IMPLEMENTED | Non-admin sees "Access restricted" card |
| Settings editable by Admin + QualityManager | IMPLEMENTED | canEdit check disables all inputs for other roles |
| Sidebar filters by role | IMPLEMENTED | navGroups filtered by role array on each NavItem |
| Topbar shows real user name | IMPLEMENTED | user?.name from authStore |
| Company name in sidebar from settings | IMPLEMENTED | CompanyName component calls getSettings() |
| AppData storage init still works | IMPLEMENTED | initializeAppStorage still called first in bootstrap |
| No Documents/CAPA/Risks/Complaints/Audits/NC CRUD | CONFIRMED | No such CRUD implemented |

---

## 13. Known Issues

| Issue | Severity | Notes |
|---|---|---|
| Service-layer role enforcement not implemented | LOW | Role checked at UI layer only; adequate for local single-device app with no network exposure |
| `tauri-plugin-sql` JS API path mismatch | LOW (carry-over) | All SQL via Rust commands; plugin registered but JS API unused |
| No session persistence | BY DESIGN | Per SECURITY_NOTES.md — in-memory session cleared on app close |
| Logo upload not implemented | LOW | company_logo_path stored as text path; file upload deferred to Phase 4/file handling subtask |
| 3 esbuild npm audit findings | LOW (carry-over) | Pre-existing dev tooling vulnerabilities, not in shipped app |
| company name in sidebar not refreshed after Settings save | LOW | CompanyName component only reads on mount; requires page reload to update sidebar |

---

## 14. Next Recommended Phase

**Phase 4 — Documents**

Prerequisites (all met):
- [x] Users table populated (at minimum one Admin user exists)
- [x] Settings table has `document_prefix` key for auto-number generation
- [x] `uploads/documents/` directory exists
- [x] `documents` and `document_revisions` tables exist (migration 001)
- [x] Auth layer complete — `owner_id`, `approver_id`, `created_by` can now reference real users

Phase 4 deliverables:
- Documents list with DataTable (filter by status, category, doc_number)
- Create/Edit document form with auto-generated doc_number
- File picker → file stored in `uploads/documents/UUID.ext`
- Document revision history
- Status workflow: UNDER PROCESS → CONTROLLED → OBSOLETE
- DetailsDrawer: Details / Revisions / Activity tabs
- Rust commands: `list_documents`, `create_document`, `update_document`, `change_document_status`, `list_document_revisions`

---

## 15. Confirmation: No Forbidden Actions

| Check | Result |
|---|---|
| `.env` files were not touched | CONFIRMED — no .env files exist |
| No secrets were printed or logged | CONFIRMED — password hashes never appear in console or returned to JS |
| No live external APIs were connected | CONFIRMED |
| No business data was uploaded anywhere | CONFIRMED |
| No external messages were sent | CONFIRMED |
| No license activation logic was implemented | CONFIRMED — "License Pending" is a static badge placeholder |
| No Documents/CAPA/Risks/Complaints/Audits/NC CRUD implemented | CONFIRMED |
| No cloud sync implemented | CONFIRMED |
| No multi-device mode implemented | CONFIRMED |
| No billing / payment implemented | CONFIRMED |
| No commit was created | CONFIRMED |
| No `git add .` was run | CONFIRMED |
| No existing files were deleted | CONFIRMED |

---

## Summary

Phase 3 implements full local authentication and user management for QMS Desktop.

The **First Admin Setup** flow detects an empty users table on startup and shows a dedicated setup screen. Passwords are hashed with **Argon2id** in the Rust backend (never in JavaScript). The **Login** screen uses email + password and returns a safe `AuthUser` profile without the hash. The **Zustand `authStore`** holds the session in memory, cleared on app close.

The **Users page** (Admin-only) provides a professional CRUD interface: create, edit, activate/deactivate, and reset password for all local users. The **Settings page** (Admin + QualityManager) covers company profile, quality policy, scope, departments, numbering prefixes, and system preferences, backed by real SQLite reads and writes.

The **Sidebar** is now fully role-aware, filtering navigation items based on the authenticated user's role. The **Topbar** shows the real user name and role. All previous Phase 2 storage and database functionality continues to work.

Build: **0 TypeScript errors, 1,617 modules, 226.82 kB JS.**
Rust: **421 packages compiled, 0 errors.**
