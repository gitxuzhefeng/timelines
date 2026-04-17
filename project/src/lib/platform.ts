/**
 * 桌面客户端 OS 探测（Tauri WebView 的 navigator.userAgent）。
 * 用于权限文案等与系统设置入口对齐；勿用于安全决策。
 */
export type ClientDesktopOs = "windows" | "macos" | "other";
export type ClientRenderingEngine = "webview2" | "webkit" | "other";

export interface ClientPlatformProfile {
  os: ClientDesktopOs;
  engine: ClientRenderingEngine;
  requiresLocalhostProtocolWorkaround: boolean;
}

/** 与 `src-tauri/tauri.conf.json` 的 `identifier` 保持一致，用于 macOS 权限排障文案（TCC 按此 ID 记录授权）。 */
export const MACOS_APP_BUNDLE_ID = "com.timelens.desktop";

function parseClientPlatformProfile(ua: string): ClientPlatformProfile {
  if (/Windows NT/i.test(ua)) {
    return {
      os: "windows",
      // Tauri on Windows uses WebView2 (Chromium-based runtime).
      engine: "webview2",
      requiresLocalhostProtocolWorkaround: true,
    };
  }
  if (/Mac OS X|Macintosh/i.test(ua)) {
    return {
      os: "macos",
      // Tauri on macOS uses WKWebView.
      engine: "webkit",
      requiresLocalhostProtocolWorkaround: false,
    };
  }
  if (/Android/i.test(ua)) {
    return {
      os: "other",
      engine: "other",
      requiresLocalhostProtocolWorkaround: true,
    };
  }
  return {
    os: "other",
    engine: "other",
    requiresLocalhostProtocolWorkaround: false,
  };
}

export function getClientPlatformProfile(): ClientPlatformProfile {
  if (typeof navigator === "undefined") {
    return {
      os: "other",
      engine: "other",
      requiresLocalhostProtocolWorkaround: false,
    };
  }
  return parseClientPlatformProfile(navigator.userAgent);
}

export function detectClientDesktopOs(): ClientDesktopOs {
  return getClientPlatformProfile().os;
}

export function detectClientRenderingEngine(): ClientRenderingEngine {
  return getClientPlatformProfile().engine;
}

export function isWebView2LikeRuntime(): boolean {
  return detectClientRenderingEngine() === "webview2";
}

/** WebView2 / Android 对非标准自定义 scheme 子资源有限制，需走 `http://{scheme}.localhost/…` workaround */
export function usesCustomProtocolLocalhostWorkaround(): boolean {
  return getClientPlatformProfile().requiresLocalhostProtocolWorkaround;
}

/** 会话页权限角标短标签 */
export function permissionBadgeShortLabels(os: ClientDesktopOs): {
  accessibility: string;
  screen: string;
  notifications: string;
} {
  if (os === "windows") {
    return {
      accessibility: "前台窗口",
      screen: "屏幕截图",
      notifications: "通知访问",
    };
  }
  return {
    accessibility: "辅助功能",
    screen: "屏幕录制",
    notifications: "通知监听",
  };
}

/** 打开系统设置类按钮文案（与 `open_*_settings` 后端行为对应） */
export function permissionSettingsButtonLabels(os: ClientDesktopOs): {
  accessibility: string;
  screen: string;
  notifications: string;
} {
  if (os === "windows") {
    return {
      accessibility: "轻松使用设置",
      screen: "隐私设置",
      notifications: "通知权限设置",
    };
  }
  return {
    accessibility: "辅助功能设置",
    screen: "屏幕录制设置",
    notifications: "通知权限设置",
  };
}

/** 设置页「屏幕文字 OCR」区块顶部说明（与 src-tauri 各平台引擎一致） */
export function ocrDependencySummary(os: ClientDesktopOs): string {
  if (os === "macos") {
    return "本机使用 Apple Vision 框架离线识别，无需单独安装 Tesseract。";
  }
  if (os === "windows") {
    return "本机使用 Windows.Media.Ocr（WinRT），依赖 Windows 已安装的用户语言/OCR 语言包（设置 → 时间和语言 → 语言与区域）。";
  }
  return "本机构建目标为 macOS / Windows 桌面；其他环境如需 OCR 请安装 Tesseract 并配置 PATH。";
}

/** OCR 高级参数折叠区引言 */
export function ocrPipelineDetailsIntro(os: ClientDesktopOs): string {
  if (os === "macos") {
    return "languages 会映射为 Vision 的 BCP-47 识别语言列表；PSM 仅对历史 Tesseract 路径有意义，在 macOS 上不参与 Vision。";
  }
  if (os === "windows") {
    return "WinRT 引擎使用 Windows 用户配置的首选语言；下方 languages 不会传入 WinRT，但行级闸门、词级置信度与预处理仍影响最终入库文本。";
  }
  return "以下参数主要面向 Tesseract；当前桌面发行版以各平台系统 OCR 为准时，部分字段可能仅影响闸门与预处理。";
}

export function ocrLanguagesFieldCaption(os: ClientDesktopOs): string {
  if (os === "macos") {
    return "languages（Vision 映射）";
  }
  if (os === "windows") {
    return "languages（闸门/兼容；WinRT 语言跟系统）";
  }
  return "languages（Tesseract -l）";
}

export function ocrLanguagesFieldHint(os: ClientDesktopOs): string {
  if (os === "macos") {
    return "如 chi_sim+eng 会映射为 zh-Hans、en-US 等；至少会包含 en-US。";
  }
  if (os === "windows") {
    return "用于与设置项对齐及后续扩展；实际识别语言请在 Windows 中安装对应语言包。";
  }
  return "传给 Tesseract 的 -l，如 chi_sim+eng；须本机已安装对应语言包。";
}

export function ocrPsmFieldCaption(os: ClientDesktopOs): string {
  if (os === "macos" || os === "windows") {
    return "PSM（0–13，闸门用）";
  }
  return "PSM（0–13）";
}

export function ocrPsmFieldHint(os: ClientDesktopOs): string {
  if (os === "macos") {
    return "Vision 不使用 PSM；该值保留给闸门/展示一致性，可忽略。";
  }
  if (os === "windows") {
    return "WinRT 不使用 Tesseract PSM；仍可作为团队内统一配置项。";
  }
  return "页面分割模式（--psm）。整屏常用 6；字少、散在边角可试 11。";
}

/** 健康页底部平台提示 */
export function pipelineHealthPlatformNote(os: ClientDesktopOs): string {
  if (os === "windows") {
    return "Windows：Tracker 依赖前台窗口与空闲检测；截图依赖屏幕 API；通知引擎需在系统设置中允许应用访问通知；输入计数依赖底层钩子（部分安全软件可能拦截）。";
  }
  if (os === "macos") {
    return "macOS：Tracker 依赖辅助功能权限；截图依赖屏幕录制权限；通知监听需在系统设置中授权。";
  }
  return "请在支持的桌面系统（macOS / Windows）上使用完整采集能力。";
}
