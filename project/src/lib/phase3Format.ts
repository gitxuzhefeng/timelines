/** 本地日期的时段（与 PRD 一致） */
export type Daypart = "morning" | "midday" | "afternoon" | "evening";

export const DAYPART_ORDER: { key: Daypart; label: string }[] = [
  { key: "morning", label: "上午" },
  { key: "midday", label: "午间" },
  { key: "afternoon", label: "下午" },
  { key: "evening", label: "晚上" },
];

export function daypartFromStartMs(startMs: number): Daypart {
  const h = new Date(startMs).getHours();
  if (h < 12) return "morning";
  if (h < 14) return "midday";
  if (h < 18) return "afternoon";
  return "evening";
}

export function formatDurationMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h} 小时 ${mm} 分`;
}

/** 时间线卡片副行：如 28分、1时18分 */
export function formatDurationShortMs(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1分";
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0 ? `${h}时` : `${h}时${mm}分`;
}

export function zhDateLabel(isoDate: string): string {
  const parts = isoDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return isoDate;
  const [y, mo, d] = parts;
  const dt = new Date(y, mo - 1, d);
  const w = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][dt.getDay()] ?? "";
  return `${y}年${mo}月${d}日 · ${w}`;
}

const EN_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function enDateLabel(isoDate: string): string {
  const parts = isoDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return isoDate;
  const [y, mo, d] = parts;
  const dt = new Date(y, mo - 1, d);
  const w = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dt.getDay()] ?? "";
  return `${EN_MONTHS[mo - 1]} ${d}, ${y} · ${w}`;
}

/** Returns locale-aware date label (zh or en) */
export function localeDateLabel(isoDate: string, locale: string): string {
  return locale.startsWith("zh") ? zhDateLabel(isoDate) : enDateLabel(isoDate);
}

/** 从事实报告 Markdown 取首段可读摘要（跳过标题行） */
export function extractReportNarrativeSnippet(md: string, maxLen = 480): string {
  const t = md.trim();
  if (!t) return "";
  const lines = t.split("\n");
  const buf: string[] = [];
  for (const line of lines) {
    const s = line.trim();
    if (!s) continue;
    if (s.startsWith("#")) continue;
    buf.push(s);
    if (buf.join(" ").length >= maxLen) break;
  }
  let out = buf.join(" ").slice(0, maxLen).trim();
  if (out.length >= maxLen) out += "…";
  return out;
}
