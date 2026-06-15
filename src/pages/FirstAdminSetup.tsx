import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { createFirstAdmin } from '../services/authService';
import { useAuthStore } from '../stores/authStore';

export default function FirstAdminSetup() {
  const { login } = useAuthStore();

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validateUsernameFormat(u: string): string | null {
    if (!u) return 'Username is required';
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(u))
      return 'Username must start with a letter and contain only letters, digits, or underscores';
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError('Full name is required'); return; }
    const usernameErr = validateUsernameFormat(username.trim());
    if (usernameErr) { setError(usernameErr); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (!/[A-Z]/.test(password)) { setError('Password must contain at least one uppercase letter'); return; }
    if (!/[0-9]/.test(password)) { setError('Password must contain at least one digit'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setLoading(true);
    try {
      const user = await createFirstAdmin(
        name.trim(),
        username.trim().toLowerCase(),
        email.trim() || null,
        password,
        confirmPassword,
      );
      login(user);
    } catch (err: unknown) {
      setError(typeof err === 'string' ? err : 'Failed to create admin account. Please try again.');
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
          <h1 className="text-[20px] font-semibold text-[#1A202C]">Welcome to QMS Desktop</h1>
          <p className="text-[13px] text-[#64748B] mt-1">
            Create the administrator account to get started
          </p>
        </div>

        <div className="bg-white rounded-lg border border-[#E2E8F0] shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-[13px] font-medium text-[#1A202C] mb-1.5">
                Full name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                placeholder="John Smith"
                className="w-full h-9 px-3 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#1A202C] mb-1.5">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="admin"
                className="w-full h-9 px-3 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent"
              />
              <p className="text-[11px] text-[#64748B] mt-1">
                Used for login · letters, digits, underscores · cannot be changed later
              </p>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#1A202C] mb-1.5">
                Email address <span className="text-[11px] font-normal text-[#94A3B8]">(optional)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="admin@company.com"
                className="w-full h-9 px-3 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#1A202C] mb-1.5">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
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
              <p className="text-[11px] text-[#64748B] mt-1">
                Min. 8 characters · one uppercase letter · one digit
              </p>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#1A202C] mb-1.5">
                Confirm password <span className="text-red-500">*</span>
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full h-9 px-3 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent"
              />
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
              {loading ? 'Creating account…' : 'Create Admin Account'}
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
