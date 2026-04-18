mod analysis;
mod api;
pub mod bootstrap;
mod core;
pub mod event_sink;

pub use api::dispatch_invoke;
pub use event_sink::BroadcastEventSink;

use std::borrow::Cow;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use parking_lot::Mutex;
use tauri::http::{header, status::StatusCode, Response};
use tauri::Manager;

use crate::event_sink::{emit_ser, EventSink, TauriEventSink};

#[derive(Clone)]
pub struct AppState(pub Arc<AppStateInner>);

/// 为截图 WebP 提供 `timelens://localhost/snapshot/{id}` 响应（按 id 查库读盘）。
/// 注意：WebView2 / Android 上 `<img>` 等子资源须使用 `http://timelens.localhost/snapshot/{id}`，
/// 由 wry 还原为上述 scheme 后再进入本 handler（见 wry `custom_protocol_workaround`）。
fn timelens_uri_response<R: tauri::Runtime>(
    ctx: tauri::UriSchemeContext<'_, R>,
    request: tauri::http::Request<Vec<u8>>,
) -> Response<Cow<'static, [u8]>> {
    let nf = || {
        Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
            .body(Cow::from(&b"not found"[..]))
            .unwrap()
    };
    let path = request.uri().path();
    let id = path
        .strip_prefix("/snapshot/")
        .map(|s| s.trim_matches('/'))
        .filter(|s| !s.is_empty());
    let Some(id) = id else {
        return nf();
    };
    let Some(state) = ctx.app_handle().try_state::<AppState>() else {
        return nf();
    };
    let fp: rusqlite::Result<String> = state.0.read_conn.lock().query_row(
        "SELECT file_path FROM snapshots WHERE id = ?1",
        [id],
        |r| r.get(0),
    );
    let Ok(fp) = fp else {
        return nf();
    };
    if fp.is_empty() {
        return nf();
    }
    match std::fs::read(&fp) {
        Ok(data) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "image/webp")
            .body(Cow::from(data))
            .unwrap(),
        Err(_) => nf(),
    }
}

pub struct AppStateInner {
    pub paths: core::storage::DataPaths,
    pub read_conn: Arc<Mutex<rusqlite::Connection>>,
    pub writer: core::writer::WriterHandle,
    pub writer_metrics: Arc<core::writer::WriterMetrics>,
    pub tracking: Arc<AtomicBool>,
    pub running: Arc<AtomicBool>,
    pub is_afk: Arc<AtomicBool>,
    pub screen_ok: Arc<AtomicBool>,
    pub current_session: Arc<RwLock<Option<String>>>,
    pub capture_tx: crossbeam_channel::Sender<core::models::CaptureSignal>,
    pub engine_input: Arc<AtomicBool>,
    pub engine_clipboard: Arc<AtomicBool>,
    pub engine_notifications: Arc<AtomicBool>,
    pub engine_ambient: Arc<AtomicBool>,
    pub ai_enabled: Arc<AtomicBool>,
    /// 与 `settings.app_capture_blacklist` 同步；采集线程热读。
    pub app_blacklist: Arc<RwLock<Vec<String>>>,
    pub ocr_enabled: Arc<AtomicBool>,
    pub ocr_last_success_ms: Arc<AtomicI64>,
    pub ocr_last_error: Arc<Mutex<Option<String>>>,
    pub ocr_pending: Arc<AtomicUsize>,
    pub event_sink: Arc<dyn EventSink>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .register_uri_scheme_protocol("timelens", timelens_uri_response)
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let event_sink: Arc<dyn EventSink> =
                Arc::new(TauriEventSink { app: handle.clone() });
            let state = bootstrap::bootstrap_core(event_sink.clone())?;
            let screen_ok_on_focus = state.0.screen_ok.clone();
            app.manage(state.clone());
            if state.0.tracking.load(Ordering::Relaxed) {
                state.0.event_sink.emit_json(
                    "tracking_state_changed",
                    serde_json::json!({ "isRunning": true }),
                );
            }
            #[cfg(all(desktop, any(target_os = "macos", target_os = "windows")))]
            if let Some(win) = app.get_webview_window("main") {
                win.on_window_event(move |e| {
                    if matches!(e, tauri::WindowEvent::Focused(true)) {
                        screen_ok_on_focus.store(
                            core::acquisition::screen_capture_poll_check(),
                            Ordering::Relaxed,
                        );
                    }
                });
            }
            let ps = core::models::PermissionStatus {
                accessibility_granted: core::acquisition::ax_trusted(),
                screen_recording_granted: core::acquisition::screen_capture_granted(),
                notification_listener_granted: core::acquisition::notifications_listener_access_granted(),
            };
            emit_ser(state.0.event_sink.as_ref(), "permissions_required", &ps);
            #[cfg(all(desktop, any(target_os = "macos", target_os = "windows")))]
            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::TrayIconBuilder;
                let h = app.handle();
                let show = MenuItem::with_id(h, "show", "打开主窗口", true, None::<&str>)?;
                let start = MenuItem::with_id(h, "start", "开始采集", true, None::<&str>)?;
                let stop = MenuItem::with_id(h, "stop", "停止采集", true, None::<&str>)?;
                let quit = MenuItem::with_id(h, "quit", "退出", true, None::<&str>)?;
                let menu = Menu::with_items(h, &[&show, &start, &stop, &quit])?;
                let mut tray = TrayIconBuilder::with_id("timelens_tray")
                    .menu(&menu)
                    .show_menu_on_left_click(true)
                    .tooltip("TimeLens");
                if let Some(icon) = h.default_window_icon() {
                    tray = tray.icon(icon.clone());
                }
                let _tray_icon = tray
                    .on_menu_event(move |app, event| {
                        let id = event.id.as_ref();
                        match id {
                            "show" => {
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            }
                            "start" => {
                                if let Some(s) = app.try_state::<AppState>() {
                                    s.0.tracking.store(true, Ordering::Relaxed);
                                    s.0.event_sink.emit_json(
                                        "tracking_state_changed",
                                        serde_json::json!({ "isRunning": true }),
                                    );
                                }
                            }
                            "stop" => {
                                if let Some(s) = app.try_state::<AppState>() {
                                    s.0.tracking.store(false, Ordering::Relaxed);
                                    s.0.event_sink.emit_json(
                                        "tracking_state_changed",
                                        serde_json::json!({ "isRunning": false }),
                                    );
                                }
                            }
                            "quit" => app.exit(0),
                            _ => {}
                        }
                    })
                    .build(h)?;
                std::mem::forget(_tray_icon);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            api::start_tracking,
            api::stop_tracking,
            api::is_tracking,
            api::restart_tracking,
            api::trigger_screenshot,
            api::check_permissions,
            api::request_screen_capture_access,
            api::open_accessibility_settings,
            api::open_screen_recording_settings,
            api::open_notification_settings,
            api::get_sessions,
            api::get_session_snapshots,
            api::get_activity_stats,
            api::get_all_app_meta,
            api::get_app_switches,
            api::get_storage_stats,
            api::open_data_dir,
            api::get_raw_events_recent,
            api::get_writer_stats,
            api::run_retention_cleanup,
            api::checkpoint_wal,
            api::get_pipeline_health,
            api::get_engine_flags,
            api::set_engine_enabled,
            api::set_ai_enabled,
            api::get_ai_settings,
            api::set_ai_settings,
            api::set_ai_privacy_acknowledged,
            api::update_session_intent,
            api::list_app_intent_aggregates,
            api::set_intent_for_app_aggregate,
            api::set_intent_for_app_aggregates_batch,
            api::backfill_session_intents_from_mappings,
            api::get_app_blacklist,
            api::set_app_blacklist,
            api::generate_daily_analysis,
            api::get_daily_analysis,
            api::generate_daily_report,
            api::get_daily_report,
            api::export_daily_report,
            api::get_ocr_settings,
            api::set_ocr_settings,
            api::set_ocr_privacy_acknowledged,
            api::get_ocr_status,
            api::get_session_ocr_context,
            api::search_ocr_text,
            api::list_ocr_eval_samples,
            api::evaluate_ocr_snapshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
