//! 本地 OCR：Tesseract `tsv` + 行级闸门 + 可选预处理（见 OCR 专题方案）。

use std::fs;
use std::path::Path;
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
use std::path::PathBuf;
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
use std::process::Command;

use image::DynamicImage;
use serde_json::json;
use uuid::Uuid;

use super::pipeline::{build_gated_from_word_lines, OcrPipelineConfig, OcrPipelineOutput};
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
use super::pipeline::build_gated_text;
use super::preprocess::{maybe_invert_dark_ui, scale_up_if_small};
use super::redact::{pick_summary_line, redact_screen_text};

/// 单次识别结果（供 worker 与评估页）。
#[derive(Debug, Clone)]
pub struct OcrWebpOutcome {
    pub text: String,
    pub summary: Option<String>,
    pub had_redaction: bool,
    /// 闸门后是否有可展示的正文（无则走 `no_text`）。
    pub has_gated_text: bool,
    pub ocr_meta: Option<String>,
    /// 未脱敏、已过闸，用于评估展示
    pub gated_preview: String,
    pub lines_detail: Vec<super::pipeline::OcrLineEval>,
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn tesseract_binary() -> PathBuf {
    if let Ok(p) = std::env::var("TIMELENS_TESSERACT") {
        let pb = PathBuf::from(p.trim());
        if !pb.as_os_str().is_empty() {
            return pb;
        }
    }
    PathBuf::from("tesseract")
}

/// 对 PNG 跑 tesseract，产出 TSV 全文。
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn run_tesseract_tsv_png(image_path: &Path, lang: &str, psm: i32) -> Result<String, String> {
    let bin = tesseract_binary();
    let out_base = std::env::temp_dir().join(format!("tl_ts_{}", Uuid::new_v4()));
    let out_str = out_base.to_string_lossy().into_owned();
    let status = Command::new(&bin)
        .arg(image_path.as_os_str())
        .arg(&out_str)
        .args(["-l", lang])
        .arg("--psm")
        .arg(psm.to_string())
        .arg("tsv")
        .status()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "未找到 tesseract：请安装 Tesseract OCR 并加入 PATH（或设置 TIMELENS_TESSERACT）".to_string()
            } else {
                format!("tesseract 启动失败: {e}")
            }
        })?;
    if !status.success() {
        let _ = fs::remove_file(format!("{}.tsv", out_str));
        return Err("tesseract 退出码非 0（可检查语言包是否已安装，如 chi_sim）".into());
    }
    let tsv_path = format!("{}.tsv", out_str);
    let raw = fs::read_to_string(&tsv_path).map_err(|e| format!("读取 tesseract tsv 失败: {e}"))?;
    let _ = fs::remove_file(&tsv_path);
    Ok(raw)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn try_tesseract_with_lang_fallback(image_path: &Path, primary_lang: &str, psm: i32) -> Result<String, String> {
    match run_tesseract_tsv_png(image_path, primary_lang, psm) {
        Ok(s) => Ok(s),
        Err(e) => {
            if primary_lang != "eng" {
                run_tesseract_tsv_png(image_path, "eng", psm).map_err(|e2| {
                    format!("OCR 失败（{primary_lang}）：{e}；回退 eng：{e2}")
                })
            } else {
                Err(e)
            }
        }
    }
}

/// FTS `body`：换行压成空格，减少 tokenizer 边角问题。
pub fn fts_normalize(s: &str) -> String {
    s.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn build_meta(cfg: &OcrPipelineConfig, pipe: &OcrPipelineOutput, engine: &str) -> String {
    let kept = pipe.lines.iter().filter(|l| l.kept).count();
    let dropped = pipe.lines.len() - kept;
    let avg: f32 = if kept == 0 {
        0.0
    } else {
        let sum: f32 = pipe.lines.iter().filter(|l| l.kept).map(|l| l.avg_conf).sum();
        sum / kept as f32
    };
    json!({
        "engine": engine,
        "languages": cfg.languages,
        "psm": cfg.psm,
        "wordConfMin": cfg.word_conf_min,
        "lineConfMin": cfg.line_conf_min,
        "linesKept": kept,
        "linesDropped": dropped,
        "avgLineConf": (avg * 10.0).round() / 10.0,
        "rawWords": pipe.raw_word_count,
        "keptWords": pipe.kept_word_count,
    })
    .to_string()
}

fn run_ocr_pipeline(
    png_path: &Path,
    cfg: &OcrPipelineConfig,
) -> Result<(OcrPipelineOutput, &'static str), String> {
    #[cfg(target_os = "macos")]
    {
        let bytes = fs::read(png_path).map_err(|e| e.to_string())?;
        let tags = super::macos_vision::vision_language_tags(cfg.languages.trim());
        // PSM 仅作用于 Tesseract；Vision 下 Fast 更易出现 conf=0，与设置页 PSM 解耦，固定 Accurate。
        let lines = super::macos_vision::recognize_png_bytes(&bytes, true, &tags)?;
        let pipe = build_gated_from_word_lines(lines, cfg);
        return Ok((pipe, "vision"));
    }
    #[cfg(target_os = "windows")]
    {
        let lines = super::win_ocr::recognize_png_path(png_path)?;
        let pipe = build_gated_from_word_lines(lines, cfg);
        return Ok((pipe, "winrt-ocr"));
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let tsv = try_tesseract_with_lang_fallback(png_path, cfg.languages.trim(), cfg.psm)?;
        let pipe = build_gated_text(&tsv, cfg);
        Ok((pipe, "tesseract-tsv"))
    }
}

/// 解码 WebP/PNG 等为 `DynamicImage`。
pub fn load_image_for_ocr(path: &Path) -> Result<DynamicImage, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    image::load_from_memory(&bytes).map_err(|e| e.to_string())
}

/// 对磁盘图像（WebP/PNG 等）执行完整管线。
pub fn ocr_image_file(image_path: &Path, cfg: &OcrPipelineConfig) -> Result<OcrWebpOutcome, String> {
    let mut img = load_image_for_ocr(image_path)?;
    if cfg.preprocess_scale {
        img = scale_up_if_small(&img, 900, 1400, 2400);
    }
    if cfg.preprocess_dark_invert {
        img = maybe_invert_dark_ui(&img, 70);
    }
    let tmp = std::env::temp_dir().join(format!("tl_ocr_{}.png", Uuid::new_v4()));
    img.save_with_format(&tmp, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    let (pipe, engine_id) = run_ocr_pipeline(&tmp, cfg)?;
    let _ = fs::remove_file(&tmp);

    let gated_preview = pipe.display_text.clone();
    let lines_detail = pipe.lines.clone();

    let gated_trim = pipe.display_text.trim();
    if gated_trim.is_empty() {
        let meta = build_meta(cfg, &pipe, engine_id);
        return Ok(OcrWebpOutcome {
            text: String::new(),
            summary: None,
            had_redaction: false,
            has_gated_text: false,
            ocr_meta: Some(meta),
            gated_preview,
            lines_detail,
        });
    }

    let (redacted_text, had_redaction) = redact_screen_text(gated_trim);
    let summary = pick_summary_line(&redacted_text);
    let ocr_meta = build_meta(cfg, &pipe, engine_id);

    Ok(OcrWebpOutcome {
        text: redacted_text.clone(),
        summary,
        had_redaction,
        has_gated_text: true,
        ocr_meta: Some(ocr_meta),
        gated_preview,
        lines_detail,
    })
}
