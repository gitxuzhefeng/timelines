# PRD：十七期 — 今日透视 · TimeLens Map 价值首屏（V17）

**版本**：v1.3 · 2026-04-27  
**修订说明（v1.3）**：在经历三轮方向讨论与可视化伴随校验后，本版与 **`prototype_v17_today_lens.html`（v4）** 完全对齐。核心变化：首屏改为「五节点辐射图谱（TimeLens Map）+ 左侧价值文案 + 强 CTA」，取代原有意图条/应用列表/管道面板；全面补充 i18n 兼容性设计。  
**上游基准**：`prd/PRD_十六期_工作链路图泳道可视化.md`  
**关联原型**：`prd/prototype_v17_today_lens.html`（v4，已定稿）  
**关联实现**：桌面端 Tauri + React（`project/`）  
**遵循规范**：`prd/TimeLens_产品迭代规范.md`

---

## 0. 用户深层需求（PRD_WHYNOW）

| 层次 | 深层需求 | 产品回应 |
|------|----------|----------|
| 第一眼吸引 | 不想再看统计，想看「我的一天被理解了」 | 首屏用一句带真实数据的判断 + TimeLens Map，不用表格与列表 |
| 差异化认知 | 需要感受到 TimeLens 与系统屏幕时间不同 | Map 明确展示窗口、OCR、会话、切换、本地分析五大能力 |
| 低认知负担 | 不想学新名词 | 按钮仍叫「时间线」「日报」，能力节点用一个中文词 + 一个数字 |
| 可继续探索 | 被吸引后，需要自然进入细节 | 时间线负责过程，日报负责总结，透视不重复两者 |

---

## 1. 背景与问题（PRD_BACKGROUND）

当前 `/lens` 是叙事片段 + 多段列表的混合，内容形态接近「浓缩版时间线 + 迷你报告」，视觉上也没有强记忆点。用户深层期待并不是再读一遍细节，而是：

1. **被吸引**：这个页面要有 TimeLens 独有的视觉记忆点。
2. **被理解**：不是 App 使用时长排行，而是工作上下文被还原出来。
3. **知道去哪**：要过程就去时间线，要总结就去日报。

---

## 2. 本迭代使命（PRD_MISSION）

| 阶段 | 本迭代聚焦 |
|------|------------|
| **十七期** | **① 将今日透视升级为 TimeLens 价值首屏 ② TimeLens Map：五节点辐射图谱（窗口 / OCR / 会话 / 切换 / 本地分析）③ 今日 Headline 含真实数据且每天可变 ④ 强 CTA：时间线（主）/ 日报（副）⑤ 全面 i18n 支持（中英文布局兼容）** |

**一句话（G0）**：用户打开今日透视后，3 秒内感到：**「TimeLens 在本地看懂了我今天的工作，我知道去哪里看细节。」**

---

## 3. 用户与场景（PRD_USERS）

### 3.1 主路径场景

| 场景 | 用户行为 | 期望体验 |
|------|----------|----------|
| 第一次打开 | 进入默认 `/lens` | 被 TimeLens Map 吸引，看懂产品差异化 |
| 日常复盘 | 打开今日透视 | 一句话知道今天主线是什么，附带深度工作时长 |
| 查具体过程 | 想知道今天做了什么 | 点击「打开时间线」 |
| 看叙事总结 | 想阅读当天结论 | 点击「打开日报」 |
| 切换语言 | 切到英文界面 | 布局不变，文案流畅，长词不截断 |

### 3.2 范围（PRD_SCOPE）

| P0（必做） | P1（尽量） | 不做 / 迁出 |
|------------|------------|-------------|
| 左文案 + 右 TimeLens Map 的两栏首屏布局 | Map 节点参数使用真实当日数据 | 首屏 Top 应用列表 |
| Headline：「今天的主线是 {{主线}}」+ 第二行「深度工作 {{时长}}，{{复盘一句}}」 | Headline 主线名称由意图 / Top 应用 / OCR 关键词保守推断 | 按小时条带 / 打断柱状图 / 剪贴板路径 |
| TimeLens Map 五节点（节点见 §5.2） | 节点点击可跳转对应数据页面 | 首屏展示完整管道健康 UI |
| 主按钮「打开时间线」（实心青色）/ 副按钮「打开日报」（描边） | 「问 AI」作为三级文字入口，不抢主 CTA | 在透视复述日报正文 |
| 能力微标签：本地优先 / 截图增强 / OCR 识别 / 上下文还原 | 标签可点击打开对应设置或说明 | 引入"证据链""工作记忆"等新造概念 |
| 全量 i18n（`zh-CN` / `en`，见 §6） | reduced-motion 降级 | 多语言除中英外 |

---

## 4. 约束与非功能（PRD_CONSTRAINTS）

1. **不造新词**：所有按钮、导航和核心入口使用用户已有认知（时间线、日报、设置），不引入新造名词。
2. **不仪表盘化**：首屏不放「开发深度 / 碎片化率 / 打断次数」等硬指标卡片，这些进入时间线或日报。
3. **突出核心竞争力**：Map 明确展示：窗口、截图/OCR、会话、切换、本地分析，正是 TimeLens 与系统屏幕时间的差异所在。
4. **本地优先**：页面文案与节点明确「本地分析 / 不联网 / 可回溯」。
5. **动画适度**：允许呼吸光、节点浮动、扫描线、主按钮 shimmer；必须支持 `prefers-reduced-motion: reduce`，触发后关闭所有动画只保留静态视觉层。
6. **契约优先复用**：P0 优先 `DailyAnalysisDto`；OCR 线索复用现有快照摘要或 `topApps`；无法可靠推断主线时使用保守降级文案。

---

## 5. 功能设计（PRD_FEATURES）

### 5.1 页面结构

```
App Shell
├── 侧边栏（56px，不变）
├── 顶栏（44px）：Live 指示 · 页面名 · 日期信息
└── 内容区（flex: 1, padding: 18px）
    └── Hero 卡片（grid: 5fr 7fr，圆角 28px，玻璃拟态）
        ├── 左：Copy 区
        │   ├── 眉行：日期 · 今日透视
        │   ├── H1：今天的主线是 {{主线}}。（两行，大字）
        │   ├── 副标题：深度工作 {{时长}}，{{复盘一句}}。
        │   ├── 主按钮：打开时间线（实心青色，带箭头图标 + 右侧小字）
        │   ├── 副按钮：打开日报（描边，带书本图标 + 右侧小字）
        │   └── 微标签行：本地优先 · 截图增强 · OCR 识别 · 上下文还原
        └── 右：TimeLens Map 区（相对定位容器）
            ├── 扫描线动画（position: absolute）
            ├── 图例栏（顶部：TimeLens Map · 今日活跃 Xh Xm）
            ├── SVG 层（辐射连线，与节点坐标系一致）
            ├── 中心卡片（今日识别 · 主线名 · MAIN THREAD · 时长）
            └── 五个能力节点（见 §5.2）
```

### 5.2 TimeLens Map 节点设计

节点坐标系：以 Map 容器为 100×100 的坐标系，中心位于 (50, 48)，半径 36，五节点按正五边形均匀分布（-90°, -18°, 54°, 126°, 198°）。

| 编号 | 节点 | 颜色 | 坐标 (%) | P0 数据来源 | 降级 |
|------|------|------|----------|------------|------|
| n1 | **窗口** | `#00f5d4`（青） | left:50, top:12 | `topApps` 前 3 名 | 「窗口上下文」 |
| n2 | **OCR** | `#9b7ed9`（紫） | left:79.5, top:36.8 | 快照 OCR 高频词 / 分析关键词 | 「OCR 识别」 |
| n3 | **切换** | `#d4a24c`（琥珀） | left:68.3, top:77.2 | `totalSwitches` | 「应用切换」 |
| n4 | **本地分析** | `#3d9b8b`（绿） | left:31.7, top:77.2 | 固定能力节点 | 始终显示 |
| n5 | **会话** | `#7c6fd4`（蓝紫） | left:20.5, top:36.8 | `deepWorkSegments` 数量 + 最长段时长 | 「会话分析」 |

**节点卡片结构**（每个节点包含）：
- 顶部色条（2px solid，对应节点颜色）
- 图标（圆角正方形背景，对应色系）+ 节点名（中文）
- 数值（大字，对应色，来自当日真实数据）
- 参数说明（小字 mono，简短中文）

### 5.3 SVG 连线规则

- `viewBox="0 0 100 100"` + `preserveAspectRatio="none"`，确保连线与 HTML 节点的 % 坐标系严格一致（节点 CSS `transform: translate(-50%,-50%)` + `left/top` 百分比与 SVG 坐标一一对应）。
- 每条线使用 `<linearGradient>`，颜色从中心出发（节点色 opacity 0.8）向端点淡出（opacity 0.15），不随容器变形而断裂。
- 虚线轨道圆：`r=35.6`，仅作参考，不作主视觉。
- 端点光点：各节点坐标处画直径 2.2 的填充圆，颜色与节点一致。

### 5.4 Headline 生成规则

```
主线推断优先级（按可信度）：
  1. 若 DailyReport 已生成 → 从 report 摘要提取主线（已有 AI 分析）
  2. 若 intentBreakdown 占比 > 40% → 使用占比最高意图名
  3. 若 topApps[0].duration > 总活跃 35% → 使用 Top 应用名
  4. 降级 → 不显示主线名，Headline 改为通用句

Headline 模板（中文）：
  有主线：「今天的主线是 {主线}。」+ 「深度工作 {deepWorkTotalMs}，{复盘一句}。」
  无主线：「TimeLens 整理好了今天的工作画像。」
  无数据：「今天的记录还不完整，生成分析后可查看。」

复盘一句规则（中性，最多 12 字）：
  fragmentationPct > 40% → 「下午切换偏多」
  interruptsInDeep > 10  → 「有较多通知打断」
  deepWorkTotalMs > 3h   → 「专注状态不错」
  otherwise              → 「」（空，不添加）
```

### 5.5 按钮与 CTA 设计

| 按钮 | 样式 | 行为 | 包含内容 |
|------|------|------|----------|
| 打开时间线（主） | 实心 `var(--tl-cyan)` 背景，深色文字，`box-shadow` 发光，shimmer 动画 | navigate `/timeline` + 当日日期 | 箭头图标 + 「打开时间线」 + 右侧小字「今天做了什么」 |
| 打开日报（副） | 描边 `rgba(255,255,255,.14)`，白色文字 | navigate `/report` + 当日日期 | 书本图标 + 「打开日报」 + 右侧小字「今日总结」 |
| 问 AI（三级） | 无背景文字链接 | 打开 AI 侧边栏 / 跳转 `/assistant` | 可选，不作为 P0 |

### 5.6 动画规格

| 动画 | 触发元素 | 时长 / 参数 | reduced-motion |
|------|----------|-------------|----------------|
| `pulseDot` | 顶栏实时指示点 | 2s ease-in-out infinite | 静态显示 |
| `shimmer` | 主按钮光效 | 3.8s ease-in-out infinite | 关闭 |
| `scanMove` | Map 扫描线 | 5.5s ease-in-out infinite | 关闭 |
| `corePulse` | 中心卡片呼吸光 | 4s ease-in-out infinite | 关闭 |
| `floatNode` | 五个能力节点 | 5s ease-in-out infinite，各 delay +0.7s | 关闭 |

---

## 6. 国际化兼容性设计（PRD_I18N）

### 6.1 新增 i18n Key 清单

所有 Key 需同步写入 `project/src/i18n/locales/zh-CN.json` 与 `project/src/i18n/locales/en.json`。

```jsonc
// 新增 Key（均在 todayLens 命名空间）
{
  "todayLens": {
    // Headline 模板
    "headlineWithThread": "今天的主线是{{thread}}。",
    "headlineNoThread": "TimeLens 整理好了今天的工作画像。",
    "headlineNoData": "今天的记录还不完整，生成分析后可查看。",
    "subDeepWork": "深度工作 {{duration}}",
    "subFragmented": "，下午切换偏多",
    "subInterrupted": "，有较多通知打断",
    "subFocused": "，专注状态不错",

    // 按钮
    "openTimeline": "打开时间线",
    "openTimelineHint": "今天做了什么",
    "openReport": "打开日报",
    "openReportHint": "今日总结",
    "askAi": "问 AI…",

    // 微标签
    "tagLocal": "本地优先",
    "tagScreenshot": "截图增强",
    "tagOcr": "OCR 识别",
    "tagContext": "上下文还原",

    // TimeLens Map
    "mapTitle": "TimeLens Map",
    "mapActiveToday": "今日活跃 {{duration}}",
    "coreLabel": "今日识别",
    "coreBadge": "MAIN THREAD",
    "coreTime": "{{duration}} 主线",

    // 五节点名称
    "nodeWindow": "窗口",
    "nodeOcr": "OCR",
    "nodeSwitch": "切换",
    "nodeLocal": "本地分析",
    "nodeSession": "会话",

    // 节点参数（降级）
    "nodeWindowFallback": "窗口上下文",
    "nodeOcrFallback": "OCR 识别",
    "nodeSwitchFallback": "应用切换",
    "nodeLocalSub": "不联网 · 可回溯",
    "nodeSessionFallback": "会话分析",

    // 节点参数（真实数据模板）
    "nodeWindowCount": "{{count}} 个应用",
    "nodeOcrCount": "{{count}} 条文本",
    "nodeSwitchCount": "{{count}} 次",
    "nodeSessionCount": "{{count}} 段",
    "nodeSessionLongest": "最长 {{duration}}",
    "nodeLocalValue": "纯本地",

    // 图例
    "eyebrow": "{{date}} · 今日透视",
    "topbarTitle": "Today Lens · Live",
    "topbarSub": "Local Work Intelligence"
  }
}
```

### 6.2 英文对应翻译

```jsonc
{
  "todayLens": {
    "headlineWithThread": "Today's main thread: {{thread}}.",
    "headlineNoThread": "TimeLens has mapped out today's work.",
    "headlineNoData": "Not enough data yet — generate an analysis to see today's picture.",
    "subDeepWork": "Deep work {{duration}}",
    "subFragmented": ", more switching in the afternoon",
    "subInterrupted": ", frequent notification interrupts",
    "subFocused": ", solid focus today",

    "openTimeline": "Open Timeline",
    "openTimelineHint": "See what you did today",
    "openReport": "Open Daily Report",
    "openReportHint": "Today's summary",
    "askAi": "Ask AI…",

    "tagLocal": "Local-first",
    "tagScreenshot": "Screenshot engine",
    "tagOcr": "OCR",
    "tagContext": "Context restore",

    "mapTitle": "TimeLens Map",
    "mapActiveToday": "{{duration}} active today",
    "coreLabel": "Today's insight",
    "coreBadge": "MAIN THREAD",
    "coreTime": "{{duration}} on main thread",

    "nodeWindow": "Window",
    "nodeOcr": "OCR",
    "nodeSwitch": "Switches",
    "nodeLocal": "Local analysis",
    "nodeSession": "Sessions",

    "nodeWindowFallback": "Window context",
    "nodeOcrFallback": "OCR scanning",
    "nodeSwitchFallback": "App switching",
    "nodeLocalSub": "No cloud · Traceable",
    "nodeSessionFallback": "Session analysis",

    "nodeWindowCount": "{{count}} apps",
    "nodeOcrCount": "{{count}} texts",
    "nodeSwitchCount": "{{count}} switches",
    "nodeSessionCount": "{{count}} sessions",
    "nodeSessionLongest": "Longest {{duration}}",
    "nodeLocalValue": "Local only",

    "eyebrow": "{{date}} · Today Lens",
    "topbarTitle": "Today Lens · Live",
    "topbarSub": "Local Work Intelligence"
  }
}
```

### 6.3 布局兼容性注意事项

#### 文案长度差异

| 元素 | 中文 | 英文 | 处理方案 |
|------|------|------|----------|
| Headline H1 | 「今天的主线是 v17 设计。」≈ 14 字 | 「Today's main thread: v17 design.」≈ 32 字 | 字号使用 `clamp(28px, 3.2vw, 44px)`；英文自然换行不截断；设 `max-width: 30rem` 防止过宽 |
| 副标题 | ≈ 14 字 | ≈ 28 字 | `max-width: 300px`（英文可宽至 340px）；两行内排完，超出不截断 |
| 主按钮文字 | 「打开时间线」5 字 | 「Open Timeline」2 词 | 按钮 `min-width: 180px`，内容不换行；英文宽度自然撑开但不超过父容器 |
| 节点名称 | 2～4 字 | 1～2 词（Window / Sessions） | 节点固定宽 148px，名称 `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` 但实际不会超出 |
| 节点参数 | ≈ 8 字 | ≈ 12 字 | `font-size: 10px mono`，允许最多两行，节点高度自适应 |
| 微标签 | 3～4 字每个 | 3～12 字每个（Local-first / Screenshot engine） | flex-wrap + 自适应宽度；英文长标签用较细字号 10px；行高保持两行内 |

#### 特殊处理

1. **日期格式**：
   - 中文：`2026年4月27日 · 今日透视`
   - 英文：`April 27, 2026 · Today Lens`
   - 实现：`t('todayLens.eyebrow', { date: formatDate(date, locale) })`

2. **数字与单位**：
   - 时长用 `formatDurationMs(ms)`，已有中英文实现，直接复用。
   - 节点数值（「3 个应用」/ 「3 apps」）通过 i18n key + count 参数，避免硬编码「个」。

3. **Headline 拼接**：
   - 不直接拼接字符串，使用完整模板 key（`headlineWithThread`）让翻译人员控制语序。
   - 英文：`"Today's main thread: {{thread}}."`，中文语序与英文不同，模板分离避免顺序问题。

4. **MAIN THREAD badge**：
   - 保持英文不翻译（是技术标记，类似「AI」不翻译），两种语言一致。

5. **「Local Work Intelligence」顶栏副标题**：
   - 保持英文（产品 slogan，设计上就是英文）；中文界面也使用英文，与原型一致。

---

## 7. 验收标准（PRD_ACCEPTANCE）

| ID | 验收项 | 检查方式 |
|----|--------|----------|
| A1 | 首屏可见：Headline + TimeLens Map + 两个主 CTA | 常见桌面窗口无需滚动 |
| A2 | Headline 显示今日主线 + 深度工作时长（有数据时），不使用"证据链""工作记忆"等新词 | 代码审查 + 手工走查 |
| A3 | TimeLens Map 五个节点均显示，SVG 连线端点精确落在节点中心 | 视觉核查（中英两种语言） |
| A4 | 主按钮「打开时间线」视觉权重明显高于副按钮「打开日报」 | 视觉走查 |
| A5 | 切换到英文后：Headline / 按钮 / 节点名 / 微标签无截断、无溢出、无错位 | 英文 locale 手工核查 |
| A6 | 英文长标签（如「Screenshot engine」）在微标签行不破坏布局 | 英文 locale 截图对比 |
| A7 | `prefers-reduced-motion: reduce` 下所有动画停止，视觉层次保持 | Chrome devtools 模拟 |
| A8 | 无数据 / 无分析时，降级文案正常显示（中英两种），页面不白屏 | 模拟空数据测试 |
| A9 | `npm run build` + i18n key 完整性检查通过 | CI / 本地构建 |

---

## 8. 降级与失败 UX（PRD_DEGRADE）

| 情景 | 降级行为 |
|------|----------|
| 无 `DailyAnalysisDto` | Headline 改为 `headlineNoData`；Map 中心卡片显示「生成分析后可查看」；五节点仍显示能力描述（固定降级文案） |
| 主线无法推断 | 使用 `headlineNoThread`，不强行填入空值 |
| 节点真实数据缺失 | 对应节点显示降级文案（见 §5.2 降级列），不隐藏节点，保持 Map 完整性 |
| OCR 不可用 | OCR 节点显示「OCR 未启用」，加可点击提示链接到权限设置 |
| 动画关闭（reduced-motion） | 所有 keyframe 动画禁用；中心卡片静态发光；节点静止显示 |

---

## 9. 模块拆分（Implementation Decisions）

### 9.1 新增 / 重构文件

| 文件路径（相对 `project/src`） | 类型 | 说明 |
|-------------------------------|------|------|
| `pages/TodayLensPage.tsx` | 重构 | 主页面改用 `TodayLensHero` 组件；保留原有 `generateDailyAnalysis` 逻辑 |
| `components/lens/TodayLensHero.tsx` | 新增 | 两栏 Hero 卡片容器，接收 `LensViewModel` |
| `components/lens/TimeLensMap.tsx` | 新增 | 右侧 Map 区：SVG 连线 + 中心卡片 + 五节点 |
| `components/lens/LensMapNode.tsx` | 新增 | 单个能力节点，接收 `LensNodeData` |
| `components/lens/LensCtaButtons.tsx` | 新增 | 主副按钮组，接收 `onTimeline` / `onReport` 回调 |
| `lib/lensViewModel.ts` | 新增 | 纯函数：`DailyAnalysisDto` → `LensViewModel`（含 headline 推断、节点数据映射） |
| `i18n/locales/zh-CN.json` | 修改 | 新增 `todayLens.*`（见 §6.1） |
| `i18n/locales/en.json` | 修改 | 新增 `todayLens.*`（见 §6.2） |

### 9.2 视图模型接口（LensViewModel）

```typescript
// lib/lensViewModel.ts
export interface LensViewModel {
  date: string;                    // 已格式化，按 locale
  headline: string;                // 完整 headline 字符串，已由 lensViewModel 生成
  subline: string;                 // 副标题，已由 lensViewModel 生成
  activeFormatted: string;         // formatDurationMs(totalActiveMs)
  nodes: LensNodeData[];           // 5 个节点，顺序固定
  degraded: boolean;
  degradedKeys: string[];
}

export interface LensNodeData {
  id: 'window' | 'ocr' | 'switch' | 'local' | 'session';
  colorHex: string;
  valueI18nKey: string;            // 如 'todayLens.nodeWindowCount'
  valueI18nParams: Record<string, string | number>;
  subI18nKey: string;
  subI18nParams?: Record<string, string | number>;
  isFallback: boolean;             // 是否使用降级文案
}
```

### 9.3 架构决策

- **纯函数视图模型**：`lensViewModel.ts` 不依赖 React，输入 DTO 输出 ViewModel，方便单测。
- **CSS 动画优先**：不引入 Framer Motion 等库，全用 `@keyframes`；统一通过 `useReducedMotion()` hook 读取系统偏好，注入 `data-motion="reduce"` 到 Hero 根元素，CSS 中用 `@media (prefers-reduced-motion: reduce)` 降级。
- **SVG 坐标一致性**：`viewBox="0 0 100 100" preserveAspectRatio="none"` + 节点 `left/top` 百分比，两者共享同一坐标系，不受容器宽高比变化影响，无需 JS 动态计算。
- **旧模块处理**：原流程片段、剪贴板、打断图、管道健康默认不在首屏显示，可迁至日报或时间线侧边栏；如有用户反馈再评估是否保留折叠入口。

---

## 10. 测试决策（Testing Decisions）

| 测试类型 | 覆盖点 |
|----------|--------|
| 单元测试（`lensViewModel.test.ts`） | 有 DTO → 正确生成 headline / 节点数据；各降级路径（无分析、无主线、无 OCR）→ 对应降级值 |
| i18n 完整性测试 | `zh-CN.json` 与 `en.json` Key 集合一致；无缺失 Key |
| 布局快照测试（可选） | 英文 locale 渲染后不产生溢出（`overflow: hidden` 组件无文字被裁切） |
| 手工 E2E | reduced-motion 下动画停止；各节点无数据时降级显示；时间线 / 日报按钮跳转正确页面 |

---

## Out of Scope

- 在今日透视内重做时间线级可视化。
- 在今日透视内承载完整日报正文。
- 节点点击跳转（P1，不在本期内）。
- 跨日趋势 / 周报对比。

---

## Further Notes

- **产品分工**：`lens` = 价值首屏 + 今日入口；`timeline` = 事实与过程；`report` = 总结与叙事。
- **截图价值**：此页可作为 TimeLens 主要宣传截图（README / 官网），设计时应兼顾截图美观。
- 发布说明：「今日透视升级为 TimeLens Map，展示本地工作智能与时间线 / 日报入口。」
- Mac 隔离属性提示仍按 `CLAUDE.md` Release 约定保留。

---

## 附：GitHub Issue 建议

标题：**`V17：今日透视 — TimeLens Map 价值首屏`**

```
相关文件：
- PRD：prd/PRD_十七期_今日透视信息架构与可视化升级.md
- 原型：prd/prototype_v17_today_lens.html（v4 定稿）

核心变化：
- 首屏改为 TimeLens Map 五节点辐射图谱
- Headline 含真实数据，每天可变
- 主按钮实心强对比；副按钮描边
- 全量 i18n（中英文布局兼容）
- reduced-motion 支持
```
