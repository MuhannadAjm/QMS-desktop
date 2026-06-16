# Phase 12 — Security Hardening Review and Release Safety Audit

**Date:** 2026-06-16
**Phase:** 12
**Status:** Complete
**Auditor:** Claude Code (automated security audit pass)
**Build:** TypeScript ✓ | Rust ✓ | MSI 3.51 MB | NSIS 2.13 MB

---

## 1. Executive Summary

QMS Desktop v1.0.0 has been subjected to a comprehensive security audit covering git/secret
hygiene, desktop binary security, license security, License Admin Portal security,
auth/password security, Rust backend permission enforcement, backup/restore safety, local
data security, installer/release safety, and error-handling data leakage.

**No critical security vulnerabilities were found.**

One High severity pre-release item (BUG-08 — RSA key pair verification) must be confirmed
before any commercial activation attempt. Two Medium severity findings are deferred
improvements (SQLite at-rest encryption guidance; tauri-plugin-sql still initialized).
Four Low/Info findings are best-practice observations with no immediate exploitability.

The application enforces all security controls correctly in its Rust backend. No business
data is uploaded to cloud services. No secrets are committed to source control. The
license engine correctly rejects DEV bypass tokens in release builds.

**Release Security Rating: Acceptable for RC**
No blocking vulnerabilities. One pre-activation High finding must be resolved before
issuing the first customer license.

---

## 2. Branch Created

`phase-12-security-hardening-review` (branched from `main`)

---

## 3. Files Modified

| File | Change |
|---|---|
| `docs/reports/PHASE_12_SECURITY_HARDENING_REVIEW_REPORT.md` | Created (this report) |
| `docs/DEVELOPMENT_LOG.md` | Phase 12 entry added |
| `docs/CURRENT_PHASE.md` | Updated to Phase 12 complete |
| `docs/SECURITY_NOTES.md` | Added operational guidance sections (Part H findings) |
| `docs/RUNBOOK.md` | Added rate limiting and pre-release checklist |

---

## 4. Source Code Changed

**No production source code was changed.**

This phase is a read-only security audit. All findings are documented and reported;
medium/high risk fixes will be addressed in a follow-up phase.

---

## 5. Database Schema Changed

**No.**

---

## 6. Part A — Git and Secret Hygiene

### A1 — .gitignore Coverage

| Pattern | Present? |
|---|---|
| `.env` | ✓ |
| `.env.*` | ✓ (`*.env` + `.env.*`) |
| `*.pem` | ✓ |
| `*.key` | ✓ |
| `*.pfx` | ✓ |
| `*.p12` | ✓ |
| `license_private_key.pem` | ✓ (explicitly named) |
| `license_hash_secret.txt` | ✓ (explicitly named) |
| `test-builds/` | ✓ |
| `node_modules/` | ✓ (and `license-admin/node_modules/`) |
| `dist/` | ✓ |
| `target/` and `src-tauri/target/` | ✓ |
| `*.db` / `*.sqlite` | ✓ (plus `-shm`, `-wal` variants) |

**Result: ✓ All required patterns covered.**

### A2 — Private Key Scan (git history + working tree)

```
git log --all --full-history -- "*.pem" "*.key" "*.env"
```
Result: **0 matching files** in any commit.

No PEM, KEY, or ENV files were ever committed.

### A3 — Service Role Key Scan (source files)

Grepped `supabase/functions/**` and `license-admin/src/**` for:
- `eyJ[A-Za-z0-9_-]{20,}` (JWT pattern)
- `service_role`
- `SUPABASE_SERVICE`

Results: All occurrences are variable references (`Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`)
or documentation comments. No actual key values found.

### A4 — Resend API Key Scan

Grepped for `re_`, `RESEND_API`, `Bearer re_`. No actual API keys found.
Only references to `RESEND_API_KEY` as an env variable name.

### A5 — Raw License Keys in Docs

Grepped for `QMS-[A-Z0-9]{6}-[A-Z0-9]{6}` pattern. One match: a format example
in `PHASE_10B_HOTFIX_REPORT.md` showing `QMS-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX`.
No real license keys found.

### A6 — .env.example Files

- `supabase/functions/.env.example`: Placeholders only — `REPLACE_WITH_ESCAPED_PKCS8_PRIVATE_KEY`, etc.
- `license-admin/.env.example`: Placeholders only — `your_supabase_anon_key_here`

**Result: ✓ Clean. No real secrets in any .env.example file.**

### A7 — Real Customer Data

No customer names, emails, license keys, or activation records found in any committed file.

**Part A Result: PASS — All git and secret hygiene checks passed.**

---

## 7. Part B — Desktop Binary Security

| Check | Result |
|---|---|
| No Supabase `service_role` key in desktop source | ✓ — Only `LICENSE_SERVER_BASE_URL` (public endpoint URL) in `commands/license.rs` |
| No private RSA key in binary | ✓ — `rsa_public_key.rs` contains ONLY the RSA-2048 public key (SPKI PEM) |
| Public key correctly embedded | ✓ — Comment states "safe to embed — can only verify, not create" |
| Production public key intended | ⚠️ — Comment says "PRODUCTION key" but Phase 9C report said "dev key"; see finding H-01 |
| DEV bypass rejected in release | ✓ — `if cfg!(not(debug_assertions)) { return LicenseState::Invalid; }` — compile-time guard |
| DEV create/clear commands blocked in release | ✓ — Both return `Err("Development tools are not available in production builds.")` via `cfg!` |
| License activation endpoint URL | ✓ — `https://kumgncvwtkcbgdgqxmju.supabase.co/functions/v1` — expected production endpoint |
| Devtools not exposed in release | ✓ — Tauri 2 disables devtools by default in release builds; no `devtools: true` in `tauri.conf.json` |
| CSP configured | ✓ — `"csp": "default-src 'self'; img-src 'self' asset: https://asset.localhost; style-src 'self' 'unsafe-inline'; script-src 'self'"` |
| No remote script allowed by CSP | ✓ — `script-src 'self'` only |

**Part B Result: PASS with one pre-release High item (H-01).**

---

## 8. Part C — License Security

### C1 — Online Activation Flow

```
Desktop (Rust/reqwest) → HTTPS POST → activate-license Edge Function
  body: { license_key, hardware_fingerprint, machine_label, app_version }
  response: signed LicenseToken (RSA-PKCS1v15-SHA256)
  stored: license.json (signed token only; raw license_key discarded)
```

- Raw license_key is sent over HTTPS and never stored on disk. ✓
- Server returns a signed token; desktop writes to `license.json`. ✓
- Hardware fingerprint `SHA-256(COMPUTERNAME:MAC)` is bound to the token. ✓

### C2 — Local License Validation

- `validate_token()` enforces: hardware fingerprint check → RSA signature → expiry check → grace period
- Hardware mismatch returns `LicenseState::HardwareMismatch` (fails silently, no details revealed)
- Invalid JSON returns `LicenseState::Invalid`
- Revoked status returns `LicenseState::Revoked`
- All error paths return safe state codes with no sensitive data

### C3 — RSA Signature Verification

- Algorithm: PKCS1v15-SHA256 (`rsa::pkcs1v15::VerifyingKey::<Sha256>::new()`)
- Canonical payload: 15 fields in alphabetical BTreeMap order (deterministic, matches server)
- Public key loaded from embedded `LICENSE_PUBLIC_KEY_PEM` constant
- Signature decoded from base64; constant-time comparison via `VerifyingKey::verify()`

### C4 — Device Binding

- Hardware fingerprint: `SHA-256(COMPUTERNAME.to_lowercase() + ":" + mac.to_lowercase())`
- Raw COMPUTERNAME and MAC never stored; only 64-char hex stored in `license.json`
- Frontend receives only 16-char display form (`fingerprint_short()`)
- Server stores `hardware_fingerprint_hash` (same 64-char hex) in `license_activations`

### C5 — Trial / Expiry Offline Behavior

- `expires_at` checked against system date in Rust (no `chrono` dependency)
- `grace_until` provides N days offline grace after expiry before forced reactivation
- Offline validation falls back to local RSA check in `validate_license_online()`

### C6 — License Update

- `activate_license_online()` accepts a new key, writes new token, discards old
- Old license.json is overwritten; no transition state leak

### C7 — Activation Limit

- `activate-license` Edge Function counts active activations per license:
  `SELECT id WHERE license_id = X AND status = 'ACTIVE'` then compares to `max_activations`
- Returns 403 with clear message if limit reached
- Admin can deactivate via `admin-deactivate-device` to free a slot

### C8 — validate-license Public Endpoint Safety

- Required inputs: `license_id + activation_id + hardware_fingerprint`
- All three must match an active activation record (server-side join)
- Missing hardware fingerprint match returns 403
- Revoked/inactive license returns 403
- No secrets returned in error responses

### C9 — activate-license Public Endpoint Safety

- Only the license key (a 30-char random string from the approved charset) is the credential
- Stored as `SHA-256(key + LICENSE_KEY_HASH_SECRET)` — pepper prevents rainbow table attacks
- Invalid key returns 403 with "Invalid license key" — no enumeration information

### C10 — Admin Edge Function Protection

| Function | Auth Mechanism |
|---|---|
| `admin-generate-license` | `requireAdmin()` — verifies JWT via `supabase.auth.getUser()` + profile table |
| `admin-deactivate-device` | `requireAdmin()` — same |
| `admin-list-licenses` | `requireAdmin()` — same |

`requireAdmin()` in `_shared/auth.ts`:
1. Extracts Bearer JWT from Authorization header → 401 if missing
2. Calls `supabase.auth.getUser(jwt)` with service-role client → 401 if invalid/expired
3. Queries `license_admin_profiles` for `user.id` → 403 if no admin profile

**Part C Result: PASS — License security is correctly implemented. BUG-08 (key pair verification) is a pre-activation requirement.**

---

## 9. Part D — License Admin Portal Security

| Check | Result |
|---|---|
| Only anon key in frontend | ✓ — `license-admin/src/lib/supabase.ts` uses `VITE_SUPABASE_ANON_KEY` only |
| No service_role in frontend | ✓ — service_role only in Edge Function `Deno.env.get()` calls |
| Login required | ✓ — `App.tsx` checks `supabase.auth.getSession()` on load |
| Admin profile required | ✓ — `requireAdmin()` helper checks `license_admin_profiles` table |
| Viewer/admin role separation | Not implemented (single admin tier) — acceptable for a small admin portal |
| Raw key shown once | ✓ — `admin-generate-license` returns `raw_license_key` once; not stored in DB |
| Raw key not stored | ✓ — only `license_key_hash` (SHA-256 + pepper) and `license_key_last4` stored |
| Key hash uses pepper | ✓ — `hashLicenseKey()` uses `LICENSE_KEY_HASH_SECRET` environment variable |
| Email does not expose secrets | ✓ — email contains `license_key` for customer; server logs only metadata (plan, expires_at) |
| Error messages safe | ✓ — Generic error returned: "Internal server error" for unhandled exceptions |

**Part D Result: PASS.**

---

## 10. Part E — Auth/Password Security

| Check | Result |
|---|---|
| Password hashing algorithm | ✓ Argon2id — `argon2` crate v0.5, default params (m=19456, t=2, p=1) |
| Password hashes never exposed | ✓ `login()` returns `AuthUser` with no `password_hash` field; only `bool` returned from verify |
| Login uses username | ✓ `login()` queries by `username` column |
| Username unique | ✓ `UNIQUE NOT NULL` constraint; `create_user()` checks uniqueness before insert |
| Username fixed after creation | ✓ `update_user()` does not touch `username` column; `update_own_profile()` same |
| Email optional | ✓ Email stored as empty string if not provided; not used in login lookup |
| Password change requires current | ✓ `change_own_password()` verifies current password with Argon2 before hashing new |
| First admin cannot be abused | ✓ `create_first_admin()` checks `SELECT COUNT(*) FROM users > 0` → returns error if any user exists |
| Inactive user login blocked | ✓ `login()` checks `is_active_int == 0` → "This account is inactive." |
| Every require_* checks is_active | ✓ `permissions.rs` queries `WHERE id = ?1` and checks `is_active = 1` |
| Logout clears session | ✓ `authStore` sets `isAuthenticated: false, user: null` — no persistent session token |
| Session not persisted to disk | ✓ No JWT/session token stored in localStorage or any file |

**Part E Result: PASS.**

---

## 11. Part F — Permissions Backend Enforcement

### F1 — Permission Matrix (Rust backend)

| Module / Action | require_admin | require_admin_or_qm | require_admin_qm_or_auditor | require_authenticated |
|---|---|---|---|---|
| list/get all records | | | | ✓ |
| create/update documents | | ✓ | | |
| create/update CAPA | | ✓ | | |
| create/update risks | | ✓ | | |
| create/update complaints | | ✓ | | |
| create/update audits | | ✓ | | |
| add/update audit findings | | | ✓ | |
| create/update NCs | | ✓ | | |
| cross-module create NC/CAPA from risk/complaint | | ✓ | | |
| create NC from audit finding | | | ✓ | |
| Reports (document register) | | | | ✓ |
| Reports (CAPA, Risk, Audit, NC) | | | ✓ | |
| Reports (complaints) | | ✓ | | |
| Backup create / open folder | ✓ | | | |
| Backup restore | ✓ | | | |
| Validate import backup | ✓ | | | |
| Users list/create/update/reset | ✓ | | | |
| Set user status | ✓ | | | |
| Settings update | | ✓ | | |
| Settings read | none (non-sensitive data) | | | |

### F2 — Inactive User

Every `require_*` helper queries `is_active FROM users WHERE id = ?1`. An inactive
account is rejected at the Rust layer regardless of frontend state.

### F3 — Frontend Route Guards

No frontend `ProtectedRoute` wrappers on `/users`, `/backup`, or `/settings`. An
authenticated user who types a URL directly will reach the page but ALL write operations
are rejected by the Rust backend with an authorization error. This is a UX issue (cryptic
error), not a security vulnerability. Documented as L-02.

**Part F Result: PASS — Backend enforcement is correct and complete. Frontend route guards
are a UX improvement deferred to Phase 13.**

---

## 12. Part G — Backup/Restore Safety

| Check | Result |
|---|---|
| Restore is Admin-only | ✓ `restore_local_backup()` calls `require_admin(current_user_id)` |
| Safety backup before restore | ✓ Creates `QMS-SafetyBackup-{timestamp}` folder first; aborts if it fails |
| Restore validates backup structure | ✓ Checks `data.db` exists in backup folder |
| Invalid backup fails safely | ✓ Returns descriptive error; no partial data corruption possible |
| license.json preserved by default | ✓ `preserve_license = true` by default; license NOT overwritten |
| Option to restore license is opt-in | ✓ `preserve_license = false` required explicitly |
| Restore does not upload data | ✓ All ops are local `std::fs::copy()` calls; no network code |
| Restore does not wipe AppData | ✓ Only overwrites: `data.db`, `settings.json`, optionally `license.json`, `uploads/` |
| File menu backup disabled before login | ✓ Rust `auth-changed` listener enables items; starts as `enabled: false` |
| validate_import_backup is Admin-only | ✓ Verified in `backup.rs` line 366 |
| Path traversal mitigation | ✓ `std::fs::canonicalize()` used; AppData directory check prevents backup-inside-AppData |

**Part G Result: PASS.**

---

## 13. Part H — Local Data Security

| Check | Result |
|---|---|
| AppData path documented | ✓ `%APPDATA%\QMSDesktop\` in CLAUDE_HANDOFF.md, DATABASE_SCHEMA.md, RUNBOOK.md |
| SQLite DB local only | ✓ No cloud sync code anywhere in the codebase |
| No QMS business data to Supabase | ✓ Only licensing data (fingerprint hash, activation records) goes online |
| Uploads stored locally | ✓ `%APPDATA%\QMSDesktop\uploads\{module}\` |
| Backups stored locally | ✓ `%APPDATA%\QMSDesktop\backups\` |
| Sensitive local files not in Git | ✓ `.gitignore` excludes `*.db`, `uploads/`, `backups/` |
| OS-level encryption guidance | ⚠️ Not currently documented — see M-01 and operational note below |

**Operational Guidance Note (M-01):**
The SQLite database at `%APPDATA%\QMSDesktop\qms.db` is stored in standard unencrypted
SQLite format. Any user with Windows file system access to that AppData path can open
the database with SQLite Browser or sqlite3 CLI and read all QMS business data (CAPAs,
risks, complaints, audits, documents, non-conformities).

For ISO 9001 compliance environments, document the following in the SECURITY_NOTES.md:
- Windows account should be protected with a strong password
- BitLocker or Windows Device Encryption should be enabled on the host machine
- Physical access to the machine should be controlled
- AppData directory access should be limited to the running user account

SQLite at-rest encryption (SQLCipher) would require significant architectural changes
and is documented as a future enhancement.

**Part H Result: PASS with operational guidance added to SECURITY_NOTES.md.**

---

## 14. Part I — Installer/Release Safety

| Check | Result |
|---|---|
| MSI shows EULA | ✓ Phase 11F: `bundle.licenseFile: "EULA.rtf"` triggers `LicenseAgreementDlg` in WiX |
| NSIS shows EULA | ✓ Phase 11F: `MUI_PAGE_LICENSE` triggered in NSIS |
| Uninstall preserves AppData | ✓ No `<RemoveFolder>` targeting AppData in WXS; no custom uninstall action |
| Reinstall preserves data/license | ✓ Confirmed in Phase 9C smoke test and Phase 11F report |
| Installer unsigned / SmartScreen documented | ✓ Documented in SECURITY_NOTES.md and multiple phase reports |
| No auto-update implemented | ✓ No `tauri-plugin-updater` in Cargo.toml |
| Check for Updates is manual | ✓ `CheckForUpdatesDialog` only displays version; no download/execute |
| No unsafe download/execute | ✓ App cannot download and execute arbitrary code |
| No copyrighted artwork | ✓ Icon generated programmatically via PowerShell System.Drawing |

**Part I Result: PASS.**

---

## 15. Part J — Error Handling and Data Leakage

| Check | Result |
|---|---|
| No raw SQL errors shown | ✓ All Rust commands return `Result<_, String>` with mapped error messages |
| No stack traces | ✓ Rust `format!("{}", e)` for IO errors; no panic output reaches frontend |
| No secrets shown | ✓ `SupportDialog` shows only: version, state_label, customer_name, plan |
| No raw hardware IDs | ✓ `fingerprint_short()` returns 16-char display form; full 64-char hash never sent to JS |
| Support info copy excludes secrets | ✓ `buildSupportInfo()` includes version, state_label, customer_name, plan, support email only |
| Edge Function diagnostic logs | ✓ Logs show: PEM presence (true/false), PEM type, DER byte count — never key content |
| `hardware_fingerprint` in LicenseDetails | ✓ `hardware_fingerprint_short: Some(fingerprint_short(&t.hardware_fingerprint))` — truncated form |
| Login error message | ✓ "Invalid username or password" — same message for nonexistent user and wrong password (prevents username enumeration) |
| Inactive user error message | "This account is inactive. Contact your administrator." — reveals that username exists but account inactive. This is acceptable UX behavior for a desktop app where users are known to each other. |

**Part J Result: PASS.**

---

## 16. Findings Table

| ID | Severity | Area | Description | Risk | Recommended Fix | Fix Before Release? |
|---|---|---|---|---|---|---|
| H-01 | High | License Security | RSA public key in `rsa_public_key.rs` labeled "PRODUCTION key" but Phase 9C report also called it "dev key." If the embedded public key does NOT match the private key deployed to Supabase `LICENSE_PRIVATE_KEY_PEM`, all license activations will fail — the signed token cannot be locally verified. | Commercial activation failure; all customer installations non-functional. | Verify: extract the public key from the Supabase private key (`openssl rsa -in private.pem -pubout`) and compare to the PEM in `rsa_public_key.rs`. If different, update `rsa_public_key.rs` and rebuild before issuing any customer licenses. | **Yes — before first customer activation** |
| M-01 | Medium | Local Data | SQLite database at `%APPDATA%\QMSDesktop\qms.db` is unencrypted. Any local user with file system access can read all QMS business data with SQLite Browser. | Confidentiality risk for compliance-focused ISO 9001 customers; local attacker or other Windows user can read QMS records. | Document operational guidance: require Windows account password, enable BitLocker/Device Encryption, control physical access. SQLCipher integration is a future enhancement. | No (document as operational guidance) |
| M-02 | Medium | Build/Dependencies | `tauri-plugin-sql = "2"` is still in `Cargo.toml` AND initialized at runtime: `lib.rs` line 181 `.plugin(tauri_plugin_sql::Builder::default().build())`. The plugin is loaded but has no DB permissions configured in capabilities, and no TypeScript code calls it. This is BUG-03 from Phase 10. | Unnecessary code in the binary; minor supply chain risk; unused dependency adds binary size. | Remove `tauri-plugin-sql = "2"` from `Cargo.toml` and `.plugin(tauri_plugin_sql::Builder::default().build())` from `lib.rs`. | No (deferred; requires full rebuild) |
| M-03 | Medium | Supabase/Backend | All 3 admin Edge Functions (`admin-generate-license`, `admin-deactivate-device`, `admin-list-licenses`) are deployed with `--no-verify-jwt`, bypassing Supabase's platform-level JWT verification. Internal `requireAdmin()` checks the JWT using `supabase.auth.getUser()`. | If `requireAdmin()` has a bug, there is no platform fallback. The current implementation is correct, but the deployment flag removes a defense-in-depth layer. | Redeploy admin functions WITHOUT `--no-verify-jwt`. The `requireAdmin()` function would still run and add an additional profile check on top of platform JWT enforcement. | No (no current vulnerability; deploy-time improvement) |
| L-01 | Low | Supabase/Backend | CORS headers use `"Access-Control-Allow-Origin": "*"` for all Edge Functions including admin endpoints. A malicious web page could attempt requests to admin endpoints if an admin JWT were stolen. | JWT is still required and verified. CORS does not replace authentication. Minimal real risk. | Restrict CORS to the admin portal's known domain when the portal is deployed to a fixed URL. Until then, `*` is the only practical option for locally-run portals. | No |
| L-02 | Low | UX/Permissions | No frontend `ProtectedRoute` wrappers on Admin-only pages (`/users`, `/backup`, `/settings`). Authenticated non-Admin users who type these URLs directly reach the page shell. All write operations return Rust authorization errors. | UX issue (cryptic errors) rather than security breach. Rust backend enforces correctly. | Add `ProtectedRoute` components in Phase 13 to show "Access Denied" instead of blank error state. | No |
| L-03 | Low | License/Code | `DEV_HMAC_KEY` constant (`b"QMS-DESKTOP-DEV-PHASE-9A-PLACEHOLDER-REPLACE-WITH-RSA-IN-9B"`) is still in `validation.rs`. In release builds, the `cfg!(not(debug_assertions))` guard causes `dev_bypass` tokens to return `LicenseState::Invalid` before the HMAC code is reached. The constant may survive as a dead string in the binary. | An attacker extracting the binary finds a clearly-labeled development placeholder string. Not useful for bypassing production license validation. | Remove `DEV_HMAC_KEY`, `compute_dev_signature()`, and `verify_dev_hmac()` in a future cleanup phase. The dev bypass path is fully disabled in release builds. | No |
| L-04 | Low | License/Code | `verify_dev_hmac()` accepts the literal sentinel `"DEV-BYPASS-NOT-FOR-PRODUCTION"` as a valid signature without HMAC verification (line 164 of `validation.rs`). In debug builds, any `dev_bypass` token with this exact signature passes without HMAC check. | Only relevant in debug builds. In release builds, `dev_bypass` tokens are rejected before `verify_dev_hmac()` is reached. | Document as "debug-only convenience sentinel." Remove when removing DEV_HMAC path in future cleanup. | No |
| I-01 | Info | Supabase/Backend | No explicit rate limiting configured on `activate-license` or `validate-license` Edge Functions beyond Supabase platform defaults. | Brute-force license key enumeration is infeasible (30^30 key space), but repeated failed activation attempts are still logged. | Enable Supabase Edge Function rate limiting via the Supabase Dashboard → Project Settings → API. Set a reasonable rate limit (e.g., 60 requests/minute per IP) for public endpoints. | No (operational) |
| I-02 | Info | Documentation | `ARCHITECTURE.md` and `CLAUDE_HANDOFF.md` still mention "bcrypt" in some sections. Phase 10 fixed SECURITY_NOTES.md but these files may retain stale references. | Misleads security auditors about password hashing. The implementation is correct (Argon2id) — only documentation is wrong. | Audit and correct both files. This is BUG-01 from Phase 10. | No (documentation only) |
| I-03 | Info | Local Data | Backup archives include `license.json` which contains the hardware fingerprint (64-char SHA-256 hex) and a signed license token. If a backup is moved to another machine and the license.json is extracted, the attacker obtains the hardware fingerprint for the original machine. | The fingerprint alone cannot be used on a different machine (the local fingerprint must match). This is the intended behavior for hardware binding. | Document that backup archives should be stored securely (password-protected zip or encrypted volume). | No (documentation only) |

---

## 17. Release Security Rating

**Rating: Acceptable for RC (Release Candidate)**

| Criterion | Status |
|---|---|
| Zero Critical findings | ✓ |
| Zero High findings blocking release | ✓ (H-01 blocks activation, not release) |
| All auth/permission controls verified | ✓ |
| No secrets in repository | ✓ |
| No private key in binary | ✓ |
| DEV bypass disabled in release | ✓ |
| EULA in installer | ✓ |
| AppData preservation confirmed | ✓ |
| Build passes | ✓ |
| No business data upload | ✓ |

**Pre-commercial-activation blocker:** Resolve H-01 (RSA key pair verification) before
issuing the first customer license. If the key pair is mismatched, all activations will
fail silently (the app will reject any license token the server signs).

---

## 18. Build Result

| Step | Result |
|---|---|
| `npm.cmd run build` (TypeScript + Vite) | ✓ 1647 modules, 2.58s, 0 TypeScript errors |
| `cargo check` (Rust) | ✓ Finished dev profile, 3.45s, 0 errors |
| `npm.cmd run tauri build` (Tauri release) | ✓ 1m 42s, 0 errors |
| WiX EULA in generated main.wxs | ✓ `WixVariable Id="WixUILicenseRtf"` present |
| NSIS LICENSE in generated installer.nsi | ✓ `!define LICENSE` present |
| MSI | ✓ 3.51 MB |
| NSIS | ✓ 2.13 MB |

---

## 19. MSI Copied Path

`D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase12-security-review-test.msi`

---

## 20. NSIS Copied Path

`D:\QMS-Desktop\test-builds\QMS-Desktop-1.0.0-phase12-security-review-test-setup.exe`

---

## 21. Known Issues (Carried)

| ID | Severity | Description | Status |
|---|---|---|---|
| BUG-03 | Medium | `tauri-plugin-sql` unused dependency initialized in lib.rs | Deferred (see M-02) |
| BUG-04 | Medium | `DATABASE_SCHEMA.md` column name inaccuracies | Deferred |
| BUG-05 | Medium | Bootstrap catch routes to login on storage init failure | Deferred |
| BUG-08 | High | RSA public key needs verification against Supabase private key | **Before first commercial activation** |
| H-01 | High | (same as BUG-08) | See above |
| M-01 | Medium | SQLite DB unencrypted; operational guidance needed | Documented in SECURITY_NOTES.md |
| M-02 | Medium | tauri-plugin-sql initialized but unused | Deferred |
| M-03 | Medium | Admin Edge Functions deployed with --no-verify-jwt | Deferred to Supabase redeploy |
| L-01 | Low | CORS wildcard on admin endpoints | Deferred |
| L-02 | Low | No frontend route guards | Deferred to Phase 13 |
| L-03 | Low | DEV_HMAC_KEY dead constant in release binary | Deferred |

---

## 22. Confirmations

- [x] No secrets were printed or exposed in this audit or report
- [x] No AppData was deleted or modified
- [x] No QMS business data was uploaded
- [x] No Supabase licensing functions were changed
- [x] No Supabase secrets were changed
- [x] No new features were added
- [x] No database schema was changed
- [x] No UI was redesigned or changed
- [x] No git commit created
- [x] No git add . used
- [x] No push to GitHub
- [x] Phase 13 not started

---

*End of Phase 12 Security Hardening Review Report*
*QMS Desktop v1.0.0 — 2026-06-16*
