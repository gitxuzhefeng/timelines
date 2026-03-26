🦞 TimeLens - AI 个人时间追踪应用
产品定位
一句话描述：AI 驱动的个人时间透视镜，自动记录电脑使用情况，智能分析并生成每日总结。
目标用户：程序员、设计师、知识工作者、自由职业者、学生

---
核心价值
1. 无感记录 - 后台自动追踪，无需手动操作
2. AI 分类 - 自动识别活动类型（编程/开会/文档/摸鱼）
3. 每日洞察 - 每天知道自己时间都去哪了
4. 飞书集成 - 每日报告直接推送到飞书

---
功能清单
1. 数据采集（客户端）
功能
描述
优先级
窗口追踪
记录活跃窗口/应用名称
P0
时间分块
自动识别连续工作段
P0
键盘/鼠标活动
检测是否在活跃使用电脑
P1
关键截屏
检测任务切换时轻量截屏（可关闭）
P2
隐私过滤
自动跳过密码/银行等敏感页面
P1
2. AI 分析
功能
描述
优先级
活动分类
AI 自动归类：Coding/开会/写文档/刷网页/摸鱼
P0
时间占比统计
每个类别占用时间及百分比
P0
模式识别
识别高效时段、周期模式
P1
异常检测
检测异常长时间消耗
P1
意图猜测
对不确定的活动请用户确认
P1
3. 每日报告
功能
描述
优先级
飞书推送
每天固定时间推送报告到飞书
P0
时间线视图
可视化一天的时间分布
P0
生产力评分
基于活动类型计算分数
P1
对比分析
与昨天/上周对比
P2
用户补充
用户可修正 AI 分类
P1
4. 设置中心
功能
描述
优先级
追踪开关
随时开启/暂停追踪
P0
截屏开关
可关闭截屏功能
P1
敏感应用
用户指定不追踪的应用
P1
推送时间
设置每日报告推送时间
P1
数据存储
本地/云端选择
P2

---
页面结构
客户端主界面
┌─────────────────────────────────────────────────────┐
│  TimeLens                              [_] [□] [X] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────┐  ┌────────────────────────────────┐ │
│  │ 今日概览 │  │  时间线                          │ │
│  │          │  │                                 │ │
│  │ 8h 32m   │  │  09:00-12:00 💻 编程            │ │
│  │ 生产力   │  │    VSCode: 2h                   │ │
│  │ 85分 ↑   │  │    Chrome: 30m                  │ │
│  │          │  │                                 │ │
│  └──────────┘  │  14:00-18:00 📞 会议            │ │
│                │    Zoom: 1.5h                    │ │
│  ┌──────────┐  │    飞书文档: 2.5h               │ │
│  │ 时间分布  │  │                                 │ │
│  │          │  └────────────────────────────────┘ │
│  │ ██████░░ │                                      │
│  │ 编程 51% │  ┌────────────────────────────────┐ │
│  │ ███░░░░ │  │ 📸 今日关键帧 (可选展示)        │ │
│  │ 会议 26%│  │ [图1] [图2] [图3] [图4]         │ │
│  └──────────┘  └────────────────────────────────┘ │
│                                                     │
└─────────────────────────────────────────────────────┘

飞书每日报告
┌─────────────────────────────────────────────────────┐
│  🦞 每日时间报告 - 2026年3月17日 周二               │
├─────────────────────────────────────────────────────┤
│                                                     │
│  📊 今日数据                                        │
│  ├── 总计工时：8h 32m                               │
│  ├── 生产力：85分 (↑ 12%)                           │
│  └── 高效时段：上午 (9-12点)                        │
│                                                     │
│  📈 时间分布                                        │
│  ├── 💻 编程：4h 20m (51%)                        │
│  ├── 📞 会议：2h 15m (26%)                        │
│  ├── 📝 文档：1h (12%)                            │
│  └── 🌐 其他：57m (11%)                            │
│                                                     │
│  🔍 AI 洞察                                        │
│  ├── "今天下午 2-4 点会议集中，建议分散到上午"      │
│  ├── "你今天写了 3 个函数，比昨天多 1 个"           │
│  └── "15:30 有 30 分钟用在微信上，可以设个提醒"    │
│                                                     │
│  ❓ 需要你确认 (点击链接补充)                        │
│  ├── 14:30-15:00 在做什么？                        │
│  └── 16:00 截图内容是什么？                         │
│                                                     │
└─────────────────────────────────────────────────────┘


---
技术架构
客户端 (Tauri)
- 窗口追踪：使用 platform crate 获取活跃窗口
- 截屏：按需截取（任务切换时），不全程录制
- 数据存储：本地 SQLite + 加密
- 上传：每日压缩上传到云端
云端服务
- 数据存储：PostgreSQL + ClickHouse（时序数据）
- AI 分析：调用 LLM 进行活动分类和洞察生成
- 报告生成：模板化 + AI 个性化
飞书集成
- 推送：通过飞书 Webhook 或应用消息
- 报告：生成飞书消息卡片

---
商业模式
版本
价格
功能
免费版
¥0
基础追踪 + 简单周报
付费版
¥30/月
AI 每日总结 + 洞察 + 多设备
企业版
定制
团队时间管理

---
里程碑
[] MVP：本地追踪 + 飞书推送（2周）
[] V1.0：AI 分类 + 每日报告（1个月）
[] V1.5：生产力分析 + 对比功能（2个月）
[] V2.0：公开发布

---
Created by 银月 🦞

---
技术架构设计
1. 技术选型
客户端框架对比
维度
Tauri 2.0
Electron
体积
5-10 MB
150-200 MB
性能
更快
较慢
内存
占用低
占用高
生态
Rust + JS
纯 JS 生态丰富
打包
简单
复杂
中文社区
发展中
成熟
推荐：Tauri 2.0 - 轻量、性能好、对飞书生态友好
AI 分析方案
方案
成本
延迟
定制化
OpenAI API
中
快
中
Claude API
中
快
高
本地模型 (Llama)
高（需要显卡）
慢
高
飞书 AI
低
快
中
推荐：先用 飞书 AI / Claude API - 成本可控，效果好

---
2. 系统架构图
┌─────────────────────────────────────────────────────────────────────┐
│                           用户设备                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    TimeLens 客户端 (Tauri)                     │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  │  │
│  │  │  窗口追踪器   │  │   截屏模块    │  │    数据处理模块    │  │  │
│  │  │  (Rust)      │  │   (Rust)     │  │    (Rust + JS)    │  │  │
│  │  └──────────────┘  └──────────────┘  └────────────────────┘  │  │
│  │         ↓                  ↓                   ↓              │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │              本地存储 (SQLite + 加密)                    │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │                            ↓ 每日上传                          │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓ HTTPS
┌─────────────────────────────────────────────────────────────────────┐
│                          云端服务 (Vercel / 自建)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │
│  │  API Gateway │  │  用户服务    │  │  数据服务    │               │
│  │  (路由 + 鉴权) │  │  (用户管理)  │  │  (PostgreSQL)│               │
│  └─────────────┘  └─────────────┘  └─────────────┘               │
│         ↓                ↓                ↓                         │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                     AI 分析 Pipeline                           │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │ │
│  │  │ 数据清洗  │→ │ 活动分类  │→ │ 模式识别  │→ │ 报告生成    │  │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └─────────────┘  │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                           飞书通知                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  每日报告卡片 (消息推送) ←→ 用户补充反馈                     │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘


---
3. 数据流设计
3.1 追踪数据流
时刻 T: 活跃窗口变化
    │
    ↓
┌─────────────────┐
│  获取窗口信息   │  App名称 + 窗口标题
│  (platform crate)│
└────────┬────────┘
         ↓
┌─────────────────┐
│  隐私过滤       │  检查是否敏感窗口
│  (白名单/黑名单)│  是 → 跳过
└────────┬────────┘
         ↓
┌─────────────────┐
│  本地 SQLite    │  记录: 时间戳, App, 标题, 时长
│  (批量写入)     │
└────────┬────────┘
         ↓
┌─────────────────┐
│  定时压缩上传   │  每天凌晨 / WiFi下自动
│  (gzip + HTTPS) │
└─────────────────┘

3.2 AI 分析流程
收到今日数据
       ↓
┌─────────────────┐
│  1. 数据清洗    │  去除异常值、合并短间隔
└────────┬────────┘
         ↓
┌─────────────────┐
│  2. 活动分类    │  LLM 根据 App 名 + 标题
│  (Prompt 工程)  │  判断: 编程/会议/文档/摸鱼
└────────┬────────┘
         ↓
┌─────────────────┐
│  3. 模式识别    │  高效时段、周期规律
│  (规则 + LLM)  │  "周二上午效率高"
└────────┬────────┘
         ↓
┌─────────────────┐
│  4. 洞察生成    │  LLM 生成个性化建议
│  (Prompt 工程)  │
└────────┬────────┘
         ↓
┌─────────────────┐
│  5. 报告组装    │  生成飞书消息卡片
└────────┬────────┘
         ↓
   推送到飞书


---
4. 核心模块设计
4.1 窗口追踪模块
技术点：
- macOS: NSWorkspace API → 活跃 App
- Windows: GetForegroundWindow + GetWindowText
数据结构：
struct WindowEvent {
    timestamp: i64,           // Unix ms
    app_name: String,         // "VSCode"
    app_bundle: Option<String>, // "com.microsoft.VSCode"
    window_title: String,    // "main.ts - myproject"
    duration_ms: i64,        // 持续时间
    is_active: bool,         // 是否正在使用
}

4.2 隐私过滤模块
类型
处理方式
密码输入框
检测到立刻暂停
银行/支付页面
白名单跳过
敏感应用
用户自定义黑名单
截屏
仅在非敏感窗口触发
4.3 AI 分类 Prompt（示例）
你是一个时间分析专家。请根据以下用户今天使用电脑的记录，进行分类：

记录格式：[时间] App名称 - 窗口标题

---
今天记录：
09:00 VSCode - main.ts
09:30 Chrome - GitHub Pull Request
10:00 Zoom - Team Standup
10:30 Slack - #general
...
---

请按以下格式输出：
1. 分类统计：编程 X小时，会议 Y小时，文档 Z小时...
2. 关键洞察：3条最有价值的观察
3. 建议：1条改进建议

只输出 JSON 格式：
{"categories": {...}, "insights": [...], "suggestions": [...]}


---
5. 数据库设计
5.1 本地 SQLite（客户端）
-- 窗口事件表
CREATE TABLE window_events (
    id INTEGER PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    app_name TEXT NOT NULL,
    app_bundle TEXT,
    window_title TEXT,
    duration_ms INTEGER DEFAULT 0,
    synced INTEGER DEFAULT 0
);

-- 用户设置表
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- 每日统计缓存
CREATE TABLE daily_stats (
    date TEXT PRIMARY KEY,  -- YYYY-MM-DD
    total_ms INTEGER,
    stats_json TEXT,        -- 分类统计 JSON
    ai_insights TEXT,
    created_at INTEGER
);

5.2 云端 PostgreSQL
-- 用户表
CREATE TABLE users (
    id UUID PRIMARY KEY,
    feishu_open_id TEXT UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    settings JSONB
);

-- 每日记录
CREATE TABLE daily_records (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    date DATE NOT NULL,
    events_json JSONB,        -- 原始事件
    categories_json JSONB,   -- AI 分类结果
    insights JSONB,          -- AI 洞察
    productivity_score INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- 用户反馈（纠正 AI 分类）
CREATE TABLE corrections (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    date DATE,
    time_range TEXT,        -- "09:00-10:00"
    original_label TEXT,
    corrected_label TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);


---
6. API 设计
6.1 客户端 → 云端
接口
方法
说明
/api/v1/upload
POST
上传每日数据（ gzip 压缩）
/api/v1/sync
GET
获取云端配置
/api/v1/feedback
POST
上传用户纠正反馈
6.2 云端 → 飞书
接口
说明
消息推送 API
每日报告卡片
Webhook
实时通知（可选）

---
7. 安全设计
层面
措施
传输
HTTPS + TLS 1.3
本地存储
SQLite 文件加密（AES-256）
隐私
敏感数据不上云（可选本地分析）
权限
OAuth 2.0 飞书登录
截屏
本地处理，不上传原图

---
8. 部署架构
┌─────────────────────────────────────────────────────────┐
│                      开发阶段                            │
├─────────────────────────────────────────────────────────┤
│  客户端 → Vercel Serverless → PostgreSQL (Supabase)   │
│                      ↓                                  │
│                   飞书测试号                             │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                      生产阶段                            │
├─────────────────────────────────────────────────────────┤
│  客户端 → Cloudflare Workers → 云服务器                 │
│                      ↓                                  │
│              PostgreSQL + Redis                         │
│                      ↓                                  │
│                   飞书企业应用                          │
└─────────────────────────────────────────────────────────┘


---
9. 技术栈总结
层级
技术
客户端
Tauri 2.0 + React + TypeScript
追踪核心
Rust (platform crate)
本地存储
SQLite (rusqlite)
云端
Node.js / Go / Python
数据库
PostgreSQL + Redis
AI
Claude API / 飞书 AI
部署
Vercel / Cloudflare / 自建
推送
飞书消息卡片 Webhook

---
技术架构版本: v1.0 | 最后更新: 2026-03-17

---
技术选型确认
最终决定
层级
技术选型
理由
客户端框架
Tauri 2.0
轻量(5-10MB)、性能好、 Rust 生态成熟
前端
React + TypeScript
生态好、开发效率高
追踪核心
Rust (platform crate)
跨平台、性能好
本地存储
SQLite (rusqlite)
轻量、嵌入式
云端
Node.js (Next.js)
快速开发、Serverless 好部署
数据库
PostgreSQL (Supabase)
免费版够用、JSON 支持好
AI
Claude API
效果比 GPT 好，中文理解强
部署
Vercel
免费额度够用国内访问快
飞书推送
Webhook
简单稳定

---
交互原型细化
1. 客户端主界面
┌─────────────────────────────────────────────────────────────────┐
│  🦞 TimeLens                              [开机] [设置] [X]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────┐  ┌─────────────────────────────────┐ │
│  │    📊 今日概览      │  │       📅 2026年3月17日          │ │
│  │                     │  │                                 │ │
│  │   总计工时          │  │   09:00-12:00 💻 编程           │ │
│  │   8h 32m            │  │   ├─ VSCode: 2h                │ │
│  │                     │  │   ├─ Chrome: 30m (GitHub)       │ │
│  │   ⬆ 12%             │  │   └─ Terminal: 30m             │ │
│  │   生产力 85分        │  │                                 │ │
│  │                     │  │   14:00-18:00 📞 会议           │ │
│  └─────────────────────┘  │   ├─ Zoom: 1.5h                 │ │
│                           │   └─ 飞书文档: 2.5h              │ │
│  ┌─────────────────────┐  │                                 │ │
│  │    📈 时间分布       │  │   19:00-22:00 📝 文档          │ │
│  │                     │  │   └─ Notion: 3h                 │ │
│  │  ████████████░░░░░  │  │                                 │ │
│  │  💻 编程    51%     │  └─────────────────────────────────┘ │
│  │  📞 会议    26%     │                                      │
│  │  📝 文档    12%     │  ┌─────────────────────────────────┐ │
│  │  🌐 其他    11%     │  │    🔍 AI 洞察                   │ │
│  │                     │  │                                 │ │
│  └─────────────────────┘  │   "下午会议集中，建议分散到上午" │ │
│                           │   "今天写了3个函数，进步了!"     │ │
│  ┌─────────────────────┐  │                                 │ │
│  │    ⚡ 高效时段      │  └─────────────────────────────────┘ │
│  │                     │                                      │
│  │   上午 9-12点       │  ┌─────────────────────────────────┐ │
│  │   ⬆ 生产力 92分    │  │    ⚙️ 设置                      │ │
│  └─────────────────────┘  │   [ ] 追踪中   [ ] 截屏         │ │
│                           │   推送时间: 21:00              │ │
└─────────────────────────────────────────────────────────────────┘

2. 每日推送（飞书）
┌─────────────────────────────────────────────────────────────────┐
│  🦞 每日时间报告                    📅 2026年3月17日 周二      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📊 今日数据                                        ▶ 查看详情  │
│  ┌─────────────┬─────────────┬─────────────┐                   │
│  │   8h 32m    │    85分     │    ↑ 12%    │                   │
│  │   总工时     │   生产力    │   变化      │                   │
│  └─────────────┴─────────────┴─────────────┘                   │
│                                                                 │
│  📈 时间分布                                                    │
│  │████████████░░░░░░░░░░░░│ 51% 💻 编程 (4h 20m)            │
│  │██████████░░░░░░░░░░░░░│ 26% 📞 会议 (2h 15m)            │
│  │████░░░░░░░░░░░░░░░░░░░│ 12% 📝 文档 (1h)                │
│  │███░░░░░░░░░░░░░░░░░░░░│ 11% 🌐 其他 (57m)               │
│                                                                 │
│  🔍 AI 洞察                                                    │
│  • 今天下午 2-4 点会议集中，建议分散到上午                       │
│  • 你今天写了 3 个函数，比昨天多 1 个                           │
│  • 15:30 有 30 分钟用在微信上，可以设个提醒                     │
│                                                                 │
│  ─────────────────────────────────────────────                  │
│                                                                 │
│  ❓ 需要你确认                                    [补充修正 ↓]  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 14:30-15:00 这段时间在做什么？                             ││
│  │ [ ] 开会  [ ] 摸鱼  [ ] 写代码  [ ] 其他                  ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

3. 设置页面
┌─────────────────────────────────────────────────────────────────┐
│  ⚙️ TimeLens 设置                              [返回]          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  🔴 追踪状态              [开启中]                      │   │
│  │     点击暂停/开始追踪                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  📸 截屏                                                       │
│  [开启]  关键节点自动截屏（可关闭）                            │
│                                                                 │
│  🔒 隐私                                                       │
│  ├ 敏感应用（黑名单）                                    [+] │
│  │   • 1Password                                           │   │
│  │   • 银行类 App                                          │   │
│  │                                                         │   │
│  ├ 密码输入时暂停           [✓]                            │   │
│  │                                                         │   │
│  └ 截屏时模糊敏感内容       [✓]                            │   │
│                                                                 │
│  📬 推送                                                       │
│  ├ 每日报告时间              [21:00 ▼]                       │   │
│  │                                                         │   │
│  └ 推送方式                  [飞书 ▼]                        │   │
│                                                                 │
│  💾 数据                                                       │
│  ├ 存储位置                  [本地 ▼]                       │   │
│  │                                                         │   │
│  └ 数据保留                  [30天 ▼]                       │   │
│                                                                 │
│  👤 账户                                                       │
│  └ 飞书绑定                    [已绑定: 用户078694]          │   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘


---
开发计划与产品演进规划 (Roadmap)

### 一期迭代：核心闭环与单机可用 (MVP)
**核心目标**：跑通“数据采集（含全维图片） - 本地存储 - 调试与基础概览”的最小可行性闭环，让应用能在真实场景中无感运行，并能通过调试模式直观验证抓取质量。
**交付周期**：预计 2-3 周
**主要特性**：
1. **智能截图与轻量级追踪**：
   - 采用**智能截图（抽帧）**记录：在“活动窗口切换”、“标题发生明显变化”，或在持续活动的窗口按固定时间阈值（如 10/20 秒 1 帧）截取屏幕并强压缩为 WebP 图像。
   - **深层上下文记录**：不仅记录“应用名称（如 Chrome）”，更必须精准抓取“具体窗口标题（如：向 GPT 提问、观看 YouTube 视频）”及该标题停留的准确时间窗口，将其与这间隙截取的图片在 SQLite 中强绑定。
2. **平铺化本地时序看板 (Flat Timeline Dashboard)**：
   - 放弃首版复杂的花哨组件。面板忠实且顺滑地以时间轴形式罗列抓取到的系统日志。用户可以像查阅 Log 一样清晰地看到线性的时间分布（如：`10:00 Google 搜索` -> `10:05 VS Code`），并可直接交互预览带有精确时间戳的截屏流。
3. **正常/调试双模式架构**：
   - **正常模式 (Normal Mode)**：隐居于托盘，极致低耗静默运行。
   - **调试模式 (Debug Mode/Developer View)**：专为开发者与极客设计。实时可视化展示监控日志，并在面板上以走马灯形式滚动展示最新截取的屏幕快照流和本地 SQLite 写入事件，便于直观验证抓取功能的健壮性；并提供一键打开本地黑盒目录的功能。
4. **纯本地安全地基**：建立本地固定的存储路径（如 `~/.timelens/data/shots/`）。所有捕捉的图片流帧和时序存根均在这个私有文件夹内妥当安置，杜绝任何上云隐患。一期禁止接入任何外部 API 通信，确保绝对静默与安全。

### 二期迭代：多模态 AI 深度赋能与智能洞察 (V1.0)
**核心目标**：通过接入支持多模态分析的大模型，完成从“纯文本流追踪”向“全视域感知效率教练”的质变。
**交付周期**：预计 3-4 周
**主要特性**：
1. **多模态上下文语义归类**：抛弃单纯依赖窗口名的瞎猜，接入原生支持图片分析的多模态大模型（如 Claude 3.5 Sonnet 或 GPT-4o），将一期收集到的**关键帧截图与窗口标题组合“喂”给大模型**，从而精准还原你的工作意图（例如：屏幕显示着复杂的代码 IDE，标题是 `bug-fix`，AI 精确标记为“攻坚代码排错”）。
2. **AI 高级洞察引擎**：发掘数据的规律并输出建设性建议（例如：“AI 注意到您今天下午在多个聊天工具和文档之间反复横跳查资料，您的深度专注时间被打断”）。
3. **针对性过滤与安全**：配合本地 OCR （可选），过滤掉明显含有银行账户、密码输入的界面，保护高危截图彻底不参与 AI 归类上传。
4. **高级看板机制与启发式折叠**：
   - 解决一期流水账存在信息过载的痛点。自动处理“跨应用的短时高频焦点切换”（如敲两下代码查一下 Chrome 再回终端），合并显示为一个「交叉工作流」块，折叠琐碎记录，降低认知负担。
5. **绝对空闲检测 (AFK Detection)**：
   - 通过调用操作系统层的键盘与鼠标移动监听机制（确保不记录击键，只判定行为），在用户离开电脑超过设定阈值时插入“离线”桩点，剔除挂机水分。
6. **每日报告自动推送**：
   - 将 AI 加工好的结构化精美总结每天按时通过 Webhook 发向用户的飞书端，形成产品的最后一道闭环。
7. **闭环的数据纠偏**：在报告及客户端提供高频纠偏入口，用户的一键修正可以反馈作为后续 AI 系统理解其特定习惯的参照。

### 三期迭代：全平台协同与探索商业化团队版 (V2.0)
**核心目标**：打破单设备的孤岛边界，甚至将应用对象从“单一用户”拓展至“敏捷型小微团队”。
**交付周期**：长期规划
**主要特性**：
1. **多设备云端漫游**：上线安全可靠的云端时序数据库（如基于 Supabase 或 ClickHouse），将个人的多台设备（办公机、家用机）数据链合并拼图，形成全天候时间账单。
2. **产出生态深度互联**：开放或接入其它生产力平台的 API（与 GitHub 的 Commits/PR，或者 Notion 的 Ticket 相结合），将纯粹的“耗时”交叉对比衡量出实际的“吞吐产能”。
3. **团队效能面板 (B 端探索)**：允许小团队订阅，经过员工数据脱敏与汇总处理后，能够为敏捷教练展示“团队被不合理的会阻断多少开发时间”，直接从提升公司运转效率上获取商业价值。

---
下一步行动
[] 确认技术选型（今天）
[] 准备开发环境（Rust + Node.js）
[] 申请飞书 Webhook 测试号

---
开发计划版本: v1.0 | 最后更新: 2026-03-17

---
AI 驱动开发准备清单
1. 开发环境准备
工具
用途
要求
Node.js 18+
前端开发、API 服务
必须
Rust 1.70+
Tauri 客户端核心
必须
pnpm / npm
包管理
推荐 pnpm
Git
版本控制
必须
VS Code
开发 IDE
推荐
Docker
本地数据库/服务
可选
检查命令：
node --version    # 需要 >= 18
rustc --version   # 需要 >= 1.70
pnpm --version


---
2. 账号与权限准备
服务
用途
获取方式
飞书开发者后台
创建应用获取 Webhook
https://open.feishu.cn/
Supabase
免费 PostgreSQL + 认证
https://supabase.com/
Vercel
前端 + API 部署
https://vercel.com/
Claude API / OpenAI
AI 分析
需要 API Key

---
3. AI 驱动开发工作流
┌─────────────────────────────────────────────────────────────────┐
│                    AI 辅助开发流程                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1️⃣ 需求分析      ← 你 + 我讨论 PRD                           │
│       ↓                                                           │
│  2️⃣ 技术设计      ← 我用文档输出架构                           │
│       ↓                                                           │
│  3️⃣ 代码生成      ← 我调用 AI 生成代码                         │
│       ↓                                                           │
│  4️⃣ 本地调试      ← 你运行测试                                 │
│       ↓                                                           │
│  5️⃣ 部署上线      ← AI 执行部署命令                           │
│       ↓                                                           │
│  6️⃣ 迭代优化      ← 根据反馈调整                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

我能帮你做的：
- ✅ 生成代码（Tauri/Rust/React/Node.js）
- ✅ 写 API 接口
- ✅ 调 AI Prompt
- ✅ 部署脚本
- ✅ 排查问题
需要你做的：
- ⚠️ 本地运行测试
- ⚠️ 提供飞书账号权限
- ⚠️ 最终体验反馈

---
4. 具体准备步骤
Step 1: 环境检查与安装
# 检查你已有的工具
node --version
rustc --version
git --version

# 如果没有，安装它们：
# macOS:
brew install node rust git
# Ubuntu:
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

Step 2: 注册账号
账号
链接
备注
飞书开发者
https://open.feishu.cn/
创建自营应用，获取 Webhook
Supabase
https://supabase.com/
免费层够用
Vercel
https://vercel.com/
GitHub 登录
Claude
https://claude.ai/
或用 OpenAI
Step 3: 创建空项目骨架
# 1. 创建 Tauri 项目
pnpm create tauri-app timelens --template react-ts

# 2. 进入目录
cd timelens

# 3. 安装依赖
pnpm install

# 4. 启动开发
pnpm tauri dev

Step 4: 飞书应用配置
1. 打开 https://open.feishu.cn/
2. 创建自营应用 → 获取 App ID + App Secret
3. 开通权限：im:message:send_as_bot
4. 创建 Webhook：获取 Webhook URL

---
5. 第一个可运行版本（MVP）
里程碑
内容
预计
M1
Tauri 空项目跑起来
30分钟
M2
窗口追踪功能
2小时
M3
本地存储
1小时
M4
飞书推送
1小时
M5
联调测试
30分钟

---
你的下一步
1. 检查本地环境 - 告诉我 node --version 和 rustc --version 的结果
2. 注册飞书开发者 - 需要你操作
3. 准备 OK 开干

---
准备清单版本: v1.0 | 最后更新: 2026-03-17

---
🏗️ TimeLens 完整技术方案文档
版本: v2.0日期: 2026-03-17状态: 技术设计完成

---
一、技术架构总览
1.1 系统架构图
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    TimeLens 完整技术架构                                  │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │                              用户端 (Client)                                      │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐│  │
│  │  │                      Tauri 2.0 客户端                                        ││  │
│  │  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────────────────┐ ││  │
│  │  │  │  窗口追踪  │  │  截屏模块  │  │  本地存储  │  │     前端展示层        │ ││  │
│  │  │  │  (Rust)    │  │  (Rust)    │  │  (SQLite)  │  │  (React + TypeScript) │ ││  │
│  │  │  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └───────────┬───────────┘ ││  │
│  │  │        │              │              │                     │             ││  │
│  │  │        └──────────────┴──────────────┴─────────────────────┘             ││  │
│  │  │                               │                                               ││  │
│  │  │                    ┌──────────┴──────────┐                                   ││  │
│  │  │                    │    Tauri IPC       │                                   ││  │
│  │  │                    │  (命令与事件通道)   │                                   ││  │
│  │  │                    └───────────────────┘                                   ││  │
│  │  └─────────────────────────────────────────────────────────────────────────────┘│  │
│  └───────────────────────────────────────────────────────────────────────────────────┘  │
│                                           │                                                    │
│                                    HTTPS (JSON)                                           │
│                                           │                                                    │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │                              云端服务 (Cloud)                                     │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐│  │
│  │  │                        Next.js API Server                                  ││  │
│  │  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                 ││  │
│  │  │  │  用户服务      │  │  数据服务      │  │  AI 分析服务  │                 ││  │
│  │  │  │  /api/user    │  │  /api/data    │  │  /api/ai     │                 ││  │
│  │  │  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘                 ││  │
│  │  │          │                   │                   │                        ││  │
│  │  │          └───────────────────┼───────────────────┘                        ││  │
│  │  │                              │                                            ││  │
│  │  │                    ┌────────┴────────┐                                    ││  │
│  │  │                    │  业务逻辑层      │                                    ││  │
│  │  │                    │  (Service Layer)│                                    ││  │
│  │  │                    └────────┬────────┘                                    ││  │
│  │  └─────────────────────────────┼─────────────────────────────────────────────┘│  │
│  │                                │                                                  │  │
│  │         ┌──────────────────────┼──────────────────────┐                        │  │
│  │         ↓                      ↓                      ↓                        │  │
│  │  ┌─────────────┐      ┌─────────────┐      ┌─────────────────┐                │  │
│  │  │  PostgreSQL  │      │    Redis    │      │  Claude API     │                │  │
│  │  │  (主数据库)   │      │  (缓存/队列) │      │  (AI 分析)      │                │  │
│  │  └─────────────┘      └─────────────┘      └─────────────────┘                │  │
│  └───────────────────────────────────────────────────────────────────────────────────┘  │
│                                           │                                                    │
│                                    飞书消息推送                                             │
│                                           │                                                    │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │                              飞书生态 (Feishu)                                    │  │
│  │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐    │  │
│  │  │   每日报告卡片      │  │   用户交互反馈      │  │   消息推送 Webhook  │    │  │
│  │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘    │  │
│  └───────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘


---
二、模块划分与职责
2.1 模块总览
模块编号
模块名称
职责
技术栈
M01
窗口追踪模块
采集用户活跃窗口信息
Rust + platform crate
M02
截屏模块
关键节点轻量截屏
Rust + screenshot crate
M03
本地存储模块
SQLite 数据持久化
Rust + rusqlite
M04
前端展示模块
UI 交互界面
React + TypeScript
M05
数据上传模块
压缩上传到云端
Rust (reqwest)
M06
用户服务模块
用户认证与管理
Next.js API Routes
M07
数据服务模块
数据接收与存储
Next.js API Routes
M08
AI 分析模块
活动分类与洞察生成
Next.js + Claude API
M09
飞书推送模块
报告推送与消息处理
Next.js + Webhook
M10
配置管理模块
系统设置与同步
React + API

---
2.2 模块关系图
                    ┌─────────────────────────────────────────┐
                    │              M04 前端展示                │
                    │         (React TypeScript)              │
                    └─────────────────┬───────────────────────┘
                                      │ IPC 命令
                    ┌─────────────────┴───────────────────────┐
                    │           Tauri Core                    │
                    │  ┌─────────────────────────────────────┐│
                    │  │  M01 窗口追踪 → M02 截屏           ││
                    │  │       ↓                            ││
                    │  │  M03 本地存储 ←→ M10 配置管理       ││
                    │  │       ↓                            ││
                    │  │  M05 数据上传                      ││
                    │  └─────────────────────────────────────┘│
                    └─────────────────────────────────────────┘
                                           ↓ HTTPS
                    ┌─────────────────────────────────────────┐
                    │           云端服务 (Next.js)            │
                    │  ┌─────────────────────────────────────┐│
                    │  │  M06 用户服务 → M07 数据服务        ││
                    │  │       ↓          ↓                  ││
                    │  │  M08 AI 分析 ←→ M09 飞书推送        ││
                    │  └─────────────────────────────────────┘│
                    └─────────────────────────────────────────┘


---
三、详细模块设计
M01: 窗口追踪模块
3.1.1 功能职责
- 实时获取当前活跃窗口信息
- 检测窗口切换事件
- 记录每个窗口的持续时间
- 支持 macOS / Windows 双平台
3.1.2 技术实现
macOS 实现:
// 使用 NSWorkspace API
use cocoa::appkit::NSWorkspace;
use cocoa::base::nil;

// 获取当前活跃应用
fn get_active_app() -> Option<(String, String)> {
    let workspace = NSWorkspace::sharedWorkspace(nil);
    let front_app = workspace.frontmostApplication(nil);
    if front_app != nil {
        let name = front_app.localizedName(nil);
        let bundle_id = front_app.bundleIdentifier(nil);
        return Some((name, bundle_id));
    }
    None
}

Windows 实现:
// 使用 Windows API
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};
use windows::Win32::Foundation::GetWindowThreadProcessId;

// 获取当前窗口标题
fn get_foreground_window_info() -> (String, String) {
    unsafe {
        let hwnd = GetForegroundWindow();
        let mut title = [0u16; 256];
        let len = GetWindowTextW(hwnd, &mut title);
        let title_str = String::from_utf16_lossy(&title[..len as usize]);
        
        // 获取进程名
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        
        (title_str, pid.to_string())
    }
}

3.1.3 数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowEvent {
    pub id: String,                    // UUID
    pub timestamp_ms: i64,            // Unix 毫秒时间戳
    pub app_name: String,             // 应用名称: "VSCode"
    pub app_bundle: Option<String>,   // Bundle ID: "com.microsoft.VSCode"
    pub window_title: String,        // 窗口标题
    pub process_id: Option<u32>,      // 进程 ID
    pub duration_ms: i64,             // 持续时间
    pub is_active: bool,              // 是否正在使用
    pub screenshot_path: Option<String>, // 截图路径（如果有）
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowEventBatch {
    pub user_id: String,
    pub device_id: String,
    pub events: Vec<WindowEvent>,
    pub upload_time: i64,
}

3.1.4 核心接口
接口
说明
参数
返回
start_tracking()
开始追踪
-
Result<()>
stop_tracking()
停止追踪
-
Result<()>
get_current_window()
获取当前窗口
-
WindowEvent
get_events(start, end)
获取时间范围内事件
i64, i64
Vec<WindowEvent>

---
M02: 截屏模块
3.2.1 功能职责
- 在关键节点自动截屏
- 支持可配置的截屏频率
- 敏感内容自动过滤
- 本地加密存储
3.2.2 触发条件
触发条件
说明
可配置
窗口切换
用户切换窗口时
✅
长时间未操作
超过 N 分钟无操作后
✅
定时截屏
每 N 分钟截一次
✅
特定应用
进入指定应用时
✅
3.2.3 技术实现
use screenshot::ScreenCapture;

// 截取当前屏幕（指定区域）
fn capture_screen(region: Region) -> Result<Vec<u8>, Error> {
    let capture = ScreenCapture::new()
        .with_region(region)
        .with_format(ImageFormat::Jpeg, 70)?;  // 70% 质量压缩
    
    capture.capture().map(|img| img.to_bytes())
}

// 隐私处理
fn process_screenshot(image: &[u8], sensitive_regions: &[Region]) -> Vec<u8> {
    // 对敏感区域进行模糊处理
    // 检测并跳过密码输入框等
    todo!()
}


---
M03: 本地存储模块
3.3.1 功能职责
- SQLite 本地数据库管理
- 数据加密存储
- 每日数据打包
- 与云端同步
3.3.2 数据库表结构
-- 窗口事件表
CREATE TABLE window_events (
    id TEXT PRIMARY KEY,
    timestamp_ms INTEGER NOT NULL,
    app_name TEXT NOT NULL,
    app_bundle TEXT,
    window_title TEXT,
    process_id INTEGER,
    duration_ms INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    screenshot_path TEXT,
    synced INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_window_events_timestamp ON window_events(timestamp_ms);
CREATE INDEX idx_window_events_synced ON window_events(synced);

-- 每日统计缓存表
CREATE TABLE daily_stats (
    date TEXT PRIMARY KEY,  -- YYYY-MM-DD
    user_id TEXT NOT NULL,
    total_duration_ms INTEGER DEFAULT 0,
    categories_json TEXT,  -- {"coding": 14400000, "meeting": 7200000}
    events_count INTEGER DEFAULT 0,
    ai_insights TEXT,
    productivity_score INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 用户设置表
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 设备信息表
CREATE TABLE devices (
    device_id TEXT PRIMARY KEY,
    device_name TEXT,
    platform TEXT,  -- "macos" / "windows"
    last_active INTEGER,
    created_at INTEGER NOT NULL
);

-- 同步记录表
CREATE TABLE sync_records (
    id TEXT PRIMARY KEY,
    sync_date TEXT NOT NULL,
    status TEXT DEFAULT 'pending',  -- "pending" / "success" / "failed"
    events_count INTEGER DEFAULT 0,
    uploaded_at INTEGER,
    response TEXT
);

3.3.3 核心接口
// Rust 接口定义
trait Storage {
    fn save_event(&self, event: WindowEvent) -> Result<()>;
    fn save_events_batch(&self, events: Vec<WindowEvent>) -> Result<()>;
    fn get_events(&self, start: i64, end: i64) -> Result<Vec<WindowEvent>>;
    fn get_unsynced_events(&self, limit: usize) -> Result<Vec<WindowEvent>>;
    fn mark_synced(&self, event_ids: Vec<String>) -> Result<()>;
    fn get_daily_stats(&self, date: &str) -> Result<Option<DailyStats>>;
    fn save_daily_stats(&self, stats: DailyStats) -> Result<()>;
    fn get_settings(&self, key: &str) -> Result<Option<String>>;
    fn set_settings(&self, key: &str, value: &str) -> Result<()>;
}


---
M04: 前端展示模块
3.4.1 页面结构
src/
├── App.tsx                    # 主应用入口
├── pages/
│   ├── Dashboard.tsx          # 主仪表盘
│   ├── Timeline.tsx           # 时间线视图
│   ├── Settings.tsx          # 设置页面
│   └── History.tsx           # 历史记录
├── components/
│   ├── TodayOverview.tsx      # 今日概览卡片
│   ├── TimeDistribution.tsx   # 时间分布图表
│   ├── TimelineBlock.tsx      # 时间线区块
│   ├── AIInsights.tsx         # AI 洞察组件
│   ├── SettingsForm.tsx       # 设置表单
│   └── common/                # 通用组件
├── hooks/
│   ├── useTauriEvents.ts      # Tauri 事件监听
│   ├── useStorage.ts          # 本地存储 hook
│   └── useSettings.ts         # 设置管理 hook
├── services/
│   ├── api.ts                 # API 请求封装
│   └── tauri.ts               # Tauri 命令封装
├── stores/
│   └── appStore.ts            # 状态管理 (Zustand)
├── types/
│   └── index.ts               # TypeScript 类型定义
└── styles/
    └── index.css              # 全局样式

3.4.2 页面详细设计
Dashboard 页面:
┌─────────────────────────────────────────────────────────────┐
│  Header: TimeLens Logo + 用户信息 + 设置按钮                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐  ┌────────────────────────────────┐  │
│  │   今日概览卡片    │  │        时间线展示               │  │
│  │  ┌────────────┐  │  │  09:00 [💻] VSCode  2h        │  │
│  │  │ 总工时: 8h  │  │  │  11:00 [🌐] Chrome  30m       │  │
│  │  │ 生产力: 85 │  │  │  11:30 [📞] Zoom    1.5h      │  │
│  │  │ ↑12%       │  │  │  13:00 [📝] Docs    2h        │  │
│  │  └────────────┘  │  │  ...                          │  │
│  └──────────────────┘  └────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────┐  ┌────────────────────────────────┐  │
│  │   时间分布图表   │  │       AI 洞察                  │  │
│  │  ████████████░░  │  │  • 洞察1                       │  │
│  │  编程  51%       │  │  • 洞察2                       │  │
│  │  会议  26%       │  │  • 洞察3                       │  │
│  └──────────────────┘  └────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘

3.4.3 TypeScript 类型定义
// types/index.ts

// 窗口事件
export interface WindowEvent {
  id: string;
  timestampMs: number;
  appName: string;
  appBundle?: string;
  windowTitle: string;
  processId?: number;
  durationMs: number;
  isActive: boolean;
  screenshotPath?: string;
}

// 每日统计
export interface DailyStats {
  date: string;  // YYYY-MM-DD
  totalDurationMs: number;
  categories: Record<string, number>;  // { coding: 14400000, meeting: 7200000 }
  eventsCount: number;
  aiInsights?: AIInsight[];
  productivityScore?: number;
}

// AI 洞察
export interface AIInsight {
  type: 'pattern' | 'anomaly' | 'suggestion';
  content: string;
  timestamp?: number;
}

// 用户设置
export interface UserSettings {
  trackingEnabled: boolean;
  screenshotEnabled: boolean;
  screenshotInterval: number;  // 分钟
  screenshotOnSwitch: boolean;
  reportTime: string;  // HH:mm
  sensitiveApps: string[];
  pauseOnPassword: boolean;
  dataRetention: number;  // 天数
  cloudSync: boolean;
}

// 分类类型
export type CategoryType = 
  | 'coding' 
  | 'meeting' 
  | 'documentation' 
  | 'browsing' 
  | 'communication' 
  | 'entertainment'
  | 'other';


---
M05: 数据上传模块
3.5.1 功能职责
- 每日数据压缩打包
- 加密传输
- 断点续传
- 上传进度监控
3.5.2 技术实现
// 数据打包
fn package_daily_data(date: &str) -> Result<CompressedPackage, Error> {
    let events = storage.get_unsynced_events(10000)?;
    
    // 序列化 + 压缩
    let json = serde_json::to_string(&events)?;
    let compressed = gzip_compress(json.as_bytes())?;
    
    // 加密
    let encrypted = aes_encrypt(compressed, get_encryption_key())?;
    
    Ok(CompressedPackage {
        date: date.to_string(),
        data: encrypted,
        checksum: md5(&compressed),
        events_count: events.len(),
    })
}

// 上传到云端
async fn upload_package(package: CompressedPackage) -> Result<UploadResponse, Error> {
    let client = reqwest::Client::new();
    let response = client
        .post(&format!("{}/api/v1/upload", API_BASE))
        .header("Authorization", format!("Bearer {}", get_token()))
        .header("Content-Encoding", "gzip")
        .body(package.data)
        .send()
        .await?;
    
    Ok(response.json()?)
}


---
M06: 用户服务模块
3.6.1 功能职责
- 飞书 OAuth 登录
- 用户信息管理
- 设备绑定
- Token 管理
3.6.2 API 接口
接口
方法
说明
鉴权
/api/v1/user/login
POST
飞书 OAuth 登录
-
/api/v1/user/profile
GET
获取用户信息
✅
/api/v1/user/devices
GET
获取用户设备列表
✅
/api/v1/user/settings
GET
获取用户设置
✅
/api/v1/user/settings
PATCH
更新用户设置
✅
/api/v1/user/bind-device
POST
绑定设备
✅
3.6.3 接口详细设计
POST /api/v1/user/login
// Request
interface LoginRequest {
  code: string;  // 飞书授权 code
}

// Response
interface LoginResponse {
  user: {
    id: string;
    feishuOpenId: string;
    name: string;
    avatar?: string;
    createdAt: string;
  };
  accessToken: string;
  refreshToken: string;
  expiresIn: number;  // 秒
}

GET /api/v1/user/profile
// Response
interface UserProfileResponse {
  id: string;
  feishuOpenId: string;
  name: string;
  email?: string;
  avatar?: string;
  plan: 'free' | 'pro' | 'enterprise';
  createdAt: string;
  lastLoginAt: string;
}


---
M07: 数据服务模块
3.7.1 功能职责
- 接收客户端上传数据
- 数据解析与存储
- 历史数据查询
- 统计数据计算
3.7.2 API 接口
接口
方法
说明
鉴权
/api/v1/data/upload
POST
上传每日数据
✅
/api/v1/data/daily
GET
获取指定日期数据
✅
/api/v1/data/stats
GET
获取统计数据
✅
/api/v1/data/export
GET
导出数据
✅
3.7.3 接口详细设计
POST /api/v1/data/upload
// Request (multipart/form-data)
interface UploadRequest {
  date: string;  // YYYY-MM-DD
  deviceId: string;
  events: string;  // JSON 字符串
  compressed: boolean;
  checksum: string;
}

// Response
interface UploadResponse {
  success: boolean;
  receivedEvents: number;
  processedAt: string;
}

GET /api/v1/data/daily
// Query Parameters
interface DailyQueryParams {
  date: string;  // YYYY-MM-DD
  userId?: string;  // 自己的不需要传
}

// Response
interface DailyDataResponse {
  date: string;
  events: WindowEvent[];
  categories: Record<string, number>;
  totalDuration: number;
  productivityScore: number;
}


---
M08: AI 分析模块
3.8.1 功能职责
- 活动自动分类
- 模式识别
- 异常检测
- 个性化洞察生成
- 报告内容生成
3.8.2 AI 分类 Prompt
const CLASSIFICATION_PROMPT = `
你是一个时间分析专家。请根据以下用户今天使用电脑的记录，进行活动分类。

## 记录格式
[时间] App名称 - 窗口标题 (持续分钟数)

## 今日记录
{events}

## 分类规则
- coding: 编程开发相关的活动 (VSCode, IntelliJ, GitHub, Stack Overflow, 终端等)
- meeting: 会议相关活动 (Zoom, Teams, 腾讯会议, 飞书会议等)
- documentation: 文档编写 (Notion, 飞书文档, Word, Google Docs等)
- browsing: 浏览器浏览 (Chrome, Safari，但排除特定网站)
- communication: 沟通交流 (Slack, 微信, 钉钉, 邮件等)
- entertainment: 娱乐 (YouTube, Netflix, 游戏等)
- other: 其他无法分类的活动

## 输出要求
请严格按照以下 JSON 格式输出，不要有其他内容：
{
  "categories": {
    "coding": 14400000,  // 毫秒
    "meeting": 7200000,
    "documentation": 3600000,
    "browsing": 1800000,
    "communication": 3600000,
    "entertainment": 0,
    "other": 600000
  },
  "insights": [
    {
      "type": "pattern",
      "content": "你今天上午的编程时间最长，工作效率最高"
    },
    {
      "type": "anomaly", 
      "content": "今天会议时间比昨天多了1小时"
    },
    {
      "type": "suggestion",
      "content": "建议将部分会议安排到下午，可以提高上午的专注度"
    }
  ],
  "productivityScore": 85
}
`;

3.8.3 API 接口
接口
方法
说明
鉴权
/api/v1/ai/classify
POST
活动分类
✅
/api/v1/ai/insights
POST
生成洞察
✅
/api/v1/ai/report
POST
生成每日报告
✅

---
M09: 飞书推送模块
3.9.1 功能职责
- 每日报告推送
- 实时消息通知
- 用户反馈处理
- 消息卡片渲染
3.9.2 消息卡片模板
const REPORT_CARD_TEMPLATE = {
  config: {
    wide_screen_mode: true
  },
  header: {
    title: {
      tag: 'plain_text',
      content: '🦞 每日时间报告 - {{date}}'
    },
    template: 'blue'
  },
  elements: [
    // 今日数据
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: '📊 **今日数据**\n• 总工时: {{totalHours}}h\n• 生产力: {{productivity}}分 ({{change}}%)\n• 高效时段: {{peakTime}}'
      }
    },
    // 时间分布
    {
      tag: 'div',
      text: {
        tag: 'lark_md', 
        content: '📈 **时间分布**\n{{distribution}}'
      }
    },
    // AI 洞察
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: '🔍 **AI 洞察**\n{{insights}}'
      }
    },
    // 待确认项
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: '❓ **需要你确认**\n{{confirmations}}'
      },
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '补充修正 ↓' },
          type: 'primary',
          url: '{{feedbackUrl}}'
        }
      ]
    }
  ]
};

3.9.3 Webhook 配置
// 飞书 Webhook 发送
async function sendReportToFeishu(webhook: string, card: object) {
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msg_type: 'interactive',
      card: card
    })
  });
  return response.json();
}


---
M10: 配置管理模块
3.10.1 功能职责
- 本地设置管理
- 云端设置同步
- 隐私配置
- 推送配置
3.10.2 设置项定义
interface AppSettings {
  // 追踪设置
  tracking: {
    enabled: boolean;
    pauseOnLock: boolean;      // 锁屏时暂停
    pauseOnIdle: boolean;      // 空闲时暂停
    idleThreshold: number;     // 空闲阈值（分钟）
  };
  
  // 截屏设置
  screenshot: {
    enabled: boolean;
    onWindowSwitch: boolean;  // 切换窗口时截屏
    interval: number;         // 定时截屏间隔（分钟）
    quality: number;          // 质量 0-100
    blurSensitive: boolean;   // 模糊敏感内容
  };
  
  // 隐私设置
  privacy: {
    sensitiveApps: string[];   // 不追踪的应用
    pauseOnPassword: boolean; // 输入密码时暂停
    excludeTitles: string[];  // 不追踪的标题关键词
  };
  
  // 推送设置
  notification: {
    enabled: boolean;
    dailyReportTime: string;  // HH:mm
    channel: 'feishu' | 'email' | 'both';
  };
  
  // 存储设置
  storage: {
    localRetention: number;   // 本地保留天数
    cloudSync: boolean;
    autoUpload: boolean;      // 自动上传
    wifiOnly: boolean;        // 仅 WiFi 上传
  };
}


---
四、数据库设计
4.1 云端 PostgreSQL 表结构
-- 用户表
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feishu_open_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255),
    avatar_url TEXT,
    email VARCHAR(255),
    plan VARCHAR(20) DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_feishu_open_id ON users(feishu_open_id);

-- 设备表
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(100) NOT NULL,
    device_name VARCHAR(255),
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('macos', 'windows', 'linux')),
    push_token TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    last_active_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, device_id)
);

CREATE INDEX idx_devices_user_id ON devices(user_id);

-- 每日记录表
CREATE TABLE daily_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    events_json JSONB NOT NULL,
    categories_json JSONB NOT NULL,
    total_duration_ms BIGINT DEFAULT 0,
    ai_insights_json JSONB,
    productivity_score INTEGER,
    report_sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, device_id, date)
);

CREATE INDEX idx_daily_records_user_date ON daily_records(user_id, date DESC);
CREATE INDEX idx_daily_records_created_at ON daily_records(created_at);

-- 用户设置表
CREATE TABLE user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    settings_json JSONB NOT NULL DEFAULT '{}',
    synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI 纠正记录表
CREATE TABLE corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    daily_record_id UUID REFERENCES daily_records(id) ON DELETE CASCADE,
    time_range VARCHAR(50) NOT NULL,
    original_label VARCHAR(50),
    corrected_label VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_corrections_user_id ON corrections(user_id);

-- 同步记录表
CREATE TABLE sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    sync_type VARCHAR(20) NOT NULL CHECK (sync_type IN ('upload', 'download')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
    events_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sync_logs_user_id ON sync_logs(user_id, created_at DESC);


---
五、API 接口汇总
5.1 客户端 → 云端 API
模块
接口
方法
说明
M06
/api/v1/user/login
POST
飞书登录
M06
/api/v1/user/profile
GET
获取用户信息
M06
/api/v1/user/settings
GET/PATCH
用户设置
M07
/api/v1/data/upload
POST
上传数据
M07
/api/v1/data/daily
GET
获取每日数据
M07
/api/v1/data/stats
GET
获取统计
M08
/api/v1/ai/classify
POST
AI 分类
M08
/api/v1/ai/insights
POST
AI 洞察
M08
/api/v1/ai/report
POST
生成报告
5.2 云端 → 飞书 API
接口
说明
https://open.feishu.cn/open-apis/bot/v2/hook/{webhook_id}
Webhook 推送
https://open.feishu.cn/open-apis/im/v1/messages
应用消息

---
六、开发任务分发
6.1 角色与职责
角色
人数
职责
前端开发
1人
M04, M10 前端部分
后端开发
1人
M06, M07, M08, M09
客户端开发
1人
M01, M02, M03, M05
全栈开发
1人
协调 + 部署 + 测试
6.2 任务分配表
开发人员 A: 客户端开发 (Client)
任务 ID
任务名称
模块
描述
预计工时
T-001
环境搭建
-
安装 Rust/Tauri/Node.js，配置开发环境
4h
T-002
窗口追踪开发
M01
实现 macOS/Windows 窗口追踪
8h
T-003
窗口追踪测试
M01
跨平台测试与 bug 修复
4h
T-004
截屏功能开发
M02
实现截屏与隐私处理
6h
T-005
本地存储开发
M03
SQLite 数据库与加密
6h
T-006
数据上传开发
M05
压缩上传与断点续传
4h
T-007
客户端联调
-
与后端 API 对接
4h
交付物: 可运行的 Tauri 客户端，具备追踪、存储、上传功能

---
开发人员 B: 前端开发 (Frontend)
任务 ID
任务名称
模块
描述
预计工时
T-010
前端脚手架
M04
React + TypeScript 项目搭建
4h
T-011
仪表盘页面
M04
Dashboard 页面开发
6h
T-012
时间线页面
M04
Timeline 页面开发
6h
T-013
设置页面
M10
设置页面开发
4h
T-014
状态管理
M04
Zustand 状态管理搭建
4h
T-015
客户端集成
M04
与 Tauri IPC 集成
4h
T-016
UI 优化
M04
样式优化与响应式
4h
交付物: 完整的客户端前端界面

---
开发人员 C: 后端开发 (Backend)
任务 ID
任务名称
模块
描述
预计工时
T-020
后端脚手架
-
Next.js 项目搭建
4h
T-021
用户服务
M06
登录/注册/认证
6h
T-022
数据服务
M07
数据上传与存储 API
8h
T-023
AI 分类服务
M08
活动分类功能
6h
T-024
AI 洞察服务
M08
洞察生成功能
6h
T-025
报告生成服务
M08
每日报告生成
4h
T-026
飞书推送
M09
Webhook 推送实现
6h
T-027
后端测试
-
API 测试与 bug 修复
4h
交付物: 完整的云端 API 服务

---
开发人员 D: 全栈/测试/部署
任务 ID
任务名称
模块
描述
预计工时
T-030
数据库设计
-
PostgreSQL 表结构
4h
T-031
数据库部署
-
Supabase/自建数据库
2h
T-032
云端部署
-
Vercel 部署
4h
T-033
飞书配置
M09
应用创建与 Webhook
2h
T-034
端到端测试
-
全链路测试
6h
T-035
Bug 修复
-
整体 bug 修复
8h
T-036
性能优化
-
性能调优
4h
交付物: 可运行的完整系统

---
6.3 开发里程碑
阶段
时间
里程碑
负责人
Week 1
Day 1-2
环境搭建完成
所有人

Day 3-5
客户端核心功能 (M01+M03)
A

Day 3-5
后端基础架构 (M06)
C
Week 2
Day 6-7
客户端完成，M05 完成
A

Day 6-7
前端基础 (M04 骨架)
B

Day 8-10
M07 数据 API 完成
C
Week 3
Day 11-14
M08 AI 服务
C
Week 4
Day 15-18
M09 飞书推送
C

Day 15-18
前端完成
B
Week 5
Day 19-21
端到端联调
D

Day 22-25
测试与修复
D
Week 6
Day 26-30
部署上线
D

---
七、技术栈汇总
层级
技术
客户端框架
Tauri 2.0
前端框架
React 18 + TypeScript
前端状态
Zustand
前端 UI
Tailwind CSS
客户端核心
Rust
本地数据库
SQLite (rusqlite)
云端框架
Next.js 14 (App Router)
云端语言
TypeScript
数据库
PostgreSQL (Supabase)
缓存
Redis
AI
Claude API
部署
Vercel
飞书
Webhook + 消息卡片
安全
JWT + AES-256

---
八、验收标准
8.1 功能验收
[] 客户端能在 macOS/Windows 正常运行
[] 窗口追踪准确率 > 95%
[] 每日数据能成功上传到云端
[] AI 分类准确率 > 80%
[] 飞书每日报告正常推送
[] 设置能正常同步
8.2 性能验收
[] 客户端内存占用 < 100MB
[] CPU 占用 < 2%（追踪时）
[] API 响应时间 < 500ms
[] 页面加载时间 < 2s
8.3 安全验收
[] 本地数据加密存储
[] 传输使用 HTTPS
[] API 鉴权正常
[] 敏感信息过滤正常

---
文档版本: v2.0 | 最后更新: 2026-03-17

---

# 🚀 TimeLens V2.0 产品迭代需求文档

版本: v2.0 | 日期: 2026-03-18 | 状态: 需求设计

---

## 一、版本概述

### 版本目标

在 V1.x 稳定运行的基础上，V2.0 重点解决三个核心问题：
1. **AI 分析能力多元化** - 降低单一 AI 供应商依赖风险，支持国内主流 AI 服务
2. **报告本地可视化** - 让分析结果不仅推送飞书，还可在本地查看和沉淀
3. **国际化语言支持** - 扩大用户群体，支持中英文双语界面

### 核心价值升级

| 方向 | V1.x | V2.0 |
|------|------|------|
| AI 渠道 | 仅 Claude API | 支持 Claude / DeepSeek / Qwen 多渠道 |
| 报告查看 | 仅飞书推送 | 飞书推送 + 本地 MD 报告 + 本地预览 |
| 界面语言 | 中文 | 中文 / 英文 双语 |

---

## 二、功能需求详情

### Feature 1：多 AI 分析渠道支持

#### 1.1 背景与动机

- Claude API 在国内访问需代理，稳定性受限
- DeepSeek（深度求索）和 Qwen（通义千问）均为国内可直接调用的高性能模型
- 不同模型对中文活动描述的理解能力有差异
- 降低成本：DeepSeek 和 Qwen 的 Token 价格更低

#### 1.2 功能需求

**多渠道配置**

| 功能 | 描述 | 优先级 |
|------|------|------|
| AI 渠道选择 | 用户可在设置中选择 AI 供应商 | P0 |
| API Key 管理 | 每个渠道独立配置 Key，本地加密存储 | P0 |
| 渠道健康检测 | 检测 API 连通性，自动提示异常 | P1 |
| 自动故障切换 | 主渠道不可用时自动切换备用渠道 | P1 |
| 自定义模型 | 支持填写具体模型名（如 deepseek-chat） | P2 |

**支持的 AI 渠道**

| 供应商 | 模型 | API 基础 URL | 特点 |
|------|------|------|------|
| Claude (Anthropic) | claude-sonnet-4-6 | https://api.anthropic.com | 中文理解强，逻辑好 |
| DeepSeek | deepseek-chat / deepseek-reasoner | https://api.deepseek.com | 国内直连，价格低 |
| Qwen (阿里云) | qwen-plus / qwen-turbo | https://dashscope.aliyuncs.com | 中文支持好，国内稳定 |

**渠道优先级策略**

```
用户设置主渠道 → 调用失败(超时/鉴权/限流) → 自动切换备渠道 → 记录切换日志
```

#### 1.3 界面设计

**设置页 - AI 配置模块**

```
┌─────────────────────────────────────────────────────────────────┐
│  🤖 AI 分析配置                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  主 AI 渠道                    [DeepSeek ▼]                     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  🟢 DeepSeek                              [测试连接]   │   │
│  │  API Key: dk-••••••••••••••••••••••4a2f              │   │
│  │  模型: deepseek-chat                    [修改]        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  🟡 Claude (备用)                         [测试连接]   │   │
│  │  API Key: sk-ant-••••••••••••••••••••••Xk9            │   │
│  │  模型: claude-sonnet-4-6                [修改]        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ⚫ Qwen (通义千问)                       [配置]       │   │
│  │  API Key: 未配置                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [+ 添加渠道]                                                    │
│                                                                 │
│  故障切换       [开启 ▼]  主渠道失败时自动切换备用渠道            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 1.4 技术实现要点

- 统一 AI 适配层：抽象 `AIProvider` 接口，各渠道实现标准化调用
- API Key 存储：使用系统 Keychain（macOS Keychain / Windows Credential Manager）
- 渠道调用统一封装，支持超时重试和错误分类
- Prompt 模板需兼容各模型的最优输入格式

```typescript
// AI Provider 抽象接口设计
interface AIProvider {
  name: string;
  analyze(prompt: string, data: DayData): Promise<AIAnalysisResult>;
  testConnection(): Promise<boolean>;
}

// 支持渠道
type ProviderType = 'claude' | 'deepseek' | 'qwen';
```

---

### Feature 2：分析报告本地在线预览

#### 2.1 背景与动机

- 飞书推送受网络和账号绑定限制，离线或无飞书账号时无法查看报告
- 历史报告需要回溯，飞书消息不方便翻查
- Markdown 格式报告便于分享、备份、导入到其他工具（Notion/Obsidian）
- 本地 HTTP 预览服务提供更丰富的可视化体验

#### 2.2 功能需求

**报告生成**

| 功能 | 描述 | 优先级 |
|------|------|------|
| MD 报告生成 | 每日分析完成后自动生成 Markdown 文件 | P0 |
| 报告存储路径 | 默认存储到 `~/Documents/TimeLens/reports/YYYY-MM-DD.md` | P0 |
| 报告命名规范 | `2026-03-18-daily-report.md` | P0 |
| 历史报告列表 | 客户端内展示历史报告列表 | P1 |
| 报告导出 | 支持导出为 PDF | P2 |

**本地预览服务**

| 功能 | 描述 | 优先级 |
|------|------|------|
| 本地 HTTP 服务 | 内嵌轻量 Web 服务（端口 7399），渲染 MD 报告 | P0 |
| 一键打开浏览器 | 客户端提供"在浏览器预览"按钮，打开 localhost:7399 | P0 |
| 报告导航 | 浏览器页面支持切换日期查看历史报告 | P1 |
| 实时刷新 | 报告生成后浏览器页面自动刷新 | P1 |
| 图表渲染 | 时间分布饼图、趋势折线图（使用 Mermaid 图表语法） | P1 |

#### 2.3 报告 Markdown 格式规范

```markdown
# 🦞 TimeLens 每日报告 - 2026-03-18

> 生成时间: 2026-03-18 21:00 | AI 渠道: DeepSeek | 语言: 中文

---

## 📊 今日概览

| 指标 | 数值 | 变化 |
|------|------|------|
| 总工时 | 8h 32m | ↑ 12% |
| 生产力评分 | 85 分 | ↑ 8 分 |
| 高效时段 | 上午 9-12点 | - |
| 活跃应用 | 12 个 | - |

---

## 📈 时间分布

\`\`\`mermaid
pie title 今日时间分布
    "编程" : 51
    "会议" : 26
    "文档" : 12
    "其他" : 11
\`\`\`

| 类别 | 时长 | 占比 | 主要应用 |
|------|------|------|------|
| 💻 编程 | 4h 20m | 51% | VSCode, Terminal |
| 📞 会议 | 2h 15m | 26% | Zoom, 飞书 |
| 📝 文档 | 1h 00m | 12% | Notion, Word |
| 🌐 其他 | 57m | 11% | Chrome, 微信 |

---

## 🕐 时间线

| 时间段 | 活动 | 应用 | 时长 |
|------|------|------|------|
| 09:00-12:00 | 💻 编程 | VSCode | 2h |
| 12:00-13:00 | 🍽️ 休息 | - | 1h |
| 14:00-16:00 | 📞 会议 | Zoom | 2h |
| 16:00-18:00 | 📝 文档 | Notion | 2h |
| 19:00-21:30 | 💻 编程 | VSCode | 2.5h |

---

## 🔍 AI 洞察

1. **效率峰值**：上午 9-12 点是今天最高效的时段，生产力评分达 92 分
2. **会议集中**：下午 14-16 点会议连续，建议将部分会议分散到上午
3. **深度专注**：今天有 2 次超过 1 小时的连续编程记录，保持得很好
4. **改进建议**：15:30 有 30 分钟微信使用，可设置免打扰模式保护专注时段

---

## ❓ 待确认活动

- 14:30-15:00：AI 未能确认具体活动类型（已标记为"待确认"）

---

## 📅 本周趋势

\`\`\`mermaid
xychart-beta
    title "本周生产力评分"
    x-axis ["周一", "周二", "周三", "周四", "周五"]
    y-axis "评分" 0 --> 100
    bar [72, 85, 0, 0, 0]
\`\`\`

---

*由 TimeLens v2.0 生成 | AI 渠道: DeepSeek*
```

#### 2.4 本地预览界面设计

**浏览器预览页 (localhost:7399)**

```
┌─────────────────────────────────────────────────────────────────┐
│  🦞 TimeLens 报告中心                    localhost:7399         │
├────────────────────────────────────────────────────────────────┤
│  ◀ 昨天   📅 2026-03-18   今天 ▶   [导出PDF]  [原始MD]         │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📊 今日概览                                                    │
│  ┌──────────┬──────────┬──────────┬──────────┐                │
│  │  8h 32m  │  85分    │  ↑12%    │  9-12点  │                │
│  │  总工时   │  生产力  │  对比昨天 │  高效时段 │                │
│  └──────────┴──────────┴──────────┴──────────┘                │
│                                                                 │
│  📈 时间分布                                                    │
│  [饼图渲染区域]                                                  │
│                                                                 │
│  🔍 AI 洞察                                                    │
│  • 上午 9-12 点效率最高...                                      │
│  • 下午会议集中建议...                                           │
│                                                                 │
│  ─────────────────────────────────────────────                 │
│  历史报告                                                       │
│  • 2026-03-17  生产力 72分                                      │
│  • 2026-03-16  生产力 88分                                      │
│  • 2026-03-15  生产力 65分                                      │
└─────────────────────────────────────────────────────────────────┘
```

#### 2.5 技术实现要点

- 使用 Tauri 内嵌的 `axum` 或 `tiny_http` 启动本地 HTTP 服务
- 前端使用 `marked.js` + `mermaid.js` 渲染 Markdown 和图表
- 报告文件监听：使用 `notify` crate 监听报告目录变更，实现浏览器自动刷新（WebSocket）
- 本地预览服务随 TimeLens 启动而启动，关闭而停止

```rust
// 本地预览服务
struct LocalPreviewServer {
    port: u16,     // 默认 7399
    report_dir: PathBuf,
}
```

---

### Feature 3：多语言国际化支持

#### 3.1 背景与动机

- 扩大潜在用户群体，覆盖英文用户（海外华人、外籍工程师）
- 产品长期目标是出海，国际化是必要基础
- 报告输出语言与界面语言保持一致

#### 3.2 功能需求

**语言设置**

| 功能 | 描述 | 优先级 |
|------|------|------|
| 语言切换 | 设置中心支持切换中文/英文 | P0 |
| 即时生效 | 切换语言无需重启应用 | P0 |
| 报告语言同步 | MD 报告和飞书推送的语言跟随界面设置 | P0 |
| AI Prompt 本地化 | AI 分析 Prompt 根据语言选择使用中文或英文 | P1 |
| 系统语言检测 | 首次启动自动检测系统语言，默认匹配 | P1 |

**支持语言**

| 语言 | 代码 | 状态 |
|------|------|------|
| 简体中文 | zh-CN | V2.0 上线 |
| English | en-US | V2.0 上线 |

#### 3.3 界面文案对照示例

| 中文 | English |
|------|------|
| 今日概览 | Today's Overview |
| 时间分布 | Time Distribution |
| 生产力评分 | Productivity Score |
| 高效时段 | Peak Hours |
| AI 洞察 | AI Insights |
| 追踪中 | Tracking |
| 设置 | Settings |
| AI 分析配置 | AI Configuration |
| 本地预览 | Local Preview |
| 每日报告时间 | Daily Report Time |
| 推送方式 | Notification Channel |

#### 3.4 设置页语言切换设计

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚙️ 设置 / Settings                           [返回 / Back]    │
├─────────────────────────────────────────────────────────────────┤
│  🌐 语言 / Language                                             │
│                                                                 │
│  (●) 简体中文                                                    │
│  ( ) English                                                    │
│                                                                 │
│  报告输出语言将自动同步                                          │
│  Report language follows UI language                            │
└─────────────────────────────────────────────────────────────────┘
```

#### 3.5 技术实现方案

- 使用 `i18next` + `react-i18next` 实现前端国际化
- 翻译文件存储在 `src/locales/zh-CN.json` 和 `src/locales/en-US.json`
- AI Prompt 模板区分中英文版本，根据当前语言设置选择对应 Prompt
- 报告 Markdown 模板同样区分中英文

```typescript
// i18n 配置
i18n.init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  lng: userSettings.language || navigator.language,
  fallbackLng: 'zh-CN',
});
```

---

## 三、功能模块汇总

### V2.0 功能清单

| 模块 | 功能 | 优先级 | 说明 |
|------|------|------|------|
| AI 多渠道 | 支持 Claude / DeepSeek / Qwen | P0 | 核心功能 |
| AI 多渠道 | 独立 API Key 配置与加密存储 | P0 | 安全必须 |
| AI 多渠道 | 渠道连通性检测 | P1 | 体验优化 |
| AI 多渠道 | 故障自动切换 | P1 | 稳定性 |
| AI 多渠道 | 自定义模型名 | P2 | 高级用户 |
| 本地报告 | MD 格式报告生成 | P0 | 核心功能 |
| 本地报告 | 本地 HTTP 预览服务 | P0 | 核心功能 |
| 本地报告 | 浏览器一键预览 | P0 | 核心功能 |
| 本地报告 | 历史报告导航 | P1 | 体验优化 |
| 本地报告 | Mermaid 图表渲染 | P1 | 体验优化 |
| 本地报告 | 浏览器实时刷新 | P1 | 体验优化 |
| 本地报告 | PDF 导出 | P2 | 扩展功能 |
| 多语言 | 中文/英文界面切换 | P0 | 核心功能 |
| 多语言 | 即时切换无需重启 | P0 | 体验必须 |
| 多语言 | 报告语言同步 | P0 | 一致性 |
| 多语言 | AI Prompt 本地化 | P1 | 质量优化 |
| 多语言 | 系统语言自动检测 | P1 | 体验优化 |

---

## 四、架构变更设计

### 4.1 新增模块

```
TimeLens V2.0 新增模块

src/
├── ai/
│   ├── providers/
│   │   ├── claude.ts          # Claude API 适配器
│   │   ├── deepseek.ts        # DeepSeek API 适配器
│   │   └── qwen.ts            # Qwen API 适配器
│   ├── manager.ts             # AI 渠道管理器（选择/切换）
│   └── prompts/
│       ├── classify.zh-CN.ts  # 中文分类 Prompt
│       ├── classify.en-US.ts  # 英文分类 Prompt
│       └── insight.ts         # 洞察生成 Prompt
├── report/
│   ├── generator.ts           # MD 报告生成器
│   ├── templates/
│   │   ├── daily.zh-CN.md    # 中文报告模板
│   │   └── daily.en-US.md    # 英文报告模板
│   └── preview-server.ts      # 本地 HTTP 预览服务
└── locales/
    ├── zh-CN.json             # 中文翻译
    └── en-US.json             # 英文翻译
```

### 4.2 数据库变更

**settings 表新增字段**

```sql
-- 新增 AI 渠道配置存储（Value 为 JSON）
-- key: 'ai_providers'
-- value: {"primary":"deepseek","fallback":"claude","providers":{...}}

-- 新增语言设置
-- key: 'language'
-- value: 'zh-CN' | 'en-US'

-- 新增报告存储路径
-- key: 'report_dir'
-- value: '/Users/xxx/Documents/TimeLens/reports'
```

**daily_stats 表新增字段**

```sql
ALTER TABLE daily_stats ADD COLUMN report_path TEXT;    -- MD报告本地路径
ALTER TABLE daily_stats ADD COLUMN ai_provider TEXT;    -- 使用的AI渠道
ALTER TABLE daily_stats ADD COLUMN language TEXT;       -- 报告语言
```

### 4.3 API Key 安全存储

```
macOS: 使用 Security.framework Keychain
Windows: 使用 Windows Credential Manager
Linux: 使用 Secret Service API (libsecret)

存储键名规则: timelens.<provider>.api_key
```

---

## 五、用户体验设计

### 5.1 首次配置引导（Onboarding V2.0）

```
步骤 1/4: 选择语言
[简体中文]  [English]

步骤 2/4: 配置 AI 渠道
推荐国内用户选择 DeepSeek（速度快、价格低）
[DeepSeek] [Qwen] [Claude]
API Key: [___________________]  [测试连接]

步骤 3/4: 报告设置
报告存储位置: ~/Documents/TimeLens/reports  [更改]
本地预览端口: 7399  [更改]

步骤 4/4: 完成
[ 开始使用 ]  [ 在浏览器中预览示例报告 ]
```

### 5.2 报告生成后通知

```
系统通知:
🦞 TimeLens
今日报告已生成
[在飞书查看]  [本地预览]
```

---

## 六、开发计划

### Phase 1：AI 多渠道（预计 1 周）

| 任务 | 说明 | 负责 |
|------|------|------|
| AIProvider 接口抽象 | 定义统一适配接口 | 开发 |
| DeepSeek 适配器 | 接入 DeepSeek API | 开发 |
| Qwen 适配器 | 接入通义千问 API | 开发 |
| API Key 安全存储 | Keychain 集成 | 开发 |
| 渠道管理 UI | 设置页 AI 配置模块 | 开发 |
| 故障切换逻辑 | 主渠道失败切备用 | 开发 |

### Phase 2：本地报告预览（预计 1 周）

| 任务 | 说明 | 负责 |
|------|------|------|
| MD 报告模板设计 | 中英文两套模板 | 产品+开发 |
| 报告生成器 | 填充模板生成 MD | 开发 |
| 本地 HTTP 服务 | axum 轻量服务器 | 开发 |
| 浏览器渲染页面 | marked + mermaid | 开发 |
| 历史报告导航 | 日期切换功能 | 开发 |
| 实时刷新 | WebSocket 通知刷新 | 开发 |

### Phase 3：多语言国际化（预计 3 天）

| 任务 | 说明 | 负责 |
|------|------|------|
| i18next 集成 | 框架接入 | 开发 |
| 中文翻译文件 | 梳理全量文案 | 产品 |
| 英文翻译文件 | 翻译中文文案 | 产品 |
| 语言切换 UI | 设置页语言选项 | 开发 |
| AI Prompt 本地化 | 双语 Prompt 模板 | 产品+AI |
| 报告模板本地化 | 双语报告模板 | 产品 |

---

## 七、验收标准

### 7.1 AI 多渠道验收

- [ ] 可成功配置并调用 DeepSeek API 进行分析
- [ ] 可成功配置并调用 Qwen API 进行分析
- [ ] API Key 加密存储，界面显示脱敏（仅展示后 4 位）
- [ ] 连接测试按钮正确反馈成功/失败状态
- [ ] 主渠道超时（>10s）时自动切换到备用渠道
- [ ] 渠道切换记录写入日志

### 7.2 本地报告预览验收

- [ ] 每次 AI 分析完成后在指定目录生成 `YYYY-MM-DD-daily-report.md`
- [ ] MD 文件包含：概览、时间分布、时间线、AI 洞察四个模块
- [ ] Mermaid 图表语法正确，可在标准 Markdown 渲染器中显示
- [ ] 点击"本地预览"按钮可打开浏览器并正确渲染当日报告
- [ ] 浏览器页面支持切换查看历史报告（至少支持最近 30 天）
- [ ] 报告更新后浏览器页面在 3 秒内自动刷新

### 7.3 多语言验收

- [ ] 设置中切换语言后，所有界面文案即时更新（无需重启）
- [ ] 中文模式下 AI 分析结果和报告均为中文输出
- [ ] 英文模式下 AI 分析结果和报告均为英文输出
- [ ] 首次启动系统语言为英文时默认选择 English
- [ ] 首次启动系统语言为中文时默认选择简体中文
- [ ] 飞书推送内容语言与界面语言保持一致

---

## 八、风险与依赖

| 风险 | 影响 | 应对 |
|------|------|------|
| DeepSeek/Qwen API 格式变更 | AI 分析中断 | 监控 API Changelog，适配层隔离变更 |
| 本地端口 7399 被占用 | 预览服务无法启动 | 支持自定义端口，自动检测可用端口 |
| 国际化文案翻译质量 | 英文用户体验差 | 使用专业翻译，上线前邀请英文用户 review |
| Mermaid 图表兼容性 | 部分浏览器渲染失败 | 降级方案：使用 HTML 表格+CSS 替代 |

---

文档版本: v2.0-iteration | 最后更新: 2026-03-18