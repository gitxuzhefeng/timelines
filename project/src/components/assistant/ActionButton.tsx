import { useTranslation } from "react-i18next";
import type { AssistantAction } from "../../lib/assistantActions";
import { executeAction } from "../../lib/assistantActions";
import { useNavigate } from "react-router-dom";

interface Props {
  action: AssistantAction;
}

export function ActionButton({ action }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => executeAction(action, navigate)}
      className="rounded-md border border-[var(--tl-cyan-dim)] px-2.5 py-1 font-mono text-[0.65rem] text-[var(--tl-cyan)] hover:bg-[var(--tl-nav-hover-bg)] transition-colors"
    >
      {t(`assistant.action.${action.type}`, { param: action.param, defaultValue: action.label })}
    </button>
  );
}
