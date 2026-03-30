#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(not(target_os = "macos"))]
#[derive(Debug, Clone, Default)]
pub struct FrontWindowState {
    pub app_name: String,
    pub bundle_id: Option<String>,
    pub window_title: String,
    pub is_fullscreen: bool,
}

#[cfg(not(target_os = "macos"))]
pub fn sample_front_window() -> Result<FrontWindowState, String> {
    Err("TimeLens only supports macOS".into())
}

#[cfg(not(target_os = "macos"))]
pub fn idle_seconds() -> f64 {
    0.0
}

#[cfg(not(target_os = "macos"))]
pub fn ax_trusted() -> bool {
    false
}

#[cfg(not(target_os = "macos"))]
pub fn screen_capture_granted() -> bool {
    false
}

#[cfg(not(target_os = "macos"))]
pub fn screen_capture_refresh_access() -> bool {
    false
}
