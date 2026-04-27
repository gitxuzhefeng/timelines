<!-- markdownlint-disable MD060 -->

# PRD：十八期 — GitHub Star 增长推广与营销方案（V18）

**版本**：v1.0 · 2026-04-27  
**目标周期**：2026-04-27 至 2026-05-30  
**项目级目标**：GitHub star 数达到 **100+**  
**起始基线**：2026-04-27 查询到 `gitxuzhefeng/timelines` 为 **11 stars**  
**增长缺口**：至少新增 **89 stars**  
**目标仓库**：[gitxuzhefeng/timelines](https://github.com/gitxuzhefeng/timelines)  
**关联目标文档**：`PROJECT_GOALS.md`  
**关联素材**：`marketing/`、`docs/assets/`、`docs/readme.md`、`README.md`  
**遵循规范**：`prd/TimeLens_产品迭代规范.md`

---

## 0. 用户深层需求（PRD_WHYNOW）

| 层次 | 需求 | 说明 |
|------|------|------|
| **认知** | 快速理解 TimeLens 是什么 | 访客进入 GitHub 后，需要在 10 秒内知道它是本地优先的桌面时间感知工具，而不是普通番茄钟或手动打卡工具。 |
| **信任** | 相信它值得下载和 star | 需要通过截图、双平台安装说明、隐私承诺、真实迭代记录和开源透明度降低试用门槛。 |
| **传播** | 有明确理由分享 | 国内用户更关注「效率复盘、隐私、本地数据」；海外用户更关注「local-first、AI analytics、Tauri desktop app」。 |
| **转化** | 从看见到 star 的路径短 | 每个渠道都应把用户带到 GitHub，并在 README、Release、Issue、讨论区里强化 star 与反馈入口。 |

---

## 1. 背景与问题（PRD_BACKGROUND）

TimeLens 已具备较完整的产品能力：被动采集、时间线、智能截图、OCR 搜索、AI 日报、周报、工作链路图、Today Lens、中英双语、macOS 与 Windows 支持。仓库中也已有 `marketing/` 渠道文案和截图指引。

当前问题不是“没有功能”，而是“功能价值没有被集中表达并持续分发”：

1. GitHub 首页需要更强的首屏转化：一句话定位、双平台下载、截图、Demo、Star 引导需要围绕 100 stars 目标重新聚焦。
2. 国内和海外渠道需要分层：国内重社区讨论、长文测评、效率工具种草；海外重 Product Hunt、X/Twitter、Reddit、Hacker News、开发者社区。
3. macOS 与 Windows 都要被明确呈现：不能让用户误以为这是 Mac-only 工具。
4. 运营动作需要按周推进：一个月内达成 89 个新增 stars，必须形成节奏、复盘和补位机制。

---

## 2. 本迭代使命（PRD_MISSION）

| 阶段 | 本迭代聚焦 |
|------|------------|
| **十八期** | **① 建立 4/27-5/30 的 100+ stars 项目级目标 ② 重构 GitHub 访客转化路径 ③ 面向国内与海外分别制定推广渠道节奏 ④ 强调 macOS + Windows 双平台可用 ⑤ 建立每日追踪与每周复盘机制** |

**一句话目标（G0）**：到 2026-05-30，TimeLens GitHub star 数从 11 增长到 **100+**，并沉淀一套可复用的产品发布与社区运营流程。

---

## 3. 目标对象与定位（PRD_USERS）

### 3.1 国内用户

| 用户类型 | 典型渠道 | 关注点 | 核心信息 |
|----------|----------|--------|----------|
| 独立开发者 / 技术用户 | V2EX、掘金、少数派、即刻、知乎 | Tauri、Rust、SQLite、本地优先、开源实现 | “一个开源的本地优先桌面时间感知工具，支持 macOS / Windows。” |
| 效率工具用户 | 小红书、少数派、公众号、微信群 | 时间复盘、日报、周报、截图回溯、AI 分析 | “不用打卡，也能知道时间去哪了。” |
| 隐私敏感用户 | 少数派、知乎、GitHub | 数据不上云、无账号、本地 SQLite | “所有数据留在本机，AI 分析可自带 Key。” |

### 3.2 海外用户

| 用户类型 | 典型渠道 | 关注点 | 核心信息 |
|----------|----------|--------|----------|
| Developer / maker | Product Hunt、X/Twitter、Hacker News、Reddit | Local-first、Tauri、AI productivity、open source | “Local-first AI time engine for macOS and Windows.” |
| Productivity enthusiast | Product Hunt、Reddit、Indie Hackers | Passive tracking、daily insights、privacy | “See where your desktop time goes without manual tracking.” |
| Privacy-first desktop user | GitHub、Reddit、HN | No account、no cloud、SQLite local storage | “No server, no account, no tracking code.” |

### 3.3 平台边界

- **macOS**：强调 `.dmg` 下载、菜单栏使用、权限与隔离属性解决说明、Apple Silicon / Intel 可用性。
- **Windows**：强调安装版与便携版、Windows 10+、x64 / ARM64 架构、首次权限与安全提示。
- **共同点**：Tauri 2、React、Rust、SQLite、本地优先、中英双语。

---

## 4. 成功指标（PRD_METRICS）

### 4.1 北极星指标

| 指标 | 当前值 | 目标值 | 截止时间 |
|------|--------|--------|----------|
| GitHub stars | 11 | 100+ | 2026-05-30 |

### 4.2 周目标拆解

| 周期 | 时间 | 累计 stars 目标 | 净新增目标 | 重点动作 |
|------|------|----------------|------------|----------|
| W0 | 4/27-4/30 | 20 | +9 | GitHub README / Release / 截图素材完成，启动种子传播 |
| W1 | 5/1-5/7 | 40 | +20 | 国内技术社区首轮：V2EX、少数派、掘金、即刻 |
| W2 | 5/8-5/14 | 60 | +20 | 海外首轮：Product Hunt 准备、X Thread、Reddit、Indie Hackers |
| W3 | 5/15-5/21 | 80 | +20 | 复盘内容二次传播：使用案例、开发复盘、Windows 重点补强 |
| W4 | 5/22-5/30 | 100+ | +20 | Product Hunt / HN / 社群召回 / 最后一周冲刺 |

### 4.3 辅助指标

- GitHub README 访问后转化：通过 star 曲线与发布节点对齐判断。
- Release 下载量：macOS `.dmg`、Windows `setup.exe`、Windows 便携版分别追踪。
- Issue / Discussion 数：目标周期内新增 10+ 条真实反馈。
- 渠道互动：每个核心渠道至少获得 5 条有效评论或反馈。
- 二次传播：至少 5 位用户、朋友或开发者帮忙转发、引用或推荐。

---

## 5. 推广策略（PRD_STRATEGY）

### 5.1 总策略

采用“GitHub 转化基建 + 双语内容分发 + 社区反馈闭环”的组合打法：

1. **先修转化漏斗**：确保所有外部流量进入 GitHub 后，能快速看到产品价值、截图、下载方式、双平台支持、隐私承诺和 Star 引导。
2. **再做渠道分发**：国内与海外分别投放适配文案，不直接复制同一套话术。
3. **持续复盘补位**：每 2-3 天记录 star 变化，把有效渠道加码，把无效渠道改标题、换角度或延后。
4. **用产品迭代反哺运营**：目标周期内优先修复安装、下载、README、Release、FAQ、截图等影响传播转化的问题。

### 5.2 核心卖点排序

| 优先级 | 卖点 | 适用受众 | 推荐表达 |
|--------|------|----------|----------|
| P0 | 本地优先，数据不上云 | 国内 + 海外 | “All data stays on your device / 所有数据只在本机。” |
| P0 | 被动记录，无需打卡 | 效率用户 | “不用记，电脑自己告诉你时间去哪了。” |
| P0 | macOS + Windows 双平台 | 所有用户 | “Desktop-first, macOS and Windows ready.” |
| P1 | AI 日报 / 周报 / 侧栏助手 | 效率用户、AI 用户 | “Bring your own API key and turn activity into insight.” |
| P1 | Tauri + Rust + SQLite 开源实现 | 开发者 | “A real-world Tauri 2 desktop app with local SQLite.” |
| P1 | OCR 搜索与截图回溯 | 重度电脑用户 | “Search what appeared on your screen before.” |

---

## 6. 渠道方案（PRD_CHANNELS）

### 6.1 GitHub 基建（最高优先级）

**目标**：让所有外部访问都能转化为 star、下载或反馈。

**必做动作**：

1. README 首屏加入 GitHub stars badge、下载链接、macOS / Windows 平台标识。
2. 截图区域使用现有 `docs/assets/timelines宣传/CH` 与 `EN` 资源，保证中英文双语可见。
3. Release 页面补充 macOS 与 Windows 下载说明，包含 Mac 隔离属性排障说明。
4. 仓库 Topics 建议设置：`time-tracking`、`productivity`、`tauri`、`macos`、`windows`、`local-first`、`ai`。
5. 补充或强化 `CONTRIBUTING.md`、`FAQ.md`、`CHANGELOG.md`，降低开发者与普通用户试用门槛。
6. README 末尾加入自然 Star 引导：如果 TimeLens 帮你理解时间流向，欢迎 star 支持后续迭代。

**验收**：

- 新访客在首屏能看到产品定位、下载入口、双平台支持、隐私承诺。
- README 中 macOS 与 Windows 下载路径都清晰。
- Star 引导自然出现，不打断阅读。

### 6.2 国内渠道

| 渠道 | 目标 | 内容角度 | 发布时间 |
|------|------|----------|----------|
| V2EX | 获得技术用户反馈与早期 star | 开源项目分享、Tauri + Rust、双平台、本地优先 | W1 首发 |
| 少数派 | 获得效率工具用户信任 | 深度测评：从“时间去哪了”到“本地 AI 复盘” | W1-W2 投稿 |
| 掘金 | 获得开发者关注 | Tauri 桌面应用工程复盘、跨平台采集难点 | W1 |
| 小红书 | 获得效率人群曝光 | 截图种草：不用打卡的时间复盘工具 | W1-W3 分 2-3 篇 |
| 即刻 / 微信群 | 获得种子用户 | 独立开发进展 + 求反馈 | 全周期 |
| 知乎 | 获得搜索长尾 | 回答“有哪些好用的时间管理工具 / 本地优先工具” | W2-W4 |

**国内话术原则**：

- 避免过度营销，使用“做了一个工具，想听反馈”的语气。
- 技术社区重点讲实现与开源；效率社区重点讲场景和截图。
- 每篇内容都明确说明支持 macOS 和 Windows。

### 6.3 海外渠道

| 渠道 | 目标 | 内容角度 | 发布时间 |
|------|------|----------|----------|
| Product Hunt | 集中曝光与海外 star | Local-first AI time engine for macOS and Windows | W4 集中 Launch |
| X/Twitter | 持续触达开发者与 maker | Build-in-public thread、功能 GIF、local-first 定位 | W2 起每周 2-3 条 |
| Reddit | 获得垂直社区反馈 | r/productivity、r/opensource、r/rust、r/tauri | W2-W4 |
| Hacker News | 技术曝光 | Show HN: Local-first AI time tracking for desktop | W4，产品与 README 准备充分后 |
| Indie Hackers | 创业 / 独立开发反馈 | 1-month open-source growth challenge | W2-W4 |

**海外话术原则**：

- 首句必须清楚：local-first、AI、time tracking、macOS + Windows。
- 强调 no account、no server、SQLite local database。
- Product Hunt 与 HN 前需要确保下载、截图、Demo、FAQ 都可用。

---

## 7. 时间节奏（PRD_TIMELINE）

### W0：目标落地与转化基建（4/27-4/30）

- 固化项目级目标与第 18 期 PRD。
- 更新 GitHub README 首屏和截图展示。
- 检查 Release 资产：macOS `.dmg`、Windows 安装版、Windows 便携版。
- 完成 1 个 30 秒 Demo GIF / MP4，覆盖中英文或双平台亮点。
- 准备 star 追踪表，每日记录 star、下载、渠道动作。

### W1：国内首轮发布（5/1-5/7）

- V2EX 发帖，强调开源、Tauri、Rust、本地优先、双平台。
- 少数派投稿或发布长文测评。
- 掘金发布工程复盘，吸引技术用户。
- 小红书发布第 1 篇截图种草。
- 在朋友圈、微信群、即刻发“求试用反馈”版本。

### W2：海外预热（5/8-5/14）

- X/Twitter 发布英文 Thread：问题、解决方案、功能 GIF、GitHub 链接。
- Indie Hackers 发布 open-source growth challenge。
- Reddit 选择 2-3 个社区发帖，避免同日刷屏。
- 根据 W1 反馈补 FAQ、README、Release 说明。

### W3：案例与补强（5/15-5/21）

- 发布“用 TimeLens 复盘一周工作”的真实案例。
- 补一篇 Windows 端专项说明，避免产品被误认为 Mac-only。
- 发布开发复盘：Tauri + Rust + SQLite 如何做本地优先桌面应用。
- 找 5-10 位朋友、开发者或早期用户帮忙试用与转发。

### W4：集中冲刺（5/22-5/30）

- Product Hunt Launch，提前准备 maker comment、首批支持者、截图、视频。
- 视准备情况发布 Show HN。
- 汇总“一个月开源增长挑战”进展，做最终召回。
- 所有渠道统一 CTA：GitHub star、下载试用、提交反馈。
- 5/30 复盘目标达成情况，沉淀下一阶段增长方案。

---

## 8. 内容资产需求（PRD_ASSETS）

| 资产 | 数量 | 用途 | 责任说明 |
|------|------|------|----------|
| GitHub README Hero | 1 套 | GitHub 首屏转化 | 中英双语，突出 macOS / Windows |
| 核心截图 | 6-10 张 | README、少数派、Product Hunt、小红书 | 覆盖 Timeline、Today Lens、Daily Report、AI Sidebar、OCR、Windows |
| Demo GIF / MP4 | 1-2 条 | README、X、Product Hunt | 30 秒内，展示从记录到洞察 |
| 国内长文 | 1-2 篇 | 少数派、掘金、知乎 | 技术版与效率版分开 |
| 海外 Thread | 2-3 条 | X/Twitter、Indie Hackers | local-first + AI productivity |
| FAQ | 1 份 | 降低下载试用阻力 | macOS 与 Windows 分平台 |
| Release note | 1 份 | 下载页转化 | 必含 Mac 隔离属性排障说明 |

---

## 9. 运营追踪机制（PRD_TRACKING）

### 9.1 每日记录

每天记录一次：

- GitHub stars 总数。
- 当天新增 stars。
- 当天发布 / 评论 / 转发渠道。
- Release 下载变化。
- 新增 Issue / Discussion。
- 用户反馈中的高频问题。

### 9.2 每周复盘

每周复盘：

1. 哪个渠道带来明显 star 增长。
2. 哪种标题 / 截图 / 卖点更有效。
3. 用户对 macOS 与 Windows 分别有什么安装阻力。
4. README 或 Release 是否需要补充解释。
5. 下一周是否需要调整渠道优先级。

### 9.3 决策规则

- 如果某渠道发布后 48 小时新增 stars 少于 3，则换标题或换角度，不重复投同样内容。
- 如果 macOS 或 Windows 安装问题出现 2 次以上，优先补 FAQ 与 Release note。
- 如果某个功能被连续提及 3 次以上，加入下一轮传播主卖点。
- 如果 W2 结束未达到 60 stars，则 W3 提前启动朋友/用户转发与开发复盘内容。

---

## 10. 风险与应对（PRD_RISKS）

| 风险 | 影响 | 应对 |
|------|------|------|
| README 转化不足 | 外部流量浪费 | W0 优先优化首屏、截图、下载入口和 Star CTA |
| Windows 资产不足 | 双平台定位不可信 | W1 前补 Windows 截图、安装说明和常见问题 |
| Product Hunt 准备不足 | 海外集中曝光失败 | W2 开始准备，不在素材不足时硬 Launch |
| 社区反馈指出 Bug | 影响下载与 star | 将安装、启动、权限、崩溃问题设为 P0 响应 |
| 传播内容过度营销 | 社区反感 | 使用“开源项目分享 / 求反馈”语气，减少夸张承诺 |
| star 增长低于预期 | 无法达成 100 | 增加高质量长文、朋友转发、真实案例与开发复盘 |

---

## 11. 验收标准（PRD_ACCEPTANCE）

| ID | 验收项 | 标准 |
|----|--------|------|
| A1 | 项目级目标已保存 | `PROJECT_GOALS.md` 明确记录 4/27-5/30 达到 100+ stars |
| A2 | 第 18 期 PRD 已保存 | 本文档包含目标、对象、平台、渠道、节奏、指标 |
| A3 | 双平台表达完整 | macOS 与 Windows 在 GitHub、国内、海外方案中均有独立说明 |
| A4 | 国内与海外渠道分层 | 至少覆盖 5 个国内渠道和 5 个海外渠道 |
| A5 | 目标可追踪 | 有周目标、每日记录项、每周复盘机制 |
| A6 | 运营动作可执行 | 每周都有明确动作，不依赖未定义资源 |
| A7 | Star 目标达成 | 2026-05-30 GitHub stars 达到 100+ |

---

## User Stories

1. 作为项目维护者，我希望有一个明确的 100 stars 项目级目标，以便接下来所有营销和运营动作都围绕同一个结果推进。
2. 作为第一次访问 GitHub 的用户，我希望快速理解 TimeLens 是什么，以便判断是否值得 star 或下载试用。
3. 作为国内技术用户，我希望看到开源实现、技术栈和本地优先架构，以便判断项目是否值得关注。
4. 作为国内效率工具用户，我希望看到实际截图和使用场景，以便判断它能否帮我复盘工作时间。
5. 作为海外开发者，我希望看到清晰的英文定位和 GitHub 说明，以便理解这是一个 local-first AI desktop app。
6. 作为 macOS 用户，我希望下载和排障说明清楚，以便首次安装时不会因为系统安全提示放弃。
7. 作为 Windows 用户，我希望看到安装版和便携版说明，以便确认这个工具不是只支持 Mac。
8. 作为产品维护者，我希望每天记录 star 和渠道动作，以便知道哪些推广有效。
9. 作为潜在贡献者，我希望看到贡献入口和反馈入口，以便提交 Issue、PR 或建议。
10. 作为发布执行者，我希望有按周拆解的渠道计划，以便每天知道该做什么。

---

## Implementation Decisions

- **目标源**：新增 `PROJECT_GOALS.md`，把 2026-04-27 至 2026-05-30 达到 100+ stars 设为当前项目级目标。
- **PRD 归档**：新增第 18 期 PRD，沿用现有 `prd/PRD_十七期...` 的结构风格，加入运营指标与渠道计划。
- **渠道分层**：国内渠道和海外渠道分别设计，不共用同一套文案主轴。
- **平台表达**：所有核心传播资产都必须同时说明 macOS 与 Windows。
- **转化优先级**：先优化 GitHub README / Release / FAQ，再做大规模外部发布。
- **追踪节奏**：每日记录、每周复盘，用 star 曲线反向判断渠道有效性。

---

## Testing Decisions

- 本 PRD 属于运营与产品传播方案，不涉及应用代码测试。
- 文档验收以以下方式完成：
  - 检查 `PROJECT_GOALS.md` 是否明确记录目标周期、起始基线、目标值和关联 PRD。
  - 检查第 18 期 PRD 是否覆盖国内/海外用户、macOS/Windows、渠道计划、时间节奏、成功指标。
  - 检查文档中没有未定义占位符、矛盾目标或不可执行动作。
  - 执行发布前人工走查：README、Release、FAQ、截图、Demo、渠道文案是否一致指向 100 stars 目标。

---

## Out of Scope

- 本期不承诺新增应用功能，除非用户反馈暴露出影响下载、安装或首用转化的 P0 问题。
- 本期不做付费投放，优先使用开源社区、内容分发、社群转发和产品自身传播。
- 本期不把目标扩展为 500+ 或 1000+ stars，先聚焦 5/30 的 100+ stars。
- 本期不引入需要后端埋点的复杂增长分析系统，先使用 GitHub stars、Release 下载和人工记录。

---

## Further Notes

- 所有营销运营方案、推广方案、发布文案和截图资产，默认以 `PROJECT_GOALS.md` 中的目标为上游约束。
- 若 2026-05-30 前提前达到 100 stars，后续策略切换为“留存反馈 + 下一阶段 300 stars 目标”。
- Release note 必须保留 Mac 排障说明：

> If you see "TimeLens.app is damaged and can't be opened" on macOS, this is usually caused by the system quarantine attribute rather than actual file corruption. Run the command below in Terminal:
>
> `xattr -rd com.apple.quarantine "/Applications/TimeLens.app"`

---

## 附：与技能模板对齐的摘要

| 块 | 对应本节 |
|----|----------|
| Problem Statement | §1 + §0 |
| Solution | §2 + §5 + §6 + §7 |
| User Stories | User Stories |
| Implementation Decisions | Implementation Decisions |
| Testing Decisions | Testing Decisions |
| Out of Scope | Out of Scope |
| Further Notes | Further Notes |

（GitHub Issue 建议标题：**「V18：GitHub Star 增长推广与营销方案」**。）
