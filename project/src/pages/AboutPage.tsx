import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../services/tauri";
import type { UpdateCheckResult } from "../services/tauri";

const GITHUB_URL = "https://github.com/gitxuzhefeng/timelines";
const HOMEPAGE_URL = "https://timelens-pi.vercel.app/";
const ISSUES_URL = "https://github.com/gitxuzhefeng/timelines/issues/new";
const BUY_ME_COFFEE_URL = "https://www.buymeacoffee.com/";

function openUrl(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function AboutPage() {
  const { t } = useTranslation();
  const [version, setVersion] = useState<string>("…");
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    api.getAppVersion().then(setVersion).catch(() => setVersion("?"));
  }, []);

  const checkUpdate = useCallback(async () => {
    setChecking(true);
    setUpdateError(null);
    setUpdateResult(null);
    try {
      const r = await api.checkForUpdate();
      setUpdateResult(r);
    } catch (e) {
      setUpdateError(String(e));
    } finally {
      setChecking(false);
    }
  }, []);

  return (
    <div className="h-full overflow-auto p-6 text-[var(--tl-ink)]">
      <div className="mx-auto max-w-xl space-y-6">

        {/* App identity */}
        <div className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-surface)] p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--tl-accent-12)] text-3xl font-bold text-[var(--tl-cyan)]">
              T
            </div>
            <div>
              <div className="text-lg font-bold tracking-wide">TimeLens</div>
              <div className="mt-0.5 font-mono text-xs text-[var(--tl-muted)]">
                {t("about.currentVersion")}: <span className="text-[var(--tl-ink)]">v{version}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Version update */}
        <section className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
          <h2 className="mb-3 text-sm font-medium text-[var(--tl-muted)]">{t("about.version")}</h2>
          <button
            type="button"
            disabled={checking}
            onClick={() => void checkUpdate()}
            className="rounded bg-[var(--tl-btn-muted)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:opacity-90 disabled:opacity-50"
          >
            {checking ? t("about.checking") : t("about.checkUpdate")}
          </button>

          {updateError && (
            <p className="mt-2 text-xs text-[var(--tl-status-bad)]">
              {t("about.updateError")}: {updateError}
            </p>
          )}

          {updateResult && !updateResult.hasUpdate && (
            <p className="mt-2 text-xs text-[var(--tl-status-ok)]">{t("about.upToDate")}</p>
          )}

          {updateResult?.hasUpdate && (
            <div className="mt-3 rounded border border-[var(--tl-accent-45)] bg-[var(--tl-accent-06)] p-3">
              <p className="text-sm font-medium text-[var(--tl-accent)]">
                {t("about.updateAvailable", { version: updateResult.latestVersion })}
              </p>
              {updateResult.releaseNotes && (
                <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-[var(--tl-muted)]">
                  {updateResult.releaseNotes}
                </pre>
              )}
              <button
                type="button"
                onClick={() => openUrl(updateResult.releaseUrl)}
                className="mt-3 rounded bg-[var(--tl-btn-primary-bg)] px-3 py-1.5 text-sm text-[var(--tl-btn-primary-text)] hover:bg-[var(--tl-btn-primary-bg-hover)]"
              >
                {t("about.viewRelease")}
              </button>
            </div>
          )}
        </section>

        {/* Links */}
        <section className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
          <h2 className="mb-3 text-sm font-medium text-[var(--tl-muted)]">{t("about.links")}</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openUrl(GITHUB_URL)}
              className="flex items-center gap-1.5 rounded border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)]"
            >
              <span className="font-mono text-xs">⌥</span>
              {t("about.github")}
            </button>
            <button
              type="button"
              onClick={() => openUrl(HOMEPAGE_URL)}
              className="flex items-center gap-1.5 rounded border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)]"
            >
              <span className="font-mono text-xs">⌘</span>
              {t("about.homepage")}
            </button>
          </div>
        </section>

        {/* Feedback */}
        <section className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
          <h2 className="mb-1 text-sm font-medium text-[var(--tl-muted)]">{t("about.feedback")}</h2>
          <p className="mb-3 text-xs text-[var(--tl-muted)]">{t("about.feedbackDesc")}</p>
          <button
            type="button"
            onClick={() => openUrl(ISSUES_URL)}
            className="rounded border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)]"
          >
            {t("about.openIssue")}
          </button>
        </section>

        {/* Sponsor */}
        <section className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
          <h2 className="mb-1 text-sm font-medium text-[var(--tl-muted)]">{t("about.sponsor")}</h2>
          <p className="mb-3 text-xs text-[var(--tl-muted)]">{t("about.sponsorDesc")}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openUrl(BUY_ME_COFFEE_URL)}
              className="rounded border border-[var(--tl-line)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)]"
            >
              ☕ {t("about.buyMeCoffee")}
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}
