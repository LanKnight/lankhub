#!/usr/bin/env bash
# ============================================
# lankHub 服务器初始化脚本
# 用法：bash scripts/setup.sh
# ============================================
set -e

echo "==========================================="
echo "  lankHub 服务器部署初始化"
echo "==========================================="
echo ""

# 1. 检查 Node.js
if ! command -v node &> /dev/null; then
  echo "❌ 未找到 Node.js，请先安装 Node.js 18+"
  exit 1
fi
echo "✅ Node.js $(node -v)"

# 2. 检查 .env 文件
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    echo ""
    echo "⚠️  未找到 .env 文件！"
    echo "   正在从 .env.example 复制..."
    cp .env.example .env
    echo "✅ 已创建 .env 文件，请编辑并填入你的配置："
    echo "   - DATABASE_URL: SQLite 数据库路径"
    echo "   - AUTH_SECRET: 随机密钥 (openssl rand -base64 32)"
    echo "   - NEXTAUTH_URL: 你的域名 (如 https://lankhub.com)"
    echo "   - NEXT_PUBLIC_SITE_URL: 公开网站 URL"
    echo ""
    echo "   编辑完成后重新运行此脚本。"
    exit 0
  else
    echo "❌ 未找到 .env 或 .env.example 文件"
    exit 1
  fi
fi
echo "✅ .env 文件已存在"

# 3. 安装依赖
echo ""
echo "📦 安装依赖..."
npm install
echo "✅ 依赖安装完成"

# 4. 生成 Prisma 客户端 + 初始化数据库
echo ""
echo "🗄️  初始化数据库..."
npm run setup
echo "✅ 数据库初始化完成"

# 5. 构建生产版本
echo ""
echo "🔨 构建生产版本..."
npm run build
echo "✅ 构建完成"

# 6. 完成
echo ""
echo "==========================================="
echo "  ✅ 部署准备完成！"
echo "==========================================="
echo ""
echo "启动生产服务："
echo "  npm start"
echo ""
echo "或使用 PM2 常驻后台："
echo "  pm2 start npm --name lankhub -- start"
echo ""
echo "首次访问前，确保："
echo "  1. 防火墙已开放端口 (如 3000)"
echo "  2. 如需绑定所有网卡：npm start -- -H 0.0.0.0"
echo ""
