import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  ActivityStats,
  AiSettingsDto,
  DailyReportDto,
  EngineFlagsResponse,
  PermissionStatus,
  PipelineHealth,
  RawEvent,
  Snapshot,
  StorageStats,
  WindowSession,
  WriterStats,
} from "../types";

export async function startTracking(): Promise<void> {
  await invoke("start_tracking");
}

export async function stopTracking(): Promise<void> {
  await invoke("stop_tracking");
}

export async function isTracking(): Promise<boolean> {
  return invoke<boolean>("is_tracking");
}

export async function triggerScreenshot(): Promise<void> {
  await invoke("trigger_screenshot");
}

export async function checkPermissions(): Promise<PermissionStatus> {
  return invoke<PermissionStatus>("check_permissions");
}

export async function openAccessibilitySettings(): Promise<void> {
  await invoke("open_accessibility_settings");
}

export async function openScreenRecordingSettings(): Promise<void> {
  await invoke("open_screen_recording_settings");
}

export async function openNotificationSettings(): Promise<void> {
  await invoke("open_notification_settings");
}

export async function getSessions(
  date: string,
  appName?: string | null,
): Promise<WindowSession[]> {
  return invoke<WindowSession[]>("get_sessions", { date, appName });
}

export async function getSessionSnapshots(
  sessionId: string,
): Promise<Snapshot[]> {
  return invoke<Snapshot[]>("get_session_snapshots", { sessionId });
}

export async function getActivityStats(
  date?: string | null,
): Promise<ActivityStats> {
  return invoke<ActivityStats>("get_activity_stats", { date });
}

export async function getStorageStats(): Promise<StorageStats> {
  return invoke<StorageStats>("get_storage_stats");
}

export async function getWriterStats(): Promise<WriterStats> {
  return invoke<WriterStats>("get_writer_stats");
}

export async function getRawEventsRecent(limit: number): Promise<RawEvent[]> {
  return invoke<RawEvent[]>("get_raw_events_recent", { limit });
}

export async function openDataDir(): Promise<void> {
  await invoke("open_data_dir");
}

export async function runRetentionCleanup(): Promise<void> {
  await invoke("run_retention_cleanup");
}

export async function checkpointWal(): Promise<void> {
  await invoke("checkpoint_wal");
}

export async function getPipelineHealth(): Promise<PipelineHealth> {
  return invoke<PipelineHealth>("get_pipeline_health");
}

export async function getEngineFlags(): Promise<EngineFlagsResponse> {
  return invoke<EngineFlagsResponse>("get_engine_flags");
}

export async function setEngineEnabled(name: string, enabled: boolean): Promise<void> {
  await invoke("set_engine_enabled", { name, enabled });
}

export async function setAiEnabled(enabled: boolean): Promise<void> {
  await invoke("set_ai_enabled", { enabled });
}

export async function getAiSettings(): Promise<AiSettingsDto> {
  return invoke<AiSettingsDto>("get_ai_settings");
}

export async function setAiPrivacyAcknowledged(
  acknowledged: boolean,
): Promise<void> {
  await invoke("set_ai_privacy_acknowledged", { acknowledged });
}

export async function setAiSettings(
  baseUrl: string | null,
  model: string | null,
  apiKey: string | null,
): Promise<void> {
  await invoke("set_ai_settings", { baseUrl, model, apiKey });
}

export async function updateSessionIntent(
  sessionId: string,
  intent: string | null,
): Promise<void> {
  await invoke("update_session_intent", {
    sessionId,
    intent: intent === "" || intent === null ? null : intent,
  });
}

export async function getAppBlacklist(): Promise<string[]> {
  return invoke<string[]>("get_app_blacklist");
}

export async function setAppBlacklist(apps: string[]): Promise<void> {
  await invoke("set_app_blacklist", { apps });
}

export async function generateDailyAnalysis(date: string): Promise<string> {
  return invoke<string>("generate_daily_analysis", { date });
}

export async function generateDailyReport(
  date: string,
  withAi: boolean,
): Promise<DailyReportDto> {
  return invoke<DailyReportDto>("generate_daily_report", { date, withAi });
}

export async function getDailyReport(
  date: string,
  reportType?: string | null,
): Promise<DailyReportDto | null> {
  return invoke<DailyReportDto | null>("get_daily_report", {
    date,
    reportType: reportType ?? null,
  });
}

export async function exportDailyReport(
  date: string,
  reportType?: string | null,
): Promise<string> {
  return invoke<string>("export_daily_report", {
    date,
    reportType: reportType ?? null,
  });
}

export type EventPayloads = {
  window_event_updated: WindowSession;
  new_snapshot_saved: { snapshot: Snapshot };
  tracking_state_changed: { isRunning: boolean };
  permissions_required: PermissionStatus;
  afk_state_changed: { isAfk: boolean; idleSeconds: number };
  app_switch_recorded: unknown;
  writer_stats_updated: WriterStats;
};

export function listenEvent<K extends keyof EventPayloads>(
  key: K,
  handler: (payload: EventPayloads[K]) => void,
): Promise<UnlistenFn> {
  return listen<EventPayloads[K]>(key, (e) => {
    handler(e.payload);
  });
}
