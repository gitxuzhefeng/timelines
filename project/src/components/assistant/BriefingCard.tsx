import { useTranslation } from "react-i18next";
import type { BriefingDto } from "../../services/tauri";

interface Props {
  briefing: BriefingDto;
  onQuestionSelect: (question: string) => void;
}

export function BriefingCard({ briefing, onQuestionSelect }: Props) {
  const { t } = useTranslation();

  if (!briefing.hasData) return null;

  const highlight = briefing.highlightKey
    ? t(briefing.highlightKey, briefing.highlightParams ?? {})
    : null;

  return (
    <div className="rounded-lg border border-[var(--tl-cyan-dim)] bg-[var(--tl-surface)] px-4 py-3">
      <div className="font-mono text-[0.6rem] font-semibold uppercase tracking-widest text-[var(--tl-cyan)]">
        {t("assistant.briefing.title")}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {briefing.totalActiveMinutes != null && (
          <span className="text-[var(--tl-ink)]">
            <span className="text-[var(--tl-muted)]">{t("daily.chart.totalTime")}</span>{" "}
            {Math.round(briefing.totalActiveMinutes)}m
          </span>
        )}
        {briefing.flowScore != null && (
          <span className="text-[var(--tl-ink)]">
            <span className="text-[var(--tl-muted)]">{t("daily.chart.flowScore")}</span>{" "}
            {Math.round(briefing.flowScore)}
          </span>
        )}
        {briefing.fragmentationPct != null && (
          <span className="text-[var(--tl-ink)]">
            <span className="text-[var(--tl-muted)]">{t("daily.chart.fragmentation")}</span>{" "}
            {Math.round(briefing.fragmentationPct)}%
          </span>
        )}
        {briefing.deepWorkMinutes != null && (
          <span className="text-[var(--tl-ink)]">
            <span className="text-[var(--tl-muted)]">{t("daily.chart.deepWork")}</span>{" "}
            {briefing.deepWorkMinutes}m
          </span>
        )}
      </div>

      {highlight && (
        <p className="mt-2 text-sm text-[var(--tl-ink)]">{highlight}</p>
      )}

      {briefing.suggestedQuestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {briefing.suggestedQuestions.slice(0, 3).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onQuestionSelect(t(key))}
              className="rounded-md border border-[var(--tl-line)] px-2 py-1 text-[0.7rem] text-[var(--tl-muted)] hover:bg-[var(--tl-nav-hover-bg)] hover:text-[var(--tl-ink)] transition-colors"
            >
              {t(key)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
