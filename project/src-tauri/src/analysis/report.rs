//! 事实层 Markdown（M3），面向用户可读叙述，避免 JSON / 字段名裸露。

use serde_json::{Map, Value};

fn degraded_user_label(key: &str) -> &str {
    match key {
        "app_switches" => "应用切换记录",
        "notifications" => "系统通知",
        "input_metrics" => "键盘输入统计",
        "clipboard_flows" => "剪贴板流水",
        "ambient_context" => "环境采样",
        "ocr" => "屏幕文字识别",
        "input_dynamics" => "输入动态采样",
        _ => key,
    }
}

fn ms_to_hm(ms: i64) -> (i64, i64) {
    (ms / 3_600_000, (ms % 3_600_000) / 60_000)
}

/// 将毫秒格式化为中文「X 小时 Y 分」或「Y 分」。
fn fmt_duration_ms(ms: i64) -> String {
    if ms <= 0 {
        return "不足 1 分钟".to_string();
    }
    let (h, m) = ms_to_hm(ms);
    if h > 0 {
        format!("{} 小时 {} 分", h, m)
    } else if m > 0 {
        format!("{} 分钟", m)
    } else {
        let s = (ms / 1000).max(1);
        format!("{} 秒", s)
    }
}

fn fmt_recovery_duration_ms(ms: f64) -> String {
    if !ms.is_finite() || ms <= 0.0 {
        return "—".to_string();
    }
    let sec = (ms / 1000.0).round() as i64;
    if sec < 60 {
        return format!("约 {} 秒", sec);
    }
    let m = sec / 60;
    let s = sec % 60;
    if s == 0 {
        format!("约 {} 分钟", m)
    } else {
        format!("约 {} 分 {} 秒", m, s)
    }
}

fn hour_label_zh(hour: u32) -> String {
    let h = hour % 24;
    match h {
        0..=5 => format!("凌晨 {} 点", h),
        6..=11 => format!("上午 {} 点", h),
        12 => "中午 12 点".to_string(),
        13..=17 => format!("下午 {} 点", h - 12),
        18..=23 => format!("晚上 {} 点", h - 12),
        // `h` 已为 `hour % 24`，理论上不会落入此处；保留兜底以满足穷尽性检查。
        _ => format!("{} 点", h),
    }
}

fn parse_hour_key(s: &str) -> Option<u32> {
    s.parse::<u32>().ok().filter(|&h| h < 24)
}

/// Intent 分布：按时长降序，附占活跃时长比例。
fn section_time_allocation(intent_breakdown: &str, top_apps: &str, total_active_ms: i64) -> String {
    let mut out = String::from("本节根据窗口会话汇总你在各类事项与应用上的时间分布。\n\n");

    let intent_map: Map<String, Value> = serde_json::from_str(intent_breakdown).unwrap_or_default();
    let mut pairs: Vec<(String, i64)> = intent_map
        .into_iter()
        .filter_map(|(k, v)| v.as_i64().or_else(|| v.as_f64().map(|f| f as i64)).map(|n| (k, n)))
        .filter(|(_, n)| *n > 0)
        .collect();
    pairs.sort_by(|a, b| b.1.cmp(&a.1));

    if pairs.is_empty() {
        out.push_str("- 当日暂无「事项类型」时长拆分（可能尚未分类或数据不足）。\n\n");
    } else {
        out.push_str("**按事项类型（时长由长到短）**\n\n");
        for (label, ms) in pairs.iter().take(8) {
            let pct = if total_active_ms > 0 {
                (ms * 100) / total_active_ms
            } else {
                0
            };
            out.push_str(&format!(
                "- **{}**：约 {}（约占当日活跃时间的 {}%）\n",
                label,
                fmt_duration_ms(*ms),
                pct
            ));
        }
        out.push('\n');
    }

    let apps: Vec<Value> = serde_json::from_str(top_apps).unwrap_or_default();
    if apps.is_empty() {
        out.push_str("**应用停留排行**\n\n- 暂无可用数据。\n\n");
        return out;
    }

    out.push_str("**应用停留排行（前五）**\n\n");
    for (i, row) in apps.iter().take(5).enumerate() {
        let app = row.get("app").and_then(|x| x.as_str()).unwrap_or("（未知应用）");
        let ms = row
            .get("duration_ms")
            .and_then(|x| x.as_i64())
            .or_else(|| row.get("duration_ms").and_then(|x| x.as_f64().map(|f| f as i64)))
            .unwrap_or(0);
        out.push_str(&format!(
            "{}. **{}** — 约 {}\n",
            i + 1,
            app,
            fmt_duration_ms(ms)
        ));
    }
    out.push('\n');
    out
}

fn section_attention_switches(
    switches_per_hour: &str,
    top_switch_pairs: &str,
    fragmentation_pct: f64,
    deep_work_total_ms: i64,
) -> String {
    let mut out = String::new();

    out.push_str(&format!(
        "- **注意力碎片化指数**（以 5 分钟为窗口粗略估算）：**{:.1}%**。数值越高，表示短时间内跨应用跳转越频繁。\n",
        fragmentation_pct
    ));
    let (dh, dm) = ms_to_hm(deep_work_total_ms);
    out.push_str(&format!(
        "- **深度工作累计**（将连续专注片段合并后的估算）：**{} 小时 {} 分**。\n\n",
        dh, dm
    ));

    let per_h: Map<String, Value> = serde_json::from_str(switches_per_hour).unwrap_or_default();
    if per_h.is_empty() {
        out.push_str("**各小时切换次数**\n\n- 当日没有记录到按小时拆分的切换次数。\n\n");
    } else {
        let mut hours: Vec<(u32, i64)> = per_h
            .into_iter()
            .filter_map(|(k, v)| {
                let h = parse_hour_key(&k)?;
                let c = v.as_i64().or_else(|| v.as_f64().map(|f| f as i64))?;
                Some((h, c))
            })
            .collect();
        hours.sort_by_key(|x| x.0);
        out.push_str("**各小时切换次数**（数字越大，该小时切应用越频繁）\n\n");
        for (h, c) in hours {
            out.push_str(&format!("- {}：约 **{}** 次\n", hour_label_zh(h), c));
        }
        out.push('\n');
    }

    let pairs: Vec<Value> = serde_json::from_str(top_switch_pairs).unwrap_or_default();
    if pairs.is_empty() {
        out.push_str("**最常见的应用跳转路径**\n\n- 暂无统计。\n\n");
    } else {
        out.push_str("**最常见的应用跳转路径**（从 A 切到 B）\n\n");
        for row in pairs.iter().take(5) {
            let from = row.get("from").and_then(|x| x.as_str()).unwrap_or("?");
            let to = row.get("to").and_then(|x| x.as_str()).unwrap_or("?");
            let count = row.get("count").and_then(|x| x.as_i64()).unwrap_or(0);
            out.push_str(&format!(
                "- 从 **{}** 到 **{}**，约 **{}** 次\n",
                from, to, count
            ));
        }
        out.push('\n');
    }

    out
}

fn section_interrupts(
    top_interrupters: &str,
    notification_count: i64,
    interrupts_in_deep: i64,
    recovery_ms: Option<f64>,
    recovery_basis: &str,
    notifications_degraded: bool,
) -> String {
    let mut out = String::new();

    if notifications_degraded {
        out.push_str(
            "> 当日系统通知数据不完整，下列「通知条数」可能主要依据「因通知而切换到某应用」的记录估算，仅供参考。\n\n",
        );
    }

    out.push_str(&format!(
        "- **通知相关记录条数**（含上述近似）：**{}**\n",
        notification_count
    ));
    out.push_str(&format!(
        "- **出现在深度专注时段内的打断次数**：**{}**\n\n",
        interrupts_in_deep
    ));

    if let Some(ms) = recovery_ms {
        let human = fmt_recovery_duration_ms(ms);
        let sentence = if recovery_basis == "switch_return_to_from_app" {
            format!(
                "- **被打断后回到原应用**：平均需要 **{}**（从通知类切换样本估算）。\n\n",
                human
            )
        } else if recovery_basis == "notification_response_delay_ms" {
            format!(
                "- **处理一条通知**：平均耗时 **{}**（从已响应样本估算）。\n\n",
                human
            )
        } else {
            format!("- **与通知相关的平均恢复耗时**：**{}**。\n\n", human)
        };
        out.push_str(&sentence);
    }

    let arr: Vec<Value> = serde_json::from_str(top_interrupters).unwrap_or_default();
    if arr.is_empty() {
        out.push_str("**通知来源排行**\n\n- 暂无可用统计。\n\n");
        return out;
    }

    out.push_str("**通知来源排行**（按应用汇总）\n\n");
    for row in arr.iter().take(8) {
        let app = row.get("app").and_then(|x| x.as_str()).unwrap_or("（未知）");
        let count = row.get("count").and_then(|x| x.as_i64()).unwrap_or(0);
        if let Some(rate) = row.get("switch_rate").and_then(|x| x.as_f64()) {
            out.push_str(&format!(
                "- **{}**：约 **{}** 条，其中约 **{:.0}%** 伴随前台切换\n",
                app, count, rate
            ));
        } else {
            out.push_str(&format!("- **{}**：约 **{}** 条\n", app, count));
        }
    }
    out.push('\n');
    out
}

fn section_input_rhythm(
    avg_kpm: Option<f64>,
    kpm_by_hour: &str,
    avg_delete_ratio: Option<f64>,
    flow_score_avg: Option<f64>,
    struggle_score_avg: Option<f64>,
) -> String {
    let mut out = String::new();

    if let (Some(kpm), Some(dr), Some(fl), Some(st)) =
        (avg_kpm, avg_delete_ratio, flow_score_avg, struggle_score_avg)
    {
        let del_pct = dr * 100.0;
        out.push_str(&format!(
            "- **打字节奏**：全天平均约 **{:.1}** 次按键/分钟。\n",
            kpm
        ));
        out.push_str(&format!(
            "- **删改比例**：平均约 **{:.1}%** 的按键为退格（越高表示边打边改越多）。\n",
            del_pct
        ));
        out.push_str(&format!(
            "- **顺畅度参考分**：**{:.0}** / 100（越高表示输入更连贯、停顿更少）。\n",
            fl
        ));
        out.push_str(&format!(
            "- **纠结度参考分**：**{:.0}** / 100（越高表示删改、撤销、长停顿越多）。\n\n",
            st
        ));
    } else {
        out.push_str("> 输入指标存在异常，无法生成当日摘要。\n\n");
    }

    let map: Map<String, Value> = serde_json::from_str(kpm_by_hour).unwrap_or_default();
    if map.is_empty() {
        out.push_str("**各小时打字快慢**\n\n- 暂无按小时拆分的记录。\n\n");
        return out;
    }

    let mut by_hour: Vec<(u32, f64)> = map
        .into_iter()
        .filter_map(|(k, v)| {
            let h = parse_hour_key(&k)?;
            let x = v.as_f64().or_else(|| v.as_i64().map(|i| i as f64))?;
            Some((h, x))
        })
        .collect();

    by_hour.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    out.push_str("**各小时打字节奏**（按键/分钟，数值越高该小时打字越密）\n\n");
    for (h, kpm) in by_hour.iter().take(6) {
        out.push_str(&format!("- {}：约 **{:.1}**\n", hour_label_zh(*h), kpm));
    }

    if let Some((h, kpm)) = by_hour.first() {
        out.push_str(&format!(
            "\n整体来看，**{}** 前后打字最密集（约 {:.1} 次/分钟）。\n\n",
            hour_label_zh(*h),
            kpm
        ));
    } else {
        out.push('\n');
    }

    out
}

fn section_clipboard(clipboard_pairs: Option<i64>, top_flows: Option<&str>) -> String {
    let mut out = String::new();

    if let Some(n) = clipboard_pairs {
        out.push_str(&format!(
            "- **完成「复制 → 粘贴」成对的次数**：**{}**（表示跨应用或同应用内成对的搬运次数）。\n\n",
            n
        ));
    }

    let Some(tf) = top_flows else {
        out.push_str("**最常见的复制粘贴路径**\n\n- 暂无统计。\n\n");
        return out;
    };

    let arr: Vec<Value> = serde_json::from_str(tf).unwrap_or_default();
    if arr.is_empty() {
        out.push_str("**最常见的复制粘贴路径**\n\n- 暂无统计。\n\n");
        return out;
    }

    out.push_str("**最常见的复制粘贴路径**（从哪复制、贴到哪）\n\n");
    for row in arr.iter().take(5) {
        let from = row.get("from").and_then(|x| x.as_str()).unwrap_or("?");
        let to = row.get("to").and_then(|x| x.as_str()).unwrap_or("?");
        let count = row.get("count").and_then(|x| x.as_i64()).unwrap_or(0);
        out.push_str(&format!(
            "- **{}** → **{}**，约 **{}** 次\n",
            from, to, count
        ));
    }
    out.push('\n');
    out
}

fn section_ambient(scene_breakdown: &str) -> String {
    let v: Value = match serde_json::from_str(scene_breakdown) {
        Ok(x) => x,
        Err(_) => {
            return "> 有环境采样记录，但无法解析场景摘要。\n\n".to_string();
        }
    };

    let mut out = String::from(
        "根据大约每 30 秒一次的环境采样，粗略推断你在不同场景下的停留时长（仅供参考）。\n\n",
    );

    if let Some(obj) = v.get("scene_ms").and_then(|x| x.as_object()) {
        let mut scenes: Vec<(String, i64)> = obj
            .iter()
            .filter_map(|(k, val)| {
                val.as_i64()
                    .or_else(|| val.as_f64().map(|f| f as i64))
                    .map(|ms| (k.clone(), ms))
            })
            .filter(|(_, ms)| *ms > 0)
            .collect();
        scenes.sort_by(|a, b| b.1.cmp(&a.1));

        if scenes.is_empty() {
            out.push_str("- 未能归纳出明确的场景标签。\n\n");
        } else {
            out.push_str("**场景停留（由长到短）**\n\n");
            let total_scene_ms: i64 = scenes.iter().map(|(_, m)| *m).sum();
            for (label, ms) in scenes {
                let pct = if total_scene_ms > 0 {
                    (ms * 100) / total_scene_ms
                } else {
                    0
                };
                out.push_str(&format!(
                    "- **{}**：约 {}（约占本段采样的 {}%）\n",
                    label,
                    fmt_duration_ms(ms),
                    pct
                ));
            }
            out.push('\n');
        }
    }

    if let Some(dnd) = v.get("dnd_ms").and_then(|x| x.as_i64()).or_else(|| {
        v.get("dnd_ms")
            .and_then(|x| x.as_f64())
            .map(|f| f as i64)
    }) {
        if dnd > 0 {
            out.push_str(&format!(
                "- **勿扰模式累计时长**（采样窗口内）：约 {}。\n\n",
                fmt_duration_ms(dnd)
            ));
        }
    }

    out
}

fn footer_degraded(deg: &[String]) -> String {
    let labels: Vec<&str> = deg.iter().map(|s| degraded_user_label(s)).collect();
    format!(
        "---\n\n**数据说明**：以下模块当日数据不完整或缺失，报告中对应章节已弱化或采用替代估算：**{}**。\n",
        labels.join("、")
    )
}

/// 由 `daily_analysis` 各字段生成 `fact_only` Markdown（用户可读叙述）。
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

    let (h, m) = ms_to_hm(total_active_ms);
    let mut out = format!("# 日终复盘 · {}\n\n", date);
    out.push_str("下面是根据当日自动采集的记录整理的结构化摘要，方便你回顾时间花在哪、注意力如何波动。\n\n");

    out.push_str("## 1. 今日总览\n\n");
    if total_active_ms == 0 {
        out.push_str("当天几乎没有可用的电脑使用时长记录；若你确实使用过设备，可检查采集权限或重新生成分析。\n\n");
    } else {
        out.push_str(&format!(
            "- **电脑活跃时长**（有前台会话的合计）：约 **{} 小时 {} 分**\n",
            h, m
        ));
        out.push_str(&format!("- **切换应用的次数**（全天合计）：**{}**\n\n", total_switches));
    }

    out.push_str("## 2. 时间去向\n\n");
    out.push_str(&section_time_allocation(
        intent_breakdown,
        top_apps,
        total_active_ms,
    ));

    out.push_str("## 3. 注意力与切换\n\n");
    if !is_degraded("app_switches") {
        out.push_str(&section_attention_switches(
            switches_per_hour,
            top_switch_pairs,
            fragmentation_pct,
            deep_work_total_ms,
        ));
    } else {
        out.push_str(
            "> 当日未能可靠统计应用切换（可能没有切换记录或该数据源不可用），本节从略。\n\n",
        );
    }

    out.push_str("## 4. 打断与通知\n\n");
    out.push_str(&section_interrupts(
        top_interrupters,
        notification_count,
        interrupts_in_deep,
        recovery_ms,
        recovery_basis.as_str(),
        is_degraded("notifications"),
    ));

    out.push_str("## 5. 输入节奏\n\n");
    if !is_degraded("input_metrics") {
        out.push_str(&section_input_rhythm(
            avg_kpm,
            kpm_by_hour,
            avg_delete_ratio,
            flow_score_avg,
            struggle_score_avg,
        ));
    } else {
        out.push_str(
            "> 当日没有键盘输入采样数据，无法分析打字快慢与删改习惯，本节从略。\n\n",
        );
    }

    out.push_str("## 6. 复制粘贴与信息流动\n\n");
    if is_degraded("clipboard_flows") {
        out.push_str(
            "> 剪贴板流水未开启或当日无记录，无法分析跨应用复制粘贴路径，本节从略。\n\n",
        );
    } else {
        out.push_str(&section_clipboard(clipboard_pairs, top_flows));
    }

    out.push_str("## 7. 环境与场景\n\n");
    if is_degraded("ambient_context") {
        out.push_str("> 当日没有环境传感器采样（外接屏、充电、会议状态等），本节从略。\n\n");
    } else if let Some(sb) = scene_breakdown {
        out.push_str(&section_ambient(sb));
    } else {
        out.push_str("> 有环境采样记录，但未能生成场景摘要。\n\n");
    }

    if !deg.is_empty() {
        out.push_str(&footer_degraded(&deg));
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_json_fences_in_sample_report() {
        let md = build_fact_only_markdown(
            "2031-03-14",
            3_600_000,
            r#"{"写作":1800000,"阅读":900000}"#,
            r#"[{"app":"Notes","duration_ms":2000000}]"#,
            12,
            r#"{"14":5,"15":3}"#,
            r#"[{"from":"A","to":"B","count":4}]"#,
            1_800_000,
            22.5,
            6,
            r#"[{"app":"Mail","count":3,"switch_rate":33.3}]"#,
            1,
            "{}",
            Some(45.0),
            r#"{"10":60.0,"11":40.0}"#,
            Some(0.05),
            Some(70.0),
            Some(30.0),
            "[]",
            Some(2),
            Some(r#"[{"from":"Safari","to":"Notes","count":2}]"#),
            Some(r#"{"scene_ms":{"办公室":1800000},"dnd_ms":0,"sample_interval_ms":30000}"#),
        );
        assert!(!md.contains("```"));
        assert!(!md.contains("JSON"));
        assert!(md.contains("写作"));
        assert!(md.contains("Safari"));
        assert!(md.contains("日终复盘"));
    }
}
