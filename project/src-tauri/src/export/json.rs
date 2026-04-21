use chrono::Utc;
use serde_json::Value;

/// 将 `daily_analysis` JSON 字符串附加导出元字段后返回格式化 JSON 字符串。
pub fn daily_analysis_to_json(analysis_json: &str) -> Result<String, String> {
    let mut v: Value = serde_json::from_str(analysis_json).map_err(|e| e.to_string())?;
    if let Some(obj) = v.as_object_mut() {
        obj.insert(
            "export_version".into(),
            serde_json::Value::String("1.0".into()),
        );
        obj.insert(
            "exported_at".into(),
            serde_json::Value::String(Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()),
        );
        obj.insert(
            "schema".into(),
            serde_json::Value::String("timelens/daily_analysis/v1".into()),
        );
    }
    serde_json::to_string_pretty(&v).map_err(|e| e.to_string())
}
