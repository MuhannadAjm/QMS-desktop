import { createClient } from '@supabase/supabase-js';

/**
 * Supabase browser client for the License Admin app.
 *
 * Key model: Supabase's newer **publishable** key (`sb_publishable_...`)
 * replaces the legacy `anon` JWT. Both are safe to ship in a frontend — access
 * is decided by RLS and, for privileged operations, by the admin Edge Functions
 * which verify the caller's JWT against license_admin_profiles.
 *
 * NEVER put the service-role key, the secret key, or LICENSE_PRIVATE_KEY_PEM in
 * this app. Anything prefixed VITE_ is inlined into the bundle at build time and
 * is therefore public by definition.
 */

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';

// Preferred: publishable key. Legacy anon key still accepted so an existing
// .env.local keeps working, but it is deprecated.
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ?? '';
const legacyAnonKey  = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';
const supabaseKey    = publishableKey || legacyAnonKey;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase configuration in .env.local. Required: VITE_SUPABASE_URL and ' +
    'VITE_SUPABASE_PUBLISHABLE_KEY (the sb_publishable_... value from ' +
    'Dashboard > Settings > API). VITE_SUPABASE_ANON_KEY is accepted as a legacy fallback.',
  );
}

// Guard against the classic footgun: pasting a secret key into a frontend env var.
if (supabaseKey.startsWith('sb_secret_') || supabaseKey.startsWith('sbp_')) {
  throw new Error(
    'Refusing to start: the configured Supabase key looks like a SECRET or personal ' +
    'access token. Frontend builds must use the publishable key only.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Safe diagnostics — never prints the key itself.
export const supabaseDiag = {
  urlHost: (() => { try { return new URL(supabaseUrl).host; } catch { return '(invalid url)'; } })(),
  keyPresent: supabaseKey.length > 0,
  keyKind: publishableKey
    ? (publishableKey.startsWith('sb_publishable_') ? 'publishable' : 'publishable (unrecognised prefix)')
    : 'legacy anon (deprecated — migrate to VITE_SUPABASE_PUBLISHABLE_KEY)',
  keyPrefix: supabaseKey.slice(0, 8),
};
