//! HTTP 守护进程调用的命令分发（与 Tauri `invoke` 对齐）。
//! SAFETY: `State` 与 `&AppState` 内存布局一致（均为对 `AppState` 的引用）。

use serde::Deserialize;
use serde_json::Value;
use tauri::State;

use crate::AppState;

use super::commands::*;

#[inline]
unsafe fn as_state<'a>(s: &'a AppState) -> State<'a, AppState> {
    std::mem::transmute::<&'a AppState, State<'a, AppState>>(s)
}

fn to_json<T: serde::Serialize>(v: T) -> Result<Value, String> {
    serde_json::to_value(v).map_err(|e| e.to_string())
}

/// 解析 Tauri 前端传入的 camelCase / snake_case 混合对象。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetSessionsArgs {
    date: String,
    app_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetIntentBatchArgs {
    items: Vec<AppIntentBatchItem>,
}

pub fn dispatch_invoke(app: &AppState, cmd: &str, args: Value) -> Result<Value, String> {
    unsafe {
        let st = as_state(app);
        match cmd {
            "start_tracking" => {
                start_tracking(st)?;
                Ok(Value::Null)
            }
            "stop_tracking" => {
                stop_tracking(st)?;
                Ok(Value::Null)
            }
            "is_tracking" => to_json(is_tracking(st)),
            "restart_tracking" => to_json(restart_tracking(st)?),
            "trigger_screenshot" => {
                trigger_screenshot(st)?;
                Ok(Value::Null)
            }
            "check_permissions" => to_json(check_permissions(st)?),
            "request_screen_capture_access" => {
                to_json(request_screen_capture_access(st)?)
            }
            "open_accessibility_settings" => {
                open_accessibility_settings()?;
                Ok(Value::Null)
            }
            "open_screen_recording_settings" => {
                open_screen_recording_settings()?;
                Ok(Value::Null)
            }
            "open_notification_settings" => {
                open_notification_settings()?;
                Ok(Value::Null)
            }
            "get_sessions" => {
                let a: GetSessionsArgs = serde_json::from_value(args)
                    .map_err(|e| format!("get_sessions args: {e}"))?;
                to_json(get_sessions(st, a.date, a.app_name)?)
            }
            "get_session_snapshots" => {
                let raw = args
                    .get("sessionId")
                    .or_else(|| args.get("session_id"))
                    .ok_or("missing sessionId")?;
                let session_id: String =
                    serde_json::from_value(raw.clone()).map_err(|e| e.to_string())?;
                to_json(get_session_snapshots(st, session_id)?)
            }
            "get_activity_stats" => {
                let date: Option<String> = args
                    .get("date")
                    .and_then(|v| serde_json::from_value(v.clone()).ok());
                to_json(get_activity_stats(st, date)?)
            }
            "get_all_app_meta" => to_json(get_all_app_meta(st)?),
            "get_app_switches" => {
                let date: String = serde_json::from_value(
                    args.get("date").cloned().ok_or("missing date")?,
                )
                .map_err(|e| e.to_string())?;
                let limit = args.get("limit").and_then(|v| v.as_i64());
                to_json(get_app_switches(st, date, limit)?)
            }
            "get_storage_stats" => to_json(get_storage_stats(st)?),
            "open_data_dir" => {
                open_data_dir(st)?;
                Ok(Value::Null)
            }
            "get_raw_events_recent" => {
                let limit: i64 = serde_json::from_value(
                    args.get("limit").cloned().ok_or("missing limit")?,
                )
                .map_err(|e| e.to_string())?;
                to_json(get_raw_events_recent(st, limit)?)
            }
            "get_writer_stats" => to_json(get_writer_stats(st)),
            "run_retention_cleanup" => {
                run_retention_cleanup(st)?;
                Ok(Value::Null)
            }
            "checkpoint_wal" => {
                checkpoint_wal(st)?;
                Ok(Value::Null)
            }
            "get_pipeline_health" => to_json(get_pipeline_health(st)?),
            "get_engine_flags" => to_json(get_engine_flags(st)?),
            "set_engine_enabled" => {
                let name: String = serde_json::from_value(
                    args.get("name").cloned().ok_or("missing name")?,
                )
                .map_err(|e| e.to_string())?;
                let enabled: bool = serde_json::from_value(
                    args.get("enabled").cloned().ok_or("missing enabled")?,
                )
                .map_err(|e| e.to_string())?;
                set_engine_enabled(st, name, enabled)?;
                Ok(Value::Null)
            }
            "set_ai_enabled" => {
                let enabled: bool = serde_json::from_value(
                    args.get("enabled").cloned().ok_or("missing enabled")?,
                )
                .map_err(|e| e.to_string())?;
                set_ai_enabled(st, enabled)?;
                Ok(Value::Null)
            }
            "get_ai_settings" => to_json(get_ai_settings(st)?),
            "set_ai_privacy_acknowledged" => {
                let acknowledged: bool = serde_json::from_value(
                    args.get("acknowledged").cloned().ok_or("missing acknowledged")?,
                )
                .map_err(|e| e.to_string())?;
                set_ai_privacy_acknowledged(st, acknowledged)?;
                Ok(Value::Null)
            }
            "set_ai_settings" => {
                let base_url: Option<String> = args.get("baseUrl").and_then(|v| {
                    if v.is_null() {
                        None
                    } else {
                        serde_json::from_value(v.clone()).ok()
                    }
                });
                let model: Option<String> = args.get("model").and_then(|v| {
                    if v.is_null() {
                        None
                    } else {
                        serde_json::from_value(v.clone()).ok()
                    }
                });
                let api_key: Option<String> = args.get("apiKey").and_then(|v| {
                    if v.is_null() {
                        None
                    } else {
                        serde_json::from_value(v.clone()).ok()
                    }
                });
                set_ai_settings(st, base_url, model, api_key)?;
                Ok(Value::Null)
            }
            "update_session_intent" => {
                let session_id: String = serde_json::from_value(
                    args.get("sessionId")
                        .cloned()
                        .or_else(|| args.get("session_id").cloned())
                        .ok_or("missing sessionId")?,
                )
                .map_err(|e| e.to_string())?;
                let intent: Option<String> = args
                    .get("intent")
                    .filter(|v| !v.is_null())
                    .and_then(|v| serde_json::from_value(v.clone()).ok());
                update_session_intent(st, session_id, intent)?;
                Ok(Value::Null)
            }
            "list_app_intent_aggregates" => to_json(list_app_intent_aggregates(st)?),
            "set_intent_for_app_aggregate" => {
                let app_name: String = serde_json::from_value(
                    args.get("appName")
                        .cloned()
                        .or_else(|| args.get("app_name").cloned())
                        .ok_or("missing appName")?,
                )
                .map_err(|e| e.to_string())?;
                let bundle_id: Option<String> = args
                    .get("bundleId")
                    .or_else(|| args.get("bundle_id"))
                    .filter(|v| !v.is_null())
                    .and_then(|v| serde_json::from_value(v.clone()).ok());
                let intent: Option<String> = args
                    .get("intent")
                    .filter(|v| !v.is_null())
                    .and_then(|v| serde_json::from_value(v.clone()).ok());
                to_json(set_intent_for_app_aggregate(st, app_name, bundle_id, intent)?)
            }
            "set_intent_for_app_aggregates_batch" => {
                let a: SetIntentBatchArgs =
                    serde_json::from_value(args).map_err(|e| e.to_string())?;
                to_json(set_intent_for_app_aggregates_batch(st, a.items)?)
            }
            "backfill_session_intents_from_mappings" => {
                to_json(backfill_session_intents_from_mappings(st)?)
            }
            "get_app_blacklist" => to_json(get_app_blacklist(st)?),
            "set_app_blacklist" => {
                let apps: Vec<String> = serde_json::from_value(
                    args.get("apps").cloned().ok_or("missing apps")?,
                )
                .map_err(|e| e.to_string())?;
                set_app_blacklist(st, apps)?;
                Ok(Value::Null)
            }
            "generate_daily_analysis" => {
                let date: String = serde_json::from_value(
                    args.get("date").cloned().ok_or("missing date")?,
                )
                .map_err(|e| e.to_string())?;
                to_json(generate_daily_analysis(st, date)?)
            }
            "get_daily_analysis" => {
                let date: String = serde_json::from_value(
                    args.get("date").cloned().ok_or("missing date")?,
                )
                .map_err(|e| e.to_string())?;
                to_json(get_daily_analysis(st, date)?)
            }
            "generate_daily_report" => {
                let date: String = serde_json::from_value(
                    args.get("date").cloned().ok_or("missing date")?,
                )
                .map_err(|e| e.to_string())?;
                let with_ai: bool = serde_json::from_value(
                    args.get("withAi")
                        .cloned()
                        .or_else(|| args.get("with_ai").cloned())
                        .ok_or("missing withAi")?,
                )
                .map_err(|e| e.to_string())?;
                to_json(generate_daily_report(st, date, with_ai)?)
            }
            "get_daily_report" => {
                let date: String = serde_json::from_value(
                    args.get("date").cloned().ok_or("missing date")?,
                )
                .map_err(|e| e.to_string())?;
                let report_type: Option<String> = args
                    .get("reportType")
                    .or_else(|| args.get("report_type"))
                    .filter(|v| !v.is_null())
                    .and_then(|v| serde_json::from_value(v.clone()).ok());
                to_json(get_daily_report(st, date, report_type)?)
            }
            "export_daily_report" => {
                let date: String = serde_json::from_value(
                    args.get("date").cloned().ok_or("missing date")?,
                )
                .map_err(|e| e.to_string())?;
                let report_type: Option<String> = args
                    .get("reportType")
                    .or_else(|| args.get("report_type"))
                    .filter(|v| !v.is_null())
                    .and_then(|v| serde_json::from_value(v.clone()).ok());
                to_json(export_daily_report(st, date, report_type)?)
            }
            "get_ocr_settings" => to_json(get_ocr_settings(st)?),
            "set_ocr_privacy_acknowledged" => {
                let acknowledged: bool = serde_json::from_value(
                    args.get("acknowledged").cloned().ok_or("missing acknowledged")?,
                )
                .map_err(|e| e.to_string())?;
                set_ocr_privacy_acknowledged(st, acknowledged)?;
                Ok(Value::Null)
            }
            "set_ocr_settings" => {
                let enabled: Option<bool> = args.get("enabled").and_then(|v| v.as_bool());
                let allow_export_to_ai: Option<bool> = args
                    .get("allowExportToAi")
                    .or_else(|| args.get("allow_export_to_ai"))
                    .and_then(|v| v.as_bool());
                let show_session_summary: Option<bool> = args
                    .get("showSessionSummary")
                    .or_else(|| args.get("show_session_summary"))
                    .and_then(|v| v.as_bool());
                let ocr_languages: Option<String> = args
                    .get("ocrLanguages")
                    .or_else(|| args.get("ocr_languages"))
                    .filter(|v| !v.is_null())
                    .and_then(|v| v.as_str().map(|s| s.to_string()));
                let ocr_psm: Option<i32> = args
                    .get("ocrPsm")
                    .or_else(|| args.get("ocr_psm"))
                    .and_then(|v| v.as_i64().map(|i| i as i32));
                let ocr_word_conf_min: Option<f32> = args
                    .get("ocrWordConfMin")
                    .or_else(|| args.get("ocr_word_conf_min"))
                    .and_then(|v| v.as_f64().map(|f| f as f32));
                let ocr_line_conf_min: Option<f32> = args
                    .get("ocrLineConfMin")
                    .or_else(|| args.get("ocr_line_conf_min"))
                    .and_then(|v| v.as_f64().map(|f| f as f32));
                let ocr_preprocess_scale: Option<bool> = args
                    .get("ocrPreprocessScale")
                    .or_else(|| args.get("ocr_preprocess_scale"))
                    .and_then(|v| v.as_bool());
                let ocr_preprocess_dark_invert: Option<bool> = args
                    .get("ocrPreprocessDarkInvert")
                    .or_else(|| args.get("ocr_preprocess_dark_invert"))
                    .and_then(|v| v.as_bool());
                to_json(set_ocr_settings(
                    st,
                    enabled,
                    allow_export_to_ai,
                    show_session_summary,
                    ocr_languages,
                    ocr_psm,
                    ocr_word_conf_min,
                    ocr_line_conf_min,
                    ocr_preprocess_scale,
                    ocr_preprocess_dark_invert,
                )?)
            }
            "get_ocr_status" => to_json(get_ocr_status(st)?),
            "get_session_ocr_context" => {
                let session_id: String = serde_json::from_value(
                    args.get("sessionId")
                        .cloned()
                        .or_else(|| args.get("session_id").cloned())
                        .ok_or("missing sessionId")?,
                )
                .map_err(|e| e.to_string())?;
                to_json(get_session_ocr_context(st, session_id)?)
            }
            "search_ocr_text" => {
                let query: String = serde_json::from_value(
                    args.get("query").cloned().ok_or("missing query")?,
                )
                .map_err(|e| e.to_string())?;
                let date: Option<String> = args
                    .get("date")
                    .filter(|v| !v.is_null())
                    .and_then(|v| serde_json::from_value(v.clone()).ok());
                let restrict_session_id: Option<String> = args
                    .get("restrictSessionId")
                    .or_else(|| args.get("restrict_session_id"))
                    .filter(|v| !v.is_null())
                    .and_then(|v| serde_json::from_value(v.clone()).ok());
                to_json(search_ocr_text(st, query, date, restrict_session_id)?)
            }
            "list_ocr_eval_samples" => {
                let limit: Option<i32> = args
                    .get("limit")
                    .filter(|v| !v.is_null())
                    .and_then(|v| v.as_i64().map(|i| i as i32));
                to_json(list_ocr_eval_samples(st, limit)?)
            }
            "evaluate_ocr_snapshot" => {
                let snapshot_id: String = serde_json::from_value(
                    args.get("snapshotId")
                        .cloned()
                        .or_else(|| args.get("snapshot_id").cloned())
                        .ok_or("missing snapshotId")?,
                )
                .map_err(|e| e.to_string())?;
                to_json(evaluate_ocr_snapshot(st, snapshot_id)?)
            }
            _ => Err(format!("unknown cmd: {cmd}")),
        }
    }
}
