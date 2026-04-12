use std::fs;
#[cfg(target_os = "macos")]
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc, Mutex as StdMutex,
};
use std::thread;
use std::time::Duration;

use chrono::Utc;
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView};
use image_hasher::{HashAlg, HasherConfig};
use log::{info, warn};
use parking_lot::Mutex;
use rusqlite::Connection;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::core::models::{CapturePriority, CaptureSignal, SnapshotPayload, SnapshotRow, WriteEvent};
use crate::core::ocr::OcrJob;
use crate::core::storage::DataPaths;
use crate::core::writer::WriterHandle;

/// 定时 poll 截图：较小尺寸 + 略低质量，控制体积与哈希成本。
const MAX_WIDTH_POLL: u32 = 960;
const WEBP_QUALITY_POLL: f32 = 78.0;
/// 切换窗口 / 手动 / 标题变化等：更高清晰度。
const MAX_WIDTH_IMPORTANT: u32 = 1440;
const WEBP_QUALITY_IMPORTANT: f32 = 90.0;

fn capture_scale_and_quality(sig: &CaptureSignal) -> (u32, f32) {
    if sig.priority == CapturePriority::Low && sig.trigger_type == "poll" {
        (MAX_WIDTH_POLL, WEBP_QUALITY_POLL)
    } else {
        (MAX_WIDTH_IMPORTANT, WEBP_QUALITY_IMPORTANT)
    }
}

fn grab_screen_image() -> Result<DynamicImage, String> {
    #[cfg(target_os = "macos")]
    {
        let tmp = std::env::temp_dir().join(format!("tl_cap_{}.png", Uuid::new_v4()));
        let status = Command::new("/usr/sbin/screencapture")
            .args(["-x", "-t", "png", "-D", "1"])
            .arg(&tmp)
            .status();
        if status.map(|s| !s.success()).unwrap_or(true) {
            return Err("screencapture failed".into());
        }
        if !tmp.exists() {
            return Err("screencapture produced no file".into());
        }
        let img = image::open(&tmp).map_err(|e| e.to_string())?;
        let _ = fs::remove_file(&tmp);
        Ok(img)
    }
    #[cfg(target_os = "windows")]
    {
        use screenshots::Screen;
        let screens = Screen::all().map_err(|e| e.to_string())?;
        let screen = screens
            .first()
            .ok_or_else(|| "no display".to_string())?;
        let captured = screen.capture().map_err(|e| e.to_string())?;
        let (w, h) = (captured.width(), captured.height());
        let raw = captured.into_raw();
        let rgba = image::RgbaImage::from_raw(w, h, raw)
            .ok_or_else(|| "invalid RGBA buffer from screen capture".to_string())?;
        Ok(DynamicImage::ImageRgba8(rgba))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("screen capture unsupported on this platform".into())
    }
}

fn scale_to_max_width(img: DynamicImage, max_w: u32) -> DynamicImage {
    let (w, h) = img.dimensions();
    if w <= max_w {
        img
    } else {
        let nh = ((h as f64) * (max_w as f64 / w as f64)).round() as u32;
        img.resize_exact(max_w, nh, FilterType::Lanczos3)
    }
}

fn write_webp_lossy(scaled: &DynamicImage, path: &std::path::Path, quality: f32) -> Result<(), String> {
    let rgba = scaled.to_rgba8();
    let (w, h) = rgba.dimensions();
    if w == 0 || h == 0 {
        return Err("empty image".into());
    }
    let enc = webp::Encoder::from_rgba(rgba.as_raw(), w, h);
    let mem = enc.encode(quality.clamp(0.0, 100.0));
    fs::write(path, &*mem).map_err(|e| e.to_string())
}

fn wait_session(conn: &Mutex<Connection>, id: &str) {
    for _ in 0..80 {
        let ok = conn.lock().query_row(
            "SELECT 1 FROM window_sessions WHERE id = ?1 LIMIT 1",
            [id],
            |_| Ok(()),
        );
        if ok.is_ok() {
            return;
        }
        thread::sleep(Duration::from_millis(25));
    }
}

pub fn spawn_capture_thread(
    rx: crossbeam_channel::Receiver<CaptureSignal>,
    writer: WriterHandle,
    read_conn: Arc<Mutex<Connection>>,
    paths: DataPaths,
    is_afk: Arc<AtomicBool>,
    screen_ok: Arc<AtomicBool>,
    app: AppHandle,
    ocr_hook: Option<(
        crossbeam_channel::Sender<OcrJob>,
        Arc<AtomicBool>,
        Arc<AtomicUsize>,
    )>,
) {
    let last_phash: Arc<StdMutex<Option<image_hasher::ImageHash>>> =
        Arc::new(StdMutex::new(None));
    let hasher = HasherConfig::new()
        .hash_alg(HashAlg::Mean)
        .hash_size(8, 8)
        .to_hasher();
    thread::spawn(move || {
        while let Ok(sig) = rx.recv() {
            if is_afk.load(Ordering::Relaxed) {
                warn!(
                    "capture skipped (afk): trigger={}",
                    sig.trigger_type
                );
                continue;
            }
            if !screen_ok.load(Ordering::Relaxed) {
                warn!(
                    "capture skipped (screen recording not allowed / not refreshed): trigger={}",
                    sig.trigger_type
                );
                continue;
            }
            let Some(sid) = sig.session_id.clone() else {
                warn!(
                    "capture skipped (no active session_id): trigger={}",
                    sig.trigger_type
                );
                continue;
            };
            wait_session(read_conn.as_ref(), &sid);
            let img = match grab_screen_image() {
                Ok(i) => i,
                Err(e) => {
                    warn!("screen grab: {e}");
                    continue;
                }
            };
            let (max_w, webp_q) = capture_scale_and_quality(&sig);
            let scaled = scale_to_max_width(img, max_w);
            let (sw, sh) = scaled.dimensions();
            if sig.priority == CapturePriority::Low && sig.trigger_type == "poll" {
                let hnow = hasher.hash_image(&scaled);
                let mut guard = last_phash.lock().expect("lock");
                if let Some(ref prev) = *guard {
                    if hnow.dist(prev) < 5 {
                        continue;
                    }
                }
                *guard = Some(hnow);
            }
            let day = Utc::now().format("%Y-%m-%d").to_string();
            let shot_dir = paths.shots_dir.join(&day);
            if let Err(e) = fs::create_dir_all(&shot_dir) {
                warn!("shots dir: {e}");
                continue;
            }
            let id = Uuid::new_v4().to_string();
            let fname = format!("{}_{}.webp", &id[..8], sig.trigger_type.replace('/', "_"));
            let out_path = shot_dir.join(&fname);
            if let Err(e) = write_webp_lossy(&scaled, &out_path, webp_q) {
                warn!("save webp: {e}");
                continue;
            }
            let size = fs::metadata(&out_path).map(|m| m.len() as i64).unwrap_or(0);
            let fp = out_path.to_string_lossy().to_string();
            let h = hasher.hash_image(&scaled);
            let perceptual_hash = Some(format!("{h:?}"));
            let captured_at_ms = Utc::now().timestamp_millis();
            let row = SnapshotRow {
                id: id.clone(),
                session_id: sid.clone(),
                file_path: fp.clone(),
                captured_at_ms,
                file_size_bytes: size,
                trigger_type: sig.trigger_type.clone(),
                resolution: Some(format!("{sw}x{sh}")),
                format: "webp".into(),
                perceptual_hash: perceptual_hash.clone(),
            };
            let _ = writer.try_send(WriteEvent::Snapshot(row));
            let path_for_ocr = fp.clone();
            let ocr_snapshot_id = id.clone();
            let ocr_session_id = sid.clone();
            let ocr_trigger = sig.trigger_type.clone();
            let ocr_phash = perceptual_hash.clone();
            let snap = crate::core::models::Snapshot {
                id,
                session_id: sid,
                file_path: fp,
                captured_at_ms,
                file_size_bytes: size,
                trigger_type: sig.trigger_type,
                resolution: Some(format!("{sw}x{sh}")),
                format: "webp".into(),
                perceptual_hash,
            };
            let _ = app.emit(
                "new_snapshot_saved",
                SnapshotPayload { snapshot: snap },
            );
            if let Some((ref ocr_tx, ref ocr_on, ref pend)) = ocr_hook {
                if ocr_on.load(Ordering::Relaxed) {
                    let job = OcrJob {
                        snapshot_id: ocr_snapshot_id,
                        session_id: ocr_session_id,
                        file_path: path_for_ocr,
                        captured_at_ms,
                        trigger_type: ocr_trigger,
                        perceptual_hash: ocr_phash,
                    };
                    match ocr_tx.try_send(job) {
                        Ok(()) => {
                            pend.fetch_add(1, Ordering::Relaxed);
                        }
                        Err(e) => {
                            warn!("ocr queue full or closed, skip: {e}");
                        }
                    }
                }
            }
            info!("snapshot saved {out_path:?}");
        }
    });
}
