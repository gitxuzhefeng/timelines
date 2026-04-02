//! 日聚合写入 `daily_analysis`（M1+M2 简化实现 + 降级段标注）。

use std::collections::HashMap;

use chrono::{Local, TimeZone};
use rusqlite::types::Value as SqlValue;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::core::time_range::{local_day_bounds_ms, utc_now_ms};

fn top_switch_pairs_json(
    conn: &Connection,
    start: i64,
    end: i64,
    bl: &[String],
) -> Result<Value, rusqlite::Error> {
    let (extra, _) = switch_time_blacklist_extra(bl);
    let sql = format!(
        "SELECT from_app, to_app, COUNT(*) as c FROM app_switches \
         WHERE timestamp_ms >= ?1 AND timestamp_ms <= ?2 {extra} \
         GROUP BY from_app, to_app ORDER BY c DESC LIMIT 5"
    );
    let vals = push_switch_time_params(start, end, bl);
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_from_iter(vals), |r| {
        Ok(json!({
            "from": r.get::<_, String>(0)?,
            "to": r.get::<_, String>(1)?,
            "count": r.get::<_, i64>(2)?,
        }))
    })?;
    let mut arr = Vec::new();
    for x in rows {
        arr.push(x?);
    }
    Ok(Value::Array(arr))
}

fn switches_per_hour_json(
    conn: &Connection,
    start: i64,
    end: i64,
    bl: &[String],
) -> Result<Value, rusqlite::Error> {
    let (extra, _) = switch_time_blacklist_extra(bl);
    let sql = format!(
        "SELECT timestamp_ms FROM app_switches WHERE timestamp_ms >= ?1 AND timestamp_ms <= ?2 {extra}"
    );
    let vals = push_switch_time_params(start, end, bl);
    let mut stmt = conn.prepare(&sql)?;
    let mut per_hour: HashMap<String, i64> = HashMap::new();
    let rows = stmt.query_map(params_from_iter(vals), |r| {
        let ts: i64 = r.get(0)?;
        Ok(ts)
    })?;
    for ts in rows.flatten() {
        let hour = Local
            .timestamp_millis_opt(ts)
            .single()
            .map(|dt| dt.format("%H").to_string())
            .unwrap_or_else(|| "00".into());
        *per_hour.entry(hour).or_insert(0) += 1;
    }
    Ok(serde_json::to_value(per_hour).unwrap_or(json!({})))
}

fn normalize_metric(v: f64, min: f64, max: f64) -> f64 {
    if max <= min {
        return 0.0;
    }
    ((v - min) / (max - min)).clamp(0.0, 1.0)
}

/// 指标字典 D3：burst 时长近似（秒）。
fn burst_duration_avg_secs(typing_burst_count: i64, window_interval_secs: f64) -> f64 {
    let denom = typing_burst_count.max(1) as f64;
    (typing_burst_count as f64) * window_interval_secs / denom
}

/// 单条 `input_metrics` 行的心流分（0–100）。
fn flow_score_row(
    kpm: f64,
    delete_ratio: f64,
    typing_burst_count: i64,
    window_interval_secs: f64,
    session_duration_ms: i64,
) -> f64 {
    let burst_s = burst_duration_avg_secs(typing_burst_count, window_interval_secs);
    let session_s = (session_duration_ms as f64 / 1000.0).clamp(0.0, 86400.0);
    (normalize_metric(kpm, 0.0, 120.0) * 0.30
        + (1.0 - normalize_metric(delete_ratio, 0.0, 0.3)) * 0.20
        + normalize_metric(burst_s, 0.0, 60.0) * 0.25
        + normalize_metric(session_s, 0.0, 3600.0) * 0.25)
        * 100.0
}

/// 单条 `input_metrics` 行的挣扎分（0–100）。
fn struggle_score_row(
    delete_ratio: f64,
    undo_count: i64,
    typing_burst_count: i64,
    window_interval_secs: f64,
    longest_pause_ms: i64,
) -> f64 {
    let burst_s = burst_duration_avg_secs(typing_burst_count, window_interval_secs);
    let mins = (window_interval_secs / 60.0).max(0.001);
    let undo_per_min = (undo_count as f64) / mins;
    (normalize_metric(delete_ratio, 0.0, 0.3) * 0.30
        + normalize_metric(undo_per_min, 0.0, 5.0) * 0.20
        + (1.0 - normalize_metric(burst_s, 0.0, 60.0)) * 0.25
        + normalize_metric(longest_pause_ms as f64, 0.0, 30000.0) * 0.25)
        * 100.0
}

const GAP_MERGE_MS: i64 = 120_000;
/// 写入 `deep_work_segments` 的最短段长（满足 M1-07 拆分可见性）。
const SEGMENT_LIST_MIN_MS: i64 = 10 * 60 * 1000;
const DEEP_THRESHOLD_MS: i64 = 25 * 60 * 1000;

/// `?1`/`?2` 为时间界；若 `bl` 非空，追加对 `from_app`/`to_app` 的 `NOT IN`（占位 `?3` 起，列表各重复一次）。
fn switch_time_blacklist_extra(bl: &[String]) -> (String, usize) {
    if bl.is_empty() {
        return (String::new(), 3);
    }
    let n = bl.len();
    let p_from: String = (3..3 + n).map(|i| format!("?{i}")).collect::<Vec<_>>().join(",");
    let p_to: String = (3 + n..3 + 2 * n).map(|i| format!("?{i}")).collect::<Vec<_>>().join(",");
    (
        format!(" AND from_app NOT IN ({p_from}) AND to_app NOT IN ({p_to})"),
        3 + 2 * n,
    )
}

fn push_switch_time_params(start: i64, end: i64, bl: &[String]) -> Vec<SqlValue> {
    let mut v = vec![SqlValue::Integer(start), SqlValue::Integer(end)];
    for s in bl {
        v.push(SqlValue::Text(s.clone()));
    }
    for s in bl {
        v.push(SqlValue::Text(s.clone()));
    }
    v
}

/// `?1`/`?2` 为时间界；若 `bl` 非空，追加 `app_name NOT IN`，占位从 `?3` 起。
fn session_time_blacklist_extra(bl: &[String]) -> String {
    if bl.is_empty() {
        return String::new();
    }
    let n = bl.len();
    let ph: String = (3..3 + n).map(|i| format!("?{i}")).collect::<Vec<_>>().join(",");
    format!(" AND app_name NOT IN ({ph})")
}

fn push_session_time_params(start: i64, end: i64, bl: &[String]) -> Vec<SqlValue> {
    let mut v = vec![SqlValue::Integer(start), SqlValue::Integer(end)];
    for s in bl {
        v.push(SqlValue::Text(s.clone()));
    }
    v
}

fn intent_label(i: &Option<String>) -> String {
    i.clone().unwrap_or_else(|| "(未分类)".into())
}

/// 以「相邻 `app_switches` 之间无切换区间」为边界，在同意图连续 Session（允许 ≤2min 缝）上生成深度段。
fn deep_work_from_switch_intervals(
    conn: &Connection,
    day_start: i64,
    day_end: i64,
    bl: &[String],
) -> Result<(Value, i64, Vec<(i64, i64)>), rusqlite::Error> {
    let (sw_extra, _) = switch_time_blacklist_extra(bl);
    let sw_sql = format!(
        "SELECT timestamp_ms FROM app_switches WHERE timestamp_ms >= ?1 AND timestamp_ms <= ?2 \
         {sw_extra} ORDER BY timestamp_ms"
    );
    let sw_vals = push_switch_time_params(day_start, day_end, bl);
    let switch_ts: Vec<i64> = conn
        .prepare(&sw_sql)?
        .query_map(params_from_iter(sw_vals), |r| r.get::<_, i64>(0))?
        .filter_map(|x| x.ok())
        .collect();

    let mut boundaries: Vec<i64> = Vec::new();
    boundaries.push(day_start);
    boundaries.extend(switch_ts);
    boundaries.push(day_end);

    let mut segments_out = Vec::new();
    let mut deep_total = 0_i64;
    let mut deep_intervals: Vec<(i64, i64)> = Vec::new();

    for w in boundaries.windows(2) {
        let b0 = w[0];
        let b1 = w[1];
        if b1 <= b0 {
            continue;
        }
        let sess_extra = session_time_blacklist_extra(bl);
        let sess_sql = format!(
            "SELECT start_ms, end_ms, intent FROM window_sessions \
             WHERE start_ms < ?2 AND end_ms > ?1 {sess_extra} ORDER BY start_ms"
        );
        let sess_vals = push_session_time_params(b0, b1, bl);
        let mut stmt = conn.prepare(&sess_sql)?;
        let clip_opts: Vec<Option<(i64, i64, String)>> = stmt
            .query_map(params_from_iter(sess_vals), |r| {
                let s: i64 = r.get(0)?;
                let e: i64 = r.get(1)?;
                let intent: Option<String> = r.get(2)?;
                let cs = s.max(b0);
                let ce = e.min(b1);
                if ce > cs {
                    Ok(Some((cs, ce, intent_label(&intent))))
                } else {
                    Ok(None)
                }
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let clips: Vec<(i64, i64, String)> = clip_opts.into_iter().flatten().collect();

        let mut idx = 0usize;
        while idx < clips.len() {
            let (rs, mut re, ref intent0) = clips[idx].clone();
            let mut j = idx + 1;
            while j < clips.len() {
                let (ns, ne, ref int1) = clips[j];
                if int1 == intent0 && ns - re <= GAP_MERGE_MS {
                    re = re.max(ne);
                    j += 1;
                } else {
                    break;
                }
            }
            let dur = re - rs;
            if dur >= SEGMENT_LIST_MIN_MS {
                segments_out.push(json!({
                    "start_ms": rs,
                    "end_ms": re,
                    "duration_ms": dur,
                    "intent": intent0,
                }));
                if dur >= DEEP_THRESHOLD_MS {
                    deep_total += dur;
                    deep_intervals.push((rs, re));
                }
            }
            idx = j;
        }
    }

    Ok((Value::Array(segments_out), deep_total, deep_intervals))
}

fn count_notifications_in_deep(
    conn: &Connection,
    day_start: i64,
    day_end: i64,
    deep_intervals: &[(i64, i64)],
    bl: &[String],
) -> Result<i64, rusqlite::Error> {
    let src_extra = if bl.is_empty() {
        String::new()
    } else {
        let n = bl.len();
        let ph: String = (5..5 + n).map(|i| format!("?{i}")).collect::<Vec<_>>().join(",");
        format!(" AND source_app NOT IN ({ph})")
    };
    let sql = format!(
        "SELECT COUNT(*) FROM notifications \
         WHERE timestamp_ms >= ?1 AND timestamp_ms <= ?2 \
         AND timestamp_ms >= ?3 AND timestamp_ms <= ?4 {src_extra}"
    );
    let mut total = 0_i64;
    for (ds, de) in deep_intervals {
        let mut vals = vec![
            SqlValue::Integer(day_start),
            SqlValue::Integer(day_end),
            SqlValue::Integer(*ds),
            SqlValue::Integer(*de),
        ];
        for s in bl {
            vals.push(SqlValue::Text(s.clone()));
        }
        let n: i64 = conn.query_row(&sql, params_from_iter(vals), |r| r.get(0))?;
        total += n;
    }
    Ok(total)
}

fn top_interrupters_value(
    conn: &Connection,
    start: i64,
    end: i64,
    notifications_empty: bool,
    bl: &[String],
) -> Result<Value, rusqlite::Error> {
    if !notifications_empty {
        let src_extra = if bl.is_empty() {
            String::new()
        } else {
            let n = bl.len();
            let ph: String = (3..3 + n).map(|i| format!("?{i}")).collect::<Vec<_>>().join(",");
            format!(" AND source_app NOT IN ({ph})")
        };
        let sql = format!(
            "SELECT source_app, COUNT(*) as c, \
             SUM(CASE WHEN COALESCE(caused_switch,0) != 0 THEN 1 ELSE 0 END) as sw \
             FROM notifications WHERE timestamp_ms >= ?1 AND timestamp_ms <= ?2 {src_extra} \
             GROUP BY source_app ORDER BY c DESC LIMIT 8"
        );
        let mut vals = vec![SqlValue::Integer(start), SqlValue::Integer(end)];
        for s in bl {
            vals.push(SqlValue::Text(s.clone()));
        }
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(vals), |r| {
            let app: String = r.get(0)?;
            let c: i64 = r.get(1)?;
            let sw: i64 = r.get(2)?;
            let rate = if c > 0 {
                json!((sw as f64) * 100.0 / (c as f64))
            } else {
                Value::Null
            };
            Ok(json!({"app": app, "count": c, "switch_rate": rate}))
        })?;
        let mut arr = Vec::new();
        for x in rows {
            arr.push(x?);
        }
        return Ok(Value::Array(arr));
    }

    let (sw_extra, _) = switch_time_blacklist_extra(bl);
    let sql = format!(
        "SELECT to_app, COUNT(*) as c FROM app_switches \
         WHERE timestamp_ms >= ?1 AND timestamp_ms <= ?2 AND switch_type = 'notification' {sw_extra} \
         GROUP BY to_app ORDER BY c DESC LIMIT 8"
    );
    let vals = push_switch_time_params(start, end, bl);
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_from_iter(vals), |r| {
        Ok(json!({
            "app": r.get::<_, String>(0)?,
            "count": r.get::<_, i64>(1)?,
            "switch_rate": serde_json::Value::Null,
        }))
    })?;
    let mut arr = Vec::new();
    for x in rows {
        arr.push(x?);
    }
    Ok(Value::Array(arr))
}

fn interrupt_recovery_avg_ms(conn: &Connection, start: i64, end: i64) -> Option<f64> {
    conn.query_row(
        "SELECT AVG(CAST(response_delay_ms AS REAL)) FROM notifications \
         WHERE timestamp_ms >= ?1 AND timestamp_ms <= ?2 \
         AND COALESCE(user_responded,0) != 0 AND response_delay_ms IS NOT NULL",
        params![start, end],
        |r| r.get::<_, Option<f64>>(0),
    )
    .ok()
    .flatten()
}

/// PRD C「恢复成本」：对 `switch_type = notification` 的切换，找下一次回到 `from_app` 的间隔（ms）并取平均。
fn interrupt_recovery_from_notification_switches(
    conn: &Connection,
    start: i64,
    end: i64,
    bl: &[String],
) -> Result<Option<f64>, rusqlite::Error> {
    let (sw_extra, _) = switch_time_blacklist_extra(bl);
    let sql = format!(
        "SELECT timestamp_ms, from_app, to_app, switch_type FROM app_switches \
         WHERE timestamp_ms >= ?1 AND timestamp_ms <= ?2 {sw_extra} ORDER BY timestamp_ms ASC"
    );
    let vals = push_switch_time_params(start, end, bl);
    let mut stmt = conn.prepare(&sql)?;
    let rows: Vec<(i64, String, String, String)> = stmt
        .query_map(params_from_iter(vals), |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
        })?
        .filter_map(|x| x.ok())
        .collect();
    let mut costs = Vec::new();
    for (i, (ts, from_a, _to_a, kind)) in rows.iter().enumerate() {
        if kind != "notification" {
            continue;
        }
        for (ts2, _f2, to2, _k2) in rows.iter().skip(i + 1) {
            if to2 == from_a {
                costs.push((*ts2 - ts) as f64);
                break;
            }
        }
    }
    if costs.is_empty() {
        return Ok(None);
    }
    let sum: f64 = costs.iter().sum();
    Ok(Some(sum / costs.len() as f64))
}

fn clipboard_aggregates(
    conn: &Connection,
    start: i64,
    end: i64,
) -> Result<(i64, Value), rusqlite::Error> {
    let pairs: i64 = conn.query_row(
        "SELECT COUNT(DISTINCT flow_pair_id) FROM clipboard_flows \
         WHERE timestamp_ms >= ?1 AND timestamp_ms <= ?2 AND action = 'paste' \
         AND flow_pair_id IS NOT NULL",
        params![start, end],
        |r| r.get(0),
    )?;
    let sql = "SELECT c.app_name, p.app_name, COUNT(*) as cnt \
         FROM clipboard_flows c \
         JOIN clipboard_flows p ON c.flow_pair_id = p.flow_pair_id \
         WHERE c.timestamp_ms >= ?1 AND c.timestamp_ms <= ?2 \
         AND p.timestamp_ms >= ?3 AND p.timestamp_ms <= ?4 \
         AND c.action = 'copy' AND p.action = 'paste' \
         AND c.flow_pair_id IS NOT NULL \
         GROUP BY c.app_name, p.app_name \
         ORDER BY cnt DESC LIMIT 5";
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params![start, end, start, end], |r| {
        Ok(json!({
            "from": r.get::<_, String>(0)?,
            "to": r.get::<_, String>(1)?,
            "count": r.get::<_, i64>(2)?,
        }))
    })?;
    let mut arr = Vec::new();
    for x in rows {
        arr.push(x?);
    }
    Ok((pairs, Value::Array(arr)))
}

fn scene_breakdown_for_day(conn: &Connection, start: i64, end: i64) -> Result<Value, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT is_external_display, is_charging, is_camera_active, \
         is_audio_input_active, is_dnd_enabled FROM ambient_context \
         WHERE timestamp_ms >= ?1 AND timestamp_ms <= ?2 ORDER BY timestamp_ms",
    )?;
    let rows: Vec<(i64, Option<i64>, i64, i64, i64)> = stmt
        .query_map(params![start, end], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
        })?
        .filter_map(|x| x.ok())
        .collect();
    const WIN_MS: i64 = 30_000;
    let mut scene_ms: HashMap<String, i64> = HashMap::new();
    let mut dnd_ms: i64 = 0;
    for (ext, chg, cam, audio, dnd) in rows {
        let primary = if cam == 1 && audio == 1 {
            "会议中"
        } else if ext == 1 && chg == Some(1) {
            "办公室"
        } else if ext == 0 && chg == Some(0) {
            "移动办公"
        } else {
            "常规"
        };
        *scene_ms.entry(primary.to_string()).or_insert(0) += WIN_MS;
        if dnd == 1 {
            dnd_ms += WIN_MS;
        }
    }
    Ok(json!({
        "scene_ms": scene_ms,
        "dnd_ms": dnd_ms,
        "sample_interval_ms": WIN_MS,
    }))
}

fn fragmentation_pct(
    conn: &Connection,
    start: i64,
    end: i64,
    bl: &[String],
) -> Result<f64, rusqlite::Error> {
    let (extra, _) = switch_time_blacklist_extra(bl);
    let sql = format!(
        "SELECT timestamp_ms, to_app FROM app_switches WHERE timestamp_ms >= ?1 AND timestamp_ms <= ?2 \
         {extra} ORDER BY timestamp_ms"
    );
    let vals = push_switch_time_params(start, end, bl);
    let mut stmt = conn.prepare(&sql)?;
    let switches: Vec<(i64, String)> = stmt
        .query_map(params_from_iter(vals), |r| Ok((r.get(0)?, r.get(1)?)))?
        .filter_map(|x| x.ok())
        .collect();
    if switches.is_empty() {
        return Ok(0.0);
    }
    let window = 5 * 60 * 1000_i64;
    let mut buckets: HashMap<i64, std::collections::HashSet<String>> = HashMap::new();
    for (ts, app) in switches {
        let b = ts / window;
        buckets.entry(b).or_default().insert(app);
    }
    let total = buckets.len().max(1) as f64;
    let frag = buckets.values().filter(|s| s.len() >= 3).count() as f64;
    Ok((frag / total) * 100.0)
}

fn input_aggregates(
    conn: &Connection,
    start: i64,
    end: i64,
    bl: &[String],
) -> Result<(Option<f64>, Value, Option<f64>, Option<f64>, Option<f64>), rusqlite::Error> {
    let ws_extra = if bl.is_empty() {
        String::new()
    } else {
        let n = bl.len();
        let ph: String = (3..3 + n).map(|i| format!("?{i}")).collect::<Vec<_>>().join(",");
        format!(" AND (ws.id IS NULL OR ws.app_name NOT IN ({ph}))")
    };
    let sql = format!(
        "SELECT im.timestamp_ms, im.kpm, im.delete_ratio, im.typing_burst_count, im.window_interval_secs, \
         im.undo_count, im.longest_pause_ms, COALESCE(ws.duration_ms, 0) \
         FROM input_metrics im \
         LEFT JOIN window_sessions ws ON im.session_id = ws.id \
         WHERE im.timestamp_ms >= ?1 AND im.timestamp_ms <= ?2 {ws_extra}"
    );
    let mut vals = vec![SqlValue::Integer(start), SqlValue::Integer(end)];
    for s in bl {
        vals.push(SqlValue::Text(s.clone()));
    }
    let mut stmt = conn.prepare(&sql)?;
    let rows: Vec<(i64, f64, f64, i64, f64, i64, i64, i64)> = stmt
        .query_map(params_from_iter(vals), |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
                r.get(6)?,
                r.get(7)?,
            ))
        })?
        .filter_map(|x| x.ok())
        .collect();

    if rows.is_empty() {
        return Ok((None, json!({}), None, None, None));
    }

    let mut sum_kpm = 0.0;
    let mut sum_del = 0.0;
    let mut sum_flow = 0.0;
    let mut sum_struggle = 0.0;
    let n = rows.len() as f64;

    let mut by_h: HashMap<String, Vec<f64>> = HashMap::new();
    for (ts, kpm, del, burst, win_iv, undo, pause, sess_dur) in &rows {
        sum_kpm += kpm;
        sum_del += del;
        sum_flow += flow_score_row(*kpm, *del, *burst, *win_iv, *sess_dur);
        sum_struggle += struggle_score_row(*del, *undo, *burst, *win_iv, *pause);
        let h = Local
            .timestamp_millis_opt(*ts)
            .single()
            .map(|dt| dt.format("%H").to_string())
            .unwrap_or_else(|| "00".into());
        by_h.entry(h).or_default().push(*kpm);
    }

    let kpm_by_hour: HashMap<String, f64> = by_h
        .into_iter()
        .map(|(k, v)| {
            let sum: f64 = v.iter().sum();
            let nv = v.len() as f64;
            (k, if nv > 0.0 { sum / nv } else { 0.0 })
        })
        .collect();

    Ok((
        Some(sum_kpm / n),
        serde_json::to_value(kpm_by_hour).unwrap_or(json!({})),
        Some(sum_del / n),
        Some(sum_flow / n),
        Some(sum_struggle / n),
    ))
}

/// 计算并 **INSERT OR REPLACE** `daily_analysis`，返回 `analysis_id`。
pub fn generate_daily_analysis_into(conn: &mut Connection, date: &str) -> Result<String, String> {
    let (start, end) = local_day_bounds_ms(date)?;
    let bl = crate::core::settings::get_app_blacklist(conn);

    let prev: Option<(String, i64)> = conn
        .query_row(
            "SELECT id, version FROM daily_analysis WHERE analysis_date = ?1",
            [date],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let (id, version) = match prev {
        Some((id, v)) => (id, v + 1),
        None => (Uuid::new_v4().to_string(), 1),
    };

    let mut degraded: Vec<String> = Vec::new();

    let (sw_extra, _) = switch_time_blacklist_extra(&bl);
    let sw_count_sql = format!(
        "SELECT COUNT(*) FROM app_switches WHERE timestamp_ms >= ?1 AND timestamp_ms <= ?2 {sw_extra}"
    );
    let sw_vals = push_switch_time_params(start, end, &bl);
    let sw_count: i64 = conn
        .query_row(&sw_count_sql, params_from_iter(sw_vals), |r| r.get(0))
        .unwrap_or(0);
    if sw_count == 0 {
        degraded.push("app_switches".into());
    }

    let n_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM notifications WHERE timestamp_ms >= ?1 AND timestamp_ms <= ?2",
            params![start, end],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if n_count == 0 {
        degraded.push("notifications".into());
    }

    let i_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM input_metrics WHERE timestamp_ms >= ?1 AND timestamp_ms <= ?2",
            params![start, end],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if i_count == 0 {
        degraded.push("input_metrics".into());
    }

    let clip_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM clipboard_flows WHERE timestamp_ms >= ?1 AND timestamp_ms <= ?2",
            params![start, end],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if clip_count == 0 {
        degraded.push("clipboard_flows".into());
    }

    let amb_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM ambient_context WHERE timestamp_ms >= ?1 AND timestamp_ms <= ?2",
            params![start, end],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if amb_count == 0 {
        degraded.push("ambient_context".into());
    }

    let sess_extra = session_time_blacklist_extra(&bl);
    let total_sql = format!(
        "SELECT COALESCE(SUM(duration_ms),0) FROM window_sessions WHERE start_ms >= ?1 AND start_ms <= ?2 {sess_extra}"
    );
    let sess_vals = push_session_time_params(start, end, &bl);
    let total_active_ms: i64 = conn
        .query_row(&total_sql, params_from_iter(sess_vals.clone()), |r| r.get(0))
        .unwrap_or(0);

    let mut intent_map: HashMap<String, i64> = HashMap::new();
    let intent_sql = format!(
        "SELECT intent, SUM(duration_ms) FROM window_sessions WHERE start_ms >= ?1 AND start_ms <= ?2 {sess_extra} GROUP BY intent"
    );
    let mut stmt = conn.prepare(&intent_sql).map_err(|e| e.to_string())?;
    let ir = stmt
        .query_map(params_from_iter(sess_vals.clone()), |r| {
            let intent: Option<String> = r.get(0)?;
            let dur: i64 = r.get(1)?;
            Ok((intent.unwrap_or_else(|| "(未分类)".into()), dur))
        })
        .map_err(|e| e.to_string())?;
    for row in ir.flatten() {
        let (k, v) = row;
        *intent_map.entry(k).or_insert(0) += v;
    }
    let intent_breakdown = serde_json::to_string(&intent_map).map_err(|e| e.to_string())?;

    let mut top_apps_arr = Vec::new();
    let top_apps_sql = format!(
        "SELECT app_name, SUM(duration_ms) as t FROM window_sessions WHERE start_ms >= ?1 AND start_ms <= ?2 {sess_extra} GROUP BY app_name ORDER BY t DESC LIMIT 5"
    );
    let mut stmt = conn.prepare(&top_apps_sql).map_err(|e| e.to_string())?;
    let tr = stmt
        .query_map(params_from_iter(sess_vals), |r| {
            Ok(json!({"app": r.get::<_, String>(0)?, "duration_ms": r.get::<_, i64>(1)?}))
        })
        .map_err(|e| e.to_string())?;
    for x in tr {
        top_apps_arr.push(x.map_err(|e| e.to_string())?);
    }
    let top_apps = serde_json::to_string(&Value::Array(top_apps_arr)).map_err(|e| e.to_string())?;

    let switches_per_hour =
        switches_per_hour_json(conn, start, end, &bl).map_err(|e| e.to_string())?;
    let top_switch_pairs = top_switch_pairs_json(conn, start, end, &bl).map_err(|e| e.to_string())?;
    let (deep_segments, deep_total, deep_intervals) =
        deep_work_from_switch_intervals(conn, start, end, &bl).map_err(|e| e.to_string())?;
    let frag = fragmentation_pct(conn, start, end, &bl).map_err(|e| e.to_string())?;

    let notifications_empty = n_count == 0;
    let top_interrupters =
        top_interrupters_value(conn, start, end, notifications_empty, &bl)
            .map_err(|e| e.to_string())?;

    let nsw_sql = format!(
        "SELECT COUNT(*) FROM app_switches WHERE timestamp_ms >= ?1 AND timestamp_ms <= ?2 \
         AND switch_type = 'notification' {sw_extra}"
    );
    let nsw_vals = push_switch_time_params(start, end, &bl);
    let notification_switch_count: i64 = conn
        .query_row(&nsw_sql, params_from_iter(nsw_vals), |r| r.get(0))
        .unwrap_or(0);
    let display_notification_count = if n_count > 0 {
        n_count
    } else {
        notification_switch_count
    };

    let interrupts_in_deep = if n_count > 0 {
        count_notifications_in_deep(conn, start, end, &deep_intervals, &bl)
            .map_err(|e| e.to_string())?
    } else {
        0
    };

    let recovery_switch = interrupt_recovery_from_notification_switches(conn, start, end, &bl)
        .map_err(|e| e.to_string())?;
    let recovery_notify = interrupt_recovery_avg_ms(conn, start, end);
    let recovery = recovery_switch.or(recovery_notify);
    let recovery_basis = if recovery_switch.is_some() {
        "switch_return_to_from_app"
    } else if recovery_notify.is_some() {
        "notification_response_delay_ms"
    } else {
        ""
    };

    let (avg_kpm, kpm_by_hour, avg_delete_ratio, flow_score_avg, struggle_score_avg) =
        if i_count > 0 {
            input_aggregates(conn, start, end, &bl).map_err(|e| e.to_string())?
        } else {
            (None, json!({}), None, None, None)
        };

    let (clipboard_pairs, top_flows_str) = if clip_count > 0 {
        let (pairs, flows) = clipboard_aggregates(conn, start, end).map_err(|e| e.to_string())?;
        let flows_s = serde_json::to_string(&flows).map_err(|e| e.to_string())?;
        (Some(pairs), Some(flows_s))
    } else {
        (None, None)
    };

    let scene_breakdown_str = if amb_count > 0 {
        let v = scene_breakdown_for_day(conn, start, end).map_err(|e| e.to_string())?;
        Some(serde_json::to_string(&v).map_err(|e| e.to_string())?)
    } else {
        None
    };

    let degraded_sections = serde_json::to_string(&degraded).map_err(|e| e.to_string())?;
    let mut ds = json!({
        "aggregated_at_ms": utc_now_ms(),
        "local_date": date,
        "degraded": degraded,
        "used_notification_switch_fallback": notifications_empty && notification_switch_count > 0,
        "analysis_excluded_app_names": bl,
        "notification_detection": "foreground_short_bounce_heuristic",
    });
    if !recovery_basis.is_empty() {
        ds["interrupt_recovery_basis"] = json!(recovery_basis);
    }
    if let Some(r) = recovery {
        ds["interrupt_recovery_avg_ms"] = json!((r * 10.0).round() / 10.0);
    }
    let data_sources = ds.to_string();

    let now = utc_now_ms();
    conn.execute(
        "INSERT OR REPLACE INTO daily_analysis (
            id, analysis_date, generated_at_ms, version, total_active_ms, intent_breakdown, top_apps,
            total_switches, switches_per_hour, top_switch_pairs, deep_work_segments, deep_work_total_ms,
            fragmentation_pct, notification_count, top_interrupters, interrupts_in_deep,
            avg_kpm, kpm_by_hour, avg_delete_ratio, flow_score_avg, struggle_score_avg,
            clipboard_pairs, top_flows, scene_breakdown, data_sources, degraded_sections
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
            ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26
        )",
        params![
            id,
            date,
            now,
            version,
            total_active_ms,
            intent_breakdown,
            top_apps,
            sw_count,
            switches_per_hour.to_string(),
            top_switch_pairs.to_string(),
            deep_segments.to_string(),
            deep_total,
            frag,
            display_notification_count,
            top_interrupters.to_string(),
            interrupts_in_deep,
            avg_kpm,
            kpm_by_hour.to_string(),
            avg_delete_ratio,
            flow_score_avg,
            struggle_score_avg,
            clipboard_pairs,
            top_flows_str,
            scene_breakdown_str,
            data_sources,
            degraded_sections,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(id)
}

#[cfg(test)]
mod tests {
    use rusqlite::params;
    use rusqlite::Connection;
    use serde_json::{json, Value};

    use crate::core::storage::migrations::run_migrations;

    use super::generate_daily_analysis_into;
    use super::local_day_bounds_ms;

    fn conn_migrated() -> Connection {
        let mut c = Connection::open_in_memory().unwrap();
        run_migrations(&mut c).unwrap();
        c
    }

    #[test]
    fn dg_empty_app_switches_marks_degraded() {
        let mut c = conn_migrated();
        let date = "2030-06-15";
        let (ds, _de) = local_day_bounds_ms(date).unwrap();
        c.execute(
            "INSERT INTO window_sessions (id, start_ms, end_ms, duration_ms, app_name, bundle_id, window_title, \
             extracted_url, extracted_file_path, intent, raw_event_count, is_active) \
             VALUES ('s1', ?1, ?2, ?3, 'Xcode', NULL, 'code', NULL, NULL, '编码开发', 3, 0)",
            params![ds + 10_000, ds + 3_600_000, 3_590_000],
        )
        .unwrap();
        let id = generate_daily_analysis_into(&mut c, date).unwrap();
        assert!(!id.is_empty());
        let degraded: String = c
            .query_row(
                "SELECT degraded_sections FROM daily_analysis WHERE analysis_date = ?1",
                [date],
                |r| r.get(0),
            )
            .unwrap();
        assert!(
            degraded.contains("app_switches"),
            "expected app_switches in degraded: {degraded}"
        );
    }

    #[test]
    fn fixture_with_switches_no_input_notifications_degraded_flags() {
        let mut c = conn_migrated();
        let date = "2030-07-01";
        let (ds, _de) = local_day_bounds_ms(date).unwrap();
        c.execute(
            "INSERT INTO window_sessions (id, start_ms, end_ms, duration_ms, app_name, bundle_id, window_title, \
             extracted_url, extracted_file_path, intent, raw_event_count, is_active) \
             VALUES ('a', ?1, ?2, 1800000, 'A', NULL, 'a', NULL, NULL, NULL, 1, 0)",
            params![ds + 60_000, ds + 1_860_000],
        )
        .unwrap();
        c.execute(
            "INSERT INTO app_switches (id, timestamp_ms, from_app, from_bundle_id, from_window_title, \
             to_app, to_bundle_id, to_window_title, from_session_duration_ms, switch_type) \
             VALUES ('sw1', ?1, 'A', NULL, 'a', 'B', NULL, 'b', 1000, 'voluntary')",
            params![ds + 120_000],
        )
        .unwrap();
        generate_daily_analysis_into(&mut c, date).unwrap();
        let degraded: String = c
            .query_row(
                "SELECT degraded_sections FROM daily_analysis WHERE analysis_date = ?1",
                [date],
                |r| r.get(0),
            )
            .unwrap();
        assert!(degraded.contains("notifications"));
        assert!(degraded.contains("input_metrics"));
        let ts: i64 = c
            .query_row(
                "SELECT total_active_ms FROM daily_analysis WHERE analysis_date = ?1",
                [date],
                |r| r.get(0),
            )
            .unwrap();
        assert!(ts > 0);
    }

    #[test]
    fn flow_score_row_near_milestone_m2_07() {
        let s = super::flow_score_row(80.0, 0.03, 3, 5.0, 2_400_000);
        assert!(
            (50.0..60.0).contains(&s),
            "flow_score expected ~55, got {s}"
        );
    }

    #[test]
    fn deep_segments_split_by_intent_between_switches_m1_07_style() {
        let mut c = conn_migrated();
        let date = "2030-08-10";
        let (ds, _de) = local_day_bounds_ms(date).unwrap();
        let t0 = ds + 3_600_000;
        let t_switch_end = t0 + 40 * 60 * 1000;
        c.execute(
            "INSERT INTO app_switches (id, timestamp_ms, from_app, from_bundle_id, from_window_title, \
             to_app, to_bundle_id, to_window_title, from_session_duration_ms, switch_type) \
             VALUES ('sw0', ?1, 'X', NULL, 'x', 'Y', NULL, 'y', 1, 'voluntary')",
            params![t0],
        )
        .unwrap();
        c.execute(
            "INSERT INTO app_switches (id, timestamp_ms, from_app, from_bundle_id, from_window_title, \
             to_app, to_bundle_id, to_window_title, from_session_duration_ms, switch_type) \
             VALUES ('sw1', ?1, 'Y', NULL, 'y', 'Z', NULL, 'z', 1, 'voluntary')",
            params![t_switch_end],
        )
        .unwrap();
        let m20 = 20 * 60 * 1000;
        c.execute(
            "INSERT INTO window_sessions (id, start_ms, end_ms, duration_ms, app_name, bundle_id, window_title, \
             extracted_url, extracted_file_path, intent, raw_event_count, is_active) \
             VALUES ('s1', ?1, ?2, ?3, 'A', NULL, 'a', NULL, NULL, '编码开发', 1, 0)",
            params![t0 + 1_000, t0 + m20, m20 - 1_000],
        )
        .unwrap();
        c.execute(
            "INSERT INTO window_sessions (id, start_ms, end_ms, duration_ms, app_name, bundle_id, window_title, \
             extracted_url, extracted_file_path, intent, raw_event_count, is_active) \
             VALUES ('s2', ?1, ?2, ?3, 'B', NULL, 'b', NULL, NULL, '研究检索', 1, 0)",
            params![t0 + m20, t_switch_end - 1_000, m20 - 1_000],
        )
        .unwrap();
        generate_daily_analysis_into(&mut c, date).unwrap();
        let seg_json: String = c
            .query_row(
                "SELECT deep_work_segments FROM daily_analysis WHERE analysis_date = ?1",
                [date],
                |r| r.get(0),
            )
            .unwrap();
        let v: Value = serde_json::from_str(&seg_json).unwrap();
        let arr = v.as_array().unwrap();
        assert_eq!(arr.len(), 2, "expected two intent segments: {seg_json}");
        let deep_total: i64 = c
            .query_row(
                "SELECT deep_work_total_ms FROM daily_analysis WHERE analysis_date = ?1",
                [date],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(deep_total, 0, "20+20 min segments should not sum to deep total (25min threshold)");
    }

    #[test]
    fn daily_analysis_excludes_blacklisted_sessions_m5_09() {
        let mut c = conn_migrated();
        let date = "2030-09-01";
        let (ds, _de) = local_day_bounds_ms(date).unwrap();
        let now = chrono::Utc::now().timestamp_millis();
        c.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES ('app_capture_blacklist', ?1, ?2)",
            params![
                serde_json::to_string(&vec!["Distraction".to_string()]).unwrap(),
                now
            ],
        )
        .unwrap();
        c.execute(
            "INSERT INTO window_sessions (id, start_ms, end_ms, duration_ms, app_name, bundle_id, window_title, \
             extracted_url, extracted_file_path, intent, raw_event_count, is_active) \
             VALUES ('g', ?1, ?2, 3600000, 'GoodApp', NULL, 'g', NULL, NULL, NULL, 1, 0)",
            params![ds + 1000, ds + 3_600_000],
        )
        .unwrap();
        c.execute(
            "INSERT INTO window_sessions (id, start_ms, end_ms, duration_ms, app_name, bundle_id, window_title, \
             extracted_url, extracted_file_path, intent, raw_event_count, is_active) \
             VALUES ('d', ?1, ?2, 7200000, 'Distraction', NULL, 'd', NULL, NULL, NULL, 1, 0)",
            params![ds + 2000, ds + 7_200_000],
        )
        .unwrap();
        c.execute(
            "INSERT INTO app_switches (id, timestamp_ms, from_app, from_bundle_id, from_window_title, \
             to_app, to_bundle_id, to_window_title, from_session_duration_ms, switch_type) \
             VALUES ('sw1', ?1, 'GoodApp', NULL, 'g', 'Distraction', NULL, 'd', 1, 'voluntary')",
            params![ds + 500_000],
        )
        .unwrap();
        generate_daily_analysis_into(&mut c, date).unwrap();
        let total: i64 = c
            .query_row(
                "SELECT total_active_ms FROM daily_analysis WHERE analysis_date = ?1",
                [date],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            total, 3_600_000,
            "total_active_ms should sum only non-blacklisted sessions"
        );
        let top: String = c
            .query_row(
                "SELECT top_apps FROM daily_analysis WHERE analysis_date = ?1",
                [date],
                |r| r.get(0),
            )
            .unwrap();
        assert!(
            top.contains("GoodApp") && !top.contains("Distraction"),
            "top_apps: {top}"
        );
        let ds_json: String = c
            .query_row(
                "SELECT data_sources FROM daily_analysis WHERE analysis_date = ?1",
                [date],
                |r| r.get(0),
            )
            .unwrap();
        let v: Value = serde_json::from_str(&ds_json).unwrap();
        assert_eq!(
            v["analysis_excluded_app_names"],
            json!(["Distraction"])
        );
    }

    #[test]
    fn interrupt_recovery_uses_notification_switch_return() {
        let mut c = conn_migrated();
        let date = "2030-10-01";
        let (ds, _de) = local_day_bounds_ms(date).unwrap();
        let t0 = ds + 1_000_000;
        c.execute(
            "INSERT INTO app_switches (id, timestamp_ms, from_app, from_bundle_id, from_window_title, \
             to_app, to_bundle_id, to_window_title, from_session_duration_ms, switch_type) \
             VALUES ('n1', ?1, 'IDE', NULL, 'c', 'Slack', NULL, 's', 100, 'notification')",
            params![t0],
        )
        .unwrap();
        c.execute(
            "INSERT INTO app_switches (id, timestamp_ms, from_app, from_bundle_id, from_window_title, \
             to_app, to_bundle_id, to_window_title, from_session_duration_ms, switch_type) \
             VALUES ('r1', ?1, 'Slack', NULL, 's', 'IDE', NULL, 'c', 200, 'voluntary')",
            params![t0 + 60_000],
        )
        .unwrap();
        generate_daily_analysis_into(&mut c, date).unwrap();
        let ds_json: String = c
            .query_row(
                "SELECT data_sources FROM daily_analysis WHERE analysis_date = ?1",
                [date],
                |r| r.get(0),
            )
            .unwrap();
        let v: Value = serde_json::from_str(&ds_json).unwrap();
        assert_eq!(v["interrupt_recovery_basis"], "switch_return_to_from_app");
        assert!(v.get("interrupt_recovery_avg_ms").is_some());
    }

    #[test]
    fn interrupts_in_deep_counts_notifications() {
        let mut c = conn_migrated();
        let date = "2030-08-11";
        let (ds, _de) = local_day_bounds_ms(date).unwrap();
        let t0 = ds + 3_600_000;
        let t1 = t0 + 35 * 60 * 1000;
        c.execute(
            "INSERT INTO app_switches (id, timestamp_ms, from_app, from_bundle_id, from_window_title, \
             to_app, to_bundle_id, to_window_title, from_session_duration_ms, switch_type) \
             VALUES ('sw0', ?1, 'X', NULL, 'x', 'Y', NULL, 'y', 1, 'voluntary')",
            params![t0],
        )
        .unwrap();
        c.execute(
            "INSERT INTO app_switches (id, timestamp_ms, from_app, from_bundle_id, from_window_title, \
             to_app, to_bundle_id, to_window_title, from_session_duration_ms, switch_type) \
             VALUES ('sw1', ?1, 'Y', NULL, 'y', 'Z', NULL, 'z', 1, 'voluntary')",
            params![t1],
        )
        .unwrap();
        c.execute(
            "INSERT INTO window_sessions (id, start_ms, end_ms, duration_ms, app_name, bundle_id, window_title, \
             extracted_url, extracted_file_path, intent, raw_event_count, is_active) \
             VALUES ('s1', ?1, ?2, ?3, 'IDE', NULL, 'c', NULL, NULL, '编码开发', 1, 0)",
            params![t0 + 2_000, t1 - 2_000, t1 - t0 - 4_000],
        )
        .unwrap();
        c.execute(
            "INSERT INTO notifications (id, timestamp_ms, source_app, caused_switch) VALUES ('n1', ?1, 'WeChat', 1)",
            params![t0 + 10 * 60 * 1000],
        )
        .unwrap();
        c.execute(
            "INSERT INTO notifications (id, timestamp_ms, source_app, caused_switch) VALUES ('n2', ?1, 'Mail', 0)",
            params![t0 + 20 * 60 * 1000],
        )
        .unwrap();
        generate_daily_analysis_into(&mut c, date).unwrap();
        let n: i64 = c
            .query_row(
                "SELECT interrupts_in_deep FROM daily_analysis WHERE analysis_date = ?1",
                [date],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 2);
    }
}
