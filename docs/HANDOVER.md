# 交接文档 · lankHub

> 写给**接手的 AI 助手**。
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
2. **要问的问题一律用「选项工具」弹在聊天框里，不要在正文里手写 A/B/C。**
   用户 2026-10 明确要求：「以后的提问解答等做选这题都采用这种形式」。
   当前会话里可用 `ask_user_question`（一次可带多题、支持多选）；
   每题把**推荐项放第一个**并在标签里标明「（推荐）」，选项说明写清代价。
   正文里只写方案与依据，把要拍板的都收进选项。
3. **每次改完立刻 commit + push 到 GitHub，然后给一份「可以直接复制」的总结。**
   用户原话：「以后修改完了马上同步github并做总结，且总结内容需要我可以直接复制」。
4. **总结的格式**：放在一个代码块里，用 `- 主题` / `    - 细节` 两级，
   每条主题末尾带 `- 已推送 GitHub（commit xxxxxxx）`。**不要用表格。**
5. 用户会自己在服务器上跑命令，并把终端输出贴回来。看到报错先分析再改。

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
  ⚠️ 更严重的是**写**：用 `Get-Content -Raw` + `Set-Content` 改一个带中文的文件，
  会把内容写成非 UTF-8，文件直接变成「invalid UTF-8」再也读不回来（我干过一次）。
  **改文件一律用 edit/write 工具，不要用 PowerShell 管道改内容。**
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

> 更稳的做法（近几轮已统一）：**测试自己建一个临时账号**（`xxx-test@test.local`），
> 提权到需要的角色，`finally` 里删掉。这样完全不碰站长的真实密码。

### 4.3 真实浏览器测试（CDP）的必踩坑

浏览器行为（点击、粘贴、滚动、竞态）只能真浏览器验。我们用 headless Edge +
CDP over WebSocket（Node 24 自带 `WebSocket`，不需要 `ws` 包）。

1. **`next start` 服务的是 `.next` 里的构建产物。** 改完源码不 `npm run build`
   就跑测试，测的是**旧代码** —— 我曾为此白跑一轮，还以为是新逻辑写错了。
2. **不能用「全选 + 删除」清空编辑器。** ProseMirror 会**异步**从 DOM 同步选区，
   「设选区 → 删除 → 粘贴」在同一个 tick 里执行时 PM 用的还是旧选区，
   结果是旧内容没删、新内容插错位置，断言全对不上。**改成每个小节重载页面。**
3. **音频放不出来。** headless 里 `data:` URI 被应用的 CSP 挡
   （`Media load rejected by URL safety check`，**那是正确的安全设计**），
   第三方签名地址又拿不到。音乐相关的浏览器测试因此**只验状态机与 DOM**，
   不验「有没有声音」。
4. **固定端口 + 残留 `next start` = 悄悄在测旧构建。** 上一次的服务器若还占着端口，
   新进程会静默 EADDRINUSE 退出，你连到的是**旧服务器**；构建产物换过之后，
   它记着的 chunk 清单已经过期 → JS 全 404 → **HTML 出来了但永远不水合**。
   现象特别像「代码坏了」（滚轮没反应、按钮 `querySelector` 返回 null）。
   对策：端口**随机**，并把「必须由 JS 才会变的东西」当 canary 断言（见第 29 节）。
5. **判断「滚动结束」不能用「连续两帧位置不变」。** 缓动尾段一两像素要走 100ms 以上，
   那个条件会提前成立 → 下一个输入落在动画还没结束时被锁吞掉，
   看起来像「锁没释放」。用 `scrollend` 事件（实测会冒泡到 `window`）。
6. **Edge 的子进程要用 `taskkill /T /F` 收尾**，`child.kill()` 只杀掉启动器，
   残留实例下次会「接管」新进程、抢不到 DevTools 端口。profile 目录每次也要换新的。
   **`next start` 同理** —— 只 kill 启动器会留下服务进程，下次端口撞上时你连到的
   是**旧构建**：HTML 正常，但 CSS/JS 全是旧哈希 → 整页无样式、永不水合，
   截图与断言全是假象（我在首屏改造里又栽了一次）。截图前务必先断言
   「有一条只有新构建才生效的样式」或「某个只有水合后才会出现的属性」。
7. **整屏文字容器会盖住底部的浮动按钮。** 把 hero 内容区改成 `min-h` 整屏 flex 后，
   带 `z-10` 的它把 `absolute bottom-8` 的向下按钮整个盖住了 ——
   **按钮点了没反应**，是回归断言抓到的。浮动元素要显式 `z-20`。
8. **纯 CSS 循环动画的相位会让截图说谎。** 循环副标题只在 12 秒里的 2 秒可见，
   截图撞在淡出相位时，看起来像「文字对比度不够」，害我白调了两轮底衬。
   **截图前先轮询目标元素的 `opacity > 0.95` 再拍。**
9. **测 CLS 要能归因，否则只能瞎猜。** 可靠套路：`PerformanceObserver` 观察
   `layout-shift`，把 `entry.sources[].currentRect` 打出来 ——「某个容器 x 从 384 变 380」
   一眼就能看出是**滚动条出现导致的可视宽度变化**。再用 CDP
   `Network.setBlockedURLs` 分别屏蔽字体/图片做对照，能立刻排除或坐实怀疑的对象。
   （首页那 0.165 一开始被误判成「书法体换字导致」，屏蔽字体后数字纹丝不动才排除掉。）
10. **测帧率别紧挨着截图。** 截图是同步 PNG 编码，非常吃 CPU；紧接着采 rAF 帧间隔，
    会把它的开销算进去（我测到过假警报 p95 33ms）。**采样前静置 1.5s。**
11. **全屏渐变层只改 opacity 也要先提层。** 月晕那种一整屏径向渐变，每帧改 `opacity`
    会每帧重绘；`will-change: opacity` 提成独立层后，4× CPU 降速下 p95 从 33ms 回到 16.7ms。
12. **位移想跨过屏幕，必须用视口单位。** `translate: 114%` 的百分比是相对**元素自身**算的，
    一只 17px 宽的鸟一辈子只挪 19px —— 当时我以为"鸟不明显"是速度慢，其实它几乎没动。
    跨屏位移用 `vw / vh`。
13. **位图上"擦掉某物"别用就地模糊。** 就地 `blur()` 会把纸纹一起抹平，留下比周围更"平"的
    矩形淡痕。正确做法是**从附近干净区域克隆**（挑一个不含目标物的邻域），
    再用 alpha 斜坡把补丁边缘羽化。
14. **SVG 的 `feGaussianBlur` 做羽化会被滤镜区域裁掉。** 20×20 的小矩形配
    `stdDeviation=7`，渲染出来几乎全透明 —— 补丁等于没贴（我在这上面白跑了两轮）。
    小尺寸羽化直接**生成 alpha 缓冲**最稳。
15. **`radial-gradient(circle 30%, …)` 是非法值。** circle 半径只接受长度，
    百分比只允许用在 `ellipse` 上；写错的话整条 `mask-image` 被丢弃，效果静默消失。
    要按百分比扩散就用 `ellipse 30% 30%`。
16. **`mask-image` 不能写进 `@keyframes`。** 它不可插值，Chrome 会整条忽略。
    正解：遮罩写在基础规则里引用一个 `@property` 注册过的自定义属性，只让那个属性插值。
17. **别对 `src` 跑默认配置的 prettier。** 仓库没有 `.prettierrc`，prettier 默认带分号，
    会把"无分号"的手写风格整体重排。要格式化就手工对齐现有风格。

### 4.4 安全改动的验证要求

涉及限流/鉴权/配额的修复，**必须有能复现攻击的回归测试**，否则以后很容易被
「顺手简化」回去。现有的三套是：`security:xff-test`（伪造 `X-Forwarded-For`）、
`email:code-test` 的并发小节（并发发码只能成功一次）、
`music:upstream-test`（第三方返回畸形数据时的归类）。

### 4.5 「两份真相」的坑

功能涉及**前台渲染**时，改动往往要落在三处：编辑器、存储格式、前台渲染器。
加一个节点类型（例如表格）如果只改编辑器，前台就会走 `renderUnknown` 静默降级。
`src/lib/tiptap-render.tsx` 里 `renderUnknown` 在开发环境会 `console.warn`，
看到那条警告就说明漏了。

---

## 5. 已完成的工作（按主题）

| 主题 | 状态 |
| --- | --- |
| 动效/入场动画、hero 暗色 hover、reduced-motion 补齐 | 完成 |
| **首页滚轮切屏**（顶部下滚 = 点向下按钮，边界上滚回顶） | 完成（见 HISTORY 第 29 节） |
| **首页首屏山水场景（雪山梅花 ↔ 江湖武侠）** | 完成（阶段 2 定稿：夜色 + 行书 + 逐字错落，见 HISTORY 第 30 节） |
| **首屏动态（阶段 A）**：雪落 / 月晕呼吸 / 印章落印 / 鸟飞 / 灯火微闪 | 完成（见 HISTORY 第 31 节）；雾不做，视差与墨晕待下一批 |
| 简历单页/完整版下载（`/resume/print`） | 完成 |
| 编辑器粘性工具栏、文章目录（TOC + 滚动高亮） | 完成 |
| 认证加固：昵称唯一 + trim + 长度、邮箱规范化、登录限流、`as any` 清零 | 完成 |
| 界面精简：后台导航栏收窄、退出登录收进 `/settings`、返回顶部挪到右下 | 完成 |
| 清弦歌单（`/music`）：`Song` 模型、批量粘贴导入、按歌手分组 | 完成 |
| 权限码收敛到唯一真相源（原先有 5 份副本） | 完成 |
| 4 个从未被引用的 zod schema 真正生效（评论/合集/简历/分页） | 完成 |
| 上线前数据预检 `npm run db:check-limits` | 完成 |
| schema 与数据模型的可空性对齐 | 完成 |
| sitemap 补 5 个相册分类页、后台侧栏 SSR 空 `<nav>` 修复 | 完成 |
| **清弦在线播放**（GD音乐台 API + 配额闸门 + 签名地址缓存） | 完成（见第 7 节） |
| **三种播放模式**（顺序/单曲/随机）+ 队列面板 + 沉浸式播放器 | 完成 |
| **切歌竞态修复**（代际标记 + 先 pause）+ 预取下一首 + 失败分流 | 完成（见 4.3） |
| **邮箱验证码 + 密码双路登录**（Resend、单邮箱/单 IP/全站三道配额） | 完成 |
| **安全审计与加固**（XFF 限流绕过、`retry=1` 配额放大、上游形状校验、并发发码锁） | 完成（见 4.4） |
| **编辑器粘贴 Markdown + 表格支持**（粘贴原样保留，点「整理」转换） | 完成（见 4.5） |
| **维护模式、HTTPS 自动化脚本、备份/还原** | 完成（历史见 HISTORY 第 22–27 节） |
| **测试体系**：10 套脚本、约 300 项断言，含 CDP 驱动真实浏览器 | 完成（见第 8 节） |

> 完整的历史叙事（每个版本改了什么、踩过哪些坑）在
> [`HISTORY.md`](HISTORY.md)。本文件只留**现状与上手信息**。

---

## 6. ⚠️ 待办与已知问题（新对话从这里开始）

### 6.1 需要用户人工确认的两件事

这两条**不是缺陷**，是本机环境永远测不到的现场行为，别当成 bug 去"修"：

1. **音乐「真的出声」。** 浏览器端状态机、竞态、失败分流都有 CDP 测试，
   但 headless 放不出声音。请用户实际听一遍（详见 7.6）。
2. **播放地址失效后的自愈路径**（暂停超过约 1 小时）。逻辑已测，现场未验。

### 6.2 用户已明确「暂不做」的事 —— 不要主动去做

- **前台音乐搜索**：刻意不做（会让公开访客无限消耗第三方配额，版权风险也更大）。
- **导航栏加音乐入口**：刻意不做，入口只在首页「兴趣爱好」那一格。
- **Navbar 的 SSR 骨架屏**：刻意不修 —— 它在根布局里，改成服务端读会话会让
  **全站每个页面都变成动态渲染**，代价远大于那一瞬骨架屏。
- **支持周杰伦的音源**：用户选了「不找，就用 netease」。
- **歌手别名表**：用户选了「不做，保持严格」。理由是实测里 `Jay` 那条基本是
  冒用艺名的翻唱，加别名会明显提高错绑风险。

> ⚠️ 「找回密码」原本在这一栏里，**现在已实现**（`/auth/forgot-password`
> + `reset` 场景的验证码）。别再照旧文档把它当成待办。

### 6.3 内容层面的既成事实

**网易云没有周杰伦（杰威尔）的版权**，2021 年就下架了，所以这类歌
**永远无法站内播放**。实测证据在 `docs/music-plan.md`。

用户已决定：**只标「本站无此版本」，不绑翻唱**。前台对未绑定的歌置灰不可点。
这是内容事实，不是代码问题。

### 6.4 已知的、尚未处理的小问题

- `src/components/layout/Footer.tsx` **硬编码了 `lanknight@qq.com`**，
  而免责声明页读的是简历资料里的邮箱 → **联系方式有两个真相源**。
  建议统一（用户当时选择「免责声明用简历里的」）。
- 仓库里还有约 60 个**既有的** ESLint 报错（多为 `any`），都在没动过的文件里。
  约定：只清理改动到的文件，不顺手扩大。
- `src/lib/file-type.ts` 的 `detectFileType`、`src/lib/collections.ts` 的几个常量
  是「导出但没有外部引用」—— 扫描过，属纯清洁度问题，价值很低。
- **音乐大部分歌无法站内播放**的 UI 表达还可以更清楚（用户知晓，未要求改）。

### 6.5 下一轮可以做的（未排期）

- 简历「项目经历」内容更新（文案已备，需在 `/admin/resume` 手工粘贴）
- 更全面的安全审查（管理后台各接口授权、文件上传、`npm audit`）——
  用户说会在宣传前做一次，尚未开始
- **⚠️ 首访 1965KB 里 1476KB 是 `Noto Serif SC` 的中文分片**（21 个 woff2，每个 67–103KB）。
  **既有注释写的「中文由系统宋体兜底」是错的** —— 中文实际由网页字体渲染，
  这也是首访 LCP 3156ms（冷缓存 + Slow 4G + 4× CPU）的主因。
  本轮只做了零视觉变化的清理（删掉无人使用的 `Geist` 与 900 字重、去掉重复 preload），
  已经从 3872ms 降到 3156ms。**要进 2s 内必须改字体方案**（去掉 webfont → 中文回落系统宋体），
  那会改变全站中文观感，需用户点头，未擅自做。

---

## 7. 音乐功能专题（接手的必读）

### 7.1 数据源的真实能力（**与最初的设想不一致**）

最初的需求文档说「稳定音源：netease、kuwo、joox」，
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

### 7.6 从未在真实浏览器里听过声音

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

### 8.1 日常检查

```bash
npx tsc --noEmit                 # 类型检查（删了路由后要先 build 重建 .next/types）
npx eslint <文件...>             # 只 lint 改动到的文件，不顺手扩面
npm run build                    # 生产构建（含 prisma generate）
npm run db:state                 # 看库里有什么；加 --clean 清掉测试残留
npx tsx prisma/check-limits.ts    # 上线前只读预检
```

### 8.2 测试套件（改完代码按需跑）

| 命令 | 覆盖 | 规模 |
| --- | --- | --- |
| `npm run email:code-test` | 验证码：冷却、三道配额、用后即焚、并发重放、并发发码 | 61 |
| `npm run security:xff-test` | 客户端 IP 解析（XFF 伪造防线） | 18 |
| `npm run editor:markdown-test` | Markdown 判定/改写/清洗、纯文本判定、原文往返 | 52+ |
| `npm run music:order-test` | 播放顺序纯函数（含 `peekNextSong` 只看不改） | 29 |
| `npm run music:shuffle-test` | 随机播放起点随机性 | 8 |
| `npm run music:error-code-test` | `/api/music/play` 错误码分类 | 12 |
| `npm run music:upstream-test` | 第三方响应形状校验（mock 畸形数据） | 17 |
| `npm run auth:session-test` | JWT 会话失效 | 10 |
| `npm run ui:check` | 页面渲染与交互 | 35 |
| `npm run ui:settings` | `/settings` 三个入口 + 改密码双路 | 32 |
| `npm run email:check` | 邮件自检 + **全仓库密钥扫描** | 31 |
| `npm run editor:markdown-ui` | **真实浏览器**：粘贴后点「整理」→ h2/table/pre 等 | 42 |
| `npm run music:ui-check` | **真实浏览器**：切歌竞态、加载态 | 核心断言过；5 项已知时序敏感 |

> `email:check`、`ui:check`、`editor:markdown-ui`、`music:ui-check`、`ui:settings`
> 需要应用在跑。前几个脚本会**自己起服务**，`email:check` 与 `ui:check` 需要先手动起。

### 8.3 部署与运维

```bash
npm run update                   # 一键更新：备份 → pull → npm ci → 重建原生模块 → 迁移 → build → 重启
npm run backup                   # 只备份
npm run restore                  # 还原
npm run db:cleanup-unverified    # 清理未验证且超期的账号
npm run db:cleanup-codes         # 清理过期验证码
npm run db:bind-music            # 自动绑定未绑定的歌（加 -- --dry-run 先预览）
npm run reset-password           # 重置某个账号的密码
npm run maintenance:on/off       # 维护模式
npm run https:on/redirect/off    # HTTPS 三步
```

> ⚠️ **`npm run update` 里的 `db:migrate` 只做 `db push` + `generate`。**
> 历史上它还会跑一次「把未验证账号标记为已验证」的一次性迁移脚本，
> 2026-10 已删除 —— 那个脚本每次部署都会执行，而邮箱验证上线后它等于
> **把新注册但未验证的账号静默放行**。

### 8.4 本地数据

本地 `dev.db` 的状态：用户 2 个（`#1 站长 admin@lankhub.com OWNER`、
`#2 user-2 test@test.com READER`）、文章 2 篇、其余基本为空。
**验证脚本要记得清理自己造的数据**；`npm run db:state -- --clean` 可兜底。

---

## 9. 关键文件地图

| 路径 | 说明 |
| --- | --- |
| `src/lib/permissions.ts` | **权限码唯一真相源**。刻意不导入任何东西，客户端也能引用 |
| `src/lib/auth-helpers.ts` | 服务端鉴权（`getCurrentUser` / `requireOwner` / `requireOwnerUser` / `requirePermission`） |
| `src/lib/validations.ts` | 所有 zod schema，含 `z.config(z.locales.zhCN())` 让类型错误也说中文 |
| `src/lib/music-api.ts` | 音乐接口客户端（配额闸门、缓存、重试、上游形状校验） |
| `src/lib/music-match.ts` | 歌名/歌手匹配（保守策略） |
| `src/lib/play-order.ts` | 播放顺序纯函数（顺序/单曲/随机 + `peekNextSong`） |
| `src/lib/lrc.ts` | LRC 解析 |
| `src/lib/rate-limit.ts` | **滑动窗口限流 + 客户端 IP 解析**（XFF 防线，改动前先读注释） |
| `src/lib/email/verify-code.ts` | 验证码生成/校验/配额/并发锁 |
| `src/lib/markdown-paste.ts` | Markdown 判定、外链图片改写、安全清洗、纯文本往返 |
| `src/components/music/` | 播放器 Context / 底部播放条 / 歌手卡片墙 / 沉浸层 / 队列面板 |
| `src/components/editor/` | 富文本编辑器（TipTap）、工具栏、「整理 Markdown」 |
| `src/components/home/hero-paging.ts` | 首屏滚轮切屏：边界判定、锁（`scrollend` + 700ms 兜底）、reduced-motion 降级 |
| `src/components/home/hero-scene.ts` | 首屏场景参数：场景名、宽限/停留时长、素材路径、**逐字错落节奏表** |
| `src/components/home/HeroScene.tsx` | 一层场景（底图 `<picture>` + 夜色叠层 + 文字底衬），纯展示 |
| `src/components/home/HeroType.tsx` | 把 CJK 逐字拆开套节奏表；拉丁整段不拆（中文题字 + 英文署名） |
| `src/components/home/use-hero-scene.ts` | 场景状态机：写 `<html data-hero-scene>`、悬停（热区=主标题）宽限/停留、触屏轻点（热区=整屏） |
| `src/components/home/use-hero-motion.ts` | 首屏动态的开关：离屏/切标签时给 `<html>` 打 `data-hero-motion="paused"` |
| `public/images/home/` | 首屏派生图（WebP）：桌面 1672 宽 ×2、手机竖版 780 宽 ×2；源图在 `docs/photo/homeBannerAssets/` |
| `public/fonts/hero-zhi-mang-xing.woff2` | 首屏行书**按字子集**（13KB）。⚠️ 改首屏文案要重新生成，见 HISTORY 第 30 节 |
| `src/lib/tiptap-render.tsx` | **前台正文渲染**（服务端，含表格分支）；加节点类型要同步改这里 |
| `src/app/admin/music/SongManager.tsx` | 后台歌单管理（含批量匹配的逐条确认面板） |
| `prisma/check-limits.ts` | 上线预检（复用 validations 的 schema，不会与它脱节） |
| `prisma/bind-music.ts` | 自动绑定脚本 |
| `next.config.ts` | 重定向 + **安全响应头（含 CSP）** |
| `docs/music-plan.md` | 音乐方案的实测记录与设计取舍 |
| `docs/CHANGELOG.md` | **面向用户的变更记录**：每次升级要注意的事 + 「适用对象」 |
| `docs/HISTORY.md` | **开发历史**：逐版本叙事与踩坑记录（日常不需要读） |
| `AGENTS.md` | 要求先查 `node_modules/next/dist/docs/` |

---

## 10. 一句话现状

站点**已完整上线并长期稳定运行**（<https://www.lankhub.xyz/>）：文章/合集/评论/
相册/拾章/在线简历 + 后台 CMS，双重登录（密码 / 邮箱验证码），清弦在线音乐，
维护模式与 HTTPS 自动化脚本，10 套测试约 300 项断言（含真实浏览器端到端）。

**首页首屏**（2026-10 这一轮）：雪山梅花（正常态）↔ 江湖武侠（悬停主标题）两套水墨场景，
行书题字 + 逐字错落、朱砂印章、随场景反色的导航栏；滚轮在顶部一格即切到「关于我」。
四档视口无横向溢出、CLS 0；热缓存 LCP 0.2s，首访冷缓存 + 弱网 3.1s（受既有中文字体拖累）。
最终验收 31 项全过（18 项滚轮回归 + 11 项无障碍/SEO/资源 + 2 项触屏）。

**两条长期未人工确认的事实**（不是缺陷，是缺现场验证）：

1. **音乐「真的出声」从未在真实浏览器里确认过。** 浏览器端状态机、竞态、
   失败分流都有 CDP 测试覆盖，但 headless 环境放不出声音（CSP 挡 `data:`、
   拿不到第三方签名地址）。请用户实际听一遍（第 7.6 节）。
2. 播放地址是短时签名的，暂停很久再继续会走 `retry=1` 自愈路径，
   这条路径同样只做过逻辑验证。

动手前**先出方案、等用户确认**（第 0 节）。

---

