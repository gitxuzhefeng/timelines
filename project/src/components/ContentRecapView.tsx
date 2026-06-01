import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ContentRecapDto, ContentRecapItemDto, ContentRecapSlice } from "../types";
import { snapshotTimelensUrl } from "../types";
import * as api from "../services/tauri";
import { useAppStore } from "../stores/appStore";

type Props = {
  date: string;
};

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ContentRecapView({ date }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [slice, setSlice] = useState<ContentRecapSlice>("full_day");
  const [recap, setRecap] = useState<ContentRecapDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await api.getContentRecap(date, slice);
      setRecap(r);
    } catch (e) {
      setErr(String(e));
      setRecap(null);
    } finally {
      setLoading(false);
    }
  }, [date, slice]);

  useEffect(() => {
    void load();
  }, [load]);

  function openEvidence(item: ContentRecapItemDto) {
    const store = useAppStore.getState();
    store.setDate(date);
    void store.selectSession(item.sessionId).then(() => {
      store.selectSnapshot(item.snapshotId);
      navigate("/sessions");
    });
  }

  if (loading) {
    return (
      <p className="text-sm text-[var(--tl-muted)]">{t("contentRecap.loading")}</p>
    );
  }

  if (err) {
    return (
      <p className="text-sm text-[var(--tl-danger)]">{err}</p>
    );
  }

  const stats = recap?.stats;
  const items = recap?.items ?? [];

  let emptyKey: "noSnapshots" | "noOcr" | "noHighlights" | null = null;
  if (items.length === 0) {
    if ((stats?.snapshotsInRange ?? 0) === 0) {
      emptyKey = "noSnapshots";
    } else if ((stats?.ocrOkInRange ?? 0) === 0) {
      emptyKey = "noOcr";
    } else {
      emptyKey = "noHighlights";
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {lightboxSrc ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--tl-overlay-lightbox)] p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("common.screenshotAlt")}
          onClick={() => setLightboxSrc(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded bg-[var(--tl-surface-deep)] px-3 py-1 text-sm text-[var(--tl-ink)] hover:opacity-90"
            onClick={() => setLightboxSrc(null)}
          >
            {t("common.close")}
          </button>
          <img
            src={lightboxSrc}
            alt={t("common.screenshotAlt")}
            className="max-h-[92vh] max-w-full object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex rounded-lg border border-[var(--tl-line)] bg-[var(--tl-input-fill)] p-0.5"
          role="tablist"
          aria-label={t("contentRecap.sliceLabel")}
        >
          {(["full_day", "evening"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={slice === s}
              className={`rounded px-2.5 py-1 text-[0.65rem] transition-colors ${
                slice === s
                  ? "bg-[var(--tl-accent-12)] text-[var(--tl-ink)]"
                  : "text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"
              }`}
              onClick={() => setSlice(s)}
            >
              {t(s === "full_day" ? "contentRecap.sliceFullDay" : "contentRecap.sliceEvening")}
            </button>
          ))}
        </div>
        {stats ? (
          <p className="text-xs text-[var(--tl-muted)]">
            {t("contentRecap.statsLine", {
              selected: stats.selectedCount,
              snapshots: stats.snapshotsInRange,
              ocr: stats.ocrOkInRange,
            })}
          </p>
        ) : null}
      </div>

      {emptyKey ? (
        <div className="rounded-xl border border-[var(--tl-line)] bg-[var(--tl-surface)] p-6 text-center">
          <p className="text-sm text-[var(--tl-muted)]">{t(`contentRecap.empty.${emptyKey}`)}</p>
          <button
            type="button"
            className="tl-interactive-row mt-4 rounded-lg border border-[var(--tl-line)] px-4 py-2 text-sm text-[var(--tl-cyan)] hover:bg-[var(--tl-accent-12)]"
            onClick={() => navigate("/timeline")}
          >
            {t("contentRecap.openTimeline")}
          </button>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
          {items.map((item) => (
            <li key={item.snapshotId}>
              <article className="flex gap-3 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-surface)] p-3">
                <button
                  type="button"
                  className="tl-interactive-row shrink-0 overflow-hidden rounded-lg ring-1 ring-[var(--tl-line)]"
                  onClick={() => setLightboxSrc(snapshotTimelensUrl(item.snapshotId))}
                >
                  <img
                    src={snapshotTimelensUrl(item.snapshotId)}
                    alt=""
                    className="h-20 w-32 object-cover object-top"
                    loading="lazy"
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <time className="font-mono text-xs text-[var(--tl-cyan)]">
                      {fmtTime(item.capturedAtMs)}
                    </time>
                    <span className="text-xs font-medium text-[var(--tl-ink)]">{item.appName}</span>
                    {item.sessionIntent ? (
                      <span className="rounded bg-[var(--tl-accent-12)] px-1.5 py-0.5 text-[0.6rem] text-[var(--tl-muted)]">
                        {item.sessionIntent}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[var(--tl-muted)]" title={item.windowTitle}>
                    {item.windowTitle}
                  </p>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[var(--tl-ink)]">
                    {item.ocrPreview}
                  </p>
                  <button
                    type="button"
                    className="tl-interactive-row mt-2 text-xs text-[var(--tl-cyan)] hover:underline"
                    onClick={() => openEvidence(item)}
                  >
                    {t("contentRecap.openEvidence")}
                  </button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
