import { useTranslation } from "react-i18next";
import type { LensViewModel } from "../../lib/lensViewModel";
import { LensCtaButtons } from "./LensCtaButtons";
import { TimeLensMap } from "./TimeLensMap";

interface Props {
  vm: LensViewModel;
  onTimeline: () => void;
  onReport: () => void;
}

const TAGS = [
  "todayLens.tagLocal",
  "todayLens.tagScreenshot",
  "todayLens.tagOcr",
  "todayLens.tagContext",
] as const;

export function TodayLensHero({ vm, onTimeline, onReport }: Props) {
  const { t } = useTranslation();

  const headline = vm.headlineKey === "headlineWithThread"
    ? t("todayLens.headlineWithThread", vm.headlineParams)
    : t(vm.headlineKey);

  const subline = t(vm.sublineKey, vm.sublineParams)
    + (vm.sublineSuffixKey ? t(vm.sublineSuffixKey) : "");

  return (
    <div className="lens-hero">
      {/* Left: copy column */}
      <div className="lens-copy">
        <p className="lens-eyebrow">{t("todayLens.eyebrow", { date: vm.date })}</p>

        <h1 className="lens-headline">{headline}</h1>

        <p className="lens-sub">{subline}</p>

        <LensCtaButtons onTimeline={onTimeline} onReport={onReport} />

        {/* Capability micro-tags */}
        <div className="lens-tags">
          {TAGS.map((key) => (
            <span key={key} className="lens-tag">
              {t(key)}
            </span>
          ))}
        </div>
      </div>

      {/* Right: TimeLens Map */}
      <TimeLensMap vm={vm} />
    </div>
  );
}
