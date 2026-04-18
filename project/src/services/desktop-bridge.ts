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
  if (typeof d?.invoke === "function") {
    return d.invoke<T>(command, args);
  }
  const { invoke, isTauri } = await import("@tauri-apps/api/core");
  if (typeof isTauri === "function" && isTauri()) {
    return invoke<T>(command, args);
  }
  throw new Error(
    "TimeLens：未连接桌面后端（既非 Tauri 也未加载 Electron 预加载脚本）。请使用官方桌面安装包，或从源码以 Electron/Tauri 启动。",
  );
}

export async function bridgeListen<T>(
  channel: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  const d = getDesktop();
  if (typeof d?.listen === "function") {
    return d.listen<T>(channel, handler);
  }
  const { isTauri } = await import("@tauri-apps/api/core");
  if (typeof isTauri === "function" && isTauri()) {
    const { listen } = await import("@tauri-apps/api/event");
    return listen<T>(channel, (e) => handler(e.payload));
  }
  throw new Error(
    "TimeLens：未连接桌面事件通道。请使用官方桌面安装包，或从源码以 Electron/Tauri 启动。",
  );
}
