import { useState, useEffect } from "react";
import DeveloperDashboard from "./pages/DeveloperDashboard";
import OverviewDashboard from "./pages/OverviewDashboard";
import { useAppStore } from "./stores/appStore";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

interface PermissionsRequired {
  accessibility: boolean;
  screenRecording: boolean;
}

export type ViewMode = 'overview' | 'developer';

function PermissionBanner({ perms, onRetry }: { perms: PermissionsRequired; onRetry: () => void }) {
  const missing = [
    perms.accessibility && "辅助功能（Accessibility）",
    perms.screenRecording && "屏幕录制（Screen Recording）",
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-800 border border-amber-500/40 rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <i className="fa-solid fa-shield-exclamation text-amber-400 text-2xl"></i>
          <h2 className="text-lg font-semibold text-white">需要系统权限</h2>
        </div>
        <p className="text-slate-300 text-sm leading-relaxed mb-4">
          TimeLens 需要以下权限才能正常工作。系统偏好设置已自动打开，请在列表中找到{" "}
          <strong className="text-white">TimeLens</strong> 并勾选授权：
        </p>
        <ul className="mb-6 space-y-2">
          {missing.map((m) => (
            <li key={m as string} className="flex items-center gap-2 text-sm text-amber-300">
              <i className="fa-solid fa-circle-xmark text-red-400"></i>
              {m as string}
            </li>
          ))}
        </ul>
        <p className="text-slate-400 text-xs mb-6 bg-black/30 rounded-lg p-3 border border-white/10">
          授权后点击下方按钮重试。如果仍无效，请完全退出并重新启动 TimeLens。
        </p>
        <div className="flex gap-3">
          <button
            onClick={onRetry}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            <i className="fa-solid fa-rotate-right mr-2"></i>已授权，重试
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const { loadSettings, loadTodayEvents } = useAppStore();
  const [permissionsRequired, setPermissionsRequired] = useState<PermissionsRequired | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('overview');

  useEffect(() => {
    loadSettings();
    loadTodayEvents();
  }, []);

  useEffect(() => {
    const unlisten = listen<PermissionsRequired>("permissions_required", (event) => {
      setPermissionsRequired(event.payload);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const handleRetry = async () => {
    const granted: boolean = await invoke("restart_tracking");
    if (granted) {
      setPermissionsRequired(null);
    } else {
      const status = await invoke<PermissionsRequired>("check_permissions");
      setPermissionsRequired({
        accessibility: !status.accessibility,
        screenRecording: !status.screenRecording,
      });
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden font-sans select-none">
      {permissionsRequired && (
        <PermissionBanner perms={permissionsRequired} onRetry={handleRetry} />
      )}
      {viewMode === 'overview'
        ? <OverviewDashboard viewMode={viewMode} onSwitchView={setViewMode} />
        : <DeveloperDashboard viewMode={viewMode} onSwitchView={setViewMode} />
      }
    </div>
  );
}

export default App;
