import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '../lib/storage';

interface UIStore {
  /** Tema del diccionario mostrado en el panel contextual. */
  topic: string | null;
  panelOpen: boolean;
  sidebarOpen: boolean;
  theme: 'dark' | 'light';
  /** Laboratorio visible actualmente (destino de "Enviar a la terminal"). */
  activeLab: string | null;
  setActiveLab: (id: string | null) => void;
  setTopic: (t: string | null, open?: boolean) => void;
  togglePanel: (open?: boolean) => void;
  toggleSidebar: (open?: boolean) => void;
  setTheme: (t: 'dark' | 'light') => void;
}

export const useUI = create<UIStore>()(
  persist(
    (set, get) => ({
      topic: null,
      panelOpen: true,
      sidebarOpen: false,
      theme: 'dark',
      activeLab: null,
      setActiveLab: (activeLab) => set({ activeLab }),
      setTopic: (topic, open) => set({ topic, ...(open !== undefined ? { panelOpen: open } : {}) }),
      togglePanel: (open) => set({ panelOpen: open ?? !get().panelOpen }),
      toggleSidebar: (open) => set({ sidebarOpen: open ?? !get().sidebarOpen }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'git-lab:ui',
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ panelOpen: s.panelOpen, theme: s.theme }),
    },
  ),
);
