# TimeLens 海外宣传 · 运营定时任务与渠道维护

> **版本**：1.0  
> **配合**：`TimeLens_海外宣传_Agent执行计划.md`、`overseas_growth_workspace`  
> **时区**：定时任务默认 **Asia/Shanghai**（白天 9:00–21:00）

---

## 一、自动化边界（必读）

OpenClaw **定时任务 + Agent** 可以稳定做到：

| 能力 | 说明 |
|------|------|
| 按时间表唤醒 Agent | 读取清单、写汇报、生成回复**草稿**、更新本地 `REPORT_LOG.md` |
| GitHub（半自动） | 若本机已配置 `gh` 且已登录，Agent 可在授权下辅助 **Issue/Discussion** 相关操作；**仍建议人工确认**后再发送 |
| 飞书/IM 汇报 | 若已为 Gateway 配置 `--channel` + `--to` 与 `--announce`，可将摘要推到指定会话（需你自行绑定） |

OpenClaw **无法单独保证**、需额外工程或合规配置的能力：

| 能力 | 原因 |
|------|------|
| **无授权自动发帖** | Reddit / HN / X / Dev.to / YouTube / B 站等需 **各平台登录态与 API 或浏览器自动化**，且易触发风控与 ToS |
| **无密钥自动回帖** | 同上；「自动回复」在本文档中默认指 **生成草稿 + 提醒人类**，或由你已配置的 **官方 API** 执行 |
| **实时监控全站评论** | 需爬虫/API 配额；Cron 仅能触发 Agent 按清单 **拉取你维护的链接状态** 或调用已配置工具 |

**结论**：本方案将「自动」落实为 **定时巡检 + 草稿 + 汇报**；对外动作默认 **人类一键发送** 或你后续接入 **平台官方 Bot/API**。

---

## 二、工作区文件（人类维护）

路径：`/Users/xzf/openclaw/flow_context/ops/overseas_growth_workspace/`

| 文件 | 作用 |
|------|------|
| `PUBLISHED_MANIFEST.yaml` | 已发布帖文/视频/仓库页的 **URL 与平台**（Agent 只读并据此写汇报） |
| `REPORT_LOG.md` | Agent **追加**双小时/每日巡检记录（带时间戳） |
| `CONTEXT_USER_FILLED.md` | 产品事实与链接（已有） |
| `PLAN.md` | 链到本仓库的执行计划 |

你应在首次上线前 **填写 `PUBLISHED_MANIFEST.yaml`**（Show HN 帖、Reddit、Dev.to、X、GitHub Release、视频链接等）。

---

## 三、定时任务定义（与 OpenClaw Cron 对应）

### 3.1 双小时汇报与互动草稿（9–21 点）

- **Cron**：`0 9,11,13,15,17,19,21 * * *`  
- **时区**：`Asia/Shanghai`  
- **行为**：Agent 执行下面「双小时巡检」指令；若当前不在 9–21 点（极少触发），仅写一行说明并跳过对外建议。

**双小时巡检 — Agent 指令要点**

1. 读取 `PUBLISHED_MANIFEST.yaml`、`CONTEXT_USER_FILLED.md`。  
2. 在 `REPORT_LOG.md` 追加一节：`## YYYY-MM-DD HH:mm CST | bi-hourly`。  
3. 列出各渠道「待人类处理」项：新评论线索（若无法抓取则写 **请人工打开链接查看**）。  
4. **回复草稿**：仅当任务时间在 **09:00–21:00 CST** 时，为每条待回复线索写 **英文草稿 1 条**（诚实、简短、不承诺未发布功能）。  
5. **禁止**：声称已自动发帖/已自动回复；禁止编造互动数据。

### 3.2 每日媒体渠道巡检（早间）

- **Cron**：`0 8 * * *`（可改为 9 点：`0 9 * * *`）  
- **行为**：执行「每日巡检」—

**每日巡检 — Agent 指令要点**

1. 核对 `PUBLISHED_MANIFEST.yaml` 是否过期（空则提醒人类填写）。  
2. 输出「今日维护清单」：GitHub Star/Issue、各站链接、建议动作（更新置顶评论、换封面等）— **不写虚假数据**。  
3. 追加 `REPORT_LOG.md`：`## YYYY-MM-DD | daily`。

---

## 四、Gateway 与汇报投递

- Cron 任务通过 **OpenClaw Gateway** 调度；请保持本机 **`openclaw` Gateway / daemon 按官方文档常驻**，否则定时不会执行。  
- **飞书（已配置）**：两条 TimeLens Cron 已设置 **`--announce --channel feishu --to <会话 open_id>`**，任务成功结束后将 **摘要推送到指定会话**；失败时 **`failureAlert`** 亦指向同一会话（连续错误 ≥1 次时告警）。会话 ID 见工作区 `FEISHU_DELIVERY.md`（勿将 open_id 提交到公开仓库若你介意）。  
- 为降低超时，两条任务已开启 **`--light-context`**，并将 Agent **`timeoutSeconds` 设为 1800**。

### 4.1 飞书群内与「河谷」互动（入站）

- 在 `~/.openclaw/openclaw.json` 中已配置 **`bindings`**：飞书群 **`oc_8fb24c8e122c428b102e979935b92653`**（账号 **`yinyue`**）的入站消息路由到 **`overseas_growth_agent`**。  
- **`channels.feishu.groupAllowFrom`** 已包含该群；该群 **`requireMention: false`**，可直接发消息协作（仍建议重要任务 @ 机器人）。  
- 详细说明见工作区 **`FEISHU_CHAT.md`**、**`SOUL.md`**（飞书入站协作段）。配置变更后需 **`openclaw gateway restart`**。

---

## 五、若未来要做「真·自动发帖」

1. **GitHub**：Personal Access Token + `gh` 或 GitHub API，限定权限；由独立脚本执行，**不要**把 token 写入仓库。  
2. **YouTube / B 站**：使用平台 **官方上传与评论 API** + OAuth；需单独微服务，超出 OpenClaw Agent 一条 Cron 的范畴。  
3. **Reddit / HN**：强烈建议 **人工**或 **官方 API + 明确 Bot 政策**；避免自动化灌水。

---

## 六、验收

- [x] `openclaw cron list` 能看到两条 TimeLens 相关任务  
- [ ] 手动 `openclaw cron run <id>` 能触发一次 Agent 且 `REPORT_LOG.md` 有新增  
- [ ] `PUBLISHED_MANIFEST.yaml` 已由人类填写至少一条真实链接  
- [ ] 飞书会话能收到 **announce** 摘要（`openclaw cron runs --id <jobId>` 中 `delivered: true`）  

---

**文档结束**
