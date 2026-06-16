# QMS Desktop — Installation Guide

## Version 1.0.0

---

## Installer Files

Two installer options are provided. Both install the same application:

| File | Type | Notes |
|---|---|---|
| `QMS-Desktop-v1.0.0-x64.msi` | Windows Installer (MSI) | Recommended for enterprise/IT deployments |
| `QMS-Desktop-v1.0.0-x64-setup.exe` | NSIS Setup Wizard | Simpler for individual users |

---

## Step 1 — Verify Installer Integrity

Before installing, verify the SHA256 checksum:

```powershell
Get-FileHash -Algorithm SHA256 QMS-Desktop-v1.0.0-x64.msi
```

Compare the output to `CHECKSUMS-SHA256.txt`. They must match exactly.

---

## Step 2 — Run the Installer

### MSI Installer

1. Double-click `QMS-Desktop-v1.0.0-x64.msi`
2. Windows UAC prompt will appear — click **Yes** (administrator rights required)
3. The installer opens. Click **Next**
4. **EULA / License Agreement page** — read the license agreement, scroll to the bottom, select "I accept the terms in the License Agreement", then click **Next**
5. Choose installation folder (default: `C:\Program Files\QMS Desktop\`) — click **Next**
6. Click **Install**
7. Click **Finish**

### NSIS Setup Wizard

1. Double-click `QMS-Desktop-v1.0.0-x64-setup.exe`
2. Windows UAC prompt will appear — click **Yes**
3. **EULA page** — review the license agreement. Select "I Agree" to continue, or "Cancel" to exit
4. Choose install location — click **Install**
5. Click **Finish** (optionally launch the app immediately)

---

## Step 3 — SmartScreen Warning

Because the installer is not yet code-signed with an EV certificate, Windows SmartScreen may show:

> "Windows protected your PC — Microsoft Defender SmartScreen prevented an unrecognized app from starting."

To proceed:
1. Click **More info**
2. Click **Run anyway**

This is expected and safe. The application code has been reviewed and the installer contains no malware.

---

## Step 4 — First Launch

1. Launch **QMS Desktop** from the Start Menu or Desktop shortcut
2. The license activation screen appears — you must activate a license before proceeding
3. See `LICENSE_ACTIVATION_GUIDE.md` for activation steps
4. After a valid license is confirmed, the **First Admin Setup** screen appears
5. Create your first administrator account (username, full name, and password)
6. Log in with the username and password you just created

---

## Step 5 — License Activation

See `LICENSE_ACTIVATION_GUIDE.md` for full details.

**Summary:**
1. Enter your license key in the activation field
2. Click **Activate Online** (internet connection required)
3. Activation completes — the app proceeds to First Admin Setup
4. After activation, the app works fully offline

---

## Step 6 — First Admin Setup

The **First Admin Setup** screen appears the first time the app runs after activation (or after a database reset).

1. Enter a **Username** (letters and digits only, starts with a letter — e.g., `admin`, `john_doe`)
2. Enter your **Full Name**
3. Enter a **Password** (minimum 8 characters, one uppercase letter, one digit)
4. Confirm your password
5. Click **Create Admin Account**
6. Log in with the username and password you just set

**Important:** The username cannot be changed after creation. Choose it carefully.

---

## Logging In

The login screen accepts:
- **Username** — the username you set during First Admin Setup (case-insensitive)
- **Password** — your account password

---

## Uninstall / Reinstall Behavior

### Uninstall

Run the uninstaller from:
- **Control Panel → Programs → Uninstall a program → QMS Desktop**
- Or: **Settings → Apps → QMS Desktop → Uninstall**

The uninstaller removes all application binaries from `C:\Program Files\QMS Desktop\`.

**Your data is preserved.** The following are NOT deleted on uninstall:

| Path | Contents |
|---|---|
| `%APPDATA%\QMSDesktop\qms.db` | Full QMS database |
| `%APPDATA%\QMSDesktop\license.json` | License token |
| `%APPDATA%\QMSDesktop\uploads\` | All attached files |
| `%APPDATA%\QMSDesktop\backups\` | All backups |
| `%APPDATA%\QMSDesktop\settings.json` | Company settings |

### Reinstall / Upgrade

Install the new version over the existing one. All AppData (database, uploads, backups, license) is preserved automatically. No data migration is needed.

---

## Silent Install (IT/MSI)

```powershell
Start-Process "msiexec.exe" -ArgumentList '/i "QMS-Desktop-v1.0.0-x64.msi" /quiet /norestart' -Verb RunAs -Wait
```

**Note:** Silent install skips the EULA UI but the EULA still applies by accepting the license agreement as part of the deployment.

---

## System Requirements

- **OS:** Windows 10 (build 1903 or later) or Windows 11
- **Architecture:** x64
- **Runtime:** WebView2 (included in Windows 11; auto-installed by NSIS setup on Windows 10)
- **Disk:** ~50 MB for the application
- **Internet:** Required for initial license activation only

---

*QMS Desktop v1.0.0 — © 2026 QMS Desktop. All rights reserved.*
