import type { NavigateFunction } from "react-router-dom";
import { useAppStore } from "../stores/appStore";

export interface AssistantAction {
  type: string;
  param: string;
  label: string;
}

export function parseActions(content: string): { cleanText: string; actions: AssistantAction[] } {
  const actions: AssistantAction[] = [];
  const cleanText = content
    .replace(/\[ACTION:([\w-]+):([^\]]+)\]/g, (_match, type, param) => {
      actions.push({ type, param, label: `${type}:${param}` });
      return "";
    })
    .trim();
  return { cleanText, actions };
}

export function executeAction(action: AssistantAction, navigate: NavigateFunction): void {
  const setDate = useAppStore.getState().setDate;
  switch (action.type) {
    case "timeline":
      setDate(action.param);
      navigate("/timeline");
      break;
    case "report":
      setDate(action.param);
      navigate("/report");
      break;
    case "lens":
      setDate(action.param);
      navigate("/lens");
      break;
    case "weekly":
      navigate(`/weekly?weekStart=${encodeURIComponent(action.param)}`);
      break;
    case "compare":
      setDate(action.param);
      navigate("/report");
      break;
    default:
      break;
  }
}
