import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import type { DailyAnalysisDto } from "../types";
import {
  parseIntentBreakdown,
  parseTopApps,
  parseDeepWorkSegments,
  parseTopInterrupters,
  parseTopFlows,
} from "../lib/dailyAnalysisParsed";
import { formatDurationShortMs } from "../lib/phase3Format";

const CHART_COLORS = [
  "var(--tl-p3-c-a)", "var(--tl-p3-c-b)", "var(--tl-p3-c-c)", "var(--tl-p3-c-d)",
];

function resolveVar(v: string): string {
  if (typeof document === "undefined") return v;
  if (!v.startsWith("var(")) return v;
  const name = v.slice(4, -1).trim();
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || v;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex-1 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-surface)] p-3">
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-[var(--tl-muted)]">{label}</p>
      <p className="mt-1 text-[1.1rem] font-bold text-[var(--tl-ink)]">{value}</p>
      {sub && <p className="mt-0.5 text-[0.6rem] text-[var(--tl-muted)]">{sub}</p>}
    </div>
  );
}

export function DailyChartView({ analysis }: { analysis: DailyAnalysisDto }) {
  const { t } = useTranslation();

  const intentData = useMemo(() => {
    const raw = parseIntentBreakdown(analysis);
    return Object.entries(raw)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, ms], i) => ({ name, value: ms, color: resolveVar(CHART_COLORS[i % CHART_COLORS.length]) }));
  }, [analysis]);

  const topApps = useMemo(() => parseTopApps(analysis).slice(0, 8), [analysis]);
  const deepSegs = useMemo(() => parseDeepWorkSegments(analysis), [analysis]);
  const interrupters = useMemo(() => parseTopInterrupters(analysis).slice(0, 5), [analysis]);
  const flows = useMemo(() => parseTopFlows(analysis).slice(0, 5), [analysis]);

  const flowScore = analysis.flowScoreAvg != null ? (analysis.flowScoreAvg * 100).toFixed(0) : "—";
  const fragPct = analysis.fragmentationPct != null ? `${(analysis.fragmentationPct * 100).toFixed(0)}%` : "—";

  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        <StatCard label={t("daily.chart.totalTime")} value={formatDurationShortMs(analysis.totalActiveMs)} />
        <StatCard label={t("daily.chart.deepWork")} value={formatDurationShortMs(analysis.deepWorkTotalMs)} sub={`${deepSegs.length} ${t("daily.chart.segments")}`} />
        <StatCard label={t("daily.chart.fragmentation")} value={fragPct} />
        <StatCard label={t("daily.chart.flowScore")} value={flowScore} />
      </div>

      <div className="grid grid-cols-2 gap-5">
        <section className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
          <h3 className="mb-3 text-[0.72rem] font-semibold uppercase tracking-wide text-[var(--tl-muted)]">{t("daily.chart.timeAllocation")}</h3>
          {intentData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={intentData} dataKey="value" innerRadius={45} outerRadius={70} paddingAngle={2} stroke="none">
                    {intentData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => formatDurationShortMs(Number(v ?? 0))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5">
                {intentData.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-[0.68rem]">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
                    <span className="text-[var(--tl-ink)]">{d.name}</span>
                    <span className="text-[var(--tl-muted)]">{formatDurationShortMs(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--tl-muted)]">{t("daily.chart.noData")}</p>
          )}
        </section>

        <section className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
          <h3 className="mb-3 text-[0.72rem] font-semibold uppercase tracking-wide text-[var(--tl-muted)]">{t("daily.chart.interruptions")}</h3>
          {interrupters.length > 0 ? (
            <div>
              <p className="mb-2 text-[0.65rem] text-[var(--tl-muted)]">{t("daily.chart.totalInterruptions", { count: analysis.notificationCount })}</p>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={interrupters} layout="vertical" margin={{ left: 60, right: 10, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--tl-line)" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "var(--tl-muted)" }} />
                  <YAxis type="category" dataKey="app" tick={{ fontSize: 10, fill: "var(--tl-ink)" }} width={55} />
                  <Tooltip />
                  <Bar dataKey="count" fill={resolveVar("var(--tl-p3-c-b)")} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-[var(--tl-muted)]">{t("daily.chart.noData")}</p>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
        <h3 className="mb-3 text-[0.72rem] font-semibold uppercase tracking-wide text-[var(--tl-muted)]">{t("daily.chart.attention")}</h3>
        {deepSegs.length > 0 ? (
          <div>
            <p className="mb-2 text-[0.65rem] text-[var(--tl-muted)]">
              {formatDurationShortMs(analysis.deepWorkTotalMs)} · {deepSegs.length} {t("daily.chart.segments")}
            </p>
            <div className="relative h-6 overflow-hidden rounded bg-[var(--tl-line)]">
              {deepSegs.map((seg, i) => {
                const dayStart = new Date(analysis.analysisDate + "T00:00:00").getTime();
                const daySpan = 16 * 60 * 60_000;
                const left = ((seg.start_ms - dayStart - 8 * 60 * 60_000) / daySpan) * 100;
                const width = Math.max((seg.duration_ms / daySpan) * 100, 0.5);
                return (
                  <span
                    key={i}
                    className="absolute top-0 bottom-0 rounded-sm"
                    style={{ left: `${Math.max(left, 0)}%`, width: `${width}%`, background: resolveVar(CHART_COLORS[i % CHART_COLORS.length]) }}
                    title={`${formatDurationShortMs(seg.duration_ms)} — ${seg.intent}`}
                  />
                );
              })}
            </div>
            <div className="mt-1 flex justify-between font-mono text-[0.5rem] text-[var(--tl-muted)]">
              <span>08</span><span>12</span><span>16</span><span>20</span><span>24</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--tl-muted)]">{t("daily.chart.noData")}</p>
        )}
      </section>

      {flows && flows.length > 0 && (
        <section className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
          <h3 className="mb-3 text-[0.72rem] font-semibold uppercase tracking-wide text-[var(--tl-muted)]">{t("daily.chart.clipboardFlow")}</h3>
          <div className="space-y-2">
            {flows.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-[0.7rem]">
                <span className="rounded bg-[var(--tl-surface-deep)] px-1.5 py-0.5 font-medium text-[var(--tl-ink)]">{f.from}</span>
                <span className="text-[var(--tl-muted)]">→</span>
                <span className="rounded bg-[var(--tl-surface-deep)] px-1.5 py-0.5 font-medium text-[var(--tl-ink)]">{f.to}</span>
                <span className="ml-auto font-mono text-[var(--tl-muted)]">×{f.count}</span>
                <div className="h-2 w-16 overflow-hidden rounded-full bg-[var(--tl-line)]">
                  <div className="h-full rounded-full bg-[var(--tl-cyan)]" style={{ width: `${Math.min((f.count / (flows[0]?.count || 1)) * 100, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {topApps.length > 0 && (
        <section className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
          <h3 className="mb-3 text-[0.72rem] font-semibold uppercase tracking-wide text-[var(--tl-muted)]">{t("daily.chart.topApps")}</h3>
          <div className="space-y-1.5">
            {topApps.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-[0.7rem]">
                <span className="w-28 truncate font-medium text-[var(--tl-ink)]">{a.app}</span>
                <div className="flex-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--tl-line)]">
                    <div className="h-full rounded-full" style={{ width: `${Math.max((a.duration_ms / (topApps[0]?.duration_ms || 1)) * 100, 2)}%`, background: resolveVar(CHART_COLORS[i % CHART_COLORS.length]) }} />
                  </div>
                </div>
                <span className="w-14 text-right font-mono text-[var(--tl-muted)]">{formatDurationShortMs(a.duration_ms)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

