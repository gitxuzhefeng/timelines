# Contributing to TimeLens

Thanks for helping improve TimeLens. You can contribute by reporting bugs, sharing feedback, suggesting features, improving docs, or submitting code.

感谢你帮助改进 TimeLens。你可以通过反馈 Bug、分享使用体验、提出功能建议、完善文档或提交代码来参与。

## Project Goal

The current project goal is to reach **100+ GitHub stars by 2026-05-30** while collecting real feedback from macOS and Windows users.

当前项目目标是在 **2026-05-30 前达到 100+ GitHub stars**，并收集 macOS 与 Windows 用户的真实反馈。

See `PROJECT_GOALS.md` and `ROADMAP.md` for details.

## Feedback and Issues

Please use the GitHub issue templates:

- **Installation help / 安装问题**：TimeLens cannot be installed, opened, or launched.
- **Bug report / 缺陷反馈**：Something behaves incorrectly or crashes.
- **Feature request / 功能建议**：You want TimeLens to support a new workflow.
- **User feedback / 使用反馈**：Share first-use experience, workflow, or general feedback.

Before posting screenshots, logs, or OCR content, remove private data such as window titles, API keys, personal files, and sensitive screen content.

General feedback thread:

- [TimeLens 使用反馈收集 / User Feedback Thread](https://github.com/gitxuzhefeng/timelines/issues/7)

## Good Issue Reports

A useful issue usually includes:

- TimeLens version.
- Platform and OS version.
- Package type: macOS `.dmg`, Windows installer, Windows portable, or Actions artifact.
- What you expected.
- What actually happened.
- Steps to reproduce.
- Screenshots or logs, if relevant.

For installation issues, please include:

- Whether you downloaded the macOS `.dmg`, Windows installer, Windows portable build, or GitHub Actions artifact.
- The exact error message.
- Whether the macOS quarantine command has been tried, if relevant.

## Local Development

Prerequisites:

- Node.js
- Rust toolchain
- Tauri system dependencies

Run from the project directory:

```bash
cd project
npm install
npm run tauri dev
```

Useful commands:

```bash
npm run build
npm run test
npm run verify
```

From the repository root, the scripts delegate to `project/`:

```bash
npm run dev
npm run build
npm run test
```

## Pull Requests

For code changes:

1. Keep changes focused.
2. Follow the existing React, Rust, and Tauri patterns.
3. Add or update tests when changing behavior.
4. Keep UI text bilingual: Chinese (`zh-CN`) and English (`en`).
5. Do not introduce external network calls unless they are part of the optional AI feature.

For documentation changes:

1. Keep the default README focused on Chinese readers.
2. Keep `README.en.md` aligned for English readers.
3. Update `FAQ.md` if a repeated user question appears in issues or launch comments.
4. Avoid screenshots or examples that expose private window titles or personal data.

## Privacy

TimeLens is local-first. Please keep privacy expectations intact:

- Do not upload user activity data by default.
- Do not collect keyboard input.
- Do not collect clipboard content.
- Be careful when adding logs that could include window titles, screenshot text, or API keys.

## Maintainer Workflow

For maintainers triaging issues:

1. Apply `needs-triage` to new reports until reviewed.
2. Add platform labels: `macOS`, `Windows`, or both.
3. Add topic labels: `installation`, `bug`, `enhancement`, `feedback`, `privacy`, or `documentation`.
4. If a question appears more than twice, add it to `FAQ.md`.
5. If feedback changes product priority, reflect it in `ROADMAP.md`.
