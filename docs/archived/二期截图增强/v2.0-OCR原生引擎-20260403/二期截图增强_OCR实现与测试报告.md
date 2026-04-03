# TimeLens 二期 · OCR 实现与测试报告

> **日期**：2026-04-03  
> **依据方案**：`prd/二期截图增强_OCR专题优化技术方案.md` v2.2、`rule/TimeLens_TechArch_Phase2_截图增强.md` v2.1  

---

## 1. 可行性评估结论

| 项 | 结论 |
| --- | --- |
| **macOS Vision** | 可行。采用 `objc2-vision` + `VNRecognizeTextRequest`，PNG 经 `NSData` 送入 `VNImageRequestHandler`；按 `boundingBox` 自上而下排序；与统一闸门对接。 |
| **Windows.Media.Ocr** | 可行。按官方示例路径：`StorageFile` → `BitmapDecoder` → `SoftwareBitmap` → `OcrEngine::TryCreateFromUserProfileLanguages` → `RecognizeAsync`；线程内 `RoInitialize(MTA)` 与现有 WinRT 用法一致。 |
| **Linux Tesseract** | 保持现有 TSV + 闸门；**未**在 macOS/Windows 上保留 Tesseract 兜底（符合 v2.1「无跨引擎降级」）。 |
| **跨平台交叉编译** | 在本机（macOS）对 `x86_64-pc-windows-msvc` 的 `cargo check` **因 `libsqlite3-sys` 在交叉环境下缺少 Windows 头文件而失败**，与 OCR 改动无关；**Windows OCR 源码需在 Windows 或完整交叉链上再验编译**。 |

---

## 2. 实现摘要

- **`pipeline.rs`**：`build_gated_from_word_lines` — 原生多行 `(词, conf0–100)` → 与 TSV 路径相同的词/行闸与 CJK 拼接规则。  
- **`macos_vision.rs`**：Vision 识别 → 行排序 → 上列闸门。  
- **`win_ocr.rs`**：WinRT 识别；词级无 conf 时使用固定中性分；无 `Words` 时退化为整行文本。  
- **`engine.rs`**：`run_ocr_pipeline` 按平台分发；`ocr_meta.engine` 为 `vision` / `winrt-ocr` / `tesseract-tsv`。  
- **依赖**：macOS 侧 `objc2` 升至 **0.6**，`objc2-app-kit` / `objc2-foundation` **0.3**；新增 `objc2-vision`、`objc2-core-foundation`（CFCGTypes）、`objc2-core-graphics`（CGGeometry）。Windows 侧 `windows` crate 增加 `Graphics_Imaging`、`Media_Ocr`、`Storage`、`Storage_Streams`。

---

## 3. 测试执行

### 3.1 自动化（本仓库）

```text
cd project/src-tauri && cargo test --lib -p timelens
```

**结果**：`39 passed, 0 failed`（含 `core::ocr::pipeline::tests::gated_from_word_lines_respects_conf` 及既有 TSV/脱敏/FTS 相关测试）。

### 3.2 编译

```text
cd project/src-tauri && cargo check
```

**结果**：在 **macOS (aarch64-apple-darwin)** 上 **通过**。

### 3.3 未在本环境执行的项

- 真机 **Windows** 上整包构建与 OCR 端到端（需本机 WinRT + OCR 语言包）。  
- 真机 **Vision** 效果回归（黄金截图集）；建议在设置页开启 OCR 后使用「评估快照」类入口抽测。

---

## 4. 结论

- **方案 v2.1/v2.2 已在代码层落地**：三平台引擎分离、统一闸门与 `ocr_meta` 标识；与「无 ONNX、无跨引擎降级」一致。  
- **当前测试验证**：单元测试与 macOS **cargo check** 通过；Windows 需在目标平台补一轮 **构建 + 手动抽测**。  

---

## 5. 修订记录

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| v1.0 | 2026-04-03 | 首版：可行性、实现文件、测试结果与局限 |
