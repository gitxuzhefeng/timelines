import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  ActivityStats,
  AiSettingsDto,
  DailyAnalysisDto,
  DailyReportDto,
  EngineFlagsResponse,
  AppIntentAggregate,
  OcrEvalSampleRow,
  OcrEvaluateSnapshotResult,
  OcrSearchHit,
  OcrSettingsDto,
  OcrStatusDto,
  PermissionStatus,
  PipelineHealth,
  RawEvent,
  SessionOcrContextDto,
  Snapshot,
  StorageStats,
  TestAiConnectionResponse,
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

export async function requestScreenCaptureAccess(): Promise<boolean> {
  return invoke<boolean>("request_screen_capture_access");
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

export async function getOcrSettings(): Promise<OcrSettingsDto> {
  return invoke<OcrSettingsDto>("get_ocr_settings");
}

export async function setOcrPrivacyAcknowledged(
  acknowledged: boolean,
): Promise<void> {
  await invoke("set_ocr_privacy_acknowledged", { acknowledged });
}

export async function setOcrSettings(params: {
  enabled?: boolean | null;
  allowExportToAi?: boolean | null;
  showSessionSummary?: boolean | null;
  ocrLanguages?: string | null;
  ocrPsm?: number | null;
  ocrWordConfMin?: number | null;
  ocrLineConfMin?: number | null;
  ocrPreprocessScale?: boolean | null;
  ocrPreprocessDarkInvert?: boolean | null;
}): Promise<OcrSettingsDto> {
  return invoke<OcrSettingsDto>("set_ocr_settings", {
    enabled: params.enabled ?? null,
    allowExportToAi: params.allowExportToAi ?? null,
    showSessionSummary: params.showSessionSummary ?? null,
    ocrLanguages: params.ocrLanguages ?? null,
    ocrPsm: params.ocrPsm ?? null,
    ocrWordConfMin: params.ocrWordConfMin ?? null,
    ocrLineConfMin: params.ocrLineConfMin ?? null,
    ocrPreprocessScale: params.ocrPreprocessScale ?? null,
    ocrPreprocessDarkInvert: params.ocrPreprocessDarkInvert ?? null,
  });
}

export async function getOcrStatus(): Promise<OcrStatusDto> {
  return invoke<OcrStatusDto>("get_ocr_status");
}

export async function getSessionOcrContext(
  sessionId: string,
): Promise<SessionOcrContextDto> {
  return invoke<SessionOcrContextDto>("get_session_ocr_context", {
    sessionId,
  });
}

export async function searchOcrText(
  query: string,
  date?: string | null,
  restrictSessionId?: string | null,
): Promise<OcrSearchHit[]> {
  return invoke<OcrSearchHit[]>("search_ocr_text", {
    query,
    date: date ?? null,
    restrictSessionId: restrictSessionId ?? null,
  });
}

export async function listOcrEvalSamples(
  limit?: number | null,
): Promise<OcrEvalSampleRow[]> {
  return invoke<OcrEvalSampleRow[]>("list_ocr_eval_samples", {
    limit: limit ?? null,
  });
}

export async function evaluateOcrSnapshot(
  snapshotId: string,
): Promise<OcrEvaluateSnapshotResult> {
  return invoke<OcrEvaluateSnapshotResult>("evaluate_ocr_snapshot", {
    snapshotId,
  });
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

export async function testAiConnection(
  baseUrl: string,
  model: string,
  apiKey: string,
): Promise<TestAiConnectionResponse> {
  return invoke<TestAiConnectionResponse>("test_ai_connection", { baseUrl, model, apiKey });
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

export async function listAppIntentAggregates(): Promise<AppIntentAggregate[]> {
  return invoke<AppIntentAggregate[]>("list_app_intent_aggregates");
}

/** 返回受影响的 window_sessions 行数 */
export async function setIntentForAppAggregate(
  appName: string,
  bundleId: string | null,
  intent: string | null,
): Promise<number> {
  return invoke<number>("set_intent_for_app_aggregate", {
    appName,
    bundleId,
    intent: intent === "" || intent === null ? null : intent,
  });
}

export interface AppIntentBatchItem {
  appName: string;
  bundleId: string | null;
  intent: string | null;
}

/** 批量设置；返回累计更新的会话行数 */
export async function setIntentForAppAggregatesBatch(
  items: AppIntentBatchItem[],
): Promise<number> {
  return invoke<number>("set_intent_for_app_aggregates_batch", { items });
}

/** 为尚无 Intent 的历史会话按当前规则（含内置词表）写入分组 */
export async function backfillSessionIntentsFromMappings(): Promise<number> {
  return invoke<number>("backfill_session_intents_from_mappings");
}

export async function getAppBlacklist(): Promise<string[]> {
  return invoke<string[]>("get_app_blacklist");
}

export async function setAppBlacklist(apps: string[]): Promise<void> {
  await invoke("set_app_blacklist", { apps });
}

export async function getLanguage(): Promise<string> {
  return invoke<string>("get_language");
}

export async function setLanguage(lang: string): Promise<void> {
  await invoke("set_language", { lang });
}

export async function getAppVersion(): Promise<string> {
  return invoke<string>("get_app_version");
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes: string;
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  return invoke<UpdateCheckResult>("check_for_update");
}

export async function openUrl(url: string): Promise<void> {
  await invoke("open_url", { url });
}

export async function generateDailyAnalysis(date: string): Promise<string> {
  return invoke<string>("generate_daily_analysis", { date });
}

export async function getDailyAnalysis(
  date: string,
): Promise<DailyAnalysisDto | null> {
  return invoke<DailyAnalysisDto | null>("get_daily_analysis", { date });
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

// ── Phase 8: Weekly Report ────────────────────────────────────────────────────

export interface WeeklyAnalysisDto {
  id: string;
  weekStart: string;
  weekEnd: string;
  validDays: number;
  totalTrackedSeconds: number;
  avgFlowScore: number | null;
  dailyFlowScores: string | null;
  hourlyHeatmap: string | null;
  topAppsByDay: string | null;
  weeklyTopApps: string | null;
  avgDeepWorkMinutes: number | null;
  avgFragmentationPct: number | null;
  peakFocusDay: string | null;
  peakFocusHourRange: string | null;
  generatedAt: string;
  isStale: number;
}

export interface WeeklyReportDto {
  id: string;
  weekStart: string;
  reportType: string;
  contentMd: string;
  lang: string;
  createdAt: string;
}

export async function getWeekStartForDate(date: string): Promise<string> {
  return invoke<string>("get_week_start_for_date", { date });
}

export async function getWeekStartDay(): Promise<number> {
  return invoke<number>("get_week_start_day");
}

export async function setWeekStartDay(day: number): Promise<void> {
  await invoke("set_week_start_day", { day });
}

export async function generateWeeklyAnalysis(weekStart: string): Promise<string> {
  return invoke<string>("generate_weekly_analysis", { weekStart });
}

export async function getWeeklyAnalysis(weekStart: string): Promise<WeeklyAnalysisDto | null> {
  return invoke<WeeklyAnalysisDto | null>("get_weekly_analysis", { weekStart });
}

export async function generateWeeklyReport(
  weekStart: string,
  withAi: boolean,
  lang: string,
): Promise<WeeklyReportDto> {
  return invoke<WeeklyReportDto>("generate_weekly_report", { weekStart, withAi, lang });
}

export async function getWeeklyReport(
  weekStart: string,
  reportType?: string | null,
): Promise<WeeklyReportDto | null> {
  return invoke<WeeklyReportDto | null>("get_weekly_report", {
    weekStart,
    reportType: reportType ?? null,
  });
}

// ── Phase 9: Data Export ──────────────────────────────────────────────────────

export async function exportSessionsCsv(date: string): Promise<string> {
  return invoke<string>("export_sessions_csv", { date });
}

export async function exportDailyJson(date: string): Promise<string> {
  return invoke<string>("export_daily_json", { date });
}

export async function exportDailyMarkdown(
  date: string,
  reportType?: string | null,
): Promise<string> {
  return invoke<string>("export_daily_markdown", {
    date,
    reportType: reportType ?? null,
  });
}

export async function exportDailyHtml(date: string): Promise<string> {
  return invoke<string>("export_daily_html", { date });
}

export async function exportWeeklyMarkdown(weekStart: string): Promise<string> {
  return invoke<string>("export_weekly_markdown", { weekStart });
}

export type EventPayloads = {
  window_event_updated: WindowSession;
  new_snapshot_saved: { snapshot: Snapshot };
  tracking_state_changed: { isRunning: boolean };
  permissions_required: PermissionStatus;
  afk_state_changed: { isAfk: boolean; idleSeconds: number };
  app_switch_recorded: unknown;
  writer_stats_updated: WriterStats;
  nudge_rest: { elapsedMin: number; title: string; body: string };
  nudge_fragmentation: { switchCount: number; windowMin: number };
  nudge_deep_work: { app: string | null; elapsedMin: number; dnd: boolean };
  nudge_daily_digest: { date: string; title: string; body: string; summary: unknown };
};

export function listenEvent<K extends keyof EventPayloads>(
  key: K,
  handler: (payload: EventPayloads[K]) => void,
): Promise<UnlistenFn> {
  return listen<EventPayloads[K]>(key, (e) => {
    handler(e.payload);
  });
}

// ── Phase 10: AI Assistant ──────────────────────────────────────────────────

export interface AssistantMessageDto {
  id: string;
  role: string;
  content: string;
  createdAt: number;
}

export interface BriefingDto {
  date: string;
  hasData: boolean;
  flowScore: number | null;
  deepWorkMinutes: number | null;
  fragmentationPct: number | null;
  totalActiveMinutes: number | null;
  topApp: string | null;
  topIntent: string | null;
  highlightKey: string | null;
  highlightParams: Record<string, unknown> | null;
  suggestedQuestions: string[];
}

export interface WeeklyBriefingDto {
  weekStart: string;
  weekEnd: string;
  hasData: boolean;
  validDays: number;
  avgFlowScore: number | null;
  avgDeepWorkMinutes: number | null;
  avgFragmentationPct: number | null;
  peakFocusDay: string | null;
  peakFocusHourRange: string | null;
  topApp: string | null;
  highlightKey: string | null;
  highlightParams: Record<string, unknown> | null;
  suggestedQuestions: string[];
}

export interface AssistantContextExtDto {
  contextType: string;
  dateRange: string;
  dataSources: string[];
  privacyScope: string[];
  payload: Record<string, unknown>;
}

export interface AssistantContextExtParams {
  date: string;
  contextType: string;
  weekStart?: string | null;
  segmentStartMs?: number | null;
  segmentEndMs?: number | null;
}

export interface QueryAssistantV2Params extends AssistantContextExtParams {
  question: string;
}

export async function getAssistantHistory(limit?: number | null): Promise<AssistantMessageDto[]> {
  return invoke<AssistantMessageDto[]>("get_assistant_history", { limit: limit ?? null });
}

export async function clearAssistantHistory(): Promise<void> {
  await invoke("clear_assistant_history");
}

export async function getTodayBriefing(date: string): Promise<BriefingDto> {
  return invoke<BriefingDto>("get_today_briefing", { date });
}

export async function getWeeklyBriefing(weekStart: string): Promise<WeeklyBriefingDto> {
  return invoke<WeeklyBriefingDto>("get_weekly_briefing", { weekStart });
}

export async function getAssistantContext(date: string): Promise<Record<string, unknown> | null> {
  return invoke<Record<string, unknown> | null>("get_assistant_context", { date });
}

export async function getAssistantContextExtended(
  params: AssistantContextExtParams,
): Promise<AssistantContextExtDto | null> {
  return invoke<AssistantContextExtDto | null>("get_assistant_context_extended", {
    date: params.date,
    contextType: params.contextType,
    weekStart: params.weekStart ?? null,
    segmentStartMs: params.segmentStartMs ?? null,
    segmentEndMs: params.segmentEndMs ?? null,
  });
}

export async function queryAssistant(
  question: string,
  contextDate?: string | null,
): Promise<AssistantMessageDto> {
  return invoke<AssistantMessageDto>("query_assistant", {
    question,
    contextDate: contextDate ?? null,
  });
}

export async function queryAssistantV2(
  params: QueryAssistantV2Params,
): Promise<AssistantMessageDto> {
  return invoke<AssistantMessageDto>("query_assistant_v2", {
    question: params.question,
    contextType: params.contextType,
    date: params.date,
    weekStart: params.weekStart ?? null,
    segmentStartMs: params.segmentStartMs ?? null,
    segmentEndMs: params.segmentEndMs ?? null,
  });
}

// ── Phase 10: Autostart ─────────────────────────────────────────────────────

export interface AutostartDto {
  enabled: boolean;
}

export async function getAutostartEnabled(): Promise<AutostartDto> {
  return invoke<AutostartDto>("get_autostart_enabled");
}

export async function setAutostartEnabled(enabled: boolean): Promise<AutostartDto> {
  return invoke<AutostartDto>("set_autostart_enabled", { enabled });
}

// ── Phase 11: Smart Nudge ───────────────────────────────────────────────────

export interface NudgeConfig {
  enabled: boolean;
  restMinutes: number;
  fragThreshold: number;
  fragWindowMin: number;
  deepWorkMinutes: number;
  deepWorkDnd: boolean;
}

export interface DigestConfig {
  enabled: boolean;
  time: string;
}

export async function getNudgeSettings(): Promise<NudgeConfig> {
  return invoke<NudgeConfig>("get_nudge_settings");
}

export async function setNudgeSettings(config: NudgeConfig): Promise<NudgeConfig> {
  return invoke<NudgeConfig>("set_nudge_settings", { config });
}

export async function getDigestSettings(): Promise<DigestConfig> {
  return invoke<DigestConfig>("get_digest_settings");
}

export async function setDigestSettings(config: DigestConfig): Promise<DigestConfig> {
  return invoke<DigestConfig>("set_digest_settings", { config });
}

// ── Phase 11+: Fragmentation detail ───────────────────────────────────────

export interface AppSwitch {
  id: string;
  timestampMs: number;
  fromApp: string;
  fromBundleId: string | null;
  fromWindowTitle: string | null;
  toApp: string;
  toBundleId: string | null;
  toWindowTitle: string | null;
  fromSessionDurationMs: number;
  switchType: string;
}

export async function getRecentAppSwitches(minutes: number): Promise<AppSwitch[]> {
  return invoke<AppSwitch[]>("get_recent_app_switches", { minutes });
}

// ── Phase 13: Custom Intent Groups + Smart Match ──────────────────────────

export interface CustomIntent {
  id: number;
  name: string;
  color: string | null;
  sortOrder: number;
  createdAt: number;
}

export async function listCustomIntents(): Promise<CustomIntent[]> {
  return invoke<CustomIntent[]>("list_custom_intents");
}

export async function createCustomIntent(name: string, color?: string): Promise<CustomIntent> {
  return invoke<CustomIntent>("create_custom_intent", { name, color: color ?? null });
}

export async function updateCustomIntent(id: number, name?: string, color?: string): Promise<CustomIntent> {
  return invoke<CustomIntent>("update_custom_intent", { id, name: name ?? null, color: color ?? null });
}

export async function deleteCustomIntent(id: number): Promise<void> {
  return invoke<void>("delete_custom_intent", { id });
}

export interface AutoMatchResult {
  appName: string;
  bundleId: string | null;
  suggestedIntent: string | null;
  confidence: string;
}

export async function autoMatchIntents(): Promise<AutoMatchResult[]> {
  return invoke<AutoMatchResult[]>("auto_match_intents");
}

export async function applyAutoMatch(matches: { appName: string; bundleId: string | null; intent: string }[]): Promise<number> {
  return invoke<number>("apply_auto_match", { matches });
}
