use std::fs;
use std::path::Path;
use std::sync::atomic::Ordering;
use chrono::{Local, NaiveDate, TimeZone, Utc};
use rusqlite::params;
use serde_json::json;
use tauri::{AppHandle, Emitter, State};

use crate::core::acquisition;
use crate::core::models::{
    ActivityStats, AppMeta, AppSwitch, CapturePriority, CaptureSignal, PermissionStatus,
    RawEvent, Snapshot, StorageStats, WindowSession, WriteEvent,
};
use crate::core::storage::db;
use crate::AppState;

fn day_range_ms(date: &str) -> Result<(i64, i64), String> {
    let d = NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|e| e.to_string())?;
    let start = Local
        .from_local_datetime(&d.and_hms_opt(0, 0, 0).unwrap())
        .single()
        .ok_or_else(|| "invalid local date".to_string())?
        .timestamp_millis();
    let end = Local
        .from_local_datetime(&d.and_hms_opt(23, 59, 59).unwrap())
        .single()
        .unwrap()
        .timestamp_millis()
        + 999;
    Ok((start, end))
}

fn dir_size(path: &Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = fs::read_dir(path) {
        for e in entries.flatten() {
            let p = e.path();
            if let Ok(m) = e.metadata() {
                if m.is_dir() {
                    total += dir_size(&p);
                } else {
                    total += m.len();
                }
            }
        }
    }
    total
}

#[tauri::command]
pub fn start_tracking(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.0.tracking.store(true, Ordering::Relaxed);
    let _ = app.emit("tracking_state_changed", json!({ "isRunning": true }));
    Ok(())
}

#[tauri::command]
pub fn stop_tracking(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.0.tracking.store(false, Ordering::Relaxed);
    let _ = app.emit("tracking_state_changed", json!({ "isRunning": false }));
    Ok(())
}

#[tauri::command]
pub fn is_tracking(state: State<'_, AppState>) -> bool {
    state.0.tracking.load(Ordering::Relaxed)
}

#[tauri::command]
pub fn restart_tracking(app: AppHandle, state: State<'_, AppState>) -> Result<bool, String> {
    state.0.tracking.store(false, Ordering::Relaxed);
    let _ = app.emit("tracking_state_changed", json!({ "isRunning": false }));
    std::thread::sleep(std::time::Duration::from_millis(200));
    state.0.tracking.store(true, Ordering::Relaxed);
    let _ = app.emit("tracking_state_changed", json!({ "isRunning": true }));
    Ok(true)
}

#[tauri::command]
pub fn trigger_screenshot(state: State<'_, AppState>) -> Result<(), String> {
    let sid = state
        .0
        .current_session
        .read()
        .map_err(|_| "lock")?
        .clone();
    let Some(sid) = sid else {
        return Err(
            "暂无活跃 Session：请先点击「开始采集」，并等待至少一次前台窗口采样（约 2s）后再试"
                .into(),
        );
    };
    state
        .0
        .capture_tx
        .send(CaptureSignal {
            priority: CapturePriority::High,
            session_id: Some(sid),
            trigger_type: "manual".into(),
        })
        .map_err(|_| "截图队列已满，请稍后重试".to_string())?;
    Ok(())
}

#[tauri::command]
pub fn check_permissions(state: State<'_, AppState>) -> Result<PermissionStatus, String> {
    let ax = acquisition::ax_trusted();
    let sr = acquisition::screen_capture_refresh_access();
    state.0.screen_ok.store(sr, Ordering::Relaxed);
    Ok(PermissionStatus {
        accessibility_granted: ax,
        screen_recording_granted: sr,
    })
}

#[tauri::command]
pub fn open_accessibility_settings() -> Result<(), String> {
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn open_screen_recording_settings() -> Result<(), String> {
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
        .status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_sessions(
    state: State<'_, AppState>,
    date: String,
    app_name: Option<String>,
) -> Result<Vec<WindowSession>, String> {
    let (start, end) = day_range_ms(&date)?;
    let conn = state.0.read_conn.lock();
    if let Some(an) = app_name {
        let mut stmt = conn
            .prepare(
                "SELECT id, start_ms, end_ms, duration_ms, app_name, bundle_id, window_title, \
             extracted_url, extracted_file_path, intent, raw_event_count, is_active \
             FROM window_sessions WHERE start_ms >= ?1 AND start_ms <= ?2 AND app_name = ?3 \
             ORDER BY start_ms DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![start, end, an], map_session)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, start_ms, end_ms, duration_ms, app_name, bundle_id, window_title, \
             extracted_url, extracted_file_path, intent, raw_event_count, is_active \
             FROM window_sessions WHERE start_ms >= ?1 AND start_ms <= ?2 \
             ORDER BY start_ms DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![start, end], map_session)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }
}

fn map_session(
    r: &rusqlite::Row<'_>,
) -> rusqlite::Result<WindowSession> {
    Ok(WindowSession {
        id: r.get(0)?,
        start_ms: r.get(1)?,
        end_ms: r.get(2)?,
        duration_ms: r.get(3)?,
        app_name: r.get(4)?,
        bundle_id: r.get(5)?,
        window_title: r.get(6)?,
        extracted_url: r.get(7)?,
        extracted_file_path: r.get(8)?,
        intent: r.get(9)?,
        raw_event_count: r.get(10)?,
        is_active: r.get::<_, i64>(11)? != 0,
    })
}

#[tauri::command]
pub fn get_session_snapshots(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<Snapshot>, String> {
    let conn = state.0.read_conn.lock();
    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, file_path, captured_at_ms, file_size_bytes, trigger_type, \
         resolution, format, perceptual_hash FROM snapshots WHERE session_id = ?1 ORDER BY captured_at_ms DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([&session_id], |r| {
            Ok(Snapshot {
                id: r.get(0)?,
                session_id: r.get(1)?,
                file_path: r.get(2)?,
                captured_at_ms: r.get(3)?,
                file_size_bytes: r.get(4)?,
                trigger_type: r.get(5)?,
                resolution: r.get(6)?,
                format: r.get(7)?,
                perceptual_hash: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_activity_stats(
    state: State<'_, AppState>,
    date: Option<String>,
) -> Result<ActivityStats, String> {
    let date_str = date.unwrap_or_else(|| {
        Local::now().format("%Y-%m-%d").to_string()
    });
    let (start, end) = day_range_ms(&date_str)?;
    let conn = state.0.read_conn.lock();
    let session_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM window_sessions WHERE start_ms >= ?1 AND start_ms <= ?2",
            params![start, end],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let snapshot_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM snapshots WHERE captured_at_ms >= ?1 AND captured_at_ms <= ?2",
            params![start, end],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let switch_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM app_switches WHERE timestamp_ms >= ?1 AND timestamp_ms <= ?2",
            params![start, end],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let raw_event_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM raw_events WHERE timestamp_ms >= ?1 AND timestamp_ms <= ?2",
            params![start, end],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(ActivityStats {
        date: date_str,
        session_count,
        snapshot_count,
        switch_count,
        raw_event_count,
    })
}

#[tauri::command]
pub fn get_all_app_meta(state: State<'_, AppState>) -> Result<Vec<AppMeta>, String> {
    let conn = state.0.read_conn.lock();
    let mut stmt = conn
        .prepare("SELECT app_name, bundle_id, icon_base64, category, first_seen_ms, last_seen_ms FROM app_meta ORDER BY last_seen_ms DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(AppMeta {
                app_name: r.get(0)?,
                bundle_id: r.get(1)?,
                icon_base64: r.get(2)?,
                category: r.get(3)?,
                first_seen_ms: r.get(4)?,
                last_seen_ms: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_app_switches(
    state: State<'_, AppState>,
    date: String,
    limit: Option<i64>,
) -> Result<Vec<AppSwitch>, String> {
    let (start, end) = day_range_ms(&date)?;
    let lim = limit.unwrap_or(500);
    let conn = state.0.read_conn.lock();
    let mut stmt = conn
        .prepare(
            "SELECT id, timestamp_ms, from_app, from_bundle_id, from_window_title, \
         to_app, to_bundle_id, to_window_title, from_session_duration_ms, switch_type \
         FROM app_switches WHERE timestamp_ms >= ?1 AND timestamp_ms <= ?2 \
         ORDER BY timestamp_ms DESC LIMIT ?3",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![start, end, lim], |r| {
            Ok(AppSwitch {
                id: r.get(0)?,
                timestamp_ms: r.get(1)?,
                from_app: r.get(2)?,
                from_bundle_id: r.get(3)?,
                from_window_title: r.get(4)?,
                to_app: r.get(5)?,
                to_bundle_id: r.get(6)?,
                to_window_title: r.get(7)?,
                from_session_duration_ms: r.get(8)?,
                switch_type: r.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_storage_stats(state: State<'_, AppState>) -> Result<StorageStats, String> {
    let paths = &state.0.paths;
    let db_size_bytes = fs::metadata(&paths.db_path).map(|m| m.len()).unwrap_or(0);
    let shots_size_bytes = dir_size(&paths.shots_dir);
    let conn = state.0.read_conn.lock();
    let raw_event_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM raw_events", [], |r| r.get(0))
        .unwrap_or(0);
    let session_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM window_sessions", [], |r| r.get(0))
        .unwrap_or(0);
    let snapshot_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM snapshots", [], |r| r.get(0))
        .unwrap_or(0);
    let wal = db::wal_size_bytes(&paths.db_path);
    if wal > 4 * 1024 * 1024 {
        let _ = state.0.writer.try_send(WriteEvent::WalCheckpoint);
    }
    Ok(StorageStats {
        db_size_bytes,
        shots_size_bytes,
        raw_event_count,
        session_count,
        snapshot_count,
    })
}

#[tauri::command]
pub fn open_data_dir(state: State<'_, AppState>) -> Result<(), String> {
    open::that(&state.0.paths.root).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_raw_events_recent(
    state: State<'_, AppState>,
    limit: i64,
) -> Result<Vec<RawEvent>, String> {
    let conn = state.0.read_conn.lock();
    let mut stmt = conn
        .prepare(
            "SELECT id, timestamp_ms, app_name, bundle_id, window_title, extracted_url, \
         extracted_file_path, idle_seconds, is_fullscreen, is_audio_playing, state_hash, trigger_type, created_at \
         FROM raw_events ORDER BY timestamp_ms DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([limit], |r| {
            Ok(RawEvent {
                id: r.get(0)?,
                timestamp_ms: r.get(1)?,
                app_name: r.get(2)?,
                bundle_id: r.get(3)?,
                window_title: r.get(4)?,
                extracted_url: r.get(5)?,
                extracted_file_path: r.get(6)?,
                idle_seconds: r.get(7)?,
                is_fullscreen: r.get::<_, i64>(8)? != 0,
                is_audio_playing: r.get::<_, i64>(9)? != 0,
                state_hash: r.get(10)?,
                trigger_type: r.get(11)?,
                created_at: r.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_writer_stats(state: State<'_, AppState>) -> crate::core::models::WriterStats {
    state.0.writer_metrics.snapshot(0)
}

#[tauri::command]
pub fn run_retention_cleanup(state: State<'_, AppState>) -> Result<(), String> {
    let now = Utc::now().timestamp_millis();
    let raw_cut = now - 7_i64 * 24 * 3600 * 1000;
    let snap_cut = now - 3_i64 * 24 * 3600 * 1000;
    let _ = state.0.writer.try_send(WriteEvent::Retention {
        raw_cutoff_ms: raw_cut,
        snapshot_cutoff_ms: snap_cut,
    });
    Ok(())
}

#[tauri::command]
pub fn checkpoint_wal(state: State<'_, AppState>) -> Result<(), String> {
    let _ = state.0.writer.try_send(WriteEvent::WalCheckpoint);
    Ok(())
}
