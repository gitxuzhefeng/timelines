import type {
  DailyAnalysisClipboardFlow,
  DailyAnalysisDeepSegment,
  DailyAnalysisDto,
  DailyAnalysisTopAppRow,
} from "../types";
import { parseJsonField } from "./jsonSafe";

export type IntentBreakdownMap = Record<string, number>;

export function parseIntentBreakdown(d: DailyAnalysisDto): IntentBreakdownMap {
  const o = parseJsonField<unknown>(d.intentBreakdown, {});
  if (o === null || typeof o !== "object" || Array.isArray(o)) return {};
  const out: IntentBreakdownMap = {};
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export function parseTopApps(d: DailyAnalysisDto): DailyAnalysisTopAppRow[] {
  const arr = parseJsonField<unknown>(d.topApps, []);
  if (!Array.isArray(arr)) return [];
  return arr
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const app = r.app;
      const duration = r.duration_ms ?? r.durationMs;
      if (typeof app !== "string") return null;
      if (typeof duration !== "number" || !Number.isFinite(duration)) return null;
      return { app, duration_ms: duration };
    })
    .filter((x): x is DailyAnalysisTopAppRow => x != null);
}

export function parseDeepWorkSegments(d: DailyAnalysisDto): DailyAnalysisDeepSegment[] {
  const arr = parseJsonField<unknown>(d.deepWorkSegments, []);
  if (!Array.isArray(arr)) return [];
  return arr
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const start = r.start_ms ?? r.startMs;
      const end = r.end_ms ?? r.endMs;
      const dur = r.duration_ms ?? r.durationMs;
      const intent = r.intent;
      if (
        typeof start !== "number" ||
        typeof end !== "number" ||
        typeof dur !== "number" ||
        typeof intent !== "string"
      ) {
        return null;
      }
      return {
        start_ms: start,
        end_ms: end,
        duration_ms: dur,
        intent,
      };
    })
    .filter((x): x is DailyAnalysisDeepSegment => x != null);
}

export function parseTopFlows(d: DailyAnalysisDto): DailyAnalysisClipboardFlow[] {
  const arr = parseJsonField<unknown>(d.topFlows, []);
  if (!Array.isArray(arr)) return [];
  return arr
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const from = r.from;
      const to = r.to;
      const count = r.count;
      if (typeof from !== "string" || typeof to !== "string") return null;
      if (typeof count !== "number" || !Number.isFinite(count)) return null;
      return { from, to, count };
    })
    .filter((x): x is DailyAnalysisClipboardFlow => x != null);
}

export function parseDegradedSections(d: DailyAnalysisDto): string[] {
  const arr = parseJsonField<unknown>(d.degradedSections, []);
  if (!Array.isArray(arr)) return [];
  return arr.filter((x): x is string => typeof x === "string");
}

export interface TopInterrupterRow {
  app: string;
  count: number;
  switch_rate: number | null;
}

export function parseTopInterrupters(d: DailyAnalysisDto): TopInterrupterRow[] {
  const arr = parseJsonField<unknown>(d.topInterrupters, []);
  if (!Array.isArray(arr)) return [];
  return arr
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const app = r.app;
      const count = r.count;
      const sr = r.switch_rate ?? r.switchRate;
      if (typeof app !== "string") return null;
      if (typeof count !== "number" || !Number.isFinite(count)) return null;
      const switch_rate =
        sr === null || sr === undefined
          ? null
          : typeof sr === "number" && Number.isFinite(sr)
            ? sr
            : null;
      return { app, count, switch_rate };
    })
    .filter((x): x is TopInterrupterRow => x != null);
}
