import { create } from 'zustand';

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  activeDialog: string | null;
  openDialog: (name: string) => void;
  closeDialog: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: localStorage.getItem('qms-sidebar-collapsed') === 'true',

  toggleSidebar: () =>
    set((s) => {
      const next = !s.sidebarCollapsed;
      localStorage.setItem('qms-sidebar-collapsed', String(next));
      return { sidebarCollapsed: next };
    }),

  setSidebarCollapsed: (v: boolean) => {
    localStorage.setItem('qms-sidebar-collapsed', String(v));
    set({ sidebarCollapsed: v });
  },

  activeDialog: null,
  openDialog: (name: string) => set({ activeDialog: name }),
  closeDialog: () => set({ activeDialog: null }),
}));
