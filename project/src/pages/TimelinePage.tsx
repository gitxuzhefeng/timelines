import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Snapshot, WindowSession } from "../types";
import { snapshotTimelensUrl } from "../types";
import {
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


export default function TimelinePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const date = useAppStore((s) => s.date);
  const [sessions, setSessions] = useState<WindowSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState<WindowSession | null>(null);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [snapPick, setSnapPick] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(() => new Set());
  const [viewMode, setViewMode] = useState<"summary" | "full">(() => {
    try { const v = localStorage.getItem("timelens_view_timeline"); if (v === "summary" || v === "full") return v; } catch {}
    return "summary";
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getSessions(date);
      setSessions(list);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  const isTracking = useAppStore((s) => s.isTracking);

  useEffect(() => {
    void load();
    const isToday = date === new Date().toISOString().slice(0, 10);
    if (!isToday || !isTracking) return;
    const timer = setInterval(() => void load(), 10_000);
    return () => clearInterval(timer);
  }, [load, date, isTracking]);

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
  void byPart;

  // Phase 12: reversed sessions (newest first)
  const reversedSessions = useMemo(() => [...sessions].sort((a, b) => b.startMs - a.startMs), [sessions]);

  type SummaryBlock = {
    id: string;
    startMs: number;
    endMs: number;
    primaryApp: string;
    primaryPct: number;
    secondaryApps: string[];
    totalDurationMs: number;
    intent: string | null;
    switchCount: number;
  };

  const summaryBlocks = useMemo((): SummaryBlock[] => {
    if (sessions.length === 0) return [];
    const chrono = [...sessions].sort((a, b) => a.startMs - b.startMs);
    const WINDOW_MS = 30 * 60_000;
    const MAX_MERGE_MS = 2 * 60 * 60_000;

    const winStart = chrono[0].startMs;
    const winEnd = chrono[chrono.length - 1].endMs;
    const windows: { start: number; end: number }[] = [];
    let ws = winStart;
    while (ws < winEnd) {
      windows.push({ start: ws, end: ws + WINDOW_MS });
      ws += WINDOW_MS;
    }

    function buildBlock(w: { start: number; end: number }): SummaryBlock {
      const inWindow = chrono.filter((s) => s.startMs < w.end && s.endMs > w.start);
      const appMs = new Map<string, number>();
      let totalMs = 0;
      for (const s of inWindow) {
        const overlap = Math.min(s.endMs, w.end) - Math.max(s.startMs, w.start);
        if (overlap > 0) {
          appMs.set(s.appName, (appMs.get(s.appName) || 0) + overlap);
          totalMs += overlap;
        }
      }
      const sorted = [...appMs.entries()].sort((a, b) => b[1] - a[1]);
      const denom = totalMs || 1;
      const topPct = sorted.length > 0 ? sorted[0][1] / denom : 0;
      const primaryApp = sorted.length > 0 ? (topPct >= 0.6 ? sorted[0][0] : `${sorted[0][0]} + ${sorted[1]?.[0] || ""}`) : "—";
      const primaryPctRound = Math.round(topPct * 100);
      const secondary = sorted.slice(topPct >= 0.6 ? 1 : 2, topPct >= 0.6 ? 3 : 4).map(([a]) => a);
      const topSession = inWindow.find((s) => s.appName === sorted[0]?.[0]);
      return {
        id: `sw-${w.start}`,
        startMs: w.start,
        endMs: w.end,
        primaryApp,
        primaryPct: primaryPctRound,
        secondaryApps: secondary,
        totalDurationMs: totalMs,
        intent: topSession?.intent ?? null,
        switchCount: Math.max(0, inWindow.length - 1),
      };
    }

    const raw = windows.map(buildBlock).filter((b) => b.totalDurationMs > 0);

    const merged: SummaryBlock[] = [];
    for (const b of raw) {
      const prev = merged[merged.length - 1];
      if (prev && prev.primaryApp === b.primaryApp && (b.endMs - prev.startMs) <= MAX_MERGE_MS) {
        prev.endMs = b.endMs;
        prev.totalDurationMs += b.totalDurationMs;
        const allSec = new Set([...prev.secondaryApps, ...b.secondaryApps]);
        prev.secondaryApps = [...allSec].slice(0, 2);
      } else {
        merged.push({ ...b });
      }
    }
    return merged.reverse();
  }, [sessions]);

  const sessionsTotalMs = useMemo(
    () => sessions.reduce((acc, s) => acc + s.durationMs, 0),
    [sessions],
  );

  function statusLabel(b: SummaryBlock): string {
    if (b.switchCount <= 1) return t("timeline.statusFocused");
    if (b.switchCount <= 5) return t("timeline.statusModerate");
    return t("timeline.statusFragmented");
  }

  function toggleBlock(blockId: string) {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  }

  function getBlockSessions(block: SummaryBlock): WindowSession[] {
    return sessions
      .filter((s) => s.startMs < block.endMs && s.endMs > block.startMs)
      .sort((a, b) => a.startMs - b.startMs);
  }

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
            <h1 className="text-[1.25rem] font-bold leading-snug tracking-wide text-[var(--tl-ink)]">
              {t("timeline.title")}
            </h1>
            <p className="mt-1 text-[0.72rem] text-[var(--tl-muted)]">
              {loading ? "…" : `${formatDurationShortMs(sessionsTotalMs)} · ${t("timeline.sessionCount", { count: sessions.length })}`}
            </p>
          </div>
          <div className="text-right text-[0.72rem] text-[var(--tl-muted)]">
            <strong className="mb-0.5 block text-[0.95rem] font-semibold text-[var(--tl-ink)]">
              {zhDateLabel(date)}
            </strong>
          </div>
        </header>

        {/* ── Activity density band ── */}
        <div className="mb-6">
          <div className="mb-2 flex justify-between text-[0.68rem] font-medium text-[var(--tl-muted)]">
            <span>{t("timeline.activityDensity")}</span>
            <span>{t("timeline.timeRange")}</span>
          </div>
          <div
            className="group relative h-9 overflow-hidden rounded-lg bg-[var(--tl-surface)]"
            role="presentation"
          >
            {rulerSegs.map(({ s, leftPct, widthPct, color }) => (
              <span
                key={s.id}
                className="absolute top-0 bottom-0 rounded transition-opacity hover:opacity-100 opacity-85"
                style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 0.5)}%`, background: color }}
                title={`${s.appName} · ${fmtTime(s.startMs)}–${fmtTime(s.endMs)} · ${formatDurationShortMs(s.durationMs)}`}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[0.68rem] text-[var(--tl-muted)]">
            <span>08</span>
            <span>12</span>
            <span>16</span>
            <span>20</span>
            <span>24</span>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <p className="text-[0.78rem] leading-relaxed text-[var(--tl-muted)]">
            {t("timeline.sessionListDesc").split("前台会话段")[0]}<strong className="text-[var(--tl-ink)]">{t("timeline.sessionListDesc").includes("前台会话段") ? "前台会话段" : ""}</strong>{t("timeline.sessionListDesc").split("前台会话段")[1] ?? ""}
          </p>
          <div className="flex shrink-0 gap-1 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-input-fill)] p-0.5">
            <button
              type="button"
              className={`rounded px-2 py-1 text-[0.65rem] transition-colors ${viewMode === "summary" ? "bg-[var(--tl-accent-12)] text-[var(--tl-ink)]" : "text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"}`}
              onClick={() => { setViewMode("summary"); localStorage.setItem("timelens_view_timeline", "summary"); }}
            >
              {t("timeline.summaryView")}
            </button>
            <button
              type="button"
              className={`rounded px-2 py-1 text-[0.65rem] transition-colors ${viewMode === "full" ? "bg-[var(--tl-accent-12)] text-[var(--tl-ink)]" : "text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"}`}
              onClick={() => { setViewMode("full"); localStorage.setItem("timelens_view_timeline", "full"); }}
            >
              {t("timeline.fullView")}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--tl-muted)]">{t("timeline.loading")}</p>
        ) : sessions.length === 0 ? (
          <p className="text-center text-sm text-[var(--tl-muted)]">{t("timeline.noSessions")}</p>
        ) : viewMode === "summary" ? (
          <div className="space-y-2" role="list">
            {summaryBlocks.map((b) => {
              const { bucket, label: intentLabel } = intentVisual(b.intent);
              const intentCls =
                bucket === "a" ? "tl-p3-intent-a" : bucket === "b" ? "tl-p3-intent-b" : bucket === "c" ? "tl-p3-intent-c" : "tl-p3-intent-d";
              const isExpanded = expandedBlocks.has(b.id);
              const blockSessions = isExpanded ? getBlockSessions(b) : [];
              const status = statusLabel(b);
              return (
                <article key={b.id} role="listitem">
                  <button
                    type="button"
                    className="tl-interactive-row flex w-full items-start gap-3 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-surface)] px-4 py-3 text-left transition-colors hover:bg-[var(--tl-nav-hover-bg)]"
                    onClick={() => toggleBlock(b.id)}
                  >
                    <div className="flex shrink-0 flex-col items-center pt-0.5">
                      <span className="text-[0.78rem] font-semibold tabular-nums text-[var(--tl-ink)]">{fmtTime(b.startMs)}</span>
                      <span className="text-[0.6rem] text-[var(--tl-muted)]">{fmtTime(b.endMs)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--tl-accent-06)] text-[0.6rem] font-bold text-[var(--tl-cyan)]">
                          {appIconLabel(b.primaryApp.split(" + ")[0])}
                        </span>
                        <span className="text-[0.85rem] font-semibold text-[var(--tl-ink)]">{b.primaryApp}</span>
                        <span className="text-[0.68rem] font-medium text-[var(--tl-cyan)]">{formatDurationShortMs(b.totalDurationMs)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[0.58rem] font-semibold ${intentCls}`}>{intentLabel}</span>
                        <span className="rounded bg-[var(--tl-surface-deep)] px-1.5 py-0.5 text-[0.58rem] text-[var(--tl-muted)]">{status}</span>
                        {b.secondaryApps.length > 0 && (
                          <span className="text-[0.62rem] text-[var(--tl-muted)]">{t("timeline.alsoUsed")} {b.secondaryApps.join("、")}</span>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 pt-1 text-[0.7rem] text-[var(--tl-muted)] transition-transform" style={{ transform: isExpanded ? "rotate(90deg)" : "none" }}>
                      ▸
                    </span>
                  </button>
                  {isExpanded && blockSessions.length > 0 && (
                    <div className="ml-6 mt-1 space-y-0.5 border-l-2 border-[var(--tl-line)] pl-4 pb-2">
                      {blockSessions.map((s) => {
                        const sv = intentVisual(s.intent);
                        const sCls = sv.bucket === "a" ? "tl-p3-intent-a" : sv.bucket === "b" ? "tl-p3-intent-b" : sv.bucket === "c" ? "tl-p3-intent-c" : "tl-p3-intent-d";
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setPick(s); }}
                            className="tl-interactive-row flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-[var(--tl-surface)]"
                          >
                            <span className="w-12 shrink-0 text-[0.68rem] tabular-nums text-[var(--tl-muted)]">{fmtTime(s.startMs)}</span>
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--tl-accent-06)] text-[0.5rem] font-bold text-[var(--tl-muted)]">
                              {appIconLabel(s.appName)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[0.75rem] text-[var(--tl-ink)]">
                              <strong className="font-medium">{s.appName}</strong>
                              {s.windowTitle && <span className="ml-1.5 text-[var(--tl-muted)]">{s.windowTitle}</span>}
                            </span>
                            <span className="shrink-0 text-[0.62rem] tabular-nums text-[var(--tl-muted)]">{formatDurationShortMs(s.durationMs)}</span>
                            <span className={`shrink-0 rounded px-1 py-0.5 text-[0.5rem] font-semibold ${sCls}`}>{sv.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : viewMode === "full" ? (
          <div className="tl-p3-tl" role="list">
            {reversedSessions.map((s) => {
              const { bucket, label: intentLabel } = intentVisual(s.intent);
              const intentCls =
                bucket === "a" ? "tl-p3-intent-a" : bucket === "b" ? "tl-p3-intent-b" : bucket === "c" ? "tl-p3-intent-c" : "tl-p3-intent-d";
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
                        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--tl-accent-06)] text-[0.65rem] font-bold text-[var(--tl-muted)]">
                          {appIconLabel(s.appName)}
                        </span>
                        {s.appName}
                      </span>
                      <span className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.06em] ${intentCls}`}>
                        {intentLabel}
                      </span>
                    </div>
                    <p className="text-[0.74rem] leading-snug text-[var(--tl-muted)] [word-break:break-word]">
                      {s.windowTitle || t("timeline.noWindowTitle")}
                    </p>
                  </button>
                </article>
              );
            })}
          </div>
        ) : null}

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
