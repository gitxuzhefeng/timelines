# 二期 · 截图增强 — OCR 原生引擎与闸门（v2.0）归档快照

> **归档日期**：2026-04-03  
> **定义**：在 **v1.0**（Tesseract 基线、验收报告见 `../v1.0-20260403/`）之上，落地 **平台原生 OCR 分流**（macOS Vision / Windows WinRT / 其他 Tesseract TSV）、**词级闸门与行级结构化**（`build_gated_from_word_lines`）、以及 **Vision 词置信度为 0 时的中性分处理**（`effective_native_word_conf`），避免误报 `NO_TEXT`。

本目录为当期需求与技术文档的**只读快照**；若主支在 `prd/`、`rule/` 继续修订，**本目录不自动同步**。

## 本目录内容

| 文件 | 说明 |
| --- | --- |
| `PRD_二期截图增强_智能洞察.md` | 产品需求（归档时主支为 **v4.3**） |
| `二期截图增强_技术方案.md` | 二期截图增强总技术方案（执行摘要层） |
| `二期截图增强_OCR专题优化技术方案.md` | OCR 专题技术方案（含 v2.2 §1.1 工程落地说明等） |
| `二期截图增强_OCR实现与测试报告.md` | 实现范围、单测与平台验证结论 |
| `TimeLens_TechArch_Phase2_截图增强.md` | 规则侧技术架构（与 OCR 专题方案对齐） |

## 实现代码锚点（主支，非快照）

- `project/src-tauri/src/core/ocr/`：`engine.rs`、`pipeline.rs`、`macos_vision.rs`、`win_ocr.rs`、`mod.rs`
- 前端 OCR 相关页：`project/src/pages/OcrEvalPage.tsx`、`OcrSearchPage.tsx` 等（以主支为准）

## 活跃主支与导航

- **PRD**：`prd/PRD_二期截图增强_智能洞察.md`
- **OCR 专题方案**：`prd/二期截图增强_OCR专题优化技术方案.md`
- **实现与测试报告**：`prd/二期截图增强_OCR实现与测试报告.md`
- **架构规则**：`rule/TimeLens_TechArch_Phase2_截图增强.md`
- **上一阶段归档**：`docs/archived/二期截图增强/v1.0-20260403/`
