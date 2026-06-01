use chrono::{Local, NaiveDate, TimeZone, Utc};

/// 本地日历日 `[start_ms, end_ms]`（含首尾毫秒）。
pub fn local_day_bounds_ms(date_yyyy_mm_dd: &str) -> Result<(i64, i64), String> {
    let d = NaiveDate::parse_from_str(date_yyyy_mm_dd, "%Y-%m-%d").map_err(|e| e.to_string())?;
    let start = Local
        .from_local_datetime(&d.and_hms_opt(0, 0, 0).unwrap())
        .single()
        .ok_or_else(|| "invalid local date".to_string())?
        .timestamp_millis();
    let end = Local
        .from_local_datetime(&d.and_hms_opt(23, 59, 59).unwrap())
        .single()
        .unwrap()
        .timestamp_millis()
        + 999;
    Ok((start, end))
}

/// 当日晚间时段：本地 18:00:00.000 – 当日 23:59:59.999。
pub fn local_evening_bounds_ms(date_yyyy_mm_dd: &str) -> Result<(i64, i64), String> {
    let d = NaiveDate::parse_from_str(date_yyyy_mm_dd, "%Y-%m-%d").map_err(|e| e.to_string())?;
    let start = Local
        .from_local_datetime(&d.and_hms_opt(18, 0, 0).unwrap())
        .single()
        .ok_or_else(|| "invalid local evening start".to_string())?
        .timestamp_millis();
    let (_, end) = local_day_bounds_ms(date_yyyy_mm_dd)?;
    Ok((start, end))
}

pub fn utc_now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evening_starts_at_18_local() {
        let date = Local::now().format("%Y-%m-%d").to_string();
        let (day_start, day_end) = local_day_bounds_ms(&date).unwrap();
        let (eve_start, eve_end) = local_evening_bounds_ms(&date).unwrap();
        assert!(eve_start >= day_start);
        assert_eq!(eve_end, day_end);
        let hours = (eve_start - day_start) / (3600 * 1000);
        assert_eq!(hours, 18);
    }
}
