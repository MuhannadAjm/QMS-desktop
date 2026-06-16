# QMS Desktop — Security and Data Notes

## Version 1.0.0

---

## Data Storage — Where Is Your Data?

All QMS business data is stored **locally on your device only**:

| Data | Location |
|---|---|
| QMS database (all records) | `%APPDATA%\QMSDesktop\qms.db` |
| File attachments | `%APPDATA%\QMSDesktop\uploads\` |
| Backup archives | `%APPDATA%\QMSDesktop\backups\` |
| Company settings | `%APPDATA%\QMSDesktop\settings.json` |
| License token | `%APPDATA%\QMSDesktop\license.json` |

**No QMS business data is ever uploaded to any cloud service.**

---

## What Goes Online?

The only data that leaves your device is **licensing data**:

- During license **activation**: your license key, hardware fingerprint (a hash — not your actual hardware IDs), machine label, and app version are sent to the license server over HTTPS.
- During periodic **validation**: license ID, activation ID, and hardware fingerprint hash are sent.

The license server stores: hardware fingerprint hash, activation timestamp, machine label, and license status. It does **not** store any QMS records (CAPAs, risks, complaints, documents, users, etc.).

---

## SQLite Database — Encryption at Rest

The SQLite database at `%APPDATA%\QMSDesktop\qms.db` is stored in **standard, unencrypted SQLite format**.

Any local user with file system access to that path can open the database with SQLite Browser or the sqlite3 command-line tool and read all QMS data.

### Recommended Mitigations

1. **Windows account password** — Protect the Windows user account that runs QMS Desktop with a strong password. Use Windows Hello (PIN, fingerprint, or face) for convenience with strong underlying credentials.

2. **BitLocker or Windows Device Encryption** — Enable drive encryption so the database cannot be read if the device is lost or stolen.
   - **Windows 11 Pro/Enterprise:** BitLocker (Control Panel → System and Security → BitLocker Drive Encryption)
   - **Windows 11 Home:** Device Encryption (Settings → Privacy & Security → Device Encryption)
   - **Windows 10:** Same locations as above

3. **NTFS file permissions** — The AppData folder is already scoped to the logged-in Windows user by default. Do not run QMS Desktop as a shared or guest account.

4. **Physical security** — Control physical access to the device. Windows account protection relies on physical security.

5. **Multi-user PCs** — If multiple people share a Windows PC, each user should run QMS Desktop under their own Windows account. The database is per-user (stored in each user's own `%APPDATA%`).

6. **Decommissioning** — When decommissioning a device, wipe or destroy the storage device. Simply deleting files does not prevent recovery.

---

## Backup Archive Security

Backup archives in `%APPDATA%\QMSDesktop\backups\` contain:
- `data.db` — the full QMS database (includes all records)
- `uploads/` — all attached files
- `settings.json`
- `license.json` — the license token (contains a hardware fingerprint hash, not raw hardware IDs)

**Backup archives should be treated as sensitive data:**

- Store backups on encrypted storage (BitLocker-protected drives or encrypted external media)
- If transferring backups to external media (USB drive, network share), ensure that media is access-controlled
- Do not leave backup archives on unencrypted USB drives that could be lost
- The license.json in a backup from one machine **cannot** be used on a different machine — the hardware fingerprint must match

---

## Password Security

- Passwords are hashed using **Argon2id** (the recommended password hashing algorithm per OWASP)
- Password hashes are never returned to the frontend or exposed in any API response
- Login uses the same error message for wrong password and nonexistent username to prevent username enumeration
- The application does not store session tokens on disk — your session ends when the app is closed

---

## License Token Security

The license token stored in `license.json` is a **signed JSON object** (RSA-2048, PKCS1v15-SHA256):
- It contains no sensitive payment or personal information
- It contains your license parameters (plan, expiry, activation timestamp) plus a hardware fingerprint hash
- The signature can only be created by the license server (using the private key)
- The desktop app can verify the signature (using the embedded public key) but cannot create new tokens
- Tampering with any field in the token invalidates the signature and the license

---

## No Telemetry

QMS Desktop collects **no telemetry, crash reports, usage analytics, or diagnostic data.** No data is sent to QMS Desktop or any third party beyond the license activation/validation described above.

---

## No Auto-Update

QMS Desktop does not auto-download or execute code from the internet. Updates are delivered as new installer files. To update:
1. Download the new installer from the QMS Desktop website or via your support contact
2. Run the installer — your data is preserved automatically
3. Verify the SHA256 checksum of the new installer before running it

---

## Responsibility

The customer (your organization) is responsible for:

- Maintaining regular backups of QMS data
- Protecting the device and Windows account with appropriate security controls
- Controlling who has access to the machine running QMS Desktop
- Storing backup archives securely
- Complying with applicable data protection laws regarding the QMS records stored in the database

QMS Desktop provides the tools (backup/restore, role-based access control, hardware-bound licensing) — you are responsible for the operational security of the device and the data it contains.

---

## Known Security Limitations

| Limitation | Notes |
|---|---|
| SQLite not encrypted at rest by the application | See "SQLite Database — Encryption at Rest" above for mitigations. SQLCipher integration is planned for a future version. |
| Installer not code-signed | The installer shows a SmartScreen warning (click More Info → Run Anyway). An EV code signing certificate is planned for a future release. |
| Manual update checking only | There is no auto-updater. Check with your support contact for new versions. |
| No audit trail for admin actions in Users page | All QMS record changes are logged in the activity_log table. User management actions (create/edit/deactivate) are not currently logged. |

---

*QMS Desktop v1.0.0 — © 2026 QMS Desktop. All rights reserved.*
