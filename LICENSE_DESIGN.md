# QMS Desktop — License Design

## Overview

QMS Desktop uses a **hardware-bound offline license** model. The license is tied to the
specific machine on which the software is installed. Activation does not require an internet
connection at runtime, but a one-time online or manual activation step generates the license
token.

This feature is implemented in **Phase 9** only. This document defines the design so that
Phase 1–8 can be built without conflicting with the final license architecture.

---

## License File Location

```
%APPDATA%\QMSDesktop\license.json
```

---

## License File Structure

```json
{
  "edition": "Standard",
  "licensed_to": "Company Name",
  "licensed_email": "contact@company.com",
  "hardware_id": "<SHA-256 of hardware fingerprint>",
  "issued_at": "2025-01-01T00:00:00Z",
  "expires_at": null,
  "max_users": 10,
  "features": ["capa", "risks", "complaints", "audits", "documents", "nc", "reports", "backup"],
  "signature": "<HMAC-SHA256 or RSA signature>"
}
```

---

## Hardware Fingerprint

The hardware ID is computed in Rust from a combination of:

1. Machine hostname
2. Primary network interface MAC address
3. OS volume serial number (Windows)

These values are concatenated, then hashed with SHA-256 to produce a stable, anonymized
hardware ID. Minor hardware changes (adding RAM, changing USB devices) will not invalidate
the license. Replacing the motherboard or reinstalling Windows on new hardware requires
re-activation.

---

## License Validation Flow

```
App Launch
    │
    ▼
Read %APPDATA%\QMSDesktop\license.json
    │
    ├── File missing? ──► Show License Activation page
    │
    ▼
Parse license JSON
    │
    ▼
Compute current hardware_id
    │
    ├── hardware_id mismatch? ──► Show invalid license error
    │
    ▼
Verify signature (HMAC-SHA256 or RSA public key embedded in Rust binary)
    │
    ├── Signature invalid? ──► Show tampered license error
    │
    ▼
Check expires_at (if not null)
    │
    ├── Expired? ──► Show expired license page
    │
    ▼
License valid ──► Allow app to open
```

---

## Signature Algorithm Options

| Option | Pros | Cons |
|---|---|---|
| HMAC-SHA256 | Simple, fast | Secret key must be embedded in binary |
| RSA-2048 (public key verify) | Private key never on device | Larger implementation |

**Decision (Phase 9):** Use RSA-2048. The private key stays on the vendor's server. Only
the public key is embedded in the Rust binary. This prevents an attacker from forging
license files even if they extract the embedded key.

---

## Activation Modes

### Mode A — Online Activation (preferred)
1. Customer purchases license; receives a license code.
2. QMS Desktop prompts for the license code on first launch.
3. The app calls the vendor's activation endpoint with `license_code + hardware_id`.
4. The server returns a signed `license.json` payload.
5. The app writes `license.json` to AppData.

### Mode B — Offline / Manual Activation
1. Customer generates a hardware ID file from within the app (no internet needed).
2. Customer emails the hardware ID to the vendor.
3. Vendor generates and emails back a `license.json` file.
4. Customer places the file in `%APPDATA%\QMSDesktop\license.json` or imports via the app.

---

## Grace Period

- If `license.json` is missing or corrupt, the app shows the License Activation page.
- A **14-day trial mode** may be added (stored in a signed trial token) — final decision in Phase 9.
- No grace period for a corrupted or hardware-mismatched license.

---

## Enforcement in Code (Phase 9)

- License check runs in a Tauri Rust command at startup.
- The result is passed to the React frontend as a typed status enum.
- If the license is invalid, the React router redirects to `/license` and prevents navigation.
- The `src-tauri/src/commands/license.rs` module handles all license logic.
- No license logic lives in JavaScript/TypeScript.

---

## Phase 9B Implementation (COMPLETE)

### RSA Token Canonicalization

All 15 token fields are serialized in alphabetical BTreeMap order with null for absent optionals:

```
activated_at, activation_id, customer_name, expires_at, features,
grace_until, hardware_fingerprint, issued_at, last_validated_at,
license_id, license_key_last4, max_activations, next_validation_due_at,
plan, status
```

The resulting compact JSON string is the exact byte sequence that is signed (server) and verified (desktop). Both sides must produce identical output for a given token.

### Supabase Backend

| Component | Location |
|---|---|
| Schema migration | `supabase/migrations/001_license_schema.sql` |
| Shared helpers | `supabase/functions/_shared/{cors,rsa,auth}.ts` |
| Activation | `supabase/functions/activate-license/index.ts` |
| Validation | `supabase/functions/validate-license/index.ts` |
| Admin: generate | `supabase/functions/admin-generate-license/index.ts` |
| Admin: deactivate | `supabase/functions/admin-deactivate-device/index.ts` |
| Admin: list | `supabase/functions/admin-list-licenses/index.ts` |
| Deployment guide | `supabase/README_LICENSE_SERVER.md` |

### Desktop RSA Verification

- `src-tauri/src/license/rsa_public_key.rs` — embedded SPKI PEM (dev key; replace before production)
- `src-tauri/src/license/validation.rs` — `verify_rsa_signature()` via `rsa 0.9` + `sha2 0.10 (oid)` + `base64 0.22`
- Algorithm: PKCS1v15-SHA256 (`rsa::pkcs1v15::VerifyingKey::<Sha256>::new()`)

### Offline Fallback

`validate_license_online` returns local RSA validation result when the server is unreachable. The grace_until field in the token determines how long the app remains active without a successful online validation.

### Admin Portal

`license-admin/` — standalone React/Vite/Tailwind web app. Connects to Supabase with anon key. All admin writes go through Edge Functions (service_role). Pages: Login, Customers, Licenses, LicenseDetail (with deactivate), GenerateLicense, Events.

---

## Phase 9C Implementation (COMPLETE)

### Production License Hardening

- `validation.rs` — `validate_token()` guards dev_bypass via `if cfg!(not(debug_assertions)) { return LicenseState::Invalid; }`. Production tokens MUST be RSA-signed.
- `commands/license.rs` — `clear_local_license_dev_only()` and `create_dev_license_for_current_machine()` return errors in release via `if cfg!(not(debug_assertions))`.
- `License.tsx` — DEV controls wrapped in `{import.meta.env.DEV && (...)}`. Dead-code-eliminated in production bundle.

### Windows Installer

- MSI (WiX 3): `QMS Desktop_1.0.0_x64_en-US.msi` — 3.46 MB — per-machine, requires admin elevation
- NSIS: `QMS Desktop_1.0.0_x64-setup.exe` — 2.09 MB — alternative installer
- Installed to: `C:\Program Files\QMS Desktop\`
- AppData (`%APPDATA%\QMSDesktop\`) is NOT touched by the installer

### Release Build Notes

- Cargo.toml `[profile.release.build-override] opt-level=0` added for AppControl compatibility
- See RUNBOOK.md "Release Build Workaround" for the build-machine-specific AppControl fix

---

## Out of Scope for v1

- Subscription / recurring billing
- Feature flags per tier (all features enabled in v1)
- Multi-seat floating licenses
