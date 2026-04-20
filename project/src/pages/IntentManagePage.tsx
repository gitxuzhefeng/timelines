import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Virtuoso } from "react-virtuoso";
import {
  INTENT_PRESET_OPTIONS,
  intentSourceLabel,
  type IntentSourceFilter,
} from "../lib/intentPresets";
import * as api from "../services/tauri";
import type { AppIntentAggregate } from "../types";
import { useAppStore } from "../stores/appStore";

function rowKey(r: AppIntentAggregate): string {
  return `${r.appName}\0${r.bundleId ?? ""}`;
}

function sourceBadgeClass(src: string): string {
  if (src === "user") return "bg-[var(--tl-accent-12)] text-[var(--tl-cyan)]";
  if (src === "builtin")
    return "bg-[var(--tl-badge-builtin-bg)] text-[var(--tl-badge-builtin-text)]";
  return "bg-[var(--tl-badge-none-bg)] text-[var(--tl-muted)]";
}

function IntentRow({
  row,
  selected,
  onToggleSelect,
  onSaved,
}: {
  row: AppIntentAggregate;
  selected: boolean;
  onToggleSelect: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [selectV, setSelectV] = useState("");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const r = row.resolvedIntent ?? "";
    if (INTENT_PRESET_OPTIONS.some((o) => o.value === r && o.value !== "")) {
      setSelectV(r);
      setCustom("");
    } else if (r) {
      setSelectV("__custom__");
      setCustom(r);
    } else {
      setSelectV("");
      setCustom("");
    }
  }, [row.resolvedIntent]);

  async function applyOne() {
    let next: string | null = null;
    if (selectV === "__custom__") {
      const t = custom.trim();
      next = t === "" ? null : t;
    } else {
      next = selectV === "" ? null : selectV;
    }
    setBusy(true);
    try {
      await api.setIntentForAppAggregate(row.appName, row.bundleId, next);
      useAppStore.setState({ error: null });
      await onSaved();
    } catch (e) {
      useAppStore.setState({ error: String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-b border-[var(--tl-line)] px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex shrink-0 items-start pt-0.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="mt-0.5 h-4 w-4 rounded border-[var(--tl-line)]"
          aria-label={t("intents.selectApp", { name: row.appName })}
        />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-[var(--tl-ink)]">{row.appName}</span>
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-[0.58rem] font-semibold uppercase tracking-wide ${sourceBadgeClass(row.intentSource)}`}
          >
            {intentSourceLabel(row.intentSource)}
          </span>
        </div>
        <div className="font-mono text-[11px] text-[var(--tl-muted)]">
          {row.bundleId ? row.bundleId : t("intents.noBundleId")}
        </div>
        <div className="text-[11px] text-[var(--tl-muted)]/80">{t("intents.historicalSessions", { count: row.sessionCount })}</div>
      </div>
      <div className="text-[0.78rem] text-[var(--tl-muted)] sm:w-24">
        {row.resolvedIntent?.trim() ? (
          <span className="text-[var(--tl-ink)]">{row.resolvedIntent}</span>
        ) : (
          "—"
        )}
      </div>
      <div className="flex min-w-0 flex-[1.5] flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col font-mono text-[0.62rem] text-[var(--tl-muted)]">
          {t("intents.adjust")}
          <select
            className="mt-0.5 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-2 py-1.5 text-sm text-[var(--tl-ink)]"
            value={selectV === "__custom__" || (selectV === "" && custom) ? "__custom__" : selectV}
            onChange={(e) => {
              const v = e.target.value;
              setSelectV(v);
              if (v !== "__custom__") setCustom("");
            }}
            disabled={busy}
          >
            {INTENT_PRESET_OPTIONS.map((o) => (
              <option key={o.value || "empty"} value={o.value}>
                {o.label}
              </option>
            ))}
            <option value="__custom__">{t("intents.custom")}</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col font-mono text-[0.62rem] text-[var(--tl-muted)]">
          {t("intents.custom")}
          <input
            type="text"
            className="mt-0.5 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-2 py-1.5 text-sm text-[var(--tl-ink)]"
            placeholder={t("intents.optional")}
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              setSelectV("__custom__");
            }}
            disabled={busy}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          className="shrink-0 rounded-lg bg-[var(--tl-btn-primary-bg)] px-3 py-2 text-sm text-[var(--tl-btn-primary-text)] hover:bg-[var(--tl-btn-primary-bg-hover)] disabled:opacity-40"
          onClick={() => void applyOne()}
        >
          {t("intents.thisItemOnly")}
        </button>
      </div>
    </div>
  );
}

const SOURCE_FILTERS: { id: IntentSourceFilter; labelKey: string }[] = [
  { id: "all", labelKey: "intents.filterAll" },
  { id: "none", labelKey: "intents.filterNone" },
  { id: "builtin", labelKey: "intents.filterBuiltin" },
  { id: "user", labelKey: "intents.filterUser" },
];

export default function IntentManagePage() {
  const { t } = useTranslation();
  const clearError = useAppStore((s) => s.clearError);
  const error = useAppStore((s) => s.error);
  const refreshSessions = useAppStore((s) => s.refreshSessions);
  const [rows, setRows] = useState<AppIntentAggregate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState<IntentSourceFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkSelectV, setBulkSelectV] = useState("编码开发");
  const [bulkCustom, setBulkCustom] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const [backfillBusy, setBackfillBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listAppIntentAggregates();
      setRows(list);
    } catch (e) {
      useAppStore.setState({ error: String(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSaved = useCallback(async () => {
    await load();
    void refreshSessions();
  }, [load, refreshSessions]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (sourceFilter !== "all" && r.intentSource !== sourceFilter) return false;
      if (!filter.trim()) return true;
      const q = filter.trim().toLowerCase();
      return (
        r.appName.toLowerCase().includes(q) ||
        (r.bundleId?.toLowerCase().includes(q) ?? false) ||
        (r.resolvedIntent?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, filter, sourceFilter]);

  const stats = useMemo(() => {
    let builtin = 0;
    let user = 0;
    let none = 0;
    for (const r of rows) {
      if (r.intentSource === "builtin") builtin += 1;
      else if (r.intentSource === "user") user += 1;
      else none += 1;
    }
    return { builtin, user, none, total: rows.length };
  }, [rows]);

  const filteredKeys = useMemo(() => new Set(filtered.map(rowKey)), [filtered]);

  const toggleSelect = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAllFiltered = useCallback(() => {
    setSelected(new Set(filtered.map(rowKey)));
  }, [filtered]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const selectedInFilter = useMemo(() => {
    return [...selected].filter((k) => filteredKeys.has(k));
  }, [selected, filteredKeys]);

  const applyBulk = useCallback(async () => {
    if (selectedInFilter.length === 0 || batchBusy) return;
    let intent: string | null;
    if (bulkSelectV === "__custom__") {
      const t = bulkCustom.trim();
      intent = t === "" ? null : t;
    } else {
      intent = bulkSelectV === "" ? null : bulkSelectV;
    }
    setBatchBusy(true);
    try {
      const byKey = new Map(filtered.map((r) => [rowKey(r), r] as const));
      const items = selectedInFilter.map((k) => {
        const r = byKey.get(k);
        if (!r) throw new Error(t("intents.rowNotFound"));
        return {
          appName: r.appName,
          bundleId: r.bundleId,
          intent,
        };
      });
      await api.setIntentForAppAggregatesBatch(items);
      useAppStore.setState({ error: null });
      clearSelection();
      await load();
      void refreshSessions();
    } catch (e) {
      useAppStore.setState({ error: String(e) });
    } finally {
      setBatchBusy(false);
    }
  }, [
    selectedInFilter,
    batchBusy,
    bulkSelectV,
    bulkCustom,
    filtered,
    load,
    refreshSessions,
    clearSelection,
  ]);

  const runBackfill = useCallback(async () => {
    if (backfillBusy) return;
    if (
      !window.confirm(t("intents.backfillConfirm"))
    ) {
      return;
    }
    setBackfillBusy(true);
    try {
      const n = await api.backfillSessionIntentsFromMappings();
      useAppStore.setState({ error: null });
      await load();
      void refreshSessions();
      window.alert(t("intents.backfillSuccess", { count: n }));
    } catch (e) {
      useAppStore.setState({ error: String(e) });
    } finally {
      setBackfillBusy(false);
    }
  }, [backfillBusy, load, refreshSessions]);

  return (
    <div className="flex h-full min-h-0 flex-col text-[var(--tl-ink)]">
      <header className="space-y-3 border-b border-[var(--tl-line)] bg-[var(--tl-subheader-bg)] px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl space-y-2">
            <h1 className="text-lg font-semibold tracking-tight">{t("intents.title")}</h1>
            <p className="text-[0.78rem] leading-relaxed text-[var(--tl-muted)]">
              {t("intents.description")}
            </p>
            <p className="text-[0.72rem] leading-relaxed text-[var(--tl-muted)]">
              {t("intents.builtinDesc")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-capture-idle-bg)] px-3 py-2 text-sm hover:bg-[var(--tl-capture-idle-hover)]"
              onClick={() => void load()}
            >
              {t("intents.refresh")}
            </button>
            <button
              type="button"
              disabled={backfillBusy}
              className="rounded-lg border border-[var(--tl-btn-violet-border)] bg-[var(--tl-btn-violet-bg)] px-3 py-2 text-sm text-[var(--tl-btn-violet-text)] hover:bg-[var(--tl-btn-violet-bg-hover)] disabled:opacity-40"
              onClick={() => void runBackfill()}
            >
              {backfillBusy ? t("intents.backfilling") : t("intents.backfill")}
            </button>
            <Link
              to="/sessions"
              className="rounded-lg border border-[var(--tl-line)] px-3 py-2 text-sm text-[var(--tl-cyan)] hover:bg-[var(--tl-accent-06)]"
            >
              {t("intents.sessions")}
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-[0.65rem] text-[var(--tl-muted)]">
          <span>{t("intents.totalApps", { count: stats.total })}</span>
          <span className="text-[var(--tl-line)]">·</span>
          <span>{t("intents.builtin", { count: stats.builtin })}</span>
          <span className="text-[var(--tl-line)]">·</span>
          <span>{t("intents.manual", { count: stats.user })}</span>
          <span className="text-[var(--tl-line)]">·</span>
          <span>{t("intents.unmapped", { count: stats.none })}</span>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-panel)] p-3">
          <div className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-[var(--tl-muted)]">
            {t("intents.batchOps")}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col font-mono text-[0.62rem] text-[var(--tl-muted)]">
              {t("intents.targetGroup")}
              <select
                value={bulkSelectV}
                onChange={(e) => setBulkSelectV(e.target.value)}
                className="mt-0.5 min-w-[9rem] rounded-lg border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-2 py-1.5 text-sm text-[var(--tl-ink)]"
                disabled={batchBusy}
              >
                {INTENT_PRESET_OPTIONS.map((o) => (
                  <option key={o.value || "empty"} value={o.value}>
                    {o.label}
                  </option>
                ))}
                <option value="__custom__">{t("intents.custom")}</option>
              </select>
            </label>
            {bulkSelectV === "__custom__" ? (
              <label className="flex min-w-[8rem] flex-1 flex-col font-mono text-[0.62rem] text-[var(--tl-muted)]">
                {t("intents.customName")}
                <input
                  type="text"
                  value={bulkCustom}
                  onChange={(e) => setBulkCustom(e.target.value)}
                  className="mt-0.5 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-2 py-1.5 text-sm text-[var(--tl-ink)]"
                  disabled={batchBusy}
                  placeholder={t("intents.customNamePlaceholder")}
                />
              </label>
            ) : null}
            <button
              type="button"
              disabled={batchBusy || selectedInFilter.length === 0}
              className="rounded-lg bg-[var(--tl-btn-primary-bg)] px-4 py-2 text-sm text-[var(--tl-btn-primary-text)] hover:bg-[var(--tl-btn-primary-bg-hover)] disabled:opacity-40"
              onClick={() => void applyBulk()}
            >
              {batchBusy ? t("intents.applying") : t("intents.applyToSelected", { count: selectedInFilter.length })}
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--tl-line)] px-3 py-2 text-sm text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"
              onClick={selectAllFiltered}
            >
              {t("intents.selectAll")}
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--tl-line)] px-3 py-2 text-sm text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"
              onClick={clearSelection}
              disabled={selected.size === 0}
            >
              {t("intents.clearSelection")}
            </button>
          </div>
          <p className="text-[0.68rem] text-[var(--tl-muted)]">
            {t("intents.batchInstructions")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {SOURCE_FILTERS.map(({ id, labelKey }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSourceFilter(id)}
              className={[
                "rounded-full px-3 py-1 font-mono text-[0.65rem] font-medium transition-colors",
                sourceFilter === id
                  ? "bg-[var(--tl-accent-12)] text-[var(--tl-cyan)]"
                  : "bg-[var(--tl-filter-pill-idle)] text-[var(--tl-muted)] hover:text-[var(--tl-ink)]",
              ].join(" ")}
            >
              {t(labelKey)}
            </button>
          ))}
          <input
            type="search"
            placeholder={t("intents.searchPlaceholder")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="ml-auto min-w-[12rem] flex-1 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-3 py-1.5 text-sm text-[var(--tl-ink)] sm:max-w-xs"
          />
        </div>
      </header>

      {error ? (
        <div className="flex items-center justify-between border-b border-[var(--tl-error-border)] bg-[var(--tl-error-bg)] px-4 py-2 text-sm text-[var(--tl-error-text)]">
          {error}
          <button type="button" className="text-[var(--tl-error-link)] underline" onClick={() => clearError()}>
            {t("common.close")}
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        {loading ? (
          <p className="p-4 text-sm text-[var(--tl-muted)]">{t("intents.loading")}</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-[var(--tl-muted)]">
            {rows.length === 0 ? t("intents.noSessionData") : t("intents.noMatchingApps")}
          </p>
        ) : (
          <Virtuoso
            data={filtered}
            className="h-full"
            itemContent={(_, r) => (
              <IntentRow
                row={r}
                selected={selected.has(rowKey(r))}
                onToggleSelect={() => toggleSelect(rowKey(r))}
                onSaved={onSaved}
              />
            )}
            computeItemKey={(_, r) => rowKey(r)}
          />
        )}
      </div>
    </div>
  );
}
