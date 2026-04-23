import { create } from "zustand";

export type UiTheme = "tech" | "white" | "claude" | "raycast" | "spotify" | "linear" | "cursor";

const ALL_THEMES: UiTheme[] = ["tech", "white", "claude", "raycast", "spotify", "linear", "cursor"];

const STORAGE_KEY = "timelens_ui_theme";

function readStored(): UiTheme {
  try {
    if (typeof localStorage === "undefined") return "tech";
    const v = localStorage.getItem(STORAGE_KEY) as UiTheme | null;
    return v && ALL_THEMES.includes(v) ? v : "tech";
  } catch {
    return "tech";
  }
}

interface ThemeState {
  theme: UiTheme;
  setTheme: (t: UiTheme) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: readStored(),
  setTheme: (t) => {
    try {
      if (t === "tech") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
    set({ theme: t });
  },
}));
