import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AiSettingsDto,
  EngineFlagsResponse,
  OcrPipelineConfig,
  OcrSettingsDto,
} from "../types";
import { SystemPermissionPanel } from "./SystemPermissionPanel";
import {
  detectClientDesktopOs,
  ocrDependencySummary,
  ocrLanguagesFieldCaption,
  ocrLanguagesFieldHint,
  ocrPipelineDetailsIntro,
  ocrPsmFieldCaption,
  ocrPsmFieldHint,
} from "../lib/platform";
import * as api from "../services/tauri";
import { useThemeStore } from "../stores/themeStore";
import {
  setLanguage,
  type SupportedLanguage,
} from "../i18n";

type AiProvider = "claude" | "deepseek" | "qwen" | "custom";

const PROVIDER_PRESETS: Record<Exclude<AiProvider, "custom">, { baseUrl: string; model: string }> = {
  claude:   { baseUrl: "https://api.anthropic.com/v1",                          model: "claude-sonnet-4-6" },
  deepseek: { baseUrl: "https://api.deepseek.com/v1",                           model: "deepseek-chat" },
  qwen:     { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",     model: "qwen-plus" },
};

const PROVIDER_GUIDE_URLS: Partial<Record<AiProvider, string>> = {
  claude:   "https://console.anthropic.com/settings/keys",
  deepseek: "https://platform.deepseek.com/api_keys",
  qwen:     "https://bailian.console.aliyun.com/",
};

function inferProvider(baseUrl: string): AiProvider {
  for (const [key, preset] of Object.entries(PROVIDER_PRESETS)) {
    if (baseUrl === preset.baseUrl) return key as AiProvider;
  }
  return "custom";
}

type SettingsFormProps = {
  className?: string;
};

export function SettingsForm({ className }: SettingsFormProps) {
  const { t, i18n } = useTranslation();
  const [f, setF] = useState<EngineFlagsResponse | null>(null);
  const [ai, setAi] = useState<AiSettingsDto | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [blacklistText, setBlacklistText] = useState("");
  const [blMsg, setBlMsg] = useState<string | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiKeyInput, setAiKeyInput] = useState("");
  const [aiCfgMsg, setAiCfgMsg] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<AiProvider>("custom");
  const [testResult, setTestResult] = useState<{ ok: boolean; ms?: number; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [ocr, setOcr] = useState<OcrSettingsDto | null>(null);
  const [ocrPrivacyOpen, setOcrPrivacyOpen] = useState(false);
  const [ocrMsg, setOcrMsg] = useState<string | null>(null);
  const [ocrPipe, setOcrPipe] = useState<OcrPipelineConfig | null>(null);
  const clientOs = useMemo(() => detectClientDesktopOs(), []);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [currentLang, setCurrentLang] = useState<SupportedLanguage>(
    () => (i18n.language === "zh-CN" ? "zh-CN" : "en"),
  );
  const [weekStartDay, setWeekStartDayState] = useState<number>(1);
  const [autostartEnabled, setAutostartEnabledState] = useState(false);

  const refreshFlags = useCallback(async () => {
    const [flags, aicfg, ocrcfg, wsd, autostart] = await Promise.all([
      api.getEngineFlags(),
      api.getAiSettings(),
      api.getOcrSettings(),
      api.getWeekStartDay(),
      api.getAutostartEnabled(),
    ]);
    setF(flags);
    setAi(aicfg);
    setOcr(ocrcfg);
    setOcrPipe(ocrcfg.pipeline);
    setAiBaseUrl(aicfg.baseUrl);
    setAiModel(aicfg.model);
    setActiveProvider(inferProvider(aicfg.baseUrl));
    setAiKeyInput("");
    setWeekStartDayState(wsd);
    setAutostartEnabledState(autostart.enabled);
  }, []);

  useEffect(() => {
    void api
      .getEngineFlags()
      .then(setF)
      .catch((e) => setErr(String(e)));
    void api
      .getAiSettings()
      .then((aicfg) => {
        setAi(aicfg);
        setAiBaseUrl(aicfg.baseUrl);
        setAiModel(aicfg.model);
        setActiveProvider(inferProvider(aicfg.baseUrl));
      })
      .catch(() => {});
    void api
      .getOcrSettings()
      .then((oc) => {
        setOcr(oc);
        setOcrPipe(oc.pipeline);
      })
      .catch(() => {});
    void api.getWeekStartDay().then(setWeekStartDayState).catch(() => {});
    void api.getAutostartEnabled().then((r) => setAutostartEnabledState(r.enabled)).catch(() => {});
  }, []);

  useEffect(() => {
    void api
      .getAppBlacklist()
      .then((apps) => setBlacklistText(apps.join("\n")))
      .catch(() => setBlacklistText(""));
  }, []);

  async function toggleEngine(name: string, enabled: boolean) {
    setErr(null);
    try {
      await api.setEngineEnabled(name, enabled);
      await refreshFlags();
    } catch (e) {
      setErr(String(e));
    }
  }

  async function toggleAi(enabled: boolean) {
    setErr(null);
    setAiCfgMsg(null);
    try {
      if (enabled) {
        const a = ai ?? (await api.getAiSettings());
        if (!a.privacyAcknowledged) {
          setPrivacyOpen(true);
          return;
        }
      }
      await api.setAiEnabled(enabled);
      await refreshFlags();
    } catch (e) {
      setErr(String(e));
    }
  }

  async function confirmPrivacyAndEnable() {
    setErr(null);
    setAiCfgMsg(null);
    try {
      await api.setAiPrivacyAcknowledged(true);
      await api.setAiEnabled(true);
      setPrivacyOpen(false);
      await refreshFlags();
    } catch (e) {
      setErr(String(e));
    }
  }

  async function saveAiByok() {
    setAiCfgMsg(null);
    setErr(null);
    try {
      const keyTrim = aiKeyInput.trim();
      await api.setAiSettings(
        aiBaseUrl.trim() || null,
        aiModel.trim() || null,
        keyTrim.length > 0 ? keyTrim : null,
      );
      setAiKeyInput("");
      await refreshFlags();
      setAiCfgMsg(t("settings.byokSaved"));
    } catch (e) {
      setErr(String(e));
    }
  }

  async function clearAiKey() {
    setErr(null);
    setAiCfgMsg(null);
    try {
      await api.setAiSettings(null, null, "");
      await refreshFlags();
      setAiCfgMsg(t("settings.keyCleared"));
    } catch (e) {
      setErr(String(e));
    }
  }

  async function selectProvider(p: AiProvider) {
    setActiveProvider(p);
    setTestResult(null);
    setAiCfgMsg(null);
    if (p !== "custom") {
      const preset = PROVIDER_PRESETS[p];
      setAiBaseUrl(preset.baseUrl);
      setAiModel(preset.model);
      try {
        await api.setAiSettings(preset.baseUrl, preset.model, null);
      } catch (e) {
        setErr(String(e));
      }
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.testAiConnection(aiBaseUrl, aiModel, aiKeyInput);
      setTestResult({ ok: res.ok, ms: res.latencyMs, error: res.error ?? undefined });
    } catch (e) {
      setTestResult({ ok: false, error: String(e) });
    } finally {
      setTesting(false);
    }
  }

  async function toggleOcrEnabled(next: boolean) {
    setErr(null);
    setOcrMsg(null);
    try {
      const o = ocr ?? (await api.getOcrSettings());
      if (next && !o.privacyAcknowledged) {
        setOcrPrivacyOpen(true);
        return;
      }
      const cfg = await api.setOcrSettings({ enabled: next });
      setOcr(cfg);
      setOcrPipe(cfg.pipeline);
    } catch (e) {
      setErr(String(e));
    }
  }

  async function confirmOcrPrivacyAndEnable() {
    setErr(null);
    try {
      await api.setOcrPrivacyAcknowledged(true);
      const cfg = await api.setOcrSettings({ enabled: true });
      setOcr(cfg);
      setOcrPipe(cfg.pipeline);
      setOcrPrivacyOpen(false);
      setOcrMsg(t("settings.ocrEnabled"));
    } catch (e) {
      setErr(String(e));
    }
  }

  async function saveBlacklist() {
    setBlMsg(null);
    setErr(null);
    try {
      const apps = blacklistText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      await api.setAppBlacklist(apps);
      setBlMsg(t("settings.blacklistSaved", { count: apps.length }));
    } catch (e) {
      setErr(String(e));
    }
  }

  if (!f || !ai || !ocr) {
    return <p className="p-4 text-[var(--tl-muted)]">{t("settings.loading")}</p>;
  }

  return (
    <div
      className={
        className ??
        "h-full overflow-auto p-4 text-[var(--tl-ink)]"
      }
    >
      {err && <p className="mb-3 text-sm text-[var(--tl-status-bad)]">{err}</p>}

      <section className="mb-6 rounded border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
        <h2 className="text-sm font-medium text-[var(--tl-muted)]">{t("settings.theme")}</h2>
        <p className="mt-1 text-xs text-[var(--tl-muted)]">
          {t("settings.themeDesc")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["tech", t("settings.themeTech")],
              ["white", t("settings.themeWhite")],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTheme(id)}
              className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                theme === id
                  ? "border-[var(--tl-accent-45)] bg-[var(--tl-accent-12)] text-[var(--tl-ink)]"
                  : "border-[var(--tl-line)] bg-[var(--tl-glass-20)] text-[var(--tl-muted)] hover:border-[var(--tl-accent-25)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
        <h2 className="text-sm font-medium text-[var(--tl-muted)]">{t("settings.language")}</h2>
        <p className="mt-1 text-xs text-[var(--tl-muted)]">
          {t("settings.languageDesc")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["zh-CN", t("settings.languageZh")],
              ["en", t("settings.languageEn")],
            ] as [SupportedLanguage, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setLanguage(id);
                setCurrentLang(id);
              }}
              className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                currentLang === id
                  ? "border-[var(--tl-accent-45)] bg-[var(--tl-accent-12)] text-[var(--tl-ink)]"
                  : "border-[var(--tl-line)] bg-[var(--tl-glass-20)] text-[var(--tl-muted)] hover:border-[var(--tl-accent-25)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
        <h2 className="text-sm font-medium text-[var(--tl-muted)]">{t("settings.weekStartDay")}</h2>
        <p className="mt-1 text-xs text-[var(--tl-muted)]">{t("settings.weekStartDayDesc")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {([1, 0] as const).map((day) => (
            <button
              key={day}
              type="button"
              onClick={async () => {
                setWeekStartDayState(day);
                await api.setWeekStartDay(day);
              }}
              className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                weekStartDay === day
                  ? "border-[var(--tl-accent-45)] bg-[var(--tl-accent-12)] text-[var(--tl-ink)]"
                  : "border-[var(--tl-line)] bg-[var(--tl-glass-20)] text-[var(--tl-muted)] hover:border-[var(--tl-accent-25)]"
              }`}
            >
              {day === 1 ? t("settings.weekStartMonday") : t("settings.weekStartSunday")}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
        <h2 className="text-sm font-medium text-[var(--tl-muted)]">{t("settings.autostart")}</h2>
        <p className="mt-1 text-xs text-[var(--tl-muted)]">{t("settings.autostartDesc")}</p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autostartEnabled}
            onChange={async (e) => {
              const next = e.target.checked;
              setAutostartEnabledState(next);
              try {
                await api.setAutostartEnabled(next);
              } catch (err) {
                setErr(String(err));
                setAutostartEnabledState(!next);
              }
            }}
          />
          {t("settings.autostartEnable")}
        </label>
      </section>

      <section className="mb-6 rounded border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
        <p className="mt-1 text-xs text-[var(--tl-muted)]">
          {t("settings.permissionsDesc")}
        </p>
        <div className="mt-3">
          <SystemPermissionPanel variant="both" />
        </div>
      </section>

      {ocrPrivacyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--tl-overlay)] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ocr-privacy-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg border border-[var(--tl-line)] bg-[var(--tl-modal-surface)] p-5 shadow-xl">
            <h2 id="ocr-privacy-title" className="mb-3 text-base font-semibold text-[var(--tl-ink)]">
              {t("settings.ocrConfirmTitle")}
            </h2>
            <div className="space-y-2 text-sm leading-relaxed text-[var(--tl-ink)]/90">
              <p>{t("settings.ocrConfirmDesc1")}</p>
              <p>{t("settings.ocrConfirmDesc2")}</p>
              <p>{t("settings.ocrConfirmDesc3")}</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded bg-[var(--tl-btn-primary-bg)] px-3 py-1.5 text-sm text-[var(--tl-btn-primary-text)] hover:bg-[var(--tl-btn-primary-bg-hover)]"
                onClick={() => void confirmOcrPrivacyAndEnable()}
              >
                {t("settings.agreedAndRead")}
              </button>
              <button
                type="button"
                className="rounded border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)]"
                onClick={() => setOcrPrivacyOpen(false)}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {privacyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--tl-overlay)] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="privacy-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg border border-[var(--tl-line)] bg-[var(--tl-modal-surface)] p-5 shadow-xl">
            <h2 id="privacy-title" className="mb-3 text-base font-semibold text-[var(--tl-ink)]">
              {t("settings.aiConfirmTitle")}
            </h2>
            <div className="space-y-2 text-sm leading-relaxed text-[var(--tl-ink)]/90">
              <p>{t("settings.aiConfirmDesc1")}</p>
              <p>{t("settings.aiConfirmDesc2")}</p>
              <p>{t("settings.aiConfirmDesc3")}</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded bg-[var(--tl-btn-primary-bg)] px-3 py-1.5 text-sm text-[var(--tl-btn-primary-text)] hover:bg-[var(--tl-btn-primary-bg-hover)]"
                onClick={() => void confirmPrivacyAndEnable()}
              >
                {t("settings.agreedAndRead")}
              </button>
              <button
                type="button"
                className="rounded border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)]"
                onClick={() => setPrivacyOpen(false)}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="mb-6 space-y-3">
        <h2 className="text-sm font-medium text-[var(--tl-muted)]">{t("settings.engines")}</h2>
        {(
          [
            ["input", t("settings.engineInput"), f.engineInput],
            ["clipboard", t("settings.engineClipboard"), f.engineClipboard],
            ["notifications", t("settings.engineNotifications"), f.engineNotifications],
            ["ambient", t("settings.engineAmbient"), f.engineAmbient],
          ] as const
        ).map(([id, label, on]) => (
          <label key={id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={on}
              onChange={(e) => void toggleEngine(id, e.target.checked)}
            />
            {label}
          </label>
        ))}
      </section>

      <section className="mb-6 space-y-3 rounded border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
        <h2 className="text-sm font-medium text-[var(--tl-muted)]">{t("settings.ocrSection")}</h2>
        <p className="text-xs text-[var(--tl-muted)]">{ocrDependencySummary(clientOs)}</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ocr.enabled}
            onChange={(e) => void toggleOcrEnabled(e.target.checked)}
          />
          {t("settings.enableOcr")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ocr.showSessionSummary}
            onChange={(e) =>
              void api
                .setOcrSettings({ showSessionSummary: e.target.checked })
                .then((cfg) => {
                  setOcr(cfg);
                  setOcrPipe(cfg.pipeline);
                })
                .catch((err) => setErr(String(err)))
            }
          />
          {t("settings.showOcrSummary")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ocr.allowExportToAi}
            onChange={(e) =>
              void api
                .setOcrSettings({ allowExportToAi: e.target.checked })
                .then((cfg) => {
                  setOcr(cfg);
                  setOcrPipe(cfg.pipeline);
                })
                .catch((err) => setErr(String(err)))
            }
          />
          {t("settings.exportOcrToAi")}
        </label>

        {ocrPipe && (
          <details className="mt-3 rounded border border-[var(--tl-line)] bg-[var(--tl-surface-deep)] p-3">
            <summary className="cursor-pointer text-xs text-[var(--tl-muted)]">
              {t("settings.ocrPipelineParams")}
            </summary>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--tl-muted)]">
              {ocrPipelineDetailsIntro(clientOs)} {t("settings.cjkConcatNote")}
            </p>
            <div className="mt-3 grid max-w-xl gap-3 text-xs">
              <label className="grid gap-1">
                <span className="text-[var(--tl-muted)]">{ocrLanguagesFieldCaption(clientOs)}</span>
                <p className="text-[11px] leading-relaxed text-[var(--tl-muted)]">
                  {ocrLanguagesFieldHint(clientOs)}
                </p>
                <input
                  className="rounded border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-2 py-1 font-mono text-[var(--tl-ink)]"
                  value={ocrPipe.languages}
                  onChange={(e) =>
                    setOcrPipe({ ...ocrPipe, languages: e.target.value })
                  }
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[var(--tl-muted)]">{ocrPsmFieldCaption(clientOs)}</span>
                <p className="text-[11px] leading-relaxed text-[var(--tl-muted)]">
                  {ocrPsmFieldHint(clientOs)}
                </p>
                <input
                  type="number"
                  min={0}
                  max={13}
                  className="rounded border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-2 py-1 font-mono text-[var(--tl-ink)]"
                  value={ocrPipe.psm}
                  onChange={(e) =>
                    setOcrPipe({
                      ...ocrPipe,
                      psm: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[var(--tl-muted)]">{t("settings.wordConfMin")}</span>
                <p className="text-[11px] leading-relaxed text-[var(--tl-muted)]">
                  {t("settings.wordConfMinDesc")}
                </p>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  className="rounded border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-2 py-1 font-mono text-[var(--tl-ink)]"
                  value={ocrPipe.wordConfMin}
                  onChange={(e) =>
                    setOcrPipe({
                      ...ocrPipe,
                      wordConfMin: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[var(--tl-muted)]">{t("settings.lineConfMin")}</span>
                <p className="text-[11px] leading-relaxed text-[var(--tl-muted)]">
                  {t("settings.lineConfMinDesc")}
                </p>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  className="rounded border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-2 py-1 font-mono text-[var(--tl-ink)]"
                  value={ocrPipe.lineConfMin}
                  onChange={(e) =>
                    setOcrPipe({
                      ...ocrPipe,
                      lineConfMin: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <label className="grid gap-1">
                <span className="flex items-center gap-2 text-[var(--tl-muted)]">
                  <input
                    type="checkbox"
                    className="shrink-0"
                    checked={ocrPipe.preprocessScale}
                    onChange={(e) =>
                      setOcrPipe({
                        ...ocrPipe,
                        preprocessScale: e.target.checked,
                      })
                    }
                  />
                  {t("settings.preprocessScale")}
                </span>
                <p className="text-[11px] leading-relaxed text-[var(--tl-muted)]">
                  {t("settings.preprocessScaleDesc")}
                </p>
              </label>
              <label className="grid gap-1">
                <span className="flex items-center gap-2 text-[var(--tl-muted)]">
                  <input
                    type="checkbox"
                    className="shrink-0"
                    checked={ocrPipe.preprocessDarkInvert}
                    onChange={(e) =>
                      setOcrPipe({
                        ...ocrPipe,
                        preprocessDarkInvert: e.target.checked,
                      })
                    }
                  />
                  {t("settings.preprocessInvert")}
                </span>
                <p className="text-[11px] leading-relaxed text-[var(--tl-muted)]">
                  {t("settings.preprocessInvertDesc")}
                </p>
              </label>
              <button
                type="button"
                className="mt-1 w-fit rounded bg-[var(--tl-btn-muted)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:opacity-90"
                onClick={() =>
                  void api
                    .setOcrSettings({
                      ocrLanguages: ocrPipe.languages,
                      ocrPsm: ocrPipe.psm,
                      ocrWordConfMin: ocrPipe.wordConfMin,
                      ocrLineConfMin: ocrPipe.lineConfMin,
                      ocrPreprocessScale: ocrPipe.preprocessScale,
                      ocrPreprocessDarkInvert: ocrPipe.preprocessDarkInvert,
                    })
                    .then((cfg) => {
                      setOcr(cfg);
                      setOcrPipe(cfg.pipeline);
                      setOcrMsg(t("settings.pipelineParamsSaved"));
                      setTimeout(() => setOcrMsg(null), 2500);
                    })
                    .catch((err) => setErr(String(err)))
                }
              >
                {t("settings.savePipelineParams")}
              </button>
            </div>
          </details>
        )}
        {ocrMsg && <p className="text-xs text-[var(--tl-status-ok)]">{ocrMsg}</p>}
      </section>

      <section className="mb-6 space-y-2">
        <h2 className="text-sm font-medium text-[var(--tl-muted)]">{t("settings.blacklist")}</h2>
        <p className="text-xs text-[var(--tl-muted)]">
          {t("settings.blacklistDesc")}
          {clientOs === "windows" ? (
            <span className="mt-1 block text-[var(--tl-muted)]">
              {t("settings.blacklistWindowsNote")}
            </span>
          ) : null}
        </p>
        <textarea
          value={blacklistText}
          onChange={(e) => setBlacklistText(e.target.value)}
          rows={5}
          className="w-full max-w-md rounded border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-2 py-1.5 font-mono text-xs text-[var(--tl-ink)]"
          placeholder={t("settings.blacklistPlaceholder")}
        />
        <button
          type="button"
          className="rounded bg-[var(--tl-btn-muted)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:opacity-90"
          onClick={() => void saveBlacklist()}
        >
          {t("settings.saveBlacklist")}
        </button>
        {blMsg && <p className="text-xs text-[var(--tl-status-ok)]">{blMsg}</p>}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-[var(--tl-muted)]">{t("settings.aiSection")}</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={f.aiEnabled}
            onChange={(e) => void toggleAi(e.target.checked)}
          />
          {t("settings.enableAi")}
        </label>
        <p className="text-xs text-[var(--tl-muted)]">
          {t("settings.aiDesc")}
        </p>

        <p className="text-xs font-medium text-[var(--tl-muted)]">{t("settings.aiProviderLabel")}</p>
        <div className="max-w-md space-y-2">
          {(["claude", "deepseek", "qwen", "custom"] as AiProvider[]).map((p) => {
            const isActive = activeProvider === p;
            const descKey = `settings.aiProvider${p.charAt(0).toUpperCase() + p.slice(1)}Desc` as const;
            const labelMap: Record<AiProvider, string> = {
              claude: "Claude",
              deepseek: "DeepSeek",
              qwen: "Qwen",
              custom: t("settings.aiProviderCustom"),
            };
            const label = labelMap[p];
            return (
              <div
                key={p}
                className={`rounded border px-3 py-2 cursor-pointer transition-colors ${
                  isActive
                    ? "border-[var(--tl-accent)] bg-[var(--tl-surface)]"
                    : "border-[var(--tl-line)] bg-[var(--tl-surface)] hover:border-[var(--tl-accent)]/50"
                }`}
                onClick={() => void selectProvider(p)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-[var(--tl-ink)]">{label}</span>
                    <span className="ml-2 text-xs text-[var(--tl-muted)]">{t(descKey)}</span>
                  </div>
                  <div className={`h-3 w-3 rounded-full border-2 flex-shrink-0 ${
                    isActive ? "border-[var(--tl-accent)] bg-[var(--tl-accent)]" : "border-[var(--tl-muted)]"
                  }`} />
                </div>

                {isActive && (
                  <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                    {/* hint + guide link */}
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-[var(--tl-muted)] leading-relaxed">
                        {t(`settings.aiProvider${p.charAt(0).toUpperCase() + p.slice(1)}Hint`)}
                      </p>
                      {PROVIDER_GUIDE_URLS[p] && (
                        <button
                          type="button"
                          className="flex-shrink-0 text-xs text-[var(--tl-accent)] hover:underline"
                          onClick={() => void api.openUrl(PROVIDER_GUIDE_URLS[p]!)}
                        >
                          {t(`settings.aiProvider${p.charAt(0).toUpperCase() + p.slice(1)}Guide`)}
                        </button>
                      )}
                    </div>
                    <label className="block text-xs text-[var(--tl-muted)]">
                      Base URL
                      <input
                        type="text"
                        value={aiBaseUrl}
                        readOnly={p !== "custom"}
                        onChange={(e) => setAiBaseUrl(e.target.value)}
                        className={`mt-1 w-full rounded border border-[var(--tl-line)] px-2 py-1 font-mono text-sm text-[var(--tl-ink)] ${
                          p !== "custom"
                            ? "bg-[var(--tl-surface-deep)] opacity-60 cursor-default"
                            : "bg-[var(--tl-surface-deep)]"
                        }`}
                        placeholder="https://api.openai.com/v1"
                      />
                    </label>
                    <label className="block text-xs text-[var(--tl-muted)]">
                      {t("settings.modelName")}
                      <input
                        type="text"
                        value={aiModel}
                        readOnly={p !== "custom"}
                        onChange={(e) => setAiModel(e.target.value)}
                        className={`mt-1 w-full rounded border border-[var(--tl-line)] px-2 py-1 font-mono text-sm text-[var(--tl-ink)] ${
                          p !== "custom"
                            ? "bg-[var(--tl-surface-deep)] opacity-60 cursor-default"
                            : "bg-[var(--tl-surface-deep)]"
                        }`}
                        placeholder="gpt-4o-mini"
                      />
                    </label>
                    <label className="block text-xs text-[var(--tl-muted)]">
                      {t("settings.apiKey", { status: ai?.hasApiKey ? t("settings.apiKeyConfigured") : t("settings.apiKeyNotConfigured") })}
                      <input
                        type="password"
                        autoComplete="off"
                        value={aiKeyInput}
                        onChange={(e) => setAiKeyInput(e.target.value)}
                        className="mt-1 w-full rounded border border-[var(--tl-line)] bg-[var(--tl-surface-deep)] px-2 py-1 font-mono text-sm text-[var(--tl-ink)]"
                        placeholder={t("settings.apiKeyPlaceholder")}
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        className="rounded bg-[var(--tl-btn-muted)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:opacity-90"
                        onClick={() => void saveAiByok()}
                      >
                        {t("settings.saveByok")}
                      </button>
                      {ai?.hasApiKey && (
                        <button
                          type="button"
                          className="rounded border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-ink)]/90 hover:bg-[var(--tl-surface-deep)]"
                          onClick={() => void clearAiKey()}
                        >
                          {t("settings.clearKey")}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={testing}
                        className="rounded border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-ink)]/90 hover:bg-[var(--tl-surface-deep)] disabled:opacity-50"
                        onClick={() => void handleTestConnection()}
                      >
                        {testing ? t("settings.testConnecting") : t("settings.testConnection")}
                      </button>
                    </div>
                    {testResult && (
                      <p className={`text-xs ${testResult.ok ? "text-[var(--tl-status-ok)]" : "text-[var(--tl-status-err,#e05)]"}`}>
                        {testResult.ok
                          ? t("settings.testSuccess", { ms: testResult.ms })
                          : t("settings.testFailed", { error: testResult.error })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {aiCfgMsg && <p className="text-xs text-[var(--tl-status-ok)]">{aiCfgMsg}</p>}
      </section>
    </div>
  );
}
