# Phase Report: Phase 2 — SQLite and Local AppData Foundation

## Report Metadata

| Field | Value |
|---|---|
| Phase number | 2 |
| Phase name | SQLite and Local AppData Foundation |
| Date completed | 2026-06-14 |
| Reporter | Claude Code (claude-sonnet-4-6) |
| Session type | Source code — database infrastructure only |

---

## 1. Phase Name

Phase 2 — SQLite and Local AppData Foundation

---

## 2. Files Created

### Rust Backend (new)

| File | Description |
|---|---|
| `src-tauri/src/storage/mod.rs` | AppData path resolver, directory creator, placeholder file writer |
| `src-tauri/src/db/mod.rs` | Database module public interface |
| `src-tauri/src/db/init.rs` | SQLite initialization, WAL/FK PRAGMAs, migration runner |
| `src-tauri/src/db/sql/001_initial_schema.sql` | Full initial schema SQL (all 13 tables) |
| `src-tauri/src/commands/mod.rs` | Commands module public interface |
| `src-tauri/src/commands/storage.rs` | Two Tauri commands: `initialize_app_storage`, `get_app_storage_status` |

### Frontend (new)

| File | Description |
|---|---|
| `src/types/appStorage.ts` | TypeScript interface `AppStorageStatus` |
| `src/services/appStorageService.ts` | `initializeAppStorage()` and `getAppStorageStatus()` wrapping Tauri invoke |

---

## 3. Files Modified

| File | Changes |
|---|---|
| `src-tauri/Cargo.toml` | Added `rusqlite = { version = "0.32", features = ["bundled"] }` and `tauri-plugin-sql = "2"` |
| `src-tauri/src/lib.rs` | Registered `db`, `storage`, `commands` modules; registered `tauri_plugin_sql` plugin; wired up `generate_handler!` |
| `src/App.tsx` | Added `useEffect` to call `initializeAppStorage()` on startup |
| `src/pages/Settings.tsx` | Added System Storage Status panel (reads from `get_app_storage_status`) |
| `package.json` / `package-lock.json` | Added `@tauri-apps/plugin-sql` |

---

## 4. Source Code Changed

**Yes.** Rust backend and React frontend both modified.

---

## 5. Database Changed

**Yes.** Database created for the first time.

---

## 6. Database Location Strategy

The database is stored at the OS AppData (roaming) path resolved from the Windows `APPDATA` environment variable:

```
%APPDATA%\QMSDesktop\data.db
C:\Users\roaas\AppData\Roaming\QMSDesktop\data.db  (confirmed on this machine)
```

**Why `%APPDATA%` and not Tauri's `app_local_data_dir()`:**  
The architecture documentation specified `%APPDATA%\QMSDesktop\`. Using `std::env::var("APPDATA")` directly gives exact control over the path, matching the documentation. QMS Desktop is a Windows-only product so this is unconditionally safe.

**Why rusqlite instead of tauri-plugin-sql for the Rust init layer:**  
`tauri-plugin-sql` resolves its database path internally to `app_local_data_dir()` (`%LOCALAPPDATA%`) which does not match the documented `%APPDATA%` location. Using rusqlite directly keeps the exact path under our control. `tauri-plugin-sql` is added as a dependency and registered as a plugin for use in Phase 3+ when JS-side SQL queries are needed.

---

## 7. AppData Folders Created

All folders confirmed created after launch:

```
%APPDATA%\QMSDesktop\
├── data.db               114,688 bytes — SQLite format 3
├── settings.json         86 bytes — placeholder JSON
├── license.json          75 bytes — placeholder JSON
├── uploads\
│   ├── audits\
│   ├── capa\
│   ├── complaints\
│   ├── documents\
│   ├── nc\
│   └── risks\
└── backups\
```

---

## 8. Tables and Migrations Created

**Migration tracking table:**
```sql
schema_migrations (version TEXT PK, description TEXT, applied_at TEXT)
```

**Migration 001 `initial_schema` applied — 13 tables created:**

| Table | Description |
|---|---|
| `settings` | Key-value app configuration; 4 default keys inserted |
| `users` | Local user accounts (passwords stored as hashes, Phase 3) |
| `documents` | Controlled documents with status workflow |
| `document_revisions` | Document version history |
| `risks` | Risk register with computed `risk_score` column (severity × likelihood) |
| `complaints` | Customer complaints with customer_name + customer_id |
| `audits` | Audit records |
| `audit_findings` | Sub-records per audit (NC / OFI / Observation / Positive) |
| `non_conformities` | Non-conformities linked to source records |
| `capas` | Corrective and Preventive Actions |
| `attachments` | File attachment metadata (files stored on disk) |
| `activity_log` | Chronological activity trail per module record |
| `document_links` | Many-to-many links between documents and module records |

**Migration runner behavior:**
- Checks `schema_migrations` for each version before running
- If already applied → skips (idempotent re-launch confirmed)
- Records version, description, and `datetime('now')` after each migration

---

## 9. Tauri Commands Added

| Command | Access | Description |
|---|---|---|
| `initialize_app_storage` | Frontend → Rust | Creates all dirs and files, opens SQLite, runs migrations, returns `AppStorageStatus` |
| `get_app_storage_status` | Frontend → Rust | Returns current status (no mutations) |

**`AppStorageStatus` response fields:**
```typescript
{
  storage_dir: string;          // absolute path to QMSDesktop/
  storage_initialized: boolean; // root dir exists
  database_initialized: boolean;// data.db exists
  uploads_initialized: boolean; // all 6 upload subdirs exist
  migrations_applied: string[]; // ["001", ...]
  settings_file_exists: boolean;
  license_file_exists: boolean;
}
```

---

## 10. Security Changes

| Item | Detail |
|---|---|
| Parameterized SQL only | All migration queries use `rusqlite::params![]`; no string concatenation |
| WAL mode enabled | `PRAGMA journal_mode = WAL` — better write concurrency and crash safety |
| Foreign keys enforced | `PRAGMA foreign_keys = ON` set on every connection |
| No secrets logged | Storage path returned in status response for developer inspection; no sensitive data exposed |
| No user data in status | `AppStorageStatus` contains only boolean flags, path, and migration versions |
| Placeholder files are safe | `settings.json` and `license.json` contain no sensitive data at this stage |
| No SQL from JS yet | `tauri-plugin-sql` registered but no capabilities configured; frontend cannot execute raw SQL |

---

## 11. Build Result

| Step | Result |
|---|---|
| `npm run build` (tsc + vite) | SUCCESS — 1,605 modules, 0 TypeScript errors, 195.78 kB JS |
| `cargo` compile (tauri dev) | SUCCESS — 414 packages, 6.19s (incremental) |

---

## 12. Tauri Dev Result

| Check | Result |
|---|---|
| `npm run tauri dev` | SUCCESS — window opened |
| `%APPDATA%\QMSDesktop\` created | YES |
| `data.db` created | YES — 114,688 bytes, valid SQLite format 3 |
| `uploads\documents\` created | YES |
| `uploads\capa\` created | YES |
| `uploads\risks\` created | YES |
| `uploads\complaints\` created | YES |
| `uploads\audits\` created | YES |
| `uploads\nc\` created | YES |
| `backups\` created | YES |
| `settings.json` created | YES |
| `license.json` created | YES |
| Migration 001 applied | YES (confirmed by schema_migrations record) |
| Re-launch skips migration | YES (idempotent: already_applied check passes) |

---

## 13. Known Issues

| Issue | Severity | Notes |
|---|---|---|
| `tauri-plugin-sql` path mismatch | LOW (Phase 3 concern) | Plugin resolves DB to `%LOCALAPPDATA%\com.qmsdesktop.app`; Phase 3 will use custom Rust commands for all SQL queries, bypassing this. |
| No migration table displayed in Settings status if DB not yet initialized | LOW | `get_app_storage_status` correctly returns empty list; `initializeAppStorage` is called first from `App.tsx` so this race is not visible in practice |
| 3 esbuild npm audit findings (pre-existing) | LOW | Dev tooling only, not in shipped app |

---

## 14. Next Recommended Phase

**Phase 3 — Settings + Users / Auth**

Prerequisites (all met):
- [x] SQLite database initialized at `%APPDATA%\QMSDesktop\data.db`
- [x] All tables created via migration 001
- [x] `users` table exists (no rows yet — first Admin user created in Phase 3)
- [x] `settings` table exists with 4 default rows

Phase 3 deliverables:
- Login page (username + password)
- First-launch wizard (creates Admin account)
- Password hashing via Rust backend (Argon2 or bcrypt)
- Session management via Zustand `authStore`
- Settings page — company name, logo, date format (CRUD)
- Users page — list, create, edit, deactivate (Admin only)
- Protected routes — redirect to login if not authenticated

---

## 15. Confirmation: No Forbidden Actions

| Check | Result |
|---|---|
| `.env` files were not touched | CONFIRMED — no .env files exist |
| No secrets were printed or logged | CONFIRMED |
| No live external APIs were connected | CONFIRMED |
| No business data was uploaded anywhere | CONFIRMED |
| No external messages were sent | CONFIRMED |
| No business CRUD was implemented | CONFIRMED — tables exist but no data operations |
| No license activation logic was implemented | CONFIRMED — license.json is a placeholder only |
| No commit was created | CONFIRMED |
| No `git add .` was run | CONFIRMED |
| No existing files were deleted | CONFIRMED |
| No cloud sync was implemented | CONFIRMED |
| No multi-device mode was implemented | CONFIRMED |
| No billing / payment was implemented | CONFIRMED |
| No auth / login UI was implemented | CONFIRMED — Phase 3 |
| No full business CRUD screens built | CONFIRMED — tables only, no forms |

---

## Summary

Phase 2 established the complete local SQLite + AppData foundation. The database is created
automatically at `%APPDATA%\QMSDesktop\data.db` on first launch. All 13 QMS tables are
created by migration 001. The AppData directory tree (uploads/, backups/, settings.json,
license.json) is created and verified. Two safe Tauri commands expose initialization and
status to the frontend. The Settings page shows a live system status panel. The build is
clean with zero TypeScript errors and the full Tauri dev window opens successfully.
