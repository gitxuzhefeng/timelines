import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zh from "./locales/zh-CN.json";
import en from "./locales/en.json";
import { setLanguage as setBackendLanguage } from "../services/tauri";

export const SUPPORTED_LANGUAGES = ["zh-CN", "en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const LANG_STORAGE_KEY = "timelens_ui_lang";

/** 优先读取用户保存的语言偏好，否则从 navigator.language 推断，匹配不到则 fallback 到 en */
function resolveInitialLanguage(): SupportedLanguage {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === "zh-CN" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  const lang = navigator.language ?? "";
  if (lang.startsWith("zh")) return "zh-CN";
  return "en";
}

export function setLanguage(lang: SupportedLanguage): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
  void i18n.changeLanguage(lang);
  // Phase 12: 同步到后端，让 AI 助手等使用对应语言
  void setBackendLanguage(lang).catch(() => {});
}

i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": { translation: zh },
    en: { translation: en },
  },
  lng: resolveInitialLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
