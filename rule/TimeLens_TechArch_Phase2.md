# TimeLens 二期技术架构文档（分析引擎与日终复盘）

> **版本**：v1.0  
> **日期**：2026-03-31  
> **定位**：基于一期技术架构 `TimeLens_TechArch_V2.md` v2.2 的**增量演进**——在一期七层架构之上新增分析引擎层、报告生成层、AI 增强层和面向用户的产品 UI，同时补齐一期延后的采集引擎。  
> **上游基准**：`PRD_二期_智能洞察.md` v3.1、`二期_分析指标字典.md` v1.0、`二期_里程碑与验收计划.md` v1.0、`二期_产品研发任务计划表.md` v1.0  
> **约束**：不推翻一期架构的任何设计决策（Writer Actor、双层数据模型、线程归属、读写分离等），仅在其上做完善与扩展。

---

## 一、架构演进总览

### 1.1 一期 → 二期架构变更摘要

| 维度 | 一期 | 二期变更 | 变更性质 |
| --- | --- | --- | --- |
| **分层** | L1–L7（7 层） | 新增 L4.6 分析引擎层 + L2 从验证面板升级为产品 UI | 层扩展 |
| **引擎** | P0: 3 个 + P1: 2 个 + 延后: 2 个 | 补齐延后引擎 + 新增 4 个二期模块 | 模块新增 |
| **数据表** | 12 张 | +2 张（`daily_analysis` + `daily_reports`）= 14 张 | Schema 迁移 |
| **线程** | 4 个固定 + 2 个 P1 可选 | +3 个二期线程 | 线程模型扩展 |
| **网络** | 零网络（reqwest 禁止） | AI opt-in 时允许 HTTPS 出站（仅 AI 模块） | 隔离放行 |
| **IPC** | ~14 个 P0 Command + 9 个 Event | +7 个 Command + 3 个 Event | 接口扩展 |
| **前端** | 验证面板（开发者用） | 4 个产品页面（用户用） | 全面升级 |

### 1.2 二期分层架构全景

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    L1 · 用户交互层 (User Interaction)                     │
│         系统托盘 TrayIcon · 窗口生命周期 · 权限引导                         │
│         ▲ [二期] 新增: 定时聚合触发 · 导出文件管理                          │
├─────────────────────────────────────────────────────────────────────────┤
│                    L2 · 产品 UI 层 (Product UI)  [二期重构]               │
│         React 18 + Vite + TailwindCSS + Zustand                        │
│     ┌──────────┬──────────────┬──────────┬──────────────┐              │
│     │ 复盘页   │ 会话列表页    │ 设置页   │ 健康度面板    │              │
│     │(Markdown │(Virtuoso +   │(AI/引擎  │(引擎状态 +   │              │
│     │ 渲染+导出)│ 截图联动)    │ 配置)    │ 数据量)      │              │
│     └──────────┴──────────────┴──────────┴──────────────┘              │
├─────────────────────────────────────────────────────────────────────────┤
│                    L3 · 通信桥接层 (Tauri IPC Bridge)                     │
│         Command (Pull) · Event (Push) · URI (Asset)                     │
│         ▲ [二期] 新增 7 个 Command + 3 个 Event                          │
├─────────────────────────────────────────────────────────────────────────┤
│          L4 · 核心引擎层 (Engine Layer)                                   │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ 一期引擎（保持不变）                                                │   │
│  │ ┌──────────┬──────────┬────────────────┐                        │   │
│  │ │ Tracker  │ Capture  │  Aggregation   │                        │   │
│  │ │ Engine   │ Engine   │  Pipeline      │                        │   │
│  │ └──────────┴──────────┴────────────────┘                        │   │
│  │ ┌──────────┬──────────┐                                         │   │
│  │ │  Input   │Clipboard │ (一期 P1，二期 M0 补齐)                   │   │
│  │ │ Dynamics │  Flow    │                                         │   │
│  │ └──────────┴──────────┘                                         │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │ [二期 M0] 补齐引擎                                                │   │
│  │ ┌──────────┬──────────┬──────────────┐                          │   │
│  │ │  Notif   │ Ambient  │  Pipeline    │                          │   │
│  │ │ Tracker  │ Context  │  Health Mon  │                          │   │
│  │ └──────────┴──────────┴──────────────┘                          │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │ [二期核心] 分析与报告引擎                                           │   │
│  │ ┌──────────────────┬────────────────┬──────────────┐            │   │
│  │ │  Daily Analysis  │  Report        │  Analysis    │            │   │
│  │ │  Engine          │  Generator     │  Scheduler   │            │   │
│  │ │  (指标 A–F)      │  (Markdown)    │  (定时+手动) │            │   │
│  │ └──────────────────┴────────────────┴──────────────┘            │   │
│  │ ┌──────────────────┐                                            │   │
│  │ │  AI Client       │ (opt-in, BYOK, 唯一允许网络的模块)          │   │
│  │ └──────────────────┘                                            │   │
│  └──────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────┤
│                    L4.5 · 统一写入层 (Writer Actor) [不变]               │
│         ▲ [二期] WriteEvent 枚举扩展: +Notification +AmbientContext      │
│                +DailyAnalysis +DailyReport                              │
├─────────────────────────────────────────────────────────────────────────┤
│                    L5 · 数据访问层 (Data Access Layer) [不变]             │
│         Database Engine (SQLite/rusqlite) · FileSystem Engine            │
│         ▲ [二期] 新增 2 张表的迁移脚本 + 读查询方法                       │
├─────────────────────────────────────────────────────────────────────────┤
│                    L6 · 操作系统集成层 (OS Integration)                   │
│   一期: NSWorkspace · AXUIElement · CoreGraphics · CoreAudio            │
│   一期 P1: CGEventTap · NSPasteboard                                    │
│   ▲ [二期] 补齐: DistributedNotification · AXNotification              │
│              CoreWLAN · IOPowerSources · Focus API                      │
├─────────────────────────────────────────────────────────────────────────┤
│                    L7 · 持久化存储层 (Persistence) [扩展]                │
│         ~/.timelens/data/db.sqlite (14 张表)                            │
│         + shots/ (WebP截图) + exports/ (报告导出) [二期新增]            │
│                       🔒 非 AI 路径: 零网络 · 100% 本地                  │
│                       🌐 AI 路径 (opt-in): HTTPS → 用户配置的 LLM API   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.3 二期新增设计原则

在一期 8 条原则基础上，新增以下二期原则：

| 原则 | 说明 | 落地方式 |
| --- | --- | --- |
| **事实优先** | 非 AI 报告是产品基线，AI 仅做叙事增强 | 分析引擎和报告生成器完全独立于 AI 模块 |
| **数字可溯源** | 报告中任一数字可追溯到 `daily_analysis` 字段 + 对应 SQL | 报告模板直接引用 `DailyAnalysis` 结构体字段 |
| **AI 隔离** | AI 是唯一允许网络请求的模块，默认关闭 | AI Client 在独立模块中实现，通过 feature gate 控制编译 |
| **降级设计** | 任一非核心数据源缺失，分析和报告仍可生成 | 每个指标组独立计算，降级信息写入 `degraded_sections` |
| **按需计算** | 分析结果持久化后按需读取，不重复计算 | `daily_analysis` 表缓存聚合结果 |

---

## 二、新增技术栈与依赖

### 2.1 二期新增依赖

| 依赖 | 用途 | 版本 | 层级 | 风险 |
| --- | --- | --- | --- | --- |
| `reqwest` | AI LLM API 调用（仅 AI 模块） | 0.12.x | L4 AI Client | 🟡 引入网络依赖，需严格隔离 |
| `serde_json` | `daily_analysis` JSON 字段序列化/反序列化 | 1.x | L4/L5 | 🟢 已在一期间接依赖 |
| `chrono` | 日期处理（时区转换、日期格式化） | 0.4.x | L4 | 🟢 成熟 |
| `tokio` (扩展) | AI 异步 HTTP + 定时调度器 | 一期已有 | L4 | 🟢 无新增 |
| `react-markdown` | 前端 Markdown 报告渲染 | 9.x | L2 | 🟢 成熟 |
| `react-router-dom` | 多页面路由（复盘页/会话列表/设置/健康度） | 6.x | L2 | 🟢 成熟 |
| `date-fns` | 前端日期选择与格式化 | 3.x | L2 | 🟢 轻量 |

### 2.2 reqwest 引入的隔离策略

`reqwest` 是二期唯一打破一期"零网络"原则的依赖，必须严格隔离：

| 隔离措施 | 说明 |
| --- | --- |
| **Cargo feature gate** | `[features] ai = ["reqwest"]`——仅在 `ai` feature 开启时编译 AI 模块 |
| **模块隔离** | `reqwest` 的 `use` 语句仅出现在 `src-tauri/src/core/ai/` 目录内 |
| **运行时隔离** | AI Client 仅在用户显式开启 AI 开关且配置了 API Key 后才实例化 |
| **出境审计** | AI Client 发送的 payload 经 `ai/sanitizer.rs` 过滤，确保符合 PRD §4.1 隐私红线 |
| **编译验证** | CI 中增加 `cargo build --no-default-features` 验证：无 `ai` feature 时零网络依赖 |

---

## 三、线程与并发架构（扩展）

### 3.1 二期线程模型全景

在一期线程模型基础上新增 3 个线程/任务：

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Tauri 进程 (单进程多线程)                               │
│                                                                          │
│  ── 一期线程（保持不变）──────────────────────────────────────────────      │
│  🟢 Main Thread (Tauri Event Loop)                                       │
│  🔵 Tracker Engine (OS Thread, 2s 轮询)                                  │
│  🟠 Writer Actor (OS Thread, 串行写入)                                    │
│  🟣 Tokio Runtime: Capture + Aggregation                                 │
│  [P1→二期M0] Input Dynamics (OS Thread)                                  │
│  [P1→二期M0] Clipboard Flow (OS Thread)                                  │
│                                                                          │
│  ── 二期 M0 新增线程 ────────────────────────────────────────────────      │
│  🔴 Notification Tracker (OS Thread)           ← WriteEvent 投递         │
│  🟤 Ambient Context (Tokio 定时任务, 30s)       ← WriteEvent 投递         │
│                                                                          │
│  ── 二期核心新增线程/任务 ───────────────────────────────────────────       │
│  🟡 Analysis Engine (独立 OS Thread)                                      │
│     ← 通过 mpsc channel 接收 AnalysisCmd                                 │
│     → 读取 Arc<Connection> 计算指标                                       │
│     → WriteEvent::DailyAnalysis 投递到 Writer Actor                       │
│                                                                          │
│  🟢 Report Generator (Tokio spawn)                                       │
│     ← 读取 daily_analysis → 模板渲染 → Markdown                          │
│     → WriteEvent::DailyReport 投递到 Writer Actor                         │
│                                                                          │
│  🌐 AI Client (Tokio spawn, 仅 opt-in 时激活)                             │
│     ← 读取 daily_analysis → sanitize → reqwest HTTPS → 增强报告           │
│     → WriteEvent::DailyReport(ai_enhanced) 投递到 Writer Actor            │
│                                                                          │
│  ⏰ Analysis Scheduler (Tokio 定时任务)                                    │
│     ← 每日可配置时间点触发 AnalysisCmd                                     │
│                                                                          │
│  共享资源 (与一期一致):                                                     │
│    Arc<Connection> (只读查询连接)                                          │
│    mpsc::Sender<WriteEvent> (统一写入通道)                                 │
│    mpsc::Sender<CaptureSignal> (截图信号)                                 │
│    Arc<AtomicBool> (各引擎运行状态)                                        │
│  新增共享:                                                                │
│    mpsc::Sender<AnalysisCmd> (分析命令通道)                                │
│    Arc<RwLock<PipelineHealth>> (引擎健康状态, 读多写少)                     │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 各新增模块线程归属

| 模块 | 线程类型 | 选型理由 | 里程碑 |
| --- | --- | --- | --- |
| **Notification Tracker** | `std::thread` (OS) | 可能需要 Accessibility API + NSNotification RunLoop | M0 |
| **Ambient Context** | `tokio::spawn` (定时) | 无 FFI 阻塞调用，纯系统信息读取可 async | M0 |
| **Pipeline Health Monitor** | `tokio::spawn` (定时) | 轮询各引擎状态，无阻塞 | M0 |
| **Analysis Engine** | `std::thread` (OS) | CPU 密集计算（SQL 聚合 + 评分算法），需独占线程避免阻塞 Tokio runtime | M1/M2 |
| **Report Generator** | `tokio::spawn` | I/O 密集（读 DB + 写文件），适合 async | M3 |
| **AI Client** | `tokio::spawn` | 网络 I/O（HTTP 请求），天然适合 async | M5 |
| **Analysis Scheduler** | `tokio::spawn` (定时) | `tokio::time::interval` 定时触发 | M3 |

### 3.3 WriteEvent 枚举扩展

```rust
enum WriteEvent {
    // ── 一期（不变）──
    RawEvent(RawEventRow),
    AppSwitch(AppSwitchRow),
    Snapshot(SnapshotRow),
    SessionUpdate(SessionUpdateOp),
    InputMetric(InputMetricRow),       // P1 → 二期 M0 补齐
    ClipboardFlow(ClipboardFlowRow),   // P1 → 二期 M0 补齐

    // ── 二期 M0 新增 ──
    Notification(NotificationRow),
    AmbientContext(AmbientContextRow),

    // ── 二期核心新增 ──
    DailyAnalysis(DailyAnalysisRow),   // 分析结果写入
    DailyReport(DailyReportRow),       // 报告内容写入

    // ── 控制 ──
    Shutdown,
}
```

### 3.4 AnalysisCmd 通道

分析引擎通过独立的命令通道接收指令，与 WriteEvent 通道分离：

```rust
enum AnalysisCmd {
    GenerateDaily { date: String },     // 触发指定日期聚合
    Cancel,                             // 取消当前计算
    Shutdown,                           // 关闭分析线程
}
```

**通道规格**：`mpsc::channel(16)`——分析请求频率极低（每天 1-2 次），小容量足够。

### 3.5 线程间通信全景（二期扩展后）

```
── 一期通信（保持不变）──
Tracker ── WriteEvent ──→ Writer Actor
Tracker ── CaptureSignal ──→ Capture Engine
Tracker ── AggregationCmd ──→ Aggregation Pipeline
Capture ── WriteEvent::Snapshot ──→ Writer Actor
Aggregation ── WriteEvent::SessionUpdate ──→ Writer Actor

── 二期 M0 新增 ──
Notification Tracker ── WriteEvent::Notification ──→ Writer Actor
Ambient Context ── WriteEvent::AmbientContext ──→ Writer Actor
Pipeline Health Monitor ── 读取各引擎 AtomicBool ──→ Arc<RwLock<PipelineHealth>>

── 二期核心新增 ──
IPC / Scheduler ── AnalysisCmd ──→ Analysis Engine
Analysis Engine ── SELECT (只读) ←── Arc<Connection>
Analysis Engine ── WriteEvent::DailyAnalysis ──→ Writer Actor
Analysis Engine ── emit("analysis_completed") ──→ Frontend

Report Generator ── SELECT daily_analysis ←── Arc<Connection>
Report Generator ── WriteEvent::DailyReport ──→ Writer Actor
Report Generator ── emit("report_generated") ──→ Frontend

AI Client ── SELECT daily_analysis ←── Arc<Connection>
AI Client ── HTTPS ──→ 用户配置的 LLM API
AI Client ── WriteEvent::DailyReport(ai_enhanced) ──→ Writer Actor
```

---

## 四、核心模块架构详解

### 4.1 Pipeline Health Monitor（引擎健康监控）

**职责**：统一监控所有采集引擎的运行状态，提供 `get_pipeline_health` 查询接口。

```
┌──────────────────────────────────────────────────────────┐
│  Pipeline Health Monitor (Tokio 定时任务, 15s 轮询)        │
│                                                          │
│  FOR each engine IN [Tracker, Capture, Aggregation,      │
│                      InputDynamics, ClipboardFlow,        │
│                      NotifTracker, AmbientContext]:       │
│    1. 读取 engine.is_running: Arc<AtomicBool>            │
│    2. 查询该引擎对应表的 MAX(timestamp_ms)                │
│    3. 计算 staleness = now - max_timestamp                │
│    4. 判定状态:                                           │
│       ├── is_running && staleness < 2min → Running (🟢)  │
│       ├── is_running && staleness >= 2min → Degraded (🟡)│
│       └── !is_running → Stopped (🔴)                     │
│    5. 写入 Arc<RwLock<PipelineHealth>>                    │
│                                                          │
│  PipelineHealth {                                        │
│    engines: HashMap<String, EngineStatus>,                │
│    last_check_ms: i64,                                   │
│  }                                                       │
│  EngineStatus {                                          │
│    status: Running | Degraded | Stopped,                 │
│    last_data_ms: Option<i64>,                            │
│    error_count: u32,                                     │
│  }                                                       │
└──────────────────────────────────────────────────────────┘
```

### 4.2 Notification Tracker（通知打断记录）[二期 M0 补齐]

一期架构 §4.5 预留了三个方案，二期采用**方案 C（时间窗口推断）+ 方案 B（Accessibility API 横幅检测）混合**：

```
┌──────────────────────────────────────────────────────────┐
│  Notification Tracker (独立 OS Thread)                     │
│                                                          │
│  1. 监听 NSWorkspace.didActivateApplicationNotification  │
│                                                          │
│  2. Accessibility 横幅检测:                                │
│     ├── AXObserver 监听 AXUIElement 变化                  │
│     ├── 匹配 NotificationCenter 横幅元素                   │
│     └── 提取 source_bundle_id (如可用)                     │
│                                                          │
│  3. 当 app_switch 发生时:                                 │
│     ├── 检查前 3s 内是否检测到通知横幅                      │
│     ├── 若有 → caused_switch = 1, source_app = 横幅来源    │
│     └── 若无 → switch_type = 'voluntary'                 │
│                                                          │
│  4. 投递 WriteEvent::Notification → Writer Actor          │
│                                                          │
│  降级策略:                                                │
│  ├── Accessibility 横幅检测失败 → 纯时间窗口推断            │
│  ├── 推断不确定 → caused_switch = 0                       │
│  └── 引擎全部失败 → 标记 Stopped, 分析降级                 │
└──────────────────────────────────────────────────────────┘
```

### 4.3 Ambient Context Engine（环境感知引擎）[二期 M0 补齐]

一期架构 §4.6 预留了表结构和 API 映射，二期实现采集逻辑：

```
┌──────────────────────────────────────────────────────────┐
│  Ambient Context Engine (Tokio 定时任务, 30s 间隔)         │
│                                                          │
│  每 30 秒:                                               │
│  1. display_count = NSScreen::screens().count()          │
│  2. is_external = 检测外接显示器 (分辨率差异)              │
│  3. (battery_level, is_charging) = IOPSCopyPowerSources  │
│  4. is_camera = 检测 VDCAssistant 进程是否存在            │
│  5. is_audio_input = AudioObjectGetPropertyData           │
│  6. is_dnd = Focus API (macOS 14+) 或 defaults read      │
│  7. screen_brightness = IODisplayConnect                  │
│  8. wifi_ssid = CWWiFiClient (需 Location) 或降级 NULL    │
│                                                          │
│  → 构造 AmbientContextRow                                │
│  → 投递 WriteEvent::AmbientContext → Writer Actor        │
│                                                          │
│  错误处理: 任一字段采集失败 → 该字段为 NULL, 不阻塞其余    │
└──────────────────────────────────────────────────────────┘
```

### 4.4 Daily Analysis Engine（日终分析引擎）[二期核心]

**职责**：消费一期数据表，按指标字典定义计算 6 组指标，将结果写入 `daily_analysis` 表。

**架构概述**：

```
┌──────────────────────────────────────────────────────────────────────┐
│  Daily Analysis Engine (独立 OS Thread)                                │
│                                                                      │
│  mpsc::Receiver<AnalysisCmd>                                         │
│    │                                                                 │
│    ▼                                                                 │
│  loop {                                                              │
│    cmd = receiver.recv()                                             │
│    match cmd {                                                       │
│      GenerateDaily { date } => {                                     │
│        emit("analysis_started", { date })                            │
│                                                                      │
│        // Phase 1: 数据源可用性检测                                     │
│        let sources = check_data_sources(&read_conn, &date);          │
│        let degraded = sources.degraded_list();                       │
│                                                                      │
│        // Phase 2: 分组计算 (每组独立, 失败不影响其他组)                  │
│        let group_a = compute_time_distribution(&read_conn, &date);   │
│        let group_b = compute_attention_switch(&read_conn, &date);    │
│        let group_c = compute_interruption(&read_conn, &date,         │
│                                           &sources);                 │
│        let group_d = compute_input_rhythm(&read_conn, &date);        │
│        let group_e = compute_clipboard_flow(&read_conn, &date);      │
│        let group_f = compute_ambient_context(&read_conn, &date);     │
│                                                                      │
│        // Phase 3: 组装 DailyAnalysisRow                              │
│        let row = DailyAnalysisRow::merge(                            │
│            date, group_a, group_b, group_c,                          │
│            group_d, group_e, group_f,                                │
│            sources, degraded                                         │
│        );                                                            │
│                                                                      │
│        // Phase 4: 写入                                               │
│        writer_tx.send(WriteEvent::DailyAnalysis(row));               │
│                                                                      │
│        emit("analysis_completed", { date, duration_ms })             │
│      }                                                               │
│      Cancel => { /* 中断当前计算 */ }                                  │
│      Shutdown => break                                               │
│    }                                                                 │
│  }                                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

**数据源可用性检测**：

```rust
struct DataSources {
    window_sessions: bool,  // 致命依赖
    app_switches: bool,
    input_metrics: bool,
    clipboard_flows: bool,
    notifications: bool,
    ambient_context: bool,
    snapshots: bool,
}

fn check_data_sources(conn: &Connection, date: &str) -> DataSources {
    // 对每个表执行: SELECT COUNT(*) FROM {table}
    //   WHERE date(timestamp_ms/1000,'unixepoch','localtime') = :date
    // count > 0 → true
}
```

**指标组 A 计算模块**（示例，其他组结构类似）：

```rust
struct GroupA {
    total_active_ms: i64,
    intent_breakdown: String,   // JSON
    top_apps: String,           // JSON
}

fn compute_time_distribution(conn: &Connection, date: &str) -> Option<GroupA> {
    // A1: SELECT SUM(duration_ms) FROM window_sessions WHERE ...
    let total = conn.query_row(A1_SQL, params![date], |r| r.get(0))?;
    if total == 0 { return None; }

    // A2: SELECT intent, SUM(duration_ms) FROM window_sessions ... GROUP BY intent
    let breakdown = conn.prepare(A2_SQL)?.query_map(params![date], ...)?;
    let breakdown_json = serde_json::to_string(&breakdown)?;

    // A3: SELECT app_name, SUM(duration_ms) ... ORDER BY total DESC LIMIT 5
    let top_apps = conn.prepare(A3_SQL)?.query_map(params![date], ...)?;
    let top_apps_json = serde_json::to_string(&top_apps)?;

    Some(GroupA { total_active_ms: total, intent_breakdown: breakdown_json, top_apps: top_apps_json })
}
```

**深度工作段算法**（指标 B3，核心复杂逻辑）：

```
输入:
  switches: Vec<AppSwitch>  // 当日所有切换, 按 timestamp_ms 升序
  sessions: Vec<WindowSession>  // 当日所有会话

算法:
  1. 在 switches 首尾插入虚拟锚点:
     - start_anchor = 当日第一个 session 的 start_ms
     - end_anchor = 当日最后一个 session 的 end_ms

  2. 计算所有相邻切换的间隔 gaps:
     FOR i IN 0..switches.len()-1:
       gap = switches[i+1].timestamp_ms - switches[i].timestamp_ms
       IF gap >= 30 * 60 * 1000:  // ≥30 分钟
         候选段 = (switches[i].timestamp_ms, switches[i+1].timestamp_ms)
         candidates.push(候选段)

  3. 校验每个候选段内的 intent 单一性:
     FOR each candidate IN candidates:
       segment_sessions = sessions.filter(
         s => s.start_ms >= candidate.start && s.end_ms <= candidate.end
       )
       intents = segment_sessions.map(s => s.intent).unique()
       IF intents.len() == 1:
         confirmed.push(DeepWorkSegment {
           start_ms: candidate.start,
           end_ms: candidate.end,
           duration_ms: candidate.end - candidate.start,
           intent: intents[0],
           app: segment_sessions[0].app_name
         })
       ELSE:
         // 按 intent 变化点拆分, 仅保留 ≥30min 的子段
         split_by_intent(candidate, segment_sessions, &mut confirmed)

输出:
  confirmed: Vec<DeepWorkSegment>
  total_ms: SUM(confirmed.map(s => s.duration_ms))
```

**碎片化指数算法**（指标 B4）：

```
输入:
  switches: Vec<AppSwitch>  // 当日
  active_start_ms, active_end_ms: 活跃时段边界

算法:
  1. 将活跃时段切分为连续的 5 分钟窗口
     total_windows = ceil((active_end - active_start) / 300_000)

  2. FOR each 5min window:
     window_switches = switches.filter(在窗口内)
     distinct_to_apps = window_switches.map(s => s.to_app).unique().count()
     IF distinct_to_apps >= 3:
       fragmented_count += 1

  3. fragmentation_pct = fragmented_count / total_windows * 100

边界条件:
  - total_windows < 6 (活跃 <30min) → 不计算, 返回 None
```

**心流/挣扎评分计算**（指标 D3/D4）：

```rust
fn compute_flow_score(row: &InputMetricRow, session_duration_ms: i64) -> f64 {
    let kpm_norm = normalize(row.kpm, 0.0, 120.0);
    let del_norm = 1.0 - normalize(row.delete_ratio, 0.0, 0.3);
    let burst_avg = row.window_interval_secs
        / (row.typing_burst_count.max(1) as f64);
    let burst_norm = normalize(burst_avg, 0.0, 60.0);
    let session_norm = normalize(session_duration_ms as f64 / 1000.0, 0.0, 3600.0);

    (kpm_norm * 0.30 + del_norm * 0.20 + burst_norm * 0.25 + session_norm * 0.25) * 100.0
}

fn compute_struggle_score(row: &InputMetricRow) -> f64 {
    let del_norm = normalize(row.delete_ratio, 0.0, 0.3);
    let undo_per_min = row.undo_count as f64 / (row.window_interval_secs / 60.0);
    let undo_norm = normalize(undo_per_min, 0.0, 5.0);
    let burst_avg = row.window_interval_secs
        / (row.typing_burst_count.max(1) as f64);
    let burst_norm = 1.0 - normalize(burst_avg, 0.0, 60.0);
    let pause_norm = normalize(row.longest_pause_ms as f64, 0.0, 30000.0);

    (del_norm * 0.30 + undo_norm * 0.20 + burst_norm * 0.25 + pause_norm * 0.25) * 100.0
}

fn normalize(value: f64, min: f64, max: f64) -> f64 {
    ((value - min) / (max - min)).clamp(0.0, 1.0)
}
```

### 4.5 Report Generator（报告生成器）[二期 M3]

**职责**：读取 `daily_analysis` 结构，按固定模板生成 Markdown 报告。

```
┌──────────────────────────────────────────────────────────────────────┐
│  Report Generator (Tokio spawn)                                       │
│                                                                      │
│  fn generate_report(date: &str, with_ai: bool) -> Result<()> {       │
│                                                                      │
│    // 1. 读取分析结果                                                  │
│    let analysis = read_daily_analysis(&read_conn, date)?;             │
│    if analysis.is_none() {                                           │
│      return Err("请先生成分析");                                       │
│    }                                                                 │
│                                                                      │
│    // 2. 非 AI 路径: 模板渲染                                          │
│    let md = render_fact_report(&analysis);                            │
│    let fact_report = DailyReportRow {                                 │
│      report_type: "fact_only",                                       │
│      content_md: md,                                                 │
│      ai_model: None,                                                 │
│      ...                                                             │
│    };                                                                │
│    writer_tx.send(WriteEvent::DailyReport(fact_report));              │
│                                                                      │
│    // 3. AI 路径 (opt-in)                                             │
│    if with_ai && ai_enabled() {                                      │
│      let sanitized = sanitize_for_ai(&analysis);                     │
│      let ai_narrative = ai_client.generate(sanitized).await?;        │
│      let enhanced_md = merge_ai_narrative(&md, &ai_narrative);       │
│      let ai_report = DailyReportRow {                                │
│        report_type: "ai_enhanced",                                   │
│        content_md: enhanced_md,                                      │
│        ai_model: Some(settings.ai_model.clone()),                    │
│        ai_prompt_hash: Some(hash(&sanitized)),                       │
│        ...                                                           │
│      };                                                              │
│      writer_tx.send(WriteEvent::DailyReport(ai_report));             │
│    }                                                                 │
│                                                                      │
│    emit("report_generated", { date, type })                          │
│  }                                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

**模板渲染架构**：

```rust
fn render_fact_report(a: &DailyAnalysis) -> String {
    let mut md = String::with_capacity(4096);
    md.push_str(&render_header(a));
    md.push_str(&render_section_overview(a));
    md.push_str(&render_section_time_distribution(a));
    md.push_str(&render_section_attention_switch(a));
    md.push_str(&render_section_interruption(a));
    md.push_str(&render_section_input_rhythm(a));

    if !a.is_degraded("clipboard_flows") {
        md.push_str(&render_section_clipboard_flow(a));
    }
    if !a.is_degraded("ambient_context") {
        md.push_str(&render_section_ambient_context(a));
    }

    md.push_str(&render_footer(a));
    md
}
```

每个 `render_section_*` 函数直接读取 `DailyAnalysis` 结构体字段，**不执行任何 SQL**。数字的唯一来源是 `daily_analysis` 行，确保报告与分析结果 100% 一致。

### 4.6 AI Client（AI 增强客户端）[二期 M5]

```
┌──────────────────────────────────────────────────────────────────────┐
│  AI Client (Tokio spawn, feature = "ai")                              │
│                                                                      │
│  struct AiClient {                                                   │
│    http: reqwest::Client,                                            │
│    api_base: String,      // 用户配置                                 │
│    api_key: String,       // 用户配置 (BYOK)                         │
│    model: String,         // 用户配置                                 │
│  }                                                                   │
│                                                                      │
│  impl AiClient {                                                     │
│    async fn generate(&self, data: SanitizedAnalysis) -> Result<String>│
│    {                                                                 │
│      let prompt = build_prompt(&data);                               │
│      let body = json!({                                              │
│        "model": &self.model,                                         │
│        "messages": [                                                 │
│          { "role": "system", "content": SYSTEM_PROMPT },             │
│          { "role": "user", "content": prompt }                       │
│        ],                                                            │
│        "temperature": 0.3,                                           │
│        "max_tokens": 2000                                            │
│      });                                                             │
│      let resp = self.http                                            │
│        .post(format!("{}/v1/chat/completions", &self.api_base))      │
│        .bearer_auth(&self.api_key)                                   │
│        .json(&body)                                                  │
│        .timeout(Duration::from_secs(30))                             │
│        .send().await?;                                               │
│      // 解析响应，提取 content                                        │
│    }                                                                 │
│  }                                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

**兼容性**：AI Client 使用 OpenAI 兼容的 `/v1/chat/completions` 接口，可对接：
- OpenAI (GPT-4 等)
- Anthropic (通过 OpenAI 兼容代理)
- 本地 Ollama / LMStudio
- 任何 OpenAI API 兼容的服务

**数据净化器**（sanitizer）：

```rust
struct SanitizedAnalysis {
    date: String,
    total_active_ms: i64,
    intent_breakdown: Value,     // JSON
    top_apps: Value,             // 仅保留 app_name, 去除 bundle_id
    total_switches: i32,
    deep_work_total_ms: i64,
    fragmentation_pct: f64,
    flow_score_avg: f64,
    struggle_score_avg: f64,
    degraded_sections: Vec<String>,
    // 不包含: raw_events, window_title, 剪贴板内容, 按键数据
}

fn sanitize_for_ai(a: &DailyAnalysis) -> SanitizedAnalysis {
    // 仅提取聚合数字, 严格按 PRD §4.1 隐私红线过滤
}
```

### 4.7 Analysis Scheduler（分析调度器）[二期 M3]

```rust
// 定时触发每日分析
async fn analysis_scheduler(
    analysis_tx: mpsc::Sender<AnalysisCmd>,
    read_conn: Arc<Connection>,
) {
    let mut interval = tokio::time::interval(Duration::from_secs(60));
    loop {
        interval.tick().await;
        let now = Local::now();
        let trigger_hour = get_setting(&read_conn, "analysis.trigger_hour")
            .unwrap_or(22); // 默认 22:00
        let trigger_minute = get_setting(&read_conn, "analysis.trigger_minute")
            .unwrap_or(0);

        if now.hour() == trigger_hour && now.minute() == trigger_minute {
            let today = now.format("%Y-%m-%d").to_string();
            let _ = analysis_tx.send(AnalysisCmd::GenerateDaily { date: today });
            // 触发后等待至少 60 秒避免重复
            tokio::time::sleep(Duration::from_secs(60)).await;
        }
    }
}
```

---

## 五、数据架构（扩展）

### 5.1 二期数据表关系图

```
 ═══ 一期表（保持不变）══════════════════════════════════════════════

                    ┌──────────────┐
                    │  raw_events  │─────────────────────────┐
                    └──────┬───────┘                         │
                           │ 折叠聚合                         │
                    ┌──────▼───────┐         ┌───────────────▼──┐
                    │   window_    │◄────────│  app_switches    │
                    │   sessions   │         └──────────────────┘
                    └──┬───────┬───┘
                       │       │
              ┌────────┘       └───────────────────┐
              │                                     │
   ┌──────────▼──┐ ┌──────────┐ ┌───────────────┐ │
   │  snapshots  │ │ app_meta │ │intent_mapping │ │
   └─────────────┘ └──────────┘ └───────────────┘ │
                                                    │
   ┌──────────────┐  ┌──────────────┐              │
   │input_metrics │  │clipboard_    │              │
   │              │  │flows         │              │
   └──────┬───────┘  └──────────────┘              │
          │                                         │
          │ session_id FK                           │
          └─────────────────────────────────────────┘

   ┌──────────────┐  ┌───────────────┐  ┌──────────┐  ┌──────────────┐
   │notifications │  │ambient_context│  │ settings │  │schema_       │
   └──────────────┘  └───────────────┘  └──────────┘  │migrations    │
                                                       └──────────────┘

 ═══ 二期新增表 ════════════════════════════════════════════════════

   ┌──────────────────────┐        ┌───────────────────────┐
   │  daily_analysis      │◄───────│  daily_reports        │
   │  (每天一条聚合)       │ 1:N    │  (fact_only +         │
   │  14 张表的消费者      │        │   ai_enhanced)        │
   └──────────────────────┘        └───────────────────────┘
```

### 5.2 Schema 迁移（二期增量）

二期迁移脚本作为一期 `MIGRATIONS` 数组的增量追加：

```rust
const MIGRATIONS: &[Migration] = &[
    // ... 一期迁移 (version 1-N)

    Migration {
        version: N + 1,
        desc: "二期: 新增 daily_analysis 表",
        sql: r#"
            CREATE TABLE IF NOT EXISTS daily_analysis (
                id TEXT PRIMARY KEY,
                analysis_date TEXT NOT NULL UNIQUE,
                generated_at_ms INTEGER NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                total_active_ms INTEGER,
                intent_breakdown TEXT,
                top_apps TEXT,
                total_switches INTEGER,
                switches_per_hour TEXT,
                top_switch_pairs TEXT,
                deep_work_segments TEXT,
                deep_work_total_ms INTEGER,
                fragmentation_pct REAL,
                notification_count INTEGER,
                top_interrupters TEXT,
                interrupts_in_deep INTEGER,
                avg_kpm REAL,
                kpm_by_hour TEXT,
                avg_delete_ratio REAL,
                flow_score_avg REAL,
                struggle_score_avg REAL,
                clipboard_pairs INTEGER,
                top_flows TEXT,
                scene_breakdown TEXT,
                data_sources TEXT,
                degraded_sections TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_daily_date
                ON daily_analysis(analysis_date);
        "#,
    },
    Migration {
        version: N + 2,
        desc: "二期: 新增 daily_reports 表",
        sql: r#"
            CREATE TABLE IF NOT EXISTS daily_reports (
                id TEXT PRIMARY KEY,
                analysis_id TEXT NOT NULL,
                report_date TEXT NOT NULL,
                generated_at_ms INTEGER NOT NULL,
                report_type TEXT NOT NULL,
                content_md TEXT NOT NULL,
                content_html TEXT,
                ai_model TEXT,
                ai_prompt_hash TEXT,
                FOREIGN KEY (analysis_id) REFERENCES daily_analysis(id)
            );
            CREATE INDEX IF NOT EXISTS idx_reports_date
                ON daily_reports(report_date);
            CREATE INDEX IF NOT EXISTS idx_reports_analysis
                ON daily_reports(analysis_id);
        "#,
    },
];
```

### 5.3 二期存储增量预估

| 数据 | 日增条数 | 单条大小 | 日增空间 |
| --- | --- | --- | --- |
| `notifications` | ~50-200 | ~100 B | ~20 KB |
| `ambient_context` | ~2,880 (30s 间隔) | ~120 B | ~345 KB |
| `daily_analysis` | 1 | ~2 KB | ~2 KB |
| `daily_reports` | 1-2 | ~5-15 KB | ~15 KB |
| **二期总增量** | — | — | **~380 KB/天** |

二期新增数据对存储影响极小（<0.5 MB/天），不改变一期的存储清理策略。

---

## 六、通信层扩展（Tauri IPC）

### 6.1 二期新增 Command

| 分组 | Command | 参数 | 返回值 | 里程碑 |
| --- | --- | --- | --- | --- |
| **分析** | `generate_daily_analysis` | `{ date: "YYYY-MM-DD" }` | `DailyAnalysis` | M1 |
| | `get_daily_analysis` | `{ date: "YYYY-MM-DD" }` | `DailyAnalysis \| null` | M1 |
| | `get_deep_work_segments` | `{ date }` | `Vec<DeepWorkSegment>` | M1 |
| **报告** | `generate_daily_report` | `{ date, with_ai: bool }` | `DailyReport` | M3 |
| | `get_daily_report` | `{ date, type? }` | `DailyReport \| null` | M3 |
| | `export_report` | `{ date, format: "md" \| "html" }` | `string`（路径） | M3 |
| **健康** | `get_pipeline_health` | 无 | `PipelineHealth` | M0 |
| **纠错** | `update_session_intent` | `{ session_id, intent }` | `()` | M5 |
| | `manage_blacklist` | `{ action, app_name }` | `()` | M5 |

### 6.2 二期新增 Event

| Event | Payload | 频率 | 里程碑 |
| --- | --- | --- | --- |
| `analysis_started` | `{ date }` | 手动/定时触发 | M1 |
| `analysis_completed` | `{ date, duration_ms }` | 分析完成时 | M1 |
| `report_generated` | `{ date, type }` | 报告生成完成时 | M3 |
| `pipeline_health_updated` | `PipelineHealth` | 每 15 秒 | M0 |

### 6.3 Command 执行流程

以 `generate_daily_analysis` 为例：

```
前端 invoke("generate_daily_analysis", { date: "2026-03-31" })
  │
  ▼
Tauri Command Handler (Main Thread)
  │
  ├── 1. 发送 AnalysisCmd::GenerateDaily { date } 到 Analysis Engine
  │      via mpsc::Sender<AnalysisCmd>
  │
  ├── 2. 等待 Analysis Engine 完成
  │      via oneshot::channel (包含在 AnalysisCmd 中)
  │
  └── 3. 从 DB 读取结果并返回
       SELECT * FROM daily_analysis WHERE analysis_date = :date
```

改进的 AnalysisCmd 定义（含响应通道）：

```rust
enum AnalysisCmd {
    GenerateDaily {
        date: String,
        response_tx: oneshot::Sender<Result<(), String>>,
    },
    Cancel,
    Shutdown,
}
```

---

## 七、前端架构（二期产品 UI）

### 7.1 页面结构

```
┌─────────────────────────────────────────────────────────────────────┐
│ 顶部导航                                                             │
│ [📋 复盘] [📂 会话] [❤️ 健康] [⚙️ 设置]                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  路由内容区                                                          │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                                                               │  │
│  │   /recap     → RecapPage     (默认首页)                       │  │
│  │   /sessions  → SessionBrowser                                │  │
│  │   /health    → HealthPanel                                   │  │
│  │   /settings  → SettingsPage                                  │  │
│  │                                                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ 底部状态栏                                                           │
│ ● 运行中 │ Session: 142 │ DB: 12.3MB │ 100% 本地存储                 │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 RecapPage（复盘页）

```
┌─────────────────────────────────────────────────────────────────┐
│ 日期选择: [◀ 2026-03-30 ▶]  [今天]                               │
│                                                                 │
│ 操作栏:                                                          │
│ [🔄 生成/刷新分析] [📥 导出 Markdown] [📥 导出 HTML (P1)]          │
│ [事实版本 ○ / AI 增强版 ○]  (仅当 AI 开启时显示切换)               │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │                                                             │ │
│ │  Markdown 报告渲染区 (react-markdown)                       │ │
│ │                                                             │ │
│ │  # 📋 TimeLens 日终复盘 · 2026-03-31（周二）                 │ │
│ │  ## 1. 今日总览                                             │ │
│ │  - 总活跃时长: 7 小时 42 分钟                                │ │
│ │  - 深度工作: 2 小时 15 分钟 (29.2%)                         │ │
│ │  ...                                                       │ │
│ │  > [AI 总结] 今天的工作以编码开发为主...  (引用样式)          │ │
│ │                                                             │ │
│ │  (加载中: 显示骨架屏)                                       │ │
│ │  (无数据: 显示空状态 + 引导生成)                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 Zustand Store 扩展

```typescript
// 二期 Store (与一期 appStore 合并)
interface Phase2State {
  // 分析状态
  currentDate: string;                       // 当前查看日期
  dailyAnalysis: DailyAnalysis | null;
  dailyReport: DailyReport | null;
  reportType: 'fact_only' | 'ai_enhanced';
  isAnalyzing: boolean;
  isGeneratingReport: boolean;

  // 健康度
  pipelineHealth: PipelineHealth | null;

  // 设置
  aiEnabled: boolean;
  aiConfig: { apiBase: string; model: string; apiKey: string } | null;
  blacklistApps: string[];

  // Actions
  setDate: (date: string) => void;
  generateAnalysis: (date: string) => Promise<void>;
  generateReport: (date: string, withAi: boolean) => Promise<void>;
  exportReport: (date: string, format: 'md' | 'html') => Promise<string>;
  loadReport: (date: string) => Promise<void>;
  updateSessionIntent: (sessionId: string, intent: string) => Promise<void>;
}
```

### 7.4 Markdown 渲染策略

| 需求 | 方案 |
| --- | --- |
| Markdown → HTML | `react-markdown` + `remark-gfm`（表格支持） |
| AI 内容区分 | AI 解读以 `> ` 引用格式呈现，CSS 加 `border-left: 3px solid #6366f1` |
| 降级标注 | `> ⚠️` 前缀，CSS 加 `background: #fef2f2` |
| 报告导出 | 直接写入 `content_md` 字符串到文件，无需重新渲染 |
| 代码块 | 使用 `rehype-highlight` 做语法高亮（报告中可能含 SQL 示例） |

---

## 八、代码架构（目录结构扩展）

### 8.1 后端 Rust 目录扩展

```
src-tauri/src/
├── main.rs
├── lib.rs                           # ▲ 新增 Analysis Engine 初始化 + Scheduler 启动
├── api/
│   ├── mod.rs
│   ├── commands.rs                  # ▲ 新增二期 Command 定义
│   └── commands_phase2.rs           # [新增] 二期 Command 实现（分析/报告/健康/纠错）
├── core/
│   ├── mod.rs
│   ├── models.rs                    # ▲ 新增 DailyAnalysis/DailyReport/PipelineHealth 结构体
│   ├── writer.rs                    # ▲ WriteEvent 枚举扩展
│   ├── privacy.rs
│   ├── collection/
│   │   ├── mod.rs
│   │   ├── tracker.rs
│   │   ├── capture.rs
│   │   ├── input_dynamics.rs
│   │   ├── clipboard_flow.rs
│   │   ├── notification_tracker.rs  # [新增] 通知打断采集 (M0)
│   │   └── ambient_context.rs       # [新增] 环境感知采集 (M0)
│   ├── aggregation/
│   │   ├── mod.rs
│   │   └── pipeline.rs
│   ├── analysis/                    # [新增] 二期分析引擎 (M1/M2)
│   │   ├── mod.rs                   # Analysis Engine 主循环
│   │   ├── engine.rs                # AnalysisCmd 处理 + 分组调度
│   │   ├── time_distribution.rs     # 指标组 A
│   │   ├── attention_switch.rs      # 指标组 B (含深度工作段算法)
│   │   ├── interruption.rs          # 指标组 C
│   │   ├── input_rhythm.rs          # 指标组 D (含心流/挣扎评分)
│   │   ├── clipboard_analysis.rs    # 指标组 E (P1)
│   │   ├── ambient_analysis.rs      # 指标组 F (P1)
│   │   ├── scoring.rs               # normalize + flow_score + struggle_score
│   │   ├── deep_work.rs             # 深度工作段检测算法
│   │   └── data_sources.rs          # 数据源可用性检测 + 降级
│   ├── report/                      # [新增] 报告生成 (M3)
│   │   ├── mod.rs
│   │   ├── generator.rs             # 模板引擎 + 章节拼接
│   │   ├── sections.rs              # 各章节渲染函数
│   │   ├── export.rs                # 文件导出 (md/html)
│   │   └── templates.rs             # 一句话摘要等模板规则
│   ├── ai/                          # [新增] AI 增强 (M5, feature = "ai")
│   │   ├── mod.rs
│   │   ├── client.rs                # reqwest HTTP 客户端
│   │   ├── prompt.rs                # System prompt + 结构化 prompt 构建
│   │   └── sanitizer.rs             # 出境数据过滤 (隐私红线)
│   ├── scheduler/                   # [新增] 定时调度 (M3)
│   │   ├── mod.rs
│   │   └── daily_trigger.rs         # 每日定时触发分析
│   ├── health/                      # [新增] 健康监控 (M0)
│   │   ├── mod.rs
│   │   └── monitor.rs               # Pipeline Health Monitor
│   ├── acquisition/
│   │   ├── mod.rs
│   │   └── macos.rs
│   └── storage/
│       ├── mod.rs
│       ├── db.rs                    # ▲ 新增 daily_analysis/daily_reports 读查询
│       └── migrations.rs            # ▲ 追加二期迁移脚本
├── services/
│   ├── mod.rs
│   └── analysis.rs
└── utils/
    ├── mod.rs
    ├── hash.rs
    ├── regex.rs
    └── format.rs                    # [新增] 时长格式化 (ms → "Xh Ym")
```

### 8.2 前端目录扩展

```
src/
├── main.tsx
├── App.tsx                          # ▲ 路由配置 + 导航
├── pages/
│   ├── VerificationPanel.tsx        # 一期验证面板 (保留, /debug 路由)
│   ├── RecapPage.tsx                # [新增] 复盘页 (M4)
│   ├── SessionBrowser.tsx           # [新增] 会话列表页 (M4)
│   ├── HealthPanel.tsx              # [新增] 健康度面板 (M4)
│   └── SettingsPage.tsx             # [新增] 设置页 (M4/M5)
├── components/
│   ├── StatusBar.tsx                # ▲ 适配二期状态
│   ├── SessionList.tsx              # ▲ 增加 intent 标签 + 修改入口
│   ├── SnapshotPreview.tsx
│   ├── StorageMonitor.tsx
│   ├── ToolBar.tsx
│   ├── MarkdownReport.tsx           # [新增] Markdown 报告渲染组件
│   ├── DatePicker.tsx               # [新增] 日期选择器
│   ├── EngineStatusCard.tsx         # [新增] 单引擎健康状态卡片
│   ├── IntentEditor.tsx             # [新增] Intent 修改弹窗 (M5)
│   ├── AiConfigForm.tsx             # [新增] AI 配置表单 (M5)
│   └── PrivacyNotice.tsx            # [新增] 隐私说明弹窗 (M5)
├── stores/
│   ├── appStore.ts                  # ▲ 合入二期 Phase2State
│   └── p1Store.ts
├── services/
│   └── tauri.ts                     # ▲ 新增二期 Command 封装
├── types/
│   └── index.ts                     # ▲ 新增 DailyAnalysis/DailyReport/PipelineHealth 类型
└── hooks/
    ├── useEventListeners.ts         # ▲ 新增二期 Event 监听
    └── useAnalysis.ts               # [新增] 分析生成/加载 Hook
```

---

## 九、文件系统扩展

```
~/.timelens/
├── data/
│   ├── db.sqlite                    # 14 张表 (一期 12 + 二期 2)
│   ├── db.sqlite-wal
│   ├── db.sqlite-shm
│   └── shots/                       # 截图 (不变)
│       └── 2026-03-31/
├── exports/                         # [二期新增] 报告导出目录
│   ├── timelens-recap-2026-03-31.md
│   └── timelens-recap-2026-03-30.md
├── logs/
│   └── timelens.log
└── config/
```

---

## 十、安全架构扩展

### 10.1 AI 数据出境控制

```
┌─────────────────────────────────────────────────────────────┐
│ 数据出境控制 (仅 AI opt-in 时生效)                             │
│                                                             │
│  ┌──────────────────┐    ┌───────────────┐                 │
│  │ daily_analysis   │───→│  Sanitizer    │──→ LLM API      │
│  │ (聚合数字)       │    │ 过滤:         │                  │
│  └──────────────────┘    │ ✅ 聚合数字    │                 │
│                          │ ✅ Intent 名   │                 │
│  ┌──────────────────┐    │ ✅ App 名     │                 │
│  │ 禁止出境         │    │ ❌ 窗口标题   │                 │
│  │ raw_events      │    │ ❌ URL 参数   │                 │
│  │ window_title    │    │ ❌ 文件路径   │                 │
│  │ clipboard 正文   │    │ ❌ 按键数据   │                 │
│  │ 截图文件 (默认)  │    │ ❌ 通知正文   │                 │
│  └──────────────────┘    └───────────────┘                 │
│                                                             │
│  日志约束: AI prompt/response 不写入本地日志                  │
│  密钥约束: API Key 存储在 settings 表, 不出现在日志中          │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 二期新增配置项

| 配置键 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `ai.enabled` | BOOLEAN | `false` | AI 功能总开关 |
| `ai.api_base` | TEXT | `https://api.openai.com` | LLM API 基础 URL |
| `ai.api_key` | TEXT | 空 | 用户的 API Key (BYOK) |
| `ai.model` | TEXT | `gpt-4o-mini` | 模型名称 |
| `analysis.trigger_hour` | INTEGER | `22` | 自动分析触发小时 |
| `analysis.trigger_minute` | INTEGER | `0` | 自动分析触发分钟 |
| `analysis.blacklist_apps` | TEXT (JSON) | `[]` | 分析排除的应用列表 |
| `ai.screenshot_blacklist_apps` | TEXT (JSON) | `[]` | AI 分析排除截图的应用列表 |

---

## 十一、性能基准要求（二期扩展）

| 指标 | 目标值 | 测量方法 |
| --- | --- | --- |
| **聚合引擎** | 单日全量聚合 ≤5 秒 | 8 小时工作数据量（3 万 raw_events + 6000 input_metrics） |
| **指标组 A+B** | ≤2 秒 | 500 sessions + 400 switches |
| **指标组 C+D** | ≤2 秒 | 200 notifications + 6000 input_metrics |
| **报告生成** | 非 AI 路径 ≤500ms | 模板渲染 |
| **AI 报告** | ≤30 秒（含网络） | 端到端含 HTTP 往返 |
| **报告导出** | ≤200ms | 文件写入 |
| **前端渲染** | Markdown 报告 ≤500ms | react-markdown 渲染 |
| **会话列表** | 300+ 条流畅滚动 FPS ≥30 | react-virtuoso |
| **内存增量** | 二期模块 ≤30MB | Analysis Engine + Report Generator |
| **CPU 增量** | 聚合期间 ≤15%，稳态 ≤1% | 仅聚合时 CPU 峰值 |

---

## 十二、架构关键决策记录 (ADR) — 二期

### ADR-P2-1：Analysis Engine 独立线程

| 决策 | Analysis Engine 使用独立 OS 线程，不复用 Tokio Runtime |
|:---|:---|
| **背景** | 分析涉及大量 SQLite SELECT + 内存中排序/计算（深度工作段检测、碎片化指数等），属 CPU 密集型 |
| **权衡** | 若放在 Tokio 中使用 `spawn_blocking`，会占用 blocking thread pool；独立线程更可控，且可通过 `AnalysisCmd` 通道实现取消 |
| **替代** | 在 Tokio `spawn_blocking` 中运行 → 无法优雅取消；与其他 blocking task 共享线程池 |

### ADR-P2-2：reqwest 隔离引入

| 决策 | `reqwest` 仅在 `ai` feature 下编译，AI Client 是唯一允许网络请求的模块 |
|:---|:---|
| **背景** | 一期严格禁止 `reqwest`；二期 AI BYOK 需要 HTTPS 请求 |
| **隔离** | Cargo feature gate + 模块目录隔离 + 运行时配置门控 + CI 无 feature 编译验证 |
| **关键约束** | 非 AI 路径必须在 `cargo build --no-default-features` 下编译通过且零网络依赖 |

### ADR-P2-3：分析结果持久化策略

| 决策 | 分析结果写入 `daily_analysis` 表，报告内容写入 `daily_reports` 表 |
|:---|:---|
| **背景** | 若分析结果仅存于内存，则无法支持历史查看、周对比、重新生成 |
| **方案** | 两张表分离：`daily_analysis` 存纯数字（供对比和二次消费），`daily_reports` 存渲染后的 Markdown（供直接展示和导出） |
| **版本策略** | 重新生成时 `daily_analysis.version` +1，`daily_reports` 新增行而非覆盖 |

### ADR-P2-4：报告生成不直接查 SQL

| 决策 | Report Generator 仅读取 `DailyAnalysis` 结构体，不执行任何 SQL |
|:---|:---|
| **背景** | 确保报告数字 100% 来自 `daily_analysis`，实现数字可溯源 |
| **收益** | 报告中任一数字都可在 `daily_analysis` 表中找到对应字段；测试只需验证两处一致 |
| **约束** | 所有分析逻辑必须在 Analysis Engine 中完成并写入表，Report Generator 是纯模板引擎 |

### ADR-P2-5：前端从验证面板升级为产品 UI

| 决策 | 二期前端从单页验证面板重构为 4 页路由的产品级 UI |
|:---|:---|
| **背景** | 一期验证面板面向开发者；二期需面向非开发者用户 |
| **保留** | 一期验证面板保留在 `/debug` 路由下，供开发调试使用 |
| **新增** | 复盘页（默认首页）+ 会话列表 + 健康度 + 设置 |
| **技术** | 引入 `react-router-dom` 实现客户端路由；一期技术栈（React/Vite/Tailwind/Zustand/Virtuoso）全部保留 |

### ADR-P2-6：降级设计——每个指标组独立失败

| 决策 | 6 个指标组独立计算，任一组失败不影响其他组和报告生成 |
|:---|:---|
| **背景** | 二期补齐的引擎（Notification/Ambient）可能因权限或兼容性问题不可用 |
| **实现** | 每个 `compute_*` 函数返回 `Option<GroupX>`；Analysis Engine 将失败的组标记到 `degraded_sections` |
| **报告** | Report Generator 对降级章节生成标注文字而非跳过章节结构 |

---

## 十三、测试策略（二期扩展）

### 13.1 分析引擎测试

| 测试类型 | 范围 | 工具 | 覆盖目标 |
| --- | --- | --- | --- |
| **Golden Test** | 每个指标组 | Rust `#[test]` + fixture DB | fixture → 分析 → 对比已知答案（golden file） |
| **降级测试** | 8 种降级场景 | Rust `#[test]` + 空表 fixture | 空表 → 对应指标 NULL → `degraded_sections` 正确 |
| **性能测试** | 聚合耗时 | 基准测试 + 大数据量 fixture | 8 小时数据量 → 聚合 ≤5 秒 |
| **幂等测试** | 重复聚合 | Rust `#[test]` | 同一 date 聚合两次 → `version` +1，数值不变 |

### 13.2 报告生成测试

| 测试类型 | 范围 | 覆盖目标 |
| --- | --- | --- |
| **结构测试** | 报告 Markdown | 包含 7 个 `##` 标题 + 页脚 |
| **数字溯源测试** | 报告文本 vs daily_analysis | 正则提取报告中数字 → 与 DB 字段逐一比对 |
| **降级标注测试** | 降级报告 | `degraded_sections` 中的每项在报告中有对应 `⚠️` 标注 |

### 13.3 AI 测试

| 测试类型 | 范围 | 覆盖目标 |
| --- | --- | --- |
| **出境审计** | sanitizer 输出 | 验证无 window_title、无 URL 参数、无剪贴板正文 |
| **数字一致性** | AI 报告 vs 事实 | AI 文本中引用的数字与 `daily_analysis` 一致 |
| **降级回退** | AI 失败 | API 超时/错误 → 返回 fact_only 报告 + 错误提示 |
| **开关隔离** | AI 关闭 | AI disabled → 无网络请求，`cargo build --no-default-features` 通过 |

---

## 十四、风险评估（二期特有）

| 风险 | 等级 | 缓解 |
| --- | --- | --- |
| 一期引擎未完成导致 M0 工期过长 | 🟡 中 | M0 设为独立里程碑，尽早审计；降级设计保底 |
| SQLite 大数据量聚合性能超预期 | 🟡 中 | M1 即做性能基准；索引覆盖所有聚合查询 |
| 深度工作段算法边界 case | 🟡 中 | 覆盖 fixture：无切换/大量切换/intent 变化/跨日等 |
| AI 模型幻觉编造数字 | 🟡 中 | prompt 固定结构 + 数字溯源锚点 + 前端视觉区分 AI 内容 |
| reqwest 引入导致非 AI 路径意外联网 | 🟢 低 | feature gate + CI 验证 + 模块隔离 |
| Notification Tracker 横幅检测准确性 | 🟡 中 | 低置信度时默认 `voluntary`；降级到纯 app_switches 推断 |

---

## 十五、与一期架构的兼容性清单

| 一期设计 | 二期是否修改 | 说明 |
| --- | --- | --- |
| L1–L7 分层 | 扩展不修改 | 新增 L4.6 分析层 |
| Writer Actor 单线程写入 | 扩展不修改 | WriteEvent 枚举新增 4 个变体 |
| 读写分离 (Arc\<Connection\>) | 不修改 | 分析引擎通过同一只读连接查询 |
| mpsc 写入通道 (256) | 不修改 | 二期新增写入频率极低（每天 2-3 条） |
| 双层数据模型 | 不修改 | 分析引擎消费 L2 层 sessions，不修改 raw_events |
| Session 切分规则 | 不修改 | 深度工作段检测基于已有的 session + switch 数据 |
| 隐私控制策略 | 扩展不修改 | 新增 AI 出境控制层 |
| Schema 迁移机制 | 不修改 | 追加迁移脚本到已有数组 |
| 前端技术栈 | 不修改 | React/Vite/Tailwind/Zustand/Virtuoso 全部保留 |
| 性能基准 | 扩展不修改 | 新增分析和报告相关指标 |

---

*本文档版本: v1.0 · 日期: 2026-03-31 · 基于一期架构 v2.2 增量演进 · 配套 PRD_二期 v3.1、指标字典 v1.0、里程碑计划 v1.0*
