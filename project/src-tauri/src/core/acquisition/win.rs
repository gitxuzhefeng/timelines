//! 前台窗口与空闲检测（Windows Win32）。

use std::path::Path;

use screenshots::Screen;
use windows::core::PWSTR;
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::SystemInformation::GetTickCount;
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
};

#[derive(Debug, Clone)]
pub struct FrontWindowState {
    pub app_name: String,
    pub bundle_id: Option<String>,
    pub window_title: String,
    pub is_fullscreen: bool,
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
        let tick = GetTickCount();
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
