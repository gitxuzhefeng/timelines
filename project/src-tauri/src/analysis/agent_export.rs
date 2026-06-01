use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::Path;

use chrono::{Local, TimeZone};
use rusqlite::{params, Connection};
use serde::Serialize;

use crate::analysis::content_recap::{
    pick_highlight_frames, slice_bounds_ms, RecapCandidate, MIN_SESSION_MS,
};
use crate::core::settings;
use crate::AppState;

const MAX_OCR_CHARS_PER_ITEM: usize = 1200;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentExportBundle {
    pub export_dir: String,
    pub markdown_path: String,
    pub markdown_content: String,
    pub screenshot_count: usize,
}

#[derive(Debug, Clone)]
struct ExportCandidate {
    recap: RecapCandidate,
    file_path: String,
    duration_ms: i64,
}

pub fn export_summary_bundle(
    state: &AppState,
    date: &str,
    slice: &str,
    lang: &str,
) -> Result<AgentExportBundle, String> {
    let (start_ms, end_ms) = slice_bounds_ms(date, slice)?;
    let (picked, bounds, normalized_slice) = {
        let conn = state.0.read_conn.lock();
        let rows = load_candidates(&conn, start_ms, end_ms)?;
        if rows.is_empty() {
            return Err("当前日期没有可用 OCR 数据，无法发送总结".to_string());
        }
        let filtered = filter_candidates(&conn, rows);
        if filtered.is_empty() {
            return Err("筛选后没有可用于总结的代表帧".to_string());
        }
        let picked = pick_export_candidates(&filtered);
        if picked.is_empty() {
            return Err("筛选后没有可用于总结的代表帧".to_string());
        }
        (picked, (start_ms, end_ms), normalize_slice(slice))
    };

    let export_dir = state
        .0
        .paths
        .exports_dir
        .join("agent")
        .join(date.to_string());
    let screenshots_dir = export_dir.join("screenshots");
    fs::create_dir_all(&screenshots_dir).map_err(|e| e.to_string())?;
    clear_dir(&screenshots_dir)?;

    let mut manifest: Vec<BTreeMap<String, String>> = Vec::new();
    let mut markdown_rows = Vec::new();
    let mut copied = 0usize;
    for (idx, item) in picked.iter().enumerate() {
        let shot_name = format!("{:02}.webp", idx + 1);
        let shot_target = screenshots_dir.join(&shot_name);
        if fs::copy(&item.file_path, &shot_target).is_err() {
            continue;
        }
        copied += 1;

        let time_text = fmt_local_time(item.recap.captured_at_ms);
        let duration_text = fmt_duration(item.duration_ms);
        let ocr = truncate_chars(normalize_text(&item.recap.ocr_text), MAX_OCR_CHARS_PER_ITEM);
        let title = if item.recap.window_title.trim().is_empty() {
            "(untitled)".to_string()
        } else {
            item.recap.window_title.trim().to_string()
        };
        let intent = item
            .recap
            .session_intent
            .clone()
            .unwrap_or_else(|| "未标注".to_string());

        markdown_rows.push(format!(
            "### {:02} · {time}\n- 应用：{app}\n- 标题：{title}\n- 持续：{duration}\n- 意图：{intent}\n- 截图：screenshots/{shot}\n\n```text\n{ocr}\n```\n",
            idx + 1,
            time = time_text,
            app = item.recap.app_name,
            title = title,
            duration = duration_text,
            intent = intent,
            shot = shot_name,
            ocr = ocr
        ));

        let mut m = BTreeMap::new();
        m.insert("index".to_string(), format!("{:02}", idx + 1));
        m.insert("snapshotId".to_string(), item.recap.snapshot_id.clone());
        m.insert("capturedAtMs".to_string(), item.recap.captured_at_ms.to_string());
        m.insert("appName".to_string(), item.recap.app_name.clone());
        m.insert("windowTitle".to_string(), title);
        m.insert("screenshot".to_string(), format!("screenshots/{shot_name}"));
        manifest.push(m);
    }

    if copied == 0 {
        return Err("截图复制失败，无法导出总结内容".to_string());
    }

    let markdown_content = build_markdown(
        date,
        &normalized_slice,
        bounds.0,
        bounds.1,
        copied,
        &markdown_rows,
        lang,
    );
    let markdown_path = export_dir.join("agent-summary.md");
    fs::write(&markdown_path, &markdown_content).map_err(|e| e.to_string())?;

    let manifest_path = export_dir.join("manifest.json");
    fs::write(
        &manifest_path,
        serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    Ok(AgentExportBundle {
        export_dir: export_dir.to_string_lossy().into_owned(),
        markdown_path: markdown_path.to_string_lossy().into_owned(),
        markdown_content,
        screenshot_count: copied,
    })
}

fn load_candidates(
    conn: &Connection,
    start_ms: i64,
    end_ms: i64,
) -> Result<Vec<ExportCandidate>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.session_id, s.captured_at_ms, s.file_path, s.perceptual_hash,
                    o.ocr_text, ws.app_name, ws.window_title, ws.intent, ws.duration_ms
             FROM snapshots s
             INNER JOIN window_sessions ws ON ws.id = s.session_id
             INNER JOIN snapshot_ocr o ON o.snapshot_id = s.id
             WHERE s.captured_at_ms >= ?1 AND s.captured_at_ms <= ?2
               AND o.status = 'ok' AND o.redacted = 0
               AND length(trim(o.ocr_text)) > 0
               AND length(trim(s.file_path)) > 0
             ORDER BY s.captured_at_ms ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![start_ms, end_ms], |r| {
            let duration_ms: i64 = r.get(9)?;
            Ok(ExportCandidate {
                recap: RecapCandidate {
                    snapshot_id: r.get(0)?,
                    session_id: r.get(1)?,
                    captured_at_ms: r.get(2)?,
                    perceptual_hash: r.get(4)?,
                    ocr_text: r.get(5)?,
                    app_name: r.get(6)?,
                    window_title: r.get(7)?,
                    session_intent: r.get(8)?,
                    duration_ms,
                },
                file_path: r.get(3)?,
                duration_ms,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for r in rows {
        let row = r.map_err(|e| e.to_string())?;
        if !Path::new(&row.file_path).exists() {
            continue;
        }
        out.push(row);
    }
    Ok(out)
}

fn filter_candidates(conn: &Connection, rows: Vec<ExportCandidate>) -> Vec<ExportCandidate> {
    let blacklist = settings::get_app_blacklist(conn);
    rows.into_iter()
        .filter(|r| r.duration_ms >= MIN_SESSION_MS)
        .filter(|r| !blacklist.iter().any(|b| b == &r.recap.app_name))
        .collect()
}

fn pick_export_candidates(rows: &[ExportCandidate]) -> Vec<ExportCandidate> {
    let recap_rows: Vec<RecapCandidate> = rows.iter().map(|r| r.recap.clone()).collect();
    let picked = pick_highlight_frames(&recap_rows);
    let mut map = HashMap::new();
    for row in rows {
        map.insert(row.recap.snapshot_id.clone(), row.clone());
    }
    picked
        .into_iter()
        .filter_map(|p| map.get(&p.snapshot_id).cloned())
        .collect()
}

fn clear_dir(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let p = entry.path();
        if p.is_file() {
            fs::remove_file(p).map_err(|e| e.to_string())?;
        } else if p.is_dir() {
            fs::remove_dir_all(p).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn normalize_slice(slice: &str) -> &'static str {
    if slice == "evening" {
        "evening"
    } else {
        "full_day"
    }
}

fn build_markdown(
    date: &str,
    slice: &str,
    start_ms: i64,
    end_ms: i64,
    count: usize,
    rows: &[String],
    lang: &str,
) -> String {
    let slice_label = if slice == "evening" {
        if lang.eq_ignore_ascii_case("zh-CN") {
            "晚间"
        } else {
            "Evening"
        }
    } else if lang.eq_ignore_ascii_case("zh-CN") {
        "全天"
    } else {
        "Full day"
    };
    let generated_at = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let from = fmt_local_time(start_ms);
    let to = fmt_local_time(end_ms);
    let mut out = String::new();
    out.push_str(&format!(
        "# TimeLens Agent Summary\n\n- Date: {date}\n- Slice: {slice_label} ({slice})\n- Range: {from} - {to}\n- Frames: {count}\n- GeneratedAt: {generated_at}\n\n## Details\n\n",
        date = date,
        slice_label = slice_label,
        slice = slice,
        from = from,
        to = to,
        count = count,
        generated_at = generated_at
    ));
    for row in rows {
        out.push_str(row);
        out.push('\n');
    }
    out.push_str("## How to use\n- Paste this markdown into Doubao.\n- Upload matching files from `screenshots/` if image understanding is needed.\n");
    out
}

fn fmt_local_time(ms: i64) -> String {
    if let Some(dt) = Local.timestamp_millis_opt(ms).single() {
        return dt.format("%H:%M").to_string();
    }
    "--:--".to_string()
}

fn normalize_text(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate_chars(s: String, max_chars: usize) -> String {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() <= max_chars {
        return s;
    }
    chars.into_iter().take(max_chars).collect::<String>() + "…"
}

fn fmt_duration(duration_ms: i64) -> String {
    let mins = (duration_ms as f64 / 60_000.0).round() as i64;
    if mins < 1 {
        return "<1m".to_string();
    }
    if mins < 60 {
        return format!("{mins}m");
    }
    let h = mins / 60;
    let m = mins % 60;
    if m == 0 {
        format!("{h}h")
    } else {
        format!("{h}h {m}m")
    }
}

#[cfg(test)]
mod tests {
    use super::{normalize_text, truncate_chars};

    #[test]
    fn normalize_whitespace() {
        assert_eq!(normalize_text(" a \n b\tc "), "a b c");
    }

    #[test]
    fn truncates_unicode_safely() {
        let out = truncate_chars("你好Rust世界".to_string(), 4);
        assert_eq!(out, "你好Ru…");
    }
}

