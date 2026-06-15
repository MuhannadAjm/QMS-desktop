import { invoke } from '@tauri-apps/api/core';
import type { AuthUser } from '../types/user';

export async function checkFirstAdminExists(): Promise<boolean> {
  return invoke<boolean>('check_first_admin_exists');
}

export async function createFirstAdmin(
  name: string,
  username: string,
  email: string | null,
  password: string,
  confirmPassword: string,
): Promise<AuthUser> {
  return invoke<AuthUser>('create_first_admin', {
    name,
    username,
    email: email || null,
    password,
    confirmPassword,
  });
}

export async function loginUser(username: string, password: string): Promise<AuthUser> {
  return invoke<AuthUser>('login', { username, password });
}

export async function updateOwnProfile(
  currentUserId: number,
  name: string,
  department: string,
  email: string | null,
): Promise<AuthUser> {
  return invoke<AuthUser>('update_own_profile', {
    currentUserId,
    name,
    department,
    email: email || null,
  });
}

export async function changeOwnPassword(
  currentUserId: number,
  currentPassword: string,
  newPassword: string,
  confirmNewPassword: string,
): Promise<void> {
  return invoke('change_own_password', {
    currentUserId,
    currentPassword,
    newPassword,
    confirmNewPassword,
  });
}
