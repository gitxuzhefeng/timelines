# TimeLens 产品迭代规范（极简 Agent 版）

```yaml
doc: TimeLens_iteration_spec
version: v3.1-ultra
updated: 2026-04-19
scope: 里程碑迭代；热修可跳过闸门须书面记裁剪与风险
base: 技术栈/命令见 CLAUDE.md；细节见 rule/ 架构与当期 PRD
```

## 角色 `OWNER_*`

`OWNER_PRODUCT` 范围/验收/Release · `OWNER_TECH` 架构/拆分/风险 · `OWNER_CONTRACT` 契约变更同步 PRD+架构+任务+测试 · `OWNER_QA` 用例/回归/缺陷

## 闸门 `GATE_G0`…`GATE_G6`（顺序通过；紧急跳过须备案）

- `GATE_G0` 一句话目标 → issue/立项  
- `GATE_G1` PRD：用户、必做/不做、优先级、衔接、已知限制 → 带版本日期 PRD  
- `GATE_G2` 方案与 P0 一致、依赖/禁止/NFR 无冲突 → 架构更新  
- `GATE_G3` 模块依赖、可测验收、契约 Owner 已定 → 里程碑/验收计划定稿  
- `GATE_G4` P0 联调、测试绿、无开 P0 缺陷 → MR 合并可构建  
- `GATE_G5` 自动化+约定手动 E2E；有性能/稳定性要求则已记录 → 验收归档  
- `GATE_G6` 版本与构建一致、Release+已知限制 → Tag/渠道/文档索引

## 工件 `ARTIFACT_*`（裁剪须注明）

`ARTIFACT_PRD` `prd/PRD_<阶段>_<主题>.md` · `ARTIFACT_ARCH` `rule/TimeLens_TechArch_V2.md`（+`TimeLens_TechArch_Phase2.md`）· `ARTIFACT_MILESTONE` 里程碑/任务/验收表 · `ARTIFACT_DICT` 指标字典按需 · `ARTIFACT_TEST` `docs/` 或并入验收

**`TRACE_P0`**：每条 P0 须链到架构模块/接口/表 **或** G/W/T 验收；禁孤儿需求。

## PRD 块 `PRD_*`

`PRD_BACKGROUND` `PRD_MISSION` `PRD_USERS` `PRD_SCOPE`（P0/P1/延后+**不做表**）`PRD_CONSTRAINTS` `PRD_ACCEPTANCE`（与验收同源/可映射）`PRD_DEGRADE`（按需：默认可关、失败 UX）

**`SCOPE_LOCK`**：进 P0 须产品批+bump 版本；愿景须附**本迭代落地子集**；隐私/外网/AI/付费/第三方须同步架构与用户说明；文首：版本、日期、基准、关联文档。

## 规则一词表（实现/排期/测发/运维）

`ARCH_P0` P0 有架构落点或预留 · `ARCH_FORBIDDEN` 破禁止项须 PRD+架构+合规/用户说明同步 · `RISK_P0_P1` P1 可降级、核心不默认绑死 P1 · `CONTRACT_SYNC` 公共契约改须对齐实现/类型/验收测 · `ENGINEERING` 单写者幂等分层语义隐私默认可测；AI/外服失败回退基线

`SCHEDULE_DAG` 先依赖 DAG 再日历 · `TASK_BLOCK` G/W/T+联调点+环境依赖 · `DOD` 合并评审+测绿+契约+行为与已知限制文档一致 · `BUFFER` 权限/原生/IPC/多端留缓冲

`TEST_AUTO` 逻辑迁移聚合优先自动 · `TEST_MANUAL` 权限/GUI/多应用手写 E2E · `TEST_TRACE` 用例↔PRD/验收 ID · `TEST_RELEASE` 全量自动（若有）+主路径手动；碰数据/迁移/核心 Writer 跑约定套件 · `PERF` 有目标则模板记录偏离备注

`CHECKLIST_RELEASE` 契约一致、PRD 冲突已落地或备案、已知限制已写、P0 验收已归档

`VERSION_SOURCE` 单一来源脚本 bump（如 tauri.conf / package.json）· `BUILD_DOC` 发布/产物/签名可查 · `RELEASE_NOTE` 新增/修复/破坏/限制/迁移；区分「不做」vs「限制」· `TELEMETRY_DEFAULT` 更新/遥测/第三方默认关，除非 PRD+架构+用户同意

`LAYER_L1` 本规范 · `LAYER_L2` 架构字典 · `LAYER_L3` 当期 PRD+计划 · `RETRO` 每里程碑复盘跳过闸门与原因

---

*v2.2 完整版与修订史见 git 历史。*
