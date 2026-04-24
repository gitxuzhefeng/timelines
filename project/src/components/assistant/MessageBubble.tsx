import { StructuredAnswer } from "./StructuredAnswer";

interface MessageDto {
  id: string;
  role: string;
  content: string;
  createdAt: number;
}

interface Props {
  msg: MessageDto;
}

export function MessageBubble({ msg }: Props) {
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[80%] rounded-xl rounded-br-sm bg-[var(--tl-cyan)] px-4 py-2.5 text-sm leading-relaxed text-[var(--tl-bg)]">
          <p className="whitespace-pre-wrap">{msg.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[80%] rounded-xl rounded-bl-sm border border-[var(--tl-line)] bg-[var(--tl-surface)] px-4 py-2.5 text-sm leading-relaxed text-[var(--tl-ink)]">
        <StructuredAnswer content={msg.content} />
      </div>
    </div>
  );
}
