# Phase 10B — Hotfix Report
# License Signing Fix, License Key Format, Menu Bar, Fullscreen, App Icon

**Date:** 2026-06-15  
**Phase:** 10B  
**Status:** Complete  
**Build:** TypeScript ✓ | Rust ✓ | MSI 3.50 MB | NSIS 2.11 MB

---

## 1. Root Cause — ASN.1 DER Signing Error

### Error observed

```
activate-license error: DOMExceptionDataError:
  ASN.1 DER message is incomplete: expected 1, actual 0 at DER byte 0
  at importKeyRSA
  at getPrivateKey in supabase/functions/_shared/rsa.ts
  at signToken
  at activate-license/index.ts
```

"DER byte 0 at actual 0" = the DER buffer passed to `crypto.subtle.importKey` was **0 bytes**.

### Root cause

`pemToBytes()` in `_shared/rsa.ts` stripped PEM headers and whitespace to extract the base64 payload. However, if `LICENSE_PRIVATE_KEY_PEM` was stored in Supabase with **literal `\n`** (two characters: backslash + n, produced by CLI escaping) instead of real newlines, the `\s+` whitespace regex did NOT strip them. The backslash character (`\`) is not a base64 character, so `atob()` discarded it and the resulting binary blob was incomplete or empty. `crypto.subtle.importKey` then received 0-byte DER and threw the ASN.1 error.

Secondary risk: If the key was in PKCS#1 format (`-----BEGIN RSA PRIVATE KEY-----`) instead of PKCS#8 (`-----BEGIN PRIVATE KEY-----`), the header-stripping regex had no match, leaving garbage in the base64 string.

### Fix applied

`supabase/functions/_shared/rsa.ts` — `getPrivateKey()` rewritten:

```typescript
// Normalize: literal \n (CLI-escaped) → real newlines
const pem = raw.replace(/\\n/g, "\n").trim();

// Detect and reject PKCS#1 with clear error + conversion command
if (isPkcs1) throw new Error("PKCS#1 format. Convert: openssl pkcs8 -topk8 -nocrypt ...");

// Validate DER length before calling importKey
if (derBytes.byteLength === 0) throw new Error("Private key DER payload is empty");
```

Safe diagnostic logs added (presence, PEM type, DER byte length — **never** key content).

---

## 2. Exact Secret Reset Command

Use this method to set `LICENSE_PRIVATE_KEY_PEM` reliably (documented in `docs/RUNBOOK.md`):

```powershell
# Read PEM file, escape newlines to literal \n, set secret
$privateKey = (Get-Content ".\license_private_key.pem" -Raw).Trim()
$privateKeyEscaped = $privateKey -replace "`r`n", "\n" -replace "`n", "\n"
supabase.cmd secrets set LICENSE_PRIVATE_KEY_PEM="$privateKeyEscaped"
```

The Edge Function's `replace(/\\n/g, "\n")` un-escapes them back to real newlines at runtime.

**Key format required:** PKCS#8 (`-----BEGIN PRIVATE KEY-----`).  
Convert from PKCS#1 if needed: `openssl pkcs8 -topk8 -nocrypt -in private.pem -out private_pkcs8.pem`

---

## 3. Supabase Functions Deployed

| Function | Flag | Includes |
|---|---|---|
| `activate-license` | `--no-verify-jwt` | `index.ts`, `_shared/rsa.ts`, `_shared/cors.ts` |
| `validate-license` | `--no-verify-jwt` | `index.ts`, `_shared/rsa.ts`, `_shared/cors.ts` |
| `admin-generate-license` | `--no-verify-jwt` | `index.ts`, `_shared/rsa.ts`, `_shared/auth.ts`, `_shared/email.ts`, `_shared/cors.ts` |

All deployed to project `kumgncvwtkcbgdgqxmju`.

---

## 4. License Key Character Set

| Property | Value |
|---|---|
| Format | `QMS-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX` |
| Groups | 5 × 6 characters |
| Charset | `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (31 chars) |
| Letters excluded | O (looks like 0), I (looks like 1), L (looks like 1) |
| Digits excluded | 0 (looks like O), 1 (looks like I/L) |
| Digits included | 2, 3, 4, 5, 6, 7, 8, 9 |
| Key stored | Hash + last4 only — raw key shown once, never stored |

The charset already included digits before this phase. The deployed function now matches the current source file.

---

## 5. Native Menu Bar — Implementation

### File: `src-tauri/src/lib.rs`

Function `build_app_menu<R: tauri::Runtime>(app: &AppHandle<R>)` constructs:

| Menu | Items |
|---|---|
| **File** | Create Backup, Open Backup Folder, ─── , Exit |
| **View** | Reload, ─── , Toggle Full Screen (F11), ─── , Zoom In (Ctrl+Equal), Zoom Out (Ctrl+Minus), Reset Zoom (Ctrl+0) |
| **Tools** | Settings, License |
| **Help** | About QMS Desktop |

Menu set via `.setup(|app| { app.set_menu(build_app_menu(app.handle())?)?; Ok(()) })`.

Event handler via `.on_menu_event(|app, event| { ... })`:
- `quit` → `app.exit(0)` (handled in Rust)
- `toggle-fullscreen` → `w.set_fullscreen(!w.is_fullscreen())` (handled in Rust)
- `reload` → `w.eval("location.reload()")` (handled in Rust)
- All others → `w.emit("menu-action", id)` → forwarded to frontend

### File: `src/App.tsx`

`MenuListener` component (renders `null`) inside `HashRouter` — listens to `menu-action` events:

| Action | Behavior |
|---|---|
| `navigate-settings` | `navigate('/settings')` |
| `navigate-license` | `navigate('/license')` |
| `zoom-in` | `documentElement.style.zoom = +0.1` (capped at 2.0) |
| `zoom-out` | `documentElement.style.zoom = -0.1` (min 0.5) |
| `zoom-reset` | `documentElement.style.zoom = '1'` |
| `about` | `window.alert(...)` — app name, version, description |
| `create-backup` / `open-backups-folder` | `navigate('/backup')` |

If `bootstrapState !== 'ready'`, React Router naturally redirects navigation attempts — no special guard needed.

---

## 6. Fullscreen — Implementation

- `View → Toggle Full Screen` and `F11` call `WebviewWindow::set_fullscreen(!is_fullscreen)`.
- Toggles true native fullscreen: hides Windows title bar, covers entire screen.
- F11 or the menu item again exits fullscreen.
- Window minimize button remains normal minimize; maximize remains normal maximize.
- Kiosk mode not used — user can always exit via menu or F11.
- `tauri.conf.json` `"fullscreen": false` is the default startup state (unchanged).

---

## 7. App Icon — Files Created/Modified

**Source image generated:** `scripts/source_icon.png` (1024×1024 PNG)
- Navy blue `#1E3A5F` rounded-rectangle background (radius 180px)
- White bold "Q" (Segoe UI, 560px, centered with slight upward shift for Q tail)
- Generated via `scripts/generate-icon.ps1` using PowerShell System.Drawing

**Script:** `scripts/generate-icon.ps1` — documents the generation process for future re-runs.

**Icon sizes generated** by `npm run tauri icon scripts/source_icon.png`:

| Target | Files |
|---|---|
| Windows | `icons/32x32.png`, `icons/64x64.png`, `icons/128x128.png`, `icons/128x128@2x.png`, `icons/icon.png`, `icons/icon.ico` |
| macOS | `icons/icon.icns` |
| Windows Store | `icons/StoreLogo.png`, Square PNGs at 5 sizes |
| iOS | 18 AppIcon variants |
| Android | mipmap hdpi/mdpi/xhdpi/xxhdpi/xxxhdpi (foreground, round, standard) |

All existing icon files in `src-tauri/icons/` replaced with the new Q icon.  
MSI and NSIS installers automatically use `icon.ico` from the icons directory.

---

## 8. Build Result

| Step | Result |
|---|---|
| `npm run build` (TypeScript + Vite) | ✓ Clean — 1640 modules, 2.25 s |
| `cargo check` (Rust) | ✓ Clean — 2.35 s incremental |
| `npm run tauri build` (release) | ✓ 2 m 17 s |
| MSI installer | ✓ 3.50 MB |
| NSIS installer | ✓ 2.11 MB |
| AppControl workaround | Applied — 23 build scripts trusted |

---

## 9. Artifact Paths

| Artifact | Path |
|---|---|
| MSI (test-builds) | `D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase10b-hotfix-second-device-test.msi` |
| NSIS (test-builds) | `D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase10b-hotfix-second-device-test-setup.exe` |
| MSI (release) | `C:\Users\roaas\.cargo\targets\qms-desktop\release\bundle\msi\QMS Desktop_1.0.0_x64_en-US.msi` |
| NSIS (release) | `C:\Users\roaas\.cargo\targets\qms-desktop\release\bundle\nsis\QMS Desktop_1.0.0_x64-setup.exe` |

---

## 10. Second-Device Test Steps

Use these steps to verify the RSA signing fix on the second device:

### Pre-condition: Secret must be set correctly

1. Verify you have a **PKCS#8** private key file (`-----BEGIN PRIVATE KEY-----`).
   If PKCS#1, convert: `openssl pkcs8 -topk8 -nocrypt -in private.pem -out private_pkcs8.pem`
2. Set the secret:
   ```powershell
   $pk = (Get-Content ".\license_private_key.pem" -Raw).Trim()
   $pkEsc = $pk -replace "`r`n", "\n" -replace "`n", "\n"
   supabase.cmd secrets set LICENSE_PRIVATE_KEY_PEM="$pkEsc"
   ```
3. Verify in logs after attempt: `supabase.cmd functions logs activate-license`
   Look for: `[rsa] PEM type detected: PKCS#8 (correct)` and `[rsa] DER byte length after decode: 1218` (or similar non-zero number).

### Activation test on second device

4. Install `QMS-Desktop-1.0.0-phase10b-hotfix-second-device-test.msi` on the second device.
5. App should open to the License gate screen.
6. Enter a valid license key (generated from admin portal).
7. Click Activate.
8. Expected: Activation succeeds, app proceeds to first-admin or login screen.
9. If still failing: check Supabase Edge Function logs for the new diagnostic messages.

### Menu bar test

10. After login, verify the native menu bar appears: File | View | Tools | Help.
11. View → Toggle Full Screen → screen goes fullscreen (title bar hidden).
12. F11 → exits fullscreen.
13. View → Zoom In → UI scales up. View → Reset Zoom → returns to normal.
14. Tools → Settings → navigates to Settings page.
15. Tools → License → navigates to License page.
16. Help → About QMS Desktop → shows version alert.
17. File → Exit → closes the application.

### Icon test

18. Check Windows taskbar and title bar for the new navy Q icon.
19. Check desktop shortcut icon (if created by installer).

---

## 11. Known Issues (Carried from Phase 10)

| ID | Severity | Description | Status |
|---|---|---|---|
| BUG-03 | Medium | `tauri-plugin-sql` unused dependency in Cargo.toml | Deferred Phase 11 |
| BUG-04 | Medium | `DATABASE_SCHEMA.md` column name inaccuracies | Deferred Phase 11 |
| BUG-05 | Medium | `App.tsx` bootstrap catch routes to login on storage init failure | Deferred Phase 11 |
| BUG-06 | Medium | Reports page shows all 6 reports to all roles; lower roles get auth errors | Deferred Phase 11 |
| BUG-08 | Low | RSA public key in binary needs verification against Supabase private key | Before first commercial activation |
| BUG-09 | Low | `expires_at = ""` hides Expires row in License details (`??` vs `\|\|`) | Deferred Phase 11 |

**New known issue:**
- **MENU-01 (Low):** `File → Create Backup` and `File → Open Backup Folder` navigate to `/backup` page. They do not directly trigger the command. This is intentional to avoid calling backup commands without the current user's auth context.
- **MENU-02 (Low):** Zoom uses CSS `documentElement.style.zoom` (Chromium-supported, non-standard). Layout may shift at extreme zoom levels. Acceptable for a menu utility feature.

---

## 12. Confirmations

- [ ] No private key printed or logged at any point
- [ ] No service role key in desktop binary
- [ ] No private key in desktop binary (only RSA-2048 public key in `rsa_public_key.rs`)
- [ ] No raw license keys stored (hash + last4 only)
- [ ] No AppData deletion logic added
- [ ] No QMS business data uploaded
- [ ] No UI polish started (Phase 11 scope)
- [ ] No git commit created
- [ ] No database schema changed
- [ ] No Supabase schema changed
- [ ] No payment/billing/cloud sync touched
