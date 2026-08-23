import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import Modal from '../ui/Modal';
import PermissionMatrix, { type OverrideEffect } from '../ui/PermissionMatrix';
import {
  getUserRbac,
  listPermissions,
  listRoles,
  groupPermissions,
  resetUserOverrides,
  setUserOverride,
  setUserRole,
  type PermissionItem,
  type RoleListItem,
  type UserRbac,
} from '../../services/rbacService';
import { setUserEligibility } from '../../services/userService';

/**
 * Everything that decides what one user may do, in one place: their role, their
 * per-user exceptions, what those two resolve to, and the two assignment
 * eligibility flags.
 *
 * The effective set shown here is ALWAYS the backend's answer (`rbac.effective`),
 * re-fetched after every change. It is never recomputed in the browser, because
 * a UI that predicts authority will eventually disagree with the engine that
 * enforces it, and the disagreement would look like a permissions bug.
 *
 * Each control saves immediately rather than batching behind a Save button. A
 * half-applied permission set is a security-relevant state, and immediate writes
 * mean what is on screen after a refetch is exactly what the database holds.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  currentUserId: number;
  userId: number;
  userName: string;
  /** Whether the signed-in user may change any of this. */
  canManage: boolean;
  /** Whether the signed-in user may read the role list (roles.view). */
  canViewRoles: boolean;
  /** Called after any successful write so the parent list can refresh. */
  onChanged: () => void;
}

export default function UserPermissionsModal({
  open,
  onClose,
  currentUserId,
  userId,
  userName,
  canManage,
  canViewRoles,
  onChanged,
}: Props) {
  const [rbac, setRbac] = useState<UserRbac | null>(null);
  const [perms, setPerms] = useState<PermissionItem[]>([]);
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // The role list is a separate permission (roles.view). A user who may
      // manage users but not read roles still gets the rest of this screen —
      // their role is shown read-only instead of the whole load failing.
      const [r, p, rl] = await Promise.all([
        getUserRbac(currentUserId, userId),
        listPermissions(currentUserId),
        canViewRoles ? listRoles(currentUserId) : Promise.resolve<RoleListItem[]>([]),
      ]);
      setRbac(r);
      setPerms(p);
      setRoles(rl);
    } catch (e) {
      setError(typeof e === 'string' ? e : 'Could not load permissions for this user.');
    } finally {
      setLoading(false);
    }
  }, [currentUserId, userId, canViewRoles]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void load();
  }, [open, load]);

  // Every mutation follows the same shape: write, refetch, tell the parent.
  // Refetching rather than patching local state is what keeps `effective`
  // authoritative — the DENY > ALLOW > template precedence lives in Rust.
  async function mutate(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
      onChanged();
    } catch (e) {
      setError(typeof e === 'string' ? e : 'The change could not be saved.');
      // Refetch anyway so the screen reflects the database, not the attempt.
      await load();
    } finally {
      setBusy(false);
    }
  }

  const groups = useMemo(() => groupPermissions(perms), [perms]);

  const inherited = useMemo(() => new Set(rbac?.inherited ?? []), [rbac]);
  const overrides = useMemo(() => {
    const m = new Map<string, OverrideEffect>();
    for (const o of rbac?.overrides ?? []) m.set(o.perm_key, o.effect);
    return m;
  }, [rbac]);
  const effective = useMemo(() => new Set(rbac?.effective ?? []), [rbac]);

  const assignableRoles = roles.filter((r) => r.is_active || r.id === rbac?.role_id);
  const readOnly = !canManage || busy;

  const allowCount = [...overrides.values()].filter((v) => v === 'ALLOW').length;
  const denyCount = [...overrides.values()].filter((v) => v === 'DENY').length;

  return (
    <Modal
      open={open}
      title={
        <span className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-[#1E3A5F]" />
          Permissions — {userName}
        </span>
      }
      onClose={onClose}
      widthClass="max-w-3xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[11.5px] text-[#64748B]">
            {busy ? 'Saving…' : 'Changes are saved immediately.'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC]"
          >
            Close
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[#64748B] py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading permissions…
        </div>
      ) : !rbac ? (
        <p className="text-[13px] text-[#B91C1C] py-6">{error ?? 'Not available.'}</p>
      ) : (
        <div className="space-y-5">
          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA]">
              <AlertTriangle size={15} className="text-[#B91C1C] mt-0.5 shrink-0" />
              <p className="text-[12.5px] text-[#B91C1C]">{error}</p>
            </div>
          )}

          {/* Why the user might have nothing: three separate causes, each with a
              different fix, so they are named rather than merged into one
              generic "no access" message. */}
          {!rbac.is_active && (
            <Notice>
              This account is deactivated, so it has no permissions at all until it is
              reactivated. The role and exceptions below are kept, but inert.
            </Notice>
          )}
          {rbac.is_active && rbac.role_id !== null && !rbac.role_is_active && (
            <Notice>
              The assigned role <strong>{rbac.role_name}</strong> is deactivated, so this
              user currently has no permissions. Reactivate the role, or assign a
              different one.
            </Notice>
          )}
          {rbac.is_active && rbac.role_id === null && (
            <Notice>
              No role is assigned, so this user has no permissions. Choose a role below.
            </Notice>
          )}

          {/* Role */}
          <section>
            <h3 className="text-[12px] font-semibold text-[#1E3A5F] uppercase tracking-wider mb-2">
              Role
            </h3>
            {canViewRoles ? (
              <select
                value={rbac.role_id ?? ''}
                disabled={readOnly}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (Number.isFinite(id) && id > 0) {
                    void mutate(() => setUserRole(currentUserId, userId, id));
                  }
                }}
                className="w-full h-9 px-3 text-[13px] border border-[#E2E8F0] rounded-md bg-white text-[#1A202C] disabled:bg-[#F8FAFC] disabled:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
              >
                {rbac.role_id === null && <option value="">— no role —</option>}
                {assignableRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.is_active ? '' : ' (deactivated)'}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-[13px] text-[#1A202C]">
                {rbac.role_name ?? '— no role —'}
                <span className="ml-2 text-[11.5px] text-[#64748B]">
                  (you do not have permission to view or change roles)
                </span>
              </p>
            )}
            <p className="mt-1.5 text-[11.5px] text-[#64748B]">
              The role sets the starting point. Exceptions below adjust it for this user
              only.
            </p>
          </section>

          {/* Eligibility */}
          <section>
            <h3 className="text-[12px] font-semibold text-[#1E3A5F] uppercase tracking-wider mb-2">
              Assignment eligibility
            </h3>
            <p className="text-[11.5px] text-[#64748B] mb-2">
              Controls who appears in the CAPA responsible and lead auditor selectors.
              Separate from permissions: being selectable to own a record is not the same
              as being allowed to change it.
            </p>
            <div className="space-y-2">
              <EligibilityRow
                label="Can be a CAPA responsible person"
                checked={rbac.can_be_capa_responsible}
                disabled={readOnly}
                onChange={(next) =>
                  void mutate(() =>
                    setUserEligibility(currentUserId, userId, next, rbac.can_be_lead_auditor),
                  )
                }
              />
              <EligibilityRow
                label="Can be a lead auditor"
                checked={rbac.can_be_lead_auditor}
                disabled={readOnly}
                onChange={(next) =>
                  void mutate(() =>
                    setUserEligibility(currentUserId, userId, rbac.can_be_capa_responsible, next),
                  )
                }
              />
            </div>
          </section>

          {/* Effective preview */}
          <section>
            <h3 className="text-[12px] font-semibold text-[#1E3A5F] uppercase tracking-wider mb-2">
              What this user can do
            </h3>
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12.5px]">
                <Stat label="Effective permissions" value={`${effective.size} of ${perms.length}`} />
                <Stat label="From the role" value={String(inherited.size)} />
                <Stat
                  label="User exceptions"
                  value={
                    overrides.size === 0 ? 'none' : `${allowCount} allow, ${denyCount} deny`
                  }
                />
              </div>
              {effective.size === 0 && (
                <p className="mt-2 text-[12px] text-[#B45309]">
                  This user cannot currently do anything in the application.
                </p>
              )}
            </div>
          </section>

          {/* Overrides */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[12px] font-semibold text-[#1E3A5F] uppercase tracking-wider">
                Exceptions for this user
              </h3>
              {canManage && overrides.size > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void mutate(() => resetUserOverrides(currentUserId, userId))}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium text-[#1E3A5F] border border-[#E2E8F0] rounded-md hover:bg-[#F8FAFC] disabled:opacity-50"
                >
                  <RotateCcw size={13} /> Clear all exceptions
                </button>
              )}
            </div>
            <PermissionMatrix
              mode="user"
              groups={groups}
              inherited={inherited}
              overrides={overrides}
              readOnly={readOnly}
              onSet={(permKey, effect) =>
                void mutate(() => setUserOverride(currentUserId, userId, permKey, effect))
              }
            />
          </section>
        </div>
      )}
    </Modal>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <p className="text-[12.5px]">{children}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-[#64748B]">
      {label}: <strong className="text-[#1A202C] font-semibold">{value}</strong>
    </span>
  );
}

function EligibilityRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-[#1E3A5F] disabled:cursor-not-allowed"
      />
      <span className="text-[13px] text-[#1A202C]">{label}</span>
    </label>
  );
}
