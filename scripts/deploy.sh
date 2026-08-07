#!/bin/bash
# ============================================
# lankHub WSL 本地构建 + 部署到服务器
# 在 WSL 中运行：bash scripts/deploy.sh
# ============================================
set -e

# === 配置：修改为你的服务器信息 ===
SERVER="root@你的服务器IP"
REMOTE_DIR="/root/lankhub"

echo "📦 拉取最新代码..."
git pull

echo "📦 安装依赖..."
npm ci --prefer-offline

echo "🔨 构建项目..."
npm run build

echo "📤 同步到服务器..."
rsync -avz --delete \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '.git' \
  --exclude 'dev.db' \
  --exclude 'dev.db.bak.*' \
  --exclude 'data/uploads/' \
  --exclude 'node_modules/.cache' \
  .next/ node_modules/ prisma/ public/ package.json package-lock.json \
  "${SERVER}:${REMOTE_DIR}/"

echo "🔧 服务器重启..."
ssh "${SERVER}" "cd ${REMOTE_DIR} && npx prisma generate && pm2 restart next-app"

echo "✅ 部署完成！"
