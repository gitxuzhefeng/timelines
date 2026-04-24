import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/appStore";
import { useDevModeStore } from "../stores/devModeStore";
import { useAssistantSidebarStore } from "../stores/assistantSidebarStore";
import { useThemeStore, type UiTheme } from "../stores/themeStore";
import { setLanguage, type SupportedLanguage } from "../i18n";
import * as api from "../services/tauri";
import { AiTaskBanner } from "../components/AiTaskBanner";
import { AssistantSidebar } from "../components/assistant/AssistantSidebar";

const AUTO_REFRESH_PATHS = ["/lens", "/timeline"];
const REFRESH_DEBOUNCE_MS = 30_000;
function navCls(active: boolean): string {
  return [
    "tl-nav-item tl-interactive-row flex w-full items-center gap-2 rounded-lg border-0 px-2.5 py-2 text-left text-sm font-medium transition-colors",
    active
      ? "tl-nav-active bg-[var(--tl-nav-active-bg)] text-[var(--tl-ink)]"
      : "text-[var(--tl-muted)] hover:bg-[var(--tl-nav-hover-bg)] hover:text-[var(--tl-ink)]",
  ].join(" ");
}

export default function AppShell() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const date = useAppStore((s) => s.date);
  const setDate = useAppStore((s) => s.setDate);
  const isTracking = useAppStore((s) => s.isTracking);
  const devEnabled = useDevModeStore((s) => s.enabled);
  const updateAvailable = useAppStore((s) => s.updateAvailable);
  const [captureBusy, setCaptureBusy] = useState(false);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [currentLang, setCurrentLang] = useState<SupportedLanguage>(
    () => (i18n.language === "zh-CN" ? "zh-CN" : "en"),
  );
  const [refreshing, setRefreshing] = useState(false);
  const lastRefreshRef = useRef(0);
  const sidebarOpen = useAssistantSidebarStore((s) => s.isOpen);
  const toggleSidebar = useAssistantSidebarStore((s) => s.toggle);

  useEffect(() => {
    const shouldRefresh = AUTO_REFRESH_PATHS.some((p) => location.pathname.startsWith(p));
    if (!shouldRefresh) return;
    const now = Date.now();
    if (now - lastRefreshRef.current < REFRESH_DEBOUNCE_MS) return;
    lastRefreshRef.current = now;
    setRefreshing(true);
    useAppStore.getState().refreshSessions().finally(() => setRefreshing(false));
  }, [location.pathname]);

  useEffect(() => {
    const onFocus = () => {
      const path = window.location.pathname;
      const shouldRefresh = AUTO_REFRESH_PATHS.some((p) => path.startsWith(p));
      if (!shouldRefresh) return;
      const now = Date.now();
      if (now - lastRefreshRef.current < REFRESH_DEBOUNCE_MS) return;
      lastRefreshRef.current = now;
      setRefreshing(true);
      useAppStore.getState().refreshSessions().finally(() => setRefreshing(false));
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const MAIN_NAV = [
    { to: "/lens", label: t("nav.todayLens"), icon: "◉" },
    { to: "/timeline", label: t("nav.timeline"), icon: "≡" },
    { to: "/report", label: t("nav.dailyReport"), icon: "¶" },
    { to: "/weekly", label: t("nav.weeklyReport"), icon: "⊞" },
    { to: "/assistant", label: t("nav.assistant"), icon: "✦" },
    { to: "/intents", label: t("nav.intents"), icon: "⌗" },
    { to: "/settings", label: t("nav.settings"), icon: "⚙" },
    { to: "/about", label: t("nav.about"), icon: "ℹ" },
  ] as const;

  const DEV_NAV = [
    { to: "/sessions", label: t("nav.sessions") },
    { to: "/ocr", label: t("nav.ocrSearch") },
    { to: "/ocr-eval", label: t("nav.ocrEval") },
    { to: "/health", label: t("nav.health") },
  ] as const;

  function titleForPath(pathname: string): { title: string; sub?: string } {
    if (pathname.startsWith("/lens")) return { title: t("nav.todayLens"), sub: t("nav.todayLensDesc") };
    if (pathname.startsWith("/timeline")) return { title: t("nav.timeline"), sub: t("nav.timelineDesc") };
    if (pathname.startsWith("/report")) return { title: t("nav.dailyReport"), sub: t("nav.dailyReportDesc") };
    if (pathname.startsWith("/weekly")) return { title: t("nav.weeklyReport"), sub: t("nav.weeklyReportDesc") };
    if (pathname.startsWith("/assistant")) return { title: t("nav.assistant"), sub: t("nav.assistantDesc") };
    if (pathname.startsWith("/settings")) return { title: t("nav.settings"), sub: t("nav.settingsDesc") };
    if (pathname.startsWith("/sessions")) return { title: t("nav.sessions"), sub: t("nav.sessionsDesc") };
    if (pathname.startsWith("/ocr-eval")) return { title: t("nav.ocrEval"), sub: t("nav.devTools") };
    if (pathname.startsWith("/ocr")) return { title: t("nav.ocrSearch"), sub: t("nav.ocrSearchDesc") };
    if (pathname.startsWith("/intents")) return { title: t("nav.intents"), sub: t("nav.intentsDesc") };
    if (pathname.startsWith("/health")) return { title: t("nav.health"), sub: t("nav.devTools") };
    if (pathname.startsWith("/about")) return { title: t("nav.about"), sub: t("nav.aboutDesc") };
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
            {MAIN_NAV.map(({ to, label, icon }) =>
              to === "/assistant" ? (
                <button
                  key={to}
                  type="button"
                  onClick={toggleSidebar}
                  className={navCls(sidebarOpen)}
                >
                  <span className={`w-5 text-center ${sidebarOpen ? "text-[var(--tl-cyan)]" : "text-[var(--tl-cyan-dim)]"}`}>
                    {icon}
                  </span>
                  <span className="flex-1">{label}</span>
                </button>
              ) : (
              <NavLink key={to} to={to} className={({ isActive }) => navCls(isActive)}>
                {({ isActive }) => (
                  <>
                    <span
                      className={`w-5 text-center ${isActive ? "text-[var(--tl-cyan)]" : "text-[var(--tl-cyan-dim)]"}`}
                    >
                      {icon}
                    </span>
                    <span className="flex-1">{label}</span>
                    {to === "/about" && updateAvailable && (
                      <span className="ml-auto h-2 w-2 rounded-full bg-[var(--tl-status-bad)]" />
                    )}
                  </>
                )}
              </NavLink>
              )
            )}
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
          {refreshing && (
            <div className="h-0.5 w-full overflow-hidden bg-[var(--tl-line)]">
              <div className="h-full w-1/3 animate-pulse rounded bg-[var(--tl-cyan)]" style={{ animation: "tl-slide 1s ease-in-out infinite" }} />
            </div>
          )}
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
              <div className="flex flex-col gap-0.5 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-1.5 py-1">
                <div className="flex items-center gap-1">
                  <span className="text-[0.55rem] text-[var(--tl-muted)]">☀</span>
                  {([
                    ["white", "#0d9488"],
                    ["claude", "#c96442"],
                    ["cursor", "#f54e00"],
                    ["catppuccin", "#1e66f5"],
                    ["rosepine", "#286983"],
                    ["gruvbox-light", "#076678"],
                  ] as [UiTheme, string][]).map(([id, color]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTheme(id)}
                      className={`rounded-full p-0.5 transition-opacity ${theme === id ? "ring-1 ring-[var(--tl-ink)] ring-offset-1 ring-offset-[var(--tl-bg)]" : "opacity-50 hover:opacity-100"}`}
                      title={t(`settings.theme${id.replace(/-./g, c => c[1].toUpperCase()).replace(/^./, c => c.toUpperCase())}` as any)}
                    >
                      <span className="block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[0.55rem] text-[var(--tl-muted)]">☾</span>
                  {([
                    ["tech", "#00f5d4"],
                    ["raycast", "#FF6363"],
                    ["spotify", "#1ed760"],
                    ["linear", "#5e6ad2"],
                    ["dracula", "#bd93f9"],
                    ["nord", "#88c0d0"],
                    ["tokyo-night", "#7aa2f7"],
                    ["gruvbox-dark", "#83a598"],
                    ["one-dark", "#61afef"],
                  ] as [UiTheme, string][]).map(([id, color]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTheme(id)}
                      className={`rounded-full p-0.5 transition-opacity ${theme === id ? "ring-1 ring-[var(--tl-ink)] ring-offset-1 ring-offset-[var(--tl-bg)]" : "opacity-50 hover:opacity-100"}`}
                      title={t(`settings.theme${id.replace(/-./g, c => c[1].toUpperCase()).replace(/^./, c => c.toUpperCase())}` as any)}
                    >
                      <span className="block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-1 py-1">
                {(["zh-CN", "en"] as SupportedLanguage[]).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => { setLanguage(lang); setCurrentLang(lang); }}
                    className={`rounded px-2 py-1 text-[0.65rem] transition-colors ${currentLang === lang ? "bg-[var(--tl-accent-12)] text-[var(--tl-ink)]" : "text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"}`}
                  >
                    {lang === "zh-CN" ? "中文" : "EN"}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 font-mono text-xs text-[var(--tl-muted)]">
                {t("common.date")}
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-2 py-1.5 text-[var(--tl-ink)]"
                />
              </label>
              <button
                type="button"
                onClick={toggleSidebar}
                title={t("assistant.toggleSidebar")}
                className={`rounded-lg border px-2.5 py-1.5 font-mono text-sm transition-colors ${sidebarOpen ? "border-[var(--tl-cyan)] bg-[var(--tl-accent-15)] text-[var(--tl-cyan)]" : "border-[var(--tl-line)] text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"}`}
              >
                ✦
              </button>
            </div>
          </header>
          <div className="flex min-h-0 flex-1">
            <main className="min-h-0 flex-1 overflow-hidden">
              <Outlet />
            </main>
            {sidebarOpen && <AssistantSidebar />}
          </div>
          <AiTaskBanner />
        </div>
      </div>
    </div>
  );
}
