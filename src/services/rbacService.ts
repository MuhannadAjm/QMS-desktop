import { invoke } from '@tauri-apps/api/core';

/**
 * Roles, permissions and per-user overrides.
 *
 * All authority is computed in Rust. Nothing here re-derives whether a user may
 * do something — `effective` on UserRbac is the backend's answer, and the UI
 * only displays it. Hiding a control is a convenience; every command re-checks.
 */

export interface RoleListItem {
  id: number;
  role_key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  user_count: number;
  permission_count: number;
}

export interface PermissionItem {
  perm_key: string;
  module: string;
  action: string;
  label: string;
  description: string | null;
  sort_order: number;
}

export type OverrideEffect = 'ALLOW' | 'DENY';

export interface UserOverride {
  perm_key: string;
  effect: OverrideEffect;
}

export interface UserRbac {
  user_id: number;
  role_id: number | null;
  role_name: string | null;
  role_is_active: boolean;
  is_active: boolean;
  /** Granted by the role template alone, before overrides. */
  inherited: string[];
  overrides: UserOverride[];
  /** Backend-computed final result — display this, never recompute it. */
  effective: string[];
  can_be_capa_responsible: boolean;
  can_be_lead_auditor: boolean;
}

// ── Registry ──────────────────────────────────────────────────────────────────

export async function listPermissions(currentUserId: number): Promise<PermissionItem[]> {
  return invoke<PermissionItem[]>('list_permissions', { currentUserId });
}

/** The signed-in user's own effective permissions, for navigation/button gating. */
export async function getMyPermissions(currentUserId: number): Promise<string[]> {
  return invoke<string[]>('get_my_permissions', { currentUserId });
}

// ── Roles ─────────────────────────────────────────────────────────────────────

export async function listRoles(currentUserId: number): Promise<RoleListItem[]> {
  return invoke<RoleListItem[]>('list_roles', { currentUserId });
}

export async function getRolePermissions(currentUserId: number, roleId: number): Promise<string[]> {
  return invoke<string[]>('get_role_permissions', { currentUserId, roleId });
}

export async function createRole(
  currentUserId: number,
  name: string,
  description?: string,
): Promise<number> {
  return invoke<number>('create_role', { currentUserId, name, description });
}

export async function updateRole(
  currentUserId: number,
  roleId: number,
  name: string,
  description?: string,
): Promise<void> {
  return invoke<void>('update_role', { currentUserId, roleId, name, description });
}

export async function setRoleActive(
  currentUserId: number,
  roleId: number,
  isActive: boolean,
): Promise<void> {
  return invoke<void>('set_role_active', { currentUserId, roleId, isActive });
}

/** Replaces the role's whole template with exactly these keys. */
export async function setRolePermissions(
  currentUserId: number,
  roleId: number,
  permKeys: string[],
): Promise<void> {
  return invoke<void>('set_role_permissions', { currentUserId, roleId, permKeys });
}

// ── User RBAC ─────────────────────────────────────────────────────────────────

export async function getUserRbac(currentUserId: number, userId: number): Promise<UserRbac> {
  return invoke<UserRbac>('get_user_rbac', { currentUserId, userId });
}

export async function setUserRole(
  currentUserId: number,
  userId: number,
  roleId: number,
): Promise<void> {
  return invoke<void>('set_user_role', { currentUserId, userId, roleId });
}

/** `effect: null` clears the override and returns the key to the role default. */
export async function setUserOverride(
  currentUserId: number,
  userId: number,
  permKey: string,
  effect: OverrideEffect | null,
): Promise<void> {
  return invoke<void>('set_user_override', { currentUserId, userId, permKey, effect });
}

export async function resetUserOverrides(currentUserId: number, userId: number): Promise<void> {
  return invoke<void>('reset_user_overrides', { currentUserId, userId });
}

// ── Grouping helper ───────────────────────────────────────────────────────────

/** Human labels for the module grouping in the matrix. */
export const MODULE_LABELS: Record<string, string> = {
  dashboard:  'Dashboard',
  capa:       'CAPA',
  risks:      'Risks',
  complaints: 'Complaints',
  audits:     'Audits',
  nc:         'Non-Conformities',
  documents:  'Documents',
  users:      'Users',
  roles:      'Roles & Permissions',
  masterdata: 'Master Data',
  reports:    'Reports',
  backup:     'Backup',
  settings:   'Settings',
};

export interface PermissionGroup {
  module: string;
  label: string;
  permissions: PermissionItem[];
}

/**
 * Group the flat registry by module, preserving registry order.
 *
 * Only the actions a module actually has are returned — the matrix is not
 * padded out to a fixed set of columns, because forcing symmetry would imply
 * capabilities that do not exist (there is no delete command outside backup).
 */
export function groupPermissions(perms: PermissionItem[]): PermissionGroup[] {
  const order: string[] = [];
  const byModule = new Map<string, PermissionItem[]>();
  for (const p of perms) {
    if (!byModule.has(p.module)) {
      byModule.set(p.module, []);
      order.push(p.module);
    }
    byModule.get(p.module)!.push(p);
  }
  return order.map(m => ({
    module: m,
    label: MODULE_LABELS[m] ?? m,
    permissions: byModule.get(m)!,
  }));
}
