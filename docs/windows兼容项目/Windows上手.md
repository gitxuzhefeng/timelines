# TimeLens · Windows 上手指南

> **版本**：v2.0 · 2026-04-13  
> **适用**：在 Windows 10/11 **64 位**（x64 或 ARM64）上开发、本地构建 **NSIS 安装包**或绿色 ZIP。应用代码在 **`project/`**（Tauri 2 + Vite 6 + React 18）。

---

## 1. 环境要求

| 组件 | 说明 |
|------|------|
| **系统** | Windows 10 22H2+ 或 Windows 11，**x64 或 ARM64** |
| **Node.js** | **20 LTS 或 22 LTS**（须支持 Vite 6）。自检：`node -v`、`npm -v` |
| **Rust** | **stable**，**MSVC** 工具链。x64 主机：`x86_64-pc-windows-msvc`；ARM64 主机（WoA）：`aarch64-pc-windows-msvc`。自检：`rustc -V`、`rustup show` |
| **MSVC** | **Visual Studio 2022**「使用 C++ 的桌面开发」或 **Build Tools 2022** 同等 workload；须含 **Windows SDK**。ARM64 目标还需 **MSVC v143 的 ARM64/ARM64EC 组件**（否则缺 `lib\arm64\msvcrt.lib` 等） |
| **LLVM**（ARM64 建议） | 部分依赖（如 `ring`）构建时会找 **clang**。WoA 上可 `winget install LLVM.LLVM`，保证 `clang.exe` 在 PATH（本仓库脚本会预置 `C:\Program Files\LLVM\bin`） |
| **WebView2** | Evergreen。Win11 多已自带；Win10 若白屏见 [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) |
| **Git** | 克隆仓库用，2.40+ 即可 |

技术栈版本以 `project/package.json`、`project/src-tauri/Cargo.toml` 及 lock 文件为准。未装 MSVC 时，含 C 代码的 crate 会链接失败，与 [Tauri 前置条件](https://v2.tauri.app/start/prerequisites/) 一致。

**路径建议**：在 **本地盘符目录**（如 `C:\...\timelines`）克隆与构建。在虚拟机共享盘、网络路径（`\\psf\...`）下，Vite/解析可能异常。

---

## 2. 安装顺序（概要）

1. [Node.js LTS](https://nodejs.org/)（64-bit），安装时勾选加入 PATH。  
2. [rustup](https://rustup.rs/)，stable + 默认 MSVC 主机。按需：`rustup target add x86_64-pc-windows-msvc` 或 `aarch64-pc-windows-msvc`。  
3. [VS Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)，勾选 **「使用 C++ 的桌面开发」**；ARM64 机器请确认 **ARM64 工具链**已装。装好后**新开终端**。  
4. Win10 无 WebView2 时安装 Evergreen Runtime（见上表链接）。

---

## 3. 获取代码

```powershell
git clone https://github.com/gitxuzhefeng/timelines.git
cd timelines
```

---

## 4. 开发调试

在仓库**根目录**：

```powershell
cd project
npm install   # 或 npm ci
cd ..
npm run tauri dev
```

仅前端（无桌面壳）：`npm run dev`（根目录脚本）。

---

## 5. 生产构建（安装包）

在 **`project`** 目录：

```powershell
cd project
npm ci
npm run tauri build
```

或在根目录：`npm install --prefix project` 后 `npm run tauri build --prefix project`。

### 5.1 产物位置

- 安装包、打包输出：`project\src-tauri\target\release\bundle\`（常见为 `bundle\nsis\*.exe`，具体以本机 Tauri 输出为准）。  
- 主程序：`project\src-tauri\target\release\timelens.exe`（名称以 `tauri.conf.json` 为准）。

### 5.2 ARM64 Windows（WoA）推荐方式

在 ARM64 上若直接 `npm run tauri build` 出现 **找不到 `link.exe`**、**`msvcrt.lib`** 或 **`ring` 找不到 clang**，请使用仓库脚本（内部调用 **`vcvarsall.bat amd64_arm64`**，即用 x64 主机工具链链接 ARM64）：

```text
project\scripts\tauri-build-windows-msvc.cmd
```

前提：已安装 Node（脚本默认使用 `C:\Program Files\nodejs`）、VS Build Tools、Rust；若已安装 LLVM，脚本会把其 `bin` 加入 PATH。可按需编辑脚本中的 VS 路径或 Node 路径。

### 5.3 仓库内的安装包归档（可选）

维护者可将构建好的安装包放到 **`releases/windows/`** 便于固定版本下载；`.gitignore` 对 `releases/windows/*.exe` 设有例外。体积大时更推荐 [GitHub Releases](https://github.com/gitxuzhefeng/timelines/releases) 分发。

**架构说明**：在 **ARM64** 机器上产物多为 `*_arm64-setup.exe`；面向主流 **x64 Windows** 用户需在 **x64 环境或 CI（如 `windows-latest` x64）** 再构建一份。

---

## 6. 绿色版（ZIP）

与安装包同源构建；从 `bundle` 中取**完整可运行目录**（勿只拷单个 exe）打 ZIP。详见 [绿色版打包说明.md](./绿色版打包说明.md)。

---

## 7. 数据目录

默认 **`%USERPROFILE%\.timelens`**（与 macOS `~/.timelens` 对应）。卸载安装程序不自动删此目录。

---

## 8. 常见问题

| 现象 | 处理 |
|------|------|
| SmartScreen 拦截 | 「更多信息」→「仍要运行」；分发侧可做代码签名 |
| Win10 白屏 | 安装 WebView2 Evergreen |
| 找不到 `link.exe` / SDK | 确认 C++ workload 与 SDK；ARM64 用 **§5.2** 脚本 |
| 构建找不到 `msvcrt.lib`（ARM64） | 安装 **VC Tools ARM64** 组件，确保存在 `VC\...\lib\arm64\` |
| `ring` / cc 找不到 `clang`（ARM64） | 安装 **LLVM** 并保证 PATH 中有 `clang.exe`（见 **§5.2**） |

---

## 9. 相关文档

| 文档 | 说明 |
|------|------|
| [绿色版打包说明.md](./绿色版打包说明.md) | 绿色 ZIP 与安装包关系、用户侧说明 |
| [03_测试计划.md](./03_测试计划.md) | Windows 测试要点 |
| [01_技术方案.md](./01_技术方案.md) | 平台差异 |
| 根目录 [README.md](../../README.md) | 仓库总览 |

Rust 单测（可选）：`cd project\src-tauri` 后 `cargo test`。
