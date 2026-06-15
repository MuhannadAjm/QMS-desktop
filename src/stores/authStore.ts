import { create } from 'zustand';
import type { AuthUser } from '../types/user';

export type BootstrapState = 'loading' | 'license-invalid' | 'first-admin' | 'ready';

interface AuthState {
  bootstrapState: BootstrapState;
  user: AuthUser | null;
  isAuthenticated: boolean;
  setBootstrapResult: (needsFirstAdmin: boolean) => void;
  setLicenseInvalid: () => void;
  login: (user: AuthUser) => void;
  logout: () => void;
  setUser: (user: AuthUser) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  bootstrapState: 'loading',
  user: null,
  isAuthenticated: false,

  setBootstrapResult: (needsFirstAdmin: boolean) =>
    set({ bootstrapState: needsFirstAdmin ? 'first-admin' : 'ready' }),

  setLicenseInvalid: () =>
    set({ bootstrapState: 'license-invalid' }),

  login: (user: AuthUser) =>
    set({ user, isAuthenticated: true, bootstrapState: 'ready' }),

  logout: () =>
    set({ user: null, isAuthenticated: false }),

  setUser: (user: AuthUser) =>
    set({ user }),
}));
