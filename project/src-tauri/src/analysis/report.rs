//! 事实层 Markdown（M3），含降级章节说明。

use serde_json::Value;

/// 由 `daily_analysis` 各字段生成 `fact_only` Markdown。
#[allow(clippy::too_many_arguments)]
pub fn build_fact_only_markdown(
    date: &str,
    total_active_ms: i64,
    intent_breakdown: &str,
    top_apps: &str,
    total_switches: i64,
    switches_per_hour: &str,
    top_switch_pairs: &str,
    deep_work_total_ms: i64,
    fragmentation_pct: f64,
    notification_count: i64,
    top_interrupters: &str,
    interrupts_in_deep: i64,
    data_sources: &str,
    avg_kpm: Option<f64>,
    kpm_by_hour: &str,
    avg_delete_ratio: Option<f64>,
    flow_score_avg: Option<f64>,
    struggle_score_avg: Option<f64>,
    degraded_sections: &str,
    clipboard_pairs: Option<i64>,
    top_flows: Option<&str>,
    scene_breakdown: Option<&str>,
) -> String {
    let deg: Vec<String> = serde_json::from_str(degraded_sections).unwrap_or_default();
    let is_degraded = |s: &str| deg.iter().any(|d| d == s);
    let data_src_val: Option<Value> = serde_json::from_str(data_sources).ok();
    let recovery_ms: Option<f64> = data_src_val
        .as_ref()
        .and_then(|v| v.get("interrupt_recovery_avg_ms").and_then(|x| x.as_f64()));
    let recovery_basis: String = data_src_val
        .as_ref()
        .and_then(|v| {
            v.get("interrupt_recovery_basis")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_default();

    let h = total_active_ms / 3_600_000;
    let m = (total_active_ms % 3_600_000) / 60_000;
    let mut out = format!("# TimeLens 日终复盘 · {date}\n\n");
    out.push_str("## 1. 今日总览\n\n");
    if total_active_ms == 0 {
        out.push_str("当天无活跃 Session 数据。\n\n");
    } else {
        out.push_str(&format!(
            "- 总活跃时长: **{} 小时 {} 分钟**（{} ms）\n",
            h, m, total_active_ms
        ));
        out.push_str(&format!("- 当日切换次数: **{}**\n\n", total_switches));
    }

    out.push_str("## 2. 时间去向\n\n");
    out.push_str("Intent 分布（JSON）:\n\n```json\n");
    out.push_str(intent_breakdown);
    out.push_str("\n```\n\nTop 应用（JSON）:\n\n```json\n");
    out.push_str(top_apps);
    out.push_str("\n```\n\n");

    out.push_str("## 3. 注意力与切换\n\n");
    if !is_degraded("app_switches") {
        out.push_str(&format!(
            "- 碎片化指数（5 分钟窗口）: **{:.1}%**\n",
            fragmentation_pct
        ));
        let dh = deep_work_total_ms / 3_600_000;
        let dm = (deep_work_total_ms % 3_600_000) / 60_000;
        out.push_str(&format!(
            "- 深度工作累计（启发式合并）: **{} 小时 {} 分钟**\n\n",
            dh, dm
        ));
        out.push_str("每小时切换次数（JSON）:\n\n```json\n");
        out.push_str(switches_per_hour);
        out.push_str("\n```\n\nTop 切换对（JSON）:\n\n```json\n");
        out.push_str(top_switch_pairs);
        out.push_str("\n```\n\n");
    } else {
        out.push_str("> 切换数据不可用（`app_switches` 为空或当日无记录），本章节已降级。\n\n");
    }

    out.push_str("## 4. 打断分析\n\n");
    if is_degraded("notifications") {
        out.push_str("> 本段在 `notifications` 无数据时，可能仅基于 `switch_type = notification` 的切换做近似；`switch_rate` 为空。\n\n");
    }
    out.push_str(&format!("- 通知条数（含切换近似）: **{}**\n", notification_count));
    out.push_str(&format!("- 深度工作段内打断次数: **{}**\n\n", interrupts_in_deep));
    if let Some(ms) = recovery_ms {
        let basis = recovery_basis.as_str();
        let label = if basis == "switch_return_to_from_app" {
            "平均恢复成本（通知类切换后回到原前台，ms）"
        } else if basis == "notification_response_delay_ms" {
            "平均恢复延迟（通知已响应样本，ms）"
        } else {
            "平均恢复耗时（ms）"
        };
        out.push_str(&format!("- {}: **{:.0}**\n\n", label, ms));
    }
    out.push_str("Top 打断来源（JSON）:\n\n```json\n");
    out.push_str(top_interrupters);
    out.push_str("\n```\n\n");

    out.push_str("## 5. 输入节奏\n\n");
    if !is_degraded("input_metrics") {
        if let (Some(kpm), Some(dr), Some(fl), Some(st)) =
            (avg_kpm, avg_delete_ratio, flow_score_avg, struggle_score_avg)
        {
            out.push_str(&format!(
                "- 日均 KPM（近似）: **{:.1}**；平均退格率: **{:.3}**\n",
                kpm, dr
            ));
            out.push_str(&format!(
                "- 心流/挣扎分（启发式）: **{:.1}** / **{:.1}**\n\n",
                fl, st
            ));
        } else {
            out.push_str("> 输入指标行存在但聚合异常。\n\n");
        }
        out.push_str("按小时 KPM（JSON）:\n\n```json\n");
        out.push_str(kpm_by_hour);
        out.push_str("\n```\n\n");
    } else {
        out.push_str("> 输入行为数据不可用（`input_metrics` 无当日记录）。本章已降级。\n\n");
    }

    out.push_str("## 6. 信息流向\n\n");
    if is_degraded("clipboard_flows") {
        out.push_str("> 剪贴板流水不可用（当日无 `clipboard_flows` 或引擎关闭）。本章已按降级策略跳过。\n\n");
    } else {
        if let Some(n) = clipboard_pairs {
            out.push_str(&format!(
                "- 完成搬运对数（`flow_pair` + paste）: **{}**\n\n",
                n
            ));
        }
        if let Some(tf) = top_flows {
            out.push_str("Top 5 应用间流向（JSON）:\n\n```json\n");
            out.push_str(tf);
            out.push_str("\n```\n\n");
        }
    }

    out.push_str("## 7. 环境上下文\n\n");
    if is_degraded("ambient_context") {
        out.push_str("> 环境采样不可用（当日无 `ambient_context`）。本章已按降级策略跳过。\n\n");
    } else if let Some(sb) = scene_breakdown {
        out.push_str("场景时长推断（按 30s 采样窗口聚合，JSON）:\n\n```json\n");
        out.push_str(sb);
        out.push_str("\n```\n\n");
    } else {
        out.push_str("> 有环境采样行但场景 JSON 生成失败。\n\n");
    }

    if !deg.is_empty() {
        out.push_str("---\n\n**降级数据源**: `");
        out.push_str(&deg.join("`, `"));
        out.push_str("`\n");
    }

    out
}
