import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/appStore";
import * as api from "../services/tauri";

export default function UpdateNotice() {
  const { t } = useTranslation();
  const result = useAppStore((s) => s.updateCheckResult);
  const dismissed = useAppStore((s) => s.updateDismissed);
  const dismiss = useAppStore((s) => s.dismissUpdate);

  if (!result?.hasUpdate || dismissed) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-[var(--tl-overlay-strong)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("updateNotice.title")}
    >
      <div
        className="relative flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-[var(--tl-line)] bg-[var(--tl-sheet-bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--tl-line)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--tl-accent-12)] text-lg font-bold text-[var(--tl-cyan)]">
              T
            </span>
            <div>
              <h2 className="text-base font-semibold text-[var(--tl-ink)]">
                {t("updateNotice.title")}
              </h2>
              <p className="text-[0.72rem] text-[var(--tl-muted)]">
                v{result.latestVersion}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-xl leading-none text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"
            onClick={dismiss}
          >
            ×
          </button>
        </div>

        {/* Release notes */}
        {result.releaseNotes && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[var(--tl-muted)]">
              {t("updateNotice.whatsNew")}
            </p>
            <pre className="whitespace-pre-wrap rounded-lg bg-white/[0.03] p-3 font-mono text-[0.72rem] leading-relaxed text-[var(--tl-ink)]">
              {result.releaseNotes}
            </pre>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-[var(--tl-line)] px-5 py-3">
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-[0.78rem] font-medium text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"
            onClick={dismiss}
          >
            {t("updateNotice.later")}
          </button>
          <button
            type="button"
            className="rounded-lg bg-[var(--tl-p3-accent)] px-5 py-2 text-[0.78rem] font-semibold text-white hover:opacity-90"
            onClick={() => {
              void api.openUrl(result.releaseUrl);
              dismiss();
            }}
          >
            {t("updateNotice.viewUpdate")}
          </button>
        </div>
      </div>
    </div>
  );
}
