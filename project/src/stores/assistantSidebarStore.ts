import { create } from "zustand";
import * as api from "../services/tauri";
import { useAiTaskStore } from "./aiTaskStore";
import { useAppStore } from "./appStore";
import type { AssistantContextType, ContextOverride } from "../lib/assistantContext";

interface AssistantSidebarState {
  isOpen: boolean;
  messages: api.AssistantMessageDto[];
  loading: boolean;
  historyLoaded: boolean;
  contextType: AssistantContextType;
  contextDate: string;
  contextWeekStart: string | null;
  segmentStartMs: number | null;
  segmentEndMs: number | null;
  briefing: api.BriefingDto | null;
  aiAvailable: boolean;
  toggle: () => void;
  open: (ctx?: ContextOverride) => Promise<void>;
  close: () => void;
  setContext: (ctx: ContextOverride) => void;
  loadHistory: () => Promise<void>;
  sendMessage: (question: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  loadBriefing: (date: string) => Promise<void>;
  checkAiAvailability: () => Promise<void>;
}

function applyContext(state: AssistantSidebarState, ctx?: ContextOverride) {
  return {
    contextType: ctx?.contextType ?? state.contextType,
    contextDate: ctx?.date ?? state.contextDate,
    contextWeekStart: ctx?.weekStart ?? state.contextWeekStart,
    segmentStartMs: ctx?.segmentStartMs ?? state.segmentStartMs,
    segmentEndMs: ctx?.segmentEndMs ?? state.segmentEndMs,
  };
}

export const useAssistantSidebarStore = create<AssistantSidebarState>((set, get) => ({
  isOpen: false,
  messages: [],
  loading: false,
  historyLoaded: false,
  contextType: "daily",
  contextDate: useAppStore.getState().date,
  contextWeekStart: null,
  segmentStartMs: null,
  segmentEndMs: null,
  briefing: null,
  aiAvailable: false,

  toggle: () => {
    const next = !get().isOpen;
    set({ isOpen: next });
    if (next) {
      void get().checkAiAvailability();
      if (!get().historyLoaded) void get().loadHistory();
      void get().loadBriefing(get().contextDate);
    }
  },

  open: async (ctx) => {
    set((state) => ({ isOpen: true, ...applyContext(state, ctx) }));
    await Promise.all([get().checkAiAvailability(), get().loadHistory(), get().loadBriefing(get().contextDate)]);
  },

  close: () => set({ isOpen: false }),

  setContext: (ctx) => set((state) => applyContext(state, ctx)),

  loadHistory: async () => {
    try {
      const messages = await api.getAssistantHistory();
      set({ messages, historyLoaded: true });
    } catch {
      set({ historyLoaded: true });
    }
  },

  sendMessage: async (question) => {
    const q = question.trim();
    if (!q || get().loading) return;
    const optimisticUser: api.AssistantMessageDto = {
      id: `opt-${Date.now()}`,
      role: "user",
      content: q,
      createdAt: Date.now(),
    };
    const taskId = `assistant-sidebar:${optimisticUser.id}`;
    set((state) => ({ messages: [...state.messages, optimisticUser], loading: true }));
    useAiTaskStore.getState().start(taskId, "common.aiTaskAssistant");
    try {
      const reply = await api.queryAssistantV2({
        question: q,
        contextType: get().contextType,
        date: get().contextDate,
        weekStart: get().contextWeekStart,
        segmentStartMs: get().segmentStartMs,
        segmentEndMs: get().segmentEndMs,
      });
      set((state) => ({
        messages: [...state.messages.filter((m) => m.id !== optimisticUser.id), optimisticUser, reply],
        loading: false,
      }));
    } catch (error) {
      set((state) => ({
        messages: [
          ...state.messages,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: String(error),
            createdAt: Date.now(),
          },
        ],
        loading: false,
      }));
    } finally {
      useAiTaskStore.getState().finish(taskId);
    }
  },

  clearHistory: async () => {
    await api.clearAssistantHistory();
    set({ messages: [] });
  },

  loadBriefing: async (date) => {
    try {
      const briefing = await api.getTodayBriefing(date);
      set({ briefing });
    } catch {
      set({ briefing: null });
    }
  },

  checkAiAvailability: async () => {
    try {
      const [flags, settings] = await Promise.all([api.getEngineFlags(), api.getAiSettings()]);
      set({ aiAvailable: flags.aiEnabled && settings.hasApiKey });
    } catch {
      set({ aiAvailable: false });
    }
  },
}));
