import { create } from "zustand";
import type {
  ActivityStats,
  PermissionStatus,
  PipelineHealth,
  RawEvent,
  Snapshot,
  StorageStats,
  WindowSession,
  WriterStats,
} from "../types";
import type { AppSwitch, UpdateCheckResult } from "../services/tauri";
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
  pipelineHealth: PipelineHealth | null;
  loadingSessions: boolean;
  error: string | null;
  updateAvailable: boolean;
  latestVersion: string | null;
  updateCheckResult: UpdateCheckResult | null;
  updateDismissed: boolean;
  fragmentationAlert: {
    switchCount: number;
    windowMin: number;
    switches: AppSwitch[];
  } | null;
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
  setFragmentationAlert: (alert: AppState["fragmentationAlert"]) => void;
  setUpdateCheckResult: (r: UpdateCheckResult) => void;
  dismissUpdate: () => void;
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
  pipelineHealth: null,
  loadingSessions: false,
  error: null,
  updateAvailable: false,
  latestVersion: null,
  updateCheckResult: null,
  updateDismissed: false,
  fragmentationAlert: null,
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
        health,
      ] = await Promise.all([
        api.isTracking(),
        api.checkPermissions(),
        api.getStorageStats(),
        api.getWriterStats(),
        api.getRawEventsRecent(80),
        api.getActivityStats(get().date),
        api.getPipelineHealth(),
      ]);
      set({
        isTracking: tracking,
        permissions: perms,
        storage,
        writer,
        rawEvents: raw,
        activity,
        pipelineHealth: health,
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
  setFragmentationAlert: (alert) => set({ fragmentationAlert: alert }),
  setUpdateCheckResult: (r) => {
    const dismissed = localStorage.getItem("timelens_dismissed_version") === r.latestVersion;
    set({
      updateCheckResult: r,
      updateAvailable: r.hasUpdate,
      latestVersion: r.latestVersion,
      updateDismissed: dismissed,
    });
  },
  dismissUpdate: () => {
    const ver = get().updateCheckResult?.latestVersion;
    if (ver) localStorage.setItem("timelens_dismissed_version", ver);
    set({ updateDismissed: true });
  },
  clearError: () => set({ error: null }),
}));
