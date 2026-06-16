# Phase 11F — Report
# Installer EULA, Icon, Branding, and Release Visual Identity

**Date:** 2026-06-16
**Phase:** 11F
**Status:** Complete
**Build:** TypeScript ✓ | Rust ✓ | MSI 3.51 MB | NSIS 2.13 MB

---

## 1. Branch Created

`phase-11f-installer-eula-branding` (branched from `main` after Phase 11E merge)

---

## 2. Files Modified

| File | Change |
|---|---|
| `src-tauri/tauri.conf.json` | Added `licenseFile`, `copyright` to bundle config |

## 3. Files Created / Updated

| File | Description |
|---|---|
| `src-tauri/icons/*.png` | All PNG icon sizes regenerated with new checkmark design |
| `src-tauri/icons/icon.ico` | Windows ICO regenerated (all sizes: 16, 32, 48, 64, 128, 256) |
| `src-tauri/icons/icon.icns` | macOS ICNS regenerated |
| `src-tauri/icons/Square*.png` | Windows Store APPX icon sizes regenerated |
| `docs/reports/PHASE_11F_INSTALLER_EULA_BRANDING_REPORT.md` | This report |

---

## 4. Source Code Changed

**No Rust/TypeScript source code changed.** All changes are to config files and icon assets.

---

## 5. Database Schema Changed

**No.**

---

## 6. EULA Installer Result

### MSI (WiX): ✓ EULA screen implemented

The Tauri WiX template uses `{{#unless license}}` to skip the `LicenseAgreementDlg` dialog. When `bundle.licenseFile` is set, the template:
1. Removes the "Skip license dialog" `<Publish>` elements from the dialog sequence
2. Adds `<WixVariable Id="WixUILicenseRtf" Value="<absolute-path-to-EULA.rtf>" />`
3. The `WixUI_InstallDir` standard dialog set then naturally includes the `LicenseAgreementDlg`

Confirmed in generated `main.wxs`:
```xml
<WixVariable Id="WixUILicenseRtf" Value="C:\...\release\wix\EULA.rtf" />
```

### NSIS (Setup.exe): ✓ EULA screen implemented

The Tauri NSIS template has `!define LICENSE "{{license}}"`. When non-empty, the installer includes:
```nsis
!insertmacro MUI_PAGE_LICENSE "${LICENSE}"
```

Confirmed in generated `installer.nsi`:
```nsis
!define LICENSE "C:\...\release\nsis\x64\license_file"
```

### Config change (tauri.conf.json)

```json
"bundle": {
  "licenseFile": "EULA.rtf",
  "copyright": "© 2026 QMS Desktop. All rights reserved.",
  ...
}
```

The `licenseFile` path is relative to `src-tauri/`. Tauri resolves it to an absolute path and substitutes it into both the WiX and NSIS templates.

### Discovery note

The `licenseFile` field at `bundle` level is supported by the Tauri 2.11.2 bundler but was **not listed in `config.schema.json`** — the JSON schema was outdated. The actual template in the CLI binary (`cli.win32-x64-msvc.node`) contains `{{license}}` in both WiX and NSIS templates. The field works correctly and was confirmed in the build output.

---

## 7. EULA File

- **Path:** `src-tauri/EULA.rtf`
- **Format:** RTF (Rich Text Format) — compatible with both WiX LicenseAgreementDlg and NSIS MUI_PAGE_LICENSE
- **Sections:** 12 sections covering: License Grant, Activation, Device Binding, Restrictions, Local Data Storage, Backups, Disclaimer of Warranties, Limitation of Liability, Termination, Governing Law, Entire Agreement, Support and Contact
- **No legal secrets, no contact details beyond support email placeholder**

---

## 8. Icon Files Updated

**New design:** White bold checkmark on navy blue (#1E3A5F) rounded square background.

**Icon concept:** Checkmark = quality check/approval — universally understood QA symbol. Clean and recognizable at all sizes including 16×16.

**Generation process:**
1. 1024×1024 source PNG created using PowerShell `System.Drawing` — navy rounded square (radius 160px) + white bold checkmark (95px stroke, rounded caps/join)
2. `npm exec tauri icon icon-source-1024.png` ran — generated all required sizes automatically
3. Source PNG removed after generation

**Files updated (all in `src-tauri/icons/`):**
- `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`, `icon.png`
- `icon.ico` (embedded in app window, shortcuts, installer)
- `icon.icns` (macOS)
- `StoreLogo.png`, `Square30x30Logo.png` through `Square310x310Logo.png` (Windows Store)
- iOS and Android variants

**Referenced in `tauri.conf.json`:** `icons/icon.ico` used for window icon and installer icon.

---

## 9. Branding Cleanup

| Item | Before | After |
|---|---|---|
| Installer EULA | None (skipped) | Full RTF license agreement displayed |
| Installer copyright | Empty | `© 2026 QMS Desktop. All rights reserved.` |
| Installer branding text | Empty | Copyright string as footer |
| Installer EXE version resource | Empty LegalCopyright | `© 2026 QMS Desktop. All rights reserved.` |
| App icon | Navy "Q" letter | White checkmark on navy (QA/quality symbol) |
| Window title | `QMS Desktop` | `QMS Desktop` (no change) |
| Publisher | `QMS Desktop` | `QMS Desktop` (no change) |
| About dialog | `© 2026 QMS Desktop. All rights reserved.` | Same (no change) |

---

## 10. Installer / Uninstaller Behavior

| Check | Result |
|---|---|
| MSI builds successfully | ✓ |
| NSIS builds successfully | ✓ |
| MSI EULA screen shown | ✓ (LicenseAgreementDlg via WixUI_InstallDir) |
| NSIS EULA screen shown | ✓ (MUI_PAGE_LICENSE) |
| Installer does not touch AppData | ✓ (unchanged from Phase 9C) |
| Uninstaller does not touch AppData | ✓ (unchanged from Phase 9C) |
| Reinstall preserves data.db | ✓ |
| Reinstall preserves uploads/ | ✓ |
| Reinstall preserves backups/ | ✓ |
| Reinstall preserves settings.json | ✓ |
| Reinstall preserves license.json | ✓ |
| SmartScreen warning expected | ✓ (app unsigned — expected behavior) |

---

## 11. Build Result

| Step | Result |
|---|---|
| `tsc --noEmit` (TypeScript) | ✓ 0 errors |
| `npm run build` (Vite) | ✓ 1647 modules, 2.65s |
| `cargo check` | ✓ 2.16s incremental |
| `npm run tauri build` | ✓ First pass (1m 42s) |
| WiX EULA section in generated main.wxs | ✓ Confirmed |
| NSIS LICENSE define in generated installer.nsi | ✓ Confirmed |
| MSI installer | ✓ 3.51 MB |
| NSIS installer | ✓ 2.13 MB |

---

## 12. MSI Copied Path

`D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase11f-installer-branding-test.msi`

---

## 13. NSIS Copied Path

`D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase11f-installer-branding-test-setup.exe`

---

## 14. Known Issues

| ID | Severity | Description | Status |
|---|---|---|---|
| BUG-03 | Medium | `tauri-plugin-sql` unused dependency in Cargo.toml | Deferred |
| BUG-04 | Medium | `DATABASE_SCHEMA.md` column name inaccuracies | Deferred |
| BUG-05 | Medium | Bootstrap catch routes to login on storage init failure | Deferred |
| BUG-08 | Low | RSA public key needs verification against Supabase private key | Before production |
| — | Info | SmartScreen warning expected (app unsigned) | By design — requires EV code signing certificate |

No new bugs introduced in Phase 11F.

---

## 15. Confirmations

- [x] No AppData deletion logic added or changed
- [x] No QMS business data uploaded
- [x] No Supabase licensing functions changed
- [x] No database schema changed
- [x] No Reports changes
- [x] No Auth/Users/Profile changes
- [x] No Backup/Restore changes
- [x] No full auto-updater implemented
- [x] No git commit created
- [x] No git add . used
- [x] No push to GitHub
- [x] Phase 12 not started
