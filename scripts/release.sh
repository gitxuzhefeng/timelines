#!/usr/bin/env bash
# TimeLens 发布脚本（macOS）
#
# 以 project/src-tauri/tauri.conf.json 的 version 为唯一版本源；可选命令行参数覆盖并写回三处。
# 执行顺序：
#   1  统一版本（tauri.conf.json → package.json、Cargo.toml；可选传入新版本号）
#   2  npm run test
#   3  npm run tauri build
#   4  ./scripts/build-dmg.sh
#   5  暂停：提示完成 M9 手动验收后继续
#   6  代码签名与公证（本脚本不实现，跳过）
#   7  git tag v<version>
#   8  git push + gh release create（上传 DMG）
#
# 用法：
#   ./scripts/release.sh              # 以当前 tauri.conf.json 为准同步三处版本号后走全流程
#   ./scripts/release.sh 0.2.0      # 将版本设为 0.2.0 并写回三处后走全流程
#   ./scripts/release.sh --dry-run    # 仅打印将执行的步骤
#   ./scripts/release.sh --skip-gh    # 打 tag 并 push，不创建 GitHub Release
#   ./scripts/release.sh --no-version-commit  # 改版本号后不自动 git commit（若产生未提交变更会在打 tag 前失败）
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT_DIR="${REPO_ROOT}/project"
TAURI_CONF="${PROJECT_DIR}/src-tauri/tauri.conf.json"
PKG_JSON="${PROJECT_DIR}/package.json"
CARGO_TOML="${PROJECT_DIR}/src-tauri/Cargo.toml"

DRY_RUN=0
SKIP_GH=0
NO_VERSION_COMMIT=0
VERSION_ARG=""

usage() {
  sed -n '1,25p' "$0" | tail -n +2
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h | --help) usage ;;
    --dry-run) DRY_RUN=1; shift ;;
    --skip-gh) SKIP_GH=1; shift ;;
    --no-version-commit) NO_VERSION_COMMIT=1; shift ;;
    -*)
      echo "未知选项: $1（使用 --help）"
      exit 1
      ;;
    *)
      if [[ -n "${VERSION_ARG}" ]]; then
        echo "只能指定一个版本号参数"
        exit 1
      fi
      VERSION_ARG="$1"
      shift
      ;;
  esac
done

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] $*"
  else
    echo "▶ $*"
    eval "$@"
  fi
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "缺少命令: $1"
    exit 1
  }
}

require_cmd jq
require_cmd git

semver_re='^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'

read_tauri_version() {
  jq -r .version "$TAURI_CONF"
}

read_tauri_product_name() {
  jq -r .productName "$TAURI_CONF"
}

write_tauri_version() {
  local v="$1"
  local tmp
  tmp="$(mktemp)"
  jq --arg v "$v" '.version = $v' "$TAURI_CONF" >"$tmp"
  mv "$tmp" "$TAURI_CONF"
}

write_package_version() {
  local v="$1"
  local tmp
  tmp="$(mktemp)"
  jq --arg v "$v" '.version = $v' "$PKG_JSON" >"$tmp"
  mv "$tmp" "$PKG_JSON"
}

write_cargo_version() {
  local v="$1"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    sed -i '' "s/^version = \".*\"/version = \"${v}\"/" "$CARGO_TOML"
  else
    sed -i "s/^version = \".*\"/version = \"${v}\"/" "$CARGO_TOML"
  fi
}

sync_all_versions_to() {
  local v="$1"
  write_tauri_version "$v"
  write_package_version "$v"
  write_cargo_version "$v"
}

commit_version_files_if_needed() {
  local v="$1"
  if [[ "$NO_VERSION_COMMIT" -eq 1 ]]; then
    return 0
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] git add / commit 版本文件（如有变更）"
    return 0
  fi
  git -C "$REPO_ROOT" add project/package.json project/src-tauri/Cargo.toml project/src-tauri/tauri.conf.json
  if git -C "$REPO_ROOT" diff --cached --quiet; then
    return 0
  fi
  git -C "$REPO_ROOT" commit -m "chore(release): v${v}"
}

ensure_clean_for_tag() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi
  # 忽略未跟踪文件；已跟踪文件必须干净（避免误带半成品打 tag）
  if [[ -n "$(git -C "$REPO_ROOT" status --porcelain --untracked-files=no)" ]]; then
    echo "当前存在未提交的已跟踪变更，请先提交或贮藏后再打 tag："
    git -C "$REPO_ROOT" status --short --untracked-files=no
    exit 1
  fi
}

# --- Step 1: 统一版本 ---
echo ""
echo "━━ Step 1/8 统一版本（源：tauri.conf.json）━━"

if [[ -n "${VERSION_ARG}" ]]; then
  if [[ ! "${VERSION_ARG}" =~ $semver_re ]]; then
    echo "版本号格式无效，需为 semver，例如 0.2.0 或 1.0.0-beta.1"
    exit 1
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] 将版本设为 ${VERSION_ARG}（写回 tauri.conf / package.json / Cargo.toml）"
  else
    sync_all_versions_to "${VERSION_ARG}"
  fi
  VERSION="${VERSION_ARG}"
else
  VERSION="$(read_tauri_version)"
  if [[ ! "${VERSION}" =~ $semver_re ]]; then
    echo "tauri.conf.json 中 version 非法: ${VERSION}"
    exit 1
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] 当前版本 ${VERSION}，将同步 package.json / Cargo.toml（若不一致）"
  else
    cur_pkg="$(jq -r .version "$PKG_JSON")"
    cur_cargo="$(grep -E '^version = ' "$CARGO_TOML" | head -1 | sed 's/version = "\(.*\)"/\1/')"
    if [[ "${cur_pkg}" != "${VERSION}" ]] || [[ "${cur_cargo}" != "${VERSION}" ]]; then
      echo "同步 package.json / Cargo.toml → ${VERSION}"
      write_package_version "${VERSION}"
      write_cargo_version "${VERSION}"
    fi
  fi
fi

commit_version_files_if_needed "${VERSION}"

if [[ "$NO_VERSION_COMMIT" -eq 1 ]] && [[ "$DRY_RUN" -eq 0 ]]; then
  if [[ -n "$(git -C "$REPO_ROOT" status --porcelain project/package.json project/src-tauri/Cargo.toml project/src-tauri/tauri.conf.json 2>/dev/null)" ]]; then
    echo "已使用 --no-version-commit 且版本相关文件仍有未提交变更，请先手动提交后再运行。"
    git -C "$REPO_ROOT" status --short project/package.json project/src-tauri/Cargo.toml project/src-tauri/tauri.conf.json
    exit 1
  fi
fi

echo "发布版本: ${VERSION}"

# --- Step 2: test ---
echo ""
echo "━━ Step 2/8 自动化测试（npm run test）━━"
run "cd \"${REPO_ROOT}\" && npm run test"

# --- Step 3: tauri build ---
echo ""
echo "━━ Step 3/8 Tauri Release 构建（npm run tauri build）━━"
run "cd \"${REPO_ROOT}\" && npm run tauri build"

# --- Step 4: DMG ---
echo ""
echo "━━ Step 4/8 打 DMG（scripts/build-dmg.sh）━━"
run "\"${REPO_ROOT}/scripts/build-dmg.sh\""

APP_NAME="$(read_tauri_product_name)"
DMG_PATH="${PROJECT_DIR}/dist/${APP_NAME}-v${VERSION}.dmg"

# --- Step 5: manual M9 ---
echo ""
echo "━━ Step 5/8 手动验收（M9）━━"
echo "请按 docs/M9_验收与测试.md 第二节完成主路径 E2E；确认无阻塞问题。"
echo "DMG: ${DMG_PATH}"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] 跳过「按 Enter 继续」"
else
  if [[ ! -f "${DMG_PATH}" ]]; then
    echo "未找到 DMG: ${DMG_PATH}"
    exit 1
  fi
  read -r -p "手动验收完成后按 Enter 继续（打 tag / 推送 / Release）… " _
fi

# --- Step 6: signing skipped ---
echo ""
echo "━━ Step 6/8 代码签名与公证 ━━"
echo "（按约定跳过；公开分发前请自行完成 Developer ID + notarytool。）"

# --- Step 7: git tag ---
echo ""
echo "━━ Step 7/8 Git tag v${VERSION} ━━"
ensure_clean_for_tag
TAG="v${VERSION}"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] git tag -a ${TAG} -m \"TimeLens ${TAG}\""
else
  if git -C "$REPO_ROOT" rev-parse "${TAG}" >/dev/null 2>&1; then
    echo "标签已存在: ${TAG}，请先删除或使用新版本号。"
    exit 1
  fi
  git -C "$REPO_ROOT" tag -a "${TAG}" -m "TimeLens ${TAG}"
  echo "已创建标签: ${TAG}"
fi

# --- Step 8: push + GitHub Release ---
echo ""
echo "━━ Step 8/8 推送到 GitHub 并发布 Release ━━"
BRANCH="$(git -C "$REPO_ROOT" branch --show-current)"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] git push origin \"${BRANCH}\""
  echo "[dry-run] git push origin \"${TAG}\""
  if [[ "$SKIP_GH" -eq 0 ]]; then
    echo "[dry-run] gh release create \"${TAG}\" \"${DMG_PATH}\" --title \"TimeLens v${VERSION}\" --notes-file …"
  fi
else
  git -C "$REPO_ROOT" push origin "${BRANCH}"
  git -C "$REPO_ROOT" push origin "${TAG}"
  if [[ "$SKIP_GH" -eq 1 ]]; then
    echo "已跳过 GitHub Release（--skip-gh）。请稍后手动: gh release create ${TAG} ..."
  else
    require_cmd gh
    gh auth status >/dev/null 2>&1 || {
      echo "gh 未登录，请执行: gh auth login"
      exit 1
    }
    NOTES_FILE="$(mktemp)"
    cat >"$NOTES_FILE" <<EOF
## TimeLens v${VERSION}

- 构建平台: macOS（Tauri）
- 验收说明: 见仓库 \`docs/M9_验收与测试.md\`
- **未签名构建**：若 Gatekeeper 拦截，请在「系统设置 → 隐私与安全性」中允许运行。

### 安装

下载附件 \`${APP_NAME}-v${VERSION}.dmg\`，打开后拖入「应用程序」。
EOF
    gh release create "${TAG}" "${DMG_PATH}" \
      --title "TimeLens v${VERSION}" \
      --notes-file "${NOTES_FILE}"
    rm -f "${NOTES_FILE}"
    echo "GitHub Release 已创建: ${TAG}"
  fi
fi

echo ""
echo "✅ 发布流程结束。版本: ${VERSION}，标签: v${VERSION}"
