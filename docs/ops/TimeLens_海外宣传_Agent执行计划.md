# TimeLens 海外宣传 · OpenClaw Agent 可执行计划

> **版本**：1.0  
> **日期**：2026-04-14  
> **执行主体**：`overseas_growth_agent`（OpenClaw）  
> **人类角色**：仅负责事实核对、账号发帖、录屏/GIF、合并 PR、支付/法务  
> **目标**：14 天冲刺 **GitHub Star + Release 下载**，渠道以 **全球开发者** 为主  

---

## 一、计划边界（必须遵守）

### 1.1 Agent 可自动完成

- 基于仓库事实撰写/改写 **英文** README、About、Topics 建议、对比表、FAQ。  
- 起草 Show HN / r/SideProject / Dev.to / X 线程的多版本文案。  
- 生成录屏 **分镜脚本**、GIF 字幕文案、落地页标题/CTA 多版本。  
- 输出「待核实清单」、发布前检查表、复盘提纲。  
- 将产出写入 **规定目录** 下的 Markdown 文件。

### 1.2 必须由人类完成（禁止代劳或需显式确认）

- 在 HN / Reddit / X / Dev.to **实际发帖**（Agent 只出草稿）。  
- **录屏与导出 GIF**（可按 Agent 分镜执行）。  
- 将草稿 **合并进仓库**、更新 GitHub **About/Topics**（网页操作）。  
- 核对 **隐私与采集边界** 与当前代码/文档一致（一句都不能错）。  
- 任何涉及 **未在 CONTEXT 出现** 的功能、数据、版本号——**不得写入对外文案**。

### 1.3 唯一事实源（CONTEXT）

Agent 每轮执行前必须读取（按优先级）：


| 优先级 | 路径                                           | 说明                 |
| --- | -------------------------------------------- | ------------------ |
| P0  | `{REPO}/README.md`                           | 产品一句、能力、链接、技术栈     |
| P0  | `{REPO}/docs/TimeLens_功能介绍.md`               | 若存在，补充功能与路线图       |
| P1  | `{REPO}/docs/ops/TimeLens_海外宣传_Agent执行计划.md` | 本计划（任务与目录规范）       |
| P2  | `{WORKSPACE}/CONTEXT_USER_FILLED.md`         | 人类维护：绝对链接、版本号、禁止承诺 |


**占位符**：  

- `{REPO}` = `/Users/xzf/Project/study/timelines`（可按机器调整）  
- `{WORKSPACE}` = `/Users/xzf/openclaw/flow_context/ops/overseas_growth_workspace`

---

## 二、产出目录规范（Agent 写入）

在 `{WORKSPACE}` 下维护：

```
overseas_growth_workspace/
├── CONTEXT_USER_FILLED.md          # 人类：链接、版本、联系方式（模板见下）
├── STATUS.md                       # Agent：当前阶段、完成百分比、阻塞项
├── deliverables/
│   ├── D01_context_brief.md        # 英文一句话 + bullet + 待核实清单
│   ├── D02_readme_en_draft.md      # README 英文主区草稿
│   ├── D03_github_about.txt        # Description + Topics（每行一个 topic）
│   ├── D04_gif_storyboard.md       # GIF 分镜脚本
│   ├── D05_landing_copy.md         # 落地页文案多版本
│   ├── D06_show_hn_pack.md         # 标题/正文/置顶评论多版本
│   ├── D07_reddit_sideproject.md   # r/SideProject 帖文
│   ├── D08_faq_from_feedback.md    # FAQ 增补（若尚无反馈则写「待填充」）
│   ├── D09_x_thread.md             # X 线程
│   ├── D10_devto_article.md        # Dev.to 长文
│   ├── D11_consistency_audit.md    # 与 CONTEXT 矛盾检查表
│   └── D14_retrospective.md        # 复盘 + PH 备选包
└── logs/
    └── run_YYYYMMDD_HHMM.md        # 每次任务运行摘要（可选）
```

**命名规则**：若某日任务合并执行，可合并文件，但须在 `STATUS.md` 说明。

---

## 三、CONTEXT_USER_FILLED.md 模板（人类初始化）

```markdown
# User-filled CONTEXT — 仅事实，禁止 Agent 编造

## Links（必须可点击验证）
- GitHub Repo: 
- Latest Releases: 
- Marketing site: 
- License: MIT（链接到仓库 LICENSE）

## Product facts（从 README 抄，勿发挥）
- One-liner EN: 
- Platforms: macOS, Windows（版本要求若 README 有则写）
- Stack: Tauri 2, Rust, React, Vite, Tailwind …

## Privacy boundary（必须与文档一致）
- Local-first: yes
- Does NOT collect: keyboard content, clipboard passwords, …
- Does collect: window/app metadata, optional screenshots, …

## Forbidden claims
- （列出绝不能写的句子，例如未上线功能）

## Contact / Support
- Issues: GitHub Issues URL
- （可选）Email / Discord — 无则写 TBD
```

---

## 四、14 日任务序列（Agent 执行顺序）

每日标准流程：

1. 读取 CONTEXT + 本计划 §四对应日条目。
2. 产出当日 `deliverables/Dxx_*.md`（可多文件）。
3. 输出末尾附 **「待核实清单」**（逐条对应事实）。
4. 更新 `STATUS.md`：完成度、阻塞（缺人类链接/缺录屏等）。

### D1 — 上下文与宣传简报

- 产出 `D01_context_brief.md`：英文 one-liner ×3、价值 bullet ×9、竞品对比表（事实型，不贬损）。  
- 从 README 抽取 **术语表**（session、snapshot、local-first 等）供全文统一。

### D2 — GitHub 门面（英文）

- 产出 `D02_readme_en_draft.md`：Hero、Features、Privacy、Install、Screenshots 占位说明。  
- 产出 `D03_github_about.txt`：≤350 字符 Description；Topics 15 个以内。

### D3 — 演示素材脚本

- 产出 `D04_gif_storyboard.md`：15–30s 分镜（每 3–5s）、建议帧率与画幅。  
- **人类**：按分镜录屏 → GIF → 嵌入 README（Agent 可写插入说明段落）。

### D4 — 落地页文案

- 产出 `D05_landing_copy.md`：标题 ×5、副标题 ×5、CTA、Privacy 折叠段落、Footer 链接列表。

### D5 — 一致性审计

- 产出 `D11_consistency_audit.md`：对外文案中每条事实 **✓/✗**；✗ 必须给「应改为…」占位符。

### D6 — Show HN 弹药库

- 产出 `D06_show_hn_pack.md`：标题 ×10、短正文 ×3、置顶评论 ×2、**发帖时间建议**（工作日，美西上午，仅作建议）。

### D7 — 发射日（人类主导）

- Agent 产出 `logs/run_YYYYMMDD_HHMM.md`：**高频问答答复草稿** ×8（诚实、简短）。  
- **人类**：发帖；前 3 小时回复评论（可用草稿改写）。

### D8 — Reddit + FAQ

- 产出 `D07_reddit_sideproject.md`：与 HN **角度不同** 的帖文。  
- 产出 `D08_faq_from_feedback.md`：若尚无真实反馈，列「预测 FAQ」并标 **待验证**。

### D9–D10 — X 线程

- 产出 `D09_x_thread.md`：8 推 ×2 套（技术向 / 效率向），末推含 CTA 链接占位。

### D11–D12 — Dev.to

- 产出 `D10_devto_article.md`：大纲 → 全文 → 摘要 → 建议 slug/tags。  
- 技术段落凡涉及实现细节，一律标 **[VERIFY]**。

### D13 — 二次传播

- 在 `D10` 基础上产出 **短摘要**（邮件/Newsletter 用）一段，**不重复发帖 HN**。

### D14 — 复盘 + 下一波

- 产出 `D14_retrospective.md`：复盘模板、**Product Hunt 备选包**（标题、5 bullet、首评草稿）。  
- **人类**：填入真实 Star/下载变化（若无可写「待统计」）。

---

## 五、质量闸门（每份 deliverable 必含）

1. **待核实清单**：逐条列出文中事实性陈述。
2. **禁止项自检**：未出现键盘记录、未上线功能、不确定版本号。
3. **链接占位符**：无链接处写 `TODO_LINK`，不得伪造 URL。

---

## 六、OpenClaw 调用约定

### 6.1 初始化身份（一次性，人类已执行则跳过）

```bash
openclaw agents set-identity \
  --agent overseas_growth_agent \
  --workspace /Users/xzf/openclaw/flow_context/ops/overseas_growth_workspace \
  --from-identity
```

### 6.2 单日任务触发（示例：D2）

```bash
openclaw agent --agent overseas_growth_agent \
  --message "【TimeLens 海外宣传 D2】读取 ${REPO}/README.md 与 ${WORKSPACE}/CONTEXT_USER_FILLED.md。执行 docs/ops/TimeLens_海外宣传_Agent执行计划.md §四 D2。产出写入 ${WORKSPACE}/deliverables/。更新 STATUS.md。" \
  --timeout 3600
```

### 6.3 连续跑完 14 日（人类调度）

- 建议 **每日一单任务**，避免单次上下文溢出。  
- D5、D11 必须在发帖前 **人类签字** 通过。

---

## 七、成功判据（14 日后复盘用）


| 指标    | 说明                        |
| ----- | ------------------------- |
| 基建完成度 | README/About/落地页/GIF 是否就绪 |
| 主曝光执行 | Show HN 是否已发（是/否/日期）      |
| 长尾资产  | Dev.to + X 是否已发           |
| 质量事故  | 是否有隐私/功能不实表述（应为 0）        |


---

## 八、附录：与仓库的关联

- 本文件路径：`docs/ops/TimeLens_海外宣传_Agent执行计划.md`  
- 建议在 `{WORKSPACE}` 中创建符号链接便于 Agent 读取：

```bash
ln -sf /Users/xzf/Project/study/timelines/docs/ops/TimeLens_海外宣传_Agent执行计划.md \
  /Users/xzf/openclaw/flow_context/ops/overseas_growth_workspace/PLAN.md
```

---

**文档结束**