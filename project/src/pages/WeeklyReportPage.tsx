import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAiTaskStore } from "../stores/aiTaskStore";
import { useTranslation } from "react-i18next";
import * as api from "../services/tauri";
import type { WeeklyAnalysisDto, WeeklyReportDto } from "../services/tauri";
import { formatDurationMs } from "../lib/phase3Format";
import { useAppStore } from "../stores/appStore";

// ── helpers ──────────────────────────────────────────────────────────────────

function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function parseJsonSafe<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ── FocusHeatmap ─────────────────────────────────────────────────────────────

type HeatmapData = Record<string, Record<string, number>>; // date → hour → score

function FocusHeatmap({
  data,
  weekDates,
}: {
  data: HeatmapData;
  weekDates: string[];
}) {
  const { t } = useTranslation();
  const HOURS = Array.from({ length: 24 }, (_, i) => i);

  const HEAT_LEVELS = [
    "bg-[var(--tl-line)] opacity-40",
    "bg-teal-300/60 dark:bg-teal-800/50",
    "bg-teal-400/70 dark:bg-teal-700/60",
    "bg-teal-500/80 dark:bg-teal-600/70",
    "bg-teal-600/90 dark:bg-teal-500/80",
  ];

  const maxScore = useMemo(() => {
    let m = 0;
    for (const d of weekDates) {
      for (const h of HOURS) {
        const v = data[d]?.[String(h)] ?? 0;
        if (v > m) m = v;
      }
    }
    return m || 1;
  }, [data, weekDates]);

  function heatLevel(score: number): string {
    if (score <= 0) return HEAT_LEVELS[0];
    const norm = score / maxScore;
    if (norm < 0.25) return HEAT_LEVELS[1];
    if (norm < 0.5) return HEAT_LEVELS[2];
    if (norm < 0.75) return HEAT_LEVELS[3];
    return HEAT_LEVELS[4];
  }

  function getDow(isoDate: string): number {
    return new Date(`${isoDate}T00:00:00`).getDay();
  }

  const goldenSlot = useMemo(() => {
    let best = { date: "", hour: 0, score: 0 };
    for (const d of weekDates) {
      for (const h of HOURS) {
        const v = data[d]?.[String(h)] ?? 0;
        if (v > best.score) best = { date: d, hour: h, score: v };
      }
    }
    if (best.score <= 0) return null;
    const dow = getDow(best.date);
    return { dow, hour: best.hour };
  }, [data, weekDates]);

  return (
    <div>
      <div className="flex gap-[3px]" style={{ maxHeight: 200 }}>
        <div className="flex flex-col gap-[3px] pt-4">
          {HOURS.map((h) => (
            <div key={h} className="flex h-[10px] w-5 items-center justify-end text-[8px] leading-none text-[var(--tl-muted)]">
              {h % 3 === 0 ? `${h}` : ""}
            </div>
          ))}
        </div>
        {weekDates.map((date) => (
          <div key={date} className="flex flex-1 flex-col gap-[3px]">
            <div className="mb-0.5 text-center text-[9px] text-[var(--tl-muted)]">
              {t(`weekly.heatmap.day.${getDow(date)}`)}
            </div>
            {HOURS.map((h) => {
              const raw = data[date]?.[String(h)] ?? 0;
              return (
                <div
                  key={h}
                  title={`${date} ${h}:00 — ${raw.toFixed(2)}`}
                  className={`h-[10px] w-full rounded-[2px] ${heatLevel(raw)}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className="flex items-center gap-1 text-[9px] text-[var(--tl-muted)]">
          <span>{t("weekly.heatmap.less")}</span>
          {HEAT_LEVELS.map((cls, i) => (
            <span key={i} className={`inline-block h-[10px] w-[10px] rounded-[2px] ${cls}`} />
          ))}
          <span>{t("weekly.heatmap.more")}</span>
        </div>
        {goldenSlot && (
          <span className="text-[0.65rem] text-[var(--tl-cyan)]">
            {t("weekly.heatmap.goldenSlot", { day: t(`weekly.heatmap.day.${goldenSlot.dow}`), hour: goldenSlot.hour })}
          </span>
        )}
      </div>
    </div>
  );
}

// ── FlowScoreTrend ────────────────────────────────────────────────────────────

type DailyScoreMap = Record<string, number>; // date → score

function FlowScoreTrend({
  scores,
  weekDates,
}: {
  scores: DailyScoreMap;
  weekDates: string[];
}) {
  const { t } = useTranslation();

  const points = weekDates.map((d) => scores[d] ?? null);
  const validPoints = points.filter((v): v is number => v !== null);
  if (validPoints.length === 0) {
    return <p className="text-sm text-[var(--tl-muted)]">{t("weekly.trend.noData")}</p>;
  }

  const max = Math.max(...validPoints);
  const min = Math.min(...validPoints);
  const range = max - min || 1;

  const W = 320;
  const H = 80;
  const PAD = 12;
  const step = (W - PAD * 2) / (weekDates.length - 1 || 1);

  const polyPoints = points
    .map((v, i) => {
      if (v === null) return null;
      const x = PAD + i * step;
      const y = PAD + (1 - (v - min) / range) * (H - PAD * 2);
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(" ");

  function getDow(isoDate: string): number {
    return new Date(`${isoDate}T00:00:00`).getDay();
  }

  return (
    <div>
      <div className="relative overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-md" style={{ height: H }}>
          {/* grid lines */}
          {[0.25, 0.5, 0.75].map((frac) => {
            const y = PAD + frac * (H - PAD * 2);
            return (
              <line
                key={frac}
                x1={PAD}
                y1={y}
                x2={W - PAD}
                y2={y}
                stroke="var(--tl-line)"
                strokeWidth={0.5}
              />
            );
          })}
          {/* polyline */}
          <polyline
            points={polyPoints}
            fill="none"
            stroke="var(--tl-status-ok)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* dots */}
          {points.map((v, i) => {
            if (v === null) return null;
            const x = PAD + i * step;
            const y = PAD + (1 - (v - min) / range) * (H - PAD * 2);
            const isPeak = v === max;
            const isLow = v === min && validPoints.length > 1;
            return (
              <g key={i}>
                <circle
                  cx={x}
                  cy={y}
                  r={isPeak || isLow ? 4 : 3}
                  fill={isPeak ? "var(--tl-status-ok)" : isLow ? "var(--tl-status-warn)" : "var(--tl-surface)"}
                  stroke={isPeak ? "var(--tl-status-ok)" : isLow ? "var(--tl-status-warn)" : "var(--tl-ink)"}
                  strokeWidth={1.5}
                />
                {(isPeak || isLow) && (
                  <text
                    x={x}
                    y={y - 7}
                    textAnchor="middle"
                    fontSize={8}
                    fill={isPeak ? "var(--tl-status-ok)" : "var(--tl-status-warn)"}
                  >
                    {v.toFixed(1)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {/* x-axis labels */}
        <div className="flex justify-between px-3 text-[10px] text-[var(--tl-muted)]" style={{ marginTop: -4 }}>
          {weekDates.map((d) => (
            <span key={d}>{t(`weekly.heatmap.day.${getDow(d)}`)}</span>
          ))}
        </div>
      </div>
      <div className="mt-1 flex gap-3 text-xs text-[var(--tl-muted)]">
        <span className="text-[var(--tl-status-ok)]">▲ {t("weekly.trend.peak")}: {max.toFixed(1)}</span>
        {validPoints.length > 1 && (
          <span className="text-[var(--tl-status-warn)]">▼ {t("weekly.trend.low")}: {min.toFixed(1)}</span>
        )}
      </div>
    </div>
  );
}

// ── AppTrendChart ─────────────────────────────────────────────────────────────

type TopAppsByDayRaw = Record<string, Array<{ app?: string; seconds?: number; name?: string; ms?: number }>>;
type TopAppsByDay = Record<string, Array<{ name: string; ms: number }>>;

function normalizeTopAppsByDay(raw: TopAppsByDayRaw): TopAppsByDay {
  const result: TopAppsByDay = {};
  for (const [date, apps] of Object.entries(raw)) {
    result[date] = (apps ?? []).map((a) => ({
      name: a.app ?? a.name ?? "",
      ms: ((a.seconds ?? 0) * 1000) || (a.ms ?? 0),
    }));
  }
  return result;
}

const BAR_COLORS = [
  "bg-teal-500/80",
  "bg-violet-500/80",
  "bg-amber-500/80",
  "bg-sky-500/80",
  "bg-rose-500/80",
];

function AppTrendChart({ topAppsByDay, weekDates }: { topAppsByDay: TopAppsByDay; weekDates: string[] }) {
  const { t } = useTranslation();

  // collect global top-5 apps by total ms
  const globalTotals: Record<string, number> = {};
  for (const d of weekDates) {
    for (const a of topAppsByDay[d] ?? []) {
      globalTotals[a.name] = (globalTotals[a.name] ?? 0) + a.ms;
    }
  }
  const topApps = Object.entries(globalTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  if (topApps.length === 0) {
    return <p className="text-sm text-[var(--tl-muted)]">{t("weekly.apps.noData")}</p>;
  }

  const maxMs = weekDates.reduce((m, d) => {
    const total = (topAppsByDay[d] ?? [])
      .filter((a) => topApps.includes(a.name))
      .reduce((s, a) => s + a.ms, 0);
    return Math.max(m, total);
  }, 1);

  function getDow(isoDate: string): number {
    return new Date(`${isoDate}T00:00:00`).getDay();
  }

  return (
    <div>
      {/* legend */}
      <div className="mb-2 flex flex-wrap gap-2">
        {topApps.map((name, i) => (
          <div key={name} className="flex items-center gap-1 text-[11px] text-[var(--tl-muted)]">
            <span className={`inline-block h-2 w-2 rounded-sm ${BAR_COLORS[i % BAR_COLORS.length]}`} />
            {name}
          </div>
        ))}
      </div>
      {/* bars */}
      <div className="flex gap-1">
        {weekDates.map((d) => {
          const dayApps = topAppsByDay[d] ?? [];
          const totalMs = dayApps
            .filter((a) => topApps.includes(a.name))
            .reduce((s, a) => s + a.ms, 0);

          return (
            <div key={d} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-20 w-full flex-col-reverse items-stretch justify-start overflow-hidden rounded-sm">
                {topApps.map((name, ci) => {
                  const entry = dayApps.find((a) => a.name === name);
                  if (!entry || entry.ms === 0) return null;
                  const barH = (entry.ms / maxMs) * 80;
                  return (
                    <div
                      key={name}
                      title={`${name}: ${formatDurationMs(entry.ms)}`}
                      className={`w-full ${BAR_COLORS[ci % BAR_COLORS.length]} transition-all`}
                      style={{ height: barH }}
                    />
                  );
                })}
                {totalMs === 0 && (
                  <div className="w-full flex-1 rounded-sm bg-[var(--tl-line)] opacity-20" />
                )}
              </div>
              <span className="text-[10px] text-[var(--tl-muted)]">{t(`weekly.heatmap.day.${getDow(d)}`)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── WeeklyReportPage ──────────────────────────────────────────────────────────

export default function WeeklyReportPage() {
  const { t, i18n } = useTranslation();
  const date = useAppStore((s) => s.date);

  const [weekStart, setWeekStart] = useState<string>("");
  const [, setWeekStartDay] = useState<number>(1);
  const [analysis, setAnalysis] = useState<WeeklyAnalysisDto | null>(null);
  const [report, setReport] = useState<WeeklyReportDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const startAiTask = useAiTaskStore((s) => s.start);
  const finishAiTask = useAiTaskStore((s) => s.finish);
  const [err, setErr] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"chart" | "markdown">(() => {
    try { const v = localStorage.getItem("timelens_view_weekly"); if (v === "chart" || v === "markdown") return v; } catch {}
    return "chart";
  });

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // init: get week_start_day + week_start for today
  useEffect(() => {
    void (async () => {
      const [wsd, ws] = await Promise.all([
        api.getWeekStartDay(),
        api.getWeekStartForDate(date),
      ]);
      if (!mountedRef.current) return;
      setWeekStartDay(wsd);
      setWeekStart(ws);
    })();
  }, [date]);

  const weekDates = useMemo<string[]>(() => {
    if (!weekStart) return [];
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const weekEnd = useMemo(() => (weekDates.length ? weekDates[6] : ""), [weekDates]);

  const load = useCallback(async (ws: string) => {
    if (!ws) return;
    setLoading(true);
    setErr(null);
    try {
      const [a, r] = await Promise.all([
        api.getWeeklyAnalysis(ws),
        api.getWeeklyReport(ws).catch(() => null),
      ]);
      if (!mountedRef.current) return;
      setAnalysis(a);
      setReport(r);

      // auto-generate if missing or stale
      if (!a || a.isStale) {
        await generateFull(ws, a?.validDays ?? 0);
      }
    } catch (e) {
      if (mountedRef.current) setErr(String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (weekStart) void load(weekStart);
  }, [weekStart, load]);

  const generateFull = useCallback(async (ws: string, currentValidDays: number) => {
    const taskId = `weekly-report:${ws}`;
    setGenerating(true);
    setErr(null);
    startAiTask(taskId, "common.aiTaskWeeklyReport");
    try {
      await api.generateWeeklyAnalysis(ws);
      const a2 = await api.getWeeklyAnalysis(ws);
      if (!mountedRef.current) return;
      setAnalysis(a2);

      const lang = i18n.language === "zh-CN" ? "zh-CN" : "en";
      const validDays = a2?.validDays ?? currentValidDays;
      const withAi = validDays >= 3;
      const r2 = await api.generateWeeklyReport(ws, withAi, lang);
      if (!mountedRef.current) return;
      setReport(r2);
    } catch (e) {
      if (mountedRef.current) setErr(String(e));
    } finally {
      finishAiTask(taskId);
      if (mountedRef.current) setGenerating(false);
    }
  }, [finishAiTask, i18n.language, startAiTask]);

  function prevWeek() {
    setWeekStart((ws) => addDays(ws, -7));
  }

  function nextWeek() {
    const next = addDays(weekStart, 7);
    const today = new Date().toISOString().slice(0, 10);
    if (next <= today) setWeekStart(next);
  }

  const canGoNext = useMemo(() => {
    const next = weekStart ? addDays(weekStart, 7) : "";
    const today = new Date().toISOString().slice(0, 10);
    return next <= today;
  }, [weekStart]);

  // parsed data
  const heatmapData = useMemo<HeatmapData>(
    () => parseJsonSafe(analysis?.hourlyHeatmap, {}),
    [analysis],
  );
  const dailyFlowScores = useMemo<DailyScoreMap>(
    () => parseJsonSafe(analysis?.dailyFlowScores, {}),
    [analysis],
  );
  const topAppsByDay = useMemo<TopAppsByDay>(
    () => normalizeTopAppsByDay(parseJsonSafe(analysis?.topAppsByDay, {})),
    [analysis],
  );

  const validDays = analysis?.validDays ?? 0;
  const totalMs = (analysis?.totalTrackedSeconds ?? 0) * 1000;
  const avgFlow = analysis?.avgFlowScore ?? null;

  if (!weekStart) return null;

  return (
    <div className="h-full overflow-auto bg-[var(--tl-bg)] p-4 text-[var(--tl-ink)]">
      {/* header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{t("weekly.title")}</h1>
          <p className="text-xs text-[var(--tl-muted)]">
            {t("weekly.weekOf", { start: weekStart, end: weekEnd })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={prevWeek}
            className="rounded px-2 py-1 text-sm text-[var(--tl-muted)] hover:bg-[var(--tl-nav-hover-bg)] hover:text-[var(--tl-ink)]"
          >
            ‹
          </button>
          <button
            onClick={nextWeek}
            disabled={!canGoNext}
            className="rounded px-2 py-1 text-sm text-[var(--tl-muted)] hover:bg-[var(--tl-nav-hover-bg)] hover:text-[var(--tl-ink)] disabled:opacity-30"
          >
            ›
          </button>
          <button
            onClick={() => void generateFull(weekStart, validDays)}
            disabled={generating || loading}
            className="ml-1 rounded border border-[var(--tl-line)] px-2 py-1 text-xs text-[var(--tl-muted)] hover:bg-[var(--tl-nav-hover-bg)] disabled:opacity-40"
          >
            {generating ? t("weekly.generating") : t("weekly.refresh")}
          </button>
          <div className="ml-2 flex rounded-lg border border-[var(--tl-line)] bg-[var(--tl-input-fill)] p-0.5">
            <button
              type="button"
              className={`rounded px-2 py-1 text-[0.65rem] transition-colors ${viewMode === "chart" ? "bg-[var(--tl-accent-12)] text-[var(--tl-ink)]" : "text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"}`}
              onClick={() => { setViewMode("chart"); localStorage.setItem("timelens_view_weekly", "chart"); }}
            >
              {t("weekly.chartView")}
            </button>
            <button
              type="button"
              className={`rounded px-2 py-1 text-[0.65rem] transition-colors ${viewMode === "markdown" ? "bg-[var(--tl-accent-12)] text-[var(--tl-ink)]" : "text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"}`}
              onClick={() => { setViewMode("markdown"); localStorage.setItem("timelens_view_weekly", "markdown"); }}
            >
              Markdown
            </button>
          </div>
        </div>
      </div>

      {/* error */}
      {err && (
        <div className="mb-4 rounded border border-red-400/40 bg-red-50/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {err}
        </div>
      )}

      {/* loading skeleton */}
      {loading && (
        <div className="flex h-40 items-center justify-center text-sm text-[var(--tl-muted)]">
          <span className="animate-pulse">{t("common.loading")}</span>
        </div>
      )}

      {/* no data */}
      {!loading && validDays === 0 && (
        <div className="rounded border border-[var(--tl-line)] bg-[var(--tl-surface)] p-6 text-center">
          <p className="font-medium text-[var(--tl-ink)]">{t("weekly.noData")}</p>
          <p className="mt-1 text-sm text-[var(--tl-muted)]">{t("weekly.noDataDesc")}</p>
        </div>
      )}

      {/* content */}
      {!loading && validDays > 0 && viewMode === "markdown" && report?.contentMd ? (
        <div className="rounded border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[var(--tl-ink)]">
            {report.contentMd}
          </pre>
        </div>
      ) : !loading && validDays > 0 ? (
        <div className="space-y-4">
          {/* stat summary */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: t("weekly.validDays"), value: `${validDays} / 7` },
              { label: t("weekly.totalTime"), value: formatDurationMs(totalMs) },
              { label: t("weekly.avgFlow"), value: avgFlow != null ? avgFlow.toFixed(1) : "—" },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded border border-[var(--tl-line)] bg-[var(--tl-surface)] p-3 text-center"
              >
                <p className="text-xs text-[var(--tl-muted)]">{label}</p>
                <p className="mt-0.5 text-base font-semibold">{value}</p>
              </div>
            ))}
          </div>

          {validDays < 3 && (
            <div className="rounded border border-amber-400/40 bg-amber-50/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              {t("weekly.insufficientDataDesc", { days: validDays })}
            </div>
          )}

          <section className="rounded border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
            <h2 className="mb-3 text-sm font-medium text-[var(--tl-muted)]">{t("weekly.heatmap.title")}</h2>
            <FocusHeatmap data={heatmapData} weekDates={weekDates} />
          </section>

          <section className="rounded border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
            <h2 className="mb-3 text-sm font-medium text-[var(--tl-muted)]">{t("weekly.trend.title")}</h2>
            <FlowScoreTrend scores={dailyFlowScores} weekDates={weekDates} />
          </section>

          <section className="rounded border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
            <h2 className="mb-3 text-sm font-medium text-[var(--tl-muted)]">{t("weekly.apps.title")}</h2>
            <AppTrendChart topAppsByDay={topAppsByDay} weekDates={weekDates} />
          </section>

          {report?.contentMd && (
            <section className="rounded border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
              <h2 className="mb-3 text-sm font-medium text-[var(--tl-muted)]">{t("weekly.ai.title")}</h2>
              <pre className="whitespace-pre-wrap font-sans text-[0.8rem] leading-relaxed text-[var(--tl-ink)]">
                {report.contentMd}
              </pre>
            </section>
          )}
        </div>
      ) : null}
    </div>
  );
}
