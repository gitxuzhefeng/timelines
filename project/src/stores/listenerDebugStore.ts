import { create } from "zustand";

const STORAGE_KEY = "timelens_listener_debug_flags_v1";

export type ListenerDebugFlags = {
  windowEventUpdated: boolean;
  newSnapshotSaved: boolean;
  appSwitchRecorded: boolean;
  writerStatsUpdated: boolean;
  permissionsRequired: boolean;
  afkStateChanged: boolean;
  trackingStateChanged: boolean;
};

const DEFAULT_FLAGS: ListenerDebugFlags = {
  windowEventUpdated: true,
  newSnapshotSaved: true,
  appSwitchRecorded: true,
  writerStatsUpdated: true,
  permissionsRequired: true,
  afkStateChanged: true,
  trackingStateChanged: true,
};

function readStored(): ListenerDebugFlags {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_FLAGS;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FLAGS;
    const parsed = JSON.parse(raw) as Partial<ListenerDebugFlags>;
    return {
      ...DEFAULT_FLAGS,
      ...parsed,
    };
  } catch {
    return DEFAULT_FLAGS;
  }
}

function writeStored(flags: ListenerDebugFlags): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
  } catch {
    // ignore
  }
}

interface ListenerDebugStore {
  flags: ListenerDebugFlags;
  setFlag: <K extends keyof ListenerDebugFlags>(key: K, value: ListenerDebugFlags[K]) => void;
  setAll: (value: boolean) => void;
  reset: () => void;
}

export const useListenerDebugStore = create<ListenerDebugStore>((set, get) => ({
  flags: readStored(),
  setFlag: (key, value) => {
    const next = { ...get().flags, [key]: value };
    writeStored(next);
    set({ flags: next });
  },
  setAll: (value) => {
    const next: ListenerDebugFlags = {
      windowEventUpdated: value,
      newSnapshotSaved: value,
      appSwitchRecorded: value,
      writerStatsUpdated: value,
      permissionsRequired: value,
      afkStateChanged: value,
      trackingStateChanged: value,
    };
    writeStored(next);
    set({ flags: next });
  },
  reset: () => {
    writeStored(DEFAULT_FLAGS);
    set({ flags: DEFAULT_FLAGS });
  },
}));
