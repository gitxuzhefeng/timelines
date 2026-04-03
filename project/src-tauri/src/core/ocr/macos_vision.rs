//! macOS：Vision `VNRecognizeTextRequest`（离线）。

#![cfg(target_os = "macos")]

use objc2::msg_send;
use objc2::rc::{autoreleasepool, Retained};
use objc2::AnyThread;
use objc2_core_foundation::CGRect;
use objc2_foundation::{NSArray, NSData, NSDictionary, NSString};
use objc2_vision::{
    VNImageOption, VNImageRequestHandler, VNRecognizeTextRequest, VNRequest,
    VNRequestTextRecognitionLevel,
};

/// `chi_sim+eng` 等设置项映射为 BCP 47（Vision 用）。
pub fn vision_language_tags(ocr_languages: &str) -> Vec<String> {
    let s = ocr_languages.to_lowercase();
    let mut out = Vec::new();
    if s.contains("chi_tra") {
        out.push("zh-Hant".into());
    }
    if s.contains("chi_sim") {
        out.push("zh-Hans".into());
    }
    if s.contains("eng") || s.contains("en") || out.is_empty() {
        out.push("en-US".into());
    }
    out
}

/// PNG 字节 → 按阅读序（自上而下）的「行」，每行内为单段文本 + 置信度 0～100。
pub fn recognize_png_bytes(
    png_bytes: &[u8],
    accurate: bool,
    language_tags: &[String],
) -> Result<Vec<Vec<(String, f32)>>, String> {
    autoreleasepool(|_| {
        let data = NSData::with_bytes(png_bytes);
        let opts = NSDictionary::<VNImageOption, objc2::runtime::AnyObject>::new();
        let handler = VNImageRequestHandler::initWithData_options(
            VNImageRequestHandler::alloc(),
            &data,
            &opts,
        );
        let request = VNRecognizeTextRequest::new();
        let level = if accurate {
            VNRequestTextRecognitionLevel::Accurate
        } else {
            VNRequestTextRecognitionLevel::Fast
        };
        request.setRecognitionLevel(level);
        let langs: Vec<Retained<NSString>> = language_tags
            .iter()
            .map(|t| NSString::from_str(t.as_str()))
            .collect();
        let lang_arr = NSArray::from_retained_slice(&langs);
        request.setRecognitionLanguages(&lang_arr);

        let req_ref: &VNRequest = unsafe { std::mem::transmute::<&VNRecognizeTextRequest, &VNRequest>(&*request) };
        let batch = NSArray::from_slice(&[req_ref]);
        handler
            .performRequests_error(&batch)
            .map_err(|e| format!("Vision performRequests: {}", e.localizedDescription().to_string()))?;

        let Some(observations) = request.results() else {
            return Ok(Vec::new());
        };

        let mut extracted: Vec<(f64, Vec<(String, f32)>)> = Vec::new();
        for obs in observations.to_vec() {
            let bbox: CGRect = unsafe { msg_send![&*obs, boundingBox] };
            let sort_y = f64::from(bbox.origin.y) + f64::from(bbox.size.height);
            let candidates = obs.topCandidates(1);
            if candidates.is_empty() {
                continue;
            }
            let rt = unsafe { candidates.objectAtIndex_unchecked(0) };
            let s = rt.string().to_string();
            let trim = s.trim();
            if trim.is_empty() {
                continue;
            }
            let conf = (rt.confidence() * 100.0).clamp(0.0, 100.0);
            extracted.push((sort_y, vec![(trim.to_string(), conf)]));
        }

        extracted.sort_by(|a, b| {
            b.0.partial_cmp(&a.0)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        Ok(extracted.into_iter().map(|(_, line)| line).collect())
    })
}
