use std::process::Command;
use std::thread;
use std::time::Duration;

use arboard::Clipboard;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalAiProviderDto {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone)]
pub struct ExternalAiProvider {
    pub id: &'static str,
    pub label_zh: &'static str,
    pub label_en: &'static str,
    pub web_url: &'static str,
    pub mac_app_names: &'static [&'static str],
}

const DOUBAO_WEB: ExternalAiProvider = ExternalAiProvider {
    id: "doubao_web",
    label_zh: "豆包（网页）",
    label_en: "Doubao (Web)",
    web_url: "https://www.doubao.com/chat",
    mac_app_names: &[],
};

const DOUBAO_APP: ExternalAiProvider = ExternalAiProvider {
    id: "doubao_app",
    label_zh: "豆包（客户端）",
    label_en: "Doubao (App)",
    web_url: "https://www.doubao.com/chat",
    mac_app_names: &["豆包", "Doubao", "doubao"],
};

pub fn providers(lang: &str) -> Vec<ExternalAiProviderDto> {
    [DOUBAO_WEB, DOUBAO_APP]
        .iter()
        .map(|p| ExternalAiProviderDto {
            id: p.id.to_string(),
            label: provider_label(p, lang),
        })
        .collect()
}

pub fn resolve_provider(id: &str) -> ExternalAiProvider {
    match id {
        "doubao_app" => DOUBAO_APP,
        _ => DOUBAO_WEB,
    }
}

pub fn provider_label(provider: &ExternalAiProvider, lang: &str) -> String {
    if lang.eq_ignore_ascii_case("zh-CN") {
        provider.label_zh.to_string()
    } else {
        provider.label_en.to_string()
    }
}

pub fn write_clipboard_text(text: &str) -> Result<usize, String> {
    let mut cb = Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(text).map_err(|e| e.to_string())?;
    Ok(text.chars().count())
}

pub fn launch_provider(provider: &ExternalAiProvider) -> Result<Option<String>, String> {
    if provider.id == "doubao_app" {
        launch_doubao_app(provider)
    } else {
        open::that(provider.web_url).map_err(|e| e.to_string())?;
        Ok(None)
    }
}

fn launch_doubao_app(provider: &ExternalAiProvider) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        for app_name in provider.mac_app_names {
            let status = Command::new("open")
                .arg("-a")
                .arg(app_name)
                .status()
                .map_err(|e| e.to_string())?;
            if status.success() {
                // 给客户端启动和前台聚焦一点时间，避免粘贴过早。
                thread::sleep(Duration::from_millis(1200));
                return Ok(None);
            }
        }
        open::that(provider.web_url).map_err(|e| e.to_string())?;
        return Ok(Some("豆包客户端未找到，已回退到网页".to_string()));
    }

    #[cfg(target_os = "windows")]
    {
        open::that(provider.web_url).map_err(|e| e.to_string())?;
        return Ok(Some(
            "Doubao app launch is not configured on Windows; fallback to web".to_string(),
        ));
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        open::that(provider.web_url).map_err(|e| e.to_string())?;
        Ok(Some(
            "Current platform does not support native Doubao app launch; fallback to web"
                .to_string(),
        ))
    }
}

pub fn try_auto_paste(provider_id: &str) -> Result<(), String> {
    let attempts = if provider_id == "doubao_app" { 4 } else { 3 };
    let initial_delay = if provider_id == "doubao_app" { 900 } else { 1200 };
    thread::sleep(Duration::from_millis(initial_delay));

    #[cfg(target_os = "macos")]
    {
        for _ in 0..attempts {
            let status = Command::new("osascript")
                .arg("-e")
                .arg("tell application \"System Events\" to keystroke \"v\" using command down")
                .status()
                .map_err(|e| e.to_string())?;
            if status.success() {
                return Ok(());
            }
            thread::sleep(Duration::from_millis(450));
        }
        return Err("auto paste failed on macOS".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        for _ in 0..attempts {
            let status = Command::new("powershell")
                .arg("-NoProfile")
                .arg("-Command")
                .arg(
                    "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')",
                )
                .status()
                .map_err(|e| e.to_string())?;
            if status.success() {
                return Ok(());
            }
            thread::sleep(Duration::from_millis(500));
        }
        return Err("auto paste failed on Windows".to_string());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("auto paste unsupported on this platform".to_string())
    }
}

