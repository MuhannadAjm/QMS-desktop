import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(err.message);
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
            <p className="text-[12px] text-red-600">{error}</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2 text-[13px] font-semibold bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
