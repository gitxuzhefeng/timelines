# TimeLens · Windows 上手指南

> **版本**：v1.0 · 2026-03-30  
> **适用**：在 **Windows 10 / Windows 11（64 位）** 上从源码运行开发模式、或本地构建安装包/绿色版。  
> **仓库应用路径**：`project/`（Tauri 2 + Vite 6 + React 18）。

---

## 1. 环境与版本要求（请逐项核对）

下列版本为 **当前仓库可复现的推荐基线**；略高版本一般可用，若构建失败再以本表为准回退或升级。


| 组件            | 要求                                                                                               | 本仓库锁定的参考版本                      | 如何自检                                                          |
| ------------- | ------------------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------- |
| **操作系统**      | Windows 10 **22H2** 及以上，或 Windows 11；**64 位（x64）**                                               | —                               | 设置 → 系统 → 关于                                                  |
| **Node.js**   | **20 LTS** 或 **22 LTS**（需支持 Vite 6）；不推荐低于 18                                                     | 建议使用 **20.18+** 或 **22.x**      | `node -v`（应输出 `v20.x` 或 `v22.x`）                              |
| **npm**       | 随 Node 安装即可                                                                                      | 一般 **10.x**（Node 20+ 自带）        | `npm -v`                                                      |
| **Rust 工具链**  | **stable**，且默认目标为 **MSVC**                                                                       | `rustc` / `cargo` 为当前 stable 即可 | `rustc -V`、`cargo -V`                                         |
| **Rust 目标平台** | `**x86_64-pc-windows-msvc`**（本仓库默认 Windows 桌面构建）                                                 | —                               | `rustup show` 中 `active toolchain` 含 `x86_64-pc-windows-msvc` |
| **MSVC 生成工具** | **Visual Studio 2022** 的 **“使用 C++ 的桌面开发”** 工作负载；或 **Build Tools for Visual Studio 2022** 勾选同等组件 | VS **17.x** 生成工具                | 安装后重启终端再编 Rust                                                |
| **WebView2**  | **Evergreen Runtime**（运行时）                                                                       | 与 Edge 通道同步更新                   | Win11 通常已装；Win10 见下文 §3                                       |
| **Git**       | 克隆仓库时需要                                                                                          | **2.40+** 即可                    | `git --version`                                               |


### 1.1 与本仓库对应的技术栈版本（便于对照）


| 层级        | 说明                                                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tauri** | `project/src-tauri/Cargo.toml` 中为 **2.x**；当前 lock 中文案参考：**tauri 2.10.x**、**@tauri-apps/cli 2.10.x**（以你本机 `Cargo.lock` / `package-lock.json` 为准） |
| **前端**    | React **18.3.x**、Vite **6.x**、TypeScript **~5.8**、Tailwind **4.x**（见 `project/package.json`）                                                    |
| **Rust**  | Edition **2021**（见 `project/src-tauri/Cargo.toml`）                                                                                              |


> **说明**：未安装 MSVC 时，`rusqlite`、`libwebp-sys` 等带 C 代码的依赖会链接失败；这与 Tauri 官方 [Windows 前置条件](https://v2.tauri.app/start/prerequisites/) 一致。

---

## 2. 安装步骤（建议顺序）

### 2.1 安装 Node.js

1. 打开 [Node.js 官网 LTS](https://nodejs.org/)，下载 **Windows 安装包（64-bit）**。
2. 安装时勾选 **“Add to PATH”**。
3. 新开 **PowerShell** 或 **cmd**，执行：

```powershell
node -v
npm -v
```

### 2.2 安装 Rust（rustup + MSVC 目标）

1. 打开 [https://rustup.rs](https://rustup.rs) ，下载并运行 `rustup-init.exe`。
2. 按提示选择 **默认 stable**；确保主机为 **x86_64-pc-windows-msvc**（安装程序通常会自动选择）。
3. 若尚未安装 Visual Studio 生成工具，rustup 可能提示补充 **C++ 生成工具** — 请继续 **§2.3** 后再执行：

```powershell
rustup default stable
rustup show
```

如需显式安装 Windows 目标：

```powershell
rustup target add x86_64-pc-windows-msvc
```

### 2.3 安装 Visual Studio 生成工具（C++）

1. 下载 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（或安装完整 Visual Studio）。
2. 在工作负载中勾选 **「使用 C++ 的桌面开发」**（Desktop development with C++）。
3. 安装完成后 **重启终端**，再执行 `cargo -V` 确认无报错。

### 2.4 WebView2 运行时（Windows 10 重点）

- **Windows 11**：多数机器已自带 Evergreen WebView2，一般无需操作。  
- **Windows 10**：若应用窗口 **白屏** 或无法加载界面，请安装：  
[WebView2 Runtime（Evergreen 独立安装包）](https://developer.microsoft.com/microsoft-edge/webview2/)

---

## 3. 获取代码

在任意目录打开 **PowerShell**：

```powershell
git clone https://github.com/gitxuzhefeng/timelines.git
cd timelines
git pull
```

---

## 4. 开发模式（热更新调试）

在仓库 **根目录** `timelines/` 下执行（与根目录 `package.json` 脚本一致）：

```powershell
cd project
npm install
cd ..
npm run tauri dev
```

- 首次会下载 npm 依赖并编译 Rust，**可能耗时数分钟**。  
- 成功后应弹出 **TimeLens** 窗口；前端由 Vite 提供，修改 `project/src` 下代码可热更新（具体以 Tauri + Vite 行为为准）。

**仅跑前端（不启桌面壳）**：

```powershell
npm run dev
```

---

## 5. 生产构建（安装包 / 绿色版目录）

在 `**project**` 目录：

```powershell
cd project
npm ci
npm run tauri build
```

或在仓库根目录：

```powershell
npm install --prefix project
npm run tauri build --prefix project
```

### 5.1 产物位置

构建成功后，查看：

```text
project\src-tauri\target\release\bundle\
```

- 常见包含 **NSIS 安装程序**（`tauri.conf.json` 中已配置 `nsis` 目标）以及可运行的 **应用目录**（具体子目录名以本机 Tauri 2 版本输出为准）。  
- **绿色版**：将「含主程序 `.exe`、DLL、WebView 资源」的完整文件夹打包为 **ZIP**，解压到任意路径即可运行（勿只拷贝单个 exe）。详见 [绿色版打包说明.md](./绿色版打包说明.md)。

---

## 6. 数据目录与隐私位置

- 默认数据目录：`**%USERPROFILE%\.timelens`**（与 macOS 的 `~/.timelens` 对应）。  
- 内含 SQLite、截图等；卸载应用不会自动删除该目录，如需清空请自行备份后删除。

---

## 7. 首次运行与系统提示


| 现象                                 | 处理                                                                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **SmartScreen 已阻止**                | 点「更多信息」→「仍要运行」。未签名二进制在公网分发时较常见；企业环境可后续做代码签名。                                                                                                 |
| **界面白屏（Win10）**                    | 优先安装 §2.4 的 WebView2 Evergreen，重启应用。                                                                                                         |
| **构建报错找不到 link.exe / Windows SDK** | 回到 §2.3，确认 C++ 桌面开发工作负载已装全，并**重启终端**。                                                                                                        |
| **截图文件已有，主界面预览空白**                 | 已修复：WebView2 要求预览地址使用 `http://timelens.localhost/snapshot/{id}`，不能使用 `timelens://…` 作为 `<img src>`。请拉取最新代码；若仍异常，在开发者工具 Network 中查看该请求是否 200。 |


---

## 8. 可选：自检 Rust 测试

在 `project/src-tauri`：

```powershell
cd project\src-tauri
cargo test
```

---

## 9. 相关文档


| 文档                                                            | 说明                     |
| ------------------------------------------------------------- | ---------------------- |
| [绿色版打包说明.md](./绿色版打包说明.md)                                    | ZIP 分发、WebView2、与安装版关系 |
| [03_测试计划.md](./03_测试计划.md)                                    | Windows 功能与回归测试矩阵      |
| [01_技术方案.md](./01_技术方案.md)                                    | 平台差异与技术要点              |
| 根目录 [README.md](../../README.md)                              | 全仓库说明与脚本索引             |
| [Tauri 2 前置条件（官方）](https://v2.tauri.app/start/prerequisites/) | 平台要求以官方为准              |


---

**TimeLens** — Windows 上与 macOS 共用同一套 P0 能力边界；若某一步报错，请保留完整终端输出与 `rustc -V`、`node -v` 便于排查。