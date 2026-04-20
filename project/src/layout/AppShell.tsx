import { useCallback, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/appStore";
import { useDevModeStore } from "../stores/devModeStore";
import * as api from "../services/tauri";

function navCls(active: boolean): string {
  return [
    "tl-nav-item tl-interactive-row flex w-full items-center gap-2 rounded-lg border-0 px-2.5 py-2 text-left text-sm font-medium transition-colors",
    active
      ? "tl-nav-active bg-[var(--tl-nav-active-bg)] text-[var(--tl-ink)]"
      : "text-[var(--tl-muted)] hover:bg-[var(--tl-nav-hover-bg)] hover:text-[var(--tl-ink)]",
  ].join(" ");
}

export default function AppShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const date = useAppStore((s) => s.date);
  const setDate = useAppStore((s) => s.setDate);
  const isTracking = useAppStore((s) => s.isTracking);
  const devEnabled = useDevModeStore((s) => s.enabled);
  const [captureBusy, setCaptureBusy] = useState(false);

  const MAIN_NAV = [
    { to: "/lens", label: t("nav.todayLens"), icon: "◉" },
    { to: "/timeline", label: t("nav.timeline"), icon: "≡" },
    { to: "/report", label: t("nav.dailyReport"), icon: "¶" },
    { to: "/intents", label: t("nav.intents"), icon: "⌗" },
    { to: "/settings", label: t("nav.settings"), icon: "⚙" },
  ] as const;

  const DEV_NAV = [
    { to: "/recap", label: t("nav.recap") },
    { to: "/sessions", label: t("nav.sessions") },
    { to: "/ocr", label: t("nav.ocrSearch") },
    { to: "/ocr-eval", label: t("nav.ocrEval") },
    { to: "/health", label: t("nav.health") },
  ] as const;

  function titleForPath(pathname: string): { title: string; sub?: string } {
    if (pathname.startsWith("/lens")) return { title: t("nav.todayLens"), sub: t("nav.todayLensDesc") };
    if (pathname.startsWith("/timeline")) return { title: t("nav.timeline"), sub: t("nav.timelineDesc") };
    if (pathname.startsWith("/report")) return { title: t("nav.dailyReport"), sub: t("nav.dailyReportDesc") };
    if (pathname.startsWith("/settings")) return { title: t("nav.settings"), sub: t("nav.settingsDesc") };
    if (pathname.startsWith("/recap")) return { title: t("nav.recap"), sub: t("nav.devTools") };
    if (pathname.startsWith("/sessions")) return { title: t("nav.sessions"), sub: t("nav.sessionsDesc") };
    if (pathname.startsWith("/ocr-eval")) return { title: t("nav.ocrEval"), sub: t("nav.devTools") };
    if (pathname.startsWith("/ocr")) return { title: t("nav.ocrSearch"), sub: t("nav.devTools") };
    if (pathname.startsWith("/intents")) return { title: t("nav.intents"), sub: t("nav.intentsDesc") };
    if (pathname.startsWith("/health")) return { title: t("nav.health"), sub: t("nav.devTools") };
    return { title: "TimeLens" };
  }

  const { title, sub } = titleForPath(location.pathname);

  const toggleCapture = useCallback(async () => {
    if (captureBusy) return;
    setCaptureBusy(true);
    try {
      if (isTracking) await api.stopTracking();
      else await api.startTracking();
    } catch (e) {
      useAppStore.setState({ error: String(e) });
    } finally {
      setCaptureBusy(false);
    }
  }, [captureBusy, isTracking]);

  return (
    <div className="tl-app flex h-screen min-h-0 flex-col bg-[var(--tl-bg)] text-[var(--tl-ink)]">
      <div className="tl-shell mx-auto flex min-h-0 w-full max-w-[1320px] flex-1">
        <aside
          className="tl-sidebar tl-shell-blur-surface flex w-[min(278px,100%)] shrink-0 flex-col border-r border-[var(--tl-line)] bg-[var(--tl-sidebar-bg)] backdrop-blur-md"
          aria-label={t("nav.mainNav")}
        >
          <div className="border-b border-[var(--tl-line)] px-4 py-3">
            <div className="font-mono text-[0.68rem] font-extrabold uppercase tracking-[0.2em] text-[var(--tl-cyan)]">
              TIMELENS
            </div>
            <div className="mt-1 font-mono text-[0.58rem] tracking-wide text-[var(--tl-muted)]">
              INSIGHT ENGINE
            </div>
          </div>
          <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2 pb-4" aria-label={t("nav.featureModules")}>
            <div className="px-2 py-2 font-mono text-[0.58rem] font-semibold uppercase tracking-widest text-[var(--tl-muted)]">
              {t("nav.features")}
            </div>
            {MAIN_NAV.map(({ to, label, icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => navCls(isActive)}>
                {({ isActive }) => (
                  <>
                    <span
                      className={`w-5 text-center ${isActive ? "text-[var(--tl-cyan)]" : "text-[var(--tl-cyan-dim)]"}`}
                    >
                      {icon}
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            ))}
            {devEnabled && (
              <>
                <div className="mt-3 px-2 py-2 font-mono text-[0.58rem] font-semibold uppercase tracking-widest text-[var(--tl-muted)]">
                  {t("nav.devTools")} <span className="text-[var(--tl-purple)]">Dev</span>
                </div>
                {DEV_NAV.map(({ to, label }) => (
                  <NavLink key={to} to={to} className={({ isActive }) => navCls(isActive)}>
                    <span className="w-5 text-center opacity-60">›</span>
                    {label}
                  </NavLink>
                ))}
              </>
            )}
          </nav>
        </aside>

        <div className="flex min-w-0 min-h-0 flex-1 flex-col bg-gradient-to-b from-[var(--tl-shell-gradient-from)] to-[var(--tl-bg)]">
          <header className="tl-shell-blur-surface flex flex-wrap items-center justify-between gap-3 border-b border-[var(--tl-line)] bg-[var(--tl-header-bg)] px-5 py-3 backdrop-blur-md">
            <div className="min-w-0 flex-1">
              <h1 className="text-[1.05rem] font-bold tracking-wide">{title}</h1>
              {sub ? (
                <p className="mt-0.5 font-mono text-[0.72rem] text-[var(--tl-muted)]">{sub}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => void toggleCapture()}
                disabled={captureBusy}
                aria-pressed={isTracking}
                title={isTracking ? t("nav.clickToStop") : t("nav.clickToStart")}
                className={[
                  "tl-interactive-row flex min-w-[9.5rem] flex-col items-stretch rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50",
                  isTracking
                    ? "border-[var(--tl-capture-on-border)] bg-[var(--tl-capture-on-bg)] hover:bg-[var(--tl-capture-on-hover)]"
                    : "border-[var(--tl-capture-idle-border)] bg-[var(--tl-capture-idle-bg)] hover:bg-[var(--tl-capture-idle-hover)]",
                ].join(" ")}
              >
                <span className="font-mono text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-[var(--tl-muted)]">
                  {t("nav.captureStatus")}
                </span>
                <span
                  className={[
                    "mt-0.5 text-sm font-semibold",
                    isTracking ? "text-[var(--tl-tracking-on-text)]" : "text-[var(--tl-muted)]",
                  ].join(" ")}
                >
                  {captureBusy ? "…" : isTracking ? t("nav.capturing") : t("nav.stopCapture")}
                </span>
              </button>
              <label className="flex items-center gap-2 font-mono text-xs text-[var(--tl-muted)]">
                {t("common.date")}
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-2 py-1.5 text-[var(--tl-ink)]"
                />
              </label>
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
