#!/usr/bin/env bash
# scripts/setup-macos-signing.sh
#
# 在本机生成一张自签名开发者证书，用于 TimeLens 代码签名。
# 签名后 macOS TCC 权限绑定到证书哈希，而非二进制哈希，
# 因此每次更新/重装后权限不再丢失。
#
# 使用方法：
#   bash scripts/setup-macos-signing.sh
#
# 执行后会：
#   1. 在 Keychain 中创建名为 "TimeLens Developer" 的自签名证书
#   2. 输出 GitHub Actions 所需的 Secrets 配置说明

set -euo pipefail

CERT_NAME="TimeLens Developer"
KEYCHAIN="login"

echo "=== TimeLens macOS 代码签名证书生成工具 ==="
echo ""

# 检查证书是否已存在
if security find-certificate -c "$CERT_NAME" 2>/dev/null | grep -q "alis"; then
  echo "✓ 证书 \"$CERT_NAME\" 已存在，跳过创建。"
  echo ""
  echo "如需重新生成，请先在 Keychain Access 中删除该证书，再重新运行此脚本。"
else
  echo "→ 正在创建自签名证书 \"$CERT_NAME\"..."

  # 生成私钥 + 自签名证书（有效期 3650 天 ≈ 10 年）
  TMPDIR_CERT=$(mktemp -d)
  trap 'rm -rf "$TMPDIR_CERT"' EXIT

  # 生成 RSA 私钥
  openssl genrsa -out "$TMPDIR_CERT/key.pem" 2048 2>/dev/null

  # 生成自签名证书
  openssl req -new -x509 -key "$TMPDIR_CERT/key.pem" \
    -out "$TMPDIR_CERT/cert.pem" \
    -days 3650 \
    -subj "/CN=$CERT_NAME/O=TimeLens/C=CN" 2>/dev/null

  # 打包为 p12（无密码）
  openssl pkcs12 -export \
    -inkey "$TMPDIR_CERT/key.pem" \
    -in "$TMPDIR_CERT/cert.pem" \
    -out "$TMPDIR_CERT/cert.p12" \
    -passout pass: 2>/dev/null

  # 导入到 login keychain
  security import "$TMPDIR_CERT/cert.p12" \
    -k ~/Library/Keychains/login.keychain-db \
    -P "" \
    -T /usr/bin/codesign \
    -T /usr/bin/security 2>/dev/null || true

  # 设置信任策略（允许 codesign 使用）
  security set-key-partition-list \
    -S apple-tool:,apple:,codesign: \
    -s -k "" \
    ~/Library/Keychains/login.keychain-db 2>/dev/null || true

  echo "✓ 证书已创建并导入 Keychain。"
fi

echo ""
echo "=== 本地构建签名 ==="
echo ""
echo "在 project/src-tauri/tauri.conf.json 的 bundle.macOS 中，"
echo "将 signingIdentity 设置为："
echo ""
echo "  \"signingIdentity\": \"$CERT_NAME\""
echo ""
echo "然后运行 npm run tauri build 即可生成已签名的 .app 和 .dmg。"
echo ""
echo "=== GitHub Actions 签名（可选）==="
echo ""
echo "如需在 CI 中也使用签名，请执行以下步骤："
echo ""
echo "1. 导出证书为 base64："
echo "   security export -k ~/Library/Keychains/login.keychain-db \\"
echo "     -t identities -f pkcs12 -P 'your_password' | base64 | pbcopy"
echo ""
echo "2. 在 GitHub 仓库 Settings → Secrets 中添加："
echo "   APPLE_CERTIFICATE        = (上一步复制的 base64 内容)"
echo "   APPLE_CERTIFICATE_PASSWORD = your_password"
echo "   APPLE_SIGNING_IDENTITY   = $CERT_NAME"
echo ""
echo "完成后，GitHub Actions 构建的 .dmg 也会使用相同证书签名，"
echo "用户安装后权限不会因更新而丢失。"
