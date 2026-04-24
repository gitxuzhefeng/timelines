/** 与产品内分析维度一致的预设 Intent（与内置字典、时间线配色逻辑对齐）。 */
export const INTENT_PRESET_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "未分类" },
  { value: "编码开发", label: "编码开发" },
  { value: "研究检索", label: "研究检索" },
  { value: "通讯沟通", label: "通讯沟通" },
];

export const BUILTIN_INTENT_COLORS: Record<string, string> = {
  "编码开发": "#00f5d4",
  "研究检索": "#bd93f9",
  "通讯沟通": "#61afef",
  "其他": "#6b7280",
};

export const INTENT_FALLBACK_COLOR = "#6b7280";

export type IntentSourceFilter = "all" | "none" | "builtin" | "user";

export function intentSourceLabel(src: string): string {
  switch (src) {
    case "user":
      return "手动";
    case "builtin":
      return "内置";
    case "none":
      return "未映射";
    default:
      return src;
  }
}
