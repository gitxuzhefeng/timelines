import { useCallback, useEffect, useState } from "react";
import type { AiSettingsDto, EngineFlagsResponse } from "../types";
import * as api from "../services/tauri";

export default function SettingsPage() {
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

  const refreshFlags = useCallback(async () => {
    const [flags, aicfg] = await Promise.all([
      api.getEngineFlags(),
      api.getAiSettings(),
    ]);
    setF(flags);
    setAi(aicfg);
    setAiBaseUrl(aicfg.baseUrl);
    setAiModel(aicfg.model);
    setAiKeyInput("");
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
      })
      .catch(() => {});
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
      setAiCfgMsg("已保存（API Key 仅在本机 settings 表，请妥善保管设备）");
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
      setAiCfgMsg("已清除 API Key");
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
      setBlMsg(`已保存 ${apps.length} 条；采集线程将立即按黑名单过滤。`);
    } catch (e) {
      setErr(String(e));
    }
  }

  if (!f || !ai) {
    return <p className="p-4 text-zinc-400">加载设置…</p>;
  }

  return (
    <div className="h-full overflow-auto p-4 text-zinc-100">
      <h1 className="mb-4 text-lg font-semibold text-white">设置</h1>
      {err && <p className="mb-3 text-sm text-rose-300">{err}</p>}

      {privacyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="privacy-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-xl">
            <h2 id="privacy-title" className="mb-3 text-base font-semibold text-white">
              开启 AI 增强前请确认
            </h2>
            <div className="space-y-2 text-sm leading-relaxed text-zinc-300">
              <p>
                启用后，你可在本地将当日的{" "}
                <strong className="text-zinc-200">daily_analysis 聚合 JSON</strong>{" "}
                发送到你自行配置的模型端点（BYOK），用于生成解读文字。
              </p>
              <p>
                <strong className="text-zinc-200">不会</strong>上传：raw_events 全表、窗口标题原文、剪贴板正文、按键序列等明细。
              </p>
              <p>
                出境内容限于聚合指标与应用名、Intent 名等 PRD 允许字段；请自行评估模型服务商与合规要求。
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded bg-emerald-700 px-3 py-1.5 text-sm hover:bg-emerald-600"
                onClick={() => void confirmPrivacyAndEnable()}
              >
                已阅读并同意
              </button>
              <button
                type="button"
                className="rounded border border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-800"
                onClick={() => setPrivacyOpen(false)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="mb-6 space-y-3">
        <h2 className="text-sm font-medium text-zinc-400">采集引擎</h2>
        {(
          [
            ["input", "输入采样", f.engineInput],
            ["clipboard", "剪贴板", f.engineClipboard],
            ["notifications", "通知启发式", f.engineNotifications],
            ["ambient", "环境上下文", f.engineAmbient],
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

      <section className="mb-6 space-y-2">
        <h2 className="text-sm font-medium text-zinc-400">应用黑名单（M5 / M4-05）</h2>
        <p className="text-xs text-zinc-500">
          每行一个前台应用名（与系统前台 `app_name` **精确匹配**，大小写敏感）。命中时：不写 raw / 切换 / Session / 截图；剪贴板流水也不会在黑名单前台落库。
        </p>
        <textarea
          value={blacklistText}
          onChange={(e) => setBlacklistText(e.target.value)}
          rows={5}
          className="w-full max-w-md rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200"
          placeholder={"WeChat\nChrome"}
        />
        <button
          type="button"
          className="rounded bg-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-600"
          onClick={() => void saveBlacklist()}
        >
          保存黑名单
        </button>
        {blMsg && <p className="text-xs text-emerald-400">{blMsg}</p>}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-400">AI 增强（BYOK，默认关闭）</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={f.aiEnabled}
            onChange={(e) => void toggleAi(e.target.checked)}
          />
          启用 AI 增强复盘
        </label>
        <p className="text-xs text-zinc-500">
          关闭时不发起外网请求。开启后须在下方配置 API Key；仅 OpenAI 兼容 <code className="text-zinc-400">/v1/chat/completions</code>{" "}
          端点。
        </p>

        <div className="max-w-md space-y-2 rounded border border-zinc-800 bg-zinc-900/50 p-3">
          <label className="block text-xs text-zinc-400">
            Base URL
            <input
              type="text"
              value={aiBaseUrl}
              onChange={(e) => setAiBaseUrl(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-sm text-zinc-200"
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            模型名
            <input
              type="text"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-sm text-zinc-200"
              placeholder="gpt-4o-mini"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            API Key（{ai.hasApiKey ? "已配置，留空则不修改" : "未配置"}）
            <input
              type="password"
              autoComplete="off"
              value={aiKeyInput}
              onChange={(e) => setAiKeyInput(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-sm text-zinc-200"
              placeholder="sk-…"
            />
          </label>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              className="rounded bg-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-600"
              onClick={() => void saveAiByok()}
            >
              保存 BYOK 配置
            </button>
            {ai.hasApiKey && (
              <button
                type="button"
                className="rounded border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
                onClick={() => void clearAiKey()}
              >
                清除 Key
              </button>
            )}
          </div>
        </div>
        {aiCfgMsg && <p className="text-xs text-emerald-400">{aiCfgMsg}</p>}
      </section>
    </div>
  );
}
