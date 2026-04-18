import type { InvokeArgs } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";

function getDesktop(): Window["timelensDesktop"] {
  return window.timelensDesktop;
}

export function isElectronShell(): boolean {
  return getDesktop()?.isElectron === true;
}

export async function bridgeInvoke<T>(
  command: string,
  args?: InvokeArgs,
): Promise<T> {
  const d = getDesktop();
  if (d?.invoke) {
    return d.invoke<T>(command, args);
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export async function bridgeListen<T>(
  channel: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  const d = getDesktop();
  if (d?.listen) {
    return d.listen<T>(channel, handler);
  }
  const { listen } = await import("@tauri-apps/api/event");
  return listen<T>(channel, (e) => handler(e.payload));
}
