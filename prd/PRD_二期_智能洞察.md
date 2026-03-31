# TimeLens 二期产品设计文档 — 日终复盘与分析引擎（Phase 2 PRD）

> **版本**：v3.1  
> **日期**：2026-03-31  
> **定位**：二期的唯一使命是**让用户每天能看到一份可信的工作复盘**。以「日终复盘报告」为核心交付物，建立本地分析引擎（非 AI 基线 + 可选 AI 增强），同时补齐一期未完成的差异化采集引擎，使数据管道真正完整。  
> **上游基准**：`PRD_一期_数据底座.md` v4.0；一期技术架构 `rule/TimeLens_TechArch_V2.md` v2.2；**二期增量架构** `rule/TimeLens_TechArch_Phase2.md` v1.0（在 v2.2 之上扩展分析、报告、AI 与采集补齐，不推翻一期决策）  
> **配套文档**：`二期_分析指标字典.md` v1.0（指标精确定义与 SQL 参考）、`二期_里程碑与验收计划.md` v1.0（Given/When/Then 验收）、`二期_产品研发任务计划表.md` v1.0（工作包、依赖与执行顺序）  
> **版本替代**：v3.0 起取代 v2.1 及更早二期草案；v3.1 为文档口径与目标用户修订（详见文末修订记录）

---

## 〇、战略定位：三期各做什么

| 阶段 | 一句话使命 | 核心交付物 | 不做 |
| --- | --- | --- | --- |
| **一期** | 搭建采得全、存得稳的本地数据底座 | 12 张表 + 6 大采集引擎 + 开发者校验看板 | AI、分析、面向普通用户的 UI |
| **二期** | **让用户每天能看到一份可信的工作复盘** | **日终复盘报告** + 本地分析引擎 + 可选 AI 叙事 + 最小可用 UI | 精美可视化、复杂动效、多端适配 |
| **三期** | 让用户用得爽、看得美、连得上 | 深度 UI/UX + 时间轴交互 + 云同步 + 工具链集成 | 不替代二期已定的分析语义与数据契约 |

**基调**：二期让用户**信数据、看懂分析、每天有收获**；三期让用户**用得爽、看得美**。

### 〇.1 目标用户与验收主体

| 类别 | 说明 |
| --- | --- |
| **主目标用户** | 以 **macOS 为主要工作机**、希望**如实了解并改善自己在电脑上的时间与注意力**的知识工作者（研发、产品、设计、研究/写作、数据分析等）；能接受安装本地客户端、完成**系统权限授权**，并理解数据默认留在本机。 |
| **二期验收所服务的主体** | **非开发者终端用户**：无需阅读 SQL、无需改源码或脚本即可完成主路径——查看日终复盘、生成/刷新分析、导出报告、在会话列表中查看截图、使用纠错入口（Intent / 应用黑名单）。与「最小可用 UI」及 `二期_里程碑与验收计划` 中 Given/When/Then 一致。 |
| **次要用户** | 开发者与技术种子用户：可使用健康度面板、核对采集与指标；**不替代**上述主路径验收，其反馈用于阈值与降级策略校准。 |
| **非目标用户** | 团队监控下属、纯 Web/移动端、无 Mac 客户端等场景；与 §6.3「不做」一致。 |

---

## 一、二期唯一主线

### 1.1 一句话

**交付一份用户每天都想看的工作复盘报告**——数据来自本地，数字可溯源，AI 只增强不编造，关掉 AI 照样好用。

### 1.2 核心需求（北极星）

| 需求 | 用户语言 | 二期如何满足 |
| --- | --- | --- |
| **可见** | "今天 8 小时到底干了什么？" | 日终复盘报告：时间分布、应用占比、深度工作段 |
| **可信** | "这些数据是真的吗？" | 每个数字可追溯到原始 SQL 查询，非 AI 基线保底 |
| **可叙述** | "帮我总结，我看不懂图表" | 模板化事实摘要（非 AI）+ 自然语言叙事（AI opt-in） |
| **可找回** | "下午三点看的那篇文章叫什么？" | 会话/截图时间对齐，点击跳转 |
| **可校准** | "这个分类不对" | 纠错入口：修正 intent、标记黑名单应用 |

### 1.3 三件核心事情

```
事情 1：补齐数据管道（前置条件）
  一期遗留的差异化引擎 → 数据健康度仪表盘
              ↓ 数据就绪
事情 2：建立本地分析引擎 + 日终复盘报告（核心价值）
  精确指标定义 → 聚合 Job → 结构化报告 → 导出
              ↓ 基线完成
事情 3：AI 叙事层 + 最小可用 UI + 纠错（体验闭环）
  opt-in AI → 叙事增强 → 用户可用界面 → 反馈纠正
```

下面逐一展开。

---

## 二、事情 1：补齐数据管道（M0 前置条件）

### 2.1 问题陈述

一期 PRD 定义了 12 张表和 6 大采集引擎；一期架构（`TimeLens_TechArch_V2.md` v2.2）将部分引擎划为「P1 可选」或「延后」，二期在 `TimeLens_TechArch_Phase2.md` 中补齐与扩展：

| 引擎 | 一期架构定位 | 数据表 | 当前状态 |
| --- | --- | --- | --- |
| Tracker Engine | P0 核心 | `raw_events` | 已实现 |
| Capture Engine | P0 核心 | `snapshots` | 已实现 |
| Aggregation Pipeline | P0 核心 | `window_sessions` | 已实现 |
| Input Dynamics Engine | **P1 可选** | `input_metrics` | **需验证** |
| Clipboard Flow Engine | **P1 可选** | `clipboard_flows` | **需验证** |
| Context Switch Engine | 隐含在 Tracker 中 | `app_switches` | **需验证** |
| Notification Tracker | **延后** | `notifications` | **未实现** |
| Ambient Context Engine | **延后** | `ambient_context` | **未实现** |

### 2.2 二期前置任务

| 任务 | 说明 | 验收标准 |
| --- | --- | --- |
| **审计一期交付** | 逐表检查：表是否存在、是否有数据、数据是否合理 | 每张表出具「状态报告」：已就绪 / 有数据但异常 / 空表 / 未建表 |
| **补齐 P1 引擎** | Input Dynamics + Clipboard Flow + Context Switch，若一期未完成则补齐 | 对应表持续产生数据，且与 `window_sessions` 时间对齐 |
| **实现延后引擎** | Notification Tracker + Ambient Context | 对应表持续产生数据；权限缺失时优雅降级而非崩溃 |
| **采集健康度** | 新增 Command `get_pipeline_health`，返回各引擎运行状态、最近数据时间戳、异常计数 | 前端可展示 6 个引擎的绿/黄/红状态 |

### 2.3 降级策略

二期分析引擎对每个数据源的依赖采用**可选消费**模式：

| 数据源 | 如果缺失 | 报告中的表现 |
| --- | --- | --- |
| `window_sessions` | **致命**，分析不可运行 | 阻断：提示"请先确保采集引擎正常运行" |
| `app_switches` | 切换分析降级 | 章节标注"切换数据不可用"，跳过相关指标 |
| `input_metrics` | 输入节奏分析降级 | 章节标注"输入行为数据不可用" |
| `clipboard_flows` | 剪贴板分析降级 | 章节标注"剪贴板数据不可用" |
| `notifications` | 打断分析降级 | 章节标注"通知数据不可用，仅基于切换推断打断" |
| `ambient_context` | 环境上下文降级 | 章节标注"环境数据不可用" |
| `snapshots` | 截图回溯降级 | 时间轴无缩略图，仅文字会话列表 |

---

## 三、事情 2：本地分析引擎 + 日终复盘报告（核心价值）

### 3.1 架构概述

```
 ┌─────────────────────────────────────────────────────┐
 │              一期数据表（12 张表）                       │
 │  raw_events · window_sessions · snapshots · ...      │
 └─────────────┬───────────────────────────────────────┘
               │ SQL 查询
 ┌─────────────▼───────────────────────────────────────┐
 │         聚合引擎（Aggregation Engine）                  │
 │  按日/按小时窗口聚合 → 写入 daily_analysis 表           │
 │  增量模式：仅处理上次聚合后的新数据                       │
 └─────────────┬───────────────────────────────────────┘
               │ 结构化分析结果
 ┌─────────────▼───────────────────────────────────────┐
 │         报告生成器（Report Generator）                   │
 │  非 AI 路径：模板 + 数字 → Markdown/HTML                │
 │  AI 路径（opt-in）：聚合摘要 → LLM → 叙事增强           │
 └─────────────┬───────────────────────────────────────┘
               │ 报告内容
 ┌─────────────▼───────────────────────────────────────┐
 │         呈现 + 导出                                     │
 │  应用内 UI · Markdown 文件 · HTML 文件                  │
 └─────────────────────────────────────────────────────┘
```

### 3.2 核心指标体系（精确定义）

以下按**指标组 A–F**列出计算公式、数据来源与阈值。**当期实现范围以 §6.1 / §6.2 为准**：**P0** 为指标组 **A–D**；**E、F** 为 **P1**（见 §6.2），避免将本文公式表误读为「当期全部必做」。

#### 指标组 A：时间分布（数据源：`window_sessions`）

| 指标 | 计算公式 | 说明 |
| --- | --- | --- |
| **各 Intent 总时长** | `SUM(duration_ms) WHERE intent = ? AND date(start_ms) = ?` | 按"编码开发""研究检索""通讯沟通"等分类汇总 |
| **各 Intent 占比** | `intent_duration / total_active_duration * 100` | 百分比，保留一位小数 |
| **Top 5 应用时长** | `SUM(duration_ms) GROUP BY app_name ORDER BY SUM DESC LIMIT 5` | 按应用名聚合 |
| **总活跃时长** | `SUM(duration_ms) WHERE date(start_ms) = ?`（排除 AFK） | 不含 idle 时间 |
| **未分类时长** | `SUM(duration_ms) WHERE intent IS NULL` | 需要用户手动归类或完善 intent_mapping |

#### 指标组 B：注意力与切换（数据源：`app_switches` + `window_sessions`）

| 指标 | 计算公式 | 阈值/分档 | 说明 |
| --- | --- | --- | --- |
| **每小时切换次数** | `COUNT(*) FROM app_switches WHERE hour = ? GROUP BY hour` | ≤8 低 / 9–20 中 / >20 高 | 注意力碎片化程度 |
| **Top 5 切换对** | `COUNT(*) GROUP BY (from_app, to_app) ORDER BY count DESC LIMIT 5` | — | 识别高频工作流 |
| **深度工作段** | 连续无 `app_switch` 的时间窗口，且窗口内 `window_sessions` 的 intent 不变 | ≥30 分钟为一个深度段 | 标记深度工作起止时间 |
| **深度工作总时长** | `SUM(深度段时长)` | — | 关键输出指标 |
| **碎片化指数** | 滑动 5 分钟窗口内出现 ≥3 个不同 `to_app` 的窗口占比 | >30% 为高碎片 | `碎片窗口数 / 总窗口数 * 100` |

#### 指标组 C：打断分析（数据源：`notifications` + `app_switches`）

| 指标 | 计算公式 | 说明 |
| --- | --- | --- |
| **打断者排行** | `COUNT(*) FROM notifications GROUP BY source_app ORDER BY count DESC` | 通知来源应用 Top 5 |
| **有效打断率** | `SUM(caused_switch) / COUNT(*) * 100 WHERE source_app = ?` | 该应用通知导致切换的比例 |
| **平均响应延迟** | `AVG(response_delay_ms) WHERE user_responded = 1 AND source_app = ?` | 毫秒，展示时转为"X 分 Y 秒" |
| **打断恢复成本** | 被 notification 类型切换打断后，返回 `from_app` 的时间差 | 从 `app_switches` 中匹配返回事件 |
| **深度工作中打断数** | 深度工作段内收到的 `notifications` 条数 | 用于评估深度工作保护度 |

> **降级**：若 `notifications` 表不可用，仅基于 `app_switches` 中 `switch_type = 'notification'` 的记录做近似分析，并在报告中标注"仅基于切换推断"。

#### 指标组 D：输入节奏（数据源：`input_metrics`）

| 指标 | 计算公式 | 阈值/分档 | 说明 |
| --- | --- | --- | --- |
| **小时 KPM 均值** | `AVG(kpm) WHERE hour(timestamp_ms) = ?` | — | 按小时展示趋势 |
| **日均 KPM** | `AVG(kpm) WHERE date(timestamp_ms) = ?` | — | 当天整体输入强度 |
| **退格率** | `AVG(delete_ratio) WHERE date = ?` | ≤0.05 低 / 0.05–0.15 中 / >0.15 高 | 高退格率可能暗示犹豫或困难 |
| **心流评分** | 见下方公式 | 0–100 分 | 综合衍生指标 |
| **挣扎评分** | 见下方公式 | 0–100 分 | 综合衍生指标 |

**心流评分计算公式**：

```
flow_score = (
    normalize(kpm, 0, 120)         * 0.30   // KPM 越高越好，120 为满分线
  + (1 - normalize(delete_ratio, 0, 0.3)) * 0.20   // 退格率越低越好
  + normalize(burst_duration_avg, 0, 60)   * 0.25   // 平均 burst 持续时长（秒），越长越好
  + normalize(session_duration, 0, 3600)   * 0.25   // 当前 session 持续时长（秒），越长越好
) * 100

normalize(value, min, max) = clamp((value - min) / (max - min), 0, 1)
```

**挣扎评分计算公式**：

```
struggle_score = (
    normalize(delete_ratio, 0, 0.3)        * 0.30   // 退格率越高越挣扎
  + normalize(undo_count_per_min, 0, 5)    * 0.20   // 每分钟撤销次数
  + (1 - normalize(burst_duration_avg, 0, 60)) * 0.25 // burst 越短越挣扎
  + normalize(longest_pause_ms, 0, 30000)  * 0.25   // 最长停顿越长越挣扎
) * 100
```

> **降级**：若 `input_metrics` 表不可用，心流/挣扎评分不计算，对应章节标注"输入行为数据不可用"。

#### 指标组 E：信息流向（数据源：`clipboard_flows`）

| 指标 | 计算公式 | 说明 |
| --- | --- | --- |
| **Top 5 流向边** | `COUNT(*) GROUP BY (copy_app, paste_app) ORDER BY count DESC LIMIT 5`（通过 `flow_pair_id` 配对 copy/paste 的 `app_name`） | 信息从哪来、到哪去 |
| **总搬运次数** | `COUNT(DISTINCT flow_pair_id) WHERE date = ?` | 一天完成了多少次复制-粘贴 |
| **内容类型分布** | `COUNT(*) GROUP BY content_type WHERE action = 'copy'` | 文本 / URL / 代码 / 图片的占比 |

#### 指标组 F：环境上下文（数据源：`ambient_context`）

| 指标 | 推断逻辑 | 说明 |
| --- | --- | --- |
| **工作场景识别** | WiFi="固定SSID" + 外接屏 → "办公室"；无外接屏 + 电池 → "移动办公"；摄像头+麦克风活跃 → "会议中" | 每 30 分钟一个场景标签 |
| **场景时长分布** | `SUM(时段) GROUP BY 推断场景` | 今天在哪些场景下工作了多久 |
| **勿扰模式时长** | `SUM(时段) WHERE is_dnd_enabled = 1` | 主动保护注意力的时间 |

> **降级**：若 `ambient_context` 表不可用，环境上下文章节整体跳过。

### 3.3 分析结果数据模型

聚合结果需要持久化，以支持历史查看、周对比和重新生成。新增 2 张表：

```sql
-- ════════════════════════════════════════════════════════════
-- 表 13: daily_analysis — 每日分析结果（每天一条）
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS daily_analysis (
    id                  TEXT PRIMARY KEY,      -- UUID
    analysis_date       TEXT NOT NULL UNIQUE,   -- 'YYYY-MM-DD'
    generated_at_ms     INTEGER NOT NULL,       -- 分析生成时刻
    version             INTEGER NOT NULL DEFAULT 1,  -- 分析版本号（支持重新生成）

    -- 指标组 A：时间分布
    total_active_ms     INTEGER,               -- 总活跃时长
    intent_breakdown    TEXT,                   -- JSON: {"编码开发": 7200000, "研究检索": 3600000, ...}
    top_apps            TEXT,                   -- JSON: [{"app": "Cursor", "ms": 5400000}, ...]

    -- 指标组 B：注意力与切换
    total_switches      INTEGER,               -- 总切换次数
    switches_per_hour   TEXT,                   -- JSON: {"09": 12, "10": 8, ...}
    top_switch_pairs    TEXT,                   -- JSON: [{"from": "Cursor", "to": "Chrome", "count": 23}, ...]
    deep_work_segments  TEXT,                   -- JSON: [{"start_ms": ..., "end_ms": ..., "duration_ms": ..., "intent": "编码开发"}, ...]
    deep_work_total_ms  INTEGER,               -- 深度工作总时长
    fragmentation_pct   REAL,                  -- 碎片化指数 (0-100)

    -- 指标组 C：打断
    notification_count  INTEGER,               -- 总通知数
    top_interrupters    TEXT,                   -- JSON: [{"app": "微信", "count": 23, "switch_rate": 65.2}, ...]
    interrupts_in_deep  INTEGER,               -- 深度工作中的打断数

    -- 指标组 D：输入节奏
    avg_kpm             REAL,                  -- 日均 KPM
    kpm_by_hour         TEXT,                  -- JSON: {"09": 45.2, "10": 38.1, ...}
    avg_delete_ratio    REAL,                  -- 日均退格率
    flow_score_avg      REAL,                  -- 日均心流评分 (0-100)
    struggle_score_avg  REAL,                  -- 日均挣扎评分 (0-100)

    -- 指标组 E：信息流向
    clipboard_pairs     INTEGER,               -- 总搬运次数
    top_flows           TEXT,                  -- JSON: [{"from": "Chrome", "to": "Cursor", "count": 47}, ...]

    -- 指标组 F：环境
    scene_breakdown     TEXT,                  -- JSON: {"办公室": 18000000, "会议中": 3600000, ...}

    -- 元数据
    data_sources        TEXT,                  -- JSON: {"window_sessions": true, "app_switches": true, "notifications": false, ...}
    degraded_sections   TEXT                   -- JSON: ["notifications", "ambient_context"]（降级的章节列表）
);
CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_analysis(analysis_date);


-- ════════════════════════════════════════════════════════════
-- 表 14: daily_reports — 生成的报告内容
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS daily_reports (
    id                  TEXT PRIMARY KEY,      -- UUID
    analysis_id         TEXT NOT NULL,          -- 关联 daily_analysis.id
    report_date         TEXT NOT NULL,          -- 'YYYY-MM-DD'
    generated_at_ms     INTEGER NOT NULL,
    report_type         TEXT NOT NULL,          -- 'fact_only' | 'ai_enhanced'
    content_md          TEXT NOT NULL,          -- 完整 Markdown 报告内容
    content_html        TEXT,                  -- 可选的 HTML 渲染版
    ai_model            TEXT,                  -- 使用的 AI 模型名（若为 fact_only 则 NULL）
    ai_prompt_hash      TEXT,                  -- AI prompt 的哈希值（用于重现）
    FOREIGN KEY (analysis_id) REFERENCES daily_analysis(id)
);
CREATE INDEX IF NOT EXISTS idx_reports_date ON daily_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_reports_analysis ON daily_reports(analysis_id);
```

### 3.4 日终复盘报告结构（固定章节）

报告采用固定章节顺序，每个章节包含**事实层**（必有）和**表达层**（AI opt-in）。

```markdown
# 📋 TimeLens 日终复盘 · {YYYY-MM-DD}（{星期}）

## 1. 今日总览
- 总活跃时长：X 小时 Y 分钟
- 深度工作：X 小时 Y 分钟（占比 Z%）
- 应用切换：N 次（每小时均 M 次）
- 碎片化指数：X%（低/中/高）
> [AI 总结] 一段 2-3 句的自然语言总览（仅 AI 模式）

## 2. 时间去向
| 分类 | 时长 | 占比 | Top 应用 |
| --- | --- | --- | --- |
| 编码开发 | 3h 24m | 42.5% | Cursor, Terminal |
| 研究检索 | 1h 48m | 22.5% | Chrome, Arc |
| ...
> [AI 解读] 对时间分布的简短解读（仅 AI 模式）

## 3. 注意力与切换
- Top 切换对：Cursor ↔ Chrome（23 次）、...
- 深度工作段：10:15–11:42（编码开发，87 分钟）、...
- 高碎片时段：14:00–14:30（5 分钟内切换 8 次）
> [AI 解读]（仅 AI 模式）

## 4. 打断分析
- 打断者 Top 3：微信（23 次，65% 导致切换）、Slack（12 次）、...
- 深度工作中的打断：N 次
- 平均恢复时长：X 分 Y 秒
> [AI 解读]（仅 AI 模式）
> ⚠️ 若通知数据不可用：「本章节仅基于应用切换推断，未启用通知采集」

## 5. 输入节奏
- 日均 KPM：X（趋势：上午高/下午低）
- 心流评分：X/100 · 挣扎评分：Y/100
- 退格率：Z%
- KPM 趋势图（按小时文本表格）
> [AI 解读]（仅 AI 模式）

## 6. 信息流向
- 今日搬运 N 次
- Top 流向：Chrome → Cursor（47 次）、...
> [AI 解读]（仅 AI 模式）

## 7. 环境上下文
- 场景分布：办公室 5h、会议中 1.5h、移动办公 1.5h
- 勿扰模式时长：X 分钟
> [AI 解读]（仅 AI 模式）

---
> 报告生成时间：{timestamp} · 数据来源：本地 · AI 模型：{model_name|"未启用"}
> 降级说明：{列出不可用的数据源}
```

### 3.5 聚合 Job 运行策略

| 策略 | 说明 |
| --- | --- |
| **触发方式** | (1) 每日定时：可配置时间点（默认 22:00）自动触发；(2) 手动：用户在 UI 中点击"生成今日复盘" |
| **增量计算** | `daily_analysis` 表记录 `generated_at_ms`，重新生成时覆盖同一 `analysis_date` 的记录（`version` +1） |
| **性能预期** | 单日数据量约 3 万条 raw_events + 6000 条 input_metrics，全量聚合应在 5 秒内完成（SQLite + 索引） |
| **后台执行** | 聚合在独立线程中运行，不阻塞 UI；开始和完成时通过 Tauri Event 通知前端 |

### 3.6 新增 IPC 接口

| Command | 参数 | 返回值 | 说明 |
| --- | --- | --- | --- |
| `generate_daily_analysis` | `{ date: "YYYY-MM-DD" }` | `DailyAnalysis` | 触发指定日期的聚合分析 |
| `get_daily_analysis` | `{ date: "YYYY-MM-DD" }` | `DailyAnalysis \| null` | 获取已有的分析结果 |
| `generate_daily_report` | `{ date, with_ai: bool }` | `DailyReport` | 基于分析结果生成报告 |
| `get_daily_report` | `{ date, type?: "fact_only" \| "ai_enhanced" }` | `DailyReport \| null` | 获取已生成的报告 |
| `export_report` | `{ date, format: "md" \| "html" }` | `string`（文件路径） | 导出报告到文件 |
| `get_pipeline_health` | 无 | `PipelineHealth` | 各引擎运行状态 |
| `get_deep_work_segments` | `{ date }` | `Vec<DeepWorkSegment>` | 获取深度工作段列表 |

| Event | Payload | 说明 |
| --- | --- | --- |
| `analysis_started` | `{ date }` | 聚合开始 |
| `analysis_completed` | `{ date, duration_ms }` | 聚合完成 |
| `report_generated` | `{ date, type }` | 报告生成完成 |

---

## 四、事情 3：AI 叙事层 + 最小可用 UI + 纠错

### 4.1 AI 分析轨（增强层，非基线）

#### 架构原则

| 原则 | 说明 |
| --- | --- |
| **增强不替代** | AI 只消费非 AI 聚合结果，不直接读取原始表；所有数字来自 `daily_analysis`，AI 不可修改 |
| **默认关闭** | AI 功能需用户在设置中显式开启；首次开启弹出隐私说明 |
| **BYOK** | Bring Your Own Key——用户自行配置 API Key 和模型；应用不内置任何 key |
| **可下钻** | AI 生成的叙事中每个数字带锚点 `[→ 事实层]`，点击可跳转到对应的非 AI 数据 |

#### 输入约束（隐私红线）

| 允许出境 | 禁止出境 |
| --- | --- |
| `daily_analysis` 中的聚合数字 | `raw_events` 全表 |
| Intent 分类名、应用名 | 窗口标题全文（仅允许脱敏后的应用名部分） |
| 用户显式允许的截图帧（经黑名单过滤） | 剪贴板正文、按键内容 |
| 报告章节结构 | 密码、URL 参数中的 token |

#### AI Prompt 策略

每次 AI 调用使用固定的 system prompt + 结构化的聚合数据 JSON，不做开放式对话：

```
[System] 你是 TimeLens 日终复盘助手。基于以下结构化分析数据生成自然语言总结。
规则：
1. 所有数字必须直接引用提供的数据，不可编造
2. 使用客观陈述，避免主观判断和强因果结论
3. 如果某章节标注为降级，明确说明数据不完整
4. 每个数字后附锚点标记 [§章节号]

[User] 以下是 {date} 的分析数据：
{daily_analysis JSON}
```

### 4.2 最小可用 UI（交付标准）

二期 UI 不追求炫技，但必须满足以下**最低交付标准**：

| 页面 | 必须包含 | 不做 |
| --- | --- | --- |
| **复盘页（主页）** | 日期选择 + 完整报告展示（Markdown 渲染）+ "生成/刷新分析"按钮 + 导出按钮 | 复杂图表、动效、拖拽交互 |
| **会话列表** | 按时间倒序的会话列表 + 点击展开截图缩略图 + intent 标签 | 多维筛选、高级搜索 |
| **设置页** | AI 开关 + API Key 配置 + 模型选择 + 黑名单应用管理 + 采集引擎开关 | 精美表单、实时预览 |
| **健康度面板** | 6 个引擎的运行状态指示（绿/黄/红）+ 数据量概况 | 详细日志、性能图表 |

**"最小可用"的验收标准**：一个**非开发者用户**能独立完成以下操作：
1. 打开应用 → 看到今日复盘报告（如已生成）
2. 点击"生成分析" → 等待 → 看到完整报告
3. 将报告导出为 Markdown 文件
4. 点击某个会话 → 看到对应时段的截图
5. （可选）开启 AI → 填入 API Key → 重新生成 → 看到增强版报告

### 4.3 纠错与校准

| 功能 | 说明 | 存储 |
| --- | --- | --- |
| **修正 Intent** | 用户可修改某个 session 的 intent 标签 | 更新 `window_sessions.intent` + 记录到 `intent_mapping`（`is_builtin = 0`）|
| **应用黑名单** | 标记某应用不参与分析或不出现在报告中 | `settings` 表新增 `analysis.blacklist_apps` |
| **截图黑名单** | 标记某应用的截图不可出境（AI 分析时跳过） | `settings` 表新增 `ai.screenshot_blacklist_apps` |

---

## 五、用户场景（验收基准）

验收时区分两层：

- **事实层**：数字、表、排行须来自本地聚合（`daily_analysis`），可单测；关闭 AI 时用户应完整获得事实层。
- **表达层（AI opt-in）**：在自然语言、小结上增强可读性；不得与事实层数字矛盾，不得编造未采集的数据。

### 场景 A：「我以为今天在写代码，其实在拆东墙补西墙」

- **事实层验证**：打开日终复盘 → 「时间去向」章节显示各 intent 占比 → 「注意力与切换」显示 Top 切换对和碎片化指数
- **通过标准**：数字与直接 SQL 查询结果一致；碎片化指数计算正确

### 场景 B：「我知道很碎，但不知道是谁在撕碎注意力」

- **事实层验证**：「打断分析」章节显示打断者排行 + 有效打断率 + 恢复成本
- **通过标准**：若 `notifications` 不可用，报告明确标注"仅基于切换推断"且不显示通知计数

### 场景 C：「下午效率低，是输入节律变化还是环境变了？」

- **事实层验证（P0）**：「输入节奏」章节须覆盖 §6.1 所要求的指标组 **D**（如按小时 KPM 趋势等）。
- **环境上下文（指标组 F）**：属 **§6.2 P1**；P0 验收中可无该章节。若环境数据不可用，须按 §2.3 降级（标注或跳过），**不得**要求环境与输入两章同时出现才算通过。
- **通过标准**：不下强因果结论；若两章均存在则并列展示，若仅输入章则只展示可得数据。

### 场景 D：「这周和上周比，结构变了吗？」

- **事实层验证**：两份 `daily_analysis` 同口径对比
- **通过标准**：指标组 A–F 的周汇总值可计算，差异有正负号标注
- **说明**：周对比为 **P1**，基于 `daily_analysis` 表做 7 天聚合即可

### 场景 E：「那个时刻在看什么？」

- **事实层验证**：在会话列表中点击某 session → 展示关联截图
- **通过标准**：截图与 session 时间范围匹配；缩略图可点击放大

---

## 六、交付物定义（可验收）

### 6.1 P0（二期必须 ship）

| # | 交付物 | 验收标准 |
| --- | --- | --- |
| 1 | **数据管道补齐** | 一期 12 张表全部建立并持续产生数据；`get_pipeline_health` 返回各引擎状态 |
| 2 | **本地分析引擎** | 指标组 A–D 的全部指标可计算、可单测；结果写入 `daily_analysis` 表 |
| 3 | **日终复盘报告（非 AI）** | 固定章节结构的 Markdown 报告，所有数字来自 `daily_analysis`；可导出为 .md 文件 |
| 4 | **AI 叙事增强（opt-in）** | 在显式开关下基于同一聚合结果生成增强报告；关闭 AI 时报告完整不阉割 |
| 5 | **最小可用 UI** | 非开发者用户可独立完成"查看报告 → 导出 → 浏览会话截图"全流程 |
| 6 | **情境回溯** | 会话列表 + 截图时间对齐 + 点击跳转 |
| 7 | **纠错入口** | 修正 Intent 分类 + 应用黑名单 |

### 6.2 P1（增强，视进度纳入）

| # | 交付物 | 说明 |
| --- | --- | --- |
| 1 | **指标组 E（信息流向）** | 剪贴板流向分析 |
| 2 | **指标组 F（环境上下文）** | 环境场景分析 |
| 3 | **周对比** | 基于 `daily_analysis` 的 7 天聚合 + 差异报告 |
| 4 | **Onboarding** | 首次使用引导：采什么、分析什么、AI 送什么 |
| 5 | **增量聚合优化** | 仅处理新增数据，避免全量重算 |
| 6 | **HTML 报告导出** | 除 Markdown 外支持 HTML 格式 |
| 7 | **截图黑名单** | AI 分析时跳过指定应用的截图 |

### 6.3 不做（二期明确排除）

| 不做 | 推后到 |
| --- | --- |
| 深度页面效果：高完成度视觉、复杂动效、精致组件库级时间轴 | 三期 |
| 多端适配（iPad / iPhone / Web） | 三期+ |
| 云同步 | 三期 |
| GitHub / Notion / Calendar 集成 | 三期 |
| 开放式 AI 对话（聊天机器人） | 不做 |
| 团队监控、行为阻断、未授权出境 | 永久不做 |

---

## 七、里程碑拆分

| 阶段 | 里程碑 | 交付物 | 验收标准 | 依赖 |
| --- | --- | --- | --- | --- |
| **M0** | **数据管道审计与补齐** | 12 张表全部就绪 + `get_pipeline_health` 接口 + 各引擎运行 24 小时无异常 | 每张表有数据且与时间对齐；健康度接口返回全绿或合理降级 | 一期代码基础 |
| **M1** | **分析引擎 v1（指标组 A+B）** | 时间分布 + 注意力切换指标 → 写入 `daily_analysis` | 指标 A+B 全部可通过 fixture 数据单测验证 | M0 |
| **M2** | **分析引擎 v2（指标组 C+D）** | 打断分析 + 输入节奏指标 → 写入 `daily_analysis` | 指标 C+D 全部可单测；降级逻辑正确 | M0 |
| **M3** | **日终复盘报告 + 导出** | 非 AI 报告生成器 + Markdown 导出 + `daily_reports` 表 | 生成的报告章节完整、数字正确、降级章节有标注 | M1 + M2 |
| **M4** | **最小可用 UI** | 复盘页 + 会话列表 + 设置页 + 健康度面板 | 非开发者可独立完成"查看→导出→浏览截图"全流程 | M3 |
| **M5** | **AI 叙事层 + 纠错** | AI opt-in 报告生成 + BYOK + Intent 纠错 + 黑名单 | AI 报告数字与事实层一致；关闭 AI 后完整可用 | M3 + M4 |

**并行策略**：M1 和 M2 可并行开发（指标组 A+B 与 C+D 无依赖）；M4 的 UI 骨架可在 M1 完成后开始搭建。

```
M0 ─────────┬─→ M1（指标 A+B）──┬─→ M3（报告生成）──→ M5（AI + 纠错）
            │                   │
            └─→ M2（指标 C+D）──┘
                                │
                          M4（UI）──→ M5
```

---

## 八、隐私与安全

| 原则 | 落地方式 |
| --- | --- |
| **默认本地** | 非 AI 分析全程离线，不要求联网 |
| **AI 显式 opt-in** | 默认关闭；首次开启展示隐私说明弹窗 |
| **最小出境** | AI 仅接收 `daily_analysis` 聚合数据 + 用户允许的截图帧 |
| **永不出境** | 剪贴板正文、按键内容、`raw_events` 全表、密码、窗口标题中的敏感信息 |
| **BYOK** | 应用不内置任何 API Key，用户自行配置 |
| **截图黑名单** | 用户可指定应用，其截图不可被 AI 分析使用 |
| **日志安全** | 日志不打印可还原用户内容的片段 |

---

## 九、非功能需求

| 类别 | 要求 | 验证方式 |
| --- | --- | --- |
| **可信** | 报告中任一数字可在 `daily_analysis` + 对应 SQL 中对齐 | fixture 数据 + golden test |
| **降级** | 缺表/缺权限/关 AI → 非 AI 路径完整可用，降级章节有明确标注 | 逐一关闭各引擎后验证报告完整性 |
| **性能** | 单日聚合 ≤5 秒（8 小时工作量级数据）；报告生成 ≤2 秒 | 基准测试 |
| **存储** | `daily_analysis` + `daily_reports` 每日增量 ≤50KB | 实际测量 |
| **测试** | 指标组 A–D 全部有 fixture + golden 聚合测试；AI 输出测结构锚点与数字一致性（不测文风） | CI 集成 |

---

## 十、依赖与风险

| 依赖 | 说明 | 缓解 |
| --- | --- | --- |
| 一期采集引擎完成度 | 直接影响 M0 工期和分析章节降级范围 | M0 设为独立里程碑，尽早审计 |
| AI 模型 API 可用性与成本 | 用户自带 Key，成本由用户承担 | 非 AI 基线保底；AI 仅增强 |
| SQLite 单日聚合性能 | 3 万+ raw_events 聚合可能超预期 | M1 阶段即做性能基准测试 |

| 风险 | 缓解 |
| --- | --- |
| 范围膨胀到"做美" | 里程碑验收只问"报告是否正确、用户是否能用"，不问"界面是否好看" |
| 指标定义争议 | 本文档的公式和阈值为初始版本，可在 M1/M2 阶段根据真实数据校准 |
| 模型幻觉 | 数字全部来自本地聚合；AI prompt 固定结构；报告中 AI 内容有明确标记 |
| 用户混淆 AI 与事实 | 报告中「统计事实」与「AI 解读」区块视觉分离；AI 解读以引用格式（`>`）呈现 |

---

## 十一、文档修订记录

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| v1.x–v2.1 | 2026-03-31 | 已废弃演进稿；战略与范围以 **v3.0** 为基线。 |
| **v3.0** | **2026-03-31** | **战略重构**：核心定位改为「日终复盘报告」；M0 补齐数据管道；精确指标（6 组）与分析结果表；最小可用 UI + M0–M5 里程碑；AI 为增强层。 |
| **v3.1** | **2026-03-31** | **文档统一**：上游基准纳入 `TimeLens_TechArch_Phase2.md`；新增 **§〇.1 目标用户与验收主体**；§3.2 明示 A–D 与 E/F 及 §6 对齐；场景 C 收紧 P0/P1；删除与旧版 PRD 的对照表（非交付必需信息）。 |

---

*二期需求以本文「§〇 战略定位（含目标用户）+ §三 分析引擎 + §六 P0 交付 + §七 里程碑」为验收主轴。具体指标精确定义见 `二期_分析指标字典.md`，研发任务拆分与 Given/When/Then 验收条目见 `二期_里程碑与验收计划.md`。日终复盘报告的正确性和可用性是二期成败的唯一判据。不得用三期视觉标准绑架二期分析交付，也不得用工程文档替代产品功能作为 P0 交付物。*
