use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionStatus {
    pub accessibility_granted: bool,
    pub screen_recording_granted: bool,
    /// 系统通知监听相关权限（Windows：通知读取；macOS：本应用 UserNotifications 非「拒绝」）。
    pub notification_listener_granted: bool,
}

/// 单引擎健康状态（`get_pipeline_health`），与二期架构文档对齐。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    /// `running` | `degraded` | `stopped`
    pub status: String,
    pub last_data_ms: Option<i64>,
    pub error_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineHealth {
    pub tracker: EngineStatus,
    pub capture: EngineStatus,
    pub input_dynamics: EngineStatus,
    pub clipboard: EngineStatus,
    pub notifications: EngineStatus,
    pub ambient_context: EngineStatus,
    pub ocr: EngineStatus,
    pub last_check_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowSession {
    pub id: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub duration_ms: i64,
    pub app_name: String,
    pub bundle_id: Option<String>,
    pub window_title: String,
    pub extracted_url: Option<String>,
    pub extracted_file_path: Option<String>,
    pub intent: Option<String>,
    pub raw_event_count: i64,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub id: String,
    pub session_id: String,
    pub file_path: String,
    pub captured_at_ms: i64,
    pub file_size_bytes: i64,
    pub trigger_type: String,
    pub resolution: Option<String>,
    pub format: String,
    pub perceptual_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotPayload {
    pub snapshot: Snapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppMeta {
    pub app_name: String,
    pub bundle_id: Option<String>,
    pub icon_base64: Option<String>,
    pub category: Option<String>,
    pub first_seen_ms: Option<i64>,
    pub last_seen_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSwitch {
    pub id: String,
    pub timestamp_ms: i64,
    pub from_app: String,
    pub from_bundle_id: Option<String>,
    pub from_window_title: Option<String>,
    pub to_app: String,
    pub to_bundle_id: Option<String>,
    pub to_window_title: Option<String>,
    pub from_session_duration_ms: i64,
    pub switch_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawEvent {
    pub id: String,
    pub timestamp_ms: i64,
    pub app_name: String,
    pub bundle_id: Option<String>,
    pub window_title: String,
    pub extracted_url: Option<String>,
    pub extracted_file_path: Option<String>,
    pub idle_seconds: f64,
    pub is_fullscreen: bool,
    pub is_audio_playing: bool,
    pub state_hash: i64,
    pub trigger_type: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityStats {
    pub date: String,
    pub session_count: i64,
    pub snapshot_count: i64,
    pub switch_count: i64,
    pub raw_event_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStats {
    pub db_size_bytes: u64,
    pub shots_size_bytes: u64,
    pub raw_event_count: i64,
    pub session_count: i64,
    pub snapshot_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriterStats {
    pub total_batches: u64,
    pub total_events: u64,
    pub avg_batch_size: f64,
    pub avg_latency_ms: f64,
    pub last_batch_events: u32,
    pub last_batch_ms: u64,
    pub channel_pending_estimate: u32,
}

#[derive(Debug, Clone)]
pub struct RawEventRow {
    pub id: String,
    pub timestamp_ms: i64,
    pub app_name: String,
    pub bundle_id: Option<String>,
    pub window_title: String,
    pub extracted_url: Option<String>,
    pub extracted_file_path: Option<String>,
    pub idle_seconds: f64,
    pub is_fullscreen: i64,
    pub is_audio_playing: i64,
    pub state_hash: i64,
    pub trigger_type: String,
    pub created_at: i64,
}

#[derive(Debug, Clone)]
pub struct AppSwitchRow {
    pub id: String,
    pub timestamp_ms: i64,
    pub from_app: String,
    pub from_bundle_id: Option<String>,
    pub from_window_title: Option<String>,
    pub to_app: String,
    pub to_bundle_id: Option<String>,
    pub to_window_title: Option<String>,
    pub from_session_duration_ms: i64,
    pub switch_type: String,
}

#[derive(Debug, Clone)]
pub struct SnapshotRow {
    pub id: String,
    pub session_id: String,
    pub file_path: String,
    pub captured_at_ms: i64,
    pub file_size_bytes: i64,
    pub trigger_type: String,
    pub resolution: Option<String>,
    pub format: String,
    pub perceptual_hash: Option<String>,
}

/// 单帧 OCR 结果写入 `snapshot_ocr` + 可选 FTS + `session_ocr_context`。
#[derive(Debug, Clone)]
pub struct SnapshotOcrRow {
    pub snapshot_id: String,
    pub session_id: String,
    pub captured_at_ms: i64,
    pub ocr_text: Option<String>,
    /// 可选 JSON：引擎、闸门统计、行级摘要等（见 OCR 专题方案）。
    pub ocr_meta: Option<String>,
    /// 进入 FTS 的文本（与 `ocr_text` 一致或为空表示不索引）。
    pub fts_body: Option<String>,
    pub redacted: i64,
    pub status: String,
    pub error_hint: Option<String>,
    pub processed_at_ms: i64,
    pub update_session_context: bool,
    pub session_summary_line: Option<String>,
    pub session_summary_source: Option<String>,
    pub session_empty_reason: Option<String>,
}

#[derive(Debug, Clone)]
pub enum SessionUpdateOp {
    Insert {
        id: String,
        start_ms: i64,
        end_ms: i64,
        duration_ms: i64,
        app_name: String,
        bundle_id: Option<String>,
        window_title: String,
        extracted_url: Option<String>,
        extracted_file_path: Option<String>,
        intent: Option<String>,
        raw_event_count: i64,
        is_active: i64,
    },
    Close {
        id: String,
        end_ms: i64,
        duration_ms: i64,
    },
    DeactivateAll,
    BumpRawCount {
        id: String,
        end_ms: i64,
        duration_ms: i64,
        delta: i64,
    },
}

#[derive(Debug, Clone)]
pub struct InputMetricRow {
    pub id: String,
    pub timestamp_ms: i64,
    pub session_id: Option<String>,
    pub window_interval_secs: f64,
    pub keystrokes_count: i64,
    pub kpm: f64,
    pub delete_count: i64,
    pub delete_ratio: f64,
    pub shortcut_count: i64,
    pub copy_count: i64,
    pub paste_count: i64,
    pub undo_count: i64,
    pub mouse_click_count: i64,
    pub mouse_distance_px: f64,
    pub scroll_delta_total: f64,
    pub scroll_direction_changes: i64,
    pub typing_burst_count: i64,
    pub longest_pause_ms: i64,
}

#[derive(Debug, Clone)]
pub struct ClipboardFlowRow {
    pub id: String,
    pub timestamp_ms: i64,
    pub action: String,
    pub app_name: String,
    pub bundle_id: Option<String>,
    pub content_type: Option<String>,
    pub content_length: i64,
    pub flow_pair_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct NotificationRow {
    pub id: String,
    pub timestamp_ms: i64,
    pub source_app: String,
    pub source_bundle_id: Option<String>,
    pub current_foreground_app: Option<String>,
    pub user_responded: i64,
    pub response_delay_ms: Option<i64>,
    pub caused_switch: i64,
}

#[derive(Debug, Clone)]
pub struct AmbientContextRow {
    pub id: String,
    pub timestamp_ms: i64,
    pub wifi_ssid: Option<String>,
    pub display_count: i64,
    pub is_external_display: i64,
    pub battery_level: Option<f64>,
    pub is_charging: Option<i64>,
    pub is_camera_active: i64,
    pub is_audio_input_active: i64,
    pub is_dnd_enabled: i64,
    pub screen_brightness: Option<f64>,
    pub active_space_index: Option<i64>,
}

/// Phase 11: 专注会话表行。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusSessionRow {
    pub id: String,
    pub start_ms: i64,
    pub end_ms: Option<i64>,
    pub planned_duration_min: i64,
    pub actual_duration_ms: Option<i64>,
    pub status: String,
    pub summary_json: Option<String>,
    pub created_at: i64,
}

/// Phase 11: 提醒日志行。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NudgeLogRow {
    pub id: String,
    pub timestamp_ms: i64,
    pub nudge_type: String,
    pub payload_json: Option<String>,
    pub dismissed: i64,
}

#[derive(Debug, Clone)]
pub enum WriteEvent {
    RawEvent(RawEventRow),
    AppSwitch(AppSwitchRow),
    Snapshot(SnapshotRow),
    SnapshotOcr(SnapshotOcrRow),
    SessionUpdate(SessionUpdateOp),
    InputMetric(InputMetricRow),
    ClipboardFlow(ClipboardFlowRow),
    Notification(NotificationRow),
    AmbientContext(AmbientContextRow),
    /// Phase 11: 专注会话写入/更新（id 已存在则 UPSERT）。
    FocusSession(FocusSessionRow),
    /// Phase 11: 提醒触发日志。
    NudgeLog(NudgeLogRow),
    /// Delete old raw rows; clear snapshot file paths after deleting files on disk.
    Retention {
        raw_cutoff_ms: i64,
        snapshot_cutoff_ms: i64,
    },
    WalCheckpoint,
    Shutdown,
}

#[derive(Debug, Clone)]
pub struct CaptureSignal {
    pub priority: CapturePriority,
    pub session_id: Option<String>,
    pub trigger_type: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CapturePriority {
    High,
    Low,
}

#[derive(Debug, Clone)]
pub enum AggregationCmd {
    Shutdown,
    /// New foreground state after privacy filter (each tick when not AFK).
    Tick {
        timestamp_ms: i64,
        app_name: String,
        bundle_id: Option<String>,
        window_title: String,
        extracted_url: Option<String>,
        extracted_file_path: Option<String>,
        trigger_type: String,
        state_hash: i64,
    },
    EnterAfk {
        timestamp_ms: i64,
        idle_seconds: f64,
    },
    ExitAfk {
        timestamp_ms: i64,
        app_name: String,
        bundle_id: Option<String>,
        window_title: String,
        extracted_url: Option<String>,
        extracted_file_path: Option<String>,
        state_hash: i64,
    },
    /// 前台进入黑名单应用：关闭当前 Session，不新建 Session，直至回到非黑名单前台。
    EnterRecordingBlackout {
        timestamp_ms: i64,
    },
}
