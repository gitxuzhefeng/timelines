/// 在现有 Markdown 内容前置 YAML frontmatter，生成 Obsidian/Notion 可用的文档。
pub fn add_daily_frontmatter(
    date: &str,
    content_md: &str,
    total_active_hours: f64,
    top_app: Option<&str>,
) -> String {
    let top_app_val = top_app.unwrap_or("—");
    let frontmatter = format!(
        "---\ndate: {date}\nsource: timelens\nversion: \"1.0\"\ntotal_active_hours: {total_active_hours:.1}\ntop_app: \"{top_app_val}\"\ntags: [timelens, daily-report]\n---\n\n"
    );
    format!("{frontmatter}{content_md}")
}

/// 在现有周报 Markdown 内容前置 YAML frontmatter。
pub fn add_weekly_frontmatter(
    week_start: &str,
    week_end: &str,
    content_md: &str,
    valid_days: i64,
    avg_flow_score: f64,
) -> String {
    let frontmatter = format!(
        "---\nweek_start: {week_start}\nweek_end: {week_end}\nsource: timelens\nversion: \"1.0\"\nvalid_days: {valid_days}\navg_flow_score: {avg_flow_score:.0}\ntags: [timelens, weekly-report]\n---\n\n"
    );
    format!("{frontmatter}{content_md}")
}
