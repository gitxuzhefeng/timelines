import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SystemPermissionPanel } from "../components/SystemPermissionPanel";
import { detectClientDesktopOs, pipelineHealthPlatformNote } from "../lib/platform";
import type { PipelineHealth } from "../types";
import * as api from "../services/tauri";

function fmtTs(ms: number | null): string {
  if (ms == null) return "—";
  return new Date(ms).toLocaleString();
}

export default function HealthPage() {
  const { t } = useTranslation();
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
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const rows: Array<[string, keyof PipelineHealth]> = [
    [t("health.trackerEngine"), "tracker"],
    [t("health.captureEngine"), "capture"],
    [t("health.inputEngine"), "inputDynamics"],
    [t("health.clipboardEngine"), "clipboard"],
    [t("health.notificationsEngine"), "notifications"],
    [t("health.ambientEngine"), "ambientContext"],
    [t("health.ocrEngine"), "ocr"],
  ];

  function engineStatusLabel(status: string): string {
    switch (status) {
      case "running": return t("health.running");
      case "degraded": return t("health.degraded");
      case "stopped": return t("health.stopped");
      default: return status;
    }
  }

  return (
    <div className="h-full overflow-auto p-4 text-[var(--tl-ink)]">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold text-[var(--tl-ink)]">{t("health.title")}</h1>
        <button
          type="button"
          className="rounded border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)]"
          onClick={() => void refresh()}
        >
          {t("health.refreshNow")}
        </button>
        {h && (
          <span className="text-xs text-[var(--tl-muted)]">
            {t("health.checkTime", { time: new Date(h.lastCheckMs).toLocaleString() })}
          </span>
        )}
      </div>
      {err && <p className="mb-2 text-sm text-[var(--tl-status-bad)]">{err}</p>}

      <div className="mb-6 max-w-2xl rounded border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-[var(--tl-muted)]">
          {t("health.systemPermissions")}
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
            <th className="py-2 pr-4">{t("health.engine")}</th>
            <th className="py-2 pr-4">{t("common.status")}</th>
            <th className="py-2">{t("health.recentData")}</th>
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
