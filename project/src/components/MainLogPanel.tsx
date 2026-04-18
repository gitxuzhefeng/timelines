import { useEffect, useRef } from "react";
import { useMainLogStore } from "../stores/mainLogStore";
import { isElectronShell } from "../services/desktop-bridge";

/**
 * Electron 主进程调试日志（开发模式开启时订阅 timelens:debug-log）。
 */
export function MainLogPanel() {
  const lines = useMainLogStore((s) => s.lines);
  const clear = useMainLogStore((s) => s.clear);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isElectronShell()) return;
    const sub = window.timelensDesktop?.subscribeMainLog;
    if (typeof sub !== "function") return;
    const off = sub((payload: unknown) => {
      const line =
        typeof payload === "object" && payload && payload !== null && "line" in payload
          ? String((payload as { line?: string }).line ?? "")
          : String(payload);
      useMainLogStore.getState().pushLine(line);
    });
    return () => {
      off?.();
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  if (!isElectronShell()) return null;

  return (
    <div className="border-t border-[var(--tl-line)] bg-[var(--tl-card)]/95 px-3 py-2 font-mono text-[10px] leading-relaxed text-[var(--tl-muted)] backdrop-blur-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-semibold uppercase tracking-wider text-[var(--tl-cyan)]">
          主进程日志（Electron）
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-[var(--tl-line)] px-2 py-0.5 text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)]"
            onClick={() => {
              void navigator.clipboard.writeText(lines.join("\n"));
            }}
          >
            复制全部
          </button>
          <button
            type="button"
            className="rounded border border-[var(--tl-line)] px-2 py-0.5 text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)]"
            onClick={() => clear()}
          >
            清空
          </button>
        </div>
      </div>
      <div className="max-h-[min(40vh,220px)] overflow-y-auto rounded border border-[var(--tl-line)] bg-[var(--tl-bg)]/80 p-2">
        {lines.length === 0 ? (
          <span className="opacity-60">等待主进程输出…（invoke / 守护进程）</span>
        ) : (
          lines.map((l, i) => (
            <div key={`${i}-${l.slice(0, 24)}`} className="whitespace-pre-wrap break-all">
              {l}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
