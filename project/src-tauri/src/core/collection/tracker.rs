use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc::Sender,
    Arc, RwLock,
};
use std::thread;
use std::time::Duration;

use chrono::Utc;
use crc32fast::Hasher as Crc32;
use log::warn;
use std::hash::{Hash, Hasher};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::core::acquisition::{self, FrontWindowState};
use crate::core::models::{
    AggregationCmd, AppSwitch, AppSwitchRow, CapturePriority, CaptureSignal, RawEventRow, WriteEvent,
};
use crate::core::privacy;
use crate::core::writer::WriterHandle;

const AFK_SECS: f64 = 300.0;
const POLL: Duration = Duration::from_secs(2);
const LOW_CAPTURE_EVERY: Duration = Duration::from_secs(120);

fn compute_hash(app: &str, bundle: &Option<String>, title: &str, fs: bool) -> i64 {
    let mut h = Crc32::new();
    format!(
        "{}|{}|{}|{}",
        app,
        bundle.as_deref().unwrap_or(""),
        title,
        fs as u8
    )
    .hash(&mut h);
    h.finish() as u32 as i64
}

#[allow(clippy::too_many_arguments)]
pub fn spawn_tracker_thread(
    app: AppHandle,
    agg_tx: Sender<AggregationCmd>,
    capture_tx: crossbeam_channel::Sender<CaptureSignal>,
    writer: WriterHandle,
    tracking: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
    is_afk: Arc<AtomicBool>,
    current_session: Arc<RwLock<Option<String>>>,
) {
    thread::spawn(move || {
        let mut last_hash: Option<i64> = None;
        let mut last_app = String::new();
        let mut last_bundle: Option<String> = None;
        let mut last_title = String::new();
        let mut last_session_start_ms: i64 = 0;
        let mut local_afk = false;
        let mut last_low_cap = std::time::Instant::now()
            .checked_sub(LOW_CAPTURE_EVERY)
            .unwrap_or_else(std::time::Instant::now);

        while running.load(Ordering::Relaxed) {
            thread::sleep(POLL);
            if !tracking.load(Ordering::Relaxed) {
                continue;
            }
            let idle = acquisition::idle_seconds();
            if idle >= AFK_SECS {
                if !local_afk {
                    local_afk = true;
                    is_afk.store(true, Ordering::Relaxed);
                    let ts = Utc::now().timestamp_millis();
                    let _ = agg_tx.send(AggregationCmd::EnterAfk {
                        timestamp_ms: ts,
                        idle_seconds: idle,
                    });
                    let id = Uuid::new_v4().to_string();
                    let _ = writer.try_send(WriteEvent::RawEvent(RawEventRow {
                        id,
                        timestamp_ms: ts,
                        app_name: "system".into(),
                        bundle_id: None,
                        window_title: "afk".into(),
                        extracted_url: None,
                        extracted_file_path: None,
                        idle_seconds: idle,
                        is_fullscreen: 0,
                        is_audio_playing: 0,
                        state_hash: 0,
                        trigger_type: "afk_enter".into(),
                        created_at: ts,
                    }));
                }
                continue;
            }
            if local_afk {
                local_afk = false;
                is_afk.store(false, Ordering::Relaxed);
                let ts = Utc::now().timestamp_millis();
                let front = match acquisition::sample_front_window() {
                    Ok(f) => f,
                    Err(_) => FrontWindowState {
                        app_name: "Unknown".into(),
                        bundle_id: None,
                        window_title: String::new(),
                        is_fullscreen: false,
                    },
                };
                let (eu, ep) = privacy::extract_url_and_path(&front.window_title);
                let _ = agg_tx.send(AggregationCmd::ExitAfk {
                    timestamp_ms: ts,
                    app_name: front.app_name.clone(),
                    bundle_id: front.bundle_id.clone(),
                    window_title: front.window_title.clone(),
                    extracted_url: eu.clone(),
                    extracted_file_path: ep.clone(),
                    state_hash: compute_hash(
                        &front.app_name,
                        &front.bundle_id,
                        &front.window_title,
                        front.is_fullscreen,
                    ),
                });
                let id = Uuid::new_v4().to_string();
                let sh = compute_hash(
                    &front.app_name,
                    &front.bundle_id,
                    &front.window_title,
                    front.is_fullscreen,
                );
                let _ = writer.try_send(WriteEvent::RawEvent(RawEventRow {
                    id,
                    timestamp_ms: ts,
                    app_name: front.app_name.clone(),
                    bundle_id: front.bundle_id.clone(),
                    window_title: privacy::redact_title(&front.window_title),
                    extracted_url: eu,
                    extracted_file_path: ep,
                    idle_seconds: idle,
                    is_fullscreen: if front.is_fullscreen { 1 } else { 0 },
                    is_audio_playing: 0,
                    state_hash: sh,
                    trigger_type: "afk_exit".into(),
                    created_at: ts,
                }));
                last_hash = Some(sh);
                last_app = front.app_name.clone();
                last_bundle = front.bundle_id.clone();
                last_title = front.window_title.clone();
                last_session_start_ms = ts;
                let _ = capture_tx.try_send(CaptureSignal {
                    priority: CapturePriority::High,
                    session_id: current_session.read().ok().and_then(|g| g.clone()),
                    trigger_type: "afk_exit".into(),
                });
                continue;
            }

            let front = match acquisition::sample_front_window() {
                Ok(f) => f,
                Err(e) => {
                    warn!("front window: {e}");
                    continue;
                }
            };
            let mut title = front.window_title.clone();
            if let Some(ref b) = front.bundle_id {
                if privacy::should_redact_bundle(b) {
                    title = "[redacted]".into();
                }
            }
            title = privacy::redact_title(&title);
            let (ex_url, ex_path) = privacy::extract_url_and_path(&front.window_title);
            let ex_path = ex_path.map(|p| privacy::redact_path(&p));
            let hash = compute_hash(&front.app_name, &front.bundle_id, &title, front.is_fullscreen);
            let ts = Utc::now().timestamp_millis();
            let trigger = match last_hash {
                None => "window_change",
                Some(lh) if lh != hash => {
                    if front.app_name != last_app
                        || front.bundle_id.as_ref() != last_bundle.as_ref()
                    {
                        "window_change"
                    } else {
                        "title_change"
                    }
                }
                Some(_) => "poll",
            };

            if trigger == "window_change" {
                let dur = (ts - last_session_start_ms).max(0);
                let sw_id = Uuid::new_v4().to_string();
                let sw = AppSwitchRow {
                    id: sw_id.clone(),
                    timestamp_ms: ts,
                    from_app: last_app.clone(),
                    from_bundle_id: last_bundle.clone(),
                    from_window_title: Some(privacy::redact_title(&last_title)),
                    to_app: front.app_name.clone(),
                    to_bundle_id: front.bundle_id.clone(),
                    to_window_title: Some(title.clone()),
                    from_session_duration_ms: dur,
                    switch_type: "voluntary".into(),
                };
                if !last_app.is_empty() {
                    let ev = AppSwitch {
                        id: sw_id,
                        timestamp_ms: ts,
                        from_app: sw.from_app.clone(),
                        from_bundle_id: sw.from_bundle_id.clone(),
                        from_window_title: sw.from_window_title.clone(),
                        to_app: sw.to_app.clone(),
                        to_bundle_id: sw.to_bundle_id.clone(),
                        to_window_title: sw.to_window_title.clone(),
                        from_session_duration_ms: sw.from_session_duration_ms,
                        switch_type: sw.switch_type.clone(),
                    };
                    let _ = writer.try_send(WriteEvent::AppSwitch(sw));
                    let _ = app.emit("app_switch_recorded", ev);
                }
            }

            let _ = agg_tx.send(AggregationCmd::Tick {
                timestamp_ms: ts,
                app_name: front.app_name.clone(),
                bundle_id: front.bundle_id.clone(),
                window_title: title.clone(),
                extracted_url: ex_url.clone(),
                extracted_file_path: ex_path.clone(),
                trigger_type: trigger.to_string(),
                state_hash: hash,
            });

            if trigger == "window_change" {
                thread::sleep(Duration::from_millis(50));
            }

            let id = Uuid::new_v4().to_string();
            let _ = writer.try_send(WriteEvent::RawEvent(RawEventRow {
                id,
                timestamp_ms: ts,
                app_name: front.app_name.clone(),
                bundle_id: front.bundle_id.clone(),
                window_title: title.clone(),
                extracted_url: ex_url,
                extracted_file_path: ex_path,
                idle_seconds: idle,
                is_fullscreen: if front.is_fullscreen { 1 } else { 0 },
                is_audio_playing: 0,
                state_hash: hash,
                trigger_type: trigger.to_string(),
                created_at: ts,
            }));

            if trigger == "window_change" {
                last_session_start_ms = ts;
            }

            if trigger == "window_change" || trigger == "title_change" {
                let sid = current_session.read().ok().and_then(|g| g.clone());
                let _ = capture_tx.try_send(CaptureSignal {
                    priority: CapturePriority::High,
                    session_id: sid,
                    trigger_type: trigger.to_string(),
                });
            } else if last_low_cap.elapsed() >= LOW_CAPTURE_EVERY {
                last_low_cap = std::time::Instant::now();
                let sid = current_session.read().ok().and_then(|g| g.clone());
                let _ = capture_tx.try_send(CaptureSignal {
                    priority: CapturePriority::Low,
                    session_id: sid,
                    trigger_type: "poll".into(),
                });
            }

            last_hash = Some(hash);
            last_app = front.app_name;
            last_bundle = front.bundle_id;
            last_title = front.window_title;
        }
    });
}
