//! 屏幕 OCR 文本后处理：脱敏（不得依赖完整原文写日志）。

use regex::Regex;
use std::sync::OnceLock;

fn re_email() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}").expect("email re")
    })
}

fn re_phone_cn() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\b1[3-9]\d{9}\b").expect("phone re"))
}

fn re_ipv4() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b",
        )
        .expect("ipv4 re")
    })
}

fn re_id_card() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\b\d{17}[\dXx]\b").expect("id card re"))
}

/// 返回 (脱敏后文本, 是否包含脱敏标记)。
pub fn redact_screen_text(input: &str) -> (String, bool) {
    let mut s = input.to_string();
    s = re_email().replace_all(&s, "[redacted-email]").to_string();
    s = re_phone_cn().replace_all(&s, "[redacted-phone]").to_string();
    s = re_ipv4().replace_all(&s, "[redacted-ip]").to_string();
    s = re_id_card().replace_all(&s, "[redacted-id]").to_string();
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return (String::new(), false);
    }
    let redacted = s.contains("[redacted-");
    (s, redacted)
}

/// 取第一行有效摘要（≥6 字符），截断长度。
pub fn pick_summary_line(text: &str) -> Option<String> {
    for line in text.lines() {
        let t = line.trim();
        if t.chars().count() >= 6 {
            let mut out: String = t.chars().take(200).collect();
            if t.chars().count() > 200 {
                out.push('…');
            }
            return Some(out);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redact_email_phone() {
        let (s, redacted) = redact_screen_text("联系 foo@bar.com 或 13812345678 谢谢");
        assert!(!s.contains("foo@bar.com"));
        assert!(!s.contains("13812345678"));
        assert!(redacted);
        assert!(s.contains("[redacted-email]"));
        assert!(s.contains("[redacted-phone]"));
    }

    #[test]
    fn pick_summary_skips_short() {
        assert_eq!(pick_summary_line("a\nb\nhello world"), Some("hello world".into()));
    }
}
