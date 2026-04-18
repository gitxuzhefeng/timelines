import { isElectronShell } from "../services/desktop-bridge";
import { usesCustomProtocolLocalhostWorkaround } from "../lib/platform";

/** 与 Rust `AppIntentAggregateDto` 对齐：按应用名 + Bundle 聚合 */
export interface AppIntentAggregate {
  appName: string;
  bundleId: string | null;
  sessionCount: number;
  resolvedIntent: string | null;
  /** `none` | `builtin` | `user` */
  intentSource: string;
}

export interface WindowSession {
  id: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  appName: string;
  bundleId: string | null;
  windowTitle: string;
  extractedUrl: string | null;
  extractedFilePath: string | null;
  intent: string | null;
  rawEventCount: number;
  isActive: boolean;
}

export interface Snapshot {
  id: string;
  sessionId: string;
  filePath: string;
  capturedAtMs: number;
  fileSizeBytes: number;
  triggerType: string;
  resolution: string | null;
  format: string;
  perceptualHash: string | null;
}

export interface RawEvent {
  id: string;
  timestampMs: number;
  appName: string;
  bundleId: string | null;
  windowTitle: string;
  extractedUrl: string | null;
  extractedFilePath: string | null;
  idleSeconds: number;
  isFullscreen: boolean;
  isAudioPlaying: boolean;
  stateHash: number;
  triggerType: string;
  createdAt: number;
}

export interface PermissionStatus {
  accessibilityGranted: boolean;
  screenRecordingGranted: boolean;
  /** 系统通知监听相关权限（与 `get_pipeline_health.notifications` 降级语义对齐） */
  notificationListenerGranted: boolean;
}

/** 与 Rust `EngineStatus` 对齐 */
export interface EngineStatus {
  status: "running" | "degraded" | "stopped" | string;
  lastDataMs: number | null;
  errorCount: number;
}

/** 与 Rust `PipelineHealth` 对齐 */
export interface PipelineHealth {
  tracker: EngineStatus;
  capture: EngineStatus;
  inputDynamics: EngineStatus;
  clipboard: EngineStatus;
  notifications: EngineStatus;
  ambientContext: EngineStatus;
  ocr: EngineStatus;
  lastCheckMs: number;
}

/** 与 Rust `OcrPipelineConfig` 对齐（本地 Tesseract 管线） */
export interface OcrPipelineConfig {
  languages: string;
  psm: number;
  wordConfMin: number;
  lineConfMin: number;
  preprocessScale: boolean;
  preprocessDarkInvert: boolean;
}

export interface OcrSettingsDto {
  privacyAcknowledged: boolean;
  enabled: boolean;
  allowExportToAi: boolean;
  showSessionSummary: boolean;
  pipeline: OcrPipelineConfig;
}

/** 评估页列表行 */
export interface OcrEvalSampleRow {
  snapshotId: string;
  sessionId: string;
  capturedAtMs: number;
  appName: string;
  windowTitle: string;
  filePath: string;
  ocrStatus: string | null;
  ocrTextPreview: string | null;
  ocrMeta: string | null;
}

/** 单帧重新识别结果（不落库） */
export interface OcrEvaluateSnapshotResult {
  snapshotId: string;
  ok: boolean;
  errorMessage: string | null;
  durationMs: number;
  pipeline: OcrPipelineConfig;
  finalText: string;
  summaryLine: string | null;
  gatedPreview: string;
  lines: OcrEvalLine[];
  ocrMeta: string | null;
}

export interface OcrEvalLine {
  text: string;
  avgConf: number;
  kept: boolean;
  dropReason?: string | null;
}

export interface OcrStatusDto {
  enabled: boolean;
  lastSuccessMs: number | null;
  pendingJobs: number;
  lastError: string | null;
}

export interface SessionOcrContextDto {
  summaryLine: string | null;
  summarySource: string | null;
  emptyReason: string | null;
}

export interface OcrSearchHit {
  snapshotId: string;
  sessionId: string;
  capturedAtMs: number;
  /** FTS 片段，« » 标出匹配部分 */
  matchedSnippet: string;
  fullOcrText: string | null;
  matchedKeywords: string[];
  appName: string;
  windowTitle: string;
  sessionIntent: string | null;
}

export interface ActivityStats {
  date: string;
  sessionCount: number;
  snapshotCount: number;
  switchCount: number;
  rawEventCount: number;
}

export interface StorageStats {
  dbSizeBytes: number;
  shotsSizeBytes: number;
  rawEventCount: number;
  sessionCount: number;
  snapshotCount: number;
}

export interface WriterStats {
  totalBatches: number;
  totalEvents: number;
  avgBatchSize: number;
  avgLatencyMs: number;
  lastBatchEvents: number;
  lastBatchMs: number;
  channelPendingEstimate: number;
}

export interface EngineFlagsResponse {
  engineInput: boolean;
  engineClipboard: boolean;
  engineNotifications: boolean;
  engineAmbient: boolean;
  aiEnabled: boolean;
}

export interface DailyReportDto {
  id: string;
  reportDate: string;
  reportType: string;
  contentMd: string;
  generatedAtMs: number;
  aiModel: string | null;
  aiPromptHash: string | null;
}

/** 与 Rust `DailyAnalysisDto`（serde camelCase）对齐 */
export interface DailyAnalysisDto {
  id: string;
  analysisDate: string;
  generatedAtMs: number;
  version: number;
  totalActiveMs: number;
  intentBreakdown: string;
  topApps: string;
  totalSwitches: number;
  switchesPerHour: string;
  topSwitchPairs: string;
  deepWorkSegments: string;
  deepWorkTotalMs: number;
  fragmentationPct: number;
  notificationCount: number;
  topInterrupters: string;
  interruptsInDeep: number;
  avgKpm: number | null;
  kpmByHour: string;
  avgDeleteRatio: number | null;
  flowScoreAvg: number | null;
  struggleScoreAvg: number | null;
  clipboardPairs: number | null;
  topFlows: string | null;
  sceneBreakdown: string | null;
  degradedSections: string;
}

export interface DailyAnalysisTopAppRow {
  app: string;
  duration_ms: number;
}

export interface DailyAnalysisDeepSegment {
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  intent: string;
}

export interface DailyAnalysisClipboardFlow {
  from: string;
  to: string;
  count: number;
}

export interface AiSettingsDto {
  privacyAcknowledged: boolean;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
}

/**
 * 截图预览 URL（对应 Rust `register_uri_scheme_protocol("timelens", …)`）。
 *
 * WebView2（Windows）与 Android WebView 对非标准 URL Scheme 有限制：子资源请求（如 `<img src>`）
 * 不会走 `timelens://…`，必须使用 wry 的 workaround URL `http://{scheme}.localhost/…`，
 * 由运行时拦截并还原为 `timelens://localhost/…` 再交给自定义协议处理器。
 * @see https://github.com/tauri-apps/wry/blob/dev/src/custom_protocol_workaround.rs
 */
export function snapshotTimelensUrl(snapshotId: string): string {
  if (
    typeof window !== "undefined" &&
    isElectronShell() &&
    window.timelensDesktop?.snapshotUrl
  ) {
    return window.timelensDesktop.snapshotUrl(snapshotId);
  }
  const path = `snapshot/${snapshotId}`;
  if (usesCustomProtocolLocalhostWorkaround()) {
    return `http://timelens.localhost/${path}`;
  }
  return `timelens://localhost/${path}`;
}
