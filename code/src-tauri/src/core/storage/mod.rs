pub mod db;

use serde::{Deserialize, Serialize};

/// A single window activity event (one contiguous focus session)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowEvent {
    pub id: String,
    pub timestamp_ms: i64,
    pub app_name: String,
    pub window_title: String,
    pub duration_ms: i64,
    pub intent: Option<String>,
    #[serde(default)]
    pub snapshot_urls: Vec<String>,
}

/// A single screenshot snapshot associated with one WindowEvent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventSnapshot {
    pub id: String,
    pub event_id: String,
    pub file_path: String,
    pub captured_at_ms: i64,
    pub file_size_bytes: i64,
}

/// A WindowEvent bundled with all its associated snapshots
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowEventWithSnapshots {
    #[serde(flatten)]
    pub event: WindowEvent,
    pub snapshots: Vec<EventSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppStats {
    pub app_name: String,
    pub duration_ms: i64,
    pub event_count: i64,
    pub icon_base64: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityStats {
    pub total_active_ms: i64,
    pub afk_ms: i64,
    pub app_stats: Vec<AppStats>,
    pub hourly_pulse: Vec<i64>, // 24 values
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowTitleStat {
    pub window_title: String,
    pub total_duration_ms: i64,
    pub session_count: i64,
    pub intent: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotInfo {
    pub url: String,
    pub captured_at_ms: i64,
    pub file_size_bytes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppMeta {
    pub app_name: String,
    pub icon_base64: Option<String>,
}

use std::path::PathBuf;
use tauri::Manager;

/// Returns the base data directory: ~/.timelens/data  (not AppData, always explicit)
pub fn get_data_dir(app: &tauri::AppHandle) -> PathBuf {
    // Prefer explicit home-based path per PRD spec
    if let Some(home) = dirs_next::home_dir() {
        return home.join(".timelens").join("data");
    }
    // Fallback to Tauri app data dir
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

/// Returns the shots directory for a given date string (YYYY-MM-DD)
pub fn get_shots_dir(app: &tauri::AppHandle, date: &str) -> PathBuf {
    get_data_dir(app).join("shots").join(date)
}
