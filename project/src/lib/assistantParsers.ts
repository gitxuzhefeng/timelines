import { parseActions, type AssistantAction } from "./assistantActions";

export interface AnswerSection {
  type: "conclusion" | "findings" | "suggestions" | "text";
  content: string;
}

export interface ParsedAnswer {
  raw: string;
  cleanText: string;
  actions: AssistantAction[];
  sections: AnswerSection[];
}

const SECTION_PATTERNS: Array<{ type: AnswerSection["type"]; patterns: RegExp[] }> = [
  { type: "conclusion", patterns: [/^\*\*结论\*\*/i, /^\*\*Conclusion\*\*/i, /^#{1,3}\s*结论/i, /^#{1,3}\s*Conclusion/i] },
  { type: "findings", patterns: [/^\*\*发现\*\*/i, /^\*\*Findings\*\*/i, /^#{1,3}\s*发现/i, /^#{1,3}\s*Findings/i] },
  { type: "suggestions", patterns: [/^\*\*建议\*\*/i, /^\*\*Suggestions\*\*/i, /^#{1,3}\s*建议/i, /^#{1,3}\s*Suggestions/i] },
];

function matchSection(line: string): AnswerSection["type"] | null {
  for (const entry of SECTION_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(line.trim()))) {
      return entry.type;
    }
  }
  return null;
}

export function parseStructuredAnswer(content: string): ParsedAnswer {
  const { cleanText, actions } = parseActions(content);
  const lines = cleanText.split(/\r?\n/);
  const sections: AnswerSection[] = [];
  let current: AnswerSection | null = null;

  for (const line of lines) {
    const nextType = matchSection(line);
    if (nextType) {
      if (current && current.content.trim()) sections.push(current);
      current = { type: nextType, content: "" };
      continue;
    }
    if (!current) {
      current = { type: "text", content: "" };
    }
    current.content += `${line}\n`;
  }

  if (current && current.content.trim()) {
    sections.push(current);
  }

  return {
    raw: content,
    cleanText,
    actions,
    sections: sections.length > 0 ? sections : [{ type: "text", content: cleanText }],
  };
}
