# QMS Desktop — License Server (Supabase)

Phase 9B: Online Activation Server, RSA License Tokens

---

## Overview

The QMS Desktop licensing backend runs on Supabase (PostgreSQL + Deno Edge Functions).  
It is **separate** from any QMS customer business data, which remains local SQLite on the desktop.

| What lives here | What does NOT live here |
|---|---|
| License customers, keys, activations, events | QMS business records (CAPAs, Risks, etc.) |
| RSA-signed license tokens | User passwords or QMS data |
| Admin portal Supabase project | Local SQLite database |

---

## Project Setup

### 1. Create a Supabase project

1. Go to [https://supabase.com](https://supabase.com) and create a new project.
2. Save your project URL and API keys.

### 2. Install Supabase CLI

```powershell
npm install -g supabase
```

### 3. Link the project

```powershell
cd D:\QMS-Desktop
supabase login
supabase link --project-ref ojomsgphjljypxodbxyu
```

> On this build machine PowerShell's execution policy blocks `supabase.ps1`.
> Use **`supabase.cmd`** for every CLI command.

`supabase/config.toml` must exist before any push or deploy — the CLI refuses to
run without it. It is committed and declares `project_id` plus the per-function
JWT gating. Do not delete it, and keep the `verify_jwt` values as they are:
`activate-license` and `validate-license` must stay `false` because the desktop
client sends no `Authorization` header, and the three `admin-*` functions must
stay `true` so anonymous callers are rejected at the platform edge.

### 4. Apply database migrations

```powershell
supabase db push
```

> Migration filenames must carry a 14-digit timestamp version prefix
> (`20260615144700_license_schema.sql`). A file named `001_...` is **not**
> picked up by `db push` — it will appear to succeed while applying nothing.

This runs the licensing schema migration, creating:
- `license_customers`
- `license_keys`
- `license_activations`
- `license_events`
- `license_admin_profiles`

### 5. Set Edge Function secrets

```powershell
supabase secrets set SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
supabase secrets set LICENSE_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\n..."
supabase secrets set LICENSE_KEY_HASH_SECRET=YOUR_32_BYTE_HEX_SECRET
supabase secrets set LICENSE_TOKEN_ISSUER=QMSDesktop-v1
```

See `supabase/functions/.env.example` for values and generation commands.

### 6. Deploy Edge Functions

```powershell
supabase functions deploy activate-license
supabase functions deploy validate-license
supabase functions deploy admin-generate-license
supabase functions deploy admin-deactivate-device
supabase functions deploy admin-list-licenses
```

### 7. Update the desktop app's server URL

In `src-tauri/src/commands/license.rs`, replace:

```rust
const LICENSE_SERVER_BASE_URL: &str = "https://YOUR_SUPABASE_PROJECT_ID.supabase.co/functions/v1";
```

with your actual Supabase project URL.

### 8. RSA keys — DO NOT REGENERATE

> **STOP.** Earlier revisions of this document told you to generate a fresh key
> pair at this step. **Do not.** The production key pair already exists and is
> in service. Generating a new one silently invalidates every license token ever
> issued, and produces a binary that rejects correctly-signed licenses with a
> bare "Invalid" and no diagnostic pointing at the key. That failure mode has
> already happened once on this project.

The production key pair is fixed:

| Artifact | Location |
|---|---|
| Private key (PKCS#8) | `license_private_key.pem` — gitignored, never committed |
| Public key | `license_public_key.pem` |
| Public key embedded in the binary | `src-tauri/src/license/rsa_public_key.rs` |
| Private key in Supabase | secret `LICENSE_PRIVATE_KEY_PEM` |

> **Key history.** The pair whose SPKI SHA-256 was
> `8780137fd16b15f7d13cf8b32ed07aa5713934722c69807b09ac3724859b17da` was RETIRED
> on 2026-08-20: its private half was exposed in a tooling transcript. It had
> signed zero production licences, so nothing was invalidated by replacing it.
> That key must never be reinstated. The value below is the live one.

**Canonical production public key — SPKI SHA-256:**

```
9f603a7b697b75f59d672027779fb8d8adc17aef8729938da0c71c64e1f02700
```

Verify all three agree before shipping any build:

```bash
# 1. private and public correspond
openssl pkey -in license_private_key.pem -pubout -outform DER | openssl dgst -sha256

# 2. the checked-in public key
openssl pkey -pubin -in license_public_key.pem -outform DER | openssl dgst -sha256

# 3. round-trip proof
printf 'probe' > /tmp/p && openssl dgst -sha256 -sign license_private_key.pem -out /tmp/s /tmp/p \
  && openssl dgst -sha256 -verify license_public_key.pem -signature /tmp/s /tmp/p
```

All three must print the same digest, and step 3 must print `Verified OK`.

To confirm a *built* binary carries the right key, extract the PEM between the
`BEGIN PUBLIC KEY` / `END PUBLIC KEY` markers in the executable and fingerprint
it the same way. A build whose fingerprint differs from the value above cannot
activate any license you issue.

Rotating the key is a breaking change requiring owner sign-off, a coordinated
re-issue of every outstanding license, and a new build. It is not a setup step.

### 9. Create the first admin user

1. Go to Supabase Dashboard → Authentication → Users → Invite User
2. Create a new user (email/password).
3. Run this SQL in the Supabase SQL Editor to promote them to admin:

```sql
INSERT INTO license_admin_profiles (id, role)
VALUES ('THE_USER_UUID_FROM_AUTH_USERS', 'admin');
```

---

## Architecture

```
Desktop App (Rust)
    │
    │  HTTPS (reqwest)
    ▼
Supabase Edge Functions
    │  PKCS1v1.5 SHA-256 signing with RSA private key
    │  Only the public key is in the desktop binary
    ▼
Supabase PostgreSQL
    │  RLS: service_role key bypasses for Edge Functions
    │  RLS: anon+JWT for Admin Portal browser reads
    ▼
license_customers / license_keys / license_activations / license_events
```

---

## Token Canonicalization

The RSA signature covers a canonical JSON payload. Both the Edge Function (Deno) and the desktop (Rust) must produce the **same** canonical string.

**Algorithm:**
1. Take all 15 token fields (excluding `signature`).
2. Set absent optional fields to `null` (not omitted).
3. Sort keys alphabetically.
4. Serialize as compact JSON (no extra whitespace).

**Fields (alphabetical order):**
```
activation_id, activated_at, customer_name, expires_at, features,
grace_until, hardware_fingerprint, issued_at, last_validated_at,
license_id, license_key_last4, max_activations, next_validation_due_at,
plan, status
```

**Example canonical payload:**
```json
{"activation_id":"uuid","activated_at":"2026-06-15T10:00:00Z","customer_name":"Acme Corp","expires_at":null,"features":["capa","risks"],"grace_until":null,"hardware_fingerprint":"abc123...","issued_at":"2026-06-15T10:00:00Z","last_validated_at":"2026-06-15T10:00:00Z","license_id":"uuid","license_key_last4":"ABCD","max_activations":1,"next_validation_due_at":"2026-07-15T10:00:00Z","plan":"standard","status":"active"}
```

---

## Security Notes

- **Private key** never leaves the Supabase secret store. Never embed it in the desktop app.
- **Raw license keys** are generated and shown once to the admin. Only `SHA-256(key + ":" + HASH_SECRET)` is stored.
- **Hardware fingerprint** is the same SHA-256 hex used by the desktop (`COMPUTERNAME.lower() + ":" + MAC.lower()`). Only the hash is transmitted — never raw hardware values.
- **Service role key** is used only server-side in Edge Functions. Never expose it to the admin portal browser.
- **Admin portal** uses the anon key + authenticated Supabase JWT. RLS ensures only admins can read data.

---

## Edge Function Reference

| Function | Auth | Purpose |
|---|---|---|
| `activate-license` | None (key-based) | Initial device activation |
| `validate-license` | None (token-based) | Periodic token refresh |
| `admin-generate-license` | Admin JWT | Create customer + generate license key |
| `admin-deactivate-device` | Admin JWT | Deactivate a specific device |
| `admin-list-licenses` | Admin JWT | List all licenses with counts |

---

## Local Development (Supabase CLI)

```powershell
supabase start          # Start local Supabase instance
supabase functions serve # Serve Edge Functions locally (port 54321)
supabase stop           # Stop local instance
```

For local testing, set secrets in `supabase/functions/.env` (copy from `.env.example`).
