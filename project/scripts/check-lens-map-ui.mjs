import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const hero = readFileSync(join(root, "src/components/lens/TodayLensHero.tsx"), "utf8");
const css = readFileSync(join(root, "src/index.css"), "utf8");

const mapIndex = hero.indexOf("<TimeLensMap");
const ctaIndex = hero.indexOf("<LensCtaButtons");

if (mapIndex === -1 || ctaIndex === -1 || mapIndex > ctaIndex) {
  throw new Error("TodayLensHero should render the TimeLens Map before the CTA buttons.");
}

const windowsPerfAnimationBlocks = css.match(/\[data-os="windows"\]\[data-win-perf="on"\][^{]+{[^}]*animation:\s*none\s*!important;?[^}]*}/g) ?? [];
const disablesLensMapMotion = windowsPerfAnimationBlocks.some((block) =>
  /lens-map-(scan|node|core)/.test(block),
);

if (disablesLensMapMotion) {
  throw new Error("Windows performance mode should not disable TimeLens Map motion.");
}
