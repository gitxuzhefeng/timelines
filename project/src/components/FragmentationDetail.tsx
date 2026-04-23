import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/appStore";
import type { AppSwitch } from "../services/tauri";

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function appLabel(name: string): string {
  const t = name.trim();
  if (!t || t === "—") return "—";
  if (/[一-鿿]/.test(t)) return t.slice(0, 1);
  return t.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || t.slice(0, 2);
}

interface AppStat {
  app: string;
  count: number;
  totalDurationMs: number;
}

function aggregateApps(switches: AppSwitch[]): AppStat[] {
  const m = new Map<string, { count: number; dur: number }>();
  for (const s of switches) {
    const e = m.get(s.fromApp) ?? { count: 0, dur: 0 };
    e.count += 1;
    e.dur += s.fromSessionDurationMs;
    m.set(s.fromApp, e);
  }
  return [...m.entries()]
    .map(([app, { count, dur }]) => ({ app, count, totalDurationMs: dur }))
    .sort((a, b) => b.count - a.count);
}

export default function FragmentationDetail() {
  const { t } = useTranslation();
  const alert = useAppStore((s) => s.fragmentationAlert);
  const clear = useAppStore((s) => s.setFragmentationAlert);

  const appStats = useMemo(() => {
    if (!alert) return [];
    return aggregateApps(alert.switches);
  }, [alert]);

  const maxCount = useMemo(() => Math.max(...appStats.map((a) => a.count), 1), [appStats]);

  if (!alert) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[var(--tl-overlay-strong)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("fragmentation.title")}
    >
      <div
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-[var(--tl-line)] bg-[var(--tl-sheet-bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--tl-line)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--tl-ink)]">
              {t("fragmentation.title")}
            </h2>
            <p className="mt-0.5 text-[0.72rem] text-[var(--tl-muted)]">
              {t("fragmentation.subtitle", {
                count: alert.switchCount,
                minutes: alert.windowMin,
              })}
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-xl leading-none text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"
            onClick={() => clear(null)}
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* App distribution */}
          <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[var(--tl-muted)]">
            {t("fragmentation.appDistribution")}
          </p>
          <div className="mb-5 space-y-1.5">
            {appStats.slice(0, 8).map((a) => (
              <div key={a.app} className="flex items-center gap-2">
                <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[0.6rem] font-bold text-[var(--tl-muted)]">
                  {appLabel(a.app)}
                </span>
                <span className="w-24 truncate text-[0.75rem] font-medium text-[var(--tl-ink)]">
                  {a.app}
                </span>
                <div className="flex-1">
                  <div
                    className="h-2 rounded bg-[var(--tl-p3-c-a)] opacity-80"
                    style={{ width: `${Math.max((a.count / maxCount) * 100, 4)}%` }}
                  />
                </div>
                <span className="w-8 text-right font-mono text-[0.65rem] text-[var(--tl-muted)]">
                  {a.count}
                </span>
              </div>
            ))}
          </div>

          {/* Switch timeline */}
          <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[var(--tl-muted)]">
            {t("fragmentation.switchTimeline")}
          </p>
          <div className="space-y-1">
            {alert.switches.slice(0, 50).map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[0.72rem] hover:bg-white/[0.03]"
              >
                <span className="w-16 shrink-0 font-mono text-[0.65rem] text-[var(--tl-muted)]">
                  {fmtTime(s.timestampMs)}
                </span>
                <span className="truncate font-medium text-[var(--tl-ink)]">
                  {s.fromApp}
                </span>
                <span className="shrink-0 text-[var(--tl-muted)]">→</span>
                <span className="truncate font-medium text-[var(--tl-ink)]">
                  {s.toApp}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--tl-line)] px-5 py-3 text-center">
          <button
            type="button"
            className="rounded-lg bg-[var(--tl-p3-accent)] px-5 py-2 text-[0.78rem] font-semibold text-white hover:opacity-90"
            onClick={() => clear(null)}
          >
            {t("fragmentation.dismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}
