import { useCallback, useEffect, useMemo, useState } from "react";
import { SystemPermissionPanel } from "../components/SystemPermissionPanel";
import { detectClientDesktopOs, pipelineHealthPlatformNote } from "../lib/platform";
import type { PipelineHealth } from "../types";
import * as api from "../services/tauri";

function fmtTs(ms: number | null): string {
  if (ms == null) return "—";
  return new Date(ms).toLocaleString();
}

function engineStatusLabel(status: string): string {
  switch (status) {
    case "running":
      return "正常";
    case "degraded":
      return "降级";
    case "stopped":
      return "已停止";
    default:
      return status;
  }
}

export default function HealthPage() {
  const [h, setH] = useState<PipelineHealth | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const clientOs = useMemo(() => detectClientDesktopOs(), []);

  const refresh = useCallback(async () => {
    try {
      setErr(null);
      setH(await api.getPipelineHealth());
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  const rows: Array<[string, keyof PipelineHealth]> = [
    ["采集 / Tracker", "tracker"],
    ["截图 / Capture", "capture"],
    ["输入", "inputDynamics"],
    ["剪贴板", "clipboard"],
    ["通知", "notifications"],
    ["环境", "ambientContext"],
    ["OCR / 屏幕文字", "ocr"],
  ];

  return (
    <div className="h-full overflow-auto p-4 text-[var(--tl-ink)]">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold text-[var(--tl-ink)]">健康度</h1>
        <button
          type="button"
          className="rounded border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)]"
          onClick={() => void refresh()}
        >
          立即刷新
        </button>
        {h && (
          <span className="text-xs text-[var(--tl-muted)]">
            检查时间 {new Date(h.lastCheckMs).toLocaleString()}
          </span>
        )}
      </div>
      {err && <p className="mb-2 text-sm text-[var(--tl-status-bad)]">{err}</p>}

      <div className="mb-6 max-w-2xl rounded border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-[var(--tl-muted)]">
          系统权限
        </h2>
        <div className="mt-2">
          <SystemPermissionPanel variant="both" />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-[var(--tl-muted)]">
          {pipelineHealthPlatformNote(clientOs)}
        </p>
      </div>

      <table className="w-full max-w-2xl border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--tl-line)] text-left text-[var(--tl-muted)]">
            <th className="py-2 pr-4">引擎</th>
            <th className="py-2 pr-4">状态</th>
            <th className="py-2">最近数据</th>
          </tr>
        </thead>
        <tbody>
          {h &&
            rows.map(([label, key]) => {
              const eng = h[key] as (typeof h)["tracker"];
              return (
                <tr key={label} className="border-b border-[var(--tl-line)]">
                  <td className="py-2 pr-4 text-[var(--tl-ink)]">{label}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={
                        eng.status === "running"
                          ? "text-[var(--tl-status-ok)]"
                          : eng.status === "degraded"
                            ? "text-[var(--tl-status-warn)]"
                            : "text-[var(--tl-muted)]"
                      }
                    >
                      {engineStatusLabel(eng.status)}
                    </span>
                  </td>
                  <td className="py-2 text-[var(--tl-muted)]">{fmtTs(eng.lastDataMs)}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
