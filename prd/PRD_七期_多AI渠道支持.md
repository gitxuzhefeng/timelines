# PRD：七期 — 多 AI 渠道支持（V7）

**版本**：v1.0 · 2026-04-21
**上游基准**：`prd/PRD_六期_国际化i18n.md`
**关联实现**：桌面端 Tauri + React（`project/`）

---

## 1. 背景与问题

当前 AI 配置为单一 BYOK 模式：用户手动填写 `base_url`、`model`、`api_key` 三个字段，支持任意 OpenAI 兼容接口。这对普通用户门槛较高：

- 不知道 DeepSeek / Qwen 的 base_url 是什么
- 不知道该填哪个 model 名称
- 填完后无法验证配置是否正确，只能等到生成报告时才发现错误
- Claude API 在国内需要代理，但没有引导说明
- AI 输出语言始终为中文，与六期 i18n 的界面语言切换不联动

---

## 2. 本迭代使命

| 阶段 | 本迭代聚焦 |
|------|------------|
| 一至六期 | 数据底座、AI 洞察、正式壳、体验优化、Windows 性能、i18n（已完成） |
| **七期** | **预设渠道卡片降低配置门槛 + 连接测试 + AI 输出语言跟随界面语言** |

---

## 3. 用户与场景

### 3.1 主路径场景

- 国内用户安装后，在设置页看到 DeepSeek / Qwen 预设卡片，点击选中，填入 API Key，点击「测试连接」确认可用，保存后即可生成报告。
- 已有 Claude API Key 的用户，选择 Claude 卡片，填入代理地址和 Key，测试通过后使用。
- 高级用户选择「自定义」卡片，手动填写任意 OpenAI 兼容接口的 base_url 和 model。
- 界面切换为英文后，AI 生成的报告叙事也以英文输出。

### 3.2 边界

- 本期不支持多渠道并存 + 故障自动切换（仍为单一激活渠道）。
- API Key 继续存储在 SQLite，不升级到系统 Keychain。
- Claude 卡片使用 OpenAI 兼容格式（用户自行配置代理），不实现 Anthropic 原生 SDK 格式。
- 不改变 AI 分析的数据结构、聚合逻辑、报告格式。

---

## 4. 功能与能力清单

### 4.1 P0（本迭代必达）

| 能力 | 说明 |
|------|------|
| 预设渠道卡片 | 设置页 AI 区域展示 4 张卡片：Claude、DeepSeek、Qwen、自定义；每张卡片内置默认 base_url 和推荐 model |
| 渠道选中状态 | 同一时刻只有一张卡片处于激活状态，激活卡片的 base_url + model 自动填入后端设置 |
| API Key 输入 | 每张卡片内有独立的 API Key 输入框；Key 存入 SQLite（与现有机制一致），界面脱敏显示（仅展示后 4 位） |
| 连接测试 | 每张卡片有「测试连接」按钮，向对应 API 发送一条最小 chat completion 请求，返回成功/失败状态和耗时 |
| AI 输出语言跟随界面 | 当界面语言为英文时，system prompt 和 user message 切换为英文版本，AI 叙事以英文输出 |

### 4.2 P1（可并入本期）

| 能力 | 说明 |
|------|------|
| 渠道说明文案 | 每张卡片展示简短说明（如「国内直连，价格低」「需要代理访问」），帮助用户选择 |
| 自定义卡片保留历史值 | 切换到其他预设卡片再切回自定义时，之前填写的 base_url / model 不丢失 |

### 4.3 明确不做（本迭代）

| 项目 | 说明 |
|------|------|
| 多渠道并存 + 故障切换 | 仍为单一激活渠道，不引入主/备渠道逻辑 |
| Anthropic 原生 API 格式 | Claude 卡片使用 OpenAI 兼容格式，用户自行配置代理 |
| API Key 升级到系统 Keychain | 维持 SQLite 存储，不引入新依赖 |
| 第三方 AI 渠道（如 OpenAI、Gemini） | 仅内置 Claude / DeepSeek / Qwen / 自定义四张卡片 |
| AI 分析数据结构变更 | 不改变聚合逻辑、报告格式、数据库表结构 |

---

## 5. 预设渠道参数

| 渠道 | 默认 base_url | 推荐 model | 备注 |
|------|--------------|-----------|------|
| Claude | `https://api.anthropic.com/v1` | `claude-sonnet-4-6` | 需代理；OpenAI 兼容格式 |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | 国内直连 |
| Qwen | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | 国内直连 |
| 自定义 | 用户填写 | 用户填写 | 兼容任意 OpenAI 格式接口 |

---

## 6. 关键指标与验收阈值

### 6.1 验收口径（P0）

1. **预设卡片**：设置页 AI 区域展示 4 张卡片，每张卡片显示渠道名称、默认 base_url、推荐 model。
2. **渠道切换**：点击卡片后该卡片高亮，base_url 和 model 自动更新到后端设置，无需手动修改。
3. **API Key 脱敏**：已保存的 Key 在界面上仅显示后 4 位（如 `••••••••4a2f`），不可见明文。
4. **连接测试**：点击「测试连接」后，按钮进入 loading 状态；成功时显示绿色提示和耗时；失败时显示红色错误信息（含 HTTP 状态码或网络错误描述）。
5. **AI 输出语言**：界面切换为英文后，生成的日报叙事为英文；切换回中文后，叙事为中文。
6. **无回归**：现有报告生成流程（自定义 base_url + model + key）在「自定义」卡片下行为与七期前完全一致。

### 6.2 记录模板（必填）

- 测试设备及系统语言
- 各渠道连接测试截图（成功 + 失败各一张）
- 中英文模式下各生成一篇报告，截图对比叙事语言

---

## 7. 方案摘要（实现约束）

### 7.1 后端（Rust）

1. **新增 `test_ai_connection` 命令**：接收 `base_url`、`model`、`api_key` 三个参数，向 `{base_url}/chat/completions` 发送一条最小请求（单条 user message，内容为固定字符串），返回 `{ ok: bool, latency_ms: u64, error: Option<String> }`。不依赖当前已保存的设置，直接使用传入参数，便于用户在保存前测试。
2. **AI 输出语言**：在 `complete_narrative` 函数中新增 `lang: &str` 参数（`"zh"` 或 `"en"`），根据语言选择对应的 system prompt 和 user message 模板。`generate_daily_report` 命令从 settings 读取当前语言设置并传入。
3. **不新增数据库表或字段**：渠道选择通过现有 `ai_base_url` / `ai_model` 字段存储，无需新增 schema。

### 7.2 前端（React）

1. **渠道卡片组件**：新建 `AiProviderCard` 组件，接收 `provider`（预设类型或 custom）、`isActive`、`onSelect`、`onTest` 等 props。卡片内含渠道名、说明文案、base_url 展示（预设只读，自定义可编辑）、model 展示（预设只读，自定义可编辑）、API Key 输入框、测试按钮。
2. **SettingsForm 改造**：将现有 AI 配置区域（base_url + model + key 三个输入框）替换为 4 张 `AiProviderCard` 的横向/纵向排列。激活卡片切换时，自动调用 `setAiSettings` 写入对应的 base_url 和 model。
3. **连接测试**：调用新增的 `test_ai_connection` Tauri 命令，传入当前卡片的 base_url、model、key（未保存的输入框内容），展示结果。
4. **语言联动**：`generate_daily_report` 调用时，从 `i18n.language` 读取当前语言并传给后端（新增 `lang` 参数）。

### 7.3 i18n 词条

新增七期相关词条到 `zh-CN.json` 和 `en.json`，包括：渠道卡片标题、说明文案、测试按钮文案、测试结果提示、错误信息等。

---

## 8. 验收要点（Given / When / Then 摘要）

1. **Given** 用户进入设置页 AI 区域，**When** 页面加载完成，**Then** 看到 Claude、DeepSeek、Qwen、自定义 4 张卡片，当前激活卡片高亮。
2. **Given** 用户点击 DeepSeek 卡片，**When** 卡片被选中，**Then** 后端 `ai_base_url` 自动更新为 `https://api.deepseek.com/v1`，`ai_model` 更新为 `deepseek-chat`。
3. **Given** 用户在 DeepSeek 卡片输入有效 API Key 并点击「测试连接」，**When** 请求成功，**Then** 按钮区域显示绿色「连接成功 · 耗时 XXXms」。
4. **Given** 用户输入无效 API Key 并点击「测试连接」，**When** API 返回 401，**Then** 显示红色「连接失败 · 401 Unauthorized」。
5. **Given** 界面语言为英文，**When** 用户生成当日报告，**Then** 报告叙事部分为英文。
6. **Given** 界面语言切换回中文，**When** 用户再次生成报告，**Then** 报告叙事部分为中文。
7. **Given** 用户选择「自定义」卡片并填写自定义 base_url / model，**When** 保存后重启应用，**Then** 自定义卡片仍处于激活状态，填写的值保持不变。

---

## 9. 修订记录

| 版本 | 日期 | 摘要 |
|------|------|------|
| v1.0 | 2026-04-21 | 初版：预设渠道卡片、连接测试、AI 输出语言跟随界面语言 |
