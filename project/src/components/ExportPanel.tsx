import { useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../services/tauri";

type ExportFormat = "md" | "html" | "csv" | "json";

type ExportPanelProps = {
  date: string;
  reportView: "fact_only" | "ai_enhanced";
  hasReport: boolean;
  onClose: () => void;
};

export function ExportPanel({
  date,
  reportView,
  hasReport,
  onClose,
}: ExportPanelProps) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<ExportFormat>("md");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleExport = async () => {
    setBusy(true);
    setMsg(null);
    try {
      let path: string;
      switch (format) {
        case "md":
          if (!hasReport) {
            setMsg({ ok: false, text: t("recap.exportNoReport") });
            return;
          }
          path = await api.exportDailyMarkdown(date, reportView);
          break;
        case "html":
          if (!hasReport) {
            setMsg({ ok: false, text: t("recap.exportNoReport") });
            return;
          }
          path = await api.exportDailyHtml(date);
          break;
        case "csv":
          path = await api.exportSessionsCsv(date);
          break;
        case "json":
          path = await api.exportDailyJson(date);
          break;
      }
      setMsg({ ok: true, text: t("recap.exportSuccess", { path }) });
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setBusy(false);
    }
  };

  const formats: { value: ExportFormat; label: string }[] = [
    { value: "md", label: t("recap.exportFormatMd") },
    { value: "html", label: t("recap.exportFormatHtml") },
    { value: "csv", label: t("recap.exportFormatCsv") },
    { value: "json", label: t("recap.exportFormatJson") },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg border border-[var(--tl-line)] bg-[var(--tl-surface)] p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--tl-ink)]">
            {t("recap.exportTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"
          >
            ✕
          </button>
        </div>

        <p className="mb-3 text-xs text-[var(--tl-muted)]">{date}</p>

        <fieldset className="mb-4">
          <legend className="mb-2 text-xs font-medium text-[var(--tl-muted)]">
            {t("recap.exportFormat")}
          </legend>
          <div className="flex flex-col gap-2">
            {formats.map((f) => (
              <label
                key={f.value}
                className="flex cursor-pointer items-start gap-2 text-sm text-[var(--tl-ink)]"
              >
                <input
                  type="radio"
                  name="export-format"
                  value={f.value}
                  checked={format === f.value}
                  onChange={() => setFormat(f.value)}
                  className="mt-0.5"
                />
                <span>{f.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Pro 功能钩子 */}
        <p className="mb-4 rounded bg-[var(--tl-surface-deep)] px-3 py-2 text-xs text-[var(--tl-muted)]">
          {t("recap.exportProHint")}
        </p>

        {msg && (
          <p
            className={`mb-3 break-all text-xs ${
              msg.ok
                ? "text-[var(--tl-success,#4ade80)]"
                : "text-[var(--tl-warn-amber-text)]"
            }`}
          >
            {msg.text}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[var(--tl-line)] px-4 py-1.5 text-sm text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)]"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleExport()}
            className="rounded bg-[var(--tl-btn-primary-bg)] px-4 py-1.5 text-sm text-[var(--tl-btn-primary-text)] hover:bg-[var(--tl-btn-primary-bg-hover)] disabled:opacity-40"
          >
            {busy ? t("common.processing") : t("recap.exportBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
