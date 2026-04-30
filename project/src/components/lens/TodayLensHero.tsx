import type { LensViewModel } from "../../lib/lensViewModel";
import { LensCtaButtons } from "./LensCtaButtons";
import { TimeLensMap } from "./TimeLensMap";

interface Props {
  vm: LensViewModel;
  onTimeline: () => void;
  onReport: () => void;
}

export function TodayLensHero({ vm, onTimeline, onReport }: Props) {
  return (
    <div className="lens-hero">
      <TimeLensMap vm={vm} />
      <div className="lens-actions">
        <LensCtaButtons onTimeline={onTimeline} onReport={onReport} />
      </div>
    </div>
  );
}
