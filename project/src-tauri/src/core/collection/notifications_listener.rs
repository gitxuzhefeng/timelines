//! Windows：`UserNotificationListener` 轮询 Toast，写入 `notifications`（与 tracker 短切换启发式并存）。

#[cfg(target_os = "windows")]
mod win {
    use std::collections::HashSet;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    use std::thread;
    use std::time::Duration;

    use chrono::Utc;
    use log::warn;
    use uuid::Uuid;
    use windows::UI::Notifications::Management::{
        UserNotificationListener, UserNotificationListenerAccessStatus,
    };
    use windows::UI::Notifications::NotificationKinds;
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

    use crate::core::acquisition;
    use crate::core::models::{NotificationRow, WriteEvent};
    use crate::core::writer::WriterHandle;

    pub fn spawn_system_notification_listener(
        writer: WriterHandle,
        tracking: Arc<AtomicBool>,
        running: Arc<AtomicBool>,
        enabled: Arc<AtomicBool>,
    ) {
        thread::spawn(move || unsafe {
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
            let mut seen: HashSet<String> = HashSet::new();
            let mut priming = true;
            while running.load(Ordering::Relaxed) {
                thread::sleep(Duration::from_secs(3));
                if !tracking.load(Ordering::Relaxed) || !enabled.load(Ordering::Relaxed) {
                    continue;
                }
                let listener = match UserNotificationListener::Current() {
                    Ok(l) => l,
                    Err(e) => {
                        warn!("UserNotificationListener::Current: {e}");
                        continue;
                    }
                };
                if listener.GetAccessStatus().ok() != Some(UserNotificationListenerAccessStatus::Allowed)
                {
                    continue;
                }
                let op = match listener.GetNotificationsAsync(NotificationKinds::Toast) {
                    Ok(o) => o,
                    Err(e) => {
                        warn!("GetNotificationsAsync: {e}");
                        continue;
                    }
                };
                let list = match op.get() {
                    Ok(l) => l,
                    Err(e) => {
                        warn!("GetNotificationsAsync.get: {e}");
                        continue;
                    }
                };
                let n = match list.Size() {
                    Ok(s) => s,
                    Err(e) => {
                        warn!("IVectorView.Size: {e}");
                        continue;
                    }
                };
                for i in 0..n {
                    let Ok(un) = list.GetAt(i) else {
                        continue;
                    };
                    let Ok(id) = un.Id() else {
                        continue;
                    };
                    let Ok(ct) = un.CreationTime() else {
                        continue;
                    };
                    let app_title = un
                        .AppInfo()
                        .ok()
                        .and_then(|info| info.DisplayInfo().ok())
                        .and_then(|d| d.DisplayName().ok())
                        .map(|h| h.to_string())
                        .unwrap_or_else(|| "notification".to_string());
                    let aumid = un
                        .AppInfo()
                        .ok()
                        .and_then(|info| info.AppUserModelId().ok())
                        .map(|h| h.to_string());
                    let key = format!(
                        "{}|{}|{}",
                        id,
                        ct.UniversalTime,
                        aumid.as_deref().unwrap_or("")
                    );
                    if priming {
                        seen.insert(key);
                        continue;
                    }
                    if !seen.insert(key) {
                        continue;
                    }
                    let fg = acquisition::sample_front_window()
                        .map(|f| f.app_name)
                        .ok();
                    let row = NotificationRow {
                        id: Uuid::new_v4().to_string(),
                        timestamp_ms: Utc::now().timestamp_millis(),
                        source_app: app_title,
                        source_bundle_id: aumid,
                        current_foreground_app: fg,
                        user_responded: 0,
                        response_delay_ms: None,
                        caused_switch: 0,
                    };
                    let _ = writer.try_send(WriteEvent::Notification(row));
                }
                if priming {
                    priming = false;
                }
                if seen.len() > 8000 {
                    seen.clear();
                    priming = true;
                }
            }
        });
    }
}

#[cfg(target_os = "windows")]
pub use win::spawn_system_notification_listener;

#[cfg(not(target_os = "windows"))]
pub fn spawn_system_notification_listener(
    _writer: crate::core::writer::WriterHandle,
    _tracking: std::sync::Arc<std::sync::atomic::AtomicBool>,
    _running: std::sync::Arc<std::sync::atomic::AtomicBool>,
    _enabled: std::sync::Arc<std::sync::atomic::AtomicBool>,
) {
}
