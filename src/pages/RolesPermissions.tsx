import { useState, useEffect, useCallback, useMemo } from 'react';
import { Shield, AlertCircle, Lock, Plus } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { usePermissionStore } from '../stores/permissionStore';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import PermissionMatrix from '../components/ui/PermissionMatrix';
import {
  listRoles, listPermissions, getRolePermissions,
  createRole, updateRole, setRoleActive, setRolePermissions,
  groupPermissions,
  type RoleListItem, type PermissionItem,
} from '../services/rbacService';

/**
 * Roles & Permissions administration.
 *
 * Route visibility and button state follow the caller's effective permissions,
 * but that is presentation only — every command below re-checks in Rust, so a
 * user who reaches this screen without roles.manage still cannot save anything.
 */
export default function RolesPermissions() {
  const { user } = useAuthStore();
  const can = usePermissionStore(s => s.can);
  const userId = user?.id ?? 0;

  const canView = can('roles.view');
  const canManage = can('roles.manage');

  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [perms, setPerms] = useState<PermissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Role create/edit metadata modal
  const [editing, setEditing] = useState<RoleListItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Permission template editor
  const [templateRole, setTemplateRole] = useState<RoleListItem | null>(null);
  const [templateKeys, setTemplateKeys] = useState<Set<string>>(new Set());
  const [templateOriginal, setTemplateOriginal] = useState<Set<string>>(new Set());
  const [templateLoading, setTemplateLoading] = useState(false);

  const groups = useMemo(() => groupPermissions(perms), [perms]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [r, p] = await Promise.all([listRoles(userId), listPermissions(userId)]);
      setRoles(r);
      setPerms(p);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { if (canView) void load(); else setLoading(false); }, [canView, load]);

  if (!canView) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-8 text-center">
          <Lock size={28} className="mx-auto text-[#94A3B8] mb-3" />
          <h1 className="text-[16px] font-semibold text-[#1E3A5F] mb-1">Roles &amp; Permissions</h1>
          <p className="text-[13px] text-[#64748B]">
            You do not have permission to view role configuration.
          </p>
        </div>
      </div>
    );
  }

  // ── Role metadata ───────────────────────────────────────────────────────────

  function openCreate() {
    setCreating(true); setEditing(null);
    setFormName(''); setFormDesc(''); setFormError(null);
  }

  function openEdit(r: RoleListItem) {
    setEditing(r); setCreating(false);
    setFormName(r.name); setFormDesc(r.description ?? ''); setFormError(null);
  }

  async function saveRoleMeta() {
    if (!formName.trim()) { setFormError('Role name is required'); return; }
    setSaving(true); setFormError(null);
    try {
      if (creating) {
        await createRole(userId, formName.trim(), formDesc.trim() || undefined);
        setNotice(`Role "${formName.trim()}" created. It starts with no permissions — configure them next.`);
      } else if (editing) {
        await updateRole(userId, editing.id, formName.trim(), formDesc.trim() || undefined);
        setNotice(`Role "${formName.trim()}" updated.`);
      }
      setCreating(false); setEditing(null);
      await load();
    } catch (e) {
      setFormError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(r: RoleListItem) {
    setError(null); setNotice(null);
    try {
      await setRoleActive(userId, r.id, !r.is_active);
      setNotice(`Role "${r.name}" ${r.is_active ? 'deactivated' : 'activated'}.`);
      await load();
    } catch (e) {
      // The control-path invariant surfaces here — show it verbatim.
      setError(String(e));
    }
  }

  // ── Template editor ─────────────────────────────────────────────────────────

  async function openTemplate(r: RoleListItem) {
    setTemplateRole(r); setTemplateLoading(true); setError(null);
    try {
      const keys = await getRolePermissions(userId, r.id);
      setTemplateKeys(new Set(keys));
      setTemplateOriginal(new Set(keys));
    } catch (e) {
      setError(String(e));
      setTemplateRole(null);
    } finally {
      setTemplateLoading(false);
    }
  }

  const templateDirty = useMemo(() => {
    if (templateKeys.size !== templateOriginal.size) return true;
    for (const k of templateKeys) if (!templateOriginal.has(k)) return true;
    return false;
  }, [templateKeys, templateOriginal]);

  async function saveTemplate() {
    if (!templateRole) return;
    setSaving(true); setError(null);
    try {
      await setRolePermissions(userId, templateRole.id, [...templateKeys]);
      setNotice(`Permissions for "${templateRole.name}" saved. Users with this role and no personal override are updated immediately.`);
      setTemplateRole(null);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield size={20} className="text-[#1E3A5F]" />
          <div>
            <h1 className="text-lg font-bold text-[#1E3A5F]">Roles &amp; Permissions</h1>
            <p className="text-xs text-gray-500">
              Configure what each role may do. Individual users can be adjusted in Users.
            </p>
          </div>
        </div>
        {canManage && (
          <Button variant="primary" onClick={openCreate}>
            <span className="flex items-center gap-1.5"><Plus size={15} /> New Role</span>
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-[13px]">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E40AF] rounded-lg px-4 py-3 text-[13px]">
          {notice}
        </div>
      )}
      {!canManage && (
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] rounded-lg px-4 py-2.5 text-[12.5px]">
          You can view role configuration but not change it.
        </div>
      )}

      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-[#F8FAFC] text-[11px] uppercase tracking-wide text-[#64748B]">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Role</th>
                <th className="text-left px-4 py-2.5 font-semibold">Type</th>
                <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                <th className="text-right px-4 py-2.5 font-semibold">Users</th>
                <th className="text-right px-4 py-2.5 font-semibold">Permissions</th>
                <th className="text-right px-4 py-2.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {loading && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-[#94A3B8]">Loading…</td></tr>
              )}
              {!loading && roles.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-[#94A3B8]">No roles found.</td></tr>
              )}
              {roles.map(r => (
                <tr key={r.id} className={r.is_active ? '' : 'bg-[#FAFAFA]'}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-[#1A202C]">{r.name}</div>
                    {r.description && (
                      <div className="text-[11.5px] text-[#64748B] mt-0.5">{r.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                      r.is_system ? 'bg-[#E0E7FF] text-[#3730A3]' : 'bg-[#F1F5F9] text-[#475569]'}`}>
                      {r.is_system ? 'Built-in' : 'Custom'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                      r.is_active ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#FEE2E2] text-[#B91C1C]'}`}>
                      {r.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#475569]">{r.user_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#475569]">{r.permission_count}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => void openTemplate(r)}
                        className="text-[12px] font-medium text-[#1E3A5F] hover:underline"
                      >
                        {canManage ? 'Configure' : 'View'} permissions
                      </button>
                      {canManage && !r.is_system && (
                        <button onClick={() => openEdit(r)}
                          className="text-[12px] font-medium text-[#1E3A5F] hover:underline">
                          Rename
                        </button>
                      )}
                      {canManage && (
                        <button onClick={() => void toggleActive(r)}
                          className="text-[12px] font-medium text-[#B45309] hover:underline">
                          {r.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11.5px] text-[#94A3B8]">
        Roles are never deleted — they are referenced by user accounts and by the activity history.
        Deactivate a role instead; everyone holding it immediately loses access through it.
        Built-in roles cannot be renamed, but their permissions can be changed.
      </p>

      {/* Create / rename */}
      <Modal
        open={creating || editing !== null}
        title={creating ? 'New Role' : `Rename ${editing?.name ?? ''}`}
        onClose={() => { setCreating(false); setEditing(null); }}
        widthClass="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setCreating(false); setEditing(null); }} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void saveRoleMeta()} disabled={saving || !formName.trim()}>
              {saving ? 'Saving…' : creating ? 'Create Role' : 'Save'}
            </Button>
          </>
        }
      >
        {formError && (
          <div className="bg-red-50 text-red-700 px-3 py-2 rounded text-sm">{formError}</div>
        )}
        <div>
          <label className="block text-[12px] font-semibold text-[#64748B] mb-1.5 uppercase tracking-wide">
            Role Name <span className="text-red-500">*</span>
          </label>
          <input
            value={formName}
            onChange={e => setFormName(e.target.value)}
            placeholder="e.g. Document Controller"
            className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#2E5080]"
          />
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-[#64748B] mb-1.5 uppercase tracking-wide">
            Description
          </label>
          <textarea
            rows={3}
            value={formDesc}
            onChange={e => setFormDesc(e.target.value)}
            placeholder="What is this role for?"
            className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-[#2E5080]"
          />
        </div>
        {creating && (
          <p className="text-[12px] text-[#64748B]">
            The role is created with no permissions. You choose them in the next step.
          </p>
        )}
      </Modal>

      {/* Permission template */}
      <Modal
        open={templateRole !== null}
        title={`Permissions — ${templateRole?.name ?? ''}`}
        onClose={() => setTemplateRole(null)}
        widthClass="max-w-3xl"
        footer={
          <>
            {templateDirty && (
              <span className="mr-auto text-[12px] text-[#B45309]">Unsaved changes</span>
            )}
            <Button variant="secondary" onClick={() => setTemplateRole(null)} disabled={saving}>
              Cancel
            </Button>
            {canManage && (
              <Button variant="primary" onClick={() => void saveTemplate()} disabled={saving || !templateDirty}>
                {saving ? 'Saving…' : 'Save Permissions'}
              </Button>
            )}
          </>
        }
      >
        {templateLoading ? (
          <p className="text-[13px] text-[#94A3B8]">Loading permissions…</p>
        ) : (
          <>
            <p className="text-[12.5px] text-[#64748B]">
              These are the defaults for everyone with this role. A user can be adjusted
              individually in Users without changing the role.
            </p>
            <PermissionMatrix
              mode="role"
              groups={groups}
              granted={templateKeys}
              readOnly={!canManage}
              onToggle={(key, next) =>
                setTemplateKeys(prev => {
                  const s = new Set(prev);
                  if (next) s.add(key); else s.delete(key);
                  return s;
                })
              }
            />
          </>
        )}
      </Modal>
    </div>
  );
}
