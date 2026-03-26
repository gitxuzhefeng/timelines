use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use tokio::sync::mpsc;
use uuid::Uuid;
use log::{info, warn, error};
use tauri::Emitter;

use crate::core::storage::db::Database;
use crate::core::storage::EventSnapshot;

// ─── Signal Types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum CapturePriority {
    /// Window/title just changed — capture immediately
    High,
    /// Same window for >15s — periodic supplemental capture
    Low,
}

#[derive(Debug, Clone)]
pub struct CaptureSignal {
    /// The window_event ID this snapshot belongs to
    pub event_id: String,
    pub priority: CapturePriority,
    pub timestamp_ms: i64,
}

// ─── Payload emitted to the frontend ──────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct SnapshotSavedPayload {
    pub event_id: String,
    pub snapshot_id: String,
    pub file_path: String,
    pub captured_at_ms: i64,
    pub file_size_bytes: i64,
}

// ─── Service ──────────────────────────────────────────────────────────────────

pub struct CaptureService {
    db: Arc<Mutex<Database>>,
    app_handle: tauri::AppHandle,
    rx: mpsc::Receiver<CaptureSignal>,
}

impl CaptureService {
    /// Create the service and return the sender channel for `WindowTracker` to use.
    pub fn new(
        db: Arc<Mutex<Database>>,
        app_handle: tauri::AppHandle,
    ) -> (Self, mpsc::Sender<CaptureSignal>) {
        let (tx, rx) = mpsc::channel::<CaptureSignal>(64);
        let service = CaptureService { db, app_handle, rx };
        (service, tx)
    }

    /// Async event loop. Run this with `tokio::spawn`.
    pub async fn run(mut self) {
        info!("CaptureService started");

        while let Some(signal) = self.rx.recv().await {
            info!(
                "Capture signal received: event_id={} priority={:?}",
                signal.event_id, signal.priority
            );

            let db = Arc::clone(&self.db);
            let app_handle = self.app_handle.clone();
            let shots_dir = get_shots_dir(&self.app_handle, chrono::Local::now().format("%Y-%m-%d").to_string().as_str());
            let event_id = signal.event_id.clone();
            let signal_ts = signal.timestamp_ms;

            // Offload CPU-bound screenshot + compression to a blocking thread
            tokio::task::spawn_blocking(move || {
                match capture_all_displays(&shots_dir) {
                    Ok(captures) => {
                        for (file_path, file_size) in captures {
                            let snap = EventSnapshot {
                                id: Uuid::new_v4().to_string(),
                                event_id: event_id.clone(),
                                file_path: file_path.to_string_lossy().to_string(),
                                captured_at_ms: signal_ts,
                                file_size_bytes: file_size,
                            };
                            let snap_path = snap.file_path.clone();
                            let protocol_url = if let Some(pos) = snap_path.find("shots/") {
                                format!("timelens://localhost/{}", &snap_path[pos..])
                            } else {
                                format!("timelens://localhost/{}", snap_path)
                            };
                            if let Ok(guard) = db.lock() {
                                if let Err(e) = guard.insert_snapshot(&snap) {
                                    error!("Failed to insert snapshot: {}", e);
                                }
                            }
                            let payload = SnapshotSavedPayload {
                                event_id: event_id.clone(),
                                snapshot_id: snap.id.clone(),
                                file_path: protocol_url,
                                captured_at_ms: signal_ts,
                                file_size_bytes: file_size,
                            };
                            if let Err(e) = app_handle.emit("new_snapshot_saved", &payload) {
                                warn!("Failed to emit snapshot event: {}", e);
                            }
                        }
                    }
                    Err(e) => error!("Capture failed: {}", e),
                }
            });
        }

        info!("CaptureService stopped");
    }
}

// ─── Core capture logic (runs in spawn_blocking) ──────────────────────────────

fn capture_all_displays(shots_dir: &PathBuf) -> Result<Vec<(PathBuf, i64)>, String> {
    std::fs::create_dir_all(shots_dir)
        .map_err(|e| format!("Failed to create shots dir: {e}"))?;

    let mut results = Vec::new();
    let temp_id = Uuid::new_v4();
    let temp_path = format!("/tmp/timelens_cap_{}.png", temp_id);

    // Capture main monitor only using -m
    let status = std::process::Command::new("screencapture")
        .args(["-x", "-m", "-t", "png", &temp_path])
        .status()
        .map_err(|e| format!("screencapture failed: {e}"))?;

    if !status.success() {
        return Err("screencapture -m failed".to_string());
    }

    if let Ok(png_bytes) = std::fs::read(&temp_path) {
        let _ = std::fs::remove_file(&temp_path);
        let img = image::load_from_memory(&png_bytes)
            .map_err(|e| format!("Failed to decode PNG: {e}"))?;

        let file_name = format!("{}_main.webp", Uuid::new_v4());
        let file_path = shots_dir.join(&file_name);

        let mut bytes: Vec<u8> = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::WebP)
            .map_err(|e| format!("WebP encode failed: {e}"))?;

        std::fs::write(&file_path, &bytes)
            .map_err(|e| format!("Failed to write WebP: {e}"))?;

        let file_size = bytes.len() as i64;
        info!("Screenshot saved: {} ({} bytes)", file_path.display(), file_size);
        results.push((file_path, file_size));
    }

    if results.is_empty() {
        return Err("No displays captured".to_string());
    }
    Ok(results)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn get_shots_dir(app: &tauri::AppHandle, date: &str) -> PathBuf {
    crate::core::storage::get_shots_dir(app, date)
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
