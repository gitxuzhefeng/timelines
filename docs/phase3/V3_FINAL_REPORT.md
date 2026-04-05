# TimeLens 三期（V3）交付报告

## 概述

本期在桌面客户端（`project/`，Tauri + React + Vite）落地**正式应用壳**：侧栏四模块（今日透视、时间线、日报告、设置），数据绑定 `daily_analysis`、会话与日报；一期/二期页面保留路由，默认从主导航隐藏，通过**设置 → 开发模式**（`localStorage` 键 `timelens_dev_mode`）在侧栏展示「开发工具」分组。

## 文档与入口

- 产品说明：[prd/PRD_三期_用户场景与正式壳.md](../../prd/PRD_三期_用户场景与正式壳.md)
- **四期（三期之后）**：[prd/PRD_四期_体验优化与分组管理.md](../../prd/PRD_四期_体验优化与分组管理.md)（主导航扩展、采集顶栏、应用分组与内置词表等；三期 PRD 已修订对齐）
- UI 参考原型：[demo/timelens-phase3-formal-app-prototype.html](../../demo/timelens-phase3-formal-app-prototype.html)

## 主要变更

| 区域 | 说明 |
|------|------|
| 路由 | 默认 `/` → `/lens`；主导航 `/lens`、`/timeline`、`/report`、`/settings` |
| 数据 | 新增 `getDailyAnalysis`（Tauri `get_daily_analysis`）、`DailyAnalysisDto` 与 JSON 安全解析（`lib/jsonSafe.ts`、`lib/dailyAnalysisParsed.ts`） |
| 今日透视 | `TodayLensPage.tsx`：管线健康、Intent 条带、心流分段、剪贴板 Top 流、打断条、Top 应用、空态与生成分析 |
| 时间线 | `TimelinePage.tsx`：按上午/中午/下午/晚上分组，`getSessions` + 会话 Sheet + 截图列表 |
| 日报告 | `DailyReportPage.tsx` + 复用 `RecapContent`（隐藏壳内重复日期控件） |
| 设置 | `SettingsShellPage.tsx` 复用 `SettingsForm` + `DevModeSection` |
| 旧页 | `/recap`、`/sessions`、`/ocr`、`/ocr-eval`、`/intents`、`/health` 以 `LegacyWrap` 全屏承载，无顶栏 |
| 样式 | `index.css` 增加 `--tl-*` 主题变量与海报/管线动画类 |

## 构建与测试

- `npm run build`（`project/`）：通过。
- `npm run test`（`cargo test`）：40 tests 通过。

## 手动验收建议

1. 启动应用：默认进入今日透视，侧栏仅四项。
2. 切换日期：顶栏日期与透视/时间线数据联动（时间线独立拉取会话；透视拉取 `daily_analysis`）。
3. 无 `daily_analysis`：空态与「生成当日分析 + 事实报告」可用。
4. 设置中开关「开发模式」：侧栏出现开发工具链接；刷新后状态保持。
5. 开发链接进入会话/OCR 等页：布局全屏、功能与改造前一致。

## 已知限制

- 「自然语言洞察」摘要来自当日**事实报告** Markdown 截取，无报告时显示引导文案，不杜撰指标。
- GitHub Release 需在推送分支与 tag 后于网页或使用 `gh release create` 创建；本仓库未在报告中绑定远程发布状态。

## 版本与分支

- Git 分支：`v3`（已推送 `origin/v3`）
- 标签与制品版本：`v0.3.0`（`project/package.json`、Tauri `Cargo.toml` / `tauri.conf.json` 已对齐）
- GitHub Release：<https://github.com/gitxuzhefeng/timelines/releases/tag/v0.3.0>
