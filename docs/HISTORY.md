# 开发历史（v0.1.0 ~ 当前）

> 这份文件是**逐版本的开发叙事**，从 `docs/HANDOVER.md` 拆出来，内容保持原样。
>
> 什么时候该读它：想知道「当初为什么这么做」、「某个坑是怎么发现的」、
> 或者要动一块看起来莫名其妙的代码时。**日常接手不需要读它** ——
> 现状与上手信息都在 [`HANDOVER.md`](HANDOVER.md)。
>
> ⚠️ 文中引用的 `docs/emailAuthDevDoc.md` 与 `docs/musicFunctionDevDoc.md`
> 已在 2026-10 删除（前者是早已实现且失效的方案稿，后者是原始需求原文，
> 结论已收进 `HANDOVER.md` 与 `music-plan.md`）。那些链接现在是死链，
> 内容可从 git 历史取回。

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

- **`src/components/layout/Footer.tsx` 硬编码 `lanknight@qq.com`**，
  而 `/music/disclaimer` 读的是简历资料里的邮箱 → 联系方式仍有**两个真相源**（同 6.5）。
  README 遵守了这个约定：**不在 README 里再硬编码一份联系方式**，
  侵权联系只指向站内 `/music/disclaimer`。

> 「README 里历史升级公告堆积」这条遗留**已在第 12 节处理完毕**。

---

## 12. 升级公告搬到 docs/CHANGELOG.md（2026-10 这一轮）

### 12.1 做了什么

- **新增 [`docs/CHANGELOG.md`](CHANGELOG.md)**：把 README 里那约 90 行（实义 63 行）
  升级公告**一字不减地**搬过来，重排成按时间倒序的版本条目。
- **README 的「更新部署」一节**从 90 行压到 18 行：保留 `npm run update` 说明、
  备份机制、以及一句指向 CHANGELOG 的指引。
- **每条公告补了「适用对象」**，用来回答「这条对现在的我有意义吗」。
  最典型的是加唯一约束那条：原文只说「本次升级不能直接跑 update，会中途失败」，
  在当时是对的，但**对新库是纯噪音**，所以现在明确标注「已不适用于当前版本」。
- **补了 0.x 版本号**：v0.1.0 ~ v0.6.1，并给每条标注对应的 commit 短哈希。
- **[`docs/musicFunctionDevDoc.md`](musicFunctionDevDoc.md) 纳入版本控制**，
  并在顶部加了一段「与实测不符之处」对照表（原文一字未改）。
- README 的 `docs/` 说明、License 里的「docs 下的全部文档」、可用命令表
  （补上此前漏掉的 `npm run reset-password`）一并修正。

### 12.2 版本号与 commit 的对应（别再重新考据）

| 版本 | 日期 | 主题 | commit |
| --- | --- | --- | --- |
| v0.6.1 | 2026-10-07 | 后台歌单绑定界面接线 + 修三个缺陷 | `d858f1d` |
| v0.6.0 | 2026-10-07 | 清弦接入在线播放 | `51e1cb8` → `df157bf` |
| v0.5.1 | 2026-10-06 | schema 与数据模型可空性对齐 | `9761625` |
| v0.5.0 | 2026-10-06 | 清弦改造成歌单页；zod schema 生效 + 预检 | `b583d36`、`1307e3f`、`71258d2` |
| v0.4.0 | 2026-10-05 | ⚠️ 昵称唯一约束；/settings 与退出登录统一 | `a3fdc19`、`2ab8d76` |
| v0.3.0 | 2026-10-01 | 简历下载拆两版 + 清获奖荣誉死数据 | `0079ed1` |
| v0.2.0 | 2026-09-18 | 发布文章强制归属合集 | `fcbb96a` |
| v0.1.0 | 2026-06-27 | 首个可用版本 | `99689d5` |

版本号是**这次整理时按提交主题归并的**，不是历史上真实发布过的号。
`v0.1.x` 那段只有时间线（`2026-06-29` ~ `2026-07-27`），因为当时没有存量部署、也就没有升级公告。

### 12.3 三个容易踩的地方

1. **别用「行数/字数变少」判断有没有丢内容。** 这次搬移的验收方式是把搬移前的
   README 从 `git show <commit>:README.md` 取出来，与 CHANGELOG 都做归一化
   （去引用前缀、去 `**` 与反引号、压缩空白）后**逐行比对**，63 行实义内容
   必须每行都能找到。第一次跑就抓出 4 行「获奖荣誉」的解释被我改写成了摘要 ——
   命令还在，但解释丢了，已改回原文。
2. **`Get-Content` 读 UTF-8 会乱码**（第 3.5 节记过），这次核对 `docs/original-todo.md`
   时又踩了一次：`Get-Content` 显示成「鍘?todo.md 宸茶縼绉昏嚦」，用 read 工具才正常。
3. **`docs/original-todo.md` 是被 git 跟踪的**（不是未纳管文件），
   所以 README 的 License 那节写「`docs/` 下的**全部**文档」才是准确的，
   原来写「方案与交接文档」会漏掉它。

---

## 13. v0.7.0：歌单删掉外链、录入改成「搜索添加」（2026-10）

### 13.1 用户的原话与动机

> 「现在是可以导入文本添加音乐，接着搜索绑定，我想这既如此，不如直接做一个搜索添加功能，
> 这样音乐的作者这些就不需要自己分类，外链也不需要等等」
>
> 「搜索会出现一些选项，可以选择，如果没有想要的音乐就不添加这首音乐」
>
> 「我的意思是外链直接删掉」

### 13.2 最终确定的四个决定

1. **外链彻底删除**：字段 + 后台界面 + 前台的「去别处听」退路，全部清掉
   （需要 `db push --accept-data-loss`）
2. **搜索添加替掉粘贴导入**，但**保留一个精简的手动添加**（只有歌名 + 歌手），
   留给源站确实没收录的歌
3. **同时用歌名与歌手搜索**，用歌手字段比对，给可疑结果标「疑似翻唱」
4. **疑似翻唱全部显示、只加徽标**，不隐藏

### 13.3 改了什么（文件级）

| 动作 | 路径 |
| --- | --- |
| 删列 | `prisma/schema.prisma` 的 `Song.link` |
| 新增 | `src/app/api/admin/music/add/route.ts`（幂等建记录，只收歌名歌手） |
| 新增 | `src/app/admin/music/SearchAddDialog.tsx` |
| 新增 | `src/lib/music-bind-client.ts`（两个对话框共用的绑定逻辑） |
| 删除 | `src/app/api/admin/music/import/route.ts`、`src/lib/music.ts` |
| 删除 | `SongImportSchema`、`SongLinkSchema`、`validations.ts` 里的 `isSafeUrl` 导入 |
| 改 | `/search` 回传 `credible` / `titleExact` / `inLibrary` / `bound`，接受 `artist` 参数 |
| 改 | `/bind` 新增「提交的版本必须来自当前搜索结果」校验 |
| 改 | `SongManager.tsx`（去 Tab 与粘贴、精简手动添加、接入搜索添加） |
| 改 | 前台四处去外链 + 未绑定置灰（`play/route.ts`、`music/page.tsx`、`ArtistGrid`、`player-context`、`PlayerBar`） |

### 13.4 两个在实现中才发现、值得记住的点

1. **徽标判据不能只看歌手。** 一开始我只比对歌手字段，结果搜「晴天 周杰伦」时
   **《刀马旦》被判成「可信」** —— 它的歌手字段写着「周杰伦 / 李玟」，
   歌手对得上，但歌名根本不是「晴天」。
   最终判据是 **歌名精确相同 且 歌手可信**，与 `matchSong` 会不会绑它的结论保持一致。
   （回归断言已写进验证脚本：歌名不同的条目一律不得判为可信。）
2. **`/bind` 里不能用 `loaded[0]`。** 上一轮给 `/bind` 加了 `markNoMatch` 参数，
   而它**在处理 items 之前**先跑，`loaded` 又是跨请求累积的 ——
   用下标取封面会拿到别的歌的。现在按 `songId` 查。

### 13.5 新增的 `/bind` 校验（会影响配额）

`/bind` 现在会为每个 item 花 **1 次搜索**去校验「这个 apiId 确实属于这首歌」。
理由是后台允许改歌名与歌手：改完之后如果还点着一个**旧的**对话框，
就会把 A 歌的 apiId 写进 B 歌，前台放出一首毫不相干的歌。

- 同批里同名同歌手的会去重，只搜一次
- 合法入口（搜索添加、单首绑定）提交的 apiId 本来就来自刚搜的结果，不会误伤
- 因此「搜索添加并绑定」一首歌的总消耗是 **4 次**（搜索 + 校验 + 封面 + 歌词），
  不是 3 次。界面上的配额提示已按 4 次写。

### 13.6 验证

26 项端到端 + 17 项渲染断言全过；测试数据与临时改的站长密码都已还原，
其它表行数逐张核对未变。关键几条：

- `Song` 表已无 `link` 列（`pragma table_info` 核对）
- 搜「演员 薛之谦」原版（专辑「绅士」）判为可信并能绑定，封面与歌词都入库
- 搜「晴天 周杰伦」歌名精确相同的 4 条**全部**判为不可信；《刀马旦》因歌名不符也不是可信
- 编造的 apiId 被 `/bind` 拒掉，且库里 apiId 仍为空
- 未绑定的歌 `/api/music/play` 返回 409，响应里**没有** `fallback` 字段
- 旧导入接口 POST 返回 405（路径被 `[id]` 动态路由接住，同样说明接口已不存在）
- 前台产物里已无「去别处听」；后台产物里有「疑似翻唱」「添加并绑定」

---

## 14. v0.8.0：听歌要求登录 + Nginx 前置限流（2026-10）

### 14.1 用户的需求与原话

> 「我打算做流量控制，包括不限于在听音乐上面做一个需要登录才能听」

讨论后确认的四点：

1. **注册继续开放**，「只要登录就能听」
2. **不新增权限码** —— 目标是「挡住没登录的人」，不是限制登录用户听多少
3. **登录后不限量**（用户原话：「可以无限，我只是想挡住没有登录的人」）
4. Nginx 前置限流一起做；`/music/disclaimer` 保持公开

### 14.2 改了什么

| 位置 | 改动 |
| --- | --- |
| `src/app/music/page.tsx` | 未登录 `redirect("/auth/login?callbackUrl=/music")`，**放在查库之前** |
| `src/app/api/music/play/route.ts` | 加 `requireAuth()`，**放在限流与查库之前**；按 IP 限流 30 → 60 次/分钟 |
| `src/lib/permissions.ts` | 顶部与 `canAccessAdmin` 各加一段警示注释（见 14.4） |
| `README.md` | Nginx 配置加 `limit_req_zone` / `limit_conn_zone`，并新增「限流生效的验收方法」 |
| `docs/CHANGELOG.md` | 新增 v0.8.0 条目 |

### 14.3 两个关键设计点（别改错顺序）

1. **登录校验必须放在查库 / 消耗配额之前。**
   如果先查库再判断登录，「要求登录」就只是前端遮罩 ——
   直接请求接口照样能读到全量歌单。
2. **401 而不是 403。** 前端据此区分「你该登录」与「你没权限」。

### 14.4 那个没触发、但必须记住的坑

`canAccessAdmin()` 的判据是「拥有**任意一个**权限码」：

```ts
return parsePermissionList(user.permissions).length > 0
```

而 `PERMISSIONS` 里现在全是**内容权限**（article / photo / poem）。
**将来要加非内容类权限（播放、下载、导出…），必须先改 `canAccessAdmin`**
（例如给每项加 `contentAdmin` 标记、只认带标记的），
否则那个账号会**静默获得进入 `/admin` 的资格**。

本轮讨论时差点踩上：曾计划给「听歌需登录」加一个 `music` 权限码，
那样「只能听歌」的账号就能进后台了。最后没加（听歌只要求登录），所以没触发。

站长选择了「只加警示注释」而不是结构性改造 —— 这属于**潜在隐患**而非**现存错误**。

### 14.5 验证时踩的坑：内存限流桶是跨请求持续的

`src/lib/rate-limit.ts` 的桶存在进程内存里，**不会**因为一次脚本跑完而重置。
验证脚本第 5 步会故意把 `music:play` 桶打满（70 次），
于是**连续跑两次必然失败**：第二次一上来就全是 429，
看起来像「登录后也拿不到播放地址」这种严重问题（我确实被自己骗了一次）。

**复跑前必须重启服务**（或等 60 秒窗口过去）。这一点已写进验证脚本头部。

### 14.6 验证结果

18 项断言全过：

- 未登录 `/music` → **200 + meta refresh** 形式跳转（不是 3xx，交接文档第 4 节记过这个坑），
  且 `callbackUrl=/music`；**页面里拿不到歌名**
- 未登录 `/api/music/play` → **401「请先登录」**，响应里没有 `url`
- `/music/disclaimer` **仍然公开**且内容完整渲染
- 登录后：页面能开、内容渲染、能拿到签名播放地址
- 限流阈值：70 次请求里 59 次通过、11 次 429（59 + 1 次前面的成功播放 = 60），
  `404 + 429 = 70` 总数吻合

### 14.7 仍待人工确认

- **Nginx 配置没有在本机验证过**（本机没有 Nginx，且 curl 访问 HTTPS 会失败，见 3.4）。
  README 里给了验收方法，需要用户在服务器上执行并回贴结果。
  重点看**第 2 条**：正常浏览 30 次必须全是 200，出现 429 就是设得太紧 ——
  误伤访客比限流失效更值得警惕。
- 真实浏览器里点一遍：未登录访问 `/music` 应跳登录页，登录后应跳回 `/music`。

---

## 15. v0.9.0：播放全部 / 三种播放模式 / 播放列表面板（2026-10）

### 15.1 用户的需求与原话

> 「我打算继续完善，包括不限于可以选择整个歌单所有歌手的歌一起放进播放列表播放，
> 单曲循环，顺序播放，以及随机播放」

讨论后确认：

1. **只做三个模式**：顺序播放 / 单曲循环 / 随机播放（用户没要「列表循环」）
2. **「播放全部」只在卡片墙上方一个按钮**（不要第二行、不要额外列表视图）
3. 模式切换与播放列表都收在**底部播放条**上
4. 不可播的歌**自动跳过并标出数量**
5. 顺手记住播放模式与当前曲；顺手把播放条拆成小组件

### 15.2 改动文件

| 动作 | 路径 |
| --- | --- |
| 新增 | `src/lib/play-order.ts`（模式循环、洗牌、`resolveStep` 纯函数） |
| 新增 | `src/components/music/QueuePanel.tsx`（向上弹出的播放列表） |
| 新增 | `src/components/music/LyricsDrawer.tsx`（从 PlayerBar 原样拆出） |
| 改 | `src/components/music/player-context.tsx`（模式、随机顺序、历史、持久化） |
| 改 | `src/components/music/PlayerBar.tsx`（接入模式按钮与两个面板） |
| 改 | `src/components/music/ArtistGrid.tsx`（播放全部 / 随机播放 + 不可播计数） |

### 15.3 三个容易做错的地方（都已避开，别改回去）

1. **随机播放不能写成「每次随机抽一首」。** 那样同一首可能连着出现两次，
   而且「上一首」会抽到一首**新的**随机歌，按了等于没返回。
   现在先洗好一副顺序再顺着走，并记播放历史 —— 一轮内每首恰好一次，
   「上一首」真的回到刚才那首。
2. **单曲循环不能塞进 `step()`。** 手动点「下一首」在单曲循环下**仍然应该换歌**，
   只有**自动播完**才重播同一首。所以它由 `onEnded` 单独处理。
3. **顺序播放走到两端要「停」，不是回到另一头。** 回到另一头那是「列表循环」，
   用户明确没要这个模式。

### 15.4 两处 lint 告警不是噪音，是 React 19 的真规则

调试时被 `eslint` 拦了两次，两处都不能靠 `eslint-disable` 糊过去
（项目里别处也都避开了这类写法）：

1. **`react-hooks/set-state-in-effect`**：不能在 effect 里同步 `setState`（会触发级联渲染）。
   → 持久化初值改用 **lazy initializer** `useState(readPersisted)`，
   顺带消掉了「先渲染默认值再跳成上次值」的闪烁。
   `readPersisted()` 里加了 `typeof window === "undefined"` 的守卫，服务端返回 null。
2. **`react-hooks/refs`**：**不能在渲染期读 ref**。
   → 「是否已恢复」与「要恢复哪首」都改成 **state**，
   这样「渲染期调整 state」那个官方模式才成立（用 ref 会被规则拦下）。

### 15.5 验证方式与能力边界（重要）

- **`resolveStep` 是纯函数，这是这次的关键设计**：3 个模式 × 前进/后退 ×
  边界（首尾、单曲、空队列、当前歌不在队列里）全部能直接跑断言，
  共 **23 项**。这段逻辑靠手点根本点不全，且出错时表现为「偶尔跳过一首」。
- 渲染与产物层 **24 项**：`/music` 上的「3 首可播放 / 2 首暂不可播，已跳过」、
  产物里有三种模式名与「播放列表 / 正在播放」、源码里控件的 `aria-label`、
  两个面板互斥、播放全部只收可播的歌。
- ⚠️ **交互本身没有验证过**：本机没有可点的浏览器，所以「点模式按钮真的会切」、
  「点列表里某一首真的会跳播」、「刷新后真的恢复」都只验到源码与产物层面。
  需要人在浏览器里点一遍，重点看：
  1. 模式按钮连点三下，图标是否依次变成 顺序 → 单曲 → 随机
  2. 「播放全部」是否从第一首开始、放完最后一首是否**停住**
  3. 随机模式下「上一首」是否回到刚才那首（而不是跳到别处）
  4. ~~刷新页面后模式与曲目是否恢复~~ —— **v0.9.1 已把这个功能删掉**，不用验了
  5. 同时打开歌词与播放列表时是否重叠（应互斥或避让）

> ⚠️ 15.4 里那两处 lint 修法**在 v0.9.1 被连带删除了**（持久化整个移除），
> 但规则本身仍然有效：**别在 effect 里同步 setState，也别在渲染期读 ref**。

---

## 16. v0.9.1：沉浸式听歌界面 + 删掉「记住播放状态」（2026-10）

### 16.1 用户的需求与原话

> 「对于刷新页面 —— 模式与曲目是否恢复，且处于暂停状态没用，我打算直接删掉功能，
> 这点不是很刚需；另外我打算做一个沉浸式听音乐的功能，打算就直接在点击出现歌词的
> 那个按钮上面做修改……点击后会跳转新界面，左边是唱片，右边是歌词，
> 下面是功能按钮像是暂停下一首还有列表等等」

确认后的五点：**不换路由**（全屏层）、**浅色水墨**（不铺黑）、**左右分栏 + 窄屏堆叠**、
**行级高亮 + 滚动居中**、**持久化全删**。

### 16.2 ⚠️ 这一节最重要的一条：为什么不能用新路由

`PlayerProvider`（唯一那个 `<audio>`）挂在 **`/music` 页面内部**，不在根布局：

```tsx
// src/app/music/page.tsx（第 110 行附近）
<PlayerProvider>
  <ArtistGrid groups={groups} />
  <PlayerBar />
</PlayerProvider>
```

**换到另一个路由会把 `/music` 这棵子树整个卸载 → `<audio>` 被销毁 → 正在放的歌当场停。**
这是 React 的机制，不是取舍。

想「跳转新界面」只有两条路：

| 做法 | 后果 |
| --- | --- |
| 全屏层（**当前选择**） | 播放绝不中断；但没有独立 URL，后退键不退出沉浸式（已给关闭按钮 + Esc） |
| 把 `PlayerProvider` 提到根布局 | 可做真路由，且**顺带解决「切到别的页面音乐就停」**；代价是每个页面都挂播放器上下文，还要处理「根布局不该无脑渲染播放条」 |

**将来若想走第二条**：把 provider 移到 `src/app/layout.tsx`，`/music` 页面只留
`ArtistGrid`，播放条改成「有 current 才渲染」。根布局是服务端组件、provider 是客户端组件，
包一层即可（现在就是这么用的）。

### 16.3 改了什么

| 动作 | 路径 |
| --- | --- |
| 新增 | `src/components/music/ImmersivePlayer.tsx`（全屏层：唱片 + 歌词 + 控制） |
| 新增 | `src/components/music/ModeButton.tsx`（播放条与沉浸层共用，避免两处各写一遍） |
| 改 | `src/components/music/PlayerBar.tsx`（`⌃` 按钮开启沉浸层；模式按钮改用共用组件） |
| 改 | `src/components/music/player-context.tsx`（**删掉全部持久化**） |
| 改 | `src/app/globals.css`（`disc-spin` 关键帧 + 显式 reduced-motion 降级） |

### 16.4 一个容易漏的动效降级细节

全局的 `prefers-reduced-motion` 规则（globals.css 第 88 行附近）只把
`animation-duration` 压成 `0.01ms` 并让 `iteration-count: 1`。
对 `infinite` 动画来说，这会让它**以极快速度空转**（视觉上看不见，但动画仍然占着）。

所以唱片额外写了一条：

```css
@media (prefers-reduced-motion: reduce) {
  .animate-disc-spin { animation: none !important; }
}
```

**新增任何无限循环动画时都要照这个办**，否则降级模式下会留下一个「空转」的怪东西。
（`hero-subtitle-cycle` 是同样的处理思路，见 globals.css 第 226 行附近。）

### 16.5 删掉的持久化（别再"顺手加回来"）

v0.9.0 曾用 localStorage 记住「模式 + 当前曲 + 进度」，v0.9.1 **整个删除**。
理由是站长实测后认为「刷新后恢复且处于暂停」没有价值 —— 刷新后本来也得手动点一次播放。

连带删掉的东西（哪天要恢复，这些都得一起回来）：lazy initializer 读初值、
每 5 秒的写盘定时器、为「渲染期调整 state」而引入的 `restored` 状态与
`pendingPosition` ref。**`player-context.tsx` 里现在不该出现 `localStorage`。**

### 16.6 验证结果与能力边界

28 项断言全过，分四类：

1. **持久化确实已删**：provider / 播放条 / 沉浸层里都搜不到 `localStorage`，
   也没有 `STORAGE_KEY`、`readPersisted`、`restoreSongId`、`setInterval` 残留
2. **沉浸层结构齐备**：`fixed inset-0`、`role="dialog"`、`aria-modal`、
   滚动锁、Esc / 方向键 / 空格（且空格避开输入框）、
   桌面 `md:flex-row` + 窄屏 `flex-col`、旋转与 `animation-play-state:paused`、
   纯 CSS 黑胶、歌词 `data-line` + `scrollTo`、复用 `ModeButton`
3. **动效降级**：`@keyframes disc-spin` 存在，且 reduced-motion 下显式 `animation: none`
4. **页面与产物**：`/music` 仍 200 且卡片墙/播放全部正常；
   「退出沉浸式」「在页面内看歌词」「这首歌暂时没有歌词」「沉浸式歌词」都进了客户端产物

⚠️ **交互本身仍然没有验证过**（本机没有可点的浏览器）。需要人在浏览器里点：

1. 点 `⌃` 是否进入全屏；此时**歌是否继续放**（**最关键的一条** —— 证明全屏层没打断播放）
2. 唱片是否在转；**暂停时是否停转**
3. 歌词是否跟着滚动居中；切歌后歌词是否换成新的
4. `Esc` 是否能退出；`←`/`→` 是否切歌；`空格` 是否播放/暂停
5. 窄屏（手机宽度）下是否变成上下堆叠、有没有被挤变形
6. 打开系统「减少动态效果」后，唱片是否静止（而不是诡异的快速抖动）
7. 沉浸层底部的「在页面内看歌词」是否能切回底部那个抽屉

> ⚠️ 上面第 7 条**已在 v0.9.2 删除该入口**（改为播放条上一个独立按钮），见第 17 节。

---

## 17. v0.9.2：修掉沉浸层的两个真 bug + 两处改进（2026-10）

站长实测反馈四条：暂停后唱片还在转；歌词不滚动也不居中；唱片要再大一倍；
「在页面内看歌词」改为放回。**前两条都是我实现里的真 bug。**

### 17.1 ⚠️ Bug 一：暂停不停转 —— CSS 规则顺序（最容易再犯）

我原本用「两个类」实现暂停：

```tsx
playing ? "animate-disc-spin" : "animate-disc-spin [animation-play-state:paused]"
```

看起来没问题，但两条规则**特异性相同（都是单类）**，谁生效取决于**打包顺序**。
实测产物里：

```css
.\[animation-play-state\:paused\]{animation-play-state:paused}   /* 先 */
.animate-disc-spin{animation:24s linear infinite disc-spin}      /* 后 → 胜出 */
```

后出现的那条 `animation` **简写**（`animation` 是简写，会重置所有子属性，
包括 `animation-play-state`）把暂停覆盖掉了。

**修法**：暂停收进同一个 class。

```css
.animate-disc-spin { animation: disc-spin 24s linear infinite; }
.animate-disc-spin.is-paused { animation-play-state: paused; }
```

**教训（要记住的通用规律）**：**不要用两条独立的类去争同一个 CSS 属性** ——
Tailwind 工具类与 globals.css 里的自定义类的先后顺序不受你控制。
让「基础 + 变体」落在同一个选择器族里，顺序就恒定。

### 17.2 ⚠️ Bug 二：歌词不滚动 —— `flex-1` 缺 `min-h-0`

歌词容器的 class 原来是：

```
min-h-0 w-full flex-1 overflow-y-auto py-4 md:py-10
```

**少了 `min-h-0`**（同一个元素上既有 `flex-1` 又有 `overflow-y-auto`）。
在 flex column 里，`flex-1` 的默认 `min-height:auto` 会让元素被内容撑开，
于是容器**根本没有溢出**，`scrollTo` / `scrollIntoView` 什么也不做。

配套的第二个问题：**留白不够**。即使能滚，滚到顶就是极限 ——
第一行与最后一行永远无法居中。

**修法**（沉浸层与底部抽屉都改了）：

1. 容器加 `min-h-0`，真正填满可用空间、产生溢出
2. 上下留白按**实测容器高度的一半**算（`ResizeObserver`），任何一行都能居中
3. 用 `scrollIntoView({ block: "center" })` 而不是自己算 `offsetTop`
4. 依赖数组里带 `lyricLines` —— 切歌时当前行可能仍是第 0 行，`activeIndex` 没变，
   effect 不会重跑，得靠歌词本身变化把它带起来

**教训**：`overflow-y-auto` + `flex-1` 忘了 `min-h-0` 是 flexbox 的经典坑，
表现就是「滚动条永远不出现、程序化滚动无效」。**遇到「滚动没反应」先查这个。**

### 17.3 我上一轮为什么没发现

**我只验了源码里写了 `[animation-play-state:paused]`，没验构建产物里它是否真的生效。**
这一轮的断言改成直接读 `.next` 里的 CSS，比对两条规则的**下标先后**，
并确认旧写法已从产物中消失。**涉及 CSS 覆盖/顺序的问题，必须验产物，不能验源码。**

（顺带记一个断言写法坑：我第一版断言「代码里没有旧写法」时搜的是整份文件，
结果命中了**我自己写的解释性注释**。要排掉块注释再搜。）

### 17.4 两处改进

- **唱片放大**：桌面 `md:w-[26rem] lg:w-[30rem]`（原 16rem/18rem），
  窄屏 `w-52 sm:w-64`。**只在桌面放到最大** —— 窄屏是上下堆叠，唱片太大会把歌词挤没
- **歌词入口放回播放条**：删掉沉浸层里那行小字，播放条上重新有独立的歌词按钮。
  现在两个入口都能直达：`ListMusic` → 底部抽屉，`ChevronUp` → 沉浸层

### 17.5 验证结果

22 项断言全过，其中**直接读产物 CSS** 的关键几条：

- 产物里不再有 `[animation-play-state:paused]`
- 有 `.animate-disc-spin.is-paused{animation-play-state:paused}`
- 且它的下标**大于**基础动画（同特异性下后者胜出，正是需要的）
- `prefers-reduced-motion` 下仍显式 `animation: none`

另外验到：沉浸层与抽屉都用了 `scrollIntoView({block:"center"})`、
容器有 `min-h-0 w-full flex-1 overflow-y-auto`、留白按实测高度算、
`ResizeObserver` 在、依赖带 `lyricLines`、旧的自算偏移写法已删、
唱片尺寸已放大、沉浸层小字已删且播放条两个按钮各自独立。

⚠️ **浏览器观感仍需人工确认**（我无法验）：
唱片暂停时是否真的停住、歌词是否平滑滚到中间且切歌后跟随、超大唱片在手机上是否把歌词挤没。

---

## 18. v0.9.3：`scrollIntoView` 的空操作陷阱 + 封面放大（2026-10）

### 18.1 ⚠️ 这条要记住：`scrollIntoView({block:"center"})` 不是「居中」

站长的实测反馈：

> PC：暂停时唱片停住了 ✓，但**歌词没有滚到中间**
> 移动端：两样都正常

以及一句决定性的话：

> 「可能是写错滚到中间的逻辑，以为歌词还在，只不过一直居中的歌词恰好是
> **歌词的中间部分**而不是高亮部分」

**这句话说明根本没发生滚动** —— 那个「中间」是内层 padding 撑出来的初始位置。

我第一版把根因猜成「唱片太高、把当前行挤出屏幕外」，**是错的**。
真正的原因是这个 API 的语义：

> `scrollIntoView({ block: "center" })` 是「把目标**滚进视野**，尽量居中」，
> **目标已经在可见区内时，它什么都不做。**

- PC 歌词区**更宽更矮** → 十几行都在可见范围内 → 一次也不滚 → 看起来「固定不动」
- 移动端容器矮 → 确实溢出 → 每次都滚 → 一直正常

**为什么移动端正常、PC 不正常，这个差异本身就是最强线索**：
同一个函数、同一份数据，只有容器尺寸不同 → 一定是「溢出与否」在起作用。

**修法：让内容一定溢出**，任何一行都需要滚动才能居中：

| 位置 | 做法 |
| --- | --- |
| 沉浸层 | 内层 `minHeight = 实测容器高度 × 2`（`ResizeObserver` 跟随尺寸） |
| 底部抽屉 | 内层 `min-h-[28rem]`（容器 `h-56` = 14rem） |

两处都保留「上下留白 = 容器高度的一半」—— 否则第一行与最后一行无法居中
（滚到顶就是极限）。

### 18.2 封面在唱片里显得太小

原来封面**只**出现在中心圆标里，而圆标是 `inset-[31.5%]` ——
这是「正方形套正方形」，圆形标签的真实直径只有盘面的 37%，
唱片放大后（`lg:w-[30rem]`）就显得图片很小。

**现在封面出现两处**：

- **盘面铺底**：`backgroundImage` 里「纹路在上、封面在下」
  （`backgroundSize: "auto, cover"`），封面像透过黑胶看过去，整张盘都有画面
- **中心圆标放大到 50%**：改用 `h-1/2 w-1/2` + 居中定位，
  比 `inset-*` 更容易看出「占一半」；无封面时占位图标 26 → 44

### 18.3 ⚠️ 又一个断言写法坑（这次栽了两次）

**断言「旧写法已移除」时，不要搜整份文件** —— 我写的解释性注释里就提到了旧写法：

- 注释里写「不用 `inset-[31.5%]`」→ 搜文件命中注释
- 注释里写「不是再叠一个 `[animation-play-state:paused]`」→ 同样命中

**做法**：只取 `className="..."` / `` className={`...`} `` 里的内容来断言。
（第 4 节那批断言坑又多了一条，将来一并整理过去。）

### 18.4 验证结果

17 项断言全过，**其中「旧写法已移除」这一类只针对 className**：

- 产物里生成了 `min-h-\[28rem\]`（Tailwind 确实编译了任意值类）
- 抽屉内层真的用了它（`h-56` + `py-[7rem]` + `min-h-[28rem]`）
- 沉浸层内层用动态 `minHeight` + 留白为容器高一半
- 两处都仍用 `scrollIntoView({ block: "center" })`，容器都有 `min-h-0`
- 切歌后会重新居中（依赖带 `lyricLines`）
- 盘面 `backgroundImage` 带 cover url 且纹路在前，`backgroundSize: "auto, cover"`
- 中心圆标是 `h-1/2 w-1/2` 居中；`className` 里已无 `inset-[31.5%]`
- 上一轮的两个修复没被改回去（`is-paused` 类、播放条的独立歌词按钮）

⚠️ **仍需人工确认**：PC 上高亮行是否真的滚到中间了、封面在盘面上是否好看
（盘面铺底 + 圆标各占一半，观感只能人看）。

---

## 19. v0.9.4：`scrollIntoView` 会把祖先也滚了（v0.9.3 是我自己引入的 bug）

### 19.1 ⚠️ 这条必须记住：`scrollIntoView` 会滚动**所有**可滚动祖先

站长反馈：「PC 出现严重 bug，在歌词滚动的时候**唱片也跟着滚上去了**」。
**这是 v0.9.3 那次修复直接造成的**，根因是我为了让它「有事可做」而撑高内容：

```js
// v0.9.3 加的（错的）
minHeight: lyricBoxHeight ? lyricBoxHeight * 2 : undefined
```

内容撑到两倍高 → **整页产生纵向溢出** → `scrollIntoView()` 沿祖先链
**逐个滚动所有可滚动容器**（这是它的定义行为，目的是把目标带进视口）→
**页面本身被滚了** → `relative` 定位的顶栏与主体整体上移 → 看起来就是
「唱片在容器里往上跑」（那层 `.fixed` 外壳不滚，所以像是「容器内」在动）。

### 19.2 一条根因解释三个现象

| 现象 | 原因 |
| --- | --- |
| v0.9.2 之前 PC 上歌词**完全不动** | 内容没溢出 → `scrollIntoView` 空操作 → 什么也不滚 |
| 移动端**一直正常** | 歌词框矮、确实溢出 → 优先滚那个框 → 轮不到页面 |
| v0.9.3 之后 PC 上**唱片跟着滚** | 溢出传到页面层 → `scrollIntoView` 把页面也滚了 |

**教训**：想「只滚某个容器」就**直接写它的 `scrollTop`**，
别用 `scrollIntoView` —— 它的作用域是**祖先链**，不是你要的那个元素。
（同理，`element.scrollIntoView` 从来不是「把元素居中」的可靠手段，
见第 18 节：目标已可见时它什么都不做。）

### 19.3 修法

```js
box.scrollTo({
  top: line.offsetTop - (box.clientHeight - line.offsetHeight) / 2,
  behavior: "smooth",
})
```

- 歌词框加 **`relative`**：`offsetTop` 相对最近的**定位祖先**，缺了会算错位置
- **撤掉「两倍容器高」的 hack**，不再需要
- 底部歌词抽屉有同样的问题，一并改掉
- 沉浸层与抽屉现在用的是**同一套**滚动做法，注释里互相指认

### 19.4 顺带的改进：歌名与歌手按屏幕分工

| | 顶栏 | 唱片下方 |
| --- | --- | --- |
| PC（≥768px） | 只剩退出按钮 | **歌名（`text-lg`/`lg:text-xl` 大字）+ 歌手（`text-sm` 灰色）**，居中 |
| 移动端（<768px） | 保留歌名 + 歌手 | 不显示（`hidden md:block`） |

移动端留在顶栏是**有意的**：那边上下堆叠、空间紧，塞到唱片下面会把歌词区压得更矮。
同一份文字渲染两次、用 `md:` 断点控制显隐，视觉上永远只出现一处。

### 19.5 验证结果

17 项断言全过，关键几条：

- 三个音乐组件里**都没有 `.scrollIntoView(` 调用**（去掉注释后再查，避免命中我自己的解释性注释）
- 沉浸层与抽屉都用 `box.scrollTo` + `offsetTop` 居中，且歌词框都有 `relative`
- `className` 里已无 `min-h-[28rem]`、代码里已无 `minHeight: lyricBoxHeight * 2`
- 顶栏文字块是 `md:hidden`、唱片下方文字块是 `hidden md:block`
- 上一轮的两个修复没被改回去（`is-paused`、播放条独立歌词按钮）

⚠️ **仍需人工确认**：PC 上滚歌词时唱片是否**不再**跟着动、高亮行是否滚到中间。
（这次我对根因有把握，因为它同时解释了你两次反馈的现象；但终究要你点一遍才算数。）

---

## 20. v0.9.5：歌词滚不到高亮行的**真**根因（前四轮我都修错了地方）

### 20.1 结论先行

**主体容器上的 `items-center`（`align-items: center`）让歌词框被内容撑开，
于是永远没有溢出、`scrollTop` 怎么设都不动。**

实测（headless Edge，逐字复刻真实布局的测试页）：

| 布局 | `main` 高 | 歌词框高 | 最大可滚 | 滚到哪 |
| --- | --- | --- | --- | --- |
| `align-items: center`（旧） | 623px | **5040px**（= 内容全高） | **0** | 0（纹丝不动） |
| 去掉它 | 623px | **607px** | 2520px | 1273 ✓ |

`align-items: center` 让 flex 子项**按内容尺寸摆放**而不是拉伸到容器高度。
**`min-h-0` 只解除「最小高度」限制，管不了「不拉伸」** ——
这就是我前面几轮一直修不对的原因：我一直盯着容器内部
（padding、`min-h-0`、`scrollIntoView` vs `scrollTo`），而病根在**父级的对齐方式**。

### 20.2 为什么只有 PC 出问题（关键线索）

移动端是 `flex-col`，`items-center` 作用在**横轴（宽度）**上，纵向高度不受影响。
**「PC 坏、移动端好」这个差异，答案一直在 `flex-row` 与 `flex-col` 的区别里。**
站长两次反馈都强调了「移动端没问题」——那本该是最早被用起来的线索。

### 20.3 修法

- 主体：`items-center` → **`items-center md:items-stretch`**（只有移动端居中对齐）
- 唱片那一列补 **`md:justify-center`**（去掉 `items-center` 后它要自己纵向居中）
- 顺带修一个隐性 bug：中心圆标上一版用 `h-1/2 w-1/2`，但 `h-1/2` 的 **50% 高度会输给**
  `text-lg` 的 `line-height`（Tailwind 里 `h-*` 排在 `line-height` 之前）→ 实际是**椭圆**。
  改用 `inset-[25%]`（四边各 25% 的方框，内接圆正好 50% 直径），不依赖高度百分比。

### 20.4 ⚠️ 这一节最有价值的东西：本机可以用 Edge 量布局

**不要再靠猜。** 本机有 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`，
可以用 headless 模式**直接读到运行时的几何数值**：

```powershell
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
& $edge --headless=new --disable-gpu --no-sandbox --window-size=1440,900 `
        --virtual-time-budget=3000 --dump-dom "file:///D:/.../harness.html" 2>$null |
  Select-String -Pattern "^box\.clientHeight|^偏差"
```

要点：

- 测试页里把测量结果写进一个元素的 `textContent`，`--dump-dom` 就能读出来
- `--screenshot=<路径>` 可以**肉眼复核**（我用它确认了高亮行真的在视觉中心）
- 用 `--window-size` 换视口，**多量几档**（我量了 1440×900 / 1024×700 / 1680×1050 / 390×844）
- 报错 `QQBrowser user data path not found` 无害，可以忽略
- **`Get-Content -Raw` 别用来改测试页**（第 3.5 节的坑）：它按 ANSI 读 UTF-8，
  把中文改坏后脚本直接语法错误、`--dump-dom` 只回显源码，看起来像「没有输出」。
  要改文件用编辑工具。

### 20.5 ⚠️ 复刻布局时必须复刻断点

我的测试页第一版**写死了 `flex-direction: row`**，没复刻 `flex-col md:flex-row`，
于是移动端的测量完全无效（歌词框和唱片叠在一起、偏差 -8px 是取整误差）。
**复刻布局时漏掉断点，测出来的结论就是错的** —— 那比不测更危险，因为它看起来有数据。

### 20.6 验证结果（四档视口全部 0px 偏差）

| 视口 | 歌词框高 | 最大可滚 | 目标 = 实际 | 高亮行偏差 | 圆标占盘面 |
| --- | --- | --- | --- | --- | --- |
| 1440×900 | 684 | 2520 | 1273 = 1273 | **0px** | 50.0% |
| 1024×700 | 484 | 2520 | 1273 = 1273 | **0px** | 50.0% |
| 1680×1050 | 834 | 2520 | 1273 = 1273 | **0px** | 50.0% |
| 390×844 | 400 | 2520 | 1273 = 1273 | **0px** | 50.0% |

（`tsc` / `eslint` / `build` 三关通过；临时测试页与截图已删除，`scripts/` 只剩三个正式脚本。）

---

## 21. v0.9.6：沉浸层的播放列表改成右侧抽屉（2026-10）

### 21.1 原来为什么会「退回原页面」

不是 z-index 能修的，是**结构**问题。原来的按钮做的是：

```tsx
onClick={() => { onClose(); onOpenQueue() }}   // 先退出沉浸层，再弹底部面板
```

而 `QueuePanel` 是 `fixed bottom-0 z-50`，沉浸层是 `z-[60]` ——
**底部面板结构上就盖不到沉浸层上面**。所以「点列表就回到原页面」是必然结果。

### 21.2 改法：给沉浸层自己一份抽屉，挂在它内部

新增 `QueueDrawer`，渲染在沉浸层根节点里（`absolute inset-0 z-10`），
于是打开/关闭它都不会动到沉浸层本身。

形态按断点自适应（站长确认：PC 右侧、窄屏底部）：

| 断点 | 形态 |
| --- | --- |
| PC（≥768px） | 右侧抽屉，宽 24rem、占满高度，左侧留半透明遮罩（能看到唱片） |
| 窄屏 | 底部弹层，限高 70% |

### 21.3 文件结构（列表本体只此一份）

| 文件 | 职责 |
| --- | --- |
| `QueueList.tsx` | **列表本体**：行渲染、当前曲高亮、点歌切换、`onPick` 回调 |
| `QueuePanel.tsx` | 非沉浸模式的**底部抽屉**（外壳，行为不变） |
| `QueueDrawer.tsx` | 沉浸模式内的**自适应抽屉**（PC 右侧 / 窄屏底部） |

`QueuePanel` 与 `QueueDrawer` 都渲染 `QueueList` —— 不复制行逻辑，
否则「一处改了另一处忘改」是迟早的事。

给 `PlayerSong` 补了 `album`（`/music` 的 `select` 与映射同步），
抽屉里一行显示 歌名 + 歌手 + 专辑。

### 21.4 三个行为细节

1. **点某一首自动收起**（站长明确要的）—— `QueueList` 的 `onPick` 接到抽屉的 `onClose`
2. **`Esc` 优先级**：抽屉开着时先关抽屉，再按一次才退出沉浸层。
   实现上把 `queueOpen` 放进 keydown effect 的依赖数组 —— 否则闭包里是旧值
3. **打开时把正在播放的那首滚进视野**：`scrollIntoView({ block: "nearest" })`。
   ⚠️ 这里用 `scrollIntoView` 是**安全的**，与第 18/19 节歌词那两次踩坑不同：
   它只在打开时跑一次，且祖先链上没有别的可滚动容器
   （沉浸层是 `fixed overflow-hidden`），不会误滚页面。
   歌词那边每几秒滚一次、且祖先里确实有可滚动容器，所以必须自己写 `scrollTop`

### 21.5 动效降级（又是同一个坑）

滑入动效用了两个关键帧（`drawer-in` 从右、`sheet-up` 从下）。
**必须显式写 reduced-motion 降级**：全局那条只把时长压成 0.01ms，
动画是看不见了，但**位移仍然会发生一次**。这和第 16.4 节记的唱片旋转是同一个教训。

### 21.6 验证结果

**布局层（headless Edge，三档视口）**：

| 视口 | 判定 | 尺寸 |
| --- | --- | --- |
| 1440×900 | 右侧抽屉 ✓ | 贴右、占满高、宽 384 |
| 1024×700 | 右侧抽屉 ✓ | 贴右、占满高、宽 384 |
| 390×844 | 底部弹层 ✓ | 贴底、高 524（不占满） |

三档下列表都在**抽屉内部**滚动，没有把抽屉撑开。

**业务层**：29 项断言全过（按钮只开抽屉、`onOpenQueue` 已从两处移除、
抽屉挂在沉浸层内部、`onPick` → `onClose`、`Esc` 优先级、共用 `QueueList`、
产物里有两个关键帧与降级规则）。

**真实页面**：14 项断言全过（`/music` 仍 200、计数正确、`album` 进了 flight 数据、
`/api/music/play` 未登录仍 401）。

⚠️ **仍需人工确认**（点击行为无法在此验证）：
1. 沉浸模式下点播放列表，**是否不再退回原页面、音乐是否继续**
2. PC 上点遮罩收起抽屉后，**是否仍留在沉浸层**
3. 抽屉里点一首，是否**切歌并自动收起**
4. 抽屉开着时按 `Esc`，是否**只关抽屉**、不退出沉浸层

---

## 22. v0.10.0：维护模式（2026-10-13）

### 22.1 需求

「网站有时候需要维护，在此期间我不希望正常访问，而是显示一张图片：
`docs/photo/update.jpg`（站长自己从 2.66MB PNG 压成了 260KB JPG）。」

确认的方案：**Nginx 层拦截**、**谁都挡**、**503 + Retry-After**、不加小字。

### 22.2 为什么是 Nginx 而不是应用层中间件

| 理由 | 说明 |
| --- | --- |
| **Node 挂了也能显示维护页** | 真在挨打时 Node 很可能已经上不来气；走应用层的方案会跟着一起挂，**等于想挂维护页却挂不上** |
| **几乎不吃 CPU** | 维护页是静态文件，流量在 Nginx 这层就被挡住，落不到 Node |
| **不动现有配置** | 开/关 = 建/删一个软链，完全不碰 `sites-available/lankhub`（那份被 certbot 改过 443 与证书段，脚本改它风险大） |

> ⚠️ 因为选了「谁都挡」，维护是**无条件**的，所以它**不能做成「Node 挂了自动显示维护页」**——
> 那需要健康探测，而探测本身依赖 Node，两件事会互相纠缠。它是**手动开关**。

### 22.3 文件

| 路径 | 职责 |
| --- | --- |
| `docs/photo/update.jpg` | 维护图（源图，260KB） |
| `maintenance/build.mjs` | 生成维护页与 Nginx 配置；`--domain` / `--cert` / `--webroot` 可覆盖 |
| `maintenance/__maintenance.html` | 生成的维护页（**图片 base64 内联**，347KB） |
| `maintenance/lankhub-maintenance.conf` | 生成的 Nginx 配置（域名已填成 `www.lankhub.xyz`） |
| `scripts/maintenance/enable.sh` | 安装 + 建软链 + `nginx -t` + reload |
| `scripts/maintenance/disable.sh` | 删软链 + `nginx -t` + reload（`--purge` 连维护页一起删） |
| `scripts/maintenance/status.sh` | 只读状态检查（不需 sudo） |

**为什么图片要内联**：维护配置对**所有**请求回 503（含静态资源路径）。若用
`<img src="/update.jpg">`，图片请求本身也是 503，浏览器是否肯渲染就不确定了。
内联成一个文件就不存在这个问题。

### 22.4 ⚠️ 实测踩到的两个 nginx 坑（都已修，别再改回去）

**坑 1：`try_files $uri /index.html = 503` 返回的是 200，不是 503。**

第一版这么写，用真实 nginx 1.30 跑起来发现响应码是 **200** ——
那个 `= code` 参数在文件真实存在时不生效，「503 + Retry-After」完全失效，
**搜索引擎会把维护页当正常页面收录**，而响应头里却挂着 `Retry-After`，自相矛盾。

正确写法：

```nginx
location / {
    return 503;
    add_header Retry-After 3600 always;
    add_header Cache-Control "no-store" always;
}
error_page 503 /__maintenance.html;

location = /__maintenance.html {
    internal;
    add_header Retry-After 3600 always;
    add_header Cache-Control "no-store" always;
    root __WEBROOT__;
}
```

**坑 2：`error_page` 之后 `add_header` 不会从 server 层继承。**

第一版把 `add_header` 只写在 server 层，结果维护页返回 503 但
`Retry-After` / `Cache-Control` **两个头都丢了**。
原因是 `add_header` 的继承规则：**子级只要自己写了 `add_header`，父级的就整体被覆盖**，不合并。
所以两个 location 里都要写一遍。

> 附带一条：`internal` location 被外部访问时 nginx 返回 **404**（不是 503）。
> 我第一版断言写成「应返回 503」，方向反了 —— 404 恰恰是 `internal` 生效的证据。

### 22.5 ⚠️ 维护期间证书续期（最容易埋的坑）

维护配置对所有请求回 503，**必须单独放行 `/.well-known/acme-challenge/`**，
否则**维护期间证书无法续期**，等恢复站点时证书可能已经过期。
配置里已处理好，改动这个文件时别把它删掉。

### 22.6 两个安全设计

1. **`nginx -t` 是硬门槛**：不过检查**绝不 reload**；失败时自动**回滚**
   （删软链 + 删维护页），站点不受影响。绝不会出现「想挂维护页结果把站点弄挂」。
   另外 `enable.sh` 在 reload 前会**检查证书文件真实存在**，核对不上直接退出。
2. **维护页是 `internal`**：外部直接请求 `/__maintenance.html` 得到 404，
   只能通过 `error_page 503` 这条内部路径返回。

### 22.7 顺带修掉一个部署隐患：缺失的 `.gitattributes`

仓库原本**没有 `.gitattributes`**，而 Windows 上 `core.autocrlf` 默认会让
`.sh` 在克隆时变成 CRLF。**CRLF 的 shell 脚本在 Linux 上会直接报
`bad interpreter: /bin/bash^M`** —— 本地完全看不出来，只有部署到服务器才炸。
现在锁死 `*.sh text eol=lf`（另含 `.mjs`/`.ts`/`.conf` 等，图片则是 `binary`）。

### 22.8 ⚠️ 本节最有价值的东西：本地可以真跑 nginx 与测脚本

**本机 WSL（kali-linux）里有 nginx 1.30**，于是不必等部署到服务器才发现配置写错。

**① 用真实 nginx 校验配置 + 真跑起来 curl 验证**：

- 在 `/tmp` 下搭一个完整测试 root（`nginx.conf` + `logs/` + `webroot/` + 占位证书）
- 用 `openssl` 造自签证书、造 `options-ssl-nginx.conf` 与 `ssl-dhparams.pem` 占位
- `sed` 把配置里的绝对路径改到测试 root
- `nginx -t -p $T -c $T/nginx.conf` 验语法；`nginx -T` 导出全部生效配置逐条断言
- 再 `nginx -p ... -c ...` 真启动，用 `curl -k` 验响应码 / 响应体 / 响应头

**② 端到端测开关脚本（不碰真实系统）**：

- 把脚本里的绝对路径与 root 检查 `sed` 到隔离目录
- `PATH` 前面放**假的 `nginx` / `systemctl` / `curl`**，把调用记进日志
- 于是能断言「**先 `-t` 后 reload**」「`-t` 失败时**没 reload 且已回滚**」这类关键行为

> 坑记录：`curl -D` 存下来的响应头**每行结尾带 `\r`**，
> grep 断言必须 `tr -d '\r'`，否则会误报「缺少响应头」。
> 另外 `PowerShell → wsl.exe → bash` 三层引号转义极易搞坏命令，
> **把要跑的东西写成脚本文件再执行**，别硬塞一行。

### 22.9 验证结果

- **Nginx 真实验证**：`nginx -t` 通过；`nginx -T` 逐条确认
  `error_page 503`、`return 503`、`internal;`、两个响应头、ACME 放行、域名与证书路径、无残留占位符；
  **真启动后** curl 实测：HTTPS 返回 **503**、`retry-after: 3600`、`cache-control: no-store`、
  响应体含内联图片（355488 bytes）、HTTP 返回 301、`/__maintenance.html` 返回 404（internal 生效）、
  ACME 路径返回 404（放行到磁盘而非 503）
- **开关脚本端到端 24 项全过**：正常开启、重复开启拒绝、**`-t` 失败回滚且不 reload**、
  关闭、`--purge`、未开启时友好退出、`--dry-run` 不改动任何东西、状态脚本两种状态
- **静态检查**：三个脚本 `bash -n` 通过、行尾均为 LF、无 BOM

⚠️ **仍需在真实服务器上确认**（本地无法覆盖）：
1. 你的 `sites-available/lankhub` 里证书路径是否与生成配置一致（不一致就改 `--cert` 重新生成）
2. `sudo npm run maintenance:on` 之后访问 `https://www.lankhub.xyz/` 是否看到维护页
3. 关闭后站点是否恢复正常
4. `certbot renew --dry-run` 在维护模式下是否能过（验证 ACME 路径真的放行了）

---

## 23. v0.10.1：`http2 on;` 在 Nginx 1.24 上炸了（版本差异漏检）

### 23.1 事故经过

站长在服务器上执行 `sudo npm run maintenance:on`，报：

```
[emerg] unknown directive "http2" in /etc/nginx/sites-enabled/lankhub-maintenance:36
nginx: configuration file /etc/nginx/nginx.conf test failed
```

### 23.2 根因：我按**本机** nginx 版本写了配置

`http2 on;` 是 **nginx 1.25.1** 才引入的独立指令。线上是 **1.24.0**，不认它。
而我本地 WSL 是 **1.30**，所以本机 `nginx -t` 全部通过 ——
**「本机验证通过」在版本不同的前提下完全没有意义。**

### 23.3 修法与版本对照

```nginx
# ✅ 跨版本兼容：1.9.5+ 与 1.25.1+ 都能用
listen 443 ssl http2;

# ❌ 1.25.1+ 专用，1.24 会报 unknown directive
http2 on;
```

1.30 上老写法只给一条 `deprecation` **警告**（不是错误），
实测 HTTP/2 仍正常协商（`curl -w '%{http_version}'` 得到 `2`）。

### 23.4 ⚠️ 回滚机制按设计工作了

语法检查没过 → **没有 reload** → 自动删掉软链 → **站点全程未受影响**。
这正是把 `nginx -t` 设成硬门槛、并让失败路径回滚的意义。
**任何改动这个脚本的人，都不要去掉 `-t` 这道门。**

### 23.5 ⚠️ 教训：写 Nginx 配置前先问版本

线上：`nginx -V` → **1.24.0 (Ubuntu)**（`--with-http_v2_module` 是编译进去的，
所以 HTTP/2 能力没问题，问题只在**指令语法的新旧**）。

以后写 Nginx 配置的规矩：

1. **先问版本**（`nginx -V`），或
2. **直接用跨版本兼容的写法**（像 `listen ... http2` 这种老而仍被支持的）
3. 校验脚本里加**针对线上版本的静态检查**（本次已加：出现 `http2 on;`
   或其它 1.24 不支持的指令会在本机就报出来）

同类「本机版本 ≠ 线上版本」的坑还包括：Node 版本、Prisma 版本、glibc 版本。

### 23.6 顺带补强

- `build.mjs` 找不到维护图时，现在会**列出 `docs/photo/` 里实际的文件名**，
  并提示 `git check-ignore`，而不是只报一句「找不到」
- 维护图片 `docs/photo/update.jpg` **必须提交进仓库**（站长已加，在提交 `0e4df2d`）——
  否则服务器上 `git pull` 后没有它，`build.mjs` 就会失败。
  好消息是失败是**显式**的（脚本直接退出），不会悄悄生成一张没有图的维护页

### 23.7 验证结果

- 版本兼容性静态检查：无 `http2 on;`、HTTP/2 用的是 listen 老写法、无其它 1.24 不支持的指令
- `nginx -t` 通过（1.30 上仅 deprecation 警告）
- `nginx -T` 逐条确认：`error_page 503`、`return 503`、`internal;`、两个响应头、
  ACME 放行、域名、证书路径、无残留占位符
- 真启动后 curl 实测：503、`retry-after: 3600`、`cache-control: no-store`、
  响应体含内联图片（355488 bytes）、`/__maintenance.html` 404、HTTP 301、
  **HTTP/2 协商为 `2`**

⚠️ **待站长在服务器上复验**：重新 `git pull` 后执行
`sudo npm run maintenance:on`，应能看到语法检查通过并 reload 成功。

---

## 24. v0.10.2：生成物入库导致 `git pull` 失败（连带 http2 修复没生效）

### 24.1 事故经过

站长 `git pull` 报：

```
error: Your local changes to the following files would be overwritten by merge:
        maintenance/lankhub-maintenance.conf
Aborting
```

紧接着 `maintenance:on` **又报同一个 `unknown directive "http2"`** ——
因为 **pull 失败 ⇒ 修复根本没下来**。

### 24.2 根因：我把「生成物」提交进了仓库

`lankhub-maintenance.conf` 是 `build.mjs` 生成的，而它**因部署环境而异**
（域名、证书路径）。服务器上用 `--cert` 重新生成过它，仓库里也有一份 → 必然冲突。

**这个错误会反复发生**：只要服务器重新生成过一次，之后每次 pull 都会撞。
所以当时的判断是「这次改完就好了」是错的 —— 得从根上不跟踪它。

### 24.3 改法

| 文件 | 是否入库 |
| --- | --- |
| `maintenance/build.mjs`（生成脚本） | ✅ 入库 |
| `docs/photo/update.jpg`（源图） | ✅ 入库 |
| `maintenance/lankhub-maintenance.conf`（生成物） | ❌ 已移除并 gitignore |
| `maintenance/__maintenance.html`（生成物） | ❌ 已移除并 gitignore |

**`enable.sh` 现在会在生成物缺失时自动执行 `node maintenance/build.mjs`**，
所以新克隆的仓库直接 `sudo npm run maintenance:on` 就能跑，
不必记得「先 build」。这一条也是这次事故的直接教训：**别让用户记顺序。**

### 24.4 证书路径自动探测

`build.mjs` 按顺序试：

```
/etc/letsencrypt/live/<域名>/fullchain.pem
/etc/letsencrypt/live/<去掉 www 的域名>/fullchain.pem
/etc/letsencrypt/live/www.<去掉 www 的域名>/fullchain.pem
```

取第一个存在的。**线上实际是不带 `www` 的** `/etc/letsencrypt/live/lankhub.xyz/`，
而脚本原先默认按带 `www` 拼 —— 这正是差异来源。
都找不到时如实提示，并给出 `--cert` 用法。

### 24.5 ⚠️ 又一个脚本自身的 bug：`set -euo pipefail` + `grep` 无匹配

`enable.sh` 读证书/域名/日志的三处 `grep` 没写 `|| true`。
脚本是 `set -euo pipefail`，**管道里任何一环返回非 0 都会终止整个脚本**，
而 `grep` 找不到匹配就返回 1 ⇒ 配置里没有证书段时，脚本**无声无息地停在半路**
（只打印到「Nginx 目录结构符合预期」就没了，退出码还是 1，但看起来像正常结束）。

**教训**：`set -e` + `grep` 组合必须显式处理「没找到」这条正常路径。
凡是「匹配不到也算正常」的 `grep`/`sed`，一律加 `|| true`。

### 24.6 验证结果

- 三个脚本 `bash -n` 通过、行尾均 LF
- 配置确认：无 `http2 on;`、HTTP/2 用 listen 老写法、`nginx -t` 通过
- 真启动 curl：**503**、**HTTP/2 协商为 2**、`Retry-After` 在、响应体含内联图片
- `enable.sh` 在生成物缺失时：检测到 → 调用 `node maintenance/build.mjs` →
  **继续走完流程（软链已建）**
- `git ls-files maintenance/` 只剩 `build.mjs`；本地生成物仍在（只是不再跟踪）

### 24.7 ⚠️ 站长需要在服务器上做的（一次性）

因为 `git pull` 被自己本地改动挡住，需要先丢弃那份已不再跟踪的文件：

```bash
cd ~/lankhub
git checkout -- maintenance/lankhub-maintenance.conf   # 丢弃本地改动
git pull                                              # 这次会成功
sudo npm run maintenance:on                           # 会自动重新生成配置（含 http2 修复）
```

之后 `maintenance:on` / `off` 可以正常用；生成物以后再也不会挡住 pull。

---

## 25. 🚨 v0.10.3：维护模式把整站打挂（HTTP-only 被 301 跳到不存在的 443）

### 25.1 事故

站长执行 `sudo npm run maintenance:on` 后**域名直接无法访问**，
而用外网 IP 访问却显示正常页面。`maintenance:off` **也没能恢复**。

### 25.2 根因：我没确认站点用 HTTP 还是 HTTPS

站长的 `sudo nginx -T` 显示：**全局没有任何 `listen 443`、没有任何 `ssl_certificate`**
—— 站点是 **HTTP-only**。而我的维护配置写成：

```nginx
server {
    listen 80;
    server_name www.lankhub.xyz;
    location / { return 301 https://$host$request_uri; }   # ← 全部跳 443
}
server { listen 443 ssl http2; ... }                        # ← 443 根本没人监听
```

**域名请求 → 维护块 → 301 → 443 死端口 → 浏览器「无法访问」。**

**IP 为什么正常**：`server_name www.lankhub.xyz` 匹配不到 IP 请求，
IP 落到 `default_server`（`root /var/www/html`）—— **症状极具误导性**，
会让人以为是证书或 443 的问题，而不是那个 301。

### 25.3 ⚠️ 教训：维护配置必须与站点实际协议一致

**写任何 Nginx 配置之前，先看这个站到底在监听什么**：

```bash
sudo nginx -T | grep -E 'listen|ssl_certificate'
```

- 站点只有 80 → 维护配置**只写 80，绝不写跳转**
- 站点有 443 → 才考虑放 443 块；即便如此也**不要**在维护配置里写 80→443 跳转，
  除非你已确认 443 正在正常服务

**维护配置是「临时顶替」，不是「升级协议」的地方。** 想上 HTTPS 是另一件事。

### 25.4 改法

- 配置改为 **HTTP-only**：只 `listen 80`，零跳转，无证书，无 `http2`
- 删掉 `--cert` 参数（配置里已无证书相关内容，留着只会误导）
- `maintenance:build` 每次都会打印警告：这是 HTTP-only 配置，
  将来改用 HTTPS 时必须补 443 块，**不要直接让 80 跳 443**

### 25.5 顺带修掉两个相关 bug

**① `server_name` 只覆盖了一半域名**

原来只写 `www.lankhub.xyz`，于是 **`http://lankhub.xyz/`（不带 www）
落到站点自己的块、显示正常页面** —— 维护只挡了一半。
现在生成 `server_name www.lankhub.xyz lankhub.xyz;`。

**② 两个软链命名 → `maintenance:off` 不生效**

软链名 = 源文件名，历史上叫过 `lankhub-maintenance.conf`。
环境里可能残留两个，而关闭脚本只删一个 → **关了维护仍显示维护页**。
现在三个脚本都处理两个名字（`disable` 全删并提示，`status` 告警重复，
`enable` 指出残留的是哪个）。

> 顺带清掉一段**永远走不到的死代码**：我原先在 `enable.sh` 里加了
> 「自动清理另一种命名残留」，但它位于「已开启则退出」检查**之后**，
> 执行不到。是测试用例把它暴露出来的。

### 25.6 ⚠️ 本节最有价值的东西：复刻症状需要的完整环境

这次能定位准，是因为**用真实 nginx 复刻了站长的三个 server 块**
（`default_server` + 主站块 + 维护块），再用 `curl -H 'Host: ...'` 分别打：

| 请求 | 期望 | 本次实测 |
| --- | --- | --- |
| `Host: www.lankhub.xyz` | 503 + 维护页，且**无跳 https 的 Location 头** | ✅ |
| `Host: lankhub.xyz` | 503 + 维护页（不能漏） | ✅ |
| `Host: 1.2.3.4` | 200 默认页（不受影响） | ✅ |
| `https://127.0.0.1/` | 无响应（与线上一致） | ✅ |

**关键点**：把他那份 `nginx -T` 输出里的 `default_server` 块与主站块都复刻进来，
否则复现不出「IP 正常、域名挂了」这个分裂现象 —— 而那个分裂正是最强的线索。
另外主站块里 `proxy_pass` 指向一个**故意不存在的后端**，
这样若请求错误地走到主站块就会得到 502，一眼可辨。

### 25.7 验证结果

- 静态检查：维护配置的**指令行**里无 `listen 443` / `ssl_certificate` /
  `return 301` / `http2` / `letsencrypt`（只查指令行，不查注释 —— 注释里正好在讲这些）
- `nginx -t` 通过；`nginx -T` 确认无 443 监听、无 301
- 真启动后四种请求全部符合 25.6 的期望
- 开关脚本端到端 **22 项**全过：软链双命名的三种场景、`nginx -t` 失败回滚、
  `dry-run` 无副作用、`status` 识别两个命名并告警重复

---

## 26. v0.11.0：启用 HTTPS（分两步 + 证书校验）

### 26.1 文件

| 路径 | 职责 |
| --- | --- |
| `scripts/https/enable.sh` | **第一步**：只加 443，不跳转。校验证书/域名/端口 → 生成独立配置 → `nginx -t` → reload |
| `scripts/https/enable-redirect.sh` | **第二步**：往现有 80 块插 301 跳转（幂等、支持 `--undo`） |
| `scripts/https/disable.sh` | 回退：**先撤跳转、再删 443**（顺序关键） |

### 26.2 ⚠️ 为什么强制分两步

**这个项目刚因为「跳到没人监听的端口」把整站打挂（第 25 节）。** 所以：

- 第一步**只加 443、零跳转** → 万一 https 不通，80 仍可用，不会被锁在外面
- 第二步会**主动检查 443 配置是否存在**，不存在就拒绝执行

**这条设计不是啰嗦，是上一个事故的直接对策。改动它之前请先读第 25 节。**

### 26.3 第一步的校验清单（任何一项不过都不 reload）

| 检查 | 实现 |
| --- | --- |
| 证书/私钥配对 | `openssl x509 -modulus` 与 `openssl rsa -modulus` 比对 md5 |
| 证书覆盖域名 | 解析 `subjectAltName`（老 openssl 退回 `-text`），逐个核对并报出缺失的 |
| 443 未被占用 | `ss -tlnp` / `netstat`，若是 nginx 自己占用则提示可能已有 https 配置 |
| 证书链段数 | `grep -c 'BEGIN CERTIFICATE'`，只有 1 段时警告 |

### 26.4 生成配置的要点

- **独立文件** `sites-available/zz-lankhub-https.conf`，**不改动现有 80 配置**
- 软链名以 **`zz-`** 开头 —— 保证排在站点自己的配置**之后**加载。
  同端口重复 `server_name` 时 nginx 只用先加载的，`zz-` 可避免我们抢占站点的块
- 证书拷到 `/etc/nginx/ssl/`，**私钥 600**（原文件不动）
- **`X-Forwarded-Proto $scheme` 必须有** —— 否则 Next.js / Auth.js 可能生成
  http 的回调地址，登录后被跳回 http
- TLS **只留 1.2/1.3**（nginx.conf 里的全局设置还开着 TLSv1/1.1，这里覆盖）
- HTTP/2 用 `listen 443 ssl http2`（老写法）—— 见第 23 节，1.24 不认 `http2 on;`
- **故意不含 HSTS**：HSTS 让浏览器在有效期内强制 https，证书一旦出问题
  访客被硬锁在外面、且**无法远程解除**。要加也得等 https 稳定运行之后

### 26.5 ⚠️⚠️ 备份绝不能放进 sites-enabled

我最初把备份写成 `lankhub.xyz.lankhub-bak.*`，就在 `sites-enabled/` 里。
**nginx 是 `include /etc/nginx/sites-enabled/*`，那个目录里任何文件都会被当配置加载。**
备份里同样有 `server` 块 → **重复的 `server_name`** → 行为不可预测。

**现在统一放 `/etc/nginx/lankhub-backups/`。**
（这个 bug 只在本地测试暴露，没上过服务器 —— 但它是本轮最危险的一个。）

### 26.6 ⚠️ 标记剥离必须用 range 模式

`enable-redirect.sh` / `disable.sh` 靠一对标记注释定位插入的片段。
我第一版用 `index($0, mark) == 1`（要求标记在**行首**）—— 但标记是**缩进**的，
永远匹配不上 → 剥离静默失败 → **重复执行插入两份片段**、`--undo` 也删不掉。

**正确做法**（range 模式，只要求行内包含标记）：

```awk
awk -v b="$BEGIN_MARK" -v e="$END_MARK" '
  index($0,b) { skip=1; next }
  index($0,e) { skip=0; next }
  !skip { print }
' "$file"
```

### 26.7 验证方式：真实 nginx 启动 + 真实证书校验

语法通过**不代表**能握手。所以验证脚本做的是：

1. 跑真实的 `enable.sh`（PATH 前置假的 nginx/systemctl/ss/curl，隔离到 `/tmp`）
2. **恢复干净 PATH**，用 `/usr/sbin/nginx` 真启动（⚠️ 别用 `command -v nginx` ——
   PATH 里假的还在前面，会抓到 stub，产生「nginx 没起来」这种假失败）
3. `curl --cacert <自签证书>` **真实校验证书链与域名匹配**（不是 `-k` 跳过）
4. 检查 HTTP/2 协商、服务端返回的证书主体、TLSv1 是否被拒、80 是否仍未跳转

实测：`nginx -t` 通过、进程起来、两个域名都握手成功、`HTTP/2` 协商为 `2`、
证书主体 `CN=www.lankhub.xyz`、**TLSv1 被拒绝**、**80 仍直接服务**。

### 26.8 ⚠️ 站长的两个前置条件（本地无法代验）

1. **阿里云安全组要放行 443**。配置再对，不放行就是「无法访问」——
   与上次打挂站点的现象一模一样。**先放行再启用。**
2. **证书要覆盖实际在用的域名**。文件名是 `www.lankhub.xyz.pem`，
   若只签了 `www`，则 `https://lankhub.xyz/` 会报证书错误。
   脚本会解析 SAN 并核对，缺了会拒绝启用并报出是哪个域名。
   此时可用 `--domains www.lankhub.xyz` 只保留证书覆盖的域名。

---

## 27. v0.11.1：`https:redirect` 的 `duplicate location "/"`（2026-10-13）

### 27.1 事故

站长执行 `sudo npm run https:redirect`：

```
[emerg] duplicate location "/" in /etc/nginx/sites-enabled/lankhub.xyz:10
nginx: configuration file /etc/nginx/nginx.conf test failed
```

**但没有造成任何影响** —— `nginx -t` 拦住、**没有 reload**、自动还原了配置。
（这句要留着：它是「语法检查当硬门槛 + 失败自动回滚」这套设计的实战证明。）

### 27.2 根因：插入 ≠ 替换

我原本是把 301 片段**插在**原有 `location /` **前面**：

```nginx
location / { return 301 https://www.lankhub.xyz$request_uri; }   # 我插的
location / {  proxy_pass http://127.0.0.1:3000;  ...  }           # 原有的
```

**nginx 不允许同一个 server 块里出现两个相同的 location** → `duplicate location "/"`。

### 27.3 改法：整段替换 + 状态文件

正确做法是把原有 `location /` 块**整段换成** 301。两个必须解决的细节：

**① 块边界的识别**

原来的块是多行的，且内部可能有嵌套。用「**去掉空白后的花括号计数**」配对：

```awk
depth += gsub(/\{/, "{") - gsub(/\}/, "}")
if (depth == 0) { /* 块结束 */ }
```

只找一行是不行的 —— 这是最容易写错的地方。

**② 撤销必须把原块放回去**

**不能只删跳转** —— 那样 80 会失去 `proxy_pass`，站点直接 **502**。
所以新增状态文件保存被替换掉的原块：

```
/etc/nginx/lankhub-state/<配置文件>.redirect-state
```

`--undo` 与 `disable.sh` 都从它把原块**原样放回**。

> 状态文件放在 `/etc/nginx/lankhub-state/`，**不在 `sites-enabled/` 里** ——
> 同 `lankhub-backups`，原因见第 26.5 节：那个目录里任何文件都会被当配置加载。

### 27.4 教训：改 Nginx 配置要想「这个 location 是不是已经存在」

插入一段 `location` 之前，先确认原来的块怎么处理。同一个 server 块里
**同一个 location 只能有一个** —— 要么替换，要么用 `location = /` 之类区分。
我第一版只想着「把跳转加上去」，没想到它与原有的 `location /` 冲突。

**另外**：`nginx -t` 抓到了它。如果当时没有这道门，reload 之后站点会直接挂。

### 27.5 验证结果

**端到端 25 项**（用站长真实的 80 配置内容）：

- 替换后只有 **1** 个 `location /`、代理块已移除
- 原块完整存进状态文件（首行 `location / {`、末行 `}`、11 行、含 `proxy_cache_bypass`）
- 幂等：重复执行仍只有一份片段
- **`--undo` 后与原始配置逐字一致**（`diff` 无差异）；`disable` 同样逐字还原
- `nginx -t` 失败时还原并**清掉状态文件**（避免脏状态）
- 没有 443 配置时拒绝执行；状态文件缺失时**拒绝执行并提示**（不静默弄成 502）

**真实 nginx 启动验证**：

- `nginx -t` 通过（旧写法在这里就会报 `duplicate location`）、进程真起来
- `http://www.lankhub.xyz/` → **301**，`Location: https://www.lankhub.xyz/`
- **路径与查询串完整保留**：`/foo/bar?x=1` → `https://www.lankhub.xyz/foo/bar?x=1`
- https 侧 TLS 与代理都通

---

## 28. v0.12.0：文章编辑器支持粘贴 Markdown（含表格）（2026-10）

站长的工作流是「和大模型讨论出文章 → 直接复制 → 粘进编辑器」，
但从聊天界面复制到的是 **markdown 纯文本**，而 TipTap 走 ProseMirror 的默认
粘贴行为：纯文本只会变成段落，`##`、`**`、`-` 全都当普通字符留在正文里。

### 28.1 方案：自动识别为主，按钮就地整理

| 入口 | 行为 |
| :--- | :--- |
| **直接 Ctrl+V** | 自动识别并转换（主路径，零步骤） |
| 工具栏「整理 Markdown」 | **就地整理编辑器里已有的内容**，不开弹层、不需要再粘一次 |

> **⚠️ 这一节改过一次（原作者反馈后）。**
> 第一版做成了「点按钮 → 弹层 → 里面再粘一次 → 插入」，
> 作者直接指出来：**我要的是处理已经粘好的文本，而不是点进去重新粘一遍**。
> 那个设计等于把「粘贴」做两遍，是我想偏了。
> 现在按钮的语义是「就地整理」，规则见 28.1.1。

#### 28.1.1 「整理」的判定顺序（保守优先，处理不了就不动）

1. **有选中文本** → 只转换**选区**，正文其余部分一个字节都不动
2. 无选中，且**整篇都是纯文本段落**（没有任何已有格式）→ 整篇转换
3. 无选中，但**已有格式**（标题/列表/图片/表格/代码块/粗体/链接…）→ **完全不动**
4. 看起来不是 markdown、或解析失败 → **完全不动**

第 3 条是刻意保守：整篇重写会把作者手工调过的排版全部冲掉，那才是真正的「冲突」。
处理不了时只给一条**灰色提示**说明原因（不是红色报错），正文绝不修改。

判定「整篇是否纯文本」用 `isPlainTextDocument()`（`src/lib/markdown-paste.ts`）：
只允许 `doc` / `paragraph` / `text` / `hardBreak` 四种节点，且文字不能带任何标记。

依赖只加了两个（都只影响后台编辑页，前台首屏不加载）：

- `@tiptap/markdown@3.27.1` —— 与现有 `@tiptap/*` **同为 3.27.1**，传递依赖 `marked`
- `@tiptap/extension-table@3.27.1` —— 只依赖 core + pm

> **为什么不自己写 markdown 解析器**：嵌套列表、转义、表格对齐这些细节
> 手写极容易错，而且会随标准演进不断出问题。官方包直接产出 ProseMirror JSON，
> 各扩展自带 `parseMarkdown`，连代码块语言、表格 `:---:` 对齐都能对上。

**存储格式没变**：仍然是 TipTap JSON。markdown 只是**输入格式**，
前台渲染链路（`tiptap-render.tsx`）完全没动，只是补了表格分支。

### 28.2 判定规则：信号分强弱，避免误判

不能「有 md 语法就转」——普通文章里出现一个 `*` 或一行 `- ` 很常见。
所以给信号分两档，累计达到 2 才算 markdown：

| 权重 | 信号 |
| :--- | :--- |
| **2**（几乎不可能出现在散文里） | 围栏代码块、表格行、ATX 标题、图片、行内链接、粗体 |
| **1**（可能出现在普通文本） | 无序列表行、有序列表行、引用行 |

这样「只有一个表格」「只有一张图」「只有两条链接」都能识别（单个强信号就够），
而「正文里恰好有一行 `- xxx`」不会误触发（弱信号单独不够）。

**额外护栏**：

- 长度 < 10 字符不转
- `#!` 开头判定为脚本，不转（否则脚本里的 `# 注释` 会变成标题）
- **优先用剪贴板里的 HTML**：有真正带格式的 HTML 时交给 ProseMirror 自己解析
  （那比 markdown 原文更准，不该抢它的活）。只有当 HTML 只是「markdown 原文的
  原样包装」（其纯文本内容与 `text/plain` 完全相同）时才走转换
- 误判兜底：转换是**一个** ProseMirror 事务，`Ctrl+Z` 一次就能整体撤销

### 28.3 外链图片：换成「链接 + 说明」

CSP 是 `img-src 'self' data: blob: https://*.music.126.net`，
**除本站与网易云 CDN，其它域名的图片一律不显示**。大模型输出的
`![](https://xxx)` 粘进来会变成空白图，且很难察觉。

所以转换时把这类图片改成可读文字：

```
![架构图](https://example.com/a.png)
        ↓
🖼 外链图片「架构图」：[https://example.com/a.png](https://example.com/a.png)
```

- 本站相对路径与 `*.music.126.net` 的封面**保持原样**（不该被误伤）
- `data:` / `blob:` 图片 → 提示「请手动上传」（图片扩展默认拒绝 base64，
  而且 base64 塞进正文 JSON 会把文章撑爆）
- 协议不安全的地址（`javascript:`）→ 直接移除，并且**不会**把它变成链接

### 28.4 一个必须自己补的安全缺口

`@tiptap` 的 **markdown 解析路径不校验链接协议**（源码里直接
`href: token.href` 赋值），这与它的 HTML 解析路径不同（那条走 `isAllowedUri`）。
图片的 `src` 也没有协议校验。

所以解析后额外过一遍 `sanitizeMarkdownDoc()`：

- 链接：`javascript:` 等协议 → 摘掉 link 标记，**保留文字**
- 图片：协议不安全、或域名不在 CSP 白名单 → 整个节点丢弃

> 前台渲染器本来就有 `isSafeUrl` 兜底（链接与图片都过），所以线上不会因为
> 这个缺口被 XSS。但脏数据不该写进库 —— 两道防线都要有。

### 28.5 表格：三处都要改

| 位置 | 改动 |
| :--- | :--- |
| 编辑器 | 加 `TableKit`（Table / TableRow / TableHeader / TableCell 打包） |
| 前台渲染器 | `tiptap-render.tsx` 补 `table` / `tableRow` / `tableHeader` / `tableCell` 四个分支 |
| 样式 | 前台靠 Tailwind Typography 的 `prose` 现成样式；编辑器只需补横向滚动、选中单元格高亮、列宽下限 |

渲染时按**单元格类型**（而不是行序号）分 `<thead>` / `<tbody>`：
markdown 表格解析后第一行是 `tableHeader`，按序号猜会在「没有表头的表格」上出错。
同时支持 `:---:` 对齐（解析后落在单元格 `align` 属性，用 `style` 输出而不是
已废弃的 `align` HTML 属性）。

### 28.6 本轮踩的坑（都记下来避免重走）

1. **`next start` 服务的是构建产物**。改完源码没 `npm run build` 就跑浏览器测试，
   测的是旧代码 —— 新写的识别规则没生效，我却以为是逻辑错了，白跑一轮。
   （已在测试脚本开头写明提醒）
2. **测试不能用「全选 + 删除」清空编辑器**。ProseMirror 会**异步**从 DOM 同步选区，
   「设选区 → 删除 → 粘贴」在同一个 tick 里执行时，PM 用的还是它自己的旧选区，
   结果是旧内容没删掉、新内容插到别处，断言全对不上。改成**每节重载页面**。
   另外「删除后剩下的空块会沿用上一次的块类型」也会让
   「普通文本不该变成标题」这条假失败。
3. **信号门槛一开始写成「≥2 个布尔命中」**，导致单元素 markdown（只有表格/只有图/
   只有链接）全都不转换。改成强弱加权后解决。
4. **表格行正则第一版写错**：`\|[^|\n]*\|` 里 `[^|]` 排除了竖线，
   于是**两列以上的表格永远匹配不到**。应当用 `\|.*\|`。
5. **「剪贴板 HTML 是不是 markdown 原样包装」的比较方式错了**：
   原来用 `htmlText.trim() === text.trim()`，但 `<p>## 标题</p><p>正文</p>`
   的 textContent 是「## 标题正文」——段落之间的换行没了，与
   `## 标题\n\n正文` 直接比永远不等。于是这类剪贴板被判成「有真正格式」
   而**不做转换**（很多聊天界面复制出来正是 `<p>` 包裹的形态，很可能就是
   作者反馈「粘贴没生效」的真正原因）。修法：**先去掉所有空白再比较**。
6. **TipTap 的 markdown 输入规则会部分自动格式化**：
   实测往编辑器里送入纯文本 `**粗体**` 时，输入规则会把它直接变成粗体标记，
   而 `##` 标题不会。这会让「整理」判定成「已有格式」而拒绝整篇转换 ——
   守卫行为是**对的**（避免冲掉手工排的版），但写测试时要注意输入别掺行内标记，
   否则会误以为守卫失效。

### 28.7 验证

| 套件 | 覆盖 | 结果 |
| :--- | :--- | :--- |
| `npm run editor:markdown-test` | 判定规则正反例、CSP 判断、图片改写、安全清洗、嵌套结构、**「全篇是否纯文本」的冲突判定** | 52 项全过 |
| `npm run editor:markdown-ui` | **真实浏览器**：粘贴后 DOM 真的变成 h2/strong/code/ul/pre/**table**；代码块语言正确；危险链接被移除；普通文本不误转；**「整理」按钮就地转换**；**已有格式时整篇不动** | 42 项全过 |

浏览器测试的关键断言（都是「看一眼就知道对不对」的）：

- `## 二级标题` → `<h2>`，且正文里**没有残留 `##`**
- ` ```js ` → `<pre>`，且语言下拉的值是 `js`
- markdown 表格 → `<table>` + **2 个 `<th>`** + 4 个 `<td>`，表头/表体文字逐一比对
- `javascript:` 链接 → 页面上没有任何 `javascript:` 的 `href`
- 普通中文散文 → 段落，**没有**被误转成标题

回归：播放顺序 29 / 验证码逻辑 61 / XFF 安全 18 / 页面交互 35 / 会话失效 10 /
settings 交互 32 / 密钥扫描 31（237 个跟踪文件）—— 全过。
`music:ui-check` 仍是那 5 项**已知的时序敏感项**（与本轮改动无关）。

### 28.8 已知限制

- **表格只有快捷键，没有工具栏按钮**（站长不喜欢太多按钮）。
  加行/列、删表格等操作用 ProseMirror 默认快捷键；
  需要的话可以后面补一个「表格」下拉。
- **列宽拖拽没开**（`resizable: false` 是扩展默认值）。列宽由内容自动决定，
  宽表格可以横向滚动。
- **markdown → HTML 的 4 级及以上标题会被压到 h3**：schema 只允许 h1–h3，
  这是既有约束，不是本轮引入的。
- **正文里已有任何行内格式时，「整理」会拒绝整篇转换**（只提示不动）。
  这是刻意的保守策略；要走这条路请**先选中要转换的段落**再点，
  选区模式不受此限制。
- **没有「全篇转成 markdown 源码」的反向导出**。当前只做 markdown → 富文本，
  存储与渲染始终是 TipTap JSON。

---

## 29. 首页滚轮切屏（2026-10）

### 29.1 用户的原话与动机

> 「首页现有向下按钮点击有效果，但鼠标正常滚动也会触发类似效果，
> 导致按钮存在性较弱。希望鼠标下滚时直接平滑切到下一页面，
> 并与向下按钮功能完全一致。」

澄清时确认的几点（都不做假设，先问清楚）：

- 所谓「正常滚动也会触发类似效果」**不是代码造成的** —— 全仓库没有 wheel 监听、
  没有 scroll-snap、没有滚动劫持，那就是浏览器原生滚动本来就能滚到那一屏，
  所以按钮显得多余
- 「下一页面」= `#about` 那一屏，**与按钮同一落点**
- 只在**页面顶部**劫持一次；落到 `#about` 之后继续下滚恢复原生；**上滚对称**回顶
- 接受「触发后锁约 700ms」这个取舍

### 29.2 方案（A：window 级 wheel + 边界判定 + 复用同一函数）

被否掉的候选：

| 候选 | 为什么不用 |
| :--- | :--- |
| 把逻辑全写进 `HeroSection.tsx` | 任务二（首页视觉改造）复用时得复制粘贴，两份逻辑迟早不一致 |
| CSS `scroll-snap` 整屏吸附 | 它会接管**整个首页**的滚动（每段都成一屏），与「只在顶部劫持一次」直接冲突，还会和 `Reveal` 的 IntersectionObserver 打架 |
| `scrollend` 代替锁（当初） | 方向是对的，但当初以为要**固定 700ms**；见 29.3 的第三个坑 |

最终实现：`src/components/home/hero-paging.ts` 导出 `useHeroPaging()`，
返回 `goToNextScreen` / `goBackToTop`；**向下按钮与滚轮都调 `goToNextScreen`** ——
「完全一致」不是靠对齐两份代码，而是靠只有一份。

监听挂在 `window` 而不是 hero 的 `<section>`：向上回滚时鼠标指针在 `#about` 那一屏，
事件根本不进 hero 的子树。

### 29.3 四个坑（含两个我自己造出来的）

1. **`behavior: "auto"` 不是「立即」，是「按 CSS 来」。**
   项目里有全局 `html { scroll-behavior: smooth }`，所以 reduced-motion 降级
   必须写 `behavior: "instant"`；写 `"auto"` 会回落成平滑滚动，测试还「看起来通过」。
   顺带修掉既有问题：按钮原先写死 `smooth`，在 reduced-motion 下**依然平滑**。

2. **惯性尾巴会打断平滑滚动。** `preventDefault` 只作用于被处理的那一次事件，
   而一次手势会连发 5–15 个；Chromium 里**任何原生滚动输入都会取消平滑滚动**。
   所以锁定期内要把滚轮事件**全部吞掉**。

3. **锁 700ms 会让落点后的下一次滚动「没反应」。** 实测平滑滚动约 570ms 就结束了，
   锁满 700ms 等于多吞约 130ms。第一次测试里 T4/T5b 失败就是这个（不是功能坏了）。
   改成**动画真结束就解锁**：监听 `scrollend`，700ms 只作兜底上限。

4. **`data-ink-dark` 会残留。** 暗色态由鼠标悬停标题触发；劫持时鼠标没动、页面动了，
   浏览器对「滚动引起的 hover 变化」是否派发 `mouseleave` 并不可靠 ——
   不主动清的话暗色态会一路带到「关于我」那一屏（整页暗、导航栏也暗）。
   现在由 `useHeroPaging` 的 `onJump` 回调（传 `leaveDark`）在滚动前清掉。

### 29.4 测试里踩的两个坑（都写进了 HANDOVER 4.3）

- **固定端口 + 残留 `next start`**：新进程静默 EADDRINUSE，连到旧服务器，
  构建产物更新后它记着旧 chunk 清单 → JS 全 404 → **HTML 出来了但永不水合**。
  表现像「代码坏了」（滚轮没反应、按钮 `querySelector` 返回 null），
  我为此白跑了一轮。对策：端口随机 + 用「必须由 JS 才会变的东西」当 canary
  （首页导航栏的「登录」链接：SSR 是骨架屏，水合且拿到会话后才出现）。
- **「连续两帧位置不变」不能判定滚动结束**：缓动尾段一两像素要走 100ms 以上，
  条件提前成立 → 下一次滚轮落在动画未结束时被锁吞掉。改用 `scrollend`。

### 29.5 验证

临时脚本 `scripts/_hero-wheel-check.mts`（**验证完已删除**），
headless 与**有头 Edge**各跑一轮，均 **18 项全过**：

| 断言 | 结果 |
| :--- | :--- |
| 顶部下滚一格 → 落点 = `#about` 绝对偏移 | 801px（无头）/ 800.67px（有头），误差 0 |
| 与点按钮的落点比较 | 完全相同（逐像素） |
| 是平滑动画而非瞬跳 | 中间采样 9–11 帧，约 520–620ms |
| 落点后再下滚 / 停文中上下滚 | 均为原生滚动（增量 120px），不劫持 |
| 落点上滚一格 | 回顶（0，误差 0） |
| 连发三次滚轮（惯性） | 仍停在落点，不越界 |
| 鼠标停在标题上制造暗色态再下滚 | 暗色属性被清空，且确实落到下一屏 |
| `prefers-reduced-motion: reduce` | 按钮与滚轮都在 120ms 内到位 |
| `/blog` 顶部下滚 | 原生滚动（120px），监听没泄漏到别的路由 |
| 控制台 | 无 error |

### 29.6 已知边界

- 移动端/触屏、键盘（空格/PageDown）、拖动滚动条**完全没动**（按需求）
- 停在下滚被锁住的那 ~0.6 秒内改不了主意，这是有意的取舍
- 触控板若觉得「一动就整屏跳」太激进，把触发阈值从 0 调成「累积 ≥8px」即可 ——
  常量都在 `hero-paging.ts` 顶部

---

## 30. 首页首屏山水场景（阶段 1：结构骨架，2026-10）

### 30.1 需求与确认结论

站长原话：首页偏简约，喜欢**国风山水水墨**；想要**正常态 = 雪山梅花、悬停态 = 江湖武侠**；
并要求「为后期动态预留条件」，且**开工前必须讨论方案**。

讨论阶段用两轮选择题定了 18 项，关键几条：

| 项 | 结论 |
| :--- | :--- |
| 呈现介质 | 混合（SVG 打底 + 位图），实际落地为**站长用 GPT 生成的两张整幅插画** |
| 悬停范围 | **整块首屏**；离开立即恢复 |
| 触发时机 | 进页 **1.2s 宽限** + 指针**停留 300ms** 才切 |
| 色调 | 墨 + 一点朱砂；江湖态**深墨夜色** |
| 移动端 | **轻点切换**（触屏没有 hover） |
| 文案 | **全部保留**，只删掉头像圆 |
| 范围 | **只改首屏**，下方区块不动 |
| 分期 | 先出结构稿截图确认，再打磨质感 |

素材：`docs/photo/homeBannerAssets/{xueShanMeiHua,jiangHuDaXia}.png`（GPT 生成，1672×941）。

### 30.2 素材实测（决定方案的数字）

- 两张都是 1672×941、16:9、无透明通道；源文件 1.9MB / 2.2MB
- **转 WebP q82 只有 79KB / 106KB** —— 水墨画的高频细节很少，压缩率极高，
  所以两张都直接 `preload`，不需要懒加载的花招
- 纸色 `#f2ece0` 一带，比全站底色 `#faf8f5` 暖且深 → **必须做上下渐隐**，否则两条色带
- 手机竖版：16:9 铺满 390×636 会横裁 **69%**，右侧梅枝/人物全没
  → 另出竖版（右侧 577×941 裁切，恰好等于手机那屏的比例）

### 30.3 架构（为后期动态留的口子）

```
<hero>                                  整块首屏：悬停/轻点热区
  <HeroScene scene="snow">              底图 + 文字底衬
  <HeroScene scene="jianghu">           底图 + 夜色叠层 + 文字底衬
  <content>                             标题 / 副标题 / 印章
  <indicator z-20>                      向下按钮
```

- 状态只有一份真相：`<html data-hero-scene="snow|jianghu">`，**CSS 全量响应**，
  场景层不参与 React 渲染（沿用任务一 `data-ink-dark` 的思路，只是升级成「场景」）
- **叠加式**预留：夜色、底衬都是独立层，后期加雪落/雾飘/月晕呼吸只要往层里加元素，
  不动结构；参数集中在 `hero-scene.ts`
- 被扁平图限制的部分（梅枝摇、人物动）需要额外分层素材，本期不做，已向站长说明

### 30.4 七个坑（前四个是我自己造出来的）

1. **顶部渐隐在江湖态会露出亮带。** 素材纸色淡出到纸色没问题，但江湖态导航栏是深色的，
   淡出反而在深色栏下面留一条发亮的纸带（双色调版尤其明显）。
   → 遮罩改成**两态各一份**：雪山态顶部淡出，江湖态顶部不淡。
2. **手机竖版的「延展」怎么都会露馅。** 试了两种：纯纸色补底 → 一条水平色带；
   把底边像素纵向拉伸 → 一片竖条纹。原因是画面底边一边是水一边是礁石，没有一种纯色对得上。
   → 最终改成**纯裁切**：裁出恰好等于视口比例的右侧窗口，`cover` 不需要任何补齐。
3. **整屏文字容器盖住了向下按钮。** 内容区改成 `min-h` 整屏 flex 后（带 `z-10`），
   把 `absolute bottom-8` 的按钮整个盖住 —— **按钮点了没反应**。
   是任务一的回归断言（T3b）抓到的。浮动元素补 `z-20`。
   ⚠️ 这个 bug 光看截图完全看不出来。
4. **宽限期结束后不会补切。** 切换只挂在 `pointerenter` 上：页面加载时鼠标已在首屏里，
   宽限期内进不来、之后也不会再触发 enter → **悬停态等于失效**。
   → 宽限计时器结束时若指针仍在内部，补一次调度。
5. **残留的 `next start` 会 serve 旧构建。** 只 kill 启动器会留下服务进程；
   端口撞上时拿到的是旧构建 —— HTML 正常、CSS/JS 全是旧哈希 →
   **整页无样式、永不水合**。我据此产出过一批「无样式」的截图，白跑一轮。
   → 脚本改成 `taskkill /T /F`，并在截图前断言「有样式 + 已水合」。
6. **纯 CSS 循环副标题的相位让截图说谎。** 12 秒里只有约 2 秒可见；
   截在淡出相位时，副标题看起来「对比度不够」，我为此把手机端底衬加厚了两轮。
   实测 `opacity=1` 时颜色是 `rgb(234,227,213)`，本来就够。
   → 截图前轮询 `opacity > 0.95`。
7. **`Get-Content -Raw` + `Set-Content` 改文件会把中文写成非 UTF-8**，
   文件直接变成「invalid UTF-8」读不回来（交接文档里早有警告，我还是踩了）。
   → 改文件只用 edit/write。

### 30.5 验证

- `tsc` / `eslint`（改动文件）/ `npm run build` 全过
- **任务一 18 项滚轮回归全部通过**（落点仍等于点按钮、文中不劫持、reduced-motion 立即到位、`/blog` 不受影响、控制台干净）
- 真实浏览器截图（headless Edge + CDP，`.ui-shots/home-hero/`）：
  1280×800 / 1920×940 / 390×700 × 两态，外加双色调对比与接缝检查
- 触屏模拟下 `(hover: none)` 生效、轻点能来回切，且竖版图正确换用

### 30.6 待定与素材转码（阶段 2 入口）

**夜色有两版**，等站长选：

| 代号 | 观感 | 取舍 |
| :--- | :--- | :--- |
| `dusk`（默认） | 暮色压暗，保留原画的朱砂（酒旗/梅朵） | 夜得不够透 |
| `duotone` | 去色成墨青夜，最统一 | 画面里的红保不住，朱砂只留印章 |

切换方式：网址加 `?night=duotone`（阶段 1 专用开关，选定后删掉另一支与这段开关）。

**派生图转码**（源图入库，派生图入库；不新增永久脚本，需要重做时跑这段）：

```js
// node 里执行；sharp 已在依赖中
import sharp from "sharp"
const SRC = "docs/photo/homeBannerAssets"
const OUT = "public/images/home"
const jobs = [
  ["xueShanMeiHua.png", "hero-snow.webp"],
  ["jiangHuDaXia.png", "hero-jianghu.webp"],
]
for (const [src, out] of jobs) {
  await sharp(`${SRC}/${src}`).webp({ quality: 82, effort: 5 }).toFile(`${OUT}/${out}`)
  // 竖版：右侧 577×941（= 390/636 的比例）裁切后放大到 780 宽
  await sharp(`${SRC}/${src}`)
    .extract({ left: 1672 - 577, top: 0, width: 577, height: 941 })
    .resize({ width: 780 })
    .webp({ quality: 82, effort: 5 })
    .toFile(`${OUT}/${out.replace(".webp", "-m.webp")}`)
}
```

### 30.7 阶段 2：夜色定稿 + 排版与字体

阶段 1 交付后站长反馈：**「界面看起来很不错」**，但**字体与画面不匹配**，
希望「锋利」，可考虑行楷。于是做了四款字体的真机对比（现状 / 思源宋体 900 /
马善政毛笔楷书 / 志莽行书），站长选了**志莽行书**，并定了三条：
拉丁保持衬线、副标题也用这套字、**每个字大小要有不对称的美感**。

**夜色定稿**：站长选了「暮色压暗」，于是删掉 `duotone` 分支与 `?night=` 临时开关。

**三款候选 → 只留一款**（未选中的字体文件与 CSS 一并删除）。

**中文按字子集**（关键做法，值得复用）：

- 中文字体全集 5–10MB，整包带不现实；首屏只用约 40 个字
- Google Fonts 的 CSS2 接口支持 `text=` 参数，**只返回这几个字的字形**，
  单个文件 10–17KB（实测 9.6 / 16.6 / 13 KB）
- CSP 是 `default-src 'self'`，外部字体一律被拦 → 必须下载到 `public/fonts/` 自托管
- ⚠️ 按字子集返回的是 `fonts.gstatic.com/l/font?kit=...`（**没有 .woff2 后缀**），
  正则别只匹配 `.woff2`

**拉丁保持衬线的实现**：`@font-face` 里加 `unicode-range` 限定 CJK 范围，
文件里其实也带了拉丁字形（抓子集时一并取的），但范围一限，拉丁就回落到全站衬线。

**逐字错落**：用固定的节奏表（`HERO_CHAR_RHYTHM`：字号 0.90–1.09、下沉 −0.02–0.03em），
由 `HeroType.tsx` 把 CJK 逐字拆成 `span`（`inline-block` 才吃 `transform`）。
**不用随机**：随机每次渲染都变，看起来像抖动；手写的错落是有规律的。

**标题改成刻意的两行**：换成行书 + 拉丁衬线后，`.text-7xl` 下中文与英文自然折成两行，
断点会随视口变化（一会儿一行一会儿两行）。索性做成版式：中文题字一行、英文署名一行，
`block` + 收紧行高。站长要一行的话，把字号降到 6xl 即可。

**顺带修的两处可读性问题**：
- 行书小字笔画细，副标题从 `text-lg/xl` 提到 `text-2xl/3xl` 并加 `letter-spacing: 0.06em`
- 印章 0.7rem 时行书糊成一团 → 0.8rem、印章块 2.25→2.5rem

### 30.8 阶段 2 验证

- `tsc` / `eslint` / `npm run build` 全过
- 真机截图：1280×800、1920×940 两态 + 390×700 两态（`.ui-shots/home-hero/`）
- 首屏行为冒烟 4 项全过：**按钮仍在命中测试最上层**（`elementFromPoint`）、
  点按钮落到 801px、滚轮落点与按钮一致、水合后场景属性存在
  —— 排版改动动了标题 DOM，这三条最容易被波及，所以单独验了一次
- 字体实测：`getComputedStyle(h1).fontFamily` = `"Hero Xingshu", "Noto Serif SC", …`，
  `document.fonts.check('400 1em "Hero Xingshu"')` 为 true（子集真的用上了，不是回退）

### 30.9 改首屏文案时必做（否则字体掉回系统字体）

```python
# 用 Python 跑（本机 HTTPS 走代理，curl/PowerShell 在这台机器上不通）
# 只改 TEXT 与 FAMILIES，然后把产物放回 public/fonts/
import urllib.parse, urllib.request, re
TEXT = "你好，我是LanKnight天行健君子以自强不息码农·游戏玩家生活记录者全栈开发云原生AI探索阑客"
FAMILY = "Zhi+Mang+Xing"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"
opener = urllib.request.build_opener(
    urllib.request.ProxyHandler({"https": "http://127.0.0.1:7897"})
)
css = opener.open(urllib.request.Request(
    f"https://fonts.googleapis.com/css2?family={FAMILY}&text={urllib.parse.quote(TEXT, safe='')}",
    headers={"User-Agent": UA})).read().decode()
url = re.findall(r"url\((https://fonts\.gstatic\.com/[^)]+)\)", css)[0]  # 注意没有 .woff2 后缀
open("public/fonts/hero-zhi-mang-xing.woff2", "wb").write(
    opener.open(urllib.request.Request(url, headers={"User-Agent": UA})).read()
)
```

**不要忘了**：改完文案后，`HERO_CHAR_RHYTHM` 是按字数循环的，
新文案的字数变了，错落的节奏会整体错位一格 —— 换个新文案时顺手看一眼截图。

### 30.10 阶段 3：响应式与性能实测（附一次 CLS 归因）

四档视口 + 限速测量，全部是真数字（headless Edge + CDP）：

| 项 | 结果 |
| :--- | :--- |
| 横向溢出（375 / 768 / 1280 / 1920） | **0px**（行书字面窄，反而比宋体更宽裕） |
| LCP（热缓存） | 180–250ms，LCP 元素是首屏 `<img>` |
| LCP（**首访冷缓存** + Slow 4G + 4× CPU） | **3156ms**（改字体前 3872ms）—— **超 2s，见下** |
| CLS（修复后） | 四档全 **0** |
| `prefers-reduced-motion` | 运行中的动画 **0 个**，转场时长 1e-05s |
| 触屏轻点切换 | 375 视口下正常，且换用竖版图 |

> ⚠️ **更正一个我自己的错**：我第一版报的「限速 LCP 432ms」是**带缓存**测的
> （stage3 脚本没关缓存，而限速那一轮之前已经导航过同一页面）。
> 关掉缓存重测才是真实首访：**3872ms**。这类「测出来很好看」的数字必须交代口径。

**首次加载体积构成**（禁缓存、首访，合计 ≈ 1965KB）：

| 体积 | 文件数 | 类别 | 最大单文件 |
| :--- | :--- | :--- | :--- |
| **1476KB** | 21 | `next/font` 字体（既有） | 103KB |
| 185KB | 2 | 首屏图（本次） | 106KB |
| 155KB | 12 | JS 分块（既有） | 70KB |
| 85KB | 3 | CSS | 67KB |
| 40KB | 14 | 其它（含 favicon 26KB） | 26KB |
| 13KB | 1 | 行书子集（本次） | 13KB |

**关键发现（推翻了既有注释）**：那 1476KB 不是「拉丁字形」，而是
**`Noto Serif SC` 的中文分片真的被打下来了**（21 个 woff2、每个 67–103KB）。
`layout.tsx` 里写着「中文字形通过系统宋体栈兜底」——**这句话是错的**：
中文实际由网页字体渲染。所以 LCP 才被拖到 3s。

**本轮做掉的安全优化（零视觉变化）**：
- 删掉 `Geist`（无衬线）：全站没有一处引用 `font-sans`，`--font-sans` 改为系统栈
- 删掉 `Noto Serif SC` 的 900 字重：全站没有 `font-black` / `900`
- 删掉手写的图片 `preload`：两张图本来就是 eager `<img>`，且 SSR 里 React
  会再提升一份 → HTML 中出现 8 条重复链接（实测数过）

**没有做、也不该擅自做的**：让中文回落到系统宋体（能省 1.4MB、LCP 进 1.5s 内），
但会改变全站中文观感 —— 这属于字体方案决策，已记进 HANDOVER 6.5 待用户拍板。

**CLS 0.165 的归因过程（值得记下来）**：

1. 先怀疑书法体换字（`font-display: swap` 会让行书晚到、标题高度变化）。
2. 用 `layout-shift` 的 `sources[].currentRect` 打出矩形，看到
   `DIV.max-w-6xl @380,0 1152x64` —— **x 从 384 变成 380**，是横向位移。
   1152 = `max-w-6xl`，384 = (1920-1152)/2。也就是说**可视宽度少了 8px**。
3. 用 `Network.setBlockedURLs` 分别屏蔽字体/图片/next-font 做对照：
   数字纹丝不动 → 排除字体与图片。
4. 结论：**滚动条出现**（流式渲染中文档高度跨过一屏）导致可视宽度变化。
5. 又发现第二个位移源 `footer.site-footer`：`loading.tsx` 的骨架比一屏矮，
   页脚先出现在首屏里，内容流式到达后被推走。

**两处修复（都是 1 行，且对全站有益）**：

- `html { scrollbar-gutter: stable }` —— 预留滚动条位置，不再横向跳
- `loading.tsx` 的外层加 `min-h-[calc(100vh-4rem)]` —— 页脚从一开始就在折叠线下

修复后：首页 CLS 0.165 → **0**，`/blog` 从 0.138 → **0.007**，
其余页面保持 0。LCP 也从 616ms 降到 432ms（限速口径）。

> ⚠️ 上面这句「616ms → 432ms」后来被证明是**带缓存**测的，真实首访数字见 30.10 的更正。

### 30.11 验收当天改的一处：悬停热区收回「主标题」

站长真机验收 7 项全过，但发现一个交互问题：

> 「原方案是鼠标悬停在主标题『你好，我是 lanKnight』上才会切换屏幕，
> 但是现在是只要鼠标在页面上就会切换。」

**这其实是按 Q2 的选择做的**（当时选的是「整屏悬停」），验收后改回了主标题区。
记录这件事是因为它说明：**方案确认时的选择题答案，真机看过之后可能还要改** ——
所以「验收」这一环不能省。

改动很小：悬停的 `pointerenter/leave` 从 `<section>` 挪到包住标题与箴言的那个
`div.grid`（与改造前的做法一致），并加了 `data-hero-hover-zone` 作为验证钩子；
轻点热区仍然是整块首屏（触屏没有悬停，点得太小很难用）。

**顺带踩了一个自己造的新坑**：把悬停热区收窄后，
「这次交互是鼠标还是触摸」的记录还留在标题的 `pointerenter` 里 ——
于是点在标题**以外**的地方永远判定成鼠标，**触屏轻点直接失效**。
修法：在整块首屏上补 `onPointerDown` 记录 `pointerType`。
（教训：热区可以收窄，但**判断输入类型的钩子必须挂在最外层**。）

验证（都是真浏览器）：
- 悬停主标题 → 切；悬停画面右半 / 首屏左下 / 副标题 / 向下按钮 → 都不切（5 条）
- 触屏轻点首屏非标题处 → 能切、再点回雪山（2 条）
- 切页冒烟 5 条：按钮命中测试在最上层、按钮落点 801px、滚轮落点一致、
  悬停标题后下滚会先收回雪山再切页

---

## 31. 首屏动态（阶段 A：雪 / 月晕 / 落印 / 鸟 / 灯火）

### 31.1 范围（选择题定稿）

分阶段推进，**本轮只做纯 CSS 一批**：

| 做 | 不做（下一批 / 不做） |
| :--- | :--- |
| 雪落（**只在雪山态**）、月晕呼吸、印章落印、鸟飞、灯火微闪 | 雾（站长：「不做雾难度有点高」）、指针视差、墨晕转场（下一批，且「先做一版看效果再定」） |

强度取**克制**档；验收＝站长起本地服务亲眼看 + 我提供帧率数据。
顺带定了条协作规则：**要拍板的事一律用选项工具弹在聊天框里**（已写进 HANDOVER 第 0 节）。

### 31.2 实现

- **层位**：`.hero-fx` 在 `.hero-scrim` 与文字**之下**，动态不参与可读性
- **雪**：远层是平铺纹理（零 DOM，位移量正好等于一格瓦片高度 = 无缝循环）；
  近层 20 个雪点，参数用**固定种子**伪随机生成（`Math.random` 会让 SSR 与客户端不一致）
- **月晕**：给已有的 `.hero-night-moon` 加 12s 的 opacity 呼吸
- **落印**：进入江湖态时印章 300ms 从 1.45 倍压到 1 ——
  靠「选择器匹配即播动画」实现，离开后规则消失、下次进入会重播
- **鸟**：3 只 17px 描边剪影横穿；位移用 `translate` 属性、缩放用 `transform`，互不覆盖
- **灯火**：酒旗位置一团 `mix-blend-mode: screen` 暖光，4.6s 明暗；竖版按断点重新定位
- **暂停**：新增 `use-hero-motion`（十几行），只在首屏可见且前台时让动画跑，
  只往 `<html>` 写 `data-hero-motion="paused"`，不碰 React 状态

### 31.3 五个坑（都记下来）

1. **白点在米白纸上等于没有。**
   第一版是「白色雪点 + 灰晕」，截图里几乎看不见，我一度走「加量」的路（20 → 40）。
   站长一句点破：**「雪不可见可能是与原图背景颜色太一样，优先把雪改灰一点点，而不是加量」**。
   改成冷灰本体 `rgba(146,158,168,.92)` + 一丝白边、数量退回 20 → 两帧差异 3.06%，肉眼可见。
   **教训：对比度不够先调颜色，别堆数量。**
2. **4× CPU 下江湖态 p95 33.4ms。** 根因是全屏月晕径向渐变每帧改 opacity → 每帧重绘。
   加 `will-change: opacity` 提成独立层后回到 16.7ms（灯火同理）。
3. **FPS 采样被截图污染。** PNG 编码很吃 CPU，紧接着采样会把它的开销算进帧间隔 ——
   「p95 33ms」是假警报。采样前静置 1.5s，两态 p95 都是 16.7ms。
4. **reduced-motion 要整层隐藏，而不是只停动画。**
   停住的雪只是一张撒了白点的画，停住的鸟会挤在左边缘。
   `.hero-fx { display: none }`，月晕保留静态。
5. **离屏仍在跑 = 白耗电。** CSS 不知道元素在不在视口里，
   所以补了 `use-hero-motion`：IntersectionObserver（含 120px 余量）+ `visibilitychange`。

### 31.4 验证数据

| 项 | 结果 |
| :--- | :--- |
| 雪山态两帧差异（画面右上无文字区） | **3.06%** 像素变化 |
| 江湖态鸟飞带 / 灯火区域 | 0.14% / **9.47%** |
| 帧间隔（4× CPU 降速） | 雪山 p95 **16.7ms**；江湖 p95 **16.8ms**；长任务 **0** |
| 离屏暂停 | `data-hero-motion=paused`，雪点 `animation-play-state=paused` |
| reduced-motion | `.hero-fx display:none`，运行中动画 **0** |
| 手机 390×700 | 可见雪点 **12**（桌面 20），灯火换竖版位置 |

### 31.5 已知限制（第一版）

- 雪点只有 20 个，观感是「细雪 / 雪尘」而不是大雪 —— 有意克制，要更密说一声
- 鸟与灯火是**贴上去的装饰**，与原画里那几只鸟不是同一批；鸟的纵向位置按画面大概对齐
- 灯火在竖版里的位置是估的（竖版裁切后酒旗位置不同），CSS 里按断点单独给了值
- 雾没做；视差与墨晕转场留待下一批

### 31.6 第二轮返工（站长验收后：雪太小太少、不斜，月晕/鸟/灯火都不明显）

站长原话：**「雪花有效果，但是数量不够且雪花有点小，看起来雪下得不大；
而且冬天都是风雪交加，所以雪花不是垂直下落」「月晕、鸟、灯火都不明显，灯火可以忽明忽暗」**。
参数用选项工具定：中等偏大 / **风从右侧来** / 中速 / 月晕明显 / 鸟明显带拍翅 /
灯火不规则忽明忽暗 / **补一层轻风痕** / 性能冲突时先砍近景大雪点。

改法：雪拆成「远层纹理 + 中景 24 + 近景 12」，尺寸 2.5–9px、带风摆与约 23° 斜落；
月晕 7s / 0.5→1 并轻微缩放；鸟 5 只 18–26s 且拍翅；灯火 3s 不规则 0.28→0.9。

**这轮挖出两个真 bug（都不是"调参"问题）：**

1. **鸟的位移用了百分比。** 第一版写 `translate: 114%` —— 百分比是相对**元素自身**
   （17px）算的，于是整只鸟一辈子只挪了 19px。所以"鸟不明显"不是速度慢，
   是它几乎没动。改法：换成 `vw`（106vw → -10vw）。
   **教训：想让位移跨过屏幕，必须用视口单位；百分比是相对自身的。**
2. **动态层被放在「文字底衬」之下。** 底衬是纸色半透明渐变（下半部近乎不透明），
   雪落到下半屏就被冲淡 —— 截图里只有上半屏有雪。
   改法：把 `.hero-fx` 移到 `.hero-scrim` **之后**（仍在文字之下，文字容器带 z-10）。

风向同样是量出来的：第一版横向漂移 120–180px / 880px 落程 ≈ **10°**，看着仍像直落；
放大到 300–420px（中景）、420–600px（近景）后实测约 **23°**。

### 31.7 第二轮验证数据

| 项 | 结果 |
| :--- | :--- |
| 雪点规模 | 中景 24、近景 12、风痕 4（手机 12 / 6 / 2） |
| 雪点 1.2s 实测位移 | 横向 **-24px**、纵向 **+56px** → 斜落约 23°（向左 = 风向正确） |
| 第一只鸟 1.2s 位移 | **-88px**（约 73px/s，与 18–26s 穿屏一致）；拍翅 `hero-bird-flap` |
| 动画名称 / 时长 | 月晕 `hero-moon-breath`/7s、灯火 `hero-lamp-flicker`/3s、印章 `hero-seal-stamp` |
| 两帧像素差异 | 雪山 0.75%（取样区）、鸟带 0.27%、灯火区 3.51% |
| 帧间隔（4× CPU） | 雪山 p95 **16.8ms**、江湖 p95 **16.8ms**（偶发一帧 33.4ms），长任务 **0** |
| 离屏暂停 | `data-hero-motion=paused`、雪点 `paused` |
| reduced-motion | `.hero-fx display:none`、运行中动画 **0** |



