/// <reference types="vite/client" />

import type { InvokeArgs } from "@tauri-apps/api/core";

declare global {
  interface TimelensDesktopBridge {
    readonly isElectron?: boolean;
    invoke<T>(command: string, args?: InvokeArgs): Promise<T>;
    listen<T>(
      channel: string,
      handler: (payload: T) => void,
    ): Promise<() => void>;
  }

  interface Window {
    timelensDesktop?: TimelensDesktopBridge;
  }
}

export {};
