import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const hero = readFileSync(join(root, "src/components/lens/TodayLensHero.tsx"), "utf8");
const css = readFileSync(join(root, "src/index.css"), "utf8");
const zhLocale = JSON.parse(readFileSync(join(root, "src/i18n/locales/zh-CN.json"), "utf8"));
const feedbackTemplate = readFileSync(join(root, "../.github/ISSUE_TEMPLATE/user_feedback.yml"), "utf8");

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

if (zhLocale.todayLens.mapTitle === "TimeLens Map") {
  throw new Error("Chinese TimeLens Map title should be localized.");
}

if (zhLocale.todayLens.coreBadge === "MAIN THREAD") {
  throw new Error("Chinese TimeLens Map core badge should be localized.");
}

const firstImpressionStart = feedbackTemplate.indexOf("    id: first_impression");
const firstImpressionEnd = feedbackTemplate.indexOf("\n  - type:", firstImpressionStart + 1);
const firstImpressionBlock = feedbackTemplate.slice(
  firstImpressionStart,
  firstImpressionEnd === -1 ? undefined : firstImpressionEnd,
);
const firstImpressionRequired = /validations:\s*\n\s*required:\s*true/.test(firstImpressionBlock);
if (firstImpressionRequired) {
  throw new Error("User feedback first impression should be optional.");
}
