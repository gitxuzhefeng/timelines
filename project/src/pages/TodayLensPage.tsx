import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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

const PIPE_KEYS_BASE = [
  { k: "capture" as const, icon: "▣", labelKey: "todayLens.pipeCapture", subKey: "todayLens.pipeCaptureFrames" },
  { k: "ocr" as const, icon: "◇", labelKey: null, subKey: "todayLens.pipeOcrSub" },
  { k: "tracker" as const, icon: "◎", labelKey: "todayLens.pipeForeground", subKey: "todayLens.pipeWindowMeta" },
  { k: "clipboard" as const, icon: "≡", labelKey: "todayLens.pipeClipboard", subKey: "todayLens.pipeClipboardFlow" },
  { k: "notifications" as const, icon: "✦", labelKey: "todayLens.pipeNotifications", subKey: "todayLens.pipeInterruptHint" },
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

const DEGRADED_LABEL_KEYS: Record<string, string> = {
  clipboard_flows: "todayLens.degradedClipboardFlows",
  ambient_context: "todayLens.degradedAmbientContext",
  notifications: "todayLens.degradedNotifications",
  input_dynamics: "todayLens.degradedInputDynamics",
};

export default function TodayLensPage() {
  const { t } = useTranslation();
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
  const [focusSession, setFocusSession] = useState<api.FocusSession | null>(null);
  const [focusHistory, setFocusHistory] = useState<api.FocusSession[]>([]);
  const [focusRemaining, setFocusRemaining] = useState(0);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [a, h, rep, activeFocus, fHistory] = await Promise.all([
        api.getDailyAnalysis(date),
        api.getPipelineHealth(),
        api.getDailyReport(date, "fact_only").catch(() => null),
        api.getActiveFocusSession().catch(() => null),
        api.getFocusHistory(date).catch(() => []),
      ]);
      setAnalysis(a);
      setHealth(h);
      setSnippet(extractReportNarrativeSnippet(rep?.contentMd ?? ""));
      setFocusSession(activeFocus ?? null);
      setFocusHistory(fHistory);
    } catch (e) {
      setErr(String(e));
      setAnalysis(null);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  // Focus countdown timer
  useEffect(() => {
    if (!focusSession || focusSession.status !== "active") {
      setFocusRemaining(0);
      return;
    }
    const update = () => {
      const endMs = focusSession.startMs + focusSession.plannedDurationMin * 60_000;
      const rem = Math.max(0, Math.ceil((endMs - Date.now()) / 60_000));
      setFocusRemaining(rem);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [focusSession]);

  // Listen for focus events
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    api.listenEvent("focus_session_started", () => void load()).then((u) => unsubs.push(u));
    api.listenEvent("focus_session_ended", () => void load()).then((u) => unsubs.push(u));
    return () => unsubs.forEach((u) => u());
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
          {t("todayLens.headlinePre1")} <span className="text-[var(--tl-cyan)]">{top[0]}</span> {t("todayLens.headlineMid1")}{" "}
          <span className="text-[var(--tl-cyan)]">{app0.app}</span> {t("todayLens.headlineSuf1")}
        </>
      );
    }
    if (top) {
      return (
        <>
          {t("todayLens.headlinePre2")} <span className="text-[var(--tl-cyan)]">{top[0]}</span> {t("todayLens.headlineSuf2")}
        </>
      );
    }
    return <>{t("todayLens.headlineDefault")}</>;
  }, [analysis, intentEntries, topApps, t]);

  const loading = analysis === undefined;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-[var(--tl-muted)]">
        {t("todayLens.loading")}
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="h-full overflow-y-auto p-5">
        <div className="mx-auto max-w-lg rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-8 text-center">
          <div className="mb-3 text-3xl opacity-80">📭</div>
          <h2 className="text-lg font-semibold text-[var(--tl-ink)]">{t("todayLens.noLens")}</h2>
          <p className="mt-2 text-sm text-[var(--tl-muted)]">
            {t("todayLens.noAnalysis")}
          </p>
          {activity && (
            <p className="mt-2 text-xs text-[var(--tl-muted)]">
              {t("todayLens.dailyRecords", { sessionCount: activity.sessionCount, snapshotCount: activity.snapshotCount })}
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
              {busy ? t("todayLens.generating") : t("todayLens.generateAnalysis")}
            </button>
            <Link
              to="/settings"
              className="rounded-lg border border-[var(--tl-line)] px-4 py-2 text-sm text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"
            >
              {t("todayLens.openSettings")}
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
          {t("todayLens.languageInsights")}
        </p>
        <p className="mb-2 text-[0.65rem] leading-relaxed text-[var(--tl-muted)]">
          {t("todayLens.languageInsightsDesc")}
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
        {snippet && (
          <details className="mb-4 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-glass-15)]">
            <summary className="cursor-pointer px-3 py-2 font-mono text-[0.5rem] font-semibold uppercase tracking-[0.12em] text-[var(--tl-muted)]">
              {t("todayLens.factReportExcerpt")}
            </summary>
            <p className="px-3 pb-3 text-sm leading-relaxed text-[var(--tl-ink)]/80">{snippet}</p>
          </details>
        )}

        {health && (
          <details className="mb-4 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-glass-15)]">
            <summary className="cursor-pointer px-3 py-2 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.14em] text-[var(--tl-cyan)]">
              {t("todayLens.dataPipeline")}
            </summary>
            <div className="flex flex-wrap items-center gap-0.5 px-3 pb-3">
              {PIPE_KEYS_BASE.map((p, i) => {
                const st = health?.[p.k]?.status ?? "stopped";
                const label = p.labelKey ? t(p.labelKey) : "OCR";
                const sub = t(p.subKey);
                return (
                  <div key={p.k} className="contents">
                    <div className="min-w-[4.5rem] max-w-[5.5rem] flex-1 rounded-lg border border-[var(--tl-accent-22)] bg-[var(--tl-accent-06)] px-1.5 py-2 text-center">
                      <span className={`block text-lg ${engineDot(st)}`}>{p.icon}</span>
                      <span className="block font-mono text-[0.5rem] font-semibold uppercase tracking-wider text-[var(--tl-cyan-dim)]">
                        {label}
                      </span>
                      <span className="mt-0.5 block text-[0.58rem] text-[var(--tl-ink)]/75">{sub}</span>
                    </div>
                    {i < PIPE_KEYS_BASE.length - 1 ? (
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
          </details>
        )}

        {degraded.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {degraded.map((key) => (
              <span
                key={key}
                title={t("todayLens.degraded", { key })}
                className="rounded-md border border-[var(--tl-warn-amber-border)] bg-[var(--tl-warn-amber-bg)] px-2 py-0.5 text-[0.65rem] text-[var(--tl-warn-amber-text)]"
              >
                {t("todayLens.degraded", { key: DEGRADED_LABEL_KEYS[key] ? t(DEGRADED_LABEL_KEYS[key]) : key })}
              </span>
            ))}
          </div>
        )}

        <p className="mb-2 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.14em] text-[var(--tl-cyan)]">
          {t("todayLens.flowSegments")}
        </p>
        <div className="mb-4 flex flex-wrap gap-1">
          {deepSegs.length === 0 ? (
            <span className="text-sm text-[var(--tl-muted)]">{t("todayLens.noFlowSegments")}</span>
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
          {t("todayLens.clipboardPaths")}
        </p>
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          {topFlows.length === 0 ? (
            <span className="text-[var(--tl-muted)]">{t("todayLens.noClipboard")}</span>
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
          {t("todayLens.interruptSources")}
        </p>
        <div className="mb-1 flex min-h-[52px] items-end gap-1 border-b border-[var(--tl-accent-15b)] pb-2">
          {interrupters.length === 0 ? (
            <span className="text-sm text-[var(--tl-muted)]">{t("todayLens.noInterrupts")}</span>
          ) : (
            interrupters.map((it, idx) => {
              const h = 12 + Math.min(28, it.count * 4);
              return (
                <div
                  key={it.app}
                  className="flex flex-1 flex-col items-center"
                  style={{ maxWidth: "64px" }}
                >
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-[var(--tl-cyan)]/25 to-[var(--tl-purple)]/35"
                    style={{
                      height: `${h}px`,
                      animationDelay: `${idx * 0.08}s`,
                    }}
                  />
                </div>
              );
            })
          )}
        </div>
        {interrupters.length > 0 && (
          <div className="mb-4 flex gap-1">
            {interrupters.map((it) => (
              <div key={it.app} className="flex flex-1 flex-col items-center" style={{ maxWidth: "64px" }}>
                <span className="truncate text-[0.55rem] text-[var(--tl-ink)]">{it.app}</span>
                <span className="text-[0.5rem] text-[var(--tl-muted)]">{it.count}</span>
              </div>
            ))}
          </div>
        )}
        {analysis.notificationCount > 0 && (
          <p className="mb-3 font-mono text-xs text-[var(--tl-muted)]">
            {t("todayLens.notificationCount", { count: analysis.notificationCount, interrupts: analysis.interruptsInDeep })}
          </p>
        )}

        <p className="mb-2 text-[0.72rem] font-medium tracking-wide text-[var(--tl-muted)]">
          {t("todayLens.timeStructure")}
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
            <span className="text-[var(--tl-muted)]">{t("todayLens.activeTime")}</span>{" "}
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
          {t("todayLens.deepWorkPre")}{" "}
          <span className="font-mono text-[var(--tl-cyan)]">
            {formatDurationMs(analysis.deepWorkTotalMs)}
          </span>
          {t("todayLens.deepWorkMid")}{" "}
          <span className="font-mono">{analysis.fragmentationPct.toFixed(1)}%</span>
          {analysis.totalSwitches > 0 && (
            <>
              {t("todayLens.totalSwitchesPre")}{" "}
              <span className="font-mono">{analysis.totalSwitches}</span> {t("todayLens.totalSwitchesSuf")}
            </>
          )}
          。
        </p>
        <p className="mt-3 text-[0.65rem] font-medium uppercase tracking-wide text-[var(--tl-muted)]">
          {t("todayLens.topApps")}
        </p>
        <ul className="mt-2 space-y-1.5">
          {topApps.slice(0, 3).map((r) => (
            <li key={r.app} className="flex justify-between text-sm">
              <span>{r.app}</span>
              <span className="font-mono text-[var(--tl-muted)]">{formatDurationMs(r.duration_ms)}</span>
            </li>
          ))}
          {topApps.length === 0 && (
            <li className="text-sm text-[var(--tl-muted)]">{t("common.none")}</li>
          )}
        </ul>
        {/* Focus Mode Panel */}
        <div className="mt-4 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
          <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--tl-cyan)]">
            {t("todayLens.focusTitle")}
          </h3>
          {focusSession && focusSession.status === "active" ? (
            <div className="mt-2 space-y-2">
              <p className="text-sm text-[var(--tl-ink)]">
                {t("todayLens.focusActive")} — {t("todayLens.focusRemaining", { min: focusRemaining })}
              </p>
              <div className="flex gap-2">
                <button type="button"
                  className="rounded border border-[var(--tl-line)] px-3 py-1 text-xs text-[var(--tl-cyan)] hover:bg-[var(--tl-accent-08)]"
                  onClick={async () => { await api.stopFocusSession(false); void load(); }}>
                  {t("todayLens.focusStop")}
                </button>
                <button type="button"
                  className="rounded border border-[var(--tl-line)] px-3 py-1 text-xs text-[var(--tl-muted)] hover:bg-[var(--tl-accent-08)]"
                  onClick={async () => { await api.stopFocusSession(true); void load(); }}>
                  {t("todayLens.focusCancel")}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex gap-2">
              {[25, 45, 60].map((m) => (
                <button key={m} type="button"
                  className="rounded border border-[var(--tl-line)] px-3 py-1.5 text-xs text-[var(--tl-cyan)] hover:bg-[var(--tl-accent-08)]"
                  onClick={async () => {
                    try { await api.startFocusSession(m); void load(); }
                    catch { /* already active */ }
                  }}>
                  {t("todayLens.focusStart")} {m}min
                </button>
              ))}
            </div>
          )}
          {focusHistory.length > 0 && (
            <div className="mt-3 border-t border-[var(--tl-line)] pt-2">
              <p className="text-xs font-medium text-[var(--tl-muted)]">{t("todayLens.focusHistory")}</p>
              <ul className="mt-1 space-y-1">
                {focusHistory.map((fs) => (
                  <li key={fs.id} className="flex items-center gap-2 text-xs text-[var(--tl-ink)]">
                    <span className={fs.status === "completed" ? "text-green-400" : "text-[var(--tl-muted)]"}>
                      {fs.status === "completed" ? t("todayLens.focusCompleted") : t("todayLens.focusCancelled")}
                    </span>
                    <span>{t("todayLens.focusMin", { min: fs.plannedDurationMin })}</span>
                    {fs.actualDurationMs != null && (
                      <span className="text-[var(--tl-muted)]">({Math.round(fs.actualDurationMs / 60000)}min)</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--tl-line)] pt-4">
          <button
            type="button"
            className="tl-interactive-row rounded-lg border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-cyan)] hover:bg-[var(--tl-accent-08)]"
            onClick={() => navigate("/timeline")}
          >
            {t("todayLens.openTimeline")}
          </button>
          <button
            type="button"
            className="tl-interactive-row rounded-lg border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-cyan)] hover:bg-[var(--tl-accent-08)]"
            onClick={() => navigate("/report")}
          >
            {t("todayLens.openDailyReport")}
          </button>
        </div>
      </div>
    </div>
  );
}
