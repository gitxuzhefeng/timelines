import { useTranslation } from "react-i18next";
import { useAiTaskStore } from "../stores/aiTaskStore";

export function AiTaskBanner() {
  const { t } = useTranslation();
  const tasks = useAiTaskStore((s) => s.tasks);

  if (tasks.size === 0) return null;

  const entries = Array.from(tasks.values());

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-1.5">
      {entries.map((task) => (
        <div
          key={task.id}
          className="flex items-center gap-2 rounded-lg border border-[var(--tl-cyan-dim)] bg-[var(--tl-surface)] px-3 py-2 shadow-lg"
        >
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--tl-cyan)]" />
          <span className="text-xs text-[var(--tl-ink)]">
            {t(task.labelKey)}
          </span>
        </div>
      ))}
    </div>
  );
}
