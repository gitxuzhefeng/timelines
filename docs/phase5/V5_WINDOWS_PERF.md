# V5 · Windows 交互性能专项 — 配置与验收

> 对应 PRD：[prd/PRD_五期_Windows交互性能优化.md](../../prd/PRD_五期_Windows交互性能优化.md)
> 姊妹文档：[RELEASE_NOTE_五期_Windows交互性能优化.md](./RELEASE_NOTE_五期_Windows交互性能优化.md)、[Windows_交互性能基线与验收记录.md](./Windows_交互性能基线与验收记录.md)

本文档聚合本期 Windows 鼠标卡顿问题的根因分析、落地配置、A/B GPU 策略切换方法、macOS 回归清单，以及 PRD 5.2 的验收记录模板。

---

## 1. 根因速览

| 现象 | 真实原因 | 对应修复 |
|------|----------|----------|
| 鼠标移动跟手迟滞、连续掉帧 | `transparent: true` + `shadow: true` 触发 DWM per-pixel alpha 与 drop-shadow 合成链路，`WM_MOUSEMOVE` 每次都走完整合成 | Windows 主窗体关闭 `transparent` / `shadow` |
| WebView2 合成器在部分显卡/驱动上出现 Occlusion 抖动，进而丢帧 | Chromium 的 `CalculateNativeWinOcclusion` 特性在 DWM 隐藏/半显状态下过度触发；`gpu-vsync` 与 `renderer-backgrounding` 会压低高频交互帧率 | `additionalBrowserArgs` 定向禁用这三个特性（**默认策略**） |
| 关闭 GPU 后鼠标变稳，但复杂滚动/动画更涩 | `--disable-gpu` 把整帧合成退回 CPU，适合老显卡/虚拟机但牺牲复杂动效 | 保留为**一键回退策略**（见 §3） |
| 曾经尝试将 `run()` 改为 async 后"命令不可用" | 入口改造姿势不对（在 `await` 之后再调 `Builder::run()` / 把 Builder 放到 tokio worker），不是 async 本身的问题 | 保持同步 `fn main()`，并在 `main.rs` 注释中说明 |

> 一句话：命令注册由 `tauri::generate_handler!` 宏在编译期展开，和 `async` / `sync` 无关。

---

## 2. 现行默认配置（方案 B：精准降载，保留 GPU 合成）

### 2.1 `project/src-tauri/tauri.conf.json`

主窗体相关字段：

```json
{
  "label": "main",
  "title": "TimeLens",
  "width": 1120,
  "height": 720,
  "resizable": true,
  "transparent": false,
  "decorations": true,
  "shadow": false,
  "additionalBrowserArgs": "--disable-features=CalculateNativeWinOcclusion --disable-gpu-vsync --disable-renderer-backgrounding"
}
```

每个参数的作用：

- `transparent: false`：退出 DWM per-pixel alpha 路径。
- `shadow: false`：退出 DWM drop-shadow 合成（macOS 同步生效，本期按团队决议统一关闭）。
- `--disable-features=CalculateNativeWinOcclusion`：关掉 WebView2 的窗口遮挡检测，解决鼠标停在窗口边缘/任务切换时的掉帧。
- `--disable-gpu-vsync`：消除 VSync 等待抖动对 `WM_MOUSEMOVE` 的影响，但**不禁用 D3D11 合成器**。
- `--disable-renderer-backgrounding`：应用失焦后渲染器不降频，切回来立即响应，不会出现首帧冷启动。

### 2.2 `project/src-tauri/tauri.windows.conf.json`

默认为空 overlay（仅声明 `label: "main"` 以匹配主窗口），不改变行为：

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "app": {
    "windows": [
      { "label": "main" }
    ]
  }
}
```

Tauri 2 会按 `tauri.conf.json` → `tauri.windows.conf.json` 深度合并，只在 Windows 构建时生效。

### 2.3 前端 Windows 降载分支（不变动）

- `project/src/App.tsx`：基于 `navigator.userAgent` 探测到 Windows 时，给 `<html>` 写入 `data-os="windows"` + `data-win-perf="on"`。
- `project/src/index.css`：在该属性下关闭 `backdrop-filter`、缩短 `transition` 到 60ms、去除阴影与持续动画。

---

## 3. 一键回退：方案 A（保守，全 CPU 合成）

**适用场景**：老显卡（Intel HD/UHD 4000 以下、Ivy Bridge/Haswell 迭代集显）、虚拟机 / 远程桌面、驱动版本不新、Win10 LTSC 等。

在 `project/src-tauri/tauri.windows.conf.json` 中把 `additionalBrowserArgs` 覆盖为 `--disable-gpu`：

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "app": {
    "windows": [
      {
        "label": "main",
        "additionalBrowserArgs": "--disable-gpu"
      }
    ]
  }
}
```

说明：

- `tauri.windows.conf.json` 中的 `additionalBrowserArgs` 会**完全覆盖**基础 conf 的同名字段，不与默认策略叠加。
- `--disable-gpu` 已隐含 `--disable-gpu-compositing`，不需要再加。
- 如果 A 也不满足，可以在该行追加 `--no-sandbox --disable-features=IsolateOrigins`，仅最后手段。

切换完成后重新 `cargo tauri build` 或 `cargo tauri dev` 即可。

---

## 4. 为什么保留同步 `fn main()`

`project/src-tauri/src/main.rs`：

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    timelens_lib::run();
}
```

保持同步入口的两个关键理由：

1. **命令注册与 async 无关**。`tauri::generate_handler!` 是声明式宏，在编译期把 `api::*` 生成为 handler 表，无论外层是否 `async` 都会展开。之前"async 后命令注册失效"是因为：
   - 在 `tokio::main` + `#[tokio::main(flavor = "current_thread")]` 之外的多线程 flavor 下，`Builder::run()` 错放到 worker 线程；
   - 或者 `Builder` 先 clone 进了 `spawn`，主线程提前返回。
2. **主线程必须持有 Windows 事件循环**。`wry`/`WebView2` 要求 UI 与消息泵在主线程；`tauri::Builder::run()` 就是主线程阻塞的事件循环入口。同步 `fn main()` 天然满足这点。

如未来需要做真正的 async 启动，正确姿势是：让 `run()` 内部临时 `tokio::runtime::Runtime::new()` 做异步预热，再调 `Builder::run()`，**不要**把 Builder 放到异步任务里。

---

## 5. 验收记录模板（对应 PRD 5.2 必填项）

建议每次 Windows 构建验证时在 [Windows_交互性能基线与验收记录.md](./Windows_交互性能基线与验收记录.md) 中按下表追加一次记录：

```
## <日期> / <构建分支@commit>

### 设备
- OS：Windows 10 22H2 / 11 23H2 / 11 ARM64（择一）
- CPU / GPU / 内存：
- WebView2 Runtime 版本：
- 显卡驱动版本：

### 构建
- 策略：A（--disable-gpu） / B（默认） / 其它
- 分支 & commit：
- 构建模式：dev / release
- 构建时间：

### 操作脚本
- 页面：/lens → /timeline → /intents → /settings
- 动作：持续移动鼠标 30s / hover 会话卡片 / 打开截图灯箱 10 次 / 切日期
- 持续时间：

### 结果
- 优化前主观评分（1~5）：
- 优化后主观评分（1~5）：
- 现象备注：
- 是否需要回退到方案 A：是 / 否
```

---

## 6. macOS 回归清单

因为 `transparent / shadow` 在基础 conf 中是全局设置，macOS 构建也会受到影响。本期发布前请在 macOS 上回归确认：

- [ ] 窗口为方角不透明，**无原生投影**（与旧版相比视觉变扁，属于已知预期）。
- [ ] 四大主路径（`/lens`、`/timeline`、`/report`、`/settings`）渲染与交互无异常。
- [ ] 截图灯箱、会话 Sheet、日报导出等弹层层级正确。
- [ ] 托盘菜单、采集开关、权限请求链路正常。
- [ ] `cargo test` 与 `npm run build` 在 macOS 上通过。

如果后续产品团队认为 macOS 需要恢复原生投影，只需把 `shadow` 从基础 conf 下沉到新建的 `tauri.macos.conf.json` 并单独设置 `true` / 删除基础 conf 中的 `shadow` 字段即可——不需要改动任何 Rust 或前端代码。

---

## 7. 修订记录

| 版本 | 日期 | 摘要 |
|------|------|------|
| v1.0 | 2026-04-17 | 初版：落地默认方案 B、保留方案 A 一键回退、规范 main.rs 同步入口的原因、补齐 macOS 回归清单 |
