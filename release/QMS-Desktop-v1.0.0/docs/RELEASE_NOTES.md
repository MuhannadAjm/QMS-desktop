# QMS Desktop — Release Notes

## Version 1.0.0
**Release Date:** 2026-06-16

---

## What Is QMS Desktop?

QMS Desktop is a standalone Windows application for managing quality processes in accordance with ISO 9001 principles. All data is stored locally on your device — no cloud sync, no subscription required beyond the initial license activation.

---

## Features in This Release

### Core Modules

- **Documents** — Create, revise, and track controlled documents with status workflow (Under Process → Controlled → Obsolete). File attachments, version history, and activity log per document.
- **CAPA (Corrective and Preventive Actions)** — Full CAPA lifecycle: root cause analysis, action plan, effectiveness check, closure. Links to Non-Conformities, Audits, Risks, and Complaints.
- **Risks** — Risk register with 5×5 severity/likelihood matrix, risk score calculation, mitigation tracking, residual risk. Links to NC and CAPA.
- **Complaints** — Customer complaint tracking with customer filtering, priority, investigation, and resolution. Links to NC and CAPA.
- **Audits** — Internal audit management with findings (NC / OFI / Observation / Positive). Finding-level NC creation.
- **Non-Conformities** — NC register with source tracking (Audit, Customer Complaint, Risk, Process, Supplier, Inspection, Internal). Links to CAPA.
- **Dashboard** — Live KPI overview: Open CAPAs, Overdue CAPAs, High/Critical Risks, Open Complaints, Open NCs, Completed Audits, Obsolete Documents. Recent activity feed.

### Reports

- **Document Register** — Full document list with status, category, current revision.
- **CAPA Report** — CAPA list with type, status, root cause, assignee, target date.
- **Risk Report** — Risk list with level, score, category, mitigation status.
- **Complaint Report** — Complaint list with customer, priority, investigation status.
- **Audit Report** — Audit list with type, standard, status.
- **Non-Conformity Report** — NC list with source, severity, status.
- All reports support date range filtering, print (Save as PDF), and CSV export.

### User Management and Access Control

- 5 user roles: Admin, Quality Manager, Auditor, Employee, Viewer
- Role-based module access enforced in the Rust backend
- Username-based login (immutable username, optional email)
- Admin can create, edit, deactivate, and reset passwords for all users
- Self-service: Edit own profile and change own password

### Backup and Restore

- Create manual backups (stored locally in AppData)
- Restore from backup history with automatic safety backup before restore
- Import backup from external folder (e.g., USB drive or network share)
- License preserved by default during restore (opt-in to restore license)

### License Activation

- Hardware-bound license with RSA-2048 signed tokens
- One-time online activation; offline use thereafter
- Grace period for validation when offline
- License status shown in Topbar badge at all times

### Desktop Integration

- Windows native menu bar: File, View, Tools, Help
- Keyboard shortcuts: F11 (fullscreen), Ctrl+R (reload), Ctrl++ / Ctrl+- (zoom)
- Collapsible sidebar (persisted to device)
- Help, Support, About, Tell a Friend, Check for Updates dialogs
- EULA shown during installation (MSI and NSIS)
- White checkmark on navy icon (QA symbol)

### Data and Storage

- SQLite database stored locally at `%APPDATA%\QMSDesktop\`
- No cloud sync, no telemetry, no external data upload
- File attachments stored locally in `%APPDATA%\QMSDesktop\uploads\`
- All backups stored locally in `%APPDATA%\QMSDesktop\backups\`

---

## Known Limitations

| Limitation | Notes |
|---|---|
| **Installer not code-signed** | Windows SmartScreen may show an "Unknown publisher" warning. Click "More info" → "Run anyway." This will be resolved with an EV code signing certificate in a future release. |
| **SQLite database not encrypted at rest** | The database file at `%APPDATA%\QMSDesktop\qms.db` is in standard unencrypted SQLite format. Protect your device with BitLocker and a strong Windows account password. See `SECURITY_AND_DATA_NOTES.md` for full guidance. |
| **Manual update checking only** | There is no auto-updater. To get a newer version, contact support and download the new installer. Existing data is preserved on reinstall. |
| **No cloud sync** | QMS Desktop is a single-device, local application. Data is not accessible from other devices. Use the Backup/Import Backup feature to transfer data between devices. |
| **License activation requires internet once** | Online activation requires an internet connection. After activation, the app works fully offline. Periodic re-validation may require internet access. |
| **Single-machine license** | Each license is bound to the hardware of one machine. Contact support to move to a different machine. |

---

## System Requirements

- **OS:** Windows 10 (1903+) or Windows 11
- **Architecture:** x64
- **Runtime:** WebView2 (pre-installed on Windows 11; installed automatically on Windows 10)
- **Storage:** ~50 MB for application; additional space for attachments and backups
- **Internet:** Required for initial license activation only

---

*QMS Desktop v1.0.0 — © 2026 QMS Desktop. All rights reserved.*
