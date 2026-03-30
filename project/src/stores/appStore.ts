import { create } from "zustand";
import type {
  ActivityStats,
  PermissionStatus,
  RawEvent,
  Snapshot,
  StorageStats,
  WindowSession,
  WriterStats,
} from "../types";
import * as api from "../services/tauri";

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

interface AppState {
  date: string;
  isTracking: boolean;
  isAfk: boolean;
  permissions: PermissionStatus | null;
  sessions: WindowSession[];
  selectedSessionId: string | null;
  snapshots: Snapshot[];
  selectedSnapshotId: string | null;
  rawEvents: RawEvent[];
  activity: ActivityStats | null;
  storage: StorageStats | null;
  writer: WriterStats | null;
  loadingSessions: boolean;
  error: string | null;
  formatBytes: (n: number) => string;
  setDate: (d: string) => void;
  refreshAll: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  selectSession: (id: string | null) => Promise<void>;
  selectSnapshot: (id: string | null) => void;
  setTracking: (v: boolean) => void;
  setPermissions: (p: PermissionStatus) => void;
  setAfk: (isAfk: boolean) => void;
  setWriterStats: (w: WriterStats) => void;
  clearError: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  date: todayStr(),
  isTracking: false,
  isAfk: false,
  permissions: null,
  sessions: [],
  selectedSessionId: null,
  snapshots: [],
  selectedSnapshotId: null,
  rawEvents: [],
  activity: null,
  storage: null,
  writer: null,
  loadingSessions: false,
  error: null,
  formatBytes,

  setDate: (d) => {
    set({ date: d });
    void get().refreshSessions();
  },

  refreshAll: async () => {
    try {
      const [
        tracking,
        perms,
        storage,
        writer,
        raw,
        activity,
      ] = await Promise.all([
        api.isTracking(),
        api.checkPermissions(),
        api.getStorageStats(),
        api.getWriterStats(),
        api.getRawEventsRecent(80),
        api.getActivityStats(get().date),
      ]);
      set({
        isTracking: tracking,
        permissions: perms,
        storage,
        writer,
        rawEvents: raw,
        activity,
        error: null,
      });
      await get().refreshSessions();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  refreshSessions: async () => {
    set({ loadingSessions: true });
    try {
      const date = get().date;
      const sessions = await api.getSessions(date);
      set({ sessions, loadingSessions: false, error: null });
      const sel = get().selectedSessionId;
      if (sel && !sessions.some((s) => s.id === sel)) {
        set({
          selectedSessionId: null,
          snapshots: [],
          selectedSnapshotId: null,
        });
      } else if (sel) {
        await get().selectSession(sel);
      }
    } catch (e) {
      set({ loadingSessions: false, error: String(e) });
    }
  },

  selectSession: async (id) => {
    set({ selectedSessionId: id, selectedSnapshotId: null });
    if (!id) {
      set({ snapshots: [] });
      return;
    }
    try {
      const snapshots = await api.getSessionSnapshots(id);
      const first = snapshots[0]?.id ?? null;
      set({ snapshots, selectedSnapshotId: first, error: null });
    } catch (e) {
      set({ snapshots: [], error: String(e) });
    }
  },

  selectSnapshot: (id) => set({ selectedSnapshotId: id }),

  setTracking: (v) => set({ isTracking: v }),
  setPermissions: (p) => set({ permissions: p }),
  setAfk: (isAfk) => set({ isAfk }),
  setWriterStats: (w) => set({ writer: w }),
  clearError: () => set({ error: null }),
}));
