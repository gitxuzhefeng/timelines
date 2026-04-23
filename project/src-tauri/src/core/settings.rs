//! `settings` 表键值读写（引擎开关等）。

use rusqlite::{params, Connection};

const K_APP_BLACKLIST: &str = "app_capture_blacklist";

const K_ENGINE_INPUT: &str = "engine_input";
const K_ENGINE_CLIPBOARD: &str = "engine_clipboard";
const K_ENGINE_NOTIFICATIONS: &str = "engine_notifications";
const K_ENGINE_AMBIENT: &str = "engine_ambient";
const K_AI_ENABLED: &str = "ai_enabled";
const K_AI_PRIVACY_ACK: &str = "ai_privacy_acknowledged";
const K_AI_BASE_URL: &str = "ai_base_url";
const K_AI_MODEL: &str = "ai_model";
const K_AI_API_KEY: &str = "ai_api_key";

const K_OCR_ENABLED: &str = "ocr_enabled";
const K_OCR_PRIVACY_ACK: &str = "ocr_privacy_acknowledged";
const K_OCR_ALLOW_EXPORT: &str = "ocr_allow_export_to_ai";
const K_OCR_SHOW_SUMMARY: &str = "ocr_show_session_summary";
const K_OCR_LANGUAGES: &str = "ocr_languages";
const K_OCR_PSM: &str = "ocr_psm";
const K_OCR_WORD_CONF_MIN: &str = "ocr_word_conf_min";
const K_OCR_LINE_CONF_MIN: &str = "ocr_line_conf_min";
const K_OCR_PREPROCESS_SCALE: &str = "ocr_preprocess_scale";
const K_OCR_PREPROCESS_INVERT: &str = "ocr_preprocess_dark_invert";

const K_LANGUAGE: &str = "ui_language";
const DEFAULT_LANGUAGE: &str = "en";

const K_WEEK_START_DAY: &str = "week_start_day";
const K_AUTOSTART_ENABLED: &str = "autostart_enabled";

const K_NUDGE_ENABLED: &str = "nudge_enabled";
const K_NUDGE_REST_MINUTES: &str = "nudge_rest_minutes";
const K_NUDGE_FRAG_THRESHOLD: &str = "nudge_frag_threshold";
const K_NUDGE_FRAG_WINDOW_MIN: &str = "nudge_frag_window_min";
const K_NUDGE_DEEP_WORK_MINUTES: &str = "nudge_deep_work_minutes";
const K_NUDGE_DEEP_WORK_DND: &str = "nudge_deep_work_dnd";
const K_DIGEST_ENABLED: &str = "digest_enabled";
const K_DIGEST_TIME: &str = "digest_time";

const DEFAULT_NUDGE_REST_MIN: u32 = 45;
const DEFAULT_NUDGE_FRAG_THRESHOLD: u32 = 8;
const DEFAULT_NUDGE_FRAG_WINDOW: u32 = 5;
const DEFAULT_NUDGE_DEEP_WORK_MIN: u32 = 25;
const DEFAULT_DIGEST_TIME: &str = "18:00";

const DEFAULT_AI_BASE_URL: &str = "https://api.openai.com/v1";
const DEFAULT_AI_MODEL: &str = "gpt-4o-mini";

fn get_bool(conn: &Connection, key: &str, default: bool) -> bool {
    let Ok(v): Result<String, _> = conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [key],
        |r| r.get(0),
    ) else {
        return default;
    };
    v == "1" || v.eq_ignore_ascii_case("true")
}

/// 读取引擎与 AI 开关；缺省全部为开启（除 AI 默认关）。
pub fn load_flags(conn: &Connection) -> (bool, bool, bool, bool, bool) {
    (
        get_bool(conn, K_ENGINE_INPUT, true),
        get_bool(conn, K_ENGINE_CLIPBOARD, true),
        get_bool(conn, K_ENGINE_NOTIFICATIONS, true),
        get_bool(conn, K_ENGINE_AMBIENT, true),
        get_bool(conn, K_AI_ENABLED, false),
    )
}

pub fn set_flag(conn: &mut Connection, key: &str, value: bool) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().timestamp_millis();
    let s = if value { "1" } else { "0" };
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, s, now],
    )?;
    Ok(())
}

pub fn key_engine_input() -> &'static str {
    K_ENGINE_INPUT
}
pub fn key_engine_clipboard() -> &'static str {
    K_ENGINE_CLIPBOARD
}
pub fn key_engine_notifications() -> &'static str {
    K_ENGINE_NOTIFICATIONS
}
pub fn key_engine_ambient() -> &'static str {
    K_ENGINE_AMBIENT
}
pub fn key_ai_enabled() -> &'static str {
    K_AI_ENABLED
}

pub fn get_ai_privacy_acknowledged(conn: &Connection) -> bool {
    get_bool(conn, K_AI_PRIVACY_ACK, false)
}

pub fn set_ai_privacy_acknowledged(conn: &mut Connection, v: bool) -> rusqlite::Result<()> {
    set_flag(conn, K_AI_PRIVACY_ACK, v)
}

pub fn get_ai_base_url(conn: &Connection) -> String {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [K_AI_BASE_URL],
        |r| r.get::<_, String>(0),
    )
    .unwrap_or_else(|_| DEFAULT_AI_BASE_URL.to_string())
}

pub fn get_ai_model(conn: &Connection) -> String {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [K_AI_MODEL],
        |r| r.get::<_, String>(0),
    )
    .unwrap_or_else(|_| DEFAULT_AI_MODEL.to_string())
}

/// 返回是否已配置非空 API Key（不返回密钥本身）。
pub fn has_ai_api_key(conn: &Connection) -> bool {
    let Ok(v): Result<String, _> = conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [K_AI_API_KEY],
        |r| r.get(0),
    ) else {
        return false;
    };
    !v.trim().is_empty()
}

pub fn get_ai_api_key(conn: &Connection) -> Option<String> {
    let Ok(v): Result<String, _> = conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [K_AI_API_KEY],
        |r| r.get(0),
    ) else {
        return None;
    };
    let t = v.trim();
    if t.is_empty() {
        None
    } else {
        Some(v)
    }
}

pub fn set_ai_base_url(conn: &mut Connection, url: &str) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().timestamp_millis();
    let s = url.trim();
    let s = if s.is_empty() {
        DEFAULT_AI_BASE_URL
    } else {
        s
    };
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![K_AI_BASE_URL, s, now],
    )?;
    Ok(())
}

pub fn set_ai_model(conn: &mut Connection, model: &str) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().timestamp_millis();
    let s = model.trim();
    let s = if s.is_empty() { DEFAULT_AI_MODEL } else { s };
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![K_AI_MODEL, s, now],
    )?;
    Ok(())
}

pub fn set_ai_api_key(conn: &mut Connection, key: &str) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![K_AI_API_KEY, key.trim(), now],
    )?;
    Ok(())
}

/// 应用名黑名单（JSON 字符串数组），供设置页与后续采集过滤消费。
pub fn get_app_blacklist(conn: &Connection) -> Vec<String> {
    let Ok(json_s): Result<String, _> = conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [K_APP_BLACKLIST],
        |r| r.get(0),
    ) else {
        return Vec::new();
    };
    serde_json::from_str(&json_s).unwrap_or_default()
}

pub fn set_app_blacklist(conn: &mut Connection, apps: &[String]) -> rusqlite::Result<()> {
    let v = serde_json::to_string(apps).unwrap_or_else(|_| "[]".into());
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![K_APP_BLACKLIST, v, now],
    )?;
    Ok(())
}

/// 与 Session / 前台采样中的 `app_name` **精确匹配**（trim 后非空项）；大小写敏感。
pub fn get_ocr_enabled(conn: &Connection) -> bool {
    get_bool(conn, K_OCR_ENABLED, false)
}

pub fn get_ocr_privacy_acknowledged(conn: &Connection) -> bool {
    get_bool(conn, K_OCR_PRIVACY_ACK, false)
}

pub fn get_ocr_allow_export_to_ai(conn: &Connection) -> bool {
    get_bool(conn, K_OCR_ALLOW_EXPORT, false)
}

pub fn get_ocr_show_session_summary(conn: &Connection) -> bool {
    get_bool(conn, K_OCR_SHOW_SUMMARY, true)
}

pub fn set_ocr_enabled(conn: &mut Connection, v: bool) -> rusqlite::Result<()> {
    set_flag(conn, K_OCR_ENABLED, v)
}

pub fn set_ocr_privacy_acknowledged(conn: &mut Connection, v: bool) -> rusqlite::Result<()> {
    set_flag(conn, K_OCR_PRIVACY_ACK, v)
}

pub fn set_ocr_allow_export_to_ai(conn: &mut Connection, v: bool) -> rusqlite::Result<()> {
    set_flag(conn, K_OCR_ALLOW_EXPORT, v)
}

pub fn set_ocr_show_session_summary(conn: &mut Connection, v: bool) -> rusqlite::Result<()> {
    set_flag(conn, K_OCR_SHOW_SUMMARY, v)
}

fn get_setting_str(conn: &Connection, key: &str, default: &str) -> String {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [key],
        |r| r.get::<_, String>(0),
    )
    .unwrap_or_else(|_| default.to_string())
}

pub fn set_setting_str(conn: &mut Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, value, now],
    )?;
    Ok(())
}

/// 当前 OCR 管线参数（环境变量可覆盖语言与 PSM）。
pub fn get_ocr_pipeline_config(conn: &Connection) -> crate::core::ocr::OcrPipelineConfig {
    use crate::core::ocr::OcrPipelineConfig;
    let env_lang = std::env::var("TIMELENS_OCR_LANG").unwrap_or_default();
    let languages = if !env_lang.trim().is_empty() {
        env_lang
    } else {
        get_setting_str(conn, K_OCR_LANGUAGES, "chi_sim+eng")
    };
    let mut psm = get_setting_str(conn, K_OCR_PSM, "6")
        .parse::<i32>()
        .unwrap_or(6)
        .clamp(0, 13);
    if let Ok(ep) = std::env::var("TIMELENS_OCR_PSM") {
        if let Ok(n) = ep.trim().parse::<i32>() {
            psm = n.clamp(0, 13);
        }
    }
    let word_conf = get_setting_str(conn, K_OCR_WORD_CONF_MIN, "60")
        .parse::<f32>()
        .unwrap_or(60.0)
        .clamp(0.0, 100.0);
    let line_conf = get_setting_str(conn, K_OCR_LINE_CONF_MIN, "45")
        .parse::<f32>()
        .unwrap_or(45.0)
        .clamp(0.0, 100.0);
    OcrPipelineConfig {
        languages,
        psm,
        word_conf_min: word_conf,
        line_conf_min: line_conf,
        preprocess_scale: get_bool(conn, K_OCR_PREPROCESS_SCALE, false),
        preprocess_dark_invert: get_bool(conn, K_OCR_PREPROCESS_INVERT, false),
    }
}

/// 写入 OCR 管线高级参数（空字符串表示跳过该项）。
pub fn apply_ocr_pipeline_overrides(
    conn: &mut Connection,
    languages: Option<&str>,
    psm: Option<i32>,
    word_conf_min: Option<f32>,
    line_conf_min: Option<f32>,
    preprocess_scale: Option<bool>,
    preprocess_dark_invert: Option<bool>,
) -> rusqlite::Result<()> {
    if let Some(s) = languages {
        let t = s.trim();
        if !t.is_empty() {
            set_setting_str(conn, K_OCR_LANGUAGES, t)?;
        }
    }
    if let Some(n) = psm {
        set_setting_str(conn, K_OCR_PSM, &n.to_string())?;
    }
    if let Some(f) = word_conf_min {
        set_setting_str(conn, K_OCR_WORD_CONF_MIN, &format!("{f}"))?;
    }
    if let Some(f) = line_conf_min {
        set_setting_str(conn, K_OCR_LINE_CONF_MIN, &format!("{f}"))?;
    }
    if let Some(v) = preprocess_scale {
        set_flag(conn, K_OCR_PREPROCESS_SCALE, v)?;
    }
    if let Some(v) = preprocess_dark_invert {
        set_flag(conn, K_OCR_PREPROCESS_INVERT, v)?;
    }
    Ok(())
}

/// UI 语言偏好（"zh-CN" 或 "en"），缺省返回 "en"。
pub fn get_language(conn: &Connection) -> String {
    get_setting_str(conn, K_LANGUAGE, DEFAULT_LANGUAGE)
}

pub fn set_language(conn: &mut Connection, lang: &str) -> rusqlite::Result<()> {
    set_setting_str(conn, K_LANGUAGE, lang.trim())
}

/// 周起始日：0 = 周日，1 = 周一（默认）。
pub fn get_week_start_day(conn: &Connection) -> u8 {
    get_setting_str(conn, K_WEEK_START_DAY, "1")
        .parse::<u8>()
        .unwrap_or(1)
        .min(1)
}

pub fn set_week_start_day(conn: &mut Connection, day: u8) -> rusqlite::Result<()> {
    let v = (day.min(1)).to_string();
    set_setting_str(conn, K_WEEK_START_DAY, &v)
}

pub fn get_autostart_enabled(conn: &Connection) -> bool {
    get_bool(conn, K_AUTOSTART_ENABLED, false)
}

pub fn set_autostart_enabled(conn: &mut Connection, v: bool) -> rusqlite::Result<()> {
    set_flag(conn, K_AUTOSTART_ENABLED, v)
}

pub fn app_name_blacklisted(name: &str, blacklist: &[String]) -> bool {
    blacklist.iter().any(|e| {
        let t = e.trim();
        !t.is_empty() && t == name
    })
}

/// Phase 11: 智能提醒与专注守护配置。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NudgeConfig {
    pub enabled: bool,
    pub rest_minutes: u32,
    pub frag_threshold: u32,
    pub frag_window_min: u32,
    pub deep_work_minutes: u32,
    pub deep_work_dnd: bool,
}

impl Default for NudgeConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            rest_minutes: DEFAULT_NUDGE_REST_MIN,
            frag_threshold: DEFAULT_NUDGE_FRAG_THRESHOLD,
            frag_window_min: DEFAULT_NUDGE_FRAG_WINDOW,
            deep_work_minutes: DEFAULT_NUDGE_DEEP_WORK_MIN,
            deep_work_dnd: false,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestConfig {
    pub enabled: bool,
    pub time: String,
}

impl Default for DigestConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            time: DEFAULT_DIGEST_TIME.to_string(),
        }
    }
}

fn parse_u32_or(conn: &Connection, key: &str, default: u32) -> u32 {
    get_setting_str(conn, key, &default.to_string())
        .parse::<u32>()
        .unwrap_or(default)
}

pub fn get_nudge_config(conn: &Connection) -> NudgeConfig {
    NudgeConfig {
        enabled: get_bool(conn, K_NUDGE_ENABLED, true),
        rest_minutes: parse_u32_or(conn, K_NUDGE_REST_MINUTES, DEFAULT_NUDGE_REST_MIN)
            .clamp(15, 120),
        frag_threshold: parse_u32_or(conn, K_NUDGE_FRAG_THRESHOLD, DEFAULT_NUDGE_FRAG_THRESHOLD)
            .clamp(3, 20),
        frag_window_min: parse_u32_or(conn, K_NUDGE_FRAG_WINDOW_MIN, DEFAULT_NUDGE_FRAG_WINDOW)
            .clamp(3, 15),
        deep_work_minutes: parse_u32_or(
            conn,
            K_NUDGE_DEEP_WORK_MINUTES,
            DEFAULT_NUDGE_DEEP_WORK_MIN,
        )
        .clamp(10, 60),
        deep_work_dnd: get_bool(conn, K_NUDGE_DEEP_WORK_DND, false),
    }
}

pub fn set_nudge_config(conn: &mut Connection, c: &NudgeConfig) -> rusqlite::Result<()> {
    set_flag(conn, K_NUDGE_ENABLED, c.enabled)?;
    set_setting_str(
        conn,
        K_NUDGE_REST_MINUTES,
        &c.rest_minutes.clamp(15, 120).to_string(),
    )?;
    set_setting_str(
        conn,
        K_NUDGE_FRAG_THRESHOLD,
        &c.frag_threshold.clamp(3, 20).to_string(),
    )?;
    set_setting_str(
        conn,
        K_NUDGE_FRAG_WINDOW_MIN,
        &c.frag_window_min.clamp(3, 15).to_string(),
    )?;
    set_setting_str(
        conn,
        K_NUDGE_DEEP_WORK_MINUTES,
        &c.deep_work_minutes.clamp(10, 60).to_string(),
    )?;
    set_flag(conn, K_NUDGE_DEEP_WORK_DND, c.deep_work_dnd)?;
    Ok(())
}

fn is_valid_hhmm(s: &str) -> bool {
    let t = s.trim();
    if t.len() != 5 {
        return false;
    }
    let bytes = t.as_bytes();
    if bytes[2] != b':' {
        return false;
    }
    let h = t[0..2].parse::<u32>().ok();
    let m = t[3..5].parse::<u32>().ok();
    matches!((h, m), (Some(h), Some(m)) if h < 24 && m < 60)
}

pub fn get_digest_config(conn: &Connection) -> DigestConfig {
    let raw = get_setting_str(conn, K_DIGEST_TIME, DEFAULT_DIGEST_TIME);
    let time = if is_valid_hhmm(&raw) {
        raw
    } else {
        DEFAULT_DIGEST_TIME.to_string()
    };
    DigestConfig {
        enabled: get_bool(conn, K_DIGEST_ENABLED, true),
        time,
    }
}

pub fn set_digest_config(conn: &mut Connection, c: &DigestConfig) -> rusqlite::Result<()> {
    set_flag(conn, K_DIGEST_ENABLED, c.enabled)?;
    let time = if is_valid_hhmm(&c.time) {
        c.time.clone()
    } else {
        DEFAULT_DIGEST_TIME.to_string()
    };
    set_setting_str(conn, K_DIGEST_TIME, &time)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::app_name_blacklisted;

    #[test]
    fn blacklist_exact_trim() {
        let b = vec![" WeChat ".to_string(), "Chrome".to_string()];
        assert!(app_name_blacklisted("WeChat", &b));
        assert!(!app_name_blacklisted("wechat", &b));
        assert!(app_name_blacklisted("Chrome", &b));
    }

    #[test]
    fn hhmm_parser() {
        use super::is_valid_hhmm;
        assert!(is_valid_hhmm("00:00"));
        assert!(is_valid_hhmm("23:59"));
        assert!(is_valid_hhmm("18:00"));
        assert!(!is_valid_hhmm("24:00"));
        assert!(!is_valid_hhmm("18:60"));
        assert!(!is_valid_hhmm("1:00"));
        assert!(!is_valid_hhmm("18-00"));
        assert!(!is_valid_hhmm(""));
    }
}
