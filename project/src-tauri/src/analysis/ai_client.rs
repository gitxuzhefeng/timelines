//! OpenAI 兼容 Chat Completions：仅消费聚合 JSON，不接触 raw_events。

use std::time::{Duration, Instant};

use serde_json::{json, Value};
use sha2::{Digest, Sha256};

const PROMPT_VERSION: &str = "timelens-ai-enhanced-v1";

const SYSTEM_PROMPT_ZH: &str = r#"你是 TimeLens 日终复盘助手。用户将提供 **当日聚合指标 JSON**（仅含统计结果，不含原始事件、窗口标题全文、剪贴板正文、按键序列等敏感明细）。

硬性规则：
1. 不得编造数字；文中出现的所有数值必须与输入 JSON 完全一致。
2. 不做开放式闲聊；输出一段 **Markdown** 叙事（可多段），聚焦模式归纳、注意力与打断、可执行改进建议。
3. 不要输出 JSON；不要用 Markdown 代码块包裹全文（小段列表可用）。
4. 若某数据源在 degraded_sections 中列出，须在叙事中说明该维度当日数据不足或已降级，不得猜测具体数值。
5. 若 JSON 含可选字段 `ocr_session_summaries`（脱敏后的屏幕文字摘要列表），仅作情境参考；不得将其当作精确事实，且不得与聚合指标中的数字矛盾。
"#;

const SYSTEM_PROMPT_EN: &str = r#"You are TimeLens end-of-day review assistant. The user will provide a **daily aggregated metrics JSON** (contains only statistical results, no raw events, full window titles, clipboard content, or keystroke sequences).

Hard rules:
1. Do not fabricate numbers; every value in your response must exactly match the input JSON.
2. No open-ended chat; output a **Markdown** narrative (may be multiple paragraphs) focused on pattern analysis, attention and interruptions, and actionable improvement suggestions.
3. Do not output JSON; do not wrap the full text in a Markdown code block (short inline lists are fine).
4. If a data source is listed in degraded_sections, note in the narrative that data for that dimension is insufficient or degraded for the day — do not guess specific values.
5. If the JSON contains the optional field `ocr_session_summaries` (a list of desensitized screen text summaries), use it only as contextual reference; do not treat it as precise fact, and do not contradict the aggregated metrics numbers.
"#;

pub fn prompt_hash_hex() -> String {
    let mut h = Sha256::new();
    h.update(SYSTEM_PROMPT_ZH.as_bytes());
    h.update(PROMPT_VERSION.as_bytes());
    format!("{:x}", h.finalize())
}

/// Send a minimal request to verify connectivity. Returns latency in milliseconds on success.
pub fn test_connection(base_url: &str, api_key: &str, model: &str) -> Result<u64, String> {
    let url = normalize_chat_url(base_url);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let body = json!({
        "model": model,
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 1
    });

    let start = Instant::now();
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .map_err(|e| format!("网络或连接失败: {e}"))?;

    let latency = start.elapsed().as_millis() as u64;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().unwrap_or_default();
        return Err(format!("{status}: {}", truncate_err(&text)));
    }

    Ok(latency)
}

/// `base_url` 可为 `https://api.openai.com/v1` 或已含 `/chat/completions` 的完整路径。
/// `lang` 为 `"en"` 时使用英文 prompt，否则使用中文 prompt。
pub fn complete_narrative(
    base_url: &str,
    api_key: &str,
    model: &str,
    analysis_json: &Value,
    lang: &str,
) -> Result<String, String> {
    let is_en = lang == "en";
    let system_prompt = if is_en { SYSTEM_PROMPT_EN } else { SYSTEM_PROMPT_ZH };

    let date = analysis_json
        .get("analysis_date")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let json_pretty =
        serde_json::to_string_pretty(analysis_json).map_err(|e| e.to_string())?;
    let user = if is_en {
        format!(
            "Below is the aggregated data for analysis_date={date} (JSON). Please generate the \"AI Recap\" body (Markdown, may be multiple paragraphs).\n\n```json\n{json_pretty}\n```"
        )
    } else {
        format!(
            "以下为 analysis_date={date} 的聚合数据（JSON）。请生成「AI 解读」正文（Markdown，可为多段）。\n\n```json\n{json_pretty}\n```"
        )
    };

    let url = normalize_chat_url(base_url);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let body = json!({
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user}
        ],
        "temperature": 0.3
    });

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .map_err(|e| format!("网络或连接失败: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().unwrap_or_default();
        return Err(format!(
            "模型 API 错误 ({status}): {}",
            truncate_err(&text)
        ));
    }

    let v: Value = resp.json().map_err(|e| e.to_string())?;
    let content = v
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|a| a.first())
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .ok_or_else(|| "模型响应缺少 choices[0].message.content".to_string())?;
    let t = content.trim();
    if t.is_empty() {
        return Err("模型返回空内容".into());
    }
    Ok(t.to_string())
}

fn normalize_chat_url(base: &str) -> String {
    let b = base.trim().trim_end_matches('/');
    if b.ends_with("/chat/completions") {
        b.to_string()
    } else {
        format!("{b}/chat/completions")
    }
}

fn truncate_err(s: &str) -> String {
    const MAX: usize = 400;
    if s.len() <= MAX {
        s.to_string()
    } else {
        format!("{}…", &s[..MAX])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_chat_url_keeps_full_path() {
        let url = normalize_chat_url("https://api.example.com/v1/chat/completions");
        assert_eq!(url, "https://api.example.com/v1/chat/completions");
    }

    #[test]
    fn normalize_chat_url_appends_chat_path() {
        let url = normalize_chat_url("https://api.example.com/v1");
        assert_eq!(url, "https://api.example.com/v1/chat/completions");
    }

    #[test]
    fn normalize_chat_url_trims_trailing_slash() {
        let url = normalize_chat_url("https://api.example.com/v1/");
        assert_eq!(url, "https://api.example.com/v1/chat/completions");
    }

    #[test]
    fn truncate_err_keeps_short_text() {
        let s = "short error";
        assert_eq!(truncate_err(s), s);
    }

    #[test]
    fn truncate_err_truncates_long_text() {
        let s = "x".repeat(401);
        let got = truncate_err(&s);
        // 400 bytes of 'x' + 3-byte UTF-8 ellipsis '…'
        assert_eq!(got, format!("{}…", "x".repeat(400)));
        assert!(got.ends_with('…'));
    }

    #[test]
    fn prompt_hash_is_stable_shape() {
        let hash = prompt_hash_hex();
        assert_eq!(hash.len(), 64);
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
