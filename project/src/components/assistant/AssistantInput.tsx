import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ContextChips } from "./ContextChips";

interface Props {
  contextType: string;
  contextDate: string;
  loading: boolean;
  onSend: (question: string) => void;
}

export function AssistantInput({ contextType, contextDate, loading, onSend }: Props) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    onSend(q);
  }, [input, loading, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-[var(--tl-line)] bg-[var(--tl-surface)] px-3 py-2">
      <ContextChips contextType={contextType} contextDate={contextDate} />
      <div className="mt-1 flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder={t("assistant.inputPlaceholder")}
          rows={1}
          className="min-h-[2.2rem] max-h-24 flex-1 resize-none rounded-lg border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-3 py-2 text-sm text-[var(--tl-ink)] placeholder:text-[var(--tl-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--tl-cyan)] disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="rounded-lg bg-[var(--tl-cyan)] px-3 py-2 text-sm font-medium text-[var(--tl-bg)] hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {t("assistant.send")}
        </button>
      </div>
    </div>
  );
}

export function setInputValue(ref: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  if (ref.current) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    nativeInputValueSetter?.call(ref.current, value);
    ref.current.dispatchEvent(new Event("input", { bubbles: true }));
  }
}
