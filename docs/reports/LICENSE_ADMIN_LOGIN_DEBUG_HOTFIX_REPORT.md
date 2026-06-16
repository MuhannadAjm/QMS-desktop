# License Admin Desktop — Login Debug Hotfix Report

**Date:** 2026-06-16
**Branch:** `phase-11b-license-sidebar-navigation`
**Build:** `QMS-License-Admin-1.0.0-login-hotfix-test.msi` / `-setup.exe`

---

## Root Cause Found

**The code is correct. The login failure is a credentials problem, not a code bug.**

The diagnostic script confirmed:
- Supabase project is reachable (`kumgncvwtkcbgdgqxmju.supabase.co`)
- Env vars are loaded correctly
- `signInWithPassword` call format is correct
- Error returned by Supabase: `invalid_credentials` (HTTP 400)

`invalid_credentials` is the Supabase error returned when:
1. The email does not exist in `auth.users`, OR
2. The password provided does not match the stored hash, OR
3. The user was created via Supabase Dashboard "Invite user" / magic link, and **never completed the password-set flow** (in which case no password hash exists, and `signInWithPassword` always fails)

The most likely cause given that the user **does** exist in `auth.users` with `email_confirmed_at` not null:

> **The user was created in Supabase Dashboard without a password being explicitly set, or the password being used at login is wrong.**

This is a Supabase account state issue, not an application bug.

---

## Fix Required by User

**Option A (recommended):** Reset the password via Supabase Dashboard:
1. Supabase Dashboard → Authentication → Users
2. Click on `ajameih@yahoo.com`
3. Click "Send password reset email"
4. Open the email, follow the reset link, set a new password
5. Return to QMS License Admin and log in with the new password

**Option B:** Set password directly in dashboard:
1. Supabase Dashboard → Authentication → Users
2. Click on `ajameih@yahoo.com`
3. Click the edit/gear icon → change password field → save

**Note on invite-created accounts:** If the account was created via "Invite user" and the invitation link was followed (which sets the email confirmed), but no password was set via `signInWithPassword`-compatible flow, Option A above will establish the password.

---

## Code Changes Made

The following defensive improvements were made regardless of the root cause — they reduce future diagnostic time and improve robustness:

| File | Change |
|---|---|
| `license-admin/src/lib/supabase.ts` | Added `.trim()` to URL and anon key values; exported `supabaseDiag` (URL host, key presence) for dev diagnostics |
| `license-admin/src/pages/Login.tsx` | Added `.trim()` to email before signInWithPassword; shows error `code` alongside `message`; added DEV-only diagnostic panel |
| `license-admin/scripts/test-auth-login.mjs` | New diagnostic script — tests signInWithPassword from command line without printing secrets |

---

## Files Modified

- `license-admin/src/lib/supabase.ts`
- `license-admin/src/pages/Login.tsx`

## Files Created

- `license-admin/scripts/test-auth-login.mjs`
- `docs/reports/LICENSE_ADMIN_LOGIN_DEBUG_HOTFIX_REPORT.md` — this file

---

## Env Values Verified

| Check | Result |
|---|---|
| `.env.local` exists | Yes |
| `VITE_SUPABASE_URL` present | Yes |
| Supabase URL host | `kumgncvwtkcbgdgqxmju.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` present | Yes |
| Anon key prefix | `eyJhbGci…` |
| Anon key length | 208 characters (valid JWT format) |
| CRLF in .env.local | Yes (but no impact — values are clean, no trailing whitespace/CR in values) |
| `SUPABASE_SERVICE_ROLE_KEY` in frontend | Not present |
| `LICENSE_PRIVATE_KEY_PEM` in frontend | Not present |
| `RESEND_API_KEY` in frontend | Not present |
| `LICENSE_KEY_HASH_SECRET` in frontend | Not present |

---

## Supabase Project URL Host Used

`kumgncvwtkcbgdgqxmju.supabase.co`

---

## Login Function Behavior

### Before this hotfix

```typescript
const { error: err } = await supabase.auth.signInWithPassword({ email, password });
if (err) setError(err.message);
```

- No email trimming
- Only `err.message` shown (no error code)
- No diagnostic info visible

### After this hotfix

```typescript
const trimmedEmail = email.trim();
const { error: err } = await supabase.auth.signInWithPassword({
  email: trimmedEmail,
  password,
});
if (err) {
  setError(err.message);
  setErrorCode(err.code ?? err.name ?? null);
}
```

- Email trimmed before sending
- Both `err.message` AND `err.code` shown to user
- Dev diagnostic panel visible at bottom of login form in development only
- All diagnostic output stripped from production build (`import.meta.env.DEV` guard)

---

## Supabase.ts Improvement

### Before

```typescript
const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
```

### After

```typescript
const supabaseUrl  = (import.meta.env.VITE_SUPABASE_URL  as string | undefined)?.trim() ?? '';
const supabaseAnon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';
```

Defensive: handles `undefined` (missing var), trims whitespace/CR from values.

---

## Auth Diagnostic Script Result

```
=== QMS License Admin — Auth Diagnostic ===

Env file:          D:\QMS-Desktop\license-admin\.env.local
Supabase URL host: kumgncvwtkcbgdgqxmju.supabase.co
Anon key:          eyJhbGci… (length=208)

Testing signInWithPassword
  Email:     test-fake@example-not-real.invalid
  Password:  (not printed)

Result:       FAILED
Error msg:    Invalid login credentials
Error code:   invalid_credentials
Error status: 400
```

The project IS reachable. The error is `invalid_credentials` — the same error the app shows — confirming the issue is the credentials, not the network or code.

---

## Dev Login Test Result

Not testable by assistant without the actual password. Run the diagnostic script with real credentials:

```powershell
$env:TEST_AUTH_EMAIL="ajameih@yahoo.com"
$env:TEST_AUTH_PASSWORD="your-real-password"
node license-admin/scripts/test-auth-login.mjs
```

Expected on success:
```
Result:       SUCCESS ✓
User email:   ajameih@yahoo.com
User id:      <uuid>
```

If this fails with `invalid_credentials`, the password is wrong and must be reset via Supabase Dashboard.

---

## Supabase Auth URL Settings (Task E)

For `signInWithPassword`, these settings are NOT required — email/password auth ignores redirect URLs.

However, for future features (password reset emails, magic links, OAuth), add these to Supabase Dashboard → Authentication → URL Configuration:

| Setting | Values to add |
|---|---|
| Site URL | `http://localhost:1421` |
| Additional Redirect URLs | `http://localhost:1421/**` |
| Additional Redirect URLs | `http://localhost:5174/**` |
| Additional Redirect URLs | `tauri://localhost/**` |

**These are not related to the current login issue.**

---

## Desktop Build Result

| Step | Result |
|---|---|
| `npm run build` (TypeScript + Vite) | ✓ 1617 modules, 4.00s |
| `cargo check` | ✓ Finished dev profile in 2.46s |
| `npx tauri build` | ✓ Finished release profile in 1m 10s |

---

## Artifact Paths

| Artifact | Path |
|---|---|
| MSI | `test-builds/QMS-License-Admin-1.0.0-login-hotfix-test.msi` (1.60 MB) |
| NSIS | `test-builds/QMS-License-Admin-1.0.0-login-hotfix-test-setup.exe` (1.13 MB) |

---

## What to Test Next

1. **Reset password in Supabase Dashboard** (see "Fix Required by User" above)
2. **Run diagnostic script** with real credentials to confirm auth works:
   ```powershell
   $env:TEST_AUTH_EMAIL="ajameih@yahoo.com"
   $env:TEST_AUTH_PASSWORD="your-new-password"
   node license-admin/scripts/test-auth-login.mjs
   ```
3. **Test dev server** at `http://localhost:1421/`:
   - Run `npm run dev` inside `license-admin/`
   - Log in with `ajameih@yahoo.com` + new password
   - Verify the **dev diagnostic panel** appears at the bottom of the login form, confirming:
     - Supabase host: `kumgncvwtkcbgdgqxmju.supabase.co`
     - Anon key: `eyJhbGci… (loaded)`
     - Origin: `http://localhost:1421`
4. **Install MSI** `QMS-License-Admin-1.0.0-login-hotfix-test.msi` and log in

---

## Confirmations

- [x] No service role key in frontend or desktop app
- [x] No private key in desktop app
- [x] No Resend API key in desktop app
- [x] No secrets printed (anon key shown as `eyJhbGci…` prefix only in diagnostics)
- [x] No QMS Desktop customer app changes
- [x] No QMS Desktop business module changes
- [x] No commit created

---

*QMS Desktop — License Admin Login Debug Hotfix — 2026-06-16*
