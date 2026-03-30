import { useEffect } from "react";
import { Virtuoso } from "react-virtuoso";
import { useAppStore } from "./stores/appStore";
import * as api from "./services/tauri";
import { snapshotTimelensUrl } from "./types";

function fmtTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function App() {
  const {
    date,
    setDate,
    isTracking,
    isAfk,
    permissions,
    sessions,
    selectedSessionId,
    snapshots,
    selectedSnapshotId,
    rawEvents,
    activity,
    storage,
    writer,
    loadingSessions,
    error,
    formatBytes,
    refreshAll,
    selectSession,
    selectSnapshot,
    setTracking,
    setPermissions,
    setAfk,
    setWriterStats,
    clearError,
  } = useAppStore();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once; store actions stable
  }, []);

  const selectedSnap = snapshots.find((s) => s.id === selectedSnapshotId) ?? snapshots[0];

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight text-white">TimeLens</h1>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          日期
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
          />
        </label>
        <div className="flex flex-wrap gap-2 text-xs">
          <span
            className={`rounded px-2 py-0.5 ${
              isTracking ? "bg-emerald-900/60 text-emerald-300" : "bg-zinc-800 text-zinc-500"
            }`}
          >
            采集 {isTracking ? "运行中" : "已停止"}
          </span>
          {isAfk && (
            <span className="rounded bg-amber-900/50 px-2 py-0.5 text-amber-200">AFK</span>
          )}
          {permissions && (
            <>
              <span
                className={`rounded px-2 py-0.5 ${
                  permissions.accessibilityGranted
                    ? "bg-emerald-900/40 text-emerald-300"
                    : "bg-rose-900/40 text-rose-200"
                }`}
              >
                辅助功能
              </span>
              <span
                className={`rounded px-2 py-0.5 ${
                  permissions.screenRecordingGranted
                    ? "bg-emerald-900/40 text-emerald-300"
                    : "bg-rose-900/40 text-rose-200"
                }`}
              >
                屏幕录制
              </span>
            </>
          )}
        </div>
        {activity && (
          <span className="ml-auto text-xs text-zinc-500">
            当日 Session {activity.sessionCount} · 截图 {activity.snapshotCount} · 切换{" "}
            {activity.switchCount} · Raw {activity.rawEventCount}
          </span>
        )}
      </header>

      {error && (
        <div className="flex items-center justify-between border-b border-rose-900/50 bg-rose-950/40 px-4 py-2 text-sm text-rose-200">
          {error}
          <button
            type="button"
            className="text-rose-400 underline"
            onClick={() => clearError()}
          >
            关闭
          </button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[minmax(280px,340px)_1fr]">
        <section className="flex min-h-0 flex-col border-b border-zinc-800 lg:border-b-0 lg:border-r">
          <div className="border-b border-zinc-800 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Sessions
            {loadingSessions && <span className="ml-2 text-zinc-600">加载中…</span>}
          </div>
          <div className="min-h-0 flex-1">
            <Virtuoso
              data={sessions}
              className="h-full"
              itemContent={(_, s) => {
                const active = s.id === selectedSessionId;
                return (
                  <button
                    type="button"
                    onClick={() => void selectSession(s.id)}
                    className={`flex w-full flex-col items-start gap-0.5 border-b border-zinc-800/80 px-3 py-2.5 text-left text-sm transition-colors ${
                      active ? "bg-zinc-800/80" : "hover:bg-zinc-900"
                    }`}
                  >
                    <span className="font-medium text-zinc-100">{s.appName}</span>
                    <span className="line-clamp-2 text-xs text-zinc-500">{s.windowTitle}</span>
                    <span className="text-[11px] text-zinc-600">
                      {fmtTime(s.startMs)} · {s.rawEventCount} 条 raw
                      {s.isActive && " · 活跃"}
                    </span>
                  </button>
                );
              }}
            />
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 grid-rows-1 gap-0 lg:grid-cols-[1fr_280px] lg:grid-rows-1">
            <div className="flex min-h-[200px] flex-1 flex-col border-b border-zinc-800 lg:min-h-0 lg:border-b-0 lg:border-r">
              <div className="border-b border-zinc-800 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                截图预览
                {selectedSnap && (
                  <span className="ml-2 font-normal normal-case text-zinc-600">
                    {selectedSnap.triggerType} · {selectedSnap.resolution ?? "—"}
                  </span>
                )}
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center bg-zinc-900/50 p-4">
                {selectedSnap && selectedSnap.filePath ? (
                  <img
                    src={snapshotTimelensUrl(selectedSnap.id)}
                    alt="snapshot"
                    className="max-h-full max-w-full rounded border border-zinc-700 object-contain shadow-lg"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <p className="text-sm text-zinc-600">选择 Session 与截图</p>
                )}
              </div>
            </div>
            <div className="flex max-h-[40vh] min-h-[160px] flex-col lg:max-h-none">
              <div className="border-b border-zinc-800 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                当前 Session 截图
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {snapshots.length === 0 ? (
                  <p className="p-3 text-xs text-zinc-600">无截图</p>
                ) : (
                  <ul className="divide-y divide-zinc-800">
                    {snapshots.map((sn) => (
                      <li key={sn.id}>
                        <button
                          type="button"
                          onClick={() => selectSnapshot(sn.id)}
                          className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs ${
                            sn.id === (selectedSnapshotId ?? selectedSnap?.id)
                              ? "bg-zinc-800/60"
                              : "hover:bg-zinc-900"
                          }`}
                        >
                          <span className="text-zinc-300">{fmtTime(sn.capturedAtMs)}</span>
                          <span className="text-zinc-600">{sn.triggerType}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="max-h-36 overflow-hidden border-t border-zinc-800">
            <div className="border-b border-zinc-800 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              最近 Raw（全局）
            </div>
            <div className="max-h-28 overflow-x-auto overflow-y-auto px-2 py-1 font-mono text-[10px] leading-tight text-zinc-500">
              {rawEvents.slice(0, 24).map((r) => (
                <div key={r.id} className="truncate">
                  {fmtTime(r.timestampMs)} [{r.triggerType}] {r.appName}: {r.windowTitle}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <footer className="border-t border-zinc-800 bg-zinc-900/80">
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-zinc-800/80 px-4 py-2 text-xs text-zinc-500">
          {storage && (
            <span>
              存储 DB {formatBytes(storage.dbSizeBytes)} · 截图目录{" "}
              {formatBytes(storage.shotsSizeBytes)} · 总 raw {storage.rawEventCount}
            </span>
          )}
          {writer && (
            <span>
              Writer 批次数 {writer.totalBatches} · 事件 {writer.totalEvents} · 均批{" "}
              {writer.avgBatchSize.toFixed(1)} · 延迟 {writer.avgLatencyMs.toFixed(1)} ms
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <button
            type="button"
            className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-600 disabled:opacity-40"
            disabled={isTracking}
            onClick={() => void api.startTracking()}
          >
            开始采集
          </button>
          <button
            type="button"
            className="rounded bg-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-600 disabled:opacity-40"
            disabled={!isTracking}
            onClick={() => void api.stopTracking()}
          >
            停止采集
          </button>
          <button
            type="button"
            className="rounded border border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-800"
            onClick={async () => {
              try {
                await api.triggerScreenshot();
              } catch (e) {
                useAppStore.setState({ error: String(e) });
              }
            }}
          >
            手动截图
          </button>
          <button
            type="button"
            className="rounded border border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-800"
            onClick={() => void api.openDataDir()}
          >
            打开数据目录
          </button>
          <button
            type="button"
            className="rounded border border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-800"
            onClick={() => void api.checkpointWal()}
          >
            WAL checkpoint
          </button>
          <button
            type="button"
            className="rounded border border-amber-800/60 px-3 py-1.5 text-sm text-amber-200/90 hover:bg-amber-950/40"
            onClick={() => {
              if (
                window.confirm(
                  "将按策略清理：raw 7 天、截图 3 天。确定执行保留清理？",
                )
              ) {
                void api.runRetentionCleanup();
              }
            }}
          >
            保留清理
          </button>
          <button
            type="button"
            className="rounded border border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-800"
            onClick={() => void api.checkPermissions().then(setPermissions)}
          >
            刷新权限
          </button>
          {permissions && !permissions.accessibilityGranted && (
            <button
              type="button"
              className="rounded border border-rose-800/50 px-3 py-1.5 text-sm text-rose-200"
              onClick={() => void api.openAccessibilitySettings()}
            >
              打开辅助功能设置
            </button>
          )}
          {permissions && !permissions.screenRecordingGranted && (
            <button
              type="button"
              className="rounded border border-rose-800/50 px-3 py-1.5 text-sm text-rose-200"
              onClick={() => void api.openScreenRecordingSettings()}
            >
              打开屏幕录制设置
            </button>
          )}
          <button
            type="button"
            className="ml-auto rounded border border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-800"
            onClick={() => void refreshAll()}
          >
            全部刷新
          </button>
        </div>
      </footer>
    </div>
  );
}
