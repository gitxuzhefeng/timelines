import { create } from "zustand";

export type UiTheme = "tech" | "white";

const STORAGE_KEY = "timelens_ui_theme";

function readStored(): UiTheme {
  try {
    if (typeof localStorage === "undefined") return "tech";
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "white" ? "white" : "tech";
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
      if (t === "white") localStorage.setItem(STORAGE_KEY, "white");
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    set({ theme: t });
  },
}));
