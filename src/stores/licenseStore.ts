import { create } from 'zustand';
import type { LicenseState } from '../types/license';

interface LicenseStoreState {
  state: LicenseState | null;
  stateLabel: string;
  isValid: boolean;
  setLicenseStatus: (state: LicenseState, stateLabel: string, isValid: boolean) => void;
}

export const useLicenseStore = create<LicenseStoreState>((set) => ({
  state: null,
  stateLabel: '',
  isValid: false,
  setLicenseStatus: (state, stateLabel, isValid) => set({ state, stateLabel, isValid }),
}));
