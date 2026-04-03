# TimeLens 二期 AI 增强 · 里程碑与验收计划

> **版本**：v1.0  
> **日期**：2026-04-01  
> **PRD**：`prd/PRD_二期AI增强_智能洞察.md`  
> **前置**：二期基础 v1（`daily_analysis` + `fact_only`）已可用  
> **归档快照**：`docs/archived/二期AI增强/v1.0-20260401/`

---

## 一、里程碑（建议顺序）

| 代号 | 交付物 | 说明 |
| --- | --- | --- |
| **AI-M1** | 配置与门禁 | `settings` 扩展、IPC、`set_ai_enabled` 隐私校验 |
| **AI-M2** | LLM 客户端 | `ai_client`、OpenAI 兼容调用、`ai_prompt_hash` |
| **AI-M3** | `ai_enhanced` 写入 | `generate_daily_report(with_ai: true)` 全链路 |
| **AI-M4** | 前端 | 隐私弹窗、BYOK 表单、复盘双视图与导出 |

---

## 二、验收主轴（Given / When / Then）

### 2.1 首次开启与隐私

| # | Given | When | Then |
| --- | --- | --- | --- |
| P-01 | 用户从未确认隐私 | 直接调用开启 AI（仅后端） | `set_ai_enabled(true)` 失败并提示需先确认隐私 |
| P-02 | 用户阅读弹窗 | 点击「已阅读并同意」 | `set_ai_privacy_acknowledged(true)` 成功，随后可开启 AI |

### 2.2 BYOK

| # | Given | When | Then |
| --- | --- | --- | --- |
| B-01 | 用户填写 Base URL / 模型 / Key | 保存 BYOK | 配置持久化；界面不展示已存 Key 原文，仅「已配置」态 |
| B-02 | — | 任意日志或错误提示 | 不出现完整 API Key |

### 2.3 生成与双版本

| # | Given | When | Then |
| --- | --- | --- | --- |
| G-01 | 当日已有 `daily_analysis` | `generate_daily_report(date, false)` | 生成/更新 `fact_only`；无外向 HTTP |
| G-02 | AI 已开启且 Key 已配置 | `generate_daily_report(date, true)` | 生成 `ai_enhanced`：含事实层全文 +「## 8. AI 解读」；`ai_model`、`ai_prompt_hash` 非空 |
| G-03 | 同日已存在两种报告 | 切换复盘视图 | 可分别加载 `fact_only` 与 `ai_enhanced` |

### 2.4 关闭 AI 与失败

| # | Given | When | Then |
| --- | --- | --- | --- |
| F-01 | AI 总开关关闭 | 仅生成事实报告 | 无 LLM 外呼 |
| F-02 | Key 无效或网络失败 | 生成 AI 报告 | 明确错误信息；用户仍可通过事实报告路径使用产品 |

### 2.5 数据边界（抽检）

| # | Then |
| --- | --- |
| D-01 | 外向请求体仅包含 `daily_analysis` 聚合字段及 `data_sources`，不包含 raw 事件表全文 |

---

## 三、与 PRD 章节对应（摘要）

| PRD 主题 | 本计划章节 |
| --- | --- |
| 首次开启 / 隐私 | §2.1 |
| BYOK | §2.2 |
| 生成 / 双版本 | §2.3 |
| 失败与降级 | §2.4 |
| 出境红线 | §2.5、`TimeLens_TechArch_Phase2_AI增强.md` |

---

## 修订记录

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| v1.0 | 2026-04-01 | 首期归档 |
