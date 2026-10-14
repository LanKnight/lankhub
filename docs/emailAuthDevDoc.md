# 邮箱验证与验证码登录 · 完整开发文档

> 项目：lankHub（Next.js 16 App Router + Auth.js v5 + Prisma 7 + SQLite）
> 本文档**取代**原先的 `docs/siteEmailLogin.md`（那份描述的是一个独立的 Python 脚本，与本项目无关，见第一节）
> 状态：**方案已定稿，尚未开始编码**
> 最后更新：2026-10-13

---

## 一、必读：现状真实清单（先说清哪些是「已有」、哪些是「我以为有」）

这一节刻意写得直白，因为**立项时的两个前提与实际不符**，不先对齐就会写偏。

### 1.1 已经具备的

| 项 | 状态 | 证据 |
| :--- | :--- | :--- |
| Resend 账号 + API Key | ✅ 已有 | 服务器环境变量 `RESEND_API_KEY`（值不写入本文档） |
| 发件域名 DNS 验证 | ✅ 已完成 | `lankhub.xyz` 的 DKIM / SPF / DMARC 全部 Verified |
| 「能发出邮件」这件事 | ✅ 已实测 | 用 `lanknight@qq.com` 收到过验证码邮件 |
| 现成的账号密码登录 | ✅ 可用 | `src/lib/auth.ts` 的 Credentials provider |
| 登录限流 | ✅ 已有 | `src/lib/rate-limit.ts`，按「邮箱+IP」与「IP」两道 |
| 改密码能力 | ✅ 已有 | `changePasswordAction`（需输入旧密码） |

### 1.2 **不具备**的（重点）

| 项 | 状态 | 说明 |
| :--- | :--- | :--- |
| 项目里的邮件发送能力 | ❌ **完全没有** | `package.json` 里没有 `resend`；全仓库 grep「resend / 验证码 / 邮件」只命中文档 |
| 邮箱验证状态字段 | ❌ 没有 | `User` 模型上没有 `emailVerified` / `emailVerifiedAt` |
| 验证码存储表 | ❌ 没有 | `prisma/schema.prisma` 里没有相关模型 |
| Auth.js 自带的 `VerificationToken` | ⚠️ **表存在但从未被使用** | 是加 `PrismaAdapter` 时一起建的，没有任何代码引用它 |
| 注册流程 | ⚠️ 行为奇怪，见下 | 邮箱重复时**假装注册成功**（防枚举），用户实际拿不到账号 |
| 忘记密码 | ❌ 没有 | 只有「登录后改密码」，忘了密码就没有入口 |

### 1.3 ⚠️ 关于「之前邮件验证过邮箱发验证码」的纠正

**这句话不成立。** 真实情况是：

- 被验证的是**一段独立的 Python 脚本**（原文档里的 `aaa.py`），跑在本机
- 它证明的是「Resend 域名配置正确、能发出邮件」
- 它**从来没有接入这个 Next.js 项目**——没有任何一行 Go/TS 代码调用过它

所以本次不是「补全已有功能」，而是**从零把邮件能力接入**。
好处是：Resend 侧（域名、DNS、Key）已经就绪，那部分不用再花时间。

### 1.4 ⚠️ 安全事件：API Key 前缀已随文档进入公开仓库

原 `docs/siteEmailLogin.md` 里有一处「脱敏输出」，形如：

```
re_********
```

**它不是完全脱敏** —— Resend Key 的格式是 `re_` + 约 8 位随机字符，
而那段输出**保留了前 8 个真实字符**，只把后面换成了星号。
该文件已提交并推送到 GitHub（公开仓库）。

**风险评估**：仅有前缀**不足以**盗用（还差后面若干位）。属于「不该出现」而非「已经泄露」。

**处置（三步，必须做）**：

1. 到 [resend.com/api-keys](https://resend.com/api-keys) **吊销这个 Key 并新建一个**（最干净）
2. 本文档与 README 中一律只写 `re_********`，**不得出现任何真实字符前缀**
3. 新 Key 按第七节的正确方式交给应用读取（不要再用 `/etc/profile.d`）

> ⚠️ 旧的 `docs/siteEmailLogin.md` 里那处前缀**已随 git 历史永久存在**，
> 本文档取代它之后**新提交里不会再有**，但历史仍在。
> 因此**第 1 步（吊销旧 Key）才是真正解决问题的动作**，改文档只是止血。

### 1.5 ⚠️ 最高风险项：`/etc/profile.d` 里的 Key，PM2 很可能读不到

原文档把 Key 放在 `/etc/profile.d/resend.sh`。**这条路对 PM2 基本不可靠**：

- `/etc/profile.d/*.sh` 只在**登录 shell** 中被 source
- PM2 通常由 systemd 或 ssh 非登录 shell 启动，**启动那一刻的环境被冻结**写进 PM2 进程表
- 之后你再 `source` 新文件、重新登录，**已经在跑的 PM2 进程不会更新**

**后果**：代码写好后线上发信报 `401 Unauthorized`，而这个报错看起来像「Resend 拒绝」，很难联想到环境变量。

**开工前必须先验（这是第一步，不是可选项）**：

```bash
# 看 PM2 进程里到底有没有这个变量
pm2 env 0 | grep -i resend
# 或者（进程名按实际改）
tr '\0' '\n' < /proc/$(pgrep -f "next-app" | head -1)/environ | grep -i resend
```

- **有输出** → 可以继续，但仍建议按第七节改为 `.env`（更可控）
- **无输出** → 必须改，否则本次功能一定失败

> **✅ 实测结论（2026-10-13）**：站长在服务器上执行 `pm2 env 0 | grep -i resend`
> **无输出** —— 证实了上述推断，Key 确实没有被 PM2 进程读到。
> 因此本次一律改为 `.env` 方案（第七节）。

### 1.6 「PM2 读不到 .env」的完整原因链与自检

`.env` 能被读到有个**前提**：PM2 启动进程时的**工作目录必须是项目根**。
Next.js 是按工作目录去找 `.env` 的，工作目录不对就找不到、而且**不报错**。

```bash
pm2 describe next-app | grep -E "script path|exec cwd|script args"
```

- `exec cwd` 应当是项目根（如 `/root/lankhub`）
- 若不是，用这条纠正（在项目根目录下执行）：
  ```bash
  cd /root/lankhub
  pm2 delete next-app
  pm2 start npm --name next-app -- start
  pm2 save
  ```

**判断「进程到底读到了什么」的唯一可靠方式**是 `/api/auth/email-health`
（见 7.2），它比 `echo $VAR`、比 `pm2 env` 都更接近真相 ——
因为它是**跑在 PM2 里的那个 Node 进程自己**回答的。

---

## 二、本阶段范围

已与站长确认，**四件事一起做**：

| # | 场景 | 说明 |
| :--- | :--- | :--- |
| 1 | **注册时验证邮箱** | 注册必须验证邮箱，避免「用别人的邮箱注册」 |
| 2 | **验证码登录（免密码）** | 输邮箱 → 收码 → 输码 → 直接登录 |
| 3 | **忘记密码** | 忘了密码时用验证码重置 |
| 4 | **改密码时验证** | 已登录用户改密码时多一道邮箱验证 |

**明确保留**：原来的「邮箱 + 密码」登录**继续可用**，验证码是并存的第二条路。

> **取舍说明**：保留密码登录意味着「密码泄漏」仍是一条攻击路径。
> 之所以保留，是因为**Resend 挂了就谁也登不上**对个人站点风险更大。
> 若将来想彻底去掉密码登录，只需禁用 Credentials provider，其余代码不用动。

**明确不做（本期）**：短信验证、第三方 OAuth（GitHub/微信）、二次验证（2FA）、
登录设备管理、异常登录告警。这些都留到以后，本文档不展开。

---

## 三、关键架构决策（含理由，避免以后被"优化"回坑里）

### 3.1 自写 6 位验证码，而不是用 Auth.js 自带的邮件链接

| | 自写验证码（**选这个**） | Auth.js Email provider |
| :--- | :--- | :--- |
| 邮件内容 | **6 位数字**，界面里输入 | 一个**链接**，点了才登录 |
| 手机上体验 | **好** | **差**——点链接常在另一个浏览器打开，登录态对不上 |
| 复用 | 自己写（但不复杂） | 现成的 `VerificationToken` 表 + Adapter |
| 与站长预期 | ✅ 一致 | ❌ 不一致 |

**理由**：站长明确要验证码；「点邮件链接登录」在手机上登录态错位是真实痛点。

### 3.2 验证码**存 HMAC 哈希**，不存明文

```ts
hash = HMAC-SHA256(AUTH_SECRET, `${email}:${scene}:${code}`)
```

- **为什么用 HMAC 而不是 bcrypt**：bcrypt 每次比对约 100ms，而验证码只有 6 位（100 万种），
  真正防暴力的是**错误次数上限**而不是哈希强度。HMAC 让「6 位码 → 库里的值」
  变成单向不可逆，足够；且不引入计算开销
- **为什么加 email 与 scene 做盐**：同一个验证码在不同邮箱/场景下哈希不同，
  避免彩虹表式的跨记录比对
- **代价**：库里看不到明文，**排查问题时不能直接读库**。所以：
  - 开发环境（`NODE_ENV !== "production"`）允许在日志里打印验证码，**仅此一种情况**
  - 生产环境日志里**绝不出现明文验证码**

### 3.3 统一一张 `EmailCode` 表，用 `scene` 区分场景

不建四张表。四个场景（注册 / 登录 / 重置密码 / 改密码）的字段完全一致，
只是用途不同。统一表带来两个好处：

1. 限流可以统一按 `(email, scene)` 做
2. 将来加场景（如「换绑邮箱」）不用改表结构

### 3.4 注册分两步：先建**未验证**账号，验证通过才算注册完成

> **标题修正记录**：本节原题为「注册用 `pending` 状态占位」，
> 那是早期设想（另建一张 pending 表暂存注册意图）。
> 最终实现**没有**用 pending 表，而是直接建 `User` 并把
> `emailVerifiedAt` 留空 —— 字段更少、邮箱唯一索引直接生效。
> 标题与内容已按实际实现改写，避免以后有人按旧设想动手。

**问题**：现在注册时邮箱重复会**假装成功**（防邮箱枚举），用户实际拿不到账号，
既困惑又没提示。

**方案**：注册分两步。

```
第一步：填昵称 + 邮箱 + 密码
        → 校验通过后创建 User（emailVerifiedAt = null）
        → 发验证码（scene = register）
第二步：输验证码
        → 通过则 emailVerifiedAt = now，注册完成
```

**还有一条必须实现的**：若邮箱被一个**未验证**账号占用（上次注册到一半放弃了），
**覆盖它**（更新昵称与密码）而不是报错 —— 否则那用户会永久卡死，
因为那个账号他登不上、又没有别的入口能继续。**已验证账号绝不被覆盖。**

**这里有一个必须讲清的安全点**：

> 如果邮箱**已被已验证的账号占用**，这一步要**明确返回 409「该邮箱已注册」**。
>
> 这确实**暴露了「某邮箱是否已注册」**。但这不构成账号劫持：攻击者拿不到邮件，
> **无法完成验证**，因此拿不到那个账号。而好处是用户能得到明确提示，
> 不再出现「注册成功但登不上」这种让人困惑的行为。
>
> 这是一个**有意的取舍**：牺牲一点邮箱枚举抗性，换取可用的用户体验。

**未验证账号的清理**：必须有清理任务，否则会被注册垃圾撑爆。

```
npm run db:cleanup-unverified   # 删除创建超过 24 小时且 emailVerifiedAt = null 的账号
```

建议挂到服务器 crontab 每天跑一次。**注意**：只删「从未验证过」的账号，
不会动任何已验证用户。

### 3.5 邮箱枚举：按场景区别对待

| 场景 | 邮箱不存在时 | 理由 |
| :--- | :--- | :--- |
| `register` | **明确报错**（409 已注册 / 正常发码） | 见 3.4，用户需要明确反馈 |
| `login` | **统一返回「若该邮箱已注册，验证码已发送」** | 这是最容易被拿来探测账号的入口 |
| `reset` | **同上，统一话术** | 同上 |
| `change` | 已登录用户，邮箱必然存在 | 无需处理 |

### 3.6 全局发信配额硬闸（**这是本站最容易被忽略的风险**）

Resend 免费额度是 **100 封/天、3000 封/月**。若被恶意刷验证码，
**额度会被迅速烧光，之后连你自己都发不出去**。

因此除「按邮箱/按 IP」限流外，必须再加**全局闸**：

| 层级 | 限制 | 目的 |
| :--- | :--- | :--- |
| 单邮箱冷却 | 同 `(email, scene)` **60 秒**一次 | 防连点 |
| 单邮箱日限 | 同邮箱 **10 封/天** | 防针对一个邮箱刷 |
| 单 IP 日限 | 同 IP **30 封/天** | 防换邮箱刷 |
| **全站日限** | **80 封/天** | 留 20 封余量给其它用途 |
| **全站月限** | **2500 封/月** | 留 500 封余量 |

**全站配额必须持久化**（不能只存内存），否则 PM2 重启就归零、失去意义。
方案：用 `EmailCode` 表按 `createdAt` 计数即可，**不需要额外表**。

**兜底**：配额耗尽时返回明确文案「今日验证码发送量已达上限，请明天再试」，
而不是静默失败——否则站长会以为是 Resend 挂了。

### 3.7 站长可一键关闭邮件功能

`ResumeProfile` 之类的单例表不适合放配置。用**环境变量** `EMAIL_ENABLED`（默认 `true`）即可：

- 出问题时把 `EMAIL_ENABLED=false` 写进 `.env` 并 `pm2 restart next-app`，
  所有发码接口直接返回「邮件功能暂时关闭」
- **密码登录仍然可用**（这正是 3.1 保留密码登录的价值）

---

## 四、数据模型

### 4.1 改动一：`User` 增加验证状态

```prisma
model User {
  // ...其余字段不变
  /// 邮箱验证时间。null = 未验证（注册后尚未输码）
  /// 用 DateTime 而不是 Boolean：顺带留下「何时验证」的审计信息，
  /// 而且与 Auth.js 的 emailVerified 语义相容，将来换 adapter 不用改字段含义
  emailVerifiedAt DateTime?

  /// 反查用：未验证账号清理任务要按这个字段筛
  @@index([emailVerifiedAt])
}
```

> **对存量数据的影响**：站长账号与其它现存账号需**一次性标记为已验证**，
> 否则上线后他们会被当成未验证而无法登录。用一个脚本处理：
> ```bash
> npm run db:verify-existing    # 把所有 emailVerifiedAt = null 的账号标记为已验证
> ```
> 站长说他已删除除自己外的所有账号，所以这条实际上只会影响**一个**账号，
> 但脚本仍要写（因为别人克隆这个仓库部署时会有存量）。

### 4.2 改动二：新增 `EmailCode`

```prisma
/// 邮箱验证码。四个场景共用一张表，用 scene 区分。
/// ⚠️ 这里存的是 HMAC 哈希，**不是明文**（见 3.2）
model EmailCode {
  id        Int      @id @default(autoincrement())
  email     String
  /// register | login | reset | change —— 用字符串而不是 enum：
  /// SQLite 下 Prisma enum 支持有限，且加场景时不必改表
  scene     String
  codeHash  String
  expiresAt DateTime
  /// 已尝试比对次数，达到上限后该记录直接作废（防暴力猜 6 位码）
  attempts  Int      @default(0)
  /// 用后即焚：消费后置为当前时间，不再可用
  consumedAt DateTime?
  createdAt DateTime @default(now())

  /// 取「该邮箱该场景最新的有效码」是最高频查询
  @@index([email, scene, createdAt])
  /// 全站配额统计与清理任务按时间扫
  @@index([createdAt])
}
```

### 4.3 不改动的东西

- `VerificationToken` 表：**保持不变**，仍不被使用。它是 `PrismaAdapter` 的一部分，
  删掉需要同时改 adapter 配置，**属于无收益的风险**。文档里记一笔即可
- `Session` / `Account` 表：JWT 会话策略下不使用，保持不变
- `User.password`：**保持必填**（保留密码登录，见 3.1）

---

## 五、接口设计

> **本节的接口清单已按实际实现更新**（阶段 5 完成后回填）。
> 原文档里规划的名字（`login-by-code`、`verify-code`）与最终实现不同，
> 差异的原因写在各小节里。

### 5.1 实际实现的接口清单

| 接口 | 方法 | 说明 | 状态 |
| :--- | :--- | :--- | :--- |
| `/api/auth/send-code` | POST | 发码。`{ email, scene }`，各场景返回策略不同（见 5.3） | ✅ |
| `/api/auth/register` | POST | 注册第一步：建（或覆盖）**未验证**账号 + 发码 | ✅ |
| `/api/auth/verify-email` | POST | 注册第二步：校验码并写 `emailVerifiedAt` | ✅ |
| `/api/auth/forgot-password` | POST | 请求重置码（**防账号枚举**，见 5.4） | ✅ |
| `/api/auth/reset-password` | POST | 校验码 + 重置密码（**同一请求内完成**） | ✅ |
| `/api/auth/change-password` | POST | 已登录改密：旧密码 + 验证码 + 新密码 | ✅ |
| `/api/auth/email-health` | GET | 邮件配置自检（只回长度，不回 Key） | ✅ |
| 验证码登录 | —— | **不设 HTTP 接口**，改由 Server Action 实现（见 5.5） | ⏳ 阶段 6 |

### 5.7 ⚠️⚠️ 删账号后会话不失效（上线后实测发现的严重缺口，已修）

**这是本功能里最危险的一个问题，记在这里。**

现象：在服务器上删掉一个账号后，**那个账号仍然能正常登录、能听音乐**。
最初的怀疑是「移动端缓存没清」，实测**排除了**这个猜测 —— 与缓存无关，
换设备、清缓存都一样能用。

**根因**（`src/lib/auth.ts` 的 session 回调）：

```ts
const dbUser = await prisma.user.findUnique({ where: { id: userId }, ... })
if (dbUser && session.user) { ... }   // ← 查不到用户时什么都不做
return session                         // ← 照样把旧快照当有效会话返回
```

而 `getCurrentUser()` 只检查 JWT 里的 `user.id` 是否存在，**从不确认这个用户还在不在**。
JWT 一旦签发，在有效期内一直有效、服务端无法主动吊销 —— 所以「删账号」对它毫无影响。

实测证据（删号前后用同一个 cookie）：

| 请求 | 删号前 | 删号后 | 无 cookie（对照） |
| :--- | :--- | :--- | :--- |
| `/api/auth/session` | 返回用户 | **仍返回用户** | `null` |
| `/api/music/play` | 502（认证通过） | **仍 502（认证通过）** | **401** |

第三列是关键对照：它证明第二列的 502 确实是「认证被放行」而不是别的原因。

**修复（三件事配合，缺一不可）**：

1. `getCurrentUser()` 改为**查库确认用户存在**，不存在则返回 null
   → 所有需要登录的接口自动 401，新增接口也自动受保护
2. session 回调查不到用户时**返回 null**，不再把旧快照当会话
   → `/api/auth/session` 响应 null，客户端 `useSession()` 得到未登录
3. 新增 `components/auth/SessionGuard.tsx`：察觉「曾经登录过、现在未登录」时
   调 `signOut()` **把那个没用的 cookie 清掉**
   → 否则 cookie 一直留着，每次请求都白跑一趟、界面也留着「已登录」的残影

> ⚠️ 第 3 步的判定规则要小心：**不能**写成「有 cookie 但未登录就清」——
> 用户点登录的那一瞬间正是这个状态，那样会把正常登录流程打断。
> 必须用「本次页面生命周期内**曾经**是 authenticated，现在变成 unauthenticated」。

回归测试：`npm run auth:session-test`（10 项）。
它同时验证「权限即时生效」没被改坏 —— 改库后会话应立刻反映新角色。

**附带的诚实说明**：JWT 过期时间是 30 天，修复前一个被删的账号最长能继续用 30 天。
修复后是「下一次请求立刻失效」。

### 5.8 ⚠️ 校验与消费验证码必须在**同一个请求**里

原计划拆成「先校验拿凭证 → 再带凭证改密/重置」，实现时否掉了：

- 拆开就要引入一个「已验证凭证」的中间态（存哪、多久过期、能否重放），
  这是**纯增加的攻击面，收益为零**
- 所以 `reset-password` 与 `change-password` 都是**一次请求内**完成
  「校验 → 消费 → 改密码」
- 连带影响：`verify-email` 的职责被收窄成**只服务注册第二步**，
  名字也从规划时的 `verify-code` 改成 `verify-email`（名副其实）

> 这个矛盾是我在写 `verify-code` 时自己发现的：注释里一边写「校验通过」，
> 一边写「已经消费掉了」—— 那就意味着随后的改密请求无码可用。

### 5.3 发码接口按场景的返回策略

| 场景 | 账号不存在 | 邮箱被【已验证】账号占用 |
| :--- | :--- | :--- |
| `register` | 发码（账号已在第一步建好） | **409「该邮箱已注册，请直接登录」** |
| `login` | 200 + **统一话术，不发信** | 发码 |
| `reset` | 200 + **统一话术，不发信** | 发码（未验证账号也不发） |
| `change` | ——（收件人固定为当前登录用户，不接受客户端指定） | —— |

统一话术是「**若该邮箱已注册**，验证码已发送，请查收」——
既让真实用户知道去查收，又不告诉探测者该邮箱是否在库里。

配额类失败（冷却 / 日限 / 月限）**如实返回**，不套用模糊话术 ——
否则用户永远等不到邮件，却不知道原因。

`login` / `reset` 场景对不存在的邮箱**不发信**：否则攻击者能用这个接口
把任意邮箱当日志刷（收件人会在毫不知情的情况下收到本站邮件）。

### 5.4 注册：为什么未验证账号可以被「覆盖」重新注册

```
第一次注册            → 建账号（emailVerifiedAt = null）+ 发码
                        用户没验证就放弃了 …
第二次注册同一邮箱    → ① 已被【已验证】账号占用？→ 409「该邮箱已注册」
                        ② 被【未验证】账号占用？  → 覆盖它（改昵称/密码）再发码
                        ③ 没有账号                → 新建
```

**为什么覆盖而不报错**：那种账号是「注册到一半放弃」留下的，
用户自己也登不上（未验证会被登录拦），若报「已注册」就成了一个**没有出口的死角**。
覆盖是唯一不卡人的做法，而**已验证账号绝不会被覆盖**（走 ① 分支）。

### 5.5 验证码登录（阶段 6 的实现方式）

Auth.js 的 `signIn()` 在 Server Action 里可用，Route Handler 里不行。
因此验证码登录做成与现有 `loginAction` 并列的 **Server Action**
（`loginByCodeAction`），内部调 `signIn("email-code", { email, code })`。

为此需要一个**只在服务端内部使用**的 Credentials provider（id = `email-code`）：

```
authorize():
  1. 校验并消费验证码（scene = login）
  2. 检查 emailVerifiedAt 非空 —— 未验证则拒绝，并提示去完成验证
  3. 通过 → 返回与现有 credentials provider 相同 shape 的 user
```

> 这个 provider **不经过任何 HTTP 路由**，前端拿不到它的 CSRF token，
> 所以不存在「暴露一个免密登录接口」的风险。

#### ⚠️ 自定义错误码有两个坑（都实测踩过，务必按下面写）

**坑 1：`CredentialsSignin` 的构造参数会被忽略，必须显式赋值 `.code`**

```ts
// ❌ 自定义码会丢，前端收到的是 code=credentials
throw new CredentialsSignin("email-not-verified")

// ✅ 正解
const err = new CredentialsSignin("email-not-verified")
err.code = "email-not-verified"   // 必须显式赋值
throw err
```

原因：`CredentialsSignin` 的构造函数是 `super(...arguments)`，参数被丢弃，
而 `code` 在类里被固定初始化成 `"credentials"`。
Auth.js 只读**实例属性**（`@auth/core/index.js` 里 `params.set("code", error.code)`），
所以只有显式赋值才会进跳转 URL。

**坑 2：`error.message` 里没有 code，别去解析字符串**

实测把错误对象原样打印出来是：

```json
{
  "type": "CredentialsSignin",
  "code": "credentials",
  "kind": "signIn",
  "message": "Read more at https://errors.authjs.dev#credentialssignin"
}
```

`code=xxx` 那种形式**只出现在跳转 URL 里**，`message` 里没有。
所以要从错误对象上**直接读 `.code` 属性**。

> 我第一版就是拿正则去 `message` 里匹配 `code=xxx`，结果永远匹配不上，
> 所有失败都落到兜底文案 —— 表现为「验证码错误时提示不准确」，
> 很容易误判成前端文案问题。是靠一个临时诊断路由把错误对象打出来才定位的。

#### 为什么「未验证」要单独给一条提示

登录失败统一返回 null 时，前端只能显示「邮箱或密码错误」——
而用户真正的问题是他没去收验证码，反复试密码永远解决不了。
所以未验证时抛 `email-not-verified`，前端据此显示
「该邮箱尚未完成验证」+ 一个「重新发送验证码」的入口。

**但顺序是「先验密码，再查验证状态」**：反过来的话，
任何人都能凭一个未验证邮箱问出「这个账号验证过没有」，那是一条信息泄露。
实测确认：未验证账号 + 错误密码 → 「邮箱或密码错误」（不泄露状态）；
未验证账号 + 验证码登录 → 「该邮箱尚未完成验证」（可操作提示）。

### 5.6 已废弃的规划（保留说明，避免以后有人按旧文档实现）

| 原规划 | 实际 | 原因 |
| :--- | :--- | :--- |
| `POST /api/auth/verify-code`（带 scene） | 收窄为 `/api/auth/verify-email` | 见 5.2：改密/重置必须同请求完成校验 |
| `POST /api/auth/login-by-code` | 不设 HTTP 接口，改 Server Action | 见 5.5：免密登录不能是公开接口 |
| `register` 场景由 `send-code` 建号 | 由 `/api/auth/register` 建号 | 避免「光发码就产生一堆 user 记录」 |

#### 原始规划（存档）

```
POST /api/auth/send-code
Body: { email: string, scene: "register" | "login" | "reset" | "change" }
```

**返回策略按场景不同**（见 3.5）：

| scene | 情况 | 状态码 | 响应体 |
| :--- | :--- | :--- | :--- |
| `register` | 邮箱已被**已验证**账号占用 | 409 | `{ error: "该邮箱已注册，请直接登录" }` |
| `register` | 邮箱被**未验证**账号占用 | 200 | 重新发码（覆盖旧记录） |
| `register` | 邮箱可用 | 200 | 发码。**不在这里建号**，见下 |
| `login` / `reset` | 邮箱不存在 | 200 | `{ message: "若该邮箱已注册，验证码已发送" }`（**不发信**） |
| `login` / `reset` | 邮箱存在 | 200 | 同上话术（**发信**） |
| 任意 | 冷却中 | 429 | `{ error: "请求过于频繁，请 N 秒后再试" }` |
| 任意 | 全站配额耗尽 | 429 | `{ error: "今日验证码发送量已达上限，请明天再试" }` |
| 任意 | 邮件功能关闭 | 503 | `{ error: "邮件功能暂时关闭，请使用密码登录" }` |

> **`register` 场景不在这里建号**。建号发生在 `POST /api/auth/register`
> （见 5.2），避免「光发码就产生一堆 user 记录」。

---

## 六、安全清单（逐条都要有对应的代码与测试）

| # | 措施 | 实现要点 |
| :--- | :--- | :--- |
| 1 | 验证码由**服务端**生成 | 用 `crypto.randomInt(0, 1_000_000)` 补零到 6 位，**不用 Math.random** |
| 2 | 存 **HMAC 哈希**，不存明文 | 见 3.2 |
| 3 | 有效期 **10 分钟** | `expiresAt = now + 10min`，比对时检查 |
| 4 | **用后即焚** | 校验通过后写 `consumedAt`，同一码不可二次使用 |
| 5 | **错误次数上限 5 次** | 每次比对失败 `attempts++`；达到 5 次该记录**直接作废**（不看是否还在有效期内） |
| 6 | 比对用**时间安全**方式 | 用 `crypto.timingSafeEqual` 比较哈希，避免计时侧信道 |
| 7 | 单邮箱 **60 秒**冷却 | 发码前查最近一条 `createdAt` |
| 8 | 单邮箱 / 单 IP / **全站**配额 | 见 3.6，三级都要 |
| 9 | 防**邮箱枚举** | 按场景区别对待，见 3.5 |
| 10 | **日志脱敏** | 生产环境绝不打印明文验证码；API Key 只打印前 6 位（如 `re_***`） |
| 11 | **失败文案不泄露内部状态** | 「验证码错误或已过期」统一话术，不区分「不存在/过期/已用」 |
| 12 | **HTTPS** | 已在上一步完成（`https://lankhub.xyz`），验证码不会明文传输 |
| 13 | 邮箱规范化 | 全程 `trim().toLowerCase()`，与现有 `EmailSchema` 一致 |
| 14 | **不能拿未验证邮箱登录** | 密码登录与验证码登录都要检查 `emailVerifiedAt` |

> **第 14 条要注意存量影响**：上线前必须跑 4.1 的存量标记脚本，
> 否则站长自己会被挡在门外。

### 6.1 明确「不做」以及为什么

| 不做 | 理由 |
| :--- | :--- |
| 临时邮箱域名黑名单 | 维护成本高于收益（域名天天在变），且**邮箱验证本身就是为了防滥注册**，临时邮箱已能完成验证但留不住人，收益不大。**记录为已知限制** |
| 验证码图片 / 滑块 | 对「发邮件」这种低频操作过重，限流已足够 |
| 6 位以上 / 字母数字混合 | 6 位纯数字 + 5 次上限 + 10 分钟有效期，暴力破解期望次数远超上限。**用户体验更重要** |
| 同一码多设备复用 | 与「用后即焚」冲突，不做 |

---

## 七、环境变量与部署（含对 PM2 的修正）

### 7.1 新增环境变量

`.env.example` 增加：

```bash
# ---- 邮件（Resend）----
# 邮件功能总开关。出问题时设 false 并 pm2 restart next-app，密码登录不受影响
EMAIL_ENABLED=true
# Resend API Key，形如 re_xxxxxxxx
# ⚠️ 绝不提交到仓库；本地放 .env，服务器放 .env（见下）
RESEND_API_KEY=""
# 发件地址，必须是已在 Resend 验证过的域名
EMAIL_FROM="noreply@lankhub.xyz"
# 站点名，用在邮件正文里
EMAIL_SITE_NAME="lankHub"
```

### 7.2 ⚠️ 为什么不放 `/etc/profile.d`，改放 `.env`

**官方依据**（本项目 Next.js 16 的文档）：
`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md:18`

> Next.js has built-in support for loading environment variables from `.env*` files into `process.env`.

因此**不需要安装 `dotenv`**，也**不需要** `-r dotenv/config`。要点：

| 事实 | 含义 |
| :--- | :--- |
| Next.js 自动加载 `.env*` 到 `process.env` | 我们什么都不用做 |
| **不覆盖**已存在的 shell 环境变量 | 服务器上若已有同名变量，以 shell 的为准（便于临时覆盖测试） |
| `.env*` 已在 `.gitignore` 里 | 不会被误提交 |
| 变量在 **`next build` 时不会被内联**（未加 `NEXT_PUBLIC_`） | 改 Key **不需要重新构建**，但**需要 `pm2 restart`** 让进程重新读 |

**服务器操作**：

```bash
cd ~/lankhub
# 用你现有的 Key（或新生成的 Key）写入 .env
# ⚠️ 注意不要有多余空格与引号包裹问题
grep -q '^RESEND_API_KEY=' .env 2>/dev/null || echo 'RESEND_API_KEY=re_你的新key' >> .env
# 确认写入成功（只看长度与前缀，不打印全文）
awk -F= '/^RESEND_API_KEY=/{print "RESEND_API_KEY 长度=" length($2) ", 前缀=" substr($2,1,6)}' .env

# 让进程重新读取
pm2 restart next-app --update-env
```

然后在服务器上验证**应用真的读到了**（这一步比 `echo $VAR` 有意义得多）：

```bash
# 应用侧的自检接口（实现时一并加上，见 5.x 的自检路由）
curl -s http://127.0.0.1:3000/api/auth/email-health | head
# 期望：{"enabled":true,"keyLoaded":true,"from":"noreply@lankhub.xyz"}
```

> **为什么要有这个自检接口**：`echo $RESEND_API_KEY` 只能证明**你自己的 shell** 有，
> 证明不了 **PM2 里的 Node 进程**有。这个接口才是真的证据。
> 它**只回布尔值与发件地址，绝不回 Key 本身**。

### 7.3 一次性数据迁移

```bash
npm run db:push              # 加 emailVerifiedAt 字段与 EmailCode 表
npm run db:generate          # ⚠️ 必须紧接着跑！db push 不会更新生成的客户端
npm run db:verify-existing   # 把存量账号标记为已验证（避免把老人挡在门外）
```

### 7.3.0 ⚠️ 数据库备份文件的命名有个漏网之鱼（已修）

`.gitignore` 原本是 `*.db`，它**只匹配以 `.db` 结尾**的名字。所以
`dev.db.before-emailcode` 这类「带后缀的备份」**没被忽略** ——
实测 `dev.db` 被忽略、`dev.db.before-emailcode` 却没有，
一旦 `git add .` 就会把**含账号密码哈希与全部站内内容的数据库**
提交进公开仓库。

已补两条规则把「文件名某处含 `.db`」全部挡住：`dev.db.*` 与 `*.db.*`。

> 教训：本地改 schema 前备份数据库是对的，但**备份的命名要落在忽略规则内**。
> 做破坏性操作前先 `git status` 看一眼有没有新的未跟踪文件。

### 7.3.1 ⚠️⚠️ 新增路由后**必须重新构建**，`pm2 restart` 不够

**这是开发中真实踩到的坑，务必记住。**

```bash
git pull
npm run build          # ← 少了这一步，新路由根本不存在
pm2 restart next-app
```

**为什么**：`.next/` 是构建产物，`next start` 只是**读**它。
新增路由/页面/接口后 `pm2 restart` 不会重新构建，服务器上跑的仍是旧产物。

**症状极具误导性**：请求新接口时**不会** 404，而是落到 Auth.js 的
catch-all `/api/auth/[...nextauth]` 上，它返回

```
400 "Bad request."
```

—— 看起来像「Auth.js 拒绝了我」，而不是「这个路由不存在」。
本地怎么测都正常（因为本地构建过），只有服务器上是旧的
（因为服务上只 `git pull` + `pm2 restart`，没 `npm run build`）。

> 判据：如果本地同一个 commit 能通、服务器不通，**先怀疑服务器没重建**，
> 而不是怀疑路由怎么写。`ls -l .next/BUILD_ID` 的修改时间能一眼看出构建新旧。

### 7.4 清理任务

```bash
npm run db:cleanup-unverified   # 删除 24 小时未验证的账号
npm run db:cleanup-codes        # 删除超过 24 小时的验证码记录
```

建议 crontab：

```cron
30 4 * * * cd /root/lankhub && /usr/bin/npm run db:cleanup-unverified >> /var/log/lankhub-cleanup.log 2>&1
35 4 * * * cd /root/lankhub && /usr/bin/npm run db:cleanup-codes >> /var/log/lankhub-cleanup.log 2>&1
```

### 7.5 本阶段新增的命令

| 命令 | 作用 |
| :--- | :--- |
| `npm run db:verify-existing` | **功能上线前必须跑一次**：把存量账号标记为「邮箱已验证」（见 4.1）。否则包括站长在内的老用户会被「请先完成邮箱验证」挡在门外，而他们根本没收到过验证码 |
| `npm run db:cleanup-unverified` | 删除注册后超 24 小时仍未验证的僵尸账号（**绝不碰已验证用户**） |
| `npm run db:cleanup-codes` | 删除超 24 小时的验证码记录；顺带报告近 24 小时发码量，便于核对 Resend 配额 |
| `npm run email:test 你的邮箱` | **发一封测试邮件**，验证 Resend 链路真的通。手动执行、需服务器权限（**刻意不做成公开接口**，否则任何人都能拿你邮箱刷额度） |
| `npm run email:check` | **密钥泄露防线**：查自检接口行为、源码脱敏约定，并扫描全部 git 跟踪文件里有没有真实密钥。需应用在 3000 端口运行 |
| `npx tsx scripts/verify-code-test.mts` | **验证码核心逻辑的 57 项测试**（阶段 4 的产物）。见下方说明 |
| `npm run email:code-test` | 同上（npm 别名） |
| `npm run ui:check` | **浏览器检查**：真实启动应用 + 无头 Edge，检查三个页面能否渲染、有无 console 错误与运行时异常，并跑关键交互（35 项） |
| `npm run db:migrate` | **一条命令做对「改完 schema 之后」的全部三件事**：`db push` → `db generate` → `verify-existing` |
| `npm run auth:session-test` | **会话失效回归（10 项）**：验证删账号后 cookie 立刻失效（见 5.7），同时确认「权限即时生效」没被改坏 |
| `npm run ui:settings` | **/settings 三个入口与改密码双路的浏览器交互检查（32 项）**，会把真实会话 cookie 注入无头浏览器后访问受保护页面 |
| `npm run ui:measure-code` | **量「验证码」标签与发码按钮的实际像素偏移**。这是定位「按钮有一点歪」用的工具，见 9.1 |
| `npm run db:state` | 数据库体检：账号、验证码记录、内容表行数，并标出测试残留。加 `--clean` 顺手清理 |

> 三个 `db:cleanup-*` / `db:verify-existing` 脚本都支持 `--dry-run`（只打印、不写库）
> 与 `--hours N`（改保留时长）。改数据之前先用 `--dry-run` 看一眼是好习惯。
>
> ⚠️ 跑完测试记得 `npm run db:state -- --clean`。
> **全站发信配额是按全表统计的**，残留的验证码记录会把配额类测试挤爆，
> 而失败信息看起来像「配额逻辑坏了」（实测踩过）。

### 7.6 验证码逻辑的测试方式（阶段 4）

```bash
npx tsx scripts/verify-code-test.mts
```

**57 项断言**，覆盖第六节安全清单里的每一条。关键设计：

1. **不消耗 Resend 额度**：脚本起一个本地 mock HTTP 服务冒充 Resend，
   把 `RESEND_API_BASE` 指向它。正式的部署**不要设**这个变量。
2. **验证码从 mock 收到的请求体里读出来** —— 因为库里存的是 HMAC 哈希，
   读不出来。这也顺带证明了「库里确实没有明文」。
3. **跑完把测试数据删干净**，并断言库里记录数回到测试前的值。

其中最值得关注的几条（都是真实容易写错的）：

| 断言 | 为什么重要 |
| :--- | :--- |
| 库里存的是哈希、且查不到明文 | 库泄露 ≠ 验证码泄露 |
| 达到错误次数上限后**即使输对也无法通过** | 只累加计数而不作废记录是常见错误 |
| 5 个并发校验请求**只有 1 个成功** | 原子消费（`updateMany` + `consumedAt: null` 条件）挡住了重放 |
| 发信失败时**删掉刚写的记录** | 否则用户卡在冷却里却什么都没收到，还白占一次配额 |
| 冷却期间**不写库、不发信** | 限流被拒的请求不该留下痕迹 |
| 过期 / 已用 / 次数超限 / 不对 **对外文案完全一致** | 区分开来等于告诉攻击者「这个码确实存在」 |
| `EMAIL_ENABLED=false` 时文案提示**改用密码登录** | 这就是保留密码登录的价值 |

> ### ⚠️⚠️ `db push` 之后必须再跑 `db generate`
>
> `prisma db push` 只同步**数据库结构**，**不会更新生成的客户端**。
> 所以改完 schema 直接跑脚本会报：
>
> ```
> PrismaClientValidationError: Invalid `prisma.user.findMany()` invocation
>   where: { emailVerifiedAt: null }
>   ~~~~~~~~~~~~~~~
> ```
>
> —— 它列出的可用字段里**没有**你刚加的那个。
>
> **正确顺序**（`npm run db:push` 不会自动 generate）：
>
> ```bash
> npm run db:push       # 同步数据库结构
> npm run db:generate   # ⚠️ 重新生成客户端，少这一步必报上面的错
> ```
>
> 这是开发中真实踩到的：三个新脚本一开始全部退出码 1，
> 而报错信息看起来像「字段不存在」，很容易怀疑是 schema 写错了。

```bash
# 服务器上按顺序验证（阶段 1 做完后）
curl -s http://127.0.0.1:3000/api/auth/email-health   # 期望 keyLoaded: true
npm run email:test 你的邮箱@example.com               # 期望真的收到信
npm run email:check                                    # 期望全部通过
```

---

### 7.7 部署到服务器（阶段 9）

**首选项：直接跑 `npm run update`**，它现在已包含全部必需步骤：

```bash
cd ~/lankhub
npm run update
```

它做的事（**已修正**，原先缺了 `db:generate` 与 `db:verify-existing`）：

```
backup.sh → git pull → npm ci → npm rebuild better-sqlite3
  → npm run db:migrate      ← 新增：db push + db generate + verify-existing
  → npm run build           ← 关键：没有这一步新路由不存在
  → pm2 restart next-app --update-env
```

若要手动执行（等价）：

```bash
cd ~/lankhub
npm run backup            # 先备份（含数据库）
git pull
npm run db:migrate        # push + generate + 标记存量账号
npm run build             # ⚠️ 必须，pm2 restart 不会重建
pm2 restart next-app --update-env
```

**部署后的验证清单**（建议逐条执行）：

```bash
# 1. 邮件配置真的被 PM2 进程读到了
curl -s http://127.0.0.1:3000/api/auth/email-health
#    期望："keyLoaded":true，"keyLength":36 左右

# 2. 存量账号已标记为已验证（否则站长自己都登不上）
npm run db:verify-existing -- --dry-run
#    期望：「没有需要处理的账号」

# 3. 真的能发出一封信（消耗 1 封免费额度）
npm run email:test 你的邮箱@example.com

# 4. 浏览器打开站点，走一遍：
#    注册（两步）→ 收码 → 验证 → 登录 → 退出 → 验证码登录 → 忘记密码 → 改密码
```

> ⚠️ **`npm run db:verify-existing` 是本次上线最关键的一步**。
> 它把存量账号标记为「邮箱已验证」。跳过它的话，**包括站长在内的所有老用户
> 都会被「请先完成邮箱验证」挡在门外** —— 而他们根本没收到过验证码，
> 也没有任何入口能完成验证，等于把所有人锁在站点外面。

#### 7.7.1 密钥泄露的历史遗留（已知限制，如实说明）

旧文档 `docs/siteEmailLogin.md` 里写过被吊销 Key 的**前 8 个字符**
（`re_iMa5Cu` + 8 个星号）。该文件已删除，**当前 HEAD 是干净的**，
但它仍存在于两个历史提交中（`0e4df2d`、`e75f63e`）。

- **暴露程度有限**：只有 8 个字符，真实 Key 长 34 位，其余 26 位未知，
  无法还原、无法使用。
- **真正的修复是吊销**：站长已吊销该 Key 并重新生成，泄露的前缀现在一文不值。
- **刻意不重写 git 历史**：重写会改变全部提交哈希、打断任何已克隆的副本，
  代价远大于这点残余风险。这个取舍是明确的，不是遗漏。
- 未来的防线是 `npm run email:check`：它扫描全部 git 跟踪文件里
  有无真实密钥（Resend / OpenAI / Google / 私钥四种形态）。

## 八、邮件模板

**单个验证码邮件模板**，四个场景共用，只改标题与引导语（避免四份 HTML 漂移）。

要求：

- **纯文本 + HTML 双版本**（部分客户端屏蔽 HTML，纯文本是兜底）
- 验证码**视觉突出**（大字号、字间距）
- 明确写出**有效期 10 分钟**
- 明确写「**如果不是你本人操作，请忽略这封邮件**」
- 页脚放**站点名与免责说明**（不写「此邮件由系统自动发送」就够了，别放营销内容）
- 主题按场景区分，便于用户在邮箱里搜索：
  - 注册：`【lankHub】注册验证码`
  - 登录：`【lankHub】登录验证码`
  - 重置：`【lankHub】重置密码验证码`
  - 改密：`【lankHub】修改密码验证码`

**风格与站点一致**：白底、细边框、克制的阴影（与站内水墨风一致，不要花哨渐变）。

**实现位置建议**：`src/lib/email/templates.ts` 导出纯函数
`renderCodeEmail({ scene, code, siteName })` → `{ subject, html, text }`。
**不要把 HTML 写在接口里**，否则四份模板必然漂移。

---

## 九、前端改动

> **本节已按实际实现回填**（阶段 7 完成后）。

| 页面 | 改动 | 新增/修改的文件 |
| :--- | :--- | :--- |
| `/auth/login` | 加**两个标签页**：「密码登录」/「验证码登录」。默认前者（存量用户习惯，且 Resend 出问题时它仍可用） | `LoginForm.tsx` |
| `/auth/register` | 改为**两步**：第一步表单，第二步输码（同一页内切换，不跳页） | `RegisterForm.tsx` |
| `/auth/forgot-password` | **新增**：输邮箱 → 输码 + 新密码 | `ForgotPasswordForm.tsx`、`app/auth/forgot-password/page.tsx` |
| `/settings` | 改密码加验证码；邮箱未验证/邮件不可用时自动退回「仅旧密码」 | `PasswordForm.tsx`、`app/settings/page.tsx` |
| 通用组件 | 验证码输入、发码按钮（四个页面复用） | `CodeInput.tsx`、`SendCodeButton.tsx` |

**交互细节（实现时逐条对照的结果）**：

| # | 要求 | 落实 |
| :-- | :--- | :--- |
| 1 | 发码按钮 60 秒倒计时 | ✅ `SendCodeButton`。**被服务端冷却拒绝时也起倒计时**，否则会出现「服务端说要等 43 秒、按钮却立即可点」的矛盾状态 |
| 2 | `inputMode="numeric"` + `autoComplete="one-time-code"` | ✅ 6 个单格，只有第一格挂 `one-time-code`（挂在每格上会让自动填充行为不确定） |
| 3 | 输满 6 位自动提交 | ✅ 同时保留手动提交按钮 |
| 4 | 错误文案来自服务端 | ✅ 前端只在「提交前」做形状校验（少一次往返），业务错误一律用服务端返回的 `error` |
| 5 | 提交中禁用 + `Loader2` | ✅ 与既有表单一致 |
| 6 | `prefers-reduced-motion` | ✅ 未新增自定义动效，只用了既有的 `ViewTransition` |

**额外做到的几点**：

- **粘贴整串验证码**能一次铺满 6 格（邮箱里复制验证码是最常见的操作路径）
- 退格时当前格为空则**退回上一格**；左右方向键可移动焦点
- 输入框只接受数字（用户可能输入全角数字或混入其它字符）
- 注册第二步会**显示邮箱地址**，便于用户核对自己有没有填错
- 注册第二步提供「返回修改邮箱或昵称」的出口 —— 填错了不必刷新页面重来

> ⚠️ **`useSearchParams` 必须包在 `Suspense` 里**（`LoginForm` 与 `RegisterForm` 都用它读
> `callbackUrl`）。Next.js 官方文档明确：生产构建时，静态页面里的 Client Component
> 调用 `useSearchParams` 而未包 `Suspense`，**构建会直接失败**
> （`Missing Suspense boundary with useSearchParams`）。
> 这两个页面的 `page.tsx` 都已经包了。
> `ForgotPasswordForm` 不用 `useSearchParams`，所以它的页面**不需要** `Suspense`。

**验证方式**：`npm run ui:check` —— 真实启动应用 + 无头 Edge，
检查三个页面能否渲染、有无 console 错误与运行时异常，并跑关键交互（35 项断言）。
`/settings` 三页与改密码双路由 `npm run ui:settings` 覆盖（32 项断言）。

### 9.1 改密码改成两条独立可选的路（站长后来要求）

最初实现的是「旧密码 **+** 验证码」，两者都要。现在拆成两条**独立可选**的路：

| 方式 | 需要 | 不需要 |
| :--- | :--- | :--- |
| 邮箱验证码 | 验证码 | **原密码** |
| 旧密码 | 原密码 | **验证码** |

两条路是**互补**的，所以都留着：

- 验证码那侧防「密码泄露」（别人知道你密码也没用，他收不到验证码）
- 旧密码那侧防「会话被盗」（别人偷了你的 cookie，但他不知道旧密码）

方式二同时也是**唯一的兜底**：邮件服务不可用、或账号邮箱未验证时，
只有它能把密码改掉 —— 没有它，一次 Resend 故障就能让人永远改不了密码。
（与「保留密码登录」是同一个思路。）

实现上两个 Server Action 各自独立、规则清晰，不做「有时可省」的模糊校验：

- `changePasswordWithCodeAction(code, newPassword)` ← schema: `ChangePasswordByCodeSchema`
- `changePasswordAction(oldPassword, newPassword)` ← schema: `ChangePasswordSchema`

界面上是根据客观条件选默认：邮箱未验证或邮件不可用时**默认落在方式二**，
并把方式一的标签置灰 + 说明原因（不能让用户一进来就卡在一条走不通的路上）。

> 原先那个「旧密码 + 验证码」的 `/api/auth/change-password` 接口**已删除** ——
> 界面走 Server Action，留着它只会造成两套规则的混淆。

### 9.2 ⚠️ 发码按钮「有一点歪」——只有量才能定位（已修）

站长反馈「无论是哪里获取验证码的按钮都有一点歪」。**静态看截图完全正常**，
量出来的数据也是全对齐（0px）。真正的原因要靠**造出报错状态**才暴露：

| 状态 | wrapper 高度 | label 中心 − 按钮中心 |
| :--- | :--- | :--- |
| 无提示 | 44px | **0px** ✓ |
| 出现错误提示（冷却/发送失败） | 62px | **9.5px** ✗ 按钮被顶上去 |

**根因**：错误提示占用布局高度 → wrapper 变高 → 外层行（`items-center`）
居中整个 wrapper → 按钮跟着上移。
所以它**只在有提示时才歪**，这解释了为什么「感觉有点歪」却很难指出来。

**我试过但不成功**的两种改法（记下来避免以后重走）：

1. 只把按钮包进固定高度的行 → 还是歪 9.5px（被顶高的是整个 wrapper）
2. 外层行改 `items-start` → 反而歪 -12px（label 与按钮的顶边本来就不在同一水平线）

**最终做法**：按钮与提示一起放进一个**绝对定位容器**
（`absolute right-0 top-0 bottom-0 flex flex-col justify-center`）：

- 容器脱离文档流 → 提示出现与否都不改变行的布局
- 容器撑满行高并居中 → **按钮中心恒等于行中心 → 与左侧 label 永远对齐**
- 提示挂在按钮下方（`absolute top-full`），不占位、也不会压住下面的输入框

需要外层行有 `relative`（四个表单里都已加）。

复现与验证都用 `npm run ui:measure-code`：它靠 mock 服务回 429
**稳定造出报错状态**（不依赖真实冷却 —— 真实冷却按邮箱计、跨轮次残留，
会让测量拿不到元素，实测踩过两次）。

---

## 十、免责声明与脱敏（站长明确要求）

### 10.1 README 增加「第三方服务」条目

✅ **已完成**。在现有 `## 免责声明 / ### 二、第三方服务` 下拆成两小节：

- **2.1 邮件发送服务 Resend** —— 说明邮箱与邮件内容会交给第三方投递、
  邮件只含验证码不含账号信息、验证码以 HMAC 存储且用后即焚、
  未配 Key 时邮件功能整体不可用而**密码登录仍可用**、
  部署者需自行申请账号并遵守 100 封/天与 3000 封/月的配额
- **2.2 在线音乐接口 GD音乐台** —— 原有内容，改为子条目

同时补进了「四、部署与使用风险」，新增两条部署者责任：

- **邮件发送的合规性**（自行申请 Resend、遵守条款与配额）
- **账号数据的保管责任**（库里存有用户邮箱与密码哈希）

### 10.2 站内页面写明

✅ **已完成**：

- `/auth/login`、`/auth/register`、`/auth/forgot-password` 三个表单下方
  都有一行小字：「…验证码由第三方邮件服务 Resend 发送。我们只发送验证码，不会用于其它用途。」
- 页脚「免责声明」链接**仍指向 `/music/disclaimer`**（本期不改）——
  它是音乐专属页面，本期在 README 与登录页小字里说明邮件部分。
  若站长想统一成一个总页面，那是独立改动。

### 10.3 脱敏清单（提交前逐项检查）

| 位置 | 要求 |
| :--- | :--- |
| 本文档 | 只出现 `re_********` 或 `$RESEND_API_KEY`，**不得出现真实前缀** |
| `.env.example` | `RESEND_API_KEY=""` 留空 |
| `.env` | 在 `.gitignore` 中（**已确认**） |
| 代码日志 | Key 只打印前 6 位；验证码只在 `NODE_ENV !== "production"` 时打印 |
| `docs/` 下旧文档 | 原 `siteEmailLogin.md` 被本文档取代，**其中那两处真实前缀一并消失** |
| Git 历史 | ⚠️ **历史里仍有**（已推送）。彻底清除需 `filter-repo` 重写历史，**副作用大**。建议改为**吊销旧 Key**（见 1.4），历史留着不影响安全 |

---

## 十一、实施顺序（每一步都可独立验证，避免"写完全部再调"）

| 阶段 | 内容 | 完成判据 | 状态 |
| :--- | :--- | :--- | :--- |
| **0** | 验证 PM2 是否已有 Key | `pm2 env 0 \| grep -i resend` | ✅ **已做：无输出，证实必须改 `.env`** |
| **1** | 吊销旧 Key、生成新 Key、写入 `.env`、`pm2 restart --update-env` | `/api/auth/email-health` 返回 `keyLoaded: true` | ⏳ 等站长在服务器执行（见下） |
| **2** | 发信模块 + 邮件模板 + 自检接口 + 手动测试脚本 | 服务器上 `npm run email:test 你的邮箱` 真的收到信 | ✅ **代码已完成**，待阶段 1 后实测 |
| **3** | Prisma：`User.emailVerifiedAt` + `EmailCode` 表 + 清理脚本 + 存量标记脚本 | `npm run db:push` 通过；`db:check-limits` 通过 | ✅ **已完成**（35 项验证全过） |
| **4** | `src/lib/email/verify-code.ts`：发码/校验/消费 + 三级限流 + 配额 | 单元级验证：冷却、上限、过期、用后即焚、错误次数全覆盖 | ✅ **已完成**（57 项验证全过） |
| **5** | 接口：`send-code` / `verify-email` / `register`（改造）/ `forgot-password` / `reset-password` / `change-password` | curl 逐个场景走通（含错误分支） | ✅ **已完成**（50 项端到端全过） |
| **6** | Auth.js：新增 `email-code` provider + 密码登录校验邮箱已验证 | 验证码能真正建立会话 | ✅ **已完成**（20 项端到端全过） |
| **7** | 前端：登录页双标签、注册两步、忘记密码页、settings 改密码 | 浏览器手测全流程 | ✅ **已完成**（35 项浏览器检查全过，含交互） |
| **8** | 文档与脱敏：README 免责声明、登录页小字、确认仓库无真实密钥 | `npm run email:check` 通过 | ✅ **已完成**（219 个跟踪文件无真实密钥） |
| **9** | 部署验证 | 线上走一遍四个场景 | ⏳ **等站长部署**（见 7.7） |

> **阶段 0 与 1 不可跳过**。跳过它们的后果是「代码全对、线上 401」。

### 11.1 阶段 2 的产物（已完成，供阶段 1 之后验证）

| 文件 | 作用 |
| :--- | :--- |
| `src/lib/email/sender.ts` | Resend HTTP API 客户端。`fetch` 直调，**不引入 resend SDK** |
| `src/lib/email/templates.ts` | 四场景共用一份邮件模板，同时输出 HTML 与纯文本 |
| `src/app/api/auth/email-health/route.ts` | 只读自检接口，**只回 Key 长度、不回任何字符** |
| `scripts/email-test.mts` | 手动发一封测试邮件（`npm run email:test 你的邮箱`） |
| `scripts/email-check.mts` | **密钥泄露防线**：自检接口行为 + 源码脱敏约定 + 全仓库密钥扫描（`npm run email:check`） |

> ⚠️ **两个写这个项目时踩到的坑，改这几个文件前必看**：
>
> 1. **`scripts/` 下的 `.ts`/`.mts` 会被 `next build` 的类型检查扫到**
>    （tsconfig 的 include 是 `**/*.ts` 与 `**/*.mts`）。
>    所以这类脚本必须**类型干净**（strict 下无类型会让 build 直接失败），
>    并且要能用 ESM 语义（顶层 await 需要 `.mts`）。
> 2. **注释里不要用反引号包裹片段**。实测：注释里写了 `` `**/*.ts` `` 这样的片段后，
>    `next build` 的类型检查阶段会在那**注释行**上报
>    「Expression expected / ';' expected」一连串语法错误，
>    而 `tsc --noEmit` 却**通过**——排查成本极高。
>    模板字符串里用反引号没问题，**只有注释里要避开**。

---

## 十二、测试用例（每条都要真的跑）

### 12.1 发码

| 场景 | 期望 |
| :--- | :--- |
| 正常发码（register） | 200，收到邮件，库里有 `codeHash` 记录 |
| 60 秒内重复发码 | 429，**不消耗 Resend 额度** |
| 同邮箱第 11 封/天 | 429 |
| 同 IP 第 31 封/天 | 429 |
| 全站第 81 封/天 | 429，文案说明是**全站上限** |
| `EMAIL_ENABLED=false` | 503，文案提示用密码登录 |
| `RESEND_API_KEY` 缺失 | **500 但文案明确**「邮件服务未配置」，而不是笼统的「失败」 |
| 已注册邮箱走 `login` 场景 | 200，话术与「未注册」**完全一致** |
| 未注册邮箱走 `login` 场景 | 200，话术一致，**但库里没有新记录**（证明没发信） |

### 12.2 校验

| 场景 | 期望 |
| :--- | :--- |
| 正确验证码 | 通过，记录 `consumedAt` 被写入 |
| 同一码再用一次 | 失败（用后即焚） |
| 过期码（>10 分钟） | 失败，文案与「错误」一致 |
| 连错 5 次 | 该记录作废；**第 6 次即使输对也失败** |
| 大小写/空格混杂的邮箱 | 规范化后匹配成功 |
| 用 `login` 的码去走 `register` 流程 | 失败（scene 隔离） |

### 12.3 业务

| 场景 | 期望 |
| :--- | :--- |
| 注册 → 验证 → 登录 | 全流程通 |
| 注册后**不验证**直接尝试登录 | 拒绝，并提示「请先完成邮箱验证」+ 重发按钮 |
| 用**别人已注册**的邮箱注册 | 409「该邮箱已注册」（见 3.4 的取舍） |
| 用**自己未验证**的邮箱重新注册 | 覆盖旧记录并发新码（不报错、不卡死） |
| 存量账号（跑过 `db:verify-existing`）登录 | 正常，不被未验证拦住 |
| 忘记密码全流程 | 能改密并用新密码登录 |
| 改密码（旧密码 + 验证码） | 成功 |
| 邮件功能关闭时改密码 | 回退到只凭旧密码，并有说明 |
| 清理任务 | 未验证且超 24 小时的账号被删；已验证的**不受影响** |

---

## 十三、风险与已知限制（如实记录，不藏）

| 风险 | 说明 | 缓解 |
| :--- | :--- | :--- |
| **Resend 额度被刷爆** | 免费 100 封/天，攻击者可耗尽 | 三级限流 + 全站配额硬闸（3.6）；额度耗尽时文案明确 |
| **Resend 故障** | 服务不可用则验证码全废 | 保留密码登录（3.1）；`EMAIL_ENABLED` 可快速关闭 |
| **JWT 会话无法吊销** | 改密后其它设备**不会**立刻掉线 | 如实告知（5.4）。要解决需改数据库会话策略，**不在本期** |
| **邮箱枚举** | `register` 场景会暴露邮箱是否已注册 | 有意的取舍（3.4）。`login`/`reset` 仍统一话术 |
| **临时邮箱注册** | 能用一次性邮箱完成验证 | 已知限制（6.1）。验证的目的已达成（防手误/防冒用），不追求留存 |
| **Git 历史里的 Key 前缀** | 已推送，无法轻易移除 | **吊销旧 Key**（1.4）即可，历史留着无实际危害 |
| **验证码明文不可查** | 存哈希导致排查困难 | 开发环境允许打印（3.2）；生产靠自检接口与计数排查 |
| **多实例部署** | 内存限流与配额在 PM2 cluster 下不共享 | 当前是**单实例 PM2**，不构成问题。若将来上 cluster，需把限流也落库。**记录为已知限制** |

---

## 十四、决策记录（一句话版，便于回溯）

| 决策 | 选择 | 一句话理由 |
| :--- | :--- | :--- |
| 验证码 vs 邮件链接 | **验证码** | 手机上点链接登录态会错位 |
| 存明文 vs 哈希 | **HMAC 哈希** | 库泄露不等于验证码泄露；且不必付 bcrypt 的开销 |
| 一张表 vs 四张表 | **一张表 + scene** | 字段完全一致，加场景不改表 |
| 注册时机 | **先建号（未验证）+ 两步** | 否则无法用唯一索引约束邮箱 |
| 邮箱重复 | **明确报 409** | 换取可用体验，不构成劫持（见 3.4） |
| 密码登录 | **保留** | Resend 挂了还能登 |
| 改密码 | **验证码 + 旧密码，可回退** | 邮件挂了不能把人锁死 |
| 邮件发送 | **直接 fetch Resend HTTP API** | 仓库不多一个依赖 |
| 环境变量 | **`.env`** | Next.js 原生支持，且不被 `/etc/profile.d` 的 PM2 冻结问题影响 |
| 改密后吊销会话 | **不做，如实告知** | JWT 会话的固有特性，本期不引入会话黑名单 |

---

## 十五、开工前的验证清单（阶段 0/1，必须逐条打勾）

- [ ] `pm2 env 0 | grep -i resend` —— 确认 PM2 进程是否已有 Key
- [ ] 若没有：把 Key 写进服务器 `.env`，`pm2 restart next-app --update-env`
- [ ] 到 Resend 后台**吊销旧 Key**，生成新 Key（因为前缀已进公开仓库）
- [ ] 确认 `.env` 权限（不要 world-readable）：`chmod 600 .env`
- [ ] 确认 `git status` 里**看不到** `.env`
- [ ] 实现 `/api/auth/email-health` 后，`keyLoaded` 为 `true`
- [ ] 用自检接口触发一封测试邮件，**确实收到**
- [ ] 全仓库 grep 真实 Key 前缀 **无结果**（替换成你自己的前缀去搜）
- [ ] 备份一次数据库：`npm run backup`

---

## 十六、参考

| 资源 | 位置 / 链接 |
| :--- | :--- |
| 本项目 Next.js 环境变量文档（**权威依据**） | `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` |
| 现有登录实现 | `src/lib/auth.ts`、`src/lib/auth-actions.ts` |
| 现有限流实现 | `src/lib/rate-limit.ts` |
| 现有校验 schema | `src/lib/validations.ts` |
| 数据库 Schema | `prisma/schema.prisma` |
| Resend 官方文档 | https://resend.com/docs |
| Resend 发送 API | https://resend.com/docs/api-reference/emails/send-email |
| Resend Dashboard（吊销/新建 Key） | https://resend.com/api-keys |

---

**文档维护人**：lank
**方案确认时间**：2026-10-13
**状态**：⏳ 待站长确认后开工（编码尚未开始）
