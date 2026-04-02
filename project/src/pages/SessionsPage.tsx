import { useEffect, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { useAppStore } from "../stores/appStore";
import * as api from "../services/tauri";
import { snapshotTimelensUrl } from "../types";

const INTENT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "未分类（清空）" },
  { value: "编码开发", label: "编码开发" },
  { value: "研究检索", label: "研究检索" },
  { value: "通讯沟通", label: "通讯沟通" },
];

function fmtTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function SessionsPage() {
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
    refreshSessions,
    selectSession,
    selectSnapshot,
    setPermissions,
    clearError,
  } = useAppStore();

  const selectedSnap = snapshots.find((s) => s.id === selectedSnapshotId) ?? snapshots[0];
  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  );
  const [intentDraft, setIntentDraft] = useState("");
  const [intentSaving, setIntentSaving] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    setIntentDraft(selectedSession?.intent ?? "");
  }, [selectedSession?.id, selectedSession?.intent]);

  useEffect(() => {
    if (!lightboxSrc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxSrc(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxSrc]);

  async function saveSessionIntent(next: string | null) {
    if (!selectedSessionId) return;
    setIntentSaving(true);
    try {
      await api.updateSessionIntent(selectedSessionId, next);
      await refreshSessions();
    } catch (e) {
      useAppStore.setState({ error: String(e) });
    } finally {
      setIntentSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-zinc-100">
      {lightboxSrc ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="截图大图"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded bg-zinc-800 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-700"
            onClick={() => setLightboxSrc(null)}
          >
            关闭
          </button>
          <img
            src={lightboxSrc}
            alt="截图大图"
            className="max-h-[92vh] max-w-full object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight text-white">会话</h1>
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
              <span
                className={`rounded px-2 py-0.5 ${
                  permissions.notificationListenerGranted
                    ? "bg-emerald-900/40 text-emerald-300"
                    : "bg-rose-900/40 text-rose-200"
                }`}
              >
                通知监听
              </span>
            </>
          )}
        </div>
        {activity && (
          <span className="ml-auto text-xs text-zinc-500">
            Session {activity.sessionCount} · 截图 {activity.snapshotCount} · 切换{" "}
            {activity.switchCount}
          </span>
        )}
      </header>

      {error && (
        <div className="flex items-center justify-between border-b border-rose-900/50 bg-rose-950/40 px-4 py-2 text-sm text-rose-200">
          {error}
          <button type="button" className="text-rose-400 underline" onClick={() => clearError()}>
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
          {selectedSession && (
            <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2 text-sm">
              <span className="text-xs text-zinc-500">Intent 纠错（M5）</span>
              <select
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
                value={
                  INTENT_OPTIONS.some((o) => o.value === (selectedSession.intent ?? ""))
                    ? (selectedSession.intent ?? "")
                    : "__custom__"
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__custom__") return;
                  void saveSessionIntent(v === "" ? null : v);
                }}
                disabled={intentSaving}
              >
                {INTENT_OPTIONS.map((o) => (
                  <option key={o.value || "empty"} value={o.value}>
                    {o.label}
                  </option>
                ))}
                <option value="__custom__">自定义（下方输入）</option>
              </select>
              <input
                type="text"
                placeholder="自定义 Intent"
                className="min-w-[8rem] flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
                value={intentDraft}
                onChange={(e) => setIntentDraft(e.target.value)}
                disabled={intentSaving}
              />
              <button
                type="button"
                className="rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600 disabled:opacity-40"
                disabled={intentSaving}
                onClick={() =>
                  void saveSessionIntent(intentDraft.trim() === "" ? null : intentDraft.trim())
                }
              >
                保存自定义
              </button>
            </div>
          )}
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
                  <button
                    type="button"
                    className="max-h-full max-w-full cursor-zoom-in border-0 bg-transparent p-0"
                    title="点击放大"
                    onClick={() => setLightboxSrc(snapshotTimelensUrl(selectedSnap.id))}
                  >
                    <img
                      src={snapshotTimelensUrl(selectedSnap.id)}
                      alt="snapshot"
                      className="max-h-full max-w-full rounded border border-zinc-700 object-contain shadow-lg"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </button>
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
                          {sn.filePath ? (
                            <img
                              src={snapshotTimelensUrl(sn.id)}
                              alt=""
                              className="mt-1 h-12 w-full cursor-zoom-in rounded border border-zinc-700 object-cover"
                              onClick={(e) => {
                                e.stopPropagation();
                                void selectSnapshot(sn.id);
                                setLightboxSrc(snapshotTimelensUrl(sn.id));
                              }}
                            />
                          ) : null}
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
              DB {formatBytes(storage.dbSizeBytes)} · 截图 {formatBytes(storage.shotsSizeBytes)}
            </span>
          )}
          {writer && (
            <span>
              Writer {writer.totalBatches} 批 · {writer.totalEvents} 事件
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
            数据目录
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
              if (window.confirm("将按策略清理 raw 7 天、截图 3 天。确定？")) {
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
              辅助功能设置
            </button>
          )}
          {permissions && !permissions.screenRecordingGranted && (
            <button
              type="button"
              className="rounded border border-rose-800/50 px-3 py-1.5 text-sm text-rose-200"
              onClick={() => void api.openScreenRecordingSettings()}
            >
              屏幕录制设置
            </button>
          )}
          {permissions && !permissions.notificationListenerGranted && (
            <button
              type="button"
              className="rounded border border-rose-800/50 px-3 py-1.5 text-sm text-rose-200"
              onClick={() => void api.openNotificationSettings()}
            >
              通知权限设置
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
