import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/appStore";
import * as api from "../services/tauri";
import { ExportPanel } from "./ExportPanel";

type ReportView = "fact_only" | "ai_enhanced";

type RecapContentProps = {
  hideDateControl?: boolean;
  className?: string;
};

export function RecapContent({
  hideDateControl = false,
  className = "",
}: RecapContentProps) {
  const { t } = useTranslation();
  const date = useAppStore((s) => s.date);
  const setDate = useAppStore((s) => s.setDate);
  const [md, setMd] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [view, setView] = useState<ReportView>("fact_only");
  const [aiOn, setAiOn] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [hasAiReport, setHasAiReport] = useState(false);
  const [showExport, setShowExport] = useState(false);
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
            {t("recap.date")}
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
              {t("recap.fact")}
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
              {t("recap.aiEnhanced")}
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
              setMsg(t("recap.reportGenerated"));
            } catch (e) {
              setMsg(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? t("recap.processing") : t("recap.generateReport")}
        </button>
        <button
          type="button"
          disabled={busy || !aiOn || !hasKey}
          title={
            !aiOn
              ? t("recap.enableAiFirst")
              : !hasKey
                ? t("recap.configureApiKey")
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
              setMsg(t("recap.aiReportGenerated"));
            } catch (e) {
              setMsg(t("recap.errorFallback", { error: String(e) }));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("recap.generateAiReport")}
        </button>
        <button
          type="button"
          disabled={busy || !md}
          className="rounded border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)] disabled:opacity-40"
          onClick={() => setShowExport(true)}
        >
          {t("recap.export")}
        </button>
        <button
          type="button"
          className="rounded border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)]"
          onClick={() => void load()}
        >
          {t("common.refresh")}
        </button>
      </div>
      {view === "ai_enhanced" && meta.model && (
        <p className="text-xs text-[var(--tl-muted)]">
          {t("recap.model", { model: meta.model })}
          {meta.hash && (
            <>
              {" "}
              · {t("recap.promptHash", { hash: meta.hash.slice(0, 12) })}
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
              ? t("recap.noAiReport")
              : t("recap.noReport")}
          </p>
        )}
      </div>
      {showExport && (
        <ExportPanel
          date={date}
          reportView={view}
          hasReport={Boolean(md)}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
