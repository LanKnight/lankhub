# 交接文档 · lankHub

> 写给**接手的 AI 助手**（也可能是接手的我自己）。
> 读完这份再动手。里面有一节是「本机环境的坑」和「已经踩过的错」，
> 那部分能省下大量反复试错的时间。
>
> 最近更新：2026-10 · 对应 commit `213923b` 之后的「后台绑定界面接线」一轮
> （本文档已同步到那一轮完成后的状态）

---

## 0. 先读这段：怎么和这位用户协作

### 必须遵守的协作流程

1. **先探讨方案，确定好改动内容再修改，确保思路是一致的。**
   用户原话，反复强调过。任何非平凡改动都要**先出方案、列出可选项、等他确认**，
   再动手。他会用选择题的形式回答。**不要直接开始改代码。**
2. **每次改完立刻 commit + push 到 GitHub，然后给一份「可以直接复制」的总结。**
   用户原话：「以后修改完了马上同步github并做总结，且总结内容需要我可以直接复制」。
3. **总结的格式**：放在一个代码块里，用 `- 主题` / `    - 细节` 两级，
   每条主题末尾带 `- 已推送 GitHub（commit xxxxxxx）`。**不要用表格。**
4. 用户会自己在服务器上跑命令，并把终端输出贴回来。看到报错先分析再改。

### 沟通与判断上的期望

- **不要夸大结论，也不要把猜测说成事实。** 他会追问，也会自己验证。
- 发现自己的错误要**主动、具体地说明**，包括根因。这几轮里
  「我本地验证漏了」「文档写的和实测不一致」这类坦白都被明确认可。
- **不要为了凑清单而做无谓改动。** 审计时若某项实际价值很低，直说低，
  不要为了「完成清单」硬做。
- 改动范围以外的东西**先问再做**，不要顺手扩大范围。

### 代码风格（项目内既有约定）

- 注释与界面文案**一律中文**，且注释解释「为什么」而不是「做了什么」。
- **`src/` 下不写行尾分号**；根目录的配置文件（`next.config.ts` 等）**写分号**。
- 2 空格缩进，双引号。
- 默认 Server Component；只有需要交互时才 `"use client"`。
- Tailwind 类名**不要用字符串拼接**（如 `pl-${n}`）—— 不会被生成，改用行内 style。
- 用 `lucide-react` 图标。

### 审美偏好

- 风格是**水墨/简约**：白底、细灰边、大留白、克制的阴影。
- 栏目名是**两字文言**：码砚 / 弈趣 / 驰野 / 清弦 / 捕光 / 闲酌 / 拾章。
- 动效**只用来表达"到达"**，不用来炫技。`animate-rise-in` 必须
  `animation-fill-mode: backwards`（用 `both`/`forwards` 会锁死 `transform`，
  破坏 `hover:-translate-y-*`）。
- `prefers-reduced-motion` 必须处理。
- **他讨厌界面上按钮太多。** 之前专门做过一轮精简：
  后台页面的站点导航栏收窄成只剩 logo + 设置，退出登录收进 `/settings`。

---

## 1. 项目与技术栈

个人博客 **lankHub**。

| 项 | 值 |
| --- | --- |
| 仓库 | `https://github.com/LanKnight/lankhub`，分支 `main` |
| 框架 | Next.js 16.3.0（App Router）、React 19.2.4、TypeScript |
| 样式 | Tailwind CSS 4（`@theme inline`，工具类会被内联成字面量） |
| 数据库 | SQLite + Prisma 7.9.1 + `@prisma/adapter-better-sqlite3` |
| 认证 | Auth.js v5（`next-auth@5.0.0-beta.32`，JWT 会话） |
| 编辑器 | TipTap 3 |
| 部署 | 阿里云 ECS + PM2 + Nginx + Let's Encrypt |

### 重要的框架事实

- **`cacheComponents` 没有开启** → 传统缓存模型，`export const revalidate = 60` 是有效的。
- Prisma **用 `db push`，没有 migrations**。真实数据库是**根目录的 `dev.db`**。
- `AGENTS.md` 要求：写这个版本的 Next.js 代码前先查
  `node_modules/next/dist/docs/`。**这个版本的 API 与训练数据里的不一样。**
- **流式 SSR 下 `redirect()` 之后响应头已经发出**，HTTP 状态仍是 **200**，
  重定向写成 body 里的 `<meta id="__next-page-redirect" http-equiv="refresh" content="1;url=...">`。
  测重定向**不能找 3xx**，要找这个 meta。
- **客户端组件在 SSR 阶段拿不到会话**（`useSession()` 期间是 undefined）。
  所以 `Navbar` 首屏是骨架屏、`AdminSidebar` 曾经渲染出空的 `<nav>`。
- 模块增强要针对**声明它的模块**：`Session`/`User` 在 `@auth/core/types`，
  `JWT` 在 `@auth/core/jwt`；`next-auth` 只是 `export *` 转发，增强它**静默无效**。

---

## 2. 部署与服务器

```bash
npm run update      # = backup.sh && git pull && npm ci && db:push && build && pm2 restart
```

它第一步就是 `scripts/backup.sh`：备份 `dev.db` + `data/uploads/` + 打 git tag，
保留最近 2 份。命令用 `&&` 串联，**失败会中断**，所以最坏情况可回滚。

服务器上的库（2026-10 实测）：合集 4 · 简历 1 · 经历 11 · 技能 8 ·
文章 15 · 歌单 97 · 评论 3 · 账号 4。

**新增可空列或新表时 `db push` 不需要 `--accept-data-loss`**；
但**加唯一约束**会需要（历史上加 `User.name @unique` 时遇到过）。

---

## 3. ⚠️ 本机开发环境的坑（读这一节能省几个小时）

### 3.1 文件沙箱：只有工作区**根目录**可写

会话工作区是 `D:\aboutWork\assignment\lankhub`。受限模式（workspace-write）下
**只有根目录本身可写**，所有子目录（`src/`、`prisma/`、`scripts/`、`.git`、`.next`）
和已存在的文件都需要提升权限。

**做法**：任何会写到子目录或需要在子目录里跑的命令，都要带
`sandbox_permissions: "danger-full-access"` **和一句中文 justification**。

根因（查过 `icacls`）：根目录上那三条 ACE **都是不可继承的**
（`[Deny] Everyone DeleteSubDirectoriesAndFiles`、
`[Allow] S-1-4-969508925-373941332`、`[Allow] lanknight\lank FULL`），
所以只有根目录自己被授权，子目录不继承。

- 修复脚本在 `D:\aboutWork\assignment\acl-recovery\`
- 有一个技能叫 `diagnose-windows-sandbox-acl`，专门处理这类拒绝
- 受限模式下还会拦「有管道 stdio 的孙进程」→ `next build` / `tsx` / `next start`
  会报 `spawn EPERM`，同样提升权限即可

### 3.2 我已经犯过 6 次的错：不要用内联 `node -e`

PowerShell 的引号转义会把内联 JS 弄坏，**失败了 6 次**。
每次我都说要用文件脚本，然后又图省事。**这次真的不要再用了。**

```powershell
# ✗ 会坏
node -e "const db=...('select ... where x=\'y\'')"

# ✓ 写成文件再跑
node scripts/_temp.mjs
```

### 3.3 临时脚本必须是 `.mjs`，**不能是 `.ts`**

`tsconfig` 的 include 含 `**/*.ts`，所以放进 `scripts/` 的 `.ts` 会被**纳入构建**；
而 `better-sqlite3` 没有类型声明 → **直接打挂 `npm run build`**。
`.mjs` 不在 include 里，安全。

（这也意味着 `.mjs` 里不能用顶层 `await`…… 可以，`.mjs` 支持顶层 await ✓。
反而是 `.ts` 被 tsx 当 CJS 处理时不支持顶层 await。）
**脚本用完要删掉**，`scripts/` 里最终只应有
`backup.sh`、`restore.sh`、`setup.sh` 三个正式脚本
（`deploy.sh` 因为服务器地址一直是占位符，已经删掉了）。

### 3.4 本机**无法**用 curl / PowerShell 访问 HTTPS

`curl` 报 exit 35、PowerShell 报
`schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`。
**对照组 `api.github.com` 也一样失败** → 是本机环境问题，不是目标站点的问题。

**要探测外部 API，用 Python**（它走 OpenSSL，能通）：

```powershell
$env:PYTHONIOENCODING = 'utf-8'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
& "C:\Users\lank\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe" scripts/_probe.py
```

Python 里打印中文建议 `json.dumps(obj, ensure_ascii=True)`，
否则 Windows 控制台按 GBK 解码会乱码。

### 3.5 其它零碎

- **`Test-Path` / `Get-ChildItem` 遇到 `[slug]` 这类路径会失配**（`[]` 是通配符）
  → 用 `-LiteralPath`。
- **不要用 `git add -A`** —— 我用它把临时提交信息文件 `.commitmsg*.tmp`
  一起提交过一次（还没推送，已 amend 修正）。**显式列文件名。**
- **`Get-Content` 会用 ANSI 读 UTF-8 文件**，中文显示成乱码 ——
  我差点据此误报「脚本文件损坏」。**读文件用 read 工具。**
- Git push 走代理：`git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push origin main`
  （代理偶尔不通，可直连重试）。

---

## 4. 验证方法论（含踩过的测试坑）

**每个改动都要真实验证，不要只靠类型检查。** 惯例：
临时脚本放 `scripts/_xxx.mjs` 或根目录 `_xxx.mjs`，**用完删除**。

### 已经踩过、会反复踩的断言坑

1. **React 在文本插值间插 `<!-- -->`** —— `共 {n} 首` 渲染成
   `共 <!-- -->5<!-- --> 首`。**先 `replace(/<!--.*?-->/g, "")` 再匹配。**
2. **流式 SSR 的重定向是 200 + meta refresh**，不是 3xx（见第 1 节）。
3. **不要断言客户端组件在 SSR 里的内容** —— 拿不到会话，会渲染骨架屏/空标签。
   这类断言要改成「查源码」。
4. **分组选择器会破坏断言** —— `(v=)  .a, .b { }` 不含 `.a{`。
5. **搜索「某符号是否被引用」时先剥注释** —— 否则我自己写的注释会被当成引用。
   反过来，用 `includes("回首页")` 会命中 404 页的「返**回首页**」→ 用 `>回首页<`。
6. **`zod` 会静默剥掉未知字段。** 套 schema 前必须把接口实际用到的字段补全，
   否则**静默丢数据**。
7. **`zod` 的 `.optional()` 不接受 `null`。** 数据库里可空的列必须加 `.nullable()`，
   否则把数据库记录原样回传的客户端会 400。
   **这个错我犯过三次**（`Collection.coverImage`、`Song.link`、`Comment.parentId`）。
8. **用真实条件验证。** 本地库常常是空的 —— 「本地没有评论」导致
   `parentId: null` 的修复没被测到，是**线上跑出来**才发现的。
   要**自己造出与线上一致的条件**再验。
9. **一次成功 ≠ 覆盖。** 我用一首歌（起风了）验证了音乐 API「可用」，
   就以为整库都能用 —— 结果网易云根本没有周杰伦的版权。
   **验证第三方能力时必须抽样多个样本，并明确边界。**
10. **断言要证明「真的生效」，而不是「字符串出现了」。**
    我给后台缩略图断言时用的是自己拼的封面地址，判定条件是
    「这个 URL 出现在页面里」→ 显示通过，但那个地址实测是 **404**，
    图根本显示不出来。**要用接口/数据库里真实的地址去断言。**
11. **不能断言「需要交互才出现」的内容。** 前台卡片墙在 SSR 里只有
    折叠状态的歌手卡片，歌曲列表要点击才展开，所以行内的「待绑定」徽标
    在首屏 HTML 里**根本不存在**。这类断言要改成查 flight 数据（如 `apiId`）
    或查前端产物。
    （顺带两个小坑：flight 数据里的键是**转义过的**（`\"title\"`）；
    用 `[^}]*` 的正则跨不过前面嵌套的对象字段。）

### 常用验证脚本模式

脚本里通常：临时改站长密码完成真实登录 → 跑断言 →
`finally` 里还原密码、清理测试数据 → 最后核对「密码已还原 / 数据已清理」。
**务必清理干净，用户用的是同一个库。**

---

## 5. 已完成的工作（按主题）

| 主题 | 状态 |
| --- | --- |
| 动效/入场动画、hero 暗色 hover、reduced-motion 补齐 | 完成 |
| 简历单页/完整版下载（`/resume/print`） | 完成 |
| 编辑器粘性工具栏、文章目录（TOC + 滚动高亮） | 完成 |
| 认证加固：昵称唯一 + trim + 长度、邮箱规范化、登录限流、`as any` 清零 | 完成 |
| 界面精简：后台导航栏收窄、退出登录收进 `/settings`、返回顶部挪到右下 | 完成 |
| 清弦歌单（`/music`）：`Song` 模型、批量粘贴导入、按歌手分组 | 完成 |
| 权限码收敛到唯一真相源（原先有 5 份副本） | 完成 |
| 4 个从未被引用的 zod schema 真正生效（评论/合集/简历/分页） | 完成 |
| 上线前数据预检 `npm run db:check-limits` | 完成 |
| schema 与数据模型的可空性对齐 | 完成 |
| 删除历史遗留：`scripts/deploy.sh`、`prisma/dev.db` 空壳、两个无人调用的 `/api/collections` | 完成 |
| sitemap 补 5 个相册分类页、后台侧栏 SSR 空 `<nav>` 修复 | 完成 |
| 清弦在线播放（GD音乐台 API 接入） | 完成（见第 7 节） |
| 清弦后台绑定界面接线（搜索绑定 / 解绑 / 批量自动匹配确认） | 完成 |
| 匹配算法本地重排 + 置信度分级（修掉原版被翻唱挤掉的问题） | 完成 |
| 播放地址失效后自动重取并续播 | 完成（**浏览器行为未实测**） |
| README 重写 License 与免责声明 + 补音乐功能说明 | 完成（见第 11 节） |

---

## 6. ⚠️ 未完成 / 待完善（新对话从这里开始）

> **2026-10 更新**：原 6.1「后台绑定界面没接线」**已经做完**，6.2 那 3 首错绑
> 也有了处理入口。剩下的重点见下面 6.1 / 6.2 里标注的部分。

### 6.1 【已完成】后台绑定界面已接线

`src/app/admin/music/SongManager.tsx` 现在有：封面缩略图、绑定状态徽标
（已绑定 / 源站无原版 / 待绑定）、`[搜索绑定]`、`[解绑]`、配额剩余、
`[自动匹配未绑定的歌]`、`[清除全部绑定]`，以及批量匹配的**逐条确认面板**
（先 `/match` 只搜不写 → 人确认 → 再 `/bind` 写入 + `markNoMatch`）。
`page.tsx` 的 `select` 也补上了 `apiId / matchStatus / coverUrl / picId`。

**已验证**：端到端 29 项 + 渲染层 21 项 + `matchSong` 单元 17 项断言全过，
本地造的歌与临时改的站长密码都已还原，其它表行数逐张核对未变。
细节见 `docs/music-plan.md` 第五节。

**仍然没做的**：

- **真实浏览器里听一遍声音**（见第 7.6 节）—— 播放、拖动进度条、歌词滚动、
  以及新加的「地址失效后自动重取并续播」，都还是浏览器行为，没实测过。
- 歌单**大部分歌永远无法站内播放**的问题没变（见下面 6.3）。

### 6.2 【已完成】线上 3 首错绑有了处理入口

用户已明确：**线上那 97 首都是测试数据，误删也没关系**，所以
「清除全部绑定」可以放心用。（注意：**其余数据是重中之重**，
验证脚本只碰 `Song` 表。）

### 6.3 歌单里大部分歌**永远无法站内播放**

**网易云没有周杰伦（杰威尔）的版权**，2021 年就下架了。

实测证据（`docs/music-plan.md` 有完整记录）：

| 歌 / 歌手 | netease 结果 |
| --- | --- |
| 晴天 / 周杰伦 | 两种搜索写法下，**可信候选都是 0 条**（全是翻唱） |
| 稻香 / 周杰伦 | 同上，0 条 |
| 兰亭序 / 青花瓷 / 周杰伦 | 同上，0 条 |
| 演员 / 薛之谦 | ✅ 原版在（专辑「绅士」） |
| 大鱼 / 周深 | ✅ 原版在（但在候选里排到第 8 位，靠本地重排才挑得出来） |
| 起风了 / 冯沁苑 | ✅ 原版在（歌手带合法别名括号） |

用户已明确决定：**只给外链，不绑翻唱**。
所以这批量很大的歌需要**在后台补 `link` 外链**（QQ音乐等），
前台对未绑定但有外链的歌显示「去别处听」。

**可以考虑的下一步**（用户已知晓、尚未决定要不要做）：
- 批量填外链的入口（现在只能逐首改）
- 前台把「本站无此版权」表达得更清楚、更好看

### 6.4 用户已明确「暂不做」的事 —— 不要主动去做

- **找回密码 / 密码重置**：用户原话「这次先不管，后期考虑邮箱注册时
  添加一个验证功能再加忘记密码的密码重置」。
  （因此现在存在一条死路：用已注册邮箱再注册会返回 201「注册成功」，
  但那个用户永远无法登录或找回。）
- **后台歌单的批量外链填充**：本轮明确没做（见 6.3）。
- **前台音乐搜索**：刻意不做（会让公开访客无限消耗第三方配额，版权风险也更大）。
- **导航栏加音乐入口**：刻意不做，入口只在首页「兴趣爱好」那一格。
- **Navbar 的 SSR 骨架屏**：刻意不修 —— 它在根布局里，
  改成服务端读会话会让**全站每个页面都变成动态渲染**，代价远大于那一瞬骨架屏。
- **支持周杰伦的音源**：用户选了「不找，就用 netease」。
- **歌手别名表**：用户选了「不做，保持严格」。
  理由：实测搜索结果里 `Jay` 那条基本是冒用艺名的翻唱，
  加别名会明显提高错绑风险。

### 6.5 已知的、尚未处理的小问题

- **后台候选列表不显示封面**：这是刻意的，不是漏做。
  搜索结果里没有封面地址字段，而封面 CDN 需要一段无法由 `pic_id`
  推导的加密哈希 → 想显示就得为每条候选调一次接口，会吃光配额。
  详见 `docs/music-plan.md` 第五节的第 5 条实测。
- `src/components/layout/Footer.tsx` **硬编码了 `lanknight@qq.com`**，
  而免责声明页读的是简历资料里的邮箱 → **联系方式有两个真相源**。
  建议统一（用户当时选择了「免责声明用简历里的」）。
- 仓库里还有约 60 个**既有的** ESLint 报错（多为 `any`），
  都在没动过的文件里。上一轮约定：只清理改动到的文件，不顺手扩大。
- `docs/musicFunctionDevDoc.md`（用户提供的原始需求文档）**未纳入版本控制**，
  是用户的笔记，要不要提交由他决定。
- `src/lib/file-type.ts` 的 `detectFileType`、`src/lib/collections.ts` 的几个常量
  仍是「导出但没有外部引用」—— 扫描过，属于纯清洁度问题，价值很低。

---

## 7. 音乐功能专题（接手的必读）

### 7.1 数据源的真实能力（**与那份需求文档不一致**）

文档 `docs/musicFunctionDevDoc.md` 说「稳定音源：netease、kuwo、joox」，
推荐备用链 `netease → kuwo → joox`。**实测这是坏的**：

- **`kuwo` 被服务端直接拒绝**：`{"detail":"Value of `source` is not supported."}`
- **`joox` 能搜到，但 `types=url` 恒返回空链接**（`{"url":"","br":-1}`）
- 其余 11 个音源（tencent / kugou / migu / tidal / qobuz / spotify / apple / ytmusic…）
  全部 400 不支持
- **只有 `netease` 真正能播**

有意思的是：**API 自己的 `api.php` 文档页仍然列着 kuwo** ——
所以不是那份文档抄错，是**它的实现和它自己的文档不一致**。

**所以代码里不做多音源轮询**，失败就在 netease 重试，
不去浪费配额试那些已知不可用的音源。

### 7.2 其它实测事实

- 播放地址是**短时签名**（形如 `.../20261007144126/....mp3`，
  两次请求 URL 不同）→ **不能长期缓存**。
- 音频响应头：`audio/mpeg`、**`Accept-Ranges: bytes`**、
  `Access-Control-Allow-Origin: *`；带 `Range` 的请求返回 **206**
  → **进度条拖动可用**。
- **音频与封面都不需要 CORS**（`<audio src>` / `<img>` 不受同源策略约束），
  只有 JSON 接口需要后端代理。
- 官方限流 **60 次 / 5 分钟**。

### 7.3 现有实现要点

- `src/lib/music-api.ts` —— 服务端专用客户端。内含：
  - **自我配额闸门**：自己最多用 45 次 / 5 分钟，用完明确拒绝，不硬撞官方限流
  - **调用间隔 400ms** + 对 503 / 超时各重试一次（实测连续快速搜索会 503）
  - 播放地址的**内存短缓存**（10 分钟 TTL，上限 500 条）
- `src/lib/music-match.ts` —— 匹配器，**刻意保守**：
  - 歌名必须**精确相同**（只剥《》这类外围装饰，不动内部括号）
  - 歌手必须**精确相等**，或「目标名后直接跟括号」（合法别名，如
    「冯沁苑(买辣椒也用券)」）；「周杰伦.」「周杰伦♚」一律不算
  - **宁可返回 null，也不绑错**
  - **本地重排**（后加的）：不依赖接口的相关度顺序，自己在候选里找第一条
    可信的。实测「大鱼 - 周深」的可信原版排在第 8 位、前面 7 条都是翻唱，
    照顺序取就会绑错。候选回传条数也因此提到 10 条。
  - 返回三级 `confidence`：`high`（有可信候选）/ `low`（有歌名相同的条目
    但歌手对不上，多半是翻唱）/ `none`（连歌名都没收录）。
    `low` 与 `none` 一律 `match: null`，交给人判断
- `src/lib/lrc.ts` —— LRC 解析（支持一行多时间标签）+ 二分找当前行
- `src/components/music/` —— `player-context.tsx`（唯一 audio 元素 + Context）、
  `PlayerBar.tsx`（底部播放条 + 歌词抽屉）、`ArtistGrid.tsx`（歌手卡片墙 + 就地展开）
- `src/app/api/music/play/route.ts` —— 前台**唯一**对访客开放的音乐接口，带限流。
  未绑定的歌返回 **409**，让前端退回到外链，而不是给一个放不出声的播放器。
  支持 `&retry=1` 跳过内存缓存重取地址（播放器地址失效时的自愈路径）。
- **两层缓存**：封面地址与歌词在**绑定那一刻**抓取入库（前台零 API 调用）；
  播放地址只在内存里短缓存（**5 分钟**）。
- 后台界面在 `src/app/admin/music/SongManager.tsx`（含批量匹配的确认面板）、
  `BindDialog.tsx`（单首搜索绑定，已被 SongManager 引用）。
- **不要试图在后台列表里显示候选封面**：搜索结果没有封面字段，
  封面 CDN 需要一段无法由 `pic_id` 推导的加密哈希，显示封面就得逐条调接口。
  详见 `docs/music-plan.md` 第五节。

### 7.4 CSP（**不改就会一点声音都没有**）

`next.config.ts` 里原本 `img-src`/`connect-src` 都是 `'self'`、且**没有 `media-src`**
（回落到 `default-src 'self'`）→ 外部封面与音频会被浏览器**直接拒绝**。

现在已放宽：

```
img-src   'self' data: blob: https://*.music.126.net
media-src 'self' https://*.music.126.net
connect-src 'self'          ← 保持不变，JSON 走自己的代理
```

一个通配符同时覆盖音频（`m701/m801.music.126.net`）与封面（`p1/p2.music.126.net`）。
选择直连而不是自己代理音频，是为了**不让 ECS 承担全部音频流量**
（320kbps ≈ 2.4MB/分钟/人）。若将来 CDN 换域名导致播放失败，再改为服务器代理。

### 7.5 相关命令

```bash
npm run db:check-limits          # 上线前只读预检：现有数据会不会被校验规则卡住
npm run db:bind-music            # 自动绑定未绑定的歌（加 -- --dry-run 先预览）
```

### 7.6 **还没在真实浏览器里听过声音**

上一位助手只验证到「服务器返回了正确的播放地址和正确的 CSP 响应头」为止。
**播放、自动播放策略、进度条拖动、歌词滚动都是浏览器行为，尚未实测。**
接手后请用户真的点一遍，并把浏览器控制台报错贴回来。

本轮（做后台绑定界面时）补了「地址失效后自动重取并续播」的逻辑，
**同样是浏览器行为、同样没实测**：播放地址是短时签名的（有效期约 1 小时），
用户暂停很久再继续时浏览器会去请求一个过期地址而失败。
现在的处理是：`audio` 的 `onError` → 调 `/api/music/play?id=...&retry=1`
（跳过服务端缓存）→ 从 `currentTime` 续播；每首歌只自动重试一次，
再失败才提示「播放地址已失效，请重新点击播放」。

需要人工确认的点：
1. 点播放能不能出声；控制台有没有 CSP 报错
2. 拖动进度条是否生效（CDN 支持 Range → 应该是 206）
3. 歌词是否跟唱滚动
4. 暂停超过一小时后继续，是否会自动恢复而不是卡住

---

## 8. 常用命令与验证入口

```bash
npx tsc --noEmit                 # 类型检查（注意：删了路由后要先 build 重建 .next/types）
npx eslint <文件...>             # 只 lint 改动到的文件，不顺手扩面
npm run build                    # 生产构建（含 prisma generate）
npx tsx prisma/check-limits.ts   # 只读预检
```

**本地起服务验证**（需要提升权限，见第 3 节）：

```powershell
npx --no-install next start -p 3000    # 后台任务
# 等它就绪后再跑验证脚本
node scripts/_xxx-check.mjs
```

本地 `dev.db` 的状态：用户 2 个（`#1 站长 admin@lankhub.com OWNER`、
`#2 user-2 test@test.com READER`）、文章 2 篇、其余基本为空。
**验证脚本要记得清理自己造的数据并还原站长密码。**

---

## 9. 关键文件地图

| 路径 | 说明 |
| --- | --- |
| `src/lib/permissions.ts` | **权限码唯一真相源**。刻意不导入任何东西，客户端也能引用 |
| `src/lib/auth-helpers.ts` | 服务端鉴权（`getCurrentUser` / `requireOwner` / `requireOwnerUser` / `requirePermission`） |
| `src/lib/validations.ts` | 所有 zod schema，含 `z.config(z.locales.zhCN())` 让类型错误也说中文 |
| `src/lib/music-api.ts` | 音乐接口客户端（配额闸门、缓存、重试） |
| `src/lib/music-match.ts` | 歌名/歌手匹配（保守策略） |
| `src/lib/lrc.ts` | LRC 解析 |
| `src/lib/music.ts` | 歌单批量粘贴的解析器（客户端预览与服务端导入共用） |
| `src/components/music/` | 播放器 Context / 底部播放条 / 歌手卡片墙 |
| `src/app/admin/music/SongManager.tsx` | 后台歌单管理（含批量匹配的逐条确认面板） |
| `src/app/admin/music/BindDialog.tsx` | 单首「搜索并绑定」对话框（已被 SongManager 引用） |
| `prisma/check-limits.ts` | 上线预检（复用 validations 的 schema，不会与它脱节） |
| `prisma/bind-music.ts` | 自动绑定脚本 |
| `prisma/normalize-usernames.ts` | 整理存量昵称（幂等，有 `--dry-run`） |
| `next.config.ts` | 重定向 + **安全响应头（含 CSP）** |
| `docs/music-plan.md` | 音乐方案的实测记录与设计取舍 |
| `AGENTS.md` | 要求先查 `node_modules/next/dist/docs/` |

---

## 10. 一句话现状

**音乐功能的代码链路已经打通并验证过**（后台绑定 → 前台播放），
剩下的关键一步**只能由用户在真实浏览器里点一遍**（第 7.6 节）；
此外就是 6.3 里「大部分歌没有版权、只能走外链」这个改不掉的事实。
动手前**先出方案、等用户确认**（第 0 节）。

---

## 11. README / License / 免责（2026-10 这一轮）

### 11.1 改了什么

- **新增根目录 `LICENSE`**：标准 MIT 全文 + 一段「补充说明」明确 MIT 只覆盖代码。
  之前仓库里**根本没有 LICENSE 文件**，README 只写了一行 "MIT"。
- **`package.json` 补 `"license": "MIT"`**（之前没有这个字段）。
- **README 的 `License` 一节分成三块**：代码 MIT / 非代码内容保留所有权利 / 第三方依赖。
- **README 新增 `免责声明` 一节**，五条：项目性质、第三方服务、版权与侵权处理、
  部署与使用风险、内容不在开源范围内。
- **README 新增 `在线音乐（清弦）` 一节**：工作方式、播放请求路径、后台绑定流程、已知限制。
- 修正了功能特性、前台页面表、后台功能表、目录结构里过时或缺音乐相关的内容。

### 11.2 这一轮核实的几个事实（别再猜）

- **本仓库是纯代码仓库**：`dev.db`（`*.db`）、`data/uploads/`、
  `public/images/uploads/`、`/video` 全在 `.gitignore` 里，
  用 `git ls-files` 核对过——**真实文章/歌单/照片/简历都不在仓库里**。
  所以免责声明里「内容不在开源范围内」这句是基于事实的，不是防御性措辞。
- **`prisma/seed.ts` 里是模板占位数据**：姓名「张三」、电话 `138-xxxx-xxxx`、
  邮箱 `admin@lankhub.com`、技能「React / Next.js」等，**没有用户的真实个人信息**。
  README 里特意写明这一点，免得外部读者误以为仓库里有真人简历。
- **`/photos/music` 是 `next.config.ts` 里的 308 永久重定向**（→ `/music`），
  所以它不是一个页面目录。README 里那条旧链接说明是准确的，
  用「路由文件是否存在」去核对会误判成缺失。
- **`/admin/settings` 存在但只是 302 跳到 `/settings`**（`redirect()`），
  没有实际页面内容。

### 11.3 已知的、还没处理的遗留

- **README 的「更新部署」下堆了一大段历史升级公告**，是从「加唯一约束」那版起
  逐次累积的 changelog，已经和正文混在一起：新读者会看到几条对他不适用的
  「本次升级不能直接跑 update」警告。建议将来按版本区间限定，或整体移到
  `CHANGELOG.md`。**这一轮按用户选择没有动它。**
- **`src/components/layout/Footer.tsx` 硬编码 `lanknight@qq.com`**，
  而 `/music/disclaimer` 读的是简历资料里的邮箱 → 联系方式仍有**两个真相源**（同 6.5）。
  README 遵守了这个约定：**不在 README 里再硬编码一份联系方式**，
  侵权联系只指向站内 `/music/disclaimer`。
