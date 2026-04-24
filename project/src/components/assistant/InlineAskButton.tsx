import { useTranslation } from "react-i18next";
import { useAssistantSidebarStore } from "../../stores/assistantSidebarStore";
import type { AssistantContextType } from "../../lib/assistantContext";

interface Props {
  contextType: AssistantContextType;
  date: string;
  weekStart?: string;
  segmentStartMs?: number;
  segmentEndMs?: number;
  label?: string;
}

export function InlineAskButton({ contextType, date, weekStart, segmentStartMs, segmentEndMs, label }: Props) {
  const { t } = useTranslation();
  const open = useAssistantSidebarStore((s) => s.open);

  const handleClick = () => {
    void open({
      contextType,
      date,
      weekStart: weekStart ?? null,
      segmentStartMs: segmentStartMs ?? null,
      segmentEndMs: segmentEndMs ?? null,
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1 rounded-md border border-[var(--tl-cyan-dim)] px-2 py-1 font-mono text-[0.65rem] text-[var(--tl-cyan)] hover:bg-[var(--tl-nav-hover-bg)] transition-colors"
    >
      <span>✦</span>
      <span>{label ?? t("assistant.askAboutThis")}</span>
    </button>
  );
}
