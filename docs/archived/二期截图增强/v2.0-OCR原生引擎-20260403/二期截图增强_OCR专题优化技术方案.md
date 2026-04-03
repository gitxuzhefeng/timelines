# TimeLens 二期 · 截图增强 — OCR 技术方案

> **版本**：v2.2  
> **日期**：2026-04-03  
> **说明**：工程实现与 **S0-14～S0-17** 设计。**需求与验收原文**见 `prd/PRD_二期截图增强_智能洞察.md` §2.2.2；**隐私、闸门、采样、FTS 检索形态**见 `rule/TimeLens_TechArch_Phase2_截图增强.md`。

---

## 1. 本期范围

**交付**：统一 **`OcrEngine`**；**macOS** 用 **Vision**（`VNRecognizeTextRequest`）；**Windows 10+** 用 **Windows.Media.Ocr**（WinRT）；**Linux** 用 **Tesseract**（**TSV** 输出，非 stdout 整段）。在统一中间表示上落实 **行级排版（S0-15）**、**置信度与规则闸门（S0-16）**、**可选轻量预处理（S0-17）** 与 **中英混合及可配置分割策略（S0-14）** 在各引擎上的映射。

**本期不做**：云端 OCR；语义/向量检索；像素级在图上框选命中文字；**第二套推理栈**（如 ONNX / RapidOCR / Paddle 运行时）；**跨引擎自动降级**（例如 macOS/Windows 原生失败后再跑 Tesseract）；`daily_analysis` 公式变更。

**已交付、本文不展开**：S0-1～S0-13（含多词 AND、snippet、会话收窄等），见 PRD 与 `prd/二期截图增强_技术方案.md` §2.1。

### 1.1 可行性落地说明（相对 v2.1 文稿）

- **统一闸门**：原生引擎输出经 `build_gated_from_word_lines` 与 Tesseract-TSV 路径共用 S0-16 规则；**FTS** 仍对正文做换行→空格规范化（`fts_normalize`）。  
- **Windows**：WinRT **词级无置信度**，对词统一赋中性分（约 82）以便词阈生效，**行级闸门仍主导**。  
- **macOS Vision**：`TIMELENS_OCR_PSM=11` 时采用 `Fast`，否则 `Accurate`；语言由 `ocr_languages`（如 `chi_sim+eng`）映射为 `zh-Hans` / `en-US` 等。  
- **Linux 及其他**：仍为 **Tesseract TSV**（含 `chi_sim+eng` 与 eng 语言回退）。  
- **实现位置**：`project/src-tauri/src/core/ocr/`（`macos_vision.rs`、`win_ocr.rs`、`engine.rs`、`pipeline.rs`）。

---

## 2. 现状与目标管线

**现状**：WebP → PNG → `tesseract … stdout`（默认 `eng`）→ 整段字符串 → 脱敏 → 摘要；无统一抽象、无 conf、无行序。

**目标管线**：

```
落盘 WebP → [可选] 预处理（S0-17）→ OcrEngine → 行归一（S0-15）
  → 质量闸门（S0-16）→ 脱敏 → snapshot_ocr / fts_body / 会话摘要
```

---

## 3. 引擎与平台（本期唯一组合）

| 平台 | 引擎 | 集成要点 |
| --- | --- | --- |
| macOS | Vision | Swift 模块 + FFI/sidecar；`recognitionLanguages`、fast/accurate |
| Windows | Windows.Media.Ocr | WinRT；依赖系统 **OCR 语言组件**（中英需已安装） |
| Linux | Tesseract 4.x | `-l chi_sim+eng`（或可配）、`--psm` 可配、**TSV** 解析 |

识别失败（超时、缺组件、崩溃）→ 落库 **失败/空因**，**不阻塞**快照落盘；与 PRD 空因文案一致。**不在本期**为 macOS/Windows 增加 Tesseract 或 ONNX 兜底。

---

## 4. `OcrEngine` 契约

- **`OcrLine`**：`text`、`avg_conf`；可选 `words: { text, conf, bbox? }`、`line_bbox?`（bbox **不用于** UI 框选，仅供内部或后续预留）。  
- **`OcrResult`**：`lines`（阅读序）、`engine` 枚举。

**适配**：Vision / WinRT 的 observation、word 映射到上表；Tesseract 按 TSV 行键 `(block, par, line)` 聚行，行内按 `left`，行间按 `top` 主序。

**S0-14 映射**：

| 概念 | Tesseract | Vision | Windows OCR |
| --- | --- | --- | --- |
| 中英混合 | `chi_sim+eng` + traineddata | zh-Hans、en 等 | 安装中英 OCR 语言包 |
| 可配置「分割/质量」 | `PSM`（如 6、11） | `recognitionLevel` 等 | 语言列表顺序 |

---

## 5. 技术要点（S0-14～S0-17）

**S0-14**：Tesseract 使用 `tesseract in.png out -l … --psm N tsv`；缺 traineddata 与缺 Windows 语言组件时，行为与现有「引擎异常」一致，设置页给安装指引。

**S0-15**：TSV 列 `block_num, par_num, line_num, word_num, left, top, width, height, conf, text`；`ocr_text` 用 `\n` 分行。FTS `body` 与展示是否统一换行或 fts 侧规范化为空格，**实现时二选一**并写清。

**S0-16**：词级 `conf < 0` 或 `< T_word`（默认建议 60）丢弃；行级均 conf 与启发式（符号占比等）；**仅过闸内容进 FTS**；摘要仅从过闸行选。若某引擎仅有行级 conf，词级闸门退化为行级。

**S0-17**：可选缩放 / 灰度 / 二值化 / 深色辅助路径 **至少一种** 可开关；**单帧超时**则回退原图；与队列 `MIN_INTERVAL_MS`、并发上限兼容。

---

## 6. 配置与日志

| 配置项 | 说明 |
| --- | --- |
| `ocr_languages` / Tess 专用 | Linux 与 Tess 语言串 |
| `ocr_psm` | Tesseract PSM |
| `ocr_word_conf_min`、`ocr_line_conf_min` | 闸门阈值 |
| `ocr_preprocess_enabled` | 预处理总开关 |
| macOS / Windows | 识别语言列表或跟随系统（产品定稿） |

日志：**禁止**完整屏幕原文；可记行数、平均 conf、引擎名、耗时。

---

## 7. 评测与风险

**黄金集**：50～100 张（深浅色、浏览器/IDE/IM）；指标：相对 v4.2 的 **有效字符率**、**可接受摘要率**；可选 CI golden diff。

**风险**：未装 Tesseract 语言包、Windows 缺 OCR 语言 → 检测 + 设置页说明；预处理拖慢 → 默认关或轻量、超时回退；FTS 与换行策略不一致 → 按 §5 固定一种。

---

## 8. 相关文档

| 文档 | 用途 |
| --- | --- |
| `PRD_二期截图增强_智能洞察.md` | 需求与验收 |
| `rule/TimeLens_TechArch_Phase2_截图增强.md` | 原则、闸门、采样、FTS、出境 |
| `二期截图增强_技术方案.md` | 迭代执行摘要 |
| `二期截图增强_里程碑与验收计划.md` | Given/When/Then |
| `二期截图增强_OCR专题_测试用例.md` / `…研发任务计划表.md` / `…测试报告.md` | 测试与任务 |

---

## 修订记录

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| v2.0 | 2026-04-03 | 合并 PRD 与工程叙述 |
| **v2.1** | **2026-04-03** | 去重、删导航与重复 PRD 表；**剔除 ONNX/Paddle/第二引擎/跨引擎降级** 等本期不实现项；收窄为 Vision + WinRT + Linux Tess |
| **v2.2** | **2026-04-03** | 补充 **§1.1 可行性落地**（工程已实现：三平台引擎 + 共用闸门）；与仓库代码对齐 |
