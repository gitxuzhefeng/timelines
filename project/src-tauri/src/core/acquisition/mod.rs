#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(target_os = "windows")]
mod win;
#[cfg(target_os = "windows")]
pub use win::*;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
#[derive(Debug, Clone, Default)]
pub struct FrontWindowState {
    pub app_name: String,
    pub bundle_id: Option<String>,
    pub window_title: String,
    pub is_fullscreen: bool,
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn sample_front_window() -> Result<FrontWindowState, String> {
    Err("TimeLens only supports macOS and Windows".into())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn idle_seconds() -> f64 {
    0.0
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn ax_trusted() -> bool {
    false
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn screen_capture_granted() -> bool {
    false
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn screen_capture_refresh_access() -> bool {
    false
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn active_display_count() -> i32 {
    1
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn hardware_input_delta() -> (u32, u32) {
    (0, 0)
}

/// WiFi SSID、电量（0–100）、是否充电（0/1）；任一不可用则为 `None`。
#[derive(Debug, Clone, Default)]
pub struct AmbientExtras {
    pub wifi_ssid: Option<String>,
    pub battery_percent: Option<f64>,
    pub is_charging: Option<i64>,
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn sample_ambient_extras() -> AmbientExtras {
    AmbientExtras::default()
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn notifications_listener_access_granted() -> bool {
    false
}

#[cfg(target_os = "windows")]
pub fn spawn_low_level_input_hooks(running: std::sync::Arc<std::sync::atomic::AtomicBool>) {
    win::spawn_low_level_input_hooks(running);
}

#[cfg(not(target_os = "windows"))]
pub fn spawn_low_level_input_hooks(_running: std::sync::Arc<std::sync::atomic::AtomicBool>) {}
