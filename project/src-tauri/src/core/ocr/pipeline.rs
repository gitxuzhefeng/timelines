//! TSV → 按行阅读顺序 → 置信度/启发式闸门 → 正文与评估明细。

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::tsv::{parse_tsv, TsvWord};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrPipelineConfig {
    pub languages: String,
    pub psm: i32,
    pub word_conf_min: f32,
    pub line_conf_min: f32,
    pub preprocess_scale: bool,
    pub preprocess_dark_invert: bool,
}

impl Default for OcrPipelineConfig {
    fn default() -> Self {
        Self {
            languages: "chi_sim+eng".into(),
            psm: 6,
            word_conf_min: 60.0,
            line_conf_min: 45.0,
            preprocess_scale: false,
            preprocess_dark_invert: false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrLineEval {
    pub text: String,
    pub avg_conf: f32,
    pub kept: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drop_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct OcrPipelineOutput {
    /// 换行分隔、已过闸，未脱敏
    pub display_text: String,
    pub lines: Vec<OcrLineEval>,
    pub raw_word_count: usize,
    pub kept_word_count: usize,
}

fn line_key(w: &TsvWord) -> (i32, i32, i32) {
    (w.block, w.par, w.line)
}

/// 行间顺序：先 top，再 left（取行内最小 left）。
fn sort_line_keys(keys: &mut Vec<(i32, i32, i32)>, first_top: &BTreeMap<(i32, i32, i32), i32>, first_left: &BTreeMap<(i32, i32, i32), i32>) {
    keys.sort_by(|a, b| {
        let ta = first_top.get(a).copied().unwrap_or(0);
        let tb = first_top.get(b).copied().unwrap_or(0);
        ta.cmp(&tb).then_with(|| {
            let la = first_left.get(a).copied().unwrap_or(0);
            let lb = first_left.get(b).copied().unwrap_or(0);
            la.cmp(&lb)
        })
    });
}

fn is_mostly_symbols(s: &str) -> bool {
    if s.is_empty() {
        return true;
    }
    let mut sym = 0usize;
    for ch in s.chars() {
        if ch.is_ascii_alphanumeric() || ('\u{4e00}'..='\u{9fff}').contains(&ch) {
            continue;
        }
        if ch.is_whitespace() {
            continue;
        }
        sym += 1;
    }
    sym * 10 >= s.chars().count() * 6
}

fn has_letter_or_cjk(s: &str) -> bool {
    s.chars().any(|ch| {
        ch.is_ascii_alphanumeric() || ('\u{4e00}'..='\u{9fff}').contains(&ch)
    })
}

fn is_cjk_char(ch: char) -> bool {
    matches!(ch,
        '\u{4e00}'..='\u{9fff}' |  // CJK Unified
        '\u{3400}'..='\u{4dbf}' |  // Ext A
        '\u{f900}'..='\u{faff}'    // Compatibility
    )
}

/// 相邻词块之间是否 **不** 插空格（避免中文被切成「微 信」导致关键词搜不到）。
fn merge_without_space_between(prev_last: char, next_first: char) -> bool {
    if is_cjk_char(prev_last) && is_cjk_char(next_first) {
        return true;
    }
    if prev_last.is_ascii_digit() && next_first.is_ascii_digit() {
        return true;
    }
    // 常见 UI：「2024年」「第3章」「版本2」
    if prev_last.is_ascii_digit() && is_cjk_char(next_first) {
        return true;
    }
    if is_cjk_char(prev_last) && next_first.is_ascii_digit() {
        return true;
    }
    false
}

/// 将一行内从左到右的 OCR 词块拼成字符串：中日韩紧挨、数字紧挨，英文等仍用空格。
fn join_ocr_tokens(tokens: &[&str]) -> String {
    let mut out = String::new();
    for t in tokens.iter() {
        let t = t.trim();
        if t.is_empty() {
            continue;
        }
        if out.is_empty() {
            out.push_str(t);
            continue;
        }
        let prev_last = out.chars().rev().find(|c| !c.is_whitespace());
        let next_first = t.chars().find(|c| !c.is_whitespace());
        let merge = match (prev_last, next_first) {
            (Some(a), Some(b)) => merge_without_space_between(a, b),
            _ => false,
        };
        if !merge {
            out.push(' ');
        }
        out.push_str(t);
    }
    out
}

/// 从 TSV 原文构建行与闸门结果。
pub fn build_gated_text(tsv_raw: &str, cfg: &OcrPipelineConfig) -> OcrPipelineOutput {
    let words = parse_tsv(tsv_raw);
    let raw_word_count = words.len();

    let mut by_line: BTreeMap<(i32, i32, i32), Vec<TsvWord>> = BTreeMap::new();
    let mut first_top: BTreeMap<(i32, i32, i32), i32> = BTreeMap::new();
    let mut first_left: BTreeMap<(i32, i32, i32), i32> = BTreeMap::new();

    for w in words {
        let k = line_key(&w);
        let left = w.left;
        let top = w.top;
        by_line.entry(k).or_default().push(w);
        first_top.entry(k).or_insert(top);
        first_left
            .entry(k)
            .and_modify(|v| *v = (*v).min(left))
            .or_insert(left);
    }

    let mut keys: Vec<_> = by_line.keys().copied().collect();
    sort_line_keys(&mut keys, &first_top, &first_left);

    let mut lines_out = Vec::new();
    let mut kept_parts = Vec::new();
    let mut kept_word_count = 0usize;

    for k in keys {
        let mut ws_all = by_line.remove(&k).unwrap_or_default();
        ws_all.sort_by_key(|w| w.left);
        let ws: Vec<TsvWord> = ws_all
            .into_iter()
            .filter(|w| w.conf >= 0.0 && w.conf >= cfg.word_conf_min)
            .collect();
        let confs: Vec<f32> = ws.iter().map(|w| w.conf).collect();
        let token_refs: Vec<&str> = ws
            .iter()
            .map(|w| w.text.as_str())
            .collect();
        let line_text: String = join_ocr_tokens(&token_refs);
        let avg = if confs.is_empty() {
            0.0
        } else {
            confs.iter().sum::<f32>() / confs.len() as f32
        };

        let mut drop_reason: Option<String> = None;
        let trim = line_text.trim();
        if trim.is_empty() {
            drop_reason = Some("empty".into());
        } else if trim.chars().count() < 2 {
            drop_reason = Some("too_short".into());
        } else if !has_letter_or_cjk(trim) {
            drop_reason = Some("no_alnum_cjk".into());
        } else if avg < cfg.line_conf_min && avg > 0.0 {
            drop_reason = Some("low_line_conf".into());
        } else if is_mostly_symbols(trim) && trim.chars().count() < 24 {
            drop_reason = Some("symbol_noise".into());
        }

        let kept = drop_reason.is_none();
        if kept {
            kept_word_count += ws.len();
            kept_parts.push(trim.to_string());
        }

        lines_out.push(OcrLineEval {
            text: trim.to_string(),
            avg_conf: (avg * 10.0).round() / 10.0,
            kept,
            drop_reason,
        });
    }

    let display_text = kept_parts.join("\n");

    OcrPipelineOutput {
        display_text,
        lines: lines_out,
        raw_word_count,
        kept_word_count,
    }
}

/// 当 Vision / 部分系统 API 对**有效文本仍返回 conf=0** 时，用中性分参与闸门（避免被 Tesseract 式 word 阈值误杀）。
fn effective_native_word_conf(conf: f32) -> f32 {
    if conf.is_nan() || conf <= 0.0 {
        85.0
    } else {
        conf
    }
}

/// 原生引擎已按阅读序给出的「行」，每行内为 `(词/片段, 置信度 0～100)`（与 Tesseract TSV 尺度一致）。
pub fn build_gated_from_word_lines(
    lines_words: Vec<Vec<(String, f32)>>,
    cfg: &OcrPipelineConfig,
) -> OcrPipelineOutput {
    let raw_word_count: usize = lines_words.iter().map(|l| l.len()).sum();
    let mut lines_out = Vec::new();
    let mut kept_parts = Vec::new();
    let mut kept_word_count = 0usize;

    for words_in_line in lines_words {
        let ws: Vec<(String, f32)> = words_in_line
            .into_iter()
            .map(|(t, c)| (t, effective_native_word_conf(c)))
            .filter(|(_, conf)| *conf >= cfg.word_conf_min)
            .collect();
        let confs: Vec<f32> = ws.iter().map(|(_, c)| *c).collect();
        let token_refs: Vec<&str> = ws.iter().map(|(t, _)| t.as_str()).collect();
        let line_text: String = join_ocr_tokens(&token_refs);
        let avg = if confs.is_empty() {
            0.0
        } else {
            confs.iter().sum::<f32>() / confs.len() as f32
        };

        let mut drop_reason: Option<String> = None;
        let trim = line_text.trim();
        if trim.is_empty() {
            drop_reason = Some("empty".into());
        } else if trim.chars().count() < 2 {
            drop_reason = Some("too_short".into());
        } else if !has_letter_or_cjk(trim) {
            drop_reason = Some("no_alnum_cjk".into());
        } else if avg < cfg.line_conf_min && avg > 0.0 {
            drop_reason = Some("low_line_conf".into());
        } else if is_mostly_symbols(trim) && trim.chars().count() < 24 {
            drop_reason = Some("symbol_noise".into());
        }

        let kept = drop_reason.is_none();
        if kept {
            kept_word_count += ws.len();
            kept_parts.push(trim.to_string());
        }

        lines_out.push(OcrLineEval {
            text: trim.to_string(),
            avg_conf: (avg * 10.0).round() / 10.0,
            kept,
            drop_reason,
        });
    }

    let display_text = kept_parts.join("\n");

    OcrPipelineOutput {
        display_text,
        lines: lines_out,
        raw_word_count,
        kept_word_count,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gates_low_conf_line() {
        let raw = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n\
                   5\t1\t1\t1\t1\t1\t10\t20\t30\t12\t92\tGood\n\
                   5\t1\t1\t1\t2\t1\t10\t40\t30\t12\t30\tBad\n";
        let cfg = OcrPipelineConfig {
            line_conf_min: 50.0,
            ..Default::default()
        };
        let out = build_gated_text(raw, &cfg);
        assert!(out.display_text.contains("Good"));
        assert!(!out.display_text.contains("Bad"));
    }

    #[test]
    fn join_cjk_tokens_no_interior_spaces() {
        let s = join_ocr_tokens(&["微", "信", "好", "友"]);
        assert_eq!(s, "微信好友");
        assert!(!s.contains(' '));
    }

    #[test]
    fn join_mixed_cjk_and_english() {
        let s = join_ocr_tokens(&["打开", "Settings", "页面"]);
        assert_eq!(s, "打开 Settings 页面");
    }

    #[test]
    fn join_digits_and_cjk() {
        let s = join_ocr_tokens(&["20", "24", "年"]);
        assert_eq!(s, "2024年");
    }

    #[test]
    fn gated_from_word_lines_respects_conf() {
        let lines = vec![
            vec![("Hello".into(), 90.0)],
            vec![("X".into(), 20.0)],
        ];
        let cfg = OcrPipelineConfig {
            word_conf_min: 30.0,
            line_conf_min: 40.0,
            ..Default::default()
        };
        let out = build_gated_from_word_lines(lines, &cfg);
        assert!(out.display_text.contains("Hello"));
        assert!(!out.display_text.contains("X"));
    }

    /// Vision 等 API 可能对有效文本返回 conf=0，不得被 word≥60 整行清空。
    #[test]
    fn gated_from_word_lines_zero_conf_neutral() {
        let lines = vec![vec![("识别文本".into(), 0.0)]];
        let cfg = OcrPipelineConfig {
            word_conf_min: 60.0,
            line_conf_min: 45.0,
            ..Default::default()
        };
        let out = build_gated_from_word_lines(lines, &cfg);
        assert!(out.display_text.contains("识别文本"));
    }
}
