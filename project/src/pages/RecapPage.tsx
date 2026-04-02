import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useAppStore } from "../stores/appStore";
import * as api from "../services/tauri";

type ReportView = "fact_only" | "ai_enhanced";

export default function RecapPage() {
  const date = useAppStore((s) => s.date);
  const setDate = useAppStore((s) => s.setDate);
  const [md, setMd] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [view, setView] = useState<ReportView>("fact_only");
  const [aiOn, setAiOn] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [hasAiReport, setHasAiReport] = useState(false);
  const [meta, setMeta] = useState<{ model: string | null; hash: string | null }>(
    { model: null, hash: null },
  );

  const load = useCallback(async () => {
    setMsg(null);
    try {
      const r = await api.getDailyReport(date, view);
      setMd(r?.contentMd ?? "");
      setMeta({
        model: r?.aiModel ?? null,
        hash: r?.aiPromptHash ?? null,
      });
      const aiR = await api.getDailyReport(date, "ai_enhanced");
      setHasAiReport(Boolean(aiR?.contentMd?.length));
    } catch (e) {
      setMsg(String(e));
    }
  }, [date, view]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const [f, a] = await Promise.all([
          api.getEngineFlags(),
          api.getAiSettings(),
        ]);
        setAiOn(f.aiEnabled);
        setHasKey(a.hasApiKey);
      } catch {
        setAiOn(false);
        setHasKey(false);
      }
    })();
  }, []);

  const showAiToggle = aiOn || hasAiReport;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4 text-zinc-100">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-white">复盘</h1>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          日期
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
          />
        </label>
        {showAiToggle && (
          <div className="flex rounded border border-zinc-700 p-0.5 text-xs">
            <button
              type="button"
              className={`rounded px-2 py-1 ${view === "fact_only" ? "bg-zinc-700 text-white" : "text-zinc-400"}`}
              onClick={() => setView("fact_only")}
            >
              事实
            </button>
            <button
              type="button"
              className={`rounded px-2 py-1 ${view === "ai_enhanced" ? "bg-zinc-700 text-white" : "text-zinc-400"}`}
              onClick={() => setView("ai_enhanced")}
            >
              AI 增强
            </button>
          </div>
        )}
        <button
          type="button"
          disabled={busy}
          className="rounded bg-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-600 disabled:opacity-40"
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              await api.generateDailyAnalysis(date);
              await api.generateDailyReport(date, false);
              setView("fact_only");
              await load();
              setMsg("已生成分析与事实报告");
            } catch (e) {
              setMsg(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "处理中…" : "生成分析 + 事实报告"}
        </button>
        <button
          type="button"
          disabled={busy || !aiOn || !hasKey}
          title={
            !aiOn
              ? "请先在设置中开启 AI"
              : !hasKey
                ? "请先在设置中配置 API Key"
                : undefined
          }
          className="rounded bg-emerald-900/80 px-3 py-1.5 text-sm text-emerald-100 hover:bg-emerald-800/80 disabled:opacity-40"
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              await api.generateDailyAnalysis(date);
              await api.generateDailyReport(date, true);
              setView("ai_enhanced");
              await load();
              setMsg("已生成 AI 增强报告（含事实层 + 解读）");
            } catch (e) {
              setMsg(
                `${String(e)}。可改用「生成分析 + 事实报告」仅生成本地事实层。`,
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          生成 AI 增强报告
        </button>
        <button
          type="button"
          disabled={busy || !md}
          className="rounded border border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-40"
          onClick={async () => {
            setBusy(true);
            try {
              const p = await api.exportDailyReport(date, view);
              setMsg(`已导出: ${p}`);
            } catch (e) {
              setMsg(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          导出 Markdown
        </button>
        <button
          type="button"
          className="rounded border border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-800"
          onClick={() => void load()}
        >
          刷新
        </button>
      </div>
      {view === "ai_enhanced" && meta.model && (
        <p className="text-xs text-zinc-500">
          模型: <span className="font-mono text-zinc-400">{meta.model}</span>
          {meta.hash && (
            <>
              {" "}
              · prompt 哈希:{" "}
              <span className="font-mono text-zinc-500">{meta.hash.slice(0, 12)}…</span>
            </>
          )}
        </p>
      )}
      {msg && <p className="text-sm text-amber-200/90">{msg}</p>}
      <div className="min-h-0 flex-1 overflow-auto rounded border border-zinc-800 bg-zinc-900/40 p-4 text-sm leading-relaxed text-zinc-200 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-medium [&_code]:rounded [&_code]:bg-zinc-800 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-zinc-950 [&_pre]:p-3">
        {md ? (
          <ReactMarkdown>{md}</ReactMarkdown>
        ) : (
          <p className="text-zinc-500">
            {view === "ai_enhanced"
              ? "暂无 AI 增强报告。请先生成当日 daily_analysis，再点击「生成 AI 增强报告」。"
              : "暂无报告。请选择有数据的日期并点击生成。"}
          </p>
        )}
      </div>
    </div>
  );
}
