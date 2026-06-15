import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { loginUser } from '../services/authService';
import { useAuthStore } from '../stores/authStore';

export default function Login() {
  const { login } = useAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError('Username is required');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }

    setLoading(true);
    try {
      const user = await loginUser(username.trim(), password);
      login(user);
    } catch (err: unknown) {
      setError(typeof err === 'string' ? err : 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#1E3A5F] mb-4">
            <ShieldCheck size={22} className="text-white" />
          </div>
          <h1 className="text-[20px] font-semibold text-[#1A202C]">QMS Desktop</h1>
          <p className="text-[13px] text-[#64748B] mt-1">Sign in to continue</p>
        </div>

        <div className="bg-white rounded-lg border border-[#E2E8F0] shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-[13px] font-medium text-[#1A202C] mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                placeholder="your.username"
                className="w-full h-9 px-3 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#1A202C] mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full h-9 px-3 pr-9 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-9 bg-[#1E3A5F] hover:bg-[#2E5080] text-white text-[13px] font-medium rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-[#94A3B8] mt-6">
          QMS Desktop · Quality Management System
        </p>
      </div>
    </div>
  );
}
