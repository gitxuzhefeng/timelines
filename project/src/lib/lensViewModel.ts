import type { DailyAnalysisDto } from "../types";
import {
  parseDeepWorkSegments,
  parseIntentBreakdown,
  parseTopApps,
} from "./dailyAnalysisParsed";
import { formatDurationMs } from "./phase3Format";

// ── Types ─────────────────────────────────────────────────────────────────────

export type LensNodeId = "window" | "ocr" | "switch" | "local" | "session";

export interface LensNodeData {
  id: LensNodeId;
  /** CSS color hex for border-top and value text */
  colorHex: string;
  /** i18n key for node name */
  nameKey: string;
  /** i18n key for the large value string */
  valueKey: string;
  valueParams: Record<string, string | number>;
  /** i18n key for the sub-line (small mono text) */
  subKey: string;
  subParams?: Record<string, string | number>;
  isFallback: boolean;
}

export interface LensViewModel {
  /** Pre-formatted date string (locale-specific, from caller) */
  date: string;
  /** i18n key for headline, use with headlineParams */
  headlineKey: "headlineWithThread" | "headlineNoThread" | "headlineNoData";
  headlineParams: Record<string, string>;
  /** i18n key for sub-line */
  sublineKey: string;
  sublineParams: Record<string, string>;
  /** Extra suffix i18n key (empty string = none) */
  sublineSuffixKey: string;
  /** formatDurationMs(totalActiveMs) */
  activeFormatted: string;
  /** Main thread label (for Map center card) */
  mainThread: string;
  /** formatDurationMs(deepWorkTotalMs) for Map center */
  deepWorkFormatted: string;
  nodes: LensNodeData[];
  degraded: boolean;
}

// ── Node coordinate config (matches prototype CSS left/top %) ─────────────────
// Order: window(top), ocr(right-top), switch(right-bottom), local(left-bottom), session(left-top)
export const NODE_COORDS: Record<LensNodeId, { left: number; top: number }> = {
  window:  { left: 50,   top: 12 },
  ocr:     { left: 79.5, top: 36.8 },
  switch:  { left: 68.3, top: 77.2 },
  local:   { left: 31.7, top: 77.2 },
  session: { left: 20.5, top: 36.8 },
};

export const NODE_COLORS: Record<LensNodeId, string> = {
  window:  "#00f5d4",
  ocr:     "#9b7ed9",
  switch:  "#d4a24c",
  local:   "#3d9b8b",
  session: "#7c6fd4",
};

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildLensViewModel(
  dto: DailyAnalysisDto | null | undefined,
  /** Already-formatted date string, locale-aware (call from component) */
  dateLabel: string,
): LensViewModel {
  const EMPTY_NODE_DATA = buildEmptyNodes();

  if (!dto) {
    return {
      date: dateLabel,
      headlineKey: "headlineNoData",
      headlineParams: {},
      sublineKey: "subDeepWork",
      sublineParams: { duration: "—" },
      sublineSuffixKey: "",
      activeFormatted: "—",
      mainThread: "",
      deepWorkFormatted: "—",
      nodes: EMPTY_NODE_DATA,
      degraded: true,
    };
  }

  const topApps = parseTopApps(dto);
  const intents = parseIntentBreakdown(dto);
  const deepSegs = parseDeepWorkSegments(dto);

  // ── Headline inference ────────────────────────────────────────────────────
  const intentEntries = Object.entries(intents)
    .filter(([, ms]) => ms > 0)
    .sort((a, b) => b[1] - a[1]);
  const totalIntentMs = intentEntries.reduce((s, [, v]) => s + v, 0);

  let mainThread = "";
  let headlineKey: LensViewModel["headlineKey"] = "headlineNoThread";

  const topIntent = intentEntries[0];
  const topApp = topApps[0];

  if (topIntent && totalIntentMs > 0 && topIntent[1] / totalIntentMs > 0.35) {
    mainThread = topIntent[0];
    headlineKey = "headlineWithThread";
  } else if (topApp && dto.totalActiveMs > 0 && topApp.duration_ms / dto.totalActiveMs > 0.35) {
    mainThread = topApp.app;
    headlineKey = "headlineWithThread";
  } else {
    headlineKey = "headlineNoThread";
  }

  // ── Sub-line ──────────────────────────────────────────────────────────────
  const deepWorkFormatted = formatDurationMs(dto.deepWorkTotalMs);
  let sublineSuffixKey = "";
  if (dto.fragmentationPct > 40) {
    sublineSuffixKey = "subFragmented";
  } else if (dto.interruptsInDeep > 10) {
    sublineSuffixKey = "subInterrupted";
  } else if (dto.deepWorkTotalMs > 3 * 60 * 60 * 1000) {
    sublineSuffixKey = "subFocused";
  }

  // ── Nodes ─────────────────────────────────────────────────────────────────
  const nodes: LensNodeData[] = [
    buildWindowNode(topApps),
    buildOcrNode(dto),
    buildSwitchNode(dto),
    buildLocalNode(),
    buildSessionNode(deepSegs),
  ];

  return {
    date: dateLabel,
    headlineKey,
    headlineParams: mainThread ? { thread: mainThread } : {},
    sublineKey: "subDeepWork",
    sublineParams: { duration: deepWorkFormatted },
    sublineSuffixKey,
    activeFormatted: formatDurationMs(dto.totalActiveMs),
    mainThread,
    deepWorkFormatted,
    nodes,
    degraded: false,
  };
}

// ── Node builders ─────────────────────────────────────────────────────────────

function buildWindowNode(
  topApps: { app: string; duration_ms: number }[],
): LensNodeData {
  if (topApps.length > 0) {
    return {
      id: "window",
      colorHex: NODE_COLORS.window,
      nameKey: "todayLens.nodeWindow",
      valueKey: "todayLens.nodeWindowCount",
      valueParams: { count: topApps.length },
      subKey: "todayLens.nodeWindowFallback",
      isFallback: false,
    };
  }
  return fallbackNode("window", "todayLens.nodeWindowFallback", "todayLens.nodeWindowFallback");
}

function buildOcrNode(dto: DailyAnalysisDto): LensNodeData {
  // OCR count is not directly in DTO; use snapshot count from activity if available.
  // For now derive from sceneBreakdown or fall back gracefully.
  // Use notificationCount as a proxy signal that OCR is active (OCR pipeline is co-located).
  const hasOcrSignal = dto.notificationCount > 0 || dto.deepWorkTotalMs > 0;
  if (hasOcrSignal) {
    return {
      id: "ocr",
      colorHex: NODE_COLORS.ocr,
      nameKey: "todayLens.nodeOcr",
      valueKey: "todayLens.nodeOcrFallback",
      valueParams: {},
      subKey: "todayLens.nodeOcrFallback",
      isFallback: false,
    };
  }
  return fallbackNode("ocr", "todayLens.nodeOcrFallback", "todayLens.nodeOcrFallback");
}

function buildSwitchNode(dto: DailyAnalysisDto): LensNodeData {
  if (dto.totalSwitches > 0) {
    return {
      id: "switch",
      colorHex: NODE_COLORS.switch,
      nameKey: "todayLens.nodeSwitch",
      valueKey: "todayLens.nodeSwitchCount",
      valueParams: { count: dto.totalSwitches },
      subKey: "todayLens.nodeSwitchFallback",
      isFallback: false,
    };
  }
  return fallbackNode("switch", "todayLens.nodeSwitchFallback", "todayLens.nodeSwitchFallback");
}

function buildLocalNode(): LensNodeData {
  return {
    id: "local",
    colorHex: NODE_COLORS.local,
    nameKey: "todayLens.nodeLocal",
    valueKey: "todayLens.nodeLocalValue",
    valueParams: {},
    subKey: "todayLens.nodeLocalSub",
    isFallback: false,
  };
}

function buildSessionNode(
  deepSegs: { duration_ms: number }[],
): LensNodeData {
  if (deepSegs.length > 0) {
    const longest = Math.max(...deepSegs.map((s) => s.duration_ms));
    return {
      id: "session",
      colorHex: NODE_COLORS.session,
      nameKey: "todayLens.nodeSession",
      valueKey: "todayLens.nodeSessionCount",
      valueParams: { count: deepSegs.length },
      subKey: "todayLens.nodeSessionLongest",
      subParams: { duration: formatDurationMs(longest) },
      isFallback: false,
    };
  }
  return fallbackNode("session", "todayLens.nodeSessionFallback", "todayLens.nodeSessionFallback");
}

function fallbackNode(
  id: LensNodeId,
  valueKey: string,
  subKey: string,
): LensNodeData {
  return {
    id,
    colorHex: NODE_COLORS[id],
    nameKey: `todayLens.node${id.charAt(0).toUpperCase() + id.slice(1)}` as string,
    valueKey,
    valueParams: {},
    subKey,
    isFallback: true,
  };
}

function buildEmptyNodes(): LensNodeData[] {
  const ids: LensNodeId[] = ["window", "ocr", "switch", "local", "session"];
  return ids.map((id) =>
    fallbackNode(
      id,
      `todayLens.node${id.charAt(0).toUpperCase() + id.slice(1)}Fallback`,
      `todayLens.node${id.charAt(0).toUpperCase() + id.slice(1)}Fallback`,
    ),
  );
}
