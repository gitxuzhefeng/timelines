//! Phase 11: 智能提醒与每日摘要引擎。
//!
//! 单一后台线程，10 秒轮询：
//! - 久坐提醒（连续工作 > 阈值）
//! - 碎片化预警（窗口内 app_switches 超阈值）
//! - 深度工作标记（同一 session 持续 > 阈值）
//! - 每日摘要推送（到点触发）
//!
//! 通知通过原生 shell 命令发出（macOS osascript / Windows PowerShell），
//! 同时 Tauri 事件通道 emit 给前端。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use chrono::{Local, NaiveDate, Utc};
use log::{debug, warn};
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::json;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::core::models::{NudgeLogRow, WriteEvent};
use crate::core::settings;
use crate::core::writer::WriterHandle;

const POLL_SECS: u64 = 10;
const REST_COOLDOWN_MS: i64 = 10 * 60 * 1000;
const FRAG_COOLDOWN_MS: i64 = 5 * 60 * 1000;
const DEEP_WORK_COOLDOWN_MS: i64 = 30 * 60 * 1000;
const DIGEST_WINDOW_SECS: i64 = 90; // ±90s 内 HH:MM 匹配视为命中

/// 启动智能提醒后台线程。
#[allow(clippy::too_many_arguments)]
pub fn spawn_nudge_thread(
    app: AppHandle,
    read_conn: Arc<Mutex<Connection>>,
    writer: WriterHandle,
    tracking: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
    is_afk: Arc<AtomicBool>,
    _current_session: Arc<std::sync::RwLock<Option<String>>>,
    nudge_enabled: Arc<AtomicBool>,
) {
    thread::spawn(move || {
        let mut state = NudgeState::default();
        while running.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_secs(POLL_SECS));
            if !running.load(Ordering::Relaxed) {
                break;
            }

            // 总开关 + tracking + 非 AFK 才发提醒。
            if !nudge_enabled.load(Ordering::Relaxed) {
                continue;
            }
            if !tracking.load(Ordering::Relaxed) {
                state.continuous_work_start_ms = None;
                continue;
            }
            if is_afk.load(Ordering::Relaxed) {
                state.continuous_work_start_ms = None;
                continue;
            }

            if let Err(e) = tick_nudges(&app, &read_conn, &writer, &mut state) {
                warn!("nudge: tick failed: {e}");
            }

            if let Err(e) = tick_daily_digest(&app, &read_conn, &writer, &mut state) {
                warn!("nudge: digest tick failed: {e}");
            }
        }
    });
}

#[derive(Default)]
struct NudgeState {
    continuous_work_start_ms: Option<i64>,
    last_rest_at_ms: i64,
    last_frag_at_ms: i64,
    last_deep_work_at_ms: i64,
    last_digest_date: Option<NaiveDate>,
}

fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

fn current_lang(conn: &Mutex<Connection>) -> String {
    let g = conn.lock();
    settings::get_language(&g)
}

fn tick_nudges(
    app: &AppHandle,
    read_conn: &Mutex<Connection>,
    writer: &WriterHandle,
    state: &mut NudgeState,
) -> Result<(), String> {
    let cfg = {
        let g = read_conn.lock();
        settings::get_nudge_config(&g)
    };
    if !cfg.enabled {
        return Ok(());
    }
    let now = now_ms();
    let lang = current_lang(read_conn);

    // 1) 久坐提醒：用最近 raw_events 判断是否一直活跃。
    if state.continuous_work_start_ms.is_none() {
        state.continuous_work_start_ms = Some(now);
    }
    let start = state.continuous_work_start_ms.unwrap_or(now);
    let elapsed_min = (now - start) / 60_000;
    if elapsed_min >= cfg.rest_minutes as i64
        && now - state.last_rest_at_ms > REST_COOLDOWN_MS
    {
        let (title, body) = rest_text(&lang, elapsed_min);
        send_native_notification(&title, &body);
        let _ = app.emit(
            "nudge_rest",
            json!({"elapsedMin": elapsed_min, "title": title, "body": body}),
        );
        log_nudge(
            writer,
            "rest_reminder",
            json!({"elapsed_min": elapsed_min, "threshold_min": cfg.rest_minutes}),
        );
        state.last_rest_at_ms = now;
        state.continuous_work_start_ms = Some(now);
    }

    // 2) 碎片化预警
    let window_ms = (cfg.frag_window_min as i64) * 60_000;
    let switch_count = {
        let g = read_conn.lock();
        g.query_row(
            "SELECT COUNT(*) FROM app_switches WHERE timestamp_ms > ?1",
            params![now - window_ms],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0)
    };
    if switch_count >= cfg.frag_threshold as i64
        && now - state.last_frag_at_ms > FRAG_COOLDOWN_MS
    {
        let (title, body) = frag_text(&lang, switch_count, cfg.frag_window_min);
        send_native_notification(&title, &body);
        let _ = app.emit(
            "nudge_fragmentation",
            json!({"switchCount": switch_count, "windowMin": cfg.frag_window_min}),
        );
        log_nudge(
            writer,
            "fragmentation_alert",
            json!({"switch_count": switch_count, "window_min": cfg.frag_window_min}),
        );
        state.last_frag_at_ms = now;
    }

    // 3) 深度工作标记
    let (cur_app, cur_dur_min): (Option<String>, i64) = {
        let g = read_conn.lock();
        g.query_row(
            "SELECT app_name, (?1 - start_ms) / 60000 FROM window_sessions
             WHERE end_ms IS NULL OR end_ms = 0
             ORDER BY start_ms DESC LIMIT 1",
            params![now],
            |r| Ok((r.get::<_, String>(0).ok(), r.get::<_, i64>(1).unwrap_or(0))),
        )
        .unwrap_or((None, 0))
    };
    if cur_dur_min >= cfg.deep_work_minutes as i64
        && now - state.last_deep_work_at_ms > DEEP_WORK_COOLDOWN_MS
    {
        let (title, body) = deep_work_text(&lang, cur_app.as_deref().unwrap_or("-"), cur_dur_min);
        send_native_notification(&title, &body);
        let _ = app.emit(
            "nudge_deep_work",
            json!({
                "app": cur_app,
                "elapsedMin": cur_dur_min,
                "dnd": cfg.deep_work_dnd
            }),
        );
        log_nudge(
            writer,
            "deep_work_marker",
            json!({"app": cur_app, "elapsed_min": cur_dur_min}),
        );
        state.last_deep_work_at_ms = now;
    }

    Ok(())
}

fn tick_daily_digest(
    app: &AppHandle,
    read_conn: &Mutex<Connection>,
    writer: &WriterHandle,
    state: &mut NudgeState,
) -> Result<(), String> {
    let cfg = {
        let g = read_conn.lock();
        settings::get_digest_config(&g)
    };
    if !cfg.enabled {
        return Ok(());
    }
    let now_local = Local::now();
    let today = now_local.date_naive();
    if state.last_digest_date == Some(today) {
        return Ok(());
    }
    let (h, m) = parse_hhmm(&cfg.time).unwrap_or((18, 0));
    let target = now_local
        .date_naive()
        .and_hms_opt(h, m, 0)
        .and_then(|nd| Local.from_local_datetime(&nd).single())
        .ok_or_else(|| "build local time failed".to_string())?;
    let diff = (now_local - target).num_seconds().abs();
    if diff > DIGEST_WINDOW_SECS {
        return Ok(());
    }

    let date_str = today.format("%Y-%m-%d").to_string();
    let lang = current_lang(read_conn);
    let summary = build_digest_summary(read_conn, &date_str, &lang);
    let (title, body) = digest_text(&lang, &summary);
    send_native_notification(&title, &body);
    let _ = app.emit(
        "nudge_daily_digest",
        json!({"date": date_str, "title": title, "body": body, "summary": summary}),
    );
    log_nudge(
        writer,
        "daily_digest",
        json!({"date": date_str, "summary": summary}),
    );
    state.last_digest_date = Some(today);
    Ok(())
}

use chrono::TimeZone;

#[derive(Debug, Clone, serde::Serialize)]
struct DigestSummary {
    active_minutes: i64,
    deep_work_minutes: i64,
    flow_score: Option<f64>,
    top_apps: Vec<String>,
}

fn build_digest_summary(read_conn: &Mutex<Connection>, date: &str, _lang: &str) -> DigestSummary {
    let g = read_conn.lock();
    let row: Option<(Option<i64>, Option<i64>, Option<f64>, Option<String>)> = g
        .query_row(
            "SELECT total_active_ms, deep_work_total_ms, flow_score_avg, top_apps
             FROM daily_analysis WHERE analysis_date = ?1",
            [date],
            |r| {
                Ok((
                    r.get::<_, Option<i64>>(0)?,
                    r.get::<_, Option<i64>>(1)?,
                    r.get::<_, Option<f64>>(2)?,
                    r.get::<_, Option<String>>(3)?,
                ))
            },
        )
        .optional()
        .unwrap_or(None);
    let (active_ms, dw_ms, flow, top_apps_json) = row.unwrap_or((None, None, None, None));
    let top_apps: Vec<String> = top_apps_json
        .and_then(|j| serde_json::from_str::<Vec<serde_json::Value>>(&j).ok())
        .unwrap_or_default()
        .iter()
        .take(3)
        .filter_map(|v| {
            v.get("app")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string())
        })
        .collect();
    DigestSummary {
        active_minutes: active_ms.unwrap_or(0) / 60_000,
        deep_work_minutes: dw_ms.unwrap_or(0) / 60_000,
        flow_score: flow,
        top_apps,
    }
}

// === 文案（中英） ===

fn rest_text(lang: &str, mins: i64) -> (String, String) {
    if lang == "zh-CN" {
        (
            "TimeLens · 久坐提醒".to_string(),
            format!("已经连续工作 {mins} 分钟，建议起身活动 5 分钟。"),
        )
    } else {
        (
            "TimeLens · Rest reminder".to_string(),
            format!("You've been working for {mins} min — try a 5-min break."),
        )
    }
}

fn frag_text(lang: &str, count: i64, window: u32) -> (String, String) {
    if lang == "zh-CN" {
        (
            "TimeLens · 注意力分散".to_string(),
            format!("最近 {window} 分钟内切换了 {count} 次应用，可考虑专注一段时间。"),
        )
    } else {
        (
            "TimeLens · Fragmentation alert".to_string(),
            format!("Switched apps {count} times in the last {window} min — consider focusing."),
        )
    }
}

fn deep_work_text(lang: &str, app: &str, mins: i64) -> (String, String) {
    if lang == "zh-CN" {
        (
            "TimeLens · 深度工作".to_string(),
            format!("已在 {app} 中持续 {mins} 分钟，状态不错，请保持。"),
        )
    } else {
        (
            "TimeLens · Deep work".to_string(),
            format!("Focused in {app} for {mins} min — keep going."),
        )
    }
}

fn digest_text(lang: &str, s: &DigestSummary) -> (String, String) {
    let top = if s.top_apps.is_empty() {
        "-".to_string()
    } else {
        s.top_apps.join(" / ")
    };
    let flow = s
        .flow_score
        .map(|f| format!("{:.0}", f * 100.0))
        .unwrap_or_else(|| "-".to_string());
    if lang == "zh-CN" {
        (
            "TimeLens · 今日摘要".to_string(),
            format!(
                "活跃 {}h{}m · 深度 {}h{}m · 心流 {} · Top: {}",
                s.active_minutes / 60,
                s.active_minutes % 60,
                s.deep_work_minutes / 60,
                s.deep_work_minutes % 60,
                flow,
                top
            ),
        )
    } else {
        (
            "TimeLens · Daily digest".to_string(),
            format!(
                "Active {}h{}m · Deep {}h{}m · Flow {} · Top: {}",
                s.active_minutes / 60,
                s.active_minutes % 60,
                s.deep_work_minutes / 60,
                s.deep_work_minutes % 60,
                flow,
                top
            ),
        )
    }
}

// === 工具 ===

fn parse_hhmm(s: &str) -> Option<(u32, u32)> {
    let t = s.trim();
    if t.len() != 5 || t.as_bytes()[2] != b':' {
        return None;
    }
    let h: u32 = t[0..2].parse().ok()?;
    let m: u32 = t[3..5].parse().ok()?;
    if h < 24 && m < 60 {
        Some((h, m))
    } else {
        None
    }
}

fn log_nudge(writer: &WriterHandle, nudge_type: &str, payload: serde_json::Value) {
    let row = NudgeLogRow {
        id: Uuid::new_v4().to_string(),
        timestamp_ms: now_ms(),
        nudge_type: nudge_type.to_string(),
        payload_json: Some(payload.to_string()),
        dismissed: 0,
    };
    let _ = writer.try_send(WriteEvent::NudgeLog(row));
}

// === 原生通知（shell 调用，零新依赖） ===

#[cfg(target_os = "macos")]
fn send_native_notification(title: &str, body: &str) {
    use std::process::Command;
    let escaped_title = title.replace('"', "'");
    let escaped_body = body.replace('"', "'");
    let script = format!(
        "display notification \"{escaped_body}\" with title \"{escaped_title}\""
    );
    let _ = Command::new("osascript").arg("-e").arg(&script).status();
    debug!("nudge: notify '{title}' / '{body}'");
}

#[cfg(target_os = "windows")]
fn send_native_notification(title: &str, body: &str) {
    use std::process::Command;
    let escaped_title = title.replace('"', "''").replace('`', "");
    let escaped_body = body.replace('"', "''").replace('`', "");
    // 使用 Windows 内置 Toast XML（不依赖第三方模块）
    let ps = format!(
        r#"
$ErrorActionPreference = 'SilentlyContinue'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
$xml = '<toast><visual><binding template="ToastGeneric"><text>{title}</text><text>{body}</text></binding></visual></toast>'
$doc = New-Object Windows.Data.Xml.Dom.XmlDocument
$doc.LoadXml($xml)
$toast = [Windows.UI.Notifications.ToastNotification]::new($doc)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('TimeLens').Show($toast)
"#,
        title = escaped_title,
        body = escaped_body
    );
    let _ = Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps])
        .status();
    debug!("nudge: notify '{title}' / '{body}'");
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn send_native_notification(title: &str, body: &str) {
    debug!("nudge: notify (noop on this platform) '{title}' / '{body}'");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::storage::migrations::run_migrations;

    fn setup_db() -> Connection {
        let mut c = Connection::open_in_memory().unwrap();
        run_migrations(&mut c).unwrap();
        c
    }

    #[test]
    fn parse_hhmm_basic() {
        assert_eq!(parse_hhmm("18:00"), Some((18, 0)));
        assert_eq!(parse_hhmm("00:00"), Some((0, 0)));
        assert_eq!(parse_hhmm("23:59"), Some((23, 59)));
        assert!(parse_hhmm("24:00").is_none());
        assert!(parse_hhmm("18:60").is_none());
        assert!(parse_hhmm("garbage").is_none());
    }

    #[test]
    fn nudge_log_insert() {
        let c = setup_db();
        c.execute(
            "INSERT INTO nudge_log (id, timestamp_ms, nudge_type, payload_json, dismissed)
             VALUES ('n1', 1000, 'rest_reminder', '{}', 0)",
            [],
        )
        .unwrap();
        let n: i64 = c
            .query_row("SELECT COUNT(*) FROM nudge_log", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
    }
}
