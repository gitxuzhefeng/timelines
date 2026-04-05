import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Snapshot, WindowSession } from "../types";
import { snapshotTimelensUrl } from "../types";
import {
  DAYPART_ORDER,
  daypartFromStartMs,
  formatDurationMs,
  zhDateLabel,
  type Daypart,
} from "../lib/phase3Format";
import * as api from "../services/tauri";
import { useAppStore } from "../stores/appStore";

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TimelinePage() {
  const navigate = useNavigate();
  const date = useAppStore((s) => s.date);
  const [sessions, setSessions] = useState<WindowSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState<WindowSession | null>(null);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [snapPick, setSnapPick] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
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

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

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
    <div className="relative h-full overflow-y-auto p-5">
      {lightbox ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="截图大图"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-lg bg-zinc-800 px-3 py-1 text-sm text-zinc-200"
            onClick={() => setLightbox(null)}
          >
            关闭
          </button>
          <img
            src={lightbox}
            alt="snapshot"
            className="max-h-[92vh] max-w-full object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}

      <div className="mb-4 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-4">
        <p className="font-mono text-sm text-[var(--tl-cyan-dim)]">{zhDateLabel(date)}</p>
        {loading ? (
          <p className="mt-2 text-sm text-[var(--tl-muted)]">加载会话…</p>
        ) : (
          <p className="mt-1 text-sm text-[var(--tl-muted)]">共 {sessions.length} 条会话</p>
        )}
        <button
          type="button"
          className="mt-3 rounded-lg border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-cyan)] hover:bg-[rgba(0,245,212,0.08)]"
          onClick={() => navigate("/report")}
        >
          查看日报告 →
        </button>
      </div>

      {DAYPART_ORDER.map(({ key, label }) => {
        const list = byPart[key];
        if (list.length === 0) return null;
        return (
          <section key={key} className="mb-6">
            <h2 className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-[var(--tl-muted)]">
              {label}
            </h2>
            <ul className="space-y-2">
              {list.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setPick(s)}
                    className="w-full rounded-xl border border-[var(--tl-line)] bg-[rgba(14,16,24,0.65)] px-3 py-2.5 text-left transition-colors hover:border-[rgba(0,245,212,0.25)]"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-[var(--tl-ink)]">{s.appName}</span>
                      <span className="font-mono text-xs text-[var(--tl-muted)]">
                        {fmtTime(s.startMs)} · {formatDurationMs(s.durationMs)}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-[var(--tl-muted)]">{s.windowTitle}</p>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {!loading && sessions.length === 0 && (
        <p className="text-center text-sm text-[var(--tl-muted)]">当日暂无会话记录</p>
      )}

      {pick ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 p-2 md:p-4" role="presentation">
          <button
            type="button"
            className="absolute inset-0 cursor-default border-0 bg-transparent"
            aria-label="关闭"
            onClick={() => setPick(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tl-sheet-title"
            className="relative z-10 flex h-full w-full max-w-lg flex-col rounded-xl border border-[var(--tl-line)] bg-[#0e1018] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--tl-line)] px-4 py-3">
              <h2 id="tl-sheet-title" className="text-base font-semibold">
                会话详情
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
                  Intent: <span className="text-[var(--tl-cyan)]">{pick.intent}</span>
                </p>
              )}
              <p className="mt-4 text-xs font-medium uppercase tracking-wide text-[var(--tl-muted)]">
                截图
              </p>
              <div className="mt-2 flex min-h-[160px] items-center justify-center rounded-lg border border-[var(--tl-line)] bg-black/30 p-2">
                {selectedSnap?.filePath ? (
                  <button
                    type="button"
                    className="max-h-[200px] max-w-full border-0 bg-transparent p-0"
                    onClick={() => setLightbox(snapshotTimelensUrl(selectedSnap.id))}
                  >
                    <img
                      src={snapshotTimelensUrl(selectedSnap.id)}
                      alt=""
                      className="max-h-[200px] max-w-full rounded object-contain"
                    />
                  </button>
                ) : (
                  <span className="text-sm text-[var(--tl-muted)]">无截图</span>
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
                        className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs ${
                          sn.id === snapPick ? "bg-[rgba(0,245,212,0.1)]" : "hover:bg-white/5"
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
