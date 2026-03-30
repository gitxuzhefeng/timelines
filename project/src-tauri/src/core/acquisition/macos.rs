use core_foundation::base::{CFRelease, CFTypeRef, TCFType};
use core_foundation::string::CFString;
use libc::pid_t;
use objc2::rc::Retained;
use objc2_app_kit::NSWorkspace;
use objc2_foundation::NSString;

#[derive(Debug, Clone)]
pub struct FrontWindowState {
    pub app_name: String,
    pub bundle_id: Option<String>,
    pub window_title: String,
    pub is_fullscreen: bool,
}

#[repr(C)]
struct AxOpaque(std::ffi::c_void);
type AXUIElementRef = *const AxOpaque;

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> u8;
    fn AXUIElementCreateApplication(pid: pid_t) -> AXUIElementRef;
    fn AXUIElementCopyAttributeValue(
        element: AXUIElementRef,
        attribute: *const core_foundation::string::__CFString,
        value: *mut CFTypeRef,
    ) -> i32;
}

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGEventSourceSecondsSinceLastEventType(state_id: u32, event_type: u32) -> f64;
    fn CGPreflightScreenCaptureAccess() -> u8;
    /// 触发系统授权弹窗（若尚未决定）；已授权/已拒绝时行为由系统决定。
    fn CGRequestScreenCaptureAccess() -> u8;
}

const K_CG_EVENT_SOURCE_STATE_HID_SYSTEM_STATE: u32 = 1;

pub fn ax_trusted() -> bool {
    unsafe { AXIsProcessTrusted() != 0 }
}

pub fn idle_seconds() -> f64 {
    unsafe {
        CGEventSourceSecondsSinceLastEventType(
            K_CG_EVENT_SOURCE_STATE_HID_SYSTEM_STATE,
            u32::MAX,
        )
    }
}

pub fn screen_capture_granted() -> bool {
    unsafe { CGPreflightScreenCaptureAccess() != 0 }
}

/// 请求屏幕录制权限并重新检测。应在用户点击「刷新权限」或从系统设置返回后调用。
pub fn screen_capture_refresh_access() -> bool {
    unsafe {
        let _ = CGRequestScreenCaptureAccess();
        CGPreflightScreenCaptureAccess() != 0
    }
}

unsafe fn ax_copy_attr(element: AXUIElementRef, key: &str) -> Option<CFTypeRef> {
    if element.is_null() {
        return None;
    }
    let attr = CFString::new(key);
    let mut out: CFTypeRef = std::ptr::null();
    let st = AXUIElementCopyAttributeValue(element, attr.as_concrete_TypeRef(), &mut out);
    if st == 0 && !out.is_null() {
        Some(out)
    } else {
        None
    }
}

unsafe fn focused_window_title(pid: pid_t) -> String {
    if !ax_trusted() {
        return String::new();
    }
    let app_el = AXUIElementCreateApplication(pid);
    if app_el.is_null() {
        return String::new();
    }
    let focused = match ax_copy_attr(app_el, "AXFocusedWindow") {
        Some(f) => f,
        None => {
            CFRelease(app_el as CFTypeRef);
            return String::new();
        }
    };
    let title_ref = ax_copy_attr(focused as AXUIElementRef, "AXTitle");
    CFRelease(focused);
    let title = match title_ref {
        Some(t) => {
            let cf = CFString::wrap_under_create_rule(t as *const _);
            cf.to_string()
        }
        None => String::new(),
    };
    CFRelease(app_el as CFTypeRef);
    title
}

pub fn sample_front_window() -> Result<FrontWindowState, String> {
    unsafe {
        let workspace = NSWorkspace::sharedWorkspace();
        let app = workspace
            .frontmostApplication()
            .ok_or_else(|| "no frontmost application".to_string())?;
        let pid = app.processIdentifier();
        let app_name = app
            .localizedName()
            .map(|n: Retained<NSString>| n.to_string())
            .unwrap_or_else(|| "Unknown".to_string());
        let bundle_id = app
            .bundleIdentifier()
            .map(|b: Retained<NSString>| b.to_string());
        let window_title = focused_window_title(pid);
        Ok(FrontWindowState {
            app_name,
            bundle_id,
            window_title,
            is_fullscreen: false,
        })
    }
}
