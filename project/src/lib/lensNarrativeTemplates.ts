import type { DailyAnalysisDto } from "../types";
import {
  parseDegradedSections,
  parseDeepWorkSegments,
  parseIntentBreakdown,
  parseTopApps,
  parseTopFlows,
  parseTopInterrupters,
} from "./dailyAnalysisParsed";
import { formatDurationMs } from "./phase3Format";

/** 供三条叙事模板消费的当日结构化摘要 */
export interface LensNarrativeInput {
  totalActiveMs: number;
  deepWorkTotalMs: number;
  fragmentationPct: number;
  totalSwitches: number;
  notificationCount: number;
  interruptsInDeep: number;
  topIntent: { label: string; ms: number } | null;
  secondIntent: { label: string; ms: number } | null;
  topApps: { app: string; duration_ms: number }[];
  deepSegs: { intent: string; duration_ms: number }[];
  topFlow: { from: string; to: string; count: number } | null;
  interrupters: { app: string; count: number }[];
  degradedLabels: string[];
}

const DEGRADED_UI: Record<string, string> = {
  clipboard_flows: "剪贴板流水",
  ambient_context: "环境上下文",
  notifications: "系统通知",
  input_dynamics: "输入采样",
  ocr: "OCR",
};

export function buildLensNarrativeInput(d: DailyAnalysisDto): LensNarrativeInput {
  const intents = parseIntentBreakdown(d);
  const entries = Object.entries(intents)
    .filter(([, ms]) => ms > 0)
    .sort((a, b) => b[1] - a[1]);
  const topIntent = entries[0] ? { label: entries[0][0], ms: entries[0][1] } : null;
  const secondIntent = entries[1] ? { label: entries[1][0], ms: entries[1][1] } : null;

  const degradedLabels = parseDegradedSections(d).map((k) => DEGRADED_UI[k] ?? k);

  const topFlows = parseTopFlows(d);
  return {
    totalActiveMs: d.totalActiveMs,
    deepWorkTotalMs: d.deepWorkTotalMs,
    fragmentationPct: d.fragmentationPct,
    totalSwitches: d.totalSwitches,
    notificationCount: d.notificationCount,
    interruptsInDeep: d.interruptsInDeep,
    topIntent,
    secondIntent,
    topApps: parseTopApps(d),
    deepSegs: parseDeepWorkSegments(d).map((s) => ({
      intent: s.intent,
      duration_ms: s.duration_ms,
    })),
    topFlow: topFlows[0] ?? null,
    interrupters: parseTopInterrupters(d).map((r) => ({ app: r.app, count: r.count })),
    degradedLabels,
  };
}

function pctOf(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

function dataQualityNote(labels: string[]): string {
  if (labels.length === 0) return "";
  return `（当日部分数据源降级：${labels.join("、")}，下文仅基于已采集到的记录。）`;
}

/** 场景一：关心深度块与节奏的用户 */
export function narrativeFocusBlocks(ctx: LensNarrativeInput): string {
  const q = dataQualityNote(ctx.degradedLabels);
  const active = formatDurationMs(ctx.totalActiveMs);
  const deep = formatDurationMs(ctx.deepWorkTotalMs);
  const ratio = pctOf(ctx.deepWorkTotalMs, ctx.totalActiveMs);

  const segPart =
    ctx.deepSegs.length === 0
      ? "没有出现达到阈值的长段心流记录；若你确实有过连续专注，可能与采集窗口或最小时长设置有关。"
      : `记录到 ${ctx.deepSegs.length} 段较长专注：${ctx.deepSegs
          .slice(0, 4)
          .map((s) => `${s.intent} 约 ${formatDurationMs(s.duration_ms)}`)
          .join("；")}${ctx.deepSegs.length > 4 ? "…" : ""}。`;

  const switchPart =
    ctx.totalSwitches > 0
      ? `全天应用切换约 ${ctx.totalSwitches} 次，切换碎片化指标约 ${ctx.fragmentationPct.toFixed(1)}%。`
      : "当日切换次数很少，界面停留相对连贯。";

  return `在有效活动约 ${active} 的窗口里，深度工作累计约 ${deep}，大约占有效活动的 ${ratio}。${segPart}${switchPart}${q ? `\n${q}` : ""}`;
}

/** 场景二：关心通知与打断的用户 */
export function narrativeInterruptions(ctx: LensNarrativeInput): string {
  const q = dataQualityNote(ctx.degradedLabels);
  const frag = ctx.fragmentationPct.toFixed(1);

  const notifPart =
    ctx.notificationCount > 0
      ? `系统侧共记录约 ${ctx.notificationCount} 条通知；其中在深度时段内出现的打断约 ${ctx.interruptsInDeep} 次。`
      : "当日几乎没有可用的通知统计（可能未授权通知监听或数据源降级）。";

  const intrPart =
    ctx.interrupters.length > 0
      ? `按应用聚合，通知类打断较多的来源包括：${ctx.interrupters
          .slice(0, 3)
          .map((r) => `${r.app}（约 ${r.count} 条）`)
          .join("、")}。`
      : "暂未能从通知维度聚合出明显的「打断大户」。";

  const switchPart =
    ctx.totalSwitches > 0
      ? `与此同时，前台窗口切换约 ${ctx.totalSwitches} 次，碎片化约 ${frag}%，说明注意力在应用之间来回拉扯的程度${ctx.fragmentationPct >= 35 ? "偏高" : ctx.fragmentationPct >= 18 ? "中等" : "相对较低"}。`
      : `前台切换很少，碎片化约 ${frag}%。`;

  return `${notifPart}${intrPart}${switchPart}${q ? `\n${q}` : ""}`;
}

/** 场景三：关心应用分布与跨应用协作的用户 */
export function narrativeAppsAndFlow(ctx: LensNarrativeInput): string {
  const q = dataQualityNote(ctx.degradedLabels);
  const active = formatDurationMs(ctx.totalActiveMs);

  const intentPart = ctx.topIntent
    ? ctx.secondIntent
      ? `从事项类型上看，「${ctx.topIntent.label}」时间最长（约 ${formatDurationMs(ctx.topIntent.ms)}），其次是「${ctx.secondIntent.label}」（约 ${formatDurationMs(ctx.secondIntent.ms)}），构成当日主线。`
      : `从事项类型上看，「${ctx.topIntent.label}」时间最长（约 ${formatDurationMs(ctx.topIntent.ms)}），是当日最突出的主题。`
    : "当日事项类型分布较稀疏，暂难概括一条清晰主线。";

  const appsPart =
    ctx.topApps.length > 0
      ? `应用停留方面，前三名是 ${ctx.topApps
          .slice(0, 3)
          .map((a) => `${a.app}（${formatDurationMs(a.duration_ms)}）`)
          .join("、")}。`
      : "应用停留排行暂无数据。";

  const flowPart = ctx.topFlow
    ? `剪贴板路径里最常出现的一条是「${ctx.topFlow.from} → ${ctx.topFlow.to}」，重复约 ${ctx.topFlow.count} 次，像是当日反复发生的跨应用搬运或粘贴。`
    : ctx.degradedLabels.some((l) => l.includes("剪贴板"))
      ? "剪贴板流水当日不可用，看不到典型的 copy→paste 路径。"
      : "当日没有统计到明显的剪贴板跨应用热点路径。";

  const deepHint =
    ctx.deepWorkTotalMs > 0
      ? `此外，深度工作累计约 ${formatDurationMs(ctx.deepWorkTotalMs)}；在有效活动 ${active} 的尺度下，仍可对块状专注时间做对照复盘。`
      : "";

  return `${intentPart}${appsPart}${flowPart}${deepHint ? deepHint : ""}${q ? `\n${q}` : ""}`;
}

export const LENS_NARRATIVE_SCENES = [
  {
    id: "focus_blocks",
    title: "专注时光",
    blurb: "适合想看清深度块与节奏的你",
    body: narrativeFocusBlocks,
  },
  {
    id: "interruptions",
    title: "打断实况",
    blurb: "适合对通知与碎片化敏感的你",
    body: narrativeInterruptions,
  },
  {
    id: "apps_flow",
    title: "应用足迹",
    blurb: "适合想串联软件与时间主线的你",
    body: narrativeAppsAndFlow,
  },
] as const;

export type LensNarrativeSceneId = (typeof LENS_NARRATIVE_SCENES)[number]["id"];
