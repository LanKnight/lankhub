# lankHub — 个人博客网站

基于 Next.js 16 全栈框架的个人博客，部署到 Linux 云服务器。

## 技术要点
- **框架**: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4
- **数据库**: SQLite + Prisma 7 (`@prisma/adapter-better-sqlite3`)
- **认证**: Auth.js v5 (Credentials Provider, JWT session)
- **编辑器**: TipTap 3 (React)
- **部署**: PM2 + Nginx + Let's Encrypt

## 关键文件
- `prisma/schema.prisma` — 数据库模型 (User, Article, Comment)
- `src/lib/auth.ts` — Auth.js 配置
- `src/lib/auth-helpers.ts` — getCurrentUser, requireOwner, requireAuth
- `src/middleware.ts` — 已删除，鉴权在 admin layout 和 API 层处理

## 命令
- `npm run dev` — 开发服务器 (localhost:3000)
- `npm run build` — 生产构建
- `npm run db:push` — 同步数据库 schema
- `npm run db:generate` — 重新生成 Prisma Client
- `npm run db:seed` — 种子管理员账号

## 管理员
- 邮箱: admin@lankhub.com
- 密码: admin123（通过 seed 脚本可修改）

## Prisma 7 注意事项
- PrismaClient 需要通过 adapter 初始化（`PrismaBetterSqlite3`）
- Schema 中不能写 `url`，连接 URL 在 `prisma.config.ts` 中配置
- 生成的客户端位于 `src/generated/prisma/`，导入路径 `@/generated/prisma/client`

## 目录结构
```
lank-hub/
├── prisma/          # Schema + Seed
├── src/
│   ├── app/         # 页面路由 + API
│   ├── components/  # React 组件 (layout/home/blog/comment/resume/auth/editor)
│   ├── lib/         # 工具库 (auth, prisma, helpers, utils)
│   └── generated/   # Prisma 生成的客户端
└── public/          # 静态资源
```
