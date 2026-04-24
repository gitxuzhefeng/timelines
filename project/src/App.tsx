import { useEffect, useLayoutEffect, useRef } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTranslation } from "react-i18next";
import AppShell from "./layout/AppShell";
import { useAppStore } from "./stores/appStore";
import { useThemeStore } from "./stores/themeStore";
import * as api from "./services/tauri";
import HealthPage from "./pages/HealthPage";
import RecapPage from "./pages/RecapPage";
import SessionsPage from "./pages/SessionsPage";
import OcrSearchPage from "./pages/OcrSearchPage";
import OcrEvalPage from "./pages/OcrEvalPage";
import IntentManagePage from "./pages/IntentManagePage";
import TodayLensPage from "./pages/TodayLensPage";
import TimelinePage from "./pages/TimelinePage";
import DailyReportPage from "./pages/DailyReportPage";
import SettingsShellPage from "./pages/SettingsShellPage";
import AboutPage from "./pages/AboutPage";
import WeeklyReportPage from "./pages/WeeklyReportPage";
import AssistantPage from "./pages/AssistantPage";
import FragmentationDetail from "./components/FragmentationDetail";
import UpdateNotice from "./components/UpdateNotice";
import { detectClientDesktopOs } from "./lib/platform";

export default function App() {
  const theme = useThemeStore((s) => s.theme);
  const refreshAll = useAppStore((s) => s.refreshAll);
  const setTracking = useAppStore((s) => s.setTracking);
  const setPermissions = useAppStore((s) => s.setPermissions);
  const setAfk = useAppStore((s) => s.setAfk);
  const setWriterStats = useAppStore((s) => s.setWriterStats);
  const { i18n } = useTranslation();
  const fragmentationNotificationRef = useRef<Notification | null>(null);

  useLayoutEffect(() => {
    if (theme === "tech") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    const os = detectClientDesktopOs();
    document.documentElement.setAttribute("data-os", os);
    if (os === "windows") {
      document.documentElement.setAttribute("data-win-perf", "on");
    } else {
      document.documentElement.removeAttribute("data-win-perf");
    }
  }, []);

  // 从后端读取持久化语言偏好，覆盖浏览器自动检测结果
  useEffect(() => {
    api.getLanguage().then((lang) => {
      if (lang && lang !== i18n.language) {
        void i18n.changeLanguage(lang);
      }
    }).catch(() => {/* 后端未就绪时静默忽略，保持浏览器检测结果 */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 启动时静默检查更新，有新版本时弹窗提醒
  useEffect(() => {
    api.checkForUpdate().then((r) => {
      useAppStore.getState().setUpdateCheckResult(r);
    }).catch(() => {/* 网络不可用时静默忽略 */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refreshAll();
    const unsubs: Array<() => void> = [];
    let sessionsRefreshTimer: ReturnType<typeof window.setTimeout> | null = null;
    const scheduleSessionsRefresh = () => {
      if (sessionsRefreshTimer != null) return;
      // 合并短时间内重复刷新，降低 Windows 下高频 UI 抖动。
      sessionsRefreshTimer = window.setTimeout(() => {
        sessionsRefreshTimer = null;
        void useAppStore.getState().refreshSessions();
      }, 180);
    };
    const reg = async () => {
      unsubs.push(
        await api.listenEvent("window_event_updated", () => {
          scheduleSessionsRefresh();
        }),
      );
      unsubs.push(
        await api.listenEvent("new_snapshot_saved", () => {
          scheduleSessionsRefresh();
          const sid = useAppStore.getState().selectedSessionId;
          if (sid) void useAppStore.getState().selectSession(sid);
        }),
      );
      unsubs.push(
        await api.listenEvent("tracking_state_changed", (p) => {
          setTracking(p.isRunning);
        }),
      );
      unsubs.push(
        await api.listenEvent("permissions_required", (p) => {
          setPermissions(p);
        }),
      );
      unsubs.push(
        await api.listenEvent("afk_state_changed", (p) => {
          setAfk(p.isAfk);
        }),
      );
      unsubs.push(
        await api.listenEvent("app_switch_recorded", () => {
          scheduleSessionsRefresh();
        }),
      );
      unsubs.push(
        await api.listenEvent("writer_stats_updated", (w) => {
          setWriterStats(w);
        }),
      );
      unsubs.push(
        await api.listenEvent("nudge_fragmentation", (p) => {
          const protectUntil = useAppStore.getState().fragmentationProtectUntilMs;
          if (protectUntil && Date.now() < protectUntil) return;
          api.getRecentAppSwitches(p.windowMin).then(async (switches) => {
            const alert = {
              switchCount: p.switchCount,
              windowMin: p.windowMin,
              switches,
            };

            if (typeof window === "undefined" || !("Notification" in window)) {
              useAppStore.getState().setFragmentationAlert(alert);
              return;
            }

            let permission = Notification.permission;
            if (permission === "default") {
              try {
                permission = await Notification.requestPermission();
              } catch {
                permission = "denied";
              }
            }
            if (permission !== "granted") {
              useAppStore.getState().setFragmentationAlert(alert);
              return;
            }

            fragmentationNotificationRef.current?.close();
            const title = i18n.language === "zh-CN"
              ? "TimeLens · 注意力分散"
              : "TimeLens · Fragmentation alert";
            const body = i18n.language === "zh-CN"
              ? `最近 ${p.windowMin} 分钟内切换了 ${p.switchCount} 次应用，点击查看详情。`
              : `Switched apps ${p.switchCount} times in the last ${p.windowMin} min. Click to view details.`;
            const notification = new Notification(title, {
              body,
              tag: "timelens-fragmentation-alert",
              requireInteraction: true,
            });
            fragmentationNotificationRef.current = notification;
            notification.onclick = async () => {
              try {
                const currentWindow = getCurrentWindow();
                await currentWindow.show();
                await currentWindow.unminimize();
                await currentWindow.setFocus();
              } catch {
                window.focus();
              }
              useAppStore.getState().setFragmentationAlert(alert);
              notification.close();
            };
            notification.onclose = () => {
              if (fragmentationNotificationRef.current === notification) {
                fragmentationNotificationRef.current = null;
              }
            };
          }).catch(() => {});
        }),
      );
    };
    void reg();
    return () => {
      unsubs.forEach((u) => u());
      if (sessionsRefreshTimer != null) window.clearTimeout(sessionsRefreshTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 全局事件仅挂载一次
  }, []);

  return (
    <BrowserRouter>
      <FragmentationDetail />
      <UpdateNotice />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/lens" replace />} />
          <Route path="/lens" element={<TodayLensPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/report" element={<DailyReportPage />} />
          <Route path="/weekly" element={<WeeklyReportPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/settings" element={<SettingsShellPage />} />
          <Route path="/recap" element={<RecapPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/ocr" element={<OcrSearchPage />} />
          <Route path="/ocr-eval" element={<OcrEvalPage />} />
          <Route path="/intents" element={<IntentManagePage />} />
          <Route path="/health" element={<HealthPage />} />
          <Route path="/about" element={<AboutPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/lens" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
