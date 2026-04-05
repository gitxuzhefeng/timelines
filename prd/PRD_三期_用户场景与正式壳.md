# PRD：三期 — 用户场景与正式壳（V3）

## 1. 目标

以「一天的时间结构可被快速理解」为核心，用**正式应用壳**（侧栏四模块）服务日常用户；一期/二期能力全部保留，但**默认隐藏入口**，由**开发模式**解锁，避免干扰主路径。

## 2. 信息架构（主导航）

| 路由（建议） | 模块 | 用户目标 |
|-------------|------|----------|
| `/lens` | 今日透视 | 一眼看到当日结构、关键指标、管线健康；无分析时明确引导生成或检查权限 |
| `/timeline` | 时间线 | 按上午/中午/下午/晚上核对会话与应用 |
| `/report` | 日报告 | 阅读事实层 / AI 增强 Markdown，生成与导出 |
| `/settings` | 设置 | 权限、引擎、OCR、AI、存储、黑名单等 |

默认 `/` → `/lens`。

### 2.1 隐藏路由（开发模式）

以下路由**保留**，不在主导航展示：

- `/recap` — 旧版复盘直达（可与 `/report` 并存）
- `/sessions`、`/ocr`、`/ocr-eval`、`/intents`、`/health`

### 2.2 开发模式

- **开启**：设置页底部「开发模式」开关；状态持久化 `localStorage` 键 `timelens_dev_mode`（`"1"` / 移除）。
- **效果**：侧栏出现「开发工具」分组，列出上述隐藏链接；样式与主导航一致，附 `Dev` 弱标签。
- **关闭**：分组立即隐藏；用户若停留在 dev 页面仍可浏览，建议从地址栏返回主导航模块。

## 3. 数据映射

### 3.1 今日透视

| UI 区域 | 数据来源 | 说明 |
|---------|----------|------|
| 标题/日期 | 所选 `date` + 本地化星期 | 与全局日期一致 |
| 自然语言洞察 | `get_daily_report(date, fact_only)` 正文截取或首段 | 无报告时不杜撰长文 |
| 管线节点状态 | `get_pipeline_health()` | 映射 tracker / capture / ocr 等 running/degraded/stopped |
| 心流/占比条 | `daily_analysis.intent_breakdown`（JSON） | 按 intent 聚合时长占比 |
| Top 应用 | `daily_analysis.top_apps`（JSON） | 列表与时长 |
| 剪贴板路径 | `top_flows` + `clipboard_pairs` | 无数据时显示「暂无剪贴板流」 |
| 打断 | `notification_count`、`top_interrupters`、`interrupts_in_deep` | 可视化强度与数据可用性一致 |
| 降级说明 | `degraded_sections`（JSON 数组） | 可读标签 + 简短说明 |
| 空态 | 无 `daily_analysis` | 引导「生成分析」或「去设置」 |

生成流程与二期一致：`generate_daily_analysis` → `generate_daily_report`（事实 / AI）。

### 3.2 时间线

- `get_sessions(date)`，`startMs` 按本地时划段：0–12 上午，12–14 中午，14–18 下午，18–24 晚上（与原型一致可调）。
- 会话详情、截图：`get_session_snapshots`、`snapshotTimelensUrl`（同 Sessions 页）。

### 3.3 日报告 / 设置

- 与现有 Recap、Settings **功能对等**，仅更换布局与壳。

## 4. 交互原则

- 全局**同一日期**：存放在 `appStore.date`，顶栏或壳内日期选择器统一修改。
- 透视页 CTA：跳转时间线、日报告。
- 动效不阻塞首屏；缺失模块展示「暂无」或降级文案。

## 5. 技术依赖（摘要）

- 前端封装 `getDailyAnalysis` → Tauri `get_daily_analysis`。
- `DailyAnalysisDto` 中多数字段为 JSON 字符串，解析需容错。

## 6. 验收要点（摘录）

- 默认仅四主导航；开发模式控制 dev 分组显隐且刷新后保持。
- 有/无 `daily_analysis` 时透视页状态正确；构建无 TS 错误；`cargo test` 通过。
