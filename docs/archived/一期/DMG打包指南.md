# TimeLens DMG 打包指南

## 版本号与产物命名

- **唯一来源**：`project/src-tauri/tauri.conf.json` 中的 `version` 与 `productName`。
- **DMG 文件名**：`project/dist/<productName>-v<version>.dmg`（例如 `TimeLens-v0.1.0.dmg`）。
- `scripts/build-dmg.sh` 会按上述配置自动生成文件名，无需手改脚本里的版本。

---

## 推荐：一键发布（测试 → 构建 → DMG → 验收 → tag → GitHub Release）

在仓库根目录执行（详见 `scripts/release.sh` 头部注释）：

```bash
npm install --prefix project   # 首次或依赖变更后
npm run release                # 等价于 bash scripts/release.sh
```

可选：`./scripts/release.sh 0.2.0` 先将三处版本统一为 `0.2.0` 再跑全流程；`--dry-run` 仅预览步骤；`--skip-gh` 不创建 GitHub Release。

**依赖**：`jq`（`brew install jq`）；发布到 GitHub 还需 [GitHub CLI](https://cli.github.com/) `gh` 并已登录。手动验收步骤见 [`M9_验收与测试.md`](M9_验收与测试.md) 第二节。

---

## 仅打 DMG（已有 Release 构建产物时）

### 前置准备

```bash
brew install create-dmg   # 推荐；未安装时脚本会用系统自带 hdiutil
brew install jq           # build-dmg 读取 tauri 配置所需
```

### 构建应用（若尚未构建）

```bash
cd project && npm install
npm run tauri build
# 或在仓库根目录：npm run tauri --prefix project -- build
```

### 执行打包脚本

```bash
# 仓库根目录
./scripts/build-dmg.sh
```

---

## 手动打包（不通过脚本）

```bash
mkdir -p project/dist
VERSION=$(jq -r .version project/src-tauri/tauri.conf.json)
NAME=$(jq -r .productName project/src-tauri/tauri.conf.json)
create-dmg \
  --volname "$NAME" \
  --window-pos 200 120 \
  --window-size 800 400 \
  --icon-size 100 \
  --icon "${NAME}.app" 200 190 \
  --app-drop-link 600 185 \
  "project/dist/${NAME}-v${VERSION}.dmg" \
  "project/src-tauri/target/release/bundle/macos/${NAME}.app"
```

---

## 输出与 DMG 内容

- 输出目录：`project/dist/`。
- DMG 内一般为：`TimeLens.app`（名称以 `productName` 为准）与指向 `/Applications` 的快捷方式。

## 安装自测

```bash
open "project/dist/$(jq -r .productName project/src-tauri/tauri.conf.json)-v$(jq -r .version project/src-tauri/tauri.conf.json).dmg"
# 拖入「应用程序」，或：
# cp -R "/Volumes/<卷名>/<Name>.app" /Applications/
```

---

## 签名与公证（可选）

公开分发建议在 **Developer ID** 下签名并对 DMG **公证**；当前 `scripts/release.sh` **不包含**签名步骤，需自行在构建产物上执行。示例命令见 Apple 文档；卷名/文件名请替换为实际 `productName` 与版本。

---

## 故障排查

| 现象 | 处理 |
|------|------|
| 找不到 `.app` | 先执行 `npm run tauri build`（根目录或 `project/`） |
| `create-dmg` 不存在 | `brew install create-dmg`（或依赖脚本的 `hdiutil` 分支） |
| `jq` 报错 | `brew install jq` |
| 脚本无法执行 | `chmod +x scripts/build-dmg.sh scripts/release.sh` |
