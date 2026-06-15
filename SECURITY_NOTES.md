# QMS Desktop — Security Notes

## Security Principles

This is a local single-device desktop application. The threat model is accordingly scoped:
no external network, no cloud data, no remote authentication. Security focuses on local
data integrity, access control between local users, and safe file operations.

---

## Authentication (Phase 3 IMPLEMENTED)

| Item | Decision |
|---|---|
| Auth method | Local email + password |
| Password hashing | **Argon2id** via `argon2 = "0.5"` crate (Rust backend, never JavaScript) |
| Salt | Random per hash using `SaltString::generate(&mut OsRng)` |
| Hash format | PHC string format stored in `password_hash` column |
| Session | In-memory only (Zustand `authStore`); cleared on logout or window close |
| No tokens on disk | Session state not persisted between launches |
| Admin bootstrap | `create_first_admin` Rust command — only works if users table is empty |
| Login identifier | Email address, normalized to lowercase before storage and lookup |
| Login errors | Generic "Invalid email or password" — no user enumeration |
| Inactive accounts | Specific "account inactive" message (local app, not a web-facing service) |

### Password Policy (enforced at frontend + Rust backend)
- Minimum 8 characters
- At least one uppercase letter, one digit
- Validated in `password::validate_password_strength()` in Rust before hashing
- Frontend validates same rules before submitting (UX; Rust re-validates as authoritative)

---

## Role-Based Access (Phase 3B HARDENED)

| Role | Sidebar / Access |
|---|---|
| Admin | All pages and operations |
| QualityManager | Dashboard, CAPA, Risks, Complaints, Audits, NC, Documents, Reports, Settings |
| Auditor | Dashboard, Audits, NC, Documents, Reports |
| Employee | Dashboard, CAPA, Risks, Complaints, Documents |
| Viewer | Dashboard, Documents, Reports |

### Permission Enforcement Layers

**Layer 1 — UI layer (Phase 3):** Sidebar filtered by role per NavItem. Per-page access guards render restricted cards for unauthorized roles.

**Layer 2 — Rust backend (Phase 3B):** Protected Tauri commands require `current_user_id: i64` as a parameter. The Rust `permissions.rs` module verifies the caller's role and active status in the database before executing any mutation.

| Command | Required Role |
|---|---|
| `list_users` | Admin |
| `create_user` | Admin |
| `update_user` | Admin |
| `set_user_status` | Admin |
| `reset_user_password` | Admin |
| `list_users_minimal` | Admin or QualityManager |
| `update_setting` | Admin or QualityManager |
| `get_settings` | None (read-only) |
| `list_documents` | Any authenticated active user |
| `get_document` | Any authenticated active user |
| `list_document_revisions` | Any authenticated active user |
| `get_document_activity` | Any authenticated active user |
| `open_document_file` | Any authenticated active user |
| `create_document` | Admin or QualityManager |
| `update_document` | Admin or QualityManager |
| `set_document_status` | Admin or QualityManager |
| `attach_document_file` | Admin or QualityManager |
| `write_text_file` | Any (frontend-only guard; no Rust auth check) |
| `list_capas` | Any authenticated active user |
| `get_capa` | Any authenticated active user |
| `get_capa_activity` | Any authenticated active user |
| `open_capa_attachment` | Any authenticated active user |
| `list_capa_attachments` | Any authenticated active user |
| `create_capa` | Admin or QualityManager |
| `update_capa` | Admin or QualityManager |
| `set_capa_status` | Admin or QualityManager |
| `attach_capa_file` | Admin or QualityManager |
| `list_risks` | Any authenticated active user |
| `get_risk` | Any authenticated active user |
| `get_risk_activity` | Any authenticated active user |
| `open_risk_attachment` | Any authenticated active user |
| `list_risk_attachments` | Any authenticated active user |
| `create_risk` | Admin or QualityManager |
| `update_risk` | Admin or QualityManager |
| `set_risk_status` | Admin or QualityManager |
| `attach_risk_file` | Admin or QualityManager |
| `list_complaints` | Any authenticated active user |
| `get_complaint` | Any authenticated active user |
| `get_complaint_activity` | Any authenticated active user |
| `open_complaint_attachment` | Any authenticated active user |
| `list_complaint_attachments` | Any authenticated active user |
| `create_complaint` | Admin or QualityManager |
| `update_complaint` | Admin or QualityManager |
| `set_complaint_status` | Admin or QualityManager |
| `attach_complaint_file` | Admin or QualityManager |

**Phase 4 addition — `require_authenticated`:** Read-only document commands use `permissions::require_authenticated()`, which verifies the caller exists and is active (any of the 5 roles). This enforces that deactivated users cannot read document data either.

**File extension validation (Phase 4):** `attach_document_file` validates the file extension in Rust before copying: only `pdf`, `doc`, `docx`, `xls`, `xlsx`, `png`, `jpg`, `jpeg` are allowed. Invalid extensions return an error without copying any bytes.

**How it works:** Each protected command receives the caller's `current_user_id`. The `permissions::require_admin()`, `permissions::require_admin_or_quality_manager()`, or `permissions::require_authenticated()` helper opens a DB connection, queries the user's `role` and `is_active` fields, and returns an error string if the check fails. The error propagates to the frontend as a `Tauri::command` error.

**Scope note:** This is local-device permission enforcement, not remote security. The goal is defense-in-depth for a multi-user local deployment, not cryptographic proof of identity across a network. No session tokens are issued or verified cryptographically.

---

## Data Confidentiality

- All business data resides in `%APPDATA%\QMSDesktop\` on the local device.
- No data is transmitted to any external server under any circumstance.
- No analytics, telemetry, or crash reporting that sends business data externally.
- Uploaded files are stored in the AppData directory, not in the application install directory.

---

## SQL Injection Prevention

- All database queries use parameterized statements via rusqlite `params![]`.
- No raw string concatenation in SQL queries.
- User-supplied input is never directly interpolated into SQL strings.

---

## File Upload Safety

- Only whitelisted MIME types are accepted (PDF, DOCX, XLSX, PNG, JPG, etc.).
- File size limits enforced at the Tauri command level before writing to disk.
- Uploaded files are stored with a UUID-based filename to avoid path traversal.
- Original filename is stored in the `attachments` table for display only.

---

## IPC Security (Tauri)

- Tauri allowlist is configured to expose only the specific commands the frontend needs.
- `shell`, `http`, and network plugins are disabled unless explicitly required.
- No arbitrary command execution from the frontend.
- CSP (Content Security Policy) is configured in `tauri.conf.json` to block inline scripts
  and restrict resource origins to `'self'`.

---

## Backup Security

- Backups are `.zip` archives written to `%APPDATA%\QMSDesktop\backups\`.
- Backup includes `data.db` and the full `uploads/` directory.
- Backup files are not encrypted in v1 (planned for a future version).
- Restore operation requires Admin role and confirmation dialog.

---

## License File (Phase 9A + 9B)

- `license.json` is stored in `%APPDATA%\QMSDesktop\license.json`.
- Production tokens are signed with **RSA-2048 PKCS#1 v1.5 SHA-256** by the Supabase Edge Function server.
- The RSA public key is embedded in the Rust binary at compile time (`license/rsa_public_key.rs`).
- **The private key never touches the desktop binary.** It lives only in the Supabase Edge Function environment variable (`LICENSE_PRIVATE_KEY_PEM`).
- Token canonicalization: all 15 fields in alphabetical BTreeMap order, null for absent optionals, compact JSON. This is the exact byte sequence that is signed.
- Hardware fingerprint (SHA-256 of hostname+MAC+disk serial) is included in the token and re-verified on every local validation call.
- License validation is performed in Rust, never in JavaScript, to prevent easy bypass.
- Raw license keys are never stored: only `SHA-256(key + ":" + secret)` is stored in Supabase. The raw key is returned to the admin portal **once** on generation and never again.
- Hardware fingerprint is never stored in plaintext: Supabase stores `SHA-256(fingerprint)` only.
- Dev bypass tokens (status = "dev_bypass") use a separate HMAC-SHA256 path. They are clearly marked and will not be accepted by a production license validator that disables the dev_bypass arm.
- See `LICENSE_DESIGN.md` and `supabase/README_LICENSE_SERVER.md` for full details.

---

## Secrets and Environment Variables

- No `.env` files are used in production.
- No API keys are embedded in the application binary.
- The license signing key is embedded in the Rust binary (obfuscated, not plaintext).

---

## Forbidden Actions (enforced in development)

- Do not print or log password hashes.
- Do not store session tokens in `localStorage` or `sessionStorage`.
- Do not commit secrets, keys, or password hashes to source control.
- Do not expose the Tauri shell plugin to the frontend.
- Do not make HTTP calls to external services from any module.
- Do not use `eval()` or dynamic script injection anywhere in the frontend.

---

## Export / Print / Import Security (Phase 4B)

### Export (CSV / JSON)
- Export is a read operation — content is generated from already-fetched in-memory data (no extra DB query).
- The user selects the save path via `dialog:allow-save` (native OS dialog). No path is hard-coded.
- The Rust `write_text_file` command accepts any absolute path the user chose. It validates the path is absolute before writing. Since the path comes from the OS file picker, directory traversal is not possible.
- No password hashes, tokens, or sensitive internal fields are included in exports. Exported fields match the Document Register display columns only.

### Print
- Print uses `window.open('', '_blank')` to open a new browser/webview window with generated HTML.
- The HTML is constructed in TypeScript using `escapeHtml()` for all user-derived field values to prevent XSS within the print window.
- No external resources are loaded in the print window (no CDN, no remote fonts).
- `window.onload = window.print` triggers the print dialog automatically.

### Import (Phase 4B — Preview Only)
- The import parser (`importService.ts`) is a preview-only implementation. It reads and parses the file structure but does NOT insert any data into the database.
- The file is read by the user's browser/JS context only. No content is sent to any external service.
- Full import with DB writes is reserved for a future phase where proper validation and conflict-resolution logic will be implemented.

### `write_text_file` Rust Command
- This command has no Rust-layer authentication check. It is intended only for export flows triggered by the authenticated user's UI actions.
- The path must be absolute (validated in Rust). The command creates intermediate directories if needed.
- Future hardening option: restrict the allowed path to known safe locations (e.g., the user's home or Documents folder). Not implemented in Phase 4B as the OS dialog already constrains the user's path selection.

---

## Known Limitations (v1)

| Limitation | Mitigation |
|---|---|
| Backup files are unencrypted | User should protect their AppData directory with OS-level access controls |
| No audit trail for Admin self-modification | Planned for a future version |
| No 2FA | Out of scope for v1 single-device deployment |
| License key embedded in binary | Obfuscation only; not cryptographically hidden from a determined reverse engineer |
