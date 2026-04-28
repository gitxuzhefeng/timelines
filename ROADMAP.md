# TimeLens Roadmap

## Current Goal

**Goal window**: 2026-04-27 to 2026-05-30  
**North star**: Reach **100+ GitHub stars** for `gitxuzhefeng/timelines`.  
**Baseline**: 11 stars on 2026-04-27.  
**Focus**: Improve GitHub conversion, collect real macOS / Windows feedback, and reduce first-use friction.

See `PROJECT_GOALS.md` and `prd/PRD_十八期_GitHub_Star增长推广与营销方案.md` for the full growth plan.

## Product Direction

TimeLens is a local-first desktop time awareness tool for macOS and Windows. The product direction is:

- Passive tracking, no manual check-ins.
- Local-first data storage, no default cloud upload.
- Reviewable timelines, daily reports, weekly reports, and OCR search.
- Optional AI analysis with user-provided API keys.
- Clear macOS and Windows installation paths.
- Useful feedback loops for developers, writers, remote workers, and privacy-conscious users.

## Now: Launch and Feedback Loop

**Target period**: 2026-04-27 to 2026-05-30

### GitHub Conversion

- [x] Split Chinese and English README files.
- [x] Add launch screenshots and demo assets.
- [x] Publish macOS and Windows Release assets.
- [x] Add Issue templates for installation, bugs, feature requests, and user feedback.
- [x] Create a central feedback thread: [#7](https://github.com/gitxuzhefeng/timelines/issues/7).
- [x] Add `FAQ.md`, `CONTRIBUTING.md`, and `ROADMAP.md`.
- [ ] Add a GitHub social preview image.
- [ ] Add `SECURITY.md` with local-first and privacy expectations.
- [ ] Add `CHANGELOG.md` or release history summary.

### Domestic Launch

- [x] Publish GitHub README and Release.
- [x] Publish WeChat group seed message.
- [x] Publish Juejin technical retrospective.
- [x] Publish Xiaohongshu first post.
- [ ] Publish Jike / Moments follow-up.
- [ ] Prepare and publish Shaoshupai article.
- [ ] Publish Xiaohongshu second story post after 2-3 days.
- [ ] Keep V2EX ready until an invitation code is available.

### Feedback Operations

- [ ] Record GitHub stars daily.
- [ ] Record Release downloads after each channel push.
- [ ] Triage new issues within 24 hours during launch.
- [ ] Add repeated questions to `FAQ.md`.
- [ ] Convert high-signal feedback into roadmap items.

## Next: First-Use Reliability

These items are prioritized if launch feedback shows installation or onboarding friction.

- [ ] Improve macOS first-launch guidance around quarantine attributes.
- [ ] Improve Windows installer and portable build instructions.
- [ ] Add a first-run checklist or onboarding screen.
- [ ] Make AI setup clearer for users who bring their own API key.
- [ ] Add screenshots or short GIFs for common workflows.

## Next: Product Experience

These items improve the core review loop.

- [ ] Improve Today Lens as the default “what happened today” entry point.
- [ ] Make timeline drill-down easier for long days.
- [ ] Improve daily and weekly report explanations for non-technical users.
- [ ] Make OCR search results easier to preview and navigate.
- [ ] Refine work loop visualization based on real user feedback.

## Later: Community and Ecosystem

These items become more valuable after the first launch feedback loop is stable.

- [ ] Add good first issues for documentation, screenshots, and platform testing.
- [ ] Publish architecture notes for Tauri + Rust + SQLite implementation.
- [ ] Add contributor setup guide for macOS and Windows.
- [ ] Explore optional export workflows for Obsidian or Markdown-based review.
- [ ] Prepare overseas launch assets for Product Hunt, X, Reddit, and Hacker News.

## Out of Scope for the Current Goal

To keep the 100-star launch focused, these are not current priorities:

- Cloud sync.
- Account system.
- Team dashboards.
- Default external telemetry.
- Mobile apps.
- Paid plans or billing.

## How to Influence the Roadmap

Please open an issue or comment in the feedback thread:

- Feedback thread: [#7 TimeLens 使用反馈收集 / User Feedback Thread](https://github.com/gitxuzhefeng/timelines/issues/7)
- Installation help: [new installation issue](https://github.com/gitxuzhefeng/timelines/issues/new?template=installation_help.yml)
- Feature request: [new feature request](https://github.com/gitxuzhefeng/timelines/issues/new?template=feature_request.yml)

High-priority feedback is specific, reproducible, and tied to a real workflow.
