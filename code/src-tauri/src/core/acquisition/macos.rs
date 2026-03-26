use std::process::Command;
use objc::{msg_send, sel, sel_impl};
use cocoa::base::{id, nil};
use cocoa::foundation::{NSString, NSAutoreleasePool};

/// Get the currently active application name and window title on macOS
pub fn get_active_window() -> Option<(String, String)> {
    // Use AppleScript to get frontmost app and window title
    let script = r#"
tell application "System Events"
    set frontApp to first application process whose frontmost is true
    set appName to name of frontApp
    try
        set windowTitle to name of first window of frontApp
        return appName & "|SPLIT|" & windowTitle
    on error
        return appName & "|SPLIT|" & appName
    end try
end tell
"#;

    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let result = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if result.is_empty() {
        return None;
    }

    let parts: Vec<&str> = result.splitn(2, "|SPLIT|").collect();
    if parts.len() == 2 {
        Some((parts[0].trim().to_string(), parts[1].trim().to_string()))
    } else {
        Some((result.clone(), result))
    }
}

pub fn get_app_icon_base64(app_name: &str) -> Option<String> {
    unsafe {
        let _pool = NSAutoreleasePool::new(nil);
        
        let workspace: id = msg_send![objc::class!(NSWorkspace), sharedWorkspace];
        
        // 1. Try to find the app path using NSWorkspace
        let app_name_ns = NSString::alloc(nil).init_str(app_name);
        let path_ns: id = msg_send![workspace, fullPathForApplication: app_name_ns];
        
        if path_ns == nil {
            // Fallback: try common paths or osascript
            let script = format!("POSIX path of (path to application \"{}\")", app_name);
            let output = Command::new("osascript").args(["-e", &script]).output().ok()?;
            if !output.status.success() { return None; }
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let path_ns_fallback = NSString::alloc(nil).init_str(&path_str);
            return get_icon_from_path(workspace, path_ns_fallback);
        }
        
        get_icon_from_path(workspace, path_ns)
    }
}

unsafe fn get_icon_from_path(workspace: id, path_ns: id) -> Option<String> {
    let icon: id = msg_send![workspace, iconForFile: path_ns];
    if icon == nil { return None; }
    
    let size = cocoa::foundation::NSSize::new(64.0, 64.0);
    let _: () = msg_send![icon, setSize: size];
    
    let tiff: id = msg_send![icon, TIFFRepresentation];
    if tiff == nil { return None; }
    
    let image_rep: id = msg_send![objc::class!(NSBitmapImageRep), imageRepWithData: tiff];
    if image_rep == nil { return None; }
    
    let png_data: id = msg_send![image_rep, representationUsingType: 4 // NSPNGFileType
                                           properties: nil];
    if png_data == nil { return None; }
    
    let length: usize = msg_send![png_data, length];
    let bytes: *const u8 = msg_send![png_data, bytes];
    let slice = std::slice::from_raw_parts(bytes, length);
    
    use base64::{Engine as _, engine::general_purpose};
    Some(general_purpose::STANDARD.encode(slice))
}

pub mod macos_idle {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        pub fn CGEventSourceSecondsSinceLastEventType(source: i32, event_type: u32) -> f64;
    }
    pub const COMBINED_SESSION_STATE: i32 = 0;
    pub const ANY_INPUT_EVENT_TYPE: u32 = 0xFFFFFFFF;
}
