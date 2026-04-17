import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Virtuoso } from "react-virtuoso";
import { SystemPermissionPanel } from "../components/SystemPermissionPanel";
import { useAppStore } from "../stores/appStore";
import * as api from "../services/tauri";
import { snapshotTimelensUrl } from "../types";

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
    selectSession,
    selectSnapshot,
    setPermissions,
    clearError,
  } = useAppStore();

  const selectedSnap = snapshots.find((s) => s.id === selectedSnapshotId) ?? snapshots[0];
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!lightboxSrc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxSrc(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxSrc]);

  return (
    <div className="flex h-full min-h-0 flex-col text-[var(--tl-ink)]">
      {lightboxSrc ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--tl-overlay-lightbox)] p-4"
          role="dialog"
          aria-modal="true"
          aria-label="截图大图"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded bg-[var(--tl-surface-deep)] px-3 py-1 text-sm text-[var(--tl-ink)] hover:opacity-90"
            onClick={() => setLightboxSrc(null)}
          >
            关闭
          </button>
          <img
            src={lightboxSrc}
            alt="截图大图"
            className="tl-lightbox-image max-h-[92vh] max-w-full object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--tl-line)] bg-[var(--tl-subheader-bg)] px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight text-[var(--tl-ink)]">会话</h1>
        <label className="flex items-center gap-2 text-sm text-[var(--tl-muted)]">
          日期
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-2 py-1 text-[var(--tl-ink)]"
          />
        </label>
        <div className="flex flex-wrap gap-2 text-xs">
          <span
            className={`rounded px-2 py-0.5 ${
              isTracking
                ? "bg-[var(--tl-tracking-on-bg)] text-[var(--tl-tracking-on-text)]"
                : "bg-[var(--tl-tracking-off-bg)] text-[var(--tl-tracking-off-text)]"
            }`}
          >
            采集 {isTracking ? "运行中" : "已停止"}
          </span>
          {isAfk && (
            <span className="rounded bg-[var(--tl-badge-afk-bg)] px-2 py-0.5 text-[var(--tl-badge-afk-text)]">
              AFK
            </span>
          )}
          {permissions ? (
            <SystemPermissionPanel
              variant="badges"
              permissions={permissions}
              onPermissionsChange={setPermissions}
              showMacosPermissionHelp={false}
            />
          ) : null}
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-3 sm:ml-auto sm:w-auto">
          <Link
            to="/intents"
            className="text-xs text-[var(--tl-muted)] underline-offset-2 hover:text-[var(--tl-ink)] hover:underline"
          >
            应用分组
          </Link>
          <Link
            to="/ocr"
            className="text-xs text-[var(--tl-cyan)] underline-offset-2 hover:underline"
          >
            OCR 检索
          </Link>
          {activity && (
            <span className="text-xs text-[var(--tl-muted)]">
              Session {activity.sessionCount} · 截图 {activity.snapshotCount} · 切换{" "}
              {activity.switchCount}
            </span>
          )}
        </div>
      </header>

      {error && (
        <div className="flex items-center justify-between border-b border-[var(--tl-error-border)] bg-[var(--tl-error-bg)] px-4 py-2 text-sm text-[var(--tl-error-text)]">
          {error}
          <button
            type="button"
            className="text-[var(--tl-error-link)] underline"
            onClick={() => clearError()}
          >
            关闭
          </button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)_minmax(168px,220px)]">
        <section className="flex min-h-[200px] flex-col border-b border-[var(--tl-line)] lg:min-h-0 lg:border-b-0 lg:border-r">
          <div className="border-b border-[var(--tl-line)] px-3 py-2 text-xs font-medium uppercase tracking-wide text-[var(--tl-muted)]">
            Sessions
            {loadingSessions && <span className="ml-2 opacity-80">加载中…</span>}
          </div>
          <div className="min-h-0 flex-1">
            <Virtuoso
              data={sessions}
              className="h-full"
              overscan={240}
              computeItemKey={(_, s) => s.id}
              itemContent={(_, s) => {
                const active = s.id === selectedSessionId;
                return (
                  <button
                    type="button"
                    onClick={() => void selectSession(s.id)}
                    className={`tl-interactive-row flex w-full flex-col items-start gap-0.5 border-b border-[var(--tl-line)] px-3 py-2.5 text-left text-sm transition-colors ${
                      active ? "bg-[var(--tl-row-selected)]" : "hover:bg-[var(--tl-list-hover)]"
                    }`}
                  >
                    <span className="font-medium text-[var(--tl-ink)]">{s.appName}</span>
                    <span className="line-clamp-2 text-xs text-[var(--tl-muted)]">{s.windowTitle}</span>
                    <span className="text-[11px] text-[var(--tl-muted)]">
                      {fmtTime(s.startMs)} · {s.rawEventCount} 条 raw
                      {s.isActive && " · 活跃"}
                    </span>
                  </button>
                );
              }}
            />
          </div>
        </section>

        <section className="flex min-h-[280px] min-w-0 flex-col border-b border-[var(--tl-line)] lg:min-h-0 lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--tl-line)] px-3 py-2 text-xs text-[var(--tl-muted)]">
            <span className="font-medium uppercase tracking-wide">截图预览</span>
            {selectedSnap ? (
              <>
                <span className="font-mono">{fmtTime(selectedSnap.capturedAtMs)}</span>
                <span>·</span>
                <span>
                  {selectedSnap.triggerType} · {selectedSnap.resolution ?? "—"}
                </span>
              </>
            ) : (
              <span>选择会话与截图</span>
            )}
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--tl-img-placeholder-bg)] p-4">
            {selectedSnap?.filePath ? (
              <button
                type="button"
                className="tl-interactive-row max-h-full max-w-full cursor-zoom-in border-0 bg-transparent p-0"
                title="点击放大"
                onClick={() => setLightboxSrc(snapshotTimelensUrl(selectedSnap.id))}
              >
                <img
                  src={snapshotTimelensUrl(selectedSnap.id)}
                  alt="snapshot"
                  loading="eager"
                  decoding="async"
                  className="tl-preview-image max-h-full max-w-full rounded border border-[var(--tl-line)] object-contain shadow-lg"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </button>
            ) : (
              <p className="text-sm text-[var(--tl-muted)]">选择 Session 与截图</p>
            )}
          </div>
        </section>

        <section className="flex max-h-[36vh] min-h-[160px] flex-col lg:max-h-none lg:min-h-0">
          <div className="border-b border-[var(--tl-line)] px-3 py-2 text-xs font-medium uppercase tracking-wide text-[var(--tl-muted)]">
            当前 Session 截图
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {snapshots.length === 0 ? (
              <p className="p-3 text-xs text-[var(--tl-muted)]">无截图</p>
            ) : (
              <ul className="divide-y divide-[var(--tl-line)]">
                {snapshots.map((sn) => (
                  <li key={sn.id}>
                    <button
                      type="button"
                      onClick={() => selectSnapshot(sn.id)}
                      className={`tl-interactive-row flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs ${
                        sn.id === (selectedSnapshotId ?? selectedSnap?.id)
                          ? "bg-[var(--tl-row-selected-soft)]"
                          : "hover:bg-[var(--tl-list-hover)]"
                      }`}
                    >
                      <span className="text-[var(--tl-ink)]">{fmtTime(sn.capturedAtMs)}</span>
                      <span className="text-[var(--tl-muted)]">{sn.triggerType}</span>
                      {sn.filePath ? (
                        <img
                          src={snapshotTimelensUrl(sn.id)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="tl-preview-image mt-1 h-12 w-full cursor-zoom-in rounded border border-[var(--tl-line)] object-cover"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectSnapshot(sn.id);
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
        </section>
      </div>

      <div className="max-h-32 overflow-hidden border-t border-[var(--tl-line)]">
        <div className="border-b border-[var(--tl-line)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--tl-muted)]">
          最近 Raw（全局）
        </div>
        <div className="max-h-24 overflow-x-auto overflow-y-auto px-2 py-1 font-mono text-[10px] leading-tight text-[var(--tl-muted)]">
          {rawEvents.slice(0, 24).map((r) => (
            <div key={r.id} className="truncate">
              {fmtTime(r.timestampMs)} [{r.triggerType}] {r.appName}: {r.windowTitle}
            </div>
          ))}
        </div>
      </div>

      <footer className="border-t border-[var(--tl-line)] bg-[var(--tl-footer-bar)]">
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-[var(--tl-line)] px-4 py-2 text-xs text-[var(--tl-muted)]">
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
            className="rounded bg-[var(--tl-btn-primary-bg)] px-3 py-1.5 text-sm text-[var(--tl-btn-primary-text)] hover:bg-[var(--tl-btn-primary-bg-hover)] disabled:opacity-40"
            disabled={isTracking}
            onClick={() => void api.startTracking()}
          >
            开始采集
          </button>
          <button
            type="button"
            className="rounded bg-[var(--tl-btn-muted)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:opacity-90 disabled:opacity-40"
            disabled={!isTracking}
            onClick={() => void api.stopTracking()}
          >
            停止采集
          </button>
          <button
            type="button"
            className="rounded border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)]"
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
            className="rounded border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)]"
            onClick={() => void api.openDataDir()}
          >
            数据目录
          </button>
          <button
            type="button"
            className="rounded border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)]"
            onClick={() => void api.checkpointWal()}
          >
            WAL checkpoint
          </button>
          <button
            type="button"
            className="rounded border border-[var(--tl-btn-danger-border)] px-3 py-1.5 text-sm text-[var(--tl-btn-danger-text)] hover:bg-[var(--tl-btn-danger-hover)]"
            onClick={() => {
              if (window.confirm("将按策略清理 raw 7 天、截图 3 天。确定？")) {
                void api.runRetentionCleanup();
              }
            }}
          >
            保留清理
          </button>
          <SystemPermissionPanel
            variant="actions"
            permissions={permissions}
            onPermissionsChange={setPermissions}
            showMacosPermissionHelp={false}
          />
          <button
            type="button"
            className="ml-auto rounded border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)]"
            onClick={() => void refreshAll()}
          >
            全部刷新
          </button>
        </div>
      </footer>
    </div>
  );
}
