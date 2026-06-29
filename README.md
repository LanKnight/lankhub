# lankHub — 个人博客

基于 Next.js 16 全栈框架的个人博客，支持文章管理、评论、简历展示。

## 技术栈

- **框架**: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4
- **数据库**: SQLite + Prisma 7 + better-sqlite3
- **认证**: Auth.js v5 (Credentials Provider, JWT session)
- **编辑器**: TipTap 3 (React)
- **部署**: PM2 + Nginx + Let's Encrypt（自托管 Linux 服务器）

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/LanKnight/lankhub.git
cd lankhub

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的配置（密钥、域名等）

# 3. 安装依赖（会自动生成 Prisma 客户端）
npm install

# 4. 初始化数据库（建表 + 种子数据）
npm run setup

# 5. 启动开发服务器
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看效果。

## 生产部署

### 一键初始化（服务器首次部署）

```bash
bash scripts/setup.sh
```

脚本会自动：检查 `.env` → 安装依赖 → 初始化数据库 → 构建生产版本。

### 手动部署

```bash
npm install          # 安装依赖 + 自动生成 Prisma 客户端
npm run setup        # 初始化数据库 + 种子数据
npm run build        # 生产构建
npm start -- -H 0.0.0.0  # 启动服务（监听所有网卡）
```

### PM2 常驻后台

```bash
npm install -g pm2
pm2 start npm --name lankhub -- start
pm2 save
pm2 startup
```

## 可用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建（含 Prisma 生成） |
| `npm start` | 启动生产服务 |
| `npm run setup` | 一键初始化数据库（生成 + 推送 + 种子） |
| `npm run db:generate` | 重新生成 Prisma 客户端 |
| `npm run db:push` | 同步数据库 Schema |
| `npm run db:seed` | 运行种子脚本 |

## 环境变量

复制 `.env.example` 为 `.env`，填写以下变量：

| 变量 | 说明 | 示例 |
|------|------|------|
| `DATABASE_URL` | SQLite 数据库路径 | `file:./dev.db` |
| `AUTH_SECRET` | JWT 加密密钥 | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | 网站域名（Auth.js 用） | `https://lankhub.com` |
| `NEXT_PUBLIC_SITE_URL` | 公开网站 URL（sitemap/robots） | `https://lankhub.com` |

## 默认管理员

| 字段 | 值 |
|------|-----|
| 邮箱 | `admin@lankhub.com` |
| 密码 | `admin123` |

> ⚠️ 部署到服务器后请立即通过 `.env` 修改密钥，并在后台修改管理员密码。

## 目录结构

```
lankhub/
├── prisma/               # Schema + Seed
├── scripts/              # 部署脚本
├── src/
│   ├── app/              # 页面路由 + API
│   │   ├── admin/        # 管理后台
│   │   ├── api/          # API 路由
│   │   ├── auth/         # 登录/注册页面
│   │   ├── blog/         # 博客页面
│   │   └── resume/       # 简历页面
│   ├── components/       # React 组件
│   │   ├── blog/         # 博客相关组件
│   │   ├── comment/      # 评论组件
│   │   ├── editor/       # TipTap 编辑器
│   │   ├── home/         # 首页组件
│   │   ├── layout/       # 布局组件（Navbar, Footer 等）
│   │   └── resume/       # 简历组件
│   ├── lib/              # 工具库（auth, prisma, utils）
│   └── generated/        # Prisma 生成的客户端
└── public/               # 静态资源
```

## License

MIT
