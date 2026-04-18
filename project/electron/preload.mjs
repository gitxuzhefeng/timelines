import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("timelensDesktop", {
  isElectron: true,

  invoke(command, args) {
    return ipcRenderer.invoke("timelens:invoke", command, args ?? {});
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
});
