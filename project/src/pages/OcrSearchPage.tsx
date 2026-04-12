import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppStore } from "../stores/appStore";
import * as api from "../services/tauri";
import type { OcrSearchHit, OcrSettingsDto } from "../types";
import { snapshotTimelensUrl } from "../types";
import { highlightedFullOcr, renderOcrSnippet } from "../lib/ocrDisplay";

function fmtSessionRange(startMs: number, endMs: number): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  };
  return `${new Date(startMs).toLocaleString(undefined, opts)} — ${new Date(endMs).toLocaleString(undefined, opts)}`;
}

export default function OcrSearchPage() {
  const navigate = useNavigate();
  const {
    date,
    setDate,
    sessions,
    selectedSessionId,
    clearError,
    error,
  } = useAppStore();

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [ocrCfg, setOcrCfg] = useState<OcrSettingsDto | null>(null);
  const [ocrQuery, setOcrQuery] = useState("");
  const [ocrHits, setOcrHits] = useState<OcrSearchHit[]>([]);
  const [ocrSearchBusy, setOcrSearchBusy] = useState(false);
  const [ocrRestrictSession, setOcrRestrictSession] = useState(false);
  const [selectedOcrHit, setSelectedOcrHit] = useState<OcrSearchHit | null>(null);

  useEffect(() => {
    void api.getOcrSettings().then(setOcrCfg).catch(() => setOcrCfg(null));
  }, []);

  useEffect(() => {
    if (!lightboxSrc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxSrc(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxSrc]);

  const sessionById = useMemo(() => {
    const m = new Map<string, (typeof sessions)[0]>();
    for (const s of sessions) m.set(s.id, s);
    return m;
  }, [sessions]);

  async function runSearch() {
    if (ocrRestrictSession && !selectedSessionId) {
      useAppStore.setState({
        error: "勾选「仅当前会话」时请先在左侧会话页选择一个会话，或取消勾选后全库搜索",
      });
      return;
    }
    setOcrSearchBusy(true);
    try {
      const hits = await api.searchOcrText(
        ocrQuery,
        date,
        ocrRestrictSession && selectedSessionId ? selectedSessionId : null,
      );
      setOcrHits(hits);
      const first = hits[0] ?? null;
      setSelectedOcrHit(first);
    } catch (err) {
      useAppStore.setState({ error: String(err) });
    } finally {
      setOcrSearchBusy(false);
    }
  }

  function openInSessions(hit: OcrSearchHit) {
    void useAppStore.getState().selectSession(hit.sessionId);
    useAppStore.getState().selectSnapshot(hit.snapshotId);
    navigate("/sessions");
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-[var(--tl-ink)]">
      {lightboxSrc ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--tl-overlay-lightbox)] p-4"
          role="dialog"
          aria-modal="true"
          aria-label="截图大图"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded bg-[var(--tl-surface-deep)] px-3 py-1 text-sm text-[var(--tl-ink)] hover:opacity-90"
            onClick={() => setLightboxSrc(null)}
          >
            关闭
          </button>
          <img
            src={lightboxSrc}
            alt="截图大图"
            className="max-h-[92vh] max-w-full object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}

      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--tl-line)] bg-[var(--tl-subheader-bg)] px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight text-[var(--tl-ink)]">OCR 检索</h1>
        <label className="flex items-center gap-2 text-sm text-[var(--tl-muted)]">
          日期
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-2 py-1 text-[var(--tl-ink)]"
          />
        </label>
        <p className="text-xs text-[var(--tl-muted)]">
          多词以空格或逗号分隔，联合匹配（AND）。结果含会话信息、截图与文字。
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Link
            to="/intents"
            className="text-xs text-[var(--tl-muted)] underline-offset-2 hover:text-[var(--tl-ink)] hover:underline"
          >
            应用分组
          </Link>
          <Link
            to="/sessions"
            className="text-xs text-[var(--tl-cyan)] underline-offset-2 hover:underline"
          >
            返回会话
          </Link>
        </div>
      </header>

      {error && (
        <div className="flex items-center justify-between border-b border-[var(--tl-error-border)] bg-[var(--tl-error-bg)] px-4 py-2 text-sm text-[var(--tl-error-text)]">
          {error}
          <button
            type="button"
            className="text-[var(--tl-error-link)] underline"
            onClick={() => clearError()}
          >
            关闭
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {ocrCfg && !ocrCfg.enabled && (
          <div className="border-b border-[var(--tl-warn-amber-border)] bg-[var(--tl-ocr-warn-strip-bg)] px-4 py-3 text-sm text-[var(--tl-ocr-warn-strip-text)]">
            OCR 未开启。请前往
            <Link to="/settings" className="mx-1 underline">
              设置
            </Link>
            开启后再使用本页。
          </div>
        )}

        <div className="border-b border-[var(--tl-line)] bg-[var(--tl-surface)] px-4 py-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[12rem] flex-1 flex-col text-xs text-[var(--tl-muted)]">
              关键词（空格/逗号分隔，联合匹配）
              <input
                type="search"
                value={ocrQuery}
                onChange={(e) => setOcrQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runSearch();
                }}
                className="mt-0.5 rounded border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-2 py-1.5 text-sm text-[var(--tl-ink)]"
                placeholder="例：invoice 2024 或 发票，订单"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 pb-1.5 text-xs text-[var(--tl-muted)]">
              <input
                type="checkbox"
                checked={ocrRestrictSession}
                onChange={(e) => setOcrRestrictSession(e.target.checked)}
                className="rounded border-[var(--tl-line)]"
              />
              仅当前会话
            </label>
            <button
              type="button"
              disabled={ocrSearchBusy || (ocrCfg !== null && !ocrCfg.enabled)}
              className="rounded bg-[var(--tl-btn-muted)] px-4 py-1.5 text-sm text-[var(--tl-ink)] hover:opacity-90 disabled:opacity-40"
              onClick={() => void runSearch()}
            >
              搜索
            </button>
          </div>
          {ocrRestrictSession && (
            <p className="mt-2 text-[11px] text-[var(--tl-muted)]">
              「当前会话」与
              <Link to="/sessions" className="underline">
                会话页
              </Link>
              左侧选中项一致；未选中时会提示错误。
            </p>
          )}
        </div>

        <div className="space-y-4 px-4 py-4">
          {ocrHits.length === 0 ? (
            <p className="text-sm text-[var(--tl-muted)]">
              {ocrSearchBusy ? "搜索中…" : "输入关键词并搜索，或更换日期。"}
            </p>
          ) : (
            <>
              <p className="text-xs text-[var(--tl-muted)]">共 {ocrHits.length} 条</p>
              <ul className="space-y-4">
                {ocrHits.map((hit) => {
                  const sess = sessionById.get(hit.sessionId);
                  const active = selectedOcrHit?.snapshotId === hit.snapshotId;
                  return (
                    <li key={`${hit.snapshotId}-${hit.capturedAtMs}`}>
                      <article
                        onClick={() => setSelectedOcrHit(hit)}
                        className={`cursor-pointer overflow-hidden rounded-xl border border-[var(--tl-line)] bg-[var(--tl-hit-card-bg)] transition-colors hover:opacity-[0.98] ${
                          active
                            ? "ring-1 ring-[var(--tl-hit-card-active-ring)]"
                            : ""
                        }`}
                      >
                        <div className="grid gap-0 lg:grid-cols-[minmax(220px,280px)_1fr]">
                          <div className="space-y-3 border-b border-[var(--tl-line)] p-4 lg:border-b-0 lg:border-r">
                            <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--tl-cyan)]">
                              会话信息
                            </div>
                            <dl className="space-y-2 text-xs">
                              <div>
                                <dt className="text-[10px] uppercase tracking-wide text-[var(--tl-muted)]">
                                  应用
                                </dt>
                                <dd className="font-mono text-[var(--tl-ink)]">{hit.appName}</dd>
                              </div>
                              <div>
                                <dt className="text-[10px] uppercase tracking-wide text-[var(--tl-muted)]">
                                  窗口
                                </dt>
                                <dd className="text-[var(--tl-ink)]/90">{hit.windowTitle || "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-[10px] uppercase tracking-wide text-[var(--tl-muted)]">
                                  场景 / Intent
                                </dt>
                                <dd className="text-[var(--tl-ink)]/90">
                                  {hit.sessionIntent?.trim() ? hit.sessionIntent : "未分类"}
                                </dd>
                              </div>
                              {sess ? (
                                <div>
                                  <dt className="text-[10px] uppercase tracking-wide text-[var(--tl-muted)]">
                                    会话时段
                                  </dt>
                                  <dd className="font-mono text-[11px] text-[var(--tl-muted)]">
                                    {fmtSessionRange(sess.startMs, sess.endMs)}
                                  </dd>
                                </div>
                              ) : null}
                              <div>
                                <dt className="text-[10px] uppercase tracking-wide text-[var(--tl-muted)]">
                                  截图时间
                                </dt>
                                <dd className="font-mono text-[var(--tl-ink)]/90">
                                  {new Date(hit.capturedAtMs).toLocaleString()}
                                </dd>
                              </div>
                            </dl>
                            <button
                              type="button"
                              className="w-full rounded border border-[var(--tl-line)] py-1.5 text-xs text-[var(--tl-ink)] hover:bg-[var(--tl-surface-deep)]"
                              onClick={(e) => {
                                e.stopPropagation();
                                openInSessions(hit);
                              }}
                            >
                              在会话页中打开
                            </button>
                          </div>

                          <div className="grid min-h-0 lg:grid-cols-[minmax(200px,38%)_1fr]">
                            <div className="flex flex-col border-b border-[var(--tl-line)] bg-[var(--tl-surface)] p-3 lg:border-b-0 lg:border-r">
                              <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--tl-purple)]">
                                识别图片
                              </div>
                              <div className="relative mx-auto w-full max-w-md">
                                <div className="absolute left-2 top-2 z-10 flex max-w-[calc(100%-1rem)] flex-wrap gap-1">
                                  {hit.matchedKeywords.map((k) => (
                                    <span
                                      key={k}
                                      className="rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--tl-mark-on-amber)] shadow-sm"
                                    >
                                      {k}
                                    </span>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  className="block w-full cursor-zoom-in border-0 bg-transparent p-0"
                                  title="点击放大"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedOcrHit(hit);
                                    setLightboxSrc(snapshotTimelensUrl(hit.snapshotId));
                                  }}
                                >
                                  <img
                                    src={snapshotTimelensUrl(hit.snapshotId)}
                                    alt="OCR 命中截图"
                                    className="max-h-72 w-full rounded-lg border border-[var(--tl-line)] object-contain shadow-lg"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = "none";
                                    }}
                                  />
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-col gap-3 p-4">
                              <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--tl-purple)]">
                                文字信息
                              </div>
                              {hit.matchedKeywords.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[11px] text-[var(--tl-muted)]">匹配词</span>
                                  {hit.matchedKeywords.map((k) => (
                                    <span
                                      key={k}
                                      className="rounded bg-amber-500/85 px-1.5 py-0.5 text-[11px] font-medium text-[var(--tl-mark-on-amber)]"
                                    >
                                      {k}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div>
                                <div className="mb-1 text-[11px] font-medium text-[var(--tl-muted)]">
                                  匹配片段（FTS）
                                </div>
                                <p className="text-sm text-[var(--tl-ink)]/90">{renderOcrSnippet(hit.matchedSnippet)}</p>
                              </div>
                              <div className="min-h-0 flex-1">
                                <div className="mb-1 text-[11px] font-medium text-[var(--tl-muted)]">
                                  本帧识别全文（脱敏后）
                                </div>
                                {hit.fullOcrText ? (
                                  <div className="max-h-48 overflow-y-auto rounded border border-[var(--tl-line)] bg-[var(--tl-pre-bg)] p-2">
                                    {highlightedFullOcr(hit.fullOcrText, hit.matchedKeywords)}
                                  </div>
                                ) : (
                                  <p className="text-sm text-[var(--tl-muted)]">
                                    （无全文，可能已清理或仅索引片段）
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
