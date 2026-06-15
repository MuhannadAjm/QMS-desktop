# Phase 11A — Report
# Auth, Users, Profile, and Menu Context Cleanup

**Date:** 2026-06-16  
**Phase:** 11A  
**Status:** Complete  
**Build:** TypeScript ✓ | Rust ✓ | MSI 3.51 MB | NSIS 2.12 MB

---

## 1. Files Modified

| File | Change |
|---|---|
| `src-tauri/src/db/init.rs` | Added migration 007, added `backfill_email_usernames()` post-migration function |
| `src-tauri/src/commands/auth.rs` | `AuthUser` gets `username` field; `create_first_admin` takes `username` + optional `email`; `login` uses `username` param |
| `src-tauri/src/commands/users.rs` | `UserListItem` gets `username`; `create_user` requires `username`, email optional; `update_user` no longer touches username |
| `src-tauri/src/commands/mod.rs` | Added `mod profile`; exported `update_own_profile`, `change_own_password` |
| `src-tauri/src/lib.rs` | Added `Listener` import; backup items start `enabled = false`; `listen("auth-changed")` handler toggles them; new commands registered |
| `src/types/user.ts` | Added `username: string` to `AuthUser` and `UserListItem` |
| `src/services/authService.ts` | Updated `loginUser` (username param), `createFirstAdmin` (username + email?); added `updateOwnProfile`, `changeOwnPassword` |
| `src/services/userService.ts` | Updated `createUser` (username, email optional), `updateUser` (no username, email optional) |
| `src/stores/authStore.ts` | Added `setUser(user)` action |
| `src/pages/Login.tsx` | Username field replaces email field |
| `src/pages/FirstAdminSetup.tsx` | Added username field (required); email marked optional |
| `src/pages/Users.tsx` | Username column in table; username field in create (required, editable); username in edit (read-only); email optional |
| `src/components/layout/Topbar.tsx` | Profile dropdown; Edit Profile modal; Change Password modal; Logout |
| `src/App.tsx` | `emit('auth-changed', isAuthenticated)` on login/logout; backup action guard in `MenuListener` |
| `docs/DEVELOPMENT_LOG.md` | Phase 11A entry added at top |
| `docs/CURRENT_PHASE.md` | Updated to Phase 11A complete |
| `docs/SECURITY_NOTES.md` | Added "Username and Auth Security (Phase 11A)" section |
| `PHASE_PLAN.md` | Phase 11A row added |

## 2. Files Created

| File | Description |
|---|---|
| `src-tauri/src/db/sql/007_phase11a_username.sql` | Migration marker (SELECT 1; — actual backfill is in Rust) |
| `src-tauri/src/commands/profile.rs` | `update_own_profile` and `change_own_password` Tauri commands |
| `docs/reports/PHASE_11A_AUTH_USERS_PROFILE_REPORT.md` | This report |

---

## 3. Database Migration

**Migration 007 applied:** Yes  
**SQL:** `SELECT 1;` — marker only (actual backfill logic is in Rust)  
**Rust backfill (`backfill_email_usernames`):** Runs after every migration pass. Finds all users where `username LIKE '%@%'`, extracts the local part before `@`, sanitizes to alphanumeric+underscore, deduplicates with `_2`, `_3` suffixes. Idempotent — only processes rows still containing `@`.

**Example:** A user with `username = 'admin@company.com'` becomes `username = 'admin'`. A second user `username = 'admin@other.org'` becomes `username = 'admin_2'`.

**No schema change needed** — the `username` column (TEXT NOT NULL UNIQUE) already existed in migration 001.

---

## 4. Username Login

**Implemented:** Yes  
- Login screen: "Email address" → "Username"; `type="email"` → `type="text"`; `autoComplete="username"`
- `login` Tauri command: parameter renamed from `email` to `username`
- SQL query: `WHERE username = ?1` (was already correct; now the frontend sends the right value)
- Error messages: "Invalid email or password" → "Invalid username or password"

---

## 5. Email Optional

**Implemented:** Yes  
- `create_first_admin`, `create_user`, `update_user`, `update_own_profile` all take `email: Option<String>`
- Empty email stored as empty string in SQLite
- No login path requires email
- Frontend: email fields labeled as `(optional)` where appropriate

---

## 6. Existing User Migration / Backfill

**Behavior:**
- Existing users that had `username = email` are backfilled on first app launch after Phase 11A install
- The backfill extracts the email-local-part, sanitizes special characters to `_`, and ensures uniqueness
- No users are deleted; no passwords are touched; no data is lost
- If backfill produces a duplicate (rare), `_2`, `_3`, … suffix applied
- After backfill, login with the new username (e.g., `admin` if email was `admin@company.com`)

---

## 7. First Admin Setup Changes

- **Added:** Username field (required) — labeled "Used for login · letters, digits, underscores · cannot be changed later"
- **Changed:** Email field marked `(optional)` — no longer required for setup
- **Field order:** Full name → Username → Email (optional) → Password → Confirm password
- **Validation:** Username regex `^[a-zA-Z][a-zA-Z0-9_]{0,63}$` enforced on frontend and backend

---

## 8. Login Screen Changes

| Before | After |
|---|---|
| Field label: "Email address" | Field label: "Username" |
| Input type: `email` | Input type: `text` |
| autoComplete: `email` | autoComplete: `username` |
| Placeholder: `you@company.com` | Placeholder: `your.username` |
| Error: "Email is required" | Error: "Username is required" |
| Error: "Invalid email or password" | Error: "Invalid username or password" |

---

## 9. Users Page Changes

**Create New User modal:**
- Added: Username field (required, editable) — shows note "Used for login · cannot be changed after creation"
- Changed: Email field is now optional
- Service call: `createUser(userId, name, username, email|null, role, dept, password)`

**Edit User modal:**
- Username: shown as read-only (gray background, `cursor-not-allowed`)
- Email: optional (was required)
- Role, Name, Department: editable as before
- Service call: `updateUser(userId, id, name, email|null, role, dept)` — username not passed

**Users table:**
- Added: Username column (`@username` in monospace, between Name and Role)
- Removed: Email column (replaced by Username column)

---

## 10. Profile Menu / Dialog Changes

The Topbar user area (avatar + name + role) is now a clickable button that opens a dropdown:

**Dropdown contents:**
- Header: Full name + `@username` (not editable here)
- Edit Profile button → opens Edit Profile modal
- Change Password button → opens Change Password modal
- Divider
- Log Out button (red text)

**Edit Profile modal:**
- Username: read-only, labeled "Username cannot be changed"
- Full Name: editable (required)
- Department: editable (optional)
- Email: editable (optional)
- On success: `setUser(updatedUser)` updates the auth store; topbar name refreshes immediately

**Change Password modal:**
- Current Password: required, with show/hide toggle
- New Password: required, with show/hide toggle, strength hint
- Confirm New Password: required, shares show/hide state with New Password
- On success: auto-closes after 1.2 s

---

## 11. Password Change Behavior

- Current password must be verified against stored Argon2id hash before new hash is written
- New password must meet strength requirements: min 8 chars, one uppercase, one digit (same as creation)
- New password confirmed (two-field check on frontend; match enforced on Rust side too)
- No password hash is ever returned to the frontend
- Wrong current password → "Current password is incorrect" error
- Admin reset-password path (Users page) unchanged — Admin can reset any user's password without knowing the old one

---

## 12. Menu Context Behavior When Logged Out

| State | Create Backup | Open Backup Folder | Exit |
|---|---|---|---|
| Logged out | **Disabled** (grayed in native menu) | **Disabled** | Available |
| Logged in | Enabled | Enabled | Available |

**Implementation:**
- Rust: `MenuItem::with_id(..., enabled: false, ...)` for both backup items at app startup
- Rust: `app.handle().listen("auth-changed", ...)` toggles `set_enabled(authenticated)` on both items
- Frontend: `emit('auth-changed', isAuthenticated)` fires whenever `isAuthenticated` changes in auth store
- Frontend: `MenuListener` also guards these actions — if somehow clicked, does nothing when not authenticated

---

## 13. Build Result

| Step | Result |
|---|---|
| `npm run build` (TypeScript + Vite) | ✓ 1640 modules, 2.16 s |
| `cargo check` (Rust) | ✓ 2.62 s incremental |
| `npm run tauri build` (release) | ✓ 1 m 44 s |
| MSI installer | ✓ 3.51 MB |
| NSIS installer | ✓ 2.12 MB |
| AppControl workaround | Applied — 72 build scripts copied |

---

## 14. MSI Copied Path

`D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase11a-auth-users-test.msi`

## 15. NSIS Copied Path

`D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase11a-auth-users-test-setup.exe`

---

## 16. Known Issues

| ID | Severity | Description | Status |
|---|---|---|---|
| BUG-03 | Medium | `tauri-plugin-sql` unused dependency in Cargo.toml | Deferred Phase 11B |
| BUG-04 | Medium | `DATABASE_SCHEMA.md` column name inaccuracies | Deferred Phase 11B |
| BUG-05 | Medium | `App.tsx` bootstrap catch routes to login on storage init failure | Deferred Phase 11B |
| BUG-06 | Medium | Reports page shows all 6 reports to all roles | Deferred Phase 11B |
| BUG-08 | Low | RSA public key in binary needs verification against Supabase private key | Before first commercial activation |
| BUG-09 | Low | `expires_at = ""` hides Expires row in License details | Deferred Phase 11B |
| MENU-01 | Low | File → Create Backup navigates to /backup page, does not directly trigger command | By design — avoids calling backup without auth context |
| MENU-02 | Low | Zoom uses CSS `documentElement.style.zoom` (Chromium non-standard) | Acceptable for menu utility |

**New in Phase 11A:**
- **AUTH-01 (Low):** Backfilled usernames are derived from the email prefix. If the prefix is very short or purely numeric after sanitization, a fallback `user_{id}` is used. Admins should verify usernames after upgrade from Phase 10B.
- **AUTH-02 (Low):** The profile dropdown in Topbar does not have keyboard navigation (no arrow key or Escape close). Acceptable for initial implementation.

---

## 17. Confirmations

- [x] No AppData deletion logic added or changed
- [x] No QMS business data uploaded
- [x] No Supabase licensing functions changed
- [x] No broad UI redesign
- [x] No Reports feature work (BUG-06 still deferred)
- [x] No Backup/Restore feature implementation (menu only guards)
- [x] No Installer/EULA/Icon work
- [x] No git commit created
- [x] No database schema changed (username column existed from migration 001)
- [x] No payment/billing/cloud sync touched
- [x] No private key printed or logged
- [x] No service role key in desktop binary
- [x] Password hashing remains Argon2id throughout
- [x] `change_own_password` requires current password verification
- [x] Username immutable after creation (backend enforces — `update_user` does not update username column)
