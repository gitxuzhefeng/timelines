use crate::core::models::WindowSession;
use chrono::{Local, TimeZone};

/// 将 `Vec<WindowSession>` 序列化为 CSV 字节向量。
/// 列：date, start_time, end_time, duration_min, app_name, window_title, intent, extracted_url
pub fn sessions_to_csv(sessions: &[WindowSession]) -> Result<Vec<u8>, String> {
    let mut wtr = ::csv::WriterBuilder::new()
        .has_headers(true)
        .from_writer(vec![]);

    wtr.write_record([
        "date",
        "start_time",
        "end_time",
        "duration_min",
        "app_name",
        "window_title",
        "intent",
        "extracted_url",
    ])
    .map_err(|e| e.to_string())?;

    for s in sessions {
        let start = Local.timestamp_millis_opt(s.start_ms).single();
        let end = Local.timestamp_millis_opt(s.end_ms).single();
        let date_str = start
            .as_ref()
            .map(|d| d.format("%Y-%m-%d").to_string())
            .unwrap_or_default();
        let start_str = start
            .as_ref()
            .map(|d| d.format("%H:%M:%S").to_string())
            .unwrap_or_default();
        let end_str = end
            .as_ref()
            .map(|d| d.format("%H:%M:%S").to_string())
            .unwrap_or_default();
        let duration_min = format!("{:.2}", s.duration_ms as f64 / 60_000.0);
        let intent = s.intent.as_deref().unwrap_or("unclassified");
        let url = s.extracted_url.as_deref().unwrap_or("");

        wtr.write_record([
            &date_str,
            &start_str,
            &end_str,
            &duration_min,
            &s.app_name,
            &s.window_title,
            intent,
            url,
        ])
        .map_err(|e| e.to_string())?;
    }

    wtr.into_inner().map_err(|e| e.to_string())
}
