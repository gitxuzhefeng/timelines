import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../services/tauri";
import {
  snapshotTimelensUrl,
  type ContentRecapItemDto,
  type ExternalAiProvider,
} from "../types";
import { useAppStore } from "../stores/appStore";

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TimeReplayPage() {
  const { t } = useTranslation();
  const date = useAppStore((s) => s.date);
  const [items, setItems] = useState<ContentRecapItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [providers, setProviders] = useState<ExternalAiProvider[]>([]);
  const [providerId, setProviderId] = useState("doubao_web");
  const [busySend, setBusySend] = useState(false);
  const [busyExport, setBusyExport] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErr(null);
    api
      .getContentRecap(date, "full_day")
      .then((r) => {
        if (!mounted) return;
        setItems(r.items || []);
        setIdx(0);
      })
      .catch((e) => {
        if (!mounted) return;
        setErr(String(e));
        setItems([]);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [date]);

  useEffect(() => {
    let mounted = true;
    api
      .listExternalAiProviders()
      .then((list) => {
        if (!mounted) return;
        setProviders(list);
        if (list.length > 0) setProviderId(list[0].id);
      })
      .catch(() => {
        if (!mounted) return;
        setProviders([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function sendToAi() {
    setBusySend(true);
    setMsg(null);
    try {
      const res = await api.sendToExternalAiSummary({
        date,
        slice: "full_day",
        providerId,
        autoPaste: true,
      });
      if (res.warning) {
        setMsg({
          ok: true,
          text: t("timeline.externalAi.sendWarning", {
            provider: res.providerLabel,
            warning: res.warning,
            path: res.exportDir,
          }),
        });
      } else {
        setMsg({
          ok: true,
          text: t("timeline.externalAi.sendSuccess", {
            provider: res.providerLabel,
            count: res.screenshotCount,
          }),
        });
      }
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setBusySend(false);
    }
  }

  async function exportBundle() {
    setBusyExport(true);
    setMsg(null);
    try {
      const res = await api.exportExternalAiSummaryBundle(date, "full_day", true);
      setMsg({
        ok: true,
        text: t("timeline.externalAi.exportSuccess", {
          count: res.screenshotCount,
          path: res.exportDir,
        }),
      });
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setBusyExport(false);
    }
  }

  const current = items[idx] ?? null;
  const progress = useMemo(() => {
    if (items.length <= 1) return 0;
    return Math.round((idx / (items.length - 1)) * 100);
  }, [idx, items.length]);

  if (loading) {
    return <p className="p-5 text-sm text-[var(--tl-muted)]">{t("replay.loading")}</p>;
  }
  if (err) {
    return <p className="p-5 text-sm text-[var(--tl-danger)]">{err}</p>;
  }
  if (!current) {
    return <p className="p-5 text-sm text-[var(--tl-muted)]">{t("replay.empty")}</p>;
  }

  return (
    <div className="h-full min-h-0 overflow-auto p-5">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <div className="rounded-xl border border-[var(--tl-line)] bg-[var(--tl-surface)] p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="text-xs text-[var(--tl-muted)]">
              {t("timeline.externalAi.target")}
            </label>
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="rounded border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-2 py-1 text-xs text-[var(--tl-ink)]"
            >
              {(providers.length > 0 ? providers : [{ id: "doubao_web", label: "Doubao (Web)" }]).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busySend}
              onClick={() => void sendToAi()}
              className="rounded border border-[var(--tl-line)] px-2 py-1 text-xs hover:bg-[var(--tl-surface-deep)] disabled:opacity-40"
            >
              {busySend ? t("common.processing") : t("timeline.externalAi.send")}
            </button>
            <button
              type="button"
              disabled={busyExport}
              onClick={() => void exportBundle()}
              className="rounded border border-[var(--tl-line)] px-2 py-1 text-xs hover:bg-[var(--tl-surface-deep)] disabled:opacity-40"
            >
              {busyExport ? t("common.processing") : t("timeline.externalAi.export")}
            </button>
          </div>
          {msg ? (
            <p className={`mb-3 text-xs ${msg.ok ? "text-[var(--tl-success,#4ade80)]" : "text-[var(--tl-danger)]"}`}>
              {msg.text}
            </p>
          ) : null}
          <div className="mb-2 flex items-center justify-between">
            <p className="font-medium text-[var(--tl-ink)]">{t("replay.title")}</p>
            <p className="text-xs text-[var(--tl-muted)]">
              {idx + 1} / {items.length}
            </p>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(items.length - 1, 0)}
            value={idx}
            onChange={(e) => setIdx(Number(e.target.value))}
            className="w-full"
          />
          <p className="mt-1 text-xs text-[var(--tl-muted)]">
            {t("replay.progress", { progress })}
          </p>
        </div>

        <article className="rounded-2xl border border-[var(--tl-line)] bg-[var(--tl-surface)] shadow-sm">
          <div className="border-b border-[var(--tl-line)] px-5 py-4">
            <h2 className="text-lg font-semibold text-[var(--tl-ink)]">{current.windowTitle || t("common.noTitle")}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--tl-muted)]">
              <span>{current.appName}</span>
              <span>{fmtTime(current.capturedAtMs)}</span>
              {current.sessionIntent ? (
                <span className="rounded bg-[var(--tl-accent-12)] px-2 py-0.5 text-[var(--tl-ink)]">
                  {current.sessionIntent}
                </span>
              ) : null}
            </div>
          </div>
          <div className="grid gap-4 p-4 md:grid-cols-[1.35fr_1fr]">
            <div className="overflow-hidden rounded-xl border border-[var(--tl-line)] bg-black/5">
              <img
                src={snapshotTimelensUrl(current.snapshotId)}
                alt={current.windowTitle || ""}
                className="h-full w-full object-cover object-top"
              />
            </div>
            <div className="rounded-xl border border-[var(--tl-line)] bg-[var(--tl-surface-deep)] p-3">
              <p className="mb-2 text-xs font-medium text-[var(--tl-muted)]">{t("replay.ocrPreview")}</p>
              <p className="text-sm leading-6 text-[var(--tl-ink)]">{current.ocrPreview}</p>
            </div>
          </div>
        </article>

        <div className="flex gap-2 overflow-auto pb-1">
          {items.map((item, i) => (
            <button
              key={item.snapshotId}
              type="button"
              className={`shrink-0 rounded-lg border p-1 ${
                i === idx
                  ? "border-[var(--tl-cyan)] bg-[var(--tl-accent-12)]"
                  : "border-[var(--tl-line)] bg-[var(--tl-surface)]"
              }`}
              onClick={() => setIdx(i)}
            >
              <img
                src={snapshotTimelensUrl(item.snapshotId)}
                alt=""
                className="h-14 w-24 rounded object-cover object-top"
              />
              <p className="mt-1 text-[10px] text-[var(--tl-muted)]">{fmtTime(item.capturedAtMs)}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

