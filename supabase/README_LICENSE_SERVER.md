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
supabase link --project-ref YOUR_PROJECT_ID
```

### 4. Apply database migrations

```powershell
supabase db push
```

This runs `supabase/migrations/001_license_schema.sql`, creating:
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

### 8. Update the desktop app's RSA public key

In `src-tauri/src/license/rsa_public_key.rs`, replace the dev public key with your production public key.  
Generate a new key pair for production (the dev key pair is only for testing):

```powershell
node -e "const c=require('crypto');const p=c.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});console.log('PUBLIC:\n'+p.publicKey);console.log('PRIVATE:\n'+p.privateKey);"
```

- Public key → paste into `rsa_public_key.rs` (safe to embed — cannot sign with it)
- Private key → set as `LICENSE_PRIVATE_KEY_PEM` in Supabase secrets

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
