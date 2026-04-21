//! Phase 10: AI 对话助手 — 专属分析师模式。
//! 消耗本地聚合快照 + 对话历史，向 OpenAI 兼容端点提问。

use std::time::Duration;

use serde_json::{json, Value};

const SYSTEM_PROMPT_ZH: &str = r#"你是 TimeLens 专属分析师，深度了解用户的工作习惯与效率数据。

你能访问的数据：
- 今日与近期聚合指标（心流分数、深度工作、碎片化比率、应用使用、切换次数等）
- 对话历史（本次会话内）

硬性规则：
1. 不得编造数字；所有数值必须来自用户提供的上下文 JSON，不得凭空猜测。
2. 回答简洁、专注；以洞察、建议、分析为主，避免无效客套。
3. 如果上下文 JSON 为空，明确告诉用户「今日暂无可用分析数据」，并建议先生成每日分析。
4. 若用户问的问题超出本地数据范围，诚实说明，不要编造数据。
5. 回应可包含 Markdown 格式，但避免不必要的代码块。
6. 回应末尾可附加操作建议，格式为 [ACTION:page:param]，例如：[ACTION:timeline:2026-04-21] 表示跳转到时间线页面。

可用的 ACTION 类型：
- [ACTION:timeline:YYYY-MM-DD] — 跳转到时间线
- [ACTION:report:YYYY-MM-DD] — 跳转到日报告
- [ACTION:lens:YYYY-MM-DD] — 跳转到今日透视
"#;

const SYSTEM_PROMPT_EN: &str = r#"You are TimeLens dedicated analyst, with deep knowledge of the user's work habits and productivity data.

Data you can access:
- Today's and recent aggregated metrics (flow score, deep work, fragmentation rate, app usage, switch counts, etc.)
- Conversation history (within this session)

Hard rules:
1. Do not fabricate numbers; all values must come from the context JSON provided by the user — never guess.
2. Be concise and focused; lead with insights, suggestions, and analysis. Avoid empty pleasantries.
3. If the context JSON is empty, explicitly tell the user "No analysis data available for today" and suggest generating a daily analysis first.
4. If the user asks about something outside local data scope, be honest about it — don't make up data.
5. Responses may use Markdown formatting, but avoid unnecessary code blocks.
6. Optionally append action suggestions at the end in the format [ACTION:page:param], e.g.: [ACTION:timeline:2026-04-21] means navigate to the timeline page.

Available ACTION types:
- [ACTION:timeline:YYYY-MM-DD] — Navigate to timeline
- [ACTION:report:YYYY-MM-DD] — Navigate to daily report
- [ACTION:lens:YYYY-MM-DD] — Navigate to today's lens
"#;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// Query the AI assistant with conversation history and a local context snapshot.
pub fn query_assistant(
    base_url: &str,
    api_key: &str,
    model: &str,
    context_snapshot: Option<&Value>,
    history: &[ChatMessage],
    question: &str,
    lang: &str,
) -> Result<String, String> {
    let is_en = lang == "en";
    let system_prompt = if is_en { SYSTEM_PROMPT_EN } else { SYSTEM_PROMPT_ZH };

    let mut messages: Vec<Value> = vec![json!({"role": "system", "content": system_prompt})];

    // Inject context snapshot as first user turn if available
    if let Some(ctx) = context_snapshot {
        let ctx_str = serde_json::to_string_pretty(ctx).unwrap_or_else(|_| "{}".to_string());
        let ctx_msg = if is_en {
            format!("[Context] Local analytics data snapshot:\n```json\n{ctx_str}\n```")
        } else {
            format!("[上下文] 本地分析数据快照：\n```json\n{ctx_str}\n```")
        };
        messages.push(json!({"role": "user", "content": ctx_msg}));
        messages.push(json!({"role": "assistant", "content": if is_en { "Understood. I've read your activity data and am ready to discuss it." } else { "好的，我已阅读你的活动数据，随时可以分析。" }}));
    }

    // Append conversation history (limited to last 10 turns to control token budget)
    let history_slice = if history.len() > 10 { &history[history.len() - 10..] } else { history };
    for msg in history_slice {
        messages.push(json!({"role": msg.role, "content": msg.content}));
    }

    // Append the current question
    messages.push(json!({"role": "user", "content": question}));

    let url = normalize_chat_url(base_url);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let body = json!({
        "model": model,
        "messages": messages,
        "temperature": 0.5,
        "max_tokens": 800
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
        return Err(format!("模型 API 错误 ({status}): {}", truncate_err(&text)));
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
