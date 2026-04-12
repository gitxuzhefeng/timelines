import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
          aria-label={`选择 ${row.appName}`}
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
          {row.bundleId ? row.bundleId : "（无 Bundle ID）"}
        </div>
        <div className="text-[11px] text-[var(--tl-muted)]/80">历史会话 {row.sessionCount} 条</div>
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
          调整
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
            <option value="__custom__">自定义</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col font-mono text-[0.62rem] text-[var(--tl-muted)]">
          自定义
          <input
            type="text"
            className="mt-0.5 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-2 py-1.5 text-sm text-[var(--tl-ink)]"
            placeholder="可选"
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
          仅此项
        </button>
      </div>
    </div>
  );
}

const SOURCE_FILTERS: { id: IntentSourceFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "none", label: "未映射" },
  { id: "builtin", label: "内置" },
  { id: "user", label: "手动" },
];

export default function IntentManagePage() {
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
        if (!r) throw new Error("选中的行已不在当前列表中，请重试");
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
      !window.confirm(
        "将把「当前还没有分组」的历史会话，按内置字典与你的映射规则自动写入 Intent。\n\n已有 Intent 的会话不会被覆盖。是否继续？",
      )
    ) {
      return;
    }
    setBackfillBusy(true);
    try {
      const n = await api.backfillSessionIntentsFromMappings();
      useAppStore.setState({ error: null });
      await load();
      void refreshSessions();
      window.alert(`已补齐 ${n} 条会话记录的分组字段。`);
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
            <h1 className="text-lg font-semibold tracking-tight">应用分组</h1>
            <p className="text-[0.78rem] leading-relaxed text-[var(--tl-muted)]">
              按「应用名称 + Bundle」管理时间线中的事项类型。保存后会写入映射并<strong className="text-[var(--tl-ink)]/90">同步该应用下全部历史会话</strong>
              ；新会话在聚合时也会自动套用。
            </p>
            <p className="text-[0.72rem] leading-relaxed text-[var(--tl-muted)]">
              系统内置常见桌面应用与 Bundle ID 的<strong className="text-[var(--tl-purple)]">默认分组建议</strong>
              （优先级低于你的手动设置）。安装或升级应用后会自动刷新词表版本。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-capture-idle-bg)] px-3 py-2 text-sm hover:bg-[var(--tl-capture-idle-hover)]"
              onClick={() => void load()}
            >
              刷新
            </button>
            <button
              type="button"
              disabled={backfillBusy}
              className="rounded-lg border border-[var(--tl-btn-violet-border)] bg-[var(--tl-btn-violet-bg)] px-3 py-2 text-sm text-[var(--tl-btn-violet-text)] hover:bg-[var(--tl-btn-violet-bg-hover)] disabled:opacity-40"
              onClick={() => void runBackfill()}
            >
              {backfillBusy ? "补齐中…" : "补齐历史未分组会话"}
            </button>
            <Link
              to="/sessions"
              className="rounded-lg border border-[var(--tl-line)] px-3 py-2 text-sm text-[var(--tl-cyan)] hover:bg-[var(--tl-accent-06)]"
            >
              会话
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-[0.65rem] text-[var(--tl-muted)]">
          <span>共 {stats.total} 个应用键</span>
          <span className="text-[var(--tl-line)]">·</span>
          <span>内置 {stats.builtin}</span>
          <span className="text-[var(--tl-line)]">·</span>
          <span>手动 {stats.user}</span>
          <span className="text-[var(--tl-line)]">·</span>
          <span>未映射 {stats.none}</span>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-panel)] p-3">
          <div className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-[var(--tl-muted)]">
            批量操作
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col font-mono text-[0.62rem] text-[var(--tl-muted)]">
              目标分组
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
                <option value="__custom__">自定义</option>
              </select>
            </label>
            {bulkSelectV === "__custom__" ? (
              <label className="flex min-w-[8rem] flex-1 flex-col font-mono text-[0.62rem] text-[var(--tl-muted)]">
                自定义名称
                <input
                  type="text"
                  value={bulkCustom}
                  onChange={(e) => setBulkCustom(e.target.value)}
                  className="mt-0.5 rounded-lg border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-2 py-1.5 text-sm text-[var(--tl-ink)]"
                  disabled={batchBusy}
                  placeholder="例如：设计创作"
                />
              </label>
            ) : null}
            <button
              type="button"
              disabled={batchBusy || selectedInFilter.length === 0}
              className="rounded-lg bg-[var(--tl-btn-primary-bg)] px-4 py-2 text-sm text-[var(--tl-btn-primary-text)] hover:bg-[var(--tl-btn-primary-bg-hover)] disabled:opacity-40"
              onClick={() => void applyBulk()}
            >
              {batchBusy ? "应用中…" : `应用到选中（${selectedInFilter.length}）`}
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--tl-line)] px-3 py-2 text-sm text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"
              onClick={selectAllFiltered}
            >
              全选列表
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--tl-line)] px-3 py-2 text-sm text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"
              onClick={clearSelection}
              disabled={selected.size === 0}
            >
              清除选择
            </button>
          </div>
          <p className="text-[0.68rem] text-[var(--tl-muted)]">
            先勾选下方列表中的应用，再选择分组并点击「应用到选中」。适合一次性调整多个同类应用。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {SOURCE_FILTERS.map(({ id, label }) => (
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
              {label}
            </button>
          ))}
          <input
            type="search"
            placeholder="搜索应用名、Bundle、当前分组…"
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
            关闭
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        {loading ? (
          <p className="p-4 text-sm text-[var(--tl-muted)]">加载中…</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-[var(--tl-muted)]">
            {rows.length === 0 ? "暂无历史会话数据。" : "没有符合筛选的应用。"}
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
