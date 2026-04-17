import { useEffect, useMemo, useState } from "react";
import type { ListenerDebugFlags } from "../stores/listenerDebugStore";
import { useListenerDebugStore } from "../stores/listenerDebugStore";

const ITEMS: Array<{
  key: keyof ListenerDebugFlags;
  label: string;
  desc: string;
}> = [
  {
    key: "windowEventUpdated",
    label: "window_event_updated",
    desc: "高频会话刷新触发（最建议先关）",
  },
  {
    key: "newSnapshotSaved",
    label: "new_snapshot_saved",
    desc: "截图入库后会话刷新 + 选中会话重拉",
  },
  {
    key: "appSwitchRecorded",
    label: "app_switch_recorded",
    desc: "应用切换后触发会话刷新",
  },
  {
    key: "writerStatsUpdated",
    label: "writer_stats_updated",
    desc: "写入统计更新（低频）",
  },
  {
    key: "permissionsRequired",
    label: "permissions_required",
    desc: "权限状态刷新",
  },
  {
    key: "afkStateChanged",
    label: "afk_state_changed",
    desc: "空闲状态变化",
  },
  {
    key: "trackingStateChanged",
    label: "tracking_state_changed",
    desc: "采集状态变化",
  },
];

export function ListenerDebugPanel() {
  const flags = useListenerDebugStore((s) => s.flags);
  const setFlag = useListenerDebugStore((s) => s.setFlag);
  const setAll = useListenerDebugStore((s) => s.setAll);
  const reset = useListenerDebugStore((s) => s.reset);
  const [fps, setFps] = useState(0);
  const [frameMs, setFrameMs] = useState(0);
  const [sampleFrames, setSampleFrames] = useState(0);

  const enabledCount = useMemo(
    () => Object.values(flags).filter(Boolean).length,
    [flags],
  );

  useEffect(() => {
    let rafId = 0;
    let sampleStart = performance.now();
    let lastTs = sampleStart;
    let frameCount = 0;
    let frameMsSum = 0;

    const loop = (ts: number) => {
      frameCount += 1;
      frameMsSum += ts - lastTs;
      lastTs = ts;

      const elapsed = ts - sampleStart;
      if (elapsed >= 1000) {
        const currentFps = frameCount / (elapsed / 1000);
        const avgFrameMs = frameCount > 0 ? frameMsSum / frameCount : 0;
        setFps(Math.round(currentFps));
        setFrameMs(Number(avgFrameMs.toFixed(1)));
        setSampleFrames(frameCount);

        sampleStart = ts;
        frameCount = 0;
        frameMsSum = 0;
      }
      rafId = window.requestAnimationFrame(loop);
    };

    rafId = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  const fpsLevel = fps >= 55 ? "ok" : fps >= 40 ? "warn" : "bad";

  return (
    <details className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-surface)] px-3 py-2 text-xs text-[var(--tl-muted)]">
      <summary className="cursor-pointer select-none font-mono tracking-wide text-[var(--tl-ink)]">
        监听开关（调试） · {enabledCount}/{ITEMS.length}
      </summary>
      <div className="mt-2 space-y-2">
        <div className="rounded border border-[var(--tl-line)] bg-[var(--tl-surface-deep)] px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px]">
            <span className="text-[var(--tl-muted)]">FPS</span>
            <span
              className={
                fpsLevel === "ok"
                  ? "text-[var(--tl-status-ok)]"
                  : fpsLevel === "warn"
                    ? "text-[var(--tl-status-warn)]"
                    : "text-[var(--tl-status-bad)]"
              }
            >
              {fps}
            </span>
            <span className="text-[var(--tl-muted)]">平均帧时</span>
            <span className="text-[var(--tl-ink)]">{frameMs}ms</span>
            <span className="text-[var(--tl-muted)]">样本帧</span>
            <span className="text-[var(--tl-ink)]">{sampleFrames}</span>
          </div>
          <p className="mt-1 text-[10px] text-[var(--tl-muted)]">
            参考：55-60 流畅，40-54 轻微卡顿，&lt;40 明显卡顿。
          </p>
        </div>
        <p className="leading-relaxed">
          用于排查滚动卡顿：勾选状态会立即生效并持久化在本机。推荐先关前三项看变化。
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border border-[var(--tl-line)] px-2 py-1 text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)]"
            onClick={() => setAll(false)}
          >
            全关
          </button>
          <button
            type="button"
            className="rounded border border-[var(--tl-line)] px-2 py-1 text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)]"
            onClick={() => setAll(true)}
          >
            全开
          </button>
          <button
            type="button"
            className="rounded border border-[var(--tl-line)] px-2 py-1 text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)]"
            onClick={() => reset()}
          >
            恢复默认
          </button>
        </div>
        <div className="space-y-1.5">
          {ITEMS.map((it) => (
            <label key={it.key} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-[var(--tl-glass-20)]">
              <input
                type="checkbox"
                className="mt-0.5 h-3.5 w-3.5"
                checked={flags[it.key]}
                onChange={(e) => setFlag(it.key, e.target.checked)}
              />
              <span className="min-w-0">
                <span className="font-mono text-[11px] text-[var(--tl-ink)]">{it.label}</span>
                <span className="ml-1 text-[10px] text-[var(--tl-muted)]">{it.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}
