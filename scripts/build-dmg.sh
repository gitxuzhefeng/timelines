#!/bin/bash

# TimeLens DMG 打包脚本
# 用于将 Tauri 构建的应用打包成 macOS DMG 安装包

set -e

if ! command -v jq &>/dev/null; then
    echo "❌ 需要 jq（brew install jq）以读取 tauri.conf.json 中的版本与产品名"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT_DIR="${REPO_ROOT}/project"
cd "${PROJECT_DIR}"

echo "🚀 开始打包 TimeLens DMG..."

# 版本与产品名与 tauri.conf.json 保持一致（单一来源）
TAURI_CONF="${PROJECT_DIR}/src-tauri/tauri.conf.json"
if [[ ! -f "${TAURI_CONF}" ]]; then
    echo "❌ 找不到 ${TAURI_CONF}"
    exit 1
fi
APP_NAME="$(jq -r .productName "${TAURI_CONF}")"
VERSION="$(jq -r .version "${TAURI_CONF}")"
DMG_NAME="${APP_NAME}-v${VERSION}"
BUILD_DIR="src-tauri/target/release/bundle/macos"
TAURI_DMG_DIR="src-tauri/target/release/bundle/dmg"
DIST_DIR="dist"

# Tauri 2 会在 bundle/dmg/ 下直接产出 DMG，且可能在收尾时清理 macos/*.app —— 优先复用该 DMG。
shopt -s nullglob
TAURI_DMGS=( "${TAURI_DMG_DIR}/${APP_NAME}_${VERSION}"_*.dmg )
shopt -u nullglob

if [[ ${#TAURI_DMGS[@]} -gt 0 ]]; then
    mkdir -p "${DIST_DIR}"
    SRC_DMG=""
    for f in "${TAURI_DMGS[@]}"; do
        if [[ "$f" == *"_aarch64.dmg" ]]; then
            SRC_DMG="$f"
            break
        fi
    done
    [[ -z "$SRC_DMG" ]] && SRC_DMG="${TAURI_DMGS[0]}"
    echo "📦 使用 Tauri 已生成的 DMG: $(basename "$SRC_DMG")"
    cp -f "$SRC_DMG" "${DIST_DIR}/${DMG_NAME}.dmg"
    echo "✅ 已复制到 dist（统一命名: ${DMG_NAME}.dmg）"
    ls -lh "${DIST_DIR}/${DMG_NAME}.dmg"
    exit 0
fi

# 检查构建产物（旧流程：仅有 .app 时再自行打 DMG）
if [ ! -d "${BUILD_DIR}/${APP_NAME}.app" ]; then
    echo "❌ 错误: 找不到应用构建产物，且 bundle/dmg 下也无 ${APP_NAME}_${VERSION}_*.dmg"
    echo "请先在 project/ 下运行: npm run tauri build（或仓库根目录: npm run tauri build）"
    exit 1
fi

# 创建分发目录
mkdir -p "${DIST_DIR}"

echo "📦 创建 DMG 安装包..."

# 使用 create-dmg 或 hdiutil 创建 DMG
if command -v create-dmg &> /dev/null; then
    # 方式一: 使用 create-dmg (推荐)
    create-dmg \
        --volname "${APP_NAME}" \
        --window-pos 200 120 \
        --window-size 800 400 \
        --icon-size 100 \
        --icon "${APP_NAME}.app" 200 190 \
        --hide-extension "${APP_NAME}.app" \
        --app-drop-link 600 185 \
        "${DIST_DIR}/${DMG_NAME}.dmg" \
        "${BUILD_DIR}/${APP_NAME}.app"
else
    # 方式二: 使用 hdiutil (系统自带)
    echo "使用 hdiutil 创建 DMG..."

    # 创建临时目录
    TMP_DIR=$(mktemp -d)

    # 复制应用到临时目录
    cp -R "${BUILD_DIR}/${APP_NAME}.app" "${TMP_DIR}/"

    # 创建 Applications 快捷方式
    ln -s /Applications "${TMP_DIR}/Applications"

    # 创建 DMG
    hdiutil create -volname "${APP_NAME}" \
        -srcfolder "${TMP_DIR}" \
        -ov -format UDZO \
        "${DIST_DIR}/${DMG_NAME}.dmg"

    # 清理临时目录
    rm -rf "${TMP_DIR}"
fi

echo "✅ DMG 打包完成!"
echo "📍 输出位置: ${DIST_DIR}/${DMG_NAME}.dmg"

# 显示文件信息
ls -lh "${DIST_DIR}/${DMG_NAME}.dmg"
