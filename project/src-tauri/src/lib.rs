mod analysis;
mod api;
mod core;

use std::borrow::Cow;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use parking_lot::Mutex;
use tauri::http::{header, status::StatusCode, Response};
use tauri::{Emitter, Manager};

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
            // Windows 渲染降载参数（transparent / shadow / WebView2 features）统一在
            // `tauri.conf.json` + `tauri.windows.conf.json` 中声明，不再在运行时注入。
            let paths = core::storage::DataPaths::new().map_err(|e| format!("{e}"))?;
            paths.ensure_dirs().map_err(|e| format!("{e}"))?;
            let wconn =
                core::storage::db::open_write(&paths.db_path).map_err(|e| format!("{e}"))?;
            let metrics = Arc::new(core::writer::WriterMetrics::default());
            let writer = core::writer::spawn_writer_thread(wconn, metrics.clone());
            let read_conn =
                core::storage::db::open_read(&paths.db_path).map_err(|e| format!("{e}"))?;
            let (ei, ec, en, ea, ai_on) = {
                let g = read_conn.lock();
                core::settings::load_flags(&g)
            };
            let engine_input = Arc::new(AtomicBool::new(ei));
            let engine_clipboard = Arc::new(AtomicBool::new(ec));
            let engine_notifications = Arc::new(AtomicBool::new(en));
            let engine_ambient = Arc::new(AtomicBool::new(ea));
            let ai_enabled = Arc::new(AtomicBool::new(ai_on));
            let app_blacklist = Arc::new(RwLock::new({
                let g = read_conn.lock();
                core::settings::get_app_blacklist(&g)
            }));
            let ocr_enabled = Arc::new(AtomicBool::new({
                let g = read_conn.lock();
                core::settings::get_ocr_enabled(&g)
            }));
            let ocr_last_success_ms = Arc::new(AtomicI64::new(-1));
            let ocr_last_error = Arc::new(Mutex::new(None));
            let ocr_pending = Arc::new(AtomicUsize::new(0));
            // 桌面端启动后默认开启采集（与产品预期一致）；无采集能力的平台保持 false。
            let tracking = Arc::new(AtomicBool::new(cfg!(any(
                target_os = "macos",
                target_os = "windows"
            ))));
            let running = Arc::new(AtomicBool::new(true));
            let is_afk = Arc::new(AtomicBool::new(false));
            let screen_ok = Arc::new(AtomicBool::new(false));
            #[cfg(any(target_os = "macos", target_os = "windows"))]
            {
                screen_ok.store(
                    core::acquisition::screen_capture_granted(),
                    Ordering::Relaxed,
                );
            }
            #[cfg(target_os = "macos")]
            core::acquisition::request_screen_capture_on_first_launch();
            let current_session = Arc::new(RwLock::new(None));
            let (agg_tx, agg_rx) = std::sync::mpsc::channel::<core::models::AggregationCmd>();
            let (cap_tx, cap_rx) =
                crossbeam_channel::bounded::<core::models::CaptureSignal>(64);
            let handle = app.handle().clone();
            core::aggregation::spawn_aggregation_thread(
                handle.clone(),
                agg_rx,
                writer.clone(),
                read_conn.clone(),
                current_session.clone(),
                is_afk.clone(),
            );
            #[cfg(any(target_os = "macos", target_os = "windows"))]
            {
                let (ocr_tx, ocr_rx) = crossbeam_channel::bounded::<core::ocr::OcrJob>(32);
                core::ocr::spawn_ocr_worker(
                    ocr_rx,
                    writer.clone(),
                    read_conn.clone(),
                    ocr_enabled.clone(),
                    app_blacklist.clone(),
                    ocr_last_success_ms.clone(),
                    ocr_last_error.clone(),
                    ocr_pending.clone(),
                );
                core::collection::capture::spawn_capture_thread(
                    cap_rx,
                    writer.clone(),
                    read_conn.clone(),
                    paths.clone(),
                    is_afk.clone(),
                    screen_ok.clone(),
                    handle.clone(),
                    Some((
                        ocr_tx,
                        ocr_enabled.clone(),
                        ocr_pending.clone(),
                    )),
                );
            }
            #[cfg(not(any(target_os = "macos", target_os = "windows")))]
            std::thread::spawn(move || {
                while cap_rx.recv().is_ok() {}
            });
            #[cfg(any(target_os = "macos", target_os = "windows"))]
            core::collection::tracker::spawn_tracker_thread(
                handle.clone(),
                agg_tx,
                cap_tx.clone(),
                writer.clone(),
                tracking.clone(),
                running.clone(),
                is_afk.clone(),
                current_session.clone(),
                engine_notifications.clone(),
                app_blacklist.clone(),
            );
            #[cfg(any(target_os = "macos", target_os = "windows"))]
            core::collection::phase2::spawn_phase2_collectors(
                writer.clone(),
                tracking.clone(),
                running.clone(),
                current_session.clone(),
                core::collection::phase2::Phase2EngineFlags {
                    input: engine_input.clone(),
                    clipboard: engine_clipboard.clone(),
                    ambient: engine_ambient.clone(),
                },
                app_blacklist.clone(),
            );
            #[cfg(target_os = "windows")]
            {
                core::acquisition::spawn_low_level_input_hooks(running.clone());
                core::collection::notifications_listener::spawn_system_notification_listener(
                    writer.clone(),
                    tracking.clone(),
                    running.clone(),
                    engine_notifications.clone(),
                );
            }
            let screen_ok_on_focus = screen_ok.clone();
            let wm_emit = metrics.clone();
            let state = AppState(Arc::new(AppStateInner {
                paths,
                read_conn,
                writer,
                writer_metrics: metrics,
                tracking,
                running,
                is_afk,
                screen_ok,
                current_session,
                capture_tx: cap_tx,
                engine_input,
                engine_clipboard,
                engine_notifications,
                engine_ambient,
                ai_enabled,
                app_blacklist,
                ocr_enabled,
                ocr_last_success_ms,
                ocr_last_error,
                ocr_pending,
            }));
            app.manage(state);
            if let Some(s) = handle.try_state::<AppState>() {
                if s.0.tracking.load(Ordering::Relaxed) {
                    let _ = handle.emit(
                        "tracking_state_changed",
                        serde_json::json!({ "isRunning": true }),
                    );
                }
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
            let wh = handle.clone();
            std::thread::spawn(move || {
                let mut tick: u64 = 0;
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(10));
                    tick += 1;
                    let _ = wh.emit("writer_stats_updated", wm_emit.snapshot(0));
                    if tick % 3 != 0 {
                        continue;
                    }
                    #[cfg(any(target_os = "macos", target_os = "windows"))]
                    {
                        let sr = core::acquisition::screen_capture_poll_check();
                        if let Some(s) = wh.try_state::<AppState>() {
                            s.0.screen_ok.store(sr, Ordering::Relaxed);
                        }
                        let ax = {
                            #[cfg(target_os = "macos")]
                            {
                                core::acquisition::ax_trusted()
                            }
                            #[cfg(not(target_os = "macos"))]
                            {
                                true
                            }
                        };
                        let ps = core::models::PermissionStatus {
                            accessibility_granted: ax,
                            screen_recording_granted: sr,
                            notification_listener_granted:
                                core::acquisition::notifications_listener_access_granted(),
                        };
                        let _ = wh.emit("permissions_required", ps);
                    }
                }
            });
            let ps = core::models::PermissionStatus {
                accessibility_granted: core::acquisition::ax_trusted(),
                screen_recording_granted: core::acquisition::screen_capture_granted(),
                notification_listener_granted: core::acquisition::notifications_listener_access_granted(),
            };
            let _ = handle.emit("permissions_required", ps);
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
                                    let _ = app.emit(
                                        "tracking_state_changed",
                                        serde_json::json!({ "isRunning": true }),
                                    );
                                }
                            }
                            "stop" => {
                                if let Some(s) = app.try_state::<AppState>() {
                                    s.0.tracking.store(false, Ordering::Relaxed);
                                    let _ = app.emit(
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
            api::get_language,
            api::set_language,
            api::get_app_version,
            api::check_for_update,
            api::open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
