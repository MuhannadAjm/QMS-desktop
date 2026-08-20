import { create } from 'zustand';
import type { AuthUser } from '../types/user';

/**
 * Bootstrap outcomes.
 *
 * 'bootstrap-error' is a FAIL-CLOSED terminal state. Previously any thrown
 * error in the startup chain was caught and mapped to setBootstrapResult(false),
 * i.e. 'ready' — which showed the login screen. That meant a storage failure, a
 * database failure, or an exception inside the license check all silently
 * bypassed the license gate. Startup failures must now deny access, not grant it.
 */
export type BootstrapState =
  | 'loading'
  | 'license-invalid'
  | 'first-admin'
  | 'ready'
  | 'bootstrap-error';

interface AuthState {
  bootstrapState: BootstrapState;
  bootstrapError: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  setBootstrapResult: (needsFirstAdmin: boolean) => void;
  setLicenseInvalid: () => void;
  setBootstrapError: (message: string) => void;
  login: (user: AuthUser) => void;
  logout: () => void;
  setUser: (user: AuthUser) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  bootstrapState: 'loading',
  bootstrapError: null,
  user: null,
  isAuthenticated: false,

  setBootstrapResult: (needsFirstAdmin: boolean) =>
    set({ bootstrapState: needsFirstAdmin ? 'first-admin' : 'ready', bootstrapError: null }),

  setLicenseInvalid: () =>
    set({ bootstrapState: 'license-invalid', bootstrapError: null }),

  setBootstrapError: (message: string) =>
    set({ bootstrapState: 'bootstrap-error', bootstrapError: message, isAuthenticated: false, user: null }),

  login: (user: AuthUser) =>
    set({ user, isAuthenticated: true, bootstrapState: 'ready' }),

  logout: () =>
    set({ user: null, isAuthenticated: false }),

  setUser: (user: AuthUser) =>
    set({ user }),
}));
