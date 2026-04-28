# TimeLens FAQ

## 基础问题

### TimeLens 是什么？

TimeLens 是一个本地优先的桌面时间感知工具，支持 macOS 和 Windows。它会在后台自动记录应用、窗口标题、使用时长和关键截图，并把这些信息整理成时间线、日报、周报、OCR 搜索和 AI 复盘。

### 它和普通时间管理工具有什么区别？

TimeLens 不要求你手动打卡，也不默认把数据上传到云端。它更像一个“电脑使用行为的本地黑匣子”，帮助你事后看清时间流向、工作上下文和打断来源。

### 支持哪些平台？

- macOS
- Windows 安装版
- Windows 便携版

最新下载地址：[Releases](https://github.com/gitxuzhefeng/timelines/releases/latest)

## 安装问题

### macOS 提示 “TimeLens.app is damaged and can't be opened” 怎么办？

这通常是 macOS 的隔离属性导致，并不代表文件真的损坏。请在终端执行：

```bash
xattr -rd com.apple.quarantine "/Applications/TimeLens.app"
```

然后重新打开 TimeLens。

### Windows 应该下载哪个文件？

如果你希望正常安装，请下载 Windows 安装版 `*-setup.exe`。如果你希望解压后直接运行，请下载 Windows 便携版 `TimeLens.exe`。

### 没有看到 Release 怎么办？

如果最新版本暂时没有 Release 资产，可以到 [GitHub Actions](https://github.com/gitxuzhefeng/timelines/actions) 下载最新构建产物。

## 隐私与数据

### 数据会上传到云端吗？

默认不会。TimeLens 是 local-first 工具，时间事件、会话、截图索引和分析结果都存储在本机 SQLite 数据库中。

### 会记录键盘输入或剪贴板吗？

不会。TimeLens 不记录键盘输入，也不记录剪贴板内容。

### 截图会不会泄露隐私？

截图保存在本机，用于帮助你还原工作上下文和做 OCR 搜索。提交 Issue、截图或日志前，请先移除包含隐私的窗口标题、截图、API Key、个人路径和敏感 OCR 内容。

## AI 功能

### AI 日报和周报必须联网吗？

AI 分析是可选功能。你可以配置自己的 API Key，让 TimeLens 基于本地数据生成日报或周报。没有配置 AI 时，核心时间线、记录和本地复盘能力仍可使用。

### 支持哪些 AI 服务？

TimeLens 采用 BYOK（Bring Your Own Key）模式，目标是支持 Claude、DeepSeek、Qwen 或 OpenAI 兼容接口。具体可用能力以当前版本设置页为准。

### 我的 API Key 会上传吗？

API Key 用于你主动配置的 AI 分析功能。反馈问题时请不要把 API Key 粘贴到 Issue、截图或日志里。

## 使用问题

### TimeLens 适合谁？

TimeLens 适合开发者、独立开发者、技术写作者、远程工作者、自由职业者，以及任何想认真复盘电脑时间使用方式的人。

### 它会不会很打扰？

TimeLens 的设计目标是低打扰。核心记录在后台完成，不要求你频繁手动操作。只有提醒、专注守护等功能会在特定场景下主动出现。

### 我应该先看哪个页面？

建议先看：

1. **今日透视**：快速知道今天整体状态。
2. **时间线**：查看具体工作过程。
3. **日报 / 周报**：做结构化复盘。
4. **OCR 搜索**：找回过去屏幕上出现过的内容。

## 反馈与支持

### 遇到问题应该去哪里反馈？

请优先使用 GitHub Issues：

- 安装问题：[Installation help](https://github.com/gitxuzhefeng/timelines/issues/new?template=installation_help.yml)
- 缺陷反馈：[Bug report](https://github.com/gitxuzhefeng/timelines/issues/new?template=bug_report.yml)
- 功能建议：[Feature request](https://github.com/gitxuzhefeng/timelines/issues/new?template=feature_request.yml)
- 使用反馈：[User feedback](https://github.com/gitxuzhefeng/timelines/issues/new?template=user_feedback.yml)

也可以在集中反馈帖留言：[#7 TimeLens 使用反馈收集 / User Feedback Thread](https://github.com/gitxuzhefeng/timelines/issues/7)

### 如何支持这个项目？

如果 TimeLens 帮你看清时间流向，欢迎给 GitHub 仓库一个 star，或者把它分享给对本地优先效率工具感兴趣的朋友。
