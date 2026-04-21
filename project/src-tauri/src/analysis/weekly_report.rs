//! 周报 Markdown 构建与 AI 叙事拼接。

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use uuid::Uuid;

pub const WEEKLY_SYSTEM_PROMPT_ZH: &str = r#"你是 TimeLens 周度复盘助手。用户将提供 **本周聚合指标 JSON**（仅含统计结果，不含原始事件或敏感明细）。

硬性规则：
1. 不得编造数字；文中出现的所有数值必须与输入 JSON 完全一致。
2. 输出一段 **Markdown** 叙事（200-400 字，可多段），聚焦本周模式归纳、高效时段规律、应用使用趋势、生产力走势与可执行改进建议。
3. 不要输出 JSON；不要用 Markdown 代码块包裹全文。
4. 若某字段为 null 或缺失，不得猜测具体数值，可说明「本周该维度数据不足」。
"#;

pub const WEEKLY_SYSTEM_PROMPT_EN: &str = r#"You are TimeLens weekly review assistant. The user will provide a **weekly aggregated metrics JSON** (contains only statistical results, no raw events or sensitive details).

Hard rules:
1. Do not fabricate numbers; every value in your response must exactly match the input JSON.
2. Output a **Markdown** narrative (200-400 words, may be multiple paragraphs) focused on weekly pattern analysis, peak focus hours, app usage trends, productivity score trend, and actionable improvement suggestions.
3. Do not output JSON; do not wrap the full text in a Markdown code block.
4. If a field is null or missing, do not guess values — note that data for that dimension is insufficient this week.
"#;

fn fmt_seconds(s: i64) -> String {
    let h = s / 3600;
    let m = (s % 3600) / 60;
    if h > 0 {
        format!("{h} 小时 {m} 分")
    } else if m > 0 {
        format!("{m} 分钟")
    } else {
        format!("{s} 秒")
    }
}

fn fmt_seconds_en(s: i64) -> String {
    let h = s / 3600;
    let m = (s % 3600) / 60;
    if h > 0 {
        format!("{h}h {m}m")
    } else if m > 0 {
        format!("{m}m")
    } else {
        format!("{s}s")
    }
}

pub fn build_weekly_fact_only_markdown(
    week_start: &str,
    week_end: &str,
    valid_days: i64,
    total_tracked_seconds: i64,
    avg_flow_score: Option<f64>,
    daily_flow_scores: &str,
    top_apps_by_day: &str,
    weekly_top_apps: &str,
    avg_deep_work_minutes: Option<f64>,
    avg_fragmentation_pct: Option<f64>,
    peak_focus_day: Option<&str>,
    peak_focus_hour_range: Option<&str>,
    lang: &str,
) -> String {
    let is_en = lang == "en";
    let mut out = String::new();

    if is_en {
        out.push_str(&format!(
            "# Weekly Report: {} ~ {}\n\n",
            week_start, week_end
        ));
        out.push_str(&format!(
            "**Data coverage**: {} day(s) with records\n\n",
            valid_days
        ));
        out.push_str("---\n\n");

        // Section 1: Overview
        out.push_str("## 1. Weekly Overview\n\n");
        out.push_str(&format!(
            "- Total tracked time: **{}**\n",
            fmt_seconds_en(total_tracked_seconds)
        ));
        if let Some(score) = avg_flow_score {
            out.push_str(&format!("- Average flow score: **{:.1}**\n", score));
        }
        if let Some(dw) = avg_deep_work_minutes {
            out.push_str(&format!(
                "- Average daily deep work: **{:.0} min**\n",
                dw
            ));
        }
        if let Some(frag) = avg_fragmentation_pct {
            out.push_str(&format!(
                "- Average fragmentation rate: **{:.1}%**\n",
                frag
            ));
        }
        out.push('\n');

        // Section 2: Productivity trend
        out.push_str("## 2. Productivity Score Trend\n\n");
        let scores: Vec<Value> =
            serde_json::from_str(daily_flow_scores).unwrap_or_default();
        if scores.is_empty() {
            out.push_str("No flow score data available this week.\n\n");
        } else {
            for s in &scores {
                let date = s.get("date").and_then(|v| v.as_str()).unwrap_or("");
                let score = s.get("score").and_then(|v| v.as_f64()).unwrap_or(0.0);
                out.push_str(&format!("- {}: {:.1}\n", date, score));
            }
            let max = scores
                .iter()
                .filter_map(|s| s.get("score").and_then(|v| v.as_f64()))
                .fold(f64::NEG_INFINITY, f64::max);
            let min = scores
                .iter()
                .filter_map(|s| s.get("score").and_then(|v| v.as_f64()))
                .fold(f64::INFINITY, f64::min);
            out.push_str(&format!(
                "\nPeak: **{:.1}** · Low: **{:.1}**\n\n",
                max, min
            ));
        }

        // Section 3: Peak focus hours
        out.push_str("## 3. Peak Focus Hours\n\n");
        if let Some(day) = peak_focus_day {
            out.push_str(&format!("- Best day: **{}**\n", day));
        }
        if let Some(range) = peak_focus_hour_range {
            out.push_str(&format!("- Golden hours: **{}**\n", range));
        }
        out.push('\n');

        // Section 4: App usage
        out.push_str("## 4. App Usage\n\n");
        let top_apps: Vec<Value> =
            serde_json::from_str(weekly_top_apps).unwrap_or_default();
        if top_apps.is_empty() {
            out.push_str("No app usage data available.\n\n");
        } else {
            out.push_str("Top apps this week:\n\n");
            for (i, a) in top_apps.iter().take(5).enumerate() {
                let app = a.get("app").and_then(|v| v.as_str()).unwrap_or("—");
                let secs = a.get("seconds").and_then(|v| v.as_i64()).unwrap_or(0);
                out.push_str(&format!("{}. {} — {}\n", i + 1, app, fmt_seconds_en(secs)));
            }
            out.push('\n');
        }

        // Section 5: Daily app breakdown
        out.push_str("## 5. Daily App Breakdown\n\n");
        let by_day: std::collections::HashMap<String, Value> =
            serde_json::from_str(top_apps_by_day).unwrap_or_default();
        let mut day_keys: Vec<String> = by_day.keys().cloned().collect();
        day_keys.sort();
        for day in &day_keys {
            if let Some(apps) = by_day.get(day) {
                let arr: Vec<Value> = apps
                    .as_array()
                    .cloned()
                    .unwrap_or_default();
                if arr.is_empty() {
                    continue;
                }
                out.push_str(&format!("**{}**: ", day));
                let parts: Vec<String> = arr
                    .iter()
                    .take(3)
                    .map(|a| {
                        let app = a.get("app").and_then(|v| v.as_str()).unwrap_or("—");
                        let secs = a.get("seconds").and_then(|v| v.as_i64()).unwrap_or(0);
                        format!("{} ({})", app, fmt_seconds_en(secs))
                    })
                    .collect();
                out.push_str(&parts.join(", "));
                out.push('\n');
            }
        }
        out.push('\n');
    } else {
        out.push_str(&format!(
            "# 周报：{} ~ {}\n\n",
            week_start, week_end
        ));
        out.push_str(&format!(
            "**数据覆盖**：本周有记录的天数 {} 天\n\n",
            valid_days
        ));
        out.push_str("---\n\n");

        // Section 1: Overview
        out.push_str("## 1. 周总览\n\n");
        out.push_str(&format!(
            "- 全周追踪时长：**{}**\n",
            fmt_seconds(total_tracked_seconds)
        ));
        if let Some(score) = avg_flow_score {
            out.push_str(&format!("- 平均心流分：**{:.1}**\n", score));
        }
        if let Some(dw) = avg_deep_work_minutes {
            out.push_str(&format!(
                "- 日均深度工作时长：**{:.0} 分钟**\n",
                dw
            ));
        }
        if let Some(frag) = avg_fragmentation_pct {
            out.push_str(&format!(
                "- 平均碎片化率：**{:.1}%**\n",
                frag
            ));
        }
        out.push('\n');

        // Section 2: Productivity trend
        out.push_str("## 2. 生产力评分走势\n\n");
        let scores: Vec<Value> =
            serde_json::from_str(daily_flow_scores).unwrap_or_default();
        if scores.is_empty() {
            out.push_str("本周暂无心流分数据。\n\n");
        } else {
            for s in &scores {
                let date = s.get("date").and_then(|v| v.as_str()).unwrap_or("");
                let score = s.get("score").and_then(|v| v.as_f64()).unwrap_or(0.0);
                out.push_str(&format!("- {}：{:.1}\n", date, score));
            }
            let max = scores
                .iter()
                .filter_map(|s| s.get("score").and_then(|v| v.as_f64()))
                .fold(f64::NEG_INFINITY, f64::max);
            let min = scores
                .iter()
                .filter_map(|s| s.get("score").and_then(|v| v.as_f64()))
                .fold(f64::INFINITY, f64::min);
            out.push_str(&format!(
                "\n最高：**{:.1}** · 最低：**{:.1}**\n\n",
                max, min
            ));
        }

        // Section 3: Peak focus hours
        out.push_str("## 3. 高效时段规律\n\n");
        if let Some(day) = peak_focus_day {
            out.push_str(&format!("- 最佳日期：**{}**\n", day));
        }
        if let Some(range) = peak_focus_hour_range {
            out.push_str(&format!("- 黄金时段：**{}**\n", range));
        }
        out.push('\n');

        // Section 4: App usage
        out.push_str("## 4. 应用使用趋势\n\n");
        let top_apps: Vec<Value> =
            serde_json::from_str(weekly_top_apps).unwrap_or_default();
        if top_apps.is_empty() {
            out.push_str("本周暂无应用使用数据。\n\n");
        } else {
            out.push_str("本周 Top 应用：\n\n");
            for (i, a) in top_apps.iter().take(5).enumerate() {
                let app = a.get("app").and_then(|v| v.as_str()).unwrap_or("—");
                let secs = a.get("seconds").and_then(|v| v.as_i64()).unwrap_or(0);
                out.push_str(&format!("{}. {} — {}\n", i + 1, app, fmt_seconds(secs)));
            }
            out.push('\n');
        }

        // Section 5: Daily app breakdown
        out.push_str("## 5. 每日应用分布\n\n");
        let by_day: std::collections::HashMap<String, Value> =
            serde_json::from_str(top_apps_by_day).unwrap_or_default();
        let mut day_keys: Vec<String> = by_day.keys().cloned().collect();
        day_keys.sort();
        for day in &day_keys {
            if let Some(apps) = by_day.get(day) {
                let arr: Vec<Value> = apps.as_array().cloned().unwrap_or_default();
                if arr.is_empty() {
                    continue;
                }
                out.push_str(&format!("**{}**：", day));
                let parts: Vec<String> = arr
                    .iter()
                    .take(3)
                    .map(|a| {
                        let app = a.get("app").and_then(|v| v.as_str()).unwrap_or("—");
                        let secs = a.get("seconds").and_then(|v| v.as_i64()).unwrap_or(0);
                        format!("{} ({})", app, fmt_seconds(secs))
                    })
                    .collect();
                out.push_str(&parts.join("、"));
                out.push('\n');
            }
        }
        out.push('\n');
    }

    out
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyReportDto {
    pub id: String,
    pub week_start: String,
    pub report_type: String,
    pub content_md: String,
    pub lang: String,
    pub created_at: String,
}

pub fn generate_weekly_report_into(
    conn: &mut Connection,
    week_start: &str,
    with_ai: bool,
    lang: &str,
) -> Result<WeeklyReportDto, String> {
    // Load weekly_analysis
    let row = conn
        .query_row(
            "SELECT week_start, week_end, valid_days, total_tracked_seconds, avg_flow_score, \
             daily_flow_scores, top_apps_by_day, weekly_top_apps, avg_deep_work_minutes, \
             avg_fragmentation_pct, peak_focus_day, peak_focus_hour_range \
             FROM weekly_analysis WHERE week_start = ?1",
            [week_start],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, Option<f64>>(4)?,
                    r.get::<_, Option<String>>(5)?,
                    r.get::<_, Option<String>>(6)?,
                    r.get::<_, Option<String>>(7)?,
                    r.get::<_, Option<f64>>(8)?,
                    r.get::<_, Option<f64>>(9)?,
                    r.get::<_, Option<String>>(10)?,
                    r.get::<_, Option<String>>(11)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "请先生成 weekly_analysis".to_string())?;

    let (
        ws,
        we,
        valid_days,
        total_tracked_seconds,
        avg_flow_score,
        daily_flow_scores,
        top_apps_by_day,
        weekly_top_apps,
        avg_deep_work_minutes,
        avg_fragmentation_pct,
        peak_focus_day,
        peak_focus_hour_range,
    ) = row;

    let fact_md = build_weekly_fact_only_markdown(
        &ws,
        &we,
        valid_days,
        total_tracked_seconds,
        avg_flow_score,
        daily_flow_scores.as_deref().unwrap_or("[]"),
        top_apps_by_day.as_deref().unwrap_or("{}"),
        weekly_top_apps.as_deref().unwrap_or("[]"),
        avg_deep_work_minutes,
        avg_fragmentation_pct,
        peak_focus_day.as_deref(),
        peak_focus_hour_range.as_deref(),
        lang,
    );

    let (report_type, full_md) = if with_ai {
        let ai_settings = load_ai_settings(conn)?;
        let payload = serde_json::json!({
            "week_start": ws,
            "week_end": we,
            "valid_days": valid_days,
            "total_tracked_seconds": total_tracked_seconds,
            "avg_flow_score": avg_flow_score,
            "daily_flow_scores": serde_json::from_str::<Value>(
                daily_flow_scores.as_deref().unwrap_or("[]")
            ).unwrap_or_default(),
            "weekly_top_apps": serde_json::from_str::<Value>(
                weekly_top_apps.as_deref().unwrap_or("[]")
            ).unwrap_or_default(),
            "avg_deep_work_minutes": avg_deep_work_minutes,
            "avg_fragmentation_pct": avg_fragmentation_pct,
            "peak_focus_day": peak_focus_day,
            "peak_focus_hour_range": peak_focus_hour_range,
        });

        let ai_body = crate::analysis::ai_client::complete_weekly_narrative(
            &ai_settings.0,
            &ai_settings.1,
            &ai_settings.2,
            &payload,
            lang,
        )?;

        let mut md = fact_md;
        if lang == "en" {
            md.push_str("\n\n---\n\n## 6. AI Weekly Recap\n\n");
            md.push_str("> **Note**: Generated by LLM from weekly aggregated data. All numbers are authoritative from the factual sections above.\n\n");
        } else {
            md.push_str("\n\n---\n\n## 6. AI 周度解读\n\n");
            md.push_str("> **说明**：以下由 LLM 基于本周聚合数据生成，仅供阅读辅助；所有数字以事实层章节为准。\n\n");
        }
        md.push_str(&ai_body);
        md.push('\n');
        ("ai_enhanced".to_string(), md)
    } else {
        ("fact_only".to_string(), fact_md)
    };

    let rid = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "DELETE FROM weekly_reports WHERE week_start = ?1 AND report_type = ?2",
        params![week_start, report_type],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO weekly_reports (id, week_start, report_type, content_md, lang, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![rid, week_start, report_type, full_md, lang, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(WeeklyReportDto {
        id: rid,
        week_start: week_start.to_string(),
        report_type,
        content_md: full_md,
        lang: lang.to_string(),
        created_at: now,
    })
}

fn load_ai_settings(conn: &Connection) -> Result<(String, String, String), String> {
    let base_url = crate::core::settings::get_ai_base_url(conn);
    let model = crate::core::settings::get_ai_model(conn);
    let api_key = crate::core::settings::get_ai_api_key(conn)
        .ok_or_else(|| "请先在设置中配置 API Key".to_string())?;
    Ok((base_url, api_key, model))
}
