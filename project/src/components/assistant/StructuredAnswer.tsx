import ReactMarkdown from "react-markdown";
import { parseStructuredAnswer } from "../../lib/assistantParsers";
import { ActionButton } from "./ActionButton";
import { useTranslation } from "react-i18next";

interface Props {
  content: string;
}

const SECTION_ICONS: Record<string, string> = {
  conclusion: "◉",
  findings: "◇",
  suggestions: "✦",
  text: "",
};

export function StructuredAnswer({ content }: Props) {
  const { t } = useTranslation();
  const parsed = parseStructuredAnswer(content);
  const hasStructure = parsed.sections.length > 1 || parsed.sections[0]?.type !== "text";

  if (!hasStructure) {
    return (
      <div>
        <div className="prose-sm text-[var(--tl-ink)]">
          <ReactMarkdown>{parsed.cleanText}</ReactMarkdown>
        </div>
        {parsed.actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {parsed.actions.map((a, i) => (
              <ActionButton key={i} action={a} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {parsed.sections.map((section, i) => (
        <div
          key={i}
          className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-surface)] px-3 py-2"
        >
          {section.type !== "text" && (
            <div className="mb-1 font-mono text-[0.58rem] font-semibold uppercase tracking-widest text-[var(--tl-cyan)]">
              {SECTION_ICONS[section.type]} {t(`assistant.answer.${section.type}`)}
            </div>
          )}
          <div className="prose-sm text-sm text-[var(--tl-ink)]">
            <ReactMarkdown>{section.content.trim()}</ReactMarkdown>
          </div>
        </div>
      ))}
      {parsed.actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {parsed.actions.map((a, i) => (
            <ActionButton key={i} action={a} />
          ))}
        </div>
      )}
    </div>
  );
}
