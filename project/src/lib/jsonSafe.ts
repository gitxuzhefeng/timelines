/** 解析后端存储的 JSON 字符串，失败时返回 fallback，避免渲染崩溃 */
export function parseJsonField<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
