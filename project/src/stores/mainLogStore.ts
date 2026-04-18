import { create } from "zustand";

const MAX = 500;

interface MainLogState {
  lines: string[];
  pushLine: (line: string) => void;
  clear: () => void;
}

export const useMainLogStore = create<MainLogState>((set) => ({
  lines: [],
  pushLine: (line) =>
    set((s) => ({
      lines: [...s.lines.slice(-(MAX - 1)), line],
    })),
  clear: () => set({ lines: [] }),
}));
