import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { DailyAnalysisDto, Snapshot, WindowSession } from "../types";
import { snapshotTimelensUrl } from "../types";
import { parseIntentBreakdown, parseTopApps } from "../lib/dailyAnalysisParsed";
import {
  DAYPART_ORDER,
  daypartFromStartMs,
  formatDurationMs,
  formatDurationShortMs,
  zhDateLabel,
  type Daypart,
} from "../lib/phase3Format";
import * as api from "../services/tauri";
import { useAppStore } from "../stores/appStore";

type IntentBucket = "a" | "b" | "c" | "d";

const P3_COLORS: Record<IntentBucket, string> = {
  a: "var(--tl-p3-c-a)",
  b: "var(--tl-p3-c-b)",
  c: "var(--tl-p3-c-c)",
  d: "var(--tl-p3-c-d)",
};

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function intentVisual(intent: string | null): { bucket: IntentBucket; label: string } {
  const raw = (intent || "").trim();
  const t = raw.toLowerCase();
  if (/深度|deep|集中|专注|focus/.test(t)) {
    return { bucket: "a", label: raw || "深度工作" };
  }
  if (/协作|沟通|会议|commun|slack|message|mail|邮件/.test(t)) {
    return { bucket: "b", label: raw || "协作沟通" };
  }
  if (/浏览|学习|阅读|search|文档|doc|wiki/.test(t)) {
    return { bucket: "c", label: raw || "浏览与学习" };
  }
  return { bucket: "d", label: raw || "其他" };
}

function appIconLabel(name: string): string {
  const t = name.trim();
  if (!t || t === "—") return "—";
  if (/[\u4e00-\u9fff]/.test(t)) return t.slice(0, 1);
  return t.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || t.slice(0, 2);
}

function parseDateParts(iso: string): { y: number; mo: number; d: number } | null {
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  return { y: parts[0], mo: parts[1], d: parts[2] };
}

/** 当日 08:00—24:00（本地）与条形图映射 */
function dayActivityWindowMs(isoDate: string): { winStart: number; winEnd: number; span: number } | null {
  const p = parseDateParts(isoDate);
  if (!p) return null;
  const { y, mo, d } = p;
  const winStart = new Date(y, mo - 1, d, 8, 0, 0, 0).getTime();
  const winEnd = new Date(y, mo - 1, d, 24, 0, 0, 0).getTime();
  return { winStart, winEnd, span: winEnd - winStart };
}

function sessionRulerSeg(
  s: WindowSession,
  win: { winStart: number; winEnd: number; span: number },
): { leftPct: number; widthPct: number } | null {
  const seg0 = Math.max(s.startMs, win.winStart);
  const seg1 = Math.min(s.endMs, win.winEnd);
  if (seg1 <= seg0) return null;
  const leftPct = ((seg0 - win.winStart) / win.span) * 100;
  const widthPct = Math.max(((seg1 - seg0) / win.span) * 100, 0.35);
  return { leftPct, widthPct };
}

function aggregateAppsFromSessions(sessions: WindowSession[]): { app: string; duration_ms: number }[] {
  const m = new Map<string, number>();
  for (const s of sessions) {
    m.set(s.appName, (m.get(s.appName) || 0) + s.durationMs);
  }
  return [...m.entries()]
    .map(([app, duration_ms]) => ({ app, duration_ms }))
    .sort((a, b) => b.duration_ms - a.duration_ms);
}

export default function TimelinePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const date = useAppStore((s) => s.date);
  const [sessions, setSessions] = useState<WindowSession[]>([]);
  const [analysis, setAnalysis] = useState<DailyAnalysisDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState<WindowSession | null>(null);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [snapPick, setSnapPick] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, a] = await Promise.all([api.getSessions(date), api.getDailyAnalysis(date)]);
      setSessions(list);
      setAnalysis(a);
    } catch {
      setSessions([]);
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const byPart = useMemo(() => {
    const m: Record<Daypart, WindowSession[]> = {
      morning: [],
      midday: [],
      afternoon: [],
      evening: [],
    };
    for (const s of sessions) {
      m[daypartFromStartMs(s.startMs)].push(s);
    }
    return m;
  }, [sessions]);

  const sessionsTotalMs = useMemo(
    () => sessions.reduce((acc, s) => acc + s.durationMs, 0),
    [sessions],
  );

  const bridgeTotalMs = analysis?.totalActiveMs && analysis.totalActiveMs > 0 ? analysis.totalActiveMs : sessionsTotalMs;

  const bridgeBar = useMemo(() => {
    const intents = analysis ? parseIntentBreakdown(analysis) : {};
    const entries = Object.entries(intents)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    if (entries.length === 0) {
      if (sessions.length === 0) return [] as { key: string; flex: number; color: string }[];
      const byBucket: Record<IntentBucket, number> = { a: 0, b: 0, c: 0, d: 0 };
      for (const s of sessions) {
        byBucket[intentVisual(s.intent).bucket] += s.durationMs;
      }
      const order: IntentBucket[] = ["a", "b", "c", "d"];
      const raw = order.map((k) => ({ key: k, ms: byBucket[k] })).filter((x) => x.ms > 0);
      const sum = raw.reduce((a, x) => a + x.ms, 0) || 1;
      return raw.map((x) => ({
        key: x.key,
        flex: Math.max(3, Math.round((x.ms / sum) * 100)),
        color: P3_COLORS[x.key],
      }));
    }
    const sum = entries.reduce((a, [, v]) => a + v, 0) || 1;
    const colors = ["var(--tl-p3-c-a)", "var(--tl-p3-c-b)", "var(--tl-p3-c-c)", "var(--tl-p3-c-d)"];
    return entries.map(([k, v], i) => ({
      key: k,
      flex: Math.max(3, Math.round((v / sum) * 100)),
      color: colors[i % colors.length],
    }));
  }, [analysis, sessions]);

  const bridgeChips = useMemo(() => {
    const total = bridgeTotalMs || 1;
    const rows = analysis ? parseTopApps(analysis) : aggregateAppsFromSessions(sessions);
    return rows.slice(0, 3).map((r) => ({
      app: r.app,
      dur: r.duration_ms,
      pct: Math.round((r.duration_ms / total) * 100),
    }));
  }, [analysis, sessions, bridgeTotalMs]);

  const rulerWin = useMemo(() => dayActivityWindowMs(date), [date]);

  const rulerSegs = useMemo(() => {
    if (!rulerWin) return [];
    return sessions
      .map((s) => {
        const g = sessionRulerSeg(s, rulerWin);
        if (!g) return null;
        return { s, ...g, color: P3_COLORS[intentVisual(s.intent).bucket] };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
  }, [sessions, rulerWin]);

  useEffect(() => {
    if (!pick) {
      setSnaps([]);
      setSnapPick(null);
      return;
    }
    void (async () => {
      try {
        const list = await api.getSessionSnapshots(pick.id);
        setSnaps(list);
        setSnapPick(list[0]?.id ?? null);
      } catch {
        setSnaps([]);
        setSnapPick(null);
      }
    })();
  }, [pick]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const selectedSnap = snaps.find((s) => s.id === snapPick) ?? snaps[0];

  return (
    <div className="relative h-full overflow-y-auto p-5 pb-10">
      {lightbox ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--tl-overlay-lightbox)] p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("sessions.screenshotAlt")}
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-lg bg-[var(--tl-surface-deep)] px-3 py-1 text-sm text-[var(--tl-ink)]"
            onClick={() => setLightbox(null)}
          >
            {t("common.close")}
          </button>
          <img
            src={lightbox}
            alt="snapshot"
            className="tl-lightbox-image max-h-[92vh] max-w-full object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-[640px]">
        <Link
          to="/lens"
          className="mb-5 inline-flex items-center gap-1.5 text-[0.78rem] font-medium tracking-wide text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"
        >
          <span aria-hidden className="opacity-75">←</span>
          {t("timeline.backToLens")}
        </Link>

        <header className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--tl-line)] pb-4">
          <div>
            <p className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[var(--tl-muted)]">
              TimeLens
            </p>
            <h1 className="mt-1.5 text-[1.45rem] font-bold leading-snug tracking-wide text-[var(--tl-ink)]">
              {t("timeline.title").split("完整时间线")[0]}<span className="text-[var(--tl-p3-accent)]">{t("timeline.title").includes("完整时间线") ? "完整时间线" : t("timeline.title")}</span>
            </h1>
          </div>
          <div className="text-right text-[0.72rem] text-[var(--tl-muted)]">
            <strong className="mb-0.5 block text-[0.95rem] font-semibold text-[var(--tl-ink)]">
              {zhDateLabel(date)}
            </strong>
            <span>{loading ? "…" : t("timeline.sessionCount", { count: sessions.length })}</span>
          </div>
        </header>

        <section className="tl-p3-bridge mb-6" aria-label={t("timeline.sameCalibration")}>
          <p className="mb-2 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-[var(--tl-muted)]">
            {t("timeline.sameCalibration")}
          </p>
          <div className="mb-3 flex h-2 overflow-hidden rounded" role="img" aria-label="意图占比">
            {bridgeBar.length === 0 ? (
              <span className="h-full w-full rounded bg-[var(--tl-bar-empty)]" />
            ) : (
              bridgeBar.map((b) => (
                <span
                  key={b.key}
                  className="h-full min-w-[3px]"
                  style={{ flex: `${b.flex} 1 0`, background: b.color }}
                />
              ))
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[1.35rem] font-bold leading-none tracking-tight text-[var(--tl-ink)]">
                {loading ? "…" : formatDurationMs(bridgeTotalMs)}
              </p>
              <p className="mt-0.5 text-[0.62rem] font-medium tracking-wide text-[var(--tl-muted)]">
                {t("timeline.recordedTime")}
              </p>
            </div>
            <div className="flex max-w-full flex-wrap justify-end gap-1.5">
              {bridgeChips.length === 0 && !loading ? (
                <span className="rounded-md border border-[var(--tl-line)] bg-[var(--tl-chip-bg)] px-2 py-1 text-[0.65rem] text-[var(--tl-muted)]">
                  {t("timeline.noTopApps")}
                </span>
              ) : (
                bridgeChips.map((c) => (
                  <span
                    key={c.app}
                    className="rounded-md border border-[var(--tl-line)] bg-[var(--tl-chip-bg)] px-2 py-1 text-[0.65rem] text-[var(--tl-muted)]"
                  >
                    <strong className="font-semibold text-[var(--tl-ink)]">{c.app}</strong>{" "}
                    {formatDurationShortMs(c.dur)} · {c.pct}%
                  </span>
                ))
              )}
            </div>
          </div>
        </section>

        <div className="mb-5">
          <div className="mb-1.5 flex justify-between text-[0.58rem] uppercase tracking-[0.08em] text-[var(--tl-muted)]">
            <span>{t("timeline.activityDensity")}</span>
            <span>{t("timeline.timeRange")}</span>
          </div>
          <div
            className="relative h-3.5 overflow-hidden rounded-full bg-white/[0.04]"
            role="presentation"
            aria-hidden
          >
            {rulerSegs.map(({ s, leftPct, widthPct, color }) => (
              <span
                key={s.id}
                className="absolute top-0 bottom-0 rounded-sm shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)] opacity-90"
                style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: color }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[0.55rem] text-[var(--tl-muted)] opacity-85">
            <span>08</span>
            <span>12</span>
            <span>16</span>
            <span>20</span>
            <span>24</span>
          </div>
        </div>

        <p className="mb-4 text-[0.78rem] leading-relaxed text-[var(--tl-muted)]">
          {t("timeline.sessionListDesc").split("前台会话段")[0]}<strong className="text-[var(--tl-ink)]">{t("timeline.sessionListDesc").includes("前台会话段") ? "前台会话段" : ""}</strong>{t("timeline.sessionListDesc").split("前台会话段")[1] ?? ""}
        </p>

        {loading ? (
          <p className="text-sm text-[var(--tl-muted)]">{t("timeline.loading")}</p>
        ) : sessions.length === 0 ? (
          <p className="text-center text-sm text-[var(--tl-muted)]">{t("timeline.noSessions")}</p>
        ) : (
          DAYPART_ORDER.map(({ key, label }) => {
            const list = byPart[key];
            if (list.length === 0) return null;
            return (
              <div key={key}>
                <h2 className="tl-p3-section-title">{label}</h2>
                <div className="tl-p3-tl" role="list">
                  {list.map((s) => {
                    const { bucket, label: intentLabel } = intentVisual(s.intent);
                    const intentCls =
                      bucket === "a"
                        ? "tl-p3-intent-a"
                        : bucket === "b"
                          ? "tl-p3-intent-b"
                          : bucket === "c"
                            ? "tl-p3-intent-c"
                            : "tl-p3-intent-d";
                    const dot = P3_COLORS[bucket];
                    const active = pick?.id === s.id;
                    return (
                      <article key={s.id} className="tl-p3-item" role="listitem">
                        <div className="tl-p3-time">
                          {fmtTime(s.startMs)}
                          <span className="dur block text-[0.58rem] font-normal opacity-85">
                            {formatDurationShortMs(s.durationMs)}
                          </span>
                        </div>
                        <div className="tl-p3-axis">
                          <span className="tl-p3-dot" style={{ background: dot }} />
                        </div>
                        <button
                          type="button"
                          onClick={() => setPick(s)}
                          className={`tl-p3-card tl-interactive-row ${active ? "tl-p3-card-active" : ""}`}
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-[0.82rem] font-semibold text-[var(--tl-ink)]">
                              <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[0.65rem] font-bold text-[var(--tl-muted)]">
                                {appIconLabel(s.appName)}
                              </span>
                              {s.appName}
                            </span>
                            <span
                              className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.06em] ${intentCls}`}
                            >
                              {intentLabel}
                            </span>
                          </div>
                          <p className="text-[0.74rem] leading-snug text-[var(--tl-muted)] [word-break:break-word]">
                            {s.windowTitle || t("timeline.noWindowTitle")}
                          </p>
                          <p className="mt-2 font-mono text-[0.62rem] text-[var(--tl-muted)] opacity-90">
                            {t("timeline.sessionEvents", { count: s.rawEventCount })}
                            {s.bundleId ? ` · ${s.bundleId}` : ""}
                          </p>
                        </button>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        <nav
          className="mt-7 flex flex-wrap gap-x-4 gap-y-2 border-t border-[var(--tl-line)] pt-5"
          aria-label={t("timeline.openReport")}
        >
          <button
            type="button"
            className="border-0 bg-transparent p-0 text-[0.78rem] font-medium text-[var(--tl-p3-accent)] hover:underline"
            onClick={() => navigate("/report")}
          >
            {t("timeline.openReport")}
          </button>
        </nav>

        <p className="mt-5 text-center text-[0.6rem] tracking-wide text-[var(--tl-muted)]">
          {t("timeline.dataNote")}
        </p>
      </div>

      {pick ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-[var(--tl-overlay-strong)] p-2 md:p-4" role="presentation">
          <button
            type="button"
            className="absolute inset-0 cursor-default border-0 bg-transparent"
            aria-label={t("common.close")}
            onClick={() => setPick(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tl-sheet-title"
            className="tl-sheet-panel relative z-10 flex h-full w-full max-w-lg flex-col rounded-xl border border-[var(--tl-line)] bg-[var(--tl-sheet-bg)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--tl-line)] px-4 py-3">
              <h2 id="tl-sheet-title" className="text-base font-semibold">
                {t("timeline.sessionDetails")}
              </h2>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xl leading-none text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"
                onClick={() => setPick(null)}
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <p className="font-medium text-[var(--tl-ink)]">{pick.appName}</p>
              <p className="mt-1 text-sm text-[var(--tl-muted)]">{pick.windowTitle}</p>
              <p className="mt-2 font-mono text-xs text-[var(--tl-muted)]">
                {fmtTime(pick.startMs)} — {fmtTime(pick.endMs)} · {formatDurationMs(pick.durationMs)}
              </p>
              {pick.intent && (
                <p className="mt-2 text-sm">
                  {t("timeline.intent", { intent: pick.intent })}
                </p>
              )}
              <p className="mt-4 text-xs font-medium uppercase tracking-wide text-[var(--tl-muted)]">
                {t("timeline.screenshots")}
              </p>
              <div className="mt-2 flex min-h-[160px] items-center justify-center rounded-lg border border-[var(--tl-line)] bg-[var(--tl-glass-30)] p-2">
                {selectedSnap?.filePath ? (
                  <button
                    type="button"
                    className="tl-interactive-row max-h-[200px] max-w-full border-0 bg-transparent p-0"
                    onClick={() => setLightbox(snapshotTimelensUrl(selectedSnap.id))}
                  >
                    <img
                      src={snapshotTimelensUrl(selectedSnap.id)}
                      alt=""
                      className="tl-preview-image max-h-[200px] max-w-full rounded object-contain"
                    />
                  </button>
                ) : (
                  <span className="text-sm text-[var(--tl-muted)]">{t("timeline.noScreenshots")}</span>
                )}
              </div>
              {snaps.length > 0 && (
                <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto">
                  {snaps.map((sn) => (
                    <li key={sn.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSnapPick(sn.id);
                          if (sn.filePath) setLightbox(snapshotTimelensUrl(sn.id));
                        }}
                        className={`tl-interactive-row flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs ${
                          sn.id === snapPick
                            ? "bg-[var(--tl-snap-selected)]"
                            : "hover:bg-[var(--tl-snap-hover)]"
                        }`}
                      >
                        <span>{fmtTime(sn.capturedAtMs)}</span>
                        <span className="text-[var(--tl-muted)]">{sn.triggerType}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
