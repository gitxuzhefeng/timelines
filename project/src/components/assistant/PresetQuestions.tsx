import { useTranslation } from "react-i18next";

interface Props {
  questions: string[];
  onSelect: (question: string) => void;
  disabled?: boolean;
}

export function PresetQuestions({ questions, onSelect, disabled }: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-2">
      {questions.map((key) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(t(key))}
          className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-surface)] px-3 py-2 text-sm text-[var(--tl-muted)] hover:bg-[var(--tl-nav-hover-bg)] hover:text-[var(--tl-ink)] transition-colors disabled:opacity-40"
        >
          {t(key)}
        </button>
      ))}
    </div>
  );
}
