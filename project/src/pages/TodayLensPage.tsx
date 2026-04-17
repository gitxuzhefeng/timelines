import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { DailyAnalysisDto, PipelineHealth } from "../types";
import {
  parseDegradedSections,
  parseDeepWorkSegments,
  parseIntentBreakdown,
  parseTopApps,
  parseTopFlows,
  parseTopInterrupters,
} from "../lib/dailyAnalysisParsed";
import {
  buildLensNarrativeInput,
  LENS_NARRATIVE_SCENES,
  type LensNarrativeSceneId,
} from "../lib/lensNarrativeTemplates";
import {
  extractReportNarrativeSnippet,
  formatDurationMs,
  zhDateLabel,
} from "../lib/phase3Format";
import * as api from "../services/tauri";
import { useAppStore } from "../stores/appStore";

const PIPE_KEYS = [
  { k: "capture" as const, icon: "▣", label: "截屏", sub: "采集帧" },
  { k: "ocr" as const, icon: "◇", label: "OCR", sub: "屏幕文字" },
  { k: "tracker" as const, icon: "◎", label: "前台", sub: "窗口元数据" },
  { k: "clipboard" as const, icon: "≡", label: "剪贴板", sub: "跨应用流" },
  { k: "notifications" as const, icon: "✦", label: "通知", sub: "打断启发" },
];

function engineDot(status: string): string {
  if (status === "running") return "text-[var(--tl-status-ok)]";
  if (status === "degraded") return "text-[var(--tl-status-warn)]";
  return "text-[var(--tl-muted)]";
}

const SEG_COLORS = [
  "bg-teal-400/90",
  "bg-violet-400/85",
  "bg-amber-400/85",
  "bg-slate-500/90",
];

const DEGRADED_LABELS: Record<string, string> = {
  clipboard_flows: "剪贴板流水",
  ambient_context: "环境上下文",
  notifications: "系统通知",
  input_dynamics: "输入采样",
  ocr: "OCR",
};

export default function TodayLensPage() {
  const navigate = useNavigate();
  const date = useAppStore((s) => s.date);
  const activity = useAppStore((s) => s.activity);
  const [analysis, setAnalysis] = useState<DailyAnalysisDto | null | undefined>(undefined);
  const [health, setHealth] = useState<PipelineHealth | null>(null);
  const [snippet, setSnippet] = useState("");
  const [narrativeScene, setNarrativeScene] = useState<LensNarrativeSceneId>(() => {
    try {
      const v = localStorage.getItem("timelens_lens_narrative_scene");
      if (v === "focus_blocks" || v === "interruptions" || v === "apps_flow") return v;
    } catch {
      /* ignore */
    }
    return "focus_blocks";
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [a, h, rep] = await Promise.all([
        api.getDailyAnalysis(date),
        api.getPipelineHealth(),
        api.getDailyReport(date, "fact_only").catch(() => null),
      ]);
      setAnalysis(a);
      setHealth(h);
      setSnippet(extractReportNarrativeSnippet(rep?.contentMd ?? ""));
    } catch (e) {
      setErr(String(e));
      setAnalysis(null);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const degraded = useMemo(
    () => (analysis ? parseDegradedSections(analysis) : []),
    [analysis],
  );
  const intents = useMemo(
    () => (analysis ? parseIntentBreakdown(analysis) : {}),
    [analysis],
  );
  const topApps = useMemo(
    () => (analysis ? parseTopApps(analysis) : []),
    [analysis],
  );
  const deepSegs = useMemo(
    () => (analysis ? parseDeepWorkSegments(analysis).slice(0, 6) : []),
    [analysis],
  );
  const topFlows = useMemo(
    () => (analysis ? parseTopFlows(analysis) : []),
    [analysis],
  );
  const interrupters = useMemo(
    () => (analysis ? parseTopInterrupters(analysis).slice(0, 5) : []),
    [analysis],
  );

  const narrativeInput = useMemo(
    () => (analysis ? buildLensNarrativeInput(analysis) : null),
    [analysis],
  );

  const narrativeBody = useMemo(() => {
    if (!narrativeInput) return "";
    const scene = LENS_NARRATIVE_SCENES.find((s) => s.id === narrativeScene);
    return scene ? scene.body(narrativeInput) : "";
  }, [narrativeInput, narrativeScene]);

  const intentEntries = useMemo(() => {
    return Object.entries(intents)
      .filter(([, ms]) => ms > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [intents]);

  const totalIntentMs = useMemo(
    () => intentEntries.reduce((s, [, v]) => s + v, 0),
    [intentEntries],
  );

  const headline = useMemo(() => {
    if (!analysis) return "";
    const top = intentEntries[0];
    const app0 = topApps[0];
    if (top && app0) {
      return (
        <>
          当日以 <span className="text-[var(--tl-cyan)]">{top[0]}</span> 为主，在{" "}
          <span className="text-[var(--tl-cyan)]">{app0.app}</span> 上停留最久
        </>
      );
    }
    if (top) {
      return (
        <>
          当日结构以 <span className="text-[var(--tl-cyan)]">{top[0]}</span> 为主
        </>
      );
    }
    return <>当日活动时间结构</>;
  }, [analysis, intentEntries, topApps]);

  const loading = analysis === undefined;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-[var(--tl-muted)]">
        加载透视…
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="h-full overflow-y-auto p-5">
        <div className="mx-auto max-w-lg rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-8 text-center">
          <div className="mb-3 text-3xl opacity-80">📭</div>
          <h2 className="text-lg font-semibold text-[var(--tl-ink)]">这一天还没有可用的透视</h2>
          <p className="mt-2 text-sm text-[var(--tl-muted)]">
            尚未生成当日分析汇总，或这一天没有会话记录。可先检查采集与权限，再重新生成。
          </p>
          {activity && (
            <p className="mt-2 text-xs text-[var(--tl-muted)]">
              当日已有记录：工作片段 {activity.sessionCount} 段 · 截图 {activity.snapshotCount} 张
            </p>
          )}
          {err && <p className="mt-3 text-sm text-[var(--tl-status-bad)]">{err}</p>}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              disabled={busy}
              className="tl-interactive-row rounded-lg bg-[var(--tl-accent-15)] px-4 py-2 text-sm font-medium text-[var(--tl-cyan)] ring-1 ring-[var(--tl-line)] hover:bg-[var(--tl-accent-22)] disabled:opacity-40"
              onClick={async () => {
                setBusy(true);
                try {
                  await api.generateDailyAnalysis(date);
                  await api.generateDailyReport(date, false);
                  await load();
                } catch (e) {
                  setErr(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "生成中…" : "生成当日分析 + 事实报告"}
            </button>
            <Link
              to="/settings"
              className="rounded-lg border border-[var(--tl-line)] px-4 py-2 text-sm text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"
            >
              打开设置
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="tl-poster-card mb-4">
        <p className="mb-2 font-mono text-[0.62rem] tracking-wider text-[var(--tl-cyan-dim)]">
          {zhDateLabel(date)}
        </p>
        <h2 className="mb-3 text-xl font-bold leading-snug tracking-tight md:text-2xl">{headline}</h2>
        <p className="mb-1 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.14em] text-[var(--tl-cyan)]">
          语言洞察
        </p>
        <p className="mb-2 text-[0.65rem] leading-relaxed text-[var(--tl-muted)]">
          基于当日已采集指标自动组句，无需 AI；三种读法对应不同关注点，可切换查看。
        </p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {LENS_NARRATIVE_SCENES.map((s) => {
            const on = narrativeScene === s.id;
            return (
              <button
                key={s.id}
                type="button"
                title={s.blurb}
                onClick={() => {
                  setNarrativeScene(s.id);
                  try {
                    localStorage.setItem("timelens_lens_narrative_scene", s.id);
                  } catch {
                    /* ignore */
                  }
                }}
                className={`tl-interactive-row rounded-lg border px-2.5 py-1.5 text-left text-[0.72rem] transition-colors ${
                  on
                    ? "border-[var(--tl-accent-45)] bg-[var(--tl-accent-12)] text-[var(--tl-ink)]"
                    : "border-[var(--tl-line)] bg-[var(--tl-glass-20)] text-[var(--tl-muted)] hover:border-[var(--tl-accent-25)] hover:text-[var(--tl-ink)]/85"
                }`}
              >
                <span className="block font-medium text-[var(--tl-ink)]">{s.title}</span>
                <span className="mt-0.5 block text-[0.62rem] text-[var(--tl-muted)]">{s.blurb}</span>
              </button>
            );
          })}
        </div>
        <p className="mb-4 whitespace-pre-line rounded-lg border border-[var(--tl-accent-20)] bg-[var(--tl-glass-25)] p-3 text-sm leading-relaxed text-[var(--tl-ink)]/90">
          {narrativeBody}
        </p>
        {snippet ? (
          <div className="mb-4 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-glass-15)] p-3">
            <p className="mb-1 font-mono text-[0.5rem] font-semibold uppercase tracking-[0.12em] text-[var(--tl-muted)]">
              事实报告摘录
            </p>
            <p className="text-sm leading-relaxed text-[var(--tl-ink)]/80">{snippet}</p>
          </div>
        ) : (
          <p className="mb-4 text-[0.65rem] text-[var(--tl-muted)]">
            尚未生成事实层报告时，以上摘要仅来自透视指标；可在「日报告」生成事实层后在此对照阅读。
          </p>
        )}

        <p className="mb-2 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.14em] text-[var(--tl-cyan)]">
          数据管线
        </p>
        <div className="mb-4 flex flex-wrap items-center gap-0.5">
          {PIPE_KEYS.map((p, i) => {
            const st = health?.[p.k]?.status ?? "stopped";
            return (
              <div key={p.k} className="contents">
                <div className="min-w-[4.5rem] max-w-[5.5rem] flex-1 rounded-lg border border-[var(--tl-accent-22)] bg-[var(--tl-accent-06)] px-1.5 py-2 text-center">
                  <span className={`block text-lg ${engineDot(st)}`}>{p.icon}</span>
                  <span className="block font-mono text-[0.5rem] font-semibold uppercase tracking-wider text-[var(--tl-cyan-dim)]">
                    {p.label}
                  </span>
                  <span className="mt-0.5 block text-[0.58rem] text-[var(--tl-ink)]/75">{p.sub}</span>
                </div>
                {i < PIPE_KEYS.length - 1 ? (
                  <div className="tl-fp-link mx-px hidden min-[480px]:block">
                    <span
                      className="tl-fp-beam block"
                      style={{ animationDelay: `${i * 0.35}s` }}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {degraded.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {degraded.map((key) => (
              <span
                key={key}
                title="该数据源当日缺失或降级，相关模块指标可能不完整"
                className="rounded-md border border-[var(--tl-warn-amber-border)] bg-[var(--tl-warn-amber-bg)] px-2 py-0.5 text-[0.65rem] text-[var(--tl-warn-amber-text)]"
              >
                降级 · {DEGRADED_LABELS[key] ?? key}
              </span>
            ))}
          </div>
        )}

        <p className="mb-2 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.14em] text-[var(--tl-cyan)]">
          心流分段（长段会话）
        </p>
        <div className="mb-4 flex flex-wrap gap-1">
          {deepSegs.length === 0 ? (
            <span className="text-sm text-[var(--tl-muted)]">暂无满足最小时长的心流分段</span>
          ) : (
            deepSegs.map((s) => (
              <span
                key={`${s.start_ms}-${s.end_ms}`}
                className="rounded-lg border border-[var(--tl-accent-18)] bg-[var(--tl-glass-30)] px-2 py-1 text-center text-[0.65rem] text-[var(--tl-ink)]/90"
              >
                {s.intent} · {formatDurationMs(s.duration_ms)}
              </span>
            ))
          )}
        </div>

        <p className="mb-2 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.14em] text-[var(--tl-cyan)]">
          剪贴板路径（Top）
        </p>
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          {topFlows.length === 0 ? (
            <span className="text-[var(--tl-muted)]">暂无 copy→paste 流（或当日剪贴板流水降级）</span>
          ) : (
            <>
              <span className="rounded-lg border border-[var(--tl-violet-35)] bg-[var(--tl-violet-08)] px-2 py-1.5 text-center text-[0.7rem] text-[var(--tl-purple)]">
                {topFlows[0].from}
              </span>
              <span className="text-[var(--tl-muted)]">→</span>
              <span className="rounded-lg border border-[var(--tl-violet-35)] bg-[var(--tl-violet-08)] px-2 py-1.5 text-center text-[0.7rem] text-[var(--tl-purple)]">
                {topFlows[0].to}
              </span>
              <span className="font-mono text-xs text-[var(--tl-muted)]">×{topFlows[0].count}</span>
            </>
          )}
        </div>

        <p className="mb-2 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.14em] text-[var(--tl-cyan)]">
          打断来源
        </p>
        <div className="mb-4 flex min-h-[52px] items-end gap-1 border-b border-[var(--tl-accent-15b)] pb-2">
          {interrupters.length === 0 ? (
            <span className="text-sm text-[var(--tl-muted)]">暂无通知类打断统计</span>
          ) : (
            interrupters.map((it, idx) => {
              const h = 12 + Math.min(28, it.count * 4);
              return (
                <div
                  key={it.app}
                  title={`${it.app} · ${it.count} 条`}
                  className="flex-1 rounded-t bg-gradient-to-t from-[var(--tl-cyan)]/25 to-[var(--tl-purple)]/35"
                  style={{
                    height: `${h}px`,
                    maxWidth: "48px",
                    animationDelay: `${idx * 0.08}s`,
                  }}
                />
              );
            })
          )}
        </div>
        {analysis.notificationCount > 0 && (
          <p className="mb-3 font-mono text-xs text-[var(--tl-muted)]">
            通知条数（当日）: {analysis.notificationCount} · 深度时段内打断: {analysis.interruptsInDeep}
          </p>
        )}

        <p className="mb-2 text-[0.72rem] font-medium tracking-wide text-[var(--tl-muted)]">
          时间结构 · 按事项类型
        </p>
        <div className="flex h-3 w-full overflow-hidden rounded-md bg-[var(--tl-glass-40)]">
          {totalIntentMs > 0
            ? intentEntries.slice(0, 6).map(([label, ms], i) => (
                <div
                  key={label}
                  title={`${label} ${formatDurationMs(ms)}`}
                  className={`h-full ${SEG_COLORS[i % SEG_COLORS.length]}`}
                  style={{ width: `${(ms / totalIntentMs) * 100}%` }}
                />
              ))
            : null}
        </div>
        <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm">
          <div>
            <span className="text-[var(--tl-muted)]">有效活动</span>{" "}
            <span className="font-mono text-[var(--tl-cyan)]">
              {formatDurationMs(analysis.totalActiveMs)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 text-[0.65rem] text-[var(--tl-muted)]">
            {intentEntries.slice(0, 4).map(([label, ms], i) => (
              <span key={label}>
                <span className={`inline-block h-2 w-2 rounded-sm ${SEG_COLORS[i % SEG_COLORS.length]}`} />{" "}
                {label} {formatDurationMs(ms)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-4">
        <p className="text-sm leading-relaxed text-[var(--tl-ink)]/90">
          深度工作累计{" "}
          <span className="font-mono text-[var(--tl-cyan)]">
            {formatDurationMs(analysis.deepWorkTotalMs)}
          </span>
          ，切换碎片化约{" "}
          <span className="font-mono">{analysis.fragmentationPct.toFixed(1)}%</span>
          {analysis.totalSwitches > 0 && (
            <>
              ，总切换{" "}
              <span className="font-mono">{analysis.totalSwitches}</span> 次
            </>
          )}
          。
        </p>
        <p className="mt-3 text-[0.65rem] font-medium uppercase tracking-wide text-[var(--tl-muted)]">
          时间占比 Top 3 应用
        </p>
        <ul className="mt-2 space-y-1.5">
          {topApps.slice(0, 3).map((r) => (
            <li key={r.app} className="flex justify-between text-sm">
              <span>{r.app}</span>
              <span className="font-mono text-[var(--tl-muted)]">{formatDurationMs(r.duration_ms)}</span>
            </li>
          ))}
          {topApps.length === 0 && (
            <li className="text-sm text-[var(--tl-muted)]">暂无</li>
          )}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--tl-line)] pt-4">
          <button
            type="button"
            className="tl-interactive-row rounded-lg border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-cyan)] hover:bg-[var(--tl-accent-08)]"
            onClick={() => navigate("/timeline")}
          >
            打开时间线 →
          </button>
          <button
            type="button"
            className="tl-interactive-row rounded-lg border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-cyan)] hover:bg-[var(--tl-accent-08)]"
            onClick={() => navigate("/report")}
          >
            打开日报告 →
          </button>
        </div>
      </div>
    </div>
  );
}
