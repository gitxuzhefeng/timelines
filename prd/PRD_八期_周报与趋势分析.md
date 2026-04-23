# PRD：八期 — 周报与趋势分析（V8）

**版本**：v1.0 · 2026-04-21
**上游基准**：`prd/PRD_七期_多AI渠道支持.md`
**关联实现**：桌面端 Tauri + React（`project/`）

---

## 1. 背景与问题

一至七期建立了完整的日维度数据底座：每天的专注时长、应用使用、碎片化率、输入流畅度均已落库（`daily_analysis` 表，25 个指标字段）。但用户只能逐日查看，无法回答以下问题：

- 这周我的生产力比上周高还是低？
- 我的高效时段是固定的还是漂移的？
- 哪个应用这周占用了最多时间，趋势是上升还是下降？
- 我的专注质量在一周内是否有规律性波动？

单日视角是「记录工具」，周维度聚合才是「洞察工具」的起点。

---

## 2. 本迭代使命

| 阶段 | 本迭代聚焦 |
|------|------------|
| 一至七期 | 数据底座、AI 洞察、正式壳、体验优化、Windows 性能、i18n、多 AI 渠道（已完成） |
| **八期** | **周维度聚合 + 高效时段热力图 + 应用趋势 + 生产力评分走势 + AI 周报叙事** |

---

## 3. 用户与场景

### 3.1 主路径场景

- 用户每周一打开 TimeLens，左侧导航点击「周报」，自动看到上一周的聚合报告：热力图展示哪些时段最专注、应用使用柱状图、生产力评分走势折线图，以及 AI 生成的一段周度叙事。
- 用户想回顾三周前的数据，通过周选择器切换到对应周，报告按需生成。
- 用户在设置里将周起始日改为周日（符合北美习惯），周报的日期范围随之调整。
- 界面为英文时，AI 叙事以英文输出（复用七期语言联动机制）。

### 3.2 边界

- 本期不做月报、季报等更长周期聚合。
- 不做跨周对比视图（如「本周 vs 上周」并排）。
- 不做团队/多用户维度。
- 周报数据来源仅为本地 `daily_analysis`，不引入新的原始数据采集。

---

## 4. 功能与能力清单

### 4.1 P0（本迭代必达）

| 能力 | 说明 |
|------|------|
| 周报导航入口 | 左侧导航新增「周报」菜单项，与「日报」并列 |
| 周选择器 | 页面顶部展示当前周范围（如「2026-04-13 ~ 2026-04-19」），支持前后翻周 |
| 自动生成 | 进入周报页时，若当前周的 `weekly_analysis` 不存在，自动触发后台聚合；已存在则直接展示 |
| 数据门槛提示 | 若所选周内有效数据天数为 0，展示「本周暂无数据」提示；1-2 天展示图表但不触发 AI 叙事，并提示「数据不足，AI 分析需至少 3 天记录」；≥3 天则正常生成含 AI 叙事的完整周报 |
| 高效时段热力图 | 横轴 7 天、纵轴 24 小时的热力图，颜色深浅表示每小时的平均 flow_score；附文字总结「你的黄金时段是 X 天 X 点」 |
| 应用使用趋势 | 每天 Top 5 应用的分组柱状图（横轴为天，纵向堆叠或分组），展示应用使用量在一周内的变化 |
| 生产力评分走势 | 折线图展示 7 天的 flow_score（复用 daily_analysis.flow_score），标注最高/最低日 |
| AI 周报叙事（P0） | 基于周聚合数据，调用已配置的 AI 渠道生成一段周度叙事（200-400 字），语言跟随界面语言；同一周的 AI 叙事默认 24 小时内只生成一次，重复进入直接复用缓存；用户可通过「刷新」按钮（P1）手动重新生成 |
| 周起始日配置 | 设置页新增「周起始日」选项（周一 / 周日），影响周报的日期范围计算 |

### 4.1.1 周报缓存失效规则

`weekly_analysis` 和 `weekly_reports` 写入后默认复用，以下三种情况触发对应周的缓存失效，下次进入该周周报页时重新聚合：

| 触发场景 | 失效范围 | 说明 |
|---|---|---|
| 当周有新的 `daily_analysis` 写入 | 当周 `weekly_analysis` 标记为 stale | 新增一天数据后，周聚合指标需重算 |
| 用户执行 intent 批量回填（`backfill_session_intents_from_mappings`） | 回填日期所在周的 `weekly_analysis` 标记为 stale | intent 变更影响 flow_score 等聚合指标 |
| 用户修改「周起始日」设置 | 所有已缓存的 `weekly_analysis` 全部失效 | 日期范围边界变化，历史聚合不再可用 |

实现方式：`weekly_analysis` 表新增 `is_stale` 字段（INTEGER，默认 0）。触发场景发生时将对应行的 `is_stale` 置为 1。`WeeklyReportPage` 挂载时，若查询到 `is_stale = 1` 则视同不存在，重新触发聚合。



| 能力 | 说明 |
|------|------|
| 周报导出 | 将周报（含数据摘要 + AI 叙事）导出为 Markdown 文件 |
| 缺失天标注 | 热力图和柱状图中，无数据的天用灰色/斜线标注，区别于「有数据但 flow_score 为 0」 |
| 周报刷新按钮 | 允许用户手动重新生成当前周的聚合与 AI 叙事 |

### 4.3 明确不做（本迭代）

| 项目 | 说明 |
|------|------|
| 月报 / 季报 | 更长周期聚合延后 |
| 跨周对比视图 | 「本周 vs 上周」并排展示延后 |
| 新增原始数据采集 | 周报完全基于已有 daily_analysis 数据 |
| 推送 / 通知 | 不做「周报已生成」系统通知 |
| 自定义评分权重 | 生产力评分直接复用 flow_score，不引入用户可调权重 |

---

## 5. 数据定义

### 5.1 周聚合指标（`weekly_analysis` 表）

| 字段 | 类型 | 来源 | 说明 |
|------|------|------|------|
| `week_start` | TEXT (ISO date) | 计算 | 周起始日（周一或周日，依设置） |
| `week_end` | TEXT (ISO date) | 计算 | 周结束日 |
| `valid_days` | INTEGER | COUNT | 有 daily_analysis 记录的天数 |
| `total_tracked_seconds` | INTEGER | SUM | 全周总追踪时长 |
| `avg_flow_score` | REAL | AVG | 7 天 flow_score 均值 |
| `daily_flow_scores` | TEXT (JSON) | 聚合 | `[{"date":"2026-04-13","score":72}, ...]` 7 条 |
| `hourly_heatmap` | TEXT (JSON) | 聚合 | `{"Mon":{"9":85,"10":90,...},...}` 按天×小时的 flow_score 均值 |
| `top_apps_by_day` | TEXT (JSON) | 聚合 | `{"2026-04-13":[{"app":"Cursor","seconds":7200},...],...}` 每天 Top 5 |
| `weekly_top_apps` | TEXT (JSON) | 聚合 | 全周应用总时长排名 Top 10 |
| `avg_deep_work_minutes` | REAL | AVG | 7 天深度工作时长均值（分钟） |
| `avg_fragmentation_pct` | REAL | AVG | 7 天碎片化率均值 |
| `peak_focus_day` | TEXT | 计算 | flow_score 最高的日期 |
| `peak_focus_hour_range` | TEXT | 计算 | 热力图中得分最高的时段描述（如「周二/周四 10-12 点」） |
| `generated_at` | TEXT | 系统 | 聚合生成时间戳 |
| `is_stale` | INTEGER | 系统 | 0 = 有效，1 = 需重算；触发场景见 §4.1.1 |

### 5.2 周报存储（`weekly_reports` 表）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 自增 |
| `week_start` | TEXT | FK → weekly_analysis.week_start |
| `report_type` | TEXT | `"fact_only"` / `"ai_enhanced"` |
| `content` | TEXT | Markdown 内容 |
| `lang` | TEXT | 生成时的语言（`"zh"` / `"en"`） |
| `created_at` | TEXT | 生成时间戳 |

### 5.3 设置新增字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `week_start_day` | INTEGER | `1` | 0 = 周日，1 = 周一 |

---

## 6. 方案摘要（实现约束）

### 6.1 后端（Rust）

1. **数据库迁移**：新增 `weekly_analysis` 和 `weekly_reports` 两张表；`settings` 表新增 `week_start_day` 字段（默认 1）；`weekly_analysis` 表含 `is_stale` 字段（INTEGER，默认 0）。
2. **`generate_weekly_analysis(week_start: String)` 命令**：
   - 根据 `week_start` 和 `week_start_day` 计算 7 天日期范围。
   - 查询该范围内所有 `daily_analysis` 行，执行聚合计算（SUM/AVG/JSON 构建）。
   - 写入 `weekly_analysis` 表（UPSERT，`week_start` 唯一），同时将 `is_stale` 重置为 0。
3. **stale 标记写入时机**：
   - `generate_daily_analysis` 成功写入某天数据后，查询该天所在周的 `weekly_analysis` 行，若存在则将 `is_stale` 置为 1。
   - `backfill_session_intents_from_mappings` 执行后，对回填日期涉及的所有周执行同样操作。
   - `set_week_start_day` 保存新值后，对 `weekly_analysis` 全表执行 `UPDATE SET is_stale = 1`。
3. **`get_weekly_analysis(week_start: String)` 命令**：返回 `WeeklyAnalysisDto`。
4. **`generate_weekly_report(week_start: String, ai_enhanced: bool, lang: String)` 命令**：
   - 基于 `weekly_analysis` 数据构建 fact_only Markdown（含各图表数据的文字摘要）。
   - `ai_enhanced = true` 时，调用已配置 AI 渠道，使用周报专用 prompt 生成叙事段落，拼接到 fact_only 内容后。
   - 写入 `weekly_reports` 表。
5. **`get_weekly_report(week_start: String, report_type: String)` 命令**：返回 `WeeklyReportDto`。
6. **`get_week_start_for_date(date: String)` 命令**：给定任意日期，返回其所在周的 `week_start`（依 `week_start_day` 设置）。
7. **AI prompt 模板**：新增周报专用中英文 prompt，输入为 `WeeklyAnalysisDto` 的关键字段，要求 AI 输出 200-400 字的周度洞察叙事，不重复罗列数字。
8. **不修改现有 daily_analysis / daily_reports 逻辑**。

### 6.2 前端（React）

1. **新增 `WeeklyReportPage`**：左侧导航新增「周报」入口，路由 `/weekly`。
2. **周选择器组件 `WeekPicker`**：展示当前周范围，支持前后翻周按钮；进入页面时默认定位到最近一个完整周（若今天是周中则为上一周）。
3. **热力图组件 `FocusHeatmap`**：基于 `hourly_heatmap` 数据渲染 7×24 格子，颜色映射 flow_score（0-100 → 灰→绿→深绿）；附「黄金时段」文字总结。
4. **应用趋势组件 `AppTrendChart`**：基于 `top_apps_by_day` 渲染每天 Top 5 应用的分组柱状图；使用现有图表库（若无则引入轻量库如 recharts）。
5. **评分走势组件 `FlowScoreTrend`**：基于 `daily_flow_scores` 渲染折线图，标注最高/最低日。
6. **自动生成逻辑**：`WeeklyReportPage` 挂载时，先调用 `getWeeklyAnalysis`，若返回空或 `is_stale = 1` 则自动调用 `generateWeeklyAnalysis` + `generateWeeklyReport`，完成后展示。AI 叙事仅在 `valid_days >= 3` 时生成；1-2 天时展示图表并提示「数据不足，AI 分析需至少 3 天记录」。
7. **设置页**：AI 配置区域下方新增「周起始日」下拉选项（周一 / 周日），调用 `setWeekStartDay` 命令保存。
8. **i18n**：新增八期相关词条到 `zh-CN.json` 和 `en.json`。

### 6.3 图表库选型约束

- 优先复用项目中已有的图表渲染方式（如 TodayLensPage 的可视化组件）。
- 若需引入新库，选择体积 < 50KB gzip 的轻量方案，不引入 D3 全量包。

---

## 7. 关键指标与验收阈值

### 7.1 验收口径（P0）

1. **导航**：左侧导航出现「周报」菜单项，点击后路由跳转到周报页。
2. **周选择器**：默认展示最近完整周的日期范围；前后翻周按钮正常工作；日期范围随 `week_start_day` 设置变化。
3. **自动生成**：首次进入某周的周报页，后台自动完成聚合与报告生成，页面从 loading 状态变为展示状态，无需用户手动点击。
4. **热力图**：7×24 格子正确渲染，颜色深浅与 flow_score 对应；无数据的天格子有明显区分（灰色）；「黄金时段」文字总结出现在热力图下方。
5. **应用趋势**：每天 Top 5 应用柱状图正确展示，应用名称可读，时长单位为小时/分钟。
6. **评分走势**：折线图展示 7 天 flow_score，最高/最低日有标注。
7. **AI 叙事**：AI 增强版周报包含 200-400 字叙事段落；界面为英文时叙事为英文，中文时为中文。
8. **数据门槛**：所选周内无任何数据时，页面展示「本周暂无数据」提示，不崩溃；有效天数 1-2 天时，展示图表但 AI 叙事区域显示「数据不足，AI 分析需至少 3 天记录」。
9. **缓存失效**：当周新增日分析数据后，再次进入该周周报页，页面重新聚合并展示最新数据，不展示旧缓存。
10. **无回归**：日报生成流程、设置页现有功能、导航其他菜单项均正常。

### 7.2 记录模板（必填）

- 测试设备及系统版本
- 热力图截图（含有数据和无数据两种状态）
- 应用趋势图截图
- 评分走势图截图
- AI 叙事截图（中英文各一）
- 周起始日切换前后的日期范围对比截图

---

## 8. 验收要点（Given / When / Then 摘要）

1. **Given** 用户有至少 3 天的历史数据，**When** 点击左侧「周报」导航，**Then** 页面自动生成并展示热力图、应用趋势、评分走势和 AI 叙事。
2. **Given** 用户在周报页，**When** 点击「上一周」按钮，**Then** 日期范围切换到上一周，若有数据则展示，若无则显示「本周暂无数据」。
3. **Given** 用户在设置页将「周起始日」改为周日，**When** 返回周报页，**Then** 当前周的日期范围从周日开始计算，且历史周报缓存已失效并重新聚合。
4. **Given** 界面语言为英文，**When** 周报 AI 叙事生成，**Then** 叙事内容为英文。
5. **Given** 热力图中某天无数据，**When** 渲染热力图，**Then** 该天的 24 个格子均显示为灰色，区别于有数据但 flow_score 为 0 的格子。
6. **Given** 用户已生成某周的周报且 24 小时内未触发 stale，**When** 再次进入该周的周报页，**Then** 直接展示已缓存结果，不重新触发 AI 叙事生成。
7. **Given** 用户所选周内完全无数据，**When** 进入该周周报页，**Then** 展示「本周暂无数据」提示，不展示空图表。
8. **Given** 用户所选周内有效数据天数为 1 或 2 天，**When** 进入该周周报页，**Then** 展示热力图/趋势图，AI 叙事区域显示「数据不足，AI 分析需至少 3 天记录」，不调用 AI 接口。
9. **Given** 当周新增了一天的日分析数据，**When** 用户进入该周周报页，**Then** 页面重新聚合并展示包含新数据的结果，不展示旧缓存。

---

## 9. 已知限制

- 热力图的 flow_score 来源于 `daily_analysis`，若某天未生成日分析（如用户未打开应用），该天数据缺失，热力图显示灰色。
- AI 叙事质量依赖用户配置的 AI 渠道可用性；若 AI 不可用，仅展示 fact_only 版本，不阻塞页面。
- 周报聚合基于 `daily_analysis` 数据，若日分析数据有误差，周报数据同步受影响。
- 图表渲染为前端静态图，不支持交互式下钻（如点击某天跳转到日报）——此功能延后。

---

## 10. 修订记录

| 版本 | 日期 | 摘要 |
|------|------|------|
| v1.0 | 2026-04-21 | 初版：周报导航、热力图、应用趋势、评分走势、AI 叙事、周起始日配置 |
| v1.1 | 2026-04-21 | P0 修正：AI 叙事有效天数阈值由 ≥1 提升为 ≥3；新增周报缓存失效规则（§4.1.1）及 is_stale 字段；AI 叙事 24h 生成频率限制；更新验收要点 8-9 |
