import { useTranslation } from "react-i18next";

interface Props {
  onTimeline: () => void;
  onReport: () => void;
}

export function LensCtaButtons({ onTimeline, onReport }: Props) {
  const { t } = useTranslation();

  return (
    <div className="lens-btns">
      {/* Primary CTA */}
      <button
        type="button"
        className="lens-btn lens-btn--primary"
        onClick={onTimeline}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M3 8h10M9 4l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="lens-btn__label">{t("todayLens.openTimeline")}</span>
        <span className="lens-btn__hint">{t("todayLens.openTimelineHint")}</span>
      </button>

      {/* Secondary CTA */}
      <button
        type="button"
        className="lens-btn lens-btn--secondary"
        onClick={onReport}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M6 6h4M6 9h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <span className="lens-btn__label">{t("todayLens.openReport")}</span>
        <span className="lens-btn__hint">{t("todayLens.openReportHint")}</span>
      </button>
    </div>
  );
}
