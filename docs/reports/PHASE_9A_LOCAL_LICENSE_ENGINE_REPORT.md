# Phase 9A — Local License Engine — Report

**Date:** 2026-06-15  
**Phase:** 9A — Local License Engine  
**Status:** Complete

---

## Objective

Implement a fully local, hardware-bound license validation engine for QMS Desktop. No network calls, no Supabase, no online activation server in this phase. The engine runs entirely in Rust on the user's machine and gates app access at startup.

---

## Deliverables Completed

### Rust — New Crates

| Crate | Version | Purpose |
|---|---|---|
| `sha2` | 0.10 | SHA-256 hardware fingerprint hashing |
| `hmac` | 0.12 | HMAC-SHA256 signature verification (Phase 9A placeholder) |
| `mac_address` | 1.1 | Get MAC address via `GetAdaptersInfo` on Windows |
| `hex` | 0.4 | Encode/decode SHA-256 and HMAC bytes |

### Rust — New Source Files

| File | Description |
|---|---|
| `src-tauri/src/license/mod.rs` | `LicenseState` enum (7 variants) + pub mod declarations |
| `src-tauri/src/license/hardware.rs` | `compute_hardware_fingerprint()`, `fingerprint_short()` |
| `src-tauri/src/license/token.rs` | `LicenseToken` struct (15 fields, full Serde derive) |
| `src-tauri/src/license/storage.rs` | `read_license_token()`, `write_license_token()`, `reset_license_to_unlicensed()` |
| `src-tauri/src/license/validation.rs` | `validate_token()`, `verify_signature()`, `compute_dev_signature()`, `DEV_HMAC_KEY`, calendar math |
| `src-tauri/src/commands/license.rs` | 7 Tauri commands (see below) |

### Rust — New Tauri Commands (7)

| Command | Description |
|---|---|
| `get_hardware_fingerprint` | Returns 16-char display form (full 64-char digest never exposed) |
| `get_license_status` | Returns `LicenseStatusResult` — used at startup |
| `get_license_details` | Returns `LicenseDetails` — full info for License page |
| `validate_local_license` | Re-validates license.json without modifying it |
| `import_license_token` | Parses JSON, validates structure, writes, re-validates |
| `clear_local_license_dev_only` | Resets to unlicensed placeholder (DEV) |
| `create_dev_license_for_current_machine` | Creates HMAC-signed dev bypass token (DEV) |

Total commands after Phase 9A: **96**

### TypeScript — New Files

| File | Description |
|---|---|
| `src/types/license.ts` | `LicenseState`, `LicenseStatusResult`, `LicenseDetails` types |
| `src/services/licenseService.ts` | 7 invoke wrappers for license commands |

### TypeScript — Modified Files

| File | Change |
|---|---|
| `src/stores/authStore.ts` | Added `'license-invalid'` to `BootstrapState`; added `setLicenseInvalid()` action |
| `src/App.tsx` | Added `getLicenseStatus()` call after `initializeAppStorage()`; gates on `status.is_valid` |
| `src/app/router.tsx` | Added `bootstrapState === 'license-invalid'` branch routing to `/license` |
| `src/pages/License.tsx` | Fully replaced — gate mode + settings mode; import textarea, validate, DEV controls |

---

## License State Machine

| State | Trigger | Valid for App Access |
|---|---|---|
| `NOT_ACTIVATED` | No license.json, empty, or unlicensed placeholder | No |
| `ACTIVE` | Valid signature + fingerprint match + not expired | Yes |
| `EXPIRED` | `expires_at` date passed + no grace period | No |
| `INVALID` | Corrupt JSON or invalid signature | No |
| `HARDWARE_MISMATCH` | `hardware_fingerprint` in token ≠ current machine | No |
| `REVOKED` | `status == "revoked"` in token | No |
| `DEV_BYPASS` | `status == "dev_bypass"` + valid HMAC signature | Yes |

---

## Hardware Fingerprint Design

```
fingerprint = SHA-256( COMPUTERNAME.to_lowercase() + ":" + mac.to_lowercase() )
```

- Source data: Windows `COMPUTERNAME` env var + first MAC address from `mac_address::get_mac_address()` (calls `GetAdaptersInfo` via `iphlpapi.dll`)
- Result: 64-char lowercase hex string
- Storage: stored in `license.json` as `hardware_fingerprint` — matched against current machine at validation time
- Display: `fingerprint_short()` returns first 16 chars + "..." for the frontend — full 64-char digest is never sent to JS

---

## Signature Verification (Phase 9A)

Phase 9A uses HMAC-SHA256 as a development placeholder for RSA-2048.

**Signature message format:**
```
"{license_id}:{hardware_fingerprint}:{expires_at_or_never}"
```

**Key:** `DEV_HMAC_KEY` constant embedded in `validation.rs` — clearly documented as:
- Phase 9A development placeholder only
- Not for production use
- Will be removed and replaced by RSA-2048 in Phase 9B

**Constant-time comparison:** `mac.verify_slice(&sig_bytes)` from the `hmac` crate — no timing oracle.

**Phase 9B plan:**
- Vendor server signs token JSON with RSA-2048 private key (never leaves server)
- This binary embeds only the RSA-2048 public key
- `verify_signature()` in `validation.rs` will be replaced with RSA signature verification
- `DEV_HMAC_KEY` and `compute_dev_signature()` will be removed

---

## App Startup Gate Flow

```
initializeAppStorage()
  └─► getLicenseStatus()
        ├─ is_valid = false → setLicenseInvalid() → router shows /license (gate mode)
        └─ is_valid = true  → checkFirstAdminExists()
              ├─ no admin → setBootstrapResult(true) → /first-admin-setup
              └─ admin exists → setBootstrapResult(false) → /login
```

After successful license import in gate mode, `License.tsx` re-runs `checkFirstAdminExists()` and calls `setBootstrapResult()` directly to transition to the next step without requiring app restart.

---

## License.json Location

```
%APPDATA%\QMSDesktop\license.json
```

Already tracked by `StoragePaths.license` from Phase 4B. No storage changes were needed.

**Unlicensed placeholder** (written by `create_placeholder_files()` in storage module):
```json
{"status":"unlicensed","activated_at":null,"hardware_id":null,"token":null}
```

`read_license_token()` returns `None` if the file contains `"unlicensed"` — no schema change needed.

---

## Security Notes

- Raw COMPUTERNAME and MAC values are never stored on disk or logged
- Full 64-char fingerprint hex is stored in license.json only (needed for match comparison)
- Frontend receives only a 16-char display string
- All Rust license code is in `src-tauri/src/license/` — isolated from QMS business logic
- License commands intentionally have no Tauri permission requirements (must work before login)
- `DEV_HMAC_KEY` is embedded in the binary — Phase 9B removes it by switching to RSA

---

## Validation Results

| Check | Result |
|---|---|
| `npm run build` (TypeScript + Vite) | ✓ Clean — no errors, no warnings |
| `npm run tauri dev` (Rust compile) | ✓ Clean — all 4 new crates compiled, 96 commands linked |
| App launched | ✓ Window opened, license gate functional |
| `create_dev_license_for_current_machine` | ✓ Creates token, writes license.json, returns DevBypass state |
| `clear_local_license_dev_only` | ✓ Resets license.json to unlicensed placeholder |
| `get_hardware_fingerprint` | ✓ Returns 16-char display string (e.g. "a3f8c9d2b1e74a6f...") |
| App gate on startup (no license) | ✓ Redirects to /license before first-admin or login |
| License page import flow | ✓ Textarea → Activate → validation result shown |

---

## What Is NOT in Phase 9A

| Feature | Deferred to |
|---|---|
| RSA-2048 signature verification | Phase 9B |
| Online license activation server | Phase 9B |
| License Admin Portal | Phase 9B |
| Revocation via online check | Phase 9B |
| Windows .msi installer | Phase 9B |
| Production build (`tauri build`) | Phase 9B |
| Multi-device management | Future |
| Billing / payment integration | Future |

---

## Files Modified Summary

**Created:**
- `src-tauri/src/license/mod.rs`
- `src-tauri/src/license/hardware.rs`
- `src-tauri/src/license/token.rs`
- `src-tauri/src/license/storage.rs`
- `src-tauri/src/license/validation.rs`
- `src-tauri/src/commands/license.rs`
- `src/types/license.ts`
- `src/services/licenseService.ts`
- `docs/reports/PHASE_9A_LOCAL_LICENSE_ENGINE_REPORT.md` (this file)

**Modified:**
- `src-tauri/Cargo.toml` — added 4 crates
- `src-tauri/src/lib.rs` — added `mod license;` + 7 command imports + 7 handler entries
- `src-tauri/src/commands/mod.rs` — added `mod license;` + `pub use license::{...}`
- `src/stores/authStore.ts` — added `'license-invalid'` state + `setLicenseInvalid()`
- `src/App.tsx` — added license check to bootstrap sequence
- `src/app/router.tsx` — added `license-invalid` routing branch
- `src/pages/License.tsx` — fully replaced with real implementation
- `docs/CURRENT_PHASE.md` — updated to Phase 9A complete
- `docs/DEVELOPMENT_LOG.md` — added Phase 9A entry
- `docs/CLAUDE_HANDOFF.md` — updated architecture + key facts
- `docs/SECURITY_NOTES.md` — added license commands + license security section
- `docs/RUNBOOK.md` — added license operations section
- `PHASE_PLAN.md` — split Phase 9 into 9A (COMPLETE) + 9B (NEXT)
