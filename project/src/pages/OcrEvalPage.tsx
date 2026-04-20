import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  OcrEvalLine,
  OcrEvalSampleRow,
  OcrEvaluateSnapshotResult,
} from "../types";
import { snapshotTimelensUrl } from "../types";
import * as api from "../services/tauri";

function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

function dropReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "";
  const m: Record<string, string> = {
    empty: "empty",
    too_short: "too_short",
    no_alnum_cjk: "no_alnum_cjk",
    low_line_conf: "low_line_conf",
    symbol_noise: "symbol_noise",
  };
  return m[reason] ?? reason;
}

export default function OcrEvalPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<OcrEvalSampleRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [evalResult, setEvalResult] = useState<OcrEvaluateSnapshotResult | null>(
    null,
  );
  const [listErr, setListErr] = useState<string | null>(null);
  const [evalErr, setEvalErr] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingEval, setLoadingEval] = useState(false);

  const refreshList = useCallback(async () => {
    setListErr(null);
    setLoadingList(true);
    try {
      const r = await api.listOcrEvalSamples(50);
      setRows(r);
    } catch (e) {
      setListErr(String(e));
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  async function runEval(snapshotId: string) {
    setSelectedId(snapshotId);
    setEvalErr(null);
    setLoadingEval(true);
    setEvalResult(null);
    try {
      const r = await api.evaluateOcrSnapshot(snapshotId);
      setEvalResult(r);
    } catch (e) {
      setEvalErr(String(e));
    } finally {
      setLoadingEval(false);
    }
  }

  let metaObj: Record<string, unknown> | null = null;
  if (evalResult?.ocrMeta) {
    try {
      metaObj = JSON.parse(evalResult.ocrMeta) as Record<string, unknown>;
    } catch {
      metaObj = null;
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4 text-[var(--tl-ink)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-[var(--tl-ink)]">{t("ocrEval.title")}</h1>
          <p className="mt-1 max-w-2xl text-xs text-[var(--tl-muted)]">
            {t("ocrEval.description")}
          </p>
        </div>
        <button
          type="button"
          className="rounded bg-[var(--tl-btn-muted)] px-3 py-1.5 text-sm text-[var(--tl-ink)] hover:opacity-90"
          onClick={() => void refreshList()}
          disabled={loadingList}
        >
          {t("ocrEval.refreshList")}
        </button>
      </div>

      {listErr && <p className="text-sm text-[var(--tl-status-bad)]">{listErr}</p>}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col rounded border border-[var(--tl-line)] bg-[var(--tl-surface)]">
          <div className="border-b border-[var(--tl-line)] px-3 py-2 text-xs font-medium text-[var(--tl-muted)]">
            {t("ocrEval.recentScreenshots")}
            {loadingList ? `（${t("ocrEval.loading")}）` : `（${rows.length}）`}
          </div>
          <ul className="min-h-0 flex-1 overflow-auto text-sm">
            {rows.map((r) => {
              const active = r.snapshotId === selectedId;
              return (
                <li key={r.snapshotId}>
                  <button
                    type="button"
                    className={`w-full border-b border-[var(--tl-line)] px-3 py-2 text-left hover:bg-[var(--tl-list-hover)] ${
                      active ? "bg-[var(--tl-row-selected)]" : ""
                    }`}
                    onClick={() => void runEval(r.snapshotId)}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--tl-muted)]">
                      <span>{formatTime(r.capturedAtMs)}</span>
                      <span>{r.appName}</span>
                      {r.ocrStatus && (
                        <span className="rounded bg-[var(--tl-btn-muted)] px-1.5 py-0.5 text-[10px] uppercase text-[var(--tl-ink)]">
                          {r.ocrStatus}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-[var(--tl-ink)]/90">
                      {r.windowTitle || t("common.noTitle")}
                    </div>
                    {r.ocrTextPreview && (
                      <div className="mt-1 line-clamp-2 font-mono text-[11px] text-[var(--tl-muted)]">
                        {r.ocrTextPreview}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
            {!loadingList && rows.length === 0 && (
              <li className="p-4 text-sm text-[var(--tl-muted)]">{t("ocrEval.noScreenshots")}</li>
            )}
          </ul>
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-auto">
          {selectedId && (
            <div className="overflow-hidden rounded border border-[var(--tl-line)] bg-[var(--tl-surface)]">
              <img
                src={snapshotTimelensUrl(selectedId)}
                alt="截图预览"
                className="max-h-48 w-full object-contain bg-[var(--tl-img-placeholder-bg)]"
              />
            </div>
          )}

          {loadingEval && (
            <p className="text-sm text-[var(--tl-muted)]">{t("ocrEval.recognizing")}</p>
          )}
          {evalErr && <p className="text-sm text-[var(--tl-status-bad)]">{evalErr}</p>}

          {evalResult && (
            <div className="space-y-3 rounded border border-[var(--tl-line)] bg-[var(--tl-surface)] p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={evalResult.ok ? "text-[var(--tl-status-ok)]" : "text-[var(--tl-status-warn)]"}
                >
                  {evalResult.ok ? t("ocrEval.recognitionComplete") : t("ocrEval.recognitionFailed")}
                </span>
                <span className="text-[var(--tl-muted)]">{t("ocrEval.duration", { ms: evalResult.durationMs })}</span>
              </div>
              {evalResult.errorMessage && (
                <p className="rounded border border-[var(--tl-error-border)] bg-[var(--tl-error-bg)] p-2 text-xs text-[var(--tl-error-text)]">
                  {evalResult.errorMessage}
                </p>
              )}

              <div className="rounded bg-[var(--tl-pre-bg)] p-2 font-mono text-[11px] text-[var(--tl-muted)]">
                <div>lang: {evalResult.pipeline.languages}</div>
                <div>psm: {evalResult.pipeline.psm}</div>
                <div>
                  word≥{evalResult.pipeline.wordConfMin} line≥
                  {evalResult.pipeline.lineConfMin}
                </div>
                <div>
                  preprocess: scale={evalResult.pipeline.preprocessScale ? "on" : "off"}{" "}
                  invert={evalResult.pipeline.preprocessDarkInvert ? "on" : "off"}
                </div>
              </div>

              {metaObj && (
                <div className="text-xs text-[var(--tl-muted)]">
                  <span>{t("ocrEval.gateStats")}</span>
                  {String(metaObj.linesKept ?? "—")} {t("ocrEval.linesKeptDropped", { dropped: String(metaObj.linesDropped ?? "—") })}{" "}
                  {String(metaObj.avgLineConf ?? "—")}
                </div>
              )}

              {evalResult.summaryLine && (
                <div>
                  <div className="text-xs text-[var(--tl-muted)]">{t("ocrEval.summaryCandidate")}</div>
                  <p className="mt-1 text-[var(--tl-ink)]/90">{evalResult.summaryLine}</p>
                </div>
              )}

              <div>
                <div className="text-xs text-[var(--tl-muted)]">{t("ocrEval.finalText")}</div>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-[var(--tl-pre-bg)] p-2 font-mono text-xs text-[var(--tl-ink)]/90">
                  {evalResult.finalText || t("common.empty")}
                </pre>
              </div>

              <div>
                <div className="mb-2 text-xs text-[var(--tl-muted)]">
                  {t("ocrEval.lineDetails")}
                </div>
                <ul className="max-h-56 space-y-1 overflow-auto text-xs">
                  {evalResult.lines.map((line: OcrEvalLine, i: number) => (
                    <li
                      key={`${i}-${line.text.slice(0, 12)}`}
                      className={`rounded border px-2 py-1 ${
                        line.kept
                          ? "border-[var(--tl-line)] bg-[var(--tl-glass-20)]"
                          : "border-[var(--tl-line)] bg-[var(--tl-surface-deep)] opacity-75"
                      }`}
                    >
                      <div className="flex flex-wrap gap-2 text-[10px] text-[var(--tl-muted)]">
                        <span>conf {line.avgConf}</span>
                        <span>{line.kept ? t("ocrEval.kept") : t("ocrEval.dropped")}</span>
                        {!line.kept && line.dropReason && (
                          <span>{dropReasonLabel(line.dropReason)}</span>
                        )}
                      </div>
                      <div className="mt-0.5 font-mono text-[var(--tl-ink)]/90">
                        {line.text || t("common.emptyLine")}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {!selectedId && !loadingList && (
            <p className="text-sm text-[var(--tl-muted)]">{t("ocrEval.clickToEval")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
