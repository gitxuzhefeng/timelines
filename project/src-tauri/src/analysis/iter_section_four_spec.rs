//! 《二期_手工验证测试指南》§四 的**自动化子集**（对应 TC-13、TC-14、TC-17～TC-20）。
//!
//! **不覆盖**（需真机/UI）：TC-15 键鼠钩子、TC-16 Windows Toast、TC-21 Lightbox。
//! 运行：`cargo test -p timelens iter_section_four --manifest-path src-tauri/Cargo.toml`

use rusqlite::{params, Connection};
use serde_json::{json, Value};

use super::{build_fact_only_markdown, generate_daily_analysis_into};
use crate::core::storage::migrations::run_migrations;
use crate::core::time_range::local_day_bounds_ms;

fn conn_migrated() -> Connection {
    let mut c = Connection::open_in_memory().unwrap();
    run_migrations(&mut c).unwrap();
    c
}

/// TC-13（数据层）：`copy`+`paste` 共用 `flow_pair_id` → `clipboard_pairs` / `top_flows` 写入 `daily_analysis`。
#[test]
fn tc13_clipboard_flow_pair_aggregates() {
    let mut c = conn_migrated();
    let date = "2031-03-10";
    let (ds, de) = local_day_bounds_ms(date).unwrap();
    let ts = ds + 500_000;
    assert!(ts < de);
    c.execute(
        "INSERT INTO window_sessions (id, start_ms, end_ms, duration_ms, app_name, bundle_id, window_title, \
         extracted_url, extracted_file_path, intent, raw_event_count, is_active) \
         VALUES ('ws1', ?1, ?2, 600000, 'A', NULL, 'a', NULL, NULL, NULL, 1, 0)",
        params![ts, ts + 600_000],
    )
    .unwrap();
    c.execute(
        "INSERT INTO app_switches (id, timestamp_ms, from_app, from_bundle_id, from_window_title, \
         to_app, to_bundle_id, to_window_title, from_session_duration_ms, switch_type) \
         VALUES ('sw1', ?1, 'A', NULL, 'a', 'B', NULL, 'b', 1, 'voluntary')",
        params![ts + 10_000],
    )
    .unwrap();
    let pair = "pair-tc13";
    c.execute(
        "INSERT INTO clipboard_flows (id, timestamp_ms, action, app_name, bundle_id, content_type, content_length, flow_pair_id) \
         VALUES ('cf_c', ?1, 'copy', 'Chrome', NULL, 'plain_text', 12, ?2)",
        params![ts + 20_000, pair],
    )
    .unwrap();
    c.execute(
        "INSERT INTO clipboard_flows (id, timestamp_ms, action, app_name, bundle_id, content_type, content_length, flow_pair_id) \
         VALUES ('cf_p', ?1, 'paste', 'Cursor', NULL, 'plain_text', 12, ?2)",
        params![ts + 25_000, pair],
    )
    .unwrap();

    generate_daily_analysis_into(&mut c, date).unwrap();
    let pairs: Option<i64> = c
        .query_row(
            "SELECT clipboard_pairs FROM daily_analysis WHERE analysis_date = ?1",
            [date],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(pairs, Some(1));
    let top: String = c
        .query_row(
            "SELECT top_flows FROM daily_analysis WHERE analysis_date = ?1",
            [date],
            |r| r.get(0),
        )
        .unwrap();
    let v: Value = serde_json::from_str(&top).unwrap();
    let arr = v.as_array().unwrap();
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["from"], "Chrome");
    assert_eq!(arr[0]["to"], "Cursor");
}

/// TC-14：`ambient_context` 行 → `scene_breakdown` JSON（含 `scene_ms`）。
#[test]
fn tc14_scene_breakdown_from_ambient() {
    let mut c = conn_migrated();
    let date = "2031-03-11";
    let (ds, de) = local_day_bounds_ms(date).unwrap();
    let ts = ds + 800_000;
    assert!(ts < de);
    c.execute(
        "INSERT INTO window_sessions (id, start_ms, end_ms, duration_ms, app_name, bundle_id, window_title, \
         extracted_url, extracted_file_path, intent, raw_event_count, is_active) \
         VALUES ('ws1', ?1, ?2, 100000, 'X', NULL, 'x', NULL, NULL, NULL, 1, 0)",
        params![ts, ts + 100_000],
    )
    .unwrap();
    c.execute(
        "INSERT INTO app_switches (id, timestamp_ms, from_app, from_bundle_id, from_window_title, \
         to_app, to_bundle_id, to_window_title, from_session_duration_ms, switch_type) \
         VALUES ('sw1', ?1, 'X', NULL, 'x', 'Y', NULL, 'y', 1, 'voluntary')",
        params![ts + 5000],
    )
    .unwrap();
    // 办公室：外接显示 + 充电
    c.execute(
        "INSERT INTO ambient_context (id, timestamp_ms, wifi_ssid, display_count, is_external_display, \
         battery_level, is_charging, is_camera_active, is_audio_input_active, is_dnd_enabled, screen_brightness, active_space_index) \
         VALUES ('a1', ?1, 'LabWiFi', 2, 1, 80.0, 1, 0, 0, 0, NULL, NULL)",
        params![ts + 10_000],
    )
    .unwrap();

    generate_daily_analysis_into(&mut c, date).unwrap();
    let scene: String = c
        .query_row(
            "SELECT scene_breakdown FROM daily_analysis WHERE analysis_date = ?1",
            [date],
            |r| r.get(0),
        )
        .unwrap();
    let v: Value = serde_json::from_str(&scene).unwrap();
    assert!(v.get("scene_ms").is_some());
    let sm = v["scene_ms"].as_object().unwrap();
    assert!(sm.contains_key("办公室"));
}

/// TC-17：`degraded_sections` 含 clipboard/ambient/input；无 `input_metrics` 时 REAL 列为 NULL。
#[test]
fn tc17_degraded_and_input_metrics_null_columns() {
    let mut c = conn_migrated();
    let date = "2031-03-12";
    let (ds, _de) = local_day_bounds_ms(date).unwrap();
    let ts = ds + 100_000;
    c.execute(
        "INSERT INTO window_sessions (id, start_ms, end_ms, duration_ms, app_name, bundle_id, window_title, \
         extracted_url, extracted_file_path, intent, raw_event_count, is_active) \
         VALUES ('ws1', ?1, ?2, 300000, 'Only', NULL, 'o', NULL, NULL, NULL, 1, 0)",
        params![ts, ts + 300_000],
    )
    .unwrap();
    c.execute(
        "INSERT INTO app_switches (id, timestamp_ms, from_app, from_bundle_id, from_window_title, \
         to_app, to_bundle_id, to_window_title, from_session_duration_ms, switch_type) \
         VALUES ('sw1', ?1, 'Only', NULL, 'o', 'Y', NULL, 'y', 1, 'voluntary')",
        params![ts + 5000],
    )
    .unwrap();

    generate_daily_analysis_into(&mut c, date).unwrap();
    let degraded: String = c
        .query_row(
            "SELECT degraded_sections FROM daily_analysis WHERE analysis_date = ?1",
            [date],
            |r| r.get(0),
        )
        .unwrap();
    let deg: Vec<String> = serde_json::from_str(&degraded).unwrap();
    assert!(
        deg.iter().any(|x| x == "clipboard_flows"),
        "deg={deg:?}"
    );
    assert!(
        deg.iter().any(|x| x == "ambient_context"),
        "deg={deg:?}"
    );
    assert!(deg.iter().any(|x| x == "input_metrics"), "deg={deg:?}");
    assert!(deg.iter().any(|x| x == "notifications"), "deg={deg:?}");

    let avg_kpm: Option<f64> = c
        .query_row(
            "SELECT avg_kpm FROM daily_analysis WHERE analysis_date = ?1",
            [date],
            |r| r.get(0),
        )
        .unwrap();
    assert!(
        avg_kpm.is_none(),
        "expected NULL avg_kpm when input_metrics empty, got {avg_kpm:?}"
    );
}

/// TC-18：`data_sources` 含 `notification_detection`；切换链恢复样本时 `interrupt_recovery_basis` 正确。
#[test]
fn tc18_data_sources_notification_detection_and_switch_recovery() {
    let mut c = conn_migrated();
    let date = "2031-03-13";
    let (ds, _de) = local_day_bounds_ms(date).unwrap();
    let t0 = ds + 1_000_000;
    c.execute(
        "INSERT INTO window_sessions (id, start_ms, end_ms, duration_ms, app_name, bundle_id, window_title, \
         extracted_url, extracted_file_path, intent, raw_event_count, is_active) \
         VALUES ('ws1', ?1, ?2, 3600000, 'IDE', NULL, 'c', NULL, NULL, NULL, 1, 0)",
        params![t0, t0 + 3_600_000],
    )
    .unwrap();
    c.execute(
        "INSERT INTO app_switches (id, timestamp_ms, from_app, from_bundle_id, from_window_title, \
         to_app, to_bundle_id, to_window_title, from_session_duration_ms, switch_type) \
         VALUES ('n1', ?1, 'IDE', NULL, 'c', 'Slack', NULL, 's', 100, 'notification')",
        params![t0 + 60_000],
    )
    .unwrap();
    c.execute(
        "INSERT INTO app_switches (id, timestamp_ms, from_app, from_bundle_id, from_window_title, \
         to_app, to_bundle_id, to_window_title, from_session_duration_ms, switch_type) \
         VALUES ('r1', ?1, 'Slack', NULL, 's', 'IDE', NULL, 'c', 200, 'voluntary')",
        params![t0 + 120_000],
    )
    .unwrap();

    generate_daily_analysis_into(&mut c, date).unwrap();
    let ds_json: String = c
        .query_row(
            "SELECT data_sources FROM daily_analysis WHERE analysis_date = ?1",
            [date],
            |r| r.get(0),
        )
        .unwrap();
    let v: Value = serde_json::from_str(&ds_json).unwrap();
    assert_eq!(
        v["notification_detection"],
        json!("foreground_short_bounce_heuristic")
    );
    assert_eq!(
        v["interrupt_recovery_basis"],
        json!("switch_return_to_from_app")
    );
    assert!(v.get("interrupt_recovery_avg_ms").is_some());
}

/// TC-19：报告 Markdown §6/§7/§4 与字段、降级语义一致（无「P1 未展开」类旧占位）。
#[test]
fn tc19_report_markdown_sections_four_six_seven() {
    let degraded = serde_json::to_string(&vec![
        "notifications".to_string(),
        "input_metrics".to_string(),
    ])
    .unwrap();
    let data_sources = serde_json::to_string(&json!({
        "interrupt_recovery_avg_ms": 60000.0,
        "interrupt_recovery_basis": "switch_return_to_from_app",
        "notification_detection": "foreground_short_bounce_heuristic",
    }))
    .unwrap();
    let md = build_fact_only_markdown(
        "2031-03-14",
        3_600_000,
        "{}",
        "[]",
        2,
        "{}",
        "[]",
        0,
        0.0,
        0,
        "[]",
        0,
        &data_sources,
        None,
        "{}",
        None,
        None,
        None,
        &degraded,
        Some(2),
        Some(r#"[{"from":"A","to":"B","count":1}]"#),
        Some(r#"{"scene_ms":{"办公室":30000},"dnd_ms":0,"sample_interval_ms":30000}"#),
    );
    assert!(
        md.contains("## 6. 信息流向"),
        "missing §6: {}",
        &md[..md.len().min(200)]
    );
    assert!(md.contains("完成搬运对数"));
    assert!(md.contains("Top 5 应用间流向"));
    assert!(md.contains("## 7. 环境上下文"));
    assert!(md.contains("scene_ms"));
    assert!(md.contains("平均恢复成本（通知类切换后回到原前台，ms）"));
    assert!(
        !md.contains("P1：`clipboard_flows` 聚合未在本版本展开"),
        "should not use legacy P1 clipboard placeholder"
    );
    let md_deg_clip = build_fact_only_markdown(
        "2031-03-15",
        0,
        "{}",
        "[]",
        0,
        "{}",
        "[]",
        0,
        0.0,
        0,
        "[]",
        0,
        "{}",
        None,
        "{}",
        None,
        None,
        None,
        &serde_json::to_string(&vec!["clipboard_flows".to_string()]).unwrap(),
        None,
        None,
        None,
    );
    assert!(md_deg_clip.contains("剪贴板流水不可用"));
    assert!(md_deg_clip.contains("按降级策略跳过"));
}

/// TC-20：`daily_reports` 对同一日多条 `fact_only`，`ORDER BY generated_at_ms DESC LIMIT 1` 取最新正文。
#[test]
fn tc20_fact_only_append_latest_content_md() {
    let mut c = conn_migrated();
    let date = "2031-03-16";
    let (ds, _de) = local_day_bounds_ms(date).unwrap();
    let ts = ds + 100_000;
    c.execute(
        "INSERT INTO window_sessions (id, start_ms, end_ms, duration_ms, app_name, bundle_id, window_title, \
         extracted_url, extracted_file_path, intent, raw_event_count, is_active) \
         VALUES ('ws1', ?1, ?2, 100000, 'Z', NULL, 'z', NULL, NULL, NULL, 1, 0)",
        params![ts, ts + 100_000],
    )
    .unwrap();
    c.execute(
        "INSERT INTO app_switches (id, timestamp_ms, from_app, from_bundle_id, from_window_title, \
         to_app, to_bundle_id, to_window_title, from_session_duration_ms, switch_type) \
         VALUES ('sw1', ?1, 'Z', NULL, 'z', 'Y', NULL, 'y', 1, 'voluntary')",
        params![ts + 2000],
    )
    .unwrap();

    let aid = generate_daily_analysis_into(&mut c, date).unwrap();
    c.execute(
        "INSERT INTO daily_reports (id, analysis_id, report_date, generated_at_ms, report_type, content_md) \
         VALUES ('r_old', ?1, ?2, 1000, 'fact_only', 'older-markdown')",
        params![aid, date],
    )
    .unwrap();
    c.execute(
        "INSERT INTO daily_reports (id, analysis_id, report_date, generated_at_ms, report_type, content_md) \
         VALUES ('r_new', ?1, ?2, 9999, 'fact_only', 'newer-markdown')",
        params![aid, date],
    )
    .unwrap();

    let latest: String = c
        .query_row(
            "SELECT content_md FROM daily_reports WHERE report_date = ?1 AND report_type = ?2 \
             ORDER BY generated_at_ms DESC LIMIT 1",
            params![date, "fact_only"],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(latest, "newer-markdown");

    let n: i64 = c
        .query_row(
            "SELECT COUNT(*) FROM daily_reports WHERE report_date = ?1 AND report_type = 'fact_only'",
            [date],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(n, 2);
}
