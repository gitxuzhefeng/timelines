import { create } from "zustand";

const STORAGE_KEY = "timelens_dev_mode";

function readStored(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

interface DevModeState {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  toggle: () => void;
}

export const useDevModeStore = create<DevModeState>((set, get) => ({
  enabled: readStored(),
  setEnabled: (v) => {
    try {
      if (v) localStorage.setItem(STORAGE_KEY, "1");
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    set({ enabled: v });
  },
  toggle: () => {
    get().setEnabled(!get().enabled);
  },
}));
