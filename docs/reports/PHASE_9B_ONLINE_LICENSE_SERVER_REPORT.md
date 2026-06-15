# Phase 9B Report — Online Activation Server, RSA License Tokens, License Admin Portal

**Date:** 2026-06-15  
**Status:** COMPLETE  
**Build result:** 0 TypeScript errors (npm run build), 0 Rust errors (cargo check)

---

## Overview

Phase 9B extends Phase 9A's local hardware-bound license engine with:

1. A **Supabase backend** for online license activation and validation (5 tables, 5 Edge Functions)
2. **RSA-2048 PKCS#1 v1.5 SHA-256** token signing (server) and verification (desktop)
3. Two new **async Tauri commands**: `activate_license_online`, `validate_license_online`
4. An **online activation UI** on the License page
5. A standalone **License Admin Portal** (`license-admin/`)

QMS business data remains 100% local SQLite. Supabase is used exclusively for licensing.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Supabase                                   │
│  ┌─────────────┐   ┌────────────────────────────────────────────┐  │
│  │  5 Tables   │   │           5 Edge Functions                  │  │
│  │ customers   │   │  activate-license  (public)                 │  │
│  │ keys        │   │  validate-license  (public)                 │  │
│  │ activations │   │  admin-generate-license  (requireAdmin)     │  │
│  │ events      │   │  admin-deactivate-device (requireAdmin)     │  │
│  │ admin_prof. │   │  admin-list-licenses     (requireAdmin)     │  │
│  └─────────────┘   └────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS (RSA private key signs token)
                    ┌──────────▼──────────┐
                    │   QMS Desktop App   │
                    │ (RSA public key     │
                    │  verifies token)    │
                    │                     │
                    │ license.json stored │
                    │ in %APPDATA%        │
                    └─────────────────────┘
                               ▲
                    ┌──────────┴──────────┐
                    │  License Admin       │
                    │  Portal             │
                    │  license-admin/     │
                    │  (browser web app)  │
                    └─────────────────────┘
```

---

## Files Created

### Supabase

| File | Description |
|---|---|
| `supabase/migrations/001_license_schema.sql` | 5 tables, RLS, triggers, partial unique index |
| `supabase/functions/_shared/cors.ts` | CORS headers for browser callers |
| `supabase/functions/_shared/rsa.ts` | RSA signing, canonicalization, key generation |
| `supabase/functions/_shared/auth.ts` | Admin JWT verification |
| `supabase/functions/activate-license/index.ts` | Public activation endpoint |
| `supabase/functions/validate-license/index.ts` | Public validation endpoint |
| `supabase/functions/admin-generate-license/index.ts` | Admin: generate key |
| `supabase/functions/admin-deactivate-device/index.ts` | Admin: deactivate device |
| `supabase/functions/admin-list-licenses/index.ts` | Admin: list licenses |
| `supabase/functions/.env.example` | Environment variables reference |
| `supabase/README_LICENSE_SERVER.md` | Deployment guide + token spec |

### Desktop App (new)

| File | Description |
|---|---|
| `src-tauri/src/license/rsa_public_key.rs` | Embedded RSA-2048 dev public key (SPKI PEM) |

### License Admin Portal (all new)

| File | Description |
|---|---|
| `license-admin/package.json` | React + Vite + Tailwind + @supabase/supabase-js |
| `license-admin/vite.config.ts` | Vite config (port 5174) |
| `license-admin/tsconfig.json` | TypeScript config |
| `license-admin/tailwind.config.js` | Tailwind config |
| `license-admin/postcss.config.js` | PostCSS config |
| `license-admin/index.html` | HTML entry point |
| `license-admin/.env.example` | VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY |
| `license-admin/src/main.tsx` | React entry |
| `license-admin/src/index.css` | Tailwind imports |
| `license-admin/src/App.tsx` | Router + session management |
| `license-admin/src/lib/supabase.ts` | Supabase client |
| `license-admin/src/components/Layout.tsx` | Sidebar nav |
| `license-admin/src/pages/Login.tsx` | Supabase auth sign-in |
| `license-admin/src/pages/Customers.tsx` | Customer list |
| `license-admin/src/pages/Licenses.tsx` | License list with status badges |
| `license-admin/src/pages/LicenseDetail.tsx` | Activations + deactivate action |
| `license-admin/src/pages/GenerateLicense.tsx` | New/existing customer + generate form |
| `license-admin/src/pages/Events.tsx` | Audit event log (last 200) |

---

## Files Modified

### Rust

| File | Change |
|---|---|
| `src-tauri/Cargo.toml` | Added `rsa 0.9 (pem)`, `base64 0.22`, `reqwest 0.12 (native-tls)`, `sha2 oid` feature |
| `src-tauri/src/license/token.rs` | Added `activation_id: Option<String>` field |
| `src-tauri/src/license/mod.rs` | Added `pub mod rsa_public_key` |
| `src-tauri/src/license/validation.rs` | RSA production verification path + canonical_payload + HMAC dev_bypass preserved |
| `src-tauri/src/commands/license.rs` | Added `activate_license_online` + `validate_license_online`; `LicenseDetails.activation_id` |
| `src-tauri/src/commands/mod.rs` | Exported 2 new commands |
| `src-tauri/src/lib.rs` | Registered 2 new commands |

### TypeScript

| File | Change |
|---|---|
| `src/types/license.ts` | `LicenseDetails.activation_id: string \| null` |
| `src/services/licenseService.ts` | `activateLicenseOnline`, `validateLicenseOnline` |
| `src/pages/License.tsx` | Online Activation card, Validate Online button, activation_id detail row |

---

## Key Technical Decisions

### RSA Algorithm: PKCS1v15-SHA256

Chose PKCS#1 v1.5 (not PSS) because:
- **Deterministic**: no random salt to coordinate between Deno and Rust
- **Deno Web Crypto**: uses `"RSASSA-PKCS1-v1_5"` — directly supported
- **Rust rsa 0.9**: uses `pkcs1v15::VerifyingKey::<Sha256>::new()` — requires `sha2 oid` feature

### Token Canonicalization

15 fields always present (null for absent optionals), alphabetically sorted, compact JSON. BTreeMap in Rust, `Object.keys().sort()` in Deno. Both produce byte-for-byte identical output for the same token.

### Raw Key Storage

The raw license key is:
1. Returned to the admin portal ONCE (via `admin-generate-license` Edge Function response)
2. Never stored in Supabase — only `SHA-256(key + ":" + LICENSE_KEY_HASH_SECRET)` is stored
3. Never stored on the desktop — the desktop sends it to the activation endpoint and discards it

### sha2 `oid` Feature

`VerifyingKey::new()` requires `D: AssociatedOid` (to embed the hash OID in the DigestInfo structure, which is standard PKCS#1 v1.5). This requires `sha2 = { version = "0.10", features = ["oid"] }` in Cargo.toml.

### Offline Fallback

`validate_license_online` catches network errors (timeout, connection refused) and falls back to local RSA signature verification. The `grace_until` field in the token determines how long the app stays valid offline.

### Backward Compatibility

Phase 9A `dev_bypass` tokens (HMAC-SHA256) continue to validate via `verify_dev_hmac()`. Production RSA tokens use `verify_rsa_signature()`. No migration needed.

---

## Security Properties

| Property | Implementation |
|---|---|
| Private key never on desktop | Lives in Supabase `LICENSE_PRIVATE_KEY_PEM` secret only |
| Raw license key never stored | Hash(key + secret) stored; raw key returned once |
| Hardware fingerprint never stored in plaintext | Hash(fp) stored in Supabase `hardware_fingerprint_hash` |
| License validation in Rust | JavaScript cannot bypass or inspect the validation logic |
| Admin portal uses anon key only | All writes go through Edge Functions with service_role |
| Admin access requires DB profile | `requireAdmin()` checks `license_admin_profiles` table |
| RLS on all tables | Default DENY; Edge Functions bypass via service_role |

---

## Validation Checklist

### Desktop (local)
- [x] `activate_license_online` command registered and exported
- [x] `validate_license_online` command registered and exported
- [x] `activation_id` field in `LicenseToken` struct
- [x] `activation_id` in `LicenseDetails` struct and TypeScript type
- [x] RSA signature verification (`verify_rsa_signature`) uses `VerifyingKey::new()` (DigestInfo prefix)
- [x] `canonical_payload()` BTreeMap matches Deno `canonicalPayload()` field list and order
- [x] `dev_bypass` HMAC path preserved for existing dev tokens
- [x] Online activation card shown when license is not active
- [x] Validate Online button shown when license is active and has activation_id
- [x] Machine label input (optional; defaults to "My Machine")
- [x] License key input clears after successful activation
- [x] cargo check: 0 errors

### Server (deploy-time)
- [ ] Supabase project created
- [ ] Migration applied (`supabase db push`)
- [ ] `LICENSE_PRIVATE_KEY_PEM` set in Supabase secrets
- [ ] `LICENSE_KEY_HASH_SECRET` set in Supabase secrets
- [ ] All 5 Edge Functions deployed
- [ ] `LICENSE_SERVER_BASE_URL` updated in `src-tauri/src/commands/license.rs`
- [ ] RSA public key in `rsa_public_key.rs` matches the deployed private key

### Admin Portal (deploy-time)
- [ ] `.env` created from `.env.example`
- [ ] Admin user created in Supabase Auth
- [ ] Row inserted in `license_admin_profiles` for admin user
- [ ] `npm run build` succeeds
- [ ] Portal accessible at deployment URL

---

## Build Results

| Check | Result |
|---|---|
| `npm run build` (QMS Desktop frontend) | ✓ 1639 modules, 0 TS errors, 477.93 kB JS |
| `cargo check` (Tauri backend) | ✓ Finished dev profile, 0 errors |
| License admin portal | TypeScript strict config; build requires `npm install` in `license-admin/` |

---

## Next Phase

The core product (Phases 1–9B) is feature-complete. Next steps:
- **Phase 10**: MSI/installer packaging via `tauri build`
- **UI Polish**: visual refinements, loading states, empty states
- **Production deploy**: generate production RSA key pair, update `rsa_public_key.rs`, set Supabase secrets, deploy Edge Functions
