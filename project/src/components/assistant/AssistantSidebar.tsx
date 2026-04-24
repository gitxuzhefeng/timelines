import { useEffect, useRef, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAssistantSidebarStore } from "../../stores/assistantSidebarStore";
import { useAppStore } from "../../stores/appStore";
import { BriefingCard } from "./BriefingCard";
import { PresetQuestions } from "./PresetQuestions";
import { MessageBubble } from "./MessageBubble";
import { AssistantInput } from "./AssistantInput";

const DEFAULT_PRESETS = [
  "assistant.preset.dailyReview",
  "assistant.preset.segmentExplain",
  "assistant.preset.weeklyCompare",
  "assistant.preset.improveSuggestion",
];

export function AssistantSidebar() {
  const { t } = useTranslation();
  const date = useAppStore((s) => s.date);
  const {
    messages,
    loading,
    historyLoaded,
    contextType,
    contextDate,
    briefing,
    aiAvailable,
    sendMessage,
    clearHistory,
    close,
  } = useAssistantSidebarStore();

  const bottomRef = useRef<HTMLDivElement>(null);
  const [clearConfirm, setClearConfirm] = useState(false);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (historyLoaded) scrollToBottom();
  }, [messages, historyLoaded, scrollToBottom]);

  useEffect(() => {
    useAssistantSidebarStore.getState().loadBriefing(date);
    useAssistantSidebarStore.getState().setContext({ date });
  }, [date]);

  const handleQuestionSelect = useCallback(
    (question: string) => {
      if (!aiAvailable) return;
      void sendMessage(question);
    },
    [aiAvailable, sendMessage],
  );

  const handleClear = async () => {
    if (!clearConfirm) {
      setClearConfirm(true);
      return;
    }
    await clearHistory();
    setClearConfirm(false);
  };

  const showHome = messages.length === 0 && historyLoaded;

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-[var(--tl-line)] bg-[var(--tl-sidebar-bg)]">
      <div className="flex items-center justify-between border-b border-[var(--tl-line)] px-4 py-2.5">
        <div className="font-mono text-[0.62rem] font-semibold uppercase tracking-widest text-[var(--tl-cyan)]">
          ✦ {t("nav.assistant")}
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => void handleClear()}
              className="font-mono text-[0.6rem] text-[var(--tl-muted)] hover:text-[var(--tl-ink)] transition-colors"
            >
              {clearConfirm ? t("assistant.clearConfirm") : t("assistant.clearHistory")}
            </button>
          )}
          <button
            type="button"
            onClick={close}
            className="text-[var(--tl-muted)] hover:text-[var(--tl-ink)] transition-colors text-sm"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {showHome && (
          <div className="space-y-3">
            {briefing && (
              <BriefingCard briefing={briefing} onQuestionSelect={handleQuestionSelect} />
            )}

            {!aiAvailable && (
              <div className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-surface)] px-4 py-3 text-sm text-[var(--tl-muted)]">
                <p>{t("assistant.aiUnavailable")}</p>
                <p className="mt-1 text-[0.75rem]">{t("assistant.configureHint")}</p>
              </div>
            )}

            <div className="pt-2">
              <div className="mb-2 font-mono text-[0.58rem] font-semibold uppercase tracking-widest text-[var(--tl-muted)]">
                {t("assistant.emptyHint").split("\n")[0]}
              </div>
              <PresetQuestions
                questions={briefing?.suggestedQuestions ?? DEFAULT_PRESETS}
                onSelect={handleQuestionSelect}
                disabled={!aiAvailable}
              />
            </div>
          </div>
        )}

        {!showHome &&
          messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}

        {loading && (
          <div className="flex justify-start mb-3">
            <div className="rounded-xl rounded-bl-sm border border-[var(--tl-line)] bg-[var(--tl-surface)] px-4 py-2.5 text-sm text-[var(--tl-muted)]">
              <span className="animate-pulse">{t("assistant.thinking")}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <AssistantInput
        contextType={contextType}
        contextDate={contextDate}
        loading={loading}
        onSend={(q) => void sendMessage(q)}
      />
    </aside>
  );
}
