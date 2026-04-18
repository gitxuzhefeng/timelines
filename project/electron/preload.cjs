/**
 * 必须使用 CommonJS + require：在 sandbox: true 时，沙箱预加载脚本不能使用 ESM import，
 * 否则打包后 preload 可能静默失败，导致 window.timelensDesktop 未注入。
 * @see https://www.electronjs.org/docs/latest/tutorial/esm
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("timelensDesktop", {
  isElectron: true,

  invoke(command, args) {
    return ipcRenderer.invoke("timelens:invoke", command, args ?? {});
  },

  snapshotUrl(snapshotId) {
    return ipcRenderer.sendSync("timelens:snapshot-url-sync", snapshotId);
  },

  async listen(channel, handler) {
    const ipcChannel = `timelens:event:${channel}`;
    const listener = (_event, payload) => {
      handler(payload);
    };
    ipcRenderer.on(ipcChannel, listener);
    return () => {
      ipcRenderer.removeListener(ipcChannel, listener);
    };
  },

  /** 订阅主进程调试日志（与开发模式面板联动） */
  subscribeMainLog(handler) {
    const fn = (_event, payload) => {
      handler(payload);
    };
    ipcRenderer.on("timelens:debug-log", fn);
    return () => {
      ipcRenderer.removeListener("timelens:debug-log", fn);
    };
  },
});
