//! 二期 M1–M3：日聚合与日终 Markdown 报告（事实层）；AI 增强叙事（二期 AI）。

pub mod ai_client;
pub mod assistant;
pub mod daily;
pub mod report;
pub mod weekly;
pub mod weekly_report;

#[cfg(test)]
mod iter_section_four_spec;

pub use daily::generate_daily_analysis_into;
pub use report::build_fact_only_markdown;
