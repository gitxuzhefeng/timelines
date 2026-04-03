import { useEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
} from "react-router-dom";
import { useAppStore } from "./stores/appStore";
import * as api from "./services/tauri";
import HealthPage from "./pages/HealthPage";
import RecapPage from "./pages/RecapPage";
import SessionsPage from "./pages/SessionsPage";
import OcrSearchPage from "./pages/OcrSearchPage";
import OcrEvalPage from "./pages/OcrEvalPage";
import IntentManagePage from "./pages/IntentManagePage";
import SettingsPage from "./pages/SettingsPage";

function navCls({ isActive }: { isActive: boolean }): string {
  return `rounded px-3 py-1.5 text-sm ${
    isActive ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"
  }`;
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
      <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
        <header className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-4 py-2">
          <span className="mr-2 font-semibold tracking-tight text-white">TimeLens</span>
          <nav className="flex flex-wrap gap-1">
            <NavLink to="/recap" className={navCls}>
              复盘
            </NavLink>
            <NavLink to="/sessions" className={navCls}>
              会话
            </NavLink>
            <NavLink to="/ocr" className={navCls}>
              OCR 检索
            </NavLink>
            <NavLink to="/ocr-eval" className={navCls}>
              OCR 评估
            </NavLink>
            <NavLink to="/intents" className={navCls}>
              Intent
            </NavLink>
            <NavLink to="/health" className={navCls}>
              健康
            </NavLink>
            <NavLink to="/settings" className={navCls}>
              设置
            </NavLink>
          </nav>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<Navigate to="/recap" replace />} />
            <Route path="/recap" element={<RecapPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/ocr" element={<OcrSearchPage />} />
            <Route path="/ocr-eval" element={<OcrEvalPage />} />
            <Route path="/intents" element={<IntentManagePage />} />
            <Route path="/health" element={<HealthPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
