export type UserRole = 'Admin' | 'QualityManager' | 'Auditor' | 'Employee' | 'Viewer';

export const ALL_ROLES: UserRole[] = ['Admin', 'QualityManager', 'Auditor', 'Employee', 'Viewer'];

export const ROLE_LABELS: Record<UserRole, string> = {
  Admin: 'Admin',
  QualityManager: 'Quality Manager',
  Auditor: 'Auditor',
  Employee: 'Employee',
  Viewer: 'Viewer',
};

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  is_active: boolean;
}

export interface UserListItem {
  id: number;
  username: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  is_active: boolean;
  created_at: string;
}
