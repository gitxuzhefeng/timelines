import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useAppStore } from "../stores/appStore";
import * as api from "../services/tauri";

type ReportView = "fact_only" | "ai_enhanced";

type RecapContentProps = {
  /** 为 true 时不渲染日期选择（由外壳统一提供） */
  hideDateControl?: boolean;
  className?: string;
};

export function RecapContent({
  hideDateControl = false,
  className = "",
}: RecapContentProps) {
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
    <div className={`flex h-full min-h-0 flex-col gap-3 text-[var(--tl-ink)] ${className}`}>
      <div className="flex flex-wrap items-center gap-3">
        {!hideDateControl && (
          <label className="flex items-center gap-2 text-sm text-[var(--tl-muted)]">
            日期
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-2 py-1 text-[var(--tl-ink)]"
            />
          </label>
        )}
        {showAiToggle && (
          <div className="flex rounded border border-[var(--tl-line)] p-0.5 text-xs">
            <button
              type="button"
              className={`rounded px-2 py-1 ${
                view === "fact_only"
                  ? "bg-[var(--tl-btn-muted)] text-[var(--tl-ink)]"
                  : "text-[var(--tl-muted)]"
              }`}
              onClick={() => setView("fact_only")}
            >
              事实
            </button>
            <button
              type="button"
              className={`rounded px-2 py-1 ${
                view === "ai_enhanced"
                  ? "bg-[var(--tl-btn-muted)] text-[var(--tl-ink)]"
                  : "text-[var(--tl-muted)]"
              }`}
              onClick={() => setView("ai_enhanced")}
            >
              AI 增强
            </button>
          </div>
        )}
        <button
          type="button"
          disabled={busy}
          className="rounded bg-[var(--tl-btn-muted)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:opacity-90 disabled:opacity-40"
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
          className="rounded bg-[var(--tl-btn-primary-bg)] px-3 py-1.5 text-sm text-[var(--tl-btn-primary-text)] hover:bg-[var(--tl-btn-primary-bg-hover)] disabled:opacity-40"
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
          className="rounded border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)] disabled:opacity-40"
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
          className="rounded border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)]"
          onClick={() => void load()}
        >
          刷新
        </button>
      </div>
      {view === "ai_enhanced" && meta.model && (
        <p className="text-xs text-[var(--tl-muted)]">
          模型: <span className="font-mono">{meta.model}</span>
          {meta.hash && (
            <>
              {" "}
              · prompt 哈希:{" "}
              <span className="font-mono">{meta.hash.slice(0, 12)}…</span>
            </>
          )}
        </p>
      )}
      {msg && <p className="text-sm text-[var(--tl-warn-amber-text)]">{msg}</p>}
      <div className="min-h-0 flex-1 overflow-auto rounded border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4 text-sm leading-relaxed text-[var(--tl-ink)]/95 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-medium [&_code]:rounded [&_code]:bg-[var(--tl-surface-deep)] [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-[var(--tl-pre-bg)] [&_pre]:p-3">
        {md ? (
          <ReactMarkdown>{md}</ReactMarkdown>
        ) : (
          <p className="text-[var(--tl-muted)]">
            {view === "ai_enhanced"
              ? "暂无 AI 增强报告。请先生成当日 daily_analysis，再点击「生成 AI 增强报告」。"
              : "暂无报告。请选择有数据的日期并点击生成。"}
          </p>
        )}
      </div>
    </div>
  );
}
