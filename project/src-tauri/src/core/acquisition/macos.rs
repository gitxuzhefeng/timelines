use core::ptr::NonNull;
use core_foundation::base::{CFRelease, CFTypeRef, TCFType};
use core_foundation::string::CFString;
use dispatch::Queue;
use libc::pid_t;
use std::fs;
use std::process::Command;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2_app_kit::NSWorkspace;
use objc2_core_wlan::CWWiFiClient;
use objc2_foundation::NSString;
use objc2_user_notifications::{
    UNAuthorizationStatus, UNNotificationSettings, UNUserNotificationCenter,
};

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
    /// 自系统启动以来硬件产生的事件计数（`source == NULL` 时）；用于 5s 窗口差分估算键鼠量。
    fn CGEventSourceCounterForEventType(source: *const std::ffi::c_void, event_type: u32) -> u32;
    fn CGGetActiveDisplayList(max_displays: u32, displays: *mut u32, count: *mut u32) -> i32;
    fn CGPreflightScreenCaptureAccess() -> u8;
    fn CGRequestScreenCaptureAccess() -> u8;
}

const K_CG_EVENT_SOURCE_STATE_HID_SYSTEM_STATE: u32 = 1;
/// `kCGEventKeyDown`
const K_CG_EVENT_KEY_DOWN: u32 = 10;
/// `kCGEventLeftMouseDown`
const K_CG_EVENT_LEFT_MOUSE_DOWN: u32 = 1;

static HW_COUNT_LAST: std::sync::Mutex<Option<(u32, u32)>> = std::sync::Mutex::new(None);

/// 与上一采样点相比的新增 KeyDown / 左键按下次数（首期用系统计数器差分，避免 CGEventTap）。
pub fn hardware_input_delta() -> (u32, u32) {
    unsafe {
        let k = CGEventSourceCounterForEventType(std::ptr::null(), K_CG_EVENT_KEY_DOWN);
        let m = CGEventSourceCounterForEventType(std::ptr::null(), K_CG_EVENT_LEFT_MOUSE_DOWN);
        let mut g = HW_COUNT_LAST.lock().unwrap();
        match *g {
            None => {
                *g = Some((k, m));
                (0, 0)
            }
            Some((pk, pm)) => {
                let dk = k.saturating_sub(pk);
                let dm = m.saturating_sub(pm);
                *g = Some((k, m));
                (dk, dm)
            }
        }
    }
}

/// 当前活跃显示器数量（任意线程可调用）。
pub fn active_display_count() -> i32 {
    unsafe {
        let mut buf = [0u32; 32];
        let mut n: u32 = 0;
        let st = CGGetActiveDisplayList(32, buf.as_mut_ptr(), &mut n);
        if st == 0 {
            n.max(1) as i32
        } else {
            1
        }
    }
}

fn macos_on_main_thread() -> bool {
    unsafe { libc::pthread_main_np() != 0 }
}

/// `AXIsProcessTrusted` 在部分环境（如 Tauri 从非主线程 invoke）下会误报未授权；
/// 与系统设置不一致时，应在主队列上检测。
pub fn ax_trusted() -> bool {
    let probe = || unsafe { AXIsProcessTrusted() != 0 };
    if macos_on_main_thread() {
        probe()
    } else {
        Queue::main().exec_sync(probe)
    }
}

pub fn idle_seconds() -> f64 {
    unsafe {
        CGEventSourceSecondsSinceLastEventType(
            K_CG_EVENT_SOURCE_STATE_HID_SYSTEM_STATE,
            u32::MAX,
        )
    }
}

/// 系统设置里已打开「屏幕录制」后，`CGPreflightScreenCaptureAccess` 仍可能长期返回 false（Apple 论坛多次确认），
/// 而 `screencapture` 与真实截图链路一致；故在 preflight 为 false 时做一次轻量探针对齐真实能力。
fn screen_capture_probe_screencapture() -> bool {
    let tmp = std::env::temp_dir().join(format!(
        "tl_scr_probe_{}_{}.png",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    ));
    let _ = fs::remove_file(&tmp);
    let ok = match Command::new("/usr/sbin/screencapture")
        .args(["-x", "-t", "png", "-D", "1"])
        .arg(&tmp)
        .status()
    {
        Ok(st) if st.success() => fs::metadata(&tmp).map(|m| m.len() > 200).unwrap_or(false),
        _ => false,
    };
    let _ = fs::remove_file(&tmp);
    ok
}

/// 仅 `CGPreflightScreenCaptureAccess`，不触发系统弹窗、不执行 `screencapture`。
/// 用于窗口焦点等高频回调——避免不必要的 `screencapture` 调用。
pub fn screen_capture_granted() -> bool {
    unsafe { CGPreflightScreenCaptureAccess() != 0 }
}

/// 用户点击「刷新系统权限」时使用：preflight 为真则真，否则试跑 `screencapture` 对齐真实能力。
pub fn screen_capture_effective_granted() -> bool {
    if unsafe { CGPreflightScreenCaptureAccess() != 0 } {
        return true;
    }
    screen_capture_probe_screencapture()
}

/// 历史名称保留给 `check_permissions`。
pub fn screen_capture_refresh_access() -> bool {
    screen_capture_effective_granted()
}

use std::sync::atomic::{AtomicBool, AtomicU64};
use std::time::{SystemTime, UNIX_EPOCH};

static REQUESTED_THIS_SESSION: AtomicBool = AtomicBool::new(false);
static LAST_PROBE_EPOCH_S: AtomicU64 = AtomicU64::new(0);
/// 一旦 screencapture 探针成功过一次，即可信任（跳过后续 preflight 误报）。
static PROBE_EVER_SUCCEEDED: AtomicBool = AtomicBool::new(false);

fn epoch_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// 用户主动点击「请求屏幕录制权限」时调用。
/// 每次应用运行只调用一次 `CGRequestScreenCaptureAccess`，防止反复弹框。
/// 返回 true 表示已授权或弹窗已触发。
pub fn request_screen_capture_access() -> bool {
    if unsafe { CGPreflightScreenCaptureAccess() != 0 } {
        return true;
    }
    if REQUESTED_THIS_SESSION.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return screen_capture_effective_granted();
    }
    let result = unsafe { CGRequestScreenCaptureAccess() != 0 };
    log::info!("CGRequestScreenCaptureAccess => {result}");
    result
}

/// .app 包内首次启动时自动调用一次，让系统把本应用加入 TCC 列表并弹出授权弹窗。
/// 非 .app 环境（如 tauri dev）不做任何事。
pub fn request_screen_capture_on_first_launch() {
    if !running_inside_macos_app_bundle() {
        return;
    }
    if unsafe { CGPreflightScreenCaptureAccess() != 0 } {
        return;
    }
    if REQUESTED_THIS_SESSION.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return;
    }
    let r = unsafe { CGRequestScreenCaptureAccess() };
    log::info!(
        "first-launch CGRequestScreenCaptureAccess => {}",
        r != 0
    );
}

/// 用于周期轮询（每 30s）：先查 preflight，若 false 且距上次探针 ≥60s 则跑 screencapture 探针。
/// 避免在高频回调中反复触发 screencapture。
pub fn screen_capture_poll_check() -> bool {
    if unsafe { CGPreflightScreenCaptureAccess() != 0 } {
        PROBE_EVER_SUCCEEDED.store(true, std::sync::atomic::Ordering::Relaxed);
        return true;
    }
    if PROBE_EVER_SUCCEEDED.load(std::sync::atomic::Ordering::Relaxed) {
        return true;
    }
    let now = epoch_secs();
    let last = LAST_PROBE_EPOCH_S.load(std::sync::atomic::Ordering::Relaxed);
    if now.saturating_sub(last) < 60 {
        return false;
    }
    LAST_PROBE_EPOCH_S.store(now, std::sync::atomic::Ordering::Relaxed);
    let ok = screen_capture_probe_screencapture();
    if ok {
        PROBE_EVER_SUCCEEDED.store(true, std::sync::atomic::Ordering::Relaxed);
        log::info!("screen_capture_poll_check: screencapture probe succeeded (preflight was false)");
    }
    ok
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

fn sample_wifi_ssid_macos() -> Option<String> {
    unsafe {
        let client = CWWiFiClient::sharedWiFiClient();
        let iface = client.interface()?;
        iface.ssid().map(|s| s.to_string())
    }
}

fn sample_battery_macos() -> (Option<f64>, Option<i64>) {
    use battery::units::ratio::percent;

    let manager = match battery::Manager::new() {
        Ok(m) => m,
        Err(_) => return (None, None),
    };
    let mut bats = match manager.batteries() {
        Ok(b) => b,
        Err(_) => return (None, None),
    };
    let bat = match bats.next() {
        Some(Ok(b)) => b,
        _ => return (None, None),
    };
    let pct = f64::from(bat.state_of_charge().get::<percent>());
    let is_ch = match bat.state() {
        battery::State::Charging | battery::State::Full => Some(1_i64),
        battery::State::Discharging | battery::State::Empty => Some(0_i64),
        _ => None,
    };
    (Some(pct), is_ch)
}

/// `UNUserNotificationCenter` 要求进程在有效的 app bundle 内；`cargo run` / `tauri dev` 下
/// `mainBundle` 指向 `target/debug/`，调用 `currentNotificationCenter` 会触发
/// `NSInternalInconsistencyException`（bundleProxyForCurrentProcess is nil）。
fn running_inside_macos_app_bundle() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.to_str().map(str::to_owned))
        .is_some_and(|s| s.contains(".app/Contents/"))
}

/// macOS 无公开 API 监听「其他应用」通知到达；此处对齐 **本应用 UserNotifications 授权**（非「拒绝」即视为可配合启发式/后续扩展）。
pub fn notifications_listener_access_granted() -> bool {
    if !running_inside_macos_app_bundle() {
        return true;
    }
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    let block = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
        let st = unsafe { settings.as_ref().authorizationStatus() };
        let ok = st != UNAuthorizationStatus::Denied;
        let _ = tx.send(ok);
    });
    let center = UNUserNotificationCenter::currentNotificationCenter();
    center.getNotificationSettingsWithCompletionHandler(&block);
    std::mem::forget(block);
    rx.recv_timeout(std::time::Duration::from_secs(2))
        .unwrap_or(true)
}

/// Wi‑Fi SSID（CoreWLAN，需定位权限才可能返回）+ 电量（`battery` / IOKit）。
pub fn sample_ambient_extras() -> super::AmbientExtras {
    let (battery_percent, is_charging) = sample_battery_macos();
    super::AmbientExtras {
        wifi_ssid: sample_wifi_ssid_macos(),
        battery_percent,
        is_charging,
    }
}
