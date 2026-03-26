use crate::core::acquisition::macos;

use crate::core::storage::db::Database;
use crate::core::storage::WindowEvent;
use crate::core::collection::capture_service::{CaptureSignal, CapturePriority, now_ms};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;
use tokio::sync::mpsc::Sender;
use uuid::Uuid;
use log::{info, warn};

fn map_app_to_intent(app_name: &str) -> Option<String> {
    let name = app_name.to_lowercase();
    if name.contains("code") || name.contains("xcode") || name.contains("cursor") || name.contains("idea") {
        return Some("Code/Text".to_string());
    } else if name.contains("chrome") || name.contains("safari") || name.contains("browser") || name.contains("edge") {
        return Some("Research".to_string());
    } else if name.contains("wechat") || name.contains("slack") || name.contains("discord") || name.contains("teams") {
        return Some("Communication".to_string());
    } else if name.contains("word") || name.contains("pages") || name.contains("notes") || name.contains("notion") || name.contains("obsidian") {
        return Some("Documentation".to_string());
    } else if name.contains("figma") || name.contains("sketch") || name.contains("photoshop") {
        return Some("Design".to_string());
    } else if name.contains("chatgpt") || name.contains("claude") || name.contains("gemini") {
        return Some("AI Chat".to_string());
    }
    None
}

/// How often the background poll loop wakes to check active window (seconds)
const POLL_INTERVAL_SECS: u64 = 2;

/// Periodic supplemental capture threshold — same window for this many seconds → capture again
const PERIODIC_CAPTURE_SECS: i64 = 15;

/// AFK threshold (seconds) — if no input for this long, consider user away
const AFK_THRESHOLD_SECS: f64 = 240.0;

#[cfg(target_os = "macos")]
pub mod macos_idle {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        pub fn CGEventSourceSecondsSinceLastEventType(source: i32, event_type: u32) -> f64;
    }
    // kCGEventSourceStateCombinedSessionState = 0
    // kCGAnyInputEventType = 0xFFFFFFFF
    pub const COMBINED_SESSION_STATE: i32 = 0;
    pub const ANY_INPUT_EVENT_TYPE: u32 = 0xFFFFFFFF;
}

#[cfg(target_os = "macos")]
fn get_idle_time() -> f64 {
    unsafe {
        macos::macos_idle::CGEventSourceSecondsSinceLastEventType(
            macos::macos_idle::COMBINED_SESSION_STATE,
            macos::macos_idle::ANY_INPUT_EVENT_TYPE,
        )
    }
}

#[cfg(not(target_os = "macos"))]
fn get_idle_time() -> f64 { 0.0 }

pub struct WindowTracker {
    running: Arc<AtomicBool>,
    db: Arc<Mutex<Database>>,
    capture_tx: Sender<CaptureSignal>,
    app_handle: tauri::AppHandle,
}

impl WindowTracker {
    pub fn new(db: Arc<Mutex<Database>>, capture_tx: Sender<CaptureSignal>, app_handle: tauri::AppHandle) -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            db,
            capture_tx,
            app_handle,
        }
    }

    pub fn start(&self) -> Result<(), String> {
        if self.running.load(Ordering::SeqCst) {
            return Ok(()); // Already running
        }
        self.running.store(true, Ordering::SeqCst);

        let running = Arc::clone(&self.running);
        let db = Arc::clone(&self.db);
        let capture_tx = self.capture_tx.clone();
        let app_handle = self.app_handle.clone();
        
        thread::spawn(move || {
            use tauri::Emitter;
            info!("WindowTracker started (poll interval: {}s, periodic capture: {}s)",
                POLL_INTERVAL_SECS, PERIODIC_CAPTURE_SECS);

            let mut last_app: Option<String> = None;
            let mut last_title: Option<String> = None;
            let mut session_start_ms = now_ms();
            let mut last_capture_ms = now_ms();
            let mut current_event_id: Option<String> = None;
            
            let mut is_afk = false;

            while running.load(Ordering::SeqCst) {
                let idle_secs = get_idle_time();

                if idle_secs >= AFK_THRESHOLD_SECS {
                    if !is_afk {
                        info!("User is AFK (idle: {}s)", idle_secs);
                        is_afk = true;
                    }
                    // While AFK, we don't update duration and don't trigger snapshots
                    thread::sleep(Duration::from_secs(POLL_INTERVAL_SECS));
                    continue;
                }

                if is_afk {
                    info!("User is back from AFK");
                    is_afk = false;
                    // Adjust session_start to compensate for the time spent AFK? 
                    // PRD says "exclude that period". Simplest is to treat the resumption 
                    // as a "change" or just continue and not count the AFK gap.
                }

                match macos::get_active_window() {
                    Some((app_name, window_title)) => {
                        let has_changed = last_app.as_deref() != Some(&app_name)
                            || last_title.as_deref() != Some(&window_title);

                        if has_changed {
                            let current_time = now_ms();
                            let duration = current_time - session_start_ms;

                            // ── Commit the previous window session ──────────────
                            if let (Some(prev_app), Some(prev_title)) =
                                (last_app.take(), last_title.take())
                            {
                                let event_id = current_event_id
                                    .take()
                                    .unwrap_or_else(|| Uuid::new_v4().to_string());

                                let event = WindowEvent {
                                    id: event_id,
                                    timestamp_ms: session_start_ms,
                                    app_name: prev_app.clone(),
                                    window_title: prev_title,
                                    duration_ms: duration,
                                    intent: map_app_to_intent(&prev_app),
                                    snapshot_urls: Vec::new(),
                                };
                                if let Ok(guard) = db.lock() {
                                    if let Err(e) = guard.insert_event(&event) {
                                        warn!("Failed to insert window event: {}", e);
                                    }
                                }
                                let _ = app_handle.emit("window_event_updated", &event);
                            }

                            // ── Start new session ───────────────────────────────
                            let new_event_id = Uuid::new_v4().to_string();
                            session_start_ms = current_time;
                            last_capture_ms = current_time;

                            info!("Window changed → {}: {}", app_name, window_title);
                            last_app = Some(app_name.clone());
                            last_title = Some(window_title.clone());

                            // ── Metadata: App Icon ───────────────────────────────
                            if let Ok(guard) = db.lock() {
                                if let Ok(None) = guard.get_app_meta(&app_name) {
                                    info!("Fetching icon for {}", app_name);
                                    if let Some(icon_b64) = macos::get_app_icon_base64(&app_name) {
                                        info!("Successfully fetched icon for {}, saving to DB", app_name);
                                        let _ = guard.upsert_app_meta(&crate::core::storage::AppMeta {
                                            app_name: app_name.clone(),
                                            icon_base64: Some(icon_b64),
                                        });
                                    } else {
                                        warn!("Failed to fetch icon for {}", app_name);
                                    }
                                }
                            }

                            // ── High-priority capture (window/title changed) ─────
                            let signal = CaptureSignal {
                                event_id: new_event_id.clone(),
                                priority: CapturePriority::High,
                                timestamp_ms: current_time,
                            };
                            if let Err(e) = capture_tx.try_send(signal) {
                                warn!("Could not send High-priority capture signal: {}", e);
                            }

                            current_event_id = Some(new_event_id.clone());
                            
                            // Insert the initial state into DB to satisfy FOREIGN KEY
                            let initial_event = WindowEvent {
                                id: new_event_id.clone(),
                                timestamp_ms: session_start_ms,
                                app_name: app_name.clone(),
                                window_title: window_title.clone(),
                                duration_ms: 0,
                                intent: map_app_to_intent(&app_name),
                                snapshot_urls: Vec::new(),
                            };
                            if let Ok(guard) = db.lock() {
                                if let Err(e) = guard.insert_event(&initial_event) {
                                    warn!("Failed to insert initial window event: {}", e);
                                }
                            }
                            let _ = app_handle.emit("window_event_updated", &initial_event);
                            
                        } else {
                            // ── Same window — check periodic capture threshold ───
                            let now = now_ms();
                            let secs_since_last_capture =
                                (now - last_capture_ms) / 1_000;

                            if secs_since_last_capture >= PERIODIC_CAPTURE_SECS {
                                last_capture_ms = now;
                                info!("Periodic capture triggered ({}s idle in same window)", secs_since_last_capture);

                                let duration = now - session_start_ms;
                                if let Some(event_id) = &current_event_id {
                                    if let Ok(guard) = db.lock() {
                                        let _ = guard.update_event_duration(event_id, duration);
                                    }
                                    let update_event = WindowEvent {
                                        id: event_id.clone(),
                                        timestamp_ms: session_start_ms,
                                        app_name: app_name.clone(),
                                        window_title: window_title.clone(),
                                        duration_ms: duration,
                                        intent: map_app_to_intent(&app_name),
                                        snapshot_urls: Vec::new(),
                                    };
                                    let _ = app_handle.emit("window_event_updated", &update_event);

                                    let signal = CaptureSignal {
                                        event_id: event_id.clone(),
                                        priority: CapturePriority::Low,
                                        timestamp_ms: now,
                                    };
                                    if let Err(e) = capture_tx.try_send(signal) {
                                        warn!("Could not send Low-priority capture signal: {}", e);
                                    }
                                }
                            }
                        }
                    }
                    None => {
                        warn!("get_active_window returned None — screen possibly locked");
                    }
                }

                thread::sleep(Duration::from_secs(POLL_INTERVAL_SECS));
            }

            info!("WindowTracker stopped");
        });

        Ok(())
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_app_to_intent() {
        assert_eq!(map_app_to_intent("Visual Studio Code"), Some("Code/Text".to_string()));
        assert_eq!(map_app_to_intent("Cursor"), Some("Code/Text".to_string()));
        assert_eq!(map_app_to_intent("Google Chrome"), Some("Research".to_string()));
        assert_eq!(map_app_to_intent("Safari"), Some("Research".to_string()));
        assert_eq!(map_app_to_intent("WeChat"), Some("Communication".to_string()));
        assert_eq!(map_app_to_intent("Slack"), Some("Communication".to_string()));
        assert_eq!(map_app_to_intent("Microsoft Word"), Some("Documentation".to_string()));
        assert_eq!(map_app_to_intent("Notion"), Some("Documentation".to_string()));
        assert_eq!(map_app_to_intent("Figma"), Some("Design".to_string()));
        assert_eq!(map_app_to_intent("ChatGPT"), Some("AI Chat".to_string()));
        assert_eq!(map_app_to_intent("UnknownApp"), None);
    }
}
