import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = (import.meta.env.VITE_SUPABASE_URL  as string | undefined)?.trim() ?? '';
const supabaseAnon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

if (!supabaseUrl || !supabaseAnon) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
}

export const supabase = createClient(supabaseUrl, supabaseAnon);

// Safe diagnostics — only used in dev, never prints secrets
export const supabaseDiag = {
  urlHost: (() => { try { return new URL(supabaseUrl).host; } catch { return '(invalid url)'; } })(),
  keyPresent: supabaseAnon.length > 0,
  keyPrefix: supabaseAnon.slice(0, 8),
};
