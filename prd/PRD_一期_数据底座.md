# 🦞 TimeLens 一期产品设计文档 — 数据底座（Data Foundation PRD）

> **版本**：v4.0（补充产品背景与产品边界）  
> **日期**：2026-03-26  
> **定位**：本文档取代原 `PRD_一期.md` 与 `PRD_一期优化版V2.md`，作为一期开发的唯一产品功能基准。

---

## 序言：产品背景与边界

### 一、我们在解决什么问题

现代知识工作者每天在电脑前工作 8 小时以上，却对"这 8 小时真正发生了什么"几乎一无所知。

这不是态度问题，而是**结构性认知盲区**：

- 人对自己如何使用时间的主观感受，与客观事实存在系统性偏差。研究表明，大多数人高估了自己的"深度工作时长"，低估了上下文切换、通知打断、无意识刷屏的真实占比。
- 现有的时间记录工具要么依赖**手动打卡**（Toggl、Clockify），高度依赖用户自律，数据残缺且失真；要么是**粗粒度的应用统计**（RescueTime、macOS 屏幕使用时间），只能告诉你"用了 Chrome 两小时"，无法还原真实的工作上下文——你在 Chrome 里是在研究技术文档，还是在刷视频？
- 没有任何工具能做到：**被动记录 + 深度上下文 + 本地隐私 + AI 解读** 四者同时具备。

TimeLens 要填的，正是这个空白。

---

### 二、产品是什么

**TimeLens** 是一款运行在 macOS 上的个人工作行为追踪与智能分析工具。

**一句话定位**：AI 驱动的个人时间透视镜——自动、被动地记录你的电脑使用行为，用你自己都不知道的客观数据，帮你看清时间真正流向了哪里。

**核心逻辑链**：

```
后台静默采集
（窗口/截图/输入/环境）
        ↓
本地结构化存储
（原始事件 → 会话 → 意图）
        ↓
AI 多模态深度解读
（标题 + 截图 → 自然语言洞察）
        ↓
每日工作报告
（"你今天真正做了什么"）
```

产品完全**本地运行**，无需联网，无后台服务器，所有数据只存在用户自己的机器上。

---

### 三、我们的目标用户是谁

凡是**长期、频繁使用电脑作为主要工作工具**的人，都是 TimeLens 的潜在用户：


| 用户群体          | 核心痛点                  | TimeLens 的价值              |
| ------------- | --------------------- | ------------------------- |
| 开发工程师         | 写了一天代码，说不清楚做了什么       | 精确还原每段 Coding 的文件、分支、持续时长 |
| UI / 设计师      | 设计工具和参考资料来回切换，效率不清晰   | 记录 Figma、参考网页、资源工具的真实使用分布 |
| 产品经理          | 开会、写文档、沟通三线并行，时间碎片化严重 | 量化每类工作实际消耗的时间，识别最大的时间黑洞   |
| 自由职业者         | 向客户汇报工时无客观依据          | 被动生成的客观时间记录，可直接作为计费参考     |
| 知识工作者 / 内容创作者 | 主观感受与实际产出脱节，不知道效率瓶颈在哪 | 自然语言报告揭示真实规律，打破自我认知幻觉     |


**用户动机分层**（决定功能优先级的核心视角）：

```
Layer 1 · 自我优化者（早期核心用户）
  → 主动寻找效率工具的开发者、设计师、效能爱好者
  → 高意愿、强付费意愿、传播力强，是产品口碑的起点

Layer 2 · 知识焦虑者（规模化主力用户）
  → 感知自己效率不高但找不到问题所在的白领、PM、咨询顾问
  → 需要产品主动给出答案，是增长的核心群体

Layer 3 · 自由职业者（高价值细分用户）
  → 需要客观工时记录支撑计费与复盘的外包开发、独立设计师
  → 工具依赖度高，ARPU 高，SaaS 付费习惯成熟

Layer 4 · 企业团队（远期 B 端方向）
  → 远程团队效能管理，在绝对隐私保障前提下提供团队洞察
  → 客单价极高，但决策链长，三期以后探索
```

---

### 四、与竞品的本质差异


| 维度    | RescueTime | Timing.app | Toggl / Clockify | **TimeLens**         |
| ----- | ---------- | ---------- | ---------------- | -------------------- |
| 采集方式  | 被动（应用级）    | 被动（应用+窗口）  | 手动打卡             | **被动（窗口+截图+输入+环境）**  |
| 数据粒度  | 应用名        | 应用名+窗口标题   | 用户手填             | **原始行为序列 + 屏幕截图**    |
| 上下文还原 | ✗          | 部分         | ✗                | **✅ 截图 + 时序 + 行为意图** |
| AI 解读 | 规则分类       | 规则分类       | ✗                | **✅ 多模态大模型（二期）**     |
| 数据存储  | 云端         | 本地         | 云端               | **✅ 本地优先，隐私第一**      |
| 报告形式  | 图表         | 图表         | 图表               | **✅ 自然语言叙事（二期）**     |
| 情境回溯  | ✗          | ✗          | ✗                | **✅ 截图+时序精确定位**      |


TimeLens 的护城河不在于单一功能，而在于**"被动采集 + 深度上下文 + 本地隐私 + AI 叙事"四者合一**，任何竞品若要复制，都需要从数据架构层完整重建。

---

### 五、产品三期演进路线

TimeLens 是一个分阶段建设的产品，三期各有清晰使命：

```
┌─────────────────────────────────────────────────────────────────┐
│  一期：数据底座（当前）                                           │
│  使命：搭建采得全、存得稳、跑得通的本地行为数据基础设施             │
│  交付：多维原始采集 + 双层数据模型 + 最小化校验看板                │
│  用户：开发者自用，验证数据管道正确性                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  二期：日终复盘与分析（见 PRD_二期_智能洞察 v3.1）                     │
│  使命：一期+二期采集整合；非 AI 与 AI 双轨分析；可见/可叙/可校准/可找回   │
│  交付：分析流水线 + 事实复盘 + 可选 AI 叙事；UI 够用即可               │
│  用户：自我优化者、知识焦虑者等；深度页面与展示 → 三期                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  三期：破界与连接                                                 │
│  使命：打破单机孤岛，连接产出生态，探索团队与商业化                  │
│  交付：多端云同步 + GitHub/Notion/Calendar 集成 + 团队看板 + 订阅制│
│  用户：自由职业者、小团队、企业                                    │
└─────────────────────────────────────────────────────────────────┘
```

> **一期做好数据底座，是二三期所有能力的唯一前提。底座的质量直接决定上层建筑的上限。**

---

## 0. 产品北极星：用户核心需求

在进入任何功能设计之前，必须先锚定产品存在的根本原因。以下五条核心需求是 TimeLens 所有功能设计的**评判标准**——任何不能服务于其中至少一条的功能，都应砍掉或推后。

### 核心需求 1：零摩擦（Zero Friction）

> **我不想为"记录"这件事付出任何精力。**

用户不愿意手动打卡、不愿意设置分类、不愿意每天维护。被动采集 + 自动分类是 TimeLens 的生死线。任何需要用户主动操作才能产生价值的功能都是负担。一旦用户需要"记得去开启追踪"，这个产品就失败了。

### 核心需求 2：自知（Self-Awareness）

> **告诉我一个我自己都不知道的真相。**

用户不需要再看一遍自己已经知道的事。产品的核心价值在于揭示**反直觉的事实**：你以为在写代码，其实在刷 YouTube；你以为在摸鱼，其实有效产出相当高。人对自己如何使用时间的感知，与现实存在系统性偏差——TimeLens 是打破这种幻觉的镜子。

### 核心需求 3：情境回溯（Context Recall）

> **让我找回某一时刻在做什么。**

这是截图功能的终极价值，也是与所有竞品的最大差异点。不是"昨天我用 Chrome 两小时"，而是**"昨天下午三点我在看的那篇论文叫什么名字"**。数据积累越多，这个功能越不可替代。截图 + 行为时序 = 个人工作记忆的黑匣子。

### 核心需求 4：洞察生成（Insight Generation）

> **帮我解读数据，我看不懂图表。**

大多数用户不会读数据，也不愿意读。报告必须是**自然语言的叙事，而不是折线图和饼图**。"你本周有 40% 的时间处于碎片化切换状态，深度工作时长不足 2 小时，主要中断来源是微信"——这才是用户真正想要的。这是二期 AI 分析的核心使命，但一期的数据底座必须为此准备足够的原材料。

### 核心需求 5：隐私安全（Privacy First）

> **这些数据只能我自己看。**

用户不会主动提这条需求，但一旦被违背就会彻底流失。本地存储不是技术选型，它是产品的**信任基础**，是 TimeLens 与 SaaS 竞品最核心的护城河。这个承诺必须在产品每一个可见角落被强化，而不只是写在文档里。

### 核心需求 → 三期演进映射


| 核心需求 | 一期                | 二期           | 三期            |
| ---- | ----------------- | ------------ | ------------- |
| 零摩擦  | ✅ 被动采集底座，全程无需用户干预 | 自动分类持续优化     | 极简 Onboarding |
| 自知   | 数据存在即可，校验正确性      | ✅ AI 反直觉洞察报告 | 可视化放大效果       |
| 情境回溯 | ✅ 截图 + 行为时序存储     | AI 语义检索      | ✅ 时间轴交互界面     |
| 洞察生成 | —                 | ✅ 自然语言日报/周报  | 推送通知、对话式      |
| 隐私安全 | ✅ 100% 本地，零外部网络   | 本地大模型选项      | 端对端加密（可选云同步）  |


---

## 0.5 边界约束：我们不做什么

明确"不做什么"与明确"做什么"同等重要。以下约束分四个层次，共同构成 TimeLens 的产品边界。

### 一、产品（永久）不做的事

这些是原则性边界，与开发阶段无关，是产品设计哲学的底线。


| 不做的事                            | 原因                                      |
| ------------------------------- | --------------------------------------- |
| **行为干预**：不弹窗警告、不封锁网站、不限制应用使用时长  | TimeLens 只提供镜子，不充当管家；用户有权自主决定如何使用时间     |
| **任务管理**：不做 to-do、项目管理、时间规划     | 定位是"记录已发生的事"，而非"规划将要发生的事"               |
| **员工监控**：不做任何组织级监控、管理者查看下属数据的功能 | 数据所有权 100% 归用户个人；跨越此线会摧毁信任，并带来严重伦理与法律风险 |
| **社交化**：不做排行榜、好友比较、公开展示         | 社交化会扭曲用户行为，使其为"好看的数据"而表演工作              |
| **未授权的云端**：数据不上传、不同步、不在服务器分析    | 本地优先是信任基础；即使未来支持可选云同步，也必须完全透明且端对端加密     |


### 二、一期版本不做的事

这些是阶段性克制，保证一期聚焦于"数据底座"唯一使命。


| 不做的事                      | 推后到         |
| ------------------------- | ----------- |
| AI 分析与自然语言报告              | 二期          |
| 多端同步（iPhone / iPad / Web） | 三期+         |
| Windows / Linux 支持        | 待规划         |
| 数据导出（CSV / PDF / API）     | 数据格式稳定后     |
| 精美可视化图表（时间轴、饼图、趋势图）       | 三期          |
| 通知与提醒系统                   | 二期          |
| 应用内付费 / 订阅系统              | 产品验证后       |
| 多用户 / 账号系统                | 多端同步的前置条件   |
| Onboarding 引导流程           | 面向普通用户时（二期） |


### 三、一期产品设计不做的事

前端 UI 与交互层面的克制，防止把校验看板做成"正式产品"。

- **不做**深色/浅色主题切换
- **不做**搜索与高级筛选
- **不做** Intent 分类的前端可视化编辑界面（IPC 接口层预留，UI 推后）
- **不做**截图全文检索
- **不做**数据统计图表（即使后端数据已聚合）
- **不做**今日/本周/本月的时间维度切换视角
- **不做**精心设计的配置表单（简单键值对调试面板足够）

### 四、一期技术架构不应该做的事

架构层面最容易犯的过度设计错误，每一条都会让一期变得臃肿且难以完成。


| 禁止引入                                  | 原因                                                |
| ------------------------------------- | ------------------------------------------------- |
| 任何网络层（REST / GraphQL / WebSocket）     | 违反"零外部网络请求"原则；引入认证、安全、端口等复杂性                      |
| 消息队列或事件总线（Redis / Kafka / 复杂内部 Bus）   | `tokio` channel 足够；过度抽象让调试变成噩梦                    |
| 插件系统或扩展架构                             | 过早抽象只增加复杂度，扩展点留到二期                                |
| 多数据库架构（InfluxDB / DuckDB / LevelDB 等） | SQLite + 索引 + WAL 足够支撑单机一期；多 DB 让数据一致性复杂度倍增       |
| 数据库加密层（SQLCipher / AES）               | macOS 文件权限是第一道防线；加密引入密钥管理问题，与一期目标无关               |
| 崩溃上报与遥测（Sentry / Analytics SDK）       | 本地日志够用；任何外部 SDK 都违反"零网络请求"承诺                      |
| 自动更新机制（`tauri-plugin-updater`）        | 需要签名服务器和更新通道，一期基础设施不具备                            |
| 多进程架构（Tracker / Capture 拆为独立系统进程）     | 同一 Tauri 进程内的 `tokio` 异步任务已足够隔离；进程隔离的收益远不如带来的调试代价 |


---

## 1. 一期核心定位

一期的唯一使命：**搭建一个采得全、存得稳、跑得通的本地数据底座**。

具体而言：

- **采集层**：从 macOS 操作系统底层获取尽可能丰富的原始行为数据（窗口、截图、系统状态），并通过 **5 大差异化数据引擎**（输入行为学、剪贴板流向、上下文切换图谱、通知打断、环境感知）建立竞品无法复制的多维数据壁垒。
- **存储层**：设计健壮的本地数据模型（12 张表），保证数据完整、可追溯、可扩展。
- **管道层**：将原始宽表数据折叠聚合为结构化的 Session 事件。
- **校验层**：提供最小化的前端看板，用于验证数据底座是否正常运转。

一期**不追求**：

- 精美的 UI 设计和复杂的交互体验
- AI 自动化分析能力
- 多端同步、云端上传
- 面向普通用户的"正常模式"（二期再做）

一期的前端仅为**开发者校验工具**，验证"数据进来了、存对了、能读出来"即可。

---

## 2. 技术架构概览

沿用已有技术选型：


| 层级   | 技术栈                                                                                                                                | 职责                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 底层采集 | Rust + macOS Native API (Cocoa / CoreGraphics / Accessibility / CGEventTap / CoreAudio / CoreWLAN / IOPowerSources / NSPasteboard) | 窗口监听、截图、输入行为、剪贴板、通知、环境感知 |
| 通信层  | Tauri 2.0 IPC (Commands + Events)                                                                                                  | 前后端数据通道                  |
| 存储层  | SQLite (rusqlite, 12 张表) + 本地文件系统                                                                                                  | 时序数据库 + 截图文件             |
| 校验前端 | React 18 + Vite + TailwindCSS                                                                                                      | 极简开发者看板                  |


**绝对红线**：一期禁止任何外部网络请求，100% 数据本地存储。

---

## 3. 模块一：全景数据采集引擎（Tracker Engine）

### 3.1 功能定义

Tracker 是数据底座的"入口"——一个运行在后台独立线程中的无限循环采集器，按固定频率轮询操作系统状态，将原始数据写入 `raw_events` 宽表。

**核心原则**：只做事实记录，不做任何业务判断（不判断"用户在摸鱼"，不判断"这是有效工作时间"）。

### 3.2 采集字段清单

每次轮询周期，Tracker 应尝试获取以下字段：


| 字段                    | 类型      | 说明                                  | 数据来源                                          | 优先级 |
| --------------------- | ------- | ----------------------------------- | --------------------------------------------- | --- |
| `id`                  | TEXT    | 唯一标识（UUID v4）                       | 系统生成                                          | P0  |
| `timestamp_ms`        | INTEGER | 采集时刻的绝对时间戳（毫秒）                      | `SystemTime`                                  | P0  |
| `app_name`            | TEXT    | 前台应用名称                              | `NSWorkspace` / AppleScript                   | P0  |
| `bundle_id`           | TEXT    | 应用 Bundle ID（如 `com.google.Chrome`） | `NSRunningApplication`                        | P0  |
| `window_title`        | TEXT    | 完整窗口标题                              | `AXUIElement` / AppleScript                   | P0  |
| `extracted_url`       | TEXT    | 从窗口标题中解析的 URL                       | 正则提取                                          | P0  |
| `extracted_file_path` | TEXT    | 从窗口标题中解析的文件路径                       | 正则提取                                          | P0  |
| `idle_seconds`        | REAL    | 用户上次键鼠操作至今的秒数                       | `CGEventSourceSecondsSinceLastEventType`      | P0  |
| `is_fullscreen`       | BOOLEAN | 当前窗口是否全屏                            | `AXUIElement` 属性查询                            | P1  |
| `is_audio_playing`    | BOOLEAN | 系统是否有音频输出                           | CoreAudio API                                 | P1  |
| `state_hash`          | TEXT    | 本次采集状态的哈希指纹                         | 对 app_name+window_title+is_fullscreen 等做 hash | P0  |
| `trigger_type`        | TEXT    | 状态变化类型                              | `poll` / `window_change` / `title_change`     | P0  |


### 3.3 采集逻辑

```
┌─────────────────────────────────────────────────────────┐
│                  Tracker 主循环                          │
│                                                         │
│  loop {                                                 │
│    1. 读取系统 idle_seconds                              │
│    2. 若 idle_seconds >= AFK_THRESHOLD → 标记 AFK，跳过  │
│    3. 调用 OS API 获取当前 app_name + window_title       │
│    4. 获取 bundle_id, is_fullscreen, is_audio_playing    │
│    5. 正则解析 window_title → extracted_url/file_path    │
│    6. 计算 state_hash                                   │
│    7. 与上一次 state_hash 对比：                         │
│       - 不同 → trigger_type = window_change/title_change │
│       - 相同 → trigger_type = poll                       │
│    8. 写入 raw_events 表                                 │
│    9. 通知 CaptureService（是否需要截图）                 │
│   10. 通知 Aggregator（是否需要折叠 Session）             │
│   11. sleep(POLL_INTERVAL)                               │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
```

### 3.4 防抖与去重策略

- **状态哈希对比**：对 `app_name + window_title + is_fullscreen` 拼接后计算简易哈希（如 CRC32），与上一次对比。完全相同则标记 `trigger_type = poll`，不同则标记具体变化类型。
- **AFK 静默**：当 `idle_seconds >= AFK_THRESHOLD`（默认 240 秒）时，Tracker 仅记录一条 AFK 进入标记，不持续产生 raw_events，直到用户恢复活跃。
- **微抖动过滤**：若窗口切换后在 500ms 内又切回原窗口，视为系统抖动，不产生新记录。

### 3.5 URL 与文件路径提取规则

从 `window_title` 中用正则提取深层上下文：


| 应用类型 | 标题样例                                          | 提取规则                                 |
| ---- | --------------------------------------------- | ------------------------------------ |
| 浏览器  | `TimeLens PRD - Google Docs - Google Chrome`  | 提取标题作为页面名，无直接 URL（标题中通常不含完整 URL）     |
| 编辑器  | `main.rs — src-tauri/src — TimeLens — Cursor` | 提取文件名 `main.rs`，提取路径 `src-tauri/src` |
| 编辑器  | `bug修复方案.docx - Word`                         | 提取文件名 `bug修复方案.docx`                 |
| 终端   | `xzf@MacBook ~ % cargo build`                 | 提取当前命令 `cargo build`                 |


提取逻辑在 Tracker 层完成，结果直接写入 `extracted_url` 和 `extracted_file_path` 字段。使用可扩展的正则规则表，支持后续新增应用的适配。

### 3.6 可配置参数


| 参数                           | 默认值 | 范围       | 存储位置       |
| ---------------------------- | --- | -------- | ---------- |
| `tracker.poll_interval_secs` | 2   | 1–10     | settings 表 |
| `tracker.afk_threshold_secs` | 240 | 60–600   | settings 表 |
| `tracker.debounce_ms`        | 500 | 100–2000 | settings 表 |


---

## 4. 模块二：智能截图引擎（Capture Engine）

### 4.1 功能定义

截图引擎接收来自 Tracker 的信号，在合适的时机获取屏幕位图，经过压缩处理后落盘，并在数据库中记录元数据。

### 4.2 触发机制


| 触发类型           | 触发条件                                         | 优先级  | 说明                  |
| -------------- | -------------------------------------------- | ---- | ------------------- |
| `event_driven` | Tracker 检测到 `window_change` 或 `title_change` | High | 窗口/标题发生实质变化时立即截取    |
| `poll_driven`  | 同一窗口持续超过 `capture.periodic_interval_secs`    | Low  | 用户在同一窗口长时间操作时定期补充截取 |
| `manual`       | 用户通过 UI 或托盘手动触发                              | High | 开发者调试用              |


### 4.3 截图处理流水线

```
screencapture (PNG) → 内存加载 → 缩放至目标分辨率 → WebP 编码 → 落盘
                                                              ↓
                                                        写入 snapshots 表
                                                              ↓
                                                   Tauri Emit → 前端通知
```

**流水线细节**：

1. **截取**：调用 `screencapture -x -m -t png` 获取主屏幕原始 PNG（静默模式，不播放快门音）。
2. **缩放**：将原始像素缩放至目标分辨率（默认 1440x900，可配置为 1080p/720p）。
3. **编码**：使用 `image` crate 转码为 WebP 格式，质量因子可配（默认 75）。
4. **落盘**：写入 `~/.timelens/data/shots/{YYYY-MM-DD}/{uuid}_{trigger_type}.webp`。
5. **入库**：在 `snapshots` 表中插入元数据记录（路径、大小、触发类型、分辨率等）。
6. **通知**：通过 Tauri Event (`new_snapshot_saved`) 推送给前端。

所有 CPU 密集操作（步骤 2-4）必须在 `tokio::task::spawn_blocking` 中执行，不阻塞 Tauri 主事件循环。

### 4.4 截图去重（P1）

引入感知哈希（pHash）机制：

- 对每张截图计算 64-bit 感知哈希值，存入 `snapshots.perceptual_hash` 字段。
- 与前一张截图的哈希值做汉明距离比较，若距离 < 阈值（默认 5），则判定为"重复帧"，跳过存储。
- 去重仅对 `poll_driven` 类型生效，`event_driven` 和 `manual` 截图始终保存。

### 4.5 可配置参数


| 参数                                | 默认值        | 范围                  | 存储位置       |
| --------------------------------- | ---------- | ------------------- | ---------- |
| `capture.periodic_interval_secs`  | 15         | 10–60               | settings 表 |
| `capture.target_resolution`       | "1440x900" | 720p/1080p/1440p/原始 | settings 表 |
| `capture.webp_quality`            | 75         | 30–100              | settings 表 |
| `capture.dedup_enabled`           | true       | true/false          | settings 表 |
| `capture.dedup_hamming_threshold` | 5          | 0–20                | settings 表 |
| `capture.multi_monitor`           | false      | true/false          | settings 表 |


---

## 5. 模块三：本地时序数据库（Database Engine）

### 5.1 设计理念

采用**原始宽表 + 结构化 Session 的双层数据模型**：

- `**raw_events`**：Tracker 每个轮询周期产生一条，是最原始的一手数据，只追加不修改。
- `**window_sessions`**：由聚合管道从 raw_events 折叠而成，代表"一段连续的窗口使用"。

这种双层设计的好处：

1. 原始数据零损耗保留，支撑后续任意维度的重新分析。
2. Session 层面的数据足够轻量，前端查询和展示不会碰触海量原始记录。
3. 二期的 AI 分析可以直接消费 raw_events 做更深层的推断。

### 5.2 Schema 定义（基础表）

基础 5 张表（raw_events, window_sessions, snapshots, app_meta, intent_mapping）的完整 DDL 请参见 **第 16 章「完整数据库 Schema」**。

此处仅列出本模块直接管理的核心表概要：


| 表名                  | 说明               | 日增量预估          |
| ------------------- | ---------------- | -------------- |
| `raw_events`        | Tracker 原始宽表，只追加 | ~28,800 条/天    |
| `window_sessions`   | 聚合后的连续使用会话       | ~200-500 条/天   |
| `snapshots`         | 截图元数据（文件存本地）     | ~300-800 条/天   |
| `app_meta`          | 应用图标等元数据缓存       | 仅首次发现新 App 时写入 |
| `intent_mapping`    | 意图分类映射规则         | 初始化 + 用户自定义    |
| `settings`          | 系统配置键值对          | 低频修改           |
| `schema_migrations` | 数据库版本管理          | 仅升级时写入         |


差异化数据采集模块的 5 张新增表（input_metrics, clipboard_flows, app_switches, notifications, ambient_context）定义同样在第 16 章。

### 5.3 内置 Intent 映射初始化数据

首次建库时，自动插入以下内置规则（`is_builtin = 1`）：


| match_field | match_pattern | intent |
| ----------- | ------------- | ------ |
| app_name    | `*Code`*      | 编码开发   |
| app_name    | `*Cursor`*    | 编码开发   |
| app_name    | `*Xcode`*     | 编码开发   |
| app_name    | `*IntelliJ`*  | 编码开发   |
| app_name    | `*Terminal*`  | 编码开发   |
| app_name    | `*iTerm*`     | 编码开发   |
| app_name    | `*Chrome*`    | 研究检索   |
| app_name    | `*Safari*`    | 研究检索   |
| app_name    | `*Edge*`      | 研究检索   |
| app_name    | `*Firefox*`   | 研究检索   |
| app_name    | `*Arc*`       | 研究检索   |
| app_name    | `*ChatGPT*`   | AI辅助   |
| app_name    | `*Claude*`    | AI辅助   |
| app_name    | `*Gemini*`    | AI辅助   |
| app_name    | `*Word*`      | 文档撰写   |
| app_name    | `*Pages*`     | 文档撰写   |
| app_name    | `*Notion*`    | 文档撰写   |
| app_name    | `*Obsidian*`  | 文档撰写   |
| app_name    | `*WeChat*`    | 通讯沟通   |
| app_name    | `*微信*`        | 通讯沟通   |
| app_name    | `*Slack*`     | 通讯沟通   |
| app_name    | `*Discord*`   | 通讯沟通   |
| app_name    | `*Teams*`     | 通讯沟通   |
| app_name    | `*飞书*`        | 通讯沟通   |
| app_name    | `*钉钉*`        | 通讯沟通   |
| app_name    | `*Figma*`     | 设计创作   |
| app_name    | `*Sketch*`    | 设计创作   |
| app_name    | `*Photoshop*` | 设计创作   |


### 5.4 数据库管理机制

#### 5.4.1 Schema 迁移

- 使用 `schema_migrations` 表记录已应用的迁移版本号。
- 每次应用启动时，检查当前数据库版本，自动执行未应用的迁移脚本。
- 迁移脚本在 Rust 代码中硬编码为有序数组，按版本号顺序执行。

#### 5.4.2 WAL 模式

- SQLite 启用 WAL (Write-Ahead Logging) 模式，提升读写并发性能。
- 已在现有代码中实现：`PRAGMA journal_mode=WAL;`

#### 5.4.3 连接管理

- 数据库连接通过 `Arc<Mutex<Connection>>` 全局共享，由 Tauri `State` 托管。
- 所有写入操作前必须获取互斥锁，保证线程安全。

---

## 6. 模块四：数据聚合管道（Aggregation Pipeline）

### 6.1 功能定义

聚合管道是连接 `raw_events`（原始宽表）和 `window_sessions`（结构化事件）的桥梁。它负责将零散的轮询数据折叠为有意义的"使用会话"。

### 6.2 Session 折叠逻辑

```
raw_events 流入：
  t=0s  [Chrome, "Google - Chrome"]           → 新建 Session A
  t=2s  [Chrome, "Google - Chrome"]  (相同)    → 更新 Session A 的 end_ms
  t=4s  [Chrome, "Google - Chrome"]  (相同)    → 更新 Session A 的 end_ms
  t=6s  [Cursor, "main.rs — Cursor"]          → 结束 Session A，新建 Session B
  t=8s  [Cursor, "main.rs — Cursor"] (相同)    → 更新 Session B 的 end_ms
  ...
```

**折叠规则**：

1. 当 `app_name` 或 `window_title` 发生实质性变化时，结束当前 Session，新建下一个 Session。
2. 当检测到 AFK 进入（`trigger_type = afk_enter`）时，结束当前 Session。AFK 结束后视为新 Session 起点。
3. 每个 Session 的 `duration_ms` = `end_ms - start_ms`（但排除中间的 AFK 间隙）。
4. 每个 Session 的 `raw_event_count` 记录它包含的原始事件条数。

### 6.3 Intent 标注

Session 创建时，读取 `intent_mapping` 表进行匹配：

1. 按 `priority` 降序排列所有规则。
2. 对 Session 的 `app_name` / `bundle_id` / `window_title` 逐条匹配。
3. 首个命中的规则的 `intent` 值写入 Session 的 `intent` 字段。
4. 若无命中，`intent` 为 `NULL`。

### 6.4 实时聚合 + 补偿批处理

- **实时模式**（默认）：Tracker 每产生一条 raw_event，立即触发聚合判断——更新当前 Session 或创建新 Session。
- **补偿批处理**（P1）：每隔 5 分钟执行一次全量扫描，修正可能因竞态或异常导致的未正确关闭的 Session（`is_active = 1` 但已超时）。

---

## 7. 模块五：输入行为学引擎（Input Dynamics Engine）

### 7.1 功能定义

通过全局监听键盘与鼠标事件的**频率与模式**（绝不记录具体按键内容），构建用户的输入行为画像。这是 TimeLens 区别于所有竞品的核心差异化数据——**不记录"打了什么"，只记录"怎么打的"**。

**隐私红线**：严禁记录任何具体按键字符、输入内容或密码。仅统计频率、节奏和模式级别的聚合数据。

### 7.2 采集字段

每 **5 秒** 聚合一次当前窗口的输入行为指标，写入 `input_metrics` 表：


| 字段                         | 类型      | 说明                                    |
| -------------------------- | ------- | ------------------------------------- |
| `id`                       | TEXT    | UUID                                  |
| `timestamp_ms`             | INTEGER | 聚合时刻                                  |
| `session_id`               | TEXT    | 关联的当前 window_session                  |
| `window_interval_secs`     | REAL    | 本统计窗口的实际时长                            |
| `keystrokes_count`         | INTEGER | 窗口期内总按键次数（不含修饰键单独按下）                  |
| `kpm`                      | REAL    | 每分钟击键速率（Keys Per Minute）              |
| `delete_count`             | INTEGER | 退格/删除键按下次数                            |
| `delete_ratio`             | REAL    | 退格率 = delete_count / keystrokes_count |
| `shortcut_count`           | INTEGER | 快捷键组合次数（Cmd+X / Ctrl+X 等修饰键组合）        |
| `copy_count`               | INTEGER | 复制操作次数（Cmd+C）                         |
| `paste_count`              | INTEGER | 粘贴操作次数（Cmd+V）                         |
| `undo_count`               | INTEGER | 撤销操作次数（Cmd+Z）                         |
| `mouse_click_count`        | INTEGER | 鼠标点击总次数                               |
| `mouse_distance_px`        | REAL    | 鼠标移动总距离（像素）                           |
| `scroll_delta_total`       | REAL    | 滚轮滚动总量（像素）                            |
| `scroll_direction_changes` | INTEGER | 滚动方向切换次数（反复上下滚 = 纠结/搜索）               |
| `typing_burst_count`       | INTEGER | 打字连续爆发次数（连续 >3 秒持续输入为一次 burst）        |
| `longest_pause_ms`         | INTEGER | 最长输入停顿时长（两次按键之间的最大间隔）                 |


### 7.3 技术实现

- macOS 上通过 `CGEventTap` 创建全局事件监听器，监听 `keyDown`、`keyUp`、`mouseMoved`、`leftMouseDown`、`scrollWheel` 等事件类型。
- 维护一个内存中的 5 秒滑动窗口计数器，到期后聚合写入数据库并重置。
- **绝不调用 `CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode)`** 来获取具体键值（快捷键检测除外，快捷键仅检测修饰键组合标志位）。
- 运行在独立线程中，与 Tracker 主循环解耦。

### 7.4 衍生指标（二期 AI 消费）


| 衍生指标     | 计算方式                                              | 价值       |
| -------- | ------------------------------------------------- | -------- |
| **心流指数** | 高 KPM + 低 delete_ratio + 长 burst + 长时间单窗口         | 检测深度工作状态 |
| **挣扎指数** | 高 delete_ratio + 高 undo_count + 短 burst + 长 pause | 检测卡壳/困难  |
| **搬运指数** | 高 copy_count + 高 paste_count + 高切换频率              | 检测信息搬运模式 |
| **疲劳指数** | KPM 逐小时下降 + 鼠标精度下降 + scroll_direction_changes 上升  | 检测疲劳趋势   |


### 7.5 可配置参数


| 参数                                | 默认值  | 说明         |
| --------------------------------- | ---- | ---------- |
| `input.enabled`                   | true | 是否启用输入行为采集 |
| `input.aggregation_interval_secs` | 5    | 聚合窗口时长（秒）  |


---

## 8. 模块六：剪贴板流动图谱（Clipboard Flow Engine）

### 8.1 功能定义

追踪剪贴板的**使用流向**（哪个 App 复制 → 哪个 App 粘贴），构建信息在应用间的流动有向图。**不记录剪贴板具体内容**，只记录元数据。

这是目前没有任何竞品实现的独特数据维度，能直接揭示知识工作者的信息消费与生产路径。

**隐私红线**：严禁记录剪贴板的实际文本内容。仅记录内容类型、长度和来源/目标 App。

### 8.2 采集字段

每次检测到剪贴板变化或粘贴动作，写入 `clipboard_flows` 表：


| 字段               | 类型      | 说明                                                                                        |
| ---------------- | ------- | ----------------------------------------------------------------------------------------- |
| `id`             | TEXT    | UUID                                                                                      |
| `timestamp_ms`   | INTEGER | 事件发生时刻                                                                                    |
| `action`         | TEXT    | `copy` 或 `paste`                                                                          |
| `app_name`       | TEXT    | 触发动作时的前台应用名                                                                               |
| `bundle_id`      | TEXT    | 应用 Bundle ID                                                                              |
| `content_type`   | TEXT    | 内容类型：`plain_text` / `rich_text` / `url` / `image` / `file_ref` / `code_snippet` / `other` |
| `content_length` | INTEGER | 内容长度（文本=字符数，图片=字节数）                                                                       |
| `flow_pair_id`   | TEXT    | 将一次 copy 和其后的 paste 配对关联（同一个 pair_id）                                                     |


### 8.3 技术实现

- **Copy 检测**：开启独立轮询线程，每 500ms 检查 `NSPasteboard.generalPasteboard().changeCount` 是否变化。变化则记录一条 `copy` 事件，并从 `NSPasteboard` 读取内容类型（`availableTypes`）和长度（不读取实际内容）。
- **Paste 检测**：通过 `CGEventTap` 监听 Cmd+V 快捷键，触发时记录一条 `paste` 事件。
- **流向配对**：维护一个 `last_copy_id` 状态变量。每次 copy 时生成新的 `flow_pair_id`；后续的 paste 事件继承同一个 `flow_pair_id`，直到下一次 copy。
- **内容类型推断**：从 `NSPasteboard` 的 UTI 类型判断——`public.plain-text` → plain_text, `public.url` → url, `public.png`/`public.jpeg` → image, `public.file-url` → file_ref。若文本内容类型检测到多行且包含常见代码特征（如缩进、括号、分号），标记为 `code_snippet`。

### 8.4 衍生分析（二期 AI 消费）

通过 `clipboard_flows` 构建**信息流动有向图**：

```
节点 = App（按 app_name 聚合）
有向边 = copy 所在 App → paste 所在 App（权重 = 次数）

示例输出：
  Chrome → VS Code          (权重 47) = "查文档写代码"
  Chrome → Notion            (权重 23) = "做研究笔记"
  ChatGPT → VS Code          (权重 15) = "AI 辅助编程"
  VS Code → Terminal          (权重 8)  = "复制命令执行"
```

---

## 9. 模块七：上下文切换图谱（Context Switch Engine）

### 9.1 功能定义

基于 Tracker 已有的窗口切换数据，构建 **App 之间的切换有向图**，并计算注意力残留成本。这是对已有数据的深度衍生分析，不需要额外的系统 API，只需在 Tracker 中增加记录逻辑。

### 9.2 采集字段

每次窗口切换（`trigger_type = window_change`）时，写入 `app_switches` 表：


| 字段                         | 类型      | 说明                                                  |
| -------------------------- | ------- | --------------------------------------------------- |
| `id`                       | TEXT    | UUID                                                |
| `timestamp_ms`             | INTEGER | 切换发生时刻                                              |
| `from_app`                 | TEXT    | 切换前的应用名                                             |
| `from_bundle_id`           | TEXT    | 切换前的 Bundle ID                                      |
| `from_window_title`        | TEXT    | 切换前的窗口标题                                            |
| `to_app`                   | TEXT    | 切换后的应用名                                             |
| `to_bundle_id`             | TEXT    | 切换后的 Bundle ID                                      |
| `to_window_title`          | TEXT    | 切换后的窗口标题                                            |
| `from_session_duration_ms` | INTEGER | 离开前在 from_app 停留的时长                                 |
| `switch_type`              | TEXT    | `voluntary`（用户主动切换）/ `notification`（由通知触发，需与通知模块联动） |


### 9.3 技术实现

- 在 Tracker 主循环中，当检测到 `window_change` 时，除了写入 `raw_events` 外，同步写入 `app_switches` 表。
- `from_session_duration_ms` 直接取当前 Session 的已累积时长。
- `switch_type` 默认为 `voluntary`，当通知模块检测到切换前有通知到达时（时间窗口 < 3 秒），标记为 `notification`。

### 9.4 衍生指标（二期 AI 消费）


| 衍生指标       | 计算方式                                            | 价值                   |
| ---------- | ----------------------------------------------- | -------------------- |
| **切换频率**   | 每小时 app_switches 条数                             | 注意力碎片化程度             |
| **高频切换对**  | GROUP BY (from_app, to_app) ORDER BY count DESC | 识别工作流模式（如 IDE ↔ 浏览器） |
| **打断恢复成本** | 被 notification 切走后，返回原 App 的时间                  | 量化通知的注意力代价           |
| **深度工作识别** | 连续 >30 分钟无 app_switch                           | 标记为深度工作段             |
| **碎片化指数**  | 5 分钟内 >5 次不同 App 切换                             | 注意力涣散预警              |


---

## 10. 模块八：通知打断记录（Notification Tracker）

### 10.1 功能定义

记录系统通知的元数据（来源 App、到达时间），并关联用户的响应行为（是否点击、响应延迟），构建**打断者排行榜**。

### 10.2 采集字段

每条系统通知到达时，写入 `notifications` 表：


| 字段                       | 类型      | 说明                                  |
| ------------------------ | ------- | ----------------------------------- |
| `id`                     | TEXT    | UUID                                |
| `timestamp_ms`           | INTEGER | 通知到达时刻                              |
| `source_app`             | TEXT    | 发送通知的应用名                            |
| `source_bundle_id`       | TEXT    | 发送通知的 Bundle ID                     |
| `current_foreground_app` | TEXT    | 通知到达时用户正在使用的前台应用                    |
| `user_responded`         | INTEGER | 用户是否响应了通知（0/1）                      |
| `response_delay_ms`      | INTEGER | 从通知到达到用户切换到通知来源 App 的时长（NULL = 未响应） |
| `caused_switch`          | INTEGER | 该通知是否导致了 App 切换（0/1）                |


### 10.3 技术实现

- macOS 上通过 Accessibility API 监听通知中心的变化，或使用 `NSWorkspace.didActivateApplicationNotification` 配合时间窗口推断。
- **方案 A（推荐）**：通过 `DistributedNotificationCenter` 监听 `com.apple.notificationcenterui` 的通知事件。
- **方案 B（备选）**：通过 Accessibility API 检测通知横幅的出现（`AXUIElement` 监听 `AXNotificationCenter`）。
- **响应判断**：通知到达后 3 秒内发生了 `app_switch` 且 `to_app` 与 `source_app` 一致，则判定为 `user_responded = 1`，`caused_switch = 1`。
- 若通知到达后用户在 30 秒内切换到了通知来源 App（但不在 3 秒内），则 `user_responded = 1`，`caused_switch = 0`（延迟响应）。

### 10.4 衍生分析（二期 AI 消费）

- **打断者排行榜**：按 `source_app` 聚合统计每日通知数量、响应率、平均响应延迟。
- **打断成本量化**："Slack 今天打断了你 23 次，其中 15 次导致了 App 切换，平均每次分心 4 分 12 秒"。
- **深度工作保护建议**：识别在深度工作段中频繁打断的 App，建议用户开启勿扰模式。

### 10.5 可配置参数


| 参数                                        | 默认值   | 说明              |
| ----------------------------------------- | ----- | --------------- |
| `notification.enabled`                    | true  | 是否启用通知打断记录      |
| `notification.response_window_ms`         | 3000  | 判定"通知触发切换"的时间窗口 |
| `notification.delayed_response_window_ms` | 30000 | 判定"延迟响应"的时间窗口   |


---

## 11. 模块九：环境与设备感知（Ambient Context Engine）

### 11.1 功能定义

利用 macOS 系统 API 感知用户的**物理工作环境与设备状态**，为用户的行为数据增加"场景维度"。这些低频数据本身不大，但对二期 AI 生成场景化报告极为关键。

### 11.2 采集字段

每 **30 秒** 采集一次环境快照，写入 `ambient_context` 表：


| 字段                      | 类型      | 说明                          | 数据来源                                              |
| ----------------------- | ------- | --------------------------- | ------------------------------------------------- |
| `id`                    | TEXT    | UUID                        | 系统生成                                              |
| `timestamp_ms`          | INTEGER | 采集时刻                        | SystemTime                                        |
| `wifi_ssid`             | TEXT    | 当前 WiFi 网络名称（NULL = 未连接/有线） | `CWWiFiClient` (CoreWLAN)                         |
| `display_count`         | INTEGER | 当前连接的显示器数量                  | `NSScreen.screens.count`                          |
| `is_external_display`   | INTEGER | 是否连接了外接显示器（0/1）             | 比较 NSScreen 分辨率                                   |
| `battery_level`         | REAL    | 电池电量百分比（0-100，NULL = 台式机）   | `IOPowerSources`                                  |
| `is_charging`           | INTEGER | 是否在充电（0/1）                  | `IOPowerSources`                                  |
| `is_camera_active`      | INTEGER | 摄像头是否在使用（0/1）               | `CMIOObjectGetPropertyData` 或检查 `VDCAssistant` 进程 |
| `is_audio_input_active` | INTEGER | 麦克风是否在使用（0/1）               | CoreAudio `AudioDeviceGetProperty`                |
| `is_dnd_enabled`        | INTEGER | 勿扰模式/专注模式是否开启（0/1）          | `NSDoNotDisturbEnabled` 或 Focus API               |
| `screen_brightness`     | REAL    | 屏幕亮度（0-1）                   | `IODisplayConnect`                                |
| `active_space_index`    | INTEGER | 当前所在的虚拟桌面编号                 | `CGSGetActiveSpace` (Private API) 或 Accessibility |


### 11.3 技术实现

- 环境数据采集在独立线程中运行，轮询频率为 **每 30 秒一次**（低频，几乎零性能开销）。
- WiFi SSID 获取需要 Location Services 权限（macOS 12+），若权限未授予则该字段为 NULL，不阻塞其他采集。
- 摄像头状态可通过检查 `VDCAssistant` 或 `AppleCameraAssistant` 进程是否存在来间接判断（无需额外权限）。
- 勿扰模式检测在 macOS Ventura+ 通过 Focus API 获取，旧版本通过 `defaults read` 读取 NotificationCenter 配置。
- `active_space_index` 涉及 Private API（`CGSGetActiveSpace`），需评估 App Store 审核风险。若不上 App Store，可直接使用；否则降级为不采集。

### 11.4 场景推断（二期 AI 消费）

通过环境数据组合，二期 AI 可自动推断工作场景：


| 环境信号组合                    | 推断场景       |
| ------------------------- | ---------- |
| WiFi="公司网络" + 外接显示器 + 充电中 | **办公室工位**  |
| WiFi="家庭网络" + 无外接屏 + 电池供电 | **在家移动办公** |
| 摄像头活跃 + 麦克风活跃 + 音频输出      | **视频会议中**  |
| 勿扰模式开启 + 单窗口全屏 + 高 KPM    | **深度专注工作** |
| 无 WiFi + 电池供电 + 低亮度       | **外出/通勤**  |


### 11.5 可配置参数


| 参数                            | 默认值   | 说明                         |
| ----------------------------- | ----- | -------------------------- |
| `ambient.enabled`             | true  | 是否启用环境感知采集                 |
| `ambient.poll_interval_secs`  | 30    | 环境数据采集频率（秒）                |
| `ambient.collect_wifi_ssid`   | true  | 是否采集 WiFi 名称（需要定位权限）       |
| `ambient.collect_space_index` | false | 是否采集虚拟桌面编号（使用 Private API） |


---

## 12. 模块十：文件系统管理（FS Engine）

### 12.1 目录结构

```
~/.timelens/
├── data/
│   ├── db.sqlite                          # 时序数据库
│   ├── db.sqlite-wal                      # WAL 日志
│   └── shots/                             # 截图根目录
│       ├── 2026-03-26/                    # 按日期分区
│       │   ├── a1b2c3d4_event_driven.webp
│       │   ├── e5f6g7h8_poll_driven.webp
│       │   └── ...
│       └── 2026-03-25/
│           └── ...
├── logs/                                  # 应用日志（P1）
│   └── timelens.log
└── config/                                # 备用配置目录（P1）
```

### 12.2 文件命名规范

截图文件命名格式：`{uuid}_{trigger_type}.webp`

- `uuid`：标准 UUID v4，保证唯一性。
- `trigger_type`：`event_driven` / `poll_driven` / `manual`，便于文件级别的快速识别。

### 12.3 存储空间监控

提供以下查询能力（通过 Tauri Command 暴露给前端）：


| 查询                  | 返回值                                                                                             | 说明       |
| ------------------- | ----------------------------------------------------------------------------------------------- | -------- |
| `get_storage_stats` | `{ db_size_bytes, total_shots_bytes, shots_count, shots_by_date: [{date, count, size_bytes}] }` | 整体存储概况   |
| `get_data_dir_path` | `string`                                                                                        | 数据目录绝对路径 |


### 12.4 数据清理（P1）

- **raw_events 归档**：超过 `storage.raw_events_retention_days`（默认 7 天）的 raw_events 自动删除，仅保留 window_sessions。
- **截图清理**：支持按日期范围手动删除截图（需二次确认）。
- **清理前提示**：展示将要释放的空间大小。

---

## 13. 模块十一：配置与控制中心（Settings & Control）

### 13.1 系统托盘（已有，保持）

后台常驻系统托盘，提供：

- `Open Dashboard`：打开开发者校验看板
- `Start/Pause Tracking`：启动/暂停数据采集
- `Quit TimeLens`：退出应用

### 13.2 权限检测（已有，增强）

启动时自动检测 macOS 权限：

- **辅助功能权限**（Accessibility）：用于获取窗口标题、输入行为监听。
- **屏幕录制权限**（Screen Recording）：用于截图。
- **定位服务权限**（Location Services）：用于获取 WiFi SSID（可选，环境感知模块需要）。
- 权限缺失时自动打开系统偏好设置并引导用户授权。

### 13.3 可配置参数汇总

所有运行时参数存储在 `settings` 表中，支持通过 Tauri Command 读写：


| 参数键                                       | 默认值        | 说明               |
| ----------------------------------------- | ---------- | ---------------- |
| `tracker.poll_interval_secs`              | 2          | Tracker 轮询间隔（秒）  |
| `tracker.afk_threshold_secs`              | 240        | AFK 判定阈值（秒）      |
| `tracker.debounce_ms`                     | 500        | 微抖动过滤阈值（毫秒）      |
| `capture.periodic_interval_secs`          | 15         | 轮询截图间隔（秒）        |
| `capture.target_resolution`               | "1440x900" | 截图目标分辨率          |
| `capture.webp_quality`                    | 75         | WebP 编码质量（0-100） |
| `capture.dedup_enabled`                   | true       | 是否启用截图去重         |
| `capture.dedup_hamming_threshold`         | 5          | 去重汉明距离阈值         |
| `capture.multi_monitor`                   | false      | 是否截取多显示器         |
| `input.enabled`                           | true       | 是否启用输入行为采集       |
| `input.aggregation_interval_secs`         | 5          | 输入行为聚合窗口时长（秒）    |
| `clipboard.enabled`                       | true       | 是否启用剪贴板流向追踪      |
| `notification.enabled`                    | true       | 是否启用通知打断记录       |
| `notification.response_window_ms`         | 3000       | 判定"通知触发切换"的时间窗口  |
| `notification.delayed_response_window_ms` | 30000      | 判定"延迟响应"的时间窗口    |
| `ambient.enabled`                         | true       | 是否启用环境感知采集       |
| `ambient.poll_interval_secs`              | 30         | 环境数据采集频率（秒）      |
| `ambient.collect_wifi_ssid`               | true       | 是否采集 WiFi 名称     |
| `ambient.collect_space_index`             | false      | 是否采集虚拟桌面编号       |
| `storage.raw_events_retention_days`       | 7          | raw_events 保留天数  |


---

## 14. 模块十二：Tauri IPC 接口定义（Commands & Events）

### 14.1 Tauri Commands（前端 → 后端）


| Command                    | 参数                                          | 返回值                                                    | 说明                |
| -------------------------- | ------------------------------------------- | ------------------------------------------------------ | ----------------- |
| **采集控制**                   |                                             |                                                        |                   |
| `start_tracking`           | 无                                           | `()`                                                   | 启动全部采集引擎          |
| `stop_tracking`            | 无                                           | `()`                                                   | 暂停全部采集引擎          |
| `is_tracking`              | 无                                           | `bool`                                                 | 查询采集状态            |
| `trigger_screenshot`       | 无                                           | `()`                                                   | 手动触发截图            |
| `check_permissions`        | 无                                           | `{ accessibility, screenRecording, locationServices }` | 查询系统权限状态          |
| `restart_tracking`         | 无                                           | `bool`                                                 | 重新检查权限并启动         |
| **Session 查询**             |                                             |                                                        |                   |
| `get_sessions`             | `{ date, app_name?, intent?, time_block? }` | `Vec<WindowSession>`                                   | 按条件查询 Session 列表  |
| `get_session_snapshots`    | `{ session_id }`                            | `Vec<Snapshot>`                                        | 获取某 Session 的截图   |
| `get_activity_stats`       | `{ date? }`                                 | `ActivityStats`                                        | 获取活动统计概况          |
| `get_all_app_meta`         | 无                                           | `Vec<AppMeta>`                                         | 获取所有应用元数据         |
| **差异化数据查询**                |                                             |                                                        |                   |
| `get_input_metrics`        | `{ date, session_id? }`                     | `Vec<InputMetric>`                                     | 获取输入行为指标          |
| `get_clipboard_flows`      | `{ date, limit? }`                          | `Vec<ClipboardFlow>`                                   | 获取剪贴板流向记录         |
| `get_clipboard_flow_graph` | `{ date }`                                  | `Vec<FlowEdge>`                                        | 获取剪贴板流动有向图（聚合后）   |
| `get_app_switches`         | `{ date, limit? }`                          | `Vec<AppSwitch>`                                       | 获取 App 切换记录       |
| `get_switch_graph`         | `{ date }`                                  | `Vec<SwitchEdge>`                                      | 获取切换有向图（聚合后）      |
| `get_notifications`        | `{ date, source_app? }`                     | `Vec<Notification>`                                    | 获取通知打断记录          |
| `get_notification_stats`   | `{ date }`                                  | `Vec<NotificationAppStat>`                             | 获取通知打断排行榜         |
| `get_ambient_context`      | `{ date, limit? }`                          | `Vec<AmbientContext>`                                  | 获取环境感知快照          |
| **配置管理**                   |                                             |                                                        |                   |
| `get_settings`             | 无                                           | `HashMap<String,String>`                               | 获取全部配置            |
| `set_setting`              | `{ key, value }`                            | `()`                                                   | 设置单个配置项           |
| `get_intent_mappings`      | 无                                           | `Vec<IntentMapping>`                                   | 获取 Intent 映射规则    |
| `upsert_intent_mapping`    | `IntentMapping`                             | `()`                                                   | 新增/更新映射规则         |
| `delete_intent_mapping`    | `{ id }`                                    | `()`                                                   | 删除映射规则            |
| **存储管理**                   |                                             |                                                        |                   |
| `get_storage_stats`        | 无                                           | `StorageStats`                                         | 获取存储空间统计          |
| `open_data_dir`            | 无                                           | `()`                                                   | 在 Finder 中打开数据目录  |
| `get_raw_events_recent`    | `{ limit }`                                 | `Vec<RawEvent>`                                        | 获取最近 N 条原始事件（调试用） |


### 14.2 Tauri Events（后端 → 前端，实时推送）


| Event                     | Payload                                                                                 | 说明                         |
| ------------------------- | --------------------------------------------------------------------------------------- | -------------------------- |
| `window_event_updated`    | `WindowSession`                                                                         | 新 Session 创建或已有 Session 更新 |
| `new_snapshot_saved`      | `{ session_id, snapshot_id, file_path, captured_at_ms, file_size_bytes, trigger_type }` | 新截图保存完成                    |
| `tracking_state_changed`  | `{ is_running: bool }`                                                                  | 采集状态变化                     |
| `permissions_required`    | `{ accessibility, screenRecording, locationServices }`                                  | 权限缺失通知                     |
| `afk_state_changed`       | `{ is_afk: bool, idle_seconds: f64 }`                                                   | AFK 状态切换                   |
| `input_metrics_updated`   | `InputMetric`                                                                           | 新的输入行为指标产生（每 5 秒）          |
| `clipboard_flow_recorded` | `ClipboardFlow`                                                                         | 新的剪贴板流向事件                  |
| `app_switch_recorded`     | `AppSwitch`                                                                             | 新的 App 切换事件                |
| `notification_received`   | `Notification`                                                                          | 新的系统通知到达                   |
| `ambient_context_updated` | `AmbientContext`                                                                        | 环境状态快照更新（每 30 秒）           |


---

## 15. 模块十三：开发者校验看板（最小化前端）

### 15.1 定位

一期前端的唯一目的是让开发者验证数据底座是否正常工作。不追求美观，不追求交互体验，只追求**信息完整、数据准确**。

### 15.2 页面结构

一期只有**一个页面**，采用 **Tab 切换**分为两个视图：

#### Tab 1：核心数据校验（默认）

```
┌─────────────────────────────────────────────────────────────┐
│ ① 状态栏：采集状态 | 今日事件/截图/切换/通知数 | 存储占用    │
├─────────────────────────────────────────────────────────────┤
│                           │                                 │
│  ② 实时事件流             │  ③ 最新截图预览                   │
│  （最近 50 条 Session）    │  （最近 1 张截图 + 元数据）       │
│  - 时间 | App | 标题      │  - 截图大图                      │
│  - 时长 | Intent | 状态   │  - 文件大小 / 分辨率 / 触发类型   │
│  - 点击选中 → 右侧联动    │  - 对应 Session 信息              │
│                           │                                 │
├─────────────────────────────────────────────────────────────┤
│ ④ 底部工具栏：                                               │
│  [直通黑盒] [手动截图] [启动/暂停采集] [配置面板]              │
│  "100% 本地存储 · 无外部网络请求"                              │
└─────────────────────────────────────────────────────────────┘
```

#### Tab 2：差异化数据校验

```
┌─────────────────────────────────────────────────────────────┐
│ ⑤ 输入行为实时仪表                                           │
│   当前 KPM | 退格率 | 快捷键/分钟 | 心流/挣扎状态指示         │
├──────────────────────────┬──────────────────────────────────┤
│ ⑥ 剪贴板流向最近记录      │ ⑦ App 切换最近记录               │
│  Copy/Paste | App | 类型  │  From → To | 停留时长 | 类型     │
│  内容长度 | flow_pair_id  │  voluntary / notification        │
├──────────────────────────┴──────────────────────────────────┤
│ ⑧ 环境状态 & 通知打断                                        │
│  WiFi | 显示器 | 电池 | 摄像头 | 勿扰 │ 最近 N 条通知记录    │
└─────────────────────────────────────────────────────────────┘
```

#### ① 状态栏

- 采集运行状态指示灯（绿色运行 / 黄色暂停 / 红色异常）
- 今日关键计数：Session 数、截图数、App 切换次数、通知打断次数
- 数据库大小、截图总占用
- 当前 AFK 状态（活跃/离开）
- 各采集引擎运行状态指示（Tracker / Capture / Input / Clipboard / Notification / Ambient）

#### ② 实时事件流

- 展示最近的 `window_sessions` 记录，最新在上。
- 每条记录包含：起止时间、持续时长、应用名 + 图标、窗口标题、Intent 标签。
- 支持点击选中，选中后右侧截图区联动展示该 Session 的截图。
- 实时监听 `window_event_updated` 事件，自动追加新记录。

#### ③ 最新截图预览

- 默认展示最新一张截图的大图预览。
- 下方展示元数据：文件大小、分辨率、格式、触发类型、截取时间。
- 当左侧事件流中选中某条 Session 时，切换为该 Session 关联的截图。
- 若该 Session 有多张截图，以缩略图列表展示，点击切换主预览。

#### ④ 底部工具栏

- **直通黑盒**：一键在 Finder 中打开 `~/.timelens/data/` 目录。
- **手动截图**：触发一次手动截图。
- **启动/暂停采集**：切换 Tracker 运行状态。
- **配置面板**：弹出配置抽屉，可修改所有 `settings` 表中的参数（包含新增的差异化模块开关）。
- 底部固定安全标语：`100% 本地存储 · 无外部网络请求`。

#### ⑤ 输入行为实时仪表

- 展示最近一个聚合窗口的输入行为指标：KPM、退格率、快捷键频率。
- 简易状态标签：根据当前指标组合显示"心流中" / "正常" / "可能卡壳" / "空闲"。
- 实时监听 `input_metrics_updated` 事件更新。

#### ⑥ 剪贴板流向最近记录

- 展示最近 20 条 `clipboard_flows` 记录。
- 每条包含：时间、动作（Copy/Paste）、App 名、内容类型、内容长度、flow_pair_id。
- 同一 pair_id 的 Copy-Paste 配对用相同颜色标记，直观展示流向。

#### ⑦ App 切换最近记录

- 展示最近 20 条 `app_switches` 记录。
- 每条包含：时间、From App → To App、离开前停留时长、切换类型。
- `notification` 类型的切换用醒目颜色标记。

#### ⑧ 环境状态 & 通知打断

- 环境状态：展示最新一条 `ambient_context` 的全部字段值（WiFi、显示器、电池、摄像头、勿扰等）。
- 通知打断：展示最近 10 条 `notifications` 记录，包含来源 App、是否响应、响应延迟。

### 15.3 前端技术要求

- 使用 `react-virtuoso` 处理长列表，保证大数据量下的渲染性能。
- 使用 `Zustand` 管理全局状态。
- 截图通过 `timelens://` 自定义协议加载。
- 所有数据通过 Tauri IPC 获取，不引入任何外部 HTTP 请求。

---

## 16. 完整数据库 Schema

汇总一期全部 12 张数据表：

```sql
-- ════════════════════════════════════════════════════════════
-- 表 1: raw_events — Tracker 原始宽表（只追加）
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS raw_events (
    id                  TEXT PRIMARY KEY,
    timestamp_ms        INTEGER NOT NULL,
    app_name            TEXT NOT NULL,
    bundle_id           TEXT,
    window_title        TEXT NOT NULL,
    extracted_url       TEXT,
    extracted_file_path TEXT,
    idle_seconds        REAL    DEFAULT 0,
    is_fullscreen       INTEGER DEFAULT 0,
    is_audio_playing    INTEGER DEFAULT 0,
    state_hash          TEXT,
    trigger_type        TEXT    NOT NULL,
    created_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_raw_events_ts      ON raw_events(timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_raw_events_app     ON raw_events(app_name);
CREATE INDEX IF NOT EXISTS idx_raw_events_trigger ON raw_events(trigger_type);


-- ════════════════════════════════════════════════════════════
-- 表 2: window_sessions — 聚合后的连续使用会话
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS window_sessions (
    id                  TEXT PRIMARY KEY,
    start_ms            INTEGER NOT NULL,
    end_ms              INTEGER NOT NULL,
    duration_ms         INTEGER NOT NULL,
    app_name            TEXT NOT NULL,
    bundle_id           TEXT,
    window_title        TEXT NOT NULL,
    extracted_url       TEXT,
    extracted_file_path TEXT,
    intent              TEXT,
    raw_event_count     INTEGER DEFAULT 0,
    is_active           INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_sessions_start  ON window_sessions(start_ms);
CREATE INDEX IF NOT EXISTS idx_sessions_app    ON window_sessions(app_name);
CREATE INDEX IF NOT EXISTS idx_sessions_intent ON window_sessions(intent);


-- ════════════════════════════════════════════════════════════
-- 表 3: snapshots — 截图元数据
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS snapshots (
    id                  TEXT PRIMARY KEY,
    session_id          TEXT NOT NULL,
    file_path           TEXT NOT NULL,
    captured_at_ms      INTEGER NOT NULL,
    file_size_bytes     INTEGER NOT NULL DEFAULT 0,
    trigger_type        TEXT NOT NULL,
    resolution          TEXT,
    format              TEXT DEFAULT 'webp',
    perceptual_hash     TEXT,
    FOREIGN KEY (session_id) REFERENCES window_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_snapshots_session ON snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_time    ON snapshots(captured_at_ms);


-- ════════════════════════════════════════════════════════════
-- 表 4: app_meta — 应用元数据缓存
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS app_meta (
    app_name            TEXT PRIMARY KEY,
    bundle_id           TEXT,
    icon_base64         TEXT,
    category            TEXT,
    first_seen_ms       INTEGER,
    last_seen_ms        INTEGER
);


-- ════════════════════════════════════════════════════════════
-- 表 5: intent_mapping — 意图分类映射规则
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS intent_mapping (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    match_pattern       TEXT NOT NULL,
    match_field         TEXT NOT NULL DEFAULT 'app_name',
    intent              TEXT NOT NULL,
    priority            INTEGER DEFAULT 0,
    is_builtin          INTEGER DEFAULT 0
);


-- ════════════════════════════════════════════════════════════
-- 表 6: input_metrics — 输入行为聚合指标（每 5 秒一条）
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS input_metrics (
    id                       TEXT PRIMARY KEY,
    timestamp_ms             INTEGER NOT NULL,
    session_id               TEXT,
    window_interval_secs     REAL    NOT NULL,
    keystrokes_count         INTEGER DEFAULT 0,
    kpm                      REAL    DEFAULT 0,
    delete_count             INTEGER DEFAULT 0,
    delete_ratio             REAL    DEFAULT 0,
    shortcut_count           INTEGER DEFAULT 0,
    copy_count               INTEGER DEFAULT 0,
    paste_count              INTEGER DEFAULT 0,
    undo_count               INTEGER DEFAULT 0,
    mouse_click_count        INTEGER DEFAULT 0,
    mouse_distance_px        REAL    DEFAULT 0,
    scroll_delta_total       REAL    DEFAULT 0,
    scroll_direction_changes INTEGER DEFAULT 0,
    typing_burst_count       INTEGER DEFAULT 0,
    longest_pause_ms         INTEGER DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES window_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_input_metrics_ts      ON input_metrics(timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_input_metrics_session ON input_metrics(session_id);


-- ════════════════════════════════════════════════════════════
-- 表 7: clipboard_flows — 剪贴板流向记录
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS clipboard_flows (
    id                  TEXT PRIMARY KEY,
    timestamp_ms        INTEGER NOT NULL,
    action              TEXT NOT NULL,          -- 'copy' | 'paste'
    app_name            TEXT NOT NULL,
    bundle_id           TEXT,
    content_type        TEXT,                   -- plain_text / rich_text / url / image / file_ref / code_snippet / other
    content_length      INTEGER DEFAULT 0,
    flow_pair_id        TEXT                    -- 将 copy-paste 配对关联
);
CREATE INDEX IF NOT EXISTS idx_clipboard_ts   ON clipboard_flows(timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_clipboard_pair ON clipboard_flows(flow_pair_id);
CREATE INDEX IF NOT EXISTS idx_clipboard_app  ON clipboard_flows(app_name);


-- ════════════════════════════════════════════════════════════
-- 表 8: app_switches — App 切换有向图原始记录
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS app_switches (
    id                       TEXT PRIMARY KEY,
    timestamp_ms             INTEGER NOT NULL,
    from_app                 TEXT NOT NULL,
    from_bundle_id           TEXT,
    from_window_title        TEXT,
    to_app                   TEXT NOT NULL,
    to_bundle_id             TEXT,
    to_window_title          TEXT,
    from_session_duration_ms INTEGER DEFAULT 0,
    switch_type              TEXT DEFAULT 'voluntary'   -- 'voluntary' | 'notification'
);
CREATE INDEX IF NOT EXISTS idx_switches_ts       ON app_switches(timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_switches_from_app ON app_switches(from_app);
CREATE INDEX IF NOT EXISTS idx_switches_to_app   ON app_switches(to_app);


-- ════════════════════════════════════════════════════════════
-- 表 9: notifications — 系统通知打断记录
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notifications (
    id                       TEXT PRIMARY KEY,
    timestamp_ms             INTEGER NOT NULL,
    source_app               TEXT NOT NULL,
    source_bundle_id         TEXT,
    current_foreground_app   TEXT,
    user_responded           INTEGER DEFAULT 0,
    response_delay_ms        INTEGER,
    caused_switch            INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_notif_ts         ON notifications(timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_notif_source_app ON notifications(source_app);


-- ════════════════════════════════════════════════════════════
-- 表 10: ambient_context — 环境与设备状态快照（每 30 秒一条）
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ambient_context (
    id                       TEXT PRIMARY KEY,
    timestamp_ms             INTEGER NOT NULL,
    wifi_ssid                TEXT,
    display_count            INTEGER DEFAULT 1,
    is_external_display      INTEGER DEFAULT 0,
    battery_level            REAL,
    is_charging              INTEGER,
    is_camera_active         INTEGER DEFAULT 0,
    is_audio_input_active    INTEGER DEFAULT 0,
    is_dnd_enabled           INTEGER DEFAULT 0,
    screen_brightness        REAL,
    active_space_index       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ambient_ts ON ambient_context(timestamp_ms);


-- ════════════════════════════════════════════════════════════
-- 表 11: settings — 系统配置键值对
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS settings (
    key                 TEXT PRIMARY KEY,
    value               TEXT NOT NULL,
    updated_at          INTEGER
);


-- ════════════════════════════════════════════════════════════
-- 表 12: schema_migrations — 数据库版本管理
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS schema_migrations (
    version             INTEGER PRIMARY KEY,
    description         TEXT,
    applied_at          INTEGER NOT NULL
);
```

---

## 17. 数据流全景图

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              macOS 操作系统                                       │
│  NSWorkspace / AXUIElement / CoreGraphics / CoreAudio / CGEventTap              │
│  NSPasteboard / CoreWLAN / IOPowerSources / DistributedNotificationCenter       │
└────┬──────────┬──────────┬──────────┬──────────┬──────────┬─────────────────────┘
     │          │          │          │          │          │
     ▼          ▼          ▼          ▼          ▼          ▼
┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐
│ Tracker ││ Capture ││ Input   ││Clipboard││ Notif   ││ Ambient │
│ Engine  ││ Engine  ││ Dynamics││ Flow    ││ Tracker ││ Context │
│ (2s)    ││(signal) ││ (5s)    ││(event)  ││(event)  ││ (30s)   │
└──┬──────┘└──┬──────┘└──┬──────┘└──┬──────┘└──┬──────┘└──┬──────┘
   │          │          │          │          │          │
   ▼          ▼          ▼          ▼          ▼          ▼
┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐
│  raw_   ││snapshots││ input_  ││clipboard││notifi-  ││ ambient │
│  events ││ + 文件  ││ metrics ││ _flows  ││cations  ││_context │
└──┬──────┘└─────────┘└─────────┘└─────────┘└────┬────┘└─────────┘
   │                                              │
   │  折叠聚合                    联动标记 switch_type
   ▼                                              │
┌──────────────┐         ┌──────────────┐         │
│   window_    │◄────────│ app_switches │◄────────┘
│   sessions   │  关联    │  (有向图)     │
└──────┬───────┘         └──────────────┘
       │
       │  Tauri IPC (Commands + Events)
       ▼
┌──────────────────────────────────────┐
│       开发者校验看板 (React)           │
│  Tab1: 事件流 + 截图                  │
│  Tab2: 输入行为 + 剪贴板 + 切换 +     │
│        通知 + 环境状态                 │
└──────────────────────────────────────┘
```

**数据量预估（每日）**：


| 数据表             | 频率     | 预估日增条数            | 预估日增大小                      |
| --------------- | ------ | ----------------- | --------------------------- |
| raw_events      | 每 2 秒  | ~28,800 条（8 小时工作） | ~5 MB                       |
| window_sessions | 按窗口变化  | ~200-500 条        | ~100 KB                     |
| snapshots       | 事件+轮询  | ~300-800 条        | 元数据 ~200 KB，图片文件 ~50-200 MB |
| input_metrics   | 每 5 秒  | ~5,760 条          | ~2 MB                       |
| clipboard_flows | 按操作触发  | ~50-200 条         | ~20 KB                      |
| app_switches    | 按切换触发  | ~200-500 条        | ~100 KB                     |
| notifications   | 按通知到达  | ~50-300 条         | ~30 KB                      |
| ambient_context | 每 30 秒 | ~960 条            | ~100 KB                     |


**总计**：数据库日增约 ~8 MB，截图文件日增约 ~50-200 MB。一个月约 2-6 GB，可控。

---

## 18. 与现有代码的差异对照

以下是本 PRD 与当前代码实现的主要差异点，即一期重构需要改动的部分：


| 维度        | 现有实现                                                       | 本 PRD 要求                                                                                                                                                                               | 改动量        |
| --------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 数据表       | 4 张（window_events + event_snapshots + settings + app_meta） | 12 张（新增 raw_events, window_sessions, input_metrics, clipboard_flows, app_switches, notifications, ambient_context, intent_mapping, schema_migrations；重构 snapshots, app_meta, settings） | **大改**     |
| 窗口信息      | app_name + window_title                                    | 新增 bundle_id + extracted_url + extracted_file_path                                                                                                                                     | **中改**     |
| 系统探针      | 仅 idle_time                                                | 新增 is_fullscreen + is_audio_playing                                                                                                                                                    | **新增**     |
| 采集模型      | 直接写 window_events                                          | 先写 raw_events → 聚合为 window_sessions                                                                                                                                                    | **重构**     |
| 防抖机制      | 简单对比 last_app/last_title                                   | state_hash + debounce_ms 配置                                                                                                                                                            | **中改**     |
| 截图流水线     | screencapture → 原图转 WebP                                   | 新增分辨率缩放 + 质量可配 + 文件命名规范                                                                                                                                                                | **中改**     |
| 截图去重      | 无                                                          | pHash 感知哈希去重                                                                                                                                                                           | **新增（P1）** |
| Intent 映射 | 硬编码 `map_app_to_intent` 函数                                 | 数据库 intent_mapping 表 + 通配符匹配                                                                                                                                                           | **重构**     |
| 输入行为采集    | 无                                                          | CGEventTap 全局监听 → input_metrics 表                                                                                                                                                      | **全新模块**   |
| 剪贴板流向     | 无                                                          | NSPasteboard 监听 + Cmd+V 检测 → clipboard_flows 表                                                                                                                                         | **全新模块**   |
| 上下文切换图谱   | 无（数据隐含在窗口切换中）                                              | 独立 app_switches 表 + 有向图查询                                                                                                                                                              | **全新模块**   |
| 通知打断记录    | 无                                                          | DistributedNotificationCenter 监听 → notifications 表                                                                                                                                     | **全新模块**   |
| 环境设备感知    | 无                                                          | CoreWLAN + IOPower + NSScreen 等 → ambient_context 表                                                                                                                                    | **全新模块**   |
| 配置管理      | 仅 settings 表，几乎未使用                                         | 全参数可配（20+ 参数）+ 前端配置面板                                                                                                                                                                  | **中改**     |
| Schema 迁移 | 无                                                          | schema_migrations 版本管理                                                                                                                                                                 | **新增**     |
| 存储监控      | 无                                                          | get_storage_stats 接口                                                                                                                                                                   | **新增**     |
| 前端        | 两个完整页面（Overview + Developer）                               | 精简为单页双 Tab 校验看板                                                                                                                                                                        | **简化重构**   |


---

## 19. 一期里程碑拆解

建议按以下顺序推进，每个里程碑可独立验证：


| 阶段      | 里程碑        | 交付物                                             | 验收标准                                        |
| ------- | ---------- | ----------------------------------------------- | ------------------------------------------- |
| **M1**  | 数据库重构      | 12 张表 Schema + 迁移机制 + Rust 数据模型定义               | 建库成功，migration 正确执行，旧数据兼容                   |
| **M2**  | Tracker 增强 | 宽表采集 + bundle_id + URL/路径提取 + 防抖 + state_hash   | raw_events 中数据字段完整，防抖有效，URL/路径正确解析          |
| **M3**  | 聚合管道       | Session 折叠 + Intent 标注（intent_mapping 表）        | window_sessions 正确折叠，Intent 自动匹配，AFK 间隙正确处理 |
| **M4**  | 截图引擎增强     | 分辨率缩放 + 质量可配 + 文件命名规范 + 触发类型标记                  | 截图文件符合命名规范，体积可控，元数据完整                       |
| **M5**  | 输入行为引擎     | CGEventTap 监听 + 5 秒聚合 + input_metrics 入库        | KPM/退格率/快捷键频率等指标正确采集，不记录具体按键                |
| **M6**  | 剪贴板流向引擎    | NSPasteboard 监听 + Cmd+V 检测 + clipboard_flows 入库 | Copy/Paste 事件正确记录，flow_pair_id 配对准确，不记录内容   |
| **M7**  | 上下文切换引擎    | app_switches 记录 + switch_type 标注                | 切换记录完整，from/to 正确，notification 类型联动标注       |
| **M8**  | 通知打断引擎     | 系统通知监听 + notifications 入库 + 响应判断                | 通知到达正确记录，响应判断逻辑准确                           |
| **M9**  | 环境感知引擎     | WiFi/显示器/电池/摄像头/勿扰等采集 + ambient_context 入库      | 30 秒轮询稳定，各字段正确采集，权限缺失不阻塞                    |
| **M10** | 配置中心       | settings 全参数读写（20+ 参数）+ Intent 映射 CRUD          | 修改配置后各引擎行为实时生效，引擎开关正常                       |
| **M11** | 校验看板       | 单页双 Tab 前端 + 所有数据维度的校验展示                        | 全部数据正确展示，实时推送正常，Tab 切换流畅                    |
| **M12** | 存储治理       | 空间监控 + raw_events 归档 + 手动清理                     | 存储统计准确，过期数据清理有效，数据量预估符合预期                   |


**建议并行策略**：M5/M6/M7/M8/M9 五个差异化引擎互相独立，可由不同开发者并行推进，无依赖关系。但均依赖 M1（Schema）完成。

---

## 20. 演进说明

本一期数据底座完成后：

- **二期**：在 12 张表构成的多维数据底座上，引入多模态大模型：
  - 消费 `raw_events` + `window_sessions` + `snapshots` 生成工作意图转译
  - 消费 `input_metrics` 生成心流/疲劳分析
  - 消费 `clipboard_flows` 生成信息流动洞察
  - 消费 `app_switches` + `notifications` 生成注意力管理建议
  - 消费 `ambient_context` 生成场景化日报/周报
- **三期**：建设面向普通用户的精美可视化界面（正常模式），包含时间轴、统计图表、行为洞察、信息流动图等。

**一期做的不是一个 App，而是一个数据引擎。底座的深度和广度直接决定上层智能的上限。**