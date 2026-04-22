//! Phase 11: 智能提醒与专注守护引擎。
//!
//! 单一后台线程，10 秒轮询：
//! - 久坐提醒（连续工作 > 阈值）
//! - 碎片化预警（窗口内 app_switches 超阈值）
//! - 深度工作标记（同一 session 持续 > 阈值）
//! - 每日摘要推送（到点触发）
//! - 专注模式计时（到期完成）
//!
//! 通知通过原生 shell 命令发出（macOS osascript / Windows PowerShell BurntToast），
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

use crate::core::models::{FocusSessionRow, NudgeLogRow, WriteEvent};
use crate::core::settings;
use crate::core::writer::WriterHandle;

const POLL_SECS: u64 = 10;
const REST_COOLDOWN_MS: i64 = 10 * 60 * 1000;
const FRAG_COOLDOWN_MS: i64 = 5 * 60 * 1000;
const DEEP_WORK_COOLDOWN_MS: i64 = 30 * 60 * 1000;
const DIGEST_WINDOW_SECS: i64 = 90; // ±90s 内 HH:MM 匹配视为命中

/// 启动提醒/专注后台线程。
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
    focus_active: Arc<AtomicBool>,
) {
    // 启动时若有 active focus session，做恢复或补完成。
    if let Err(e) = recover_focus_on_startup(&read_conn, &writer, &focus_active, &app) {
        warn!("nudge: focus recovery failed: {e}");
    }

    thread::spawn(move || {
        let mut state = NudgeState::default();
        while running.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_secs(POLL_SECS));
            if !running.load(Ordering::Relaxed) {
                break;
            }

            // Focus 计时单独跑（不受 nudge_enabled 控制，符合 PRD：总开关不影响专注）。
            if focus_active.load(Ordering::Relaxed) {
                if let Err(e) = tick_focus_timer(&app, &read_conn, &writer, &focus_active) {
                    warn!("nudge: focus tick failed: {e}");
                }
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

// === Focus mode ===

fn recover_focus_on_startup(
    read_conn: &Mutex<Connection>,
    writer: &WriterHandle,
    focus_active: &Arc<AtomicBool>,
    app: &AppHandle,
) -> Result<(), String> {
    let (active, sid) = {
        let g = read_conn.lock();
        settings::get_focus_mode_active(&g)
    };
    if !active {
        focus_active.store(false, Ordering::Relaxed);
        return Ok(());
    }
    let Some(session_id) = sid else {
        focus_active.store(false, Ordering::Relaxed);
        return Ok(());
    };
    let row = read_focus_session(read_conn, &session_id);
    let Some(row) = row else {
        focus_active.store(false, Ordering::Relaxed);
        return Ok(());
    };
    if row.status != "active" {
        focus_active.store(false, Ordering::Relaxed);
        return Ok(());
    }
    let now = now_ms();
    let planned_end = row.start_ms + row.planned_duration_min * 60_000;
    if now >= planned_end {
        // 已超时 → 补完成
        complete_focus_session(read_conn, writer, &row, planned_end, app)?;
        focus_active.store(false, Ordering::Relaxed);
        let lang = current_lang(read_conn);
        let (title, body) =
            focus_complete_text(&lang, row.planned_duration_min, planned_end - row.start_ms);
        send_native_notification(&title, &body);
    } else {
        // 仍在期内 → 保持活跃
        focus_active.store(true, Ordering::Relaxed);
        let _ = app.emit(
            "focus_session_started",
            json!({"id": row.id, "startMs": row.start_ms, "plannedDurationMin": row.planned_duration_min}),
        );
    }
    Ok(())
}

fn tick_focus_timer(
    app: &AppHandle,
    read_conn: &Mutex<Connection>,
    writer: &WriterHandle,
    focus_active: &Arc<AtomicBool>,
) -> Result<(), String> {
    let (active, sid) = {
        let g = read_conn.lock();
        settings::get_focus_mode_active(&g)
    };
    if !active || sid.is_none() {
        focus_active.store(false, Ordering::Relaxed);
        return Ok(());
    }
    let session_id = sid.unwrap();
    let Some(row) = read_focus_session(read_conn, &session_id) else {
        focus_active.store(false, Ordering::Relaxed);
        return Ok(());
    };
    if row.status != "active" {
        focus_active.store(false, Ordering::Relaxed);
        return Ok(());
    }
    let now = now_ms();
    let planned_end = row.start_ms + row.planned_duration_min * 60_000;
    if now >= planned_end {
        complete_focus_session(read_conn, writer, &row, planned_end, app)?;
        focus_active.store(false, Ordering::Relaxed);
        let lang = current_lang(read_conn);
        let (title, body) =
            focus_complete_text(&lang, row.planned_duration_min, planned_end - row.start_ms);
        send_native_notification(&title, &body);
    }
    Ok(())
}

pub fn read_focus_session(read_conn: &Mutex<Connection>, id: &str) -> Option<FocusSessionRow> {
    let g = read_conn.lock();
    g.query_row(
        "SELECT id, start_ms, end_ms, planned_duration_min, actual_duration_ms, status, summary_json, created_at
         FROM focus_sessions WHERE id = ?1",
        [id],
        |r| {
            Ok(FocusSessionRow {
                id: r.get(0)?,
                start_ms: r.get(1)?,
                end_ms: r.get(2)?,
                planned_duration_min: r.get(3)?,
                actual_duration_ms: r.get(4)?,
                status: r.get(5)?,
                summary_json: r.get(6)?,
                created_at: r.get(7)?,
            })
        },
    )
    .optional()
    .ok()
    .flatten()
}

pub fn list_focus_sessions_for_date(
    read_conn: &Mutex<Connection>,
    date: &str,
) -> Vec<FocusSessionRow> {
    let g = read_conn.lock();
    let bounds = day_bounds_ms(date);
    let Some((s, e)) = bounds else {
        return Vec::new();
    };
    let mut stmt = match g.prepare(
        "SELECT id, start_ms, end_ms, planned_duration_min, actual_duration_ms, status, summary_json, created_at
         FROM focus_sessions WHERE start_ms >= ?1 AND start_ms < ?2 ORDER BY start_ms ASC",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let rows = stmt
        .query_map(params![s, e], |r| {
            Ok(FocusSessionRow {
                id: r.get(0)?,
                start_ms: r.get(1)?,
                end_ms: r.get(2)?,
                planned_duration_min: r.get(3)?,
                actual_duration_ms: r.get(4)?,
                status: r.get(5)?,
                summary_json: r.get(6)?,
                created_at: r.get(7)?,
            })
        })
        .ok();
    rows.map(|it| it.flatten().collect()).unwrap_or_default()
}

fn day_bounds_ms(date: &str) -> Option<(i64, i64)> {
    let nd = NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()?;
    let s = Local
        .from_local_datetime(&nd.and_hms_opt(0, 0, 0)?)
        .single()?
        .timestamp_millis();
    let e = Local
        .from_local_datetime(&nd.succ_opt()?.and_hms_opt(0, 0, 0)?)
        .single()?
        .timestamp_millis();
    Some((s, e))
}

pub fn create_focus_session(
    read_conn: &Mutex<Connection>,
    writer: &WriterHandle,
    duration_min: u32,
    focus_active: &Arc<AtomicBool>,
    app: &AppHandle,
) -> Result<FocusSessionRow, String> {
    if focus_active.load(Ordering::Relaxed) {
        return Err("focus_already_active".to_string());
    }
    let now = now_ms();
    let row = FocusSessionRow {
        id: Uuid::new_v4().to_string(),
        start_ms: now,
        end_ms: None,
        planned_duration_min: duration_min as i64,
        actual_duration_ms: None,
        status: "active".to_string(),
        summary_json: None,
        created_at: now,
    };
    writer
        .try_send(WriteEvent::FocusSession(row.clone()))
        .map_err(|_| "writer_full".to_string())?;
    {
        // 设置写入需要可写连接，这里直接通过 read_conn 内 connection 即可（settings 用 INSERT OR UPDATE，使用同一 db）。
        let mut g = read_conn.lock();
        settings::set_focus_mode_active(&mut g, true, Some(&row.id))
            .map_err(|e| format!("set_focus_active failed: {e}"))?;
    }
    focus_active.store(true, Ordering::Relaxed);
    let _ = app.emit(
        "focus_session_started",
        json!({
            "id": row.id,
            "startMs": row.start_ms,
            "plannedDurationMin": row.planned_duration_min
        }),
    );
    Ok(row)
}

pub fn stop_focus_session(
    read_conn: &Mutex<Connection>,
    writer: &WriterHandle,
    focus_active: &Arc<AtomicBool>,
    cancel: bool,
    app: &AppHandle,
) -> Result<Option<FocusSessionRow>, String> {
    let (_active, sid) = {
        let g = read_conn.lock();
        settings::get_focus_mode_active(&g)
    };
    let Some(session_id) = sid else {
        focus_active.store(false, Ordering::Relaxed);
        return Ok(None);
    };
    let Some(row) = read_focus_session(read_conn, &session_id) else {
        focus_active.store(false, Ordering::Relaxed);
        return Ok(None);
    };
    if row.status != "active" {
        focus_active.store(false, Ordering::Relaxed);
        return Ok(Some(row));
    }
    let now = now_ms();
    let updated = if cancel {
        let mut r = row.clone();
        r.end_ms = Some(now);
        r.actual_duration_ms = Some(now - row.start_ms);
        r.status = "cancelled".to_string();
        r.summary_json = Some(json!({"cancelled": true}).to_string());
        r
    } else {
        let summary = compute_focus_summary(read_conn, row.start_ms, now);
        FocusSessionRow {
            end_ms: Some(now),
            actual_duration_ms: Some(now - row.start_ms),
            status: "completed".to_string(),
            summary_json: Some(summary),
            ..row.clone()
        }
    };
    writer
        .try_send(WriteEvent::FocusSession(updated.clone()))
        .map_err(|_| "writer_full".to_string())?;
    {
        let mut g = read_conn.lock();
        settings::set_focus_mode_active(&mut g, false, None)
            .map_err(|e| format!("clear_focus_active failed: {e}"))?;
    }
    focus_active.store(false, Ordering::Relaxed);
    let _ = app.emit(
        "focus_session_ended",
        json!({
            "id": updated.id,
            "status": updated.status,
            "actualDurationMs": updated.actual_duration_ms,
            "summaryJson": updated.summary_json,
        }),
    );
    Ok(Some(updated))
}

fn complete_focus_session(
    read_conn: &Mutex<Connection>,
    writer: &WriterHandle,
    row: &FocusSessionRow,
    end_ms: i64,
    app: &AppHandle,
) -> Result<(), String> {
    let summary = compute_focus_summary(read_conn, row.start_ms, end_ms);
    let updated = FocusSessionRow {
        end_ms: Some(end_ms),
        actual_duration_ms: Some(end_ms - row.start_ms),
        status: "completed".to_string(),
        summary_json: Some(summary.clone()),
        ..row.clone()
    };
    writer
        .try_send(WriteEvent::FocusSession(updated.clone()))
        .map_err(|_| "writer_full".to_string())?;
    {
        let mut g = read_conn.lock();
        settings::set_focus_mode_active(&mut g, false, None)
            .map_err(|e| format!("clear_focus_active failed: {e}"))?;
    }
    let _ = app.emit(
        "focus_session_ended",
        json!({
            "id": updated.id,
            "status": updated.status,
            "actualDurationMs": updated.actual_duration_ms,
            "summaryJson": summary,
        }),
    );
    Ok(())
}

fn compute_focus_summary(read_conn: &Mutex<Connection>, start_ms: i64, end_ms: i64) -> String {
    let g = read_conn.lock();
    let mut stmt = match g.prepare(
        "SELECT app_name, SUM(MIN(end_ms, ?2) - MAX(start_ms, ?1)) AS dur
         FROM window_sessions
         WHERE start_ms < ?2 AND (end_ms IS NULL OR end_ms > ?1)
         GROUP BY app_name ORDER BY dur DESC LIMIT 5",
    ) {
        Ok(s) => s,
        Err(_) => return json!({"top_apps": [], "switches": 0}).to_string(),
    };
    let apps: Vec<(String, i64)> = stmt
        .query_map(params![start_ms, end_ms], |r| {
            Ok((
                r.get::<_, String>(0).unwrap_or_default(),
                r.get::<_, i64>(1).unwrap_or(0),
            ))
        })
        .map(|it| it.flatten().collect())
        .unwrap_or_default();
    let switches: i64 = g
        .query_row(
            "SELECT COUNT(*) FROM app_switches WHERE timestamp_ms >= ?1 AND timestamp_ms < ?2",
            params![start_ms, end_ms],
            |r| r.get(0),
        )
        .unwrap_or(0);
    json!({
        "top_apps": apps.iter().map(|(a, ms)| json!({"app": a, "ms": ms})).collect::<Vec<_>>(),
        "switches": switches,
    })
    .to_string()
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

fn focus_complete_text(lang: &str, planned_min: i64, actual_ms: i64) -> (String, String) {
    let actual_min = actual_ms / 60_000;
    if lang == "zh-CN" {
        (
            "TimeLens · 专注完成".to_string(),
            format!("计划 {planned_min} 分钟，实际 {actual_min} 分钟，做得好！"),
        )
    } else {
        (
            "TimeLens · Focus complete".to_string(),
            format!("Planned {planned_min} min, actual {actual_min} min — well done!"),
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
    fn day_bounds_basic() {
        let b = day_bounds_ms("2026-04-22");
        assert!(b.is_some());
        let (s, e) = b.unwrap();
        assert!(e > s);
        assert_eq!(e - s, 24 * 3600 * 1000);
    }

    #[test]
    fn focus_summary_empty_period() {
        let c = setup_db();
        let lock = Arc::new(Mutex::new(c));
        let now = Utc::now().timestamp_millis();
        let s = compute_focus_summary(&lock, now, now + 60_000);
        let v: serde_json::Value = serde_json::from_str(&s).unwrap();
        assert_eq!(v["top_apps"].as_array().unwrap().len(), 0);
        assert_eq!(v["switches"], 0);
    }

    #[test]
    fn focus_session_lifecycle_db() {
        // 在内存 DB 上手工模拟 INSERT/UPDATE focus_sessions
        let c = setup_db();
        c.execute(
            "INSERT INTO focus_sessions (id, start_ms, end_ms, planned_duration_min, actual_duration_ms, status, summary_json, created_at)
             VALUES ('fs1', 1000, NULL, 25, NULL, 'active', NULL, 1000)",
            [],
        ).unwrap();
        c.execute(
            "UPDATE focus_sessions SET end_ms = 2500000, actual_duration_ms = 1500000, status = 'completed', summary_json = '{}' WHERE id = 'fs1'",
            [],
        ).unwrap();
        let (status, dur): (String, i64) = c
            .query_row(
                "SELECT status, actual_duration_ms FROM focus_sessions WHERE id = 'fs1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(status, "completed");
        assert_eq!(dur, 1500000);
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
