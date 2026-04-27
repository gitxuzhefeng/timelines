import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { DailyAnalysisDto } from "../types";
import { localeDateLabel } from "../lib/phase3Format";
import { buildLensViewModel } from "../lib/lensViewModel";
import * as api from "../services/tauri";
import { useAiTaskStore } from "../stores/aiTaskStore";
import { useAppStore } from "../stores/appStore";
import { TodayLensHero } from "../components/lens/TodayLensHero";

export default function TodayLensPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const date = useAppStore((s) => s.date);
  const activity = useAppStore((s) => s.activity);
  const [analysis, setAnalysis] = useState<DailyAnalysisDto | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const startAiTask = useAiTaskStore((s) => s.start);
  const finishAiTask = useAiTaskStore((s) => s.finish);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const a = await api.getDailyAnalysis(date);
      setAnalysis(a);
    } catch (e) {
      setErr(String(e));
      setAnalysis(null);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const vm = useMemo(
    () => buildLensViewModel(analysis ?? null, localeDateLabel(date, i18n.language)),
    [analysis, date, i18n.language],
  );

  const loading = analysis === undefined;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-[var(--tl-muted)]">
        {t("todayLens.loading")}
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="h-full overflow-y-auto p-5">
        <div className="mx-auto max-w-lg rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-8 text-center">
          <div className="mb-3 text-3xl opacity-80">📭</div>
          <h2 className="text-lg font-semibold text-[var(--tl-ink)]">{t("todayLens.noLens")}</h2>
          <p className="mt-2 text-sm text-[var(--tl-muted)]">
            {t("todayLens.noAnalysis")}
          </p>
          {activity && (
            <p className="mt-2 text-xs text-[var(--tl-muted)]">
              {t("todayLens.dailyRecords", {
                sessionCount: activity.sessionCount,
                snapshotCount: activity.snapshotCount,
              })}
            </p>
          )}
          {err && <p className="mt-3 text-sm text-[var(--tl-status-bad)]">{err}</p>}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              disabled={busy}
              className="tl-interactive-row rounded-lg bg-[var(--tl-accent-15)] px-4 py-2 text-sm font-medium text-[var(--tl-cyan)] ring-1 ring-[var(--tl-line)] hover:bg-[var(--tl-accent-22)] disabled:opacity-40"
              onClick={() => {
                const taskId = `daily-analysis:${date}`;
                setBusy(true);
                setErr(t("common.aiRunning"));
                startAiTask(taskId, "common.aiTaskDailyAnalysis");
                void (async () => {
                  try {
                    await api.generateDailyAnalysis(date);
                    await api.generateDailyReport(date, false);
                    await load();
                    setErr(null);
                  } catch (e) {
                    setErr(String(e));
                  } finally {
                    finishAiTask(taskId);
                    setBusy(false);
                  }
                })();
              }}
            >
              {busy ? t("todayLens.generating") : t("todayLens.generateAnalysis")}
            </button>
            <Link
              to="/settings"
              className="rounded-lg border border-[var(--tl-line)] px-4 py-2 text-sm text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"
            >
              {t("todayLens.openSettings")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-5">
      <TodayLensHero
        vm={vm}
        onTimeline={() => navigate("/timeline")}
        onReport={() => navigate("/report")}
      />
    </div>
  );
}
