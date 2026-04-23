import { create } from "zustand";

export type AiTaskId = string;

interface AiTask {
  id: AiTaskId;
  labelKey: string;
  startedAt: number;
}

interface AiTaskState {
  tasks: Map<AiTaskId, AiTask>;
  start: (id: AiTaskId, labelKey: string) => void;
  finish: (id: AiTaskId) => void;
  isRunning: (id: AiTaskId) => boolean;
  hasAny: () => boolean;
}

export const useAiTaskStore = create<AiTaskState>((set, get) => ({
  tasks: new Map(),
  start: (id, labelKey) =>
    set((s) => {
      const next = new Map(s.tasks);
      next.set(id, { id, labelKey, startedAt: Date.now() });
      return { tasks: next };
    }),
  finish: (id) =>
    set((s) => {
      const next = new Map(s.tasks);
      next.delete(id);
      return { tasks: next };
    }),
  isRunning: (id) => get().tasks.has(id),
  hasAny: () => get().tasks.size > 0,
}));
