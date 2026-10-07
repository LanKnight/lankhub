# lankHub — 个人博客

基于 Next.js 16 全栈框架的个人博客，黑白水墨极简风格，支持文章管理、合集分类、评论互动、在线简历编辑。

> ⚠️ 使用与部署前请先读 [免责声明](#免责声明) 与 [License](#license)。
> 本项目的音乐试听功能涉及第三方版权内容，**部署者需自行承担合规责任**。

## 功能特性

- **文章管理** — TipTap 富文本编辑器，支持草稿/发布、文章合集分类
- **代码块** — 37 种语言语法高亮 + 一键复制，正文在服务端渲染（不向前台下发编辑器/高亮库）
- **合集系统** — 创建主题合集，将文章归类展示
- **评论互动** — 支持嵌套回复，登录后即可评论
- **在线简历** — 后台可视化编辑简历，实时生效
- **清弦歌单** — 按歌手分组的卡片墙，**可在线试听**（底部播放条 + 歌词滚动），
  后台支持搜索绑定与批量自动匹配（见 [在线音乐](#在线音乐清弦)）
- **黑白水墨风格** — 思源宋体 + 宣纸色调，极简中国风
- **管理后台** — 仪表盘、文章/合集/评论/简历/相册/诗词/歌单管理

## 技术栈

- **框架**: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4
- **数据库**: SQLite + Prisma 7 + better-sqlite3
- **认证**: Auth.js v5 (Credentials Provider, JWT session)
- **编辑器**: TipTap 3 (React)
- **字体**: Noto Serif SC（思源宋体）+ Geist
- **音乐试听**: 第三方接口 GD音乐台（仅服务端代理 JSON，音频直连 CDN，见下节）
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
| 完整版简历 | `/resume/print` | 单栏 A4 打印视图，供「另存为 PDF」 |
| 账号设置 | `/settings` | 登录用户改自己的昵称、密码，以及**退出登录**（全站唯一的退出入口） |
| 拾章 | `/poems` | 诗词收藏 |
| 清弦 | `/music` | 我喜欢的歌，按歌手分组；特别推荐会在组内置顶，支持在线试听 |
| 清弦免责声明 | `/music/disclaimer` | 音乐功能的完整免责声明与侵权联系方式 |
| 生活相册 | `/photos/[category]` | 按分类浏览照片（5 个分类，入口在首页「兴趣爱好」） |

### 管理后台

访问 `/admin`，使用管理员账号登录后可使用：

| 功能 | 路径 | 说明 |
|------|------|------|
| 仪表盘 | `/admin` | 文章/评论/浏览量统计 |
| 文章管理 | `/admin/articles` | 新建、编辑、删除文章，分配合集 |
| 合集管理 | `/admin/collections` | 新建、编辑、删除合集 |
| 相册管理 | `/admin/photos` | 上传、编辑、删除照片 |
| 拾章管理 | `/admin/poems` | 诗词的增删改 |
| 歌单管理 | `/admin/music` | 歌单增删改；批量粘贴导入；在线播放的搜索绑定与自动匹配（仅站长） |
| 评论管理 | `/admin/comments` | 查看、删除评论 |
| 简历编辑 | `/admin/resume` | 可视化编辑简历所有内容 |
| 账号管理 | `/admin/users` | 授予 / 收回读者的内容权限 |

### 简历编辑

登录后台后进入 `/admin/resume`，可编辑所有简历模块：
- 基本信息（姓名、职位、联系方式）
- 个人资料（出生日期、籍贯、学历）
- 专业技能（名称 + 熟练度百分比，可增删）
- 教育经历、校园经历、项目经历、实践经历
- 证书
- 求职意向

保存后在前台 `/resume` 页面实时生效。

### 简历下载

前台 `/resume` 顶部的「下载简历」下拉菜单提供两个入口：

| 入口 | 内容来源 | 说明 |
|------|----------|------|
| 一页版简历 | 后台上传的 PDF | 精简的一页版，适合快速投递 |
| 完整版简历 | 由简历数据实时整理 | 打开 `/resume/print`，自动唤起打印对话框，选「另存为 PDF」 |

完整版**不预先生成、也不缓存任何 PDF 文件**：排版全部由 CSS 控制，中文字体交给浏览器渲染，
所以不存在「站长更新后重新打包」的性能问题。

它与网页版有两处刻意不同：
- 单栏 A4 排版，去掉卡片边框与底色，改用「小标题 + 细分隔线」分区
- 专业技能只列名称，**不带百分比与进度条**（网页版 `/resume` 仍保留 `SkillBar` 不动）

## 在线音乐（清弦）

> 这一节同时写清了**功能的边界**。若你部署后发现「有些歌放不出声音」，
> 多半不是程序坏了，而是下面「已知限制」里的版权原因。

### 工作方式

| 层 | 做法 | 为什么 |
| --- | --- | --- |
| 数据源 | 第三方免费接口 **GD音乐台**（`music.gdstudio.xyz`） | 无 Key、无需登录；但它是第三方服务，非本项目组成部分 |
| 音源 | 只用 **netease**，不做多音源轮询 | 实测其余音源全部不可用（详见 `docs/music-plan.md`） |
| 音频文件 | **不存在本站服务器上** | 服务器只代理一个返回签名的 JSON 接口；由浏览器直接向 CDN 取流（有 Range 支持，可拖动进度条） |
| 播放地址 | **只做 5 分钟内存缓存，绝不写库** | 地址是短时签名的，存进数据库很快就失效 |
| 封面与歌词 | 在「绑定」那一刻抓取入库 | 前台渲染卡片墙与歌词因此是**零接口调用**，省下配额 |
| 配额 | 自我限流：最多 45 次 / 5 分钟（官方限流是 60 次） | 给访客播放留余量，不硬撞官方限制 |

播放请求的完整路径：

```
浏览器点击播放
  → GET /api/music/play?id=<歌曲id>      （本站接口，带频率限制）
      → 查库取出该歌的 apiId
      → 向 GD音乐台 请求 types=url 拿短时签名地址
      → 地址只放内存缓存 5 分钟
  → 浏览器直接向 CDN 取音频流（不经过本站服务器）
```

如果播放中途地址失效（例如暂停很久再继续），播放器会**自动重取一次地址并从断点续播**，
不会让你重新点一遍。

### 后台绑定流程

在线播放需要先把歌「绑定」到接口上的某个具体版本：

1. 进 `/admin/music`，点 **`自动匹配未绑定的歌`**。这一步**只搜索、不写库**，
   分批复用接口并有进度提示。
2. 结果逐条列出让人确认：歌名与歌手都对得上的给绿色标记；
   只有翻唱的会明确写出「只有翻唱，源站没有原版」。
3. 确认无误后点 **`确认并写入`**，才会真正写库（同时抓取封面与歌词）。
   单首歌也可以用行内的 `搜索绑定` 手动挑版本。

匹配规则**刻意保守：宁可匹配不到，也不绑错**。歌名必须精确相同（只剥掉《》这类外围装饰），
歌手必须精确相等或「歌手名后直接跟括号」的合法别名；像「周杰伦.」「HF薛之谦」这种
冒充原唱的写法一律不算。

### 已知限制

- **只有源站有原版的歌才能站内播放。** 网易云自 2021 年起就没有周杰伦（杰威尔）的版权，
  实测搜「晴天 / 稻香 / 青花瓷 / 兰亭序」拿到的**全是翻唱**（歌手名写作「周杰伦.」「Jay」等）。
  这类歌自动匹配会诚实地返回「无原版」，**不会被硬绑到翻唱上**。
- 这些歌需要**在后台补一个外链**（QQ音乐等），前台会显示「去别处听」而不是给一个放不出声的播放器。
  未绑定的歌访问 `/api/music/play` 返回 **409** 而非空地址，就是这个用途。
- 依赖第三方接口，可能因接口变更、限流或网络原因导致播放失败，**不保证持续可用**。
- 前台**刻意不提供搜索**：公开访客无限搜索会迅速吃光第三方配额，版权暴露面也更大。

完整的法律声明见站内 `/music/disclaimer` 页。

## 生产部署

以下是在 Linux 服务器上从零部署的完整流程。

### 环境要求

- **Node.js** 18+ 
- **npm** 9+
- **Git**
- **Nginx**（用于反向代理）
- **PM2**（用于进程守护）

### 1. 克隆项目

```bash
git clone https://github.com/LanKnight/lankhub.git
cd lankhub
```

### 2. 配置环境变量

```bash
cp .env.example .env
nano .env  # 编辑以下内容：
```

| 变量 | 说明 | 填写示例 |
|------|------|---------|
| `DATABASE_URL` | SQLite 数据库路径 | `file:./dev.db` |
| `AUTH_SECRET` | JWT 加密密钥 | `openssl rand -base64 32` 生成 |
| `NEXTAUTH_URL` | 网站域名（Auth.js 用） | `https://你的域名.com` |
| `NEXT_PUBLIC_SITE_URL` | 公开网站 URL | `https://你的域名.com` |

### 3. 一键初始化

```bash
bash scripts/setup.sh
```

脚本会自动：检查 Node.js → 安装依赖 → 初始化数据库（建表 + 种子数据）→ 生产构建。

### 4. 启动服务（PM2 常驻后台）

```bash
# 安装 PM2
npm install -g pm2

# 启动（生产模式下 Next.js 默认监听 localhost:3000）
pm2 start npm --name next-app -- start

# 设置开机自启
pm2 save
pm2 startup
```

### 5. Nginx 反向代理

```bash
sudo nano /etc/nginx/sites-available/lankhub
```

```nginx
server {
    listen 80;
    server_name 你的域名.com;

    # 上传文件大小限制（与应用的 10MB 限制一致，留 2MB 余量）
    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# 启用站点
sudo ln -s /etc/nginx/sites-available/lankhub /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. 配置 SSL（Let's Encrypt）

```bash
# 安装 certbot
sudo apt install certbot python3-certbot-nginx

# 申请证书（自动修改 Nginx 配置）
sudo certbot --nginx -d 你的域名.com

# 设置自动续期
sudo certbot renew --dry-run
```

### 更新部署

```bash
npm run update              # 一键更新：拉取 → 安装 → 推送DB → 构建 → 重启
```

> 发布文章现在要求必须选择所属合集。如果升级前库里已有「已发布但没有合集」的文章，
> 在服务器上执行一次下面的命令把它们归入「未分类」合集（幂等，可重复执行）：
>
> ```bash
> npm run db:backfill-collections -- --dry-run   # 先预览会改哪些文章
> npm run db:backfill-collections                # 确认后执行
> ```
>
> 草稿不受影响 —— 草稿允许暂时不归类，等点击发布时会被要求选择合集。

> 简历里的「获奖荣誉」已移除。它虽然一直在数据模型里，但前台不渲染、后台也没有编辑入口，
> 属于永远读不到也改不了的死数据。种子里已不再写入；如果升级前库里已有，
> 在服务器上执行一次下面的命令清掉（幂等，可重复执行）：
>
> ```bash
> npm run db:cleanup-awards -- --dry-run   # 先预览会删哪些记录
> npm run db:cleanup-awards                # 确认后执行
> ```
>
> 同一版本新增的「完整版简历」下载（`/resume/print` 打印视图）不需要任何额外命令。

> ⚠️ **本次升级不能直接跑 `npm run update`，会中途失败。**
>
> 用户昵称（`User.name`）加上了唯一约束。Prisma 遇到「给已有数据的列加唯一索引」
> 会先给出数据丢失警告并要求 `--accept-data-loss`，而 `npm run update` 里的 `db:push`
> 没带这个参数，**会在推送数据库那一步中断**。另外如果库里已存在重名昵称，
> 加索引会直接失败，所以必须先把存量昵称整理干净。
>
> 在服务器上按顺序执行一次：
>
> ```bash
> git pull                                        # 先拿到新 schema 与整理脚本
> npm run db:normalize-usernames -- --dry-run     # 先预览会改哪些昵称
> npm run db:normalize-usernames                  # 确认后执行（幂等，可重复跑）
> npx prisma db push --accept-data-loss           # 这一次需要显式接受数据风险
> npm run update                                  # 之后照旧一键更新
> ```
>
> 整理脚本会做的事：去掉首尾空白、把编码损坏的昵称（含 U+FFFD）换成 `user-<id>`、
> 截断到 20 字、给重名依次追加 `-2`、`-3`。跑第二遍会报「无需整理」。
>
> 同一版本还新增了 `/settings`（账号设置）：**所有登录用户**都能改自己的昵称与密码。
> 原先只有站长能从 `/admin/settings` 进，普通读者连改自己密码的入口都没有；
> 现在 `/admin/settings` 会 302 跳到 `/settings`，后台侧栏的入口也移到了导航栏。
>
> 另外**「退出登录」统一收进了 `/settings`**：导航栏与后台侧栏里的退出都去掉了。
> 同时后台页面顶部的站点导航栏收窄成只剩 logo 与「设置」——
> 原先后台一屏里同时挂着站点导航（7 个入口）与侧栏（10 个），
> 其中「首页」出现三次、「退出」出现两次。

> 「清弦」原本是相册里的音乐分类，因为音乐照片太少，已改造成**歌单页 `/music`**。
>
> - `/photos/music` 会 **308 永久重定向**到 `/music`，旧链接与书签不会失效
> - 相册分类从 6 个变成 5 个，「清弦」这一格改由首页「兴趣爱好」直接指向 `/music`
> - 歌单存在新表 `Song` 里，`npm run update` 里的 `db:push` 会自动建表，
>   **这一步没有数据丢失风险，不需要 `--accept-data-loss`**
> - 如果库里还残留着 `category = 'music'` 的照片（已被清空的话可忽略），
>   它们不会再被任何页面展示，可自行删除：
>   `sqlite3 dev.db "DELETE FROM Photo WHERE category = 'music';"`
>
> 歌单支持**批量粘贴导入**：在 `/admin/music` 选「批量粘贴」，每行一首、写成
> `歌名 - 歌手`（也认 `–`、`—`、`|`、制表符，以及行首的 `1.`、`-` 之类的列表标记；
> 两侧的《》「」会自动去掉）。粘贴后会先给出预览，解析不了的行会单独列出来并说明原因，
> 导入时还会跳过已存在的同名同歌手条目。

> **接口的请求校验统一收进了 zod schema**，并新增了 `npm run db:check-limits` 预检。
>
> - 起因是 `src/lib/validations.ts` 里有 4 个 schema 定义了却从没被引用，
>   而对应的接口各自手写了一套平行规则。现在评论 / 合集 / 简历 / 分页四组接口都真正用上了它们
> - **代价是出现了一批过去不存在的长度与格式限制**：这些限制只作用在请求上，
>   **不会改动任何已有数据**，但如果某条历史记录违反了新规则，它就会「能看不能存」——
>   在后台点保存永远失败。**上线后先跑一次 `npm run db:check-limits`** 即可查出
> - 那个脚本直接复用 `src/lib/validations.ts` 里的 schema，不另抄一份限制，
>   所以以后改了 schema、预检会跟着变，不会失真
> - 另外把「可空字段」对齐了：`Collection.coverImage`、`Article.summary` 这些在库里是 `null` 的列，
>   schema 现在同时接受 `null`，否则把数据库记录原样回传的客户端会被 400
>
> 同一轮还清理了几处历史遗留：
>
> - 删掉 `scripts/deploy.sh`（WSL 本地构建部署，服务器 IP 一直是占位符，已被 `npm run update` 取代）
> - 删掉 `prisma/dev.db`（0 字节空壳，真正的库是根目录的 `dev.db`）
> - 删掉两个无人调用的接口 `/api/collections` 与 `/api/collections/[slug]`
>   （前端合集页是服务端直接查库的；它们本来也不泄漏草稿，所有查询都过滤了 `published`）
> - sitemap 补上 5 个相册分类页（此前只有固定几个路由）
> - 后台侧栏改为由服务端传入会话，不再先渲染一个空的 `<nav>` 再水合


### PM2 常用命令

| 命令 | 说明 |
|------|------|
| `pm2 status` | 查看所有服务状态 |
| `pm2 logs next-app` | 查看实时日志 |
| `pm2 restart next-app` | 重启服务 |
| `pm2 stop next-app` | 停止服务 |
| `pm2 delete next-app` | 删除服务 |

## 可用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建（含 Prisma 生成） |
| `npm start` | 启动生产服务 |
| `npm run update` | 服务器一键更新部署 |
| `npm run setup` | 一键初始化数据库（生成 + 推送 + 种子） |
| `npm run db:generate` | 重新生成 Prisma 客户端 |
| `npm run db:push` | 同步数据库 Schema |
| `npm run db:backfill-collections` | 把「已发布但没有合集」的文章归入「未分类」（幂等，加 `-- --dry-run` 先预览） |
| `npm run db:cleanup-awards` | 清理历史遗留的「获奖荣誉」死数据（幂等，加 `-- --dry-run` 先预览） |
| `npm run db:normalize-usernames` | 整理存量用户昵称（去空白、修损坏、去重），加唯一约束前必须先跑（幂等，加 `-- --dry-run` 先预览） |
| `npm run db:check-limits` | **上线前预检**：检查现有数据是否会被接口的校验规则卡住（只读，有问题时退出码为 1） |
| `npm run db:seed` | 运行种子脚本，设置站长账号 |
| `sqlite3 dev.db "SELECT id, email, name, role FROM User;"` | 查询账号 |


## 环境变量

复制 `.env.example` 为 `.env`，填写以下变量：

| 变量 | 说明 | 示例 |
|------|------|------|
| `DATABASE_URL` | SQLite 数据库路径 | `file:./dev.db` |
| `AUTH_SECRET` | JWT 加密密钥 | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | 网站域名（Auth.js 用） | `https://lankhub.com` |
| `NEXT_PUBLIC_SITE_URL` | 公开网站 URL（sitemap/robots） | `https://lankhub.com` |

## 管理员账号

- 邮箱: `admin@lankhub.com`（可通过 `SEED_ADMIN_EMAIL` 环境变量自定义）
- 初始密码由 `prisma/seed.ts` 随机生成并仅打印一次，也可通过 `npm run reset-password` 修改

> ⚠️ 部署到服务器后请立即修改 `.env` 中的密钥，并更改管理员密码。

## 目录结构

```
lankhub/
├── prisma/               # Schema + Seed + 数据维护脚本
├── scripts/              # 部署脚本（setup / backup / restore）
├── docs/                 # 方案与交接文档（含音乐接口的实测记录）
├── src/
│   ├── app/              # 页面路由 + API
│   │   ├── admin/        # 管理后台（文章/合集/评论/简历/相册/诗词/歌单）
│   │   ├── api/          # API 路由（含 /api/music/play 播放地址代理）
│   │   ├── auth/         # 登录/注册页面
│   │   ├── blog/         # 博客 + 合集页面
│   │   ├── music/        # 清弦歌单 + 免责声明页
│   │   ├── photos/       # 生活相册
│   │   ├── poems/        # 拾章
│   │   ├── resume/       # 简历页面（含 /resume/print 打印视图）
│   │   └── settings/     # 账号设置（全站唯一的退出登录入口）
│   ├── components/       # React 组件
│   │   ├── auth/         # 登录/注册表单
│   │   ├── blog/         # 文章卡片、分页、内容渲染
│   │   ├── comment/      # 评论组件
│   │   ├── editor/       # TipTap 富文本编辑器
│   │   ├── home/         # 首页栏目组件
│   │   ├── layout/       # Navbar、Footer、AdminSidebar
│   │   ├── music/        # 播放器 Context、底部播放条、歌手卡片墙
│   │   └── resume/       # 简历展示组件
│   ├── lib/              # 工具库（auth, prisma, validations, music-api, lrc…）
│   └── generated/        # Prisma 生成的客户端（不入库）
└── public/               # 静态资源
```

## 免责声明

> 部署或使用本项目前请完整阅读本节。下面几条不是形式条款，
> 而是这个项目真实存在的边界。

### 一、项目性质

本项目是一个**个人非盈利技术演示项目**：不提供任何付费服务、不投放广告、
不进行任何形式的商业运营。代码以 MIT 许可开源（见下一节），目的是技术交流与学习。

### 二、第三方服务

- 「清弦」的在线试听依赖**第三方免费接口 GD音乐台**（`music.gdstudio.xyz`）。
  该服务由第三方独立运营，**与本项目作者无任何关联**，作者也未获得其授权、赞助或担保。
- 本项目**不存储、不制作、不转码、不分发任何音频文件**。服务器只负责向上述接口
  请求一个短时签名的播放地址，音频流由浏览器直接向对方 CDN 获取。
- 该接口可能随时变更、限流或停止服务。**本项目不对其可用性、准确性或合法性作出任何保证**，
  亦不对因接口变更导致的功能失效承担责任。
- 若你会长期部署使用，**请自行确认并遵守该第三方服务的条款**。

### 三、版权与侵权处理

- 站内展示与播放的音乐、歌词、封面等内容的**版权均归其原始版权方所有**。
  本项目及作者不对这些内容的版权归属作出任何声明或保证。
- 本项目**不提供任何下载入口**。请勿将播放地址用于下载、二次分发或任何商业用途。
- 若版权方认为相关内容侵犯了合法权益，请通过站内 `/music/disclaimer` 页面
  公布的联系方式告知，核实后将第一时间移除相关内容。
- 若本站将来出现任何盈利行为，将**立即停止使用**该第三方接口。

> 站内 `/music/disclaimer` 是面向访客的完整版本（含数据来源、非商业用途、
> 禁止下载、服务可用性等 7 条），本节与它口径一致。

### 四、部署与使用风险（请重点阅读）

**⚠️ 克隆本仓库并部署上线后，你即为该站点的运营者。**
下列责任**完全由部署者自行承担**，与仓库作者无关：

- 第三方接口的调用行为与频率合规性；
- 站点所展示的一切内容的版权合规性；
- 数据的备份、安全与丢失风险（`npm run update` 虽然会先备份数据库与上传目录并打 git tag，
  但**这只是便利机制，不构成任何数据安全保证**）；
- 因使用本项目而产生的任何直接或间接损失。

本项目按 **「原样」提供，不附带任何明示或默示的担保**，包括但不限于对适销性、
特定用途适用性及非侵权的担保。作者不对任何衍生部署的行为或后果负责。

### 五、内容不在开源范围内

本仓库是**纯代码仓库**：站点的实际运营内容（文章、歌单、相册照片、简历资料、诗词）
存放在数据库（`dev.db`）与上传目录（`data/uploads/`、`public/images/uploads/`）中，
这些路径均**未纳入版本控制**，因此不在 MIT 许可的授权范围内，版权仍归原作者所有。

仓库中 `prisma/seed.ts` 携带的个人资料是**演示用的占位数据**（姓名写作「张三」、
电话写作「138-xxxx-xxxx」），并非真实信息。

## License

### 源代码：MIT

本仓库的**源代码**采用 MIT License 授权，可自由使用、修改、分发，
包括用于商业项目，条件是保留原始版权声明与许可声明。完整文本见根目录
[`LICENSE`](LICENSE) 文件。

### 非代码内容：保留所有权利

以下内容**不属于**上述 MIT 许可的授权范围，未经书面许可不得转载、复制或用于任何用途：

- 站点的视觉设计、配色方案与界面文案；
- 「清弦」歌单数据，以及其中音乐、歌词、封面的版权（归原始版权方所有）；
- 「拾章」诗词、「捕光」相册照片、「闲酌」文章正文；
- 简历资料及其它个人数据；
- `docs/` 下的方案与交接文档。

> 需要说明的是：上述内容大多存放在数据库与上传目录里、**并未提交到本仓库**，
> 所以正常克隆得到的只是代码。这一节的作用是明确「万一它们出现在仓库里，
> 也不在开源授权范围内」，避免产生歧义。

### 第三方依赖

项目使用的开源依赖（Next.js、React、Prisma、TipTap 等）各自遵循其原有许可，
详见 `node_modules/` 内各包自带的 LICENSE 文件。
