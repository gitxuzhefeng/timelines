//! 周聚合：基于 daily_analysis 行生成 weekly_analysis。

use std::collections::HashMap;

use chrono::{Datelike, Duration, NaiveDate, Weekday};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use uuid::Uuid;

/// 根据任意日期和周起始日（0=周日,1=周一）计算该周的 week_start（ISO yyyy-mm-dd）。
pub fn week_start_for_date(date: &str, week_start_day: u8) -> Result<String, String> {
    let d = NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map_err(|e| format!("日期格式错误: {e}"))?;
    let offset = days_since_week_start(d.weekday(), week_start_day);
    let ws = d - Duration::days(offset as i64);
    Ok(ws.format("%Y-%m-%d").to_string())
}

fn days_since_week_start(wd: Weekday, week_start_day: u8) -> u32 {
    let day_num = wd.num_days_from_monday(); // Mon=0 .. Sun=6
    if week_start_day == 0 {
        // week starts Sunday: Sun=0,Mon=1,...,Sat=6
        (day_num + 1) % 7
    } else {
        // week starts Monday: Mon=0,...,Sun=6
        day_num
    }
}

/// 7 天日期列表（week_start 到 week_end 含）。
pub fn week_dates(week_start: &str) -> Result<Vec<String>, String> {
    let start = NaiveDate::parse_from_str(week_start, "%Y-%m-%d")
        .map_err(|e| format!("日期格式错误: {e}"))?;
    Ok((0..7)
        .map(|i| (start + Duration::days(i)).format("%Y-%m-%d").to_string())
        .collect())
}

/// 计算并 UPSERT weekly_analysis，返回 id。
pub fn generate_weekly_analysis_into(
    conn: &mut Connection,
    week_start: &str,
    week_start_day: u8,
) -> Result<String, String> {
    let dates = week_dates(week_start)?;
    let week_end = dates.last().cloned().unwrap_or_default();

    // 查询该周所有 daily_analysis 行
    let placeholders: String = (1..=dates.len())
        .map(|i| format!("?{i}"))
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "SELECT analysis_date, total_active_ms, flow_score_avg, kpm_by_hour, top_apps, \
         deep_work_total_ms, fragmentation_pct \
         FROM daily_analysis WHERE analysis_date IN ({placeholders}) ORDER BY analysis_date"
    );
    let params_vals: Vec<rusqlite::types::Value> = dates
        .iter()
        .map(|d| rusqlite::types::Value::Text(d.clone()))
        .collect();

    struct DayRow {
        date: String,
        total_active_ms: i64,
        flow_score_avg: Option<f64>,
        kpm_by_hour: String,
        top_apps: String,
        deep_work_total_ms: i64,
        fragmentation_pct: f64,
    }

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows: Vec<DayRow> = stmt
        .query_map(rusqlite::params_from_iter(params_vals), |r| {
            Ok(DayRow {
                date: r.get(0)?,
                total_active_ms: r.get::<_, Option<i64>>(1)?.unwrap_or(0),
                flow_score_avg: r.get(2)?,
                kpm_by_hour: r.get::<_, Option<String>>(3)?.unwrap_or_default(),
                top_apps: r.get::<_, Option<String>>(4)?.unwrap_or_default(),
                deep_work_total_ms: r.get::<_, Option<i64>>(5)?.unwrap_or(0),
                fragmentation_pct: r.get::<_, Option<f64>>(6)?.unwrap_or(0.0),
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();

    let valid_days = rows.len() as i64;
    let total_tracked_seconds = rows.iter().map(|r| r.total_active_ms / 1000).sum::<i64>();

    // daily_flow_scores: [{date, score}, ...]
    let daily_flow_scores: Value = Value::Array(
        rows.iter()
            .map(|r| json!({"date": r.date, "score": r.flow_score_avg.unwrap_or(0.0)}))
            .collect(),
    );

    // avg_flow_score
    let flow_scores: Vec<f64> = rows
        .iter()
        .filter_map(|r| r.flow_score_avg)
        .collect();
    let avg_flow_score = if flow_scores.is_empty() {
        None
    } else {
        Some(flow_scores.iter().sum::<f64>() / flow_scores.len() as f64)
    };

    // hourly_heatmap: {date: {hour: flow_score}}
    // Use kpm_by_hour as proxy for activity and scale by flow_score
    let mut heatmap: HashMap<String, HashMap<String, f64>> = HashMap::new();
    for row in &rows {
        let kpm_map: HashMap<String, f64> =
            serde_json::from_str(&row.kpm_by_hour).unwrap_or_default();
        let score_weight = row.flow_score_avg.unwrap_or(0.0);
        let mut hour_scores: HashMap<String, f64> = HashMap::new();
        for (h, kpm) in kpm_map {
            // normalize kpm (0-120) to 0-100, weighted by flow_score
            let kpm_norm = (kpm / 120.0 * 100.0).clamp(0.0, 100.0);
            let blended = if score_weight > 0.0 {
                (kpm_norm * 0.5 + score_weight * 0.5).clamp(0.0, 100.0)
            } else {
                kpm_norm
            };
            hour_scores.insert(h, (blended * 10.0).round() / 10.0);
        }
        heatmap.insert(row.date.clone(), hour_scores);
    }
    let hourly_heatmap =
        serde_json::to_string(&heatmap).unwrap_or_else(|_| "{}".to_string());

    // top_apps_by_day: {date: [{app, seconds}, ...]}
    let mut apps_by_day: HashMap<String, Value> = HashMap::new();
    for row in &rows {
        let apps: Vec<Value> = serde_json::from_str(&row.top_apps).unwrap_or_default();
        let top5: Value = Value::Array(
            apps.into_iter()
                .take(5)
                .map(|a| {
                    let app = a.get("app").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let ms = a.get("duration_ms").and_then(|v| v.as_i64()).unwrap_or(0);
                    json!({"app": app, "seconds": ms / 1000})
                })
                .collect(),
        );
        apps_by_day.insert(row.date.clone(), top5);
    }
    let top_apps_by_day =
        serde_json::to_string(&apps_by_day).unwrap_or_else(|_| "{}".to_string());

    // weekly_top_apps: aggregate across all days
    let mut app_totals: HashMap<String, i64> = HashMap::new();
    for row in &rows {
        let apps: Vec<Value> = serde_json::from_str(&row.top_apps).unwrap_or_default();
        for a in apps {
            let app = a.get("app").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let ms = a.get("duration_ms").and_then(|v| v.as_i64()).unwrap_or(0);
            *app_totals.entry(app).or_insert(0) += ms;
        }
    }
    let mut app_totals_vec: Vec<(String, i64)> = app_totals.into_iter().collect();
    app_totals_vec.sort_by(|a, b| b.1.cmp(&a.1));
    let weekly_top_apps: Value = Value::Array(
        app_totals_vec
            .into_iter()
            .take(10)
            .map(|(app, ms)| json!({"app": app, "seconds": ms / 1000}))
            .collect(),
    );
    let weekly_top_apps_str =
        serde_json::to_string(&weekly_top_apps).unwrap_or_else(|_| "[]".to_string());

    let avg_deep_work_minutes = if valid_days > 0 {
        Some(
            rows.iter().map(|r| r.deep_work_total_ms as f64 / 60_000.0).sum::<f64>()
                / valid_days as f64,
        )
    } else {
        None
    };

    let avg_fragmentation_pct = if valid_days > 0 {
        Some(
            rows.iter().map(|r| r.fragmentation_pct).sum::<f64>() / valid_days as f64,
        )
    } else {
        None
    };

    // peak_focus_day: day with highest flow_score
    let peak_day = rows
        .iter()
        .filter_map(|r| r.flow_score_avg.map(|s| (&r.date, s)))
        .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
        .map(|(d, _)| d.clone());

    // peak_focus_hour_range: top hours from heatmap across all days
    let peak_hour_range = compute_peak_hour_range(&heatmap);

    let now = chrono::Utc::now().to_rfc3339();

    // UPSERT
    let prev_id: Option<String> = conn
        .query_row(
            "SELECT id FROM weekly_analysis WHERE week_start = ?1",
            [week_start],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let id = prev_id.unwrap_or_else(|| Uuid::new_v4().to_string());

    conn.execute(
        "INSERT OR REPLACE INTO weekly_analysis (
            id, week_start, week_end, valid_days, total_tracked_seconds,
            avg_flow_score, daily_flow_scores, hourly_heatmap, top_apps_by_day,
            weekly_top_apps, avg_deep_work_minutes, avg_fragmentation_pct,
            peak_focus_day, peak_focus_hour_range, generated_at, is_stale
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 0
        )",
        params![
            id,
            week_start,
            week_end,
            valid_days,
            total_tracked_seconds,
            avg_flow_score,
            daily_flow_scores.to_string(),
            hourly_heatmap,
            top_apps_by_day,
            weekly_top_apps_str,
            avg_deep_work_minutes,
            avg_fragmentation_pct,
            peak_day,
            peak_hour_range,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(id)
}

fn compute_peak_hour_range(heatmap: &HashMap<String, HashMap<String, f64>>) -> Option<String> {
    // avg score per hour across all days
    let mut hour_sums: HashMap<u32, (f64, u32)> = HashMap::new();
    for day_hours in heatmap.values() {
        for (h_str, score) in day_hours {
            if let Ok(h) = h_str.parse::<u32>() {
                let entry = hour_sums.entry(h).or_insert((0.0, 0));
                entry.0 += score;
                entry.1 += 1;
            }
        }
    }
    if hour_sums.is_empty() {
        return None;
    }
    let mut avgs: Vec<(u32, f64)> = hour_sums
        .into_iter()
        .map(|(h, (sum, cnt))| (h, sum / cnt as f64))
        .collect();
    avgs.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let top_hour = avgs[0].0;
    Some(format!("{:02}:00–{:02}:00", top_hour, (top_hour + 1) % 24))
}

/// 将某天所属周的 weekly_analysis 标记为 stale（若存在）。
pub fn mark_week_stale_for_date(
    conn: &mut Connection,
    date: &str,
    week_start_day: u8,
) -> Result<(), String> {
    let ws = week_start_for_date(date, week_start_day)?;
    conn.execute(
        "UPDATE weekly_analysis SET is_stale = 1 WHERE week_start = ?1",
        [&ws],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 修改周起始日后，将所有已缓存的 weekly_analysis 标记为 stale。
pub fn mark_all_weeks_stale(conn: &mut Connection) -> Result<(), String> {
    conn.execute("UPDATE weekly_analysis SET is_stale = 1", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn week_start_monday_based() {
        // 2026-04-21 是周二，周起始日=周一 → week_start = 2026-04-20
        let ws = week_start_for_date("2026-04-21", 1).unwrap();
        assert_eq!(ws, "2026-04-20");
    }

    #[test]
    fn week_start_sunday_based() {
        // 2026-04-21 是周二，周起始日=周日 → week_start = 2026-04-19
        let ws = week_start_for_date("2026-04-21", 0).unwrap();
        assert_eq!(ws, "2026-04-19");
    }

    #[test]
    fn week_dates_length() {
        let dates = week_dates("2026-04-20").unwrap();
        assert_eq!(dates.len(), 7);
        assert_eq!(dates[0], "2026-04-20");
        assert_eq!(dates[6], "2026-04-26");
    }
}
