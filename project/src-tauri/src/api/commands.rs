use std::fs;
use std::path::Path;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use chrono::{Local, Utc};
use rusqlite::params;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::analysis::ai_client;
use crate::analysis::{build_fact_only_markdown, generate_daily_analysis_into};
use crate::core::acquisition;
use crate::core::intent_mapping;
use crate::core::models::{
    ActivityStats, AppMeta, AppSwitch, CapturePriority, CaptureSignal, EngineStatus,
    PermissionStatus, PipelineHealth, RawEvent, Snapshot, StorageStats, WindowSession, WriteEvent,
};
use crate::core::ocr::OcrLineEval;
use crate::core::ocr::OcrPipelineConfig;
use crate::core::settings;
use crate::core::storage::db;
use crate::core::time_range::local_day_bounds_ms;
use crate::AppState;

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
    let nl = acquisition::notifications_listener_access_granted();
    state.0.screen_ok.store(sr, Ordering::Relaxed);
    Ok(PermissionStatus {
        accessibility_granted: ax,
        screen_recording_granted: sr,
        notification_listener_granted: nl,
    })
}

/// 用户主动点击「请求屏幕录制权限」时调用：触发 macOS 系统弹窗（每次运行只弹一次）。
#[tauri::command]
pub fn request_screen_capture_access(state: State<'_, AppState>) -> Result<bool, String> {
    let granted = acquisition::request_screen_capture_access();
    state.0.screen_ok.store(granted, Ordering::Relaxed);
    Ok(granted)
}

#[tauri::command]
pub fn open_accessibility_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .status()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("ms-settings:easeofaccess")
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        return Err("unsupported platform".into());
    }
    Ok(())
}

#[tauri::command]
pub fn open_screen_recording_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
            .status()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("ms-settings:privacy")
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        return Err("unsupported platform".into());
    }
    Ok(())
}

#[tauri::command]
pub fn open_notification_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.Notifications-Settings.extension")
            .status()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("ms-settings:notifications")
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        return Err("unsupported platform".into());
    }
    Ok(())
}

#[tauri::command]
pub fn get_sessions(
    state: State<'_, AppState>,
    date: String,
    app_name: Option<String>,
) -> Result<Vec<WindowSession>, String> {
    let (start, end) = local_day_bounds_ms(&date)?;
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
    let (start, end) = local_day_bounds_ms(&date_str)?;
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
    let (start, end) = local_day_bounds_ms(&date)?;
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

fn max_ts(conn: &rusqlite::Connection, sql: &str) -> Option<i64> {
    conn.query_row(sql, [], |r| r.get::<_, Option<i64>>(0))
        .ok()
        .flatten()
}

fn engine_status(
    tracking: bool,
    engine_enabled: bool,
    force_degraded: bool,
    last: Option<i64>,
    now: i64,
    stale_ms: i64,
) -> EngineStatus {
    if !tracking {
        return EngineStatus {
            status: "stopped".into(),
            last_data_ms: last,
            error_count: 0,
        };
    }
    if !engine_enabled {
        return EngineStatus {
            status: "stopped".into(),
            last_data_ms: last,
            error_count: 0,
        };
    }
    if force_degraded {
        return EngineStatus {
            status: "degraded".into(),
            last_data_ms: last,
            error_count: 0,
        };
    }
    let Some(ts) = last else {
        return EngineStatus {
            status: "degraded".into(),
            last_data_ms: None,
            error_count: 0,
        };
    };
    if now - ts > stale_ms {
        EngineStatus {
            status: "degraded".into(),
            last_data_ms: Some(ts),
            error_count: 0,
        }
    } else {
        EngineStatus {
            status: "running".into(),
            last_data_ms: Some(ts),
            error_count: 0,
        }
    }
}

/// 二期 M0：六引擎健康度（基于权限 + 各表最近时间戳；未实现的采集引擎在运行中常表现为 `degraded`）。
#[tauri::command]
pub fn get_pipeline_health(state: State<'_, AppState>) -> Result<PipelineHealth, String> {
    let tracking = state.0.tracking.load(Ordering::Relaxed);
    let ax = acquisition::ax_trusted();
    let screen_ok = state.0.screen_ok.load(Ordering::Relaxed);
    let now = Utc::now().timestamp_millis();
    let conn = state.0.read_conn.lock();

    let raw_last = max_ts(&conn, "SELECT MAX(timestamp_ms) FROM raw_events");
    let snap_last = max_ts(&conn, "SELECT MAX(captured_at_ms) FROM snapshots");
    let input_last = max_ts(&conn, "SELECT MAX(timestamp_ms) FROM input_metrics");
    let clip_last = max_ts(&conn, "SELECT MAX(timestamp_ms) FROM clipboard_flows");
    let notif_last = max_ts(&conn, "SELECT MAX(timestamp_ms) FROM notifications");
    let ambient_last = max_ts(&conn, "SELECT MAX(timestamp_ms) FROM ambient_context");
    let ocr_last = max_ts(
        &conn,
        "SELECT MAX(processed_at_ms) FROM snapshot_ocr WHERE status = 'ok' AND redacted = 0 \
         AND length(trim(COALESCE(ocr_text,''))) > 0",
    );
    let engine_notif = state.0.engine_notifications.load(Ordering::Relaxed);
    let notif_perm = acquisition::notifications_listener_access_granted();
    let notif_force_degraded = tracking && engine_notif && !notif_perm;
    let ocr_en = state.0.ocr_enabled.load(Ordering::Relaxed);

    Ok(PipelineHealth {
        tracker: engine_status(tracking, true, !ax, raw_last, now, 180_000),
        capture: engine_status(tracking, true, !screen_ok, snap_last, now, 1_800_000),
        input_dynamics: engine_status(
            tracking,
            state.0.engine_input.load(Ordering::Relaxed),
            false,
            input_last,
            now,
            120_000,
        ),
        clipboard: engine_status(
            tracking,
            state.0.engine_clipboard.load(Ordering::Relaxed),
            false,
            clip_last,
            now,
            3_600_000,
        ),
        notifications: engine_status(
            tracking,
            engine_notif,
            notif_force_degraded,
            notif_last,
            now,
            3_600_000,
        ),
        ambient_context: engine_status(
            tracking,
            state.0.engine_ambient.load(Ordering::Relaxed),
            false,
            ambient_last,
            now,
            90_000,
        ),
        ocr: engine_status(tracking, ocr_en, false, ocr_last, now, 1_800_000),
        last_check_ms: now,
    })
}

fn build_daily_ocr_summaries_value(
    conn: &rusqlite::Connection,
    date: &str,
    blacklist: &[String],
) -> Result<serde_json::Value, String> {
    let (start, end) = local_day_bounds_ms(date)?;
    let mut stmt = conn
        .prepare(
            "SELECT ws.id, ws.app_name, sc.summary_line \
             FROM window_sessions ws \
             LEFT JOIN session_ocr_context sc ON sc.session_id = ws.id \
             WHERE ws.start_ms >= ?1 AND ws.start_ms <= ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![start, end], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut arr = Vec::new();
    for row in rows {
        let (id, app, sum) = row.map_err(|e| e.to_string())?;
        if settings::app_name_blacklisted(&app, blacklist) {
            continue;
        }
        if let Some(line) = sum {
            let t = line.trim();
            if !t.is_empty() {
                arr.push(json!({
                    "session_id": id,
                    "summary": t,
                }));
            }
        }
    }
    Ok(json!(arr))
}

/// 空格 / 逗号分隔的多关键词；去重保序；用于 FTS `body:"a" AND body:"b"`。
fn parse_ocr_search_keywords(q: &str) -> Result<Vec<String>, String> {
    const MAX_KW: usize = 8;
    let mut out: Vec<String> = Vec::new();
    for part in q.split(|c: char| {
        c.is_whitespace() || c == ',' || c == '，' || c == ';' || c == '；'
    }) {
        let t = part.trim();
        if t.is_empty() {
            continue;
        }
        if t.chars().count() > 64 {
            return Err("单个关键词过长（≤64 字）".into());
        }
        let esc = t.replace('\"', "\"\"");
        if !out.iter().any(|x| x == &esc) {
            out.push(esc);
        }
        if out.len() > MAX_KW {
            return Err(format!("最多 {MAX_KW} 个关键词"));
        }
    }
    if out.is_empty() {
        return Err("关键词为空".into());
    }
    Ok(out)
}

fn build_ocr_fts_and_expr(tokens: &[String]) -> String {
    tokens
        .iter()
        .map(|t| format!("body: \"{t}\""))
        .collect::<Vec<_>>()
        .join(" AND ")
}

const OCR_FULL_TEXT_MAX_CHARS: usize = 65536;

fn open_db_rw(path: &Path) -> Result<rusqlite::Connection, String> {
    let c = rusqlite::Connection::open(path).map_err(|e| e.to_string())?;
    c.busy_timeout(Duration::from_secs(8))
        .map_err(|e| e.to_string())?;
    Ok(c)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineFlagsResponse {
    pub engine_input: bool,
    pub engine_clipboard: bool,
    pub engine_notifications: bool,
    pub engine_ambient: bool,
    pub ai_enabled: bool,
}

#[tauri::command]
pub fn get_engine_flags(state: State<'_, AppState>) -> Result<EngineFlagsResponse, String> {
    Ok(EngineFlagsResponse {
        engine_input: state.0.engine_input.load(Ordering::Relaxed),
        engine_clipboard: state.0.engine_clipboard.load(Ordering::Relaxed),
        engine_notifications: state.0.engine_notifications.load(Ordering::Relaxed),
        engine_ambient: state.0.engine_ambient.load(Ordering::Relaxed),
        ai_enabled: state.0.ai_enabled.load(Ordering::Relaxed),
    })
}

#[tauri::command]
pub fn set_engine_enabled(
    state: State<'_, AppState>,
    name: String,
    enabled: bool,
) -> Result<(), String> {
    let key = match name.as_str() {
        "input" => settings::key_engine_input(),
        "clipboard" => settings::key_engine_clipboard(),
        "notifications" => settings::key_engine_notifications(),
        "ambient" => settings::key_engine_ambient(),
        _ => return Err(format!("unknown engine: {name}")),
    };
    let mut c = open_db_rw(&state.0.paths.db_path)?;
    settings::set_flag(&mut c, key, enabled).map_err(|e| e.to_string())?;
    match name.as_str() {
        "input" => state.0.engine_input.store(enabled, Ordering::Relaxed),
        "clipboard" => state.0.engine_clipboard.store(enabled, Ordering::Relaxed),
        "notifications" => state
            .0
            .engine_notifications
            .store(enabled, Ordering::Relaxed),
        "ambient" => state.0.engine_ambient.store(enabled, Ordering::Relaxed),
        _ => {}
    }
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSettingsDto {
    pub privacy_acknowledged: bool,
    pub base_url: String,
    pub model: String,
    pub has_api_key: bool,
}

#[tauri::command]
pub fn get_ai_settings(state: State<'_, AppState>) -> Result<AiSettingsDto, String> {
    let conn = state.0.read_conn.lock();
    Ok(AiSettingsDto {
        privacy_acknowledged: settings::get_ai_privacy_acknowledged(&conn),
        base_url: settings::get_ai_base_url(&conn),
        model: settings::get_ai_model(&conn),
        has_api_key: settings::has_ai_api_key(&conn),
    })
}

#[tauri::command]
pub fn set_ai_privacy_acknowledged(
    state: State<'_, AppState>,
    acknowledged: bool,
) -> Result<(), String> {
    let mut c = open_db_rw(&state.0.paths.db_path)?;
    settings::set_ai_privacy_acknowledged(&mut c, acknowledged).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_ai_settings(
    state: State<'_, AppState>,
    base_url: Option<String>,
    model: Option<String>,
    api_key: Option<String>,
) -> Result<(), String> {
    let mut c = open_db_rw(&state.0.paths.db_path)?;
    if let Some(b) = base_url {
        settings::set_ai_base_url(&mut c, &b).map_err(|e| e.to_string())?;
    }
    if let Some(m) = model {
        settings::set_ai_model(&mut c, &m).map_err(|e| e.to_string())?;
    }
    if let Some(k) = api_key {
        settings::set_ai_api_key(&mut c, &k).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_ai_enabled(state: State<'_, AppState>, enabled: bool) -> Result<(), String> {
    let mut c = open_db_rw(&state.0.paths.db_path)?;
    if enabled && !settings::get_ai_privacy_acknowledged(&c) {
        return Err("请先阅读并确认隐私说明后再开启 AI".into());
    }
    settings::set_flag(&mut c, settings::key_ai_enabled(), enabled).map_err(|e| e.to_string())?;
    state.0.ai_enabled.store(enabled, Ordering::Relaxed);
    Ok(())
}

/// M5：纠错 — 更新某条 Session 的 Intent，并写入用户 `intent_mapping`（后续新建 Session 自动匹配）。
#[tauri::command]
pub fn update_session_intent(
    state: State<'_, AppState>,
    session_id: String,
    intent: Option<String>,
) -> Result<(), String> {
    let mut c = open_db_rw(&state.0.paths.db_path)?;
    let (app_name, bundle_id): (String, Option<String>) = c
        .query_row(
            "SELECT app_name, bundle_id FROM window_sessions WHERE id = ?1",
            params![session_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "未找到该 Session".to_string())?;
    let n = c
        .execute(
            "UPDATE window_sessions SET intent = ?1 WHERE id = ?2",
            params![intent, session_id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("未找到该 Session".into());
    }
    if let Some(ref s) = intent {
        let t = s.trim();
        if !t.is_empty() {
            intent_mapping::upsert_user_intent_rule(&mut c, &app_name, bundle_id.as_deref(), t)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// 按「应用名 + Bundle」聚合历史 Session，用于 Intent 统一管理页。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppIntentAggregateDto {
    pub app_name: String,
    pub bundle_id: Option<String>,
    pub session_count: i64,
    /// 当前 `intent_mapping` 解析结果（含内置与用户规则）。
    pub resolved_intent: Option<String>,
    /// `none` | `builtin` | `user`
    pub intent_source: String,
}

/// 列出所有出现过的 (app_name, bundle_id) 组合及会话数、解析到的 Intent。
#[tauri::command]
pub fn list_app_intent_aggregates(state: State<'_, AppState>) -> Result<Vec<AppIntentAggregateDto>, String> {
    let g = state.0.read_conn.lock();
    let sql = "SELECT app_name, \
         CASE WHEN trim(coalesce(bundle_id,'')) = '' THEN NULL ELSE trim(bundle_id) END AS bid, \
         COUNT(*) as cnt \
         FROM window_sessions \
         GROUP BY app_name, CASE WHEN trim(coalesce(bundle_id,'')) = '' THEN NULL ELSE trim(bundle_id) END \
         ORDER BY cnt DESC, app_name ASC";
    let mut stmt = g.prepare(sql).map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(r) = rows.next().map_err(|e| e.to_string())? {
        let app_name: String = r.get(0).map_err(|e| e.to_string())?;
        let bundle_id: Option<String> = r.get(1).map_err(|e| e.to_string())?;
        let session_count: i64 = r.get(2).map_err(|e| e.to_string())?;
        let (resolved_intent, src) =
            intent_mapping::resolve_intent_detail(&g, &app_name, bundle_id.as_deref())
                .map_err(|e| e.to_string())?;
        out.push(AppIntentAggregateDto {
            app_name,
            bundle_id,
            session_count,
            resolved_intent,
            intent_source: src.as_api_str().to_string(),
        });
    }
    Ok(out)
}

/// 为同一应用键批量设置 Intent：写入 `intent_mapping`（新 Session 自动匹配），并更新所有已存在 Session 的 `intent` 字段。
fn apply_intent_for_app_aggregate_conn(
    c: &mut rusqlite::Connection,
    app_name: &str,
    bundle_id: Option<&String>,
    intent: Option<&String>,
) -> Result<i64, String> {
    let bundle_norm = bundle_id
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let intent_trim = intent.map(|s| s.trim()).filter(|s| !s.is_empty());

    let updated: i64 = if let Some(ref t) = intent_trim {
        intent_mapping::upsert_user_intent_rule(c, app_name, bundle_norm.as_deref(), t)
            .map_err(|e| e.to_string())?;
        if let Some(ref b) = bundle_norm {
            c.execute(
                "UPDATE window_sessions SET intent = ?1 \
                 WHERE app_name = ?2 AND trim(coalesce(bundle_id,'')) = ?3",
                params![t, app_name, b],
            )
        } else {
            c.execute(
                "UPDATE window_sessions SET intent = ?1 \
                 WHERE app_name = ?2 AND trim(coalesce(bundle_id,'')) = ''",
                params![t, app_name],
            )
        }
        .map_err(|e| e.to_string())? as i64
    } else {
        intent_mapping::remove_user_intent_rules(c, app_name, bundle_norm.as_deref())
            .map_err(|e| e.to_string())?;
        if let Some(ref b) = bundle_norm {
            c.execute(
                "UPDATE window_sessions SET intent = NULL \
                 WHERE app_name = ?1 AND trim(coalesce(bundle_id,'')) = ?2",
                params![app_name, b],
            )
        } else {
            c.execute(
                "UPDATE window_sessions SET intent = NULL \
                 WHERE app_name = ?1 AND trim(coalesce(bundle_id,'')) = ''",
                params![app_name],
            )
        }
        .map_err(|e| e.to_string())? as i64
    };
    Ok(updated)
}

#[tauri::command]
pub fn set_intent_for_app_aggregate(
    state: State<'_, AppState>,
    app_name: String,
    bundle_id: Option<String>,
    intent: Option<String>,
) -> Result<i64, String> {
    let mut c = open_db_rw(&state.0.paths.db_path)?;
    apply_intent_for_app_aggregate_conn(&mut c, &app_name, bundle_id.as_ref(), intent.as_ref())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppIntentBatchItem {
    pub app_name: String,
    pub bundle_id: Option<String>,
    pub intent: Option<String>,
}

/// 批量为多个应用键设置 Intent（单事务）。
#[tauri::command]
pub fn set_intent_for_app_aggregates_batch(
    state: State<'_, AppState>,
    items: Vec<AppIntentBatchItem>,
) -> Result<i64, String> {
    let mut c = open_db_rw(&state.0.paths.db_path)?;
    let mut total: i64 = 0;
    for item in items {
        let n = apply_intent_for_app_aggregate_conn(
            &mut c,
            &item.app_name,
            item.bundle_id.as_ref(),
            item.intent.as_ref(),
        )?;
        total += n;
    }
    Ok(total)
}

/// 将「尚无 Intent」的历史会话按当前映射规则（含内置字典）补齐。
#[tauri::command]
pub fn backfill_session_intents_from_mappings(state: State<'_, AppState>) -> Result<i64, String> {
    let c = open_db_rw(&state.0.paths.db_path)?;
    let mut stmt = c
        .prepare(
            "SELECT DISTINCT app_name, \
             CASE WHEN trim(coalesce(bundle_id,'')) = '' THEN NULL ELSE trim(bundle_id) END AS bid \
             FROM window_sessions WHERE intent IS NULL OR trim(intent) = ''",
        )
        .map_err(|e| e.to_string())?;
    let pairs: Vec<(String, Option<String>)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let mut total: i64 = 0;
    for (app_name, bundle_id) in pairs {
        let resolved = intent_mapping::resolve_intent(&c, &app_name, bundle_id.as_deref())
            .map_err(|e| e.to_string())?;
        if let Some(ref t) = resolved {
            let n = if let Some(ref b) = bundle_id {
                c.execute(
                    "UPDATE window_sessions SET intent = ?1 \
                     WHERE (intent IS NULL OR trim(intent) = '') \
                     AND app_name = ?2 AND trim(coalesce(bundle_id,'')) = ?3",
                    params![t, app_name, b],
                )
            } else {
                c.execute(
                    "UPDATE window_sessions SET intent = ?1 \
                     WHERE (intent IS NULL OR trim(intent) = '') \
                     AND app_name = ?2 AND trim(coalesce(bundle_id,'')) = ''",
                    params![t, app_name],
                )
            }
            .map_err(|e| e.to_string())? as i64;
            total += n;
        }
    }
    Ok(total)
}

#[tauri::command]
pub fn get_app_blacklist(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let g = state.0.read_conn.lock();
    Ok(settings::get_app_blacklist(&g))
}

/// 应用黑名单（按 `app_name` 精确匹配）：写入 DB 并同步内存，采集线程即时生效。
#[tauri::command]
pub fn set_app_blacklist(state: State<'_, AppState>, apps: Vec<String>) -> Result<(), String> {
    let mut c = open_db_rw(&state.0.paths.db_path)?;
    settings::set_app_blacklist(&mut c, &apps).map_err(|e| e.to_string())?;
    if let Ok(mut w) = state.0.app_blacklist.write() {
        *w = apps;
    }
    Ok(())
}

#[tauri::command]
pub fn generate_daily_analysis(state: State<'_, AppState>, date: String) -> Result<String, String> {
    let mut c = open_db_rw(&state.0.paths.db_path)?;
    generate_daily_analysis_into(&mut c, &date)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyAnalysisDto {
    pub id: String,
    pub analysis_date: String,
    pub generated_at_ms: i64,
    pub version: i64,
    pub total_active_ms: i64,
    pub intent_breakdown: String,
    pub top_apps: String,
    pub total_switches: i64,
    pub switches_per_hour: String,
    pub top_switch_pairs: String,
    pub deep_work_segments: String,
    pub deep_work_total_ms: i64,
    pub fragmentation_pct: f64,
    pub notification_count: i64,
    pub top_interrupters: String,
    pub interrupts_in_deep: i64,
    pub avg_kpm: Option<f64>,
    pub kpm_by_hour: String,
    pub avg_delete_ratio: Option<f64>,
    pub flow_score_avg: Option<f64>,
    pub struggle_score_avg: Option<f64>,
    pub clipboard_pairs: Option<i64>,
    pub top_flows: Option<String>,
    pub scene_breakdown: Option<String>,
    pub degraded_sections: String,
}

#[tauri::command]
pub fn get_daily_analysis(
    state: State<'_, AppState>,
    date: String,
) -> Result<Option<DailyAnalysisDto>, String> {
    let conn = state.0.read_conn.lock();
    let row = conn
        .query_row(
            "SELECT id, analysis_date, generated_at_ms, version, total_active_ms, intent_breakdown, top_apps, \
             total_switches, switches_per_hour, top_switch_pairs, deep_work_segments, deep_work_total_ms, \
             fragmentation_pct, notification_count, top_interrupters, interrupts_in_deep, avg_kpm, kpm_by_hour, \
             avg_delete_ratio, flow_score_avg, struggle_score_avg, clipboard_pairs, top_flows, scene_breakdown, \
             degraded_sections \
             FROM daily_analysis WHERE analysis_date = ?1",
            [&date],
            |r| {
                Ok(DailyAnalysisDto {
                    id: r.get(0)?,
                    analysis_date: r.get(1)?,
                    generated_at_ms: r.get(2)?,
                    version: r.get(3)?,
                    total_active_ms: r.get(4)?,
                    intent_breakdown: r.get(5)?,
                    top_apps: r.get(6)?,
                    total_switches: r.get(7)?,
                    switches_per_hour: r.get(8)?,
                    top_switch_pairs: r.get(9)?,
                    deep_work_segments: r.get(10)?,
                    deep_work_total_ms: r.get(11)?,
                    fragmentation_pct: r.get(12)?,
                    notification_count: r.get(13)?,
                    top_interrupters: r.get(14)?,
                    interrupts_in_deep: r.get(15)?,
                    avg_kpm: r.get(16)?,
                    kpm_by_hour: r.get(17)?,
                    avg_delete_ratio: r.get(18)?,
                    flow_score_avg: r.get(19)?,
                    struggle_score_avg: r.get(20)?,
                    clipboard_pairs: r.get(21)?,
                    top_flows: r.get(22)?,
                    scene_breakdown: r.get(23)?,
                    degraded_sections: r.get(24)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(row)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyReportDto {
    pub id: String,
    pub report_date: String,
    pub report_type: String,
    pub content_md: String,
    pub generated_at_ms: i64,
    pub ai_model: Option<String>,
    pub ai_prompt_hash: Option<String>,
}

#[tauri::command]
pub fn generate_daily_report(
    state: State<'_, AppState>,
    date: String,
    with_ai: bool,
) -> Result<DailyReportDto, String> {
    if with_ai {
        if !state.0.ai_enabled.load(Ordering::Relaxed) {
            return Err("AI 未开启：请先在设置中开启并配置".into());
        }
        let c = open_db_rw(&state.0.paths.db_path)?;
        let api_key = settings::get_ai_api_key(&c)
            .ok_or_else(|| "请先在设置中配置 API Key（BYOK）".to_string())?;
        let base_url = settings::get_ai_base_url(&c);
        let model = settings::get_ai_model(&c);

        let row: DailyAnalysisDto = c
            .query_row(
                "SELECT id, analysis_date, generated_at_ms, version, total_active_ms, intent_breakdown, top_apps, \
                 total_switches, switches_per_hour, top_switch_pairs, deep_work_segments, deep_work_total_ms, \
                 fragmentation_pct, notification_count, top_interrupters, interrupts_in_deep, avg_kpm, kpm_by_hour, \
                 avg_delete_ratio, flow_score_avg, struggle_score_avg, clipboard_pairs, top_flows, scene_breakdown, \
                 degraded_sections \
                 FROM daily_analysis WHERE analysis_date = ?1",
                [&date],
                |r| {
                    Ok(DailyAnalysisDto {
                        id: r.get(0)?,
                        analysis_date: r.get(1)?,
                        generated_at_ms: r.get(2)?,
                        version: r.get(3)?,
                        total_active_ms: r.get(4)?,
                        intent_breakdown: r.get(5)?,
                        top_apps: r.get(6)?,
                        total_switches: r.get(7)?,
                        switches_per_hour: r.get(8)?,
                        top_switch_pairs: r.get(9)?,
                        deep_work_segments: r.get(10)?,
                        deep_work_total_ms: r.get(11)?,
                        fragmentation_pct: r.get(12)?,
                        notification_count: r.get(13)?,
                        top_interrupters: r.get(14)?,
                        interrupts_in_deep: r.get(15)?,
                        avg_kpm: r.get(16)?,
                        kpm_by_hour: r.get(17)?,
                        avg_delete_ratio: r.get(18)?,
                        flow_score_avg: r.get(19)?,
                        struggle_score_avg: r.get(20)?,
                        clipboard_pairs: r.get(21)?,
                        top_flows: r.get(22)?,
                        scene_breakdown: r.get(23)?,
                        degraded_sections: r.get(24)?,
                    })
                },
            )
            .map_err(|_| "请先生成当日 daily_analysis".to_string())?;

        let data_sources: String = c
            .query_row(
                "SELECT COALESCE(data_sources, '{}') FROM daily_analysis WHERE analysis_date = ?1",
                [&date],
                |r| r.get(0),
            )
            .unwrap_or_else(|_| "{}".to_string());

        let fact_md = build_fact_only_markdown(
            &row.analysis_date,
            row.total_active_ms,
            &row.intent_breakdown,
            &row.top_apps,
            row.total_switches,
            &row.switches_per_hour,
            &row.top_switch_pairs,
            row.deep_work_total_ms,
            row.fragmentation_pct,
            row.notification_count,
            &row.top_interrupters,
            row.interrupts_in_deep,
            &data_sources,
            row.avg_kpm,
            &row.kpm_by_hour,
            row.avg_delete_ratio,
            row.flow_score_avg,
            row.struggle_score_avg,
            &row.degraded_sections,
            row.clipboard_pairs,
            row.top_flows.as_deref(),
            row.scene_breakdown.as_deref(),
        );

        let mut payload: serde_json::Value =
            serde_json::to_value(&row).map_err(|e| e.to_string())?;
        if let Some(obj) = payload.as_object_mut() {
            let ds: serde_json::Value =
                serde_json::from_str(&data_sources).unwrap_or(json!({}));
            obj.insert("data_sources".to_string(), ds);
        }

        if settings::get_ocr_allow_export_to_ai(&c) && settings::get_ocr_enabled(&c) {
            let bl = settings::get_app_blacklist(&c);
            let summaries = build_daily_ocr_summaries_value(&c, &date, &bl)?;
            if let Some(obj) = payload.as_object_mut() {
                obj.insert("ocr_session_summaries".to_string(), summaries);
            }
        }

        let ai_body = ai_client::complete_narrative(&base_url, &api_key, &model, &payload)?;
        let prompt_hash = ai_client::prompt_hash_hex();

        let mut full_md = fact_md;
        full_md.push_str("\n\n---\n\n## 8. AI 解读\n\n");
        full_md.push_str(
            "> **说明**：以下由 LLM 基于当日 **`daily_analysis` 聚合 JSON** 生成，仅供阅读辅助；**所有数字以事实层章节为准**，AI 不修改指标。\n\n",
        );
        full_md.push_str(&ai_body);
        full_md.push('\n');

        let rid = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp_millis();
        c.execute(
            "DELETE FROM daily_reports WHERE report_date = ?1 AND report_type = 'ai_enhanced'",
            [&date],
        )
        .map_err(|e| e.to_string())?;
        c.execute(
            "INSERT INTO daily_reports (id, analysis_id, report_date, generated_at_ms, report_type, content_md, ai_model, ai_prompt_hash) \
             VALUES (?1, ?2, ?3, ?4, 'ai_enhanced', ?5, ?6, ?7)",
            params![rid, row.id, date, now, full_md, model, prompt_hash],
        )
        .map_err(|e| e.to_string())?;
        return Ok(DailyReportDto {
            id: rid,
            report_date: date,
            report_type: "ai_enhanced".into(),
            content_md: full_md,
            generated_at_ms: now,
            ai_model: Some(model),
            ai_prompt_hash: Some(prompt_hash),
        });
    }
    let c = open_db_rw(&state.0.paths.db_path)?;
    let row: DailyAnalysisDto = c
        .query_row(
            "SELECT id, analysis_date, generated_at_ms, version, total_active_ms, intent_breakdown, top_apps, \
             total_switches, switches_per_hour, top_switch_pairs, deep_work_segments, deep_work_total_ms, \
             fragmentation_pct, notification_count, top_interrupters, interrupts_in_deep, avg_kpm, kpm_by_hour, \
             avg_delete_ratio, flow_score_avg, struggle_score_avg, clipboard_pairs, top_flows, scene_breakdown, \
             degraded_sections \
             FROM daily_analysis WHERE analysis_date = ?1",
            [&date],
            |r| {
                Ok(DailyAnalysisDto {
                    id: r.get(0)?,
                    analysis_date: r.get(1)?,
                    generated_at_ms: r.get(2)?,
                    version: r.get(3)?,
                    total_active_ms: r.get(4)?,
                    intent_breakdown: r.get(5)?,
                    top_apps: r.get(6)?,
                    total_switches: r.get(7)?,
                    switches_per_hour: r.get(8)?,
                    top_switch_pairs: r.get(9)?,
                    deep_work_segments: r.get(10)?,
                    deep_work_total_ms: r.get(11)?,
                    fragmentation_pct: r.get(12)?,
                    notification_count: r.get(13)?,
                    top_interrupters: r.get(14)?,
                    interrupts_in_deep: r.get(15)?,
                    avg_kpm: r.get(16)?,
                    kpm_by_hour: r.get(17)?,
                    avg_delete_ratio: r.get(18)?,
                    flow_score_avg: r.get(19)?,
                    struggle_score_avg: r.get(20)?,
                    clipboard_pairs: r.get(21)?,
                    top_flows: r.get(22)?,
                    scene_breakdown: r.get(23)?,
                    degraded_sections: r.get(24)?,
                })
            },
        )
        .map_err(|_| "请先生成当日 daily_analysis".to_string())?;

    let data_sources: String = c
        .query_row(
            "SELECT COALESCE(data_sources, '{}') FROM daily_analysis WHERE analysis_date = ?1",
            [&date],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "{}".to_string());

    let md = build_fact_only_markdown(
        &row.analysis_date,
        row.total_active_ms,
        &row.intent_breakdown,
        &row.top_apps,
        row.total_switches,
        &row.switches_per_hour,
        &row.top_switch_pairs,
        row.deep_work_total_ms,
        row.fragmentation_pct,
        row.notification_count,
        &row.top_interrupters,
        row.interrupts_in_deep,
        &data_sources,
        row.avg_kpm,
        &row.kpm_by_hour,
        row.avg_delete_ratio,
        row.flow_score_avg,
        row.struggle_score_avg,
        &row.degraded_sections,
        row.clipboard_pairs,
        row.top_flows.as_deref(),
        row.scene_breakdown.as_deref(),
    );
    let rid = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp_millis();
    c.execute(
        "DELETE FROM daily_reports WHERE report_date = ?1 AND report_type = 'fact_only'",
        [&date],
    )
    .map_err(|e| e.to_string())?;
    c.execute(
        "INSERT INTO daily_reports (id, analysis_id, report_date, generated_at_ms, report_type, content_md) \
         VALUES (?1, ?2, ?3, ?4, 'fact_only', ?5)",
        params![rid, row.id, date, now, md],
    )
    .map_err(|e| e.to_string())?;
    Ok(DailyReportDto {
        id: rid,
        report_date: date,
        report_type: "fact_only".into(),
        content_md: md,
        generated_at_ms: now,
        ai_model: None,
        ai_prompt_hash: None,
    })
}

#[tauri::command]
pub fn get_daily_report(
    state: State<'_, AppState>,
    date: String,
    report_type: Option<String>,
) -> Result<Option<DailyReportDto>, String> {
    let t = report_type.unwrap_or_else(|| "fact_only".into());
    let conn = state.0.read_conn.lock();
    let row = conn
        .query_row(
            "SELECT id, report_date, report_type, content_md, generated_at_ms, ai_model, ai_prompt_hash FROM daily_reports \
             WHERE report_date = ?1 AND report_type = ?2 ORDER BY generated_at_ms DESC LIMIT 1",
            rusqlite::params![date, t],
            |r| {
                Ok(DailyReportDto {
                    id: r.get(0)?,
                    report_date: r.get(1)?,
                    report_type: r.get(2)?,
                    content_md: r.get(3)?,
                    generated_at_ms: r.get(4)?,
                    ai_model: r.get(5)?,
                    ai_prompt_hash: r.get(6)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(row)
}

#[tauri::command]
pub fn export_daily_report(
    state: State<'_, AppState>,
    date: String,
    report_type: Option<String>,
) -> Result<String, String> {
    let t = report_type.unwrap_or_else(|| "fact_only".into());
    let conn = state.0.read_conn.lock();
    let content: String = conn
        .query_row(
            "SELECT content_md FROM daily_reports WHERE report_date = ?1 AND report_type = ?2 \
             ORDER BY generated_at_ms DESC LIMIT 1",
            rusqlite::params![date, t],
            |r| r.get(0),
        )
        .map_err(|_| "没有可导出的报告".to_string())?;
    drop(conn);
    fs::create_dir_all(&state.0.paths.exports_dir).map_err(|e| e.to_string())?;
    let suffix = if t == "ai_enhanced" { "-ai" } else { "" };
    let path = state
        .0
        .paths
        .exports_dir
        .join(format!("timelens-recap-{date}{suffix}.md"));
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrSettingsDto {
    pub privacy_acknowledged: bool,
    pub enabled: bool,
    pub allow_export_to_ai: bool,
    pub show_session_summary: bool,
    pub pipeline: crate::core::ocr::OcrPipelineConfig,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrStatusDto {
    pub enabled: bool,
    pub last_success_ms: Option<i64>,
    pub pending_jobs: usize,
    pub last_error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionOcrContextDto {
    pub summary_line: Option<String>,
    pub summary_source: Option<String>,
    pub empty_reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrSearchHit {
    pub snapshot_id: String,
    pub session_id: String,
    pub captured_at_ms: i64,
    /// FTS5 `snippet`：以 « » 标出匹配片段（若引擎未返回则为空串）。
    pub matched_snippet: String,
    /// 该帧脱敏后的整段 OCR（截断至 `OCR_FULL_TEXT_MAX_CHARS`）；无则 null。
    pub full_ocr_text: Option<String>,
    /// 实际参与 AND 检索的关键词（与输入顺序一致，已去重）。
    pub matched_keywords: Vec<String>,
    pub app_name: String,
    pub window_title: String,
    pub session_intent: Option<String>,
}

#[tauri::command]
pub fn get_ocr_settings(state: State<'_, AppState>) -> Result<OcrSettingsDto, String> {
    let conn = state.0.read_conn.lock();
    let pipeline = settings::get_ocr_pipeline_config(&conn);
    Ok(OcrSettingsDto {
        privacy_acknowledged: settings::get_ocr_privacy_acknowledged(&conn),
        enabled: state.0.ocr_enabled.load(Ordering::Relaxed),
        allow_export_to_ai: settings::get_ocr_allow_export_to_ai(&conn),
        show_session_summary: settings::get_ocr_show_session_summary(&conn),
        pipeline,
    })
}

#[tauri::command]
pub fn set_ocr_privacy_acknowledged(
    state: State<'_, AppState>,
    acknowledged: bool,
) -> Result<(), String> {
    let mut c = open_db_rw(&state.0.paths.db_path)?;
    settings::set_ocr_privacy_acknowledged(&mut c, acknowledged).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_ocr_settings(
    state: State<'_, AppState>,
    enabled: Option<bool>,
    allow_export_to_ai: Option<bool>,
    show_session_summary: Option<bool>,
    ocr_languages: Option<String>,
    ocr_psm: Option<i32>,
    ocr_word_conf_min: Option<f32>,
    ocr_line_conf_min: Option<f32>,
    ocr_preprocess_scale: Option<bool>,
    ocr_preprocess_dark_invert: Option<bool>,
) -> Result<OcrSettingsDto, String> {
    let mut c = open_db_rw(&state.0.paths.db_path)?;
    if let Some(v) = enabled {
        if v && !settings::get_ocr_privacy_acknowledged(&c) {
            return Err("请先阅读并确认 OCR 说明（设置页）".into());
        }
        settings::set_ocr_enabled(&mut c, v).map_err(|e| e.to_string())?;
        state.0.ocr_enabled.store(v, Ordering::Relaxed);
    }
    if let Some(v) = allow_export_to_ai {
        settings::set_ocr_allow_export_to_ai(&mut c, v).map_err(|e| e.to_string())?;
    }
    if let Some(v) = show_session_summary {
        settings::set_ocr_show_session_summary(&mut c, v).map_err(|e| e.to_string())?;
    }
    settings::apply_ocr_pipeline_overrides(
        &mut c,
        ocr_languages.as_deref(),
        ocr_psm,
        ocr_word_conf_min,
        ocr_line_conf_min,
        ocr_preprocess_scale,
        ocr_preprocess_dark_invert,
    )
    .map_err(|e| e.to_string())?;
    drop(c);
    get_ocr_settings(state)
}

#[tauri::command]
pub fn get_ocr_status(state: State<'_, AppState>) -> Result<OcrStatusDto, String> {
    let conn = state.0.read_conn.lock();
    let last_db = max_ts(
        &conn,
        "SELECT MAX(processed_at_ms) FROM snapshot_ocr WHERE status = 'ok' AND redacted = 0 \
         AND length(trim(COALESCE(ocr_text,''))) > 0",
    );
    let last_atomic = state.0.ocr_last_success_ms.load(Ordering::Relaxed);
    let last_success_ms = match (last_db, last_atomic >= 0) {
        (Some(db), true) => Some(db.max(last_atomic)),
        (Some(db), false) => Some(db),
        (None, true) => Some(last_atomic),
        _ => None,
    };
    let last_error = state.0.ocr_last_error.lock().clone();
    Ok(OcrStatusDto {
        enabled: state.0.ocr_enabled.load(Ordering::Relaxed),
        last_success_ms,
        pending_jobs: state.0.ocr_pending.load(Ordering::Relaxed),
        last_error,
    })
}

#[tauri::command]
pub fn get_session_ocr_context(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<SessionOcrContextDto, String> {
    let conn = state.0.read_conn.lock();
    let app_name: String = conn
        .query_row(
            "SELECT app_name FROM window_sessions WHERE id = ?1",
            [&session_id],
            |r| r.get(0),
        )
        .map_err(|_| "会话不存在".to_string())?;
    let bl = settings::get_app_blacklist(&conn);
    if settings::app_name_blacklisted(&app_name, &bl) {
        return Ok(SessionOcrContextDto {
            summary_line: None,
            summary_source: None,
            empty_reason: Some("应用位于采集黑名单，未进行 OCR".into()),
        });
    }
    if !state.0.ocr_enabled.load(Ordering::Relaxed) {
        return Ok(SessionOcrContextDto {
            summary_line: None,
            summary_source: None,
            empty_reason: Some("OCR 已关闭".into()),
        });
    }
    let row = conn
        .query_row(
            "SELECT summary_line, summary_source, empty_reason FROM session_ocr_context WHERE session_id = ?1",
            [&session_id],
            |r| {
                Ok((
                    r.get::<_, Option<String>>(0)?,
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some((sl, ss, er)) = row {
        let empty = sl.as_ref().map(|s| s.trim().is_empty()).unwrap_or(true);
        if empty {
            return Ok(SessionOcrContextDto {
                summary_line: None,
                summary_source: ss,
                empty_reason: er.or_else(|| Some("暂无来自屏幕文字的摘要".into())),
            });
        }
        return Ok(SessionOcrContextDto {
            summary_line: sl,
            summary_source: ss,
            empty_reason: er,
        });
    }
    Ok(SessionOcrContextDto {
        summary_line: None,
        summary_source: None,
        empty_reason: Some("尚未处理到可用 OCR 摘要".into()),
    })
}

#[tauri::command]
pub fn search_ocr_text(
    state: State<'_, AppState>,
    query: String,
    date: Option<String>,
    restrict_session_id: Option<String>,
) -> Result<Vec<OcrSearchHit>, String> {
    let tokens = parse_ocr_search_keywords(&query)?;
    let keywords_display: Vec<String> = tokens
        .iter()
        .map(|t| t.replace("\"\"", "\""))
        .collect();
    let match_expr = build_ocr_fts_and_expr(&tokens);
    let conn = state.0.read_conn.lock();
    let bl = settings::get_app_blacklist(&conn);

    let map_row = |r: &rusqlite::Row| -> rusqlite::Result<OcrSearchHit> {
        let full: Option<String> = r.get(4)?;
        let full_trim = full.and_then(|s| {
            let t = s.trim();
            if t.is_empty() {
                None
            } else {
                Some(truncate_chars(t, OCR_FULL_TEXT_MAX_CHARS))
            }
        });
        Ok(OcrSearchHit {
            snapshot_id: r.get(0)?,
            session_id: r.get(1)?,
            captured_at_ms: r.get(2)?,
            matched_snippet: r.get::<_, Option<String>>(3)?.unwrap_or_default(),
            full_ocr_text: full_trim,
            matched_keywords: keywords_display.clone(),
            app_name: r.get(5)?,
            window_title: r.get(6)?,
            session_intent: r.get(7)?,
        })
    };

    let mut hits: Vec<OcrSearchHit> = if let Some(d) = date {
        let (start, end) = local_day_bounds_ms(&d)?;
        if let Some(ref sid) = restrict_session_id {
            let mut stmt = conn
                .prepare(
                    "SELECT fts.snapshot_id, fts.session_id, fts.captured_at_ms, \
                     snippet(snapshot_ocr_fts, 3, '«', '»', ' … ', 20), \
                     o.ocr_text, ws.app_name, ws.window_title, ws.intent \
                     FROM snapshot_ocr_fts AS fts \
                     INNER JOIN snapshot_ocr o ON o.snapshot_id = fts.snapshot_id \
                     INNER JOIN window_sessions ws ON ws.id = fts.session_id \
                     WHERE snapshot_ocr_fts MATCH ?1 \
                       AND fts.captured_at_ms >= ?2 AND fts.captured_at_ms <= ?3 \
                       AND fts.session_id = ?4 \
                       AND o.status = 'ok' AND o.redacted = 0 \
                     LIMIT 50",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![match_expr, start, end, sid], map_row)
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
        } else {
            let mut stmt = conn
                .prepare(
                    "SELECT fts.snapshot_id, fts.session_id, fts.captured_at_ms, \
                     snippet(snapshot_ocr_fts, 3, '«', '»', ' … ', 20), \
                     o.ocr_text, ws.app_name, ws.window_title, ws.intent \
                     FROM snapshot_ocr_fts AS fts \
                     INNER JOIN snapshot_ocr o ON o.snapshot_id = fts.snapshot_id \
                     INNER JOIN window_sessions ws ON ws.id = fts.session_id \
                     WHERE snapshot_ocr_fts MATCH ?1 \
                       AND fts.captured_at_ms >= ?2 AND fts.captured_at_ms <= ?3 \
                       AND o.status = 'ok' AND o.redacted = 0 \
                     LIMIT 50",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![match_expr, start, end], map_row)
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
        }
    } else if let Some(ref sid) = restrict_session_id {
        let mut stmt = conn
            .prepare(
                "SELECT fts.snapshot_id, fts.session_id, fts.captured_at_ms, \
                 snippet(snapshot_ocr_fts, 3, '«', '»', ' … ', 20), \
                 o.ocr_text, ws.app_name, ws.window_title, ws.intent \
                 FROM snapshot_ocr_fts AS fts \
                 INNER JOIN snapshot_ocr o ON o.snapshot_id = fts.snapshot_id \
                 INNER JOIN window_sessions ws ON ws.id = fts.session_id \
                 WHERE snapshot_ocr_fts MATCH ?1 AND fts.session_id = ?2 \
                   AND o.status = 'ok' AND o.redacted = 0 \
                 LIMIT 50",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![match_expr, sid], map_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT fts.snapshot_id, fts.session_id, fts.captured_at_ms, \
                 snippet(snapshot_ocr_fts, 3, '«', '»', ' … ', 20), \
                 o.ocr_text, ws.app_name, ws.window_title, ws.intent \
                 FROM snapshot_ocr_fts AS fts \
                 INNER JOIN snapshot_ocr o ON o.snapshot_id = fts.snapshot_id \
                 INNER JOIN window_sessions ws ON ws.id = fts.session_id \
                 WHERE snapshot_ocr_fts MATCH ?1 AND o.status = 'ok' AND o.redacted = 0 \
                 LIMIT 50",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([&match_expr], map_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    hits.retain(|h| !settings::app_name_blacklisted(&h.app_name, &bl));
    Ok(hits)
}

fn truncate_chars(s: &str, max_chars: usize) -> String {
    let mut out = String::new();
    for (i, ch) in s.chars().enumerate() {
        if i >= max_chars {
            out.push('…');
            break;
        }
        out.push(ch);
    }
    out
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrEvalSampleRowDto {
    pub snapshot_id: String,
    pub session_id: String,
    pub captured_at_ms: i64,
    pub app_name: String,
    pub window_title: String,
    pub file_path: String,
    pub ocr_status: Option<String>,
    pub ocr_text_preview: Option<String>,
    pub ocr_meta: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrEvaluateSnapshotDto {
    pub snapshot_id: String,
    pub ok: bool,
    pub error_message: Option<String>,
    pub duration_ms: u64,
    pub pipeline: OcrPipelineConfig,
    pub final_text: String,
    pub summary_line: Option<String>,
    pub gated_preview: String,
    pub lines: Vec<OcrLineEval>,
    pub ocr_meta: Option<String>,
}

/// 最近截图 + 已有 OCR 状态，供「OCR 效果评估」页列表。
#[tauri::command]
pub fn list_ocr_eval_samples(
    state: State<'_, AppState>,
    limit: Option<i32>,
) -> Result<Vec<OcrEvalSampleRowDto>, String> {
    let lim = limit.unwrap_or(40).clamp(5, 200);
    let conn = state.0.read_conn.lock();
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.session_id, s.captured_at_ms, s.file_path, \
                    ws.app_name, ws.window_title, o.status, o.ocr_text, o.ocr_meta \
             FROM snapshots s \
             INNER JOIN window_sessions ws ON ws.id = s.session_id \
             LEFT JOIN snapshot_ocr o ON o.snapshot_id = s.id \
             ORDER BY s.captured_at_ms DESC \
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([lim], |r| {
            let text: Option<String> = r.get(7)?;
            let preview = text.and_then(|s| {
                let t = s.trim();
                if t.is_empty() {
                    None
                } else {
                    Some(truncate_chars(t, 120))
                }
            });
            Ok(OcrEvalSampleRowDto {
                snapshot_id: r.get(0)?,
                session_id: r.get(1)?,
                captured_at_ms: r.get(2)?,
                file_path: r.get(3)?,
                app_name: r.get(4)?,
                window_title: r.get(5)?,
                ocr_status: r.get(6)?,
                ocr_text_preview: preview,
                ocr_meta: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// 对单帧重新跑本地 OCR 管线（不写入数据库），返回行级闸门明细。
#[tauri::command]
pub fn evaluate_ocr_snapshot(
    state: State<'_, AppState>,
    snapshot_id: String,
) -> Result<OcrEvaluateSnapshotDto, String> {
    let path: String = {
        let conn = state.0.read_conn.lock();
        conn.query_row(
            "SELECT file_path FROM snapshots WHERE id = ?1",
            [&snapshot_id],
            |r| r.get(0),
        )
        .map_err(|_| "找不到截图".to_string())?
    };
    if path.trim().is_empty() {
        return Err("截图路径为空".into());
    }
    let pipeline = {
        let c = state.0.read_conn.lock();
        settings::get_ocr_pipeline_config(&c)
    };
    let pipeline_err = pipeline.clone();
    let t0 = Instant::now();
    let res = crate::core::ocr::ocr_image_file(Path::new(&path), &pipeline);
    let duration_ms = t0.elapsed().as_millis() as u64;
    match res {
        Ok(out) => Ok(OcrEvaluateSnapshotDto {
            snapshot_id: snapshot_id.clone(),
            ok: true,
            error_message: None,
            duration_ms,
            pipeline,
            final_text: out.text,
            summary_line: out.summary,
            gated_preview: out.gated_preview,
            lines: out.lines_detail,
            ocr_meta: out.ocr_meta,
        }),
        Err(e) => Ok(OcrEvaluateSnapshotDto {
            snapshot_id,
            ok: false,
            error_message: Some(e),
            duration_ms,
            pipeline: pipeline_err,
            final_text: String::new(),
            summary_line: None,
            gated_preview: String::new(),
            lines: vec![],
            ocr_meta: None,
        }),
    }
}

#[cfg(test)]
mod ocr_search_kw_tests {
    use super::{build_ocr_fts_and_expr, parse_ocr_search_keywords};
    use rusqlite::Connection;

    /// SQLite FTS5：`FROM snapshot_ocr_fts AS fts` 时 `WHERE fts MATCH` 会报 no such column: fts。
    #[test]
    fn fts5_match_must_use_virtual_table_name_not_alias() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE VIRTUAL TABLE snapshot_ocr_fts USING fts5(
                snapshot_id UNINDEXED,
                session_id UNINDEXED,
                captured_at_ms UNINDEXED,
                body
            );
            INSERT INTO snapshot_ocr_fts(snapshot_id, session_id, captured_at_ms, body)
            VALUES ('s1','sess',1,'hello world');",
        )
        .unwrap();
        let bad = conn.prepare(
            "SELECT 1 FROM snapshot_ocr_fts AS fts WHERE fts MATCH 'hello' LIMIT 1",
        );
        assert!(bad.is_err(), "alias MATCH should fail");
        let good: i32 = conn
            .query_row(
                "SELECT 1 FROM snapshot_ocr_fts AS fts WHERE snapshot_ocr_fts MATCH 'hello' LIMIT 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(good, 1);
    }

    #[test]
    fn parse_multi_and_dedup() {
        let v = parse_ocr_search_keywords("  foo  bar   foo ").unwrap();
        assert_eq!(v, vec!["foo", "bar"]);
        assert_eq!(
            build_ocr_fts_and_expr(&v),
            "body: \"foo\" AND body: \"bar\""
        );
    }

    #[test]
    fn parse_comma_cn() {
        let v = parse_ocr_search_keywords("发票，订单").unwrap();
        assert_eq!(v.len(), 2);
    }
}
