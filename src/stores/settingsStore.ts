import { create } from 'zustand';

interface SettingsState {
  companyName: string;
  setCompanyName: (name: string) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  companyName: '',
  setCompanyName: (companyName) => set({ companyName }),
}));
