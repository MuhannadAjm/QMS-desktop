# QMS Licensing Backend — Authoritative Reference

**Read this before touching anything licensing-related.** It supersedes older
descriptions scattered through `docs/reports/`, which describe a backend that no
longer exists.

Last updated: 2026-08-20, at the close of the licensing recovery stage.

---

## 1. Architecture boundary — read this first

Supabase hosts **licensing infrastructure only**.

| Lives in Supabase | Stays local on the customer's machine |
|---|---|
| licence customers, keys, activations, events | documents, CAPAs, risks, complaints, audits, non-conformities |
| licence admin accounts (Supabase Auth) | attachments, `data.db`, `settings.json` |
| RSA signing (Edge Function secret) | everything under `%APPDATA%\QMSDesktop\` |

QMS Desktop is an offline single-machine product. It contacts the network **only**
to activate or re-validate a licence. Never move operational QMS data into
Supabase, and never add a runtime dependency on it for normal operation.

## 2. Current production project

| | |
|---|---|
| Organisation | `QMS Systems` (`wieznrveazpbufqmzrma`) |
| Project | `qms-licensing-prod` |
| Project ref | **`ojomsgphjljypxodbxyu`** |
| Region | `eu-west-1` |
| Postgres | 17.6 |

**The previous project `kumgncvwtkcbgdgqxmju` is dead** — it was lost, and its DNS
no longer resolves. It is not a runtime dependency of anything. Occurrences of
that ref survive only in `docs/reports/*` as historical audit records; that is
intentional and those files must not be rewritten. Any occurrence in active
source, `.env`, a bundle, or a build artifact is a defect.

Active runtime surfaces, all of which must name the current ref:

- `src-tauri/src/commands/license.rs` → `LICENSE_SERVER_BASE_URL`
- `supabase/config.toml` → `project_id`
- `license-admin/.env.local` → `VITE_SUPABASE_URL`

## 3. Schema and security posture

Five tables, all with RLS enabled and at least one policy:
`license_customers`, `license_keys`, `license_activations`, `license_events`,
`license_admin_profiles`.

**Privilege model — explicit and least-privilege.** PostgreSQL checks table
privileges *before* RLS, so grants and policies are both required; a missing grant
produces "permission denied" and the policy never runs.

| table | `anon` | `authenticated` | `service_role` |
|---|---|---|---|
| `license_customers` | — | SELECT | SELECT, INSERT |
| `license_keys` | — | SELECT | SELECT, INSERT |
| `license_activations` | — | SELECT | SELECT, INSERT, UPDATE |
| `license_events` | — | SELECT | SELECT, INSERT |
| `license_admin_profiles` | — | SELECT | SELECT |

`authenticated` needs SELECT on `license_admin_profiles` because every data-table
policy evaluates `EXISTS (SELECT 1 FROM license_admin_profiles WHERE id = auth.uid())`
**as the calling role**. The `own_profile` policy still limits each user to their
own row. No Edge Function performs a DELETE, so DELETE is granted to nobody.

Two trigger functions exist and are **not** executable by `anon`/`authenticated`:
`rls_auto_enable()` (backs the `ensure_rls` event trigger that auto-enables RLS on
new public tables — a hardening control, do not drop it) and `set_updated_at()`.

Migration `20260820190000` asserts this entire posture and fails the next
`db push` if anything drifts.

## 4. Edge Functions

Exactly six. No temporary or diagnostic function may be left deployed.

| function | `verify_jwt` | why |
|---|---|---|
| `activate-license` | **false** | the desktop client sends no `Authorization` header; the licence key is the credential |
| `validate-license` | **false** | same |
| `admin-generate-license` | true | admin app sends a real user JWT |
| `admin-list-licenses` | true | " |
| `admin-deactivate-device` | true | " |
| `admin-revoke-license` | true | " |

Admin functions are protected twice: the platform rejects anonymous callers at the
edge, and `requireAdmin()` additionally verifies the JWT and requires a
`license_admin_profiles` row.

Required secrets: `LICENSE_PRIVATE_KEY_PEM`, `LICENSE_KEY_HASH_SECRET`.
`SUPABASE_*` are auto-provisioned — do not set them.

## 5. RSA signing key

**Current production public key, SPKI SHA-256:**

```
9f603a7b697b75f59d672027779fb8d8adc17aef8729938da0c71c64e1f02700
```

Only the **public** half is ever committed or embedded. The private key lives in
`license_private_key.pem` (gitignored) and as the `LICENSE_PRIVATE_KEY_PEM`
secret. It has never appeared in any commit — verified across all reachable
history.

**Retired keys — never reinstate:**

| fingerprint | why retired |
|---|---|
| `8780137f…4859b17da` | private half exposed in a tooling transcript, 2026-08-20. Signed zero production licences. |
| `5d029b8f…cf692be83` | superseded; embedded in the 15-Jun build only. |

**Do not regenerate the key pair as a setup step.** Doing so silently invalidates
every issued licence and produces a build that rejects correct licences with a
bare "Invalid". That has already happened once. `generate-license-keys.cjs` now
refuses to run without an explicit confirmation flag. See
`supabase/README_LICENSE_SERVER.md` step 8 and `docs/KEY_CUSTODY.md`.

## 6. Deployment

```powershell
supabase.cmd link --project-ref ojomsgphjljypxodbxyu
supabase.cmd db push
supabase.cmd functions deploy
```

Two environment traps, both previously fatal and both now documented:

- **Use `supabase.cmd`** on this machine — PowerShell's execution policy blocks
  the `.ps1` shim.
- **`supabase/config.toml` must exist.** It was never tracked in git originally,
  so `db push` and `functions deploy` could not run at all.
- **Migration filenames need a 14-digit timestamp prefix.** A `001_`-style name is
  silently ignored by `db push` — it appears to succeed while applying nothing.

## 7. Acceptance state

### Proven

Backend, end to end against production: admin authentication and authorisation,
customer and licence creation, hash-only key storage, licence format, first
activation, exactly-one activation row, same-machine replay without duplication,
`max_activations` enforcement, wrong-key and malformed-input rejection, revoked
licence rejection, anonymous table denial, and RLS discrimination between an
admin and a non-admin uid.

Desktop-side validation, using the **actual** production Rust code: a genuine
server-issued token validates to `Active` under the current key, and mutating a
signed field flips it to `Invalid`. Covered by `cargo test --lib` (14 tests).

Revocation (`admin-revoke-license`, added 2026-09-05): deployed with
`verify_jwt = true` and denied for anonymous callers, a garbage bearer token, a
well-formed but unsigned JWT, the publishable key the Admin app itself ships, and
that key sent as `apikey`. It requires `license_admin_profiles.role = 'admin'`,
not merely the existence of a profile row, because it cannot be undone from the
application. End-to-end revocation through the Admin UI is owner-run — it needs a
real administrator login, which is not available to automated verification.

### Revocation is not enforced on an activated machine

A revoked licence cannot activate, re-activate, or pass a server-side validation,
and its activation seats are released. It does **not** disable an installation
that is already activated.

QMS Desktop 1.0.0 does not validate online on its own: startup calls
`get_license_status`, which reads the local token, and `validate_license_online`
is reachable only from a manual button on the License page. Even then, a 403 from
the server makes the Rust command return `Err`, so `License.tsx`'s
`setLicenseInvalid()` is never reached and `license.json` is left untouched.

Closing this requires a **client** change — treat a non-2xx from
`validate-license` as a licence-invalid transition, and validate on a schedule —
and therefore a new QMS Desktop build and package. It is an open product decision,
not a defect in the revocation capability. Until it is made, do not tell a customer
that revoking a key has switched off their installation.

### Deferred — not proven, not failed

**GUI-driven activation and offline reopen.** Windows **Smart App Control** blocks
freshly built *unsigned* executables, so the new binary cannot be launched on this
development machine. This is a Windows platform policy, **not a licensing defect**
— the same licence validates correctly through the production code path under
test. It requires either commercially signed artifacts or a test host without SAC.

## 8. Windows code signing — deferred commercial requirement

QMS Desktop ships **unsigned**. On hardened Windows hosts, Smart App Control
blocks unsigned binaries that lack reputation. Practical consequences:

- every fresh build is blocked on this development machine;
- **customers with SAC enabled cannot run the product at all**, independent of
  licensing.

Obtaining a code-signing certificate is a **deferred commercial-delivery
requirement**, explicitly out of scope for the current development stage. It is
not a licensing bug and must not be described as one.
