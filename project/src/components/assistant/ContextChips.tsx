import { useTranslation } from "react-i18next";

interface Props {
  contextType: string;
  contextDate: string;
}

export function ContextChips({ contextType, contextDate }: Props) {
  const { t } = useTranslation();

  const typeLabel =
    contextType === "weekly"
      ? t("assistant.context.weekly")
      : contextType === "time_segment"
        ? t("assistant.context.segment")
        : t("assistant.context.daily");

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 py-1">
      <span className="rounded-md bg-[var(--tl-chip-bg)] px-2 py-0.5 font-mono text-[0.6rem] text-[var(--tl-muted)]">
        {typeLabel} · {contextDate}
      </span>
      <span className="rounded-md bg-[var(--tl-chip-bg)] px-2 py-0.5 font-mono text-[0.6rem] text-[var(--tl-muted)]">
        {t("assistant.context.localOnly")}
      </span>
      <span className="rounded-md bg-[var(--tl-chip-bg)] px-2 py-0.5 font-mono text-[0.6rem] text-[var(--tl-muted)]">
        {t("assistant.context.noScreenshots")}
      </span>
    </div>
  );
}
