# TimeLens 一期开发执行记录

> **执行时间**: 2026-03-27
> **执行目标**: 基于需求文档和技术架构，通过 Openclaw Agent 多 Agent 并发开发

---

## 一、文档分析

### 1.1 需求文档核心要点

**产品定位**: AI 驱动的个人时间透视镜，macOS 本地运行的工作行为追踪工具

**一期使命**: 搭建采得全、存得稳、跑得通的本地行为数据基础设施

**核心特性**:
- 被动采集：窗口、截图、输入、环境数据
- 本地存储：100% 数据本地，零网络请求
- 隐私优先：不记录按键内容、密码等敏感信息
- 双层数据模型：raw_events → window_sessions

### 1.2 技术架构核心要点

**技术栈**:
- 后端: Rust + Tauri 2.x
- 前端: React 18 + Vite + TailwindCSS + Zustand
- 数据库: SQLite (rusqlite 0.39.x)
- 图像: image crate + image_hasher (pHash)

**架构分层**:
```
L1: 用户交互层 (系统托盘)
L2: 校验展示层 (React UI)
L3: 通信桥接层 (Tauri IPC)
L4: 核心引擎层 (Tracker/Capture/Aggregation)
L4.5: 统一写入层 (Writer Actor)
L5: 数据访问层 (SQLite)
L6: OS 集成层 (macOS Native API)
L7: 持久化存储层 (~/.timelens/)
```

**P0 核心模块** (必做):
- Tracker Engine (2s 轮询窗口状态)
- Capture Engine (智能截图 + pHash 去重)
- Aggregation Pipeline (raw_events → window_sessions)
- Writer Actor (统一写入队列)
- 7 张核心数据表
- 权限检测与引导
- 基础验证面板

**P1 可选模块** (视进度):
- Input Dynamics (输入行为统计)
- Clipboard Flow (剪贴板元数据)

---

## 二、多 Agent 并发开发策略

### 2.1 模块拆分与 Agent 分配

基于技术架构的分层设计，将开发任务拆分为可并行的模块：

#### Backend Agent 分组

**Backend-Agent-1: 数据层基础设施**
- 任务: SQLite 数据库初始化、Schema 设计、Migration 机制
- 交付物:
  - `src-tauri/src/db/mod.rs` - 数据库连接管理
  - `src-tauri/src/db/schema.rs` - 表结构定义
  - `src-tauri/src/db/migrations.rs` - 版本迁移
  - 7 张核心表: raw_events, window_sessions, snapshots, app_switches, settings, schema_migrations, aggregation_checkpoints

**Backend-Agent-2: Writer Actor 统一写入层**
- 任务: 实现单线程串行写入队列
- 交付物:
  - `src-tauri/src/writer/mod.rs` - Writer Actor 主逻辑
  - `src-tauri/src/writer/events.rs` - WriteEvent 枚举定义
  - mpsc channel 通道管理
  - 批量事务提交逻辑

**Backend-Agent-3: Tracker Engine**
- 任务: 2s 轮询窗口状态，产出 raw_events
- 交付物:
  - `src-tauri/src/engines/tracker/mod.rs`
  - macOS NSWorkspace/AXUIElement 集成
  - 窗口状态变化检测
  - 事件投递到 Writer Actor

**Backend-Agent-4: Capture Engine**
- 任务: 智能截图 + pHash 去重
- 交付物:
  - `src-tauri/src/engines/capture/mod.rs`
  - CoreGraphics 截图采集
  - image_hasher pHash 计算
  - WebP 压缩存储
  - 去重逻辑

**Backend-Agent-5: Aggregation Pipeline**
- 任务: raw_events → window_sessions 折叠聚合
- 交付物:
  - `src-tauri/src/engines/aggregation/mod.rs`
  - 实时聚合 + 补偿机制
  - Session 边界检测
  - 聚合数据写入

**Backend-Agent-6: Tauri IPC Commands**
- 任务: 前后端通信接口
- 交付物:
  - `src-tauri/src/commands/mod.rs`
  - 状态查询接口
  - Session 列表接口
  - 截图读取接口
  - 存储统计接口

#### Frontend Agent 分组

**Frontend-Agent-1: 项目脚手架与基础配置**
- 任务: React + Vite + TailwindCSS + Zustand 初始化
- 交付物:
  - `src/` 目录结构
  - `vite.config.ts`
  - `tailwind.config.js`
  - `tsconfig.json`
  - Zustand store 基础架构

**Frontend-Agent-2: 状态监控面板**
- 任务: 实时状态展示
- 交付物:
  - `src/components/StatusPanel.tsx`
  - 引擎运行状态
  - 权限检测状态
  - 实时数据统计

**Frontend-Agent-3: Session 列表与详情**
- 任务: window_sessions 数据展示
- 交付物:
  - `src/components/SessionList.tsx`
  - `src/components/SessionDetail.tsx`
  - react-virtuoso 虚拟列表
  - 时间轴展示

**Frontend-Agent-4: 截图预览组件**
- 任务: 截图网格展示与预览
- 交付物:
  - `src/components/SnapshotGrid.tsx`
  - `src/components/SnapshotViewer.tsx`
  - Tauri URI 协议加载图片
  - 缩略图网格布局

### 2.2 并发执行策略

```
时间线 (并行执行):

T0-T1: 基础设施准备
  ├─ Backend-Agent-1: 数据库 Schema ──┐
  └─ Frontend-Agent-1: 项目脚手架 ───┤
                                    ├─→ T1 完成基础依赖
T1-T2: 核心引擎开发                  │
  ├─ Backend-Agent-2: Writer Actor ←┘
  ├─ Backend-Agent-3: Tracker Engine
  ├─ Backend-Agent-4: Capture Engine
  └─ Backend-Agent-5: Aggregation Pipeline

T2-T3: 接口与 UI 开发
  ├─ Backend-Agent-6: IPC Commands ──┐
  ├─ Frontend-Agent-2: 状态面板 ─────┤
  ├─ Frontend-Agent-3: Session 列表 ─┼─→ T3 集成联调
  └─ Frontend-Agent-4: 截图预览 ─────┘

T3-T4: 集成测试与优化
```

---

## 三、Openclaw Agent 执行流程

### 3.1 Tech Leader Agent 启动

**执行命令**:
```bash
openclaw agent \
  --agent tech_leader_agent \
  --message "【流程触发】技术团队，需求文件路径：/Users/xzf/openclaw/flow_context/pm/PRD_一期_数据底座.md" \
  --timeout 3000
```

**执行时间**: 2026-03-27 15:54

**命令说明**:
- `--agent tech_leader_agent`: 指定技术负责人 Agent
- `--message`: 传递需求文档路径，触发技术团队流程
- `--timeout 3000`: 设置 50 分钟超时

### 3.2 文档分发计划

将核心文档复制到 Openclaw 工作目录：

```bash
# 产品需求文档
/Users/xzf/openclaw/flow_context/pm/PRD_一期_数据底座.md

# 技术架构文档
/Users/xzf/openclaw/flow_context/pm/TimeLens_TechArch_V2.md
```

---

## 四、Agent 任务分配详情

### 4.1 Backend Agent 任务清单

#### Backend-Agent-1: 数据层基础设施
**优先级**: P0 (最高)
**依赖**: 无
**预计工时**: 2 天

**详细任务**:
1. 创建 `src-tauri/src/db/` 模块
2. 实现 SQLite 连接池管理 (rusqlite 0.39.x)
3. 设计 7 张核心表 Schema:
   - `raw_events`: 原始事件宽表
   - `window_sessions`: 聚合会话层
   - `snapshots`: 截图元数据
   - `app_switches`: 应用切换图谱
   - `settings`: 配置项
   - `schema_migrations`: 版本管理
   - `aggregation_checkpoints`: 聚合检查点
4. 实现 Migration 机制
5. 编写单元测试

**交付标准**:
- 数据库初始化成功
- 所有表创建正确
- Migration 可回滚

---

#### Backend-Agent-2: Writer Actor 统一写入层
**优先级**: P0
**依赖**: Backend-Agent-1
**预计工时**: 2 天

**详细任务**:
1. 定义 `WriteEvent` 枚举 (RawEvent, AppSwitch, Snapshot, Session)
2. 创建 mpsc channel (容量 256)
3. 实现单线程 Writer Actor
4. 批量事务提交逻辑
5. 错误隔离与重试机制
6. 性能指标收集

**交付标准**:
- 单线程串行写入正常
- 批量提交性能达标 (>100 events/s)
- 错误不影响主进程

---

#### Backend-Agent-3: Tracker Engine
**优先级**: P0
**依赖**: Backend-Agent-2
**预计工时**: 3 天

**详细任务**:
1. 创建独立 OS 线程
2. 集成 macOS NSWorkspace API
3. 集成 AXUIElement API
4. 2s 轮询窗口状态
5. 状态变化检测 (crc32fast hash)
6. 事件投递到 Writer Actor
7. 权限检测与引导

**交付标准**:
- 窗口切换实时捕获
- raw_events 正确写入
- 权限缺失时优雅降级

---

#### Backend-Agent-4: Capture Engine
**优先级**: P0
**依赖**: Backend-Agent-2
**预计工时**: 3 天

**详细任务**:
1. 集成 CoreGraphics 截图 API
2. 实现 pHash 计算 (image_hasher)
3. WebP 压缩存储
4. 去重逻辑 (汉明距离阈值)
5. 截图文件管理 (~/.timelens/data/shots/)
6. 信号驱动触发机制

**交付标准**:
- 截图清晰度达标
- pHash 去重准确率 >95%
- 存储空间优化 (<5MB/天)

---

#### Backend-Agent-5: Aggregation Pipeline
**优先级**: P0
**依赖**: Backend-Agent-1, Backend-Agent-2
**预计工时**: 3 天

**详细任务**:
1. 实时聚合逻辑 (raw_events → window_sessions)
2. Session 边界检测算法
3. 补偿机制 (定时扫描未聚合数据)
4. 聚合检查点管理
5. Tokio 异步任务调度

**交付标准**:
- Session 聚合准确
- 实时性 <5s
- 补偿机制可靠

---

#### Backend-Agent-6: Tauri IPC Commands
**优先级**: P0
**依赖**: Backend-Agent-1 ~ 5
**预计工时**: 2 天

**详细任务**:
1. 实现状态查询接口
2. 实现 Session 列表接口 (分页)
3. 实现截图读取接口 (URI 协议)
4. 实现存储统计接口
5. 错误处理与类型定义

**交付标准**:
- 所有接口响应 <100ms
- 类型安全 (TypeScript 定义)
- 错误信息清晰

---

### 4.2 Frontend Agent 任务清单

#### Frontend-Agent-1: 项目脚手架
**优先级**: P0
**依赖**: 无
**预计工时**: 1 天

**详细任务**:
1. 初始化 React 18 + Vite 项目
2. 配置 TailwindCSS 3.4.x
3. 配置 Zustand 4.x 状态管理
4. 配置 TypeScript
5. 创建目录结构

**交付标准**:
- 开发服务器正常启动
- HMR 正常工作
- 类型检查通过

---

#### Frontend-Agent-2: 状态监控面板
**优先级**: P0
**依赖**: Frontend-Agent-1, Backend-Agent-6
**预计工时**: 2 天

**详细任务**:
1. 创建 StatusPanel 组件
2. 实时引擎状态展示
3. 权限检测状态展示
4. 数据统计卡片
5. Tauri IPC 调用集成

**交付标准**:
- 状态实时更新
- UI 响应流畅
- 错误状态清晰展示

---

#### Frontend-Agent-3: Session 列表
**优先级**: P0
**依赖**: Frontend-Agent-1, Backend-Agent-6
**预计工时**: 2 天

**详细任务**:
1. 集成 react-virtuoso 虚拟列表
2. Session 列表组件
3. Session 详情组件
4. 时间轴展示
5. 分页加载

**交付标准**:
- 大数据量流畅滚动
- 详情展示完整
- 加载性能优化

---

#### Frontend-Agent-4: 截图预览
**优先级**: P0
**依赖**: Frontend-Agent-1, Backend-Agent-6
**预计工时**: 2 天

**详细任务**:
1. 截图网格组件
2. 截图查看器组件
3. Tauri URI 协议加载
4. 缩略图优化
5. 图片懒加载

**交付标准**:
- 网格布局美观
- 图片加载快速
- 查看器交互流畅

---

## 五、执行 Openclaw Agent

### 5.1 环境准备

**Node.js 版本升级**:
```bash
# 原版本: v20.19.6 (不满足要求)
# 升级到: v22.22.2
nvm install 22
nvm use 22
nvm alias default 22
```

### 5.2 Tech Leader Agent 执行

**执行命令**:
```bash
openclaw agent \
  --agent tech_leader_agent \
  --message "【流程触发】技术团队，需求文件路径：/Users/xzf/openclaw/flow_context/pm/PRD_一期_数据底座.md" \
  --timeout 3000
```

**执行状态**: ✅ 后台运行中
**任务 ID**: bhx715e0v
**Node.js 版本**: v22.22.2
**输出文件**: `/private/tmp/claude-501/-Users-xzf-Project-study-timelines/78d3bcad-3610-4c2d-98b9-b331b646609e/tasks/bhx715e0v.output`

### 5.3 Tech Leader Agent 执行进展

**✅ Phase 0: 任务拆解** - 已完成
- 成功接收 FlowManager-Agent 触发的任务
- 解析需求文档和技术架构文档
- 完成任务拆解

**🔄 Phase 1: 并行下发设计准备任务** - 进行中
- 正在创建并分配子 Agent
- 准备并发执行开发任务

**预期后续流程**:
1. ✅ 读取需求文档 (已完成)
2. ✅ 读取技术文档 (已完成)
3. ✅ 任务分解 (已完成)
4. 🔄 Agent 分配 (进行中)
5. ⏳ 并发执行
6. ⏳ 进度跟踪
7. ⏳ 集成验证

---

## 六、并发开发执行计划

### 6.1 第一阶段：基础设施 (Day 1-2)

**并发 Agent**:
- Backend-Agent-1: 数据库 Schema
- Frontend-Agent-1: React 脚手架

**关键里程碑**:
- ✓ SQLite 数据库初始化
- ✓ 7 张表创建完成
- ✓ React + Vite 项目启动

### 6.2 第二阶段：核心引擎 (Day 3-5)

**并发 Agent**:
- Backend-Agent-2: Writer Actor
- Backend-Agent-3: Tracker Engine
- Backend-Agent-4: Capture Engine
- Backend-Agent-5: Aggregation Pipeline

**关键里程碑**:
- ✓ 统一写入队列正常工作
- ✓ 窗口状态实时采集
- ✓ 截图去重机制生效
- ✓ Session 聚合准确

### 6.3 第三阶段：接口与 UI (Day 6-8)

**并发 Agent**:
- Backend-Agent-6: Tauri IPC Commands
- Frontend-Agent-2: 状态监控面板
- Frontend-Agent-3: Session 列表
- Frontend-Agent-4: 截图预览

**关键里程碑**:
- ✓ 前后端通信正常
- ✓ 实时状态展示
- ✓ Session 数据可视化
- ✓ 截图预览流畅

### 6.4 第四阶段：集成测试 (Day 9-10)

**测试项**:
- 端到端数据流验证
- 性能压力测试
- 权限异常处理
- 内存泄漏检测

---

## 七、技术风险与应对

### 7.1 高风险项

| 风险项 | 风险等级 | 应对措施 |
|--------|---------|---------|
| macOS 权限限制 | 🔴 高 | 提前验证 Accessibility + Screen Recording 权限流程 |
| CGEventTap 稳定性 | 🟡 中 | P1 模块独立可禁用，不影响核心链路 |
| pHash 去重准确率 | 🟡 中 | 可调整汉明距离阈值，提供配置项 |
| SQLite 写入性能 | 🟡 中 | Writer Actor 批量提交 + WAL 模式 |
| 截图存储空间 | 🟢 低 | WebP 压缩 + 定期清理策略 |

### 7.2 依赖风险

| 依赖项 | 版本 | 风险评估 |
|--------|------|---------|
| rusqlite | 0.39.x | ✅ 稳定，社区活跃 |
| image_hasher | 3.1.1 | ✅ 最近更新，功能完整 |
| Tauri | 2.x | ✅ 生产可用 |
| core-graphics | 0.23.x | ⚠️ 需验证权限处理 |

---

## 八、交付物清单

### 8.1 代码交付物

**后端 (Rust)**:
```
src-tauri/
├── src/
│   ├── main.rs
│   ├── db/
│   │   ├── mod.rs
│   │   ├── schema.rs
│   │   └── migrations.rs
│   ├── writer/
│   │   ├── mod.rs
│   │   └── events.rs
│   ├── engines/
│   │   ├── tracker/
│   │   ├── capture/
│   │   └── aggregation/
│   └── commands/
│       └── mod.rs
├── Cargo.toml
└── tauri.conf.json
```

**前端 (React)**:
```
src/
├── components/
│   ├── StatusPanel.tsx
│   ├── SessionList.tsx
│   ├── SessionDetail.tsx
│   ├── SnapshotGrid.tsx
│   └── SnapshotViewer.tsx
├── stores/
│   └── appStore.ts
├── App.tsx
└── main.tsx
```

### 8.2 文档交付物

- ✅ 本执行记录文档
- 📋 API 接口文档 (待生成)
- 📋 数据库 Schema 文档 (待生成)
- 📋 部署指南 (待生成)

---

## 九、总结

### 9.1 执行策略

本次开发采用 **Openclaw 多 Agent 并发开发模式**，将 TimeLens 一期数据底座拆分为：
- **6 个 Backend Agent** (数据库、Writer、Tracker、Capture、Aggregation、IPC)
- **4 个 Frontend Agent** (脚手架、状态面板、Session 列表、截图预览)

通过并行执行，预计可将开发周期从 **20 天压缩至 10 天**。

### 9.2 关键成功因素

1. **模块正交性**: 各 Agent 任务独立，依赖关系清晰
2. **接口先行**: Backend-Agent-1 优先完成数据层，为其他模块提供基础
3. **统一写入**: Writer Actor 避免并发写入冲突
4. **风险隔离**: P1 模块可禁用，不影响核心功能

### 9.3 下一步行动

- ⏳ 等待 Tech Leader Agent 完成任务分配
- 📊 监控各子 Agent 执行进度
- 🔍 定期检查集成点是否正常
- ✅ 完成后进行端到端验证

---

**文档生成时间**: 2026-03-28 08:30
**执行状态**: ✅ Tech Leader Agent 已完成，DocAgent 执行中
**当前阶段**: 文档编写与 DMG 打包
**预计完成时间**: 2026-04-06

---

## 十、DocAgent 执行记录

### 10.1 DocAgent 启动

**执行命令**:
```bash
openclaw agent --agent doc_agent \
  --message "【流程触发】文档团队，技术文档路径：/Users/xzf/openclaw/flow_context/pm/TimeLens_TechArch_V2.md，需求文档路径：/Users/xzf/openclaw/flow_context/pm/PRD_一期_数据底座.md，请完成用户使用文档编写和 DMG 安装包制作" \
  --timeout 3000
```

**执行状态**: ✅ 后台运行中
**任务 ID**: bxtz0216r

### 10.2 已完成的文档

#### 1. 用户使用手册
**文件**: `TimeLens_用户使用手册.md`

**内容包含**:
- 产品简介与核心特性
- 系统要求（最低/推荐配置）
- 安装指南（DMG 安装 + 源码构建）
- 首次启动与权限授予
- 核心功能详解（系统托盘、主界面、数据采集）
- 常见问题 FAQ
- 隐私说明与数据保护

#### 2. 功能介绍文档
**文件**: `TimeLens_功能介绍.md`

**内容包含**:
- 核心价值主张
- 核心功能详解（被动追踪、智能截图、会话聚合、状态监控）
- 技术特性（本地优先、高性能、隐私保护）
- 使用场景（开发工程师、自由职业者、效率优化者）
- 数据示例与统计展示
- 技术架构亮点
- 产品路线图

#### 3. DMG 打包脚本
**文件**: `scripts/build-dmg.sh`

**功能**:
- 自动检测构建产物
- 支持 create-dmg 和 hdiutil 两种打包方式
- 创建标准 macOS DMG 安装包
- 包含 Applications 快捷方式

#### 4. DMG 打包指南
**文件**: `docs/DMG打包指南.md`

**内容包含**:
- 前置准备与依赖安装
- 打包步骤（脚本 + 手动）
- 输出文件结构
- 安装测试方法
- 代码签名与公证（可选）
- 故障排查

### 10.3 DMG 打包流程

**打包命令**:
```bash
# 1. 构建应用
npm run tauri build

# 2. 执行打包脚本
./scripts/build-dmg.sh

# 3. 输出位置
dist/TimeLens-v1.0.0.dmg
```

**DMG 文件结构**:
```
TimeLens-v1.0.0.dmg
├── TimeLens.app          # 应用程序
└── Applications (link)   # 快捷方式
```

---

## 附录：查看执行详情

**Openclaw 输出日志**:
```bash
tail -f /private/tmp/claude-501/-Users-xzf-Project-study-timelines/78d3bcad-3610-4c2d-98b9-b331b646609e/tasks/bhx715e0v.output
```

**Openclaw 状态目录**:
```bash
ls /Users/xzf/openclaw/flow_status/
```

**执行记录文档位置**:
```
/Users/xzf/Project/study/timelines/TimeLens_开发执行记录.md
```


---

## 十一、Ops Agent 执行记录

### 11.1 背景与触发

**上游产出**（DocAgent 交付）：
- `/Users/xzf/openclaw/flow_context/doc/用户使用指南.md`（19KB）
- `/Users/xzf/openclaw/flow_context/doc/产品功能介绍.md`（33KB）

**注意**：通过 `openclaw agents list` 确认，注册 Agent 中无 `ops_agent`，运营角色由 **`lifeiyu`（📈 厉飞雨）** 承担。

### 11.2 触发命令

```bash
openclaw agent --agent lifeiyu \
  --message "【流程触发】运营团队，上游文档已就绪..." \
  --timeout 3000
```

**执行状态**: 🔄 运行中
**任务 ID**: bbsi2jmi0
**输出目录（预期）**: `/Users/xzf/openclaw/flow_context/ops/`

### 11.3 预期产出

| 产出物 | 描述 |
|--------|------|
| 运营推广计划 | 渠道策略、节奏、目标 |
| Product Hunt 文案 | 标题、Tagline、描述、Maker Comment |
| Twitter/X 推文 | 发布系列推文 |
| V2EX / 掘金帖子 | 中文开发者社区文案 |


### 11.4 Ops Agent 产出结果

**执行状态**: ✅ 完成
**产出目录**: `/Users/xzf/openclaw/flow_context/ops/`

| 文件 | 大小 | 内容 |
|------|------|------|
| `运营推广计划.md` | 5.6K | 目标、用户画像、渠道策略、执行节奏 |
| `文案_ProductHunt.md` | 7.6K | 英文发布文案（标题/描述/Gallery/FAQ） |
| `文案_Twitter.md` | 4.8K | 发布系列推文（10条 Thread） |
| `文案_V2EX.md` | 7.9K | 中文开发者社区帖子 |
| `文案_开发者社区.md` | 15K | 掘金/少数派/sspai 多渠道文案 |
| `推广材料汇总.md` | 5.6K | 素材清单与待办事项 |

**推广目标（来自运营计划）**：
- Product Hunt 日榜前 10（发布后 48h）
- 官网首周访问量 5,000+
- V2EX 帖子热度前 5（72h 内）
- 种子用户 100+（首月）
- 有效产品反馈 50+ 条（首月）

