# PRD：九期 — 数据导出与本地报告（V9）

**版本**：v1.1 · 2026-04-21  
**上游基准**：`prd/PRD_八期_周报与趋势分析.md`  
**关联实现**：桌面端 Tauri + React（`project/`）

---

## 1. 背景与问题

TimeLens 已积累了完整的本地数据底座：窗口会话、输入指标、AI 日报、OCR 全文。但数据目前被锁在 SQLite 内，用户无法：

- 将历史数据迁移到其他工具（Notion、Obsidian、Excel）
- 在 TimeLens 之外查看或分享日报
- 在切换设备或重装系统时保留可读的历史记录
- 将数据接入个人知识库或第三方分析工具

现有的 `export_daily_report` 命令仅输出纯文本 Markdown 到文件系统，没有格式化预览、没有结构化数据、没有批量导出，对普通用户几乎不可发现。

**数据可移植性是用户信任本地优先产品的前提**，也是商业版差异化的核心能力之一。

---

## 2. 本迭代使命

| 阶段 | 本迭代聚焦 |
|------|------------|
| 一至八期 | 数据底座、AI 洞察、正式壳、体验优化、Windows 性能、i18n、多 AI 渠道、周报与趋势分析（已完成） |
| **九期** | **结构化数据导出（CSV/JSON）+ 增强 Markdown 日报 + 自包含 HTML 本地预览** |

---

## 3. 用户与场景

### 3.1 主路径场景

- 用户在「日报」页面点击「导出」，选择格式（Markdown / HTML / CSV / JSON），选择日期范围（单日或最近 N 天），点击确认后文件保存到本地，系统文件管理器自动打开目标目录。
- 用户将导出的 `.md` 文件拖入 Obsidian Vault，YAML frontmatter 自动被识别为元数据，报告内容完整呈现。
- 用户将导出的 `.md` 文件导入 Notion，标题、日期、标签字段正确解析，正文 Markdown 格式保留。
- 用户双击导出的 `.html` 文件，浏览器打开一份完整的日报，包含应用时长图表、事项分布、深度工作时段，无需网络，无需安装任何依赖。
- 用户导出 CSV 后用 Excel 打开，每行是一条窗口会话，列包含应用名、时长、事项分类、时间戳，可直接做透视表分析。

### 3.2 边界

- 本期不支持导出截图文件（Snapshot 图片），仅导出元数据和文本内容。
- 本期不支持导入（数据只出不进）。
- 日期范围导出上限为 30 天，超出范围作为 Pro 功能预留入口（UI 可见但提示「即将推出」）。
- 不改变现有数据采集逻辑、存储结构、AI 分析流程。
- 不实现云端同步或分享链接。

---

## 4. 功能与能力清单

### 4.1 P0（本迭代必达）

| 能力 | 说明 |
|------|------|
| 增强 Markdown 日报 | 在现有 `content_md` 基础上，添加 YAML frontmatter（`date`, `tags`, `source: timelens`, `total_active_hours`, `top_app`），确保 Obsidian / Notion 直接可用 |
| 自包含 HTML 报告 | 将 Markdown 日报渲染为单文件 `.html`，内嵌 CSS 样式和应用时长柱状图（SVG，无 JS 依赖），双击即可在浏览器离线查看 |
| CSV 会话导出 | 导出指定日期的 `window_sessions` 为 CSV，列：`date`, `start_time`, `end_time`, `duration_min`, `app_name`, `window_title`, `intent`, `extracted_url` |
| JSON 统计导出 | 导出指定日期的 `daily_analysis` 聚合 JSON，字段与现有 `DailyAnalysisDto` 一致，附加 `export_version` 和 `exported_at` 字段 |
| 导出入口 UI（日报） | 在「日报」页面（RecapPage / DailyReportPage）添加「导出」按钮，弹出格式选择面板（Markdown / HTML / CSV / JSON），支持单日导出 |
| 导出入口 UI（周报） | 在八期新增的「周报」页面（WeeklyReportPage）添加「导出」按钮，支持将周报导出为 Markdown；周报 Markdown 的 frontmatter 包含 `week_start`, `week_end`, `valid_days`, `avg_flow_score` 字段 |
| 文件落地与反馈 | 导出完成后，Toast 提示文件路径，点击可在 Finder / Explorer 中定位文件 |

### 4.2 P1（可并入本期，视工期）

| 能力 | 说明 |
|------|------|
| 日期范围批量导出 | 支持选择最近 7 天 / 30 天，批量生成多个文件并打包为 `.zip` |
| HTML 图表增强 | HTML 报告中增加事项分布饼图、每小时活跃度热力图（纯 SVG） |
| 导出历史记录 | 在设置页或导出面板展示最近 10 次导出记录（格式、日期、文件路径） |

### 4.3 不做（本期明确排除）

| 项目 | 原因 |
|------|------|
| 截图图片导出 | 文件体积大，用户场景不明确，延后 |
| 数据导入 / 恢复 | 复杂度高，与本期目标无关 |
| 云端分享链接 | 违背本地优先原则，商业版单独设计 |
| 30 天以上批量导出 | Pro 功能预留，本期 UI 可见但禁用 |
| Excel `.xlsx` 格式 | CSV 已满足需求，避免引入 Rust 依赖 |
| 自定义报告模板 | 商业版功能 |

---

## 5. 架构与实现决策

### 5.1 新增 Rust 模块：`export/`

在 `src-tauri/src/` 下新增 `export/` 模块，包含：

- **`export/mod.rs`** — 模块入口，统一导出类型
- **`export/csv.rs`** — 将 `Vec<WindowSession>` 序列化为 CSV；使用 `csv` crate（轻量，无额外传递依赖），自动处理字段内的逗号、引号、换行符、emoji 及多语言字符转义，避免手动拼接的边界遗漏
- **`export/json.rs`** — 将 `DailyAnalysisDto` 序列化为带版本字段的 JSON；复用现有 `serde_json`
- **`export/markdown.rs`** — 在现有 `report.rs` 的 `content_md` 基础上，前置 YAML frontmatter 生成逻辑；不重写报告正文
- **`export/html.rs`** — 将 Markdown 转换为自包含 HTML；使用 `pulldown-cmark`（已在依赖树中或轻量引入）渲染正文，SVG 图表由 Rust 直接生成字符串，CSS 内嵌为常量字符串

### 5.2 新增 Tauri 命令

在 `api/commands.rs` 中新增：

```
export_sessions_csv(date: String, output_path: Option<String>) -> Result<String, String>
export_daily_json(date: String, output_path: Option<String>) -> Result<String, String>
export_daily_markdown(date: String, output_path: Option<String>) -> Result<String, String>
export_daily_html(date: String, output_path: Option<String>) -> Result<String, String>
export_weekly_markdown(week_start: String, output_path: Option<String>) -> Result<String, String>
```

所有命令返回最终写入的文件路径。`output_path` 为 `None` 时，默认写入 `{data_dir}/exports/{date}/`。

### 5.3 前端 IPC 包装

在 `services/tauri.ts` 中添加对应的四个 `invoke()` 包装函数，类型签名与 Rust 命令对齐。

### 5.4 导出 UI 组件

新增 `components/ExportPanel.tsx`：一个弹出面板（Sheet 或 Dialog），包含格式选择（Radio Group）、日期显示（当前页面日期，只读）、导出按钮、加载状态、完成后的文件路径 Toast。

- 在 `RecapPage.tsx` / `DailyReportPage.tsx` 的操作栏中添加「导出」入口按钮，触发 `ExportPanel`（格式选项：Markdown / HTML / CSV / JSON）。
- 在八期的 `WeeklyReportPage.tsx` 操作栏中添加「导出」入口按钮，触发 `ExportPanel`（格式选项：Markdown，周报暂不支持 CSV/JSON 导出）。

### 5.5 YAML frontmatter 规范

**日报 frontmatter：**

```yaml
---
date: 2026-04-21
source: timelens
version: "1.0"
total_active_hours: 6.5
top_app: "Cursor"
tags: [timelens, daily-report]
---
```

**周报 frontmatter（八期衔接）：**

```yaml
---
week_start: 2026-04-13
week_end: 2026-04-19
source: timelens
version: "1.0"
valid_days: 5
avg_flow_score: 74
tags: [timelens, weekly-report]
---
```

字段保持最小集，确保 Obsidian 和 Notion 均可解析，不引入两者不兼容的扩展字段。

### 5.6 HTML 报告结构

自包含 HTML 文件结构：
1. `<head>` 内嵌 CSS（约 2KB，极简排版，支持深色/浅色系统主题 via `prefers-color-scheme`）
2. 报告正文（由 pulldown-cmark 渲染的 HTML）
3. 应用时长 SVG 柱状图（Rust 生成，内嵌在 `<figure>` 标签中）
4. 页脚：生成时间、TimeLens 版本

无 JavaScript，无外部资源引用，文件大小目标 < 100KB。

### 5.7 商业版预留钩子

- 日期范围选择器在 UI 中渲染，但超过单日时显示 Pro 徽章 + 禁用状态，点击触发「即将推出」提示
- `export/` 模块的批量导出函数签名预留 `date_range: (String, String)` 参数，本期实现中直接返回 `Err("pro_feature")`，前端根据此错误码展示升级引导

---

## 6. 数据契约

### CSV 列定义（`window_sessions` 导出）

| 列名 | 类型 | 来源字段 |
|------|------|---------|
| `date` | `YYYY-MM-DD` | `start_ms` 转换 |
| `start_time` | `HH:MM:SS` | `start_ms` |
| `end_time` | `HH:MM:SS` | `end_ms` |
| `duration_min` | 浮点，保留 2 位 | `duration_ms / 60000` |
| `app_name` | 字符串 | `app_name` |
| `window_title` | 字符串 | `window_title` |
| `intent` | 字符串 | `intent`（空则为 `"unclassified"`） |
| `extracted_url` | 字符串 | `extracted_url`（空则留空） |

### JSON 导出附加字段

在现有 `DailyAnalysisDto` 基础上追加：

```json
{
  "export_version": "1.0",
  "exported_at": "2026-04-21T10:30:00Z",
  "schema": "timelens/daily_analysis/v1"
}
```

---

## 7. 非功能要求

| 指标 | 目标 |
|------|------|
| 单日 CSV 导出耗时 | < 500ms（含文件写入） |
| 单日 HTML 生成耗时 | < 1s |
| HTML 文件大小 | < 100KB |
| 导出不阻塞 UI | 所有导出操作在 Tauri 异步命令中执行，前端显示加载状态 |
| 隐私 | 导出前不做额外隐私过滤（用户已知数据在本地），OCR 文本不包含在标准导出中 |

---

## 8. 验收标准

### P0 验收

| ID | 验收项 |
|----|--------|
| A1 | 导出单日 Markdown，文件包含合法 YAML frontmatter，`date` 字段与导出日期一致 |
| A2 | 导出的 `.md` 文件可直接拖入 Obsidian，frontmatter 字段在属性面板中可见 |
| A3 | 导出单日 HTML，双击在浏览器打开，无 JS 错误，应用时长图表可见，无外部网络请求 |
| A4 | 导出单日 CSV，用 Excel / Numbers 打开，列名正确，时长数值合理；以下边界场景均正确处理：(a) `window_title` 含逗号，(b) `window_title` 含英文双引号，(c) `window_title` 含换行符，(d) `app_name` 含 emoji，(e) 中文应用名和标题 |
| A5 | 导出单日 JSON，`jq` 可解析，`export_version` 字段存在，`total_active_ms` 与应用内显示一致 |
| A6 | 导出完成后 Toast 显示文件路径，点击 Toast 可在 Finder / Explorer 中定位文件 |
| A7 | 当日无数据时，导出操作返回友好错误提示，不生成空文件 |
| A8 | 导出操作期间 UI 不冻结，按钮显示加载状态 |
| A9 | 在周报页点击「导出」，导出的 `.md` 文件包含合法 YAML frontmatter，`week_start` / `week_end` 字段与当前周范围一致 |
| A10 | 周报导出的 `.md` 文件可直接拖入 Obsidian，frontmatter 字段在属性面板中可见 |

---

## 9. 已知限制

- OCR 全文内容不包含在标准导出中（数据量大且含敏感信息），如需导出需单独设计
- HTML 报告中的图表为静态 SVG，不支持交互（悬停、缩放）
- CSV 导出不包含 `input_metrics`、`ambient_context` 等扩展数据表，这些字段保留给 Pro 版 JSON 导出
- Windows 上文件路径分隔符使用系统默认，Tauri `open_path` 行为与 macOS 一致

---

## 11. 修订记录

| 版本 | 日期 | 摘要 |
|------|------|------|
| v1.0 | 2026-04-21 | 初版：CSV/JSON/Markdown/HTML 导出，日报导出入口 |
| v1.1 | 2026-04-21 | 衔接八期：新增周报 Markdown 导出、周报 frontmatter 规范、WeeklyReportPage 导出入口、`export_weekly_markdown` 命令、A9/A10 验收项 |
| v1.2 | 2026-04-21 | P0 修正：export/csv.rs 改用 csv crate 处理转义；A4 验收项细化为 5 个边界场景 |

- `prd/PRD_八期_周报与趋势分析.md` — 上游基准，周报页面与 `weekly_reports` 表由八期引入
- `prd/TimeLens_产品迭代规范.md` — 迭代闸门与工件规范
- `project/src-tauri/src/analysis/report.rs` — 现有 Markdown 报告生成逻辑（本期复用）
- `project/src-tauri/src/core/models.rs` — 数据模型定义
- `project/src-tauri/src/api/commands.rs` — 现有 Tauri 命令（本期扩展）
