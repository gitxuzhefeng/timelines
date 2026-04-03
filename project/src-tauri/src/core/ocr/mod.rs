//! 本地 OCR 管线（截图增强）。

mod engine;
#[cfg(target_os = "macos")]
mod macos_vision;
mod pipeline;
mod preprocess;
mod redact;
mod tsv;
mod worker;
#[cfg(target_os = "windows")]
mod win_ocr;

pub use engine::ocr_image_file;
pub use pipeline::{OcrLineEval, OcrPipelineConfig};
pub use worker::{spawn_ocr_worker, OcrJob};
