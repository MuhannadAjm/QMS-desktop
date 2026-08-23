import { invoke } from '@tauri-apps/api/core';
import type { UserListItem } from '../types/user';

export async function listUsers(currentUserId: number): Promise<UserListItem[]> {
  return invoke<UserListItem[]>('list_users', { currentUserId });
}

export async function createUser(
  currentUserId: number,
  name: string,
  username: string,
  email: string | null,
  role: string,
  department: string,
  password: string,
): Promise<UserListItem> {
  return invoke<UserListItem>('create_user', {
    currentUserId,
    name,
    username,
    email: email || null,
    role,
    department,
    password,
  });
}

export async function updateUser(
  currentUserId: number,
  id: number,
  name: string,
  email: string | null,
  role: string,
  department: string,
): Promise<UserListItem> {
  return invoke<UserListItem>('update_user', {
    currentUserId,
    id,
    name,
    email: email || null,
    role,
    department,
  });
}

export async function setUserStatus(currentUserId: number, id: number, isActive: boolean): Promise<void> {
  return invoke('set_user_status', { currentUserId, id, isActive });
}

export async function resetUserPassword(currentUserId: number, id: number, newPassword: string): Promise<void> {
  return invoke('reset_user_password', { currentUserId, id, newPassword });
}

/**
 * Eligibility is stored on the user, not derived from the role, so an
 * administrator can nominate any active user as a CAPA responsible or lead
 * auditor without granting them a wider role. Kept separate from updateUser so
 * it can be toggled without re-submitting the whole record.
 */
export async function setUserEligibility(
  currentUserId: number,
  id: number,
  canBeCapaResponsible: boolean,
  canBeLeadAuditor: boolean,
): Promise<void> {
  return invoke<void>('set_user_eligibility', {
    currentUserId,
    id,
    canBeCapaResponsible,
    canBeLeadAuditor,
  });
}
