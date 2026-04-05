import { useEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import AppShell from "./layout/AppShell";
import { useAppStore } from "./stores/appStore";
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

function LegacyWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen overflow-hidden bg-zinc-950 text-zinc-100">{children}</div>
  );
}

export default function App() {
  const refreshAll = useAppStore((s) => s.refreshAll);
  const setTracking = useAppStore((s) => s.setTracking);
  const setPermissions = useAppStore((s) => s.setPermissions);
  const setAfk = useAppStore((s) => s.setAfk);
  const setWriterStats = useAppStore((s) => s.setWriterStats);

  useEffect(() => {
    void refreshAll();
    const unsubs: Array<() => void> = [];
    const reg = async () => {
      unsubs.push(
        await api.listenEvent("window_event_updated", () => {
          void useAppStore.getState().refreshSessions();
        }),
      );
      unsubs.push(
        await api.listenEvent("new_snapshot_saved", () => {
          void useAppStore.getState().refreshSessions();
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
          void useAppStore.getState().refreshSessions();
        }),
      );
      unsubs.push(
        await api.listenEvent("writer_stats_updated", (w) => {
          setWriterStats(w);
        }),
      );
    };
    void reg();
    return () => {
      unsubs.forEach((u) => u());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 全局事件仅挂载一次
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/lens" replace />} />
          <Route path="/lens" element={<TodayLensPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/report" element={<DailyReportPage />} />
          <Route path="/settings" element={<SettingsShellPage />} />
        </Route>

        <Route
          path="/recap"
          element={
            <LegacyWrap>
              <RecapPage />
            </LegacyWrap>
          }
        />
        <Route
          path="/sessions"
          element={
            <LegacyWrap>
              <SessionsPage />
            </LegacyWrap>
          }
        />
        <Route
          path="/ocr"
          element={
            <LegacyWrap>
              <OcrSearchPage />
            </LegacyWrap>
          }
        />
        <Route
          path="/ocr-eval"
          element={
            <LegacyWrap>
              <OcrEvalPage />
            </LegacyWrap>
          }
        />
        <Route
          path="/intents"
          element={
            <LegacyWrap>
              <IntentManagePage />
            </LegacyWrap>
          }
        />
        <Route
          path="/health"
          element={
            <LegacyWrap>
              <HealthPage />
            </LegacyWrap>
          }
        />

        <Route path="*" element={<Navigate to="/lens" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
