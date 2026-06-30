# lankHub — 个人博客

基于 Next.js 16 全栈框架的个人博客，黑白水墨极简风格，支持文章管理、合集分类、评论互动、在线简历编辑。

## 功能特性

- **文章管理** — TipTap 富文本编辑器，支持草稿/发布、文章合集分类
- **合集系统** — 创建主题合集，将文章归类展示
- **评论互动** — 支持嵌套回复，登录后即可评论
- **在线简历** — 后台可视化编辑简历，实时生效
- **黑白水墨风格** — 思源宋体 + 宣纸色调，极简中国风
- **管理后台** — 仪表盘、文章/合集/评论/简历管理

## 技术栈

- **框架**: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4
- **数据库**: SQLite + Prisma 7 + better-sqlite3
- **认证**: Auth.js v5 (Credentials Provider, JWT session)
- **编辑器**: TipTap 3 (React)
- **字体**: Noto Serif SC（思源宋体）+ Geist
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

## 使用指南

### 前台页面

| 页面 | 路径 | 说明 |
|------|------|------|
| 首页 | `/` | 个人介绍、格言、兴趣爱好 |
| 博客列表 | `/blog` | 所有已发布文章 |
| 文章详情 | `/blog/[slug]` | 文章内容 + 评论区 |
| 合集列表 | `/blog/collections` | 按主题浏览文章合集 |
| 合集详情 | `/blog/collections/[slug]` | 合集内文章列表 |
| 简历 | `/resume` | 在线简历展示 |

### 管理后台

访问 `/admin`，使用管理员账号登录后可使用：

| 功能 | 路径 | 说明 |
|------|------|------|
| 仪表盘 | `/admin` | 文章/评论/浏览量统计 |
| 文章管理 | `/admin/articles` | 新建、编辑、删除文章，分配合集 |
| 合集管理 | `/admin/collections` | 新建、编辑、删除合集 |
| 评论管理 | `/admin/comments` | 查看、删除评论 |
| 简历编辑 | `/admin/resume` | 可视化编辑简历所有内容 |

### 简历编辑

登录后台后进入 `/admin/resume`，可编辑所有简历模块：
- 基本信息（姓名、职位、联系方式）
- 个人资料（出生日期、籍贯、学历）
- 专业技能（名称 + 熟练度百分比，可增删）
- 教育经历、校园经历、项目经历、实践经历
- 证书、获奖荣誉
- 求职意向

保存后在前台 `/resume` 页面实时生效。

## 生产部署

### 一键初始化（服务器首次部署）

```bash
bash scripts/setup.sh
```

脚本会自动：检查 `.env` → 安装依赖 → 初始化数据库 → 构建生产版本。

### 手动部署

```bash
npm install              # 安装依赖 + 自动生成 Prisma 客户端
npm run setup            # 初始化数据库 + 种子数据
npm run build            # 生产构建
npm start -- -H 0.0.0.0  # 启动服务（监听所有网卡）
```

### 更新部署

```bash
git pull                    # 拉取最新代码
npm install                 # 安装可能的新依赖
npm run db:generate         # 重新生成 Prisma 客户端
npm run db:push             # 同步数据库结构变更
npm run build               # 重新构建
pm2 restart lankhub         # 重启服务
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
│   │   ├── admin/        # 管理后台（文章/合集/评论/简历）
│   │   ├── api/          # API 路由
│   │   ├── auth/         # 登录/注册页面
│   │   ├── blog/         # 博客 + 合集页面
│   │   └── resume/       # 简历页面
│   ├── components/       # React 组件
│   │   ├── auth/         # 登录/注册表单
│   │   ├── blog/         # 文章卡片、分页、内容渲染
│   │   ├── comment/      # 评论组件
│   │   ├── editor/       # TipTap 富文本编辑器
│   │   ├── home/         # 首页栏目组件
│   │   ├── layout/       # Navbar、Footer、AdminSidebar
│   │   └── resume/       # 简历展示组件
│   ├── lib/              # 工具库（auth, prisma, utils, resume）
│   └── generated/        # Prisma 生成的客户端
└── public/               # 静态资源
```

## License

MIT
