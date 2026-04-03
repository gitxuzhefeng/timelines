//! 可选：小图放大，减轻 Tesseract 对小字截图的吃力。

use image::{DynamicImage, GenericImageView, ImageBuffer, Luma};

/// 若最大边小于 `min_edge`，按比例放大至至少 `target_min_edge`（上限 `max_edge`）。
pub fn scale_up_if_small(img: &DynamicImage, min_edge: u32, target_min_edge: u32, max_edge: u32) -> DynamicImage {
    let (w, h) = img.dimensions();
    let m = w.max(h);
    if m >= min_edge {
        return img.clone();
    }
    let scale = (target_min_edge as f64 / m as f64).min(max_edge as f64 / m as f64);
    if scale <= 1.01 {
        return img.clone();
    }
    let nw = ((w as f64) * scale).round().clamp(1.0, max_edge as f64) as u32;
    let nh = ((h as f64) * scale).round().clamp(1.0, max_edge as f64) as u32;
    img.resize(nw, nh, image::imageops::FilterType::Triangle)
}

/// 简单深色界面增强：整图平均亮度低于阈值则反相（保守阈值）。
pub fn maybe_invert_dark_ui(img: &DynamicImage, brightness_threshold: u8) -> DynamicImage {
    let gray = img.to_luma8();
    let sum: u64 = gray.pixels().map(|p| p[0] as u64).sum();
    let n = gray.width() * gray.height();
    if n == 0 {
        return img.clone();
    }
    let mean = (sum / n as u64) as u8;
    if mean > brightness_threshold {
        return img.clone();
    }
    let inv: ImageBuffer<Luma<u8>, Vec<u8>> = ImageBuffer::from_fn(gray.width(), gray.height(), |x, y| {
        let v = gray.get_pixel(x, y)[0];
        Luma([255u8.saturating_sub(v)])
    });
    DynamicImage::ImageLuma8(inv)
}
