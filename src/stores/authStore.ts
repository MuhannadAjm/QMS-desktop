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

  // Also drops the session. AppRouter checks 'license-invalid' before
  // isAuthenticated, so routing already blocks the application — but leaving a
  // signed-in user cached here would mean an authoritative revocation arriving
  // mid-session left a live session sitting behind the gate. A machine the
  // vendor has refused must require a fresh activation AND a fresh sign-in,
  // which is the same fail-closed shape setBootstrapError already uses.
  setLicenseInvalid: () =>
    set({
      bootstrapState: 'license-invalid',
      bootstrapError: null,
      isAuthenticated: false,
      user: null,
    }),

  setBootstrapError: (message: string) =>
    set({ bootstrapState: 'bootstrap-error', bootstrapError: message, isAuthenticated: false, user: null }),

  // Refuses to re-open the app once the licence has been withdrawn.
  //
  // The startup online check is deliberately not awaited, so an authoritative
  // denial can land while the user is looking at the Login screen. Without this
  // guard, a successful sign-in a moment later would set bootstrapState 'ready'
  // and walk straight past the gate that had just closed.
  //
  // Recovery is not blocked: re-activating on the License page calls
  // setBootstrapResult, which clears the gate legitimately.
  login: (user: AuthUser) =>
    set((s) =>
      s.bootstrapState === 'license-invalid'
        ? s
        : { user, isAuthenticated: true, bootstrapState: 'ready' },
    ),

  logout: () =>
    set({ user: null, isAuthenticated: false }),

  setUser: (user: AuthUser) =>
    set({ user }),
}));
