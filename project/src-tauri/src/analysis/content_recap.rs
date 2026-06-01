//! 内容型日摘：从截图 + OCR 挑选代表帧（P0 本地规则，无 AI）。

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::core::settings;
use crate::core::time_range::{local_day_bounds_ms, local_evening_bounds_ms};

pub const MIN_SESSION_MS: i64 = 20_000;
pub const MAX_PER_SESSION: usize = 2;
pub const BUCKET_MS: i64 = 600_000;
pub const MAX_ITEMS: usize = 64;
pub const OCR_PREVIEW_MAX_CHARS: usize = 240;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentRecapStatsDto {
    pub snapshots_in_range: i64,
    pub ocr_ok_in_range: i64,
    pub selected_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentRecapItemDto {
    pub snapshot_id: String,
    pub session_id: String,
    pub captured_at_ms: i64,
    pub app_name: String,
    pub window_title: String,
    pub session_intent: Option<String>,
    pub ocr_preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentRecapDto {
    pub date: String,
    pub slice: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub items: Vec<ContentRecapItemDto>,
    pub stats: ContentRecapStatsDto,
}

#[derive(Debug, Clone)]
pub struct RecapCandidate {
    pub snapshot_id: String,
    pub session_id: String,
    pub captured_at_ms: i64,
    pub perceptual_hash: Option<String>,
    pub ocr_text: String,
    pub app_name: String,
    pub window_title: String,
    pub session_intent: Option<String>,
    pub duration_ms: i64,
}

pub fn slice_bounds_ms(date: &str, slice: &str) -> Result<(i64, i64), String> {
    match slice {
        "evening" => local_evening_bounds_ms(date),
        "full_day" | _ => local_day_bounds_ms(date),
    }
}

pub fn build_content_recap(
    conn: &Connection,
    date: &str,
    slice: &str,
) -> Result<ContentRecapDto, String> {
    let (start_ms, end_ms) = slice_bounds_ms(date, slice)?;
    let bl = settings::get_app_blacklist(conn);

    let snapshots_in_range: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM snapshots WHERE captured_at_ms >= ?1 AND captured_at_ms <= ?2",
            params![start_ms, end_ms],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let ocr_ok_in_range: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM snapshot_ocr o
             INNER JOIN snapshots s ON s.id = o.snapshot_id
             WHERE s.captured_at_ms >= ?1 AND s.captured_at_ms <= ?2
               AND o.status = 'ok' AND o.redacted = 0
               AND length(trim(o.ocr_text)) > 0",
            params![start_ms, end_ms],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.session_id, s.captured_at_ms, s.perceptual_hash,
                    o.ocr_text, ws.app_name, ws.window_title, ws.intent, ws.duration_ms
             FROM snapshots s
             INNER JOIN window_sessions ws ON ws.id = s.session_id
             INNER JOIN snapshot_ocr o ON o.snapshot_id = s.id
             WHERE s.captured_at_ms >= ?1 AND s.captured_at_ms <= ?2
               AND o.status = 'ok' AND o.redacted = 0
               AND length(trim(o.ocr_text)) > 0
             ORDER BY s.captured_at_ms ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![start_ms, end_ms], |r| {
            Ok(RecapCandidate {
                snapshot_id: r.get(0)?,
                session_id: r.get(1)?,
                captured_at_ms: r.get(2)?,
                perceptual_hash: r.get(3)?,
                ocr_text: r.get::<_, String>(4)?,
                app_name: r.get(5)?,
                window_title: r.get(6)?,
                session_intent: r.get(7)?,
                duration_ms: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut candidates: Vec<RecapCandidate> = Vec::new();
    for row in rows {
        let c = row.map_err(|e| e.to_string())?;
        if bl.iter().any(|b| b == &c.app_name) {
            continue;
        }
        if c.duration_ms < MIN_SESSION_MS {
            continue;
        }
        candidates.push(c);
    }

    let items = pick_highlight_frames(&candidates);
    let selected_count = items.len();

    Ok(ContentRecapDto {
        date: date.to_string(),
        slice: if slice == "evening" {
            "evening".into()
        } else {
            "full_day".into()
        },
        start_ms,
        end_ms,
        items,
        stats: ContentRecapStatsDto {
            snapshots_in_range,
            ocr_ok_in_range,
            selected_count,
        },
    })
}

pub fn pick_highlight_frames(candidates: &[RecapCandidate]) -> Vec<ContentRecapItemDto> {
    use std::collections::HashMap;

    let mut by_session: HashMap<String, Vec<&RecapCandidate>> = HashMap::new();
    for c in candidates {
        by_session
            .entry(c.session_id.clone())
            .or_default()
            .push(c);
    }

    let mut picked: Vec<&RecapCandidate> = Vec::new();
    for (_sid, mut group) in by_session {
        group.sort_by_key(|c| c.captured_at_ms);
        let mut session_picked: Vec<&RecapCandidate> = Vec::new();
        let mut last_phash: Option<&str> = None;
        for c in &group {
            if let Some(ref ph) = c.perceptual_hash {
                if last_phash == Some(ph.as_str()) {
                    continue;
                }
                last_phash = Some(ph.as_str());
            }
            session_picked.push(c);
        }
        session_picked.sort_by(|a, b| ocr_score(b).cmp(&ocr_score(a)));
        session_picked.truncate(MAX_PER_SESSION);
        picked.extend(session_picked);
    }

    picked.sort_by_key(|c| c.captured_at_ms);

    let mut bucket_best: HashMap<i64, &RecapCandidate> = HashMap::new();
    for c in picked {
        let bucket = c.captured_at_ms / BUCKET_MS;
        bucket_best
            .entry(bucket)
            .and_modify(|prev| {
                if ocr_score(c) > ocr_score(prev) {
                    *prev = c;
                }
            })
            .or_insert(c);
    }

    let mut final_list: Vec<&RecapCandidate> = bucket_best.into_values().collect();
    final_list.sort_by_key(|c| c.captured_at_ms);
    if final_list.len() > MAX_ITEMS {
        final_list.truncate(MAX_ITEMS);
    }

    final_list
        .into_iter()
        .map(|c| ContentRecapItemDto {
            snapshot_id: c.snapshot_id.clone(),
            session_id: c.session_id.clone(),
            captured_at_ms: c.captured_at_ms,
            app_name: c.app_name.clone(),
            window_title: c.window_title.clone(),
            session_intent: c.session_intent.clone(),
            ocr_preview: ocr_preview(&c.ocr_text),
        })
        .collect()
}

fn ocr_score(c: &RecapCandidate) -> usize {
    c.ocr_text.trim().chars().count()
}

pub fn ocr_preview(text: &str) -> String {
    let collapsed: String = text
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    truncate_chars(&collapsed, OCR_PREVIEW_MAX_CHARS)
}

fn truncate_chars(s: &str, max_chars: usize) -> String {
    let mut n = 0;
    let mut out = String::new();
    for ch in s.chars() {
        if n >= max_chars {
            out.push('…');
            break;
        }
        out.push(ch);
        n += 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cand(
        id: &str,
        session: &str,
        ms: i64,
        phash: Option<&str>,
        text: &str,
        app: &str,
    ) -> RecapCandidate {
        RecapCandidate {
            snapshot_id: id.into(),
            session_id: session.into(),
            captured_at_ms: ms,
            perceptual_hash: phash.map(|s| s.to_string()),
            ocr_text: text.into(),
            app_name: app.into(),
            window_title: "win".into(),
            session_intent: None,
            duration_ms: 60_000,
        }
    }

    #[test]
    fn dedupes_same_phash_in_session() {
        let c = [
            cand("a1", "s1", 1000, Some("h1"), "short", "App"),
            cand("a2", "s1", 2000, Some("h1"), "longer text here", "App"),
        ];
        let out = pick_highlight_frames(&c);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].snapshot_id, "a1");
    }

    #[test]
    fn keeps_top_two_per_session_by_ocr_length() {
        let base = 1_700_000_000_000_i64;
        let c = [
            cand("a1", "s1", base, Some("h1"), "aa", "App"),
            cand("a2", "s1", base + BUCKET_MS, Some("h2"), "aaaaaa", "App"),
            cand("a3", "s1", base + 2 * BUCKET_MS, Some("h3"), "aaa", "App"),
        ];
        let out = pick_highlight_frames(&c);
        assert_eq!(out.len(), 2);
        assert!(out.iter().any(|i| i.snapshot_id == "a2"));
        assert!(out.iter().any(|i| i.snapshot_id == "a3"));
    }

    #[test]
    fn bucket_keeps_longest_ocr_in_window() {
        let base = 1_700_000_000_000_i64;
        let c = [
            cand("a1", "s1", base, Some("h1"), "x", "App"),
            cand("a2", "s2", base + 60_000, Some("h2"), "much longer ocr body", "App"),
        ];
        let out = pick_highlight_frames(&c);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].snapshot_id, "a2");
    }

    #[test]
    fn respects_max_items_cap() {
        let mut c = Vec::new();
        for i in 0..80 {
            let ms = i as i64 * BUCKET_MS + 1_000;
            c.push(cand(
                &format!("id{i}"),
                &format!("sess{i}"),
                ms,
                Some(&format!("ph{i}")),
                "some ocr text",
                "App",
            ));
        }
        let out = pick_highlight_frames(&c);
        assert!(out.len() <= MAX_ITEMS);
    }

    #[test]
    fn ocr_preview_collapses_whitespace() {
        let p = ocr_preview("  hello\n\n  world  ");
        assert_eq!(p, "hello world");
    }
}
