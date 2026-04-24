import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RecapContent } from "../components/RecapContent";
import { DailyChartView } from "../components/DailyChartView";
import type { DailyAnalysisDto } from "../types";
import * as api from "../services/tauri";
import { useAppStore } from "../stores/appStore";
import { InlineAskButton } from "../components/assistant/InlineAskButton";

type ViewMode = "chart" | "text";

export default function DailyReportPage() {
  const { t } = useTranslation();
  const date = useAppStore((s) => s.date);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { const v = localStorage.getItem("timelens_view_daily"); if (v === "chart" || v === "text") return v; } catch {}
    return "chart";
  });
  const [analysis, setAnalysis] = useState<DailyAnalysisDto | null>(null);

  useEffect(() => {
    api.getDailyAnalysis(date).then(setAnalysis).catch(() => setAnalysis(null));
  }, [date]);

  return (
    <div className="h-full min-h-0 flex flex-col p-5">
      <div className="mb-4 flex items-center gap-3">
        <InlineAskButton contextType="daily" date={date} />
        <div className="flex rounded-lg border border-[var(--tl-line)] bg-[var(--tl-input-fill)] p-0.5">
          <button
            type="button"
            className={`rounded px-2.5 py-1 text-[0.65rem] transition-colors ${viewMode === "chart" ? "bg-[var(--tl-accent-12)] text-[var(--tl-ink)]" : "text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"}`}
            onClick={() => { setViewMode("chart"); localStorage.setItem("timelens_view_daily", "chart"); }}
          >
            {t("daily.chartView")}
          </button>
          <button
            type="button"
            className={`rounded px-2.5 py-1 text-[0.65rem] transition-colors ${viewMode === "text" ? "bg-[var(--tl-accent-12)] text-[var(--tl-ink)]" : "text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"}`}
            onClick={() => { setViewMode("text"); localStorage.setItem("timelens_view_daily", "text"); }}
          >
            {t("daily.textView")}
          </button>
        </div>
      </div>
      {viewMode === "chart" ? (
        analysis ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <DailyChartView analysis={analysis} />
          </div>
        ) : (
          <p className="text-sm text-[var(--tl-muted)]">{t("daily.chart.noData")}</p>
        )
      ) : (
        <RecapContent hideDateControl className="h-full min-h-0" />
      )}
    </div>
  );
}
