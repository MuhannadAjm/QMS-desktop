import { useState } from 'react';
import { supabase, supabaseDiag } from '../lib/supabase';

const DEV = import.meta.env.DEV;

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrorCode(null);

    const trimmedEmail = email.trim();

    if (DEV) {
      console.info('[LicenseAdmin] signInWithPassword attempt', {
        email: trimmedEmail,
        supabaseHost: supabaseDiag.urlHost,
        origin: window.location.origin,
      });
    }

    const { error: err } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (err) {
      setError(err.message);
      setErrorCode(err.code ?? err.name ?? null);
      if (DEV) {
        console.warn('[LicenseAdmin] auth error', { message: err.message, code: err.code, status: err.status });
      }
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="mb-6 text-center">
          <div className="w-10 h-10 rounded-xl bg-[#1E3A5F] flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-bold text-lg">Q</span>
          </div>
          <h1 className="text-[18px] font-bold text-[#1E3A5F]">License Admin</h1>
          <p className="text-[12px] text-gray-500 mt-1">Sign in to manage licenses</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
          />
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 space-y-0.5">
              <p className="text-[12px] text-red-700 font-medium">{error}</p>
              {errorCode && (
                <p className="text-[11px] text-red-500 font-mono">code: {errorCode}</p>
              )}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2 text-[13px] font-semibold bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {/* Dev-only diagnostic panel — stripped from production build */}
        {DEV && (
          <div className="mt-6 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 space-y-1">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Dev diagnostics</p>
            <p className="text-[11px] font-mono text-slate-600">
              Supabase host: <span className="text-slate-800">{supabaseDiag.urlHost}</span>
            </p>
            <p className="text-[11px] font-mono text-slate-600">
              Anon key: <span className="text-slate-800">{supabaseDiag.keyPresent ? `${supabaseDiag.keyPrefix}… (loaded)` : 'MISSING'}</span>
            </p>
            <p className="text-[11px] font-mono text-slate-600">
              Origin: <span className="text-slate-800">{window.location.origin}</span>
            </p>
            <p className="text-[10px] text-slate-400 mt-1">This panel is invisible in production builds.</p>
          </div>
        )}
      </div>
    </div>
  );
}
