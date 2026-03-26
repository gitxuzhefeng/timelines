import { create } from "zustand";
import type { WindowEvent } from "../types";
import { tauriService } from "../services/tauri";

interface AppStore {
  // State
  isTracking: boolean;
  todayEvents: WindowEvent[];
  settings: Record<string, string>;
  theme: 'dark' | 'light';
  isLoading: boolean;
  error: string | null;

  // Actions
  setTracking: (value: boolean) => void;
  toggleTracking: () => Promise<void>;
  loadTodayEvents: () => Promise<void>;
  loadSettings: () => Promise<void>;
  setTheme: (theme: 'dark' | 'light') => void;
  updateSetting: (key: string, value: string) => Promise<void>;
  addTodayEvent: (event: WindowEvent) => void;
  updateLatestEvent: (id: string, updates: Partial<WindowEvent>) => void;
  clearError: () => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  isTracking: false,
  todayEvents: [],
  settings: {},
  theme: 'dark',
  isLoading: false,
  error: null,

  setTracking: (value) => set({ isTracking: value }),

  toggleTracking: async () => {
    const { isTracking } = get();
    try {
      if (isTracking) {
        await tauriService.stopTracking();
        set({ isTracking: false });
      } else {
        await tauriService.startTracking();
        set({ isTracking: true });
      }
    } catch (e) {
      set({ error: String(e) });
    }
  },

  loadTodayEvents: async () => {
    try {
      const events = await tauriService.getTodayEvents();
      set({ todayEvents: events });
    } catch (e) {
      console.warn("loadTodayEvents failed:", e);
    }
  },

  loadSettings: async () => {
    try {
      const settings = await tauriService.getSettings();
      const theme = (settings['theme'] as 'dark' | 'light') || 'dark';
      set({ settings, theme });
    } catch (e) {
      console.warn("loadSettings failed:", e);
    }
  },

  setTheme: (theme) => {
    set({ theme });
    tauriService.setSetting('theme', theme).catch(console.error);
  },

  updateSetting: async (key: string, value: string) => {
    try {
      await tauriService.setSetting(key, value);
      set((state) => ({
        settings: { ...state.settings, [key]: value },
      }));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  addTodayEvent: (event) =>
    set((state) => ({ todayEvents: [event, ...state.todayEvents] })),

  updateLatestEvent: (id: string, updates: Partial<WindowEvent>) =>
    set((state) => {
      const newEvents = [...state.todayEvents];
      const index = newEvents.findIndex((e) => e.id === id);
      if (index !== -1) {
        newEvents[index] = { ...newEvents[index], ...updates };
      }
      return { todayEvents: newEvents };
    }),

  clearError: () => set({ error: null }),
}));
