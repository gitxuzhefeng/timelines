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
