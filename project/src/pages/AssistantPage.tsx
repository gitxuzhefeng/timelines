import { useEffect, useRef, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../services/tauri";
import { useAiTaskStore } from "../stores/aiTaskStore";
import { useAppStore } from "../stores/appStore";
import { BriefingCard } from "../components/assistant/BriefingCard";
import { PresetQuestions } from "../components/assistant/PresetQuestions";
import { MessageBubble } from "../components/assistant/MessageBubble";
import { AssistantInput } from "../components/assistant/AssistantInput";

const DEFAULT_PRESETS = [
  "assistant.quick1",
  "assistant.quick2",
  "assistant.quick3",
];

export default function AssistantPage() {
  const { t } = useTranslation();
  const date = useAppStore((s) => s.date);
  const [messages, setMessages] = useState<api.AssistantMessageDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [briefing, setBriefing] = useState<api.BriefingDto | null>(null);
  const startAiTask = useAiTaskStore((s) => s.start);
  const finishAiTask = useAiTaskStore((s) => s.finish);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    api.getAssistantHistory().then((hist) => {
      setMessages(hist);
      setHistoryLoaded(true);
    }).catch(() => setHistoryLoaded(true));
    api.getTodayBriefing(date).then(setBriefing).catch(() => setBriefing(null));
  }, [date]);

  useEffect(() => {
    if (historyLoaded) scrollToBottom();
  }, [messages, historyLoaded, scrollToBottom]);

  const handleSend = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;

    const optimisticUser: api.AssistantMessageDto = {
      id: `opt-${Date.now()}`,
      role: "user",
      content: q,
      createdAt: Date.now(),
    };
    const taskId = `assistant:${optimisticUser.id}`;
    setMessages((prev) => [...prev, optimisticUser]);
    setLoading(true);
    startAiTask(taskId, "common.aiTaskAssistant");

    try {
      const reply = await api.queryAssistant(q, date);
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== optimisticUser.id);
        return [...filtered, optimisticUser, reply];
      });
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: t("assistant.error", { error: String(e) }),
          createdAt: Date.now(),
        },
      ]);
    } finally {
      finishAiTask(taskId);
      setLoading(false);
    }
  }, [date, finishAiTask, loading, startAiTask, t]);

  const handleClear = async () => {
    if (!clearConfirm) {
      setClearConfirm(true);
      return;
    }
    await api.clearAssistantHistory();
    setMessages([]);
    setClearConfirm(false);
  };

  return (
    <div className="flex h-full flex-col p-4">
      {briefing && <BriefingCard briefing={briefing} onQuestionSelect={(q) => void handleSend(q)} />}

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 && historyLoaded && (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <div className="font-mono text-[0.75rem] text-[var(--tl-muted)] text-center">
              {t("assistant.emptyHint")}
            </div>
            <PresetQuestions
              questions={briefing?.suggestedQuestions ?? DEFAULT_PRESETS}
              onSelect={(q) => void handleSend(q)}
            />
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {loading && (
          <div className="flex justify-start mb-3">
            <div className="rounded-xl rounded-bl-sm border border-[var(--tl-line)] bg-[var(--tl-surface)] px-4 py-2.5 text-sm text-[var(--tl-muted)]">
              <span className="animate-pulse">{t("assistant.thinking")}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => void handleClear()}
          className="font-mono text-[0.65rem] text-[var(--tl-muted)] hover:text-[var(--tl-ink)] transition-colors"
        >
          {clearConfirm ? t("assistant.clearConfirm") : t("assistant.clearHistory")}
        </button>
      </div>

      <div className="mt-2">
        <AssistantInput
          contextType="daily"
          contextDate={date}
          loading={loading}
          onSend={(q) => void handleSend(q)}
        />
      </div>
    </div>
  );
}
