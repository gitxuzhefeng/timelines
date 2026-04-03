# TimeLens 二期 AI 增强 · 产品研发任务计划表

> **版本**：v1.0  
> **日期**：2026-04-01  
> **配套**：`二期AI增强_里程碑与验收计划.md`、`TimeLens_TechArch_Phase2_AI增强.md`  
> **归档快照**：`docs/archived/二期AI增强/v1.0-20260401/`

---

## 一、依赖关系

```
二期基础 v1（daily_analysis + fact_only + 复盘事实报告）
        │
        ▼
  AI-M1 配置与隐私门禁
        │
        ├──────────────────┐
        ▼                  ▼
  AI-M2 LLM 客户端    AI-M4 前端（可与 M2 并行）
        │
        ▼
  AI-M3 generate_daily_report(with_ai: true)
        │
        ▼
  联调 + 验收（§二）
```

**硬依赖**：AI-M3 依赖 AI-M1 + AI-M2；前端 AI-M4 依赖 IPC 契约稳定（可与 M2 并行）。

---

## 二、工作包清单

| ID | 模块 | 任务 | 产出 / DoD |
| --- | --- | --- | --- |
| **T1** | 后端 · 设置 | `settings`：`ai_privacy_acknowledged`、`ai_base_url`、`ai_model`、`ai_api_key` 读写 | 单元可测；默认值符合技术方案 |
| **T2** | 后端 · 门禁 | `set_ai_enabled(true)` 校验隐私；`get_ai_settings` 不回传 Key | 验收 P-01 |
| **T3** | 后端 · HTTP | `analysis/ai_client.rs`：`complete_narrative`、`prompt_hash_hex` | 仅此处依赖 `reqwest` |
| **T4** | 后端 · 报告 | `generate_daily_report`：`with_ai` 分支、DELETE/INSERT `ai_enhanced` | 验收 G-02、G-03 |
| **T5** | 后端 · IPC | `lib.rs` 注册 `get_ai_settings`、`set_ai_settings`、`set_ai_privacy_acknowledged` | 与前端字段 camelCase 一致 |
| **T6** | 前端 · 设置 | 隐私弹窗、BYOK 表单、清除 Key | 验收 P-02、B-01 |
| **T7** | 前端 · 复盘 | 事实/AI 切换、`generateDailyReport(..., true)`、导出区分文件名 | 验收 G-03、F-02 提示 |
| **T8** | 测试 | `cargo test`、`npm run build`；可选真机 E2E（自备 Key） | 见《开发测试验收报告》 |

---

## 三、角色分工（参考）

| 角色 | 侧重 |
| --- | --- |
| 后端 | T1–T5 |
| 前端 | T6–T7 |
| 测试 | T8、验收表勾选 |

---

## 四、不在本期（排期另立）

- 截图黑名单 + 可选附图入模（见 PRD / 截图增强 PRD）
- API Key 迁移至系统钥匙串
- 结构化 JSON 输出强制 schema 校验（当前为 Markdown 叙事）

---

## 修订记录

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| v1.0 | 2026-04-01 | 首期归档 |
