# TimeLens Electron 桌面端 · Windows 打包与安装说明

> **适用**：使用仓库内 **Electron + timelens-daemon** 方案在 **Windows 10/11 x64** 上构建与分发。  
> **产物目录**：`project/electron-dist/`（由 `electron-builder` 输出，已列入 `.gitignore`，勿提交到 Git）。

---

## 1. 构建环境（概要）

在 **Windows x64** 上安装：

| 组件 | 说明 |
|------|------|
| **Node.js** | 20 LTS 或 22 LTS |
| **Rust** | stable，**MSVC** 工具链 `x86_64-pc-windows-msvc` |
| **Visual Studio 2022** | 工作负载「使用 C++ 的桌面开发」，含 Windows SDK |
| **Git** | 克隆仓库 |

更细的版本与排障见同目录下的 [Windows上手.md](./Windows上手.md)。

---

## 2. 构建命令（一次产出两种形态）

在仓库中进入 **`project`** 目录：

```powershell
cd project
npm ci
npm run electron:pack:win
```

脚本会依次：前端生产构建（`VITE_ELECTRON=1`）、**Release** 编译 `timelens-daemon.exe`、再调用 **electron-builder** 打 Windows 包。

成功后在 **`project/electron-dist/`** 下可看到两类主要产物：

| 类型 | 常见文件名模式 | 说明 |
|------|----------------|------|
| **① 免安装版（便携）** | `TimeLens *.exe`（`portable` 目标，体积较大单文件） | 无需安装向导，适合 U 盘、绿色目录；不写 NSIS 安装流程 |
| **② 安装版** | `TimeLens Setup *.exe`（NSIS） | 经典安装程序，可创建快捷方式、写入卸载信息（以当前 electron-builder 配置为准） |

具体文件名会随 **版本号**（`package.json` 的 `version`）变化，请以目录中实际文件名为准。

若只需其中一种，可临时修改 `project/package.json` 里 `build.win.target` 数组，只保留 `portable` 或 `nsis` 后再执行 `npm run electron:pack:win`。

---

## 3. 免安装版（便携）使用步骤

1. 将 **`portable` 对应的 `.exe`** 复制到任意文件夹（如桌面、`D:\Tools\TimeLens`）。
2. 双击运行。应用数据默认仍在当前用户目录下的 **`.timelens`**（与安装版一致，不强制「与 exe 同目录」）。
3. **WebView2**：若窗口白屏，请安装 [WebView2 Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。
4. **SmartScreen**：未签名 exe 可能被拦截，可选「更多信息」→「仍要运行」。正式对外分发建议做代码签名。

---

## 4. 安装版使用步骤

1. 双击 **`TimeLens Setup *.exe`**。
2. 按安装向导完成安装（可选安装路径、快捷方式等，以安装界面为准）。
3. 从开始菜单或桌面快捷方式启动 **TimeLens**。
4. 同样需要 **WebView2**；若遇 SmartScreen，处理同上。

---

## 5. 与守护进程、权限相关

- 安装包会将 **`timelens-daemon.exe`** 作为资源放在应用目录旁（见 `package.json` 的 `extraResources`），用于采集与截图。
- 首次使用可能需在 **Windows 设置 → 隐私与安全 → 屏幕截图 / 屏幕录制相关项** 中为 **TimeLens** 或相关进程授予权限（以系统实际菜单为准）。

---

## 6. 常见问题

| 现象 | 建议 |
|------|------|
| `cargo build … timelens-daemon` 失败 | 先单独在 `project` 下执行 `npm run electron:daemon:build`，按报错补全 MSVC / SDK。 |
| 只有 NSIS 没有 portable | 确认 `build.win.target` 中同时包含 `portable` 与 `nsis`，且重新执行 `electron:pack:win`。 |
| ARM64（WoA）本机构建 | 当前 `package.json` 示例为 **x64**；若需 ARM64，需调整 Rust target 与 electron-builder `arch`，并自行验证。 |

---

## 7. 与 Tauri 绿色版文档的关系

- **Tauri** 路线（`npm run tauri build`）的安装包与绿色 ZIP 说明见 [绿色版打包说明.md](./绿色版打包说明.md)。  
- 本文仅针对 **Electron + daemon** 路线，二者不要混淆。
