# Security Notes

> **Partly superseded.** The command/permission table below still names the
> pre-RBAC roles ("Admin/QM", "Authenticated"). Since Stage 2 authorization is
> permission-based, not role-based, and every command guards on a key from the
> 53-key registry. For current authority see **`docs/RBAC.md`**; for document
> files, storage and approval see **`docs/DOCUMENT_CONTROL.md`**. The principles
> in this file still hold — the specific role names in the table do not.

## Summary of Security Controls

All security enforcement is in the Rust layer. The frontend never queries the database directly.

---

## Permission Enforcement

Every Tauri command begins with a permission check. If the check fails, the command returns an `Err(String)` immediately — no SQL executes.

### Permission Helpers (`src-tauri/src/permissions.rs`)

| Helper | Roles | Used By |
|---|---|---|
| `require_admin` | Admin | (reserved for future destructive operations) |
| `require_admin_or_quality_manager` | Admin, QualityManager | All CRUD create/update/close/reopen/attach commands |
| `require_admin_qm_or_auditor` | Admin, QualityManager, Auditor | `add_audit_finding`, `update_audit_finding`, `create_nc_from_audit_finding` |
| `require_authenticated` | All active roles | All list/get/open-attachment commands |

### Permission Table by Command

| Command | Permission |
|---|---|
| `list_audits` | Authenticated |
| `get_audit` | Authenticated |
| `create_audit` | Admin/QM |
| `update_audit` | Admin/QM |
| `set_audit_status` | Admin/QM |
| `list_audit_findings` | Authenticated |
| `add_audit_finding` | Admin/QM/Auditor |
| `update_audit_finding` | Admin/QM/Auditor |
| `create_nc_from_audit_finding` | Admin/QM/Auditor |
| `attach_audit_file` | Admin/QM |
| `open_audit_attachment` | Authenticated |
| `list_audit_attachments` | Authenticated |
| `get_audit_activity` | Authenticated |
| `list_non_conformities` | Authenticated |
| `get_non_conformity` | Authenticated |
| `create_non_conformity` | Admin/QM |
| `update_non_conformity` | Admin/QM |
| `set_non_conformity_status` | Admin/QM |
| `create_capa_from_non_conformity` | Admin/QM |
| `attach_nc_file` | Admin/QM |
| `open_nc_attachment` | Authenticated |
| `list_nc_attachments` | Authenticated |
| `get_non_conformity_activity` | Authenticated |
| `list_capas` | Authenticated |
| `get_capa` | Authenticated |
| `create_capa` | Admin/QM |
| `update_capa` | Admin/QM |
| `set_capa_status` | Admin/QM |
| `attach_capa_file` | Admin/QM |
| `open_capa_attachment` | Authenticated |
| `list_capa_attachments` | Authenticated |
| `get_capa_activity` | Authenticated |
| `list_risks` | Authenticated |
| `get_risk` | Authenticated |
| `create_risk` | Admin/QM |
| `update_risk` | Admin/QM |
| `set_risk_status` | Admin/QM |
| `attach_risk_file` | Admin/QM |
| `open_risk_attachment` | Authenticated |
| `list_risk_attachments` | Authenticated |
| `get_risk_activity` | Authenticated |
| `list_complaints` | Authenticated |
| `get_complaint` | Authenticated |
| `create_complaint` | Admin/QM |
| `update_complaint` | Admin/QM |
| `set_complaint_status` | Admin/QM |
| `attach_complaint_file` | Admin/QM |
| `open_complaint_attachment` | Authenticated |
| `list_complaint_attachments` | Authenticated |
| `get_complaint_activity` | Authenticated |
| `get_dashboard_summary` | Authenticated |
| `get_dashboard_recent_activity` | Authenticated |
| `get_dashboard_overdue_capas` | Authenticated |
| `get_dashboard_high_risks` | Authenticated |
| `get_dashboard_open_ncs` | Authenticated |
| `get_document_register_report` | Authenticated |
| `get_capa_report` | Admin/QM/Auditor |
| `get_risk_report` | Admin/QM/Auditor |
| `get_audit_report` | Admin/QM/Auditor |
| `get_nc_report` | Admin/QM/Auditor |
| `get_complaint_report` | Admin/QM |
| `get_backup_status` | Authenticated |
| `create_local_backup` | Admin |
| `open_backups_folder` | Admin |
| `validate_backup_path` | Admin |
| `restore_local_backup` | Admin |
| `create_nc_from_risk` | Admin/QM |
| `create_capa_from_risk` | Admin/QM |
| `create_nc_from_complaint` | Admin/QM |
| `create_capa_from_complaint` | Admin/QM |
| `get_hardware_fingerprint` | None (pre-login, startup) |
| `get_license_status` | None (pre-login, startup) |
| `get_license_details` | None (pre-login, startup) |
| `validate_local_license` | None (pre-login, startup) |
| `import_license_token` | None (pre-login, startup) |
| `clear_local_license_dev_only` | None (DEV tool only) |
| `create_dev_license_for_current_machine` | None (DEV tool only) |

---

## SQL Safety

- **All** SQL uses `params![]` parameterized queries
- **Zero** raw string concatenation in any SQL query
- LIKE patterns use `format!("{}-{}-%" ,prefix, year)` with the formatted string passed as a parameter — not injected into SQL text

---

## File Upload Safety

- File extension validated against allowlist before any copy: PDF, DOC, DOCX, XLS, XLSX, PNG, JPG, JPEG
- Files stored as `{record_id}_{unix_microseconds}.{ext}` — no user-supplied name on disk
- Original filename stored in `attachments.file_name` for display only
- Source file path provided by the OS file picker (Tauri dialog), not typed by the user

---

## Password Security

- **Argon2id** hashing via `argon2` crate v0.5 (`password.rs`) — default parameters: m=19456, t=2, p=1
- Hashes never returned to the frontend — only `(bool)` for login success
- `reset_user_password` sets a new Argon2id hash, never returns the old one

---

## Data Not Exposed

- User password hashes
- Internal SQLite row IDs beyond what is needed for display
- Raw file system paths (file_path stored is just the stored filename, not the full disk path)
- Database connection details or schema

---

---

## License Security (Phase 9A)

- **Hardware fingerprint:** `SHA-256(COMPUTERNAME.lower() + ":" + MAC.lower())`. Raw COMPUTERNAME and MAC are never stored on disk or returned to the frontend — only the 64-char hex digest is stored in license.json.
- **Fingerprint display:** `fingerprint_short()` returns the first 16 chars + "..." to the frontend. The full 64-char digest is never exposed to JS.
- **Signature verification:** HMAC-SHA256 using `verify_slice` from the `hmac` crate (constant-time comparison — no timing oracle). Phase 9B will replace this with RSA-2048 public key verification.
- **DEV_HMAC_KEY** is a compile-time `const` in `validation.rs`. It is a placeholder for Phase 9A development only. It is documented with a clear warning not to use for production. Phase 9B removes it entirely.
- **License commands have no Tauri permission requirements** — they must work before a user exists or is logged in (startup gate). The Rust code itself enforces what they can and cannot do.
- **`clear_local_license_dev_only` and `create_dev_license_for_current_machine`** are labeled DEV ONLY in both Rust and the UI. They are exposed via the same Tauri handler mechanism but are intended for development use only. In a production build, these should be behind a build flag (Phase 9B concern).

---

## Username and Auth Security (Phase 11A)

- **Login uses username, not email.** The `username` column (TEXT NOT NULL UNIQUE) has always existed in the schema. Phase 11A correctly populates it with a real username independent of email.
- **Username immutability:** Once set, username cannot be changed by any user or admin. `update_user` and `update_own_profile` do not touch the username column.
- **Username validation:** Must start with a letter; only ASCII letters, digits, underscores; max 64 chars. Enforced in both Rust backend and frontend.
- **Email is optional:** No user command requires email. Email is stored as empty string if not provided (SQLite). The login lookup only queries `username`.
- **`update_own_profile` security:** Requires `current_user_id` and verifies the user is active before updating. Only updates own name, department, and email — no role or username change allowed.
- **`change_own_password` security:** Requires current password verification (Argon2id). New password is validated for strength before hashing. The old hash is never returned to the frontend. If current password is wrong, returns error without revealing hash.
- **Backup menu items disabled when logged out:** Rust listens for `auth-changed` event from frontend. Backup items start as `enabled = false` at app startup. Enabled only after authenticated login. Disabled again after logout. Frontend also guards these actions in `MenuListener`.
- **Password hashing:** Argon2id throughout — admin password reset, user self-change, all use `password::hash_password` / `password::verify_password`.

---

## License Signing Key Security (Phase 10B)

- **Required format:** PKCS#8 PEM (`-----BEGIN PRIVATE KEY-----`). PKCS#1 (`-----BEGIN RSA PRIVATE KEY-----`) is explicitly rejected with a clear conversion error.
- **Secret normalization:** `getPrivateKey()` normalizes literal `\n` (from CLI-escaped secrets) to real newlines before parsing. Both storage formats are handled safely.
- **DER length guard:** If the decoded DER buffer is 0 bytes, `getPrivateKey()` throws before calling `crypto.subtle.importKey`, producing a clear error instead of the cryptic ASN.1 message.
- **Safe diagnostic logs:** Edge Function logs presence (true/false), PEM type, and DER byte count. The key value itself is never logged.
- **Key regeneration:** If the private key was exposed during testing, regenerate the RSA-2048 key pair with `openssl genpkey` before commercial release. Update both Supabase `LICENSE_PRIVATE_KEY_PEM` secret and `src-tauri/src/license/rsa_public_key.rs`. Existing tokens will become invalid — customers must reactivate.

---

## Production License Gate (Phase 9C)

- **DEV bypass tokens rejected in release builds**: `validate_token()` checks `cfg!(not(debug_assertions))` — any token with `status == "dev_bypass"` returns `LicenseState::Invalid` in release builds. The HMAC path is unreachable.
- **DEV commands fail in release**: `clear_local_license_dev_only` and `create_dev_license_for_current_machine` return errors in release builds (`cfg!(not(debug_assertions))`). They are still registered in `generate_handler![]` but return errors when called.
- **DEV UI hidden in production**: The "Development Controls" card in `License.tsx` is wrapped in `{import.meta.env.DEV && (...)}`. Vite dead-code-eliminates the entire block in production builds, so `handleDevCreate` and `handleDevClear` are never reachable from the UI.
- **No private key in binary**: The release binary contains only the RSA-2048 public key (SPKI PEM). The private key lives exclusively in the Supabase `LICENSE_PRIVATE_KEY_PEM` secret.

---

## Installer and Uninstall Data Safety

### What the installer writes
The MSI installer only writes to `C:\Program Files\QMS Desktop\`. It never reads, writes, or deletes anything in `%APPDATA%\QMSDesktop\`.

### What the uninstaller removes
The WiX uninstaller removes exactly the files it installed: `C:\Program Files\QMS Desktop\` binaries and shortcuts. No AppData paths are registered as WiX `<Component>` targets. No custom uninstall actions exist. There are no RemoveFolder, RemoveFile, or PowerShell cleanup scripts that touch AppData.

### AppData preservation guarantee
The following paths survive install, uninstall, and upgrade without exception:
- `%APPDATA%\QMSDesktop\qms.db`
- `%APPDATA%\QMSDesktop\license.json`
- `%APPDATA%\QMSDesktop\uploads\`
- `%APPDATA%\QMSDesktop\backups\`
- `%APPDATA%\QMSDesktop\settings.json`

### EULA
The End User License Agreement is stored at `src-tauri/EULA.rtf`. It is displayed in both the WiX MSI installer (LicenseAgreementDlg) and the NSIS setup wizard (MUI_PAGE_LICENSE) — implemented in Phase 11F via `bundle.licenseFile`. No secrets, internal paths, or dev credentials are present in the EULA file.

---

## Inactive User Enforcement

Every `require_*` helper queries `WHERE id = ?1` and checks `is_active = 1`. An inactive user's JWT/session is rejected at the Rust layer even if the frontend tries to send it.

---

## Local Data Security (Phase 12 Guidance)

### SQLite Database — Encryption at Rest

The SQLite database at `%APPDATA%\QMSDesktop\qms.db` is stored in standard **unencrypted**
SQLite format. Any local user with file system access to that path can read all QMS business
data (CAPAs, risks, complaints, audits, non-conformities, documents, users) using SQLite Browser
or the sqlite3 CLI.

**SQLCipher (at-rest encryption)** would require significant architectural changes (new Rust
crate, key management). This is a potential future enhancement, not implemented in v1.0.

**Operational guidance for deployment:**

1. Ensure the Windows user account that runs QMS Desktop is protected with a **strong password**.
2. Enable **BitLocker** or **Windows Device Encryption** on the host machine to protect data at rest.
3. Apply appropriate **NTFS permissions** to `%APPDATA%\QMSDesktop\` so only the running user account has access.
4. Control **physical access** to the machine. Windows account protection relies on physical security.
5. For multi-user PCs, each user should run QMS Desktop under their own Windows account.
6. If a machine is decommissioned, **wipe or destroy** the storage device to prevent data recovery.

### Backup Archive Security

Backup archives in `%APPDATA%\QMSDesktop\backups\` include:
- `data.db` (full QMS database)
- `uploads/` (all attached files)
- `settings.json`
- `license.json` (license token + hardware fingerprint hash)

Backup archives should be stored on encrypted storage. If backups are moved to external media
(USB drive, network share), ensure that media is access-controlled.

The `license.json` in a backup contains the hardware fingerprint (SHA-256 of COMPUTERNAME:MAC).
This cannot be used on a different machine (local fingerprint must match). However, backups
should still be treated as sensitive data.

---

## Phase 12 Security Audit Summary (2026-06-16)

**Audit result:** Acceptable for RC — No critical vulnerabilities found.

**Pre-commercial-activation requirement:** Verify that the RSA public key embedded in
`src-tauri/src/license/rsa_public_key.rs` matches the private key deployed to Supabase
`LICENSE_PRIVATE_KEY_PEM`. Use:
```powershell
openssl rsa -in license_private_key.pem -pubout
```
Compare the output to the PEM in `rsa_public_key.rs`. If different, update and rebuild
before issuing any customer licenses.

**Deferred improvements:**
- Remove `tauri-plugin-sql` dead dependency from Cargo.toml and lib.rs (M-02)
- Redeploy admin Edge Functions without `--no-verify-jwt` for defense-in-depth (M-03)
- Add frontend `ProtectedRoute` wrappers for admin-only pages (L-02)
- Remove `DEV_HMAC_KEY` dead constant from `validation.rs` (L-03)
