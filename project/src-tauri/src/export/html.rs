use pulldown_cmark::{Options, Parser};
use pulldown_cmark::html::push_html as cm_push_html;
use serde_json::Value;

const CSS: &str = r#"
:root { --bg: #ffffff; --text: #1a1a1a; --muted: #666; --border: #e2e2e2; --code-bg: #f5f5f5; --bar: #4f8ef7; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #0f1117; --text: #e8eaf0; --muted: #888; --border: #2a2a3a; --code-bg: #1e1e2e; --bar: #6fa3ff; }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 15px; line-height: 1.7; max-width: 820px; margin: 0 auto; padding: 40px 24px 80px; }
h1 { font-size: 1.6rem; font-weight: 700; margin-bottom: 8px; }
h2 { font-size: 1.1rem; font-weight: 600; margin-top: 32px; margin-bottom: 10px; padding-bottom: 4px; border-bottom: 1px solid var(--border); }
p, li { margin-bottom: 6px; }
ul, ol { padding-left: 20px; margin-bottom: 12px; }
strong { font-weight: 600; }
code { background: var(--code-bg); border-radius: 4px; padding: 1px 5px; font-size: 0.88em; }
pre { background: var(--code-bg); border-radius: 6px; padding: 14px; overflow-x: auto; margin-bottom: 16px; }
blockquote { border-left: 3px solid var(--border); color: var(--muted); padding-left: 14px; margin: 12px 0; font-style: italic; }
hr { border: none; border-top: 1px solid var(--border); margin: 32px 0; }
footer { margin-top: 48px; font-size: 0.8rem; color: var(--muted); border-top: 1px solid var(--border); padding-top: 12px; }
figure { margin: 24px 0; }
figcaption { font-size: 0.82rem; color: var(--muted); margin-top: 8px; }
"#;

/// 解析 top_apps JSON，返回 (app_name, duration_ms) 列表（前 8 条）。
fn parse_top_apps(top_apps_json: &str) -> Vec<(String, i64)> {
    let arr: Vec<Value> = serde_json::from_str(top_apps_json).unwrap_or_default();
    arr.iter()
        .take(8)
        .filter_map(|v| {
            let app = v.get("app").and_then(|x| x.as_str())?.to_string();
            let ms = v
                .get("duration_ms")
                .and_then(|x| x.as_i64())
                .or_else(|| v.get("duration_ms").and_then(|x| x.as_f64().map(|f| f as i64)))?;
            Some((app, ms))
        })
        .collect()
}

/// 生成应用时长水平柱状图 SVG（纯 SVG，无 JS）。
fn build_app_bar_svg(apps: &[(String, i64)]) -> String {
    if apps.is_empty() {
        return String::new();
    }
    let max_ms = apps.iter().map(|(_, ms)| *ms).max().unwrap_or(1).max(1);
    let row_h = 30i32;
    let label_w = 140i32;
    let bar_area = 440i32;
    let total_w = label_w + bar_area + 80;
    let total_h = row_h * apps.len() as i32 + 20;

    let mut svg = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{total_w}" height="{total_h}" role="img" aria-label="应用时长图表">"#
    );
    svg.push_str(r#"<style>text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}</style>"#);

    for (i, (app, ms)) in apps.iter().enumerate() {
        let y = i as i32 * row_h + 10;
        let bar_w = ((ms * bar_area as i64) / max_ms).max(2) as i32;
        let hours = ms / 3_600_000;
        let mins = (ms % 3_600_000) / 60_000;
        let label = if hours > 0 {
            format!("{hours}h {mins}m")
        } else {
            format!("{mins}m")
        };
        // 截断应用名
        let display_app: String = if app.chars().count() > 18 {
            format!("{}…", app.chars().take(17).collect::<String>())
        } else {
            app.clone()
        };
        svg.push_str(&format!(
            r#"<text x="{}" y="{}" text-anchor="end" fill="currentColor" font-size="12" dominant-baseline="middle">{display_app}</text>"#,
            label_w - 8,
            y + row_h / 2
        ));
        svg.push_str(&format!(
            "<rect x=\"{label_w}\" y=\"{}\" width=\"{bar_w}\" height=\"18\" rx=\"3\" fill=\"#4f8ef7\" opacity=\"0.85\"/>",
            y + 6
        ));
        svg.push_str(&format!(
            r#"<text x="{}" y="{}" fill="currentColor" font-size="11" dominant-baseline="middle" opacity="0.7">{label}</text>"#,
            label_w + bar_w + 6,
            y + row_h / 2
        ));
    }
    svg.push_str("</svg>");
    svg
}

/// 将 Markdown 内容和 top_apps JSON 渲染为自包含单文件 HTML。
pub fn render_html(
    content_md: &str,
    top_apps_json: &str,
    date: &str,
    app_version: &str,
    generated_at: &str,
) -> String {
    // Markdown → HTML
    let mut opts = Options::empty();
    opts.insert(Options::ENABLE_TABLES);
    opts.insert(Options::ENABLE_STRIKETHROUGH);
    let parser = Parser::new_ext(content_md, opts);
    let mut body_html = String::new();
    cm_push_html(&mut body_html, parser);

    // SVG 图表
    let apps = parse_top_apps(top_apps_json);
    let chart_svg = build_app_bar_svg(&apps);
    let chart_section = if chart_svg.is_empty() {
        String::new()
    } else {
        format!(
            r#"<figure style="margin-top:32px"><h2 style="border-bottom:none;margin-top:0">应用时长一览</h2>{chart_svg}<figcaption>按前台停留时长降序排列</figcaption></figure>"#
        )
    };

    format!(
        r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TimeLens 日报 · {date}</title>
<style>{CSS}</style>
</head>
<body>
{body_html}
{chart_section}
<footer>由 TimeLens {app_version} 生成 · {generated_at} · 本文件可在浏览器离线打开</footer>
</body>
</html>"#
    )
}
