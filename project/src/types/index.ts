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
  lastCheckMs: number;
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
function usesCustomProtocolLocalhostWorkaround(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Windows NT|Android/i.test(navigator.userAgent);
}

export function snapshotTimelensUrl(snapshotId: string): string {
  const path = `snapshot/${snapshotId}`;
  if (usesCustomProtocolLocalhostWorkaround()) {
    return `http://timelens.localhost/${path}`;
  }
  return `timelens://localhost/${path}`;
}
