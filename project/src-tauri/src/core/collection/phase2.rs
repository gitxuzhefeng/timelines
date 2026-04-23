//! 二期 M0-W3/W5：输入指标、剪贴板、环境上下文周期写入（W4 通知由 tracker 启发式写入）。

use std::hash::Hasher;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, RwLock,
};

use crate::core::settings::app_name_blacklisted;
use std::thread;
use std::time::Duration;

use chrono::Utc;
use crc32fast::Hasher as CrcHasher;
use log::warn;
use uuid::Uuid;

use crate::core::acquisition::{self, active_display_count, hardware_input_delta, sample_ambient_extras};
use crate::core::models::{
    AmbientContextRow, ClipboardFlowRow, InputMetricRow, WriteEvent,
};
use crate::core::writer::WriterHandle;

pub struct Phase2EngineFlags {
    pub input: Arc<AtomicBool>,
    pub clipboard: Arc<AtomicBool>,
    pub ambient: Arc<AtomicBool>,
}

#[allow(clippy::too_many_arguments)]
pub fn spawn_phase2_collectors(
    writer: WriterHandle,
    tracking: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
    current_session: Arc<RwLock<Option<String>>>,
    flags: Phase2EngineFlags,
    app_blacklist: Arc<RwLock<Vec<String>>>,
) {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        let w = writer.clone();
        let t = tracking.clone();
        let r = running.clone();
        let cs = current_session.clone();
        let fi = flags.input.clone();
        thread::spawn(move || input_loop(w, t, r, cs, fi));

        let w = writer.clone();
        let t = tracking.clone();
        let r = running.clone();
        let fc = flags.clipboard.clone();
        let bl = app_blacklist.clone();
        thread::spawn(move || clipboard_loop(w, t, r, fc, bl));

        let w = writer.clone();
        let t = tracking.clone();
        let r = running.clone();
        let fa = flags.ambient.clone();
        thread::spawn(move || ambient_loop(w, t, r, fa));
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn input_loop(
    writer: WriterHandle,
    tracking: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
    current_session: Arc<RwLock<Option<String>>>,
    enabled: Arc<AtomicBool>,
) {
    let interval = Duration::from_secs(5);
    while running.load(Ordering::Relaxed) {
        thread::sleep(interval);
        if !tracking.load(Ordering::Relaxed) || !enabled.load(Ordering::Relaxed) {
            continue;
        }
        if !acquisition::ax_trusted() {
            continue;
        }
        let (keys, clicks) = hardware_input_delta();
        let ts = Utc::now().timestamp_millis();
        let sid = current_session.read().ok().and_then(|g| g.clone());
        let secs = 5.0_f64;
        let kpm = (keys as f64) * 60.0 / secs;
        let row = InputMetricRow {
            id: Uuid::new_v4().to_string(),
            timestamp_ms: ts,
            session_id: sid,
            window_interval_secs: secs,
            keystrokes_count: keys as i64,
            kpm,
            delete_count: 0,
            delete_ratio: 0.0,
            shortcut_count: 0,
            copy_count: 0,
            paste_count: 0,
            undo_count: 0,
            mouse_click_count: clicks as i64,
            mouse_distance_px: 0.0,
            scroll_delta_total: 0.0,
            scroll_direction_changes: 0,
            typing_burst_count: 0,
            longest_pause_ms: 0,
        };
        let _ = writer.try_send(WriteEvent::InputMetric(row));
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn clipboard_loop(
    writer: WriterHandle,
    tracking: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
    enabled: Arc<AtomicBool>,
    app_blacklist: Arc<RwLock<Vec<String>>>,
) {
    use arboard::Clipboard;
    let mut clip = loop {
        match Clipboard::new() {
            Ok(c) => break c,
            Err(e) => {
                warn!("clipboard: init failed ({e}), retrying in 5s…");
                for _ in 0..50 {
                    thread::sleep(Duration::from_millis(100));
                    if !running.load(Ordering::Relaxed) {
                        return;
                    }
                }
            }
        }
    };
    let mut last_sig: Option<(usize, u64)> = None;
    // 当前剪贴板内容对应的 copy 边（与后续 paste 共用 `flow_pair_id`）。
    let mut open_pair: Option<(String, Option<String>, String)> = None;
    let mut pasted_for_open_pair = false;

    while running.load(Ordering::Relaxed) {
        thread::sleep(Duration::from_secs(3));
        if !tracking.load(Ordering::Relaxed) || !enabled.load(Ordering::Relaxed) {
            continue;
        }
        let list = app_blacklist
            .read()
            .ok()
            .map(|g| g.clone())
            .unwrap_or_default();
        let (app_name, bundle_id) = acquisition::sample_front_window()
            .map(|f| (f.app_name, f.bundle_id))
            .unwrap_or_else(|_| ("unknown".into(), None));
        let on_blacklist = app_name_blacklisted(&app_name, &list);

        let text = match clip.get_text() {
            Ok(t) => t,
            Err(_) => continue,
        };
        let len = text.len();
        let mut h = CrcHasher::new();
        h.update(text.as_bytes());
        let hv = h.finish();
        let sig = (len, hv);

        if on_blacklist {
            last_sig = Some(sig);
            continue;
        }

        let front_key = (app_name.clone(), bundle_id.clone());

        if last_sig.as_ref() == Some(&sig) {
            if let Some((ref src_app, _, ref pair_id)) = open_pair {
                if !pasted_for_open_pair && front_key.0 != *src_app {
                    let row = ClipboardFlowRow {
                        id: Uuid::new_v4().to_string(),
                        timestamp_ms: Utc::now().timestamp_millis(),
                        action: "paste".into(),
                        app_name: front_key.0.clone(),
                        bundle_id: front_key.1.clone(),
                        content_type: Some("plain_text".into()),
                        content_length: len as i64,
                        flow_pair_id: Some(pair_id.clone()),
                    };
                    let _ = writer.try_send(WriteEvent::ClipboardFlow(row));
                    pasted_for_open_pair = true;
                }
            }
            continue;
        }

        if last_sig.is_some() {
            let pair_id = Uuid::new_v4().to_string();
            let row = ClipboardFlowRow {
                id: Uuid::new_v4().to_string(),
                timestamp_ms: Utc::now().timestamp_millis(),
                action: "copy".into(),
                app_name: app_name.clone(),
                bundle_id: bundle_id.clone(),
                content_type: Some("plain_text".into()),
                content_length: len as i64,
                flow_pair_id: Some(pair_id.clone()),
            };
            let _ = writer.try_send(WriteEvent::ClipboardFlow(row));
            open_pair = Some((app_name, bundle_id, pair_id));
            pasted_for_open_pair = false;
        }
        last_sig = Some(sig);
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn ambient_loop(
    writer: WriterHandle,
    tracking: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
    enabled: Arc<AtomicBool>,
) {
    let interval = Duration::from_secs(30);
    while running.load(Ordering::Relaxed) {
        thread::sleep(interval);
        if !tracking.load(Ordering::Relaxed) || !enabled.load(Ordering::Relaxed) {
            continue;
        }
        let dc = active_display_count().max(1) as i64;
        let ex = sample_ambient_extras();
        let row = AmbientContextRow {
            id: Uuid::new_v4().to_string(),
            timestamp_ms: Utc::now().timestamp_millis(),
            wifi_ssid: ex.wifi_ssid,
            display_count: dc,
            is_external_display: if dc > 1 { 1 } else { 0 },
            battery_level: ex.battery_percent,
            is_charging: ex.is_charging,
            is_camera_active: 0,
            is_audio_input_active: 0,
            is_dnd_enabled: 0,
            screen_brightness: None,
            active_space_index: None,
        };
        let _ = writer.try_send(WriteEvent::AmbientContext(row));
    }
}
