export interface WindowEvent {
  id: string;
  timestamp_ms: number;
  app_name: string;
  window_title: string;
  duration_ms: number;
  snapshot_urls?: string[];
  intent?: string;
}

export interface WindowTitleStat {
  window_title: string;
  total_duration_ms: number;
  session_count: number;
  intent?: string;
}

export interface SnapshotInfo {
  url: string;
  captured_at_ms: number;
  file_size_bytes: number;
}

export interface DailyStats {
  date: string;
  categories_json: string;
  insights_json: string;
  productivity_score: number;
}

export interface AppSettings {
  claude_api_key?: string;
  deepseek_api_key?: string;
  qwen_api_key?: string;
  ai_provider?: string;
  feishu_webhook_url?: string;
  language?: string;
  report_dir?: string;
  tracking_enabled?: string;
  daily_report_time?: string;
}

export interface CategoryData {
  name: string;
  minutes: number;
  color: string;
}

export interface TimelineEntry {
  id: string;
  startTime: number;
  endTime: number;
  appName: string;
  windowTitle: string;
  durationMs: number;
  category?: string;
}
