use std::sync::{Arc, Mutex};
use tauri::{State, Manager};
use crate::core::storage::{ActivityStats, AppMeta, WindowTitleStat, SnapshotInfo, WindowEvent, WindowEventWithSnapshots};
use crate::core::storage::db::Database;
use crate::core::collection::capture_service::{CaptureSignal, CapturePriority, now_ms};
use crate::core::collection::window_tracker::WindowTracker;
use crate::AppState;

#[tauri::command]
pub async fn get_activity_stats(
    state: State<'_, AppState>,
) -> Result<ActivityStats, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_activity_stats().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_app_meta(
    state: State<'_, AppState>,
) -> Result<Vec<AppMeta>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_all_app_meta().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_window_breakdown(
    state: State<'_, AppState>,
    app_name: String,
) -> Result<Vec<WindowTitleStat>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_window_breakdown(&app_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_snapshots_for_window(
    state: State<'_, AppState>,
    app_name: String,
    window_title: String,
) -> Result<Vec<SnapshotInfo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let snapshots = db.get_snapshots_for_window(&app_name, &window_title)
        .map_err(|e| e.to_string())?;
    let result = snapshots.into_iter().map(|s| {
        let url = if let Some(pos) = s.file_path.find("shots/") {
            format!("timelens://localhost/{}", &s.file_path[pos..])
        } else {
            format!("timelens://localhost/{}", s.file_path)
        };
        SnapshotInfo {
            url,
            captured_at_ms: s.captured_at_ms,
            file_size_bytes: s.file_size_bytes,
        }
    }).collect();
    Ok(result)
}

#[tauri::command]
pub async fn start_tracking(state: State<'_, AppState>) -> Result<(), String> {
    let tracker = state.tracker.lock().map_err(|e| e.to_string())?;
    tracker.start().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_tracking(state: State<'_, AppState>) -> Result<(), String> {
    let tracker = state.tracker.lock().map_err(|e| e.to_string())?;
    tracker.stop();
    Ok(())
}

#[tauri::command]
pub async fn is_tracking(state: State<'_, AppState>) -> Result<bool, String> {
    let tracker = state.tracker.lock().map_err(|e| e.to_string())?;
    Ok(tracker.is_running())
}

#[tauri::command]
pub async fn trigger_screenshot(state: State<'_, AppState>) -> Result<(), String> {
    let now = now_ms();
    let event_id = uuid::Uuid::new_v4().to_string();
    let event = WindowEvent {
        id: event_id.clone(),
        timestamp_ms: now,
        app_name: "Manual Capture".to_string(),
        window_title: "User Snapshot".to_string(),
        duration_ms: 0,
        intent: Some("Manual".to_string()),
        snapshot_urls: vec![],
    };
    if let Ok(guard) = state.db.lock() {
        guard.insert_event(&event).map_err(|e| e.to_string())?;
    }
    
    let signal = CaptureSignal {
        event_id,
        priority: CapturePriority::High,
        timestamp_ms: now,
    };
    state.capture_tx.send(signal).await.map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn get_today_events(
    state: State<'_, AppState>,
) -> Result<Vec<WindowEvent>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_today_events().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_today_events_with_snapshots(
    state: State<'_, AppState>,
) -> Result<Vec<WindowEventWithSnapshots>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_today_events_with_snapshots().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_settings(
    state: State<'_, AppState>,
) -> Result<std::collections::HashMap<String, String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_all_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_settings(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_setting(&key, &value).map_err(|e| e.to_string())
}

/// Opens the local data directory in macOS Finder
#[tauri::command]
pub async fn open_data_dir(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let _ = state; // only needed to make State available if we want to check db path
    let data_dir = crate::core::storage::get_data_dir(&app_handle);
    std::fs::create_dir_all(&data_dir).ok();

    use tauri_plugin_opener::OpenerExt;
    app_handle
        .opener()
        .open_path(data_dir.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Returns current permission status for Accessibility and Screen Recording.
#[tauri::command]
pub async fn check_permissions() -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(serde_json::json!({
            "accessibility": crate::has_accessibility_permission(),
            "screenRecording": crate::has_screen_recording_permission(),
        }))
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(serde_json::json!({ "accessibility": true, "screenRecording": true }))
    }
}

/// Re-check permissions and start the tracker if both are now granted.
/// Call this after the user has granted permissions and wants to resume without restarting.
#[tauri::command]
pub async fn restart_tracking(state: State<'_, AppState>) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        let ok = crate::has_accessibility_permission() && crate::has_screen_recording_permission();
        if ok {
            let tracker = state.tracker.lock().map_err(|e| e.to_string())?;
            tracker.start().map_err(|e| e.to_string())?;
        }
        Ok(ok)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let tracker = state.tracker.lock().map_err(|e| e.to_string())?;
        tracker.start().map_err(|e| e.to_string())?;
        Ok(true)
    }
}
