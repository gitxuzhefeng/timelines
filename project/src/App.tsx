import { useEffect, useLayoutEffect, useRef } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
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
import { getClientPlatformProfile } from "./lib/platform";
import { useListenerDebugStore } from "./stores/listenerDebugStore";

export default function App() {
  const theme = useThemeStore((s) => s.theme);
  const refreshAll = useAppStore((s) => s.refreshAll);
  const setTracking = useAppStore((s) => s.setTracking);
  const setPermissions = useAppStore((s) => s.setPermissions);
  const setAfk = useAppStore((s) => s.setAfk);
  const setWriterStats = useAppStore((s) => s.setWriterStats);
  const listenerFlags = useListenerDebugStore((s) => s.flags);
  const isScrollingRef = useRef(false);
  const scrollingIdleTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  useLayoutEffect(() => {
    if (theme === "white") document.documentElement.setAttribute("data-theme", "white");
    else document.documentElement.removeAttribute("data-theme");
  }, [theme]);

  useEffect(() => {
    const profile = getClientPlatformProfile();
    document.documentElement.setAttribute("data-os", profile.os);
    document.documentElement.setAttribute("data-runtime-engine", profile.engine);
    if (profile.os === "windows") {
      document.documentElement.setAttribute("data-win-perf", "on");
    } else {
      document.documentElement.removeAttribute("data-win-perf");
    }
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const onAnyScroll = () => {
      isScrollingRef.current = true;
      if (scrollingIdleTimerRef.current != null) {
        window.clearTimeout(scrollingIdleTimerRef.current);
      }
      scrollingIdleTimerRef.current = window.setTimeout(() => {
        isScrollingRef.current = false;
        scrollingIdleTimerRef.current = null;
      }, 180);
    };
    window.addEventListener("scroll", onAnyScroll, { capture: true, passive: true });

    const unsubs: Array<() => void> = [];
    let sessionsRefreshTimer: ReturnType<typeof window.setTimeout> | null = null;
    const scheduleSessionsRefresh = () => {
      if (sessionsRefreshTimer != null) return;
      const delayMs = isScrollingRef.current ? 420 : 180;
      sessionsRefreshTimer = window.setTimeout(() => {
        sessionsRefreshTimer = null;
        void useAppStore.getState().refreshSessions();
      }, delayMs);
    };
    const reg = async () => {
      if (listenerFlags.windowEventUpdated) {
        unsubs.push(
          await api.listenEvent("window_event_updated", () => {
            scheduleSessionsRefresh();
          }),
        );
      }
      if (listenerFlags.newSnapshotSaved) {
        unsubs.push(
          await api.listenEvent("new_snapshot_saved", () => {
            scheduleSessionsRefresh();
            const sid = useAppStore.getState().selectedSessionId;
            if (sid) void useAppStore.getState().selectSession(sid);
          }),
        );
      }
      if (listenerFlags.trackingStateChanged) {
        unsubs.push(
          await api.listenEvent("tracking_state_changed", (p) => {
            setTracking(p.isRunning);
          }),
        );
      }
      if (listenerFlags.permissionsRequired) {
        unsubs.push(
          await api.listenEvent("permissions_required", (p) => {
            setPermissions(p);
          }),
        );
      }
      if (listenerFlags.afkStateChanged) {
        unsubs.push(
          await api.listenEvent("afk_state_changed", (p) => {
            setAfk(p.isAfk);
          }),
        );
      }
      if (listenerFlags.appSwitchRecorded) {
        unsubs.push(
          await api.listenEvent("app_switch_recorded", () => {
            scheduleSessionsRefresh();
          }),
        );
      }
      if (listenerFlags.writerStatsUpdated) {
        unsubs.push(
          await api.listenEvent("writer_stats_updated", (w) => {
            setWriterStats(w);
          }),
        );
      }
    };
    void reg();
    return () => {
      window.removeEventListener("scroll", onAnyScroll, { capture: true } as EventListenerOptions);
      unsubs.forEach((u) => u());
      if (sessionsRefreshTimer != null) window.clearTimeout(sessionsRefreshTimer);
      if (scrollingIdleTimerRef.current != null) {
        window.clearTimeout(scrollingIdleTimerRef.current);
      }
    };
  }, [listenerFlags, setTracking, setPermissions, setAfk, setWriterStats]);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/lens" replace />} />
          <Route path="/lens" element={<TodayLensPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/report" element={<DailyReportPage />} />
          <Route path="/settings" element={<SettingsShellPage />} />
          <Route path="/recap" element={<RecapPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/ocr" element={<OcrSearchPage />} />
          <Route path="/ocr-eval" element={<OcrEvalPage />} />
          <Route path="/intents" element={<IntentManagePage />} />
          <Route path="/health" element={<HealthPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/lens" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
