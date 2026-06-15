# QMS Desktop — Runbook

Developer operations reference for QMS Desktop.

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 20 LTS or later | Frontend build and package management |
| Rust | stable (latest) | Tauri backend compilation |
| Cargo | (bundled with Rust) | Rust package manager |
| Tauri CLI | 2.x | `cargo install tauri-cli` |
| npm | 9+ | Dependency management |
| Windows SDK | Latest | Windows build target |

Install Rust: https://rustup.rs  
Install Node.js: https://nodejs.org  
Install Tauri prerequisites: https://tauri.app/start/prerequisites/

### App Icons — Development Placeholders

`src-tauri/icons/` contains placeholder development icons (navy blue #1E3A5F with white "Q").
All 5 paths required by `tauri.conf.json` are present:

| File | Size | Notes |
|---|---|---|
| `icons/32x32.png` | 32×32 | Dev placeholder |
| `icons/128x128.png` | 128×128 | Dev placeholder |
| `icons/128x128@2x.png` | 256×256 | Dev placeholder (Retina) |
| `icons/icon.ico` | 32×32 32bpp | Dev placeholder (Windows taskbar) |
| `icons/icon.icns` | 8-byte header | Dev placeholder (macOS — not needed on Windows) |

**Action required before Phase 9 (installer):** Replace all placeholder icons with the
final production brand icon at all required sizes. Use a real icon design tool
(e.g. Figma → exported PNGs → converted to ICO/ICNS).

---

### RC.EXE (Windows Resource Compiler) — REQUIRED for tauri dev

If `npm run tauri dev` fails with:
```
Are you sure you have RC.EXE in your $PATH or ${RC_$TARGET} or $RC is set?
```
The Windows Resource Compiler (`rc.exe`) is installed but not in PATH.
It exists at:
```
C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\rc.exe
```

**Fix (per terminal session):**
```powershell
$env:RC = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\rc.exe"
npm run tauri dev
```

**Fix (permanent — add to PATH):**
```
Windows Settings → System → Advanced system settings → Environment Variables
→ System Variables → Path → Edit → New →
  C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64
```
After adding to PATH, restart the terminal.

---

### Windows WDAC / Developer Mode — REQUIRED

If `npm run tauri dev` fails with **"An Application Control policy has blocked this file"** (OS error 4551),
Windows Defender Application Control (WDAC) is blocking unsigned compiled Rust build scripts.

**Fix: Enable Developer Mode**
```
Windows Settings → System → For developers → Developer Mode → ON
```
After enabling, restart your terminal and retry. No code changes are needed.

This machine has 8 active WDAC `.cip` policies enforced (confirmed 2026-06-14). Developer Mode
is the standard Microsoft-recommended exemption for developer build tools on Windows 11.

---

## Initial Setup (Phase 1)

```powershell
# From D:\QMS-Desktop
npm install
cargo install tauri-cli
```

---

## Development

```powershell
# Start Tauri dev window (hot-reload React + live Rust backend)
npm run tauri dev
```

The app window opens with hot-reload. Changes to `src/` reload instantly.
Changes to `src-tauri/` trigger a Rust recompile.

---

## Production Build

```powershell
# Build installer (Phase 9)
npm run tauri build
```

Output: `src-tauri/target/release/bundle/`

---

## Database

The SQLite database is created automatically at:
```
%APPDATA%\QMSDesktop\data.db
```

To inspect the database during development (if sqlite3 CLI is installed):
```powershell
sqlite3 "$env:APPDATA\QMSDesktop\data.db"
.tables
SELECT * FROM schema_migrations;
```

Install DB Browser for SQLite for a GUI inspector: https://sqlitebrowser.org/

Migrations run automatically at app launch (idempotent — re-launch is safe).
To reset the database for testing:
```powershell
# WARNING: deletes all data — development only
Remove-Item "$env:APPDATA\QMSDesktop\data.db" -Force
```

### Phase 3+ SQL Design Note

`tauri-plugin-sql` (v2) resolves `sqlite:name.db` relative to `%LOCALAPPDATA%\com.qmsdesktop.app\`,
which is a different directory from the project's `%APPDATA%\QMSDesktop\` path.

To maintain consistent DB access across all phases:
- **All SQL runs through custom Rust Tauri commands** (not JS-side plugin SQL)
- Commands open `rusqlite::Connection` to `%APPDATA%\QMSDesktop\data.db`, run parameterized queries, return typed structs
- The `tauri-plugin-sql` npm package is installed but its JS API is NOT used for business queries

---

## AppData Directory

All user data is under:
```
%APPDATA%\QMSDesktop\
├── data.db
├── settings.json
├── license.json
├── uploads/
│   ├── documents/
│   ├── capa/
│   ├── risks/
│   ├── complaints/
│   ├── audits/
│   └── nc/
└── backups/
```

To reset ALL app data (development only):
```powershell
Remove-Item "$env:APPDATA\QMSDesktop" -Recurse -Force
```

---

## Running Tests

```powershell
# Frontend TypeScript type check
npx tsc --noEmit

# Run frontend unit tests (Vitest, when configured)
npm test

# Run Rust tests
cd src-tauri
cargo test
```

---

## Linting and Formatting

```powershell
# ESLint
npm run lint

# Prettier
npm run format
```

---

## First Admin Setup

On a fresh database (users table empty), the app automatically shows the
**First Admin Setup** screen instead of the login screen.

Fill in:
- Full name
- Email address
- Password (min 8 chars, one uppercase, one digit)
- Confirm password

The Admin account is created with Argon2id hashing in the Rust backend.
After creation, the app redirects to the main dashboard.

**Troubleshooting:**
If the First Admin Setup screen does not appear:
```powershell
# Reset the database to trigger First Admin Setup again
Remove-Item "$env:APPDATA\QMSDesktop\data.db" -Force
# Re-launch the app — database and all tables are recreated automatically
```

---

## Login Troubleshooting

- Login uses **email address** (case-insensitive — stored lowercase)
- Password must match exactly (case-sensitive)
- If "account inactive", contact another Admin to reactivate from the Users page
- Session is in-memory only — each app launch requires re-login
- Deactivated accounts cannot log in — the `login` Rust command returns "This account is inactive"
- If the currently logged-in user is deactivated mid-session by another Admin: the in-memory session remains valid until the app is closed. On next launch, login will fail. This is expected behavior for a local single-device app.

## Permission Errors (Phase 3B)

If you see "Unauthorized: Admin role required" from the Users page or "Unauthorized: Admin or QualityManager role required" from Settings save:

1. Verify the logged-in user's role in the Users page (Admin must perform this).
2. Check `is_active` — an inactive user's session is not trusted by the Rust backend.
3. If you suspect database corruption: open SQLite DB and inspect `SELECT id, username, role, is_active FROM users;`

**Settings live refresh (Phase 3B fix):** After saving Settings, the company name in the sidebar now updates immediately via the `settingsStore` Zustand store. No page reload required.

## Settings Troubleshooting

- Settings save fails with "Unauthorized": only Admin and QualityManager can save settings.
- Settings load is always allowed (read-only, no role check).
- If the company name in the sidebar still shows "Set company name in Settings" after saving: the sidebar reloads settings on mount. Navigate to another page and back, or log out and back in.

---

## Documents Module — File Operations (Phase 4)

### File Picker (tauri-plugin-dialog)

The Documents module uses `@tauri-apps/plugin-dialog` to open a native file picker:

```typescript
import { open } from '@tauri-apps/plugin-dialog';
const result = await open({
  multiple: false,
  filters: [{ name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg'] }]
});
```

This requires `dialog:allow-open` in `src-tauri/capabilities/default.json`. The file path is passed to the Rust `attach_document_file` command for server-side copy.

### File Storage

Attached files are stored at:
```
%APPDATA%\QMSDesktop\uploads\documents\{document_id}_{timestamp_micros}.{ext}
```

The original filename is stored in `original_file_name` column for display. The stored filename (`file_path`) is used when opening the file.

To list stored files during development:
```powershell
Get-ChildItem "$env:APPDATA\QMSDesktop\uploads\documents"
```

### Opening Files

Documents are opened using the Windows default application via:
```
cmd /c start "" {full_path}
```

This launches whatever application is registered for the file type (e.g., Acrobat for PDF, Word for DOCX).

### Document Number Format

Document numbers are auto-generated as `{document_prefix}-{YYYY}-{NNNN}`.
The `document_prefix` setting can be changed in Settings → Quality System Identifiers.
Default prefix: `DOC`. Example: `DOC-2026-0001`.

---

## CAPA Module (Phase 5)

### CAPA Number Format

CAPA numbers are auto-generated as `{capa_prefix}-{YYYY}-{NNNN}`.
The `capa_prefix` setting can be changed in Settings → Quality System Identifiers.
Default prefix: `CAPA`. Example: `CAPA-2026-0001`.

### Closing a CAPA

To close a CAPA:
1. Select the CAPA in the register to open the DetailsDrawer.
2. Click **Close CAPA** in the drawer action bar.
3. Enter the **Effectiveness Check** text (required — must not be empty).
4. Click **Close CAPA** to confirm.

On close: `status = 'CLOSED'`, `closed_at = datetime('now')`, `effectiveness_check` is updated.

### Reopening a CAPA

Click **Reopen** in the DetailsDrawer. The CAPA returns to `OPEN` with `closed_at = NULL`.

### Overdue CAPAs

A CAPA is computed as overdue when:
```sql
status = 'OPEN' AND target_date IS NOT NULL AND target_date < date('now')
```

This is computed in SQL at query time (no stored flag). The OVERDUE badge and red due date highlighting reflect this.

### CAPA File Attachments

Files are attached per-CAPA and stored at:
```
%APPDATA%\QMSDesktop\uploads\capa\{capa_id}_{timestamp_micros}.{ext}
```

The original filename is stored in the `attachments` table (`file_name` column). Files are opened via `cmd /c start "" {full_path}`.

To list stored CAPA files during development:
```powershell
Get-ChildItem "$env:APPDATA\QMSDesktop\uploads\capa"
```

### CAPA Permissions

| Action | Required Role |
|---|---|
| View CAPA list | Any active user |
| View CAPA details/activity | Any active user |
| Open CAPA attachment | Any active user |
| Create / Edit CAPA | Admin or QualityManager |
| Close / Reopen CAPA | Admin or QualityManager |
| Attach file to CAPA | Admin or QualityManager |

---

## Risks Module (Phase 6)

### Risk Number Format

Risk numbers are auto-generated as `{risk_prefix}-{YYYY}-{NNNN}`.
The `risk_prefix` setting can be changed in Settings → Quality System Identifiers.
Default prefix: `RISK`. Example: `RISK-2026-0001`.

### Risk Score and Level

The `risk_score` column is `GENERATED ALWAYS AS (severity * likelihood) STORED` in SQLite.
Rust commands never insert or update this column — SQLite computes it automatically.

`risk_level` is a plain TEXT column. Rust computes it at INSERT/UPDATE using:

| Score | Level |
|---|---|
| 1–4 | LOW |
| 5–9 | MEDIUM |
| 10–19 | HIGH |
| 20–25 | CRITICAL |

### Closing a Risk

1. Select the risk in the register to open the DetailsDrawer.
2. Click **Close Risk** in the drawer action bar.
3. Confirm in the confirmation modal.
4. On close: `status = 'CLOSED'`, `closed_at = datetime('now')`.

### Reopening a Risk

Click **Reopen** in the DetailsDrawer. The risk returns to `OPEN` with `closed_at = NULL`.

### Risk File Attachments

Files are attached per-risk and stored at:
```
%APPDATA%\QMSDesktop\uploads\risks\{risk_id}_{timestamp_micros}.{ext}
```

To list stored risk files during development:
```powershell
Get-ChildItem "$env:APPDATA\QMSDesktop\uploads\risks"
```

### Risk Permissions

| Action | Required Role |
|---|---|
| View risk list | Any active user |
| View risk details/activity | Any active user |
| Open risk attachment | Any active user |
| Create / Edit risk | Admin or QualityManager |
| Close / Reopen risk | Admin or QualityManager |
| Attach file to risk | Admin or QualityManager |

### Risk Migration (004)

Migration 004 added 4 columns to the `risks` table: `source`, `who_might_be_affected`, `recommended_actions`, `time_scale`. These were not present in the original migration 001 schema.

If you encounter "table risks has no column named source" errors, the migration has not run. Delete the database and re-launch the app to apply all migrations from scratch.

---

## Complaints Module (Phase 6)

### Complaint Number Format

Complaint numbers are auto-generated as `{complaint_prefix}-{YYYY}-{NNNN}`.
The `complaint_prefix` setting can be changed in Settings → Quality System Identifiers.
Default prefix: `COMP`. Example: `COMP-2026-0001`.

### Required Fields

`customer_name` and `customer_id` are required for both create and update. The Rust command validates these are non-empty before inserting or updating.

### Closing a Complaint

1. Select the complaint in the register to open the DetailsDrawer.
2. Click **Close Complaint** in the drawer action bar.
3. Confirm in the confirmation modal.
4. On close: `status = 'CLOSED'`, `closed_at = datetime('now')`.

### Customer Filter

The customer filter dropdown in the Complaints toolbar is built dynamically from the unique `customer_id` values present in the loaded complaint data. If no complaints exist, the dropdown will only show "All Customers".

### Complaint File Attachments

Files are attached per-complaint and stored at:
```
%APPDATA%\QMSDesktop\uploads\complaints\{complaint_id}_{timestamp_micros}.{ext}
```

To list stored complaint files during development:
```powershell
Get-ChildItem "$env:APPDATA\QMSDesktop\uploads\complaints"
```

### Complaint Permissions

| Action | Required Role |
|---|---|
| View complaint list | Any active user |
| View complaint details/activity | Any active user |
| Open complaint attachment | Any active user |
| Create / Edit complaint | Admin or QualityManager |
| Close / Reopen complaint | Admin or QualityManager |
| Attach file to complaint | Admin or QualityManager |

---

## Desktop Operations — Export / Print / Import (Phase 4B)

### Export (Documents)

Export is available from the Documents toolbar via **Export → Export CSV** or **Export JSON**.

- **CSV export**: calls `exportDocumentsCSV(filteredDocs)` in `src/services/exportService.ts`. Uses `save()` from `@tauri-apps/plugin-dialog` to show a save dialog (requires `dialog:allow-save` in capabilities), then passes the path + CSV string to the Rust `write_text_file` command.
- **JSON export**: same flow, exports a structured JSON array of document objects.
- Exports reflect the **current filtered list** — if status or type filters are active, only matching documents are exported.
- The default filename is `documents-register-YYYY-MM-DD.csv` / `.json`.

To test export manually:
```powershell
# Verify exported file exists after clicking Export
# (file is saved to wherever the user chose in the save dialog)
```

### Print (Document Register)

Print is available from **Print** in the Documents toolbar.

- Calls `printDocumentRegister(filteredDocs, companyName)` in `src/services/printService.ts`.
- Opens a new window with a full-page styled HTML document (company header, table, footer, print date).
- `window.onload = window.print()` triggers the OS print dialog automatically.
- Print reflects the **current filtered list**.
- The company name is read from `settingsStore.companyName` (set from Settings page).

If the print window is blank: ensure popup windows are not blocked in the Tauri webview.

### Import (Preview Only — Phase 4B)

Import button is visible for Admin/QM roles but clicking it shows an informational modal explaining that import is not yet available.

- The `importService.ts` provides CSV/JSON parsing functions (`parseCSVPreview`, `parseJSONPreview`) that will be used in a future phase for actual import.
- **No data is written to the database in Phase 4B import.**

### `write_text_file` Rust Command

Registered in `src-tauri/src/commands/files.rs`. Accepts `{ path: String, content: String }`. Called via:
```typescript
await invoke<void>('write_text_file', { path, content });
```
Validates that `path` is absolute. Creates intermediate directories if needed. Returns `Result<(), String>` (error string on failure).

---

## Adding a New Migration

1. Create `src-tauri/src/db/sql/NNN_description.sql` (next sequential number).
2. Write the SQL (ALTER TABLE, INSERT defaults, etc.).
3. Add a `MIGRATION_NNN` constant and a `Migration { version: "NNN", description: "...", sql: MIGRATION_NNN }` entry in `db/init.rs`.
4. The migration runner will apply it automatically on next launch (idempotent).

---

## Backup and Restore (Runtime)

From within the running app: **Backup** module → Create Backup.

Manual backup (development):
```powershell
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
Compress-Archive -Path "$env:APPDATA\QMSDesktop\*" -DestinationPath "D:\QMS-Desktop-Backup-$ts.zip"
```

---

## License Activation (Phase 9B)

### Online Activation (production flow)

1. Launch the app. If no valid license.json exists, the license gate page appears.
2. Enter the license key (XXXX-XXXX-XXXX-XXXX format) and an optional machine label.
3. Click **Activate Online** — the Rust `activate_license_online` command:
   - Computes the hardware fingerprint
   - POSTs to `{LICENSE_SERVER_BASE_URL}/activate-license`
   - Server verifies key hash, checks activation limits, signs token with RSA private key
   - Token written to `%APPDATA%\QMSDesktop\license.json`
   - Local RSA validation runs immediately
4. App proceeds to login or First Admin Setup.

### Online Validation (periodic)

From the License page, click **Validate Online**. The `validate_license_online` command:
- Reads existing token, skips if `dev_bypass`
- POSTs activation_id + hardware fingerprint to the validate-license Edge Function
- Server updates `last_seen_at`, returns fresh RSA-signed token
- On network error: falls back to local RSA validation (offline grace period)

### Dev License (development only)

Click **Create Dev License** on the License page. Creates a `dev_bypass` token for this machine.
HMAC-signed (not RSA). NOT valid for production. Clears with **Clear License**.

### Supabase Setup (before deploying)

See `supabase/README_LICENSE_SERVER.md` for the full deployment guide:
1. `supabase init` + `supabase start` (or link to a cloud project)
2. Apply migration: `supabase db push`
3. Set secrets: `supabase secrets set LICENSE_PRIVATE_KEY_PEM=... LICENSE_KEY_HASH_SECRET=...`
4. Deploy functions: `supabase functions deploy activate-license` (etc.)
5. Update `LICENSE_SERVER_BASE_URL` in `src-tauri/src/commands/license.rs`

### License Admin Portal (Phase 9B)

Located in `license-admin/`. Separate web app — runs independently of the desktop app.

```powershell
# Install (first time)
cd license-admin
npm install

# Create .env from template
Copy-Item .env.example .env
# Edit .env: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# Start dev server
npm run dev
# Opens at http://localhost:5174

# Build for deployment
npm run build
```

Sign in with a Supabase user that has a row in `license_admin_profiles`. The portal provides:
- **Customers** — view all customers
- **Licenses** — view all licenses with status; click for activation detail
- **Generate** — generate a new license key (admin only); raw key shown ONCE
- **Events** — audit log of all license events

---

## Phase Reports

After completing each phase, write the report to:
```
docs/reports/PHASE_N_<NAME>_REPORT.md
```

Then update:
- `CURRENT_PHASE.md` — update phase status and next phase
- `DEVELOPMENT_LOG.md` — append session log entry

---

## Forbidden Operations (Development Rules)

- Do not run `git add .` — add files individually.
- Do not commit without explicit user approval.
- Do not touch `.env` files if they exist.
- Do not print or log password hashes or secrets.
- Do not connect to live external APIs.
- Do not upload business data to any external service.
- Do not implement cloud sync or multi-device mode.
- Do not delete existing files without user approval.
- Do not put all logic in one file.
- Do not build fake frontend-only modules without real database backing.
