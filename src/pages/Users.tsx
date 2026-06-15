import React, { useEffect, useState, type FormEvent } from 'react';
import {
  Users as UsersIcon,
  Plus,
  Edit2,
  UserCheck,
  UserX,
  KeyRound,
  X,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import StatusBadge from '../components/ui/StatusBadge';
import { useAuthStore } from '../stores/authStore';
import {
  listUsers,
  createUser,
  updateUser,
  setUserStatus,
  resetUserPassword,
} from '../services/userService';
import type { UserListItem } from '../types/user';
import { ALL_ROLES, ROLE_LABELS } from '../types/user';

type ModalMode = 'create' | 'edit' | 'reset-password' | null;

interface UserFormState {
  name: string;
  username: string;
  email: string;
  role: string;
  department: string;
  password: string;
  confirmPassword: string;
}

const EMPTY_FORM: UserFormState = {
  name: '',
  username: '',
  email: '',
  role: 'Employee',
  department: '',
  password: '',
  confirmPassword: '',
};

export default function Users() {
  const { user: currentUser } = useAuthStore();
  const isAdmin = currentUser?.role === 'Admin';

  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedUser, setSelectedUser] = useState<UserListItem | null>(null);
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function loadUsers() {
    if (!currentUser) return;
    setLoading(true);
    listUsers(currentUser.id)
      .then(setUsers)
      .catch(() => setError('Failed to load users'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { if (isAdmin) loadUsers(); }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowPassword(false);
    setSelectedUser(null);
    setModalMode('create');
  }

  function openEdit(u: UserListItem) {
    setForm({
      name: u.name,
      username: u.username,
      email: u.email,
      role: u.role,
      department: u.department,
      password: '',
      confirmPassword: '',
    });
    setFormError(null);
    setSelectedUser(u);
    setModalMode('edit');
  }

  function openResetPassword(u: UserListItem) {
    setForm({ ...EMPTY_FORM, name: u.name, username: u.username });
    setFormError(null);
    setShowPassword(false);
    setSelectedUser(u);
    setModalMode('reset-password');
  }

  function closeModal() {
    setModalMode(null);
    setSelectedUser(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function handleSubmitUser(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      if (modalMode === 'create') {
        if (form.password !== form.confirmPassword) {
          setFormError('Passwords do not match');
          return;
        }
        await createUser(
          currentUser!.id,
          form.name,
          form.username,
          form.email.trim() || null,
          form.role,
          form.department,
          form.password,
        );
      } else if (modalMode === 'edit' && selectedUser) {
        await updateUser(
          currentUser!.id,
          selectedUser.id,
          form.name,
          form.email.trim() || null,
          form.role,
          form.department,
        );
      } else if (modalMode === 'reset-password' && selectedUser) {
        if (form.password !== form.confirmPassword) {
          setFormError('Passwords do not match');
          return;
        }
        await resetUserPassword(currentUser!.id, selectedUser.id, form.password);
      }
      closeModal();
      loadUsers();
    } catch (err: unknown) {
      setFormError(typeof err === 'string' ? err : 'Operation failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(u: UserListItem) {
    try {
      await setUserStatus(currentUser!.id, u.id, !u.is_active);
      loadUsers();
    } catch (err: unknown) {
      setError(typeof err === 'string' ? err : 'Failed to update user status');
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <PageHeader title="Users" subtitle="Local user accounts and role management" icon={<UsersIcon size={18} />} />
        <Card className="mt-6">
          <p className="text-[13px] text-[#64748B]">
            Access to user management is restricted to Administrators.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Users"
        subtitle="Local user accounts and role management"
        icon={<UsersIcon size={18} />}
        action={
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 h-9 px-4 bg-[#1E3A5F] hover:bg-[#2E5080] text-white text-[13px] font-medium rounded-md transition-colors"
          >
            <Plus size={14} />
            New User
          </button>
        }
      />

      {error && (
        <p className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-md px-4 py-2.5">
          {error}
        </p>
      )}

      <Card padding={false}>
        {loading ? (
          <div className="flex items-center gap-2 text-[13px] text-[#64748B] p-6">
            <Loader2 size={14} className="animate-spin" />
            Loading users…
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-[#64748B]">No users found.</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#E2E8F0]">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Name</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Username</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Role</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Department</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                  <td className="px-5 py-3 font-medium text-[#1A202C]">{u.name}</td>
                  <td className="px-5 py-3 text-[#64748B] font-mono text-[12px]">@{u.username}</td>
                  <td className="px-5 py-3 text-[#1A202C]">{ROLE_LABELS[u.role] ?? u.role}</td>
                  <td className="px-5 py-3 text-[#64748B]">{u.department || '—'}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={u.is_active ? 'ACTIVE' : 'INACTIVE'} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <ActionBtn title="Edit" onClick={() => openEdit(u)}>
                        <Edit2 size={13} />
                      </ActionBtn>
                      <ActionBtn
                        title={u.is_active ? 'Deactivate' : 'Activate'}
                        onClick={() => handleToggleStatus(u)}
                      >
                        {u.is_active ? <UserX size={13} /> : <UserCheck size={13} />}
                      </ActionBtn>
                      <ActionBtn title="Reset Password" onClick={() => openResetPassword(u)}>
                        <KeyRound size={13} />
                      </ActionBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {modalMode && (
        <Modal
          title={
            modalMode === 'create' ? 'New User' :
            modalMode === 'edit' ? `Edit — ${selectedUser?.name}` :
            `Reset Password — ${selectedUser?.name}`
          }
          onClose={closeModal}
        >
          <form onSubmit={handleSubmitUser} className="space-y-4" noValidate>
            {modalMode !== 'reset-password' && (
              <>
                <FormField label="Full Name" required>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    autoFocus
                    className="w-full h-9 px-3 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] placeholder-[#94A3B8] bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent"
                  />
                </FormField>

                <FormField label="Username" required>
                  {modalMode === 'create' ? (
                    <>
                      <input
                        type="text"
                        value={form.username}
                        onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))}
                        placeholder="e.g. jsmith"
                        className="w-full h-9 px-3 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] placeholder-[#94A3B8] bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent"
                      />
                      <p className="text-[11px] text-[#64748B] mt-1">
                        Used for login · cannot be changed after creation
                      </p>
                    </>
                  ) : (
                    <input
                      type="text"
                      value={form.username}
                      readOnly
                      className="w-full h-9 px-3 text-[13px] border border-[#E2E8F0] rounded-md text-[#94A3B8] bg-[#F8FAFC] cursor-not-allowed"
                    />
                  )}
                </FormField>

                <FormField label="Email">
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="optional"
                    className="w-full h-9 px-3 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] placeholder-[#94A3B8] bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent"
                  />
                </FormField>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Role" required>
                    <select
                      value={form.role}
                      onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                      className="w-full h-9 px-3 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent"
                    >
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Department">
                    <input
                      type="text"
                      value={form.department}
                      onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                      placeholder="e.g. Quality"
                      className="w-full h-9 px-3 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] placeholder-[#94A3B8] bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent"
                    />
                  </FormField>
                </div>
              </>
            )}

            {(modalMode === 'create' || modalMode === 'reset-password') && (
              <>
                <FormField label="Password" required>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      className="w-full h-9 px-3 pr-9 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-[#64748B] mt-1">
                    Min. 8 chars · one uppercase · one digit
                  </p>
                </FormField>
                <FormField label="Confirm Password" required>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.confirmPassword}
                    onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                    className="w-full h-9 px-3 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] placeholder-[#94A3B8] bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent"
                  />
                </FormField>
              </>
            )}

            {formError && (
              <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">
                {formError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeModal}
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
                {modalMode === 'create' ? 'Create User' :
                 modalMode === 'edit' ? 'Save Changes' :
                 'Reset Password'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function ActionBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="p-1.5 text-[#64748B] hover:text-[#1E3A5F] hover:bg-[#EBF2FA] rounded transition-colors"
    >
      {children}
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-lg border border-[#E2E8F0] shadow-xl w-full max-w-md mx-4 p-6">
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

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-[#64748B] mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
