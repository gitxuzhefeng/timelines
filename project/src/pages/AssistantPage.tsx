import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import * as api from "../services/tauri";
import { useAppStore } from "../stores/appStore";

interface MessageDto {
  id: string;
  role: string;
  content: string;
  createdAt: number;
}

// Parse [ACTION:page:param] tags from assistant message
function parseActions(content: string): { text: string; actions: { page: string; param: string; label: string }[] } {
  const actions: { page: string; param: string; label: string }[] = [];
  const cleaned = content.replace(/\[ACTION:(\w+):([^\]]+)\]/g, (_match, page, param) => {
    actions.push({ page, param, label: `${page}:${param}` });
    return "";
  }).trim();
  return { text: cleaned, actions };
}

interface InsightCardProps {
  date: string;
}

interface AssistantContext {
  flow_score_avg?: number;
  deep_work_minutes?: number;
  fragmentation_pct?: number;
  total_active_minutes?: number;
}

function InsightCard({ date }: InsightCardProps) {
  const { t } = useTranslation();
  const [insight, setInsight] = useState<string | null>(null);

  useEffect(() => {
    api.getAssistantContext(date).then((ctx) => {
      if (!ctx) {
        setInsight(null);
        return;
      }
      const typed = ctx as AssistantContext;
      const flowScore = typeof typed.flow_score_avg === "number" ? typed.flow_score_avg : null;
      const deepWork = typeof typed.deep_work_minutes === "number" ? typed.deep_work_minutes : 0;
      const fragPct = typeof typed.fragmentation_pct === "number" ? typed.fragmentation_pct : 0;
      const activeMin = typeof typed.total_active_minutes === "number" ? typed.total_active_minutes : 0;
      if (flowScore != null && flowScore > 0.7) {
        setInsight(t("assistant.insightHighFlow", { score: (flowScore * 100).toFixed(0) }));
      } else if (fragPct > 60) {
        setInsight(t("assistant.insightHighFrag", { pct: fragPct.toFixed(0) }));
      } else if (deepWork > 90) {
        setInsight(t("assistant.insightDeepWork", { min: deepWork }));
      } else if (activeMin > 0) {
        setInsight(t("assistant.insightActiveTime", { min: activeMin }));
      } else {
        setInsight(null);
      }
    }).catch(() => setInsight(null));
  }, [date, t]);

  if (!insight) return null;

  return (
    <div className="mx-4 mt-3 rounded-lg border border-[var(--tl-cyan-dim)] bg-[var(--tl-surface)] px-4 py-3">
      <div className="font-mono text-[0.6rem] font-semibold uppercase tracking-widest text-[var(--tl-cyan)]">
        {t("assistant.insightTitle")}
      </div>
      <p className="mt-1 text-sm text-[var(--tl-ink)]">{insight}</p>
    </div>
  );
}

interface MessageBubbleProps {
  msg: MessageDto;
  onAction: (page: string, param: string) => void;
}

function MessageBubble({ msg, onAction }: MessageBubbleProps) {
  const { t } = useTranslation();
  const isUser = msg.role === "user";
  const { text, actions } = isUser ? { text: msg.content, actions: [] } : parseActions(msg.content);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={[
          "max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-[var(--tl-cyan)] text-[var(--tl-bg)] rounded-br-sm"
            : "bg-[var(--tl-surface)] text-[var(--tl-ink)] rounded-bl-sm border border-[var(--tl-line)]",
        ].join(" ")}
      >
        <p className="whitespace-pre-wrap">{text}</p>
        {actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {actions.map((a, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onAction(a.page, a.param)}
                className="rounded-md border border-[var(--tl-cyan-dim)] px-2.5 py-1 font-mono text-[0.65rem] text-[var(--tl-cyan)] hover:bg-[var(--tl-nav-hover-bg)] transition-colors"
              >
                {t(`assistant.action.${a.page}`, { param: a.param, defaultValue: a.label })}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AssistantPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const date = useAppStore((s) => s.date);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    api.getAssistantHistory().then((hist) => {
      setMessages(hist);
      setHistoryLoaded(true);
    }).catch(() => setHistoryLoaded(true));
  }, []);

  useEffect(() => {
    if (historyLoaded) scrollToBottom();
  }, [messages, historyLoaded, scrollToBottom]);

  const handleSend = useCallback(async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");

    const optimisticUser: MessageDto = {
      id: `opt-${Date.now()}`,
      role: "user",
      content: q,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setLoading(true);

    try {
      const reply = await api.queryAssistant(q, date);
      // Replace optimistic + add reply
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== optimisticUser.id);
        return [
          ...filtered,
          { id: optimisticUser.id, role: "user", content: q, createdAt: optimisticUser.createdAt },
          { id: reply.id, role: reply.role, content: reply.content, createdAt: reply.createdAt },
        ];
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
      setLoading(false);
    }
  }, [input, loading, date, t]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleClear = async () => {
    if (!clearConfirm) {
      setClearConfirm(true);
      return;
    }
    await api.clearAssistantHistory();
    setMessages([]);
    setClearConfirm(false);
  };

  const handleAction = (page: string, param: string) => {
    switch (page) {
      case "timeline":
        useAppStore.setState({ date: param });
        navigate("/timeline");
        break;
      case "report":
        useAppStore.setState({ date: param });
        navigate("/report");
        break;
      case "lens":
        useAppStore.setState({ date: param });
        navigate("/lens");
        break;
    }
  };

  const quickQuestions = [
    t("assistant.quick1"),
    t("assistant.quick2"),
    t("assistant.quick3"),
  ];

  return (
    <div className="flex h-full flex-col">
      <InsightCard date={date} />

      {/* Message List */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && historyLoaded && (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <div className="font-mono text-[0.75rem] text-[var(--tl-muted)] text-center">
              {t("assistant.emptyHint")}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {quickQuestions.map((q, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setInput(q); textareaRef.current?.focus(); }}
                  className="rounded-lg border border-[var(--tl-line)] bg-[var(--tl-surface)] px-3 py-2 text-sm text-[var(--tl-muted)] hover:bg-[var(--tl-nav-hover-bg)] hover:text-[var(--tl-ink)] transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} onAction={handleAction} />
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

      {/* Input Area */}
      <div className="border-t border-[var(--tl-line)] bg-[var(--tl-sidebar-bg)] px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("assistant.inputPlaceholder")}
            rows={2}
            disabled={loading}
            className="min-h-[2.5rem] flex-1 resize-none rounded-lg border border-[var(--tl-line)] bg-[var(--tl-input-fill)] px-3 py-2 text-sm text-[var(--tl-ink)] placeholder:text-[var(--tl-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--tl-cyan)] disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={loading || !input.trim()}
            className="shrink-0 rounded-lg bg-[var(--tl-cyan)] px-4 py-2.5 text-sm font-semibold text-[var(--tl-bg)] transition-opacity disabled:opacity-40 hover:opacity-90"
          >
            {t("assistant.send")}
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-[0.6rem] text-[var(--tl-muted)]">
            {t("assistant.contextDate", { date })}
          </span>
          <button
            type="button"
            onClick={() => void handleClear()}
            className={`font-mono text-[0.6rem] transition-colors ${
              clearConfirm
                ? "text-[var(--tl-status-bad)]"
                : "text-[var(--tl-muted)] hover:text-[var(--tl-ink)]"
            }`}
          >
            {clearConfirm ? t("assistant.clearConfirm") : t("assistant.clearHistory")}
          </button>
        </div>
      </div>
    </div>
  );
}
