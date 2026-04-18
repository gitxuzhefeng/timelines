//! 与 Tauri 无关的核心启动：数据库、采集线程、`AppState`。
//! Tauri 与守护进程共用。

use std::sync::atomic::{AtomicBool, AtomicI64, AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use parking_lot::Mutex;

use crate::core;
use crate::event_sink::{emit_ser, EventSink};
use crate::AppState;
use crate::AppStateInner;

pub fn bootstrap_core(event_sink: Arc<dyn EventSink>) -> Result<AppState, String> {
    let paths = core::storage::DataPaths::new().map_err(|e| format!("{e}"))?;
    paths.ensure_dirs().map_err(|e| format!("{e}"))?;
    let wconn = core::storage::db::open_write(&paths.db_path).map_err(|e| format!("{e}"))?;
    let metrics = Arc::new(core::writer::WriterMetrics::default());
    let writer = core::writer::spawn_writer_thread(wconn, metrics.clone());
    let read_conn = core::storage::db::open_read(&paths.db_path).map_err(|e| format!("{e}"))?;
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
    let (cap_tx, cap_rx) = crossbeam_channel::bounded::<core::models::CaptureSignal>(64);

    core::aggregation::spawn_aggregation_thread(
        event_sink.clone(),
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
            event_sink.clone(),
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
        event_sink.clone(),
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
        event_sink: event_sink.clone(),
    }));

    spawn_metrics_and_permission_loop(state.clone(), event_sink, wm_emit);

    Ok(state)
}

fn spawn_metrics_and_permission_loop(
    state: AppState,
    sink_bg: Arc<dyn EventSink>,
    wm_emit: Arc<core::writer::WriterMetrics>,
) {
    std::thread::spawn(move || {
        let mut tick: u64 = 0;
        loop {
            std::thread::sleep(std::time::Duration::from_secs(10));
            tick += 1;
            emit_ser(
                sink_bg.as_ref(),
                "writer_stats_updated",
                &wm_emit.snapshot(0),
            );
            if tick % 3 != 0 {
                continue;
            }
            #[cfg(any(target_os = "macos", target_os = "windows"))]
            {
                let sr = core::acquisition::screen_capture_poll_check();
                state.0.screen_ok.store(sr, Ordering::Relaxed);
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
                emit_ser(sink_bg.as_ref(), "permissions_required", &ps);
            }
        }
    });
}
