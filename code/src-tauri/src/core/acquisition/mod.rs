pub mod macos;

/// Get the currently active application name and window title
pub fn get_active_window() -> Option<(String, String)> {
    #[cfg(target_os = "macos")]
    {
        macos::get_active_window()
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

/// Get the app icon as a base64 string
pub fn get_app_icon_base64(app_name: &str) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        macos::get_app_icon_base64(app_name)
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

/// Get idle time in seconds
pub fn get_idle_time() -> f64 {
    #[cfg(target_os = "macos")]
    {
        unsafe {
            macos::macos_idle::CGEventSourceSecondsSinceLastEventType(
                macos::macos_idle::COMBINED_SESSION_STATE,
                macos::macos_idle::ANY_INPUT_EVENT_TYPE,
            )
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        0.0
    }
}
