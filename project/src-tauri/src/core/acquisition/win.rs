//! 前台窗口与空闲检测（Windows Win32）；键鼠计数（WH_KEYBOARD_LL / WH_MOUSE_LL）；环境采样；通知监听权限探测。

use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use screenshots::Screen;
use windows::UI::Notifications::Management::{
    UserNotificationListener, UserNotificationListenerAccessStatus,
};
use windows::Win32::Foundation::{ERROR_SUCCESS, LPARAM, LRESULT, WPARAM};
use windows::Win32::NetworkManagement::WiFi::{
    wlan_interface_state_connected, wlan_intf_opcode_current_connection, WlanCloseHandle,
    WlanEnumInterfaces, WlanFreeMemory, WlanOpenHandle, WlanQueryInterface, DOT11_SSID,
    WLAN_API_VERSION, WLAN_CONNECTION_ATTRIBUTES, WLAN_INTERFACE_INFO, WLAN_INTERFACE_INFO_LIST,
};
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
use windows::Win32::System::WinRT::RoInitialize;
use windows::Win32::System::WinRT::RO_INIT_MULTITHREADED;
use windows::Win32::System::Threading::{
    GetCurrentThreadId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, HHOOK, KBDLLHOOKSTRUCT, LLKHF_INJECTED,
    LLMHF_INJECTED, MSLLHOOKSTRUCT, PostThreadMessageW, SetWindowsHookExW, TranslateMessage,
    UnhookWindowsHookEx, MSG, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN, WM_LBUTTONDOWN, WM_QUIT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetSystemMetrics, GetWindowTextW, GetWindowThreadProcessId, SM_CMONITORS,
};
use windows::core::PWSTR;
use windows::Win32::Foundation::CloseHandle;

#[derive(Debug, Clone)]
pub struct FrontWindowState {
    pub app_name: String,
    pub bundle_id: Option<String>,
    pub window_title: String,
    pub is_fullscreen: bool,
}

static KEY_TOTAL: AtomicU32 = AtomicU32::new(0);
static MOUSE_TOTAL: AtomicU32 = AtomicU32::new(0);
static INPUT_LAST: Mutex<Option<(u32, u32)>> = Mutex::new(None);
/// `HHOOK` 不满足 `Send`/`Sync`，不能放进 `static OnceLock`；存裸指针位模式（`usize`）即可。
static KB_HOOK_HANDLE: OnceLock<usize> = OnceLock::new();
static MOUSE_HOOK_HANDLE: OnceLock<usize> = OnceLock::new();
/// 钩子线程的 Win32 线程 ID，用于从外部 PostThreadMessage(WM_QUIT) 停止消息泵。
static HOOK_THREAD_ID: AtomicU32 = AtomicU32::new(0);

#[inline]
fn hook_from_slot(slot: &OnceLock<usize>) -> HHOOK {
    HHOOK(slot.get().copied().unwrap_or(0) as *mut _)
}

pub fn ax_trusted() -> bool {
    true
}

pub fn idle_seconds() -> f64 {
    unsafe {
        let mut lii = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if !GetLastInputInfo(&mut lii).as_bool() {
            return 0.0;
        }
        let tick = windows::Win32::System::SystemInformation::GetTickCount();
        let idle_ms = tick.wrapping_sub(lii.dwTime);
        idle_ms as f64 / 1000.0
    }
}

pub fn screen_capture_granted() -> bool {
    screen_capture_probe()
}

pub fn screen_capture_refresh_access() -> bool {
    screen_capture_probe()
}

pub fn screen_capture_poll_check() -> bool {
    screen_capture_probe()
}

pub fn request_screen_capture_access() -> bool {
    screen_capture_probe()
}

pub fn active_display_count() -> i32 {
    unsafe { GetSystemMetrics(SM_CMONITORS).max(1) }
}

/// 与上一采样点相比的新增 KeyDown / 左键按下（排除注入事件）；依赖 `spawn_low_level_input_hooks`。
pub fn hardware_input_delta() -> (u32, u32) {
    let k = KEY_TOTAL.load(Ordering::Relaxed);
    let m = MOUSE_TOTAL.load(Ordering::Relaxed);
    let mut g = INPUT_LAST.lock().unwrap();
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

pub fn spawn_low_level_input_hooks(running: Arc<AtomicBool>) {
    std::thread::spawn(move || unsafe {
        let Ok(k_hook) = SetWindowsHookExW(
            WH_KEYBOARD_LL,
            Some(low_level_keyboard_proc),
            windows::Win32::Foundation::HINSTANCE::default(),
            0,
        ) else {
            log::warn!("WH_KEYBOARD_LL: SetWindowsHookExW failed");
            return;
        };
        let Ok(m_hook) = SetWindowsHookExW(
            WH_MOUSE_LL,
            Some(low_level_mouse_proc),
            windows::Win32::Foundation::HINSTANCE::default(),
            0,
        ) else {
            log::warn!("WH_MOUSE_LL: SetWindowsHookExW failed");
            let _ = UnhookWindowsHookEx(k_hook);
            return;
        };
        let _ = KB_HOOK_HANDLE.set(k_hook.0 as usize);
        let _ = MOUSE_HOOK_HANDLE.set(m_hook.0 as usize);

        // 保存线程 ID，供外部通过 PostThreadMessageW(WM_QUIT) 停止消息泵。
        // WH_MOUSE_LL / WH_KEYBOARD_LL 要求钩子线程必须持续抽取消息（GetMessage 阻塞式），
        // 否则 Windows 会在 LowLevelHooksTimeout（默认 200ms）后跳过钩子，
        // 导致每次鼠标移动都有最长 50ms 的延迟（旧 PeekMessage+sleep 方案的根本缺陷）。
        HOOK_THREAD_ID.store(GetCurrentThreadId(), Ordering::Relaxed);

        let mut msg = MSG::default();
        // GetMessage 阻塞等待，仅在有消息时才唤醒，CPU 占用为零。
        // 收到 WM_QUIT（由 stop_low_level_input_hooks 发送）时返回 false，退出循环。
        while GetMessageW(&mut msg, windows::Win32::Foundation::HWND(std::ptr::null_mut()), 0, 0)
            .as_bool()
        {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        // running 标志已由调用方管理，此处仅做兜底检查（正常路径由 WM_QUIT 退出）。
        let _ = UnhookWindowsHookEx(k_hook);
        let _ = UnhookWindowsHookEx(m_hook);
        HOOK_THREAD_ID.store(0, Ordering::Relaxed);
        drop(running); // 持有 Arc 直到线程退出，确保生命周期正确
    });
}

/// 向钩子线程发送 WM_QUIT，使其退出 GetMessage 循环并卸载钩子。
/// 由 running 标志变为 false 的调用方负责调用（如 app 退出时）。
pub fn stop_low_level_input_hooks() {
    let tid = HOOK_THREAD_ID.load(Ordering::Relaxed);
    if tid != 0 {
        unsafe {
            let _ = PostThreadMessageW(tid, WM_QUIT, windows::Win32::Foundation::WPARAM(0), windows::Win32::Foundation::LPARAM(0));
        }
    }
}

unsafe extern "system" fn low_level_keyboard_proc(
    code: i32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    let hk = hook_from_slot(&KB_HOOK_HANDLE);
    if code < 0 {
        return CallNextHookEx(hk, code, wparam, lparam);
    }
    if wparam.0 as u32 == WM_KEYDOWN {
        let info = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        if info.flags.0 & LLKHF_INJECTED.0 == 0 {
            KEY_TOTAL.fetch_add(1, Ordering::Relaxed);
        }
    }
    CallNextHookEx(hk, code, wparam, lparam)
}

unsafe extern "system" fn low_level_mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    let hk = hook_from_slot(&MOUSE_HOOK_HANDLE);
    if code < 0 {
        return CallNextHookEx(hk, code, wparam, lparam);
    }
    if wparam.0 as u32 == WM_LBUTTONDOWN {
        let info = &*(lparam.0 as *const MSLLHOOKSTRUCT);
        if info.flags & LLMHF_INJECTED == 0 {
            MOUSE_TOTAL.fetch_add(1, Ordering::Relaxed);
        }
    }
    CallNextHookEx(hk, code, wparam, lparam)
}

pub fn notifications_listener_access_granted() -> bool {
    unsafe {
        let _ = RoInitialize(RO_INIT_MULTITHREADED);
    }
    match UserNotificationListener::Current() {
        Ok(l) => l
            .GetAccessStatus()
            .map(|s| s == UserNotificationListenerAccessStatus::Allowed)
            .unwrap_or(false),
        Err(_) => false,
    }
}

pub fn sample_ambient_extras() -> super::AmbientExtras {
    super::AmbientExtras {
        wifi_ssid: wifi_ssid_connected(),
        battery_percent: battery_percent_win(),
        is_charging: ac_power_online_win(),
    }
}

fn battery_percent_win() -> Option<f64> {
    let mut st = SYSTEM_POWER_STATUS::default();
    unsafe {
        GetSystemPowerStatus(&mut st).ok()?;
    }
    if st.BatteryLifePercent >= 1 && st.BatteryLifePercent <= 100 {
        Some(f64::from(st.BatteryLifePercent))
    } else {
        None
    }
}

fn ac_power_online_win() -> Option<i64> {
    let mut st = SYSTEM_POWER_STATUS::default();
    unsafe {
        GetSystemPowerStatus(&mut st).ok()?;
    }
    match st.ACLineStatus {
        0 => Some(0),
        1 => Some(1),
        _ => None,
    }
}

fn dot11_ssid_to_string(s: &DOT11_SSID) -> Option<String> {
    let n = s.uSSIDLength as usize;
    if n == 0 || n > s.ucSSID.len() {
        return None;
    }
    std::str::from_utf8(&s.ucSSID[..n])
        .ok()
        .map(|x| x.to_string())
}

fn wifi_ssid_connected() -> Option<String> {
    unsafe {
        let mut negotiated = 0u32;
        let mut client = windows::Win32::Foundation::HANDLE::default();
        if WlanOpenHandle(WLAN_API_VERSION, None, &mut negotiated, &mut client) != ERROR_SUCCESS.0 {
            return None;
        }
        let mut list: *mut WLAN_INTERFACE_INFO_LIST = std::ptr::null_mut();
        let r = WlanEnumInterfaces(client, None, &mut list);
        if r != ERROR_SUCCESS.0 || list.is_null() {
            let _ = WlanCloseHandle(client, None);
            return None;
        }
        let mut out = None;
        let n = (*list).dwNumberOfItems as usize;
        let base: *const WLAN_INTERFACE_INFO = std::ptr::addr_of!((*list).InterfaceInfo[0]);
        for i in 0..n {
            let info = &*base.add(i);
            if info.isState != wlan_interface_state_connected {
                continue;
            }
            let mut sz = 0u32;
            let mut pdata: *mut core::ffi::c_void = std::ptr::null_mut();
            let qr = WlanQueryInterface(
                client,
                &info.InterfaceGuid,
                wlan_intf_opcode_current_connection,
                None,
                &mut sz,
                &mut pdata,
                None,
            );
            if qr != ERROR_SUCCESS.0 || pdata.is_null() || sz < std::mem::size_of::<WLAN_CONNECTION_ATTRIBUTES>() as u32
            {
                continue;
            }
            let attrs = &*(pdata as *const WLAN_CONNECTION_ATTRIBUTES);
            out = dot11_ssid_to_string(&attrs.wlanAssociationAttributes.dot11Ssid);
            WlanFreeMemory(pdata);
            break;
        }
        WlanFreeMemory(list as *mut _);
        let _ = WlanCloseHandle(client, None);
        out
    }
}

fn screen_capture_probe() -> bool {
    Screen::all().map(|s| !s.is_empty()).unwrap_or(false)
}

unsafe fn exe_path_for_pid(pid: u32) -> Option<String> {
    let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
    let mut buffer = [0u16; 4096];
    let mut size = buffer.len() as u32;
    let r = QueryFullProcessImageNameW(
        handle,
        PROCESS_NAME_WIN32,
        PWSTR(buffer.as_mut_ptr()),
        &mut size,
    );
    let _ = CloseHandle(handle);
    r.ok()?;
    Some(String::from_utf16_lossy(&buffer[..size as usize]))
}

pub fn sample_front_window() -> Result<FrontWindowState, String> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_invalid() {
            return Err("no foreground window".into());
        }
        let mut title_buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut title_buf);
        let window_title = if len > 0 {
            String::from_utf16_lossy(&title_buf[..len as usize])
        } else {
            String::new()
        };
        let mut pid = 0u32;
        let _tid = GetWindowThreadProcessId(hwnd, Some(std::ptr::addr_of_mut!(pid)));
        let (app_name, bundle_id) = if pid == 0 {
            ("Unknown".to_string(), None)
        } else if let Some(path) = exe_path_for_pid(pid) {
            let stem = Path::new(&path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Unknown")
                .to_string();
            (stem, Some(path))
        } else {
            (format!("PID {pid}"), None)
        };
        Ok(FrontWindowState {
            app_name,
            bundle_id,
            window_title,
            is_fullscreen: false,
        })
    }
}
