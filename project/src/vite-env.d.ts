/// <reference types="vite/client" />

import type { InvokeArgs } from "@tauri-apps/api/core";

declare global {
  interface TimelensDesktopBridge {
    readonly isElectron?: boolean;
    invoke<T>(command: string, args?: InvokeArgs): Promise<T>;
    /** Electron：本地 HTTP 截图预览（供 `<img src>` 同步拼接） */
    snapshotUrl?(snapshotId: string): string;
    listen<T>(
      channel: string,
      handler: (payload: T) => void,
    ): Promise<() => void>;
    /** 主进程调试日志（开发模式面板） */
    subscribeMainLog?(handler: (payload: unknown) => void): () => void;
  }

  interface Window {
    timelensDesktop?: TimelensDesktopBridge;
  }
}

export {};
