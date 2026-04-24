export type AssistantContextType = "daily" | "weekly" | "time_segment";

export interface ContextOverride {
  contextType?: AssistantContextType;
  date?: string;
  weekStart?: string | null;
  segmentStartMs?: number | null;
  segmentEndMs?: number | null;
}

export type PageId = "lens" | "timeline" | "report" | "weekly" | "assistant";

export function buildContextForPage(
  page: PageId,
  date: string,
  extra?: ContextOverride,
): Required<Pick<ContextOverride, "contextType" | "date">> & Omit<ContextOverride, "contextType" | "date"> {
  if (page === "weekly") {
    return {
      contextType: "weekly",
      date,
      weekStart: extra?.weekStart ?? date,
      segmentStartMs: null,
      segmentEndMs: null,
    };
  }

  if (page === "timeline" && extra?.segmentStartMs != null && extra?.segmentEndMs != null) {
    return {
      contextType: "time_segment",
      date,
      weekStart: null,
      segmentStartMs: extra.segmentStartMs,
      segmentEndMs: extra.segmentEndMs,
    };
  }

  return {
    contextType: extra?.contextType ?? "daily",
    date: extra?.date ?? date,
    weekStart: extra?.weekStart ?? null,
    segmentStartMs: extra?.segmentStartMs ?? null,
    segmentEndMs: extra?.segmentEndMs ?? null,
  };
}
