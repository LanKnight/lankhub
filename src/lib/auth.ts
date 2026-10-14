import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { CredentialsSignin } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { verifyCode } from "@/lib/email/verify-code"
import {
  rateLimit,
  getClientIp,
  LOGIN_ACCOUNT_MAX,
  LOGIN_IP_MAX,
  LOGIN_WINDOW_MS,
} from "@/lib/rate-limit"

/**
 * 抛一个带自定义 `code` 的登录失败。
 *
 * ⚠️ **必须显式赋值 `.code`，不能通过构造函数传参**。
 * `CredentialsSignin` 的构造函数是 `super(...arguments)`，参数被忽略，
 * 而 `code` 在类里被固定初始化成 `"credentials"`。
 * Auth.js 只读实例属性：`params.set("code", error.code)`（见 @auth/core/index.js）。
 *
 * 先这样写是因为我第一版用了 `new CredentialsSignin("email-not-verified")`，
 * 结果前端收到的 URL 是 `code=credentials` —— 自定义码丢了。
 *
 * `code` 会出现在跳转 URL 上，所以**不能提示敏感信息**（Auth.js 的官方提醒）。
 * 这里用的两个码都是粗粒度状态，不含任何账号细节。
 */
function credentialsError(code: string): CredentialsSignin {
  const err = new CredentialsSignin(code)
  err.code = code
  return err
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // 信任反向代理的 host header（Nginx 等），生产环境必须
  trustHost: true,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        // 统一邮箱格式（trim + 小写），与注册时一致，避免大小写导致登录失败
        const email = String(credentials.email).trim().toLowerCase()

        // 频率限制，两道都要有：
        //  1) 按「邮箱+IP」防针对同一账号的暴力破解
        //  2) 按「IP」防同一来源换不同邮箱撞库 —— 只有第一道的话，换个邮箱就绕过了
        const ip = getClientIp(request.headers)
        const perAccount = rateLimit(
          `login:${email}:${ip}`,
          LOGIN_ACCOUNT_MAX,
          LOGIN_WINDOW_MS
        )
        const perIp = rateLimit(`login-ip:${ip}`, LOGIN_IP_MAX, LOGIN_WINDOW_MS)
        if (!perAccount.allowed || !perIp.allowed) {
          console.log("[auth] login rate limited")
          return null
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email },
          })

          if (!user) {
            console.log("[auth] login failed: user not found")
            return null
          }

          const isValid = await bcrypt.compare(
            credentials.password as string,
            user.password
          )

          if (!isValid) {
            console.log("[auth] login failed: invalid password")
            return null
          }

          /*
           * 邮箱未验证时**拒绝登录**。
           *
           * 这是「防止用别人的邮箱注册」的最后一环：注册时账号虽然被创建，
           * 但只有邮箱主人收得到验证码。未验证就能登录的话，那个未验证账号
           * 仍然可被注册者本人使用，防护就形同虚设。
           *
           * 这里有意的顺序：**先验密码，再查验证状态**。
           * 反过来的话，任何人都能凭一个未验证的邮箱问出
           * 「这个账号有没有验证过」，那是一条信息泄露。
           *
           * 抛 CredentialsSignin 而不是返回 null：登录失败统一返回 null 时，
           * 前端只能显示「邮箱或密码错误」。而「密码对但没验证」需要给用户
           * 一条**可操作**的提示（去收验证码 / 重新发送），必须能区分开。
           */
          if (user.emailVerifiedAt === null) {
            console.log(`[auth] login blocked: email not verified (user #${user.id})`)
            throw credentialsError("email-not-verified")
          }

          return {
            id: String(user.id),
            email: user.email,
            name: user.name,
            role: user.role,
            permissions: user.permissions,
          }
        } catch (err) {
          // ⚠️ 必须把上面那个 CredentialsSignin 原样抛出去。
          // 它 extends Error（不是 Error 的子类判断失败那种情况），
          // 若被这里吞掉，前端就收不到 EmailNotVerified 这个 code 了。
          if (err instanceof CredentialsSignin) throw err
          console.error("[auth] authorize error:", err)
          return null
        }
      },
    }),

    /**
     * 验证码登录用的 provider。
     *
     * ⚠️ **它不应该被任何 HTTP 路由使用**，只由 Server Action `loginByCodeAction`
     * 通过 `signIn("email-code", ...)` 调用。做成公开的「校验通过就登录」接口，
     * 等于开放了一个免密登录入口（拿到一个验证码即可换取会话）。
     *
     * `mode: "code"` 是必需的：Auth.js 的 CredentialsSignin 会带上 `code`
     * 用于告知失败原因，但**两个 provider 用同一个 code 就无法区分**。
     * 传 mode 之后，密码登录的失败 code 会与这里的区分开
     * （见 auth-actions.ts 里的 isEmailNotVerified）。
     */
    Credentials({
      id: "email-code",
      name: "email-code",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Code", type: "text" },
        mode: { label: "Mode", type: "text" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.code) {
          return null
        }

        const email = String(credentials.email).trim().toLowerCase()
        const code = String(credentials.code).trim()

        const ip = getClientIp(request.headers)
        // 与密码登录同一套强度：验证码登录也是登录入口，不能放松
        const perAccount = rateLimit(
          `login-code:${email}:${ip}`,
          LOGIN_ACCOUNT_MAX,
          LOGIN_WINDOW_MS
        )
        const perIp = rateLimit(`login-code-ip:${ip}`, LOGIN_IP_MAX, LOGIN_WINDOW_MS)
        if (!perAccount.allowed || !perIp.allowed) {
          console.log("[auth] code login rate limited")
          return null
        }

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user) {
          console.log("[auth] code login failed: user not found")
          return null
        }

        // 未验证邮箱的账号同样不能登录（与密码登录一致）
        if (user.emailVerifiedAt === null) {
          throw credentialsError("email-not-verified")
        }

        // 校验并消费验证码。失败原因不对外区分（verifyCode 已保证文案一致）
        const result = await verifyCode({ email, scene: "login", code })
        if (!result.ok) {
          console.log(`[auth] code login failed: ${result.reason}`)
          throw credentialsError("invalid-code")
        }

        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          role: user.role,
          permissions: user.permissions,
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.permissions = user.permissions ?? null
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id ?? ""
        session.user.role = token.role ?? "READER"
        session.user.permissions = token.permissions ?? null
      }
      // 权限即时生效：每次会话读取时从数据库刷新角色与权限
      // （站长收回/授予权限后无需等 JWT 过期，立即反映到 session）
      try {
        const userId = token.id ? Number.parseInt(token.id, 10) : Number.NaN
        if (!Number.isFinite(userId)) return session

        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { role: true, permissions: true },
        })

        /*
         * ⚠️ 查不到用户（账号已被删除）时**必须把会话内容清空**。
         *
         * 原来的写法是 `if (dbUser && session.user) {...}` 然后照常返回 session ——
         * 结果是把一个**已经不存在的账号**的旧快照继续当有效会话发出去。
         * 实测：删掉账号后 `/api/auth/session` 仍返回该用户，
         * 需要登录的接口也照常放行。
         *
         * 注意这里**只能清空内容，删不掉 cookie**（JWT 在客户端，服务端无从失效）。
         * 所以还要配合两件事：
         *   1. `getCurrentUser()` 也查库确认存在（见 auth-helpers.ts）——
         *      让服务端各处立刻按「未登录」处理
         *   2. 客户端察觉未登录后调 signOut() 把那个没用的 cookie 清掉
         *      （见 components/auth/SessionGuard.tsx）
         */
        if (!dbUser) {
          /*
           * ⚠️ 这里刻意返回 null，但**类型上不允许**，所以断言一下。
           *
           * Auth.js 给 session 回调标注的返回类型是 `Session | DefaultSession`，
           * 不包含 null。而运行时返回 null 是有效的 —— 它会让
           * `/api/auth/session` 响应 `null`，客户端 `useSession()` 得到
           * `unauthenticated`，那正是我们要的「这个会话已经不作数了」。
           *
           * 断言而不是返回空对象，是因为空对象会被当成「已登录但所有字段为空」，
           * 反而让客户端以为还登着。
           *
           * 说明：真正的强制力在 `getCurrentUser()`（它也查库确认用户存在），
           * 所以即使这里的行为将来变了，服务端各处仍然会按「未登录」处理。
           */
          return null as unknown as typeof session
        }

        if (session.user) {
          session.user.role = dbUser.role
          session.user.permissions = dbUser.permissions
        }
      } catch (err) {
        console.error("[auth] session db refresh error:", err)
      }
      return session
    },
  },
  pages: {
    signIn: "/auth/login",
  },
  secret: process.env.AUTH_SECRET,
})
