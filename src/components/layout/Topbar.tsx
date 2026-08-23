import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, User, LogOut, Settings2, KeyRound, X, Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useLicenseStore } from '../../stores/licenseStore';
import { updateOwnProfile, changeOwnPassword } from '../../services/authService';
import { ROLE_LABELS } from '../../types/user';
import type { UserRole } from '../../types/user';
import type { LicenseState } from '../../types/license';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/capa': 'CAPA',
  '/risks': 'Risks',
  '/complaints': 'Complaints',
  '/audits': 'Audits',
  '/non-conformities': 'Non-Conformities',
  '/documents': 'Documents',
  '/users': 'Users',
  '/settings': 'Settings',
  '/reports': 'Reports',
  '/backup': 'Backup & Restore',
  '/license': 'License',
};

const LICENSE_BADGE_CONFIG: Record<
  LicenseState,
  { cls: string; dot: string; label: string }
> = {
  ACTIVE:            { cls: 'bg-[#DCFCE7] text-[#15803D]', dot: 'bg-[#16A34A]', label: 'Licensed' },
  DEV_BYPASS:        { cls: 'bg-[#DCFCE7] text-[#15803D]', dot: 'bg-[#16A34A]', label: 'Dev' },
  EXPIRED:           { cls: 'bg-[#FEE2E2] text-[#DC2626]', dot: 'bg-[#DC2626]', label: 'Expired' },
  NOT_ACTIVATED:     { cls: 'bg-[#FEF3C7] text-[#B45309]', dot: 'bg-[#D97706]', label: 'Pending' },
  HARDWARE_MISMATCH: { cls: 'bg-[#FEE2E2] text-[#DC2626]', dot: 'bg-[#DC2626]', label: 'License Error' },
  REVOKED:           { cls: 'bg-[#FEE2E2] text-[#DC2626]', dot: 'bg-[#DC2626]', label: 'Revoked' },
  INVALID:           { cls: 'bg-[#FEE2E2] text-[#DC2626]', dot: 'bg-[#DC2626]', label: 'Invalid' },
  CORRUPT:           { cls: 'bg-[#FEE2E2] text-[#DC2626]', dot: 'bg-[#DC2626]', label: 'File Damaged' },
};

function LicenseBadge() {
  const { state } = useLicenseStore();
  if (!state) return null;
  const cfg = LICENSE_BADGE_CONFIG[state] ?? {
    cls: 'bg-[#F1F5F9] text-[#64748B]',
    dot: 'bg-[#94A3B8]',
    label: state,
  };
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.cls}`}
      title="License status"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </div>
  );
}

type ActiveModal = 'profile' | 'password' | null;

export default function Topbar() {
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'QMS Desktop';
  const { user, logout, setUser } = useAuthStore();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  function openModal(m: ActiveModal) {
    setDropdownOpen(false);
    setActiveModal(m);
  }

  function closeModal() {
    setActiveModal(null);
  }

  return (
    <>
      <header className="h-14 bg-white border-b border-[#E2E8F0] flex items-center justify-between px-6 shrink-0">
        {/* Left: breadcrumb — root is clickable and navigates to Dashboard */}
        <div className="flex items-center gap-1.5">
          <Link
            to="/dashboard"
            className="text-[12px] text-slate-400 font-medium hover:text-[#1E3A5F] transition-colors"
          >
            QMS Desktop
          </Link>
          <ChevronRight size={13} className="text-slate-300" />
          <span className="text-[13px] font-semibold text-[#1A202C]">{pageTitle}</span>
        </div>

        {/* Right: license status + user profile */}
        <div className="flex items-center gap-3">
          <LicenseBadge />
          <div className="w-px h-4 bg-[#E2E8F0]" />

          {/* Profile button + dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-[#F8FAFC] transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-[#EBF2FA] flex items-center justify-center">
                <User size={14} strokeWidth={1.75} className="text-[#1E3A5F]" />
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-[12px] font-semibold text-[#1A202C] leading-tight">
                  {user?.name ?? 'User'}
                </p>
                <p className="text-[11px] text-slate-400 leading-tight">
                  {ROLE_LABELS[(user?.role ?? 'Viewer') as UserRole] ?? user?.role}
                </p>
              </div>
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-[#E2E8F0] rounded-lg shadow-lg z-50 py-1">
                <div className="px-4 py-3 border-b border-[#F1F5F9]">
                  <p className="text-[13px] font-semibold text-[#1A202C] truncate">{user?.name}</p>
                  <p className="text-[11px] text-[#64748B] truncate">@{user?.username}</p>
                </div>

                <button
                  onClick={() => openModal('profile')}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-[#374151] hover:bg-[#F8FAFC] transition-colors"
                >
                  <Settings2 size={14} className="text-[#64748B]" />
                  Edit Profile
                </button>
                <button
                  onClick={() => openModal('password')}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-[#374151] hover:bg-[#F8FAFC] transition-colors"
                >
                  <KeyRound size={14} className="text-[#64748B]" />
                  Change Password
                </button>

                <div className="border-t border-[#F1F5F9] my-1" />

                <button
                  onClick={() => { setDropdownOpen(false); logout(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={14} />
                  Log Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {activeModal === 'profile' && user && (
        <ProfileModal
          userId={user.id}
          initialName={user.name}
          initialDepartment={user.department}
          initialEmail={user.email}
          username={user.username}
          onSave={(updated) => { setUser(updated); closeModal(); }}
          onClose={closeModal}
        />
      )}

      {activeModal === 'password' && user && (
        <PasswordModal
          userId={user.id}
          onClose={closeModal}
        />
      )}
    </>
  );
}

// ─── Profile Edit Modal ────────────────────────────────────────────────────

function ProfileModal({
  userId,
  initialName,
  initialDepartment,
  initialEmail,
  username,
  onSave,
  onClose,
}: {
  userId: number;
  initialName: string;
  initialDepartment: string;
  initialEmail: string;
  username: string;
  onSave: (user: import('../../types/user').AuthUser) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [department, setDepartment] = useState(initialDepartment);
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!name.trim()) { setError('Full name is required'); return; }
    setSubmitting(true);
    try {
      const updated = await updateOwnProfile(userId, name.trim(), department.trim(), email.trim() || null);
      setSuccess(true);
      setTimeout(() => onSave(updated), 800);
    } catch (err: unknown) {
      setError(typeof err === 'string' ? err : 'Failed to save profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalOverlay title="Edit Profile" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <ModalField label="Username">
          <input
            type="text"
            value={username}
            readOnly
            className="w-full h-9 px-3 text-[13px] border border-[#E2E8F0] rounded-md text-[#94A3B8] bg-[#F8FAFC] cursor-not-allowed font-mono"
          />
          <p className="text-[11px] text-[#94A3B8] mt-1">Username cannot be changed</p>
        </ModalField>

        <ModalField label="Full Name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className={inputCls}
          />
        </ModalField>

        <ModalField label="Department">
          <input
            type="text"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="e.g. Quality"
            className={inputCls}
          />
        </ModalField>

        <ModalField label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="optional"
            className={inputCls}
          />
        </ModalField>

        {error && <ErrorMsg text={error} />}
        {success && <SuccessMsg text="Profile updated successfully." />}

        <ModalActions onClose={onClose} submitting={submitting} label="Save Changes" />
      </form>
    </ModalOverlay>
  );
}

// ─── Change Password Modal ─────────────────────────────────────────────────

function PasswordModal({
  userId,
  onClose,
}: {
  userId: number;
  onClose: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!currentPassword) { setError('Current password is required'); return; }
    if (newPassword.length < 8) { setError('New password must be at least 8 characters'); return; }
    if (!/[A-Z]/.test(newPassword)) { setError('New password must contain at least one uppercase letter'); return; }
    if (!/[0-9]/.test(newPassword)) { setError('New password must contain at least one digit'); return; }
    if (newPassword !== confirmPassword) { setError('New passwords do not match'); return; }
    setSubmitting(true);
    try {
      await changeOwnPassword(userId, currentPassword, newPassword, confirmPassword);
      setSuccess(true);
      setTimeout(() => onClose(), 1200);
    } catch (err: unknown) {
      setError(typeof err === 'string' ? err : 'Failed to change password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalOverlay title="Change Password" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <ModalField label="Current Password" required>
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
              className="w-full h-9 px-3 pr-9 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent"
            />
            <PasswordToggle show={showCurrent} onToggle={() => setShowCurrent((v) => !v)} />
          </div>
        </ModalField>

        <ModalField label="New Password" required>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full h-9 px-3 pr-9 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent"
            />
            <PasswordToggle show={showNew} onToggle={() => setShowNew((v) => !v)} />
          </div>
          <p className="text-[11px] text-[#64748B] mt-1">Min. 8 chars · one uppercase · one digit</p>
        </ModalField>

        <ModalField label="Confirm New Password" required>
          <input
            type={showNew ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            className={inputCls}
          />
        </ModalField>

        {error && <ErrorMsg text={error} />}
        {success && <SuccessMsg text="Password changed successfully." />}

        <ModalActions onClose={onClose} submitting={submitting} label="Change Password" />
      </form>
    </ModalOverlay>
  );
}

// ─── Shared modal primitives ───────────────────────────────────────────────

const inputCls =
  'w-full h-9 px-3 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] placeholder-[#94A3B8] bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent';

function ModalOverlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-lg border border-[#E2E8F0] shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[15px] font-semibold text-[#1A202C]">{title}</h2>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#64748B]">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-[#64748B] mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function ModalActions({
  onClose,
  submitting,
  label,
}: {
  onClose: () => void;
  submitting: boolean;
  label: string;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onClose}
        className="h-8 px-4 text-[13px] text-[#64748B] hover:text-[#1A202C] border border-[#E2E8F0] rounded-md transition-colors"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={submitting}
        className="flex items-center gap-1.5 h-8 px-4 text-[13px] font-medium bg-[#1E3A5F] hover:bg-[#2E5080] text-white rounded-md transition-colors disabled:opacity-60"
      >
        {submitting && <Loader2 size={13} className="animate-spin" />}
        {label}
      </button>
    </div>
  );
}

function PasswordToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]"
      tabIndex={-1}
    >
      {show ? <EyeOff size={14} /> : <Eye size={14} />}
    </button>
  );
}

function ErrorMsg({ text }: { text: string }) {
  return (
    <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">
      {text}
    </p>
  );
}

function SuccessMsg({ text }: { text: string }) {
  return (
    <p className="text-[12px] text-green-700 bg-green-50 border border-green-100 rounded px-3 py-2">
      {text}
    </p>
  );
}

import React from 'react';
