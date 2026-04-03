//! 解析 Tesseract `tsv` 输出（字/词级置信度与坐标）。

#[derive(Debug, Clone, PartialEq)]
pub struct TsvWord {
    pub level: i32,
    pub block: i32,
    pub par: i32,
    pub line: i32,
    pub word: i32,
    pub left: i32,
    pub top: i32,
    pub width: i32,
    pub height: i32,
    /// 0–100，-1 表示无置信度
    pub conf: f32,
    pub text: String,
}

/// 仅保留 level=5 的词级行（Tesseract 4/5）。
pub fn parse_tsv(tsv: &str) -> Vec<TsvWord> {
    let mut out = Vec::new();
    for line in tsv.lines() {
        if line.is_empty() || line.starts_with("level\t") {
            continue;
        }
        let mut parts = line.splitn(12, '\t');
        let level: i32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(-1);
        if level != 5 {
            continue;
        }
        let _page: i32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        let block: i32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        let par: i32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        let line_num: i32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        let word: i32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        let left: i32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        let top: i32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        let width: i32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        let height: i32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        let conf: f32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(-1.0);
        let text = parts.next().unwrap_or("").to_string();
        if text.is_empty() {
            continue;
        }
        out.push(TsvWord {
            level,
            block,
            par,
            line: line_num,
            word,
            left,
            top,
            width,
            height,
            conf,
            text,
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_sample_tsv() {
        let raw = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n\
                   5\t1\t1\t1\t1\t1\t10\t20\t30\t12\t92\tHello\n\
                   5\t1\t1\t1\t1\t2\t45\t20\t25\t12\t88\tWorld\n";
        let w = parse_tsv(raw);
        assert_eq!(w.len(), 2);
        assert_eq!(w[0].text, "Hello");
        assert!((w[0].conf - 92.0).abs() < 0.01);
        assert_eq!(w[1].text, "World");
    }
}
