# PRD：十一期 — 智能提醒与专注守护（V11）

**版本**：v1.0 · 2026-04-22
**上游基准**：`prd/PRD_十期_AI对话助手.md`
**关联实现**：桌面端 Tauri + React（`project/`）
**关联架构**：`rule/TimeLens_TechArch_V2.md`、`rule/TimeLens_TechArch_Phase2_截图增强.md`
**遵循规范**：`prd/TimeLens_产品迭代规范.md`（v3.1-ultra）

---

## 1. 背景与问题（PRD_BACKGROUND）

一至十期已完整覆盖 TimeLens 的「采集 → 浏览 → 分析 → 导出 → AI 问答」闭环。但产品形态仍是**被动回顾型**——用户必须主动打开应用才能获得价值。

实际使用中暴露出三个问题：

- 「不打开就没有反馈」：长时间专注或长时间分心时，TimeLens 不会任何提示，等到用户晚上打开复盘才发现，**纠偏机会已经错过**
- 「没有触达机制」：每日洞察、状态摘要等优秀内容只在用户主动进入助手页时才能看到，触达率低
- 「缺少正向引导工具」：除了被动观察，TimeLens 没有提供任何"主动专注"的工具，无法和番茄钟、Forest 等专注类工具形成功能互补

**本期要做的是把 TimeLens 从「事后复盘工具」升级为「实时专注伙伴」**——通过系统级通知主动触达用户，并提供轻量的专注模式让用户能主动设定专注目标。

---

## 2. 本迭代使命（PRD_MISSION）

| 阶段 | 本迭代聚焦 |
|------|------------|
| 一至十期 | 数据底座、AI 洞察、多端壳、Windows 性能、i18n、多 AI、周报、导出、AI 助手（已完成） |
| **十一期** | **智能提醒系统 + 每日摘要推送 + 专注模式：从被动回顾升级为实时专注伙伴** |

---

## 3. 用户与场景（PRD_USERS）

### 3.1 核心用户画像

- **专注追求型用户**：希望工作时保持长时段专注，但容易陷入「以为自己在专注，其实切了 8 次窗口」的状态
- **健康意识型用户**：长时间伏案工作，需要定时提醒休息
- **主动复盘型用户**：希望每天工作结束自动收到一条简短摘要，不需要打开应用

### 3.2 主路径场景

**场景 A（智能提醒）**：用户连续在 IDE 里工作 50 分钟，TimeLens 推送系统通知「连续工作 50 分钟，建议起身活动 5 分钟」，用户得到健康提醒。

**场景 B（碎片化预警）**：下午 3 点用户开始浏览各种页面，5 分钟内切换应用 12 次，TimeLens 推送「检测到注意力分散（5 分钟内切换 12 次），可考虑关闭通知专注一段」。

**场景 C（每日摘要推送）**：每天 18:00，用户收到系统通知「今日活跃 6.2h，深度工作 3.1h，心流评分 72，Top 3：Cursor / Chrome / Slack」，点击通知打开 TimeLens 主窗口，看到完整 TodayLens。

**场景 D（专注模式）**：用户准备开始一项重要任务，从托盘菜单或 TodayLens 点击「专注 25 分钟」，开始专注计时；25 分钟后弹出系统通知「专注完成，主要使用 Cursor，期间无中断」，并在 TodayLens 留下专注记录。

### 3.3 边界

- 本期不做闹钟级提醒（不发声、不全屏）；通知保持系统通知中心默认行为
- 本期不做强制专注（不阻断切换、不黑屏）；专注模式仅提供计时和记录
- 不做团队协作、不做日历集成、不做任务管理
- 通知文案双语，跟随界面语言；本期不做语音提醒

---

## 4. 功能与能力清单（PRD_SCOPE）

### 4.1 P0（本迭代必达）

| 能力 | 说明 |
|------|------|
| 智能提醒引擎 | 后台 10s 轮询，按规则判定是否触发提醒；规则失败/AFK 状态下不打扰 |
| 久坐提醒 | 连续工作超过阈值（默认 45 分钟，可配置 15-120），推送系统通知；同一用户 10 分钟冷却 |
| 碎片化预警 | 滑动窗口（默认 5 分钟）内 app_switches 超过阈值（默认 8 次），推送预警；5 分钟冷却 |
| 每日摘要推送 | 每天指定时间（默认 18:00，可配置）从 daily_analysis 读取摘要，发送系统通知；点击打开主窗口 |
| 专注模式启动 | 从托盘菜单或 TodayLens 启动 25/45/60 分钟专注；DB 持久化（focus_sessions） |
| 专注模式计时 | 后台计时，到点自动完成；记录实际时长、期间应用统计 |
| 专注模式终止 | 支持手动结束（提前完成）和取消（不计入） |
| 专注历史展示 | TodayLens 页面展示今日已完成的专注会话列表 |
| 设置面板 | SettingsForm 新增「智能提醒」section，所有阈值/开关/时间均可配置 |
| 总开关降级 | 「智能提醒」总开关关闭时，所有提醒和摘要不发送（专注模式不受影响） |
| 跨重启恢复 | App 重启后若有未完成的专注 session，自动判定：已超时则补完成；未超时则继续计时 |
| 双语 i18n | 所有新增 UI 文案、通知文案、托盘项支持中英双语 |

### 4.2 P1（可并入本期）

| 能力 | 说明 |
|------|------|
| 深度工作标记 | 同一应用持续 > 25 分钟（可配置）触发提示「进入深度工作」（可关闭） |
| nudge_log 历史 | 所有触发的提醒入库 nudge_log，便于后续分析（本期不展示 UI） |

### 4.3 明确不做（本迭代）

| 项目 | 说明 |
|------|------|
| 强制专注（阻断/黑屏） | 不做 |
| 任务管理 / 番茄钟链 | 不做，专注模式仅单次计时 |
| 系统级勿扰联动 | 不调用系统 DND API（macOS Focus / Windows Focus Assist） |
| 提醒声音 / 全屏 | 沿用系统通知默认行为 |
| 提醒规则的自定义条件构建器 | 仅提供预设规则的阈值调节 |
| 推送到 iPhone / Apple Watch / Android | 仅本机系统通知 |

---

## 5. 约束与依赖（PRD_CONSTRAINTS）

### 5.1 技术约束

- 通知能力依赖原生 API：macOS 通过已有 `objc2-user-notifications`，Windows 通过已有 `windows` crate toast；不引入新 Tauri 插件
- 提醒线程必须独立运行，不阻塞 tracker / aggregation / writer
- 通知仅在 `tracking == true` 且 `is_afk == false` 时触发；专注模式期间也只在前台活跃时计算时间
- 跨平台一致性：macOS / Windows 都需可用；Linux 暂不支持（继续沿袭项目策略）

### 5.2 架构落点（ARCH_P0）

- 新模块 `core::nudge`：提醒引擎主线程
- 新表 `focus_sessions`、`nudge_log`：迁移版本 7
- `WriteEvent` 新增 `FocusSession` / `NudgeLog` variant，写入走现有 writer
- `AppStateInner` 新增 `nudge_enabled`、`focus_active` 两个 AtomicBool
- 8 个新 Tauri 命令：`get/set_nudge_settings`、`get/set_digest_settings`、`start/stop_focus_session`、`get_active_focus_session`、`get_focus_history`
- 6 个新 Tauri 事件：`nudge_rest`、`nudge_fragmentation`、`nudge_deep_work`、`nudge_daily_digest`、`focus_session_started`、`focus_session_ended`

### 5.3 隐私约束

- 通知正文仅包含聚合数值（时长、评分、应用名 Top 3）；不含窗口标题、URL、OCR 内容
- nudge_log 中 payload_json 仅记录触发条件值（如「连续工作 50 分钟」），不含上下文
- 总开关默认开启，但用户可在设置页一键关闭

---

## 6. 数据定义（DICT）

### 6.1 `focus_sessions` 表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | UUID |
| `start_ms` | INTEGER | 开始时间戳 |
| `end_ms` | INTEGER | 结束时间戳（NULL = 进行中） |
| `planned_duration_min` | INTEGER | 计划时长（25/45/60 等） |
| `actual_duration_ms` | INTEGER | 实际时长（结束后计算） |
| `status` | TEXT | `active` / `completed` / `cancelled` |
| `summary_json` | TEXT | 完成后的统计 JSON（top_apps、switches） |
| `created_at` | INTEGER | 记录创建时间戳 |

索引：`start_ms`、`status`

### 6.2 `nudge_log` 表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | UUID |
| `timestamp_ms` | INTEGER | 触发时间戳 |
| `nudge_type` | TEXT | `rest_reminder` / `fragmentation_alert` / `deep_work_marker` / `daily_digest` |
| `payload_json` | TEXT | 触发上下文（JSON） |
| `dismissed` | INTEGER | 用户是否手动关闭（保留字段，本期固定 0） |

索引：`timestamp_ms`

### 6.3 设置项默认值

| Key | 默认值 | 范围 |
|-----|--------|------|
| `nudge_enabled` | `1` | bool |
| `nudge_rest_minutes` | `45` | 15–120 |
| `nudge_frag_threshold` | `8` | 3–20 |
| `nudge_frag_window_min` | `5` | 3–15 |
| `nudge_deep_work_minutes` | `25` | 10–60 |
| `nudge_deep_work_dnd` | `0` | bool |
| `digest_enabled` | `1` | bool |
| `digest_time` | `18:00` | HH:MM |

---

## 7. 方案摘要（实现约束）

### 7.1 后端（Rust）

1. **数据库迁移 v7**：新增 `focus_sessions` 与 `nudge_log` 表，幂等。
2. **`core::nudge::spawn_nudge_thread(...)`**：10s 轮询；维护 `continuous_work_start_ms`、各类提醒冷却时间戳、focus 计时器。
3. **原生通知封装** `send_notification(title, body, click_target)`：
   - macOS：`objc2-user-notifications`
   - Windows：`windows` crate toast
4. **每日摘要触发**：比对 `Local::now().format("%H:%M")` 与 `digest_time`，匹配则查询 `daily_analysis`（若不存在则触发生成），构造摘要文本。
5. **专注 session 管理**：
   - 开始时写入 `focus_sessions(status='active')`，置 `focus_mode_active` 设置
   - 完成 / 取消时更新 `status` 与 `actual_duration_ms`、`summary_json`
   - App 启动时检查 `focus_mode_active`：若有 active 行，比对 `start_ms + planned_duration_min*60000 vs now`，超时则补完成

### 7.2 前端（React）

1. **设置页新增 section**：`SettingsForm.tsx` 新增「智能提醒」区域；调用 `get/set_nudge_settings`、`get/set_digest_settings`。
2. **TodayLens 新增 FocusPanel**：嵌入在 poster card 之后，无活跃 session 显示 25/45/60 启动按钮，活跃则显示倒计时和停止按钮，下方列出今日已完成专注。
3. **App 全局监听**：监听 `nudge_*` / `focus_session_*` 事件，刷新对应数据。
4. **i18n**：所有新增文案双语；通知正文由后端按当前 `language` 设置生成。

---

## 8. 验收要点（PRD_ACCEPTANCE）

### 8.1 验收口径（P0）

1. **久坐提醒**：将阈值临时改为 1 分钟，连续工作 1 分钟后收到系统通知「连续工作 N 分钟…」。
2. **碎片化预警**：将阈值改为 3 次/1 分钟，1 分钟内切换 4 个应用后收到预警通知。
3. **每日摘要**：将摘要时间改为 1 分钟内，到点收到系统通知，正文包含活跃时长、Top 3 应用。
4. **专注启动**：从托盘点击「专注 25 分钟」，TodayLens 显示倒计时；DB 中 `focus_sessions` 新增一行 `status='active'`。
5. **专注完成**：等待计时结束，收到系统通知「专注完成…」，DB 中 `status='completed'` 且 `actual_duration_ms` > 0。
6. **专注取消**：手动取消，`status='cancelled'`。
7. **跨重启恢复**：在专注期间杀掉 App 重启，App 启动后能正确恢复或补完成。
8. **总开关降级**：`nudge_enabled = false` 时，无任何提醒/摘要发送，但专注模式照常工作。
9. **AFK 不打扰**：用户离开（is_afk）期间不发任何提醒。
10. **设置项持久化**：所有阈值/开关/时间在重启后保留。
11. **i18n**：切换语言后，设置页文案、通知正文均切换。
12. **无回归**：日报、周报、AI 助手、设置、时间线等已有页面功能正常；`cargo test` 与 `npm run build` 通过。

### 8.2 性能要求

| 指标 | 目标 |
|------|------|
| 提醒线程 CPU 占用 | 空闲 < 1%，触发时 < 5%（10s 轮询） |
| 通知延迟 | 触发条件满足后 ≤ 15s 内发出 |
| 设置面板加载 | < 200ms |
| FocusPanel 倒计时刷新 | 1Hz，无卡顿 |

---

## 9. 验收（Given / When / Then 摘要）

1. **Given** 已开启智能提醒，连续工作 50 分钟，**When** 提醒线程下一次轮询，**Then** 收到系统通知「连续工作 50 分钟…」并写入 nudge_log。
2. **Given** 5 分钟内切换 12 个应用，**When** 提醒线程轮询命中，**Then** 收到碎片化预警通知。
3. **Given** 当日 daily_analysis 已生成，**When** 系统时间到达 digest_time，**Then** 收到摘要通知，正文包含活跃时长 / 深度工作 / Top3 应用。
4. **Given** 用户从托盘点击「专注 25 分钟」，**When** 选择该项，**Then** TodayLens 显示倒计时，托盘项变为「结束专注」可点击。
5. **Given** 处于活跃专注，**When** 25 分钟到期，**Then** 收到完成通知，DB 状态变 completed，TodayLens 增加一条历史。
6. **Given** 处于活跃专注，**When** 用户点击「取消」，**Then** session 状态变 cancelled，不写入完成统计。
7. **Given** App 在专注期间被强制退出且重启，**When** 启动完成，**Then** 自动判定继续计时或补完成，不留下永久 active 状态。
8. **Given** 总开关关闭，**When** 任意提醒触发条件满足，**Then** 无通知发出。
9. **Given** 用户处于 AFK，**When** 提醒条件满足，**Then** 无通知发出。

---

## 10. 降级策略（PRD_DEGRADE）

| 失败模式 | 降级行为 |
|---------|---------|
| 系统未授权通知权限 | 提醒线程仍跑、仍写 nudge_log，仅跳过原生通知；设置页给出「请在系统设置授予通知权限」提示 |
| 当日 daily_analysis 未生成 | 摘要时刻临时调用 `generate_daily_analysis` 生成；若仍失败，通知降级为「今日数据生成中，请稍后查看」 |
| 专注 summary 计算失败 | 仍标记 completed，summary_json 写入 `{"error":"..."}`，通知正文降级为「专注完成」 |
| 跨平台不支持 | Linux 等无通知能力的平台，提醒线程不启动；设置页隐藏相关 section |

---

## 11. 已知限制

- 提醒以 10s 为最小粒度，触发延迟最坏 ~15s；非闹钟/截止类用途，可接受
- 每日摘要依赖系统时钟；用户切换时区可能造成当日错位
- 专注模式不阻断切换；用户主动切换其他应用不会自动取消，仅记入 summary
- 不调用系统 DND API；与系统勿扰是两套独立机制

---

## 12. 关联文档

- 上游 PRD：`prd/PRD_十期_AI对话助手.md`
- 架构主文：`rule/TimeLens_TechArch_V2.md`
- 迭代规范：`prd/TimeLens_产品迭代规范.md`

---

## 13. 修订记录

| 版本 | 日期 | 摘要 |
|------|------|------|
| v1.0 | 2026-04-22 | 初版：智能提醒（久坐/碎片化/深度工作）+ 每日摘要推送 + 专注模式（启动/计时/恢复） |
