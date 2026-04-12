# TimeLens 一期技术架构文档（数据底座）

> **版本**：v2.2  
> **日期**：2026-03-27  
> **定位**：基于 `PRD_一期_数据底座.md` v4.0 的完整技术架构设计，作为 **从零新建** 的一期工程唯一技术基准（非既有代码库演进或重构方案）。  
> **v2.2 变更**：去除与历史 1.0 技术文档的对比叙事，统一为绿场（greenfield）架构表述；删除「从旧栈升级 / 重构迁移」相关段落。  
> **v2.1（保留说明）**：技术评审整改——收缩 MVP 范围、引入 Writer Actor 统一写入、隔离高风险模块、补全核心语义定义、细化隐私边界。

---

## 一、架构总览

### 1.1 架构设计原则


| 原则          | 说明                                                 | 落地方式                              |
| ----------- | -------------------------------------------------- | --------------------------------- |
| **本地优先**    | 100% 数据本地存储，零外部网络请求                                | 禁止引入 `reqwest`，不注册任何 HTTP 端点      |
| **被动透明**    | 用户无感知采集，零操作负担                                      | 后台线程自动运行，系统托盘常驻                   |
| **隐私红线**    | 不记录按键内容、剪贴板文本、密码；敏感字段（title/URL/path/截图）具备脱敏与黑名单机制 | 仅采集频率/模式级聚合数据；详见十二章隐私控制策略         |
| **宽采集-后清洗** | 底层无差别采集原始信号，上层按需聚合                                 | raw_events 宽表只追加，Session 层折叠消费    |
| **模块正交**    | 各采集引擎互相独立，可单独开关                                    | 每个引擎独立线程，独立配置项，独立数据表；高风险模块默认可禁用   |
| **核心链路独立**  | 主链路不依赖任何高风险/高不确定性模块                                | 高风险模块缺失不影响 P0 数据闭环；详见 1.4 节       |
| **可演进**     | 一期架构必须为二三期留足扩展空间                                   | Schema 迁移机制、IPC 接口预留、Intent 映射可扩展 |
| **统一写入**    | 各采集引擎只负责采集和事件投递，不直接持有 DB 写职责                       | Writer Actor 单线程串行写入，详见三章         |


### 1.2 整体分层架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    L1 · 用户交互层 (User Interaction)                     │
│         系统托盘 TrayIcon · 窗口生命周期 · 权限引导                         │
├─────────────────────────────────────────────────────────────────────────┤
│                    L2 · 校验展示层 (Verification UI)                      │
│         React 18 + Vite + TailwindCSS + Zustand                        │
│         基础验证面板（状态、Session、截图、存储）                            │
├─────────────────────────────────────────────────────────────────────────┤
│                    L3 · 通信桥接层 (Tauri IPC Bridge)                     │
│         Command 通道 (Pull) · Event 通道 (Push) · URI 协议 (Asset)       │
├─────────────────────────────────────────────────────────────────────────┤
│                    L4 · 核心引擎层 (Engine Layer)                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ P0 核心引擎（一期必做）                                            │   │
│  │ ┌──────────┬──────────┬────────────────┐                        │   │
│  │ │ Tracker  │ Capture  │  Aggregation   │                        │   │
│  │ │ Engine   │ Engine   │  Pipeline      │                        │   │
│  │ │ (2s轮询) │ (信号驱动)│  (实时+补偿)    │                        │   │
│  │ └──────────┴──────────┴────────────────┘                        │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │ P1 可选增强（一期视进度纳入，默认可禁用）                             │   │
│  │ ┌──────────┬──────────┐                                         │   │
│  │ │  Input   │Clipboard │                                         │   │
│  │ │ Dynamics │  Flow    │                                         │   │
│  │ │ (5s聚合) │(事件驱动) │                                         │   │
│  │ └──────────┴──────────┘                                         │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │ 延后模块（1.5/二期，一期架构预留接口但不实现）                        │   │
│  │ ┌──────────┬──────────┐                                         │   │
│  │ │  Notif   │ Ambient  │                                         │   │
│  │ │ Tracker  │ Context  │                                         │   │
│  │ └──────────┴──────────┘                                         │   │
│  └──────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────┤
│                    L4.5 · 统一写入层 (Writer Actor)                      │
│         mpsc channel 收集 → 单线程串行写入 → 批量事务 → 错误隔离           │
├─────────────────────────────────────────────────────────────────────────┤
│                    L5 · 数据访问层 (Data Access Layer)                    │
│         Database Engine (SQLite/rusqlite) · FileSystem Engine            │
├─────────────────────────────────────────────────────────────────────────┤
│                    L6 · 操作系统集成层 (OS Integration)                   │
│   P0: NSWorkspace · AXUIElement · CoreGraphics · CoreAudio              │
│   P1: CGEventTap · NSPasteboard                                         │
│   延后: CoreWLAN · IOPowerSources · DistributedNotification             │
├─────────────────────────────────────────────────────────────────────────┤
│                    L7 · 持久化存储层 (Persistence)                       │
│         ~/.timelens/data/db.sqlite + shots/ (WebP截图)                   │
│                       🔒 零网络 · 100% 本地                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.3 一期 MVP 范围定义（评审整改后）

按 MVP 原则收敛一期目标为 **"核心数据闭环"**，将模块分为三个交付梯度：

#### P0 必做（核心数据闭环，一期交付底线）


| 模块                   | 说明                               | 风险等级 |
| -------------------- | -------------------------------- | ---- |
| Tracker Engine       | 2s 轮询窗口状态，产出 raw_events          | 🟢 低 |
| Capture Engine       | 智能截图 + pHash 去重                  | 🟢 低 |
| Aggregation Pipeline | raw_events → window_sessions 折叠  | 🟢 低 |
| Writer Actor         | 统一写入队列 + 单写入线程                   | 🟢 低 |
| raw_events 表         | 原始宽表，只追加                         | 🟢 低 |
| window_sessions 表    | 聚合会话层                            | 🟢 低 |
| snapshots 表          | 截图元数据                            | 🟢 低 |
| app_switches 表（简版）   | 窗口切换有向图                          | 🟢 低 |
| 权限检测与引导              | Accessibility + Screen Recording | 🟢 低 |
| SQLite migration     | schema_migrations 版本管理           | 🟢 低 |
| 基础验证面板               | 状态栏、Session 列表、截图预览、存储统计         | 🟢 低 |


#### P1 可选增强（视进度纳入，独立可禁用）


| 模块                 | 说明                 | 风险等级 | 前置条件    |
| ------------------ | ------------------ | ---- | ------- |
| Input Dynamics（简版） | CGEventTap 输入行为统计  | 🟡 中 | P0 全部完成 |
| Clipboard Flow（简版） | 剪贴板 Copy/Paste 元数据 | 🟢 低 | P0 全部完成 |
| 基础配置项              | settings 表 + 配置面板  | 🟢 低 | P0 全部完成 |
| 基础统计页              | 日统计数据展示            | 🟢 低 | P0 全部完成 |


#### 延后至 1.5 / 二期


| 模块                       | 延后原因                                        |
| ------------------------ | ------------------------------------------- |
| Notification Tracker     | 检测方案不确定，数据可信度待验证                            |
| Ambient Context 全量采集     | WiFi SSID 等 macOS 新版本权限限制多                  |
| WiFi SSID                | macOS Sequoia 限制加严，需额外 Location Services 权限 |
| active_space Private API | App Store 不兼容，需更明确隔离                        |
| Intent Mapping 管理 UI     | 非核心验证需求                                     |
| 差异化数据校验看板（Tab 2）         | 依赖 P1 模块数据                                  |


### 1.4 高风险模块隔离原则

一期架构必须满足以下隔离约束：


| 约束          | 说明                                                                          |
| ----------- | --------------------------------------------------------------------------- |
| **默认可禁用**   | P1 及延后模块均通过配置项控制开关，默认关闭或独立启用                                                |
| **核心链路不依赖** | P0 的 Tracker → Capture → Aggregation → Storage → Frontend 链路不依赖任何 P1/延后模块运行 |
| **优雅降级**    | 任何非 P0 模块缺失/异常/权限不足时，UI 展示"未启用 / 不可用 / 数据不可信"状态                             |
| **独立故障域**   | 非 P0 模块崩溃不影响主进程，通过 catch_unwind + 状态标记实现                                    |
| **接口预留**    | 延后模块在代码结构和数据库 Schema 中预留扩展点，但不实现业务逻辑                                        |


### 1.5 架构核心特征（一期）


| 维度         | 说明                                                                            |
| ---------- | ----------------------------------------------------------------------------- |
| **采集引擎**   | **P0**：Tracker + Capture + Aggregation；**P1**：+ Input Dynamics、Clipboard Flow |
| **数据表**    | **P0**：7 张；**P1**：+3 张                                                        |
| **数据模型**   | **双层**：raw_events（只追加宽表）→ 聚合管道 → window_sessions（会话层）                         |
| **写入模型**   | **Writer Actor** 单线程串行写入；各引擎只向通道投递 `WriteEvent`                               |
| **线程模型**   | Main（Tauri）+ Tracker OS 线程 + Writer OS 线程 + Tokio（Capture / Aggregation 等）    |
| **前端**     | **基础验证面板**（状态、Session、截图、存储统计）                                                |
| **Schema** | **schema_migrations** 版本化迁移                                                   |


---

## 二、技术栈选型与论证

### 2.1 核心技术栈确认


| 层级       | 技术                | 版本              | 选型理由                                                                 |
| -------- | ----------------- | --------------- | -------------------------------------------------------------------- |
| **框架**   | Tauri             | 2.x（当前稳定 2.2.0） | 原生 WebView 替代 Electron，内存占用低 10 倍+；macOS Private API 支持；自定义 URI 协议能力 |
| **后端语言** | Rust              | 2021 Edition    | 零成本抽象、内存安全、优秀的 FFI 能力；macOS Native API 调用无 overhead                  |
| **数据库**  | SQLite (rusqlite) | rusqlite 0.39.x | 嵌入式零部署、WAL 模式读写并发、单文件备份；日增 ~8MB 完全可控                                 |
| **前端框架** | React             | 18.x            | 成熟生态、Concurrent Features、与 Tauri IPC 配合良好                            |
| **构建工具** | Vite              | 5.x             | 极速 HMR、ESM 原生支持、Tauri 官方推荐                                           |
| **样式方案** | TailwindCSS       | 3.4.x           | 原子化 CSS、零运行时开销、极小 bundle 体积                                          |
| **状态管理** | Zustand           | 4.x             | 轻量（<1KB）、selector 防重渲染、与 React 18 兼容                                 |
| **虚拟列表** | react-virtuoso    | 4.18.3          | 自动 ResizeObserver、分组/网格/表格支持、2.1M 周下载量                               |
| **图像处理** | image crate       | 0.25.x          | Rust 原生 WebP/PNG/JPEG 编解码、无外部依赖                                      |


### 2.2 依赖项评估

一期工程初始化时需引入以下依赖，逐一进行可行性论证：


| 依赖                | 用途                                | 版本                   | 可行性评估                                           | 风险等级 |
| ----------------- | --------------------------------- | -------------------- | ----------------------------------------------- | ---- |
| `image_hasher`    | 截图感知哈希去重（pHash）                   | 3.1.1（2026-02-21 更新） | ✅ 成熟稳定，支持 DCT-pHash + 汉明距离，与 `image` crate 无缝集成 | 低    |
| `crc32fast`       | raw_events state_hash 计算          | 1.x                  | ✅ 零依赖、SIMD 加速、性能极优                              | 低    |
| `cocoa` + `objc`  | macOS NSPasteboard/CoreWLAN 等 FFI | 0.25 / 0.2           | ✅ 生态成熟，广泛用于 macOS Rust 项目                       | 低    |
| `core-foundation` | IOPowerSources 电池状态读取             | 0.9.x                | ✅ Rust 官方 macOS FFI 绑定，社区活跃                     | 低    |
| `core-graphics`   | CGEventTap 全局事件监听                 | 0.23.x               | ⚠️ 需要辅助功能/输入监控权限；代码签名后需运行时验证 `tapIsEnabled`     | 中    |


**不引入的依赖**（明确排除）：


| 排除项                        | 原因                |
| -------------------------- | ----------------- |
| `reqwest` / `hyper`        | 违反零网络原则           |
| `redis` / `kafka` 客户端      | 消息队列过度设计          |
| `sqlcipher`                | 加密层引入密钥管理复杂度，一期无需 |
| `sentry` / `analytics` SDK | 违反零网络原则           |
| `tauri-plugin-updater`     | 需要签名服务器，一期不具备     |


### 2.3 技术栈版本策略（绿场锁定）

一期 **脚手架创建时** 即锁定主依赖的大版本区间；后续按里程碑再评估次要版本与补丁升级。


| 技术          | 建议锁定         | 说明                                                       |
| ----------- | ------------ | -------------------------------------------------------- |
| Tauri       | 2.x（如 2.2.x） | 跟进小版本以获取 Tray Badge 等稳定特性                                |
| rusqlite    | **0.39.x**   | 提供完整 WAL hook / checkpoint API，适配 Writer Actor 高频写入与可观测性 |
| React       | 18.x         | 与 react-virtuoso 等生态对齐后再评估 React 19                      |
| Vite        | 5.x          | 与 Tauri 前端模板默认组合一致，降低脚手架风险                               |
| image crate | 0.25.x       | 与 `image_hasher` 兼容即可                                    |


**原则**：`rusqlite` 在一期 `Cargo.toml` 中 **直接采用 0.39.x**，无需也不存在「自更低版本迁移」的前提。

---

## 三、线程与并发架构

### 3.1 线程模型全景

```
┌──────────────────────────────────────────────────────────────────────┐
│                     Tauri 进程 (单进程多线程)                          │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ 🟢 Main Thread (Tauri Event Loop)                               │ │
│  │   setup() 初始化 · Tray 事件 · Window 事件 · IPC Command 分发    │ │
│  └────────┬──────────────────────────────────────────┬─────────────┘ │
│           │                                          │               │
│  ┌────────▼──────────┐                    ┌──────────▼───────────┐  │
│  │ 🔵 OS Thread       │                    │ 🟠 Writer Actor      │  │
│  │ Tracker Engine     │                    │ (独立 OS 线程)       │  │
│  │ 2s 轮询 → 产出事件  │                    │ mpsc Receiver        │  │
│  └────────┬──────────┘                    │ 单线程串行写 DB       │  │
│           │ mpsc::channel(64)             │ 批量事务提交           │  │
│  ┌────────▼──────────────────────────┐    │ 读连接 Arc<Conn> 只读 │  │
│  │ 🟣 Tokio Runtime                  │    └──────────────────────┘  │
│  │   CaptureService (异步事件循环)    │             ▲                │
│  │   Aggregation Pipeline (定时补偿)  │             │ WriteEvent     │
│  │      │                            │    ┌────────┴──────────┐    │
│  │  ┌───▼──────────────────────────┐ │    │ mpsc::channel(256) │    │
│  │  │ Blocking Thread Pool (tokio) │ │    │ (统一写入通道)      │    │
│  │  │   截图压缩/编码 · pHash 计算  │ │    └────────▲──────────┘    │
│  │  └──────────────────────────────┘ │             │               │
│  └───────────────────────────────────┘             │               │
│                                                     │               │
│  ── P1 可选引擎 (独立 OS 线程，默认可禁用) ──          │               │
│  ┌──────────┐  ┌──────────┐                         │               │
│  │  Input   │  │Clipboard │ ────── WriteEvent ──────┘               │
│  │ Dynamics │  │  Flow    │                                         │
│  └──────────┘  └──────────┘                                         │
│                                                                      │
│  共享资源: Arc<Connection> (只读查询连接，无 Mutex)                    │
│           Arc<AtomicBool> (各引擎运行状态)                            │
│           mpsc::Sender<CaptureSignal> (截图信号)                      │
│           mpsc::Sender<WriteEvent> (统一写入通道)                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 Writer Actor 架构（评审整改核心）

**设计动机**：若多引擎共享 `Arc<Mutex<Connection>>` 写入，易出现锁竞争不可观测、写入节奏分散、难定位性能瓶颈、事务边界模糊等问题。一期采用统一 Writer Actor，将写路径收敛为单线程 + 批量事务。

```
各采集引擎 ─────── WriteEvent ───────→ mpsc::channel(256) ───→ Writer Actor
                                                                    │
                                                          ┌─────────▼─────────┐
                                                          │ Writer Thread      │
                                                          │                   │
                                                          │ loop {            │
                                                          │   batch = drain() │
                                                          │   BEGIN TX        │
                                                          │   for evt in batch│
                                                          │     INSERT ...    │
                                                          │   COMMIT          │
                                                          │   metrics.record()│
                                                          │ }                 │
                                                          └───────────────────┘
```

**WriteEvent 枚举定义**：

```rust
enum WriteEvent {
    RawEvent(RawEventRow),
    AppSwitch(AppSwitchRow),
    Snapshot(SnapshotRow),
    SessionUpdate(SessionUpdateOp),
    InputMetric(InputMetricRow),       // P1
    ClipboardFlow(ClipboardFlowRow),   // P1
    Shutdown,                          // 优雅关闭信号
}
```

**Writer Actor 工作规则**：


| 规则         | 说明                                       |
| ---------- | ---------------------------------------- |
| **单线程独占写** | Writer 线程持有唯一的写连接 `Connection`，无需 Mutex  |
| **批量事务**   | 每次 drain 通道中所有可用事件（最多 64 条），单事务批量提交      |
| **背压控制**   | 通道容量 256，接近满时引擎侧 `try_send` 失败记录 warn 日志 |
| **写入指标**   | 每次事务记录：事件数量、耗时、事务大小，暴露给前端监控              |
| **错误隔离**   | 单条写入失败不影响整批；失败事件记录到 error log，后续可重试      |
| **优雅关闭**   | 收到 Shutdown 信号后，drain 剩余事件、提交最后一批、关闭连接   |


**读写分离**：


| 连接  | 用途                    | 持有方                       | 并发方式         |
| --- | --------------------- | ------------------------- | ------------ |
| 写连接 | INSERT/UPDATE/DELETE  | Writer Actor 独占           | 无竞争          |
| 读连接 | SELECT（IPC 查询、聚合管道读取） | `Arc<Connection>`（只读模式打开） | WAL 模式下读不阻塞写 |


### 3.3 各引擎线程归属与选型理由


| 引擎                       | 线程类型                              | 选型理由                                                 | 交付梯度 |
| ------------------------ | --------------------------------- | ---------------------------------------------------- | ---- |
| **Tracker Engine**       | `std::thread` (OS 线程)             | 调用 Cocoa/CoreGraphics 同步 FFI，不能在 async 上下文中安全调用      | P0   |
| **Capture Engine**       | `tokio::spawn` + `spawn_blocking` | 接收异步信号 → CPU 密集编码在阻塞池执行，不阻塞主事件循环                     | P0   |
| **Aggregation Pipeline** | `tokio::spawn` (定时任务)             | 实时聚合由 Tracker 投递触发；补偿批处理使用 `tokio::time::interval`   | P0   |
| **Writer Actor**         | `std::thread` (OS 线程)             | 独占写连接，串行处理所有写入，无需 async                              | P0   |
| **Input Dynamics**       | `std::thread` (OS 线程)             | CGEventTap 需要 CFRunLoop 驱动，必须在独立 OS 线程的 RunLoop 中运行  | P1   |
| **Clipboard Flow**       | `std::thread` (OS 线程)             | NSPasteboard 轮询需要 Objective-C Runtime 上下文，500ms 轮询周期 | P1   |


### 3.4 线程间通信机制

```
Tracker Engine ─── mpsc::channel(64) ──→ Capture Engine (截图信号)
       │
       ├── WriteEvent::RawEvent ──→ Writer Actor (统一写入通道)
       ├── WriteEvent::AppSwitch ──→ Writer Actor
       ├── AggregationCmd ──→ Aggregation Pipeline (触发 Session 折叠)
       └── app_handle.emit() ──→ Frontend (Tauri Event)

Capture Engine ─── WriteEvent::Snapshot ──→ Writer Actor

Aggregation Pipeline ─── WriteEvent::SessionUpdate ──→ Writer Actor
       └── 读取 raw_events ← Arc<Connection> 只读

[P1] Input Dynamics ─── WriteEvent::InputMetric ──→ Writer Actor
[P1] Clipboard Flow ─── WriteEvent::ClipboardFlow ──→ Writer Actor

IPC Command Handler ─── SELECT 查询 ← Arc<Connection> 只读
```

### 3.5 并发安全策略


| 共享资源       | 保护机制                     | 潜在风险         | 应对策略                                    |
| ---------- | ------------------------ | ------------ | --------------------------------------- |
| SQLite 写连接 | Writer Actor 独占，无需 Mutex | 无竞争          | 单线程串行写入                                 |
| SQLite 读连接 | `Arc<Connection>` 只读模式   | WAL 模式下无读写互斥 | 读操作不需要锁                                 |
| 写入通道       | `mpsc::channel(256)`     | 通道满时事件丢失     | `try_send` 失败时 log warn；正常负载远低于容量       |
| 各引擎运行标志    | `Arc<AtomicBool>`        | 无竞争风险        | 原子操作，lock-free                          |
| 截图信号通道     | `mpsc::channel(64)`      | 通道满时截图信号丢失   | 使用 `try_send`，失败时 log warn 但不阻塞 Tracker |
| Input 计数器  | 线程内局部变量                  | 无跨线程访问       | 5 秒窗口聚合后投递 WriteEvent                   |


---

## 四、核心引擎架构详解

### 4.1 Tracker Engine（全景数据采集引擎）

**职责**：数据底座的入口，按 2s 间隔轮询系统状态，产出 raw_events 原始宽表记录。

**状态机模型**：

```
                    ┌─────────────┐
                    │   IDLE      │  (应用启动，未开始采集)
                    └──────┬──────┘
                           │ start_tracking()
                    ┌──────▼──────┐
              ┌─────│   ACTIVE    │◄──────────────────────┐
              │     └──────┬──────┘                       │
              │            │ idle_seconds >= AFK_THRESHOLD │
              │     ┌──────▼──────┐                       │
              │     │    AFK      │───────────────────────┘
              │     └─────────────┘  idle_seconds < AFK_THRESHOLD
              │ stop_tracking()
              │     ┌─────────────┐
              └────→│   PAUSED    │
                    └─────────────┘
```

**核心轮询逻辑**：

```
loop {
    1. 读取 idle_seconds ← CGEventSourceSecondsSinceLastEventType
    2. IF idle_seconds >= afk_threshold
       → 若上一状态非 AFK：投递 AFK 进入标记，通知 Aggregation 结束当前 Session
       → 跳过本次采集，sleep → continue
    3. 调用 NSWorkspace/AXUIElement 获取:
       app_name, bundle_id, window_title, is_fullscreen
    4. 隐私过滤: 敏感应用检查 → 按策略脱敏/遮蔽 (详见十二章)
    5. 调用 CoreAudio 获取 is_audio_playing
    6. 正则提取 window_title → extracted_url, extracted_file_path
    7. 拼接 app_name + window_title + is_fullscreen → CRC32 → state_hash
    8. 对比 last_state_hash:
       ├── 不同且 app_name 变化 → trigger_type = "window_change"
       ├── 不同且仅 title 变化 → trigger_type = "title_change"
       └── 相同 → trigger_type = "poll"
    9. 微抖动过滤: 若 window_change 后 500ms 内切回原窗口 → 丢弃
   10. 投递 WriteEvent::RawEvent → Writer Actor (不直接写 DB)
   11. 若 trigger_type ∈ {window_change, title_change}:
       → 投递 WriteEvent::AppSwitch → Writer Actor
       → 发送 AggregationCmd 通知聚合管道结束旧 Session / 创建新 Session
       → 发送 CaptureSignal { priority: High } 到 Capture Engine
   12. 若同一窗口持续 > periodic_interval_secs:
       → 发送 CaptureSignal { priority: Low }
   13. app_handle.emit("window_event_updated", session)
   14. sleep(poll_interval_secs)
}
```

**URL/文件路径提取器**（可扩展正则规则表）：


| 场景    | 正则模式                                                       | 提取结果                                     |
| ----- | ---------------------------------------------------------- | ---------------------------------------- |
| 编辑器文件 | `^(.+?)\s*[—–-]\s*(.+?)\s*[—–-]\s*(Cursor|VS Code|Code)`   | file_path = group(1), project = group(2) |
| 浏览器标题 | `^(.+?)\s*[—–-]\s*(Google Chrome|Safari|Arc|Firefox|Edge)` | page_title = group(1)                    |
| 终端命令  | `(?:[$%#>])\s*(.+)$`                                       | command = group(1)                       |
| 通用文件名 | `(\S+\.\w{1,5})`                                           | filename（含扩展名）                           |


### 4.2 Capture Engine（智能截图引擎）

**处理流水线**：

```
CaptureSignal 到达
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│  1. screencapture -x -m -t png /tmp/{uuid}.png              │ OS 调用
│     (静默模式，无快门音，主屏幕)                                │
├──────────────────────────────────────────────────────────────┤
│  2. image::open(png_path)                                    │
│     → resize_exact(target_width, target_height, Lanczos3)    │ spawn_blocking
│     → encode WebP (quality = webp_quality)                   │
│     → write to ~/.timelens/data/shots/{date}/{uuid}_{type}.webp │
├──────────────────────────────────────────────────────────────┤
│  3. IF dedup_enabled && trigger_type == "poll_driven":       │
│     → image_hasher::HasherConfig::new()                      │ pHash 去重
│       .hash_alg(HashAlg::PerceptualHash)                     │
│       .hash_size(8, 8) → 64-bit hash                        │
│     → hamming_distance(current_hash, last_hash)              │
│     → IF distance < dedup_hamming_threshold → 跳过存储       │
├──────────────────────────────────────────────────────────────┤
│  4. 投递 WriteEvent::Snapshot → Writer Actor                 │ 统一写入
│  5. app_handle.emit("new_snapshot_saved", payload)           │ 前端通知
│  6. 清理 /tmp 临时 PNG                                       │ 清理
└──────────────────────────────────────────────────────────────┘
```

**存储空间预估与控制**：


| 分辨率      | WebP 质量 | 单张大小      | 日产量       | 日增空间     |
| -------- | ------- | --------- | --------- | -------- |
| 1440x900 | 75      | ~30-60 KB | 300-800 张 | 15-50 MB |
| 1080x675 | 75      | ~20-40 KB | 300-800 张 | 10-30 MB |
| 720x450  | 60      | ~10-20 KB | 300-800 张 | 5-15 MB  |


### 4.3 Input Dynamics Engine（输入行为学引擎）【P1 可选】

> ⚠️ **交付梯度：P1 可选增强**。该模块依赖 CGEventTap（需 Input Monitoring 权限），存在签名竞态风险。P0 核心链路不依赖此模块。默认可禁用，通过配置项 `engines.input_dynamics.enabled` 控制。

**技术实现架构**：

```
┌─────────────────────────────────────────────────────────────┐
│  CGEventTap (独立 OS 线程 + CFRunLoop)                       │
│                                                             │
│  监听事件类型:                                                │
│  ├── kCGEventKeyDown     → keystrokes_count++               │
│  ├── kCGEventFlagsChanged → 检测修饰键组合 (Cmd+C/V/Z 等)    │
│  ├── kCGEventLeftMouseDown → mouse_click_count++             │
│  ├── kCGEventMouseMoved  → 累加 mouse_distance_px            │
│  └── kCGEventScrollWheel → scroll_delta_total 累加            │
│                                                             │
│  内存中维护 5s 滑动窗口计数器:                                 │
│  ┌──────────────────────────────────────┐                   │
│  │ struct InputAccumulator {            │                   │
│  │   keystrokes: u32,                  │                   │
│  │   deletes: u32,                     │                   │
│  │   shortcuts: u32,                   │                   │
│  │   copies: u32, pastes: u32,         │                   │
│  │   undos: u32,                       │                   │
│  │   clicks: u32,                      │                   │
│  │   mouse_dist: f64,                  │                   │
│  │   scroll_total: f64,               │                   │
│  │   scroll_dir_changes: u32,          │                   │
│  │   burst_count: u32,                 │                   │
│  │   longest_pause_ms: u64,            │                   │
│  │   last_key_time: Instant,           │                   │
│  │   window_start: Instant,            │                   │
│  │ }                                   │                   │
│  └──────────────────────────────────────┘                   │
│                                                             │
│  每 5 秒:                                                    │
│  → 计算 kpm = keystrokes * 12.0                              │
│  → 计算 delete_ratio = deletes / keystrokes                  │
│  → 投递 WriteEvent::InputMetric → Writer Actor               │
│  → app_handle.emit("input_metrics_updated")                  │
│  → 重置计数器                                                 │
└─────────────────────────────────────────────────────────────┘
```

**隐私保障机制**：

- CGEventTap 回调中**仅读取 `CGEventFlags`**（修饰键标志位），用于识别 Cmd+C/V/Z 等快捷键组合
- **绝不调用** `CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode)` 获取具体键值
- 快捷键检测逻辑：仅检查 `flags & kCGEventFlagMaskCommand != 0`，不解析具体字符

**CGEventTap 健壮性措施**（基于 2026 年 macOS 最新研究）：

- 运行时持续验证 `CGEvent.tapIsEnabled()`，检测到 Tap 被系统禁用时自动重建
- 处理 `tapDisabledByTimeout` 和 `tapDisabledByUserInput` 回调
- 代码签名后避免通过 Launch Services 触发的静默禁用竞态

### 4.4 Clipboard Flow Engine（剪贴板流动图谱）【P1 可选】

> ⚠️ **交付梯度：P1 可选增强**。该模块技术风险低，但依赖 Input Dynamics 的 CGEventTap 检测 Paste。默认可禁用，通过配置项 `engines.clipboard_flow.enabled` 控制。

**技术方案**：

```
┌──────────────────────────────────────────────────────┐
│  Copy 检测 (独立 OS 线程，500ms 轮询)                  │
│                                                      │
│  loop {                                              │
│    let count = NSPasteboard::generalPasteboard()     │
│                  .changeCount();                      │
│    if count != last_change_count {                   │
│      // 剪贴板已变化                                   │
│      let types = pasteboard.availableTypes();         │
│      let content_type = infer_type(types);           │
│      let content_length = read_length(types);        │
│      let flow_pair_id = Uuid::new_v4();              │
│      投递 WriteEvent::ClipboardFlow(action="copy")   │
│      last_copy_pair_id = flow_pair_id;               │
│      last_change_count = count;                      │
│    }                                                 │
│    sleep(500ms);                                     │
│  }                                                   │
├──────────────────────────────────────────────────────┤
│  Paste 检测 (复用 Input Dynamics 的 CGEventTap)       │
│                                                      │
│  当 CGEventTap 检测到 Cmd+V:                          │
│  → 投递 WriteEvent::ClipboardFlow(                   │
│      action="paste",                                 │
│      flow_pair_id = last_copy_pair_id,               │
│      app_name = current_foreground_app               │
│    ) → Writer Actor                                  │
└──────────────────────────────────────────────────────┘
```

**内容类型推断映射**：


| NSPasteboard UTI             | content_type   |
| ---------------------------- | -------------- |
| `public.plain-text`          | `plain_text`   |
| `public.rtf`                 | `rich_text`    |
| `public.url`                 | `url`          |
| `public.png` / `public.jpeg` | `image`        |
| `public.file-url`            | `file_ref`     |
| 含缩进+括号+分号的纯文本                | `code_snippet` |
| 其他                           | `other`        |


### 4.5 Notification Tracker（通知打断记录）【延后至 1.5/二期】

> 🔴 **交付梯度：延后**。检测方案不确定，数据可信度待验证。一期仅在 Schema 和代码结构中预留扩展点，不实现业务逻辑。

**技术方案选型**（供 1.5/二期参考）：


| 方案                               | 实现方式                                                                    | 优势              | 劣势                                       | 结论       |
| -------------------------------- | ----------------------------------------------------------------------- | --------------- | ---------------------------------------- | -------- |
| A. DistributedNotificationCenter | 监听 `com.apple.notificationcenterui` 通知                                  | 系统级接口，无需额外权限    | 回调延迟不可控，沙盒应用 userInfo 为 nil，无法获取通知来源 App | **备选**   |
| B. Accessibility API             | 监听通知横幅 AXUIElement                                                      | 可获取通知内容和来源      | 需要辅助功能权限（已有），实现复杂度高                      | **备选**   |
| C. 时间窗口推断                        | 结合 `NSWorkspace.didActivateApplicationNotification` + app_switches 时间窗口 | 无需额外 API，利用已有数据 | 无法区分通知触发和用户主动切换                          | **一期推荐** |


**一期推荐方案 C 的实现逻辑**：

1. 监听 `NSWorkspace.didActivateApplicationNotification`，记录所有 App 激活事件
2. 当 app_switch 发生时，检查前 3 秒内是否有系统通知横幅出现
3. 横幅检测：通过 Accessibility API 检测 `AXNotification` 的 `AXUIElement`
4. 若检测到通知且 to_app 匹配通知来源 → `caused_switch = 1`

**降级策略**：若 Accessibility 横幅检测不可靠，所有通知记录的 `switch_type` 默认为 `voluntary`，二期通过 AI 行为模式补充推断。

### 4.6 Ambient Context Engine（环境感知引擎）【延后至 1.5/二期】

> 🔴 **交付梯度：延后**。WiFi SSID 等字段受 macOS Sequoia 权限限制，active_space 依赖 Private API。一期仅在 Schema 中预留表结构，不实现采集逻辑。

**各字段采集 API 与权限要求**（供 1.5/二期参考）：


| 字段                      | macOS API                                       | 权限要求                                    | 兼容性                          | 降级策略                   |
| ----------------------- | ----------------------------------------------- | --------------------------------------- | ---------------------------- | ---------------------- |
| `wifi_ssid`             | `CWWiFiClient` (CoreWLAN) + `CLLocationManager` | **Location Services**（macOS Sonoma+ 必需） | ⚠️ macOS Sequoia 限制加严        | 权限拒绝 → 字段为 NULL        |
| `display_count`         | `NSScreen.screens.count`                        | 无                                       | ✅ 全版本                        | —                      |
| `is_external_display`   | `NSScreen` 分辨率比较                                | 无                                       | ✅ 全版本                        | —                      |
| `battery_level`         | `IOPSCopyPowerSourcesInfo`                      | 无                                       | ✅ 全版本（台式机返回 NULL）            | —                      |
| `is_charging`           | `IOPSCopyPowerSourcesInfo`                      | 无                                       | ✅ 全版本                        | —                      |
| `is_camera_active`      | 检测 `VDCAssistant` / `AppleCameraAssistant` 进程   | 无                                       | ✅ 间接检测，零权限                   | —                      |
| `is_audio_input_active` | `AudioObjectGetPropertyData`                    | 无                                       | ✅ CoreAudio 标准 API           | —                      |
| `is_dnd_enabled`        | Focus API (macOS Ventura+) / `defaults read`    | 无                                       | ⚠️ API 版本差异                  | 旧版本通过 defaults read 读取 |
| `screen_brightness`     | `IODisplayConnect`                              | 无                                       | ✅                            | —                      |
| `active_space_index`    | `CGSGetActiveSpace` (**Private API**)           | 无                                       | ⚠️ Private API，App Store 不兼容 | 默认关闭，配置项控制             |


**WiFi SSID 采集的特殊处理**（基于 macOS Sequoia 最新限制）：

```
IF macOS 版本 < 15.0 (Sequoia 之前):
    → CWWiFiClient().interface()?.ssid()  // 需要 Location Services 权限
ELSE:
    → 调用 system_profiler SPAirPortDataType 命令行
    → 解析输出提取 Current Network 信息
FALLBACK:
    → wifi_ssid = NULL  // 不阻塞其他采集
```

---

## 五、数据架构

### 5.1 双层数据模型

```
                    ┌─────────────────────────┐
                    │      raw_events          │  L1: 原始宽表
                    │  (只追加，不修改)          │  ~28,800 条/天
                    │  每 2s 一条采集记录        │  保留 7 天后归档
                    └────────────┬────────────┘
                                 │ Aggregation Pipeline (折叠)
                    ┌────────────▼────────────┐
                    │    window_sessions       │  L2: 结构化会话
                    │  (折叠后的连续使用段)      │  ~200-500 条/天
                    │  绑定 Intent 意图标签      │  永久保留
                    └─────────────────────────┘
```

**双层设计的价值**：

1. **原始数据零损耗**：raw_events 保留完整的轮询粒度，二期 AI 可从任意维度重新分析
2. **查询层轻量**：前端和 IPC 只查询 window_sessions（日均百条级别），不触碰海量原始记录
3. **可重放**：若聚合逻辑有 bug，可基于 raw_events 重新折叠生成 Session

### 5.2 数据表关系图（分梯度标注）

```
 ═══ P0 核心表（一期必做）═══════════════════════════════════════════

                    ┌──────────────┐
                    │  raw_events  │─────────────────────────┐
                    │  (P0 核心)   │                         │
                    └──────┬───────┘                         │
                           │ 折叠聚合                         │ 衍生
                    ┌──────▼───────┐         ┌───────────────▼──┐
                    │   window_    │◄────────│  app_switches    │
                    │   sessions   │ 关联     │  (P0 简版)       │
                    │  (P0 核心)   │         └──────────────────┘
                    └──┬───────────┘
                       │
              外键关联  │
          ┌────────────┘
          │
   ┌──────▼───────┐   ┌──────────────┐   ┌───────────────┐
   │  snapshots   │   │  app_meta    │   │schema_        │
   │  (P0 核心)   │   │ (P0 核心)    │   │migrations     │
   └──────────────┘   └──────────────┘   │(P0 核心)      │
                                          └───────────────┘

 ═══ P1 可选表（视进度纳入）═════════════════════════════════════════

   ┌──────────────┐  ┌──────────────┐  ┌───────────────┐
   │input_metrics │  │clipboard_    │  │intent_mapping │
   │ (P1 可选)    │  │flows (P1)    │  │ (P1 可选)     │
   └──────────────┘  └──────────────┘  └───────────────┘
                     ┌───────────────┐
                     │  settings     │
                     │ (P1 可选)     │
                     └───────────────┘

 ═══ 延后表（Schema 预留，不实现采集）═══════════════════════════════

   ┌──────────────┐  ┌───────────────┐
   │ambient_      │  │notifications  │
   │context (延后) │  │(延后)         │
   └──────────────┘  └───────────────┘
```

### 5.3 日数据量与存储预估

**P0 核心数据量（一期基线）**：


| 数据表             | 采集频率  | 日增条数     | 单条大小   | 日增空间        |
| --------------- | ----- | -------- | ------ | ----------- |
| raw_events      | 2s    | ~28,800  | ~180 B | ~5 MB       |
| window_sessions | 按窗口变化 | ~200-500 | ~200 B | ~100 KB     |
| snapshots       | 事件+轮询 | ~300-800 | ~250 B | 元数据 ~200 KB |
| app_switches    | 按切换   | ~200-500 | ~200 B | ~100 KB     |


**P0 总计**：

- 数据库日增：**~5.5 MB**
- 截图文件日增：**~15-50 MB**（1440x900 WebP Q75，含去重）
- 月度总量：**~0.6-1.6 GB**
- raw_events 7 天归档后月度量：**~0.5-1.4 GB**

**P1 增量（若纳入）**：


| 数据表             | 采集频率 | 日增条数    | 单条大小   | 日增空间   |
| --------------- | ---- | ------- | ------ | ------ |
| input_metrics   | 5s   | ~5,760  | ~350 B | ~2 MB  |
| clipboard_flows | 按操作  | ~50-200 | ~150 B | ~30 KB |


P1 纳入后数据库日增增加约 **~2 MB**。

### 5.4 Schema 迁移机制

```
┌─────────────────────────────────────────────────────┐
│  应用启动                                             │
│    │                                                 │
│    ▼                                                 │
│  SELECT MAX(version) FROM schema_migrations          │
│    │                                                 │
│    ▼                                                 │
│  当前版本 current_version (NULL → 0)                  │
│    │                                                 │
│    ▼                                                 │
│  遍历 MIGRATIONS 数组 (Rust 代码硬编码):               │
│  [                                                   │
│    Migration { version: 1, sql: "CREATE TABLE ...",   │
│                desc: "初始 Schema" },                 │
│    Migration { version: 2, sql: "ALTER TABLE ...",    │
│                desc: "新增 bundle_id 字段" },          │
│    ...                                               │
│  ]                                                   │
│    │                                                 │
│    ▼                                                 │
│  FOR each migration WHERE version > current_version: │
│    BEGIN TRANSACTION                                  │
│    → 执行 migration.sql                              │
│    → INSERT INTO schema_migrations                    │
│    COMMIT                                            │
│    │                                                 │
│    ▼                                                 │
│  全部迁移执行完毕 → 应用正常启动                        │
└─────────────────────────────────────────────────────┘
```

### 5.5 数据库性能优化策略


| 策略            | 实现方式                                                        | 预期收益          |
| ------------- | ----------------------------------------------------------- | ------------- |
| WAL 模式        | `PRAGMA journal_mode=WAL`                                   | 读写并发，写入不阻塞读取  |
| 时间戳索引         | 所有时序表的 `timestamp_ms` 字段建索引                                 | 按天查询 O(log n) |
| 批量写入          | raw_events 攒 10 条后单事务批量 INSERT                              | 减少事务开销 ~5x    |
| 预编译语句         | `prepare_cached()` 复用 PreparedStatement                     | 避免重复 SQL 解析   |
| 定期 checkpoint | WAL 文件超过 4MB 时触发 `wal_checkpoint(TRUNCATE)`                 | 防止 WAL 文件无限增长 |
| 连接 PRAGMA 调优  | `PRAGMA cache_size=-8000` (8MB)、`PRAGMA synchronous=NORMAL` | 平衡性能与数据安全     |


### 5.6 核心语义定义（评审整改新增）

> 以下定义为实现级规范，所有开发者必须严格遵循，避免多人开发时产生理解偏差。

#### 5.6.1 RawEvent 定义

**RawEvent** 是系统最底层的数据记录单位，由 Tracker Engine 每 2 秒产出一条。

```
RawEvent {
    id: TEXT (UUID v4),
    timestamp_ms: INTEGER (Unix 毫秒时间戳，采集瞬间),
    app_name: TEXT (前台应用显示名，经隐私过滤),
    bundle_id: TEXT (macOS Bundle ID，如 "com.apple.Safari"),
    window_title: TEXT (窗口标题，经隐私过滤/脱敏),
    is_fullscreen: INTEGER (0/1),
    is_audio_playing: INTEGER (0/1),
    extracted_url: TEXT NULLABLE (从 window_title 正则提取),
    extracted_file_path: TEXT NULLABLE (从 window_title 正则提取),
    idle_seconds: REAL (CGEventSource 空闲秒数),
    trigger_type: TEXT (触发类型，见下表),
    state_hash: INTEGER (CRC32，用于变化检测),
    created_at: TEXT (ISO 8601)
}
```

**不可变约束**：RawEvent 一旦写入，永不修改、永不删除（仅到期归档时整批清除）。

#### 5.6.2 Trigger 类型语义


| trigger_type    | 语义     | 触发条件                                            |
| --------------- | ------ | ----------------------------------------------- |
| `poll`          | 常规轮询   | state_hash 未变化的 2s 周期采样                         |
| `window_change` | 窗口切换   | state_hash 变化且 app_name 或 bundle_id 不同          |
| `title_change`  | 标题变化   | state_hash 变化但 app_name 相同（如浏览器切换标签页）           |
| `afk_enter`     | 进入 AFK | idle_seconds ≥ afk_threshold（默认 300s），仅记录一条标记   |
| `afk_exit`      | 退出 AFK | 从 AFK 状态恢复到 ACTIVE，idle_seconds < afk_threshold |


#### 5.6.3 Session 定义与边界规则

**WindowSession** 是 raw_events 折叠后的结构化使用段，代表用户在同一应用/同一窗口的一段连续使用时间。

```
WindowSession {
    id: TEXT (UUID v4),
    app_name: TEXT,
    bundle_id: TEXT,
    window_title: TEXT (Session 创建时的初始标题),
    start_time_ms: INTEGER (Session 开始时间),
    end_time_ms: INTEGER (Session 结束时间，活跃 Session 持续更新),
    duration_secs: REAL (end - start，冗余字段加速查询),
    is_active: INTEGER (0/1，是否为当前活跃 Session),
    intent: TEXT NULLABLE (意图标签，P1 通过规则匹配填充),
    raw_event_count: INTEGER (折叠的 raw_events 条数),
    created_at: TEXT (ISO 8601)
}
```

**Session 切分规则（精确定义）**：


| 切分条件                       | 行为                             | 说明                                                         |
| -------------------------- | ------------------------------ | ---------------------------------------------------------- |
| `window_change`（app 切换）    | **立即结束**当前 Session，创建新 Session | 不同 app 必定切分                                                |
| `title_change`（同 app 标题变化） | **不切分**                        | 同一 app 内标签页/文件切换视为同一 Session；title 变化记录在 raw_events 中供二期分析 |
| `afk_enter`                | **立即结束**当前 Session             | AFK 期间不产生 Session                                          |
| `afk_exit`                 | 创建新 Session（即使回到相同 app）        | AFK 后恢复视为全新使用段                                             |
| 应用退出/关闭                    | **立即结束**当前 Session             | 通过 Tracker 检测到前台 app 变为空或不同 app                            |
| 微抖动（500ms 内切回）             | **不切分**，丢弃中间的 window_change 事件 | 防止快速 Alt-Tab 产生碎片 Session                                  |


**title_change 不切分 Session 的理由**：

- 一个 Session 代表用户在某个应用上的连续专注段
- 浏览器切换标签页、编辑器切换文件属于同一应用内的自然行为
- 若 title_change 也切分，日均 Session 数可能暴涨至 2000+，丧失聚合价值
- 二期 AI 可根据 raw_events 中的 title_change 记录进行更细粒度的子段分析

#### 5.6.4 AFK 切断规则

```
AFK 生命周期:

ACTIVE ──[idle_seconds ≥ afk_threshold]──→ AFK_ENTERING
    │                                          │
    │                                    1. 记录 trigger_type="afk_enter" 到 raw_events
    │                                    2. 结束当前 Session: end_time_ms = now, is_active = 0
    │                                    3. emit("afk_state_changed", {is_afk: true})
    │                                          │
    │                                          ▼
    │                                      AFK 状态
    │                                    (跳过所有采集，仅检测 idle_seconds)
    │                                          │
    │                              [idle_seconds < afk_threshold]
    │                                          │
    └──────────────────────────────────── AFK_EXITING
                                               │
                                    1. 记录 trigger_type="afk_exit" 到 raw_events
                                    2. 创建新 Session (即使回到相同 app)
                                    3. emit("afk_state_changed", {is_afk: false})
```

**关键约束**：

- `afk_threshold` 默认 300 秒（5 分钟），通过配置项可调
- AFK 期间不产生 raw_events（除 afk_enter/afk_exit 标记），不触发截图
- 系统休眠/合盖等同于超长 AFK，唤醒后走 afk_exit 流程

#### 5.6.5 Screenshot 归属规则


| 场景                                  | 截图归属                | 说明                 |
| ----------------------------------- | ------------------- | ------------------ |
| `window_change` / `title_change` 触发 | 归属于**新 Session**    | 截图反映切换后的窗口状态       |
| `poll_driven` 周期截图                  | 归属于**当前活跃 Session** | 反映持续使用中的窗口状态       |
| AFK 期间                              | **不截图**             | AFK 状态下无有效 Session |


**归属绑定时机**：

- 截图完成后，通过当前活跃 Session 的 `id` 关联写入 `snapshots.session_id`
- 若截图处理期间 Session 已切换（异步延迟），使用截图信号发出时刻的 Session ID（信号中携带）

#### 5.6.6 聚合修正与重放策略

**补偿批处理**：Aggregation Pipeline 定期（每 60 秒）扫描未闭合的 Session：

- 若 Session 已 >10 分钟无新 raw_event 归属且非 AFK → 强制闭合（end_time_ms = 最后一条 raw_event 的时间）
- 若发现 raw_events 中存在未关联到任何 Session 的孤立记录 → 补建 Session

**重放机制（用于聚合 bug 修复）**：

```
重放流程:
1. 清空 window_sessions 表
2. 按 timestamp_ms 顺序遍历 raw_events
3. 依据 5.6.3 切分规则重新折叠生成 Session
4. 重新关联 snapshots → session_id
```

**幂等性约束**：

- 重放必须是幂等的：对同一批 raw_events 多次重放，生成的 Session 集合完全一致
- raw_events 的 `trigger_type` 和 `state_hash` 是重放的唯一判据，不依赖外部状态
- 重放不修改 raw_events 本身（只读消费）

---

## 六、通信层架构（Tauri IPC）

### 6.1 三通道模型

```
┌───────────────────────────────────────────────────────────────┐
│                    Frontend (React)                            │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ invoke(cmd)  │  │ listen(evt)  │  │ <img src=          │  │
│  │ → Promise<T> │  │ → callback   │  │  "timelens://..."> │  │
│  └──────┬───────┘  └──────▲───────┘  └────────┬───────────┘  │
│         │                 │                    │              │
├─────────┼─────────────────┼────────────────────┼──────────────┤
│         │   Tauri IPC     │                    │              │
│   ┌─────▼────┐   ┌───────┴────┐   ┌──────────▼──────────┐   │
│   │ Command  │   │   Event    │   │   URI Protocol      │   │
│   │ Channel  │   │  Channel   │   │   Channel           │   │
│   │ (Pull)   │   │  (Push)    │   │   (Asset)           │   │
│   │          │   │            │   │                     │   │
│   │ 30+      │   │ 11 事件    │   │ timelens://         │   │
│   │ Commands │   │ 类型       │   │ → 本地文件映射       │   │
│   └─────┬────┘   └───────┬────┘   └──────────┬──────────┘   │
│         │                │                    │              │
├─────────┼────────────────┼────────────────────┼──────────────┤
│         │                │                    │              │
│         ▼                │                    ▼              │
│      Rust Backend   emit(event)          fs::read()         │
└───────────────────────────────────────────────────────────────┘
```

### 6.2 Command 分组清单

#### P0 Commands（一期必做）


| 分组             | Command                 | 参数                  | 返回值                  |
| -------------- | ----------------------- | ------------------- | -------------------- |
| **采集控制**       | `start_tracking`        | -                   | `()`                 |
|                | `stop_tracking`         | -                   | `()`                 |
|                | `is_tracking`           | -                   | `bool`               |
|                | `trigger_screenshot`    | -                   | `()`                 |
|                | `check_permissions`     | -                   | `PermissionStatus`   |
|                | `restart_tracking`      | -                   | `bool`               |
| **Session 查询** | `get_sessions`          | `{date, app_name?}` | `Vec<WindowSession>` |
|                | `get_session_snapshots` | `{session_id}`      | `Vec<Snapshot>`      |
|                | `get_activity_stats`    | `{date?}`           | `ActivityStats`      |
|                | `get_all_app_meta`      | -                   | `Vec<AppMeta>`       |
|                | `get_app_switches`      | `{date, limit?}`    | `Vec<AppSwitch>`     |
| **存储管理**       | `get_storage_stats`     | -                   | `StorageStats`       |
|                | `open_data_dir`         | -                   | `()`                 |
|                | `get_raw_events_recent` | `{limit}`           | `Vec<RawEvent>`      |
| **Writer 监控**  | `get_writer_stats`      | -                   | `WriterStats`        |


#### P1 Commands（可选增强）


| 分组        | Command                    | 参数                    | 返回值                      |
| --------- | -------------------------- | --------------------- | ------------------------ |
| **差异化数据** | `get_input_metrics`        | `{date, session_id?}` | `Vec<InputMetric>`       |
|           | `get_clipboard_flows`      | `{date, limit?}`      | `Vec<ClipboardFlow>`     |
|           | `get_clipboard_flow_graph` | `{date}`              | `Vec<FlowEdge>`          |
|           | `get_switch_graph`         | `{date}`              | `Vec<SwitchEdge>`        |
| **配置管理**  | `get_settings`             | -                     | `HashMap<String,String>` |
|           | `set_setting`              | `{key, value}`        | `()`                     |
|           | `get_intent_mappings`      | -                     | `Vec<IntentMapping>`     |
|           | `upsert_intent_mapping`    | `IntentMapping`       | `()`                     |
|           | `delete_intent_mapping`    | `{id}`                | `()`                     |


### 6.3 Event 推送清单


| Event                     | Payload                  | 频率               | 梯度  |
| ------------------------- | ------------------------ | ---------------- | --- |
| `window_event_updated`    | `WindowSession`          | 每次 Session 创建/更新 | P0  |
| `new_snapshot_saved`      | `SnapshotPayload`        | 每次截图保存           | P0  |
| `tracking_state_changed`  | `{is_running: bool}`     | 采集启停时            | P0  |
| `permissions_required`    | `PermissionStatus`       | 权限缺失时            | P0  |
| `afk_state_changed`       | `{is_afk, idle_seconds}` | AFK 状态切换时        | P0  |
| `app_switch_recorded`     | `AppSwitch`              | 每次窗口切换           | P0  |
| `writer_stats_updated`    | `WriterStats`            | 每 10 秒           | P0  |
| `input_metrics_updated`   | `InputMetric`            | 每 5 秒            | P1  |
| `clipboard_flow_recorded` | `ClipboardFlow`          | 每次 Copy/Paste    | P1  |


---

## 七、前端架构

### 7.1 基础验证面板（P0）

> 一期前端收缩为基础验证面板，聚焦核心数据闭环校验。差异化数据看板（Tab 2）延后至 P1 模块完成后。

```
┌─────────────────────────────────────────────────────────────┐
│ ① 状态栏 (固定顶部)                                          │
│   ● 运行状态灯  │ Session: 142 │ 截图: 356 │ DB: 12.3MB     │
│   引擎状态: [Tracker✅] [Capture✅] [Writer✅]                │
│   P1 引擎: [Input ⚪ 未启用] [Clip ⚪ 未启用]                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────┬──────────────────────────────┐   │
│  │ ② 实时事件流          │ ③ 截图预览                    │   │
│  │ (Virtuoso 虚拟列表)   │ (点击 Session 联动)           │   │
│  │ 最近 50 条 Session    │ 大图 + 元数据                 │   │
│  │ App 切换记录          │ 截图归属 Session 信息          │   │
│  └──────────────────────┴──────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ④ 存储与 Writer 监控                                  │   │
│  │   DB 大小 · 截图大小 · raw_events 条数                 │   │
│  │   Writer: 批次数 · 平均耗时 · 通道利用率                │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ ⑤ 底部工具栏                                                │
│ [📂 直通黑盒] [📸 手动截图] [▶/⏸ 采集控制]                    │
│              100% 本地存储 · 无外部网络请求                   │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 前端技术选型


| 关注点    | 方案                              | 理由                             |
| ------ | ------------------------------- | ------------------------------ |
| 状态管理   | Zustand 4.x                     | 轻量、selector 隔离渲染、无 Provider 嵌套 |
| 长列表    | react-virtuoso 4.18.3           | 自动高度测量、分组支持、周下载量 210 万         |
| 样式     | TailwindCSS 3.4                 | 原子化零运行时、极小 bundle              |
| 截图加载   | `timelens://` 自定义协议             | 绕过 WebView CORS 沙盒限制           |
| IPC 封装 | `@tauri-apps/api` invoke/listen | 类型安全的前后端通信                     |


### 7.3 Zustand Store 设计

```typescript
// P0 核心状态
interface AppState {
  // 采集状态
  isTracking: boolean;
  isAfk: boolean;
  engineStatus: Record<string, 'running' | 'paused' | 'error' | 'disabled'>;

  // 核心数据
  sessions: WindowSession[];
  selectedSession: WindowSession | null;
  sessionSnapshots: Snapshot[];
  latestSnapshot: Snapshot | null;
  recentAppSwitches: AppSwitch[];

  // Writer 监控
  writerStats: {
    totalWrites: number;
    avgBatchSize: number;
    avgLatencyMs: number;
    channelUtilization: number;
  } | null;

  // 存储统计
  todayStats: {
    sessionCount: number;
    snapshotCount: number;
    switchCount: number;
    dbSizeBytes: number;
    shotsSizeBytes: number;
  };

  // Actions
  fetchSessions: (date: string) => Promise<void>;
  selectSession: (session: WindowSession) => Promise<void>;
}

// P1 扩展状态（独立 slice，按需加载）
interface P1State {
  latestInputMetric: InputMetric | null;
  recentClipboardFlows: ClipboardFlow[];
  settings: Record<string, string>;
  fetchSettings: () => Promise<void>;
  updateSetting: (key: string, value: string) => Promise<void>;
}
```

---

## 八、文件系统架构

### 8.1 目录结构

```
~/.timelens/
├── data/
│   ├── db.sqlite                          # 主数据库 (12 张表)
│   ├── db.sqlite-wal                      # WAL 日志
│   ├── db.sqlite-shm                      # 共享内存
│   └── shots/                             # 截图存储根目录
│       ├── 2026-03-27/                    # 按日分区
│       │   ├── a1b2c3d4_event_driven.webp
│       │   ├── e5f6g7h8_poll_driven.webp
│       │   └── ...
│       └── 2026-03-26/
│           └── ...
├── logs/                                  # 应用日志 (P1)
│   └── timelens.log
└── config/                                # 预留配置目录 (P1)
```

### 8.2 存储清理策略


| 策略                | 触发条件                                                     | 行为                                             |
| ----------------- | -------------------------------------------------------- | ---------------------------------------------- |
| raw_events 自动归档   | 超过 `storage.raw_events_retention_days`（默认 7 天）           | DELETE FROM raw_events WHERE timestamp_ms < 阈值 |
| 截图自动清理            | 超过 `privacy.snapshot_retention_days`（默认 **3 天**，短于结构化数据） | 删除过期截图文件 + snapshots 记录中的 file_path 置空（保留元数据）  |
| 截图手动清理            | 用户通过 UI 触发                                               | 按日期范围删除截图文件 + snapshots 记录                     |
| WAL 自动 checkpoint | WAL 文件 > 4MB                                             | `wal_checkpoint(TRUNCATE)` 回收空间                |
| 清理前提示             | 所有清理操作                                                   | 展示将释放的空间大小，二次确认                                |


---

## 九、权限模型

### 9.1 macOS 权限矩阵


| 权限                           | 用途                     | 依赖模块                                | 缺失影响                       | 检测方式                                      |
| ---------------------------- | ---------------------- | ----------------------------------- | -------------------------- | ----------------------------------------- |
| **辅助功能 (Accessibility)**     | 窗口标题获取、CGEventTap 事件监听 | Tracker、Input Dynamics、Notification | 🔴 核心功能不可用                 | `AXIsProcessTrusted()`                    |
| **屏幕录制 (Screen Recording)**  | screencapture 截图       | Capture Engine                      | 🔴 截图功能不可用                 | `CGPreflightScreenCaptureAccess()`        |
| **定位服务 (Location Services)** | WiFi SSID 获取           | Ambient Context                     | 🟡 wifi_ssid 字段为 NULL，其他正常 | `CLLocationManager.authorizationStatus()` |
| **输入监控 (Input Monitoring)**  | CGEventTap listen-only | Input Dynamics                      | 🔴 输入行为采集不可用               | `CGPreflightListenEventAccess()`          |


### 9.2 权限检测与引导流程

```
应用启动
    │
    ▼
检测 Accessibility ──── 未授权 ──→ 打开系统偏好设置
    │ 已授权                         引导用户授权
    ▼                                （阻塞等待）
检测 Screen Recording ── 未授权 ──→ 打开系统偏好设置
    │ 已授权
    ▼
检测 Input Monitoring ── 未授权 ──→ 打开系统偏好设置
    │ 已授权
    ▼
检测 Location Services ── 未授权 ──→ 提示可选，不阻塞
    │ 已授权或跳过
    ▼
启动所有采集引擎 (根据权限状态选择性启动)
    │
    ▼
emit("permissions_required", status) → 前端展示权限状态
```

---

## 十、技术可行性分析与风险评估

### 10.1 核心模块可行性矩阵


| 模块                   | 交付梯度   | 技术可行性              | 权限风险               | 综合评级   |
| -------------------- | ------ | ------------------ | ------------------ | ------ |
| Tracker Engine       | **P0** | ✅ 已验证              | 需 Accessibility    | 🟢 低风险 |
| Capture Engine       | **P0** | ✅ 已验证              | 需 Screen Recording | 🟢 低风险 |
| Aggregation Pipeline | **P0** | ✅ 纯逻辑              | 无                  | 🟢 低风险 |
| Writer Actor         | **P0** | ✅ 成熟模式             | 无                  | 🟢 低风险 |
| pHash 截图去重           | **P0** | ✅ image_hasher 成熟  | 无                  | 🟢 低风险 |
| Input Dynamics       | **P1** | ⚠️ CGEventTap 签名竞态 | 需 Input Monitoring | 🟡 中风险 |
| Clipboard Flow       | **P1** | ✅ NSPasteboard 成熟  | 无额外权限              | 🟢 低风险 |
| Notification Tracker | **延后** | ⚠️ 检测方案不确定         | 需 Accessibility    | 🟡 中风险 |
| Ambient Context      | **延后** | ⚠️ WiFi SSID 权限收紧  | Location Services  | 🟡 中风险 |


### 10.2 风险项详细分析与应对

#### 风险 1：CGEventTap 代码签名静默禁用（中风险）

**问题**：macOS 在重新签名后，通过 Finder/Dock 启动的应用，CGEventTap 可能静默安装但不接收事件。

**应对方案**：

1. 运行时定时（每 10 秒）调用 `CGEvent.tapIsEnabled()` 验证 Tap 健康状态
2. 检测到 Tap 被禁用时，自动销毁并重建 CFMachPort + CFRunLoopSource
3. 处理 `tapDisabledByTimeout` 回调，及时重启
4. 开发阶段直接执行二进制，绕过 Launch Services

#### 风险 2：macOS Sequoia WiFi SSID 访问限制（中风险）

**问题**：macOS 15.0+ 对 CWWiFiClient SSID 访问施加了更严格的签名和权限要求。

**应对方案**：

1. macOS < 15.0：使用标准 `CWWiFiClient` + Location Services 权限
2. macOS >= 15.0：降级使用 `system_profiler SPAirPortDataType` 命令行解析
3. 若均失败：`wifi_ssid = NULL`，不影响其他字段采集
4. 配置项 `ambient.collect_wifi_ssid` 允许用户关闭

#### 风险 3：通知打断检测准确性（中风险）

**问题**：DistributedNotificationCenter 无法直接获取通知来源 App，纯时间窗口推断存在误判。

**应对方案**：

1. 一期采用保守策略：仅在高置信度场景标记 `caused_switch = 1`
2. 所有不确定的切换标记为 `voluntary`
3. 预留 `switch_type` 字段，二期 AI 可基于行为模式重新标注
4. 备选方案：Accessibility API 监测通知横幅 AXUIElement 出现/消失

#### 风险 4：SQLite 高频写入（低风险，已通过 Writer Actor 解决）

**问题**：多引擎若共用一个 `Mutex<Connection>` 写库，写入峰值可能产生锁等待与抖动。

**解决方案**：采用 Writer Actor 统一写入模式（详见 3.2 节），消除多写入者竞争：

1. 各引擎通过 mpsc channel 投递 WriteEvent，不持有 DB 写连接
2. Writer Actor 单线程独占写连接，串行批量提交
3. 读连接（只读模式）通过 `Arc<Connection>` 共享，WAL 模式下读不阻塞写
4. 写入指标实时可观测（事件数、耗时、事务大小）

### 10.3 性能基准要求


| 指标              | 目标值     | 测量方法                             |
| --------------- | ------- | -------------------------------- |
| Tracker 单次轮询耗时  | ≤ 50ms  | 计时 NSWorkspace + AXUIElement 调用  |
| 截图全流水线耗时        | ≤ 500ms | screencapture → WebP 编码 → 落盘     |
| pHash 计算耗时      | ≤ 5ms/张 | image_hasher 基准测试                |
| DB 单次 INSERT 耗时 | ≤ 1ms   | rusqlite prepare_cached 测试       |
| 前端首次加载          | ≤ 2s    | Vite build 体积 + Tauri WebView 启动 |
| 内存占用（稳态）        | ≤ 150MB | Activity Monitor 监测              |
| CPU 占用（稳态）      | ≤ 3%    | 8 小时连续采集监测                       |


---

## 十一、代码架构（目录结构规划）

### 11.1 后端 Rust 目录

```
src-tauri/src/
├── main.rs                          # 进程入口
├── lib.rs                           # 应用初始化 · AppState · 权限 · Tray · URI 协议
├── api/
│   ├── mod.rs
│   └── commands.rs                  # Tauri Command 定义
├── core/
│   ├── mod.rs
│   ├── models.rs                    # 🆕 全局数据结构 (RawEvent, WindowSession, WriteEvent...)
│   ├── writer.rs                    # 🆕 Writer Actor (统一写入线程) [P0]
│   ├── privacy.rs                   # 🆕 隐私过滤 (黑名单、URL裁剪、路径脱敏) [P0]
│   ├── collection/
│   │   ├── mod.rs
│   │   ├── tracker.rs               # Tracker Engine（宽表采集 + WriteEvent 投递）[P0]
│   │   ├── capture.rs               # Capture Engine（缩放 + pHash 去重）[P0]
│   │   ├── input_dynamics.rs        # 🆕 Input Dynamics Engine [P1]
│   │   └── clipboard_flow.rs        # 🆕 Clipboard Flow Engine [P1]
│   ├── aggregation/
│   │   ├── mod.rs
│   │   └── pipeline.rs              # 🆕 Session 折叠 + 补偿批处理 [P0]
│   ├── acquisition/
│   │   ├── mod.rs
│   │   └── macos.rs                 # macOS Native API [P0]
│   └── storage/
│       ├── mod.rs                   # 数据结构 · 路径工具
│       ├── db.rs                    # 数据库操作 (读连接 + Schema)
│       └── migrations.rs            # 🆕 Schema 迁移管理 [P0]
├── services/
│   ├── mod.rs
│   └── analysis.rs                  # 统计聚合服务
└── utils/
    ├── mod.rs
    ├── hash.rs                      # 🆕 CRC32 state_hash + pHash [P0]
    └── regex.rs                     # 🆕 URL/文件路径提取规则 [P0]
```

### 11.2 前端目录

```
src/
├── main.tsx                         # React 入口
├── App.tsx                          # 根组件 · 权限检测 · 事件监听
├── pages/
│   └── VerificationPanel.tsx        # 🆕 基础验证面板 [P0]
├── components/
│   ├── StatusBar.tsx                # 🆕 顶部状态栏 (含引擎状态、Writer 监控) [P0]
│   ├── SessionList.tsx              # 🆕 实时事件流 (Virtuoso) [P0]
│   ├── SnapshotPreview.tsx          # 🆕 截图预览 [P0]
│   ├── StorageMonitor.tsx           # 🆕 存储与 Writer 统计 [P0]
│   ├── ToolBar.tsx                  # 🆕 底部工具栏 [P0]
│   ├── InputMetricsPanel.tsx        # 🆕 输入行为仪表 [P1]
│   ├── ClipboardFlowList.tsx        # 🆕 剪贴板流向 [P1]
│   └── SettingsPanel.tsx            # 🆕 配置面板 (Drawer) [P1]
├── stores/
│   ├── appStore.ts                  # Zustand 核心状态 [P0]
│   └── p1Store.ts                   # Zustand P1 扩展状态 [P1]
├── services/
│   └── tauri.ts                     # IPC 服务封装
├── types/
│   └── index.ts                     # TypeScript 类型定义
└── hooks/
    └── useEventListeners.ts         # 🆕 Tauri Event 监听 Hook [P0]
```

---

## 十二、安全架构

### 12.1 数据安全层级

```
┌─────────────────────────────────────────────────────────────┐
│ L1: 网络隔离 (最外层)                                         │
│   零网络请求 · 无 reqwest · 无 HTTP 端点                      │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ L2: 文件系统隔离                                      │   │
│   │   ~/.timelens/ 用户目录权限保护                        │   │
│   │   macOS 文件系统权限 (chmod 700)                      │   │
│   │   ┌─────────────────────────────────────────────┐   │   │
│   │   │ L3: 数据脱敏 (最内层)                         │   │   │
│   │   │   不记录按键字符                              │   │   │
│   │   │   不记录剪贴板文本内容                         │   │   │
│   │   │   不记录密码框内容                            │   │   │
│   │   │   不记录通知正文                              │   │   │
│   │   │   敏感应用截图黑名单                           │   │   │
│   │   │   URL 参数裁剪 · 文件路径脱敏                  │   │   │
│   │   │   截图 retention 短于结构化数据                 │   │   │
│   │   └─────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 12.2 敏感字段控制策略（评审整改新增）

虽然文档已明确禁止记录键盘内容与剪贴板正文，但以下字段仍具备高敏感性，需要细化控制：

#### 12.2.1 window_title 脱敏


| 场景        | 策略                        | 示例                                                             |
| --------- | ------------------------- | -------------------------------------------------------------- |
| 密码管理器     | **完全遮蔽**，替换为 `[REDACTED]` | 1Password、Keychain Access、Bitwarden                            |
| 银行/金融 App | **完全遮蔽**                  | 支付宝、微信支付、各银行 App                                               |
| 即时通讯私密对话  | **仅保留 App 名**             | 微信、Telegram、Signal → title = `[Private Chat]`                  |
| 无痕/隐私浏览模式 | **完全遮蔽**                  | Chrome Incognito、Safari Private → title = `[Private Browsing]` |
| 其他应用      | **正常记录**                  | 保留原始 window_title                                              |


**实现方式**：

- 维护 `privacy_blacklist_bundles` 配置列表（内置默认 + 用户可扩展）
- Tracker Engine 轮询逻辑第 4 步执行隐私过滤（详见 4.1 核心轮询逻辑）
- 黑名单匹配使用 bundle_id 前缀匹配（如 `com.1password.`*）

```rust
const DEFAULT_PRIVACY_BLACKLIST: &[&str] = &[
    "com.1password.*",
    "com.agilebits.*",
    "com.apple.keychainaccess",
    "com.bitwarden.*",
    "com.lastpass.*",
    // 金融类
    "com.alipay.*",
    // 通讯类（可选，用户配置）
];
```

#### 12.2.2 extracted_url 参数裁剪


| 策略           | 说明                                         | 示例                                                                          |
| ------------ | ------------------------------------------ | --------------------------------------------------------------------------- |
| **移除查询参数**   | URL 仅保留 `scheme://host/path`，裁剪 `?` 之后所有内容 | `https://mail.google.com/inbox?id=abc123` → `https://mail.google.com/inbox` |
| **移除认证令牌**   | 额外检测 URL 中的 `token=`、`key=`、`auth=` 等模式    | 即使不裁剪 query，也要移除敏感参数                                                        |
| **保留域名分类价值** | host + path 足以推断用户访问的内容类别                  | `github.com/user/repo` 保留完整 path                                            |


#### 12.2.3 file_path 脱敏


| 策略             | 说明                                                          |
| -------------- | ----------------------------------------------------------- |
| **去除用户名路径**    | `/Users/xzf/Documents/...` → `~/Documents/...`              |
| **敏感目录遮蔽**     | `~/.ssh/`*、`~/.gnupg/*`、`~/.aws/*` 等路径 → `[SENSITIVE_PATH]` |
| **仅保留文件名+扩展名** | 可配置为只记录 `filename.ext` 而非完整路径                               |


#### 12.2.4 截图（Snapshot）隐私控制


| 控制策略                     | 说明                                                |
| ------------------------ | ------------------------------------------------- |
| **敏感应用截图黑名单**            | 当前台 app 在 `privacy_blacklist_bundles` 中时，**跳过截图** |
| **截图 retention 短于结构化数据** | 截图默认保留 **3 天**（可配置），结构化数据保留 7+ 天                  |
| **低分辨率模式**               | 可配置截图分辨率降至 720x450 或更低，降低信息密度                     |
| **缩略图模式**（P1）            | 可选仅保存 256x160 缩略图，用于时间线预览但无法阅读屏幕文字                |
| **仅保留 pHash**            | 极端隐私模式：不保存截图文件，仅保留 64-bit 哈希用于去重和变化检测             |


#### 12.2.5 隐私配置项汇总


| 配置键                               | 类型             | 默认值             | 说明                                         |
| --------------------------------- | -------------- | --------------- | ------------------------------------------ |
| `privacy.blacklist_bundles`       | TEXT (JSON 数组) | 内置默认列表          | 敏感应用 bundle_id 列表                          |
| `privacy.url_strip_query`         | BOOLEAN        | `true`          | 是否裁剪 URL 查询参数                              |
| `privacy.file_path_mode`          | TEXT           | `home_relative` | `full` / `home_relative` / `filename_only` |
| `privacy.snapshot_retention_days` | INTEGER        | `3`             | 截图文件保留天数                                   |
| `privacy.snapshot_resolution`     | TEXT           | `1080x675`      | 截图分辨率                                      |
| `privacy.snapshot_mode`           | TEXT           | `normal`        | `normal` / `thumbnail` / `hash_only`       |


### 12.3 隐私审计检查清单


| 检查项             | 验证方式                                                  | 频率        |
| --------------- | ----------------------------------------------------- | --------- |
| 无网络请求           | `Cargo.toml` 中无 reqwest/hyper；`lsof -i` 运行时验证         | 每次构建      |
| 不记录按键内容         | 代码审查 CGEventTap 回调；搜索 `kCGKeyboardEventKeycode` 调用    | 每次 PR     |
| 剪贴板仅记录元数据       | 审查 clipboard_flow 相关代码无 `stringForType` 调用            | 每次 PR     |
| 通知不记录正文         | 审查 notifications 表无 content/body 字段                   | Schema 审查 |
| 数据目录权限正确        | 启动时 `chmod 700 ~/.timelens/`                          | 每次启动      |
| 敏感应用 title 遮蔽   | 运行时 DB 查询黑名单 app 的 raw_events，验证 title = `[REDACTED]` | 每次发版      |
| URL 参数已裁剪       | DB 查询 extracted_url 字段，验证无 `?` 后内容                    | 每次发版      |
| 截图黑名单生效         | 在密码管理器界面停留 30s，验证 shots/ 无对应截图                        | 每次发版      |
| 截图 retention 生效 | 验证 3 天前截图已自动清理                                        | 周检        |


---

## 十三、测试策略

### 13.1 测试分层


| 测试层      | 范围                            | 工具                         | 覆盖目标                                                        |
| -------- | ----------------------------- | -------------------------- | ----------------------------------------------------------- |
| **单元测试** | 纯逻辑函数（hash、regex、折叠算法、隐私过滤）   | Rust `#[test]`、Vitest      | state_hash 一致性、URL 提取/裁剪准确性、Session 折叠正确性、隐私黑名单匹配           |
| **集成测试** | Writer Actor + DB CRUD + 聚合管道 | Rust `#[test]` + 临时 SQLite | 写入通道端到端、P0 表读写、迁移脚本、Session 重放幂等性                           |
| **系统测试** | 端到端数据管道                       | 手动 + 自动化脚本                 | Tracker → WriteEvent → Writer → raw_events → Session → 前端展示 |
| **性能测试** | P0 引擎资源占用                     | Activity Monitor + 自定义计时   | CPU ≤ 3%、内存 ≤ 150MB、Writer 批量写入 ≤ 5ms                       |
| **隐私测试** | 数据脱敏验证                        | 代码审查 + 运行时 DB 内容审查         | 黑名单 title 遮蔽、URL 参数裁剪、截图黑名单跳过                               |
| **边界测试** | 极端场景                          | 手动测试                       | 长时间休眠唤醒、权限撤销、P1 模块缺失时主链路正常                                  |


### 13.2 关键测试用例

#### P0 测试（一期交付必过）


| 用例 ID | 场景                          | 预期结果                                                           |
| ----- | --------------------------- | -------------------------------------------------------------- |
| T-01  | 连续 8 小时采集（仅 P0 引擎）          | CPU < 3%，内存无泄漏，DB 大小符合预估                                       |
| T-02  | Mac 合盖休眠 30 分钟后唤醒           | AFK 正确记录，Session 正确闭合，唤醒后恢复采集                                  |
| T-03  | 快速切换 10 个应用（每秒 1 次）         | 防抖有效，不产生重复 Session，app_switches 记录完整                           |
| T-04  | 撤销 Accessibility 权限         | Tracker 优雅停止，emit 权限缺失事件，不 crash                               |
| T-05  | Writer 通道压力测试（模拟 1000 事件/秒） | Writer 正常处理，无事件丢失，批量事务正常提交                                     |
| T-06  | Writer 优雅关闭                 | 发送 Shutdown 后，drain 剩余事件、提交最后一批、连接关闭                           |
| T-07  | Session 重放幂等性               | 对同一批 raw_events 重放 3 次，生成的 Session 集合完全一致                      |
| T-08  | 敏感应用截图黑名单                   | 1Password 等在前台时，不产生截图文件                                        |
| T-09  | P1 模块全部禁用时主链路正常             | Input Dynamics/Clipboard Flow 关闭后，Tracker→Capture→Session 正常运行 |
| T-10  | DB 文件达到 500MB               | WAL checkpoint 正常，查询性能无明显下降                                    |


#### P1 测试（视进度执行）


| 用例 ID   | 场景                                 | 预期结果                                           |
| ------- | ---------------------------------- | ---------------------------------------------- |
| T-P1-01 | Input Dynamics 启用后 CGEventTap 健康检测 | Tap 被禁用时自动重建，10s 内恢复                           |
| T-P1-02 | 剪贴板复制密码                            | clipboard_flows 仅记录 content_type + length，不含文本 |
| T-P1-03 | Input Dynamics 崩溃                  | 主进程不受影响，状态标记为 error，UI 显示"不可用"                 |


---

## 十四、架构关键决策记录 (ADR)

### ADR-1：线程模型 — OS Thread vs Tokio


| 决策       | Tracker/Writer/Input(P1)/Clipboard(P1) 使用 `std::thread`，Capture/Aggregation 使用 `tokio` |
| -------- | -------------------------------------------------------------------------------------- |
| **背景**   | macOS Cocoa/CoreGraphics FFI 是同步调用，不能在 async 上下文安全调用                                   |
| **权衡**   | 多线程但通过 Writer Actor 消除 Mutex 竞争，保障 FFI 安全性和事件循环不阻塞                                     |
| **替代方案** | 全部使用 spawn_blocking → 无法控制 CFRunLoop 生命周期，CGEventTap 无法正常工作                            |


### ADR-2：数据库写入 — Writer Actor vs 多引擎共享 Mutex


| 决策       | 采用 Writer Actor 统一写入模式，各引擎通过 mpsc channel 投递 WriteEvent      |
| -------- | ------------------------------------------------------------ |
| **背景**   | 多引擎各自或通过共享 `Arc<Mutex<Connection>>` 写库时，锁竞争难观测、写入节奏分散、事务边界不清 |
| **备选方案** | 各引擎直接持有 `Arc<Mutex<Connection>>` 共享写入                        |
| **本期决策** | Writer Actor 单线程独占写连接 + 读写分离 + 批量事务                          |
| **收益**   | 单写入者、写入可观测（批次数/耗时/通道利用率）、错误隔离、事务边界清晰                         |
| **权衡**   | 引入 mpsc 通道增加微量延迟（~μs 级），换取 Mutex 等待时间的不确定性消除                 |


### ADR-3：截图去重 — pHash vs 像素比对


| 决策     | 使用 `image_hasher` 感知哈希（64-bit pHash + 汉明距离）      |
| ------ | ------------------------------------------------ |
| **背景** | 同一窗口长时间不变时产生大量重复截图                               |
| **权衡** | pHash 计算 ~1.5ms/张，汉明距离 O(1)；像素级比对需全量解码，耗时 100 倍+ |
| **阈值** | 默认汉明距离 < 5 判定为重复（64 bit 中仅 5 bit 不同）             |


### ADR-4：双层数据模型 — 宽表 + Session vs 单表直写


| 决策       | raw_events（只追加宽表）→ 聚合管道 → window_sessions（结构化会话）  |
| -------- | ------------------------------------------------- |
| **背景**   | 单表直写会话化数据会丢失高频原始信号，不利于二期多维分析与重放校验                 |
| **权衡**   | 双层增加聚合逻辑复杂度，但原始数据零损耗保留，Session 层查询轻量              |
| **关键收益** | 二期可消费 raw_events 做任意维度重分析；聚合问题可通过重放 raw_events 修复 |


### ADR-5：Session 聚合规则 — title_change 不切分（v2.1 新增）


| 决策      | `title_change`（同 app 内标题变化）不切分 Session，仅 `window_change`（app 切换）和 AFK 切分 |
| ------- | ------------------------------------------------------------------------ |
| **背景**  | 若 title_change 也切分，浏览器切换标签页、编辑器切换文件将产生大量碎片 Session（日均 2000+）             |
| **权衡**  | 粒度略粗，但保持 Session 作为"专注段"的语义价值；二期 AI 可从 raw_events 做子段分析                  |
| **幂等性** | 重放时仅依据 trigger_type 和 state_hash，不依赖外部状态，确保多次重放结果一致                      |


### ADR-6：一期 MVP 范围收缩（v2.1 新增）


| 决策        | 一期按 P0/P1/延后三级交付，P0 聚焦核心数据闭环                               |
| --------- | ---------------------------------------------------------- |
| **背景**    | 若一期同时落地过多引擎与页面，系统联动复杂度高，核心价值（数据闭环）验证易被拖慢                   |
| **P0 范围** | Tracker + Capture + Aggregation + Writer + 基础验证面板（7 张表）    |
| **P1 范围** | Input Dynamics + Clipboard Flow + 配置管理（视 P0 进度纳入）          |
| **延后**    | Notification Tracker + Ambient Context + Intent UI（1.5/二期） |
| **隔离原则**  | 核心链路不依赖任何 P1/延后模块；高风险模块默认可禁用；异常不影响主进程                      |


### ADR-7：嵌入式 SQLite 绑定 — rusqlite 版本锁定


| 决策     | 一期工程采用 **rusqlite 0.39.x** 作为 SQLite 绑定                           |
| ------ | ----------------------------------------------------------------- |
| **背景** | 该系列提供完整 WAL hook / checkpoint 等 API，与 Writer Actor 高频写入、运维可观测需求一致 |
| **风险** | 随 Rust 生态 major 升级时需按发行说明调整；绿场无历史代码包袱                             |
| **收益** | 写入路径可控、与社区当前主线一致、长期安全补丁可得                                         |


### ADR-8：隐私敏感字段分级控制（v2.1 新增）


| 决策       | 对 window_title、extracted_url、file_path、snapshot 实施分级隐私控制 |
| -------- | -------------------------------------------------------- |
| **背景**   | 评审指出虽禁止记录键盘/剪贴板内容，但上述字段仍具备高敏感性                           |
| **控制策略** | 敏感应用截图黑名单 + title 遮蔽 + URL 参数裁剪 + 路径脱敏 + 截图短 retention   |
| **配置化**  | 所有控制策略均通过配置项控制，用户可按需调整宽松/严格程度                            |
| **默认安全** | 默认开启 URL 参数裁剪 + 路径 home_relative + 截图 3 天 retention      |


---

## 十五、二三期演进兼容性设计

### 15.1 一期 → 1.5 期演进路径

一期延后模块在 1.5 期纳入时的演进路径：


| 模块                   | 1.5 期目标                               | 架构预留                                                   |
| -------------------- | ------------------------------------- | ------------------------------------------------------ |
| Notification Tracker | 验证方案 C（时间窗口推断）可行性                     | notifications 表 Schema 已预留；WriteEvent 已预留枚举变体          |
| Ambient Context      | 实现低风险字段（display_count、battery、camera） | ambient_context 表 Schema 已预留；跳过 WiFi SSID/active_space |
| Intent Mapping UI    | 提供规则管理界面                              | intent_mapping 表和 IPC 已在 P1 定义                         |


### 15.2 为二期 AI 预留的数据接口


| 二期能力         | 依赖的一期数据                                  | 架构预留点                                  |
| ------------ | ---------------------------------------- | -------------------------------------- |
| 心流/疲劳检测      | input_metrics (KPM, delete_ratio, burst) | session_id 外键关联                        |
| 信息流动洞察       | clipboard_flows (flow_pair_id 配对)        | 有向图聚合查询接口                              |
| 注意力管理建议      | app_switches + notifications             | switch_type 字段可重标注                     |
| 场景化日报        | ambient_context (WiFi, 显示器, 电池)          | 环境信号组合推断                               |
| 多模态工作意图      | raw_events + snapshots                   | 截图 + 时序上下文                             |
| Session 子段分析 | raw_events 中的 title_change 记录            | 二期 AI 可基于 raw_events 做同 app 内的细粒度使用段分析 |


### 15.3 Schema 扩展预留

- `intent_mapping` 表支持自定义规则，二期可由 AI 自动生成新规则写入
- `window_sessions` 的 `intent` 字段一期由规则匹配，二期可被 AI 覆写
- 所有表使用 TEXT 类型的 UUID 主键，跨表关联无整型限制
- `schema_migrations` 机制确保二期新增表/字段无缝迁移
- Writer Actor 的 WriteEvent 枚举可扩展新变体，支持新模块接入零改造

---

*本文档版本: v2.2 · 日期: 2026-03-27 · 基于 PRD_一期_数据底座 v4.0 设计 · 经技术评审整改 · 绿场架构基准（非重构迁移说明）*