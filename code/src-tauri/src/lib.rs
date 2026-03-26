pub mod core;
pub mod services;
pub mod api;

use crate::core::collection::window_tracker::WindowTracker;
use crate::core::storage::db::Database;
use crate::core::collection::capture_service::CaptureService;
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};
use log::{info, warn};

// ─── macOS Permission Helpers ─────────────────────────────────────────────────

/// Check if Accessibility permission is granted (needed for osascript / System Events).
/// Passing `false` means "don't prompt" — we just query the current status.
#[cfg(target_os = "macos")]
pub fn has_accessibility_permission() -> bool {
    use std::process::Command;
    // osascript with a harmless script: if it succeeds, we have permission
    let out = Command::new("osascript")
        .args(["-e", "tell application \"System Events\" to get name of first process"])
        .output();
    matches!(out, Ok(o) if o.status.success())
}

/// Check if Screen Recording permission is granted.
#[cfg(target_os = "macos")]
pub fn has_screen_recording_permission() -> bool {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
    }
    unsafe { CGPreflightScreenCaptureAccess() }
}

/// Open the relevant System Preferences pane so the user can grant permission.
#[cfg(target_os = "macos")]
fn open_privacy_pane(pane: &str) {
    let _ = std::process::Command::new("open")
        .arg(format!("x-apple.systempreferences:com.apple.preference.security?Privacy_{}", pane))
        .spawn();
}

pub struct AppState {
    pub db: Arc<Mutex<Database>>,
    pub tracker: Mutex<WindowTracker>,
    pub capture_tx: tokio::sync::mpsc::Sender<crate::core::collection::capture_service::CaptureSignal>,
}

pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        // ── Register timelens:// URI scheme ──────────────────────────────────
        // Allows the frontend to load local screenshots via:
        //   <img src="timelens://shots/2026-03-18/abc.webp" />
        .register_uri_scheme_protocol("timelens", |ctx, request| {
            let app = ctx.app_handle();

            // Parse the path from "timelens://shots/YYYY-MM-DD/file.webp"
            let uri = request.uri().to_string();
            // uri looks like:  timelens://shots/2026-03-18/abc.webp
            // We strip the scheme prefix to get the relative path.
            let rel = uri
                .trim_start_matches("timelens://")
                .trim_start_matches("localhost/")
                .trim_start_matches('/');

            let data_dir = crate::core::storage::get_data_dir(app);
            let file_path = data_dir.join(rel);

            match std::fs::read(&file_path) {
                Ok(bytes) => {
                    let mime = if rel.ends_with(".webp") {
                        "image/webp"
                    } else if rel.ends_with(".jpg") || rel.ends_with(".jpeg") {
                        "image/jpeg"
                    } else {
                        "application/octet-stream"
                    };

                    tauri::http::Response::builder()
                        .header("Content-Type", mime)
                        .header("Access-Control-Allow-Origin", "*")
                        .status(200)
                        .body(bytes)
                        .unwrap()
                }
                Err(e) => {
                    log::warn!("timelens:// protocol: file not found — {} ({})", file_path.display(), e);
                    tauri::http::Response::builder()
                        .status(404)
                        .body(format!("Not found: {}", rel).into_bytes())
                        .unwrap()
                }
            }
        })
        .setup(|app| {
            let db = Database::new(app.handle()).expect("Failed to initialize database");
            let db = Arc::new(Mutex::new(db));

            // ── Start CaptureService ─────────────────────────────────────────
            let (capture_service, capture_tx) =
                CaptureService::new(Arc::clone(&db), app.handle().clone());

            tauri::async_runtime::spawn(async move {
                capture_service.run().await;
            });

            // ── Build WindowTracker ──────────────────────────────────────────
            let tracker = WindowTracker::new(Arc::clone(&db), capture_tx.clone(), app.handle().clone());

            // ── Permission check before starting tracker ─────────────────────
            #[cfg(target_os = "macos")]
            let permissions_ok = {
                let has_accessibility = has_accessibility_permission();
                let has_screen_recording = has_screen_recording_permission();

                if !has_accessibility {
                    warn!("Accessibility permission not granted — opening System Preferences");
                    open_privacy_pane("Accessibility");
                }
                if !has_screen_recording {
                    warn!("Screen Recording permission not granted — opening System Preferences");
                    open_privacy_pane("ScreenCapture");
                }

                if has_accessibility && has_screen_recording {
                    tracker.start().unwrap();
                    true
                } else {
                    // Emit event so frontend can show permission banner
                    let app_handle = app.handle().clone();
                    let missing_accessibility = !has_accessibility;
                    let missing_screen_recording = !has_screen_recording;
                    // Delay slightly so the window is ready to receive events
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(800));
                        use tauri::Emitter;
                        let _ = app_handle.emit("permissions_required", serde_json::json!({
                            "accessibility": missing_accessibility,
                            "screenRecording": missing_screen_recording,
                        }));
                    });
                    false
                }
            };
            #[cfg(not(target_os = "macos"))]
            let permissions_ok = { tracker.start().unwrap(); true };

            app.manage(AppState {
                db,
                tracker: Mutex::new(tracker),
                capture_tx,
            });

            // ── System Tray ──────────────────────────────────────────────────
            setup_tray(app)?;

            // ── Hide main window by default — but show it if permissions are missing ──
            if let Some(win) = app.get_webview_window("main") {
                if permissions_ok {
                    let _ = win.hide();
                } else {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }

            info!("TimeLens initialised — running in background (system tray)");
            Ok(())
        })
        .on_window_event(|window, event| {
            // Intercept close → hide instead of destroy
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            api::commands::start_tracking,
            api::commands::stop_tracking,
            api::commands::is_tracking,
            api::commands::trigger_screenshot,
            api::commands::get_today_events,
            api::commands::get_today_events_with_snapshots,
            api::commands::get_activity_stats,
            api::commands::get_all_app_meta,
            api::commands::get_window_breakdown,
            api::commands::get_snapshots_for_window,
            api::commands::get_settings,
            api::commands::set_settings,
            api::commands::open_data_dir,
            api::commands::check_permissions,
            api::commands::restart_tracking,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ─── System Tray Setup ────────────────────────────────────────────────────────

fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::tray::TrayIconBuilder;
    use tauri::menu::{MenuBuilder, MenuItemBuilder};

    let open_item = MenuItemBuilder::with_id("open_dashboard", "Open Dashboard").build(app)?;
    let quit_item  = MenuItemBuilder::with_id("quit", "Quit TimeLens").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&open_item)
        .separator()
        .item(&quit_item)
        .build()?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("TimeLens — recording your day")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open_dashboard" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
