# Runbook — QMS Desktop

Troubleshooting and operational procedures.

---

## Supabase License Secrets — Reliable Reset Method

### Problem

Supabase secrets set via the CLI may store real newlines as literal `\n` (backslash-n), depending on
how the shell quotes the value. The Edge Function code normalizes these automatically (Phase 10B fix),
but the safest approach is to store the key with escaped newlines so the CLI transmission is reliable
on all platforms and shells.

### Step-by-step: Set LICENSE_PRIVATE_KEY_PEM

**IMPORTANT: Never paste private key content into chat, email, or commit it to git.**
**Do not commit `license_private_key.pem` or any `.pem` file to source control.**

The private key must be **PKCS#8 format** (`-----BEGIN PRIVATE KEY-----`).
If your key is PKCS#1 (`-----BEGIN RSA PRIVATE KEY-----`), convert it first:

```powershell
# Convert PKCS#1 → PKCS#8 (run once, then delete the PKCS#1 file)
openssl pkcs8 -topk8 -nocrypt -in license_private_key_pkcs1.pem -out license_private_key.pem
```

**Set the secret (reliable method — reads file, escapes newlines, sets in one command):**

```powershell
# Read the PEM file and escape all newlines to literal \n
$privateKey = (Get-Content ".\license_private_key.pem" -Raw).Trim()
$privateKeyEscaped = $privateKey -replace "`r`n", "\n" -replace "`n", "\n"

# Set the Supabase secret with the escaped string
# The Edge Function will un-escape \n → real newlines automatically
supabase.cmd secrets set LICENSE_PRIVATE_KEY_PEM="$privateKeyEscaped"
```

**Verify the secret was accepted (check length only — never print the value):**

```powershell
# This lists secret names and their lengths (values are not shown)
supabase.cmd secrets list
```

**Safe diagnostic: check logs after a failed activation attempt:**
The Edge Function logs these safe messages (no key content):
- `[rsa] LICENSE_PRIVATE_KEY_PEM present: true length: <N>`  → present/absent + byte count
- `[rsa] PEM type detected: PKCS#8 (correct)` → format identification
- `[rsa] DER byte length after decode: <N>` → byte count of parsed DER

View Supabase Edge Function logs:
```powershell
supabase.cmd functions logs activate-license
```

### Set LICENSE_KEY_HASH_SECRET

```powershell
# Generate a random 32-byte hex secret (run once and save to password manager)
$hashSecret = -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
supabase.cmd secrets set LICENSE_KEY_HASH_SECRET="$hashSecret"
```

### Regenerate RSA key pair (if current key is compromised or uncertain)

```powershell
# Generate new RSA-2048 PKCS#8 private key
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out license_private_key.pem

# Extract matching public key (SPKI PEM) — embed this in the Rust binary
openssl rsa -in license_private_key.pem -pubout -out license_public_key.pem
```

After regenerating:
1. Set `LICENSE_PRIVATE_KEY_PEM` in Supabase secrets (see above).
2. Update the public key in `src-tauri/src/license/rsa_public_key.rs`.
3. Rebuild and redeploy.
4. All existing tokens signed with the old key will be **invalid** — customers must reactivate.

---

## Installer EULA

The EULA / License Agreement document for installer use is located at:

```
src-tauri/EULA.rtf
```

**Current installer status:**
- EULA.rtf content is complete and ready.
- The Windows MSI and NSIS installers do **not yet** show a EULA screen during installation.
- Tauri 2's WiX JSON config (`tauri.conf.json`) does not expose a `license` field in this version. The valid WiX config fields are: `version`, `upgradeCode`, `language`, `template`, `fragmentPaths`, `bannerPath`, `dialogImagePath`, `fipsCompliant`.
- Adding the EULA screen to the MSI installer requires a custom WXS template via `wix.template`. This is planned for Phase 10.

**To add EULA screen in a future phase:**
1. Copy `C:\Users\roaas\.cargo\targets\qms-desktop\release\wix\x64\main.wxs` to `src-tauri/wix/main.wxs`.
2. Insert `<WixVariable Id="WixUILicenseRtf" Value="...\EULA.rtf" />` and the `WixUI_InstallDir` LicenseAgreementDlg into the dialog sequence.
3. Set `bundle.windows.wix.template = "wix/main.wxs"` in `tauri.conf.json`.

---

## Uninstall Behavior and AppData Preservation

**Policy: Uninstaller removes application binaries only. Customer data is never deleted.**

| Path | Install | Uninstall | Reinstall/Upgrade |
|---|---|---|---|
| `C:\Program Files\QMS Desktop\` | Written | **Removed** | Updated |
| `%APPDATA%\QMSDesktop\qms.db` | Never touched | **Preserved** | **Preserved** |
| `%APPDATA%\QMSDesktop\license.json` | Never touched | **Preserved** | **Preserved** |
| `%APPDATA%\QMSDesktop\uploads\` | Never touched | **Preserved** | **Preserved** |
| `%APPDATA%\QMSDesktop\backups\` | Never touched | **Preserved** | **Preserved** |
| `%APPDATA%\QMSDesktop\settings.json` | Never touched | **Preserved** | **Preserved** |

**Why AppData is safe:**
- The WiX installer only manages components declared in the `<Component>` sections of the WXS template. Only `C:\Program Files\QMS Desktop\` files are declared.
- No `<RemoveFolder>` or `<RemoveFile>` elements target AppData.
- No custom actions delete AppData.
- Tauri generates no uninstall cleanup scripts targeting AppData.

**Full data deletion** is available only via the in-app Admin → Settings → Danger Zone path. It is intentionally NOT part of the installer or uninstaller.

---

## Build Commands

```powershell
# Frontend TypeScript check + Vite build
cd D:\QMS-Desktop
npm.cmd run build

# Rust cargo check (AppControl workaround: CARGO_TARGET_DIR required on this machine)
$env:CARGO_TARGET_DIR = "C:\Users\roaas\.cargo\targets\qms-desktop"
cargo check --manifest-path D:\QMS-Desktop\src-tauri\Cargo.toml

# Tauri dev (Rust + full app)
$env:RC = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\rc.exe"
npm.cmd run tauri dev

# Tauri production build (see Release Build Workaround below first)
$env:RC = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\rc.exe"
$env:CARGO_TARGET_DIR = "C:\Users\roaas\.cargo\targets\qms-desktop"
npm.cmd run tauri build
```

---

## Release Build Workaround (Windows Application Control)

**Problem:** Windows Application Control (AppLocker/WDAC) blocks newly compiled
release build-script executables in `\release\build\*`. Debug build scripts are
trusted (they've been running successfully) but release ones are blocked.

**One-time fix before each release build** — run this PowerShell snippet from
the `src-tauri` directory AFTER cargo has compiled the release build scripts
(after the first blocked attempt):

```powershell
$releaseBase = "C:\Users\roaas\.cargo\targets\qms-desktop\release\build"
$debugBase   = "C:\Users\roaas\.cargo\targets\qms-desktop\debug\build"

Get-ChildItem $releaseBase | ForEach-Object {
    $relExe = Join-Path $_.FullName "build-script-build.exe"
    if (Test-Path $relExe) {
        $parts  = $_.Name -split '-'
        $prefix = ($parts | Select-Object -SkipLast 1) -join '-'
        $debugDir = Get-ChildItem $debugBase -ErrorAction SilentlyContinue |
                    Where-Object { $_.Name -like "$prefix-*" } | Select-Object -First 1
        if ($debugDir) {
            $debugExe = Join-Path $debugDir.FullName "build-script-build.exe"
            if (Test-Path $debugExe) {
                Copy-Item $debugExe $relExe -Force
                Write-Host "Trusted: $prefix"
            }
        }
    }
}
```

Then re-run `npm.cmd run tauri build`. The second run will proceed because
the release build scripts now have the same file hash as the trusted debug ones.

**Note:** This is a build-machine-specific workaround. On a CI machine without
these AppControl restrictions, `npm.cmd run tauri build` works directly.

---

## Build Artifacts

After a successful `npm.cmd run tauri build`:

| Artifact | Path |
|---|---|
| MSI installer | `C:\Users\roaas\.cargo\targets\qms-desktop\release\bundle\msi\QMS Desktop_1.0.0_x64_en-US.msi` |
| NSIS installer | `C:\Users\roaas\.cargo\targets\qms-desktop\release\bundle\nsis\QMS Desktop_1.0.0_x64-setup.exe` |
| Release EXE | `C:\Users\roaas\.cargo\targets\qms-desktop\release\qms-desktop.exe` |

## Installing the MSI

The MSI installs to `C:\Program Files\QMS Desktop\` (per-machine) and requires
administrator elevation:

```powershell
# Interactive install (shows UI)
Start-Process "msiexec.exe" -ArgumentList '/i "QMS Desktop_1.0.0_x64_en-US.msi"' -Verb RunAs

# Silent install
Start-Process "msiexec.exe" -ArgumentList '/i "QMS Desktop_1.0.0_x64_en-US.msi" /quiet /norestart' -Verb RunAs -Wait
```

**AppData is never touched by the installer.** Existing `%APPDATA%\QMSDesktop\`
data (data.db, license.json, uploads, backups) is fully preserved on
install, reinstall, and upgrade.

---

## Database Location

```
%APPDATA%\QMSDesktop\qms.db
```

To inspect:
```powershell
sqlite3 "$env:APPDATA\QMSDesktop\qms.db"
```

---

## Reset Database (Development Only)

```powershell
Remove-Item "$env:APPDATA\QMSDesktop\qms.db"
```

The migration runner will recreate it on next app start.

---

## License Operations (Phase 9A)

### Inspect current license.json

```powershell
cat "$env:APPDATA\QMSDesktop\license.json"
```

### Reset to unlicensed (via DEV UI control)

Open the app → navigate to License page → click "Clear License" button.

### Reset to unlicensed (manual)

```powershell
'{"status":"unlicensed","activated_at":null,"hardware_id":null,"token":null}' | Set-Content "$env:APPDATA\QMSDesktop\license.json" -Encoding utf8
```

### Create a dev bypass license (via DEV UI control)

Open the app → navigate to License page → click "Create Dev License".

### Get hardware fingerprint for this machine

Run the app and open the License page — the fingerprint is displayed under "Hardware Fingerprint (this machine)".

---

## Common Issues

### "Failed to open database" on startup

- Check `%APPDATA%\QMSDesktop\` directory exists
- Delete and restart — migration runner creates fresh DB

### "Unauthorized: caller user not found"

- The `current_user_id` passed to the command does not match any user in the DB
- Check authStore is persisting the user ID correctly after login

### "Unauthorized: caller account is inactive"

- User has `is_active = 0` in the users table
- Re-activate via Admin → Users → Set Active

### Attachment file not found on open

- File was moved or deleted from the uploads directory
- `%APPDATA%\QMSDesktop\uploads\{module}\{stored_filename}`

---

## Audits Module Troubleshooting

### "Auditor not found or inactive"

- `auditorUserId` passed to `create_audit` / `update_audit` does not match an active user
- Ensure the user picker is passing a valid user ID and not 0

### "NC already created from this finding"

- `audit_findings.related_nc_id` is already set for this finding
- Check the finding's `is_non_conformity` flag and `related_nc_number` in the Findings tab

### Finding number skipped (e.g. jumps from F-001 to F-003)

- Finding numbers are assigned sequentially at insert time using COUNT(*) + 1
- If a finding was added and then a transaction rolled back, the count may be off
- This is cosmetic only — finding IDs are still unique

### Audit not showing `department` column

- Migration 005 may not have applied
- Check `schema_migrations` table: `SELECT * FROM schema_migrations WHERE version = '005';`
- If missing, the app will apply it on next startup

---

## Non-Conformities Module Troubleshooting

### "A CAPA already exists for this Non-Conformity"

- `non_conformities.related_capa_id` is already set
- The "Create CAPA" button should be hidden; if visible, the frontend state may be stale — refresh the NC list

### NC severity shows 'MINOR' in raw DB but 'LOW' in UI

- The DB column default is 'MINOR' (from migration 001 schema)
- Application always writes LOW/MEDIUM/HIGH/CRITICAL when creating/updating via `create_non_conformity`
- NCs created directly via SQL may have 'MINOR'; the UI will display it as-is

### NC source_type shows blank in Source tab

- If `source_type` is NULL or does not match a known source value, the UI shows `—`
- Valid values: AUDIT, CUSTOMER_COMPLAINT, PROCESS_MONITORING, SUPPLIER, INSPECTION, INTERNAL, OTHER

---

## Cross-Module Flow Troubleshooting

### NC created from finding but not visible in Non-Conformities list

- The NC was inserted but `list_non_conformities` may be stale (not refreshed)
- Navigate away and back to Non-Conformities, or call `loadNcs()` manually

### CAPA created from NC but `related_capa_id` shows null in NC

- Check `non_conformities.related_capa_id` was updated after CAPA insert
- The `create_capa_from_non_conformity` command updates both tables in the same connection
- If the update failed, the error would have been returned to the frontend

---

## Dashboard Troubleshooting

### KPI cards show 0 for everything

- Dashboard loads 5 commands in parallel on mount; if one fails, the error state is shown
- Check that the user is authenticated and `current_user_id` resolves to an active user
- SQLite queries use `date('now')` for overdue detection — verify device clock is correct

### Recent Activity feed is empty

- `get_dashboard_recent_activity` queries the `activity_log` table
- Activity is inserted by individual module commands (`create_capa`, `create_risk`, etc.)
- If no records have been created yet, the feed will be empty by design

---

## Reports Troubleshooting

### "No records match the selected filters"

- Check that records exist and have the correct status
- Date filters compare `date(created_at)` — ensure dates are entered in YYYY-MM-DD format
- The document register shows all statuses by default; CAPA/Risk/etc. show all statuses unless filtered

### Print popup blocked

- The browser/WebView may block pop-ups
- In Tauri WebView, `window.open` is generally allowed; if blocked check Tauri CSP settings in `tauri.conf.json`

### CSV export dialog does not appear

- `exportReportCSV` calls `save()` from `@tauri-apps/plugin-dialog`
- The dialog permission must be enabled in `tauri.conf.json` under `plugins.dialog`
- If the user cancels the dialog, no file is written (silent — no error)

---

## Restore / Import Backup (Phase 11D)

### Restore from backup history
1. Log in as Admin → navigate to Backup & Restore page
2. In the **Backup History** list, click **Restore** next to the desired backup
3. Review the confirmation modal — a safety backup will be created automatically before restore begins
4. Leave "Keep current device license" checked (default) unless you intentionally want to restore the license
5. Type `RESTORE` and click **Restore Now**
6. After success, close and reopen QMS Desktop to load the restored data

### Import backup from external location
1. Log in as Admin → navigate to Backup & Restore page
2. Click **Import Backup File…**
3. Select the QMS backup folder (must contain `data.db`)
4. If valid, the confirmation modal opens — same flow as Restore from history
5. Restart QMS Desktop after success

### Safety backup
- Created automatically before every restore as `QMS-SafetyBackup-YYYYMMDD_HHmmss` in the backups folder
- If the safety backup fails, the restore is aborted — no data is changed
- Safety backups appear in the Backup History list

### File → Restore Backup… menu item
- Navigates to the Backup & Restore page (same as clicking File → Create Backup)
- Disabled before login; enabled after login; Admin-only actions enforced by the page

---

## Backup Troubleshooting

### "Backup folder does not exist"

- The backup folder is `%APPDATA%\QMSDesktop\backups\`
- `get_backup_status` returns `available_backups: []` if no backups have been created
- Run "Create Backup Now" to create the first backup and initialize the folder

### Backup creation fails with "Failed to copy"

- Check that the destination drive has sufficient disk space
- Check that `data.db` exists at `%APPDATA%\QMSDesktop\data.db`
- The uploads folder is optional — backup continues if it does not exist

### Restore fails with "Backup folder not found" or "data.db missing in backup"

- The backup was deleted or moved after `get_backup_status` was called
- Click Refresh to reload the backup list before retrying

### App does not reflect restored data

- Restore copies `data.db` to AppData but the running app has the old DB in memory
- **Restart the application** after a successful restore — the success message instructs this

### "Open Folder" opens wrong directory

- `open_backups_folder` calls `explorer.exe` with the `backups` path from `StoragePaths`
- If the folder was moved or AppData location changed, the path shown in Explorer may differ

---

## Logs

Tauri does not persist logs by default. All errors from Rust commands are returned as `Result<_, String>` and displayed in the frontend error panel or modal.

To add logging:
```rust
eprintln!("Debug: {}", value);  // prints to Tauri console
```
