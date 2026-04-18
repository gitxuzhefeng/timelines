import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  Tray,
} from "electron";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import WebSocket from "ws";

/**
 * 全局 fetch(undici) 会受 HTTP(S)_PROXY 影响，对 127.0.0.1 常表现为 TypeError: fetch failed。
 * 主进程与 timelens-daemon 通信用 node:http 直连，并显式把本地加入 NO_PROXY。
 */
function ensureLocalNoProxy() {
  const must = "127.0.0.1,localhost,::1";
  const cur = process.env.NO_PROXY || process.env.no_proxy || "";
  const parts = cur.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.includes("127.0.0.1")) {
    const next = cur ? `${must},${cur}` : must;
    process.env.NO_PROXY = next;
    process.env.no_proxy = next;
  }
}
ensureLocalNoProxy();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

/** @type {{ port: number | null, token: string | null, child: import("node:child_process").ChildProcess | null, ws: WebSocket | null }} */
const daemonState = {
  port: null,
  token: null,
  child: null,
  ws: null,
};

let mainWindow = null;
/** @type {Tray | null} */
let tray = null;
let isQuitting = false;

const INVOKE_TIMEOUT_MS = 25_000;

/**
 * 守护进程崩溃、半关连接、RST 等会导致 req/res 报 ECONNRESET / socket hang up，
 * 与 ECONNREFUSED 一样适合在 Electron 侧重启 daemon 后重试一次（不包括业务超时）。
 * @param {unknown} e
 */
function isRetriableInvokeTransportError(e) {
  if (!(e instanceof Error)) return false;
  const code = "code" in e && e.code != null ? String(e.code) : "";
  if (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "EPIPE" ||
    code === "ECONNABORTED"
  ) {
    return true;
  }
  const msg = (e.message || "").toLowerCase();
  if (msg.includes("守护进程未就绪")) return true;
  if (msg.includes("econnrefused")) return true;
  if (msg.includes("socket hang up")) return true;
  if (msg.includes("econnreset")) return true;
  if (msg.includes("write epipe")) return true;
  return false;
}

/** 向所有窗口推送调试日志（开发模式 UI 订阅） */
function debugLog(level, msg, detail) {
  const extra =
    detail !== undefined
      ? typeof detail === "string"
        ? detail
        : JSON.stringify(detail)
      : "";
  const line = `[${new Date().toISOString()}] [${level}] ${msg}${extra ? ` ${extra}` : ""}`;
  console.log(line);
  const payload = { level, msg, detail, line };
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send("timelens:debug-log", payload);
    } catch {
      /* ignore */
    }
  }
}

/** 串行化 invoke，避免 Rust 侧单连接锁上多请求并发导致长时间等待 */
let invokeChain = Promise.resolve();

/** 并发重启合并为单次（invoke 重试 / 多窗口同时失败） */
let restartInflight = null;

/** WebSocket /events 断线重连（避免长时间运行后前端收不到 app_switch / window_event 等推送） */
let wsReconnectTimer = null;
let wsConnectGeneration = 0;

function clearWsReconnectTimer() {
  if (wsReconnectTimer != null) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
}

function scheduleEventSocketReconnect(reason) {
  if (isQuitting) return;
  if (!daemonState.port || !daemonState.token) return;
  if (wsReconnectTimer != null) return;
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    if (isQuitting || !daemonState.port || !daemonState.token) return;
    debugLog("warn", `WebSocket /events 将重连 (${reason})`);
    connectEventSocket();
  }, 1500);
}

function daemonExecutablePath() {
  if (process.env.TIMELENS_DAEMON_PATH) {
    return process.env.TIMELENS_DAEMON_PATH;
  }
  const ext = process.platform === "win32" ? ".exe" : "";
  if (isDev) {
    return path.join(
      __dirname,
      `../src-tauri/target/debug/timelens-daemon${ext}`,
    );
  }
  const name =
    process.platform === "win32" ? "timelens-daemon.exe" : "timelens-daemon";
  return path.join(process.resourcesPath, name);
}

function broadcastToRenderers(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(`timelens:event:${channel}`, payload);
    }
  }
}

function connectEventSocket() {
  clearWsReconnectTimer();
  wsConnectGeneration += 1;
  const gen = wsConnectGeneration;
  if (daemonState.ws) {
    try {
      daemonState.ws.close();
    } catch {
      /* ignore */
    }
    daemonState.ws = null;
  }
  if (!daemonState.port || !daemonState.token) return;
  const url = `ws://127.0.0.1:${daemonState.port}/events?token=${encodeURIComponent(daemonState.token)}`;
  const ws = new WebSocket(url);
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (
        msg &&
        typeof msg.channel === "string" &&
        Object.prototype.hasOwnProperty.call(msg, "payload")
      ) {
        broadcastToRenderers(msg.channel, msg.payload);
      }
    } catch {
      /* ignore */
    }
  });
  ws.on("error", (err) => {
    debugLog("error", "WebSocket /events error", String(err?.message ?? err));
  });
  ws.on("open", () => {
    if (gen === wsConnectGeneration) {
      debugLog("info", "WebSocket /events 已连接");
    }
  });
  ws.on("close", () => {
    if (gen !== wsConnectGeneration) return;
    daemonState.ws = null;
    scheduleEventSocketReconnect("close");
  });
  daemonState.ws = ws;
}

function startDaemon() {
  return new Promise((resolve, reject) => {
    const exe = daemonExecutablePath();
    const child = spawn(exe, [], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
    daemonState.child = child;

    let buf = "";
    let settled = false;
    const to = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.stdout?.off("data", onStdout);
        reject(new Error("等待 timelens-daemon 就绪超时"));
      }
    }, 45000);

    function doneOk() {
      if (settled) return;
      settled = true;
      clearTimeout(to);
      child.stdout?.off("data", onStdout);
      resolve();
    }

    function doneErr(err) {
      if (settled) return;
      settled = true;
      clearTimeout(to);
      child.stdout?.off("data", onStdout);
      reject(err);
    }

    /** @param {Buffer} chunk */
    function onStdout(chunk) {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        const m = trimmed.match(
          /^TIMELENS_DAEMON_READY port=(\d+) token=(\S+)$/,
        );
        if (m) {
          daemonState.port = Number(m[1], 10);
          daemonState.token = m[2];
          debugLog("info", "timelens-daemon ready", {
            exe,
            port: daemonState.port,
          });
          doneOk();
          return;
        }
      }
    }

    child.stdout?.on("data", onStdout);
    child.stderr?.on("data", (c) => {
      const t = c.toString().trim();
      console.error("[timelens-daemon]", t);
      if (t) debugLog("daemon-stderr", t);
    });

    child.once("error", (e) => doneErr(e));
    child.on("exit", (code, signal) => {
      if (!settled) {
        doneErr(
          new Error(`守护进程退出 code=${code} signal=${signal ?? ""}`),
        );
        return;
      }
      if (daemonState.child !== child) return;
      debugLog("warn", "timelens-daemon 已退出（此前已就绪）", {
        code,
        signal: signal ?? "",
      });
      daemonState.port = null;
      daemonState.token = null;
      if (daemonState.ws) {
        try {
          daemonState.ws.close();
        } catch {
          /* ignore */
        }
        daemonState.ws = null;
      }
      daemonState.child = null;
    });
  });
}

async function restartDaemonLocked() {
  if (restartInflight) {
    await restartInflight;
    return;
  }
  restartInflight = (async () => {
    try {
      debugLog("info", "正在重启 timelens-daemon …");
      stopDaemon();
      await startDaemon();
      connectEventSocket();
      debugLog("info", "timelens-daemon 重启完成", {
        port: daemonState.port,
      });
    } finally {
      restartInflight = null;
    }
  })();
  await restartInflight;
}

function stopDaemon() {
  clearWsReconnectTimer();
  wsConnectGeneration += 1;
  if (daemonState.ws) {
    try {
      daemonState.ws.close();
    } catch {
      /* ignore */
    }
    daemonState.ws = null;
  }
  daemonState.port = null;
  daemonState.token = null;
  if (daemonState.child && !daemonState.child.killed) {
    try {
      daemonState.child.kill();
    } catch {
      /* ignore */
    }
  }
  daemonState.child = null;
}

function buildSnapshotUrl(id) {
  if (!daemonState.port || !daemonState.token) return "";
  return `http://127.0.0.1:${daemonState.port}/snapshot/${encodeURIComponent(id)}?token=${encodeURIComponent(daemonState.token)}`;
}

/**
 * @param {string} cmd
 * @param {unknown} args
 * @returns {Promise<unknown>}
 */
function postInvokeHttp(cmd, args) {
  const bodyStr = JSON.stringify({ cmd, args: args ?? {} });
  const port = daemonState.port;
  const token = daemonState.token;
  return new Promise((resolve, reject) => {
    let settled = false;
    const once = (fn) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/invoke",
        method: "POST",
        family: 4,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyStr, "utf8"),
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          once(() => {
            try {
              const text = Buffer.concat(chunks).toString("utf8");
              if (!text.trim()) {
                reject(
                  new Error(`invoke 空响应：HTTP ${res.statusCode ?? "?"}`),
                );
                return;
              }
              const body = JSON.parse(text);
              const code = res.statusCode ?? 0;
              if (code !== 200) {
                reject(
                  new Error(
                    typeof body?.error === "string"
                      ? body.error
                      : `HTTP ${code}`,
                  ),
                );
                return;
              }
              if (body.ok === false) {
                reject(
                  new Error(
                    typeof body.error === "string"
                      ? body.error
                      : "invoke failed",
                  ),
                );
                return;
              }
              resolve(body.data);
            } catch (e) {
              reject(
                new Error(
                  `invoke 解析失败：HTTP ${res.statusCode} ${e instanceof Error ? e.message : String(e)}`,
                ),
              );
            }
          });
        });
        res.on("error", (err) => {
          once(() => {
            const code = err && "code" in err ? String(err.code) : "";
            const extra =
              code === "ECONNRESET" ||
              /hang up/i.test(String(err?.message ?? ""))
                ? "（对端提前关闭连接，将尝试恢复）"
                : "";
            reject(
              new Error(
                `invoke 连接失败：${err.message || String(err)} ${extra}`.trim(),
              ),
            );
          });
        });
      },
    );

    req.setTimeout(INVOKE_TIMEOUT_MS, () => {
      once(() => {
        req.destroy();
        reject(
          new Error(
            `invoke 超时（${INVOKE_TIMEOUT_MS / 1000}s）：${cmd}`,
          ),
        );
      });
    });

    req.on("error", (err) => {
      once(() => {
        const code = err && "code" in err ? String(err.code) : "";
        const extra =
          code === "ECONNREFUSED"
            ? "（无法连接守护进程，请完全退出应用后重试）"
            : code === "ETIMEDOUT"
              ? "（连接本地超时）"
              : code === "ECONNRESET" ||
                  /hang up/i.test(String(err?.message ?? ""))
                ? "（连接被重置，将尝试恢复）"
                : "";
        reject(
          new Error(
            `invoke 连接失败：${err.message || String(err)} ${extra}`.trim(),
          ),
        );
      });
    });

    req.write(bodyStr, "utf8");
    req.end();
  });
}

async function invokeDaemonHttp(cmd, args) {
  const t0 = Date.now();
  debugLog("info", `invoke → ${cmd}`, args ?? {});

  async function postOrThrow() {
    if (!daemonState.port || !daemonState.token) {
      throw new Error("守护进程未就绪");
    }
    return await postInvokeHttp(cmd, args);
  }

  try {
    let data = await postOrThrow();
    const ms = Date.now() - t0;
    debugLog("info", `invoke ← ${cmd} OK ${ms}ms`);
    return data;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!isQuitting && isRetriableInvokeTransportError(e)) {
      try {
        debugLog("warn", "invoke 将重启守护进程并重试一次", { cmd, err: msg });
        await restartDaemonLocked();
        const data = await postOrThrow();
        const ms = Date.now() - t0;
        debugLog("info", `invoke ← ${cmd} OK ${ms}ms (after restart)`);
        return data;
      } catch (e2) {
        const msg2 = e2 instanceof Error ? e2.message : String(e2);
        const ms = Date.now() - t0;
        debugLog("error", `invoke ← ${cmd} FAIL ${ms}ms (after restart)`, msg2);
        throw e2 instanceof Error ? e2 : new Error(msg2);
      }
    }
    const ms = Date.now() - t0;
    debugLog("error", `invoke ← ${cmd} FAIL ${ms}ms`, msg);
    throw e instanceof Error ? e : new Error(msg);
  }
}

ipcMain.handle("timelens:invoke", (event, cmd, args) => {
  const p = invokeChain.then(() => invokeDaemonHttp(cmd, args));
  invokeChain = p.then(
    () => {},
    () => {},
  );
  return p;
});

ipcMain.on("timelens:snapshot-url-sync", (event, snapshotId) => {
  event.returnValue = buildSnapshotUrl(String(snapshotId ?? ""));
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.on("close", (e) => {
    if (process.platform === "darwin" && !isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  mainWindow = win;

  if (isDev) {
    win.loadURL("http://127.0.0.1:1420");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

function createTray() {
  const iconCandidates = [
    path.join(__dirname, "../src-tauri/icons/32x32.png"),
    path.join(__dirname, "../src-tauri/icons/128x128.png"),
  ];
  let image = null;
  for (const p of iconCandidates) {
    try {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) {
        image = img;
        break;
      }
    } catch {
      /* try next */
    }
  }
  if (!image) return;

  tray = new Tray(image);
  const menu = Menu.buildFromTemplate([
    {
      label: "显示主窗口",
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
        } else {
          createWindow();
        }
      },
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setToolTip("TimeLens");
  tray.setContextMenu(menu);
  tray.on("click", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });
}

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("will-quit", () => {
  stopDaemon();
});

app.whenReady().then(async () => {
  try {
    await startDaemon();
    connectEventSocket();
  } catch (e) {
    debugLog("error", "timelens-daemon 启动失败", String(e));
    console.error(e);
  }

  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
