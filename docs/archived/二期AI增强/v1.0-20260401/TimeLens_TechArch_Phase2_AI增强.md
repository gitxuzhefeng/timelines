# TimeLens 二期 · AI 增强技术方案

> **版本**：v1.0  
> **日期**：2026-04-01  
> **范围**：LLM 叙事层（BYOK）、`ai_enhanced` 报告、隐私门禁、复盘双视图；**不修改** `daily_analysis` 指标计算公式。  
> **PRD**：`prd/PRD_二期AI增强_智能洞察.md`

---

## 1. 目标与边界

| 原则 | 实现要点 |
| --- | --- |
| 增强不替代 | `with_ai: true` 时先生成与 `fact_only` 相同的事实段，再在文末追加「AI 解读」；指标数字仅以事实层与 JSON 为准。 |
| 默认关闭 | `settings.ai_enabled` 默认 `0`；内存 `AppState.ai_enabled` 与 DB 同步。 |
| BYOK | 用户配置 `ai_base_url`、`ai_model`、`ai_api_key`；应用不内置 Key。 |
| 出境数据 | 仅 `daily_analysis` 行序列化 JSON + `data_sources` 解析对象；禁止附带 raw_events、窗口标题原文、剪贴板正文等。 |

---

## 2. 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│  React：设置（隐私弹窗 + BYOK） / 复盘（事实 ⟷ AI 增强）      │
└──────────────────────────┬──────────────────────────────────┘
                           │ Tauri invoke
┌──────────────────────────▼──────────────────────────────────┐
│  commands：get_ai_settings / set_ai_settings /               │
│            set_ai_privacy_acknowledged / set_ai_enabled      │
│            generate_daily_report(date, with_ai)              │
└──────────────────────────┬──────────────────────────────────┘
         with_ai=false       │              with_ai=true
              │              │                    │
              ▼              │                    ▼
     build_fact_only_md      │     build_fact_only_md + JSON 载荷
              │              │                    │
              ▼              │                    ▼
     INSERT fact_only        │     ai_client::complete_narrative
                             │     (reqwest blocking → chat/completions)
                             │                    │
                             ▼                    ▼
                        daily_reports (report_type, content_md,
                                     ai_model, ai_prompt_hash)
```

---

## 3. 配置与存储

### 3.1 `settings` 表键（`core/settings.rs`）

| Key | 含义 | 默认 |
| --- | --- | --- |
| `ai_enabled` | 总开关 | 关 |
| `ai_privacy_acknowledged` | 用户已读隐私说明 | 关 |
| `ai_base_url` | OpenAI 兼容 API 根路径 | `https://api.openai.com/v1` |
| `ai_model` | 模型名 | `gpt-4o-mini` |
| `ai_api_key` | Bearer Token | 空 |

### 3.2 隐私门禁

- `set_ai_enabled(true)`：**若** `ai_privacy_acknowledged` 为假，则返回错误，拒绝开启。
- 前端首次勾选「启用 AI」时先展示隐私弹窗，用户确认后调用 `set_ai_privacy_acknowledged(true)`，再 `set_ai_enabled(true)`。

### 3.3 API Key 存储说明

当前实现将 Key 存于本地 SQLite `settings` 表（与 PRD「持久化」一致）。**未**接入系统钥匙串；若后续有合规要求，可单独立项迁移至 Keychain / Credential Manager。

---

## 4. LLM 调用（`analysis/ai_client.rs`）

- **协议**：HTTP POST，路径为 `{base}/chat/completions`（若 `base` 已以 `/chat/completions` 结尾则不再拼接）。
- **依赖**：`reqwest`（`json`、`rustls-tls`、`blocking`），**仅**此模块发起外向 HTTP。
- **请求体**：OpenAI 兼容 `messages`：`system` 固定策略 + `user` 含「当日聚合 JSON」（pretty print 包在 markdown 代码块中便于模型阅读）。
- **温度**：`temperature: 0.3`。
- **超时**：120s。
- **追溯**：`ai_prompt_hash = SHA256(system_prompt || PROMPT_VERSION常量)`，写入 `daily_reports.ai_prompt_hash`。

---

## 5. 报告生成（`generate_daily_report`）

### 5.1 `fact_only`（`with_ai: false`）

- 读取 `daily_analysis` → `build_fact_only_markdown` → 删除当日 `report_type='fact_only'` 后插入新行。
- **无**外网请求。

### 5.2 `ai_enhanced`（`with_ai: true`）

前置条件：

1. `AppState.ai_enabled == true`（否则报错）。
2. `get_ai_api_key` 非空（否则提示配置 BYOK）。

流程：

1. 读取当日 `daily_analysis` 与 `data_sources`。
2. 生成事实层 Markdown（与 `fact_only` 同源逻辑）。
3. `serde_json::to_value(DailyAnalysisDto)`，并向根对象插入 `data_sources` 解析后的 JSON。
4. 调用 `complete_narrative(base, key, model, &payload)` 得到 Markdown 正文。
5. 拼接：`事实全文` + `---` + `## 8. AI 解读` + 说明引用块 + 模型输出。
6. `DELETE` 当日 `ai_enhanced` 后 `INSERT`，写入 `ai_model`、`ai_prompt_hash`。

### 5.3 失败与降级

- 网络 / HTTP 4xx/5xx / 响应缺字段：命令返回 `Err`（中文说明）。
- 产品策略：用户可再次执行「仅生成分析 + 事实报告」，不调用 LLM；**不**在服务端静默回写 `fact_only`（避免掩盖错误）。

---

## 6. 数据库（既有表）

`daily_reports` 已含 `ai_model`、`ai_prompt_hash`（二期基础迁移）；`ai_enhanced` 与 `fact_only` **按日、按类型**各保留最新一条（生成前 `DELETE` 同类型）。

---

## 7. 前端契约

| 能力 | 说明 |
| --- | --- |
| `getAiSettings` | `privacyAcknowledged`、`baseUrl`、`model`、`hasApiKey`（不回传 Key）。 |
| `setAiSettings` | 可选更新；`apiKey` 为 `null` 表示不改 Key；空字符串表示清空 Key。 |
| 复盘 | `getDailyReport(date, 'fact_only' \| 'ai_enhanced')`；存在 AI 报告或开关开启时显示「事实 / AI 增强」切换。 |
| 导出 | `export_daily_report` 按类型导出；`ai_enhanced` 文件名后缀 `-ai`。 |

---

## 8. 安全与日志

- **禁止**在日志中打印 `api_key`（实现中无刻意记录；新增日志时须遵守）。
- 外向 payload 仅限聚合 JSON，与 PRD「允许出境」表对齐。

---

## 9. 代码索引（实现落点）

| 区域 | 路径 |
| --- | --- |
| LLM 客户端 | `project/src-tauri/src/analysis/ai_client.rs` |
| 设置键读写 | `project/src-tauri/src/core/settings.rs` |
| IPC | `project/src-tauri/src/api/commands.rs` |
| 命令注册 | `project/src-tauri/src/lib.rs` |
| 设置 / 复盘 UI | `project/src/pages/SettingsPage.tsx`、`RecapPage.tsx` |
| 前端类型与 invoke | `project/src/types/index.ts`、`project/src/services/tauri.ts` |

---

## 修订记录

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| v1.0 | 2026-04-01 | 首期 AI 增强实现归档 |
