# QMS Desktop — Backup and Restore Guide

## Version 1.0.0

---

## Overview

QMS Desktop stores all data locally on your device. It is your responsibility to create regular backups. The Backup & Restore page provides tools to create, manage, and restore backups — all stored locally.

**Admin account required for all backup and restore operations.**

---

## Backup Location

Backups are stored in:
```
%APPDATA%\QMSDesktop\backups\
```

Each backup is a folder named `QMS-Backup-YYYYMMDD_HHmmss` containing:
- `data.db` — the full QMS database
- `settings.json` — company settings (name, logo reference, etc.)
- `license.json` — your license token
- `uploads/` — all file attachments (documents, CAPA files, etc.)

---

## Creating a Backup

1. Log in as **Admin**
2. Navigate to **Backup & Restore** (sidebar, or File menu)
3. Click **Create Backup Now**
4. A backup folder is created in `%APPDATA%\QMSDesktop\backups\`
5. The backup appears in the **Backup History** list immediately

**Recommended:** Create a backup before any significant data entry session, before restoring, and before upgrading to a new version.

---

## Restoring from Backup History

1. Log in as **Admin**
2. Navigate to **Backup & Restore**
3. In the **Backup History** list, find the backup you want to restore
4. Click **Restore** on that entry
5. The **Restore Confirmation** modal appears — read it carefully
6. **Safety backup notice:** A safety backup will be created automatically before the restore begins. If the safety backup fails, the restore is aborted — your current data is safe.
7. **License option:** Leave "Keep current device license" checked (default) to preserve your current license. Uncheck only if you intentionally want to restore the license from the backup.
8. Type **RESTORE** in the confirmation field
9. Click **Restore Now**
10. After success, a "Restart Required" banner appears — **close and reopen QMS Desktop** to load the restored data

---

## Importing a Backup from an External Location

Use this to restore a backup from a USB drive, network share, or any folder outside the normal backup location.

1. Log in as **Admin**
2. Navigate to **Backup & Restore**
3. Click **Import Backup File…**
4. A folder picker opens — browse to and select the QMS backup folder (must contain a `data.db` file inside it)
5. If the folder is valid, the Restore Confirmation modal opens — same flow as restoring from history
6. Complete the restore as described above
7. Restart QMS Desktop after success

**The import path cannot be inside the QMSDesktop AppData directory.** If you want to restore from an existing backup in the backups folder, use the Backup History list instead.

---

## Safety Backup

Before every restore, QMS Desktop automatically creates a safety backup:

- Named `QMS-SafetyBackup-YYYYMMDD_HHmmss` (stored in the same backups folder)
- Created **before** any data is changed
- If the safety backup fails (e.g., disk full), the restore is **aborted** — your current data is untouched
- Safety backups do NOT appear in the Backup History list (they are excluded to keep the restore history clean)
- Safety backups CAN be found in `%APPDATA%\QMSDesktop\backups\` using File Explorer

---

## License Preservation

By default, restoring a backup does **NOT** restore the license file. Your current device license is kept.

This is the correct behavior in almost all cases:
- The license is bound to your hardware
- A backup's license.json from another machine cannot be used on your machine anyway
- Restoring the license accidentally could make the license appear invalid

**Only uncheck "Keep current device license"** if you are intentionally restoring a full system clone to the same machine.

---

## Transferring Data to Another Machine

To move QMS Desktop to a new machine:

1. On the old machine: **Create a Backup** (Backup & Restore → Create Backup Now)
2. Copy the backup folder from `%APPDATA%\QMSDesktop\backups\QMS-Backup-*` to a USB drive or network share
3. On the new machine: Install QMS Desktop and activate your license
4. On the new machine: **Import Backup File…** and select the backup folder you copied
5. Leave "Keep current device license" checked (the new machine has its own license binding)
6. Restart QMS Desktop — your data is restored

---

## File Menu — Backup Shortcuts

- **File → Create Backup** — creates a backup immediately (same as using the page)
- **File → Restore Backup…** — navigates to the Backup & Restore page

Both items are disabled until you log in.

---

## Admin-Only Restriction

All backup and restore actions require an Admin account. Non-Admin users see the Backup & Restore page with a notice but cannot perform any actions. All Rust backend commands enforce this — it is not possible to bypass via URL.

---

## Recommended Backup Schedule

| Frequency | Trigger |
|---|---|
| Daily | At end of each working day if QMS data was modified |
| Before significant data entry | Before adding a batch of records |
| Before restore | Automatic (safety backup created for you) |
| Before upgrading | Before installing a new QMS Desktop version |
| Monthly offsite | Copy a monthly backup to an encrypted external drive or secure network location |

---

## Troubleshooting

| Issue | Resolution |
|---|---|
| "Backup folder does not exist" | Create your first backup — the folder is initialized automatically. |
| Restore fails with "Safety backup failed" | Disk may be full. Free space in `%APPDATA%\QMSDesktop\backups\` and try again. |
| Backup list is empty after restore | You may need to click **Refresh** or navigate away and back to reload the list. |
| App still shows old data after restore | Restart QMS Desktop. The running app uses the old in-memory data until restarted. |
| "Backup folder is inside QMSDesktop data directory" | You selected a folder inside AppData. Use the Backup History list to restore from those backups. |
| "Selected folder does not contain data.db" | The selected folder is not a valid QMS backup folder. Select a folder that contains `data.db`. |

---

*QMS Desktop v1.0.0 — © 2026 QMS Desktop. All rights reserved.*
