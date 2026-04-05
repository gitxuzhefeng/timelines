import { useDevModeStore } from "../stores/devModeStore";

export function DevModeSection() {
  const enabled = useDevModeStore((s) => s.enabled);
  const setEnabled = useDevModeStore((s) => s.setEnabled);

  return (
    <section className="mt-8 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-4">
      <h2 className="text-sm font-medium text-[var(--tl-muted)]">开发模式</h2>
      <p className="mt-1 text-xs leading-relaxed text-[var(--tl-muted)]/90">
        开启后在侧栏显示复盘（旧）、会话、OCR、Intent、健康等一期/二期工具入口。状态保存在本机浏览器存储。
      </p>
      <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-[var(--tl-ink)]">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-[var(--tl-line)]"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        启用开发模式
      </label>
    </section>
  );
}
