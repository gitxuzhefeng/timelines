# TimeLens 技术架构 · Phase 2 基础版（事实层 + UI）

> **版本**：v1.0 · 2026-04-01  
> **定位**：相对 `TimeLens_TechArch_V2.md` v2.2 的增量：**分析引擎、事实层报告、四页产品 UI、采集补齐、健康度**；**不包含** LLM 客户端与外网调用。  
> **完整合并叙述（含 AI 占位）**：`TimeLens_TechArch_Phase2.md`（文首注明已拆分）  
> **AI 增量架构**：`TimeLens_TechArch_Phase2_AI增强.md`

---

## 1. 分层概要

- **L1～L3**：与一期一致（采集 → 聚合 → 写入）。  
- **L4 扩展**：`daily_analysis` 聚合 Job；**Report Generator（fact_only）**；**无** `reqwest`。  
- **L5**：Tauri IPC：`generate_daily_analysis`、`get_daily_analysis`、`generate_daily_report`（**v1 主路径 `with_ai: false`**）、`export_*`、`get_pipeline_health`、`update_session_intent`、黑名单相关 Command。  
- **L6**：React — 会话 / 复盘 / 健康度 / 设置。

**原则**：非 AI 路径 **零外网**；与 `project` 中 `verify:no-net` 策略一致。

---

## 2. 与合并版架构文档的对应关系

| 合并版 `TimeLens_TechArch_Phase2.md` 章节 | 基础版范围 |
| --- | --- |
| §1.1 变更摘要 | 采用「非 AI 零网络」行；**忽略** AI 放行句作为 v1 交付 |
| §1.2 分层图 | 去掉 AI Client 框 |
| §2.1 依赖 | **不引入** `reqwest`（v1） |
| §4.1～4.5、4.7 | 全量适用 |
| §4.6 AI Client | **不适用**（见 AI 增强册） |
| §5 数据架构 | 全量适用 |
| §6 IPC | 仅事实层与校准相关 Command |
| §7 前端 | 复盘/会话/设置/健康度；**无** AI 配置表单与双版本切换（v1） |
| §8 目录结构 | 可无 `src-tauri/src/ai/`（v1） |
| §10 安全 | v1 仅本地存储与日志约束；**无**出境控制节 |
| §11 性能 | 非 AI 报告 ≤500ms 等仍适用 |

---

## 3. 关键决策（基础版）

| ID | 决策 |
| --- | --- |
| P2B-1 | v1 交付以 **`fact_only`** 为主；`daily_reports.ai_*` 字段可为 schema 预留 |
| P2B-2 | Intent / 黑名单为 **产品校准能力**，归属基础版，与是否引入 LLM 无关 |
| P2B-3 | 六引擎健康度与合并版一致；通知等引擎可平台降级 |

---

## 修订记录

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| v1.0 | 2026-04-01 | 从 `TimeLens_TechArch_Phase2.md` 拆分基础视图 |
