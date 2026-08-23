import { create } from 'zustand';
import { getMyPermissions } from '../services/rbacService';

/**
 * The signed-in user's effective permissions, for hiding controls they cannot use.
 *
 * This is PRESENTATION ONLY. Every Tauri command independently re-checks the
 * caller's permissions in Rust, so nothing here is a security boundary — a user
 * who bypasses the UI gets rejected by the backend regardless. Hiding a button
 * the user cannot use is a courtesy, not a control.
 *
 * Fails CLOSED: if the fetch errors, `keys` stays empty and every `can()` returns
 * false, so a load failure hides controls rather than exposing them.
 */
interface PermissionState {
  keys: Set<string>;
  loaded: boolean;
  error: string | null;
  load: (userId: number) => Promise<void>;
  clear: () => void;
  /** True only if the permission is definitely held. */
  can: (key: string) => boolean;
  /** True if ANY of the keys is held — mirrors require_any_permission. */
  canAny: (...keys: string[]) => boolean;
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  keys: new Set<string>(),
  loaded: false,
  error: null,

  load: async (userId: number) => {
    try {
      const list = await getMyPermissions(userId);
      set({ keys: new Set(list), loaded: true, error: null });
    } catch (e) {
      // Fail closed — an empty set hides everything gated.
      set({ keys: new Set<string>(), loaded: true, error: String(e) });
    }
  },

  clear: () => set({ keys: new Set<string>(), loaded: false, error: null }),

  can: (key: string) => get().keys.has(key),

  canAny: (...keys: string[]) => {
    const held = get().keys;
    return keys.some(k => held.has(k));
  },
}));
