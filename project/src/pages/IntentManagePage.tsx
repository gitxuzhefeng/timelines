import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Virtuoso } from "react-virtuoso";
import * as api from "../services/tauri";
import type { AppIntentAggregate } from "../types";
import { useAppStore } from "../stores/appStore";

const INTENT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "未分类（清空规则与会话字段）" },
  { value: "编码开发", label: "编码开发" },
  { value: "研究检索", label: "研究检索" },
  { value: "通讯沟通", label: "通讯沟通" },
];

function rowKey(r: AppIntentAggregate): string {
  return `${r.appName}\0${r.bundleId ?? ""}`;
}

function IntentRow({
  row,
  onSaved,
}: {
  row: AppIntentAggregate;
  onSaved: () => void;
}) {
  const [selectV, setSelectV] = useState("");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const r = row.resolvedIntent ?? "";
    if (INTENT_OPTIONS.some((o) => o.value === r && o.value !== "")) {
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

  async function apply() {
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
    <div className="flex flex-col gap-2 border-b border-zinc-800/90 px-3 py-3 sm:flex-row sm:items-end sm:gap-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="font-medium text-zinc-100">{row.appName}</div>
        <div className="font-mono text-[11px] text-zinc-500">
          {row.bundleId ? row.bundleId : "（无 Bundle ID）"}
        </div>
        <div className="text-[11px] text-zinc-600">历史会话 {row.sessionCount} 条</div>
      </div>
      <div className="flex min-w-0 flex-[2] flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col text-[11px] text-zinc-500">
          预设
          <select
            className="mt-0.5 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
            value={selectV === "__custom__" || (selectV === "" && custom) ? "__custom__" : selectV}
            onChange={(e) => {
              const v = e.target.value;
              setSelectV(v);
              if (v !== "__custom__") setCustom("");
            }}
            disabled={busy}
          >
            {INTENT_OPTIONS.map((o) => (
              <option key={o.value || "empty"} value={o.value}>
                {o.label}
              </option>
            ))}
            <option value="__custom__">自定义</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col text-[11px] text-zinc-500">
          自定义文案
          <input
            type="text"
            className="mt-0.5 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
            placeholder="与预设不同时填写"
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              setSelectV("__custom__");
            }}
            disabled={busy}
          />
        </label>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={busy}
            className="rounded bg-emerald-800 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-40"
            onClick={() => void apply()}
          >
            应用到该应用全部会话
          </button>
        </div>
      </div>
    </div>
  );
}

export default function IntentManagePage() {
  const clearError = useAppStore((s) => s.clearError);
  const error = useAppStore((s) => s.error);
  const refreshSessions = useAppStore((s) => s.refreshSessions);
  const [rows, setRows] = useState<AppIntentAggregate[]>([]);
  const [loading, setLoading] = useState(true);

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

  const [filter, setFilter] = useState("");

  const filtered = rows.filter((r) => {
    if (!filter.trim()) return true;
    const q = filter.trim().toLowerCase();
    return (
      r.appName.toLowerCase().includes(q) ||
      (r.bundleId?.toLowerCase().includes(q) ?? false) ||
      (r.resolvedIntent?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="flex h-full min-h-0 flex-col text-zinc-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight text-white">Intent 管理</h1>
        <p className="max-w-xl text-xs text-zinc-500">
          按「应用名称 + Bundle」分组。保存后写入映射规则，并<strong className="text-zinc-400">批量更新</strong>
          该组下所有历史会话的 Intent；之后新会话也会自动匹配。
        </p>
        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          <input
            type="search"
            placeholder="筛选应用 / Bundle / Intent…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="min-w-[10rem] flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 sm:max-w-xs"
          />
          <button
            type="button"
            className="rounded border border-zinc-600 px-3 py-1 text-sm hover:bg-zinc-800"
            onClick={() => void load()}
          >
            刷新列表
          </button>
          <Link
            to="/sessions"
            className="text-xs text-emerald-400/90 underline-offset-2 hover:underline"
          >
            会话
          </Link>
        </div>
      </header>

      {error && (
        <div className="flex items-center justify-between border-b border-rose-900/50 bg-rose-950/40 px-4 py-2 text-sm text-rose-200">
          {error}
          <button type="button" className="text-rose-400 underline" onClick={() => clearError()}>
            关闭
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1">
        {loading ? (
          <p className="p-4 text-sm text-zinc-500">加载中…</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">
            {rows.length === 0 ? "暂无历史会话数据。" : "没有符合筛选的应用。"}
          </p>
        ) : (
          <Virtuoso
            data={filtered}
            className="h-full"
            itemContent={(_, r) => <IntentRow row={r} onSaved={onSaved} />}
            computeItemKey={(_, r) => rowKey(r)}
          />
        )}
      </div>
    </div>
  );
}
