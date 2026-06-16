/**
 * Auth diagnostic script — QMS License Admin
 *
 * Tests signInWithPassword against Supabase using the same env values
 * that the desktop app uses. Does NOT print secrets.
 *
 * Usage (PowerShell from D:\QMS-Desktop\):
 *   $env:TEST_AUTH_EMAIL="ajameih@yahoo.com"
 *   $env:TEST_AUTH_PASSWORD="your-password-here"
 *   node license-admin/scripts/test-auth-login.mjs
 *
 * Or from inside license-admin/:
 *   $env:TEST_AUTH_EMAIL="ajameih@yahoo.com"
 *   $env:TEST_AUTH_PASSWORD="your-password-here"
 *   node scripts/test-auth-login.mjs
 *
 * Requires Node.js >= 18.
 * If email/password env vars are missing, the script prompts for them.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env.local ────────────────────────────────────────────────────────
function loadEnv() {
  const candidates = [
    resolve(__dirname, '../.env.local'),
    resolve(process.cwd(), 'license-admin/.env.local'),
    resolve(process.cwd(), '.env.local'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      const lines = readFileSync(p, 'utf8').split(/\r?\n/);
      const env = {};
      for (const line of lines) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m) env[m[1].trim()] = m[2].trim();
      }
      return { env, path: p };
    }
  }
  return { env: {}, path: null };
}

// ── Prompt helper (no raw-mode — works reliably on Windows) ───────────────
function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  return new Promise((resolve) => {
    process.stdout.write(question);
    rl.once('line', (line) => {
      rl.close();
      resolve(line.trim());
    });
  });
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n=== QMS License Admin — Auth Diagnostic ===\n');

  const { env, path: envPath } = loadEnv();

  const supabaseUrl  = (env['VITE_SUPABASE_URL']  ?? '').trim();
  const supabaseAnon = (env['VITE_SUPABASE_ANON_KEY'] ?? '').trim();

  let urlHost = '(missing)';
  try { if (supabaseUrl) urlHost = new URL(supabaseUrl).host; } catch { urlHost = '(invalid url)'; }

  console.log(`Env file:          ${envPath ?? '(not found)'}`);
  console.log(`Supabase URL host: ${urlHost}`);
  console.log(`Anon key:          ${supabaseAnon ? `${supabaseAnon.slice(0, 8)}… (length=${supabaseAnon.length})` : 'MISSING'}`);
  console.log('');

  if (!supabaseUrl || !supabaseAnon) {
    console.error('ERROR: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
    console.error('Create license-admin/.env.local with those values and try again.');
    process.exitCode = 1;
    return;
  }

  let email    = (process.env['TEST_AUTH_EMAIL']    ?? '').trim();
  let password =  process.env['TEST_AUTH_PASSWORD'] ?? '';

  if (!email)    email    = await ask('Email: ');
  if (!password) password = await ask('Password (will be visible): ');

  console.log(`\nTesting signInWithPassword`);
  console.log(`  Email:     ${email}`);
  console.log(`  Password:  (not printed)`);
  console.log('');

  const supabase = createClient(supabaseUrl, supabaseAnon);

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      console.log('Result:       FAILED');
      console.log(`Error msg:    ${error.message}`);
      console.log(`Error code:   ${error.code ?? '(none)'}`);
      console.log(`Error status: ${error.status ?? '(none)'}`);
      console.log('');

      if (error.code === 'invalid_credentials') {
        console.log('Diagnosis: Wrong email or password.');
        console.log('');
        console.log('Fix options:');
        console.log('  1. Supabase Dashboard → Authentication → Users → click user');
        console.log('     → "Send password reset email" → reset via email link');
        console.log('  2. Supabase Dashboard → Authentication → Users → click user');
        console.log('     → Edit → set new password directly');
        console.log('  3. If user was created via "Invite", they must accept the invite');
        console.log('     and set a password before signInWithPassword will work.');
      } else if (error.code === 'email_not_confirmed') {
        console.log('Diagnosis: Email not confirmed.');
        console.log('  Supabase Dashboard → Auth → Users → click user → confirm email manually.');
      } else if (error.code === 'over_email_send_rate_limit' || (error.status ?? 0) === 429) {
        console.log('Diagnosis: Rate limited. Wait a few minutes and try again.');
      } else {
        console.log('Diagnosis: Unexpected error. Check Supabase project status.');
      }
    } else {
      const user = data.user;
      console.log('Result:       SUCCESS ✓');
      console.log(`User email:   ${user?.email ?? '(unknown)'}`);
      console.log(`User id:      ${user?.id ?? '(unknown)'}`);
      console.log(`Email confirmed: ${user?.email_confirmed_at ? 'yes' : 'no'}`);
      console.log('');
      console.log('Login works correctly. The desktop app should also work.');
      console.log('');
      console.log('Verify admin profile:');
      console.log(`  SELECT id, role FROM license_admin_profiles WHERE id = '${user?.id ?? 'unknown'}';`);
    }
  } catch (networkErr) {
    console.log('Result:       NETWORK ERROR');
    console.log(`Error:        ${networkErr?.message ?? String(networkErr)}`);
    console.log('Diagnosis: Cannot reach Supabase. Check internet connection or project status.');
  }

  console.log('\n=== Done ===\n');
}

main().then(() => {
  setTimeout(() => process.exit(process.exitCode ?? 0), 100);
});
