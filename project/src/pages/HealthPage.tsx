import { useCallback, useEffect, useState } from "react";
import type { PipelineHealth } from "../types";
import * as api from "../services/tauri";

function fmtTs(ms: number | null): string {
  if (ms == null) return "—";
  return new Date(ms).toLocaleString();
}

export default function HealthPage() {
  const [h, setH] = useState<PipelineHealth | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
    <div className="h-full overflow-auto p-4 text-zinc-100">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold text-white">健康度</h1>
        <button
          type="button"
          className="rounded border border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-800"
          onClick={() => void refresh()}
        >
          立即刷新
        </button>
        {h && (
          <span className="text-xs text-zinc-500">
            检查时间 {new Date(h.lastCheckMs).toLocaleString()}
          </span>
        )}
      </div>
      {err && <p className="mb-2 text-sm text-rose-300">{err}</p>}
      <table className="w-full max-w-2xl border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-700 text-left text-zinc-400">
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
                <tr key={label} className="border-b border-zinc-800/80">
                  <td className="py-2 pr-4 text-zinc-200">{label}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={
                        eng.status === "running"
                          ? "text-emerald-400"
                          : eng.status === "degraded"
                            ? "text-amber-400"
                            : "text-zinc-500"
                      }
                    >
                      {eng.status}
                    </span>
                  </td>
                  <td className="py-2 text-zinc-500">{fmtTs(eng.lastDataMs)}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
