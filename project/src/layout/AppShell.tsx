import { useCallback, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAppStore } from "../stores/appStore";
import { useDevModeStore } from "../stores/devModeStore";
import { ListenerDebugPanel } from "../components/ListenerDebugPanel";
import * as api from "../services/tauri";

const MAIN_NAV = [
  { to: "/lens", label: "今日透视", icon: "◉" },
  { to: "/timeline", label: "时间线", icon: "≡" },
  { to: "/report", label: "日报告", icon: "¶" },
  { to: "/intents", label: "应用分组", icon: "⌗" },
  { to: "/settings", label: "设置", icon: "⚙" },
] as const;

const DEV_NAV = [
  { to: "/recap", label: "复盘（旧入口）" },
  { to: "/sessions", label: "会话" },
  { to: "/ocr", label: "OCR 检索" },
  { to: "/ocr-eval", label: "OCR 评估" },
  { to: "/health", label: "健康" },
] as const;

function titleForPath(pathname: string): { title: string; sub?: string } {
  if (pathname.startsWith("/lens")) return { title: "今日透视", sub: "结构 · 管线 · 当日摘要" };
  if (pathname.startsWith("/timeline")) return { title: "时间线", sub: "按时段核对会话" };
  if (pathname.startsWith("/report")) return { title: "日报告", sub: "事实层 / AI 增强" };
  if (pathname.startsWith("/settings")) return { title: "设置", sub: "权限 · 引擎 · OCR · AI" };
  if (pathname.startsWith("/recap")) return { title: "复盘（旧入口）", sub: "开发工具" };
  if (pathname.startsWith("/sessions")) return { title: "会话", sub: "开发工具 · 会话与截图" };
  if (pathname.startsWith("/ocr-eval")) return { title: "OCR 评估", sub: "开发工具" };
  if (pathname.startsWith("/ocr")) return { title: "OCR 检索", sub: "开发工具" };
  if (pathname.startsWith("/intents")) return { title: "应用分组", sub: "批量管理 · 内置建议" };
  if (pathname.startsWith("/health")) return { title: "健康", sub: "开发工具" };
  return { title: "TimeLens" };
}

function navCls(active: boolean): string {
  return [
    "tl-nav-item tl-interactive-row flex w-full items-center gap-2 rounded-lg border-0 px-2.5 py-2 text-left text-sm font-medium transition-colors",
    active
      ? "tl-nav-active bg-[var(--tl-nav-active-bg)] text-[var(--tl-ink)]"
      : "text-[var(--tl-muted)] hover:bg-[var(--tl-nav-hover-bg)] hover:text-[var(--tl-ink)]",
  ].join(" ");
}

export default function AppShell() {
  const location = useLocation();
  const { title, sub } = titleForPath(location.pathname);
  const date = useAppStore((s) => s.date);
  const setDate = useAppStore((s) => s.setDate);
  const isTracking = useAppStore((s) => s.isTracking);
  const devEnabled = useDevModeStore((s) => s.enabled);
  const [captureBusy, setCaptureBusy] = useState(false);

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
          aria-label="主导航"
        >
          <div className="border-b border-[var(--tl-line)] px-4 py-3">
            <div className="font-mono text-[0.68rem] font-extrabold uppercase tracking-[0.2em] text-[var(--tl-cyan)]">
              TIMELENS
            </div>
            <div className="mt-1 font-mono text-[0.58rem] tracking-wide text-[var(--tl-muted)]">
              INSIGHT ENGINE
            </div>
          </div>
          <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2 pb-4" aria-label="功能模块">
            <div className="px-2 py-2 font-mono text-[0.58rem] font-semibold uppercase tracking-widest text-[var(--tl-muted)]">
              功能
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
                  开发工具 <span className="text-[var(--tl-purple)]">Dev</span>
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
                title={isTracking ? "点击停止采集" : "点击开始采集"}
                className={[
                  "tl-interactive-row flex min-w-[9.5rem] flex-col items-stretch rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50",
                  isTracking
                    ? "border-[var(--tl-capture-on-border)] bg-[var(--tl-capture-on-bg)] hover:bg-[var(--tl-capture-on-hover)]"
                    : "border-[var(--tl-capture-idle-border)] bg-[var(--tl-capture-idle-bg)] hover:bg-[var(--tl-capture-idle-hover)]",
                ].join(" ")}
              >
                <span className="font-mono text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-[var(--tl-muted)]">
                  采集状态
                </span>
                <span
                  className={[
                    "mt-0.5 text-sm font-semibold",
                    isTracking ? "text-[var(--tl-tracking-on-text)]" : "text-[var(--tl-muted)]",
                  ].join(" ")}
                >
                  {captureBusy ? "…" : isTracking ? "采集中" : "停止采集"}
                </span>
              </button>
              <label className="flex items-center gap-2 font-mono text-xs text-[var(--tl-muted)]">
                日期
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-2 py-1.5 text-[var(--tl-ink)]"
                />
              </label>
            </div>
          </header>
          {devEnabled ? (
            <div className="border-b border-[var(--tl-line)] px-5 py-2">
              <ListenerDebugPanel />
            </div>
          ) : null}
          <main className="min-h-0 flex-1 overflow-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
