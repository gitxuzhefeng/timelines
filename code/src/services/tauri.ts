import { invoke } from "@tauri-apps/api/core";
import type { WindowEvent } from "../types";

export const tauriService = {
  async startTracking(): Promise<void> {
    return invoke("start_tracking");
  },

  async stopTracking(): Promise<void> {
    return invoke("stop_tracking");
  },

  async isTracking(): Promise<boolean> {
    return invoke("is_tracking");
  },

  async getTodayEvents(): Promise<WindowEvent[]> {
    return invoke("get_today_events");
  },

  async getSettings(): Promise<Record<string, string>> {
    return invoke("get_settings");
  },

  async setSetting(key: string, value: string): Promise<void> {
    return invoke("set_settings", { key, value });
  },

  async openDataDirectory(): Promise<void> {
    return invoke("open_data_directory");
  },

  async checkPermissions(): Promise<{ accessibility: boolean; screenRecording: boolean }> {
    return invoke("check_permissions");
  },

  async restartTracking(): Promise<boolean> {
    return invoke("restart_tracking");
  },
};
