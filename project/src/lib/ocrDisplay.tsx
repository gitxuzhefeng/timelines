import type { ReactNode } from "react";

export function renderOcrSnippet(snippet: string): ReactNode {
  if (!snippet.trim()) {
    return <span className="text-zinc-500">（暂无匹配片段预览）</span>;
  }
  const parts = snippet.split(/[«»]/);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-amber-500/50 px-0.5 text-zinc-950">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function highlightedFullOcr(text: string, keywords: string[]): ReactNode {
  const kws = keywords.map((k) => k.trim()).filter(Boolean);
  if (!kws.length) {
    return (
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-300">{text}</pre>
    );
  }
  const escaped = kws.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  try {
    const re = new RegExp(`(${escaped})`, "giu");
    const nodes: ReactNode[] = [];
    let last = 0;
    for (const m of text.matchAll(re)) {
      const idx = m.index ?? 0;
      if (idx > last) {
        nodes.push(<span key={`t-${last}-${idx}`}>{text.slice(last, idx)}</span>);
      }
      nodes.push(
        <mark key={`h-${idx}`} className="rounded bg-amber-500/45 px-0.5 text-zinc-950">
          {m[0]}
        </mark>,
      );
      last = idx + m[0].length;
    }
    if (last < text.length) {
      nodes.push(<span key="t-end">{text.slice(last)}</span>);
    }
    return (
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-300">{nodes}</pre>
    );
  } catch {
    return (
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-300">{text}</pre>
    );
  }
}
